// Local UI integration with simulated Apps Script services; not a Google deployment test.
import {createServer} from 'node:http';
import {readFileSync} from 'node:fs';
import {chromium} from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import {runtime} from './runtime.mjs';
const r=runtime(),allowed=new Set(['getConfig','joinRoom','logoutRoom','getMessages','sendMessage','retryTranslation','deleteMessage','clearTeam','getRoomState','saveTeamOpinion','retryOpinionTranslation','clearAll']);
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
 async function join(p,name,lang='ko',team=1,teacher=false){await p.locator('[name=code]').fill('TEST-EVENT');await p.locator('[name=name]').fill(name);await p.locator(`[name=language][value=${lang}]`).check();await p.locator(`[name=team][value="${team}"]`).check();if(teacher){await p.locator('details summary').click();await p.locator('[name=teacherPassword]').fill('teacher-password-test');}await p.locator('.enter-button').click();await p.locator('#room:not([hidden])').waitFor();}
 await join(a,'한국 학생');await join(b,'日本の生徒','ja');
 await a.locator('#message').fill('처음 뵙겠습니다');await a.locator('#send').click();await b.getByText('처음 뵙겠습니다',{exact:true}).waitFor({timeout:12000});
 assert.equal(await a.locator('input[type=file]').count(),0);
 r.props.set('OPENAI_API_KEY','test-only-key');await a.getByText('번역 재시도 · 再翻訳',{exact:true}).click();await a.locator('.translation').filter({hasText:'こんにちは'}).waitFor();
 await b.locator('#message').fill('こんにちは');await b.locator('#send').click();await a.locator('.translation').filter({hasText:'안녕하세요'}).waitFor({timeout:12000});
 await a.locator('#message').fill('<script>alert(1)</script>');await a.locator('#send').click();await a.getByText('<script>alert(1)</script>',{exact:true}).waitFor();

 // Shared opinion and concurrent draft preservation.
 await a.locator('#opinion-text').fill('역사를 다양한 관점에서 살펴봅시다.');await a.locator('#save-opinion').click();
 await b.locator('#opinion-saved .original').filter({hasText:'역사를 다양한 관점에서 살펴봅시다.'}).waitFor({timeout:12000});
 await b.locator('#opinion-text').fill('일본 학생의 미저장 초안');
 await a.locator('#opinion-text').fill('한국 학생이 먼저 저장한 최신 의견');await a.locator('#save-opinion').click();
 await b.locator('#load-latest:not([hidden])').waitFor({timeout:12000});
 assert.equal(await b.locator('#opinion-text').inputValue(),'일본 학생의 미저장 초안');assert.equal(await b.locator('#save-opinion').isDisabled(),true);
 b.once('dialog',d=>d.accept());await b.locator('#load-latest').click();assert.equal(await b.locator('#opinion-text').inputValue(),'한국 학생이 먼저 저장한 최신 의견');
 await b.locator('#opinion-text').fill('함께 합의한 우리 팀의 최종 의견');await b.locator('#save-opinion').click();
 await a.locator('#opinion-saved .original').filter({hasText:'함께 합의한 우리 팀의 최종 의견'}).waitFor({timeout:12000});
 const other=await page();await join(other,'2팀 학생','ja',2);await other.locator('#opinion-text').fill('二班の結論');await other.locator('#save-opinion').click();await other.locator('#opinion-saved .original').filter({hasText:'二班の結論'}).waitFor();
 assert.equal(await other.locator('#messages .message').count(),0);
 await a.locator('#show-all-opinions').click();await a.locator('#all-opinions[open]').waitFor();assert.equal(await a.locator('.team-opinion-card').count(),5);await a.locator('#all-opinions-list').getByText('二班の結論',{exact:true}).waitFor();
 await a.setViewportSize({width:1500,height:1000});await a.screenshot({path:'/tmp/sai-all-opinions.png',fullPage:true});await a.locator('#close-opinions').click();await a.screenshot({path:'/tmp/sai-opinion-desktop.png',fullPage:true});
 assert.equal(await a.locator('#clear-all').isVisible(),false);
 await a.setViewportSize({width:390,height:844});assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await a.screenshot({path:'/tmp/sai-gas-mobile.png',fullPage:true});

 // Teacher reset applies across all five teams and invalidates existing sessions.
 const teacher=await page();await join(teacher,'담당 교사','ko',3,true);teacher.once('dialog',d=>d.accept());await teacher.locator('#clear-all').click();await teacher.locator('#entry:not([hidden])').waitFor();
 await b.locator('#entry:not([hidden])').waitFor({timeout:12000});
 assert.equal(await a.locator('#all-opinions[open]').count(),0);
 await a.locator('#entry:not([hidden])').waitFor({timeout:12000});await join(a,'재입장 학생');await a.locator('#save-opinion:not([disabled])').waitFor();assert.equal(await a.locator('#messages .message').count(),0);assert.equal(await a.locator('#opinion-text').inputValue(),'');
 await a.locator('#logout').click();await a.locator('#entry:not([hidden])').waitFor();assert.equal(await a.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 console.log('PASS: four-browser sharing, team opinion editing/conflicts, all-five-team view, teacher-only full reset and re-entry, bilingual chat, safe text, desktop/mobile layout.');
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
