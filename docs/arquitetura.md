# Arquitetura e decisões R4

## DEC-01 / DEC-03 — proxy local e autorização

O navegador consome uma API de mesma origem. Um serviço Python local acessa endpoints Incus fixos por HTTPS e certificado de cliente. O certificado e a chave não são transmitidos ao navegador. Sessões independentes usam cookie HttpOnly/SameSite Strict, hash scrypt, expiração absoluta e token CSRF por sessão. Mutações e login exigem Origin exata; a API não habilita CORS.

A conta web não determina sua própria função: o administrador configura papéis e escopos no servidor. O serviço verifica host, Project, alvo descartável e confirmação antes de qualquer mutação. O Incus continua responsável pela autorização da identidade TLS. A versão usa uma identidade TLS por host, compartilhada pelas contas web desse host: é uma fronteira de confiança relevante, não uma identidade Incus individual por usuário. Para isolamento forte entre turmas, use certificados restritos e instâncias de serviço separadas. O painel não substitui OpenFGA/OIDC nem oferece provisionamento de identidades.

Essa é uma escolha de implementação, **ainda sem aprovação experimental R4**: os custos CPU/RAM/latência não foram medidos no H3. O caminho direto browser/Incus não foi experimentalmente comparado. Evitou-se depender de APIs de certificados de cliente no JavaScript e manter chaves de administração no frontend.

## DEC-02 — métricas

Host: `/1.0/resources`, somente com `host_metrics: true`. Container: `/instances/{name}/state`. Pool: `/storage-pools/{name}/resources`. A UI mostra fonte, data e valores desconhecidos. CPU de instância é tempo acumulado em segundos, não percentual. Não há taxa de rede derivada nem percentual de CPU host inventado. O painel não soma tamanhos lógicos Btrfs. Não consulta Prometheus `/metrics` em loop.

## DEC-04 / DEC-05 — licença e stack

Código novo sob MIT. Python 3.11+ com biblioteca padrão no servidor e HTML/CSS/JavaScript nativos no navegador. Sem instalação npm/pip, bundle de framework ou módulos nativos a compilar para ARMv7. Node é ferramenta opcional de desenvolvimento. Python já é comum em Debian; o footprint efetivo permanece a medir. Não foi utilizado código Proxmox, Incus ou de outros painéis.

## Componentes

```mermaid
flowchart LR
  B[Navegador] -->|HTTPS / cookie e CSRF| R[Proxy reverso]
  R -->|loopback| P[Servidor Python]
  P --> A[Política por usuário / host / Project / alvo]
  A -->|REST e WebSocket TLS com pin| I[Incus existente]
  P --> D[Fixture em memória apenas em modo demo]
```

REST é o estado autoritativo. O padrão `low_resource: true` mantém um snapshot do inventário por sessão/host/Project até Atualizar, mudança de escopo ou ação pelo painel. Somente identidade, estado, arquitetura e proteção efetiva contra exclusão são enviados na listagem; configurações completas vêm do detalhe. A visão geral recebe apenas memória e quantidade de CPUs; pools são consultados nas telas Armazenamento/Alertas. O cache de leitura do navegador é limitado a oito entradas e o histórico local de tarefas a cem.

Com `low_resource: false`, o browser pode consultar notificações a cada 2 s e atualizar as telas a cada 15 s. Eventos expõem apenas um contador de invalidação, com backoff de reconexão de 1 a 30 s. Assinaturas são isoladas por sessão/host/Project, com uma assinatura ativa por sessão. Criação e download só consultam progresso na página correspondente visível; retornar à página retoma a consulta. O processamento Incus continua fora da tela.

Console: `POST exec` interativo, `/bin/sh`, TERM=xterm-256color, WebSockets de dados e controle no servidor. O navegador carrega xterm.js 6.0.0 e addon-fit 0.11.0 locais sob demanda. A ponte usa HTTP autenticado, entrada agrupada e serializada em blocos de até 4096 caracteres e saída ANSI preservada em JSON, sem inserção como HTML. Consulta saída a cada 100 ms quando há dados, 400 ms em silêncio e 2 s com a aba oculta. Buffers limitados a 64 KiB, frames limitados a 1 MiB, um console por sessão/quatro por processo. ResizeObserver e addon-fit enviam dimensões de 20–300 colunas por 5–100 linhas ao canal de controle. Ausência de acesso por 30 s, expiração ou logout encerram canais. A saída final de um shell encerrado é preservada até leitura ou expiração por inatividade. A limpeza periódica usa o loop do servidor. A CSP mantém scripts locais e permite estilos inline necessários ao posicionamento do terminal e ao redimensionamento dos painéis.

O frontend organiza árvore, navegação contextual, conteúdo e tarefas como uma estação de gerenciamento compacta. O assistente administrativo envia opções tipadas em `/api/create`; o backend valida recursos, redes e limites, cria overrides do perfil default e acompanha criação, início opcional e verificação. Corpos HTTP com dispositivos ou configurações arbitrárias não são encaminhados ao Incus. A confirmação final valida Running ou Stopped conforme a opção de início. O painel de tarefas usa as mesmas leituras autorizadas de operações/auditoria e não acrescenta polling em repouso no modo leve.

HTML/CSS/JS públicos são lidos e comprimidos no início do processo, com ETags por representação e respostas 304 sem corpo. JSON autenticado permanece `no-store`, sem compressão. O servidor limita a concorrência a quatro requisições no modo leve e oito no modo normal. O loop ocioso aguarda até 5 s, sem atrasar a recepção de conexões disponíveis.

## Limites da infraestrutura

O serviço HTTP padrão Python é destinado aqui a rede privada/laboratório, atrás de proxy HTTPS com limites de conexão e de taxa. Não houve auditoria de implantação pública multiusuário. Não há banco: sessões, auditoria de 200 mutações e fixtures somem ao reiniciar. Tasks concluídas dependem do ciclo de retenção do Incus e da aba atual. Preferências locais contêm apenas seleção de host/Project. Nenhum experimento ou mudança em produção foi executado.

Consultas globais de pools/recursos exigem permissão separada; o inventário de Projects vem dos escopos do painel. Projects/profiles compartilhados podem exigir restrições adicionais na política Incus. Certificados precisam ter SAN compatível com o hostname usado; não se desliga a verificação para contornar certificado incompatível.

Contratos consultados: [REST oficial](https://linuxcontainers.org/incus/docs/main/rest-api/), [exec](https://linuxcontainers.org/incus/docs/main/instance-exec/) e [eventos](https://linuxcontainers.org/incus/docs/main/events/). Essas referências atuais não substituem a conferência do OpenAPI do Incus 6.0.4 alvo; essa conferência é um gate pendente de integração.
