"""Conecta a TV Box por SSH, descobre Projects e abre o painel em leitura."""
import argparse
import json
from pathlib import Path
import secrets
import sys

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from incus_panel.core import PanelError, name
from incus_panel.server import password_hash, serve
from incus_panel.ssh_transport import SSHIncus


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--host', required=True)
    parser.add_argument('--user', default='suricata')
    parser.add_argument('--port', type=int, default=8081)
    parser.add_argument('--project', action='append', help='Restringir aos Projects indicados; pode repetir.')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error('Use uma porta entre 1024 e 65535.')
    host = {'id': 'tvbox', 'alias': 'TV Box · Incus real', 'transport': 'ssh', 'ssh_host': args.host, 'ssh_user': args.user, 'known_hosts': str(ROOT / '.credentials' / 'known_hosts')}
    print('Conectando por SSH. Confira o fingerprint do host quando solicitado e digite a senha SSH no prompt do OpenSSH.', flush=True)
    print('Somente consultas Incus; não instala arquivos nem altera containers na TV Box.', flush=True)
    client = None
    try:
        client = SSHIncus(host)
        info = client.request('GET', '/1.0', 'default')['metadata']
        projects = client.request('GET', '/1.0/projects', 'default')['metadata']
        available = [name(p['name']) for p in projects]
        selected = args.project or available
        if not selected or any(p not in available for p in selected):
            raise PanelError(403, 'Nenhum Project autorizado ou Project solicitado não encontrado.')
        # Real data must succeed before replacing the saved configuration.
        count = 0
        for project in selected:
            count += len(client.request('GET', '/1.0/instances', project)['metadata'])
        password = secrets.token_urlsafe(16)
        config = {'demo': False, 'local_only': True, 'read_only': True, 'enable_console': False, 'enable_events': False, 'origin': f'http://127.0.0.1:{args.port}', 'session_seconds': 1800, 'hosts': [host], 'users': [{'username': 'admin', 'password_hash': password_hash(password), 'role': 'observador', 'host_metrics': True, 'scopes': {'tvbox': selected}}], 'mutable_instances': {}}
        (ROOT / 'config.tvbox.local.json').write_text(json.dumps(config, ensure_ascii=False, indent=2), encoding='utf-8')
        env = info.get('environment', {})
        print(f"Conexão real confirmada: Incus {env.get('server_version', 'n/d')} · {env.get('kernel_architecture', 'n/d')} · {count} containers", flush=True)
        print('Projects: ' + ', '.join(selected), flush=True)
        print(f'Login do painel: admin | senha gerada: {password}', flush=True)
        serve(config, args.port, {'tvbox': client})
    except (PanelError, OSError, ValueError) as exc:
        print(f'Não foi possível concluir a integração: {exc}', file=sys.stderr)
        raise SystemExit(1)
    finally:
        if client:
            client.close()


if __name__ == '__main__':
    main()
