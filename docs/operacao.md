# Manual de operação e administração

## Primeiro vínculo e F1

Confirme o endereço, CA e fingerprint SHA-256 com o administrador por canal independente. Cadastre a identidade TLS no Incus com restrição ao Project de laboratório usando o procedimento da versão instalada. Armazene certificado/chave/configuração fora do diretório web, com leitura apenas pelo usuário do serviço. Não publique IPs, fingerprints, chaves ou configuração real no Git. O exemplo usa domínios `.invalid` e não contém credenciais funcionais.

Configure `read_only: true`, usuários e listas explícitas de Projects. Gere hashes de senha pelo comando interativo do README. `host_metrics` permite leituras físicas globais do host: mantenha falso para usuários restritos. A lista de Projects visíveis é uma allowlist do painel, não uma consulta administrativa global. Ausência no escopo deve resultar em 403, mesmo manipulando a URL.

Instale em `/opt/incus-panel`, copie o exemplo de serviço e adapte o caminho/configuração. Crie um usuário de sistema dedicado sem shell administrativo. Configure proxy HTTPS no mesmo host, apontando para `127.0.0.1:8080`, com limite de tamanho de corpo de 64 KiB, timeout e rate limit adequados ao laboratório. Defina `origin` com o endereço exato do navegador. Os exemplos em `deploy/` não foram instalados automaticamente.

Para acessar a mesma instalação por outros domínios HTTPS, configure
`allowed_origins`, por exemplo `"allowed_origins": ["https://alias.example.invalid"]`,
em `config.local.json` e reinicie o painel. Cada origem deve conter o esquema,
domínio e porta quando não for 443, sem caminho nem barra final. A comparação é
exata: não há curingas, e cabeçalhos Host/Forwarded não autorizam outros domínios.
Login e ações aceitam a origem principal e as adicionais; as ações continuam
exigindo o token CSRF. A atualização com `sudo python3 deploy/install.py --update-only`
preserva essa configuração.

## F2 e F3 em ambiente isolado

Crie um Project e um container descartável por procedimento administrativo externo. Inclua o nome exato em `mutable_instances[host][project]`, mude `read_only` para falso e atribua operador/admin ao usuário de teste. Nunca inclua `node1`, `node2` ou `php-site` de produção sem autorização específica. O serviço não faz descoberta automática de alvos mutáveis nem aceita curingas.

Todas as ações exigem confirmação `host/Project/container`. Start exige `Stopped`; Stop/Restart exigem `Running`, usam timeout 30 s e não forçam parada. Exclusão exige administrador, container parado e `security.protection.delete` diferente de `true`. A operação retorna um UUID; abra Tarefas para conferir estado terminal. Um aceite HTTP 202 não significa sucesso final.

O botão Criar CT abre as etapas Geral, Template, Discos, CPU, Memória, Rede, DNS e Confirmar. Com `manage_all_instances` e administrador, o assistente permite definir memória, núcleos, limite de CPU, inicialização no boot, descrição, pool e bridge gerenciada. A reserva IPv4 é entregue por DHCP e precisa ser um endereço livre da sub-rede; o backend rejeita gateway, rede e broadcast. DNS segue a bridge. A cota de disco é oferecida somente para btrfs, zfs, lvm e ceph; no driver dir utiliza-se a capacidade do pool. A opção Iniciar após criar pode ser desmarcada. O perfil default continua sendo a base, com overrides validados pelo servidor. Na modalidade restrita à allowlist, o assistente usa os recursos do perfil default. Não são criadas VMs, bridges físicas nem pools automaticamente. Snapshots e backups podem consumir armazenamento; o Incus é a autoridade sobre falta de espaço.

Para disponibilizar a administração de bridges e interfaces dos containers, configure `manage_networks: true` com `read_only: false`. Somente administradores podem gerenciar bridges e interfaces, respeitando os containers autorizados. Endereço IP, faixas/duração DHCP, NAT, DNS, MTU, roteamento e firewall do Incus são editáveis. Interfaces físicas e bridges com uplinks externos permanecem somente para consulta. A exclusão é bloqueada enquanto profiles ou containers dependerem da bridge. A aba Rede do container permite adicionar/remover interfaces, trocar bridge, ajustar VLAN/MAC/banda e restaurar configurações herdadas. Consulte o [guia de bridges](bridges.md) para detalhes, validação real e limites.

Para console, habilite `enable_console` e use um container Running que o usuário possa administrar, pela allowlist ou pela administração global autorizada. O instalador local já habilita essa opção. A aba Console conecta automaticamente, o botão Console ↗ abre uma janela dedicada e o duplo clique na árvore também abre o console. O navegador usa xterm.js local e envia diretamente teclado, Ctrl+C, Tab, setas e colagem ao `/bin/sh`; sequências ANSI e tela alternativa são preservadas. O tamanho do terminal é enviado ao canal de controle do Incus. A API continua exigindo CSRF e alvo exato, preenchido pela interface. `exit`, sair da tela, logout, expiração e 30 s sem acesso encerram o canal. Há um console por sessão web e quatro por serviço; abrir a janela dedicada encerra o terminal embutido. O timeout trata fechamento abrupto do navegador. Certificados revogados são detectados em novas chamadas REST e na revalidação do console a cada 15 s durante acesso. Os testes com dublês não substituem a validação do terminal no Incus real.

O padrão é `low_resource: true`: o inventário permanece em cache entre telas, até Atualizar, mudança de escopo ou ação pelo painel. Mudanças feitas diretamente no Incus exigem Atualizar. Tabelas são paginadas em 25 linhas; a busca considera a lista completa. Consulte Armazenamento ou Alertas para atualizar a capacidade dos pools. O progresso de criação/download só é consultado na tela correspondente visível e retoma ao voltar; o Incus continua trabalhando em segundo plano.

Para eventos e atualização periódica, configure `low_resource: false` e habilite `enable_events` após testar o endpoint no host alvo. Em queda de WebSocket, há backoff e ressincronização completa; polling REST continua como fallback. Fechar o navegador libera a assinatura após até 45 s sem acesso. Expiração/logout encerram as assinaturas.

## Erros e recuperação

| Sinal | Ação |
| --- | --- |
| 401 | Entre novamente; confirme expiração ou identidade revogada. |
| 403 | Revise papel, escopo, allowlist, modo de leitura e autorização Incus. |
| Falha TLS/fingerprint | Interrompa o uso; confirme renovação da identidade fora de banda. Não desative TLS. |
| 409 | Atualize o recurso; pode ter mudado de estado ou ter nome duplicado. |
| 412 | Recarregue a configuração antes de repetir alteração concorrente. |
| 503/desconexão | Verifique rede e Incus; não interprete containers como parados. |
| Operação incerta | Consulte UUID/estado no Incus antes de repetir; não há retry automático mutante. |
| Storage crítico | Revise capacidade com administrador. O painel não executa limpeza. |

O histórico de auditoria do painel é temporário e não substitui o log Incus. Reiniciar invalida todas as sessões. Administradores podem criar, editar ou remover contas em **Usuários**; alterações e hashes são salvos atomicamente em `/var/lib/incus-panel/users.json`, e alterações/revogação encerram as sessões afetadas. Esse controle administra contas do painel, não cria identidades ou ACLs no Incus. Certificados da identidade de serviço ainda precisam ser revogados no Incus quando necessário.

## Backup, rollback e desinstalação

Faça backup protegido de `config.local.json`, `users.json`, CA/certificados e chave fora do repositório, de acordo com a política da instituição. A preferência do tema fica no navegador e pode ser descartada sem afetar containers. Mantenha backups de workloads pelos procedimentos Incus, não pelo backup da configuração do painel.

Para atualizar, pare o serviço, preserve a configuração, selecione um commit/tag aprovado, rode os testes e reinicie. Para rollback, pare o serviço e restaure o código da versão anterior e sua configuração compatível. Não use reset destrutivo sobre uma árvore com alterações não salvas. Desinstalar significa parar/desabilitar o serviço e remover apenas seus arquivos; não exclua containers, redes, volumes ou snapshots. Revogue a identidade TLS que não for mais necessária.
