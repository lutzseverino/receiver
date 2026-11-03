import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const exec=promisify(execFile);
const root=process.env.T9_ROOT??'/tmp/t9-worker-2026-11-02';
const pages={home:'/',projects:'/projects/',project:'/projects/repo-standards/',wire:'/blog/',reply:'/contact/','no-signal':'/404.html'};
const results=process.env.RESUME?JSON.parse(readFileSync(`${root}/scores.json`,'utf8')):[];
mkdirSync(`${root}/reports`,{recursive:true});
for(const locale of ['en','es','ca']) for(const [page,path] of Object.entries(pages)) {
 if(results.some(r=>r.page===page && r.locale===locale && r.pass))continue;
 const url='https://lutzseverino.com'+(locale==='en'?'':`/${locale}`)+path;
 const output=`${root}/reports/${page}-${locale}`;
 await exec(`${root}/lighthouse/node_modules/.bin/lighthouse`,[url,'--chrome-flags=--headless --no-sandbox --enable-unsafe-swiftshader --host-resolver-rules="MAP static.cloudflareinsights.com 104.16.80.73"','--output=json','--output=html',`--output-path=${output}`,'--quiet'],{env:{...process.env,TMPDIR:`${root}/runtime-tmp`,CHROME_PATH:process.env.CHROME_PATH??'/home/agents/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'},maxBuffer:1024*1024});
 const j=JSON.parse(readFileSync(output+'.report.json','utf8'));
 const scores=Object.fromEntries(['performance','accessibility','best-practices','seo'].map(k=>[k,Math.round(j.categories[k].score*100)]));
 const required=['performance','accessibility','best-practices',...(page==='no-signal'?[]:['seo'])];
 const result={page,locale,url,fetchTime:j.fetchTime,...scores,pass:!j.runtimeError && required.every(k=>scores[k]>=95),runtimeError:j.runtimeError??null,beaconRequests:(j.audits['network-requests'].details?.items??[]).filter(r=>r.url.startsWith('https://static.cloudflareinsights.com/')||r.url.startsWith('https://cloudflareinsights.com/')).map(r=>({url:r.url.split('?')[0],status:r.statusCode}))};
 results.push(result);
 writeFileSync(`${root}/scores.json`,JSON.stringify(results,null,2)+'\n');
 console.log(JSON.stringify(result));
}
if(results.some(r=>!r.pass))process.exitCode=1;
