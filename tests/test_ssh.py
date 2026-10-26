import io
import json
import queue
import threading
import unittest
from unittest.mock import Mock, patch

from incus_panel.core import PanelError, Service
from incus_panel.server import Application, demo_config, valid_origin
from incus_panel.ssh_transport import REMOTE_HELPER, SSHIncus


def transport(response):
    client = object.__new__(SSHIncus)
    client.closed = False
    client.lock = threading.RLock()
    client.process = Mock()
    client.process.poll.return_value = None
    client.process.stdin = io.StringIO()
    client.responses = queue.Queue()
    client.responses.put(response)
    return client


class SSHContracts(unittest.TestCase):
    def test_reads_full_envelope(self):
        response = {'type': 'sync', 'metadata': {'server': 'real'}}
        client = transport({'response': response})
        self.assertEqual(client.request('GET', '/1.0', 'default'), response)
        self.assertEqual(json.loads(client.process.stdin.getvalue()), {'path': '/1.0', 'project': 'default'})

    def test_reads_metadata_compatibility(self):
        client = transport({'response': [{'name': 'real-container'}]})
        self.assertEqual(client.request('GET', '/1.0/instances', 'default')['metadata'][0]['name'], 'real-container')

    def test_mutations_rejected_before_ssh(self):
        for method in ('POST', 'PUT', 'DELETE', 'PATCH'):
            client = transport({})
            with self.assertRaises(PanelError):
                client.request(method, '/1.0/instances/a', 'default')
            self.assertEqual(client.process.stdin.getvalue(), '')

    def test_injection_and_traversal_blocked(self):
        for path in ('/1.0/instances/a; id', '/1.0/../certificates', '/1.0?project=else', 'http://arbitrary/'):
            with self.assertRaises(PanelError):
                transport({}).request('GET', path, 'default')

    def test_incident_is_not_empty_inventory(self):
        client = transport({'error': 'Permission denied', 'status': 403})
        with self.assertRaises(PanelError) as result:
            client.request('GET', '/1.0/instances', 'default')
        self.assertEqual(result.exception.status, 403)

    def test_remote_helper_forces_get_and_local_socket(self):
        compile(REMOTE_HELPER, '<ssh-helper>', 'exec')
        output = io.StringIO()
        request = json.dumps({'path': '/1.0/instances', 'project': 'laboratorio'}) + '\n'
        result = Mock(returncode=0, stdout=b'{"type":"sync","metadata":[]}', stderr=b'')
        with patch('sys.stdin', io.StringIO(request)), patch('sys.stdout', output), patch('subprocess.run', return_value=result) as run:
            exec(REMOTE_HELPER, {})
        command = run.call_args.args[0]
        self.assertEqual(command[:7], ['incus', 'query', '--force-local', '--raw', '-X', 'GET', '/1.0/instances?project=laboratorio&recursion=1'])
        self.assertEqual(json.loads(output.getvalue().splitlines()[1])['response']['metadata'], [])

    def test_remote_rejects_non_inventory_endpoint(self):
        output = io.StringIO()
        request = json.dumps({'path': '/1.0/certificates', 'project': 'default'}) + '\n'
        with patch('sys.stdin', io.StringIO(request)), patch('sys.stdout', output), patch('subprocess.run') as run:
            exec(REMOTE_HELPER, {})
        run.assert_not_called()
        self.assertIn('error', json.loads(output.getvalue().splitlines()[1]))

    def test_local_http_is_exact_loopback_only(self):
        self.assertTrue(valid_origin({'local_only': True, 'origin': 'http://127.0.0.1:8081'}, 8081))
        for origin in ('http://0.0.0.0:8081', 'http://127.0.0.1:8081.evil', 'http://192.0.2.1:8081'):
            self.assertFalse(valid_origin({'local_only': True, 'origin': origin}, 8081))

    def test_ssh_requires_readonly_and_no_websockets(self):
        config = demo_config()
        config['hosts'][0]['transport'] = 'ssh'
        with self.assertRaises(ValueError): Application.validate(config)
        config['read_only'] = True
        Application.validate(config)
        config['enable_console'] = True
        with self.assertRaises(ValueError): Application.validate(config)

    def test_preconnected_client_preserves_one_session(self):
        config = demo_config()
        client = transport({'response': []})
        service = Service(config, {'demo': client})
        self.assertIs(service.hosts['demo'], client)


if __name__ == '__main__': unittest.main()
