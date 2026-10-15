import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import vm from 'node:vm';
test('Apps Script 서버: 소유자 확인, 초기화 재실행, 분할 저장, 수정 충돌',()=>{
 let email='owner@example.test',rows=[],props={},locked=false;
 const sheet={getLastRow:()=>{let n=rows.length;while(n&&rows[n-1].every(v=>v===''))n--;return n;},getMaxRows:()=>1000,getDataRange:()=>({getValues:()=>structuredClone(rows)}),getRange:()=>({setValues:values=>{rows=values.map(row=>row.map(v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):v));}})};
 const book={getId:()=> 'book',getSheetByName:()=>rows.length?sheet:null,insertSheet:()=>sheet,toast:()=>{}};
 const context=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=>email}),getEffectiveUser:()=>({getEmail:()=> 'owner@example.test'})},PropertiesService:{getScriptProperties:()=>({getProperty:k=>props[k],setProperties:p=>Object.assign(props,p)})},SpreadsheetApp:{getActiveSpreadsheet:()=>book,openById:()=>book,flush:()=>{}},LockService:{getScriptLock:()=>({waitLock:()=>{if(locked)throw Error('locked');locked=true;},releaseLock:()=>{locked=false;}})}});
 vm.runInContext(fs.readFileSync('teacher-notebook-apps-script/Code.gs','utf8'),context);
 expect(()=>context.getNotebook()).toThrow('먼저 실행');context.setupNotebook();expect(context.getNotebook().revision).toBe(0);
 const data={students:[{id:'s1',name:'가상학생',grade:'2',classroom:'3',number:'1',guardians:[],extra:{notes:'가'.repeat(65000)}}],records:[]};
 context.saveNotebook(data,0);expect(context.getNotebook().data.students[0].extra.notes).toHaveLength(65000);
 expect(()=>context.saveNotebook({students:[],records:[]},0)).toThrow('다른 컴퓨터');context.setupNotebook();expect(context.getNotebook().data.students).toHaveLength(1);
 email='other@example.test';expect(()=>context.getNotebook()).toThrow('본인 계정');expect(()=>context.saveNotebook(data,1)).toThrow('본인 계정');email='';expect(()=>context.getNotebook()).toThrow('본인 계정');
 expect(locked).toBe(false);
});
test('Apps Script 화면: 클라우드 읽기·저장과 충돌 시 편집 차단',async({page})=>{
 let state={data:{students:[],records:[]},revision:0};
 await page.exposeFunction('__gasCall',async(method,args)=>{
  if(method==='getNotebook')return structuredClone(state);
  if(method==='saveNotebook'){if(args[1]!==state.revision)throw Error('다른 컴퓨터에서 수정했습니다. 새로고침해주세요.');state={data:structuredClone(args[0]),revision:state.revision+1};return {revision:state.revision};}
  throw Error('Unknown method');
 });
 await page.addInitScript(()=>{function runner(success,failure){return new Proxy({}, {get(_target,key){if(key==='withSuccessHandler')return cb=>runner(cb,failure);if(key==='withFailureHandler')return cb=>runner(success,cb);return(...args)=>window.__gasCall(key,args).then(success,failure);}});}window.google={script:{run:runner()}};});
 await page.goto('/teacher-notebook-apps-script/Index.html');await page.getByRole('heading',{name:'통합 기록 및 상담 관리'}).waitFor();
 await page.getByRole('button',{name:/학생 명부 및 인적사항/}).click();await page.getByRole('button',{name:'학생 추가',exact:true}).click();const d=page.locator('dialog');await d.getByLabel('이름 *').fill('가상학생');await d.getByLabel('학년 *').fill('2');await d.getByLabel('반 *',{exact:true}).fill('3');await d.getByLabel('번호 *',{exact:true}).fill('1');await d.getByRole('button',{name:'저장하기'}).click();await expect(page.locator('#cloud-status')).toHaveText('클라우드 저장 완료');expect(state.data.students).toHaveLength(1);
 await page.reload();await page.getByRole('button',{name:/학생 명부 및 인적사항/}).click();await page.getByRole('button',{name:/가상학생/}).click();state.revision++;
 await page.getByRole('button',{name:'추가 정보 입력 / 수정'}).click();await d.getByLabel('장래희망').fill('교사');await d.getByRole('button',{name:'저장하기'}).click();await expect(page.locator('#cloud-error')).toContainText('다른 컴퓨터');await expect(page.locator('#app')).toHaveAttribute('inert','');expect(state.data.students[0].extra.career).toBe('');
});
