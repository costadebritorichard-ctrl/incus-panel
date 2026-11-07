"""Servidor HTTP local; TLS do navegador deve terminar em proxy reverso confiável."""
import argparse
import copy
import gzip
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import ssl
import threading
import tempfile
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from .core import PanelError, Service, name
from .console import Console
from .events import Events

ROOT = Path(__file__).resolve().parent.parent


def password_hash(password, salt=None):
    salt = salt or secrets.token_hex(16)
    return salt + "$" + hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1).hex()


def verify_password(password, encoded):
    try:
        return hmac.compare_digest(password_hash(password, encoded.split("$", 1)[0]), encoded)
    except (ValueError, TypeError):
        return False


def demo_config():
    return {"demo": True, "read_only": False, "manage_networks": False, "origin": "http://127.0.0.1:8080", "hosts": [{"id": "demo", "alias": "Laboratório simulado"}], "users": [], "mutable_instances": {"demo": {p: ["lab-web", "lab-db", "lab-novo"] for p in ("laboratorio", "redes")}}}


class Application:
    def __init__(self, config, clients=None, config_path=None):
        self.validate(config)
        self.config = config
        self.config_path = Path(config_path).resolve() if config_path else None
        self.service = Service(config, clients, self.config_path.with_name('snapshots.json') if self.config_path else None)
        self.sessions = {}
        self.consoles = {}
        self.events = {}
        self.failures = {}
        self.lock = threading.RLock()
        self.assets = {}
        for path, filename, mime in (('/', 'index.html', 'text/html'), ('/app.js', 'app.js', 'text/javascript'), ('/style.css', 'style.css', 'text/css'), ('/vendor/xterm.js', 'vendor/xterm.js', 'text/javascript'), ('/vendor/xterm.css', 'vendor/xterm.css', 'text/css'), ('/vendor/addon-fit.js', 'vendor/addon-fit.js', 'text/javascript')):
            raw = (ROOT / 'web' / filename).read_bytes()
            compressed = gzip.compress(raw, compresslevel=6, mtime=0)
            self.assets[path] = (mime + '; charset=utf-8', {
                'identity': (raw, '"' + hashlib.sha256(raw).hexdigest() + '"'),
                'gzip': (compressed, '"' + hashlib.sha256(compressed).hexdigest() + '"')})

    @staticmethod
    def validate(config):
        hosts = [name(h["id"]) for h in config["hosts"]]
        if not hosts or len(hosts) != len(set(hosts)):
            raise ValueError("Configure hosts com IDs únicos.")
        names = set()
        for user in config["users"]:
            if (not isinstance(user.get("username"), str) or not user["username"] or len(user["username"]) > 128
                    or user["username"] in names or user["role"] not in ("observador", "operador", "administrador")):
                raise ValueError("Identidade duplicada ou papel inválido.")
            names.add(user["username"])
            if not isinstance(user.get("scopes"), dict):
                raise ValueError("Escopos devem mapear hosts a listas de Projects.")
            for host, projects in user["scopes"].items():
                if host not in hosts or not isinstance(projects, list) or not projects:
                    raise ValueError("Escopo inválido.")
                for project in projects:
                    name(project)
        if not 60 <= config.get("session_seconds", 1800) <= 86400:
            raise ValueError("Sessão deve durar entre 60 e 86400 segundos.")
        if type(config.get('manage_networks', False)) is not bool:
            raise ValueError('manage_networks deve ser true ou false.')
        if config.get('manage_networks', False) and config.get('read_only', True):
            raise ValueError('manage_networks exige read_only desativado.')
        if any(h.get("transport") == "ssh" for h in config["hosts"]):
            if not config.get("read_only", True) or config.get("enable_console") or config.get("enable_events"):
                raise ValueError("Transportes SSH/socket exigem somente leitura, sem console e sem eventos.")

    @staticmethod
    def _scope_is_within(scopes, allowed):
        return isinstance(scopes, dict) and all(
            host in allowed and isinstance(projects, list)
            and all(isinstance(project, str) for project in projects)
            and set(projects).issubset(set(allowed[host]))
            for host, projects in scopes.items())

    def _managed_user(self, actor, username):
        target = next((item for item in self.config["users"] if item["username"] == username), None)
        if (target is None or not self._scope_is_within(target.get("scopes", {}), actor.get("scopes", {}))
                or (target.get("host_metrics", False) and not actor.get("host_metrics", False))):
            raise PanelError(404, "Conta não encontrada neste escopo administrativo.")
        return target

    def _save_users(self, users):
        candidate = copy.deepcopy(self.config)
        candidate["users"] = users
        self.validate(candidate)
        if self.config_path:
            fd, temporary = tempfile.mkstemp(prefix=self.config_path.name + ".", suffix=".tmp", dir=self.config_path.parent)
            try:
                with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as output:
                    json.dump(users, output, ensure_ascii=False, indent=2)
                    output.write("\n")
                    output.flush()
                    os.fsync(output.fileno())
                try:
                    os.chmod(temporary, 0o600)
                except OSError:
                    pass
                os.replace(temporary, self.config_path)
            finally:
                if os.path.exists(temporary):
                    os.unlink(temporary)
        self.config["users"] = users

    def users(self, actor):
        if actor.get("role") != "administrador":
            raise PanelError(403, "A gestão de contas exige administrador.")
        if self.config_path is None or self.config.get("demo"):
            raise PanelError(403, "A gestão de contas exige configuração persistente fora do modo demonstração.")
        visible = [
            {"username": item["username"], "role": item["role"], "scopes": item.get("scopes", {}),
             "host_metrics": item.get("host_metrics", False)}
            for item in self.config["users"]
            if self._scope_is_within(item.get("scopes", {}), actor.get("scopes", {}))
            and (not item.get("host_metrics", False) or actor.get("host_metrics", False))
        ]
        return {"users": visible, "persisted": True}

    def change_user(self, actor, body):
        with self.lock:
            return self._change_user_locked(actor, body)

    def _change_user_locked(self, actor, body):
        if actor.get("role") != "administrador":
            raise PanelError(403, "A gestão de contas exige administrador.")
        if self.config_path is None or self.config.get("demo"):
            raise PanelError(403, "A gestão de contas exige configuração persistente fora do modo demonstração.")
        action, username = body.get("action"), body.get("username")
        if not isinstance(username, str) or not username or len(username) > 128:
            raise PanelError(400, "Nome de usuário inválido.")
        if action == "delete":
            if username == actor["username"]:
                raise PanelError(409, "Não é possível remover a própria conta.")
            target = self._managed_user(actor, username)
            updated = [item for item in self.config["users"] if item is not target]
        elif action in ("create", "update"):
            if action == "create" and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.@-]{0,63}", username):
                raise PanelError(400, "Use até 64 letras, números, ponto, hífen, sublinhado ou @ para um novo usuário.")
            if action == "update" and username == actor["username"]:
                raise PanelError(409, "Use outra conta administradora para alterar a própria conta.")
            role = body.get("role")
            if role not in ("observador", "operador", "administrador"):
                raise PanelError(400, "Papel inválido.")
            scopes = body.get("scopes")
            if not isinstance(scopes, dict) or not scopes or not self._scope_is_within(scopes, actor.get("scopes", {})):
                raise PanelError(403, "Selecione Projects dentro do escopo deste administrador.")
            for projects in scopes.values():
                if not isinstance(projects, list) or not projects:
                    raise PanelError(400, "Cada host selecionado precisa ter ao menos um Project.")
                for project in projects:
                    name(project)
            host_metrics = body.get("host_metrics", False)
            if not isinstance(host_metrics, bool) or (host_metrics and not actor.get("host_metrics", False)):
                raise PanelError(403, "Este administrador não pode conceder métricas globais do host.")
            password = body.get("password", "")
            if not isinstance(password, str) or len(password) > 256:
                raise PanelError(400, "Senha inválida.")
            old = None
            if action == "update":
                old = self._managed_user(actor, username)
                if password and len(password) < 12:
                    raise PanelError(400, "A nova senha deve ter pelo menos 12 caracteres.")
            elif any(item["username"] == username for item in self.config["users"]):
                raise PanelError(409, "Este nome de usuário já existe.")
            elif len(password) < 12:
                raise PanelError(400, "A senha deve ter pelo menos 12 caracteres.")
            replacement = {"username": username,
                           "password_hash": old["password_hash"] if old and not password else password_hash(password),
                           "role": role, "host_metrics": host_metrics, "scopes": scopes}
            updated = [replacement if item is old else item for item in self.config["users"]]
            if old is None:
                updated.append(replacement)
        else:
            raise PanelError(400, "Ação de conta inválida.")
        if not any(item["role"] == "administrador" for item in updated):
            raise PanelError(409, "Mantenha ao menos uma conta administradora.")
        self._save_users(updated)
        if action in ("update", "delete"):
            with self.lock:
                for token, session in list(self.sessions.items()):
                    if session["user"]["username"] == username:
                        self.close_consoles(token)
                        del self.sessions[token]
        self.service.audit.append({"identity": actor["username"], "host": "panel", "project": "local", "target": username,
                                   "action": "user-" + action, "timestamp": time.time(),
                                   "result": "conta removida" if action == "delete" else "conta atualizada"})
        self.service.audit[:] = self.service.audit[-200:]
        return {"ok": True, "action": action, "username": username}

    def login(self, username, password, address):
        now = time.time()
        with self.lock:
            self.failures = {k: v for k, v in self.failures.items() if now - v[1] < 300}
            failed, since = self.failures.get(address, (0, now))
            if failed >= 10:
                raise PanelError(429, "Muitas tentativas. Aguarde cinco minutos.")
            user = next((u for u in self.config["users"] if u["username"] == username), None)
            valid = verify_password(password, user["password_hash"] if user else "invalid$invalid")
            if not user or not valid:
                self.failures[address] = (failed + 1, since)
                raise PanelError(401, "Credenciais inválidas.")
            self.failures.pop(address, None)
            self.sessions = {k: v for k, v in self.sessions.items() if v["expires"] > now}
            if len(self.sessions) >= 100:
                raise PanelError(429, "Limite de sessões atingido.")
            token = secrets.token_urlsafe(32)
            session = {"user": user, "csrf": secrets.token_urlsafe(32), "expires": now + self.config.get("session_seconds", 1800)}
            self.sessions[token] = session
            return token, session

    def session(self, token):
        with self.lock:
            session = self.sessions.get(token)
            if not session or session["expires"] <= time.time():
                self.sessions.pop(token, None)
                self.close_consoles(token)
                raise PanelError(401, "Sessão expirada. Entre novamente.")
            return session

    def close_consoles(self, token):
        with self.lock:
            for console_id, item in list(self.consoles.items()):
                if item["token"] == token:
                    item["console"].close()
                    del self.consoles[console_id]
            for event_id, item in list(self.events.items()):
                if item["token"] == token:
                    item["events"].close()
                    del self.events[event_id]

    def reap(self):
        with self.lock:
            now = time.time()
            for token, session in list(self.sessions.items()):
                if session['expires'] <= now:
                    self.close_consoles(token)
                    del self.sessions[token]
            self.failures = {key: value for key, value in self.failures.items() if now - value[1] < 300}
            for console_id, item in list(self.consoles.items()):
                console = item["console"]
                if now >= console.deadline or now - console.last_access > 30:
                    console.close()
                    del self.consoles[console_id]
            for event_id, item in list(self.events.items()):
                event = item["events"]
                if event.closed or now >= event.deadline or now - event.last_access > 45:
                    event.close()
                    del self.events[event_id]

    def event_status(self, token, session, host, project):
        client = self.service.context(session["user"], host, project)
        if self.service.low_resource or not self.config.get("enable_events", False) or self.config.get("demo"):
            return {"enabled": False, "connected": False, "version": 0}
        key = (token, host, project)
        with self.lock:
            if key not in self.events:
                if len(self.events) >= 100:
                    raise PanelError(429, "Limite de assinaturas de eventos atingido.")
                # One active scope per web session. No orphan listeners after scope changes.
                for other, item in list(self.events.items()):
                    if item["token"] == token:
                        item["events"].close()
                        del self.events[other]
                self.events[key] = {"token": token, "events": Events(client, project, session["expires"])}
            return {"enabled": True, **self.events[key]["events"].read()}

    def open_console(self, token, session, body):
        user = session["user"]
        host, project, target = body.get("host"), body.get("project"), name(body.get("target"))
        client = self.service.context(user, host, project)
        if not self.config.get("enable_console", False) or self.config.get("read_only", True) or user["role"] not in ("operador", "administrador"):
            raise PanelError(403, "Console não habilitado ou papel sem permissão.")
        if not self.service.can_manage(user, host, project, target) or body.get("confirmation") != f"{host}/{project}/{target}":
            raise PanelError(403, "Console exige alvo exato e permissão para administrar o container.")
        instance = client.request("GET", f"/1.0/instances/{target}", project)["metadata"]
        if instance.get("type") != "container" or instance.get("status") != "Running":
            raise PanelError(409, "Console exige container em execução.")
        with self.lock:
            self.reap()
            # Preserve final output until read/idle cleanup, but release closed
            # channels before allocating another interactive session.
            for console_id, item in list(self.consoles.items()):
                if item['console'].closed:
                    del self.consoles[console_id]
            if len(self.consoles) >= 4 or any(item["token"] == token for item in self.consoles.values()):
                raise PanelError(429, "Limite de um console por sessão e quatro por serviço.")
            console = Console(client, project, target, session["expires"])
            console_id = secrets.token_urlsafe(24)
            self.consoles[console_id] = {"token": token, "console": console, "host": host, "project": project}
            self.service.audit.append({"identity": user["username"], "host": host, "project": project, "target": target, "action": "console", "timestamp": time.time(), "operation": getattr(console, "operation", None), "result": "canais abertos"})
            self.service.audit[:] = self.service.audit[-200:]
            return {"console": console_id, "stream": True}

    def console(self, token, console_id):
        session = self.session(token)
        with self.lock:
            item = self.consoles.get(console_id)
            if not item or item["token"] != token:
                raise PanelError(404, "Console encerrado ou não autorizado.")
            console = item["console"]
            self.service.context(session["user"], item["host"], item["project"])
        if time.time() - console.last_auth > 15:
            try:
                console.client.request("GET", f"/1.0/instances/{console.target}", console.project)
                console.last_auth = time.time()
            except PanelError:
                console.close()
                raise
        return console

    def public_session(self, session):
        user = session["user"]
        return {"username": user["username"], "role": user["role"], "scopes": user["scopes"], "host_metrics": user.get("host_metrics", False), "csrf": session["csrf"], "expires": session["expires"], "demo": self.config.get("demo", False), "read_only": self.config.get("read_only", True), "enable_console": self.config.get("enable_console", False), "low_resource": self.service.low_resource, "manage_all_instances": self.config.get("manage_all_instances", False) and user["role"] == "administrador", "manage_networks": self.config.get("manage_networks", False) and user["role"] == "administrador", "manage_users": self.config_path is not None and not self.config.get("demo") and user["role"] == "administrador", "allow_remote_images": self.config.get("allow_remote_images", False), "hosts": [{"id": h["id"], "alias": h["alias"], "transport": h.get("transport", "tls")} for h in self.config["hosts"] if h["id"] in user["scopes"]], "mutable_instances": {h: {p: values for p, values in projects.items() if p in user["scopes"].get(h, [])} for h, projects in self.config.get("mutable_instances", {}).items() if h in user["scopes"]}}


class Handler(BaseHTTPRequestHandler):
    server_version = "IncusPanel"

    def log_message(self, *args):
        # Do not log request URLs, bodies, session IDs or upstream credentials.
        pass

    @property
    def app(self):
        return self.server.app

    def send(self, status, data, content_type="application/json; charset=utf-8", cookie=None, headers=None):
        encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode() if content_type.startswith("application/json") else data
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        if status != 304:
            self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "public, max-age=0, must-revalidate" if headers else "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        if status != 304:
            self.wfile.write(encoded)

    def send_asset(self, path):
        asset = self.app.assets.get(path)
        if asset is None:
            raise PanelError(404, 'Página não encontrada.')
        # Compress only public files, once at startup. Authenticated API responses stay private.
        encodings = {}
        for entry in self.headers.get('Accept-Encoding', '').split(','):
            encoding, *parameters = entry.strip().lower().split(';')
            quality = 1.0
            for parameter in parameters:
                if parameter.strip().startswith('q='):
                    try:
                        quality = float(parameter.strip()[2:])
                    except ValueError:
                        quality = 0
            encodings[encoding] = quality
        encoding = 'gzip' if encodings.get('gzip', encodings.get('*', 0)) > 0 else 'identity'
        mime, variants = asset
        raw, etag = variants[encoding]
        headers = {'ETag': etag, 'Vary': 'Accept-Encoding'}
        if encoding == 'gzip':
            headers['Content-Encoding'] = 'gzip'
        candidates = [value.strip().removeprefix('W/') for value in self.headers.get('If-None-Match', '').split(',')]
        unchanged = etag in candidates or '*' in candidates
        self.send(304 if unchanged else 200, b'' if unchanged else raw, mime, headers=headers)

    def session_token(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
        except Exception:
            raise PanelError(401, "Sessão inválida.")
        return cookie["panel_session"].value if "panel_session" in cookie else ""

    def body(self):
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 0 or size > 65536:
                raise PanelError(413, "Solicitação muito grande.")
            if self.headers.get_content_type() != "application/json":
                raise PanelError(415, "Envie JSON.")
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict):
                raise ValueError()
            return data
        except (ValueError, UnicodeDecodeError):
            raise PanelError(400, "JSON inválido.")

    def do_GET(self):
        self.handle_request(False)

    def do_POST(self):
        self.handle_request(True)

    def origin_allowed(self):
        origin = self.headers.get("Origin", "")
        allowed_origins = set(self.app.config.get("allowed_origins", []))
        allowed_origins.add(self.app.config["origin"])
        if origin in allowed_origins:
            return True
        # A wildcard HTTPS listener also accepts the IP actually reached by this
        # connection. Never trust Host/Forwarded alone to authorize an origin.
        if self.app.config.get("listen_host") != "0.0.0.0" or not isinstance(self.connection, ssl.SSLSocket):
            return False
        try:
            parsed = urlsplit(origin)
            address, port = self.connection.getsockname()[:2]
            return (parsed.scheme == "https" and not parsed.username and not parsed.password
                    and not parsed.path and not parsed.query and not parsed.fragment
                    and parsed.netloc == self.headers.get("Host")
                    and ipaddress.ip_address(parsed.hostname) == ipaddress.ip_address(address)
                    and (parsed.port or 443) == port)
        except (ValueError, TypeError):
            return False

    def handle_request(self, mutation):
        self.connection.settimeout(20)
        try:
            parsed = urlsplit(self.path)
            path = parsed.path
            if mutation:
                if not self.origin_allowed():
                    raise PanelError(403, "Origem não autorizada.")
                body = self.body()
                if path == "/api/login":
                    token, session = self.app.login(str(body.get("username", "")), str(body.get("password", "")), self.client_address[0])
                    secure = "; Secure" if self.app.config["origin"].startswith("https:") else ""
                    self.send(200, self.app.public_session(session), cookie=f"panel_session={token}; HttpOnly; SameSite=Strict; Path=/{secure}")
                    return
            if path.startswith("/api/"):
                token = self.session_token()
                session = self.app.session(token)
                if mutation:
                    if not hmac.compare_digest(self.headers.get("X-CSRF-Token", ""), session["csrf"]):
                        raise PanelError(403, "Proteção CSRF: atualize a sessão.")
                    if path == "/api/logout":
                        with self.app.lock:
                            self.app.close_consoles(token)
                            self.app.sessions.pop(token, None)
                        self.send(200, {"ok": True}, cookie="panel_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/")
                        return
                    if path == "/api/users":
                        self.send(200, self.app.change_user(session["user"], body))
                        return
                    if path == "/api/console/start":
                        self.send(201, self.app.open_console(token, session, body))
                        return
                    if path == '/api/create':
                        self.send(202, self.app.service.launch(session['user'], body.get('host'), body.get('project'), body))
                        return
                    if path == '/api/images/download':
                        self.send(202, self.app.service.download_image(session['user'], body.get('host'), body.get('project'), body))
                        return
                    if path == "/api/console/input":
                        self.app.console(token, body.get("console")).write(body.get("text"))
                        self.send(200, {"ok": True})
                        return
                    if path == "/api/console/resize":
                        self.app.console(token, body.get("console")).resize(body.get("width", 100), body.get("height", 30))
                        self.send(200, {"ok": True})
                        return
                    if path == "/api/console/close":
                        console_id = body.get("console")
                        self.app.console(token, console_id).close()
                        with self.app.lock:
                            self.app.consoles.pop(console_id, None)
                        self.send(200, {"ok": True})
                        return
                    if path != "/api/action":
                        raise PanelError(404, "Rota não encontrada.")
                    data = self.app.service.mutate(session["user"], body.get("host"), body.get("project"), body.get("action"), body.get("target"), body)
                    self.send(202, data)
                elif path == "/api/users":
                    self.send(200, self.app.users(session["user"]))
                elif path == "/api/session":
                    self.send(200, self.app.public_session(session))
                elif path == "/api/console/read":
                    query = parse_qs(parsed.query)
                    self.send(200, self.app.console(token, query.get("console", [""])[0]).read())
                elif path == '/api/console/stream':
                    from .console_stream import relay
                    query = parse_qs(parsed.query)
                    relay(self, token, session, query.get('console', [''])[0])
                elif path == "/api/events":
                    query = parse_qs(parsed.query)
                    self.send(200, self.app.event_status(token, session, query.get("host", [""])[0], query.get("project", [""])[0]))
                elif path == "/api/read":
                    query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
                    data = self.app.service.read(session["user"], query.get("host"), query.get("project"), query.get("resource"), query.get("target"))
                    transport = next(h.get("transport", "tls") for h in self.app.config["hosts"] if h["id"] == query.get("host"))
                    source = {"ssh": "Incus via SSH", "unix": "Incus socket Unix", "tls": "Incus REST TLS"}.get(transport, "Incus")
                    self.send(200, {"data": data, "timestamp": time.time(), "source": "fixture explícita" if self.app.config.get("demo") else source})
                else:
                    raise PanelError(404, "Rota não encontrada.")
            elif not mutation:
                self.send_asset(path)
            else:
                raise PanelError(404, "Rota não encontrada.")
        except PanelError as exc:
            self.send(exc.status, {"error": str(exc), "code": exc.status})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self.send(500, {"error": "Falha interna. Consulte o administrador.", "code": 500})


def main():
    parser = argparse.ArgumentParser(description="Incus Panel")
    parser.add_argument("--demo", action="store_true")
    parser.add_argument("--config", default="config.local.json")
    parser.add_argument("--users-file")
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--hash-password", action="store_true")
    args = parser.parse_args()
    if args.hash_password:
        import getpass
        print(password_hash(getpass.getpass("Senha: ")))
        return
    if args.demo:
        config = demo_config()
        config.update(manage_all_instances=True, manage_networks=True, allow_remote_images=True)
        password = secrets.token_urlsafe(12)
        config["users"] = [{"username": "demo", "password_hash": password_hash(password), "role": "administrador", "host_metrics": True, "scopes": {"demo": ["laboratorio", "redes"]}}]
        config["origin"] = f"http://127.0.0.1:{args.port}"
        print(f"DEMONSTRAÇÃO — dados simulados. Usuário: demo | senha temporária: {password}", flush=True)
    else:
        config = json.loads(Path(args.config).read_text(encoding="utf-8"))
        if config.get("demo"):
            raise SystemExit("Use --demo para simulação.")
        users_path = Path(args.users_file) if args.users_file else Path(args.config).with_name(Path(args.config).stem + ".users.json")
        if users_path.exists():
            stored_users = json.loads(users_path.read_text(encoding="utf-8"))
            if not isinstance(stored_users, list):
                raise SystemExit("O arquivo de usuários precisa conter uma lista JSON.")
            config["users"] = stored_users
        if not config.get("users") or not valid_origin(config, args.port):
            raise SystemExit("Configure usuários e origem HTTPS via proxy reverso.")
    serve(config, args.port, config_path=None if args.demo else users_path)


def valid_origin(config, port):
    origin = config.get("origin", "")
    return origin.startswith("https://") or (config.get("local_only") is True and origin == f"http://127.0.0.1:{port}")


def listener(config, port):
    host = config.get("listen_host", "127.0.0.1")
    certificate, key = config.get("tls_certificate"), config.get("tls_key")
    if bool(certificate) != bool(key):
        raise ValueError("Configure certificado e chave HTTPS juntos.")
    if host != "127.0.0.1" and (not certificate or not config.get("origin", "").startswith("https://")):
        raise ValueError("Acesso pela rede exige HTTPS com certificado e chave.")
    if certificate and not config.get("origin", "").startswith("https://"):
        raise ValueError("A origem deve usar HTTPS quando houver certificado.")
    context = None
    if certificate:
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        context.load_cert_chain(certificate, key)
    return host, context


class PanelHTTPServer(ThreadingHTTPServer):
    """TLS é negociado no worker, nunca na fila que aceita conexões."""
    daemon_threads = True
    request_queue_size = 16
    handshake_timeout = 5
    request_timeout = 30

    def __init__(self, address, handler, tls=None, max_workers=4):
        self.tls = tls
        self.workers = threading.BoundedSemaphore(max_workers)
        self.worker_state = threading.local()
        self.next_reap = 0
        super().__init__(address, handler)

    def service_actions(self):
        if time.monotonic() >= self.next_reap:
            # Cleanup must never hold up the accept loop while a login/console owns the lock.
            if self.app.lock.acquire(blocking=False):
                try:
                    self.app.reap()
                finally:
                    self.app.lock.release()
            self.next_reap = time.monotonic() + 5

    def process_request(self, request, client_address):
        if not self.workers.acquire(blocking=False):
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except Exception:
            self.workers.release()
            raise

    def process_request_thread(self, request, client_address):
        self.worker_state.held = True
        try:
            request.settimeout(self.handshake_timeout)
            if self.tls:
                request = self.tls.wrap_socket(request, server_side=True, do_handshake_on_connect=False)
                request.do_handshake()
            request.settimeout(self.request_timeout)
            self.finish_request(request, client_address)
        except (ssl.SSLError, TimeoutError, ConnectionError):
            pass
        except Exception:
            self.handle_error(request, client_address)
        finally:
            self.shutdown_request(request)
            if self.worker_state.held:
                self.workers.release()

    def release_stream_worker(self):
        """A validated console has its own four-console limit, independent of HTTP slots."""
        if self.worker_state.held:
            self.worker_state.held = False
            self.workers.release()


def serve(config, port, clients=None, config_path=None):
    host, tls = listener(config, port)
    app = Application(config, clients, config_path)
    server = PanelHTTPServer((host, port), Handler, tls, max_workers=4 if app.service.low_resource else 8)
    server.app = app
    print(f"Incus Panel disponível em {'https' if tls else 'http'}://{host}:{port}", flush=True)
    try:
        server.serve_forever(poll_interval=5 if app.service.low_resource else 0.5)
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        for client in server.app.service.hosts.values():
            if hasattr(client, "close"):
                client.close()


if __name__ == "__main__":
    main()
