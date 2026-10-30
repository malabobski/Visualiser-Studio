import importlib.util
import pathlib
import unittest
from contextlib import nullcontext
from types import SimpleNamespace

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('vs_routing', ROOT / 'connectors/ableton/Visualiser_Studio_Link/routing.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

def route(name):
    return SimpleNamespace(display_name=name)

class Track:
    def __init__(self, name, midi=True, instrument=False):
        self.name = name
        self.has_midi_input = midi
        self.has_midi_output = midi and not instrument
        self.is_foldable = self.is_frozen = False
        self.devices = ['Instrument'] if instrument else []
        self.clip_slots = [SimpleNamespace(has_clip=False)]
        self.arrangement_clips = []
        self.arm = instrument
        self.mute = False
        self.solo = False
        self._solo_listeners = []
        self.current_monitoring_state = 1
        self.input_routing_type = route('All Ins')
        self.input_routing_channel = route('All Channels')
        self.output_routing_type = route('No Output')
        self.output_routing_channel = route('Ch. 1')

    def __setattr__(self, name, value):
        old = self.__dict__.get(name)
        guard = self.__dict__.get('_guard')
        if guard and name in ('name', 'solo', 'arm', 'current_monitoring_state', 'input_routing_type', 'input_routing_channel', 'output_routing_type', 'output_routing_channel'):
            guard()
        object.__setattr__(self, name, value)
        if name == 'solo' and old != value:
            for callback in self.__dict__.get('_solo_listeners', [])[:]:
                callback()

    def add_solo_listener(self, callback):
        self._solo_listeners.append(callback)

    def remove_solo_listener(self, callback):
        self._solo_listeners.remove(callback)

class Song:
    def __init__(self, test_set=False):
        self.tracks = [Track('VS Test 1'), Track('VS Test 2')] if test_set else [Track('Keys', instrument=True), Track('Bass', instrument=True), Track('Audio', midi=False)]
        self.is_playing = False
        self.undo = self.ended = self.creations = self.deletions = self.tick = 0
        self.fail_number = 0
        self.mutation_guard = None

    def create_midi_track(self, index):
        if self.mutation_guard:
            self.mutation_guard()
        assert index == -1
        self.creations += 1
        helper = Track('MIDI')
        helper.available_input_routing_types = [route(t.name) for t in self.tracks]
        helper.available_input_routing_channels = [route('Pre FX'), route('Post FX')]
        helper.available_output_routing_types = [] if self.fail_number == self.creations else [route('VS Link'), route('VS Port')]
        helper.available_output_routing_channels = [route('Ch. %s' % n) for n in range(1, 17)]
        helper._guard = self.mutation_guard
        self.tracks.append(helper)

    def delete_track(self, index):
        if self.mutation_guard:
            self.mutation_guard()
        assert self.tracks[index].name.startswith(module.PREFIX), 'Attempted source-track deletion'
        self.deletions += 1
        del self.tracks[index]

    def begin_undo_step(self):
        raise AssertionError('Do not hold a manual Undo group across native callbacks')

    def end_undo_step(self):
        raise AssertionError('Do not hold a manual Undo group across native callbacks')

def drain(operation, song):
    while True:
        try:
            next(operation)
            song.tick += 1
        except StopIteration as result:
            return result.value

class RoutingTests(unittest.TestCase):
    def setUp(self):
        self.song = Song(test_set=True)
        self.routing = module.Routing(self.song)

    def link(self):
        state = self.routing.snapshot()
        return drain(self.routing.route([t['id'] for t in state['tracks']], 'VS Link', state['revision']), self.song)

    def test_project_routes_preserve_instruments_clips_audio_and_source_settings(self):
        self.song = Song()
        self.song.tracks[0].clip_slots[0].has_clip = True
        self.song.tracks[1].arrangement_clips = ['Bass notes']
        self.routing = module.Routing(self.song, test_mode=False)
        originals = [dict(vars(track)) for track in self.song.tracks]
        self.assertEqual(self.link(), {'created': 2, 'reused': 0})
        self.assertEqual([dict(vars(track)) for track in self.song.tracks[:3]], originals)
        self.assertEqual(self.link(), {'created': 0, 'reused': 2})
        self.assertEqual(drain(self.routing.remove(), self.song), {'removed': 2})
        self.assertEqual([dict(vars(track)) for track in self.song.tracks], originals)

    def test_project_rejects_ambiguous_or_frozen_sources_before_creation(self):
        self.song = Song()
        self.routing = module.Routing(self.song, test_mode=False)
        self.song.tracks[1].name = 'Keys'
        with self.assertRaisesRegex(RuntimeError, 'unique names'):
            self.link()
        self.song.tracks[1].name = 'Bass'
        self.song.tracks[1].is_frozen = True
        with self.assertRaisesRegex(RuntimeError, 'Unfreeze'):
            self.link()
        self.assertEqual(self.song.creations, 0)

    def test_sixteen_tracks_complete_in_one_batch_and_repeated_batch_reuses_all(self):
        self.song = Song()
        self.song.tracks.extend(Track('Extra %s' % n) for n in range(14))
        self.routing = module.Routing(self.song, test_mode=False)
        self.assertEqual(self.link(), {'created': 16, 'reused': 0})
        self.assertEqual(self.link(), {'created': 0, 'reused': 16})
        self.assertEqual(sorted(module.channel_number(t.output_routing_channel) for t in self.routing.helpers()), list(range(1, 17)))

    def test_route_progress_is_monotonic_and_finishes_at_one(self):
        state = self.routing.snapshot()
        operation = self.routing.route([row['id'] for row in state['tracks']], 'VS Link', state['revision'])
        progress = []
        while True:
            try:
                next(operation)
                progress.append(self.routing.progress)
                self.song.tick += 1
            except StopIteration:
                break
        self.assertEqual(len(progress), 18)
        self.assertEqual(progress, sorted(progress))
        self.assertTrue(all(0 < value <= 1 for value in progress))
        self.assertEqual(progress[-1], 1)

    def test_source_named_like_default_helper_does_not_abort_batch(self):
        self.song = Song()
        self.song.tracks[1].name = 'MIDI'
        self.routing = module.Routing(self.song, test_mode=False)
        self.assertEqual(self.link(), {'created': 2, 'reused': 0})

    def test_capacity_is_checked_before_creating_a_partial_batch(self):
        self.song = Song()
        self.song.tracks.extend(Track('Extra %s' % n) for n in range(13))
        self.routing = module.Routing(self.song, test_mode=False)
        self.assertEqual(self.link()['created'], 15)
        self.song.tracks.extend([Track('One more'), Track('Another')])
        state = self.routing.snapshot()
        with self.assertRaisesRegex(RuntimeError, 'Not enough free'):
            drain(self.routing.route([row['id'] for row in state['tracks'][-2:]], 'VS Link', state['revision']), self.song)
        self.assertEqual(self.song.creations, 15)

    def test_two_routes_preserve_originals_and_use_distinct_channels(self):
        originals = [dict(vars(track)) for track in self.song.tracks]
        self.assertEqual(self.link(), {'created': 2, 'reused': 0})
        self.assertEqual([dict(vars(t)) for t in self.song.tracks[:2]], originals)
        self.assertEqual([module.channel_number(t.output_routing_channel) for t in self.song.tracks[2:]], [1, 2])
        self.assertGreater(self.song.tick, 12)

    def test_solo_follow_is_scheduled_tracks_multiple_sources_and_preserves_manual_solos(self):
        self.link()
        callbacks, errors = [], []
        follow = module.SoloFollow(self.routing, lambda _delay, callback: callbacks.append(callback), nullcontext, errors.append)
        follow.refresh()
        def tick():
            while callbacks:
                callbacks.pop(0)()
        tick()
        one, two, helper_one, helper_two = self.song.tracks
        one.solo = True
        self.assertFalse(helper_one.solo, 'Listener edited Live synchronously')
        tick()
        self.assertTrue(one.solo)
        self.assertTrue(helper_one.solo)
        self.assertFalse(helper_two.solo)
        two.solo = True
        tick()
        self.assertTrue(helper_one.solo and helper_two.solo)
        one.solo = False
        tick()
        self.assertFalse(helper_one.solo)
        self.assertTrue(helper_two.solo)
        helper_one.solo = True  # User manually soloed this helper.
        one.solo = True
        tick()
        one.solo = False
        tick()
        self.assertTrue(helper_one.solo, 'Removed a manual helper solo')
        two.solo = False
        tick()
        self.assertFalse(helper_two.solo)
        follow.disconnect()
        one.solo = True
        self.assertFalse(callbacks)
        self.assertFalse(one._solo_listeners)
        self.assertFalse(errors)

    def test_solo_follow_leaves_modified_and_deleted_helpers_alone(self):
        self.link()
        callbacks = []
        follow = module.SoloFollow(self.routing, lambda _delay, callback: callbacks.append(callback), nullcontext, self.fail)
        follow.refresh()
        callbacks.pop(0)()
        self.song.tracks[0].solo = True
        self.song.tracks[2].arrangement_clips = ['User notes']
        self.song.tracks.pop()
        callbacks.pop(0)()
        self.assertFalse(self.song.tracks[2].solo)
        follow.disconnect()

    def test_test_names_ignore_case_but_still_require_both_distinct_tracks(self):
        self.song.tracks[0].name = 'VS TEST 1'
        self.song.tracks[1].name = ' vs test 2 '
        self.assertTrue(self.routing.test_safety()[0])
        self.assertEqual(self.link(), {'created': 2, 'reused': 0})
        self.song.tracks[1].name = 'VS TEST 1'
        safe, reason = self.routing.test_safety()
        self.assertFalse(safe)
        self.assertIn('Rename', reason)

    def test_creation_settles_before_configuring_new_track(self):
        state = self.routing.snapshot()
        operation = self.routing.route([state['tracks'][0]['id']], 'VS Link', state['revision'])
        next(operation)
        self.assertEqual(self.song.tracks[-1].name, 'MIDI')
        self.assertEqual(self.song.tracks[-1].current_monitoring_state, 1)
        next(operation)
        self.assertEqual(self.song.tracks[-1].current_monitoring_state, 2)
        self.assertEqual(self.song.tracks[-1].name, 'MIDI')

    def test_repeated_setup_and_reload_reuse_completed_helpers(self):
        self.link()
        self.assertEqual(self.link(), {'created': 0, 'reused': 2})
        self.routing = module.Routing(self.song)
        self.assertEqual(self.link(), {'created': 0, 'reused': 2})
        self.assertEqual(len(self.song.tracks), 4)

    def test_native_failure_never_triggers_immediate_native_deletion(self):
        self.song.fail_number = 2
        with self.assertRaises(RuntimeError):
            self.link()
        self.assertEqual(self.song.deletions, 0)
        self.assertEqual(self.song.tracks[-1].current_monitoring_state, 2)
        self.assertEqual(drain(self.routing.remove(), self.song), {'removed': 2})
        self.assertEqual(len(self.song.tracks), 2)

    def test_working_projects_playback_clips_devices_and_armed_tracks_are_blocked(self):
        working = module.Routing(Song())
        with self.assertRaises(RuntimeError):
            drain(working.route([], 'VS Link', working.snapshot()['revision']), working.song)
        for prop, value in [('devices', ['Instrument']), ('arrangement_clips', ['User clip']), ('arm', True)]:
            old = getattr(self.song.tracks[0], prop)
            setattr(self.song.tracks[0], prop, value)
            self.assertFalse(self.routing.test_safety()[0])
            setattr(self.song.tracks[0], prop, old)
        self.song.is_playing = True
        self.assertFalse(self.routing.test_safety()[0])

    def test_cleanup_refuses_user_material_or_changed_routes(self):
        self.link()
        self.song.tracks[-1].arrangement_clips = ['User notes']
        with self.assertRaises(RuntimeError):
            drain(self.routing.remove(), self.song)
        self.assertEqual(len(self.song.tracks), 4)
        self.song.tracks[-1].arrangement_clips = []
        self.song.tracks[-1].output_routing_type = route('Other port')
        with self.assertRaises(RuntimeError):
            drain(self.routing.remove(), self.song)
        self.assertEqual(len(self.song.tracks), 4)

    def test_starting_playback_between_steps_stops_configuration(self):
        state = self.routing.snapshot()
        operation = self.routing.route([state['tracks'][0]['id']], 'VS Link', state['revision'])
        for _ in range(3):
            next(operation)
        self.song.is_playing = True
        with self.assertRaises(RuntimeError):
            next(operation)
        self.assertEqual(module.label(self.song.tracks[-1].input_routing_type), 'All Ins')

if __name__ == '__main__':
    unittest.main()
