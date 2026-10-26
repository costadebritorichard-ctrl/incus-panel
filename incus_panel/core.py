"""Contratos, política de acesso e transporte Incus sem dependências externas."""
import copy
import hashlib
import http.client
import json
import re
import ssl
import threading
import time
import uuid
from urllib.parse import urlencode, urlsplit


class PanelError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def name(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}", value) or value in (".", ".."):
        raise PanelError(400, "Nome inválido.")
    return value


def redact(value):
    if isinstance(value, dict):
        return {k: ("[oculto]" if re.search(r"secret|password|token|certificate|private|cloud-init|user\.|environment\.", k, re.I) else redact(v)) for k, v in value.items()}
    if isinstance(value, list):
        return [redact(v) for v in value]
    if isinstance(value, str) and ("-----BEGIN" in value or re.search(r"(?:token|password|secret)\s*[:=]", value, re.I)):
        return "[oculto]"
    return value


def storage_alert(resources, warning=80, critical=90):
    space = resources.get("space", {})
    total, used = space.get("total"), space.get("used")
    if total is None or used is None or total <= 0:
        return {"percent": None, "level": "desconhecido"}
    percent = used / total * 100
    return {"percent": percent, "level": "crítico" if percent >= critical else "aviso" if percent >= warning else "normal"}


def architecture(value):
    return {"armv7l": "armv7", "armhf": "armv7", "armv7": "armv7", "aarch64": "arm64", "arm64": "arm64", "x86_64": "amd64", "x86-64": "amd64", "amd64": "amd64"}.get(value, value)


class Incus:
    def __init__(self, config):
        self.config = config
        self.url = urlsplit(config["url"])
        if self.url.scheme != "https" or not self.url.hostname or self.url.username or self.url.path not in ("", "/") or self.url.query or self.url.fragment:
            raise ValueError("O destino fixo deve ser uma origem HTTPS.")
        self.context = ssl.create_default_context(cafile=config["ca"])
        self.context.load_cert_chain(config["certificate"], config["key"])
        self.fingerprint = config["fingerprint"].replace(":", "").lower()
        if not re.fullmatch(r"[a-f0-9]{64}", self.fingerprint):
            raise ValueError("Fingerprint SHA-256 obrigatório.")

    def request(self, method, path, project, body=None, etag=None):
        conn = http.client.HTTPSConnection(self.url.hostname, self.url.port or 8443, context=self.context, timeout=15)
        try:
            conn.connect()
            actual = hashlib.sha256(conn.sock.getpeercert(binary_form=True)).hexdigest()
            if actual != self.fingerprint:
                raise PanelError(502, "Fingerprint TLS divergente. Verifique a identidade do servidor.")
            query = urlencode({"project": project, "recursion": 1})
            headers = {"Content-Type": "application/json"}
            if etag:
                headers["If-Match"] = etag
            conn.request(method, path + "?" + query, json.dumps(body) if body is not None else None, headers)
            response = conn.getresponse()
            raw = response.read(8 * 1024 * 1024 + 1)
            if len(raw) > 8 * 1024 * 1024:
                raise PanelError(502, "Resposta Incus excedeu o limite.")
            if response.status >= 400:
                messages = {401: "Identidade Incus recusada.", 403: "Sem permissão no Incus.", 404: "Recurso ausente ou não suportado.", 409: "Conflito no recurso.", 412: "Configuração alterada; recarregue antes de salvar."}
                raise PanelError(response.status, messages.get(response.status, "Incus recusou a operação. Consulte o administrador."))
            data = json.loads(raw)
            if data.get("type") == "error":
                raise PanelError(502, "Incus informou falha.")
            return data
        except ssl.SSLError as exc:
            raise PanelError(502, "Falha de confiança TLS.") from exc
        except (OSError, http.client.HTTPException) as exc:
            raise PanelError(503, "Servidor indisponível; o último estado pode estar desatualizado.") from exc
        finally:
            conn.close()


class Demo:
    """Fixture explícita; não representa medições ou recursos reais."""
    def __init__(self):
        self.lock = threading.RLock()
        self.instances = {}
        self.operations = {}
        for project in ("laboratorio", "redes"):
            for n, status in (("lab-web", "Running"), ("lab-db", "Stopped")):
                self.instances[project, n] = {"name": n, "type": "container", "status": status, "architecture": "armv7l", "profiles": ["default"], "config": {"limits.memory": "128MiB", "security.protection.delete": "false"}, "expanded_config": {"limits.memory": "128MiB"}, "devices": {}, "expanded_devices": {"root": {"type": "disk", "pool": "lab", "path": "/"}, "eth0": {"type": "nic", "network": "labbr0"}}, "snapshots": [], "backups": []}

    def request(self, method, path, project, body=None, etag=None):
        with self.lock:
            data = self._request(method, path, project, body or {})
            return copy.deepcopy(data)

    def _request(self, method, path, project, body):
        parts = path.strip("/").split("/")
        result = None
        if method == "GET":
            if path == "/1.0":
                result = {"auth": "trusted", "api_extensions": ["projects", "resources", "virtual-machines"], "environment": {"server_name": "host-demo", "server_version": "6.0.4 (fixture)", "kernel_architecture": "armv7l", "server_clustered": False}}
            elif path == "/1.0/resources":
                result = {"memory": {"total": 1039138816, "used": 387973120}, "cpu": {"total": 4}}
            elif path == "/1.0/projects":
                result = [{"name": p, "description": "Project de demonstração", "config": {"features.images": "true"}} for p in ("laboratorio", "redes")]
            elif path == "/1.0/instances":
                result = [v for (p, _), v in self.instances.items() if p == project]
            elif path == "/1.0/images":
                result = [{"fingerprint": "a" * 64, "architecture": "armv7l", "type": "container", "aliases": [{"name": "debian-lab"}], "properties": {"description": "Debian • fixture local"}, "size": 50000000}]
            elif path == "/1.0/profiles":
                result = [{"name": "default", "config": {}, "devices": {"root": {"type": "disk", "path": "/", "pool": "lab"}, "eth0": {"type": "nic", "network": "labbr0"}}}]
            elif path == "/1.0/networks":
                result = [{"name": "labbr0", "type": "bridge", "managed": True, "status": "Created", "config": {"ipv4.nat": "true", "ipv4.address": "10.100.0.1/24"}}]
            elif path == "/1.0/storage-pools":
                result = [{"name": "lab", "driver": "btrfs", "status": "Created"}]
            elif len(parts) >= 3 and parts[1] == "storage-pools":
                result = {"space": {"total": 3221225472, "used": round(3221225472 * .93)}} if parts[-1] == "resources" else []
            elif path == "/1.0/operations":
                result = {"success": list(self.operations.values())}
            elif len(parts) == 3 and parts[1] == "operations":
                result = self.operations.get(parts[2])
            elif len(parts) >= 3 and parts[1] == "instances":
                instance = self.instances.get((project, parts[2]))
                if instance is None:
                    raise PanelError(404, "Container não encontrado.")
                if len(parts) == 3:
                    result = instance
                elif parts[3] == "state":
                    result = {"status": instance["status"], "memory": {"usage": 33554432 if instance["status"] == "Running" else None}, "cpu": {"usage": None}, "network": {}}
                elif parts[3] in ("snapshots", "backups"):
                    result = instance[parts[3]]
        else:
            if path == "/1.0/instances" and method == "POST":
                key = (project, body["name"])
                if key in self.instances:
                    raise PanelError(409, "Nome já existe neste Project.")
                self.instances[key] = {"name": body["name"], "type": "container", "architecture": "armv7l", "status": "Stopped", "profiles": body["profiles"], "config": {}, "devices": {}, "expanded_devices": {}, "snapshots": [], "backups": []}
            elif len(parts) >= 3 and parts[1] == "instances":
                key = (project, parts[2])
                if key not in self.instances:
                    raise PanelError(404, "Container não encontrado.")
                instance = self.instances[key]
                if len(parts) == 3 and method == "DELETE":
                    del self.instances[key]
                elif parts[-1] == "state":
                    instance["status"] = "Stopped" if body["action"] == "stop" else "Running"
                elif parts[-1] in ("snapshots", "backups"):
                    instance[parts[-1]].append({"name": body["name"], "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
                else:
                    raise PanelError(501, "Operação não disponível na demonstração.")
            else:
                raise PanelError(404, "Recurso não encontrado.")
            operation = str(uuid.uuid4())
            self.operations[operation] = {"id": operation, "status": "Success", "status_code": 200, "description": method + " " + path, "may_cancel": False, "metadata": {}, "err": ""}
            return {"type": "async", "operation": "/1.0/operations/" + operation, "metadata": self.operations[operation]}
        if result is None:
            raise PanelError(404, "Recurso não disponível.")
        return {"type": "sync", "metadata": result}


class Service:
    def __init__(self, config):
        self.config = config
        self.hosts = {h["id"]: (Demo() if config.get("demo") else Incus(h)) for h in config["hosts"]}
        self.audit = []
        self.lock = threading.RLock()

    def context(self, user, host, project):
        if host not in self.hosts or project not in user.get("scopes", {}).get(host, []):
            raise PanelError(403, "Host ou Project fora do escopo autorizado.")
        return self.hosts[host]

    def read(self, user, host, project, resource, target=None, extra=None):
        client = self.context(user, host, project)
        allowed = {"server": "/1.0", "resources": "/1.0/resources", "instances": "/1.0/instances", "images": "/1.0/images", "profiles": "/1.0/profiles", "networks": "/1.0/networks", "pools": "/1.0/storage-pools", "operations": "/1.0/operations"}
        if resource == "projects":
            # Never request a global project inventory with a broad proxy identity.
            return [{"name": p} for p in user["scopes"][host]]
        if resource == "audit":
            return [r for r in self.audit if r["host"] == host and r["project"] == project and r["identity"] == user["username"]]
        if resource in ("instance", "state", "snapshots", "backups"):
            path = "/1.0/instances/" + name(target)
            if resource != "instance":
                path += "/" + resource
        elif resource in ("pool-resources", "volumes"):
            path = "/1.0/storage-pools/" + name(target) + ("/resources" if resource == "pool-resources" else "/volumes")
        elif resource == "operation":
            path = "/1.0/operations/" + name(target)
        elif resource in allowed:
            path = allowed[resource]
        else:
            raise PanelError(404, "Consulta não permitida.")
        # Host-global physical metrics may expose other projects. Explicit opt-in per identity.
        if resource in ("resources", "pools", "pool-resources", "volumes") and not user.get("host_metrics", False):
            raise PanelError(403, "Métricas globais não autorizadas para esta identidade.")
        data = client.request("GET", path, project)["metadata"]
        if resource == "server":
            data = {k: data[k] for k in ("auth", "api_extensions", "environment", "api_version") if k in data}
            data.get("environment", {}).pop("certificate", None)
        return redact(data)

    def mutate(self, user, host, project, action, target, body):
        client = self.context(user, host, project)
        if self.config.get("read_only", True) or user["role"] == "observador":
            raise PanelError(403, "Modo somente leitura ou papel sem permissão.")
        name(target)
        allowed = self.config.get("mutable_instances", {}).get(host, {}).get(project, [])
        if target not in allowed:
            raise PanelError(403, "Alvo fora da lista explícita de containers de teste.")
        expected = f"{host}/{project}/{target}"
        if body.get("confirmation") != expected:
            raise PanelError(400, "Confirme o alvo completo: " + expected)
        path = "/1.0/instances/" + target
        method, payload = "POST", {}
        if action == "create":
            server = client.request("GET", "/1.0", project)["metadata"]
            images = client.request("GET", "/1.0/images", project)["metadata"]
            image = next((i for i in images if i["fingerprint"] == body.get("image")), None)
            host_arch = server.get("environment", {}).get("kernel_architecture")
            if not image or image.get("type", "container") != "container" or architecture(image.get("architecture")) != architecture(host_arch):
                raise PanelError(400, "Imagem ausente ou incompatível com a arquitetura do host.")
            profiles = body.get("profiles", ["default"])
            known = {p["name"] for p in client.request("GET", "/1.0/profiles", project)["metadata"]}
            if not isinstance(profiles, list) or not profiles or any(p not in known for p in profiles):
                raise PanelError(400, "Selecione profiles existentes.")
            payload = {"name": target, "type": "container", "source": {"type": "image", "fingerprint": image["fingerprint"]}, "profiles": profiles}
            path = "/1.0/instances"
        else:
            instance = client.request("GET", path, project)["metadata"]
            if instance.get("type") != "container":
                raise PanelError(403, "Somente containers são permitidos.")
            if action in ("start", "stop", "restart"):
                if (action == "start" and instance["status"] != "Stopped") or (action != "start" and instance["status"] != "Running"):
                    raise PanelError(409, "Estado mudou ou ação incompatível; atualize.")
                method, path, payload = "PUT", path + "/state", {"action": action, "timeout": 30, "force": False}
            elif action in ("snapshot", "backup"):
                path += "/snapshots" if action == "snapshot" else "/backups"
                payload = {"name": name(body.get("name"))}
                if action == "snapshot":
                    payload["stateful"] = False
            elif action == "delete":
                if user["role"] != "administrador" or instance["status"] != "Stopped" or instance.get("config", {}).get("security.protection.delete") == "true":
                    raise PanelError(403, "Exclusão exige administrador, container parado e sem proteção.")
                method = "DELETE"
            else:
                raise PanelError(400, "Ação não permitida.")
        record = {"identity": user["username"], "host": host, "project": project, "target": target, "action": action, "timestamp": time.time(), "result": "solicitada"}
        with self.lock:
            self.audit.append(record)
            self.audit[:] = self.audit[-200:]
        try:
            response = client.request(method, path, project, payload)
            operation = response.get("operation", "")
            if response.get("type") != "async" or not re.fullmatch(r"/1.0/operations/[a-f0-9-]{36}", operation):
                raise PanelError(502, "Incus não retornou uma operação rastreável; verifique o estado antes de repetir.")
            record["result"] = "aceita; aguardando Incus"
            record["operation"] = operation.rsplit("/", 1)[-1]
            return {"operation": record["operation"]}
        except PanelError:
            record["result"] = "falha ou resultado incerto; consultar Incus"
            raise
