"""TCP fault-injection proxy for live network-degradation tests.

Sits between a client (edge agent, dispatcher) and a server (MQTT broker) and can:
- go down: drop every open connection and refuse new ones (link outage)
- add latency to every forwarded chunk (congested link)
- come back up (restoration)

This degrades a real TCP connection carrying real MQTT traffic on one machine. It does not model radio,
cellular or satellite behaviour.
"""

import contextlib
import socket
import threading
import time


class FaultProxy:
    def __init__(self, target_host: str, target_port: int, listen_port: int = 0):
        self.target = (target_host, target_port)
        self._srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self._srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self._srv.bind(("127.0.0.1", listen_port))
        self._srv.listen(64)
        self.port = self._srv.getsockname()[1]
        self._up = threading.Event()
        self._up.set()
        self.latency_s = 0.0
        self._conns: list[socket.socket] = []
        self._lock = threading.Lock()
        self._closed = False
        self.outages: list[tuple[float, float | None]] = []
        threading.Thread(target=self._accept, daemon=True).start()

    # ---------- control ----------
    def down(self) -> None:
        self._up.clear()
        self.outages.append((time.monotonic(), None))
        with self._lock:
            for s in self._conns:
                with contextlib.suppress(OSError):
                    s.shutdown(socket.SHUT_RDWR)
                    s.close()
            self._conns.clear()

    def up(self) -> None:
        if self.outages and self.outages[-1][1] is None:
            self.outages[-1] = (self.outages[-1][0], time.monotonic())
        self._up.set()

    def close(self) -> None:
        self._closed = True
        self.down()
        with contextlib.suppress(OSError):
            self._srv.close()

    # ---------- forwarding ----------
    def _accept(self) -> None:
        while not self._closed:
            try:
                client, _ = self._srv.accept()
            except OSError:
                return
            if not self._up.is_set():
                with contextlib.suppress(OSError):
                    client.close()
                continue
            try:
                upstream = socket.create_connection(self.target, timeout=3)
            except OSError:
                client.close()
                continue
            with self._lock:
                self._conns += [client, upstream]
            for a, b in ((client, upstream), (upstream, client)):
                threading.Thread(target=self._pipe, args=(a, b), daemon=True).start()

    def _pipe(self, src: socket.socket, dst: socket.socket) -> None:
        try:
            while self._up.is_set():
                data = src.recv(65536)
                if not data:
                    break
                if self.latency_s:
                    time.sleep(self.latency_s)
                dst.sendall(data)
        except OSError:
            pass
        finally:
            for s in (src, dst):
                with contextlib.suppress(OSError):
                    s.close()
