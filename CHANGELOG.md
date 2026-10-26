# Changelog

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
