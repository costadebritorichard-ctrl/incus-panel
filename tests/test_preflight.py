import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from deploy.preflight import PreflightError, check_environment, check_idmaps, covers


class HostPrerequisites(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.proc = self.root / 'proc'
        self.etc = self.root / 'etc'
        self.proc.mkdir()
        self.etc.mkdir()

    def configure(self, uid_map, gid_map=None, subuid=None, subgid=None):
        (self.proc / 'uid_map').write_text(uid_map)
        (self.proc / 'gid_map').write_text(gid_map or uid_map)
        for filename, value in [('subuid', subuid), ('subgid', subgid)]:
            if value is not None:
                (self.etc / filename).write_text(value)

    def test_full_vm_without_subid_files_can_continue(self):
        self.configure('0 0 4294967295\n')
        check_idmaps(self.proc, self.etc)

    def test_lxc_cannot_map_the_billion_ids_from_reported_failure(self):
        self.configure('0 100000 65536\n', subuid='root:1000000:1000000000\n',
                       subgid='root:1000000:1000000000\n')
        with self.assertRaisesRegex(PreflightError, 'Mapeamento UID incompatível') as error:
            check_idmaps(self.proc, self.etc)
        self.assertIn('0-65535', str(error.exception))
        self.assertIn('1000000-1000999999', str(error.exception))
        self.assertIn('hospedeiro', str(error.exception))

    def test_lxc_with_delegated_subordinate_ids_can_continue(self):
        self.configure('0 100000 200000\n', subuid='root:65536:65536\n', subgid='0:65536:65536\n')
        check_idmaps(self.proc, self.etc)

    def test_parent_ids_are_not_available_inside_the_container(self):
        self.configure('0 1000000 65536\n', subuid='root:1000000:65536\n')
        with self.assertRaises(PreflightError):
            check_idmaps(self.proc, self.etc)

    def test_gid_is_checked_even_when_uid_is_valid(self):
        self.configure('0 100000 200000\n', '0 100000 65536\n',
                       'root:65536:65536\n', 'root:65536:65536\n')
        with self.assertRaisesRegex(PreflightError, 'Mapeamento GID incompatível'):
            check_idmaps(self.proc, self.etc)

    def test_missing_subid_allocation_is_actionable_in_limited_namespace(self):
        self.configure('0 100000 65536\n')
        with self.assertRaisesRegex(PreflightError, 'Faixas de root.*nenhuma'):
            check_idmaps(self.proc, self.etc)

    def test_gaps_in_id_map_are_not_counted_as_delegated(self):
        self.assertFalse(covers([(0, 1000), (2000, 70000)], 500, 66036))
        self.assertTrue(covers([(0, 1000), (1000, 70000)], 500, 66036))

    def test_malformed_maps_fail_with_diagnostic(self):
        self.configure('invalid\n')
        with self.assertRaisesRegex(PreflightError, 'Não foi possível verificar UID'):
            check_idmaps(self.proc, self.etc)

    def test_denied_namespace_has_host_guidance(self):
        with patch('deploy.preflight.sys.platform', 'linux'), \
             patch('deploy.preflight.os.geteuid', return_value=0, create=True), \
             patch('deploy.preflight.check_idmaps'), \
             patch('deploy.preflight.subprocess.run', return_value=Mock(returncode=1, stderr='Operation not permitted')):
            with self.assertRaisesRegex(PreflightError, 'recusou.*Operation not permitted'):
                check_environment()

    def test_idmap_failure_stops_before_namespace_probe(self):
        with patch('deploy.preflight.sys.platform', 'linux'), \
             patch('deploy.preflight.os.geteuid', return_value=0, create=True), \
             patch('deploy.preflight.check_idmaps', side_effect=PreflightError('UID incompatível')), \
             patch('deploy.preflight.subprocess.run') as run:
            with self.assertRaises(PreflightError):
                check_environment()
            run.assert_not_called()

    def test_namespace_probe_timeout_is_not_success(self):
        with patch('deploy.preflight.sys.platform', 'linux'), \
             patch('deploy.preflight.os.geteuid', return_value=0, create=True), \
             patch('deploy.preflight.check_idmaps'), \
             patch('deploy.preflight.subprocess.run', side_effect=subprocess.TimeoutExpired('unshare', 10)):
            with self.assertRaisesRegex(PreflightError, 'Não foi possível testar namespaces'):
                check_environment()
