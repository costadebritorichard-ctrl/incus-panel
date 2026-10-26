"""Catálogo oficial, limitado a containers da arquitetura local."""
import json
import threading
import time
import urllib.request

from .core import PanelError, architecture

URL = 'https://images.linuxcontainers.org/streams/v1/images.json'
_cache = None
_expires = 0
_lock = threading.Lock()


def choices(products, arch):
    result = []
    for product in products.values():
        if architecture(product.get('arch')) != architecture(arch) or product.get('variant') != 'default':
            continue
        versions = product.get('versions', {})
        if not versions:
            continue
        items = versions[max(versions)].get('items', {})
        if not any(key in items for key in ('root.tar.xz', 'root.squashfs')):
            continue
        aliases = product.get('aliases', '').split(',')
        alias = next((a for a in aliases if a.count('/') == 1), None)
        if alias:
            result.append({'id': 'remote:' + alias, 'remote_image': alias,
                           'label': f"{product.get('os', '')} {product.get('release_title', product.get('release', ''))}".strip()})
    return sorted(result, key=lambda i: (not i['remote_image'].startswith(('debian/', 'alpine/')), i['label']))


def remote_images(arch):
    global _cache, _expires
    with _lock:
        if _cache is None or time.monotonic() >= _expires:
            try:
                with urllib.request.urlopen(URL, timeout=12) as response:
                    raw = response.read(16 * 1024 * 1024 + 1)
                if len(raw) > 16 * 1024 * 1024:
                    raise ValueError('Catálogo muito grande')
                products = json.loads(raw)['products']
                if not isinstance(products, dict):
                    raise ValueError('Catálogo inválido')
                _cache, _expires = products, time.monotonic() + 600
            except (OSError, ValueError, KeyError) as exc:
                raise PanelError(503, 'Não foi possível consultar as imagens. Confira Internet, DNS e data/hora da TV box.') from exc
        return choices(_cache, arch)
