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

Use **Containers → Criar container**, escolha um nome e profile e informe um alias
do servidor oficial de imagens, por exemplo `debian/12`. O campo remoto tem
prioridade: deixe-o vazio para usar uma imagem local. Confirme o destino exibido.
A tarefa acompanha o download/criação, e o container criado fica parado. Abra-o
e clique em **Iniciar**; depois use a aba **Console** para abrir `/bin/sh`.
O console é textual, com entrada por linha. Imagens remotas precisam estar
disponíveis para a arquitetura da TV Box e exigem Internet no equipamento.

Em Incus vazio, o instalador inicializa armazenamento mínimo e adiciona rede NAT
ao profile default quando necessário. Em instalações existentes, usa os profiles,
redes e pools atuais. Um Incus parcialmente configurado sem pool é recusado.
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

Os testes automatizados cobrem autorização, criação, ciclo de vida e o contrato
HTTP do socket. A instalação systemd e os containers ainda precisam ser validados
em uma TV Box real; os testes em Windows não demonstram compatibilidade do kernel.

Referências: [inicialização Incus](https://linuxcontainers.org/incus/docs/main/howto/initialize/),
[API REST](https://linuxcontainers.org/incus/docs/main/rest-api/) e
[permissões do socket](https://linuxcontainers.org/incus/docs/main/packaging/).
