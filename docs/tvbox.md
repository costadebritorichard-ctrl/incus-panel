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

O executor de desenvolvimento recusou SSH e a porta HTTPS antes da autenticação (`Permission denied`, socket Windows 10013). Nenhum login na TV Box foi concluído e nenhum recurso Incus foi alterado. A integração SSH foi verificada por testes locais de contrato, validação do helper remoto e smoke do painel, totalizando 64 testes automatizados. Compatibilidade e permissões do Incus do equipamento permanecem a confirmar pela execução acima.

Referência de CLI: [incus query](https://linuxcontainers.org/incus/docs/main/reference/manpages/incus/query/). A versão instalada determina a disponibilidade dos argumentos utilizados.
