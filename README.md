# Incus Panel

Painel em português para administrar containers Incus reais em TV boxes Linux. Python e HTML/CSS/JavaScript nativos, sem npm, pip, banco externo ou compilação no equipamento. A instalação usa o socket Unix do Incus. A simulação só é ativada explicitamente com `--demo`.

## Instalar com um comando

Na pasta do projeto, em Linux compatível:

```bash
sudo sh install.sh
```

O instalador prepara automaticamente as faixas UID/GID ausentes de root, usando
somente IDs já disponíveis, e verifica os namespaces antes de configurar o Incus.
Quando altera as faixas, aplica a configuração ao serviço Incus se já estiver ativo.
Faixas existentes são preservadas. Se sua VPS for um LXC sem delegação suficiente,
ele informa o ajuste necessário no hospedeiro.
Para verificar separadamente: `sudo python3 deploy/preflight.py`.
Veja o [diagnóstico de LXC e VMs](docs/instalacao-local.md).

Sem clonar, **depois que esta versão estiver publicada na branch `main`**:

```bash
sudo sh -c 'set -eu; apt-get update; apt-get install -y --no-install-recommends ca-certificates curl; f=$(mktemp); trap "rm -f $f" EXIT; curl -fsSL --proto "=https" https://raw.githubusercontent.com/costadebritorichard-ctrl/incus-panel/main/install.sh -o "$f"; sh "$f"'
```

O instalador prepara Python, Incus e utilitários de rede, configura armazenamento `dir` e rede NAT quando ausentes, gera HTTPS e senha aleatória e habilita os serviços no boot. Mostra URL, usuário `admin`, senha e fingerprint do certificado. Guarde a senha assim que aparecer.

O consumo medido do processo Python **não representa o consumo da instalação completa**. APT/DPKG, Incus, serviços de rede e extração de imagens também usam RAM, CPU e disco; o pico desse conjunto ainda não foi medido em TV boxes. Após obter as ferramentas mínimas, o bootstrap verifica RAM disponível e limites de cgroups antes de cada etapa de pacotes, mostra atividade a cada 15 s e grava logs privados em `/var/log/incus-panel/`. Não elimina o risco de falta de recursos durante a etapa.

A instalação só é confirmada depois de uma leitura autenticada da API e de um teste **real** de criação, início, reinício, parada e exclusão de um Alpine temporário, pelo backend do painel. Precisa de Internet para pacotes e imagens. A imagem fica em cache; falhas mostram o nome do container de teste para diagnóstico.

O script usa o código local quando executado na pasta do projeto; quando baixado isoladamente, obtém um snapshot do GitHub. O comando remoto só inclui alterações já publicadas.

## Compatibilidade e consumo

- Debian 12 (backports oficial), Debian 13, Ubuntu 24.04/26.04 e Armbian com essas bases; systemd e pacotes disponíveis para amd64, arm64 ou armhf.
- Linux com namespaces, cgroups, seccomp e suporte a containers. Android original não atende. O instalador não troca firmware, kernel ou partições.
- O instalador exige pelo menos 512 MB nominais, 256 MiB disponíveis e 1 GiB livre em `/var`. São limiares de entrada; não comprovam que a instalação completa caiba em 512 MB. A checagem considera limites de cgroups visíveis e não soma swap à RAM disponível.
- Modo leve por padrão em todos os transportes: inventário manual reutilizado entre telas, eventos desativados e uma criação por vez. Progresso consultado a cada 5 segundos somente na tela correspondente visível; o Incus continua a operação em segundo plano.
- Tabelas com 25 linhas por página, detalhes carregados ao abrir e efeitos de desfoque/animação desativados. Arquivos estáticos comprimidos uma vez e revalidados por ETag.
- Containers novos recebem 128 MiB de RAM, meio núcleo de CPU e autostart desligado. A criação exige 256 MiB disponíveis; download e extração podem precisar de mais.
- Serviço do painel com até quatro requisições simultâneas no modo leve, limitado a 25% de CPU, `MemoryHigh=64M` e `MemoryMax=128M`. Ajustes do alocador glibc devolvem grandes buffers temporários ao sistema. São limites configurados; Incus e containers consomem recursos separados.
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

Para medir tráfego e RSS/CPU com uma fixture local de 200 containers: `python3 scripts/benchmark.py --output artifacts/performance.json`. O ensaio usa as variáveis do alocador presentes no arquivo de serviço e requer Linux; não mede o daemon Incus nem comprova consumo em ARM/TV boxes. Procedimento e resultados locais em [desempenho](docs/desempenho.md).

Licença MIT.
