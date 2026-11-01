# Painel na própria TV Box

## Uso em VM e diagnóstico de inicialização

O mesmo instalador pode ser usado em VMs Linux das distribuições suportadas.
Comece com 1 vCPU, 512 MB de RAM e espaço livre suficiente para as imagens;
1 GB de RAM ou mais dá maior margem. Esses são requisitos, não medições de
consumo. A criação exige 256 MiB disponíveis e usa 128 MiB por container.
O painel não precisa de virtualização aninhada para executar containers Linux
dentro de uma VM completa. Hospedagens baseadas em containers podem bloquear
namespaces, cgroups ou montagens: nesse caso o provedor precisa liberar esses
recursos. Não há garantia de execução em qualquer VPS ou VM.

O bootstrap instala explicitamente AppArmor, incluindo `apparmor_parser`, mesmo
com pacotes recomendados desativados. Quando o teste real falha, imprime o log
do container, o tipo de virtualização e o kernel. Não desativa AppArmor/seccomp
nem converte containers para privilegiados para contornar restrições.

Se aparecer `forkstart ... exit status 1`, a mensagem sozinha não identifica a
causa. Use o log exibido em seguida; ele permite distinguir falta de ferramenta,
restrição do hospedeiro, erro de montagem e outros problemas. Repetir a instalação
sem corrigir a causa não resolve. Preserve o container `panel-check-*` indicado
até concluir o diagnóstico. A atualização preserva credenciais existentes.

### Falha `newuidmap: write to uid_map failed: Operation not permitted`

Com `systemd-detect-virt` retornando `lxc`, essa falha indica que o kernel recusou
o mapeamento de usuários do container interno. O aviso BPF pode acompanhar a falha,
mas sozinho não comprova que seja a causa fatal. Aumentar RAM ou instalar AppArmor
não corrige a delegação de UIDs/GIDs.

O instalador agora verifica `/proc/self/uid_map`, `/proc/self/gid_map` e as faixas
de root em `/etc/subuid` e `/etc/subgid`, e testa namespaces em um processo
temporário. Um LXC limitado precisa de uma faixa subordinada de pelo menos 65536
IDs inteiramente disponível no namespace atual, para UID e GID. Um ambiente com
apenas IDs 0–65535 não comporta a faixa 1000000–1000999999 do erro observado.
Os IDs da segunda coluna de `uid_map` pertencem ao hospedeiro, não são IDs
disponíveis dentro do container.

Para verificar sem instalar ou alterar serviços, na pasta do projeto:

```bash
sudo python3 deploy/preflight.py
```

Se há IDs delegados suficientes, mas nenhuma faixa de root, prepare as faixas
explicitamente, sem precisar alterar o hospedeiro:

```bash
sudo python3 deploy/preflight.py --prepare-idmaps
sudo systemctl restart incus.service
sudo sh install.sh
```

A opção `--prepare-idmaps` escolhe 10 milhões de IDs já disponíveis no namespace,
evita faixas subordinadas e contas locais existentes, e usa `usermod` para adicionar
somente as faixas ausentes de root. Valida UID e GID antes de alterar os arquivos.
Faixas existentes incompatíveis são preservadas e exigem revisão manual. A opção
não cria delegação no hospedeiro. Reiniciar o daemon faz o Incus reler a configuração;
containers de testes anteriores podem continuar com mapas antigos, por isso o
instalador cria um novo container de teste. Em ambientes com workloads, programe
o reinício com o administrador.

No checkout local com Python e util-linux presentes, essa verificação ocorre antes
do `apt-get`. No bootstrap baixado isoladamente, primeiro são obtidos o código e
as ferramentas mínimas; Incus, rede, armazenamento e painel só são configurados
após a verificação. O caminho direto `deploy/install.py` também a executa.
LXC não é rejeitado apenas pelo tipo de virtualização. A aprovação desses testes
é parcial: montagens, cgroups e o ciclo real do container continuam sendo validados
durante a instalação.

Se houver recusa, o administrador do **hospedeiro** precisa habilitar nesting,
delegar uma faixa suficiente ao container externo e configurar dentro dele faixas
subordinadas compatíveis. Em um hospedeiro Incus, as opções relevantes do container
externo são `security.nesting` e `security.idmap.size`; no LXC/Proxmox a configuração
depende do gerenciador. Aumentar a faixa dentro da VPS sem a delegação externa não
concede acesso. Essas mudanças exigem coordenação com o administrador e podem
exigir reinício do container externo. Como alternativa, use uma VM completa KVM/QEMU.

O instalador padrão não modifica mapas de IDs, containers existentes ou a segurança do
hospedeiro para contornar a falha. A preparação de faixas ausentes é uma opção
explícita e só usa IDs já delegados. Depois de o administrador ajustar a delegação,
repita a pré-verificação e `sudo sh install.sh`; a senha existente é preservada.
Referência: [mapeamento de usuários no Incus](https://linuxcontainers.org/incus/docs/main/userns-idmap/).

## Instalação

O bootstrap instala Incus, Python 3.11+, OpenSSL e ferramentas de rede/usuários.
Requer Linux nativo com systemd (não Android original): Debian 12/13, Ubuntu
24.04/26.04 ou Armbian dessas bases, em amd64/arm64/armhf. Precisa de Internet,
512 MB nominais de RAM (recomendado 1 GB) e 1 GiB livre em `/var` para começar.
O kernel deve suportar containers; o instalador não troca kernel ou firmware.

Após clonar e entrar na pasta, execute:

```bash
sudo sh install.sh
```

O comando detecta o IP LAN pela rota principal. Em equipamentos com múltiplas
interfaces, passe `--address IP_DA_LAN`. A porta padrão é 8444; altere com `--port`.
O terminal mostra URL, login e senha gerada apenas na primeira instalação.
Guarde a senha. O serviço inicia automaticamente após reiniciar a TV Box.

O script usa o checkout local, inclusive alterações não publicadas. Quando
baixado isoladamente, baixa o projeto do GitHub; `INCUS_PANEL_REF` permite
escolher um SHA/tag/branch simples. O comando sem clone está no README e
depende da publicação dessa versão no GitHub.

A instalação confirma HTTPS e leitura autenticada como usuário do serviço.
O bootstrap também testa criação, início, reinício, parada e exclusão de um
Alpine real. O download pode demorar. Se falhar, a instalação retorna erro e
mostra o nome `panel-check-*` para inspeção; não força exclusão com estado incerto.
A imagem baixada permanece em cache. Não usa containers existentes para testes.

Para uma instalação offline do painel em Incus já preparado, o caminho avançado
continua sendo `sudo python3 deploy/install.py`; ele verifica leitura real, mas
não baixa pacotes nem cria um container de teste. Para exigir o teste completo:
`sudo python3 deploy/install.py --verify-container`.

A conexão navegador–painel usa HTTPS com certificado local. Confira o SHA-256
mostrado antes de confiar nesse certificado. O acesso painel–Incus usa somente
`/var/lib/incus/unix.socket`; não é preciso publicar a porta 8443 do Incus.
O administrador do painel controla todos os containers dos Projects descobertos
na instalação. O usuário de sistema `incus-panel` recebe acesso ao grupo do socket.

Use **Containers → Criar container**, informe o nome, escolha a imagem e clique em **Criar container**.
A lista mostra imagens locais e imagens do servidor oficial compatíveis com a
arquitetura. O nome aceita até 63 caracteres com letras, números e hífens (sem
hífen no início ou fim). Nomes já usados são recusados pelo Incus. O painel usa
o profile default e completa disco e rede
com recursos disponíveis quando necessário. O resultado aparece na própria tela:
download/criação, início e confirmação de que o container está em execução. Se
falhar, aparece o motivo retornado pelo Incus. Depois use **Abrir container** e a
aba **Console** para abrir `/bin/sh`. Não há formulário adicional ou confirmação
digitada para criar; confirmações de operações destrutivas continuam exigidas.
A tela dedicada apresenta as etapas e uma barra de progresso: porcentagens
vêm dos metadados do Incus e correspondem à etapa em andamento, não a uma
estimativa do tempo total. Sem porcentagem, a barra indica atividade. O resultado
só chega a concluído após confirmar que o container está executando. É possível
navegar pelo painel e voltar à criação na mesma sessão para continuar acompanhando.
Consultas exibem um indicador de carregamento enquanto aguardam a TV Box.
O console é textual, com entrada por linha. Imagens remotas precisam estar
disponíveis para a arquitetura da TV Box e exigem Internet no equipamento.

Em Incus vazio, o instalador inicializa armazenamento mínimo e adiciona rede NAT
ao profile default quando necessário. Em instalações existentes, usa os profiles,
redes e pools atuais e completa a rede do profile default caso não tenha nenhuma
placa de rede. Sem pool e sem disco raiz no perfil, cria um pool `dir`, sem
formatar discos. Pools existentes indisponíveis exigem correção manual.
O instalador não cria nem altera containers existentes.

Atualização: `git pull` seguido de `sudo sh install.sh`. As versões
ficam em `/opt/incus-panel/releases`, a configuração e os certificados em
`/etc/incus-panel`. Se a nova versão falhar na verificação HTTPS, o instalador
tenta restaurar o serviço e a versão anteriores. Uma configuração anterior de
consulta é recusada para evitar uma mudança de permissões silenciosa.

Diagnóstico:

```bash
sudo systemctl status incus-panel
sudo journalctl -u incus-panel -n 80 --no-pager
sudo incus list
sudo incus profile show default
sudo -u incus-panel sh -c 'cd /opt/incus-panel/current && python3 -m incus_panel.verify --config /etc/incus-panel/config.local.json'
```

Se o painel abrir apenas na própria TV Box, confira o IP usado e o firewall da
LAN para a porta 8444. Falhas de criação aparecem nas tarefas Incus: confira o
alias, a arquitetura, espaço livre e os dispositivos de disco/rede do profile.

O HTTPS negocia TLS em tarefas separadas, com timeout de 5 segundos, e limita
o atendimento simultâneo a oito conexões. Conexões incompletas não bloqueiam a
aceitação de outros clientes. Se o serviço estiver ativo, mas não responder,
confira a fila com `sudo ss -ltnp 'sport = :8444'`. Versões anteriores podiam
ficar bloqueadas negociando TLS antes de aceitar os demais clientes; atualizar
o código e executar o instalador reinicia o serviço com a correção.

Teste local (substitua o IP pelo exibido no instalador):

```bash
sudo curl --noproxy '*' --connect-timeout 5 --max-time 10 --cacert /etc/incus-panel/server.crt -o /dev/null -w 'HTTP %{http_code}\n' https://192.168.0.107:8444/
```

Os testes automatizados cobrem autorização, criação, ciclo de vida e o contrato
HTTP do socket. A CI `incus-real.yml` inclui instalação systemd, teste de container
e reinstalação em Ubuntu. O bootstrap exige o teste real no host de instalação;
os testes em Windows não demonstram compatibilidade do kernel de uma TV Box.

O teste de navegador `scripts/browser-create-smoke.mjs` verifica a seleção única,
criação e início com fixture, ausência de confirmação digitada e erro assíncrono
visível. Use `python tests/create_fixture.py` e um Chromium/Edge de teste com CDP
na porta 9223 antes de executar `node scripts/browser-create-smoke.mjs`.
Essa fixture é simulada e fica exclusivamente em `127.0.0.1:8082`.

## Equipamentos com pouca memória

O socket local ativa o modo leve por padrão, inclusive para configurações antigas
sem a opção `low_resource`. Não há atualização periódica do inventário ou assinatura
de eventos. Use o botão Atualizar. A criação consulta o progresso a cada 5 segundos,
continua em segundo plano e permite apenas uma criação de cada vez.

O catálogo remoto usa apenas o índice de produtos (leitura limitada a 1 MiB), em
vez do histórico completo de versões; oferece Alpine e Debian da arquitetura local.
Novos containers criados pelo botão recebem 128 MiB de RAM e um limite de CPU de
`50ms/100ms`. Não iniciam automaticamente após reboot. Containers anteriores não
são alterados. Aplicações que exigem mais memória podem falhar com esse limite.

Antes da criação, o painel exige `MemAvailable` de pelo menos 256 MiB. Isso é uma
precaução e não uma garantia: o download e a extração rodam no daemon Incus e podem
consumir mais recursos. O serviço do painel tem `CPUQuota=25%`, `MemoryHigh=96M` e
`MemoryMax=160M`; esses limites dependem do suporte a cgroups do equipamento e
não abrangem o daemon Incus. Se o painel atingir seu limite, ele poderá reiniciar.

Se a TV Box cair, não repita imediatamente a criação. Quando recuperar o acesso,
pare o painel e verifique memória e logs da inicialização anterior:

```bash
sudo systemctl stop incus-panel
free -h
sudo journalctl -k -b -1 --no-pager | tail -n 60
incus list
```

Sem esses registros, a causa pode continuar desconhecida; memória, temperatura,
alimentação, armazenamento e kernel precisam ser considerados. Ausência de logs
persistentes pode impedir a consulta do boot anterior. Atualize o código e execute
o instalador para aplicar os limites do serviço; a instalação reinicia o painel.

Tarefas do painel ficam em memória; após reiniciar o serviço, consulte Containers
ou as operações reais do Incus para verificar criações que estavam em andamento.

Referências: [inicialização Incus](https://linuxcontainers.org/incus/docs/main/howto/initialize/),
[API REST](https://linuxcontainers.org/incus/docs/main/rest-api/) e
[permissões do socket](https://linuxcontainers.org/incus/docs/main/packaging/).
