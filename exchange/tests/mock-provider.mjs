// Test-only provider: never imported by the application or npm start.
const original=globalThis.fetch;
globalThis.fetch=async(url,options)=>{
 if(url==='https://api.openai.com/v1/chat/completions'){
  const request=JSON.parse(options.body);
  if(options.headers.Authorization!=='Bearer test-only-key')throw new Error('Unexpected test authentication');
  if(request.messages[1].content==='FAIL')return new Response('{}',{status:429});
  const japanese=request.messages[0].content.includes('Korean to Japanese');
  return Response.json({choices:[{message:{content:japanese?'こんにちは':'안녕하세요'}}]});
 }
 return original(url,options);
};
