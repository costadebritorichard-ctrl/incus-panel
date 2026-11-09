// Isolated DOM regression against tests/create_fixture.py; never contacts a real host.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../artifacts/qa/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom');
const origin='http://127.0.0.1:8082';
let cookie='',expire=false,writes=0,shortLived=false,firstObserved=0,observations=0,backupDates=false;
const errors=[],virtualConsole=new VirtualConsole();
virtualConsole.on('jsdomError',error=>errors.push(error.message));
const dom=await JSDOM.fromURL(origin,{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(window){
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  window.fetch=async(path,options={})=>{
    if(path==='/api/action')writes++;
    if(backupDates&&new URL(path,origin).searchParams.get('resource')==='backups')return new Response(JSON.stringify({data:[
      {name:'without-expiry',created_at:'2026-11-08T21:00:00Z',expires_at:'0001-01-01T00:00:00Z'},
      {name:'future-expiry',created_at:'2026-11-08T21:00:00Z',expires_at:'2027-01-01T00:00:00Z'},
    ]}),{headers:{'Content-Type':'application/json'}});
    if(expire&&String(path).includes('resource=operation&'))return new Response(JSON.stringify({error:'Incus: Operation not found'}),{status:404,headers:{'Content-Type':'application/json'}});
    if(shortLived&&String(path).includes('resource=operation&')){
      observations++;
      if(!firstObserved){firstObserved=Date.now();return new Response(JSON.stringify({data:{status:'Running',status_code:103}}),{headers:{'Content-Type':'application/json'}});}
      if(Date.now()-firstObserved>=5000)return new Response(JSON.stringify({error:'Incus: Operation not found'}),{status:404,headers:{'Content-Type':'application/json'}});
    }
    const response=await fetch(new URL(path,origin),{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),...(options.method==='POST'?{Origin:origin}:{})}});
    const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
    return response;
  };
}});
const w=dom.window,d=w.document,$=selector=>d.querySelector(selector);
async function wait(check){for(let i=0;i<200;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,25));}throw new Error('Timeout: '+$('#action-error').textContent);}
try{
  await wait(()=>typeof w.api==='function');
  $('#login-username').value='test';$('#login-password').value='local-browser-fixture';$('#login-form').requestSubmit();
  await wait(()=>!$('#shell').hidden&&!$('#content').hasAttribute('aria-busy'));
  w.location.hash='instance/lab-web/summary';await wait(()=>$('#title').textContent.includes('lab-web')&&!$('#content').hasAttribute('aria-busy'));
  // The daemon's terminal result exists for less than the old polling interval.
  shortLived=true;
  w.openAction('restart','lab-web');$('#action-form').requestSubmit();
  await wait(()=>!$('#confirm').open);
  assert.equal(observations,2);
  assert.ok(Date.now()-firstObserved<5000);
  assert.equal(w.eval('[...tasks.values()].find(item=>item.action==="restart").status_code'),200);
  shortLived=false;
  // The real fixture applies stop; only the subsequent operation lookup expires.
  expire=true;
  w.openAction('stop','lab-web');assert.equal($('#feedback').hidden,true,'A previous success notice must not describe the new operation.');$('#action-form').requestSubmit();
  await wait(()=>$('#action-error').textContent.includes('Operation not found'));
  await wait(()=>d.querySelector('#resource-toolbar')?.textContent.includes('Parado'));
  assert.match($('#task-log').textContent,/Resultado incerto/,'An expired operation cannot remain Running.');
  const task=w.eval('[...tasks.values()].find(item=>item.action==="stop")');
  assert.equal(task.uncertain,true);
  assert.equal(task.status,'Resultado incerto','Missing operation is not proof of success.');
  assert.match(task.err,/Operation not found/);
  assert.equal($('#submit-action').disabled,true,'Accepted mutations cannot be resubmitted after an observation error.');
  $('#action-form').requestSubmit();await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(writes,2);
  $('#close-action').click();assert.equal($('#confirm').open,false,'The error dialog remains closable.');
  backupDates=true;expire=false;
  w.location.hash='instance/lab-web/backups';await wait(()=>$('#content').textContent.includes('without-expiry'));
  let rows=[...d.querySelectorAll('#content tbody tr')];
  assert.equal(rows.find(row=>row.textContent.includes('without-expiry')).cells[2].textContent,'Sem expiração');
  assert.equal(rows.find(row=>row.textContent.includes('future-expiry')).cells[2].textContent,w.eval('date("2027-01-01T00:00:00Z")'));
  w.location.hash='backups';await wait(()=>$('#content').textContent.includes('without-expiry')&&d.querySelector('#content tbody tr')?.cells.length===5);
  rows=[...d.querySelectorAll('#content tbody tr')];
  assert.ok(rows.filter(row=>row.textContent.includes('without-expiry')).every(row=>row.cells[3].textContent==='Sem expiração'));
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({shortRetentionWindow:true,expiredOperation:'uncertain',originalErrorPreserved:true,stateRefreshed:true,noDuplicateWrite:true,staleSuccessCleared:true,backupExpiryDates:true,domErrors:0}));
}finally{dom.window.close();}
