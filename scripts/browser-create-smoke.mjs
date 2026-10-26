// Requer fixture tests/create_fixture.py e Edge/Chromium com CDP em 9223.
import assert from 'node:assert/strict';
const tabs=await (await fetch('http://127.0.0.1:9223/json/list')).json();
const socket=new WebSocket(tabs.find(t=>t.type==='page').webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let seq=0;const pending=new Map();const errors=[];
socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const item=pending.get(data.id);pending.delete(data.id);data.error?item.reject(new Error(data.error.message)):item.resolve(data.result);}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text);};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=async expression=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Tempo excedido: '+expression);};
try{
  await call('Runtime.enable');await call('Page.enable');
  await call('Page.navigate',{url:'http://127.0.0.1:8082/'});
  await wait("!!document.querySelector('#login-form')");
  await evaluate("document.querySelector('[name=username]').value='test';document.querySelector('[name=password]').value='local-browser-fixture';document.querySelector('#login-form').requestSubmit()");
  await wait("!document.querySelector('#shell').hidden");
  assert.equal(await evaluate('session.low_resource'),true);
  assert.equal(await evaluate('timer===undefined'),true);
  await evaluate("location.hash='create'");
  await wait("!!document.querySelector('#content form select')");
  assert.equal(await evaluate("document.querySelectorAll('#content form select').length"),1);
  assert.equal(await evaluate("document.querySelectorAll('#content form input').length"),0);
  await evaluate("document.querySelector('#content form').requestSubmit()");
  await wait("document.querySelector('#content').textContent.includes('criado e em execução')");
  assert.equal(await evaluate("document.querySelector('#confirm').open"),false);
  const target=await evaluate("document.querySelector('#content a[href^=\"#instance/\"]').getAttribute('href').split('/')[1]");
  const instances=await evaluate("fetch('/api/read?host=demo&project=laboratorio&resource=instances').then(r=>r.json()).then(r=>r.data)");
  assert.equal(instances.find(i=>i.name===target)?.status,'Running');
  await evaluate("document.querySelector('#content form').requestSubmit()");
  await wait("document.querySelector('#content').textContent.includes('Imagem indisponível: erro de teste')");
  assert.equal(await evaluate("document.querySelector('#content form button').disabled"),false);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({oneImageSelect:true,noExtraInputs:true,noConfirmationDialog:true,createdAndRunning:target,asyncErrorVisible:true,jsErrors:0}));
}finally{socket.close();}
