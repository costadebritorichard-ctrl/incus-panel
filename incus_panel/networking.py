"""Validated bridge NIC changes, preserving unrelated instance settings."""
import copy
import hashlib
import ipaddress
import json
import re

from .core import PanelError, name

DISCONNECTED_NICS = 'user.incus-panel.disconnected-nics'


def available_bridge(network):
    """Unmanaged host bridges have no Incus lifecycle status."""
    return network.get('type') == 'bridge' and (
        network.get('managed') is True and network.get('status') == 'Created'
        or network.get('managed') is False and network.get('status') in (None, '', 'Created'))


def bridge_attachment(nic, network):
    nic = copy.deepcopy(nic)
    for key in ('network', 'parent', 'nictype'):
        nic.pop(key, None)
    if not network.get('managed') or nic.get('mtu'):
        # Incus 6 does not accept mtu together with network.
        nic.update(parent=network['name'], nictype='bridged')
    else:
        nic['network'] = network['name']
    nic['type'] = 'nic'
    return nic


def disconnected_nics(instance):
    value = instance.get('config', {}).get(DISCONNECTED_NICS, '{}')
    try:
        data = json.loads(value)
        if not isinstance(data, dict) or len(data) > 64 or any(
                name(key) != key or not isinstance(nic, dict) or nic.get('type') != 'nic'
                for key, nic in data.items()):
            raise ValueError()
        return data
    except (ValueError, TypeError, PanelError) as exc:
        raise PanelError(409, 'A configuração das interfaces desconectadas está inválida. Revise antes de alterar a rede.') from exc


def devices_revision(instance):
    value = {k: instance.get(k, {}) for k in ('devices', 'expanded_devices', 'profiles')}
    value['disconnected_nics'] = instance.get('config', {}).get(DISCONNECTED_NICS, '')
    return hashlib.sha256(json.dumps(value, sort_keys=True).encode()).hexdigest()


def nic_payload(client, project, target, instance, action, body):
    if set(body) - {'host', 'project', 'target', 'action', 'confirmation', 'name', 'device', 'nic', 'revision'}:
        raise PanelError(400, 'Campos extras não são aceitos no editor de interface.')
    if body.get('revision') != devices_revision(instance):
        raise PanelError(409, 'As interfaces ou perfis mudaram. Atualize antes de salvar.')
    device = name(body.get('device'))
    local = copy.deepcopy(instance.get('devices', {}))
    disconnected = disconnected_nics(instance)
    expanded = instance.get('expanded_devices', {})
    old = expanded.get(device, local.get(device))
    profiles = client.request('GET', '/1.0/profiles', project)['metadata']
    inherited = {}
    for profile_name in instance.get('profiles', []):
        profile = next((p for p in profiles if p['name'] == profile_name), None)
        if profile is None:
            raise PanelError(409, 'Perfil não disponível para verificar a interface herdada.')
        inherited.update(profile.get('devices', {}))
    if old and old.get('type') == 'none':
        old = disconnected.get(device, inherited.get(device, old))
    if action == 'nic-add':
        if device in expanded or device in local:
            raise PanelError(409, 'Já existe um dispositivo com esse nome.')
    elif old is None or old.get('type') not in ('nic', 'none'):
        raise PanelError(400, 'Selecione uma interface de rede existente.')
    if action == 'nic-reset':
        if device not in local:
            raise PanelError(400, 'Não existe configuração local para remover.')
        if inherited.get(device, {}).get('type') != 'nic':
            raise PanelError(400, 'Esta interface não possui uma configuração herdada de rede.')
        local.pop(device)
        disconnected.pop(device, None)
    elif action == 'nic-delete':
        if device in inherited:
            local[device] = {'type': 'none'}
        else:
            local.pop(device, None)
        disconnected.pop(device, None)
    else:
        values = body.get('nic')
        allowed = {'network', 'name', 'hwaddr', 'mtu', 'ipv4.address', 'ipv6.address', 'vlan', 'limits.max',
                   'security.mac_filtering', 'security.ipv4_filtering', 'security.ipv6_filtering', 'disconnected'}
        if not isinstance(values, dict) or set(values) - allowed or any(not isinstance(v, str) for v in values.values()):
            raise PanelError(400, 'Configuração da interface inválida.')
        values = {k: v.strip() for k, v in values.items()}
        is_disconnected = values.pop('disconnected', 'false')
        if is_disconnected not in ('true', 'false'):
            raise PanelError(400, 'O estado desconectado deve estar ativado ou desativado.')
        network_name = name(values.get('network'))
        network = client.request('GET', '/1.0/networks/' + network_name, project)['metadata']
        if not available_bridge(network):
            raise PanelError(400, 'Selecione uma bridge disponível, gerenciada pelo Incus ou externa.')
        nic = copy.deepcopy(old) if old and old.get('type') == 'nic' else {}
        previous_network = nic.get('network') or nic.get('parent')
        for key in ('parent', 'nictype'):
            nic.pop(key, None)
        # Switching networks discards reservations from the previous subnet.
        if previous_network != network_name:
            for key in ('ipv4.address', 'ipv6.address'):
                nic.pop(key, None)
            if not network.get('managed'):
                for key in ('security.ipv4_filtering', 'security.ipv6_filtering'):
                    nic.pop(key, None)
        for key, value in values.items():
            if value:
                nic[key] = value
            else:
                nic.pop(key, None)
        nic = bridge_attachment(nic, network)
        nic.setdefault('name', device)
        if is_disconnected == 'true' and not nic.get('hwaddr'):
            generated_mac = instance.get('config', {}).get('volatile.' + device + '.hwaddr')
            if generated_mac:
                nic['hwaddr'] = generated_mac
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,14}', nic['name']):
            raise PanelError(400, 'Nome da interface deve ter até 15 caracteres válidos.')
        if any(k != device and d.get('type') == 'nic' and d.get('name', k) == nic['name'] for k, d in expanded.items()):
            raise PanelError(409, 'Outra interface usa esse nome dentro do container.')
        if nic.get('hwaddr') and (not re.fullmatch(r'(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}', nic['hwaddr']) or int(nic['hwaddr'][:2], 16) & 1):
            raise PanelError(400, 'Endereço MAC unicast inválido.')
        for key, minimum, maximum in (('mtu', 1280, 9000), ('vlan', 1, 4094)):
            if nic.get(key) and (not nic[key].isdecimal() or not minimum <= int(nic[key]) <= maximum):
                raise PanelError(400, 'Valor inválido para ' + key + '.')
        if nic.get('limits.max') and not re.fullmatch(r'[1-9][0-9]{0,8}(?:kbit|Mbit|Gbit)', nic['limits.max']):
            raise PanelError(400, 'Limite de rede inválido. Exemplo: 100Mbit.')
        for key in allowed:
            if key.startswith('security.') and key in nic and nic[key] not in ('true', 'false'):
                raise PanelError(400, 'Filtragem deve estar ativada ou desativada.')
        if nic.get('vlan') and any(nic.get(key) == 'true' for key in ('security.ipv4_filtering', 'security.ipv6_filtering')):
            raise PanelError(400, 'O Incus não permite filtragem de IP junto com VLAN nesta interface.')
        for family in ('ipv4', 'ipv6'):
            value = nic.get(family + '.address')
            if not network.get('managed'):
                filtering = nic.get('security.' + family + '_filtering') == 'true'
                if bool(value) != filtering:
                    raise PanelError(400, 'Bridge externa não oferece reserva DHCP pelo Incus. Para filtrar ' + family + ', informe o IP permitido e ative a filtragem; configure o endereço no container ou no roteador.')
                if value and value != 'none':
                    try:
                        address = ipaddress.ip_address(value)
                        if address.version != (4 if family == 'ipv4' else 6) or address.is_multicast or address.is_unspecified:
                            raise ValueError()
                    except ValueError as exc:
                        raise PanelError(400, 'IP permitido inválido para o filtro ' + family + ' da bridge externa; informe somente o endereço, sem CIDR.') from exc
                    nic[family + '.address'] = str(address)
                continue
            if not value:
                continue
            if value == 'none':
                if nic.get('security.' + family + '_filtering') != 'true':
                    raise PanelError(400, 'Desativar ' + family + ' exige filtragem dessa família no Incus.')
                continue
            config = network.get('config', {})
            try:
                subnet = ipaddress.ip_interface(config.get(family + '.address', ''))
                if '/' in value:
                    requested = ipaddress.ip_interface(value)
                    if requested.network.prefixlen != subnet.network.prefixlen:
                        raise ValueError()
                    address = requested.ip
                else:
                    address = ipaddress.ip_address(value)
                if address.version != (4 if family == 'ipv4' else 6) or address not in subnet.network or address == subnet.ip:
                    raise ValueError()
                if address.version == 4 and address in (subnet.network.network_address, subnet.network.broadcast_address):
                    raise ValueError()
            except ValueError as exc:
                raise PanelError(400, 'Reserva ' + family + ' deve ser um endereço livre da sub-rede, com o prefixo da ponte e diferente do gateway.') from exc
            nic[family + '.address'] = str(address)
            if config.get(family + '.dhcp') == 'false' or (family == 'ipv6' and config.get('ipv6.dhcp.stateful') != 'true'):
                raise PanelError(400, 'A reserva exige DHCP habilitado; IPv6 exige DHCP stateful.')
            instances = client.request('GET', '/1.0/instances', project)['metadata']
            for other in instances:
                for key, other_nic in other.get('expanded_devices', {}).items():
                    if other.get('name') == target and key == device:
                        continue
                    other_value = other_nic.get(family + '.address')
                    if (other_nic.get('network') or other_nic.get('parent')) == network_name and other_value and other_value != 'none':
                        try:
                            duplicate = ipaddress.ip_address(other_value) == address
                        except ValueError:
                            duplicate = False
                        if duplicate:
                            raise PanelError(409, 'Endereço reservado para outra interface.')
        if is_disconnected == 'true':
            disconnected[device] = nic
            local[device] = {'type': 'none'}
        else:
            disconnected.pop(device, None)
            local[device] = nic
    payload = {k: copy.deepcopy(instance[k]) for k in ('architecture', 'config', 'description', 'ephemeral', 'profiles') if k in instance}
    config = payload.setdefault('config', {})
    if disconnected:
        config[DISCONNECTED_NICS] = json.dumps(disconnected, sort_keys=True)
    else:
        config.pop(DISCONNECTED_NICS, None)
    payload['devices'] = local
    return payload
