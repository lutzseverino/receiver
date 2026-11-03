import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const root='/tmp/worker-33-2026-11-03';const {Browser}=await import(pathToFileURL(resolve('test/support/browser.ts')).href);const {openTab,idle,pause}=await import(pathToFileURL(resolve('test/support/display.ts')).href);const {default:sharp}=await import(pathToFileURL(resolve('node_modules/sharp/dist/index.cjs')).href);
const urls={base:JSON.parse(readFileSync(`${root}/urls.json`)).base,candidate:readFileSync(`${root}/candidate-url`,'utf8')};
const pages={home:'/',projects:'/projects/',project:'/projects/repo-standards/',wire:'/blog/',post:'/blog/short-note/',reply:'/contact/','no-signal':'/404.html'};
const browser=await Browser.launch();const results=[];mkdirSync(`${root}/visuals`,{recursive:true});
try {
for(const locale of ['en','es','ca'])for(const [page,path,width,height] of [...Object.entries(pages).map(([page,path])=>[page,path,390,844]),['projects-compact','/projects/',1280,600],['reply-split','/contact/',720,320]]){
 const pictures=[];
 for(const mode of ['base','candidate']){
 const tab=await openTab(browser,urls[mode],(locale==='en'?'':`/${locale}`)+path,{width,height,reducedMotion:true});await idle(tab);await pause(300);
 const shot=await tab.send('Page.captureScreenshot',{format:'png'});const png=Buffer.from(shot.data as string,'base64');writeFileSync(`${root}/visuals/${mode}-${page}-${locale}.png`,png);pictures.push(await sharp(png).removeAlpha().raw().toBuffer());await tab.close();
 }
 let max=0,changed=0;for(let i=0;i<pictures[0].length;i++){const diff=Math.abs(pictures[0][i]-pictures[1][i]);max=Math.max(max,diff);if(diff)changed++;}results.push({locale,page,max,changed});console.log(results.at(-1));
}
writeFileSync(`${root}/visuals/results.json`,JSON.stringify(results,null,2));
} finally {await browser.close();}
