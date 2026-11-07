// Run against a fresh tests/create_fixture.py and an isolated Chrome CDP session.
// All mutations use the explicit in-memory fixture, never a real Incus host.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.PANEL_ORIGIN||'http://127.0.0.1:8082';
const tabs=await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT||9223}/json/list`)).json();
const socket=new WebSocket(tabs.find(tab=>tab.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let seq=0,operationReads=0;const pending=new Map(),errors=[];
socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const item=pending.get(data.id);pending.delete(data.id);data.error?item.reject(new Error(data.error.message)):item.resolve(data.result);}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);if(data.method==='Network.requestWillBeSent'&&data.params.request.url.includes('resource=operation&'))operationReads++;};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=async expression=>{for(let i=0;i<300;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Timeout: '+expression+' '+await evaluate("document.querySelector('#content').textContent+' '+document.querySelector('#create-dialog').textContent"));};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const fill=(name,value)=>evaluate(`{const input=document.querySelector('[name=${name}]');input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}`);
const navigate=async route=>{const before=await evaluate('generation');await evaluate(`location.hash===${JSON.stringify('#'+route)}?render():location.hash=${JSON.stringify(route)}`);await wait(`generation>${before}&&!document.querySelector('#content').hasAttribute('aria-busy')`);};
const screenshot=async name=>fs.writeFile(`artifacts/review/${name}.png`,Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const viewport=(width,height)=>call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<650});
const routes=['overview','search','datacenter-notes','cluster','settings','storage','backups','permissions','networks','instances','images','profiles','projects','volumes','tasks','alerts','users','server/summary','server/search','server/notes','server/system','server/network','server/storage','server/tasks','storage/lab/summary','storage/lab/content','storage/lab/permissions','network/labbr0/summary','network/labbr0/permissions',...['summary','resources','devices','network','dns','options','history','backups','snapshots','permissions','console'].map(tab=>'instance/lab-web/'+tab)];
async function openWizard(){await click('#create-ct');await wait("!!document.querySelector('#create-dialog .wizard-form')&&document.querySelector('#create-dialog').open");assert.equal(await evaluate("!!document.querySelector('#create-dialog .loading-state,#create-dialog .spinner')"),false);}
async function completeWizard(name){
  await fill('container-name',name);await click('#wizard-next');
  await evaluate("{const input=document.querySelector('[name=image]');input.selectedIndex=1;input.dispatchEvent(new Event('change',{bubbles:true}));}");
  for(let i=1;i<7;i++)await click('#wizard-next');
  assert.equal(await evaluate("document.querySelector('#wizard-tab-7').getAttribute('aria-selected')"),'true');
}
try{
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await viewport(1440,1000);
  await call('Page.navigate',{url:origin});await wait("typeof api==='function'");
  if(await evaluate("document.querySelector('#shell').hidden")){
    await fill('username','test');await fill('password','local-browser-fixture');await evaluate("document.querySelector('#login-form').requestSubmit()");
  }
  await wait("!document.querySelector('#shell').hidden&&!document.querySelector('#content').hasAttribute('aria-busy')");
  assert.equal(await evaluate('session.demo'),true,'Review requires the demo fixture');
  for(const route of routes){
    await navigate(route);
    assert.doesNotMatch(await evaluate("document.querySelector('#content').textContent"),/Falha interna|Página não encontrada|Não foi possível atualizar/,'Route '+route);
    await evaluate('window.reviewBackground=document.querySelector("#content").firstChild;window.reviewHash=location.hash;');
    await openWizard();await click('#close-create');
    assert.equal(await evaluate('location.hash===window.reviewHash&&document.querySelector("#content").firstChild===window.reviewBackground'),true,'Modal changed workspace on '+route);
  }
  await navigate('network/labbr0/summary');
  assert.match(await evaluate("document.querySelector('#content').textContent"),/lab-web/,'Attached containers must be populated');
  assert.match(await evaluate("document.querySelector('#content').textContent"),/10\.100\.0\.10/,'Incus DHCP address must be displayed');
  await navigate('instance/lab-web/options');await click('[data-action=instance-edit]');await fill('description','Rascunho preservado');await openWizard();await click('#close-create');
  assert.equal(await evaluate("document.querySelector('#edit-description').value"),'Rascunho preservado');
  await evaluate("document.querySelector('.edit-form').requestSubmit()");await wait("document.querySelector('#feedback').textContent.includes('Alterações salvas')&&!document.querySelector('#content').hasAttribute('aria-busy')");
  assert.equal((await evaluate("read('instance','lab-web').then(r=>r.data)")).description,'Rascunho preservado');
  // Lifecycle and recovery actions are exercised through the actual forms.
  async function action(label,{name,confirmation}={}){
    await evaluate(`{const button=[...document.querySelectorAll('#object-actions button,#content button')].find(node=>node.textContent.trim()===${JSON.stringify(label)});if(!button||button.disabled)throw new Error('Action unavailable: '+${JSON.stringify(label)});button.click();}`);
    await wait("document.querySelector('#confirm').open");
    if(name)await evaluate(`document.querySelector('#artifact-name').value=${JSON.stringify(name)}`);
    if(confirmation)await evaluate(`document.querySelector('#confirmation').value=${JSON.stringify(confirmation)}`);
    await evaluate("document.querySelector('#action-form').requestSubmit()");await wait("!document.querySelector('#confirm').open&&!document.querySelector('#content').hasAttribute('aria-busy')");
  }
  await navigate('instance/lab-db/summary');await action('Iniciar');await action('Reiniciar');await action('Desligar');
  assert.equal((await evaluate("read('instance','lab-db').then(r=>r.data)")).status,'Stopped');
  await navigate('instance/lab-db/snapshots');await action('Tirar um Snapshot',{name:'review-snapshot'});assert.match(await evaluate("document.querySelector('#content').textContent"),/review-snapshot/);
  await click('[data-snapshot="review-snapshot"]');await action('Reverter',{confirmation:'demo/laboratorio/lab-db/review-snapshot'});
  await click('[data-snapshot="review-snapshot"]');await action('Remover',{confirmation:'demo/laboratorio/lab-db/review-snapshot'});
  assert.equal((await evaluate("read('snapshots','lab-db').then(r=>r.data)")).length,0);
  await navigate('instance/lab-db/backups');await action('Criar',{name:'review-backup'});await navigate('backups');assert.match(await evaluate("document.querySelector('#content').textContent"),/review-backup/);
  await navigate('instance/lab-db/backups');await action('Excluir',{confirmation:'demo/laboratorio/lab-db/review-backup'});
  assert.equal((await evaluate("read('backups','lab-db').then(r=>r.data)")).length,0);
  await navigate('datacenter-notes');await evaluate("document.querySelector('.node-notes textarea').value='Nota de revisão';document.querySelector('.node-notes').requestSubmit()");await navigate('overview');await navigate('datacenter-notes');assert.equal(await evaluate("document.querySelector('.node-notes textarea').value"),'Nota de revisão');
  await navigate('search');
  await evaluate("document.querySelector('#resource-search').value='lab-web';document.querySelector('.search-form').requestSubmit()");await wait("document.querySelector('.search-results').textContent.includes('lab-web')");
  await navigate('instance/lab-web/options');
  await evaluate("applyTheme('dark')");await screenshot('desktop-dark');
  await evaluate("applyTheme('light')");await navigate('overview');await screenshot('desktop-light');
  for(const width of [1024,768,390]){
    await viewport(width,844);
    for(const route of routes){await navigate(route);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false,`Overflow ${width}: ${route}`);assert.equal(await evaluate('document.querySelector("main").getBoundingClientRect().left'),width<=650?0:168);}
  }
  await evaluate("applyTheme('dark')");await navigate('overview');await screenshot('mobile-dark');
  await click('#menu-toggle');assert.equal(await evaluate('menuOpen'),true);await click('#menu-close');assert.equal(await evaluate('menuOpen'),false);
  await openWizard();await screenshot('wizard-mobile');await click('#close-create');await viewport(1440,1000);
  await openWizard();
  assert.equal(await evaluate("document.querySelector('#wizard-next').disabled"),true);
  await click('#wizard-tab-7');assert.equal(await evaluate("document.querySelector('#wizard-tab-0').getAttribute('aria-selected')"),'true');
  for(const invalid of ['lab-web','bad_name','-bad','bad-','bad name']){await fill('container-name',invalid);assert.equal(await evaluate("document.querySelector('#wizard-next').disabled"),true,'Name '+invalid);}
  await fill('container-name','web-review');await click('#wizard-next');assert.equal(await evaluate("document.querySelector('#wizard-next').disabled"),true,'Template required');
  await evaluate("{const input=document.querySelector('[name=image]');input.selectedIndex=1;input.dispatchEvent(new Event('change',{bubbles:true}));}");await click('#wizard-next');
  await fill('disk-gib','-1');assert.equal(await evaluate("document.querySelector('#wizard-next').disabled"),true);await fill('disk-gib','8');await click('#wizard-next');
  for(const invalid of ['','0','1.5','1025']){await fill('cpu-cores',invalid);assert.equal(await evaluate("document.querySelector('#wizard-next').disabled"),true);}
  await fill('cpu-cores','2');await fill('cpu-allowance','101');assert.equal(await evaluate("document.querySelector('#wizard-next').disabled"),true);await fill('cpu-allowance','75');await click('#wizard-next');
  for(const invalid of ['','31','128.5']){await fill('memory-mib',invalid);assert.equal(await evaluate("document.querySelector('#wizard-next').disabled"),true);}
  await fill('memory-mib','256');await click('#wizard-next');await fill('ipv4-mode','static');
  for(const invalid of ['','garbage','10.100.0.1','10.100.0.0','10.100.0.255','192.168.1.10','10.100.0.999']){await fill('ipv4',invalid);assert.equal(await evaluate("document.querySelector('#wizard-next').disabled"),true,'IPv4 '+invalid);}
  await fill('ipv4','10.100.0.30');await click('#wizard-next');await click('#wizard-next');
  assert.match(await evaluate("document.querySelector('#wizard-page-7').textContent"),/256 MiB/);await screenshot('wizard-review');
  await evaluate('window.reviewBackground=document.querySelector("#content").firstChild;window.reviewHash=location.hash;');await click('#wizard-submit');
  await wait("document.querySelector('#task-detail').open&&document.querySelector('.task-view-output')?.textContent.includes('25%')");
  assert.equal(await evaluate("!!document.querySelector('#task-detail progress,#task-detail .loading-state,#task-detail .creation-screen')"),false);
  assert.equal(await evaluate("getComputedStyle(document.querySelector('.task-view-output')).backgroundColor"),'rgb(8, 8, 8)');
  assert.equal(await evaluate("document.querySelector('[data-task-control=download]').disabled"),true);
  assert.equal(await evaluate('location.hash===window.reviewHash&&document.querySelector("#content").firstChild===window.reviewBackground'),true);
  await screenshot('creation-progress');await click('#close-task-detail');const reads=operationReads;await new Promise(r=>setTimeout(r,5500));assert.equal(operationReads,reads,'Hidden creation must not poll');
  await click('#create-ct');await wait("document.querySelector('.task-view-output')?.textContent.includes('TASK OK')");
  assert.equal(await evaluate("document.querySelector('[data-task-control=download]').disabled"),false);
  const instance=await evaluate("read('instance','web-review').then(r=>r.data)");assert.equal(instance.status,'Running');assert.equal(instance.config['limits.memory'],'256MiB');assert.equal(instance.config['limits.cpu'],'2');
  await screenshot('creation-success');await click('#task-view-tab-status');assert.match(await evaluate("document.querySelector('.task-view-status').textContent"),/TASK OK/);await click('#task-view-tab-output');assert.match(await evaluate("document.querySelector('.task-view-output').textContent"),/TASK OK/);
  await viewport(390,844);assert.equal(await evaluate('document.documentElement.scrollWidth>innerWidth'),false);await screenshot('creation-output-mobile');await viewport(1440,1000);
  await click('#close-task-detail');await openWizard();await completeWizard('failure-review');await click('#wizard-submit');
  await wait("document.querySelector('.task-view-output')?.textContent.includes('TASK ERROR: Imagem indisponível: erro de teste')");await screenshot('creation-failure');await click('#close-task-detail');
  // Third creation verifies the supported 'keep stopped' option.
  await openWizard();await completeWizard('stopped-review');await click('[name=start-after-create]');await click('#wizard-submit');await wait("document.querySelector('.task-view-output')?.textContent.includes('TASK OK')");
  assert.equal((await evaluate("read('instance','stopped-review').then(r=>r.data)")).status,'Stopped');await click('#close-task-detail');
  // The read-only UI must never open creation, even via old links.
  await evaluate("session.role='observador';render()");await wait("!document.querySelector('#content').hasAttribute('aria-busy')");assert.equal(await evaluate("document.querySelector('#create-ct').disabled"),true);
  await evaluate('openCreateWizard()');assert.equal(await evaluate("document.querySelector('#create-dialog').open"),false);
  await evaluate("session.role='administrador';session.manage_all_instances=false;session.host_metrics=false;session.mutable_instances={demo:{laboratorio:['lab-novo']}};render()");await wait("!document.querySelector('#content').hasAttribute('aria-busy')");await openWizard();
  await fill('container-name','unauthorized');assert.equal(await evaluate("document.querySelector('#wizard-next').disabled"),true);await completeWizard('lab-novo');assert.equal(await evaluate("document.querySelector('[name=memory-mib]').disabled"),true);assert.equal(await evaluate("document.querySelector('[name=start-after-create]').checked"),false);await click('#close-create');
  await click('#logout');await wait("!document.querySelector('#login').hidden");assert.deepEqual(errors,[]);
  console.log(JSON.stringify({routes:routes.length,viewports:[1440,1024,768,390],themes:2,modalPreservesEveryRoute:true,sequentialValidation:true,ipv4Validation:true,creation:'Running',blackTaskOutput:true,noCreationLoading:true,keepStopped:true,asyncFailure:true,lifecycle:true,editing:true,snapshots:true,backups:true,notes:true,search:true,permissions:true,backgroundPollingPaused:true,jsErrors:0,screenshots:'artifacts/review'}));
}finally{socket.close();}
