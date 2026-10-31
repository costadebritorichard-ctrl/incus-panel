"""Edição parcial: permissões, validação, concorrência e preservação de dados."""
import copy
import json
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from incus_panel.core import Demo, PanelError, Service
from incus_panel.server import Application, demo_config
from incus_panel.unix_transport import UnixIncus
import test_http


class EditingContracts(unittest.TestCase):
    def setUp(self):
        self.config = demo_config()
        self.config['manage_all_instances'] = True
        self.user = {'username': 'admin', 'role': 'administrador', 'scopes': {'demo': ['laboratorio']}}
        self.client = Demo()
        self.service = Service(self.config, {'demo': self.client})

    def instance(self):
        return self.service.read(self.user, 'demo', 'laboratorio', 'instance', 'lab-web')

    def update(self, changes, **extra):
        return self.service.mutate(self.user, 'demo', 'laboratorio', 'update', 'lab-web', {
            'confirmation': 'demo/laboratorio/lab-web', 'revision': self.instance()['_revision'],
            'changes': changes, **extra})

    def test_partial_edit_preserves_other_config_profiles_and_project(self):
        instance = self.client.instances['laboratorio', 'lab-web']
        instance['config'].update({'environment.SECRET': 'private-data', 'limits.cpu.allowance': '50ms/100ms'})
        instance['description'] = 'Original description'
        before = copy.deepcopy(instance)
        other = copy.deepcopy(self.client.instances['redes', 'lab-web'])
        result = self.update({'config': {'limits.memory': '256MiB', 'limits.cpu': '2', 'boot.autostart': 'false'}})
        self.assertEqual(self.service.read(self.user, 'demo', 'laboratorio', 'operation', result['operation'])['status_code'], 200)
        after = self.client.instances['laboratorio', 'lab-web']
        self.assertEqual(after['description'], before['description'])
        for key in ('environment.SECRET', 'limits.cpu.allowance'):
            self.assertEqual(after['config'][key], before['config'][key])
        self.assertEqual(after['profiles'], before['profiles'])
        self.assertEqual(after['devices'], before['devices'])
        self.assertEqual(after['config']['limits.memory'], '256MiB')
        self.assertEqual(after['expanded_config']['limits.cpu'], '2')
        self.assertEqual(self.client.instances['redes', 'lab-web'], other)
        self.assertEqual(self.service.audit[-1]['action'], 'update')

    def test_edit_description_and_remove_local_override(self):
        self.update({'description': 'Servidor de testes', 'config': {'limits.memory': ''}})
        self.assertEqual(self.instance()['description'], 'Servidor de testes')
        self.assertNotIn('limits.memory', self.instance()['config'])

    def test_invalid_changes_never_reach_write(self):
        invalid = [None, {}, [], {'devices': {}}, {'config': {}}, {'config': []},
                   {'description': 12}, {'description': 'x' * 1025},
                   {'config': {'security.privileged': 'true'}},
                   {'config': {'limits.memory': '0MiB'}}, {'config': {'limits.memory': '101%'}},
                   {'config': {'limits.memory': 'abc'}}, {'config': {'limits.memory': 128}},
                   {'config': {'limits.cpu': '0'}}, {'config': {'limits.cpu': '1025'}},
                   {'config': {'boot.autostart': True}}, {'config': {'boot.autostart': 'yes'}}]
        before = copy.deepcopy(self.client.instances)
        for changes in invalid:
            with self.subTest(changes=changes), patch.object(self.client, 'request', wraps=self.client.request) as request:
                with self.assertRaises(PanelError) as error:
                    self.update(changes)
                self.assertEqual(error.exception.status, 400)
                self.assertTrue(all(call.args[0] == 'GET' for call in request.call_args_list))
        self.assertEqual(before, self.client.instances)

    def test_stale_revision_rejects_overwrite(self):
        revision = self.instance()['_revision']
        self.update({'description': 'Outra edição'})
        for value in (revision, None):
            with self.assertRaises(PanelError) as error:
                self.update({'description': 'Sobrescrita'}, revision=value)
            self.assertEqual(error.exception.status, 409)
        self.assertEqual(self.instance()['description'], 'Outra edição')

    def test_edit_requires_admin_scope_and_write_permissions(self):
        for role in ('observador', 'operador'):
            self.user['role'] = role
            with self.assertRaises(PanelError) as error:
                self.update({'description': 'Proibido'})
            self.assertEqual(error.exception.status, 403)
        self.user['role'] = 'administrador'
        self.config['read_only'] = True
        with self.assertRaises(PanelError):
            self.update({'description': 'Proibido'})
        self.config['read_only'] = False
        with self.assertRaises(PanelError):
            self.service.mutate(self.user, 'demo', 'redes', 'update', 'lab-web', {})
        self.config['manage_all_instances'] = False
        self.config['mutable_instances']['demo']['laboratorio'] = []
        with self.assertRaises(PanelError):
            self.update({'description': 'Proibido'})

    def test_update_keeps_confirmation_policy_on_server(self):
        with self.assertRaises(PanelError):
            self.update({'description': 'Proibido'}, confirmation='wrong')

    def test_patch_uses_etag_and_rejects_intervening_change(self):
        original = self.client.request
        def request(method, path, project, body=None, etag=None):
            if method == 'PATCH':
                self.client.instances['laboratorio', 'lab-web']['description'] = 'Concurrent update'
            return original(method, path, project, body, etag)
        with patch.object(self.client, 'request', side_effect=request) as calls:
            with self.assertRaises(PanelError) as error:
                self.update({'description': 'Lost update'})
        self.assertEqual(error.exception.status, 412)
        self.assertIsInstance(next(c for c in calls.call_args_list if c.args[0] == 'PATCH').kwargs['etag'], str)
        self.assertEqual(self.instance()['description'], 'Concurrent update')

    def test_missing_etag_refuses_edit_before_write(self):
        original = self.client.request
        def request(*args, **kwargs):
            result = original(*args, **kwargs)
            result.pop('_etag', None)
            return result
        with patch.object(self.client, 'request', side_effect=request) as calls:
            with self.assertRaises(PanelError) as error:
                self.update({'description': 'Unsafe update'})
        self.assertEqual(error.exception.status, 502)
        self.assertTrue(all(call.args[0] == 'GET' for call in calls.call_args_list))

    def test_synchronous_update_is_verified_and_tracked(self):
        result = self.update({'description': 'Verified sync response'})
        operation = self.service.read(self.user, 'demo', 'laboratorio', 'operation', result['operation'])
        self.assertEqual(operation['status_code'], 200)
        self.assertEqual(operation['action'], 'update')
        self.assertIn(result['operation'], [job['id'] for job in self.service.read(self.user, 'demo', 'laboratorio', 'operations')['panel']])

    def test_sync_acknowledgment_without_applying_is_not_success(self):
        original = self.client.request
        def request(method, *args, **kwargs):
            return {'type': 'sync', 'metadata': {}} if method == 'PATCH' else original(method, *args, **kwargs)
        with patch.object(self.client, 'request', side_effect=request):
            with self.assertRaises(PanelError) as error:
                self.update({'description': 'Must not report success'})
        self.assertEqual(error.exception.status, 409)

    def test_effective_delete_protection_cannot_be_bypassed(self):
        instance = self.client.instances['laboratorio', 'lab-db']
        instance['expanded_config']['security.protection.delete'] = 'true'
        with self.assertRaises(PanelError):
            self.service.mutate(self.user, 'demo', 'laboratorio', 'delete', 'lab-db', {'confirmation': 'demo/laboratorio/lab-db'})
        self.assertIn(('laboratorio', 'lab-db'), self.client.instances)

    def test_patch_socket_supports_etag_and_exact_instance_endpoint(self):
        response = Mock(status=202)
        response.read.return_value = json.dumps({'type': 'async', 'metadata': {}, 'operation': '/1.0/operations/test'}).encode()
        with patch('incus_panel.unix_transport.UnixHTTPConnection') as connection:
            connection.return_value.getresponse.return_value = response
            client = UnixIncus({'socket_path': str(Path('incus.socket').resolve())})
            client.request('PATCH', '/1.0/instances/lab-web', 'laboratorio', {'description': 'test'}, etag='test-etag')
            args = connection.return_value.request.call_args.args
            self.assertEqual(args[0], 'PATCH')
            self.assertEqual(args[3]['If-Match'], 'test-etag')
            self.assertIn('project=laboratorio', args[1])
            for path in ('/1.0', '/1.0/profiles/default', '/1.0/instances/lab-web/state'):
                with self.assertRaises(PanelError):
                    client.request('PATCH', path, 'laboratorio', {})

    def test_http_update_requires_csrf_and_returns_tracked_operation(self):
        harness = test_http.HttpContracts('test_csrf_required')
        harness.app = Application(self.config, {'demo': self.client})
        harness.config = self.config
        harness.token, harness.session = 'edit-test', {'user': self.user, 'csrf': 'csrf', 'expires': 9999999999}
        harness.app.sessions[harness.token] = harness.session
        body = {'host': 'demo', 'project': 'laboratorio', 'action': 'update', 'target': 'lab-web',
                'confirmation': 'demo/laboratorio/lab-web', 'revision': self.instance()['_revision'],
                'changes': {'description': 'Updated through HTTP'}}
        self.assertEqual(harness.request('/api/action', body)[0], 403)
        code, _, raw = harness.request('/api/action', body, csrf='csrf')
        self.assertEqual(code, 202)
        self.assertIn('operation', json.loads(raw))
        self.assertEqual(self.instance()['description'], 'Updated through HTTP')
