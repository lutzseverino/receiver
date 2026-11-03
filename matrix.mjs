import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const exec=promisify(execFile), root='/tmp/worker-33-2026-11-03';
const urls={base:JSON.parse(readFileSync(`${root}/urls.json`)).base,candidate:readFileSync(`${root}/candidate-url`,'utf8')};
const pages={home:'/',projects:'/projects/',project:'/projects/repo-standards/',wire:'/blog/',post:'/blog/short-note/',reply:'/contact/','no-signal':'/404.html'};
const results=[];
for(const locale of ['en','es','ca'])for(const [page,path] of Object.entries(pages))for(let sample=1;sample<=3;sample++)for(const mode of ['base','candidate']){
 const url=urls[mode]+(locale==='en'?'':`/${locale}`)+path;const output=`${root}/matrix/${mode}/${page}-${locale}-${sample}`;mkdirSync(`${root}/matrix/${mode}`,{recursive:true});
 try{await exec(`${root}/tools/node_modules/.bin/lighthouse`,[url,'--chrome-flags=--headless --no-sandbox --enable-unsafe-swiftshader','--output=json','--output=html',`--output-path=${output}`,'--quiet'],{env:{...process.env,TMPDIR:root,CHROME_PATH:'/home/agents/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'},maxBuffer:1024*1024});}catch(e){console.log(e.message)}
 const j=JSON.parse(readFileSync(output+'.report.json','utf8'));const row={mode,page,locale,sample,url,scores:Object.fromEntries(['performance','accessibility','best-practices','seo'].map(k=>[k,j.categories[k].score])),lcp:j.audits['largest-contentful-paint'].numericValue,cls:j.audits['cumulative-layout-shift'].numericValue,error:j.runtimeError};results.push(row);writeFileSync(`${root}/matrix/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(row));
}
