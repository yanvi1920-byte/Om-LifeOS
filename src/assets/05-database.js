import { invoke } from "@tauri-apps/api/core";

const DB_SECTIONS = {
  tasks:"tasks", notes:"notes", journal:"journal", expenses:"expenses", income:"income",
  habits:"habits", routines:"routines", goals:"goals", focusSessions:"focus",
  personal:"personal", professional:"professional", spiritual:"spiritual", economical:"economical",
  mental:"mental", social:"social", moral:"moral"
};
const DB_ARRAY_KEYS = Object.keys(DB_SECTIONS);
let readyPromise = null;
const lastSignatures = new Map();

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
  const copy={...value};
  if(Array.isArray(copy.images)) copy.images=copy.images.map(()=>null);
  if(Array.isArray(copy.files)) copy.files=copy.files.map(f=>({...f,data:null}));
  return JSON.stringify(copy);
}
async function init(){
  if(readyPromise) return readyPromise;
  readyPromise=invoke('db_init').then(x=>{window.__omDbStats=x;return x}).catch(e=>{readyPromise=null;throw e});
  return readyPromise;
}
async function upsert(section,value,index=0){
  if(!value || typeof value!=='object') return;
  await init();
  const payload=payloadFor(value);
  return invoke('db_upsert_record',{record:{section,record_id:safeId(value,index),date_key:recordDate(value),updated_at:Number(value.updatedAt||value.createdAt||Date.now()),payload}});
}
async function persistSection(key,values){
  const section=DB_SECTIONS[key]||key;
  if(!Array.isArray(values)) return;
  const signature=JSON.stringify(values.map(v=>({id:v?.id,date:v?.date,targetDate:v?.targetDate,updatedAt:v?.updatedAt,createdAt:v?.createdAt,_v:v})));
  if(lastSignatures.get(section)===signature) return;
  const cleanValues=values.filter(v=>v&&typeof v==='object');
  const records=cleanValues.map((v,i)=>({section,record_id:safeId(v,i),date_key:recordDate(v),updated_at:Number(v.updatedAt||v.createdAt||Date.now()),payload:payloadFor(v)}));
  await invoke('db_upsert_records',{records});
  // Reconcile against the database itself. Do not rely on an in-memory previous-ID set:
  // that set is empty after restart and would leave deleted records behind.
  const existingIds=await invoke('db_list_record_ids',{section});
  const currentIds=new Set(records.map(r=>r.record_id));
  for(const staleId of existingIds){
    if(!currentIds.has(staleId)) await invoke('db_delete_record',{section,recordId:staleId});
  }
  lastSignatures.set(section,signature);
}
async function bootstrapFromLegacy(data){
  await init();
  const count=await invoke('db_count_records',{section:'tasks'});
  if(Number(count)>0) return {migrated:false,count:Number(count)};
  let total=0;
  for(const key of DB_ARRAY_KEYS){const values=Array.isArray(data?.[key])?data[key]:[];if(values.length){await persistSection(key,values);total+=values.length;}}
  const singleton={settings:data?.settings||{},mentor:data?.mentor||{},mentorKpis:data?.mentorKpis||{},mentorRules:data?.mentorRules||[],mentorQuotes:data?.mentorQuotes||[],categories:data?.categories||{},daily:data?.daily||{},financePeriod:data?.financePeriod||'monthly'};
  await invoke('db_set_meta',{key:'singleton_state',value:JSON.stringify(singleton),updatedAt:Date.now()});
  await invoke('db_set_meta',{key:'migration_complete',value:'1',updatedAt:Date.now()});
  return {migrated:true,count:total};
}
async function saveSnapshot(data){
  await init();
  for(const key of DB_ARRAY_KEYS) await persistSection(key,data?.[key]);
  const singleton={settings:data?.settings||{},mentor:data?.mentor||{},mentorKpis:data?.mentorKpis||{},mentorRules:data?.mentorRules||[],mentorQuotes:data?.mentorQuotes||[],categories:data?.categories||{},daily:data?.daily||{},financePeriod:data?.financePeriod||'monthly',drafts:data?.__drafts||{}};
  await invoke('db_set_meta',{key:'singleton_state',value:JSON.stringify(singleton),updatedAt:Number(data?.__updatedAt||Date.now())});
  return true;
}
async function list(section,options={}){
  await init();
  const rows=await invoke('db_list_records',{section:DB_SECTIONS[section]||section,limit:Math.min(1000,Math.max(1,Number(options.limit||100))),offset:Math.max(0,Number(options.offset||0)),fromDate:options.fromDate||null,toDate:options.toDate||null});
  return rows.map(r=>{try{return JSON.parse(r.payload)}catch(_){return null}}).filter(Boolean);
}
async function search(section,query,limit=100){
  await init();
  const rows=await invoke('db_search_records',{section:DB_SECTIONS[section]||section,query:String(query||''),limit:Math.min(200,Math.max(1,Number(limit||100)))});
  return rows.map(r=>{try{return JSON.parse(r.payload)}catch(_){return null}}).filter(Boolean);
}
window.omDb={init,upsert,persistSection,bootstrapFromLegacy,saveSnapshot,list,search,count:section=>init().then(()=>invoke('db_count_records',{section:DB_SECTIONS[section]||section})),delete:(section,id)=>init().then(()=>invoke('db_delete_record',{section:DB_SECTIONS[section]||section,recordId:String(id)})),checkpoint:()=>init().then(()=>invoke('db_checkpoint')),integrityCheck:()=>init().then(()=>invoke('db_integrity_check'))};

init().catch(e=>console.warn('ॐ database unavailable; browser storage fallback remains active',e));

setInterval(()=>{if(document.visibilityState==='visible')window.omDb?.checkpoint().catch(()=>{});},5*60*1000);
window.addEventListener('pagehide',()=>window.omDb?.checkpoint().catch(()=>{}),{passive:true});
