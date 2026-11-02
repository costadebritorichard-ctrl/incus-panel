import unittest
from unittest.mock import Mock, patch


class InstallerListener(unittest.TestCase):
    def setUp(self):
        self.config = {'origin': 'https://192.168.1.10:8444', 'listen_host': '192.168.1.10',
                       'read_only': False, 'manage_all_instances': True,
                       'hosts': [{'transport': 'unix'}], 'users': [{'password_hash': 'preserved'}],
                       'tls_certificate': '/etc/incus-panel/server.crt'}

    def test_upgrade_and_repeat_preserve_credentials_and_certificate(self):
        from deploy.install import network_config
        upgraded = network_config(self.config, '192.168.1.10', 8444)
        self.assertEqual(upgraded, {**self.config, 'listen_host': '0.0.0.0'})
        self.assertEqual(network_config(upgraded, '192.168.1.10', 8444), upgraded)
        self.assertEqual(self.config['listen_host'], '192.168.1.10')

    def test_unrelated_config_is_not_overwritten(self):
        from deploy.install import network_config
        for changes in ({'read_only': True}, {'listen_host': '127.0.0.1'},
                        {'origin': 'https://other.test'}, {'manage_all_instances': False},
                        {'hosts': [{'transport': 'tls'}]}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                network_config({**self.config, **changes}, '192.168.1.10', 8444)

    def test_new_certificate_covers_all_current_ipv4_interfaces(self):
        from deploy.install import certificate_addresses
        response = Mock(stdout=b'''[{"addr_info":[{"family":"inet","local":"127.0.0.1"}]},
            {"addr_info":[{"family":"inet","local":"192.168.1.10"}]},
            {"addr_info":[{"family":"inet","local":"10.1.0.2"}]}, {"addr_info":[]}]''')
        with patch('deploy.install.run', return_value=response):
            self.assertEqual(certificate_addresses('192.168.1.10'), ['10.1.0.2', '127.0.0.1', '192.168.1.10'])


class InstallerNetwork(unittest.TestCase):
    def test_null_storage_collection_creates_dir_pool(self):
        from deploy.install import ensure_default_storage
        query = Mock(side_effect=[None, {'devices': {}}])
        with patch('deploy.install.run') as run:
            ensure_default_storage(query)
        self.assertEqual(run.call_args_list[0].args[0], ['incus', 'storage', 'create', 'local:panel-dir', 'dir'])
        self.assertEqual(run.call_count, 2)

    def test_null_network_collection_creates_bridge(self):
        from deploy.install import ensure_default_network
        query = Mock(side_effect=[{'devices': {}}, None])
        with patch('deploy.install.run') as run:
            ensure_default_network(query)
        self.assertEqual(run.call_args_list[0].args[0], ['incus', 'network', 'create', 'local:panelbr0', 'ipv4.address=auto', 'ipv4.nat=true', 'ipv6.address=none'])
        self.assertEqual(run.call_count, 2)

    def test_invalid_collection_does_not_modify_incus(self):
        from deploy.install import ensure_default_storage
        query = Mock(return_value={'unexpected': 'response'})
        with patch('deploy.install.run') as run, self.assertRaisesRegex(RuntimeError, 'esperada uma lista'):
            ensure_default_storage(query)
        run.assert_not_called()

    def test_fresh_storage_uses_dir_without_formatting_disks(self):
        from deploy.install import ensure_default_storage
        query = Mock(side_effect=[[], {'devices': {}}])
        with patch('deploy.install.run') as run:
            ensure_default_storage(query)
        self.assertEqual(run.call_args_list[0].args[0], ['incus', 'storage', 'create', 'local:panel-dir', 'dir'])
        self.assertEqual(run.call_args_list[1].args[0], ['incus', 'profile', 'device', 'add', 'local:default', 'panelroot0', 'disk', 'path=/', 'pool=panel-dir'])

    def test_existing_root_device_is_preserved(self):
        from deploy.install import ensure_default_storage
        query = Mock(side_effect=[[{'name': 'existing', 'status': 'Created'}], {'devices': {'root': {'type': 'disk', 'path': '/', 'pool': 'existing'}}}])
        with patch('deploy.install.run') as run:
            ensure_default_storage(query)
            run.assert_not_called()

    def test_unavailable_pool_does_not_create_another(self):
        from deploy.install import ensure_default_storage
        query = Mock(side_effect=[[{'name': 'broken', 'status': 'Unavailable'}], {'devices': {}}])
        with patch('deploy.install.run') as run, self.assertRaises(RuntimeError):
            ensure_default_storage(query)
        run.assert_not_called()

    def test_existing_nic_is_preserved(self):
        from deploy.install import ensure_default_network
        query = Mock(return_value={'devices': {'custom': {'type': 'nic', 'parent': 'eth0'}}})
        with patch('deploy.install.run') as run:
            ensure_default_network(query)
            run.assert_not_called()
        query.assert_called_once_with('/1.0/profiles/default')

    def test_existing_bridge_is_reused_without_new_network(self):
        from deploy.install import ensure_default_network
        query = Mock(side_effect=[{'devices': {}}, [{'name': 'labbr0', 'managed': True, 'type': 'bridge', 'status': 'Created'}]])
        with patch('deploy.install.run') as run:
            ensure_default_network(query)
            run.assert_called_once_with(['incus', 'profile', 'device', 'add', 'local:default', 'eth0', 'nic', 'network=labbr0', 'name=eth0'])

    def test_unmanaged_network_name_is_not_overwritten(self):
        from deploy.install import ensure_default_network
        query = Mock(side_effect=[{'devices': {}}, [{'name': 'panelbr0', 'managed': False, 'type': 'bridge'}]])
        with patch('deploy.install.run') as run:
            ensure_default_network(query)
        self.assertEqual(run.call_args_list[0].args[0], ['incus', 'network', 'create', 'local:panelbr1', 'ipv4.address=auto', 'ipv4.nat=true', 'ipv6.address=none'])
        self.assertIn('network=panelbr1', run.call_args_list[1].args[0])
