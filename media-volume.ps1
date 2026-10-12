param([switch]$Probe, [string]$SourceAppId = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Windows Core Audio: endpoint volume for System, session volume for the media app.
# Vtable ordering follows endpointvolume.h, mmdeviceapi.h and audiopolicy.h.
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;

namespace VisualiserVolume {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")] class DeviceEnumerator {}
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevices {
    [PreserveSig] int EnumAudioEndpoints(int flow, uint mask, out IDeviceCollection devices);
    [PreserveSig] int GetDefaultAudioEndpoint(int flow, int role, out IDevice device);
  }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC5392387B5E"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDeviceCollection {
    [PreserveSig] int GetCount(out uint count);
    [PreserveSig] int Item(uint index, out IDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IDevice {
    [PreserveSig] int Activate(ref Guid id, int context, IntPtr activation, [MarshalAs(UnmanagedType.IUnknown)] out object instance);
  }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface IEndpointVolume {
    [PreserveSig] int RegisterControlChangeNotify(IntPtr callback);
    [PreserveSig] int UnregisterControlChangeNotify(IntPtr callback);
    [PreserveSig] int GetChannelCount(out uint count);
    [PreserveSig] int SetMasterVolumeLevel(float value, ref Guid context);
    [PreserveSig] int SetMasterVolumeLevelScalar(float value, ref Guid context);
    [PreserveSig] int GetMasterVolumeLevel(out float value);
    [PreserveSig] int GetMasterVolumeLevelScalar(out float value);
    [PreserveSig] int SetChannelVolumeLevel(uint channel, float value, ref Guid context);
    [PreserveSig] int SetChannelVolumeLevelScalar(uint channel, float value, ref Guid context);
    [PreserveSig] int GetChannelVolumeLevel(uint channel, out float value);
    [PreserveSig] int GetChannelVolumeLevelScalar(uint channel, out float value);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  [ComImport, Guid("77AA99A0-1BD6-484F-8BC7-2C654C9A9B6F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessions {
    [PreserveSig] int GetAudioSessionControl(ref Guid session, uint flags, out IntPtr control);
    [PreserveSig] int GetSimpleAudioVolume(ref Guid session, uint flags, out IntPtr volume);
    [PreserveSig] int GetSessionEnumerator(out ISessionEnumerator sessions);
  }
  [ComImport, Guid("E2F5BB11-0570-40CA-ACDD-3AA01277DEE8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessionEnumerator {
    [PreserveSig] int GetCount(out int count);
    [PreserveSig] int GetSession(int index, out ISession session);
  }
  [ComImport, Guid("BFB7FF88-7239-4FC9-8FA2-07C950BE9C6D"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISession {
    [PreserveSig] int GetState(out int state);
    [PreserveSig] int GetDisplayName([MarshalAs(UnmanagedType.LPWStr)] out string name);
    [PreserveSig] int SetDisplayName([MarshalAs(UnmanagedType.LPWStr)] string name, ref Guid context);
    [PreserveSig] int GetIconPath([MarshalAs(UnmanagedType.LPWStr)] out string path);
    [PreserveSig] int SetIconPath([MarshalAs(UnmanagedType.LPWStr)] string path, ref Guid context);
    [PreserveSig] int GetGroupingParam(out Guid group);
    [PreserveSig] int SetGroupingParam(ref Guid group, ref Guid context);
    [PreserveSig] int RegisterAudioSessionNotification(IntPtr callback);
    [PreserveSig] int UnregisterAudioSessionNotification(IntPtr callback);
    [PreserveSig] int GetSessionIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string identifier);
    [PreserveSig] int GetSessionInstanceIdentifier([MarshalAs(UnmanagedType.LPWStr)] out string identifier);
    [PreserveSig] int GetProcessId(out uint process);
    [PreserveSig] int IsSystemSoundsSession();
  }
  [ComImport, Guid("87CE5498-68D6-44E5-9215-6DA47EF883D8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)] interface ISessionVolume {
    [PreserveSig] int SetMasterVolume(float value, ref Guid context);
    [PreserveSig] int GetMasterVolume(out float value);
    [PreserveSig] int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, ref Guid context);
    [PreserveSig] int GetMute([MarshalAs(UnmanagedType.Bool)] out bool mute);
  }
  public class Result {
    public bool available; public double value; public bool muted; public string reason; public int sessions;
    public static Result Missing(string message) { return new Result { reason = message }; }
  }
  public static class Audio {
    [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint access, bool inherit, uint process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern bool QueryFullProcessImageName(IntPtr handle, uint flags, StringBuilder name, ref uint size);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode)] static extern int GetApplicationUserModelId(IntPtr handle, ref uint length, StringBuilder id);
    static void Check(int hr) { Marshal.ThrowExceptionForHR(hr); }
    static void Release(object value) { if(value != null && Marshal.IsComObject(value)) Marshal.ReleaseComObject(value); }

    // Exact packaged AUMIDs first; desktop and browser AUMIDs use executable identities.
    // Display names and track titles are never used to choose a process.
    public static bool Matches(string source, string executable, string applicationId) {
      if(String.IsNullOrWhiteSpace(source)) return false;
      if(!String.IsNullOrEmpty(applicationId) && String.Equals(source, applicationId, StringComparison.OrdinalIgnoreCase)) return true;
      string name = Path.GetFileNameWithoutExtension(executable ?? "").ToLowerInvariant();
      string id = source.ToLowerInvariant();
      if(name.Length == 0) return false;
      if(String.Equals(Path.GetFileNameWithoutExtension(source), name, StringComparison.OrdinalIgnoreCase)) return true;
      string[] known = { "spotify", "chrome", "msedge", "firefox", "brave", "vlc", "musicbee", "foobar2000", "applemusic" };
      foreach(string app in known) if(name == app && Regex.IsMatch(id, @"(^|[\\/!._ -])" + Regex.Escape(app) + @"($|[\\/!._ -])")) return true;
      return false;
    }
    static bool MatchesProcess(uint process, string source) {
      IntPtr handle = OpenProcess(0x1000, false, process);
      if(handle == IntPtr.Zero) return false;
      try {
        uint size = 32768; var path = new StringBuilder((int)size);
        if(!QueryFullProcessImageName(handle, 0, path, ref size)) return false;
        uint length = 0; string id = null;
        if(GetApplicationUserModelId(handle, ref length, null) == 122 && length > 0 && length < 4096) {
          var app = new StringBuilder((int)length); if(GetApplicationUserModelId(handle, ref length, app) == 0) id = app.ToString();
        }
        return Matches(source, path.ToString(), id);
      } finally { CloseHandle(handle); }
    }
    public static Result Execute(string target, string source, bool write, double percent) {
      if(target != "system" && target != "app") return Result.Missing("Choose a volume target.");
      if(write && (Double.IsNaN(percent) || Double.IsInfinity(percent) || percent < 0 || percent > 100)) return Result.Missing("Invalid volume.");
      if(target == "app" && String.IsNullOrEmpty(source)) return Result.Missing("Play something in a media app first.");
      var devices = (IDevices)new DeviceEnumerator();
      try { return target == "system" ? SystemVolume(devices, write, percent) : AppVolume(devices, source, write, percent); }
      finally { Release(devices); }
    }
    static Result SystemVolume(IDevices devices, bool write, double percent) {
      IDevice device = null; object instance = null;
      try {
        Check(devices.GetDefaultAudioEndpoint(0, 1, out device));
        Guid iid = typeof(IEndpointVolume).GUID, context = Guid.Empty;
        Check(device.Activate(ref iid, 23, IntPtr.Zero, out instance));
        var volume = (IEndpointVolume)instance;
        if(write) { Check(volume.SetMasterVolumeLevelScalar((float)(percent / 100), ref context)); if(percent > 0) Check(volume.SetMute(false, ref context)); }
        float level; bool mute; Check(volume.GetMasterVolumeLevelScalar(out level)); Check(volume.GetMute(out mute));
        return new Result { available = true, value = Math.Round(level * 100, 1), muted = mute };
      } finally { Release(instance); Release(device); }
    }
    static Result AppVolume(IDevices devices, string source, bool write, double percent) {
      IDeviceCollection collection = null; int matched = 0; double total = 0; bool allMuted = true;
      var identity = new Dictionary<uint, bool>();
      try {
        Check(devices.EnumAudioEndpoints(0, 1, out collection)); uint count; Check(collection.GetCount(out count));
        for(uint d = 0; d < count; d++) {
          IDevice device = null; object instance = null; ISessionEnumerator sessions = null;
          try {
            Check(collection.Item(d, out device)); Guid iid = typeof(ISessions).GUID;
            Check(device.Activate(ref iid, 23, IntPtr.Zero, out instance));
            Check(((ISessions)instance).GetSessionEnumerator(out sessions)); int sessionCount; Check(sessions.GetCount(out sessionCount));
            for(int i = 0; i < sessionCount; i++) {
              ISession session = null;
              try {
                Check(sessions.GetSession(i, out session)); int state; uint process;
                Check(session.GetState(out state)); if(state == 2 || session.IsSystemSoundsSession() == 0) continue;
                Check(session.GetProcessId(out process)); if(process == 0) continue;
                bool matches; if(!identity.TryGetValue(process, out matches)) { matches = MatchesProcess(process, source); identity[process] = matches; }
                if(!matches) continue;
                var volume = (ISessionVolume)session; Guid context = Guid.Empty;
                if(write) { Check(volume.SetMasterVolume((float)(percent / 100), ref context)); if(percent > 0) Check(volume.SetMute(false, ref context)); }
                float level; bool mute; Check(volume.GetMasterVolume(out level)); Check(volume.GetMute(out mute));
                matched++; total += level * 100; allMuted &= mute;
              } catch(COMException) { /* A session can end between enumeration and reading. */ }
              finally { Release(session); }
            }
          } catch(COMException) { /* An output device can disappear while being queried. */ }
          finally { Release(sessions); Release(instance); Release(device); }
        }
      } finally { Release(collection); }
      return matched == 0 ? Result.Missing("This media app has no available volume control.") : new Result { available = true, value = Math.Round(total / matched, 1), muted = allMuted, sessions = matched };
    }
  }
}
'@

if ($Probe) {
  $target = if ($SourceAppId) { 'app' } else { 'system' }
  [VisualiserVolume.Audio]::Execute($target, $SourceAppId, $false, 0) | ConvertTo-Json -Compress
  exit
}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  $request = $null
  try {
    $request = $line | ConvertFrom-Json
    if ($request.operation -notin @('get', 'set')) { throw 'Invalid operation' }
    $result = [VisualiserVolume.Audio]::Execute([string]$request.target, [string]$request.sourceAppId, ($request.operation -eq 'set'), [double]$request.value)
  } catch {
    $result = @{ available = $false; reason = 'Volume control is unavailable. Try again.' }
  }
  @{ id = $request.id; result = $result } | ConvertTo-Json -Compress -Depth 4 | ForEach-Object { [Console]::Out.WriteLine($_) }
  [Console]::Out.Flush()
}
