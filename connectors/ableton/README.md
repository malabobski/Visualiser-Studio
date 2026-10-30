# Visualiser Studio Link - guarded project routing

Project routing supports MIDI tracks containing instruments and clips. The native two-track test succeeded in Live 12.4.3; the next validation step is a saved copy of a real project.

## Setup

1. Fully restart Visualiser Studio and install the updated connector from DAW Link.
2. Restart Live. Select Visualiser_Studio_Link as the Control Surface, with its Input and Output set to None.
3. Open a saved copy of your project and stop playback.
4. Enable Track on your virtual MIDI output in Live, and Sync for clock. Keep Track and Remote off for that port's input to prevent feedback.
5. Connect in DAW Link, select the virtual port, and route one or two unfrozen MIDI tracks with unique names. Play after routing completes.

Helpers use Pre FX, Monitor In and separate output channels. Original instruments, clips, outputs, monitoring and arm states stay unchanged. Repeated setup reuses completed helpers. Up to 16 tracks can be selected per operation, with a distinct MIDI channel per track. Batch capacity is checked before new helpers are created.

## Guards

Every native mutation runs through schedule_message inside component_guard. Track creation and configuration happen in separate callbacks. No manual Undo group spans callbacks. Playback must stay stopped while routes change. Source identity, name and frozen state are rechecked throughout configuration. Helpers containing user material cannot be configured or deleted.

Failures stop configuration and leave new helpers for review. Cleanup only removes recognised empty helpers. Modified or unrecognised helpers are left alone.

Connector version 3 is required by the updated desktop bridge. Old or incomplete configurations retain disposable-Set restrictions. Simulated checks verify guarded callbacks, delayed setup, original-track preservation, command deduplication and cleanup; they do not establish native stability for every project.

Automatic grouping and new-track following are not enabled. Communication uses authenticated local UDP. Visualiser Studio sends no audio or MIDI back into Live. Disabling the Control Surface disconnects without removing helpers.

## Helper solo follows the source

Solo changes on routed source tracks are observed through Live listeners. The connector schedules the matching empty helper's Solo switch without changing source solos or enabling exclusive solo. Unsoloing the source clears only solos the connector added; existing manual helper solos are preserved. Multiple soloed sources can each keep their own helpers active. Listeners are removed when sources disappear or the control surface disconnects. This requires reinstalling the connector and restarting Live. Native confirmation is still needed; simulated checks cover deferred writes, multiple sources, manual solos and changed helpers.

## Channel colours

DAW Link assigns each MIDI channel a separate colour for note trails, heads, the keyboard and recent notes. Channel colours can be edited with the colour wheel under Visual response, and are saved locally. DAW Link uses MIDI-specific renderers: Pitch trails, Note cascade and Chord constellation. All preserve channel colours and respond to note pitch, duration and velocity. Pitch trails uses eased attacks/releases and a short visual melody glide; MIDI timestamps and chord pitches stay unchanged. Manual MIDI and optional audio setup are collapsed in Connections.

## Routing progress

The connector reports progress after scheduled helper configuration steps. DAW Link displays this in a compact progress bar and preserves the completion summary after refreshing tracks. Project snapshots remain cached while routing and while playback is running.
