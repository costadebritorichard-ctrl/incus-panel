// QA opcional: Chromium/Edge com --remote-debugging-port=9222 já iniciado.
// Credencial temporária da demonstração via variável de ambiente DEMO_PASSWORD.
import fs from 'node:fs/promises';
const tabs=await (await fetch('http://127.0.0.1:9222/json/list')).json();
const page=tabs.find(t=>t.type==='page');
if(!page)throw new Error('Navegador de QA indisponível');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let sequence=0;const pending=new Map();const errors=[];
socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const item=pending.get(data.id);pending.delete(data.id);if(data.error)item.reject(new Error(data.error.message));else item.resolve(data.result);}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails.text);};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.text);return result.result.value;};
const waitFor=async expression=>{for(let i=0;i<100;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}throw new Error('Tempo excedido: '+expression);};
try{
  await call('Runtime.enable');await call('Page.enable');
  await call('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate',{url:'http://127.0.0.1:8080/'});
  await waitFor("!!document.querySelector('#login-form')");
  await evaluate(`document.querySelector('[name=username]').value='demo';document.querySelector('[name=password]').value=${JSON.stringify(process.env.DEMO_PASSWORD)};document.querySelector('#login-form').requestSubmit()`);
  await waitFor("!document.querySelector('#shell').hidden && document.querySelector('#content').textContent.includes('host-demo')");
  const pages=['instances','images','storage','networks','profiles','projects','server','tasks','alerts','settings','instance/lab-web/summary','instance/lab-web/resources','instance/lab-web/devices','instance/lab-web/options','instance/lab-web/snapshots','instance/lab-web/backups','instance/lab-web/console','create','overview'];
  for(const route of pages){await evaluate(`location.hash=${JSON.stringify(route)}`);await waitFor("!document.querySelector('#content').hasAttribute('aria-busy')");await new Promise(r=>setTimeout(r,80));const text=await evaluate("document.querySelector('#content').textContent");if(/Falha interna|Página não encontrada/.test(text))throw new Error('Falha na rota '+route);}
  await fs.mkdir('artifacts',{recursive:true});
  await fs.writeFile('artifacts/desktop.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  await call('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await fs.writeFile('artifacts/mobile.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
  const overflow=await evaluate('document.documentElement.scrollWidth > innerWidth');
  if(overflow)throw new Error('Overflow horizontal no viewport móvel');
  await evaluate("document.querySelector('#logout').click()");await waitFor("!document.querySelector('#login').hidden");
  if(errors.length)throw new Error(errors.join('\n'));
  console.log(JSON.stringify({routes:pages.length,desktop:'1440x1000',mobile:'390x844',horizontalOverflow:false,jsErrors:errors.length,logout:true}));
}finally{socket.close();}
