import unittest
from unittest.mock import Mock, patch

from incus_panel.verify import verify, wait


class RealVerification(unittest.TestCase):
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
