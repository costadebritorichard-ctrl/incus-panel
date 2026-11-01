"""Check local namespace prerequisites without modifying the host."""
from pathlib import Path
import os
import subprocess
import sys


MIN_IDS = 65536
HOST_GUIDANCE = (
    'No hospedeiro do LXC, o administrador precisa permitir nesting e delegar '
    'UIDs/GIDs suficientes ao container externo; depois, alinhar /etc/subuid e '
    '/etc/subgid dentro dele com essa delegação. Outra opção é uma VM completa '
    '(KVM/QEMU). O painel não pode conceder permissões do hospedeiro.'
)


class PreflightError(RuntimeError):
    pass


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
                'inteiramente contida no mapeamento do ambiente. ' + HOST_GUIDANCE
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


def main():
    try:
        check_environment()
    except PreflightError as exc:
        print(f'Pré-verificação interrompida: {exc}', file=sys.stderr)
        return 1
    print('Pré-verificação de IDs e namespaces aprovada; o teste real do Incus ainda é necessário.')
    return 0


if __name__ == '__main__':
    sys.exit(main())
