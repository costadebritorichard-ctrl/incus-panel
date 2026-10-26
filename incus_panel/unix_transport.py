"""Incus local: HTTP sobre socket Unix, com endpoints limitados pelo painel."""
import http.client
import json
from pathlib import Path
import re
import socket
from urllib.parse import urlencode

from .core import PanelError, name

READ_PATH = re.compile(r"/1\.0(?:/(?:resources|projects|instances|images|profiles|networks|storage-pools|operations)(?:/[A-Za-z0-9][A-Za-z0-9_.-]{0,63})?(?:/(?:state|snapshots|backups|resources|volumes))?)?")


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

    def request(self, method, path, project, body=None, etag=None):
        write = ((method == 'POST' and path == '/1.0/instances') or
                 (method == 'POST' and re.fullmatch(r'/1\.0/instances/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}/(?:exec|snapshots|backups)', path)) or
                 (method == 'PUT' and re.fullmatch(r'/1\.0/instances/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}/state', path)) or
                 (method == 'DELETE' and re.fullmatch(r'/1\.0/instances/[A-Za-z0-9][A-Za-z0-9_.-]{0,62}', path)))
        if method != 'GET' and not write:
            raise PanelError(403, 'Operação local não permitida.')
        name(project)
        if (method == 'GET' and not READ_PATH.fullmatch(path)) or '..' in path:
            raise PanelError(400, 'Endpoint local não permitido.')
        connection = UnixHTTPConnection(self.path)
        try:
            headers = {'Accept': 'application/json', 'Content-Type': 'application/json'}
            if etag:
                headers['If-Match'] = etag
            connection.request(method, path + '?' + urlencode({'project': project, 'recursion': 1}), json.dumps(body) if body is not None else None, headers)
            response = connection.getresponse()
            if response.status >= 400:
                raise PanelError(response.status, 'Consulta recusada pelo Incus local.')
            raw = response.read(8 * 1024 * 1024 + 1)
            if len(raw) > 8 * 1024 * 1024:
                raise PanelError(502, 'Resposta Incus excedeu o limite.')
            data = json.loads(raw)
            if not isinstance(data, dict) or data.get('type') not in ('sync', 'async') or 'metadata' not in data:
                raise PanelError(502, 'Resposta inesperada do Incus local.')
            return data
        except PermissionError as exc:
            raise PanelError(403, 'O usuário do serviço não tem acesso ao socket Incus.') from exc
        except (OSError, http.client.HTTPException) as exc:
            raise PanelError(503, 'Socket Incus indisponível.') from exc
        except (ValueError, UnicodeError) as exc:
            raise PanelError(502, 'Resposta inválida do Incus local.') from exc
        finally:
            connection.close()
