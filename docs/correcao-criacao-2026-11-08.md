# Conclusão da criação de containers — 08/11/2026

## Sincronização

O GitHub e o checkout da TV box estavam no commit `760099c`. O serviço executava
`/opt/incus-panel/releases/20261107-qa-a408a6146d`, com correções posteriores de
autenticação e navegação. A comparação dos arquivos, normalizando apenas CRLF,
confirmou que o código executado já estava no checkout local. As diferenças
restantes eram documentação e o ajuste posterior da quota de CPU do instalador.
Esse conjunto foi preservado no commit `1d23038`.

## Falhas e correção

- Uma resposta atrasada de `/api/session` podia substituir o objeto da sessão
  depois de um login. O acompanhamento pertence à sessão que o iniciou e, nesse
  caso, parava de consultar o Incus. A restauração inicial agora é descartada
  quando já houve outra tentativa de login ou logout.
  Um HTTP 401 de uma requisição antiga também não encerra uma sessão mais nova.
- A conclusão invalidava o cache e atualizava apenas a árvore lateral. A tela
  de containers permanecia com a lista antiga. Agora o inventário e a tela são
  atualizados após o estado terminal, preservando uma navegação mais recente,
  consoles e formulários em edição.
- O título da tarefa mostra seu estado; a etapa final informa `Concluído`.
  `TASK OK` continua dependendo da confirmação do estado solicitado no Incus.

## Evidência da reprodução

Antes da correção, um Alpine descartável foi criado pelo assistente em Chromium
isolado, conectado ao HTTPS da TV box. Em aproximadamente 21 s, o Incus confirmou
`Running` e a janela mostrou `TASK OK`; o nome apareceu na árvore, mas continuou
ausente da lista aberta. O container de teste foi removido.

A regressão de sessão foi reproduzida em DOM com resposta inicial deliberadamente
atrasada. O teste falhava porque essa resposta substituía a sessão do login e
interrompia o acompanhamento. O teste dedicado também verifica a conclusão com
a janela aberta, a lista atualizada, erros, criação parada e pausa/retomada.

Esses testes DOM usam uma fixture em memória e não medem desempenho da TV box.

A suíte Python passou com 273 testes, sendo quatro ignorados por dependerem de
Linux. As revisões DOM de 40 rotas e de snapshots passaram sem erros JavaScript.
