// Browser QA against tests/console_fixture.py: real relay, echo-only PTY double.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const origin='http://127.0.0.1:8084';
const tabs=await(await fetch(`http://127.0.0.1:${process.env.CDP_PORT||9223}/json/list`)).json();
const page=tabs.find(tab=>tab.type==='page'&&(tab.url==='about:blank'||tab.url.startsWith(origin)));
assert.ok(page,'An isolated QA tab is required.');
const socket=new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
let seq=0;const pending=new Map(),errors=[],frames=[],requests=[];
socket.onmessage=event=>{const data=JSON.parse(event.data);if(data.id){const request=pending.get(data.id);pending.delete(data.id);data.error?request.reject(new Error(data.error.message)):request.resolve(data.result);}if(data.method==='Runtime.exceptionThrown')errors.push(data.params.exceptionDetails);if(data.method==='Network.webSocketFrameSent'){try{frames.push(JSON.parse(data.params.response.payloadData));}catch{}}if(data.method==='Network.requestWillBeSent')requests.push(data.params.request.url);};
const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});
const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw new Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
const wait=async expression=>{for(let count=0;count<200;count++){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Timeout: '+expression+' '+await evaluate("document.querySelector('#terminal-status')?.textContent"));};
const screenshot=async name=>fs.writeFile(`artifacts/console/${name}.png`,Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
const viewport=async(width,height)=>{await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:width<=650});await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
try{
  await fs.mkdir('artifacts/console',{recursive:true});await call('Runtime.enable');await call('Network.enable');await call('Page.enable');await viewport(1440,900);
  await call('Page.navigate',{url:origin});await wait("typeof api==='function'");
  if(await evaluate("document.querySelector('#shell').hidden"))await evaluate("document.querySelector('#login-username').value='test';document.querySelector('#login-password').value='local-console-fixture';document.querySelector('#login-form').requestSubmit()");
  await wait("!document.querySelector('#shell').hidden&&!document.querySelector('#content').hasAttribute('aria-busy')");
  assert.equal(await evaluate('session.demo'),true);
  // Enable the real console view only after confirming the isolated echo fixture.
  await evaluate('session.demo=false');
  await evaluate("location.hash='#instance/lab-web/console'");await wait('terminalState?.connected&&terminalState.streaming===true');
  const inputFrames=()=>frames.filter(frame=>frame.type==='input');
  const before=inputFrames().length;
  assert.equal(await evaluate("document.querySelector('.console-command-form')===null"),true);
  await evaluate('terminalState.term.focus()');
  for(const key of 'pwd'){
    await call('Input.dispatchKeyEvent',{type:'keyDown',key,code:'Key'+key.toUpperCase(),windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0),text:key});
    await call('Input.dispatchKeyEvent',{type:'keyUp',key,code:'Key'+key.toUpperCase(),windowsVirtualKeyCode:key.toUpperCase().charCodeAt(0)});
  }
  for(let count=0;count<100&&inputFrames().length===before;count++)await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(inputFrames().slice(before).map(frame=>frame.text).join(''),'pwd','Typing in the terminal is sent directly.');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r'});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
  await wait('terminalState.pending.length===0');await new Promise(resolve=>setTimeout(resolve,30));
  assert.equal(inputFrames().slice(before).map(frame=>frame.text).join(''),'pwd\r');
  assert.equal(requests.some(url=>url.includes('/api/console/input')||url.includes('/api/console/read')),false,'A healthy stream must not poll or send HTTP keystrokes.');
  const controls='pwd\r\x03\t\x1b[A';
  await evaluate("window.consoleReceived='';window.originalTerminalWrite=terminalState.term.write.bind(terminalState.term);terminalState.term.write=(text,callback)=>{window.consoleReceived+=text;originalTerminalWrite(text,callback);};terminalState.enqueue("+JSON.stringify(controls)+",true)");
  await wait("window.consoleReceived.includes('pwd')");
  assert.equal(inputFrames().at(-1).text,controls);
  const unicode='a'.repeat(4095)+'🙂'+'b'.repeat(4096);
  const unicodeBefore=inputFrames().length;
  await evaluate(`terminalState.enqueue(${JSON.stringify(unicode)},true)`);
  await wait('terminalState.pending.length===0');
  await new Promise(resolve=>setTimeout(resolve,50));
  assert.equal(inputFrames().slice(unicodeBefore).map(frame=>frame.text).join(''),unicode,'Chunking must preserve Unicode code points.');
  const samples=await evaluate(`(async()=>{const samples=[];for(let index=0;index<10;index++){const marker='LATENCY_'+index+'_'+Date.now();const started=performance.now();await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Echo timeout')),3000);const original=terminalState.term.write.bind(terminalState.term);terminalState.term.write=(text,callback)=>original(text,()=>{callback?.();if(text.includes(marker)){clearTimeout(timer);terminalState.term.write=original;samples.push(performance.now()-started);resolve();}});terminalState.enqueue(marker+'\\r',true);});}return samples;})()`);
  for(const theme of ['dark','light'])for(const width of [1440,390,320]){
    await viewport(width,width<=390?650:900);await evaluate(`applyTheme('${theme}')`);
    const bounds=await evaluate("(()=>{const r=document.querySelector('.terminal-host').getBoundingClientRect();return {left:r.left,right:r.right,height:r.height,overflow:document.documentElement.scrollWidth>innerWidth};})()");
    assert.ok(bounds.height>0&&bounds.left>=0&&bounds.right<=width+1&&!bounds.overflow,JSON.stringify({theme,width,bounds}));await screenshot(`${theme}-${width}`);
  }
  await viewport(1440,900);
  await evaluate("window.savedWebSocket=window.WebSocket;window.WebSocket=function(){throw new Error('Blocked proxy fixture');};startTerminal('lab-web')");
  await wait('terminalState?.connected&&!terminalState.streaming');
  const beforeFallback=requests.filter(url=>url.endsWith('/api/console/input')).length;
  await evaluate("terminalState.enqueue('fallback-command\\r',true)");
  await wait("terminalState.pending.length===0&&!terminalState.sending");
  assert.equal(requests.filter(url=>url.endsWith('/api/console/input')).length,beforeFallback+1);
  await evaluate('window.WebSocket=window.savedWebSocket;closeConsole()');
  assert.equal(await evaluate('consoleId===null&&terminalState===null'),true);
  assert.equal(errors.length,0,JSON.stringify(errors));
  const sorted=[...samples].sort((a,b)=>a-b),result={transport:'real local WebSocket with echo-only PTY double',directTerminalKeyboard:true,separateCommandBar:false,httpKeystrokeRequestsInStreamingMode:0,unicodePreserved:true,httpFallback:true,layouts:6,renderedEchoMs:{samples:samples.map(value=>+value.toFixed(2)),median:+sorted[5].toFixed(2),max:+Math.max(...samples).toFixed(2)},jsErrors:errors.length};
  await fs.writeFile('artifacts/console/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{socket.close();}
