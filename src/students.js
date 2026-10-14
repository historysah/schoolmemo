export const BASIC_FIELDS = [
 ['name','이름',true],['grade','학년',true],['classroom','반',true],['number','번호',true],
 ['phone','학생 휴대전화 번호',false],['address','주소',false],
];
export const EXTRA_FIELDS = [['career','장래희망'],['university','희망 대학'],['major','희망 학과'],['notes','기타']];
export const BULK_COLUMNS = [...BASIC_FIELDS.map(f=>f[1]),'보호자1 관계','보호자1 성함','보호자1 연락처','보호자2 관계','보호자2 성함','보호자2 연락처',...EXTRA_FIELDS.map(f=>f[1])];
export const studentKey = s => [s.grade,s.classroom,s.number].map(Number).join('-');
export function normalizeStudent(s){
 const copy={...s};
 copy.guardians=Array.isArray(s.guardians)?s.guardians.slice(0,2).map(g=>({...g})):s.parent||s.parentPhone?[{relation:'기타',name:s.parent||'',phone:s.parentPhone||''}]:[];
 copy.extra={career:'',university:'',major:'',notes:'',...s.extra};
 delete copy.parent;delete copy.parentPhone;
 return copy;
}
export function validateStudent(s,others=[]){
 if(!s.name?.trim())return '이름을 입력해주세요.';
 for(const [key,label] of BASIC_FIELDS.slice(1,4))if(!/^\d+$/.test(String(s[key]))||Number(s[key])<1||Number(s[key])>999)return `${label}은 1~999 사이의 정수로 입력해주세요.`;
 if(others.some(x=>(!s.id||x.id!==s.id)&&studentKey(x)===studentKey(s)))return '같은 학년·반·번호의 학생이 이미 있습니다.';
 for(const [i,g] of (s.guardians||[]).entries())if((g.relation||g.name||g.phone)&&!['부','모','기타'].includes(g.relation))return `보호자 ${i+1}의 관계를 선택해주세요.`;
 return '';
}
// Excel copies quoted cells when they contain line breaks or tabs.
function readTable(text){
 const rows=[];let row=[],cell='',quoted=false;
 text=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n');
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'&&(quoted||cell==='')){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(!quoted&&(c==='\t'||c==='\n')){row.push(cell);cell='';if(c==='\n'){rows.push(row);row=[];}}
  else cell+=c;
 }
 if(quoted)throw new Error('닫히지 않은 따옴표가 있습니다. 엑셀에서 표를 다시 복사해주세요.');
 row.push(cell);rows.push(row);return rows;
}
export function parseStudentTable(text,existing){
 const rows=readTable(text);if(!rows.some(r=>r.some(v=>v.trim())))throw new Error('학생 정보를 붙여넣어주세요.');
 let headers=BULK_COLUMNS,start=0;
 if(rows[0][0].trim()==='이름'){
  headers=rows[0].map(v=>v.trim());start=1;
  if(new Set(headers).size!==headers.length)throw new Error('열 제목이 중복되었습니다.');
  for(const required of ['이름','학년','반','번호'])if(!headers.includes(required))throw new Error(`${required} 열이 필요합니다.`);
  for(const h of headers)if(!BULK_COLUMNS.includes(h))throw new Error(`알 수 없는 열: ${h}. 양식의 열 제목을 사용해주세요.`);
 }
 const imported=[],errors=[];
 for(let i=start;i<rows.length;i++){
  const row=rows[i];if(!row.some(v=>v.trim()))continue;
  if(row.length>headers.length){errors.push(`${i+1}행: 열 개수가 양식보다 많습니다.`);continue;}
  const values=Object.fromEntries(headers.map((h,j)=>[h,(row[j]||'').trim()]));
  const s={...Object.fromEntries(BASIC_FIELDS.map(([k,label])=>[k,values[label]||''])),guardians:[],extra:Object.fromEntries(EXTRA_FIELDS.map(([k,label])=>[k,values[label]||'']))};
  for(let g=1;g<=2;g++){const item={relation:values[`보호자${g} 관계`]||'',name:values[`보호자${g} 성함`]||'',phone:values[`보호자${g} 연락처`]||''};if(Object.values(item).some(Boolean))s.guardians.push(item);}
  const error=validateStudent(s,[...existing,...imported]);if(error)errors.push(`${i+1}행: ${error}`);
  imported.push(s);
 }
 if(imported.length===0&&!errors.length)errors.push('등록할 학생이 없습니다.');
 return {students:imported,errors};
}
