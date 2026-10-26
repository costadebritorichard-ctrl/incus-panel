# Protocolo experimental F4

**Nenhum resultado de hardware foi coletado nesta sessão.** R3 é uma fotografia histórica informada pela especificação; não é uma medição nova. As metas de 64 MiB RSS, +5 pontos de CPU e atualização em 3 s não foram comprovadas. Fixtures não entram como resultados de desempenho.

Registre, por ensaio, data, arquitetura, SO/kernel, versão e extensões Incus, commit do painel, topologia de rede, driver/capacidade do pool, inventário de containers descartáveis, cache frio/quente e método de coleta. Use 5 repetições por condição, 60 s de estabilização e 30 amostras a cada 2 s. Execute baseline e painel com a mesma carga, alternando a ordem A/B quando viável. Preserve CSV bruto, falhas, mediana e p95; resultados não comparáveis devem ser identificados.

| Experimento | Procedimento e evidência |
| --- | --- |
| EXP-01 | Baseline sem serviço; CPU/RAM Incus, pool e número de containers. Coletar novamente antes de cada bloco A/B. |
| EXP-02 | Comparar proxy e acesso direto somente se ambos puderem preservar TLS/identidade. Caso contrário, declarar caminho direto indisponível e justificar; não inventar números. |
| EXP-03 | Comparar eventos habilitados e polling, repetindo Start/Stop somente no container descartável. Medir instante da mudança, recepção, renderização, chamadas/min e tráfego. |
| EXP-04 | 1/3/5 containers apenas se capacidade permitir; outras escalas por fixture são ensaios de UI, não de host. |
| EXP-05 | Reproduzir 77/93% por fixture; comparar com pool resources e CLI em leitura. Não lotar Btrfs real. |
| EXP-06 | Observador/operador/admin, Project proibido, mutação fora da allowlist, expiração e revogação TLS. Guardar códigos de status sem credenciais. |
| EXP-07 | Mesmo commit em ARMv7/ARM64/x86-64. Cada plataforma indisponível deve constar como não testada. |
| EXP-08 | Usuários consentidos executam roteiro abaixo; registrar amostra, tempo, erros e limitações. |

Coleta de RSS/CPU do processo auxiliar em Linux, somente leitura:

```sh
python3 scripts/measure.py PID --samples 30 --interval 2 --output artifacts/proxy.csv
```

O CSV usa RSS em KiB e tempo acumulado de CPU em segundos. Compute CPU do processo como `100 × Δcpu_seconds / Δtimestamp`; explicite se percentual é de um núcleo ou normalizado por núcleos. CPU do host e Incus precisam de coleta independente no mesmo período. Não atribua a medição do proxy ao host inteiro. O script não inicia cargas nem containers.

Roteiro de usabilidade: entrar; identificar host e Project; localizar container homônimo correto; interpretar RAM ausente; reconhecer pool crítico; iniciar container de teste e conferir UUID; abrir e sair de console autorizado; alternar Project; encerrar sessão. Faça a mesma sequência por teclado e viewport estreito, verificando foco, labels e informação que não dependa exclusivamente de cor.

Formulário CSV sugerido: `experiment,run,commit,architecture,incus_version,condition,start,end,n_instances,rss_kib,cpu_seconds,latency_ms,result,limitations`. Armazene dados anonimizados em `artifacts/`; exporte apenas os conjuntos revisados para publicação acadêmica. A fixture não contém IPs/chaves do ambiente real.
