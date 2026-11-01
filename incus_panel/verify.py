"""Diagnóstico real do mesmo backend usado pelo painel; nunca usa fixtures."""
import argparse
import json
from pathlib import Path
import subprocess
import time
import uuid

from .core import PanelError, Service


def diagnose(target, project):
    """Read-only diagnostics; failures must not hide the original error."""
    commands = [
        ['incus', 'info', 'local:' + target, '--project', project, '--show-log'],
        ['systemd-detect-virt'],
        ['uname', '-r'],
    ]
    for command in commands:
        print('Diagnóstico: ' + ' '.join(command), flush=True)
        try:
            result = subprocess.run(command, capture_output=True, text=True, errors='replace', timeout=15)
            print((result.stdout + result.stderr)[-16000:], flush=True)
        except (OSError, subprocess.TimeoutExpired) as exc:
            print(f'Diagnóstico indisponível: {exc}', flush=True)


def wait(service, user, host, project, operation, timeout=1800):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        result = service.read(user, host, project, 'operation', operation)
        if result.get('status_code', 100) >= 200:
            if result['status_code'] != 200 or result.get('err'):
                raise RuntimeError(result.get('err') or str(result))
            return result
        time.sleep(5)
    raise TimeoutError('Operação Incus ainda não concluída; confira o host antes de repetir.')


def verify(config, container=False):
    if config.get('demo') or any(h.get('transport') != 'unix' for h in config['hosts']):
        raise ValueError('Verificação exige Incus real pelo socket local.')
    service = Service(config)
    user = next(u for u in config['users'] if u['role'] == 'administrador')
    host = config['hosts'][0]['id']
    project = 'default' if 'default' in user['scopes'][host] else user['scopes'][host][0]
    server = service.read(user, host, project, 'server')
    if server.get('auth') != 'trusted':
        raise RuntimeError('Socket Incus não autenticado.')
    service.read(user, host, project, 'instances')
    print('API Incus real: leitura autenticada confirmada.', flush=True)
    if not container:
        return
    choices = service.read(user, host, project, 'image-catalog')
    alpine = next((i for i in choices if i['remote_image'].startswith('alpine/') and not i['remote_image'].endswith('/edge')), None)
    if alpine is None:
        raise RuntimeError('Não há imagem Alpine estável disponível para esta arquitetura.')
    target = 'panel-check-' + uuid.uuid4().hex[:12]
    confirmation = {'confirmation': f'{host}/{project}/{target}'}
    print(f'Teste real: {target} ({alpine["remote_image"]}); aguarde o download.', flush=True)
    try:
        result = service.launch(user, host, project, {'target': target, 'remote_image': alpine['remote_image']})
        wait(service, user, host, project, result['operation'])
        if service.read(user, host, project, 'instance', target)['status'] != 'Running':
            raise RuntimeError('Container não iniciou.')
        for action in ('restart', 'stop', 'delete'):
            operation = service.mutate(user, host, project, action, target, confirmation)
            wait(service, user, host, project, operation['operation'])
        try:
            service.read(user, host, project, 'instance', target)
        except PanelError as exc:
            if exc.status != 404:
                raise
        else:
            raise RuntimeError('Container de teste não foi excluído.')
        print('Container real: criação, início, reinício, parada e exclusão confirmados.', flush=True)
    except Exception:
        # Não força exclusão em caso de resultado incerto ou operação em andamento.
        print(f'Falha no teste. Confira sudo incus info local:{target} --project {project} --show-log; remova somente esse container de teste quando seguro.', flush=True)
        diagnose(target, project)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--config', required=True)
    parser.add_argument('--container', action='store_true')
    args = parser.parse_args()
    verify(json.loads(Path(args.config).read_text(encoding='utf-8')), args.container)


if __name__ == '__main__':
    main()
