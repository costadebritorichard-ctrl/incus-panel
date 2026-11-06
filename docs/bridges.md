# Bridges e interfaces dos containers

## Uso no painel

Entre como administrador e abra **Nó → Rede** ou `/#networks`. O botão **Criar bridge** leva ao formulário. Clique no nome de uma rede para consultar propriedades, dependências, leases DHCP e editar ou excluir uma bridge gerenciada. A configuração exige `read_only: false` e `manage_networks: true`.

Instalações novas e a demonstração já habilitam a gestão de redes. Atualizações preservam a configuração existente: para habilitar em uma instalação anterior, defina `"manage_networks": true` em `/etc/incus-panel/config.local.json`, mantendo `"read_only": false`, e reinicie `incus-panel`. As permissões continuam limitadas a administradores.

O nome de uma bridge aceita até 15 caracteres: letras, números, hífen e sublinhado. Ao desabilitar IPv4 ou IPv6 com `none`, o formulário também desabilita DHCP e NAT dessa família. Faixas DHCP precisam excluir gateway, rede e broadcast, não podem se sobrepor e exigem DHCP ativo; as faixas IPv6 exigem DHCP stateful. A exclusão fica bloqueada quando houver containers, perfis ou outras dependências, inclusive quando a consulta das dependências falhar.

Em **Container → Rede → Gerenciar interfaces**, use **Adicionar interface**, **Editar**, **Remover** e **Restaurar perfil**. A troca de bridge funciona em containers existentes. A alteração é enviada imediatamente ao Incus, com revisão concorrente/ETag, confirmação e acompanhamento de tarefa. Uma mudança de rede em um container em execução pode interromper suas conexões; a aceitação da alteração a quente depende do Incus e do tipo de interface.

| Recurso | Comportamento |
|---|---|
| Bridges | Criar, listar, consultar, editar e excluir bridges gerenciadas |
| Endereçamento | IPv4/IPv6 em CIDR, automático ou desabilitado |
| DHCP | Habilitar, faixas, duração de leases e DHCPv6 stateful |
| DNS | Domínio e registro managed/dynamic/none |
| NAT e roteamento | Opções separadas por família IP; regras de firewall do Incus |
| Camada Ethernet | MTU da bridge e multicast snooping |
| Interfaces do CT | Adicionar, trocar bridge, remover e restaurar configuração herdada |
| Opções da interface | Nome, MAC, MTU, VLAN, banda e filtragem MAC/IPv4/IPv6 |
| Reservas | IPv4/IPv6 via DHCP, com validação da sub-rede, gateway e duplicidade nas configurações |
| Dependências | Containers, perfis e referências informadas pelo Incus bloqueiam exclusão |
| Concorrência | Revisão da tela e ETag evitam sobrescrever alterações concorrentes |
| Tarefas | Respostas síncronas verificadas por nova leitura; operações assíncronas acompanhadas pelo UUID |

Editar uma interface herdada cria uma configuração local no container. Remover uma interface herdada cria um dispositivo `none`; o perfil compartilhado permanece intacto. **Restaurar perfil** remove a configuração local para voltar à rede do perfil. Os demais dispositivos, configurações e perfis do container são preservados.

Reservas dependem do cliente DHCP do container. Configuração estática feita dentro do sistema convidado não é reescrita pelo painel. IPv6 reservado exige DHCPv6 stateful. O limite de banda aceita, por exemplo, `100Mbit`; VLAN aceita 0–4094. Campos avançados vazios usam o padrão do Incus.

## Correspondência com Proxmox

O fluxo de gestão de bridge e interfaces segue a organização por nó e container, usando a API e os recursos do Incus. VLAN é configurada na interface do CT. A bridge gerenciada tem ciclo de vida controlado pelo Incus, sem um campo fictício de autostart. Não há edição de `/etc/network/interfaces`, bonds, SDN/OVN, BGP, túneis ou alteração das interfaces físicas do host. Bridges com uplinks externos permanecem protegidas, conforme a restrição de acesso à TV Box descrita no documento de requisitos. Perfis compartilhados são consultados como dependências; sua edição global não integra este formulário.

Referências: [bridges no Incus](https://linuxcontainers.org/incus/docs/main/reference/network_bridge/), [interfaces NIC](https://linuxcontainers.org/incus/docs/main/reference/devices_nic/) e [rede no Proxmox](https://github.com/proxmox/pve-docs/blob/master/pve-network.adoc).

## Validação de 2026-11-05

No Incus real da TV Box, o código candidato criou uma bridge privada com IPv4 automático, alterou MTU e domínio DNS, criou um container vazio e parado, associou sua interface à bridge e confirmou a configuração diretamente na API. A exclusão da bridge em uso foi recusada. Depois, removeu a interface, restaurou a configuração do perfil e excluiu os recursos descartáveis. Os containers existentes não foram alterados. Este teste não comprova conectividade de um sistema convidado, tráfego VLAN, limitação de banda ou alteração a quente.

Os testes locais cobrem permissões, campos inválidos, preservação de dispositivos, revisões obsoletas, concorrência, DHCP e confirmação de operações síncronas. O smoke DOM executa CRUD de bridge e adiciona/remove interface de um container, além das rotas e regressões existentes.

Na revisão de 2026-11-06, os testes foram ampliados para combinações inválidas de DHCP, faixas sobrepostas, domínios DNS inválidos, reservas IPv6 equivalentes e remoção de configuração não confirmada pelo Incus. O smoke DOM também verifica dependências e bloqueio de exclusão após associar uma interface. Esta revisão não executou novas operações em um Incus real.
