import copy
import unittest
from unittest.mock import patch

from incus_panel.core import Demo, PanelError, Service, bridge_config
from incus_panel.server import demo_config


class NetworkDevices(unittest.TestCase):
    def setUp(self):
        self.config = demo_config()
        self.config.update(manage_all_instances=True, manage_networks=True, read_only=False)
        self.client = Demo()
        self.service = Service(self.config, {'demo': self.client})
        self.user = {'username': 'admin', 'role': 'administrador', 'scopes': {'demo': ['laboratorio']}}

    def current(self):
        return self.service.read(self.user, 'demo', 'laboratorio', 'instance', 'lab-web')

    def change(self, action, device='eth0', **extra):
        body = {'confirmation': 'demo/laboratorio/lab-web', 'device': device,
                'revision': self.current()['_devices_revision'], **extra}
        return self.service.mutate(self.user, 'demo', 'laboratorio', action, 'lab-web', body)

    def test_override_restore_disable_and_restore_inherited_nic(self):
        before = self.current()
        self.change('nic-update', nic={'network': 'labbr0', 'name': 'eth0', 'limits.max': '20Mbit'})
        self.assertEqual(self.current()['devices']['eth0']['limits.max'], '20Mbit')
        self.assertEqual(self.current()['config'], before['config'])
        self.assertEqual(self.current()['profiles'], before['profiles'])
        self.change('nic-reset')
        self.assertNotIn('eth0', self.current()['devices'])
        self.change('nic-delete')
        self.assertEqual(self.current()['devices']['eth0'], {'type': 'none'})
        self.assertEqual(self.current()['expanded_devices']['eth0']['type'], 'none')
        self.change('nic-reset')
        self.assertEqual(self.current()['expanded_devices']['eth0']['network'], 'labbr0')

    def test_add_remove_local_and_preserve_unrelated_devices(self):
        original = copy.deepcopy(self.current()['expanded_devices'])
        self.change('nic-add', 'eth1', nic={'network': 'labbr0', 'name': 'eth1', 'vlan': '42'})
        self.change('nic-delete', 'eth1')
        self.assertEqual(self.current()['expanded_devices'], original)

    def test_invalid_nic_options_never_write(self):
        for value in ({'network': 'labbr0', 'parent': 'end0'}, {'network': 'labbr0', 'vlan': '4095'},
                      {'network': 'labbr0', 'ipv4.address': '192.0.2.5'}, {'network': 'labbr0', 'mtu': '10'},
                      {'network': 'labbr0', 'hwaddr': 'ff:ff:ff:ff:ff:ff'}, {'network': 'labbr0', 'limits.max': 'unlimited'}):
            with self.subTest(value=value), patch.object(self.client, 'request', wraps=self.client.request) as calls:
                with self.assertRaises(PanelError):
                    self.change('nic-update', nic=value)
                self.assertTrue(all(c.args[0] == 'GET' for c in calls.call_args_list))

    def test_stale_device_revision_and_authorization(self):
        old = self.current()['_devices_revision']
        self.change('nic-add', 'eth1', nic={'network': 'labbr0'})
        with self.assertRaisesRegex(PanelError, 'mudaram'):
            self.change('nic-delete', revision=old)
        for key, value in (('manage_networks', False), ('read_only', True)):
            previous = self.config[key]
            self.config[key] = value
            with self.assertRaises(PanelError):
                self.change('nic-delete')
            self.config[key] = previous

    def test_cidr_input_reserves_the_host_address_with_bridge_prefix(self):
        self.change('nic-update', nic={'network': 'labbr0', 'ipv4.address': '10.100.0.30/24'})
        self.assertEqual(self.current()['devices']['eth0']['ipv4.address'], '10.100.0.30')
        for address in ('10.100.0.31/16', '10.100.0.1/24', '10.100.0.0/24', '10.100.0.255/24'):
            with self.subTest(address=address), self.assertRaises(PanelError):
                self.change('nic-update', nic={'network': 'labbr0', 'ipv4.address': address})

    def test_disconnect_preserves_nic_and_mac_then_reconnects(self):
        self.client.instances['laboratorio', 'lab-web']['config']['volatile.eth0.hwaddr'] = '10:66:6a:11:22:33'
        before = self.current()
        self.change('nic-update', nic={'network': 'labbr0', 'name': 'eth0', 'ipv4.address': '10.100.0.30/24', 'disconnected': 'true'})
        current = self.current()
        self.assertEqual(current['devices']['eth0'], {'type': 'none'})
        self.assertEqual(current['_disconnected_nics']['eth0']['ipv4.address'], '10.100.0.30')
        self.assertEqual(current['_disconnected_nics']['eth0']['hwaddr'], '10:66:6a:11:22:33')
        self.assertEqual(current['profiles'], before['profiles'])
        self.change('nic-update', nic={'network': 'labbr0', 'disconnected': 'false'})
        current = self.current()
        self.assertEqual(current['devices']['eth0']['type'], 'nic')
        self.assertEqual(current['devices']['eth0']['ipv4.address'], '10.100.0.30')
        self.assertEqual(current['devices']['eth0']['hwaddr'], '10:66:6a:11:22:33')
        self.assertEqual(current['_disconnected_nics'], {})

    def test_profile_restore_and_removal_clear_saved_disconnected_options(self):
        for action in ('nic-reset', 'nic-delete'):
            self.change('nic-update', nic={'network': 'labbr0', 'disconnected': 'true'})
            self.assertIn('eth0', self.current()['_disconnected_nics'])
            self.change(action)
            self.assertEqual(self.current()['_disconnected_nics'], {})

    def test_mtu_uses_managed_parent_and_keeps_reservations_on_later_edits(self):
        self.change('nic-update', nic={'network': 'labbr0', 'ipv4.address': '10.100.0.30/24', 'mtu': '1400'})
        device = self.current()['devices']['eth0']
        self.assertEqual((device['parent'], device['nictype'], device['mtu']), ('labbr0', 'bridged', '1400'))
        self.assertNotIn('network', device)
        self.change('nic-update', nic={'network': 'labbr0', 'limits.max': '20Mbit'})
        self.assertEqual(self.current()['devices']['eth0']['ipv4.address'], '10.100.0.30')
        self.assertEqual(self.current()['devices']['eth0']['mtu'], '1400')
        self.change('nic-update', nic={'network': 'labbr0', 'mtu': ''})
        device = self.current()['devices']['eth0']
        self.assertEqual(device['network'], 'labbr0')
        self.assertNotIn('parent', device)

    def test_vlan_filter_conflict_and_invalid_disconnect_never_write(self):
        for nic in ({'network': 'labbr0', 'vlan': '42', 'security.ipv4_filtering': 'true'},
                    {'network': 'labbr0', 'vlan': '0'}, {'network': 'labbr0', 'disconnected': 'yes'},
                    {'network': 'labbr0', 'ipv4.address': 'none'}):
            with self.subTest(nic=nic), patch.object(self.client, 'request', wraps=self.client.request) as calls:
                with self.assertRaises(PanelError):
                    self.change('nic-update', nic=nic)
                self.assertTrue(all(call.args[0] == 'GET' for call in calls.call_args_list))

    def test_none_address_is_valid_only_with_family_filtering(self):
        self.change('nic-update', nic={'network': 'labbr0', 'ipv4.address': 'none', 'security.ipv4_filtering': 'true'})
        self.assertEqual(self.current()['devices']['eth0']['ipv4.address'], 'none')

    def test_disconnected_metadata_is_part_of_device_revision(self):
        from incus_panel.networking import DISCONNECTED_NICS
        revision = self.current()['_devices_revision']
        self.client.instances['laboratorio', 'lab-web']['config'][DISCONNECTED_NICS] = '{}'
        with self.assertRaisesRegex(PanelError, 'mudaram'):
            self.change('nic-update', revision=revision, nic={'network': 'labbr0'})

    def test_sync_ack_does_not_hide_loss_of_reconnect_metadata(self):
        from incus_panel.networking import DISCONNECTED_NICS
        original = self.client.request
        def lose_metadata(method, path, project, body=None, etag=None):
            if method == 'PUT':
                body = copy.deepcopy(body)
                body['config'].pop(DISCONNECTED_NICS, None)
            result = original(method, path, project, body, etag)
            return {'type': 'sync', 'metadata': {}} if method == 'PUT' else result
        with patch.object(self.client, 'request', side_effect=lose_metadata), self.assertRaises(PanelError):
            self.change('nic-update', nic={'network': 'labbr0', 'disconnected': 'true'})

    def test_dhcp_range_validation(self):
        valid = {'ipv4.address': '10.8.0.1/24', 'ipv4.dhcp.ranges': '10.8.0.10-10.8.0.99', 'bridge.mtu': '1500'}
        self.assertEqual(bridge_config(valid), valid)
        for ranges in ('10.9.0.10-10.9.0.99', '10.8.0.1-10.8.0.99', '10.8.0.99-10.8.0.10'):
            with self.assertRaises(PanelError):
                bridge_config({**valid, 'ipv4.dhcp.ranges': ranges})

    def test_sync_bridge_create_update_delete_are_verified_and_tracked(self):
        original = self.client.request
        def sync(method, path, project, body=None, etag=None):
            result = original(method, path, project, body, etag)
            return {'type': 'sync', 'metadata': {}} if method != 'GET' else result
        with patch.object(self.client, 'request', side_effect=sync):
            for action, config in (('network-create', {'ipv4.address': '10.80.0.1/24'}),
                                   ('network-update', {'bridge.mtu': '1400'}), ('network-delete', {})):
                result = self.service.mutate(self.user, 'demo', 'laboratorio', action, 'testbr',
                    {'confirmation': 'demo/laboratorio/testbr', 'config': config})
                task = self.service.read(self.user, 'demo', 'laboratorio', 'operation', result['operation'])
                self.assertEqual(task['status_code'], 200)

    def test_bridge_stale_form_revision(self):
        revision = self.service.read(self.user, 'demo', 'laboratorio', 'network', 'labbr0')['_revision']
        self.client.networks['laboratorio'][0]['description'] = 'Changed'
        with self.assertRaisesRegex(PanelError, 'mudou'):
            self.service.mutate(self.user, 'demo', 'laboratorio', 'network-update', 'labbr0',
                {'confirmation': 'demo/laboratorio/labbr0', 'revision': revision, 'config': {'ipv4.nat': 'false'}})

    def test_inconsistent_dhcp_and_domain_are_rejected(self):
        for config in (
                {'ipv4.address': 'none', 'ipv4.dhcp': 'true'},
                {'ipv4.address': 'none', 'ipv4.dhcp.ranges': '10.8.0.2-10.8.0.9'},
                {'ipv4.address': '10.8.0.1/24', 'ipv4.dhcp': 'false', 'ipv4.dhcp.ranges': '10.8.0.2-10.8.0.9'},
                {'ipv6.address': 'fd42::1/64', 'ipv6.dhcp.ranges': 'fd42::2-fd42::9'},
                {'ipv4.address': '10.8.0.1/24', 'ipv4.dhcp.ranges': '10.8.0.2-10.8.0.9,10.8.0.8-10.8.0.20'},
                {'dns.domain': 'lab..invalid'}, {'dns.domain': '-lab.invalid'}):
            with self.subTest(config=config), self.assertRaises(PanelError):
                bridge_config(config)

    def test_partial_dhcp_change_validates_against_current_configuration(self):
        self.client.networks['laboratorio'][0]['config'].update({
            'ipv6.address': 'fd42::1/64', 'ipv6.dhcp.stateful': 'true'})
        self.service.mutate(self.user, 'demo', 'laboratorio', 'network-update', 'labbr0', {
            'confirmation': 'demo/laboratorio/labbr0', 'config': {'ipv6.dhcp.ranges': 'fd42::2-fd42::9'}})

    def test_equivalent_ipv6_reservations_cannot_be_duplicated(self):
        self.client.networks['laboratorio'][0]['config'].update({
            'ipv6.address': 'fd42::1/64', 'ipv6.dhcp.stateful': 'true'})
        self.change('nic-add', 'eth1', nic={'network': 'labbr0', 'ipv6.address': 'fd42::10'})
        with self.assertRaisesRegex(PanelError, 'outra interface'):
            self.change('nic-add', 'eth2', nic={'network': 'labbr0', 'ipv6.address': 'fd42:0:0:0:0:0:0:10'})

    def test_bridge_name_obeys_linux_interface_limit_before_writing(self):
        with patch.object(self.client, 'request', wraps=self.client.request) as calls:
            with self.assertRaisesRegex(PanelError, '15 caracteres'):
                self.service.mutate(self.user, 'demo', 'laboratorio', 'network-create', 'bridge-name-too-long', {
                    'confirmation': 'demo/laboratorio/bridge-name-too-long'})
            self.assertTrue(all(call.args[0] == 'GET' for call in calls.call_args_list))

    def test_ignored_config_removal_is_not_reported_as_success(self):
        self.client.networks['laboratorio'][0]['config']['dns.domain'] = 'lab.invalid'
        original = self.client.request
        def ignore(method, path, project, body=None, etag=None):
            return {'type': 'sync', 'metadata': {}} if method == 'PUT' else original(method, path, project, body, etag)
        with patch.object(self.client, 'request', side_effect=ignore), self.assertRaises(PanelError):
            self.service.mutate(self.user, 'demo', 'laboratorio', 'network-update', 'labbr0', {
                'confirmation': 'demo/laboratorio/labbr0', 'config': {'dns.domain': ''}})

    def test_concurrent_device_change_is_not_overwritten(self):
        original = self.client.request
        def race(method, path, project, body=None, etag=None):
            if method == 'PUT':
                self.client.instances[project, 'lab-web']['devices']['eth9'] = {'type': 'nic', 'network': 'labbr0'}
            return original(method, path, project, body, etag)
        with patch.object(self.client, 'request', side_effect=race):
            with self.assertRaises(PanelError) as error:
                self.change('nic-update', nic={'network': 'labbr0'})
            self.assertEqual(error.exception.status, 412)
        self.assertIn('eth9', self.current()['devices'])

    def test_sync_network_ack_without_applying_is_not_success(self):
        original = self.client.request
        def ignore(method, path, project, body=None, etag=None):
            return {'type': 'sync', 'metadata': {}} if method == 'PUT' else original(method, path, project, body, etag)
        with patch.object(self.client, 'request', side_effect=ignore), self.assertRaises(PanelError):
            self.service.mutate(self.user, 'demo', 'laboratorio', 'network-update', 'labbr0',
                {'confirmation': 'demo/laboratorio/labbr0', 'config': {'bridge.mtu': '1400'}})
