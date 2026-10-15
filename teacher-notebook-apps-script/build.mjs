import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const require=createRequire(root+'/package.json');const {build}=require('esbuild');
let s=fs.readFileSync(root+'/src/main.js','utf8').replace("import './style.css';",'');
const start=s.indexOf("const KEY =");const end=s.indexOf('const esc =',start);
s=s.slice(0,start)+`const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(new Date());
const id = () => crypto.randomUUID();
let data={students:[],records:[]}, storageProblem='', revision=0;
let saveQueue=Promise.resolve(), pendingSaves=0, cloudFailed=false;
`+s.slice(end);
const a=s.indexOf('function persist()');const b=s.indexOf('function matchingRecords',a);
s=s.slice(0,a)+`
function cloudCall(method,...args){return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(resolve).withFailureHandler(reject)[method](...args));}
function updateCloudStatus(){let box=document.querySelector('#cloud-status');if(!box){box=document.createElement('div');box.id='cloud-status';box.setAttribute('role','status');document.body.append(box);}box.textContent=cloudFailed?'클라우드 저장 실패':pendingSaves?'클라우드 저장 중 · 창을 닫지 마세요':'클라우드 저장 완료';}
function showCloudError(error){cloudFailed=true;updateCloudStatus();document.querySelector('#app').inert=true;let box=document.querySelector('#cloud-error');if(!box){box=document.createElement('section');box.id='cloud-error';box.setAttribute('role','alert');document.body.append(box);}box.innerHTML='<h2>클라우드 연결을 확인해주세요</h2><p>'+esc(error?.message||String(error))+'</p><p>저장되지 않은 내용이 있을 수 있습니다. 백업을 내려받은 후 다시 열어주세요.</p><button id="recover-data">현재 내용 백업 (.json)</button> <button id="reload-app">새로고침</button>';box.querySelector('#recover-data').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='교무수첩_복구용.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};box.querySelector('#reload-app').onclick=()=>location.reload();}
function persist(){if(cloudFailed)return false;const snapshot=structuredClone(data);pendingSaves++;updateCloudStatus();saveQueue=saveQueue.then(async()=>{if(cloudFailed)return;const result=await cloudCall('saveNotebook',snapshot,revision);revision=result.revision;}).catch(showCloudError).finally(()=>{pendingSaves--;updateCloudStatus();});return true;}
window.addEventListener('beforeunload',e=>{if(pendingSaves||cloudFailed){e.preventDefault();e.returnValue='';}});
`+s.slice(b);
s=s.replaceAll('브라우저에 저장하는 체험판','Google 스프레드시트 연결').replaceAll('테스트용 교무수첩','본인 전용 · 클라우드 수첩').replaceAll('데이터는 현재 브라우저의 localStorage에 저장되며 다른 기기와 공유되지 않습니다.','데이터는 연결한 Google 스프레드시트에 저장됩니다. 다른 컴퓨터에서는 같은 계정으로 열고 새로고침하세요.');
// Keep the Excel workbook inside the self-contained Apps Script HTML.
const templateCode=fs.readFileSync(root+'/teacher-notebook-apps-script/excel-template.js','utf8');
s=templateCode+'\n'+s;
s=s.replace("a.href=import.meta.env.BASE_URL+'templates/학생_일괄입력_양식.xlsx';",`const url=URL.createObjectURL(excelTemplate());a.href=url;setTimeout(()=>URL.revokeObjectURL(url),1000);`);
const last=s.lastIndexOf('render();');
s=s.slice(0,last)+`document.querySelector('#app').innerHTML='<div class="empty">Google 스프레드시트에서 불러오는 중입니다…</div>';
cloudCall('getNotebook').then(result=>{data=result.data;data.students=data.students.map(normalizeStudent);revision=result.revision;render();updateCloudStatus();}).catch(showCloudError);
`+s.slice(last+'render();'.length);
const result=await build({stdin:{contents:s,resolveDir:root+'/src',sourcefile:'apps-script-client.js'},bundle:true,write:false,format:'iife',target:'es2020',minify:true,charset:'utf8'});
const js=result.outputFiles[0].text.replaceAll('</script','<\\/script');
const css=fs.readFileSync(root+'/teacher-notebook-apps-script/compact.css','utf8')+`\n#cloud-status{position:fixed;bottom:12px;right:16px;background:#1e293b;color:white;padding:10px 14px;border-radius:8px;font-size:12px;z-index:20}#cloud-error{position:fixed;z-index:100;inset:15vh max(16px,15vw) auto;background:white;box-shadow:0 0 0 100vmax #09142699;border-radius:14px;padding:24px;line-height:1.8}#cloud-error p{overflow-wrap:anywhere}#cloud-error button{padding:12px;background:#e5edff;color:#0051d5;border-radius:8px;margin:8px 8px 0 0}\n`;
fs.writeFileSync(root+'/teacher-notebook-apps-script/Index.html',`<!DOCTYPE html>\n<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><base target="_top"><title>참교무수첩</title><style>\n${css}\n</style></head><body><div id="app"></div><script>\n${js}\n</script></body></html>\n`);
console.log('Apps Script standalone HTML generated');
