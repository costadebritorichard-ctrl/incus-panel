import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../artifacts/qa/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom');
const origin=process.env.PANEL_ORIGIN||'http://127.0.0.1:8082';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
let cookie='';const errors=[],mutations=[];
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
const dom=await JSDOM.fromURL(origin,{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(window){
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  window.fetch=async(path,options={})=>{
    if(path==='/api/action')mutations.push(JSON.parse(options.body));
    const response=await fetch(new URL(path,origin),{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),...(options.method==='POST'?{Origin:origin}:{})}});
    const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];return response;
  };
}});
const w=dom.window,d=w.document,$=selector=>d.querySelector(selector);
async function wait(check){for(let i=0;i<500;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Timeout: '+$('#action-error').textContent+' '+$('#content').textContent);}
async function navigate(target='lab-db'){
  const generation=w.eval('generation'),next=`#instance/${target}/snapshots`;
  if(w.location.hash===next)await w.render();else w.location.hash=next;
  await wait(()=>w.eval('generation')>generation&&!$('#content').hasAttribute('aria-busy')&&!!$('.snapshot-table'));
}
async function action(name){$(`[data-action="${name}"]`).click();await wait(()=>$('#confirm').open);}
async function save(){
  $('#action-form').requestSubmit();
  await wait(()=>!$('#confirm').open&&!$('#content').hasAttribute('aria-busy'));
}
function select(name){$(`[data-snapshot="${name}"]`).click();}
async function snapshotHtml(name){
  const copy=d.documentElement.cloneNode(true);
  copy.querySelectorAll('script').forEach(node=>node.remove());
  const style=d.createElement('style');style.textContent=await fs.readFile(new URL('../web/style.css',import.meta.url),'utf8');
  copy.querySelectorAll('link[rel=stylesheet]').forEach(node=>node.remove());copy.querySelector('head').append(style);
  copy.querySelectorAll('input').forEach((node,index)=>node.setAttribute('value',d.querySelectorAll('input')[index].value));
  copy.querySelectorAll('textarea').forEach((node,index)=>node.textContent=d.querySelectorAll('textarea')[index].value);
  const init=d.createElement('script');init.textContent="document.querySelectorAll('dialog[open]').forEach(dialog=>{dialog.removeAttribute('open');dialog.showModal();});"+(d.activeElement.id?`document.getElementById(${JSON.stringify(d.activeElement.id)})?.focus();`:'');
  copy.querySelector('body').append(init);
  await fs.mkdir('artifacts/snapshots',{recursive:true});await fs.writeFile(`artifacts/snapshots/${name}.html`,'<!doctype html>'+copy.outerHTML);
}
try{
  await wait(()=>typeof w.api==='function');
  $('#login-username').value='test';$('#login-password').value='local-browser-fixture';$('#login-form').requestSubmit();
  await wait(()=>!$('#shell').hidden&&!$('#content').hasAttribute('aria-busy'));
  assert.equal(w.eval('session.demo'),true,'Snapshot review is restricted to the local fixture.');
  await navigate();
  assert.deepEqual([...d.querySelectorAll('.snapshot-toolbar button')].map(node=>node.textContent),['Tirar um Snapshot','Reverter','Editar','Remover']);
  assert.equal($('.snapshot-table tbody tr:last-child').dataset.snapshot,'current');
  for(const name of ['snapshot-restore','snapshot-edit','snapshot-delete'])assert.equal($(`[data-action="${name}"]`).disabled,true);
  assert.equal(d.querySelectorAll('.snapshot-table tbody button').length,0);
  await snapshotHtml('empty-dark');await action('snapshot');
  assert.equal($('#confirm').dataset.actionType,'snapshot');assert.equal($('#artifact-name').value,'');
  assert.equal($('#action-title').textContent,'Criar: CT lab-db Snapshot');
  assert.equal($('#confirmation').required,false);assert.equal($('#snapshot-description-label').hidden,false);
  await snapshotHtml('create-dark');w.applyTheme('light');await snapshotHtml('create-light');w.applyTheme('dark');
  $('#artifact-name').value='review-snapshot';$('#snapshot-description').value='Antes da atualização\nPonto seguro';
  const before=mutations.length;$('#submit-action').click();$('#submit-action').click();
  await wait(()=>!$('#confirm').open&&!$('#content').hasAttribute('aria-busy')&&!!$('[data-snapshot="review-snapshot"]'));
  assert.equal(mutations.length,before+1);assert.equal(mutations.at(-1).description,'Antes da atualização\nPonto seguro');
  assert.match($('.snapshot-table').textContent,/Antes da atualização/);select('review-snapshot');
  assert.equal($('[data-action=snapshot-restore]').disabled,false);await snapshotHtml('grid-dark');
  await action('snapshot-edit');assert.equal($('#artifact-name').readOnly,true);
  assert.equal($('#snapshot-description').value,'Antes da atualização\nPonto seguro');
  $('#snapshot-description').value='Descrição revisada';await save();
  assert.match($('.snapshot-table').textContent,/Descrição revisada/);
  await action('snapshot');$('#artifact-name').value='review-snapshot';$('#action-form').requestSubmit();
  await wait(()=>$('#action-error').textContent.includes('Já existe'));assert.equal(mutations.length,before+2);
  $('#close-action').click();
  select('review-snapshot');await action('snapshot-restore');
  $('#confirmation').value='demo/laboratorio/lab-db/review-snapshot';await save();
  select('review-snapshot');await action('snapshot-delete');
  $('#confirmation').value='demo/laboratorio/lab-db/review-snapshot';await save();
  assert.equal($('[data-snapshot="review-snapshot"]'),null);
  assert.ok($('[data-snapshot=current]'));
  await navigate('lab-web');
  await w.read('snapshots','lab-web');
  const external=await fetch(new URL('/api/action',origin),{method:'POST',headers:{'Content-Type':'application/json',Cookie:cookie,Origin:origin,'X-CSRF-Token':w.eval('session.csrf')},body:JSON.stringify({host:'demo',project:'laboratorio',target:'lab-web',action:'snapshot',name:'external-snapshot',confirmation:'demo/laboratorio/lab-web'})});
  assert.equal(external.ok,true);
  await navigate('lab-db');await navigate('lab-web');
  assert.ok($('[data-snapshot="external-snapshot"]'),'Reopening snapshots must bypass the low-resource read cache.');
  select('external-snapshot');await action('snapshot-delete');$('#confirmation').value='demo/laboratorio/lab-web/external-snapshot';await save();
  await action('snapshot');$('#artifact-name').value='running-snapshot';await save();
  select('running-snapshot');assert.equal($('[data-action=snapshot-restore]').disabled,true);
  const fetchOriginal=w.fetch;
  w.fetch=async(path,options)=>path==='/api/action'?new Response(JSON.stringify({error:'Incus: pool cheio'}),{status:500,headers:{'content-type':'application/json'}}):fetchOriginal(path,options);
  await action('snapshot');$('#artifact-name').value='failed-snapshot';$('#action-form').requestSubmit();
  await wait(()=>$('#action-error').textContent.includes('pool cheio'));
  assert.equal($('#confirm').open,true);assert.equal($('#submit-action').disabled,false);assert.equal($('#artifact-name').value,'failed-snapshot');
  $('#close-action').click();w.fetch=fetchOriginal;
  select('running-snapshot');await action('snapshot-delete');$('#confirmation').value='demo/laboratorio/lab-web/running-snapshot';await save();
  w.eval("session.role='observador'");await w.render();
  for(const node of d.querySelectorAll('.snapshot-toolbar button'))assert.equal(node.disabled,true);
  w.eval("session.role='administrador';session.read_only=true");await w.render();
  for(const node of d.querySelectorAll('.snapshot-toolbar button'))assert.equal(node.disabled,true);
  w.eval('session.read_only=false');await w.render();
  w.fetch=(path,options)=>String(path).includes('resource=snapshots')?Promise.resolve(new Response(JSON.stringify({data:Array.from({length:30},(_,index)=>({name:'many-'+index,description:'',created_at:'2026-11-07T12:00:00Z'}))}),{status:200,headers:{'content-type':'application/json'}})):fetchOriginal(path,options);
  await w.render();
  assert.equal(d.querySelectorAll('.snapshot-table tbody tr').length,31);
  assert.equal($('.snapshot-table tbody tr:last-child').dataset.snapshot,'current');
  assert.equal($('[data-snapshot=current]').getAttribute('aria-selected'),'true');
  assert.equal(d.querySelectorAll('.snapshot-table .column-sort').length,0);
  w.fetch=fetchOriginal;await w.render();
  w.applyTheme('light');await snapshotHtml('grid-light');
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({snapshotCrud:true,descriptionPersists:true,selection:true,currentRow:true,duplicateBlocked:true,doubleSubmitBlocked:true,runningRestoreBlocked:true,permissions:true,serverErrorPreservesForm:true,staticVisualPreviews:'artifacts/snapshots',domErrors:0}));
}finally{dom.window.close();}
