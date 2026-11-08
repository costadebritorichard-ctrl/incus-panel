# Incus Panel

Painel em português para administrar containers Incus reais em TV boxes Linux. Python e HTML/CSS/JavaScript nativos, sem npm, pip, banco externo ou compilação no equipamento. A instalação usa o socket Unix do Incus. A simulação só é ativada explicitamente com `--demo`.

A interface segue a organização do Proxmox VE: árvore de recursos à esquerda, abas do recurso selecionado, ações no topo e painel de tarefas no rodapé, recolhível e redimensionável. **Criar CT** abre um assistente com Geral, Template, Discos, CPU, Memória, Rede, DNS e Confirmar. A identidade e as operações continuam sendo do Incus; não há dependência do Proxmox.

O espaço de trabalho se ajusta à largura e à altura da janela: até 1100 px, a árvore abre pelo menu; até 650 px, as abas ficam na horizontal. Tabelas têm rolagem própria. O login usa um diálogo compacto sobre uma estrutura vazia do painel, com autenticação por conta local, envio por Enter e opção de salvar apenas o nome de usuário no navegador. Senhas não são gravadas por essa opção. O idioma disponível é português brasileiro.

A revisão visual usa como referência o código oficial do Proxmox: barra do recurso, árvore recolhível e redimensionável, grades com filtros e ordenação, editores em diálogos, gráficos e tarefas. Veja o [mapeamento das telas e a verificação de responsividade](docs/proxmox-interface.md).

O assistente abre sobre qualquer tela, preservando a página e os rascunhos. Nome e template são obrigatórios; cada etapa precisa estar válida antes de avançar. O progresso aparece em uma janela de tarefas, que informa **Concluída / TASK OK** após a confirmação do Incus e atualiza a lista de containers automaticamente. Veja a [revisão da interface, testes e limites de escopo](docs/revisao-interface.md).

No assistente administrativo, escolha memória, núcleos, limite de CPU, pool, bridge, reserva IPv4 e inicialização automática. A cota de disco só é oferecida nos drivers suportados pelo assistente; `dir` utiliza a capacidade do pool. DNS é herdado da bridge. É possível criar e manter parado ou iniciar após a criação. Instalações restritas à allowlist usam a configuração do perfil `default`.

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
- Serviço do painel com até quatro requisições simultâneas no modo leve, `CPUQuota=100%` (até um núcleo, com prioridade baixa `Nice=10`), `MemoryHigh=64M` e `MemoryMax=128M`. Um único cálculo de senha por vez evita picos concorrentes. Ajustes do alocador glibc devolvem grandes buffers temporários ao sistema. São limites configurados; Incus e containers consomem recursos separados.
- Armazenamento `dir`, sem ZFS ou discos loop. Snapshots copiam dados e precisam de espaço. Containers sem privilégios; a segurança do kernel não é desativada para contornar incompatibilidades.

Os pacotes seguem a [documentação oficial do Incus](https://linuxcontainers.org/incus/docs/main/installing/). O bootstrap usa `incus-base` e `incus-client`; no Ubuntu 24.04 usa `incus` sem pacotes recomendados, evitando o conjunto de máquinas virtuais.

## Operação

Permite criar containers com imagens Alpine/Debian compatíveis, iniciar, parar, reiniciar, editar limites e descrição, excluir containers parados, criar snapshots/backups, restaurar ou excluir snapshots, excluir backups e abrir shell textual `/bin/sh`. A aba [Snapshots](docs/snapshots.md) segue a referência Proxmox, com nome, descrição persistente, edição e linha AGORA. Administradores podem criar contas locais, definir papel, Projects e acesso a métricas do host. O tema escuro fica salvo no navegador. O resultado vem do Incus; criação só informa sucesso após confirmar `Running`.

Configuração em `/etc/incus-panel/config.local.json`, contas do painel em `/var/lib/incus-panel/users.json`, versões em `/opt/incus-panel/releases` e serviço `incus-panel`. A tela **Usuários** permite gerenciar as contas locais; os papéis e Projects são aplicados no servidor. Isso não cria identidades no Incus nem substitui a autorização da identidade de serviço. O usuário do serviço recebe acesso administrativo ao Incus. O painel escuta em `0.0.0.0:8444`, em todas as interfaces IPv4 da TV box. Acesse `https://IP_DA_TVBOX:8444` por qualquer um desses endereços; login e ações aceitam a origem HTTPS do IP acessado. A API Incus não é publicada na rede.

Reexecute o instalador com o código atualizado para migrar a escuta de um IP específico para todas as interfaces, preservando senha e certificado. Certificados novos incluem os IPv4 presentes na instalação; certificados antigos ou mudanças posteriores de IP podem exigir reemissão com os endereços adicionais no SAN. Veja o [guia de acesso por múltiplos IPs](docs/instalacao-local.md#acesso-por-qualquer-ipv4-da-tv-box). Mudanças de identidade ou permissões exigem revisão da configuração. Uma instalação anterior em somente leitura não é promovida silenciosamente.

[Instalação e diagnóstico](docs/instalacao-local.md) · [Integração SSH](docs/tvbox.md) · [Operação e segurança](docs/operacao.md) · [Bridges e interfaces](docs/bridges.md).

## Validação

Veja a [validação na TV box de 07/11/2026](docs/validacao-tvbox-2026-11-07.md)
para os critérios funcionais, medições reais de navegação, correções aplicadas
e pendências de infraestrutura.

```bash
python -m unittest discover -s tests -v
node --check web/app.js
python scripts/traceability.py --check
```

Node só é necessário para desenvolvimento. A CI `incus-real.yml` instala Ubuntu/Incus reais, testa o serviço, o ciclo do container e a reinstalação. Sua execução e a compatibilidade de cada TV box precisam ser confirmadas no ambiente correspondente; os testes locais no Windows não comprovam isso.

O console abre pela aba **Console**, pelo botão **Console ↗** ou por duplo clique no container em execução. Usa xterm.js local, teclado direto, sequências ANSI/VT e redimensionamento automático; `/bin/sh` roda no container via exec interativo do Incus, com a autorização da sessão. Não exige digitar novamente o alvo. Em demonstração, o shell permanece indisponível. A integração com um Incus real precisa ser validada no equipamento; os testes locais de protocolo e DOM não comprovam esse aceite.

Histórico de tarefas/auditoria fica em memória; contas locais persistem em `/var/lib/incus-panel/users.json`; containers pertencem ao Incus e sobrevivem ao reinício do painel. Administradores podem gerir bridges controladas pelo Incus quando `manage_networks` está habilitado e o painel está em modo gravável; interfaces externas ficam somente para consulta. Configuração de pools, exportação/importação de backups, VMs e gestão de clusters permanecem fora do escopo. A [rastreabilidade](docs/rastreabilidade.md) registra as lacunas restantes.

Para desenvolver com dados simulados: `python -m incus_panel.server --demo`. Esse modo não é usado na instalação.

Teste opcional da interface sem navegador: instale `npm install --prefix artifacts/qa jsdom --no-audit --no-fund`, execute `python tests/create_fixture.py` em um terminal e `node scripts/dom-smoke.mjs` em outro. A fixture deve estar nova a cada execução. O teste cobre 20 rotas, as oito etapas, limites, criação, erro assíncrono, tarefas, console com dublês explícitos, cache de leituras ao revisitar telas e manutenção da tela enquanto outra rota carrega. Não verifica a aparência nem executa um shell real. xterm.js 6.0.0 e addon-fit 0.11.0 são distribuídos em `web/vendor`, com licenças MIT; o JavaScript do terminal só é carregado ao abrir um console autorizado.

Com outra fixture nova, `node scripts/creation-review.mjs` verifica a conclusão com a janela aberta, restauração atrasada de sessão, atualização automática da lista e da árvore, erro do Incus, criação sem iniciar e retomada do acompanhamento sem reenviar a criação.

Para medir tráfego e RSS/CPU com uma fixture local de 200 containers: `python3 scripts/benchmark.py --output artifacts/performance.json`. O ensaio usa as variáveis do alocador presentes no arquivo de serviço e requer Linux; não mede o daemon Incus nem comprova consumo em ARM/TV boxes. Procedimento e resultados locais em [desempenho](docs/desempenho.md).

Licença MIT.
