/* NotePilot GitHub Pages data layer: browser-only IndexedDB, no Flask server. */
'use strict';
(function () {
  const DATABASE = 'notepilot-pages-v1';
  const STOP = new Set('the a an and or of to in is are was were for with this that from on as by it be what how explain please more about can you my notes material study'.split(' '));
  const THEMES = [
    {id:'lavender', name:'Lavender', cost:0, colors:['#6550e8','#ebe8ff'], description:'The original NotePilot purple'},
    {id:'ocean', name:'Ocean Blue', cost:35, colors:['#0867c1','#dcefff'], description:'A calm blue workspace'},
    {id:'forest', name:'Forest Mint', cost:70, colors:['#087c68','#d8f6ed'], description:'Fresh green study sessions'},
    {id:'sunset', name:'Sunset Peach', cost:110, colors:['#cc5b4d','#fff0df'], description:'A warm and focused look'}
  ];
  const defaultProfile = () => ({id:'profile', coins:0, unlocked:['lavender'], equipped:'lavender', rewardedIds:[]});
  let uploadProgress = () => {};
  let dbPromise;
  function db() {
    if (!dbPromise) dbPromise = new Promise((resolve,reject) => {
      const req = indexedDB.open(DATABASE,1);
      req.onupgradeneeded = () => {
        const d=req.result;
        d.createObjectStore('documents',{keyPath:'id'});
        d.createObjectStore('materials',{keyPath:'id'});
        d.createObjectStore('settings',{keyPath:'id'});
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
      req.onblocked=()=>reject(new Error('Close other NotePilot tabs and reload.'));
    });
    return dbPromise;
  }
  async function transaction(stores, mode, start) {
    const database = await db();
    return new Promise((resolve,reject) => {
      const tx=database.transaction(stores,mode);
      let result;
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(tx.error || new Error('Save failed. Check browser storage space.'));
      tx.onerror=()=>{};
      try {start(tx, value=>{result=value;});} catch(e){tx.abort(); reject(e);}
    });
  }
  const get = (store,key) => transaction([store],'readonly',(tx,set)=>{
    const r=tx.objectStore(store).get(key);r.onsuccess=()=>set(r.result);
  });
  const all = store => transaction([store],'readonly',(tx,set)=>{
    const r=tx.objectStore(store).getAll();r.onsuccess=()=>set(r.result);
  });
  const put = (store,item) => transaction([store],'readwrite',(tx)=>{tx.objectStore(store).put(item);});
  const remove = (store,key) => transaction([store],'readwrite',(tx)=>{tx.objectStore(store).delete(key);});
  const stamp = () => new Date().toISOString();
  const id = () => crypto.randomUUID();
  const error = message => {throw new Error(message);};
  const needed = (value,label,max) => {
    if(typeof value !== 'string' || !value.trim() || value.length>max)error(`${label} must be 1–${max} characters.`);
    return value.trim();
  };
  const summary = d => ({id:d.id,name:d.name,created:d.created,sections:d.units.length,characters:d.units.reduce((n,u)=>n+u.text.length,0)});
  const brief = m => ({id:m.id,title:m.title,kind:m.kind,created:m.created,updated:m.updated,source_ids:m.source_ids,
    mode:m.mode,version:m.version,count:m.items.length,known:m.items.filter(i=>i.status==='known').length});
  async function profile() {return await get('settings','profile') || defaultProfile();}
  const sourceUnits = async sourceIds => {
    if(!Array.isArray(sourceIds)||!sourceIds.length||sourceIds.length>12 || sourceIds.some(s=>typeof s!=='string'))error('Choose 1–12 source files.');
    const docs=await Promise.all([...new Set(sourceIds)].map(s=>get('documents',s)));
    if(docs.some(d=>!d))error('One of your source files no longer exists.');
    return docs.flatMap(d=>d.units.map(unit=>({...unit, ref:`${d.id}:${unit.id}`, name:d.name,document_id:d.id})));
  };
  const split = (text,label) => {
    text=text.replace(/\0/g,' ').replace(/[^\S\n]+/g,' ').trim();
    let chunks=[];
    while(text.length>1000){
      let cut=Math.max(text.lastIndexOf('\n',1000),text.lastIndexOf('. ',1000));
      if(cut<300)cut=999;
      chunks.push(text.slice(0,cut+1).trim());text=text.slice(cut+1).trim();
    }
    if(text)chunks.push(text);
    return chunks.filter(Boolean).map((s,i)=>({label:`${label} · section ${i+1}`,text:s}));
  };
  async function extract(file,ocrMode='auto') {
    if(file.size>15*1024*1024)error(`${file.name}: maximum file size is 15 MB.`);
    const ext=file.name.split('.').pop().toLowerCase();
    if(!['txt','md','pdf','pptx','docx','png','jpg','jpeg','webp','bmp'].includes(ext))
      error(`${file.name}: upload PDF, PPTX, DOCX, TXT, MD, PNG, JPG, WEBP or BMP.`);
    if(!['auto','all','off'].includes(ocrMode))error('Invalid OCR setting.');
    const useOcr=ocrMode!=='off';
    let units=[];
    const ocr=window.NotePilotOCR;
    let session;
    const report=message => uploadProgress(`${file.name}: ${message}`);
    async function recognize(blob,label) {
      if(!useOcr)return '';
      if(!ocr)error('OCR helper is missing. Reload the page and try again.');
      if(!session)session=ocr.createSession(report);
      return await session.recognize(blob,label);
    }
    async function appendImage(zip,path,label) {
      const entry=zip.file(path);
      if(!entry||!/\.(png|jpe?g|webp|bmp)$/i.test(path))return;
      const raw=await entry.async('uint8array');
      if(raw.byteLength>10*1024*1024)return;
      const mime=/\.png$/i.test(path)?'image/png':/\.webp$/i.test(path)?'image/webp':/\.bmp$/i.test(path)?'image/bmp':'image/jpeg';
      const blob=new Blob([raw],{type:mime});
      if(!(await ocr.readableImage(blob)))return;
      const text=await recognize(blob,label);
      units.push(...split(text,`${label} · OCR`));
    }
    function xmlText(raw) {
      const xml=new DOMParser().parseFromString(raw,'application/xml');
      if(xml.querySelector('parsererror'))error('Invalid Office document XML.');
      return xml;
    }
    function paragraphs(raw) {
      const xml=xmlText(raw);
      return [...xml.getElementsByTagNameNS('*','p')]
        .map(p=>[...p.getElementsByTagNameNS('*','t')].map(t=>t.textContent).join(''))
        .filter(Boolean).join('\n');
    }
    function imageRels(raw,sectionXml,prefix) {
      if(!raw)return [];
      const xml=xmlText(raw);
      const matches=[...sectionXml.matchAll(/\br:embed\s*=\s*["']([^"']+)["']/g)].map(m=>m[1]);
      const wanted=new Set(matches);
      const files=[];
      for(const rel of xml.getElementsByTagNameNS('*','Relationship')) {
        const id=rel.getAttribute('Id');
        const target=rel.getAttribute('Target')||'';
        if(!wanted.has(id)||rel.getAttribute('TargetMode')==='External')continue;
        const match=target.match(/(?:^|\/)media\/([^/?#]+)$/i);
        if(match)files.push(`${prefix}/media/${match[1]}`);
      }
      return [...new Set(files)];
    }
    try {
      if(ext==='txt'||ext==='md') {
        const raw=await file.arrayBuffer();
        const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
        units=split(text,'Text');
      } else if(['png','jpg','jpeg','webp','bmp'].includes(ext)) {
        if(!useOcr)error(`${file.name}: enable OCR to read images.`);
        units=split(await recognize(file,'Image 1'),'Image 1 · OCR');
      } else if(ext==='pdf') {
        report('Opening PDF…');
        let pdfjs;
        try {pdfjs=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');}
        catch {error('PDF parser could not load. Check your internet connection and try again.');}
        pdfjs.GlobalWorkerOptions.workerSrc='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
        let pdf;
        try {pdf=await pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())}).promise;}
        catch {error(`${file.name}: cannot read this PDF (password-protected or damaged PDFs are unsupported).`);}
        try {
          if(pdf.numPages>250)error('PDF exceeds the 250-page limit.');
          for(let i=1;i<=pdf.numPages;i++){
            const page=await pdf.getPage(i);
            report(`Extracting page ${i} of ${pdf.numPages}…`);
            try {
              const content=await page.getTextContent();
              const lines=content.items.map(x=>x.str||'').join(' ').trim();
              const scanned=useOcr&&(ocrMode==='all'||lines.replace(/\s/g,'').length<45);
              let scannedText='';
              if(scanned){
                const rendered=await ocr.renderPage(page);
                scannedText=await recognize(rendered,`page ${i} of ${pdf.numPages}`);
              }
              if(lines)units.push(...split(lines,`Page ${i}`));
              if(scannedText)units.push(...split(scannedText,`Page ${i} · OCR`));
            } finally {page.cleanup();}
          }
        } finally {await pdf.destroy();}
      } else {
        if(!globalThis.JSZip)error('Office document parser did not load. Check your internet connection.');
        report('Reading Office document…');
        let zip;
        try {zip=await JSZip.loadAsync(await file.arrayBuffer(),{checkCRC32:false});}
        catch {error(`${file.name}: invalid Office file.`);}
        const entries=Object.values(zip.files);
        if(entries.length>3000||entries.reduce((n,x)=>n+(x._data?.uncompressedSize||0),0)>60*1024*1024)
          error('Office document exceeds safe extraction limits.');
        if(ext==='docx') {
          const item=zip.file('word/document.xml');
          if(!item)error('Word document is missing its document.xml.');
          const body=await item.async('string');
          units=split(paragraphs(body),'Document');
          if(useOcr){
            const rel=zip.file('word/_rels/document.xml.rels');
            const images=rel?imageRels(await rel.async('string'),body,'word'):[];
            for(let j=0;j<images.length;j++){
              report(`Checking Word image ${j+1} of ${images.length}…`);
              await appendImage(zip,images[j],`Document image ${j+1}`);
            }
          }
        } else {
          const slides=entries.map(f=>f.name).filter(n=>/^ppt\/slides\/slide\d+\.xml$/.test(n))
            .sort((a,b)=>Number(a.match(/slide(\d+)/)[1])-Number(b.match(/slide(\d+)/)[1]));
          if(slides.length>250)error('PowerPoint exceeds the 250-slide limit.');
          for(const name of slides){
            const number=Number(name.match(/slide(\d+)/)[1]);
            report(`Reading slide ${number}…`);
            const slide=await zip.file(name).async('string');
            units.push(...split(paragraphs(slide),`Slide ${number}`));
            if(useOcr){
              const rel=zip.file(`ppt/slides/_rels/slide${number}.xml.rels`);
              const images=rel?imageRels(await rel.async('string'),slide,'ppt'):[];
              for(let j=0;j<images.length;j++)await appendImage(zip,images[j],`Slide ${number} image ${j+1}`);
            }
          }
        }
      }
    } finally {if(session)await session.close();}
    if(!units.length)error(`${file.name}: no readable text found. Try a clearer scan, or enable OCR.`);
    if(units.reduce((n,u)=>n+u.text.length,0)>300000)
      error(`${file.name}: extracted notes exceed 300,000 characters.`);
    report(`Finished extracting ${units.length} text sections.`);
    return units.map((u,i)=>({...u,id:String(i+1)}));
  }
  const tokens = s => new Set((String(s).toLowerCase().match(/[a-z0-9]{2,}/g)||[]).filter(w=>!STOP.has(w)));
  const rank = (units,query,max=12,budget=16000) => {
    const words=tokens(query);
    let bytes=0;
    return units.map((u,i)=>({u,i,score:[...words].filter(w=>tokens(u.text).has(w)).length})).sort((a,b)=>b.score-a.score||a.i-b.i).filter(x=>{if(bytes+x.u.text.length>budget)return false;bytes+=x.u.text.length;return true;}).slice(0,max).map(x=>x.u);
  };
  const diverse = (units,count) => units.length<=count?units: Array.from({length:count},(_,i)=>units[Math.round(i*(units.length-1)/(count-1))]);
  function rules(units,kind,count) {
    let found=[],seen=new Set();
    for(const unit of units){
      for(let line of unit.text.split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)){
        line=line.replace(/^[#*\-•\s]+/,'').trim();
        if(line.length<30||line.length>1200||seen.has(line))continue;
        seen.add(line);found.push({line,ref:unit.ref});
      }
    }
    if(!found.length)found=units.filter(u=>u.text).map(u=>({line:u.text,ref:u.ref}));
    const chosen=found.length<=count?found:diverse(found,count);
    return chosen.map(({line,ref},i)=>{
      const m=line.match(/^([^:.!?]{3,80})\s*(?::|\s+is\s+|\s+are\s+)(.+)$/i);
      let front;
      if(kind==='guide')front=m?m[1].trim():`Key excerpt ${i+1}`;
      else if(m)front=`Explain: ${m[1].trim()}`;
      else {
        const word=(line.match(/\b[A-Za-z][A-Za-z-]{4,}\b/g)||[]).find(w=>!STOP.has(w.toLowerCase()));
        front=word?'Complete the statement: '+line.replace(new RegExp('\\b'+word+'\\b'),'_____'):`Recall the key idea from excerpt ${i+1}.`;
      }
      return {id:id(),front,back:line,refs:[ref],status:'new',rewarded:false};
    });
  }
  function validate(items,refs,max=40){
    if(!Array.isArray(items)||!items.length||items.length>max)error('AI did not return a valid list of study items.');
    const valid=new Set(refs);
    return items.map(i=>{
      if(!i||!Array.isArray(i.refs)||!i.refs.length||i.refs.some(r=>!valid.has(r)))error('AI returned an unknown source reference. Nothing was saved.');
      return {id:id(),front:needed(i.front,'Question',1500),back:needed(i.back,'Answer',8000),refs:[...new Set(i.refs)],status:'new',rewarded:false};
    });
  }
  async function aiRequest(task,inputs){
    if(!window.NotePilotGemini?.request) error('Gemini browser adapter is missing. Refresh the website.');
    return window.NotePilotGemini.request(task,inputs);
  }
  function rich(m,sources){return {...m,sources,messages:m.messages||[],revisions:(m.revisions||[]).map((r,i)=>({id:i,created:r.created,reason:r.reason}))};}
  async function saveEdit(mid,version,update,reason){
    return transaction(['materials'],'readwrite',(tx,set)=>{
      const store=tx.objectStore('materials');
      const req=store.get(mid);
      req.onsuccess=()=>{
        const m=req.result;
        if(!m){tx.abort();return;}
        if(m.version!==version){tx.abort();return;}
        m.revisions??=[];
        m.revisions.push({items:structuredClone(m.items),created:stamp(),reason});
        update(m);
        m.version++;m.updated=stamp();store.put(m);set({ok:true,version:m.version});
      };
    }).catch(e=>error(e?.message?.includes('Abort')?'Study set changed in another tab. Reload it and try again.':e.message));
  }
  async function handle(rawPath,method='GET',body) {
    const path=new URL(rawPath,location.href);
    const bits=path.pathname.split('/').filter(Boolean);
    // The UI uses API-shaped methods, but all data is stored in the visitor's own IndexedDB.
    if(bits[0]!=='api')error('Unknown action.');
    if(bits[1]==='state'&&method==='GET'){
      const [docs,mats]=await Promise.all([all('documents'),all('materials')]);
      return {documents:docs.sort((a,b)=>b.created.localeCompare(a.created)).map(summary),materials:mats.sort((a,b)=>b.updated.localeCompare(a.updated)).map(brief),ai_model:(window.NOTEPILOT_CONFIG?.geminiApiKey && window.NOTEPILOT_CONFIG.geminiApiKey!=='PASTE_YOUR_GEMINI_API_KEY_HERE')?'Gemini (browser API)':null};
    }
    if(bits[1]==='upload'&&method==='POST'){
      const files=body.getAll('files');
      const ocrMode=body.get('ocr_mode')||'auto';
      if(!files.length||files.length>12)error('Choose 1–12 files.');
      const docs=[];
      for(const f of files)docs.push({id:id(),name:f.name.slice(0,150),created:stamp(),units:await extract(f,ocrMode)});
      await transaction(['documents'],'readwrite',tx=>{const store=tx.objectStore('documents');docs.forEach(d=>store.put(d));});
      return {ids:docs.map(d=>d.id)};
    }
    if(bits[1]==='paste'&&method==='POST'){
      const title=needed(body.title,'Notes title',150);
      const text=needed(body.text,'Notes',300000);
      const units=split(text,'Text').map((u,i)=>({...u,id:String(i+1)}));
      const did=id();await put('documents',{id:did,name:title,created:stamp(),units});return {id:did};
    }
    if(bits[1]==='documents'&&bits[2]){
      const did=bits[2];const doc=await get('documents',did);
      if(!doc)error('Source not found.');
      if(method==='GET')return {...summary(doc),units:doc.units};
      if(method==='DELETE'){
        if((await all('materials')).some(m=>m.source_ids.includes(did)))error('Delete the study sets using these notes first.');
        await remove('documents',did);return {ok:true};
      }
    }
    if(bits[1]==='generate'&&method==='POST'){
      const title=needed(body.title,'Study set title',150);
      const {kind,mode,source_ids}=body;
      if(!['flashcards','guide','exam'].includes(kind))error('Choose a study format.');
      if(!['rules','ai'].includes(mode))error('Choose a generation mode.');
      const units=await sourceUnits(source_ids);
      const count=Number(body.count)||12;
      if(!Number.isInteger(count)||count<3||count>30)error('Choose 3–30 study items.');
      let items,processed;
      if(mode==='ai'){
        const sampled=body.focus?rank(units,String(body.focus),12,12000):diverse(units,Math.min(12,units.length));
        const out=await aiRequest('generate',{kind,count,focus:String(body.focus||'').slice(0,500),sources:sampled});
        items=validate(out.items,sampled.map(s=>s.ref),60);
        if(kind!=='flashcards')items=items.slice(0,count);
        processed=sampled.length;
      }else{
        const chosen=kind==='flashcards'?units:(body.focus?rank(units,String(body.focus),100,100000):units);
        items=rules(chosen,kind,kind==='flashcards'?1000000:count);
        processed=kind==='flashcards'?units.length:chosen.length;
      }
      if(!items.length)error('No usable study items found.');
      const mid=id(),now=stamp();
      const coverage={processed_sections:processed,total_sections:units.length};
      await put('materials',{id:mid,title,kind,mode,created:now,updated:now,source_ids:[...new Set(source_ids)],items,coverage,version:1,messages:[],revisions:[]});
      return {id:mid,count:items.length,coverage};
    }
    if(bits[1]==='materials'&&bits[2]){
      const mid=bits[2], m=await get('materials',mid);
      if(!m)error('Study set not found.');
      if(bits.length===3){
        if(method==='GET')return rich(m,await sourceUnits(m.source_ids));
        if(method==='DELETE'){await remove('materials',mid);return {ok:true};}
      }
      if(bits[3]==='items'&&bits[4]&&method==='PUT'){
        const front=needed(body.front,'Question',1500),back=needed(body.back,'Answer',8000);
        if(!m.items.some(i=>i.id===bits[4]))error('Item not found.');
        return saveEdit(mid,body.version,mat=>{
          const item=mat.items.find(i=>i.id===bits[4]);item.front=front;item.back=back;item.status='new';
        },'Manual edit');
      }
      if(bits[3]==='progress'&&method==='POST'){
        if(!['new','known','review'].includes(body.status))error('Invalid review status.');
        return transaction(['materials','settings'],'readwrite',(tx,set)=>{
          const store=tx.objectStore('materials'),meta=tx.objectStore('settings');
          const req=store.get(mid);
          req.onsuccess=()=>{
            const current=req.result;
            if(current.version!==body.version){tx.abort();return;}
            const item=current.items.find(i=>i.id===body.item_id);
            if(!item){tx.abort();return;}
            const r=meta.get('profile');
            r.onsuccess=()=>{
              const p=r.result||defaultProfile();p.rewardedIds??=[];
              const newlyEarned=body.status==='known'&&!p.rewardedIds.includes(item.id)?5:0;
              item.status=body.status;
              if(newlyEarned){item.rewarded=true;p.rewardedIds.push(item.id);p.coins+=newlyEarned;meta.put(p);}
              current.version++;current.updated=stamp();store.put(current);
              set({version:current.version,earned:newlyEarned});
            };
          };
        }).catch(()=>error('Item changed in another tab or could not be saved. Reload the set.'));
      }
      if(bits[3]==='chat'&&method==='POST'){
        const message=needed(body.message,'Message',2000);
        const units=await sourceUnits(m.source_ids);
        const item=m.items.find(i=>i.id===body.item_id);
        const query=message+(item?' '+item.front:'');
        const pinned=item?units.filter(u=>item.refs.includes(u.ref)):[];
        const chosen=[...new Map([...pinned,...rank(units,query,6,6500)].map(u=>[u.ref,u])).values()].slice(0,8);
        let answer,refs=[];
        if(body.mode==='ai'){
          const out=await aiRequest('chat',{question:message,item,history:m.messages.slice(-6),sources:chosen});
          answer=needed(out.answer,'AI answer',16000);
          if(!Array.isArray(out.refs)||out.refs.some(r=>!chosen.some(u=>u.ref===r)))error('AI returned invalid source links.');
          refs=out.refs;
        }else if(body.mode==='rules'){
          const found=chosen.filter(u=>[...tokens(query)].some(t=>tokens(u.text).has(t))).slice(0,3);
          answer=found.length?'Rule-based source lookup — matching excerpts (not an AI explanation):\n\n'+found.map(u=>u.text).join('\n\n'):'No matching excerpt found. Try more specific terms from your notes.';
          refs=found.map(u=>u.ref);
        }else error('Unknown helper mode.');
        await transaction(['materials'],'readwrite',tx=>{
          const store=tx.objectStore('materials'),req=store.get(mid);
          req.onsuccess=()=>{const curr=req.result;curr.messages??=[];
            curr.messages.push({role:'user',content:message,refs:[],created:stamp()},{role:'assistant',content:answer,refs,created:stamp()});store.put(curr);};
        });
        return {answer,refs};
      }
      if(bits[3]==='revise'&&method==='POST'){
        const instruction=needed(body.instruction,'Revision instructions',1500);
        const item=m.items.find(i=>i.id===body.item_id);
        if(!item)error('Choose an item to revise.');
        const units=await sourceUnits(m.source_ids);
        const pinned=units.filter(u=>item.refs.includes(u.ref));
        const chosen=[...new Map([...pinned,...rank(units,instruction+' '+item.front,8,9000)].map(u=>[u.ref,u])).values()].slice(0,10);
        const out=await aiRequest('revise',{instruction,item,kind:m.kind,sources:chosen});
        return {proposal:validate(out.items,chosen.map(u=>u.ref),1)[0],item_id:item.id,version:m.version};
      }
      if(bits[3]==='apply'&&method==='POST'){
        const item=m.items.find(i=>i.id===body.item_id);
        if(!item)error('Item not found.');
        const units=await sourceUnits(m.source_ids);
        const proposal=validate([body.proposal],units.map(u=>u.ref),1)[0];
        return saveEdit(mid,body.version,mat=>{const index=mat.items.findIndex(i=>i.id===body.item_id);
          mat.items[index]={...proposal,id:item.id,rewarded:item.rewarded};},'AI revision');
      }
      if(bits[3]==='undo'&&method==='POST'){
        return transaction(['materials'],'readwrite',(tx,set)=>{
          const store=tx.objectStore('materials'),r=store.get(mid);
          r.onsuccess=()=>{
            const cur=r.result;
            if(!cur.revisions?.length||cur.version!==body.version){tx.abort();return;}
            cur.items=cur.revisions.pop().items;cur.version++;cur.updated=stamp();store.put(cur);set({ok:true});
          };
        }).catch(()=>error('No edit to undo, or this study set changed in another tab.'));
      }
    }
    if(bits[1]==='shop'){
      if(method==='GET')return {profile:await profile(),themes:THEMES};
      if(method==='POST'&&(bits[2]==='buy'||bits[2]==='equip')){
        const theme=THEMES.find(t=>t.id===body.theme);
        if(!theme)error('Unknown theme.');
        return transaction(['settings'],'readwrite',(tx,set)=>{
          const store=tx.objectStore('settings'),r=store.get('profile');
          r.onsuccess=()=>{
            const p=r.result||defaultProfile();
            if(bits[2]==='buy'){
              if(p.unlocked.includes(theme.id)){tx.abort();return;}
              if(p.coins<theme.cost){tx.abort();return;}
              p.coins-=theme.cost;p.unlocked.push(theme.id);
            } else if(!p.unlocked.includes(theme.id)){tx.abort();return;}
            p.equipped=theme.id;store.put(p);set({profile:p});
          };
        }).catch(()=>error('Not enough coins, or this theme is already unlocked.'));
      }
    }
    error('Action not supported.');
  }
  async function exportSet(mid,format){
    const m=await get('materials',mid);
    if(!m)error('Study set not found.');
    const sources=await sourceUnits(m.source_ids);
    let body,mime,suffix;
    if(format==='json'){
      body=JSON.stringify({material:m,sources},null,2);mime='application/json';suffix='json';
    }else{
      const lookup=Object.fromEntries(sources.map(u=>[u.ref,u]));
      const lines=[`# ${m.title}`,'',`Type: ${m.kind} | Mode: ${m.mode}`,'','Verify generated content against your class notes.',''];
      m.items.forEach((i,n)=>lines.push(`## ${n+1}. ${i.front}`,'',i.back,'',`Sources: ${i.refs.filter(r=>lookup[r]).map(r=>`${lookup[r].name} — ${lookup[r].label} [${r}]`).join('; ')}`,''));
      body=lines.join('\n');mime='text/markdown';suffix='md';
    }
    const blob=new Blob([body],{type:mime});const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download=(m.title.replace(/[^a-zA-Z0-9_-]+/g,'_').slice(0,80)||'notepilot')+'.'+suffix;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  async function exportWorkspace(){
    const [documents,materials,p]=await Promise.all([all('documents'),all('materials'),profile()]);
    const blob=new Blob([JSON.stringify({format:'notepilot-backup-v1',created:stamp(),documents,materials,profile:p},null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='notepilot-workspace-backup.json';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);
  }
  async function importWorkspace(file){
    if(file.size>30*1024*1024)error('Backup exceeds 30 MB.');
    let backup;
    try{backup=JSON.parse(await file.text());}catch{error('Backup must be valid JSON.');}
    if(backup?.format!=='notepilot-backup-v1'||!Array.isArray(backup.documents)||!Array.isArray(backup.materials))error('Not a NotePilot workspace backup.');
    if(backup.documents.length>300||backup.materials.length>300)error('Backup contains too many records.');
    for(const d of backup.documents){if(typeof d.id!=='string'||typeof d.name!=='string'||!Array.isArray(d.units)||d.units.some(u=>typeof u.text!=='string'||typeof u.id!=='string'))error('Backup contains an invalid source.');}
    const ids=new Set(backup.documents.map(d=>d.id));
    for(const m of backup.materials){if(typeof m.id!=='string'||!Array.isArray(m.source_ids)||!m.source_ids.every(x=>ids.has(x))||!Array.isArray(m.items)||!['flashcards','guide','exam'].includes(m.kind))error('Backup contains an invalid study set or missing source.');}
    await transaction(['documents','materials','settings'],'readwrite',tx=>{
      const docs=tx.objectStore('documents'),materials=tx.objectStore('materials');
      backup.documents.forEach(d=>docs.put(d));backup.materials.forEach(m=>materials.put(m));
      if(backup.profile&&typeof backup.profile.coins==='number'&&Array.isArray(backup.profile.unlocked))tx.objectStore('settings').put({...defaultProfile(),...backup.profile,id:'profile'});
    });
    return {documents:backup.documents.length,materials:backup.materials.length};
  }
  window.NotePilotLocal={api:handle,exportSet,exportWorkspace,importWorkspace,profile,
    setUploadProgress:fn=>{uploadProgress=typeof fn==='function'?fn:()=>{};}
  };
})();
