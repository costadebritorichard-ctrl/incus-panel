"""Incus local: HTTP sobre socket Unix, com endpoints limitados pelo painel."""
import http.client
import json
from pathlib import Path
import re
import socket
from urllib.parse import urlencode

from .core import PanelError, name

READ_PATH = re.compile(r"/1\.0(?:/(?:resources|projects|instances|images|profiles|networks|storage-pools|operations)(?:/[A-Za-z0-9][A-Za-z0-9_.-]{0,63})?(?:/(?:state|snapshots|backups|resources|volumes|leases))?)?")


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, path, timeout=15):
        super().__init__('localhost', timeout=timeout)
        self.path = path

    def connect(self):
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect(self.path)


class UnixIncus:
    def __init__(self, config):
        path = config.get('socket_path', '/var/lib/incus/unix.socket')
        if not isinstance(path, str) or not Path(path).is_absolute():
            raise ValueError('O socket Incus precisa ter caminho absoluto.')
        self.path = path

    def wait_operation(self, operation, project):
        if not isinstance(operation, str) or not re.fullmatch(r'[a-f0-9-]{36}', operation):
            raise PanelError(400, 'Operação Incus inválida.')
        return self.request('GET', '/1.0/operations/' + operation + '/wait', project)['metadata']

    def request(self, method, path, project, body=None, etag=None):
        write = ((method == 'POST' and path in ('/1.0/instances', '/1.0/images')) or
                 (method == 'POST' and path == '/1.0/networks') or
                 (method == 'PUT' and re.fullmatch(r'/1\.0/networks/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}', path)) or
                 (method == 'DELETE' and re.fullmatch(r'/1\.0/networks/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}', path)) or
                 (method == 'POST' and re.fullmatch(r'/1\.0/instances/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}/(?:exec|snapshots|backups)', path)) or
                 (method == 'PUT' and re.fullmatch(r'/1\.0/instances/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}/state', path)) or
                 (method == 'PUT' and re.fullmatch(r'/1\.0/instances/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}', path)) or
                 (method == 'PATCH' and re.fullmatch(r'/1\.0/instances/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}', path)) or
                 (method == 'DELETE' and re.fullmatch(r'/1\.0/instances/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}', path)) or
                 (method == 'DELETE' and re.fullmatch(r'/1\.0/instances/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}/(?:snapshots|backups)/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}', path)))
        if method != 'GET' and not write:
            raise PanelError(403, 'Operação local não permitida.')
        name(project)
        waiting = method == 'GET' and re.fullmatch(r'/1\.0/operations/[a-f0-9-]{36}/wait', path)
        if (method == 'GET' and not READ_PATH.fullmatch(path) and not waiting) or '..' in path:
            raise PanelError(400, 'Endpoint local não permitido.')
        connection = UnixHTTPConnection(self.path)
        try:
            headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}
            if etag:
                headers['If-Match'] = etag
            query = {'project': project, 'recursion': 1}
            if waiting:
                query['timeout'] = 5
            connection.request(method, path + '?' + urlencode(query), json.dumps(body) if body is not None else None, headers)
            response = connection.getresponse()
            raw = response.read(8 * 1024 * 1024 + 1)
            if len(raw) > 8 * 1024 * 1024:
                raise PanelError(502, 'Resposta Incus excedeu o limite.')
            data = json.loads(raw)
            if response.status >= 400 or (isinstance(data, dict) and data.get('type') == 'error'):
                from .core import redact
                detail = data.get('error') if isinstance(data, dict) else None
                raise PanelError(response.status if response.status >= 400 else 502, 'Incus: ' + redact(str(detail or 'Operação recusada.'))[:2000])
            if not isinstance(data, dict) or data.get('type') not in ('sync', 'async') or 'metadata' not in data:
                raise PanelError(502, 'Resposta inesperada do Incus local.')
            etag_value = response.getheader('ETag')
            if isinstance(etag_value, str):
                data['_etag'] = etag_value
            return data
        except PermissionError as exc:
            raise PanelError(403, 'O usuário do serviço não tem acesso ao socket Incus.') from exc
        except (OSError, http.client.HTTPException) as exc:
            raise PanelError(503, 'Socket Incus indisponível.') from exc
        except (ValueError, UnicodeError) as exc:
            raise PanelError(502, 'Resposta inválida do Incus local.') from exc
        finally:
            connection.close()
