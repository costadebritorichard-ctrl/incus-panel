"""Benchmark HTTP local com fixture; não mede Incus nem comprova consumo em TV boxes."""
import argparse
import copy
import http.client
import json
import os
from pathlib import Path
import platform
import re
import socket
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent.parent


def run_fixture(port, count):
    from incus_panel.core import Demo
    from incus_panel.server import demo_config, password_hash, serve
    client = Demo()
    template = client.instances['laboratorio', 'lab-web']
    for index in range(max(0, count - 2)):
        item = copy.deepcopy(template)
        item['name'] = f'fixture-{index:05d}'
        client.instances['laboratorio', item['name']] = item
    if port == 0:
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            port = listener.getsockname()[1]
    config = demo_config()
    config.update(low_resource=True, manage_all_instances=True, allow_remote_images=True,
                  origin=f'http://127.0.0.1:{port}')
    config['users'] = [{'username': 'fixture', 'password_hash': password_hash('fixture-only'),
                        'role': 'administrador', 'host_metrics': True,
                        'scopes': {'demo': ['laboratorio', 'redes']}}]
    serve(config, port, {'demo': client})


def sample(pid):
    status = Path(f'/proc/{pid}/status').read_text()
    rss = next(int(line.split()[1]) for line in status.splitlines() if line.startswith('VmRSS:'))
    stat = Path(f'/proc/{pid}/stat').read_text().rsplit(')', 1)[1].split()
    return {'rss_kib': rss, 'cpu_seconds': (int(stat[11]) + int(stat[12])) / os.sysconf('SC_CLK_TCK')}


def benchmark(root, count, idle_seconds):
    child = "import runpy,sys; runpy.run_path(sys.argv[1])['run_fixture'](0,int(sys.argv[2]))"
    allocator = {}
    service = root / 'deploy' / 'incus-panel.service'
    if service.exists():
        for line in service.read_text().splitlines():
            if line.startswith('Environment=MALLOC_'):
                key, value = line.removeprefix('Environment=').split('=', 1)
                allocator[key] = value
    process = subprocess.Popen([sys.executable, '-u', '-c', child, str(Path(__file__).resolve()), str(count)],
                               cwd=root, stdout=subprocess.PIPE, text=True, encoding='utf-8',
                               env={**os.environ, 'PYTHONIOENCODING': 'utf-8', **allocator})
    try:
        ready = process.stdout.readline()
        match = re.search(r'http://127\.0\.0\.1:(\d+)', ready)
        if not match:
            raise RuntimeError('A fixture não iniciou: ' + ready)
        port = int(match[1])
        cookie = ''

        def request(path, body=None, headers=None):
            connection = http.client.HTTPConnection('127.0.0.1', port, timeout=15)
            try:
                values = {'Cookie': cookie, 'Origin': f'http://127.0.0.1:{port}', 'Content-Type': 'application/json', **(headers or {})}
                connection.request('POST' if body is not None else 'GET', path,
                                   json.dumps(body) if body is not None else None, values)
                response = connection.getresponse()
                return response.status, dict(response.getheaders()), response.read()
            finally:
                connection.close()

        status, headers, _ = request('/api/login', {'username': 'fixture', 'password': 'fixture-only'})
        if status != 200:
            raise RuntimeError('Login da fixture falhou.')
        cookie = headers['Set-Cookie'].split(';', 1)[0]
        assets, reload_bytes = {}, 0
        for path in ('/', '/app.js', '/style.css'):
            status, headers, raw = request(path, headers={'Accept-Encoding': 'gzip'})
            if status != 200:
                raise RuntimeError('Falha ao carregar ' + path)
            assets[path] = len(raw)
            _, _, repeated = request(path, headers={'Accept-Encoding': 'gzip', 'If-None-Match': headers.get('ETag', '"missing"')})
            reload_bytes += len(repeated)
        prefix = '/api/read?host=demo&project=laboratorio&resource='
        _, _, full = request(prefix + 'instances')
        status, _, compact = request(prefix + 'instance-list')
        if status == 404:  # Permite comparar o mesmo ensaio com a versão anterior.
            compact = full
        elif status != 200:
            raise RuntimeError('Falha ao consultar inventário compacto.')
        before = sample(process.pid)
        start = time.monotonic()
        time.sleep(idle_seconds)
        after = sample(process.pid)
        return {'fixture': True, 'instances': count, 'platform': platform.platform(), 'allocator_environment': allocator,
                'static_wire_bytes': assets, 'static_total_bytes': sum(assets.values()),
                'static_revalidation_body_bytes': reload_bytes,
                'full_inventory_bytes': len(full), 'list_inventory_bytes': len(compact),
                'idle_seconds': round(time.monotonic() - start, 3),
                'idle_cpu_seconds': round(after['cpu_seconds'] - before['cpu_seconds'], 3),
                'rss_kib': after['rss_kib']}
    finally:
        process.terminate()
        process.communicate(timeout=10)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--instances', type=int, default=200)
    parser.add_argument('--idle-seconds', type=float, default=2)
    parser.add_argument('--root', type=Path, default=ROOT, help='Checkout a medir, inclusive uma versão anterior.')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--serve', action='store_true', help='Mantém a fixture disponível para QA de navegador.')
    parser.add_argument('--port', type=int, default=8083)
    args = parser.parse_args()
    if not 2 <= args.instances <= 10000 or not 0 < args.idle_seconds <= 60:
        parser.error('Use 2–10000 instâncias e um intervalo maior que zero e de até 60 segundos.')
    if args.serve:
        sys.path.insert(0, str(ROOT))
        run_fixture(args.port, args.instances)
        return
    if not Path('/proc/self/status').exists():
        parser.error('A coleta RSS/CPU requer Linux com /proc.')
    result = json.dumps(benchmark(args.root.resolve(), args.instances, args.idle_seconds), ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(result + '\n', encoding='utf-8')
    print(result)


if __name__ == '__main__':
    main()
