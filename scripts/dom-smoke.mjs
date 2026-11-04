import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../artifacts/qa/package.json',import.meta.url));
const {JSDOM,VirtualConsole}=require('jsdom');
const origin=process.env.PANEL_ORIGIN||'http://127.0.0.1:8082';
const errors=[],requests=[];let cookie='';
const virtualConsole=new VirtualConsole();virtualConsole.on('jsdomError',e=>errors.push(e.message));
const dom=await JSDOM.fromURL(origin,{resources:'usable',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole,beforeParse(window){
  window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
  window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  window.matchMedia=()=>({matches:false,addEventListener(){},removeEventListener(){}});
  window.ResizeObserver=class{constructor(callback){this.callback=callback;window.lastResizeObserver=this;}observe(){}disconnect(){this.disconnected=true;}};
  window.fetch=async(path,options={})=>{
    requests.push(String(path));
    const response=await fetch(new URL(path,origin),{...options,headers:{...options.headers,...(cookie?{Cookie:cookie}:{}),...(options.method==='POST'?{Origin:origin}:{})}});
    const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];return response;
  };
}});
const w=dom.window,d=w.document;
const wait=async fn=>{for(let i=0;i<500;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,40));}throw new Error('Timeout: '+d.querySelector('#content')?.textContent+' '+d.querySelector('#login-error')?.textContent);};
const navigate=async hash=>{const previous=w.eval('generation');w.location.hash=hash;await wait(()=>w.eval('generation')>previous&&!d.querySelector('#content').hasAttribute('aria-busy'));};
try{
  await wait(()=>typeof w.api==='function');
  d.querySelector('[name=username]').value='test';d.querySelector('[name=password]').value='local-browser-fixture';d.querySelector('#login-form').requestSubmit();
  await wait(()=>!d.querySelector('#shell').hidden&&!d.querySelector('#content').hasAttribute('aria-busy'));
  assert.equal(w.eval('session.low_resource'),true);
  assert.equal(d.querySelectorAll('#tree a.leaf').length,2);
  const routes=['instances','images','storage','networks','profiles','projects','server','tasks','alerts','settings','instance/lab-web/summary','instance/lab-web/resources','instance/lab-web/network','instance/lab-web/dns','instance/lab-web/devices','instance/lab-web/options','instance/lab-web/snapshots','instance/lab-web/backups','instance/lab-web/console','overview'];
  for(const route of routes){await navigate(route);assert.doesNotMatch(d.querySelector('#content').textContent,/Falha interna|Página não encontrada|Não foi possível atualizar/,'Route '+route);}
  d.querySelector('#global-search').value='lab-web';d.querySelector('#global-search').dispatchEvent(new w.Event('input'));assert.equal(d.querySelectorAll('#tree a.leaf').length,1);
  d.querySelector('#global-search').value='';d.querySelector('#global-search').dispatchEvent(new w.Event('input'));
  d.querySelector('#task-log-toggle').click();assert.equal(d.querySelector('#task-log-toggle').getAttribute('aria-expanded'),'false');d.querySelector('#task-log-toggle').click();
  const beforeWizard=d.querySelector('#content').firstChild,originalWizardFetch=w.fetch;
  let releaseCatalog,creationCatalogReads=0;const catalogGate=new Promise(resolve=>{releaseCatalog=resolve;});
  w.fetch=async(path,options)=>{if(String(path).includes('resource=creation-images')){creationCatalogReads++;await catalogGate;}return originalWizardFetch(path,options);};
  d.querySelector('#create-ct').click();await wait(()=>creationCatalogReads===1);
  w.openCreateWizard();assert.equal(creationCatalogReads,1);
  assert.equal(d.querySelector('#create-dialog').open,false);assert.equal(d.querySelector('#create-dialog .loading-state'),null);assert.equal(d.querySelector('#content').firstChild,beforeWizard);
  releaseCatalog();w.fetch=originalWizardFetch;
  await wait(()=>d.querySelector('#create-dialog').open&&!!d.querySelector('.wizard-form'));
  assert.equal(d.querySelector('#create-dialog').open,true,d.querySelector('#content').textContent+' '+JSON.stringify(errors));assert.equal(d.querySelectorAll('.wizard-tabs button').length,8);
  const input=name=>d.querySelector('[name="'+name+'"]');
  input('container-name').value='web-wizard';input('memory-mib').value='256';input('cpu-cores').value='2';input('cpu-allowance').value='75';input('description').value='Criado pelo assistente';
  input('image').selectedIndex=1;
  for(let i=0;i<7;i++)d.querySelector('.wizard-form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.equal(d.querySelector('#wizard-tab-7').getAttribute('aria-selected'),'true');
  assert.match(d.querySelector('#wizard-page-7').textContent,/256 MiB/);d.querySelector('.wizard-form').requestSubmit();
  await wait(()=>d.querySelector('.task-view-output')?.textContent.includes('25%'));
  assert.equal(d.querySelector('#task-detail progress,#task-detail .creation-screen,#create-dialog .loading-state'),null);
  d.querySelector('#close-task-detail').click();await navigate('instances');const reads=requests.filter(p=>p.includes('resource=operation&')).length;
  await new Promise(resolve=>setTimeout(resolve,5500));assert.equal(requests.filter(p=>p.includes('resource=operation&')).length,reads);
  d.querySelector('#create-ct').click();await wait(()=>d.querySelector('.task-view-output')?.textContent.includes('TASK OK'));
  const taskDetails=d.querySelector('#task-log-content .task-details-link');assert.ok(taskDetails);taskDetails.click();assert.equal(d.querySelector('#task-detail').open,true);d.querySelector('#close-task-detail').click();
  const instance=(await (await w.fetch('/api/read?host=demo&project=laboratorio&resource=instance&target=web-wizard')).json()).data;
  assert.equal(instance.status,'Running');assert.equal(instance.config['limits.memory'],'256MiB');assert.equal(instance.config['limits.cpu'],'2');assert.equal(instance.description,'Criado pelo assistente');
  d.querySelector('#create-ct').click();await wait(()=>d.querySelector('#create-dialog').open&&!!d.querySelector('.wizard-form'));
  input('container-name').value='falha-wizard';input('image').selectedIndex=1;for(let i=0;i<7;i++)d.querySelector('.wizard-form').dispatchEvent(new w.Event('submit',{cancelable:true}));d.querySelector('.wizard-form').requestSubmit();await wait(()=>d.querySelector('.task-view-output')?.textContent.includes('TASK ERROR: Imagem indisponível: erro de teste'));
  d.querySelector('#close-task-detail').click();await navigate('instance/lab-web/console');assert.match(d.querySelector('#content').textContent,/demonstração não emula um shell/);
  assert.equal(requests.some(p=>p.includes('/vendor/xterm.js')),false);
  // Exercise the terminal UI with explicit protocol doubles; no real shell is claimed.
  const terminalCalls=[],terminalInstances=[];const realFetch=w.fetch;
  w.Terminal=class{
    constructor(){this.cols=100;this.rows=30;this.output='';terminalInstances.push(this);}
    open(node){this.node=node;}loadAddon(){}clear(){this.output='';}focus(){}
    write(text){this.output+=text;}writeln(text){this.output+=text+'\r\n';}
    onData(callback){this.data=callback;return {dispose:()=>{this.inputDisposed=true;}};}
    attachCustomKeyEventHandler(){}resize(cols,rows){this.cols=cols;this.rows=rows;}
    dispose(){this.disposed=true;}hasSelection(){return false;}
  };
  w.FitAddon={FitAddon:class{fit(){}}};let starts=0,delayStart=false;
  w.fetch=async(path,options={})=>{
    if(!String(path).startsWith('/api/console/'))return realFetch(path,options);
    const body=options.body?JSON.parse(options.body):{};terminalCalls.push({path,...body});
    let result={ok:true};
    if(path==='/api/console/start'){const id='dom-console-'+(++starts);if(delayStart)await new Promise(r=>setTimeout(r,150));result={console:id};}
    if(String(path).startsWith('/api/console/read'))result={output:'\x1b[31mterminal\x1b[0m\r\n',closed:false};
    return new Response(JSON.stringify(result),{status:path==='/api/console/start'?201:200,headers:{'Content-Type':'application/json'}});
  };
  w.eval('session.demo=false;session.enable_console=true;terminalLibrary=Promise.resolve();');
  await navigate('instance/lab-web/summary');await navigate('instance/lab-web/console');
  await wait(()=>terminalInstances[0]?.output.includes('\x1b[31mterminal'));
  assert.equal(d.querySelector('#confirm').open,false);
  assert.equal(terminalCalls.find(c=>c.path==='/api/console/start').confirmation,'demo/laboratorio/lab-web');
  terminalInstances[0].data('ls\r\x03\t\x1b[A');await wait(()=>terminalCalls.some(c=>c.path==='/api/console/input'));
  assert.equal(terminalCalls.find(c=>c.path==='/api/console/input').text,'ls\r\x03\t\x1b[A');
  terminalInstances[0].cols=140;terminalInstances[0].rows=45;w.lastResizeObserver.callback();
  await wait(()=>terminalCalls.some(c=>c.path==='/api/console/resize'&&c.width===140&&c.height===45));
  await navigate('instances');await wait(()=>terminalCalls.some(c=>c.path==='/api/console/close'));
  assert.equal(terminalInstances[0].disposed,true);
  delayStart=true;await navigate('instance/lab-web/console');await wait(()=>starts===2);
  await navigate('instances');await wait(()=>terminalCalls.some(c=>c.path==='/api/console/close'&&c.console==='dom-console-2'));
  assert.equal(w.eval('consoleId'),null);
  w.eval("creationRuns.clear();session.manage_all_instances=false;session.host_metrics=false;session.role='operador';");
  const poolReads=requests.filter(p=>p.includes('resource=pools')).length;
  d.querySelector('#create-ct').click();await wait(()=>d.querySelector('#create-dialog').open&&!!d.querySelector('.wizard-form'));assert.equal(d.querySelector('#create-dialog').open,true);
  assert.equal(requests.filter(p=>p.includes('resource=pools')).length,poolReads);
  d.querySelector('#wizard-tab-7').click();assert.equal(d.querySelector('#wizard-tab-0').getAttribute('aria-selected'),'true');
  input('container-name').value='lab-novo';input('image').selectedIndex=1;for(let i=0;i<7;i++)d.querySelector('.wizard-form').dispatchEvent(new w.Event('submit',{cancelable:true}));
  assert.match(d.querySelector('#wizard-page-7').textContent,/Herdada do perfil default/);
  assert.equal(input('memory-mib').disabled,true);
  const restrictedHash=w.location.hash,restrictedBackground=d.querySelector('#content').firstChild;
  d.querySelector('.wizard-form').requestSubmit();await wait(()=>d.querySelector('#confirm').open);
  d.querySelector('#action-form').requestSubmit();await wait(()=>d.querySelector('#task-detail').open&&d.querySelector('.task-view-output')?.textContent.includes('TASK OK'));
  assert.equal(w.location.hash,restrictedHash);assert.equal(d.querySelector('#content').firstChild,restrictedBackground);
  assert.equal((await (await w.fetch('/api/read?host=demo&project=laboratorio&resource=instance&target=lab-novo')).json()).data.status,'Stopped');
  d.querySelector('#close-task-detail').click();
  d.querySelector('#logout').click();await wait(()=>!d.querySelector('#login').hidden);
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({routes:routes.length,wizardSteps:8,creation:'Running',limitsApplied:true,restrictedCreationWithoutHostMetrics:true,backgroundPollingPaused:true,taskPanel:true,asyncFailure:true,terminalProtocolDouble:{autoConnect:true,ansi:true,keyboard:true,resize:true,navigationCleanup:true,pendingConnectionCleanup:true},logout:true,domErrors:errors.length}));
}finally{dom.window.close();}
