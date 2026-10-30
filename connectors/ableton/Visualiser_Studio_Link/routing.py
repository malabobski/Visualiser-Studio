"""Live routing operations, kept separate so they can be tested without Live."""
import hashlib
import json
import re
import uuid

PREFIX = "[Visualiser Studio Link] "


def label(route):
    if isinstance(route, dict):
        return str(route.get("display_name", ""))
    return str(getattr(route, "display_name", ""))


def available(track, property_name):
    value = getattr(track, property_name)
    if isinstance(value, dict):
        value = value.get(property_name, [])
    return tuple(value)


def choose(track, property_name, name):
    matches = [route for route in available(track, property_name) if label(route) == name]
    if len(matches) != 1:
        raise RuntimeError("Cannot find an unambiguous '%s' route. Check Live's MIDI output settings and track names." % name)
    return matches[0]


def channel_number(value):
    match = re.fullmatch(r"(?:Ch\.?\s*|Channel\s*)?([0-9]{1,2})", label(value), re.IGNORECASE)
    return int(match.group(1)) if match else None


def choose_channel(track, number):
    matches = [value for value in available(track, "available_output_routing_channels") if channel_number(value) == number]
    if len(matches) != 1:
        raise RuntimeError("MIDI channel %s is unavailable on this output." % number)
    return matches[0]


def empty_helper(track):
    if not str(track.name).startswith(PREFIX) or not getattr(track, "has_midi_output", False):
        return False
    if tuple(track.devices):
        return False
    if any(slot.has_clip for slot in track.clip_slots):
        return False
    # An unavailable API is not proof that a track contains no user material.
    try:
        return not tuple(track.arrangement_clips)
    except (AttributeError, RuntimeError):
        return False


class SoloFollow:
    """Listen for source solo changes; only write recognised helper solo states."""
    def __init__(self, routing, schedule, guard, log):
        self.routing, self.schedule, self.guard, self.log = routing, schedule, guard, log
        self.pairs, self.listeners, self.owned = [], [], []
        self.pending = False
        self.closed = False

    def refresh(self):
        sources = self.routing.sources()
        self.pairs = [(source, helper) for helper in self.routing.helpers()
                      for source, _key in sources if label(helper.input_routing_type) == str(source.name)]
        wanted = [source for source, _helper in self.pairs]
        for source in self.listeners[:]:
            if source not in wanted:
                try:
                    source.remove_solo_listener(self.queue)
                except (RuntimeError, AttributeError):
                    pass
                self.listeners.remove(source)
        for source in wanted:
            if source not in self.listeners:
                source.add_solo_listener(self.queue)
                self.listeners.append(source)
        self.queue()

    def queue(self):
        if not self.closed and not self.pending:
            self.pending = True
            self.schedule(1, self._sync)

    def _sync(self):
        self.pending = False
        if self.closed:
            return
        try:
            with self.guard():
                current = tuple(self.routing.song.tracks)
                desired = []
                for source, helper in self.pairs:
                    if source in current and helper in current and empty_helper(helper) and label(helper.input_routing_type) == str(source.name):
                        if bool(source.solo):
                            desired.append(helper)
                for helper in self.owned[:]:
                    if helper not in desired:
                        if helper in current and empty_helper(helper) and helper.solo:
                            helper.solo = False
                        self.owned.remove(helper)
                for helper in desired:
                    if not helper.solo:
                        helper.solo = True
                        if helper not in self.owned:
                            self.owned.append(helper)
        except (RuntimeError, AttributeError) as error:
            self.log("Helper solo follow: %s" % error)

    def disconnect(self):
        self.closed = True
        for source in self.listeners:
            try:
                source.remove_solo_listener(self.queue)
            except (RuntimeError, AttributeError):
                pass
        self.listeners = []
        self.pairs = []


class Routing:
    def __init__(self, song, test_mode=True):
        self.song = song
        self.test_mode = test_mode
        self.registry = []
        self.owned = []
        self.progress = 0.0

    def sources(self):
        tracks = tuple(self.song.tracks)
        self.registry = [(track, key) for track, key in self.registry if track in tracks]
        result = []
        for track in tracks:
            if not getattr(track, "has_midi_input", False) or getattr(track, "is_foldable", False):
                continue
            if str(track.name).startswith(PREFIX):
                continue
            key = next((key for old, key in self.registry if old == track), None)
            if key is None:
                key = uuid.uuid4().hex
                self.registry.append((track, key))
            result.append((track, key))
        return result

    def helpers(self):
        """Recover only recognisable, empty relay tracks after reopening a Set."""
        result = []
        names = [str(track.name) for track, _key in self.sources()]
        for track in tuple(self.song.tracks):
            if not empty_helper(track):
                continue
            parts = str(track.name)[len(PREFIX):].rsplit(" → ", 1)
            if len(parts) != 2:
                continue
            source, output = parts
            channel_match = re.fullmatch(r"(.*) \[ch ([0-9]{1,2})\]", output)
            if channel_match is None:
                continue
            output, expected_channel = channel_match.group(1), int(channel_match.group(2))
            if names.count(source) != 1:
                continue
            if label(track.input_routing_type) != source:
                continue
            if label(track.input_routing_channel) != "Pre FX" or track.current_monitoring_state != 0:
                continue
            if label(track.output_routing_type) != output or channel_number(track.output_routing_channel) != expected_channel:
                continue
            result.append(track)
        return result

    def snapshot(self):
        rows = [{"id": key, "name": str(track.name)[:120], "frozen": bool(getattr(track, "is_frozen", False))}
                for track, key in self.sources()]
        revision = hashlib.sha256(json.dumps(rows, sort_keys=True).encode("utf-8")).hexdigest()[:20]
        return {"tracks": rows[:128], "revision": revision, "helpers": len(self.helpers())}

    def _delete(self, track):
        tracks = tuple(self.song.tracks)
        if track in tracks:
            self.song.delete_track(tracks.index(track))

    def test_safety(self):
        if bool(getattr(self.song, "is_playing", False)):
            return False, "Stop Live playback before the connector test."
        sources = [track for track, _key in self.sources()]
        if len(sources) != 2:
            return False, "The test Set needs exactly two MIDI tracks, named VS Test 1 and VS Test 2."
        if {str(track.name).strip().casefold() for track in sources} != {"vs test 1", "vs test 2"}:
            return False, "Rename the two empty MIDI tracks VS Test 1 and VS Test 2. Capitalisation does not matter."
        for track in sources:
            if tuple(track.devices) or any(slot.has_clip for slot in track.clip_slots) or tuple(track.arrangement_clips):
                return False, "The test tracks must be empty: no instruments, effects or clips."
            if getattr(track, "is_frozen", False) or getattr(track, "arm", False):
                return False, "Unfreeze and unarm both empty test tracks."
        managed = self.managed_helpers()
        for track in tuple(self.song.tracks):
            if track not in sources and track not in managed:
                return False, "The test Set must contain only the two empty test tracks and connector helpers."
        return True, "Disposable test Set ready. Working projects remain protected."

    def managed_helpers(self):
        current = tuple(self.song.tracks)
        self.owned = [track for track in self.owned if track in current]
        result = self.helpers()
        for track in self.owned:
            if empty_helper(track) and track not in result:
                result.append(track)
        return result

    def assert_test_safe(self):
        safe, reason = self.safety()
        if not safe:
            raise RuntimeError(reason)

    def safety(self):
        if self.test_mode:
            return self.test_safety()
        if bool(getattr(self.song, "is_playing", False)):
            return False, "Stop Live playback before changing helper routes."
        return True, "Ready to link MIDI tracks. Original tracks keep their settings."

    def route(self, ids, output, revision):
        """One mutation per generator step; caller schedules every step in Live."""
        self.progress = 0.0
        self.assert_test_safe()
        if revision != self.snapshot()["revision"]:
            raise RuntimeError("The Set changed. Refresh the track list and choose your tracks again.")
        if not isinstance(ids, list) or not 1 <= len(ids) <= 16 or len(set(ids)) != len(ids):
            raise RuntimeError("Select up to 16 MIDI tracks.")
        if not isinstance(output, str) or not output.strip() or len(output) > 120 or " → " in output:
            raise RuntimeError("Choose the virtual MIDI output port.")
        source_map = {key: track for track, key in self.sources()}
        if any(key not in source_map for key in ids):
            raise RuntimeError("A selected track is no longer available.")
        selected = [source_map[key] for key in ids]
        original_names = [(track, str(track.name)) for track in selected]
        def check_sources(unnamed_helper=None):
            if bool(getattr(self.song, "is_playing", False)):
                raise RuntimeError("Stop Live playback before changing helper routes.")
            if unnamed_helper is None:
                self.assert_test_safe()
            current = tuple(self.song.tracks)
            names = [str(track.name) for track, _key in self.sources() if track != unnamed_helper]
            for track, name in original_names:
                if track not in current or str(track.name) != name:
                    raise RuntimeError("A selected track changed. Refresh the tracks before routing again.")
                if getattr(track, "is_frozen", False):
                    raise RuntimeError("Unfreeze selected MIDI tracks before routing.")
                if names.count(name) != 1:
                    raise RuntimeError("Give selected MIDI tracks unique names before routing.")
        check_sources()
        helpers = self.managed_helpers()
        used_channels = {channel_number(helper.output_routing_channel) for helper in helpers if label(helper.output_routing_type) == output}
        missing = [source for source in selected if not any(label(helper.input_routing_type) == str(source.name) for helper in helpers)]
        if len(missing) > 16 - len(used_channels):
            raise RuntimeError("Not enough free MIDI channels on this port. Select fewer tracks or use another port.")
        created, reused = 0, 0
        for source_index, source in enumerate(selected, 1):
            check_sources()
            matches = [track for track in helpers if label(track.input_routing_type) == str(source.name)]
            if matches:
                if len(matches) != 1 or label(matches[0].output_routing_type) != output:
                    raise RuntimeError("An existing helper has different routing. Remove helper routes before changing output.")
                reused += 1
                self.progress = source_index / len(selected)
                continue
            channel = next((number for number in range(1, 17) if number not in used_channels), None)
            if channel is None:
                raise RuntimeError("No free MIDI channel on this output.")
            used_channels.add(channel)
            before = tuple(self.song.tracks)
            self.song.create_midi_track(-1)
            self.progress = (source_index - 1 + 1 / 9.0) / len(selected)
            yield "Track %s/%s: created helper; waiting for Live." % (source_index, len(selected))
            # Do not inspect or configure the new native track in the creation tick.
            additions = [track for track in self.song.tracks if track not in before]
            if len(additions) != 1 or any(track not in tuple(self.song.tracks) for track in before):
                raise RuntimeError("The Set changed during track creation. The new track was left for review.")
            helper = additions[0]
            check_sources(unnamed_helper=helper)
            if tuple(helper.devices) or any(slot.has_clip for slot in helper.clip_slots) or tuple(helper.arrangement_clips):
                raise RuntimeError("Live created a default track containing devices or clips. It was left unchanged for review.")
            helper.current_monitoring_state = 2
            self.progress = (source_index - 1 + 2 / 9.0) / len(selected)
            yield "Muted the helper input while configuring it."
            check_sources(unnamed_helper=helper)
            helper.name = PREFIX + str(source.name) + " → " + output + " [ch %s]" % channel
            self.owned.append(helper)
            self.progress = (source_index - 1 + 3 / 9.0) / len(selected)
            yield "Named the MIDI helper."
            def check_helper():
                check_sources()
                if helper not in tuple(self.song.tracks) or not empty_helper(helper):
                    raise RuntimeError("The helper changed or contains user material. Routing stopped.")
            check_helper()
            helper.input_routing_type = choose(helper, "available_input_routing_types", str(source.name))
            self.progress = (source_index - 1 + 4 / 9.0) / len(selected)
            yield "Selected the source MIDI track."
            check_helper()
            helper.input_routing_channel = choose(helper, "available_input_routing_channels", "Pre FX")
            self.progress = (source_index - 1 + 5 / 9.0) / len(selected)
            yield "Selected MIDI before the instrument."
            check_helper()
            helper.output_routing_type = choose(helper, "available_output_routing_types", output)
            self.progress = (source_index - 1 + 6 / 9.0) / len(selected)
            yield "Selected the virtual MIDI output."
            check_helper()
            helper.output_routing_channel = choose_channel(helper, channel)
            self.progress = (source_index - 1 + 7 / 9.0) / len(selected)
            yield "Assigned a separate MIDI channel."
            check_helper()
            helper.arm = False
            self.progress = (source_index - 1 + 8 / 9.0) / len(selected)
            yield "Kept the helper unarmed."
            check_helper()
            helper.current_monitoring_state = 0
            self.progress = (source_index - 1 + 9 / 9.0) / len(selected)
            yield "Enabled the completed MIDI route."
            self.owned.remove(helper)
            created += 1
            helpers.append(helper)
        return {"created": created, "reused": reused}


    def remove(self):
        self.assert_test_safe()
        targets = self.managed_helpers()
        for helper in reversed(targets):
            self.assert_test_safe()
            if not empty_helper(helper):
                raise RuntimeError("A helper now contains user material. Cleanup stopped.")
            self._delete(helper)
            yield "Removed an empty MIDI helper; waiting for Live to settle."
        self.owned = [track for track in self.owned if track in tuple(self.song.tracks)]
        return {"removed": len(targets)}
