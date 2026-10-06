param([ValidateSet('', 'toggle', 'previous', 'next', 'seek')][string]$Action = '', [double]$Position = 0)
# Polls Windows' SMTC (System Media Transport Controls) — the same registry
# every media app (Spotify, browsers, VLC) publishes title/artist/artwork
# into for the volume flyout — and prints one line of JSON to stdout each
# time the current track changes. main.js spawns this and reads stdout.
#
# Deliberately polling rather than subscribing to WinRT events: event
# subscriptions need a running message pump (WinForms/WPF dispatcher) to
# actually fire in plain PowerShell, which is more moving parts than a
# 1-second poll buys us here.
#
# Three things worth knowing if this ever goes quiet (or noisy) again:
#
# 1. Output goes through [Console]::Out directly, not Write-Output. When
#    powershell.exe is spawned as a child process (no real console attached,
#    exactly what Node's spawn() does), its default host still applies
#    console-formatting behaviour to Write-Output — including wrapping long
#    lines at a default buffer width. A payload with album art is a single
#    JSON line that can be several thousand characters (base64), so it was
#    getting wrapped mid-string and arriving as broken JSON. Writing via
#    [Console]::Out bypasses that formatting pipeline entirely.
#
# 2. Await() below deliberately goes through AsTask() rather than touching
#    a WinRT IAsyncOperation's .Completed property directly — the object
#    RequestAsync()/etc. return is a raw COM object, and PowerShell's normal
#    property/member resolution can't see WinRT-interface members like
#    .Completed on it directly. AsTask() converts it to a proper managed
#    Task first, which sidesteps that entirely.
#
# 3. Reading the thumbnail goes through AsStreamForRead(), not
#    [Windows.Storage.Streams.DataReader]::CreateDataReader(...). That
#    static factory method is a real WinRT API, but PowerShell's type
#    resolution can't reliably find it ("does not contain a method named
#    'CreateDataReader'") even though the DataReader *type* loads fine.
#    AsStreamForRead() is a plain managed extension method defined on
#    [System.IO.WindowsRuntimeStreamExtensions] (part of the same
#    System.Runtime.WindowsRuntime assembly already loaded below — the
#    *assembly* name and the *type's namespace* aren't the same thing,
#    worth remembering next time this throws "Unable to find type"). It
#    also has more than one overload, and neither PowerShell's normal
#    method dispatch nor a direct [Windows.Storage.Streams.IInputStream]
#    cast can get a raw WinRT COM object there — the cast syntax tries a
#    plain .NET type conversion, which doesn't know how to QueryInterface
#    a COM object the way a real WinRT projection would. The call below
#    uses reflection instead: GetMethod with an explicit parameter type
#    picks the right overload, and MethodInfo.Invoke hands the object to
#    the CLR's own COM interop binder, which does know how to adapt it —
#    same trick Await() already uses above for async WinRT calls.

$ErrorActionPreference = 'Stop'

try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Write-Line([string]$text) {
    [Console]::Out.WriteLine($text)
    [Console]::Out.Flush()
}

function Write-Diag([string]$text) {
    [Console]::Error.WriteLine("[now-playing.ps1] $text")
    [Console]::Error.Flush()
}

Write-Diag 'booting'

Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

# AsTask()+Wait(timeout) rather than blocking forever (-1) — a stuck WinRT
# call throws (visibly, via the catch block below) instead of hanging the
# whole script with zero output.
function Await($WinRtTask, $ResultType, [int]$TimeoutMs = 15000) {
    $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
    $netTask = $asTask.Invoke($null, @($WinRtTask))
    if (-not $netTask.Wait($TimeoutMs)) {
        throw "WinRT call timed out after ${TimeoutMs}ms"
    }
    $netTask.Result
}

Write-Diag 'loading WinRT types'
[Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime] | Out-Null
Write-Diag 'WinRT types loaded'

$managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]
Write-Diag 'requesting session manager'
$manager = Await ($managerType::RequestAsync()) $managerType
Write-Diag 'got session manager — entering poll loop'

if ($Action) {
    try {
        $session = $manager.GetCurrentSession()
        if ($null -eq $session) { Write-Line 'false'; exit }
        $operation = switch ($Action) {
            'toggle' { $session.TryTogglePlayPauseAsync() }
            'previous' { $session.TrySkipPreviousAsync() }
            'next' { $session.TrySkipNextAsync() }
            'seek' { $session.TryChangePlaybackPositionAsync([long]($Position * 10000000)) }
        }
        $result = Await $operation ([bool])
        Write-Line ($result.ToString().ToLowerInvariant())
    } catch { Write-Diag "control error: $_"; Write-Line 'false' }
    exit
}
$sourceNames = @{}
try { Get-StartApps | ForEach-Object { $sourceNames[$_.AppID] = $_.Name } } catch { }
$lastKey = $null
$artwork = ''
while ($true) {
    try {
        $session = $manager.GetCurrentSession()
        if ($null -eq $session) {
            if ($lastKey -ne 'none') {
                Write-Line '{}'
                $lastKey = 'none'
            }
        } else {
            $propsType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties]
            $props = Await ($session.TryGetMediaPropertiesAsync()) $propsType
            $key = "$($session.SourceAppUserModelId)|$($props.Title)|$($props.Artist)"
            if ($key -ne $lastKey) {
                $artwork = ''
                if ($props.Thumbnail) {
                    $streamType = [Windows.Storage.Streams.IRandomAccessStreamWithContentType]
                    $winrtStream = Await ($props.Thumbnail.OpenReadAsync()) $streamType
                    # AsStreamForRead has more than one overload (IInputStream, and a
                    # second IRandomAccessStream+bufferSize version), and a direct
                    # [Windows.Storage.Streams.IInputStream]$winrtStream cast doesn't
                    # work either — Windows PowerShell 5.1 tries a plain .NET type
                    # conversion for that syntax, which doesn't know how to QueryInterface
                    # a WinRT COM object the way real WinRT projections do. Reflection
                    # sidesteps both problems at once: GetMethod with an explicit
                    # parameter type picks the exact overload, and MethodInfo.Invoke
                    # passes the raw COM object straight through to the CLR's own COM
                    # interop binder, which *does* know how to hand it to a method
                    # expecting IInputStream.
                    $asStreamForRead = [System.IO.WindowsRuntimeStreamExtensions].GetMethod('AsStreamForRead', [Type[]]@([Windows.Storage.Streams.IInputStream]))
                    $netStream = $asStreamForRead.Invoke($null, @($winrtStream))
                    $memoryStream = New-Object System.IO.MemoryStream
                    $netStream.CopyTo($memoryStream)
                    $artwork = 'data:image/png;base64,' + [Convert]::ToBase64String($memoryStream.ToArray())
                }
                $lastKey = $key
            }
            $sourceName = $sourceNames[$session.SourceAppUserModelId]
            # Browser sessions identify the browser rather than always exposing
            # a website. Only use a window's site name when its title also
            # contains this session's track title.
            if ($session.SourceAppUserModelId -match '(?i)chrome|msedge|firefox|brave' -and $props.Title) {
                try {
                    $browserWindows = Get-Process -Name chrome,msedge,firefox,brave -ErrorAction SilentlyContinue
                    foreach ($browserWindow in $browserWindows) {
                        $windowTitle = $browserWindow.MainWindowTitle
                        if ($windowTitle -and $windowTitle.IndexOf($props.Title, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
                            if ($windowTitle -match '(?i) - YouTube(?: -|$)') { $sourceName = 'YouTube'; break }
                            if ($windowTitle -match '(?i)SoundCloud(?: -|$)') { $sourceName = 'SoundCloud'; break }
                        }
                    }
                } catch { }
            }
            $timeline = $session.GetTimelineProperties()
            $playback = $session.GetPlaybackInfo()
            $controls = $playback.Controls
            $positionSeconds = $timeline.Position.TotalSeconds
            if ($playback.PlaybackStatus.ToString() -eq 'Playing' -and $timeline.EndTime.TotalSeconds -gt 0) {
                $elapsed = [Math]::Max(0, ([DateTimeOffset]::Now - $timeline.LastUpdatedTime).TotalSeconds)
                $positionSeconds = [Math]::Min($timeline.EndTime.TotalSeconds, $positionSeconds + $elapsed)
            }
            $payload = @{
                title = $props.Title; artist = $props.Artist; artwork = $artwork
                sourceAppId = $session.SourceAppUserModelId
                sourceName = $sourceNames[$session.SourceAppUserModelId]
                albumTitle = $props.AlbumTitle
                subtitle = $props.Subtitle
                playbackStatus = $playback.PlaybackStatus.ToString()
                position = $positionSeconds
                start = $timeline.StartTime.TotalSeconds
                end = $timeline.EndTime.TotalSeconds
                canSeek = $controls.IsPlaybackPositionEnabled
                canToggle = $controls.IsPlayPauseToggleEnabled
                canPrevious = $controls.IsPreviousEnabled
                canNext = $controls.IsNextEnabled
            } | ConvertTo-Json -Compress
            Write-Line $payload
        }
    } catch {
        # A session can vanish mid-read (app closed, track skipped), or a
        # single WinRT call can time out — treat it as "nothing playing" for
        # this tick rather than crashing the loop, but say so on stderr.
        Write-Diag "tick error: $_"
        if ($lastKey -ne 'none') {
            Write-Line '{}'
            $lastKey = 'none'
        }
    }
    Start-Sleep -Milliseconds 1000
}
