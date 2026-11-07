// Run with a fresh tests/create_fixture.py. All operations use the local demo.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../artifacts/qa/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom');
const origin=process.env.PANEL_ORIGIN||'http://127.0.0.1:8082';
assert.ok(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
let cookie='',posts=0;const errors=[];
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',error=>errors.push(error.message));
const dom=await JSDOM.fromURL(origin,{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(window){
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  window.fetch=async(path,options={})=>{
    if(path==='/api/action')posts++;
    const response=await fetch(new URL(path,origin),{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),...(options.method==='POST'?{Origin:origin}:{})}});
    const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];return response;
  };
}});
const w=dom.window,d=w.document,$=selector=>d.querySelector(selector);
const lastRun=()=>w.eval('[...snapshotRuns.values()].at(-1)');
async function wait(check){for(let i=0;i<500;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Timeout: '+$('#action-error').textContent+' '+$('#task-detail-content').textContent);}
async function navigate(hash){const generation=w.eval('generation');if(w.location.hash==='#'+hash)await w.render();else w.location.hash=hash;await wait(()=>w.eval('generation')>generation&&!$('#content').hasAttribute('aria-busy'));}
async function action(name){$(`[data-action="${name}"]`).click();await wait(()=>$('#confirm').open);}
function closeWindows(){if($('#task-detail').open)$('#close-task-detail').click();if($('#snapshot-progress').open)$('#close-snapshot-progress').click();}
function response(data){return new Response(JSON.stringify({data}),{status:200,headers:{'Content-Type':'application/json'}});}
const isOperation=path=>new URL(path,origin).searchParams.get('resource')==='operation';
async function drive(run){await wait(()=>!run.polling);await w.pollSnapshotTask(run);}
async function finish(){await wait(()=>lastRun()?.status_code>=200&&!lastRun().polling&&!$('#content').hasAttribute('aria-busy'));}
async function save(){const before=lastRun();$('#action-form').requestSubmit();await wait(()=>!$('#confirm').open);if(lastRun()!==before)await finish();else await wait(()=>!$('#content').hasAttribute('aria-busy'));closeWindows();}
function select(name){$(`[data-snapshot="${name}"]`).click();}
async function html(name){
  const copy=d.documentElement.cloneNode(true);copy.querySelectorAll('script,link[rel=stylesheet]').forEach(node=>node.remove());
  const style=d.createElement('style');style.textContent=await fs.readFile(new URL('../web/style.css',import.meta.url),'utf8');copy.querySelector('head').append(style);
  copy.querySelectorAll('input').forEach((node,index)=>node.setAttribute('value',d.querySelectorAll('input')[index].value));
  copy.querySelectorAll('textarea').forEach((node,index)=>node.textContent=d.querySelectorAll('textarea')[index].value);
  const script=d.createElement('script');script.textContent="document.querySelectorAll('dialog[open]').forEach(dialog=>{dialog.removeAttribute('open');dialog.showModal();});"+(d.activeElement.id?`document.getElementById(${JSON.stringify(d.activeElement.id)})?.focus();`:'');copy.querySelector('body').append(script);
  await fs.mkdir('artifacts/snapshot-workflow',{recursive:true});await fs.writeFile(`artifacts/snapshot-workflow/${name}.html`,'<!doctype html>'+copy.outerHTML);
}
try{
  await wait(()=>typeof w.api==='function');$('#login-username').value='test';$('#login-password').value='local-browser-fixture';$('#login-form').requestSubmit();
  await wait(()=>!$('#shell').hidden&&!$('#content').hasAttribute('aria-busy'));assert.equal(w.eval('session.demo'),true);
  await navigate('instance/lab-db/snapshots');
  const realFetch=w.fetch;
  let releasePost,requestCalls=0,reads=0,complete=false;
  w.fetch=async(path,options)=>{
    if(path==='/api/action'){requestCalls++;await new Promise(resolve=>{releasePost=resolve;});}
    if(isOperation(path)&&!complete){reads++;return response({id:lastRun().operation,status:'Running',status_code:103,metadata:{snapshot_progress:'25%'},err:''});}
    return realFetch(path,options);
  };
  await action('snapshot');$('#artifact-name').value='workflow-snapshot';$('#snapshot-description').value='Antes da atualização';
  $('#submit-action').click();$('#submit-action').click();
  assert.equal(requestCalls,1);assert.ok($('#action-form .snapshot-loading-mask'));assert.equal($('#submit-action').disabled,true);
  await html('loading-dark');releasePost();
  await wait(()=>$('#task-detail').open&&lastRun()?.status_code===103&&!lastRun().polling);
  const run=lastRun();assert.equal($('#confirm').open,false);assert.equal($('#snapshot-progress').open,false);
  assert.equal($('#task-detail-title').textContent,'Task viewer: CT lab-db - Snapshot');
  assert.deepEqual([...d.querySelectorAll('.snapshot-task-viewer [role=tab]')].map(node=>node.textContent),['Saída','Status']);
  assert.match($('.snapshot-task-viewer .task-view-output').textContent,/25%/);assert.doesNotMatch($('.snapshot-task-viewer .task-view-output').textContent,/TASK OK/);
  assert.equal($('[data-snapshot-control=download]').disabled,true);assert.ok($('#task-log-content .snapshot-task-spinner'));
  await html('output-running-dark');$('#snapshot-task-tab-status').click();assert.match($('.task-view-status').textContent,/running/);await html('status-running-dark');
  $('#snapshot-task-tab-status').dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal($('#snapshot-task-tab-output').getAttribute('aria-selected'),'true');
  // Operations lasting beyond the old six-poll limit stay in the same viewer.
  for(let i=0;i<7;i++)await drive(run);
  assert.ok(reads>=8);assert.equal(w.location.hash,'#instance/lab-db/snapshots');assert.equal(run.status_code,103);
  complete=true;await drive(run);await finish();
  assert.match($('.snapshot-task-viewer .task-view-output').textContent,/TASK OK/);assert.equal($('#task-detail').open,true);
  assert.ok($('[data-snapshot="workflow-snapshot"]'));assert.equal(posts,1);
  let downloaded,downloadName;w.URL.createObjectURL=blob=>{downloaded=blob;return 'blob:fixture-output';};w.URL.revokeObjectURL=()=>{};
  const anchorClick=w.HTMLAnchorElement.prototype.click;w.HTMLAnchorElement.prototype.click=function(){if(this.download)downloadName=this.download;else anchorClick.call(this);};
  $('[data-snapshot-control=download]').click();
  const log=await new Promise((resolve,reject)=>{const reader=new w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(downloaded);});
  assert.match(log,/TASK OK/);assert.match(log,/25%/);assert.match(downloadName,/workflow-snapshot\.log$/);
  await html('output-done-dark');w.applyTheme('light');await html('output-done-light');w.applyTheme('dark');
  $('#snapshot-task-tab-status').click();assert.match($('.task-view-status').textContent,/stopped: OK/);await html('status-done-dark');closeWindows();
  const beforeReopen=posts;await w.openTaskDetail(w.eval('[...tasks.values()].find(task=>task.id===([...snapshotRuns.values()][0]).operation)'));assert.match($('.task-view-output').textContent,/TASK OK/);assert.equal(posts,beforeReopen);closeWindows();w.fetch=realFetch;
  select('workflow-snapshot');await action('snapshot-restore');assert.equal($('#confirm').dataset.actionType,'snapshot-confirm');assert.equal($('#confirmation').required,false);await save();
  select('workflow-snapshot');await action('snapshot-delete');
  assert.equal($('#action-title').textContent,'Confirmar');assert.equal($('#submit-action').textContent,'Sim');assert.equal($('#cancel-action').textContent,'Não');assert.equal(d.activeElement,$('#cancel-action'));
  await html('confirm-delete-dark');w.applyTheme('light');await html('confirm-delete-light');w.applyTheme('dark');
  const beforeNo=posts;$('#cancel-action').click();assert.equal(posts,beforeNo);assert.ok($('[data-snapshot="workflow-snapshot"]'));
  complete=false;
  w.fetch=(path,options)=>isOperation(path)&&!complete?Promise.resolve(response({id:lastRun().operation,status:'Running',status_code:103,metadata:{},err:''})):realFetch(path,options);
  await action('snapshot-delete');$('#submit-action').click();
  await wait(()=>$('#snapshot-progress').open&&lastRun().status_code===103&&!lastRun().polling);
  assert.equal($('.snapshot-progress-bar').hasAttribute('aria-valuenow'),false);assert.ok($('.snapshot-progress-fill.indeterminate'));
  await html('progress-dark');w.applyTheme('light');await html('progress-light');w.applyTheme('dark');
  $('[data-action=snapshot-task-details]').click();assert.equal($('#snapshot-progress').open,false);assert.equal($('#task-detail').open,true);assert.match($('#task-detail-title').textContent,/Excluir Snapshot/);
  complete=true;await drive(lastRun());await finish();assert.match($('.task-view-output').textContent,/TASK OK/);assert.equal($('[data-snapshot="workflow-snapshot"]'),null);closeWindows();w.fetch=realFetch;
  // A failed status query retries the same operation, without another POST.
  let disconnected=true;
  w.fetch=(path,options)=>isOperation(path)&&disconnected?Promise.reject(new Error('Conexão de teste interrompida')):realFetch(path,options);
  await action('snapshot');$('#artifact-name').value='retry-snapshot';$('#action-form').requestSubmit();
  await wait(()=>lastRun()?.snapshot==='retry-snapshot'&&lastRun().connectionError&&!lastRun().polling);
  assert.doesNotMatch($('.task-view-output').textContent,/TASK (OK|ERROR)/);const beforeRetry=posts;disconnected=false;
  $('[data-snapshot-control=retry]').click();await finish();assert.equal(posts,beforeRetry);assert.match($('.task-view-output').textContent,/TASK OK/);closeWindows();w.fetch=realFetch;
  // An Incus task failure is retained in the viewer and downloadable output.
  w.fetch=(path,options)=>isOperation(path)?Promise.resolve(response({id:lastRun().operation,status:'Failure',status_code:400,metadata:{},err:'Falha de teste ao copiar o snapshot'})):realFetch(path,options);
  await action('snapshot');$('#artifact-name').value='failed-task-snapshot';$('#action-form').requestSubmit();await wait(()=>lastRun()?.snapshot==='failed-task-snapshot'&&lastRun().status_code===400&&!lastRun().polling);
  assert.match($('.task-view-output').textContent,/TASK ERROR: Falha de teste/);assert.doesNotMatch($('.task-view-output').textContent,/TASK OK/);await html('task-error-dark');closeWindows();w.fetch=realFetch;
  // Closing a viewer keeps the task; inactive pages and hidden tabs stop polling.
  complete=false;let hidden=false,pausedReads=0;
  Object.defineProperty(d,'hidden',{configurable:true,get:()=>hidden});
  w.fetch=(path,options)=>{if(isOperation(path)&&!complete){pausedReads++;return Promise.resolve(response({id:lastRun().operation,status:'Running',status_code:103,metadata:{},err:''}));}return realFetch(path,options);};
  await action('snapshot');$('#artifact-name').value='background-snapshot';$('#action-form').requestSubmit();await wait(()=>lastRun()?.snapshot==='background-snapshot'&&lastRun().status_code===103&&!lastRun().polling);
  const background=lastRun();closeWindows();await navigate('overview');const beforePause=pausedReads;await drive(background);assert.equal(pausedReads,beforePause);
  hidden=true;d.dispatchEvent(new w.Event('visibilitychange'));await drive(background);assert.equal(pausedReads,beforePause);
  hidden=false;d.dispatchEvent(new w.Event('visibilitychange'));complete=true;await navigate('instance/lab-db/snapshots');await wait(()=>background.status_code===200&&!background.polling);
  assert.ok($('[data-snapshot="background-snapshot"]'));assert.equal($('#task-detail').open,false);
  w.fetch=realFetch;
  for(const name of ['retry-snapshot','failed-task-snapshot','background-snapshot']){select(name);await action('snapshot-delete');await save();}
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({loading:true,createOpensViewer:true,yesNoConfirmation:true,deleteProgressAndDetails:true,outputAndStatusTabs:true,realProgressOnly:true,download:true,pollsBeyondThirtySeconds:true,reopenWithoutResubmit:true,connectionRetryWithoutResubmit:true,taskErrors:true,pauseAndResume:true,themes:2,domErrors:0,previews:'artifacts/snapshot-workflow'}));
}finally{w.close();}
