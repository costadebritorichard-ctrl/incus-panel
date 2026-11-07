# Snapshots de containers

A aba usa a disposição da referência Proxmox: barra **Tirar um Snapshot / Reverter / Editar / Remover**, colunas **Nome / Data/Status / Descrição**, seleção de linha e **AGORA — Você está aqui!**. O diálogo de criação tem 450 px, nome e descrição; duplo clique ou Enter abre a edição da descrição do snapshot selecionado. A lista é cronológica, com rolagem e sem paginação. O Incus não fornece a árvore de ancestralidade do Proxmox, portanto não são inventadas relações entre snapshots.

No modo leve, a aba consulta novamente o detalhe do container e os snapshots ao abrir, inclusive depois de alterações por CLI. Cada ação consulta novamente a lista; a reversão revalida o estado. A lista antiga ficava no cache até uma atualização manual. Identificadores Incus em formato URL são normalizados sem incluir `?project=...`, inclusive na detecção de nomes duplicados.

Criar usa `POST /1.0/instances/{container}/snapshots` com `name` e `stateful: false`; reverter usa `PUT /1.0/instances/{container}` com `restore` e `stateful: false`; remover usa `DELETE /1.0/instances/{container}/snapshots/{snapshot}`. O painel acompanha a operação assíncrona e confirma a presença/ausência do snapshot antes de informar sucesso na criação/remoção. Erros mantêm os campos preenchidos. Reverter exige container parado; editar, reverter e remover exigem administrador, escopo autorizado e modo de escrita. As confirmações de reversão e remoção identificam servidor, projeto, container e snapshot.

A [API do Incus 6.0.4](https://github.com/lxc/incus/blob/v6.0.4/shared/api/instance_snapshot.go) não oferece descrição editável de snapshots. Por isso, descrições ficam em `snapshots.json`, junto ao arquivo de usuários do painel (normalmente `/var/lib/incus-panel/snapshots.json`). O arquivo usa substituição atômica e modo 0600. Faça backup dele junto com as contas. Sem caminho persistente, como na demonstração, as descrições ficam em memória.

As anotações são isoladas por servidor/projeto/container/nome e vinculadas à data de criação. A edição usa revisão para rejeitar alterações concorrentes. Operações pendentes também são salvas e reconciliadas ao consultar a tarefa ou reabrir a aba. Operações expiradas sem resultado confirmado não geram anotações de sucesso. Configuração e dispositivos salvos no snapshot não são enviados à lista do navegador. Snapshots e seus dados continuam pertencendo ao Incus; remover o painel não os remove.

## Validação

```text
python -m unittest discover -s tests -p test_snapshots.py -v
python tests/create_fixture.py
# Em outro terminal, com a fixture nova:
node scripts/snapshot-review.mjs
```

O ensaio DOM cobre seleção, linha AGORA, criação, descrição, edição, reversão, remoção, permissões, duplicação de envio, conflito de nome, container em execução e erro do servidor preservando o formulário. Ele gera documentos HTML estáticos em `artifacts/snapshots/` para revisão visual com o CSS real; esses documentos não se conectam ao Incus.

O teste real foi incluído em `.github/workflows/incus-real.yml`. Pode ser executado em Linux com o código atualizado e a configuração autorizada:

```bash
sudo python3 -m incus_panel.verify --config /etc/incus-panel/config.local.json --snapshots
```

Esse comando cria um Alpine descartável com nome `panel-check-*`, grava um arquivo, cria e edita um snapshot, altera o arquivo, para e reverte o container, confirma o conteúdo anterior, remove o snapshot e exclui o container. Em caso de falha, preserva o recurso para diagnóstico e imprime seu nome. O ciclo real não foi executado na sessão de desenvolvimento Windows; os testes locais não comprovam funcionamento no hardware de destino.

Referência visual: [SnapshotTree.js do Proxmox](https://github.com/proxmox/pve-manager/blob/master/www/manager6/tree/SnapshotTree.js) e imagem fornecida pelo usuário.
