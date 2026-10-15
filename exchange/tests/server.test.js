import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
const dir=mkdtempSync(path.join(tmpdir(),'history-bridge-'));let child;
const base='http://127.0.0.1:3098';
async function start(mock=false){child=spawn(process.execPath,[...(mock?['--import','./tests/mock-provider.mjs']:[]),'server.js'],{cwd:new URL('../',import.meta.url),env:{...process.env,PORT:'3098',DATA_DIR:dir,EVENT_CODE:'TEST-EVENT',TEACHER_PASSWORD:'teacher-password-test',OPENAI_API_KEY:mock?'test-only-key':''},stdio:'pipe'});for(let i=0;i<80;i++){try{if((await fetch(base+'/api/config')).ok)return;}catch{}await new Promise(r=>setTimeout(r,50));}throw new Error('server did not start');}
async function stop(){const exit=new Promise(r=>child.once('exit',r));child.kill();await exit;}
async function request(route,{cookie,method='GET',body}={}){const res=await fetch(base+route,{method,headers:{'Content-Type':'application/json',...(cookie?{Cookie:cookie}:{})},body:body===undefined?undefined:JSON.stringify(body)});return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};}
async function join(team=1,name='학생',extra={}){return request('/api/join',{method:'POST',body:{code:'TEST-EVENT',name,team,language:'ko',...extra}});}
before(()=>start());after(async()=>{await stop();rmSync(dir,{recursive:true,force:true});});
test('입장 인증과 CSRF 차단',async()=>{assert.equal((await request('/api/messages')).status,401);assert.equal((await join(1,'학생',{code:'wrong'})).status,403);assert.equal((await join(6)).status,400);const res=await fetch(base+'/api/join',{method:'POST',headers:{Origin:'https://evil.example','Content-Type':'application/json'},body:'{}'});assert.equal(res.status,403);});
test('다른 학생 공유, 팀 분리, 미설정 번역 상태와 삭제 권한',async()=>{const a=await join(),b=await join(1,'친구'),other=await join(2);assert.equal(a.status,200);const sent=await request('/api/messages',{cookie:a.cookie,method:'POST',body:{text:'안녕하세요'}});assert.equal(sent.status,201);const list=await request('/api/messages',{cookie:b.cookie});const m=list.data.find(x=>x.id===sent.data.id);assert.equal(m.text,'안녕하세요');assert.equal(m.status,'unconfigured');assert.equal(m.mine,false);assert.equal('owner' in m,false);assert.deepEqual((await request('/api/messages',{cookie:other.cookie})).data,[]);assert.equal((await request('/api/messages/'+m.id,{cookie:b.cookie,method:'DELETE'})).status,403);assert.equal((await request('/api/messages/'+m.id+'/retry',{cookie:a.cookie,method:'POST'})).status,503);assert.equal((await request('/api/messages/'+m.id,{cookie:a.cookie,method:'DELETE'})).status,200);});
test('사진 전송과 입력 제한',async()=>{const a=await join();const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=';assert.equal((await request('/api/messages',{cookie:a.cookie,method:'POST',body:{text:'사진 설명',image:png}})).status,201);assert.equal((await request('/api/messages',{cookie:a.cookie,method:'POST',body:{text:'x'.repeat(1501)}})).status,400);assert.equal((await request('/api/messages',{cookie:a.cookie,method:'POST',body:{image:'data:image/svg+xml;base64,PHN2Zz4='}})).status,400);assert.equal((await request('/api/messages',{cookie:a.cookie,method:'POST',body:{}})).status,400);});
test('교사 인증과 팀 전체 삭제',async()=>{assert.equal((await join(1,'교사',{teacherPassword:'wrong'})).status,403);const teacher=await join(1,'교사',{teacherPassword:'teacher-password-test'}),student=await join();assert.equal((await request('/api/clear',{cookie:student.cookie,method:'POST'})).status,403);assert.equal((await request('/api/clear',{cookie:teacher.cookie,method:'POST'})).status,200);assert.deepEqual((await request('/api/messages',{cookie:teacher.cookie})).data,[]);});
test('재시작 후 영구 저장과 세션 만료',async()=>{const a=await join(3);await request('/api/messages',{cookie:a.cookie,method:'POST',body:{text:'保存テスト'}});await stop();await start();assert.equal((await request('/api/messages',{cookie:a.cookie})).status,401);const b=await join(3);assert.equal((await request('/api/messages',{cookie:b.cookie})).data[0].text,'保存テスト');});

test('번역 제공자 모의 응답: 양방향 번역과 실패 처리',async()=>{
 await stop();await start(true);
 for(const [language,text,expected] of [['ko','안녕하세요','こんにちは'],['ja','こんにちは','안녕하세요'],['ko','FAIL',null]]){
  const a=await join(5,'번역테스트',{language});const sent=await request('/api/messages',{cookie:a.cookie,method:'POST',body:{text}});
  let m;for(let i=0;i<50;i++){m=(await request('/api/messages',{cookie:a.cookie})).data.find(x=>x.id===sent.data.id);if(m.status!=='pending')break;await new Promise(r=>setTimeout(r,20));}
  assert.equal(m.status,expected?'done':'failed');assert.equal(m.translation,expected);
 }
});
