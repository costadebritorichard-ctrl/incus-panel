// Requires a fresh tests/create_fixture.py. Uses only its in-memory Incus double.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../artifacts/qa/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom');
const origin=process.env.PANEL_ORIGIN||'http://127.0.0.1:8082';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
let cookie='',restoredSession,restoreSession;const errors=[],requests=[];
const sessionRestored=new Promise(resolve=>{restoreSession=resolve;});
let rejectOldSession;const oldSessionRejected=new Promise(resolve=>{rejectOldSession=resolve;});
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
const dom=await JSDOM.fromURL(origin,{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(window){
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new window.Event('close'));};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  window.fetch=async(path,options={})=>{
    requests.push(String(path));
    // A slow session restore can arrive after the user has already logged in.
    if(path==='/api/session')return sessionRestored;
    if(path==='/api/stale-session')return oldSessionRejected;
    const response=await fetch(new URL(path,origin),{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),...(options.method==='POST'?{Origin:origin}:{})}});
    const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
    if(path==='/api/login')restoredSession=await response.clone().json();
    return response;
  };
}});
const w=dom.window,d=w.document,$=selector=>d.querySelector(selector);
async function wait(check){for(let i=0;i<600;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,40));}throw new Error('Timeout: '+$('#task-detail-content').textContent);}
async function create(target,start=true){
  $('#create-ct').click();await wait(()=>$('#create-dialog').open&&!!$('.wizard-form'));
  $('[name=container-name]').value=target;$('[name=image]').selectedIndex=1;
  $('[name=start-after-create]').checked=start;
  for(let i=0;i<7;i++)$('.wizard-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  $('.wizard-form').requestSubmit();
}
try{
  await wait(()=>typeof w.api==='function');
  const anonymousRead=w.api('/api/stale-session').catch(error=>error.status);
  $('#login-username').value='test';$('#login-password').value='local-browser-fixture';$('#login-form').requestSubmit();
  await wait(()=>!$('#shell').hidden&&!$('#content').hasAttribute('aria-busy'));
  w.location.hash='instances';await wait(()=>!!$('.view-instances')&&!$('#content').hasAttribute('aria-busy'));
  await create('creation-visible');
  await wait(()=>$('.task-view-output')?.textContent.includes('25%'));
  assert.equal($('#task-detail').open,true);
  const owner=w.eval('session');
  restoreSession(new Response(JSON.stringify(restoredSession),{status:200,headers:{'Content-Type':'application/json'}}));
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(w.eval('session')===owner,'Uma restauração atrasada não substitui a sessão que acompanha a criação.');
  rejectOldSession(new Response(JSON.stringify({error:'Sessão antiga expirada.'}),{status:401,headers:{'Content-Type':'application/json'}}));
  assert.equal(await anonymousRead,401);
  assert.ok(w.eval('session')===owner,'Um HTTP 401 de antes do login não encerra a nova sessão.');
  await wait(()=>$('.task-view-output')?.textContent.includes('TASK OK'));
  assert.equal($('#task-detail').open,true,'O acompanhamento conclui sem fechar o diálogo.');
  await wait(()=>$('#content').textContent.includes('creation-visible'));
  assert.ok($('#tree a[href="#instance/creation-visible/summary"]'),'O container aparece na árvore sem F5.');
  assert.equal(requests.filter(path=>path==='/api/create').length,1);
  $('#task-view-tab-status').click();assert.match($('.task-view-status').textContent,/Concluída/);
  console.log('CREATE_VISIBLE_COMPLETION_AND_INVENTORY_OK');
  $('#close-task-detail').click();
  await create('creation-error');
  await wait(()=>$('.task-view-output')?.textContent.includes('TASK ERROR: Imagem indisponível: erro de teste'));
  assert.doesNotMatch($('#task-detail-content').textContent,/TASK OK/);
  await wait(()=>!$('#content').hasAttribute('aria-busy'));
  assert.equal($('#content').textContent.includes('creation-error'),false);
  $('#close-task-detail').click();
  await create('creation-stopped',false);
  await wait(()=>$('.task-view-output')?.textContent.includes('TASK OK'));
  await wait(()=>$('#content').textContent.includes('creation-stopped'));
  const stopped=(await w.read('instance','creation-stopped')).data;
  assert.equal(stopped.status,'Stopped');
  $('#close-task-detail').click();
  await create('creation-resumed');
  await wait(()=>$('.task-view-output')?.textContent.includes('25%'));
  $('#close-task-detail').click();
  const operationReads=()=>requests.filter(path=>path.includes('resource=operation&')).length;
  const pausedReads=operationReads();await new Promise(resolve=>setTimeout(resolve,5500));
  assert.equal(operationReads(),pausedReads,'Fechar a janela suspende as consultas no modo leve.');
  $('#create-ct').click();await wait(()=>$('.task-view-output')?.textContent.includes('TASK OK'));
  await wait(()=>$('#content').textContent.includes('creation-resumed'));
  assert.equal(requests.filter(path=>path==='/api/create').length,4,'Retomar acompanha a operação existente sem reenviar a criação.');
  console.log('CREATE_FAILURE_STOPPED_AND_RESUME_OK');
  assert.deepEqual(errors,[]);
}finally{dom.window.close();}
