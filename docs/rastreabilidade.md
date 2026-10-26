# Matriz de rastreabilidade

Gerada por `python scripts/traceability.py`. Implementação local não significa aceite em host real. Todos os gates de hardware e experimento permanecem abertos.

## Documentos lidos

| Arquivo | SHA-256 |
| --- | --- |
| 00_manifesto_e_escopo.json | `f243735bad49c32d0f11e3a24389c6c32cdbf200a1701aa601ddfc762e2c30e5` |
| 01_telas_e_submodulos.json | `3cd9cb60a3ca8b0f38f0a007e0c8f8466f3190e169465da42577ef631e3b99c4` |
| 02_wbs_hierarquica.json | `ffd3dc68993838d86d972a31fc660a52955df7477e84f1fad1c73093c6821d75` |
| 03_requisitos_e_qualidade.json | `4513603b835fbe2b55289b480c086d2216b8b85b5fd4e91bd131bc51886c10db` |
| 04_modelo_de_dados_e_api.json | `a62a0b4121ebd5eebcc423ebefcd10f67f36a2f2770a480dcd5f4ce155eb2801` |
| 05_seguranca_e_riscos.json | `2322bd668c08cd938f075e97b4ec1865c0ed60470080cd4bac7579bcfa0d303f` |
| 06_testes_e_experimentos.json | `23d532ccb951be1889eb79c4a077ff8fcdcc5ab17b68b9777c038b2d6e6afc8e` |
| 07_plano_entrega_para_ia.json | `a22c683503e391bd7340d39ea116ac47c792d45eebf3ccb08e3d941b78430b63` |
| 08_fontes_e_rastreabilidade.json | `b5c40cff16596e6db8ce30a3a58cefdf6719ba633ecbf496f68b36518852e939` |

## Requisitos funcionais

| ID / fase | Requisito | Evidência e limite |
| --- | --- | --- |
| RF-001 / F1 | Consultar identidade e versao do host sem modificar seus dados | Transportes e /1.0 implementados; H3 real não acessado. |
| RF-002 / F1 | Detectar capacidades por extensoes e contexto do host | Arquitetura/extensões consultadas; VM nunca habilitada neste MVP. |
| RF-003 / F1 | Listar instancias por servidor e Project | Listagem por host/Project com fixture explícita e transporte real. |
| RF-004 / F1 | Oferecer navegacao por host e por Project | Árvore do escopo atual; agrupamento global completo pendente. |
| RF-005 / F1 | Exibir estado detalhado de instancia | Instance state e detalhe; tests/test_core.py. |
| RF-006 / F1 | Exibir metricas validas com timestamp | Fonte/timestamp e n/d; sem CPU percentual e histórico. |
| RF-007 / F1 | Exigir conexao/autenticacao validas em todos os dados privados | Sessão e política backend; TLS e pin; testes HTTP e transporte mockado. |
| RF-008 / F2 | Acompanhar UUID e estado de operacoes assincronas | UUID validado e acompanhamento terminal; teste de resultado incerto. |
| RF-009 / F2 | Acionar Start/Stop/Restart conforme estado e permissao | Lifecycle na allowlist e com precondições; test_state_precondition. |
| RF-010 / F2 | Atualizar a interface com lifecycle e operation events | Eventos TLS, backoff e resync; tests/test_events.py; não testado com Incus real. |
| RF-011 / F2 | Disponibilizar shell interativo autorizado em container teste | Console textual e encerramento; tests/test_console.py; não testado com Incus real. |
| RF-012 / F3 | Filtrar imagens compativeis com destino | Normalização de arquitetura e bloqueio frontend/backend. |
| RF-013 / F3 | Criar container com Project e profile selecionados | Criação container por imagem local/profile; recursos manuais adicionais pendentes. |
| RF-014 / F3 | Listar e criar snapshots controlados | Listagem/criação; restauração/exclusão pendentes. |
| RF-015 / F3 | Exibir e gerar backup autorizado | Listagem/geração; download/restauração pendentes. |
| RF-016 / F3 | Exibir uso real de pools e alertas | Pool resources e 93% por fixture; sem soma lógica Btrfs. |
| RF-017 / F3 | Inspecionar bridges e dispositivos | Redes e dispositivos consultáveis; leases/associações dedicadas pendentes. |
| RF-018 / F3 | Aplicar escopos de Project a leituras e mutacoes | Allowlist backend por usuário e contexto em todas as chamadas. |
| RF-019 / F3 | Exibir configuracao de Profiles e origem dos devices | Profiles e devices expandidos; leitura sem edição. |
| RF-020 / F4 | Executar mesma versao do painel para ARMv7, ARM64 e x86-64 | Não validado em ARMv7/ARM64/x86-64; protocolo em docs/experimentos.md. |
| RF-021 / F5 | Distinguir multiplos hosts standalone de clusters reais | Multi-host de configuração; gestão de cluster fora do MVP. |

## Telas

| Tela / WBS | Estado | Evidência e pendência |
| --- | --- | --- |
| TEL-01 / WBS-04.01 — Boas-vindas e conexao inicial | Parcial | Conexão configurada no servidor; onboarding e vínculo interativo pendentes. |
| TEL-02 / WBS-04.02 — Autenticacao e sessao | Implementado; aceite real pendente | Login, cookie, expiração, CSRF e logout; tests/test_http.py. |
| TEL-03 / WBS-04.03 — Visao geral - Datacenter | Parcial | Dashboard real/fixture, recursos disponíveis e storage; CPU percentual host ausente. |
| TEL-04 / WBS-04.04 — Explorador de recursos | Parcial | Árvore do escopo atual e seleção persistida; agrupamento global completo pendente. |
| TEL-05 / WBS-04.05 — Catalogo de instancias | Parcial | Tabela, busca, ordenação e filtro de estado; seleção múltipla não disponível. |
| TEL-06 / WBS-04.06 — Resumo da instancia | Implementado; aceite real pendente | Identidade composta, estado e ações condicionais. |
| TEL-07 / WBS-04.07 — Recursos da instancia | Parcial | RAM, CPU acumulada, rede/disco JSON; sem gráficos históricos nem taxas. |
| TEL-08 / WBS-04.08 — Rede e dispositivos da instancia | Implementado; aceite real pendente | Dispositivos expandidos e distinção local/herdado. |
| TEL-09 / WBS-04.09 — Opcoes e configuracao | Parcial | Configuração local/expandida redigida; edição não oferecida. |
| TEL-10 / WBS-04.10 — Console interativo | Parcial | Shell textual por linha, canais TLS, fechamento e resize na API; VT completo e validação Incus pendentes. |
| TEL-11 / WBS-04.11 — Snapshots | Parcial | Listar/criar snapshots; restaurar/excluir pendentes. |
| TEL-12 / WBS-04.12 — Backups | Parcial | Listar/gerar backups; download/restauração pendentes. |
| TEL-13 / WBS-04.13 — Assistente de criacao de container | Parcial | Imagem local compatível e um profile; recursos/rede/pool definidos pelo profile. |
| TEL-14 / WBS-04.14 — Imagens | Parcial | Consulta de imagens e filtro compatível no assistente; importação/remoção pendentes. |
| TEL-15 / WBS-04.15 — Storage pools e volumes | Parcial | Pools, recursos físicos e alertas 80/90%; API de volumes existe, UI pendente. |
| TEL-16 / WBS-04.16 — Redes | Parcial | Redes e detalhes JSON; leases e associações dedicadas pendentes. |
| TEL-17 / WBS-04.17 — Profiles | Parcial | Profiles e devices; edição/impacto e filtros aprofundados pendentes. |
| TEL-18 / WBS-04.18 — Projects | Parcial | Escopos autorizados e seleção; resumo nativo completo de limites pendente. |
| TEL-19 / WBS-04.19 — Tasks e operacoes | Parcial | UUIDs, estado e erro; persistência histórica e cancelamento pendentes. |
| TEL-20 / WBS-04.20 — Alertas e avisos | Parcial | Alertas de capacidade e falhas; reconhecimento e histórico persistente pendentes. |
| TEL-21 / WBS-04.21 — Servidores e detalhes do host | Parcial | Identidade, arquitetura, extensões e cluster; métricas por membro pendentes. |
| TEL-22 / WBS-04.22 — Configuracoes, preferencias e seguranca | Parcial | Sessão, segurança, auditoria temporária; limiares configuráveis pendentes. |
| TEL-23 / WBS-04.23 — Cluster e multiplos hosts | Opcional/parcial | Seleção de hosts independentes; gestão/métricas de membros de cluster pendentes. |
| TEL-24 / WBS-04.24 — Usuarios e permissoes | Opcional/pendente | Papéis/escopos em configuração; não há editor de identidades. |

## WBS completa

O inventário abaixo inclui todos os grupos, pacotes e submódulos. O estado das telas é herdado conservadoramente: um teste unitário não aprova sozinho um critério de aceite de integração.

| ID | Pacote / submódulo | Fase | Estado |
| --- | --- | --- | --- |
| WBS-01 | Governanca, pesquisa e especificacao | F0 | Parcial; ver relatório de entrega |
| WBS-01.01 | objetivo e limites | F0 | Parcial; ver relatório de entrega |
| WBS-01.02 | inventario de evidencias | F0 | Parcial; ver relatório de entrega |
| WBS-01.03 | fluxos e personas | F0 | Parcial; ver relatório de entrega |
| WBS-01.04 | revisao de referencias | F0 | Parcial; ver relatório de entrega |
| WBS-01.05 | planejamento academico | F0 | Parcial; ver relatório de entrega |
| WBS-02 | Infraestrutura e seguranca | F0 | Parcial; ver relatório de entrega |
| WBS-02.01 | baseline e ambiente de teste | F0 | Parcial; ver relatório de entrega |
| WBS-02.02 | modelo de ameaças | F0 | Parcial; ver relatório de entrega |
| WBS-02.03 | experimento direto | F0 | Parcial; ver relatório de entrega |
| WBS-02.04 | experimento proxy | F0 | Parcial; ver relatório de entrega |
| WBS-02.05 | decisao arquitetural | F0 | Parcial; ver relatório de entrega |
| WBS-02.06 | teste de credenciais e revogacao | F0 | Parcial; ver relatório de entrega |
| WBS-02.07 | isolamento de laboratorio | F0 | Parcial; ver relatório de entrega |
| WBS-03 | Camada comum e experiencia de uso | F1 | Parcial; ver relatório de entrega |
| WBS-03.01 | navegacao de aplicacao | F1 | Parcial; ver relatório de entrega |
| WBS-03.02 | componentes visuais de estado | F1 | Parcial; ver relatório de entrega |
| WBS-03.03 | formato e idioma | F1 | Parcial; ver relatório de entrega |
| WBS-03.04 | trato de erros | F1 | Parcial; ver relatório de entrega |
| WBS-03.05 | capability discovery | F1 | Parcial; ver relatório de entrega |
| WBS-03.06 | eventos e operações | F1 | Parcial; ver relatório de entrega |
| WBS-03.07 | trilhas de auditoria | F1 | Parcial; ver relatório de entrega |
| WBS-04 | Modulos de interface - telas e submodulos | F1-F5 | Parcial; ver relatório de entrega |
| WBS-04.01 | Boas-vindas e conexao inicial | F1 | Parcial |
| WBS-04.01.01 | Identificacao do servidor | F1 | Parcial |
| WBS-04.01.02 | Teste de conectividade | F1 | Parcial |
| WBS-04.01.03 | Verificacao de confianca | F1 | Parcial |
| WBS-04.01.04 | Elegibilidade da conexao | F1 | Parcial |
| WBS-04.01.05 | Selecao de escopo inicial | F1 | Parcial |
| WBS-04.02 | Autenticacao e sessao | F1 | Implementado; aceite real pendente |
| WBS-04.02.01 | Inicio de sessao | F1 | Implementado; aceite real pendente |
| WBS-04.02.02 | Indicacao de perfil | F1 | Implementado; aceite real pendente |
| WBS-04.02.03 | Expiracao e saida | F1 | Implementado; aceite real pendente |
| WBS-04.02.04 | Tratamento de falhas | F1 | Implementado; aceite real pendente |
| WBS-04.03 | Visao geral - Datacenter | F1 | Parcial |
| WBS-04.03.01 | Resumo de ambiente | F1 | Parcial |
| WBS-04.03.02 | Resumo de host | F1 | Parcial |
| WBS-04.03.03 | Cartoes de recursos | F1 | Parcial |
| WBS-04.03.04 | Lista de atividade | F1 | Parcial |
| WBS-04.03.05 | Alertas priorizados | F1 | Parcial |
| WBS-04.03.06 | Atalhos contextuais | F1 | Parcial |
| WBS-04.04 | Explorador de recursos | F1 | Parcial |
| WBS-04.04.01 | Visao por host | F1 | Parcial |
| WBS-04.04.02 | Visao por Project | F1 | Parcial |
| WBS-04.04.03 | Busca e filtros | F1 | Parcial |
| WBS-04.04.04 | Estado de cada item | F1 | Parcial |
| WBS-04.04.05 | Selecao persistente | F1 | Parcial |
| WBS-04.05 | Catalogo de instancias | F1 | Parcial |
| WBS-04.05.01 | Tabela de instancias | F1 | Parcial |
| WBS-04.05.02 | Filtros e ordenacao | F1 | Parcial |
| WBS-04.05.03 | Selecao multipla | F1 | Parcial |
| WBS-04.05.04 | Acoes permitidas | F1 | Parcial |
| WBS-04.05.05 | Acesso ao detalhe | F1 | Parcial |
| WBS-04.06 | Resumo da instancia | F1 | Implementado; aceite real pendente |
| WBS-04.06.01 | Identificacao | F1 | Implementado; aceite real pendente |
| WBS-04.06.02 | Resumo de execucao | F1 | Implementado; aceite real pendente |
| WBS-04.06.03 | Indicadores de recursos | F1 | Implementado; aceite real pendente |
| WBS-04.06.04 | Barra de acoes | F1 | Implementado; aceite real pendente |
| WBS-04.06.05 | Erros e logs resumidos | F1 | Implementado; aceite real pendente |
| WBS-04.07 | Recursos da instancia | F1 | Parcial |
| WBS-04.07.01 | CPU | F1 | Parcial |
| WBS-04.07.02 | RAM | F1 | Parcial |
| WBS-04.07.03 | Disco | F1 | Parcial |
| WBS-04.07.04 | Rede da instancia | F1 | Parcial |
| WBS-04.07.05 | Periodo e atualizacao | F1 | Parcial |
| WBS-04.08 | Rede e dispositivos da instancia | F3 | Implementado; aceite real pendente |
| WBS-04.08.01 | NICs | F3 | Implementado; aceite real pendente |
| WBS-04.08.02 | Volumes/discos | F3 | Implementado; aceite real pendente |
| WBS-04.08.03 | Proxy devices | F3 | Implementado; aceite real pendente |
| WBS-04.08.04 | Configuracao efetiva | F3 | Implementado; aceite real pendente |
| WBS-04.08.05 | Validacao de alteracoes | F3 | Implementado; aceite real pendente |
| WBS-04.09 | Opcoes e configuracao | F3 | Parcial |
| WBS-04.09.01 | Configuracao local | F3 | Parcial |
| WBS-04.09.02 | Configuracao expandida | F3 | Parcial |
| WBS-04.09.03 | Protecao contra exclusao | F3 | Parcial |
| WBS-04.09.04 | Comparacao de alteracoes | F3 | Parcial |
| WBS-04.09.05 | Controle de concorrencia | F3 | Parcial |
| WBS-04.10 | Console interativo | F2 | Parcial |
| WBS-04.10.01 | Abertura autorizada | F2 | Parcial |
| WBS-04.10.02 | Sessao interativa | F2 | Parcial |
| WBS-04.10.03 | Redimensionamento | F2 | Parcial |
| WBS-04.10.04 | Encerramento | F2 | Parcial |
| WBS-04.10.05 | Sinalizacao de risco | F2 | Parcial |
| WBS-04.11 | Snapshots | F3 | Parcial |
| WBS-04.11.01 | Lista | F3 | Parcial |
| WBS-04.11.02 | Criar snapshot | F3 | Parcial |
| WBS-04.11.03 | Restaurar snapshot | F3 | Parcial |
| WBS-04.11.04 | Excluir snapshot | F3 | Parcial |
| WBS-04.11.05 | Alertas de armazenamento | F3 | Parcial |
| WBS-04.12 | Backups | F3 | Parcial |
| WBS-04.12.01 | Inventario de backups | F3 | Parcial |
| WBS-04.12.02 | Criar backup | F3 | Parcial |
| WBS-04.12.03 | Baixar backup | F3 | Parcial |
| WBS-04.12.04 | Restauracao | F3 | Parcial |
| WBS-04.12.05 | Politica de retencao | F3 | Parcial |
| WBS-04.13 | Assistente de criacao de container | F3 | Parcial |
| WBS-04.13.01 | Escolher Project e host | F3 | Parcial |
| WBS-04.13.02 | Escolher imagem | F3 | Parcial |
| WBS-04.13.03 | Identificacao e perfis | F3 | Parcial |
| WBS-04.13.04 | Recursos e rede | F3 | Parcial |
| WBS-04.13.05 | Revisao final | F3 | Parcial |
| WBS-04.13.06 | Progresso da criacao | F3 | Parcial |
| WBS-04.14 | Imagens | F3 | Parcial |
| WBS-04.14.01 | Inventario | F3 | Parcial |
| WBS-04.14.02 | Compatibilidade | F3 | Parcial |
| WBS-04.14.03 | Uso e referencias | F3 | Parcial |
| WBS-04.14.04 | Remocao segura | F3 | Parcial |
| WBS-04.14.05 | Atualizacao/importacao | F3 | Parcial |
| WBS-04.15 | Storage pools e volumes | F3 | Parcial |
| WBS-04.15.01 | Pools | F3 | Parcial |
| WBS-04.15.02 | Detalhe do pool | F3 | Parcial |
| WBS-04.15.03 | Volumes | F3 | Parcial |
| WBS-04.15.04 | Avisos de capacidade | F3 | Parcial |
| WBS-04.15.05 | Propriedades e limites | F3 | Parcial |
| WBS-04.15.06 | Acao administrativa | F3 | Parcial |
| WBS-04.16 | Redes | F3 | Parcial |
| WBS-04.16.01 | Lista de redes | F3 | Parcial |
| WBS-04.16.02 | Detalhe da bridge | F3 | Parcial |
| WBS-04.16.03 | Leases e enderecos | F3 | Parcial |
| WBS-04.16.04 | Associacoes | F3 | Parcial |
| WBS-04.16.05 | Alteracoes | F3 | Parcial |
| WBS-04.17 | Profiles | F3 | Parcial |
| WBS-04.17.01 | Lista | F3 | Parcial |
| WBS-04.17.02 | Devices e configuracoes | F3 | Parcial |
| WBS-04.17.03 | Relacoes com instancias | F3 | Parcial |
| WBS-04.17.04 | Criacao/edicao | F3 | Parcial |
| WBS-04.17.05 | Protecao de default | F3 | Parcial |
| WBS-04.18 | Projects | F3 | Parcial |
| WBS-04.18.01 | Inventario | F3 | Parcial |
| WBS-04.18.02 | Selecao de Project | F3 | Parcial |
| WBS-04.18.03 | Resumo do Project | F3 | Parcial |
| WBS-04.18.04 | Criacao e limites | F3 | Parcial |
| WBS-04.18.05 | Modelo didatico | F3 | Parcial |
| WBS-04.19 | Tasks e operacoes | F2 | Parcial |
| WBS-04.19.01 | Fila recente | F2 | Parcial |
| WBS-04.19.02 | Status de operacao | F2 | Parcial |
| WBS-04.19.03 | Progresso | F2 | Parcial |
| WBS-04.19.04 | Filtro por instancia | F2 | Parcial |
| WBS-04.19.05 | Reconexao | F2 | Parcial |
| WBS-04.19.06 | Detalhe tecnico seguro | F2 | Parcial |
| WBS-04.20 | Alertas e avisos | F3 | Parcial |
| WBS-04.20.01 | Alerta de storage | F3 | Parcial |
| WBS-04.20.02 | Alerta de host | F3 | Parcial |
| WBS-04.20.03 | Falha de operacao | F3 | Parcial |
| WBS-04.20.04 | Reconhecimento | F3 | Parcial |
| WBS-04.20.05 | Historico leve | F3 | Parcial |
| WBS-04.21 | Servidores e detalhes do host | F1 | Parcial |
| WBS-04.21.01 | Identidade | F1 | Parcial |
| WBS-04.21.02 | Capacidades | F1 | Parcial |
| WBS-04.21.03 | Conectividade | F1 | Parcial |
| WBS-04.21.04 | Recursos fisicos | F1 | Parcial |
| WBS-04.21.05 | Cluster | F1 | Parcial |
| WBS-04.22 | Configuracoes, preferencias e seguranca | F2 | Parcial |
| WBS-04.22.01 | Preferencias | F2 | Parcial |
| WBS-04.22.02 | Conexao segura | F2 | Parcial |
| WBS-04.22.03 | Sessoes | F2 | Parcial |
| WBS-04.22.04 | Limiares de alerta | F2 | Parcial |
| WBS-04.22.05 | Auditoria de interface | F2 | Parcial |
| WBS-04.22.06 | Credenciais e revogacao | F2 | Parcial |
| WBS-04.23 | Cluster e multiplos hosts | F5 | Opcional/parcial |
| WBS-04.23.01 | Inventario multi-host | F5 | Opcional/parcial |
| WBS-04.23.02 | Membros de cluster | F5 | Opcional/parcial |
| WBS-04.23.03 | Visao de recursos | F5 | Opcional/parcial |
| WBS-04.23.04 | Disponibilidade | F5 | Opcional/parcial |
| WBS-04.23.05 | Operacoes de cluster | F5 | Opcional/parcial |
| WBS-04.24 | Usuarios e permissoes | F5 | Opcional/pendente |
| WBS-04.24.01 | Identidades | F5 | Opcional/pendente |
| WBS-04.24.02 | Papeis | F5 | Opcional/pendente |
| WBS-04.24.03 | Escopos Project | F5 | Opcional/pendente |
| WBS-04.24.04 | Revogacao | F5 | Opcional/pendente |
| WBS-05 | Qualidade, validacao e testes | F4 | Protocolo/artefatos; execução real pendente |
| WBS-05.01 | testes de contrato Incus | F4 | Protocolo/artefatos; execução real pendente |
| WBS-05.02 | testes de permissao | F4 | Protocolo/artefatos; execução real pendente |
| WBS-05.03 | testes de falha de rede | F4 | Protocolo/artefatos; execução real pendente |
| WBS-05.04 | testes de Btrfs | F4 | Protocolo/artefatos; execução real pendente |
| WBS-05.05 | testes de compatibilidade | F4 | Protocolo/artefatos; execução real pendente |
| WBS-05.06 | testes de uso | F4 | Protocolo/artefatos; execução real pendente |
| WBS-05.07 | testes de operacao destrutiva | F4 | Protocolo/artefatos; execução real pendente |
| WBS-06 | Pacote, operacao e manutencao | F4 | Protocolo/artefatos; execução real pendente |
| WBS-06.01 | instalacao e desinstalacao | F4 | Protocolo/artefatos; execução real pendente |
| WBS-06.02 | configuracao e backup de preferencias | F4 | Protocolo/artefatos; execução real pendente |
| WBS-06.03 | monitoramento de recursos | F4 | Protocolo/artefatos; execução real pendente |
| WBS-06.04 | licencas e atribuicoes | F4 | Protocolo/artefatos; execução real pendente |
| WBS-06.05 | manual do operador | F4 | Protocolo/artefatos; execução real pendente |
| WBS-06.06 | manual do administrador | F4 | Protocolo/artefatos; execução real pendente |
| WBS-07 | Experimentos e producao academica | F4 | Protocolo/artefatos; execução real pendente |
| WBS-07.01 | protocolo experimental | F4 | Protocolo/artefatos; execução real pendente |
| WBS-07.02 | baseline sem painel | F4 | Protocolo/artefatos; execução real pendente |
| WBS-07.03 | comparacao arquiteturas A/B | F4 | Protocolo/artefatos; execução real pendente |
| WBS-07.04 | comparacao eventos vs polling | F4 | Protocolo/artefatos; execução real pendente |
| WBS-07.05 | avaliacao de escala | F4 | Protocolo/artefatos; execução real pendente |
| WBS-07.06 | avaliacao de usabilidade | F4 | Protocolo/artefatos; execução real pendente |
| WBS-07.07 | redacao de resultados | F4 | Protocolo/artefatos; execução real pendente |
| WBS-07.08 | artefatos reprodutiveis | F4 | Protocolo/artefatos; execução real pendente |

## Aceite e qualidade

Os testes locais não encerram integralmente CT-001–CT-024. Consulte nomes CT nos testes para os cenários automatizados. CT-009, CT-016, CT-021 e CT-022 dependem de ensaios adicionais/funcionalidades ausentes. CT-024 não oferece botão de cancelamento nesta versão. CT-003/004/010 exigem confirmação contra falhas reais de rede/autorização.

RNF-01/02/03/05: metas em hardware não medidas. RNF-04: revisão e redaction local, sem auditoria independente. RNF-06: reconexão simulada aprovada, rede real pendente. RNF-07: CSS/labels/foco implementados; QA manual em navegador pendente. Demais RNFs mantêm validação conforme documentação original.
