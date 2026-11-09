# Revisão visual baseada no Proxmox

Referência: repositório oficial [`proxmox/pve-manager`](https://github.com/proxmox/pve-manager),
commit `a5355c34dea5e9b1d616788a150f08f3a520a575`, consultado em 06/11/2026,
e capturas fornecidas pelo usuário. A implementação continua usando HTML, CSS
e JavaScript locais e as operações reais do Incus.

## Correspondência das telas

| Área do Incus Panel | Referência no pve-manager | Aplicação |
| --- | --- | --- |
| Estrutura geral | `www/manager6/Workspace.js` | Cabeçalho, árvore de aproximadamente 300 px, separador de largura, área central e tarefas no rodapé |
| Navegação de todos os recursos | `www/manager6/panel/ConfigPanel.js` | Barra contextual acima das abas laterais, seleção azul e navegação horizontal em telas estreitas |
| Procurar e inventários | `www/manager6/grid/ResourceGrid.js` | Recursos listados ao abrir, filtro por tipo/texto, cabeçalhos ordenáveis e seleção de linhas |
| Sumário do datacenter | `www/manager6/dc/Summary.js` | Saúde, recursos, indicadores circulares, painéis de armazenamento e containers |
| Sumário e sistema do nó | `www/manager6/node/Summary.js` | Propriedades compactas e gráficos em painéis, com período aplicado às amostras da sessão |
| Abas do container | `www/manager6/lxc/Config.js` | Ações contextuais, sumário, console, recursos, rede, DNS, opções, tarefas, backup, snapshots e permissões |
| Rede e interfaces | `www/manager6/lxc/Network.js` | Tabela única com Adicionar/Remover/Editar no topo, clique na linha para editar, diálogo de 600 px em duas colunas e opções avançadas recolhidas |
| Armazenamento | `www/manager6/storage/Summary.js` | Capacidade, driver, utilização, conteúdo e propriedades no mesmo sistema visual |
| Login | `www/manager6/window/LoginWindow.js` | Diálogo compacto sobre a estrutura vazia do painel, campos alinhados e salvar nome de usuário |
| Criar CT | `www/manager6/window/Wizard.js` | Janela com etapas, validação sequencial, botões de avanço e confirmação |
| Tarefas e auditoria | `www/manager6/panel/StatusPanel.js` | Abas inferiores, tabela compacta, redimensionamento e visualizador com saída/status |
| Menu de contexto do container | `www/manager6/lxc/CmdMenu.js` | Cabeçalho azul, ícones, grupos e estados desabilitados; iniciar, desligar, parar imediatamente, reiniciar, clonar, criar modelo, snapshot, backup e console |
| Menu do nó e datacenter | `www/manager6/node/CmdMenu.js` e `dc/CmdMenu.js` | Criar CT, operações em massa com seleção explícita e atalhos para sumário, busca e notas; armazenamento e rede têm menus específicos |
| Usuários, permissões, projetos e perfis | Componentes compartilhados de grade e configuração | Listas, propriedades, formulários e janelas uniformes; usuários editados em diálogos |
| Notas, opções, cluster, volumes, imagens, backups e alertas | Componentes compartilhados de painéis e grades | Mesmos controles, tipografia, bordas, espaçamento, estados vazios e temas |

Dispositivos, Perfis, Projetos e Redes usam resumos de configuração nas linhas.
Selecione um recurso e use **Propriedades** na barra, dê duplo clique ou pressione
Enter na linha para abrir a janela de consulta. A janela preserva os valores
completos, sem expandir tabelas dentro das células. Em Opções, **Configuração
técnica** abre a configuração local e a efetiva na mesma janela. Operações usam
**Detalhes** para abrir o visualizador de tarefas, mantendo o progresso na grade.
Escape e Fechar encerram a consulta; mudar de recurso também fecha a janela.

`node scripts/properties-review.mjs`, com a fixture local ativa, verifica esses
fluxos, seleção após ordenação e paginação, navegação por teclado, inventário
vazio, valores completos, dispositivos de perfis e recursos de projetos.
O teste usa DOM simulado e confirma que a consulta não envia mutações; não
verifica dimensões, aparência nem o foco nativo de diálogos no navegador.

As diferenças funcionais refletem o Incus. Não há VMID, autenticação PAM,
gestão de VMs ou operações Proxmox fictícias. Contas usam o domínio local;
o painel mantém os papéis, Projects e permissões aplicados pelo backend.
O log de auditoria não é apresentado como um log de cluster.

Em **Container → Rede**, a tabela apresenta ID, nome, ponte, Firewall, VLAN,
MAC, IP, gateway, MTU e estado desconectado. O diálogo usa os controles de
IPv4/IPv6 e a disposição da referência, com Ajuda, Avançado, reset e OK.
Endereço fixo corresponde a reserva DHCP; gateway vem da ponte e Firewall
ativa filtros anti-spoofing do Incus. Os limites e o mapeamento estão em
[Bridges e interfaces](bridges.md). `scripts/network-editor-review.mjs`
valida o fluxo em fixture, permissões e 12 combinações de tema e viewport.

## Menus de contexto e operações Incus

O menu funciona na árvore e nas linhas das grades, inclusive por **Shift+F10**
ou pela tecla de menu. Setas, Home/End e letras percorrem ações habilitadas;
Escape fecha o menu e devolve o foco. O posicionamento respeita as bordas
da janela nos dois temas. O estado e as dependências são consultados novamente
ao abrir, e as permissões e o estado são revalidados pelo backend.

**Desligar** usa encerramento normal (`stop`, `force: false`, 30 segundos).
**Parar** exige confirmação digitada e envia `stop`, `force: true`.
Clonar usa a cópia local do Incus, no mesmo projeto, com snapshots opcionais;
o clone nasce parado, sem autostart e sem reutilizar campos voláteis de identidade.
Origem e destino precisam estar autorizados; clonagem e modelos exigem administrador.

**Converter em modelo** corresponde à publicação de uma imagem privada do
container parado, com alias, para uso no assistente Criar CT. O container de
origem é preservado; o painel não simula uma flag de template do Proxmox.
Referências oficiais: [criar imagens](https://linuxcontainers.org/incus/docs/main/howto/images_create/),
[API de cópia no Incus 6.0.4](https://github.com/lxc/incus/blob/v6.0.4/shared/api/instance.go)
e [ações de estado](https://github.com/lxc/incus/blob/v6.0.4/shared/api/instance_state.go).

As ações em massa atuam somente nos containers selecionados do projeto atual,
com operações individuais rastreadas em Tarefas. Suspender/retomar usa
`freeze`/`unfreeze`, sem salvar estado em disco. Não há shell do hospedeiro,
VMs, migração entre servidores ou operações de cluster fictícias.

`scripts/context-menu-review.mjs` verifica menus, teclado, dois temas,
limites de janela, permissões e os fluxos de clonagem, modelo, snapshot,
backup e operações em massa na fixture local. Os contratos do backend ficam
em `tests/test_context_actions.py`.

## Correções de responsividade

O fundo do menu era um `button`. Uma regra global de botões do tema escuro
sobrescrevia sua transparência e produzia `rgb(65, 65, 65)`, cobrindo toda a
área de trabalho. O fundo agora tem regras específicas e permanece
`rgba(0, 0, 0, 0.2)` nos dois temas. Fechar o menu ou ampliar a janela devolve
o foco e a interação ao conteúdo.

O CSS anterior tinha várias camadas de dimensões e posicionamento. Foi
substituído por uma grade única com áreas nomeadas. As grades internas usam
colunas que podem encolher, incluindo a tela de redes, onde uma coluna
implícita forçava o conteúdo para fora da área disponível. Tabelas e abas
largas têm sua própria rolagem.

Até 1100 px, a árvore abre em um menu sobreposto. Até 650 px, as abas passam
para uma faixa horizontal e os formulários ficam em uma coluna. A barra de
ações se reorganiza e o painel de tarefas tem sua altura limitada pela janela.
O console em janela separada tem uma grade própria.

## Verificação reproduzível

O teste `scripts/responsive-review.mjs` usa um Chrome isolado com CDP na porta
9223 e a fixture local `python tests/create_fixture.py`. Recusa destinos fora de
localhost e exige `session.demo`. Verifica a rota efetivamente exibida para
evitar falsos resultados por limitação de navegação rápida do Chrome.

São 40 rotas, dois temas e 18 tamanhos de janela: larguras de 320 a 1920 px,
incluindo os dois lados de 650 e 1100 px e janelas com apenas 480 px de altura.
As verificações cobrem conteúdo presente, dimensões da área principal,
transbordamento, menu aberto, retorno ao desktop e diálogos em 320 × 480 px.
As capturas e o relatório completo ficam em `artifacts/review/`, fora do Git.

A tela administrativa de usuários também recebe capturas com um dublê
explícito de consulta: a demonstração não possui contas persistentes.
Esse trecho não altera contas e não substitui os testes do backend de usuários.

O teste `scripts/browser-review.mjs` verifica navegação por hash, assistente,
ciclo de vida, edição, snapshots, backups, notas, busca e permissões usando
exclusivamente a fixture. O smoke DOM cobre também CRUD de bridge, interface
de container, login e o caso de regressão do fundo opaco do menu.

Nenhuma dessas verificações altera a instalação em produção ou um Incus real.

Resultado final de 06/11/2026: 1.440 verificações de layout aprovadas, nenhuma
exceção JavaScript, menu aberto e retorno ao desktop corretos, arraste dos dois
separadores confirmado e fechamento dos editores por Escape limpando o formulário.
O smoke DOM de 40 rotas e a revisão funcional no Chrome passaram. A suíte Python
executou 231 testes, com quatro ignorados no ambiente Windows.
