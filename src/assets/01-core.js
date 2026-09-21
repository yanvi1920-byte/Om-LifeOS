


const LIFEOS_BUILD_VERSION='1.8.2';
window.__LIFEOS_BUILD_VERSION=LIFEOS_BUILD_VERSION;
console.info('Om-LifeOS build',LIFEOS_BUILD_VERSION);
const KEY='lifeos_clean_v5';
const NATIVE_RUNTIME=Boolean(window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke==='function');
window.__LIFEOS_NATIVE_RUNTIME=NATIVE_RUNTIME;
const MAX_LOCAL_BYTES=4_500_000;
const ATTACH_DB='lifeos-attachments-v2';
const ATTACH_STORE='files';
let attachmentDBPromise=null;
const MAX_IMAGE_BYTES=900_000;
const MAX_IMAGE_SIDE=1600;
let data=(()=>{if(NATIVE_RUNTIME)return null;try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch(e){console.warn('LifeOS data was invalid; starting safely',e);return null}})()||{
 tasks:[],notes:[],journal:[],expenses:[],income:[],habits:[],routines:[],goals:[],
 daily:{},focus:{},financePeriod:'monthly',settings:{mode:'light'},__drafts:{},mentor:{startingCapital:300000,startDate:'',survivalReserve:180000,emergencyReserve:60000,careerFund:30000,opportunityFund:30000,dailyBurn:2000,monthlyBurn:60000,balanceMode:'auto',manualBalance:0},mentorKpis:{}
};
data.journal=Array.isArray(data.journal)?data.journal:[];
data.__drafts=(data.__drafts&&typeof data.__drafts==='object')?data.__drafts:{};
data.goals=Array.isArray(data.goals)?data.goals:[];data.focusSessions=Array.isArray(data.focusSessions)?data.focusSessions:[];
data.settings={...{mode:'light'},...(data.settings||{})};
data.categories=(data.categories&&typeof data.categories==='object')?data.categories:{};
data.mentor={...{startingCapital:300000,startDate:'',survivalReserve:180000,emergencyReserve:60000,careerFund:30000,opportunityFund:30000,dailyBurn:2000,monthlyBurn:60000,balanceMode:'auto',manualBalance:0},...(data.mentor||{})};
data.mentorKpis=(data.mentorKpis&&typeof data.mentorKpis==='object')?data.mentorKpis:{};
data.mentorQuotes=Array.isArray(data.mentorQuotes)?data.mentorQuotes:[];

// One-time safe data hygiene: remove only exact duplicate records and empty
// non-record entries. Records with different IDs are never merged because they
// may represent legitimate repeated events. This keeps old imports/migrations
// from making the app and exports carry exact duplicate rows forever.
function stableDataKey(value){
  try{
    return JSON.stringify(value,(key,val)=>{
      if(val&&typeof val==='object'&&!Array.isArray(val)){
        const out={}; Object.keys(val).sort().forEach(k=>{out[k]=val[k]}); return out;
      }
      return val;
    });
  }catch(_){return String(value)}
}
function dedupeExactArray(arr){
  if(!Array.isArray(arr))return [];
  const seen=new Set(),out=[];
  for(const item of arr){
    if(item==null)continue;
    const key=stableDataKey(item);
    if(seen.has(key))continue;
    seen.add(key);out.push(item);
  }
  return out;
}
function cleanStoredDuplicates(){
  const arrayKeys=['tasks','notes','journal','expenses','income','habits','routines','goals','focusSessions','personal','professional','spiritual','economical','mental','social','moral','mentorQuotes','mentorRules'];
  let changed=false;
  for(const key of arrayKeys){
    if(Array.isArray(data[key])){
      const next=dedupeExactArray(data[key]);
      if(next.length!==data[key].length){data[key]=next;changed=true;}
    }
  }
  if(data.categories&&typeof data.categories==='object'){
    for(const [key,items] of Object.entries(data.categories)){
      if(Array.isArray(items)){
        const next=dedupeExactArray(items);
        if(next.length!==items.length){data.categories[key]=next;changed=true;}
      }
    }
  }
  if(data.__drafts&&typeof data.__drafts==='object'){
    for(const [key,value] of Object.entries(data.__drafts)){
      if(value===''||value==null){delete data.__drafts[key];changed=true;}
    }
  }
  return changed;
}
const __storedDataWasCleaned=cleanStoredDuplicates();

// Reactive dirty tracking: mutations mark only the affected top-level data section.
// This lets the native SQLite mirror write only changed sections instead of
// serializing/re-writing the entire history after every small edit.
const __reactiveCache=new WeakMap();
const __dirtySections=window.__lifeosDirtySections=new Set();
function makeReactiveData(root){
  function wrap(value,section){
    if(!value||typeof value!=='object')return value;
    if(__reactiveCache.has(value))return __reactiveCache.get(value);
    const proxy=new Proxy(value,{
      get(target,key,receiver){
        const v=Reflect.get(target,key,receiver);
        const childSection=section==='__root'?String(key):section;
        return (v&&typeof v==='object')?wrap(v,childSection):v;
      },
      set(target,key,value,receiver){
        const ok=Reflect.set(target,key,value,receiver);
        if(ok)__dirtySections.add(section==='__root'?String(key):section);
        return ok;
      },
      deleteProperty(target,key){
        const ok=Reflect.deleteProperty(target,key);
        if(ok)__dirtySections.add(section==='__root'?String(key):section);
        return ok;
      }
    });
    __reactiveCache.set(value,proxy);
    return proxy;
  }
  return wrap(root,'__root');
}
data=makeReactiveData(data);
if(__storedDataWasCleaned){try{localStorage.setItem(KEY,JSON.stringify(data));}catch(_){}}
// One-time cleanup: older built-in entries used the label 'Mentor Principle' as an author.
data.mentorQuotes=data.mentorQuotes.map(q=>({...q,author:String(q?.author||'Mentor')==='Mentor Principle'?'Mentor':(q?.author||'Mentor')}));
// Normalize/sanitize stored rich text from older versions before it is rendered.
function sanitizeRichHtml(html=''){
  const input=String(html||'');
  if(typeof DOMParser==='undefined') return esc(input.replace(/<[^>]*>/g,''));
  const doc=new DOMParser().parseFromString(input,'text/html');
  const allowed=new Set(['B','STRONG','I','EM','U','S','BR','P','DIV','SPAN','UL','OL','LI','BLOCKQUOTE']);
  doc.body.querySelectorAll('*').forEach(el=>{
    if(!allowed.has(el.tagName)){el.replaceWith(document.createTextNode(el.textContent||''));return}
    [...el.attributes].forEach(a=>{
      if(!['style'].includes(a.name.toLowerCase())) el.removeAttribute(a.name);
      else if(!/^(color|background-color|font-size|text-align|font-weight|font-style|text-decoration)\s*:/i.test(a.value)) el.removeAttribute(a.name);
    });
  });
  return doc.body.innerHTML;
}
function sanitizeStoredContent(){
  (data.notes||[]).forEach(n=>{if(n.html)n.html=sanitizeRichHtml(n.html)});
  (data.journal||[]).forEach(j=>{if(j.html)j.html=sanitizeRichHtml(j.html)});
}

data.mentorSelectedDate=typeof data.mentorSelectedDate==='string'&&data.mentorSelectedDate?data.mentorSelectedDate:today();
data.mentor.missions=Array.isArray(data.mentor.missions)?data.mentor.missions:[
 {month:1,mission:'First cash + pipeline',target:'₹10–30k',action:'10 opportunities/day + outreach + follow-up',status:'Pending',note:''},
 {month:2,mission:'Client/job pipeline',target:'₹20–40k',action:'Close first repeatable work/client',status:'Pending',note:''},
 {month:3,mission:'Stabilize income',target:'₹40–60k',action:'Build repeatable offer + delivery system',status:'Pending',note:''},
 {month:4,mission:'Cover essentials',target:'₹50–80k',action:'Target ₹60k essential monthly burn',status:'Pending',note:''},
 {month:5,mission:'Stop consuming runway',target:'₹60k+ recurring',action:'Income should cover essential burn',status:'Pending',note:''}
];
const DEFAULT_MENTOR_RULES=[
 '₹60k essential expense को unrealistic तरीके से कम मत करो.',
 'पहले cash flow, फिर courses.',
 'रोज़ outreach + follow-up + portfolio/output.',
 'Civil + AI + Project Management को marketable identity बनाओ.',
 'Trading/crypto/अनावश्यक courses से ₹3L को जोखिम में मत डालो.',
 'Health, family, character और spiritual practice को income के लिए पूरी तरह मत छोड़ो.'
];
sanitizeStoredContent();
data.mentorRules=Array.isArray(data.mentorRules)&&data.mentorRules.length?data.mentorRules.map((x,i)=>({id:x?.id||('mr'+(i+1)),text:String(x?.text??x??'')})):DEFAULT_MENTOR_RULES.map((text,i)=>({id:'mr'+(i+1),text}));

if(!data.mentorQuotes.length)data.mentorQuotes=[
 {id:'q1',text:'आज का छोटा अनुशासन, कल की बड़ी स्वतंत्रता बनता है।',author:'Mentor',category:'Discipline'},
 {id:'q2',text:'पहले cash flow बचाओ, फिर skill को income में बदलो, फिर wealth बनाओ।',author:'Mentor',category:'Finance'},
 {id:'q3',text:'कम सीखो, ज्यादा बनाओ; कम सोचो, ज्यादा करो।',author:'Mentor',category:'Action'},
 {id:'q4',text:'मुश्किल समय character को दिखाता नहीं, बनाता है।',author:'Mentor',category:'Resilience'},
 {id:'q5',text:'स्वास्थ्य, चरित्र और अनुशासन—बाकी उपलब्धियों की नींव हैं।',author:'Mentor',category:'Health'},
 {id:'q6',text:'आज का एक महत्वपूर्ण काम, दस अधूरे कामों से बेहतर है।',author:'Mentor',category:'Focus'},
 {id:'q7',text:'गति धीमी हो सकती है, दिशा नहीं।',author:'Mentor',category:'Recovery'},
 {id:'q8',text:'कमाई को कौशल, कौशल को स्वतंत्रता और स्वतंत्रता को सेवा में बदलो।',author:'Mentor',category:'Service'}
];

let noteColor='#fff8c5',noteImages=[],journalThemeColor='#fff8c5';

const navItems=[
 ['dashboard','🏠 Dashboard'],['mentor','🧭 Mentor & Capital'],['planner','📅 Daily Planner'],['tasks','✅ To-Do & Projects'],
 ['routine','🕉 Routine Planner'],['habits','🧘 Habits'],['goals','🎯 Goals'],['focus','⏱ Focus'],
 ['notes','📝 Notes'],['journal','📔 Daily Journal'],['expenses','💰 Expenses & Income'],
 ['personal','👤 Personal'],['professional','💼 Professional'],['spiritual','🕉 Spiritual'],['economical','💰 Economical'],['mental','🧠 Mental'],['social','🤝 Social'],['moral','⚖️ Moral'],['device-storage','💾 Device Storage'],['settings','⚙️ Settings']
];

let draftSaveTimer=null;
const DRAFT_SKIP_IDS=new Set(['today','nf','filter','ncustom']);
function isDraftField(el){
  if(!el||!el.id||DRAFT_SKIP_IDS.has(el.id))return false;
  if(el.disabled||el.readOnly)return false;
  if(el.tagName==='INPUT'&&['file','color','checkbox','radio','range'].includes((el.type||'').toLowerCase()))return false;
  return ['INPUT','TEXTAREA','SELECT'].includes(el.tagName);
}
function openAttachmentDB(){
  if(attachmentDBPromise)return attachmentDBPromise;
  attachmentDBPromise=new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}
    const req=indexedDB.open(ATTACH_DB,1);
    req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(ATTACH_STORE))req.result.createObjectStore(ATTACH_STORE)};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('IndexedDB open failed'));
  });
  return attachmentDBPromise;
}
function attachmentKey(type,id,index){return type+':'+id+':'+index}

async function deleteAttachmentSet(type,id){
  try{const db=await openAttachmentDB();await new Promise((resolve,reject)=>{const tx=db.transaction(ATTACH_STORE,'readwrite'),st=tx.objectStore(ATTACH_STORE),prefix=type+':'+id+':';const r=st.openCursor();r.onsuccess=()=>{const c=r.result;if(!c){return}if(String(c.key).startsWith(prefix))c.delete();c.continue()};r.onerror=()=>reject(r.error);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Attachment delete failed'))});}catch(e){console.warn('Attachment IndexedDB cleanup failed',e)}
}
async function persistAttachmentItemToIDB(type,item){
  if(!item||!('indexedDB' in window))return false;
  try{
    const db=await openAttachmentDB();
    const tx=db.transaction(ATTACH_STORE,'readwrite'),st=tx.objectStore(ATTACH_STORE);
    if(type==='note'){for(let i=0;i<(item.images||[]).length;i++)if(typeof item.images[i]==='string')st.put(item.images[i],attachmentKey('note',item.id,i));}
    if(type==='journal'){for(let i=0;i<(item.files||[]).length;i++)if(item.files[i]?.data)st.put(item.files[i].data,attachmentKey('journal',item.id,i));}
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Attachment transaction failed'))});
    return true;
  }catch(e){console.warn('Attachment item persistence failed',e);return false}
}
async function persistAttachmentsToIDB(source=data){
  if(!('indexedDB' in window))return false;
  try{
    const db=await openAttachmentDB();
    const tx=db.transaction(ATTACH_STORE,'readwrite'),st=tx.objectStore(ATTACH_STORE);
    for(const n of (source.notes||[])) for(let i=0;i<(n.images||[]).length;i++) if(typeof n.images[i]==='string') st.put(n.images[i],attachmentKey('note',n.id,i));
    for(const j of (source.journal||[])) for(let i=0;i<(j.files||[]).length;i++) if(j.files[i]?.data) st.put(j.files[i].data,attachmentKey('journal',j.id,i));
    await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Attachment transaction failed'))});
    return true;
  }catch(e){console.warn('Attachment IndexedDB persistence failed',e);return false}
}
async function hydrateAttachmentsFromIDB(source=data){
  if(!('indexedDB' in window))return false;
  try{
    const db=await openAttachmentDB();
    const tx=db.transaction(ATTACH_STORE,'readonly'),st=tx.objectStore(ATTACH_STORE);
    const get=k=>new Promise((resolve,reject)=>{const r=st.get(k);r.onsuccess=()=>resolve(r.result??null);r.onerror=()=>reject(r.error||new Error('Attachment read failed'))});
    for(const n of (source.notes||[])){
      if(!Array.isArray(n.images))continue;
      for(let i=0;i<n.images.length;i++) if(!n.images[i]) n.images[i]=await get(attachmentKey('note',n.id,i));
    }
    for(const j of (source.journal||[])){
      if(!Array.isArray(j.files))continue;
      for(let i=0;i<j.files.length;i++) if(j.files[i]&&!j.files[i].data) j.files[i].data=await get(attachmentKey('journal',j.id,i));
    }
    return true;
  }catch(e){console.warn('Attachment IndexedDB hydration failed',e);return false}
}

function localSnapshot(source=data){
  // IndexedDB uses structured clone and cannot store our reactive Proxy graph.
  // Build a strictly cloneable plain-data snapshot. Attachments stay in their
  // dedicated IndexedDB store, so the app-state record never contains File/Blob
  // objects or other host objects.
  const seen=new WeakSet();
  function plain(value){
    if(value===null)return null;
    const type=typeof value;
    if(type==='string'||type==='number'||type==='boolean')return value;
    if(type==='bigint')return String(value);
    if(type==='undefined'||type==='function'||type==='symbol')return undefined;
    if(type!=='object')return String(value);
    if(seen.has(value))return null;
    if(value instanceof Date)return value.toISOString();
    // Binary/browser host objects are stored separately or intentionally omitted.
    if(typeof Blob!=='undefined' && value instanceof Blob)return null;
    if(typeof File!=='undefined' && value instanceof File)return null;
    if(typeof ArrayBuffer!=='undefined' && value instanceof ArrayBuffer)return null;
    if(typeof ArrayBuffer!=='undefined' && ArrayBuffer.isView?.(value))return null;
    seen.add(value);
    if(Array.isArray(value)){const out=[];for(const item of value){const v=plain(item);out.push(v===undefined?null:v)}seen.delete(value);return out;}
    const out={};
    for(const key of Object.keys(value)){
      // Never drop a generic user/app field named `data`. Only attachment
      // containers are handled separately below. This prevents silent data loss.
      if(key==='images'||key==='files')continue;
      const v=plain(value[key]);
      if(v!==undefined)out[key]=v;
    }
    seen.delete(value);
    return out;
  }
  const copy=plain(source)||{};
  copy.notes=(Array.isArray(source?.notes)?source.notes:[]).map(n=>{
    const x=plain(n)||{};
    x.images=Array.isArray(n?.images)?n.images.map(()=>null):[];
    return x;
  });
  copy.journal=(Array.isArray(source?.journal)?source.journal:[]).map(j=>{
    const x=plain(j)||{};
    x.files=Array.isArray(j?.files)?j.files.map(f=>{const y=plain(f)||{};y.data=null;return y;}):[];
    return x;
  });
  // IDB gets a JSON-safe plain graph. This is intentionally stricter than
  // structuredClone: IndexedDB should never receive a Proxy, File, Blob, Map,
  // Set, DOM object, class instance, or other host value from the reactive state.
  try{return JSON.parse(JSON.stringify(copy,(key,value)=>{
    if(typeof value==='bigint')return String(value);
    if(typeof value==='function'||typeof value==='symbol')return undefined;
    return value;
  }))}catch(_){
    return {__updatedAt:Number(source?.__updatedAt)||Date.now(),version:1,notes:[],journal:[]};
  }
}

const DEVICE_DB='lifeos-device-storage-v1';
const DEVICE_STORE='app_state';
let deviceDBPromise=null;
let deviceSaveTimer=null;
let deviceStorageReady=false;
let legacyCategoriesMigrated=false;
function openDeviceDB(){
  if(deviceDBPromise)return deviceDBPromise;
  deviceDBPromise=new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}
    const req=indexedDB.open(DEVICE_DB,1);
    req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(DEVICE_STORE))db.createObjectStore(DEVICE_STORE)};
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error('Device storage unavailable'));
  });
  return deviceDBPromise;
}
function requestPersistentDeviceStorage(){
  try{
    if(navigator.storage?.persist)navigator.storage.persist().catch(()=>{});
  }catch(e){}
}
function readDeviceState(){
  return openDeviceDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(DEVICE_STORE,'readonly');
    const req=tx.objectStore(DEVICE_STORE).get('state');
    req.onsuccess=()=>resolve(req.result||null);
    req.onerror=()=>reject(req.error||new Error('Device state read failed'));
  }));
}
function writeDeviceState(source=data){
  return openDeviceDB().then(db=>new Promise((resolve,reject)=>{
    const tx=db.transaction(DEVICE_STORE,'readwrite');
    const snapshot=localSnapshot(source);
    // A final browser-native clone probe makes failures deterministic and prevents
    // an IDB transaction from ever receiving a non-cloneable value.
    if(typeof structuredClone==='function')structuredClone(snapshot);
    tx.objectStore(DEVICE_STORE).put(snapshot,'state');
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error||new Error('Device state save failed'));
  }));
}
function scheduleDeviceSave(delay=180){
  clearTimeout(deviceSaveTimer);
  deviceSaveTimer=setTimeout(()=>{writeDeviceState().catch(e=>console.warn('Device storage save failed',e))},delay);
}
async function persistDeviceNow(){
  try{await writeDeviceState();return true}catch(e){console.warn('IndexedDB device save failed',e);return false}
}
function persistLocalNow(){
  let ok=false;
  try{
    data.__updatedAt=Number(data.__updatedAt)||Date.now();
    data.__localSavedAt=Date.now();
    // Once native SQLite is healthy, do not repeatedly stringify the entire
    // history into localStorage. Keep only a tiny recovery marker there.
    if(deviceStorageReady && window.omDb){
      localStorage.setItem(KEY,JSON.stringify({__updatedAt:data.__updatedAt,__nativeSQLite:true,version:2}));
      ok=true;
    }else{
      const raw=JSON.stringify(localSnapshot(data));
      if(raw.length<=MAX_LOCAL_BYTES){localStorage.setItem(KEY,raw);ok=true}
    }
  }catch(e){console.warn('localStorage fallback save failed',e)}
  scheduleDeviceSave(deviceStorageReady?15000:1200);
  return ok;
}
function migrateLegacyCategories(){
  if(legacyCategoriesMigrated)return;
  legacyCategoriesMigrated=true;
  const ids=['personal','professional','spiritual','economical','mental','social','moral'];
  data.categories=(data.categories&&typeof data.categories==='object')?data.categories:{};
  ids.forEach(id=>{
    if(Array.isArray(data.categories[id])&&data.categories[id].length)return;
    try{
      const raw=localStorage.getItem('lifeos_category_'+id);
      const items=raw?JSON.parse(raw):[];
      if(Array.isArray(items)&&items.length)data.categories[id]=items;
    }catch(e){}
  });
}
async function migrateLegacyNativeAttachments(){
  if(!NATIVE_RUNTIME||!window.omDb?.listPage||!window.omDb?.getMeta||!window.omDb?.setMeta||!('indexedDB' in window))return;
  try{
    const done=await window.omDb.getMeta('attachments_migrated_v1');
    if(done==='1')return;
    for(const key of ['notes','journal']){
      let cursor=null;
      do{
        const page=await window.omDb.listPage(key,{limit:100,cursor});
        if(!page.length)break;
        const holder=key==='notes'?{notes:page,journal:[]}:{notes:[],journal:page};
        const before=JSON.stringify(page);
        await hydrateAttachmentsFromIDB(holder);
        if(before!==JSON.stringify(holder[key])) await window.omDb.persistSection(key,holder[key],{force:true});
        if(page.length<100)break;
        const last=page[page.length-1];
        cursor={dateKey:last?.date||last?.createdAt||last?.updatedAt||'',updatedAt:Number(last?.updatedAt||last?.createdAt||0),recordId:String(last?.id||'')};
      }while(cursor);
    }
    await window.omDb.setMeta('attachments_migrated_v1','1');
    console.info('Om-LifeOS: legacy attachment migration complete');
  }catch(e){console.warn('Legacy attachment migration deferred',e)}
}
async function bootDeviceStorage(){
  requestPersistentDeviceStorage();
  migrateLegacyCategories();
  try{
    const stored=NATIVE_RUNTIME?null:await readDeviceState();
    if(stored&&typeof stored==='object'){
      const localUpdated=Number(data.__updatedAt)||0;
      const deviceUpdated=Number(stored.__updatedAt)||0;
      if(deviceUpdated>localUpdated){
        const localCategories=data.categories||{};
        data=makeReactiveData({...data,...stored,categories:{...localCategories,...(stored.categories||{})}});
      }else if(localUpdated>deviceUpdated){
        await persistDeviceNow();
      }
    }else{
      await persistDeviceNow();
    }
    deviceStorageReady=!NATIVE_RUNTIME;
    if(deviceStorageReady)await persistDeviceNow();
  }catch(e){
    deviceStorageReady=false;
    console.warn('Device storage boot failed; local fallback remains active',e);
  }
  // First-run migration to native SQLite; existing data is preserved.
  try{
    if(NATIVE_RUNTIME && window.omDb){
      const mig=await window.omDb.bootstrapFromLegacy(data);
      if(mig?.migrated) console.info('ॐ: migrated legacy records to SQLite',mig.count);
    }
  }catch(e){console.warn('SQLite migration deferred; browser storage remains available',e)}
  __dirtySections.clear();
  render();
  if(NATIVE_RUNTIME){
    window.__lifeosNativeAttachmentMigrationPromise=migrateLegacyNativeAttachments();
  }
}
function scheduleLocalPersist(delay=220){
  clearTimeout(window.__lifeosPersistTimer);
  window.__lifeosPersistTimer=setTimeout(()=>persistLocalNow(),delay);
}
function flushLocalPersist(){
  clearTimeout(window.__lifeosPersistTimer);
  persistLocalNow();
}
function saveDraftField(el){
  if(!isDraftField(el))return;
  data.__drafts=data.__drafts||{};
  data.__drafts[el.id]=el.value;
  data.__updatedAt=Date.now();
  // Keep typing protection lightweight: save only the small draft map immediately,
  // then persist the full app state once the user pauses typing.
  try{localStorage.setItem(KEY+'_drafts',JSON.stringify(data.__drafts))}catch(e){}
  clearTimeout(draftSaveTimer);
  draftSaveTimer=setTimeout(()=>persistLocalNow(),180);
}
function restoreDrafts(){
  let storedDrafts=null;
  try{storedDrafts=JSON.parse(localStorage.getItem(KEY+'_drafts')||'null')}catch(e){}
  if(storedDrafts&&typeof storedDrafts==='object')data.__drafts={...(data.__drafts||{}),...storedDrafts};
  const drafts=data.__drafts||{};
  Object.keys(drafts).forEach(id=>{
    const el=document.getElementById(id);
    if(el&&isDraftField(el)&&document.activeElement!==el)el.value=drafts[id];
  });
}
function clearDrafts(ids){
  (ids||[]).forEach(id=>delete data.__drafts[id]);
  try{localStorage.setItem(KEY+'_drafts',JSON.stringify(data.__drafts||{}))}catch(e){}
}
function bindDraftAutosave(){
  if(window.__draftAutosaveBound)return;
  window.__draftAutosaveBound=true;
  document.addEventListener('input',e=>saveDraftField(e.target),{passive:true});
  document.addEventListener('change',e=>saveDraftField(e.target),{passive:true});
  window.addEventListener('beforeunload',flushLocalPersist);
  window.addEventListener('pagehide',flushLocalPersist,{passive:true});
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')flushLocalPersist();},{passive:true});
}
function compactLifeOSData(){
  // Safe cleanup: remove only malformed container entries; authored records stay intact.
  for(const key of ['tasks','notes','journal','expenses','income','habits','routines','goals','focusSessions']){
    if(Array.isArray(data[key]))data[key]=data[key].filter(x=>x&&typeof x==='object');
  }
  if(data.daily&&typeof data.daily==='object')for(const k of Object.keys(data.daily)){
    const v=data.daily[k];
    if(!v||typeof v!=='object')delete data.daily[k];
  }
}
function save(){
  data.__updatedAt=Date.now();
  // Native SQLite is the long-life canonical store in the Windows build.
  // Plain browser/local HTML uses IndexedDB/localStorage and must not invoke the Tauri bridge.
  if(NATIVE_RUNTIME && window.omDb){
    clearTimeout(window.__omDbSaveTimer);
    window.__omDbSaveTimer=setTimeout(()=>{
      const sections=[...__dirtySections].filter(k=>k&&k!=='__root');
      const saveStamp=Number(data?.__updatedAt||0);
      window.omDb.saveSnapshot(data,{sections}).then(()=>{
        // A second edit may have happened while SQLite was writing. Never clear
        // a dirty section from an older in-flight save; that could hide the newer edit.
        if(Number(data?.__updatedAt||0)===saveStamp) sections.forEach(k=>__dirtySections.delete(k));
      }).catch(e=>console.warn('SQLite save failed; browser fallback remains active',e));
    },350);
  }
  // IndexedDB remains the attachment/browser fallback layer.
  scheduleDeviceSave(deviceStorageReady?15000:1200);
  // Small localStorage bootstrap only; never make large synchronous writes part of the critical path.
  scheduleLocalPersist(deviceStorageReady?5000:300);
}

const BS_MONTHS=['बैसाख','जेठ','असार','साउन','भदौ','असोज','कार्तिक','मंसिर','पुष','माघ','फागुन','चैत'];
const BS_DATA={
2000:[30,32,31,32,31,30,30,30,29,30,29,31],2001:[31,31,32,31,31,31,30,29,30,29,30,30],2002:[31,31,32,32,31,30,30,29,30,29,30,30],2003:[31,32,31,32,31,30,30,30,29,29,30,31],2004:[30,32,31,32,31,30,30,30,29,30,29,31],2005:[31,31,32,31,31,31,30,29,30,29,30,30],2006:[31,31,32,32,31,30,30,29,30,29,30,30],2007:[31,32,31,32,31,30,30,30,29,29,30,31],2008:[31,31,31,32,31,31,29,30,30,29,29,31],2009:[31,31,32,31,31,31,30,29,30,29,30,30],2010:[31,31,32,32,31,30,30,29,30,29,30,30],2011:[31,32,31,32,31,30,30,30,29,29,30,31],2012:[31,31,31,32,31,31,29,30,30,29,30,30],2013:[31,31,32,31,31,31,30,29,30,29,30,30],2014:[31,31,32,32,31,30,30,29,30,29,30,30],2015:[31,32,31,32,31,30,30,30,29,29,30,31],2016:[31,31,31,32,31,31,29,30,30,29,30,30],2017:[31,31,32,31,31,31,30,29,30,29,30,30],2018:[31,32,31,32,31,30,30,29,30,29,30,30],2019:[31,32,31,32,31,30,30,30,29,30,29,31],2020:[31,31,31,32,31,31,30,29,30,29,30,30],2021:[31,31,32,31,31,31,30,29,30,29,30,30],2022:[31,32,31,32,31,30,30,30,29,29,30,30],2023:[31,32,31,32,31,30,30,30,29,30,29,31],2024:[31,31,31,32,31,31,30,29,30,29,30,30],2025:[31,31,32,31,31,31,30,29,30,29,30,30],2026:[31,32,31,32,31,30,30,30,29,29,30,31],2027:[30,32,31,32,31,30,30,30,29,30,29,31],2028:[31,31,32,31,31,31,30,29,30,29,30,30],2029:[31,31,32,31,32,30,30,29,30,29,30,30],2030:[31,32,31,32,31,30,30,30,29,29,30,31],2031:[30,32,31,32,31,30,30,30,29,30,29,31],2032:[31,31,32,31,31,31,30,29,30,29,30,30],2033:[31,31,32,32,31,30,30,29,30,29,30,30],2034:[31,32,31,32,31,30,30,30,29,29,30,31],2035:[30,32,31,32,31,31,29,30,30,29,29,31],2036:[31,31,32,31,31,31,30,29,30,29,30,30],2037:[31,31,32,32,31,30,30,29,30,29,30,30],2038:[31,32,31,32,31,30,30,30,29,29,30,31],2039:[31,31,31,32,31,31,29,30,30,29,30,30],2040:[31,31,32,31,31,31,30,29,30,29,30,30],2041:[31,31,32,32,31,30,30,29,30,29,30,30],2042:[31,32,31,32,31,30,30,30,29,29,30,31],2043:[31,31,31,32,31,31,29,30,30,29,30,30],2044:[31,31,32,31,31,31,30,29,30,29,30,30],2045:[31,32,31,32,31,30,30,29,30,29,30,30],2046:[31,32,31,32,31,30,30,30,29,29,30,31],2047:[31,31,31,32,31,31,30,29,30,29,30,30],2048:[31,31,32,31,31,31,30,29,30,29,30,30],2049:[31,32,31,32,31,30,30,30,29,29,30,30],2050:[31,32,31,32,31,30,30,30,29,30,29,31],2051:[31,31,31,32,31,31,30,29,30,29,30,30],2052:[31,31,32,31,31,31,30,29,30,29,30,30],2053:[31,32,31,32,31,30,30,30,29,29,30,30],2054:[31,32,31,32,31,30,30,30,29,30,29,31],2055:[31,31,32,31,31,31,30,29,30,29,30,30],2056:[31,31,32,31,32,30,30,29,30,29,30,30],2057:[31,32,31,32,31,30,30,30,29,29,30,31],2058:[30,32,31,32,31,30,30,30,29,30,29,31],2059:[31,31,32,31,31,31,30,29,30,29,30,30],2060:[31,31,32,32,31,30,30,29,30,29,30,30],2061:[31,32,31,32,31,30,30,30,29,29,30,31],2062:[30,32,31,32,31,31,29,30,29,30,29,31],2063:[31,31,32,31,31,31,30,29,30,29,30,30],2064:[31,31,32,32,31,30,30,29,30,29,30,30],2065:[31,32,31,32,31,30,30,30,29,29,30,31],2066:[31,31,31,32,31,31,29,30,30,29,29,31],2067:[31,31,32,31,31,31,30,29,30,29,30,30],2068:[31,31,32,32,31,30,30,29,30,29,30,30],2069:[31,32,31,32,31,30,30,30,29,29,30,31],2070:[31,31,31,32,31,31,29,30,30,29,30,30],2071:[31,31,32,31,31,31,30,29,30,29,30,30],2072:[31,32,31,32,31,30,30,29,30,29,30,30],2073:[31,32,31,32,31,30,30,30,29,29,30,31],2074:[31,31,31,32,31,31,30,29,30,29,30,30],2075:[31,31,32,31,31,31,30,29,30,29,30,30],2076:[31,32,31,32,31,30,30,30,29,29,30,30],2077:[31,32,31,32,31,30,30,30,29,30,29,31],2078:[31,31,31,32,31,31,30,29,30,29,30,30],2079:[31,31,32,31,31,31,30,29,30,29,30,30],2080:[31,32,31,32,31,30,30,30,29,29,30,30],2081:[31,31,32,32,31,30,30,30,29,30,30,30],2082:[31,31,31,32,31,31,30,29,30,29,30,30],2083:[31,31,32,31,31,31,30,29,30,29,30,30],2084:[31,31,32,31,31,30,30,29,30,30,30,30],2085:[31,32,31,32,30,31,30,30,29,30,30,30],2086:[30,32,31,32,31,30,30,30,29,30,30,30],2087:[31,31,32,31,31,31,30,30,29,30,30,30],2088:[30,31,32,32,30,31,30,30,29,30,30,30],2089:[30,32,31,32,31,30,30,30,29,30,30,30],2090:[30,32,31,32,31,30,30,30,29,30,30,30]};
const BS_EPOCH=Date.UTC(1943,3,14);
const BS_YEAR_STARTS=(()=>{
  const out={};
  let days=0;
  for(let y=2000;y<=2090;y++){
    out[y]=BS_EPOCH+days*86400000;
    const months=BS_DATA[y];
    days+=months.reduce((a,b)=>a+b,0);
  }
  out[2091]=BS_EPOCH+days*86400000;
  return out;
})();
const BS_YEARS=Object.keys(BS_DATA).map(Number);
function adToBs(iso){
  const parts=String(iso||'').split('-').map(Number);
  if(parts.length!==3||!parts.every(Number.isFinite))return null;
  const [y,m,d]=parts;
  if(y<1||m<1||m>12||d<1||d>31)return null;
  const t=Date.UTC(y,m-1,d);
  if(new Date(t).getUTCFullYear()!==y||new Date(t).getUTCMonth()!==m-1||new Date(t).getUTCDate()!==d)return null;
  const first=BS_YEAR_STARTS[2000], last=BS_YEAR_STARTS[2091];
  if(t<first||t>=last)return null;

  let lo=0,hi=BS_YEARS.length-1,by=2000;
  while(lo<=hi){
    const mid=(lo+hi)>>1, candidate=BS_YEARS[mid];
    if(BS_YEAR_STARTS[candidate]<=t){by=candidate;lo=mid+1}else{hi=mid-1}
  }

  let days=Math.floor((t-BS_YEAR_STARTS[by])/86400000);
  const months=BS_DATA[by];
  let bm=1;
  for(const md of months){
    if(days<md)break;
    days-=md;
    bm++;
  }
  return {
    year:by,
    month:bm,
    day:days+1,
    label:`${by}-${String(bm).padStart(2,'0')}-${String(days+1).padStart(2,'0')}`,
    monthName:BS_MONTHS[bm-1]
  };
}
function bsToAd(iso){
  const parts=String(iso||'').split('-').map(Number);
  if(parts.length!==3||!parts.every(Number.isFinite))return null;
  const [y,m,d]=parts;
  const months=BS_DATA[y];
  if(!months||m<1||m>12||d<1||d>months[m-1])return null;
  let days=Math.floor((BS_YEAR_STARTS[y]-BS_EPOCH)/86400000);
  for(let i=0;i<m-1;i++)days+=months[i];
  days+=d-1;
  const dt=new Date(BS_EPOCH+days*86400000);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth()+1).padStart(2,'0')}-${String(dt.getUTCDate()).padStart(2,'0')}`;
}
function formatBsShort(iso){const bs=adToBs(iso);return bs?`${bs.day} ${bs.monthName} ${bs.year}`:'—'}

let bsCalendarTarget='today',bsCalendarYear=2083,bsCalendarMonth=1;

function closeBsCalendar(){document.getElementById('bsCalendarModal')?.classList.remove('open');document.body.classList.remove('bs-calendar-open')}
function moveBsMonth(delta){let y=bsCalendarYear,m=bsCalendarMonth+delta;if(m<1){m=12;y--}if(m>12){m=1;y++}if(BS_DATA[y]){bsCalendarYear=y;bsCalendarMonth=m;renderBsCalendar()}}
function renderBsCalendar(){const root=document.getElementById('bsCalendarModal');if(!root)return;const months=BS_DATA[bsCalendarYear];if(!months)return;const firstAd=bsToAd(`${bsCalendarYear}-${String(bsCalendarMonth).padStart(2,'0')}-01`);const days=months[bsCalendarMonth-1];const firstDay=new Date(firstAd+'T00:00:00Z').getUTCDay();const selectedAd=document.getElementById(bsCalendarTarget)?.value||'';const currentAd=document.getElementById('today')?.value||today();let cells='';for(let i=0;i<firstDay;i++)cells+='<div></div>';for(let d=1;d<=days;d++){const bsIso=`${bsCalendarYear}-${String(bsCalendarMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;const ad=bsToAd(bsIso);const wd=new Date(ad+'T00:00:00Z').getUTCDay();const selected=ad===selectedAd?' selected':'';const isToday=ad===currentAd?' today':'';cells+=`<button type="button" class="bs-day ${wd===6?'sat':''}${selected}${isToday}" onclick="selectBsCalendarDate('${ad}')"><span class="bs-num">${d}</span><span class="ad-num">${ad.slice(8,10)} ${new Date(ad+'T00:00:00Z').toLocaleString('en',{month:'short',timeZone:'UTC'})}</span></button>`;}const monthName=BS_MONTHS[bsCalendarMonth-1];const startAd=bsToAd(`${bsCalendarYear}-${String(bsCalendarMonth).padStart(2,'0')}-01`);const endAd=bsToAd(`${bsCalendarYear}-${String(bsCalendarMonth).padStart(2,'0')}-${String(days).padStart(2,'0')}`);root.innerHTML=`<div class="bs-calendar-card" role="dialog" aria-modal="true" aria-label="Bikram Sambat calendar"><div class="bs-calendar-top"><button type="button" class="bs-cal-nav" onclick="moveBsMonth(-1)" aria-label="Previous month">‹</button><div class="bs-calendar-title"><strong>${monthName} ${bsCalendarYear}</strong><span>${startAd} → ${endAd}</span></div><button type="button" class="bs-cal-nav" onclick="moveBsMonth(1)" aria-label="Next month">›</button></div><div class="bs-calendar-tools"><select aria-label="BS year" onchange="bsCalendarYear=Number(this.value);renderBsCalendar()">${Object.keys(BS_DATA).map(y=>`<option value="${y}" ${Number(y)===bsCalendarYear?'selected':''}>${y} BS</option>`).join('')}</select><select aria-label="BS month" onchange="bsCalendarMonth=Number(this.value);renderBsCalendar()">${BS_MONTHS.map((m,i)=>`<option value="${i+1}" ${i+1===bsCalendarMonth?'selected':''}>${m}</option>`).join('')}</select></div><div class="bs-calendar-grid"><div class="bs-weekday">आइत</div><div class="bs-weekday">सोम</div><div class="bs-weekday">मंगल</div><div class="bs-weekday">बुध</div><div class="bs-weekday">बिहि</div><div class="bs-weekday">शुक्र</div><div class="bs-weekday">शनि</div>${cells}</div><div class="bs-calendar-footer"><span>BS दिन मुख्य · AD नीचे</span><button type="button" class="secondary bs-close" onclick="closeBsCalendar()">Close</button></div>${(data.journal||[]).length>150?`<div class="meta" style="padding:10px">Showing latest 150 of ${(data.journal||[]).length} journal entries.</div>`:''}</div>`}

function today(){const el=document.getElementById('today');if(el&&el.value)return el.value;const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`}
function esc(s=''){return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m]))}
function uid(){return (crypto&&crypto.randomUUID)?crypto.randomUUID():Date.now()+Math.random().toString(16).slice(2)}
function nav(){const isMobile=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'')||window.innerWidth<=700;const items=isMobile?navItems:navItems.filter(([id])=>id!=='device-storage');document.getElementById('nav').innerHTML=items.map(([id,t])=>`<button onclick="show('${id}')" id="nav-${id}">${t}</button>`).join('')}
window.toggleMobileNav=function(force){
 const d=document.getElementById('mobileNavDrawer'), b=document.getElementById('mobileNavBackdrop'), btn=document.getElementById('mobileMenuButton');
 if(!d||!b)return false;
 const open=typeof force==='boolean'?force:!d.classList.contains('open');
 d.classList.toggle('open',open); b.classList.toggle('open',open); document.body.classList.toggle('mobile-nav-open',open);
 if(btn){btn.setAttribute('aria-expanded',String(open));btn.setAttribute('aria-label',open?'Close navigation':'Open navigation');btn.textContent=open?'×':'☰';}
 return open;
};
(function(){
 function initMobileNav(){
  const btn=document.getElementById('mobileMenuButton'), back=document.getElementById('mobileNavBackdrop'), drawer=document.getElementById('mobileNavDrawer');
  if(!btn||!back||!drawer)return;
  // Direct onclick on the native button is the primary interaction path.
  // No preventDefault/pointerup handler is attached here, so touch-generated
  // clicks remain reliable in Chrome, Android WebView and tablet browsers.
  back.addEventListener('click',function(e){if(e.target===back)window.toggleMobileNav(false);});
  drawer.addEventListener('click',function(e){const n=e.target.closest('#nav button');if(n)window.toggleMobileNav(false);});
  document.addEventListener('keydown',function(e){if(e.key==='Escape')window.toggleMobileNav(false);});
  window.addEventListener('resize',function(){if(window.innerWidth>1050)window.toggleMobileNav(false);});
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initMobileNav,{once:true});else initMobileNav();
})();
const __lazyState=new Map();
const __lazyTokens=new Map();
const __lazyPageSize=200;
const __lazyMap={
  tasks:'tasks',notes:'notes',journal:'journal',expenses:'expenses',income:'income',
  habits:'habits',routine:'routines',goals:'goals',focus:'focusSessions',planner:'daily',
  personal:'personal',professional:'professional',spiritual:'spiritual',economical:'economical',mental:'mental',social:'social',moral:'moral'
};
function lazyTodayWindow(months=6){
  const d=new Date();d.setMonth(d.getMonth()-months);return d.toISOString().slice(0,10);
}
async function ensureLazySection(key,{append=false,limit=__lazyPageSize,fromDate=null,toDate=null}={}){
  if(!NATIVE_RUNTIME||!window.omDb?.listPage)return;
  const state=__lazyState.get(key)||{loaded:0,hasMore:true,fromDate:null,toDate:null,cursor:null};
  if(!append && state.loaded>0 && state.fromDate===fromDate && state.toDate===toDate)return;
  const cursor=append?state.cursor:null;
  const rows=await window.omDb.listPage(key,{limit,offset:0,cursor,fromDate,toDate});
  if(append) data[key]=[...(Array.isArray(data[key])?data[key]:[]),...rows];
  else data[key]=rows;
  // Older native releases kept attachment bytes in browser IndexedDB while
  // SQLite stored only metadata. Hydrate the loaded page and immediately fold
  // those bytes into the canonical SQLite payload so backups become complete.
  if((key==='notes'||key==='journal') && typeof hydrateAttachmentsFromIDB==='function'){
    const before=JSON.stringify(data[key]);
    await hydrateAttachmentsFromIDB(data);
    if(before!==JSON.stringify(data[key])) await window.omDb.persistSection(key,data[key],{force:true});
  }
  const last=rows.length?rows[rows.length-1]:null;
  const next={loaded:data[key].length,hasMore:rows.length>=limit,fromDate,toDate,cursor:last?{dateKey:last.date||last.targetDate||last.createdAt||last.updatedAt||'',updatedAt:Number(last.updatedAt||last.createdAt||0),recordId:String(last.id||'')}:state.cursor};
  __lazyState.set(key,next);
  window.omDb.primeSection?.(key,data[key]);
}
async function refreshNativeFinanceSummary(fromDate='2000-01-01',toDate=today()){
  if(!NATIVE_RUNTIME||!window.omDb?.financeSummary)return null;
  try{window.__nativeFinanceSummary=await window.omDb.financeSummary(fromDate,toDate);return window.__nativeFinanceSummary}catch(e){console.warn('Native finance summary unavailable',e);return null}
}
async function ensureLazyDaily({append=false,limit=__lazyPageSize}={}){
  if(!NATIVE_RUNTIME||!window.omDb?.listPage)return;
  const key='daily';
  const state=__lazyState.get(key)||{loaded:0,hasMore:true,cursor:null};
  const cursor=append?state.cursor:null;
  const rows=await window.omDb.listPage(key,{limit,offset:0,cursor});
  if(!append)data.daily={};
  for(const row of rows){
    const date=String(row?.date||row?.id||'').slice(0,10);
    if(date)data.daily[date]={...row};
  }
  const last=rows.length?rows[rows.length-1]:null;
  __lazyState.set(key,{loaded:Object.keys(data.daily||{}).length,hasMore:rows.length>=limit,cursor:last?{dateKey:last.date||last.createdAt||last.updatedAt||'',updatedAt:Number(last.updatedAt||last.createdAt||0),recordId:String(last.id||'')}:state.cursor});
  window.omDb.primeDaily?.(Object.values(data.daily||{}));
}
async function ensureSectionLoaded(id,{append=false}={}){
  if(!NATIVE_RUNTIME||!window.omDb?.listPage)return;
  if(id==='dashboard'){
    const tasks=ensureLazySection('tasks',{limit:200,fromDate:today(),toDate:today()});
    const habits=ensureLazySection('habits',{limit:200,fromDate:today(),toDate:today()});
    const from=lazyTodayWindow(6),to=today();
    await Promise.all([tasks,habits,ensureLazySection('income',{limit:250,fromDate:from,toDate:to}),ensureLazySection('expenses',{limit:250,fromDate:from,toDate:to})]);
    await refreshNativeFinanceSummary?.(data?.mentor?.startDate||from);
    return;
  }
  if(id==='planner'){await ensureLazyDaily({append});return;}
  if(id==='mentor'){
    const from=data?.mentor?.startDate||lazyTodayWindow(12),to=today();
    await Promise.all([ensureLazySection('tasks',{limit:200,fromDate:from,toDate:to}),ensureLazySection('habits',{limit:200,fromDate:from,toDate:to}),ensureLazySection('income',{limit:250,fromDate:from,toDate:to}),ensureLazySection('expenses',{limit:250,fromDate:from,toDate:to})]);
    await refreshNativeFinanceSummary?.(from);
    return;
  }
  const key=__lazyMap[id];
  if(!key)return;
  if(id==='expenses'){
    await Promise.all([ensureLazySection('income',{append,limit:__lazyPageSize}),ensureLazySection('expenses',{append,limit:__lazyPageSize})]);
    return;
  }
  await ensureLazySection(key,{append,limit:__lazyPageSize});
}
async function loadMoreCurrentSection(){
  const id=document.querySelector('.section.active')?.id;
  if(!id||id==='dashboard'||!NATIVE_RUNTIME)return;
  const key=__lazyMap[id];
  if(id==='planner'){await ensureLazyDaily({append:true});}
  else if(id==='expenses'){
    await Promise.all([ensureLazySection('income',{append:true}),ensureLazySection('expenses',{append:true})]);
  }else if(key){await ensureLazySection(key,{append:true});}
  render();
}
window.loadMoreCurrentSection=loadMoreCurrentSection;
function addLazyMoreButton(id){
  if(!NATIVE_RUNTIME||id==='dashboard')return;
  const key=__lazyMap[id];
  if(!key && id!=='expenses')return;
  const section=document.getElementById(id);if(!section)return;
  section.querySelector('.lazy-more-wrap')?.remove();
  const states=id==='expenses'?[__lazyState.get('income'),__lazyState.get('expenses')]:[__lazyState.get(key)];
  if(!states.some(x=>x?.hasMore))return;
  const wrap=document.createElement('div');wrap.className='lazy-more-wrap';wrap.innerHTML='<button type="button" class="secondary full" onclick="window.loadMoreCurrentSection()">Load more history</button>';
  section.appendChild(wrap);
}
function show(id){document.querySelectorAll('.section').forEach(x=>x.classList.remove('active'));const target=document.getElementById(id);if(target)target.classList.add('active');document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));const nb=document.getElementById('nav-'+id);if(nb)nb.classList.add('active');document.querySelectorAll('#mobileBottomNav button[data-section]').forEach(x=>x.classList.toggle('active',x.dataset.section===id));const item=navItems.find(x=>x[0]===id);const title=item?item[1].replace(/^[^ ]+ /,''):id;document.getElementById('pageTitle').textContent=title;const mt=document.getElementById('mobilePageTitle');if(mt)mt.textContent=title;window.toggleMobileNav?.(false);const token=Date.now()+Math.random();__lazyTokens.set(id,token);render();ensureSectionLoaded(id).then(()=>{if(__lazyTokens.get(id)===token){addLazyMoreButton(id);if(NATIVE_RUNTIME)requestAnimationFrame(()=>{if(__lazyTokens.get(id)===token)render()})}}).catch(e=>console.warn('Lazy section load failed',id,e))}
function dayObj(){
  if(!data||typeof data!=='object')return {target:'',progress:'',planPoints:[],achievementPoints:[],reflectionPoints:[]};
  if(!data.daily||typeof data.daily!=='object'||Array.isArray(data.daily))data.daily={};
  const key=today();
  if(!data.daily[key]||typeof data.daily[key]!=='object'||Array.isArray(data.daily[key]))data.daily[key]={target:'',progress:'',planPoints:[],achievementPoints:[],reflectionPoints:[]};
  const d=data.daily[key];
  if(!Array.isArray(d.planPoints))d.planPoints=[];
  if(!Array.isArray(d.achievementPoints))d.achievementPoints=[];
  if(!Array.isArray(d.reflectionPoints))d.reflectionPoints=[];
  return d;
}
function addPoint(kind){let x=prompt('Point लिखें:');if(x&&x.trim()){dayObj()[kind].push({id:uid(),text:x.trim(),done:false});save();render()}}
function togglePoint(kind,id){let p=dayObj()[kind].find(x=>x.id===id);if(p)p.done=!p.done;save();render()}
function delPoint(kind,id){if(!confirm('इस point को delete करें?'))return;let a=dayObj()[kind]||[];dayObj()[kind]=a.filter(x=>x.id!==id);save();render()} function pointHtml(kind){let a=dayObj()[kind]||[];return a.length?a.map(x=>`<div class="point ${x.done?'point-done':''}"><input type="checkbox" ${x.done?'checked':''} onchange="togglePoint('${kind}','${x.id}')"><span class="point-text">${esc(x.text)}</span><div class="point-actions"><button class="secondary point-action-done" type="button" onclick="togglePoint('${kind}','${x.id}')">${x.done?'Undo':'Done'}</button><button class="danger point-action-delete" type="button" onclick="delPoint('${kind}','${x.id}')">Delete</button></div></div>`).join(''):'<div class="muted">अभी कोई point नहीं है।</div>'}
function renderDashboard(){
 const td=data.tasks.filter(x=>x.date===today()),done=td.filter(x=>x.done).length;
 const ex=data.expenses.filter(x=>x.date===today()).reduce((a,b)=>a+Number(b.amount||0),0);
 const inc=data.income.filter(x=>x.date===today()).reduce((a,b)=>a+Number(b.amount||0),0);
 const h=data.habits.filter(x=>x.date===today()),hd=h.filter(x=>x.done).length;
 document.getElementById('dashboard').innerHTML=`
 <div class="hero"><b>आज का Dashboard</b><div class="muted">Simple overview — all your detailed work stays in its own sections.</div></div><div class="grid dashboard-kpi-grid"><div class="card"><div class="label">आज के Tasks</div><div class="metric">${done}/${td.length}</div><div class="progress"><i style="width:${td.length?done/td.length*100:0}%"></i></div></div><div class="card"><div class="label">आज की Habits</div><div class="metric">${hd}/${h.length}</div></div><div class="card"><div class="label">आज का Balance</div><div class="metric">₹${(inc-ex).toFixed(2)}</div></div><div class="card"><div class="label">💰 Runway</div><div class="metric">${mentorFinance().runway.toFixed(1)} days</div></div></div><div class="card dashboard-finance-card"><h2>💰 Today's Finance</h2><div class="two dashboard-finance" style="grid-template-columns:repeat(2,minmax(0,1fr));"><div class="dashboard-finance-box income-box"><div class="label">Income</div><div class="money income">₹${inc.toFixed(2)}</div></div><div class="dashboard-finance-box expense-box"><div class="label">Expenses</div><div class="money expense">₹${ex.toFixed(2)}</div></div></div></div><div class="card dashboard-finance-overview" style="margin-top:12px"><h2>📊 Finance Overview</h2><div id="financeDashboardChart" class="muted">Loading…</div></div><div class="mentor-grid"><div class="card dashboard-quote-card"><div class="quote-head"><div class="dashboard-quote-date-wrap"><div class="meta quote-date dashboard-quote-date">AD ${esc(today())} · BS ${esc(formatBsShort(today()))}</div></div><div class="quote-title"><h2>🧭 Today's Mentor Principle / Quote</h2></div><div class="mentor-action-stack"><button class="secondary" type="button" onclick="show('mentor')">Open Mentor</button></div></div><div class="dashboard-quote-text">“${esc(mentorQuoteForDate(today())?.text||'आज का छोटा अनुशासन, कल की बड़ी स्वतंत्रता बनता है।')}”</div><div class="meta dashboard-quote-author">— ${esc(mentorQuoteForDate(today())?.author||'Mentor')} · ${esc(mentorQuoteForDate(today())?.category||'Discipline')}</div></div></div>`;
 drawFinanceDashboardChart();
}

function renderTasks(){
 document.getElementById('tasks').innerHTML=`<div class="two"><div class="card"><h2>➕ Add Task</h2><div class="formgrid"><input id="tt" placeholder="Task title"><select id="tc"><option>Professional</option><option>Personal</option><option>Spiritual</option><option>Social</option><option>Moral</option><option>Health</option><option>Finance</option></select>${dateFieldMarkup('td',today(),'Task date')}<input id="tm" type="time"><select id="tp"><option>High</option><option>Medium</option><option>Low</option></select><input id="ttag" placeholder="Tags"><button class="primary" onclick="addTask()">Add Task</button></div></div><div class="card"><h2>📌 Filter</h2><select id="filter" onchange="renderTaskList()"><option>All</option><option>Professional</option><option>Personal</option><option>Spiritual</option><option>Social</option><option>Moral</option><option>Health</option><option>Finance</option><option>Completed</option></select></div></div><div class="card" style="margin-top:16px"><div id="taskList"></div></div>`;
 renderTaskList();
}
function tags(s){return (s||'').split(',').map(x=>x.trim()).filter(Boolean).map(x=>`<span class="tag">#${esc(x)}</span>`).join('')}
function renderTaskList(){let f=document.getElementById('filter')?.value||'All',all=data.tasks.filter(x=>f==='All'||(f==='Completed'?x.done:x.category===f)),a=all.slice().sort((x,y)=>String(y.date||'').localeCompare(String(x.date||''))).slice(0,200);document.getElementById('taskList').innerHTML=a.length?`<div class="list">${a.map(x=>`<div class="item ${x.done?'done':''}"><div class="between"><div><span class="title">${esc(x.title)}</span> ${tags(x.tags)}<div class="meta">${esc(x.category)} · ${esc(x.priority)} · ${esc(x.date||'')} ${esc(x.time||'')}</div></div><div class="row"><button class="secondary" onclick="toggleTask('${x.id}')">${x.done?'Undo':'Done'}</button><button class="danger" onclick="delTask('${x.id}')">Delete</button></div></div></div>`).join('')}</div>${all.length>200?`<div class="meta" style="padding:10px">Showing latest 200 of ${all.length}. Use the filter to narrow the list.</div>`:''}`:'<div class="empty">कोई task नहीं।</div>'}
function addTask(){let title=document.getElementById('tt').value.trim();if(!title)return;data.tasks.push({id:uid(),title,category:document.getElementById('tc').value,date:document.getElementById('td').value, time:document.getElementById('tm').value,priority:document.getElementById('tp').value,tags:document.getElementById('ttag').value,done:false});clearDrafts(['tt','tc','td','tm','tp','ttag']);save();renderTasks()}
function toggleTask(id){let x=data.tasks.find(x=>x.id===id);if(x)x.done=!x.done;save();renderTasks()}function delTask(id){data.tasks=data.tasks.filter(x=>x.id!==id);save();renderTasks()}

function routineStart(x){return String(x?.startTime||x?.time||'').slice(0,5)}
function routineEnd(x){return String(x?.endTime||'').slice(0,5)}
function routineRange(x){const a=routineStart(x),b=routineEnd(x);return a&&b?`${a} से ${b} तक`:a||'--:--'}
function addRoutine(){
  const n=document.getElementById('rn')?.value.trim()||'';
  const start=document.getElementById('rtStart')?.value||'';
  const end=document.getElementById('rtEnd')?.value||'';
  if(!n)return toast('Routine / Activity लिखें');
  if(!start||!end)return toast('Start और End दोनों time चुनें');
  if(end<=start)return toast('End time, Start time के बाद होना चाहिए');
  data.routines.push({id:uid(),name:n,startTime:start,endTime:end,time:start,category:document.getElementById('rc')?.value||'Personal',note:document.getElementById('rnote')?.value.trim()||'',date:today(),done:false});
  clearDrafts(['rtStart','rtEnd','rc','rn','rnote']);save();renderRoutine();
}
function toggleRoutine(id){let x=data.routines.find(x=>x.id===id);if(x){x.done=!x.done;save();renderRoutine()}}
function delRoutine(id){if(!confirm('इस routine को delete करें?'))return;data.routines=data.routines.filter(x=>x.id!==id);save();renderRoutine()}

function routineList(todayOnly=false){
  const a=data.routines.filter(x=>!todayOnly||x.date===today()).slice().sort((a,b)=>routineStart(a).localeCompare(routineStart(b)));
  return a.length?a.map(x=>`<div class="routine-item ${x.done?'routine-completed':''}"><div class="routine-item-top"><span class="routine-item-time">${esc(routineRange(x))}</span><span class="routine-item-cat">${esc(x.category||'Personal')}</span></div><div class="routine-item-body"><b>${esc(x.name)}</b><div class="meta">${esc(x.note||'')}</div></div><div class="routine-item-actions"><button class="routine-done secondary" type="button" onclick="toggleRoutine('${x.id}')">${x.done?'↩ Undo':'✓ Done'}</button><button class="routine-delete danger" type="button" onclick="delRoutine('${x.id}')">🗑 Delete</button></div></div>`).join(''):'<div class="muted">आज कोई routine नहीं।</div>';
}

function renderRoutine(){document.getElementById('routine').innerHTML=`<div class="two"><div class="card"><h2>🕉 Routine Planner</h2><p class="muted">हर routine को स्पष्ट time block में रखें — जैसे <b>04:00 से 05:00 तक</b>.</p><div class="formgrid"><div><label class="label">Start time</label><input id="rtStart" type="time"></div><div><label class="label">End time</label><input id="rtEnd" type="time"></div><select id="rc"><option>Personal</option><option>Professional</option><option>Spiritual</option><option>Social</option><option>Moral</option></select><input id="rn" placeholder="Routine / Activity"><input id="rnote" placeholder="Short note"><button class="primary full" onclick="addRoutine()">+ Add Time Block</button></div></div><div class="card"><h2>🎯 Routine Categories</h2><p class="muted">Personal · Professional · Spiritual · Social · Moral</p><div class="balance"><b>Example</b><div class="time-block-example">04:00 से 05:00 तक</div><div class="meta">Morning study / prayer / exercise</div></div></div></div><div class="card" style="margin-top:14px"><div class="between"><h2 style="margin:0">Today's Routine</h2><span class="tag">Time blocks</span></div>${routineList(true)}</div>`}

function setNoteColor(c){noteColor=c||'#fff8c5';let e=document.getElementById('noteEditor');if(e)e.style.background=noteColor;let p=document.getElementById('ncustom');if(p)p.value=noteColor}
function renderNotes(){noteColor='#fff8c5';noteImages=[];document.getElementById('notes').innerHTML=`<div class="note-grid"><div class="card note-editor" id="noteEditor"><h2>📝 Detailed Note</h2><p class="muted">Title, category, rich text, point-wise details और images के साथ पूरा note लिखें.</p><div class="form"><input id="nt" placeholder="Note title"><input id="ntag" placeholder="Tags: idea, meeting"><div class="two"><select id="ncatSelect" onchange="syncNotebookManual()"><option value="">Select notebook / category</option>${financeNotebookCategories.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}<option value="__manual__">✍️ Manual entry</option></select><input id="ncat" placeholder="Manual notebook / category (optional)" disabled></div><div class="full color-line"><span class="label">Color</span><input id="ncustom" class="color-input" type="color" value="#fff8c5" onchange="setNoteColor(this.value)"><span class="label">Any color</span></div><div class="full"><div class="theme-grid"><button class="swatch" style="background:#fff8c5" onclick="setNoteColor('#fff8c5')"></button><button class="swatch" style="background:#f0edff" onclick="setNoteColor('#f0edff')"></button><button class="swatch" style="background:#e9f8ef" onclick="setNoteColor('#e9f8ef')"></button><button class="swatch" style="background:#eaf3ff" onclick="setNoteColor('#eaf3ff')"></button><button class="swatch" style="background:#ffeef0" onclick="setNoteColor('#ffeef0')"></button><button class="swatch" style="background:#fff" onclick="setNoteColor('#fff')"></button></div></div><div class="full"><div class="rich-toolbar"><button type="button" onclick="richCmd('bold')"><b>B</b></button><button type="button" onclick="richCmd('italic')"><i>I</i></button><button type="button" onclick="richCmd('underline')"><u>U</u></button><button type="button" onclick="richCmd('insertUnorderedList')">• List</button><button type="button" onclick="richCmd('justifyLeft')">←</button><button type="button" onclick="richCmd('justifyCenter')">↔</button><button type="button" onclick="richCmd('justifyRight')">→</button><select onchange="richFontSize(this.value);this.selectedIndex=0"><option>Size</option><option value="2">Small</option><option value="3">Normal</option><option value="5">Large</option><option value="7">Huge</option></select><input type="color" value="#202124" onchange="richColor(this.value)" title="Font color"></div><div id="nb" class="rich-editor full" contenteditable="true" data-draft-id="nb"></div></div><textarea id="npoints" class="full" placeholder="Point-wise notes — हर line एक point"></textarea><div class="full"><b>🖼️ Add Images</b><input id="nfiles" type="file" accept="image/*" multiple onchange="previewImages(this)" style="margin-top:7px"><div id="photoPreview" class="photo-preview"></div></div><button class="btn primary full" onclick="addNote()">Save Note</button></div></div><div class="card"><h2>🔎 Search Notes</h2><input id="nf" placeholder="Search title, text, tag..." oninput="renderNoteList()"></div></div><div class="card" style="margin-top:16px"><div id="noteList"></div></div>`;renderNoteList()}
async function compressImage(file){
  if(!file.type.startsWith('image/')) return null;
  if(!('createImageBitmap' in window) && !/image\/(jpeg|jpg|png|webp)$/i.test(file.type)) return null;
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url});
    const scale=Math.min(1,MAX_IMAGE_SIDE/Math.max(img.naturalWidth||img.width,img.naturalHeight||img.height));
    const c=document.createElement('canvas');c.width=Math.max(1,Math.round((img.naturalWidth||img.width)*scale));c.height=Math.max(1,Math.round((img.naturalHeight||img.height)*scale));
    c.getContext('2d',{alpha:true}).drawImage(img,0,0,c.width,c.height);
    let q=.78, out=c.toDataURL('image/jpeg',q);
    while(out.length>MAX_IMAGE_BYTES*1.37 && q>.45){q-=.07;out=c.toDataURL('image/jpeg',q)}
    return out;
  }finally{URL.revokeObjectURL(url)}
}
async function previewImages(inp){noteImages=[];let files=[...inp.files].slice(0,8),p=document.getElementById('photoPreview');if(!p)return;p.innerHTML='';for(const f of files){if(f.size>8*1024*1024){toast('Image 8 MB से बड़ी है: '+f.name);continue}const out=await compressImage(f);if(!out){toast('Unsupported image: '+f.name);continue}noteImages.push(out);const img=document.createElement('img');img.loading='lazy';img.decoding='async';img.src=out;img.alt='note image';p.appendChild(img)}if(noteImages.length)toast(`🖼️ ${noteImages.length} image${noteImages.length>1?'s':''} optimized`) }
function richCmd(cmd){const e=document.getElementById('nb');if(!e)return;e.focus();try{document.execCommand(cmd,false,null)}catch(_){};saveRichDraft()}
function richFontSize(v){const e=document.getElementById('nb');if(!e||!v)return;e.focus();try{document.execCommand('fontSize',false,v)}catch(_){};saveRichDraft()}
function richColor(v){const e=document.getElementById('nb');if(!e)return;e.focus();try{document.execCommand('foreColor',false,v)}catch(_){};saveRichDraft()}
function richHtml(){return sanitizeRichHtml(document.getElementById('nb')?.innerHTML.trim()||'')}
function richText(){return (document.getElementById('nb')?.innerText||'').trim()}
function saveRichDraft(){data.__drafts.nb=richHtml();data.__updatedAt=Date.now();scheduleLocalPersist(350)}
const financeNotebookCategories=['Personal','Work','Study','Ideas','Projects','Meetings','Finance','Journal','Reference','Other'];
function syncNotebookManual(){const select=document.getElementById('ncatSelect'),input=document.getElementById('ncat');if(!select||!input)return;const manual=select.value==='__manual__';input.disabled=!manual;input.required=manual;if(!manual)input.value='';if(manual)input.focus()}
function notebookLabel(){const select=document.getElementById('ncatSelect'),input=document.getElementById('ncat');if(input&&input.value.trim())return input.value.trim();if(select&&select.value&&select.value!=='__manual__')return select.value;return ''}
async function addNote(){let t=document.getElementById('nt').value.trim(),b=richText(),bh=richHtml(),pts=document.getElementById('npoints').value.trim(),cat=notebookLabel();if(!t&&!b&&!pts&&!noteImages.length)return toast('Note में content या image जोड़ें');const note={id:uid(),title:t||'Untitled',body:b,html:bh,points:pts,category:cat||'General',color:document.getElementById('ncustom').value||noteColor,tags:document.getElementById('ntag').value,date:today(),images:noteImages.slice()};data.notes.unshift(note);clearDrafts(['nt','ntag','ncat','ncatSelect','nb','npoints']);const stored=await persistAttachmentItemToIDB('note',note);if(note.images.length&&!stored)return toast('⚠️ Image storage failed. Note save रोक दिया गया — retry करें.');save();renderNotes();toast('Note saved')}
function renderNoteList(){let q=(document.getElementById('nf')?.value||'').toLowerCase(),all=data.notes.filter(x=>`${x.title||''} ${x.body||''} ${x.points||''} ${x.tags||''} ${x.category||''}`.toLowerCase().includes(q)),a=all.slice(0,150);document.getElementById('noteList').innerHTML=a.length?`<div class="grid g3">${a.map(x=>{let pts=(x.points||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);let imgs=Array.isArray(x.images)?x.images:[];return `<article class="note-card" style="background:${/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#fff8c5'}"><div class="between"><div><div class="title">${esc(x.title)}</div><div class="meta">${esc(x.date||'')} · ${esc(x.category||'General')} ${tags(x.tags)}</div></div><button class="btn danger" onclick="delNote('${x.id}')">Delete</button></div>${x.html?`<div style="line-height:1.6">${x.html}</div>`:(x.body?`<p style="white-space:pre-wrap;line-height:1.5">${esc(x.body)}</p>`:'')}${pts.length?`<ul class="points">${pts.map(p=>`<li>• ${esc(p.replace(/^[-•*]\s*/,''))}</li>`).join('')}</ul>`:''}${imgs.map(im=>`<img loading="lazy" decoding="async" src="${esc(im)}" alt="note image">`).join('')}</article>`}).join('')}</div>${all.length>150?`<div class="meta" style="padding:10px">Showing 150 of ${all.length}. Search to narrow the list.</div>`:''}`:'<div class="meta" style="padding:22px;text-align:center">कोई note नहीं।</div>'}
function delNote(id){data.notes=data.notes.filter(x=>x.id!==id);deleteAttachmentSet('note',id);save();renderNotes()}
const defaultHabits=[['Meditation','🧘'],['Yoga','🧘‍♂️'],['Water','💧'],['Healthy Food','🥗'],['Sleep','😴'],['Exercise','🏃']];
function renderHabits(){let custom=[...new Set(data.habits.filter(h=>h.custom).map(h=>h.name))];document.getElementById('habits').innerHTML=`<div class="grid g3">${defaultHabits.map(([n,i])=>habitCard(n,i,false)).join('')}${custom.map(n=>habitCard(n,'⭐',true)).join('')}</div><div class="card" style="margin-top:16px"><h2>➕ Custom Habit + Time</h2><div class="form"><input id="hn" placeholder="Reading, Prayer, Study..."><input id="ht" type="time"><button class="btn primary full" onclick="addHabit()">Add Habit with Time</button></div></div>`}
function habitTimesFor(x){
  const count=Math.max(1,Math.min(99,Math.round(Number(x?.timesPerDay)||1)));
  let times=Array.isArray(x?.times)?x.times.map(v=>String(v||'').slice(0,5)):[];
  if(!times.length&&x?.time)times=[String(x.time).slice(0,5)];
  while(times.length<count)times.push('');
  return times.slice(0,count);
}
function habitCard(n,icon,custom){
  let x=data.habits.find(h=>h.date===today()&&h.name===n)||{done:false,time:'',timesPerDay:1,times:[]};
  let freq=Math.max(1,Math.min(99,Math.round(Number(x.timesPerDay)||1)));
  let times=habitTimesFor({...x,timesPerDay:freq});
  const encoded=encodeURIComponent(n);
  const timeRows=times.map((tm,i)=>`<div class="habit-time-row"><span class="habit-time-label">बार ${i+1} का समय</span><label class="habit-time"><input type="time" value="${esc(tm)}" onchange="setHabitOccurrenceTime('${encoded}',${i},this.value)" aria-label="${esc(n)} बार ${i+1} का समय"><span class="pill">⏰ Time</span></label></div>`).join('');
  return `<div class="card habit-card"><div class="between"><h2>${icon} ${esc(n)}</h2>${custom?`<button class="btn danger" onclick="deleteCustomHabit('${encoded}')">Delete</button>`:''}</div><div class="habit-controls"><label class="habit-frequency"><span>कितनी बार?</span><input type="number" min="1" max="99" step="1" value="${freq}" aria-label="${esc(n)} कितनी बार प्रति दिन" onchange="setHabitFrequency('${encoded}',this.value)"><span>बार / दिन</span></label></div><div class="habit-times">${timeRows}</div><label class="habit-complete"><input type="checkbox" ${x.done?'checked':''} onchange="setHabit('${encoded}',this.checked)" style="width:auto"> Today completed</label></div>`;
}
function ensureHabit(name){
  let x=data.habits.find(h=>h.date===today()&&h.name===name);
  if(!x){x={id:uid(),name,date:today(),done:false,time:'',timesPerDay:1,times:[''],custom:!defaultHabits.some(h=>h[0]===name)};data.habits.push(x)}
  x.timesPerDay=Math.max(1,Math.min(99,Math.round(Number(x.timesPerDay)||1)));
  x.times=habitTimesFor(x);
  x.time=x.times[0]||'';
  return x;
}
function setHabit(name,done){name=decodeURIComponent(name);let x=ensureHabit(name);x.done=done;save();renderHabits();if(document.getElementById('mentor')?.classList.contains('active'))renderMentor()}
function setHabitOccurrenceTime(name,index,time){name=decodeURIComponent(name);index=Math.max(0,Number(index)||0);let x=ensureHabit(name);if(index>=x.times.length)return;x.times[index]=time||'';x.time=x.times[0]||'';save();toast(`बार ${index+1} का समय saved`)}
function setHabitFrequency(name,value){name=decodeURIComponent(name);let count=Math.max(1,Math.min(99,Math.round(Number(value)||1)));let x=ensureHabit(name);x.timesPerDay=count;x.times=habitTimesFor(x);x.time=x.times[0]||'';save();renderHabits();if(document.getElementById('mentor')?.classList.contains('active'))renderMentor();toast('Habit frequency saved')}
function addHabit(){let n=document.getElementById('hn').value.trim(),time=document.getElementById('ht').value;if(!n)return toast('Habit name लिखें');if(data.habits.some(h=>h.custom&&h.name.toLowerCase()===n.toLowerCase()))return toast('यह habit पहले से है');data.habits.push({id:uid(),name:n,date:today(),done:false,time,timesPerDay:1,times:[time||''],custom:true});clearDrafts(['hn','ht']);save();renderHabits();toast('Custom habit added')}
function deleteCustomHabit(n){n=decodeURIComponent(n);data.habits=data.habits.filter(h=>!(h.custom&&h.name===n));save();renderHabits()}

function periodOk(date,p){let x=new Date(date+'T00:00:00'),n=new Date(),s=new Date(n.getFullYear(),n.getMonth(),n.getDate());if(p==='daily')return date===today();if(p==='weekly'){let z=new Date(s);z.setDate(z.getDate()-6);return x>=z&&x<=s}if(p==='monthly')return x.getMonth()===n.getMonth()&&x.getFullYear()===n.getFullYear();return x.getFullYear()===n.getFullYear()}
function periodButtons(){return ['daily','weekly','monthly','yearly'].map(p=>`<button class="${data.financePeriod===p?'active':''}" onclick="data.financePeriod='${p}';save();renderExpenses()">${p[0].toUpperCase()+p.slice(1)}</button>`).join('')}
function renderExpenses(){let p=data.financePeriod||'monthly',inc=data.income.filter(x=>periodOk(x.date,p)),out=data.expenses.filter(x=>periodOk(x.date,p)),ia=inc.reduce((s,x)=>s+Number(x.amount),0),ea=out.reduce((s,x)=>s+Number(x.amount),0);document.getElementById('expenses').innerHTML=`<div class="card"><div class="finance-head"><h2>💰 Expenses & Income</h2><div class="periods">${periodButtons()}</div></div><div class="grid" style="margin-top:15px"><div class="card"><div class="label">Income — ${p}</div><div class="money income">₹${ia.toFixed(2)}</div></div><div class="card"><div class="label">Expense — ${p}</div><div class="money expense">₹${ea.toFixed(2)}</div></div><div class="card"><div class="label">Balance — ${p}</div><div class="money">₹${(ia-ea).toFixed(2)}</div></div><div class="card"><div class="label">Transactions</div><div class="metric">${inc.length+out.length}</div></div></div></div><div class="two" style="margin-top:16px"><div class="card"><h2>➕ Add Income</h2><div class="formgrid"><select id="isSelect" onchange="syncFinanceManual('income')"><option value="">Select income source</option>${financeIncomeSources.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}<option value="__manual__">✍️ Manual entry</option></select><input id="is" placeholder="Manual income source (optional)" disabled><input id="ia" inputmode="decimal" placeholder="Amount (e.g. 1500+500)" oninput="previewFinanceAmount('ia','iap')"><div id="iap" class="meta"></div>${dateFieldMarkup('id',today(),'Income date')}<input id="inote" placeholder="Note"><button class="primary" onclick="addIncome()">Save Income</button></div></div><div class="card"><h2>➕ Add Expense</h2><div class="formgrid"><select id="esSelect" onchange="syncFinanceManual('expense')"><option value="">Select expense category</option>${financeExpenseCategories.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}<option value="__manual__">✍️ Manual entry</option></select><input id="es" placeholder="Manual expense category (optional)" disabled><input id="ea" inputmode="decimal" placeholder="Amount (e.g. 1200+300)" oninput="previewFinanceAmount('ea','eap')"><div id="eap" class="meta"></div>${dateFieldMarkup('ed',today(),'Expense date')}<input id="en" placeholder="Note"><button class="primary" onclick="addExpense()">Save Expense</button></div></div></div><div class="card" style="margin-top:16px"><h2>🧮 Built-in Calculator</h2><div class="formgrid"><input id="finCalc" inputmode="decimal" placeholder="Example: 1500 + 250 - 100 × 2" oninput="calculateFinanceExpression()"><div id="finCalcResult" class="money">₹0.00</div><div class="meta">Amount fields also support +, -, ×, ÷ and brackets. Example: 1000+500-200.</div></div></div><div class="card" style="margin-top:16px"><h2>📋 ${p[0].toUpperCase()+p.slice(1)} Transactions</h2><div id="finList"></div></div>`;let all=[...inc.map(x=>({...x,type:'income'})),...out.map(x=>({...x,type:'expense'}))].sort((a,b)=>b.date.localeCompare(a.date)),visible=all.slice(0,250);document.getElementById('finList').innerHTML=visible.length?`<div class="list">${visible.map(x=>`<div class="item"><div class="between"><div><b class="${x.type==='income'?'income':'expense'}">${x.type==='income'?'+':'-'} ₹${Number(x.amount).toFixed(2)}</b> · ${esc(x.source)}<div class="meta">${x.date} · ${esc(x.note||'')}</div></div><button class="danger" onclick="delFinance('${x.type}','${x.id}')">Delete</button></div></div>`).join('')}</div>${all.length>250?`<div class="meta" style="padding:10px">Showing latest 250 of ${all.length} transactions. Narrow the period for older entries.</div>`:''}`:'<div class="empty">इस period में कोई transaction नहीं।</div>'}
const financeIncomeSources=['Salary','Freelance','Business','Investment','Bonus','Interest','Rental Income','Other Income'];
const financeExpenseCategories=['Food','Groceries','Rent','Utilities','Transport','Fuel','Shopping','Health','Education','Entertainment','Bills','Travel','EMI / Loan','Subscriptions','Other Expense'];
function syncFinanceManual(type){const select=document.getElementById(type==='income'?'isSelect':'esSelect'),input=document.getElementById(type==='income'?'is':'es');if(!select||!input)return;const manual=select.value==='__manual__';input.disabled=!manual;input.required=manual;if(!manual)input.value='';if(manual)input.focus()}
function financeLabel(type){const select=document.getElementById(type==='income'?'isSelect':'esSelect'),input=document.getElementById(type==='income'?'is':'es');if(input&&input.value.trim())return input.value.trim();if(select&&select.value&&select.value!=='__manual__')return select.value;return ''}
function safeFinanceCalc(expr){expr=String(expr||'').trim().replace(/,/g,'').replace(/[×x]/gi,'*').replace(/÷/g,'/').replace(/−/g,'-');if(!expr)return 0;if(!/^[0-9+\-*/().%\s]+$/.test(expr))return NaN;try{const n=Function('"use strict";return ('+expr+')')();return Number.isFinite(n)?Number(n):NaN}catch(e){return NaN}}
function previewFinanceAmount(inputId,outId){const v=document.getElementById(inputId).value,n=safeFinanceCalc(v),el=document.getElementById(outId);el.textContent=Number.isFinite(n)&&v.trim()?('Calculated: ₹'+n.toFixed(2)):'Enter a valid calculation';el.style.color=Number.isFinite(n)&&v.trim()?'':'var(--red)'}
function calculateFinanceExpression(){const v=document.getElementById('finCalc').value,n=safeFinanceCalc(v),el=document.getElementById('finCalcResult');el.textContent=Number.isFinite(n)?'₹'+n.toFixed(2):'Invalid calculation';el.style.color=Number.isFinite(n)?'':'var(--red)'}
function addIncome(){let s=financeLabel('income'),raw=document.getElementById('ia').value,a=safeFinanceCalc(raw);if(!s||!Number.isFinite(a)||a<=0)return;data.income.unshift({id:uid(),source:s,amount:a,date:document.getElementById('id').value,note:document.getElementById('inote').value});clearDrafts(['is','isSelect','ia','id','inote']);save();renderExpenses()}
function addExpense(){let s=financeLabel('expense'),raw=document.getElementById('ea').value,a=safeFinanceCalc(raw);if(!s||!Number.isFinite(a)||a<=0)return;data.expenses.unshift({id:uid(),source:s,amount:a,date:document.getElementById('ed').value,note:document.getElementById('en').value});clearDrafts(['es','esSelect','ea','ed','en']);save();renderExpenses()}
function delFinance(type,id){if(type==='income')data.income=data.income.filter(x=>x.id!==id);else data.expenses=data.expenses.filter(x=>x.id!==id);save();renderExpenses()}

function toast(m){let t=document.getElementById('toast');if(!t)return;t.textContent=m;t.style.display='block';clearTimeout(window.__toastTimer);window.__toastTimer=setTimeout(()=>t.style.display='none',1800)}
function applyTheme(){
  const mode=(data.settings&&data.settings.mode==='dark')?'dark':'light';
  const dark=mode==='dark';
  const t=dark?['#a78bfa','#c4b5fd']:['#6750e8','#8b5cf6'];
  const vars=dark?{
    '--bg':'#0b0e16','--surface':'#151a24','--surface2':'#1b2230','--text':'#f3f4f6','--muted':'#a8afbd','--line':'#343a49',
    '--sidebar':'#070a10','--shadow':'0 10px 28px rgba(0,0,0,.28)','--green':'#4ade80','--red':'#f87171',
    '--ultra-ink':'#f3f4f6','--ultra-muted':'#a8afbd','--ultra-line':'#303747','--ultra-soft':'#111722'
  }:{
    '--bg':'#f7f8fa','--surface':'#ffffff','--surface2':'#f8f9fb','--text':'#202124','--muted':'#70757a','--line':'#e0e3e7',
    '--sidebar':'#121822','--shadow':'0 3px 14px rgba(22,31,45,.06)','--green':'#16834b','--red':'#c23a3a',
    '--ultra-ink':'#111827','--ultra-muted':'#6b7280','--ultra-line':'#e7eaf0','--ultra-soft':'#f7f8fb'
  };
  document.documentElement.style.setProperty('--accent',t[0]);
  document.documentElement.style.setProperty('--accent2',t[1]);
  Object.entries(vars).forEach(([k,v])=>document.documentElement.style.setProperty(k,v));
  document.documentElement.dataset.lifeosMode=mode;
  document.documentElement.style.colorScheme=mode;
  const meta=document.querySelector('meta[name="theme-color"]');
  if(meta)meta.setAttribute('content',dark?'#0b0e16':'#f7f8fa');
  updateAppearanceButton();
}
function toggleAppearance(){data.settings.mode=(data.settings.mode==='dark'?'light':'dark');save();applyTheme();render();toast(data.settings.mode==='dark'?'🌙 Dark mode enabled':'☀️ Light mode enabled')}
function updateAppearanceButton(){const dark=document.documentElement.dataset.lifeosMode==='dark';['themeToggle','sidebarThemeToggle'].forEach(id=>{const b=document.getElementById(id);if(!b)return;b.textContent=dark?'☀️':'🌙';b.title=dark?'Switch to light mode':'Switch to dark mode';b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',dark?'true':'false')});document.querySelectorAll('#mobileBottomNav .bottom-theme').forEach(b=>{b.title=dark?'Switch to light mode':'Switch to dark mode';b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',dark?'true':'false')})}
applyTheme();
bindDraftAutosave();
compactLifeOSData();
data.income=Array.isArray(data.income)?data.income:[];
// Finance source/category dropdowns are built-in presets; Manual entry remains available.

data.routines=Array.isArray(data.routines)?data.routines:[];
data.habits=Array.isArray(data.habits)?data.habits:[];
data.notes=Array.isArray(data.notes)?data.notes:[];
data.tasks=Array.isArray(data.tasks)?data.tasks:[];
data.expenses=Array.isArray(data.expenses)?data.expenses:[];
const __defaultHabitNames=['Meditation','Yoga','Water','Healthy Food','Sleep','Exercise'];
data.habits.forEach(h=>{if(h.custom===undefined)h.custom=!__defaultHabitNames.includes(h.name)});
// Startup optimization: don't synchronously stringify/write the whole app before first paint.
// Device storage reconciliation below handles persistence; local fallback is deferred.
if(!NATIVE_RUNTIME)scheduleLocalPersist(1800);
bootDeviceStorage();
// Attachments can be large (base64 images/files). Move this work off the critical startup path.
const __persistAttachmentsIdle=()=>persistAttachmentsToIDB(data).catch(()=>{});
const __hydrateAttachmentsIdle=()=>hydrateAttachmentsFromIDB(data).then(()=>{
  const active=document.querySelector('.section.active')?.id;
  if(active==='notes')renderNoteList();
  if(active==='journal')renderJournal();
}).catch(()=>{});
if(!NATIVE_RUNTIME){
  if('requestIdleCallback' in window){
    requestIdleCallback(__persistAttachmentsIdle,{timeout:3000});
    requestIdleCallback(__hydrateAttachmentsIdle,{timeout:5000});
  }else{
    setTimeout(__persistAttachmentsIdle,1200);
    setTimeout(__hydrateAttachmentsIdle,1800);
  }
}
// Attachment metadata stays in the main record; binary content is durable in IndexedDB and hydrated lazily.

let journalFiles=[];
function journalCmd(cmd){const e=document.getElementById('jbody');if(e){e.focus();try{document.execCommand(cmd,false,null)}catch(_){}}}
function journalFontSize(v){const e=document.getElementById('jbody');if(e&&v){e.focus();try{document.execCommand('fontSize',false,v)}catch(_){}}}
function journalColor(v){const e=document.getElementById('jbody');if(e&&v){e.focus();try{document.execCommand('foreColor',false,v)}catch(_){}}}
function setJournalThemeColor(c){journalThemeColor=c||'#fff8c5';const e=document.getElementById('journalEditor');if(e)e.style.background=journalThemeColor;const p=document.getElementById('jcustom');if(p)p.value=journalThemeColor}
async function previewJournalFiles(inp){journalFiles=[];const p=document.getElementById('jfilesPreview');if(!p)return;p.innerHTML='';for(const f of [...inp.files].slice(0,8)){if(f.size>5*1024*1024){toast('File 5 MB से बड़ी है: '+f.name);continue}let encoded=null;if(f.type.startsWith('image/'))encoded=await compressImage(f);else encoded=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(f)});if(!encoded){toast('File process नहीं हुआ: '+f.name);continue}journalFiles.push({name:f.name,type:f.type,data:encoded});const chip=document.createElement('span');chip.className='attachment-chip';chip.textContent=f.name;p.appendChild(chip)}}
async function addJournal(){
  const body=document.getElementById('jbody'),
    title=document.getElementById('jtitle').value.trim()||'Daily Journal',
    plain=(body?.innerText||'').trim(),
    content=sanitizeRichHtml(body?.innerHTML.trim()||'');
  if(!plain&&!journalFiles.length)return toast('Journal में कुछ लिखें या photo/file जोड़ें');
  const entry={
    id:uid(),
    date:document.getElementById('jdate').value||today(),
    title,
    html:content,
    text:plain,
    color:document.getElementById('jcustom')?.value||journalThemeColor,
    files:journalFiles.slice(),
    updatedAt:Date.now()
  };
  data.journal.unshift(entry);
  const stored=await persistAttachmentItemToIDB('journal',entry);
  if(entry.files.length&&!stored){
    data.journal=data.journal.filter(x=>x.id!==entry.id);
    return toast('⚠️ File storage failed. Journal save रोक दिया गया — retry करें.');
  }
  journalFiles=[];
  save();
  renderJournal();
  toast('Journal saved');
}
async function deleteJournal(id){if(!confirm('इस journal entry को delete करें?'))return;data.journal=(data.journal||[]).filter(x=>x.id!==id);save();try{await deleteAttachmentSet('journal',id)}catch(e){console.warn(e)}renderJournal();toast('Journal deleted ✓')}
function renderJournal(){journalThemeColor='#fff8c5';document.getElementById('journal').innerHTML=`<div class="two"><div class="card" id="journalEditor"><h2>📔 Detailed Daily Journal</h2><p class="muted">आज की पूरी घटना, विचार, सीख और memories यहाँ विस्तार से लिखें.</p><div class="form"><input id="jtitle" placeholder="Journal title">${dateFieldMarkup('jdate',today(),'Journal date')}<div class="full color-line"><span class="label">Note Theme</span><input id="jcustom" class="color-input" type="color" value="#fff8c5" onchange="setJournalThemeColor(this.value)"><span class="label">Any color</span></div><div class="full"><div class="theme-grid"><button class="swatch" style="background:#fff8c5" onclick="setJournalThemeColor('#fff8c5')"></button><button class="swatch" style="background:#f0edff" onclick="setJournalThemeColor('#f0edff')"></button><button class="swatch" style="background:#e9f8ef" onclick="setJournalThemeColor('#e9f8ef')"></button><button class="swatch" style="background:#eaf3ff" onclick="setJournalThemeColor('#eaf3ff')"></button><button class="swatch" style="background:#ffeef0" onclick="setJournalThemeColor('#ffeef0')"></button><button class="swatch" style="background:#fff" onclick="setJournalThemeColor('#fff')"></button></div></div><div class="full"><div class="rich-toolbar"><button type="button" onclick="journalCmd('bold')"><b>B</b></button><button type="button" onclick="journalCmd('italic')"><i>I</i></button><button type="button" onclick="journalCmd('underline')"><u>U</u></button><button type="button" onclick="journalCmd('insertUnorderedList')">• List</button><select onchange="journalFontSize(this.value);this.selectedIndex=0"><option>Size</option><option value="2">Small</option><option value="3">Normal</option><option value="5">Large</option><option value="7">Huge</option></select><input type="color" value="#202124" onchange="journalColor(this.value)" title="Font color"></div><div id="jbody" class="rich-editor" contenteditable="true"></div></div><div class="full"><b>📎 Photo / File</b><input type="file" id="jfiles" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" onchange="previewJournalFiles(this)"><div id="jfilesPreview" class="attachment-list"></div></div><button class="primary full" onclick="addJournal()">Save Journal</button></div></div><div class="card"><h2>📚 Journal Entries</h2><p class="muted">Daily memories, notes और attachments.</p></div></div><div class="card" style="margin-top:16px"><div class="grid g3">${(data.journal||[]).slice(0,150).map(x=>`<article class="note-card" style="background:${/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#fff8c5'}"><div class="between"><div><b>${esc(x.title)}</b><div class="meta">${esc(x.date||'')}</div></div><button class="danger" onclick="deleteJournal('${x.id}')">Delete</button></div><div style="line-height:1.6;margin-top:10px">${x.html||esc(x.text||'')}</div>${(x.files||[]).map(f=>f.type?.startsWith('image/')?`<img loading="lazy" decoding="async" src="${esc(f.data)}" alt="${esc(f.name)}">`:`<div class="attachment-chip">📎 ${esc(f.name)}</div>`).join('')}</article>`).join('')||'<div class="muted">अभी कोई journal entry नहीं।</div>'}</div></div>`}

function renderGoals(){
 const goals=data.goals||[];const done=goals.filter(g=>Number(g.progress)>=100).length;
 document.getElementById('goals').innerHTML=`<div class="module-hero"><div><div class="eyebrow" style="color:#d8ccff">GOALS</div><h2 style="color:#fff;font-size:25px;margin:6px 0">Turn plans into measurable progress</h2><div class="muted">${done} of ${goals.length} goals completed</div></div><div class="big">${goals.length?Math.round(goals.reduce((a,g)=>a+Number(g.progress||0),0)/goals.length):0}%</div></div>
 <div class="two"><div class="card"><h2>➕ Add Goal</h2><div class="formgrid"><input id="goalTitle" placeholder="Goal title">${dateFieldMarkup('goalTarget','','Target date')}<input id="goalProgress" type="number" min="0" max="100" value="0" placeholder="Progress %"><input id="goalCategory" placeholder="Category"><textarea id="goalNote" class="full" placeholder="Why this goal matters / next milestone"></textarea><button class="primary full" onclick="addGoal()">Add Goal</button></div></div><div class="card"><h2>🎯 Goal system</h2><p class="muted">Set a clear outcome, track progress, and keep the next milestone visible.</p><div class="kpi"><div class="mini"><b>${goals.length}</b><br><span class="meta">Total</span></div><div class="mini"><b>${done}</b><br><span class="meta">Completed</span></div><div class="mini"><b>${goals.filter(g=>Number(g.progress)>0&&Number(g.progress)<100).length}</b><br><span class="meta">In progress</span></div></div></div></div>
 <div class="card" style="margin-top:16px"><div class="list">${goals.length?goals.map(g=>`<article class="item goal-card ${Number(g.progress)>=100?'goal-completed':''}"><div class="between"><div><div class="title">${esc(g.title)}</div><div class="meta">${esc(g.category||'General')} ${g.targetDate?'· Target '+esc(g.targetDate):''}</div></div><div class="goal-actions"><button class="secondary" type="button" onclick="toggleGoalDone('${g.id}')">${Number(g.progress)>=100?'↩ Undo':'✓ Done'}</button><button class="danger" type="button" onclick="deleteGoal('${g.id}')">🗑 Delete</button></div></div><p class="muted" style="margin:0">${esc(g.note||'')}</p><div class="goal-progress"><div class="progress"><i style="width:${Math.max(0,Math.min(100,Number(g.progress)||0))}%"></i></div><b>${Math.round(Number(g.progress)||0)}%</b></div></article>`).join(''):'<div class="empty">अभी कोई goal नहीं।</div>'}</div></div>`;
}
function addGoal(){const title=document.getElementById('goalTitle').value.trim();if(!title)return toast('Goal title लिखें');data.goals.unshift({id:uid(),title,progress:Number(document.getElementById('goalProgress').value||0),targetDate:document.getElementById('goalTarget').value,category:document.getElementById('goalCategory').value.trim(),note:document.getElementById('goalNote').value.trim(),createdAt:Date.now()});save();renderGoals();toast('Goal added')}

function toggleGoalDone(id){const g=(data.goals||[]).find(x=>x.id===id);if(!g)return;g.progress=Number(g.progress)>=100?0:100;save();renderGoals();toast(Number(g.progress)>=100?'Goal completed ✓':'Goal reopened ↩')}
function deleteGoal(id){if(!confirm('इस goal को delete करें?'))return;data.goals=data.goals.filter(x=>x.id!==id);save();renderGoals();toast('Goal deleted ✓')}

function drawFinanceDashboardChart(){const el=document.getElementById('financeDashboardChart');if(!el)return;const now=new Date(),m=[];for(let k=5;k>=0;k--){const d=new Date(now.getFullYear(),now.getMonth()-k,1);m.push({key:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0'),label:d.toLocaleDateString('en',{month:'short'}),income:0,expense:0})}for(const x of(data.income||[])){const q=m.find(a=>a.key===String(x.date||'').slice(0,7));if(q)q.income+=Number(x.amount||0)}for(const x of(data.expenses||[])){const q=m.find(a=>a.key===String(x.date||'').slice(0,7));if(q)q.expense+=Number(x.amount||0)}const max=Math.max(1,...m.flatMap(x=>[x.income,x.expense]));el.innerHTML=m.map(x=>`<div style="margin:8px 0"><div class="between"><span>${x.label}</span><span>₹${x.income.toFixed(0)} / ₹${x.expense.toFixed(0)}</span></div><div style="height:8px;background:linear-gradient(90deg,var(--green) ${x.income/max*100}%,transparent ${x.income/max*100}%);border-radius:99px"></div><div style="height:8px;background:linear-gradient(90deg,var(--red) ${x.expense/max*100}%,transparent ${x.expense/max*100}%);border-radius:99px;margin-top:3px"></div></div>`).join('')+'<div class="meta">Income / Expense · last 6 months</div>'}
let focusTimer=null,focusRemaining=25*60,focusMode=25,focusModeSeconds=25*60;
function renderFocus(){const mins=Math.floor(focusRemaining/60),secs=focusRemaining%60;const totalSeconds=data.focusSessions.reduce((a,x)=>a+Number(x.seconds||Number(x.minutes||0)*60),0);const total=Math.floor(totalSeconds/60);document.getElementById('focus').innerHTML=`<div class="card focus-shell"><div class="eyebrow">FOCUS MODE</div><h2>Deep work, one session at a time</h2><div class="focus-clock">${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}</div><div class="focus-presets">${[25,50,90].map(m=>`<button class="secondary ${focusModeSeconds===m*60?'active':''}" onclick="setFocus(${m})">${m} min</button>`).join('')}</div><div class="focus-custom" style="margin:16px auto 0;max-width:420px"><div class="row" style="justify-content:center;gap:8px"><label style="display:flex;flex-direction:column;gap:5px;text-align:left;font-size:12px"><span>Minutes</span><input id="focusMinutes" type="number" min="0" max="180" step="1" value="${Math.floor(focusModeSeconds/60)}" style="width:110px"></label><label style="display:flex;flex-direction:column;gap:5px;text-align:left;font-size:12px"><span>Seconds</span><input id="focusSeconds" type="number" min="0" max="59" step="1" value="${focusModeSeconds%60}" style="width:110px"></label><button class="secondary" onclick="applyFocusCustom()" style="margin-top:18px">Set Time</button></div><div class="meta" style="margin-top:7px">Apna exact focus time set kar sakte ho — minutes + seconds.</div></div><div class="row" style="justify-content:center;margin-top:15px"><button class="primary" onclick="toggleFocus()">${focusTimer?'Pause':'Start Focus'}</button><button class="secondary" onclick="resetFocus()">Reset</button></div><div class="focus-stats"><div class="focus-stat"><b>${total}</b><br><span class="meta">Minutes focused</span></div><div class="focus-stat"><b>${data.focusSessions.length}</b><br><span class="meta">Sessions</span></div><div class="focus-stat"><b>${data.focusSessions.filter(x=>x.date===today()).length}</b><br><span class="meta">Today</span></div></div></div><div class="card" style="margin-top:16px"><h2>Recent Focus Sessions</h2><div class="list">${data.focusSessions.slice(-10).reverse().map(x=>{const ss=Number(x.seconds||Number(x.minutes||0)*60);const mm=Math.floor(ss/60),rs=ss%60;return `<div class="item"><b>${mm} min ${String(rs).padStart(2,'0')} sec</b><div class="meta">${esc(x.date||'')} · ${esc(x.label||'Focus session')}</div></div>`}).join('')||'<div class="empty">अभी कोई session नहीं।</div>'}</div></div>`}
function setFocus(m){if(focusTimer)return;focusMode=m;focusModeSeconds=m*60;focusRemaining=focusModeSeconds;renderFocus()}
function applyFocusCustom(){if(focusTimer)return;const m=Math.max(0,Math.min(180,Number(document.getElementById('focusMinutes')?.value)||0));const s=Math.max(0,Math.min(59,Number(document.getElementById('focusSeconds')?.value)||0));const total=m*60+s;if(total<1){toast('⏱️ Kam se kam 1 second set karo');return}focusModeSeconds=total;focusMode=Math.floor(total/60);focusRemaining=total;renderFocus()}
function toggleFocus(){
  if(focusTimer){clearInterval(focusTimer);focusTimer=null;renderFocus();return}
  if(focusRemaining<1)focusRemaining=focusModeSeconds;
  let endAt=Date.now()+focusRemaining*1000;
  const tick=()=>{
    focusRemaining=Math.max(0,Math.ceil((endAt-Date.now())/1000));
    const clock=document.querySelector('#focus .focus-clock');
    if(clock){const mins=Math.floor(focusRemaining/60),secs=focusRemaining%60;clock.textContent=String(mins).padStart(2,'0')+':'+String(secs).padStart(2,'0');}
    if(focusRemaining<=0){
      clearInterval(focusTimer);focusTimer=null;
      const sessionSeconds=focusModeSeconds;
      data.focusSessions.push({id:uid(),minutes:Math.floor(sessionSeconds/60),seconds:sessionSeconds,date:today(),label:'Focus session'});
      save();toast('🎯 Focus session complete');focusRemaining=focusModeSeconds;renderFocus();
    }
  };
  focusTimer=setInterval(tick,1000);
  renderFocus();
}
function resetFocus(){if(focusTimer){clearInterval(focusTimer);focusTimer=null}focusRemaining=focusModeSeconds;renderFocus()}

function mentorQuoteForDate(date){
 const qs=data.mentorQuotes||[]; if(!qs.length)return null;
 let n=0; for(const c of String(date||today())) for(let i=0;i<c.length;i++) n=(n+c.charCodeAt(i))%qs.length;
 return qs[n];
}
function mentorHabitMetrics(date){
 const names={exercise:'Exercise',yoga:'Yoga',meditation:'Meditation',sleep:'Sleep'};
 const out={};
 Object.entries(names).forEach(([key,name])=>{
  const h=(data.habits||[]).find(x=>x.date===date&&String(x.name||'').toLowerCase()===name.toLowerCase());
  const freq=Math.max(1,Number(h?.timesPerDay)||1);
  out[key]=h?.done?freq:0;
 });
 return out;
}
function mentorUseToday(){data.mentorSelectedDate=today();save();renderMentor();toast('KPI date set to today ✓')}
function mentorToday(){
 const d=data.mentorSelectedDate||today();
 const base={applications:0,outreach:0,followups:0,contacts:0,portfolio:0,earned:0,exercise:0,yoga:0,meditation:0,learning:0,family:0,sleep:0,notes:'',...(data.mentorKpis[d]||{})};
 return {...base,...mentorHabitMetrics(d)};
}
function toggleMentorBalanceMode(){
 const mode=document.getElementById('mBalanceMode')?.value||'auto';
 const wrap=document.getElementById('mManualBalanceWrap');
 if(wrap)wrap.style.display=mode==='manual'?'block':'none';
}
function mentorSave(){
 const date=data.mentorSelectedDate||today(), k=mentorToday();
 ['mkApplications','mkOutreach','mkFollowups','mkContacts','mkPortfolio','mkEarned','mkLearning','mkFamily'].forEach(id=>{
  const el=document.getElementById(id); if(el)k[id.slice(2).toLowerCase()]=Math.max(0,Number(el.value)||0);
 });
 Object.assign(k,mentorHabitMetrics(date));
 k.notes=document.getElementById('mkNotes')?.value||'';
 data.mentorKpis[date]=k;
 [['mCapital','startingCapital',300000],['mStartDate','startDate',date],['mBurn','monthlyBurn',60000],['mDailyBurn','dailyBurn',2000],['mSurvival','survivalReserve',180000],['mEmergency','emergencyReserve',60000],['mCareer','careerFund',30000],['mOpportunity','opportunityFund',30000],['mManualBalance','manualBalance',0]]
 .forEach(([id,key,def])=>{const el=document.getElementById(id);if(el){const raw=el.value;data.mentor[key]=key==='startDate'?(raw||date):Math.max(0,raw===''?def:Number(raw));}});
 data.mentor.balanceMode=document.getElementById('mBalanceMode')?.value==='manual'?'manual':'auto';
 data.mentor.missions=Array.from({length:5},(_,n)=>{
  const i=n+1, get=id=>document.getElementById(id);
  return {month:i,mission:get(`mmMission${i}`)?.value?.trim()||`Month ${i}`,target:get(`mmTarget${i}`)?.value?.trim()||'',action:get(`mmAction${i}`)?.value?.trim()||'',status:get(`mmStatus${i}`)?.value||'Pending',note:get(`mmNote${i}`)?.value?.trim()||''};
 });
 save();renderMentor();renderDashboard();toast('Mentor tracking saved ✓');
}
function addMentorQuote(){
 const text=document.getElementById('mqText')?.value?.trim(); if(!text)return toast('Quote / Principle लिखें');
 const author=(document.getElementById('mqAuthor')?.value||'Mentor').trim()||'Mentor';
 const category=(document.getElementById('mqCategory')?.value||'Motivation').trim()||'Motivation';
 data.mentorQuotes.push({id:uid(),text,author,category,createdAt:Date.now()}); save(); renderMentor(); renderDashboard(); toast('Quote / Principle added ✓');
}
function deleteMentorQuote(id){
 if(!confirm('इस Quote / Principle को delete करें?'))return;
 data.mentorQuotes=data.mentorQuotes.filter(q=>q.id!==id);
 if(!data.mentorQuotes.length)data.mentorQuotes.push({id:uid(),text:'आज अपना Quote / Principle जोड़ें और उसे action बनाइए।',author:'Mentor',category:'Motivation'});
 save();renderMentor();renderDashboard();toast('Quotation deleted');
}

function mentorSaveRules(){
 const rows=[...document.querySelectorAll('.mentor-rule-input')];
 const next=[];
 rows.forEach(el=>{
  const id=el.dataset.ruleId||uid(), text=(el.value||'').trim();
  if(text)next.push({id,text});
 });
 data.mentorRules=next.length?next:DEFAULT_MENTOR_RULES.map((text,i)=>({id:'mr'+(i+1),text}));
 save();renderMentor();toast('Mentor Rules updated ✓');
}
function addMentorRule(){
 const current=data.mentorRules||[];
 current.push({id:uid(),text:''});
 data.mentorRules=current;save();renderMentor();
 setTimeout(()=>document.querySelector('.mentor-rule-input:last-of-type')?.focus(),0);
}
function deleteMentorRule(id){
 if(!confirm('इस Mentor Rule को delete करें?'))return;
 data.mentorRules=(data.mentorRules||[]).filter(x=>x.id!==id);
 if(!data.mentorRules.length)data.mentorRules=DEFAULT_MENTOR_RULES.map((text,i)=>({id:'mr'+(i+1),text}));
 save();renderMentor();toast('Mentor Rule deleted');
}
function resetMentorRules(){
 if(!confirm('Mentor Rules को default rules पर वापस लाएँ?'))return;
 data.mentorRules=DEFAULT_MENTOR_RULES.map((text,i)=>({id:'mr'+(i+1),text}));
 save();renderMentor();toast('Mentor Rules reset ✓');
}
function mentorFinance(){
 const m=data.mentor,start=m.startDate||today(),cap=Math.max(0,Number(m.startingCapital||0));
 const cacheKey=String(start)+'|'+String(data.__updatedAt||0);
 const cached=window.__mentorFinanceCache;
 if(cached?.key===cacheKey)return cached.value;
 const nativeSummary=(NATIVE_RUNTIME&&window.__nativeFinanceSummary&&window.__nativeFinanceSummary.fromDate===start)?window.__nativeFinanceSummary:null;
 const income=nativeSummary?Number(nativeSummary.income||0):(data.income||[]).reduce((a,x)=>a+(String(x.date||'')>=start?Number(x.amount||0):0),0);
 const expense=nativeSummary?Number(nativeSummary.expense||0):(data.expenses||[]).reduce((a,x)=>a+(String(x.date||'')>=start?Number(x.amount||0):0),0);
 const autoBalance=cap+income-expense;
 const balance=m.balanceMode==='manual'?Math.max(0,Number(m.manualBalance||0)):autoBalance;
 const plannedAllocation=Math.max(0,Number(m.survivalReserve||0))+Math.max(0,Number(m.emergencyReserve||0))+Math.max(0,Number(m.careerFund||0))+Math.max(0,Number(m.opportunityFund||0));
 const unallocated=cap-plannedAllocation;
 const dailyBurn=Math.max(0,Number(m.dailyBurn||0));
 const runway=dailyBurn?balance/dailyBurn:0;
 const value={income,expense,balance,runway,cap,plannedAllocation,unallocated,dailyBurn,monthlyBurn:Math.max(0,Number(m.monthlyBurn||0))};
 window.__mentorFinanceCache={key:cacheKey,value};
 return value;
}
function mentorDaySnapshot(date){
 const cacheKey=String(date)+'|'+String(data.__updatedAt||0);
 const cached=window.__mentorDayCache;
 if(cached?.key===cacheKey)return cached.value;
 const out={tasksDone:0,tasksTotal:0,income:0,expense:0};
 for(const x of(data.tasks||[])){if(String(x.date||'')===date){out.tasksTotal++;if(x.done)out.tasksDone++;}}
 for(const x of(data.income||[])){if(String(x.date||'')===date)out.income+=Number(x.amount||0);}
 for(const x of(data.expenses||[])){if(String(x.date||'')===date)out.expense+=Number(x.amount||0);}
 window.__mentorDayCache={key:cacheKey,value:out};
 return out;
}
function mentorStatus(fin,k){if(fin.runway<30)return ['bad','RED — income action required'];if(fin.runway<60||k.outreach<5)return ['warn','YELLOW — pipeline बढ़ाओ'];return ['good','GREEN — continue & protect runway'];}
function resizeMentorRuleInput(el){
  if(!el)return;
  el.style.height='auto';
  const h=Math.min(160,Math.max(56,Number(el.scrollHeight||56)+2));
  el.style.height=h+'px';
}
function resizeMentorRules(root=document){root.querySelectorAll?.('.mentor-rule-input').forEach(resizeMentorRuleInput)}
function mentorRuleAutosizeHandler(e){if(e.target?.matches?.('.mentor-rule-input'))resizeMentorRuleInput(e.target)}
if(!window.__mentorRuleAutosizeBound){document.addEventListener('input',mentorRuleAutosizeHandler,{passive:true});window.__mentorRuleAutosizeBound=true}
function renderMentor(){
 const el=document.getElementById('mentor');if(!el)return;
 const date=data.mentorSelectedDate||today(),k=mentorToday(),m=data.mentor,f=mentorFinance(),q=mentorQuoteForDate(date),st=mentorStatus(f,k),missions=Array.isArray(m.missions)?m.missions:[],day=mentorDaySnapshot(date);
 const tdTotal=day.tasksTotal, tdDone=day.tasksDone, inc=day.income, ex=day.expense;
 el.innerHTML=`
 <div class="hero"><b>🧭 Mentor Mode — EARN + BUILD + HEAL + DISCIPLINE</b><div class="muted">Friendly support, strict accountability — रोज़ measurable action.</div></div>
 <div class="card mentor-date-card"><div class="section-title"><h2>📅 Mentor Date</h2><span class="tag">AD ${esc(date)} · BS ${esc(formatBsShort(date))}</span></div>${dateFieldMarkup('mentorSelectedDate',date,'Mentor date')}<div class="kpi three-kpi mentor-date-kpis" style="margin-top:12px"><div class="mini"><b>${tdDone}/${tdTotal}</b><br><span class="meta">Tasks</span></div><div class="mini"><b>₹${inc.toFixed(0)}</b><br><span class="meta">Income</span></div><div class="mini"><b>₹${ex.toFixed(0)}</b><br><span class="meta">Expense</span></div></div></div>
 <div class="card mentor-quote-card"><div class="quote-head mentor-quote-head"><div class="quote-title"><div class="row"><span class="tag">${esc(q?.category||'Motivation')}</span></div><div class="meta quote-date">AD ${esc(date)} · BS ${esc(formatBsShort(date))}</div></div><span class="tag">Positive + Practical</span></div><div class="mentor-quote-text">“${esc(q?.text||'आज अपना Quote / Principle जोड़ें और उसे action बनाइए।')}”</div><div class="mentor-quote-author">— ${esc(q?.author||'Mentor')}</div>
 <div class="mentor-quote-form"><input id="mqText" placeholder="नया Quote / Principle लिखें"><input id="mqAuthor" placeholder="Author / Source"><input id="mqCategory" placeholder="Category: Discipline, Finance, Health..."><button class="primary" type="button" onclick="addMentorQuote()">＋ Add Quote / Principle</button></div></div>
 <div class="mentor-grid">
  <div class="card"><h2>💰 Capital Tracker</h2><p class="muted">₹${Number(m.startingCapital||0).toLocaleString("en-IN")} को consume नहीं—time, skill और income में convert करना है.</p>
   <div class="formgrid">
    <label>Starting Capital <input id="mCapital" type="number" min="0" step="1000" value="${Number(m.startingCapital||300000)}"></label>
    <label>Current Balance Mode <select id="mBalanceMode" onchange="toggleMentorBalanceMode()"><option value="auto" ${m.balanceMode!=='manual'?'selected':''}>Auto (Income − Expenses)</option><option value="manual" ${m.balanceMode==='manual'?'selected':''}>Manual</option></select></label>
    <label id="mManualBalanceWrap" style="display:${m.balanceMode==='manual'?'block':'none'}">Manual Current Balance <input id="mManualBalance" type="number" min="0" step="1000" value="${Number(m.manualBalance||0)}" placeholder="e.g. 46739"></label>
    <div class="full mentor-plan-date"><div class="label">Plan Start Date</div>${dateFieldMarkup('mStartDate',m.startDate||date,'Plan start date')}</div>
    <label>Monthly Essential Burn <input id="mBurn" type="number" min="0" step="1000" value="${Number(m.monthlyBurn||60000)}"></label>
    <label>Daily Burn <input id="mDailyBurn" type="number" min="0" step="100" value="${Number(m.dailyBurn||2000)}"></label>
    <label>Survival Reserve <input id="mSurvival" type="number" min="0" step="1000" value="${Number(m.survivalReserve||180000)}"></label>
    <label>Emergency Reserve <input id="mEmergency" type="number" min="0" step="1000" value="${Number(m.emergencyReserve||60000)}"></label>
    <label>Career / Income Fund <input id="mCareer" type="number" min="0" step="1000" value="${Number(m.careerFund||30000)}"></label>
    <label>Opportunity Fund <input id="mOpportunity" type="number" min="0" step="1000" value="${Number(m.opportunityFund||30000)}"></label>
   </div>
   <button class="primary" type="button" onclick="mentorSave()">💾 Save Capital Plan</button>
   <div class="kpi-grid" style="margin-top:12px"><div class="kpi-box"><div class="muted">Current Balance</div><div class="big">₹${Math.round(f.balance).toLocaleString('en-IN')}</div></div><div class="kpi-box"><div class="muted">Runway</div><div class="big">${f.runway.toFixed(1)} days</div></div><div class="kpi-box"><div class="muted">Income Since Start</div><div class="big">₹${Math.round(f.income).toLocaleString('en-IN')}</div></div><div class="kpi-box"><div class="muted">Expenses Since Start</div><div class="big">₹${Math.round(f.expense).toLocaleString('en-IN')}</div></div></div>
   <div class="kpi-grid" style="margin-top:10px"><div class="kpi-box"><div class="muted">Planned Allocation</div><div class="big">₹${Math.round(f.plannedAllocation).toLocaleString('en-IN')}</div><div class="meta">Reserves + funds</div></div><div class="kpi-box"><div class="muted">Unallocated Capital</div><div class="big">₹${Math.round(f.unallocated).toLocaleString('en-IN')}</div><div class="meta">Starting capital − allocation</div></div><div class="kpi-box"><div class="muted">Monthly Burn</div><div class="big">₹${Math.round(f.monthlyBurn).toLocaleString('en-IN')}</div></div><div class="kpi-box"><div class="muted">Daily Burn</div><div class="big">₹${Math.round(f.dailyBurn).toLocaleString('en-IN')}</div></div></div>
   <div style="margin-top:12px"><div class="${st[0]==='good'?'status-good':st[0]==='warn'?'status-warn':'status-bad'}">${st[1]}</div><div class="capital-bar" style="margin-top:6px"><i style="width:${f.cap>0?Math.max(0,Math.min(100,f.balance/f.cap*100)):0}%"></i></div><div class="meta" style="margin-top:6px">Capital plan: ₹${Math.round(f.cap).toLocaleString('en-IN')} · Allocation: ₹${Math.round(f.plannedAllocation).toLocaleString('en-IN')} · Remaining/unallocated: ₹${Math.round(f.unallocated).toLocaleString('en-IN')}</div></div>
  </div>
  <div class="card"><div class="section-title"><h2>🎯 Mission Tracker</h2><button class="secondary" type="button" onclick="mentorSave()">💾 Save Mission</button></div>
   <div class="mission-editor">${missions.map((x,i)=>`<div class="mission-row"><div class="mission-row-title"><span class="tag">Month ${i+1}</span></div><div class="mission-fields"><input id="mmMission${i+1}" value="${esc(x.mission||'')}" placeholder="Mission"><input id="mmTarget${i+1}" value="${esc(x.target||'')}" placeholder="Target, e.g. ₹10–30k"><input id="mmAction${i+1}" value="${esc(x.action||'')}" placeholder="Action / next step"><select id="mmStatus${i+1}"><option ${x.status==='Pending'?'selected':''}>Pending</option><option ${x.status==='Active'?'selected':''}>Active</option><option ${x.status==='Done'?'selected':''}>Done</option></select><input id="mmNote${i+1}" value="${esc(x.note||'')}" placeholder="Short note"></div></div>`).join('')}</div>
  </div>
 </div>
 <div class="card"><div class="between"><h2>📊 KPI Tracking — AD ${esc(date)} · BS ${esc(formatBsShort(date))}</h2><button class="secondary" type="button" onclick="mentorUseToday()">📅 Today</button></div><div class="muted">Selected Mentor Date पर data save होगा. Habit values उसी date से automatically आती हैं.</div>
 <div class="kpi-grid" style="margin-top:12px">${[['Applications','mkApplications','applications'],['Outreach','mkOutreach','outreach'],['Follow-ups','mkFollowups','followups'],['Contacts','mkContacts','contacts'],['Portfolio Outputs','mkPortfolio','portfolio'],['Earned ₹','mkEarned','earned'],['Exercise (Habit)','mkExercise','exercise',true],['Yoga (Habit)','mkYoga','yoga',true],['Meditation (Habit)','mkMeditation','meditation',true],['Learning min','mkLearning','learning'],['Family min','mkFamily','family'],['Sleep (Habit)','mkSleep','sleep',true]].map(([lab,id,key,auto])=>`<label class="kpi-box">${lab}${auto?'<span class="meta" style="display:block;margin-bottom:4px">Auto from Habits</span>':''}<input id="${id}" type="number" min="0" step="1" value="${Number(k[key]||0)}" ${auto?'readonly aria-readonly="true" title="Automatically calculated from Habits for this date"':''}></label>`).join('')}</div>
 <label style="display:block;margin-top:10px">Reflection / obstacle <textarea id="mkNotes" rows="3" placeholder="आज क्या बना, क्या कमाया, क्या सीखा, कहाँ गलती हुई?">${esc(k.notes||'')}</textarea></label>
 <div class="row" style="margin-top:10px"><button class="primary" type="button" onclick="mentorSave()">💾 Save KPI & Mentor Data</button><button class="secondary" type="button" onclick="delete data.mentorKpis[data.mentorSelectedDate||today()];save();renderMentor()">Reset Selected Day</button></div>
 </div>
 <div class="card mentor-quotes-card"><div class="between"><h2>📚 Mentor Principles / Quotes (${(data.mentorQuotes||[]).length})</h2><span class="meta">Dashboard पर भी automatically दिखेगा</span></div><div class="list" style="margin-top:10px">${(data.mentorQuotes||[]).map(x=>`<div class="item"><div class="between"><div style="min-width:0"><b>“${esc(x.text)}”</b><div class="meta">${esc(x.author||'Mentor')} · ${esc(x.category||'Motivation')}</div></div><button class="danger" type="button" onclick="deleteMentorQuote('${x.id}')">Delete</button></div></div>`).join('')}</div></div>
 <div class="card mentor-rules-card"><div class="between"><div><h2>🧭 Mentor Rules</h2><div class="meta">Rules अब editable हैं — strategy बदलने पर यहाँ से update करें. Changes इसी device पर तुरंत save होते हैं.</div></div><span class="tag">${(data.mentorRules||[]).length} Rules</span></div><div class="mentor-rules-editor">${(data.mentorRules||[]).map((r,i)=>`<div class="mentor-rule-row"><span class="tag">${i+1}</span><textarea class="mentor-rule-input" data-rule-id="${esc(r.id||'')}" rows="2" placeholder="Mentor rule लिखें...">${esc(r.text||'')}</textarea><button class="danger" type="button" onclick="deleteMentorRule('${esc(r.id||'')}')" title="Delete rule">Delete</button></div>`).join('')}</div><div class="row" style="margin-top:10px"><button class="primary" type="button" onclick="mentorSaveRules()">💾 Save Rules</button><button class="secondary" type="button" onclick="addMentorRule()">＋ Add Rule</button><button class="secondary" type="button" onclick="resetMentorRules()">↺ Reset Defaults</button></div></div>`;; resizeMentorRules(el);
}

const LIFEOS_CATEGORIES={
 personal:['👤 Personal','Self-care, habits, health and daily personal growth.','Health, routines, boundaries, self-development'],
 professional:['💼 Professional','Work, career, skills, projects and execution.','Career goals, projects, learning, work systems'],
 spiritual:['🕉 Spiritual','Inner peace, faith, reflection and purpose.','Prayer, meditation, gratitude, values'],
 economical:['💰 Economical','Money, savings, income and responsible resource planning.','Budget, savings, income ideas, financial priorities'],
 mental:['🧠 Mental','Clarity, emotional awareness and mental fitness.','Stress notes, focus, reflection, recovery'],
 social:['🤝 Social','Relationships, family, community and communication.','People to contact, relationship goals, contribution'],
 moral:['⚖️ Moral','Character, ethics, integrity and right action.','Principles, decisions, promises, accountability']
};
function categoryKey(id){return 'lifeos_category_'+id}
function getCategoryItems(id){
  data.categories=(data.categories&&typeof data.categories==='object')?data.categories:{};
  if(Array.isArray(data.categories[id]))return data.categories[id];
  try{
    const legacy=JSON.parse(localStorage.getItem(categoryKey(id))||'[]');
    if(Array.isArray(legacy)){data.categories[id]=legacy;return legacy;}
  }catch(e){}
  data.categories[id]=[];
  return data.categories[id];
}
function saveCategoryItems(id,items){
  data.categories=(data.categories&&typeof data.categories==='object')?data.categories:{};
  data.categories[id]=Array.isArray(items)?items:[];
  save();
}

function addCategoryItem(id){const t=document.getElementById('catTitle-'+id),x=document.getElementById('catText-'+id);if(!t||!t.value.trim())return toast('Title लिखें');const a=getCategoryItems(id);a.unshift({id:uid(),title:t.value.trim(),text:x.value.trim(),done:false,createdAt:Date.now()});saveCategoryItems(id,a);renderCategory(id);toast('Saved')}
function toggleCategoryItem(id,itemId,done){const a=getCategoryItems(id),x=a.find(v=>v.id===itemId);if(x){x.done=done;saveCategoryItems(id,a);renderCategory(id)}}
function deleteCategoryItem(id,itemId){saveCategoryItems(id,getCategoryItems(id).filter(x=>x.id!==itemId));renderCategory(id)}


function render(){const active=document.querySelector('.section.active');if(!active)return;let id=active.id;if(id==='dashboard')renderDashboard();if(id==='mentor')renderMentor();if(id==='planner')renderPlanner();if(id==='tasks')renderTasks();if(id==='routine')renderRoutine();if(id==='notes')renderNotes();if(id==='journal')renderJournal();if(id==='habits')renderHabits();if(id==='expenses')renderExpenses();if(id==='goals')renderGoals();if(id==='focus')renderFocus();if(LIFEOS_CATEGORIES[id])renderCategory(id);if(id==='settings')renderSettings();if(id==='device-storage')window.renderDeviceStorage?.();restoreDrafts();addLazyMoreButton(id)}
const __localDate = new Date();
const __yyyy = __localDate.getFullYear();
const __mm = String(__localDate.getMonth()+1).padStart(2,'0');
const __dd = String(__localDate.getDate()).padStart(2,'0');
const __todayInput=document.getElementById('today'); if(__todayInput) __todayInput.value=`${__yyyy}-${__mm}-${__dd}`;

  const CURRENCIES=[
    ['AED','د.إ'],['AFN','؋'],['ALL','L'],['AMD','֏'],['ANG','ƒ'],['AOA','Kz'],['ARS','$'],['AUD','$'],['AWG','ƒ'],['AZN','₼'],
    ['BAM','KM'],['BBD','$'],['BDT','৳'],['BGN','лв'],['BHD','.د.ب'],['BIF','FBu'],['BMD','$'],['BND','$'],['BOB','Bs.'],['BRL','R$'],
    ['BSD','$'],['BTN','Nu.'],['BWP','P'],['BYN','Br'],['BZD','BZ$'],['CAD','$'],['CDF','FC'],['CHF','CHF'],['CLP','$'],['CNY','¥'],
    ['COP','$'],['CRC','₡'],['CUP','$'],['CVE','$'],['CZK','Kč'],['DJF','Fdj'],['DKK','kr'],['DOP','RD$'],['DZD','دج'],['EGP','E£'],
    ['ERN','Nfk'],['ETB','Br'],['EUR','€'],['FJD','$'],['FKP','£'],['GBP','£'],['GEL','₾'],['GHS','₵'],['GIP','£'],['GMD','D'],
    ['GNF','FG'],['GTQ','Q'],['GYD','$'],['HKD','$'],['HNL','L'],['HTG','G'],['HUF','Ft'],['IDR','Rp'],['ILS','₪'],['INR','₹'],
    ['IQD','ع.د'],['IRR','﷼'],['ISK','kr'],['JMD','J$'],['JOD','د.ا'],['JPY','¥'],['KES','KSh'],['KGS','сом'],['KHR','៛'],['KMF','CF'],
    ['KPW','₩'],['KRW','₩'],['KWD','د.ك'],['KYD','$'],['KZT','₸'],['LAK','₭'],['LBP','ل.ل'],['LKR','Rs'],['LRD','$'],['LSL','L'],
    ['LYD','ل.د'],['MAD','د.م.'],['MDL','L'],['MGA','Ar'],['MKD','ден'],['MMK','K'],['MNT','₮'],['MOP','MOP$'],['MRU','UM'],['MUR','₨'],
    ['MVR','Rf'],['MWK','MK'],['MXN','$'],['MYR','RM'],['MZN','MT'],['NAD','$'],['NGN','₦'],['NIO','C$'],['NOK','kr'],['NPR','रू'],
    ['NZD','$'],['OMR','ر.ع.'],['PAB','B/.'],['PEN','S/'],['PGK','K'],['PHP','₱'],['PKR','₨'],['PLN','zł'],['PYG','₲'],['QAR','ر.ق'],
    ['RON','lei'],['RSD','дин'],['RUB','₽'],['RWF','FRw'],['SAR','﷼'],['SBD','$'],['SCR','₨'],['SDG','ج.س.'],['SEK','kr'],['SGD','$'],
    ['SHP','£'],['SLE','Le'],['SOS','S'],['SRD','$'],['SSP','£'],['STN','Db'],['SYP','£'],['SZL','E'],['THB','฿'],['TJS','ЅМ'],
    ['TMT','m'],['TND','د.ت'],['TOP','T$'],['TRY','₺'],['TTD','TT$'],['TWD','NT$'],['TZS','TSh'],['UAH','₴'],['UGX','USh'],['USD','$'],
    ['UYU','$U'],['UZS','soʻm'],['VES','Bs.S'],['VND','₫'],['VUV','VT'],['WST','WS$'],['XAF','FCFA'],['XCD','$'],['XOF','CFA'],['XPF','₣'],
    ['YER','﷼'],['ZAR','R'],['ZMW','ZK'],['ZWL','$']
  ];
  data.settings={...(data.settings||{}),currencyCode:(data.settings?.currencyCode||'NPR'),customCurrency:(data.settings?.customCurrency||{code:'CUSTOM',symbol:'¤'})};
  function currencyInfo(){
    const code=data.settings.currencyCode||'NPR';
    if(code==='CUSTOM'){const c=data.settings.customCurrency||{};return ['CUSTOM',String(c.symbol||c.code||'¤').trim()||'¤'];}
    const found=CURRENCIES.find(x=>x&&x[0]===code);return found&&found[1]? [found[0],String(found[1])] : ['NPR','रू'];
  }
  window.currencySymbol=()=>currencyInfo()[1];
  window.currencyCode=()=>currencyInfo()[0];
  window.money=(n,dec=2)=>currencySymbol()+Number(n||0).toLocaleString('en-IN',{minimumFractionDigits:dec,maximumFractionDigits:dec});
  function applyCurrencyText(root){
    root=root||document.querySelector('.section.active')||document.body;
    const sym=currencySymbol();
    if(!sym)return;
    const walk=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];
    while(walk.nextNode()){const n=walk.currentNode;if(n.nodeValue?.includes('₹'))nodes.push(n)}
    for(const n of nodes)n.nodeValue=n.nodeValue.replace(/₹/g,sym);
    root.querySelectorAll('input[placeholder],textarea[placeholder],input[title]').forEach(el=>{
      if(el.placeholder?.includes('₹'))el.placeholder=el.placeholder.replace(/₹/g,sym);
      if(el.title?.includes('₹'))el.title=el.title.replace(/₹/g,sym);
    });
  }
  function scheduleCurrencyText(){
    const run=()=>applyCurrencyText(document.querySelector('.section.active')||document.body);
    if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:120});
    else requestAnimationFrame(run);
  }


