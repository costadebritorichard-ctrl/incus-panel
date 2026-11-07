"""Persistent panel annotations; snapshot data and operation status belong to Incus."""
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import threading
from urllib.parse import unquote, urlsplit


def artifact_name(value):
    raw = value.get('name', '') if isinstance(value, dict) else str(value)
    return unquote(urlsplit(raw).path.rsplit('/', 1)[-1])


def snapshot_revision(item):
    return hashlib.sha256(json.dumps(
        [item['name'], item.get('created_at'), item.get('description', '')],
        ensure_ascii=False).encode()).hexdigest()


class SnapshotMetadata:
    def __init__(self, path=None):
        self.path = Path(path) if path else None
        self.lock = threading.RLock()
        self.data = {'notes': {}, 'pending': {}}
        if self.path and self.path.exists():
            self.data = json.loads(self.path.read_text(encoding='utf-8'))
            if not isinstance(self.data.get('notes'), dict) or not isinstance(self.data.get('pending'), dict):
                raise ValueError('Metadados de snapshots inválidos.')

    @staticmethod
    def key(host, project, target, snapshot):
        return '/'.join((host, project, target, snapshot))

    def update(self, change):
        with self.lock:
            candidate = copy.deepcopy(self.data)
            change(candidate)
            if self.path:
                temporary = None
                try:
                    descriptor, temporary = tempfile.mkstemp(prefix=self.path.name + '.', dir=self.path.parent)
                    with os.fdopen(descriptor, 'w', encoding='utf-8') as output:
                        json.dump(candidate, output, ensure_ascii=False)
                        output.flush()
                        os.fsync(output.fileno())
                    os.chmod(temporary, 0o600)
                    os.replace(temporary, self.path)
                except OSError as exc:
                    from .core import PanelError
                    raise PanelError(503, 'Não foi possível salvar os metadados do snapshot. Confira a permissão e o espaço no diretório de estado do painel.') from exc
                finally:
                    if temporary and os.path.exists(temporary):
                        os.unlink(temporary)
            self.data = candidate

    def annotate(self, host, project, target, items):
        with self.lock:
            result = []
            for raw in items:
                # Never expose saved config/devices, which may contain credentials.
                item = {key: raw[key] for key in ('created_at', 'expires_at', 'stateful', 'size') if isinstance(raw, dict) and key in raw}
                item['name'] = artifact_name(raw)
                note = self.data['notes'].get(self.key(host, project, target, item['name']), {})
                item['description'] = note.get('description', '') if note.get('created_at') == item.get('created_at') else ''
                item['_revision'] = snapshot_revision(item)
                result.append(item)
            return result

    def edit(self, host, project, target, item, description, revision):
        from .core import PanelError
        key = self.key(host, project, target, artifact_name(item))
        with self.lock:
            current = self.annotate(host, project, target, [item])[0]
            if revision != current['_revision']:
                raise PanelError(409, 'A descrição mudou. Reabra o snapshot antes de salvar.')
            self.update(lambda data: data['notes'].__setitem__(key, {
                'created_at': item.get('created_at'), 'description': description}))

    def register(self, operation, host, project, target, action, snapshot, description=''):
        def change(data):
            data['pending'][operation] = dict(host=host, project=project, target=target,
                action=action, snapshot=snapshot, description=description)
        self.update(change)

    def settle(self, client, host, project, operation, state, items=None):
        with self.lock:
            pending = self.data['pending'].get(operation)
            if not pending or pending['host'] != host or pending['project'] != project or state.get('status_code', 100) < 200:
                return
            success = state.get('status_code') == 200 and not state.get('err')
            item = None
            if success:
                if items is None:
                    items = client.request('GET', '/1.0/instances/' + pending['target'] + '/snapshots', project)['metadata']
                item = next((value for value in items if artifact_name(value) == pending['snapshot']), None)
                if pending['action'] == 'snapshot' and item is None:
                    from .core import PanelError
                    raise PanelError(409, 'O Incus concluiu a operação, mas o snapshot não foi encontrado. Atualize a lista antes de repetir.')
                if pending['action'] == 'snapshot-delete' and item is not None:
                    from .core import PanelError
                    raise PanelError(409, 'O Incus concluiu a operação, mas o snapshot ainda existe. Atualize a lista antes de repetir.')
            key = self.key(host, project, pending['target'], pending['snapshot'])
            def change(data):
                data['pending'].pop(operation, None)
                if success and pending['action'] == 'snapshot':
                    data['notes'][key] = {'created_at': item.get('created_at') if isinstance(item, dict) else None,
                                          'description': pending['description']}
                elif success and pending['action'] == 'snapshot-delete':
                    data['notes'].pop(key, None)
            self.update(change)

    def reconcile(self, client, host, project, target, items):
        with self.lock:
            pending = list(self.data['pending'].items())
        for operation, entry in pending:
            if (entry['host'], entry['project'], entry['target']) != (host, project, target):
                continue
            from .core import PanelError
            try:
                state = client.request('GET', '/1.0/operations/' + operation, project)['metadata']
            except PanelError as exc:
                if exc.status != 404:
                    raise
                # Expired operations have an uncertain outcome; never claim success.
                self.update(lambda data: data['pending'].pop(operation, None))
                continue
            try:
                self.settle(client, host, project, operation, state, items)
            except PanelError as exc:
                if exc.status != 409:
                    raise
                # The inventory may have changed externally since the operation.
                # Do not let an obsolete annotation prevent viewing real snapshots.
                self.update(lambda data: data['pending'].pop(operation, None))
