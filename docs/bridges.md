# Bridges e interfaces dos containers

## Uso no painel

Entre como administrador e abra **Nó → Rede** ou `/#networks`. O botão **Criar bridge** leva ao formulário. Clique no nome de uma rede para consultar propriedades, dependências, leases DHCP e editar ou excluir uma bridge gerenciada. A configuração exige `read_only: false` e `manage_networks: true`.

Instalações novas e a demonstração já habilitam a gestão de redes. Atualizações preservam a configuração existente: para habilitar em uma instalação anterior, defina `"manage_networks": true` em `/etc/incus-panel/config.local.json`, mantendo `"read_only": false`, e reinicie `incus-panel`. As permissões continuam limitadas a administradores.

O nome de uma bridge aceita até 15 caracteres: letras, números, hífen e sublinhado. Ao desabilitar IPv4 ou IPv6 com `none`, o formulário também desabilita DHCP e NAT dessa família. Faixas DHCP precisam excluir gateway, rede e broadcast, não podem se sobrepor e exigem DHCP ativo; as faixas IPv6 exigem DHCP stateful. A exclusão fica bloqueada quando houver containers, perfis ou outras dependências, inclusive quando a consulta das dependências falhar.

Em **Container → Rede**, a tabela única reúne configuração e endereços observados. **Adicionar**, **Remover** e **Editar** ficam na barra superior; clicar na linha ou pressionar Enter abre o editor. Espaço e as setas selecionam a interface para usar a barra. O diálogo segue a disposição do Proxmox: nome, MAC, ponte, VLAN e Firewall à esquerda; IPv4/IPv6, CIDR e gateway à direita. **Avançado** revela desconexão, MTU, limite de banda, filtros individuais e **Restaurar do perfil**. O ícone de restauração no título desfaz as edições ainda não salvas.

**OK** aplica a edição diretamente, com revisão concorrente/ETag e acompanhamento de tarefa; remover e restaurar perfil exigem confirmação. A troca de bridge funciona em containers existentes. Uma mudança de rede em um container em execução pode interromper suas conexões; a aceitação da alteração a quente depende do Incus e do tipo de interface.

| Recurso | Comportamento |
|---|---|
| Bridges | Criar, listar, consultar, editar e excluir bridges gerenciadas |
| Endereçamento | IPv4/IPv6 em CIDR, automático ou desabilitado |
| DHCP | Habilitar, faixas, duração de leases e DHCPv6 stateful |
| DNS | Domínio e registro managed/dynamic/none |
| NAT e roteamento | Opções separadas por família IP; regras de firewall do Incus |
| Camada Ethernet | MTU da bridge e multicast snooping |
| Interfaces do CT | Adicionar, trocar bridge, desconectar/reconectar, remover e restaurar configuração herdada |
| Opções da interface | Nome, MAC, MTU, VLAN, banda e filtragem MAC/IPv4/IPv6 |
| Reservas | IPv4/IPv6 via DHCP, com validação da sub-rede, gateway e duplicidade nas configurações |
| Dependências | Containers, perfis e referências informadas pelo Incus bloqueiam exclusão |
| Concorrência | Revisão da tela e ETag evitam sobrescrever alterações concorrentes |
| Tarefas | Respostas síncronas verificadas por nova leitura; operações assíncronas acompanhadas pelo UUID |

Editar uma interface herdada cria uma configuração local no container. Remover uma interface herdada cria um dispositivo `none`; o perfil compartilhado permanece intacto. **Restaurar do perfil** remove a configuração local para voltar à rede do perfil. **Desconectado** usa um dispositivo `none` e guarda a definição da interface em `user.incus-panel.disconnected-nics`, incluindo o MAC gerado quando disponível, para permitir reconexão. Os demais dispositivos, configurações e perfis do container são preservados.

**Estático** fixa o endereço por reserva DHCP da ponte; o campo aceita IP ou CIDR com o prefixo da ponte. O gateway é herdado da ponte e aparece somente para leitura. Reservas dependem do cliente DHCP do container. Configuração estática feita dentro do sistema convidado não é reescrita pelo painel. IPv6 reservado exige DHCPv6 stateful; SLAAC só fica disponível em pontes sem DHCPv6 stateful. Famílias desativadas na ponte aparecem indisponíveis.

**Firewall** corresponde aos filtros anti-spoofing de MAC/IPv4/IPv6 do Incus; os filtros individuais ficam em Avançado. Não representa um conjunto de regras de firewall do Proxmox. O Incus 6.0 não permite filtragem de IP junto com VLAN. O limite de banda do editor usa MB/s, convertido para `limits.max`; VLAN aceita 1–4094. Campos avançados vazios usam o padrão do Incus. MTU individual usa `parent` e `nictype: bridged` para referenciar a ponte gerenciada, pois essa versão não aceita `mtu` junto com `network`.

## Correspondência com Proxmox

O fluxo de gestão de bridge e interfaces segue a organização por nó e container, usando a API e os recursos do Incus. VLAN é configurada na interface do CT. A bridge gerenciada tem ciclo de vida controlado pelo Incus, sem um campo fictício de autostart. Não há edição de `/etc/network/interfaces`, bonds, SDN/OVN, BGP, túneis ou alteração das interfaces físicas do host. Bridges com uplinks externos permanecem protegidas, conforme a restrição de acesso à TV Box descrita no documento de requisitos. Perfis compartilhados são consultados como dependências; sua edição global não integra este formulário.

Referências: [bridges no Incus](https://linuxcontainers.org/incus/docs/main/reference/network_bridge/), [interfaces NIC](https://linuxcontainers.org/incus/docs/main/reference/devices_nic/), [validação de interfaces bridged no Incus 6.0.4](https://github.com/lxc/incus/blob/v6.0.4/internal/server/device/nic_bridged.go) e [editor de rede no Proxmox](https://github.com/proxmox/pve-manager/blob/master/www/manager6/lxc/Network.js).

## Validação de 2026-11-05

No Incus real da TV Box, o código candidato criou uma bridge privada com IPv4 automático, alterou MTU e domínio DNS, criou um container vazio e parado, associou sua interface à bridge e confirmou a configuração diretamente na API. A exclusão da bridge em uso foi recusada. Depois, removeu a interface, restaurou a configuração do perfil e excluiu os recursos descartáveis. Os containers existentes não foram alterados. Este teste não comprova conectividade de um sistema convidado, tráfego VLAN, limitação de banda ou alteração a quente.

Os testes locais cobrem permissões, campos inválidos, preservação de dispositivos, revisões obsoletas, concorrência, DHCP e confirmação de operações síncronas. O smoke DOM executa CRUD de bridge e adiciona/remove interface de um container, além das rotas e regressões existentes.

Na revisão de 2026-11-06, os testes foram ampliados para combinações inválidas de DHCP, faixas sobrepostas, domínios DNS inválidos, reservas IPv6 equivalentes e remoção de configuração não confirmada pelo Incus. O smoke DOM também verifica dependências e bloqueio de exclusão após associar uma interface. Esta revisão não executou novas operações em um Incus real.

Na revisão de 2026-11-07, `scripts/network-editor-review.mjs` exercita clique real na linha, teclado, edição direta, reset, reserva CIDR, filtros, VLAN, desconexão/reconexão, MTU, banda, restauração, criação/remoção e somente leitura em uma fixture isolada. Verifica ainda 12 combinações de tema e tamanho de janela, de 320 a 1920 px. Os testes Python cobrem a preservação e a revisão da definição desconectada, normalização CIDR, compatibilidade de MTU, combinações inválidas e confirmação da gravação. Esta revisão não alterou interfaces de containers reais.
