import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from incus_panel.core import Demo, PanelError, Service
from incus_panel.server import Application, demo_config
from incus_panel.unix_transport import UnixIncus


class LocalAdministration(unittest.TestCase):
    def setUp(self):
        self.config = demo_config()
        self.config.update(manage_all_instances=True, allow_remote_images=True)
        self.user = {'username': 'admin', 'role': 'administrador', 'scopes': {'demo': ['laboratorio']}}
        self.client = Demo()
        self.service = Service(self.config, {'demo': self.client})

    def test_new_name_create_start_stop_delete(self):
        for action in ('create', 'start', 'stop', 'delete'):
            result = self.service.mutate(self.user, 'demo', 'laboratorio', action, 'novo', {
                'confirmation': 'demo/laboratorio/novo', 'remote_image': 'debian/12'})
            self.assertIn('operation', result)
        self.assertNotIn(('laboratorio', 'novo'), self.client.instances)

    def test_remote_source_is_fixed_and_local_image_still_works(self):
        with patch.object(self.client, 'request', wraps=self.client.request) as request:
            self.service.mutate(self.user, 'demo', 'laboratorio', 'create', 'novo', {
                'confirmation': 'demo/laboratorio/novo', 'remote_image': 'debian/12'})
        source = request.call_args.args[3]['source']
        self.assertEqual(source, {'type': 'image', 'mode': 'pull', 'server': 'https://images.linuxcontainers.org', 'protocol': 'simplestreams', 'alias': 'debian/12'})
        self.service.mutate(self.user, 'demo', 'laboratorio', 'create', 'local', {
            'confirmation': 'demo/laboratorio/local', 'image': 'a' * 64})

    def test_authorization_and_alias_checks(self):
        for role, project, alias, confirmation in (
            ('observador', 'laboratorio', 'debian/12', 'demo/laboratorio/novo'),
            ('operador', 'laboratorio', 'debian/12', 'demo/laboratorio/novo'),
            ('administrador', 'redes', 'debian/12', 'demo/redes/novo'),
            ('administrador', 'laboratorio', 'https://other/image', 'demo/laboratorio/novo'),
            ('administrador', 'laboratorio', '../image', 'demo/laboratorio/novo'),
            ('administrador', 'laboratorio', 'debian/12', 'wrong'),
        ):
            self.user['role'] = role
            with self.assertRaises(PanelError):
                self.service.mutate(self.user, 'demo', project, 'create', 'novo', {'remote_image': alias, 'confirmation': confirmation})

    def test_unix_config_supports_console_and_events(self):
        self.config['hosts'][0]['transport'] = 'unix'
        self.config.update(enable_console=True, enable_events=True)
        Application.validate(self.config)

    def test_socket_sends_json_and_accepts_async(self):
        response = Mock(status=202)
        response.read.return_value = json.dumps({'type': 'async', 'metadata': {}, 'operation': '/1.0/operations/123'}).encode()
        with patch('incus_panel.unix_transport.UnixHTTPConnection') as connection:
            connection.return_value.getresponse.return_value = response
            result = UnixIncus({'socket_path': str(Path('incus.socket').resolve())}).request('PUT', '/1.0/instances/novo/state', 'default', {'action': 'start'})
            args = connection.return_value.request.call_args.args
            self.assertEqual(args[0], 'PUT')
            self.assertIn('project=default', args[1])
            self.assertEqual(json.loads(args[2]), {'action': 'start'})
            self.assertEqual(result['type'], 'async')

    def test_socket_rejects_other_endpoints_before_connecting(self):
        with patch('incus_panel.unix_transport.UnixHTTPConnection') as connection:
            for method, path in [('POST', '/1.0/certificates'), ('PUT', '/1.0'), ('GET', '/1.0?project=other'), ('DELETE', '/1.0/instances/../x')]:
                with self.assertRaises(PanelError):
                    UnixIncus({'socket_path': str(Path('incus.socket').resolve())}).request(method, path, 'default')
            connection.assert_not_called()
