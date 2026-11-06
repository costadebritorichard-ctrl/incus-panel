"""Validated managed-bridge NIC changes, preserving unrelated instance settings."""
import copy
import hashlib
import ipaddress
import json
import re

from .core import PanelError, name


def devices_revision(instance):
    return hashlib.sha256(json.dumps({k: instance.get(k, {}) for k in
        ('devices', 'expanded_devices', 'profiles')}, sort_keys=True).encode()).hexdigest()


def nic_payload(client, project, target, instance, action, body):
    if set(body) - {'host', 'project', 'target', 'action', 'confirmation', 'name', 'device', 'nic', 'revision'}:
        raise PanelError(400, 'Campos extras não são aceitos no editor de interface.')
    if body.get('revision') != devices_revision(instance):
        raise PanelError(409, 'As interfaces ou perfis mudaram. Atualize antes de salvar.')
    device = name(body.get('device'))
    local = copy.deepcopy(instance.get('devices', {}))
    expanded = instance.get('expanded_devices', {})
    old = expanded.get(device, local.get(device))
    profiles = client.request('GET', '/1.0/profiles', project)['metadata']
    inherited = {}
    for profile_name in instance.get('profiles', []):
        profile = next((p for p in profiles if p['name'] == profile_name), None)
        if profile is None:
            raise PanelError(409, 'Perfil não disponível para verificar a interface herdada.')
        inherited.update(profile.get('devices', {}))
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
    elif action == 'nic-delete':
        if device in inherited:
            local[device] = {'type': 'none'}
        else:
            local.pop(device, None)
    else:
        values = body.get('nic')
        allowed = {'network', 'name', 'hwaddr', 'mtu', 'ipv4.address', 'ipv6.address', 'vlan', 'limits.max',
                   'security.mac_filtering', 'security.ipv4_filtering', 'security.ipv6_filtering'}
        if not isinstance(values, dict) or set(values) - allowed or any(not isinstance(v, str) for v in values.values()):
            raise PanelError(400, 'Configuração da interface inválida.')
        values = {k: v.strip() for k, v in values.items()}
        network_name = name(values.get('network'))
        network = client.request('GET', '/1.0/networks/' + network_name, project)['metadata']
        if not network.get('managed') or network.get('type') != 'bridge' or network.get('status') != 'Created':
            raise PanelError(400, 'Selecione uma bridge gerenciada disponível.')
        nic = copy.deepcopy(old) if old and old.get('type') == 'nic' else {}
        for key in ('parent', 'nictype'):
            nic.pop(key, None)
        # Switching networks discards reservations from the previous subnet.
        if nic.get('network') != network_name:
            for key in ('ipv4.address', 'ipv6.address'):
                nic.pop(key, None)
        for key, value in values.items():
            if value:
                nic[key] = value
            else:
                nic.pop(key, None)
        nic['type'] = 'nic'
        nic.setdefault('name', device)
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,14}', nic['name']):
            raise PanelError(400, 'Nome da interface deve ter até 15 caracteres válidos.')
        if any(k != device and d.get('type') == 'nic' and d.get('name', k) == nic['name'] for k, d in expanded.items()):
            raise PanelError(409, 'Outra interface usa esse nome dentro do container.')
        if nic.get('hwaddr') and (not re.fullmatch(r'(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}', nic['hwaddr']) or int(nic['hwaddr'][:2], 16) & 1):
            raise PanelError(400, 'Endereço MAC unicast inválido.')
        for key, minimum, maximum in (('mtu', 1280, 9000), ('vlan', 0, 4094)):
            if nic.get(key) and (not nic[key].isdecimal() or not minimum <= int(nic[key]) <= maximum):
                raise PanelError(400, 'Valor inválido para ' + key + '.')
        if nic.get('limits.max') and not re.fullmatch(r'[1-9][0-9]{0,8}(?:kbit|Mbit|Gbit)', nic['limits.max']):
            raise PanelError(400, 'Limite de rede inválido. Exemplo: 100Mbit.')
        for key in allowed:
            if key.startswith('security.') and key in nic and nic[key] not in ('true', 'false'):
                raise PanelError(400, 'Filtragem deve estar ativada ou desativada.')
        for family in ('ipv4', 'ipv6'):
            value = nic.get(family + '.address')
            if not value or value == 'none':
                continue
            config = network.get('config', {})
            try:
                address = ipaddress.ip_address(value)
                subnet = ipaddress.ip_interface(config.get(family + '.address', ''))
                if address.version != (4 if family == 'ipv4' else 6) or address not in subnet.network or address == subnet.ip:
                    raise ValueError()
                if address.version == 4 and address in (subnet.network.network_address, subnet.network.broadcast_address):
                    raise ValueError()
            except ValueError as exc:
                raise PanelError(400, 'Reserva ' + family + ' deve ser um endereço livre da sub-rede, diferente do gateway.') from exc
            if config.get(family + '.dhcp') == 'false' or (family == 'ipv6' and config.get('ipv6.dhcp.stateful') != 'true'):
                raise PanelError(400, 'A reserva exige DHCP habilitado; IPv6 exige DHCP stateful.')
            instances = client.request('GET', '/1.0/instances', project)['metadata']
            for other in instances:
                for key, other_nic in other.get('expanded_devices', {}).items():
                    if other.get('name') == target and key == device:
                        continue
                    other_value = other_nic.get(family + '.address')
                    if other_nic.get('network') == network_name and other_value and other_value != 'none':
                        try:
                            duplicate = ipaddress.ip_address(other_value) == address
                        except ValueError:
                            duplicate = False
                        if duplicate:
                            raise PanelError(409, 'Endereço reservado para outra interface.')
        local[device] = nic
    payload = {k: copy.deepcopy(instance[k]) for k in ('architecture', 'config', 'description', 'ephemeral', 'profiles') if k in instance}
    payload['devices'] = local
    return payload
