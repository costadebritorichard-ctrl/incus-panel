"""Executa etapas do bootstrap com log incremental e diagnóstico de recursos."""
import argparse
import codecs
import os
from pathlib import Path
import selectors
import subprocess
import sys
import time

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from deploy.preflight import PreflightError, check_install_memory
from incus_panel.memory import describe_memory, memory_status


def pressure():
    readings = []
    for resource in ('memory', 'io'):
        try:
            line = Path('/proc/pressure', resource).read_text().splitlines()[0]
            readings.append(resource + ': ' + ' '.join(line.split()[:2]))
        except (OSError, IndexError):
            pass
    return '; '.join(readings)


def diagnose(emit=print):
    try:
        status = memory_status()
        emit(describe_memory(status))
        emit(f"Indicador oom_kill (soma dos cgroups visíveis): {status['oom_kill']}")
    except (OSError, ValueError, KeyError) as exc:
        emit('Memória indisponível: ' + str(exc))
    emit('Pressão de recursos: ' + (pressure() or 'indisponível'))
    for command in (['df', '-h', '/', '/var'], ['journalctl', '-k', '-b', '--no-pager', '-n', '60']):
        emit('Diagnóstico: ' + ' '.join(command))
        try:
            result = subprocess.run(command, capture_output=True, text=True, errors='replace', timeout=5)
            emit((result.stdout + result.stderr)[-16000:])
        except (OSError, subprocess.TimeoutExpired) as exc:
            emit('Diagnóstico indisponível: ' + str(exc))


def run_stage(command, label, log_path, interval=15, stream=None):
    """Stream in bounded chunks; keep the child status even when copying output."""
    stream = stream or sys.stdout
    status = check_install_memory()
    log_path.parent.mkdir(parents=True, exist_ok=True, mode=0o750)
    descriptor = os.open(log_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, 'w', encoding='utf-8') as log:
        def emit(message):
            text = message + '\n'
            log.write(text)
            log.flush()
            stream.write(text)
            stream.flush()

        emit('Etapa: ' + label)
        emit('Log desta etapa: ' + str(log_path))
        emit(describe_memory(status))
        started = time.monotonic()
        child = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        try:
            decoder = codecs.getincrementaldecoder('utf-8')('replace')
            with selectors.DefaultSelector() as selector:
                selector.register(child.stdout, selectors.EVENT_READ)
                next_report = started + interval
                pipe_open = True
                while pipe_open or child.poll() is None:
                    timeout = max(0, next_report - time.monotonic()) if child.poll() is None else 0
                    events = selector.select(timeout) if pipe_open else []
                    if not pipe_open and child.poll() is None:
                        time.sleep(min(interval, 0.2))
                    for key, _ in events:
                        raw = os.read(key.fd, 8192)
                        if raw:
                            text = decoder.decode(raw)
                            log.write(text)
                            log.flush()
                            stream.write(text)
                            stream.flush()
                        else:
                            selector.unregister(child.stdout)
                            pipe_open = False
                    if child.poll() is not None and not events:
                        break
                    if child.poll() is None and time.monotonic() >= next_report:
                        try:
                            current = describe_memory(memory_status())
                        except (OSError, ValueError, KeyError):
                            current = 'memória indisponível'
                        emit(f'\n[Etapa ativa há {time.monotonic() - started:.0f}s; PID {child.pid}] {current}; {pressure()}')
                        next_report = time.monotonic() + interval
            tail = decoder.decode(b'', final=True)
            if tail:
                log.write(tail)
                stream.write(tail)
            code = child.wait()
        except BaseException:
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()
            raise
        finally:
            child.stdout.close()
        emit(f'\nEtapa encerrada: {label}; código {code}; duração {time.monotonic() - started:.1f}s.')
        if code:
            diagnose(emit)
            emit('Não foi possível concluir esta etapa. Preserve o log: ' + str(log_path))
        return code if code >= 0 else 128 - code


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--diagnose', action='store_true', help='Somente leitura; não instala nem altera pacotes')
    parser.add_argument('--label', default='Instalação de pacotes')
    parser.add_argument('command', nargs=argparse.REMAINDER)
    args = parser.parse_args()
    if args.diagnose:
        diagnose()
        return 0
    command = args.command[1:] if args.command[:1] == ['--'] else args.command
    if not command:
        parser.error('Informe o comando depois de --.')
    path = Path('/var/log/incus-panel') / (time.strftime('install-%Y%m%d-%H%M%S-') + str(os.getpid()) + '.log')
    try:
        return run_stage(command, args.label, path)
    except (OSError, PreflightError) as exc:
        print('Instalação interrompida: ' + str(exc), file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
