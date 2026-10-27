import http.client
from pathlib import Path
import shutil
import socket
import ssl
import subprocess
import tempfile
import threading
import unittest

from incus_panel.server import Application, Handler, PanelHTTPServer, demo_config

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
        subprocess.run([OPENSSL, 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-addext', 'subjectAltName=IP:127.0.0.1', '-keyout', key, '-out', cls.cert], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        cls.tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        cls.tls.load_cert_chain(cls.cert, key)

    @classmethod
    def tearDownClass(cls):
        cls.folder.cleanup()

    def setUp(self):
        self.server = PanelHTTPServer(('127.0.0.1', 0), Handler, self.tls)
        self.server.app = Application(demo_config())
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
