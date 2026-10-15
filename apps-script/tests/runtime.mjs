import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {randomUUID,createHash} from 'node:crypto';
export function runtime(){
 const props=new Map([['EVENT_CODE','TEST-EVENT'],['SPREADSHEET_ID','test-sheet'],['TEACHER_PASSWORD','teacher-password-test']]);
 const cache=new Map(),sheets=new Map();let locked=false,providerCalls=0;
 const literal=v=>typeof v==='string'&&v.startsWith("'")?v.slice(1):v;
 function makeSheet(){const data=[];return {data,appendRow(row){data.push(row.map(literal));},setFrozenRows(){},getLastRow(){return data.length;},deleteRow(row){data.splice(row-1,1);},getRange(row,column,height=1,width=1){return {getValues(){return data.slice(row-1,row-1+height).map(r=>r.slice(column-1,column-1+width));},setValue(value){data[row-1][column-1]=literal(value);},setValues(values){values.forEach((r,i)=>r.forEach((v,j)=>data[row-1+i][column-1+j]=literal(v)));}};}};}
 const ctx=vm.createContext({console,PropertiesService:{getScriptProperties:()=>({getProperty:key=>props.get(key)||null})},CacheService:{getScriptCache:()=>({get:key=>cache.get(key)||null,put:(key,v)=>cache.set(key,v),remove:key=>cache.delete(key)})},Utilities:{getUuid:randomUUID,DigestAlgorithm:{SHA_256:'sha256'},Charset:{UTF_8:'utf8'},computeDigest:(_,value)=>Array.from(createHash('sha256').update(value).digest()),base64EncodeWebSafe:bytes=>Buffer.from(bytes).toString('base64url')},LockService:{getScriptLock:()=>({tryLock(){if(locked)throw new Error('Nested lock');locked=true;return true;},releaseLock(){locked=false;}})},SpreadsheetApp:{openById:()=>({getSheetByName:name=>sheets.get(name),insertSheet:name=>{const s=makeSheet();sheets.set(name,s);return s;}}),flush(){}},UrlFetchApp:{fetch:(url,options)=>{providerCalls++;if(locked)throw new Error('Provider called while lock held');if(url!=='https://api.openai.com/v1/chat/completions')throw new Error('Unexpected destination');const body=JSON.parse(options.payload);if(options.headers.Authorization!=='Bearer test-only-key')throw new Error('Bad auth');const failed=body.messages[1].content==='FAIL';return {getResponseCode:()=>failed?429:200,getContentText:()=>JSON.stringify({choices:[{message:{content:body.messages[0].content.includes('Korean into Japanese')?'こんにちは':'안녕하세요'}}]})};}}});
 vm.runInContext(readFileSync(new URL('../Code.gs',import.meta.url),'utf8'),ctx);
 return {ctx,props,cache,sheets,get providerCalls(){return providerCalls;}};
}
export function join(r,team=1,extra={}){return r.ctx.joinRoom({code:'TEST-EVENT',name:'학생',language:'ko',team,...extra});}
