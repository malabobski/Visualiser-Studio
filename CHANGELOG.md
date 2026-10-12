# Changelog

## 1.2.5

### Create your own visuals

- Attach MIDI to your soundtrack and line it up against the audio waveform with visual timing controls.
- Adjust each MIDI track's timing, octave, colour and visibility independently.
- Choose animated MIDI styles, including perspective 3D effects, with bounce, glow and trails. Layer them around your audio visualiser or use MIDI visuals on their own.
- Try the advanced Note Trails, Shatterfield and Bass Surf audio styles, with movement controls, sound-response settings and custom gradient palettes.
- Animate visual parameters in a dedicated editor, with separate tracks, a waveform, playhead snapping, deeper zoom and local undo/redo. Attached MIDI also supports tempo automation.

### Save and pick up where you left off

- Save projects containing your audio reference, attached MIDI, styles, colours, parameters and automation.
- Browse saved projects and recent files, rename projects, change thumbnails and see when they were created.
- Use Ctrl+S to save a project, Ctrl+O to open projects, Ctrl+N for a new project and Ctrl+T to save a template.
- Get a chance to save unsaved work when starting a new project, plus confirmation before exiting.

### A calmer, clearer interface

- Keep the stage visible beside Live Audio customisation and MIDI attachment controls.
- More consistent menu animations, clearer settings groups, better spacing and stable scrolling widths.
- Improved colour editing, aspect-ratio framing, startup options and mini-player taskbar branding.
- First-time tutorial, a Restart Tutorial setting and a few secrets to discover.
- Discord Rich Presence controls and a link back to the GitHub repository.

### Playback and updates

- Control system volume or the captured app's volume from the mini-player and Live Audio fullscreen overlay.
- Automatic update checks and downloads, with progress in Settings and a restart prompt when an update is ready.
- Restarting for an update checks for unsaved work and waits while recording or exporting.

### Installing and testing

Download **Visualiser-Studio-Setup-1.2.5.exe** and run it to install this version. Earlier versions need this first installation manually; v1.2.5 includes the updater for future releases.

The blockmap and latest.yml assets are used by the updater; you only need the installer. Test a future update with a newer published version than 1.2.5.


## 1.2.0

- Added Live Audio capture, album-art colour transitions, fullscreen media controls, and a draggable player.
- Added live recording with quality and frame-rate settings, pause/resume, review, and a default save folder.
- Added an always-on-top mini-player with corner resizing, portrait layout, opacity controls, and media transport.
- Added Windows media detection, timeline seeking, and previous/next track controls.
- Added animated cover-art viewing with wheel zoom.
- Added quick actions, undo/redo for visual edits, draft recovery, image saving, preview seeking, speed, and looping.
- Added template search and sorting, remembered preferences, and keyboard shortcuts.
- Reworked the sidebar, custom window bar, dropdown styling, modal backdrops, and hover hints.
- Expanded Discord Rich Presence for listening, editing, recording, and exporting.
- Improved live recording frame scheduling and audio encoding settings.
- Fixed the export download-token flow.

### Validation

- JavaScript syntax checks.
- Local release smoke test covering asset serving, short audio rendering, and WebM download.
- Windows x64 NSIS packaging.

Live loopback, Discord integration, and desktop interactions depend on the local Windows environment and still require manual testing.
