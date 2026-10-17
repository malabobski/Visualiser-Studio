# Mac preview: 1.2.9-mac.1

Development preview targeting macOS 14.2+, built separately for Apple Silicon
and Intel. The production Windows version and its release feed stay at 1.2.8.

## Implementation

- Shared Create editor, audio/MIDI styles, automation, projects and offline export.
- Native Mac window buttons, Dock reopen behavior, app menu, Command shortcut
  labels and quit confirmation. Closing the main window hides it without losing
  the current editor; Command+Q requests the existing unsaved-work confirmation.
- CoreAudio Tap system-audio capture through Electron, including the required
  NSAudioCaptureUsageDescription in the packaged app.
- Spotify and Apple Music metadata, cover art, seek/skip/play/pause via macOS
  Automation. Only already-running supported players are queried. Playing
  sessions take priority; a specific player can be selected in Settings.
- System volume via Standard Additions and app volume through the selected
  supported player's scripting interface. Unsupported outputs return an
  unavailable state; no substitute volume target is silently changed.
- Permission guidance and links in Settings → Mac permissions & media.
- Scripts unpacked from ASAR for osascript, bounded/cancellable processes,
  bounded artwork reads and a strict Spotify CDN allowlist.
- Test build identity, project/preferences directory and version separated from
  production. Production updater downloading/installing is disabled in previews.

## Build on a Mac

Install Node 22, check out this branch, then run npm ci, npm run dist:mac:preview,
and node build/verify-mac.cjs. Builds go to dist/mac-preview. The preview has an
ad-hoc signature and is not Apple-notarized. See MAC_TESTING.md for first-launch
steps and the test checklist. Never copy Windows node_modules to a Mac.

npm run dist:mac remains the normal native-architecture Mac packaging command
for future signed builds. It never publishes. Configure Apple Developer signing
and notarization before using that route for a public release.

## Remote build

.github/workflows/mac-preview.yml builds on macos-15 (arm64) and macos-15-intel
(x64). It runs tests, compiles the macOS scripts, builds a DMG and ZIP, and checks
packaged files, signature, FFmpeg CPU architecture and native canvas using the
packaged Electron runtime. Artifacts contain installers and tester notes; no
release or update metadata is published automatically.

## Remaining validation

Real hardware testing is still required for OS permission prompts, both player
integrations, capture, output-device volume, UI transitions and exports. Browser
and other players do not yet have metadata/control providers. System-wide audio
capture is independent of this restriction. Universal packaging, notarized
releases and signed Mac automatic updates follow successful preview testing.

References:
- https://www.electronjs.org/docs/latest/api/desktop-capturer
- https://www.electron.build/v26/docs/mac/
- https://docs.github.com/en/actions/reference/runners/github-hosted-runners
