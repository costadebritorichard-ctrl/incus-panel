import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from deploy.preflight import PreflightError, apply_idmaps_to_incus, check_environment, check_idmaps, covers, prepare_idmaps, free_range, run_preflight


class HostPrerequisites(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.proc = self.root / 'proc'
        self.etc = self.root / 'etc'
        self.proc.mkdir()
        self.etc.mkdir()
        (self.etc / 'passwd').write_text('root:x:0:0:root:/root:/bin/sh\n')
        (self.etc / 'group').write_text('root:x:0:\n')

    def configure(self, uid_map, gid_map=None, subuid=None, subgid=None):
        (self.proc / 'uid_map').write_text(uid_map)
        (self.proc / 'gid_map').write_text(gid_map or uid_map)
        for filename, value in [('subuid', subuid), ('subgid', subgid)]:
            if value is not None:
                (self.etc / filename).write_text(value)

    def test_full_vm_without_subid_files_can_continue(self):
        self.configure('0 0 4294967295\n')
        check_idmaps(self.proc, self.etc)

    def test_reported_billion_delegated_ids_can_prepare_missing_root(self):
        self.configure('0 100000 1000000000\n')
        with patch('deploy.preflight.subprocess.run') as run, patch('builtins.print'):
            self.assertTrue(prepare_idmaps(self.proc, self.etc))
        self.assertEqual(run.call_args.args[0], ['usermod', '--add-subuids', '1000000-10999999',
                                               '--add-subgids', '1000000-10999999', 'root'])

    def test_prepare_avoids_other_users_ranges_and_account_ids(self):
        self.configure('0 100000 1000000000\n', subuid='aluno:1000000:20000000\n')
        (self.etc / 'passwd').write_text('root:x:0:0:root:/root:/bin/sh\nspecial:x:21000000:0::/:/bin/sh\n')
        with patch('deploy.preflight.subprocess.run') as run, patch('builtins.print'):
            prepare_idmaps(self.proc, self.etc)
        self.assertIn('21000001-31000000', run.call_args.args[0])
        self.assertEqual((self.etc / 'subuid').read_text(), 'aluno:1000000:20000000\n')

    def test_prepare_is_noop_when_root_is_already_configured(self):
        self.configure('0 100000 1000000000\n', subuid='root:1000000:10000000\n', subgid='root:1000000:10000000\n')
        pending = self.root / 'run/idmaps-pending'
        with patch('deploy.preflight.subprocess.run') as run:
            self.assertFalse(prepare_idmaps(self.proc, self.etc, pending_restart=pending))
        run.assert_not_called()
        self.assertFalse(pending.exists())

    def test_automatic_preparation_applies_ranges_once_and_is_idempotent(self):
        self.configure('0 100000 1000000000\n')
        pending = self.root / 'run/idmaps-pending'
        commands = []
        def command(arguments, **kwargs):
            commands.append(arguments)
            if arguments[0] == 'usermod':
                self.assertTrue(pending.exists())
                for option, filename in (('--add-subuids', 'subuid'), ('--add-subgids', 'subgid')):
                    start, end = map(int, arguments[arguments.index(option) + 1].split('-'))
                    (self.etc / filename).write_text(f'root:{start}:{end - start + 1}\n')
            return Mock(returncode=0, stdout='loaded\n', stderr='')
        def prepare(**kwargs):
            return prepare_idmaps(self.proc, self.etc, **kwargs)
        with patch('deploy.preflight.sys.platform', 'linux'), \
             patch('deploy.preflight.os.geteuid', return_value=0, create=True), \
             patch('deploy.preflight.PENDING_IDMAP_RESTART', pending), \
             patch('deploy.preflight.prepare_idmaps', side_effect=prepare), \
             patch('deploy.preflight.check_environment', side_effect=lambda: check_idmaps(self.proc, self.etc)), \
             patch('deploy.preflight.check_install_memory', return_value={}), \
             patch('deploy.preflight.subprocess.run', side_effect=command), patch('builtins.print'):
            run_preflight(prepare=True, restart_incus=True)
            first_commands = list(commands)
            run_preflight(prepare=True, restart_incus=True)
        self.assertFalse(pending.exists())
        self.assertEqual(commands, first_commands)
        self.assertEqual([entry[0] for entry in commands], ['usermod', 'systemctl', 'systemctl'])
        self.assertEqual(commands[-1], ['systemctl', 'try-restart', 'incus.service'])
        check_idmaps(self.proc, self.etc)

    def test_fresh_installation_does_not_restart_missing_incus_service(self):
        pending = self.root / 'idmaps-pending'
        pending.touch()
        with patch('deploy.preflight.subprocess.run', return_value=Mock(returncode=0, stdout='not-found\n')) as run:
            apply_idmaps_to_incus(pending)
        self.assertEqual(run.call_count, 1)
        self.assertFalse(pending.exists())

    def test_failed_incus_restart_is_retried_without_reallocating_ids(self):
        pending = self.root / 'idmaps-pending'
        pending.touch()
        with patch('deploy.preflight.subprocess.run', side_effect=[
            Mock(returncode=0, stdout='loaded\n'),
            subprocess.CalledProcessError(1, ['systemctl'], stderr='reinício recusado'),
            Mock(returncode=0, stdout='loaded\n'),
            Mock(returncode=0),
        ]) as run, patch('builtins.print'):
            with self.assertRaisesRegex(PreflightError, 'reinício recusado'):
                apply_idmaps_to_incus(pending)
            self.assertTrue(pending.exists())
            apply_idmaps_to_incus(pending)
        self.assertFalse(pending.exists())
        self.assertEqual(run.call_count, 4)

    def test_read_only_preflight_never_prepares_ids_or_restarts_services(self):
        with patch('deploy.preflight.check_environment'), \
             patch('deploy.preflight.check_install_memory', return_value={}), \
             patch('deploy.preflight.prepare_idmaps') as prepare, \
             patch('deploy.preflight.apply_idmaps_to_incus') as restart:
            run_preflight()
        prepare.assert_not_called()
        restart.assert_not_called()

    def test_failed_environment_validation_never_restarts_incus(self):
        with patch('deploy.preflight.sys.platform', 'linux'), \
             patch('deploy.preflight.os.geteuid', return_value=0, create=True), \
             patch('deploy.preflight.check_install_memory', return_value={}), \
             patch('deploy.preflight.prepare_idmaps'), \
             patch('deploy.preflight.check_environment', side_effect=PreflightError('namespaces recusados')), \
             patch('deploy.preflight.apply_idmaps_to_incus') as restart:
            with self.assertRaisesRegex(PreflightError, 'namespaces recusados'):
                run_preflight(prepare=True, restart_incus=True)
        restart.assert_not_called()

    def test_low_memory_never_allocates_ids(self):
        with patch('deploy.preflight.sys.platform', 'linux'), \
             patch('deploy.preflight.os.geteuid', return_value=0, create=True), \
             patch('deploy.preflight.check_install_memory', side_effect=PreflightError('Memória insuficiente')), \
             patch('deploy.preflight.prepare_idmaps') as prepare:
            with self.assertRaisesRegex(PreflightError, 'Memória insuficiente'):
                run_preflight(prepare=True, restart_incus=True)
        prepare.assert_not_called()

    def test_failed_pending_restart_record_never_changes_id_allocations(self):
        self.configure('0 100000 1000000000\n')
        (self.root / 'not-a-directory').write_text('fixture')
        with patch('deploy.preflight.subprocess.run') as run:
            with self.assertRaisesRegex(PreflightError, 'registrar a aplicação pendente'):
                prepare_idmaps(self.proc, self.etc, self.root / 'not-a-directory/pending')
        run.assert_not_called()

    def test_prepare_refuses_invalid_existing_root_without_changing_either_file(self):
        self.configure('0 100000 1000000000\n', subgid='root:1000000:1000000000\n')
        with patch('deploy.preflight.subprocess.run') as run:
            with self.assertRaisesRegex(PreflightError, 'preservada'):
                prepare_idmaps(self.proc, self.etc)
        run.assert_not_called()

    def test_prepare_does_not_conjure_ids_in_restricted_lxc(self):
        with self.assertRaisesRegex(PreflightError, 'Não há faixa livre'):
            free_range([(0, 65536)], [])

    def test_prepare_checks_both_uid_and_gid_before_mutating(self):
        self.configure('0 100000 1000000000\n', '0 100000 65536\n')
        with patch('deploy.preflight.subprocess.run') as run:
            with self.assertRaises(PreflightError):
                prepare_idmaps(self.proc, self.etc)
        run.assert_not_called()

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
