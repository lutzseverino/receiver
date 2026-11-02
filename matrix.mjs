import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const exec=promisify(execFile);
const root=process.env.PF_ROOT ?? '/tmp/pf-worker-2026-11-02';
const pages={home:'/',projects:'/projects/',project:'/projects/repo-standards/',wire:'/blog/',post:'/blog/short-note/',reply:'/contact/','no-signal':'/404.html'};
for(const mode of process.argv.slice(2)){
 const origin=readFileSync(`${root}/${mode==='before'?'baseline-url':'url'}`,'utf8');
 mkdirSync(`${root}/reports/${mode}`,{recursive:true});
 for(const locale of ['en','es','ca']) for(const [page,path] of Object.entries(pages)){
  const url=origin+(locale==='en'?'':`/${locale}`)+path;
  const output=`${root}/reports/${mode}/${page}-${locale}`;
  await exec(`${root}/tools/node_modules/.bin/lighthouse`,[url,'--chrome-flags=--headless --no-sandbox --enable-unsafe-swiftshader','--output=json','--output=html',`--output-path=${output}`,'--quiet'],{env:{...process.env,CHROME_PATH:process.env.CHROME_PATH ?? '/home/agents/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'},maxBuffer:1024*1024});
  const j=JSON.parse(readFileSync(output+'.report.json','utf8'));
  const scores=Object.fromEntries(['performance','accessibility','best-practices','seo'].map(k=>[k,Math.round(j.categories[k].score*100)]));
  console.log(JSON.stringify({mode,page,locale,url,...scores,tbt:j.audits['total-blocking-time'].numericValue}));
 }
}
