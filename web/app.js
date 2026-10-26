'use strict';
const $ = s => document.querySelector(s);
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value !== null && value !== undefined) node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
};
let session, host, project, generation = 0, pendingAction, timer, expiryTimer, busy = false, consoleId, consoleTimer;
let eventTimer,eventVersion;
const tasks = new Map();
const pages = [ ['overview','◫','Visão geral'],['instances','▣','Containers'],['images','◇','Imagens'],['storage','▤','Armazenamento'],['networks','⌘','Redes'],['profiles','☷','Profiles'],['projects','▱','Projects'],['tasks','◷','Tarefas'],['alerts','△','Alertas'],['server','▧','Servidor'],['settings','⚙','Configurações'] ];
const fmt = n => n === null || n === undefined ? 'n/d' : new Intl.NumberFormat('pt-BR', {maximumFractionDigits:1}).format(n);
const bytes = n => n === null || n === undefined ? 'n/d' : n >= 1073741824 ? fmt(n/1073741824)+' GiB' : fmt(n/1048576)+' MiB';
const date = n => n ? new Date(typeof n === 'number' ? n*1000 : n).toLocaleString('pt-BR') : 'n/d';
const transportLabel = () => session?.hosts.find(h=>h.id===host)?.transport==='ssh'?'SSH verificado':'TLS verificado';
const badge = (text, cls='') => el('span',{class:'badge '+cls},text);
const status = text => el('span',{class:'status '+String(text).toLowerCase()},({'Running':'Em execução','Stopped':'Parado','Success':'Concluída','Failure':'Falhou','Running operation':'Em andamento'})[text] || text || 'Desconhecido');
const json = value => el('pre',{},JSON.stringify(value,null,2));
const panel = (title, content, action) => el('section',{class:'panel'},el('div',{class:'panel-head'},el('h2',{},title),action),content);
const empty = text => el('div',{class:'empty'},text);
const kv = pairs => el('dl',{class:'key-values'},pairs.map(([k,v])=>el('div',{},el('dt',{},k),el('dd',{},v ?? 'n/d'))));
function table(headers, rows) { return el('div',{class:'table-wrap'},rows.length ? el('table',{},el('thead',{},el('tr',{},headers.map(h=>el('th',{},h)))),el('tbody',{},rows.map(r=>el('tr',{},r.map(c=>el('td',{},c)))))) : empty('Nenhum recurso encontrado neste escopo.')); }
function notice(text, critical=false) { return el('div',{class:'alert'+(critical?' critical':'')},text); }
function errorNode(error) { return notice((error.status===403?'Sem permissão. ':error.status===503?'Desconectado. ':'')+error.message,true); }
async function api(path, body) {
  const response = await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-CSRF-Token':session?.csrf || ''}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result = await response.json();
  if (!response.ok) {
    if (response.status===401 && path!=='/api/login') logoutLocal();
    throw Object.assign(new Error(result.error || 'Falha na solicitação.'),{status:response.status});
  }
  return result;
}
async function read(resource,target,scope={host,project}) {
  return api('/api/read?'+new URLSearchParams({...scope,resource,...(target?{target}:{})}));
}
function route() { const [page='overview',target='',tab='summary'] = location.hash.slice(1).split('/').map(decodeURIComponent); return {page,target,tab}; }
function instanceLink(name, tab='summary') { return '#instance/'+encodeURIComponent(name)+'/'+tab; }
function canMutate(target) { return !session.read_only && session.role!=='observador' && (session.mutable_instances?.[host]?.[project] || []).includes(target); }
function actionButton(label, action, target, extra={}) { return el('button',{disabled:canMutate(target)?null:'',onclick:()=>openAction(action,target,extra)},label); }
function openAction(action,target,extra={}) {
  pendingAction={host,project,action,target,...extra};
  $('#action-title').textContent=({start:'Iniciar container',stop:'Parar container',restart:'Reiniciar container',delete:'Excluir container permanentemente',create:'Criar container',snapshot:'Criar snapshot',backup:'Gerar backup',console:'Abrir shell interativo'})[action];
  $('#action-description').textContent= action==='console'?'Este acesso abre /bin/sh, normalmente como root dentro do container. Comandos podem alterar ou apagar dados.':action==='delete'?'A exclusão remove permanentemente o container e seus snapshots.':action==='snapshot'||action==='backup'?'A operação consome armazenamento. Blocos compartilhados não representam espaço recuperável garantido.':'Revise o destino. O resultado será confirmado pela operação Incus.';
  $('#action-review').textContent=JSON.stringify(pendingAction,null,2);
  $('#confirmation').value=''; $('#confirmation').placeholder=`${host}/${project}/${target}`;
  $('#name-label').hidden=!['snapshot','backup'].includes(action);
  $('#artifact-name').required=!$('#name-label').hidden;
  $('#artifact-name').value=''; $('#action-error').textContent='';
  $('#confirm').showModal(); $('#confirmation').focus();
}
$('#cancel-action').onclick=()=>$('#confirm').close();
$('#action-form').onsubmit=async event=>{
  event.preventDefault(); $('#submit-action').disabled=true;
  try {
    if(pendingAction.action==='console'){
      const result=await api('/api/console/start',{...pendingAction,confirmation:$('#confirmation').value});
      consoleId=result.console;$('#confirm').close();pollConsole();return;
    }
    const data=await api('/api/action',{...pendingAction,confirmation:$('#confirmation').value,name:$('#artifact-name').value});
    tasks.set(`${pendingAction.host}/${pendingAction.project}/${data.operation}`,{...pendingAction,id:data.operation,status:'Aguardando confirmação',status_code:100});
    $('#confirm').close(); await render();
  } catch(error) { $('#action-error').textContent=error.message; }
  finally { $('#submit-action').disabled=false; }
};
function logoutLocal() {
  closeConsole();
  session=null; generation++; clearTimeout(timer); clearTimeout(expiryTimer); clearTimeout(eventTimer); tasks.clear(); $('#content').replaceChildren(); $('#tree').replaceChildren(); $('#shell').hidden=true; $('#login').hidden=false;
  if($('#confirm').open) $('#confirm').close();
}
$('#logout').onclick=async()=>{try{await api('/api/logout',{});}finally{logoutLocal();}};
$('#login-form').onsubmit=async event=>{
  event.preventDefault(); $('#login-error').textContent=''; const form=event.target; const button=form.querySelector('button'); button.disabled=true;
  try { session=await api('/api/login',Object.fromEntries(new FormData(form))); form.reset(); enter(); }
  catch(error) { $('#login-error').textContent=error.message; }
  finally { button.disabled=false; }
};
function enter() {
  clearTimeout(expiryTimer); expiryTimer=setTimeout(logoutLocal,Math.max(0,session.expires*1000-Date.now()));
  $('#login').hidden=true; $('#shell').hidden=false; $('#identity').textContent=`${session.username} · ${session.role}`;
  $('#mode').textContent=session.demo?'DEMONSTRAÇÃO':session.read_only?'SOMENTE LEITURA':'LABORATÓRIO';
  $('#host').replaceChildren(...session.hosts.map(h=>el('option',{value:h.id},h.alias)));
  let remembered;try{remembered=JSON.parse(localStorage.getItem('incus-scope')||'null');}catch{remembered=null;}
  host=session.hosts.some(h=>h.id===remembered?.host)?remembered.host:session.hosts[0]?.id;
  if(!host){$('#content').replaceChildren(empty('Nenhum host autorizado.'));return;}
  $('#host').value=host; fillProjects(remembered?.project); render();
}
function fillProjects(preferred) {
  const projects=session.scopes[host]||[];
  project=projects.includes(preferred)?preferred:projects[0];
  $('#project').replaceChildren(...projects.map(p=>el('option',{value:p},p))); $('#project').value=project;
  localStorage.setItem('incus-scope',JSON.stringify({host,project}));
  eventVersion=undefined;clearTimeout(eventTimer);eventTimer=setTimeout(pollEvents,2000);
}
$('#host').onchange=()=>{closeConsole();host=$('#host').value;fillProjects();render();};
$('#project').onchange=()=>{closeConsole();project=$('#project').value;localStorage.setItem('incus-scope',JSON.stringify({host,project}));eventVersion=undefined;clearTimeout(eventTimer);eventTimer=setTimeout(pollEvents,2000);render();};
$('#refresh').onclick=()=>{closeConsole();render();}; $('#tree-view').onchange=()=>render();
window.addEventListener('hashchange',()=>{closeConsole();if(session)render();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&session&&!consoleId)render();});
function instanceTable(items) {
  return table(['CONTAINER','ESTADO','ARQUITETURA','PROFILES','PROJECT'],items.map(i=>[el('a',{href:instanceLink(i.name)},'▣  '+i.name),status(i.status),i.architecture || 'n/d',(i.profiles||[]).join(', '),project]));
}
function filteredInstances(items) {
  const input=el('input',{placeholder:'Buscar container, estado ou arquitetura…','aria-label':'Buscar containers'});
  const filter=el('select',{'aria-label':'Filtrar estado'},el('option',{value:''},'Todos os estados'),el('option',{value:'Running'},'Em execução'),el('option',{value:'Stopped'},'Parados'));
  const sort=el('select',{'aria-label':'Ordenar containers'},el('option',{value:'name'},'Ordenar por nome'),el('option',{value:'status'},'Ordenar por estado'));
  const holder=el('div');
  function update(){const term=input.value.toLowerCase();holder.replaceChildren(instanceTable(items.filter(i=>(!filter.value||i.status===filter.value)&&[i.name,i.status,i.architecture].join(' ').toLowerCase().includes(term)).sort((a,b)=>String(a[sort.value]).localeCompare(String(b[sort.value])))));}
  input.oninput=update;filter.onchange=update;sort.onchange=update;update();
  return el('div',{},el('div',{class:'toolbar'},input,filter,sort,el('a',{href:'#create'},el('button',{},'+ Criar container'))),panel('Containers do Project',holder));
}
async function render() {
  if(!session)return;
  clearTimeout(timer); const id=++generation; const scope={host,project}; const r=route(); busy=true;
  const title=pages.find(p=>p[0]===r.page)?.[2] || (r.page==='instance'?r.target:r.page==='create'?'Criar container':'Página não encontrada');
  $('#title').textContent=title; $('#breadcrumb').textContent=`${host} / ${project} / ${title}`;
  $('#subtitle').textContent=r.page==='instance'?`${host} / ${project} / ${r.target}`:'Acompanhe a infraestrutura do seu laboratório.';
  $('#navigation').replaceChildren(...pages.map(([key,icon,label])=>el('a',{href:'#'+key,class:r.page===key?'active':''},el('span',{},icon),label)));
  $('#banner').hidden=!session.demo; $('#banner').textContent='DEMONSTRAÇÃO · Todos os dados e operações são simulados em memória. Nada é enviado a um servidor Incus real.';
  $('#connection').textContent='Consultando Incus…'; $('#content').setAttribute('aria-busy','true');
  const container=el('div');
  try {
    const [serverResult, instancesResult]=await Promise.allSettled([read('server',undefined,scope),read('instances',undefined,scope)]);
    if(id!==generation||!session)return;
    if(serverResult.status==='rejected')throw serverResult.reason;
    if(instancesResult.status==='rejected')throw instancesResult.reason;
    const server=serverResult.value.data, instances=instancesResult.value.data;
    $('#tree').replaceChildren(el('a',{href:'#server'},'▧ '+(server.environment?.server_name||host)),el('a',{href:'#projects'},'▱ '+project),...instances.map(i=>el('a',{class:'leaf',href:instanceLink(i.name)},(i.status==='Running'?'● ':'○ ')+i.name)));
    if($('#tree-view').value==='project')$('#tree').prepend(el('small',{},'Agrupamento: '+project+' → '+host));
    if(r.page==='overview') {
      const running=instances.filter(i=>i.status==='Running').length;
      const resources=await read('resources',undefined,scope).catch(error=>({error}));
      const memory=resources.data?.memory;
      const cards=[['Containers',instances.length,`${running} em execução · ${instances.filter(i=>i.status==='Stopped').length} parados`],['Memória do host',bytes(memory?.used),memory?'de '+bytes(memory.total):'Fonte indisponível ou não autorizada'],['Arquitetura',server.environment?.kernel_architecture||'n/d','Containers LXC · sem criação de VM'],['Incus',server.environment?.server_version||'n/d',server.environment?.server_clustered?'Cluster configurado':'Servidor standalone']];
      container.append(el('div',{class:'cards'},cards.map(([label,value,note])=>el('div',{class:'card'},el('div',{class:'label'},label),el('div',{class:'value'},value),el('div',{class:'note'},note)))));
      container.append(el('div',{class:'grid'},panel('Containers',instanceTable(instances),el('a',{href:'#instances'},'Ver todos ↗')),panel('Identidade do servidor',el('div',{class:'panel-body'},kv([['Servidor',server.environment?.server_name],['Project',project],['Conexão',session.demo?'Fixture explícita':transportLabel()],['Atualização','A cada 15 s, com aba visível']])))));
      if(resources.error)container.append(errorNode(resources.error));
      container.append(await storageView(scope,true));
    } else if(r.page==='instances') container.append(filteredInstances(instances));
    else if(r.page==='instance') container.append(await detail(r,scope));
    else if(r.page==='storage'||r.page==='alerts') container.append(await storageView(scope,r.page==='alerts'));
    else if(r.page==='server') container.append(panel('Identidade e capacidades',el('div',{class:'panel-body'},kv([['Servidor',server.environment?.server_name],['Arquitetura',server.environment?.kernel_architecture],['Incus',server.environment?.server_version],['Cluster',server.environment?.server_clustered?'Configurado':'Não configurado'],['VM','Fora do escopo: extensão não comprova KVM'],['Origem','Incus /1.0']]),json(server.api_extensions))));
    else if(['images','networks','profiles','projects'].includes(r.page)) {
      const result=await read(r.page,undefined,scope); const data=result.data;
      container.append(panel(title,table(r.page==='images'?['IMAGEM','ARQUITETURA','TAMANHO','TIPO']:['NOME','DETALHES'],data.map(item=>r.page==='images'?[item.properties?.description||item.aliases?.[0]?.name||item.fingerprint,item.architecture,bytes(item.size),item.type||'container']:[item.name,el('details',{},el('summary',{},'Inspecionar configuração'),json(item))]))));
      if(r.page==='projects')container.append(notice('A lista contém somente os escopos configurados no servidor do painel. A autorização final permanece no Incus.'));
    } else if(r.page==='tasks') container.append(await taskView(scope));
    else if(r.page==='create') container.append(await createView(scope,server));
    else if(r.page==='settings') container.append(panel('Sessão e segurança',el('div',{class:'panel-body'},kv([['Identidade',session.username],['Papel',session.role],['Expira em',date(session.expires)],['Modo',session.read_only?'Somente leitura':'Mutações limitadas à allowlist'],['Autorização','Escopo no painel + '+transportLabel()],['Histórico','Auditoria temporária em memória, máximo de 200 registros']]),notice('O inventário é atualizado a cada 15 segundos. Quando habilitados pelo administrador, eventos antecipam a atualização. O console é encerrado por logout, expiração ou inatividade.'),el('button',{onclick:()=>$('#logout').click()},'Encerrar sessão')),null),panel('Auditoria desta identidade',json((await read('audit',undefined,scope)).data)));
    else container.append(empty('Página não encontrada.'));
    if(id!==generation||!session)return;
    const tracked=[...tasks.values()].filter(t=>t.host===scope.host&&t.project===scope.project);
    for(const task of tracked)if(task.status_code<200){try{Object.assign(task,(await read('operation',task.id,scope)).data);}catch{task.status='Resultado incerto';}}
    if(id!==generation||!session)return;
    $('#task-summary').textContent=tracked.length?tracked.map(t=>`${t.target}: ${t.status}`).join(' · '):'Operações rastreadas pelo Incus';
    $('#content').replaceChildren(container); $('#connection').textContent=(session.demo?'● Simulação conectada':'● Conectado · '+transportLabel())+' · '+host+' / '+project;
    $('#updated').textContent='Atualizado '+new Date().toLocaleTimeString('pt-BR');
  } catch(error) {
    if(id===generation&&session){$('#content').replaceChildren(errorNode(error),notice('Não foi possível atualizar este escopo. A falha de conexão não indica que os containers estejam parados.'));$('#connection').textContent=error.status===403?'Sem permissão':'Conexão degradada';}
  } finally {
    if(id===generation){busy=false;$('#content').removeAttribute('aria-busy');scheduleRefresh();}
  }
}
function scheduleRefresh(){clearTimeout(timer);timer=setTimeout(()=>{if(!session)return;if(!consoleId&&!document.hidden&&!$('#confirm').open&&!['create','settings'].includes(route().page)&&!$('#content').contains(document.activeElement))render();else scheduleRefresh();},15000);}
async function pollEvents(){
  if(!session)return;const scope=host+'/'+project;
  try{const result=await api('/api/events?'+new URLSearchParams({host,project}));if(!session||scope!==host+'/'+project)return;if(!result.enabled)return;
    const changed=result.version!==eventVersion;eventVersion=result.version;
    if(!result.connected){$('#connection').textContent='Eventos desconectados · fallback REST ativo';}
    if(changed&&!busy&&!consoleId&&!document.hidden&&!$('#confirm').open&&!['create','settings'].includes(route().page)&&!$('#content').contains(document.activeElement))await render();
  }catch{}
  if(session)eventTimer=setTimeout(pollEvents,2000);
}
async function storageView(scope,alertsOnly=false) {
  try {
    const result=await read('pools',undefined,scope); const rows=[];const alerts=[];
    for(const pool of result.data) {
      const usage=await read('pool-resources',pool.name,scope).catch(error=>({error}));const space=usage.data?.space;
      const percent=space?.total>0&&space.used!=null?space.used/space.total*100:null;
      const level=percent===null?'Desconhecido':percent>=90?'Crítico':percent>=80?'Aviso':'Normal';
      rows.push([pool.name,pool.driver,bytes(space?.total),bytes(space?.used),percent===null?'n/d':fmt(percent)+'%',badge(level,percent>=90?'danger':percent>=80?'warn':''),date(usage.timestamp)]);
      if(percent>=80)alerts.push(notice(`${pool.name}: ${fmt(percent)}% do pool ocupado. ${level}. Fonte: /storage-pools/${pool.name}/resources.`,percent>=90));
      if(usage.error)alerts.push(errorNode(usage.error));
    }
    return el('div',{},alertsOnly?(alerts.length?alerts:notice('Nenhum alerta de capacidade nas métricas disponíveis.')):panel('Storage pools',table(['POOL','DRIVER','CAPACIDADE','UTILIZADO','USO','ESTADO','COLETA'],rows)),!alertsOnly?alerts:null,el('small',{},'Fonte: Incus pool resources. Capacidade física não é calculada somando du, snapshots ou subvolumes.'));
  } catch(error){return errorNode(error);}
}
async function detail(r,scope) {
  const [instanceResult,stateResult]=await Promise.all([read('instance',r.target,scope),read('state',r.target,scope)]);
  const item=instanceResult.data,state=stateResult.data;
  const tabs=[['summary','Resumo'],['resources','Recursos'],['devices','Dispositivos'],['options','Opções'],['snapshots','Snapshots'],['backups','Backups'],['console','Console']];
  const wrapper=el('div',{},el('div',{class:'tabs'},tabs.map(([tab,label])=>el('a',{href:instanceLink(r.target,tab),class:r.tab===tab?'active':''},label))));
  if(r.tab==='summary') {
    wrapper.append(el('div',{class:'toolbar'},status(state.status),...['start','stop','restart'].map((action,i)=>{
      const button=actionButton(['▶ Iniciar','■ Parar','↻ Reiniciar'][i],action,r.target);
      if((action==='start'&&state.status!=='Stopped')||(action!=='start'&&state.status!=='Running'))button.disabled=true;return button;
    }),session.role==='administrador'?actionButton('Excluir','delete',r.target):null));
    wrapper.append(panel('Resumo do container',el('div',{class:'panel-body'},kv([['Identidade',`${scope.host}/${scope.project}/${item.name}`],['Arquitetura',item.architecture],['Estado',state.status],['Profiles',(item.profiles||[]).join(', ')],['Memória',bytes(state.memory?.usage)],['Coleta',date(stateResult.timestamp)]]))));
    if(!canMutate(r.target))wrapper.append(notice('Ações bloqueadas pelo modo de leitura, papel ou lista de containers de teste.'));
  } else if(r.tab==='resources')wrapper.append(panel('Recursos • fonte: instance state',el('div',{class:'panel-body'},kv([['RAM em uso',bytes(state.memory?.usage)],['Limite RAM',item.expanded_config?.['limits.memory']||'Não informado'],['CPU acumulada',state.cpu?.usage==null?'n/d':fmt(state.cpu.usage/1e9)+' segundos (não é percentual)'],['Coleta',date(stateResult.timestamp)]]),json({network:state.network,disk:state.disk}))));
  else if(r.tab==='devices')wrapper.append(panel('Dispositivos efetivos e origem',table(['DISPOSITIVO','ORIGEM','CONFIGURAÇÃO'],Object.entries(item.expanded_devices||{}).map(([key,value])=>[key,Object.hasOwn(item.devices||{},key)?'Local':'Herdado de profile',json(value)]))));
  else if(r.tab==='options')wrapper.append(panel('Configuração somente leitura',el('div',{class:'panel-body'},el('h2',{},'Local'),json(item.config),el('h2',{},'Expandida (inclui profiles)'),json(item.expanded_config))));
  else if(['snapshots','backups'].includes(r.tab)){
    const result=await read(r.tab,r.target,scope);
    wrapper.append(panel(r.tab==='snapshots'?'Snapshots':'Backups',table(['NOME','CRIADO EM','EXPIRA EM'],result.data.map(i=>[typeof i==='string'?i:i.name,date(i.created_at),date(i.expires_at)])),actionButton('＋ Criar',r.tab==='snapshots'?'snapshot':'backup',r.target)));
    wrapper.append(notice('Snapshots podem compartilhar blocos. Download e restauração de backups, restauração e exclusão de snapshots estão pendentes. Não há limpeza automática.'));
  } else {
    const open=actionButton('Abrir shell /bin/sh','console',r.target);if(!session.enable_console||state.status!=='Running')open.disabled=true;
    const output=el('pre',{id:'console-output',class:'terminal',tabindex:'0','aria-label':'Saída do terminal'},'Console desconectado.\n');
    const input=el('input',{'aria-label':'Comando para o shell',placeholder:'Digite um comando e pressione Enter',autocomplete:'off',spellcheck:'false'});
    const form=el('form',{class:'toolbar'},input,el('button',{},'Enviar'),el('button',{type:'button',onclick:()=>api('/api/console/input',{console:consoleId,text:'\u0003'}).catch(error=>output.append(error.message))},'Ctrl+C'),el('button',{type:'button',onclick:closeConsole},'Encerrar'));
    form.onsubmit=async event=>{event.preventDefault();if(!consoleId)return;try{await api('/api/console/input',{console:consoleId,text:input.value+'\n'});input.value='';}catch(error){output.append('\n'+error.message);}};
    wrapper.append(notice('Shell privilegiado em container de teste. Terminal textual com entrada por linha; editores de tela inteira não são suportados. Ao sair desta tela o canal é encerrado.'),panel('Console interativo',el('div',{class:'panel-body'},output,form),open));
    if(!session.enable_console)wrapper.append(notice('O administrador precisa habilitar enable_console na configuração. O modo demonstração não simula um shell.'));
  }
  return wrapper;
}
async function closeConsole(){clearTimeout(consoleTimer);const id=consoleId;consoleId=null;if(id&&session)try{await api('/api/console/close',{console:id});}catch{} }
async function pollConsole(){
  const id=consoleId;if(!id)return;
  try{const result=await api('/api/console/read?'+new URLSearchParams({console:id}));if(consoleId!==id)return;const output=$('#console-output');if(!output){closeConsole();return;}output.textContent=(output.textContent+result.output).slice(-65536);output.scrollTop=output.scrollHeight;if(result.closed){output.append('\n[Console encerrado]');consoleId=null;return;}consoleTimer=setTimeout(pollConsole,500);}
  catch(error){const output=$('#console-output');if(output)output.append('\n'+error.message);closeConsole();}
}
async function taskView(scope) {
  const result=await read('operations',undefined,scope);
  const remote=Array.isArray(result.data)?result.data:Object.values(result.data).flat();
  const all=new Map();
  for(const operation of remote)if(typeof operation==='object')all.set(operation.id,operation);
  for(const [key,task] of tasks)if(task.host===scope.host&&task.project===scope.project){
    try{const data=(await read('operation',task.id,scope)).data;tasks.set(key,{...task,...data});all.set(task.id,{...task,...data});}catch(error){all.set(task.id,{...task,err:error.message});}
  }
  $('#task-summary').textContent=`${all.size} operações neste escopo · estado confirmado pelo Incus`;
  return panel('Operações assíncronas',table(['UUID','DESCRIÇÃO','ESTADO','PROGRESSO / ERRO'],[...all.values()].map(i=>[i.id,i.description||i.action,status(i.status),i.err||JSON.stringify(i.metadata||{})])));
}
async function createView(scope,server) {
  const [images,profiles]=await Promise.all([read('images',undefined,scope),read('profiles',undefined,scope)]);
  const normalize=a=>({'armv7l':'armv7','armhf':'armv7','aarch64':'arm64','x86_64':'amd64','x86-64':'amd64'})[a]||a;
  const compatible=images.data.filter(i=>(i.type||'container')==='container'&&normalize(i.architecture)===normalize(server.environment?.kernel_architecture));
  const form=el('form',{class:'panel-body'});
  const target=el('input',{required:'',pattern:'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}',placeholder:'lab-novo'});
  const image=el('select',{required:''},...compatible.map(i=>el('option',{value:i.fingerprint},i.properties?.description||i.aliases?.[0]?.name||i.fingerprint)));
  const profile=el('select',{required:''},...profiles.data.map(p=>el('option',{value:p.name},p.name)));
  form.append(kv([['Host',scope.host],['Project',scope.project],['Tipo','Container'],['Arquitetura',server.environment?.kernel_architecture]]),el('label',{},'Nome do container',target),el('br'),el('label',{},'Imagem local compatível',image),el('br'),el('label',{},'Profile (define rede, storage e limites)',profile),el('br'),notice('O nome precisa constar na lista de containers de teste configurada pelo administrador. A criação usa rede, pool e limites do profile escolhido.'),el('button',{class:'primary',disabled:session.read_only||session.role==='observador'||!compatible.length?'':null},'Revisar criação →'));
  form.onsubmit=event=>{event.preventDefault();openAction('create',target.value,{image:image.value,profiles:[profile.value]});};
  return panel('Novo container de laboratório',form);
}
api('/api/session').then(data=>{session=data;enter();}).catch(()=>{});
