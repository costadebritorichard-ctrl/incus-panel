# Snapshots de containers

A aba usa a disposição da referência Proxmox: barra **Tirar um Snapshot / Reverter / Editar / Remover**, colunas **Nome / Data/Status / Descrição**, seleção de linha e **AGORA — Você está aqui!**. O diálogo de criação tem 450 px, nome e descrição; duplo clique ou Enter abre a edição da descrição do snapshot selecionado. A lista é cronológica, com rolagem e sem paginação. O Incus não fornece a árvore de ancestralidade do Proxmox, portanto não são inventadas relações entre snapshots.

No modo leve, a aba consulta novamente o detalhe do container e os snapshots ao abrir, inclusive depois de alterações por CLI. Cada ação consulta novamente a lista; a reversão revalida o estado. A lista antiga ficava no cache até uma atualização manual. Identificadores Incus em formato URL são normalizados sem incluir `?project=...`, inclusive na detecção de nomes duplicados.

Criar usa `POST /1.0/instances/{container}/snapshots` com `name` e `stateful: false`; reverter usa `PUT /1.0/instances/{container}` com `restore` e `stateful: false`; remover usa `DELETE /1.0/instances/{container}/snapshots/{snapshot}`. O painel acompanha a operação assíncrona e confirma a presença/ausência do snapshot antes de informar sucesso na criação/remoção. Erros de envio mantêm os campos preenchidos. Reverter exige container parado; editar, reverter e remover exigem administrador, escopo autorizado e modo de escrita. A interface usa confirmação **Sim/Não**, com **Não** selecionado inicialmente; a API continua exigindo o identificador completo de servidor/projeto/container/snapshot.

## Sequência de janelas

Ao abrir uma ação, a grade mostra **Aguarde...** enquanto consulta o Incus. O envio do formulário também mostra essa máscara e bloqueia envios repetidos. A criação fecha o formulário após a aceitação e abre diretamente **Task viewer: CT … - Snapshot**, com 800 × 500 px, abas **Saída/Status**, botão **Download** e resultado `TASK OK` ou `TASK ERROR`.

Remover e reverter abrem primeiro a confirmação compacta **Sim/Não**. Depois da aceitação pelo Incus, uma janela de 300 px mostra a tarefa em execução e o botão **Detalhes**, que abre o mesmo visualizador. A janela pequena fecha após a confirmação de sucesso; falhas abrem o visualizador e conservam o erro. A criação mantém o visualizador aberto ao terminar, como na referência Proxmox.

O visualizador acompanha a mesma operação Incus até a conclusão, inclusive após os primeiros 30 segundos. Fechar a janela não cancela a tarefa; ela pode ser reaberta pelo rodapé, com a saída coletada nesta sessão. A consulta pausa fora da tela correspondente, quando o navegador fica oculto ou quando o escopo muda, e retoma ao voltar. Uma falha de conexão permite consultar novamente a operação sem repetir a criação ou remoção.

O percentual só aparece quando informado nos metadados de progresso do Incus. Sem percentual, a barra é indeterminada. A saída registra a aceitação, os estados e metadados observados e o resultado confirmado; não inventa mensagens LVM, etapas internas ou logs de shell que o Incus não fornece. **Parar** fica desabilitado porque o painel não oferece interrupção dessas operações. Logs de tarefas permanecem temporários; as descrições dos snapshots continuam persistentes.

A [API do Incus 6.0.4](https://github.com/lxc/incus/blob/v6.0.4/shared/api/instance_snapshot.go) não oferece descrição editável de snapshots. Por isso, descrições ficam em `snapshots.json`, junto ao arquivo de usuários do painel (normalmente `/var/lib/incus-panel/snapshots.json`). O arquivo usa substituição atômica e modo 0600. Faça backup dele junto com as contas. Sem caminho persistente, como na demonstração, as descrições ficam em memória.

As anotações são isoladas por servidor/projeto/container/nome e vinculadas à data de criação. A edição usa revisão para rejeitar alterações concorrentes. Operações pendentes também são salvas e reconciliadas ao consultar a tarefa ou reabrir a aba. Operações expiradas sem resultado confirmado não geram anotações de sucesso. Configuração e dispositivos salvos no snapshot não são enviados à lista do navegador. Snapshots e seus dados continuam pertencendo ao Incus; remover o painel não os remove.

## Validação

```text
python -m unittest discover -s tests -p test_snapshots.py -v
python tests/create_fixture.py
# Em outro terminal, com a fixture nova:
node scripts/snapshot-review.mjs
node scripts/snapshot-workflow-review.mjs
```

O primeiro ensaio DOM cobre seleção, linha AGORA, criação, descrição, edição, reversão, remoção, permissões, duplicação de envio, conflito de nome, container em execução e erro do servidor preservando o formulário. O segundo exercita loading com envio retido, operação longa, confirmação Sim/Não, progresso, Detalhes, abas, download, reabertura, reconexão sem reenvio, falha assíncrona e pausa/retomada das consultas. Os ensaios geram documentos HTML estáticos em `artifacts/snapshots/` e `artifacts/snapshot-workflow/`, com o CSS real e dois temas; esses documentos não se conectam ao Incus. Use uma fixture nova para cada ensaio que cria containers.

O teste real foi incluído em `.github/workflows/incus-real.yml`. Pode ser executado em Linux com o código atualizado e a configuração autorizada:

```bash
sudo python3 -m incus_panel.verify --config /etc/incus-panel/config.local.json --snapshots
```

Esse comando cria um Alpine descartável com nome `panel-check-*`, grava um arquivo, cria e edita um snapshot, altera o arquivo, para e reverte o container, confirma o conteúdo anterior, remove o snapshot e exclui o container. Em caso de falha, preserva o recurso para diagnóstico e imprime seu nome. Em 07/11/2026, esse ciclo foi aprovado na CI Linux e no backend da TV Box ARMv7, usando uma imagem do cache e um container descartável; o container existente permaneceu em execução. A validação do backend não substitui a revisão visual das janelas.

Referência visual: [Snapshot.js](https://github.com/proxmox/pve-manager/blob/master/www/manager6/window/Snapshot.js), [SnapshotTree.js](https://github.com/proxmox/pve-manager/blob/master/www/manager6/tree/SnapshotTree.js), [TaskViewer.js e TaskProgress](https://github.com/proxmox/proxmox-widget-toolkit/blob/master/src/window/TaskViewer.js) e imagens fornecidas pelo usuário.
