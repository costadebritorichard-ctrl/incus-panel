"""Browser framing, authorization, bounded output and HTTP worker availability."""
import io
import json
import socket
import struct
import threading
import time
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import http.client

from incus_panel.console import Console, WebSocket
from incus_panel.console_stream import BrowserSocket
from incus_panel.core import PanelError
from incus_panel.server import Application, Handler, PanelHTTPServer, demo_config, password_hash


class EchoConsole(Console):
    """Explicit PTY double; it echoes input without executing any commands."""
    def __init__(self, client, project, target, deadline):
        self.client, self.project, self.target = client, project, target
        self.deadline = deadline
        self.last_access = self.last_auth = time.time()
        self.closed = False
        self.lock = threading.RLock()
        self.available = threading.Condition(self.lock)
        self.stream_lock = threading.Lock()
        self.output = 'fixture$ '
        self.channels, self.inputs, self.sizes = [], [], []

    def write(self, text):
        if self.closed or not isinstance(text, str) or len(text) > 4096:
            raise PanelError(400, 'Entrada inválida.')
        with self.available:
            self.inputs.append(text)
            self.output += text
            self.available.notify_all()

    def resize(self, width, height):
        if type(width) is not int or type(height) is not int or not 20 <= width <= 300 or not 5 <= height <= 100:
            raise PanelError(400, 'Dimensões inválidas.')
        self.sizes.append((width, height))


def masked(payload, opcode=1, final=True):
    value = payload.encode() if isinstance(payload, str) else payload
    size = len(value)
    header = bytes([(128 if final else 0) | opcode])
    header += bytes([128 | size]) if size < 126 else b'\xfe' + struct.pack('!H', size)
    mask = b'abcd'
    return header + mask + bytes(byte ^ mask[index % 4] for index, byte in enumerate(value))


class BrowserFrames(unittest.TestCase):
    def channel(self, value):
        sock = SimpleNamespace(sendall=lambda value: None)
        return BrowserSocket(SimpleNamespace(connection=sock, rfile=io.BytesIO(value)))

    def test_fragmented_utf8_and_ping(self):
        payload = 'Olá'.encode()
        channel = self.channel(masked(payload[:3], final=False) + masked('?', opcode=9) + masked(payload[3:], opcode=0))
        self.assertEqual(channel.receive(), 'Olá')

    def test_rejects_unmasked_reserved_and_invalid_continuations(self):
        for value in (b'\x81\x01x', b'\xc1\x80', masked('x', opcode=0), masked('x', final=False) + masked('y')):
            with self.subTest(value=value), self.assertRaises(PanelError):
                self.channel(value).receive()

    def test_frame_and_control_limits_are_checked_before_body_reads(self):
        for value in (b'\x81\xfe' + struct.pack('!H', 32769), b'\x09\x80', b'\x89\xfe' + struct.pack('!H', 126)):
            with self.subTest(value=value), self.assertRaises(PanelError):
                self.channel(value).receive()

    def test_server_frames_are_unmasked(self):
        output = []
        channel = BrowserSocket(SimpleNamespace(connection=SimpleNamespace(sendall=output.append), rfile=io.BytesIO()))
        channel.send('hello')
        self.assertEqual(output, [b'\x81\x05hello'])


class BrowserStream(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.password = password_hash('stream-test-password')

    def setUp(self):
        config = {**demo_config(), 'enable_console': True, 'origin': 'http://127.0.0.1',
                  'users': [{'username': 'test', 'password_hash': self.password, 'role': 'administrador', 'scopes': {'demo': ['laboratorio']}}]}
        self.server = PanelHTTPServer(('127.0.0.1', 0), Handler, max_workers=1)
        self.server.app = self.app = Application(config)
        self.port = self.server.server_port
        config['origin'] = self.origin = f'http://127.0.0.1:{self.port}'
        self.token, self.session = self.app.login('test', 'stream-test-password', 'local')
        with patch('incus_panel.server.Console', EchoConsole):
            result = self.app.open_console(self.token, self.session, {'host': 'demo', 'project': 'laboratorio', 'target': 'lab-web', 'confirmation': 'demo/laboratorio/lab-web'})
        self.console_id = result['console']
        self.console = self.app.console(self.token, self.console_id)
        self.thread = threading.Thread(target=lambda: self.server.serve_forever(poll_interval=.05), daemon=True)
        self.thread.start()
        self.sockets = []

    def tearDown(self):
        for channel in self.sockets:
            channel.close()
        self.console.close()
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def connect(self, *, origin=None, csrf=None, token=None):
        channel = socket.create_connection(('127.0.0.1', self.port), timeout=2)
        self.sockets.append(channel)
        headers = {'Host': f'127.0.0.1:{self.port}', 'Origin': origin or self.origin,
                   'Cookie': 'panel_session=' + (token or self.token), 'Connection': 'Upgrade',
                   'Upgrade': 'websocket', 'Sec-WebSocket-Key': 'YWJjZGVmZ2hpamtsbW5vcA==', 'Sec-WebSocket-Version': '13',
                   'Sec-WebSocket-Protocol': 'incus-console-v1, csrf.' + (csrf if csrf is not None else self.session['csrf'])}
        request = 'GET /api/console/stream?console=' + self.console_id + ' HTTP/1.1\r\n'
        channel.sendall((request + ''.join(key + ': ' + value + '\r\n' for key, value in headers.items()) + '\r\n').encode())
        response = bytearray()
        while not response.endswith(b'\r\n\r\n'):
            part = channel.recv(1)
            if not part:
                break
            response.extend(part)
        websocket = object.__new__(WebSocket)
        websocket.sock = channel
        websocket.send_lock = threading.Lock()
        return int(response.split(b' ')[1]), websocket

    def message(self, channel, value):
        channel.send(json.dumps(value), 1)

    def receive(self, channel):
        value = json.loads(channel.receive())
        if value['type'] == 'output':
            self.message(channel, {'type': 'ack', 'seq': value['seq']})
        return value

    def wait(self, predicate):
        deadline = time.monotonic() + 2
        while not predicate():
            if time.monotonic() > deadline:
                self.fail('Stream did not reach the expected state')
            time.sleep(.005)

    def test_output_keyboard_resize_and_http_slot_release(self):
        status, channel = self.connect()
        self.assertEqual(status, 101)
        self.assertEqual(self.receive(channel)['text'], 'fixture$ ')
        value = 'ls\r\x03\t\x1b[AOlá'
        self.message(channel, {'type': 'input', 'text': value})
        self.assertEqual(self.receive(channel)['text'], value)
        self.message(channel, {'type': 'resize', 'width': 120, 'height': 40})
        self.wait(lambda: self.console.sizes == [(120, 40)])
        self.assertEqual(self.console.inputs, [value])
        # With max_workers=1, the open stream must not occupy the only HTTP slot.
        connection = http.client.HTTPConnection('127.0.0.1', self.port, timeout=2)
        connection.request('GET', '/')
        self.assertEqual(connection.getresponse().status, 200)
        connection.close()

    def test_wrong_origin_csrf_and_owner_are_rejected_without_closing_console(self):
        for options, expected in (({'origin': 'https://untrusted.invalid'}, 403), ({'csrf': 'wrong'}, 403), ({'token': 'unknown'}, 401)):
            with self.subTest(options=options):
                status, _ = self.connect(**options)
                self.assertEqual(status, expected)
                self.assertFalse(self.console.closed)
        other_token, other_session = self.app.login('test', 'stream-test-password', 'other')
        status, _ = self.connect(token=other_token, csrf=other_session['csrf'])
        self.assertEqual(status, 404)

    def test_duplicate_consumer_is_rejected_and_disconnect_closes_pty(self):
        status, channel = self.connect()
        self.assertEqual(status, 101)
        self.receive(channel)
        self.assertEqual(self.connect()[0], 409)
        channel.send(b'', 8)
        self.wait(lambda: self.console.closed and self.console_id not in self.app.consoles)

    def test_session_revocation_blocks_input_and_closes_stream(self):
        status, channel = self.connect()
        self.assertEqual(status, 101)
        self.receive(channel)
        self.app.sessions.pop(self.token)
        self.message(channel, {'type': 'input', 'text': 'must-not-run\r'})
        self.wait(lambda: self.console.closed)
        self.assertEqual(self.console.inputs, [])

    def test_unknown_message_and_forged_ack_close_stream(self):
        status, channel = self.connect()
        self.assertEqual(status, 101)
        self.receive(channel)
        self.message(channel, {'type': 'ack', 'seq': 9999})
        self.wait(lambda: self.console.closed)


class BoundedPTYOutput(unittest.TestCase):
    def test_large_output_is_not_truncated_and_close_releases_waiters(self):
        console = EchoConsole(None, 'project', 'container', time.time() + 60)
        console.output = ''
        chunks = iter([b'x' * 200000])
        def receive():
            try:
                return next(chunks)
            except StopIteration:
                raise EOFError()
        console.data = SimpleNamespace(receive=receive)
        thread = threading.Thread(target=console.receive, daemon=True)
        thread.start()
        values = []
        while True:
            value = console.read(timeout=1)
            self.assertLessEqual(len(value['output']), 65536)
            values.append(value['output'])
            if value['closed']:
                break
        thread.join(timeout=1)
        self.assertEqual(''.join(values), 'x' * 200000)
        self.assertFalse(thread.is_alive())


if __name__ == '__main__':
    unittest.main()
