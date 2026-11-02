'use strict';
const $ = s => document.querySelector(s);
let theme = 'light';
try { theme = localStorage.getItem('incus-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch {}
function applyTheme(value) {
  theme = value === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('incus-theme', theme); } catch {}
  const button = document.querySelector('#theme-toggle');
  if (button) {
    button.textContent = theme === 'dark' ? '☼' : '☾';
    button.setAttribute('aria-pressed', String(theme === 'dark'));
    button.setAttribute('aria-label', theme === 'dark' ? 'Mudar para tema claro' : 'Mudar para tema escuro');
    button.title = theme === 'dark' ? 'Tema claro' : 'Tema escuro';
  }
}
applyTheme(theme);
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
let inventory=[], serverInfo={}, taskLogScope='', taskLogItems=[], taskLogMode='tasks';
const instanceTabs=[['summary','◫','Resumo'],['console','>_','Console'],['resources','▤','Recursos'],['network','⌘','Rede'],['dns','☷','DNS'],['devices','▧','Dispositivos'],['options','⚙','Opções'],['backups','▣','Backup'],['snapshots','◷','Snapshots']];
function trackTask(key,task){
  tasks.set(key,task);
  if(tasks.size>100){const completed=[...tasks].find(([id,item])=>id!==key&&item.status_code>=200);tasks.delete(completed?.[0]||tasks.keys().next().value);}
  renderTaskLog();
}
function watchingRun(run,page){return session===run.owner&&host===run.scope.host&&project===run.scope.project&&route().page===page&&!document.hidden;}
function resumeRun(run,poll){if(run.status_code<200&&!run.connectionError&&!run.polling){clearTimeout(run.timer);run.timer=setTimeout(()=>poll(run),0);}}
const pages = [ ['overview','◫','Resumo'],['instances','▣','Containers'],['images','◇','Templates'],['storage','▤','Armazenamento'],['volumes','▣','Volumes'],['networks','⌘','Rede'],['profiles','☷','Perfis'],['projects','▱','Projetos'],['tasks','◷','Tarefas'],['alerts','△','Alertas'],['server','▧','Nó'],['settings','⚙','Permissões e sessão'],['users','♙','Usuários'] ];
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
  if(body&&['/api/action','/api/create','/api/images/download','/api/users'].includes(path))readCache.clear();
  const response = await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-CSRF-Token':session?.csrf || ''}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result = await response.json();
  if(body&&['/api/action','/api/create','/api/images/download','/api/users'].includes(path))readCache.clear();
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
  if(action==='console'){startTerminal(target).catch(showTerminalError);return;}
  pendingAction={host,project,action,target,...extra};
  $('#action-title').textContent=({start:'Iniciar container',stop:'Parar container',restart:'Reiniciar container',delete:'Excluir container permanentemente',create:'Criar container',snapshot:'Criar snapshot',backup:'Gerar backup','snapshot-restore':'Restaurar snapshot','snapshot-delete':'Excluir snapshot','backup-delete':'Excluir backup',console:'Abrir shell interativo'})[action];
  $('#action-description').textContent=action==='console'?'Este acesso abre /bin/sh, normalmente como root dentro do container. Comandos podem alterar ou apagar dados.':action==='delete'?'A exclusão remove permanentemente o container e seus snapshots.':action==='snapshot-restore'?'A restauração substitui o estado atual do container pelo snapshot selecionado. O container precisa estar parado.':action==='snapshot-delete'||action==='backup-delete'?'A exclusão remove permanentemente este arquivo de recuperação.':action==='snapshot'||action==='backup'?'A operação consome armazenamento. Blocos compartilhados não representam espaço recuperável garantido.':'Revise o destino. O resultado será confirmado pela operação Incus.';
  $('#action-review').textContent=`Container: ${target}\nServidor: ${session.hosts.find(h=>h.id===host)?.alias || host}\nProjeto: ${project}${extra.snapshot?`\nSnapshot: ${extra.snapshot}`:''}${extra.backup?`\nBackup: ${extra.backup}`:''}${extra.profiles ? '\nPerfil: '+extra.profiles.join(', ') : ''}`;
  const needsConfirmation=['delete','snapshot-restore','snapshot-delete','backup-delete'].includes(action);
  const artifact=extra.snapshot||extra.backup||'';
  const typedValue=artifact?`${host}/${project}/${target}/${artifact}`:target;
  $('#confirmation').parentElement.hidden=!needsConfirmation;
  $('#confirmation').required=needsConfirmation;
  $('#confirmation').value=''; $('#confirmation').placeholder=needsConfirmation?typedValue:`${host}/${project}/${target}`;
  $('#confirmation-label').textContent=needsConfirmation?`Digite ${typedValue} para confirmar`:'Digite o alvo completo para confirmar';
  $('#name-label').hidden=!['snapshot','backup'].includes(action);
  $('#artifact-name').required=!$('#name-label').hidden;
  $('#artifact-name').value=''; $('#action-error').textContent='';
  $('#submit-action').classList.toggle('danger-primary',['delete','snapshot-delete','backup-delete'].includes(action));
  $('#confirm').showModal(); (needsConfirmation?$('#confirmation'):$('#submit-action')).focus();
}
$('#cancel-action').onclick=()=>$('#confirm').close();
$('#confirm').addEventListener('cancel',event=>{if($('#submit-action').disabled)event.preventDefault();});
$('#action-form').onsubmit=async event=>{
  event.preventDefault(); $('#cancel-action').disabled=true; $('#submit-action').disabled=true;$('#submit-action').textContent='Processando…';
  try {
    const action={...pendingAction},owner=session;
    const artifact=action.snapshot||action.backup||'';
    const typedValue=artifact?`${action.host}/${action.project}/${action.target}/${artifact}`:action.target;
    if(['delete','snapshot-restore','snapshot-delete','backup-delete'].includes(action.action)&&$('#confirmation').value!==typedValue)throw new Error(`Digite ${typedValue} exatamente como exibido.`);
    if(pendingAction.action==='console'){
      const result=await api('/api/console/start',{...pendingAction,confirmation:$('#confirmation').value});
      consoleId=result.console;$('#confirm').close();pollConsole();return;
    }
    const data=await api('/api/action',{...action,confirmation:`${action.host}/${action.project}/${action.target}${artifact?'/'+artifact:''}`,name:$('#artifact-name').value});
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
  if($('#create-dialog').open)$('#create-dialog').close();
  if($('#task-detail').open)$('#task-detail').close();
  taskLogScope='';taskLogItems=[];inventory=[];
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
$('#theme-toggle').onclick=()=>applyTheme(theme==='dark'?'light':'dark');
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
  const params=new URLSearchParams(location.search);
  if(params.has('console')){document.body.classList.add('console-window');remembered={host:params.get('host'),project:params.get('project')};}
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
  const title=r.page==='overview'?'Datacenter':pages.find(p=>p[0]===r.page)?.[2] || (r.page==='instance'?'Container '+r.target:r.page==='create'?'Criar CT':'Página não encontrada');
  $('#title').textContent=title; $('#breadcrumb').textContent=`${host} / ${project} / ${title}`;
  $('#subtitle').textContent=r.page==='instance'?`Gerencie ${r.target} e acompanhe seus recursos.`:({overview:'Seu laboratório sob controle. Veja o que está acontecendo agora.',instances:'Encontre, acompanhe e gerencie seus containers.',create:'Escolha uma imagem. Nós cuidamos da configuração.',images:'Sistemas disponíveis para o seu próximo container.',storage:'Acompanhe o espaço disponível para seu laboratório.',networks:'Conexões que mantêm seus containers em rede.',projects:'Organize seus ambientes em projetos separados.'})[r.page]||'Gerencie os recursos do seu laboratório.';
  $('#object-actions').replaceChildren();
  $('#navigation').replaceChildren(...(r.page==='instance'?instanceTabs:pages.filter(page=>page[0]!=='users'||session.manage_users)).map(([key,symbol,label])=>el('a',{href:r.page==='instance'?instanceLink(r.target,key):'#'+key,class:(r.page==='instance'?r.tab===key:r.page===key)?'active':'','aria-current':(r.page==='instance'?r.tab===key:r.page===key)?'page':null},el('span',{},symbol),label)));
  if(r.page!=='create'&&$('#create-dialog').open)$('#create-dialog').close();
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
    inventory=instances;serverInfo=server;renderResourceTree();
    $('#create-ct').setAttribute('aria-disabled',String(session.read_only||session.role==='observador'));
    if(r.page==='overview') {
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
    else if(r.page==='volumes') container.append(await volumesView(scope));
    else if(r.page==='server') container.append(panel('Identidade e capacidades',el('div',{class:'panel-body'},kv([['Servidor',server.environment?.server_name],['Arquitetura',server.environment?.kernel_architecture],['Incus',server.environment?.server_version],['Cluster',server.environment?.server_clustered?'Configurado':'Não configurado'],['VM','Fora do escopo: extensão não comprova KVM'],['Origem','Incus /1.0']]),json(server.api_extensions))));
    else if(r.page==='images') container.append(await imagesView(scope,server));
    else if(['networks','profiles','projects'].includes(r.page)) {
      const result=await read(r.page,undefined,scope); const data=result.data;
      if(r.page==='networks'){
        container.append(panel('Redes do nó',table(['NOME','TIPO','ATIVA','IPv4 / CIDR','IPv6 / CIDR','NAT','CONFIGURAÇÃO'],data.map(item=>()=>[item.name,item.type,item.status||'n/d',item.config?.['ipv4.address']||'—',item.config?.['ipv6.address']||'—',item.config?.['ipv4.nat']==='true'?'Sim':'Não',inspect(item)]))));
        if(session.host_metrics)for(const network of data.filter(item=>item.managed&&item.type==='bridge')){
          try{
            const leases=(await read('network-leases',network.name,scope)).data;
            container.append(panel('Leases DHCP · '+network.name,table(['HOSTNAME','MAC','IPv4','IPv6'],leases.map(lease=>[lease.hostname||'—',lease.hwaddr||'—',lease.ipv4||'—',lease.ipv6||'—']))));
          }catch(error){container.append(errorNode(error));}
        }
        else container.append(notice('A lista de leases DHCP pode incluir outros Projects e exige a permissão de métricas globais do host.'));
      }
      else container.append(panel(title,table(['NOME','DESCRIÇÃO','CONFIGURAÇÃO'],data.map(item=>()=>[item.name,item.description||'—',inspect(item)]))));
      if(r.page==='projects')container.append(notice('A lista contém somente os escopos configurados no servidor do painel. A autorização final permanece no Incus.'));
    } else if(r.page==='tasks') container.append(await taskView(scope));
    else if(r.page==='create') container.append(await createView(scope,server));
    else if(r.page==='users') container.append(await usersView());
    else if(r.page==='settings') container.append(panel('Sessão e segurança',el('div',{class:'panel-body'},kv([['Identidade',session.username],['Papel',session.role],['Expira em',date(session.expires)],['Modo',session.read_only?'Somente leitura':'Mutações limitadas à allowlist'],['Autorização','Escopo no painel + '+transportLabel()],['Histórico','Auditoria temporária em memória, máximo de 200 registros']]),notice(session.low_resource?'Modo leve: inventário manual pelo botão Atualizar. Consulte Armazenamento e Alertas para verificar a capacidade dos pools.':'O inventário é atualizado a cada 15 segundos. Quando habilitados pelo administrador, eventos antecipam a atualização.'),el('button',{onclick:()=>$('#logout').click()},'Encerrar sessão')),null),panel('Auditoria desta identidade',json((await read('audit',undefined,scope)).data)));
    else container.append(empty('Página não encontrada.'));
    if(id!==generation||!session)return;
    const tracked=[...tasks.values()].filter(t=>t.host===scope.host&&t.project===scope.project);
    $('#task-summary').textContent=tracked.length?tracked.map(t=>`${t.target}: ${t.status}`).join(' · '):'Operações rastreadas pelo Incus';
    $('#content').replaceChildren(container); $('#connection').textContent=(session.demo?'● Simulação conectada':'● Conectado · '+transportLabel())+' · '+host+' / '+project;
    $('#updated').textContent='Inventário '+new Date(instancesResult.value.timestamp*1000).toLocaleTimeString('pt-BR');
    if(taskLogScope!==host+'/'+project){taskLogScope=host+'/'+project;taskLogItems=[];refreshTaskLog();}else renderTaskLog();
    if(r.page==='instance'&&r.tab==='console')mountTerminal(r.target,scope,id);
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
async function volumesView(scope) {
  if(!session.host_metrics)return notice('O inventário de volumes usa a API global de armazenamento e exige a permissão de métricas do host.',true);
  try{
    const pools=(await read('pools',undefined,scope)).data;
    const rows=[];
    for(const pool of pools){
      try{
        const volumes=(await read('volumes',pool.name,scope)).data;
        for(const volume of volumes)rows.push([pool.name,volume.name||'n/d',volume.type||'custom',volume.content_type||'filesystem',volume.project||scope.project,volume.description||'—']);
      }catch(error){rows.push([pool.name,'—','—','—','—',error.message]);}
    }
    return el('div',{},panel('Volumes de armazenamento',table(['POOL','NOME','TIPO','CONTEÚDO','PROJECT','DESCRIÇÃO'],rows)),notice('Inventário somente para leitura. A exclusão ou alteração de volumes não está habilitada no painel.'));
  }catch(error){return errorNode(error);}
}
function userScopesField(initial={}) {
  const fields=el('fieldset',{class:'user-scopes'},el('legend',{},'Hosts e Projects autorizados'));
  for(const [host,projects] of Object.entries(session.scopes||{})){
    const group=el('div',{class:'user-scope-host'},el('strong',{},host));
    for(const projectName of projects){
      const selected=(initial[host]||[]).includes(projectName);
      group.append(el('label',{class:'user-project'},el('input',{type:'checkbox',name:'project',value:projectName,'data-host':host,checked:selected?'':null}),el('span',{},projectName)));
    }
    fields.append(group);
  }
  return fields;
}
function userForm(initial=null) {
  const creating=!initial;
  const username=el('input',{name:'username',required:'',maxlength:'64',pattern:'[A-Za-z0-9][A-Za-z0-9_.@-]{0,63}',autocomplete:'username',value:initial?.username||'',readonly:creating?null:''});
  const role=el('select',{name:'role'},el('option',{value:'observador'},'Observador'),el('option',{value:'operador'},'Operador'),el('option',{value:'administrador'},'Administrador'));
  role.value=initial?.role||'observador';
  const password=el('input',{name:'password',type:'password',autocomplete:'new-password',minlength:'12',maxlength:'256',required:creating?'':null,placeholder:creating?'Mínimo 12 caracteres':'Deixe vazio para manter a senha'});
  const scopes=userScopesField(initial?.scopes||{});
  const hostMetrics=session.host_metrics?el('label',{class:'user-project'},el('input',{type:'checkbox',name:'host_metrics',checked:initial?.host_metrics?'':null}),el('span',{},'Permitir métricas globais do host')):null;
  const feedback=el('p',{class:'form-feedback',role:'status','aria-live':'polite'});
  const save=el('button',{type:'submit',class:'primary'},creating?'Criar usuário':'Salvar permissões');
  const form=el('form',{class:'panel-body user-form'},
    el('div',{class:'user-form-fields'},el('label',{},'Usuário',username),el('label',{},'Papel',role),el('label',{class:'user-password'},'Senha',password)),
    scopes,hostMetrics,el('small',{},'Cada conta fica limitada aos Projects selecionados. A alteração de permissões encerra as sessões existentes dessa conta.'),
    el('div',{class:'form-actions'},save),feedback);
  if(initial?.username===session.username){
    form.querySelectorAll('input,select,button').forEach(control=>control.disabled=true);
    feedback.textContent='Entre com outra conta administradora para alterar ou remover este usuário.';
  }
  form.onsubmit=async event=>{
    event.preventDefault();if(save.disabled)return;
    save.disabled=true;feedback.textContent='Salvando…';
    try{
      const selected={};
      for(const checkbox of form.querySelectorAll('input[name="project"]'))if(checkbox.checked)(selected[checkbox.dataset.host]??=[]).push(checkbox.value);
      const result=await api('/api/users',{action:creating?'create':'update',username:username.value,role:role.value,scopes:selected,host_metrics:hostMetrics?.querySelector('input').checked||false,password:password.value});
      notify(creating?'Usuário criado.':`Permissões de ${result.username} atualizadas.`);
      await render();
    }catch(error){feedback.textContent=error.message;save.disabled=false;}
  };
  return form;
}
async function usersView() {
  if(!session.manage_users)return notice('A gestão de usuários exige uma conta administradora e configuração persistente do painel.',true);
  try{
    const result=await api('/api/users');
    const users=result.users||[];
    const rows=users.map(user=>[user.username,user.role,Object.entries(user.scopes||{}).map(([host,projects])=>`${host}: ${projects.join(', ')}`).join(' · '),user.host_metrics?'Sim':'Não']);
    const container=el('div',{},panel('Contas visíveis neste escopo',table(['USUÁRIO','PAPEL','PROJECTS','MÉTRICAS DO HOST'],rows)));
    for(const user of users)container.append(panel('Permissões · '+user.username,userForm(user),user.username===session.username?null:el('button',{type:'button',class:'danger-button',onclick:async()=>{
      if(!window.confirm(`Remover a conta ${user.username}? As sessões abertas serão encerradas.`))return;
      try{await api('/api/users',{action:'delete',username:user.username});notify(`Conta ${user.username} removida.`);await render();}
      catch(error){notify(error.message);}
    }},'Remover conta')));
    container.append(panel('Criar conta',userForm()));
    container.append(notice('As permissões são aplicadas no servidor em cada requisição. Administradores só podem conceder Projects que já estejam em seu próprio escopo.'));
    return container;
  }catch(error){return errorNode(error);}
}
async function detail(r,scope) {
  const [instanceResult,stateResult]=await Promise.all([read('instance',r.target,scope),['summary','resources','network'].includes(r.tab)?read('state',r.target,scope):Promise.resolve(null)]);
  const item=instanceResult.data,state=stateResult?.data||{status:item.status};
  const wrapper=el('div',{class:'instance-content'});
  const actions=el('div',{class:'toolbar object-toolbar'},status(state.status));
  for(const [action,label] of [['start','Iniciar'],['stop','Desligar'],['restart','Reiniciar']]){
    const button=actionButton(label,action,r.target);
    if((action==='start'&&state.status!=='Stopped')||(action!=='start'&&state.status!=='Running'))button.disabled=true;
    actions.append(button);
  }
  actions.append(el('a',{class:'button-link',href:instanceLink(r.target,'console')},'>_ Console'),el('button',{type:'button',title:'Abrir console em nova janela',disabled:!session.enable_console||!canMutate(r.target)||state.status!=='Running'?'':null,onclick:()=>openConsoleWindow(r.target)},'Console ↗'));
  if(session.role==='administrador'){
    const remove=actionButton('Remover','delete',r.target);
    if(item.status!=='Stopped'||(item.expanded_config?.['security.protection.delete']??item.config?.['security.protection.delete'])==='true')remove.disabled=true;
    actions.append(remove);
  }
  $('#object-actions').replaceChildren(...actions.childNodes);
  if(r.tab==='summary') {
    wrapper.append(el('div',{class:'grid resource-summary'},panel('Estado',el('div',{class:'panel-body'},kv([['Nome',item.name],['Nó',scope.host],['Projeto',scope.project],['Estado',status(state.status)],['Arquitetura',item.architecture],['Sistema',item.expanded_config?.['image.description']||item.config?.['image.description']||'n/d'],['Perfis',(item.profiles||[]).join(', ')],['Inicializar no boot',(item.expanded_config?.['boot.autostart']??item.config?.['boot.autostart'])==='true'?'Sim':'Não']]))),panel('Uso de recursos',el('div',{class:'panel-body'},kv([['Memória em uso',bytes(state.memory?.usage)],['Limite de memória',item.expanded_config?.['limits.memory']||'Sem limite explícito'],['CPU acumulada',state.cpu?.usage==null?'n/d':fmt(state.cpu.usage/1e9)+' s'],['Limite de CPU',item.expanded_config?.['limits.cpu']||'Herdado'],['Uso de disco',bytes(state.disk?.root?.usage)],['Última coleta',date(stateResult.timestamp)]])))));
    wrapper.append(panel('Notas',el('div',{class:'panel-body'},el('p',{},item.description||'Nenhuma descrição definida.'),el('a',{class:'button-link',href:instanceLink(r.target,'options')},...iconLabel('edit','Editar notas e opções')))));
    if(!canMutate(r.target))wrapper.append(notice('Ações bloqueadas pelo modo de leitura, papel ou autorização deste container.'));
  } else if(r.tab==='resources'){
    wrapper.append(panel('Recursos',table(['RECURSO','CONFIGURAÇÃO','USO ATUAL'],[['Memória',item.expanded_config?.['limits.memory']||'Herdado',bytes(state.memory?.usage)],['Núcleos',item.expanded_config?.['limits.cpu']||'Herdado','—'],['Limite de CPU',item.expanded_config?.['limits.cpu.allowance']||'Herdado',state.cpu?.usage==null?'n/d':fmt(state.cpu.usage/1e9)+' s acumulados'],...Object.entries(item.expanded_devices||{}).filter(([,d])=>d.type==='disk').map(([key,d])=>['Disco ('+key+')',(d.pool||'')+' · '+(d.size||'Capacidade do pool'),bytes(state.disk?.[key]?.usage)])]),el('a',{class:'button-link',href:instanceLink(r.target,'options')},'Editar')));
  } else if(r.tab==='network'){
    wrapper.append(panel('Interfaces de rede',table(['NOME','TIPO','BRIDGE / REDE','MAC','ENDEREÇOS'],Object.entries(item.expanded_devices||{}).filter(([,d])=>d.type==='nic').map(([key,d])=>{const nic=state.network?.[d.name||key];return [d.name||key,d.nictype||'Gerenciada',d.network||d.parent||'n/d',nic?.hwaddr||d.hwaddr||'n/d',(nic?.addresses||[]).map(a=>a.address+(a.netmask?'/'+a.netmask:'')).join(', ')||d['ipv4.address']||'DHCP / não informado'];}))));
  } else if(r.tab==='dns'){
    const networks=(await read('networks',undefined,scope)).data;
    const used=new Set(Object.values(item.expanded_devices||{}).filter(d=>d.type==='nic').map(d=>d.network));
    wrapper.append(panel('DNS herdado da rede',table(['REDE','DOMÍNIO','MODO','GATEWAY IPv4'],networks.filter(n=>used.has(n.name)).map(n=>[n.name,n.config?.['dns.domain']||'Padrão do Incus',n.config?.['dns.mode']||'Padrão do Incus',n.config?.['ipv4.address']||'n/d']))),notice('O container recebe DNS pelo DHCP da bridge. Alterações feitas dentro do sistema convidado não são consultadas por esta tela.'));
  } else if(r.tab==='devices')wrapper.append(panel('Dispositivos',table(['DISPOSITIVO','ORIGEM','CONFIGURAÇÃO'],Object.entries(item.expanded_devices||{}).map(([key,value])=>[key,Object.hasOwn(item.devices||{},key)?'Local':'Herdado de perfil',json(value)]))));
  else if(r.tab==='options')wrapper.append(editView(item,scope));
  else if(['snapshots','backups'].includes(r.tab)){
    const result=await read(r.tab,r.target,scope);
    const artifacts=result.data.map(item=>{
      const rawName=typeof item==='string'?item:item.name;
      const artifact=String(rawName||'').split('/').pop();
      const controls=el('div',{class:'row-actions'});
      if(r.tab==='snapshots'){
        const restore=actionButton('Restaurar','snapshot-restore',r.target,{snapshot:artifact});
        restore.disabled=!(session.role==='administrador'&&canMutate(r.target)&&state.status==='Stopped');
        const remove=actionButton('Excluir','snapshot-delete',r.target,{snapshot:artifact});
        remove.disabled=!(session.role==='administrador'&&canMutate(r.target));
        controls.append(restore,remove);
      }else{
        const remove=actionButton('Excluir','backup-delete',r.target,{backup:artifact});
        remove.disabled=!(session.role==='administrador'&&canMutate(r.target));
        controls.append(remove);
      }
      return [artifact,date(item.created_at),date(item.expires_at),controls];
    });
    wrapper.append(panel(r.tab==='snapshots'?'Snapshots':'Backups',table(['NOME','CRIADO EM','EXPIRA EM','AÇÕES'],artifacts),actionButton('Criar',r.tab==='snapshots'?'snapshot':'backup',r.target)));
    wrapper.append(notice(r.tab==='snapshots'?'Você pode restaurar ou excluir snapshots. A restauração substitui o estado atual e só está disponível com o container parado.':'Backups podem ser criados e excluídos. O download e a importação de arquivos ainda não estão disponíveis.'));
  } else if(r.tab==='console'){
    const allowed=session.enable_console&&canMutate(r.target)&&state.status==='Running'&&!session.demo;
    const controls=el('div',{class:'toolbar'},el('span',{id:'terminal-status',class:'terminal-status',role:'status'},allowed?'Conectando…':'Console indisponível'),el('button',{type:'button',disabled:allowed?null:'',onclick:()=>startTerminal(r.target).catch(showTerminalError)},'Reconectar'),el('button',{type:'button',onclick:()=>{closeConsole();const statusNode=$('#terminal-status');if(statusNode)statusNode.textContent='Desconectado';}},'Desconectar'));
    wrapper.append(el('section',{class:'panel terminal-panel'},el('div',{class:'panel-head'},el('h2',{},'Console · '+r.target),controls),el('div',{class:'panel-body'},el('div',{id:'console-output',class:'terminal-host','aria-label':'Terminal interativo do container'})),el('div',{class:'terminal-help'},'Shell /bin/sh · teclado direto · Ctrl+C interrompe · Tab completa · Ctrl+Shift+C copia a seleção')));
    if(!allowed)wrapper.prepend(notice(session.demo?'O modo demonstração não emula um shell. O console interativo exige um container Incus real.':!session.enable_console?'Habilite enable_console na configuração do painel.':state.status!=='Running'?'Inicie o container para acessar o console.':'Seu usuário não tem permissão para abrir o console.'));
    wrapper.dataset.connectConsole=String(allowed);
  } else wrapper.append(empty('Página não encontrada.'));
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

let terminalState=null,terminalLibrary,consoleClosing=Promise.resolve();
function loadTerminalLibrary(){
  if(!terminalLibrary)terminalLibrary=(async()=>{
    for(const src of ['/vendor/xterm.js','/vendor/addon-fit.js'])await new Promise((resolve,reject)=>{const script=el('script',{src});script.onload=resolve;script.onerror=()=>reject(new Error('Não foi possível carregar o terminal local.'));document.head.append(script);});
  })().catch(error=>{terminalLibrary=null;throw error;});
  return terminalLibrary;
}
function showTerminalError(error){const node=$('#terminal-status');if(node)node.textContent=error.message;}
async function mountTerminal(target,scope,renderId){
  if(!$('#console-output')||$('#content [data-connect-console]')?.dataset.connectConsole!=='true')return;
  try{await loadTerminalLibrary();if(generation!==renderId||!session||host!==scope.host||project!==scope.project)return;await startTerminal(target);}catch(error){showTerminalError(error);}
}
async function closeConsole(){
  clearTimeout(consoleTimer);
  const state=terminalState,id=consoleId;terminalState=null;consoleId=null;
  if(state){state.cancelled=true;clearTimeout(state.inputTimer);state.observer?.disconnect();state.input?.dispose();state.term?.dispose();}
  if(id&&session){const owner=session;consoleClosing=consoleClosing.catch(()=>{}).then(()=>session===owner?api('/api/console/close',{console:id}):null).catch(()=>{});}
  await consoleClosing;
}
async function startTerminal(target){
  const owner=session,scope={host,project};
  await closeConsole();
  const output=$('#console-output');if(!output||!session||session!==owner||host!==scope.host||project!==scope.project||route().page!=='instance'||route().target!==target||route().tab!=='console')return;
  const state={cancelled:false,pending:'',inputChain:Promise.resolve()};
  terminalState=state;
  await loadTerminalLibrary();if(state.cancelled||session!==owner)return;
  state.term=new Terminal({cursorBlink:false,scrollback:1500,fontFamily:'Consolas, "Courier New", monospace',fontSize:13,theme:{background:'#171717',foreground:'#eeeeee'},allowProposedApi:false,screenReaderMode:true});
  state.term.open(output);state.fit=new FitAddon.FitAddon();state.term.loadAddon(state.fit);state.fit.fit();
  state.term.writeln('Conectando ao container '+target+'…');
  let result;
  try{result=await api('/api/console/start',{...scope,target,confirmation:`${scope.host}/${scope.project}/${target}`});}
  catch(error){if(!state.cancelled){state.term.writeln('\r\n'+error.message);showTerminalError(error);}return;}
  if(state.cancelled||session!==owner){if(session===owner)api('/api/console/close',{console:result.console}).catch(()=>{});return;}
  consoleId=result.console;state.id=result.console;state.term.clear();
  const statusNode=$('#terminal-status');if(statusNode)statusNode.textContent='Conectado · '+target;
  const flush=()=>{
    if(state.cancelled||!state.pending)return;
    const text=state.pending.slice(0,4096);state.pending=state.pending.slice(4096);
    state.inputChain=state.inputChain.then(()=>state.cancelled?null:api('/api/console/input',{console:state.id,text})).catch(error=>{showTerminalError(error);closeConsole();});
    if(state.pending)state.inputTimer=setTimeout(flush,16);
  };
  state.input=state.term.onData(data=>{state.pending+=data;clearTimeout(state.inputTimer);state.inputTimer=setTimeout(flush,16);});
  state.term.attachCustomKeyEventHandler(event=>{
    if(event.ctrlKey&&event.shiftKey&&event.code==='KeyC'&&state.term.hasSelection()){if(event.type==='keydown')navigator.clipboard?.writeText(state.term.getSelection()).catch(()=>{});return false;}
    return true;
  });
  const resize=()=>{
    if(state.cancelled||!output.isConnected)return;
    state.fit.fit();const width=Math.max(20,Math.min(300,state.term.cols)),height=Math.max(5,Math.min(100,state.term.rows));
    if(state.term.cols!==width||state.term.rows!==height)state.term.resize(width,height);
    if(state.lastSize===width+'x'+height)return;state.lastSize=width+'x'+height;
    api('/api/console/resize',{console:state.id,width,height}).catch(showTerminalError);
  };
  state.observer=new ResizeObserver(resize);state.observer.observe(output);resize();state.term.focus();pollConsole();
}
async function pollConsole(){
  const id=consoleId,state=terminalState;if(!id||!state||state.cancelled)return;
  try{
    const result=await api('/api/console/read?'+new URLSearchParams({console:id}));if(consoleId!==id||state.cancelled)return;
    if(result.output)state.term.write(result.output);
    if(result.closed){state.term.writeln('\r\n[Console encerrado]');state.input?.dispose();state.observer?.disconnect();consoleId=null;showTerminalError(new Error('Desconectado'));api('/api/console/close',{console:id}).catch(()=>{});return;}
    consoleTimer=setTimeout(pollConsole,document.hidden?2000:result.output?100:400);
  }catch(error){if(consoleId===id){showTerminalError(error);closeConsole();}}
}
async function openConsoleWindow(target){
  const params=new URLSearchParams({console:target,host,project});
  const popup=window.open('about:blank','incus-console-'+host+'-'+project+'-'+target,'popup,width=1000,height=650');
  if(!popup){notify('O navegador bloqueou a janela. Permita pop-ups ou use a aba Console.');return;}
  await closeConsole();popup.location.href='/?'+params+instanceLink(target,'console');
}
window.addEventListener('pagehide',()=>{if(consoleId&&session)fetch('/api/console/close',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrf},body:JSON.stringify({console:consoleId}),keepalive:true}).catch(()=>{});});
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
let createReturnHash='#instances';
document.addEventListener('click',event=>{if(event.target.closest('a[href="#create"]')&&route().page!=='create')createReturnHash=location.hash||'#overview';});
function closeCreateWizard(){if($('#create-dialog').open)$('#create-dialog').close();if(route().page==='create')location.hash=createReturnHash;}
$('#close-create').onclick=closeCreateWizard;
$('#create-dialog').addEventListener('cancel',event=>{event.preventDefault();closeCreateWizard();});
async function createView(scope,server) {
  const key=scope.host+'/'+scope.project;
  if(creationRuns.has(key)){const run=creationRuns.get(key);resumeRun(run,pollCreation);return creationScreen(run);}
  const owner=session;
  const [catalog,poolsResult,networksResult,profilesResult]=await Promise.all([read('creation-images',undefined,scope),session.host_metrics?read('pools',undefined,scope):Promise.resolve({data:[]}),read('networks',undefined,scope),read('profiles',undefined,scope)]);
  if(session!==owner||route().page!=='create'||host!==scope.host||project!==scope.project)return el('div');
  const images=catalog.data.images,pools=poolsResult.data.filter(p=>p.status==='Created'),networks=networksResult.data.filter(n=>n.managed&&n.type==='bridge'&&n.status==='Created');
  const profile=profilesResult.data.find(p=>p.name==='default');
  const target=el('input',{name:'container-name',maxlength:'63',pattern:'[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?',placeholder:'Gerar automaticamente',autocomplete:'off',required:session.manage_all_instances?null:''});
  const description=el('textarea',{name:'description',rows:'2',maxlength:'2048'});
  const image=el('select',{name:'image',required:''},images.map(i=>el('option',{value:i.id},i.label+(i.remote_image?' · download':' · local'))));
  const pool=el('select',{name:'pool',required:session.host_metrics?'':null},pools.map(p=>el('option',{value:p.name},p.name+' ('+p.driver+')')));
  if(!session.host_metrics)pool.append(el('option',{value:''},'Automático / perfil default'));
  const defaultRoot=Object.values(profile?.devices||{}).find(d=>d.type==='disk'&&d.path==='/');if(pools.some(p=>p.name===defaultRoot?.pool))pool.value=defaultRoot.pool;
  const disk=el('input',{name:'disk-gib',type:'number',min:'1',max:'65536',placeholder:'Capacidade do pool'});
  const diskHelp=el('small');
  const cores=el('input',{name:'cpu-cores',type:'number',min:'1',max:'1024',value:'1',required:''});
  const allowance=el('input',{name:'cpu-allowance',type:'number',min:'1',max:'100',value:session.low_resource?'50':'100',required:''});
  const memory=el('input',{name:'memory-mib',type:'number',min:'32',max:'1048576',value:'128',required:''});
  const network=el('select',{name:'network',required:''},networks.map(n=>el('option',{value:n.name},n.name)));
  const defaultNicEntry=Object.entries(profile?.devices||{}).find(([,d])=>d.type==='nic'),defaultNic=defaultNicEntry?.[1];if(networks.some(n=>n.name===defaultNic?.network))network.value=defaultNic.network;
  const ipv4Mode=el('select',{name:'ipv4-mode'},el('option',{value:'dhcp'},'DHCP'),el('option',{value:'static'},'Reserva IPv4 no DHCP'));
  const ipv4=el('input',{name:'ipv4',placeholder:'Ex.: 10.100.0.10',disabled:''});
  const subnet=el('input',{readonly:'','aria-label':'Sub-rede IPv4'}),domain=el('input',{readonly:''}),dnsMode=el('input',{readonly:''});
  const autostart=el('input',{name:'autostart',type:'checkbox'}),start=el('input',{name:'start-after-create',type:'checkbox',checked:''});
  const field=(label,input,cls)=>el('label',{class:cls},label,input);
  const fields=(...nodes)=>el('div',{class:'wizard-fields'},nodes);
  const page=(...nodes)=>el('section',{class:'wizard-page',role:'tabpanel'},nodes);
  const unprivileged=el('input',{type:'checkbox',checked:session.manage_all_instances||profile?.config?.['security.privileged']!=='true'?'':null,disabled:''});
  const review=el('div');
  const sections=[
    page(fields(field('Nó',el('input',{value:scope.host,readonly:''})),field('Projeto',el('input',{value:scope.project,readonly:''})),field('Nome / hostname',target),field('Sem privilégios',unprivileged),field('Iniciar no boot',autostart),field('Descrição',description,'full')),notice('O Incus usa o nome como identificador do container. O console abre um shell autenticado pelo painel, sem exigir senha de root do convidado.')),
    page(fields(field('Template',image,'full'),el('small',{},'Arquitetura: '+(server.environment?.kernel_architecture||'n/d')+'. Imagens remotas são baixadas pelo Incus.')),catalog.data.warning?notice(catalog.data.warning):null),
    page(fields(field('Armazenamento',pool),field('Disco (GiB)',disk),diskHelp),notice('O disco raiz usa o pool selecionado. Sem cota explícita, utiliza a capacidade disponível do pool.')),
    page(fields(field('Núcleos',cores),field('Limite CPU (%)',allowance)),notice('No modo leve, o padrão é um núcleo com 50% de tempo de CPU.')),
    page(fields(field('Memória (MiB)',memory)),notice('O limite é aplicado ao container. Download e extração de imagens também usam memória no host.')),
    page(fields(field('Interface',el('input',{readonly:'',value:defaultNic?.name||defaultNicEntry?.[0]||'eth0'})),field('Bridge',network),field('IPv4',ipv4Mode),field('Endereço IPv4',ipv4),field('Sub-rede',subnet,'full')),notice('A reserva IPv4 precisa pertencer à sub-rede e estar livre. Gateway, DNS e IPv6 são recebidos da bridge.')),
    page(fields(field('Domínio DNS',domain,'full'),field('Modo DNS',dnsMode,'full')),notice('Configuração herdada da bridge do Incus. O assistente preserva o DNS entregue por DHCP.')),
    page(review,fields(field('Iniciar após criar',start,'full')))
  ];
  const titles=['Geral','Template','Discos','CPU','Memória','Rede','DNS','Confirmar'];
  const tabs=el('div',{class:'wizard-tabs',role:'tablist','aria-label':'Etapas de criação'}),error=el('p',{class:'wizard-error',role:'alert'});
  let step=0;
  const back=el('button',{type:'button',onclick:()=>show(step-1)},'Anterior'),next=el('button',{type:'button',onclick:()=>{if(validate(step))show(step+1);}},'Próximo'),submit=el('button',{type:'submit',class:'primary'},'Concluir');
  const form=el('form',{class:'wizard-form',novalidate:''},tabs,...sections,error,el('div',{class:'wizard-footer'},el('small',{},'Container Incus · '+scope.host+' / '+scope.project),el('button',{type:'button',onclick:closeCreateWizard},'Cancelar'),back,next,submit));
  const tabButtons=titles.map((title,index)=>{const button=el('button',{type:'button',role:'tab',id:'wizard-tab-'+index,'aria-controls':'wizard-page-'+index,onclick:()=>{if(index<=step||validateThrough(index))show(index);}},title);sections[index].id='wizard-page-'+index;sections[index].setAttribute('aria-labelledby',button.id);return button;});tabs.append(...tabButtons);
  function validate(index){
    error.textContent='';
    for(const input of sections[index].querySelectorAll('input,select,textarea'))if(!input.checkValidity()){input.reportValidity();return false;}
    if(index===1&&!images.length){error.textContent='Nenhuma imagem compatível. Baixe um template e tente novamente.';return false;}
    if(index===2&&session.manage_all_instances&&session.host_metrics&&!pool.value){error.textContent='Nenhum pool disponível. Configure o armazenamento no Incus.';return false;}
    if(index===5&&session.manage_all_instances&&!network.value){error.textContent='Nenhuma bridge gerenciada disponível. Configure a rede no Incus.';return false;}
    return true;
  }
  function validateThrough(index){for(let i=0;i<index;i++)if(!validate(i)){const message=error.textContent;show(i);error.textContent=message;return false;}return true;}
  function show(index){
    step=Math.max(0,Math.min(7,index));error.textContent='';
    sections.forEach((section,i)=>section.hidden=i!==step);
    tabButtons.forEach((button,i)=>{button.classList.toggle('active',i===step);button.setAttribute('aria-selected',String(i===step));button.tabIndex=i===step?0:-1;});
    back.disabled=step===0;next.hidden=step===7;submit.hidden=step!==7;submit.disabled=session.read_only||session.role==='observador'||!images.length;
    if(step===7){
      const inherited=!session.manage_all_instances,config=profile?.config||{};
      review.replaceChildren(table(['PARÂMETRO','VALOR'],[['Nó',scope.host],['Projeto',scope.project],['Nome',target.value.trim()||'Gerado automaticamente'],['Template',images.find(i=>i.id===image.value)?.label||'—'],['Disco raiz',(pool.value||defaultRoot?.pool||'Automático')+(disk.value&&!disk.disabled?' · '+disk.value+' GiB':' · capacidade do pool')],['CPU',inherited?(config['limits.cpu']||'Herdado do perfil default'):cores.value+' núcleo(s) · '+allowance.value+'%'],['Memória',inherited?(config['limits.memory']||'Herdada do perfil default'):memory.value+' MiB'],['Rede',inherited?(defaultNic?.network||defaultNic?.parent||'Herdada do perfil default'):network.value+' · '+(ipv4Mode.value==='static'?ipv4.value:'DHCP')],['DNS',domain.value],['Inicializar no boot',inherited?(config['boot.autostart']||'Herdado do perfil default'):autostart.checked?'Sim':'Não'],['Descrição',inherited?'Herdada do perfil default':description.value||'—']]));
    }
    if(index>0)tabButtons[step].focus({preventScroll:true});
  }
  tabs.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=event.key==='Home'?0:event.key==='End'?7:step+(event.key==='ArrowRight'?1:-1);if(index<=step||validateThrough(index))show(index);}};
  function updatePool(){const supportsQuota=['btrfs','zfs','lvm','ceph'].includes(pools.find(p=>p.name===pool.value)?.driver);disk.disabled=!supportsQuota||!session.manage_all_instances;diskHelp.textContent=supportsQuota?'Cota opcional de disco raiz em GiB.':'Este driver utiliza a capacidade do pool. Cota de disco indisponível neste assistente.';}
  function updateNetwork(){const config=networks.find(n=>n.name===network.value)?.config||{};subnet.value=config['ipv4.address']||'Não informado';domain.value=config['dns.domain']||'Padrão do Incus';dnsMode.value=config['dns.mode']||'Padrão do Incus';ipv4.disabled=ipv4Mode.value!=='static';ipv4.required=!ipv4.disabled;}
  pool.onchange=updatePool;network.onchange=updateNetwork;ipv4Mode.onchange=updateNetwork;updatePool();updateNetwork();
  if(!session.manage_all_instances){for(const input of [description,pool,disk,cores,allowance,memory,network,ipv4Mode,ipv4,autostart,start])input.disabled=true;sections[0].append(notice('Neste escopo, a criação usa a configuração do perfil default e exige um nome autorizado. Ajustes de recursos ficam disponíveis após criar.'));}
  form.onsubmit=async event=>{
    event.preventDefault();if(step!==7){if(validate(step))show(step+1);return;}if(!validateThrough(7)||submit.disabled)return;
    const selected=images.find(i=>i.id===image.value),requestedName=target.value.trim();if(!selected)return;
    const options={memory_mib:Number(memory.value),cpu_cores:Number(cores.value),cpu_allowance:Number(allowance.value),autostart:autostart.checked,start:start.checked,pool:pool.value,network:network.value,description:description.value};
    if(disk.value&&!disk.disabled)options.disk_gib=Number(disk.value);if(ipv4Mode.value==='static'&&ipv4.value)options.ipv4=ipv4.value.trim();
    const body={...scope,...(requestedName?{target:requestedName}:{}),...(selected.remote_image?{remote_image:selected.remote_image}:{image:selected.image})};
    if(!session.manage_all_instances){$('#create-dialog').close();openAction('create',requestedName,{...body,profiles:profile?['default']:[]});return;}
    const run={key,scope,owner:session,target:requestedName||'Novo container',phase:'prepare',status_code:100,metadata:{},start_after_create:start.checked};
    creationRuns.set(key,run);$('#create-dialog').close();$('#content').replaceChildren(creationScreen(run));
    try{const created=await api('/api/create',{...body,options});if(session!==run.owner)return;Object.assign(run,created,{phase:'create'});updateCreationScreen(run);pollCreation(run);}
    catch(error){if(session!==run.owner)return;Object.assign(run,{status_code:400,err:error.message,uncertain:!error.status||error.status>=500});updateCreationScreen(run);}
  };
  show(0);$('#create-dialog-content').replaceChildren(form);if(!$('#create-dialog').open)$('#create-dialog').showModal();
  return panel('Criar container',el('div',{class:'panel-body create-launcher'},el('p',{},'Configure o container no assistente: Geral, Template, Discos, CPU, Memória, Rede, DNS e Confirmar.'),el('button',{type:'button',onclick:()=>$('#create-dialog').showModal()},'Abrir assistente')));
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
  const phases=[['prepare','Preparar configuração'],['create','Baixar imagem e criar container'],...(run.start_after_create===false?[]:[['start','Iniciar container']]),['verify','Confirmar funcionamento']];
  const current=success?phases.length:Math.max(0,phases.findIndex(([key])=>key===run.phase));
  const screen=el('section',{class:'panel creation-screen','aria-labelledby':'creation-heading'});
  const body=el('div',{class:'panel-body'});
  const label=success?'Container pronto':failed?'Não foi possível concluir':run.connectionError?'Conexão interrompida':'Criando seu container';
  body.append(el('div',{class:'creation-heading'},...(!success&&!failed&&!run.connectionError?[el('span',{class:'spinner','aria-hidden':'true'})]:[]),el('h2',{id:'creation-heading'},label)),el('p',{class:'creation-target'},run.target));
  const percentage=Object.entries(run.metadata||{}).filter(([key,value])=>/progress/i.test(key)&&typeof value==='string').sort(([a],[b])=>Number(/download/i.test(a))-Number(/download/i.test(b))).map(([,value])=>value.match(/(\d+(?:\.\d+)?)%/)).find(Boolean);
  const numeric=percentage?Math.min(100,Math.max(0,Number(percentage[1]))):null;
  const bar=el('progress',{max:'100','aria-label':'Progresso da etapa atual',...(success?{value:'100'}:numeric!==null?{value:String(numeric)}:{})});
  if(!failed&&!run.connectionError)body.append(bar,el('p',{class:'muted',role:'status'},success?(run.start_after_create===false?'Container criado e parado, conforme solicitado.':'Container criado e em execução.'):numeric!==null?`Progresso informado pelo Incus: ${numeric}% nesta etapa.`:'Etapa em andamento. Aguardando o progresso informado pelo Incus…'));
  body.append(el('ol',{class:'creation-steps'},...phases.map(([key,title],index)=>el('li',{class:index<current?'complete':index===current?'current':'','aria-current':index===current?'step':null},el('span',{'aria-hidden':'true'},index<current?'✓':String(index+1)),title))));
  if(success)body.append(el('a',{class:'primary creation-link',href:instanceLink(run.target)},'Abrir container →'),run.start_after_create!==false?el('a',{class:'button-link creation-link',href:instanceLink(run.target,'console')},'>_ Console'):null);
  else if(failed)body.append(notice(run.err||'O Incus não concluiu a operação.',true));
  else if(!run.connectionError)body.append(el('p',{class:'muted'},'Você pode navegar pelo painel. A criação continua em segundo plano; volte a esta tela para acompanhar.'));
  if(run.connectionError)body.append(notice(run.connectionError,true),el('button',{type:'button',onclick:()=>pollCreation(run)},'Consultar novamente'));
  if(run.uncertain)body.append(notice('A conexão falhou antes da confirmação. Confira Containers ou Tarefas antes de tentar criar novamente.',true));
  if(success||failed)body.append(el('button',{type:'button',onclick:()=>{creationRuns.delete(run.key);render();}},success?'Criar outro container':'Voltar ao formulário'));
  screen.append(body);return screen;
}
function renderResourceTree(){
  if(!session)return;
  const r=route(),term=$('#global-search').value.trim().toLowerCase();
  const root=el('a',{href:'#overview',role:'treeitem',class:r.page==='overview'?'active':''},'▾ ▦ Datacenter');
  const hostLink=el('a',{href:'#server',role:'treeitem',class:'tree-node'+(r.page==='server'?' active':'')},'▾ ▧ '+(serverInfo.environment?.server_name||host));
  const projectLink=el('a',{href:'#projects',role:'treeitem',class:'tree-project'+(r.page==='projects'?' active':'')},'▾ ▱ '+project);
  const items=inventory.filter(i=>!term||[i.name,i.status,i.architecture].join(' ').toLowerCase().includes(term)).sort((a,b)=>a.name.localeCompare(b.name));
  const leaves=items.slice(0,100).map(item=>{
    const link=el('a',{href:instanceLink(item.name),role:'treeitem','aria-selected':String(r.page==='instance'&&r.target===item.name),class:'leaf '+item.status.toLowerCase()+(r.page==='instance'&&r.target===item.name?' active':''),title:item.name+' · '+item.status},el('span',{class:'tree-state','aria-hidden':'true'},'●'),icon('box'),item.name);
    link.oncontextmenu=event=>{event.preventDefault();showResourceMenu(event,item);};
    link.ondblclick=event=>{event.preventDefault();if(session.enable_console&&canMutate(item.name)&&item.status==='Running')openConsoleWindow(item.name);};
    return link;
  });
  $('#tree').replaceChildren(root,...($('#tree-view').value==='project'?[projectLink,hostLink]:[hostLink,projectLink]),...leaves,...(items.length>100?[el('a',{href:'#instances',class:'leaf'},'Ver '+items.length+' containers…')]:[]),...(term&&!items.length?[el('div',{class:'empty'},'Nenhum resultado')]:[]),el('a',{href:'#storage',class:'tree-storage'+(r.page==='storage'?' active':'')},'▤ Armazenamento ('+host+')'),el('a',{href:'#images',class:'tree-storage'+(r.page==='images'?' active':'')},'◇ Templates ('+project+')'));
}
let resourceMenu;
function showResourceMenu(event,item){
  resourceMenu?.remove();
  const menu=el('div',{class:'context-menu',role:'menu','aria-label':'Ações de '+item.name});resourceMenu=menu;
  menu.append(el('button',{type:'button',role:'menuitem',onclick:()=>{location.hash=instanceLink(item.name);menu.remove();}},'Resumo'));
  const console=el('button',{type:'button',role:'menuitem',disabled:!session.enable_console||!canMutate(item.name)||item.status!=='Running'?'':null,onclick:()=>{openConsoleWindow(item.name);menu.remove();}},'>_ Console');menu.append(console);
  for(const [action,label] of item.status==='Running'?[['stop','Desligar'],['restart','Reiniciar']]:[['start','Iniciar']]){const button=actionButton(label,action,item.name);button.setAttribute('role','menuitem');button.addEventListener('click',()=>menu.remove());menu.append(button);}
  menu.append(el('button',{type:'button',role:'menuitem',onclick:()=>{location.hash=instanceLink(item.name,'options');menu.remove();}},'Opções'));
  document.body.append(menu);menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-menu.offsetWidth-5))+'px';menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-menu.offsetHeight-5))+'px';menu.querySelector('button').focus();
}
document.addEventListener('pointerdown',event=>{if(resourceMenu&&!resourceMenu.contains(event.target)){resourceMenu.remove();resourceMenu=null;}});
document.addEventListener('keydown',event=>{if(event.key==='Escape')resourceMenu?.remove();});
$('#global-search').oninput=()=>renderResourceTree();
$('#tree-view').onchange=()=>renderResourceTree();
function mergedTaskLog(){
  const merged=new Map(taskLogItems.filter(i=>i&&typeof i==='object').map(i=>[i.id,i]));
  for(const task of tasks.values())if(task.host===host&&task.project===project)merged.set(task.id,{...merged.get(task.id),...task});
  return [...merged.values()].reverse();
}
function renderTaskLog(){
  if(!session||taskLogMode!=='tasks')return;
  const items=mergedTaskLog();
  const rows=items.map(task=>()=>[date(task.created_at||task.timestamp),host,task.identity||session.username,task.target||'—',task.description||task.action||'Operação Incus',status(task.status||String(task.status_code)),el('button',{type:'button',class:'task-details-link',onclick:()=>openTaskDetail(task)},'Detalhes')]);
  const content=table(['INÍCIO','Nó','USUÁRIO','ALVO','DESCRIÇÃO','ESTADO',''],rows);
  content.querySelectorAll('tbody tr').forEach((row,i)=>{row.ondblclick=()=>openTaskDetail(items[i]);});
  $('#task-log-content').replaceChildren(content);$('#task-summary').textContent=items.length+' tarefas · '+host+' / '+project;
}
async function refreshTaskLog(){
  if(!session)return;const owner=session,scope={host,project},mode=taskLogMode;
  try{
    const result=(await read(mode==='audit'?'audit':'operations',undefined,scope)).data;
    if(session!==owner||host!==scope.host||project!==scope.project||taskLogMode!==mode)return;
    if(mode==='audit')$('#task-log-content').replaceChildren(table(['HORA','USUÁRIO','ALVO','AÇÃO','RESULTADO'],result.slice().reverse().map(item=>[date(item.timestamp),item.identity,item.target,item.action,item.result])));
    else{taskLogItems=Array.isArray(result)?result:Object.values(result).flat();renderTaskLog();}
  }catch(error){if(session===owner&&host===scope.host&&project===scope.project&&taskLogMode===mode)$('#task-log-content').replaceChildren(errorNode(error));}
}
async function openTaskDetail(task){
  const dialog=$('#task-detail');$('#task-detail-title').textContent='Tarefa: '+(task.description||task.action||task.id);
  $('#task-detail-content').replaceChildren(kv([['Operação',task.id],['Estado',task.status||'Em andamento'],['Alvo',task.target||'—']]),el('pre',{},task.err||JSON.stringify(task.metadata||{},null,2)));
  if(!dialog.open)dialog.showModal();
  if(task.status_code<200&&task.id){const scope={host,project},owner=session;try{const result=(await read('operation',task.id,scope)).data;if(session!==owner||!dialog.open)return;$('#task-detail-content').replaceChildren(kv([['Operação',task.id],['Estado',result.status]]),el('pre',{},result.err||JSON.stringify(result.metadata||{},null,2)));}catch(error){if(dialog.open)$('#task-detail-content').append(errorNode(error));}}
}
$('#close-task-detail').onclick=()=>$('#task-detail').close();
$('#task-log-refresh').onclick=refreshTaskLog;
for(const [id,mode] of [['task-tab','tasks'],['audit-tab','audit']])$('#'+id).onclick=()=>{taskLogMode=mode;$('#task-tab').classList.toggle('active',mode==='tasks');$('#audit-tab').classList.toggle('active',mode==='audit');refreshTaskLog();};
$('#task-log-toggle').onclick=()=>{const collapsed=document.body.classList.toggle('tasks-collapsed');$('#task-log-toggle').textContent=collapsed?'⌃':'⌄';$('#task-log-toggle').setAttribute('aria-expanded',String(!collapsed));$('#task-log-toggle').setAttribute('aria-label',collapsed?'Expandir painel de tarefas':'Recolher painel de tarefas');};
const taskSplitter=el('div',{class:'task-splitter',role:'separator',tabindex:'0','aria-label':'Altura do painel de tarefas','aria-orientation':'horizontal','aria-valuemin':'70','aria-valuemax':'450','aria-valuenow':'178'});
$('#task-log').prepend(taskSplitter);
function setTaskHeight(height){const value=Math.round(Math.max(70,Math.min(Math.min(450,innerHeight*.55),height)));document.body.classList.remove('tasks-collapsed');document.documentElement.style.setProperty('--task-height',value+'px');taskSplitter.setAttribute('aria-valuenow',String(value));$('#task-log-toggle').setAttribute('aria-expanded','true');$('#task-log-toggle').textContent='⌄';}
taskSplitter.onkeydown=event=>{if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();setTaskHeight($('#task-log').offsetHeight+(event.key==='ArrowUp'?20:-20));}};
taskSplitter.onpointerdown=event=>{event.preventDefault();taskSplitter.setPointerCapture(event.pointerId);taskSplitter.onpointermove=move=>setTaskHeight(innerHeight-move.clientY-23);taskSplitter.onpointerup=()=>{taskSplitter.onpointermove=null;};};
api('/api/session').then(data=>{session=data;enter();}).catch(()=>{});
