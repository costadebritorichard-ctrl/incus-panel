// DOM regression against tests/create_fixture.py. No resource mutations.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../artifacts/qa/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom');
const origin=process.env.PANEL_ORIGIN||'http://127.0.0.1:8082';
assert.ok(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
let cookie='',writes=0;
const errors=[],virtualConsole=new VirtualConsole();
virtualConsole.on('jsdomError',error=>errors.push(error.message));
const dom=await JSDOM.fromURL(origin,{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(window){
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  window.fetch=async(path,options={})=>{
    if(path==='/api/action')writes++;
    const response=await fetch(new URL(path,origin),{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),...(options.method==='POST'?{Origin:origin}:{})}});
    const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
    return response;
  };
}});
const w=dom.window,d=w.document;
const wait=async predicate=>{for(let count=0;count<500;count++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,20));}throw new Error('Timeout: '+d.querySelector('#content').textContent);};
const navigate=async hash=>{const before=w.eval('generation');w.location.hash=hash;await wait(()=>w.eval('generation')>before&&!d.querySelector('#content').hasAttribute('aria-busy'));};
const close=()=>{d.querySelector('#close-editor').click();assert.equal(d.querySelector('#editor-dialog').open,false);assert.equal(d.querySelector('#editor-content').childElementCount,0);};
try{
  await wait(()=>typeof w.api==='function');
  d.querySelector('[name=username]').value='test';d.querySelector('[name=password]').value='local-browser-fixture';d.querySelector('#login-form').requestSubmit();
  await wait(()=>!d.querySelector('#shell').hidden&&!d.querySelector('#content').hasAttribute('aria-busy'));
  assert.equal(w.eval('session.demo'),true);
  const routes=['instance/lab-web/resources','instance/lab-web/devices','profiles','projects','networks','server/network'];
  for(const route of routes){
    await navigate(route);
    assert.equal(d.querySelector('#content details'),null,'No inline expanders on '+route);
    const grid=d.querySelector('.properties-grid'),button=grid.querySelector('[data-action=resource-properties]'),row=grid.querySelector('tbody tr');
    assert.equal(button.disabled,true);
    assert.equal(row.querySelector('table,details,button'),null,'Rows contain compact values on '+route);
    const itemName=row.cells[0].textContent,markup=grid.innerHTML;
    row.click();assert.equal(button.disabled,false);assert.equal(row.getAttribute('aria-selected'),'true');
    button.click();assert.equal(d.querySelector('#editor-dialog').open,true);assert.match(d.querySelector('#editor-title').textContent,new RegExp(itemName));
    assert.equal(d.querySelector('#editor-dialog').dataset.editorType,'properties');assert.equal(d.querySelector('#editor-content form'),null);
    close();
    const selectedMarkup=grid.innerHTML;
    row.dispatchEvent(new w.MouseEvent('dblclick',{bubbles:true}));assert.equal(d.querySelector('#editor-dialog').open,true);
    d.querySelector('.properties-view .dialog-actions button').click();assert.equal(d.querySelector('#editor-dialog').open,false);
    assert.equal(grid.innerHTML,selectedMarkup,'Opening properties does not change the table on '+route);
    assert.notEqual(markup,selectedMarkup,'Selection remains visible');
    row.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));assert.equal(d.querySelector('#editor-dialog').open,true);
    d.querySelector('#editor-dialog').dispatchEvent(new w.Event('cancel',{cancelable:true}));assert.equal(d.querySelector('#editor-dialog').open,false);
  }
  await navigate('network/labbr0/summary');d.querySelector('[data-action=resource-properties]').click();
  assert.match(d.querySelector('#editor-content').textContent,/ipv4.address/);close();
  await navigate('instance/lab-web/options');d.querySelector('[data-action=technical-properties]').click();
  assert.match(d.querySelector('#editor-content').textContent,/Configuração local/);assert.match(d.querySelector('#editor-content').textContent,/Configuração efetiva, incluindo perfis/);
  await navigate('projects');assert.equal(d.querySelector('#editor-dialog').open,false,'Navigation closes properties from the previous resource');
  // Sorting and pagination must keep actions bound to the displayed record.
  w.eval(`window.reviewItems=Array.from({length:30},(_,index)=>({name:'device-'+String(index).padStart(2,'0'),config:{type:'disk',path:'/'+index,'user.note':'<script>unsafe</script>\\n'+'x'.repeat(1500)}}));
    document.querySelector('#content').replaceChildren(propertiesGrid('Fixture',['NOME','CONFIGURAÇÃO'],window.reviewItems,item=>[item.name,configurationSummary(item.config)],item=>openProperties(item.name,()=>propertyTable(item.config))));`);
  const grid=d.querySelector('.properties-grid');
  grid.querySelector('th button').click();grid.querySelector('th button').click();
  let row=grid.querySelector('tbody tr');assert.equal(row.cells[0].textContent,'device-29');
  row.dispatchEvent(new w.KeyboardEvent('keydown',{key:' ',bubbles:true,cancelable:true}));grid.querySelector('[data-action=resource-properties]').click();
  assert.equal(d.querySelector('#editor-title').textContent,'device-29');assert.match(d.querySelector('#editor-content').textContent,/\/29/);
  assert.equal(d.querySelector('#editor-content script'),null,'Values remain plain text');assert.ok(d.querySelector('#editor-content').textContent.includes('x'.repeat(1500)),'The dialog preserves complete values');close();
  [...grid.querySelectorAll('.pagination button')].find(button=>button.textContent==='Próxima').click();
  row=grid.querySelector('tbody tr');assert.equal(row.cells[0].textContent,'device-04');
  row.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  grid.querySelector('[data-action=resource-properties]').click();assert.equal(d.querySelector('#editor-title').textContent,'device-03');close();
  // Empty inventories cannot open a nonexistent resource.
  w.eval(`document.querySelector('#content').replaceChildren(propertiesGrid('Vazio',['NOME'],[],item=>[item.name],()=>{throw new Error('Empty selection');}));`);
  assert.equal(d.querySelector('[data-action=resource-properties]').disabled,true);
  // Profile devices are separate sections; project features stay available.
  w.openResourceProperties({name:'inherited',config:{},devices:{eth0:{type:'nic',network:'labbr0'},root:{type:'disk',path:'/'}}},'profiles');
  assert.match(d.querySelector('#editor-content').textContent,/Dispositivo: eth0/);assert.match(d.querySelector('#editor-content').textContent,/Dispositivo: root/);
  assert.equal(d.querySelector('#editor-content table table'),null);close();
  w.openResourceProperties({name:'project',features:{profiles:true}},'projects');assert.match(d.querySelector('#editor-content').textContent,/Recursos do projeto/);close();
  // Task rows retain progress, while metadata opens in the existing task viewer.
  const operation={id:'properties-fixture',description:'Fixture',status:'Success',status_code:200,metadata:{download_progress:'75%',source:'fixture'}};
  w.eval('window.savedRead=read;read=async resource=>resource===\'operations\'?{data:[window.reviewOperation]}:{data:{}};');
  w.reviewOperation=operation;w.eval('tasks.clear()');
  d.querySelector('#content').replaceChildren(await w.taskView(w.eval('({host,project})')));
  assert.match(d.querySelector('#content').textContent,/75%/);d.querySelector('.properties-grid tbody tr').click();d.querySelector('[data-action=resource-properties]').click();
  assert.equal(d.querySelector('#task-detail').open,true);assert.match(d.querySelector('#task-detail-content').textContent,/fixture/);d.querySelector('#close-task-detail').click();
  w.eval('read=window.savedRead');
  assert.equal(writes,0,'Property inspection never sends resource mutations');assert.deepEqual(errors,[]);
  console.log(JSON.stringify({routes:routes.length,selection:true,doubleClick:true,keyboard:true,sortAndPagination:true,emptyInventory:true,fullValuesAndEscaping:true,profileDevices:true,projectFeatures:true,taskMetadata:true,resourceWrites:writes,domErrors:errors.length}));
}finally{dom.window.close();}
