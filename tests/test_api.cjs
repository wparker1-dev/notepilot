/* Data-layer regression test. Run: node tests/test_api.cjs
   Simulates IndexedDB transaction events; does not replace a real-browser E2E test. */
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
globalThis.crypto=webcrypto;
globalThis.location={href:'https://student.github.io/notepilot/'};
globalThis.window={NOTEPILOT_CONFIG:{aiEndpoint:''}};
class MemoryDB{
  constructor(){this.stores={};}
  createObjectStore(name){this.stores[name]=new Map();}
  transaction(names,mode){return new MemoryTransaction(this);}
}
class MemoryTransaction{
  constructor(db){this.db=db;this.active=0;this.aborted=false;this.completeScheduled=false;}
  objectStore(name){
    const map=this.db.stores[name], tx=this;
    return {
      get(key){return tx.request(()=>structuredClone(map.get(key)));},
      getAll(){return tx.request(()=>[...map.values()].map(v=>structuredClone(v)));},
      put(data){return tx.request(()=>{map.set(data.id,structuredClone(data));return data.id;});},
      delete(key){return tx.request(()=>map.delete(key))}
    };
  }
  request(fn){
    this.active++;
    const req={onsuccess:null,onerror:null,result:undefined};
    setImmediate(()=>{
      if(this.aborted)return;
      try{req.result=fn();req.onsuccess?.({target:req});}
      catch(e){this.error=e;this.abort();}
      this.active--;
      if(!this.active&&!this.completeScheduled){this.completeScheduled=true;setImmediate(()=>{if(!this.aborted&&this.active===0)this.oncomplete?.();});}
    });
    return req;
  }
  abort(){this.aborted=true;this.onabort?.();}
}
const memoryDB=new MemoryDB();
globalThis.indexedDB={open(){
  const req={result:memoryDB,onsuccess:null,onerror:null,onupgradeneeded:null};
  setImmediate(()=>{req.onupgradeneeded?.();req.onsuccess?.();});return req;
}};
vm.runInThisContext(fs.readFileSync(__dirname+'/../static/web_api.js','utf8'));
const api=window.NotePilotLocal.api;
(async()=>{
 const baseline=await api('/api/state');assert.deepEqual(baseline.documents,[]);
 const note=Array.from({length:10},(_,i)=>`Biology concept ${i}: Enzyme mechanism ${i} describes how the reactants interact with each other during a controlled metabolic process.`).join('\n');
 const {id:sourceId}=await api('/api/paste','POST',{title:'Class biology notes',text:note});
 assert.equal((await api('/api/state')).documents.length,1);
 const {id:mid,count}=await api('/api/generate','POST',{title:'My Exam 1',kind:'flashcards',mode:'rules',source_ids:[sourceId],count:12});
 assert.ok(count>=8,`rule generation gave ${count}`);
 let m=await api('/api/materials/'+mid);
 assert.equal(m.items.length,count);assert.ok(m.items.every(x=>x.refs.every(r=>m.sources.some(s=>s.ref===r))));
 let item=m.items[0];
 let result=await api(`/api/materials/${mid}/progress`,'POST',{item_id:item.id,status:'known',version:m.version});
 assert.equal(result.earned,5);
 m=await api('/api/materials/'+mid);
 result=await api(`/api/materials/${mid}/progress`,'POST',{item_id:item.id,status:'review',version:m.version});
 m=await api('/api/materials/'+mid);
 result=await api(`/api/materials/${mid}/progress`,'POST',{item_id:item.id,status:'known',version:m.version});
 assert.equal(result.earned,0,'same item cannot earn coins twice');
 const chat=await api(`/api/materials/${mid}/chat`,'POST',{message:'Where is the enzyme mechanism described?',mode:'rules',item_id:item.id});
 assert.ok(chat.refs.length>=1);
 m=await api('/api/materials/'+mid);
 await api(`/api/materials/${mid}/items/${item.id}`,'PUT',{front:'Edited question',back:'Edited answer',version:m.version});
 m=await api('/api/materials/'+mid);assert.equal(m.items[0].front,'Edited question');
 await api(`/api/materials/${mid}/undo`,'POST',{version:m.version});
 m=await api('/api/materials/'+mid);assert.notEqual(m.items[0].front,'Edited question');
 for(const next of m.items.slice(1,8)){
  const fresh=await api('/api/materials/'+mid);
  await api(`/api/materials/${mid}/progress`,'POST',{item_id:next.id,status:'known',version:fresh.version});
 }
 const s=await api('/api/shop');assert.equal(s.profile.coins,40);
 const bought=await api('/api/shop/buy','POST',{theme:'ocean'});
 assert.equal(bought.profile.coins,5);assert.equal(bought.profile.equipped,'ocean');
 await api('/api/shop/equip','POST',{theme:'lavender'});
 assert.equal((await api('/api/shop')).profile.equipped,'lavender');
 assert.ok((await api('/api/state')).materials.length===1);
 const snapshot=await api('/api/materials/'+mid);
 await assert.rejects(api(`/api/materials/${mid}/items/${item.id}`,'PUT',{front:'Should fail',back:'Stale write',version:snapshot.version-1}));
 let guide=await api('/api/generate','POST',{title:'Guide',kind:'guide',mode:'rules',source_ids:[sourceId],count:5});
 assert.ok(guide.count>0);
 let exam=await api('/api/generate','POST',{title:'Exam',kind:'exam',mode:'rules',source_ids:[sourceId],count:5});
 assert.ok(exam.count>0);
 await assert.rejects(api('/api/documents/'+sourceId,'DELETE'),/Delete the study sets/);
 for(const record of (await api('/api/state')).materials)await api('/api/materials/'+record.id,'DELETE');
 await api('/api/documents/'+sourceId,'DELETE');
 assert.equal((await api('/api/state')).documents.length,0);
 console.log('PASS: persistence, class-specific generation, citations, study progress, no repeat coin rewards, source helper, editing, undo, shop, stale versions, guide, exam, protected source delete');
})().catch(e=>{console.error('FAIL:',e);process.exitCode=1;});
