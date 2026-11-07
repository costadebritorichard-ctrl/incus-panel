"""Local browser fixture: real panel WebSocket relay, explicit echo-only PTY double."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import incus_panel.server as panel
from test_console_stream import EchoConsole

panel.Console = EchoConsole
config = panel.demo_config()
config.update(enable_console=True, manage_all_instances=True, low_resource=True,
              origin='http://127.0.0.1:8084')
config['users'] = [{'username': 'test', 'password_hash': panel.password_hash('local-console-fixture'),
                    'role': 'administrador', 'host_metrics': True, 'scopes': {'demo': ['laboratorio']}}]
panel.serve(config, 8084)
