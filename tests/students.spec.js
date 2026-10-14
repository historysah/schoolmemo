import {test,expect} from '@playwright/test';
import {parseStudentTable,normalizeStudent,BULK_COLUMNS} from '../src/students.js';
test('일괄 파서: 중복 번호, 관계 오류, 필수값, 인용된 여러 줄',()=>{
 const existing=[{id:'s',name:'기존',grade:'2',classroom:'3',number:'1'}];
 expect(parseStudentTable('새학생\t2\t3\t01',existing).errors.join()).toContain('이미 있습니다');
 expect(parseStudentTable('새학생\t2\t3\t4\n다른학생\t2\t3\t4',existing).errors.join()).toContain('이미 있습니다');
 expect(parseStudentTable('새학생\t2\t3\t0',[]).errors.join()).toContain('정수');
 expect(()=>parseStudentTable('이름\t학년\t반',[])).toThrow('번호 열');
});
test('이전 보호자 정보와 엑셀 여러 줄 셀 보존',()=>{
 const old=normalizeStudent({id:'s1',parent:'김보호',parentPhone:'010-1234-5678'});
 expect(old.guardians).toEqual([{relation:'기타',name:'김보호',phone:'010-1234-5678'}]);
 const cells=['신가상','2','3','4','010-0000-0004','주소','부','신보호','010-0000-1004','모','이보호','010-0000-2004','교사','가상대','교육학과','"첫 줄\n둘째 줄"'];
 const result=parseStudentTable(BULK_COLUMNS.join('\t')+'\n'+cells.join('\t'),[]);
 expect(result.errors).toEqual([]);expect(result.students[0].extra.notes).toBe('첫 줄\n둘째 줄');expect(result.students[0].guardians).toHaveLength(2);
 expect(()=>parseStudentTable('이름\t학년\t반',[])).toThrow('번호 열');
 expect(parseStudentTable('새학생\t2\t3\t4\t\t\t아버지\t성함',[]).errors.join()).toContain('관계');
});
test('기존 보호자 보존, 두 보호자 수정, 추가 정보 별도 저장',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/학생 명부 및 인적사항/}).click();
 await expect(page.locator('.student-card .avatar')).toHaveCount(0);
 await page.getByRole('button',{name:/김하늘/}).click();await expect(page.getByText('김보호',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'기본 정보 수정'}).click();const d=page.locator('dialog');
 await expect(d.getByLabel('보호자 1 성함')).toHaveValue('김보호');
 await d.getByLabel('보호자 1 관계').selectOption('부');await d.getByLabel('보호자 2 관계').selectOption('모');await d.getByLabel('보호자 2 성함').fill('이가상');await d.getByLabel('보호자 2 연락처').fill('010-0000-2000');await d.getByRole('button',{name:'저장하기'}).click();
 await page.getByRole('button',{name:'추가 정보 입력 / 수정'}).click();await d.getByLabel('장래희망').fill('교사');await d.getByLabel('희망 대학').fill('가상대학교');await d.getByLabel('희망 학과').fill('교육학과');await d.getByLabel('기타',{exact:true}).fill('첫 줄\n자유롭게 작성하는 내용');await d.getByRole('button',{name:'저장하기'}).click();
 await page.getByRole('button',{name:'기본 정보 수정'}).click();await d.getByLabel('주소',{exact:true}).fill('변경한 가상 주소');await d.getByRole('button',{name:'저장하기'}).click();
 await page.reload();await page.getByRole('button',{name:/학생 명부 및 인적사항/}).click();await page.getByRole('button',{name:/김하늘/}).click();await expect(page.getByText('이가상',{exact:true})).toBeVisible();await expect(page.getByText('교육학과',{exact:true})).toBeVisible();await expect(page.getByText('변경한 가상 주소',{exact:true})).toBeVisible();
 await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'기본 정보 수정'}).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('일괄 입력 검증, 등록, 새로고침, 기존 학생 보존',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/학생 명부 및 인적사항/}).click();await page.getByRole('button',{name:'일괄 정보 입력',exact:true}).click();const d=page.locator('dialog');
 await expect(d.getByRole('button',{name:'일괄 등록하기'})).toBeDisabled();
 await d.getByLabel('학생 표 붙여넣기').fill('중복학생\t2\t3\t1');await d.getByRole('button',{name:'입력 내용 확인'}).click();await expect(d.getByRole('button',{name:'일괄 등록하기'})).toBeDisabled();await expect(d.locator('#form-error')).toContainText('이미 있습니다');
 const rows=['신가상','2','3','4','','','부','신보호','010-0000-4000','','','','교사','가상대','교육학과','참고 사항'];
 await d.getByLabel('학생 표 붙여넣기').fill(BULK_COLUMNS.join('\t')+'\n'+rows.join('\t')+'\n이가상\t2\t3\t5');await d.getByRole('button',{name:'입력 내용 확인'}).click();await expect(d.getByRole('button',{name:'일괄 등록하기'})).toBeEnabled();await expect(d.locator('tbody tr')).toHaveCount(2);await d.getByRole('button',{name:'일괄 등록하기'}).click();
 await expect(page.locator('.student-card')).toHaveCount(5);await page.reload();await page.getByRole('button',{name:/학생 명부 및 인적사항/}).click();await expect(page.locator('.student-card')).toHaveCount(5);await page.getByRole('button',{name:/신가상/}).click();await expect(page.getByText('신보호',{exact:true})).toBeVisible();await expect(page.getByText('교육학과',{exact:true})).toBeVisible();
});
test('일반 엑셀 양식 다운로드: 정상 파일, 열 제목, 연락처 서식과 관계 선택',async({page})=>{
 const {execFileSync}=await import('node:child_process');
 await page.goto('/');await page.getByRole('button',{name:/학생 명부 및 인적사항/}).click();await page.getByRole('button',{name:'일괄 정보 입력',exact:true}).click();
 const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'엑셀 양식 다운로드 (.xlsx)',exact:true}).click();const download=await downloadPromise;
 expect(download.suggestedFilename()).toBe('학생_일괄입력_양식.xlsx');expect(await download.failure()).toBeNull();
 execFileSync('python',['-c',`
import sys,json,zipfile,xml.etree.ElementTree as E
ns={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(sys.argv[1]) as z:
 assert z.testzip() is None
 sheet=E.fromstring(z.read('xl/worksheets/sheet1.xml'))
 headers=[''.join(c.itertext()) for c in sheet.findall('.//m:row[@r="1"]/m:c/m:is/m:t',ns)]
 assert headers==json.loads(sys.argv[2])
 styles=E.fromstring(z.read('xl/styles.xml')).find('m:cellXfs',ns)
 for cell in ['E2','I2','L2']:
  c=sheet.find('.//m:c[@r="'+cell+'"]',ns)
  assert styles[int(c.get('s'))].get('numFmtId')=='49'
 rules=sheet.findall('m:dataValidations/m:dataValidation',ns)
 assert any(r.get('type')=='list' and 'G2:G301' in r.get('sqref') and 'J2:J301' in r.get('sqref') and r.find('m:formula1',ns).text=='"부,모,기타"' for r in rules)
 workbook=E.fromstring(z.read('xl/workbook.xml'))
 assert [s.get('name') for s in workbook.findall('m:sheets/m:sheet',ns)]==['학생 입력','사용 안내']
`,await download.path(),JSON.stringify(BULK_COLUMNS)]);
});
