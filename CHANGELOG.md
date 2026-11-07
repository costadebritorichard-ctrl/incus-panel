# Changelog

## Console somente interativo — 2026-11-07

- Removida a barra separada de comandos; toda a digitação acontece diretamente no terminal, no padrão do Proxmox.
- Mantidos o transporte WebSocket contínuo, atalhos do terminal e alternativa HTTP; janela dedicada recupera o espaço da barra removida.

## Console contínuo e envio por comando — 2026-11-07

- Campo Comando com edição local e envio da linha completa somente com Enter ou Enviar; teclado do terminal permanece interativo.
- Transporte WebSocket entre navegador e painel para entrada, saída e tamanho do terminal, com alternativa HTTP para proxies sem upgrade.
- Saída com controle de fluxo, buffer limitado sem truncamento silencioso, validação de sessão/Origin/CSRF, heartbeat e limpeza dos canais ao desconectar.
- Conexões de console não ocupam os slots HTTP do painel; testes de protocolo, autorização, concorrência e navegador com fixture de eco explícita.

## Menus de contexto e ações de containers — 2026-11-07

- Menu de containers com organização do Proxmox: título azul, ícones, separadores, estados desabilitados e navegação por teclado, na árvore e nas grades.
- Distinção entre desligamento normal e parada imediata com confirmação; clonagem local com snapshots opcionais e criação de modelos como imagens privadas reutilizáveis do Incus.
- Menus para nó, datacenter, armazenamento e redes; operações em massa sobre seleção de containers autorizados, incluindo suspender e retomar.
- Validação de estado, escopo, papel, confirmação e colisões de nomes no backend; clonagem e modelos preservam o container de origem.

## Tema, contas locais e recuperação de snapshots — 2026-11-02

- Tema escuro com alternância acessível, respeito à preferência do sistema e escolha persistida no navegador.
- Administração de contas do painel: criar, editar papel/Projects/acesso às métricas do host, trocar senha e revogar sessão; gravação atômica em `/var/lib/incus-panel/users.json`.
- Restaurar e excluir snapshots, além de excluir backups, com confirmação de escopo, verificação do artefato, permissões administrativas e exigência de container parado para restaurar.
- Inventário de volumes de armazenamento e leases DHCP de bridges gerenciadas, com acesso global de leases condicionado à permissão de métricas do host.
- A identidade TLS/Unix do serviço continua sendo compartilhada; as contas locais não criam usuários nem ACLs no Incus.
- Exportação/importação de backups, volumes, configuração de redes/pools/profiles e gestão de cluster continuam fora desta entrega.

## Interface de gerenciamento e terminal — 2026-11-02

- Organização visual baseada no Proxmox VE, implementada para Incus: árvore à esquerda, navegação contextual, ações no topo, tabelas compactas e painel inferior de tarefas/auditoria recolhível e redimensionável.
- Criar CT abre assistente de oito etapas com memória, CPU, pool, cota de disco nos drivers suportados, bridge, reserva IPv4, DNS herdado, descrição, autostart e início opcional. Validação de tipos, limites e recursos no servidor.
- Console com xterm.js local e carregamento sob demanda, teclado direto, ANSI/VT, resize automático, aba e janela dedicada; preserva autenticação, CSRF, escopos, limites de canais e fechamento por sessão/navegação.
- Testes de opções de criação e protocolo do terminal, além de teste DOM opcional com 20 rotas, assistente e dublês explícitos de console. Aceite visual e conexão a Incus real permanecem pendentes nesta sessão.

## Escuta em todas as interfaces IPv4 — 2026-11-01

- Instalação usa `0.0.0.0` e atualiza a configuração anterior de IP único, preservando credenciais e certificado, com restauração da configuração se a verificação falhar.
- Login e ações HTTPS aceitam o IP local efetivamente acessado, com validação de origem, Host e token CSRF.
- Novos certificados incluem os IPv4 atuais das interfaces; documentação explica atualização e limites de certificados existentes.
- Integração HTTPS verificada em dois endereços locais, incluindo login, logout e rejeição de origens externas.

## Diagnóstico após a instalação — 2026-11-01

- Diagnóstico somente leitura inclui rotas, interfaces, firewall e estado/consumo dos serviços Incus, painel, lxcfs e SSH.
- `--diagnose --boot -1` consulta os journals anteriores, identificando que o consumo e a rede observados ainda pertencem ao boot atual.
- Guia distingue perda de SSH de travamento confirmado pelo console, sem atribuir a falha à RAM ou à bridge sem evidências.

## Preparação automática de IDs — 2026-11-01

- `install.sh` e `deploy/install.py` preparam faixas ausentes de UID/GID de root antes da instalação, usando somente IDs já delegados e livres.
- A configuração é aplicada ao Incus existente quando há mudanças; instalações novas leem as faixas ao iniciar o serviço.
- Preparação idempotente, preservação de faixas existentes e retomada da aplicação ao serviço após interrupção ou falha.
- CI de instalação real passa a verificar a preparação feita pelo próprio bootstrap, sem etapa manual anterior.

## Diagnóstico do bootstrap — 2026-11-01

- Pré-verificação de RAM disponível e limites visíveis de cgroups v1/v2 antes de etapas de pacotes; swap informada separadamente.
- Logs privados incrementais de pacotes/serviços, avisos periódicos de atividade, RAM e pressão de I/O, e diagnóstico de falhas preservando o código de saída.
- Índices APT sem traduções, reutilizados enquanto os repositórios não mudam; ajustes de alocação aplicados ao bootstrap.
- Criação avalia o orçamento do sistema, preservando limites da VPS sem confundi-los com o limite de RAM do serviço do painel.
- Documentação distingue o RSS da fixture do pico da instalação completa, que permanece sem medição em TV boxes.

## Modo leve — 2026-11-01

- Modo leve padrão em todos os transportes, cache do inventário entre telas e respostas de listagem/métricas compactas.
- Tabelas paginadas em 25 linhas, inspeção JSON sob demanda, busca com debounce e histórico local de tarefas limitado.
- Progresso de criação/download suspenso fora da tela e retomado ao voltar, console adaptativo e efeitos visuais pesados desativados.
- Assets com gzip/ETag, limpeza de sessões sem thread dedicada, quatro workers e ajustes glibc para liberar buffers grandes após uso.
- Serviço com `MemoryHigh=64M` e `MemoryMax=128M`; parâmetros de autenticação preservados.
- Correção da rota inicial vazia; testes HTTP, regressões no Chromium e benchmark local reproduzível com fixture.

## Download de imagens — 2026-10-31

- Catálogo compatível com a arquitetura e botão **Baixar imagem** na tela Imagens, sem criar containers.
- Progresso do Incus, acompanhamento após navegação, erros e confirmação na lista local; operação em Tarefas.
- Download restrito a administradores com escrita e imagens remotas habilitadas; origem fixa, imagens privadas e tipo container.
- Demonstração em memória e testes de autorização, escopo, transporte e integração HTTP.

## Gerenciamento de containers — 2026-10-31

- Edição de descrição, memória, CPU, inicialização automática e proteção contra exclusão.
- Validação no servidor, revisão/ETag, edição parcial e confirmação de respostas imediatas ou assíncronas.
- Ações diretas na lista e confirmação de exclusão pelo nome; exclusão bloqueada por proteção efetiva ou container em execução.
- Menu hambúrguer em celulares e tablets, sem navegação horizontal, com fechamento por Escape/toque e controle de foco.
- Ícones SVG locais nos controles de criação, saída e gerenciamento; formulário responsivo e mensagens de resultado.
- Testes de permissões, concorrência, transporte e integração HTTP; ciclo de gerenciamento validado em Chromium com demonstração isolada.

## Integração SSH — 2026-10-26

- Transporte de leitura por conexão SSH persistente, sem persistir senha nem instalar arquivos remotos.
- Assistente descobre Projects e confirma inventário real antes de abrir o painel local em 8081.
- Identificação de SSH na interface, modo HTTP restrito a loopback e configuração local ignorada pelo Git.
- 64 testes locais passando. Acesso ao equipamento bloqueado pela rede do executor; aceite real pendente.

## 0.1.0 — 2026-10-26

- Especificação original preservada e inventário de requisitos rastreável.
- Interface em pt-BR com dashboard, explorador e consultas Incus.
- Proxy TLS com CA, hostname e fingerprint; sessões, CSRF, escopos e alvos mutáveis explícitos.
- Lifecycle, criação e exclusão protegida, snapshots/backups de criação e UUIDs.
- Console textual TLS e eventos com backoff/resync, desabilitados por padrão.
- Demonstração isolada em memória, testes de contrato, CI e scripts de instalação/publicação/coleta.
- Integração em host real, benchmark H3, QA visual em navegador e publicação GitHub ainda não confirmados.
- F3 parcial: download/restauração de backup, restauração/exclusão de snapshot, importação/removação de imagens e administração avançada permanecem pendentes.
