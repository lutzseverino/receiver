import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {writeFileSync,cpSync,readFileSync} from 'node:fs';
const root='/tmp/worker-33-2026-11-03';
const {builtSite,serveSite,FIXTURE_POSTS}=await import(pathToFileURL(resolve('test/support/site.ts')).href);
const site=await builtSite({posts:FIXTURE_POSTS});
const urls={base:await serveSite(site)};
for(const mode of ['clip','cover']) {
 const dir=`${root}/${mode}`; cpSync(site.dir,dir,{recursive:true});
 for(const page of site.pages) {
 const file=`${dir}/${page}`;
 const css=mode==='clip'?`html.wait body>:not(.display){position:absolute!important;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}html.wait{background:#030303}`:`html.wait::after{content:'';position:fixed;inset:0;background:#030303;z-index:2147483647;pointer-events:none}`;
 const gate=`<style>${css}</style><script>window.gateAt=performance.now();document.documentElement.classList.add('wait');const observer=new MutationObserver(()=>{if(document.documentElement.classList.contains('receiving')){window.receiverAt=performance.now();document.documentElement.classList.remove('wait');observer.disconnect()}});observer.observe(document.documentElement,{attributes:true});setTimeout(()=>document.documentElement.classList.remove('wait'),1500);</script>`;
 writeFileSync(file,readFileSync(file,'utf8').replace('<head>','<head>'+gate));
 }
 urls[mode]=await serveSite({...site,dir});
}
writeFileSync(`${root}/urls.json`,JSON.stringify(urls));
console.log(urls);
setInterval(()=>{},60000);
