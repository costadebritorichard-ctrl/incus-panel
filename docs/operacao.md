# Manual de operação e administração

## Primeiro vínculo e F1

Confirme o endereço, CA e fingerprint SHA-256 com o administrador por canal independente. Cadastre a identidade TLS no Incus com restrição ao Project de laboratório usando o procedimento da versão instalada. Armazene certificado/chave/configuração fora do diretório web, com leitura apenas pelo usuário do serviço. Não publique IPs, fingerprints, chaves ou configuração real no Git. O exemplo usa domínios `.invalid` e não contém credenciais funcionais.

Configure `read_only: true`, usuários e listas explícitas de Projects. Gere hashes de senha pelo comando interativo do README. `host_metrics` permite leituras físicas globais do host: mantenha falso para usuários restritos. A lista de Projects visíveis é uma allowlist do painel, não uma consulta administrativa global. Ausência no escopo deve resultar em 403, mesmo manipulando a URL.

Instale em `/opt/incus-panel`, copie o exemplo de serviço e adapte o caminho/configuração. Crie um usuário de sistema dedicado sem shell administrativo. Configure proxy HTTPS no mesmo host, apontando para `127.0.0.1:8080`, com limite de tamanho de corpo de 64 KiB, timeout e rate limit adequados ao laboratório. Defina `origin` com o endereço exato do navegador. Os exemplos em `deploy/` não foram instalados automaticamente.

## F2 e F3 em ambiente isolado

Crie um Project e um container descartável por procedimento administrativo externo. Inclua o nome exato em `mutable_instances[host][project]`, mude `read_only` para falso e atribua operador/admin ao usuário de teste. Nunca inclua `node1`, `node2` ou `php-site` de produção sem autorização específica. O serviço não faz descoberta automática de alvos mutáveis nem aceita curingas.

Todas as ações exigem confirmação `host/Project/container`. Start exige `Stopped`; Stop/Restart exigem `Running`, usam timeout 30 s e não forçam parada. Exclusão exige administrador, container parado e `security.protection.delete` diferente de `true`. A operação retorna um UUID; abra Tarefas para conferir estado terminal. Um aceite HTTP 202 não significa sucesso final.

O assistente usa imagem local compatível com arquitetura e tipo container, mais um profile existente. O profile define disco root, pool, rede e limites. Confira esses recursos no Incus antes de criar. Não são criadas VMs, bridges físicas nem pools automaticamente. Snapshots e backups podem consumir armazenamento; o Incus é a autoridade sobre falta de espaço. A verificação prévia de capacidade não elimina corrida por espaço.

Para console, habilite `enable_console`, confirme o risco de shell root e use um container Running na allowlist. O navegador envia linhas a `/bin/sh`; Ctrl+C é um botão separado. `exit`, fechar a tela, logout, expiração e 30 s sem acesso encerram o canal. Navegador abruptamente fechado é tratado pelo timeout. Certificados revogados são detectados em novas chamadas REST e na revalidação do console a cada 15 s durante acesso. A UI textual não suporta programas VT de tela inteira.

Para eventos, habilite `enable_events` após testar o endpoint no host alvo. Em queda de WebSocket, há backoff e ressincronização completa; polling REST continua como fallback. Fechar o navegador libera a assinatura após até 45 s sem acesso. Expiração/logout encerram as assinaturas.

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

O histórico de auditoria do painel é temporário e não substitui o log Incus. Reiniciar invalida todas as sessões. Para revogar usuário web, remova-o da configuração e reinicie o serviço; revogue também o certificado no Incus quando necessário. A versão não recarrega configuração em tempo real.

## Backup, rollback e desinstalação

Faça backup protegido de `config.local.json`, CA/certificados e chave fora do repositório, de acordo com a política da instituição. Preferências visuais podem ser descartadas sem afetar containers. Mantenha backups de workloads pelos procedimentos Incus, não pelo backup da configuração do painel.

Para atualizar, pare o serviço, preserve a configuração, selecione um commit/tag aprovado, rode os testes e reinicie. Para rollback, pare o serviço e restaure o código da versão anterior e sua configuração compatível. Não use reset destrutivo sobre uma árvore com alterações não salvas. Desinstalar significa parar/desabilitar o serviço e remover apenas seus arquivos; não exclua containers, redes, volumes ou snapshots. Revogue a identidade TLS que não for mais necessária.
