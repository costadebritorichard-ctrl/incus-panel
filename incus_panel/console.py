"""Console Incus via WebSocket TLS; segredos de canais permanecem no servidor."""
import base64
import codecs
import hashlib
import json
import os
import re
import socket
import struct
import threading
import time
from urllib.parse import urlencode

from .core import PanelError


class WebSocket:
    def __init__(self, client, path, project, secret=None):
        import http.client
        if hasattr(client, 'path'):
            from .unix_transport import UnixHTTPConnection
            connection = UnixHTTPConnection(client.path)
        else:
            connection = http.client.HTTPSConnection(client.url.hostname, client.url.port or 8443, context=client.context, timeout=15)
        self.connection = connection
        self.send_lock = threading.Lock()
        try:
            connection.connect()
            self.sock = connection.sock
            if not hasattr(client, 'path') and hashlib.sha256(self.sock.getpeercert(binary_form=True)).hexdigest() != client.fingerprint:
                raise PanelError(502, "Fingerprint TLS divergente no console.")
            key = base64.b64encode(os.urandom(16)).decode()
            query = urlencode({"project": project, **({"secret": secret} if secret is not None else {"type": "lifecycle,operation"})})
            hostname = 'localhost' if hasattr(client, 'path') else client.url.netloc
            request = f"GET {path}?{query} HTTP/1.1\r\nHost: {hostname}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n"
            self.sock.sendall(request.encode())
            headers = bytearray()
            while not headers.endswith(b"\r\n\r\n") and len(headers) < 16384:
                part = self.sock.recv(1)
                if not part:
                    raise PanelError(502, "Canal Incus encerrou durante conexão.")
                headers.extend(part)
            lines = headers.decode("latin-1").split("\r\n")
            response_headers = {key.lower(): value.strip() for key, value in (line.split(":", 1) for line in lines[1:] if ":" in line)}
            expected = base64.b64encode(hashlib.sha1((key + "258EAFA5-E914-47DA-95CA-C5AB0DC85B11").encode()).digest()).decode()
            if len(lines[0].split()) < 2 or lines[0].split()[1] != "101" or response_headers.get("sec-websocket-accept", "") != expected:
                raise PanelError(502, "Incus recusou a negociação WebSocket.")
            self.sock.settimeout(None)
        except Exception:
            connection.close()
            raise

    def send(self, payload, opcode=2):
        if isinstance(payload, str):
            payload = payload.encode()
        length = len(payload)
        if length > 1048576:
            raise PanelError(413, "Mensagem do console muito grande.")
        header = bytes([0x80 | opcode])
        header += bytes([0x80 | length]) if length < 126 else bytes([0x80 | 126]) + struct.pack("!H", length) if length < 65536 else bytes([0x80 | 127]) + struct.pack("!Q", length)
        mask = os.urandom(4)
        encoded = bytes(value ^ mask[i % 4] for i, value in enumerate(payload))
        with self.send_lock:
            self.sock.sendall(header + mask + encoded)

    def exact(self, count):
        result = bytearray()
        while len(result) < count:
            part = self.sock.recv(count - len(result))
            if not part:
                raise EOFError()
            result.extend(part)
        return bytes(result)

    def receive(self):
        result = bytearray()
        while True:
            first, second = self.exact(2)
            opcode, final = first & 15, bool(first & 128)
            length = second & 127
            if first & 112 or second & 128:
                raise PanelError(502, "Frame WebSocket inválido.")
            if length == 126:
                length = struct.unpack("!H", self.exact(2))[0]
            elif length == 127:
                length = struct.unpack("!Q", self.exact(8))[0]
            if length + len(result) > 1048576:
                raise PanelError(502, "Limite do canal excedido.")
            payload = self.exact(length)
            if opcode == 8:
                raise EOFError()
            if opcode == 9:
                self.send(payload, 10)
                continue
            if opcode == 10:
                continue
            if opcode not in (0, 1, 2):
                raise PanelError(502, "Tipo de frame desconhecido.")
            result.extend(payload)
            if final:
                return bytes(result)

    def close(self):
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass
        self.connection.close()


class Console:
    def __init__(self, client, project, target, deadline):
        self.client, self.project, self.target = client, project, target
        self.deadline = deadline
        self.last_access = time.time()
        self.last_auth = time.time()
        self.output = ""
        self.closed = False
        self.lock = threading.RLock()
        self.channels = []
        if not hasattr(client, "context") and not hasattr(client, "path"):
            raise PanelError(501, "A demonstração não emula shell. Use um container Incus de teste.")
        response = client.request("POST", f"/1.0/instances/{target}/exec", project, {"command": ["/bin/sh"], "interactive": True, "wait-for-websocket": True, "environment": {"TERM": "dumb", "LANG": "C.UTF-8"}, "width": 100, "height": 30})
        operation = response.get("operation", "")
        if not re.fullmatch(r"/1.0/operations/[a-f0-9-]{36}", operation):
            raise PanelError(502, "Exec sem operação válida.")
        self.operation = operation.rsplit("/", 1)[-1]
        fds = response.get("metadata", {}).get("metadata", {}).get("fds", {})
        if not fds.get("0") or not fds.get("control"):
            raise PanelError(502, "Incus não retornou os canais interativos esperados.")
        try:
            self.control = WebSocket(client, operation + "/websocket", project, fds["control"])
            self.channels.append(self.control)
            self.data = WebSocket(client, operation + "/websocket", project, fds["0"])
            self.channels.append(self.data)
        except Exception:
            self.close()
            raise
        threading.Thread(target=self.receive, daemon=True).start()

    def receive(self):
        decoder = codecs.getincrementaldecoder("utf-8")("replace")
        try:
            while not self.closed:
                chunk = decoder.decode(self.data.receive())
                # Text-only terminal: never inject HTML or execute OSC sequences.
                chunk = re.sub(r"\x1b\[[0-?]*[ -/]*[@-~]", "", chunk)
                with self.lock:
                    self.output = (self.output + chunk)[-65536:]
        except Exception:
            pass
        finally:
            self.close()

    def read(self):
        with self.lock:
            self.last_access = time.time()
            output, self.output = self.output, ""
            return {"output": output, "closed": self.closed}

    def write(self, text):
        if self.closed:
            raise PanelError(409, "Console encerrado.")
        if not isinstance(text, str) or len(text) > 4096:
            raise PanelError(400, "Entrada inválida ou muito grande.")
        self.last_access = time.time()
        self.data.send(text)

    def resize(self, width, height):
        width, height = int(width), int(height)
        if not 20 <= width <= 300 or not 5 <= height <= 100:
            raise PanelError(400, "Dimensões do terminal inválidas.")
        self.control.send(json.dumps({"command": "window-resize", "args": {"width": str(width), "height": str(height)}}), 1)

    def close(self):
        self.closed = True
        for channel in self.channels:
            channel.close()
