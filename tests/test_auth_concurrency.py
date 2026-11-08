"""Slow password checks must not freeze active sessions on the TV box."""
import concurrent.futures
import threading
import time
import unittest
from unittest.mock import patch

from incus_panel.core import PanelError
from incus_panel.server import Application, demo_config


class AuthenticationConcurrency(unittest.TestCase):
    def setUp(self):
        config = demo_config()
        config['users'] = [{'username': 'admin', 'password_hash': 'test-hash',
                            'role': 'administrador', 'scopes': {'demo': ['laboratorio']}}]
        self.app = Application(config)
        self.app.sessions['existing'] = {'user': config['users'][0], 'expires': time.time() + 60}

    def slow_login(self, during_hash):
        entered, release = threading.Event(), threading.Event()

        def verify(*args):
            entered.set()
            if not release.wait(5):
                raise TimeoutError('Test did not release the password check')
            return True

        with patch('incus_panel.server.verify_password', verify), concurrent.futures.ThreadPoolExecutor(2) as pool:
            login = pool.submit(self.app.login, 'admin', 'password', 'local')
            try:
                self.assertTrue(entered.wait(2))
                during_hash(pool)
            finally:
                release.set()
            return login

    def test_active_session_remains_available_during_hash(self):
        def check(pool):
            read = pool.submit(self.app.session, 'existing')
            self.assertEqual(read.result(timeout=1)['user']['username'], 'admin')
        self.assertIn(self.slow_login(check).result()[0], self.app.sessions)

    def test_low_resource_mode_bounds_parallel_password_checks(self):
        def check(pool):
            with self.assertRaises(PanelError) as error:
                self.app.login('admin', 'password', 'another-address')
            self.assertEqual(error.exception.status, 429)
        self.slow_login(check).result()

    def test_changed_or_removed_identity_cannot_finish_login(self):
        for replacement in ([], [{**self.app.config['users'][0], 'role': 'observador'}]):
            with self.subTest(replacement=replacement):
                self.app.config['users'] = [self.app.sessions['existing']['user']]
                login = self.slow_login(lambda pool: self.app.config.update(users=replacement))
                with self.assertRaises(PanelError) as error:
                    login.result()
                self.assertEqual(error.exception.status, 401)
                self.assertEqual(list(self.app.sessions), ['existing'])

    def test_password_error_releases_hash_slot(self):
        with patch('incus_panel.server.verify_password', side_effect=ValueError('hash failure')):
            with self.assertRaises(ValueError):
                self.app.login('admin', 'password', 'local')
        with patch('incus_panel.server.verify_password', return_value=True):
            token, _ = self.app.login('admin', 'password', 'local')
        self.assertIn(token, self.app.sessions)
