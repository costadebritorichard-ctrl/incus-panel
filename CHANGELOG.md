# Changelog

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
