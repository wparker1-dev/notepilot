/* AI worker request-validation test with mocked upstream and KV. No actual API call. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
  const script=fs.readFileSync(__dirname+'/../optional-ai-worker/worker.js','utf8');
  const worker=(await import('data:text/javascript;base64,'+Buffer.from(script).toString('base64'))).default;
  const state=new Map(), calls=[];
  const env={ALLOWED_ORIGIN:'https://student.github.io',OPENAI_API_KEY:'DO_NOT_USE_EXAMPLE',RATE_LIMIT:{
    async get(k){return state.get(k)},async put(k,v){state.set(k,v)}
  },DAILY_LIMIT:1};
  const realFetch=global.fetch;
  global.fetch=async(url,opts)=>{
    calls.push({url,opts});
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({items:[{front:'What does ATP do?',back:'Transfers energy',refs:['doc1:1']}]})}}]}),{status:200});
  };
  const body={task:'generate',kind:'flashcards',count:3,sources:[{ref:'doc1:1',text:'ATP transfers energy inside cells.',name:'Biology notes',label:'Page 1'}]};
  const req=(origin)=>new Request('https://example.workers.dev/',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
  const denied=await worker.fetch(req('https://evil.example'),env);
  assert.equal(denied.status,403);
  assert.equal(calls.length,0);
  const okay=await worker.fetch(req('https://student.github.io'),env);
  assert.equal(okay.status,200);
  assert.equal((await okay.json()).items[0].refs[0],'doc1:1');
  assert.equal(calls.length,1);
  assert.equal(calls[0].opts.headers.Authorization,'Bearer DO_NOT_USE_EXAMPLE');
  const quota=await worker.fetch(req('https://student.github.io'),env);
  assert.equal(quota.status,429);
  assert.equal(calls.length,1);
  global.fetch=realFetch;
  console.log('PASS: Worker origin checks, outbound AI format, server-side secret, daily rate limit (mocked)');
})().catch(e=>{console.error('FAIL:',e);process.exitCode=1;});
