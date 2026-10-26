"""Ponte Incus somente leitura sobre uma conexão SSH persistente.

Nenhuma senha é armazenada. OpenSSH lê a senha diretamente do terminal do
operador; agent/chaves existentes também funcionam. Nada é instalado no host.
"""
import json
from pathlib import Path
import queue
import re
import shlex
import subprocess
import threading
from urllib.parse import urlencode

from .core import PanelError, name

REMOTE_HELPER = r'''
import json, re, subprocess, sys
from urllib.parse import urlencode
pattern = r"/1\.0(?:/(?:resources|projects|instances|images|profiles|networks|storage-pools|operations)(?:/[A-Za-z0-9][A-Za-z0-9_.-]{0,62})?(?:/(?:state|snapshots|backups|resources|volumes))?)?"
print(json.dumps({"ready": True}), flush=True)
for line in sys.stdin:
    try:
        if len(line) > 4096:
            raise ValueError("Solicitacao muito grande")
        data = json.loads(line)
        path, project = data["path"], data["project"]
        if not re.fullmatch(pattern, path) or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,62}", project):
            raise ValueError("Consulta nao permitida")
        endpoint = path + "?" + urlencode({"project": project, "recursion": 1})
        result = subprocess.run(["incus", "query", "--force-local", "--raw", "-X", "GET", endpoint], capture_output=True, timeout=20)
        if result.returncode:
            # Nao transportar stderr: pode conter caminhos e detalhes privados.
            print(json.dumps({"error": "Consulta Incus recusada; confira acesso do usuario ao socket local.", "status": 403}), flush=True)
        elif len(result.stdout) > 8 * 1024 * 1024:
            print(json.dumps({"error": "Resposta Incus excedeu o limite.", "status": 502}), flush=True)
        else:
            print(json.dumps({"response": json.loads(result.stdout)}), flush=True)
    except subprocess.TimeoutExpired:
        print(json.dumps({"error": "Incus nao respondeu no prazo.", "status": 504}), flush=True)
    except Exception:
        print(json.dumps({"error": "Falha na ponte de leitura Incus. Requer Python 3 e CLI incus no host.", "status": 502}), flush=True)
'''


class SSHIncus:
    def __init__(self, config):
        self.config = config
        hostname, username = config["ssh_host"], config["ssh_user"]
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9.-]{0,252}", hostname) or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]{0,62}", username):
            raise ValueError("Destino SSH inválido.")
        known_hosts = Path(config["known_hosts"]).resolve()
        known_hosts.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.responses = queue.Queue(maxsize=2)
        self.process = None
        self.closed = False
        command = ["ssh", "-T", "-o", "ConnectTimeout=10", "-o", "ServerAliveInterval=15", "-o", "ServerAliveCountMax=2", "-o", "StrictHostKeyChecking=ask", "-o", f"UserKnownHostsFile={known_hosts.as_posix()}", f"{username}@{hostname}", "python3 -u -c " + shlex.quote(REMOTE_HELPER)]
        try:
            self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True, encoding="utf-8", bufsize=1)
            threading.Thread(target=self.receive, daemon=True).start()
            ready = self.next_response(120)
            if not ready.get("ready"):
                raise PanelError(502, "A TV Box não iniciou a ponte Incus.")
        except Exception:
            self.close()
            raise

    def receive(self):
        try:
            while not self.closed:
                line = self.process.stdout.readline(8 * 1024 * 1024 + 1024)
                if not line:
                    self.responses.put(None)
                    return
                self.responses.put(json.loads(line))
        except Exception:
            if not self.closed:
                self.responses.put(None)

    def next_response(self, timeout):
        try:
            response = self.responses.get(timeout=timeout)
        except queue.Empty:
            self.close()
            raise PanelError(504, "SSH sem resposta. Confira o terminal e reinicie a conexão.")
        if response is None:
            self.close()
            raise PanelError(503, "Conexão SSH encerrada. Confira acesso à rede, autenticação e Python 3 na TV Box.")
        return response

    def request(self, method, path, project, body=None, etag=None):
        if method != "GET" or body is not None:
            raise PanelError(403, "A integração SSH permite somente leitura.")
        name(project)
        if not re.fullmatch(r"/1\.0(?:/[A-Za-z0-9_.\-/]+)?", path) or ".." in path:
            raise PanelError(400, "Caminho de consulta inválido.")
        with self.lock:
            if self.closed or self.process.poll() is not None:
                raise PanelError(503, "Conexão SSH encerrada. Reinicie o painel para autenticar novamente.")
            try:
                self.process.stdin.write(json.dumps({"path": path, "project": project}) + "\n")
                self.process.stdin.flush()
            except (OSError, ValueError):
                self.close()
                raise PanelError(503, "Falha na conexão SSH com a TV Box.")
            response = self.next_response(30)
            if "error" in response:
                raise PanelError(response.get("status", 502), response["error"])
            data = response.get("response")
            if not isinstance(data, (dict, list)):
                raise PanelError(502, "Incus retornou uma resposta inválida.")
            if isinstance(data, dict) and data.get("type") in ("sync", "async", "error"):
                if data["type"] == "error":
                    raise PanelError(data.get("error_code", 502), "Consulta recusada pelo Incus.")
                return data
            return {"type": "sync", "metadata": data}

    def close(self):
        self.closed = True
        if self.process:
            if self.process.poll() is None:
                self.process.terminate()
            try:
                self.process.communicate(timeout=5)
            except (subprocess.TimeoutExpired, ValueError):
                self.process.kill()
