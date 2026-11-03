import {createServer} from 'node:http';import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {readFileSync,writeFileSync} from 'node:fs';
const root='/tmp/worker-33-2026-11-03',origin=readFileSync(`${root}/candidate-url`,'utf8');const {Browser}=await import(pathToFileURL(resolve('test/support/browser.ts')).href);const {until,pause}=await import(pathToFileURL(resolve('test/support/display.ts')).href);
let blockedWorkers=0;
const proxy=createServer(async(req,res)=>{
 if(req.url?.includes('/tube-worker-')){blockedWorkers++;res.writeHead(403,{'content-type':'text/javascript'});res.end('blocked');return;}
 const inline=req.url==='/blocked-inline/';const upstream=await fetch(origin+(inline?'/':req.url??'/'));res.writeHead(upstream.status,{...Object.fromEntries(upstream.headers),...(inline?{'content-security-policy':"script-src 'self'"}:{})});res.end(Buffer.from(await upstream.arrayBuffer()));
});await new Promise<void>(resolve=>proxy.listen(0,'127.0.0.1',resolve));const proxyOrigin=`http://127.0.0.1:${(proxy.address() as {port:number}).port}`;proxy.unref();
const browser=await Browser.launch(),results=[];
const cases=[
 ['saved-plain',`localStorage.setItem('receiver.plain','on')`,false],
 ['no-webgl',`const own=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){return t==='webgl'?null:own.call(this,t,...args)}`,false],
 ['throwing-probe',`const own=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){if(t==='webgl')throw new Error('probe');return own.call(this,t,...args)}`,false],
 ['denied-storage',`Object.defineProperty(window,'localStorage',{get(){throw new DOMException('denied','SecurityError')}})`,true],
 ['no-worker',`window.Worker=undefined`,true],
 ['no-offscreen',`window.OffscreenCanvas=undefined`,true],
 ['no-transfer',`HTMLCanvasElement.prototype.transferControlToOffscreen=undefined`,true],
 ['worker-init-false',`window.Worker=class{onmessage;postMessage(){setTimeout(()=>this.onmessage?.({data:false}),0)}terminate(){}}`,false],
 ['worker-init-error',`window.Worker=class{onerror;postMessage(){setTimeout(()=>this.onerror?.(new Event('error')),0)}terminate(){}}`,false],
 ['worker-late-draw',`window.Worker=class{onmessage;postMessage(d){setTimeout(()=>this.onmessage?.({data:true}),d instanceof OffscreenCanvas?0:1800)}terminate(){}}`,false],
 ['blocked-receiver','',false,'*/receiver.*.js'],
 ['blocked-worker','',false,'*/tube-worker-*.js'],
 ['no-js','',false],['blocked-inline','',false],
];
try{for(const [name,script,receiving,blocked] of cases){
 const tab=await browser.open('about:blank',{width:390});await tab.send('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.clear();${script}`});
 if(blocked){await tab.send('Network.enable');await tab.send('Network.setBlockedURLs',{urls:[blocked]});}
 if(name==='no-js')await tab.send('Emulation.setScriptExecutionDisabled',{value:true});
 const navigation=tab.goto(name==='blocked-inline'?proxyOrigin+'/blocked-inline/':(name==='blocked-worker'?proxyOrigin:origin)+'/');

 await navigation;
 const pendingAX=await tab.send('Accessibility.getFullAXTree');
 const pendingSemanticNodes=pendingAX.nodes.filter(node=>!node.ignored && ['link','heading','main'].includes(node.role?.value)).length;
 await until(()=>tab.evaluate(()=>!document.documentElement.classList.contains('receiver-pending')),'startup branch',3000);await pause(name==='worker-late-draw'?500:100);
 const result=await tab.evaluate(()=>({receiving:document.documentElement.classList.contains('receiving'),display:!!document.querySelector('.display'),plainWidth:document.querySelector('main')!.getBoundingClientRect().width,marks:performance.getEntriesByType('mark').map(({name,startTime})=>({name,startTime})),saved:(()=>{try{return localStorage.getItem('receiver.plain')}catch{return 'denied'}})()}));
 if(result.receiving!==receiving || result.display!==receiving ||(!receiving&&result.plainWidth<100))throw new Error(`${name}: ${JSON.stringify(result)}`);
 results.push({name,pendingSemanticNodes,...result,...(name==='blocked-worker'?{blockedWorkers}: {})});console.log(results.at(-1));await tab.close();}
 writeFileSync(`${root}/branches.json`,JSON.stringify(results,null,2));}finally{await browser.close();proxy.close();}
