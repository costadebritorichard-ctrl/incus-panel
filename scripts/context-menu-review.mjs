// Run against a fresh tests/create_fixture.py and an isolated Chrome on CDP_PORT.
// Mutations are confined to the local in-memory demo fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.PANEL_ORIGIN||'http://127.0.0.1:8082';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const tabs=await(await fetch(`http://127.0.0.1:${process.env.CDP_PORT||9223}/json/list`)).json();
const page=tabs.find(tab=>tab.type==='page'&&(tab.url==='about:blank'||tab.url.startsWith(origin)));
assert.ok(page,'Use an isolated QA browser.');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let seq=0,mutations=0;const pending=new Map(),errors=[];
socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const item=pending.get(data.id);pending.delete(data.id);data.error?item.reject(new Error(data.error.message)):item.resolve(data.result);}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);if(data.method==='Network.requestWillBeSent'&&data.params.request.url.endsWith('/api/action'))mutations++;};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=async expression=>{for(let i=0;i<300;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Timeout: '+expression+' '+await evaluate("document.querySelector('#action-error').textContent"));};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const fill=(selector,value)=>evaluate(`document.querySelector(${JSON.stringify(selector)}).value=${JSON.stringify(value)}`);
const viewport=async(width,height)=>{await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=650});await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
const screenshot=async name=>fs.writeFile(`artifacts/context-menu/${name}.png`,Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
async function context(selector){
  const point=await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)throw new Error('Missing '+${JSON.stringify(selector)});node.scrollIntoView({block:'nearest'});const r=node.getBoundingClientRect();return {x:r.left+Math.min(30,r.width/2),y:r.top+r.height/2}})()`);
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'right',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'right',clickCount:1});
  await wait("!!document.querySelector('.context-menu')");
}
const menuAction=async action=>{await click(`[data-menu-action="${action}"]`);await wait("document.querySelector('#confirm').open");};
async function confirm({name,typed}={}){
  if(name)await fill('#artifact-name',name);
  if(typed)await fill('#confirmation',typed);
  await evaluate("document.querySelector('#action-form').requestSubmit()");
  await wait("!document.querySelector('#confirm').open");
  await wait("!document.querySelector('#content').hasAttribute('aria-busy')");
}
const web='#tree a[href="#instance/lab-web/summary"]';
try{
  await fs.mkdir('artifacts/context-menu',{recursive:true});
  await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await viewport(1440,900);
  await call('Page.navigate',{url:origin});await wait("typeof api==='function'");
  if(await evaluate("document.querySelector('#shell').hidden")){
    await fill('#login-username','test');await fill('#login-password','local-browser-fixture');
    await evaluate("document.querySelector('#login-form').requestSubmit()");
  }
  await wait("!document.querySelector('#shell').hidden&&!document.querySelector('#content').hasAttribute('aria-busy')");
  assert.equal(await evaluate('session.demo'),true,'Never run mutations against a real host.');
  const order=['start','stop','force-stop','restart','clone','template','snapshot','backup','console'];
  for(const theme of ['dark','light']){
    await evaluate(`applyTheme('${theme}')`);await context(web);
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.context-menu button')].map(button=>button.dataset.menuAction)"),order);
    assert.equal(await evaluate("document.querySelector('.context-menu-title').textContent"),'CT lab-web');
    assert.equal(await evaluate("document.querySelectorAll('.context-menu [role=separator]').length"),3);
    assert.equal(await evaluate("document.querySelectorAll('.context-menu button svg').length"),9);
    assert.equal(await evaluate("document.querySelector('[data-menu-action=start]').disabled"),true);
    assert.equal(await evaluate("document.querySelector('[data-menu-action=stop]').disabled"),false);
    assert.equal(await evaluate("document.querySelector('[data-menu-action=template]').disabled"),true);
    await screenshot(theme+'-running');
    await evaluate("resourceMenu.dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}))");
    assert.equal(await evaluate('document.activeElement.dataset.menuAction'),await evaluate("[...resourceMenu.querySelectorAll('button:not(:disabled)')].at(-1).dataset.menuAction"));
    await evaluate("resourceMenu.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))");
    assert.equal(await evaluate('document.activeElement.dataset.menuAction'),'stop');
    await evaluate("resourceMenu.dispatchEvent(new KeyboardEvent('keydown',{key:'Home',bubbles:true}))");
    assert.equal(await evaluate('document.activeElement.dataset.menuAction'),'stop');
    await evaluate("resourceMenu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
    assert.equal(await evaluate('resourceMenu===null'),true);
    assert.equal(await evaluate(`document.activeElement===document.querySelector('${web}')`),true);
  }
  await context('#content tr:has(a[href="#instance/lab-web/summary"]) td:first-child');
  assert.equal(await evaluate("document.querySelector('.context-menu-title').textContent"),'CT lab-web');
  await evaluate('closeResourceMenu(true)');
  await evaluate('applyTheme("dark")');
  await context(web);await menuAction('snapshot');
  const beforeSnapshot=mutations;
  await fill('#artifact-name','menu-snapshot');
  await evaluate("document.querySelector('#submit-action').click();document.querySelector('#submit-action').click()");
  await wait("!document.querySelector('#confirm').open");
  assert.equal(mutations,beforeSnapshot+1,'Double clicks must submit only once.');
  assert.equal(await evaluate("read('snapshots','lab-web').then(result=>result.data.some(value=>value.name==='menu-snapshot'))"),true);
  await context(web);await menuAction('backup');await confirm({name:'menu-backup'});
  assert.equal(await evaluate("read('backups','lab-web').then(result=>result.data.some(value=>value.name==='menu-backup'))"),true);
  await context(web);await menuAction('stop');await confirm();
  await context(web);await wait("!document.querySelector('[data-menu-action=start]').disabled");
  assert.equal(await evaluate("document.querySelector('[data-menu-action=stop]').disabled"),true);
  assert.equal(await evaluate("document.querySelector('[data-menu-action=force-stop]').disabled"),true);
  assert.equal(await evaluate("document.querySelector('[data-menu-action=restart]').disabled"),true);
  await screenshot('dark-stopped');
  await menuAction('start');await confirm();
  await context(web);await menuAction('force-stop');
  const beforeBadConfirm=mutations;
  await fill('#confirmation','wrong-name');await evaluate("document.querySelector('#action-form').requestSubmit()");
  await wait("!!document.querySelector('#action-error').textContent");
  assert.equal(mutations,beforeBadConfirm);
  await confirm({typed:'lab-web'});
  await context(web);await menuAction('clone');await screenshot('clone-dialog');
  await evaluate("document.querySelector('#clone-snapshots').checked=true");await confirm({name:'menu-copy'});
  await wait("location.hash==='#instance/menu-copy/summary'");
  assert.equal(await evaluate("read('instance','menu-copy').then(result=>result.data.status)"),'Stopped');
  assert.equal(await evaluate("read('snapshots','menu-copy').then(result=>result.data.some(value=>value.name==='menu-snapshot'))"),true);
  await context(web);await menuAction('template');await screenshot('template-dialog');await confirm({name:'menu-template'});
  await wait("location.hash==='#images'");
  assert.equal(await evaluate("read('images').then(result=>result.data.some(image=>image.aliases.some(alias=>alias.name==='menu-template')))"),true);
  assert.equal(await evaluate("read('instance','lab-web').then(result=>result.data.status)"),'Stopped');
  await evaluate("openAction('delete','menu-copy')");await confirm({typed:'menu-copy'});
  await context('#tree a[href="#server/summary"]');await screenshot('node-menu');
  await click('[data-menu-action=bulk-start]');await wait("!!document.querySelector('.bulk-action-form')");
  await evaluate("document.querySelector('.bulk-action-form').requestSubmit()");
  await wait("document.querySelector('.bulk-action-form button[type=submit]').textContent==='Concluído'");
  await wait("!document.querySelector('#content').hasAttribute('aria-busy')");
  assert.equal(await evaluate("freshResource('instance-list',undefined,{host,project}).then(result=>result.data.every(item=>item.status==='Running'))"),true);
  await click('#close-editor');
  for(const action of ['freeze','unfreeze']){
    await context('#tree a[href="#server/summary"]');await wait(`!document.querySelector('[data-menu-action=bulk-${action}]').disabled&&!document.querySelector('[data-menu-action=bulk-${action}]').hidden`);await click(`[data-menu-action=bulk-${action}]`);
    await wait("!!document.querySelector('.bulk-action-form')");await evaluate("document.querySelector('.bulk-action-form').requestSubmit()");
    await wait("document.querySelector('.bulk-action-form button[type=submit]').textContent==='Concluído'");await wait("!document.querySelector('#content').hasAttribute('aria-busy')");await click('#close-editor');
  }
  await context('#tree a[href="#storage/lab/summary"]');
  assert.deepEqual(await evaluate("[...resourceMenu.querySelectorAll('button')].map(button=>button.textContent)"),['Sumário','Conteúdo','Permissões']);
  await click('[data-menu-action=content]');await wait("location.hash==='#storage/lab/content'");
  await context('#tree a[href="#network/labbr0/summary"]');await screenshot('network-menu');
  assert.equal(await evaluate("document.querySelector('[data-menu-action=delete]').disabled"),true);
  await click('[data-menu-action=edit]');await wait("document.querySelector('#editor-dialog').open&&!!document.querySelector('.network-form')");await click('#close-editor');
  await evaluate('session.read_only=true');await context(web);
  assert.equal(await evaluate("[...resourceMenu.querySelectorAll('button')].every(button=>button.disabled)"),true);
  await evaluate('session.read_only=false;closeResourceMenu();');
  const viewports=[[1440,900],[960,480],[650,844],[390,844],[320,480],[320,180]];
  for(const theme of ['light','dark'])for(const [width,height]of viewports){
    await viewport(width,height);await evaluate(`applyTheme('${theme}');showResourceMenu({clientX:${width-1},clientY:${height-1}},inventory.find(item=>item.name==='lab-web'))`);
    const rect=await evaluate("(()=>{const r=resourceMenu.getBoundingClientRect();return {x:r.left,y:r.top,right:r.right,bottom:r.bottom};})()");
    assert.ok(rect.x>=4&&rect.y>=4&&rect.right<=width-3&&rect.bottom<=height-3,JSON.stringify({theme,width,height,rect}));
    if(width===320&&height===480)await screenshot(theme+'-320');
    await evaluate('closeResourceMenu()');
  }
  await viewport(1440,900);await evaluate(`document.querySelector('${web}').focus();document.querySelector('${web}').dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true}))`);
  await wait('!!resourceMenu');await click('#title');
  // A pointer event outside the menu dismisses it without changing the resource.
  await evaluate("document.querySelector('#title').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))");
  assert.equal(await evaluate('resourceMenu===null'),true);
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(JSON.stringify({menus:['container','node','storage','network'],themes:2,edgeLayouts:12,keyboard:true,permissions:true,lifecycle:true,clone:true,privateTemplate:true,snapshot:true,backup:true,bulk:true,jsErrors:errors.length}));
}finally{socket.close();}
