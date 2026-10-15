import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {runtime,join} from './runtime.mjs';
test('인증, 팀·언어·비밀번호 검증과 비밀 값 비노출',()=>{const r=runtime();assert.throws(()=>join(r,1,{code:'wrong'}));assert.throws(()=>join(r,6));assert.throws(()=>join(r,1,{language:'en'}));assert.throws(()=>join(r,1,{teacherPassword:'wrong'}));assert.throws(()=>r.ctx.getMessages('invalid'));assert.deepEqual(Object.keys(r.ctx.getConfig()).sort(),['configured','translationReady']);});
test('같은 팀 공유와 다른 팀 분리, 작성자·교사 권한',()=>{const r=runtime(),a=join(r),b=join(r),other=join(r,2),teacher=join(r,1,{teacherPassword:'teacher-password-test'});const sent=r.ctx.sendMessage(a.token,'안녕하세요',randomUUID());assert.equal(r.ctx.getMessages(b.token)[0].text,'안녕하세요');assert.equal(r.ctx.getMessages(b.token)[0].mine,false);assert.equal(r.ctx.getMessages(other.token).length,0);assert.throws(()=>r.ctx.deleteMessage(b.token,sent.id));assert.throws(()=>r.ctx.deleteMessage(other.token,sent.id));assert.throws(()=>r.ctx.clearTeam(b.token));r.ctx.deleteMessage(teacher.token,sent.id);assert.equal(r.ctx.getMessages(a.token).length,0);});
test('API 키 없이 원문 저장, 재시도 설정 안내',()=>{const r=runtime(),s=join(r);const result=r.ctx.sendMessage(s.token,'원문',randomUUID());assert.equal(r.ctx.getMessages(s.token)[0].status,'unconfigured');assert.equal(r.providerCalls,0);assert.throws(()=>r.ctx.retryTranslation(s.token,result.id));});
test('모의 번역 제공자: 양방향·실패·키 설정 후 재시도',()=>{const r=runtime(),ko=join(r),ja=join(r,1,{language:'ja'});const old=r.ctx.sendMessage(ko.token,'안녕하세요',randomUUID());r.props.set('OPENAI_API_KEY','test-only-key');r.ctx.retryTranslation(ko.token,old.id);r.ctx.sendMessage(ja.token,'こんにちは',randomUUID());r.ctx.sendMessage(ko.token,'FAIL',randomUUID());const messages=r.ctx.getMessages(ko.token);assert.equal(messages[0].translation,'こんにちは');assert.equal(messages[1].translation,'안녕하세요');assert.equal(messages[2].status,'failed');assert.equal(r.providerCalls,3);});
test('전송 중복 방지와 수식 입력의 문자 저장',()=>{const r=runtime(),s=join(r),id=randomUUID();r.props.set('OPENAI_API_KEY','test-only-key');r.ctx.sendMessage(s.token,'=IMPORTXML("example","x")',id);r.ctx.sendMessage(s.token,'=IMPORTXML("example","x")',id);assert.equal(r.ctx.getMessages(s.token).length,1);assert.equal(r.providerCalls,1);assert.equal(r.ctx.getMessages(s.token)[0].text,'=IMPORTXML("example","x")');assert.equal(r.ctx.cell_('=1+1'),"'=1+1");});
test('글 길이, 전송 제한, 로그아웃',()=>{const r=runtime(),s=join(r);assert.throws(()=>r.ctx.sendMessage(s.token,'x'.repeat(1001),randomUUID()));for(let i=0;i<8;i++)r.ctx.sendMessage(s.token,'글',randomUUID());assert.throws(()=>r.ctx.sendMessage(s.token,'제한',randomUUID()));r.ctx.logoutRoom(s.token);assert.throws(()=>r.ctx.getMessages(s.token));});
test('교사 전체 삭제는 현재 팀만 적용',()=>{const r=runtime(),t=join(r,1,{teacherPassword:'teacher-password-test'}),other=join(r,2);r.ctx.sendMessage(t.token,'1팀 기록',randomUUID());r.ctx.sendMessage(other.token,'2팀 기록',randomUUID());r.ctx.clearTeam(t.token);assert.equal(r.ctx.getMessages(t.token).length,0);assert.equal(r.ctx.getMessages(other.token).length,1);});

test('팀 의견 공유·전체 팀 읽기와 자기 팀만 수정',()=>{
 const r=runtime(),a=join(r),b=join(r),other=join(r,2);
 assert.throws(()=>r.ctx.getRoomState('invalid'));
 const start=r.ctx.getRoomState(a.token);assert.equal(start.opinions.length,5);
 const first=start.opinions[0];r.ctx.saveTeamOpinion(a.token,{text:'우리 팀 결론',language:'ko',revision:first.revision,team:2});
 assert.equal(r.ctx.getRoomState(b.token).opinions[0].text,'우리 팀 결론');
 assert.equal(r.ctx.getRoomState(other.token).opinions[0].text,'우리 팀 결론');
 assert.equal(r.ctx.getRoomState(other.token).opinions[1].text,'');
 assert.throws(()=>r.ctx.saveTeamOpinion(other.token,{text:'1팀 변경 시도',language:'ko',revision:r.ctx.getRoomState(a.token).opinions[0].revision}));
 assert.equal(r.ctx.getRoomState(a.token).opinions[0].text,'우리 팀 결론');
});
test('동시 의견 편집은 이전 버전 저장을 거절하고 기존 결론 보존',()=>{
 const r=runtime(),a=join(r),b=join(r),first=r.ctx.getRoomState(a.token).opinions[0];
 r.ctx.saveTeamOpinion(a.token,{text:'먼저 저장한 결론',language:'ko',revision:first.revision});
 assert.throws(()=>r.ctx.saveTeamOpinion(b.token,{text:'오래된 초안',language:'ko',revision:first.revision}),/다른 팀원/);
 assert.equal(r.ctx.getRoomState(b.token).opinions[0].text,'먼저 저장한 결론');
 const latest=r.ctx.getRoomState(b.token).opinions[0];r.ctx.saveTeamOpinion(b.token,{text:'함께 수정한 결론',language:'ko',revision:latest.revision});
 assert.equal(r.ctx.getRoomState(a.token).opinions[0].text,'함께 수정한 결론');
});
test('팀 의견 번역·실패 재시도와 입력 검증',()=>{
 const r=runtime(),a=join(r),state=()=>r.ctx.getRoomState(a.token).opinions[0];
 assert.throws(()=>r.ctx.saveTeamOpinion(a.token,{text:'x'.repeat(1001),language:'ko',revision:state().revision}));
 assert.throws(()=>r.ctx.saveTeamOpinion(a.token,{text:'의견',language:'en',revision:state().revision}));
 r.ctx.saveTeamOpinion(a.token,{text:'의견',language:'ko',revision:state().revision});assert.equal(state().status,'unconfigured');
 r.props.set('OPENAI_API_KEY','test-only-key');r.ctx.retryOpinionTranslation(a.token,state().revision);assert.equal(state().translation,'こんにちは');
 r.ctx.saveTeamOpinion(a.token,{text:'日本語の意見',language:'ja',revision:state().revision});assert.equal(state().translation,'안녕하세요');
 r.ctx.saveTeamOpinion(a.token,{text:'FAIL',language:'ko',revision:state().revision});assert.equal(state().status,'failed');
 r.ctx.saveTeamOpinion(a.token,{text:'',language:'ko',revision:state().revision});assert.equal(state().text,'');assert.equal(state().translation,'');assert.equal(state().status,'none');
});
test('교사 전체 초기화는 모든 팀 대화·의견을 삭제하고 설정 보존·이전 세션 거절',()=>{
 const r=runtime(),a=join(r),b=join(r,5),t=join(r,3,{teacherPassword:'teacher-password-test'});
 r.ctx.sendMessage(a.token,'1팀 대화',randomUUID());r.ctx.sendMessage(b.token,'5팀 대화',randomUUID());
 const first=r.ctx.getRoomState(a.token).opinions[0];r.ctx.saveTeamOpinion(a.token,{text:'결론',language:'ko',revision:first.revision});
 assert.throws(()=>r.ctx.clearAll(a.token,'RESET_ALL'));assert.throws(()=>r.ctx.clearAll(t.token,'wrong'));
 r.ctx.clearAll(t.token,'RESET_ALL');
 assert.equal(r.props.get('EVENT_CODE'),'TEST-EVENT');assert.equal(r.props.get('TEACHER_PASSWORD'),'teacher-password-test');
 assert.throws(()=>r.ctx.sendMessage(a.token,'오래된 입력',randomUUID()),/SESSION_EXPIRED/);assert.throws(()=>r.ctx.getRoomState(b.token),/SESSION_EXPIRED/);
 for(let team=1;team<=5;team++){const s=join(r,team),state=r.ctx.getRoomState(s.token);assert.equal(state.messages.length,0);assert.ok(state.opinions.every(o=>!o.text&&!o.translation));assert.notEqual(state.opinions[0].revision,first.revision);}
});
test('늦게 도착한 번역이 새로운 의견을 덮어쓰지 않음',()=>{
 const r=runtime(),s=join(r);r.props.set('OPENAI_API_KEY','test-only-key');
 const before=r.ctx.getRoomState(s.token).opinions[0];
 r.setProviderHook(()=>{const pending=r.ctx.getRoomState(s.token).opinions[0];r.ctx.saveTeamOpinion(s.token,{text:'新しい意見',language:'ja',revision:pending.revision});});
 r.ctx.saveTeamOpinion(s.token,{text:'이전 의견',language:'ko',revision:before.revision});
 const result=r.ctx.getRoomState(s.token).opinions[0];assert.equal(result.text,'新しい意見');assert.equal(result.translation,'안녕하세요');
});
test('번역 도중 전체 초기화해도 이전 의견·대화가 복구되지 않음',()=>{
 const r=runtime(),s=join(r),t=join(r,1,{teacherPassword:'teacher-password-test'});r.props.set('OPENAI_API_KEY','test-only-key');
 const before=r.ctx.getRoomState(s.token).opinions[0];r.setProviderHook(()=>r.ctx.clearAll(t.token,'RESET_ALL'));
 r.ctx.saveTeamOpinion(s.token,{text:'지워질 의견',language:'ko',revision:before.revision});
 const again=join(r);assert.ok(r.ctx.getRoomState(again.token).opinions.every(o=>!o.text&&!o.translation));
 const teacher=join(r,1,{teacherPassword:'teacher-password-test'});r.setProviderHook(()=>r.ctx.clearAll(teacher.token,'RESET_ALL'));
 r.ctx.sendMessage(again.token,'지워질 대화',randomUUID());assert.equal(r.ctx.getRoomState(join(r).token).messages.length,0);
});
