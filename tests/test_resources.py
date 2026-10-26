import json
import unittest
from unittest.mock import Mock, patch

from incus_panel.catalog import remote_images
from incus_panel.core import Demo, PanelError, Service
from incus_panel.resources import check_creation_memory
from incus_panel.server import Application, demo_config


class LowResourceContracts(unittest.TestCase):
    def setUp(self):
        self.config = demo_config()
        self.config.update(manage_all_instances=True, low_resource=True)
        self.client = Demo()
        self.service = Service(self.config, {'demo': self.client})
        self.user = {'username': 'admin', 'role': 'administrador', 'scopes': {'demo': ['laboratorio']}}

    def test_simultaneous_creation_rejected_and_lock_released_after_completion(self):
        with patch('incus_panel.core.threading.Thread'):
            result = self.service.launch(self.user, 'demo', 'laboratorio', {'image': 'a' * 64})
            with self.assertRaisesRegex(PanelError, 'andamento'):
                self.service.launch(self.user, 'demo', 'laboratorio', {'image': 'a' * 64})
        job = self.service.launches[result['operation']]
        self.service._finish_launch(self.client, 'laboratorio', result['target'], job)
        self.assertFalse(self.service.creation_lock.locked())
        self.assertEqual(job['status_code'], 200)

    def test_automatic_container_has_limits_and_no_reboot_autostart(self):
        with patch.object(self.client, 'request', wraps=self.client.request) as request, patch('incus_panel.core.threading.Thread'):
            self.service.launch(self.user, 'demo', 'laboratorio', {'image': 'a' * 64, 'config': {'limits.memory': '100GiB'}})
        payload = next(c.args[3] for c in request.call_args_list if c.args[:2] == ('POST', '/1.0/instances'))
        self.assertEqual(payload['config'], {'limits.memory': '128MiB', 'limits.cpu.allowance': '50ms/100ms', 'boot.autostart': 'false'})

    def test_insufficient_memory_never_contacts_incus_and_allows_retry(self):
        self.config.update(demo=False)
        self.config['hosts'][0]['transport'] = 'unix'
        with patch('incus_panel.resources.check_creation_memory', side_effect=PanelError(409, 'Memória insuficiente')), patch.object(self.client, 'request') as request:
            with self.assertRaisesRegex(PanelError, 'Memória'):
                self.service.launch(self.user, 'demo', 'laboratorio', {'image': 'a' * 64})
            request.assert_not_called()
        self.assertFalse(self.service.creation_lock.locked())

    def test_local_transport_defaults_to_low_resource_and_disables_events(self):
        config = demo_config()
        config['hosts'][0]['transport'] = 'unix'
        config['demo'] = False
        config['enable_events'] = True
        app = Application(config, {'demo': self.client})
        session = {'user': self.user, 'csrf': 'test', 'expires': 9999999999}
        self.assertTrue(app.public_session(session)['low_resource'])
        with patch('incus_panel.server.Events') as events:
            self.assertFalse(app.event_status('token', session, 'demo', 'laboratorio')['enabled'])
            events.assert_not_called()

    def test_memavailable_used_instead_of_memfree(self):
        with patch('pathlib.Path.read_text', return_value='MemAvailable: 300000 kB\nMemFree: 1000 kB\n'):
            check_creation_memory()
        for text in ('MemAvailable: 120000 kB\n', 'MemFree: 999999 kB\n'):
            with patch('pathlib.Path.read_text', return_value=text), self.assertRaises(PanelError):
                check_creation_memory()

    def test_index_download_is_bounded_and_cached(self):
        response = Mock()
        response.read.return_value = json.dumps({'index': {'images': {'products': ['alpine:3.22:armhf:default']}}}).encode()
        context = Mock()
        context.__enter__ = Mock(return_value=response)
        context.__exit__ = Mock(return_value=False)
        with patch('incus_panel.catalog._cache', None), patch('urllib.request.urlopen', return_value=context) as request:
            first = remote_images('armv7l')
            self.assertEqual(remote_images('armv7l'), first)
        self.assertEqual(first[0]['remote_image'], 'alpine/3.22')
        request.assert_called_once()
        self.assertTrue(request.call_args.args[0].endswith('/index.json'))
        response.read.assert_called_once_with(1024 * 1024 + 1)
