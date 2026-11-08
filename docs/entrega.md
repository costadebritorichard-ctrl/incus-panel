# Relatório por lote — 0.1.0

Este documento preserva o relatório histórico do lote original 0.1.0 e da atualização de 05/11/2026. A [validação de 07/11/2026](validacao-tvbox-2026-11-07.md) registra os testes posteriores com mutações em recursos descartáveis, o navegador real e as correções de desempenho. As pendências históricas abaixo devem ser interpretadas junto desse relatório mais recente.

## LOTE-00 / F0

WBS-01/02: documentação original preservada; inventário com hash de todos os arquivos, decisões arquiteturais, fronteiras de segurança, licença MIT, fixture isolada e protocolo experimental. Leitura das fontes oficiais REST/exec/eventos conferida; o OpenAPI exato do Incus 6.0.4 e a comparação A/B direto versus proxy não foram validados. CPU/RSS não medidos no H3.

## LOTE-01 / F1

WBS-03 e telas TEL-01–07/21: navegação, login e sessão, dashboard, árvore do escopo, seleção de host/Project, tabela filtrável, detalhe e recursos. API remota de leitura e fixture separadas. F1 bloqueia mutações no backend. Métricas ausentes não viram zero. Onboarding de confiança usa configuração administrativa fora de banda; não há wizard de enrollment. Visão global completa da árvore e seleção múltipla não implementadas. Aceite do dashboard no H3 permanece aberto.

## LOTE-02 / F2

TEL-05/06/10/19/22: Start/Stop/Restart com autorização e confirmação; UUID e estado terminal; console xterm.js com teclado direto, ANSI/VT, ajuste automático de tamanho e janela dedicada; limite de canais, expiração, encerramento por logout e abandono; lifecycle/operation via WebSocket TLS com backoff e resync. Os testes cobrem protocolo, isolamento, entrada/resize e ciclos de sessão com dublês; não comprovam que `/bin/sh` abriu no Incus real. Eventos e console são opt-in no exemplo; o instalador local habilita console. A auditoria é temporária.

## LOTE-03 / F3

TEL-08/09/11–18/20: devices com origem, configurações redigidas, leitura de imagens/profiles/redes/Projects/pools; assistente de oito etapas com imagem compatível, limites, pool, bridge e início opcional; criação/listagem de snapshot/backup; restauração/exclusão de snapshot e exclusão de backup; contas locais com papel e Projects; tema escuro; inventário de volumes e leases DHCP; exclusão de container com proteções; alertas de storage. O perfil default fornece a base, com overrides administrativos validados; não há formulário de devices arbitrários. Download/importação de backup, importação/remoção de imagens, alteração de volumes, configuração de redes/pools/profiles e cluster permanecem pendentes. Não há limpeza de armazenamento.

## LOTE-04 / F4

WBS-05/06/07: 54 testes locais de contrato/HTTP/WebSocket, verificação sintática JavaScript, smoke HTTP real sobre fixture, workflow CI, manuais, exemplos de serviço/proxy, script de coleta Linux e protocolo EXP-01–08. CI remota não executada. ARMv7/ARM64/Linux, consumo H3, acessibilidade por usuário e usabilidade não medidos. O Edge headless falhou na inicialização de GPU sob este executor; QA visual não foi concluída. Não há gráficos ou conclusões acadêmicas inventadas.

## LOTE-05 / F5

Há seleção de hosts configurados e escopos/papéis no servidor. Gestão de cluster, editor de usuários, OIDC/OpenFGA, migração e alterações administrativas globais permanecem fora desta versão. Host standalone não recebe membros fictícios.

## Segurança e limites comuns

CA/hostname/fingerprint obrigatórios, URLs fixas, nenhuma credencial Incus em assets, redaction recursiva, CSRF/Origin e cookie HttpOnly, hash scrypt, escopos backend e lista de containers mutáveis. Testes exercitam tentativas de atravessar Projects, operar produção, invocar console como observador, usar alvo incorreto e apagar container protegido. O serviço mantém uma identidade TLS por host; use isolamento de serviço/certificado para políticas mais fortes. Requer rede privada e proxy reverso com limites; não foi auditado como serviço público multi-tenant.

## Histórico de versionamento do lote 0.1.0

Commits incrementais reais foram gravados em `.git-local` porque o executor bloqueia escrita em `.git`. Um bundle exporta o histórico completo. O usuário confirmou autenticação GitHub no seu terminal, mas a sessão continuou recebendo bloqueio de socket ao acessar `api.github.com`. Repositório remoto e push não foram confirmados. `scripts/publish.ps1` importa o histórico para o Git normal, cria repositório privado e faz push no terminal autenticado do usuário, sem force.

## Atualização de 2026-11-05

### Correções e validação local

- **Snapshots:** o painel consulta os nomes antes do POST, sugere um nome livre, impede o envio de nomes já exibidos, bloqueia cliques duplicados durante a confirmação, atualiza a lista após sucesso e conserva a mensagem original do Incus em conflito. A lista normaliza o identificador para mostrar somente o nome do snapshot.
- **Bridges:** administradores podem criar, consultar, editar e excluir bridges gerenciadas quando `manage_networks: true` e `read_only: false`. São editáveis apenas endereço IPv4/IPv6, DHCP, NAT e domínio DNS; interfaces físicas e bridges com uplinks externos são somente leitura. A exclusão verifica dependências no Incus, profiles e NICs expandidas. A seleção de bridge no assistente de criação já existia.
- **Disco:** o assistente já desabilitava cota para o driver `dir` e só habilitava `btrfs`, `zfs`, `lvm` ou `ceph`; nenhuma migração do pool foi feita.
- **Autenticação e métricas:** os contratos de sessão, logout, proteção da API e escopos continuam cobertos pela regressão. A interface identifica CPU como tempo acumulado, sem tratá-lo como percentual instantâneo.
- **Navegação leve:** até 128 respostas estáveis ficam em cache por sessão/escopo; atualização manual, mudança de escopo e mutações limpam o cache. A tela atual continua visível durante a montagem da próxima. O polling de criação e downloads pausa fora da tela correspondente e retoma ao voltar.

A suíte Python aprovou 217 testes, com 4 ignorados. `node --check` e `python -m compileall -q incus_panel` passaram. O smoke DOM percorreu 20 rotas e validou oito etapas de criação, confirmação única de snapshot, cache na troca de telas, retenção da tela atual durante carregamento, polling pausado fora da tela, tarefas, falha assíncrona e console com dublês. Esses resultados validam a fixture; não são aceites de mutação em hardware real.

### TV Box

O SSH foi acessado em modo diagnóstico. O host reportou Debian 13, ARMv7, Incus 6.0.4, aproximadamente 991 MiB de RAM e 765 MiB disponíveis. O serviço do painel apresentou RSS de aproximadamente 19 MiB, memória atual de 14 MiB, pico de 31 MiB e 196 segundos de CPU acumulados em cerca de 33 horas. A pool usa `dir`; a bridge gerenciada está em uso; há três containers ativos e `container-teste` já possui o snapshot `teste1`. Foram feitas apenas consultas; nenhum workload foi alterado.

A sessão autenticada do painel não pôde ser aberta pelo navegador conectado, portanto o tempo real de transição de telas na TV Box não foi cronometrado. A validação DOM local confirma que a mudança reduz consultas repetidas e mantém a tela atual durante carregamento. O ciclo de criação/exclusão de snapshot e bridge e a conexão de container devem ser verificados em recursos descartáveis antes de classificar esses aceites como concluídos.
