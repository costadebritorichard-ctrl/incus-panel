# Revisão da interface e do escopo

Revisão de 03/11/2026. A estrutura de barra superior, árvore, navegação por recurso,
área de trabalho e painel de tarefas foi preservada.

## Revisão de 06/11/2026

O espaço de trabalho usa uma grade única para cabeçalho, árvore, navegação,
conteúdo, tarefas e rodapé. Em janelas de até 1100 px, a árvore fica em um menu
sobreposto; até 650 px, a navegação vira uma faixa horizontal. O conteúdo tem
rolagem própria, as colunas dos formulários se reduzem e a altura das tarefas é
limitada pela janela. A janela separada de console ocupa sua própria grade.

O login segue o diálogo compacto da referência Proxmox, com estrutura vazia do
painel ao fundo, campos alinhados, domínio local, idioma português e opção de
salvar apenas o nome do usuário. Login inválido, indisponibilidade de conexão e
expiração de sessão exibem mensagens. Não foi adicionado um provedor Linux PAM;
as credenciais continuam sendo as contas locais do Incus Panel.

A gestão de bridges inclui CRUD, endereçamento, DHCP, NAT, DNS, MTU, roteamento,
firewall e associação de interfaces aos containers. Consulte [bridges](bridges.md)
para permissões, configuração e limites.

Validação local: 231 testes de Python (4 ignorados), sintaxe JavaScript,
rastreabilidade e smoke DOM com 20 rotas, login, menu móvel, CRUD de bridge,
dependências e interfaces. A verificação visual não foi concluída: a ferramenta
de controle do navegador foi interrompida porque não conseguiu identificar com
segurança a URL do Chrome. Não houve novo teste em Incus real nesta revisão.

## Correções

- **Criar CT** abre um diálogo sobre a tela atual, preservando rota e formulários.
  O assistente aparece pronto, sem tela intermediária de loading.
  Links antigos para `#create` continuam abrindo o assistente.
- Etapas sequenciais: nome e template obrigatórios, nomes duplicados/restritos,
  limites inteiros de CPU/RAM/disco e IPv4 válido na sub-rede da bridge.
  Voltar permite editar; invalidar uma etapa bloqueia novamente as seguintes.
  O backend continua validando as solicitações. A disponibilidade final do nome,
  endereço, imagem e recursos é decidida pelo Incus.
- Criação administrativa permite iniciar ou manter parado. O fluxo restrito usa
  o perfil default e mantém o container parado, como a API de criação restrita.
- Desde 04/11, a criação é acompanhada diretamente pela aba **Saída** do
  visualizador de tarefas: fundo preto, mensagens do processo, `TASK OK` ou
  `TASK ERROR`. A aba **Status** mantém os detalhes e o log pode ser baixado após
  o término. Não há cartão de progresso nem barra percentual na criação.
  A consulta periódica para ao fechar a janela; a operação continua no servidor.
- Rede consulta dispositivos completos para listar containers associados e usa
  `address` do contrato Incus para exibir leases DHCP.
- VMs são excluídas do inventário de containers e bloqueadas no detalhe. As ações
  do backend já recusavam VMs.
- Temas claro/escuro, botões, ícones vetoriais locais, contraste, foco e campos
  inválidos foram harmonizados. Corrigidas regras que deslocavam a área principal
  em tablet/celular e o fundo escuro do indicador no tema claro.
- Corrigidos rótulo do modo administrativo, busca por estado em português,
  paginação dos detalhes das tarefas, preservação de horário local das tarefas e
  erros de armazenamento local do navegador. Backups globais são consultados em
  lotes de duas requisições para respeitar os limites do servidor leve.

## Telas e limites reais

| Área | Suportado | Limite apresentado pela interface |
| --- | --- | --- |
| Datacenter/nó | Sumário, busca, notas, sistema, tarefas | Notas locais ao navegador; amostras de métricas apenas na sessão |
| Containers | Criar, iniciar, parar, reiniciar, excluir, editar limites e descrição | Containers Incus; sem VMs, HA Proxmox, VMID, senha root ou parâmetros sem suporte |
| Console | xterm.js e shell autenticado pelo painel | Exige Incus real, container em execução e permissão; indisponível na demonstração |
| Rede/DNS | CRUD de bridges gerenciadas, interfaces, propriedades, leases e associações | Gestão exige administrador e `manage_networks`; interfaces físicas são consultivas; não edita o convidado |
| Armazenamento/volumes | Pools, capacidade, conteúdo e alertas | Consulta; cota de criação apenas nos drivers aceitos pelo backend; `dir` usa o pool |
| Templates | Imagens locais e download do catálogo compatível | Sem importação de arquivo, imagens de VM ou exclusão de imagens |
| Snapshots | Criar, restaurar e excluir | Restaurar exige container parado e confirmação |
| Backups | Criar, listar e excluir | Sem exportação/importação ou política central de retenção |
| Perfis/projetos | Consulta dos recursos/escopos autorizados | Sem edição pelo painel |
| Cluster | Consulta do vínculo do nó | Sem membros, quorum, HA ou administração de topologia |
| Permissões/usuários | Papéis, Projects e métricas; contas locais persistentes | Sem ACL independente por container; gestão de contas desabilitada na demonstração |
| Tarefas/auditoria/alertas | Operações, progresso, erro e alertas de capacidade | Histórico temporário; sem cancelamento de operações ou alertas persistentes |

## Validação reproduzível

```bash
python3 -m unittest discover -s tests -q
node --check web/app.js
python3 scripts/traceability.py --check
```

Para o navegador, iniciar uma fixture **nova** com `python3 tests/create_fixture.py`
e Chrome isolado com CDP na porta 9223. Executar `node scripts/browser-review.mjs`.
O teste usa somente dados simulados e exige `session.demo`. Cobre 40 rotas,
abertura/fechamento do modal sobre cada rota, larguras 1440/1024/768/390, dois temas,
validação por etapa, criação iniciada/parada, erro assíncrono, permissões,
ciclo de vida, edição, snapshots, backups, notas e busca.
Capturas são gravadas em `artifacts/review/` (não versionadas).
`scripts/browser-create-smoke.mjs` também executa esta revisão.

O teste DOM continua disponível: instalar jsdom em `artifacts/qa`, iniciar outra
fixture nova e executar `node scripts/dom-smoke.mjs`. Inclui dublês explícitos do
terminal para teclado, ANSI, resize e encerramento durante a navegação.

Estes ensaios não comprovam download remoto, shell real, armazenamento físico,
containers reais ou desempenho em TV box. Esses aceites dependem de execução
no host Incus. Gestão de usuários é coberta pelos testes HTTP/backend; a fixture
de navegador verifica o estado indisponível desse recurso na demonstração.

Referências consultadas: [assistente oficial do Proxmox](https://github.com/proxmox/pve-manager/blob/master/www/manager6/lxc/CreateWizard.js)
e [visualizador oficial de tarefas](https://github.com/proxmox/proxmox-widget-toolkit/blob/master/src/window/TaskViewer.js)
e [contrato NetworkLease do Incus](https://pkg.go.dev/github.com/lxc/incus/v6/shared/api#NetworkLease).
Usados como referência de comportamento e contrato; nenhum código do Proxmox foi incorporado.
