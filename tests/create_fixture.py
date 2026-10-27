import sys
import time
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from incus_panel.core import Demo
from incus_panel.server import demo_config, password_hash, serve

class Fixture(Demo):
    count = 0
    progress_reads = {}
    def _request(self, method, path, project, body):
        if method == 'GET' and path == '/1.0':
            time.sleep(0.2)
        result = super()._request(method, path, project, body)
        if method == 'POST' and path == '/1.0/instances':
            self.count += 1
            if self.count == 2:
                result['metadata'].update(status_code=400, status='Failure', err='Imagem indisponível: erro de teste')
                del self.instances[project, body['name']]
        if method == 'GET' and path.startswith('/1.0/operations/'):
            operation = result['metadata']
            if operation.get('description') == 'POST /1.0/instances' and operation.get('status_code') == 200:
                count = self.progress_reads.get(path, 0)
                self.progress_reads[path] = count + 1
                if count < 2:
                    result = {'type': 'sync', 'metadata': {**operation, 'status_code': 103, 'status': 'Running', 'metadata': {'download_progress': f'{25 + count * 50}% (fixture)'}}}
        return result

config = demo_config()
config.update(manage_all_instances=True, low_resource=True, origin='http://127.0.0.1:8082')
config['users'] = [{'username': 'test', 'password_hash': password_hash('local-browser-fixture'), 'role': 'administrador', 'host_metrics': True, 'scopes': {'demo': ['laboratorio']}}]
serve(config, 8082, {'demo': Fixture()})
