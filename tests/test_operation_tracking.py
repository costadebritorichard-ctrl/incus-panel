"""Operation completion must survive the Incus five-second retention window."""
import copy
import unittest
from unittest.mock import Mock

from incus_panel.core import PanelError, Service
from incus_panel.server import demo_config


class OperationTracking(unittest.TestCase):
    def setUp(self):
        self.client = Mock(spec=['request', 'wait_operation'])
        self.service = Service(demo_config(), {'demo': self.client})
        self.user = {'username': 'admin', 'role': 'administrador',
                     'scopes': {'demo': ['laboratorio']}}
        self.operation = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb'

    def read(self, user=None, project='laboratorio'):
        return self.service.read(user or self.user, 'demo', project, 'operation', self.operation)

    def test_native_wait_captures_completion_before_incus_expires_it(self):
        self.client.wait_operation.return_value = {'id': self.operation, 'status': 'Success', 'status_code': 200}
        self.client.request.side_effect = PanelError(404, 'Incus: Operation not found')
        first = self.read()
        self.assertEqual(first['status_code'], 200)
        self.client.wait_operation.assert_called_once_with(self.operation, 'laboratorio')
        # The daemon no longer has the operation when details are reopened.
        self.client.wait_operation.side_effect = PanelError(404, 'Incus: Operation not found')
        first['status_code'] = 400
        self.assertEqual(self.read()['status_code'], 200)
        self.client.request.assert_not_called()

    def test_failure_preserves_original_error_after_operation_expiry(self):
        self.client.wait_operation.return_value = {'id': self.operation, 'status': 'Failure', 'status_code': 400,
                                                 'err': 'Failed shutting down instance: timeout'}
        result = self.read()
        self.client.wait_operation.side_effect = PanelError(404, 'Incus: Operation not found')
        self.assertEqual(self.read(), result)
        self.assertEqual(result['err'], 'Failed shutting down instance: timeout')

    def test_running_status_is_never_retained_as_terminal_result(self):
        self.client.wait_operation.side_effect = [
            {'id': self.operation, 'status_code': 103},
            {'id': self.operation, 'status_code': 200},
        ]
        self.assertEqual(self.read()['status_code'], 103)
        self.assertEqual(self.read()['status_code'], 200)
        self.assertEqual(self.client.wait_operation.call_count, 2)

    def test_missing_operation_is_not_inferred_success_from_instance_state(self):
        self.client.wait_operation.side_effect = PanelError(404, 'Incus: Operation not found')
        self.client.request.side_effect = PanelError(404, 'Incus: Operation not found')
        with self.assertRaisesRegex(PanelError, 'Operation not found'):
            self.read()

    def test_retained_result_cannot_bypass_identity_or_project_scope(self):
        self.client.wait_operation.return_value = {'id': self.operation, 'status_code': 200}
        self.read()
        self.client.wait_operation.side_effect = PanelError(404, 'Incus: Operation not found')
        other = copy.deepcopy(self.user)
        other['username'] = 'other'
        with self.assertRaises(PanelError):
            self.read(other)
        with self.assertRaises(PanelError) as denied:
            self.read(project='redes')
        self.assertEqual(denied.exception.status, 403)


if __name__ == '__main__':
    unittest.main()
