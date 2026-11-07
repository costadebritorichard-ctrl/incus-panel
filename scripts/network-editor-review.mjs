// Run against tests/create_fixture.py and an isolated Chrome CDP session.
// All edits below affect only the explicit in-memory demo fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.PANEL_ORIGIN||'http://127.0.0.1:8082';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
const tabs=await(await fetch(`http://127.0.0.1:${process.env.CDP_PORT||9223}/json/list`)).json();
const page=tabs.find(tab=>tab.type==='page'&&(tab.url==='about:blank'||tab.url.startsWith(origin)));
assert.ok(page,'Use an isolated browser.');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let seq=0,mutations=0;const pending=new Map(),errors=[];
socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const request=pending.get(data.id);pending.delete(data.id);data.error?request.reject(new Error(data.error.message)):request.resolve(data.result);}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);if(data.method==='Network.requestWillBeSent'&&data.params.request.url.endsWith('/api/action'))mutations++;};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=async expression=>{for(let count=0;count<300;count++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Timeout: '+expression+' '+await evaluate("document.querySelector('.nic-editor-feedback')?.textContent||document.querySelector('#action-error').textContent"));};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const fill=(name,value)=>evaluate(`(()=>{const input=document.querySelector(${JSON.stringify('[name="'+name+'"]')});input.value=${JSON.stringify(value)};input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));})()`);
const viewport=async(width,height)=>{await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=650});await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
const screenshot=async name=>fs.writeFile(`artifacts/network-editor/${name}.png`,Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const instance=()=>evaluate("freshResource('instance','lab-web',{host,project}).then(result=>result.data)");
async function openRow(key='eth0'){
  await evaluate(`(()=>{const row=[...document.querySelectorAll('.nic-table tbody tr')].find(row=>row.cells[0].textContent===${JSON.stringify(key)});if(!row)throw new Error('NIC row missing');row.click();})()`);
  await wait("document.querySelector('#editor-dialog').open&&!!document.querySelector('.nic-editor-form')");
}
async function save(){
  assert.equal(await evaluate("document.querySelector('.nic-editor-form button[type=submit]').disabled"),false);
  await evaluate("document.querySelector('.nic-editor-form').requestSubmit()");
  await wait("!document.querySelector('#editor-dialog').open&&!document.querySelector('#content').hasAttribute('aria-busy')");
  assert.equal(await evaluate("document.querySelector('#confirm').open"),false,'OK applies directly without a second edit dialog.');
}
async function navigate(){
  await evaluate("history.replaceState(null,'','#instance/lab-web/network');render()");
  await wait("!!document.querySelector('.nic-table')&&!document.querySelector('#content').hasAttribute('aria-busy')");
}
try{
  await fs.mkdir('artifacts/network-editor',{recursive:true});await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await viewport(1920,940);
  await call('Page.navigate',{url:origin});await wait("typeof api==='function'");
  if(await evaluate("document.querySelector('#shell').hidden"))await evaluate("document.querySelector('#login-username').value='test';document.querySelector('#login-password').value='local-browser-fixture';document.querySelector('#login-form').requestSubmit()");
  await wait("!document.querySelector('#shell').hidden&&!document.querySelector('#content').hasAttribute('aria-busy')");
  assert.equal(await evaluate('session.demo'),true,'Never mutate a real Incus host.');
  await navigate();
  const before=await instance();
  assert.equal(await evaluate("document.querySelectorAll('#content table').length"),1);
  assert.equal(await evaluate("document.querySelectorAll('.nic-table tbody button').length"),0);
  assert.deepEqual(await evaluate("[...document.querySelectorAll('.nic-grid-toolbar button')].map(button=>button.textContent)"),['Adicionar','Remover','Editar']);
  assert.equal(await evaluate("document.querySelector('[data-action=nic-edit]').disabled"),true);
  await screenshot('grid-dark-1920');
  const point=await evaluate("(()=>{const r=document.querySelector('.nic-table tbody tr').getBoundingClientRect();return {x:r.left+80,y:r.top+r.height/2};})()");
  await call('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});
  await wait("document.querySelector('#editor-dialog').open");
  assert.equal(await evaluate("document.querySelector('#editor-title').textContent"),'Editar: Dispositivo de Rede (veth)');
  assert.equal(await evaluate("document.querySelector('.nic-advanced').hidden"),true);
  assert.equal(await evaluate("document.querySelector('.nic-editor-form button[type=submit]').disabled"),true);
  assert.equal(Math.round(await evaluate("document.querySelector('#editor-dialog').getBoundingClientRect().width")),600);
  await screenshot('editor-dark-1920');
  await fill('name','eth9');assert.equal(await evaluate("document.querySelector('.nic-editor-form button[type=submit]').disabled"),false);
  await click('#reset-editor');assert.equal(await evaluate("document.querySelector('[name=name]').value"),'eth0');
  assert.equal(await evaluate("document.querySelector('.nic-editor-form button[type=submit]').disabled"),true);
  await click('[name=ipv4mode][value=static]');await fill('ipv4.address','10.100.0.30/24');await click('[name=firewall]');
  assert.equal(await evaluate("document.querySelector('[name=\"ipv4.gateway\"]').readOnly"),true);
  assert.equal(await evaluate("document.querySelector('[name=\"ipv4.gateway\"]').value"),'10.100.0.1');
  const beforeSave=mutations;await save();assert.equal(mutations,beforeSave+1);
  let current=await instance();assert.equal(current.devices.eth0['ipv4.address'],'10.100.0.30');assert.equal(current.devices.eth0['security.ipv4_filtering'],'true');assert.deepEqual(current.profiles,before.profiles);
  await openRow();await click('[name=advanced]');await fill('mtu','1400');await fill('rate','12.5');await click('[name=disconnected]');await screenshot('editor-advanced-dark');await save();
  current=await instance();assert.equal(current.devices.eth0.type,'none');assert.equal(current._disconnected_nics.eth0.mtu,'1400');assert.equal(current._disconnected_nics.eth0['limits.max'],'100000kbit');
  await openRow();await click('[name=advanced]');assert.equal(await evaluate("document.querySelector('[name=disconnected]').checked"),true);await click('[name=disconnected]');await save();
  current=await instance();assert.equal(current.devices.eth0.parent,'labbr0');assert.equal(current.devices.eth0['ipv4.address'],'10.100.0.30');assert.deepEqual(current._disconnected_nics,{});
  await openRow();await click('[name=firewall]');await fill('vlan','42');await save();
  current=await instance();assert.equal(current.devices.eth0.vlan,'42');assert.equal(current.devices.eth0['security.ipv4_filtering'],'false');
  await openRow();await click('[name=advanced]');await click('.nic-restore');await wait("document.querySelector('#confirm').open");
  await evaluate("document.querySelector('#confirmation').value='lab-web';document.querySelector('#action-form').requestSubmit()");
  await wait("!document.querySelector('#confirm').open&&!document.querySelector('#content').hasAttribute('aria-busy')");
  assert.equal((await instance()).devices.eth0,undefined);
  await click('[data-action=nic-add]');await wait("document.querySelector('#editor-dialog').open");await save();
  assert.equal((await instance()).devices.eth1.name,'eth1');
  await openRow('eth1');await click('#close-editor');await click('[data-action=nic-delete]');await wait("document.querySelector('#confirm').open");
  await evaluate("document.querySelector('#confirmation').value='lab-web';document.querySelector('#action-form').requestSubmit()");await wait("!document.querySelector('#confirm').open&&!document.querySelector('#content').hasAttribute('aria-busy')");
  assert.equal((await instance()).devices.eth1,undefined);
  await evaluate("document.querySelector('.nic-table tbody tr').focus();document.querySelector('.nic-table tbody tr').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))");
  await wait("document.querySelector('#editor-dialog').open");await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await wait("!document.querySelector('#editor-dialog').open");
  await evaluate('session.read_only=true');await navigate();assert.equal(await evaluate("[...document.querySelectorAll('.nic-grid-toolbar button')].every(button=>button.disabled)"),true);
  await openRow();assert.equal(await evaluate("document.querySelector('.nic-editor-fields').disabled"),true);
  const beforeReadonly=mutations;await evaluate("document.querySelector('.nic-editor-form').requestSubmit()");assert.equal(mutations,beforeReadonly);await click('#close-editor');await evaluate('session.read_only=false');
  let layouts=0;
  for(const theme of ['dark','light'])for(const [width,height]of [[1920,940],[1440,900],[960,480],[650,844],[390,844],[320,480]]){
    await viewport(width,height);await evaluate(`applyTheme('${theme}')`);await navigate();await openRow();
    const bounds=await evaluate("(()=>{const r=document.querySelector('#editor-dialog').getBoundingClientRect(),main=document.querySelector('main'),form=document.querySelector('.nic-editor-form');return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,pageOverflow:document.documentElement.scrollWidth>innerWidth+1,mainOverflow:main.scrollWidth>main.clientWidth+1,formOverflow:form.scrollWidth>form.clientWidth+1};})()");
    assert.ok(bounds.left>=0&&bounds.right<=width&&bounds.top>=0&&bounds.bottom<=height&&!bounds.pageOverflow&&!bounds.mainOverflow&&!bounds.formOverflow,JSON.stringify({theme,width,height,bounds}));
    if([1920,320].includes(width))await screenshot(`editor-${theme}-${width}`);
    await click('#close-editor');layouts++;
  }
  assert.equal(errors.length,0,JSON.stringify(errors));
  const result={singleGrid:true,noRowActionButtons:true,singleClickEditor:true,keyboard:true,twoColumns:true,reset:true,staticReservation:true,firewall:true,disconnectReconnect:true,mtu:true,bandwidth:true,vlan:true,profileRestore:true,addRemove:true,readonly:true,layouts,jsErrors:errors.length};
  await fs.writeFile('artifacts/network-editor/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){await screenshot('failure');throw error;}finally{socket.close();}
