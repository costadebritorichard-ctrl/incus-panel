import os
import unittest
from unittest.mock import Mock, patch


@unittest.skipUnless(os.name == 'posix', 'Instalador exclusivo para Linux')
class InstallerNetwork(unittest.TestCase):
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
            run.assert_called_once_with(['incus', 'profile', 'device', 'add', 'default', 'eth0', 'nic', 'network=labbr0', 'name=eth0'])

    def test_unmanaged_network_name_is_not_overwritten(self):
        from deploy.install import ensure_default_network
        query = Mock(side_effect=[{'devices': {}}, [{'name': 'panelbr0', 'managed': False, 'type': 'bridge'}]])
        with patch('deploy.install.run') as run:
            ensure_default_network(query)
        self.assertEqual(run.call_args_list[0].args[0], ['incus', 'network', 'create', 'panelbr1', 'ipv4.address=auto', 'ipv4.nat=true', 'ipv6.address=none'])
        self.assertIn('network=panelbr1', run.call_args_list[1].args[0])
