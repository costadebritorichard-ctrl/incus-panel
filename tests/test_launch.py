import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from incus_panel.catalog import index_choices, remote_images
from incus_panel.core import Demo, PanelError, Service
from incus_panel.server import Application, demo_config
from incus_panel.unix_transport import UnixIncus


class ImmediateThread:
    def __init__(self, target, args, daemon):
        self.target, self.args = target, args

    def start(self):
        self.target(*self.args)


class LaunchContracts(unittest.TestCase):
    def setUp(self):
        self.config = demo_config()
        self.config.update(manage_all_instances=True, allow_remote_images=True)
        self.user = {'username': 'admin', 'role': 'administrador', 'scopes': {'demo': ['laboratorio']}, 'host_metrics': True}
        self.client = Demo()
        self.service = Service(self.config, {'demo': self.client})

    def launch(self, **kwargs):
        with patch('incus_panel.core.threading.Thread', ImmediateThread):
            result = self.service.launch(self.user, 'demo', 'laboratorio', {'image': 'a' * 64, **kwargs})
        return result, self.service.read(self.user, 'demo', 'laboratorio', 'operation', result['operation'])

    def test_only_image_creates_and_starts_with_generated_name(self):
        result, job = self.launch(profiles=['untrusted'], devices={'bad': {}})
        self.assertRegex(result['target'], r'^container-[a-f0-9]{10}$')
        self.assertEqual(job['status_code'], 200)
        self.assertEqual(self.client.instances['laboratorio', result['target']]['status'], 'Running')
        self.assertEqual(self.client.instances['laboratorio', result['target']]['profiles'], ['default'])

    def test_chosen_name_is_used_and_invalid_names_never_create(self):
        result, job = self.launch(target='meu-container')
        self.assertEqual(result['target'], 'meu-container')
        self.assertEqual(job['phase'], 'done')
        self.assertEqual(self.client.instances['laboratorio', 'meu-container']['status'], 'Running')
        for target in ('', '-nome', 'nome-', 'nome com espaco', '../teste', 'a' * 64, 'nome_invalido'):
            with patch.object(self.client, 'request') as request:
                with self.assertRaises(PanelError):
                    self.launch(target=target)
                request.assert_not_called()

    def test_duplicate_name_is_rejected_and_original_is_preserved(self):
        self.launch(target='meu-container')
        with self.assertRaises(PanelError):
            self.launch(target='meu-container')
        self.assertEqual(self.client.instances['laboratorio', 'meu-container']['status'], 'Running')

    def test_wizard_options_are_applied_to_the_incus_payload(self):
        result, job = self.launch(target='wizard-test', options={
            'memory_mib': 256, 'cpu_cores': 2, 'cpu_allowance': 75,
            'autostart': True, 'start': True, 'pool': 'lab', 'disk_gib': 8,
            'network': 'labbr0', 'ipv4': '10.100.0.20', 'description': 'Servidor web'})
        instance = self.client.instances['laboratorio', result['target']]
        self.assertEqual(job['status_code'], 200)
        self.assertEqual(instance['config'], {'limits.memory': '256MiB', 'limits.cpu': '2',
            'limits.cpu.allowance': '75%', 'boot.autostart': 'true', 'security.privileged': 'false'})
        self.assertEqual(instance['devices']['root'], {'type': 'disk', 'path': '/', 'pool': 'lab', 'size': '8GiB'})
        self.assertEqual(instance['devices']['eth0']['ipv4.address'], '10.100.0.20')
        self.assertEqual(instance['description'], 'Servidor web')

    def test_wizard_can_create_without_starting(self):
        result, job = self.launch(options={'start': False})
        self.assertEqual(job['status_code'], 200)
        self.assertEqual(self.client.instances['laboratorio', result['target']]['status'], 'Stopped')

    def test_wizard_rejects_invalid_options_before_any_mutation(self):
        invalid = [[], {'unknown': 'value'}, {'memory_mib': 0}, {'memory_mib': True},
                   {'cpu_cores': 0}, {'cpu_allowance': 101}, {'start': 'false'},
                   {'autostart': 1}, {'pool': 'missing'}, {'network': 'missing'},
                   {'ipv4': '192.168.1.10'}, {'ipv4': '10.100.0.1'},
                   {'ipv4': '10.100.0.0'}, {'ipv4': '10.100.0.255'},
                   {'ipv4': '::1'}, {'ipv4': 0}, {'pool': []}, {'network': False},
                   {'disk_gib': -1}, {'description': 'x' * 2049}]
        for options in invalid:
            with self.subTest(options=options):
                original = self.client.request
                with patch.object(self.client, 'request', side_effect=original) as requests:
                    with self.assertRaises(PanelError):
                        self.launch(options=options)
                self.assertFalse(any(c.args[0] != 'GET' for c in requests.call_args_list))
        # Validation failures must release the single-creation lock.
        self.assertEqual(self.launch(options={})[1]['status_code'], 200)

    def test_directory_pool_does_not_accept_unsupported_quota(self):
        original = self.client.request
        def request(method, path, project, body=None, etag=None):
            if path == '/1.0/storage-pools':
                return {'metadata': [{'name': 'lab', 'status': 'Created', 'driver': 'dir'}]}
            return original(method, path, project, body, etag)
        with patch.object(self.client, 'request', side_effect=request):
            with self.assertRaisesRegex(PanelError, 'cota'):
                self.launch(options={'pool': 'lab', 'disk_gib': 8})
            self.assertEqual(self.launch(options={'pool': 'lab'})[1]['status_code'], 200)

    def test_missing_profile_uses_automatic_disk_and_network(self):
        original = self.client.request
        def request(method, path, project, body=None, etag=None):
            if path == '/1.0/profiles':
                return {'metadata': []}
            return original(method, path, project, body, etag)
        with patch.object(self.client, 'request', side_effect=request) as calls:
            _, job = self.launch()
        self.assertEqual(job['status_code'], 200)
        payload = next(c.args[3] for c in calls.call_args_list if c.args[:2] == ('POST', '/1.0/instances'))
        self.assertEqual(payload['profiles'], [])
        self.assertEqual(payload['devices']['root']['pool'], 'lab')
        self.assertEqual(payload['devices']['eth0']['network'], 'labbr0')

    def test_failure_after_acceptance_is_visible_and_never_starts(self):
        original = self.client.request
        def request(method, path, project, body=None, etag=None):
            result = original(method, path, project, body, etag)
            if method == 'GET' and path.startswith('/1.0/operations/'):
                result['metadata'].update(status_code=400, err='Image not found')
            return result
        with patch.object(self.client, 'request', side_effect=request) as calls:
            result, job = self.launch()
        self.assertEqual(job['status_code'], 400)
        self.assertEqual(job['err'], 'Image not found')
        self.assertFalse(any(c.args[0] == 'PUT' for c in calls.call_args_list))
        operations = self.service.read(self.user, 'demo', 'laboratorio', 'operations')
        self.assertEqual(operations['panel'][0]['id'], result['operation'])

    def test_start_failure_keeps_created_container_and_reports_error(self):
        original = self.client.request
        def request(method, path, project, body=None, etag=None):
            if method == 'PUT':
                raise PanelError(409, 'Kernel does not support this container')
            return original(method, path, project, body, etag)
        with patch.object(self.client, 'request', side_effect=request):
            result, job = self.launch()
        self.assertEqual(job['status_code'], 400)
        self.assertIn('Kernel', job['err'])
        self.assertEqual(self.client.instances['laboratorio', result['target']]['status'], 'Stopped')

    def test_authorization_is_checked_before_creation(self):
        for role in ('observador', 'operador'):
            self.user['role'] = role
            with patch.object(self.client, 'request') as request:
                with self.assertRaises(PanelError):
                    self.launch()
                request.assert_not_called()
        self.user['role'] = 'administrador'
        self.config['read_only'] = True
        with self.assertRaises(PanelError):
            self.launch()

    def test_catalog_failure_preserves_local_images_with_warning(self):
        self.config['demo'] = False
        with patch('incus_panel.catalog.remote_images', side_effect=PanelError(503, 'DNS indisponível')):
            result = self.service.read(self.user, 'demo', 'laboratorio', 'creation-images')
        self.assertEqual(len(result['images']), 1)
        self.assertEqual(result['warning'], 'DNS indisponível')

    def test_missing_network_produces_actionable_error_before_creation(self):
        original = self.client.request
        def request(method, path, project, body=None, etag=None):
            if path in ('/1.0/networks', '/1.0/profiles'):
                return {'metadata': []}
            return original(method, path, project, body, etag)
        with patch.object(self.client, 'request', side_effect=request) as calls:
            with self.assertRaisesRegex(PanelError, 'instalador'):
                self.launch()
        self.assertFalse(any(c.args[0] == 'POST' for c in calls.call_args_list))

    def test_socket_error_includes_incus_reason(self):
        response = Mock(status=400)
        response.read.return_value = json.dumps({'type': 'error', 'error': 'No root device could be found'}).encode()
        with patch('incus_panel.unix_transport.UnixHTTPConnection') as connection:
            connection.return_value.getresponse.return_value = response
            with self.assertRaisesRegex(PanelError, 'No root device'):
                UnixIncus({'socket_path': str(Path('socket').resolve())}).request('POST', '/1.0/instances', 'default', {})


class CatalogContracts(unittest.TestCase):
    def test_catalog_filters_architecture_variant_and_vm_only(self):
        result = index_choices(['debian:bookworm:armhf:default', 'debian:bookworm:amd64:default', 'debian:bookworm:armhf:cloud', 'freebsd:14.5:armhf:default'], 'armv7l')
        self.assertEqual(result, [{'id': 'remote:debian/bookworm', 'remote_image': 'debian/bookworm', 'label': 'Debian bookworm'}])

    def test_download_error_is_actionable(self):
        with patch('incus_panel.catalog._cache', None), patch('urllib.request.urlopen', side_effect=OSError('DNS')):
            with self.assertRaisesRegex(PanelError, 'DNS'):
                remote_images('arm64')


class LaunchHttpContracts(unittest.TestCase):
    def test_create_route_requires_csrf_and_accepts_only_image(self):
        from test_http import HttpContracts
        harness = HttpContracts('test_csrf_required')
        harness.config = demo_config()
        user = {'username': 'test', 'role': 'administrador', 'scopes': {'demo': ['laboratorio']}}
        harness.config.update(manage_all_instances=True, users=[])
        harness.app = Application(harness.config)
        harness.token, harness.session = 'test-session', {'user': user, 'csrf': 'csrf', 'expires': 9999999999}
        harness.app.sessions[harness.token] = harness.session
        body = {'host': 'demo', 'project': 'laboratorio', 'image': 'a' * 64}
        self.assertEqual(harness.request('/api/create', body)[0], 403)
        with patch('incus_panel.core.threading.Thread', ImmediateThread):
            code, _, raw = harness.request('/api/create', body, csrf='csrf')
        self.assertEqual(code, 202)
        result = json.loads(raw)
        self.assertRegex(result['target'], '^container-')
        code, _, raw = harness.request('/api/read?host=demo&project=laboratorio&resource=operation&target=' + result['operation'])
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(raw)['data']['status_code'], 200)
