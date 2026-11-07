"""Contracts for the real Incus operations exposed by resource context menus."""
import copy
import unittest
from unittest.mock import patch

from incus_panel.core import PanelError, Service
from incus_panel.server import demo_config


class ContextActions(unittest.TestCase):
    def setUp(self):
        self.config = demo_config()
        self.config['manage_all_instances'] = True
        self.user = {'username': 'admin', 'role': 'administrador', 'host_metrics': True,
                     'scopes': {'demo': ['laboratorio']}}
        self.service = Service(self.config)
        self.client = self.service.hosts['demo']

    def act(self, action, target='lab-web', **body):
        return self.service.mutate(self.user, 'demo', 'laboratorio', action, target,
                                   {'confirmation': 'demo/laboratorio/' + target, **body})

    def test_graceful_shutdown_and_immediate_stop_are_distinct(self):
        with patch.object(self.client, 'request', wraps=self.client.request) as request:
            self.act('stop', force=True)
            request.assert_any_call('PUT', '/1.0/instances/lab-web/state', 'laboratorio',
                                    {'action': 'stop', 'timeout': 30, 'force': False})
            self.act('start')
            self.act('force-stop')
            request.assert_any_call('PUT', '/1.0/instances/lab-web/state', 'laboratorio',
                                    {'action': 'stop', 'timeout': 0, 'force': True})
        self.assertEqual(self.client.instances['redes', 'lab-web']['status'], 'Running')

    def test_freeze_resume_and_stop_frozen_container(self):
        self.act('freeze')
        self.assertEqual(self.client.instances['laboratorio', 'lab-web']['status'], 'Frozen')
        for action in ('start', 'stop', 'restart', 'freeze'):
            with self.subTest(action=action), self.assertRaises(PanelError) as error:
                self.act(action)
            self.assertEqual(error.exception.status, 409)
        self.act('unfreeze')
        self.assertEqual(self.client.instances['laboratorio', 'lab-web']['status'], 'Running')
        self.act('freeze')
        self.act('force-stop')
        self.assertEqual(self.client.instances['laboratorio', 'lab-web']['status'], 'Stopped')

    def test_incompatible_state_never_sends_a_write(self):
        for action in ('stop', 'restart', 'force-stop', 'freeze'):
            with self.subTest(action=action), patch.object(self.client, 'request', wraps=self.client.request) as request:
                with self.assertRaises(PanelError):
                    self.act(action, 'lab-db')
                self.assertTrue(all(call.args[0] == 'GET' for call in request.call_args_list))

    def test_clone_copies_configuration_but_has_new_identity_and_stays_stopped(self):
        original = self.client.instances['laboratorio', 'lab-web']
        original['config'].update({'boot.autostart': 'true', 'volatile.eth0.hwaddr': '00:11:22:33:44:55'})
        before = copy.deepcopy(original)
        with patch.object(self.client, 'request', wraps=self.client.request) as request:
            operation = self.act('clone', name='copy-web')
            payload = next(call.args[3] for call in request.call_args_list if call.args[:2] == ('POST', '/1.0/instances'))
        self.assertEqual(payload['source'], {'type': 'copy', 'source': 'lab-web', 'project': 'laboratorio', 'live': False, 'instance_only': True})
        self.assertFalse(payload['ephemeral'])
        self.assertNotIn('volatile.eth0.hwaddr', payload['config'])
        clone = self.client.instances['laboratorio', 'copy-web']
        self.assertEqual(clone['status'], 'Stopped')
        self.assertEqual(clone['config']['limits.memory'], original['config']['limits.memory'])
        self.assertEqual(clone['config']['boot.autostart'], 'false')
        self.assertEqual(original, before)
        self.assertIn('operation', operation)
        self.assertEqual(self.service.audit[-1]['destination'], 'copy-web')
        self.assertNotIn(('redes', 'copy-web'), self.client.instances)

    def test_clone_snapshots_are_explicit_and_destination_collisions_do_not_overwrite(self):
        self.act('snapshot', name='before')
        self.act('clone', name='copy-with-snapshot', include_snapshots=True)
        self.assertEqual(self.client.instances['laboratorio', 'copy-with-snapshot']['snapshots'][0]['name'], 'copy-with-snapshot/before')
        with self.assertRaises(PanelError) as error:
            self.act('clone', name='lab-db')
        self.assertEqual(error.exception.status, 409)
        for invalid in ('../bad', 'copy_name', '-copy', 'copy-', 'x' * 64):
            with self.subTest(name=invalid), self.assertRaises(PanelError):
                self.act('clone', name=invalid)
        with self.assertRaises(PanelError):
            self.act('clone', name='copy-bad-option', include_snapshots='true')

    def test_restricted_clone_checks_both_source_and_destination(self):
        self.config['manage_all_instances'] = False
        with self.assertRaises(PanelError) as error:
            self.act('clone', name='outside-allowlist')
        self.assertEqual(error.exception.status, 403)
        self.act('clone', name='lab-novo')
        self.config['mutable_instances']['demo']['laboratorio'].remove('lab-web')
        with self.assertRaises(PanelError):
            self.act('clone', name='lab-novo')

    def test_template_publishes_private_image_from_stopped_container(self):
        self.act('stop')
        before = copy.deepcopy(self.client.instances['laboratorio', 'lab-web'])
        with patch.object(self.client, 'request', wraps=self.client.request) as request:
            self.act('template', name='web-model')
            request.assert_any_call('POST', '/1.0/images', 'laboratorio', {
                'source': {'type': 'instance', 'name': 'lab-web'}, 'public': False,
                'aliases': [{'name': 'web-model'}], 'properties': {'description': 'web-model'}})
        image = next(image for image in self.client.images['laboratorio'] if image['aliases'][0]['name'] == 'web-model')
        self.assertFalse(image['public'])
        self.assertEqual(self.client.instances['laboratorio', 'lab-web'], before)
        choices = self.service.read(self.user, 'demo', 'laboratorio', 'creation-images')['images']
        self.assertTrue(any(choice['image'] == image['fingerprint'] for choice in choices))
        with self.assertRaises(PanelError) as error:
            self.act('template', name='web-model')
        self.assertEqual(error.exception.status, 409)

    def test_template_requires_shutdown_and_admin(self):
        with self.assertRaises(PanelError) as error:
            self.act('template', name='running-model')
        self.assertEqual(error.exception.status, 409)
        self.user['role'] = 'operador'
        for action in ('clone', 'template'):
            with self.subTest(action=action), self.assertRaises(PanelError) as error:
                self.act(action, 'lab-db', name='new-copy')
            self.assertEqual(error.exception.status, 403)

    def test_new_actions_enforce_confirmation_read_only_and_scope(self):
        for action in ('clone', 'template', 'force-stop', 'freeze', 'unfreeze'):
            with self.subTest(action=action):
                with self.assertRaises(PanelError) as error:
                    self.act(action, confirmation='different/container', name='new-copy')
                self.assertEqual(error.exception.status, 400)
                self.config['read_only'] = True
                with self.assertRaises(PanelError) as error:
                    self.act(action, name='new-copy')
                self.assertEqual(error.exception.status, 403)
                self.config['read_only'] = False
                with self.assertRaises(PanelError):
                    self.service.mutate(self.user, 'demo', 'redes', action, 'lab-web', {})


if __name__ == '__main__':
    unittest.main()
