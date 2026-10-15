// Run from repository root: node exchange/scripts/browser-check.mjs
// Requires the root project's npm ci and a separate test server with EVENT_CODE=BRIDGE-TEST.
import {chromium} from '../../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});
const errors=[];
try{
 const first=await browser.newContext(),second=await browser.newContext();
 const page=await first.newPage(),peer=await second.newPage();for(const p of [page,peer])p.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3000/');await page.screenshot({path:'/tmp/history-bridge-entry.png',fullPage:true});
 async function join(p,name,lang='ko'){await p.goto('http://127.0.0.1:3000/team/1');await p.locator('[name=code]').fill('BRIDGE-TEST');await p.locator('[name=name]').fill(name);await p.locator(`[name=language][value=${lang}]`).check();await p.locator('.enter-button').click();await p.locator('#room:not([hidden])').waitFor();}
 await join(page,'한국 학생');await join(peer,'日本の生徒','ja');
 const text='브라우저 공유 확인 '+Date.now();await page.locator('#message').fill(text);await page.locator('#send').click();await peer.getByText(text,{exact:true}).waitFor({timeout:7000});
 await page.locator('#message').fill('<script>alert("test")</script>');await page.locator('#send').click();await page.getByText('<script>alert("test")</script>',{exact:true}).waitFor();
 // Photo re-encoding and multi-device propagation.
 await page.locator('#photo').setInputFiles({name:'test.png',mimeType:'image/png',buffer:await page.screenshot()});
 await page.locator('#photo-preview:not([hidden])').waitFor();await page.locator('#message').fill('사진 공유 확인');await page.locator('#send').click();await peer.getByText('사진 공유 확인',{exact:true}).waitFor({timeout:7000});assert.ok(await peer.locator('.message-photo').count()>0);
 await page.screenshot({path:'/tmp/history-bridge-room.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/history-bridge-mobile.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.equal(await page.locator('#send').isVisible(),true);
 await page.locator('#logout').click();await page.locator('#entry:not([hidden])').waitFor();await page.screenshot({path:'/tmp/history-bridge-mobile-entry.png',fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);assert.deepEqual(errors,[]);
 console.log('PASS: two-browser sharing, Japanese entry, photo upload, XSS text rendering, logout, desktop/mobile layouts; no page errors.');
}finally{await browser.close();}
