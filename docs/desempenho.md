# Desempenho em equipamentos modestos

As medições abaixo se referem ao processo do painel com uma fixture. **Não
medem o pico da instalação completa, o daemon Incus ou aplicações reais.** O
congelamento de uma VM durante APT/DPKG precisa de diagnóstico próprio; os
resultados de RSS abaixo não comprovam instalação em 512 MB, 1 GB ou 2 GB.

O modo leve é padrão. O inventário fica em memória no navegador e é reutilizado
entre telas. Atualizar, mudança de escopo e ações pelo painel invalidam esse cache.
Mudanças feitas por outro cliente Incus exigem o botão Atualizar. Pools são
consultados em Armazenamento/Alertas; a visão geral não varre todos os pools.

Na navegação do modo leve, o painel mantém até 128 respostas de leitura em um
cache LRU por sessão e escopo. Ele inclui inventário, detalhes já consultados,
redes, perfis, imagens e pools; progresso de operações assíncronas não é
armazenado. Ao trocar de rota dentro do mesmo host/Project, a tela anterior
permanece visível enquanto a próxima é montada. O botão Atualizar e qualquer
ação invalidam o cache. Essa alteração evita novas consultas Incus para dados
já lidos ao alternar entre telas; não é uma medição de latência na TV Box.

Listagens enviam somente os campos necessários, com configurações completas
disponíveis no detalhe. Tabelas criam até 25 linhas por página e o explorador
mostra até 25 containers. A busca considera todos os itens do inventário.
Configurações JSON nas listas são formatadas somente quando abertas.

Criação e download continuam no Incus ao sair da tela ou ocultar a aba; a consulta
de progresso pausa e retoma ao voltar à tela ou à aba. O console usa uma conexão
WebSocket contínua para teclado, redimensionamento e saída. Quando a conexão é
bloqueada pelo proxy, mantém compatibilidade HTTP com consultas a cada 100–400 ms
e 2 segundos na aba oculta. Sombras, desfoques, transições e rotação
contínua do indicador de carregamento são desativados.

Toda a entrada acontece diretamente no terminal, sem uma barra de comando
separada, preservando Tab, Ctrl+C, senhas e programas de tela cheia.
O caminho contínuo elimina as
requisições HTTP por lote de teclado e as consultas periódicas de saída.

A saída tem controle de fluxo: no máximo quatro blocos aguardam a confirmação
de processamento pelo xterm, e o buffer do PTY tem 65.536 caracteres. O produtor
aguarda espaço em vez de descartar saída antiga. A conexão revalida sessão e
permissões, verifica Origin/CSRF, responde a ping/pong e não ocupa os slots
reservados para outras requisições HTTP. Referências: [fluxo do xterm.js](https://xtermjs.org/docs/guides/flowcontrol/)
e [RFC 6455](https://www.rfc-editor.org/rfc/rfc6455.html).

`python tests/console_fixture.py` e `node scripts/console-review.mjs` verificam
o transporte real do painel com um PTY de eco explícito, sem executar comandos.
Cobrem teclado direto no terminal, Unicode, seis layouts e
fallback HTTP. A latência dessa fixture local não representa a rede ou o Incus
da TV box. Os contratos de frames, autorização, sessão, fluxo e concorrência
ficam em `tests/test_console_stream.py`.

O servidor comprime os três arquivos públicos uma vez no início do processo e
usa ETag para responder 304 sem reenviar o conteúdo. A API autenticada continua
com `no-store`, sem compressão. A limpeza de sessões usa o loop do servidor,
sem uma thread separada, e o modo leve admite quatro requisições simultâneas.

## Memória do serviço

O serviço instalado configura `MALLOC_ARENA_MAX=2` e
`MALLOC_MMAP_THRESHOLD_=131072`. Na glibc, o limiar fixo evita reter no heap
grandes buffers temporários após liberação, incluindo o usado pelo scrypt.
Os parâmetros de segurança do hash não mudaram. O mecanismo está descrito no
[manual de alocação da glibc](https://sourceware.org/glibc/manual/latest/html_node/Memory-Allocation-Tunables.html).

Essas variáveis são lidas no início do processo. Reexecute `sudo sh install.sh`
para aplicar o código e o serviço à instalação existente, preservando sua
configuração. Os ajustes do alocador não são aplicados a um Python iniciado
manualmente fora do serviço. O limite de memória do painel é `MemoryHigh=64M` e
`MemoryMax=128M`; o daemon Incus e os containers têm consumo separado.

## Comparação local de 2026-11-01

Comparação entre o commit `4dea88f` e a implementação otimizada, no mesmo Linux
x86-64, Python 3.12 e glibc 2.39. Foram cinco processos novos por condição, cada
um com 200 containers **simulados**, login scrypt, leitura dos três assets,
revalidação HTTP e consulta dos inventários completo/compacto. Cada processo
foi observado por dois segundos ociosos após as consultas. As variáveis do
alocador vieram do arquivo de serviço da respectiva versão; não foram aplicados
cgroups, quota de CPU ou limites de RAM durante esse ensaio.

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Corpo dos três assets no primeiro carregamento | 83,8 KiB | 26,2 KiB |
| Corpo dos assets na revalidação | 83,8 KiB | 0 KiB |
| Corpo da resposta usada na listagem de 200 itens | 81,1 KiB | 28,2 KiB |
| RSS mediano do processo após as consultas | 39,0 MiB | 24,5 MiB |

O tráfego inicial caiu aproximadamente 69%, a listagem 65% e o RSS mediano 37%
nessa fixture. Os bytes HTTP acima incluem somente o corpo, sem cabeçalhos/TLS.
A janela ociosa registrou 0–0,01 s de CPU antes e 0 s depois; ela é curta e a
resolução do contador não permite concluir uma redução percentual de CPU.

Os ensaios não executaram containers, daemon Incus, extração de imagens nem
carga de aplicações. Não são medições ARM/TV box, de pico de memória ou de host
completo, e não substituem o [protocolo de hardware](experimentos.md).

Os resultados brutos desta execução estão em `artifacts/performance-before-1.json`
a `performance-before-5.json`, `performance-after-1.json` a
`performance-after-5.json` e `performance-comparison.json` (ignorados pelo Git).

Para repetir uma execução:

```bash
python3 scripts/benchmark.py --instances 200 --output artifacts/performance.json
```

Para medir outro checkout com a mesma fixture e o mesmo script:

```bash
python3 scripts/benchmark.py --root /caminho/da/versao/anterior --instances 200
```

Para verificar a interface com a fixture de 200 itens, inicie um Chromium de
teste com CDP em 9222 e execute em terminais separados:

```bash
python3 scripts/benchmark.py --serve --port 8083
node scripts/browser-performance-smoke.mjs
```

O teste verificou zero consultas extras de identidade/inventário ao navegar por
cinco telas, paginação, busca, cache invalidado por Atualizar e ações, isolamento
entre projetos, detalhes sob demanda e ausência de polling fora da tela.
Os smokes de navegação geral e de criação verificaram 19 rotas, viewports desktop
e móvel, progresso, retomada e erro assíncrono, sem exceções JavaScript.

Em 2026-11-05, a TV Box ARMv7 foi inspecionada por SSH. Veja [os dados e limites
da medição](tvbox.md#diagnostico-de-desempenho-em-2026-11-05). A tela web não foi
medida no equipamento; o navegador conectado não permitiu abrir a sessão
autenticada do painel.

Em 07/11/2026, a navegação foi medida em Chromium real acessando o serviço da
TV box pela LAN, e os fluxos foram testados contra o Incus real. Consulte o
[relatório com resultados, correções e limitações](validacao-tvbox-2026-11-07.md).
A aba Snapshots agora apresenta o cache imediatamente e confere alterações
externas em segundo plano; a primeira consulta carrega detalhe e lista em
paralelo. As ações continuam revalidando nomes e estado. Também foi removido
o bloqueio das sessões existentes durante o cálculo scrypt de outro login,
mantendo seus parâmetros e limitando a concorrência do hash no modo leve.

O limite de CPU do serviço foi corrigido de um quarto de núcleo para até um
núcleo (`CPUQuota=100%`), mantendo `Nice=10` e os limites de memória. No mesmo
processo ARMv7, esse ajuste reduziu o login de 6,2 para 1,6 s e a mediana da
consulta de identidade de 192 para 65 ms. O percentual do systemd é relativo
a um núcleo; na TV box de quatro núcleos, o teto agregado do painel é cerca
de 25% da CPU total. Os resultados e limites do ensaio estão no relatório.
