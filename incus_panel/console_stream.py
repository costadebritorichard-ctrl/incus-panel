"""Authenticated browser WebSocket relay for the existing Incus PTY."""
import base64
import hashlib
import hmac
import json
import socket
import struct
import threading
import time

from .core import PanelError


class BrowserSocket:
    """Bounded RFC 6455 frames; browsers mask input, servers do not mask output."""
    def __init__(self, handler):
        self.sock, self.reader = handler.connection, handler.rfile
        self.send_lock = threading.Lock()
        self.last_received = time.monotonic()

    def exact(self, count):
        result = bytearray()
        while len(result) < count:
            chunk = self.reader.read(count - len(result))
            if not chunk:
                raise EOFError()
            result.extend(chunk)
        return bytes(result)

    def send(self, data, opcode=1):
        payload = data.encode('utf-8') if isinstance(data, str) else data
        length = len(payload)
        header = bytes([0x80 | opcode])
        header += bytes([length]) if length < 126 else b'\x7e' + struct.pack('!H', length) if length < 65536 else b'\x7f' + struct.pack('!Q', length)
        with self.send_lock:
            self.sock.sendall(header + payload)

    def message(self, value):
        self.send(json.dumps(value, ensure_ascii=False))

    def receive(self):
        result = bytearray()
        started = False
        while True:
            first, second = self.exact(2)
            opcode, final = first & 15, bool(first & 128)
            if first & 112 or not second & 128:
                raise PanelError(400, 'Frame de console inválido.')
            length = second & 127
            if length == 126:
                length = struct.unpack('!H', self.exact(2))[0]
            elif length == 127:
                length = struct.unpack('!Q', self.exact(8))[0]
            control = opcode in (8, 9, 10)
            if (control and (not final or length > 125)) or length > 32768 or (not control and length + len(result) > 32768):
                raise PanelError(413, 'Mensagem de console excedeu o limite.')
            mask = self.exact(4)
            payload = bytes(value ^ mask[index % 4] for index, value in enumerate(self.exact(length)))
            self.last_received = time.monotonic()
            if opcode == 8:
                raise EOFError()
            if opcode == 9:
                self.send(payload, 10)
                continue
            if opcode == 10:
                continue
            if opcode not in (0, 1) or (opcode == 0) != started:
                raise PanelError(400, 'Fragmentação de console inválida.')
            started = True
            result.extend(payload)
            if final:
                return bytes(result).decode('utf-8')

    def close(self):
        # A slow peer must not hold teardown behind a blocked output send.
        if self.send_lock.acquire(blocking=False):
            try:
                self.sock.settimeout(.2)
                self.sock.sendall(b'\x88\x00')
            except OSError:
                pass
            finally:
                self.send_lock.release()
        try:
            self.sock.shutdown(socket.SHUT_RDWR)
        except OSError:
            pass


def relay(handler, token, session, console_id):
    """Validate the upgrade before consuming a console or releasing an HTTP slot."""
    if not handler.origin_allowed():
        raise PanelError(403, 'Origem não autorizada no console.')
    protocols = [value.strip() for value in handler.headers.get('Sec-WebSocket-Protocol', '').split(',')]
    if 'incus-console-v1' not in protocols or not any(value.isascii() and hmac.compare_digest(value, 'csrf.' + session['csrf']) for value in protocols):
        raise PanelError(403, 'Proteção CSRF: reconecte o console.')
    try:
        key = handler.headers.get('Sec-WebSocket-Key', '')
        valid_key = len(base64.b64decode(key, validate=True)) == 16
    except ValueError:
        valid_key = False
    if (handler.headers.get('Upgrade', '').lower() != 'websocket' or
            'upgrade' not in [value.strip().lower() for value in handler.headers.get('Connection', '').split(',')] or
            handler.headers.get('Sec-WebSocket-Version') != '13' or not valid_key):
        raise PanelError(400, 'Negociação de console inválida.')
    console = handler.app.console(token, console_id)
    if not console.stream_lock.acquire(blocking=False):
        raise PanelError(409, 'Este console já possui uma conexão ativa.')
    upgraded = False
    channel = BrowserSocket(handler)
    stop = threading.Event()
    flow = threading.Condition()
    sent, acknowledged = 0, 0
    sender = None

    def authorized():
        if time.monotonic() - channel.last_received > 20:
            raise PanelError(408, 'Conexão do console interrompida.')
        current = handler.app.console(token, console_id)
        current.last_access = time.time()
        return current

    def output():
        nonlocal sent
        last_ping = time.monotonic()
        def heartbeat():
            nonlocal last_ping
            if time.monotonic() - last_ping >= 5:
                channel.send(b'', 9)
                last_ping = time.monotonic()
        try:
            while not stop.is_set():
                current = authorized()
                with flow:
                    if sent - acknowledged >= 4:
                        flow.wait(timeout=5)
                        heartbeat()
                        continue
                result = current.read(timeout=5)
                if result['output']:
                    with flow:
                        sent += 1
                        sequence = sent
                    channel.message({'type': 'output', 'text': result['output'], 'seq': sequence})
                if result['closed']:
                    channel.message({'type': 'closed'})
                    break
                heartbeat()
        except (PanelError, OSError, EOFError):
            pass
        finally:
            stop.set()
            channel.close()

    try:
        handler.protocol_version = 'HTTP/1.1'
        handler.send_response(101)
        handler.send_header('Upgrade', 'websocket')
        handler.send_header('Connection', 'Upgrade')
        handler.send_header('Sec-WebSocket-Accept', base64.b64encode(hashlib.sha1((key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').encode()).digest()).decode())
        handler.send_header('Sec-WebSocket-Protocol', 'incus-console-v1')
        handler.end_headers()
        handler.wfile.flush()
        upgraded = True
        handler.close_connection = True
        handler.connection.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        handler.server.release_stream_worker()
        sender = threading.Thread(target=output, daemon=True)
        sender.start()
        while not stop.is_set():
            message = json.loads(channel.receive())
            if not isinstance(message, dict):
                raise PanelError(400, 'Mensagem de console inválida.')
            current = authorized()
            if message.get('type') == 'input':
                current.write(message.get('text'))
            elif message.get('type') == 'resize':
                current.resize(message.get('width'), message.get('height'))
            elif message.get('type') == 'ack':
                sequence = message.get('seq')
                with flow:
                    if type(sequence) is not int or not acknowledged <= sequence <= sent:
                        raise PanelError(400, 'Confirmação de console inválida.')
                    acknowledged = sequence
                    flow.notify_all()
            else:
                raise PanelError(400, 'Mensagem de console não permitida.')
    except (OSError, EOFError, ValueError, PanelError):
        if not upgraded:
            raise
    finally:
        stop.set()
        with flow:
            flow.notify_all()
        if upgraded:
            console.close()
            channel.close()
            with handler.app.lock:
                item = handler.app.consoles.get(console_id)
                if item and item['token'] == token:
                    handler.app.consoles.pop(console_id, None)
        if sender:
            sender.join(timeout=1)
        console.stream_lock.release()
