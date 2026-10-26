# Relatório por lote — 0.1.0

Este artefato é uma implementação experimental, não a conclusão de todos os critérios da especificação. Não foi acessado hardware Incus real nem foram alterados workloads de produção.

## LOTE-00 / F0

WBS-01/02: documentação original preservada; inventário com hash de todos os arquivos, decisões arquiteturais, fronteiras de segurança, licença MIT, fixture isolada e protocolo experimental. Leitura das fontes oficiais REST/exec/eventos conferida; o OpenAPI exato do Incus 6.0.4 e a comparação A/B direto versus proxy não foram validados. CPU/RSS não medidos no H3.

## LOTE-01 / F1

WBS-03 e telas TEL-01–07/21: navegação, login e sessão, dashboard, árvore do escopo, seleção de host/Project, tabela filtrável, detalhe e recursos. API remota de leitura e fixture separadas. F1 bloqueia mutações no backend. Métricas ausentes não viram zero. Onboarding de confiança usa configuração administrativa fora de banda; não há wizard de enrollment. Visão global completa da árvore e seleção múltipla não implementadas. Aceite do dashboard no H3 permanece aberto.

## LOTE-02 / F2

TEL-05/06/10/19/22: Start/Stop/Restart com allowlist e confirmação; UUID e estado terminal; console textual, limite de canais, expiração, encerramento por logout e abandono; lifecycle/operation via WebSocket TLS com backoff e resync. Os testes cobrem protocolo, isolamento e ciclos de sessão com dublês; não comprovam que `/bin/sh` abriu no Incus 6.0.4. Console não suporta VT completo e o redimensionamento é exposto na API, sem ajuste automático da UI. Eventos e console são opt-in, desligados no exemplo. A auditoria é temporária.

## LOTE-03 / F3

TEL-08/09/11–18/20: devices com origem, configurações redigidas, leitura de imagens/profiles/redes/Projects/pools; criação por imagem compatível e profile; criação/listagem de snapshot/backup; exclusão de container com proteções; alertas de storage. Perfil selecionado fornece rede/pool/limites; não há formulário avançado de devices. Download/restauração de backup, restauração/exclusão de snapshot, importação/remoção de imagens e UI de volumes/leases permanecem pendentes. Pools, redes e profiles não são alterados. Não há limpeza de armazenamento.

## LOTE-04 / F4

WBS-05/06/07: 54 testes locais de contrato/HTTP/WebSocket, verificação sintática JavaScript, smoke HTTP real sobre fixture, workflow CI, manuais, exemplos de serviço/proxy, script de coleta Linux e protocolo EXP-01–08. CI remota não executada. ARMv7/ARM64/Linux, consumo H3, acessibilidade por usuário e usabilidade não medidos. O Edge headless falhou na inicialização de GPU sob este executor; QA visual não foi concluída. Não há gráficos ou conclusões acadêmicas inventadas.

## LOTE-05 / F5

Há seleção de hosts configurados e escopos/papéis no servidor. Gestão de cluster, editor de usuários, OIDC/OpenFGA, migração e alterações administrativas globais permanecem fora desta versão. Host standalone não recebe membros fictícios.

## Segurança e limites comuns

CA/hostname/fingerprint obrigatórios, URLs fixas, nenhuma credencial Incus em assets, redaction recursiva, CSRF/Origin e cookie HttpOnly, hash scrypt, escopos backend e lista de containers mutáveis. Testes exercitam tentativas de atravessar Projects, operar produção, invocar console como observador, usar alvo incorreto e apagar container protegido. O serviço mantém uma identidade TLS por host; use isolamento de serviço/certificado para políticas mais fortes. Requer rede privada e proxy reverso com limites; não foi auditado como serviço público multi-tenant.

## Versionamento e remoto

Commits incrementais reais foram gravados em `.git-local` porque o executor bloqueia escrita em `.git`. Um bundle exporta o histórico completo. O usuário confirmou autenticação GitHub no seu terminal, mas a sessão continuou recebendo bloqueio de socket ao acessar `api.github.com`. Repositório remoto e push não foram confirmados. `scripts/publish.ps1` importa o histórico para o Git normal, cria repositório privado e faz push no terminal autenticado do usuário, sem force.
