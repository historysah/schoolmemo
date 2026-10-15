// Local UI integration with simulated Apps Script services; not a Google deployment test.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {runtime} from './runtime.mjs';
const r=runtime(),allowed=new Set(['getConfig','joinRoom','logoutRoom','getMessages','sendMessage','retryTranslation','deleteMessage','clearTeam']);
const server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(new URL('../Index.html',import.meta.url)));});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
try{
 const errors=[];
 async function page(){const context=await browser.newContext();const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.exposeFunction('gasCall',async(name,args)=>{if(!allowed.has(name))throw new Error('Unsupported call');return JSON.parse(JSON.stringify(r.ctx[name](...args)));});await p.addInitScript(()=>{
  function runner(success,fail){return new Proxy({}, {get(_,name){if(name==='withSuccessHandler')return fn=>runner(fn,fail);if(name==='withFailureHandler')return fn=>runner(success,fn);return (...args)=>window.gasCall(name,args).then(success).catch(e=>fail?.({message:e.message}));}});}
  window.google={script:{run:runner(()=>{},()=>{})}};
 });await p.goto(url);return p;}
 const a=await page(),b=await page();
 async function join(p,name,lang='ko'){await p.locator('[name=code]').fill('TEST-EVENT');await p.locator('[name=name]').fill(name);await p.locator(`[name=language][value=${lang}]`).check();await p.locator('.enter-button').click();await p.locator('#room:not([hidden])').waitFor();}
 await join(a,'한국 학생');await join(b,'日本の生徒','ja');
 await a.locator('#message').fill('처음 뵙겠습니다');await a.locator('#send').click();await b.getByText('처음 뵙겠습니다',{exact:true}).waitFor({timeout:12000});
 assert.equal(await a.locator('input[type=file]').count(),0);
 r.props.set('OPENAI_API_KEY','test-only-key');await a.getByText('번역 재시도 · 再翻訳',{exact:true}).click();await a.locator('.translation').filter({hasText:'こんにちは'}).waitFor();
 await b.locator('#message').fill('こんにちは');await b.locator('#send').click();await a.locator('.translation').filter({hasText:'안녕하세요'}).waitFor({timeout:12000});
 await a.locator('#message').fill('<script>alert(1)</script>');await a.locator('#send').click();await a.getByText('<script>alert(1)</script>',{exact:true}).waitFor();
 await a.setViewportSize({width:390,height:844});assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await a.screenshot({path:'/tmp/sai-gas-mobile.png',fullPage:true});
 await a.locator('#logout').click();await a.locator('#entry:not([hidden])').waitFor();assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 console.log('PASS: Apps Script RPC simulation, two-browser sharing, both translation directions, no upload controls, safe text, mobile layout, logout.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
