import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {readFileSync,writeFileSync,readdirSync} from 'node:fs';import {gunzipSync} from 'node:zlib';
const root='/tmp/worker-33-2026-11-03';const {default:sharp}=await import(pathToFileURL(resolve('node_modules/sharp/dist/index.cjs')).href);const results=[];
for(const group of ['filmstrips','filmstrips-extra'])for(const name of readdirSync(`${root}/${group}`)){
 if(name.endsWith('.json'))continue;
 const dir=`${root}/${group}/${name}`,trace=JSON.parse(gunzipSync(readFileSync(`${dir}/trace.json.gz`)).toString());
 const events=trace.traceEvents,marks=events.filter(e=>e.cat?.includes('blink.user_timing')&&e.name.startsWith('receiver:')).map(({name,ts})=>({name,ts}));
 const gate=marks.find(m=>m.name==='receiver:gate')?.ts;
 if(!gate)throw new Error(`no head gate: ${name}`);
 const draw=marks.find(m=>m.name==='receiver:first-frame')?.ts,plain=marks.find(m=>m.name==='receiver:plain')?.ts;
 const screenshots=events.filter(e=>e.name==='Screenshot');const frames=[];
 let index=0;for(const screenshot of screenshots){const jpg=`${String(index++).padStart(3,'0')}.jpg`;const stats=await sharp(readFileSync(`${dir}/${jpg}`)).stats();frames.push({jpg,ms:(screenshot.ts-gate)/1000,min:Math.min(...stats.channels.slice(0,3).map(c=>c.min)),max:Math.max(...stats.channels.slice(0,3).map(c=>c.max)),stdev:Math.max(...stats.channels.slice(0,3).map(c=>c.stdev)),meanMax:Math.max(...stats.channels.slice(0,3).map(c=>c.mean))});}
 const firstBlack=frames.find(f=>f.ms>=0&&f.max<=5&&f.min>=1);
 const firstVisible=frames.find(f=>f.ms>=0&&f.stdev>0.5);const firstBright=frames.find(f=>f.ms>=0&&f.meanMax>30&&f.stdev>0.5);
 const pending=frames.filter(f=>f.ms>=0&&f.ms<((draw??plain??Infinity)-gate)/1000);
 const initialBrowserBlankFrames=pending.filter(f=>f.jpg==='000.jpg'&&f.min===255&&f.max===255&&f.ms<(firstBlack?.ms??0));
 const unexpectedPendingFrames=pending.filter(f=>(f.max>5||f.min<1)&&!initialBrowserBlankFrames.includes(f));
 const navigationURLs=events.filter(e=>e.name==='navigationStart').map(e=>e.args?.data?.documentLoaderURL).filter(Boolean);
 const result={group,name,navigationURLs,initialBrowserBlankFrames,unexpectedPendingFrames,drawMs:draw?(draw-gate)/1000:null,plainMs:plain?(plain-gate)/1000:null,firstBlackMs:firstBlack?.ms,firstNonUniformFrameMs:firstVisible?.ms,firstBrightFrameMs:firstBright?.ms,pendingFrames:pending.length,pendingNonBlack:pending.filter(f=>f.max>5||f.min<1),marks,frames};results.push(result);writeFileSync(`${dir}/timings.json`,JSON.stringify(result,null,2));
}
writeFileSync(`${root}/frame-analysis.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(results.map(({name,drawMs,plainMs,firstBlackMs,firstNonUniformFrameMs,pendingFrames,pendingNonBlack})=>({name,drawMs,plainMs,firstBlackMs,firstNonUniformFrameMs,pendingFrames,pendingNonBlack})),null,2));
