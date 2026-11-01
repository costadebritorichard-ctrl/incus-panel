import unittest
from unittest.mock import Mock, patch


class InstallerNetwork(unittest.TestCase):
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
