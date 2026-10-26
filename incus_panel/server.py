"""Servidor HTTP local; TLS do navegador deve terminar em proxy reverso confiável."""
import argparse
import hashlib
import hmac
import json
import os
from pathlib import Path
import secrets
import threading
import time
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlsplit

from .core import PanelError, Service

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
    def __init__(self, config):
        self.config = config
        self.service = Service(config)
        self.sessions = {}
        self.failures = {}
        self.lock = threading.RLock()

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
                raise PanelError(401, "Sessão expirada. Entre novamente.")
            return session

    def public_session(self, session):
        user = session["user"]
        return {"username": user["username"], "role": user["role"], "scopes": user["scopes"], "host_metrics": user.get("host_metrics", False), "csrf": session["csrf"], "expires": session["expires"], "demo": self.config.get("demo", False), "read_only": self.config.get("read_only", True), "hosts": [{"id": h["id"], "alias": h["alias"]} for h in self.config["hosts"] if h["id"] in user["scopes"]], "mutable_instances": self.config.get("mutable_instances", {})}


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
                            self.app.sessions.pop(token, None)
                        self.send(200, {"ok": True}, cookie="panel_session=; Max-Age=0; HttpOnly; SameSite=Strict; Path=/")
                        return
                    if path != "/api/action":
                        raise PanelError(404, "Rota não encontrada.")
                    data = self.app.service.mutate(session["user"], body.get("host"), body.get("project"), body.get("action"), body.get("target"), body)
                    self.send(202, data)
                elif path == "/api/session":
                    self.send(200, self.app.public_session(session))
                elif path == "/api/read":
                    query = {k: v[0] for k, v in parse_qs(parsed.query).items()}
                    data = self.app.service.read(session["user"], query.get("host"), query.get("project"), query.get("resource"), query.get("target"))
                    self.send(200, {"data": data, "timestamp": time.time(), "source": "fixture explícita" if self.app.config.get("demo") else "Incus REST"})
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
        if not config.get("users") or not config.get("origin", "").startswith("https://"):
            raise SystemExit("Configure usuários e origem HTTPS via proxy reverso.")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    server.app = Application(config)
    print(f"Incus Panel disponível em http://127.0.0.1:{args.port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
