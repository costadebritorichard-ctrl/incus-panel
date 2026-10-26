"""Servidor HTTP local; TLS do navegador deve terminar em proxy reverso confiável."""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import ssl
import threading
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
    return {"demo": True, "read_only": False, "origin": "http://127.0.0.1:8080", "hosts": [{"id": "demo", "alias": "Laboratório simulado"}], "users": [], "mutable_instances": {"demo": {p: ["lab-web", "lab-db", "lab-novo"] for p in ("laboratorio", "redes")}}}


class Application:
    def __init__(self, config, clients=None):
        self.validate(config)
        self.config = config
        self.service = Service(config, clients)
        self.sessions = {}
        self.consoles = {}
        self.events = {}
        self.failures = {}
        self.lock = threading.RLock()

    @staticmethod
    def validate(config):
        hosts = [name(h["id"]) for h in config["hosts"]]
        if not hosts or len(hosts) != len(set(hosts)):
            raise ValueError("Configure hosts com IDs únicos.")
        names = set()
        for user in config["users"]:
            if user["username"] in names or user["role"] not in ("observador", "operador", "administrador"):
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
        if any(h.get("transport") == "ssh" for h in config["hosts"]):
            if not config.get("read_only", True) or config.get("enable_console") or config.get("enable_events"):
                raise ValueError("Transportes SSH/socket exigem somente leitura, sem console e sem eventos.")

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
            for console_id, item in list(self.consoles.items()):
                console = item["console"]
                if console.closed or now >= console.deadline or now - console.last_access > 30:
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
        allowed = self.config.get("mutable_instances", {}).get(host, {}).get(project, [])
        if not self.service.can_manage(user, host, project, target) or body.get("confirmation") != f"{host}/{project}/{target}":
            raise PanelError(403, "Console exige confirmação e container de teste autorizado.")
        instance = client.request("GET", f"/1.0/instances/{target}", project)["metadata"]
        if instance.get("type") != "container" or instance.get("status") != "Running":
            raise PanelError(409, "Console exige container em execução.")
        with self.lock:
            self.reap()
            if len(self.consoles) >= 4 or any(item["token"] == token for item in self.consoles.values()):
                raise PanelError(429, "Limite de um console por sessão e quatro por serviço.")
            console = Console(client, project, target, session["expires"])
            console_id = secrets.token_urlsafe(24)
            self.consoles[console_id] = {"token": token, "console": console, "host": host, "project": project}
            self.service.audit.append({"identity": user["username"], "host": host, "project": project, "target": target, "action": "console", "timestamp": time.time(), "operation": getattr(console, "operation", None), "result": "canais abertos"})
            self.service.audit[:] = self.service.audit[-200:]
            return {"console": console_id}

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
        return {"username": user["username"], "role": user["role"], "scopes": user["scopes"], "host_metrics": user.get("host_metrics", False), "csrf": session["csrf"], "expires": session["expires"], "demo": self.config.get("demo", False), "read_only": self.config.get("read_only", True), "enable_console": self.config.get("enable_console", False), "low_resource": self.service.low_resource, "manage_all_instances": self.config.get("manage_all_instances", False) and user["role"] == "administrador", "allow_remote_images": self.config.get("allow_remote_images", False), "hosts": [{"id": h["id"], "alias": h["alias"], "transport": h.get("transport", "tls")} for h in self.config["hosts"] if h["id"] in user["scopes"]], "mutable_instances": {h: {p: values for p, values in projects.items() if p in user["scopes"].get(h, [])} for h, projects in self.config.get("mutable_instances", {}).items() if h in user["scopes"]}}


class Handler(BaseHTTPRequestHandler):
    server_version = "IncusPanel"

    def log_message(self, *args):
        # Do not log request URLs, bodies, session IDs or upstream credentials.
        pass

    @property
    def app(self):
        return self.server.app

    def send(self, status, data, content_type="application/json; charset=utf-8", cookie=None):
        encoded = json.dumps(data, ensure_ascii=False).encode() if content_type.startswith("application/json") else data
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        self.wfile.write(encoded)

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

    def handle_request(self, mutation):
        self.connection.settimeout(20)
        try:
            parsed = urlsplit(self.path)
            path = parsed.path
            if mutation:
                if self.headers.get("Origin") != self.app.config["origin"]:
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
                    if path == "/api/console/start":
                        self.send(201, self.app.open_console(token, session, body))
                        return
                    if path == '/api/create':
                        self.send(202, self.app.service.launch(session['user'], body.get('host'), body.get('project'), body))
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
                        self.app.console(token, body.get("console")).close()
                        self.app.reap()
                        self.send(200, {"ok": True})
                        return
                    if path != "/api/action":
                        raise PanelError(404, "Rota não encontrada.")
                    data = self.app.service.mutate(session["user"], body.get("host"), body.get("project"), body.get("action"), body.get("target"), body)
                    self.send(202, data)
                elif path == "/api/session":
                    self.send(200, self.app.public_session(session))
                elif path == "/api/console/read":
                    query = parse_qs(parsed.query)
                    self.send(200, self.app.console(token, query.get("console", [""])[0]).read())
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
                files = {"/": ("index.html", "text/html; charset=utf-8"), "/app.js": ("app.js", "text/javascript; charset=utf-8"), "/style.css": ("style.css", "text/css; charset=utf-8")}
                if path not in files:
                    raise PanelError(404, "Página não encontrada.")
                filename, mime = files[path]
                self.send(200, (ROOT / "web" / filename).read_bytes(), mime)
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
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--hash-password", action="store_true")
    args = parser.parse_args()
    if args.hash_password:
        import getpass
        print(password_hash(getpass.getpass("Senha: ")))
        return
    if args.demo:
        config = demo_config()
        password = secrets.token_urlsafe(12)
        config["users"] = [{"username": "demo", "password_hash": password_hash(password), "role": "administrador", "host_metrics": True, "scopes": {"demo": ["laboratorio", "redes"]}}]
        config["origin"] = f"http://127.0.0.1:{args.port}"
        print(f"DEMONSTRAÇÃO — dados simulados. Usuário: demo | senha temporária: {password}", flush=True)
    else:
        config = json.loads(Path(args.config).read_text(encoding="utf-8"))
        if config.get("demo"):
            raise SystemExit("Use --demo para simulação.")
        if not config.get("users") or not valid_origin(config, args.port):
            raise SystemExit("Configure usuários e origem HTTPS via proxy reverso.")
    serve(config, args.port)


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


def serve(config, port, clients=None):
    host, tls = listener(config, port)
    app = Application(config, clients)
    server = ThreadingHTTPServer((host, port), Handler)
    if tls:
        server.socket = tls.wrap_socket(server.socket, server_side=True)
    server.daemon_threads = True
    server.app = app
    def reap_sessions():
        while True:
            time.sleep(1)
            server.app.reap()
    threading.Thread(target=reap_sessions, daemon=True).start()
    print(f"Incus Panel disponível em {'https' if tls else 'http'}://{host}:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        for client in server.app.service.hosts.values():
            if hasattr(client, "close"):
                client.close()


if __name__ == "__main__":
    main()
