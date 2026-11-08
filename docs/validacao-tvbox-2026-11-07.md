# Validação na TV box — 07/11/2026

Relatório da verificação dos critérios de `refatorar.md`. Os testes foram executados por SSH no equipamento e pela API HTTPS do painel instalado. A navegação também foi exercitada em Chromium real no computador, acessando o painel da TV box pela LAN. Isso mede o servidor ARMv7 com um navegador cliente; não mede um navegador executado na própria TV box.

## Ambiente e versão

- Debian 13, ARMv7, kernel `6.18.38-current-sunxi`, Incus 6.0.4.
- Aproximadamente 991 MiB de RAM; 781 MiB disponíveis na consulta inicial.
- Painel executado na própria TV box, em serviço systemd, acessando o socket Unix local do Incus. A interface é processada pelo navegador cliente.
- Pool existente `panel-dir`, driver `dir`, sistema de arquivos ext4 sem project quotas. Aproximadamente 4,4 GiB livres na consulta inicial.
- Código base `760099c4fc2d65c9dfcb0197a253a6167b75231c`, acrescido das correções desta validação. Versão instalada identificada pelo digest de fontes `a408a6146d2f61dea2c8eac94dce7647a813cb3a7ac434b73ceb85c058547554`.
- Nova release em `/opt/incus-panel/releases/20261107-qa-a408a6146d`, com a anterior preservada para rollback. Na troca de release, configuração, contas, certificado, chave e unidade systemd tiveram os hashes comparados e foram preservados. Depois do ensaio de CPU, a unidade recebeu somente a alteração `CPUQuota=25%` → `CPUQuota=100%`, com backup em `/opt/incus-panel/update-backups/cpu-quota-20261107.service`. Configuração, contas e identidade TLS continuaram iguais.

## Correções aplicadas

**Navegação de snapshots:** a versão anterior consultava o detalhe do CT e depois a lista, bloqueando a apresentação a cada visita. A nova versão consulta os dados em paralelo na primeira abertura e apresenta imediatamente o cache nas visitas seguintes. A conferência em segundo plano mantém a atualização de alterações feitas por CLI. Cada ação continua consultando nomes e estado antes da confirmação. Respostas de uma rota anterior ou de um cache invalidado não substituem a tela ou o cache atual.

Conferências de rotas já abandonadas são descartadas antes de ocupar uma requisição HTTP quando ainda estavam na fila. Isso evita acumular trabalho desnecessário ao clicar rapidamente entre telas.

**Concorrência de autenticação:** o hash scrypt era calculado enquanto a trava global de sessões estava ocupada. Um login simultâneo bloqueou uma consulta de sessão existente por 6.778 ms na medição anterior. O hash agora é calculado fora dessa trava. O modo leve permite apenas um cálculo simultâneo para limitar CPU/RAM; tentativas concorrentes recebem HTTP 429 para tentar novamente. Limitação de tentativas, parâmetros do hash, CSRF, expiração e revogação de contas continuam aplicados. Alterar/remover a identidade durante o cálculo impede a emissão de uma sessão antiga.

Nesta instalação, o usuário entra com uma conta local do painel, validada por scrypt, cookie e CSRF. O processo `incus-panel` acessa o Incus pelo socket Unix com as permissões da identidade de serviço; as contas web não viram usuários Incus. O certificado HTTPS do painel protege o transporte entre navegador e painel. Autenticação Incus por certificado de cliente é usada pelo transporte TLS alternativo, e não por este vínculo Unix local.

## Critérios funcionais

| Critério | Resultado esperado | Resultado observado e evidência | Estado |
| --- | --- | --- | --- |
| Login correto | Permitir acesso | Login administrativo no HTTPS instalado, com dados reais do Incus | Aprovado |
| Senha incorreta | Negar acesso | HTTP 401, sem sessão autorizada | Aprovado |
| API sem sessão | Recusar administração | `/api/session` retornou HTTP 401 | Aprovado |
| Logout | Invalidar sessão | Após logout, a mesma sessão recebeu HTTP 401 | Aprovado |
| Expiração | Exigir novo login | Instância HTTPS isolada no loopback da própria TV box, com o mesmo código e sessão de 60 s; após 61 s, sessão e API administrativa retornaram HTTP 401. Prazo de produção preservado | Aprovado nesse ensaio controlado |
| Segredos no frontend | Não expor chave administrativa | Sessão pública contém identidade/escopos/CSRF; configuração, hashes e chave permanecem no backend | Aprovado na inspeção e nos testes automatizados |
| Inventário | Coincidir com Incus | Nomes comparados com `incus list --format json` | Aprovado |
| Criar CT | Confirmar container real | Alpine do cache criado pela API com limites e bridge solicitados; confirmação direta no Incus | Aprovado |
| Iniciar/parar/reiniciar | Confirmar estado real | `Running` / `Stopped` confirmados no Incus em CT descartável | Aprovado |
| Console | Executar comandos interativos | Shell real, ANSI, `stty size` 120×40, Ctrl+C e novo comando confirmados via API HTTPS | Aprovado |
| Console pelo navegador | Entrada e saída pelo xterm/WebSocket | Comando executado no Alpine descartável pelo xterm e resposta renderizada; conexão WebSocket confirmada | Aprovado |
| Interface de criação | Criar CT e associar bridge pelo assistente | Oito etapas concluídas no Chromium real, Alpine local em execução e NIC efetiva na bridge solicitada | Aprovado |
| Interface de snapshots | Impedir duplo envio e atualizar a grade | Criação com dois cliques consecutivos, uma linha na grade, tarefa concluída e exclusão pela interface real | Aprovado |
| Desconexão do navegador | Mostrar falha e permitir recuperação | Rede desativada somente no Chromium: Atualizar exibiu falha; após reativar, o mesmo botão recuperou os dados reais | Aprovado |
| Métricas | Representar os contadores reais | RAM/limite/estado comparados com API Incus; CPU explicitamente em segundos acumulados e rede em bytes acumulados | Aprovado para essas grandezas |
| Histórico | Registrar ações e estados | Criação, console, snapshot, restart, stop, restore, start e exclusão de snapshot encontrados na auditoria; operações acompanhadas até estado terminal | Aprovado no histórico temporário |
| Snapshot criar/listar | Confirmar no Incus | Snapshot `baseline` e descrição conferidos no painel e `incus snapshot list` | Aprovado |
| Snapshot duplicado | Exibir conflito compreensível | Segunda criação com o mesmo nome recusada com HTTP 409; original preservado | Aprovado |
| Snapshot restaurar | Recuperar dados em CT descartável | Arquivo passou de `before` para `after`; após restauração voltou a `before` | Aprovado |
| Snapshot excluir | Confirmar ausência | Lista do painel e CLI vazias após a operação | Aprovado |
| Operação assíncrona/erro | Acompanhar UUID, não confundir aceite com sucesso | Ciclo real acompanhado; erro original, operação longa, reconexão e envio único também cobertos por testes de contrato/DOM | Aprovado com essas evidências |
| Bridge criar/consultar/editar | Bridge gerenciada efetiva | Bridge descartável criada pelo painel; MTU 1400 confirmado diretamente no Incus | Aprovado |
| Associar bridge ao CT | NIC efetiva na bridge escolhida | `expanded_devices.eth0.network` confirmado diretamente no Incus | Aprovado |
| Bridge em uso | Impedir exclusão | HTTP 409 enquanto o CT dependia dela | Aprovado |
| Interface física | Não alterar gerenciamento do host | Pedido de edição de `end0` recusado com HTTP 403 | Aprovado |
| Bridge excluir | Remover somente após dependências | Bridge descartável removida após a limpeza do CT | Aprovado |
| Disco no pool `dir` | Adaptar formulário à capacidade | Campo desativado e uso da capacidade do pool; sem afirmar que uma quota foi aplicada | Aprovado para o pool atual |
| Disco em backend com quota | Criar CT e confirmar limite efetivo | Pool Btrfs temporário de 2 GiB; CT criado por `/api/create` com raiz `panelroot0`, herdada do perfil, sobrescrita com `size=1GiB`. Incus e qgroup Btrfs confirmaram o limite físico de 1.073.741.824 bytes | Aprovado |
| Armazenamento | Preservar consulta | Capacidade/uso consultados via pool resources | Aprovado para consulta |
| Usuários/permissões | Documentar implementação e limites | Instalação já contém administrador e operador; papéis/Projects são controles do painel, separados da identidade de serviço Incus | Documentado; sem nova auditoria multiusuário completa |
| Cluster | Fora do escopo atual | Servidor standalone; topologia não alterada | Fora do escopo |
| Portabilidade | Registrar local/arquitetura | Serviço confirmado na TV box ARMv7 | Aprovado nesta arquitetura; ARM64/x86-64 não ensaiados aqui |

## Evidências e limites

### Navegação e bloqueio durante login

| Medida | Antes | Depois |
| --- | ---: | ---: |
| Snapshots, visitas seguintes, três amostras | 472 / 366 / 372 ms | 7 / 8 / 7 ms |
| Mediana de apresentação de Snapshots | 372 ms | 7 ms |
| Mediana das demais rotas já consultadas | 10 ms | 8 ms |
| Consulta de sessão durante outro login | 6.778 ms | 86 ms |

A mediana de Snapshots caiu cerca de 98%. O tempo mede a mudança de hash até o conteúdo ficar pronto, incluindo a observação por CDP; a conferência do Incus em segundo plano termina depois. Não é uma medição da pintura de cada frame nem do navegador rodando no ARM.

As demais telas já estavam rápidas após o primeiro acesso. Com o limite antigo de CPU, uma repetição isolada chegou a 1.097 ms no primeiro sumário de CT, embora o cache já tivesse sido corrigido. Depois do ajuste para um núcleo, o sumário frio marcou 270 ms; a primeira abertura de Snapshots passou de 421 ms na versão inicial para 114 ms na configuração final. As consultas sem cache continuam dependentes de rede, CPU e Incus. São execuções distintas, sem controle completo da carga do host; não sustentam uma conclusão estatística de melhora de todas as consultas frias.

Antes do ajuste de quota de CPU, o login em si levou aproximadamente 6–8 s. A correção da trava já impedia essa espera de paralisar outras sessões. O ajuste de quota abaixo reduziu também o tempo do próprio login, mantendo os parâmetros criptográficos.

### Quota de CPU do serviço

O limite anterior era 25% de **um núcleo**, e não 25% dos quatro núcleos da TV box. Um ensaio no mesmo processo alternou temporariamente 25%/100%, medindo sete consultas HTTPS autenticadas por recurso e o login. O limite original foi restaurado ao terminar o ensaio; após confirmar o ganho, 100% foi aplicado permanentemente ao serviço e aos dois modelos de instalação do projeto.

| Medida | Quota 25% | Quota 100% |
| --- | ---: | ---: |
| Login com o mesmo hash | 6.165 ms | 1.585 ms |
| Identidade do servidor, mediana | 192 ms | 65 ms |
| Inventário, mediana | 76 ms | 55 ms |
| Detalhe de CT, mediana | 150 ms | 152 ms |
| Estado de CT, mediana | 96 ms | 97 ms |
| Resumo de recursos do host, mediana | 83 ms | 25 ms |

O ganho aparece nas consultas limitadas pela CPU do painel; chamadas dominadas pelo Incus não ficaram mais rápidas nessa amostra. O login caiu aproximadamente 74%. `CPUQuota=100%` limita o conjunto do serviço a um núcleo; neste equipamento de quatro núcleos corresponde a até cerca de 25% da capacidade agregada. A prioridade continua baixa (`Nice=10`), o cálculo de senha continua limitado a um por vez e `MemoryHigh=64M`/`MemoryMax=128M` permanecem. Não houve reinício do serviço nem dos containers para aplicar esse parâmetro.

O significado de quota por núcleo é documentado em [systemd.resource-control](https://www.freedesktop.org/software/systemd/man/261/systemd.resource-control.html). Aumento do limite permite terminar trabalho mais cedo; não significa consumo permanente de um núcleo. Os resultados são de um ensaio sequencial, sem ordem A/B aleatorizada, e não justificam atribuir toda a variação de rede ou host à quota.

### Escalabilidade e consumo no ARMv7

Uma execução por condição, com 60 s de estabilização e 30 amostras a cada 2 s. O CT original foi mantido; foram acrescentados dois e depois quatro Alpine descartáveis, ociosos, com 64 MiB e 25% de CPU cada. O benchmark fez uma consulta HTTPS autenticada de inventário a cada 2 s pelo loopback. O modo leve normal permanece manual e não gera esse polling em repouso.

| Containers | RSS mediano painel | RSS mediano Incus | CPU painel, um núcleo | CPU Incus, um núcleo | RAM disponível mínima | Inventário mediana / p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 20,23 MiB | 70,95 MiB | 4,69% | 3,22% | 780,78 MiB | 326 / 331 ms |
| 3 | 19,67 MiB | 70,20 MiB | 4,84% | 4,60% | 762,73 MiB | 342 / 386 ms |
| 5 | 19,67 MiB | 71,63 MiB | 4,97% | 5,96% | 741,89 MiB | 339 / 375 ms |

O painel foi medido separadamente do daemon Incus por seus PIDs em `/proc`. CPU usa `100 × Δtempo_cpu / Δtempo_real`, em porcentagem de um núcleo. O uso global do host, normalizado sobre todos os núcleos, foi aproximadamente 2,81%, 3,27% e 3,45% nos três cenários. Esse total também inclui o cliente do benchmark, SSH e outros serviços.

As 30 respostas de inventário somaram 6.475 / 15.351 / 24.228 bytes de corpo JSON, respectivamente: cerca de 108 / 256 / 404 B/s. Cabeçalhos e TLS não entram nessa conta. Os contadores de todas as interfaces do host foram preservados separadamente no JSON bruto; incluem SSH, WireGuard e outros tráfegos e não podem ser atribuídos integralmente ao painel. O tráfego de loopback foi de aproximadamente 198 / 207 / 214 kB em cada sentido entre a primeira e a última amostra.

Esse ensaio mostra viabilidade de 1/3/5 containers leves nesse equipamento e consumo do painel abaixo de 21 MiB de RSS nas condições testadas. Não estabelece capacidade máxima, pico de instalação, carga de aplicações ou ganho de CPU contra um baseline sem painel. Não substitui cinco repetições por condição, ordem A/B alternada, avaliação com usuários ou os demais experimentos do protocolo F4. A quota do serviço ainda era 25% de um núcleo durante esta coleta; qualquer ajuste posterior de quota deve ser identificado como outra condição.

O protocolo foi repetido após a aplicação definitiva de `CPUQuota=100%`, sem alterações no código da aplicação entre os blocos:

| Containers | RSS mediano painel | RSS mediano Incus | CPU painel, um núcleo | CPU Incus, um núcleo | RAM disponível mínima | Inventário mediana / p95 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 19,75 MiB | 70,22 MiB | 4,65% | 3,59% | 754,44 MiB | 162 / 166 ms |
| 3 | 19,75 MiB | 73,64 MiB | 4,83% | 4,62% | 740,21 MiB | 175 / 193 ms |
| 5 | 19,75 MiB | 75,13 MiB | 5,00% | 5,60% | 719,19 MiB | 189 / 239 ms |

As medianas de inventário caíram cerca de 50%, 49% e 44% nos três cenários. O consumo médio de CPU do painel durante as mesmas 30 consultas permaneceu próximo de 4,7–5,0% de um núcleo; o limite maior permitiu terminar cada resposta antes. A memória global disponível e o RSS do Incus variaram entre os blocos; outros serviços, caches e histórico de operações não foram isolados, portanto essa variação não pode ser atribuída somente à quota. Na condição final, o corpo das respostas somou 6.470 / 15.354 / 24.233 bytes; os contadores completos de rede permanecem nos dados brutos.

Os recursos dos ensaios receberam nomes aleatórios `qa-*` e foram removidos. O CT de trabalho existente permaneceu em execução. A restauração foi feita exclusivamente no CT descartável.

Na conferência final, restaram somente o CT original `container-teste`, as redes `panelbr0`/`lo`/`end0` e o pool `panel-dir`. O CT continuava `Running`, com o mesmo PID 16789 observado no início. O serviço estava ativo; o cgroup registrava aproximadamente 14,4 MiB atuais e 31,1 MiB de pico, medidas diferentes do RSS por processo das tabelas. Os contadores de limite de memória, OOM e OOM kill estavam em zero. Pedidos reais a `/config.local.json`, `/server.key` e `/.git/config` retornaram 404; uma mutação sem sessão retornou 401.

O ensaio funcional principal via HTTPS aprovou 16 de 16 cenários executados. O ensaio adicional de quota também passou. O navegador real confirmou assistente, bridge associada, campo de quota desativado no `dir`, console WebSocket, criação/exclusão de snapshot, clique repetido e recuperação após desconexão, sem exceções JavaScript. Esses resultados aprovam os fluxos funcionais ensaiados; não substituem todo o protocolo estatístico/educacional do TCC. O roteiro aguarda o prompt e a inicialização do shell antes de enviar o comando de console; logs de tentativas preliminares também foram conservados nos artefatos.

### Quota sem migração do armazenamento

Para validar o backend compatível, foram preparados `btrfs-progs` e sua dependência Debian ARMhf, sem atualizar os demais pacotes. O pool descartável usou um arquivo loop de 2 GiB, sem formatar dispositivo físico nem alterar o perfil `default`. Pelo painel, foi solicitado um Alpine com disco raiz de 1 GiB. O Incus mostrou exatamente um disco `/`, chamado `panelroot0`, com o pool de teste e `size=1GiB`.

O comando `btrfs qgroup show --raw -re` confirmou `Max referenced=1073741824` no subvolume do CT. O campo `config` do volume permaneceu vazio; neste caso o tamanho efetivo está no dispositivo raiz do CT e no qgroup, e não em um `size` separado na configuração do volume. O container, o pool e o módulo Btrfs temporário foram removidos. O armazenamento normal continua `panel-dir`; seu campo de tamanho permanece corretamente desativado.

A remoção das ferramentas auxiliares foi confirmada por `dpkg-query` e pela ausência de `btrfs`/`mkfs.btrfs` no PATH. `dpkg --audit` não apontou pendências e não restaram processos de instalação. Os comandos APT iniciais excederam o tempo limite, por isso a conclusão da limpeza foi verificada pelo estado efetivo dos pacotes, e não apenas pelo código de saída do comando.

A suíte Python contabilizou 273 testes no Windows: 269 aprovados e 4 ignorados por plataforma. No ARMv7, os 273 foram aprovados. A alteração final de JavaScript foi validada por sintaxe, percurso DOM de 40 rotas e pelos ensaios específicos de snapshots, incluindo alterações externas e resposta antiga após invalidação. Esses ensaios DOM usam fixtures e não são apresentados como medições de hardware.

Para a alteração posterior da quota, os 12 testes do instalador passaram; o gerador de unidade foi comparado ao modelo distribuído. A unidade real passou em `systemd-analyze verify`, e a quota efetiva de um núcleo, a prioridade e os limites de memória foram conferidos no systemd.

Os artefatos brutos desta execução ficam em `artifacts/tvbox-qa/`, ignorado pelo Git: logs SSH/API, manifestos de hashes, medições antes/depois, capturas de tela e scripts dos ensaios. Nenhuma senha foi adicionada aos arquivos de código ou a este relatório.

As correções foram aplicadas ao código local e à instalação da TV box. Não houve commit ou publicação no GitHub nesta sessão. Reinstalar a partir de uma revisão remota anterior pode repor o comportamento antigo; utilize o código corrigido ao preparar a próxima atualização.

O certificado local existente contém um IP anterior no SAN. Nos clientes Python, o teste passou por loopback com validação da CA e do nome presentes no certificado. No Chromium isolado, foi fixado o hash SPKI do certificado obtido por SSH; não houve desativação geral de TLS. A renovação do certificado para o IP atual permanece um ajuste de implantação a planejar, preservando a relação de confiança dos clientes.

O teste autenticado no domínio público foi recusado pela revisão automática por falta de autorização explícita para enviar credenciais a esse domínio. Nenhuma conclusão de latência é atribuída ao proxy público. Os resultados de navegador deste relatório correspondem à LAN.

O driver `dir` pode oferecer quotas quando ext4/XFS estão configurados com project quotas; não é correto afirmar que todo pool `dir` é incapaz. Nesta instalação não estão habilitadas, e o assistente adota o comportamento conservador documentado. Não houve migração, reparticionamento ou alteração do pool atual. Referência: [documentação oficial do driver dir](https://linuxcontainers.org/incus/docs/main/reference/storage_dir/).

O histórico de tarefas e as sessões continuam temporários em memória. Gráficos são amostras da sessão, sem histórico persistente; CPU acumulada não representa percentual instantâneo. Esses limites precisam acompanhar a apresentação do TCC.
