import unittest
import subprocess
from unittest.mock import Mock, patch

from incus_panel.verify import diagnose, verify, wait


class RealVerification(unittest.TestCase):
    def test_diagnostics_only_read_local_target_and_are_bounded(self):
        with patch('incus_panel.verify.subprocess.run') as run, patch('builtins.print'):
            run.return_value = Mock(stdout='log', stderr='')
            diagnose('panel-check-test', 'default')
        self.assertEqual(run.call_args_list[0].args[0], ['incus', 'info', 'local:panel-check-test', '--project', 'default', '--show-log'])
        self.assertEqual(run.call_count, 3)
        self.assertTrue(all(call.kwargs['timeout'] == 15 for call in run.call_args_list))

    def test_diagnostics_continue_after_missing_command_or_timeout(self):
        with patch('incus_panel.verify.subprocess.run') as run, patch('builtins.print'):
            run.side_effect = [FileNotFoundError('incus'), subprocess.TimeoutExpired('virt', 15), Mock(stdout='kernel', stderr='')]
            diagnose('panel-check-test', 'default')
        self.assertEqual(run.call_count, 3)

    def test_demo_cannot_pass_as_real_host(self):
        with self.assertRaises(ValueError):
            verify({'demo': True, 'hosts': []})

    def test_failed_operation_is_not_reported_as_success(self):
        service = Mock()
        service.read.return_value = {'status_code': 400, 'err': 'kernel incompatível'}
        with self.assertRaisesRegex(RuntimeError, 'kernel incompatível'):
            wait(service, {}, 'local', 'default', 'operation')

    def test_pending_operation_is_polled_until_confirmed(self):
        service = Mock()
        service.read.side_effect = [{'status_code': 100}, {'status_code': 200}]
        with patch('incus_panel.verify.time.sleep'):
            self.assertEqual(wait(service, {}, 'local', 'default', 'operation')['status_code'], 200)
        self.assertEqual(service.read.call_count, 2)
