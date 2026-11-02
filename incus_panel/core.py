"""Contratos, política de acesso e transporte Incus sem dependências externas."""
import copy
import hashlib
import http.client
import ipaddress
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


EDITABLE_CONFIG = frozenset(('limits.memory', 'limits.cpu', 'boot.autostart', 'security.protection.delete'))


def edit_revision(instance):
    values = {'description': instance.get('description', ''),
              'config': {k: instance.get('config', {}).get(k, '') for k in sorted(EDITABLE_CONFIG)}}
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()


def edit_payload(body, instance):
    changes = body.get('changes')
    if not isinstance(changes, dict) or not changes or set(changes) - {'description', 'config'}:
        raise PanelError(400, 'Informe os campos editáveis do container.')
    payload = {'description': instance.get('description', '')}
    if 'description' in changes:
        description = changes['description']
        if not isinstance(description, str) or len(description) > 1024:
            raise PanelError(400, 'A descrição deve ter até 1024 caracteres.')
        payload['description'] = description
    if 'config' in changes:
        config = changes['config']
        if not isinstance(config, dict) or not config or set(config) - EDITABLE_CONFIG:
            raise PanelError(400, 'Configuração não permitida no editor.')
        for key, value in config.items():
            if not isinstance(value, str):
                raise PanelError(400, 'Os valores da configuração devem ser texto.')
            if value == '':
                continue  # Remove apenas a configuração local; o perfil continua válido.
            if key == 'limits.memory' and not re.fullmatch(r'(?:[1-9][0-9]{0,5}(?:\.[0-9]{1,2})?(?:MiB|GiB)|(?:[1-9]|[1-9][0-9]|100)%)', value):
                raise PanelError(400, 'Memória inválida. Use, por exemplo, 256MiB, 1GiB ou 50%.')
            if key == 'limits.cpu' and (not re.fullmatch(r'[1-9][0-9]{0,3}', value) or int(value) > 1024):
                raise PanelError(400, 'CPU inválida. Informe de 1 a 1024 núcleos.')
            if key in ('boot.autostart', 'security.protection.delete') and value not in ('true', 'false'):
                raise PanelError(400, 'Selecione ativado, desativado ou herdar do perfil.')
        payload['config'] = dict(config)
    return payload


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
            etag_value = response.getheader("ETag")
            if isinstance(etag_value, str):
                data["_etag"] = etag_value
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
        self.images = {project: [{"fingerprint": "a" * 64, "architecture": "armv7l", "type": "container", "aliases": [{"name": "debian-lab"}], "properties": {"description": "Debian • fixture local"}, "size": 50000000}]
                       for project in ("laboratorio", "redes")}
        for project in ("laboratorio", "redes"):
            for n, status in (("lab-web", "Running"), ("lab-db", "Stopped")):
                self.instances[project, n] = {"name": n, "type": "container", "status": status, "architecture": "armv7l", "profiles": ["default"], "config": {"limits.memory": "128MiB", "security.protection.delete": "false"}, "expanded_config": {"limits.memory": "128MiB"}, "devices": {}, "expanded_devices": {"root": {"type": "disk", "pool": "lab", "path": "/"}, "eth0": {"type": "nic", "network": "labbr0"}}, "snapshots": [], "backups": []}

    def request(self, method, path, project, body=None, etag=None):
        with self.lock:
            if etag and method == 'PATCH':
                current = self.instances.get((project, path.rsplit('/', 1)[-1]))
                if current is None or etag != edit_revision(current):
                    raise PanelError(412, 'Configuração alterada; recarregue antes de salvar.')
            data = self._request(method, path, project, body or {})
            if method == 'GET' and re.fullmatch(r'/1.0/instances/[^/]+', path):
                data['_etag'] = edit_revision(data['metadata'])
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
                result = self.images.get(project, [])
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
            if path == '/1.0/images' and method == 'POST':
                alias = body['source']['alias']
                fingerprint = hashlib.sha256(alias.encode()).hexdigest()
                if not any(image['fingerprint'] == fingerprint for image in self.images.get(project, [])):
                    self.images.setdefault(project, []).append({
                        'fingerprint': fingerprint, 'architecture': 'armv7l', 'type': 'container',
                        'aliases': copy.deepcopy(body.get('aliases', [])),
                        'properties': {'description': alias + ' • fixture local'}, 'size': 25000000})
            elif path == "/1.0/instances" and method == "POST":
                key = (project, body["name"])
                if key in self.instances:
                    raise PanelError(409, "Nome já existe neste Project.")
                self.instances[key] = {"name": body["name"], "type": "container", "architecture": "armv7l", "status": "Stopped", "profiles": body["profiles"], "description": body.get("description", ""), "config": copy.deepcopy(body.get("config", {})), "expanded_config": copy.deepcopy(body.get("config", {})), "devices": copy.deepcopy(body.get("devices", {})), "expanded_devices": copy.deepcopy(body.get("devices", {})), "snapshots": [], "backups": []}
            elif len(parts) >= 3 and parts[1] == "instances":
                key = (project, parts[2])
                if key not in self.instances:
                    raise PanelError(404, "Container não encontrado.")
                instance = self.instances[key]
                if len(parts) == 3 and method == 'PATCH':
                    instance['description'] = body.get('description', instance.get('description', ''))
                    config = instance.setdefault('config', {})
                    expanded = instance.setdefault('expanded_config', {})
                    for key, value in body.get('config', {}).items():
                        if value == '':
                            config.pop(key, None)
                            expanded.pop(key, None)
                        else:
                            config[key] = value
                            expanded[key] = value
                    return {'type': 'sync', 'metadata': {}}
                elif len(parts) == 3 and method == "DELETE":
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
            if path == '/1.0/images':
                self.operations[operation]['metadata']['fingerprint'] = fingerprint
            return {"type": "async", "operation": "/1.0/operations/" + operation, "metadata": self.operations[operation]}
        if result is None:
            raise PanelError(404, "Recurso não disponível.")
        return {"type": "sync", "metadata": result}


class Service:
    def __init__(self, config, clients=None):
        self.config = config
        self.low_resource = config.get('low_resource', True)
        self.creation_lock = threading.Lock()
        def connect(host):
            if clients and host["id"] in clients:
                return clients[host["id"]]
            if config.get("demo"):
                return Demo()
            if host.get("transport") == "unix":
                from .unix_transport import UnixIncus
                return UnixIncus(host)
            if host.get("transport") == "ssh":
                from .ssh_transport import SSHIncus
                return SSHIncus(host)
            return Incus(host)
        self.hosts = {h["id"]: connect(h) for h in config["hosts"]}
        self.audit = []
        self.launches = {}
        self.lock = threading.RLock()

    def context(self, user, host, project):
        if host not in self.hosts or project not in user.get("scopes", {}).get(host, []):
            raise PanelError(403, "Host ou Project fora do escopo autorizado.")
        return self.hosts[host]

    def can_manage(self, user, host, project, target):
        self.context(user, host, project)
        return (user['role'] == 'administrador' and self.config.get('manage_all_instances', False)) or target in self.config.get('mutable_instances', {}).get(host, {}).get(project, [])

    def read(self, user, host, project, resource, target=None, extra=None):
        client = self.context(user, host, project)
        if resource == 'image-catalog':
            if not self.config.get('allow_remote_images', False):
                raise PanelError(403, 'O download de imagens está desabilitado na configuração do painel.')
            arch = client.request('GET', '/1.0', project)['metadata'].get('environment', {}).get('kernel_architecture')
            from .catalog import index_choices, remote_images
            if self.config.get('demo'):
                return index_choices(['alpine:edge:armhf:default', 'debian:bookworm:armhf:default'], arch)
            return remote_images(arch)
        if resource == 'creation-images':
            arch = client.request('GET', '/1.0', project)['metadata'].get('environment', {}).get('kernel_architecture')
            local = client.request('GET', '/1.0/images', project)['metadata']
            images = [{'id': 'local:' + i['fingerprint'], 'image': i['fingerprint'], 'label': (i.get('properties', {}).get('description') or i['fingerprint'][:12]) + ' (baixada)'}
                      for i in local if i.get('type', 'container') == 'container' and architecture(i.get('architecture')) == architecture(arch)]
            warning = None
            if self.config.get('allow_remote_images') and not self.config.get('demo'):
                from .catalog import remote_images
                try:
                    images += remote_images(arch)
                except PanelError as exc:
                    warning = str(exc)
            return {'images': images, 'warning': warning}
        if resource == 'operation':
            with self.lock:
                job = self.launches.get(target)
                if job and job['host'] == host and job['project'] == project and job['identity'] == user['username']:
                    return redact(copy.deepcopy(job))
        allowed = {"server": "/1.0", "resources": "/1.0/resources", "host-summary": "/1.0/resources", "instances": "/1.0/instances", "instance-list": "/1.0/instances", "images": "/1.0/images", "profiles": "/1.0/profiles", "networks": "/1.0/networks", "pools": "/1.0/storage-pools", "operations": "/1.0/operations"}
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
        if resource in ("resources", "host-summary", "pools", "pool-resources", "volumes") and not user.get("host_metrics", False):
            raise PanelError(403, "Métricas globais não autorizadas para esta identidade.")
        data = client.request("GET", path, project)["metadata"]
        if resource == 'instance-list':
            # Lists need identity/state and the effective deletion guard, never full configs/devices.
            data = [{**{k: item[k] for k in ('name', 'type', 'status', 'architecture') if k in item},
                     'expanded_config': {'security.protection.delete': item.get('expanded_config', {}).get(
                         'security.protection.delete', item.get('config', {}).get('security.protection.delete', 'false'))}}
                    for item in data]
        if resource == 'host-summary':
            data = {'memory': {k: data.get('memory', {})[k] for k in ('used', 'total') if k in data.get('memory', {})},
                    'cpu': {k: data.get('cpu', {})[k] for k in ('total',) if k in data.get('cpu', {})}}
        if resource == 'instance':
            data = copy.deepcopy(data)
            data['_revision'] = edit_revision(data)
        if resource == 'operations' and isinstance(data, dict):
            data = copy.deepcopy(data)
            with self.lock:
                data['panel'] = [redact(copy.deepcopy(job)) for job in self.launches.values()
                                 if job['host'] == host and job['project'] == project and job['identity'] == user['username']]
        if resource == "server":
            data = {k: data[k] for k in ("auth", "api_extensions", "environment", "api_version") if k in data}
            data.get("environment", {}).pop("certificate", None)
        return redact(data)

    def download_image(self, user, host, project, body):
        client = self.context(user, host, project)
        if self.config.get('read_only', True) or user['role'] != 'administrador' or not self.config.get('allow_remote_images', False):
            raise PanelError(403, 'Baixar imagens exige administrador, modo de escrita e downloads habilitados.')
        alias = body.get('remote_image')
        if not isinstance(alias, str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,100}', alias) or '..' in alias:
            raise PanelError(400, 'Selecione uma imagem do catálogo.')
        choices = self.read(user, host, project, 'image-catalog')
        if not any(image['remote_image'] == alias for image in choices):
            raise PanelError(400, 'Imagem ausente do catálogo ou incompatível com a arquitetura do servidor.')
        images = client.request('GET', '/1.0/images', project)['metadata']
        if any(a.get('name') == alias for image in images for a in image.get('aliases', [])):
            raise PanelError(409, 'Esta imagem já está disponível neste projeto.')
        payload = {'public': False, 'auto_update': False, 'aliases': [{'name': alias}],
                   'source': {'type': 'image', 'mode': 'pull', 'server': 'https://images.linuxcontainers.org',
                              'protocol': 'simplestreams', 'image_type': 'container', 'alias': alias}}
        record = {'identity': user['username'], 'host': host, 'project': project, 'target': alias,
                  'action': 'download-image', 'timestamp': time.time(), 'result': 'solicitada'}
        with self.lock:
            self.audit.append(record)
            self.audit[:] = self.audit[-200:]
        try:
            response = client.request('POST', '/1.0/images', project, payload)
            operation = response.get('operation', '')
            if response.get('type') != 'async' or not re.fullmatch(r'/1.0/operations/[a-f0-9-]{36}', operation):
                raise PanelError(502, 'O Incus não retornou uma operação rastreável. Confira Imagens e Tarefas antes de repetir.')
            record.update(result='aceita; aguardando Incus', operation=operation.rsplit('/', 1)[-1])
            return {'operation': record['operation'], 'target': alias}
        except PanelError:
            record['result'] = 'falha ou resultado incerto; consultar Incus'
            raise

    def launch(self, user, host, project, body):
        self.context(user, host, project)
        if not self.creation_lock.acquire(blocking=False):
            raise PanelError(429, 'Já existe uma criação em andamento. Aguarde antes de criar outro container.')
        try:
            return self._launch(user, host, project, body)
        except Exception:
            self.creation_lock.release()
            raise

    def _launch(self, user, host, project, body):
        client = self.context(user, host, project)
        if self.config.get('read_only', True) or user['role'] != 'administrador' or not self.config.get('manage_all_instances'):
            raise PanelError(403, 'Criação automática exige administrador local.')
        if self.low_resource and not self.config.get('demo') and any(h['id'] == host and h.get('transport') == 'unix' for h in self.config['hosts']):
            from .resources import check_creation_memory
            check_creation_memory()
        requested = body.get('target')
        target = name(requested) if requested is not None else 'container-' + uuid.uuid4().hex[:10]
        if requested is not None and (len(target) > 63 or not re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?', target)):
            raise PanelError(400, 'Use um nome de até 63 caracteres, com letras, números e hífens, sem hífen no início ou no fim.')
        with self.lock:
            if len(self.launches) >= 100:
                completed = [key for key, value in self.launches.items() if value['status_code'] >= 200]
                if not completed:
                    raise PanelError(429, 'Aguarde as criações em andamento.')
                del self.launches[completed[0]]
        profiles = client.request('GET', '/1.0/profiles', project)['metadata']
        profile = next((p for p in profiles if p['name'] == 'default'), None)
        devices = copy.deepcopy(profile.get('devices', {})) if profile else {}
        overrides = {}
        if not any(d.get('type') == 'disk' and d.get('path') == '/' for d in devices.values()):
            pools = client.request('GET', '/1.0/storage-pools', project)['metadata']
            pool = next((p for p in pools if p.get('status') == 'Created'), None)
            if not pool:
                raise PanelError(409, 'O Incus não tem armazenamento disponível. Execute novamente o instalador na TV box.')
            overrides['root'] = {'type': 'disk', 'path': '/', 'pool': pool['name']}
        if not any(d.get('type') == 'nic' for d in devices.values()):
            networks = client.request('GET', '/1.0/networks', project)['metadata']
            network = next((n for n in networks if n.get('managed') and n.get('type') == 'bridge' and n.get('status') == 'Created'), None)
            if not network:
                raise PanelError(409, 'O Incus não tem rede de containers disponível. Execute novamente o instalador na TV box.')
            overrides['eth0'] = {'type': 'nic', 'name': 'eth0', 'network': network['name']}
        launch_config = None
        options = body.get('options')
        if options is not None:
            if not isinstance(options, dict) or set(options) - {'memory_mib', 'cpu_cores', 'cpu_allowance', 'autostart', 'start', 'pool', 'disk_gib', 'network', 'ipv4', 'description'}:
                raise PanelError(400, 'Opções de criação inválidas.')
            for key in ('pool', 'network', 'ipv4'):
                if key in options and not isinstance(options[key], str):
                    raise PanelError(400, 'Valor inválido para ' + key + '.')
            def integer(key, default, minimum, maximum):
                value = options.get(key, default)
                if type(value) is not int or not minimum <= value <= maximum:
                    raise PanelError(400, 'Valor inválido para ' + key + '.')
                return value
            for key in ('autostart', 'start'):
                if key in options and type(options[key]) is not bool:
                    raise PanelError(400, 'Valor inválido para ' + key + '.')
            launch_config = {'limits.memory': str(integer('memory_mib', 128, 32, 1048576)) + 'MiB',
                             'limits.cpu': str(integer('cpu_cores', 1, 1, 1024)),
                             'limits.cpu.allowance': str(integer('cpu_allowance', 50 if self.low_resource else 100, 1, 100)) + '%',
                             'boot.autostart': str(options.get('autostart', False)).lower(),
                             'security.privileged': 'false'}
            description = options.get('description', '')
            if not isinstance(description, str) or len(description) > 2048:
                raise PanelError(400, 'Descrição inválida (máximo de 2048 caracteres).')
            if options.get('pool') or 'disk_gib' in options:
                pools = client.request('GET', '/1.0/storage-pools', project)['metadata']
                root_name = next((k for k, d in devices.items() if d.get('type') == 'disk' and d.get('path') == '/'), 'root')
                root = copy.deepcopy(overrides.get(root_name, devices.get(root_name, {'type': 'disk', 'path': '/'})))
                selected_pool = options.get('pool', root.get('pool'))
                pool = next((p for p in pools if p['name'] == selected_pool and p.get('status') == 'Created'), None)
                if not pool:
                    raise PanelError(400, 'Armazenamento indisponível neste projeto.')
                root['pool'] = pool['name']
                if 'disk_gib' in options:
                    if pool.get('driver') not in ('btrfs', 'zfs', 'lvm', 'ceph'):
                        raise PanelError(400, 'Este driver não oferece cota de disco pelo assistente. Use a capacidade do pool.')
                    root['size'] = str(integer('disk_gib', 8, 1, 65536)) + 'GiB'
                overrides[root_name] = root
            if options.get('network') or options.get('ipv4'):
                networks = client.request('GET', '/1.0/networks', project)['metadata']
                nic_name = next((k for k, d in devices.items() if d.get('type') == 'nic'), 'eth0')
                nic = copy.deepcopy(overrides.get(nic_name, devices.get(nic_name, {})))
                selected_network = options.get('network', nic.get('network'))
                network = next((n for n in networks if n['name'] == selected_network and n.get('managed') and n.get('type') == 'bridge' and n.get('status') == 'Created'), None)
                if not network:
                    raise PanelError(400, 'Selecione uma bridge gerenciada disponível neste projeto.')
                # A managed NIC has a network instead of nictype/parent.
                nic = {'type': 'nic', 'name': nic.get('name', nic_name), 'network': network['name']}
                if options.get('ipv4'):
                    try:
                        address = ipaddress.IPv4Address(options['ipv4'])
                        subnet = ipaddress.IPv4Interface(network.get('config', {}).get('ipv4.address', ''))
                        if address not in subnet.network or address in (subnet.ip, subnet.network.network_address, subnet.network.broadcast_address):
                            raise ValueError()
                        if network.get('config', {}).get('ipv4.dhcp') == 'false':
                            raise ValueError()
                    except (ValueError, TypeError, ipaddress.AddressValueError):
                        raise PanelError(400, 'IPv4 deve ser um endereço livre na sub-rede da bridge, com DHCP habilitado.')
                    nic['ipv4.address'] = str(address)
                overrides[nic_name] = nic
        request = {k: body[k] for k in ('image', 'remote_image') if k in body}
        request.update(confirmation=f'{host}/{project}/{target}', profiles=['default'] if profile else [])
        if options is not None:
            request['description'] = description
        # Internal defaults only; arbitrary devices are never accepted from HTTP.
        result = self.mutate(user, host, project, 'create', target, request, launch_devices=overrides, launch_config=launch_config)
        job_id = str(uuid.uuid4())
        job = {'id': job_id, 'host': host, 'project': project, 'identity': user['username'], 'target': target,
               'description': 'Criar e iniciar ' + target, 'status': 'Baixando imagem e criando container', 'status_code': 100,
               'metadata': {}, 'phase': 'create', 'err': '', 'incus_operation': result['operation'], 'start_after_create': (options or {}).get('start', True)}
        if not job['start_after_create']:
            job['description'] = 'Criar ' + target
        with self.lock:
            self.launches[job_id] = job
        threading.Thread(target=self._finish_launch, args=(client, project, target, job), daemon=True).start()
        return {'operation': job_id, 'target': target}

    def _finish_launch(self, client, project, target, job):
        try:
            for phase in ('create', 'start'):
                deadline = time.monotonic() + 1800
                while time.monotonic() < deadline:
                    state = client.request('GET', '/1.0/operations/' + job['incus_operation'], project)['metadata']
                    with self.lock:
                        job['metadata'] = redact(state.get('metadata', {}))
                    code = state.get('status_code', 100)
                    if code >= 200:
                        if code != 200 or state.get('err'):
                            raise PanelError(409, state.get('err') or 'O Incus não concluiu a operação.')
                        break
                    time.sleep(5 if self.low_resource else 1)
                else:
                    raise PanelError(504, 'Tempo de espera excedido. Confira o estado no Incus antes de repetir.')
                if phase == 'create':
                    if not job.get('start_after_create', True):
                        break
                    with self.lock:
                        job.update(status='Iniciando container', phase='start', metadata={})
                    result = client.request('PUT', f'/1.0/instances/{target}/state', project, {'action': 'start', 'timeout': 30, 'force': False})
                    operation = result.get('operation', '')
                    if not re.fullmatch(r'/1.0/operations/[a-f0-9-]{36}', operation):
                        raise PanelError(502, 'Não foi possível acompanhar o início do container.')
                    job['incus_operation'] = operation.rsplit('/', 1)[-1]
            with self.lock:
                job.update(status='Verificando container', phase='verify', metadata={})
            instance = client.request('GET', f'/1.0/instances/{target}', project)['metadata']
            expected_status = 'Running' if job.get('start_after_create', True) else 'Stopped'
            if instance.get('status') != expected_status:
                raise PanelError(409, 'Container criado, mas o estado difere do solicitado. Confira o estado no Incus.')
            with self.lock:
                job.update(status='Success', status_code=200, phase='done')
        except Exception as exc:
            with self.lock:
                job.update(status='Failure', status_code=400, err=redact(str(exc))[:2000] if isinstance(exc, PanelError) else 'Falha ao acompanhar a criação. Confira o estado no Incus.')
        finally:
            self.creation_lock.release()

    def mutate(self, user, host, project, action, target, body, launch_devices=None, launch_config=None):
        client = self.context(user, host, project)
        if self.config.get("read_only", True) or user["role"] == "observador":
            raise PanelError(403, "Modo somente leitura ou papel sem permissão.")
        name(target)
        allowed = self.config.get("mutable_instances", {}).get(host, {}).get(project, [])
        if not self.can_manage(user, host, project, target):
            raise PanelError(403, "Alvo fora da lista explícita de containers de teste.")
        expected = f"{host}/{project}/{target}"
        if body.get("confirmation") != expected:
            raise PanelError(400, "Confirme o alvo completo: " + expected)
        path = "/1.0/instances/" + target
        method, payload = "POST", {}
        write_etag = None
        if action == "create":
            server = client.request("GET", "/1.0", project)["metadata"]
            images = client.request("GET", "/1.0/images", project)["metadata"]
            image = next((i for i in images if i["fingerprint"] == body.get("image")), None)
            host_arch = server.get("environment", {}).get("kernel_architecture")
            remote = body.get('remote_image')
            if remote is not None and (not self.config.get('allow_remote_images', False) or not isinstance(remote, str) or not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9/_.-]{0,100}', remote) or '..' in remote):
                raise PanelError(400, 'Alias de imagem remota inválido ou não autorizado.')
            if remote is None and (not image or image.get("type", "container") != "container" or architecture(image.get("architecture")) != architecture(host_arch)):
                raise PanelError(400, "Imagem ausente ou incompatível com a arquitetura do host.")
            profiles = body.get("profiles", ["default"])
            known = {p["name"] for p in client.request("GET", "/1.0/profiles", project)["metadata"]}
            if not isinstance(profiles, list) or (not profiles and launch_devices is None) or any(p not in known for p in profiles):
                raise PanelError(400, "Selecione profiles existentes.")
            payload = {"name": target, "type": "container", "source": {"type": "image", "fingerprint": image["fingerprint"] if image else ""}, "profiles": profiles}
            if remote is not None:
                payload['source'] = {'type': 'image', 'mode': 'pull', 'server': 'https://images.linuxcontainers.org', 'protocol': 'simplestreams', 'alias': remote}
            if launch_devices is not None:
                payload['devices'] = launch_devices
                if self.low_resource:
                    payload['config'] = {'limits.memory': '128MiB', 'limits.cpu.allowance': '50ms/100ms', 'boot.autostart': 'false'}
                if launch_config is not None:
                    payload['config'] = launch_config
                    payload['description'] = body.get('description', '')
            path = "/1.0/instances"
        else:
            instance_response = client.request("GET", path, project)
            instance = instance_response["metadata"]
            if instance.get("type") != "container":
                raise PanelError(403, "Somente containers são permitidos.")
            if action == 'update':
                if user['role'] != 'administrador':
                    raise PanelError(403, 'Somente administradores podem editar configurações.')
                if body.get('revision') != edit_revision(instance):
                    raise PanelError(409, 'A configuração mudou enquanto você editava. Recarregue antes de salvar.')
                method, payload = 'PATCH', edit_payload(body, instance)
                write_etag = instance_response.get('_etag')
                if not isinstance(write_etag, str) or not write_etag:
                    raise PanelError(502, 'O Incus não forneceu uma revisão segura para editar. Recarregue ou confira a versão do servidor.')
            elif action in ("start", "stop", "restart"):
                if (action == "start" and instance["status"] != "Stopped") or (action != "start" and instance["status"] != "Running"):
                    raise PanelError(409, "Estado mudou ou ação incompatível; atualize.")
                method, path, payload = "PUT", path + "/state", {"action": action, "timeout": 30, "force": False}
            elif action in ("snapshot", "backup"):
                path += "/snapshots" if action == "snapshot" else "/backups"
                payload = {"name": name(body.get("name"))}
                if action == "snapshot":
                    payload["stateful"] = False
            elif action == "delete":
                if user["role"] != "administrador" or instance["status"] != "Stopped" or instance.get("expanded_config", {}).get("security.protection.delete", instance.get("config", {}).get("security.protection.delete")) == "true":
                    raise PanelError(403, "Exclusão exige administrador, container parado e sem proteção.")
                method = "DELETE"
            else:
                raise PanelError(400, "Ação não permitida.")
        record = {"identity": user["username"], "host": host, "project": project, "target": target, "action": action, "timestamp": time.time(), "result": "solicitada"}
        with self.lock:
            self.audit.append(record)
            self.audit[:] = self.audit[-200:]
        try:
            response = (client.request(method, path, project, payload, etag=write_etag)
                        if write_etag else client.request(method, path, project, payload))
            if action == 'update' and response.get('type') == 'sync':
                confirmed = client.request('GET', path, project)['metadata']
                matches = confirmed.get('description', '') == payload['description'] and all(
                    confirmed.get('config', {}).get(k, '') == v for k, v in payload.get('config', {}).items())
                if not matches:
                    raise PanelError(409, 'A edição foi recebida, mas a configuração mudou. Recarregue para conferir o resultado.')
                operation_id = str(uuid.uuid4())
                job = {'id': operation_id, 'host': host, 'project': project, 'identity': user['username'],
                       'target': target, 'action': 'update', 'description': 'Editar ' + target,
                       'status': 'Success', 'status_code': 200, 'phase': 'done', 'metadata': {}, 'err': ''}
                with self.lock:
                    if len(self.launches) >= 100:
                        completed = next((k for k, v in self.launches.items() if v['status_code'] >= 200), None)
                        if completed is not None:
                            del self.launches[completed]
                    self.launches[operation_id] = job
                record.update(result='confirmada pelo Incus', operation=operation_id)
                return {'operation': operation_id}
            operation = response.get("operation", "")
            if response.get("type") != "async" or not re.fullmatch(r"/1.0/operations/[a-f0-9-]{36}", operation):
                raise PanelError(502, "Incus não retornou uma operação rastreável; verifique o estado antes de repetir.")
            record["result"] = "aceita; aguardando Incus"
            record["operation"] = operation.rsplit("/", 1)[-1]
            return {"operation": record["operation"]}
        except PanelError:
            record["result"] = "falha ou resultado incerto; consultar Incus"
            raise
