"""Leitura de memória Linux, incluindo limites de cgroups, sem alterar o sistema."""
from pathlib import Path, PurePosixPath


def _read(path):
    try:
        return path.read_text()
    except FileNotFoundError:
        return None


def _number(path):
    value = _read(path)
    return None if value is None or value.strip() == 'max' else int(value.strip())


def _groups(proc, cgroup, system):
    """Visit the current group and visible ancestors; include namespaced mount roots."""
    entries = _read(proc / ('1/cgroup' if system else 'self/cgroup')) or ''
    paths = [(cgroup, cgroup, 2), (cgroup / 'memory', cgroup / 'memory', 1)]
    for line in entries.splitlines():
        _, controllers, location = line.split(':', 2)
        relative = PurePosixPath(location)
        if '..' in relative.parts:
            continue  # Namespace paths must never escape the exposed cgroup mount.
        if controllers == '':
            root, version = cgroup, 2
        elif 'memory' in controllers.split(','):
            root, version = cgroup / 'memory', 1
        else:
            continue
        path = root.joinpath(*relative.parts[1:])
        while True:
            paths.append((path, root, version))
            if path == root:
                break
            path = path.parent
    seen = set()
    for path, root, version in paths:
        if path not in seen:
            seen.add(path)
            yield path, version


def memory_status(proc=Path('/proc'), cgroup=Path('/sys/fs/cgroup'), system=False):
    """KiB available to this process, bounded by host and visible cgroup ancestors.

    Inactive file cache can be reclaimed; swap is reported separately and never
    counted as available RAM. With system=True, inspect PID 1's hierarchy: a
    caller's systemd MemoryMax does not limit workloads in another service.
    Hidden ancestor limits cannot be discovered here.
    """
    fields = dict(line.split(':', 1) for line in (proc / 'meminfo').read_text().splitlines())
    values = {key: int(fields[key].split()[0]) for key in ('MemTotal', 'MemAvailable')}
    result = {'total_kib': values['MemTotal'], 'available_kib': values['MemAvailable'],
              'swap_free_kib': int(fields.get('SwapFree', '0').split()[0]), 'oom_kill': 0,
              'limit_source': '/proc/meminfo'}
    for path, version in _groups(proc, cgroup, system):
        limit = _number(path / ('memory.max' if version == 2 else 'memory.limit_in_bytes'))
        if limit is not None and limit <= values['MemTotal'] * 1024:
            current = _number(path / ('memory.current' if version == 2 else 'memory.usage_in_bytes'))
            if current is None:
                raise ValueError(f'Consumo de memória ausente em {path}')
            stats = dict(line.split() for line in (_read(path / 'memory.stat') or '').splitlines())
            cache = int(stats.get('inactive_file' if version == 2 else 'total_inactive_file', '0'))
            headroom = max(0, limit - current + min(cache, current)) // 1024
            if limit // 1024 < result['total_kib']:
                result['total_kib'] = limit // 1024
                result['limit_source'] = str(path)
            result['available_kib'] = min(result['available_kib'], headroom)
        if version == 2:
            swap_limit = _number(path / 'memory.swap.max')
            swap_used = _number(path / 'memory.swap.current')
            if swap_limit is not None and swap_used is not None:
                result['swap_free_kib'] = min(result['swap_free_kib'], max(0, swap_limit - swap_used) // 1024)
            events = dict(line.split() for line in (_read(path / 'memory.events') or '').splitlines())
            result['oom_kill'] += int(events.get('oom_kill', '0'))
    result['available_kib'] = max(0, min(result['available_kib'], result['total_kib']))
    return result


def describe_memory(status):
    return (f"RAM efetiva: {status['total_kib'] / 1024:.0f} MiB; "
            f"disponível: {status['available_kib'] / 1024:.0f} MiB; "
            f"swap livre observada: {status['swap_free_kib'] / 1024:.0f} MiB; "
            f"limite: {status['limit_source']}")
