import json
import time
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

    def test_light_mode_is_default_for_every_transport_and_can_be_disabled(self):
        config = demo_config()
        for transport in ('unix', 'ssh', 'tls'):
            config['hosts'][0]['transport'] = transport
            self.assertTrue(Service(config, {'demo': self.client}).low_resource)
        config['low_resource'] = False
        self.assertFalse(Service(config, {'demo': self.client}).low_resource)

    def test_compact_inventory_preserves_identity_and_effective_deletion_guard(self):
        item = self.client.instances['laboratorio', 'lab-web']
        item['config'].update({'user.large-setting': 'x' * 10000, 'security.protection.delete': 'false'})
        item['expanded_config']['security.protection.delete'] = 'true'
        full = self.service.read(self.user, 'demo', 'laboratorio', 'instances')
        compact = self.service.read(self.user, 'demo', 'laboratorio', 'instance-list')
        self.assertEqual([row['name'] for row in full], [row['name'] for row in compact])
        self.assertEqual(compact[0]['expanded_config']['security.protection.delete'], 'true')
        self.assertNotIn('config', compact[0])
        self.assertNotIn('expanded_devices', compact[0])
        self.assertLess(len(json.dumps(compact)), len(json.dumps(full)) // 2)
        self.assertIn('user.large-setting', full[0]['config'])
        with self.assertRaises(PanelError):
            self.service.read(self.user, 'demo', 'redes', 'instance-list')

    def test_host_summary_avoids_device_inventory_and_keeps_authorization(self):
        with self.assertRaises(PanelError):
            self.service.read(self.user, 'demo', 'laboratorio', 'host-summary')
        self.user['host_metrics'] = True
        with patch.object(self.client, 'request', return_value={'metadata': {'memory': {'used': 10}, 'cpu': {'total': 4, 'sockets': ['large']}, 'pci': ['large']}}):
            result = self.service.read(self.user, 'demo', 'laboratorio', 'host-summary')
        self.assertEqual(result, {'memory': {'used': 10}, 'cpu': {'total': 4}})

    def test_reaper_releases_expired_sessions_channels_and_login_failures(self):
        app = Application(demo_config())
        app.sessions['expired'] = {'expires': time.time() - 1}
        app.sessions['live'] = {'expires': time.time() + 60}
        channel = Mock()
        app.consoles['console'] = {'token': 'expired', 'console': channel}
        app.failures = {'old': (1, time.time() - 301), 'recent': (1, time.time())}
        app.reap()
        self.assertEqual(list(app.sessions), ['live'])
        self.assertEqual(app.consoles, {})
        channel.close.assert_called_once()
        self.assertEqual(list(app.failures), ['recent'])

    def test_memavailable_used_instead_of_memfree(self):
        def memory_text(text):
            def read(path, *args, **kwargs):
                if str(path) == '/proc/meminfo':
                    return 'MemTotal: 1048576 kB\n' + text
                raise FileNotFoundError(str(path))
            return read
        with patch('pathlib.Path.read_text', new=memory_text('MemAvailable: 300000 kB\nMemFree: 1000 kB\n')):
            check_creation_memory()
        for text in ('MemAvailable: 120000 kB\n', 'MemFree: 999999 kB\n'):
            with patch('pathlib.Path.read_text', new=memory_text(text)), self.assertRaises(PanelError):
                check_creation_memory()

    def test_creation_honors_effective_available_memory_without_counting_swap(self):
        with patch('incus_panel.resources.memory_status', return_value={'available_kib': 128 * 1024, 'swap_free_kib': 2 * 1024**2}) as memory:
            with self.assertRaises(PanelError):
                check_creation_memory()
        memory.assert_called_once_with(system=True)

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
