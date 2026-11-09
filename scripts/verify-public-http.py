"""Read-only HTTPS checks; never reads or sends authentication credentials."""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    base = args.origin.rstrip('/')
    parsed = urlsplit(base)
    if (parsed.scheme != 'https' or not parsed.hostname or parsed.username or parsed.password
            or parsed.path or parsed.query or parsed.fragment):
        parser.error('--origin precisa ser uma origem HTTPS, sem credenciais, caminho ou parâmetros')
    result = {}
    for path in (
        '/api/session',
        '/api/read?host=tvbox&project=default&resource=instances',
        '/config.local.json', '/server.key', '/.git/config',
        '/app.js', '/style.css', '/',
    ):
        try:
            with urllib.request.urlopen(base + path, timeout=25) as response:
                content = response.read()
                item = {'status': response.status, 'bytes': len(content)}
                if path in ('/app.js', '/style.css', '/'):
                    source = Path('web') / ('index.html' if path == '/' else path.lstrip('/'))
                    normalize = lambda value: value.replace(b'\r\n', b'\n')
                    item['matches_local'] = normalize(content) == normalize(source.read_bytes())
                    item['sha256'] = hashlib.sha256(normalize(content)).hexdigest()
                result[path] = item
        except urllib.error.HTTPError as error:
            result[path] = {'status': error.code}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result, indent=2))
    expected = {
        '/api/session': 401,
        '/api/read?host=tvbox&project=default&resource=instances': 401,
        '/config.local.json': 404, '/server.key': 404, '/.git/config': 404,
        '/app.js': 200, '/style.css': 200, '/': 200,
    }
    if any(result[path]['status'] != status for path, status in expected.items()):
        raise SystemExit('Falha nos controles HTTP esperados; consulte o relatório.')
    if any(item.get('matches_local') is False for item in result.values()):
        raise SystemExit('A interface publicada difere dos arquivos locais.')


if __name__ == '__main__':
    main()
