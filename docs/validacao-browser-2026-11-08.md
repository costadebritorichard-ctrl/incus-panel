# Validação pelo navegador do VS Code — 08/11/2026

## Conclusão desta execução

A versão instalada **não pode ser declarada integralmente aprovada**. Foi
reproduzida uma falha de acompanhamento do desligamento: o container parou,
mas a consulta da operação retornou `Incus: Operation not found` e a tarefa
permaneceu como em execução. Há uma correção local com regressões aprovadas;
ela ainda não foi instalada nem validada novamente na TV box.

Este relatório distingue testes no equipamento, consultas HTTPS sem sessão,
testes locais com dublês e evidências históricas. Os resultados de
[07/11](validacao-tvbox-2026-11-07.md) continuam sendo históricos e não foram
reclassificados como testes executados hoje.

## Ambiente e escopo

- Navegador integrado do VS Code, sessão administrativa já autenticada em
  `https://incuspanel.palerma.dpdns.org`.
- Interface identifica nó `suricata`, host `tvbox`, projeto `default`, Incus
  6.0.4, ARMv7 (`armv7l`), transporte por socket local e servidor standalone.
  O processo e a unidade systemd não foram reinspecionados por SSH hoje.
- Inventário inicial: `teste01`, `teste02` e `teste03`, todos em execução.
  Nenhuma operação de alteração foi direcionada a esses containers.
- Recursos criados para o ensaio: CT `qa-browser-1108`, snapshot `baseline`,
  bridge `qa-br1108` e NIC adicional `eth1` no CT de teste.
- Pool existente `panel-dir`, driver `dir`. Nenhum pool foi migrado ou criado.
- Base local: commit `546a9c4`, com as alterações desta validação ainda sem commit.
- A conexão de automação do Browser informou host indisponível. A interface foi
  operada pelo controle do computador na janela do VS Code, com conferência
  visual e pela árvore de acessibilidade.
- Horários desta execução são os mostrados pelo painel em UTC−03:00. O relatório
  usa a data local do usuário, 08/11/2026.

## Critérios de `refatorar.md`

| Requisito / teste | Resultado esperado | Resultado observado / evidência | Estado |
| --- | --- | --- | --- |
| Autenticação existente | Sessão permite consultas autorizadas | Sessão administrativa usada para inventário, criação e operações reais | Aprovado para a sessão existente |
| Login correto / incorreto | Aceitar ou negar as credenciais adequadamente | Testes HTTP e DOM locais aprovados; nenhum novo login real foi executado | Pendente no equipamento nesta execução |
| Logout e expiração | Revogar a sessão e exigir autenticação | Suíte local cobre logout, expiração e fechamento de consoles; a sessão real foi preservada | Pendente no equipamento nesta execução |
| API sem sessão | Recusar dados administrativos | `/api/session` e `/api/read?...resource=instances` retornaram HTTP 401 | Aprovado no domínio real |
| Segredos e arquivos privados | Não expor configuração, chave ou repositório | `/config.local.json`, `/server.key` e `/.git/config` retornaram HTTP 404; allowlist e sessão pública também cobertas pela suíte | Aprovado nos casos ensaiados |
| Inventário | Atualizar após criação e coincidir com Incus | Inventário passou de três para quatro CTs; nome apareceu na árvore e no sumário sem F5. Não houve nova comparação com `incus list` por SSH | Aprovado na UI; comparação CLI pendente |
| Assistente de criação | Validar etapas e criar CT real | Oito etapas percorridas; nome obrigatório e etapas futuras bloqueadas. Alpine 3.21 armhf local, 128 MiB, um núcleo/50%, autostart desligado, `panel-dir`, `panelbr0` e DHCP | Aprovado no navegador |
| Conclusão da criação | Aguardar confirmação e atualizar interface | Criação às 21:02:19, tarefa concluída, `TASK OK`, CT `Running` com IP `10.167.175.94/24` | Aprovado no navegador |
| Iniciar | Confirmar estado em execução | Operação de 21:11:37 concluída; console voltou a conectar | Aprovado no navegador; CLI pendente |
| Reiniciar | Confirmar operação e reabrir console | Operação de 21:07:26 concluída; mensagem de reinício e novo shell conectado | Aprovado no navegador; CLI pendente |
| Desligar / histórico | Encerrar CT e concluir corretamente a tarefa | Operação de 21:08:11 retornou `Operation not found`; Atualizar mostrou `Parado`, mas tarefa continuou em execução | Reprovado na versão instalada; corrigido localmente |
| Console | Executar entrada e saída interativas | `hostname` retornou `qa-browser-1108`; `stty size` retornou `35 80`; Ctrl+C interrompeu `sleep 60` e devolveu o prompt; reconexões funcionaram | Aprovado no navegador |
| Console parado | Impedir abertura de shell | Após atualizar o CT parado, controles de conexão ficaram desabilitados e a tela pediu iniciar o container | Aprovado no navegador |
| Snapshot criar e listar | Criar uma única recuperação e atualizar grade | `baseline`, 21:05:54; UUID `91062dc5-aeef-4d2c-b8e3-869065101a31`; `Running` → `Success` → `TASK OK`; grade atualizada | Aprovado no navegador; CLI pendente |
| Snapshot duplicado | Recusar nome existente com mensagem compreensível | Nova tentativa de `baseline`: “Já existe um snapshot chamado baseline. Escolha outro nome.”; original preservado | Aprovado no navegador |
| Clique repetido | Evitar pedidos duplicados | Confirmação com clique duplo produziu uma linha e uma tarefa de criação; envio único também confirmado pelo teste DOM | Aprovado com essas evidências |
| Snapshot restaurar | Recuperar dados somente em CT descartável | Arquivo `marker` gravado com `before`, snapshot criado, arquivo alterado para `after`; restauração de 21:10:51 concluída e `cat marker` voltou a retornar `before` após iniciar | Aprovado no navegador; CLI pendente |
| Snapshot excluir | Remover recuperação e confirmar ausência | Exclusão real ainda não executada; contratos e fluxo DOM de remoção aprovados | Pendente de confirmação para exclusão pela UI |
| Erro original e operação assíncrona | Preservar diagnóstico e não confundir aceite com sucesso | Snapshot exibiu UUID e resultado real; falha de desligamento reproduzida. Regressão nova confirma resultado incerto, erro preservado e ausência de reenvio | Correção local aprovada; revalidação remota pendente |
| Bridge listar / consultar | Distinguir redes gerenciadas e externas | `panelbr0` e `qa-br1108` gerenciadas; `lo` e `end0` externas; propriedades e leases exibidos | Aprovado no navegador |
| Bridge criar | Criar rede privada gerenciada | `qa-br1108`, `Created`, IPv4 automático resolvido como `10.7.242.1/24`, DHCP/NAT IPv4 ativos e IPv6 `none` | Aprovado no navegador; CLI pendente |
| Bridge editar | Persistir parâmetro suportado | MTU alterado para 1400; mensagem de confirmação e propriedade `bridge.mtu=1400` na consulta seguinte | Aprovado no navegador; CLI pendente |
| Associar bridge ao CT | Gravar NIC no container descartável | `eth1` adicionada a `qa-browser-1108`; grade mostra ponte `qa-br1108`, MAC e gateway `10.7.242.1` | Aprovado no navegador; CLI pendente |
| Bridge em uso | Impedir remoção com dependências | “Excluir bridge” desabilitado; dependência `/1.0/instances/qa-browser-1108` identificada | Aprovado na UI; recusa HTTP coberta por contratos locais |
| Interface física | Evitar alteração do gerenciamento do host | Tela de `end0` não oferece edição/exclusão; transporte e autorização também cobertos pelos testes | Aprovado nos casos ensaiados |
| Bridge excluir | Remover somente depois das dependências | Exclusão real não executada; CRUD e dependências cobertos por testes locais/DOM | Pendente de confirmação para exclusão pela UI |
| Disco no `dir` | Adaptar o formulário e explicar limitação do assistente | Campo de tamanho desabilitado e indicação de capacidade do pool nas etapas Disco e Confirmar | Aprovado para o pool atual |
| Disco em backend com quota | Confirmar limite efetivo no Incus | Testes locais cobrem drivers e raiz herdada. O ensaio real Btrfs de 07/11 está no relatório anterior; não foi repetido hoje | Pendente de nova execução em pool compatível |
| Métricas | Distinguir contadores acumulados de percentuais | CPU identificada em segundos acumulados, rede em bytes, RAM com limite de 128 MiB, aviso de amostras da sessão e ausência de histórico persistente | Aprovado na representação; precisão comparada por CLI pendente |
| Edição de CT | Persistir descrição preservando demais opções | Descrição em português salva e confirmada pelo Incus; memória 128 MiB, CPU 1 e autostart desligado preservados | Aprovado no navegador |
| Armazenamento | Preservar consulta | Sumário mostra `panel-dir`, driver `dir`, aproximadamente 3 GiB usados / 7 GiB totais | Aprovado na consulta do sumário |
| Usuários / permissões | Documentar modelo de autorização | Contas locais, papéis e Projects são controles do painel; identidade de serviço acessa o Incus separadamente. RBAC completo não é exigido pelo documento | Documentado; administração de contas não alterada |
| Cluster | Permanecer fora da validação atual | Interface identifica standalone; nenhuma topologia foi alterada | Fora do escopo do documento |
| Portabilidade / local de execução | Registrar arquitetura e execução do painel | Interface ARMv7/socket local e histórico de instalação na TV box; sem nova inspeção de processo/serviço | Arquitetura observada; execução do serviço a reconfirmar por SSH |
| Experimentos do TCC | Medir desempenho/consumo, cenários 1/3/5 e aplicação educacional | Há ensaios históricos de 07/11. Nenhum novo benchmark controlado ou avaliação educacional foi executado nesta sessão | Pendente para a versão candidata corrigida |

## Diagnóstico e correção local

O acompanhamento comum esperava cinco segundos entre consultas no modo leve.
O [código oficial do Incus 6.0.4](https://github.com/lxc/incus/blob/v6.0.4/internal/server/operations/operations.go#L212)
remove operações concluídas depois de cinco segundos. Esse intervalo explica
a possibilidade de perder a confirmação entre consultas; é a causa compatível
com a reprodução, sem uma nova inspeção dos logs do daemon.

A correção local:

1. Usa a espera nativa limitada do transporte Unix para ler uma operação.
2. Conserva até 100 resultados terminais observados em memória, separados por
   identidade, host e projeto; não conserva estado intermediário como conclusão.
3. Usa um segundo entre consultas ativas, inclusive snapshots e downloads.
4. Quando uma operação conhecida desaparece, invalida os dados afetados,
   registra resultado incerto com o erro original e atualiza o estado exibido.
5. Impede novo envio no mesmo diálogo após uma operação já aceita; o diálogo
   continua podendo ser fechado. Um aviso de sucesso anterior é ocultado ao
   abrir uma nova ação.

Uma operação ausente **não é considerada sucesso** pela correção. Falhas de
conexão, suspensão do navegador ou reinício do painel ainda podem impedir que
se observe o resultado terminal. A mensagem orienta conferir o estado antes
de iniciar outra operação; o cache não é um histórico persistente.

Os arquivos públicos coincidiram com os arquivos locais antes da correção.
Depois dela, o checkout local é uma versão candidata diferente da instalação.
Não houve deploy, commit nem publicação nesta sessão.

## Verificações locais

- Python: **285 testes, 281 aprovados e 4 ignorados** por dependerem de Linux.
- Cinco regressões novas verificam espera nativa, retenção de sucesso/erro,
  estado intermediário, operação ausente e isolamento por identidade/Project.
- `node --check web/app.js`: aprovado.
- `python scripts/traceability.py --check`: aprovado.
- Smoke HTTP em fixture: assets, login, nove consultas, lifecycle, UUID,
  conferência de estado e logout aprovados.
- DOM com fixture: 40 rotas, oito etapas, criação, limites, bridges/NICs,
  snapshot com envio único, cache, tarefas, autenticação e console com dublê
  aprovados sem erros JavaScript.
- Regressões de criação: conclusão com diálogo aberto, atualização de
  inventário, resposta antiga de sessão, erro, criação parada e pausa/retomada.
- Regressões de snapshot: criação, remoção, confirmação, detalhes,
  operação longa, reconexão sem reenvio, erro e pausa/retomada.
- Regressão DOM nova: uma operação de curta retenção é observada antes de
  expirar; uma operação ausente fica incerta, preserva erro, atualiza o CT e
  não envia a mutação novamente.

Esses testes com dublês não substituem a reaplicação e repetição no equipamento.
Logs locais ficam em `artifacts/browser-qa-2026-11-08/`, ignorado pelo Git.
As evidências visuais são os estados e capturas exibidos durante a navegação
desta sessão; não são apresentados como um novo conjunto de PNGs exportados.

## Pendências para fechar o aceite

1. Aplicar a correção à instalação e repetir desligamento, tarefas e snapshots.
   O acesso SSH por chave foi solicitado, mas não está disponível nesta sessão.
2. Comparar inventário, snapshots, NIC e bridge diretamente pela CLI do Incus.
3. Completar os ensaios reais de login, logout, expiração, desconexão e quota.
4. Confirmar a exclusão dos recursos de teste e conferir sua ausência.
5. Congelar a versão candidata já revalidada e executar o protocolo experimental
   do TCC, medindo painel e Incus separadamente.
