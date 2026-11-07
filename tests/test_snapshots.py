import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from incus_panel.core import Demo, PanelError, Service
from incus_panel.server import Application, demo_config
from incus_panel.snapshots import artifact_name


class SnapshotContracts(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.metadata_path = Path(self.directory.name) / 'snapshots.json'
        self.config = demo_config()
        self.user = dict(username='admin', role='administrador', scopes={'demo': ['laboratorio', 'redes']})
        self.client = Demo()
        self.service = Service(self.config, {'demo': self.client}, self.metadata_path)

    def act(self, action, target='lab-db', project='laboratorio', **body):
        snapshot = body.get('snapshot')
        return self.service.mutate(self.user, 'demo', project, action, target, {
            'confirmation': f'demo/{project}/{target}' + ('/' + snapshot if snapshot else ''), **body})

    def read(self, resource='snapshots', target='lab-db', project='laboratorio'):
        return self.service.read(self.user, 'demo', project, resource, target)

    def create(self, name='before', description='Antes da atualização'):
        operation = self.act('snapshot', name=name, description=description)['operation']
        self.assertEqual(self.read('operation', operation)['status_code'], 200)
        return self.read()[0]

    def test_create_edit_restore_delete_and_persist_descriptions(self):
        instance = self.client.instances['laboratorio', 'lab-db']
        instance['config']['limits.memory'] = '128MiB'
        item = self.create()
        self.assertEqual(item['description'], 'Antes da atualização')
        self.assertNotIn('config', item)
        self.assertNotIn('devices', item)
        instance['config']['limits.memory'] = '512MiB'
        self.service = Service(self.config, {'demo': self.client}, self.metadata_path)
        self.assertEqual(self.read()[0]['description'], item['description'])
        edited = self.act('snapshot-edit', snapshot='before', revision=item['_revision'], description='Revisado')
        self.assertEqual(self.read('operation', edited['operation'])['status_code'], 200)
        with patch.object(self.client, 'request', wraps=self.client.request) as request:
            restored = self.act('snapshot-restore', snapshot='before')
        self.assertEqual(request.call_args.args, ('PUT', '/1.0/instances/lab-db', 'laboratorio', {'restore': 'before', 'stateful': False}))
        self.assertEqual(self.read('operation', restored['operation'])['status_code'], 200)
        self.assertEqual(instance['config']['limits.memory'], '128MiB')
        self.assertEqual(self.read()[0]['description'], 'Revisado')
        removed = self.act('snapshot-delete', snapshot='before')['operation']
        self.assertEqual(self.read('operation', removed)['status_code'], 200)
        self.assertEqual(self.read(), [])
        self.assertEqual(json.loads(self.metadata_path.read_text())['notes'], {})

    def test_pending_operations_reconcile_after_panel_restart(self):
        self.act('snapshot', name='before', description='Persistido')
        self.service = Service(self.config, {'demo': self.client}, self.metadata_path)
        self.assertEqual(self.read()[0]['description'], 'Persistido')
        self.assertEqual(self.service.snapshot_metadata.data['pending'], {})

    def test_external_deletion_does_not_leave_snapshot_page_blocked(self):
        self.act('snapshot', name='before')
        self.client.instances['laboratorio', 'lab-db']['snapshots'].clear()
        self.assertEqual(self.read(), [])
        self.assertEqual(self.service.snapshot_metadata.data['pending'], {})

    def test_failed_operation_does_not_publish_annotation_or_success(self):
        operation = self.act('snapshot', name='before', description='Não deve aparecer')['operation']
        self.client.instances['laboratorio', 'lab-db']['snapshots'].clear()
        self.client.operations[operation].update(status_code=400, err='Sem espaço no pool')
        self.assertEqual(self.read('operation', operation)['err'], 'Sem espaço no pool')
        self.assertEqual(self.read(), [])
        self.assertEqual(self.service.snapshot_metadata.data['notes'], {})

    def test_success_requires_snapshot_presence_and_deletion_absence(self):
        operation = self.act('snapshot', name='before')['operation']
        items = self.client.instances['laboratorio', 'lab-db']['snapshots']
        saved = copy.deepcopy(items)
        items.clear()
        with self.assertRaisesRegex(PanelError, 'não foi encontrado'):
            self.read('operation', operation)
        items.extend(saved)
        self.read('operation', operation)
        operation = self.act('snapshot-delete', snapshot='before')['operation']
        items.extend(saved)
        with self.assertRaisesRegex(PanelError, 'ainda existe'):
            self.read('operation', operation)

    def test_permissions_scope_confirmation_and_stopped_requirement(self):
        item = self.create()
        for role in ('observador', 'operador'):
            self.user['role'] = role
            for action in ('snapshot-edit', 'snapshot-restore', 'snapshot-delete'):
                with self.assertRaises(PanelError):
                    self.act(action, snapshot='before', description='x', revision=item['_revision'])
        self.user['role'] = 'administrador'
        with self.assertRaises(PanelError):
            self.service.mutate(self.user, 'demo', 'laboratorio', 'snapshot-delete', 'lab-db', {'snapshot': 'before', 'confirmation': 'lab-db'})
        with self.assertRaises(PanelError):
            self.act('snapshot-delete', snapshot='before', project='redes')
        self.client.instances['laboratorio', 'lab-db']['status'] = 'Running'
        with self.assertRaisesRegex(PanelError, 'Pare o container'):
            self.act('snapshot-restore', snapshot='before')
        self.user['scopes'] = {'demo': ['redes']}
        with self.assertRaises(PanelError):
            self.read()

    def test_concurrent_edits_rejected_and_annotations_bound_to_snapshot_identity(self):
        item = self.create()
        self.act('snapshot-edit', snapshot='before', description='Novo', revision=item['_revision'])
        with self.assertRaisesRegex(PanelError, 'descrição mudou'):
            self.act('snapshot-edit', snapshot='before', description='Antigo', revision=item['_revision'])
        self.client.instances['laboratorio', 'lab-db']['snapshots'][0]['created_at'] = '2030-01-01T00:00:00Z'
        self.assertEqual(self.read()[0]['description'], '')

    def test_validation_and_disk_failure_happen_before_snapshot_post(self):
        for description in (None, [], 'x' * 1025):
            with self.assertRaises(PanelError):
                self.act('snapshot', name='invalid', description=description)
        with patch('incus_panel.snapshots.os.replace', side_effect=OSError('disk full')):
            with self.assertRaisesRegex(PanelError, 'salvar os metadados'):
                self.act('snapshot', name='disk-full')
        self.assertEqual(self.read(), [])
        self.assertEqual(list(self.metadata_path.parent.glob('snapshots.json.*')), [])

    def test_url_list_with_project_query_is_normalized_for_collision_detection(self):
        self.assertEqual(artifact_name('/1.0/instances/lab-db/snapshots/before?project=laboratorio'), 'before')
        original = self.client.request
        def request(method, path, project, body=None, **kwargs):
            if method == 'GET' and path.endswith('/snapshots'):
                return {'type': 'sync', 'metadata': ['/1.0/instances/lab-db/snapshots/before?project=laboratorio']}
            return original(method, path, project, body, **kwargs)
        with patch.object(self.client, 'request', side_effect=request):
            self.assertEqual(self.read()[0]['name'], 'before')
            with self.assertRaisesRegex(PanelError, 'Já existe'):
                self.act('snapshot', name='before')

    def test_application_uses_writable_state_directory_for_annotations(self):
        app = Application(self.config, {'demo': self.client}, self.metadata_path.with_name('users.json'))
        self.assertEqual(app.service.snapshot_metadata.path, self.metadata_path)


if __name__ == '__main__':
    unittest.main()
