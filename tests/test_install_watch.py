import io
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

from deploy.install_watch import run_stage
from deploy.preflight import check_install_memory, PreflightError


def status(total=2048, available=1024):
    return {'total_kib': total * 1024, 'available_kib': available * 1024,
            'swap_free_kib': 0, 'oom_kill': 0, 'limit_source': 'fixture/cgroup'}


class InstallationAdmission(unittest.TestCase):
    def test_effective_limit_and_available_memory_are_checked_independently(self):
        for memory in (status(total=256), status(available=128)):
            with patch('deploy.preflight.memory_status', return_value=memory):
                with self.assertRaisesRegex(PreflightError, 'Memória insuficiente.*fixture/cgroup'):
                    check_install_memory()
        with patch('deploy.preflight.memory_status', return_value=status()):
            self.assertEqual(check_install_memory()['total_kib'], 2048 * 1024)

    def test_failure_to_read_limits_does_not_admit_installation(self):
        with patch('deploy.preflight.memory_status', side_effect=ValueError('limite inválido')):
            with self.assertRaisesRegex(PreflightError, 'verificar os limites'):
                check_install_memory()


@unittest.skipUnless(os.name == 'posix', 'Monitor de instalação para Linux/POSIX')
class InstallationWatch(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.log = Path(temporary.name) / 'install.log'
        self.stream = io.StringIO()
        memory = patch('deploy.install_watch.check_install_memory', return_value=status())
        memory.start()
        self.addCleanup(memory.stop)

    def test_stdout_stderr_and_unicode_reach_terminal_and_private_log(self):
        command = [sys.executable, '-c', "import sys; print('início'); print('diagnóstico',file=sys.stderr)"]
        self.assertEqual(run_stage(command, 'Pacotes', self.log, stream=self.stream), 0)
        for text in ('início', 'diagnóstico', 'código 0'):
            self.assertIn(text, self.stream.getvalue())
            self.assertIn(text, self.log.read_text())
        self.assertEqual(self.log.stat().st_mode & 0o777, 0o600)

    def test_silent_command_reports_liveness_without_being_killed(self):
        with patch('deploy.install_watch.memory_status', return_value=status()):
            code = run_stage([sys.executable, '-c', 'import time; time.sleep(0.25)'],
                             'Configurar pacote', self.log, interval=0.05, stream=self.stream)
        self.assertEqual(code, 0)
        self.assertIn('Etapa ativa', self.stream.getvalue())
        self.assertIn('RAM efetiva', self.log.read_text())

    def test_nonzero_child_status_is_preserved_and_diagnosed(self):
        with patch('deploy.install_watch.diagnose') as diagnostic:
            code = run_stage([sys.executable, '-c', 'import sys; sys.exit(23)'],
                             'Pacote que falhou', self.log, stream=self.stream)
        self.assertEqual(code, 23)
        diagnostic.assert_called_once()
        self.assertIn('código 23', self.log.read_text())

    def test_low_memory_stops_before_spawning_or_creating_log(self):
        with patch('deploy.install_watch.check_install_memory', side_effect=PreflightError('Memória insuficiente')):
            with patch('deploy.install_watch.subprocess.Popen') as child:
                with self.assertRaises(PreflightError):
                    run_stage(['apt-get', 'install'], 'Pacotes', self.log)
            child.assert_not_called()
        self.assertFalse(self.log.exists())
