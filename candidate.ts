import {resolve} from 'node:path';import {pathToFileURL} from 'node:url';import {writeFileSync} from 'node:fs';
const {builtSite,serveSite,FIXTURE_POSTS}=await import(pathToFileURL(resolve('test/support/site.ts')).href);
const site=await builtSite({posts:FIXTURE_POSTS});const url=await serveSite(site);writeFileSync('/tmp/worker-33-2026-11-03/candidate-url',url);console.log(url);setInterval(()=>{},60000);
