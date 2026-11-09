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
BRIDGE_CONFIG_KEYS = frozenset((
    'ipv4.address', 'ipv4.dhcp', 'ipv4.nat',
    'ipv6.address', 'ipv6.dhcp', 'ipv6.nat', 'dns.domain',
    'bridge.mtu', 'bridge.multicast_snooping', 'dns.mode',
    'ipv4.dhcp.ranges', 'ipv6.dhcp.ranges', 'ipv4.dhcp.expiry', 'ipv6.dhcp.expiry',
    'ipv6.dhcp.stateful', 'ipv4.routing', 'ipv6.routing', 'ipv4.firewall', 'ipv6.firewall',
))
BRIDGE_BOOLEAN_KEYS = frozenset(('ipv4.dhcp', 'ipv4.nat', 'ipv6.dhcp', 'ipv6.nat', 'ipv6.dhcp.stateful', 'ipv4.routing', 'ipv6.routing', 'ipv4.firewall', 'ipv6.firewall', 'bridge.multicast_snooping'))


def bridge_config(body, *, defaults=False, partial=False):
    if not isinstance(body, dict) or set(body) - BRIDGE_CONFIG_KEYS:
        raise PanelError(400, 'Configuração de bridge contém opções não permitidas.')
    result = {}
    if defaults:
        result.update({'ipv4.address': 'auto', 'ipv4.dhcp': 'true', 'ipv4.nat': 'true',
                       'ipv6.address': 'none', 'ipv6.dhcp': 'false', 'ipv6.nat': 'false'})
    for key, value in body.items():
        if not isinstance(value, str):
            raise PanelError(400, 'As opções de bridge devem ser texto.')
        value = value.strip()
        if not value:
            result.pop(key, None)
            continue
        if key == 'bridge.mtu' and (not value.isdecimal() or not 1280 <= int(value) <= 9000):
            raise PanelError(400, 'MTU deve estar entre 1280 e 9000.')
        if key == 'dns.mode' and value not in ('none', 'managed', 'dynamic'):
            raise PanelError(400, 'Modo DNS inválido.')
        if key.endswith('.expiry') and not re.fullmatch(r'[1-9][0-9]{0,5}[smhdw]', value):
            raise PanelError(400, 'Duração DHCP inválida. Exemplo: 1h ou 24h.')
        if key.endswith('.ranges'):
            try:
                for part in value.split(','):
                    start, end = [ipaddress.ip_address(v.strip()) for v in part.split('-')]
                    if start.version != (4 if key.startswith('ipv4') else 6) or start.version != end.version or start > end:
                        raise ValueError()
            except ValueError as exc:
                raise PanelError(400, 'Faixa DHCP inválida; use endereço-inicial-endereço-final.') from exc
        if key in BRIDGE_BOOLEAN_KEYS:
            if value not in ('true', 'false'):
                raise PanelError(400, 'DHCP e NAT devem estar ativados ou desativados.')
        elif key in ('ipv4.address', 'ipv6.address'):
            if value not in ('auto', 'none'):
                try:
                    address = ipaddress.ip_interface(value)
                    if address.version != (4 if key == 'ipv4.address' else 6):
                        raise ValueError()
                except ValueError as exc:
                    raise PanelError(400, 'Informe auto, none ou um CIDR válido para o endereço da bridge.') from exc
        elif key == 'dns.domain' and (len(value) > 253 or any(not re.fullmatch(r'[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?', label) for label in value.rstrip('.').split('.'))):
            raise PanelError(400, 'Domínio DNS inválido.')
        if value:
            result[key] = value
        else:
            result.pop(key, None)
    if partial:
        return result
    if result.get('ipv4.address') == 'none' and result.get('ipv4.nat') == 'true':
        raise PanelError(400, 'NAT IPv4 exige um endereço IPv4 na bridge.')
    if result.get('ipv6.address') == 'none' and result.get('ipv6.nat') == 'true':
        raise PanelError(400, 'NAT IPv6 exige um endereço IPv6 na bridge.')
    for family in ('ipv4', 'ipv6'):
        address = result.get(family + '.address', '')
        ranges = result.get(family + '.dhcp.ranges', '')
        if address == 'none' and result.get(family + '.dhcp') == 'true':
            raise PanelError(400, 'DHCP exige um endereço ' + family + ' na bridge.')
        if ranges and (address == 'none' or result.get(family + '.dhcp') == 'false'):
            raise PanelError(400, 'Faixas DHCP exigem endereçamento e DHCP habilitados.')
        if family == 'ipv6' and ranges and result.get('ipv6.dhcp.stateful') != 'true':
            raise PanelError(400, 'Faixas IPv6 exigem DHCP stateful habilitado.')
        if ranges and address not in ('', 'auto', 'none'):
            subnet = ipaddress.ip_interface(address)
            previous = []
            for part in ranges.split(','):
                start, end = [ipaddress.ip_address(v.strip()) for v in part.split('-')]
                if start not in subnet.network or end not in subnet.network or start <= subnet.ip <= end or (subnet.version == 4 and (start == subnet.network.network_address or end == subnet.network.broadcast_address)):
                    raise PanelError(400, 'A faixa DHCP deve pertencer à sub-rede e excluir o gateway e endereços reservados.')
                if any(start <= old_end and end >= old_start for old_start, old_end in previous):
                    raise PanelError(400, 'As faixas DHCP não podem se sobrepor.')
                previous.append((start, end))
    return result


def edit_revision(instance):
    values = {'description': instance.get('description', ''),
              'config': {k: instance.get('config', {}).get(k, '') for k in sorted(EDITABLE_CONFIG)}}
    return hashlib.sha256(json.dumps(values, sort_keys=True).encode()).hexdigest()


def network_revision(network):
    values = {'description': network.get('description', ''), 'config': network.get('config') or {}}
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
            try:
                data = json.loads(raw)
            except (ValueError, UnicodeError):
                data = {}
            if response.status >= 400:
                messages = {401: "Identidade Incus recusada.", 403: "Sem permissão no Incus.", 404: "Recurso ausente ou não suportado.", 409: "Conflito no recurso.", 412: "Configuração alterada; recarregue antes de salvar."}
                detail = data.get('error') if isinstance(data, dict) else None
                message = 'Incus: ' + redact(str(detail))[:2000] if detail else messages.get(response.status, "Incus recusou a operação. Consulte o administrador.")
                raise PanelError(response.status, message)
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
        self.networks = {project: [{'name': 'labbr0', 'type': 'bridge', 'managed': True, 'status': 'Created',
                                    'config': {'ipv4.nat': 'true', 'ipv4.address': '10.100.0.1/24'}, 'used_by': []}]
                         for project in ('laboratorio', 'redes')}
        self.images = {project: [{"fingerprint": "a" * 64, "architecture": "armv7l", "type": "container", "aliases": [{"name": "debian-lab"}], "properties": {"description": "Debian • fixture local"}, "size": 50000000}]
                       for project in ("laboratorio", "redes")}
        for project in ("laboratorio", "redes"):
            for n, status in (("lab-web", "Running"), ("lab-db", "Stopped")):
                self.instances[project, n] = {"name": n, "type": "container", "status": status, "architecture": "armv7l", "profiles": ["default"], "config": {"limits.memory": "128MiB", "security.protection.delete": "false"}, "expanded_config": {"limits.memory": "128MiB"}, "devices": {}, "expanded_devices": {"root": {"type": "disk", "pool": "lab", "path": "/"}, "eth0": {"type": "nic", "network": "labbr0"}}, "snapshots": [], "backups": []}

    def request(self, method, path, project, body=None, etag=None):
        with self.lock:
            if etag and method in ('PATCH', 'PUT'):
                if path.startswith('/1.0/networks/'):
                    current = next((item for item in self.networks.get(project, []) if item['name'] == path.rsplit('/', 1)[-1]), None)
                    revision = network_revision(current) if current is not None else None
                else:
                    current = self.instances.get((project, path.rsplit('/', 1)[-1]))
                    revision = hashlib.sha256(json.dumps(current, sort_keys=True).encode()).hexdigest() if current is not None else None
                if current is None or etag != revision:
                    raise PanelError(412, 'Configuração alterada; recarregue antes de salvar.')
            data = self._request(method, path, project, body or {})
            if method == 'GET' and re.fullmatch(r'/1.0/instances/[^/]+', path):
                data['_etag'] = hashlib.sha256(json.dumps(data['metadata'], sort_keys=True).encode()).hexdigest()
            if method == 'GET' and re.fullmatch(r'/1.0/networks/[^/]+', path):
                data['_etag'] = network_revision(data['metadata'])
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
                result = self.networks.get(project, [])
            elif len(parts) == 3 and parts[1] == 'networks':
                result = next((item for item in self.networks.get(project, []) if item['name'] == parts[2]), None)
                if result is None:
                    raise PanelError(404, 'Rede não encontrada.')
            elif len(parts) == 4 and parts[1] == "networks" and parts[3] == "leases":
                result = [{"hostname": "lab-web", "hwaddr": "00:16:3e:12:34:56", "address": "10.100.0.10", "type": "dynamic"}]
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
                publishing = body['source']['type'] == 'instance'
                alias = body['aliases'][0]['name'] if publishing else body['source']['alias']
                fingerprint = hashlib.sha256(alias.encode()).hexdigest()
                if not any(image['fingerprint'] == fingerprint for image in self.images.get(project, [])):
                    self.images.setdefault(project, []).append({
                        'fingerprint': fingerprint, 'architecture': 'armv7l', 'type': 'container',
                        'aliases': copy.deepcopy(body.get('aliases', [])),
                        'properties': copy.deepcopy(body.get('properties', {'description': alias + ' • fixture local'})),
                        'public': body.get('public', False), 'size': 25000000})
            elif path == '/1.0/networks' and method == 'POST':
                if any(item['name'] == body.get('name') for item in self.networks.setdefault(project, [])):
                    raise PanelError(409, 'Uma rede com esse nome já existe neste Project.')
                self.networks[project].append({'name': body['name'], 'description': body.get('description', ''), 'type': body.get('type', 'bridge'), 'managed': True,
                                               'status': 'Created', 'config': copy.deepcopy(body.get('config', {})), 'used_by': []})
            elif len(parts) == 3 and parts[1] == 'networks' and method in ('PUT', 'DELETE'):
                networks = self.networks.get(project, [])
                network = next((item for item in networks if item['name'] == parts[2]), None)
                if network is None:
                    raise PanelError(404, 'Rede não encontrada.')
                if method == 'PUT':
                    network.update({k: copy.deepcopy(v) for k, v in body.items() if k in ('description', 'config')})
                else:
                    networks.remove(network)
            elif path == "/1.0/instances" and method == "POST":
                key = (project, body["name"])
                if key in self.instances:
                    raise PanelError(409, "Nome já existe neste Project.")
                self.instances[key] = {"name": body["name"], "type": "container", "architecture": "armv7l", "status": "Stopped", "profiles": body["profiles"], "description": body.get("description", ""), "config": copy.deepcopy(body.get("config", {})), "expanded_config": copy.deepcopy(body.get("config", {})), "devices": copy.deepcopy(body.get("devices", {})), "expanded_devices": copy.deepcopy(body.get("devices", {})), "snapshots": [], "backups": []}
                if body['source']['type'] == 'copy':
                    original = self.instances[project, body['source']['source']]
                    self.instances[key]['expanded_devices'] = copy.deepcopy(original['expanded_devices'])
                    if not body['source']['instance_only']:
                        self.instances[key]['snapshots'] = [dict(snapshot, name=body['name'] + '/' + snapshot['name'].rsplit('/', 1)[-1]) for snapshot in original['snapshots']]
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
                elif len(parts) == 3 and method == "PUT":
                    snapshot = body.get("restore")
                    known = {str(item.get("name", "")).rsplit("/", 1)[-1] for item in instance["snapshots"]}
                    if snapshot is not None and snapshot not in known:
                        raise PanelError(404, "Snapshot não encontrado.")
                    if snapshot is not None:
                        instance["restored_to"] = snapshot
                        saved = next(item for item in instance['snapshots'] if item['name'].rsplit('/', 1)[-1] == snapshot)
                        for field in ('config', 'devices', 'profiles', 'description', 'ephemeral'):
                            if field in saved:
                                instance[field] = copy.deepcopy(saved[field])
                        instance['expanded_config'] = copy.deepcopy(saved.get('expanded_config', instance['config']))
                    instance["config"] = copy.deepcopy(body.get("config", instance.get("config", {})))
                    instance["devices"] = copy.deepcopy(body.get("devices", instance.get("devices", {})))
                    instance['expanded_devices'] = {**{'root': {'type': 'disk', 'path': '/', 'pool': 'lab'}, 'eth0': {'type': 'nic', 'network': 'labbr0'}}, **copy.deepcopy(instance['devices'])}
                elif parts[-1] == "state":
                    instance["status"] = {'stop': 'Stopped', 'freeze': 'Frozen'}.get(body['action'], 'Running')
                elif len(parts) == 5 and parts[3] in ("snapshots", "backups") and method == "DELETE":
                    collection = instance[parts[3]]
                    artifact = parts[4]
                    match = next((item for item in collection if str(item.get("name", "")).rsplit("/", 1)[-1] == artifact), None)
                    if match is None:
                        raise PanelError(404, "Snapshot ou backup não encontrado.")
                    collection.remove(match)
                elif parts[-1] in ("snapshots", "backups"):
                    saved = {field: copy.deepcopy(instance[field]) for field in ('config', 'expanded_config', 'devices', 'profiles', 'description', 'ephemeral') if field in instance} if parts[-1] == 'snapshots' else {}
                    instance[parts[-1]].append({**saved, "name": parts[2] + "/" + body["name"], "created_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})
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
    def __init__(self, config, clients=None, snapshot_metadata_path=None):
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
        self.operation_results = {}
        self.lock = threading.RLock()
        from .snapshots import SnapshotMetadata
        self.snapshot_metadata = SnapshotMetadata(snapshot_metadata_path)

    def context(self, user, host, project):
        if host not in self.hosts or project not in user.get("scopes", {}).get(host, []):
            raise PanelError(403, "Host ou Project fora do escopo autorizado.")
        return self.hosts[host]

    def snapshot_task_context(self, host, project, operation):
        if not isinstance(operation, dict):
            return operation
        with self.lock:
            record = next((item for item in reversed(self.audit)
                if item.get('operation') == operation.get('id') and item['host'] == host
                and item['project'] == project and item['action'] in ('snapshot', 'snapshot-restore', 'snapshot-delete')), None)
            if record is None:
                return operation
            return {**operation, 'host': host, 'project': project, 'action': record['action'],
                    'target': record['target'], 'snapshot': record.get('snapshot'),
                    'identity': record['identity'], 'requested_at': record['timestamp']}

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
            images = [{'id': 'local:' + i['fingerprint'], 'image': i['fingerprint'], 'label': (i.get('properties', {}).get('description') or i['fingerprint'][:12]) + ' (local)'}
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
                cached = self.operation_results.get((user['username'], host, project, target))
                if cached is not None:
                    return copy.deepcopy(cached)
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
        elif resource == "network-leases":
            path = "/1.0/networks/" + name(target) + "/leases"
        elif resource == "network":
            path = "/1.0/networks/" + name(target)
        elif resource == "operation":
            path = "/1.0/operations/" + name(target)
        elif resource in allowed:
            path = allowed[resource]
        else:
            raise PanelError(404, "Consulta não permitida.")
        # Host-global physical metrics may expose other projects. Explicit opt-in per identity.
        if resource in ("resources", "host-summary", "pools", "pool-resources", "volumes", "network-leases") and not user.get("host_metrics", False):
            raise PanelError(403, "Métricas globais não autorizadas para esta identidade.")
        # Incus removes completed operations after five seconds. A bounded native
        # wait captures their terminal result before a browser polling gap can
        # lose it; transports without wait retain the ordinary GET contract.
        wait_operation = getattr(client, 'wait_operation', None)
        data = (wait_operation(target, project) if resource == 'operation' and callable(wait_operation)
                else client.request("GET", path, project)["metadata"])
        if resource == 'operation':
            self.snapshot_metadata.settle(client, host, project, target, data)
            data = self.snapshot_task_context(host, project, data)
        if resource in ('instances', 'instance-list'):
            data = [item for item in data if item.get('type') == 'container']
        if resource == 'instance' and data.get('type') != 'container':
            raise PanelError(403, 'Somente containers são permitidos neste painel.')
        if resource == 'snapshots':
            self.snapshot_metadata.reconcile(client, host, project, target, data)
            data = self.snapshot_metadata.annotate(host, project, target, data)
        if resource == 'backups':
            from .snapshots import artifact_name
            data = [({**item, 'name': artifact_name(item)} if isinstance(item, dict) else artifact_name(item)) for item in data]
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
            from .networking import devices_revision, disconnected_nics
            data['_devices_revision'] = devices_revision(data)
            data['_disconnected_nics'] = disconnected_nics(data)
        if resource == 'network':
            data = copy.deepcopy(data)
            data['_revision'] = network_revision(data)
        if resource == 'operations' and isinstance(data, dict):
            data = {key: [self.snapshot_task_context(host, project, item) for item in value]
                    if isinstance(value, list) else copy.deepcopy(value) for key, value in data.items()}
            with self.lock:
                data['panel'] = [redact(copy.deepcopy(job)) for job in self.launches.values()
                                 if job['host'] == host and job['project'] == project and job['identity'] == user['username']]
        if resource == "server":
            data = {k: data[k] for k in ("auth", "api_extensions", "environment", "api_version") if k in data}
            data.get("environment", {}).pop("certificate", None)
        data = redact(data)
        if resource == 'operation' and data.get('status_code', 100) >= 200:
            with self.lock:
                key = (user['username'], host, project, target)
                self.operation_results[key] = copy.deepcopy(data)
                if len(self.operation_results) > 100:
                    del self.operation_results[next(iter(self.operation_results))]
        return data

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
        wait_operation = getattr(client, 'wait_operation', None)
        try:
            for phase in ('create', 'start'):
                deadline = time.monotonic() + 1800
                while time.monotonic() < deadline:
                    # The Unix daemon wakes this worker as soon as a phase ends.
                    # Its bounded wait also refreshes progress during long imports.
                    state = (wait_operation(job['incus_operation'], project) if callable(wait_operation)
                             else client.request('GET', '/1.0/operations/' + job['incus_operation'], project)['metadata'])
                    with self.lock:
                        job['metadata'] = redact(state.get('metadata', {}))
                    code = state.get('status_code', 100)
                    if code >= 200:
                        if code != 200 or state.get('err'):
                            raise PanelError(409, state.get('err') or 'O Incus não concluiu a operação.')
                        break
                    if not callable(wait_operation):
                        time.sleep(1)
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

    def mutate_network(self, user, host, project, action, target, body):
        client = self.context(user, host, project)
        if (self.config.get('read_only', True) or user.get('role') != 'administrador'
                or not self.config.get('manage_networks', False)):
            raise PanelError(403, 'A gestão de bridges exige administrador e manage_networks habilitado.')
        if set(body) - {'host', 'project', 'action', 'target', 'confirmation', 'config', 'description', 'name', 'revision'} or body.get('name'):
            raise PanelError(400, 'Campos extras não são aceitos na gestão de bridges.')
        target = name(target)
        expected = f'{host}/{project}/{target}'
        if body.get('confirmation') != expected:
            raise PanelError(400, 'Confirme o alvo completo: ' + expected)
        method, path, payload, etag = 'POST', '/1.0/networks', {}, None
        if action == 'network-create':
            if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,14}', target):
                raise PanelError(400, 'O nome da bridge deve ter até 15 caracteres, usando letras, números, hífen ou sublinhado.')
            current = client.request('GET', '/1.0/networks', project)['metadata']
            if any(item.get('name') == target for item in current):
                raise PanelError(409, 'Uma rede com esse nome já existe neste Project.')
            description = body.get('description', '')
            if not isinstance(description, str) or len(description) > 1024:
                raise PanelError(400, 'A descrição da bridge deve ter até 1024 caracteres.')
            payload = {'name': target, 'type': 'bridge', 'description': description,
                       'config': bridge_config(body.get('config', {}), defaults=True)}
        elif action in ('network-update', 'network-delete'):
            network_response = client.request('GET', '/1.0/networks/' + target, project)
            network = network_response['metadata']
            if body.get('revision') is not None and body['revision'] != network_revision(network):
                raise PanelError(409, 'A bridge mudou enquanto você editava. Atualize antes de salvar.')
            if network.get('type') != 'bridge' or network.get('managed') is not True:
                raise PanelError(403, 'O painel só altera bridges gerenciadas pelo Incus.')
            if (network.get('config') or {}).get('bridge.external_interfaces'):
                raise PanelError(403, 'Esta bridge usa interfaces externas e não pode ser alterada pelo painel.')
            if action == 'network-update':
                raw_config = body.get('config', {})
                normalized = bridge_config(raw_config, partial=True)
                config = dict(network.get('config') or {})
                for key in raw_config:
                    if key in normalized:
                        config[key] = normalized[key]
                    else:
                        config.pop(key, None)
                bridge_config({k: v for k, v in config.items() if k in BRIDGE_CONFIG_KEYS})
                description = body.get('description', network.get('description', ''))
                if not isinstance(description, str) or len(description) > 1024:
                    raise PanelError(400, 'A descrição da bridge deve ter até 1024 caracteres.')
                etag = network_response.get('_etag')
                if not isinstance(etag, str) or not etag:
                    raise PanelError(502, 'O Incus não forneceu uma revisão segura para editar esta bridge.')
                method, path = 'PUT', '/1.0/networks/' + target
                payload = {'description': description, 'config': config}
            else:
                used = {str(item) for item in network.get('used_by', [])}
                profiles = client.request('GET', '/1.0/profiles', project)['metadata']
                instances = client.request('GET', '/1.0/instances', project)['metadata']
                def references(devices):
                    return any(device.get('type') == 'nic' and
                               (device.get('network') == target or device.get('parent') == target)
                               for device in (devices or {}).values())
                for profile in profiles:
                    if references(profile.get('devices')):
                        used.add('profile: ' + profile['name'])
                for instance in instances:
                    if references(instance.get('expanded_devices') or instance.get('devices')):
                        used.add('container: ' + instance.get('name', 'desconhecido'))
                if used:
                    names = ', '.join(sorted(used)[:8])
                    raise PanelError(409, 'Bridge em uso. Remova suas dependências antes de excluir: ' + names + '.')
                method, path = 'DELETE', '/1.0/networks/' + target
        else:
            raise PanelError(400, 'Ação de rede não permitida.')
        record = {'identity': user['username'], 'host': host, 'project': project, 'target': target,
                  'action': action, 'timestamp': time.time(), 'result': 'solicitada'}
        with self.lock:
            self.audit.append(record)
            self.audit[:] = self.audit[-200:]
        try:
            response = client.request(method, path, project, payload, etag=etag) if etag else client.request(method, path, project, payload)
            if response.get('type') == 'sync':
                if action == 'network-delete':
                    remaining = client.request('GET', '/1.0/networks', project)['metadata']
                    confirmed = not any(n.get('name') == target for n in remaining)
                else:
                    actual = client.request('GET', '/1.0/networks/' + target, project)['metadata']
                    confirmed = actual.get('description', '') == payload.get('description', '') and all(
                        actual.get('config', {}).get(k) == v or (v == 'auto' and actual.get('config', {}).get(k) not in (None, 'auto', 'none'))
                        for k, v in payload.get('config', {}).items())
                    if action == 'network-update':
                        removed = set(network.get('config') or {}) - set(payload['config'])
                        confirmed = confirmed and all(not actual.get('config', {}).get(k) for k in removed)
                if not confirmed:
                    raise PanelError(409, 'O Incus respondeu, mas a configuração não foi confirmada. Atualize a lista.')
                operation_id = self.completed_operation(user, host, project, action, target)
                record.update(result='confirmada pelo Incus', operation=operation_id)
                return {'operation': operation_id}
            operation = response.get('operation', '')
            if response.get('type') != 'async' or not re.fullmatch(r'/1.0/operations/[a-f0-9-]{36}', operation):
                raise PanelError(502, 'Incus não retornou uma operação rastreável; confira a lista de bridges antes de repetir.')
            record.update(result='aceita; aguardando Incus', operation=operation.rsplit('/', 1)[-1])
            return {'operation': record['operation']}
        except PanelError:
            record['result'] = 'falha ou resultado incerto; consultar Incus'
            raise

    def completed_operation(self, user, host, project, action, target):
        operation_id = str(uuid.uuid4())
        with self.lock:
            if len(self.launches) >= 100:
                completed = next((k for k, v in self.launches.items() if v['status_code'] >= 200), None)
                if completed is not None:
                    del self.launches[completed]
            self.launches[operation_id] = {'id': operation_id, 'host': host, 'project': project,
                'identity': user['username'], 'target': target, 'action': action, 'description': action + ' ' + target,
                'status': 'Success', 'status_code': 200, 'phase': 'done', 'metadata': {}, 'err': ''}
        return operation_id

    def mutate(self, user, host, project, action, target, body, launch_devices=None, launch_config=None):
        client = self.context(user, host, project)
        if action in ('network-create', 'network-update', 'network-delete'):
            return self.mutate_network(user, host, project, action, target, body)
        if self.config.get("read_only", True) or user["role"] == "observador":
            raise PanelError(403, "Modo somente leitura ou papel sem permissão.")
        name(target)
        allowed = self.config.get("mutable_instances", {}).get(host, {}).get(project, [])
        if not self.can_manage(user, host, project, target):
            raise PanelError(403, "Alvo fora da lista explícita de containers de teste.")
        expected = f"{host}/{project}/{target}"
        if action in ("snapshot-restore", "snapshot-delete", "snapshot-edit"):
            expected += "/" + name(body.get("snapshot"))
        elif action == "backup-delete":
            expected += "/" + name(body.get("backup"))
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
            if action in ('nic-add', 'nic-update', 'nic-delete', 'nic-reset'):
                from .networking import nic_payload
                if user['role'] != 'administrador' or not self.config.get('manage_networks', False):
                    raise PanelError(403, 'A gestão de interfaces exige administrador e gestão de redes habilitada.')
                method, payload = 'PUT', nic_payload(client, project, target, instance, action, body)
                write_etag = instance_response.get('_etag')
                if not write_etag:
                    raise PanelError(502, 'Incus não forneceu revisão segura para editar a interface.')
            elif action == 'update':
                if user['role'] != 'administrador':
                    raise PanelError(403, 'Somente administradores podem editar configurações.')
                if body.get('revision') != edit_revision(instance):
                    raise PanelError(409, 'A configuração mudou enquanto você editava. Recarregue antes de salvar.')
                method, payload = 'PATCH', edit_payload(body, instance)
                write_etag = instance_response.get('_etag')
                if not isinstance(write_etag, str) or not write_etag:
                    raise PanelError(502, 'O Incus não forneceu uma revisão segura para editar. Recarregue ou confira a versão do servidor.')
            elif action in ("start", "stop", "restart", "force-stop", "freeze", "unfreeze"):
                states = {'start': ('Stopped',), 'stop': ('Running',), 'restart': ('Running',),
                          'force-stop': ('Running', 'Frozen'), 'freeze': ('Running',), 'unfreeze': ('Frozen',)}
                if instance['status'] not in states[action]:
                    raise PanelError(409, "Estado mudou ou ação incompatível; atualize.")
                method, path, payload = "PUT", path + "/state", {"action": 'stop' if action == 'force-stop' else action,
                    "timeout": 0 if action == 'force-stop' else 30, "force": action == 'force-stop'}
            elif action == 'clone':
                if user['role'] != 'administrador':
                    raise PanelError(403, 'Clonar containers exige administrador.')
                destination = name(body.get('name'))
                if not re.fullmatch(r'[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?', destination):
                    raise PanelError(400, 'Use letras, números e hífens no nome do clone.')
                if not self.can_manage(user, host, project, destination):
                    raise PanelError(403, 'O nome do clone está fora da lista de containers autorizados.')
                include_snapshots = body.get('include_snapshots', False)
                if not isinstance(include_snapshots, bool):
                    raise PanelError(400, 'A opção de incluir snapshots deve ser booleana.')
                if any(item['name'] == destination for item in client.request('GET', '/1.0/instances', project)['metadata']):
                    raise PanelError(409, 'Já existe um container com o nome do clone neste projeto.')
                if self.low_resource and not self.config.get('demo') and any(h['id'] == host and h.get('transport') == 'unix' for h in self.config['hosts']):
                    from .resources import check_creation_memory
                    check_creation_memory()
                path = '/1.0/instances'
                payload = {'name': destination, 'type': 'container', 'ephemeral': False,
                           'source': {'type': 'copy', 'source': target, 'project': project, 'live': False, 'instance_only': not include_snapshots},
                           'profiles': instance.get('profiles', []), 'devices': copy.deepcopy(instance.get('devices', {})),
                           'description': instance.get('description', ''),
                           'config': {**{key: value for key, value in instance.get('config', {}).items() if not key.startswith('volatile.')}, 'boot.autostart': 'false'}}
            elif action == 'template':
                if user['role'] != 'administrador':
                    raise PanelError(403, 'Criar modelos exige administrador.')
                if instance['status'] != 'Stopped':
                    raise PanelError(409, 'Desligue o container antes de criar o modelo.')
                alias = name(body.get('name'))
                images = client.request('GET', '/1.0/images', project)['metadata']
                if any(entry.get('name') == alias for image in images for entry in image.get('aliases', [])):
                    raise PanelError(409, 'Já existe uma imagem com esse nome neste projeto.')
                path = '/1.0/images'
                payload = {'source': {'type': 'instance', 'name': target}, 'public': False,
                           'aliases': [{'name': alias}], 'properties': {'description': alias}}
            elif action in ("snapshot", "backup"):
                artifact_name = name(body.get("name"))
                if action == 'snapshot':
                    description = body.get('description', '')
                    if not isinstance(description, str) or len(description) > 1024:
                        raise PanelError(400, 'A descrição deve ter no máximo 1024 caracteres.')
                    current = client.request('GET', path + '/snapshots', project)['metadata']
                    from .snapshots import artifact_name as snapshot_name
                    known = {snapshot_name(item) for item in current}
                    if artifact_name in known:
                        raise PanelError(409, f'Já existe um snapshot chamado {artifact_name} neste container. Escolha outro nome.')
                    # Fail before requesting a disk operation if annotations cannot be persisted.
                    self.snapshot_metadata.update(lambda data: None)
                path += "/snapshots" if action == "snapshot" else "/backups"
                payload = {"name": artifact_name}
                if action == "snapshot":
                    payload["stateful"] = False
            elif action in ("snapshot-restore", "snapshot-delete", "snapshot-edit", "backup-delete"):
                if user["role"] != "administrador":
                    raise PanelError(403, "Gerenciar ou restaurar snapshots e backups exige administrador.")
                artifact = name(body.get("snapshot" if action.startswith("snapshot-") else "backup"))
                collection = "snapshots" if action.startswith("snapshot-") else "backups"
                current = client.request("GET", path + "/" + collection, project)["metadata"]
                from .snapshots import artifact_name as snapshot_name
                known = {snapshot_name(item) for item in current}
                if artifact not in known:
                    raise PanelError(404, "Snapshot ou backup não encontrado neste container.")
                if action == 'snapshot-edit':
                    description = body.get('description', '')
                    if not isinstance(description, str) or len(description) > 1024:
                        raise PanelError(400, 'A descrição deve ter no máximo 1024 caracteres.')
                    self.snapshot_metadata.reconcile(client, host, project, target, current)
                    item = next(item for item in current if snapshot_name(item) == artifact)
                    if not isinstance(item, dict) or not item.get('created_at'):
                        raise PanelError(409, 'O Incus não retornou os detalhes do snapshot. Atualize antes de editar.')
                    self.snapshot_metadata.edit(host, project, target, item, description, body.get('revision'))
                    operation_id = self.completed_operation(user, host, project, action, target)
                    with self.lock:
                        self.audit.append(dict(identity=user['username'], host=host, project=project,
                            target=target, action=action, timestamp=time.time(), result='confirmada', operation=operation_id))
                        self.audit[:] = self.audit[-200:]
                    return {'operation': operation_id}
                elif action == "snapshot-restore":
                    if instance.get("status") != "Stopped":
                        raise PanelError(409, "Pare o container antes de restaurar um snapshot.")
                    method = "PUT"
                    payload = {"restore": artifact, "stateful": False}
                else:
                    path += "/" + collection + "/" + artifact
                    method = "DELETE"
                    if action == 'snapshot-delete':
                        self.snapshot_metadata.update(lambda data: None)
            elif action == "delete":
                if user["role"] != "administrador" or instance["status"] != "Stopped" or instance.get("expanded_config", {}).get("security.protection.delete", instance.get("config", {}).get("security.protection.delete")) == "true":
                    raise PanelError(403, "Exclusão exige administrador, container parado e sem proteção.")
                method = "DELETE"
            else:
                raise PanelError(400, "Ação não permitida.")
        record = {"identity": user["username"], "host": host, "project": project, "target": target, "action": action, "timestamp": time.time(), "result": "solicitada"}
        if action in ('snapshot', 'snapshot-restore', 'snapshot-delete'):
            record['snapshot'] = artifact_name if action == 'snapshot' else artifact
        if action in ('clone', 'template'):
            record['destination'] = body['name']
        with self.lock:
            self.audit.append(record)
            self.audit[:] = self.audit[-200:]
        try:
            response = (client.request(method, path, project, payload, etag=write_etag)
                        if write_etag else client.request(method, path, project, payload))
            if action.startswith('nic-') and response.get('type') == 'sync':
                confirmed = client.request('GET', path, project)['metadata']
                from .networking import DISCONNECTED_NICS
                if (confirmed.get('devices', {}) != payload['devices'] or
                        confirmed.get('config', {}).get(DISCONNECTED_NICS) != payload.get('config', {}).get(DISCONNECTED_NICS)):
                    raise PanelError(409, 'A configuração de rede não foi confirmada. Atualize o container.')
                operation_id = self.completed_operation(user, host, project, action, target)
                record.update(result='confirmada pelo Incus', operation=operation_id)
                return {'operation': operation_id}
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
            if action in ('snapshot', 'snapshot-delete'):
                try:
                    self.snapshot_metadata.register(record['operation'], host, project, target, action,
                        artifact_name if action == 'snapshot' else artifact, body.get('description', ''))
                except PanelError as exc:
                    raise PanelError(503, 'O Incus aceitou a operação ' + record['operation'] +
                        ', mas os metadados não puderam ser salvos. Consulte Tarefas e atualize a lista antes de repetir.') from exc
            return {"operation": record["operation"]}
        except PanelError:
            record["result"] = "falha ou resultado incerto; consultar Incus"
            raise
