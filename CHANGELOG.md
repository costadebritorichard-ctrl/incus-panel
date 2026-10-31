# Changelog

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
