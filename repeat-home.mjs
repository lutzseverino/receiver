import {execFile} from 'node:child_process';import {promisify} from 'node:util';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const root='/tmp/worker-33-2026-11-03',exec=promisify(execFile),urls={base:JSON.parse(readFileSync(`${root}/urls.json`)).base,candidate:readFileSync(`${root}/candidate-url`,'utf8')},rows=[];mkdirSync(`${root}/investigation`,{recursive:true});
for(let sample=1;sample<=3;sample++)for(const mode of ['candidate','base']){
 const output=`${root}/investigation/home-en-${mode}-${sample}`;
 await exec(`${root}/tools/node_modules/.bin/lighthouse`,[urls[mode]+'/','--chrome-flags=--headless --no-sandbox --enable-unsafe-swiftshader','--output=json','--output=html',`--output-path=${output}`,'--quiet'],{env:{...process.env,TMPDIR:root,CHROME_PATH:'/home/agents/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome'},maxBuffer:1024*1024});
 const j=JSON.parse(readFileSync(output+'.report.json'));rows.push({mode,sample,lcp:j.audits['largest-contentful-paint'].numericValue,cls:j.audits['cumulative-layout-shift'].numericValue,scores:Object.fromEntries(['performance','accessibility','best-practices','seo'].map(k=>[k,j.categories[k].score]))});writeFileSync(`${root}/investigation/results.json`,JSON.stringify(rows,null,2));console.log(rows.at(-1));
}
