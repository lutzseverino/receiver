import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';import {gzipSync} from 'node:zlib';
const root='/tmp/worker-33-2026-11-03';const {Browser}=await import(pathToFileURL(resolve('test/support/browser.ts')).href);const origin=readFileSync(`${root}/cache-url`,'utf8');
const browser=await Browser.launch();const summary=[];
try {for(const locale of ['en','es','ca'])for(const path of ['/','/projects/','/projects/repo-standards/','/blog/','/blog/short-note/','/contact/','/404.html'])for(const width of [390,1280])for(const reduced of [false,true])for(const cache of ['cold','warm']){
 const name=`${locale}-${path.replaceAll('/','_')}-${width}-${reduced?'reduced':'normal'}-${cache}`;const dir=`${root}/filmstrips/${name}`;mkdirSync(dir,{recursive:true});
 const tab=await browser.open('about:blank',{width});await tab.send('Network.enable');await tab.send('Network.clearBrowserCache');await tab.send('Network.setCacheDisabled',{cacheDisabled:false});if(reduced)await tab.send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});
 await tab.send('Page.addScriptToEvaluateOnNewDocument',{source:'localStorage.clear()'});
 if(cache==='warm'){await tab.goto(origin+(locale==='en'?'':`/${locale}`)+path);await tab.evaluate(()=>new Promise<void>(resolve=>{const check=()=>{if(!document.documentElement.classList.contains('receiver-pending'))resolve();else setTimeout(check,20)};check()}));}
 const warmPrimedReceiving=cache==='warm'?await tab.evaluate(()=>document.documentElement.classList.contains('receiving')):null;
 await tab.send('Tracing.start',{categories:'blink.user_timing,disabled-by-default-devtools.screenshot',transferMode:'ReturnAsStream'});
 await tab.goto(origin+(locale==='en'?'':`/${locale}`)+path);await new Promise(r=>setTimeout(r,1800));
 const marks=await tab.evaluate(()=>performance.getEntriesByType('mark').map(({name,startTime})=>({name,startTime})));
 const resources=await tab.evaluate(()=>performance.getEntriesByType('resource').map((entry)=>({name:entry.name,transferSize:(entry as PerformanceResourceTiming).transferSize,duration:entry.duration})));
 const complete=tab.event('Tracing.tracingComplete');await tab.send('Tracing.end');const {stream}=await complete.next;let data='';for(;;){const part=await tab.send('IO.read',{handle:stream});data+=part.data;if(part.eof)break;}await tab.send('IO.close',{handle:stream});
 const trace=JSON.parse(data);writeFileSync(`${dir}/trace.json.gz`,gzipSync(data));
 let index=0;for(const event of trace.traceEvents.filter(e=>e.name==='Screenshot'))writeFileSync(`${dir}/${String(index++).padStart(3,'0')}.jpg`,Buffer.from(event.args.snapshot,'base64'));
 summary.push({name,warmPrimedReceiving,marks,resources,frames:index});console.log(summary.at(-1));await tab.close();
}writeFileSync(`${root}/filmstrips/results.json`,JSON.stringify(summary,null,2));}finally{await browser.close();}
