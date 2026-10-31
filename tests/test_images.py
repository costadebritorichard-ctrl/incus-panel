"""Downloads independentes de containers: autorização, transporte e HTTP."""
import copy
import json
from pathlib import Path
import unittest
from unittest.mock import Mock, patch

from incus_panel.core import Demo, PanelError, Service
from incus_panel.server import Application, demo_config
from incus_panel.unix_transport import UnixIncus
import test_http


class ImageDownloads(unittest.TestCase):
    def setUp(self):
        self.config = demo_config()
        self.config['allow_remote_images'] = True
        self.user = {'username': 'admin', 'role': 'administrador', 'scopes': {'demo': ['laboratorio']}}
        self.client = Demo()
        self.service = Service(self.config, {'demo': self.client})

    def download(self, **extra):
        return self.service.download_image(self.user, 'demo', 'laboratorio', {'remote_image': 'alpine/edge', **extra})

    def test_download_adds_local_image_without_creating_container(self):
        before = copy.deepcopy(self.client.instances)
        result = self.download()
        state = self.service.read(self.user, 'demo', 'laboratorio', 'operation', result['operation'])
        self.assertEqual(state['status_code'], 200)
        images = self.service.read(self.user, 'demo', 'laboratorio', 'images')
        image = next(i for i in images if i['fingerprint'] == state['metadata']['fingerprint'])
        self.assertEqual(image['aliases'], [{'name': 'alpine/edge'}])
        self.assertEqual(self.client.instances, before)
        self.assertEqual(len(self.client.images['redes']), 1)
        # A imagem baixada aparece também no assistente e serve como fonte local.
        choices = self.service.read(self.user, 'demo', 'laboratorio', 'creation-images')['images']
        self.assertTrue(any(i.get('image') == image['fingerprint'] for i in choices))
        self.service.mutate(self.user, 'demo', 'laboratorio', 'create', 'lab-novo', {
            'image': image['fingerprint'], 'profiles': ['default'], 'confirmation': 'demo/laboratorio/lab-novo'})
        self.assertIn(('laboratorio', 'lab-novo'), self.client.instances)

    def test_source_and_image_type_are_fixed(self):
        with patch.object(self.client, 'request', wraps=self.client.request) as request:
            self.download(server='https://other.invalid', source={'type': 'url'}, public=True, auto_update=True)
        post = next(call for call in request.call_args_list if call.args[:2] == ('POST', '/1.0/images'))
        payload = post.args[3]
        self.assertEqual(payload['source'], {
            'type': 'image', 'mode': 'pull', 'server': 'https://images.linuxcontainers.org',
            'protocol': 'simplestreams', 'image_type': 'container', 'alias': 'alpine/edge'})
        self.assertFalse(payload['public'])
        self.assertFalse(payload['auto_update'])

    def test_roles_read_only_and_disabled_downloads_never_contact_incus(self):
        for role, read_only, enabled in [('observador', False, True), ('operador', False, True),
                                         ('administrador', True, True), ('administrador', False, False)]:
            with self.subTest(role=role, read_only=read_only, enabled=enabled):
                self.user['role'] = role
                self.config.update(read_only=read_only, allow_remote_images=enabled)
                with patch.object(self.client, 'request') as request:
                    with self.assertRaises(PanelError) as error:
                        self.download()
                    self.assertEqual(error.exception.status, 403)
                    request.assert_not_called()

    def test_scope_is_enforced_for_catalog_and_download(self):
        with patch.object(self.client, 'request') as request:
            for host, project in [('demo', 'redes'), ('other', 'laboratorio')]:
                with self.assertRaises(PanelError):
                    self.service.download_image(self.user, host, project, {'remote_image': 'alpine/edge'})
                with self.assertRaises(PanelError):
                    self.service.read(self.user, host, project, 'image-catalog')
            request.assert_not_called()

    def test_unknown_alias_url_and_invalid_values_never_download(self):
        for alias in [None, [], {}, '', '../image', 'https://other/image', 'alpine/missing']:
            with self.subTest(alias=alias), patch.object(self.client, 'request', wraps=self.client.request) as request:
                with self.assertRaises(PanelError) as error:
                    self.download(remote_image=alias)
                self.assertEqual(error.exception.status, 400)
                self.assertFalse(any(call.args[0] == 'POST' for call in request.call_args_list))

    def test_duplicate_download_is_rejected_without_writing(self):
        self.download()
        with patch.object(self.client, 'request', wraps=self.client.request) as request:
            with self.assertRaises(PanelError) as error:
                self.download()
            self.assertEqual(error.exception.status, 409)
            self.assertFalse(any(call.args[0] == 'POST' for call in request.call_args_list))

    def test_real_catalog_uses_host_architecture_and_surfaces_network_failure(self):
        self.config['demo'] = False
        with patch('incus_panel.catalog.remote_images', return_value=[]) as catalog:
            self.assertEqual(self.service.read(self.user, 'demo', 'laboratorio', 'image-catalog'), [])
            catalog.assert_called_once_with('armv7l')
        with patch('incus_panel.catalog.remote_images', side_effect=PanelError(503, 'DNS indisponível')):
            with self.assertRaisesRegex(PanelError, 'DNS'):
                self.download()
        self.assertEqual(len(self.client.images['laboratorio']), 1)

    def test_untrackable_response_and_incus_error_are_audited_as_uncertain(self):
        original = self.client.request
        for response in [{'type': 'sync', 'metadata': {}}, {'type': 'async', 'operation': '/other', 'metadata': {}}]:
            def request(method, path, project, body=None):
                return response if method == 'POST' else original(method, path, project, body)
            with patch.object(self.client, 'request', side_effect=request):
                with self.assertRaises(PanelError) as error:
                    self.download()
            self.assertEqual(error.exception.status, 502)
            self.assertIn('incerto', self.service.audit[-1]['result'])
        def fail(method, path, project, body=None):
            if method == 'POST':
                raise PanelError(409, 'Sem espaço no armazenamento')
            return original(method, path, project, body)
        with patch.object(self.client, 'request', side_effect=fail):
            with self.assertRaisesRegex(PanelError, 'Sem espaço'):
                self.download()

    def test_async_failure_remains_visible_in_operation(self):
        result = self.download()
        self.client.operations[result['operation']].update(status='Failure', status_code=400, err='Falha de rede no Incus')
        state = self.service.read(self.user, 'demo', 'laboratorio', 'operation', result['operation'])
        self.assertEqual(state['status_code'], 400)
        self.assertEqual(state['err'], 'Falha de rede no Incus')
        audit = self.service.read(self.user, 'demo', 'laboratorio', 'audit')[-1]
        self.assertEqual(audit['action'], 'download-image')
        self.assertEqual(audit['operation'], result['operation'])

    def test_socket_allows_image_download_and_rejects_unrelated_image_writes(self):
        response = Mock(status=202)
        response.read.return_value = json.dumps({'type': 'async', 'metadata': {}, 'operation': '/1.0/operations/123'}).encode()
        with patch('incus_panel.unix_transport.UnixHTTPConnection') as connection:
            connection.return_value.getresponse.return_value = response
            client = UnixIncus({'socket_path': str(Path('incus.socket').resolve())})
            client.request('POST', '/1.0/images', 'laboratorio', {'source': {'type': 'image'}})
            args = connection.return_value.request.call_args.args
            self.assertEqual(args[0], 'POST')
            self.assertIn('/1.0/images?project=laboratorio', args[1])
            connection.reset_mock()
            for method, path in [('DELETE', '/1.0/images/' + 'a' * 64), ('POST', '/1.0/images/aliases'), ('PUT', '/1.0/images')]:
                with self.assertRaises(PanelError):
                    client.request(method, path, 'laboratorio', {})
            connection.assert_not_called()


class ImageDownloadHttp(unittest.TestCase):
    request = test_http.HttpContracts.request

    def setUp(self):
        self.config = demo_config()
        self.config['allow_remote_images'] = True
        self.app = Application(self.config)
        self.token = 'image-test'
        self.session = {'user': {'username': 'admin', 'role': 'administrador', 'scopes': {'demo': ['laboratorio']}},
                        'csrf': 'csrf', 'expires': float('inf')}
        self.app.sessions[self.token] = self.session

    def test_download_route_requires_session_origin_and_csrf(self):
        body = {'host': 'demo', 'project': 'laboratorio', 'remote_image': 'alpine/edge'}
        self.assertEqual(self.request('/api/images/download', body, cookie=False)[0], 401)
        self.assertEqual(self.request('/api/images/download', body)[0], 403)
        self.assertEqual(self.request('/api/images/download', body, csrf='csrf', origin='https://evil.invalid')[0], 403)
        self.assertEqual(len(self.app.service.hosts['demo'].images['laboratorio']), 1)
        code, _, raw = self.request('/api/images/download', body, csrf='csrf')
        self.assertEqual(code, 202)
        operation = json.loads(raw)['operation']
        code, _, raw = self.request('/api/read?host=demo&project=laboratorio&resource=operation&target=' + operation)
        self.assertEqual(code, 200)
        self.assertEqual(json.loads(raw)['data']['status_code'], 200)

    def test_catalog_and_download_respect_http_scope_and_role(self):
        code, _, raw = self.request('/api/read?host=demo&project=laboratorio&resource=image-catalog')
        self.assertEqual(code, 200)
        self.assertTrue(any(i['remote_image'] == 'alpine/edge' for i in json.loads(raw)['data']))
        self.assertEqual(self.request('/api/read?host=demo&project=redes&resource=image-catalog')[0], 403)
        self.session['user']['role'] = 'observador'
        self.assertEqual(self.request('/api/images/download', {'host': 'demo', 'project': 'laboratorio', 'remote_image': 'alpine/edge'}, csrf='csrf')[0], 403)
