"""Verifica o ambiente; opções de instalação preparam faixas locais de UID/GID."""
from pathlib import Path
import argparse
import os
import subprocess
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from incus_panel.memory import describe_memory, memory_status


MIN_IDS = 65536
PREPARE_IDS = 10000000
PENDING_IDMAP_RESTART = Path('/run/incus-panel/idmaps-pending')
HOST_GUIDANCE = (
    'No hospedeiro do LXC, o administrador precisa permitir nesting e delegar '
    'UIDs/GIDs suficientes ao container externo; depois, alinhar /etc/subuid e '
    '/etc/subgid dentro dele com essa delegação. Outra opção é uma VM completa '
    '(KVM/QEMU). O painel não pode conceder permissões do hospedeiro.'
)


class PreflightError(RuntimeError):
    pass


def check_install_memory():
    try:
        status = memory_status()
    except (OSError, ValueError, KeyError) as exc:
        raise PreflightError(f'Não foi possível verificar os limites de memória: {exc}') from exc
    if status['total_kib'] < 450000 or status['available_kib'] < 256 * 1024:
        raise PreflightError('Memória insuficiente para iniciar esta etapa da instalação. '
                             'Requer 512 MB nominais e pelo menos 256 MiB disponíveis, '
                             'considerando os limites do container/VM. ' + describe_memory(status))
    return status


def mapped_ranges(text):
    """Return ranges in this namespace, not IDs in its parent namespace."""
    ranges = []
    for line in text.splitlines():
        if not line.strip():
            continue
        start, parent, count = map(int, line.split())
        if start < 0 or parent < 0 or count <= 0:
            raise ValueError('Mapeamento inválido')
        ranges.append((start, start + count))
    if not ranges:
        raise ValueError('Mapeamento vazio')
    return ranges


def root_ranges(text):
    ranges = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        fields = line.split(':')
        if fields[0] not in ('root', '0'):
            continue
        if len(fields) != 3:
            raise ValueError('Faixa subordinada inválida')
        start, count = map(int, fields[1:])
        if start < 0 or count <= 0:
            raise ValueError('Faixa subordinada inválida')
        ranges.append((start, start + count))
    return ranges


def covers(ranges, start, end):
    for low, high in sorted(ranges):
        if low > start:
            break
        start = max(start, high)
        if start >= end:
            return True
    return False


def free_range(mapped, allocated):
    """Choose only delegated IDs, avoiding existing users and subordinate ranges."""
    for low, high in sorted(mapped):
        start = max(low, 1000000)
        for used_low, used_high in sorted(allocated):
            if used_high <= start:
                continue
            if used_low >= start + PREPARE_IDS:
                break
            start = max(start, used_high)
        if start + PREPARE_IDS <= high:
            return start
    raise PreflightError('Não há faixa livre de 10 milhões de IDs delegados. ' + HOST_GUIDANCE)


def prepare_idmaps(proc=Path('/proc/self'), etc=Path('/etc'), pending_restart=None):
    """Explicit repair of missing root allocations; never replace existing ranges."""
    options = []
    for mapfile, subfile, usersfile, option in (
        ('uid_map', 'subuid', 'passwd', '--add-subuids'),
        ('gid_map', 'subgid', 'group', '--add-subgids'),
    ):
        try:
            mapped = mapped_ranges((proc / mapfile).read_text())
            path = etc / subfile
            text = path.read_text() if path.exists() else ''
            existing = root_ranges(text)
            if existing:
                if not any(end - start >= MIN_IDS and start > 0 and covers(mapped, start, end)
                           for start, end in existing):
                    raise PreflightError(f'{path} já contém uma faixa de root incompatível; ela foi preservada. ' + HOST_GUIDANCE)
                continue
            allocated = []
            for line in text.splitlines():
                if not line.strip() or line.lstrip().startswith('#'):
                    continue
                owner, start, count = line.split(':')
                start, count = int(start), int(count)
                if start < 0 or count <= 0:
                    raise ValueError('Faixa subordinada inválida')
                allocated.append((start, start + count))
            # Reserve local accounts too, even when they have no sub-ID allocation.
            for line in (etc / usersfile).read_text().splitlines():
                if line.strip() and not line.lstrip().startswith('#'):
                    identifier = int(line.split(':')[2])
                    allocated.append((identifier, identifier + 1))
            start = free_range(mapped, allocated)
            options += [option, f'{start}-{start + PREPARE_IDS - 1}']
        except (OSError, ValueError) as exc:
            raise PreflightError(f'Não foi possível preparar {subfile}: {exc}') from exc
    if options:
        # shadow's usermod handles account-file locks and preserves other entries.
        if pending_restart is not None:
            # Record intent before usermod: interrupted/failed restarts must be retried.
            try:
                pending_restart.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
                pending_restart.touch(mode=0o600)
            except OSError as exc:
                raise PreflightError(f'Não foi possível registrar a aplicação pendente dos IDs: {exc}') from exc
        try:
            subprocess.run(['usermod', *options, 'root'], check=True, capture_output=True,
                           text=True, timeout=15)
        except (OSError, subprocess.SubprocessError) as exc:
            detail = getattr(exc, 'stderr', '') or str(exc)
            raise PreflightError(f'Falha ao configurar IDs de root: {detail}') from exc
        print('Faixas de root configuradas. ' + ('O instalador aplicará a mudança ao serviço Incus.'
              if pending_restart is not None else 'Reinicie o daemon Incus antes de criar novos containers.'), flush=True)
    return bool(options)


def apply_idmaps_to_incus(pending_restart=PENDING_IDMAP_RESTART):
    if not pending_restart.exists():
        return
    try:
        result = subprocess.run(['systemctl', 'show', 'incus.service', '--property=LoadState', '--value'],
                                capture_output=True, text=True, timeout=15)
        state = result.stdout.strip()
        if state == 'not-found':
            # A fresh installation will start Incus with the new ranges later.
            pending_restart.unlink()
            return
        if result.returncode or state != 'loaded':
            raise PreflightError('Não foi possível verificar incus.service: ' + (state or result.stderr.strip()))
        print('Etapa: aplicar faixas UID/GID ao Incus, reiniciando o serviço se estiver ativo.', flush=True)
        subprocess.run(['systemctl', 'try-restart', 'incus.service'], check=True,
                       capture_output=True, text=True, timeout=120)
        pending_restart.unlink()
    except (OSError, subprocess.SubprocessError) as exc:
        detail = getattr(exc, 'stderr', '') or str(exc)
        raise PreflightError('Faixas preparadas, mas não foi possível aplicar a mudança ao Incus: '
                             + detail + '. A próxima instalação tentará novamente.') from exc


def check_idmaps(proc=Path('/proc/self'), etc=Path('/etc')):
    for kind, filename in (('UID', 'uid_map'), ('GID', 'gid_map')):
        try:
            mapped = mapped_ranges((proc / filename).read_text())
            # Full VMs and bare metal have the entire ID space available.
            if covers(mapped, 0, 4294967295):
                continue
            allocation_file = etc / ('subuid' if kind == 'UID' else 'subgid')
            allocations = root_ranges(allocation_file.read_text()) if allocation_file.exists() else []
        except (OSError, ValueError) as exc:
            raise PreflightError(f'Não foi possível verificar {kind}: {exc}') from exc
        # A valid range must fit inside the IDs actually delegated by the parent.
        usable = any(end - start >= MIN_IDS and start > 0 and covers(mapped, start, end)
                     for start, end in allocations)
        if not usable:
            available = ', '.join(f'{start}-{end - 1}' for start, end in mapped)
            requested = ', '.join(f'{start}-{end - 1}' for start, end in allocations) or 'nenhuma'
            raise PreflightError(
                f'Mapeamento {kind} incompatível com containers Incus sem privilégios. '
                f'IDs disponíveis neste ambiente: {available}. '
                f'Faixas de root em {allocation_file}: {requested}. '
                f'É necessária uma faixa subordinada de pelo menos {MIN_IDS} IDs '
                'inteiramente contida no mapeamento do ambiente. '
                'Se há IDs suficientes mas nenhuma faixa de root, execute '
                'sudo python3 deploy/preflight.py --prepare-idmaps. ' + HOST_GUIDANCE
            )


def check_environment():
    if sys.platform != 'linux' or os.geteuid() != 0:
        raise PreflightError('Execute esta verificação em Linux com sudo.')
    check_idmaps()
    # The child exits immediately; no host mounts, settings or files are changed.
    try:
        result = subprocess.run(
            ['unshare', '--user', '--map-root-user', '--mount', '--net', 'true'],
            capture_output=True, text=True, errors='replace', timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise PreflightError(f'Não foi possível testar namespaces (util-linux/unshare): {exc}') from exc
    if result.returncode:
        raise PreflightError(
            'O ambiente recusou a criação de namespaces de usuário/montagem/rede: '
            + (result.stderr.strip() or f'código {result.returncode}')
            + '. Confira as políticas do kernel e do hospedeiro. ' + HOST_GUIDANCE
        )


def run_preflight(prepare=False, restart_incus=False):
    if restart_incus and not prepare:
        raise PreflightError('A aplicação das faixas ao Incus exige preparar os IDs primeiro.')
    if prepare:
        if sys.platform != 'linux' or os.geteuid() != 0:
            raise PreflightError('Execute em Linux com sudo.')
        check_install_memory()
        prepare_idmaps(pending_restart=PENDING_IDMAP_RESTART if restart_incus else None)
    check_environment()
    status = check_install_memory()
    if restart_incus:
        apply_idmaps_to_incus(PENDING_IDMAP_RESTART)
    return status


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare-idmaps', action='store_true',
                        help='Configura faixas ausentes de root usando IDs já delegados e livres')
    parser.add_argument('--restart-incus', action='store_true',
                        help='Aplica faixas preparadas ao serviço Incus; usado automaticamente pelo instalador')
    args = parser.parse_args()
    try:
        status = run_preflight(args.prepare_idmaps, args.restart_incus)
        print(describe_memory(status))
    except PreflightError as exc:
        print(f'Pré-verificação interrompida: {exc}', file=sys.stderr)
        return 1
    print('Pré-verificação de IDs e namespaces aprovada; o teste real do Incus ainda é necessário.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
