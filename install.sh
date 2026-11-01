#!/bin/sh
# Bootstrap Linux, sem compilação, npm, pip, Docker ou dependências de VM.
set -eu
export LC_ALL=C
fail() { printf '\nErro: %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail 'Execute este instalador com sudo sh install.sh.'
[ "$(uname -s)" = Linux ] || fail 'Requer Linux nativo; Android original não é suportado.'
[ -d /run/systemd/system ] || fail 'Requer Linux iniciado com systemd.'
[ -r /etc/os-release ] || fail 'Distribuição não identificada.'
. /etc/os-release
base=${ID:-}
case "$base" in
  debian|ubuntu) ;;
  *)
    case " ${ID_LIKE:-} " in
      *' debian '*) base=debian ;;
      *' ubuntu '*) base=ubuntu ;;
      *) fail 'Instalação automática: Debian 12/13 ou Ubuntu 24.04/26.04 (inclui derivados Armbian compatíveis).' ;;
    esac ;;
esac
case "$base:${VERSION_CODENAME:-}" in
  debian:bookworm|debian:trixie|ubuntu:noble|ubuntu:resolute) ;;
  *) fail "Base não suportada: $base ${VERSION_CODENAME:-desconhecida}. Use Debian 13 ou Ubuntu 24.04." ;;
esac
[ -e /proc/self/ns/user ] && [ -e /proc/self/ns/net ] || fail 'Kernel sem namespaces necessários ao Incus.'
[ -d /sys/fs/cgroup ] || fail 'Kernel sem cgroups montados.'
arch=$(dpkg --print-architecture)
case "$arch" in amd64|arm64|armhf) ;; *) fail "Arquitetura sem suporte neste instalador: $arch" ;; esac
# Não cria swap nem altera partições/boot em flash de TV boxes.
ram=$(awk '/MemTotal:/ {print $2}' /proc/meminfo)
[ "$ram" -ge 450000 ] || fail 'Requer pelo menos 512 MB nominais de RAM; recomendado 1 GB ou mais.'
free_kb=$(df -Pk /var | awk 'END {print $4}')
[ "$free_kb" -ge 1048576 ] || fail 'Libere ao menos 1 GiB em /var para instalação e imagem de teste.'
export DEBIAN_FRONTEND=noninteractive
# O instalador e seus filhos também devem devolver buffers grandes após uso.
: "${MALLOC_ARENA_MAX:=2}"
: "${MALLOC_MMAP_THRESHOLD_:=131072}"
export MALLOC_ARENA_MAX MALLOC_MMAP_THRESHOLD_
source_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
apt_updated=false
apt_run() {
  label=$1
  shift
  if command -v python3 >/dev/null 2>&1 && [ -f "$source_dir/deploy/install_watch.py" ] && [ -f "$source_dir/incus_panel/memory.py" ]; then
    python3 "$source_dir/deploy/install_watch.py" --label "$label" -- apt-get \
      -o Acquire::Languages=none -o Dpkg::Use-Pty=0 "$@"
  else
    printf '\nEtapa: %s\n' "$label"
    apt-get -o Acquire::Languages=none -o Dpkg::Use-Pty=0 "$@"
  fi
}
apt_refresh() {
  if [ "$apt_updated" = false ]; then
    apt_run 'Atualizar índices de pacotes' update
    apt_updated=true
  fi
}
# No checkout usual, verificar antes de instalar pacotes ou alterar serviços.
# O bootstrap isolado obtém somente as ferramentas e o código da verificação.
if ! command -v python3 >/dev/null 2>&1 || ! command -v unshare >/dev/null 2>&1 || [ ! -f "$source_dir/deploy/preflight.py" ]; then
  apt_refresh
  apt_run 'Instalar ferramentas mínimas do bootstrap' install -y --no-install-recommends ca-certificates curl python3 util-linux
fi
if [ ! -f "$source_dir/deploy/install.py" ] || [ ! -d "$source_dir/incus_panel" ]; then
  work=$(mktemp -d /var/tmp/incus-panel-install.XXXXXXXX)
  trap 'rm -rf -- "$work"' EXIT HUP INT TERM
  ref=${INCUS_PANEL_REF:-main}
  case "$ref" in *[!a-zA-Z0-9._-]*|'') fail 'INCUS_PANEL_REF inválida.' ;; esac
  curl --fail --location --retry 3 --proto '=https' --tlsv1.2 \
    "https://codeload.github.com/costadebritorichard-ctrl/incus-panel/tar.gz/$ref" -o "$work/source.tar.gz"
  tar -xzf "$work/source.tar.gz" -C "$work" --strip-components=1
  source_dir=$work
fi
python3 -c 'import sys; assert sys.version_info >= (3,11), "Requer Python 3.11+"'
[ -f "$source_dir/deploy/preflight.py" ] || fail 'Código sem pré-verificação. Atualize o checkout ou INCUS_PANEL_REF.'
[ -f "$source_dir/deploy/install_watch.py" ] && [ -f "$source_dir/incus_panel/memory.py" ] || fail 'Código incompleto: atualize o checkout inteiro, incluindo deploy/ e incus_panel/, não apenas install.sh.'
python3 "$source_dir/deploy/preflight.py"
apt_refresh
apt_run 'Instalar dependências de containers e HTTPS' install -y --no-install-recommends ca-certificates curl python3 openssl iproute2 util-linux uidmap dnsmasq-base nftables lxcfs apparmor
if ! command -v incus >/dev/null 2>&1 || ! systemctl cat incus.service >/dev/null 2>&1; then
  if [ "$base:${VERSION_CODENAME}" = debian:bookworm ]; then
    # Repositório oficial, validado pelo chaveiro Debian já instalado.
    printf '%s\n' 'deb https://deb.debian.org/debian bookworm-backports main' > /etc/apt/sources.list.d/incus-panel-backports.list
    apt_updated=false
    apt_refresh
    apt_run 'Instalar Incus para containers (Debian backports)' install -y --no-install-recommends -t bookworm-backports incus-base incus-client
  else
    incus_package=incus-base
    # Noble antecede a separação incus-base; QEMU é recomendado, não obrigatório.
    if [ "$base:${VERSION_CODENAME}" = ubuntu:noble ]; then
      incus_package=incus
    fi
    # Ubuntu precisa ter universe habilitado na imagem do sistema.
    if ! apt-cache show "$incus_package" >/dev/null 2>&1; then
      if [ "$base" = ubuntu ]; then
        apt_run 'Habilitar suporte ao repositório Ubuntu universe' install -y --no-install-recommends software-properties-common
        add-apt-repository -y universe
        apt_updated=false
        apt_refresh
      fi
    fi
    apt_run 'Instalar Incus para containers' install -y --no-install-recommends "$incus_package" incus-client
  fi
fi
python3 "$source_dir/deploy/install_watch.py" --label 'Iniciar serviço Incus' -- systemctl enable --now incus.service
python3 "$source_dir/deploy/install_watch.py" --label 'Iniciar serviço lxcfs' -- systemctl enable --now lxcfs.service
printf '\nEtapa: configurar painel HTTPS e validar o container de teste\n'
python3 "$source_dir/deploy/install.py" --verify-container "$@"
