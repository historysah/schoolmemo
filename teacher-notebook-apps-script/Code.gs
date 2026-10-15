/** 스프레드시트에 연결된 Apps Script에서 사용하세요. */
function setupNotebook() {
  const email = Session.getActiveUser().getEmail();
  if (!email || email !== Session.getEffectiveUser().getEmail()) {
    throw new Error('스프레드시트를 만든 본인 계정으로 실행해주세요.');
  }
  const props = PropertiesService.getScriptProperties();
  const previous = props.getProperty('NOTEBOOK_OWNER');
  if (previous && previous !== email) throw new Error('설정한 소유자만 실행할 수 있습니다.');
  const book = SpreadsheetApp.getActiveSpreadsheet();
  if (!book) throw new Error('스프레드시트의 확장 프로그램 → Apps Script에서 실행해주세요.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    props.setProperties({NOTEBOOK_OWNER: email, NOTEBOOK_BOOK: book.getId()});
    let sheet = book.getSheetByName('교무수첩_저장소');
    if (!sheet) sheet = book.insertSheet('교무수첩_저장소');
    if (!sheet.getLastRow()) {
      writeState_(sheet, {students: [], records: []}, 0);
    }
    book.toast('설정 완료. 이제 웹 앱으로 배포하세요.');
  } finally { lock.releaseLock(); }
}

function doGet() {
  requireOwner_();
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('참교무수첩')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function requireOwner_() {
  const props = PropertiesService.getScriptProperties();
  const owner = props.getProperty('NOTEBOOK_OWNER');
  if (!owner) throw new Error('Apps Script 편집기에서 setupNotebook을 먼저 실행해주세요.');
  const active = Session.getActiveUser().getEmail();
  if (!active || active !== owner) throw new Error('이 교무수첩은 설정한 본인 계정만 사용할 수 있습니다.');
  return props;
}

function sheet_() {
  const props = requireOwner_();
  const book = SpreadsheetApp.openById(props.getProperty('NOTEBOOK_BOOK'));
  const sheet = book.getSheetByName('교무수첩_저장소');
  if (!sheet) throw new Error('저장소 시트가 없습니다. setupNotebook을 다시 실행해주세요.');
  return sheet;
}

function readState_(sheet) {
  const rows = sheet.getDataRange().getValues();
  if (rows[0][0] !== '버전' || typeof rows[0][1] !== 'number') throw new Error('저장소 형식이 올바르지 않습니다. 저장소 시트를 직접 수정하지 마세요.');
  const text = rows.slice(1).map(row => row[1] || '').join('');
  const data = JSON.parse(text);
  validateData_(data);
  return {data: data, revision: rows[0][1]};
}

function getNotebook() {
  const sheet = sheet_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return readState_(sheet); }
  finally { lock.releaseLock(); }
}

function saveNotebook(data, expectedRevision) {
  const sheet = sheet_();
  validateData_(data);
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const state = readState_(sheet);
    if (state.revision !== expectedRevision) {
      throw new Error('다른 컴퓨터나 창에서 수정했습니다. 현재 입력 내용을 복사해 둔 뒤 새로고침해주세요.');
    }
    writeState_(sheet, data, state.revision + 1);
    return {revision: state.revision + 1};
  } finally { lock.releaseLock(); }
}

function validateData_(data) {
  if (!data || !Array.isArray(data.students) || !Array.isArray(data.records)) throw new Error('데이터 형식 오류');
  const ids = new Set();
  const numbers = new Set();
  data.students.forEach(s => {
    if (!s || typeof s.id !== 'string' || !s.id || ids.has(s.id) || typeof s.name !== 'string' || !s.name.trim()) throw new Error('학생 정보가 올바르지 않습니다.');
    ids.add(s.id);
    ['grade','classroom','number'].forEach(k => {
      if (!/^\d+$/.test(String(s[k])) || Number(s[k]) < 1 || Number(s[k]) > 999) throw new Error('학년·반·번호를 확인해주세요.');
    });
    const key = [s.grade,s.classroom,s.number].map(Number).join('-');
    if (numbers.has(key)) throw new Error('학생 학년·반·번호가 중복되었습니다.');
    numbers.add(key);
    if (!Array.isArray(s.guardians) || s.guardians.length > 2) throw new Error('보호자는 2명까지 입력할 수 있습니다.');
    s.guardians.forEach(g => { if (!g || !['부','모','기타'].includes(g.relation)) throw new Error('보호자 관계를 확인해주세요.'); });
  });
  const recordIds = new Set();
  data.records.forEach(r => {
    if (!r || typeof r.id !== 'string' || !r.id || recordIds.has(r.id) || typeof r.title !== 'string' || !r.title.trim() || typeof r.content !== 'string' || !r.content.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || typeof r.important !== 'boolean' || !Array.isArray(r.studentIds) || r.studentIds.some(id => !ids.has(id))) throw new Error('기록 정보가 올바르지 않습니다.');
    recordIds.add(r.id);
  });
  if (JSON.stringify(data).length > 2000000) throw new Error('체험 버전의 저장 용량을 초과했습니다.');
}

function writeState_(sheet, data, revision) {
  // 모든 변경을 한 번의 범위 쓰기로 저장합니다. 셀의 수식 실행도 방지합니다.
  const text = JSON.stringify(data);
  const chunks = [];
  for (let i = 0; i < text.length;) {
    let end = Math.min(i + 30000, text.length);
    const last = text.charCodeAt(end - 1);
    if (last >= 0xD800 && last <= 0xDBFF) end--;
    chunks.push(text.slice(i, end));
    i = end;
  }
  const rows = [['버전', revision]].concat(chunks.map((chunk, i) => ['조각 ' + (i + 1), "'" + chunk]));
  while (rows.length < sheet.getLastRow()) rows.push(['','']);
  if (rows.length > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rows.length - sheet.getMaxRows());
  sheet.getRange(1, 1, rows.length, 2).setValues(rows);
  SpreadsheetApp.flush();
}
