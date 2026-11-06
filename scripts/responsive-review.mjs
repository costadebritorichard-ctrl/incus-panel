// Visual regression against an isolated Chrome and the explicit local demo fixture.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin=process.env.PANEL_ORIGIN||'http://127.0.0.1:8082';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname),'Use a local demo fixture.');
const tabs=await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT||9223}/json/list`)).json();
const page=tabs.find(tab=>tab.type==='page'&&(tab.url.startsWith(origin)||tab.url==='about:blank'));
assert.ok(page,'An isolated review tab is required.');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let seq=0;const pending=new Map(),errors=[],results=[];
socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const item=pending.get(data.id);pending.delete(data.id);data.error?item.reject(new Error(data.error.message)):item.resolve(data.result);}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=async expression=>{for(let i=0;i<200;i++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,50));}throw new Error('Timeout: '+expression);};
const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
const viewport=async(width,height)=>{await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=650});await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
// Pace the large matrix below Chrome's navigation flood protection threshold.
// Assert the actual route so a throttled history update cannot create a false pass.
const navigate=async route=>{await new Promise(resolve=>setTimeout(resolve,100));const before=await evaluate('generation');await evaluate(`history.replaceState(null,'',${JSON.stringify('#'+route)});render()`);assert.equal(await evaluate('location.hash'),'#'+route);await wait(`generation>${before}&&!document.querySelector('#content').hasAttribute('aria-busy')`);};
const screenshot=async name=>fs.writeFile(`artifacts/review/${name}.png`,Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const drag=async(selector,x,y)=>{
  const start=await evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',...start});await call('Input.dispatchMouseEvent',{type:'mousePressed',...start,button:'left',clickCount:1});
  await call('Input.dispatchMouseEvent',{type:'mouseMoved',x:x??start.x,y:y??start.y,button:'left',buttons:1});await call('Input.dispatchMouseEvent',{type:'mouseReleased',x:x??start.x,y:y??start.y,button:'left',clickCount:1});
};
const routes=['overview','search','datacenter-notes','cluster','settings','storage','backups','permissions','networks','instances','images','profiles','projects','volumes','tasks','alerts','users','server/summary','server/search','server/notes','server/system','server/network','server/storage','server/tasks','storage/lab/summary','storage/lab/content','storage/lab/permissions','network/labbr0/summary','network/labbr0/permissions',...['summary','resources','devices','network','dns','options','history','backups','snapshots','permissions','console'].map(tab=>'instance/lab-web/'+tab)];
const viewports=[1920,1440,1200,1101,1100,1024,960,850,768,651,650,640,480,390,360,320].map(width=>[width,width<=650?844:900]).concat([[320,480],[960,480]]);
try{
  await fs.mkdir('artifacts/review',{recursive:true});
  await call('Runtime.enable');await call('Page.enable');await viewport(960,900);await call('Page.navigate',{url:origin});await wait("typeof api==='function'");
  if(await evaluate("document.querySelector('#shell').hidden")){
    await screenshot('login-dark-960');await viewport(390,844);await screenshot('login-dark-390');
    await evaluate("document.querySelector('#login-username').value='test';document.querySelector('#login-password').value='local-browser-fixture';document.querySelector('#login-form').requestSubmit()");
  }
  await wait("!document.querySelector('#shell').hidden&&!document.querySelector('#content').hasAttribute('aria-busy')");
  assert.equal(await evaluate('session.demo'),true);
  await viewport(1440,900);await drag('.tree-splitter',370,null);
  assert.equal(await evaluate("Math.round(document.querySelector('#sidebar').getBoundingClientRect().width)"),370);
  await evaluate('setTreeWidth(306)');await drag('.task-splitter',null,900-18-100);
  assert.equal(await evaluate("Math.round(document.querySelector('#task-log').getBoundingClientRect().height)"),100);
  await evaluate('setTaskHeight(142)');
  for(const theme of ['light','dark']){
    await evaluate(`applyTheme(${JSON.stringify(theme)})`);
    for(const [width,height]of viewports){
      await viewport(width,height);
      for(const route of routes){
        await navigate(route);
        assert.doesNotMatch(await evaluate("document.querySelector('#content').textContent"),/Falha interna|Página não encontrada|Não foi possível atualizar/);
        const layout=await evaluate(`(()=>{const main=document.querySelector('main'),rect=main.getBoundingClientRect();return {pageOverflow:document.documentElement.scrollWidth>innerWidth+1,left:rect.left,right:rect.right,width:rect.width,height:rect.height,mainOverflow:main.scrollWidth>main.clientWidth+1,backdrop:document.querySelector('#menu-backdrop').hidden,menu:menuOpen,content:document.querySelector('#content').textContent.length};})()`);
        assert.equal(layout.pageOverflow,false,`${theme} ${width}x${height} ${route}: page overflow`);
        assert.equal(layout.mainOverflow,false,`${theme} ${width}x${height} ${route}: content exceeds its own scroll containers`);
        assert.ok(layout.width>=150&&layout.height>=70,`${theme} ${width}x${height} ${route}: collapsed main pane ${JSON.stringify(layout)}`);
        assert.ok(layout.left>=0&&layout.right<=width+1,`${width} ${route}: main is outside the viewport`);
        assert.ok(layout.backdrop&&!layout.menu&&layout.content>0,`${width} ${route}: workspace unexpectedly covered`);
        results.push({theme,width,height,route,...layout});
        if((width===1440||width===390)&&height!==480)await screenshot(`screen-${theme}-${width}-${route.replaceAll('/','-')}`);
      }
      if(width===960&&height===900){
        await navigate('instance/lab-web/summary');await click('#menu-toggle');
        const overlay=await evaluate("({open:menuOpen,color:getComputedStyle(document.querySelector('#menu-backdrop')).backgroundColor,content:document.querySelector('#content').textContent.length,mainInert:document.querySelector('main').inert,sidebarInert:document.querySelector('#sidebar').inert})");
        assert.deepEqual(overlay,{open:true,color:'rgba(0, 0, 0, 0.2)',content:overlay.content,mainInert:true,sidebarInert:false});assert.ok(overlay.content>0);
        await screenshot(`menu-open-${theme}-960`);await viewport(1440,900);await wait('!menuOpen');
        assert.equal(await evaluate("document.querySelector('#menu-backdrop').hidden&&!document.querySelector('main').inert&&!document.querySelector('#resource-toolbar').inert"),true);
        await viewport(width,height);await click('#menu-toggle');await click('#menu-backdrop');assert.equal(await evaluate('menuOpen'),false);
      }
      console.log(`${theme} ${width}x${height}: ${routes.length} layouts verified`);
    }
  }
  await viewport(320,480);await navigate('networks');await click('[data-action=network-create]');
  const editor=await evaluate("(()=>{const d=document.querySelector('#editor-dialog'),r=d.getBoundingClientRect();return {open:d.open,left:r.left,right:r.right,top:r.top,bottom:r.bottom,overflow:d.scrollWidth>d.clientWidth+1}})()");
  assert.ok(editor.open&&editor.left>=0&&editor.right<=320&&editor.top>=0&&editor.bottom<=480&&!editor.overflow,JSON.stringify(editor));
  await screenshot('bridge-editor-dark-320');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  assert.equal(await evaluate("!document.querySelector('#editor-dialog').open&&!document.querySelector('#editor-content').childElementCount"),true);
  await navigate('instance/lab-web/options');await click('[data-action=instance-edit]');await screenshot('options-editor-dark-320');await click('#close-editor');
  await click('#create-ct');await wait("document.querySelector('#create-dialog').open");
  assert.equal(await evaluate("(()=>{const d=document.querySelector('#create-dialog');return d.scrollWidth>d.clientWidth+1})()"),false);
  await screenshot('wizard-dark-320');await click('#close-create');
  // User management has persistent accounts in production. Only its read-only UI
  // is exercised here with an explicit local protocol double, never real accounts.
  await evaluate(`window.reviewOriginalFetch=window.fetch;session.manage_users=true;window.fetch=(path,options={})=>path==='/api/users'?Promise.resolve(new Response(JSON.stringify({users:[{username:'test',role:'administrador',host_metrics:true,scopes:{demo:['laboratorio']}},{username:'aluno',role:'observador',host_metrics:false,scopes:{demo:['laboratorio']}}]}),{status:200,headers:{'Content-Type':'application/json'}})):window.reviewOriginalFetch(path,options)`);
  await viewport(1440,900);await navigate('users');await screenshot('users-ui-fixture-dark-1440');
  await evaluate("[...document.querySelectorAll('#content tbody tr')].find(row=>row.textContent.includes('aluno')).querySelector('button').click()");
  assert.equal(await evaluate("document.querySelector('#editor-dialog').open&&document.querySelector('#editor-dialog [name=role]').value==='observador'"),true);
  await viewport(320,480);await screenshot('users-editor-ui-fixture-dark-320');await click('#close-editor');
  await evaluate('window.fetch=window.reviewOriginalFetch;session.manage_users=false;');
  assert.deepEqual(errors,[]);
  await fs.writeFile('artifacts/review/responsive-results.json',JSON.stringify({routes:routes.length,viewports,themes:2,checks:results.length,opaqueBackdropRegression:true,menuResizeRecovery:true,smallWindowEditors:true,treeAndTaskResizing:true,editorEscapeCleanup:true,errors,results},null,2));
  console.log(JSON.stringify({routes:routes.length,viewports:viewports.length,themes:2,checks:results.length,opaqueBackdropRegression:true,menuResizeRecovery:true,smallWindowEditors:true,treeAndTaskResizing:true,editorEscapeCleanup:true,jsErrors:errors.length,artifacts:'artifacts/review'}));
}finally{socket.close();}
