"""Reserva de memória antes de solicitar uma criação ao Incus local."""
from pathlib import Path

from .core import PanelError


def check_creation_memory():
    try:
        fields = dict(line.split(':', 1) for line in Path('/proc/meminfo').read_text().splitlines())
        available = int(fields['MemAvailable'].split()[0]) * 1024
    except (OSError, ValueError, KeyError) as exc:
        raise PanelError(409, 'Não foi possível verificar a memória disponível da TV box. Criação cancelada.') from exc
    if available < 256 * 1024 * 1024:
        raise PanelError(409, 'Memória insuficiente: a criação exige ao menos 256 MiB disponíveis na TV box. Nenhum container foi solicitado.')
