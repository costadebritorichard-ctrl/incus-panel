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
// Ícones vetoriais locais; sem fontes ou serviços externos.
const iconPaths = {
  plus: ['M12 5v14', 'M5 12h14'], logout: ['M9 5H5v14h4', 'M14 8l4 4-4 4', 'M9 12h9'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M5 16v5h14v-5'],
  refresh: ['M20 7v5h-5', 'M4 17v-5h5', 'M6 7a7 7 0 0 1 12-1l2 3', 'M18 17a7 7 0 0 1-12 1l-2-3'],
  start: ['M8 5l11 7-11 7Z'], stop: ['M6 6h12v12H6Z'], restart: ['M20 4v6h-6', 'M20 10a8 8 0 1 0 0 5'],
  edit: ['M15 5l4 4', 'M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15Z'],
  delete: ['M3 6h18', 'M9 6V3h6v3', 'M5 6l1 15h12l1-15', 'M10 10v7', 'M14 10v7'],
  save: ['M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z', 'M7 3v6h10V3', 'M7 21v-8h10v8'],
  box: ['M12 3l9 5v9l-9 5-9-5V8Z', 'M3 8l9 5 9-5', 'M12 13v9', 'M7.5 5.5l9 5'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'], shield: ['M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z', 'M8 12l3 3 5-6']
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round',class:'icon','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
  for(const d of iconPaths[name]||iconPaths.box){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}
  return svg;
}
function iconLabel(name,label){return [icon(name),el('span',{},label)];}
function notify(message){$('#feedback').textContent=message;$('#feedback').hidden=false;}
async function waitOperation(operation,scope,owner){
  let state;
  for(let attempt=0;attempt<(owner.low_resource?6:30);attempt++){
    if(session!==owner)throw new Error('A sessão mudou. Consulte Tarefas para conferir a operação.');
    state=(await read('operation',operation,scope)).data;
    trackTask(`${scope.host}/${scope.project}/${operation}`,{...tasks.get(`${scope.host}/${scope.project}/${operation}`),...scope,id:operation,...state});
    if(state.status_code>=200)readCache.clear();
    if(state.status_code>=400)throw new Error(state.err||'O Incus não concluiu a operação.');
    if(state.status_code>=200)return state;
    await new Promise(resolve=>setTimeout(resolve,owner.low_resource?5000:1000));
  }
  return state;
}
let session, host, project, generation = 0, pendingAction, timer, expiryTimer, busy = false, consoleId, consoleTimer;
let eventTimer,eventVersion;
const tasks = new Map();
const creationRuns = new Map();
const imageDownloads = new Map();
const readCache = new Map();
function trackTask(key,task){
  tasks.set(key,task);
  if(tasks.size>100){const completed=[...tasks].find(([id,item])=>id!==key&&item.status_code>=200);tasks.delete(completed?.[0]||tasks.keys().next().value);}
}
function watchingRun(run,page){return session===run.owner&&host===run.scope.host&&project===run.scope.project&&route().page===page&&!document.hidden;}
function resumeRun(run,poll){if(run.status_code<200&&!run.connectionError&&!run.polling){clearTimeout(run.timer);run.timer=setTimeout(()=>poll(run),0);}}
const pages = [ ['overview','◫','Visão geral'],['instances','▣','Containers'],['images','◇','Imagens'],['storage','▤','Armazenamento'],['networks','⌘','Redes'],['profiles','☷','Profiles'],['projects','▱','Projetos'],['tasks','◷','Tarefas'],['alerts','△','Alertas'],['server','▧','Servidor'],['settings','⚙','Configurações'] ];
const numberFormat = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:1});
const fmt = n => n === null || n === undefined ? 'n/d' : numberFormat.format(n);
const bytes = n => n === null || n === undefined ? 'n/d' : n >= 1073741824 ? fmt(n/1073741824)+' GiB' : fmt(n/1048576)+' MiB';
const date = n => n ? new Date(typeof n === 'number' ? n*1000 : n).toLocaleString('pt-BR') : 'n/d';
const transportLabel = () => ({ssh:'SSH verificado',unix:'Socket local Incus',tls:'TLS verificado'})[session?.hosts.find(h=>h.id===host)?.transport||'tls'];
const badge = (text, cls='') => el('span',{class:'badge '+cls},text);
const status = text => el('span',{class:'status '+String(text).toLowerCase()},({'Running':'Em execução','Stopped':'Parado','Success':'Concluída','Failure':'Falhou','Running operation':'Em andamento'})[text] || text || 'Desconhecido');
const json = value => el('pre',{},JSON.stringify(value,null,2));
function inspect(value){const details=el('details',{},el('summary',{},'Inspecionar configuração'));let rendered=false;details.addEventListener('toggle',()=>{if(details.open&&!rendered){rendered=true;details.append(json(value));}});return details;}
const panel = (title, content, action) => el('section',{class:'panel'},el('div',{class:'panel-head'},el('h2',{},title),action),content);
const empty = text => el('div',{class:'empty'},text);
const kv = pairs => el('dl',{class:'key-values'},pairs.map(([k,v])=>el('div',{},el('dt',{},k),el('dd',{},v ?? 'n/d'))));
function table(headers, rows) {
  if(!rows.length)return empty('Nenhum recurso encontrado neste escopo.');
  const body=el('tbody'),holder=el('div',{},el('div',{class:'table-wrap'},el('table',{},el('thead',{},el('tr',{},headers.map(h=>el('th',{},h)))),body)));
  const size=25;let page=0;
  const label=el('span',{'aria-live':'polite'}),previous=el('button',{type:'button',onclick:()=>{page--;update();}},'Anterior'),next=el('button',{type:'button',onclick:()=>{page++;update();}},'Próxima');
  function update(){
    body.replaceChildren(...rows.slice(page*size,(page+1)*size).map(row=>el('tr',{},(typeof row==='function'?row():row).map(c=>el('td',{},c)))));
    label.textContent=`${page*size+1}–${Math.min((page+1)*size,rows.length)} de ${rows.length}`;
    previous.disabled=page===0;next.disabled=(page+1)*size>=rows.length;
  }
  if(rows.length>size)holder.append(el('div',{class:'pagination'},previous,label,next));
  update();return holder;
}
function notice(text, critical=false) { return el('div',{class:'alert'+(critical?' critical':'')},text); }
function errorNode(error) { return notice((error.status===403?'Sem permissão. ':error.status===503?'Desconectado. ':'')+error.message,true); }
function loadingView(message) { return el('div',{class:'loading-state',role:'status','aria-live':'polite'},el('span',{class:'spinner','aria-hidden':'true'}),el('p',{},message)); }
async function api(path, body) {
  if(body&&['/api/action','/api/create','/api/images/download'].includes(path))readCache.clear();
  const response = await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-CSRF-Token':session?.csrf || ''}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result = await response.json();
  if(body&&['/api/action','/api/create','/api/images/download'].includes(path))readCache.clear();
  if (!response.ok) {
    if (response.status===401 && path!=='/api/login') logoutLocal();
    throw Object.assign(new Error(result.error || 'Falha na solicitação.'),{status:response.status});
  }
  return result;
}
async function read(resource,target,scope={host,project}) {
  const path='/api/read?'+new URLSearchParams({...scope,resource,...(target?{target}:{})});
  if(!['server','instance-list'].includes(resource))return api(path);
  const cached=readCache.get(path);
  if(cached&&Date.now()<cached.expires)return cached.promise;
  const entry={expires:Infinity};
  entry.promise=api(path).then(result=>{entry.expires=session?.low_resource?Infinity:Date.now()+(resource==='server'?60000:15000);return result;},error=>{if(readCache.get(path)===entry)readCache.delete(path);throw error;});
  readCache.set(path,entry);
  if(readCache.size>8)readCache.delete(readCache.keys().next().value);
  return entry.promise;
}
function route() { const [page='',target='',tab='summary'] = location.hash.slice(1).split('/').map(decodeURIComponent); return {page:page||'overview',target,tab}; }
function instanceLink(name, tab='summary') { return '#instance/'+encodeURIComponent(name)+'/'+tab; }
function canMutate(target) { return !session.read_only && session.role!=='observador' && (session.manage_all_instances || (session.mutable_instances?.[host]?.[project] || []).includes(target)); }
function actionButton(label, action, target, extra={}) { return el('button',{class:'action-button'+(action==='delete'?' danger-button':''),disabled:canMutate(target)?null:'',onclick:()=>openAction(action,target,extra)},...iconLabel(iconPaths[action]?action:'plus',label)); }
function openAction(action,target,extra={}) {
  pendingAction={host,project,action,target,...extra};
  $('#action-title').textContent=({start:'Iniciar container',stop:'Parar container',restart:'Reiniciar container',delete:'Excluir container permanentemente',create:'Criar container',snapshot:'Criar snapshot',backup:'Gerar backup',console:'Abrir shell interativo'})[action];
  $('#action-description').textContent= action==='console'?'Este acesso abre /bin/sh, normalmente como root dentro do container. Comandos podem alterar ou apagar dados.':action==='delete'?'A exclusão remove permanentemente o container e seus snapshots.':action==='snapshot'||action==='backup'?'A operação consome armazenamento. Blocos compartilhados não representam espaço recuperável garantido.':'Revise o destino. O resultado será confirmado pela operação Incus.';
  $('#action-review').textContent=`Container: ${target}\nServidor: ${session.hosts.find(h=>h.id===host)?.alias || host}\nProjeto: ${project}${extra.profiles ? '\nPerfil: '+extra.profiles.join(', ') : ''}`;
  const needsConfirmation=['delete','console'].includes(action);
  $('#confirmation').parentElement.hidden=!needsConfirmation;
  $('#confirmation').required=needsConfirmation;
  $('#confirmation').value=''; $('#confirmation').placeholder=action==='delete'?target:`${host}/${project}/${target}`;
  $('#confirmation-label').textContent=action==='delete'?`Digite ${target} para excluir`:'Digite o alvo completo para confirmar';
  $('#name-label').hidden=!['snapshot','backup'].includes(action);
  $('#artifact-name').required=!$('#name-label').hidden;
  $('#artifact-name').value=''; $('#action-error').textContent='';
  $('#submit-action').classList.toggle('danger-primary',action==='delete');
  $('#confirm').showModal(); (needsConfirmation?$('#confirmation'):$('#submit-action')).focus();
}
$('#cancel-action').onclick=()=>$('#confirm').close();
$('#confirm').addEventListener('cancel',event=>{if($('#submit-action').disabled)event.preventDefault();});
$('#action-form').onsubmit=async event=>{
  event.preventDefault(); $('#cancel-action').disabled=true; $('#submit-action').disabled=true;$('#submit-action').textContent='Processando…';
  try {
    const action={...pendingAction},owner=session;
    if(action.action==='delete'&&$('#confirmation').value!==action.target)throw new Error('Digite o nome do container exatamente como exibido.');
    if(pendingAction.action==='console'){
      const result=await api('/api/console/start',{...pendingAction,confirmation:$('#confirmation').value});
      consoleId=result.console;$('#confirm').close();pollConsole();return;
    }
    const data=await api('/api/action',{...action,confirmation:`${action.host}/${action.project}/${action.target}`,name:$('#artifact-name').value});
    trackTask(`${action.host}/${action.project}/${data.operation}`,{...action,id:data.operation,status:'Aguardando confirmação',status_code:100});
    $('#submit-action').textContent='Aguardando o Incus…';
    const state=await waitOperation(data.operation,{host:action.host,project:action.project},owner);
    if(session!==owner)return;
    $('#confirm').close();
    notify(state.status_code<200?'Operação em andamento. Acompanhe em Tarefas.':({start:'Container iniciado.',stop:'Container parado.',restart:'Container reiniciado.',delete:'Container excluído.',create:'Container criado.'})[action.action]||'Operação concluída.');
    if(action.action==='delete'&&route().page==='instance'){location.hash='#instances';return;}
    if(action.action==='create'||state.status_code<200){location.hash='#tasks';return;}
    await render();
  } catch(error) { $('#action-error').textContent=error.message; }
  finally { $('#cancel-action').disabled=false; $('#submit-action').disabled=false;$('#submit-action').textContent='Confirmar operação'; }
};
function logoutLocal() {
  document.body.classList.add('low-resource');
  setMenu(false,{restoreFocus:false});
  closeConsole();
  for(const run of creationRuns.values())clearTimeout(run.timer);
  creationRuns.clear();
  for(const run of imageDownloads.values())clearTimeout(run.timer);
  imageDownloads.clear();readCache.clear();
  $('#feedback').hidden=true;
  session=null; generation++; clearTimeout(timer); clearTimeout(expiryTimer); clearTimeout(eventTimer); tasks.clear(); $('#content').replaceChildren(); $('#tree').replaceChildren(); $('#shell').hidden=true; $('#login').hidden=false;
  if($('#confirm').open) $('#confirm').close();
}
// Menu móvel: painel sobreposto com foco contido e fechamento por Escape.
const menuBreakpoint=window.matchMedia('(max-width: 1100px)');
let menuOpen=false;
function setMenu(open,{restoreFocus=true}={}){
  const wasOpen=menuOpen,drawer=menuBreakpoint.matches;
  menuOpen=Boolean(open&&drawer&&session);
  document.body.classList.toggle('menu-open',menuOpen);
  $('#menu-toggle').setAttribute('aria-expanded',String(menuOpen));
  $('#menu-toggle').setAttribute('aria-label',menuOpen?'Fechar menu':'Abrir menu');
  $('#menu-backdrop').hidden=!menuOpen;
  const sidebar=$('#sidebar');
  sidebar.inert=drawer&&!menuOpen;
  if(drawer&&!menuOpen)sidebar.setAttribute('aria-hidden','true');else sidebar.removeAttribute('aria-hidden');
  if(menuOpen){sidebar.setAttribute('role','dialog');sidebar.setAttribute('aria-modal','true');}
  else{sidebar.removeAttribute('role');sidebar.removeAttribute('aria-modal');}
  for(const node of [$('#main-content'),$('#shell header'),$('#shell footer')])node.inert=menuOpen;
  if(menuOpen)$('#menu-close').focus();
  else if(wasOpen&&restoreFocus&&drawer)$('#menu-toggle').focus();
}
$('#menu-toggle').onclick=()=>setMenu(!menuOpen);
$('#menu-close').onclick=()=>setMenu(false);
$('#menu-backdrop').onclick=()=>setMenu(false);
$('#sidebar').addEventListener('click',event=>{
  if(menuOpen&&event.target.closest('a[href]')){
    setMenu(false,{restoreFocus:false});
    $('#main-content').focus({preventScroll:true});
  }
});
menuBreakpoint.addEventListener('change',()=>setMenu(false,{restoreFocus:false}));
document.addEventListener('keydown',event=>{
  if(!menuOpen)return;
  if(event.key==='Escape'){event.preventDefault();setMenu(false);return;}
  if(event.key!=='Tab')return;
  const items=[...$('#sidebar').querySelectorAll('a[href],button:not([disabled]),select:not([disabled]),input:not([disabled]),[tabindex="0"]')].filter(node=>node.getClientRects().length);
  const first=items[0],last=items[items.length-1],active=document.activeElement;
  if(event.shiftKey&&(active===first||!$('#sidebar').contains(active))){event.preventDefault();last?.focus();}
  else if(!event.shiftKey&&(active===last||!$('#sidebar').contains(active))){event.preventDefault();first?.focus();}
});
setMenu(false,{restoreFocus:false});

$('#logout').replaceChildren(...iconLabel('logout','Sair'));
$('#refresh').replaceChildren(...iconLabel('refresh','Atualizar'));
$('#logout').onclick=async()=>{try{await api('/api/logout',{});}finally{logoutLocal();}};
$('#login-form').onsubmit=async event=>{
  event.preventDefault(); $('#login-error').textContent=''; const form=event.target; const button=form.querySelector('button');const label=[...button.childNodes].map(node=>node.cloneNode(true));button.disabled=true;button.textContent='Entrando…';
  try { session=await api('/api/login',Object.fromEntries(new FormData(form))); form.reset(); enter(); }
  catch(error) { $('#login-error').textContent=error.message; }
  finally { button.disabled=false;button.replaceChildren(...label); }
};
function enter() {
  readCache.clear();document.body.classList.toggle('low-resource',Boolean(session.low_resource));
  clearTimeout(expiryTimer); expiryTimer=setTimeout(logoutLocal,Math.max(0,session.expires*1000-Date.now()));
  $('#login').hidden=true; $('#shell').hidden=false; $('#identity').textContent=`${session.username} · ${session.role}`;
  $('#mode').textContent=session.demo?'DEMONSTRAÇÃO':session.read_only?'SOMENTE LEITURA':session.manage_all_instances?'ADMINISTRAÇÃO':'LABORATÓRIO';
  $('#host').replaceChildren(...session.hosts.map(h=>el('option',{value:h.id},h.alias)));
  let remembered;try{remembered=JSON.parse(localStorage.getItem('incus-scope')||'null');}catch{remembered=null;}
  host=session.hosts.some(h=>h.id===remembered?.host)?remembered.host:session.hosts[0]?.id;
  if(!host){$('#content').replaceChildren(empty('Nenhum host autorizado.'));return;}
  $('#host').value=host; fillProjects(remembered?.project); render();
}
function fillProjects(preferred) {
  readCache.clear();
  const projects=session.scopes[host]||[];
  project=projects.includes(preferred)?preferred:projects[0];
  $('#project').replaceChildren(...projects.map(p=>el('option',{value:p},p))); $('#project').value=project;
  localStorage.setItem('incus-scope',JSON.stringify({host,project}));
  eventVersion=undefined;clearTimeout(eventTimer);eventTimer=setTimeout(pollEvents,2000);
}
$('#host').onchange=()=>{closeConsole();host=$('#host').value;fillProjects();render();};
$('#project').onchange=()=>{closeConsole();readCache.clear();project=$('#project').value;localStorage.setItem('incus-scope',JSON.stringify({host,project}));eventVersion=undefined;clearTimeout(eventTimer);eventTimer=setTimeout(pollEvents,2000);render();};
$('#refresh').onclick=()=>{closeConsole();readCache.clear();render();}; $('#tree-view').onchange=()=>render();
window.addEventListener('hashchange',()=>{setMenu(false,{restoreFocus:false});closeConsole();if(session)render();});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){clearTimeout(timer);clearTimeout(eventTimer);for(const run of [...creationRuns.values(),...imageDownloads.values()])clearTimeout(run.timer);return;}
  if(!session)return;
  for(const run of creationRuns.values())if(watchingRun(run,'create'))resumeRun(run,pollCreation);
  for(const run of imageDownloads.values())if(watchingRun(run,'images'))resumeRun(run,pollImageDownload);
  if(!session.low_resource){eventTimer=setTimeout(pollEvents,2000);if(!consoleId&&!menuOpen&&!$('#content form')&&!$('#confirm').open){readCache.clear();render();}else scheduleRefresh();}
});
function instanceActions(item){
  const actions=el('div',{class:'row-actions'});
  const edit=el('a',{class:'button-link',href:instanceLink(item.name,'options'),title:'Editar '+item.name,'aria-label':'Editar '+item.name},icon('edit'));
  if(session.role==='administrador'&&canMutate(item.name))actions.append(edit);
  for(const [action,label] of (item.status==='Running'?[['stop','Parar'],['restart','Reiniciar']]:item.status==='Stopped'?[['start','Iniciar']]:[])){
    const button=actionButton(label,action,item.name);button.replaceChildren(icon(action));button.title=label+' '+item.name;button.setAttribute('aria-label',button.title);actions.append(button);
  }
  if(session.role==='administrador'){
    const button=actionButton('Excluir','delete',item.name);button.replaceChildren(icon('delete'));button.setAttribute('aria-label','Excluir '+item.name);
    const protectedDelete=(item.expanded_config?.['security.protection.delete']??item.config?.['security.protection.delete'])==='true';
    if(item.status!=='Stopped'||protectedDelete)button.disabled=true;
    button.title=item.status!=='Stopped'?'Pare o container antes de excluir':protectedDelete?'Desative a proteção contra exclusão em Editar':'Excluir '+item.name;
    actions.append(button);
  }
  return actions;
}
function instanceTable(items) {
  return table(['CONTAINER','ESTADO','ARQUITETURA','AÇÕES'],items.map(i=>()=>[el('a',{class:'container-name',href:instanceLink(i.name)},icon('box'),i.name),status(i.status),i.architecture||'n/d',instanceActions(i)]));
}
function filteredInstances(items) {
  const input=el('input',{placeholder:'Buscar container, estado ou arquitetura…','aria-label':'Buscar containers'});
  const filter=el('select',{'aria-label':'Filtrar estado'},el('option',{value:''},'Todos os estados'),el('option',{value:'Running'},'Em execução'),el('option',{value:'Stopped'},'Parados'));
  const sort=el('select',{'aria-label':'Ordenar containers'},el('option',{value:'name'},'Ordenar por nome'),el('option',{value:'status'},'Ordenar por estado'));
  const holder=el('div');
  function update(){const term=input.value.toLowerCase();holder.replaceChildren(instanceTable(items.filter(i=>(!filter.value||i.status===filter.value)&&[i.name,i.status,i.architecture].join(' ').toLowerCase().includes(term)).sort((a,b)=>String(a[sort.value]).localeCompare(String(b[sort.value])))));}
  let filterTimer;input.oninput=()=>{clearTimeout(filterTimer);filterTimer=setTimeout(update,120);};filter.onchange=update;sort.onchange=update;update();
  return el('div',{},el('div',{class:'toolbar'},input,filter,sort,el('a',{href:'#create',class:'primary button-link'},...iconLabel('plus','Criar container'))),panel('Seus containers',holder));
}
async function render() {
  if(!session)return;
  clearTimeout(timer); const id=++generation; const scope={host,project}; const r=route(); busy=true;
  const title=pages.find(p=>p[0]===r.page)?.[2] || (r.page==='instance'?r.target:r.page==='create'?'Criar container':'Página não encontrada');
  $('#title').textContent=title; $('#breadcrumb').textContent=`${host} / ${project} / ${title}`;
  $('#subtitle').textContent=r.page==='instance'?`Gerencie ${r.target} e acompanhe seus recursos.`:({overview:'Seu laboratório sob controle. Veja o que está acontecendo agora.',instances:'Encontre, acompanhe e gerencie seus containers.',create:'Escolha uma imagem. Nós cuidamos da configuração.',images:'Sistemas disponíveis para o seu próximo container.',storage:'Acompanhe o espaço disponível para seu laboratório.',networks:'Conexões que mantêm seus containers em rede.',projects:'Organize seus ambientes em projetos separados.'})[r.page]||'Gerencie os recursos do seu laboratório.';
  $('#navigation').replaceChildren(...pages.map(([key,icon,label])=>el('a',{href:'#'+key,class:r.page===key?'active':''},el('span',{},icon),label)));
  $('#banner').hidden=!session.demo; $('#banner').textContent='DEMONSTRAÇÃO · Todos os dados e operações são simulados em memória. Nada é enviado a um servidor Incus real.';
  $('#connection').textContent='Consultando Incus…'; $('#content').setAttribute('aria-busy','true');
  $('#content').replaceChildren(loadingView(route().page==='create'?'Carregando imagens disponíveis…':'Carregando '+title+'…'));
  const container=el('div');
  try {
    const [serverResult, instancesResult]=await Promise.allSettled([read('server',undefined,scope),read('instance-list',undefined,scope)]);
    if(id!==generation||!session)return;
    if(serverResult.status==='rejected')throw serverResult.reason;
    if(instancesResult.status==='rejected')throw instancesResult.reason;
    const server=serverResult.value.data, instances=instancesResult.value.data;
    $('#tree').replaceChildren(el('a',{href:'#server'},'▧ '+(server.environment?.server_name||host)),el('a',{href:'#projects'},'▱ '+project),...instances.slice(0,25).map(i=>el('a',{class:'leaf',href:instanceLink(i.name)},(i.status==='Running'?'● ':'○ ')+i.name)),...(instances.length>25?[el('a',{href:'#instances'},`Ver todos os ${instances.length} containers →`)]:[]));
    if($('#tree-view').value==='project')$('#tree').prepend(el('small',{},'Agrupamento: '+project+' → '+host));
    if(r.page==='overview') {
      container.append(el('section',{class:'welcome-panel'},el('div',{},el('span',{class:'eyebrow'},'SEU PRÓXIMO EXPERIMENTO COMEÇA AQUI'),el('h2',{},'Uma ideia. Um novo container.'),el('p',{},'Escolha um sistema e prepare seu ambiente em poucos passos.')),el('a',{href:'#create',class:'primary creation-link'},...iconLabel('plus','Criar container'))));
      const running=instances.filter(i=>i.status==='Running').length;
      const resources=session.host_metrics?await read('host-summary',undefined,scope).catch(error=>({error})):{};
      const memory=resources.data?.memory;
      const cards=[['Containers',instances.length,`${running} em execução · ${instances.filter(i=>i.status==='Stopped').length} parados`],['Memória do host',bytes(memory?.used),memory?'de '+bytes(memory.total):'Fonte indisponível ou não autorizada'],['Arquitetura',server.environment?.kernel_architecture||'n/d','Containers LXC · sem criação de VM'],['Incus',server.environment?.server_version||'n/d',server.environment?.server_clustered?'Cluster configurado':'Servidor standalone']];
      container.append(el('div',{class:'cards'},cards.map(([label,value,note])=>el('div',{class:'card'},el('div',{class:'label'},label),el('div',{class:'value'},value),el('div',{class:'note'},note)))));
      container.append(el('div',{class:'grid'},panel('Containers',instanceTable(instances),el('a',{href:'#instances'},'Ver todos ↗')),panel('Identidade do servidor',el('div',{class:'panel-body'},kv([['Servidor',server.environment?.server_name],['Project',project],['Conexão',session.demo?'Fixture explícita':transportLabel()],['Atualização',session.low_resource?'Manual pelo botão Atualizar':'A cada 15 s, com aba visível']])))));
      if(resources.error)container.append(errorNode(resources.error));
      if(!session.low_resource&&session.host_metrics)container.append(await storageView(scope,true));
    } else if(r.page==='instances') container.append(filteredInstances(instances));
    else if(r.page==='instance') container.append(await detail(r,scope));
    else if(r.page==='storage'||r.page==='alerts') container.append(await storageView(scope,r.page==='alerts'));
    else if(r.page==='server') container.append(panel('Identidade e capacidades',el('div',{class:'panel-body'},kv([['Servidor',server.environment?.server_name],['Arquitetura',server.environment?.kernel_architecture],['Incus',server.environment?.server_version],['Cluster',server.environment?.server_clustered?'Configurado':'Não configurado'],['VM','Fora do escopo: extensão não comprova KVM'],['Origem','Incus /1.0']]),json(server.api_extensions))));
    else if(r.page==='images') container.append(await imagesView(scope,server));
    else if(['networks','profiles','projects'].includes(r.page)) {
      const result=await read(r.page,undefined,scope); const data=result.data;
      container.append(panel(title,table(['NOME','DETALHES'],data.map(item=>()=>[item.name,inspect(item)]))));
      if(r.page==='projects')container.append(notice('A lista contém somente os escopos configurados no servidor do painel. A autorização final permanece no Incus.'));
    } else if(r.page==='tasks') container.append(await taskView(scope));
    else if(r.page==='create') container.append(await createView(scope,server));
    else if(r.page==='settings') container.append(panel('Sessão e segurança',el('div',{class:'panel-body'},kv([['Identidade',session.username],['Papel',session.role],['Expira em',date(session.expires)],['Modo',session.read_only?'Somente leitura':'Mutações limitadas à allowlist'],['Autorização','Escopo no painel + '+transportLabel()],['Histórico','Auditoria temporária em memória, máximo de 200 registros']]),notice(session.low_resource?'Modo leve: inventário manual pelo botão Atualizar. Consulte Armazenamento e Alertas para verificar a capacidade dos pools.':'O inventário é atualizado a cada 15 segundos. Quando habilitados pelo administrador, eventos antecipam a atualização.'),el('button',{onclick:()=>$('#logout').click()},'Encerrar sessão')),null),panel('Auditoria desta identidade',json((await read('audit',undefined,scope)).data)));
    else container.append(empty('Página não encontrada.'));
    if(id!==generation||!session)return;
    const tracked=[...tasks.values()].filter(t=>t.host===scope.host&&t.project===scope.project);
    $('#task-summary').textContent=tracked.length?tracked.map(t=>`${t.target}: ${t.status}`).join(' · '):'Operações rastreadas pelo Incus';
    $('#content').replaceChildren(container); $('#connection').textContent=(session.demo?'● Simulação conectada':'● Conectado · '+transportLabel())+' · '+host+' / '+project;
    $('#updated').textContent='Inventário '+new Date(instancesResult.value.timestamp*1000).toLocaleTimeString('pt-BR');
  } catch(error) {
    if(id===generation&&session){$('#content').replaceChildren(errorNode(error),notice('Não foi possível atualizar este escopo. A falha de conexão não indica que os containers estejam parados.'));$('#connection').textContent=error.status===403?'Sem permissão':'Conexão degradada';}
  } finally {
    if(id===generation){busy=false;$('#content').removeAttribute('aria-busy');scheduleRefresh();}
  }
}
function scheduleRefresh(){clearTimeout(timer);if(session?.low_resource)return;timer=setTimeout(()=>{if(!session)return;if(!consoleId&&!menuOpen&&!document.hidden&&!$('#confirm').open&&!['create','settings'].includes(route().page)&&route().tab!=='options'&&!$('#content').contains(document.activeElement))render();else scheduleRefresh();},15000);}
async function pollEvents(){
  if(!session||session.low_resource||document.hidden)return;const scope=host+'/'+project;
  try{const result=await api('/api/events?'+new URLSearchParams({host,project}));if(!session||scope!==host+'/'+project)return;if(!result.enabled)return;
    const changed=result.version!==eventVersion;eventVersion=result.version;
    if(!result.connected){$('#connection').textContent='Eventos desconectados · fallback REST ativo';}
    if(changed&&!busy&&!consoleId&&!menuOpen&&!document.hidden&&!$('#confirm').open&&!['create','settings'].includes(route().page)&&route().tab!=='options'&&!$('#content').contains(document.activeElement)){readCache.clear();await render();}
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
  const [instanceResult,stateResult]=await Promise.all([read('instance',r.target,scope),['summary','resources'].includes(r.tab)?read('state',r.target,scope):Promise.resolve(null)]);
  const item=instanceResult.data,state=stateResult?.data||{status:item.status};
  const tabs=[['summary','Resumo'],['resources','Recursos'],['devices','Dispositivos'],['options','Editar'],['snapshots','Snapshots'],['backups','Backups'],['console','Console']];
  const wrapper=el('div',{},el('div',{class:'tabs'},tabs.map(([tab,label])=>el('a',{href:instanceLink(r.target,tab),class:r.tab===tab?'active':''},label))));
  if(r.tab==='summary') {
    wrapper.append(el('div',{class:'toolbar'},status(state.status),...['start','stop','restart'].map((action,i)=>{
      const button=actionButton(['Iniciar','Parar','Reiniciar'][i],action,r.target);
      if((action==='start'&&state.status!=='Stopped')||(action!=='start'&&state.status!=='Running'))button.disabled=true;return button;
    }),session.role==='administrador'?el('a',{class:'button-link',href:instanceLink(r.target,'options')},...iconLabel('edit','Editar')):null));
    wrapper.append(el('p',{class:'muted action-help'},'Parar desliga o container sem apagar os dados. Para mantê-lo desligado após reiniciar o servidor, desative a inicialização automática em Editar.'));
    wrapper.append(panel('Resumo do container',el('div',{class:'panel-body'},kv([['Identidade',`${scope.host}/${scope.project}/${item.name}`],['Arquitetura',item.architecture],['Estado',({'Running':'Em execução','Stopped':'Parado'})[state.status]||state.status],['Descrição',item.description||'Sem descrição'],['Inicialização automática',(item.expanded_config?.['boot.autostart']??item.config?.['boot.autostart'])==='true'?'Ativada':'Desativada'],['Profiles',(item.profiles||[]).join(', ')],['Memória',bytes(state.memory?.usage)],['Coleta',date(stateResult.timestamp)]]))));
    if(!canMutate(r.target))wrapper.append(notice('Ações bloqueadas pelo modo de leitura, papel ou lista de containers de teste.'));
  } else if(r.tab==='resources')wrapper.append(panel('Recursos • fonte: instance state',el('div',{class:'panel-body'},kv([['RAM em uso',bytes(state.memory?.usage)],['Limite RAM',item.expanded_config?.['limits.memory']||'Não informado'],['CPU acumulada',state.cpu?.usage==null?'n/d':fmt(state.cpu.usage/1e9)+' segundos (não é percentual)'],['Coleta',date(stateResult.timestamp)]]),json({network:state.network,disk:state.disk}))));
  else if(r.tab==='devices')wrapper.append(panel('Dispositivos efetivos e origem',table(['DISPOSITIVO','ORIGEM','CONFIGURAÇÃO'],Object.entries(item.expanded_devices||{}).map(([key,value])=>[key,Object.hasOwn(item.devices||{},key)?'Local':'Herdado de profile',json(value)]))));
  else if(r.tab==='options')wrapper.append(editView(item,scope));
  else if(['snapshots','backups'].includes(r.tab)){
    const result=await read(r.tab,r.target,scope);
    wrapper.append(panel(r.tab==='snapshots'?'Snapshots':'Backups',table(['NOME','CRIADO EM','EXPIRA EM'],result.data.map(i=>[typeof i==='string'?i:i.name,date(i.created_at),date(i.expires_at)])),actionButton('Criar',r.tab==='snapshots'?'snapshot':'backup',r.target)));
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
function editView(item,scope){
  const allowed=session.role==='administrador'&&canMutate(item.name);
  const config=item.config||{};
  const description=el('textarea',{id:'edit-description',name:'description',rows:'3',maxlength:'1024',placeholder:'Ex.: servidor de testes do projeto'},item.description||'');
  const memory=el('input',{name:'memory',value:config['limits.memory']||'',placeholder:'Ex.: 256MiB ou 1GiB',autocomplete:'off'});
  const cpu=el('input',{name:'cpu',value:config['limits.cpu']||'',placeholder:'Ex.: 1 ou 2',inputmode:'numeric',autocomplete:'off'});
  const toggle=(name,key)=>{
    const input=el('select',{name},el('option',{value:''},'Herdar do perfil'),el('option',{value:'true'},'Ativada'),el('option',{value:'false'},'Desativada'));
    input.value=config[key]||'';return input;
  };
  const autostart=toggle('autostart','boot.autostart'),protection=toggle('protection','security.protection.delete');
  const fields=el('fieldset',{disabled:allowed?null:''},el('div',{class:'description-field'},el('label',{for:'edit-description'},'Descrição'),description),el('div',{class:'edit-fields'},el('label',{},'Limite de memória',memory,el('small',{},'Ex.: 256MiB, 1GiB ou 50%. Vazio usa o perfil.')),el('label',{},'Limite de CPU',cpu,el('small',{},'Quantidade de núcleos. Vazio usa o perfil.'))),el('div',{class:'edit-fields'},el('label',{},'Inicialização automática',autostart),el('label',{},'Proteção contra exclusão',protection)));
  const message=el('p',{class:'form-feedback',role:'status','aria-live':'polite'});
  const save=el('button',{type:'submit',class:'primary',disabled:allowed?null:''},...iconLabel('save','Salvar alterações'));
  const form=el('form',{class:'panel-body edit-form'},fields,el('div',{class:'form-actions'},save,el('a',{href:instanceLink(item.name),class:'button-link'},'Voltar ao resumo')),message);
  if(!allowed)form.prepend(notice('A edição exige administrador com permissão neste container.'));
  form.onsubmit=async event=>{
    event.preventDefault();if(save.disabled)return;
    const changes={},changedConfig={};
    if(description.value!==(item.description||''))changes.description=description.value;
    for(const [key,input] of [['limits.memory',memory],['limits.cpu',cpu],['boot.autostart',autostart],['security.protection.delete',protection]]){
      if(input.value.trim()!==(config[key]||''))changedConfig[key]=input.value.trim();
    }
    if(Object.keys(changedConfig).length)changes.config=changedConfig;
    if(!Object.keys(changes).length){message.textContent='Nenhuma alteração para salvar.';return;}
    const owner=session;fields.disabled=true;save.disabled=true;message.textContent='Salvando e aguardando a confirmação do Incus…';
    try{
      const result=await api('/api/action',{...scope,action:'update',target:item.name,confirmation:`${scope.host}/${scope.project}/${item.name}`,revision:item._revision,changes});
      trackTask(`${scope.host}/${scope.project}/${result.operation}`,{...scope,id:result.operation,target:item.name,action:'update',status_code:100});
      const state=await waitOperation(result.operation,scope,owner);
      if(session!==owner)return;
      notify(state.status_code<200?'Edição em andamento. Acompanhe em Tarefas.':'Alterações salvas e confirmadas pelo Incus.');
      if(state.status_code<200){location.hash='#tasks';return;}
      if(host===scope.host&&project===scope.project&&route().target===item.name&&route().tab==='options')await render();
    }catch(error){message.textContent=error.message;message.setAttribute('role','alert');}
    finally{fields.disabled=!allowed;save.disabled=!allowed;}
  };
  const output=el('div',{},panel('Editar container',form),el('details',{class:'panel technical-details'},el('summary',{},'Configuração técnica (somente leitura)'),el('div',{class:'panel-body'},el('h2',{},'Local'),json(item.config),el('h2',{},'Efetiva, incluindo perfis'),json(item.expanded_config))));
  if(session.role==='administrador'){
    const button=actionButton('Excluir container','delete',item.name);
    const protectedDelete=(item.expanded_config?.['security.protection.delete']??config['security.protection.delete'])==='true';
    if(item.status!=='Stopped'||protectedDelete)button.disabled=true;
    output.append(panel('Excluir container',el('div',{class:'panel-body delete-zone'},el('p',{},item.status!=='Stopped'?'Pare o container antes de excluir. Seus dados permanecem disponíveis enquanto ele está parado.':protectedDelete?'Este container está protegido. Desative e salve a proteção contra exclusão acima para permitir a remoção.':'A exclusão remove permanentemente o container e seus snapshots. Você precisará confirmar o nome.'),button)));
  }
  return output;
}

async function closeConsole(){clearTimeout(consoleTimer);const id=consoleId;consoleId=null;if(id&&session)try{await api('/api/console/close',{console:id});}catch{} }
async function pollConsole(){
  const id=consoleId;if(!id)return;
  try{const result=await api('/api/console/read?'+new URLSearchParams({console:id}));if(consoleId!==id)return;const output=$('#console-output');if(!output){closeConsole();return;}if(result.output){output.textContent=(output.textContent+result.output).slice(-65536);output.scrollTop=output.scrollHeight;}if(result.closed){output.append('\n[Console encerrado]');consoleId=null;return;}consoleTimer=setTimeout(pollConsole,document.hidden?5000:session.low_resource?(result.output?1000:3000):500);}
  catch(error){const output=$('#console-output');if(output)output.append('\n'+error.message);closeConsole();}
}
async function taskView(scope) {
  const result=await read('operations',undefined,scope);
  const remote=Array.isArray(result.data)?result.data:Object.values(result.data).flat();
  const all=new Map();
  for(const operation of remote)if(typeof operation==='object')all.set(operation.id,operation);
  for(const [key,task] of tasks)if(task.host===scope.host&&task.project===scope.project){
    try{const data=all.get(task.id)||(task.status_code>=200?task:(await read('operation',task.id,scope)).data);const updated={...task,...data,...(task.action==='download-image'?{description:'Baixar '+task.target}:{})};trackTask(key,updated);all.set(task.id,updated);}catch(error){all.set(task.id,{...task,err:error.message});}
  }
  $('#task-summary').textContent=`${all.size} operações neste escopo · estado confirmado pelo Incus`;
  return panel('Operações assíncronas',table(['UUID','DESCRIÇÃO','ESTADO','PROGRESSO / ERRO'],[...all.values()].map(i=>()=>[i.id,i.description||i.action,status(i.status),i.err||JSON.stringify(i.metadata||{})])));
}
async function imagesView(scope,server){
  const owner=session,key=scope.host+'/'+scope.project;
  const images=(await read('images',undefined,scope)).data;
  const local=panel('Imagens baixadas',images.length?table(['IMAGEM','ARQUITETURA','TAMANHO','TIPO'],images.map(item=>()=>[item.properties?.description||item.aliases?.[0]?.name||item.fingerprint,item.architecture,bytes(item.size),item.type||'container'])):empty('Nenhuma imagem baixada neste projeto. Escolha uma imagem no catálogo abaixo.'));
  const wrapper=el('div',{},local);
  const download=el('div',{class:'panel-body image-download-body'});
  wrapper.append(panel('Baixar outra imagem',download));
  const progress=el('div',{class:'image-download-status','aria-live':'polite',role:'status'});
  const current=imageDownloads.get(key);
  if(current){progress.replaceChildren(imageDownloadStatus(current));resumeRun(current,pollImageDownload);}
  download.append(el('p',{class:'muted'},'Baixe uma imagem para usar depois na criação de containers. O arquivo fica no servidor selecionado, neste projeto.'),progress);
  if(!session.allow_remote_images){download.append(notice('O download de imagens está desabilitado na configuração do painel.'));return wrapper;}
  if(session.read_only||session.role!=='administrador'){download.append(notice(session.read_only?'Este painel está em modo somente leitura.':'Somente administradores podem baixar imagens.'));return wrapper;}
  let catalog;
  try{catalog=(await read('image-catalog',undefined,scope)).data;}
  catch(error){download.append(errorNode(error),el('button',{type:'button',onclick:()=>render()},'Tentar carregar catálogo novamente'));return wrapper;}
  if(session!==owner)return wrapper;
  if(!catalog.length){download.append(notice('Nenhuma imagem do catálogo é compatível com a arquitetura deste servidor.'));return wrapper;}
  const downloaded=new Set(images.flatMap(image=>(image.aliases||[]).map(alias=>alias.name)));
  const select=el('select',{name:'download-image',required:''},...catalog.map(item=>el('option',{value:item.remote_image,disabled:downloaded.has(item.remote_image)?'':null},item.label+(downloaded.has(item.remote_image)?' · já baixada':''))));
  select.value=catalog.find(item=>!downloaded.has(item.remote_image))?.remote_image||'';
  const button=el('button',{class:'primary',type:'submit'},...iconLabel('download','Baixar imagem'));
  const form=el('form',{class:'image-download-form'},el('label',{},'Imagem do catálogo',select),button);
  const inProgress=current&&current.status_code<200;
  select.disabled=Boolean(inProgress)||!select.value;button.disabled=select.disabled;
  download.append(el('small',{},'Catálogo Alpine e Debian · arquitetura '+(server.environment?.kernel_architecture||'do servidor')+' · requer Internet no servidor.'),form);
  if(!select.value)download.append(notice('Todas as imagens deste catálogo já estão disponíveis neste projeto.'));
  form.onsubmit=async event=>{
    event.preventDefault();if(button.disabled||session!==owner)return;
    select.disabled=true;button.disabled=true;
    const run={key,scope,owner,target:select.value,status_code:100,metadata:{}};
    imageDownloads.set(key,run);updateImageDownload(run);
    try{
      const result=await api('/api/images/download',{...scope,remote_image:run.target});
      if(session!==owner)return;
      Object.assign(run,result);
      trackTask(`${scope.host}/${scope.project}/${run.operation}`,{...scope,id:run.operation,target:run.target,action:'download-image',description:'Baixar '+run.target,status:'Em andamento',status_code:100});
      pollImageDownload(run);
    }catch(error){
      if(session!==owner)return;
      Object.assign(run,{status_code:400,err:error.message,uncertain:!error.status||error.status>=500});
      updateImageDownload(run);
      if(host===scope.host&&project===scope.project&&route().page==='images'){select.disabled=false;button.disabled=false;}
    }
  };
  return wrapper;
}
function imageDownloadStatus(run){
  const body=el('div',{class:'download-result'}),success=run.status_code===200,failed=run.status_code>=200&&!success;
  body.append(el('strong',{},(success?'Imagem baixada: ':failed?'Falha no download: ':'Baixando ')+run.target));
  if(success)body.append(el('p',{},'A imagem já está disponível neste projeto.'),el('a',{href:'#create',class:'button-link'},...iconLabel('plus','Criar container')));
  else if(failed)body.append(notice(run.err||'O Incus não concluiu o download.',true));
  else if(run.connectionError)body.append(notice(run.connectionError,true),el('button',{type:'button',onclick:()=>pollImageDownload(run)},'Consultar download novamente'));
  else{
    const raw=Object.entries(run.metadata||{}).find(([key,value])=>/progress/i.test(key)&&typeof value==='string')?.[1];
    const match=raw?.match(/(\d+(?:\.\d+)?)%/),value=match?Math.min(100,Math.max(0,Number(match[1]))):null;
    body.append(el('progress',{max:'100','aria-label':'Progresso do download',...(value===null?{}:{value:String(value)})}),el('p',{class:'muted'},raw||'Aguardando o progresso informado pelo Incus…'),el('small',{},'Você pode navegar pelo painel e voltar para acompanhar o download.'));
  }
  if(run.uncertain)body.append(notice('O resultado ainda não foi confirmado. Atualize Imagens ou consulte Tarefas antes de repetir.',true));
  return body;
}
function updateImageDownload(run){
  if(session===run.owner&&host===run.scope.host&&project===run.scope.project&&route().page==='images')$('.image-download-status')?.replaceChildren(imageDownloadStatus(run));
}
async function pollImageDownload(run){
  if(!watchingRun(run,'images')||!run.operation||run.polling)return;
  clearTimeout(run.timer);run.polling=true;
  try{
    const state=(await read('operation',run.operation,run.scope)).data;
    if(session!==run.owner)return;
    if(state.status_code===200&&!state.err){
      const images=(await read('images',undefined,run.scope)).data;
      if(session!==run.owner)return;
      if(!images.some(image=>image.fingerprint===state.metadata?.fingerprint||(image.aliases||[]).some(alias=>alias.name===run.target)))throw new Error('O Incus concluiu a operação, mas a imagem ainda não apareceu na lista. Consulte o download novamente.');
    }
    Object.assign(run,state,{connectionError:null});
    if(state.err)run.status_code=400;
    trackTask(`${run.scope.host}/${run.scope.project}/${run.operation}`,{...run.scope,...state,target:run.target,action:'download-image',description:'Baixar '+run.target});
    updateImageDownload(run);
    if(run.status_code<200){if(watchingRun(run,'images'))run.timer=setTimeout(()=>pollImageDownload(run),session.low_resource?5000:1500);}
    else if(watchingRun(run,'images')){readCache.clear();await render();}
  }catch(error){if(session===run.owner){run.connectionError=error.message;updateImageDownload(run);}}
  finally{run.polling=false;}
}
async function createView(scope,server) {
  if(!session.manage_all_instances)return advancedCreateView(scope,server);
  const key=scope.host+'/'+scope.project;
  if(creationRuns.has(key)){const run=creationRuns.get(key);resumeRun(run,pollCreation);return creationScreen(run);}
  const result=(await read('creation-images',undefined,scope)).data;
  const form=el('form',{class:'panel-body create-form'});
  const target=el('input',{name:'container-name',maxlength:'63',pattern:'[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?',placeholder:'Ex.: meu-servidor (opcional)',autocomplete:'off','aria-describedby':'container-name-help'});
  const image=el('input',{type:'hidden',value:result.images[0]?.id||''});
  const choices=el('div',{class:'image-choices',role:'group','aria-label':'Sistema operacional'});
  for(const item of result.images){
    const choice=el('button',{type:'button',class:'image-choice','aria-pressed':String(item.id===image.value)},el('span',{class:'os-icon','aria-hidden':'true'},item.label.slice(0,1).toUpperCase()),el('span',{},el('strong',{},item.label),el('small',{},item.remote_image?'Download automático':'Disponível neste servidor')),el('span',{class:'choice-check','aria-hidden':'true'},'✓'));
    choice.onclick=()=>{image.value=item.id;for(const button of choices.children)button.setAttribute('aria-pressed',String(button===choice));};
    choices.append(choice);
  }
  const button=el('button',{class:'primary',disabled:!result.images.length||session.read_only?'':null},...iconLabel('plus','Criar container'));
  const progress=el('div',{'aria-live':'polite',role:'status'});
  if(result.warning)form.append(notice(result.warning,true));
  form.append(el('label',{},'Nome do container · opcional',target),el('small',{id:'container-name-help'},'Deixe em branco para gerar um nome. Ou use letras, números e hífens.'),el('div',{class:'field-heading'},'Sistema operacional'),image,choices,notice('O armazenamento e a rede são configurados automaticamente. O container será criado e iniciado. ' + (session.low_resource?'Modo leve: limite de 128 MiB por container.':'')),button,progress);
  if(!result.images.length)form.append(notice('Nenhuma imagem compatível disponível. Confira a conexão da TV box com a Internet e tente novamente.',true),el('button',{type:'button',onclick:()=>render()},'Tentar novamente'));
  form.onsubmit=async event=>{
    event.preventDefault();if(button.disabled)return;button.disabled=true;image.disabled=true;target.disabled=true;
    for(const choice of choices.children)choice.disabled=true;
    const requestedName=target.value.trim();
    const run={key,scope,owner:session,target:requestedName||'Novo container',phase:'prepare',status_code:100,metadata:{}};
    creationRuns.set(key,run);$('#content').replaceChildren(creationScreen(run));
    const selected=result.images.find(i=>i.id===image.value);
    try{
      const created=await api('/api/create',{...scope,...(requestedName?{target:requestedName}:{}),...(selected.remote_image?{remote_image:selected.remote_image}:{image:selected.image})});
      if(session!==run.owner)return;
      Object.assign(run,created,{phase:'create'});updateCreationScreen(run);pollCreation(run);
    }catch(error){
      if(session!==run.owner)return;
      Object.assign(run,{status_code:400,err:error.message,uncertain:!error.status||error.status>=500});updateCreationScreen(run);
    }
  };
  return creationLayout(form,scope);
}
function updateCreationScreen(run){
  if(session===run.owner&&host===run.scope.host&&project===run.scope.project&&route().page==='create')$('#content').replaceChildren(creationScreen(run));
}
async function pollCreation(run){
  if(!watchingRun(run,'create')||!run.operation||run.polling)return;
  clearTimeout(run.timer);run.polling=true;
  try{
    const state=(await read('operation',run.operation,run.scope)).data;
    if(session!==run.owner)return;
    Object.assign(run,state,{connectionError:null});
    trackTask(`${run.scope.host}/${run.scope.project}/${run.operation}`,{...run.scope,...state,action:'create'});
    updateCreationScreen(run);
    if(state.status_code<200){if(watchingRun(run,'create'))run.timer=setTimeout(()=>pollCreation(run),session.low_resource?5000:1500);}
    else readCache.clear();
  }catch(error){run.connectionError=error.message;updateCreationScreen(run);}
  finally{run.polling=false;}
}
function creationScreen(run){
  const success=run.status_code===200,failed=run.status_code>=400;
  const phases=[['prepare','Preparar configuração'],['create','Baixar imagem e criar container'],['start','Iniciar container'],['verify','Confirmar funcionamento']];
  const current=success?phases.length:Math.max(0,phases.findIndex(([key])=>key===run.phase));
  const screen=el('section',{class:'panel creation-screen','aria-labelledby':'creation-heading'});
  const body=el('div',{class:'panel-body'});
  const label=success?'Container pronto':failed?'Não foi possível concluir':run.connectionError?'Conexão interrompida':'Criando seu container';
  body.append(el('div',{class:'creation-heading'},...(!success&&!failed&&!run.connectionError?[el('span',{class:'spinner','aria-hidden':'true'})]:[]),el('h2',{id:'creation-heading'},label)),el('p',{class:'creation-target'},run.target));
  const percentage=Object.entries(run.metadata||{}).filter(([key,value])=>/progress/i.test(key)&&typeof value==='string').sort(([a],[b])=>Number(/download/i.test(a))-Number(/download/i.test(b))).map(([,value])=>value.match(/(\d+(?:\.\d+)?)%/)).find(Boolean);
  const numeric=percentage?Math.min(100,Math.max(0,Number(percentage[1]))):null;
  const bar=el('progress',{max:'100','aria-label':'Progresso da etapa atual',...(success?{value:'100'}:numeric!==null?{value:String(numeric)}:{})});
  if(!failed&&!run.connectionError)body.append(bar,el('p',{class:'muted',role:'status'},success?'Container criado e em execução.':numeric!==null?`Progresso informado pelo Incus: ${numeric}% nesta etapa.`:'Etapa em andamento. Aguardando o progresso informado pelo Incus…'));
  body.append(el('ol',{class:'creation-steps'},...phases.map(([key,title],index)=>el('li',{class:index<current?'complete':index===current?'current':'','aria-current':index===current?'step':null},el('span',{'aria-hidden':'true'},index<current?'✓':String(index+1)),title))));
  if(success)body.append(el('a',{class:'primary creation-link',href:instanceLink(run.target)},'Abrir container →'));
  else if(failed)body.append(notice(run.err||'O Incus não concluiu a operação.',true));
  else if(!run.connectionError)body.append(el('p',{class:'muted'},'Você pode navegar pelo painel. A criação continua em segundo plano; volte a esta tela para acompanhar.'));
  if(run.connectionError)body.append(notice(run.connectionError,true),el('button',{type:'button',onclick:()=>pollCreation(run)},'Consultar novamente'));
  if(run.uncertain)body.append(notice('A conexão falhou antes da confirmação. Confira Containers ou Tarefas antes de tentar criar novamente.',true));
  if(success||failed)body.append(el('button',{type:'button',onclick:()=>{creationRuns.delete(run.key);render();}},success?'Criar outro container':'Voltar ao formulário'));
  screen.append(body);return screen;
}
async function advancedCreateView(scope,server) {
  const [images,profiles]=await Promise.all([read('images',undefined,scope),read('profiles',undefined,scope)]);
  const normalize=a=>({'armv7l':'armv7','armhf':'armv7','aarch64':'arm64','x86_64':'amd64','x86-64':'amd64'})[a]||a;
  const compatible=images.data.filter(i=>(i.type||'container')==='container'&&normalize(i.architecture)===normalize(server.environment?.kernel_architecture));
  const form=el('form',{class:'panel-body create-form'});
  const target=el('input',{required:'',pattern:'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}',placeholder:'lab-novo'});
  const image=el('select',{},...compatible.map(i=>el('option',{value:i.fingerprint},i.properties?.description||i.aliases?.[0]?.name||i.fingerprint)));
  const remote=el('input',{placeholder:'debian/12',value:''});
  const profile=el('select',{required:''},...profiles.data.map(p=>el('option',{value:p.name},p.name)));
  const advanced=el('details',{class:'advanced-options'},el('summary',{},'Opções avançadas'),el('label',{},'Perfil de configuração',profile),...(session.allow_remote_images?[el('label',{},'Outra imagem do catálogo · opcional',remote),el('small',{},'Exemplo: debian/12. Deixe em branco para usar a imagem selecionada acima.')]:[]));
  if(profiles.data.some(p=>p.name==='default'))profile.value='default';
  form.append(el('label',{},'1. Dê um nome ao container',target),el('small',{},'Use um nome curto para identificar seu ambiente.'),el('label',{},'2. Escolha o sistema operacional',image),advanced,el('div',{class:'setup-note'},el('span',{'aria-hidden':'true'},'✓'),el('div',{},el('strong',{},'Configuração pronta para usar'),el('p',{},'Rede e armazenamento seguem o perfil selecionado. Você não precisa informar nenhum caminho.'))),el('button',{class:'primary',disabled:session.read_only||session.role==='observador'||(!compatible.length&&!session.allow_remote_images)||!profiles.data.length?'':null},'Continuar →'));
  if(!profiles.data.length)form.prepend(notice('Nenhum perfil de configuração disponível. Peça ao administrador para configurar a rede e o armazenamento.',true));
  if(!compatible.length)form.prepend(notice(session.allow_remote_images?'Não há imagens locais. Abra Opções avançadas e informe uma imagem do catálogo.':'Nenhuma imagem compatível disponível neste servidor.',!session.allow_remote_images));
  form.onsubmit=event=>{event.preventDefault();openAction('create',target.value,{...(session.allow_remote_images&&remote.value.trim()?{remote_image:remote.value.trim()}:{image:image.value}),profiles:[profile.value]});};
  return creationLayout(form,scope);
}

function creationLayout(form,scope){
  return el('div',{class:'create-layout'},panel('Configure seu container',form),el('section',{class:'creation-guide'},el('div',{class:'guide-icon','aria-hidden':'true'},icon('box')),el('p',{class:'eyebrow'},'DO SEU JEITO, SEM COMPLICAÇÃO'),el('h2',{},'Um ambiente só para suas ideias.'),el('p',{},'Teste serviços, aprenda Linux e organize seus experimentos em containers.'),el('ol',{},el('li',{},'Escolha um nome e um sistema.'),el('li',{},'Confirme a criação no painel.'),el('li',{},'Acompanhe o resultado em Containers.')),el('div',{class:'destination'},el('small',{},'DESTINO SELECIONADO'),el('strong',{},session.hosts.find(h=>h.id===scope.host)?.alias||scope.host),el('span',{},'Projeto '+scope.project))));
}
api('/api/session').then(data=>{session=data;enter();}).catch(()=>{});
