# Incus Panel

Painel web em português para laboratórios Incus, com foco em containers e equipamentos de baixo custo. Implementação inicial da especificação em [`especificacao/`](especificacao/), sem dependências Python ou JavaScript externas.

**Estado: versão experimental 0.1.0.** Há implementação e testes locais para F1, núcleo de F2 e parte de F3. Os gates de aceite em host real, os experimentos de F4 e funcionalidades restantes estão abertos. Consulte a [matriz de rastreabilidade](docs/rastreabilidade.md) e o [relatório de entrega](docs/entrega.md). Não foi alterado nenhum host Incus real.

## Instalar na TV Box

Na TV Box com Linux, systemd, Incus instalado, Python 3.11+, OpenSSL e iproute2:

```bash
git clone https://github.com/costadebritorichard-ctrl/incus-panel.git
cd incus-panel
sudo python3 deploy/install.py
```

O repositório é público e não exige autenticação para clonar. Depois do clone,
o único comando de instalação é `sudo python3 deploy/install.py`. Ele detecta o
IPv4 da rota principal, cria o serviço `incus-panel`, habilita a inicialização
automática e mostra a URL HTTPS, o login `admin` e a senha inicial. Abra a URL em
outro computador da mesma rede. O certificado é local; confira o fingerprint
exibido pelo instalador antes de aceitá-lo no navegador.

O painel permite criar containers, iniciar, parar, reiniciar, excluir containers
parados, criar snapshots/backups e abrir um shell `/bin/sh`. Para criar, escolha
uma imagem e clique em **Criar container**. A lista reúne imagens locais e imagens
do catálogo oficial compatíveis com o processador. Nome, disco e rede são
automáticos. O painel acompanha o download, a criação e o início do container,
mostrando sucesso apenas depois de confirmar que está em execução. Falhas aparecem
na própria tela, com a mensagem do Incus. A criação continua se você mudar de tela.

O instalador concede ao usuário do serviço acesso administrativo ao socket
local do Incus. Não expõe a API Incus na rede. Se o Incus estiver vazio e sem pool,
inicializa uma configuração mínima com armazenamento e rede NAT. Configurações
existentes são usadas; se o profile default não tiver rede, o instalador associa
uma bridge gerenciada existente ou cria uma rede NAT. Na criação, disco e rede
ausentes no profile são escolhidos automaticamente entre os recursos disponíveis.
Internet na TV Box é necessária para baixar imagens remotas.

O modo leve é padrão no socket local: atualização manual da tela, eventos
desativados, uma criação por vez e acompanhamento a cada 5 segundos. Novos
containers recebem 128 MiB de RAM, limite de meio núcleo de CPU e não iniciam
automaticamente após reiniciar a TV Box. A criação exige ao menos 256 MiB de
memória disponível; essa verificação não garante que um download/descompactação
do Incus caiba na memória. Os limites não alteram containers já existentes.
O serviço do painel recebe limites próprios de CPU/memória no systemd; o daemon
Incus e a extração de imagens são processos separados desses limites.

Para escolher o endereço: `sudo python3 deploy/install.py --address 192.168.1.50`.
Para atualizar, execute `git pull` e o mesmo comando de instalação; senha e
configuração existentes são preservadas. Uma instalação anterior em modo de
leitura exige revisão manual da configuração em `/etc/incus-panel/config.local.json`.
Consulte [o guia local](docs/instalacao-local.md) para requisitos e diagnóstico.

## Executar a demonstração

Requer Python 3.11 ou superior. Execute na raiz:

```powershell
python -m incus_panel.server --demo
```

Abra **http://127.0.0.1:8080**. O terminal exibe o usuário `demo` e uma senha temporária gerada a cada execução. Todos os dados e alterações são explicitamente simulados e ficam em memória. O modo demo não emula um shell nem um host real. Os Projects `laboratorio` e `redes` possuem containers homônimos para exercitar o isolamento; `lab-novo` pode ser criado pela interface.

## Funcionalidades

- Login, sessão com expiração, logout, CSRF e papéis efetivos no backend.
- Dashboard, navegação lateral, seleção de host/Project, busca e filtros de containers.
- Detalhes de containers: recursos, dispositivos locais/herdados, configuração, snapshots e backups.
- Leitura de imagens, profiles, redes, pools e escopos de Projects.
- Start, Stop, Restart, criação, exclusão protegida e criação de snapshots/backups em alvos explicitamente autorizados.
- Operações rastreadas por UUID, com resultado confirmado pelo Incus e auditoria temporária.
- Alertas de capacidade de pool em 80/90%; métricas ausentes aparecem como `n/d`.
- Console textual `/bin/sh`: canais WebSocket TLS no backend, entrada por linha no navegador, encerramento por logout/expiração/inatividade.
- Eventos lifecycle/operation: reconexão com backoff e ressincronização REST. Atualização periódica a cada 15 s como fallback.
- Múltiplas conexões configuráveis, mantendo identidade composta `host/Project/container`; nenhuma criação ou alteração de cluster.

Console e eventos remotos são opt-in e precisam ser validados no Incus da instalação. O console não é um emulador VT completo: aplicativos como `vim`/`top` em tela inteira não são suportados nesta versão. Backend local em loopback; acesso remoto exige proxy reverso HTTPS.

## Configurar um Incus real

Para uma TV Box já acessível por SSH, há um assistente que conecta em modo de leitura, sem instalar nada no equipamento:

```powershell
python scripts/connect_tvbox.py --host ENDERECO_DA_TVBOX --user suricata
```

Digite a senha quando o OpenSSH solicitar. O painel real usa `http://127.0.0.1:8081`, com login próprio gerado no terminal. Consulte [integração SSH](docs/tvbox.md) para requisitos, isolamento e limites. A integração HTTPS abaixo continua disponível.

1. Leia o [manual de operação e segurança](docs/operacao.md).
2. Copie `config.example.json` para `config.local.json` (ignorado pelo Git).
3. Configure um endpoint HTTPS fixo, CA, certificado de cliente restrito a Projects e chave privada fora da raiz web. Confirme o fingerprint SHA-256 fora de banda. CA, hostname e fingerprint são verificados; não há opção de desabilitar TLS.
4. Gere o hash de senha sem gravar a senha em argumentos ou arquivos:

   ```powershell
   python -m incus_panel.server --hash-password
   ```

5. Configure usuários e seus `scopes`, mantendo `read_only: true` para F1. Ative métricas globais somente em identidades que podem conhecer todo o host.
6. Configure o proxy HTTPS de acordo com `origin` e execute:

   ```powershell
   python -m incus_panel.server --config config.local.json
   ```

Para F2/F3, use apenas um Project isolado e containers descartáveis na `mutable_instances`. Habilite `enable_console` e `enable_events` somente após conferir a API e as permissões no servidor alvo. Nenhuma credencial Incus chega ao navegador. O navegador recebe apenas dados redigidos e um cookie HttpOnly.

## Verificar

```powershell
python -m unittest discover -s tests -v
node --check web/app.js
python scripts/traceability.py --check
```

No Windows, `./scripts/check.ps1` executa os três comandos. Node é necessário somente para verificação sintática e QA opcional; não é necessário em produção. Há CI para Python 3.11–3.14, ainda não executada remotamente.

## Histórico Git e publicação

O ambiente de desenvolvimento restringiu gravações em `.git`, mas permitiu um histórico alternativo em `.git-local`. Os commits foram preservados ali. Para consultar antes da importação:

```powershell
git --git-dir=.git-local --work-tree=. log --oneline
```

O GitHub não pôde ser acessado pela sessão de desenvolvimento, mesmo após a autenticação do usuário, devido ao bloqueio de conexões externas do executor. A criação e o push do remoto **não foram confirmados**.

Para importar o histórico para `.git`, criar o repositório **privado** `incus-panel` na sua conta autenticada e publicar todos os commits, execute no seu terminal:

```powershell
./scripts/publish.ps1
```

O script preserva os arquivos de trabalho, não faz force push, não substitui um `origin` diferente e interrompe em caso de erro. Em clones normais, o diretório `.git-local` não é necessário. O histórico também está exportado no arquivo local `artifacts/incus-panel.bundle`, que não é enviado ao GitHub.

Licença MIT para o código novo; referências e documentação de terceiros mantêm suas respectivas licenças. Consulte [arquitetura](docs/arquitetura.md), [experimentos](docs/experimentos.md) e [changelog](CHANGELOG.md).
