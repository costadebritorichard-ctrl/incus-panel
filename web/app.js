'use strict';
const $ = s => document.querySelector(s);
let theme = 'dark';
try { theme = localStorage.getItem('incus-theme') || 'dark'; } catch {}
function applyTheme(value) {
  theme = value === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('incus-theme', theme); } catch {}
  const button = document.querySelector('#theme-toggle');
  if (button) {
    button.querySelector('.button-label').textContent = theme === 'dark' ? 'Tema claro' : 'Tema escuro';
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
Object.assign(iconPaths,{
  search:['M10 3a7 7 0 1 0 0 14a7 7 0 0 0 0-14','m15 15 6 6'],
  summary:['M3 3h18v18H3Z','M3 9h18','M10 9v12'],
  terminal:['m4 6 6 6-6 6','M13 18h7'],
  network:['M9 3h6v6H9Z','M3 16h6v5H3Z','M15 16h6v5h-6Z','M12 9v4','M6 16v-3h12v3'],
  storage:['M3 4h18v6H3Z','M3 14h18v6H3Z','M17 7h1','M17 17h1'],
  settings:['M4 6h16','M4 12h16','M4 18h16','M8 3v6','M16 9v6','M10 15v6'],
  node:['M3 3h18v7H3Z','M3 14h18v7H3Z','M6 6h1','M6 17h1'],
  datacenter:['M3 4h18v16H3Z','M7 8h10','M7 12h10','M7 16h10'],
  history:['M12 3a9 9 0 1 0 9 9','M12 7v5l4 2'],
  users:['M9 3a4 4 0 1 0 0 8a4 4 0 0 0 0-8','M2 21v-3a6 6 0 0 1 12 0v3','M16 4a4 4 0 0 1 0 7','M18 15a5 5 0 0 1 4 5'],
  alert:['M12 3 2 21h20Z','M12 9v5','M12 17h.01'],
  file:['M5 3h10l4 4v14H5Z','M15 3v5h4','M8 12h8','M8 16h8'],
  power:['M12 2v10','M7 4a9 9 0 1 0 10 0'],clone:['M8 8h13v13H8Z','M16 8V3H3v13h5'],
  template:['M5 2h9l5 5v15H5Z','M14 2v6h5'],pause:['M8 5v14','M16 5v14'],
  'close-circle':['M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0','m9 9 6 6','m15 9-6 6']
});
const navIcons={'⌕':'search','◫':'summary','>_':'terminal','▤':'storage','⌘':'network','☷':'settings','⚙':'settings','◷':'history','▣':'box','♙':'users','✎':'edit','▦':'summary','◉':'network','◇':'box','▱':'file','△':'alert'};
const solidIconPaths={
  play:['M5 3 21 12 5 21Z'],square:['M4 4h16v16H4Z'],
  book:['M6 2h15l-4 17H5a2 2 0 0 0 0 4h13v-2H5l4-17H7L3 20a3 3 0 0 1 0-3L6 2Zm4 4-.4 2h8l.4-2h-8Zm-1 4-.4 2h8l.4-2H9Z'],
  cube:['M12 2 2 7v10l10 5 10-5V7L12 2Zm0 2.2L18.8 7 12 10.8 5.2 7 12 4.2ZM4 8.7l7 3.9v6.9l-7-3.5V8.7Zm9 10.8v-6.9l7-3.9V16l-7 3.5Z'],
  user:['M12 2a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9Zm-4 11a6 6 0 0 0-5 6v3h18v-3a6 6 0 0 0-5-6l-4 2-4-2Z'],
  paintbrush:['M20 2c1.5-1 3 1 2 2L12 16l-4-4L20 2ZM7 13c-4 0-2 5-6 6 6 4 11 0 9-4l-3-2Z']
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg','svg');
  const solid=solidIconPaths[name];
  for(const [key,value] of Object.entries({viewBox:'0 0 24 24',fill:solid?'currentColor':'none',stroke:solid?'none':'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round',class:'icon','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
  for(const d of solid||iconPaths[name]||iconPaths.box){const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',d);svg.append(path);}
  return svg;
}
function iconLabel(name,label){return [icon(name),el('span',{},label)];}
document.querySelectorAll('[data-header-icon]').forEach(node=>node.prepend(icon(node.dataset.headerIcon)));
function notify(message){$('#feedback').textContent=message;$('#feedback').hidden=false;}
async function waitOperation(operation,scope,owner){
  let state;const deadline=Date.now()+30000;
  for(let attempt=0;attempt<30;attempt++){
    if(session!==owner)throw new Error('A sessão mudou. Consulte Tarefas para conferir a operação.');
    state=(await read('operation',operation,scope)).data;
    trackTask(`${scope.host}/${scope.project}/${operation}`,{...tasks.get(`${scope.host}/${scope.project}/${operation}`),...scope,id:operation,...state});
    if(state.status_code>=400)throw new Error(state.err||'O Incus não concluiu a operação.');
    if(state.status_code>=200)return state;
    if(Date.now()>=deadline)break;
    // Incus retains a completed operation for only five seconds. Keep active
    // observation inside that window, including transports without native wait.
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  return state;
}
let session, host, project, generation = 0, pendingAction, timer, expiryTimer, busy = false, consoleId, consoleTimer, renderedScope = '', renderedSession;
let eventTimer,eventVersion;
let sessionAttempt=0;
const tasks = new Map();
const creationRuns = new Map();
const snapshotRuns = new Map();
const imageDownloads = new Map();
const readCache = new Map();
const operationMutations = new Map();
let inventory=[], serverInfo={}, storageInventory=[], networkInventory=[], taskLogScope='', taskLogItems=[], taskLogMode='tasks';
const instanceTabs=[['summary','◫','Sumário'],['console','>_','Console'],['resources','▤','Recursos'],['network','⌘','Rede'],['dns','☷','DNS'],['options','⚙','Opções'],['history','◷','Histórico de tarefas'],['backups','▣','Backup'],['snapshots','◷','Snapshots'],['permissions','♙','Permissões']];
const nodeTabs=[['search','⌕','Procurar'],['summary','◫','Sumário'],['notes','✎','Notas'],['system','▦','Sistema'],['network','⌘','Rede'],['storage','▤','Discos'],['tasks','◷','Histórico de tarefas']];
const storageTabs=[['summary','◫','Sumário'],['content','▤','Conteúdo'],['permissions','♙','Permissões']];
const networkTabs=[['summary','◫','Sumário'],['permissions','♙','Permissões']];
function trackTask(key,task){
  tasks.set(key,{requested_at:tasks.get(key)?.requested_at||Date.now()/1000,...tasks.get(key),...task});
  if(tasks.size>100){const completed=[...tasks].find(([id,item])=>id!==key&&item.status_code>=200);tasks.delete(completed?.[0]||tasks.keys().next().value);}
  renderTaskLog();
}
function watchingRun(run,page){return session===run.owner&&host===run.scope.host&&project===run.scope.project&&route().page===page&&!document.hidden;}
function resumeRun(run,poll){if(run.status_code<200&&!run.connectionError&&!run.polling){clearTimeout(run.timer);run.timer=setTimeout(()=>poll(run),0);}}
const pages = [ ['search','⌕','Procurar'],['overview','◫','Sumário'],['datacenter-notes','✎','Notas'],['cluster','◉','Cluster'],['settings','⚙','Opções'],['storage','▤','Armazenamento'],['backups','▣','Backup'],['permissions','♙','Permissões'],['users','♙','Usuários'],['networks','⌘','Rede'],['instances','▣','Containers'],['images','◇','Templates'],['profiles','☷','Perfis'],['projects','▱','Projetos'],['volumes','▤','Volumes'],['tasks','◷','Histórico de tarefas'],['alerts','△','Alertas'] ];
const metricHistory=new Map();
const numberFormat = new Intl.NumberFormat('pt-BR', {maximumFractionDigits:1});
const fmt = n => n === null || n === undefined ? 'n/d' : numberFormat.format(n);
const bytes = n => n === null || n === undefined ? 'n/d' : n >= 1073741824 ? fmt(n/1073741824)+' GiB' : fmt(n/1048576)+' MiB';
const hasTimestamp = n => Boolean(n)&&!(typeof n==='string'&&/^0001-01-01(?:T|$)/.test(n));
const date = n => hasTimestamp(n) ? new Date(typeof n === 'number' ? n*1000 : n).toLocaleString('pt-BR') : 'n/d';
const expiryDate = n => hasTimestamp(n) ? date(n) : 'Sem expiração';
const localDate = n => n ? new Date(typeof n==='number'&&n<1e12?n*1000:n).toLocaleString('pt-BR') : 'n/d';
const transportLabel = () => ({ssh:'SSH verificado',unix:'Socket local Incus',tls:'TLS verificado'})[session?.hosts.find(h=>h.id===host)?.transport||'tls'];
const badge = (text, cls='') => el('span',{class:'badge '+cls},text);
const status = value => { const text=({'100':'Em andamento','103':'Em andamento','200':'Success','400':'Failure','401':'Failure','Cancelled':'Cancelada'})[String(value)]||value;return el('span',{class:'status '+String(text).toLowerCase()},({'Running':'Em execução','Stopped':'Parado','Success':'Concluída','Failure':'Falhou','Running operation':'Em andamento'})[text] || text || 'Desconhecido');};
const propertyLabels={
  'limits.memory':'Memória máxima','limits.cpu':'Núcleos de CPU','limits.cpu.allowance':'Limite de CPU','boot.autostart':'Iniciar no boot',
  'security.protection.delete':'Proteção contra exclusão','image.description':'Sistema operacional','ipv4.address':'Endereço IPv4 / CIDR',
  'ipv4.nat':'NAT IPv4','ipv6.address':'Endereço IPv6 / CIDR','ipv6.nat':'NAT IPv6','dns.domain':'Domínio DNS','dns.mode':'Modo DNS',
  'download_progress':'Progresso do download','download_speed':'Velocidade do download','downloaded_bytes':'Dados recebidos','fingerprint':'Fingerprint da imagem',
  'created_at':'Criada em','updated_at':'Atualizada em','status_code':'Código do estado','may_cancel':'Pode cancelar','err':'Erro'
};
function propertyName(key){return propertyLabels[key]||String(key).replaceAll('_',' ').replaceAll('.',' › ');}
function propertyValue(value,depth=0,key=''){
  if(value===null||value===undefined||value==='')return el('span',{class:'muted'},'—');
  if(typeof value==='string'&&['true','false'].includes(value)&&/^(?:boot\.autostart|security\.protection\.|ipv[46]\.nat|features\.)/.test(key))return value==='true'?'Sim':'Não';
  if(typeof value==='number'&&/(?:timestamp|_at)$/.test(key))return date(value);
  if(typeof value==='number'&&/(?:bytes|size|usage|memory|total)$/i.test(key))return bytes(value);
  if(typeof value==='boolean')return value?'Sim':'Não';
  if(Array.isArray(value))return value.length?el('ul',{class:'property-list'},value.map(item=>el('li',{},propertyValue(item,depth+1)))):el('span',{class:'muted'},'Nenhum');
  if(typeof value==='object')return depth<3?propertyTable(value,depth+1):el('span',{class:'muted'},Object.keys(value).length+' propriedades');
  return String(value);
}
function propertyTable(value,depth=0){
  const entries=Array.isArray(value)?value.map((item,index)=>[String(index+1),item]):Object.entries(value||{});
  if(!entries.length)return empty('Nenhuma propriedade informada.');
  return el('div',{class:'table-wrap property-wrap'},el('table',{class:'property-table'},el('thead',{},el('tr',{},el('th',{},'PROPRIEDADE'),el('th',{},'VALOR'))),el('tbody',{},entries.map(([key,item])=>el('tr',{},el('th',{scope:'row'},el('span',{},propertyName(key)),propertyLabels[key]?el('code',{},key):null),el('td',{},propertyValue(item,depth,key)))))));
}
function configurationSummary(config,exclude=[]){
  const entries=Object.entries(config||{}).filter(([key])=>!exclude.includes(key));
  const text=entries.slice(0,4).map(([key,value])=>`${key}=${typeof value==='object'?Object.keys(value||{}).join(', '):String(value).replace(/\s+/g,' ')}`).join(', ')+(entries.length>4?` · +${entries.length-4} propriedades`:'');
  return el('span',{class:'configuration-summary',title:text||'Padrão do Incus'},text||'Padrão do Incus');
}
function openProperties(title,renderContent){
  openEditor(title,el('div',{class:'properties-view'},renderContent(),el('div',{class:'dialog-actions'},el('button',{type:'button',onclick:closeEditor},'Fechar'))),'properties');
}
function resourceProperties(item,kind){
  const body=el('div',{class:'properties-sections'});
  if(item.description)body.append(el('section',{},el('h3',{},'Descrição'),el('p',{},item.description)));
  if(item.config)body.append(el('section',{},el('h3',{},kind==='network'?'Configuração da rede':'Configuração'),propertyTable(item.config)));
  if(item.devices)for(const [name,device] of Object.entries(item.devices))body.append(el('section',{},el('h3',{},'Dispositivo: '+name),propertyTable(device)));
  if(item.features)body.append(el('section',{},el('h3',{},'Recursos do projeto'),propertyTable(item.features)));
  if(!body.childElementCount)body.append(empty('Nenhuma configuração adicional.'));
  return body;
}
function openResourceProperties(item,kind){
  const label=({profiles:'Perfil',projects:'Projeto',network:'Rede'})[kind]||'Recurso';
  openProperties(`Propriedades: ${label} ${item.name}`,()=>resourceProperties(item,kind));
}
function propertiesGrid(title,headers,items,row,show){
  const content=table(headers,items.map(item=>()=>row(item)),{
    activateOnClick:true,
    onActivate:index=>show(items[index])
  });
  const view=panel(title,content);view.classList.add('properties-grid');return view;
}
function operationMetadata(metadata){
  const value=metadata&&typeof metadata==='object'?metadata:{};
  if(!Object.keys(value).length)return el('span',{class:'muted'},'Aguardando detalhes');
  const progress=Object.entries(value).find(([key,item])=>/progress/i.test(key)&&typeof item==='string')?.[1];
  return progress||'Detalhes disponíveis';
}
function extensionArea(name){
  if(/cluster|member|raft/i.test(name))return 'Cluster';
  if(/storage|volume|bucket/i.test(name))return 'Armazenamento';
  if(/network|bridge|ovn|ovn|dns/i.test(name))return 'Rede';
  if(/image|alias/i.test(name))return 'Imagens';
  if(/project/i.test(name))return 'Projetos';
  if(/profile/i.test(name))return 'Perfis';
  if(/instance|container|console|exec/i.test(name))return 'Containers';
  return 'Geral';
}
function extensionsView(extensions){
  const items=Array.isArray(extensions)?extensions.slice().sort((a,b)=>a.localeCompare(b)):[];
  return panel('Capacidades da API Incus',el('div',{class:'panel-body'},el('p',{class:'muted'},items.length+' extensões disponíveis neste servidor.'),table(['ÁREA','EXTENSÃO','ESTADO'],items.map(name=>[extensionArea(name),el('code',{},name),badge('Disponível','good')]))));
}
const panel = (title, content, action) => el('section',{class:'panel'},el('div',{class:'panel-head'},el('h2',{},title),action),content);
const empty = text => el('div',{class:'empty'},text);
const kv = pairs => el('dl',{class:'key-values'},pairs.map(([k,v])=>el('div',{},el('dt',{},k),el('dd',{},v ?? 'n/d'))));
function table(headers, rows, {onSelect,onActivate,activateOnClick=false,sortable=true,paginate=true}={}) {
  const heading=value=>/^[A-ZÀ-Ú0-9 /_.-]+$/.test(value)&&!['ID','CPU','MAC','DNS','IP','MTU','VLAN','UUID','IPv4','IPv6'].includes(value)?value.slice(0,1)+value.slice(1).toLocaleLowerCase('pt-BR'):value;
  const body=el('tbody'),header=el('tr'),grid=el('table',{},el('thead',{},header),body);
  const holder=el('div',{class:'table-holder'},el('div',{class:'table-wrap',tabindex:'0','aria-label':'Tabela de recursos'},grid));
  let ordered=rows.map((row,index)=>({row,index})),sortColumn=-1,ascending=true,selected=-1;
  const columns=headers.map((value,index)=>{
    const label=heading(String(value)),cell=el('th',{scope:'col'});
    if(!sortable){cell.textContent=label;header.append(cell);return cell;}
    if(!label.trim()){header.append(cell);return cell;}
    const marker=el('span',{class:'sort-indicator','aria-hidden':'true'});
    const control=el('button',{type:'button',class:'column-sort',title:'Ordenar por '+label,onclick:()=>{
      ascending=sortColumn===index?!ascending:true;sortColumn=index;page=0;
      const values=new Map(ordered.map(item=>{const value=(typeof item.row==='function'?item.row():item.row)[index];return [item.index,value instanceof Node?value.textContent:String(value??'')];}));
      ordered.sort((a,b)=>(ascending?1:-1)*values.get(a.index).localeCompare(values.get(b.index),'pt-BR',{numeric:true,sensitivity:'base'}));
      columns.forEach((node,column)=>{node.setAttribute('aria-sort',column===index?(ascending?'ascending':'descending'):'none');node.querySelector('.sort-indicator')?.replaceChildren(column===index?(ascending?'↑':'↓'):'');});
      update();
    }},label,marker);
    cell.setAttribute('aria-sort','none');cell.append(control);header.append(cell);return cell;
  });
  const size=paginate?25:Math.max(rows.length,1);let page=0;
  const label=el('span',{'aria-live':'polite'}),previous=el('button',{type:'button',onclick:()=>{page--;update();}},'Anterior'),next=el('button',{type:'button',onclick:()=>{page++;update();}},'Próxima');
  function update(){
    body.replaceChildren(...ordered.slice(page*size,(page+1)*size).map(({row,index})=>{
      const tr=el('tr',{tabindex:'0','aria-selected':String(selected===index),class:selected===index?'selected':''},(typeof row==='function'?row():row).map(c=>el('td',{},c)));
      const select=()=>{selected=index;for(const sibling of body.children){sibling.classList.toggle('selected',sibling===tr);sibling.setAttribute('aria-selected',String(sibling===tr));}onSelect?.(index);};
      tr.selectRow=select;
      tr.onclick=event=>{if(!event.target.closest('a,button,input,select,summary,details')){select();if(activateOnClick)onActivate?.(index);}};
      tr.ondblclick=()=>{if(!activateOnClick)onActivate?.(index);};
      tr.onkeydown=event=>{if(event.target!==tr)return;if(event.key==='Enter'||event.key===' '){event.preventDefault();select();if(event.key==='Enter')onActivate?.(index);}if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const sibling=event.key==='ArrowUp'?tr.previousElementSibling:tr.nextElementSibling;sibling?.focus();sibling?.selectRow?.();}};
      return tr;
    }));
    if(!rows.length)body.append(el('tr',{},el('td',{colspan:String(headers.length),class:'table-empty'},empty('Nenhum recurso encontrado neste escopo.'))));
    label.textContent=`${page*size+1}–${Math.min((page+1)*size,rows.length)} de ${rows.length}`;
    previous.disabled=page===0;next.disabled=(page+1)*size>=rows.length;
  }
  if(rows.length>size)holder.append(el('div',{class:'pagination'},previous,label,next));
  update();return holder;
}
function notice(text, critical=false) { return el('div',{class:'alert'+(critical?' critical':'')},text); }
let editorContext='';
function closeEditor(){if($('#editor-dialog').open)$('#editor-dialog').close();$('#editor-content').replaceChildren();$('#editor-dialog').removeAttribute('data-editor-type');$('#reset-editor').hidden=true;$('#reset-editor').onclick=null;editorContext='';}
function openEditor(title,content,type=''){
  $('#editor-dialog').dataset.editorType=type;$('#reset-editor').hidden=type!=='nic';$('#reset-editor').onclick=null;
  $('#close-editor').setAttribute('aria-label',type==='properties'?'Fechar propriedades':'Fechar editor');
  if(type==='nic'){$('#reset-editor').replaceChildren(icon('restart'));$('#close-editor').replaceChildren(icon('close-circle'));}
  else $('#close-editor').textContent='×';
  editorContext=host+'/'+project+'/'+location.hash;$('#editor-title').textContent=title;$('#editor-content').replaceChildren(content);
  if(!$('#editor-dialog').open)$('#editor-dialog').showModal();
  $('#editor-content').querySelector('input:not([disabled]):not([readonly]),select:not([disabled]),textarea:not([disabled])')?.focus();
}
$('#close-editor').onclick=closeEditor;
$('#editor-dialog').addEventListener('cancel',event=>{event.preventDefault();closeEditor();});
function errorNode(error) { return notice((error.status===403?'Sem permissão. ':error.status===503?'Desconectado. ':'')+error.message,true); }
function loadingView(message) { return el('div',{class:'loading-state',role:'status','aria-live':'polite'},el('span',{class:'spinner','aria-hidden':'true'}),el('p',{},message)); }
function invalidateMutation(path,change){
  if(path==='/api/users'){readCache.clear();return;}
  const action=path==='/api/create'?'create':path==='/api/images/download'?'download-image':change.action;
  const shared=new Set(['audit','host-summary','pool-resources','volumes']);
  const networkAction=action?.startsWith('network-'),artifactAction=/^(snapshot|backup)/.test(action||'');
  if(!networkAction&&!artifactAction&&action!=='download-image')shared.add('instance-list');
  if(networkAction||['create','delete','clone','nic-add','nic-update','nic-delete','nic-reset'].includes(action)){
    for(const resource of ['networks','network','network-leases'])shared.add(resource);
  }
  if(['create','delete','clone'].includes(action))shared.add('profiles');
  if(action==='download-image'||action==='template'||action==='create'&&change.remote_image){shared.add('images');shared.add('creation-images');}
  const targets=new Set([change.target,change.name].filter(Boolean));
  for(const key of readCache.keys()){
    const query=new URLSearchParams(key.split('?')[1]);
    if(query.get('host')!==change.host||query.get('project')!==change.project)continue;
    const resource=query.get('resource');
    if(shared.has(resource)||(['instance','state','snapshots','backups'].includes(resource)&&targets.has(query.get('target'))))readCache.delete(key);
  }
}
async function api(path, body) {
  const owner=session;
  const mutation=body&&['/api/action','/api/create','/api/images/download','/api/users'].includes(path);
  if(mutation)invalidateMutation(path,body);
  const response = await fetch(path,{method:body?'POST':'GET',headers:body?{'Content-Type':'application/json','X-CSRF-Token':session?.csrf || ''}:{},body:body?JSON.stringify(body):undefined,cache:'no-store'});
  const result = await response.json();
  if(mutation&&session===owner){
    const change={...body,target:result.target||body.target};
    invalidateMutation(path,change);
    if(response.ok&&result.operation){
      operationMutations.set(`${body.host}/${body.project}/${result.operation}`,{path,change});
      if(operationMutations.size>100)operationMutations.delete(operationMutations.keys().next().value);
    }
  }
  if (!response.ok) {
    if (response.status===401 && path!=='/api/login' && owner && session===owner) logoutLocal('Sua sessão expirou. Entre novamente.');
    throw Object.assign(new Error(result.error || 'Falha na solicitação.'),{status:response.status});
  }
  return result;
}
let activeReads=0;
const readWaiters=[];
async function queuedRead(path,current=()=>true){
  const owner=session;
  if(activeReads>=2)await new Promise(resolve=>readWaiters.push(resolve));else activeReads++;
  try{if(session!==owner)throw new Error('A sessão mudou. Atualize a tela.');if(!current())throw new Error('Consulta de uma tela anterior descartada.');return await api(path);}finally{const next=readWaiters.shift();if(next)next();else activeReads--;}
}
async function read(resource,target,scope={host,project}) {
  const path='/api/read?'+new URLSearchParams({...scope,resource,...(target?{target}:{})});
  if(resource==='operation'){
    const owner=session,key=`${scope.host}/${scope.project}/${target}`;
    let result;
    try{result=await queuedRead(path);}catch(error){
      if(session===owner&&error.status===404){
        const mutation=operationMutations.get(key);
        if(mutation){invalidateMutation(mutation.path,mutation.change);operationMutations.delete(key);}
        if(tasks.has(key))trackTask(key,{...tasks.get(key),status:'Resultado incerto',status_code:400,uncertain:true,err:error.message,ended_at:Date.now()/1000});
      }
      throw error;
    }
    if(session===owner&&result.data.status_code>=200){
      const mutation=operationMutations.get(key);
      if(mutation){invalidateMutation(mutation.path,mutation.change);operationMutations.delete(key);}
    }
    return result;
  }
  const cacheable=['server','instance-list',...(session?.low_resource?[
    'host-summary','pools','pool-resources','networks','network','network-leases',
    'profiles','projects','instance','state','snapshots','backups','images',
    'creation-images','image-catalog','audit'
  ]:[])];
  if(!cacheable.includes(resource))return queuedRead(path);
  const cached=readCache.get(path);
  if(cached&&Date.now()<cached.expires){readCache.delete(path);readCache.set(path,cached);return cached.promise;}
  const entry={expires:Infinity};
  entry.promise=queuedRead(path).then(result=>{entry.expires=session?.low_resource?Infinity:Date.now()+(resource==='server'?60000:15000);return result;},error=>{if(readCache.get(path)===entry)readCache.delete(path);throw error;});
  readCache.set(path,entry);
  if(readCache.size>128)readCache.delete(readCache.keys().next().value);
  return entry.promise;
}
function route() { const [page='',target='',tab='summary'] = location.hash.slice(1).split('/').map(value=>{try{return decodeURIComponent(value);}catch{return value;}}); return {page:page||'overview',target,tab}; }
function instanceLink(name, tab='summary') { return '#instance/'+encodeURIComponent(name)+'/'+tab; }
function canMutate(target) { return !session.read_only && session.role!=='observador' && (session.manage_all_instances || (session.mutable_instances?.[host]?.[project] || []).includes(target)); }
function actionButton(label, action, target, extra={}) { return el('button',{class:'action-button'+(action==='delete'?' danger-button':''),disabled:canMutate(target)?null:'',onclick:()=>openAction(action,target,extra)},...(action.endsWith('-delete')?[label]:iconLabel(iconPaths[action]?action:'plus',label))); }
function availableName(base,names){let candidate=base.slice(0,63),suffix=1;while(names.has(candidate)){const ending='-'+suffix++;candidate=base.slice(0,63-ending.length)+ending;}return candidate;}
const snapshotOperations=['snapshot','snapshot-restore','snapshot-delete'];
const snapshotConfirmations=['snapshot-restore','snapshot-delete'];
function actionSubmitLabel(action){return action==='snapshot'?'Tirar um Snapshot':action==='snapshot-edit'?'OK':snapshotConfirmations.includes(action)?'Sim':'Confirmar operação';}
function openAction(action,target,extra={}) {
  $('#feedback').hidden=true;
  if(action==='console'){startTerminal(target).catch(showTerminalError);return;}
  pendingAction={host,project,action,target,...extra};
  $('#cancel-action').disabled=false;$('#close-action').disabled=false;$('#submit-action').disabled=false;$('#submit-action').textContent=actionSubmitLabel(action);
  $('#action-title').textContent=({start:'Iniciar container',stop:'Desligar container','force-stop':'Parar container imediatamente',restart:'Reiniciar container',freeze:'Suspender container',unfreeze:'Retomar container',clone:'Clonar container',template:'Converter em modelo',delete:'Excluir container permanentemente',create:'Criar container',snapshot:'Criar snapshot',backup:'Gerar backup','snapshot-restore':'Restaurar snapshot','snapshot-delete':'Excluir snapshot','backup-delete':'Excluir backup',console:'Abrir shell interativo','network-create':'Criar bridge','network-update':'Atualizar bridge','network-delete':'Excluir bridge','nic-add':'Adicionar interface','nic-update':'Editar interface','nic-delete':'Remover interface','nic-reset':'Restaurar interface do perfil'})[action];
  $('#action-description').textContent=action.startsWith('nic-')?'Alterar a interface pode interromper a rede do container. O perfil permanece intacto.':action==='network-delete'?'A bridge só será excluída se não estiver conectada a containers ou perfis.':action==='network-update'?'Revise IPv4/IPv6, DHCP, DNS, NAT, MTU e roteamento. As mudanças podem afetar os containers conectados.':action==='network-create'?'Será criada uma bridge privada gerenciada pelo Incus. Interfaces físicas não serão adicionadas.':action==='console'?'Este acesso abre /bin/sh, normalmente como root dentro do container. Comandos podem alterar ou apagar dados.':action==='delete'?'A exclusão remove permanentemente o container e seus snapshots.':action==='snapshot-restore'?'A restauração substitui o estado atual do container pelo snapshot selecionado. O container precisa estar parado.':action==='snapshot-delete'||action==='backup-delete'?'A exclusão remove permanentemente este arquivo de recuperação.':action==='snapshot'||action==='backup'?'A operação consome armazenamento. Blocos compartilhados não representam espaço recuperável garantido.':'Revise o destino. O resultado será confirmado pela operação Incus.';
  $('#action-review').textContent=`${action.startsWith('network-')?'Bridge':'Container'}: ${target}\nServidor: ${session.hosts.find(h=>h.id===host)?.alias || host}\nProjeto: ${project}${extra.snapshot?`\nSnapshot: ${extra.snapshot}`:''}${extra.backup?`\nBackup: ${extra.backup}`:''}${extra.profiles ? '\nPerfil: '+extra.profiles.join(', ') : ''}`;
  const snapshotEditor=action==='snapshot'||action==='snapshot-edit';
  const snapshotConfirmation=snapshotConfirmations.includes(action);
  $('#confirm').dataset.actionType=snapshotEditor?'snapshot':snapshotConfirmation?'snapshot-confirm':action;
  $('#cancel-action').textContent=snapshotConfirmation?'Não':'Cancelar';
  $('#snapshot-description-label').hidden=!snapshotEditor;
  $('#snapshot-description').value=extra.description||'';
  $('#artifact-name').readOnly=action==='snapshot-edit';
  if(snapshotEditor||snapshotConfirmation){
    $('#action-title').textContent=action==='snapshot'?`Criar: CT ${target} Snapshot`:`Editar: CT ${target} Snapshot ${extra.snapshot}`;
    $('#close-action').replaceChildren(icon('close-circle'));
  }else $('#close-action').textContent='×';
  if(action==='force-stop')$('#action-description').textContent='O container será interrompido imediatamente, sem aguardar o encerramento dos processos. Dados ainda não gravados podem ser perdidos.';
  if(action==='clone')$('#action-description').textContent='Cria uma cópia no mesmo nó e projeto, inicialmente parada e sem início automático. Revise IPs estáticos e serviços antes de iniciar o clone.';
  if(action==='template')$('#action-description').textContent='Cria uma imagem privada reutilizável em Templates, a partir deste container parado. Revise os dados e credenciais que farão parte do modelo. O container de origem será mantido.';
  if(snapshotConfirmation){
    $('#action-title').textContent='Confirmar';
    $('#action-description').replaceChildren(icon('alert'),el('span',{},action==='snapshot-delete'?`Tem certeza que deseja remover a entrada '${extra.snapshot}'?`:`Tem certeza que deseja reverter para o snapshot '${extra.snapshot}'? O estado atual do container será substituído.`));
  }
  const needsConfirmation=['force-stop','delete','backup-delete','network-delete','nic-delete','nic-reset'].includes(action);
  if(extra.device)$('#action-review').textContent+='\nInterface: '+extra.device;
  if(extra.nic)$('#action-review').textContent+='\nOpções: '+JSON.stringify(extra.nic);
  if(extra.config)$('#action-review').textContent+='\nConfiguração solicitada: '+JSON.stringify(extra.config);
  if(extra.description)$('#action-review').textContent+='\nDescrição: '+extra.description;
  const artifact=extra.snapshot||extra.backup||'';
  const typedValue=artifact?`${host}/${project}/${target}/${artifact}`:target;
  $('#confirmation').parentElement.hidden=!needsConfirmation;
  $('#confirmation').required=needsConfirmation;
  $('#confirmation').value=''; $('#confirmation').placeholder=needsConfirmation?typedValue:`${host}/${project}/${target}`;
  $('#confirmation-label').textContent=needsConfirmation?`Digite ${typedValue} para confirmar`:'Digite o alvo completo para confirmar';
  $('#name-label').hidden=!['snapshot','snapshot-edit','backup','clone','template'].includes(action);
  $('#artifact-name-label').textContent=({clone:'Nome do novo container',template:'Nome do modelo',snapshot:'Nome do snapshot',backup:'Nome do backup'})[action]||'Nome';
  $('#artifact-name').pattern=action==='clone'?'[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?':'[a-zA-Z0-9][a-zA-Z0-9_.-]{0,62}';
  $('#clone-options').hidden=action!=='clone';$('#clone-snapshots').checked=false;
  $('#artifact-name').required=!$('#name-label').hidden;
  $('#artifact-name').value=''; $('#action-error').textContent='';
  if(snapshotEditor)$('#artifact-name-label').textContent='Nome:';
  if(action==='snapshot-edit')$('#artifact-name').value=extra.snapshot;
  if(action==='clone')$('#artifact-name').value=availableName(target.slice(0,57)+'-clone',new Set(inventory.map(item=>item.name)));
  if(action==='template')$('#artifact-name').value=target.slice(0,54)+'-template';
  if(action==='backup')$('#artifact-name').value='backup-'+new Date().toISOString().replace(/\D/g,'').slice(0,14);
  $('#submit-action').classList.toggle('danger-primary',['force-stop','delete','backup-delete','network-delete','nic-delete','nic-reset'].includes(action));
  $('#confirm').showModal(); (snapshotConfirmation?$('#cancel-action'):action==='snapshot-edit'?$('#snapshot-description'):needsConfirmation?$('#confirmation'):!$('#name-label').hidden?$('#artifact-name'):$('#submit-action')).focus();
}
$('#cancel-action').onclick=()=>$('#confirm').close();
$('#close-action').onclick=()=>{if(!$('#cancel-action').disabled)$('#confirm').close();};
$('#confirm').addEventListener('cancel',event=>{if($('#cancel-action').disabled)event.preventDefault();});
$('#action-form').onsubmit=async event=>{
  event.preventDefault();if($('#submit-action').disabled)return; $('#cancel-action').disabled=true;$('#close-action').disabled=true; $('#submit-action').disabled=true;$('#submit-action').textContent='Processando…';
  const actionOwner=pendingAction,owner=session,viewAtStart=location.hash;let acceptedOperation=false,observationFailed=false;
  try {
    const action={...pendingAction};
    const artifact=action.snapshot||action.backup||'';
    const typedValue=artifact?`${action.host}/${action.project}/${action.target}/${artifact}`:action.target;
    const artifactName=$('#artifact-name').value.trim();
    if(action.action==='snapshot'&&(action.snapshotNames||[]).includes(artifactName))throw new Error('Já existe um snapshot chamado '+artifactName+'. Escolha outro nome.');
    if(['force-stop','delete','backup-delete','network-delete','nic-delete','nic-reset'].includes(action.action)&&$('#confirmation').value!==typedValue)throw new Error(`Digite ${typedValue} exatamente como exibido.`);
    if(pendingAction.action==='console'){
      const result=await api('/api/console/start',{...pendingAction,confirmation:$('#confirmation').value});
      consoleId=result.console;$('#confirm').close();pollConsole();return;
    }
    const requestAction={...action};delete requestAction.snapshotNames;
    if(['snapshot','snapshot-edit'].includes(action.action))requestAction.description=$('#snapshot-description').value;
    if(action.action==='clone')requestAction.include_snapshots=$('#clone-snapshots').checked;
    if(snapshotOperations.includes(action.action)||action.action==='snapshot-edit')snapshotLoading($('#action-form'),true);
    const data=await api('/api/action',{...requestAction,confirmation:`${action.host}/${action.project}/${action.target}${artifact?'/'+artifact:''}`,name:artifactName});
    if(session!==owner)return;
    acceptedOperation=Boolean(data.operation);
    if(snapshotOperations.includes(action.action)){
      $('#confirm').close();
      startSnapshotTask({...action,snapshot:artifact||artifactName},data.operation,owner);
      return;
    }
    trackTask(`${action.host}/${action.project}/${data.operation}`,{...action,id:data.operation,status:'Aguardando confirmação',status_code:100,...(['clone','template'].includes(action.action)?{destination:artifactName}:{}),...(action.action==='create'?{start_after_create:false}:{})});
    $('#submit-action').textContent='Aguardando o Incus…';
    const state=await waitOperation(data.operation,{host:action.host,project:action.project},owner);
    if(session!==owner)return;
    $('#confirm').close();closeEditor();
    notify(state.status_code<200?'Operação em andamento. Acompanhe em Tarefas.':({start:'Container iniciado.',stop:'Container desligado.','force-stop':'Container parado.',restart:'Container reiniciado.',freeze:'Container suspenso.',unfreeze:'Container retomado.',clone:'Clone criado: '+artifactName+'.',template:'Modelo criado: '+artifactName+'. Disponível em Templates.',delete:'Container excluído.',create:'Container criado.',snapshot:'Snapshot criado.','snapshot-edit':'Descrição do snapshot salva.','snapshot-restore':'Container revertido para o snapshot.','snapshot-delete':'Snapshot removido.','network-create':'Bridge criada.','network-update':'Bridge atualizada.','network-delete':'Bridge excluída.'})[action.action]||'Operação concluída.');
    if(state.status_code>=200&&action.action==='clone'){location.hash=instanceLink(artifactName);return;}
    if(state.status_code>=200&&action.action==='template'){location.hash='#images';return;}
    if(action.action==='delete'&&route().page==='instance'){location.hash='#instances';return;}
    if(action.action==='create'){openTaskDetail({...action,...state,id:data.operation,start_after_create:false});return;}
    if(action.action==='network-delete'){location.hash='#networks';return;}
    if(state.status_code<200){location.hash='#tasks';return;}
    await render();
  } catch(error) {
    if(session!==owner||pendingAction!==actionOwner)return;
    observationFailed=acceptedOperation;
    $('#action-error').textContent=error.message+(acceptedOperation?' A operação já foi enviada. Confira o estado e os detalhes da tarefa antes de executar outra ação.':'');
    if(acceptedOperation&&location.hash===viewAtStart)await render();
  }
  finally { snapshotLoading($('#action-form'),false);if(session===owner&&pendingAction===actionOwner){$('#cancel-action').disabled=false;$('#close-action').disabled=false; $('#submit-action').disabled=observationFailed;$('#submit-action').textContent=observationFailed?'Operação já enviada':actionSubmitLabel(actionOwner.action);} }
};
function logoutLocal(message='') {
  sessionAttempt++;
  closeEditor();
  closeCreateWizard();metricHistory.clear();closeResourceMenu();
  document.body.classList.add('low-resource');
  setMenu(false,{restoreFocus:false});
  closeConsole();
  for(const run of creationRuns.values())clearTimeout(run.timer);
  creationRuns.clear();
  operationMutations.clear();
  for(const run of snapshotRuns.values()){clearTimeout(run.timer);clearTimeout(run.closeTimer);}
  snapshotRuns.clear();$('#snapshot-progress').close();
  for(const run of imageDownloads.values())clearTimeout(run.timer);
  imageDownloads.clear();readCache.clear();
  $('#feedback').hidden=true;
  session=null; renderedScope='';renderedSession=null;readCache.clear();generation++; clearTimeout(timer); clearTimeout(expiryTimer); clearTimeout(eventTimer); tasks.clear(); $('#content').replaceChildren(); $('#tree').replaceChildren(); $('#shell').hidden=true; $('#login').hidden=false;
  if($('#confirm').open) $('#confirm').close();
  if($('#create-dialog').open)$('#create-dialog').close();
  if($('#task-detail').open)$('#task-detail').close();
  taskLogScope='';taskLogItems=[];inventory=[];
  prepareLogin(message);
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
  for(const node of [$('#main-content'),$('#resource-toolbar'),$('#navigation'),$('#task-log'),$('#shell header'),$('#shell footer')])node.inert=menuOpen;
  if(menuOpen)$('#menu-close').focus();
  else if(wasOpen&&restoreFocus&&drawer)$('#menu-toggle').focus();
}
$('#menu-toggle').onclick=()=>setMenu(!menuOpen);
$('#menu-close').onclick=()=>setMenu(false);
$('#menu-backdrop').onclick=()=>setMenu(false);
$('#scope-toggle').onclick=()=>{const fields=$('#scope-fields');fields.hidden=!fields.hidden;$('#scope-toggle').setAttribute('aria-expanded',String(!fields.hidden));};
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
document.addEventListener('click',event=>{if(!$('#user-menu').contains(event.target))$('#user-menu').open=false;});
$('#user-menu').addEventListener('keydown',event=>{if(event.key==='Escape'){$('#user-menu').open=false;$('#user-menu summary').focus();}});
$('#logout').onclick=async()=>{try{await api('/api/logout',{});}finally{logoutLocal();}};
function prepareLogin(message=''){
  $('.skip-link').hidden=true;
  let username='';try{username=localStorage.getItem('incus-login-username')||'';}catch{}
  $('#login-username').value=username;
  $('#remember-username').checked=Boolean(username);
  $('#login-password').value='';
  $('#login-error').textContent=message;$('#login-error').hidden=!message;
  if(!$('#login').hidden)(username?$('#login-password'):$('#login-username')).focus();
}
$('#remember-username').onchange=()=>{
  if(!$('#remember-username').checked)try{localStorage.removeItem('incus-login-username');}catch{}
};
$('#login-form').onsubmit=async event=>{
  event.preventDefault();const form=event.target,button=form.querySelector('button[type=submit]');
  if(button.disabled)return;
  $('#login-error').textContent='';$('#login-error').hidden=true;
  button.disabled=true;button.textContent='Entrando…';form.setAttribute('aria-busy','true');
  const username=$('#login-username').value.trim();
  const attempt=++sessionAttempt;
  try {
    const authenticated=await api('/api/login',{username,password:$('#login-password').value});
    if(attempt!==sessionAttempt)return;
    session=authenticated;
    try{if($('#remember-username').checked)localStorage.setItem('incus-login-username',username);else localStorage.removeItem('incus-login-username');}catch{}
    $('#login-password').value='';enter();
  }catch(error){
    $('#login-error').textContent=error instanceof TypeError?'Não foi possível conectar ao painel. Verifique a conexão e tente novamente.':error.message;
    $('#login-error').hidden=false;$('#login-password').focus();$('#login-password').select();
  }finally{button.disabled=false;button.textContent='Login';form.removeAttribute('aria-busy');}
};
prepareLogin();
function enter() {
  readCache.clear();document.body.classList.toggle('low-resource',Boolean(session.low_resource));
  clearTimeout(expiryTimer); expiryTimer=setTimeout(()=>logoutLocal('Sua sessão expirou. Entre novamente.'),Math.max(0,session.expires*1000-Date.now()));
  $('#login').hidden=true; $('#shell').hidden=false;setMenu(false,{restoreFocus:false}); $('#identity').textContent=session.username+'@local';$('#user-role').textContent=session.role;$('#user-menu').open=false;
  $('.skip-link').hidden=false;
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
  try{localStorage.setItem('incus-scope',JSON.stringify({host,project}));}catch{}
  eventVersion=undefined;clearTimeout(eventTimer);eventTimer=setTimeout(pollEvents,2000);
}
$('#host').onchange=()=>{closeConsole();host=$('#host').value;fillProjects();render();};
$('#project').onchange=()=>{closeConsole();readCache.clear();project=$('#project').value;try{localStorage.setItem('incus-scope',JSON.stringify({host,project}));}catch{}eventVersion=undefined;clearTimeout(eventTimer);eventTimer=setTimeout(pollEvents,2000);render();};
$('#refresh').onclick=()=>{closeConsole();readCache.clear();render();}; $('#tree-view').onchange=()=>render();
window.addEventListener('hashchange',()=>{setMenu(false,{restoreFocus:false});closeConsole();if(session)render();});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){clearTimeout(timer);clearTimeout(eventTimer);for(const run of [...creationRuns.values(),...imageDownloads.values(),...snapshotRuns.values()])clearTimeout(run.timer);return;}
  if(!session)return;
  resumeSnapshotTasks();
  for(const run of creationRuns.values())if(run.owner===session&&host===run.scope.host&&project===run.scope.project)resumeRun(run,pollCreation);
  for(const run of imageDownloads.values())if(watchingRun(run,'images'))resumeRun(run,pollImageDownload);
  if(!session.low_resource){eventTimer=setTimeout(pollEvents,2000);if(!consoleId&&!menuOpen&&!$('#content form')&&!$('#confirm').open&&!$('#editor-dialog').open&&!$('#create-dialog').open&&!$('#task-detail').open){readCache.clear();render();}else scheduleRefresh();}
});
function instanceActions(item){
  const actions=el('div',{class:'row-actions'});
  const edit=el('a',{class:'button-link',href:instanceLink(item.name,'options'),title:'Editar '+item.name,'aria-label':'Editar '+item.name},icon('edit'));
  if(session.role==='administrador'&&canMutate(item.name))actions.append(edit);
  for(const [action,label] of (item.status==='Running'?[['stop','Desligar'],['restart','Reiniciar']]:item.status==='Stopped'?[['start','Iniciar']]:[])){
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
  function update(){const term=input.value.toLowerCase();holder.replaceChildren(instanceTable(items.filter(i=>(!filter.value||i.status===filter.value)&&[i.name,i.status,i.status==='Running'?'Em execução':i.status==='Stopped'?'Parado':'',i.architecture].join(' ').toLowerCase().includes(term)).sort((a,b)=>String(a[sort.value]).localeCompare(String(b[sort.value])))));}
  let filterTimer;input.oninput=()=>{clearTimeout(filterTimer);filterTimer=setTimeout(update,120);};filter.onchange=update;sort.onchange=update;update();
  return el('div',{},el('div',{class:'toolbar'},input,filter,sort,el('a',{href:'#create',class:'primary button-link'},...iconLabel('plus','Criar container'))),panel('Seus containers',holder));
}
async function render({refreshSnapshots=true}={}) {
  if(!session)return;
  // Compatibility for old bookmarks; creation is an overlay, never a workspace page.
  if(route().page==='create'){history.replaceState(null,'',lastWorkspaceHash);if(!$('#content').childElementCount)await render();openCreateWizard();return;}
  lastWorkspaceHash=location.hash||'#overview';
  if(editorContext&&editorContext!==host+'/'+project+'/'+location.hash)closeEditor();
  if(createScope&&(createScope.host!==host||createScope.project!==project))closeCreateWizard();
  clearTimeout(timer); const id=++generation; const scope={host,project}; const r=route(); busy=true;
  for(const dialog of [$('#snapshot-progress'),$('#task-detail')]){
    const run=snapshotRuns.get(dialog.dataset.snapshotRun);
    if(run&&(run.scope.host!==host||run.scope.project!==project))dialog.close();
  }
  const title=r.page==='overview'?'Datacenter':r.page==='server'?serverInfo.environment?.server_name||host:r.page==='storage'&&r.target?r.target:r.page==='network'&&r.target?r.target:pages.find(p=>p[0]===r.page)?.[2] || (r.page==='instance'?`Container '${r.target}'`:r.page==='create'?'Criar CT':'Página não encontrada');
  $('#title').textContent=title; $('#breadcrumb').textContent=`${host} / ${project} / ${title}`;
  $('#subtitle').textContent=r.page==='instance'?`Gerencie ${r.target} e acompanhe seus recursos.`:r.page==='server'?(nodeTabs.find(([key])=>key===(r.target||'summary'))?.[2]+' do nó')||'Resumo do nó':({overview:'Resumo do datacenter, dos containers e dos recursos disponíveis.',search:'Pesquise containers, imagens, armazenamento, redes, perfis e projetos.',instances:'Encontre, acompanhe e gerencie seus containers.',create:'Escolha uma imagem. Nós cuidamos da configuração.',images:'Sistemas disponíveis para o seu próximo container.',storage:'Acompanhe o espaço disponível para seu laboratório.',networks:'Conexões que mantêm seus containers em rede.',projects:'Organize seus ambientes em projetos separados.'})[r.page]||'Gerencie os recursos do seu laboratório.';
  $('#object-actions').replaceChildren();
  const navigationItems=r.page==='instance'?instanceTabs:r.page==='server'?nodeTabs:r.page==='storage'&&r.target?storageTabs:r.page==='network'?networkTabs:pages.filter(page=>page[0]!=='users'||session.manage_users);
  $('#navigation').replaceChildren(...navigationItems.map(([key,symbol,label])=>{
    const active=r.page==='instance'?r.tab===key:r.page==='server'?(r.target===key||(!r.target&&key==='summary')):r.page==='storage'&&r.target?r.tab===key:r.page==='network'?r.tab===key:r.page===key;
    const href=r.page==='instance'?instanceLink(r.target,key):r.page==='server'?'#server/'+key:r.page==='storage'&&r.target?'#storage/'+encodeURIComponent(r.target)+'/'+key:r.page==='network'?'#network/'+encodeURIComponent(r.target)+'/'+key:'#'+key;
    return el('a',{href,class:(active?'active ':'')+(key==='users'?'nav-child':''),'aria-current':active?'page':null},icon(navIcons[symbol]||'box'),label);
  }));
  const resourceLink=$('#navigation a[href="#instances"]');if(resourceLink)resourceLink.before(el('div',{class:'nav-divider'},'Recursos Incus'));
  $('#banner').hidden=!session.demo; $('#banner').textContent='DEMONSTRAÇÃO · Todos os dados e operações são simulados em memória. Nada é enviado a um servidor Incus real.';
  $('#connection').textContent='Consultando Incus…'; $('#content').setAttribute('aria-busy','true');
  if(!$('#content').childNodes.length||renderedScope!==scope.host+'/'+scope.project||renderedSession!==session)
    $('#content').replaceChildren(loadingView(route().page==='create'?'Carregando imagens disponíveis…':'Carregando '+title+'…'));
  const container=el('div',{class:'workspace-view view-'+r.page,'data-tab':r.page==='server'?(r.target||'summary'):r.tab});
  const cachedSnapshots=r.page==='instance'&&r.tab==='snapshots'&&['instance','snapshots'].every(resource=>readCache.has('/api/read?'+new URLSearchParams({...scope,resource,target:r.target})));
  try {
    const [serverResult, instancesResult,poolsForTree,networksForTree]=await Promise.allSettled([read('server',undefined,scope),read('instance-list',undefined,scope),session.host_metrics?read('pools',undefined,scope):Promise.resolve({data:[]}),read('networks',undefined,scope)]);
    if(id!==generation||!session)return;
    if(serverResult.status==='rejected')throw serverResult.reason;
    if(instancesResult.status==='rejected')throw instancesResult.reason;
    const server=serverResult.value.data, instances=instancesResult.value.data;
    inventory=instances;serverInfo=server;
    if(id!==generation||!session)return;
    storageInventory=poolsForTree.status==='fulfilled'?poolsForTree.value.data:[];
    networkInventory=networksForTree.status==='fulfilled'?networksForTree.value.data:[];
    renderResourceTree();
    $('#create-ct').disabled=!canCreate();
    $('#create-ct').setAttribute('aria-disabled',String(!canCreate()));
    if(r.page==='overview') {
      container.append(await datacenterSummaryView(scope,server,instances));
    } else if(r.page==='datacenter-notes')container.append(datacenterNotesView());
    else if(r.page==='cluster')container.append(clusterView(scope,server));
    else if(r.page==='permissions')container.append(await permissionsView(scope,instances));
    else if(r.page==='backups')container.append(await datacenterBackupsView(scope,instances));
    else if(r.page==='search') container.append(await searchView(scope,instances));
    else if(r.page==='instances') container.append(filteredInstances(instances));
    else if(r.page==='instance') container.append(await detail(r,scope));
    else if(r.page==='storage'||r.page==='alerts') container.append(r.page==='storage'&&r.target?await storageDetailView(scope,r.target,r.tab):await storageView(scope,r.page==='alerts'));
    else if(r.page==='volumes') container.append(await volumesView(scope));
    else if(r.page==='server') {
      const tab=r.target||'summary';
      if(tab==='search')container.append(await searchView(scope,instances));
      else if(tab==='summary')container.append(await serverSummaryView(scope,server,instances));
      else if(tab==='notes')container.append(nodeNotesView());
      else if(tab==='system')container.append(await serverSystemView(scope,server));
      else if(tab==='storage')container.append(await storageView(scope,false),await volumesView(scope));
      else if(tab==='network')container.append(await networksView(scope));
      else if(tab==='tasks')container.append(await taskView(scope));
      else container.append(await serverSummaryView(scope,server,instances));
    }
    else if(r.page==='images') container.append(await imagesView(scope,server));
    else if(r.page==='networks')container.append(await networksView(scope));
    else if(r.page==='network')container.append(await networkDetailView(scope,r.target,r.tab));
    else if(['profiles','projects'].includes(r.page)) {
      const result=await read(r.page,undefined,scope); const data=result.data;
      container.append(propertiesGrid(title,['NOME','DESCRIÇÃO','CONFIGURAÇÃO',...(r.page==='profiles'?['DISPOSITIVOS']:[])],data,item=>[item.name,item.description||'—',configurationSummary(item.config),...(r.page==='profiles'?[Object.keys(item.devices||{}).join(', ')||'Nenhum']:[])],item=>openResourceProperties(item,r.page)));
      container.append(notice('Consulta de '+(r.page==='profiles'?'perfis':'projetos')+'. A criação e a edição são feitas diretamente no Incus.'));
      if(r.page==='projects')container.append(notice('A lista contém somente os escopos configurados no servidor do painel. A autorização final permanece no Incus.'));
    } else if(r.page==='tasks') container.append(await taskView(scope));
    else if(r.page==='users') container.append(await usersView());
    else if(r.page==='settings') {
      const audit=(await read('audit',undefined,scope)).data;
      container.append(panel('Sessão e segurança',el('div',{class:'panel-body'},kv([['Identidade',session.username],['Papel',session.role],['Expira em',date(session.expires)],['Modo',session.read_only||session.role==='observador'?'Somente leitura':session.manage_all_instances?'Administração dos containers autorizados':'Alterações limitadas aos nomes autorizados'],['Autorização','Escopo no painel + '+transportLabel()],['Histórico','Auditoria temporária em memória, máximo de 200 registros']]),notice(session.low_resource?'Modo leve: inventário manual pelo botão Atualizar. Consulte Armazenamento e Alertas para verificar a capacidade dos pools.':'O inventário é atualizado a cada 15 segundos. Quando habilitados pelo administrador, eventos antecipam a atualização.'),el('button',{onclick:()=>$('#logout').click()},'Encerrar sessão')),null),panel('Auditoria desta identidade',table(['HORA','USUÁRIO','ALVO','AÇÃO','RESULTADO'],audit.slice().reverse().map(item=>[date(item.timestamp),item.identity,item.target,item.action,item.result]))));
    }
    else container.append(empty('Página não encontrada.'));
    if(r.page==='overview'||r.page==='server'&&(!r.target||r.target==='summary')||r.page==='instance'&&r.tab==='summary'||r.page==='storage'&&r.target&&r.tab==='summary')container.prepend(summaryToolbar());
    if(id!==generation||!session)return;
    const tracked=[...tasks.values()].filter(t=>t.host===scope.host&&t.project===scope.project);
    $('#task-summary').textContent=tracked.length?tracked.map(t=>`${t.target}: ${t.status}`).join(' · '):'Operações rastreadas pelo Incus';
    $('#content').replaceChildren(container); $('#connection').textContent=(session.demo?'● Simulação conectada':'● Conectado · '+transportLabel())+' · '+host+' / '+project;
    renderedScope=scope.host+'/'+scope.project;renderedSession=session;
    $('#updated').textContent='Inventário '+new Date(instancesResult.value.timestamp*1000).toLocaleTimeString('pt-BR');
    if(taskLogScope!==host+'/'+project){taskLogScope=host+'/'+project;taskLogItems=[];refreshTaskLog();}else renderTaskLog();
    if(r.page==='instance'&&r.tab==='console')mountTerminal(r.target,scope,id);
    if(cachedSnapshots&&refreshSnapshots&&session.low_resource)revalidateSnapshotView(r,scope,id,session);
    resumeSnapshotTasks();
  } catch(error) {
    if(id===generation&&session){$('#content').replaceChildren(errorNode(error),notice('Não foi possível atualizar este escopo. A falha de conexão não indica que os containers estejam parados.'));$('#connection').textContent=error.status===403?'Sem permissão':'Conexão degradada';}
  } finally {
    if(id===generation){busy=false;$('#content').removeAttribute('aria-busy');scheduleRefresh();}
  }
}
async function revalidateSnapshotView(r,scope,renderId,owner){
  const keys=['instance','snapshots'].map(resource=>'/api/read?'+new URLSearchParams({...scope,resource,target:r.target}));
  const entries=keys.map(key=>readCache.get(key));
  try{
    const previous=await Promise.all(entries.map(entry=>entry?.promise));
    const latest=await Promise.all(['instance','snapshots'].map(resource=>freshResource(resource,r.target,scope,()=>session===owner&&renderId===generation)));
    if(session!==owner||renderId!==generation||keys.some((key,index)=>readCache.get(key)!==entries[index]))return;
    keys.forEach((key,index)=>readCache.set(key,{promise:Promise.resolve(latest[index]),expires:owner.low_resource?Infinity:Date.now()+15000}));
    if(renderId===generation&&latest.some((result,index)=>JSON.stringify(result.data)!==JSON.stringify(previous[index]?.data)))await render({refreshSnapshots:false});
  }catch(error){
    if(session===owner&&renderId===generation){$('#connection').textContent='Não foi possível atualizar os snapshots';$('#content .snapshot-feedback')?.replaceChildren(errorNode(error));const feedback=$('#content .snapshot-feedback');if(feedback)feedback.hidden=false;}
  }
}
function scheduleRefresh(){clearTimeout(timer);if(session?.low_resource)return;timer=setTimeout(()=>{if(!session)return;if(!consoleId&&!menuOpen&&!document.hidden&&!$('#confirm').open&&!$('#editor-dialog').open&&!$('#create-dialog').open&&!$('#task-detail').open&&!['create','settings'].includes(route().page)&&route().tab!=='options'&&!$('#content').contains(document.activeElement))render();else scheduleRefresh();},15000);}
async function pollEvents(){
  if(!session||session.low_resource||document.hidden)return;const scope=host+'/'+project;
  try{const result=await api('/api/events?'+new URLSearchParams({host,project}));if(!session||scope!==host+'/'+project)return;if(!result.enabled)return;
    const changed=result.version!==eventVersion;eventVersion=result.version;
    if(!result.connected){$('#connection').textContent='Eventos desconectados · fallback REST ativo';}
    if(changed&&!busy&&!consoleId&&!menuOpen&&!document.hidden&&!$('#confirm').open&&!$('#editor-dialog').open&&!$('#create-dialog').open&&!$('#task-detail').open&&!['create','settings'].includes(route().page)&&route().tab!=='options'&&!$('#content').contains(document.activeElement)){readCache.clear();await render();}
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
function clusterView(scope,server){
  const clustered=Boolean(server.environment?.server_clustered);
  return el('div',{class:'cluster-view'},healthView('Estado do cluster',true,clustered?'Este servidor pertence a um cluster Incus.':'Cluster não configurado · servidor standalone.'),panel('Membros',clustered?el('div',{class:'panel-body'},kv([['Nó conectado',server.environment?.server_name||scope.host],['API do Incus',server.environment?.server_version],['Estado','A API do painel confirma apenas o vínculo ao cluster. A lista de membros não está exposta neste escopo.']])):empty('Nenhum cluster Incus configurado.')),notice('A administração de membros e quorum fica no próprio Incus. O painel não altera a topologia do cluster.'));
}
async function permissionsView(scope,instances){
  const writable=instances.filter(item=>canMutate(item.name));
  const body=el('div',{class:'panel-body'},kv([['Identidade',session.username],['Papel',session.role],['Host',scope.host],['Projeto',scope.project],['Ações neste projeto',session.read_only?'Somente leitura':session.role==='observador'?'Somente leitura':'Conforme as permissões do painel'],['Containers autorizados',`${writable.length} de ${instances.length}`],['Métricas do host',session.host_metrics?'Permitidas':'Não autorizadas']]));
  body.append(notice('O Incus aplica as permissões do servidor em cada chamada. O painel acrescenta o escopo por host, projeto e container; não há ACL independente por container nesta aplicação.'));
  if(session.manage_users)body.append(el('a',{class:'button-link',href:'#users'},...iconLabel('edit','Gerenciar usuários e escopos')));
  return panel('Permissões efetivas',body);
}
async function datacenterBackupsView(scope,instances){
  const selected=instances.slice(0,100),results=[];
  // Keep the lightweight server's four request slots available to other views.
  for(let offset=0;offset<selected.length;offset+=2)results.push(...await Promise.allSettled(selected.slice(offset,offset+2).map(item=>read('backups',item.name,scope))));
  const rows=[],failures=[];
  results.forEach((result,index)=>{
    const item=selected[index];
    if(result.status==='rejected'){failures.push(item.name);return;}
    for(const backup of result.value.data||[]){const raw=typeof backup==='string'?backup:backup.name;rows.push([item.name,String(raw||'').split('/').pop(),date(backup.created_at),expiryDate(backup.expires_at),el('a',{href:instanceLink(item.name,'backups')},'Abrir')]);}
  });
  const view=panel('Backups dos containers',table(['CONTAINER','BACKUP','CRIADO EM','EXPIRA EM',''],rows),el('a',{href:'#instances'},'Containers'));
  if(instances.length>selected.length)view.append(notice(`Exibindo os primeiros ${selected.length} containers. Abra a aba Backup em cada container para consultar os demais.`));
  if(failures.length)view.append(notice(`Não foi possível consultar backups de ${failures.length} container(s): ${failures.join(', ')}.`));
  view.append(notice('Os backups podem ser criados ou removidos na aba Backup de cada container. O Incus não expõe neste painel uma política central de retenção.'));
  return view;
}
async function storageDetailView(scope,target,tab='summary'){
  let pools=storageInventory;
  if(!pools.length&&session.host_metrics)pools=(await read('pools',undefined,scope).catch(()=>({data:[]}))).data;
  const pool=pools.find(item=>item.name===target);
  if(!pool)return errorNode(new Error('Pool indisponível ou sem permissão de consulta.'));
  if(tab==='permissions')return el('div',{},await permissionsView(scope,inventory),notice(`Pool ${pool.name} pertence ao host e o Incus aplica a autorização do servidor.`));
  if(tab==='content'){
    const result=await read('volumes',pool.name,scope).catch(error=>({error}));
    const volumes=result.data||[];
    return el('div',{},el('div',{class:'toolbar'},el('a',{class:'button-link',href:'#images'},'Templates de container'),el('a',{class:'button-link',href:'#backups'},'Backups'),el('a',{class:'button-link',href:'#volumes'},'Todos os volumes')),
      panel('Conteúdo do pool '+pool.name,table(['NOME','TIPO','CONTEÚDO','PROJETO','DESCRIÇÃO'],volumes.map(item=>[item.name||'n/d',item.type||'custom',item.content_type||'filesystem',item.project||scope.project,item.description||'—']))),
      result.error?errorNode(result.error):notice('O Incus armazena imagens, snapshots e volumes neste pool. Arquivos ISO e discos de máquinas virtuais não se aplicam a containers LXC.'));
  }
  const usage=await read('pool-resources',pool.name,scope).catch(error=>({error})),space=usage.data?.space;
  const percent=space?.total>0&&space.used!=null?space.used/space.total*100:null;
  const points=rememberMetric(scope.host+'/storage/'+pool.name,percent,usage.timestamp);
  return el('div',{class:'dashboard-view'},el('div',{class:'grid dashboard-top'},healthView(pool.name,pool.status==='Created',pool.status||'Estado não informado'),panel('Capacidade',el('div',{class:'summary-resource-body'},gauge('Espaço utilizado',space?.used,space?.total),el('div',{class:'resource-value-card'},el('span',{},'Driver'),el('strong',{},pool.driver||'n/d'),el('small',{},'Tipo de armazenamento do Incus')),el('div',{class:'resource-value-card'},el('span',{},'Disponível'),el('strong',{},space?.total!=null&&space?.used!=null?bytes(Math.max(0,space.total-space.used)):'n/d'),el('small',{},'Capacidade livre informada pelo pool'))))),
    metricChart('Uso do pool',points,{unit:percent===null?'':'%',color:'#91bd20',emptyText:usage.error?'O Incus não autorizou a leitura dos recursos do pool.':'O Incus não informou os contadores deste pool.'}),
    panel('Detalhes',el('div',{class:'panel-body'},kv([['Nome',pool.name],['Driver',pool.driver],['Estado',pool.status],['Utilizado',bytes(space?.used)],['Capacidade',bytes(space?.total)],['Coletado em',date(usage.timestamp)]]))));
}
function canManageNetworks(){return !session.read_only&&session.role==='administrador'&&session.manage_networks;}
function availableBridge(network){return network.type==='bridge'&&(network.managed===true&&network.status==='Created'||network.managed===false&&[undefined,null,'','Created'].includes(network.status));}
function bridgeLabel(network){return network.name+(network.managed?' · Incus':' · Externa / LAN');}
async function containerNetworksView(scope,item,state={}){
  const [networkResult,profileResult]=await Promise.all([read('networks',undefined,scope),read('profiles',undefined,scope)]);
  const networks=networkResult.data.filter(availableBridge);
  const inherited={};for(const profileName of item.profiles||[])Object.assign(inherited,profileResult.data.find(p=>p.name===profileName)?.devices||{});
  const devices={...item.expanded_devices};
  for(const [key,value]of Object.entries(item.devices||{}))if(value.type==='none')devices[key]=value;
  const editable=canManageNetworks()&&canMutate(item.name),filters=['security.mac_filtering','security.ipv4_filtering','security.ipv6_filtering'];
  const definition=(key,device)=>device.type==='none'?item._disconnected_nics?.[key]||inherited[key]||device:device;
  const supported=device=>networks.some(network=>network.name===(device.network||device.parent));
  const gateway=network=>{const value=network?.config?.['ipv4.dhcp.gateway']||network?.config?.['ipv4.address'];return value&&value!=='none'?value.split('/')[0]:'';};
  const cidr=(value,network,family)=>value&&value!=='none'?(value.includes('/')?value:value+(network?.config?.[family+'.address']?.includes('/')?'/'+network.config[family+'.address'].split('/')[1]:'')):'';
  const action=(kind,device)=>openAction(kind,item.name,{device,revision:item._devices_revision});
  const entries=Object.entries(devices).filter(([,device])=>['nic','none'].includes(device.type)).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true}));
  function edit(device='',raw={}){
    const current=definition(device,raw),canEdit=editable&&(!device||supported(current));
    let next=0;while(Object.hasOwn(devices,'eth'+next))next++;
    const generated='eth'+next,selectedNetwork=current.network||current.parent||networks[0]?.name||'';
    const initialNetwork=networks.find(network=>network.name===selectedNetwork);
    const runtime=raw.type==='none'?null:state.network?.[current.name||device];
    const field=(label,input)=>el('label',{class:'nic-field'},el('span',{},label+':'),input);
    const input=(name,value='',attrs={})=>el('input',{name,value,maxlength:'128',...attrs});
    const deviceName=input('device',device||generated,{required:'',maxlength:'63',readonly:device?'':null});
    const interfaceName=input('name',current.name||device||generated,{required:'',maxlength:'15'});
    const mac=input('hwaddr',current.hwaddr||'',{placeholder:runtime?.hwaddr||'auto',maxlength:'17'});
    const bridge=el('select',{name:'network',required:''},networks.map(network=>el('option',{value:network.name,selected:network.name===selectedNetwork?'':null},bridgeLabel(network))));
    if(selectedNetwork&&!initialNetwork)bridge.append(el('option',{value:selectedNetwork,selected:'',disabled:''},selectedNetwork));
    const vlan=input('vlan',current.vlan||'',{type:'number',min:'1',max:'4094',placeholder:'no VLAN'});
    const firewall=el('input',{type:'checkbox',name:'firewall',title:'Filtragem anti-spoofing de MAC e IP do Incus'});
    const filterInputs=Object.fromEntries(filters.map(key=>[key,el('select',{name:key},[['','Padrão'],['true','Ativado'],['false','Desativado']].map(([value,label])=>el('option',{value,selected:value===(current[key]||'')?'':null},label)))]));
    const syncFirewall=()=>{const active=filters.filter(key=>filterInputs[key].value==='true').length;firewall.checked=active>0;firewall.indeterminate=active>0&&active<filters.length;};syncFirewall();
    firewall.defaultChecked=firewall.checked;
    const modes={},addresses={},gateways={};
    const familyFields=family=>{
      const initialMode=current[family+'.address']?'static':!initialNetwork?.managed?'dhcp':!initialNetwork?.config?.[family+'.address']||initialNetwork.config[family+'.address']==='none'?'static':family==='ipv6'&&initialNetwork.config['ipv6.dhcp.stateful']!=='true'?'slaac':'dhcp';
      modes[family]=Object.fromEntries((family==='ipv4'?[['static','Estático'],['dhcp','DHCP']]:[['static','Estático'],['dhcp','DHCP'],['slaac','SLAAC']]).map(([value,label])=>[value,el('input',{type:'radio',name:family+'mode',value,checked:value===initialMode?'':null,'aria-label':family+' '+label})]));
      addresses[family]=input(family+'.address',cidr(current[family+'.address'],initialNetwork,family),{placeholder:'Nenhum'});
      gateways[family]=input(family+'.gateway','',{readonly:'',title:'Gateway herdado da ponte gerenciada pelo Incus'});
      return [el('div',{class:'nic-field nic-radio-field'},el('span',{},family==='ipv4'?'IPv4:':'IPv6:'),el('div',{class:'nic-radio-group',role:'radiogroup','aria-label':family},Object.entries(modes[family]).map(([value,radio])=>el('label',{},radio,el('span',{'data-ip-mode':family+'-'+value},value==='static'?'Estático':value==='dhcp'?'DHCP':'SLAAC'))))),field(family==='ipv4'?'IPv4/CIDR':'IPv6/CIDR',addresses[family]),field(family==='ipv4'?'Gateway (IPv4)':'Gateway (IPv6)',gateways[family])];
    };
    const left=el('div',{class:'nic-editor-column'},field('Nome',interfaceName),field('Endereço MAC',mac),field('Ponte',bridge),field('Tag da VLAN',vlan),field('Firewall',firewall));
    const right=el('div',{class:'nic-editor-column'},...familyFields('ipv4'),el('div',{class:'nic-family-separator'}),...familyFields('ipv6'));
    const disconnected=el('input',{type:'checkbox',name:'disconnected',checked:raw.type==='none'?'':null});
    const mtu=input('mtu',current.mtu||'',{type:'number',min:'1280',max:'9000',placeholder:'Igual à ponte'});
    const bandwidth=current['limits.max']?.match(/^([0-9]+)(kbit|Mbit|Gbit)$/);
    const rate=input('rate',bandwidth?String(Number(bandwidth[1])*({kbit:1,Mbit:1000,Gbit:1000000})[bandwidth[2]]/8000):'',{type:'number',min:'0',max:'10240',step:'0.001',placeholder:'Sem limite'});
    const restore=el('button',{type:'button',class:'nic-restore',disabled:canEdit&&device&&item.devices?.[device]&&inherited[device]?.type==='nic'?null:'',onclick:()=>action('nic-reset',device)},'Restaurar do perfil');
    const advanced=el('div',{class:'nic-editor-columns nic-advanced',hidden:''},el('div',{class:'nic-editor-column'},field('Desconectado',disconnected),field('MTU',mtu),field('ID do dispositivo',deviceName),restore),el('div',{class:'nic-editor-column'},field('Limite (MB/s)',rate),field('Filtrar MAC',filterInputs[filters[0]]),field('Filtrar IPv4',filterInputs[filters[1]]),field('Filtrar IPv6',filterInputs[filters[2]])));
    const hint=el('p',{class:'nic-address-hint',hidden:''},'IP fixo via reserva DHCP; gateway herdado da ponte.');
    const help=el('div',{class:'nic-editor-help',hidden:''},el('p',{},'Em uma ponte Incus, o endereço fixo é reservado no DHCP e o prefixo CIDR deve ser o da ponte. Em uma ponte externa, IP, gateway e DNS vêm da rede física ou da configuração dentro do container. Filtros de IP externos apenas autorizam o endereço informado, sem configurar o sistema convidado.'),el('p',{},'Firewall ativa filtros anti-spoofing do Incus; em uma ponte externa, ativa somente o filtro MAC. Filtros de IP externos exigem o IP permitido em Avançado. VLAN e filtragem de IP não podem ser combinadas. Desconectado guarda as opções para reconectar; os perfis são preservados.'));
    const feedback=el('p',{class:'nic-editor-feedback',role:'alert'}),ok=el('button',{type:'submit',class:'primary',disabled:canEdit?null:''},'OK');
    const advancedToggle=el('input',{type:'checkbox',name:'advanced','aria-controls':'nic-advanced'});advanced.id='nic-advanced';
    advancedToggle.onchange=()=>{advanced.hidden=!advancedToggle.checked;};
    const fields=el('fieldset',{class:'nic-editor-fields',disabled:canEdit?null:''},el('div',{class:'nic-editor-columns'},left,right),hint,advanced);
    const form=el('form',{class:'nic-editor-form'},fields,help,feedback,el('div',{class:'nic-editor-footer'},el('button',{type:'button',class:'nic-help',onclick:()=>{help.hidden=!help.hidden;}},'? Ajuda'),el('label',{class:'nic-advanced-toggle'},'Avançado',advancedToggle),ok));
    const mode=family=>Object.entries(modes[family]).find(([,radio])=>radio.checked)?.[0];
    const selectedBridge=()=>networks.find(network=>network.name===bridge.value);
    const hasAddress=family=>selectedBridge()?.managed?Boolean(selectedBridge().config?.[family+'.address']&&selectedBridge().config[family+'.address']!=='none'):filterInputs['security.'+family+'_filtering'].value==='true';
    const values=()=>({network:bridge.value,name:interfaceName.value.trim(),hwaddr:mac.value.trim(),vlan:vlan.value,mtu:mtu.value,
      'limits.max':Number(rate.value)>0?Math.round(Number(rate.value)*8000)+'kbit':'',
      ...Object.fromEntries(filters.map(key=>[key,filterInputs[key].value])),disconnected:String(disconnected.checked),
      ...Object.fromEntries(['ipv4','ipv6'].map(family=>[family+'.address',hasAddress(family)&&mode(family)==='static'?(addresses[family].value.trim()||(current[family+'.address']==='none'?'none':'')):'']))});
    let baseline,busy=false;
    const update=()=>{
      const network=selectedBridge(),config=network?.config||{},external=network?.managed===false;
      interfaceName.setCustomValidity(/^[A-Za-z0-9][A-Za-z0-9_.-]{0,14}$/.test(interfaceName.value)?'':'Use até 15 caracteres: letras, números, ponto, hífen ou sublinhado.');
      mac.setCustomValidity(!mac.value||/^(?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}$/.test(mac.value)?'':'Informe um endereço MAC válido.');
      for(const family of ['ipv4','ipv6']){
        const enabled=hasAddress(family),stateful=family==='ipv4'||config['ipv6.dhcp.stateful']==='true';
        if(external){for(const [value,radio]of Object.entries(modes[family]))radio.checked=value===(enabled?'static':'dhcp');}
        for(const [value,radio]of Object.entries(modes[family]))radio.disabled=external?value==='static'?!enabled:value==='slaac'||enabled:!enabled||(value==='dhcp'&&(!stateful||config[family+'.dhcp']==='false'))||(value==='slaac'&&stateful);
        form.querySelector(`[data-ip-mode="${family}-static"]`).textContent=external?'Filtro de IP':'Estático';
        form.querySelector(`[data-ip-mode="${family}-dhcp"]`).textContent=external?'Rede externa':'DHCP';
        addresses[family].disabled=!enabled||mode(family)!=='static';
        addresses[family].required=!addresses[family].disabled&&current[family+'.address']!=='none';
        addresses[family].closest('label').querySelector('span').textContent=(family==='ipv4'?'IPv4':'IPv6')+(external?' permitido:':'/CIDR:');
        addresses[family].placeholder=external?'IP usado pelo container':'Nenhum';
        gateways[family].value=!external&&enabled?(family==='ipv4'?gateway(network):''):'';
        gateways[family].placeholder=external?'Definido pela rede externa':enabled&&family==='ipv6'?'Herdado da ponte':'';
        gateways[family].title=external?'Gateway fornecido pela LAN ou configurado no container':'Gateway herdado da ponte gerenciada pelo Incus';
        gateways[family].disabled=external||addresses[family].disabled;
      }
      hint.textContent=external?'Bridge externa: IP, gateway e DNS vêm do roteador da LAN ou do próprio container. IP fixo deve ser configurado nele ou reservado no roteador. Filtros de IP apenas permitem o endereço informado.':'IP fixo via reserva DHCP; gateway herdado da ponte.';
      hint.hidden=!external&&!['ipv4','ipv6'].some(family=>hasAddress(family)&&mode(family)==='static');
      ok.disabled=busy||!canEdit||Boolean(device&&baseline===JSON.stringify(values()))||!form.checkValidity();
    };
    firewall.onchange=()=>{firewall.indeterminate=false;for(const key of filters)filterInputs[key].value=String(firewall.checked&&(selectedBridge()?.managed||key==='security.mac_filtering'));syncFirewall();update();};
    for(const control of Object.values(filterInputs))control.addEventListener('change',syncFirewall);
    bridge.onchange=()=>{
      if(selectedBridge()?.managed===false){for(const key of filters.slice(1))filterInputs[key].value='false';syncFirewall();}
      for(const family of ['ipv4','ipv6']){addresses[family].value='';const automatic=family==='ipv6'&&selectedBridge()?.config?.['ipv6.dhcp.stateful']!=='true'?'slaac':'dhcp';for(const [value,radio]of Object.entries(modes[family]))radio.checked=value===automatic;}
      update();
    };
    form.addEventListener('input',update);form.addEventListener('change',update);
    baseline=JSON.stringify(values());update();
    form.onsubmit=async event=>{
      event.preventDefault();if(busy||!canEdit||!form.reportValidity())return;
      const nic=values(),targetDevice=deviceName.value.trim(),owner=session;
      busy=true;ok.disabled=true;feedback.textContent='';
      try{
        const result=await api('/api/action',{...scope,target:item.name,action:device?'nic-update':'nic-add',device:targetDevice,nic,revision:item._devices_revision,confirmation:`${scope.host}/${scope.project}/${item.name}`});
        trackTask(`${scope.host}/${scope.project}/${result.operation}`,{...scope,id:result.operation,target:item.name,action:device?'nic-update':'nic-add',status_code:100,status:'Em andamento'});
        const resultState=await waitOperation(result.operation,scope,owner);
        if(session!==owner)return;
        if(form.isConnected)closeEditor();
        notify(resultState.status_code<200?'Alteração em andamento. Acompanhe em Tarefas.':'Interface de rede atualizada.');
        if(host===scope.host&&project===scope.project)await render();
      }catch(error){if(form.isConnected)feedback.textContent=error.message;}
      finally{busy=false;update();}
    };
    openEditor((device?'Editar':'Adicionar')+': Dispositivo de Rede (veth)',form,'nic');
    $('#reset-editor').onclick=()=>{form.reset();advanced.hidden=true;help.hidden=true;feedback.textContent='';syncFirewall();update();};
    interfaceName.focus();
  }
  let selected;
  const remove=el('button',{type:'button','data-action':'nic-delete',disabled:'',onclick:()=>{if(selected)action('nic-delete',selected[0]);}},'Remover');
  const editButton=el('button',{type:'button','data-action':'nic-edit',disabled:'',onclick:()=>{if(selected)edit(...selected);}},'Editar');
  const toolbar=el('div',{class:'nic-grid-toolbar'},el('button',{type:'button','data-action':'nic-add',disabled:editable&&networks.length?null:'',onclick:()=>edit()},'Adicionar'),remove,editButton);
  const rows=entries.map(([key,raw])=>{
    const device=definition(key,raw),network=networks.find(value=>value.name===(device.network||device.parent)),runtime=raw.type==='none'?null:state.network?.[device.name||key];
    const all=(runtime?.addresses||[]).map(address=>address.address+(address.netmask?'/'+address.netmask:''));
    const configured=['ipv4','ipv6'].map(family=>cidr(device[family+'.address'],network,family)).filter(Boolean);
    const addresses=[...new Set([...configured,...all.filter(value=>!value.startsWith('fe80:'))])];
    const active=filters.filter(name=>device[name]==='true').length;
    return [key,device.name||key,device.network||device.parent||'',active===filters.length?'Sim':active?'Parcial':'Não',device.vlan||'',
      (runtime?.hwaddr||device.hwaddr||item.config?.['volatile.'+key+'.hwaddr']||'').toUpperCase(),
      el('span',{class:'nic-addresses',title:all.join(', ')||configured.join(', ')},addresses.join(', ')),gateway(network),device.mtu||'',raw.type==='none'?'Sim':'Não'];
  });
  const grid=table(['ID','Nome','Ponte','Firewall','Tag da VLAN','Endereço MAC','Endereço IP','Gateway','MTU','Desconectado'],rows,{activateOnClick:true,
    onSelect:index=>{selected=entries[index];const allowed=editable&&supported(definition(...selected));remove.disabled=editButton.disabled=!allowed;},
    onActivate:index=>edit(...entries[index])});
  const gridTable=grid.querySelector('table');gridTable.classList.add('nic-table');
  gridTable.prepend(el('colgroup',{},[50,80,80,75,75,120,300,150,70,100].map(width=>el('col',{style:'width:'+width+'px'}))));
  grid.querySelector('th button')?.click();
  return el('section',{class:'nic-grid','aria-label':'Interfaces de rede do container'},toolbar,grid);
}
function bridgeOptions(config={}){
  const ipv4=config['ipv4.address']||'auto';
  const address4=el('input',{name:'ipv4.address',required:'',maxlength:'64',value:ipv4,placeholder:'10.10.0.1/24, auto ou none'});
  const dhcp4=el('select',{name:'ipv4.dhcp'},el('option',{value:'true'},'Ativado'),el('option',{value:'false'},'Desativado'));
  dhcp4.value=config['ipv4.dhcp']||(ipv4==='none'?'false':'true');
  const nat4=el('select',{name:'ipv4.nat'},el('option',{value:'true'},'Ativado'),el('option',{value:'false'},'Desativado'));
  nat4.value=config['ipv4.nat']||'false';
  const address6=el('input',{name:'ipv6.address',required:'',maxlength:'64',value:config['ipv6.address']||'none',placeholder:'fd42::1/64, auto ou none'});
  const dhcp6=el('select',{name:'ipv6.dhcp'},el('option',{value:'true'},'Ativado'),el('option',{value:'false'},'Desativado'));
  dhcp6.value=config['ipv6.dhcp']||(address6.value==='none'?'false':'true');
  const nat6=el('select',{name:'ipv6.nat'},el('option',{value:'true'},'Ativado'),el('option',{value:'false'},'Desativado'));
  nat6.value=config['ipv6.nat']||'false';
  const domain=el('input',{name:'dns.domain',maxlength:'253',value:config['dns.domain']||''});
  const fields=[el('label',{},'Endereço IPv4 (CIDR, auto ou none)',address4),el('label',{},'DHCP IPv4',dhcp4),el('label',{},'NAT IPv4',nat4),el('label',{},'Endereço IPv6 (CIDR, auto ou none)',address6),el('label',{},'DHCP IPv6',dhcp6),el('label',{},'NAT IPv6',nat6),el('label',{class:'full'},'Domínio DNS',domain)];
  const advanced=[];
  for(const [key,label,placeholder]of [['bridge.mtu','MTU','1500'],['ipv4.dhcp.ranges','Faixas DHCP IPv4','10.0.0.10-10.0.0.200'],['ipv6.dhcp.ranges','Faixas DHCP IPv6',''],['ipv4.dhcp.expiry','Duração DHCP IPv4','1h'],['ipv6.dhcp.expiry','Duração DHCP IPv6','1h']]){
    const input=el('input',{name:key,value:config[key]||'',placeholder,maxlength:'512'});advanced.push(input);fields.push(el('label',{},label,input));
  }
  for(const [key,label]of [['ipv6.dhcp.stateful','DHCP IPv6 stateful'],['ipv4.routing','Roteamento IPv4'],['ipv6.routing','Roteamento IPv6'],['ipv4.firewall','Regras de firewall IPv4'],['ipv6.firewall','Regras de firewall IPv6'],['bridge.multicast_snooping','Multicast snooping']]){
    const input=el('select',{name:key},el('option',{value:''},'Padrão do Incus'),el('option',{value:'true'},'Ativado'),el('option',{value:'false'},'Desativado'));input.value=config[key]||'';advanced.push(input);fields.push(el('label',{},label,input));
  }
  const dnsMode=el('select',{name:'dns.mode'},['','managed','dynamic','none'].map(value=>el('option',{value},value||'Padrão do Incus')));dnsMode.value=config['dns.mode']||'';advanced.push(dnsMode);fields.push(el('label',{},'Registro DNS',dnsMode));
  const inputs=[address4,dhcp4,nat4,address6,dhcp6,nat6,domain,...advanced];
  function update(){
    for(const [family,address,dhcp,nat]of [['ipv4',address4,dhcp4,nat4],['ipv6',address6,dhcp6,nat6]]){
      const off=address.value.trim()==='none';
      dhcp.disabled=nat.disabled=off;
      for(const input of advanced){
        if(input.name.startsWith(family+'.dhcp.'))input.disabled=off||dhcp.value==='false'||(input.name==='ipv6.dhcp.ranges'&&inputs.find(i=>i.name==='ipv6.dhcp.stateful').value!=='true');
      }
    }
  }
  for(const input of inputs)input.addEventListener('input',update);
  update();
  return {fields,setValues:values=>{for(const input of inputs)if(Object.hasOwn(values,input.name))input.value=values[input.name];update();},values:()=>Object.fromEntries(inputs.map(input=>[input.name,input.disabled?(input===dhcp4||input===dhcp6||input===nat4||input===nat6?'false':''):input.value.trim()]))};
}
function networkActionButton(label,action,target,extra={}){
  return el('button',{type:'button','data-action':action,class:'action-button'+(action==='network-delete'?' danger-button':''),disabled:canManageNetworks()?null:'',onclick:()=>openAction(action,target,extra)},...iconLabel(action==='network-delete'?'delete':'save',label));
}
async function networkDetailView(scope,target,tab='summary'){
  let network;
  try{network=(await read('network',target,scope)).data;}
  catch(error){return errorNode(error);}
  if(!network)return errorNode(new Error('Rede indisponível neste projeto.'));
  if(tab==='permissions')return el('div',{},await permissionsView(scope,inventory),notice('A rede é visível neste projeto conforme as permissões devolvidas pelo Incus. O painel não configura ACLs de rede separadas.'));
  const dependencies=new Set(Array.isArray(network.used_by)?network.used_by:[]);
  const references=item=>Object.values(item.expanded_devices||item.devices||{}).some(d=>d.type==='nic'&&(d.network===network.name||d.parent===network.name));
  const [instances,profiles]=await Promise.allSettled([read('instances',undefined,scope),read('profiles',undefined,scope)]);
  const attached=instances.status==='fulfilled'?instances.value.data.filter(references):[];
  for(const item of attached)dependencies.add('Container: '+item.name);
  if(profiles.status==='fulfilled')for(const item of profiles.value.data.filter(references))dependencies.add('Perfil: '+item.name);
  const dependencyError=instances.status==='rejected'||profiles.status==='rejected';
  const external=Boolean(network.config?.['bridge.external_interfaces']);
  const managedBridge=network.managed&&network.type==='bridge';
  const body=propertiesGrid('Configuração da rede',['PROPRIEDADE','VALOR'],[
    ['Nome',network.name],['Tipo',network.type],['Gerenciada',network.managed?'Sim':'Não'],['Estado',network.status||(network.managed?'n/d':'Externa (Linux)')],
    ['Gateway / CIDR IPv4',network.config?.['ipv4.address']],['Faixa DHCP IPv4',network.config?.['ipv4.dhcp.ranges']],
    ['DHCP IPv4',network.config?.['ipv4.dhcp']],['NAT IPv4',network.config?.['ipv4.nat']],
    ['IPv6 / CIDR',network.config?.['ipv6.address']],['Domínio DNS',network.config?.['dns.domain']],['Projeto',scope.project]
  ],([label,value])=>[label,value??'n/d'],()=>openResourceProperties(network,'network'));
  const result=el('div',{class:'dashboard-view'},el('div',{class:'grid dashboard-top'},healthView(network.name,availableBridge(network),network.type+' · '+(network.managed?'gerenciada pelo Incus':'externa')),body),panel('Containers conectados',instanceTable(attached)));
  if(dependencies.size)result.append(panel('Dependências da bridge',table(['RECURSO'],[...dependencies].map(value=>[value]))));
  if(dependencyError)result.append(notice('Não foi possível conferir todas as dependências. Atualize antes de excluir a bridge.',true));
  if(canManageNetworks()&&managedBridge&&!external){
    const editor=bridgeOptions(network.config||{});
    const description=el('input',{name:'description',maxlength:'1024',value:network.description||''});
    const remove=networkActionButton('Excluir bridge','network-delete',network.name,{revision:network._revision});
    if(dependencies.size||dependencyError){remove.disabled=true;remove.title='Remova as dependências da bridge e atualize antes de excluir.';}
    const form=el('form',{class:'network-form'},...editor.fields,el('label',{class:'full'},'Descrição',description),el('div',{class:'network-form-actions'},el('button',{type:'submit',class:'primary'},...iconLabel('save','Salvar bridge')),el('button',{type:'button',onclick:closeEditor},'Cancelar')));
    form.onsubmit=event=>{event.preventDefault();openAction('network-update',network.name,{config:editor.values(),description:description.value,revision:network._revision});};
    const edit=el('button',{type:'button','data-action':'network-edit',onclick:()=>openEditor('Editar: '+network.name,el('div',{},form,notice('Altere endereçamento, DHCP, NAT, DNS, MTU, roteamento e firewall. As mudanças são aplicadas ao salvar e podem interromper conexões dos containers.')))},...iconLabel('edit','Editar'));
    result.prepend(el('div',{class:'grid-toolbar'},edit,remove));
  }else if(!canManageNetworks())result.append(notice('A gestão de bridges exige habilitação explícita para administradores.'));
  else if(external||availableBridge(network)&&!network.managed)result.append(notice('Para usar esta bridge, selecione-a em Container → Rede ou no assistente Criar CT. A configuração da bridge e das interfaces físicas é mantida no host.'));
  if(session.host_metrics&&managedBridge){
    const leases=await read('network-leases',network.name,scope).catch(error=>({error}));
    result.append(leases.error?errorNode(leases.error):panel('Leases DHCP',table(['HOSTNAME','MAC','IPv4','IPv6'],(leases.data||[]).map(item=>[item.hostname||'—',item.hwaddr||'—',item.ipv4||(item.address&&!item.address.includes(':')?item.address:'—'),item.ipv6||(item.address?.includes(':')?item.address:'—')]))));
  }else result.append(notice('A lista global de leases DHCP exige métricas do host e só está disponível para bridges gerenciadas.'));
  return result;
}
function usageMeter(label,used,total){
  if(!(Number(total)>0)||used==null)return el('div',{class:'metric-meter'},el('strong',{},label),notice('Métrica indisponível para esta identidade.'));
  const percent=Math.min(100,Math.max(0,Number(used)/Number(total)*100));
  return el('div',{class:'metric-meter'},el('div',{class:'metric-meter-heading'},el('strong',{},label),el('span',{},fmt(percent)+'%')),el('progress',{max:'100',value:String(percent),'aria-label':label}),el('small',{},bytes(used)+' utilizados de '+bytes(total)));
}
function rememberMetric(key,value,sourceTimestamp){
  if(value===null||value===undefined||!Number.isFinite(Number(value)))return metricHistory.get(key)||[];
  const now=Date.now(),points=metricHistory.get(key)||[];
  if(sourceTimestamp!==undefined&&points.at(-1)?.sourceTimestamp===sourceTimestamp)return points;
  if(!points.length||now-points[points.length-1].at>=5000)points.push({at:now,value:Number(value),sourceTimestamp});
  while(points.length>60||points[0]?.at<now-30*60*1000)points.shift();
  metricHistory.set(key,points);return points;
}
let chartRangeSeconds=1800;
function summaryToolbar(){
  const range=el('select',{'aria-label':'Período dos gráficos'},[[1800,'Últimos 30 minutos'],[900,'Últimos 15 minutos'],[300,'Últimos 5 minutos']].map(([value,label])=>el('option',{value:String(value)},label)));
  range.value=String(chartRangeSeconds);range.onchange=()=>{chartRangeSeconds=Number(range.value);render();};
  return el('div',{class:'summary-toolbar'},el('span',{},'Amostras coletadas nesta sessão'),range);
}
function metricChart(title,points,{unit='',color='#91bd20',emptyText='Aguardando a próxima coleta do Incus.'}={}){
  points=points.filter(point=>point.at>=Date.now()-chartRangeSeconds*1000);
  const body=el('div',{class:'chart-body'});
  if(points.length){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    const labelValue=unit==='bytes'?bytes(points.at(-1).value):fmt(points.at(-1).value)+' '+unit;
    for(const [key,value]of Object.entries({viewBox:'0 0 640 180',preserveAspectRatio:'none',role:'img','aria-label':title+' · '+labelValue}))svg.setAttribute(key,value);
    const vals=points.map(point=>point.value),lo=Math.min(0,...vals),hi=Math.max(...vals),span=Math.max(hi-lo,1);
    for(let line=1;line<=4;line++){const y=12+line*31;const grid=document.createElementNS(svg.namespaceURI,'path');grid.setAttribute('d',`M0 ${y}H640`);grid.setAttribute('class','chart-gridline');svg.append(grid);}
    const coords=vals.map((value,index)=>[points.length===1?0:index*640/(points.length-1),166-(value-lo)/span*145]);
    if(coords.length===1)coords.push([640,coords[0][1]]);
    const path=coords.map(([x,y],index)=>(index?'L':'M')+x.toFixed(1)+' '+y.toFixed(1)).join(' ');
    const area=document.createElementNS(svg.namespaceURI,'path');area.setAttribute('d',path+' L640 174 L0 174 Z');area.setAttribute('class','chart-area');area.style.fill=color;svg.append(area);
    const line=document.createElementNS(svg.namespaceURI,'path');line.setAttribute('d',path);line.setAttribute('class','chart-line');line.style.stroke=color;svg.append(line);
    body.append(svg,el('div',{class:'chart-axis'},el('span',{},new Date(points[0].at).toLocaleTimeString('pt-BR')),el('span',{},labelValue),el('span',{},new Date(points.at(-1).at).toLocaleTimeString('pt-BR'))));
  }else body.append(el('div',{class:'chart-placeholder'},emptyText));
  return panel(title,body);
}
function gauge(label,used,total){
  if(!(Number(total)>0)||used==null)return el('div',{class:'summary-gauge unavailable',style:'--gauge-angle:0deg'},el('div',{class:'gauge-number'},'n/d'),el('div',{class:'gauge-label'},label));
  const value=Math.max(0,Math.min(Number(total),Number(used))),percent=Math.min(100,value/Number(total)*100);
  return el('div',{class:'summary-gauge',style:`--gauge-angle:${percent*3.6}deg`},el('div',{class:'gauge-number'},fmt(percent)+'%'),el('div',{class:'gauge-label'},label),el('small',{},bytes(value)+' / '+bytes(total)));
}
function healthView(title,healthy,detail){
  return panel(title,el('div',{class:'health-view'},el('div',{class:'health-symbol '+(healthy?'healthy':'unknown')},healthy?'✓':'!'),el('strong',{},healthy?'OK':'Verificar'),el('span',{},detail)));
}
async function datacenterSummaryView(scope,server,instances){
  const metrics=session.host_metrics?await read('host-summary',undefined,scope).catch(error=>({error})): {error:new Error('Métricas do host não autorizadas para esta identidade.')};
  const memory=metrics.data?.memory;
  const pools=session.host_metrics?(await read('pools',undefined,scope).catch(error=>({data:[],error}))).data:[];
  const running=instances.filter(item=>item.status==='Running').length;
  const memoryHistory=rememberMetric(scope.host+'/memory',memory?.used,metrics.timestamp);
  const poolRows=[];
  for(const pool of pools){
    const result=await read('pool-resources',pool.name,scope).catch(error=>({error}));
    const space=result.data?.space,percent=space?.total>0&&space.used!=null?space.used/space.total*100:null;
    if(percent!==null)rememberMetric(scope.host+'/storage/'+pool.name,percent,result.timestamp);
    poolRows.push([pool.name,pool.driver||'n/d',bytes(space?.used),bytes(space?.total),percent===null?'n/d':fmt(percent)+'%',badge(pool.status||'Desconhecido',pool.status==='Created'?'good':'warn')]);
  }
  const resources=el('div',{class:'summary-resource-body'},
    gauge('Memória do host',memory?.used,memory?.total),
    el('div',{class:'resource-value-card'},el('span',{},'CPU'),el('strong',{},metrics.data?.cpu?.total==null?'n/d':fmt(metrics.data.cpu.total)),el('small',{},'núcleos lógicos · uso não exposto pelo Incus')),
    el('div',{class:'resource-value-card'},el('span',{},'Containers'),el('strong',{},fmt(instances.length)),el('small',{},`${running} em execução · ${instances.length-running} parados`)));
  return el('div',{class:'dashboard-view'},
    el('div',{class:'grid dashboard-top'},healthView('Saúde',true,server.environment?.server_clustered?'Cluster Incus conectado':'Nó conectado · servidor standalone'),panel('Recursos',resources)),
    el('div',{class:'grid dashboard-charts'},metricChart('Memória em uso',memoryHistory,{unit:'bytes',color:'#2682ad',emptyText:metrics.error?'Métricas do host indisponíveis para esta identidade.':'O Incus não informou a utilização de memória.'}),poolRows.length?panel('Armazenamento',table(['POOL','DRIVER','UTILIZADO','CAPACIDADE','USO','ESTADO'],poolRows)):notice('A capacidade dos pools exige a permissão de métricas globais do host.')),
    panel('Containers',instanceTable(instances),el('a',{href:'#instances'},'Ver todos')),
    panel('Identidade do servidor',el('div',{class:'panel-body'},kv([['Nó',server.environment?.server_name||scope.host],['Incus',server.environment?.server_version],['Arquitetura',server.environment?.kernel_architecture],['Projeto',scope.project],['Conexão',transportLabel()],['Cluster',server.environment?.server_clustered?'Configurado':'Standalone']]))));
}
async function serverSummaryView(scope,server,instances){
  const metrics=session.host_metrics?await read('host-summary',undefined,scope).catch(error=>({error})): {error:new Error('Métricas do host não autorizadas para esta identidade.')};
  const memory=metrics.data?.memory,cpu=metrics.data?.cpu;
  const running=instances.filter(item=>item.status==='Running').length;
  const memoryHistory=rememberMetric(scope.host+'/memory',memory?.used,metrics.timestamp);
  const poolRows=[];
  if(session.host_metrics){
    const pools=(await read('pools',undefined,scope).catch(error=>({data:[]}))).data;
    for(const pool of pools){const result=await read('pool-resources',pool.name,scope).catch(error=>({error})),space=result.data?.space,percent=space?.total>0&&space.used!=null?space.used/space.total*100:null;if(percent!==null)rememberMetric(scope.host+'/storage/'+pool.name,percent,result.timestamp);poolRows.push([pool.name,pool.driver||'n/d',bytes(space?.used),bytes(space?.total),percent===null?'n/d':fmt(percent)+'%']);}
  }
  return el('div',{class:'dashboard-view node-dashboard'},
    el('div',{class:'grid dashboard-top'},healthView(`Nó '${server.environment?.server_name||scope.host}'`,true,`Ativo · ${transportLabel()}`),panel('Visão geral',el('div',{class:'panel-body'},kv([['Tempo de atividade','Métrica não fornecida pela API do Incus'],['Cluster',server.environment?.server_clustered?'Configurado':'Standalone'],['Containers',`${running} em execução de ${instances.length}`],['Versão do Incus',server.environment?.server_version],['Arquitetura',server.environment?.kernel_architecture]])))),
    panel('Recursos',el('div',{class:'summary-resource-body'},gauge('Memória',memory?.used,memory?.total),el('div',{class:'resource-value-card'},el('span',{},'CPU'),el('strong',{},cpu?.total==null?'n/d':fmt(cpu.total)),el('small',{},'núcleos lógicos · utilização não fornecida pela API do Incus')),el('div',{class:'resource-value-card'},el('span',{},'Containers'),el('strong',{},fmt(instances.length)),el('small',{},`${running} em execução · ${instances.length-running} parados`)))),
    el('div',{class:'grid dashboard-charts'},metricChart('Uso de memória',memoryHistory,{unit:'bytes',color:'#2682ad',emptyText:metrics.error?'Métricas do host não autorizadas.':'Sem histórico coletado.'}),poolRows.length?panel('Uso de armazenamento',table(['POOL','DRIVER','UTILIZADO','CAPACIDADE','USO'],poolRows)):notice('As métricas físicas de armazenamento exigem a permissão do host.')),
    panel('Containers deste nó',instanceTable(instances),el('a',{href:'#instances'},'Ver todos')));
}
function datacenterNotesView(){
  const key='incus-datacenter-note:'+encodeURIComponent(host)+':'+encodeURIComponent(session.username);
  let saved='';try{saved=localStorage.getItem(key)||'';}catch{}
  const input=el('textarea',{rows:'12','aria-label':'Notas do datacenter',placeholder:'Anotações do datacenter…'},saved);
  const feedback=el('p',{class:'form-feedback','aria-live':'polite'});
  const form=el('form',{class:'panel-body node-notes'},el('label',{},'Notas do datacenter',input),el('small',{},'As notas ficam salvas neste navegador e associadas ao host e à sua identidade.'),el('div',{class:'form-actions'},el('button',{type:'submit',class:'primary'},'Salvar notas')),feedback);
  form.onsubmit=event=>{event.preventDefault();try{localStorage.setItem(key,input.value);feedback.textContent='Notas salvas neste navegador.';}catch{feedback.textContent='Não foi possível salvar as notas neste navegador.';}};
  return panel('Notas do datacenter',form);
}
function nodeNotesView(){
  const key='incus-node-note:'+encodeURIComponent(host)+':'+encodeURIComponent(session.username);
  let saved='';try{saved=localStorage.getItem(key)||'';}catch{}
  const input=el('textarea',{rows:'12','aria-label':'Notas do nó',placeholder:'Anotações sobre este nó…'},saved);
  const feedback=el('p',{class:'form-feedback','aria-live':'polite'});
  const form=el('form',{class:'panel-body node-notes'},el('label',{},'Notas do nó',input),el('small',{},'As notas ficam salvas neste navegador e associadas ao nó e à sua identidade.'),el('div',{class:'form-actions'},el('button',{type:'submit',class:'primary'},'Salvar notas')),feedback);
  form.onsubmit=event=>{event.preventDefault();try{localStorage.setItem(key,input.value);feedback.textContent='Notas salvas neste navegador.';}catch{feedback.textContent='Não foi possível salvar as notas neste navegador.';}};
  return panel('Notas',form);
}
async function serverSystemView(scope,server){
  const metrics=session.host_metrics?await read('host-summary',undefined,scope).catch(error=>({error})):{};
  const cpu=metrics.data?.cpu,memory=metrics.data?.memory;
  return el('div',{},
    panel('Sistema',el('div',{class:'panel-body'},kv([
      ['Servidor',server.environment?.server_name],['Arquitetura do kernel',server.environment?.kernel_architecture],['Sistema de containers','Incus'],
      ['Versão do Incus',server.environment?.server_version],['API',server.api_version||'1.0'],['Cluster',server.environment?.server_clustered?'Configurado':'Standalone'],
      ['CPUs lógicas',cpu?.total],['Memória total',memory?.total==null?'n/d':bytes(memory.total)]
    ]),metrics.error?errorNode(metrics.error):null)),
    extensionsView(server.api_extensions));
}
async function networksView(scope){
  try{
    const data=(await read('networks',undefined,scope)).data;
    const content=el('div');
    content.append(propertiesGrid('Redes do nó',['NOME','TIPO','GERENCIADA','ESTADO','IPv4 / CIDR','IPv6 / CIDR','USO','CONFIGURAÇÃO'],data,item=>[
      el('a',{href:'#network/'+encodeURIComponent(item.name)},item.name),item.type,item.managed?'Sim':'Não',item.status||'n/d',
      item.config?.['ipv4.address']||'—',item.config?.['ipv6.address']||'—',(item.used_by||[]).length,configurationSummary(item.config)
    ],item=>openResourceProperties(item,'network')));
    if(canManageNetworks()){
      const networkName=el('input',{name:'network-name',maxlength:'15',pattern:'[A-Za-z0-9][A-Za-z0-9_\\-]{0,14}',required:'',placeholder:'Ex.: bridge-lab',title:'Até 15 caracteres: letras, números, hífen ou sublinhado.'});
      const description=el('input',{name:'description',maxlength:'1024',placeholder:'Opcional'});
      const editor=bridgeOptions({'ipv4.address':'auto','ipv4.dhcp':'true','ipv4.nat':'true','ipv6.address':'none','ipv6.dhcp':'false','ipv6.nat':'false'});
      const mode=el('select',{name:'bridge-mode'},el('option',{value:'nat'},'Rede privada com NAT e DHCP'),el('option',{value:'isolated'},'Bridge vazia (sem IP, DHCP ou NAT)'));
      mode.onchange=()=>editor.setValues({'ipv4.address':mode.value==='isolated'?'none':'auto','ipv4.dhcp':String(mode.value!=='isolated'),'ipv4.nat':String(mode.value!=='isolated'),'ipv4.dhcp.ranges':'','ipv6.address':'none','ipv6.dhcp':'false','ipv6.nat':'false','ipv6.dhcp.ranges':'','ipv6.dhcp.stateful':'false'});
      const form=el('form',{class:'network-form'},el('label',{class:'full'},'Nome da bridge',networkName),el('label',{class:'full'},'Configuração inicial',mode),...editor.fields,el('label',{class:'full'},'Descrição',description),el('div',{class:'network-form-actions'},el('button',{type:'submit',class:'primary'},...iconLabel('plus','Criar bridge')),el('button',{type:'button',onclick:closeEditor},'Cancelar')));
      form.onsubmit=event=>{event.preventDefault();openAction('network-create',networkName.value.trim(),{config:editor.values(),description:description.value});};
      content.prepend(el('div',{class:'grid-toolbar'},el('button',{type:'button','data-action':'network-create',onclick:()=>openEditor('Criar: Linux Bridge (Incus)',el('div',{},form,notice('Escolha NAT/DHCP ou uma bridge vazia para conectar containers. Bridges externas existentes, inclusive ligadas à placa física, podem ser selecionadas em Container → Rede.')))},...iconLabel('plus','Criar bridge'))));
    }else content.append(notice('A criação e edição de bridges exige manage_networks habilitado para administradores.'));
    if(session.host_metrics){
      const bridges=data.filter(item=>item.managed&&item.type==='bridge');
      const leases=await Promise.all(bridges.map(async network=>({network,result:await read('network-leases',network.name,scope).then(value=>({data:value.data}),error=>({error}))})));
      for(const {network,result} of leases){
        if(result.error)content.append(errorNode(result.error));
        else content.append(panel('Leases DHCP · '+network.name,table(['HOSTNAME','MAC','IPv4','IPv6'],result.data.map(lease=>[lease.hostname||'—',lease.hwaddr||'—',lease.ipv4||(lease.address&&!lease.address.includes(':')?lease.address:'—'),lease.ipv6||(lease.address?.includes(':')?lease.address:'—')]))));
      }
    }else content.append(notice('A lista de leases DHCP pode incluir outros Projects e exige a permissão de métricas globais do host.'));
    return content;
  }catch(error){return errorNode(error);}
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
async function searchView(scope,instances){
  const owner=session;
  const input=el('input',{id:'resource-search',type:'search',placeholder:'Nome, estado ou descrição','aria-label':'Pesquisar recursos'});
  input.value=$('#global-search').value;
  const types=[['','Todos os tipos'],['container','Containers'],['node','Nós'],['storage','Armazenamento'],['network','Redes'],['image','Imagens'],['profile','Perfis'],['project','Projetos']];
  const type=el('select',{'aria-label':'Filtrar tipo de recurso'},types.map(([value,label])=>el('option',{value},label)));
  const output=el('div',{class:'search-results'});
  const form=el('form',{class:'toolbar search-form resource-filter'},type,el('label',{},'Procurar:',input),el('button',{type:'submit'},'Pesquisar'));
  const resources=[['image','images'],['network','networks'],['profile','profiles'],['project','projects']];
  if(session.host_metrics)resources.push(['storage','pools']);
  const settled=await Promise.allSettled(resources.map(([,resource])=>read(resource,undefined,scope)));
  if(session!==owner)return el('div');
  const records=instances.map(item=>({type:'container',name:item.name,status:item.status,detail:item.architecture||'—',href:instanceLink(item.name)}));
  records.push({type:'node',name:serverInfo.environment?.server_name||scope.host,status:'Conectado',detail:'Incus '+(serverInfo.environment?.server_version||''),href:'#server/summary'});
  settled.forEach((result,index)=>{
    if(result.status!=='fulfilled')return;
    const [kind]=resources[index],items=Array.isArray(result.value.data)?result.value.data:[];
    for(const item of items){
      if(kind==='image')records.push({type:kind,name:item.properties?.description||item.aliases?.[0]?.name||item.fingerprint,status:'Disponível',detail:(item.architecture||'—')+' · '+bytes(item.size),href:'#images',search:[item.fingerprint,...(item.aliases||[]).map(alias=>alias.name)]});
      else if(kind==='network')records.push({type:kind,name:item.name,status:item.status||'—',detail:(item.type||'—')+' · '+(item.managed?'Gerenciada':'Externa'),href:'#network/'+encodeURIComponent(item.name)});
      else if(kind==='storage')records.push({type:kind,name:item.name,status:item.status||'—',detail:item.driver||'—',href:'#storage/'+encodeURIComponent(item.name)+'/summary'});
      else records.push({type:kind,name:item.name,status:'Disponível',detail:item.description||'—',href:kind==='profile'?'#profiles':'#projects'});
    }
  });
  const labels={container:['box','CT'],node:['node','Nó'],storage:['storage','Armazenamento'],network:['network','Rede'],image:['file','Imagem'],profile:['settings','Perfil'],project:['file','Projeto']};
  function update(){
    const term=input.value.trim().toLocaleLowerCase('pt-BR');
    const matches=records.filter(item=>(!type.value||type.value===item.type)&&[item.name,item.status,item.detail,...(item.search||[])].join(' ').toLocaleLowerCase('pt-BR').includes(term));
    output.replaceChildren(table(['TIPO','DESCRIÇÃO','ESTADO','PROJETO','DETALHES'],matches.map(item=>[el('span',{class:'container-name'},icon(labels[item.type][0]),labels[item.type][1]),el('a',{href:item.href},item.name),status(item.status),scope.project,item.detail])));
    const failures=settled.filter(result=>result.status==='rejected').length;
    if(failures)output.append(notice(`${failures} fonte(s) não puderam ser consultadas. A lista exibe somente dados autorizados.`));
  }
  input.oninput=()=>{$('#global-search').value=input.value;renderResourceTree();update();};type.onchange=update;
  form.onsubmit=event=>{event.preventDefault();update();};update();
  return el('section',{class:'panel resource-grid'},form,output);
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
  const username=el('input',{name:'username',required:'',maxlength:'64',pattern:'[A-Za-z0-9][A-Za-z0-9_.@\\-]{0,63}',autocomplete:'username',value:initial?.username||'',readonly:creating?null:''});
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
    el('div',{class:'form-actions'},save,el('button',{type:'button',onclick:closeEditor},'Cancelar')),feedback);
  if(initial?.username===session.username){
    form.querySelectorAll('input,select,button').forEach(control=>control.disabled=true);
    feedback.textContent='Entre com outra conta administradora para alterar ou remover este usuário.';
  }
  form.onsubmit=async event=>{
    event.preventDefault();if(save.disabled)return;
    if(!form.querySelector('input[name=project]:checked')){feedback.textContent='Selecione pelo menos um projeto autorizado.';return;}
    save.disabled=true;feedback.textContent='Salvando…';
    try{
      const selected={};
      for(const checkbox of form.querySelectorAll('input[name="project"]'))if(checkbox.checked)(selected[checkbox.dataset.host]??=[]).push(checkbox.value);
      const result=await api('/api/users',{action:creating?'create':'update',username:username.value,role:role.value,scopes:selected,host_metrics:hostMetrics?.querySelector('input').checked||false,password:password.value});
      notify(creating?'Usuário criado.':`Permissões de ${result.username} atualizadas.`);
      closeEditor();await render();
    }catch(error){feedback.textContent=error.message;save.disabled=false;}
  };
  return form;
}
async function usersView() {
  if(!session.manage_users)return notice('A gestão de usuários exige uma conta administradora e configuração persistente do painel.',true);
  try{
    const result=await api('/api/users');
    const users=result.users||[];
    function removeUser(user){
      const target=el('input',{required:'',autocomplete:'off','aria-label':'Nome do usuário para confirmar'}),error=el('p',{class:'form-feedback',role:'alert'}),submit=el('button',{type:'submit',class:'danger-primary'},'Remover conta');
      const form=el('form',{class:'user-form'},el('p',{},`As sessões de ${user.username} serão encerradas. Digite o nome do usuário para confirmar a remoção.`),target,el('div',{class:'form-actions'},el('button',{type:'button',onclick:closeEditor},'Cancelar'),submit),error);
      form.onsubmit=async event=>{event.preventDefault();if(target.value!==user.username){error.textContent='Digite '+user.username+' exatamente como exibido.';return;}submit.disabled=true;
        try{await api('/api/users',{action:'delete',username:user.username});closeEditor();notify(`Conta ${user.username} removida.`);await render();}catch(reason){error.textContent=reason.message;submit.disabled=false;}
      };
      openEditor('Remover: '+user.username,form);
    }
    const rows=users.map(user=>[user.username,user.role,Object.entries(user.scopes||{}).map(([host,projects])=>`${host}: ${projects.join(', ')}`).join(' · '),user.host_metrics?'Sim':'Não',el('div',{class:'row-actions'},el('button',{type:'button',onclick:()=>openEditor('Editar: '+user.username,userForm(user))},'Editar'),el('button',{type:'button',class:'danger-button',disabled:user.username===session.username?'':null,onclick:()=>removeUser(user)},'Remover'))]);
    const container=el('div',{},panel('Usuários',el('div',{},el('div',{class:'grid-toolbar'},el('button',{type:'button',onclick:()=>openEditor('Adicionar: usuário',userForm())},...iconLabel('plus','Adicionar'))),table(['USUÁRIO','PAPEL','PROJECTS','MÉTRICAS DO HOST','AÇÕES'],rows))));
    container.append(notice('As permissões são aplicadas no servidor em cada requisição. Administradores só podem conceder Projects que já estejam em seu próprio escopo.'));
    return container;
  }catch(error){return errorNode(error);}
}
function instanceNetworkCounters(state){
  let received=0,sent=0,found=false;
  for(const network of Object.values(state.network||{})){
    const counters=network?.counters||{};
    if(Number.isFinite(Number(counters.bytes_received)))received+=Number(counters.bytes_received),found=true;
    if(Number.isFinite(Number(counters.bytes_sent)))sent+=Number(counters.bytes_sent),found=true;
  }
  return found?{received,sent}:null;
}
function instanceSummaryView(scope,item,state,stateResultTimestamp){
  const root=Object.entries(item.expanded_devices||{}).find(([,device])=>device.type==='disk'&&device.path==='/');
  const cpu=state.cpu?.usage==null?null:Number(state.cpu.usage)/1e9,memory=state.memory?.usage;
  const disk=state.disk?.[root?.[0]||'root']?.usage??state.disk?.root?.usage;
  const samples={
    cpu:rememberMetric(scope.host+'/'+scope.project+'/'+item.name+'/cpu',cpu,stateResultTimestamp),
    memory:rememberMetric(scope.host+'/'+scope.project+'/'+item.name+'/memory',memory,stateResultTimestamp),
    disk:rememberMetric(scope.host+'/'+scope.project+'/'+item.name+'/disk',disk,stateResultTimestamp)
  };
  const counters=instanceNetworkCounters(state);
  const received=rememberMetric(scope.host+'/'+scope.project+'/'+item.name+'/received',counters?.received,stateResultTimestamp);
  const sent=rememberMetric(scope.host+'/'+scope.project+'/'+item.name+'/sent',counters?.sent,stateResultTimestamp);
  const addresses=Object.values(state.network||{}).flatMap(network=>network?.addresses||[]).filter(address=>['inet','inet6'].includes(address.family)).map(address=>address.address+(address.netmask?'/'+address.netmask:''));
  const privileged=(item.expanded_config?.['security.privileged']??item.config?.['security.privileged'])==='true';
  const statePanel=panel('Estado',el('div',{class:'panel-body resource-summary-state'},kv([
    ['Status',status(state.status)],['Nó',scope.host],['Sem privilégios',privileged?'Não':'Sim'],
    ['Uso de CPU',cpu===null?'n/d':fmt(cpu)+' s acumulados'],['Memória em uso',memory==null?'n/d':bytes(memory)],['Limite de memória',item.expanded_config?.['limits.memory']||'Sem limite explícito'],
    ['Swap',state.memory?.swap_usage==null?'n/d':bytes(state.memory.swap_usage)],['Disco raiz',root?.[1]?.size||'Capacidade do pool'],['IPs',addresses.join(', ')||'Sem informação de rede']
  ])));
  const notes=panel('Notas',el('div',{class:'panel-body instance-notes'},el('p',{},item.description||'Nenhuma nota cadastrada.'),el('a',{href:instanceLink(item.name,'options'),class:'button-link'},...iconLabel('edit','Editar opções'))));
  const charts=[
    metricChart('Uso de CPU acumulado',samples.cpu,{unit:'s',color:'#91bd20',emptyText:'O Incus não informou o contador de CPU.'}),
    metricChart('Uso de memória',samples.memory,{unit:'bytes',color:'#2682ad',emptyText:'O Incus não informou o uso de memória.'}),
    metricChart('Rede · bytes recebidos',received,{unit:'bytes',color:'#91bd20',emptyText:'Contadores de rede não disponíveis para este container.'}),
    metricChart('Rede · bytes enviados',sent,{unit:'bytes',color:'#2682ad',emptyText:'Contadores de rede não disponíveis para este container.'}),
    metricChart('Uso de disco',samples.disk,{unit:'bytes',color:'#c79629',emptyText:'O Incus não informou o uso do disco.'})
  ];
  return el('div',{class:'dashboard-view'},el('div',{class:'grid dashboard-top'},statePanel,notes),el('div',{class:'grid instance-charts'},charts),el('small',{},'Os gráficos mantêm amostras coletadas nesta sessão. O Incus não fornece histórico persistente de métricas.'));
}
function snapshotLoading(target,show){
  target.querySelector(':scope > .snapshot-loading-mask')?.remove();
  target.classList.toggle('snapshot-loading',show);
  if(show){
    target.setAttribute('aria-busy','true');
    target.append(el('div',{class:'snapshot-loading-mask',role:'status'},el('div',{class:'snapshot-loading-message'},el('span',{class:'snapshot-task-spinner','aria-hidden':'true'}),'Aguarde...')));
  }else target.removeAttribute('aria-busy');
}
function snapshotTaskTitle(run){return `CT ${run.target} - ${({'snapshot':'Snapshot','snapshot-delete':'Excluir Snapshot','snapshot-restore':'Reverter Snapshot'})[run.action]||'Snapshot'}`;}
function snapshotMillis(value){return typeof value==='number'?(value>1e12?value:value*1000):Date.parse(value);}
function snapshotTaskSuccess(run){return run.status_code===200&&!run.err;}
function appendSnapshotLog(run,text){
  text=String(text).slice(0,2000);run.output??=[];
  if(run.output.at(-1)!==text)run.output.push(text);
  if(run.output.length>200)run.output.shift();
}
function snapshotTaskOutput(run){
  const lines=[...(run.output||[])];
  if(snapshotTaskSuccess(run))lines.push('TASK OK');
  else if(run.status_code>=200)lines.push('TASK ERROR: '+(run.err||run.status||'A operação não foi concluída.'));
  return lines.join('\n')||'Aguardando a resposta do Incus...';
}
function snapshotTaskRecord(run){
  return {...run.scope,id:run.operation,action:run.action,target:run.target,snapshot:run.snapshot,
    identity:run.identity,requested_at:run.requested_at,created_at:run.created_at,ended_at:run.ended_at,
    status:run.status,status_code:run.status_code,err:run.err,metadata:run.metadata,output:[...run.output]};
}
function watchingSnapshotTask(run){
  if(session!==run.owner||host!==run.scope.host||project!==run.scope.project||document.hidden)return false;
  const r=route();
  return ($('#snapshot-progress').open&&$('#snapshot-progress').dataset.snapshotRun===run.key)||
    ($('#task-detail').open&&$('#task-detail').dataset.snapshotRun===run.key)||
    (r.page==='instance'&&r.target===run.target&&['snapshots','history'].includes(r.tab))||r.page==='tasks';
}
function resumeSnapshotTasks(){
  for(const run of snapshotRuns.values())if(watchingSnapshotTask(run)&&run.status_code<200&&!run.polling&&!run.connectionError){clearTimeout(run.timer);run.timer=setTimeout(()=>pollSnapshotTask(run),0);}
}
function retrySnapshotTask(run){run.connectionError=null;appendSnapshotLog(run,'Consultando novamente a operação no Incus.');pollSnapshotTask(run);}
function updateSnapshotTaskWindows(run){
  if($('#task-detail').open&&$('#task-detail').dataset.snapshotRun===run.key)openSnapshotTaskViewer(run,false);
  if($('#snapshot-progress').open&&$('#snapshot-progress').dataset.snapshotRun===run.key)renderSnapshotProgress(run);
}
function renderSnapshotProgress(run){
  const text=run.connectionError?'Conexão interrompida':snapshotTaskSuccess(run)?'Concluído':run.status_code>=200?'Falhou':'running...';
  const progress=Object.entries(run.metadata||{}).find(([key,value])=>/progress/i.test(key)&&typeof value==='string'&&/\d+(?:\.\d+)?\s*%/.test(value))?.[1];
  const percent=progress?Math.max(0,Math.min(100,Number(progress.match(/(\d+(?:\.\d+)?)\s*%/)[1]))):null;
  const bar=el('div',{class:'snapshot-progress-bar',role:'progressbar','aria-label':text,'aria-valuemin':'0','aria-valuemax':'100',...(run.status_code>=200?{'aria-valuenow':snapshotTaskSuccess(run)?'100':'0'}:percent!==null?{'aria-valuenow':String(percent)}:{'aria-valuetext':'Progresso não informado pelo Incus'})},
    el('span',{class:'snapshot-progress-fill'+(run.status_code<200&&percent===null&&!run.connectionError?' indeterminate':''),style:`width:${snapshotTaskSuccess(run)?100:percent??10}%`}),el('span',{class:'snapshot-progress-text'},text));
  const footer=el('div',{class:'snapshot-progress-footer'},run.connectionError?el('button',{type:'button',onclick:()=>retrySnapshotTask(run)},'Consultar novamente'):null,
    el('button',{type:'button',class:'primary','data-action':'snapshot-task-details',onclick:()=>openSnapshotTaskViewer(run)},'Detalhes'));
  $('#snapshot-progress-title').textContent='Tarefa: '+snapshotTaskTitle(run);
  $('#snapshot-progress-content').replaceChildren(el('div',{class:'snapshot-progress-body'},bar),footer);
}
function openSnapshotTaskViewer(run,show=true){
  const dialog=$('#task-detail');
  const previous=dialog.querySelector('.task-view-output'),scrollTop=previous?.scrollTop||0,follow=!previous||previous.scrollHeight-previous.clientHeight-scrollTop<24;
  const focused=dialog.contains(document.activeElement)?document.activeElement.dataset.snapshotControl:null;
  if(show){run.viewerTab='output';$('#snapshot-progress').close();}
  delete dialog.dataset.taskRun;dialog.dataset.snapshotRun=run.key;
  $('#task-detail-title').textContent='Task viewer: '+snapshotTaskTitle(run);
  $('#close-task-detail').replaceChildren(icon('close-circle'));
  const active=run.viewerTab||'output',tabs=el('div',{class:'task-view-tabs',role:'tablist','aria-label':'Detalhes da tarefa de snapshot'});
  for(const [key,label] of [['output','Saída'],['status','Status']])tabs.append(el('button',{id:'snapshot-task-tab-'+key,type:'button',role:'tab',class:active===key?'active':'','data-snapshot-control':key,'aria-selected':String(active===key),'aria-controls':'snapshot-task-page',tabindex:active===key?'0':'-1',onclick:()=>{run.viewerTab=key;openSnapshotTaskViewer(run,false);}},label));
  tabs.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();run.viewerTab=event.key==='Home'?'output':event.key==='End'?'status':active==='output'?'status':'output';openSnapshotTaskViewer(run,false);$('#snapshot-task-tab-'+run.viewerTab).focus();}};
  const toolbar=el('div',{class:'task-view-toolbar snapshot-task-toolbar'},el('button',{type:'button',disabled:'',title:'Interrupção de tarefas de snapshot indisponível neste painel.'},'Parar'));
  if(run.connectionError)toolbar.append(el('button',{type:'button','data-snapshot-control':'retry',onclick:()=>retrySnapshotTask(run)},'Consultar novamente'));
  if(active==='output')toolbar.append(el('button',{type:'button','data-snapshot-control':'download',disabled:run.status_code<200?'':null,onclick:()=>{
    const url=URL.createObjectURL(new Blob([snapshotTaskOutput(run)+'\n'],{type:'text/plain;charset=utf-8'}));
    el('a',{href:url,download:`ct-${run.target}-${run.action}-${run.snapshot||run.operation}.log`}).click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }},...iconLabel('download','Download')));
  const body=el('div',{id:'snapshot-task-page',class:'task-view-body',role:'tabpanel','aria-labelledby':'snapshot-task-tab-'+active});
  if(active==='output')body.append(el('pre',{class:'task-view-output',tabindex:'0','data-snapshot-control':'log','aria-label':'Saída da tarefa de snapshot','aria-live':'polite'},snapshotTaskOutput(run)));
  else body.append(el('div',{class:'task-view-status'},kv([
    ['Status',run.connectionError?'Conexão interrompida':run.status_code<200?'running':snapshotTaskSuccess(run)?'stopped: OK':'stopped: ERROR'],
    ['Tipo de tarefa',snapshotTaskTitle(run)],['Nome de usuário',run.identity||session?.username],['Nó',run.scope.host],['Projeto',run.scope.project],['Container',run.target],['Snapshot',run.snapshot||'—'],
    ['Tempo de início',localDate(run.created_at||run.requested_at)],['Término',run.status_code>=200?localDate(run.ended_at):'—'],
    ['Duração',Math.max(0,Math.round(((snapshotMillis(run.ended_at)||Date.now())-(snapshotMillis(run.created_at||run.requested_at)||Date.now()))/1000))+' s'],
    ['ID da tarefa',run.operation],['Resultado',run.connectionError||run.err||(snapshotTaskSuccess(run)?'TASK OK':'Aguardando o Incus.')]
  ])));
  $('#task-detail-content').replaceChildren(el('div',{class:'task-viewer snapshot-task-viewer'},tabs,toolbar,body));
  if(show&&!dialog.open)dialog.showModal();
  const output=dialog.querySelector('.task-view-output');if(output)output.scrollTop=follow?output.scrollHeight:scrollTop;
  if(!show&&focused)dialog.querySelector(`[data-snapshot-control="${focused}"]`)?.focus({preventScroll:true});
  if(show){$('#snapshot-task-tab-output').focus();if(run.status_code<200&&!run.connectionError)resumeSnapshotTasks();}
}
function startSnapshotTask(action,operation,owner){
  const scope={host:action.host,project:action.project},key=`${scope.host}/${scope.project}/${operation}`;
  const run={key,scope,owner,operation,action:action.action,target:action.target,snapshot:action.snapshot,
    identity:owner.username,requested_at:Date.now()/1000,status_code:100,status:'Running',metadata:{},output:[]};
  appendSnapshotLog(run,`Container: ${run.target} · Snapshot: ${run.snapshot}`);
  appendSnapshotLog(run,`Operação ${operation} aceita pelo Incus.`);
  snapshotRuns.set(key,run);
  if(snapshotRuns.size>100){const old=[...snapshotRuns].find(([id,item])=>id!==key&&item.status_code>=200);if(old){clearTimeout(old[1].timer);clearTimeout(old[1].closeTimer);snapshotRuns.delete(old[0]);}}
  trackTask(key,snapshotTaskRecord(run));
  if(action.action==='snapshot')openSnapshotTaskViewer(run);
  else{
    const dialog=$('#snapshot-progress');dialog.dataset.snapshotRun=key;renderSnapshotProgress(run);
    $('#close-snapshot-progress').replaceChildren(icon('close-circle'));dialog.showModal();
  }
  pollSnapshotTask(run);
  return run;
}
async function pollSnapshotTask(run){
  if(!watchingSnapshotTask(run)||run.status_code>=200||run.polling)return;
  clearTimeout(run.timer);run.polling=true;
  try{
    const state=(await read('operation',run.operation,run.scope)).data;
    if(session!==run.owner)return;
    if(state.status_code!==run.status_code)appendSnapshotLog(run,'Incus: '+(state.status||state.status_code));
    Object.assign(run,state,{connectionError:null});
    for(const [key,value] of Object.entries(state.metadata||{}))if(/progress/i.test(key)&&typeof value==='string')appendSnapshotLog(run,key+': '+value);
    if(run.status_code>=200){
      run.ended_at=state.updated_at||Date.now()/1000;
      appendSnapshotLog(run,snapshotTaskSuccess(run)?({'snapshot':'Snapshot criado e confirmado pelo Incus.','snapshot-delete':'Remoção do snapshot confirmada pelo Incus.','snapshot-restore':'Reversão confirmada pelo Incus.'})[run.action]:run.err||'A operação terminou com erro.');
      invalidateMutation('/api/action',{...run.scope,action:run.action,target:run.target});
    }
    trackTask(run.key,snapshotTaskRecord(run));updateSnapshotTaskWindows(run);
    if(run.status_code>=200){
      if($('#snapshot-progress').open&&$('#snapshot-progress').dataset.snapshotRun===run.key){
        if(snapshotTaskSuccess(run))run.closeTimer=setTimeout(()=>{if($('#snapshot-progress').dataset.snapshotRun===run.key)$('#snapshot-progress').close();},1000);
        else openSnapshotTaskViewer(run);
      }
      if(host===run.scope.host&&project===run.scope.project&&route().page==='instance'&&route().target===run.target&&route().tab==='snapshots')await render();
    }
  }catch(error){
    if(session!==run.owner)return;
    run.connectionError=error.message;appendSnapshotLog(run,'Não foi possível consultar a operação: '+error.message);updateSnapshotTaskWindows(run);
  }finally{
    run.polling=false;
    if(watchingSnapshotTask(run)&&run.status_code<200&&!run.connectionError)run.timer=setTimeout(()=>pollSnapshotTask(run),1000);
  }
}
$('#close-snapshot-progress').onclick=()=>$('#snapshot-progress').close();
async function snapshotsView(scope,item,result){
  result=result||await read('snapshots',item.name,scope);const owner=session;
  const snapshots=result.data.slice().sort((a,b)=>(Date.parse(a.created_at)||0)-(Date.parse(b.created_at)||0)||a.name.localeCompare(b.name));
  let selected=null,requesting=false;
  const allowed=canMutate(item.name),admin=allowed&&session.role==='administrador';
  const feedback=el('p',{class:'snapshot-feedback',role:'alert',hidden:''});
  const buttons={};
  const current=()=>session===owner&&host===scope.host&&project===scope.project&&route().target===item.name&&route().tab==='snapshots';
  async function activate(action){
    const selection=selected;
    if(action!=='snapshot'&&!selection)return;
    requesting=true;update();snapshotLoading(toolbar.parentElement,true);
    try{
      const [latest,instance]=await Promise.all([freshResource('snapshots',item.name,scope),freshResource('instance',item.name,scope)]);
      if(!current())return;
      if(action==='snapshot')openAction(action,item.name,{snapshotNames:latest.data.map(value=>value.name)});
      else{
        const snapshot=latest.data.find(value=>value.name===selection.name);
        if(!snapshot)throw new Error('Este snapshot não existe mais. Atualize a lista.');
        if(action==='snapshot-restore'&&instance.data.status!=='Stopped')throw new Error('Pare o container antes de reverter para este snapshot.');
        openAction(action,item.name,{snapshot:snapshot.name,...(action==='snapshot-edit'?{description:snapshot.description,revision:snapshot._revision}:{})});
      }
      feedback.hidden=true;
    }catch(error){if(current()){feedback.textContent=error.message;feedback.hidden=false;}}
    finally{requesting=false;snapshotLoading(toolbar.parentElement,false);update();}
  }
  function update(){
    buttons.snapshot.disabled=!allowed||!['Running','Stopped'].includes(item.status);
    buttons['snapshot-restore'].disabled=!admin||!selected||item.status!=='Stopped';
    buttons['snapshot-restore'].title=item.status!=='Stopped'?'Pare o container antes de reverter para um snapshot.':'Reverter para o snapshot selecionado';
    buttons['snapshot-edit'].disabled=!admin||!selected;
    buttons['snapshot-delete'].disabled=!admin||!selected;
    if(requesting)for(const button of Object.values(buttons))button.disabled=true;
  }
  const toolbar=el('div',{class:'snapshot-toolbar',role:'toolbar','aria-label':'Ações de snapshots'});
  for(const [action,label] of [['snapshot','Tirar um Snapshot'],['snapshot-restore','Reverter'],['snapshot-edit','Editar'],['snapshot-delete','Remover']]){
    buttons[action]=el('button',{type:'button',class:'action-button','data-action':action,onclick:()=>activate(action)},label);
    toolbar.append(buttons[action]);
  }
  const rows=[...snapshots.map(snapshot=>[el('span',{class:'snapshot-name'},icon('history'),snapshot.name),date(snapshot.created_at),el('span',{class:'snapshot-description',title:snapshot.description},snapshot.description)]),
    [el('span',{class:'snapshot-name'},icon('box'),'AGORA'),'',el('span',{class:'snapshot-current-description'},'Você está aqui!')]];
  const grid=table(['Nome','Data/Status','Descrição'],rows,{sortable:false,paginate:false,onSelect:index=>{selected=snapshots[index]||null;update();},onActivate:index=>{if(snapshots[index])activate('snapshot-edit');}});
  grid.querySelector('table').classList.add('snapshot-table');
  grid.querySelectorAll('tbody tr').forEach((row,index)=>{row.dataset.snapshot=snapshots[index]?.name||'current';});
  grid.querySelector('tbody tr:last-child').selectRow();
  update();
  return el('section',{class:'snapshot-grid'},toolbar,grid,feedback);
}
async function detail(r,scope,renderId=generation) {
  // Fetch independent data together. Revisits reuse the session cache; every
  // snapshot action still revalidates names and state before confirmation.
  const [instanceResult,stateResult,snapshotResult]=await Promise.all([read('instance',r.target,scope),['summary','resources','network'].includes(r.tab)?read('state',r.target,scope):Promise.resolve(null),r.tab==='snapshots'?read('snapshots',r.target,scope):Promise.resolve(null)]);
  if(renderId!==generation)return el('div');
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
    wrapper.append(instanceSummaryView(scope,item,state,stateResult?.timestamp));
    if(!canMutate(r.target))wrapper.append(notice('Ações bloqueadas pelo modo de leitura, papel ou autorização deste container.'));
  } else if(r.tab==='resources'||r.tab==='devices'){
    wrapper.append(panel('Recursos',table(['RECURSO','CONFIGURAÇÃO','USO ATUAL'],[['Memória',item.expanded_config?.['limits.memory']||'Herdado',bytes(state.memory?.usage)],['Núcleos',item.expanded_config?.['limits.cpu']||'Herdado','—'],['Limite de CPU',item.expanded_config?.['limits.cpu.allowance']||'Herdado',state.cpu?.usage==null?'n/d':fmt(state.cpu.usage/1e9)+' s acumulados'],...Object.entries(item.expanded_devices||{}).filter(([,d])=>d.type==='disk').map(([key,d])=>['Disco ('+key+')',(d.pool||'')+' · '+(d.size||'Capacidade do pool'),bytes(state.disk?.[key]?.usage)])]),el('a',{class:'button-link',href:instanceLink(r.target,'options')},'Editar')),
      propertiesGrid('Dispositivos',['DISPOSITIVO','TIPO','ORIGEM','CONFIGURAÇÃO'],Object.entries(item.expanded_devices||{}),([key,value])=>[key,value.type||'—',Object.hasOwn(item.devices||{},key)?'Local':'Herdado de perfil',configurationSummary(value,['type'])],([key,value])=>openProperties('Propriedades: Dispositivo '+key,()=>el('div',{class:'properties-sections'},kv([['Container',item.name],['Origem',Object.hasOwn(item.devices||{},key)?'Local':'Herdado de perfil']]),propertyTable(value)))));
  } else if(r.tab==='network'){
    wrapper.classList.add('nic-workspace');
    wrapper.append(await containerNetworksView(scope,item,state));
  } else if(r.tab==='dns'){
    const networks=(await read('networks',undefined,scope)).data;
    const used=new Set(Object.values(item.expanded_devices||{}).filter(d=>d.type==='nic').map(d=>d.network||d.parent));
    wrapper.append(panel('DNS herdado da rede',table(['REDE','DOMÍNIO','MODO','GATEWAY IPv4'],networks.filter(n=>used.has(n.name)).map(n=>[n.name,n.config?.['dns.domain']||'Padrão do Incus',n.config?.['dns.mode']||'Padrão do Incus',n.config?.['ipv4.address']||'n/d']))),notice('O container recebe DNS pelo DHCP da bridge. Alterações feitas dentro do sistema convidado não são consultadas por esta tela.'));
  }
  else if(r.tab==='options')wrapper.append(editView(item,scope));
  else if(r.tab==='history')wrapper.append(await instanceTaskHistoryView(scope,r.target));
  else if(r.tab==='permissions')wrapper.append(await permissionsView(scope,[item]));
  else if(r.tab==='snapshots'){
    wrapper.classList.add('snapshot-workspace');
    wrapper.append(await snapshotsView(scope,item,snapshotResult));
  }
  else if(r.tab==='backups'){
    const result=await read(r.tab,r.target,scope);
    const artifacts=result.data.map(item=>{
      const rawName=typeof item==='string'?item:item.name;
      const artifact=String(rawName||'').split('/').pop();
      const controls=el('div',{class:'row-actions'});
      const remove=actionButton('Excluir','backup-delete',r.target,{backup:artifact});
      remove.disabled=!(session.role==='administrador'&&canMutate(r.target));
      controls.append(remove);
      return [artifact,date(item.created_at),expiryDate(item.expires_at),controls];
    });
    wrapper.append(panel('Backups',table(['NOME','CRIADO EM','EXPIRA EM','AÇÕES'],artifacts),actionButton('Criar','backup',r.target)));
    wrapper.append(notice('Backups podem ser criados e excluídos. O download e a importação de arquivos ainda não estão disponíveis.'));
  } else if(r.tab==='console'){
    const allowed=session.enable_console&&canMutate(r.target)&&state.status==='Running'&&!session.demo;
    const controls=el('div',{class:'toolbar'},el('span',{id:'terminal-status',class:'terminal-status',role:'status'},allowed?'Conectando…':'Console indisponível'),el('button',{type:'button',disabled:allowed?null:'',onclick:()=>startTerminal(r.target).catch(showTerminalError)},'Reconectar'),el('button',{type:'button',disabled:allowed?null:'',onclick:()=>terminalState?.enqueue?.('\x03',true)},'Interromper'),el('button',{type:'button',onclick:()=>{closeConsole();const statusNode=$('#terminal-status');if(statusNode)statusNode.textContent='Desconectado';}},'Desconectar'));
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
  const form=el('form',{class:'panel-body edit-form'},fields,el('div',{class:'form-actions'},save,el('button',{type:'button',onclick:closeEditor},'Cancelar')),message);
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
      closeEditor();
      if(state.status_code<200){location.hash='#tasks';return;}
      if(host===scope.host&&project===scope.project&&route().target===item.name&&route().tab==='options')await render();
    }catch(error){message.textContent=error.message;message.setAttribute('role','alert');}
    finally{fields.disabled=!allowed;save.disabled=!allowed;}
  };
  const effective=item.expanded_config||{};
  const rows=[['Descrição',item.description||'—'],['Memória',effective['limits.memory']||'Herdada do perfil'],['CPU',effective['limits.cpu']||'Herdada do perfil'],['Inicialização automática',effective['boot.autostart']==='true'?'Sim':'Não'],['Proteção contra exclusão',effective['security.protection.delete']==='true'?'Sim':'Não']];
  const output=el('div',{},panel('Opções',el('div',{},el('div',{class:'grid-toolbar'},el('button',{type:'button','data-action':'instance-edit',disabled:allowed?null:'',onclick:()=>openEditor('Editar: '+item.name,form)},...iconLabel('edit','Editar')),el('button',{type:'button','data-action':'technical-properties','aria-haspopup':'dialog',onclick:()=>openProperties('Configuração técnica: '+item.name,()=>el('div',{class:'properties-sections'},el('section',{},el('h2',{},'Configuração local'),propertyTable(item.config)),el('section',{},el('h2',{},'Configuração efetiva, incluindo perfis'),propertyTable(item.expanded_config))))},...iconLabel('file','Configuração técnica'))),table(['OPÇÃO','VALOR'],rows))));
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
  const state=terminalState,id=consoleId||state?.id;terminalState=null;consoleId=null;
  if(state){state.cancelled=true;state.connected=false;clearTimeout(state.inputTimer);state.cancelStream?.();state.socket?.close();state.observer?.disconnect();state.input?.dispose();state.term?.dispose();}
  if(id&&session){const owner=session;consoleClosing=consoleClosing.catch(()=>{}).then(()=>session===owner?api('/api/console/close',{console:id}):null).catch(()=>{});}
  await consoleClosing;
}
function connectConsoleStream(state,owner){
  if(typeof WebSocket!=='function')return Promise.resolve(false);
  return new Promise(resolve=>{
    const url=new URL('/api/console/stream',location.href);url.protocol=location.protocol==='https:'?'wss:':'ws:';url.searchParams.set('console',state.id);
    let socket,settled=false;
    const fail=()=>{if(settled)return;settled=true;clearTimeout(timeout);state.cancelStream=null;if(socket){socket.onopen=socket.onclose=socket.onerror=socket.onmessage=null;socket.close();}state.socket=null;resolve(false);};
    const timeout=setTimeout(fail,2000);state.cancelStream=fail;
    try{socket=new WebSocket(url,['incus-console-v1','csrf.'+owner.csrf]);state.socket=socket;}catch{fail();return;}
    socket.onopen=()=>{
      if(state.cancelled||session!==owner){fail();return;}
      settled=true;clearTimeout(timeout);state.cancelStream=null;state.streaming=true;resolve(true);
    };
    socket.onerror=()=>{if(!settled)fail();};
    socket.onmessage=event=>{
      if(state.cancelled||state.ended)return;
      try{
        const message=JSON.parse(event.data);
        if(message.type==='output')state.term.write(message.text,()=>{if(socket.readyState===1&&!state.cancelled)socket.send(JSON.stringify({type:'ack',seq:message.seq}));});
        else if(message.type==='closed')endTerminal(state,'Console encerrado');
      }catch{endTerminal(state,'Resposta inválida do console. Use Reconectar.');socket.close();}
    };
    socket.onclose=()=>{if(!settled){fail();return;}if(!state.cancelled&&!state.ended)endTerminal(state,'Conexão interrompida. Use Reconectar.');};
  });
}
function endTerminal(state,message){
  if(state.ended||state.cancelled)return;
  state.ended=true;state.connected=false;state.pending='';clearTimeout(state.inputTimer);clearTimeout(consoleTimer);
  state.input?.dispose();state.observer?.disconnect();state.term.writeln('\r\n['+message+']');
  if(consoleId===state.id)consoleId=null;showTerminalError(new Error(message));
}
async function startTerminal(target){
  const owner=session,scope={host,project};
  await closeConsole();
  const output=$('#console-output');if(!output||!session||session!==owner||host!==scope.host||project!==scope.project||route().page!=='instance'||route().target!==target||route().tab!=='console')return;
  const state={cancelled:false,connected:false,pending:''};
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
  if(result.stream)await connectConsoleStream(state,owner);
  if(state.cancelled||session!==owner)return;
  state.connected=true;
  const statusNode=$('#terminal-status');if(statusNode)statusNode.textContent='Conectado · '+target;
  const flush=async()=>{
    if(state.cancelled||!state.connected||state.sending||!state.pending)return;
    if(state.streaming&&state.socket.bufferedAmount>65536){state.inputTimer=setTimeout(flush,16);return;}
    state.sending=true;
    let count=Math.min(4096,state.pending.length);if(count<state.pending.length&&/[\uD800-\uDBFF]/.test(state.pending[count-1]))count--;
    const text=state.pending.slice(0,count);state.pending=state.pending.slice(count);
    try{
      if(state.streaming){if(state.socket.readyState!==1)throw new Error('Conexão interrompida. Use Reconectar.');state.socket.send(JSON.stringify({type:'input',text}));}
      else{await api('/api/console/input',{console:state.id,text});if(!state.cancelled){clearTimeout(consoleTimer);pollConsole();}}
    }
    catch(error){if(!state.cancelled){showTerminalError(error);closeConsole();}}
    finally{state.sending=false;if(!state.cancelled&&state.pending)state.inputTimer=setTimeout(flush,0);}
  };
  state.enqueue=(data,immediate=false)=>{
    if(!state.connected||state.cancelled)return false;
    if(state.pending.length+data.length>262144){showTerminalError(new Error('A entrada está cheia. Aguarde antes de enviar mais texto.'));return false;}
    state.pending+=data;clearTimeout(state.inputTimer);state.inputTimer=setTimeout(flush,immediate||/[\r\x03]/.test(data)?0:16);return true;
  };
  state.input=state.term.onData(data=>state.enqueue(data));
  state.term.attachCustomKeyEventHandler(event=>{
    if(event.ctrlKey&&event.shiftKey&&event.code==='KeyC'&&state.term.hasSelection()){if(event.type==='keydown')navigator.clipboard?.writeText(state.term.getSelection()).catch(()=>{});return false;}
    return true;
  });
  const resize=()=>{
    if(state.cancelled||!output.isConnected)return;
    state.fit.fit();const width=Math.max(20,Math.min(300,state.term.cols)),height=Math.max(5,Math.min(100,state.term.rows));
    if(state.term.cols!==width||state.term.rows!==height)state.term.resize(width,height);
    if(state.lastSize===width+'x'+height)return;state.lastSize=width+'x'+height;
    if(state.streaming&&state.socket.readyState===1)state.socket.send(JSON.stringify({type:'resize',width,height}));
    else api('/api/console/resize',{console:state.id,width,height}).catch(showTerminalError);
  };
  state.observer=new ResizeObserver(resize);state.observer.observe(output);resize();state.term.focus();if(!state.streaming)pollConsole();
}
async function pollConsole(){
  const id=consoleId,state=terminalState;if(!id||!state||state.cancelled||state.streaming)return;
  if(state.reading)return;
  state.reading=true;
  try{
    const result=await api('/api/console/read?'+new URLSearchParams({console:id}));if(consoleId!==id||state.cancelled)return;
    if(result.output)state.term.write(result.output);
    if(result.closed){endTerminal(state,'Console encerrado');api('/api/console/close',{console:id}).catch(()=>{});return;}
    consoleTimer=setTimeout(pollConsole,document.hidden?2000:result.output?100:400);
  }catch(error){if(consoleId===id){showTerminalError(error);closeConsole();}}
  finally{state.reading=false;}
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
  return propertiesGrid('Operações assíncronas',['UUID','DESCRIÇÃO','ESTADO','PROGRESSO / ERRO'],[...all.values()],i=>[i.id,i.description||i.action,status(i.status),i.err?notice(i.err,true):operationMetadata(i.metadata)],openTaskDetail);
}
function operationList(data){return Array.isArray(data)?data:Object.values(data||{}).flat().filter(item=>item&&typeof item==='object');}
function operationMatchesInstance(operation,target){
  if(operation.target===target)return true;
  const paths=[...(operation.resources?.instances||[]),...(operation.resources?.containers||[])];
  if(paths.some(path=>{const name=String(path).split('/').pop();try{return decodeURIComponent(name)===target;}catch{return name===target;}}))return true;
  return String(operation.description||'').includes('/instances/'+target);
}
async function instanceTaskHistoryView(scope,target){
  try{
    const remote=operationList((await read('operations',undefined,scope)).data);
    const combined=new Map(remote.map(item=>[item.id,item]));
    for(const task of tasks.values())if(task.host===scope.host&&task.project===scope.project&&task.target===target)combined.set(task.id,{...combined.get(task.id),...task});
    const items=[...combined.values()].filter(item=>operationMatchesInstance(item,target)).reverse();
    return panel('Histórico de tarefas · '+target,table(['INÍCIO','OPERAÇÃO','ESTADO','RESULTADO',''],items.map(item=>[
      date(item.created_at||item.timestamp),item.description||item.action||item.id,status(item.status||String(item.status_code)),item.err||'—',el('button',{type:'button',class:'task-details-link',onclick:()=>openTaskDetail(item)},'Detalhes')
    ])));
  }catch(error){return errorNode(error);}
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
    if(run.status_code<200){if(watchingRun(run,'images'))run.timer=setTimeout(()=>pollImageDownload(run),1000);}
    else if(watchingRun(run,'images')){invalidateMutation('/api/images/download',run.scope);await render();}
  }catch(error){if(session===run.owner){run.connectionError=error.message;updateImageDownload(run);}}
  finally{run.polling=false;}
}
let lastWorkspaceHash='#overview',createRequest=0,createScope;
function canCreate(){return session&&!session.read_only&&session.role!=='observador'&&(session.manage_all_instances||(session.mutable_instances?.[host]?.[project]||[]).length>0);}
const createTrigger=el('button',{id:'create-ct',class:'primary',type:'button',onclick:()=>openCreateWizard()},...iconLabel('cube','Criar CT'));
$('#create-ct').replaceWith(createTrigger);
document.addEventListener('click',event=>{
  if(event.target.closest('a[href="#create"]')){event.preventDefault();openCreateWizard();}
  else if(event.target.closest('#task-detail a[href^="#"]'))$('#task-detail').close();
});
function closeCreateWizard(){createRequest++;createScope=null;$('#create-ct').removeAttribute('aria-busy');$('#create-ct').disabled=!canCreate();if($('#create-dialog').open)$('#create-dialog').close();}
async function openCreateWizard(){
  if(!canCreate()){notify('A criação exige permissão de escrita e um nome autorizado neste projeto.');return;}
  if(createScope||$('#create-dialog').open)return;
  const scope={host,project},owner=session,key=host+'/'+project,active=creationRuns.get(key);
  if(active&&active.status_code<200){openCreationTaskViewer(active);resumeRun(active,pollCreation);return;}
  const request=++createRequest;createScope=scope;
  $('#create-ct').setAttribute('aria-busy','true');$('#create-ct').disabled=true;
  try{
    const server=(await read('server',undefined,scope)).data;
    await createView(scope,server,request);
  }catch(error){
    if(session===owner&&request===createRequest){closeCreateWizard();notify(error.message);}
  }finally{
    if(request===createRequest){$('#create-ct').removeAttribute('aria-busy');$('#create-ct').disabled=!canCreate();}
  }
}
$('#close-create').onclick=closeCreateWizard;
$('#create-dialog').addEventListener('cancel',event=>{event.preventDefault();closeCreateWizard();});
async function createView(scope,server,request=createRequest) {
  const key=scope.host+'/'+scope.project;
  const owner=session;
  const [catalog,poolsResult,networksResult,profilesResult,instancesResult]=await Promise.all([read('creation-images',undefined,scope),session.host_metrics?read('pools',undefined,scope):Promise.resolve({data:[]}),read('networks',undefined,scope),read('profiles',undefined,scope),read('instance-list',undefined,scope)]);
  if(session!==owner||request!==createRequest||host!==scope.host||project!==scope.project)return el('div');
  const images=catalog.data.images,pools=poolsResult.data.filter(p=>p.status==='Created'),networks=networksResult.data.filter(availableBridge);
  const profile=profilesResult.data.find(p=>p.name==='default');
  const target=el('input',{name:'container-name',maxlength:'63',pattern:'[a-zA-Z0-9]([a-zA-Z0-9\\-]*[a-zA-Z0-9])?',placeholder:'Ex.: servidor-web',autocomplete:'off',required:''});
  const description=el('textarea',{name:'description',rows:'2',maxlength:'1024'});
  const image=el('select',{name:'image',required:''},el('option',{value:''},'Selecione um template…'),images.map(i=>el('option',{value:i.id},i.label+(i.remote_image?' · download':' · local'))));
  const pool=el('select',{name:'pool',required:session.host_metrics?'':null},pools.map(p=>el('option',{value:p.name},p.name+' ('+p.driver+')')));
  if(!session.host_metrics)pool.append(el('option',{value:''},'Automático / perfil default'));
  const defaultRoot=Object.values(profile?.devices||{}).find(d=>d.type==='disk'&&d.path==='/');if(pools.some(p=>p.name===defaultRoot?.pool))pool.value=defaultRoot.pool;
  const disk=el('input',{name:'disk-gib',type:'number',min:'1',max:'65536',placeholder:'Capacidade do pool'});
  const diskHelp=el('small');
  const cores=el('input',{name:'cpu-cores',type:'number',min:'1',max:'1024',value:'1',required:''});
  const allowance=el('input',{name:'cpu-allowance',type:'number',min:'1',max:'100',value:session.low_resource?'50':'100',required:''});
  const memory=el('input',{name:'memory-mib',type:'number',min:'32',max:'1048576',value:'128',required:''});
  const network=el('select',{name:'network',required:''},networks.map(n=>el('option',{value:n.name},bridgeLabel(n))));
  const defaultNicEntry=Object.entries(profile?.devices||{}).find(([,d])=>d.type==='nic'),defaultNic=defaultNicEntry?.[1],defaultBridge=defaultNic?.network||defaultNic?.parent;if(networks.some(n=>n.name===defaultBridge))network.value=defaultBridge;
  const ipv4Mode=el('select',{name:'ipv4-mode'},el('option',{value:'dhcp'},'DHCP'),el('option',{value:'static'},'Reserva IPv4 no DHCP'));
  const ipv4=el('input',{name:'ipv4',placeholder:'Ex.: 10.100.0.10',disabled:''});
  const subnet=el('input',{readonly:'','aria-label':'Sub-rede IPv4'}),domain=el('input',{readonly:''}),dnsMode=el('input',{readonly:''});
  const autostart=el('input',{name:'autostart',type:'checkbox'}),start=el('input',{name:'start-after-create',type:'checkbox',checked:''});
  const field=(label,input,cls)=>el('label',{class:cls},el('span',{},label,input.required?el('span',{class:'required-mark','aria-hidden':'true'},' *'):null),input);
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
    page(fields(field('Interface',el('input',{readonly:'',value:defaultNic?.name||defaultNicEntry?.[0]||'eth0'})),field('Bridge',network),field('IPv4',ipv4Mode),field('Endereço IPv4',ipv4),field('Sub-rede',subnet,'full')),notice('Bridges Incus permitem reserva IPv4 via DHCP. Bridges externas usam o DHCP da rede física ou a configuração dentro do container; reserve IP fixo no roteador ou configure no convidado.')),
    page(fields(field('Domínio DNS',domain,'full'),field('Modo DNS',dnsMode,'full')),notice('DNS é recebido pelo container via DHCP ou definido no próprio sistema. Em bridges externas, o servidor DHCP é o da rede física.')),
    page(review,fields(field('Iniciar após criar',start,'full')))
  ];
  const titles=['Geral','Template','Disco','CPU','Memória','Rede','DNS','Confirmar'];
  const tabs=el('div',{class:'wizard-tabs',role:'tablist','aria-label':'Etapas de criação'}),error=el('p',{id:'wizard-error',class:'wizard-error',role:'status','aria-live':'polite'});
  let step=0,reached=0;
  const back=el('button',{id:'wizard-back',type:'button',onclick:()=>show(step-1)},'Anterior'),next=el('button',{id:'wizard-next',type:'button',class:'primary',onclick:()=>advance()},'Próximo'),submit=el('button',{id:'wizard-submit',type:'submit',class:'primary'},'Criar');
  const form=el('form',{class:'wizard-form',novalidate:''},tabs,...sections,error,el('div',{class:'wizard-footer'},el('small',{},'Container Incus · '+scope.host+' / '+scope.project),el('button',{type:'button',onclick:closeCreateWizard},'Cancelar'),back,next,submit));
  const tabButtons=titles.map((title,index)=>{const button=el('button',{type:'button',role:'tab',id:'wizard-tab-'+index,'aria-controls':'wizard-page-'+index,onclick:()=>{if(index<=reached&&(index<=step||validateThrough(index)))show(index);}},title);sections[index].id='wizard-page-'+index;sections[index].setAttribute('aria-labelledby',button.id);return button;});tabs.append(...tabButtons);
  function invalidField(index){
    target.setCustomValidity('');ipv4.setCustomValidity('');
    const name=target.value;
    if(name&&instancesResult.data.some(item=>item.name.toLowerCase()===name.toLowerCase()))target.setCustomValidity('Já existe um container com este nome no projeto.');
    else if(name&&!session.manage_all_instances&&!(session.mutable_instances?.[scope.host]?.[scope.project]||[]).includes(name))target.setCustomValidity('Escolha um nome autorizado para sua conta neste projeto.');
    if(!ipv4.disabled&&ipv4.value){
      const config=networks.find(n=>n.name===network.value)?.config||{};
      const parse=value=>/^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value)&&value.split('.').every(part=>Number(part)<=255)?value.split('.').reduce((n,part)=>n*256+Number(part),0):null;
      const [gateway,prefix]=String(config['ipv4.address']||'').split('/'),address=parse(ipv4.value),gw=parse(gateway),bits=Number(prefix),size=2**(32-bits),base=Math.floor(gw/size)*size;
      if(address===null||gw===null||!/^\d+$/.test(prefix||'')||bits<0||bits>32||address<=base||address>=base+size-1||address===gw||config['ipv4.dhcp']==='false')ipv4.setCustomValidity('Informe um IPv4 válido e livre na sub-rede da bridge, diferente do gateway, com DHCP habilitado.');
      else if(instancesResult.data.some(item=>Object.values(item.expanded_devices||{}).some(device=>device.network===network.value&&device['ipv4.address']===ipv4.value)))ipv4.setCustomValidity('Este IPv4 já está reservado para outro container nesta rede.');
    }
    return [...sections[index].querySelectorAll('input,select,textarea')].find(input=>!input.disabled&&!input.validity.valid);
  }
  function fieldMessage(input){
    const label=input.closest('label')?.querySelector('span')?.textContent.replace(' *','')||'Campo';
    if(input.validity.customError)return input.validationMessage;
    if(input.validity.valueMissing)return 'Preencha '+label+' para continuar.';
    if(input===target)return 'Use até 63 letras, números e hífens, sem hífen no início ou no fim.';
    if(input.type==='number')return `${label}: informe um número inteiro de ${input.min} a ${input.max}.`;
    return label+': '+input.validationMessage;
  }
  function validate(index){
    const invalid=invalidField(index);
    if(invalid){show(index);invalid.setAttribute('aria-invalid','true');error.textContent=fieldMessage(invalid);invalid.focus();return false;}
    return true;
  }
  function validateThrough(index){for(let i=0;i<index;i++)if(!validate(i))return false;return true;}
  function updateValidity(){
    const invalid=invalidField(step);
    next.disabled=Boolean(invalid);submit.disabled=!canCreate()||Boolean(invalid)||!images.length;
    error.textContent=invalid?fieldMessage(invalid):'* Campos obrigatórios. Revise cada etapa antes de continuar.';
    for(const input of sections[step].querySelectorAll('input,select,textarea')){
      input.setAttribute('aria-describedby','wizard-error');
      if(input!==invalid)input.removeAttribute('aria-invalid');
    }
    if(invalid)reached=Math.min(reached,step);
    tabButtons.forEach((button,i)=>{button.disabled=i>reached;button.title=i>reached?'Conclua as etapas anteriores':titles[i];});
  }
  function advance(){if(validate(step)){reached=Math.max(reached,step+1);show(step+1);}}
  function show(index){
    step=Math.max(0,Math.min(7,index));error.textContent='';
    sections.forEach((section,i)=>section.hidden=i!==step);
    tabButtons.forEach((button,i)=>{button.classList.toggle('active',i===step);button.setAttribute('aria-selected',String(i===step));button.tabIndex=i===step?0:-1;});
    back.disabled=step===0;next.hidden=step===7;submit.hidden=step!==7;submit.disabled=session.read_only||session.role==='observador'||!images.length;
    if(step===7){
      const inherited=!session.manage_all_instances,config=profile?.config||{};
      review.replaceChildren(table(['PARÂMETRO','VALOR'],[['Nó',scope.host],['Projeto',scope.project],['Nome',target.value.trim()],['Template',images.find(i=>i.id===image.value)?.label||'—'],['Disco raiz',(pool.value||defaultRoot?.pool||'Automático')+(disk.value&&!disk.disabled?' · '+disk.value+' GiB':' · capacidade do pool')],['CPU',inherited?(config['limits.cpu']||'Herdado do perfil default'):cores.value+' núcleo(s) · '+allowance.value+'%'],['Memória',inherited?(config['limits.memory']||'Herdada do perfil default'):memory.value+' MiB'],['Rede',inherited?(defaultNic?.network||defaultNic?.parent||'Herdada do perfil default'):network.value+' · '+(ipv4Mode.value==='static'?ipv4.value:'DHCP')],['DNS',domain.value],['Inicializar no boot',inherited?(config['boot.autostart']||'Herdado do perfil default'):autostart.checked?'Sim':'Não'],['Descrição',inherited?'Não definida':description.value||'—']]));
    }
    updateValidity();
    if(index>0)tabButtons[step].focus({preventScroll:true});
  }
  tabs.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const index=Math.max(0,Math.min(reached,event.key==='Home'?0:event.key==='End'?reached:step+(event.key==='ArrowRight'?1:-1)));if(index<=step||validateThrough(index))show(index);}};
  form.addEventListener('input',updateValidity);form.addEventListener('change',updateValidity);
  function updatePool(){const supportsQuota=['btrfs','zfs','lvm','ceph'].includes(pools.find(p=>p.name===pool.value)?.driver);disk.disabled=!supportsQuota||!session.manage_all_instances;diskHelp.textContent=supportsQuota?'Cota opcional de disco raiz em GiB.':'Este driver utiliza a capacidade do pool. Cota de disco indisponível neste assistente.';}
  function updateNetwork(){
    const selected=networks.find(n=>n.name===network.value),config=selected?.config||{},external=selected?.managed===false;
    const reserve=Boolean(selected?.managed&&config['ipv4.address']?.includes('/')&&config['ipv4.dhcp']!=='false');
    ipv4Mode.querySelector('[value=static]').disabled=!reserve;
    ipv4Mode.querySelector('[value=dhcp]').textContent=external?'DHCP da LAN / configuração no container':'Automático / configuração no container';
    if(!reserve){ipv4Mode.value='dhcp';ipv4.value='';}
    subnet.value=external?'Definida pela rede externa':config['ipv4.address']||'Não informado';
    domain.value=external?'DHCP da LAN / configuração no container':config['dns.domain']||'Padrão do Incus';
    dnsMode.value=external?'Rede externa':config['dns.mode']||'Padrão do Incus';
    ipv4.disabled=!reserve||ipv4Mode.value!=='static';ipv4.required=!ipv4.disabled;
  }
  pool.onchange=updatePool;network.onchange=updateNetwork;ipv4Mode.onchange=updateNetwork;updatePool();updateNetwork();
  if(!session.manage_all_instances){start.checked=false;for(const input of [description,pool,disk,cores,allowance,memory,network,ipv4Mode,ipv4,autostart,start])input.disabled=true;sections[0].append(notice('Neste escopo, a criação usa a configuração do perfil default e exige um nome autorizado. Ajustes de recursos ficam disponíveis após criar.'));}
  form.onsubmit=async event=>{
    event.preventDefault();if(session!==owner||host!==scope.host||project!==scope.project||!canCreate())return;if(step!==7){advance();return;}if(!validateThrough(7)||submit.disabled)return;
    const selected=images.find(i=>i.id===image.value),requestedName=target.value.trim();if(!selected)return;
    const options={memory_mib:Number(memory.value),cpu_cores:Number(cores.value),cpu_allowance:Number(allowance.value),autostart:autostart.checked,start:start.checked,pool:pool.value,network:network.value,description:description.value};
    if(disk.value&&!disk.disabled)options.disk_gib=Number(disk.value);if(ipv4Mode.value==='static'&&ipv4.value)options.ipv4=ipv4.value.trim();
    const body={...scope,...(requestedName?{target:requestedName}:{}),...(selected.remote_image?{remote_image:selected.remote_image}:{image:selected.image})};
    if(!session.manage_all_instances){closeCreateWizard();openAction('create',requestedName,{...body,profiles:profile?['default']:[]});return;}
    const run={key,scope,owner:session,target:requestedName||'Novo container',phase:'prepare',status_code:100,metadata:{},start_after_create:start.checked,started_at:Date.now(),updated_at:Date.now(),output:[]};
    appendCreationLog(run,'Iniciando a criação do container '+run.target+'.');appendCreationLog(run,'Enviando a configuração ao Incus.');
    creationRuns.set(key,run);closeCreateWizard();openCreationTaskViewer(run);
    try{
      const created=await api('/api/create',{...body,options});
      if(session!==run.owner)return;
      Object.assign(run,created,{phase:'create',updated_at:Date.now()});appendCreationLog(run,'Tarefa aceita pelo Incus. Aguardando a criação da instância.');
      trackTask(`${scope.host}/${scope.project}/${run.operation}`,{...scope,...run,id:run.operation,action:'create',description:`CT ${run.target} - Criar`});
      updateCreationTaskViewer(run);pollCreation(run);
    }catch(error){if(session!==run.owner)return;Object.assign(run,{status_code:400,err:error.message,uncertain:!error.status||error.status>=500,updated_at:Date.now()});appendCreationLog(run,error.message,true);updateCreationTaskViewer(run);}
  };
  show(0);$('#create-dialog-content').replaceChildren(form);$('#create-dialog').showModal();target.focus();
  if(!images.length)sections[1].append(notice('Nenhum template compatível disponível. Consulte Templates antes de criar.',true));
  return form;
}
function updateCreationTaskViewer(run){
  if($('#task-detail').open&&$('#task-detail').dataset.taskRun===run.key)openCreationTaskViewer(run,false);
}
function watchingCreation(run){return session===run.owner&&host===run.scope.host&&project===run.scope.project&&!document.hidden&&$('#task-detail').open&&$('#task-detail').dataset.taskRun===run.key;}
async function pollCreation(run){
  if(!watchingCreation(run)||!run.operation||run.status_code>=200||run.polling)return;
  clearTimeout(run.timer);run.polling=true;
  try{
    const state=(await read('operation',run.operation,run.scope)).data;
    if(session!==run.owner)return;
    Object.assign(run,state,{connectionError:null,updated_at:Date.now()});
    const progress=Object.entries(state.metadata||{}).find(([key,value])=>/progress/i.test(key)&&typeof value==='string')?.[1];
    if(progress)appendCreationLog(run,progress);
    if(state.status_code>=200)appendCreationLog(run,state.status_code<400&&!state.err?'Container criado e confirmado pelo Incus.':state.err||'A operação terminou com erro.',Boolean(state.err)||state.status_code>=400);
    trackTask(`${run.scope.host}/${run.scope.project}/${run.operation}`,{...run.scope,...state,action:'create',target:run.target,description:`CT ${run.target} - Criar`});
    updateCreationTaskViewer(run);
    if(state.status_code<200){if(watchingCreation(run))run.timer=setTimeout(()=>pollCreation(run),1000);}
    else{
      invalidateMutation('/api/create',{...run.scope,target:run.target});
      const renderId=generation;
      const latest=await read('instance-list',undefined,run.scope).catch(()=>null);
      if(latest&&session===run.owner&&host===run.scope.host&&project===run.scope.project){
        inventory=latest.data;renderResourceTree();
        // Refresh the workspace behind the task as well as the resource tree.
        // Keep a newer route, console or unfinished editor intact.
        if(renderId===generation&&!consoleId&&!$('#content form')&&!$('#editor-dialog').open&&!$('#create-dialog').open)await render();
      }
    }
  }catch(error){run.connectionError=error.message;run.updated_at=Date.now();appendCreationLog(run,'Conexão temporariamente interrompida: '+error.message,true);updateCreationTaskViewer(run);}
  finally{run.polling=false;}
}
function appendCreationLog(run,message,isError=false){
  run.output??=[];
  const last=run.output.at(-1);
  if(last?.text===message)return;
  run.output.push({at:Date.now(),text:String(message),error:isError});
}
function creationTaskStatus(run){
  if(run.status_code>=400||run.err)return 'Falhou';
  if(run.status_code===200)return 'Concluída';
  if(run.connectionError)return 'Conexão interrompida';
  return 'Em andamento';
}
function creationTaskViewer(run){
  const active=run.viewerTab||'output',body=el('div',{class:'task-view-body'});
  const lines=(run.output||[]).map(entry=>entry.text);
  if(run.uncertain)lines.push('Resultado ainda não confirmado. Consulte Containers ou Tarefas antes de repetir a criação.');
  if(run.status_code===200&&!run.err)lines.push('TASK OK');
  else if(run.status_code>=400||run.err)lines.push('TASK ERROR: '+(run.err||'O Incus não concluiu a operação.'));
  const outputText=lines.join('\n')||'Aguardando a saída da operação do Incus…';
  const tabs=el('div',{class:'task-view-tabs',role:'tablist','aria-label':'Detalhes da tarefa'});
  for(const [key,label]of [['output','Saída'],['status','Status']])tabs.append(el('button',{id:'task-view-tab-'+key,type:'button',role:'tab',class:active===key?'active':'','data-task-control':key,'aria-controls':'task-view-page','aria-selected':String(active===key),tabindex:active===key?'0':'-1',onclick:()=>{run.viewerTab=key;openCreationTaskViewer(run,false);}},label));
  tabs.onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();run.viewerTab=event.key==='Home'?'output':event.key==='End'?'status':active==='output'?'status':'output';openCreationTaskViewer(run,false);$('#task-view-tab-'+run.viewerTab).focus();}};
  body.id='task-view-page';body.setAttribute('role','tabpanel');body.setAttribute('aria-labelledby','task-view-tab-'+active);
  const toolbar=el('div',{class:'task-view-toolbar'});
  const download=el('button',{type:'button','data-task-control':'download',disabled:run.status_code<200?'':null,onclick:()=>{
    const url=URL.createObjectURL(new Blob([outputText+'\n'],{type:'text/plain;charset=utf-8'})),link=el('a',{href:url,download:`ct-${run.target}-create.log`});
    link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }},...iconLabel('download','Download'));
  if(active==='output')toolbar.append(download);
  if(run.connectionError)toolbar.prepend(el('button',{type:'button','data-task-control':'retry',onclick:()=>{run.connectionError=null;appendCreationLog(run,'Consultando novamente o Incus.');pollCreation(run);}},'Consultar novamente'));
  if(active==='output')body.append(el('pre',{class:'task-view-output',tabindex:'0','aria-label':'Saída da tarefa de criação','data-task-control':'log','aria-live':'polite'},outputText));
  else{
    const progress=Object.entries(run.metadata||{}).find(([key,value])=>/progress/i.test(key)&&typeof value==='string')?.[1];
    const phases={prepare:'Preparar configuração',create:'Baixar imagem e criar container',start:'Iniciar container',verify:'Confirmar funcionamento',done:'Concluído'};
    body.append(el('div',{class:'task-view-status'},kv([['Tarefa',`CT ${run.target} - Criar`],['Estado',creationTaskStatus(run)],['Servidor',run.scope.host],['Projeto',run.scope.project],['Etapa',phases[run.phase]||'Solicitação ao Incus'],['Progresso',progress||'Não informado pelo Incus'],['Início',localDate(run.started_at)],['Última atualização',localDate(run.updated_at)],['Resultado',run.err|| (run.status_code===200?'TASK OK':'Aguardando a confirmação do Incus.')]]),run.err?notice(run.err,true):null));
  }
  const content=el('div',{class:'task-viewer'},tabs,toolbar,body);
  content.dataset.createRun=run.key;
  return content;
}
function openCreationTaskViewer(run,show=true){
  const dialog=$('#task-detail');
  delete dialog.dataset.snapshotRun;$('#close-task-detail').textContent='×';
  const previous=$('#task-detail .task-view-output'),scrollTop=previous?.scrollTop||0,follow=!previous||previous.scrollHeight-previous.clientHeight-scrollTop<24;
  const focused=$('#task-detail-content').contains(document.activeElement)?document.activeElement.dataset.taskControl:null;
  if(show)run.viewerTab='output';
  $('#task-detail-title').textContent=`Tarefa: CT ${run.target} · Criar · ${creationTaskStatus(run)}`;
  dialog.dataset.taskRun=run.key;
  $('#task-detail-content').replaceChildren(creationTaskViewer(run));
  if(show&&!dialog.open)dialog.showModal();
  const output=$('#task-detail .task-view-output');
  if(output)output.scrollTop=follow?output.scrollHeight:scrollTop;
  if(!show&&focused)$('#task-detail [data-task-control="'+focused+'"]')?.focus({preventScroll:true});
}
const treeExpanded={datacenter:true,node:true,containers:true};
let selectedTreeRoute;
try{Object.assign(treeExpanded,JSON.parse(localStorage.getItem('incus-tree-expanded')||'{}'));}catch{}
function renderResourceTree(){
  if(!session)return;
  const r=route(),term=$('#global-search').value.trim().toLowerCase();
  if(selectedTreeRoute!==location.hash){
    if(['instance','server','network'].includes(r.page)||r.page==='storage'&&r.target){treeExpanded.datacenter=true;treeExpanded.node=true;if(r.page==='instance')treeExpanded.containers=true;}
    selectedTreeRoute=location.hash;
  }
  const items=inventory.filter(i=>!term||[i.name,i.status,i.status==='Running'?'Em execução':i.status==='Stopped'?'Parado':'',i.architecture].join(' ').toLowerCase().includes(term)).sort((a,b)=>a.name.localeCompare(b.name));
  const leaves=items.slice(0,100).map(item=>{
    const link=el('a',{href:instanceLink(item.name),role:'treeitem','aria-level':'4','aria-selected':String(r.page==='instance'&&r.target===item.name),class:'leaf '+item.status.toLowerCase()+(r.page==='instance'&&r.target===item.name?' active':''),title:item.name+' · '+item.status},icon('box'),el('span',{class:'tree-label'},item.name),el('span',{class:'tree-state','aria-hidden':'true'},item.status==='Running'?'▶':'■'));
    link.ondblclick=event=>{event.preventDefault();if(session.enable_console&&canMutate(item.name)&&item.status==='Running')openConsoleWindow(item.name);};
    return el('div',{class:'tree-row','data-depth':'3'},el('span',{class:'tree-spacer','aria-hidden':'true'}),link);
  });
  const link=(href,label,active,cls='',iconName='box',depth=2)=>el('div',{class:'tree-row','data-depth':String(depth)},el('span',{class:'tree-spacer','aria-hidden':'true'}),el('a',{href,role:'treeitem','aria-level':String(depth+1),'aria-selected':String(Boolean(active)),class:(cls+' '+(active?'active':'')).trim()},icon(iconName),el('span',{class:'tree-label'},label)));
  const branch=(key,label,href,active,depth,iconName,children)=>{
    const expanded=Boolean(term||treeExpanded[key]),group=el('div',{class:'tree-group',role:'group',id:'tree-group-'+key,hidden:expanded?null:''},children);
    const toggle=el('button',{type:'button',class:'tree-expander','aria-label':(expanded?'Recolher ':'Expandir ')+label,'aria-controls':group.id,'aria-expanded':String(expanded),onclick:()=>{treeExpanded[key]=!expanded;try{localStorage.setItem('incus-tree-expanded',JSON.stringify(treeExpanded));}catch{}renderResourceTree();}},expanded?'⌄':'›');
    return el('div',{},el('div',{class:'tree-row','data-depth':String(depth)},toggle,el('a',{href,role:'treeitem','aria-level':String(depth+1),'aria-selected':String(Boolean(active)),class:active?'active':''},icon(iconName),el('span',{class:'tree-label'},label))),group);
  };
  const selectedProject=$('#tree-view').value==='project';
  const nodeName=serverInfo.environment?.server_name||host;
  const containers=[...leaves,...(inventory.length>100?[link('#instances','Ver todos os '+inventory.length+' containers…',false,'','box',3)]:[]),...(term&&!items.length?[el('div',{class:'empty'},'Nenhum container corresponde à busca.')]:[])];
  const children=[
    ...(selectedProject?[link('#projects',project,r.page==='projects','tree-project','file')]:[]),
    branch('containers',`Containers (${inventory.length})`,'#instances',r.page==='instances',2,'box',containers),
    ...storageInventory.map(pool=>link('#storage/'+encodeURIComponent(pool.name)+'/summary',pool.name+' ('+nodeName+')',r.page==='storage'&&r.target===pool.name,'tree-storage','storage')),
    ...networkInventory.map(network=>link('#network/'+encodeURIComponent(network.name)+'/summary',network.name+' ('+nodeName+')',r.page==='network'&&r.target===network.name,'tree-network','network'))
  ];
  const datacenterActive=!['server','instance'].includes(r.page)&&!(r.page==='storage'&&r.target)&&r.page!=='network';
  $('#tree').replaceChildren(branch('datacenter','Datacenter','#search',datacenterActive,0,'datacenter',[branch('node',nodeName,'#server/summary',r.page==='server',1,'node',children)]));
}
let resourceMenu;
function closeResourceMenu(restoreFocus=false){
  const trigger=resourceMenu?.trigger;resourceMenu?.remove();resourceMenu=null;
  if(restoreFocus&&trigger?.isConnected)trigger.focus({preventScroll:true});
}
function freshResource(resource,target,scope,current){return queuedRead('/api/read?'+new URLSearchParams({...scope,resource,...(target?{target}:{})}),current);}
function showResourceMenu(event,item,kind='instance',trigger=event.target?.closest('a,tr')){
  closeResourceMenu();
  const owner=session,scope={host,project},current=()=>session===owner&&host===scope.host&&project===scope.project;
  const title=kind==='instance'?'CT '+item.name:kind==='node'?`Nó '${item.name}'`:kind==='datacenter'?'Datacenter':kind==='containers'?'Containers':kind==='storage'?'Armazenamento '+item.name:kind==='network'?'Rede '+item.name:'Projeto '+item.name;
  const menu=el('div',{class:'context-menu',role:'menu','aria-labelledby':'resource-menu-title'},el('div',{id:'resource-menu-title',class:'context-menu-title'},title));
  menu.trigger=trigger;resourceMenu=menu;
  const add=(key,label,symbol,handler,disabled=false)=>{
    const button=el('button',{type:'button',role:'menuitem',tabindex:'-1','data-menu-action':key,disabled:disabled?'':null,onclick:()=>{
      closeResourceMenu();if(current())Promise.resolve().then(handler).catch(error=>{if(current())notify(error.message);});
    }},...iconLabel(symbol,label));menu.append(button);return button;
  };
  const separator=()=>menu.append(el('div',{class:'context-menu-separator',role:'separator'}));
  const go=hash=>()=>{location.hash=hash;};
  if(kind==='instance'){
    const buttons={};
    buttons.start=add('start',item.status==='Frozen'?'Retomar':'Iniciar','play',()=>openAction(item.status==='Frozen'?'unfreeze':'start',item.name));
    buttons.stop=add('stop','Desligar','power',()=>openAction('stop',item.name));
    buttons['force-stop']=add('force-stop','Parar','square',()=>openAction('force-stop',item.name));
    buttons.restart=add('restart','Reiniciar','refresh',()=>openAction('restart',item.name));
    separator();
    buttons.clone=add('clone','Clonar','clone',()=>openAction('clone',item.name));
    buttons.template=add('template','Converter em modelo','template',()=>openAction('template',item.name));
    separator();
    buttons.snapshot=add('snapshot','Tirar um Snapshot','history',async()=>{
      const result=await freshResource('snapshots',item.name,scope);
      if(current())openAction('snapshot',item.name,{snapshotNames:result.data.map(value=>typeof value==='string'?value:value.name)});
    });
    buttons.backup=add('backup','Backup Agora','save',()=>openAction('backup',item.name));
    separator();
    buttons.console=add('console','Console','terminal',()=>openConsoleWindow(item.name));
    const update=()=>{
      const write=current()&&canMutate(item.name),running=item.status==='Running',stopped=item.status==='Stopped',frozen=item.status==='Frozen';
      buttons.start.querySelector('span').textContent=frozen?'Retomar':'Iniciar';
      const enabled={start:write&&(stopped||frozen),stop:write&&running,'force-stop':write&&(running||frozen),restart:write&&running,
        clone:write&&session.role==='administrador',template:write&&session.role==='administrador'&&stopped,
        snapshot:write&&(running||stopped),backup:write&&(running||stopped),console:write&&session.enable_console&&running};
      for(const [action,button]of Object.entries(buttons))button.disabled=!enabled[action];
      buttons['force-stop'].title='Interromper imediatamente o container';
      buttons.template.title=stopped?'Criar uma imagem privada reutilizável':'Desligue o container para criar o modelo';
    };
    update();
    freshResource('instance',item.name,scope).then(result=>{if(resourceMenu===menu&&current()){Object.assign(item,result.data);update();}}).catch(error=>{
      if(resourceMenu!==menu)return;for(const button of Object.values(buttons)){button.disabled=true;button.title=error.message;}
    });
  }else if(['node','datacenter','containers','project'].includes(kind)){
    add('create','Criar CT','cube',()=>openCreateWizard(),!canCreate());
    separator();
    const bulkButtons={};
    for(const [action,label,symbol,state]of [['start','Iniciar em massa','play','Stopped'],['stop','Desligar em massa','power','Running'],['freeze','Suspender em massa','pause','Running']]){
      bulkButtons[action]=add('bulk-'+action,label,symbol,()=>openBulkAction(action),!inventory.some(value=>canMutate(value.name)&&value.status===state));
    }
    bulkButtons.unfreeze=add('bulk-unfreeze','Retomar em massa','play',()=>openBulkAction('unfreeze'),!inventory.some(value=>canMutate(value.name)&&value.status==='Frozen'));
    bulkButtons.unfreeze.hidden=!inventory.some(value=>value.status==='Frozen');
    freshResource('instance-list',undefined,scope).then(result=>{
      if(resourceMenu!==menu||!current())return;
      for(const [action,state]of Object.entries({start:'Stopped',stop:'Running',freeze:'Running',unfreeze:'Frozen'}))bulkButtons[action].disabled=!result.data.some(value=>canMutate(value.name)&&value.status===state);
      bulkButtons.unfreeze.hidden=!result.data.some(value=>value.status==='Frozen');
      menu.style.top=Math.max(4,Math.min(parseFloat(menu.style.top),innerHeight-menu.offsetHeight-4))+'px';
    }).catch(error=>{if(resourceMenu===menu)for(const button of Object.values(bulkButtons)){button.disabled=true;button.title=error.message;}});
    separator();
    add('summary','Sumário','summary',go(kind==='node'?'#server/summary':'#overview'));
    add('search','Procurar','search',go(kind==='node'?'#server/search':'#search'));
    add('notes','Notas','edit',go(kind==='node'?'#server/notes':'#datacenter-notes'));
  }else if(kind==='storage'){
    add('summary','Sumário','summary',go('#storage/'+encodeURIComponent(item.name)+'/summary'));
    add('content','Conteúdo','storage',go('#storage/'+encodeURIComponent(item.name)+'/content'));
    separator();add('permissions','Permissões','shield',go('#storage/'+encodeURIComponent(item.name)+'/permissions'));
  }else if(kind==='network'){
    add('summary','Sumário','summary',go('#network/'+encodeURIComponent(item.name)+'/summary'));
    separator();
    const editable=canManageNetworks()&&item.managed&&item.type==='bridge'&&!item.config?.['bridge.external_interfaces'];
    const operate=async action=>{
      readCache.delete('/api/read?'+new URLSearchParams({...scope,resource:'network',target:item.name}));
      const view=await networkDetailView(scope,item.name);if(!current())return;
      const button=view.querySelector('[data-action="'+action+'"]');
      if(!button||button.disabled)throw new Error(button?.title||'A operação não está disponível para esta rede.');
      button.click();
    };
    const edit=add('edit','Editar','edit',()=>operate('network-edit'),!editable);
    const remove=add('delete','Excluir bridge','delete',()=>operate('network-delete'),true);
    if(canManageNetworks())Promise.allSettled([freshResource('network',item.name,scope),freshResource('instances',undefined,scope),freshResource('profiles',undefined,scope)]).then(results=>{
      if(resourceMenu!==menu||!current())return;
      const [network,instances,profiles]=results;
      const managed=network.status==='fulfilled'&&network.value.data.managed&&network.value.data.type==='bridge'&&!network.value.data.config?.['bridge.external_interfaces'];
      edit.disabled=!managed;
      const attached=values=>values.some(value=>Object.values(value.expanded_devices||value.devices||{}).some(device=>device.type==='nic'&&(device.network===item.name||device.parent===item.name)));
      remove.disabled=!managed||Boolean(network.value.data.used_by?.length)||instances.status!=='fulfilled'||profiles.status!=='fulfilled'||attached(instances.value.data)||attached(profiles.value.data);
      if(remove.disabled)remove.title='A exclusão exige uma bridge sem dependências de containers ou perfis.';
    });
    separator();add('permissions','Permissões','shield',go('#network/'+encodeURIComponent(item.name)+'/permissions'));
  }
  menu.addEventListener('keydown',key=>{
    const buttons=[...menu.querySelectorAll('button:not(:disabled):not([hidden])')],index=buttons.indexOf(document.activeElement);
    if(['ArrowDown','ArrowUp','Home','End'].includes(key.key)){
      key.preventDefault();const next=key.key==='Home'?0:key.key==='End'?buttons.length-1:(index+(key.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next]?.focus();
    }else if(key.key==='Tab')closeResourceMenu(true);
    else if(key.key.length===1&&!key.ctrlKey&&!key.altKey){const next=buttons.slice(index+1).concat(buttons.slice(0,index+1)).find(button=>button.textContent.toLocaleLowerCase('pt-BR').startsWith(key.key.toLocaleLowerCase('pt-BR')));if(next){key.preventDefault();next.focus();}}
  });
  document.body.append(menu);
  menu.style.left=Math.max(4,Math.min(event.clientX,innerWidth-menu.offsetWidth-4))+'px';
  menu.style.top=Math.max(4,Math.min(event.clientY,innerHeight-menu.offsetHeight-4))+'px';
  menu.querySelector('button:not(:disabled):not([hidden])')?.focus({preventScroll:true});
}
function resourceMenuTarget(event){
  const row=event.target.closest('#content tr');
  const link=event.target.closest('#tree a[href],#content a[href]')||row?.querySelector('a[href^="#instance/"],a[href^="#server/"],a[href^="#network/"],a[href^="#storage/"]');
  if(!link)return null;
  const [page,target]=link.getAttribute('href').slice(1).split('/').map(decodeURIComponent);
  if(page==='instance'&&target)return {kind:'instance',item:{...inventory.find(value=>value.name===target),name:target},trigger:row||link};
  if(page==='server')return {kind:'node',item:{name:serverInfo.environment?.server_name||host},trigger:row||link};
  if(page==='storage'&&target)return {kind:'storage',item:{name:target},trigger:row||link};
  if(page==='network'&&target)return {kind:'network',item:{...networkInventory.find(value=>value.name===target),name:target},trigger:row||link};
  if(link.closest('#tree')&&['search','instances','projects'].includes(page))return {kind:page==='search'?'datacenter':page==='instances'?'containers':'project',item:{name:project},trigger:link};
  return null;
}
for(const type of ['contextmenu','keydown'])document.addEventListener(type,event=>{
  if(!session||type==='keydown'&&event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return;
  const target=resourceMenuTarget(event);if(!target)return;event.preventDefault();
  const rect=target.trigger.getBoundingClientRect();
  showResourceMenu(type==='keydown'?{clientX:rect.left+20,clientY:rect.bottom}:event,target.item,target.kind,target.trigger);
});
document.addEventListener('pointerdown',event=>{if(resourceMenu&&!resourceMenu.contains(event.target))closeResourceMenu();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&resourceMenu){event.preventDefault();closeResourceMenu(true);}});
document.addEventListener('scroll',event=>{if(resourceMenu&&!resourceMenu.contains(event.target))closeResourceMenu();},true);
window.addEventListener('resize',()=>closeResourceMenu());
window.addEventListener('hashchange',()=>closeResourceMenu());
for(const selector of ['#host','#project'])$(selector).addEventListener('change',()=>closeResourceMenu());
async function openBulkAction(action){
  const owner=session,scope={host,project},states={start:'Stopped',stop:'Running',freeze:'Running',unfreeze:'Frozen'};
  const labels={start:'Iniciar em massa',stop:'Desligar em massa',freeze:'Suspender em massa',unfreeze:'Retomar em massa'};
  const body=el('div',{class:'panel-body'},'Consultando os containers…');openEditor(labels[action],body);
  const current=()=>session===owner&&host===scope.host&&project===scope.project;
  try{
    const result=await freshResource('instance-list',undefined,scope);
    if(!current()||!body.isConnected)return;
    const items=result.data.filter(item=>canMutate(item.name)&&item.status===states[action]);
    if(!items.length){body.replaceChildren(notice('Nenhum container autorizado está no estado necessário para esta ação.'));return;}
    const choices=items.map(item=>el('input',{type:'checkbox',name:'target',value:item.name,checked:''}));
    const list=el('div',{class:'bulk-instance-list'},items.map((item,index)=>el('label',{},choices[index],el('span',{},item.name),el('span',{},item.status))));
    const output=el('pre',{class:'bulk-results',role:'status','aria-live':'polite'}),submit=el('button',{type:'submit',class:'primary'},labels[action]);
    const cancel=el('button',{type:'button',onclick:closeEditor},'Fechar');
    const form=el('form',{class:'bulk-action-form'},el('p',{},'Selecione os containers deste projeto. Cada operação será executada e registrada separadamente em Tarefas.'),list,output,el('div',{class:'dialog-actions'},cancel,submit));
    form.onsubmit=async event=>{
      event.preventDefault();if(submit.disabled)return;
      const selected=choices.filter(input=>input.checked).map(input=>input.value);
      if(!selected.length){output.textContent='Selecione pelo menos um container.';return;}
      submit.disabled=true;for(const input of choices)input.disabled=true;
      const lines=[];let failed=0;
      for(const target of selected){
        if(!current()){lines.push('A sessão ou o projeto mudou; as próximas operações foram canceladas.');break;}
        try{
          const result=await api('/api/action',{...scope,action,target,confirmation:`${scope.host}/${scope.project}/${target}`});
          trackTask(`${scope.host}/${scope.project}/${result.operation}`,{...scope,id:result.operation,target,action,status:'Em andamento',status_code:100});
          const state=await waitOperation(result.operation,scope,owner);
          lines.push(target+': '+(state.status_code<200?'Em andamento; consulte Tarefas.':'Concluído.'));
        }catch(error){failed++;lines.push(target+': '+error.message);}
        output.textContent=lines.join('\n');
      }
      output.textContent=lines.join('\n');submit.textContent=failed?'Concluído com erros':'Concluído';
      if(current()){readCache.clear();await render();}
    };
    body.replaceWith(form);
  }catch(error){if(body.isConnected)body.replaceChildren(errorNode(error));}
}
$('#global-search').oninput=()=>renderResourceTree();
$('#global-search').onkeydown=event=>{if(event.key==='Enter'){event.preventDefault();const input=$('#resource-search'),current=route();if((current.page==='search'||(current.page==='server'&&current.target==='search'))&&input){input.value=event.currentTarget.value;input.form.requestSubmit();}else location.hash='#search';}};
$('#tree-view').onchange=()=>renderResourceTree();
function mergedTaskLog(){
  const merged=new Map(taskLogItems.filter(i=>i&&typeof i==='object').map(i=>[i.id,i]));
  for(const task of tasks.values())if(task.host===host&&task.project===project)merged.set(task.id,{...merged.get(task.id),...task});
  return [...merged.values()].reverse();
}
function taskDescription(task){
  if(snapshotOperations.includes(task.action))return snapshotTaskTitle(task);
  if(task.action==='snapshot-edit')return 'Editar snapshot'+(task.target?' · '+task.target:'');
  const labels={start:'Iniciar CT',stop:'Desligar CT','force-stop':'Parar CT',restart:'Reiniciar CT',freeze:'Suspender CT',unfreeze:'Retomar CT',clone:'Clonar CT',template:'Criar modelo',delete:'Remover CT',update:'Editar CT',create:'Criar CT',snapshot:'Criar snapshot',backup:'Criar backup','snapshot-restore':'Restaurar snapshot','snapshot-delete':'Remover snapshot','backup-delete':'Remover backup','network-create':'Criar bridge','network-update':'Editar bridge','network-delete':'Remover bridge','nic-add':'Adicionar interface','nic-update':'Editar interface','nic-delete':'Remover interface','nic-reset':'Restaurar interface do perfil','download-image':'Baixar imagem'};
  if(labels[task.action])return labels[task.action]+(task.target?' · '+task.target:'')+(task.destination?' → '+task.destination:'');
  const match=String(task.description||'').match(/^(POST|PUT|PATCH|DELETE) \/1\.0\/(instances|networks)(?:\/([^/]+))?(?:\/(snapshots|backups))?/);
  if(match){const [,method,resource,target,artifact]=match;return (artifact?(method==='DELETE'?'Remover ':'Criar ')+(artifact==='snapshots'?'snapshot':'backup'):resource==='networks'?(method==='POST'?'Criar':method==='DELETE'?'Remover':'Editar')+' bridge':method==='POST'&&!target?'Criar CT':method==='DELETE'?'Remover CT':'Atualizar CT')+(target?' · '+target:'');}
  return task.description||task.action||'Operação Incus';
}
function renderTaskLog(){
  if(!session||taskLogMode!=='tasks')return;
  const items=mergedTaskLog();
  const running=()=>el('span',{class:'snapshot-task-spinner',role:'status','aria-label':'Em execução'});
  const rows=items.map(task=>()=>[localDate(task.created_at||task.timestamp||task.started_at||task.requested_at),task.status_code>=200?localDate(task.updated_at||task.ended_at||task.finished_at):snapshotOperations.includes(task.action)?running():'—',host,task.identity||session.username,taskDescription(task),snapshotOperations.includes(task.action)?task.status_code<200?running():snapshotTaskSuccess(task)?'OK':status('Erro'):status(task.status||String(task.status_code)),el('button',{type:'button',class:'task-details-link',onclick:()=>openTaskDetail(task)},'Detalhes')]);
  const content=table(['TEMPO DE INÍCIO','TÉRMINO','Nó','NOME DE USUÁRIO','DESCRIÇÃO','STATUS',''],rows);
  content.ondblclick=event=>{if(!event.target.closest('button'))event.target.closest('tbody tr')?.querySelector('.task-details-link')?.click();};
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
function taskDetailView(task){
  if(task.action==='create'||/^CT .+ - Criar$/.test(task.description||'')){
    const run=[...creationRuns.values()].find(item=>item.operation===task.id);
    if(run)return creationTaskViewer(run);
    const fallback={key:'task-'+task.id,scope:{host:task.host||host,project:task.project||project},target:task.target||'container',status_code:task.status_code??100,status:task.status,phase:task.phase,metadata:task.metadata||{},err:task.err||'',started_at:task.created_at||task.timestamp||Date.now(),updated_at:Date.now(),output:[]};
    appendCreationLog(fallback,fallback.err|| (fallback.status_code>=200?'Tarefa '+creationTaskStatus(fallback)+'.':'Tarefa enviada ao Incus.'));
    return creationTaskViewer(fallback);
  }
  const content=el('div',{class:'task-detail-view'},kv([['Operação',task.id],['Estado',task.status||'Em andamento'],['Alvo',task.target||'—'],['Etapa',task.phase||'—'],['Código do estado',task.status_code??'—']]));
  if(task.err)content.append(notice(task.err,true));
  const metadata=task.metadata&&typeof task.metadata==='object'?task.metadata:{};
  if(Object.keys(metadata).length)content.append(el('h3',{},'Detalhes informados pelo Incus'),propertyTable(metadata));
  else if(!task.err)content.append(notice('O Incus ainda não informou detalhes adicionais para esta operação.'));
  return content;
}
async function openTaskDetail(task){
  const dialog=$('#task-detail');
  if(snapshotOperations.includes(task.action)){
    const scope={host:task.host||host,project:task.project||project},key=`${scope.host}/${scope.project}/${task.id}`;
    let run=snapshotRuns.get(key);
    if(!run){run={...task,key,scope,owner:session,operation:task.id,requested_at:task.requested_at||Date.now()/1000,ended_at:task.ended_at||(task.status_code>=200?task.updated_at:undefined),status_code:task.status_code??100,metadata:task.metadata||{},output:task.output||[]};snapshotRuns.set(key,run);}
    openSnapshotTaskViewer(run);return;
  }
  delete dialog.dataset.snapshotRun;$('#close-task-detail').textContent='×';
  if(task.action==='create'||/^CT .+ - Criar$/.test(task.description||'')){
    const run=[...creationRuns.values()].find(item=>item.operation===task.id)||{key:'task-'+task.id,owner:session,operation:task.id,scope:{host:task.host||host,project:task.project||project},target:task.target||'container',status_code:task.status_code??100,start_after_create:task.start_after_create,metadata:task.metadata||{},phase:task.phase,err:task.err||'',started_at:task.created_at||task.timestamp||Date.now(),updated_at:Date.now(),output:[]};
    appendCreationLog(run,run.err|| (run.status_code>=200?'Tarefa '+creationTaskStatus(run)+'.':'Tarefa enviada ao Incus.'));
    openCreationTaskViewer(run);
    if(run.status_code<200&&run.operation)resumeRun(run,pollCreation);
    return;
  }
  delete dialog.dataset.taskRun;
  $('#task-detail-title').textContent='Tarefa: '+taskDescription(task);
  $('#task-detail-content').replaceChildren(taskDetailView(task));
  if(!dialog.open)dialog.showModal();
  if(task.status_code<200&&task.id){const scope={host,project},owner=session;try{const result=(await read('operation',task.id,scope)).data;if(session!==owner||!dialog.open)return;$('#task-detail-content').replaceChildren(taskDetailView({...task,...result}));}catch(error){if(dialog.open)$('#task-detail-content').append(errorNode(error));}}
}
$('#close-task-detail').onclick=()=>$('#task-detail').close();
$('#task-log-refresh').onclick=refreshTaskLog;
for(const [id,mode] of [['task-tab','tasks'],['audit-tab','audit']])$('#'+id).onclick=()=>{taskLogMode=mode;$('#task-tab').classList.toggle('active',mode==='tasks');$('#audit-tab').classList.toggle('active',mode==='audit');refreshTaskLog();};
$('#task-log-toggle').onclick=()=>{const collapsed=document.body.classList.toggle('tasks-collapsed');$('#task-log-toggle').textContent=collapsed?'⌃':'⌄';$('#task-log-toggle').setAttribute('aria-expanded',String(!collapsed));$('#task-log-toggle').setAttribute('aria-label',collapsed?'Expandir painel de tarefas':'Recolher painel de tarefas');};
const taskSplitter=el('div',{class:'task-splitter',role:'separator',tabindex:'0','aria-label':'Altura do painel de tarefas','aria-orientation':'horizontal','aria-valuemin':'70','aria-valuemax':'450','aria-valuenow':'178'});
$('#task-log').prepend(taskSplitter);
function setTaskHeight(height){const maximum=Math.min(450,innerHeight*(innerWidth<=650?.25:.35)),value=Math.round(Math.min(maximum,Math.max(70,height)));document.body.classList.remove('tasks-collapsed');document.documentElement.style.setProperty('--task-height',value+'px');taskSplitter.setAttribute('aria-valuemax',String(Math.round(maximum)));taskSplitter.setAttribute('aria-valuenow',String(value));$('#task-log-toggle').setAttribute('aria-expanded','true');$('#task-log-toggle').setAttribute('aria-label','Recolher painel de tarefas');$('#task-log-toggle').textContent='⌄';}
window.addEventListener('resize',()=>{if(document.documentElement.style.getPropertyValue('--task-height')){const collapsed=document.body.classList.contains('tasks-collapsed');setTaskHeight(parseFloat(document.documentElement.style.getPropertyValue('--task-height')));if(collapsed)$('#task-log-toggle').click();}});
taskSplitter.onkeydown=event=>{if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();setTaskHeight($('#task-log').offsetHeight+(event.key==='ArrowUp'?20:-20));}};
taskSplitter.onpointerdown=event=>{event.preventDefault();taskSplitter.setPointerCapture(event.pointerId);taskSplitter.onpointermove=move=>setTaskHeight(innerHeight-move.clientY-18);taskSplitter.onpointerup=()=>{taskSplitter.onpointermove=null;};};
const treeSplitter=el('div',{class:'tree-splitter',role:'separator',tabindex:'0','aria-label':'Largura da árvore de recursos','aria-orientation':'vertical','aria-valuemin':'200','aria-valuemax':'450','aria-valuenow':'306'});
$('#sidebar').append(treeSplitter);
function setTreeWidth(width){if(menuBreakpoint.matches)return;const maximum=Math.min(450,innerWidth*.35),value=Math.round(Math.max(200,Math.min(maximum,width)));document.documentElement.style.setProperty('--tree-width',value+'px');treeSplitter.setAttribute('aria-valuenow',String(value));treeSplitter.setAttribute('aria-valuemax',String(Math.round(maximum)));try{localStorage.setItem('incus-tree-width',String(value));}catch{}}
try{const width=Number(localStorage.getItem('incus-tree-width'));if(width>=200)setTreeWidth(width);}catch{}
treeSplitter.onkeydown=event=>{if(['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();setTreeWidth($('#sidebar').offsetWidth+(event.key==='ArrowRight'?15:-15));}};
treeSplitter.onpointerdown=event=>{if(menuBreakpoint.matches)return;event.preventDefault();treeSplitter.setPointerCapture(event.pointerId);treeSplitter.onpointermove=move=>setTreeWidth(move.clientX);};
treeSplitter.onpointerup=treeSplitter.onpointercancel=()=>{treeSplitter.onpointermove=null;};
const restoredSessionAttempt=sessionAttempt;
api('/api/session').then(data=>{
  // A late bootstrap response must not replace a newer login and orphan its tasks.
  if(sessionAttempt!==restoredSessionAttempt||session)return;
  session=data;enter();
}).catch(()=>{});
