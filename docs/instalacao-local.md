# Painel na própria TV Box

Requer Linux com systemd e Incus funcional (não Android puro), Python 3.11 ou
superior, OpenSSL, iproute2 e ferramentas de usuários do Linux. O kernel deve
suportar os containers do Incus. O instalador não instala nem troca o kernel ou
pacotes do Incus. Use o usuário administrador da TV Box com sudo.

Após clonar e entrar na pasta, execute:

```bash
sudo python3 deploy/install.py
```

O comando detecta o IP LAN pela rota principal. Em equipamentos com múltiplas
interfaces, passe `--address IP_DA_LAN`. A porta padrão é 8444; altere com `--port`.
O terminal mostra URL, login e senha gerada apenas na primeira instalação.
Guarde a senha. O serviço inicia automaticamente após reiniciar a TV Box.

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
placa de rede. Um Incus parcialmente configurado sem pool é recusado.
O instalador não cria nem altera containers existentes.

Atualização: `git pull` seguido de `sudo python3 deploy/install.py`. As versões
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
HTTP do socket. A instalação systemd e os containers ainda precisam ser validados
em uma TV Box real; os testes em Windows não demonstram compatibilidade do kernel.

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
