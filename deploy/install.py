"""Instalador Linux: serviço local de administração Incus com HTTPS e login próprio."""
import argparse
import http.client
import ipaddress
import json
import os
from pathlib import Path
import secrets
import shlex
import shutil
import socket
import ssl
import subprocess
import sys
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from incus_panel.server import password_hash
from deploy.preflight import run_preflight
from incus_panel.memory import describe_memory


def run(command, **kwargs):
    # Erros de serviço/CLI não podem deixar a configuração esperando indefinidamente.
    kwargs.setdefault('timeout', 120)
    return subprocess.run(command, check=True, **kwargs)


def query_list(query, path):
    result = query(path)
    # Incus 6.0 can serialize an empty collection as JSON null.
    if result is None:
        return []
    if not isinstance(result, list):
        raise RuntimeError(f'Resposta Incus inválida para {path}: esperada uma lista.')
    return result


def ensure_default_network(query):
    profile = query('/1.0/profiles/default')
    if any(device.get('type') == 'nic' for device in profile.get('devices', {}).values()):
        return
    networks = query_list(query, '/1.0/networks?recursion=1')
    bridge = next((n['name'] for n in networks if n.get('managed') and n.get('type') == 'bridge' and n.get('status') == 'Created'), None)
    if not bridge:
        existing_names = {n['name'] for n in networks}
        bridge = next('panelbr' + str(i) for i in range(1000) if 'panelbr' + str(i) not in existing_names)
        run(['incus', 'network', 'create', 'local:' + bridge, 'ipv4.address=auto', 'ipv4.nat=true', 'ipv6.address=none'])
    devices = profile.get('devices', {})
    device = 'eth0' if 'eth0' not in devices else next('panelnic' + str(i) for i in range(1000) if 'panelnic' + str(i) not in devices)
    run(['incus', 'profile', 'device', 'add', 'local:default', device, 'nic', 'network=' + bridge, 'name=eth0'])


def ensure_default_storage(query):
    """Driver dir: sem ZFS, discos dedicados ou arquivos loop em flash."""
    pools = query_list(query, '/1.0/storage-pools?recursion=1')
    devices = query('/1.0/profiles/default').get('devices', {})
    if any(d.get('type') == 'disk' and d.get('path') == '/' for d in devices.values()):
        return
    pool = next((p['name'] for p in pools if p.get('status') == 'Created'), None)
    if pool is None:
        if pools:
            raise RuntimeError('Pools existentes indisponíveis; corrija o armazenamento no Incus.')
        pool = 'panel-dir'
        run(['incus', 'storage', 'create', 'local:' + pool, 'dir'])
    device = next('panelroot' + str(i) for i in range(1000) if 'panelroot' + str(i) not in devices)
    run(['incus', 'profile', 'device', 'add', 'local:default', device, 'disk', 'path=/', 'pool=' + pool])


def validate_address(address):
    parsed = ipaddress.ip_address(address)
    if parsed.version != 4 or not parsed.is_private or parsed.is_loopback or parsed.is_unspecified or parsed.is_multicast or parsed.is_link_local:
        raise ValueError('Informe o IPv4 privado da interface LAN da TV Box.')
    return str(parsed)


def network_config(config, address, port):
    """Upgrade the installer's previous single-IP listener, keeping credentials."""
    if (config.get('origin') != f'https://{address}:{port}'
            or config.get('listen_host') not in (address, '0.0.0.0')
            or config.get('read_only') or not config.get('manage_all_instances')
            or config.get('hosts', [{}])[0].get('transport') != 'unix'):
        raise ValueError('Configuração existente difere da instalação administrativa solicitada; não foi substituída.')
    return {**config, 'listen_host': '0.0.0.0'}


def certificate_addresses(address):
    """Include all current IPv4 interfaces in a new installation's certificate."""
    interfaces = json.loads(run(['ip', '-j', '-4', 'address', 'show'], capture_output=True).stdout)
    addresses = {address}
    for interface in interfaces:
        for item in interface.get('addr_info', []):
            if item.get('family') == 'inet':
                parsed = ipaddress.IPv4Address(item['local'])
                if not parsed.is_unspecified and not parsed.is_multicast:
                    addresses.add(str(parsed))
    return sorted(addresses, key=ipaddress.IPv4Address)


def service_text(username, port):
    if not username or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in username):
        raise ValueError('Usuário de serviço inválido.')
    return f'''[Unit]
Description=Incus Panel - administração local
After=network-online.target incus.service
Wants=network-online.target
Requires=incus.service

[Service]
Type=simple
User={username}
WorkingDirectory=/opt/incus-panel/current
StateDirectory=incus-panel
StateDirectoryMode=0750
ExecStart=/usr/bin/python3 -m incus_panel.server --config /etc/incus-panel/config.local.json --users-file /var/lib/incus-panel/users.json --port {port}
Restart=on-failure
RestartSec=5
Nice=10
CPUQuota=100%
MemoryAccounting=true
MemoryHigh=64M
MemoryMax=128M
TasksMax=32
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
UMask=0077
Environment=PYTHONDONTWRITEBYTECODE=1
Environment=PYTHONUNBUFFERED=1
Environment=MALLOC_ARENA_MAX=2
Environment=MALLOC_MMAP_THRESHOLD_=131072

[Install]
WantedBy=multi-user.target
'''


def update_service_text(existing):
    """Preserve a deployed unit while enabling persistent panel accounts."""
    lines = existing.splitlines()
    service_start = next((i for i, line in enumerate(lines) if line.strip() == '[Service]'), None)
    if service_start is None:
        raise ValueError('O serviço existente não tem uma seção [Service].')
    service_end = next((i for i in range(service_start + 1, len(lines)) if lines[i].strip().startswith('[')), len(lines))
    service_lines = lines[service_start + 1:service_end]
    exec_indexes = [service_start + 1 + i for i, line in enumerate(service_lines) if line.startswith('ExecStart=') and line.strip() != 'ExecStart=']
    if len(exec_indexes) != 1:
        raise ValueError('O serviço existente precisa ter exatamente um ExecStart ativo.')
    exec_index = exec_indexes[0]
    command = lines[exec_index][len('ExecStart='):]
    tokens = shlex.split(command)
    if not tokens:
        raise ValueError('ExecStart do serviço existente está vazio.')
    port = 8080
    if '--port' in tokens:
        position = tokens.index('--port')
        if position + 1 >= len(tokens):
            raise ValueError('A opção --port de ExecStart está incompleta.')
        port = int(tokens[position + 1])
    else:
        for token in tokens:
            if token.startswith('--port='):
                port = int(token.split('=', 1)[1])
                break
    if not 1024 <= port <= 65535:
        raise ValueError('A porta configurada no serviço existente é inválida.')

    has_users_file = '--users-file' in tokens or any(token.startswith('--users-file=') for token in tokens)
    if not has_users_file:
        lines[exec_index] += ' --users-file /var/lib/incus-panel/users.json'
        state_dirs = next((i for i in range(service_start + 1, service_end) if lines[i].startswith('StateDirectory=')), None)
        if state_dirs is None:
            lines[service_start + 1:service_start + 1] = ['StateDirectory=incus-panel', 'StateDirectoryMode=0750']
        else:
            configured = lines[state_dirs].partition('=')[2].split()
            if 'incus-panel' not in configured:
                lines[state_dirs] += ' incus-panel'
            if not any(line.startswith('StateDirectoryMode=') for line in lines[service_start + 1:service_end]):
                lines.insert(state_dirs + 1, 'StateDirectoryMode=0750')
    return '\n'.join(lines) + '\n', port


def service_user(unit):
    in_service = False
    for line in unit.splitlines():
        if line.strip() == '[Service]':
            in_service = True
        elif line.strip().startswith('['):
            in_service = False
        elif in_service and line.startswith('User='):
            return line.partition('=')[2].strip()
    return 'root'


def local_https_status(origin, port, certificate, timeout=2):
    """Check the local service using its configured certificate, without public DNS."""
    parsed = urllib.parse.urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.netloc:
        raise ValueError('A origem HTTPS existente é inválida.')
    context = ssl.create_default_context(cafile=certificate)
    # Trust only the certificate explicitly configured for this service. Its
    # public hostname may be routed through an external proxy, so connect to
    # loopback while keeping hostname validation disabled for this local probe.
    context.check_hostname = False
    connection = http.client.HTTPSConnection('127.0.0.1', port, context=context, timeout=timeout)
    try:
        connection.request('GET', '/', headers={'Host': parsed.netloc})
        response = connection.getresponse()
        response.read()
        return response.status
    finally:
        connection.close()


def main():
    import grp
    import pwd
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user', help='Usuário do serviço; incus-panel é criado automaticamente')
    parser.add_argument('--address', help='IPv4 LAN para a URL principal e certificado; a escuta aceita todas as interfaces IPv4')
    parser.add_argument('--port', type=int, help='Porta HTTPS; padrão 8444 na instalação nova')
    parser.add_argument('--update-only', action='store_true', help='Atualiza uma instalação existente sem substituir sua configuração nem preparar/reiniciar o Incus')
    parser.add_argument('--verify-container', action='store_true', help='Valida o ciclo completo de um container Alpine real')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Execute com sudo para instalar o serviço systemd.')
    base, settings = Path('/opt/incus-panel'), Path('/etc/incus-panel')
    config_path = settings / 'config.local.json'
    current = base / 'current'
    service_path = Path('/etc/systemd/system/incus-panel.service')
    old_unit_text = None
    if args.update_only:
        if not current.is_symlink() or not service_path.is_file() or not config_path.is_file():
            parser.error('--update-only requer uma instalação existente com serviço, configuração e release atual.')
        old_unit_text = service_path.read_text(encoding='utf-8')
        existing_user = service_user(old_unit_text)
        if args.user and args.user != existing_user:
            parser.error('O usuário informado difere do serviço existente; nada foi substituído.')
        args.user = existing_user
        try:
            updated_unit, existing_port = update_service_text(old_unit_text)
        except (ValueError, IndexError) as exc:
            parser.error(f'Não foi possível atualizar o serviço sem alterar sua estrutura: {exc}')
        if args.port is not None and args.port != existing_port:
            parser.error('A porta informada difere da porta do serviço existente; nada foi substituído.')
        args.port = existing_port
        print('Etapa: verificar ambiente sem modificar faixas ou reiniciar o Incus.', flush=True)
        print(describe_memory(run_preflight()), flush=True)
    else:
        args.user = args.user or 'incus-panel'
        args.port = args.port or 8444
        print(describe_memory(run_preflight(prepare=True, restart_incus=True)), flush=True)
        if not args.address:
            route = run(['ip', '-j', 'route', 'get', '1.1.1.1'], capture_output=True)
            args.address = json.loads(route.stdout)[0]['prefsrc']
        address = validate_address(args.address)
    if sys.version_info < (3, 11):
        parser.error('Requer Python 3.11 ou superior.')
    if not 1024 <= args.port <= 65535:
        parser.error('Porta inválida.')
    if not shutil.which('incus'):
        parser.error('Instale o Incus nesta TV Box antes de executar o instalador.')
    if args.update_only:
        run(['systemctl', 'is-active', '--quiet', 'incus.service'])
    else:
        print('Etapa: aguardar resposta do serviço Incus.', flush=True)
        run(['systemctl', 'start', 'incus.service'])
        for attempt in range(30):
            try:
                run(['incus', 'query', '--force-local', '--raw', '/1.0'], capture_output=True)
                break
            except subprocess.CalledProcessError:
                if attempt == 29:
                    raise RuntimeError('Incus não iniciou. Consulte journalctl -u incus.service.')
                time.sleep(1)
    try:
        pwd.getpwnam(args.user)
    except KeyError:
        if args.user != 'incus-panel':
            parser.error('Usuário informado não existe.')
        run(['useradd', '--system', '--user-group', '--no-create-home', '--shell', '/usr/sbin/nologin', args.user])
    socket_group = grp.getgrgid(os.stat('/var/lib/incus/unix.socket').st_gid).gr_name
    if not args.update_only:
        run(['usermod', '-aG', socket_group, args.user])
    def query(path):
        response = run(['incus', 'query', '--force-local', '--raw', path], capture_output=True)
        data = json.loads(response.stdout)
        return data.get('metadata', data) if isinstance(data, dict) else data
    if not args.update_only:
        print('Etapa: preparar armazenamento dir e rede local.', flush=True)
        ensure_default_storage(query)
        ensure_default_network(query)
    identity = pwd.getpwnam(args.user)
    if identity.pw_uid == 0:
        parser.error('Use uma identidade existente diferente de root.')
    unit = updated_unit if args.update_only else service_text(args.user, args.port)
    for tool in ('openssl', 'systemctl', 'runuser', 'incus'):
        if not shutil.which(tool):
            parser.error(f'Requisito ausente: {tool}; nada foi instalado.')
    if not args.update_only:
        with socket.socket() as probe:
            probe.bind((address, 0))
    # Preflight uses the service's existing identity, never root's Incus access.
    response = run(['runuser', '-u', args.user, '--', shutil.which('incus'), 'query', '--force-local', '--raw', '/1.0/projects?recursion=1'], capture_output=True)
    payload = json.loads(response.stdout)
    projects = payload.get('metadata') if isinstance(payload, dict) else payload
    if not isinstance(projects, list) or not projects:
        parser.error('O usuário não retornou Projects Incus acessíveis.')
    from incus_panel.core import name
    scopes = [name(p['name']) for p in projects]
    # Confirm direct socket permissions too; CLI access alone is insufficient.
    run(['runuser', '-u', args.user, '--', '/usr/bin/python3', '-c', "import socket;s=socket.socket(socket.AF_UNIX);s.connect('/var/lib/incus/unix.socket');s.close()"])

    base.mkdir(mode=0o755, parents=True, exist_ok=True)
    settings.mkdir(mode=0o750, parents=True, exist_ok=True)
    if not args.update_only:
        os.chown(settings, 0, identity.pw_gid)
        os.chmod(settings, 0o750)
    if current.exists() and not current.is_symlink():
        parser.error('/opt/incus-panel/current já existe e não é um link; instalação interrompida.')
    old_release = os.readlink(current) if current.is_symlink() else None
    old_unit = service_path.read_bytes() if service_path.exists() else None
    password = None
    origin = None if args.update_only else f'https://{address}:{args.port}'
    old_config = config_path.read_bytes() if config_path.exists() else None
    if config_path.exists():
        config = json.loads(config_path.read_text())
        if args.update_only:
            origin = config.get('origin')
            if not isinstance(origin, str) or not origin.startswith('https://'):
                parser.error('A origem HTTPS existente é inválida; a configuração foi preservada.')
        else:
            try:
                config = network_config(config, address, args.port)
            except ValueError as exc:
                parser.error(str(exc))
            if old_unit and f'User={args.user}\n' not in old_unit.decode():
                parser.error('Usuário do serviço existente é diferente; nada foi substituído.')
    else:
        certificate, key = settings / 'server.crt', settings / 'server.key'
        san = ','.join('IP:' + value for value in certificate_addresses(address))
        run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365', '-subj', '/CN=Incus Panel', '-addext', 'subjectAltName=' + san, '-keyout', str(key), '-out', str(certificate)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for path in (certificate, key):
            os.chown(path, 0, identity.pw_gid)
            os.chmod(path, 0o640)
        password = secrets.token_urlsafe(18)
        config = {'demo': False, 'read_only': False, 'manage_all_instances': True, 'manage_networks': True, 'allow_remote_images': True, 'enable_console': True, 'enable_events': False, 'low_resource': True, 'origin': origin, 'listen_host': '0.0.0.0', 'tls_certificate': str(certificate), 'tls_key': str(key), 'hosts': [{'id': 'tvbox', 'alias': 'TV Box · Incus local', 'transport': 'unix', 'socket_path': '/var/lib/incus/unix.socket'}], 'users': [{'username': 'admin', 'password_hash': password_hash(password), 'role': 'administrador', 'host_metrics': True, 'scopes': {'tvbox': scopes}}], 'mutable_instances': {}}
        descriptor = os.open(config_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o640)
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(config, stream, ensure_ascii=False, indent=2)
        os.chown(config_path, 0, identity.pw_gid)
        # Mostre antes do diagnóstico: uma falha posterior não pode perder o login.
        print(f'Credenciais criadas — guarde agora: admin | {password}', flush=True)

    print('Etapa: instalar arquivos e iniciar o painel HTTPS.', flush=True)
    release = base / 'releases' / (time.strftime('%Y%m%d-%H%M%S') + '-' + secrets.token_hex(3))
    release.mkdir(parents=True, mode=0o755)
    for folder in ('incus_panel', 'web'):
        shutil.copytree(ROOT / folder, release / folder, ignore=shutil.ignore_patterns('__pycache__', '*.pyc'))
    # Atomic symlink switch; previous release and config are retained for rollback.
    next_link = base / ('next-' + secrets.token_hex(4))
    next_link.symlink_to(release)
    os.replace(next_link, current)
    service_path.write_text(unit)
    try:
        if old_config is not None and not args.update_only:
            config_path.write_text(json.dumps(config, ensure_ascii=False, indent=2))
        run(['systemctl', 'daemon-reload'])
        if not args.update_only:
            run(['systemctl', 'enable', 'incus-panel.service'])
        run(['systemctl', 'restart', 'incus-panel.service'])
        if args.update_only:
            for attempt in range(20):
                try:
                    if local_https_status(origin, args.port, config['tls_certificate']) == 200:
                        break
                except OSError:
                    if attempt == 19:
                        raise RuntimeError('A verificação HTTPS local não confirmou a inicialização.')
                else:
                    if attempt == 19:
                        raise RuntimeError('O painel não retornou HTTP 200 na verificação HTTPS local.')
                time.sleep(1)
        else:
            context = ssl.create_default_context(cafile=config['tls_certificate'])
            opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPSHandler(context=context))
            for attempt in range(20):
                try:
                    with opener.open(origin + '/', timeout=2) as result:
                        if result.status == 200:
                            break
                except OSError:
                    if attempt == 19:
                        raise RuntimeError('A verificação HTTPS não confirmou a inicialização.')
                    time.sleep(1)
        run(['systemctl', 'is-active', '--quiet', 'incus-panel.service'])
        # Acesso real como o usuário do serviço, usando o mesmo backend do painel.
        verification = ['runuser', '-u', args.user, '--', '/usr/bin/python3', '-m', 'incus_panel.verify', '--config', str(config_path)]
        if args.verify_container:
            verification.append('--container')
        print('Etapa: validar API e ciclo do container real.' if args.verify_container else 'Etapa: validar leitura da API real.', flush=True)
        run(verification, cwd=current, timeout=2100 if args.verify_container else 120)
    except Exception:
        run(['systemctl', 'stop', 'incus-panel.service'])
        if old_config is not None and not args.update_only:
            config_path.write_bytes(old_config)
        if old_release:
            rollback = base / ('rollback-' + secrets.token_hex(4))
            rollback.symlink_to(old_release)
            os.replace(rollback, current)
        if old_unit is not None:
            service_path.write_bytes(old_unit)
            run(['systemctl', 'daemon-reload'])
            run(['systemctl', 'restart', 'incus-panel.service'])
        else:
            run(['systemctl', 'disable', 'incus-panel.service'])
        raise

    print(f'Instalação confirmada: {origin}')
    if args.update_only:
        print('Configuração, credenciais e parâmetros do serviço existentes foram preservados.')
    else:
        print(f'Escuta: 0.0.0.0:{args.port} — todas as interfaces IPv4; acesse https://IP_DA_TVBOX:{args.port}')
    print('Modo: administração de containers; transporte: socket Unix local; serviço: incus-panel.service')
    if password:
        print(f'Login: admin | senha inicial (guarde agora): {password}')
    else:
        print('Credenciais existentes preservadas.')
    print('Certificado local: /etc/incus-panel/server.crt; confirme o SHA-256 antes de confiar no navegador:')
    run(['openssl', 'x509', '-in', config['tls_certificate'], '-noout', '-fingerprint', '-sha256'])
    print('Serviço autorizado no socket Incus. Nenhum container existente foi modificado.')


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, subprocess.SubprocessError) as exc:
        print(f'Instalação interrompida: {exc}', file=sys.stderr)
        sys.exit(1)
