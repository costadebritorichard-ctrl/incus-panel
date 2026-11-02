"""Gera inventário completo da documentação e registra gates ainda abertos."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent.parent
SCREEN_STATUS={
    'TEL-01':('Parcial','Conexão configurada no servidor; onboarding e vínculo interativo pendentes.'),
    'TEL-02':('Implementado; aceite real pendente','Login, cookie, expiração, CSRF e logout; tests/test_http.py.'),
    'TEL-03':('Parcial','Dashboard real/fixture, recursos disponíveis e storage; CPU percentual host ausente.'),
    'TEL-04':('Parcial','Árvore do escopo atual e seleção persistida; agrupamento global completo pendente.'),
    'TEL-05':('Parcial','Tabela, busca, ordenação e filtro de estado; seleção múltipla não disponível.'),
    'TEL-06':('Implementado; aceite real pendente','Identidade composta, estado e ações condicionais.'),
    'TEL-07':('Parcial','Tabela de RAM, CPU acumulada/limites e discos; rede em aba dedicada. Sem gráficos históricos nem taxas.'),
    'TEL-08':('Implementado; aceite real pendente','Dispositivos expandidos e distinção local/herdado.'),
    'TEL-09':('Parcial','Edição parcial de descrição/limites/autostart/proteção, revisão/ETag e confirmação do Incus; tests/test_edit.py; aceite real pendente.'),
    'TEL-10':('Parcial; aceite real pendente','xterm.js local, exec interativo, teclado/ANSI, resize automático, janela dedicada e encerramento por sessão/navegação; testes de protocolo e DOM com dublês. Validação com Incus real pendente.'),
    'TEL-11':('Parcial','Listar/criar snapshots; restaurar/excluir pendentes.'),
    'TEL-12':('Parcial','Listar/gerar backups; download/restauração pendentes.'),
    'TEL-13':('Parcial; aceite real pendente','Oito etapas, imagem por arquitetura, CPU/RAM, pool/cota suportada, bridge/reserva IPv4, DNS herdado e início opcional. Opções validadas no backend; modalidade restrita usa default.'),
    'TEL-14':('Parcial','Listagem local e download de Alpine/Debian do catálogo por arquitetura, progresso e confirmação no Incus; tests/test_images.py; importação de arquivos/remoção e aceite real pendentes.'),
    'TEL-15':('Parcial','Pools, recursos físicos e alertas 80/90%; API de volumes existe, UI pendente.'),
    'TEL-16':('Parcial','Redes e detalhes JSON; leases e associações dedicadas pendentes.'),
    'TEL-17':('Parcial','Profiles e devices; edição/impacto e filtros aprofundados pendentes.'),
    'TEL-18':('Parcial','Escopos autorizados e seleção; resumo nativo completo de limites pendente.'),
    'TEL-19':('Parcial','Painel inferior recolhível/redimensionável, UUIDs, estado, detalhes e erro; persistência histórica e cancelamento pendentes.'),
    'TEL-20':('Parcial','Alertas de capacidade e falhas; reconhecimento e histórico persistente pendentes.'),
    'TEL-21':('Parcial','Identidade, arquitetura, extensões e cluster; métricas por membro pendentes.'),
    'TEL-22':('Parcial','Sessão, segurança, auditoria temporária; limiares configuráveis pendentes.'),
    'TEL-23':('Opcional/parcial','Seleção de hosts independentes; gestão/métricas de membros de cluster pendentes.'),
    'TEL-24':('Opcional/pendente','Papéis/escopos em configuração; não há editor de identidades.'),
}
RF_NOTES={
    'RF-001':'Transportes e /1.0 implementados; H3 real não acessado.',
    'RF-002':'Arquitetura/extensões consultadas; VM nunca habilitada neste MVP.',
    'RF-003':'Listagem por host/Project com fixture explícita e transporte real.',
    'RF-004':'Árvore do escopo atual; agrupamento global completo pendente.',
    'RF-005':'Instance state e detalhe; tests/test_core.py.',
    'RF-006':'Fonte/timestamp e n/d; sem CPU percentual e histórico.',
    'RF-007':'Sessão e política backend; TLS e pin; testes HTTP e transporte mockado.',
    'RF-008':'UUID validado e acompanhamento terminal; teste de resultado incerto.',
    'RF-009':'Lifecycle na allowlist e com precondições; test_state_precondition.',
    'RF-010':'Eventos TLS, backoff e resync; tests/test_events.py; não testado com Incus real.',
    'RF-011':'Console xterm.js, teclado direto/ANSI, resize e encerramento; tests/test_console.py e scripts/dom-smoke.mjs com dublês; não testado com Incus real.',
    'RF-012':'Normalização de arquitetura e bloqueio frontend/backend.',
    'RF-013':'Assistente por etapas, imagem local/remota compatível e perfil default; CPU/RAM/pool/bridge e início opcional validados. Seleção de outros perfis pelo assistente pendente.',
    'RF-014':'Listagem/criação; restauração/exclusão pendentes.',
    'RF-015':'Listagem/geração; download/restauração pendentes.',
    'RF-016':'Pool resources e 93% por fixture; sem soma lógica Btrfs.',
    'RF-017':'Redes e dispositivos consultáveis; leases/associações dedicadas pendentes.',
    'RF-018':'Allowlist backend por usuário e contexto em todas as chamadas.',
    'RF-019':'Profiles e devices expandidos; leitura sem edição.',
    'RF-020':'Não validado em ARMv7/ARM64/x86-64; protocolo em docs/experimentos.md.',
    'RF-021':'Multi-host de configuração; gestão de cluster fora do MVP.',
}


def load(filename):return json.loads((ROOT/'especificacao'/filename).read_text(encoding='utf-8'))
def flat(items):
    for item in items:
        yield item
        yield from flat(item.get('filhos',[]))
def safe(text):return str(text).replace('|','/').replace('\n',' ')


def generate():
    lines=['# Matriz de rastreabilidade','', 'Gerada por `python scripts/traceability.py`. Implementação local não significa aceite em host real. Todos os gates de hardware e experimento permanecem abertos.','', '## Documentos lidos','', '| Arquivo | SHA-256 |','| --- | --- |']
    for path in sorted((ROOT/'especificacao').glob('*.json')):
        digest = hashlib.sha256(path.read_bytes().replace(b'\r\n', b'\n')).hexdigest()
        lines.append(f'| {path.name} | `{digest}` |')
    lines+=['','## Requisitos funcionais','','| ID / fase | Requisito | Evidência e limite |','| --- | --- | --- |']
    for req in load('03_requisitos_e_qualidade.json')['requisitos_funcionais']:
        lines.append(f"| {req['id']} / {req['fase']} | {safe(req['descricao'])} | {RF_NOTES[req['id']]} |")
    lines+=['','## Telas','','| Tela / WBS | Estado | Evidência e pendência |','| --- | --- | --- |']
    for screen in load('01_telas_e_submodulos.json')['telas']:
        state,note=SCREEN_STATUS[screen['id']]
        lines.append(f"| {screen['id']} / {screen['wbs_pacote']} — {safe(screen['nome'])} | {state} | {note} |")
    lines+=['','## WBS completa','','O inventário abaixo inclui todos os grupos, pacotes e submódulos. O estado das telas é herdado conservadoramente: um teste unitário não aprova sozinho um critério de aceite de integração.','','| ID | Pacote / submódulo | Fase | Estado |','| --- | --- | --- | --- |']
    for item in flat(load('02_wbs_hierarquica.json')['wbs']['grupos']):
        state=SCREEN_STATUS.get(item.get('tela_id'),('Parcial; ver relatório de entrega',''))[0]
        if item['fase']=='F4':state='Protocolo/artefatos; execução real pendente'
        lines.append(f"| {item['id']} | {safe(item['nome'])} | {item['fase']} | {state} |")
    lines+=['','## Aceite e qualidade','','Os testes locais não encerram integralmente CT-001–CT-024. Consulte nomes CT nos testes para os cenários automatizados. CT-009, CT-016, CT-021 e CT-022 dependem de ensaios adicionais/funcionalidades ausentes. CT-024 não oferece botão de cancelamento nesta versão. CT-003/004/010 exigem confirmação contra falhas reais de rede/autorização.','','RNF-01/02/03/05: metas em hardware não medidas. RNF-04: revisão e redaction local, sem auditoria independente. RNF-06: reconexão simulada aprovada, rede real pendente. RNF-07: CSS/labels/foco implementados; QA manual em navegador pendente. Demais RNFs mantêm validação conforme documentação original.','']
    return '\n'.join(lines)


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--check',action='store_true');args=parser.parse_args()
    path=ROOT/'docs'/'rastreabilidade.md';expected=generate()
    if args.check:
        if not path.exists() or path.read_text(encoding='utf-8')!=expected:raise SystemExit('Execute python scripts/traceability.py para atualizar a matriz.')
        print('Rastreabilidade confere com os nove documentos de especificação.')
    else:path.write_text(expected,encoding='utf-8');print(path)


if __name__=='__main__':main()
