"""Local-only Live connector. Native mutations are scheduled; original tracks are never edited."""
import json
import os
import socket
import time
from collections import OrderedDict
from _Framework.ControlSurface import ControlSurface
from .routing import Routing, SoloFollow


class VisualiserStudioLink(ControlSurface):
    def __init__(self, c_instance):
        super(VisualiserStudioLink, self).__init__(c_instance)
        self._socket = None
        self._last_status = 0
        self._cached_snapshot = None
        self._last_scan = 0
        self._replies = OrderedDict()
        self._inflight = set()
        self._active = None
        self._message = "Connected. Stop playback before changing helper routes."
        self._disconnected = False
        self._solo_follow = None
        try:
            with open(os.path.join(os.path.dirname(__file__), "config.json"), "r") as config_file:
                config = json.load(config_file)
            self._test_mode = config.get("routing_mode") != "project"
            self._token = config["token"]
            if not isinstance(self._token, str) or len(self._token) != 64:
                raise ValueError("Invalid connector configuration")
            self._target = ("127.0.0.1", int(config["port"]))
            self._socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self._socket.bind(("127.0.0.1", 0))
            self._socket.setblocking(False)
            self._routing = Routing(self.song(), test_mode=self._test_mode)
            self._solo_follow = SoloFollow(self._routing, self.schedule_message, self.component_guard, self.log_message)
            self.show_message("Visualiser Studio Link: guarded MIDI routing")
        except Exception as error:
            self.log_message("Visualiser Studio Link: %s" % error)
            if self._socket:
                self._socket.close()
                self._socket = None

    def _send(self, payload):
        if self._socket is None:
            return
        payload.update({"protocol": 1, "token": self._token})
        try:
            self._socket.sendto(json.dumps(payload, ensure_ascii=True).encode("utf-8"), self._target)
        except (OSError, ValueError):
            pass

    def _status(self, refresh=False):
        playing = bool(self.song().is_playing)
        now = time.monotonic()
        # Heartbeats must not repeatedly walk Live's native track/device/clip
        # objects while audio is running. Commands still validate fresh state.
        if self._cached_snapshot is None or (not playing and self._active is None and (refresh or now - self._last_scan >= 2)):
            self._cached_snapshot = self._routing.snapshot()
            self._solo_follow.refresh()
            self._last_scan = now
        state = dict(self._cached_snapshot)
        safe, reason = self._routing.safety()
        state.update({"kind": "status", "connectorVersion": 3,
                      "routingEnabled": safe, "routingReason": reason,
                      "busy": self._active is not None, "progress": getattr(self._routing, "progress", 0.0), "message": self._message,
                      "tempo": float(self.song().tempo), "playing": bool(self.song().is_playing),
                      "setName": str(getattr(self.song(), "name", "Live Set"))[:120]})
        self._send(state)

    def _complete(self, request_id, result=None, error=None):
        self._active = None
        self._inflight.discard(request_id)
        reply = {"kind": "reply", "id": request_id, "ok": error is None}
        if error is None:
            reply["result"] = result or {}
        else:
            reply["message"] = str(error)[:300]
            self._message = str(error)[:300]
            self.log_message("Visualiser Studio Link routing stopped: " + self._message)
        self._replies[request_id] = reply
        while len(self._replies) > 32:
            self._replies.popitem(last=False)
        self._send(reply)
        self._status(refresh=True)

    def _begin_operation(self, command):
        if self._disconnected:
            return
        with self.component_guard():
            request_id = command["id"]
            try:
                self._routing.assert_test_safe()
                operation = self._routing.route(command.get("tracks"), command.get("output"), command.get("revision")) if command["action"] == "route" else self._routing.remove()
                self._routing.progress = 0.0
                self._active = (request_id, operation)
                self.schedule_message(1, self._advance_operation)
            except Exception as error:
                self._complete(request_id, error=error)

    def _advance_operation(self):
        if self._disconnected or self._active is None:
            return
        with self.component_guard():
            request_id, operation = self._active
            try:
                self._message = next(operation)
                self.log_message("Visualiser Studio Link: " + self._message)
                if time.monotonic() - self._last_status >= 0.15:
                    self._last_status = time.monotonic()
                    self._status()
                self.schedule_message(1, self._advance_operation)
            except StopIteration as done:
                self._message = "Helper routing completed. Original tracks kept their settings."
                self._complete(request_id, result=done.value)
            except Exception as error:
                # Never delete native tracks while unwinding a failed operation.
                self._complete(request_id, error=str(error) + " Any new helper was left for review.")

    def update_display(self):
        super(VisualiserStudioLink, self).update_display()
        with self.component_guard():
            self._poll_messages()

    def _poll_messages(self):
        if self._socket is None:
            return
        for _index in range(8):
            try:
                data, sender = self._socket.recvfrom(60001)
            except (BlockingIOError, OSError):
                break
            if sender != self._target or len(data) > 60000:
                continue
            try:
                command = json.loads(data.decode("utf-8"))
                if command.get("token") != self._token or command.get("protocol") != 1:
                    continue
                request_id = command.get("id", "")
                if not isinstance(request_id, str) or not 1 <= len(request_id) <= 64:
                    continue
                if request_id in self._replies:
                    self._send(self._replies[request_id])
                    continue
                if request_id in self._inflight:
                    continue
                action = command.get("action")
                if action == "refresh":
                    self._send({"kind": "reply", "id": request_id, "ok": True, "result": {}})
                    self._status(refresh=True)
                elif action in ("route", "remove"):
                    if self._inflight:
                        self._send({"kind": "reply", "id": request_id, "ok": False, "message": "Wait for the current routing operation."})
                    else:
                        self._inflight.add(request_id)
                        # Receiving UDP never edits the Set. Live executes this later.
                        self.schedule_message(1, lambda command=command: self._begin_operation(command))
                else:
                    self._send({"kind": "reply", "id": request_id, "ok": False, "message": "Unknown connector action"})
            except (ValueError, TypeError, AttributeError):
                continue
        if time.monotonic() - self._last_status > 1:
            self._last_status = time.monotonic()
            try:
                self._status()
            except Exception as error:
                self.log_message("Visualiser Studio Link status: %s" % error)

    def disconnect(self):
        self._disconnected = True
        if self._solo_follow:
            self._solo_follow.disconnect()
        self._active = None
        self._inflight.clear()
        if self._socket:
            self._socket.close()
            self._socket = None
        super(VisualiserStudioLink, self).disconnect()
