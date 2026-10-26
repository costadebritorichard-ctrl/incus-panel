"""Catálogo oficial, limitado a containers da arquitetura local."""
import json
import threading
import time
import urllib.request

from .core import PanelError, architecture

URL = 'https://images.linuxcontainers.org/streams/v1/index.json'
_cache = None
_expires = 0
_lock = threading.Lock()


def remote_images(arch):
    global _cache, _expires
    with _lock:
        if _cache is None or time.monotonic() >= _expires:
            try:
                with urllib.request.urlopen(URL, timeout=12) as response:
                    raw = response.read(1024 * 1024 + 1)
                if len(raw) > 1024 * 1024:
                    raise ValueError('Catálogo muito grande')
                products = json.loads(raw)['index']['images']['products']
                if not isinstance(products, list):
                    raise ValueError('Catálogo inválido')
                _cache, _expires = products, time.monotonic() + 600
            except (OSError, ValueError, KeyError) as exc:
                raise PanelError(503, 'Não foi possível consultar as imagens. Confira Internet, DNS e data/hora da TV box.') from exc
        return index_choices(_cache, arch)


def index_choices(products, arch):
    """Somente famílias de containers leves; o índice evita carregar o histórico inteiro."""
    result = {}
    for entry in products:
        parts = entry.split(':')
        if len(parts) != 4:
            continue
        distro, release, image_arch, variant = parts
        if distro not in ('alpine', 'debian') or variant != 'default' or architecture(image_arch) != architecture(arch):
            continue
        alias = distro + '/' + release
        result[alias] = {'id': 'remote:' + alias, 'remote_image': alias, 'label': distro.capitalize() + ' ' + release}
    return sorted(result.values(), key=lambda i: i['label'])
