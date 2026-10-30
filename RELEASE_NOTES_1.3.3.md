# Visualiser Studio 1.3.3

Your session, in colour.

## Meet DAW Link

- A dedicated workspace for visualising the MIDI notes you play in your DAW.
- One-time Ableton connector setup, with routing for up to **16 MIDI tracks** in one operation. Separate helper tracks keep your instruments and original routing intact.
- Helper tracks follow their source track's Solo switch automatically.
- A compact progress bar and completion summary show how your tracks are connecting.

## See what you play

- Three MIDI-specific looks: **Pitch trails**, **Note cascade** and **Chord constellation**.
- Smoother note attacks, releases and melody transitions, with separate colours for each MIDI channel.
- Customise channel colours with the colour wheel and keep them for your next session.
- A live **chord identifier** recognises common chords, extensions and inversions. Choose all channels or one channel; unrecognised combinations show note names.
- Ableton's reported tempo appears beside the MIDI clock BPM. Chord changes stay in their own fixed-width space.

## A cleaner workspace

- Tidier connection controls, with optional setup and diagnostics tucked away.
- Choose **DAW Link** or **Community** as your startup screen.
- Shortcuts now follow the sidebar: **Alt+5** for DAW Link, **Alt+6** for Community and **Alt+7** for Miniplayer. Alt+1-4 stay unchanged.
- Discord Rich Presence retries failed updates and reconnects when a request stalls.

## Getting connected

Install the Ableton connector from **DAW Link > One-time connector setup**, restart Live and select **Visualiser_Studio_Link** as a Control Surface. A virtual MIDI port is required (for example, loopMIDI on Windows or IAC on Mac). Stop playback before creating or removing helper tracks. MIDI input can also be connected manually.

The Ableton connector has been tested interactively with Live 12 on Windows. Other setups, including Mac DAW routing, may need additional testing. Automatic grouping and following newly added tracks are not included yet.

## Downloads

- **Windows:** `Visualiser-Studio-Setup-1.3.3.exe`
- **Mac - Apple Silicon:** `Visualiser-Studio-1.3.3-mac-arm64.dmg`
- **Mac - Intel:** `Visualiser-Studio-1.3.3-mac-x64.dmg`
- ZIP versions are also available for Mac.

Windows automatic updates use the Windows installer only. Mac updates remain manual, with separate Apple Silicon and Intel downloads. Mac requires macOS 14.2 or newer. Mac builds are ad-hoc signed and are not Apple-notarized; first launch may require **System Settings > Privacy & Security > Open Anyway**.
