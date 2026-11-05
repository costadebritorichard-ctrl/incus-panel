# Integração de leitura com TV Box por SSH

Use esta opção quando você já acessa a TV Box por SSH e quer consultar o Incus sem publicar sua API HTTPS ou instalar um serviço adicional no equipamento.

Na raiz do projeto, execute em um **terminal interativo do seu computador**, substituindo o endereço:

```powershell
python scripts/connect_tvbox.py --host ENDERECO_DA_TVBOX --user suricata
```

O OpenSSH solicita a confirmação da chave do host no primeiro acesso e a senha do usuário remoto, caso não exista autenticação por chave/agent. Confirme o fingerprint por um canal conhecido antes de aceitar. A senha é lida pelo OpenSSH; o aplicativo não a recebe, grava ou inclui em configuração/comandos. Não coloque a senha em argumentos.

O assistente verifica `/1.0`, descobre os Projects acessíveis e consulta as instâncias de cada um. Somente após receber respostas reais ele salva `config.tvbox.local.json` (ignorado pelo Git), gera um login próprio para o painel e inicia **http://127.0.0.1:8081**. O usuário do painel é `admin`, com papel observador; a senha gerada aparece no terminal. Essas credenciais são diferentes das de SSH. Não há fallback automático para dados simulados.

Para limitar os Projects:

```powershell
python scripts/connect_tvbox.py --host ENDERECO_DA_TVBOX --user suricata --project default
```

Use `--project` repetidamente para vários escopos. O assistente mantém uma única conexão SSH enquanto o painel estiver aberto. Para sair, pressione Ctrl+C no terminal; para reconectar, execute novamente. Se a conexão cair, o painel informa erro e exige reinício/autenticação; ele não responde com um inventário vazio fictício.

## Requisitos e limites

- OpenSSH no computador; Python 3 e CLI `incus` na TV Box.
- O usuário SSH precisa poder executar consultas no socket Incus. O assistente não executa sudo nem concede permissões automaticamente. Se o Incus recusar, o administrador precisa revisar o acesso existente.
- O helper Python é passado na linha de comando SSH e executado em memória. Não é instalado ou persistido no host. Ele aceita somente caminhos de inventário e força `incus query --force-local --raw -X GET`, com contexto de Project explícito.
- A chave SSH do servidor é verificada pelo OpenSSH e registrada apenas em `.credentials/known_hosts`, ignorado pelo Git. A chave não é aceita silenciosamente; mudanças de identidade continuam sendo recusadas pelo OpenSSH.
- A conexão ao socket Incus acontece dentro da TV Box, protegida pelo SSH. Não se desabilita TLS da integração HTTPS existente, nem se usa `curl -k`.
- O painel fica exclusivamente no loopback do computador; HTTP local requer `local_only: true` e origem exata. Acesso remoto pelo navegador continua exigindo HTTPS por proxy reverso.
- Start/Stop/Restart, criação, exclusão, console e eventos ficam bloqueados neste transporte, inclusive em chamadas diretas à API. Recursos globais do host aparecem apenas para o login local criado com `host_metrics: true`.

## Verificação desta entrega

### Diagnostico de desempenho em 2026-11-05

Em 2026-11-05, o acesso SSH à TV Box foi concluído e foram executadas somente consultas de diagnóstico. O equipamento reportou Debian 13, arquitetura ARMv7 (`armv7l`), Incus 6.0.4, cerca de 991 MiB de RAM e cerca de 765 MiB disponíveis durante a consulta. A pool `panel-dir` usa o driver `dir`; a bridge gerenciada `panelbr0` está em uso; há três containers em execução. `container-teste` já contém o snapshot `teste1`, confirmando que uma tentativa de criar outro snapshot com esse nome colidiria. O comando `incus info container-teste`, a listagem de snapshots e as listagens de redes e pools foram consultados sem alterar recursos.

O processo do painel apresentou RSS de aproximadamente 19 MiB, `MemoryCurrent` de 14 MiB e pico de cerca de 31 MiB. O contador do serviço mostrava aproximadamente 196 segundos de CPU acumulados após cerca de 33 horas ativo; esse total não é uma porcentagem instantânea. Essas leituras são um retrato do momento, não um benchmark controlado. Os workloads existentes foram preservados.

As transições da interface não puderam ser cronometradas na TV Box: o navegador disponível não expôs uma sessão autenticada do painel. O código agora reutiliza respostas de leitura já consultadas no modo leve, conserva a tela atual enquanto uma rota do mesmo escopo carrega e mantém o acompanhamento de operações fora do cache. Não há alegação de latência medida na interface real. A aceitação funcional que cria/remove snapshots ou bridges e conecta container continua pendente para um recurso descartável autorizado.

Foram aprovados 217 testes automatizados (4 ignorados), incluindo casos de snapshots, bridges, permissões, transporte Unix e preservação do erro original. A checagem JavaScript passou e o smoke DOM percorreu 20 rotas, confirmou reuso de leituras, manutenção da tela durante carregamento, polling pausado fora da tela, confirmação única de snapshot, criação e console com dublês. O diagnóstico remoto foi somente de leitura. Detalhes e limites estão no [relatório de entrega](entrega.md).

Referência de CLI: [incus query](https://linuxcontainers.org/incus/docs/main/reference/manpages/incus/query/). A versão instalada determina a disponibilidade dos argumentos utilizados.
