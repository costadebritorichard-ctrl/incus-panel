import http.client
import json
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import unittest

from incus_panel.server import Application, Handler, PanelHTTPServer, demo_config, listener, password_hash

OPENSSL = shutil.which('openssl')
if not OPENSSL and Path('C:/Program Files/Git/usr/bin/openssl.exe').exists():
    OPENSSL = 'C:/Program Files/Git/usr/bin/openssl.exe'


@unittest.skipUnless(OPENSSL, 'Requer OpenSSL para certificado temporário de teste')
class TLSAvailability(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.folder = tempfile.TemporaryDirectory()
        cls.cert = str(Path(cls.folder.name) / 'server.crt')
        key = str(Path(cls.folder.name) / 'server.key')
        subprocess.run([OPENSSL, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1,IP:127.0.0.2', '-keyout', key, '-out', cls.cert], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        cls.tls.load_cert_chain(cls.cert, key)
        cls.password = password_hash('test-password')
        cls.key = key

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def setUp(self):
        config = {**demo_config(), 'listen_host': '0.0.0.0', 'origin': 'https://192.168.1.10:8444',
                  'tls_certificate': self.cert, 'tls_key': self.key,
                  'users': [{'username': 'test', 'password_hash': self.password,
                             'role': 'observador', 'scopes': {'demo': ['laboratorio']}}]}
        host, tls = listener(config, 0)
        self.server = PanelHTTPServer((host, 0), Handler, tls)
        self.server.app = Application(config)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def get(self):
        client = http.client.HTTPSConnection('127.0.0.1', self.port, timeout=2, context=ssl.create_default_context(cafile=self.cert))
        try:
            client.request('GET', '/')
            response = client.getresponse()
            self.assertEqual(response.status, 200)
            self.assertTrue(response.read().lower().startswith(b'<!doctype html>'))
        finally:
            client.close()

    def test_idle_tcp_connection_does_not_block_other_https_clients(self):
        with socket.create_connection(('127.0.0.1', self.port), timeout=2) as idle:
            idle.sendall(b'\x16')  # TLS incompleto, como uma conexão interrompida.
            self.get()

    def test_idle_handshake_expires_and_server_remains_available(self):
        self.server.handshake_timeout = 0.2
        with socket.create_connection(('127.0.0.1', self.port), timeout=2) as idle:
            self.assertEqual(idle.recv(1), b'')
        self.get()

    def test_plain_http_on_https_port_does_not_block_https(self):
        with socket.create_connection(('127.0.0.1', self.port), timeout=2) as wrong:
            wrong.sendall(b'GET / HTTP/1.0\r\n\r\n')
        self.get()

    def post(self, address, path='/api/login', origin=None, host=None, headers=None):
        client = http.client.HTTPSConnection(address, self.port, timeout=2, context=ssl.create_default_context(cafile=self.cert))
        request_headers = {'Origin': origin or f'https://{address}:{self.port}',
                           'Content-Type': 'application/json', **(headers or {})}
        if host:
            request_headers['Host'] = host
        try:
            client.request('POST', path, json.dumps({'username': 'test', 'password': 'test-password'}), request_headers)
            response = client.getresponse()
            return response.status, dict(response.getheaders()), json.loads(response.read())
        finally:
            client.close()

    def test_login_and_csrf_logout_work_through_two_local_ips(self):
        self.assertEqual(self.server.server_address[0], '0.0.0.0')
        for address in ('127.0.0.1', '127.0.0.2'):
            with self.subTest(address=address):
                status, headers, session = self.post(address)
                self.assertEqual(status, 200)
                self.assertIn('; Secure', headers['Set-Cookie'])
                cookie = headers['Set-Cookie'].split(';')[0]
                self.assertEqual(self.post(address, '/api/logout', headers={'Cookie': cookie})[0], 403)
                self.assertEqual(self.post(address, '/api/logout', headers={
                    'Cookie': cookie, 'X-CSRF-Token': session['csrf']})[0], 200)

    def test_other_origins_and_spoofed_host_remain_forbidden(self):
        for origin, host in (('https://evil.test', None), ('null', None),
                             (f'http://127.0.0.1:{self.port}', None),
                             (f'https://127.0.0.2:{self.port}', f'127.0.0.2:{self.port}'),
                             ('https://evil.test', 'evil.test'),
                             (f'https://127.0.0.1:{self.port + 1}', None),
                             (f'https://127.0.0.1:{self.port}/path', None)):
            with self.subTest(origin=origin, host=host):
                self.assertEqual(self.post('127.0.0.1', origin=origin, host=host)[0], 403)

    def test_single_ip_listener_retains_exact_origin_policy(self):
        self.server.app.config['listen_host'] = '127.0.0.1'
        self.assertEqual(self.post('127.0.0.1')[0], 403)

    def test_wildcard_listener_requires_tls(self):
        with self.assertRaisesRegex(ValueError, 'exige HTTPS'):
            listener({'listen_host': '0.0.0.0', 'origin': 'https://panel.test'}, 8444)
