"""Run the real remote-script transport against a fake Live Set."""
import importlib
import importlib.util
import json
import pathlib
import sys
import time
import types
from contextlib import contextmanager

spec = importlib.util.spec_from_file_location("vs_test_models", pathlib.Path(__file__).with_name("ableton-routing-test.py"))
models = importlib.util.module_from_spec(spec)
spec.loader.exec_module(models)
song = models.Song(test_set=len(sys.argv) > 2 and sys.argv[2] == "test")
if len(sys.argv) > 2 and sys.argv[2] == "many":
    song.tracks.extend(models.Track('Extra %s' % n) for n in range(14))
guard_state = {"depth": 0, "scheduled": False, "tick": 0}
def validate_mutation():
    assert guard_state["depth"] > 0 and guard_state["scheduled"], "Native mutation outside guarded scheduled callback"
song.mutation_guard = validate_mutation
song.tempo = 120
song.is_playing = False
song.name = "Connector test Set"


class ControlSurface:
    def __init__(self, c_instance):
        self._callbacks = []

    def song(self):
        return song

    def update_display(self):
        guard_state["tick"] += 1
        due = [entry for entry in self._callbacks if entry[0] <= guard_state["tick"]]
        self._callbacks = [entry for entry in self._callbacks if entry not in due]
        with self.component_guard():
            guard_state["scheduled"] = True
            try:
                for _tick, callback in due:
                    callback()
            finally:
                guard_state["scheduled"] = False

    def schedule_message(self, delay, callback):
        self._callbacks.append((guard_state["tick"] + delay, callback))

    @contextmanager
    def component_guard(self):
        guard_state["depth"] += 1
        try:
            yield
        finally:
            guard_state["depth"] -= 1

    def log_message(self, message):
        print(message, file=sys.stderr, flush=True)

    def show_message(self, message):
        pass

    def disconnect(self):
        pass


framework = types.ModuleType("_Framework")
surface = types.ModuleType("_Framework.ControlSurface")
surface.ControlSurface = ControlSurface
sys.modules["_Framework"] = framework
sys.modules["_Framework.ControlSurface"] = surface
package = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(package.parent))
module = importlib.import_module(package.name)
connector = module.create_instance(None)
if len(sys.argv) > 2 and sys.argv[2] == "performance":
    scans = [0]
    snapshot = connector._routing.snapshot
    def counted_snapshot():
        scans[0] += 1
        return snapshot()
    connector._routing.snapshot = counted_snapshot
    connector._status()
    assert scans[0] == 1
    song.is_playing = True
    for _ in range(100):
        connector._status(refresh=True)
    assert scans[0] == 1, "Playback heartbeats rescanned the project"
    song.is_playing = False
    connector._status(refresh=True)
    assert scans[0] == 2, "Stopped refresh did not scan current tracks"
    connector._status()
    assert scans[0] == 2, "Unchanged stopped state was immediately rescanned"
    connector.disconnect()
    print("PASS playback uses cached tracks; stopped refresh updates them", flush=True)
    sys.exit(0)
last = None
try:
    for _step in range(300):
        connector.update_display()
        state = {"undo": song.undo, "ended": song.ended, "names": [t.name for t in song.tracks], "creations": song.creations, "deletions": song.deletions}
        if state != last:
            print(json.dumps(state), flush=True)
            last = state
        time.sleep(0.05)
finally:
    connector.disconnect()
