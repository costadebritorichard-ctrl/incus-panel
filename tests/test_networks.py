import unittest
from types import SimpleNamespace
from unittest.mock import patch

from incus_panel.core import Demo, Incus, PanelError, Service
from incus_panel.server import Application, demo_config


class NetworkManagementTests(unittest.TestCase):
    def setUp(self):
        self.config = demo_config()
        self.config.update(read_only=False, manage_networks=True, manage_all_instances=True)
        self.client = Demo()
        self.service = Service(self.config, {'demo': self.client})
        self.user = {'username': 'admin', 'role': 'administrador',
                     'scopes': {'demo': ['laboratorio']}, 'host_metrics': True}

    def action(self, action, target, **fields):
        body = {'host': 'demo', 'project': 'laboratorio', 'action': action,
                'target': target, 'confirmation': f'demo/laboratorio/{target}', 'name': '', **fields}
        return self.service.mutate(self.user, 'demo', 'laboratorio', action, target, body)

    def test_create_and_read_managed_bridge(self):
        result = self.action('network-create', 'bridge-test', config={
            'ipv4.address': '10.110.0.1/24', 'ipv4.dhcp': 'true', 'ipv4.nat': 'true',
            'ipv6.address': 'none', 'ipv6.dhcp': 'false', 'ipv6.nat': 'false'})
        self.assertEqual(len(result['operation']), 36)
        network = self.service.read(self.user, 'demo', 'laboratorio', 'network', 'bridge-test')
        self.assertEqual(network['name'], 'bridge-test')
        self.assertEqual(network['type'], 'bridge')
        self.assertEqual(network['config']['ipv4.address'], '10.110.0.1/24')

    def test_create_rejects_duplicate_name(self):
        with self.assertRaisesRegex(PanelError, 'já existe') as error:
            self.action('network-create', 'labbr0', config={})
        self.assertEqual(error.exception.status, 409)

    def test_update_preserves_unedited_options(self):
        result = self.action('network-update', 'labbr0', config={'ipv4.nat': 'false'})
        self.assertEqual(len(result['operation']), 36)
        current = self.service.read(self.user, 'demo', 'laboratorio', 'network', 'labbr0')
        self.assertEqual(current['config']['ipv4.nat'], 'false')
        self.assertEqual(current['config']['ipv4.address'], '10.100.0.1/24')

    def test_stale_bridge_revision_rejects_overwrite(self):
        original = self.client.request

        def change_before_write(method, path, project, body=None, etag=None):
            if method == 'PUT':
                self.client.networks[project][0]['config']['ipv4.nat'] = 'false'
            return original(method, path, project, body, etag)

        with patch.object(self.client, 'request', side_effect=change_before_write):
            with self.assertRaisesRegex(PanelError, 'recarregue') as error:
                self.action('network-update', 'labbr0', config={'ipv4.nat': 'true'})
        self.assertEqual(error.exception.status, 412)
        self.assertEqual(self.client.networks['laboratorio'][0]['config']['ipv4.nat'], 'false')

    def test_delete_checks_profiles_and_containers_before_calling_incus(self):
        with self.assertRaisesRegex(PanelError, 'Bridge em uso') as error:
            self.action('network-delete', 'labbr0')
        self.assertEqual(error.exception.status, 409)
        self.assertIn('profile: default', str(error.exception))
        self.assertTrue(any(item['name'] == 'labbr0' for item in self.client.networks['laboratorio']))

    def test_create_and_delete_unused_bridge(self):
        self.action('network-create', 'bridge-test', config={})
        self.action('network-delete', 'bridge-test')
        self.assertFalse(any(item['name'] == 'bridge-test' for item in self.client.networks['laboratorio']))

    def test_create_empty_bridge_and_attach_existing_container(self):
        self.action('network-create', 'emptybr', config={'ipv4.address': 'none', 'ipv4.dhcp': 'false',
                    'ipv4.nat': 'false', 'ipv6.address': 'none', 'ipv6.dhcp': 'false', 'ipv6.nat': 'false'})
        bridge = self.service.read(self.user, 'demo', 'laboratorio', 'network', 'emptybr')
        self.assertEqual(bridge['config']['ipv4.address'], 'none')
        self.assertEqual(bridge['config']['ipv4.dhcp'], 'false')
        instance = self.service.read(self.user, 'demo', 'laboratorio', 'instance', 'lab-web')
        self.service.mutate(self.user, 'demo', 'laboratorio', 'nic-update', 'lab-web', {
            'confirmation': 'demo/laboratorio/lab-web', 'device': 'eth0',
            'revision': instance['_devices_revision'], 'nic': {'network': 'emptybr'}})
        self.assertEqual(self.service.read(self.user, 'demo', 'laboratorio', 'instance', 'lab-web')['devices']['eth0']['network'], 'emptybr')
        with self.assertRaisesRegex(PanelError, 'Bridge em uso'):
            self.action('network-delete', 'emptybr')

    def test_physical_or_external_bridges_cannot_be_modified(self):
        self.client.networks['laboratorio'].append({
            'name': 'end0', 'type': 'physical', 'managed': False, 'status': 'Created', 'config': {}})
        with self.assertRaisesRegex(PanelError, 'gerenciadas'):
            self.action('network-delete', 'end0')
        self.client.networks['laboratorio'].append({
            'name': 'bridge-uplink', 'type': 'bridge', 'managed': True, 'status': 'Created',
            'config': {'bridge.external_interfaces': 'end0'}})
        with self.assertRaisesRegex(PanelError, 'interfaces externas'):
            self.action('network-update', 'bridge-uplink', config={'ipv4.nat': 'false'})

    def test_network_management_requires_explicit_capability(self):
        self.config['manage_networks'] = False
        with self.assertRaisesRegex(PanelError, 'manage_networks') as error:
            self.action('network-create', 'bridge-test', config={})
        self.assertEqual(error.exception.status, 403)

    def test_only_admin_can_manage_networks(self):
        self.user['role'] = 'operador'
        with self.assertRaisesRegex(PanelError, 'administrador'):
            self.action('network-create', 'bridge-test', config={})

    def test_public_session_exposes_network_management_to_admin_only(self):
        app = Application(self.config, {'demo': self.client})
        session = {'user': {**self.user, 'role': 'administrador'}, 'csrf': 'x', 'expires': 1}
        self.assertTrue(app.public_session(session)['manage_networks'])
        session['user']['role'] = 'observador'
        self.assertFalse(app.public_session(session)['manage_networks'])

    def test_network_management_requires_writable_valid_configuration(self):
        invalid = demo_config()
        invalid['manage_networks'] = 'true'
        with self.assertRaisesRegex(ValueError, 'true ou false'):
            Application.validate(invalid)
        invalid = demo_config()
        invalid.update(read_only=True, manage_networks=True)
        with self.assertRaisesRegex(ValueError, 'read_only'):
            Application.validate(invalid)

    def test_bridge_rejects_nonempty_name_field_from_generic_action_form(self):
        with self.assertRaisesRegex(PanelError, 'Campos extras'):
            self.action('network-create', 'bridge-test', name='unauthorized-name', config={})

    def test_bridge_config_rejects_physical_options_and_invalid_cidr(self):
        for config in ({'bridge.external_interfaces': 'end0'}, {'ipv4.address': 'not-a-cidr'}):
            with self.subTest(config=config), self.assertRaises(PanelError):
                self.action('network-create', 'bridge-test', config=config)

    def test_duplicate_snapshot_is_rejected_before_post(self):
        self.client.instances['laboratorio', 'lab-web']['snapshots'].append(
            {'name': 'lab-web/existing'})
        before = len(self.client.operations)
        body = {'confirmation': 'demo/laboratorio/lab-web', 'name': 'existing'}
        with self.assertRaisesRegex(PanelError, 'Já existe um snapshot') as error:
            self.service.mutate(self.user, 'demo', 'laboratorio', 'snapshot', 'lab-web', body)
        self.assertEqual(error.exception.status, 409)
        self.assertEqual(len(self.client.operations), before)

    def test_snapshot_create_list_delete_round_trip(self):
        body = {'confirmation': 'demo/laboratorio/lab-web', 'name': 'roundtrip'}
        created = self.service.mutate(self.user, 'demo', 'laboratorio', 'snapshot', 'lab-web', body)
        self.assertEqual(len(created['operation']), 36)
        self.assertEqual(self.service.read(self.user, 'demo', 'laboratorio', 'snapshots', 'lab-web')[0]['name'], 'roundtrip')
        deleted = self.service.mutate(self.user, 'demo', 'laboratorio', 'snapshot-delete', 'lab-web', {
            'confirmation': 'demo/laboratorio/lab-web/roundtrip', 'snapshot': 'roundtrip'})
        self.assertEqual(len(deleted['operation']), 36)
        self.assertEqual(self.service.read(self.user, 'demo', 'laboratorio', 'snapshots', 'lab-web'), [])

    def test_incus_conflict_preserves_original_database_error(self):
        certificate = b'fixture peer certificate'
        response = SimpleNamespace(status=409, read=lambda _limit: (
            b'{"type":"error","error":"UNIQUE constraint failed: '
            b'instances_snapshots.instance_id, instances_snapshots.name"}'))

        class FakeConnection:
            def __init__(self, *_args, **_kwargs):
                self.sock = SimpleNamespace(getpeercert=lambda binary_form: certificate)

            def connect(self):
                pass

            def request(self, *_args, **_kwargs):
                pass

            def getresponse(self):
                return response

            def close(self):
                pass

        client = Incus.__new__(Incus)
        client.url = SimpleNamespace(hostname='incus.test', port=8443)
        client.context = None
        from hashlib import sha256
        client.fingerprint = sha256(certificate).hexdigest()
        with patch('incus_panel.core.http.client.HTTPSConnection', FakeConnection):
            with self.assertRaisesRegex(PanelError, 'UNIQUE constraint failed') as error:
                client.request('POST', '/1.0/instances/test/snapshots', 'default', {'name': 'used'})
        self.assertEqual(error.exception.status, 409)


if __name__ == '__main__':
    unittest.main()
