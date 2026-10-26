"""Instalador Linux: serviço local de administração Incus com HTTPS e login próprio."""
import argparse
import grp
import ipaddress
import json
import os
from pathlib import Path
import pwd
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import time
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from incus_panel.server import password_hash


def run(command, **kwargs):
    return subprocess.run(command, check=True, **kwargs)


def ensure_default_network(query):
    profile = query('/1.0/profiles/default')
    if any(device.get('type') == 'nic' for device in profile.get('devices', {}).values()):
        return
    networks = query('/1.0/networks?recursion=1')
    bridge = next((n['name'] for n in networks if n.get('managed') and n.get('type') == 'bridge' and n.get('status') == 'Created'), None)
    if not bridge:
        existing_names = {n['name'] for n in networks}
        bridge = next('panelbr' + str(i) for i in range(1000) if 'panelbr' + str(i) not in existing_names)
        run(['incus', 'network', 'create', bridge, 'ipv4.address=auto', 'ipv4.nat=true', 'ipv6.address=none'])
    run(['incus', 'profile', 'device', 'add', 'default', 'eth0', 'nic', 'network=' + bridge, 'name=eth0'])


def validate_address(address):
    parsed = ipaddress.ip_address(address)
    if parsed.version != 4 or not parsed.is_private or parsed.is_loopback or parsed.is_unspecified or parsed.is_multicast or parsed.is_link_local:
        raise ValueError('Informe o IPv4 privado da interface LAN da TV Box.')
    return str(parsed)


def service_text(username, port):
    if not username or any(c not in 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-' for c in username):
        raise ValueError('Usuário de serviço inválido.')
    return f'''[Unit]
Description=Incus Panel - administração local
After=network-online.target incus.service
Wants=network-online.target

[Service]
Type=simple
User={username}
WorkingDirectory=/opt/incus-panel/current
ExecStart=/usr/bin/python3 -m incus_panel.server --config /etc/incus-panel/config.local.json --port {port}
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX
UMask=0077
Environment=PYTHONDONTWRITEBYTECODE=1
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=multi-user.target
'''


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--user', default='incus-panel', help='Usuário do serviço; incus-panel é criado automaticamente')
    parser.add_argument('--address', help='IPv4 LAN; detectado automaticamente quando omitido')
    parser.add_argument('--port', type=int, default=8444)
    args = parser.parse_args()
    if not args.address:
        route = run(['ip', '-j', 'route', 'get', '1.1.1.1'], capture_output=True)
        args.address = json.loads(route.stdout)[0]['prefsrc']
    address = validate_address(args.address)
    if os.geteuid() != 0:
        parser.error('Execute com sudo para instalar o serviço systemd.')
    if sys.version_info < (3, 11):
        parser.error('Requer Python 3.11 ou superior.')
    if not 1024 <= args.port <= 65535:
        parser.error('Porta inválida.')
    if not shutil.which('incus'):
        parser.error('Instale o Incus nesta TV Box antes de executar o instalador.')
    run(['systemctl', 'start', 'incus.service'])
    try:
        pwd.getpwnam(args.user)
    except KeyError:
        if args.user != 'incus-panel':
            parser.error('Usuário informado não existe.')
        run(['useradd', '--system', '--user-group', '--no-create-home', '--shell', '/usr/sbin/nologin', args.user])
    socket_group = grp.getgrgid(os.stat('/var/lib/incus/unix.socket').st_gid).gr_name
    run(['usermod', '-aG', socket_group, args.user])
    def query(path):
        response = run(['incus', 'query', '--force-local', '--raw', path], capture_output=True)
        data = json.loads(response.stdout)
        return data.get('metadata', data) if isinstance(data, dict) else data
    if not query('/1.0/storage-pools'):
        if query('/1.0/instances') or query('/1.0/profiles/default').get('devices'):
            parser.error('Incus parcialmente configurado: configure um pool e o profile default antes de instalar.')
        run(['incus', 'admin', 'init', '--minimal'])
    ensure_default_network(query)
    identity = pwd.getpwnam(args.user)
    if identity.pw_uid == 0:
        parser.error('Use uma identidade existente diferente de root.')
    unit = service_text(args.user, args.port)
    for tool in ('openssl', 'systemctl', 'runuser', 'incus'):
        if not shutil.which(tool):
            parser.error(f'Requisito ausente: {tool}; nada foi instalado.')
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

    base, settings = Path('/opt/incus-panel'), Path('/etc/incus-panel')
    base.mkdir(mode=0o755, parents=True, exist_ok=True)
    settings.mkdir(mode=0o750, parents=True, exist_ok=True)
    os.chown(settings, 0, identity.pw_gid)
    os.chmod(settings, 0o750)
    config_path = settings / 'config.local.json'
    current = base / 'current'
    if current.exists() and not current.is_symlink():
        parser.error('/opt/incus-panel/current já existe e não é um link; instalação interrompida.')
    old_release = os.readlink(current) if current.is_symlink() else None
    service_path = Path('/etc/systemd/system/incus-panel.service')
    old_unit = service_path.read_bytes() if service_path.exists() else None
    password = None
    origin = f'https://{address}:{args.port}'
    if config_path.exists():
        config = json.loads(config_path.read_text())
        if config.get('origin') != origin or config.get('listen_host') != address or config.get('read_only') or not config.get('manage_all_instances') or config.get('hosts', [{}])[0].get('transport') != 'unix':
            parser.error('Configuração existente difere da instalação administrativa solicitada; não foi substituída.')
        if old_unit and f'User={args.user}\n' not in old_unit.decode():
            parser.error('Usuário do serviço existente é diferente; nada foi substituído.')
    else:
        certificate, key = settings / 'server.crt', settings / 'server.key'
        run(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '365', '-subj', '/CN=Incus Panel', '-addext', f'subjectAltName=IP:{address}', '-keyout', str(key), '-out', str(certificate)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for path in (certificate, key):
            os.chown(path, 0, identity.pw_gid)
            os.chmod(path, 0o640)
        password = secrets.token_urlsafe(18)
        config = {'demo': False, 'read_only': False, 'manage_all_instances': True, 'allow_remote_images': True, 'enable_console': True, 'enable_events': True, 'origin': origin, 'listen_host': address, 'tls_certificate': str(certificate), 'tls_key': str(key), 'hosts': [{'id': 'tvbox', 'alias': 'TV Box · Incus local', 'transport': 'unix', 'socket_path': '/var/lib/incus/unix.socket'}], 'users': [{'username': 'admin', 'password_hash': password_hash(password), 'role': 'administrador', 'host_metrics': True, 'scopes': {'tvbox': scopes}}], 'mutable_instances': {}}
        descriptor = os.open(config_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o640)
        with os.fdopen(descriptor, 'w') as stream:
            json.dump(config, stream, ensure_ascii=False, indent=2)
        os.chown(config_path, 0, identity.pw_gid)

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
        run(['systemctl', 'daemon-reload'])
        run(['systemctl', 'enable', 'incus-panel.service'])
        run(['systemctl', 'restart', 'incus-panel.service'])
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
    except Exception:
        run(['systemctl', 'stop', 'incus-panel.service'])
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
    print('Modo: administração de containers; transporte: socket Unix local; serviço: incus-panel.service')
    if password:
        print(f'Login: admin | senha inicial (guarde agora): {password}')
    else:
        print('Credenciais existentes preservadas.')
    print('Certificado local: /etc/incus-panel/server.crt; confirme o SHA-256 antes de confiar no navegador:')
    run(['openssl', 'x509', '-in', config['tls_certificate'], '-noout', '-fingerprint', '-sha256'])
    print('Serviço autorizado no socket Incus. Nenhum container existente foi modificado.')


if __name__ == '__main__':
    main()
