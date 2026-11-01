"""Reserva de memória antes de solicitar uma criação ao Incus local."""
from .core import PanelError
from .memory import memory_status


def check_creation_memory():
    try:
        # Incus creates workloads outside the panel's own MemoryMax=128M unit.
        available = memory_status(system=True)['available_kib'] * 1024
    except (OSError, ValueError, KeyError) as exc:
        raise PanelError(409, 'Não foi possível verificar a memória disponível da TV box. Criação cancelada.') from exc
    if available < 256 * 1024 * 1024:
        raise PanelError(409, 'Memória insuficiente: a criação exige ao menos 256 MiB disponíveis na TV box. Nenhum container foi solicitado.')
