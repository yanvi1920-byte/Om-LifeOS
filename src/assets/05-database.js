// Tauri v2 bridge without a bundler dependency. The previous release imported
// @tauri-apps/api/core directly from a static HTML page, which causes a blank
// screen because browsers/Tauri static assets cannot resolve bare npm imports.
const invoke = async (command, args) => {
  const internals = window.__TAURI_INTERNALS__;
  if (internals && typeof internals.invoke === 'function') {
    return internals.invoke(command, args);
  }
  throw new Error('Native SQLite bridge unavailable in browser/local HTML mode');
};

const DB_SECTIONS = {
  tasks:"tasks", notes:"notes", journal:"journal", expenses:"expenses", income:"income",
  habits:"habits", routines:"routines", goals:"goals", focusSessions:"focus",
  personal:"personal", professional:"professional", spiritual:"spiritual", economical:"economical",
  mental:"mental", social:"social", moral:"moral", daily:"daily"
};
const DB_ARRAY_KEYS = Object.keys(DB_SECTIONS);
let readyPromise = null;
const lastSignatures = new Map();
const knownIds = new Map();
const dirtySections = new Set();
const knownFingerprints = new Map();
const knownDailyIds = new Set();

function recordDate(value){
  if(value == null) return null;
  const candidates=[value.date,value.targetDate,value.createdAt,value.updatedAt];
  for(const c of candidates){
    if(typeof c==='string' && /^\d{4}-\d{2}-\d{2}/.test(c)) return c.slice(0,10);
    if(typeof c==='number' && Number.isFinite(c)){const d=new Date(c);if(!Number.isNaN(d.getTime())) return d.toISOString().slice(0,10);}
  }
  return null;
}
function safeId(value,index){return String(value?.id ?? value?.key ?? `${Date.now()}-${index}`);}
function payloadFor(value){
  // Native SQLite is the canonical long-life store. Keep attachment payloads in
  // the record so the SQLite backup is self-contained. Browser fallback still
  // strips binary/host objects in localSnapshot().
  return JSON.stringify(value);
}
function sectionFingerprint(values){
  // Diagnostic-only fingerprint. It is NEVER used as an authoritative save gate;
  // payload comparison below is the source of truth so edits such as done/progress/
  // frequency cannot be skipped.
  return (Array.isArray(values)?values:[]).map((v,i)=>safeId(v,i)).join('\u001e');
}
const DB_NATIVE_RUNTIME=Boolean(window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke==='function');
async function init(){
  if(!DB_NATIVE_RUNTIME) return null;
  if(readyPromise) return readyPromise;
  readyPromise=invoke('db_init').then(x=>{window.__omDbStats=x;return x}).catch(e=>{readyPromise=null;throw e});
  return readyPromise;
}
async function upsert(section,value,index=0){
  if(!DB_NATIVE_RUNTIME)return false;
  if(!value || typeof value!=='object') return;
  await init();
  const payload=payloadFor(value);
  await invoke('db_upsert_record',{record:{section,record_id:safeId(value,index),date_key:recordDate(value),updated_at:Number(value.updatedAt||value.createdAt||Date.now()),payload}});
  dirtySections.delete(section);
}
async function persistSection(key,values,{force=false}={}){
  if(!DB_NATIVE_RUNTIME)return false;
  const section=DB_SECTIONS[key]||key;
  if(!Array.isArray(values)) return;
  const signature=sectionFingerprint(values);
  const cleanValues=values.filter(v=>v&&typeof v==='object');
  const allRecords=cleanValues.map((v,i)=>({section,record_id:safeId(v,i),date_key:recordDate(v),updated_at:Number(v.updatedAt||v.createdAt||Date.now()),payload:payloadFor(v)}));
  const prevFp=knownFingerprints.get(section)||new Map();
  const records=allRecords.filter(r=>force || prevFp.get(r.record_id)!==r.payload);
  await init();
  if(records.length) await invoke('db_upsert_records',{records});

  // Reconcile deletions using the previous in-memory ID set. This avoids a
  // SELECT of every ID on every save, which becomes expensive with long histories.
  const previous=knownIds.get(section);
  // Reconcile only the currently loaded window. This never treats unloaded history as deleted.
  const currentIds=new Set(allRecords.map(r=>r.record_id));
  if(previous){
    const stale=[];
    for(const id of previous) if(!currentIds.has(id)) stale.push(id);
    if(stale.length) await invoke('db_delete_records',{section,recordIds:stale});
  }
  knownIds.set(section,currentIds);
  const fp=new Map();
  for(const r of allRecords) fp.set(r.record_id,r.payload);
  knownFingerprints.set(section,fp);
  lastSignatures.set(section,signature);
  dirtySections.delete(section);
}
async function persistDailyMap(data,force=false){
  if(!DB_NATIVE_RUNTIME)return false;
  const values=data?.daily&&typeof data.daily==='object'&&!Array.isArray(data.daily)?Object.entries(data.daily):[];
  const records=values.map(([date,value])=>({
    section:'daily',record_id:String(date),date_key:String(date),
    updated_at:Number(value?.updatedAt||data?.__updatedAt||Date.now()),
    payload:JSON.stringify({id:String(date),date:String(date),...(value||{})})
  }));
  await init();
  if(records.length) await invoke('db_upsert_records',{records});

  // Reconcile deletions only inside the currently hydrated Daily Planner window.
  // Unloaded years are never interpreted as deleted.
  if(!force && knownDailyIds.size){
    const currentIds=new Set(records.map(r=>r.record_id));
    const stale=[];
    for(const id of knownDailyIds) if(!currentIds.has(id)) stale.push(id);
    if(stale.length) await invoke('db_delete_records',{section:'daily',recordIds:stale});
    knownDailyIds.clear();
    currentIds.forEach(id=>knownDailyIds.add(id));
  }else if(!force){
    knownDailyIds.clear();
    records.forEach(r=>knownDailyIds.add(r.record_id));
  }
  return true;
}
async function persistDailyEntry(date,value){
  if(!DB_NATIVE_RUNTIME)return false;
  await init();
  if(value==null){await invoke('db_delete_record',{section:'daily',recordId:String(date)});return true;}
  const record={section:'daily',record_id:String(date),date_key:String(date),updated_at:Number(value?.updatedAt||Date.now()),payload:JSON.stringify({id:String(date),date:String(date),...(value||{})})};
  await invoke('db_upsert_record',{record});
  return true;
}
async function bootstrapFromLegacy(data){
  if(!DB_NATIVE_RUNTIME)return {migrated:false,count:0,lazy:false,browserFallback:true};
  await init();
  const dbCount=Number(await invoke('db_total_count'))||0;
  if(dbCount>0){
    const dbStamp=Number(await invoke('db_get_meta_stamp',{key:'last_data_saved_at'}))||0;
    data.__updatedAt=Math.max(Number(data?.__updatedAt)||0,dbStamp);
    const singletonRaw=await invoke('db_get_meta',{key:'singleton_state'});
    let singleton={};
    if(singletonRaw){try{singleton=JSON.parse(singletonRaw)||{};Object.assign(data,{...singleton,daily:{}})}catch(_){} }
    // Older releases kept the whole Daily Planner history inside one meta JSON blob.
    // Move it to one SQLite record per day so 10–15 years of history stays paginatable.
    if(singleton?.daily && typeof singleton.daily==='object' && !Array.isArray(singleton.daily)){
      data.daily=singleton.daily;
      await persistDailyMap(data,true);
      data.daily={};
      delete singleton.daily;
      await invoke('db_set_meta',{key:'singleton_state',value:JSON.stringify(singleton),updatedAt:Date.now()});
    }
    // Do not hydrate the entire history. The UI loads only the active section/page.
    return {migrated:false,count:dbCount,lazy:true};
  }
  let total=0;
  for(const key of DB_ARRAY_KEYS){const values=Array.isArray(data?.[key])?data[key]:[];if(values.length){await persistSection(key,values,{force:true});total+=values.length;}}
  await persistDailyMap(data,true);
  const singleton={settings:data?.settings||{},mentor:data?.mentor||{},mentorKpis:data?.mentorKpis||{},mentorRules:data?.mentorRules||[],mentorQuotes:data?.mentorQuotes||[],categories:data?.categories||{},financePeriod:data?.financePeriod||'monthly'};
  await invoke('db_set_meta',{key:'singleton_state',value:JSON.stringify(singleton),updatedAt:Date.now()});
  await invoke('db_set_meta',{key:'migration_complete',value:'1',updatedAt:Date.now()});
  await invoke('db_set_meta',{key:'last_data_saved_at',value:String(Date.now()),updatedAt:Date.now()});
  return {migrated:true,count:total};
}
async function saveSnapshot(data,options={}){
  if(!DB_NATIVE_RUNTIME)return false;
  await init();
  const only=Array.isArray(options.sections)?new Set(options.sections):null;
  for(const key of DB_ARRAY_KEYS){
    if(only && !only.has(key)) continue;
    if(key==='daily') continue;
    await persistSection(key,data?.[key]);
  }
  if(!only || only.has('daily')) await persistDailyMap(data,false);
  const singleton={settings:data?.settings||{},mentor:data?.mentor||{},mentorKpis:data?.mentorKpis||{},mentorRules:data?.mentorRules||[],mentorQuotes:data?.mentorQuotes||[],categories:data?.categories||{},financePeriod:data?.financePeriod||'monthly',drafts:data?.__drafts||{}};
  await invoke('db_set_meta',{key:'singleton_state',value:JSON.stringify(singleton),updatedAt:Number(data?.__updatedAt||Date.now())});
  await invoke('db_set_meta',{key:'last_data_saved_at',value:String(Number(data?.__updatedAt||Date.now())),updatedAt:Number(data?.__updatedAt||Date.now())});
  return true;
}
async function exportAll(){
  if(!DB_NATIVE_RUNTIME)return null;
  await init();
  const out={};
  for(const key of DB_ARRAY_KEYS){
    const values=[]; let cursor=null;
    do{
      let page=await listPage(key,{limit:250,cursor});
      if((key==='notes'||key==='journal') && page.length && typeof hydrateAttachmentsFromIDB==='function'){
        const holder=key==='notes'?{notes:page,journal:[]}:{notes:[],journal:page};
        await hydrateAttachmentsFromIDB(holder);
        page=holder[key];
      }
      values.push(...page);
      if(page.length<250){cursor=null;break;}
      const last=page[page.length-1];
      cursor={dateKey:last?.date||last?.targetDate||last?.createdAt||last?.updatedAt||'',updatedAt:Number(last?.updatedAt||last?.createdAt||0),recordId:String(last?.id||'')};
    }while(cursor);
    if(key==='daily'){out.daily={};for(const row of values){const d=String(row?.date||row?.id||'').slice(0,10);if(d)out.daily[d]={...row};}}
    else out[key]=values;
  }
  const singletonRaw=await invoke('db_get_meta',{key:'singleton_state'});
  if(singletonRaw){try{Object.assign(out,JSON.parse(singletonRaw)||{})}catch(_){} }
  return out;
}
async function financeSummary(fromDate='2000-01-01',toDate='2099-12-31'){
  if(!DB_NATIVE_RUNTIME)return null;
  await init();
  return invoke('db_finance_summary',{fromDate,toDate});
}
async function list(section,options={}){
  if(!DB_NATIVE_RUNTIME)return [];
  await init();
  const rows=await invoke('db_list_records',{section:DB_SECTIONS[section]||section,limit:Math.min(1000,Math.max(1,Number(options.limit||100))),offset:Math.max(0,Number(options.offset||0)),fromDate:options.fromDate||null,toDate:options.toDate||null});
  return rows.map(r=>{try{return JSON.parse(r.payload)}catch(_){return null}}).filter(Boolean);
}
async function search(section,query,limit=100){
  if(!DB_NATIVE_RUNTIME)return [];
  await init();
  const rows=await invoke('db_search_records',{section:DB_SECTIONS[section]||section,query:String(query||''),limit:Math.min(200,Math.max(1,Number(limit||100)))});
  return rows.map(r=>{try{return JSON.parse(r.payload)}catch(_){return null}}).filter(Boolean);
}
function primeSection(section,values){
  const s=DB_SECTIONS[section]||section;
  const arr=Array.isArray(values)?values:[];
  const ids=new Set(); const fp=new Map();
  arr.forEach((v,i)=>{const id=safeId(v,i);ids.add(id);fp.set(id,payloadFor(v));});
  knownIds.set(s,ids); knownFingerprints.set(s,fp); lastSignatures.set(s,sectionFingerprint(arr));
}
function primeDaily(values){
  knownDailyIds.clear();
  const arr=Array.isArray(values)?values:[];
  for(const value of arr){const id=String(value?.date||value?.id||'').slice(0,10);if(id)knownDailyIds.add(id)}
}
async function listCount(section){
  if(!DB_NATIVE_RUNTIME)return 0;
  await init();
  return Number(await invoke('db_count_records',{section:DB_SECTIONS[section]||section}))||0;
}
async function listPage(section,options={}){
  if(!DB_NATIVE_RUNTIME)return [];
  await init();
  const cursor=options.cursor||null;
  const rows=await invoke('db_list_records',{section:DB_SECTIONS[section]||section,limit:Math.min(250,Math.max(1,Number(options.limit||200))),offset:cursor?0:Math.max(0,Number(options.offset||0)),fromDate:options.fromDate||null,toDate:options.toDate||null,cursorDate:cursor?.dateKey||null,cursorUpdatedAt:cursor?.updatedAt??null,cursorRecordId:cursor?.recordId||null});
  return rows.map(r=>{try{return JSON.parse(r.payload)}catch(_){return null}}).filter(Boolean);
}
window.omDb={
  init,upsert,persistSection,persistDailyEntry,exportAll,financeSummary,bootstrapFromLegacy,saveSnapshot,list,search,listPage,primeSection,primeDaily,
  count:listCount,
  totalCount:()=>DB_NATIVE_RUNTIME?init().then(()=>invoke('db_total_count')):Promise.resolve(0),
  delete:(section,id)=>DB_NATIVE_RUNTIME?init().then(()=>invoke('db_delete_record',{section:DB_SECTIONS[section]||section,recordId:String(id)})):Promise.resolve(false),
  checkpoint:()=>DB_NATIVE_RUNTIME?init().then(()=>invoke('db_checkpoint')):Promise.resolve(false),
  integrityCheck:()=>DB_NATIVE_RUNTIME?init().then(()=>invoke('db_integrity_check')):Promise.resolve('browser-fallback'),
  chooseBackup:()=>DB_NATIVE_RUNTIME?init().then(()=>invoke('choose_database_backup')):Promise.resolve(null),
  restoreFromBackup:backup=>DB_NATIVE_RUNTIME?init().then(()=>invoke('db_restore_from_backup',{backup})):Promise.reject(new Error('Native SQLite recovery is available only in the desktop app')),
  backup:target=>DB_NATIVE_RUNTIME?init().then(()=>invoke('db_backup_to',{target})):Promise.resolve(null),
  autoBackup:()=>DB_NATIVE_RUNTIME?init().then(()=>invoke('db_auto_backup')):Promise.resolve(null),
  getMeta:key=>DB_NATIVE_RUNTIME?init().then(()=>invoke('db_get_meta',{key})):Promise.resolve(null),
  setMeta:(key,value)=>DB_NATIVE_RUNTIME?init().then(()=>invoke('db_set_meta',{key,value,updatedAt:Date.now()})):Promise.resolve(false)
};

if(DB_NATIVE_RUNTIME)init().catch(e=>console.warn('ॐ database unavailable; browser storage fallback remains active',e));

setInterval(()=>{if(document.visibilityState==='visible')window.omDb?.checkpoint().catch(()=>{});},10*60*1000);
// Non-blocking safety backup: only attempt after the app has been quiet for 90s.
// Any keyboard/pointer/touch activity resets the quiet timer. This avoids doing
// backup I/O while the user is actively entering data.
let __lastUserActivity=Date.now();
const __markActivity=()=>{__lastUserActivity=Date.now()};
['pointerdown','keydown','input','touchstart'].forEach(ev=>document.addEventListener(ev,__markActivity,{passive:true}));
setInterval(()=>{
  const idle=Date.now()-__lastUserActivity;
  if(document.visibilityState==='visible' && idle>=90*1000){
    window.omDb?.autoBackup().then(p=>{if(p)window.__omLastBackupPath=p;}).catch(()=>{});
  }
},5*60*1000);
window.addEventListener('pagehide',()=>window.omDb?.checkpoint().catch(()=>{}),{passive:true});
