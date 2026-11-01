# Incus Panel

Painel em português para administrar containers Incus reais em TV boxes Linux. Python e HTML/CSS/JavaScript nativos, sem npm, pip, banco externo ou compilação no equipamento. A instalação usa o socket Unix do Incus. A simulação só é ativada explicitamente com `--demo`.

## Instalar com um comando

Na pasta do projeto, em Linux compatível:

```bash
sudo sh install.sh
```

Sem clonar, **depois que esta versão estiver publicada na branch `main`**:

```bash
sudo sh -c 'set -eu; apt-get update; apt-get install -y --no-install-recommends ca-certificates curl; f=$(mktemp); trap "rm -f $f" EXIT; curl -fsSL --proto "=https" https://raw.githubusercontent.com/costadebritorichard-ctrl/incus-panel/main/install.sh -o "$f"; sh "$f"'
```

O instalador prepara Python, Incus e utilitários de rede, configura armazenamento `dir` e rede NAT quando ausentes, gera HTTPS e senha aleatória e habilita os serviços no boot. Mostra URL, usuário `admin`, senha e fingerprint do certificado. Guarde a senha assim que aparecer.

A instalação só é confirmada depois de uma leitura autenticada da API e de um teste **real** de criação, início, reinício, parada e exclusão de um Alpine temporário, pelo backend do painel. Precisa de Internet para pacotes e imagens. A imagem fica em cache; falhas mostram o nome do container de teste para diagnóstico.

O script usa o código local quando executado na pasta do projeto; quando baixado isoladamente, obtém um snapshot do GitHub. O comando remoto só inclui alterações já publicadas.

## Compatibilidade e consumo

- Debian 12 (backports oficial), Debian 13, Ubuntu 24.04/26.04 e Armbian com essas bases; systemd e pacotes disponíveis para amd64, arm64 ou armhf.
- Linux com namespaces, cgroups, seccomp e suporte a containers. Android original não atende. O instalador não troca firmware, kernel ou partições.
- Pelo menos 512 MB nominais de RAM e 1 GiB livre em `/var` para começar; recomendado 1 GB de RAM e espaço adicional para aplicações. Não há garantia para qualquer hardware.
- Inventário atualizado manualmente, eventos desativados, uma criação por vez e progresso consultado a cada 5 segundos.
- Containers novos recebem 128 MiB de RAM, meio núcleo de CPU e autostart desligado. A criação exige 256 MiB disponíveis; download e extração podem precisar de mais.
- Serviço do painel limitado a 25% de CPU, `MemoryHigh=96M` e `MemoryMax=160M`. São limites configurados, não medições. Incus e containers consomem recursos separados.
- Armazenamento `dir`, sem ZFS ou discos loop. Snapshots copiam dados e precisam de espaço. Containers sem privilégios; a segurança do kernel não é desativada para contornar incompatibilidades.

Os pacotes seguem a [documentação oficial do Incus](https://linuxcontainers.org/incus/docs/main/installing/). O bootstrap usa `incus-base` e `incus-client`; no Ubuntu 24.04 usa `incus` sem pacotes recomendados, evitando o conjunto de máquinas virtuais.

## Operação

Permite criar containers com imagens Alpine/Debian compatíveis, iniciar, parar, reiniciar, editar limites e descrição, excluir containers parados, criar snapshots/backups e abrir shell textual `/bin/sh`. O resultado vem do Incus; criação só informa sucesso após confirmar `Running`.

Configuração em `/etc/incus-panel/config.local.json`, versões em `/opt/incus-panel/releases` e serviço `incus-panel`. O usuário do serviço recebe acesso administrativo ao Incus. O navegador usa HTTPS na porta 8444; a API Incus não é publicada na rede. Configure uma reserva DHCP para manter o endereço.

Reexecute o instalador para atualizar, preservando configuração e senha. Mudanças de IP, identidade ou permissões exigem revisão da configuração. Uma instalação anterior em somente leitura não é promovida silenciosamente.

[Instalação e diagnóstico](docs/instalacao-local.md) · [Integração SSH](docs/tvbox.md) · [Operação e segurança](docs/operacao.md).

## Validação

```bash
python -m unittest discover -s tests -v
node --check web/app.js
python scripts/traceability.py --check
```

Node só é necessário para desenvolvimento. A CI `incus-real.yml` instala Ubuntu/Incus reais, testa o serviço, o ciclo do container e a reinstalação. Sua execução e a compatibilidade de cada TV box precisam ser confirmadas no ambiente correspondente; os testes locais no Windows não comprovam isso.

O console é por linha, sem emulação completa de terminal. Histórico de tarefas/auditoria fica em memória; containers pertencem ao Incus e sobrevivem ao reinício do painel. Restauração de backups/snapshots e gestão de clusters pela interface ainda não estão implementadas. A [rastreabilidade](docs/rastreabilidade.md) registra as demais funcionalidades da especificação.

Para desenvolver com dados simulados: `python -m incus_panel.server --demo`. Esse modo não é usado na instalação.

Licença MIT.
