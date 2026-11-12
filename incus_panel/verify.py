"""Diagnóstico real do mesmo backend usado pelo painel; nunca usa fixtures."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import time
import uuid

from .core import PanelError, Service


def explain_start_failure(log):
    if ('newuidmap' in log or 'newgidmap' in log) and ('Operation not permitted' in log or 'not allowed' in log):
        return ('O kernel recusou o mapeamento UID/GID do container. Confira /proc/self/uid_map, '
                '/proc/self/gid_map, /etc/subuid e /etc/subgid. Em LXC, o administrador do '
                'hospedeiro deve delegar IDs suficientes e permitir nesting; ajuste as faixas '
                'internas à delegação ou use uma VM completa. Reinstalar pacotes não concede '
                'essas permissões. Consulte docs/instalacao-local.md.')
    return None


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
            explanation = explain_start_failure(result.stdout + result.stderr)
            if explanation:
                print('Causa identificada: ' + explanation, flush=True)
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


def verify_snapshots(service, user, host, project, target):
    """Only called for the disposable panel-check container created by verify()."""
    confirmation = f'{host}/{project}/{target}'
    def action(action, **body):
        artifact = body.get('snapshot')
        operation = service.mutate(user, host, project, action, target, {
            'confirmation': confirmation + ('/' + artifact if artifact else ''), **body})
        wait(service, user, host, project, operation['operation'])
    def exec_check(command):
        return subprocess.run(['incus', 'exec', 'local:' + target, '--project', project,
                               '--', '/bin/sh', '-c', command], check=True, capture_output=True,
                              text=True, timeout=30).stdout.strip()
    exec_check('printf before > /root/panel-snapshot-check')
    action('snapshot', name='before', description='Antes da alteração')
    item = next((item for item in service.read(user, host, project, 'snapshots', target) if item['name'] == 'before'), None)
    if not item or item.get('description') != 'Antes da alteração':
        raise RuntimeError('Snapshot ou descrição não confirmado pelo painel.')
    action('snapshot-edit', snapshot='before', description='Ponto de recuperação', revision=item['_revision'])
    if service.read(user, host, project, 'snapshots', target)[0].get('description') != 'Ponto de recuperação':
        raise RuntimeError('A edição da descrição não foi confirmada.')
    exec_check('printf after > /root/panel-snapshot-check')
    action('stop')
    action('snapshot-restore', snapshot='before')
    action('start')
    if exec_check('cat /root/panel-snapshot-check') != 'before':
        raise RuntimeError('A reversão não recuperou o conteúdo do snapshot.')
    action('stop')
    action('snapshot-delete', snapshot='before')
    if service.read(user, host, project, 'snapshots', target):
        raise RuntimeError('O snapshot de teste não foi removido.')
    action('start')
    print('Snapshot real: criação, descrição, edição, reversão do conteúdo e remoção confirmadas.', flush=True)


def verify_bridges(service, user, host, project, target):
    """Exercise two disposable bridges; never attach a physical host interface."""
    suffix = uuid.uuid4().hex[:8]
    managed, external, device = 'pbr' + suffix, 'pbl' + suffix, 'pcheck0'
    original = service.read(user, host, project, 'instance', target)
    if device in original.get('expanded_devices', {}):
        raise RuntimeError('O dispositivo de teste já existe; nenhuma bridge foi criada.')

    def network_action(action, **body):
        operation = service.mutate(user, host, project, action, managed, {
            'confirmation': f'{host}/{project}/{managed}', **body})
        wait(service, user, host, project, operation['operation'])

    def nic_action(action, **body):
        current = service.read(user, host, project, 'instance', target)
        operation = service.mutate(user, host, project, action, target, {
            'confirmation': f'{host}/{project}/{target}', 'device': device,
            'revision': current['_devices_revision'], **body})
        wait(service, user, host, project, operation['operation'])
        return service.read(user, host, project, 'instance', target)

    print(f'Bridges descartáveis: {managed} (Incus), {external} (Linux); container {target}.', flush=True)
    try:
        network_action('network-create', config={'ipv4.address': 'none', 'ipv4.dhcp': 'false',
                       'ipv4.nat': 'false', 'ipv6.address': 'none', 'ipv6.dhcp': 'false', 'ipv6.nat': 'false'})
        subprocess.run(['ip', 'link', 'add', external, 'type', 'bridge'], check=True, timeout=15)
        subprocess.run(['ip', 'link', 'set', external, 'up'], check=True, timeout=15)
        bridges = service.read(user, host, project, 'networks')
        if not any(n['name'] == external and n['type'] == 'bridge' and not n['managed'] for n in bridges):
            raise RuntimeError('O Incus não listou a bridge Linux externa.')
        nic_action('nic-add', nic={'network': managed, 'name': device})
        for bridge in (external, managed, external):
            current = nic_action('nic-update', nic={'network': bridge})
            nic = current['devices'][device]
            if (nic.get('network') or nic.get('parent')) != bridge:
                raise RuntimeError('O Incus não confirmou a troca de bridge.')
            if current['status'] != 'Running' or device not in service.read(user, host, project, 'state', target).get('network', {}):
                raise RuntimeError('A interface de teste não está presente no container em execução.')
        nic_action('nic-delete')
        current = service.read(user, host, project, 'instance', target)
        if current['devices'] != original['devices'] or current['profiles'] != original['profiles']:
            raise RuntimeError('Os dispositivos ou perfis originais não foram preservados.')
        network_action('network-delete')
        subprocess.run(['ip', 'link', 'delete', external], check=True, timeout=15)
    except Exception:
        print(f'Falha: confira apenas as bridges descartáveis {managed}/{external} e a interface {device} de {target} antes de limpar os recursos.', flush=True)
        raise
    print('Bridges reais: criação vazia, associação, troca Incus/Linux nos dois sentidos com hotplug e remoção confirmadas. Conectividade LAN/DHCP não medida.', flush=True)


def verify(config, container=False, snapshots=False, bridges=False):
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
        if snapshots:
            verify_snapshots(service, user, host, project, target)
        if bridges:
            verify_bridges(service, user, host, project, target)
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
    parser.add_argument('--snapshots', action='store_true', help='Testa snapshots e reversão de conteúdo em um container descartável novo.')
    parser.add_argument('--bridges', action='store_true', help='Testa bridges Incus/Linux descartáveis e troca de interface; exige root e iproute2, sem conectar interfaces físicas.')
    args = parser.parse_args()
    verify(json.loads(Path(args.config).read_text(encoding='utf-8')), args.container or args.snapshots or args.bridges, args.snapshots, args.bridges)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError, ValueError, PanelError, subprocess.SubprocessError) as exc:
        print(f'Verificação Incus falhou: {exc}', file=sys.stderr)
        sys.exit(1)
