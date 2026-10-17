# Visualiser Studio — Mac preview 1.2.9-mac.2

Thanks for testing the Mac version! This preview targets macOS 14.2 or newer.

## Pick your download

In **Apple menu → About This Mac**:
- If it says Apple M1, M2, M3, M4 or another Apple chip, use **arm64**.
- If it says Intel, use **x64**.

Open the DMG, drag **Visualiser Studio Mac Preview** to Applications, then launch
it there. Eject the disk image before testing. The ZIP is an alternative copy
of the same app; you do not need to install both.

This early preview has a local test signature, not Apple notarization. macOS
may block the first launch. For a copy you received directly from us, try opening
it once, then **System Settings → Privacy & Security → Open Anyway** and confirm.
Do not turn off Gatekeeper globally. If macOS reports a damaged app or won't offer
Open Anyway, send the exact message and your macOS version rather than disabling
security settings.

## Permissions

- For Live Audio, allow **system audio / screen recording** when requested.
- For Now Playing, allow **Automation** access to Spotify and/or Apple Music.
- Settings has a **Mac permissions & media** section with links to these pages
  and a choice of which player to follow.
- If changing a permission doesn't take effect, quit and reopen the app.

Spotify and Apple Music are the supported media players for this first preview.
Other apps can feed Live Audio, but do not yet supply track information or app
volume controls. Some audio output devices do not expose system volume controls.

## Things to try

1. Open a song in Create, preview it and export a short video. Play that video.
2. Change styles, colours, aspect ratio and frame rate. Attach MIDI, adjust
   timing/octaves, then add automation. Check preview and export match.
3. Save a project, quit and reopen it. Try a filename with spaces or accents.
4. Try Command+N/O/S/T and automation Command+Z/Shift+Z. Type into project names,
   copy/paste text, and check shortcuts leave the right screen's history alone.
5. Play something in Spotify and Apple Music separately. Check title, art,
   progress, play/pause, skip and seek. Switch the Now Playing source in Settings.
6. Switch the volume slider between system and player volume. Confirm it really
   changes the selected output, and try your usual headphones/output device.
7. Start Live Audio. Check silence, quiet music and louder music, then stop and
   restart capture. Try refusing a permission and then allowing it in Settings.
8. Try fullscreen, collapse/expand and move the cover art, hide/recover the player,
   then use and resize the mini-player. Open and dismiss its settings.
9. Close the main window and reopen from the Dock. Use Command+Q with unsaved
   work and check the save prompt. Leave audio playing during these transitions.

The preview stores projects and settings separately from the normal app and does
not download production updates. Install newer preview builds manually.

When reporting a bug, include your Mac model/chip, macOS version, player used,
what you clicked, what you expected, and what actually happened. A screenshot or
short recording helps. If it fails to start, include the crash/error message.

Apple's first-launch guidance:
https://support.apple.com/en-gb/102445

## Changes in this preview

- Settings → Interface size adds saved 75–150% zoom. Try 100% and 125% plus your normal macOS display setting.
- Narrow/short windows keep controls accessible; MIDI import and action buttons keep their intended sizing.
- Mouse-wheel and two-finger scrolling work on sliders, including MIDI/customise/settings sliders.
- The Dock icon has standard optical padding. Compare its size with your other apps.
- Discord checks multiple socket locations and reconnects when Discord opens or restarts. Test both app-launch orders with Rich Presence enabled.
