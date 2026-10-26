"""Notificações sem conteúdo sensível; cada reconexão invalida o estado REST."""
import json
import threading
import time

from .console import WebSocket


class Events:
    def __init__(self, client, project, deadline):
        self.client, self.project, self.deadline = client, project, deadline
        self.last_access = time.time()
        self.version = 0
        self.connected = False
        self.closed = False
        self.channel = None
        self.stop = threading.Event()
        self.lock = threading.RLock()
        threading.Thread(target=self.run, daemon=True).start()

    def run(self):
        backoff = 1
        while not self.stop.is_set() and time.time() < self.deadline:
            try:
                channel = WebSocket(self.client, "/1.0/events", self.project)
                with self.lock:
                    if self.closed:
                        channel.close()
                        return
                    self.channel = channel
                    self.connected = True
                    self.version += 1  # Never rely on replay of missed events.
                backoff = 1
                while not self.stop.is_set():
                    event = json.loads(channel.receive())
                    if event.get("type") in ("operation", "lifecycle") and event.get("project", self.project) == self.project:
                        with self.lock:
                            self.version += 1
            except Exception:
                with self.lock:
                    self.connected = False
            finally:
                if self.channel:
                    self.channel.close()
                    self.channel = None
            self.stop.wait(backoff)
            backoff = min(backoff * 2, 30)
        self.close()

    def read(self):
        with self.lock:
            self.last_access = time.time()
            return {"version": self.version, "connected": self.connected, "resync": True}

    def close(self):
        self.closed = True
        self.connected = False
        self.stop.set()
        if self.channel:
            self.channel.close()
