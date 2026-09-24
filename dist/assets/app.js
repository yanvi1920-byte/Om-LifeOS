
// Flat navigation: menu group headings are permanently removed.
// Keep the complete module order, but render every module as one direct item.
const MENUS=[
  ['dashboard','🏠 Dashboard'],
  ['tasks','✅ Tasks'],
  ['routine','🔁 Routine'],
  ['goals','🎯 Goals'],
  ['focus','⏱ Focus'],
  ['notes','📝 Notes'],
  ['journal','📔 Journal'],
  ['calculator','🧮 Calculator'],
  ['finance','💰 Finance'],
  ['health','❤️ Health'],
  ['work','💼 Work'],
  ['people','🤝 People'],
  ['spiritual','🕉 Values'],
  ['things','📁 Things'],
  ['settings','⚙️ Settings']
];
const state={active:'dashboard',tasks:[],routines:[],routineOccurrences:[],habits:[],habitLogs:[],goals:[],milestones:[],strategies:[],kpis:[],missions:[],mentorRules:[],mentorQuotes:[],focus:[],notes:[],journal:[],finance:[],financeAccounts:[],savingsPlans:[],investments:[],loans:[],loanPayments:[],assets:[],liabilities:[],financialGoals:[],people:[],things:[],healthProfile:{},healthMeasurements:[],healthActivities:[],sleepRecords:[],nutritionRecords:[],waterRecords:[],healthAppointments:[],healthNotes:[],workProjects:[],workResponsibilities:[],meetings:[],learningItems:[],skills:[],courses:[],learningProgress:[],relationships:[],interactions:[],importantDates:[],relationshipReminders:[],values:[],principles:[],spiritualPractices:[],commitments:[],documents:[],documentCollections:[],warranties:[],receipts:[],certificates:[],importantRecords:[],settings:{},calcHistory:[],attachments:[],calcFavorites:[],drafts:{},reminders:[],notifications:[],achievements:[],captureDrafts:[]};
const KEY='om-lifeos-emergency-fallback';
const STORAGE_VERSION=16;
const SYNC_SCHEMA_VERSION=2;
state.auth={userId:null,sessionId:null,status:'signed-out',provider:'local',email:null};
state.sync={deviceId:localStorage.getItem('om-lifeos-device-id')||crypto.randomUUID(),queue:[],conflicts:[],status:'offline',lastSyncAt:null,queueEpoch:0,reconciliationRequired:false,reconciliation:null};
const TAB_ID=crypto.randomUUID();
let crossTabChannel=null;
try{crossTabChannel=new BroadcastChannel('om-lifeos-cross-tab-v1')}catch{}
function emitCrossTabCommit(message){const payload={...message,sourceTab:TAB_ID,at:Date.now()};try{crossTabChannel?.postMessage(payload)}catch{}try{localStorage.setItem('om-lifeos-cross-tab-event',JSON.stringify(payload));localStorage.removeItem('om-lifeos-cross-tab-event')}catch{}}
try{localStorage.setItem('om-lifeos-device-id',state.sync.deviceId)}catch{}
const ENTITY_KEYS=['tasks','routines','routineOccurrences','habits','habitLogs','goals','milestones','strategies','kpis','missions','mentorRules','mentorQuotes','focus','notes','journal','finance','financeAccounts','savingsPlans','investments','loans','loanPayments','assets','liabilities','financialGoals','capitalStrategy','capital','capitalRecords','people','things','healthMeasurements','healthActivities','sleepRecords','nutritionRecords','waterRecords','healthAppointments','healthNotes','workProjects','workResponsibilities','meetings','learningItems','skills','courses','learningProgress','relationships','interactions','importantDates','relationshipReminders','values','principles','spiritualPractices','commitments','documents','documentCollections','warranties','receipts','certificates','importantRecords','reminders','notifications','achievements','captureDrafts','attachments','calcHistory','calcFavorites'];
const SINGLETON_KEYS=['settings','healthProfile','drafts','auth','sync'];
const SEARCH_INDEX='searchIndex';
const STORE_NAMES=[...ENTITY_KEYS,...SINGLETON_KEYS,'migrationMeta','state',SEARCH_INDEX];
const INDEX_KEYS=['createdAt','updatedAt','date','dueAt','status','domain','projectId'];
// Heavy history stores are loaded only when their module is opened. Core stores remain
// available for Dashboard/Planner/Finance so existing calculations keep their semantics.
const LAZY_MODULES={
  notes:['notes'],
  journal:['journal'],
  health:['healthProfile','healthMeasurements','healthActivities','sleepRecords','nutritionRecords','waterRecords','healthAppointments','healthNotes'],
  work:['workProjects','workResponsibilities','meetings','learningItems','skills','courses','learningProgress'],
  people:['people','relationships','interactions','importantDates','relationshipReminders'],
  spiritual:['values','principles','spiritualPractices','commitments'],
  things:['things','documents','documentCollections','warranties','receipts','certificates','importantRecords']
};
const LAZY_KEYS=new Set(Object.values(LAZY_MODULES).flat());
async function yieldToBrowser(delay=0){
  if(delay>0){await new Promise(r=>setTimeout(r,delay));return}
  if(typeof scheduler!=='undefined'&&scheduler.postTask){try{await scheduler.postTask(()=>{}, {priority:'background'});return}catch{}}
  if(typeof requestIdleCallback==='function'){await new Promise(r=>requestIdleCallback(()=>r(),{timeout:50}));return}
  await new Promise(r=>setTimeout(r,0));
}

const db={
  dbName:'om-lifeos-v3.1.7',
  promise:null,
  saveQueue:Promise.resolve(),
  cache:null,
  loaded:new Set(),
  mutationEpoch:0,
  open(){
    if(this.promise)return this.promise;
    this.promise=new Promise((resolve,reject)=>{
      const r=indexedDB.open(this.dbName,STORAGE_VERSION);
      r.onupgradeneeded=()=>{
        const d=r.result;
        for(const n of STORE_NAMES){
          if(d.objectStoreNames.contains(n))continue;
          const st=d.createObjectStore(n,{keyPath:'id'});
          if(ENTITY_KEYS.includes(n))for(const k of INDEX_KEYS)try{st.createIndex(k,k,{unique:false})}catch{}
        if(n===SEARCH_INDEX){try{st.createIndex('entity','entity',{unique:false})}catch{}try{st.createIndex('recordId','recordId',{unique:false})}catch{}}
        }
      };
      r.onsuccess=()=>{const d=r.result;d.onversionchange=()=>d.close();resolve(d)};
      r.onerror=()=>reject(r.error);
    });
    return this.promise;
  },
  async migrateLegacyIfNeeded(d){
    const marker=await new Promise((resolve,reject)=>{const t=d.transaction('migrationMeta','readonly'),r=t.objectStore('migrationMeta').get('storage-v2');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error)});
    if(marker?.done)return;
    let legacy=null;
    if(d.objectStoreNames.contains('state'))legacy=await new Promise((resolve,reject)=>{const t=d.transaction('state','readonly'),r=t.objectStore('state').get('root');r.onsuccess=()=>resolve(r.result?.value||null);r.onerror=()=>reject(r.error)});
    if(!legacy){
      const t=d.transaction('migrationMeta','readwrite');t.objectStore('migrationMeta').put({id:'storage-v2',done:true,from:'fresh',completedAt:Date.now()});
      await new Promise((res,rej)=>{t.oncomplete=res;t.onerror=()=>rej(t.error)});return;
    }
    const names=[...ENTITY_KEYS,...SINGLETON_KEYS,'migrationMeta'];
    await new Promise((resolve,reject)=>{
      const t=d.transaction(names,'readwrite');
      for(const k of ENTITY_KEYS){const rows=Array.isArray(legacy[k])?legacy[k]:[];for(const row of rows){if(!row||typeof row!=='object')continue;const x=structuredClone(row);if(!x.id)x.id=crypto.randomUUID();t.objectStore(k).put(x)}}
      for(const k of SINGLETON_KEYS){const value=legacy[k]??(k==='settings'||k==='healthProfile'||k==='drafts'?{}:{});t.objectStore(k).put({id:'root',value:structuredClone(value)})}
      t.objectStore('migrationMeta').put({id:'storage-v2',done:true,from:'legacy-root-state',migratedAt:Date.now(),recordCounts:Object.fromEntries(ENTITY_KEYS.map(k=>[k,Array.isArray(legacy[k])?legacy[k].length:0]))});
      t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Storage migration aborted'));
    });
  },
  async readPage(name,{limit=200,lowerBound=null,upperBound=null,direction='prev'}={}){
    const d=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=d.transaction(name,'readonly'),st=tx.objectStore(name);
      let source=st;
      const indexName=(name!==SEARCH_INDEX && lowerBound!==null && st.indexNames.contains('updatedAt'))?'updatedAt':null;
      if(indexName)source=st.index(indexName);
      const range=lowerBound!==null||upperBound!==null?IDBKeyRange.bound(lowerBound??-Infinity,upperBound??'\uffff'):undefined;
      const req=source.openCursor(range,direction);const rows=[];
      req.onsuccess=()=>{const c=req.result;if(!c||rows.length>=limit){resolve(rows);return}rows.push(c.value);c.continue()};
      req.onerror=()=>reject(req.error);
    });
  },
  async searchIndex(q,limit=100){
    q=String(q||'').trim().toLowerCase();if(!q)return[];
    const d=await this.open();
    return new Promise((resolve,reject)=>{
      const tx=d.transaction(SEARCH_INDEX,'readonly'),st=tx.objectStore(SEARCH_INDEX),req=st.openCursor();const hits=[];
      req.onsuccess=()=>{const c=req.result;if(!c||hits.length>=limit){resolve(hits);return}const v=c.value;if(String(v.text||'').includes(q))hits.push(v);c.continue()};
      req.onerror=()=>reject(req.error);
    });
  },
  async rebuildSearchIndex(){
    const d=await this.open();
    await new Promise((resolve,reject)=>{const t=d.transaction(SEARCH_INDEX,'readwrite');t.objectStore(SEARCH_INDEX).clear();t.oncomplete=resolve;t.onerror=()=>reject(t.error)});
    for(const k of ENTITY_KEYS){
      let lower=null,done=false;
      while(!done){
        const page=await new Promise((resolve,reject)=>{
          const tx=d.transaction(k,'readonly'),st=tx.objectStore(k),rows=[];
          const range=lower===null?undefined:IDBKeyRange.lowerBound(lower,true);
          const req=st.openCursor(range,'next');
          req.onsuccess=()=>{const c=req.result;if(!c||rows.length>=500){resolve({rows,last:rows.length?rows[rows.length-1]?.id:null,hasMore:!!c});return}rows.push(c.value);c.continue()};
          req.onerror=()=>reject(req.error);tx.onerror=()=>reject(tx.error);
        });
        const batch=[];for(const x of page.rows){if(x?.id)batch.push({id:`${k}:${x.id}`,entity:k,recordId:x.id,title:String(x.title||x.name||x.text||x.category||x.id||''),text:JSON.stringify(x).toLowerCase()})}
        if(batch.length)await new Promise((resolve,reject)=>{const t=d.transaction(SEARCH_INDEX,'readwrite'),st=t.objectStore(SEARCH_INDEX);for(const x of batch)st.put(x);t.oncomplete=resolve;t.onerror=()=>reject(t.error)});
        lower=page.last;done=!page.hasMore||!lower;await new Promise(r=>setTimeout(r,0));
      }
    }
  },
  async ensureSearchIndex(){
    try{
      const d=await this.open();
      const count=await new Promise((resolve,reject)=>{const t=d.transaction(SEARCH_INDEX,'readonly'),r=t.objectStore(SEARCH_INDEX).count();r.onsuccess=()=>resolve(r.result||0);r.onerror=()=>reject(r.error)});
      if(count===0){await this.rebuildSearchIndex();return true}return false;
    }catch(e){console.warn('search index bootstrap failed',e);return false}
  },
  async readStoreChunked(d,name,{chunk=250,yieldMs=0}={}){
    const rows=[];let lower=null,done=false;
    while(!done){
      const page=await new Promise((resolve,reject)=>{
        const t=d.transaction(name,'readonly'),st=t.objectStore(name);
        const range=lower===null?undefined:IDBKeyRange.lowerBound(lower,true);
        const req=st.openCursor(range,'next'),batch=[];
        req.onsuccess=()=>{const c=req.result;if(!c||batch.length>=chunk){resolve({batch,last:batch.length?batch[batch.length-1].id:null,more:!!c});return}batch.push(c.value);c.continue()};
        req.onerror=()=>reject(req.error);t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Storage read aborted'));
      });
      rows.push(...page.batch);lower=page.last;done=!page.more||!lower;
      if(!done||yieldMs>0)await yieldToBrowser(yieldMs);
    }
    return rows;
  },
  async hydrate(keys){
    const epoch=this.mutationEpoch;
    const wanted=[...new Set(keys||[])].filter(k=>ENTITY_KEYS.includes(k)||SINGLETON_KEYS.includes(k));
    if(!wanted.length)return;
    const d=await this.open();
    if(!this.cache)this.cache={};
    for(const k of wanted){
      const value=SINGLETON_KEYS.includes(k)
        ? await new Promise((resolve,reject)=>{const t=d.transaction(k,'readonly'),r=t.objectStore(k).get('root');r.onsuccess=()=>resolve(r.result?.value??{});r.onerror=()=>reject(r.error)})
        : await this.readStoreChunked(d,k,{chunk:250});
      if(this.mutationEpoch!==epoch){console.warn('Hydration skipped stale snapshot',k);continue;}
      this.cache[k]=structuredClone(value);
      state[k]=structuredClone(value);
      this.loaded.add(k);
      await new Promise(r=>setTimeout(r,0));
    }
  },
  async load(){
    const epoch=this.mutationEpoch;
    try{
      const d=await this.open();
      await this.migrateLegacyIfNeeded(d);
      const out={};
      // Core data only. Heavy historical modules are demand-loaded by show().
      const core=[...SINGLETON_KEYS,...ENTITY_KEYS.filter(k=>!LAZY_KEYS.has(k))];
      for(const k of core){
        out[k]=SINGLETON_KEYS.includes(k)
          ? await new Promise((resolve,reject)=>{const t=d.transaction(k,'readonly'),r=t.objectStore(k).get('root');r.onsuccess=()=>resolve(r.result?.value??{});r.onerror=()=>reject(r.error)})
          : await this.readStoreChunked(d,k,{chunk:250});
        if(this.mutationEpoch!==epoch){console.warn('Startup hydration stopped after local mutation');break;}
        this.loaded.add(k);
        await yieldToBrowser();
      }
      // Do not replace the whole cache here: a lazy module may have hydrated
      // concurrently while startup was reading core stores. Merge core only so
      // a late startup completion can never erase freshly loaded lazy data.
      const merged=this.cache?structuredClone(this.cache):{};
      for(const k of core)merged[k]=out[k];
      for(const k of LAZY_KEYS)if(!(k in merged))merged[k]=(k==='healthProfile'?{}:[]);
      this.cache=merged;
      const visible=structuredClone(merged);
      return visible;
    }catch(e){try{const x=JSON.parse(localStorage.getItem(KEY)||'null');if(x){this.cache=structuredClone(x);this.loaded=new Set([...ENTITY_KEYS,...SINGLETON_KEYS]);return x}return null}catch{return null}}
  },
  async storageGuard(extraBytes=0){
    try{
      if(!navigator.storage?.estimate)return {ok:true,percent:null,usage:0,quota:0};
      const e=await navigator.storage.estimate();
      const usage=Number(e.usage||0),quota=Number(e.quota||0);
      const projected=usage+Math.max(0,Number(extraBytes)||0);
      const percent=quota?projected/quota*100:0;
      return {ok:!quota||percent<95,percent,usage,quota};
    }catch{return {ok:true,percent:null,usage:0,quota:0}}
  },
  save(options={}){
    const skipSync=!!options.skipSync;
    const epoch=++this.mutationEpoch;
    this.saveQueue=this.saveQueue.then(async()=>{
      try{
        const d=await this.open();
        const guard=await this.storageGuard();
        if(!guard.ok){
          const e=new DOMException('Browser storage is nearly full','QuotaExceededError');
          e.code=22;
          throw e;
        }
        if(!this.cache){this.cache={};for(const k of ENTITY_KEYS)this.cache[k]=[];for(const k of SINGLETON_KEYS)this.cache[k]=structuredClone(state[k]??{})}
        const changed=[]; const deleted=[]; const now=Date.now();
        const fingerprint=v=>JSON.stringify(v);
        for(const k of ENTITY_KEYS){
          if(!this.loaded.has(k))continue;
          const prev=Array.isArray(this.cache[k])?this.cache[k]:[];
          const curr=Array.isArray(state[k])?state[k]:[];
          const pm=new Map(prev.map(r=>[r?.id,r])); const cm=new Map();
          for(const raw of curr){if(!raw||typeof raw!=='object')continue;const x=structuredClone(raw);if(!x.id)x.id=crypto.randomUUID();if(cm.has(x.id))throw new Error(`Duplicate ID in ${k}: ${x.id}`);cm.set(x.id,x);const before=pm.get(x.id);if(!before||fingerprint(before)!==fingerprint(x)){
              const version=Number(before?.sync?.version||x.sync?.version||0)+1;
              if(!skipSync){x.sync={...(x.sync||{}),deviceId:state.sync?.deviceId||'',version,updatedAt:now,deletedAt:null};const target=state[k].find(r=>r?.id===x.id);if(target)target.sync=structuredClone(x.sync)}
              changed.push({entity:k,record:x,operation:'upsert',version:skipSync?Number(x.sync?.version||version):version});
            }}
          for(const before of prev){if(!before?.id||cm.has(before.id))continue;const version=Number(before.sync?.version||0)+1;if(!skipSync)deleted.push({entity:k,recordId:before.id,operation:'delete',version,updatedAt:now,deviceId:state.sync?.deviceId||'',payload:null,createdAt:now});}
        }
        const singletonChanged=[];
        for(const k of SINGLETON_KEYS){if(k==='auth'||k==='sync')continue;const beforeValue=this.cache?.[k]??{};const currentValue=state[k]??{};if(fingerprint(beforeValue)!==fingerprint(currentValue))singletonChanged.push({key:k,value:structuredClone(currentValue)});}
        const queueAdds=[];
        if(!skipSync){for(const x of changed)queueAdds.push({id:uid(),recordId:x.record.id,entity:x.entity,operation:'upsert',version:x.version,updatedAt:x.record.sync.updatedAt,deviceId:x.record.sync.deviceId,payload:structuredClone(x.record),createdAt:now});
        for(const x of deleted)queueAdds.push({id:uid(),recordId:x.recordId,entity:x.entity,operation:'delete',version:x.version,updatedAt:x.updatedAt,deviceId:x.deviceId,payload:null,createdAt:x.createdAt});}
        if(!skipSync&&queueAdds.length&&state.sync){state.sync.queue=[...(state.sync.queue||[]),...queueAdds];state.sync.status='pending'}
        const names=[...new Set([...changed.map(x=>x.entity),...deleted.map(x=>x.entity),...SINGLETON_KEYS,SEARCH_INDEX])];
        await new Promise((resolve,reject)=>{
          const t=d.transaction(names,'readwrite');
          for(const x of changed){t.objectStore(x.entity).put(x.record);t.objectStore(SEARCH_INDEX).put({id:`${x.entity}:${x.record.id}`,entity:x.entity,recordId:x.record.id,title:String(x.record.title||x.record.name||x.record.text||x.record.category||x.record.id||''),text:JSON.stringify(x.record).toLowerCase()});}
          for(const x of deleted){t.objectStore(x.entity).delete(x.recordId);t.objectStore(SEARCH_INDEX).delete(`${x.entity}:${x.recordId}`);}
          for(const k of SINGLETON_KEYS)t.objectStore(k).put({id:'root',value:structuredClone(state[k]??{})});
          t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error||new Error('Storage write aborted'));
        });
        // Only advance the in-memory persistence baseline if no newer mutation
        // happened while this transaction was running. Otherwise the next queued
        // save must diff against the last actually committed snapshot.
        if(this.mutationEpoch===epoch){
          this.cache=structuredClone(state);
        }
        emitCrossTabCommit({type:'commit',changed:changed.map(x=>({entity:x.entity,record:structuredClone(x.record),version:x.version,updatedAt:x.record.sync?.updatedAt||x.record.updatedAt||now})),deleted:deleted.map(x=>({entity:x.entity,recordId:x.recordId,version:x.version,updatedAt:x.updatedAt})),singletons:singletonChanged});
        this.lastSaveError=null;
      }catch(e){
        this.lastSaveError=e;
        this.storageHealthy=false;
        // Keep a best-effort recovery copy, but never pretend the IndexedDB
        // transaction committed. The next queued save will retry from the
        // previous committed cache baseline.
        try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}
        console.error('Om-LifeOS persistent save failed',e);
        const quotaLike=e?.name==='QuotaExceededError'||e?.code===22||/quota|storage.?full|transaction.*abort/i.test(String(e?.message||''));
        toast?.(quotaLike?'⚠️ Storage almost full — backup/export or remove large attachments before retrying.':'⚠️ Local save failed — retrying…');
      }
    });
    return this.saveQueue;
  },
  async putAttachment(row){
    const guard=await this.storageGuard(Number(row?.size||0));
    if(!guard.ok){const e=new DOMException('Not enough browser storage for this attachment','QuotaExceededError');e.code=22;throw e;}
    const d=await this.open();
    return new Promise((res,rej)=>{const t=d.transaction('attachments','readwrite');t.objectStore('attachments').put(row);t.oncomplete=()=>{this.storageHealthy=true;res()};t.onerror=()=>{this.storageHealthy=false;rej(t.error||new Error('Attachment storage failed'))};t.onabort=()=>{this.storageHealthy=false;rej(t.error||new Error('Attachment storage aborted'))}})
  },
  async getAttachment(id){const d=await this.open();return new Promise((res,rej)=>{const t=d.transaction('attachments','readonly'),r=t.objectStore('attachments').get(id);r.onsuccess=()=>res(r.result||null);r.onerror=()=>rej(r.error)})},
  async deleteAttachment(id){const d=await this.open();return new Promise((res,rej)=>{const t=d.transaction('attachments','readwrite');t.objectStore('attachments').delete(id);t.oncomplete=()=>res();t.onerror=()=>rej(t.error)})},
  async clearAll(){const d=await this.open();return new Promise((res,rej)=>{const names=STORE_NAMES.filter(x=>x!=='state');const t=d.transaction(names,'readwrite');for(const n of names)t.objectStore(n).clear();t.oncomplete=()=>{this.storageHealthy=true;res()};t.onerror=()=>{this.storageHealthy=false;rej(t.error)};t.onabort=()=>{this.storageHealthy=false;rej(t.error||new Error('Storage clear aborted'))}})},
  async replaceSnapshotAtomic(snapshot,{attachments=[],replace=true,preserveAttachments=false}={}){
    const d=await this.open();
    const names=[...ENTITY_KEYS,...SINGLETON_KEYS,'attachments',SEARCH_INDEX];
    const rowsByStore={};
    for(const k of ENTITY_KEYS)rowsByStore[k]=Array.isArray(snapshot?.[k])?snapshot[k]:[];
    const totalAttachmentBytes=(attachments||[]).reduce((n,a)=>n+Number(a?.blob?.size||0),0);
    const guard=await this.storageGuard(replace?totalAttachmentBytes:totalAttachmentBytes);
    if(!guard.ok){const e=new DOMException('Not enough browser storage for restore','QuotaExceededError');e.code=22;throw e;}
    await new Promise((resolve,reject)=>{
      const t=d.transaction(names,'readwrite');
      try{
        if(replace){for(const n of names)if(!(preserveAttachments&&n==='attachments'))t.objectStore(n).clear();}
        for(const k of ENTITY_KEYS){const st=t.objectStore(k);for(const row of rowsByStore[k])if(row&&typeof row==='object'&&row.id)st.put(structuredClone(row));}
        for(const k of SINGLETON_KEYS)t.objectStore(k).put({id:'root',value:structuredClone(snapshot?.[k]??{})});
        const ast=t.objectStore('attachments');
        if(!replace){/* existing attachment rows stay; incoming same IDs overwrite */}
        for(const a of attachments){if(a?.id&&a.blob)ast.put(a);}
        const si=t.objectStore(SEARCH_INDEX);
        if(replace)si.clear();
        for(const k of ENTITY_KEYS)for(const row of rowsByStore[k])if(row?.id)si.put({id:`${k}:${row.id}`,entity:k,recordId:row.id,title:String(row.title||row.name||row.text||row.category||row.id||''),text:JSON.stringify(row).toLowerCase()});
      }catch(e){try{t.abort()}catch{};reject(e);return}
      t.oncomplete=()=>{this.storageHealthy=true;resolve()};
      t.onerror=()=>{this.storageHealthy=false;reject(t.error||new Error('Atomic restore transaction failed'))};
      t.onabort=()=>{this.storageHealthy=false;reject(t.error||new Error('Atomic restore transaction aborted'))};
    });
  }
};

const IntegrityService={
  running:false,stats:{checked:0,issues:0,repaired:0},
  async exists(entity,id){if(!entity||!id||!ENTITY_KEYS.includes(entity))return false;if(Array.isArray(state[entity])&&db.loaded.has(entity))return state[entity].some(r=>r?.id===id);try{const d=await db.open();return await new Promise((resolve,reject)=>{const t=d.transaction(entity,'readonly'),r=t.objectStore(entity).get(id);r.onsuccess=()=>resolve(!!r.result);r.onerror=()=>reject(r.error)})}catch{return false}},
  targetForType(type){const raw=type&&typeof type==='object'?type.type:type;const map={Task:'tasks',Goal:'goals',Person:'people',Thing:'things',Document:'documents',WorkProject:'workProjects',Project:'workProjects',Reminder:'reminders',Journal:'journal',Note:'notes'};return map[String(raw||'').trim()]||null},
  async audit({repair=true,entities=null}={}){if(this.running)return this.stats;this.running=true;this.stats={checked:0,issues:0,repaired:0};let changed=false;try{const keys=new Set(entities&&entities.length?entities:ENTITY_KEYS.filter(k=>db.loaded.has(k)));const check=async(id,target,fix)=>{if(!id)return;this.stats.checked++;if(await this.exists(target,id))return;this.stats.issues++;if(repair&&fix){fix();this.stats.repaired++;changed=true}};
    if(keys.has('tasks'))for(const r of(state.tasks||[])){if(r.projectId)await check(r.projectId,'workProjects',()=>{r.orphanedProjectId=r.projectId;delete r.projectId});if(r.linkedEntity){const link=typeof r.linkedEntity==='object'?r.linkedEntity:{type:r.linkedEntity,id:r.linkedId};const e=this.targetForType(link);const lid=link?.id||r.linkedId;if(e&&lid)await check(lid,e,()=>{r.orphanedLink={type:link.type,id:lid};delete r.linkedEntity;delete r.linkedId})}}
    if(keys.has('interactions'))for(const r of(state.interactions||[]))if(r.personId)await check(r.personId,'people',()=>{r.orphanedPersonId=r.personId;r.personId=null});
    if(keys.has('reminders'))for(const r of(state.reminders||[]))if(r.linkedType&&r.linkedId){const e=this.targetForType(r.linkedType);if(e)await check(r.linkedId,e,()=>{r.orphanedLink={type:r.linkedType,id:r.linkedId};r.linkedType=null;r.linkedId=null})}
    if(keys.has('loanPayments'))for(const r of(state.loanPayments||[]))if(r.loanId)await check(r.loanId,'loans',()=>{r.orphanedLoanId=r.loanId;r.loanId=null});
    if(keys.has('finance'))for(const r of(state.finance||[])){if(r.linkedLoanId)await check(r.linkedLoanId,'loans',()=>{r.orphanedLoanId=r.linkedLoanId;delete r.linkedLoanId});if(r.linkedInvestmentId)await check(r.linkedInvestmentId,'investments',()=>{r.orphanedInvestmentId=r.linkedInvestmentId;delete r.linkedInvestmentId});if(r.accountId)await check(r.accountId,'financeAccounts',()=>{r.orphanedAccountId=r.accountId;r.accountId=null});if(r.fromAccountId)await check(r.fromAccountId,'financeAccounts',()=>{r.orphanedFromAccountId=r.fromAccountId;r.fromAccountId=null});if(r.toAccountId)await check(r.toAccountId,'financeAccounts',()=>{r.orphanedToAccountId=r.toAccountId;r.toAccountId=null})}
    for(const k of ['notes','journal'])if(keys.has(k))for(const r of(state[k]||[]))if(Array.isArray(r.attachments)&&r.attachments.length){const valid=[],orphan=[];for(const id of r.attachments){if(await this.exists('attachments',id))valid.push(id);else orphan.push(id)}if(orphan.length){this.stats.issues+=orphan.length;if(repair){r.orphanedAttachmentIds=[...(r.orphanedAttachmentIds||[]),...orphan];r.attachments=valid;this.stats.repaired+=orphan.length;changed=true}}}
    if(changed){await db.save();try{render()}catch{}}return this.stats;}finally{this.running=false}}
};
let integrityAuditTimer=null;
function scheduleIntegrityAudit(delay=1200,entities=null){
  clearTimeout(integrityAuditTimer);
  integrityAuditTimer=setTimeout(()=>{integrityAuditTimer=null;IntegrityService.audit({repair:true,entities}).catch(e=>console.warn('Integrity audit skipped',e))},Math.max(0,delay));
}

function crossTabVersion(row){return Number(row?.sync?.version||row?.version||0)}
function crossTabUpdatedAt(row){return Number(row?.sync?.updatedAt||row?.updatedAt||0)}
function applyCrossTabCommit(msg){
  if(!msg||msg.sourceTab===TAB_ID||msg.type!=='commit')return;
  let touched=false;
  for(const item of (msg.changed||[])){
    if(!ENTITY_KEYS.includes(item.entity)||!item.record?.id||!db.loaded.has(item.entity))continue;
    const arr=Array.isArray(state[item.entity])?state[item.entity]:[];const i=arr.findIndex(r=>r?.id===item.record.id);const local=i>=0?arr[i]:null;
    const rv=crossTabVersion(item.record),lv=crossTabVersion(local),ru=Number(item.updatedAt||crossTabUpdatedAt(item.record)),lu=crossTabUpdatedAt(local);
    if(local&&(lv>rv||(lv===rv&&lu>ru)))continue;
    const payload=structuredClone(item.record);if(i>=0)arr[i]=payload;else arr.push(payload);
    if(!db.cache)db.cache={};if(!Array.isArray(db.cache[item.entity]))db.cache[item.entity]=[];const ci=db.cache[item.entity].findIndex(r=>r?.id===item.record.id);if(ci>=0)db.cache[item.entity][ci]=structuredClone(payload);else db.cache[item.entity].push(structuredClone(payload));touched=true;
  }
  for(const item of (msg.deleted||[])){
    if(!ENTITY_KEYS.includes(item.entity)||!db.loaded.has(item.entity))continue;
    const arr=Array.isArray(state[item.entity])?state[item.entity]:[];const local=arr.find(r=>r?.id===item.recordId);const lv=crossTabVersion(local),lu=crossTabUpdatedAt(local),rv=Number(item.version||0),ru=Number(item.updatedAt||0);
    if(local&&(lv>rv||(lv===rv&&lu>ru)))continue;
    state[item.entity]=arr.filter(r=>r?.id!==item.recordId);if(db.cache&&Array.isArray(db.cache[item.entity]))db.cache[item.entity]=db.cache[item.entity].filter(r=>r?.id!==item.recordId);touched=true;
  }
  for(const item of (msg.singletons||[])){if(!SINGLETON_KEYS.includes(item.key)||item.key==='auth'||item.key==='sync')continue;state[item.key]=structuredClone(item.value??{});if(db.cache)db.cache[item.key]=structuredClone(item.value??{});touched=true;}
  if(touched){runtimeRevision++;financeSummaryCache=null;try{render()}catch{}}
}
try{crossTabChannel?.addEventListener('message',e=>{
  const msg=e.data;
  if(msg?.type==='destructive-invalidate'&&msg.sourceTab!==TAB_ID){
    try{db.mutationEpoch++;db.cache=null;db.loaded.clear()}catch{}
    try{window.location.reload()}catch{}
    return;
  }
  applyCrossTabCommit(msg);
})}catch{}
window.addEventListener('storage',e=>{if(e.key==='om-lifeos-cross-tab-event'&&e.newValue){try{const msg=JSON.parse(e.newValue);if(msg?.type==='destructive-invalidate'&&msg.sourceTab!==TAB_ID){db.mutationEpoch++;db.cache=null;db.loaded.clear();window.location.reload();return}applyCrossTabCommit(msg)}catch{}}});

// v3.1.9 Sync + Auth foundation: local-first, provider-neutral, never blocks UI.
const AuthService={
  current(){return state.auth},
  async signIn(email){
    email=String(email||'').trim().toLowerCase();
    if(!email)return false;
    const previous=state.auth?.email||null;
    state.auth={userId:'local-'+btoa(unescape(encodeURIComponent(email))).replace(/[^a-zA-Z0-9]/g,'').slice(0,24),sessionId:uid(),status:'signed-in',provider:'local',email};
    // Pending anonymous local mutations can be claimed by the first signed-in local account.
    if(Array.isArray(state.sync?.queue))for(const q of state.sync.queue)if(!q.ownerUserId)q.ownerUserId=state.auth.userId;
    state.sync.status=state.sync?.queue?.length?'pending':'ready';
    await db.save({skipSync:true});
    return true;
  },
  async signOut(){
    // Never transmit queued local changes while signed out. Keep them locally for recovery.
    state.auth={userId:null,sessionId:null,status:'signed-out',provider:'local',email:null};
    state.sync.status='offline';
    await db.save({skipSync:true});
  },
  async recover(){if(state.auth.email)return this.signIn(state.auth.email);return false}
};
const SyncService={
  adapter:null,
  syncRunning:null,
  nextRetryAt:0,
  retryCount:0,
  enqueue(type,entity,record){
    const item={id:uid(),recordId:record?.id||uid(),entity,operation:type,version:Number(record?.sync?.version||record?.version||1),updatedAt:record?.sync?.updatedAt||record?.updatedAt||Date.now(),deviceId:record?.sync?.deviceId||state.sync.deviceId,payload:structuredClone(record||null),createdAt:Date.now(),ownerUserId:state.auth?.userId||null,attempts:0};
    state.sync.queue.push(item);state.sync.status='pending';return item
  },
  markMutation(entity,record,operation='upsert'){if(!record)return;record.sync={...(record.sync||{}),deviceId:state.sync.deviceId,version:Number(record.sync?.version||0)+1,updatedAt:Date.now(),deletedAt:operation==='delete'?Date.now():null};this.enqueue(operation,entity,record)},
  pendingQueue(){
    const uidNow=state.auth?.userId||null;
    return (state.sync.queue||[]).filter(q=>q && (q.ownerUserId===uidNow || (!q.ownerUserId&&uidNow)));
  },
  coalesceQueue(){
    const src=state.sync.queue||[], keep=new Map(), order=[];
    for(const q of src){
      const key=`${q.ownerUserId||'anonymous'}|${q.entity}|${q.recordId}`;
      const old=keep.get(key);
      if(!old){keep.set(key,q);order.push(key);continue}
      // Keep only the newest mutation for a record; delete supersedes prior upserts.
      if(Number(q.version||0)>=Number(old.version||0)){keep.set(key,q)}
    }
    state.sync.queue=order.map(k=>keep.get(k)).filter(Boolean);
  },
  async fetchReconciliationSnapshot(){
    if(!this.adapter?.snapshot)return {status:'unavailable',reason:'provider-does-not-support-snapshot'};
    if(state.auth?.status!=='signed-in')return {status:'offline',reason:'signed-out'};
    try{
      const result=await this.adapter.snapshot({user:state.auth});
      const records=Array.isArray(result?.records)?result.records:[];
      if(!result||!Array.isArray(result.records))return {status:'invalid',reason:'snapshot-records-missing'};
      return {status:'ok',records,snapshotId:result.snapshotId||null,generatedAt:result.generatedAt||Date.now()};
    }catch(e){return {status:'error',reason:e?.message||'Snapshot failed'}}
  },
  async reconcileSnapshot(){
    if(!state.sync?.reconciliationRequired)return {status:'not-required'};
    const snap=await this.fetchReconciliationSnapshot();
    if(snap.status!=='ok')return snap;
    const local=await readBackupSnapshot();
    const localMap=new Map(),remoteMap=new Map();
    for(const k of ENTITY_KEYS){
      if(k==='attachments')continue;
      for(const r of (local[k]||[]))if(r?.id)localMap.set(`${k}:${r.id}`,r);
    }
    for(const item of snap.records){
      if(!item?.entity||!item?.recordId||!ENTITY_KEYS.includes(item.entity)||item.entity==='attachments')continue;
      if(item.operation==='delete')remoteMap.set(`${item.entity}:${item.recordId}`,null);
      else {const payload=structuredClone(item.payload||item.record||{});if(payload.id==null)payload.id=item.recordId;remoteMap.set(`${item.entity}:${item.recordId}`,payload)}
    }
    const summary={localOnly:0,remoteOnly:0,localNewer:0,remoteNewer:0,conflicts:0,identical:0,total:0,snapshotId:snap.snapshotId||null,generatedAt:snap.generatedAt||Date.now(),sample:[]};
    const keys=new Set([...localMap.keys(),...remoteMap.keys()]);
    for(const key of keys){
      const l=localMap.get(key), r=remoteMap.get(key); summary.total++;
      if(l&&!remoteMap.has(key)){summary.localOnly++;if(summary.sample.length<20)summary.sample.push({key,type:'local-only'});continue}
      if(!l&&remoteMap.has(key)){summary.remoteOnly++;if(summary.sample.length<20)summary.sample.push({key,type:'remote-only'});continue}
      if(l&&remoteMap.has(key)&&r===null){summary.localOnly++;if(summary.sample.length<20)summary.sample.push({key,type:'remote-delete'});continue}
      if(!l||!r){summary.remoteOnly++;if(summary.sample.length<20)summary.sample.push({key,type:'remote-only'});continue}
      const lc=JSON.stringify(l),rc=JSON.stringify(r);
      if(lc===rc){summary.identical++;continue}
      const lv=Number(l.sync?.version||l.version||0),rv=Number(r.sync?.version||r.version||0),lu=Number(l.sync?.updatedAt||l.updatedAt||0),ru=Number(r.sync?.updatedAt||r.updatedAt||0);
      if(lv>rv||(!rv&&lu>ru))summary.localNewer++;else if(rv>lv||(!lv&&ru>lu))summary.remoteNewer++;else summary.conflicts++;
      if(summary.sample.length<20)summary.sample.push({key,type:lv>rv?'local-newer':rv>lv?'remote-newer':'conflict'});
    }
    state.sync.reconciliation={...summary};
    state.sync.status='reconcile-review';
    await db.save({skipSync:true});
    return {status:'ok',summary};
  },
  async resumeReconciliationIfClean(){
    const r=state.sync?.reconciliation;
    if(!state.sync?.reconciliationRequired)return {status:'not-required'};
    if(!r||Number(r.localOnly||0)+Number(r.remoteOnly||0)+Number(r.localNewer||0)+Number(r.remoteNewer||0)+Number(r.conflicts||0)>0)return {status:'review-required'};
    state.sync.reconciliationRequired=false;state.sync.reconciliation=null;state.sync.status=this.adapter?'ready':'offline';await db.save({skipSync:true});return {status:'ok'};
  },
  async adoptCloudSnapshot(){
    if(!state.sync?.reconciliationRequired)return {status:'not-required'};
    const snap=await this.fetchReconciliationSnapshot();
    if(snap.status!=='ok')return snap;
    const incoming={};for(const k of ENTITY_KEYS)incoming[k]=[];
    for(const item of snap.records){if(!item?.entity||!item?.recordId||!ENTITY_KEYS.includes(item.entity)||item.entity==='attachments'||item.operation==='delete')continue;const payload=structuredClone(item.payload||item.record||{});payload.id=payload.id||item.recordId;incoming[item.entity].push(payload)}
    const currentAuth=structuredClone(state.auth||{}), currentSync=structuredClone(state.sync||{});
    incoming.auth=currentAuth;incoming.sync={...currentSync,queue:[],queueEpoch:Number(currentSync.queueEpoch||0)+1,status:this.adapter?'ready':'offline',lastSyncAt:snap.generatedAt||Date.now(),reconciliationRequired:false,reconciliation:null};
    // Cloud snapshot does not own local attachment binaries; preserve them.
    incoming.attachments=await readBackupSnapshot().then(x=>x.attachments||[]);
    Object.assign(state,incoming);await db.replaceSnapshotAtomic(incoming,{attachments:[],replace:true,preserveAttachments:true});db.mutationEpoch++;db.cache=structuredClone(state);emitCrossTabCommit({type:'destructive-invalidate',reason:'reconcile-adopt-cloud',epoch:Date.now()});render();return {status:'ok'};
  },
  async adoptLocalSnapshot(){
    if(!state.sync?.reconciliationRequired)return {status:'not-required'};
    if(!this.adapter?.applySnapshot)return {status:'unavailable',reason:'provider-does-not-support-applySnapshot'};
    const local=await readBackupSnapshot();
    const records=[];for(const k of ENTITY_KEYS){for(const r of (local[k]||[])){if(r?.id)records.push({entity:k,recordId:r.id,operation:'upsert',payload:structuredClone(r),version:Number(r.sync?.version||r.version||1),updatedAt:Number(r.sync?.updatedAt||r.updatedAt||Date.now())})}}
    const baseSnapshotId=state.sync.reconciliation?.snapshotId||null;
    try{await this.adapter.applySnapshot({user:state.auth,records,baseSnapshotId,mode:'replace'});state.sync.reconciliationRequired=false;state.sync.reconciliation=null;state.sync.queue=[];state.sync.queueEpoch=Number(state.sync.queueEpoch||0)+1;state.sync.status='ready';state.sync.lastSyncAt=Date.now();await db.save({skipSync:true});return {status:'ok'}}catch(e){return {status:'error',reason:e?.message||'Cloud reconciliation failed'}}
  },
  async push(){
    if(!this.adapter?.push)return {status:'offline',pushed:0};
    if(state.auth?.status!=='signed-in')return {status:'offline',pushed:0,reason:'signed-out'};
    if(state.sync?.reconciliationRequired)return {status:'reconcile-required',pushed:0,reason:'restore-reconciliation-required'};
    if(Date.now()<this.nextRetryAt)return {status:'backoff',pushed:0,retryAt:this.nextRetryAt};
    this.coalesceQueue();
    const pushEpoch=Number(state.sync?.queueEpoch||0);
    const batch=this.pendingQueue().slice(0,100);
    if(!batch.length){state.sync.status='idle';return {status:'idle',pushed:0}}
    state.sync.status='syncing';
    for(const q of batch)q.attempts=Number(q.attempts||0)+1;
    try{
      const result=await this.adapter.push(structuredClone(batch),{user:state.auth});
      // A reset/replace-restore may invalidate the queue while this network request is in flight.
      // Never let an old response remove or resurrect mutations from the new queue generation.
      if(Number(state.sync?.queueEpoch||0)!==pushEpoch){
        state.sync.status=state.sync.queue?.length?'pending':'idle';
        await db.save({skipSync:true});
        return {status:'stale',pushed:0,rejected:0,remaining:state.sync.queue?.length||0};
      }
      const acceptedIds=new Set(Array.isArray(result?.acceptedIds)?result.acceptedIds:[]);
      const rejectedIds=new Set(Array.isArray(result?.rejectedIds)?result.rejectedIds:[]);
      // If a provider returns only rejections, everything not rejected is accepted.
      // If it returns neither list, retain backwards-compatible whole-batch success.
      let effectiveAccepted;
      if(acceptedIds.size) effectiveAccepted=acceptedIds;
      else if(rejectedIds.size) effectiveAccepted=new Set(batch.map(x=>x.id).filter(id=>!rejectedIds.has(id)));
      else effectiveAccepted=new Set(batch.map(x=>x.id));
      state.sync.queue=(state.sync.queue||[]).filter(q=>!effectiveAccepted.has(q.id));
      this.retryCount=0;this.nextRetryAt=0;
      state.sync.lastSyncAt=Date.now();state.sync.status=state.sync.queue.length?'pending':'idle';
      await db.save({skipSync:true});
      return {status:'ok',pushed:effectiveAccepted.size,rejected:rejectedIds.size,remaining:state.sync.queue.length};
    }catch(e){
      this.retryCount=Math.min(this.retryCount+1,8);
      this.nextRetryAt=Date.now()+Math.min(300000,1000*Math.pow(2,this.retryCount-1));
      state.sync.status='error';
      await db.save({skipSync:true});
      return {status:'error',error:e?.message||'Sync push failed',pushed:0,retryAt:this.nextRetryAt};
    }
  },
  async pull(){
    if(!this.adapter?.pull)return {status:'offline',pulled:0};
    if(state.auth?.status!=='signed-in')return {status:'offline',pulled:0,reason:'signed-out'};
    if(state.sync?.reconciliationRequired)return {status:'reconcile-required',pulled:0,reason:'restore-reconciliation-required'};
    try{
      const result=await this.adapter.pull({user:state.auth,since:state.sync.lastSyncAt});
      let conflicts=0,applied=0;
      for(const incoming of (result?.records||[])){
        if(!incoming?.entity||!incoming?.recordId||!ENTITY_KEYS.includes(incoming.entity))continue;
        const local=findEntityRecord(incoming.entity,incoming.recordId);
        const lv=Number(local?.sync?.version||0),rv=Number(incoming.version||incoming.payload?.sync?.version||0);
        const lu=Number(local?.sync?.updatedAt||local?.updatedAt||0),ru=Number(incoming.updatedAt||incoming.payload?.sync?.updatedAt||0);
        const pending=(state.sync?.queue||[]).some(q=>q.recordId===incoming.recordId&&q.entity===incoming.entity&&q.ownerUserId===state.auth?.userId);
        const localPayload=local?JSON.stringify(local):'';
        const remotePayload=incoming.payload?JSON.stringify(incoming.payload):'';
        const sameVersionDifferentPayload=!!local && lv===rv && localPayload!==remotePayload;
        if(local && (pending || lv>rv || (lv===rv && (lu>ru || sameVersionDifferentPayload)))){
          const reason=pending?'local-pending':lv>rv?'local-newer':sameVersionDifferentPayload?'same-version-different-payload':'same-version-local-newer';
          state.sync.conflicts.push({id:uid(),entity:incoming.entity,recordId:incoming.recordId,local:structuredClone(local),remote:structuredClone(incoming),reason,createdAt:Date.now()});
          conflicts++;continue;
        }
        await applyRemoteRecord(incoming);applied++;
      }
      state.sync.lastSyncAt=Date.now();state.sync.status=state.sync.queue?.length?'pending':'idle';
      await db.save({skipSync:true});
      return {status:'ok',pulled:(result?.records||[]).length,applied,conflicts};
    }catch(e){state.sync.status='error';await db.save({skipSync:true});return {status:'error',error:e?.message||'Sync pull failed',pulled:0}}
  },
  async sync(){
    if(!navigator.onLine)return {status:'offline'};
    if(state.auth?.status!=='signed-in')return {status:'offline',reason:'signed-out'};
    if(this.syncRunning)return this.syncRunning;
    this.syncRunning=(async()=>{
      const p=await this.push();
      // Do not pull after a failed push: otherwise an older remote copy could race with
      // an unsent local mutation and create avoidable conflicts/overwrites.
      if(p.status==='error'||p.status==='backoff')return {push:p,pull:{status:'skipped'},status:p.status};
      const q=await this.pull();
      return {push:p,pull:q,status:q.status==='error'||p.status==='error'?'error':'ok'};
    })();
    try{return await this.syncRunning}finally{this.syncRunning=null}
  }
};
function findEntityRecord(entity,id){const a=state[entity];return Array.isArray(a)?a.find(x=>x?.id===id):null}
async function applyRemoteRecord(item){
  if(!ENTITY_KEYS.includes(item.entity))return;
  const a=state[item.entity]||[];const i=a.findIndex(x=>x?.id===item.recordId);
  if(item.operation==='delete'){if(i>=0)a.splice(i,1);await db.save({skipSync:true});return}
  const payload=structuredClone(item.payload||{});if(!payload.id)payload.id=item.recordId;
  if(i>=0)a[i]=payload;else a.push(payload);
  await db.save({skipSync:true});
}
function configureSyncAdapter(adapter){SyncService.adapter=adapter||null;state.sync.status=adapter?(state.auth?.status==='signed-in'?'ready':'offline'):'offline'}
function syncProviderExample(){return {async push(batch){return {acceptedIds:batch.map(x=>x.id)}},async pull(){return {records:[]}},async snapshot(){return {records:[],snapshotId:'example-snapshot',generatedAt:Date.now()}},async applySnapshot(){return {ok:true}}}}
window.OmLifeOSAuth=AuthService;window.OmLifeOSSync=SyncService;window.configureOmLifeOSSync=configureSyncAdapter;
let lifecycleSyncTimer=null;
let lifecycleSyncInFlight=false;
async function lifecycleResync(){
  if(lifecycleSyncInFlight||!navigator.onLine||state.auth?.status!=='signed-in')return;
  lifecycleSyncInFlight=true;
  try{state.sync.status='ready';await SyncService.sync();}catch(e){console.warn('Lifecycle sync failed',e)}finally{lifecycleSyncInFlight=false;}
}
function scheduleLifecycleSync(delay=1200){clearTimeout(lifecycleSyncTimer);lifecycleSyncTimer=setTimeout(()=>lifecycleResync().catch(()=>{}),Math.max(0,delay));}
window.addEventListener('online',()=>{if(state.auth?.status==='signed-in'){state.sync.status='ready';scheduleLifecycleSync(500)}});
window.addEventListener('offline',()=>{clearTimeout(lifecycleSyncTimer);lifecycleSyncTimer=null;state.sync.status='offline'});
window.addEventListener('pageshow',()=>{if(navigator.onLine&&state.auth?.status==='signed-in')scheduleLifecycleSync(700);if(state.active==='focus'){const rt=focusRuntime();if(rt?.running)startFocusTicker();}});
window.addEventListener('pagehide',()=>{if(state.active==='focus')stopFocusTicker();});
window.addEventListener('storage',e=>{if(e.key==='om-lifeos-device-id'&&e.newValue&&e.newValue!==state.sync.deviceId){state.sync.deviceId=e.newValue;}});
async function refreshStorageEstimate(){try{if(!navigator.storage?.estimate)return null;const e=await navigator.storage.estimate();const used=Number(e.usage||0),quota=Number(e.quota||0);const pct=quota?used/quota*100:0;const level=pct>=95?'critical':pct>=85?'warning':'ok';state.settings={...(state.settings||{}),storageEstimate:{usage:used,quota,percent:pct,level,updatedAt:Date.now()}};return state.settings.storageEstimate;}catch{return null}}
window.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'){refreshStorageEstimate().catch(()=>{});if(state.active==='focus'){const rt=focusRuntime();if(rt?.running)startFocusTicker();else stopFocusTicker();render();}if(navigator.onLine&&state.auth?.status==='signed-in')scheduleLifecycleSync(900);}else if(state.active==='focus')stopFocusTicker();});


const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>crypto.randomUUID();const today=()=>new Date().toISOString().slice(0,10);function toast(s){const e=document.getElementById('toast');e.textContent=s;e.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display='none',2200)}
/* Permanent flat menu: no group containers, summaries, or dropdown headings. */
function renderNav(){
  const nav=document.getElementById('nav');
  if(!nav)return;
  const items=MENUS;
  nav.innerHTML=items.map(([id,label])=>`<button type="button" class="nav-app ${state.active===id?'active':''}" data-nav-id="${id}" onclick="show('${id}')">${label}</button>`).join('');
} 
function toggleCommandMenu(force){
  const menu=document.getElementById('commandMenu'), trigger=document.getElementById('commandMenuTrigger');
  if(!menu||!trigger)return;
  const open=typeof force==='boolean'?force:!menu.classList.contains('open');
  menu.classList.toggle('open',open); trigger.setAttribute('aria-expanded',String(open));
}
document.addEventListener('click',e=>{
  const wrap=document.querySelector('.command-menu-wrap');
  if(wrap && !wrap.contains(e.target)) toggleCommandMenu(false);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')toggleCommandMenu(false)});

function show(id){
  const navToken=++navigationEpoch;

  state.active=id;
  renderNav();

  if(typeof toggleMobileNav==='function'){
    toggleMobileNav(false);
  }

  document
    .querySelectorAll('#mobileBottomNav button[data-bottom-nav]')
    .forEach(b=>{
      b.classList.toggle(
        'active',
        b.dataset.bottomNav===id
      );
    });

  try{
    render();
    history.replaceState(null,'','#'+id);
  }catch(e){
    console.error('Navigation render failed:',id,e);
    toast('Page could not be opened');
    return;
  }

  const keys=LAZY_MODULES[id]||[];
  if(!keys.length)return;

  const requested=id;

  Promise.resolve().then(async()=>{
    try{
      let flight=moduleHydrationFlights.get(requested);

      if(!flight){
        flight=db.hydrate(keys).finally(()=>{
          if(moduleHydrationFlights.get(requested)===flight){
            moduleHydrationFlights.delete(requested);
          }
        });

        moduleHydrationFlights.set(requested,flight);
      }

      await flight;

      if(
        state.active===requested &&
        navigationEpoch===navToken
      ){
        render();
      }

      scheduleIntegrityAudit(1200,keys);

    }catch(e){
      console.error('Module hydration failed:',requested,e);

      if(
        state.active===requested &&
        navigationEpoch===navToken
      ){
        toast('Module data could not be loaded');
      }
    }
  });
}

window.show = show;

function card(title,body,cls='span12'){return `<section class="card ${cls}"><h2>${title}</h2>${body}</section>`}

const CALCULATOR_CATALOG=Object.freeze({quick:['Basic','Scientific','Percentage','Fraction','Ratio','Average','Discount','Tip','Bill Split','Tax'],money:['EMI / Loan','Simple Interest','Compound Interest','SIP / Investment','Savings','ROI','Profit & Loss','Inflation','Salary','Markup','Margin','Break-even','CAGR','Growth','Pricing'],gold:['Gold Value','Gold Rate × Weight','Gold Weight Converter','Karat ↔ Purity','Pure Gold Weight','Jewellery Price','Making Charge','Wastage','GST / Tax','Buy / Sell Value','Silver Value'],health:['BMI','BMR','TDEE','Calories','Macros','Body Fat','Water Intake','Running Pace','Age','Ideal Body Weight'],time:['Date Difference','Age','Countdown','Working Days','Date Add / Subtract','Time Difference','Time Zone Offset','Unix Timestamp','Weekday'],converter:['Length','Weight','Area','Volume','Temperature','Speed','Time','Energy','Pressure','Power','Data Size','Currency','Nepal Land','Nepal Length','Nepal Volume','Nepal Weight'],home:['Room Area','Paint','Flooring','Tiles','Construction','Electricity Cost','Water Usage'],vehicle:['Mileage','Fuel Cost','Trip Fuel','Running Cost','Vehicle Loan','Fuel Economy'],travel:['Trip Budget','Distance','Travel Time','Fuel Budget','Travel Currency','Travel Time Zone'],business:['Revenue','Margin','Markup','Break-even','CAGR','Business ROI','Growth','Pricing'],programmer:['Binary','Decimal','Hexadecimal','Octal','Base Converter','Bitwise','Modulo','Data Size','Unix Timestamp','IP / Subnet']});
const NP_UNITS={land:{sq_m:1,sq_ft:0.09290304,bigha:72900*0.09290304,kattha:3645*0.09290304,dhur:182.25*0.09290304,ropani:5476*0.09290304,aana:342.25*0.09290304,paisa:85.5625*0.09290304,daam:21.390625*0.09290304},length:{m:1,ft:0.3048,angul:0.01905,bitta:0.2286,haat:0.4572,danda:1.8288,janjir:4.1148,kosh:3657.6,gaj:0.9144},volume:{liter:1,muri:20*4.54596,pathi:4.54596,kurwa:1.13649,mana:0.568245,chauthai:0.14206125,muthi:0.0568245},weight:{kg:1,g:0.001,tola:0.0116638125,chatak:0.0583190625,seer:0.933105,dharn:5.59863,maund:37.3242,troy_oz:0.0311034768}};
const n=v=>{const x=Number(v);if(!Number.isFinite(x))throw new Error('Invalid number');return x};
const pos=v=>{const x=n(v);if(x<=0)throw new Error('Value must be greater than zero');return x};
const gcd=(a,b)=>{a=Math.abs(Math.trunc(a));b=Math.abs(Math.trunc(b));while(b){const t=a%b;a=b;b=t}return a||1};
const dateObj=v=>{const d=v instanceof Date?new Date(v.getTime()):new Date(v);if(Number.isNaN(d.getTime()))throw new Error('Invalid date/time');return d};

class CalculatorEngine {
  basic(a,op,b){a=n(a);b=n(b);if(op==='+')return a+b;if(op==='-')return a-b;if(op==='*')return a*b;if(op==='/')return b===0?null:a/b;if(op==='%')return a%b;throw new Error('Unsupported operation');}
  scientific(expr){let s=String(expr).trim().toLowerCase();if(!/^[0-9+\-*/%().,\s_a-z]+$/.test(s))throw new Error('Invalid expression');const allowed=/^(?:pi|sqrt|abs|log|ln|pow|sin|cos|tan|[0-9+\-*/%().,\s]|[a-z])+$/.test(s);if(!allowed)throw new Error('Unsupported scientific token');const f=s.replace(/pi/g,'Math.PI').replace(/sqrt\(/g,'Math.sqrt(').replace(/abs\(/g,'Math.abs(').replace(/log\(/g,'Math.log10(').replace(/ln\(/g,'Math.log(').replace(/pow\(/g,'Math.pow(').replace(/sin\(/g,'Math.sin(Math.PI/180*').replace(/cos\(/g,'Math.cos(Math.PI/180*').replace(/tan\(/g,'Math.tan(Math.PI/180*');if(/[a-z]/i.test(f.replace(/Math\.(PI|sqrt|abs|log10|log|pow|sin|cos|tan)/g,'')))throw new Error('Unsupported scientific token');return Function(`"use strict";return (${f})`)();}
  percentage(value,pct){return n(value)*n(pct)/100}
  fraction(a,b){a=Math.trunc(n(a));b=Math.trunc(n(b));if(!b)throw new Error('Denominator cannot be zero');return a/b;}
  simplifyFraction(a,b){a=Math.trunc(n(a));b=Math.trunc(n(b));if(!b)throw new Error('Denominator cannot be zero');const d=gcd(a,b);return {numerator:a/d,denominator:b/d,value:a/b};}
  ratio(a,b){a=Math.trunc(n(a));b=Math.trunc(n(b));const d=gcd(a,b);return {a:a/d,b:b/d};}
  average(values){const a=values.map(Number).filter(Number.isFinite);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null}
  discount(price,pct){price=n(price);pct=n(pct);const discount=this.percentage(price,pct);return{discount,final:price-discount};}
  tip(bill,pct){bill=n(bill);pct=n(pct);const tip=this.percentage(bill,pct);return{tip,total:bill+tip};}
  billSplit(total,people,tipPct=0){total=n(total);people=pos(people);const grand=total+this.percentage(total,tipPct);return{grandTotal:grand,perPerson:grand/people};}
  tax(amount,rate){amount=n(amount);const tax=this.percentage(amount,rate);return{tax,total:amount+tax};}
  emi(principal,annualRate,months){principal=n(principal);annualRate=n(annualRate);months=pos(months);const r=annualRate/1200;if(!r)return principal/months;return principal*r*Math.pow(1+r,months)/(Math.pow(1+r,months)-1);}
  simpleInterest(p,r,t){p=n(p);r=n(r);t=n(t);const i=p*r*t/100;return{interest:i,total:p+i};}
  compoundInterest(p,r,t,nper=1){p=n(p);r=n(r);t=n(t);nper=pos(nper);const total=p*Math.pow(1+r/(100*nper),nper*t);return{interest:total-p,total};}
  sip(monthly,annualRate,months){monthly=n(monthly);annualRate=n(annualRate);months=pos(months);const r=annualRate/1200;return r?monthly*((Math.pow(1+r,months)-1)/r)*(1+r):monthly*months;}
  savings(target,current,months){target=n(target);current=n(current);months=n(months);const remaining=Math.max(0,target-current);return{remaining,monthly:months>0?remaining/months:null};}
  roi(gain,cost){cost=n(cost);return cost?n(gain)/cost*100:null}
  profitLoss(cost,sale){cost=n(cost);sale=n(sale);const profit=sale-cost;return{profit,margin:sale?profit/sale*100:0};}
  inflation(value,rate,years){return n(value)*Math.pow(1+n(rate)/100,n(years));}
  salary(annual,months=12,taxRate=0){annual=n(annual);months=pos(months);const gross=annual/months;const tax=this.percentage(gross,taxRate);return{grossMonthly:gross,taxMonthly:tax,netMonthly:gross-tax};}
  markup(cost,pct){return n(cost)+this.percentage(cost,pct)}
  margin(price,cost){price=n(price);return price?((price-n(cost))/price)*100:null}
  breakEven(fixedCost,price,variableCost){const contribution=n(price)-n(variableCost);return contribution>0?n(fixedCost)/contribution:null}
  cagr(begin,end,years){begin=n(begin);end=n(end);years=pos(years);return begin>0?Math.pow(end/begin,1/years)-1:null}
  growth(oldValue,newValue){oldValue=n(oldValue);newValue=n(newValue);return oldValue?((newValue-oldValue)/oldValue)*100:null}
  pricing(cost,targetMarginPct){cost=n(cost);const m=n(targetMarginPct);if(m>=100)throw new Error('Margin must be below 100%');return cost/(1-m/100);}
  goldValue(weight,ratePerUnit){return n(weight)*n(ratePerUnit)}
  goldRateWeight(weight,rate){return this.goldValue(weight,rate)}
  goldWeightConverter(value,from,to){return this.unit(value,from,to,{g:1,kg:1000,tola:11.6638125,troy_oz:31.1034768})}
  karatPurity(value,mode='karatToPurity'){const v=n(value);return mode==='purityToKarat'?v*24:v/24*100;}
  pureGoldWeight(weight,karat){return n(weight)*(n(karat)/24)}
  jewelleryPrice(goldValue,makingPct=0,wastagePct=0,taxPct=0){const gv=n(goldValue);const subtotal=gv*(1+n(wastagePct)/100)*(1+n(makingPct)/100);const tax=this.percentage(subtotal,taxPct);return{subtotal,tax,total:subtotal+tax};}
  makingCharge(base,pct){return this.percentage(base,pct)}
  wastage(base,pct){return this.percentage(base,pct)}
  silverValue(weight,ratePerUnit){return n(weight)*n(ratePerUnit)}
  bmi(kg,m){kg=pos(kg);m=pos(m);return kg/(m*m)}
  bmr(weightKg,heightCm,age,sex='male'){const w=n(weightKg),h=n(heightCm),a=n(age);return sex==='female'?10*w+6.25*h-5*a-161:10*w+6.25*h-5*a+5}
  tdee(bmr,activity){const factors={sedentary:1.2,light:1.375,moderate:1.55,high:1.725,athlete:1.9};return n(bmr)*(factors[activity]??1.2)}
  calories(bmr,activity){return this.tdee(bmr,activity)}
  macros(calories,proteinPct=30,carbPct=40,fatPct=30){const c=n(calories),p=n(proteinPct),ca=n(carbPct),f=n(fatPct);return{proteinGrams:c*p/100/4,carbGrams:c*ca/100/4,fatGrams:c*f/100/9};}
  bodyFat(neck,waist,height,sex='male'){const nck=pos(neck),w=pos(waist),h=pos(height);const bf=sex==='male'?495/(1.0324-0.19077*Math.log10(w-nck)+0.15456*Math.log10(h))-450:495/(1.29579-0.35004*Math.log10(w*0.8-nck)+0.221*Math.log10(h))-450;return bf;}
  waterIntake(weightKg,mlPerKg=35,activityMl=0){return n(weightKg)*n(mlPerKg)+n(activityMl)}
  pace(distanceKm,timeMinutes){distanceKm=pos(distanceKm);timeMinutes=n(timeMinutes);const sec=timeMinutes*60/distanceKm;return{minPerKm:Math.floor(sec/60)+Math.round(sec%60)/100,kmh:distanceKm/(timeMinutes/60),secondsPerKm:sec};}
  age(birth,date=new Date()){const b=dateObj(birth),d=dateObj(date);let y=d.getFullYear()-b.getFullYear(),m=d.getMonth()-b.getMonth(),day=d.getDate()-b.getDate();if(day<0){m--;day+=new Date(d.getFullYear(),d.getMonth(),0).getDate()}if(m<0){y--;m+=12}return{years:y,months:m,days:day};}
  idealWeight(heightCm){const h=n(heightCm);return{lower:18.5*Math.pow(h/100,2),upper:24.9*Math.pow(h/100,2),bmiRange:'18.5–24.9'};}
  dateDifference(a,b){return Math.abs(dateObj(b)-dateObj(a))/86400000}
  countdown(target,from=new Date()){return Math.max(0,dateObj(target)-dateObj(from));}
  workingDays(a,b){let d=dateObj(a),e=dateObj(b),count=0;if(d>e)[d,e]=[e,d];for(;d<=e;d.setDate(d.getDate()+1)){const day=d.getDay();if(day!==0&&day!==6)count++;}return count;}
  dateAdd(date,days){const d=dateObj(date);d.setDate(d.getDate()+n(days));return d.toISOString()}
  timeDifference(a,b){return Math.abs(dateObj(`1970-01-01T${a}`)-dateObj(`1970-01-01T${b}`))/1000}
  timezoneOffset(hours,minutes=0){return n(hours)*60+n(minutes)}
  unixTimestamp(date=new Date()){return Math.floor(dateObj(date).getTime()/1000)}
  weekday(date){return dateObj(date).toLocaleDateString('en-US',{weekday:'long'})}
  unit(value,from,to,factors){if(!(from in factors)||!(to in factors))throw new Error('Unknown unit');return n(value)*factors[from]/factors[to]}
  temperature(value,from,to){const v=n(value);const c=from==='C'?v:from==='F'?(v-32)*5/9:v-273.15;return to==='C'?c:to==='F'?c*9/5+32:c+273.15}
  roomArea(length,width){return n(length)*n(width)}
  paintArea(area,coverage){return pos(coverage)>0?n(area)/coverage:null}
  flooring(area,wastePct=0){return n(area)*(1+n(wastePct)/100)}
  tiles(area,tileLength,tileWidth,wastePct=0){const tiles=n(area)/(n(tileLength)*n(tileWidth));return Math.ceil(tiles*(1+n(wastePct)/100));}
  construction(area,costPerUnit){return n(area)*n(costPerUnit)}
  electricityCost(units,rate,fixed=0){return n(units)*n(rate)+n(fixed)}
  waterUsage(people,litresPerPerson){return n(people)*n(litresPerPerson)}
  mileage(distanceKm,fuelLitres){return n(distanceKm)/pos(fuelLitres)}
  fuelCost(distanceKm,mileageKmPerL,pricePerL){return n(distanceKm)/pos(mileageKmPerL)*n(pricePerL)}
  tripFuel(distanceKm,mileageKmPerL){return n(distanceKm)/pos(mileageKmPerL)}
  runningCost(distanceKm,fuelMileage,fuelPrice,maintenancePerKm=0){return this.fuelCost(distanceKm,fuelMileage,fuelPrice)+n(distanceKm)*n(maintenancePerKm)}
  vehicleLoan(principal,rate,months){return this.emi(principal,rate,months)}
  fuelEconomy(fuel,distance){return this.mileage(distance,fuel)}
  tripBudget(transport,hotel,food,other=0){return n(transport)+n(hotel)+n(food)+n(other)}
  distance(speed,timeHours){return n(speed)*n(timeHours)}
  travelTime(distanceKm,speedKmH){return n(distanceKm)/pos(speedKmH)}
  fuelBudget(distanceKm,mileage,price){return this.fuelCost(distanceKm,mileage,price)}
  travelCurrency(amount,rate){return n(amount)*n(rate)}
  travelTimezone(offsetFrom,offsetTo,hour){return n(hour)+(n(offsetTo)-n(offsetFrom))}
  revenue(units,price){return n(units)*n(price)}
  businessRoi(gain,cost){return this.roi(gain,cost)}
  binaryToDecimal(v){return parseInt(String(v),2)}
  decimalToBinary(v){return Math.trunc(n(v)).toString(2)}
  decimalToHex(v){return Math.trunc(n(v)).toString(16).toUpperCase()}
  hexToDecimal(v){return parseInt(String(v),16)}
  decimalToOctal(v){return Math.trunc(n(v)).toString(8)}
  octalToDecimal(v){return parseInt(String(v),8)}
  baseConvert(value,fromBase,toBase){return parseInt(String(value),n(fromBase)).toString(n(toBase)).toUpperCase()}
  bitwise(a,op,b){a=Math.trunc(n(a));b=Math.trunc(n(b));return op==='AND'?(a&b):op==='OR'?(a|b):op==='XOR'?(a^b):op==='LSHIFT'?(a<<b):op==='RSHIFT'?(a>>b):null}
  modulo(a,b){return n(a)%n(b)}
  dataSize(value,from,to){const f={B:1,KB:1024,MB:1024**2,GB:1024**3,TB:1024**4};return n(value)*f[from]/f[to]}
  ipSubnet(ip,cidr){const parts=String(ip).split('.').map(Number);const c=n(cidr);if(parts.length!==4||parts.some(x=>x<0||x>255)||c<0||c>32)throw new Error('Invalid IPv4/CIDR');const val=parts.reduce((a,x)=>(a*256+x)>>>0,0);const mask=c===0?0:(0xffffffff<<(32-c))>>>0;const network=(val&mask)>>>0;const broadcast=(network|(~mask>>>0))>>>0;const fmt=x=>[x>>>24,(x>>>16)&255,(x>>>8)&255,x&255].join('.');const hosts=c>=31?Math.max(0,2**(32-c)):2**(32-c)-2;return{network:fmt(network),broadcast:fmt(broadcast),usableHosts:hosts};}
}


const calculatorEngine=new CalculatorEngine();
const CALC_METHODS={
'Basic':'basic','Scientific':'scientific','Percentage':'percentage','Fraction':'fraction','Ratio':'ratio','Average':'average','Discount':'discount','Tip':'tip','Bill Split':'billSplit','Tax':'tax','EMI / Loan':'emi','Simple Interest':'simpleInterest','Compound Interest':'compoundInterest','SIP / Investment':'sip','Savings':'savings','ROI':'roi','Profit & Loss':'profitLoss','Inflation':'inflation','Salary':'salary','Markup':'markup','Margin':'margin','Break-even':'breakEven','CAGR':'cagr','Growth':'growth','Pricing':'pricing','Gold Value':'goldValue','Gold Rate × Weight':'goldRateWeight','Gold Weight Converter':'goldWeightConverter','Karat ↔ Purity':'karatPurity','Pure Gold Weight':'pureGoldWeight','Jewellery Price':'jewelleryPrice','Making Charge':'makingCharge','Wastage':'wastage','GST / Tax':'tax','Buy / Sell Value':'goldValue','Silver Value':'silverValue','BMI':'bmi','BMR':'bmr','TDEE':'tdee','Calories':'calories','Macros':'macros','Body Fat':'bodyFat','Water Intake':'waterIntake','Running Pace':'pace','Age':'age','Ideal Body Weight':'idealWeight','Date Difference':'dateDifference','Countdown':'countdown','Working Days':'workingDays','Date Add / Subtract':'dateAdd','Time Difference':'timeDifference','Time Zone Offset':'timezoneOffset','Unix Timestamp':'unixTimestamp','Weekday':'weekday','Length':'unit','Weight':'unit','Area':'unit','Volume':'unit','Temperature':'temperature','Speed':'unit','Time':'unit','Energy':'unit','Pressure':'unit','Power':'unit','Data Size':'dataSize','Currency':'travelCurrency','Nepal Land':'unit','Nepal Length':'unit','Nepal Volume':'unit','Nepal Weight':'unit','Room Area':'roomArea','Paint':'paintArea','Flooring':'flooring','Tiles':'tiles','Construction':'construction','Electricity Cost':'electricityCost','Water Usage':'waterUsage','Mileage':'mileage','Fuel Cost':'fuelCost','Trip Fuel':'tripFuel','Running Cost':'runningCost','Vehicle Loan':'vehicleLoan','Fuel Economy':'fuelEconomy','Trip Budget':'tripBudget','Distance':'distance','Travel Time':'travelTime','Fuel Budget':'fuelBudget','Travel Currency':'travelCurrency','Travel Time Zone':'travelTimezone','Revenue':'revenue','Business ROI':'businessRoi','Binary':'binaryToDecimal','Decimal':'decimalToBinary','Hexadecimal':'hexToDecimal','Octal':'octalToDecimal','Base Converter':'baseConvert','Bitwise':'bitwise','Modulo':'modulo','IP / Subnet':'ipSubnet'};
function calcToolOptions(){return Object.entries(CALCULATOR_CATALOG).map(([group,items])=>`<optgroup label="${esc(group)}">${items.map(x=>`<option value="${esc(x)}">${esc(x)}</option>`).join('')}</optgroup>`).join('')}
const CALC_UNIT_FACTORS={
 Length:{m:1,km:1000,cm:.01,mm:.001,ft:.3048,in:.0254,yd:.9144,mi:1609.344},
 Weight:{g:.001,kg:1,mg:.000001,lb:.45359237,oz:.028349523125},
 Area:{sq_m:1,sq_km:1e6,sq_ft:.09290304,sq_yd:.83612736,acre:4046.8564224,hectare:10000},
 Volume:{liter:1,ml:.001,m3:1000,gallon:3.785411784,quart:.946352946,pint:.473176473},
 Speed:{mps:1,kmh:.2777777778,mph:.44704,knot:.5144444444},
 Time:{second:1,minute:60,hour:3600,day:86400,week:604800},
 Energy:{joule:1,kj:1000,calorie:4.184,kcal:4184,wh:3600,kwh:3600000},
 Pressure:{pa:1,kpa:1000,bar:100000,psi:6894.757293,atm:101325},
 Power:{w:1,kw:1000,hp:745.6998716}
};
const CALC_UNIT_OPTIONS={
 Length:['m','km','cm','mm','ft','in','yd','mi'],Weight:['g','kg','mg','lb','oz'],Area:['sq_m','sq_km','sq_ft','sq_yd','acre','hectare'],
 Volume:['liter','ml','m3','gallon','quart','pint'],Speed:['mps','kmh','mph','knot'],Time:['second','minute','hour','day','week'],
 Energy:['joule','kj','calorie','kcal','wh','kwh'],Pressure:['pa','kpa','bar','psi','atm'],Power:['w','kw','hp'],
 Temperature:['C','F','K'],DataSize:['B','KB','MB','GB','TB'],Gold:['g','kg','tola','troy_oz'],
 NepalLand:Object.keys(NP_UNITS.land),NepalLength:Object.keys(NP_UNITS.length),NepalVolume:Object.keys(NP_UNITS.volume),NepalWeight:Object.keys(NP_UNITS.weight)
};
const CALC_SPECIAL={
 Basic:[['a','A','number'],['op','Operator','select:+,-,*,/,%'],['b','B','number']],
 Scientific:[['expr','Expression','textarea']],
 Average:[['values','Values (comma separated)','textarea']],
 Age:[['birth','Birth date','date'],['date','As-of date (optional)','date']],
 'Date Difference':[['a','Start date','date'],['b','End date','date']],Countdown:[['target','Target date/time','datetime-local'],['from','From date/time (optional)','datetime-local']],
 'Working Days':[['a','Start date','date'],['b','End date','date']],
 'Date Add / Subtract':[['date','Date','date'],['days','Days (+/-)','number']],
 'Time Difference':[['a','Time A','time'],['b','Time B','time']],Weekday:[['date','Date','date']],
 UnixTimestamp:[['date','Date/time (optional)','datetime-local']],
 'BMR':[['weightKg','Weight (kg)','number'],['heightCm','Height (cm)','number'],['age','Age','number'],['sex','Sex','select:male,female']],
 TDEE:[['bmr','BMR','number'],['activity','Activity','select:sedentary,light,moderate,high,athlete']],Calories:[['bmr','BMR','number'],['activity','Activity','select:sedentary,light,moderate,high,athlete']],
 BodyFat:[['neck','Neck','number'],['waist','Waist','number'],['height','Height','number'],['sex','Sex','select:male,female']],
 'Karat ↔ Purity':[['value','Value','number'],['mode','Mode','select:karatToPurity,purityToKarat']],
 Bitwise:[['a','A','number'],['op','Operation','select:AND,OR,XOR,LSHIFT,RSHIFT'],['b','B','number']],
 'IP / Subnet':[['ip','IPv4 address','text'],['cidr','CIDR','number']],
};
function calcParamNameList(tool){const m=CALC_METHODS[tool],fn=m&&calculatorEngine[m];if(!fn)return[];const text=Function.prototype.toString.call(fn),inside=text.slice(text.indexOf('(')+1,text.indexOf(')'));return inside.split(',').map(x=>x.trim().replace(/=.*/,'')).filter(Boolean).filter(x=>x!=='factors');}
function calcFieldHtml(tool){
 const key=tool==='Unix Timestamp'?'UnixTimestamp':tool;
 let spec=CALC_SPECIAL[key];
 if(!spec){
   if(['Length','Weight','Area','Volume','Speed','Time','Energy','Pressure','Power','Nepal Land','Nepal Length','Nepal Volume','Nepal Weight','Gold Weight Converter','Data Size','Temperature'].includes(tool)){
     const unitKey=tool==='Gold Weight Converter'?'Gold':tool==='Data Size'?'DataSize':tool==='Temperature'?'Temperature':tool.replace('Nepal ','Nepal');
     const opts=CALC_UNIT_OPTIONS[unitKey]||[];
     spec=[['value','Value','number'],['from','From unit','select:'+opts.join(',')],['to','To unit','select:'+opts.join(',')]];
   }else spec=calcParamNameList(tool).map((p,i)=>[p,p.replace(/([A-Z])/g,' $1').replace(/^./,c=>c.toUpperCase()),'number']);
 }
 return spec.map(([id,label,type])=>{const safe='calcField_'+id; if(type==='textarea')return `<textarea id="${safe}" class="full" placeholder="${esc(label)}"></textarea>`;if(type.startsWith('select:'))return `<select id="${safe}" class="full"><option value="">${esc(label)}</option>${type.slice(7).split(',').map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')}</select>`;return `<input id="${safe}" class="full" type="${type}" placeholder="${esc(label)}">`;}).join('');
}
function legacy_calculator_v40(){const first=CALCULATOR_CATALOG.quick[0];return `<h1>Calculator & Tools</h1><p class="muted">108 calculators · dedicated inputs · Nepal units · history and favorites persist locally.</p><div class="grid">${card('Calculator',`<div class="form"><select id="calcTool" class="full" onchange="renderCalculatorTool()">${calcToolOptions()}</select><div id="calcFields" class="form full"></div><button class="primary full" onclick="runCalculator()">Calculate</button></div><div id="calcHint" class="muted" style="margin-top:10px"></div><div id="calcResult" class="metric">—</div><div class="actions"><button onclick="saveCalcResult()">Save Result</button><button onclick="favoriteCalc()">Favorite</button></div>`,'span8')}${card('History & Favorites',`<div id="calcHistoryList" class="list">${(state.calcHistory||[]).slice(-20).reverse().map(x=>`<div class="row"><span><b>${esc(x.tool)}</b><div class="muted">${esc(x.result)}</div></span></div>`).join('')||'<span class="muted">No calculations yet.</span>'}</div><div class="muted" style="margin-top:10px">Favorites: ${esc((state.calcFavorites||[]).join(', ')||'None')}</div>`,'span4')}</div><div class="grid" style="margin-top:12px">${Object.entries(CALCULATOR_CATALOG).map(([g,items])=>card(esc(g),`<div class="chips">${items.map(x=>`<button onclick="selectCalculatorTool('${esc(x)}')">${esc(x)}</button>`).join('')}</div>`,'span4')).join('')}</div>`}
function selectCalculatorTool(tool){const el=document.getElementById('calcTool');if(!el)return;el.value=tool;renderCalculatorTool()}
function renderCalculatorTool(){const t=document.getElementById('calcTool')?.value||'Basic';const fields=document.getElementById('calcFields');if(fields)fields.innerHTML=calcFieldHtml(t);const hints={Basic:'A operator B',Scientific:'Use sqrt(), abs(), log(), ln(), pow(), sin(), cos(), tan()',BMI:'Weight kg + height metres',TDEE:'BMR + activity level',Macros:'Calories + protein/carb/fat %',Age:'Birth date + optional as-of date'};const h=document.getElementById('calcHint');if(h)h.textContent=hints[t]||'Enter the required values above.';const g=Object.entries(CALCULATOR_CATALOG).find(([,items])=>items.includes(t));if(g)selectCalcCategory(g[0]);}
function calcRawValues(){return [...document.querySelectorAll('#calcFields [id^="calcField_"]')].map(el=>el.value??'');}
function calcNum(v){if(v===''||v==null)return undefined;const n=Number(v);return Number.isFinite(n)?n:v}
function calcUnitArgs(tool,raw){let factors;if(tool==='Gold Weight Converter')factors=CALC_UNIT_FACTORS.Gold;else if(tool==='Data Size')factors={B:1,KB:1024,MB:1024**2,GB:1024**3,TB:1024**4};else if(tool==='Temperature')return [calcNum(raw[0]),raw[1],raw[2]];else if(tool.startsWith('Nepal ')){const map={'Nepal Land':NP_UNITS.land,'Nepal Length':NP_UNITS.length,'Nepal Volume':NP_UNITS.volume,'Nepal Weight':NP_UNITS.weight};factors=map[tool];}else factors=CALC_UNIT_FACTORS[tool];return [calcNum(raw[0]),raw[1],raw[2],factors];}
function calcInvoke(tool,raw){const m=CALC_METHODS[tool],args=[];if(tool==='Basic')return calculatorEngine.basic(calcNum(raw[0]),raw[1],calcNum(raw[2]));if(tool==='Scientific')return calculatorEngine.scientific(raw[0]);if(tool==='Average')return calculatorEngine.average(String(raw[0]||'').split(',').map(x=>Number(x.trim())).filter(Number.isFinite));if(['Length','Weight','Area','Volume','Speed','Time','Energy','Pressure','Power','Nepal Land','Nepal Length','Nepal Volume','Nepal Weight'].includes(tool))return calculatorEngine.unit(...calcUnitArgs(tool,raw));if(tool==='Gold Weight Converter')return calculatorEngine.goldWeightConverter(calcNum(raw[0]),raw[1],raw[2]);if(tool==='Data Size')return calculatorEngine.dataSize(calcNum(raw[0]),raw[1],raw[2]);if(tool==='Temperature')return calculatorEngine.temperature(calcNum(raw[0]),raw[1],raw[2]);if(tool==='Karat ↔ Purity')return calculatorEngine.karatPurity(calcNum(raw[0]),raw[1]||'karatToPurity');if(tool==='Bitwise')return calculatorEngine.bitwise(calcNum(raw[0]),raw[1],calcNum(raw[2]));if(tool==='IP / Subnet')return calculatorEngine.ipSubnet(raw[0],calcNum(raw[1]));if(tool==='BMR')return calculatorEngine.bmr(calcNum(raw[0]),calcNum(raw[1]),calcNum(raw[2]),raw[3]||'male');if(tool==='TDEE'||tool==='Calories')return calculatorEngine[m](calcNum(raw[0]),raw[1]||'sedentary');if(tool==='Body Fat')return calculatorEngine.bodyFat(calcNum(raw[0]),calcNum(raw[1]),calcNum(raw[2]),raw[3]||'male');if(tool==='Age')return calculatorEngine.age(raw[0],raw[1]||new Date());if(tool==='Date Difference')return calculatorEngine.dateDifference(raw[0],raw[1]);if(tool==='Countdown')return calculatorEngine.countdown(raw[0],raw[1]||new Date());if(tool==='Working Days')return calculatorEngine.workingDays(raw[0],raw[1]);if(tool==='Date Add / Subtract')return calculatorEngine.dateAdd(raw[0],calcNum(raw[1]));if(tool==='Time Difference')return calculatorEngine.timeDifference(raw[0],raw[1]);if(tool==='Weekday')return calculatorEngine.weekday(raw[0]);if(tool==='Unix Timestamp')return calculatorEngine.unixTimestamp(raw[0]||new Date());if(tool==='Timezone Offset')return calculatorEngine.timezoneOffset(calcNum(raw[0]),calcNum(raw[1]||0));if(tool==='Travel Time Zone')return calculatorEngine.travelTimezone(calcNum(raw[0]),calcNum(raw[1]),calcNum(raw[2]));for(const v of raw){if(v!==''&&v!=null)args.push(calcNum(v));}return calculatorEngine[m](...args);}
function runCalculator(){try{const t=document.getElementById('calcTool').value,raw=calcRawValues(),result=calcInvoke(t,raw),text=typeof result==='object'?JSON.stringify(result):String(result);document.getElementById('calcResult').textContent=text;state.calcHistory=Array.isArray(state.calcHistory)?state.calcHistory:[];state.calcHistory.push({id:uid(),tool:t,args:raw,result:text,createdAt:Date.now()});state.calcHistory=state.calcHistory.slice(-500);db.save();document.getElementById('calcHistoryList').innerHTML=state.calcHistory.slice(-20).reverse().map(x=>`<div class="row"><span><b>${esc(x.tool)}</b><div class="muted">${esc(x.result)}</div></span></div>`).join('');}catch(e){document.getElementById('calcResult').textContent='Error: '+(e?.message||e)}}
function saveCalcResult(){const r=document.getElementById('calcResult')?.textContent;if(!r||r==='—')return toast('Calculate first');state.calcHistory=Array.isArray(state.calcHistory)?state.calcHistory:[];state.calcHistory.unshift({id:uid(),tool:document.getElementById('calcTool').value,result:r,createdAt:Date.now()});state.calcHistory=state.calcHistory.slice(0,500);db.save();toast('Result saved')}
function favoriteCalc(){const t=document.getElementById('calcTool')?.value;if(!t)return;state.calcFavorites=Array.isArray(state.calcFavorites)?state.calcFavorites:[];if(!state.calcFavorites.includes(t))state.calcFavorites.push(t);db.save();toast('Calculator favorite saved')}

/* Original-index Notes / Journal / Focus presentation layer — consolidated into v4 data/services. */
function masterNoteColor(c){const e=document.getElementById('noteEditor');if(e)e.style.background=c||'#fff8c5';const p=document.getElementById('noteCustomColor');if(p)p.value=c||'#fff8c5'}
function masterJournalColor(c){const e=document.getElementById('journalEditor');if(e)e.style.background=c||'#fff8c5';const p=document.getElementById('journalCustomColor');if(p)p.value=c||'#fff8c5'}
function notes(){return `<div class="note-grid"><div class="card note-editor" id="noteEditorCard"><h2>📝 Detailed Note</h2><p class="muted">Title, category, rich text, point-wise details और images के साथ पूरा note लिखें.</p><div class="form"><input id="noteTitle" placeholder="Note title"><input id="noteTags" placeholder="Tags: idea, meeting"><div class="two"><select id="noteCategory" onchange="if(this.value==='__manual__'){document.getElementById('noteCategoryManual').disabled=false;document.getElementById('noteCategoryManual').focus()}else{document.getElementById('noteCategoryManual').disabled=true;document.getElementById('noteCategoryManual').value=''}"><option value="">Select notebook / category</option><option value="Personal">Personal</option><option value="Work">Work</option><option value="Learning">Learning</option><option value="Ideas">Ideas</option><option value="Meeting">Meeting</option><option value="Projects">Projects</option><option value="Reference">Reference</option><option value="__manual__">✍️ Manual entry</option></select><input id="noteCategoryManual" placeholder="Manual notebook / category" disabled></div><div class="full color-line"><span class="label">Color</span><input id="noteCustomColor" class="color-input" type="color" value="#fff8c5" onchange="masterNoteColor(this.value)"><span class="label">Any color</span></div><div class="full"><div class="theme-grid"><button class="swatch" style="background:#fff8c5" onclick="masterNoteColor('#fff8c5')"></button><button class="swatch" style="background:#f0edff" onclick="masterNoteColor('#f0edff')"></button><button class="swatch" style="background:#e9f8ef" onclick="masterNoteColor('#e9f8ef')"></button><button class="swatch" style="background:#eaf3ff" onclick="masterNoteColor('#eaf3ff')"></button><button class="swatch" style="background:#ffeef0" onclick="masterNoteColor('#ffeef0')"></button><button class="swatch" style="background:#fff" onclick="masterNoteColor('#fff')"></button></div></div><div class="full"><div class="rich-toolbar"><button type="button" onclick="execRich('bold')"><b>B</b></button><button type="button" onclick="execRich('italic')"><i>I</i></button><button type="button" onclick="execRich('underline')"><u>U</u></button><button type="button" onclick="execRich('insertUnorderedList')">• List</button><button type="button" onclick="execRich('justifyLeft')">←</button><button type="button" onclick="execRich('justifyCenter')">↔</button><button type="button" onclick="execRich('justifyRight')">→</button><select onchange="execRich('fontSize',this.value);this.selectedIndex=0"><option>Size</option><option value="2">Small</option><option value="3">Normal</option><option value="5">Large</option><option value="7">Huge</option></select><input type="color" value="#202124" onchange="execRich('foreColor',this.value)" title="Font color"></div><div id="noteEditor" class="rich-editor" contenteditable="true"></div></div><textarea id="notePoints" class="full" placeholder="Point-wise notes — हर line एक point"></textarea><div class="full"><b>🖼️ Add Images / Files</b><input id="noteFiles" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" multiple onchange="previewMasterNoteFiles(this)"><div id="noteFilesPreview" class="attachment-list"></div></div><button class="btn primary full" onclick="addNote()">Save Note</button></div></div><div class="card"><h2>🔎 Search Notes</h2><input id="noteSearch" placeholder="Search title, text, tag..." oninput="renderNoteList()"><div id="noteQuickTags" class="chips" style="margin-top:10px"></div></div></div><div class="card" style="margin-top:16px"><div id="noteList"></div></div>`}
function masterNoteCategory(){const s=document.getElementById('noteCategory'),m=document.getElementById('noteCategoryManual');if(s?.value==='__manual__')return (m?.value||'').trim()||'General';return (s?.value||'').trim()||'General'}
async function previewMasterNoteFiles(input){const p=document.getElementById('noteFilesPreview');if(!p)return;p.innerHTML=[...(input?.files||[])].slice(0,8).map(f=>`<span class="attachment-chip">📎 ${esc(f.name)}</span>`).join('')}
async function addNote(){const title=document.getElementById('noteTitle')?.value.trim();const body=document.getElementById('noteEditor')?.innerText.trim()||'';const points=document.getElementById('notePoints')?.value.trim()||'';const files=document.getElementById('noteFiles');if(!title&&!body&&!points&&!(files?.files?.length))return toast('Note में content या image/file जोड़ें');const id=uid();const attachments=await storeFiles(files,'note',id);state.notes.unshift({id,title:title||'Untitled',body,html:richSanitize(document.getElementById('noteEditor')?.innerHTML||''),points,category:masterNoteCategory(),tags:document.getElementById('noteTags')?.value.trim()||'',color:document.getElementById('noteCustomColor')?.value||'#fff8c5',date:today(),attachments,createdAt:Date.now(),updatedAt:Date.now()});await db.save();render();toast('Note saved')}
async function renderNoteList(){const el=document.getElementById('noteList');if(!el)return;const q=(document.getElementById('noteSearch')?.value||'').trim().toLowerCase();const all=state.notes.slice().reverse().filter(x=>!q||[x.title,x.body,x.points,x.tags,x.category,x.date].map(v=>String(v||'')).join(' ').toLowerCase().includes(q));const cats=[...new Set(state.notes.map(x=>String(x.category||'General')).filter(Boolean))].slice(0,30);const qt=document.getElementById('noteQuickTags');if(qt)qt.innerHTML=cats.map(x=>`<button onclick="document.getElementById('noteSearch').value='${esc(x)}';renderNoteList()">${esc(x)}</button>`).join('');el.innerHTML=all.length?`<div class="grid g3">${all.slice(0,150).map(x=>`<article class="note-card" style="background:${/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#fff8c5'}"><div class="between"><div><div class="title">${esc(x.title||'Untitled')}</div><div class="meta">${esc(x.date||'')} · ${esc(x.category||'General')} ${String(x.tags||'').split(',').filter(Boolean).map(t=>`<span class="tag">#${esc(t.trim())}</span>`).join(' ')}</div></div><div><button onclick="crudEdit('note','${x.id}')">Edit</button><button class="danger" onclick="deleteNote('${x.id}')">Delete</button></div></div>${x.html?`<div class="prose" style="margin-top:10px">${richSanitize(x.html)}</div>`:`<p style="white-space:pre-wrap;line-height:1.5">${esc(x.body||'')}</p>`}${x.points?`<ul class="points">${String(x.points).split(/\r?\n/).filter(Boolean).map(p=>`<li>• ${esc(p.replace(/^[-•*]\s*/,''))}</li>`).join('')}</ul>`:''}${fileListHtml(x.attachments||[])}${(x.attachments||[]).map(id=>`<button onclick="openAttachment('${id}')">Open</button>`).join(' ')}</article>`).join('')}</div>${all.length>150?`<div class="meta" style="padding:10px">Showing 150 of ${all.length}. Search to narrow the list.</div>`:''}`:'<div class="meta" style="padding:22px;text-align:center">कोई note नहीं।</div>'}
function journal(){return `<div class="two"><div class="card" id="journalEditorCard"><h2>📔 Detailed Daily Journal</h2><p class="muted">आज की पूरी घटना, विचार, सीख और memories यहाँ विस्तार से लिखें.</p><div class="form"><input id="journalTitle" placeholder="Journal title"><input id="journalDate" type="date" value="${today()}"><div class="full color-line"><span class="label">Note Theme</span><input id="journalCustomColor" class="color-input" type="color" value="#fff8c5" onchange="masterJournalColor(this.value)"><span class="label">Any color</span></div><div class="full"><div class="theme-grid"><button class="swatch" style="background:#fff8c5" onclick="masterJournalColor('#fff8c5')"></button><button class="swatch" style="background:#f0edff" onclick="masterJournalColor('#f0edff')"></button><button class="swatch" style="background:#e9f8ef" onclick="masterJournalColor('#e9f8ef')"></button><button class="swatch" style="background:#eaf3ff" onclick="masterJournalColor('#eaf3ff')"></button><button class="swatch" style="background:#ffeef0" onclick="masterJournalColor('#ffeef0')"></button><button class="swatch" style="background:#fff" onclick="masterJournalColor('#fff')"></button></div></div><div class="full"><div class="rich-toolbar"><button type="button" onclick="execRich('bold')"><b>B</b></button><button type="button" onclick="execRich('italic')"><i>I</i></button><button type="button" onclick="execRich('underline')"><u>U</u></button><button type="button" onclick="execRich('insertUnorderedList')">• List</button><button type="button" onclick="execRich('justifyLeft')">←</button><button type="button" onclick="execRich('justifyCenter')">↔</button><button type="button" onclick="execRich('justifyRight')">→</button><select onchange="execRich('fontSize',this.value);this.selectedIndex=0"><option>Size</option><option value="2">Small</option><option value="3">Normal</option><option value="5">Large</option><option value="7">Huge</option></select><input type="color" value="#202124" onchange="execRich('foreColor',this.value)" title="Font color"></div><div id="journalEditor" class="rich-editor" contenteditable="true"></div></div><div class="full"><b>📎 Photo / File</b><input type="file" id="journalFiles" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"><div id="journalFilesPreview" class="attachment-list"></div></div><button class="primary full" onclick="addJournal()">Save Journal</button></div></div><div class="card"><h2>📚 Journal Entries</h2><p class="muted">Daily memories, notes और attachments.</p></div></div><div class="card" style="margin-top:16px"><div class="grid g3">${state.journal.slice().reverse().slice(0,150).map(x=>`<article class="note-card" style="background:${/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#fff8c5'}"><div class="between"><div><b>${esc(x.title||'Daily Journal')}</b><div class="meta">${esc(x.date||'')}</div></div><div><button onclick="crudEdit('journal','${x.id}')">Edit</button><button class="danger" onclick="deleteJournal('${x.id}')">Delete</button></div></div><div style="line-height:1.6;margin-top:10px">${x.html?richSanitize(x.html):esc(x.text||'')}</div>${fileListHtml(x.attachments||[])}${(x.attachments||[]).map(id=>`<button onclick="openAttachment('${id}')">Open</button>`).join(' ')}</article>`).join('')||'<div class="muted">अभी कोई journal entry नहीं।</div>'}</div></div>`}
async function addJournal(){const title=document.getElementById('journalTitle')?.value.trim()||'Daily Journal';const id=uid();const attachments=await storeFiles(document.getElementById('journalFiles'),'journal',id);const html=richSanitize(document.getElementById('journalEditor')?.innerHTML||'');state.journal.unshift({id,title,text:document.getElementById('journalEditor')?.innerText.trim()||'',html,date:document.getElementById('journalDate')?.value||today(),color:document.getElementById('journalCustomColor')?.value||'#fff8c5',attachments,createdAt:Date.now(),updatedAt:Date.now()});await db.save();render();toast('Journal saved')}
let masterFocusSeconds=25*60,masterFocusRemaining=25*60,masterFocusTimer=null;
function focus(){const total=state.focus.reduce((a,x)=>a+Number(x.durationSeconds||Number(x.minutes||0)*60),0),mins=Math.floor(masterFocusRemaining/60),secs=masterFocusRemaining%60;return `<div class="card focus-shell"><div class="eyebrow">FOCUS MODE</div><h2>Deep work, one session at a time</h2><div class="focus-clock">${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}</div><div class="focus-presets">${[25,50,90].map(m=>`<button class="secondary ${masterFocusSeconds===m*60?'active':''}" onclick="setFocus(${m})">${m} min</button>`).join('')}</div><div class="focus-custom" style="margin:16px auto 0;max-width:420px"><div class="row" style="justify-content:center;gap:8px"><label style="display:flex;flex-direction:column;gap:5px;text-align:left;font-size:12px"><span>Minutes</span><input id="focusMinutes" type="number" min="0" max="180" step="1" value="${Math.floor(masterFocusSeconds/60)}" style="width:110px"></label><label style="display:flex;flex-direction:column;gap:5px;text-align:left;font-size:12px"><span>Seconds</span><input id="focusSeconds" type="number" min="0" max="59" step="1" value="${masterFocusSeconds%60}" style="width:110px"></label><button class="secondary" onclick="applyFocusCustom()" style="margin-top:18px">Set Time</button></div><div class="meta" style="margin-top:7px">Apna exact focus time set kar sakte ho — minutes + seconds.</div></div><div class="row" style="justify-content:center;margin-top:15px"><button class="primary" onclick="toggleFocus()">${masterFocusTimer?'Pause':'Start Focus'}</button><button class="secondary" onclick="resetFocus()">Reset</button></div><div class="focus-stats"><div class="focus-stat"><b>${Math.floor(total/60)}</b><br><span class="meta">Minutes focused</span></div><div class="focus-stat"><b>${state.focus.length}</b><br><span class="meta">Sessions</span></div><div class="focus-stat"><b>${state.focus.filter(x=>String(x.date||'').slice(0,10)===today()).length}</b><br><span class="meta">Today</span></div></div></div><div class="card" style="margin-top:16px"><h2>Recent Focus Sessions</h2><div class="list">${state.focus.slice().reverse().slice(0,10).map(x=>{const ss=Number(x.durationSeconds||Number(x.minutes||0)*60),mm=Math.floor(ss/60),rs=ss%60;return `<div class="item"><b>${mm} min ${String(rs).padStart(2,'0')} sec</b><div class="meta">${esc(x.date||'')} · ${esc(x.label||'Focus session')}</div></div>`}).join('')||'<div class="empty">अभी कोई session नहीं।</div>'}</div></div>`}
function setFocus(m){
  if(focusRuntime())return toast('⏱️ Finish or cancel the current focus session before changing the time');
  const minutes=Math.max(1,Math.min(1440,Number(m)||25));
  masterFocusSeconds=minutes*60;masterFocusRemaining=masterFocusSeconds;render();
}
function applyFocusCustom(){
  if(focusRuntime())return toast('⏱️ Finish or cancel the current focus session before changing the time');
  const m=Math.max(0,Math.min(1440,Number(document.getElementById('focusMinutes')?.value)||0));
  const s=Math.max(0,Math.min(59,Number(document.getElementById('focusSeconds')?.value)||0));
  const total=m*60+s;
  if(total<1)return toast('⏱️ Set at least 1 second');
  masterFocusSeconds=total;masterFocusRemaining=total;render();
}
function toggleFocus(){
  const rt=focusRuntime();
  if(rt?.running)return pauseFocus();
  if(rt)return resumeFocus();
  return startFocus();
}
function resetFocus(){
  if(focusRuntime())return cancelFocus();
  masterFocusRemaining=masterFocusSeconds;render();
}
function render(){const c=document.getElementById('content');const f={dashboard:dashboard,tasks:tasks,routine:routine,goals:goals,focus:focus,notes:notes,journal:journal,finance:finance,calculator:calculator,health:health,work:work,people:people,spiritual:spiritual,things:things,settings:settings}[state.active];c.innerHTML=f?f():'';if(state.active==='dashboard'){const cards=[...c.querySelectorAll('.card')];const a=cards.find(el=>el.textContent.includes('Achievements'));if(a)a.setAttribute('data-dashboard-achievements','true')}setTimeout(()=>{if(state.active==='calculator'&&typeof renderCalculatorTool==='function')renderCalculatorTool();if(state.active==='notes'&&typeof renderNoteList==='function')renderNoteList();scheduleUltimateLayout()},0);setTimeout(bindDraftAutosave,0)}
let runtimeRevision=0;
let financeSummaryCache=null;
function financeSummary(){
 const cacheKey=`${db.mutationEpoch||0}:${runtimeRevision}:${state.finance?.length||0}:${state.financeAccounts?.length||0}:${state.investments?.length||0}:${state.loans?.length||0}:${state.assets?.length||0}:${state.liabilities?.length||0}:${state.savingsPlans?.length||0}`;
 if(financeSummaryCache?.key===cacheKey)return financeSummaryCache.value;
 const tx=Array.isArray(state.finance)?state.finance:[];
 let income=0,expense=0,investment=0,loanIn=0,repay=0,principalRepay=0,transfer=0;
 for(const x of tx){const n=Math.max(0,Number(x?.amount||0));switch(x?.type){case 'income':income+=n;break;case 'expense':expense+=n;break;case 'investment':investment+=n;break;case 'loan':loanIn+=n;break;case 'repayment':repay+=n;principalRepay+=Math.max(0,Number(x?.principal??n));break;case 'transfer':transfer+=n;break;}}
 const investmentValue=(state.investments||[]).reduce((a,x)=>a+Math.max(0,Number(x.currentValue??x.amount??0)),0);
 const cash=(state.financeAccounts||[]).reduce((a,x)=>a+Number(x.balance||0),0);
 const manualAssets=(state.assets||[]).reduce((a,x)=>a+Math.max(0,Number(x.value||0)),0);
 const trackedSavings=(state.savingsPlans||[]).reduce((a,x)=>a+Math.max(0,Number(x.currentAmount||0)),0);
 const loanLiabilities=(state.loans||[]).reduce((a,x)=>a+Math.max(0,Number(x.outstanding??x.principal??0)),0);
 const manualLiabilities=(state.liabilities||[]).reduce((a,x)=>a+Math.max(0,Number(x.amount||0)),0);
 const assets=cash+investmentValue+manualAssets;
 const liabilities=loanLiabilities+manualLiabilities;
 const operatingCashFlow=income-expense;
 const investingCashFlow=-investment;
 const financingCashFlow=loanIn-principalRepay;
 const cashFlow=operatingCashFlow+investingCashFlow+financingCashFlow;
 const value={income,expense,investment,loanIn,repay,principalRepay,transfer,operatingCashFlow,investingCashFlow,financingCashFlow,cashFlow,cash,investmentValue,manualAssets,trackedSavings,loanLiabilities,manualLiabilities,assets,liabilities,netWorth:assets-liabilities};
 financeSummaryCache={key:cacheKey,value};
 return value;
}
function financeReportRows(){
 const f=financeSummary();
 return [
  ['Operating cash flow',f.operatingCashFlow],['Investing cash flow',f.investingCashFlow],['Financing cash flow',f.financingCashFlow],
  ['Net cash flow',f.cashFlow],['Cash / accounts',f.cash],['Investments at current value',f.investmentValue],['Manual assets',f.manualAssets],
  ['Tracked savings (not added to net worth)',f.trackedSavings],['Loans outstanding',f.loanLiabilities],['Other liabilities',f.manualLiabilities],['Net worth',f.netWorth]
 ];
}

const RENDER_PAGE_SIZE=200;
function latestRows(list,limit=RENDER_PAGE_SIZE){
  const a=Array.isArray(list)?list:[],n=Math.max(0,Math.min(Number(limit)||RENDER_PAGE_SIZE,a.length));
  const out=[];
  for(let i=a.length-1;i>=0&&out.length<n;i--)out.push(a[i]);
  return out;
}
function renderWindow(list,renderer,containerId,limit=RENDER_PAGE_SIZE,label='records'){
  const a=Array.isArray(list)?list:[];
  const rows=latestRows(a,limit);
  const more=a.length>limit?`<div class="actions" style="justify-content:center"><button onclick="expandList('${containerId}',${Math.min(a.length,limit+RENDER_PAGE_SIZE)})">Load older ${label} (${a.length-limit} remaining)</button></div>`:'';
  return rows.map(renderer).join('')+more;
}
function expandList(containerId,limit){
  const el=document.getElementById(containerId);if(!el)return;
  const type=el.dataset.listType;
  const renderers=window.OmLifeOSListRenderers||{};
  const next=Math.max(RENDER_PAGE_SIZE,Number(limit)||RENDER_PAGE_SIZE);
  if(renderers[type]){
    el.innerHTML=renderers[type](Math.min(next,1000));
    if(next>=1000&&el.dataset.largeListNotice!=='1'){
      el.dataset.largeListNotice='1';
      const note=document.createElement('div');note.className='muted';note.style.textAlign='center';
      note.textContent='Showing up to 1,000 recent records. Use Global Search to find older records.';
      el.appendChild(note);
    }
  }
}
window.OmLifeOSListRenderers={};
function legacy_dashboard_v40(){const f=financeSummary();return `<h1>Dashboard</h1><p>Today: ${today()} · local-first · UI never waits for cloud</p><div class="grid"><div class="card span3">Tasks<div class="metric">${state.tasks.filter(x=>!x.done).length}/${state.tasks.length}</div></div><div class="card span3">Goals<div class="metric">${state.goals.length}</div></div><div class="card span3">Notes<div class="metric">${state.notes.length}</div></div><div class="card span3">Net cash flow<div class="metric">₹${Number(f.cashFlow||0).toFixed(2)}</div></div>${card('Today',`${state.tasks.filter(x=>!x.done&&(x.dueAt||x.date||'')===today()).slice(0,20).map(x=>`<div class="row"><span>${esc(x.title)}</span><button onclick="show('tasks')">Open</button></div>`).join('')||'<span class="muted">No pending tasks for today.</span>'}`,'span6')}${card('Strategy & Life',`<div class="row"><span>Milestones</span><b>${state.milestones.length}</b></div><div class="row"><span>Strategies</span><b>${state.strategies.length}</b></div><div class="row"><span>Health activities</span><b>${state.healthActivities.length}</b></div><div class="row"><span>Relationships</span><b>${state.relationships.length}</b></div>`,'span6')}${globalServices()}</div>`}
function legacy_tasks_v40(){
  window.OmLifeOSListRenderers.tasks=(limit=RENDER_PAGE_SIZE)=>latestRows(state.tasks,limit).map(x=>`<div class="row"><div><div class="title">${x.done?'✓ ':''}${esc(x.title)}</div><span class="muted">${esc(x.domain)} · ${esc(x.date||x.dueAt||'')} · ${esc(x.priority)}</span></div><div class="actions"><button onclick="toggleTask('${x.id}')">${x.done?'Undo':'Done'}</button><button onclick="crudEdit('task','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('task','${x.id}')">Delete</button></div></div>`).join('')+(state.tasks.length>limit?`<div class="actions" style="justify-content:center"><button onclick="expandList('taskList',${Math.min(state.tasks.length,limit+RENDER_PAGE_SIZE)})">Load older tasks (${state.tasks.length-limit} remaining)</button></div>`:'');
  return `<h1>Tasks & Planner</h1><div class="grid">${card('Add Task',`<div class="form"><input id="taskTitle" placeholder="Task title"><select id="taskDomain"><option>personal</option><option>work</option><option>health</option><option>finance</option><option>spiritual</option><option>social</option></select><input id="taskDate" type="date" value="${today()}"><input id="taskTime" type="time"><select id="taskPriority"><option>High</option><option>Medium</option><option>Low</option></select><input class="full" id="taskDesc" placeholder="Description"><button class="primary full" onclick="addTask()">Add Task</button></div>`,'span4')}${card('Task List',`<div id="taskList" class="list" data-list-type="tasks">${window.OmLifeOSListRenderers.tasks()}</div>`,'span8')}</div>`;
}
function addTask(){const title=document.getElementById('taskTitle').value.trim();if(!title)return toast('Task title required');state.tasks.push({id:uid(),title,domain:taskDomain.value,date:taskDate.value,dueAt:taskDate.value,scheduledAt:taskDate.value,projectId:document.getElementById('taskProjectId')?.value.trim()||null,goalId:document.getElementById('taskGoalId')?.value||null,priority:taskPriority.value,description:taskDesc.value,done:false,status:'open',createdAt:Date.now(),updatedAt:Date.now()});db.save();render();toast('Task added')}
function toggleTask(id){const x=state.tasks.find(x=>x.id===id);if(x)x.done=!x.done;db.save();render()}
function legacy_routine_v40(){return `<h1>Routine & Habits</h1><div class="grid">${card('Routine',`<div class="form"><input id="routineName" placeholder="Routine name"><input id="routineTime" type="time"><button class="primary full" onclick="addRoutine()">Add Routine</button></div>`,'span6')}${card('Habit',`<div class="form"><input id="habitName" placeholder="Habit name"><button class="primary full" onclick="addHabit()">Add Habit</button></div>`,'span6')}${card('Today',`<div class="list">${latestRows(state.routines,RENDER_PAGE_SIZE).map(x=>`<div class="row"><span>${esc(x.name)} <span class="muted">${x.time||''}</span></span><div class="actions"><button onclick="crudEdit('routine','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('routine','${x.id}')">Delete</button></div></div>`).join('')}${latestRows(state.habits,RENDER_PAGE_SIZE).map(x=>`<div class="row"><span>${esc(x.name)}</span><div class="actions"><button onclick="logHabit('${x.id}')">${x.doneDate===today()?'✓ Done':'Log'}</button><button onclick="crudEdit('habit','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('habit','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No routines/habits yet.</span>'}</div>`,'span12')}${extendedRoutineHtml()}</div>`}
function addRoutine(){const n=(document.getElementById('routineName')?.value||'').trim();if(!n)return toast('Enter a routine name');const start=document.getElementById('routineStart')?.value||document.getElementById('routineTime')?.value||'';const end=document.getElementById('routineEnd')?.value||'';const frequency=document.getElementById('routineFreq')?.value||'daily';const category=document.getElementById('routineCategory')?.value||'personal';const note=document.getElementById('routineNote')?.value||'';state.routines.push({id:uid(),name:n,time:start,startTime:start,endTime:end,frequency,category,note,active:true,createdAt:Date.now(),updatedAt:Date.now()});db.save();render();toast('Routine time block saved')}function addHabit(){const n=(document.getElementById('habitName')?.value||'').trim();if(!n)return toast('Enter a habit name');const frequency=(document.getElementById('habitFrequency')?.value||'daily').trim()||'daily';const timesPerDay=Math.max(1,Math.min(12,Number(document.getElementById('habitTimesPerDay')?.value||1)));const times=Array.from({length:timesPerDay},(_,i)=>document.getElementById('habitTime'+i)?.value||'').filter((x,i)=>i<timesPerDay);const existing=state.habits.find(x=>String(x.name).toLowerCase()===n.toLowerCase());if(existing){existing.frequency=frequency;existing.timesPerDay=timesPerDay;existing.times=times;existing.updatedAt=Date.now();}else state.habits.push({id:uid(),name:n,frequency,timesPerDay,times,createdAt:Date.now(),updatedAt:Date.now()});db.save();render();toast(existing?'Habit updated':'Habit saved')}function logHabit(id,index=null){const x=state.habits.find(x=>x.id===id);if(!x)return;const d=today();const logs=Array.isArray(state.habitLogs)?state.habitLogs:[];const key=String(id)+'|'+d+'|'+(index==null?'all':index);const at=logs.findIndex(x=>x.key===key);if(at>=0)logs.splice(at,1);else logs.push({id:uid(),key,habitId:id,date:d,occurrence:index==null?'all':Number(index),createdAt:Date.now()});state.habitLogs=logs;x.doneDate=logs.some(l=>l.habitId===id&&l.date===d)?d:null;db.save();render()}
function legacy_goals_v40(){
  window.OmLifeOSListRenderers.goals=(limit=RENDER_PAGE_SIZE)=>latestRows(state.goals,limit).map(x=>`<div class="row"><div><div class="title">${esc(x.title)}</div><span class="muted">${x.progress}% · ${x.date||'No date'}</span></div><div class="actions"><button onclick="progressGoal('${x.id}')">+10%</button><button onclick="crudEdit('goal','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('goal','${x.id}')">Delete</button></div></div>`).join('')+(state.goals.length>limit?`<div class="actions" style="justify-content:center"><button onclick="expandList('goalList',${Math.min(state.goals.length,limit+RENDER_PAGE_SIZE)})">Load older goals (${state.goals.length-limit} remaining)</button></div>`:'');
  return `<h1>Goals & Strategy</h1><div class="grid">${card('Add Goal',`<div class="form"><input id="goalTitle" placeholder="Goal"><input id="goalDate" type="date"><input id="goalProgress" type="number" min="0" max="100" value="0" placeholder="Progress %"><button class="primary full" onclick="addGoal()">Add Goal</button></div>`,'span4')}${card('Goals',`<div id="goalList" class="list" data-list-type="goals">${window.OmLifeOSListRenderers.goals()}</div>`,'span8')}${extendedGoalsHtml()}</div>`;
}function addGoal(){const title=goalTitle.value.trim();if(!title)return;state.goals.push({id:uid(),title,date:goalDate.value,progress:+goalProgress.value||0});db.save();render()}function progressGoal(id){const x=state.goals.find(x=>x.id===id);if(x)x.progress=Math.min(100,x.progress+10);db.save();render()}
let focusTicker=null;
let focusTickerToken=0;
let navigationEpoch=0;
const moduleHydrationFlights=new Map();
function focusRuntime(){return state.settings?.focusRuntime&&typeof state.settings.focusRuntime==='object'?state.settings.focusRuntime:null}
function formatFocusSeconds(sec){sec=Math.max(0,Math.floor(Number(sec)||0));const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60;return h?`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`:`${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`}
function focusElapsed(rt,now=Date.now()){
  if(!rt)return 0;
  const base=Math.max(0,Number(rt.elapsedSeconds)||0);
  const live=rt.running?Math.max(0,(Number(now)||Date.now())-Number(rt.startedAt||now))/1000:0;
  return Math.max(0,Math.min(Number(rt.plannedSeconds)||0,base+live));
}
function stopFocusTicker(){
  focusTickerToken++;
  if(focusTicker){clearInterval(focusTicker);focusTicker=null}
}
function updateFocusDom(remaining){
  const text=formatFocusSeconds(remaining);
  const els=document.querySelectorAll('.focus-image-clock,.focus-clock,#focusRemaining');
  els.forEach(el=>{el.textContent=text});
  const status=document.getElementById('focusStatus');
  if(status)status.textContent=`Running · ${text} remaining`;
}
function startFocusTicker(){
  stopFocusTicker();
  const token=focusTickerToken;
  const tick=()=>{
    if(token!==focusTickerToken)return;
    const rt=focusRuntime();
    if(!rt?.running){stopFocusTicker();return}
    const elapsed=focusElapsed(rt);
    const total=Math.max(0,Number(rt.plannedSeconds)||0);
    const remaining=Math.max(0,total-elapsed);
    masterFocusRemaining=remaining;
    updateFocusDom(remaining);
    if(total>0&&remaining<=0){
      stopFocusTicker();
      finishFocus();
    }
  };
  tick();
  focusTicker=setInterval(tick,250);
}
function persistFocusState(){
  try{const p=db.save();if(p&&typeof p.catch==='function')p.catch(()=>{});}catch(e){console.warn('Focus persistence failed',e)}
}
async function finishFocus(){
  const rt=focusRuntime();
  if(!rt)return;
  const elapsed=Math.max(1,Math.round(focusElapsed(rt)));
  const endedAt=Date.now();
  stopFocusTicker();
  state.focus.push({
    id:uid(),taskId:rt.taskId||null,goalId:rt.goalId||null,
    label:rt.label||'Focus session',durationSeconds:elapsed,
    minutes:Number((elapsed/60).toFixed(2)),
    date:new Date(rt.sessionStartedAt||endedAt).toISOString().slice(0,10),
    startedAt:rt.sessionStartedAt||endedAt,endedAt,note:rt.note||'',
    createdAt:endedAt,updatedAt:endedAt
  });
  state.settings={...(state.settings||{}),focusRuntime:null};
  masterFocusRemaining=masterFocusSeconds;
  persistFocusState();
  render();
  toast('🎯 Focus session saved');
}
async function pauseFocus(){
  const rt=focusRuntime();
  if(!rt?.running)return;
  rt.elapsedSeconds=focusElapsed(rt);
  rt.running=false;
  rt.pausedAt=Date.now();
  state.settings={...(state.settings||{}),focusRuntime:rt};
  stopFocusTicker();
  masterFocusRemaining=Math.max(0,(Number(rt.plannedSeconds)||0)-Number(rt.elapsedSeconds||0));
  persistFocusState();
  render();
}
async function resumeFocus(){
  const rt=focusRuntime();
  if(!rt||rt.running)return;
  const total=Number(rt.plannedSeconds)||0;
  if(Number(rt.elapsedSeconds||0)>=total)return finishFocus();
  rt.startedAt=Date.now();
  rt.running=true;
  rt.pausedAt=null;
  state.settings={...(state.settings||{}),focusRuntime:rt};
  render();
  startFocusTicker();
  persistFocusState();
}
async function cancelFocus(){
  const rt=focusRuntime();
  if(!rt)return;
  stopFocusTicker();
  state.settings={...(state.settings||{}),focusRuntime:null};
  masterFocusRemaining=masterFocusSeconds;
  persistFocusState();
  render();
  toast('Focus session cancelled');
}
function focus(){
  const rt=focusRuntime();
  const total=state.focus.reduce((a,x)=>a+Number(x.durationSeconds||Number(x.minutes||0)*60),0);
  const remaining=rt?Math.max(0,(Number(rt.plannedSeconds)||0)-focusElapsed(rt)):masterFocusSeconds;
  const mins=Math.floor(remaining/60), secs=Math.floor(remaining%60);
  const taskOptions=safeArr('tasks').slice(-100).reverse().map(x=>`<option value="${esc(x.id)}" ${rt?.taskId===x.id?'selected':''}>${esc(x.title)}</option>`).join('');
  const goalOptions=safeArr('goals').slice(-100).reverse().map(x=>`<option value="${esc(x.id)}" ${rt?.goalId===x.id?'selected':''}>${esc(x.title)}</option>`).join('');
  const taskSelect=rt?`<select id="focusTaskId" disabled><option value="">Task (optional)</option>${taskOptions}</select>`:`<select id="focusTaskId"><option value="">Task (optional)</option>${taskOptions}</select>`;
  const goalSelect=rt?`<select id="focusGoalId" disabled><option value="">Goal (optional)</option>${goalOptions}</select>`:`<select id="focusGoalId"><option value="">Goal (optional)</option>${goalOptions}</select>`;
  return `<div class="focus-image-shell">
    <div class="focus-image-card">
      <div class="focus-image-eyebrow">FOCUS MODE</div>
      <h2 class="focus-image-title">Deep work, one session at a time</h2>
      <div class="focus-image-clock">${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}</div>
      <div class="focus-image-presets">
        ${[25,50,90].map(m=>`<button type="button" class="focus-image-preset ${(!rt&&masterFocusSeconds===m*60)?'active':''}" onclick="setFocus(${m})">${m} min</button>`).join('')}
      </div>
      ${!rt?`<div class="focus-image-custom">
        <label class="focus-image-field"><span>Minutes</span><input id="focusMinutes" type="number" min="0" max="1440" step="1" value="${Math.floor(masterFocusSeconds/60)}"></label>
        <label class="focus-image-field"><span>Seconds</span><input id="focusSeconds" type="number" min="0" max="59" step="1" value="${masterFocusSeconds%60}"></label>
        <button type="button" class="focus-image-set" onclick="applyFocusCustom()">Set Time</button>
      </div>
      <div class="focus-image-hint">Apna exact focus time set kar sakte ho — minutes + seconds.</div>`:`<div class="focus-image-running-note">${rt.running?'Focus session is running':'Focus session is paused'}</div>`}
      <div class="focus-image-context">${taskSelect}${goalSelect}</div>
      ${rt?`<div class="focus-image-label">${esc(rt.label||'Focus session')}</div>`:''}
      <div class="focus-image-actions">
        <button type="button" class="focus-image-start" onclick="${rt?(rt.running?'pauseFocus()':'resumeFocus()'):'startFocus()'}">${rt?(rt.running?'Pause':'Resume'):'Start Focus'}</button>
        <button type="button" class="focus-image-reset" onclick="${rt?'cancelFocus()':'resetFocus()'}">${rt?'Cancel':'Reset'}</button>
      </div>
      <div class="focus-image-stats">
        <div class="focus-image-stat"><b>${Math.floor(total/60)}</b><span>Minutes focused</span></div>
        <div class="focus-image-stat"><b>${state.focus.length}</b><span>Sessions</span></div>
        <div class="focus-image-stat"><b>${state.focus.filter(x=>String(x.date||'').slice(0,10)===today()).length}</b><span>Today</span></div>
      </div>
    </div>
    <div class="focus-image-recent">
      <h2>Recent Focus Sessions</h2>
      <div class="list">${state.focus.slice().reverse().slice(0,10).map(x=>{const ss=Number(x.durationSeconds||Number(x.minutes||0)*60),mm=Math.floor(ss/60),rs=ss%60;return `<div class="item"><b>${mm} min ${String(rs).padStart(2,'0')} sec</b><div class="meta">${esc(x.date||'')} · ${esc(x.label||'Focus session')}</div></div>`}).join('')||'<div class="empty">अभी कोई session नहीं।</div>'}</div>
    </div>
  </div>`;
}
async function startFocus(){
  if(focusRuntime()?.running)return;
  const mins=Math.min(1440,Math.max(0,Number(document.getElementById('focusMinutes')?.value)||0));
  const secs=Math.min(59,Math.max(0,Number(document.getElementById('focusSeconds')?.value)||0));
  const totalSeconds=mins*60+secs;
  if(totalSeconds<1)return toast('⏱️ Set at least 1 second');
  const now=Date.now();
  masterFocusSeconds=totalSeconds;
  masterFocusRemaining=totalSeconds;
  state.settings={...(state.settings||{}),focusRuntime:{
    taskId:document.getElementById('focusTaskId')?.value||null,
    goalId:document.getElementById('focusGoalId')?.value||null,
    label:'Focus session',note:'',plannedSeconds:totalSeconds,
    elapsedSeconds:0,startedAt:now,sessionStartedAt:now,running:true,pausedAt:null
  }};
  // Start immediately. Persistence must never block the visible timer.
  render();
  startFocusTicker();
  persistFocusState();
}
function richSanitize(html=''){const box=document.createElement('div');box.innerHTML=String(html||'');const allowed=new Set(['B','STRONG','I','EM','U','S','BR','P','DIV','SPAN','UL','OL','LI','BLOCKQUOTE','IMG']);box.querySelectorAll('*').forEach(el=>{if(!allowed.has(el.tagName)){el.replaceWith(document.createTextNode(el.textContent||''));return}for(const a of [...el.attributes]){if(el.tagName==='IMG'&&a.name==='src'&&/^data:image\/(png|jpe?g|webp);base64,/i.test(a.value))continue;if(a.name==='style'&&/^(color|background-color|font-size|text-align|font-weight|font-style|text-decoration)\s*:/i.test(a.value))continue;el.removeAttribute(a.name)}});return box.innerHTML}
function execRich(cmd,val=null){document.execCommand(cmd,false,val);}
function noteTheme(c){document.getElementById('noteColor').value=c}
function journalTheme(c){document.getElementById('journalColor').value=c}
function fileListHtml(ids=[]){return ids.map(id=>{const a=state.attachments.find(x=>x.id===id);return a?`<div class="attachment"><span>📎 ${esc(a.name)} <small class="muted">(${Math.round(a.size/1024)} KB)</small></span><button class="danger" onclick="removeAttachment('${id}')">Remove</button></div>`:''}).join('')}
async function storeFiles(input,ownerType,ownerId){const files=[...(input?.files||[])];const ids=[];for(const file of files){if(file.size>15*1024*1024){toast(file.name+' is larger than 15 MB');continue}const id=uid();try{await db.putAttachment({id,name:file.name,type:file.type||'application/octet-stream',size:file.size,ownerType,ownerId,createdAt:Date.now(),blob:file});state.attachments.push({id,name:file.name,type:file.type||'',size:file.size,ownerType,ownerId,createdAt:Date.now()});ids.push(id)}catch(e){const q=e?.name==='QuotaExceededError'||e?.code===22||/quota|storage.?full/i.test(String(e?.message||''));toast(q?'⚠️ Storage full — attachment was not saved. Backup/export or free storage first.':`Attachment failed: ${e?.message||'unknown error'}`);break}}return ids}
async function removeAttachment(id){const a=state.attachments.find(x=>x.id===id);if(!a)return;await db.deleteAttachment(id);state.attachments=state.attachments.filter(x=>x.id!==id);for(const r of [...state.notes,...state.journal]){if(Array.isArray(r.attachments))r.attachments=r.attachments.filter(x=>x!==id)}await db.save();render();toast('Attachment removed')}
async function openAttachment(id){const a=await db.getAttachment(id);if(!a?.blob)return toast('Attachment not found');const url=URL.createObjectURL(a.blob);window.open(url,'_blank','noopener');setTimeout(()=>URL.revokeObjectURL(url),10000)}
function draftKey(id){return 'om-lifeos-draft-'+id}
function bindDraftAutosave(){const pairs=[['noteTitle','noteEditor'],['notePoints','notePoints'],['journalTitle','journalEditor']];for(const [a,b] of pairs){const x=document.getElementById(a),y=document.getElementById(b);if(!x||!y||x.dataset.draftBound)return;x.dataset.draftBound='1';const key=draftKey(a);try{const d=JSON.parse(localStorage.getItem(key)||'null');if(d){x.value=d.title||'';if(y.isContentEditable)y.innerHTML=d.html||''}}catch{};const save=()=>{try{localStorage.setItem(key,JSON.stringify({title:x.value,html:y.isContentEditable?y.innerHTML:y.value,at:Date.now()}))}catch{}};x.addEventListener('input',save);y.addEventListener('input',save);}}
function clearDraft(id){try{localStorage.removeItem(draftKey(id))}catch{}}
function noteEditorHtml(){return `<div class="grid">${card('New Note',`<div class="form"><input id="noteTitle" placeholder="Title"><input id="noteCategory" placeholder="Notebook / category" value="General"><input id="noteTags" placeholder="Tags (comma separated)"><input id="noteColor" type="color" value="#fff8c5"><div class="full"><div class="rich-toolbar"><button onclick="execRich('bold')"><b>B</b></button><button onclick="execRich('italic')"><i>I</i></button><button onclick="execRich('underline')"><u>U</u></button><button onclick="execRich('insertUnorderedList')">• List</button><button onclick="execRich('justifyLeft')">←</button><button onclick="execRich('justifyCenter')">↔</button><button onclick="execRich('justifyRight')">→</button><select onchange="execRich('fontSize',this.value)"><option value="3">Size</option><option value="2">Small</option><option value="4">Large</option><option value="6">Huge</option></select><input type="color" onchange="execRich('foreColor',this.value)" title="Text color"></div><div id="noteEditor" class="rich-editor" contenteditable="true"></div></div><textarea class="full" id="notePoints" placeholder="Point-wise notes — one point per line"></textarea><input class="full" id="noteFiles" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"><button class="primary full" onclick="addNote()">Save Note</button></div>`,'span5')}${card('Search / Notes',`<input id="noteSearch" placeholder="Search title, text, tags..." oninput="renderNoteList()"><div class="list" style="margin-top:10px" id="noteList"></div>`,'span7')}</div>`}
function notes(){const notebooks=[...new Set(safeArr('notes').map(x=>String(x.category||'General')).filter(Boolean))];const tags=[...new Set(safeArr('notes').flatMap(x=>String(x.tags||'').split(',').map(t=>t.trim()).filter(Boolean)))];return `${pageHeader('Notes','Rich notes, notebooks, tags, colors, point-wise notes, attachments and fast search.')}${card('📚 Notebooks & Tags',`<div class="chips">${notebooks.map(x=>`<button onclick="document.getElementById('noteSearch').value='${esc(x)}';renderNoteList()">${esc(x)}</button>`).join('')||'<span class="muted">General notebook will appear here.</span>'}</div><div class="chips" style="margin-top:7px">${tags.slice(0,50).map(x=>`<button class="tag" onclick="document.getElementById('noteSearch').value='${esc(x)}';renderNoteList()">#${esc(x)}</button>`).join('')}</div>`,'span12')}${noteEditorHtml()}`}
async function addNote(){
  const title=document.getElementById('noteTitle')?.value.trim();
  if(!title)return toast('Note title required');
  try{
    if(!db.loaded.has('notes')){
      const flight=moduleHydrationFlights.get('notes');
      if(flight) await flight; else await db.hydrate(LAZY_MODULES.notes||['notes']);
    }
    const id=uid();
    const files=document.getElementById('noteFiles');
    const attachments=await storeFiles(files,'note',id);
    const editor=document.getElementById('noteEditor');
    const row={
      id,title,
      body:editor?.innerText||'',
      html:richSanitize(editor?.innerHTML||''),
      points:document.getElementById('notePoints')?.value||'',
      category:document.getElementById('noteCategory')?.value.trim()||'General',
      tags:document.getElementById('noteTags')?.value.trim()||'',
      color:document.getElementById('noteColor')?.value||'#fff8c5',
      date:today(),attachments,createdAt:Date.now(),updatedAt:Date.now()
    };
    if(!Array.isArray(state.notes))state.notes=[];
    state.notes.unshift(row);
    clearDraft('noteTitle');clearDraft('notePoints');
    await db.save();
    await db.saveQueue;
    render();
    setTimeout(()=>{if(typeof renderNoteList==='function')renderNoteList()},0);
    toast('Note saved');
  }catch(e){
    console.error('Note save failed',e);
    toast('Note save failed — please retry');
  }
}
let noteSearchToken=0,noteSearchTimer=null;
async function renderNoteList(){
 const token=++noteSearchToken;clearTimeout(noteSearchTimer);
 const el=document.getElementById('noteList');if(!el)return;
 const q=(document.getElementById('noteSearch')?.value||'').toLowerCase();
 const source=state.notes.slice().reverse(),filtered=[];
 if(!q){filtered.push(...source)}else{
  for(let i=0;i<source.length;i+=250){
   const end=Math.min(source.length,i+250);
   for(let j=i;j<end;j++){const x=source[j],hay=[x.title,x.body,x.points,x.category,x.tags,x.date].map(v=>String(v||'')).join(' ').toLowerCase();if(hay.includes(q))filtered.push(x)}
   if(end<source.length){await new Promise(r=>setTimeout(r,0));if(token!==noteSearchToken)return;}
  }
 }
 if(token!==noteSearchToken||!document.getElementById('noteList'))return;
 const rows=filtered.slice(0,RENDER_PAGE_SIZE);
 const html=rows.map(x=>`<article class="note-card" style="background:${/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#fff8c5'}"><div class="row" style="border:0;padding:0"><div><div class="title">${esc(x.title)}</div><div class="muted">${esc(x.category||'General')} · ${esc(x.date||'')}</div></div><button onclick="crudEdit('note','${x.id}')">Edit</button><button class="danger" onclick="deleteNote('${x.id}')">Delete</button></div><div class="chips">${String(x.tags||'').split(',').map(t=>t.trim()).filter(Boolean).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div><div class="prose" style="margin-top:8px">${x.html?richSanitize(x.html):esc(x.body||'')}</div>${x.points?`<div class="muted" style="margin-top:7px">${esc(x.points)}</div>`:''}${fileListHtml(x.attachments||[])}${(x.attachments||[]).map(id=>`<button onclick="openAttachment('${id}')">Open</button>`).join(' ')}</article>`).join('');
 el.innerHTML=html||'<span class="muted">No notes yet.</span>'+(filtered.length>RENDER_PAGE_SIZE?`<div class="actions" style="justify-content:center"><button onclick="expandNoteList(${Math.min(filtered.length,RENDER_PAGE_SIZE*2)})">Load older notes (${filtered.length-RENDER_PAGE_SIZE} remaining)</button></div>`:'');
}
function expandNoteList(limit){const el=document.getElementById('noteList');if(!el)return;const q=(document.getElementById('noteSearch')?.value||'').toLowerCase();const rows=state.notes.slice().reverse().filter(x=>{if(!q)return true;const hay=[x.title,x.body,x.points,x.category,x.tags,x.date].map(v=>String(v||'')).join(' ').toLowerCase();return hay.includes(q)}).slice(0,Math.min(limit,1000));el.innerHTML=rows.map(x=>`<article class="note-card"><div class="row" style="border:0;padding:0"><div><div class="title">${esc(x.title)}</div><div class="muted">${esc(x.category||'General')} · ${esc(x.date||'')}</div></div><button onclick="crudEdit('note','${x.id}')">Edit</button><button class="danger" onclick="deleteNote('${x.id}')">Delete</button></div><div class="prose" style="margin-top:8px">${x.html?richSanitize(x.html):esc(x.body||'')}</div></article>`).join('')+(rows.length<state.notes.length?`<div class="actions" style="justify-content:center"><button onclick="expandNoteList(${Math.min(rows.length+RENDER_PAGE_SIZE,1000)})">Load older notes</button></div>`:'')}

function journal(){return `<h1>Journal</h1><div class="grid">${card('New Journal Entry',`<div class="form"><input id="journalTitle" placeholder="Journal title"><input id="journalDate" type="date" value="${today()}"><input id="journalColor" type="color" value="#fff8c5"><div class="full"><div class="theme-grid"><button class="swatch" style="background:#fff8c5" onclick="journalTheme('#fff8c5')"></button><button class="swatch" style="background:#f0edff" onclick="journalTheme('#f0edff')"></button><button class="swatch" style="background:#e9f8ef" onclick="journalTheme('#e9f8ef')"></button><button class="swatch" style="background:#eaf3ff" onclick="journalTheme('#eaf3ff')"></button><button class="swatch" style="background:#ffeef0" onclick="journalTheme('#ffeef0')"></button><button class="swatch" style="background:#fff" onclick="journalTheme('#ffffff')"></button></div></div><div class="full"><div class="rich-toolbar"><button onclick="execRich('bold')"><b>B</b></button><button onclick="execRich('italic')"><i>I</i></button><button onclick="execRich('underline')"><u>U</u></button><button onclick="execRich('insertUnorderedList')">• List</button><button onclick="execRich('justifyLeft')">←</button><button onclick="execRich('justifyCenter')">↔</button><button onclick="execRich('justifyRight')">→</button><select onchange="execRich('fontSize',this.value)"><option value="3">Size</option><option value="2">Small</option><option value="4">Large</option><option value="6">Huge</option></select><input type="color" onchange="execRich('foreColor',this.value)" title="Text color"></div><div id="journalEditor" class="rich-editor" contenteditable="true"></div></div><input class="full" id="journalFiles" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"><button class="primary full" onclick="addJournal()">Save Journal</button></div>`,'span5')}${card('Journal History',`<div class="list">${state.journal.slice().reverse().slice(0,RENDER_PAGE_SIZE).map(x=>`<article class="note-card" style="background:${/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#fff8c5'}"><div class="row" style="border:0;padding:0"><div><div class="title">${esc(x.title)}</div><div class="muted">${esc(x.date||'')}</div></div><button onclick="crudEdit('journal','${x.id}')">Edit</button><button class="danger" onclick="deleteJournal('${x.id}')">Delete</button></div><div class="prose" style="margin-top:8px">${x.html?richSanitize(x.html):esc(x.text||'')}</div>${fileListHtml(x.attachments||[])}${(x.attachments||[]).map(id=>`<button onclick="openAttachment('${id}')">Open</button>`).join(' ')}</article>`).join('')||'<span class="muted">No journal entries yet.</span>'}</div>`,'span7')}</div>`}
async function addJournal(){const title=document.getElementById('journalTitle').value.trim()||'Daily Journal';const id=uid();const attachments=await storeFiles(document.getElementById('journalFiles'),'journal',id);const html=richSanitize(document.getElementById('journalEditor').innerHTML);state.journal.push({id,title,text:document.getElementById('journalEditor').innerText,html,date:document.getElementById('journalDate').value||today(),color:document.getElementById('journalColor').value,attachments,createdAt:Date.now(),updatedAt:Date.now()});clearDraft('journalTitle');await db.save();render();toast('Journal saved')}
async function deleteJournal(id){const x=state.journal.find(n=>n.id===id);if(!x)return;for(const a of x.attachments||[])await db.deleteAttachment(a);state.attachments=state.attachments.filter(a=>!(x.attachments||[]).includes(a.id));state.journal=state.journal.filter(n=>n.id!==id);await db.save();render();toast('Journal entry deleted')}
function financeChartHtml(){const f=financeSummary();const vals=[['Income',f.income],['Expenses',f.expense],['Investments',f.investment],['Loan In',f.loanIn],['Repayment',f.repay]];const max=Math.max(1,...vals.map(x=>Math.abs(Number(x[1]||0))));return card('📊 Cash Flow / Finance Overview',`<div class="list">${vals.map(([label,v])=>`<div><div class="between"><span>${label}</span><b>₹${Number(v||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</b></div><div class="progress"><i style="width:${Math.min(100,Math.abs(Number(v||0))/max*100)}%"></i></div></div>`).join('')}</div><p class="muted" style="margin-top:8px">Operating ₹${f.operatingCashFlow.toLocaleString('en-IN',{maximumFractionDigits:0})} · Investing ₹${f.investingCashFlow.toLocaleString('en-IN',{maximumFractionDigits:0})} · Financing ₹${f.financingCashFlow.toLocaleString('en-IN',{maximumFractionDigits:0})}</p>`,'span12')}
function finance(){const f=financeSummary();const acctOptions=latestRows(state.financeAccounts||[]).map(a=>`<option value="${a.id}">${esc(a.name)} · ₹${Number(a.balance||0).toFixed(2)}</option>`).join('');return `<h1>Finance</h1><p class="muted">One owner for money: accounts, transactions, savings, investments, loans, assets, liabilities and financial goals.</p><div class="grid"><div class="card span3">Income<div class="metric">₹${f.income.toFixed(2)}</div></div><div class="card span3">Expenses<div class="metric">₹${f.expense.toFixed(2)}</div></div><div class="card span3">Cash Flow<div class="metric">₹${f.cashFlow.toFixed(2)}</div></div><div class="card span3">Net Worth<div class="metric">₹${f.netWorth.toFixed(2)}</div></div>${financeChartHtml()}${card('Account',`<div class="form"><input id="acctName" placeholder="Bank / Cash / Wallet"><input id="acctBalance" type="number" step="0.01" placeholder="Opening balance"><button class="primary full" onclick="addFinanceAccount()">Add Account</button></div><div class="list" style="margin-top:10px">${latestRows(state.financeAccounts||[]).map(a=>`<div class="row"><span><b>${esc(a.name)}</b><br><span class="muted">${esc(a.type||'cash')}</span></span><span>₹${Number(a.balance||0).toFixed(2)}</span><div class="actions"><button onclick="crudEdit('account','${a.id}')">Edit</button><button class="danger" onclick="crudDelete('account','${a.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No accounts yet.</span>'}</div>`,'span4')}${card('Transaction',`<div class="form"><select id="finType"><option value="expense">Expense</option><option value="income">Income</option><option value="loan">Loan Received</option><option value="investment">Investment</option><option value="repayment">Loan Repayment</option></select><select id="finAccount"><option value="">No account</option>${acctOptions}</select><input id="finAmount" type="number" step="0.01" min="0.01" placeholder="Amount"><input id="finCategory" placeholder="Category"><input id="finDate" type="date" value="${today()}"><input class="full" id="finNote" placeholder="Note"><button class="primary full" onclick="addFinance()">Save Transaction</button></div>`,'span4')}${card('Loan',`<div class="form"><input id="loanName" placeholder="Loan name"><input id="loanPrincipal" type="number" placeholder="Principal"><input id="loanRate" type="number" step="0.01" placeholder="Annual interest %"><input id="loanTenure" type="number" placeholder="Months"><input id="loanDueDay" type="number" min="1" max="31" value="5" placeholder="EMI day"><button class="primary full" onclick="addLoan()">Create Loan</button></div><div class="list" style="margin-top:10px">${latestRows(state.loans||[]).map(l=>`<div class="row"><span><b>${esc(l.name)}</b><br><span class="muted">${l.tenure} mo · ${l.rate}% · EMI ₹${loanEmi(l.principal,l.rate,l.tenure).toFixed(2)}</span></span><span>₹${Number(l.outstanding||l.principal).toFixed(2)}</span><div class="actions"><button onclick="crudEdit('loan','${l.id}')">Edit</button><button class="danger" onclick="crudDelete('loan','${l.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No loans yet.</span>'}</div>`,'span4')}${card('Transfers',`<div class="form"><select id="transferFrom"><option value="">From account</option>${acctOptions}</select><select id="transferTo"><option value="">To account</option>${acctOptions}</select><input id="transferAmount" type="number" min="0.01" step="0.01" placeholder="Amount"><input id="transferDate" type="date" value="${today()}"><input id="transferNote" class="full" placeholder="Note"><button class="primary full" onclick="addFinanceTransfer()">Record Transfer</button></div><div class="muted" style="margin-top:8px">Transfer moves cash between accounts; it is not income, expense, or net-worth gain.</div>`,'span4')}${card('Savings / Investments',`<div class="form"><input id="saveName" placeholder="Savings goal / investment"><input id="saveAmount" type="number" placeholder="Current amount"><input id="saveTarget" type="number" placeholder="Target amount"><input id="saveMonths" type="number" placeholder="Duration months"><button class="primary full" onclick="addSavingsPlan()">Add Savings Plan</button></div><div class="list" style="margin-top:10px">${latestRows(state.savingsPlans||[]).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><br><span class="muted">₹${Number(x.currentAmount||0).toFixed(2)} / ₹${Number(x.targetAmount||0).toFixed(2)}</span></span><span>${savingProgress(x).toFixed(0)}%</span><div class="actions"><button onclick="crudEdit('savings','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('savings','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No savings plans yet.</span>'}</div>`,'span6')}${card('Investments',`<div class="form"><input id="invName" placeholder="Investment name"><input id="invAmount" type="number" placeholder="Invested amount"><input id="invValue" type="number" placeholder="Current value"><select id="invAccount"><option value="">No cash account</option>${acctOptions}</select><input id="invDate" type="date" value="${today()}"><button class="primary full" onclick="addInvestment()">Add Investment</button></div><div class="list" style="margin-top:10px">${latestRows(state.investments||[]).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><br><span class="muted">Invested ₹${Number(x.amount||0).toFixed(2)}</span></span><span>₹${Number(x.currentValue||0).toFixed(2)}</span><div class="actions"><button onclick="crudEdit('investment','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('investment','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No investments yet.</span>'}</div>`,'span6')}${card('Loan Payments',`<div class="form"><select id="payLoan"><option value="">Select loan</option>${(state.loans||[]).slice(0,RENDER_PAGE_SIZE).map(l=>`<option value="${l.id}">${esc(l.name)} · ₹${Number(l.outstanding||0).toFixed(2)}</option>`).join('')}</select><input id="payAmount" type="number" min="0.01" step="0.01" placeholder="Payment amount"><select id="payAccount"><option value="">No cash account</option>${acctOptions}</select><input id="payDate" type="date" value="${today()}"><button class="primary full" onclick="recordLoanPayment()">Record Payment</button></div><div class="list" style="margin-top:10px">${(state.loanPayments||[]).slice().reverse().slice(0,12).map(x=>`<div class="row"><span>${esc(x.loanName||'Loan')}<br><span class="muted">${esc(x.date||'')} · Principal ₹${Number(x.principal||0).toFixed(2)} · Interest ₹${Number(x.interest||0).toFixed(2)}</span></span><span>₹${Number(x.amount||0).toFixed(2)}</span><button class="danger" onclick="crudDelete('loanPayment','${x.id}')">Delete / Reverse</button></div>`).join('')||'<span class="muted">No loan payments yet.</span>'}</div>`,'span6')}${card('Assets / Liabilities',`<div class="form"><input id="assetName" placeholder="Asset name"><input id="assetValue" type="number" placeholder="Value"><button onclick="addAsset()">Add Asset</button><input id="liabName" placeholder="Liability name"><input id="liabValue" type="number" placeholder="Amount"><button onclick="addLiability()">Add Liability</button></div><div class="list" style="margin-top:10px">${latestRows(state.assets||[]).map(x=>`<div class="row"><span>Asset · ${esc(x.name)}</span><span>₹${Number(x.value||0).toFixed(2)}</span><div class="actions"><button onclick="crudEdit('asset','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('asset','${x.id}')">Delete</button></div></div>`).join('')}${latestRows(state.liabilities||[]).map(x=>`<div class="row"><span>Liability · ${esc(x.name)}</span><span>₹${Number(x.amount||0).toFixed(2)}</span><div class="actions"><button onclick="crudEdit('liability','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('liability','${x.id}')">Delete</button></div></div>`).join('')||''}</div>`,'span6')}${card('Financial Goals',`<div class="form"><input id="fgName" placeholder="Goal name"><input id="fgTarget" type="number" placeholder="Target amount"><input id="fgCurrent" type="number" placeholder="Current amount"><input id="fgDate" type="date"><button class="primary full" onclick="addFinancialGoal()">Add Financial Goal</button></div><div class="list" style="margin-top:10px">${latestRows(state.financialGoals||[]).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><br><span class="muted">₹${Number(x.current||0).toFixed(2)} / ₹${Number(x.target||0).toFixed(2)}</span></span><span>${goalProgress(x).toFixed(0)}%</span><div class="actions"><button onclick="crudEdit('financialGoal','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('financialGoal','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No financial goals yet.</span>'}</div>`,'span6')}${card('Cash Flow / Reports',`<div class="grid"><div class="card span3">Investments<div class="metric">₹${f.investment.toFixed(2)}</div></div><div class="card span3">Loan Received<div class="metric">₹${f.loanIn.toFixed(2)}</div></div><div class="card span3">Repayment<div class="metric">₹${f.repay.toFixed(2)}</div></div><div class="card span3">Transfers<div class="metric">₹${f.transfer.toFixed(2)}</div></div></div><div class="list" style="margin-top:10px">${financeReportRows().map(([k,v])=>`<div class="row"><span>${esc(k)}</span><b>₹${Number(v||0).toFixed(2)}</b></div>`).join('')}</div><div class="list" style="margin-top:10px">${(state.finance||[]).slice().reverse().slice(0,30).map(x=>`<div class="row"><span><b>${esc(x.type)}</b> · ${esc(x.category||'')}</span><span>₹${Number(x.amount||0).toFixed(2)}</span><div class="actions"><button onclick="crudEdit('finance','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('finance','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No transactions yet.</span>'}</div>`,'span12')}</div>`}
function loanEmi(p,r,n){p=Number(p)||0;r=Number(r)||0;n=Number(n)||0;if(!p||!n)return 0;const m=r/1200;if(!m)return p/n;return p*m*Math.pow(1+m,n)/(Math.pow(1+m,n)-1)}
function savingProgress(x){return x.targetAmount>0?Math.min(100,Math.max(0,Number(x.currentAmount||0)/Number(x.targetAmount)*100)):0}
function goalProgress(x){return x.target>0?Math.min(100,Math.max(0,Number(x.current||0)/Number(x.target)*100)):0}
function addFinanceAccount(){const name=acctName.value.trim();if(!name)return toast('Account name required');const opening=Number(acctBalance.value||0);state.financeAccounts.push({id:uid(),name,balance:opening,openingBalance:opening,type:'cash'});db.save();render();toast('Account added')}
function addLoan(){const name=loanName.value.trim(),principal=Number(loanPrincipal.value||0),rate=Number(loanRate.value||0),tenure=Math.round(Number(loanTenure.value||0));if(!name||principal<=0||tenure<=0)return toast('Loan name, principal and tenure required');state.loans.push({id:uid(),name,principal,rate,tenure,dueDay:Math.min(31,Math.max(1,Number(loanDueDay.value||5))),outstanding:principal,createdAt:Date.now()});db.save();render();toast('Loan created')}
function addInvestment(){const name=invName.value.trim(),amount=Number(invAmount.value||0),currentValue=Number(invValue.value||0),accountId=(document.getElementById('invAccount')||{}).value||'';if(!name||amount<=0)return toast('Investment name/amount required');if(accountId){const a=state.financeAccounts.find(x=>x.id===accountId);if(!a||Number(a.balance||0)<amount)return toast('Account balance is not enough');a.balance-=amount;}const id=uid(),date=invDate.value||today();state.investments.push({id,name,amount,currentValue:currentValue||amount,date,accountId:accountId||null,createdAt:Date.now(),updatedAt:Date.now()});state.finance.push({id:uid(),type:'investment',amount,category:'Investment Purchase',date,note:name,accountId:accountId||null,linkedInvestmentId:id,createdAt:Date.now()});db.save();render();toast('Investment added · cash ↓, investment asset ↑')}
function recordLoanPayment(){const loan=state.loans.find(x=>x.id===payLoan.value),amount=Number(payAmount.value||0),accountId=(document.getElementById('payAccount')||{}).value||'';if(!loan||amount<=0)return toast('Select loan and valid payment');if(accountId){const a=state.financeAccounts.find(x=>x.id===accountId);if(!a||Number(a.balance||0)<amount)return toast('Account balance is not enough');}const outstanding=Math.max(0,Number(loan.outstanding||0));const paid=Math.min(amount,outstanding);const monthlyRate=Math.max(0,Number(loan.rate||0))/1200;const interest=Math.min(paid,outstanding*monthlyRate);const principal=Math.max(0,paid-interest);if(accountId){state.financeAccounts.find(x=>x.id===accountId).balance-=paid;}loan.outstanding=Math.max(0,outstanding-principal);const date=payDate.value||today();state.loanPayments.push({id:uid(),loanId:loan.id,loanName:loan.name,amount:paid,principal,interest,date,accountId:accountId||null,createdAt:Date.now()});const paymentId=state.loanPayments[state.loanPayments.length-1].id;state.finance.push({id:uid(),type:'repayment',amount:paid,principal,interest,category:'Loan Repayment',date,note:loan.name,accountId:accountId||null,linkedLoanId:loan.id,linkedLoanPaymentId:paymentId,createdAt:Date.now()});if(interest>0){state.finance.push({id:uid(),type:'expense',amount:interest,category:'Loan Interest',date,note:loan.name,accountId:accountId||null,linkedLoanId:loan.id,linkedLoanPaymentId:paymentId,ledgerOnly:true,createdAt:Date.now()});}db.save();render();toast('Loan payment recorded · Principal ₹'+principal.toFixed(2)+' · Interest ₹'+interest.toFixed(2))}
function addFinanceTransfer(){const fromId=(document.getElementById('transferFrom')||{}).value||'',toId=(document.getElementById('transferTo')||{}).value||'',amount=Number((document.getElementById('transferAmount')||{}).value||0),date=(document.getElementById('transferDate')||{}).value||today(),note=((document.getElementById('transferNote')||{}).value||'').trim();if(!fromId||!toId||fromId===toId||amount<=0)return toast('Select different source/destination accounts and valid amount');const from=state.financeAccounts.find(x=>x.id===fromId),to=state.financeAccounts.find(x=>x.id===toId);if(!from||!to)return toast('Account not found');if(Number(from.balance||0)<amount)return toast('Source account balance is not enough');from.balance-=amount;to.balance+=amount;state.finance.push({id:uid(),type:'transfer',amount,category:'Account Transfer',date,note,fromAccountId:fromId,toAccountId:toId,createdAt:Date.now()});db.save();render();toast('Transfer recorded · net worth unchanged')}
function addSavingsPlan(){const name=saveName.value.trim(),current=Number(saveAmount.value||0),target=Number(saveTarget.value||0),months=Math.max(0,Number(saveMonths.value||0));if(!name)return toast('Savings name required');state.savingsPlans.push({id:uid(),name,currentAmount:current,targetAmount:target,durationMonths:months,createdAt:Date.now()});db.save();render();toast('Savings plan added')}
function addAsset(){const name=assetName.value.trim(),value=Number(assetValue.value||0);if(!name||value<0)return toast('Asset name/value required');state.assets.push({id:uid(),name,value});db.save();render()}
function addLiability(){const name=liabName.value.trim(),amount=Number(liabValue.value||0);if(!name||amount<0)return toast('Liability name/amount required');state.liabilities.push({id:uid(),name,amount});db.save();render()}
function addFinancialGoal(){const name=fgName.value.trim(),target=Number(fgTarget.value||0),current=Number(fgCurrent.value||0);if(!name||target<=0)return toast('Goal name/target required');state.financialGoals.push({id:uid(),name,target,current,date:fgDate.value||'',createdAt:Date.now()});db.save();render();toast('Financial goal added')}
function addFinance(){const amount=Number(finAmount.value||0);if(!(amount>0))return toast('Valid amount required');const type=finType.value;const accountId=finAccount.value||null;if(accountId&&type==='expense'){const a=state.financeAccounts.find(x=>x.id===accountId);if(!a||Number(a.balance||0)<amount)return toast('Account balance is not enough');a.balance-=amount;}else if(accountId&&type==='income'||accountId&&type==='loan'){const a=state.financeAccounts.find(x=>x.id===accountId);if(a)a.balance+=amount;}state.finance.push({id:uid(),type,amount,category:finCategory.value.trim()||'Uncategorized',date:finDate.value||today(),note:finNote.value.trim(),accountId,createdAt:Date.now()});db.save();render();toast('Transaction saved')}
const SIMPLE_ENTITY_DEFS={
 routineOccurrence:{store:'routineOccurrences',title:'Routine Occurrence',fields:[['routineId','Routine ID'],['date','Date'],['status','Status'],['note','Note']]},
 habitLog:{store:'habitLogs',title:'Habit Log',fields:[['habitId','Habit ID'],['date','Date'],['status','Status'],['note','Note']]},
 milestone:{store:'milestones',title:'Milestone',fields:[['title','Title'],['goalId','Goal ID'],['dueDate','Due date'],['progress','Progress %'],['status','Status'],['note','Note']]},
 strategy:{store:'strategies',title:'Strategy',fields:[['title','Title'],['goalId','Goal ID'],['action','Action'],['status','Status'],['note','Note']]},
 kpi:{store:'kpis',title:'KPI',fields:[['name','KPI name'],['goalId','Goal ID'],['target','Target'],['current','Current'],['unit','Unit'],['status','Status']]},
 mission:{store:'missions',title:'Mission / Monthly Target',fields:[['title','Mission'],['period','Period'],['target','Target'],['action','Action'],['status','Status'],['note','Note']]},
 mentorRule:{store:'mentorRules',title:'Mentor Rule',fields:[['title','Rule'],['text','Description'],['status','Status']]},
 mentorQuote:{store:'mentorQuotes',title:'Mentor Quote / Principle',fields:[['quote','Quote'],['author','Author'],['note','Note']]},
 healthActivity:{store:'healthActivities',title:'Health Activity',fields:[['date','Date'],['type','Activity'],['duration','Minutes'],['calories','Calories'],['note','Note']]},
 workResponsibility:{store:'workResponsibilities',title:'Work Responsibility',fields:[['title','Responsibility'],['projectId','Project ID'],['status','Status'],['priority','Priority'],['dueDate','Due date'],['note','Note']]},
 skill:{store:'skills',title:'Skill',fields:[['name','Skill'],['level','Current level'],['targetLevel','Target level'],['note','Note']]},
 course:{store:'courses',title:'Course',fields:[['title','Course'],['provider','Provider'],['progress','Progress %'],['startDate','Start date'],['endDate','End date'],['note','Note']]},
 learningProgress:{store:'learningProgress',title:'Learning Progress',fields:[['itemId','Learning item ID'],['date','Date'],['progress','Progress %'],['note','Note']]},
 relationship:{store:'relationships',title:'Relationship',fields:[['personId','Person ID'],['type','Relationship type'],['status','Status'],['note','Note']]},
 importantDate:{store:'importantDates',title:'Important Date',fields:[['personId','Person ID'],['title','Event'],['date','Date'],['note','Note']]},
 relationshipReminder:{store:'relationshipReminders',title:'Relationship Reminder',fields:[['personId','Person ID'],['title','Reminder'],['dueAt','Due at'],['repeatRule','Repeat'],['status','Status']]},
 documentCollection:{store:'documentCollections',title:'Document Collection',fields:[['title','Collection'],['description','Description']]},
 capitalStrategy:{store:'capitalStrategy',title:'Capital Strategy',fields:[['title','Strategy'],['target','Target'],['action','Action'],['status','Status'],['note','Note']]},
 capitalPosition:{store:'capital',title:'Capital Position',fields:[['type','Type'],['amount','Amount'],['date','Date'],['note','Note']]},
 capitalRecord:{store:'capitalRecords',title:'Capital Record',fields:[['title','Record'],['amount','Amount'],['date','Date'],['status','Status'],['note','Note']]},
 healthNote:{store:'healthNotes',title:'Health Note',fields:[['date','Date'],['text','Health note']]},
 interaction:{store:'interactions',title:'Interaction',fields:[['personId','Person ID'],['date','Date'],['text','Interaction']]},
 warranty:{store:'warranties',title:'Warranty',fields:[['title','Warranty / Item'],['expiry','Expiry date'],['note','Details']]},
 receipt:{store:'receipts',title:'Receipt',fields:[['title','Receipt / Item'],['date','Date'],['amount','Amount'],['note','Details']]},
 certificate:{store:'certificates',title:'Certificate',fields:[['title','Certificate'],['expiry','Expiry date'],['note','Details']]},
 importantRecord:{store:'importantRecords',title:'Important Record',fields:[['title','Record'],['date','Date'],['note','Details']]}
};
function legacy_simpleInputType_v40(field){return /date/i.test(field)?'date':/progress|amount|target|current|duration|calories|level/i.test(field)?'number':'text'}
function legacy_simpleEntityCard_v40(type,cls='span4'){const d=SIMPLE_ENTITY_DEFS[type];if(!d)return '';const fields=d.fields.map(([f,l])=>`<input id="simple_${type}_${f}" type="${simpleInputType(f)}" placeholder="${esc(l)}">`).join('');return card(d.title,`<div class="form">${fields}<button class="primary full" onclick="simpleAdd('${type}')">Add ${esc(d.title)}</button></div><div class="list" style="margin-top:10px">${simpleEntityRows(type)}</div>`,cls)}
function simpleEntityRows(type,limit=20){const d=SIMPLE_ENTITY_DEFS[type];const rows=(state[d.store]||[]).slice().reverse().slice(0,limit);return rows.map(x=>`<div class="row"><span><b>${esc(x.title||x.name||x.quote||x.type||d.title)}</b><div class="muted">${esc(x.note||x.status||x.description||x.date||x.period||'')}</div></span><div class="actions"><button onclick="simpleEdit('${type}','${x.id}')">Edit</button><button class="danger" onclick="simpleDelete('${type}','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No records yet.</span>'}
async function simpleAdd(type){
  const d=SIMPLE_ENTITY_DEFS[type]; if(!d)return;
  const x={id:uid(),createdAt:Date.now(),updatedAt:Date.now()};
  for(const [f] of d.fields){const el=document.getElementById(`simple_${type}_${f}`);const v=el?.value??'';if(v!==''&&v!=null)x[f]=['progress','amount','target','current','duration','calories'].includes(f)?Number(v):v}
  const first=d.fields[0]?.[0];
  if(!String(x[first]??'').trim())return toast(`${d.title}: please fill ${d.fields[0]?.[1]||'the first field'}`);
  const fileEl=document.getElementById(`simple_${type}_file`);
  state[d.store].push(x);
  let attachmentCount=0;
  if(fileEl?.files?.length && ['documentCollection','warranty','receipt','certificate','importantRecord'].includes(type)){
    const ids=await storeFiles(fileEl,type,x.id);
    x.attachments=ids; attachmentCount=ids.length;
  }
  await db.save();render();toast(`${d.title} added${attachmentCount?' with '+attachmentCount+' attachment'+(attachmentCount>1?'s':''):''}`)
}
function simpleEdit(type,id){const d=SIMPLE_ENTITY_DEFS[type],list=state[d.store]||[],x=list.find(v=>v.id===id);if(!x)return;for(const [f] of d.fields){const v=prompt(`Edit ${f}`,String(x[f]??''));if(v===null)return;x[f]=['progress','amount','target','current','duration','calories'].includes(f)?Number(v||0):v}x.updatedAt=Date.now();db.save();render();toast(`${d.title} updated`)}
function simpleDelete(type,id){const d=SIMPLE_ENTITY_DEFS[type],list=state[d.store]||[],i=list.findIndex(v=>v.id===id);if(i<0)return;if(!confirm(`Delete ${d.title}?`))return;list.splice(i,1);db.save();render();toast(`${d.title} deleted`)}
function extendedGoalsHtml(){return `${simpleEntityCard('milestone','span4')}${simpleEntityCard('strategy','span4')}${simpleEntityCard('kpi','span4')}${simpleEntityCard('mission','span4')}${simpleEntityCard('mentorRule','span4')}${simpleEntityCard('mentorQuote','span4')}${simpleEntityCard('capitalStrategy','span4')}${simpleEntityCard('capitalPosition','span4')}${simpleEntityCard('capitalRecord','span4')}`}
function extendedRoutineHtml(){return `${simpleEntityCard('routineOccurrence','span6')}${simpleEntityCard('habitLog','span6')}`}
function extendedHealthHtml(){return `${simpleEntityCard('healthActivity','span6')}${simpleEntityCard('healthNote','span6')}`}
function extendedWorkHtml(){return `${simpleEntityCard('workResponsibility','span6')}${simpleEntityCard('skill','span6')}${simpleEntityCard('course','span6')}${simpleEntityCard('learningProgress','span6')}`}
function extendedPeopleHtml(){return `${simpleEntityCard('relationship','span4')}${simpleEntityCard('importantDate','span4')}${simpleEntityCard('relationshipReminder','span4')}${simpleEntityCard('interaction','span12')}`}
function thingDocumentCard(type,cls='span6'){
  const d=SIMPLE_ENTITY_DEFS[type]; if(!d)return '';
  const fields=d.fields.map(([f,l])=>`<label><span class="label">${esc(l)}</span><input id="simple_${type}_${f}" type="${simpleInputType(f)}" placeholder="${esc(l)}"></label>`).join('');
  return card(d.title,`<div class="formgrid">${fields}</div><label><span class="label">Attachment (optional)</span><input id="simple_${type}_file" type="file" accept="*/*"></label><div class="actions"><button type="button" class="primary" onclick="simpleAdd('${type}')">Add ${esc(d.title)}</button></div><div class="list" style="margin-top:10px">${simpleEntityRows(type)}</div>`,cls)
}
function extendedThingsHtml(){return `${thingDocumentCard('documentCollection','span6')}${thingDocumentCard('warranty','span6')}${thingDocumentCard('receipt','span6')}${thingDocumentCard('certificate','span6')}${thingDocumentCard('importantRecord','span12')}`}

function legacy_health_v40(){const hp=state.healthProfile||{};return `<h1>Health</h1><div class="grid">
${card('Health Profile',`<div class="form"><input id="hName" placeholder="Name" value="${esc(hp.name||'')}"><input id="hDob" type="date" value="${esc(hp.dob||'')}"><input id="hHeight" type="number" placeholder="Height (cm)" value="${hp.height||''}"><input id="hWeight" type="number" placeholder="Weight (kg)" value="${hp.weight||''}"><input id="hTarget" type="number" placeholder="Target weight (kg)" value="${hp.targetWeight||''}"><button class="primary full" onclick="saveHealthProfile()">Save Profile</button></div>`,'span5')}
${card('Quick Health Calculators',`<p class="muted">BMI, BMR, TDEE, calories and macros remain in the shared Calculator Engine.</p><div class="actions"><button onclick="show('calculator')">Open Calculator & Tools</button></div><div class="metric">${hp.height&&hp.weight?(Number(hp.weight)/(Number(hp.height)/100)**2).toFixed(1):'—'}</div><div class="muted">Current BMI</div>`,'span3')}
${card('Measurements / Activity',`<div class="form"><input id="hmDate" type="date" value="${today()}"><input id="hmWeight" type="number" placeholder="Weight kg"><input id="hmSteps" type="number" placeholder="Steps"><input id="hmExercise" placeholder="Exercise / activity"><input id="hmDuration" type="number" placeholder="Minutes"><button class="primary full" onclick="addHealthMeasurement()">Add Record</button></div>`,'span4')}
${card('Sleep / Water / Nutrition',`<div class="form"><input id="sleepDate" type="date" value="${today()}"><input id="sleepHours" type="number" step="0.1" placeholder="Sleep hours"><input id="waterDate" type="date" value="${today()}"><input id="waterAmount" type="number" placeholder="Water ml"><input id="nutritionDate" type="date" value="${today()}"><input id="nutritionCalories" type="number" placeholder="Calories"><input id="nutritionNote" class="full" placeholder="Nutrition note"><button class="primary full" onclick="addHealthWellness()">Save Wellness Record</button></div>`,'span6')}
${card('Appointments & Notes',`<div class="form"><input id="haDate" type="date" value="${today()}"><input id="haTitle" placeholder="Appointment"><input id="haDoctor" placeholder="Doctor / place"><input id="hnText" class="full" placeholder="Health note"><button class="primary full" onclick="addHealthAppointmentNote()">Save</button></div>`,'span6')}
${card('Recent Health Records',`<div class="list">${[...state.healthMeasurements.map(x=>['Measurement',x]),...state.sleepRecords.map(x=>['Sleep',x]),...state.waterRecords.map(x=>['Water',x]),...state.nutritionRecords.map(x=>['Nutrition',x]),...state.healthAppointments.map(x=>['Appointment',x])].slice(-20).reverse().map(([t,x])=>`<div class="row"><span><b>${t}</b> · ${esc(x.date||x.title||'')}</span><span class="muted">${esc(x.note||x.exercise||x.doctor||x.hours||((x.amount||'')+' ml'))}</span><div class="actions"><button onclick="crudEdit('${t==='Measurement'?'healthMeasurement':t==='Sleep'?'sleep':t==='Water'?'water':t==='Nutrition'?'nutrition':'appointment'}','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('${t==='Measurement'?'healthMeasurement':t==='Sleep'?'sleep':t==='Water'?'water':t==='Nutrition'?'nutrition':'appointment'}','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No health records yet.</span>'}</div>`,'span12')}${extendedHealthHtml()}</div>`}
function saveHealthProfile(){state.healthProfile={name:hName.value.trim(),dob:hDob.value,height:Number(hHeight.value||0),weight:Number(hWeight.value||0),targetWeight:Number(hTarget.value||0),updatedAt:Date.now()};db.save();render();toast('Health profile saved')}
function addHealthMeasurement(){const date=hmDate.value||today();state.healthMeasurements.push({id:uid(),date,weight:Number(hmWeight.value||0),steps:Number(hmSteps.value||0),exercise:hmExercise.value.trim(),duration:Number(hmDuration.value||0),createdAt:Date.now()});db.save();render();toast('Health record added')}
function addHealthWellness(){if(sleepHours.value)state.sleepRecords.push({id:uid(),date:sleepDate.value||today(),hours:Number(sleepHours.value),createdAt:Date.now()});if(waterAmount.value)state.waterRecords.push({id:uid(),date:waterDate.value||today(),amount:Number(waterAmount.value),createdAt:Date.now()});if(nutritionCalories.value||nutritionNote.value)state.nutritionRecords.push({id:uid(),date:nutritionDate.value||today(),calories:Number(nutritionCalories.value||0),note:nutritionNote.value.trim(),createdAt:Date.now()});db.save();render();toast('Wellness record saved')}
function addHealthAppointmentNote(){if(haTitle.value.trim())state.healthAppointments.push({id:uid(),date:haDate.value||today(),title:haTitle.value.trim(),doctor:haDoctor.value.trim(),createdAt:Date.now()});if(hnText.value.trim())state.healthNotes.push({id:uid(),date:today(),text:hnText.value.trim(),createdAt:Date.now()});db.save();render();toast('Health information saved')}
function legacy_work_v40(){return `<h1>Work & Learning</h1><div class="grid">
${card('Work Project',`<div class="form"><input id="wpName" placeholder="Project name"><input id="wpClient" placeholder="Client / team"><input id="wpDue" type="date"><input id="wpStatus" placeholder="Status" value="Active"><button class="primary full" onclick="addWorkProject()">Add Project</button></div>`,'span5')}
${card('Learning',`<div class="form"><input id="learnTitle" placeholder="Course / learning item"><input id="learnType" placeholder="Type (course/book/skill)"><input id="learnProgress" type="number" min="0" max="100" placeholder="Progress %"><button class="primary full" onclick="addLearningItem()">Add Learning</button></div>`,'span4')}
${card('Meeting',`<div class="form"><input id="meetDate" type="date" value="${today()}"><input id="meetTitle" placeholder="Meeting"><input id="meetPeople" placeholder="People"><button class="primary full" onclick="addMeeting()">Add Meeting</button></div>`,'span3')}
${card('Projects',`<div class="list">${latestRows(state.workProjects,RENDER_PAGE_SIZE).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><div class="muted">${esc(x.client||'')} · ${esc(x.due||'')} · ${esc(x.status||'')}</div></span><button onclick="workProjectTask('${x.id}')">Create Task</button><button onclick="crudEdit('workProject','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('workProject','${x.id}')">Delete</button></div>`).join('')||'<span class="muted">No work projects yet.</span>'}</div>`,'span7')}
${card('Learning Progress',`<div class="list">${latestRows(state.learningItems,RENDER_PAGE_SIZE).map(x=>`<div class="row"><span><b>${esc(x.title)}</b><div class="muted">${esc(x.type||'')}</div></span><span>${Math.max(0,Math.min(100,Number(x.progress||0)))}%</span><div class="actions"><button onclick="crudEdit('learningItem','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('learningItem','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No learning items yet.</span>'}</div>`,'span5')}
${card('Meetings',`<div class="list">${state.meetings.slice().reverse().slice(0,20).map(x=>`<div class="row"><span>${esc(x.date)} · <b>${esc(x.title)}</b></span><span class="muted">${esc(x.people||'')}</span><div class="actions"><button onclick="crudEdit('meeting','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('meeting','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No meetings yet.</span>'}</div>`,'span12')}${extendedWorkHtml()}</div>`}
function addWorkProject(){if(!wpName.value.trim())return toast('Project name required');state.workProjects.push({id:uid(),name:wpName.value.trim(),client:wpClient.value.trim(),due:wpDue.value||'',status:wpStatus.value.trim()||'Active',createdAt:Date.now()});db.save();render();toast('Work project added')}
function addLearningItem(){if(!learnTitle.value.trim())return toast('Learning item required');state.learningItems.push({id:uid(),title:learnTitle.value.trim(),type:learnType.value.trim(),progress:Number(learnProgress.value||0),createdAt:Date.now()});db.save();render();toast('Learning item added')}
function addMeeting(){if(!meetTitle.value.trim())return toast('Meeting title required');state.meetings.push({id:uid(),date:meetDate.value||today(),title:meetTitle.value.trim(),people:meetPeople.value.trim(),createdAt:Date.now()});db.save();render();toast('Meeting added')}
function workProjectTask(id){const p=state.workProjects.find(x=>x.id===id);if(!p)return;state.tasks.push({id:uid(),title:'Work: '+p.name,description:'',domain:'work',projectId:id,status:'open',priority:'Medium',dueAt:p.due||'',createdAt:Date.now(),updatedAt:Date.now()});db.save();toast('Task linked to project')}
function legacy_people_v40(){return `<h1>People & Relationships</h1><div class="grid">${card('Add Person',`<div class="form"><input id="personName" placeholder="Name"><input id="personRel" placeholder="Relationship"><input id="personContact" placeholder="Contact (optional)"><input id="personDate" type="date"><button class="primary full" onclick="addPerson()">Save Person</button></div>`,'span5')}${card('People',`<div class="list">${latestRows(state.people,RENDER_PAGE_SIZE).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><div class="muted">${esc(x.relationship||'')} · ${esc(x.contact||'')}</div></span><div class="actions"><button onclick="addPersonTask('${x.id}')">Task</button><button onclick="logInteraction('${x.id}')">Interaction</button><button onclick="crudEdit('person','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('person','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No people yet.</span>'}</div>`,'span7')}${card('Recent Interactions',`<div class="list">${state.interactions.slice().reverse().slice(0,20).map(x=>`<div class="row"><span>${esc(x.date)} · ${esc(x.text)}</span><span class="muted">${esc(state.people.find(p=>p.id===x.personId)?.name||'')}</span></div>`).join('')||'<span class="muted">No interactions yet.</span>'}</div>`,'span12')}${extendedPeopleHtml()}</div>`}
function addPerson(){if(!personName.value.trim())return toast('Name required');state.people.push({id:uid(),name:personName.value.trim(),relationship:personRel.value.trim(),contact:personContact.value.trim(),importantDate:personDate.value||'',createdAt:Date.now()});db.save();render();toast('Person saved')}
function addPersonTask(id){const p=state.people.find(x=>x.id===id);if(!p)return;state.tasks.push({id:uid(),title:'Contact: '+p.name,description:'',domain:'social',status:'open',priority:'Medium',dueAt:'',linkedEntity:{type:'Person',id:p.id},createdAt:Date.now(),updatedAt:Date.now()});db.save();toast('Relationship task created')}
function logInteraction(id){const p=state.people.find(x=>x.id===id);if(!p)return;const text=prompt('Interaction note for '+p.name);if(!text?.trim())return;state.interactions.push({id:uid(),personId:id,date:today(),text:text.trim(),createdAt:Date.now()});db.save();render();toast('Interaction logged')}
function legacy_spiritual_v40(){return `<h1>Values & Spiritual</h1><div class="grid">${card('Value / Principle',`<div class="form"><input id="valueTitle" placeholder="Value"><input id="valueDesc" placeholder="Meaning / principle"><button class="primary full" onclick="addValue()">Save Value</button></div>`,'span5')}${card('Spiritual Practice',`<div class="form"><input id="practiceName" placeholder="Practice"><input id="practiceFreq" placeholder="Frequency"><button class="primary full" onclick="addPractice()">Save Practice</button></div>`,'span4')}${card('Commitment',`<div class="form"><input id="commitText" placeholder="Commitment"><button class="primary full" onclick="addCommitment()">Save Commitment</button></div>`,'span3')}${card('Values & Principles',`<div class="list">${[...state.values.slice(-RENDER_PAGE_SIZE).map(x=>['Value',x]),...state.principles.slice(-RENDER_PAGE_SIZE).map(x=>['Principle',x])].reverse().map(([t,x])=>`<div class="row"><span><b>${t}</b> · ${esc(x.title||x.text)}</span><span class="muted">${esc(x.description||'')}</span><div class="actions"><button onclick="crudEdit('${t==='Value'?'value':'principle'}','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('${t==='Value'?'value':'principle'}','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No values yet.</span>'}</div>`,'span7')}${card('Practices & Commitments',`<div class="list">${[...state.spiritualPractices.slice(-RENDER_PAGE_SIZE).map(x=>['Practice',x]),...state.commitments.slice(-RENDER_PAGE_SIZE).map(x=>['Commitment',x])].reverse().map(([t,x])=>`<div class="row"><span><b>${t}</b> · ${esc(x.name||x.text)}</span><span class="muted">${esc(x.frequency||'')}</span><div class="actions"><button onclick="crudEdit('${t==='Practice'?'practice':'commitment'}','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('${t==='Practice'?'practice':'commitment'}','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No practices yet.</span>'}</div>`,'span5')}${card('Links',`<p class="muted">Spiritual practices can become Habits/Routines; reflections belong in Journal; outcomes belong in Goals.</p><div class="actions"><button onclick="capture('journal')">Journal reflection</button><button onclick="capture('goal')">Create goal</button></div>`,'span12')}</div>`}
function addValue(){if(!valueTitle.value.trim())return toast('Value required');const row={id:uid(),title:valueTitle.value.trim(),description:valueDesc.value.trim(),createdAt:Date.now(),updatedAt:Date.now()};const type=document.getElementById('valueType')?.value||'value';state[type==='principle'?'principles':'values'].push(row);db.save();render();toast(type==='principle'?'Principle saved':'Value saved')}
function addPractice(){if(!practiceName.value.trim())return toast('Practice required');const practiceId=uid(),habitId=uid(),name=practiceName.value.trim(),frequency=practiceFreq.value.trim();state.spiritualPractices.push({id:practiceId,name,frequency,linkedHabitId:habitId,createdAt:Date.now(),updatedAt:Date.now()});state.habits.push({id:habitId,name,frequency,domain:'spiritual',linkedPracticeId:practiceId,createdAt:Date.now(),updatedAt:Date.now()});db.save();render();toast('Practice saved and linked to Habit')}
function addCommitment(){if(!commitText.value.trim())return toast('Commitment required');state.commitments.push({id:uid(),text:commitText.value.trim(),createdAt:Date.now()});db.save();render();toast('Commitment saved')}
function legacy_things_v40(){return `<h1>Things & Documents</h1><div class="grid">${card('Thing',`<div class="form"><input id="thingName" placeholder="Thing / item"><input id="thingCategory" placeholder="Category"><input id="thingValue" type="number" placeholder="Value"><button class="primary full" onclick="addThing()">Save Thing</button></div>`,'span4')}${card('Document / Record',`<div class="form"><input id="docTitle" placeholder="Document title"><input id="docType" placeholder="Type"><input id="docNumber" placeholder="Number / reference"><input id="docDate" type="date"><button class="primary full" onclick="addDocument()">Save Document</button></div>`,'span4')}${card('Warranty / Receipt',`<div class="form"><input id="wrTitle" placeholder="Item / warranty / receipt"><input id="wrExpiry" type="date"><input id="wrNote" class="full" placeholder="Details"><button class="primary full" onclick="addRecord()">Save Record</button></div>`,'span4')}${card('Things',`<div class="list">${latestRows(state.things,RENDER_PAGE_SIZE).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><div class="muted">${esc(x.category||'')} · ₹${Number(x.value||0).toLocaleString('en-IN')}</div></span><button onclick="createThingTask('${x.id}')">Task</button><button onclick="crudEdit('thing','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('thing','${x.id}')">Delete</button></div>`).join('')||'<span class="muted">No things yet.</span>'}</div>`,'span5')}${card('Documents',`<div class="list">${latestRows(state.documents,RENDER_PAGE_SIZE).map(x=>`<div class="row"><span><b>${esc(x.title)}</b><div class="muted">${esc(x.type||'')} · ${esc(x.reference||'')} · ${esc(x.date||'')}</div></span><div class="actions"><button onclick="crudEdit('document','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('document','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No documents yet.</span>'}</div>`,'span7')}${card('Warranties / Receipts / Certificates',`<div class="list">${[...state.warranties.slice(-RENDER_PAGE_SIZE).map(x=>['Warranty',x]),...state.receipts.slice(-RENDER_PAGE_SIZE).map(x=>['Receipt',x]),...state.certificates.slice(-RENDER_PAGE_SIZE).map(x=>['Certificate',x]),...state.importantRecords.slice(-RENDER_PAGE_SIZE).map(x=>['Record',x])].reverse().map(([t,x])=>`<div class="row"><span><b>${t}</b> · ${esc(x.title||x.item)}</span><span class="muted">${esc(x.expiry||x.note||'')}</span><div class="actions"><button onclick="crudEdit('record','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('record','${x.id}')">Delete</button></div></div>`).join('')||'<span class="muted">No records yet.</span>'}</div>`,'span12')}${extendedThingsHtml()}</div>`}
function addThing(){if(!thingName.value.trim())return toast('Thing name required');state.things.push({id:uid(),name:thingName.value.trim(),category:thingCategory.value.trim(),value:Number(thingValue.value||0),createdAt:Date.now()});db.save();render();toast('Thing saved')}
function addDocument(){if(!docTitle.value.trim())return toast('Document title required');state.documents.push({id:uid(),title:docTitle.value.trim(),type:docType.value.trim(),reference:docNumber.value.trim(),date:docDate.value||'',createdAt:Date.now()});db.save();render();toast('Document saved')}
function addRecord(){if(!wrTitle.value.trim())return toast('Record title required');const title=wrTitle.value.trim(),row={id:uid(),title,expiry:wrExpiry.value||'',note:wrNote.value.trim(),createdAt:Date.now()};if(/warranty/i.test(title))state.warranties.push(row);else if(/receipt/i.test(title))state.receipts.push(row);else if(/certificate/i.test(title))state.certificates.push(row);else state.importantRecords.push(row);db.save();render();toast('Record saved')}
function createThingTask(id){const x=state.things.find(v=>v.id===id);if(!x)return;state.tasks.push({id:uid(),title:'Review '+x.name,description:'',domain:'personal',status:'open',priority:'Low',dueAt:'',linkedEntity:{type:'Thing',id:x.id},createdAt:Date.now(),updatedAt:Date.now()});db.save();toast('Thing task created')}
function financeAccountDelta(tx,sign){if(!tx||tx.ledgerOnly)return;const amount=Math.max(0,Number(tx.amount||0)),find=id=>(state.financeAccounts||[]).find(a=>a.id===id);if(tx.type==='income'||tx.type==='loan'){const a=find(tx.accountId);if(a)a.balance+=sign*amount}else if(tx.type==='expense'||tx.type==='investment'||tx.type==='repayment'){const a=find(tx.accountId);if(a)a.balance-=sign*amount}else if(tx.type==='transfer'){const from=find(tx.fromAccountId),to=find(tx.toAccountId);if(from)from.balance-=sign*amount;if(to)to.balance+=sign*amount}}
function numericCrudField(k){return ['progress','amount','balance','principal','rate','tenure','dueDay','currentAmount','targetAmount','durationMonths','currentValue','target','current','value','weight','steps','duration','hours','calories'].includes(k)}
function crudEdit(type,id){
 const cfg={task:['title','description','domain','date','priority'],routine:['name','time'],habit:['name','frequency'],goal:['title','date','progress'],note:['title','category','tags','points','color'],journal:['title','date','color'],finance:['type','category','amount','date','note','accountId'],account:['name','balance'],loan:['name','rate','tenure','dueDay'],savings:['name','currentAmount','targetAmount','durationMonths'],investment:['name','currentValue','date'],financialGoal:['name','target','current','date'],asset:['name','value'],liability:['name','amount'],person:['name','relationship','contact','importantDate'],workProject:['name','client','due','status'],learningItem:['title','type','progress'],meeting:['date','title','people'],value:['title','description'],practice:['name','frequency'],commitment:['text'],principle:['title','text','description'],thing:['name','category','value'],document:['title','type','reference','date'],record:['title','expiry','note'],healthMeasurement:['date','weight','steps','exercise','duration'],sleep:['date','hours'],water:['date','amount'],nutrition:['date','calories','note'],appointment:['date','title','doctor'],healthNote:['date','text'],interaction:['date','text']}[type];
 if(!cfg)return toast('Edit this record from its module editor');
 const lists={task:'tasks',routine:'routines',habit:'habits',goal:'goals',note:'notes',journal:'journal',finance:'finance',account:'financeAccounts',loan:'loans',savings:'savingsPlans',investment:'investments',financialGoal:'financialGoals',asset:'assets',liability:'liabilities',person:'people',workProject:'workProjects',learningItem:'learningItems',meeting:'meetings',value:'values',principle:'principles',practice:'spiritualPractices',commitment:'commitments',thing:'things',document:'documents',healthMeasurement:'healthMeasurements',sleep:'sleepRecords',water:'waterRecords',nutrition:'nutritionRecords',appointment:'healthAppointments',healthNote:'healthNotes',interaction:'interactions'};
 const list=state[lists[type]]||[];const x=list.find(v=>v.id===id);if(!x)return toast('Record not found');const before=structuredClone(x);
 for(const k of cfg){const v=prompt('Edit '+k,String(x[k]??''));if(v===null)return;x[k]=numericCrudField(k)?Number(v||0):v}
 if(type==='finance'){financeAccountDelta(before,-1);financeAccountDelta(x,1)}
 x.updatedAt=Date.now();db.save();render();toast('Record updated ✓')
}
async function deleteLoanPayment(id){const x=(state.loanPayments||[]).find(v=>v.id===id);if(!x)return;if(!confirm('Delete this loan payment and reverse its ledger effect?'))return;const loan=(state.loans||[]).find(v=>v.id===x.loanId);if(loan)loan.outstanding=Math.max(0,Number(loan.outstanding||0)+Math.max(0,Number(x.principal||0)));state.loanPayments=state.loanPayments.filter(v=>v.id!==id);const linked=(state.finance||[]).filter(v=>v.linkedLoanPaymentId===id);if(linked.length)for(const tx of linked)financeAccountDelta(tx,-1);else if(x.accountId){const a=(state.financeAccounts||[]).find(v=>v.id===x.accountId);if(a)a.balance+=Number(x.amount||0)}state.finance=state.finance.filter(v=>v.linkedLoanPaymentId!==id);await db.save();render();toast('Loan payment reversed ✓')}
async function crudDelete(type,id){
 if(type==='loanPayment')return deleteLoanPayment(id);
 const lists={task:'tasks',routine:'routines',habit:'habits',goal:'goals',note:'notes',journal:'journal',finance:'finance',account:'financeAccounts',loan:'loans',savings:'savingsPlans',investment:'investments',financialGoal:'financialGoals',asset:'assets',liability:'liabilities',person:'people',workProject:'workProjects',learningItem:'learningItems',meeting:'meetings',value:'values',principle:'principles',practice:'spiritualPractices',commitment:'commitments',thing:'things',document:'documents',healthMeasurement:'healthMeasurements',sleep:'sleepRecords',water:'waterRecords',nutrition:'nutritionRecords',appointment:'healthAppointments',healthNote:'healthNotes',interaction:'interactions'};
 let list=lists[type]&&state[lists[type]],x=null;
 if(type==='record'){for(const k of ['warranties','receipts','certificates','importantRecords']){const a=state[k]||[];const z=a.find(v=>v.id===id);if(z){list=a;x=z;break}}}else x=(list||[]).find(v=>v.id===id);
 if(!x||!list)return toast('Record not found');if(!confirm('Delete this record?'))return;
 if(type==='finance')financeAccountDelta(x,-1);
 if((type==='note'||type==='journal')&&Array.isArray(x.attachments)){for(const a of x.attachments)try{await db.deleteAttachment(a)}catch(_){}state.attachments=(state.attachments||[]).filter(a=>!x.attachments.includes(a.id))}
 if(type==='investment'){const linked=(state.finance||[]).filter(v=>v.linkedInvestmentId===id);for(const tx of linked)financeAccountDelta(tx,-1);state.finance=state.finance.filter(v=>v.linkedInvestmentId!==id)}
 list.splice(list.indexOf(x),1);
 if(type==='person'){state.interactions=(state.interactions||[]).filter(v=>v.personId!==id);state.relationships=(state.relationships||[]).filter(v=>v.personId!==id);state.importantDates=(state.importantDates||[]).filter(v=>v.personId!==id);state.relationshipReminders=(state.relationshipReminders||[]).filter(v=>v.personId!==id);state.reminders=(state.reminders||[]).filter(v=>!(v.linkedType==='Person'&&v.linkedId===id));state.tasks=(state.tasks||[]).map(v=>{const l=v.linkedEntity;return l&&typeof l==='object'&&l.type==='Person'&&l.id===id?({...v,orphanedLink:{type:'Person',id},linkedEntity:null}):v})}
 if(type==='workProject')state.tasks=(state.tasks||[]).map(v=>v.projectId===id?({...v,projectId:null,orphanedProjectId:id}):v);
 if(type==='thing')state.tasks=(state.tasks||[]).map(v=>{const l=v.linkedEntity;return l&&typeof l==='object'&&l.type==='Thing'&&l.id===id?({...v,orphanedLink:{type:'Thing',id},linkedEntity:null}):v});
 if(type==='document')state.tasks=(state.tasks||[]).map(v=>{const l=v.linkedEntity;return l&&typeof l==='object'&&l.type==='Document'&&l.id===id?({...v,orphanedLink:{type:'Document',id},linkedEntity:null}):v});
 if(type==='practice'&&x.linkedHabitId)state.habits=(state.habits||[]).filter(v=>v.id!==x.linkedHabitId);
 if(type==='account')state.finance=(state.finance||[]).map(v=>{let z=v;if(v.accountId===id)z={...z,orphanedAccountId:id,accountId:null};if(v.fromAccountId===id)z={...z,orphanedFromAccountId:id,fromAccountId:null};if(v.toAccountId===id)z={...z,orphanedToAccountId:id,toAccountId:null};return z});
 if(type==='loan'){state.loanPayments=(state.loanPayments||[]).map(v=>v.loanId===id?({...v,orphanedLoanId:id,loanId:null}):v);state.finance=(state.finance||[]).map(v=>v.linkedLoanId===id?({...v,orphanedLoanId:id,linkedLoanId:null}):v)}
 await db.save();render();toast('Record deleted ✓')
}
async function deleteNote(id){return crudDelete('note',id)}
function globalServices(){achievementEngine();return `${card('🔎 Global Search',`<input placeholder="Search everything…" oninput="searchAll(this.value)"><p class="muted">Search across modules; results are bounded for responsiveness.</p>`,'span6')}${quickCapturePanel()}${remindersServiceHtml()}${achievementsHtml()}`}
function reconciliationHtml(){const sy=state.sync||{};const r=sy.reconciliation||{};if(!sy.reconciliationRequired)return '';const total=Number(r.localOnly||0)+Number(r.remoteOnly||0)+Number(r.localNewer||0)+Number(r.remoteNewer||0)+Number(r.conflicts||0);return card('🔄 Restore Reconciliation',`<p class="muted">Restored data is isolated from cloud sync until you explicitly reconcile it.</p><div class="list"><div class="row"><span>Local only</span><span>${Number(r.localOnly||0).toLocaleString()}</span></div><div class="row"><span>Cloud only</span><span>${Number(r.remoteOnly||0).toLocaleString()}</span></div><div class="row"><span>Local newer</span><span>${Number(r.localNewer||0).toLocaleString()}</span></div><div class="row"><span>Cloud newer</span><span>${Number(r.remoteNewer||0).toLocaleString()}</span></div><div class="row"><span>Conflicts</span><span>${Number(r.conflicts||0).toLocaleString()}</span></div></div><div class="actions" style="margin-top:10px"><button class="primary" onclick="reconcileNow()">Compare Cloud</button>${r&&r.total!==undefined&&total===0?'<button onclick="resumeReconciliation()">Resume Sync</button>':''}${r&&r.total!==undefined&&total>0&&sy.reconciliationRequired?'<button onclick="adoptCloudReconciliation()">Use Cloud as Local</button><button class="danger" onclick="adoptLocalReconciliation()">Use Local as Cloud</button>':''}</div><p class="muted">“Use Local as Cloud” requires the connected provider to support explicit snapshot replacement. No automatic merge or deletion is performed.</p>`,'span12')}
function syncAuthHtml(){const a=state.auth||{};const sy=state.sync||{};return card('☁️ Sync & Account',`${reconciliationHtml()}<div class="list"><div class="row"><span>Account</span><span>${esc(a.email||'Local device')}</span></div><div class="row"><span>Auth</span><span class="status">${esc(a.status||'signed-out')}</span></div><div class="row"><span>Sync</span><span>${esc(sy.status||'offline')}</span></div><div class="row"><span>Pending changes</span><span>${(sy.queue||[]).length}</span></div><div class="row"><span>Conflicts</span><span>${(sy.conflicts||[]).length}</span></div><div class="row"><span>Device ID</span><span class="muted">${esc(String(sy.deviceId||'').slice(0,16))}…</span></div></div><div class="form" style="margin-top:10px"><input id="authEmail" type="email" placeholder="Account email" value="${esc(a.email||'')}"><button class="primary" onclick="localSignIn()">Sign in locally</button><button onclick="localSignOut()">Sign out</button><button onclick="runSync()">Sync now</button></div><p class="muted">Local-first: data is saved on this device first. A real server/auth provider can be connected through the Sync adapter without changing module data.</p>`,'span12')}

async function reconcileNow(){const r=await SyncService.reconcileSnapshot();toast(r.status==='ok'?`Cloud comparison complete · ${Number(r.summary?.total||0).toLocaleString()} records checked`:r.status==='unavailable'?'Connected provider does not support reconciliation':'Reconciliation failed: '+(r.reason||r.status));render()}
async function resumeReconciliation(){const r=await SyncService.resumeReconciliationIfClean();toast(r.status==='ok'?'Sync resumed':'Differences still require reconciliation');render()}
async function adoptCloudReconciliation(){if(!confirm('Replace local domain data with the authoritative cloud snapshot? Local attachment files are preserved.'))return;const r=await SyncService.adoptCloudSnapshot();toast(r.status==='ok'?'Cloud data adopted locally':'Cloud adoption failed: '+(r.reason||r.status));render()}
async function adoptLocalReconciliation(){if(!confirm('Replace the connected cloud dataset with this restored local dataset? This is explicit and may remove cloud-only records.'))return;const r=await SyncService.adoptLocalSnapshot();toast(r.status==='ok'?'Local data adopted by cloud':'Cloud adoption failed: '+(r.reason||r.status));render()}
async function localSignIn(){const ok=await AuthService.signIn(document.getElementById('authEmail')?.value);toast(ok?'Local account ready':'Email required');render()}
async function localSignOut(){await AuthService.signOut();toast('Signed out locally');render()}
async function runSync(){const r=await SyncService.sync();toast(r.status==='offline'?'Offline — local data is safe':r.status==='ok'?'Sync complete':'Sync needs attention');render()}

function omZipCrc32(bytes){
  let c=0xFFFFFFFF;
  for(let i=0;i<bytes.length;i++){
    c^=bytes[i];
    for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xEDB88320:0);
  }
  return (c^0xFFFFFFFF)>>>0;
}
function omU16(n){return new Uint8Array([n&255,(n>>>8)&255])}
function omU32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
function omConcatBytes(parts){let n=0;for(const p of parts)n+=p.length;const out=new Uint8Array(n);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
function omZipStore(files){
  const enc=new TextEncoder(), locals=[], centrals=[]; let offset=0;
  for(const file of files){
    const name=enc.encode(file.name), data=typeof file.data==='string'?enc.encode(file.data):file.data;
    const crc=omZipCrc32(data), size=data.length;
    const local=omConcatBytes([new Uint8Array([80,75,3,4,20,0,0,0,0,0,0,0,0,0]),omU32(crc),omU32(size),omU32(size),omU16(name.length),omU16(0),name,data]);
    locals.push(local);
    const central=omConcatBytes([new Uint8Array([80,75,1,2,20,0,20,0,0,0,0,0,0,0,0,0]),omU32(crc),omU32(size),omU32(size),omU16(name.length),omU16(0),omU16(0),omU16(0),omU16(0),omU32(0),omU32(offset),name]);
    centrals.push(central); offset+=local.length;
  }
  const cd=omConcatBytes(centrals), body=omConcatBytes(locals), end=omConcatBytes([new Uint8Array([80,75,5,6,0,0,0,0]),omU16(files.length),omU16(files.length),omU32(cd.length),omU32(body.length),omU16(0)]);
  return omConcatBytes([body,cd,end]);
}
function omXml(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
function omExportRows(data){
  const rows=[['Type','ID','Title / Name','Date','Status','Domain','Amount','Updated At']];
  for(const k of ENTITY_KEYS){if(k==='attachments')continue;for(const x of data[k]||[]){rows.push([k,x.id,x.title||x.name||x.text||x.category||'',x.date||x.dueAt||x.updatedAt||'',x.status??(x.done?'Done':''),x.domain||'',x.amount??'',x.updatedAt||''])}}
  return rows;
}
function omMakeDocx(rows){
  const bodyRows=rows.map((r,i)=>`<w:tr>${r.map(v=>`<w:tc><w:tcPr><w:tcW w:w="1800" w:type="dxa"/></w:tcPr><w:p><w:r${i===0?'><w:rPr><w:b/></w:rPr>':'>'}<w:t xml:space="preserve">${omXml(String(v??''))}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`).join('');
  const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr><w:t>Om-LifeOS Export</w:t></w:r></w:p><w:p><w:r><w:t>Generated ${omXml(new Date().toLocaleString())}</w:t></w:r></w:p><w:tbl><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4"/><w:left w:val="single" w:sz="4"/><w:bottom w:val="single" w:sz="4"/><w:right w:val="single" w:sz="4"/><w:insideH w:val="single" w:sz="4"/><w:insideV w:val="single" w:sz="4"/></w:tblBorders></w:tblPr>${bodyRows}</w:tbl><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`;
  const files=[
    {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`},
    {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`},
    {name:'word/_rels/document.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`},
    {name:'word/document.xml',data:documentXml}
  ];
  return omZipStore(files);
}
function omMakeXlsx(rows){
  const sheetRows=rows.map(r=>`<row>${r.map(v=>`<c t="inlineStr"><is><t xml:space="preserve">${omXml(String(v??''))}</t></is></c>`).join('')}</row>`).join('');
  const sheet=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetData>${sheetRows}</sheetData></worksheet>`;
  const files=[
    {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`},
    {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Om-LifeOS" sheetId="1" r:id="rId1"/></sheets></workbook>`},
    {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`},
    {name:'xl/worksheets/sheet1.xml',data:sheet}
  ];
  return omZipStore(files);
}
function omPdfAscii(v){return String(v??'').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\uFFFF]/g,'?').replace(/[\\()]/g,'\\$&')}
function omMakePdf(rows){
  const lines=['Om-LifeOS Export','Generated '+new Date().toLocaleString(),'','Type | ID | Title / Name | Date | Status | Domain | Amount'];
  for(let i=1;i<rows.length;i++){const r=rows[i];lines.push(r.map(v=>String(v??'').replace(/\s+/g,' ').slice(0,80)).join(' | '))}
  const perPage=48, pages=[];for(let i=0;i<lines.length;i+=perPage)pages.push(lines.slice(i,i+perPage));
  const objs=[];objs.push('<< /Type /Catalog /Pages 2 0 R >>');objs.push('<< /Type /Pages /Kids ['+pages.map((_,i)=>`${3+i*2} 0 R`).join(' ')+'] /Count '+pages.length+' >>');
  for(let i=0;i<pages.length;i++){const content=[];content.push('BT /F1 9 Tf 40 805 Td 11 TL');pages[i].forEach((line,j)=>{if(j===0)content.push('/F1 15 Tf ('+omPdfAscii(line)+') Tj /F1 9 Tf T*');else content.push('('+omPdfAscii(line)+') Tj T*')});content.push('ET');const stream=content.join('\n');objs.push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '+(3+pages.length*2)+' 0 R >> >> /Contents '+(4+i*2)+' 0 R >>');objs.push('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream');}
  const fontId=3+pages.length*2;objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf='%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', offsets=[0];for(let i=0;i<objs.length;i++){offsets[i+1]=pdf.length;pdf+=(i+1)+' 0 obj\n'+objs[i]+'\nendobj\n'}const xref=pdf.length;pdf+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n';for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';pdf+='trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';return new TextEncoder().encode(pdf);
}
function exportWord(){try{const snap=awaitableBackupSnapshotForExport();snap.then(data=>{const bytes=omMakeDocx(omExportRows(data));download(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}),`Om-LifeOS-export-${today()}.docx`);toast('Native Word .docx export created')}).catch(e=>toast('Word export failed: '+e.message))}catch(e){toast('Word export failed: '+e.message)}}
function exportExcel(){try{const snap=awaitableBackupSnapshotForExport();snap.then(data=>{const bytes=omMakeXlsx(omExportRows(data));download(new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}),`Om-LifeOS-export-${today()}.xlsx`);toast('Native Excel .xlsx export created')}).catch(e=>toast('Excel export failed: '+e.message))}catch(e){toast('Excel export failed: '+e.message)}}
function exportPdf(){try{const snap=awaitableBackupSnapshotForExport();snap.then(data=>{const bytes=omMakePdf(omExportRows(data));download(new Blob([bytes],{type:'application/pdf'}),`Om-LifeOS-export-${today()}.pdf`);toast('Native PDF export created')}).catch(e=>toast('PDF export failed: '+e.message))}catch(e){toast('PDF export failed: '+e.message)}}

async function awaitableBackupSnapshotForExport(){return await readBackupSnapshot()}
function legacy_settings_v40(){const ii=IntegrityService.stats;const integrityCard=card('Data Integrity','<div class=\"list\"><div class=\"row\"><span>References checked</span><span class=\"status\">'+Number(ii.checked||0).toLocaleString()+'</span></div><div class=\"row\"><span>Issues / repaired</span><span class=\"muted\">'+Number(ii.issues||0)+' / '+Number(ii.repaired||0)+'</span></div></div><button onclick=\"IntegrityService.audit({repair:true}).then(()=>{render();toast(\'Integrity check complete\')})\">Run Integrity Check</button>','span12');return `<h1>Settings</h1>${migrationHtml()}<div class="grid">${syncAuthHtml()}${integrityCard}${card('Data & Storage',`<div class="actions"><button class="primary" onclick="backup()">Full Backup</button><button onclick="document.getElementById('importFile').click()">Restore / Import</button><input id="importFile" type="file" accept="application/json,.json,.omlifeos" hidden onchange="importJson(this.files[0])"><details class="export-selection-dropdown"><summary class="export-selection-summary"><span><b>Export</b><span class="muted">Word, PDF, Excel and CSV</span></span><span class="export-selection-chevron">▾</span></summary><div class="export-selection-panel"><div class="export-selection-grid"><button type="button" class="export-selection-item" onclick="exportWord()">📄 Word (.docx)</button><button type="button" class="export-selection-item" onclick="exportPdf()">📕 PDF (.pdf)</button><button type="button" class="export-selection-item" onclick="exportExcel()">📊 Excel (.xlsx)</button><button type="button" class="export-selection-item" onclick="exportCsv()">📋 CSV</button><button type="button" class="export-selection-item" onclick="exportUpdatedCsv()">📝 Updated Records CSV</button></div></div></details><button class="danger" onclick="resetData()">Reset local data</button></div><p class="muted">Full backup includes domain records, settings, metadata and attachment files. Restore validates the backup before replacing local data.</p>`,'span7')}${card('Storage Status',`<div class="list"><div class="row"><span>IndexedDB schema</span><span class="status">v15</span></div><div class="row"><span>Per-entity stores</span><span class="status">Active</span></div><div class="row"><span>Legacy migration</span><span class="status">Protected</span></div><div class="row"><span>Browser quota</span><span class="${(state.settings?.storageEstimate?.level||'ok')==='critical'?'danger':'status'}">${state.settings?.storageEstimate?.percent!=null?`${Number(state.settings.storageEstimate.percent).toFixed(1)}% used`:'Checking…'}</span></div><div class="row"><span>Write health</span><span class="${db.storageHealthy?'status':'danger'}">${db.storageHealthy?'Healthy':'Needs attention'}</span></div><div class="row"><span>Multi-tab safety</span><span class="status">Live</span></div><div class="row"><span>Cloud sync</span><span class="muted">Adapter hook</span></div><div class="row"><span>Auth</span><span class="muted">Adapter hook</span></div></div><p class="muted">At 85% usage Om-LifeOS warns; at 95% it blocks new writes before risking a quota failure. Existing records are not deleted automatically.</p>`,'span5')}</div>`}
function cloneForBackup(value){return structuredClone(value)}
async function readBackupSnapshot(){await db.save();const d=await db.open();await db.migrateLegacyIfNeeded(d);const data={};for(const k of ENTITY_KEYS){data[k]=await db.readStoreChunked(d,k,{chunk:500,yieldMs:0})}for(const k of SINGLETON_KEYS){data[k]=await new Promise((res,rej)=>{const t=d.transaction(k,'readonly'),r=t.objectStore(k).get('root');r.onsuccess=()=>res(r.result?.value??{});r.onerror=()=>rej(r.error)})}return data}
function bytesToBase64(buf){const bytes=new Uint8Array(buf);let out='';const chunk=0x8000;for(let i=0;i<bytes.length;i+=chunk)out+=String.fromCharCode(...bytes.subarray(i,i+chunk));return btoa(out)}
function base64ToBytes(s){const bin=atob(s);const out=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)out[i]=bin.charCodeAt(i);return out.buffer}
async function* attachmentBase64Parts(blob,chunkSize=0x8000){for(let offset=0;offset<blob.size;offset+=chunkSize){const buf=await blob.slice(offset,Math.min(offset+chunkSize,blob.size)).arrayBuffer();yield bytesToBase64(buf);await new Promise(r=>setTimeout(r,0))}}
async function buildBackupBlob(){const data=await readBackupSnapshot();const meta={app:'Om-LifeOS',format:'om-lifeos-backup',backupVersion:1,appVersion:'4.0.0',storageVersion:STORAGE_VERSION,exportedAt:new Date().toISOString(),data};const parts=[JSON.stringify(meta).replace(/\}$/, '')];parts.push(',\"attachments\":[');let first=true;let count=0;for(const attachment of data.attachments||[]){const row=await db.getAttachment(attachment.id);if(!first)parts.push(',');first=false;count++;const metaOnly={...attachment};delete metaOnly.blob;delete metaOnly.blobBase64;if(!row?.blob){parts.push(JSON.stringify(metaOnly));continue}parts.push(JSON.stringify(metaOnly).replace(/\}$/, '')+',\"blobBase64\":\"');for await(const chunk of attachmentBase64Parts(row.blob)){parts.push(chunk)}parts.push('\"}');await new Promise(r=>setTimeout(r,0))}parts.push(']}');return {blob:new Blob(parts,{type:'application/json'}),count}}
async function backup(){try{const result=await buildBackupBlob();download(result.blob,`Om-LifeOS-full-backup-v4.0.0.omlifeos`);toast(`Full backup exported · ${result.count} attachments`)}catch(e){toast('Backup failed: '+e.message)}}
function csvEscape(v){return '"'+String(v??'').replaceAll('"','""')+'"'}
async function exportCsv(){try{const snap=await readBackupSnapshot();const rows=[['Type','ID','Title / Name','Date','Status','Domain','Amount','Updated At']];for(const k of ENTITY_KEYS){if(k==='attachments')continue;for(const x of snap[k]||[]){rows.push([k,x.id,x.title||x.name||x.text||x.category||'',x.date||x.dueAt||'',x.status??(x.done?'Done':''),x.domain||'',x.amount??'',x.updatedAt||''])}}download(new Blob([rows.map(r=>r.map(csvEscape).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}),'Om-LifeOS-export.csv');toast('CSV exported')}catch(e){toast('CSV export failed: '+e.message)}}
async function exportUpdatedCsv(){const cutoff=prompt('Updated since (YYYY-MM-DD)',''+today().slice(0,8)+'01');if(!cutoff)return;const ts=Date.parse(cutoff);if(!Number.isFinite(ts))return toast('Invalid date');try{const snap=await readBackupSnapshot();const rows=[['Type','ID','Title / Name','Updated At']];for(const k of ENTITY_KEYS){if(k==='attachments')continue;for(const x of snap[k]||[]){const u=Date.parse(x.updatedAt||x.createdAt||0);if(u>=ts)rows.push([k,x.id,x.title||x.name||x.text||x.category||'',x.updatedAt||''])}}download(new Blob([rows.map(r=>r.map(csvEscape).join(',')).join('\n')],{type:'text/csv;charset=utf-8'}),'Om-LifeOS-updated-records.csv');toast(`${Math.max(0,rows.length-1)} updated records exported`)}catch(e){toast('Updated CSV export failed: '+e.message)}}
function download(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function validateBackup(x){
  if(!x||x.app!=='Om-LifeOS'||!x.data||typeof x.data!=='object')throw Error('Invalid Om-LifeOS backup');
  for(const k of ENTITY_KEYS)if(x.data[k]!==undefined&&!Array.isArray(x.data[k]))throw Error(`Invalid ${k} store`);
  for(const k of SINGLETON_KEYS)if(x.data[k]!==undefined&&(x.data[k]===null||typeof x.data[k]!=='object'))throw Error(`Invalid ${k} store`);
  const seen=new Set();
  for(const k of ENTITY_KEYS){for(const r of (x.data[k]||[])){if(!r||typeof r!=='object')throw Error(`Malformed ${k} record`);if(!r.id)throw Error(`Missing ID in ${k}`);const key=`${k}:${r.id}`;if(seen.has(key))throw Error(`Duplicate ID in ${k}: ${r.id}`);seen.add(key)}}
  const seenAttachments=new Set();let attachmentBytes=0;
  for(const a of (x.attachments||[])){
    if(!a?.id)throw Error('Attachment missing ID');
    if(seenAttachments.has(a.id))throw Error(`Duplicate attachment ID: ${a.id}`);seenAttachments.add(a.id);
    if(a.blobBase64!==undefined){if(typeof a.blobBase64!=='string')throw Error(`Invalid attachment data: ${a.id}`);if(a.blobBase64.length%4!==0)throw Error(`Corrupt attachment encoding: ${a.id}`);attachmentBytes+=Math.floor(a.blobBase64.length*3/4)}
  }
  return {attachmentBytes};
}

async function importJson(file){
  if(!file)return;
  let before=null;
  try{
    const raw=await file.text();
    if(raw.length>50*1024*1024)throw Error('Backup file is too large for browser restore');
    const x=JSON.parse(raw);const validation=validateBackup(x);
    const replace=confirm('Restore this backup and replace current local data? Cancel = merge records by ID.');
    before=await readBackupSnapshot();
    const currentAuth=structuredClone(state.auth||{userId:null,sessionId:null,status:'signed-out',provider:'local',email:null});
    const currentSync=structuredClone(state.sync||{deviceId:crypto.randomUUID(),queue:[],conflicts:[],status:'offline',lastSyncAt:null,queueEpoch:0,reconciliationRequired:false});
    const incoming={};
    for(const k of ENTITY_KEYS)incoming[k]=Array.isArray(x.data[k])?x.data[k]:[];
    for(const k of SINGLETON_KEYS)incoming[k]=x.data[k]??{};
    // Auth and sync are device/session state, not backup payload state.
    // Never restore another device's session or its pending cloud queue.
    incoming.auth=currentAuth;
    incoming.sync={...currentSync,queue:[],queueEpoch:Number(currentSync.queueEpoch||0)+1,status:'idle',lastSyncAt:null,reconciliationRequired:true};
    const merged=cloneForBackup(incoming);
    if(!replace){
      for(const k of ENTITY_KEYS){const map=new Map((before[k]||[]).map(r=>[r.id,r]));for(const r of incoming[k])map.set(r.id,r);merged[k]=[...map.values()]}
      for(const k of SINGLETON_KEYS)merged[k]=incoming[k]
    }
    const attachmentRows=[];
    for(const a of (x.attachments||[])){
      if(!a?.id||!a.blobBase64)continue;
      const bytes=base64ToBytes(a.blobBase64);
      const blob=new Blob([bytes],{type:a.type||'application/octet-stream'});
      attachmentRows.push({...a,blob,blobBase64:undefined});
    }
    if(validation.attachmentBytes>0){
      const guard=await db.storageGuard(validation.attachmentBytes);
      if(!guard.ok)throw new DOMException('Not enough browser storage for restore','QuotaExceededError');
    }
    Object.assign(state,merged);
    // Restore creates a new local data generation. Pending mutations from the
    // previous dataset must never be uploaded against the restored dataset.
    if(state.sync){
      state.sync.queue=[];
      state.sync.queueEpoch=Number(state.sync.queueEpoch||0)+1;
      state.sync.status='idle';
      state.sync.lastSyncAt=null;
      state.sync.reconciliationRequired=true;
      // Keep the same device/account identity, never the backup's sync identity.
      merged.auth=structuredClone(state.auth||currentAuth);
      merged.sync=structuredClone(state.sync);
    }
    await db.replaceSnapshotAtomic(merged,{attachments:attachmentRows,replace});
    db.mutationEpoch++;db.cache=structuredClone(state);db.lastSaveError=null;db.storageHealthy=true;
    if(replace)emitCrossTabCommit({type:'destructive-invalidate',reason:'restore-replace',epoch:Date.now()});
    render();toast(replace?'Backup restored atomically':'Backup merged atomically');
  }catch(e){
    if(before)Object.assign(state,before);
    const quotaLike=e?.name==='QuotaExceededError'||e?.code===22||/quota|storage.?full/i.test(String(e?.message||''));
    toast((quotaLike?'⚠️ Restore stopped — existing data was left unchanged. ':'Import failed: ')+(e?.message||'Unknown error'));
  }
}
function legacyId(prefix,i){return `legacy-${prefix}-${i}-${uid()}`}
function normalizeLegacyRecord(x,source,index){
  if(!x||typeof x!=='object')return null;
  const now=Date.now();
  return {...x,id:x.id||legacyId(source,index),createdAt:x.createdAt||x.created||x.date||now,updatedAt:x.updatedAt||now};
}
function legacyMappingReport(){return {tasks:0,notes:0,journal:0,finance:0,habits:0,routines:0,goals:0,focus:0,people:0,work:0,spiritual:0,review:0,skipped:0,warnings:[]}}
function mapLegacyData(raw){
  const r=legacyMappingReport(), out={};
  for(const k of ENTITY_KEYS)out[k]=[]; for(const k of SINGLETON_KEYS)out[k]={};
  const push=(k,v)=>{if(!v)return;out[k].push(v);r[k]=(r[k]||0)+1};
  const arr=(v)=>Array.isArray(v)?v:[];
  arr(raw.tasks).forEach((x,i)=>push('tasks',normalizeLegacyRecord(x,'task',i)));
  arr(raw.notes).forEach((x,i)=>push('notes',normalizeLegacyRecord(x,'note',i)));
  arr(raw.journal).forEach((x,i)=>push('journal',normalizeLegacyRecord(x,'journal',i)));
  arr(raw.goals).forEach((x,i)=>push('goals',normalizeLegacyRecord(x,'goal',i)));
  arr(raw.habits).forEach((x,i)=>push('habits',normalizeLegacyRecord(x,'habit',i)));
  arr(raw.routines).forEach((x,i)=>push('routines',normalizeLegacyRecord(x,'routine',i)));
  arr(raw.focusSessions?.length?raw.focusSessions:raw.focus).forEach((x,i)=>push('focus',normalizeLegacyRecord(x,'focus',i)));
  const finance=(raw.finance||[]); arr(finance).forEach((x,i)=>push('finance',normalizeLegacyRecord(x,'finance',i)));
  arr(raw.expenses).forEach((x,i)=>push('finance',normalizeLegacyRecord({...x,type:'expense'},'expense',i)));
  arr(raw.income).forEach((x,i)=>push('finance',normalizeLegacyRecord({...x,type:'income'},'income',i)));
  // Legacy finance entities: normalize only when semantics are explicit.
  // Saving transfers are NOT expenses; if account endpoints are known, preserve as transfers.
  arr(raw.savingTransfers).forEach((x,i)=>{
    const amount=Number(x?.amount||0), from=x?.fromAccountId||x?.sourceAccountId||x?.fromId||null, to=x?.toAccountId||x?.destinationAccountId||x?.toId||null;
    if(!(amount>0))return;
    if(from&&to&&from!==to){
      push('finance',{...normalizeLegacyRecord(x,'transfer',i),type:'transfer',amount,fromAccountId:from,toAccountId:to,category:x.category||'Legacy Savings Transfer',note:x.note||x.title||''});
    }else{
      out.captureDrafts.push({id:legacyId('finance-review-saving',i),type:'migration-review',title:'Legacy savings transfer needs account mapping',payload:{...x,amount},createdAt:Date.now()});r.review++;
    }
  });
  // Explicit legacy investment records become investment entities + ledger entries.
  arr(raw.investments).forEach((x,i)=>{
    const amount=Number(x?.amount??x?.investedAmount??x?.principal??0);
    if(!(amount>0))return;
    const inv=normalizeLegacyRecord(x,'investment',i);
    inv.name=inv.name||x.title||x.name||'Legacy Investment'; inv.amount=amount;
    inv.currentValue=Number(x?.currentValue??x?.value??amount); inv.date=x?.date||x?.createdAt||today();
    push('investments',inv);
    push('finance',{id:legacyId('investment-ledger',i),type:'investment',amount,category:'Legacy Investment Purchase',date:inv.date,note:inv.name,linkedInvestmentId:inv.id,createdAt:inv.createdAt||Date.now()});
  });
  arr(raw.loanPayments).forEach((x,i)=>{
    const amount=Number(x?.amount||0), principal=Number(x?.principal??x?.principalPaid??0), interest=Number(x?.interest??x?.interestPaid??Math.max(0,amount-principal));
    if(!(amount>0))return;
    const lp=normalizeLegacyRecord(x,'loan-payment',i); lp.amount=amount; lp.principal=principal>0?principal:Math.max(0,amount-interest); lp.interest=Math.max(0,interest); lp.date=x?.date||today();
    push('loanPayments',lp);
    push('finance',{id:legacyId('loan-repayment',i),type:'repayment',amount,category:'Legacy Loan Repayment',date:lp.date,note:x?.note||x?.loanName||'Legacy loan repayment',linkedLoanId:x?.loanId||null,createdAt:lp.createdAt||Date.now()});
  });
  arr(raw.loans).forEach((x,i)=>{
    const principal=Number(x?.principal??x?.amount??x?.loanAmount??0);
    if(!(principal>0))return;
    const loan=normalizeLegacyRecord(x,'loan',i); loan.name=loan.name||x.loanName||x.title||'Legacy Loan'; loan.principal=principal; loan.rate=Number(x?.rate??x?.loanRate??0); loan.tenure=Number(x?.tenure??x?.loanTenure??x?.remainingMonths??0); loan.outstanding=Number(x?.outstanding??x?.loanAmount??principal);
    push('loans',loan);
    if(x?.isDisbursement===true||x?.received===true)push('finance',{id:legacyId('loan-received',i),type:'loan',amount:principal,category:'Legacy Loan Received',date:x?.date||today(),note:loan.name,linkedLoanId:loan.id,createdAt:loan.createdAt||Date.now()});
  });
  arr(raw.assets).forEach((x,i)=>{const value=Number(x?.value??x?.amount??0);if(value>=0)push('assets',{...normalizeLegacyRecord(x,'asset',i),name:x?.name||x?.title||'Legacy Asset',value})});
  arr(raw.liabilities).forEach((x,i)=>{const amount=Number(x?.amount??x?.value??0);if(amount>=0)push('liabilities',{...normalizeLegacyRecord(x,'liability',i),name:x?.name||x?.title||'Legacy Liability',amount})});
  arr(raw.financialGoals).forEach((x,i)=>push('financialGoals',{...normalizeLegacyRecord(x,'financial-goal',i),name:x?.name||x?.title||'Legacy Financial Goal',target:Number(x?.target??x?.targetAmount??0),current:Number(x?.current??x?.currentAmount??0)}));
  arr(raw.people).forEach((x,i)=>push('people',normalizeLegacyRecord(x,'person',i)));
  arr(raw.workProjects).forEach((x,i)=>push('workProjects',normalizeLegacyRecord(x,'work',i)));
  arr(raw.learningItems).forEach((x,i)=>push('learningItems',normalizeLegacyRecord(x,'learning',i)));
  arr(raw.values).forEach((x,i)=>push('values',normalizeLegacyRecord(x,'value',i)));
  arr(raw.principles).forEach((x,i)=>push('principles',normalizeLegacyRecord(x,'principle',i)));
  arr(raw.spiritualPractices).forEach((x,i)=>push('spiritualPractices',normalizeLegacyRecord(x,'practice',i)));
  arr(raw.documents).forEach((x,i)=>push('documents',normalizeLegacyRecord(x,'document',i)));
  // Legacy seven-area  records: preserve meaning by routing to the owning domain.
  const cats=raw.categories&&typeof raw.categories==='object'?raw.categories:{};
  const route={personal:'tasks',professional:'workProjects',spiritual:'spiritualPractices',economical:'finance',mental:'healthNotes',social:'people',moral:'values'};
  for(const [area0,items] of Object.entries(cats)){
    const area=String(area0||'').toLowerCase().trim();
    for(const [i,x0] of arr(items).entries()){
      const x=normalizeLegacyRecord(x0,`life-${area}`,i); if(!x)continue;
      const target=route[area];
      if(!target){r.review++;continue}
      if(area==='economical'){
        push('finance',{...x,type:x.type||'note',amount:Number(x.amount||0),category:x.category||'Legacy Economical',note:x.text||x.title||''});
      }else if(area==='professional'){
        push('workProjects',{...x,name:x.name||x.title||'Legacy Work Item',description:x.text||x.description||'',status:x.done?'Done':'Active'});
      }else if(area==='social'){
        push('people',{...x,name:x.name||x.title||'Legacy Person',relationship:x.relationship||'Legacy'});
      }else if(area==='mental'){
        push('healthNotes',{...x,text:x.text||x.title||'Legacy Mental/Wellness Note',date:x.date||today()});
      }else if(area==='spiritual'){
        push('spiritualPractices',{...x,name:x.name||x.title||'Legacy Spiritual Practice',note:x.text||x.note||''});
      }else if(area==='moral'){
        push('values',{...x,name:x.name||x.title||'Legacy Value',description:x.text||x.description||''});
      }else{
        push('tasks',{...x,title:x.title||'Legacy Personal Item',description:x.text||x.description||'',done:!!x.done,status:x.done?'done':'open'});
      }
    }
  }
  // Old Mentor/strategy data has no exact one-to-one current entity in this compact build.
  // Preserve it in review instead of silently throwing away mission/rules/capital settings.
  if(raw.mentor||raw.mentorKpis||raw.mentorRules||raw.mentorQuotes||raw.capitalStrategy||raw.capital||raw.capitalRecords){
    out.captureDrafts.push({id:legacyId('mentor-review',0),type:'migration-review',title:'Legacy Mentor / Strategy data',payload:{mentor:raw.mentor||{},mentorKpis:raw.mentorKpis||{},mentorRules:raw.mentorRules||[],mentorQuotes:raw.mentorQuotes||[],capitalStrategy:raw.capitalStrategy||{},capital:raw.capital||{},capitalRecords:raw.capitalRecords||[]},createdAt:Date.now()});r.review++;
  }
  for(const k of ['settings','healthProfile','drafts'])out[k]=raw[k]&&typeof raw[k]==='object'?raw[k]:{};
  const known=new Set(['tasks','notes','journal','goals','habits','routines','focusSessions','focus','finance','expenses','income','savingTransfers','investments','loanPayments','loans','assets','liabilities','financialGoals','people','workProjects','learningItems','values','principles','spiritualPractices','documents','categories','mentor','mentorKpis','mentorRules','mentorQuotes','settings','healthProfile','drafts','__drafts']);
  for(const [k,v] of Object.entries(raw))if(!known.has(k)&&Array.isArray(v)&&v.length){out.captureDrafts.push({id:legacyId('review',r.review),type:'migration-review',title:`Legacy data: ${k}`,payload:v,createdAt:Date.now()});r.review++;}
  return {data:out,report:r};
}
async function saveMigrationMeta(meta){try{const d=await db.open();await new Promise((resolve,reject)=>{const t=d.transaction('migrationMeta','readwrite');t.objectStore('migrationMeta').put({id:`legacy-${Date.now()}`,...meta});t.oncomplete=resolve;t.onerror=()=>reject(t.error)});}catch(e){console.warn('migration metadata save failed',e)}}
async function importLegacyJson(file){
  if(!file)return; const status=document.getElementById('migrationStatus'); if(status)status.textContent='Reading legacy export…';
  try{
    await new Promise(r=>setTimeout(r,0));
    const raw=JSON.parse(await file.text());
    await new Promise(r=>setTimeout(r,0));
    const {data,report}=mapLegacyData(raw);
    const total=Object.values(report).filter(v=>typeof v==='number').reduce((a,b)=>a+b,0);
    if(!confirm(`Migration found ${total} mapped/review items. Continue? Current data will be merged by ID; existing records are not deleted.`))return;
    let processed=0;
    for(const k of ENTITY_KEYS){
      if(k==='attachments')continue;
      const incoming=data[k]||[];if(!incoming.length)continue;
      const map=new Map((state[k]||[]).map(x=>[x.id,x]));
      for(const x of incoming)if(x?.id){map.set(x.id,x);processed++;if(processed%250===0){if(status)status.textContent=`Migrating… ${processed}/${Math.max(1,total)}`;await new Promise(r=>setTimeout(r,0))}}
      state[k]=[...map.values()];
      await new Promise(r=>setTimeout(r,0));
    }
    for(const k of SINGLETON_KEYS)if(data[k]&&Object.keys(data[k]).length)state[k]={...(state[k]||{}),...data[k]};
    await db.save(); await saveMigrationMeta({type:'legacy-json',source:file.name,completedAt:Date.now(),report});
    if(status)status.textContent=`✓ Migration complete · mapped ${total} · review ${report.review}`;
    render(); toast(`Legacy migration complete · ${total} items processed`);
  }catch(e){if(status)status.textContent='Migration failed: '+e.message;toast('Legacy migration failed: '+e.message)}
}
function migrationHtml(){return card('🔄 Legacy Migration',`<p class="muted">Import an old Om-LifeOS JSON export. The mapper understands v1/v2 arrays and the old seven  areas. Existing records are merged by ID; ambiguous Mentor/unknown data goes to Migration Review instead of being discarded.</p><div class="actions"><button class="primary" onclick="document.getElementById('legacyImportInput').click()">📂 Import Legacy JSON</button><input id="legacyImportInput" type="file" accept=".json,application/json" style="display:none" onchange="importLegacyJson(this.files[0])"></div><div id="migrationStatus" class="status" style="margin-top:10px">No migration run yet.</div>`,'span12')}

async function resetData(){if(!confirm('Reset all local Om-LifeOS data? This cannot be undone without a backup.'))return;db.mutationEpoch++;db.saveQueue=db.saveQueue.then(async()=>{try{await db.clearAll();}catch(e){toast('Reset failed: '+(e?.message||'Storage error'));throw e}for(const k of Object.keys(state)){if(Array.isArray(state[k]))state[k]=[];else if(k==='settings'||k==='healthProfile'||k==='drafts')state[k]={};}
    if(state.sync){state.sync.queue=[];state.sync.queueEpoch=Number(state.sync.queueEpoch||0)+1;state.sync.status='idle';state.sync.lastSyncAt=null;state.sync.reconciliationRequired=false;state.sync.reconciliation=null;}try{for(const k of ['noteTitle','notePoints','journalTitle'])localStorage.removeItem(draftKey(k));localStorage.removeItem(KEY)}catch{};db.cache=structuredClone(state);db.lastSaveError=null;db.storageHealthy=true;emitCrossTabCommit({type:'destructive-invalidate',reason:'reset',epoch:Date.now()});render();toast('Local data reset')}).catch(()=>{});await db.saveQueue}
const ReminderService={
 timer:null,
 scheduleFlight:null,
 permissionAsked:false,
 normalize(r){
  if(!r||typeof r!=='object')return null;
  r.id=r.id||uid(); r.title=String(r.title||'Reminder').trim()||'Reminder';
  r.repeatRule=['none','daily','weekly','monthly'].includes(r.repeatRule)?r.repeatRule:'none';
  r.status=r.status==='done'?'done':'open'; r.createdAt=Number(r.createdAt||Date.now()); r.updatedAt=Number(r.updatedAt||r.createdAt);
  r.linkedType=r.linkedType??null; r.linkedId=r.linkedId??null; r.lastNotifiedAt=Number(r.lastNotifiedAt||0);
  return r;
 },
 nextDue(r,fromMs){
  const base=Date.parse(r.dueAt); if(!Number.isFinite(base))return null;
  let d=new Date(base);
  const from=Math.max(Number(fromMs)||Date.now(),base+1);
  if(r.repeatRule==='none')return null;
  let guard=0;
  while(d.getTime()<from && guard++<10000){
   if(r.repeatRule==='daily')d.setDate(d.getDate()+1);
   else if(r.repeatRule==='weekly')d.setDate(d.getDate()+7);
   else if(r.repeatRule==='monthly'){
    const day=d.getDate(),targetMonth=d.getMonth()+1;
    d.setDate(1);d.setMonth(targetMonth);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(day,last));
   } else break;
  }
  return d.getTime();
 },
 async notify(r,now){
  const key=Number(now||Date.now());
  if(r.lastNotifiedAt && key-r.lastNotifiedAt<30000)return false;
  r.lastNotifiedAt=key;r.updatedAt=key;
  const event={id:uid(),type:'reminder',reminderId:r.id,title:r.title,dueAt:r.dueAt,createdAt:key,linkedType:r.linkedType,linkedId:r.linkedId};
  state.notifications=Array.isArray(state.notifications)?state.notifications:[];
  state.notifications.unshift(event);state.notifications=state.notifications.slice(0,500);
  try{
   if('Notification' in window){
    if(Notification.permission==='default'&&!this.permissionAsked){this.permissionAsked=true;try{await Notification.requestPermission()}catch{}}
    if(Notification.permission==='granted')new Notification(r.title,{body:`Reminder due${r.linkedType?` · ${r.linkedType}`:''}`,tag:`lifeos-reminder-${r.id}`});
   }
  }catch(e){console.warn('Reminder notification failed',e)}
  return true;
 },
 async processDue(now=Date.now()){
  let changed=false;
  for(const raw of (state.reminders||[])){
   const r=this.normalize(raw); if(!r||r.status==='done')continue;
   const due=Date.parse(r.dueAt); if(!Number.isFinite(due)||due>now)continue;
   if(r.repeatRule==='none'){
    if(r.lastNotifiedAt)continue;
    await this.notify(r,now);changed=true;
   }else{
    await this.notify(r,now);let next=this.nextDue(r,now+1);if(next){r.dueAt=new Date(next).toISOString().slice(0,16);r.lastNotifiedAt=now;r.updatedAt=now;changed=true}else{r.status='done';r.updatedAt=now;changed=true}
   }
  }
  if(changed)await db.save();
  return changed;
 },
 async schedule(){
  if(this.scheduleFlight)return this.scheduleFlight;
  this.scheduleFlight=(async()=>{
   clearTimeout(this.timer);this.timer=null;
   const now=Date.now();await this.processDue(now);
   let next=Infinity;
   for(const r of (state.reminders||[])){
    if(!r||r.status==='done')continue;const t=Date.parse(r.dueAt);if(Number.isFinite(t)&&t>now)next=Math.min(next,t);
   }
   if(next!==Infinity){const delay=Math.min(Math.max(250,next-Date.now()),2147483647);this.timer=setTimeout(()=>this.schedule().catch(e=>console.warn('Reminder scheduler error',e)),delay)}
  })().finally(()=>{this.scheduleFlight=null});
  return this.scheduleFlight;
 },
 async init(){try{for(const r of state.reminders||[])this.normalize(r);await this.schedule()}catch(e){console.warn('Reminder scheduler init failed',e)}}
};
window.OmLifeOSReminders=ReminderService;
function openQuickReminder(){
 const title=prompt('Reminder title?');if(!title?.trim())return;
 const date=prompt('Date (YYYY-MM-DD)',today())||today();const time=prompt('Time (HH:MM)','09:00')||'09:00';
 state.reminders.push({id:uid(),title:title.trim(),dueAt:`${date}T${time}`,repeatRule:'none',status:'open',linkedType:null,linkedId:null,createdAt:Date.now(),updatedAt:Date.now(),lastNotifiedAt:0});db.save().then(()=>ReminderService.schedule()).catch(()=>{});toast('Reminder saved');render();
}
function completeReminder(id){const r=state.reminders.find(x=>x.id===id);if(!r)return;r.status='done';r.completedAt=Date.now();r.updatedAt=r.completedAt;db.save().then(()=>ReminderService.schedule()).catch(()=>{});render()}
function deleteReminder(id){state.reminders=state.reminders.filter(x=>x.id!==id);db.save().then(()=>ReminderService.schedule()).catch(()=>{});render()}
function topDueReminders(list,limit=20){
  const out=[];
  for(const r of (Array.isArray(list)?list:[])){
    if(!r||r.status==='done')continue;
    const key=String(r.dueAt||'');
    let lo=0,hi=out.length;
    while(lo<hi){const m=(lo+hi)>>1;if(String(out[m].dueAt||'')<=key)lo=m+1;else hi=m;}
    if(lo<limit)out.splice(lo,0,r);
    if(out.length>limit)out.pop();
  }
  return out;
}
function remindersServiceHtml(){const now=Date.now(),rows=topDueReminders(state.reminders,20);return card('⏰ Reminders',`<div class="actions"><button class="primary" onclick="openQuickReminder()">Add Reminder</button></div><div class="list">${rows.map(r=>{const overdue=Date.parse(r.dueAt)<now;return `<div class="row"><span><b>${esc(r.title)}</b><div class="muted ${overdue?'error':''}">${esc(r.dueAt||'')} · ${esc(r.repeatRule||'none')}${overdue?' · overdue':''}</div></span><span class="actions"><button onclick="completeReminder('${r.id}')">Done</button><button class="danger" onclick="deleteReminder('${r.id}')">Delete</button></span></div>`}).join('')||'<span class="muted">No active reminders.</span>'}</div>`,'span6')}
async function globalSearchResults(q){
  q=String(q||'').trim().toLowerCase();if(!q)return[];
  try{const rows=await db.searchIndex(q,100);return rows.map(h=>({k:h.entity,x:{id:h.recordId,title:h.title||h.recordId,_searchText:h.text}}))}
  catch(e){console.warn('search index unavailable; bounded fallback',e);const hits=[];const skip=new Set(['settings','drafts','captureDrafts','notifications','achievements']);for(const [k,v] of Object.entries(state)){if(skip.has(k)||!Array.isArray(v))continue;for(let i=0;i<v.length;i+=250){const end=Math.min(v.length,i+250);for(let j=i;j<end;j++){const x=v[j],hay=[x?.title,x?.name,x?.text,x?.body,x?.description,x?.category,x?.tags,x?.note,x?.id].map(z=>String(z??'')).join(' ').toLowerCase();if(hay.includes(q))hits.push({k,x});if(hits.length>=100)return hits}if(end<v.length)await new Promise(r=>setTimeout(r,0));}}return hits}
}
let searchTimer;function searchAll(q){clearTimeout(searchTimer);searchTimer=setTimeout(async()=>{q=String(q||'').trim();if(!q){if(state.active==='dashboard')render();return}const hits=await globalSearchResults(q);document.getElementById('content').innerHTML=`<h1>🔎 Search</h1><p class="muted">${hits.length} result${hits.length===1?'':'s'} found.</p>${card('Results',`<div class="list">${hits.map(h=>`<div class="row"><span><b>${esc(h.k)}</b> · ${esc(h.x.title||h.x.name||h.x.text||h.x.category||h.x.id)}</span><button onclick="show('${['tasks','notes','journal','finance','goals','people','health','work','spiritual','things'].includes(h.k)?h.k:'dashboard'}')">Open</button></div>`).join('')||'<span class="muted">No results.</span>'}</div>`,'span12')}`},150)}
let achievementCacheKey='',achievementCache=null;
function achievementEngine(){const key=String(db.mutationEpoch||0)+'|'+String(runtimeRevision||0)+'|'+String(state.tasks?.length||0)+'|'+String(state.notes?.length||0)+'|'+String(state.journal?.length||0)+'|'+String(state.goals?.length||0)+'|'+String(state.focus?.length||0)+'|'+String(state.finance?.length||0);if(achievementCacheKey===key&&Array.isArray(achievementCache))return achievementCache;let focusSeconds=0;for(const x of (state.focus||[]))focusSeconds+=Number(x?.durationSeconds||x?.seconds||Number(x?.minutes||0)*60);const rules=[['first-task','First Task',state.tasks.length>=1],['ten-tasks','10 Tasks',state.tasks.length>=10],['first-note','First Note',state.notes.length>=1],['first-journal','First Journal',state.journal.length>=1],['first-goal','First Goal',state.goals.length>=1],['focus-60','60 Focus Minutes',focusSeconds>=3600],['finance-first','First Finance Record',(state.finance||[]).length>=1]];
 const existing=new Map((state.achievements||[]).map(x=>[x.id,x]));for(const [id,title,ok] of rules)if(ok&&!existing.has(id))existing.set(id,{id,title,unlockedAt:Date.now()});state.achievements=[...existing.values()];achievementCacheKey=key;achievementCache=state.achievements;return state.achievements}
function achievementsHtml(){const a=achievementEngine();return card('🏆 Achievements',`<div class="list">${a.map(x=>`<div class="row"><span><b>${esc(x.title)}</b><div class="muted">Unlocked ${new Date(x.unlockedAt).toLocaleDateString()}</div></span><span class="status">Unlocked</span></div>`).join('')||'<span class="muted">No achievements yet. Keep using the app.</span>'}</div>`,'span6')}
async function capture(type){
  if(!type){type=prompt('Capture type: task, note, journal, expense, goal, reminder, person','task');if(!type)return;}
  const t=String(type||'').toLowerCase();
  try{
    if(t==='task'){const title=prompt('Task title?');if(!title?.trim())return;state.tasks.push({id:uid(),title:title.trim(),description:'',domain:'personal',status:'open',priority:'Medium',dueAt:'',createdAt:Date.now(),updatedAt:Date.now()});}
    else if(t==='note'){const title=prompt('Note title?');if(!title?.trim())return;const body=prompt('Note text?')||'';state.notes.push({id:uid(),title:title.trim(),body,html:esc(body).replace(/\n/g,'<br>'),category:'Quick Capture',tags:'',color:'#fff8c5',date:today(),attachments:[],createdAt:Date.now(),updatedAt:Date.now()});}
    else if(t==='journal'){const text=prompt('Journal reflection?');if(!text?.trim())return;state.journal.push({id:uid(),title:'Quick Journal',text:text.trim(),html:esc(text.trim()).replace(/\n/g,'<br>'),date:today(),color:'#eef6ff',attachments:[],createdAt:Date.now(),updatedAt:Date.now()});}
    else if(t==='expense'){const amount=Number(prompt('Expense amount?')||0);if(!(amount>0))return toast('Valid expense amount required');state.finance.push({id:uid(),type:'expense',amount,category:'Quick Capture',date:today(),note:prompt('Expense note?')||'',createdAt:Date.now()});}
    else if(t==='goal'){const title=prompt('Goal title?');if(!title?.trim())return;state.goals.push({id:uid(),title:title.trim(),date:'',progress:0,createdAt:Date.now(),updatedAt:Date.now()});}
    else if(t==='reminder'){const title=prompt('Reminder title?');if(!title?.trim())return;const date=prompt('Date (YYYY-MM-DD)',today())||today();const time=prompt('Time (HH:MM)','09:00')||'09:00';state.reminders.push({id:uid(),title:title.trim(),dueAt:`${date}T${time}`,repeatRule:'none',status:'open',linkedType:null,linkedId:null,createdAt:Date.now(),updatedAt:Date.now(),lastNotifiedAt:0});}
    else if(t==='person'){const name=prompt('Person name?');if(!name?.trim())return;state.people.push({id:uid(),name:name.trim(),relationship:'',contact:'',importantDate:'',createdAt:Date.now()});}
    else return toast('Unknown capture type');
    await db.save();if(t==='reminder')await ReminderService.schedule();render();toast('Captured ✓');
  }catch(e){console.warn('Quick Capture failed',e);toast('Capture failed safely');}
}
function quickCapturePanel(){return card('＋ Quick Capture',`<div class="actions"><button onclick="capture('task')">Task</button><button onclick="capture('note')">Note</button><button onclick="capture('journal')">Journal</button><button onclick="capture('expense')">Expense</button><button onclick="capture('goal')">Goal</button><button onclick="capture('reminder')">Reminder</button><button onclick="capture('person')">Person</button></div><p class="muted">Capture only routes to the correct owner module; no duplicate Inbox database.</p>`,'span6')}
function normalizeLoadedState(){
  state.financeAccounts=Array.isArray(state.financeAccounts)?state.financeAccounts:[];state.savingsPlans=Array.isArray(state.savingsPlans)?state.savingsPlans:[];state.investments=Array.isArray(state.investments)?state.investments:[];state.loans=Array.isArray(state.loans)?state.loans:[];state.loanPayments=Array.isArray(state.loanPayments)?state.loanPayments:[];state.assets=Array.isArray(state.assets)?state.assets:[];state.liabilities=Array.isArray(state.liabilities)?state.liabilities:[];state.financialGoals=Array.isArray(state.financialGoals)?state.financialGoals:[];state.attachments=Array.isArray(state.attachments)?state.attachments:[];state.calcHistory=Array.isArray(state.calcHistory)?state.calcHistory:[];state.calcFavorites=Array.isArray(state.calcFavorites)?state.calcFavorites:[];for(const k of ['capitalStrategy','capital','capitalRecords'])state[k]=Array.isArray(state[k])?state[k]:(state[k]&&typeof state[k]==='object'?[{id:uid(),...state[k],migratedFromLegacy:true,createdAt:Date.now()}]:[]);for(const k of ['reminders','notifications','achievements','captureDrafts'])state[k]=Array.isArray(state[k])?state[k]:[];const ARR=['routineOccurrences','habitLogs','milestones','strategies','kpis','missions','mentorRules','mentorQuotes','healthMeasurements','healthActivities','sleepRecords','nutritionRecords','waterRecords','healthAppointments','healthNotes','workProjects','workResponsibilities','meetings','learningItems','skills','courses','learningProgress','relationships','interactions','importantDates','relationshipReminders','values','principles','spiritualPractices','commitments','documents','documentCollections','warranties','receipts','certificates','importantRecords'];for(const k of ARR)state[k]=Array.isArray(state[k])?state[k]:[];state.healthProfile=state.healthProfile&&typeof state.healthProfile==='object'?state.healthProfile:{};
}

/* ===================== FINAL UI / FEATURE-PARITY LAYER ===================== */
function closeEntityModal(){document.getElementById('entityModal')?.classList.remove('open')}
function toggleMobileNav(force){const drawer=document.getElementById('mobileNavDrawer'),back=document.getElementById('mobileNavBackdrop'),btn=document.getElementById('mobileMenuButton');if(!drawer)return;const open=force===undefined?!drawer.classList.contains('open'):!!force;drawer.classList.toggle('open',open);back?.classList.toggle('open',open);btn?.setAttribute('aria-expanded',String(open))}
function pageHeader(title,subtitle,actions=''){const el=document.getElementById('pageTitle');if(el)el.textContent=title;const m=document.getElementById('mobilePageTitle');if(m)m.textContent=title;return `<div class="module-hero"><div class="eyebrow">OM-LIFEOS</div><h2 style="font-size:22px;margin:5px 0">${esc(title)}</h2><p style="color:#e5e7eb;margin:0">${esc(subtitle||'')}</p>${actions?`<div class="hero-actions">${actions}</div>`:''}</div>`}
function progressBar(p){const n=Math.max(0,Math.min(100,Number(p)||0));return `<div class="progress"><i style="width:${n}%"></i></div>`}
function safeArr(k){return Array.isArray(state[k])?state[k]:[]}
function countToday(list,dateField='date'){const d=today();return safeArr(list).filter(x=>String(x?.[dateField]||'').slice(0,10)===d).length}
function mentorProfile(){state.settings=state.settings&&typeof state.settings==='object'?state.settings:{};state.settings.notificationsEnabled=state.settings.notificationsEnabled!==false;state.settings.mentor=state.settings.mentor&&typeof state.settings.mentor==='object'?state.settings.mentor:{};return state.settings.mentor}
async function saveMentorProfile(){const p=mentorProfile();for(const [id,key] of [['mentorMission','mission'],['mentorStartDate','startDate'],['mentorStartingCapital','startingCapital'],['mentorSurvival','survivalReserve'],['mentorEmergency','emergencyReserve'],['mentorCareer','careerFund'],['mentorOpportunity','opportunityFund'],['mentorDailyBurn','dailyBurn'],['mentorMonthlyBurn','monthlyBurn'],['mentorSaveMonthly','savingTargetMonthly'],['mentorSaveGoal','savingGoalAmount'],['mentorSaveDuration','savingDuration'],['mentorDailyTarget','savingDailyTarget'],['mentorBalanceMode','balanceMode'],['mentorManualBalance','manualBalance'],['mentorLoanName','loanName'],['mentorLoanPrincipal','loanOriginalPrincipal'],['mentorLoanTenure','loanTenure'],['mentorLoanRemaining','loanRemainingMonths'],['mentorLoanStart','loanStartDate'],['mentorEmi','emiAmount'],['mentorEmiDay','emiDay']]){const el=document.getElementById(id);if(!el)continue;const v=el.value;p[key]=['startingCapital','survivalReserve','emergencyReserve','careerFund','opportunityFund','dailyBurn','monthlyBurn','savingTargetMonthly','savingGoalAmount','savingDuration','savingDailyTarget','manualBalance','loanOriginalPrincipal','loanTenure','loanRemainingMonths','emiAmount','emiDay'].includes(key)?Number(v||0):v}p.updatedAt=Date.now();await db.save();render();toast('Mentor strategy saved')}
function mentorSummary(){const p=mentorProfile(),f=financeSummary();const reserves=Number(p.survivalReserve||0)+Number(p.emergencyReserve||0)+Number(p.careerFund||0)+Number(p.opportunityFund||0);const available=Math.max(0,Number(f.cash||0));const runway=Number(p.dailyBurn||0)>0?available/Number(p.dailyBurn):null;const savingTarget=Number(p.savingGoalAmount||0);const savingCurrent=safeArr('savingsPlans').reduce((a,x)=>a+Number(x.currentAmount||0),0);return {...f,reserves,available,runway,savingTarget,savingCurrent,savingProgress:savingTarget>0?savingCurrent/savingTarget*100:0}}
function mentorPanel(){const p=mentorProfile(),m=mentorSummary();return `${card('🧭 Mentor & Capital',`<div class="form"><input id="mentorMission" class="full" placeholder="Mission / life direction" value="${esc(p.mission||'')}"><input id="mentorStartDate" type="date" value="${esc(p.startDate||'')}"><input id="mentorStartingCapital" type="number" placeholder="Starting capital" value="${p.startingCapital||''}"><input id="mentorSurvival" type="number" placeholder="Survival reserve" value="${p.survivalReserve||''}"><input id="mentorEmergency" type="number" placeholder="Emergency reserve" value="${p.emergencyReserve||''}"><input id="mentorCareer" type="number" placeholder="Career fund" value="${p.careerFund||''}"><input id="mentorOpportunity" type="number" placeholder="Opportunity fund" value="${p.opportunityFund||''}"><input id="mentorDailyBurn" type="number" placeholder="Daily burn" value="${p.dailyBurn||''}"><input id="mentorMonthlyBurn" type="number" placeholder="Monthly burn" value="${p.monthlyBurn||''}"><input id="mentorSaveMonthly" type="number" placeholder="Monthly saving target" value="${p.savingTargetMonthly||''}"><input id="mentorSaveGoal" type="number" placeholder="Saving goal amount" value="${p.savingGoalAmount||''}"><input id="mentorSaveDuration" type="number" placeholder="Saving duration (months)" value="${p.savingDuration||''}"><input id="mentorDailyTarget" type="number" placeholder="Daily target" value="${p.savingDailyTarget||''}"><select id="mentorBalanceMode"><option value="auto" ${p.balanceMode!=='manual'?'selected':''}>Auto financial balance</option><option value="manual" ${p.balanceMode==='manual'?'selected':''}>Manual balance</option></select><input id="mentorManualBalance" type="number" placeholder="Manual balance" value="${p.manualBalance||''}"><div class="actions full"><button class="primary" onclick="saveMentorProfile()">Save Mentor Strategy</button></div></div>`,'span7')}${card('Capital Position',`<div class="kpi-grid"><div class="kpi-box"><div class="label">Cash / Accounts</div><div class="value">₹${m.cash.toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div><div class="kpi-box"><div class="label">Net Worth</div><div class="value">₹${m.netWorth.toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div><div class="kpi-box"><div class="label">Runway</div><div class="value">${m.runway==null?'—':m.runway.toFixed(1)+' d'}</div></div><div class="kpi-box"><div class="label">Savings</div><div class="value">${m.savingTarget?Math.min(100,m.savingProgress).toFixed(0)+'%':'—'}</div></div></div><div style="margin-top:10px">${m.savingTarget?progressBar(m.savingProgress):''}</div><p class="muted" style="margin-top:8px">Reserves tracked: ₹${m.reserves.toLocaleString('en-IN',{maximumFractionDigits:0})} · Monthly burn: ₹${Number(p.monthlyBurn||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</p>`,'span5')}`}
function dashboard(){const f=financeSummary(),pending=safeArr('tasks').filter(x=>!x.done),todayTasks=pending.filter(x=>String(x.dueAt||x.date||'').slice(0,10)===today()).slice(0,12),goals=safeArr('goals'),notes=safeArr('notes').slice(-5).reverse(),journals=safeArr('journal').slice(-5).reverse(),rem=safeArr('reminders').filter(x=>x.status!=='completed').slice().sort((a,b)=>String(a.dueAt).localeCompare(String(b.dueAt))).slice(0,8),hab=safeArr('habits'),routine=safeArr('routines');achievementEngine();return `${pageHeader('Dashboard','One place for today, planning, goals, focus, health, finance and relationships.') }<div class="kpi-grid"><div class="kpi-box"><div class="label">Open tasks</div><div class="value">${pending.length}</div></div><div class="kpi-box"><div class="label">Goals</div><div class="value">${goals.length}</div></div><div class="kpi-box"><div class="label">Habits</div><div class="value">${hab.length}</div></div><div class="kpi-box"><div class="label">Net cash flow</div><div class="value">₹${Number(f.cashFlow||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div></div><div class="grid" style="margin-top:10px">${card('📅 Today & Planner',`${todayTasks.map(x=>`<div class="row"><span><b>${x.done?'✓ ':''}${esc(x.title)}</b><div class="muted">${esc(x.priority||'Medium')} · ${esc(x.domain||'personal')}</div></span><button onclick="show('tasks')">Open</button></div>`).join('')||'<p class="muted">No tasks due today.</p>'}<div class="actions"><button onclick="show('tasks')">Open Tasks & Planner</button><button onclick="capture('task')">＋ Quick Task</button></div>`,'span6')}${card('🎯 Strategy',`${goals.slice(-5).reverse().map(x=>`<div class="row"><span>${esc(x.title)}</span><span>${Number(x.progress||0)}%</span></div>${progressBar(x.progress)}`).join('')||'<p class="muted">No goals yet.</p>'}<div class="actions"><button onclick="show('goals')">Open Goals & Strategy</button></div>`,'span6')}${card('🔁 Routine & Habits',`${routine.slice(-4).reverse().map(x=>`<div class="row"><span>${esc(x.name)}</span><span class="muted">${esc(x.time||'')}</span></div>`).join('')||'<p class="muted">No routines yet.</p>'}${hab.slice(-4).reverse().map(x=>`<div class="row"><span>${esc(x.name)}</span><button onclick="logHabit('${x.id}')">${x.doneDate===today()?'✓ Done':'Log'}</button></div>`).join('')}<div class="actions"><button onclick="show('routine')">Open Routine & Habits</button></div>`,'span4')}${card('⏱ Focus',`${latestRows(safeArr('focus'),4).map(x=>`<div class="row"><span>${esc(x.label||'Focus')}</span><span>${formatFocusSeconds(Number(x.durationSeconds)||Number(x.minutes||0)*60)}</span></div>`).join('')||'<p class="muted">No focus sessions yet.</p>'}<div class="actions"><button onclick="show('focus')">Start Focus</button></div>`,'span4')}${card('💰 Finance',`<div class="row"><span>Income</span><b>₹${f.income.toLocaleString('en-IN',{maximumFractionDigits:0})}</b></div><div class="row"><span>Expenses</span><b>₹${f.expense.toLocaleString('en-IN',{maximumFractionDigits:0})}</b></div><div class="row"><span>Net worth</span><b>₹${f.netWorth.toLocaleString('en-IN',{maximumFractionDigits:0})}</b></div><div class="actions"><button onclick="show('finance')">Open Finance</button></div>`,'span4')}${card('❤️ Health & People',`<div class="row"><span>Health measurements</span><b>${safeArr('healthMeasurements').length}</b></div><div class="row"><span>People</span><b>${safeArr('people').length}</b></div><div class="row"><span>Relationships</span><b>${safeArr('relationships').length}</b></div><div class="actions"><button onclick="show('health')">Health</button><button onclick="show('people')">People</button></div>`,'span4')}${card('🔔 Reminders',`${rem.map(x=>`<div class="row"><span>${esc(x.title)}</span><span class="muted">${esc(x.dueAt||'')}</span></div>`).join('')||'<p class="muted">No active reminders.</p>'}`,'span4')}${card('📝 Recent Notes & Journal',`${notes.map(x=>`<div class="row"><span><b>Note</b> · ${esc(x.title)}</span><span class="muted">${esc(x.date||'')}</span></div>`).join('')}${journals.map(x=>`<div class="row"><span><b>Journal</b> · ${esc(x.title)}</span><span class="muted">${esc(x.date||'')}</span></div>`).join('')||'<p class="muted">No recent writing.</p>'}<div class="actions"><button onclick="show('notes')">Notes</button><button onclick="show('journal')">Journal</button></div>`,'span6')}${achievementsHtml()}${globalServices()}</div>`}
function tasks(){const plan=state.settings?.dailyPlanner&&state.settings.dailyPlanner.date===today()?state.settings.dailyPlanner:{date:today(),target:'',progress:0,points:[],wins:[],reflection:[]};const due=safeArr('tasks').filter(x=>String(x.dueAt||x.date||'').slice(0,10)===today());window.OmLifeOSListRenderers.tasks=(limit=RENDER_PAGE_SIZE)=>latestRows(state.tasks,limit).map(x=>`<div class="row"><span><b>${x.done?'✓ ':''}${esc(x.title)}</b><div class="muted">${esc(x.domain||'personal')} · ${esc(x.dueAt||x.date||'')} · ${esc(x.priority||'Medium')}</div>${x.description?`<div class="muted">${esc(x.description)}</div>`:''}</span><div class="actions"><button onclick="toggleTask('${x.id}')">${x.done?'Undo':'Done'}</button><button onclick="crudEdit('task','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('task','${x.id}')">Delete</button></div></div>`).join('');return `${pageHeader('Tasks & Planner','One planning surface for tasks plus a measurable daily command center. The old daily planner concepts—target, point-wise plan, achievements and reflection—live here instead of a separate duplicate module.')}<div class="grid">${card('＋ Add Task',`<div class="form"><input id="taskTitle" class="full" placeholder="Task title"><select id="taskDomain"><option>personal</option><option>work</option><option>health</option><option>finance</option><option>spiritual</option><option>social</option><option>learning</option></select><input id="taskDate" type="date" value="${today()}"><select id="taskPriority"><option>High</option><option selected>Medium</option><option>Low</option></select><input id="taskProjectId" placeholder="Project ID (optional)"><select id="taskGoalId"><option value="">Goal (optional)</option>${safeArr('goals').slice(-100).reverse().map(g=>`<option value="${esc(g.id)}">${esc(g.title)}</option>`).join('')}</select><input id="taskDesc" class="full" placeholder="Description"><button class="primary full" onclick="addTask()">Add Task</button></div>`,'span4')}${card('📅 Daily Command Center',`<div class="form"><label><span class="label">Today's success target</span><textarea id="dailyTarget" maxlength="500" placeholder="What makes today successful?">${esc(plan.target||'')}</textarea></label><label><span class="label">Execution progress <output id="dailyProgressOutput">${Number(plan.progress||0)}%</output></span><input id="dailyProgressRange" type="range" min="0" max="100" step="5" value="${Number(plan.progress||0)}" oninput="document.getElementById('dailyProgressOutput').value=this.value+'%'"></label><input id="plannerPointInput" placeholder="Add one action point and press Enter" onkeydown="if(event.key==='Enter'){event.preventDefault();addPlannerPoint()}"><div id="plannerPoints" class="list">${(plan.points||[]).map((p,i)=>`<div class="row"><span>${p.done?'✓ ':''}${esc(p.text)}</span><button onclick="togglePlannerPoint(${i})">${p.done?'Undo':'Done'}</button></div>`).join('')||'<p class="muted">No action points yet.</p>'}</div><div class="actions"><button class="primary" onclick="saveDailyPlan()">Save plan</button><button onclick="setPlannerProgress(0)">Reset progress</button><button class="danger" onclick="deleteTodayPlan()">Delete day</button></div></div>`,'span4')}${card('📊 Today Flow',`<div class="row"><span>Tasks due today</span><b>${due.length}</b></div><div class="row"><span>Tasks completed</span><b>${due.filter(x=>x.done).length}</b></div><div class="row"><span>Plan points</span><b>${(plan.points||[]).filter(x=>x.done).length}/${(plan.points||[]).length}</b></div><div class="row"><span>Progress</span><b>${Number(plan.progress||0)}%</b></div><div class="actions"><button onclick="show('goals')">Link work to Goals</button><button onclick="show('focus')">Start Focus</button></div>`,'span4')}${card('🏆 Wins & Reflection',`<div class="form"><textarea id="plannerWins" placeholder="What did you accomplish?">${esc((plan.wins||[]).join('\n'))}</textarea><textarea id="plannerReflection" placeholder="What should you learn or improve?">${esc((plan.reflection||[]).join('\n'))}</textarea><button onclick="saveDailyPlan()">Save reflection</button></div>`,'span4')}${card('All Tasks',`<div id="taskList" class="list" data-list-type="tasks">${window.OmLifeOSListRenderers.tasks()}</div>`,'span8')}</div>`}
function routine(){const rs=safeArr('routines').filter(x=>x.active!==false).slice().sort((a,b)=>String(a.startTime||a.time||'').localeCompare(String(b.startTime||b.time||'')));const hs=safeArr('habits').slice().reverse();const todayLogs=safeArr('habitLogs').filter(x=>x.date===today());return `${pageHeader('Routine & Habits','Time-block routines and repeated habits in one workspace. Habits keep frequency, multiple daily occurrences, timing and logs without creating a second task system.')}<div class="grid">${card('🔁 Routine Time Block',`<div class="form"><input id="routineName" placeholder="Routine / activity"><div class="formgrid"><label><span class="label">Start</span><input id="routineStart" type="time"></label><label><span class="label">End</span><input id="routineEnd" type="time"></label></div><select id="routineCategory"><option value="personal">Personal</option><option value="work">Professional</option><option value="learning">Learning</option><option value="health">Health</option><option value="spiritual">Values & Spiritual</option><option value="social">People & Relationships</option></select><select id="routineFreq"><option value="daily">Daily</option><option value="weekdays">Weekdays</option><option value="weekly">Weekly</option><option value="custom">Custom / as needed</option></select><input id="routineNote" placeholder="Short note"><button class="primary full" onclick="addRoutine()">＋ Add Time Block</button></div>`,'span4')}${card('🧘 Habit',`<div class="form"><input id="habitName" placeholder="Habit name"><input id="habitFrequency" placeholder="Frequency (daily / weekdays / weekly)"><label><span class="label">Occurrences per day</span><input id="habitTimesPerDay" type="number" min="1" max="12" value="1" onchange="renderHabitTimeInputs()"></label><div id="habitTimeInputs"><label><span class="label">Time 1</span><input id="habitTime0" type="time"></label></div><button class="primary full" onclick="addHabit()">＋ Save Habit</button></div><p class="muted">Multiple occurrences are logged independently, while the same habit remains one record.</p>`,'span4')}${card('📅 Today',`${rs.filter(x=>String(x.startTime||x.time||'')).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><div class="muted">${esc(x.startTime||x.time||'')} ${x.endTime?'→ '+esc(x.endTime):''} · ${esc(x.category||'')}</div>${x.note?`<div class="muted">${esc(x.note)}</div>`:''}</span><button onclick="crudEdit('routine','${x.id}')">Edit</button></div>`).join('')||'<p class="muted">No time blocks yet.</p>'}<div class="actions"><button onclick="show('tasks')">Open Tasks & Planner</button></div>`,'span4')}${card('🧘 Habit Log',`${hs.map(x=>{const occ=Math.max(1,Math.min(12,Number(x.timesPerDay)||1));const times=Array.isArray(x.times)?x.times:[];const doneCount=todayLogs.filter(l=>l.habitId===x.id).length;return `<div class="row"><span><b>${esc(x.name)}</b><div class="muted">${esc(x.frequency||'daily')} · ${doneCount}/${occ} today</div></span><div class="actions">${Array.from({length:occ},(_,i)=>{const done=todayLogs.some(l=>l.habitId===x.id&&l.occurrence===i);return `<button type="button" onclick="logHabit('${x.id}',${i})">${done?'✓':'Log'}${times[i]?` ${esc(times[i])}`:''}</button>`}).join('')}</div></div>`}).join('')||'<p class="muted">No habits yet.</p>'}`,'span12')}</div>`}
function goals(){window.OmLifeOSListRenderers.goals=(limit=RENDER_PAGE_SIZE)=>latestRows(state.goals,limit).map(x=>`<div class="row"><span><b>${esc(x.title)}</b><div class="muted">${Number(x.progress||0)}% · ${esc(x.date||'No date')}</div>${progressBar(x.progress)}</span><div class="actions"><button onclick="progressGoal('${x.id}')">+10%</button><button onclick="crudEdit('goal','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('goal','${x.id}')">Delete</button></div></div>`).join('');return `${pageHeader('Goals & Strategy','Goals → milestones → strategy → KPI → tasks/focus, with Mentor & Capital kept in the same strategic workspace.')}<div class="grid">${card('🎯 Add Goal',`<div class="form"><input id="goalTitle" class="full" placeholder="Goal"><input id="goalDate" type="date"><input id="goalProgress" type="number" min="0" max="100" value="0" placeholder="Progress %"><button class="primary full" onclick="addGoal()">Add Goal</button></div>`,'span4')}${card('Goals',`<div class="list">${window.OmLifeOSListRenderers.goals()}</div>`,'span8')}${mentorPanel()}${extendedGoalsHtml()}</div>`}
function health(){const hp=state.healthProfile||{};return `${pageHeader('Health','Profile, measurements, sleep, water, nutrition, activity, appointments and health notes.')}<div class="grid">${card('❤️ Health Profile',`<div class="form"><input id="hName" placeholder="Name" value="${esc(hp.name||'')}"><input id="hDob" type="date" value="${esc(hp.dob||'')}"><input id="hHeight" type="number" placeholder="Height cm" value="${hp.height||''}"><input id="hWeight" type="number" placeholder="Weight kg" value="${hp.weight||''}"><input id="hTarget" type="number" placeholder="Target weight kg" value="${hp.targetWeight||''}"><button class="primary full" onclick="saveHealthProfile()">Save Profile</button></div>`,'span5')}${card('📊 Health Snapshot',`<div class="kpi-grid"><div class="kpi-box"><div class="label">BMI</div><div class="value">${hp.height&&hp.weight?(Number(hp.weight)/(Number(hp.height)/100)**2).toFixed(1):'—'}</div></div><div class="kpi-box"><div class="label">Measurements</div><div class="value">${safeArr('healthMeasurements').length}</div></div><div class="kpi-box"><div class="label">Sleep logs</div><div class="value">${safeArr('sleepRecords').length}</div></div><div class="kpi-box"><div class="label">Water logs</div><div class="value">${safeArr('waterRecords').length}</div></div></div><div class="actions"><button onclick="show('calculator')">Health Calculators</button></div>`,'span7')}${card('➕ Measurement / Activity',`<div class="form"><input id="hmDate" type="date" value="${today()}"><input id="hmWeight" type="number" placeholder="Weight kg"><input id="hmSteps" type="number" placeholder="Steps"><input id="hmExercise" placeholder="Exercise / activity"><input id="hmDuration" type="number" placeholder="Minutes"><button class="primary full" onclick="addHealthMeasurement()">Add Measurement</button></div>`,'span6')}${card('🌙 Sleep · 💧 Water · 🍎 Nutrition',`<div class="form"><input id="sleepDate" type="date" value="${today()}"><input id="sleepHours" type="number" step="0.1" placeholder="Sleep hours"><input id="waterDate" type="date" value="${today()}"><input id="waterAmount" type="number" placeholder="Water ml"><input id="nutritionDate" type="date" value="${today()}"><input id="nutritionCalories" type="number" placeholder="Calories"><input id="nutritionNote" class="full" placeholder="Nutrition note"><button class="primary full" onclick="addHealthWellness()">Save Wellness</button></div>`,'span6')}${card('📅 Appointment / Health Note',`<div class="form"><input id="haDate" type="date" value="${today()}"><input id="haTitle" placeholder="Appointment"><input id="haDoctor" placeholder="Doctor / place"><input id="hnText" class="full" placeholder="Health note"><button class="primary full" onclick="addHealthAppointmentNote()">Save</button></div>`,'span6')}${card('Recent Health Records',`<div class="list">${[...safeArr('healthMeasurements').map(x=>['healthMeasurement','Measurement',x]),...safeArr('sleepRecords').map(x=>['sleep','Sleep',x]),...safeArr('waterRecords').map(x=>['water','Water',x]),...safeArr('nutritionRecords').map(x=>['nutrition','Nutrition',x]),...safeArr('healthAppointments').map(x=>['appointment','Appointment',x])].slice(-30).reverse().map(([t,label,x])=>`<div class="row"><span><b>${label}</b> · ${esc(x.date||x.title||'')}<div class="muted">${esc(x.note||x.exercise||x.doctor||x.hours||x.amount||'')}</div></span><div class="actions"><button onclick="crudEdit('${t}','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('${t}','${x.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No health records yet.</p>'}</div>`,'span12')}${extendedHealthHtml()}</div>`}
function work(){return `${pageHeader('Work & Learning','Projects, responsibilities, meetings, skills, courses, learning progress and focused work.')}<div class="grid">${card('💼 Work Project',`<div class="form"><input id="wpName" placeholder="Project name"><input id="wpClient" placeholder="Client / team"><input id="wpDue" type="date"><input id="wpStatus" placeholder="Status" value="Active"><button class="primary full" onclick="addWorkProject()">Add Project</button></div>`,'span4')}${card('📚 Learning Item',`<div class="form"><input id="learnTitle" placeholder="Course / learning item"><input id="learnType" placeholder="Type"><input id="learnProgress" type="number" min="0" max="100" placeholder="Progress %"><button class="primary full" onclick="addLearningItem()">Add Learning</button></div>`,'span4')}${card('🤝 Meeting',`<div class="form"><input id="meetDate" type="date" value="${today()}"><input id="meetTitle" placeholder="Meeting"><input id="meetPeople" placeholder="People"><button class="primary full" onclick="addMeeting()">Add Meeting</button></div>`,'span4')}${card('Projects',`<div class="list">${latestRows(state.workProjects,50).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><div class="muted">${esc(x.client||'')} · ${esc(x.due||'')} · ${esc(x.status||'')}</div></span><div class="actions"><button onclick="workProjectTask('${x.id}')">Task</button><button onclick="crudEdit('workProject','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('workProject','${x.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No projects yet.</p>'}</div>`,'span7')}${card('Learning',`<div class="list">${latestRows(state.learningItems,50).map(x=>`<div class="row"><span><b>${esc(x.title)}</b><div class="muted">${esc(x.type||'')}</div>${progressBar(x.progress)}</span><div class="actions"><button onclick="crudEdit('learningItem','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('learningItem','${x.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No learning items.</p>'}</div>`,'span5')}${card('Meetings',`<div class="list">${safeArr('meetings').slice().reverse().slice(0,30).map(x=>`<div class="row"><span>${esc(x.date)} · <b>${esc(x.title)}</b><div class="muted">${esc(x.people||'')}</div></span><div class="actions"><button onclick="crudEdit('meeting','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('meeting','${x.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No meetings.</p>'}</div>`,'span12')}${extendedWorkHtml()}</div>`}
function people(){return `${pageHeader('People & Relationships','People, relationship types, interactions, important dates and reminders.')}<div class="grid">${card('🤝 Add Person',`<div class="form"><input id="personName" placeholder="Name"><input id="personRel" placeholder="Relationship"><input id="personContact" placeholder="Contact"><input id="personDate" type="date"><button class="primary full" onclick="addPerson()">Save Person</button></div>`,'span5')}${card('People',`<div class="list">${latestRows(state.people,50).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><div class="muted">${esc(x.relationship||'')} · ${esc(x.contact||'')}</div></span><div class="actions"><button onclick="addPersonTask('${x.id}')">Task</button><button onclick="logInteraction('${x.id}')">Interaction</button><button onclick="crudEdit('person','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('person','${x.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No people yet.</p>'}</div>`,'span7')}${extendedPeopleHtml()}</div>`}
function spiritual(){return `${pageHeader('Values & Spiritual','Values, principles, spiritual practices, commitments and their links to habits, journal and goals.')}<div class="grid">${card('🌱 Value / Principle',`<div class="form"><input id="valueTitle" placeholder="Value"><input id="valueDesc" placeholder="Meaning / principle"><select id="valueType"><option value="value">Value</option><option value="principle">Principle</option></select><button class="primary full" onclick="addValue()">Save</button></div>`,'span4')}${card('🕉 Spiritual Practice',`<div class="form"><input id="practiceName" placeholder="Practice"><input id="practiceFreq" placeholder="Frequency"><button class="primary full" onclick="addPractice()">Save Practice + linked Habit</button></div>`,'span4')}${card('🤲 Commitment',`<div class="form"><input id="commitText" placeholder="Commitment"><button class="primary full" onclick="addCommitment()">Save Commitment</button></div>`,'span4')}${card('Values & Principles',`<div class="list">${[...safeArr('values').map(x=>['value','Value',x]),...safeArr('principles').map(x=>['principle','Principle',x])].slice(-50).reverse().map(([t,label,x])=>`<div class="row"><span><b>${label}</b> · ${esc(x.title||x.text)}</span><div class="actions"><button onclick="crudEdit('${t}','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('${t}','${x.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No values yet.</p>'}</div>`,'span7')}${card('Practices & Commitments',`<div class="list">${[...safeArr('spiritualPractices').map(x=>['practice','Practice',x]),...safeArr('commitments').map(x=>['commitment','Commitment',x])].slice(-50).reverse().map(([t,label,x])=>`<div class="row"><span><b>${label}</b> · ${esc(x.name||x.text)}</span><span class="muted">${esc(x.frequency||'')}</span><div class="actions"><button onclick="crudEdit('${t}','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('${t}','${x.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No practices/commitments.</p>'}</div>`,'span5')}${card('Links',`<div class="workspace-note">Practice → Habit/Routine · Reflection → Journal · Spiritual outcome → Goal · Character rule → Principle/Commitment.</div><div class="actions"><button onclick="capture('journal')">Journal reflection</button><button onclick="capture('goal')">Create goal</button><button onclick="show('routine')">Open linked habits</button></div>`,'span12')}</div>`}
function things(){return `${pageHeader('Things & Documents','Items, collections, warranties, receipts, certificates and important records with shared attachments.')}<div class="grid">${card('📁 Thing',`<div class="form"><input id="thingName" placeholder="Thing / item"><input id="thingCategory" placeholder="Category"><input id="thingValue" type="number" placeholder="Value"><button class="primary full" onclick="addThing()">Save Thing</button></div>`,'span4')}${card('📄 Document',`<div class="form"><input id="docTitle" placeholder="Document title"><input id="docType" placeholder="Type"><input id="docNumber" placeholder="Number / reference"><input id="docDate" type="date"><button class="primary full" onclick="addDocument()">Save Document</button></div>`,'span4')}${card('🧾 Warranty / Receipt',`<div class="form"><input id="wrTitle" placeholder="Item / record"><input id="wrExpiry" type="date"><input id="wrNote" class="full" placeholder="Details"><button class="primary full" onclick="addRecord()">Save Record</button></div>`,'span4')}${card('Things',`<div class="list">${latestRows(state.things,50).map(x=>`<div class="row"><span><b>${esc(x.name)}</b><div class="muted">${esc(x.category||'')} · ₹${Number(x.value||0).toLocaleString('en-IN')}</div></span><div class="actions"><button onclick="createThingTask('${x.id}')">Task</button><button onclick="crudEdit('thing','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('thing','${x.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No things yet.</p>'}</div>`,'span5')}${card('Documents',`<div class="list">${latestRows(state.documents,50).map(x=>`<div class="row"><span><b>${esc(x.title)}</b><div class="muted">${esc(x.type||'')} · ${esc(x.reference||'')} · ${esc(x.date||'')}</div></span><div class="actions"><button onclick="crudEdit('document','${x.id}')">Edit</button><button class="danger" onclick="crudDelete('document','${x.id}')">Delete</button></div></div>`).join('')||'<p class="muted">No documents.</p>'}</div>`,'span7')}${extendedThingsHtml()}</div>`}
function calculator(){const first=CALCULATOR_CATALOG.quick[0];return `${pageHeader('Calculator & Tools','108 tools across Quick, Money, Gold, Health, Date & Time, Conversion, Home, Vehicle, Travel, Business and Programmer.')}<div class="grid">${card('🧮 Calculator',`<div class="calc-categories">${Object.entries(CALCULATOR_CATALOG).map(([g,items])=>`<button onclick="selectCalcCategory('${esc(g)}')">${esc(g)}</button>`).join('')}</div><div id="calcCategoryTools" class="calc-tools"></div><div class="form" style="margin-top:10px"><select id="calcTool" class="full" onchange="renderCalculatorTool()">${calcToolOptions()}</select><div id="calcFields" class="form full"></div><button class="primary full" onclick="runCalculator()">Calculate</button></div><div id="calcHint" class="muted" style="margin-top:10px"></div><div id="calcResult" class="metric">—</div><div class="actions"><button onclick="saveCalcResult()">Save Result</button><button onclick="favoriteCalc()">★ Favorite</button></div>`,'span8')}${card('History & Favorites',`<div id="calcHistoryList" class="list">${safeArr('calcHistory').slice(-30).reverse().map(x=>`<div class="row"><span><b>${esc(x.tool)}</b><div class="muted">${esc(x.result)}</div></span></div>`).join('')||'<p class="muted">No calculations yet.</p>'}</div><p class="muted" style="margin-top:8px">Favorites: ${esc((state.calcFavorites||[]).join(', ')||'None')}</p>`,'span4')}</div>`}
function selectCalcCategory(g){const box=document.getElementById('calcCategoryTools');if(!box)return;const items=CALCULATOR_CATALOG[g]||[];box.innerHTML=items.map(x=>`<button onclick="selectCalculatorTool('${esc(x)}')">${esc(x)}</button>`).join('')}
async function toggleNotifications(){
  const enabled=state.settings?.notificationsEnabled!==false;
  state.settings={...(state.settings||{}),notificationsEnabled:!enabled};
  if(!enabled) await requestNotificationPermission();
  await db.save();render();toast(state.settings.notificationsEnabled?'Notifications enabled':'Notifications disabled');
}
async function requestNotificationPermission(){
  if(!('Notification' in window))return toast('❌ Browser notifications are not supported by this browser');
  if(window.top!==window.self)return toast('❌ Browser blocked the permission request because Om-LifeOS is running inside an embedded frame');
  if(!window.isSecureContext && location.protocol!=='file:')return toast('❌ Notifications require HTTPS or localhost');
  if(location.protocol==='file:')return toast('⚠️ Browser notifications cannot be reliably enabled from a file:// HTML. Open Om-LifeOS through localhost/HTTPS instead.');
  const current=Notification.permission;
  if(current==='granted')return toast('✅ Browser notifications are already allowed');
  if(current==='denied')return toast('🚫 Browser notifications are blocked. Open this site’s browser permissions and set Notifications to Allow, then reload Om-LifeOS.');
  try{
    const p=await Notification.requestPermission();
    if(p==='granted'){
      state.settings={...(state.settings||{}),notificationsEnabled:true,notificationPermission:'granted'};
      await db.save();
      render();
      toast('✅ Browser notifications allowed');
      return;
    }
    state.settings={...(state.settings||{}),notificationPermission:p};
    await db.save();
    render();
    toast(p==='denied'?'🚫 Permission denied. Allow Notifications in browser site settings and try again.':'ℹ️ Permission request was dismissed');
  }catch(e){
    console.warn('Notification permission request failed',e);
    toast(`❌ Notification permission failed: ${e?.message||'browser blocked the request'}`);
  }
}
function generateComputerPairCode(){const code=String(Math.floor(100000+Math.random()*900000));state.settings={...(state.settings||{}),computerPairCode:code,computerConnected:false};db.save();render();toast('Pairing code generated')}
async function copyComputerPairCode(){const code=state.settings?.computerPairCode;if(!code)return toast('Generate a pairing code first');try{await navigator.clipboard.writeText(code);toast('Pairing code copied')}catch(e){toast('Copy unavailable; select the code manually')}}
function connectComputer(){if(!state.settings?.computerPairCode)return toast('Generate a pairing code first');state.settings={...(state.settings||{}),computerConnected:true,computerConnectedAt:Date.now()};db.save();render();toast('Computer connection enabled for this local workspace')}
function disconnectComputer(){state.settings={...(state.settings||{}),computerConnected:false};db.save();render();toast('Computer disconnected')}
function settings(){const ii=IntegrityService.stats;return `${pageHeader('Settings','Account, sync, backup, storage, migration, integrity and advanced controls.')}<div class="grid">${syncAuthHtml()}${card('🎨 Appearance',`<div class="row"><span>Theme</span><span class="status" id="themeStatusLabel">${themeMode()==='dark'?'Dark':'Light'}</span></div><div class="theme-tabs" role="tablist" aria-label="Color theme"><button type="button" id="themeLightTab" role="tab" aria-selected="${themeMode()!=='dark'}" class="${themeMode()!=='dark'?'active':''}" onclick="setTheme('light')">☀ Light</button><button type="button" id="themeDarkTab" role="tab" aria-selected="${themeMode()==='dark'}" class="${themeMode()==='dark'?'active':''}" onclick="setTheme('dark')">☾ Dark</button></div><div class="theme-help">The selected theme is saved locally and follows you across reloads and browser tabs.</div><div class="actions"><button type="button" onclick="document.documentElement.style.setProperty('--accent','#5d57c9')">Purple</button><button type="button" onclick="document.documentElement.style.setProperty('--accent','#16834b')">Green</button><button type="button" onclick="document.documentElement.style.setProperty('--accent','#318fb8')">Blue</button></div>`,'span4')}<div id="settingsNotificationsCard">${card('🔔 Notifications',`<div class="row"><span>Notifications</span><button type="button" class="secondary" onclick="toggleNotifications()">${state.settings?.notificationsEnabled===false?'Enable':'Disable'}</button></div><div class="row"><span>Reminder scheduler</span><span class="status">${window.OmLifeOSReminders?'Ready':'Unavailable'}</span></div><div class="row"><span>Browser permission</span><span class="muted">${('Notification' in window)?Notification.permission:'Not supported'}</span></div><div class="actions"><button type="button" onclick="requestNotificationPermission()">Allow browser notifications</button><button type="button" onclick="window.OmLifeOSReminders?.schedule?.();toast('Reminder scheduler refreshed')">Refresh scheduler</button></div>`,'span4')}</div>
${card('🖥 Connect to Computer',`<div class="row"><span>Connection</span><span class="status">${state.settings?.computerConnected?'Connected':'Not connected'}</span></div><p class="muted">Pair this browser with another computer using a one-time local code. The app stays local-first.</p><div class="row"><input id="computerPairCode" readonly value="${esc(state.settings?.computerPairCode||'—')}"><button type="button" onclick="generateComputerPairCode()">Generate</button><button type="button" onclick="copyComputerPairCode()">Copy</button></div><div class="actions"><button type="button" class="primary" onclick="connectComputer()">Connect to Computer</button><button type="button" onclick="disconnectComputer()">Disconnect</button></div>`,'span4')}${card('🛡 Data Integrity',`<div class="list"><div class="row"><span>References checked</span><span>${Number(ii.checked||0).toLocaleString()}</span></div><div class="row"><span>Issues / repaired</span><span>${Number(ii.issues||0)} / ${Number(ii.repaired||0)}</span></div></div><button class="primary" onclick="IntegrityService.audit({repair:true}).then(()=>{render();toast('Integrity check complete')})">Run Full Integrity Check</button>`,'span4')}${migrationHtml()}${card('💾 Data & Storage',`<div class="actions"><button class="primary" onclick="backup()">Full Backup</button><button onclick="document.getElementById('importFile').click()">Restore / Import</button><input id="importFile" type="file" accept="application/json,.json,.omlifeos" hidden onchange="importJson(this.files[0])"><details class="export-selection-dropdown"><summary class="export-selection-summary"><span><b>Export</b><span class="muted">Word, PDF, Excel and CSV</span></span><span class="export-selection-chevron">▾</span></summary><div class="export-selection-panel"><div class="export-selection-grid"><button type="button" class="export-selection-item" onclick="exportWord()">📄 Word (.docx)</button><button type="button" class="export-selection-item" onclick="exportPdf()">📕 PDF (.pdf)</button><button type="button" class="export-selection-item" onclick="exportExcel()">📊 Excel (.xlsx)</button><button type="button" class="export-selection-item" onclick="exportCsv()">📋 CSV</button><button type="button" class="export-selection-item" onclick="exportUpdatedCsv()">📝 Updated Records CSV</button></div></div></details><button class="danger" onclick="resetData()">Reset local data</button></div><p class="muted">IndexedDB is the primary browser store. Backup includes records and attachment bytes. Restore is validated and atomic.</p>`,'span7')}${card('📦 Storage Status',`<div class="list"><div class="row"><span>IndexedDB schema</span><span class="status">v15+</span></div><div class="row"><span>Entity stores</span><span class="status">${ENTITY_KEYS.length}</span></div><div class="row"><span>Write health</span><span class="${db.storageHealthy?'status':'danger'}">${db.storageHealthy?'Healthy':'Needs attention'}</span></div><div class="row"><span>Browser quota</span><span>${state.settings?.storageEstimate?.percent!=null?Number(state.settings.storageEstimate.percent).toFixed(1)+'% used':'Checking…'}</span></div><div class="row"><span>Multi-tab safety</span><span class="status">Live</span></div></div>`,'span5')}${card('⚙ Advanced',`<div class="workspace-note">Migration Review, orphan preservation, search index, attachment cleanup, sync reconciliation and crash-safe restore are services rather than separate menus.</div><div class="actions"><button onclick="show('settings')">Refresh Settings</button><button onclick="location.reload()">Reload App</button></div>`,'span12')}</div>`}
/* Calculator category buttons are rendered after the standard field renderer. */
/* Improve simple entity cards without changing the normalized data model. */
function simpleInputType(field){if(/date/i.test(field)||/dueAt|startDate|endDate/i.test(field))return'date';if(/progress|amount|target|current|duration|calories|level|rate|value/i.test(field))return'number';return'text'}
function simpleEntityCard(type,cls='span4'){const d=SIMPLE_ENTITY_DEFS[type];if(!d)return '';const fields=d.fields.map(([f,l])=>`<label><span class="label">${esc(l)}</span><input id="simple_${type}_${f}" type="${simpleInputType(f)}" placeholder="${esc(l)}"></label>`).join('');return card(d.title,`<div class="formgrid">${fields}</div><div class="actions"><button class="primary" onclick="simpleAdd('${type}')">Add ${esc(d.title)}</button></div><div class="list" style="margin-top:10px">${simpleEntityRows(type)}</div>`,cls)}
/* ============================================================
   Om-LifeOS Final Architecture Compatibility Layer
   ------------------------------------------------------------
   The v4 UI remains backward-compatible, while application
   boundaries are exposed as repositories/services so the same
   UI can later be attached to the v2.2.4 Tauri/Rust/SQLite
   adapter without rewriting module screens.
   ============================================================ */
(function installFinalArchitecture(){
  const repo = (key) => ({
    key,
    list: async () => Array.isArray(state[key]) ? [...state[key]] : [],
    get: async (id) => (Array.isArray(state[key]) ? state[key].find(x=>x?.id===id) : null) || null,
    save: async (record) => {
      if(!Array.isArray(state[key])) state[key]=[];
      const now=Date.now();
      const value={...record,id:record?.id||crypto.randomUUID(),updatedAt:now,createdAt:record?.createdAt||now};
      const i=state[key].findIndex(x=>x?.id===value.id);
      if(i>=0) state[key][i]=value; else state[key].push(value);
      await db.save();
      return value;
    },
    remove: async (id) => {
      if(Array.isArray(state[key])) state[key]=state[key].filter(x=>x?.id!==id);
      await db.save();
      return true;
    }
  });

  const repositories = {
    TaskRepository:repo('tasks'),
    RoutineRepository:repo('routines'),
    GoalRepository:repo('goals'),
    FocusRepository:repo('focus'),
    NoteRepository:repo('notes'),
    JournalRepository:repo('journal'),
    FinanceRepository:repo('finance'),
    HealthRepository:repo('healthMeasurements'),
    WorkRepository:repo('workProjects'),
    PeopleRepository:repo('people'),
    ValuesRepository:repo('values'),
    ThingsRepository:repo('things')
  };

  const service = (repository) => ({
    list: (...a)=>repository.list(...a),
    get: (...a)=>repository.get(...a),
    save: (...a)=>repository.save(...a),
    remove: (...a)=>repository.remove(...a)
  });

  const services = {
    TaskService:service(repositories.TaskRepository),
    RoutineService:service(repositories.RoutineRepository),
    GoalService:service(repositories.GoalRepository),
    FocusService:service(repositories.FocusRepository),
    FinanceService:service(repositories.FinanceRepository),
    HealthService:service(repositories.HealthRepository),
    WorkService:service(repositories.WorkRepository),
    PeopleService:service(repositories.PeopleRepository),
    NoteService:service(repositories.NoteRepository),
    JournalService:service(repositories.JournalRepository),
    ValuesService:service(repositories.ValuesRepository),
    ThingsService:service(repositories.ThingsRepository),
    ReminderService:window.OmLifeOSReminders || {
      list:async()=>[...(state.reminders||[])],
      schedule:async()=>true
    },
    SearchService:{
      query:async(q)=>{
        const term=String(q||'').trim().toLowerCase();
        if(!term)return [];
        const out=[];
        for(const key of ENTITY_KEYS){
          const arr=Array.isArray(state[key])?state[key]:[];
          for(const item of arr){
            const text=JSON.stringify(item).toLowerCase();
            if(text.includes(term))out.push({entity:key,record:item});
            if(out.length>=100)return out;
          }
        }
        return out;
      }
    },
    AchievementService:{
      list:async()=>[...(state.achievements||[])],
      refresh:async()=>[...(state.achievements||[])]
    },
    CaptureService:{
      create:async(record)=>{
        state.captureDrafts=Array.isArray(state.captureDrafts)?state.captureDrafts:[];
        state.captureDrafts.push({...record,id:record?.id||crypto.randomUUID(),createdAt:Date.now()});
        await db.save();
        return state.captureDrafts.at(-1);
      }
    }
  };

  // v4.3 Architecture Contract: UI -> Application Services -> Repositories -> Native/Fallback persistence.
  const OM_LIFEOS_ARCHITECTURE_CONTRACT={
    version:'4.3.0-architecture-redesign',
    layers:{
      nativeInfrastructure:['Tauri','Rust','SQLite','Migration Engine','Backup / Restore','Attachment Storage','Native Services'],
      repositories:['TaskRepository','RoutineRepository','GoalRepository','FocusRepository','NoteRepository','JournalRepository','FinanceRepository','HealthRepository','WorkRepository','PeopleRepository','ValuesRepository','ThingsRepository'],
      applicationServices:['TaskService','RoutineService','GoalService','FocusService','FinanceService','HealthService','PeopleService','ReminderService','SearchService','AchievementService','CaptureService'],
      ui:['Dashboard','Tasks & Planner','Routine & Habits','Goals & Strategy','Focus','Notes','Journal','Finance','Calculator & Tools','Health','Work & Learning','People & Relationships','Values & Spiritual','Things & Documents','Settings']
    },
    persistence:{native:'Tauri/Rust/SQLite when native bridge is available',fallback:'IndexedDB/localStorage in browser mode',policy:'native-first-with-browser-fallback'},
    rules:['UI never owns persistence logic','Services own business rules','Repositories own persistence access','Backup/restore is atomic at the persistence boundary','Legacy migration terminates in repository writes']
  };

  window.OmLifeOSArchitecture={
    version:'4.3.0-architecture-redesign',
    storageAdapter:'Native SQLite (Tauri/Rust) with IndexedDB/browser fallback',
    nativeReference:'Tauri/Rust/SQLite canonical native runtime',
    repositories,
    services
  };

  for(const [name,value] of Object.entries(repositories)) window[name]=value;
  for(const [name,value] of Object.entries(services)) {
    if(name==='ReminderService') window.OmLifeOSReminderService=value;
    else window[name]=value;
  }

  // Accessibility normalization for dynamically rendered screens.
  const enhanceA11y=()=>{
    document.querySelectorAll('input,select,textarea').forEach(el=>{
      if(!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')){
        const label=el.closest('label');
        const text=label?.querySelector('.label')?.textContent?.trim()
          || el.getAttribute('placeholder')
          || el.getAttribute('name')
          || el.id?.replace(/^simple_/,'').replace(/[_-]+/g,' ').trim()
          || 'Input';
        if(text) el.setAttribute('aria-label',text);
      }
      if(!el.hasAttribute('autocomplete') && el.type!=='file' && el.type!=='hidden'){
        const hint=(el.getAttribute('placeholder')||'').toLowerCase();
        if(hint.includes('email')) el.autocomplete='email';
        else if(hint.includes('password')) el.autocomplete='current-password';
        else if(hint.includes('name')) el.autocomplete='name';
      }
    });
    document.querySelectorAll('button').forEach(el=>{
      if(!el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')){
        const text=el.textContent?.replace(/\s+/g,' ').trim();
        if(text) el.setAttribute('aria-label',text);
      }
    });
  };
  const target=document.getElementById('app')||document.body;
  new MutationObserver(()=>enhanceA11y()).observe(target,{subtree:true,childList:true});
  enhanceA11y();

  window.addEventListener('error',e=>{
    console.warn('Om-LifeOS UI error',e.error||e.message);
  });
  window.addEventListener('unhandledrejection',e=>{
    console.warn('Om-LifeOS async error',e.reason);
  });
})();


// Master planner capabilities consolidated from the legacy planner into Tasks & Planner.
function renderHabitTimeInputs(){const n=Math.max(1,Math.min(12,Number(document.getElementById('habitTimesPerDay')?.value||1)));const box=document.getElementById('habitTimeInputs');if(!box)return;box.innerHTML=Array.from({length:n},(_,i)=>`<label><span class="label">Time ${i+1}</span><input id="habitTime${i}" type="time"></label>`).join('')}
function saveDailyPlan(){const settings=state.settings&&typeof state.settings==='object'?state.settings:{};const old=settings.dailyPlanner&&settings.dailyPlanner.date===today()?settings.dailyPlanner:{date:today(),target:'',progress:0,points:[],wins:[],reflection:[]};settings.dailyPlanner={...old,date:today(),target:document.getElementById('dailyTarget')?.value||'',progress:Math.max(0,Math.min(100,Number(document.getElementById('dailyProgressRange')?.value||0))),points:old.points||[],wins:String(document.getElementById('plannerWins')?.value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean),reflection:String(document.getElementById('plannerReflection')?.value||'').split(/\n+/).map(x=>x.trim()).filter(Boolean)};state.settings=settings;db.save();render();toast('Daily plan saved')}
function addPlannerPoint(){const input=document.getElementById('plannerPointInput');const text=(input?.value||'').trim();if(!text)return;const settings=state.settings&&typeof state.settings==='object'?state.settings:{};const p=settings.dailyPlanner&&settings.dailyPlanner.date===today()?settings.dailyPlanner:{date:today(),target:'',progress:0,points:[],wins:[],reflection:[]};p.points=[...(p.points||[]),{id:uid(),text,done:false}];settings.dailyPlanner=p;state.settings=settings;db.save();render()}
function togglePlannerPoint(i){const settings=state.settings&&typeof state.settings==='object'?state.settings:{};const p=settings.dailyPlanner;if(!p||p.date!==today()||!p.points?.[i])return;p.points[i].done=!p.points[i].done;settings.dailyPlanner=p;state.settings=settings;db.save();render()}
function setPlannerProgress(v){const settings=state.settings&&typeof state.settings==='object'?state.settings:{};const p=settings.dailyPlanner&&settings.dailyPlanner.date===today()?settings.dailyPlanner:{date:today(),target:'',progress:0,points:[],wins:[],reflection:[]};p.progress=Math.max(0,Math.min(100,Number(v)||0));settings.dailyPlanner=p;state.settings=settings;db.save();render()}
function deleteTodayPlan(){const settings=state.settings&&typeof state.settings==='object'?state.settings:{};if(settings.dailyPlanner?.date===today())delete settings.dailyPlanner;state.settings=settings;db.save();render();toast('Today planner cleared')}


/* Final theme service: Light/Dark tabs + persistent cross-tab synchronization. */
function themeMode(){
  const saved=String(state.settings?.themeMode||'').toLowerCase();
  if(saved==='dark'||saved==='light')return saved;
  try{
    const local=String(localStorage.getItem('om-lifeos-theme')||'').toLowerCase();
    if(local==='dark'||local==='light')return local;
  }catch{}
  return 'light';
}
function applyTheme(mode,{persist=true,rerender=false}={}){
  mode=String(mode).toLowerCase()==='dark'?'dark':'light';
  document.documentElement.setAttribute('data-lifeos-mode',mode);
  document.documentElement.style.colorScheme=mode;
  state.settings=state.settings&&typeof state.settings==='object'?state.settings:{};
  state.settings.themeMode=mode;
  try{localStorage.setItem('om-lifeos-theme',mode)}catch{}
  if(persist){
    try{db.save({skipSync:true})}catch{}
  }
  const light=document.getElementById('themeLightTab');
  const dark=document.getElementById('themeDarkTab');
  const label=document.getElementById('themeStatusLabel');
  if(light){light.classList.toggle('active',mode==='light');light.setAttribute('aria-selected',String(mode==='light'))}
  if(dark){dark.classList.toggle('active',mode==='dark');dark.setAttribute('aria-selected',String(mode==='dark'))}
  if(label)label.textContent=mode==='dark'?'Dark':'Light';
  const icon=mode==='dark'?'☀':'☾';
  const side=document.getElementById('sidebarThemeToggle');
  if(side){side.textContent=icon;side.title=mode==='dark'?'Switch to light theme':'Switch to dark theme';side.setAttribute('aria-label',side.title)}
  const bottom=document.getElementById('bottomThemeToggle');
  if(bottom){bottom.querySelector('.mi')?.replaceChildren(document.createTextNode(icon));bottom.title=mode==='dark'?'Switch to light theme':'Switch to dark theme';bottom.setAttribute('aria-label',bottom.title)}
  if(rerender && state.active==='settings')render();
}
function setTheme(mode){applyTheme(mode,{persist:true,rerender:true});toast(`${mode==='dark'?'Dark':'Light'} theme enabled`)}
function toggleTheme(){setTheme(themeMode()==='dark'?'light':'dark')}
try{
  const early=String(localStorage.getItem('om-lifeos-theme')||'').toLowerCase();
  if(early==='dark'||early==='light')document.documentElement.setAttribute('data-lifeos-mode',early);
}catch{}
window.addEventListener('storage',e=>{
  if(e.key==='om-lifeos-theme' && (e.newValue==='dark'||e.newValue==='light')){
    applyTheme(e.newValue,{persist:false,rerender:true});
  }
});

// Startup is intentionally non-blocking: paint the shell first, then hydrate IndexedDB in the background.
let startupHydrationPromise=null;
applyTheme(themeMode(),{persist:false,rerender:false});
renderNav();
show(location.hash.slice(1)||'dashboard');
startupHydrationPromise=Promise.resolve().then(async()=>{
  const startupStarted=performance.now();
  try{
    const saved=await db.load();
    if(saved)Object.assign(state,saved);
    applyTheme(themeMode(),{persist:false,rerender:false});
    normalizeLoadedState();
    scheduleIntegrityAudit(2500);
    if(state.active==='dashboard'){financeSummaryCache=null;render();}
    state.settings={...(state.settings||{}),lastStartupHydrationMs:Math.round(performance.now()-startupStarted)};
  }catch(e){console.warn('Background startup hydration failed',e);toast('Local data is still loading; please retry the module if needed')}
});
/* ============================================================
   Om-LifeOS Master architecture integration
   ============================================================ */
(function(){
  const NOTE_DEFAULT_CATEGORIES=['General','Personal','Work','Study','Projects','Health','Finance','Ideas','Reference'];
  const catLabel=g=>String(g||'').replace(/[_-]+/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
  function getNoteCategories(){
    state.settings=state.settings&&typeof state.settings==='object'?state.settings:{};
    const configured=Array.isArray(state.settings.noteCategories)?state.settings.noteCategories:[];
    const used=safeArr('notes').map(x=>String(x.category||'General').trim()).filter(Boolean);
    return [...new Set([...NOTE_DEFAULT_CATEGORIES,...configured,...used])].sort((a,b)=>a.localeCompare(b));
  }
  window.getNoteCategories=getNoteCategories;
  window.addNoteCategory=async function(){
    const el=document.getElementById('newNoteCategory'); const value=(el?.value||'').trim();
    if(!value)return toast('Enter a category name');
    state.settings=state.settings&&typeof state.settings==='object'?state.settings:{};
    state.settings.noteCategories=Array.isArray(state.settings.noteCategories)?state.settings.noteCategories:[];
    if(!state.settings.noteCategories.includes(value))state.settings.noteCategories.push(value);
    await db.save(); render(); toast('Note category added');
  };
  function noteCategoryOptions(selected='General'){return getNoteCategories().map(c=>'<option value="'+esc(c)+'" '+(c===selected?'selected':'')+'>'+esc(c)+'</option>').join('');}
  function noteCategoryFilterOptions(selected=''){return '<option value="">All categories</option>'+getNoteCategories().map(c=>'<option value="'+esc(c)+'" '+(c===selected?'selected':'')+'>'+esc(c)+'</option>').join('');}

  window.noteEditorHtml=function(){return `<div class="grid">${card('New Note',`<div class="form">
    <label><span class="label">Title</span><input id="noteTitle" placeholder="Title" aria-label="Note title"></label>
    <div class="note-category-row"><label class="grow"><span class="label">Category / Notebook</span><select id="noteCategory" aria-label="Note category">${noteCategoryOptions()}</select></label><label class="grow"><span class="label">New category</span><input id="newNoteCategory" placeholder="e.g. Reading"></label><button type="button" onclick="addNoteCategory()">+ Category</button></div>
    <label><span class="label">Tags</span><input id="noteTags" placeholder="Tags, comma separated"></label>
    <label><span class="label">Note color</span><input id="noteColor" type="color" value="#fff8c5" aria-label="Note color"></label>
    <div class="full"><div class="rich-toolbar"><button type="button" aria-label="Bold" onclick="execRich('bold')"><b>B</b></button><button type="button" aria-label="Italic" onclick="execRich('italic')"><i>I</i></button><button type="button" aria-label="Underline" onclick="execRich('underline')"><u>U</u></button><button type="button" onclick="execRich('insertUnorderedList')">• List</button><button type="button" aria-label="Align left" onclick="execRich('justifyLeft')">←</button><button type="button" aria-label="Align center" onclick="execRich('justifyCenter')">↔</button><button type="button" aria-label="Align right" onclick="execRich('justifyRight')">→</button><select aria-label="Text size" onchange="execRich('fontSize',this.value)"><option value="3">Size</option><option value="2">Small</option><option value="4">Large</option><option value="6">Huge</option></select><input type="color" onchange="execRich('foreColor',this.value)" aria-label="Text color"></div><div id="noteEditor" class="rich-editor" contenteditable="true" role="textbox" aria-label="Note content"></div></div>
    <label><span class="label">Point-wise notes</span><textarea class="full" id="notePoints" placeholder="One point per line"></textarea></label>
    <label><span class="label">Attachments</span><input class="full" id="noteFiles" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"></label>
    <button class="primary full" type="button" onclick="addNote()">Save Note</button></div>`,'span5')}${card('Search & Notes',`<div class="note-filter-bar"><input id="noteSearch" placeholder="Search title, text or tags..." aria-label="Search notes" oninput="renderNoteList()"><select id="noteCategoryFilter" aria-label="Filter notes by category" onchange="renderNoteList()">${noteCategoryFilterOptions()}</select></div><div class="chips note-category-chips">${getNoteCategories().map(c=>'<button type="button" class="tag" onclick="setNoteCategoryFilter(\''+esc(c)+'\')">'+esc(c)+'</button>').join('')}</div><div class="list" style="margin-top:10px" id="noteList"></div>`,'span7')}</div>`;};
  window.setNoteCategoryFilter=function(category){const el=document.getElementById('noteCategoryFilter');if(el)el.value=category||'';renderNoteList();};
  window.renderNoteList=async function(){
    const token=++noteSearchToken,el=document.getElementById('noteList');if(!el)return;
    const q=(document.getElementById('noteSearch')?.value||'').trim().toLowerCase(),category=(document.getElementById('noteCategoryFilter')?.value||'').trim();
    const source=safeArr('notes').slice().reverse(),filtered=[];
    for(let i=0;i<source.length;i+=250){const end=Math.min(source.length,i+250);for(let j=i;j<end;j++){const x=source[j],cat=String(x.category||'General');if(category&&cat!==category)continue;const hay=[x.title,x.body,x.points,x.category,x.tags,x.date].map(v=>String(v||'')).join(' ').toLowerCase();if(!q||hay.includes(q))filtered.push(x);}if(end<source.length){await new Promise(r=>setTimeout(r,0));if(token!==noteSearchToken)return;}}
    if(token!==noteSearchToken)return;const rows=filtered.slice(0,RENDER_PAGE_SIZE);
    el.innerHTML=rows.map(x=>`<article class="note-card" style="background:${/^#[0-9a-f]{6}$/i.test(x.color||'')?x.color:'#fff8c5'}"><div class="row" style="border:0;padding:0"><div><div class="title">${esc(x.title)}</div><div class="muted"><span class="tag">${esc(x.category||'General')}</span> · ${esc(x.date||'')}</div></div><div class="actions"><button type="button" onclick="crudEdit('note','${x.id}')">Edit</button><button type="button" class="danger" onclick="deleteNote('${x.id}')">Delete</button></div></div><div class="chips">${String(x.tags||'').split(',').map(t=>t.trim()).filter(Boolean).map(t=>`<span class="tag">#${esc(t)}</span>`).join('')}</div><div class="prose" style="margin-top:8px">${x.html?richSanitize(x.html):esc(x.body||'')}</div>${x.points?`<div class="muted" style="margin-top:7px;white-space:pre-line">${esc(x.points)}</div>`:''}${fileListHtml(x.attachments||[])}${(x.attachments||[]).map(id=>`<button type="button" onclick="openAttachment('${id}')">Open</button>`).join(' ')}</article>`).join('')||'<div class="empty-state"><b>No notes found</b><span>Try another search or category, or create a new note.</span></div>';
    if(filtered.length>RENDER_PAGE_SIZE)el.insertAdjacentHTML('beforeend',`<div class="actions" style="justify-content:center"><button type="button" onclick="expandNoteList(${Math.min(filtered.length,RENDER_PAGE_SIZE*2)})">Load older notes (${filtered.length-RENDER_PAGE_SIZE} remaining)</button></div>`);
  };
  window.expandNoteList=function(limit){const el=document.getElementById('noteList');if(!el)return;const q=(document.getElementById('noteSearch')?.value||'').trim().toLowerCase(),category=(document.getElementById('noteCategoryFilter')?.value||'').trim();const rows=safeArr('notes').slice().reverse().filter(x=>{const cat=String(x.category||'General');if(category&&cat!==category)return false;const hay=[x.title,x.body,x.points,x.category,x.tags,x.date].map(v=>String(v||'')).join(' ').toLowerCase();return !q||hay.includes(q)}).slice(0,Math.min(Number(limit)||RENDER_PAGE_SIZE,1000));el.innerHTML=rows.map(x=>`<article class="note-card"><div class="row" style="border:0;padding:0"><div><div class="title">${esc(x.title)}</div><div class="muted"><span class="tag">${esc(x.category||'General')}</span> · ${esc(x.date||'')}</div></div><div class="actions"><button type="button" onclick="crudEdit('note','${x.id}')">Edit</button><button type="button" class="danger" onclick="deleteNote('${x.id}')">Delete</button></div></div><div class="prose" style="margin-top:8px">${x.html?richSanitize(x.html):esc(x.body||'')}</div></article>`).join('')||'<div class="empty-state"><b>No notes found</b></div>';if(rows.length<safeArr('notes').length)el.insertAdjacentHTML('beforeend',`<div class="actions" style="justify-content:center"><button type="button" onclick="expandNoteList(${Math.min(rows.length+RENDER_PAGE_SIZE,1000)})">Load older notes</button></div>`);};
  window.notes=function(){return `${pageHeader('Notes','Rich notes, notebooks, tags, colors, point-wise notes, attachments and category-aware search.')} ${noteEditorHtml()}`;};

  window.selectCalcCategory=function(g,preserveTool=false){const box=document.getElementById('calcCategoryTools');if(!box)return;const items=CALCULATOR_CATALOG[g]||[];document.querySelectorAll('.calc-category-tabs button').forEach(b=>b.classList.toggle('active',b.dataset.group===g));box.innerHTML=items.map(x=>`<button type="button" class="calc-tool-chip ${document.getElementById('calcTool')?.value===x?'active':''}" onclick="selectCalculatorTool('${esc(x)}')">${esc(x)}</button>`).join('');if(!preserveTool&&!items.includes(document.getElementById('calcTool')?.value)){const el=document.getElementById('calcTool');if(el){el.value=items[0]||'Basic';renderCalculatorTool();}}};
  const oldSelectCalculatorTool=window.selectCalculatorTool;window.selectCalculatorTool=function(tool){if(oldSelectCalculatorTool)oldSelectCalculatorTool(tool);const g=Object.entries(CALCULATOR_CATALOG).find(([,items])=>items.includes(tool));if(g)selectCalcCategory(g[0],true);};
  window.calculator=function(){const groups=Object.entries(CALCULATOR_CATALOG),initial='quick';return `${pageHeader('Calculator & Tools','108 tools across Quick, Money, Gold, Health, Date & Time, Conversion, Home, Vehicle, Travel, Business and Programmer.')}<div class="grid"><section class="card span8"><div class="calc-head"><div><h2>🧮 Calculator</h2><p class="muted">Choose a category, then select a tool. Results and favorites stay local.</p></div><span class="status">108 tools</span></div><div class="calc-category-tabs">${groups.map(([g,items])=>`<button type="button" data-group="${esc(g)}" class="${g===initial?'active':''}" onclick="selectCalcCategory('${esc(g)}')">${esc(catLabel(g))}<small>${items.length}</small></button>`).join('')}</div><div id="calcCategoryTools" class="calc-tools"></div><div class="form" style="margin-top:12px"><label><span class="label">Selected tool</span><select id="calcTool" class="full" onchange="renderCalculatorTool()">${calcToolOptions()}</select></label><div id="calcFields" class="form full"></div><button class="primary full" type="button" onclick="runCalculator()">Calculate</button></div><div id="calcHint" class="muted" style="margin-top:10px"></div><div id="calcResult" class="metric">—</div><div class="actions"><button type="button" onclick="saveCalcResult()">Save Result</button><button type="button" onclick="favoriteCalc()">★ Favorite</button></div></section>${card('History & Favorites',`<div id="calcHistoryList" class="list">${safeArr('calcHistory').slice(-30).reverse().map(x=>`<div class="row"><span><b>${esc(x.tool)}</b><div class="muted">${esc(x.result)}</div></span></div>`).join('')||'<p class="muted">No calculations yet.</p>'}</div><p class="muted" style="margin-top:8px">Favorites: ${esc((state.calcFavorites||[]).join(', ')||'None')}</p>`,'span4')}</div>`;};
  const oldRenderCalculatorTool=window.renderCalculatorTool;window.renderCalculatorTool=function(){if(oldRenderCalculatorTool)oldRenderCalculatorTool();const t=document.getElementById('calcTool')?.value||'Basic',g=Object.entries(CALCULATOR_CATALOG).find(([,items])=>items.includes(t));if(g)selectCalcCategory(g[0],true);};

  window.dashboard=function(){const f=financeSummary(),pending=safeArr('tasks').filter(x=>!x.done),todayTasks=pending.filter(x=>String(x.dueAt||x.date||'').slice(0,10)===today()).slice(0,12),todayHabits=safeArr('habits').slice(0,8),goals=safeArr('goals').slice(0,6),notes=safeArr('notes').slice().reverse().slice(0,5),rem=safeArr('reminders').filter(x=>x.status!=='done').slice(0,6);return `${pageHeader('Dashboard','One place for today, planning, goals, focus, health, finance and relationships.')}<div class="kpi-grid"><div class="card kpi-box"><div class="label">Open tasks</div><div class="value">${pending.length}</div></div><div class="card kpi-box"><div class="label">Goals</div><div class="value">${goals.length}</div></div><div class="card kpi-box"><div class="label">Habits</div><div class="value">${todayHabits.length}</div></div><div class="card kpi-box"><div class="label">Net cash flow</div><div class="value">₹${Number(f.cashFlow||0).toLocaleString('en-IN',{maximumFractionDigits:0})}</div></div></div><div class="grid dashboard-grid">${card('📅 Today & Planner',`${todayTasks.map(x=>`<div class="row"><span><b>${esc(x.title)}</b><div class="muted">${esc(x.priority||'Medium')} · ${esc(x.domain||'personal')}</div></span><button type="button" onclick="show('tasks')">Open</button></div>`).join('')||'<p class="muted">No tasks due today.</p>'}<div class="actions"><button type="button" onclick="show('tasks')">Open Tasks & Planner</button><button type="button" onclick="capture('task')">＋ Quick Task</button></div>`,'span6')}${card('🎯 Strategy',`${goals.map(x=>`<div><div class="between"><span>${esc(x.title)}</span><b>${Number(x.progress||0)}%</b></div>${progressBar(x.progress)}</div>`).join('')||'<p class="muted">No goals yet.</p>'}<div class="actions"><button type="button" onclick="show('goals')">Open Goals & Strategy</button></div>`,'span6')}${card('🔁 Routine & Habits',`${todayHabits.map(x=>`<div class="row"><span>${esc(x.name)} <span class="muted">${esc(x.frequency||'')}</span></span><button type="button" onclick="logHabit('${x.id}')">${x.doneDate===today()?'✓ Done':'Log'}</button></div>`).join('')||'<p class="muted">No habits yet.</p>'}<div class="actions"><button type="button" onclick="show('routine')">Open Routine & Habits</button></div>`,'span6')}${card('⏱ Focus',`<div class="metric">${focusRuntime()?.running?'Running':'Ready'}</div><p class="muted">${safeArr('focus').length} completed sessions</p><button type="button" class="primary" onclick="show('focus')">Open Focus</button>`,'span6')}${card('💰 Finance',`<div class="row"><span>Income</span><b>₹${Number(f.income||0).toLocaleString('en-IN')}</b></div><div class="row"><span>Expenses</span><b>₹${Number(f.expense||0).toLocaleString('en-IN')}</b></div><div class="row"><span>Net worth</span><b>₹${Number(f.netWorth||0).toLocaleString('en-IN')}</b></div><button type="button" onclick="show('finance')">Open Finance</button>`,'span6')}${card('❤️ Health & People',`<div class="row"><span>Health measurements</span><b>${safeArr('healthMeasurements').length}</b></div><div class="row"><span>People</span><b>${safeArr('people').length}</b></div><div class="row"><span>Relationships</span><b>${safeArr('relationships').length}</b></div><div class="actions"><button type="button" onclick="show('health')">Health</button><button type="button" onclick="show('people')">People</button></div>`,'span6')}${card('🔔 Reminders',`${rem.map(x=>`<div class="row"><span>${esc(x.title)}</span><span class="muted">${esc(x.dueAt||'')}</span></div>`).join('')||'<p class="muted">No active reminders.</p>'}<button type="button" onclick="show('settings')">Manage reminders</button>`,'span6')}${card('📝 Recent Notes & Journal',`${notes.map(x=>`<div class="row"><span><b>${esc(x.title)}</b><div class="muted">${esc(x.category||'General')} · ${esc(x.date||'')}</div></span></div>`).join('')||'<p class="muted">No recent writing.</p>'}<div class="actions"><button type="button" onclick="show('notes')">Notes</button><button type="button" onclick="show('journal')">Journal</button></div>`,'span6')}${card('🏆 Achievements',`${safeArr('achievements').slice(-5).reverse().map(x=>`<div class="row"><span><b>${esc(x.title||x.name||'Achievement')}</b><div class="muted">${esc(x.date||'')}</div></span><span class="status">Unlocked</span></div>`).join('')||'<p class="muted">Achievements will appear as you use the system.</p>'}`,'span6')}${card('＋ Quick Capture',`<div class="quick-capture-grid">${['task','note','journal','expense','goal','reminder','person'].map(x=>`<button type="button" onclick="capture('${x}')">${catLabel(x)}</button>`).join('')}</div><p class="muted">Capture routes to the correct owner module; there is no duplicate Inbox database.</p>`,'span6')}</div>`;};

  const style=document.createElement('style');style.id='om-lifeos-v402-ui';style.textContent=`
    .note-category-row{display:flex;gap:8px;align-items:end;flex-wrap:wrap}.note-category-row .grow{flex:1 1 180px}.label{display:block;font-size:12px;font-weight:700;color:var(--muted);margin-bottom:4px}.note-filter-bar{display:grid;grid-template-columns:minmax(0,1fr) 220px;gap:8px}.note-category-chips{margin-top:8px;max-height:92px;overflow:auto}.empty-state{display:grid;gap:5px;padding:24px;border:1px dashed var(--line);border-radius:12px;text-align:center;color:var(--muted)}
    .calc-head,.between{display:flex;justify-content:space-between;gap:12px;align-items:center}.calc-category-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:12px 0}.calc-category-tabs button{display:flex;align-items:center;gap:6px}.calc-category-tabs button small{opacity:.7}.calc-category-tabs button.active{background:var(--accent);color:#fff;border-color:var(--accent)}.calc-tools{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.calc-tool-chip{text-align:left}.calc-tool-chip.active{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 16%,transparent)}.dashboard-grid .card{min-height:82px}.quick-capture-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.quick-capture-grid button{min-height:42px}
    @media(max-width:800px){.note-filter-bar{grid-template-columns:1fr}.calc-tools{grid-template-columns:repeat(2,minmax(0,1fr))}.quick-capture-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:520px){.calc-tools{grid-template-columns:1fr}.quick-capture-grid{grid-template-columns:1fr}}
  `;document.head.appendChild(style);
})();

/* ================= OM-LIFEOS ARCHITECTURE CONTRACT v4.7 =================
   Semantic contracts are kept explicit so legacy records remain usable while
   the UI stays on the canonical modules. Dashboard is read-only composition.
*/
const OM_LIFEOS_SPEC=Object.freeze({
  modules:['dashboard','tasks','routine','goals','focus','notes','journal','finance','calculator','health','work','people','spiritual','things','settings'],
  entities:{
    task:{store:'tasks',kind:'action'},habit:{store:'habits',kind:'repeated-behavior'},routine:{store:'routines',kind:'repeated-behavior'},
    goal:{store:'goals'},milestone:{store:'milestones',goalId:'goalId'},strategy:{store:'strategies',goalId:'goalId'},kpi:{store:'kpis',goalId:'goalId'},mission:{store:'missions'},principle:{store:'principles'},mentorRule:{store:'mentorRules'},capitalStrategy:{store:'capitalStrategy'},
    focusSession:{store:'focus',taskId:'taskId',goalId:'goalId',fields:['id','taskId','goalId','label','startedAt','endedAt','durationSeconds','note']},
    note:{store:'notes'},notebook:{derived:'note.category'},tag:{derived:'note.tags'},noteAttachment:{derived:'attachments'},journalEntry:{store:'journal'},journalAttachment:{derived:'attachments'},
    financeAccount:{store:'financeAccounts'},financeTransaction:{store:'finance',canonicalName:'FinanceTransaction'},savingsPlan:{store:'savingsPlans'},investment:{store:'investments'},loan:{store:'loans'},loanPayment:{store:'loanPayments'},asset:{store:'assets'},liability:{store:'liabilities'},financialGoal:{store:'financialGoals'},
    healthProfile:{store:'healthProfile'},healthMeasurement:{store:'healthMeasurements'},healthActivity:{store:'healthActivities'},sleepRecord:{store:'sleepRecords'},nutritionRecord:{store:'nutritionRecords'},waterRecord:{store:'waterRecords'},healthAppointment:{store:'healthAppointments'},healthNote:{store:'healthNotes'},
    workProject:{store:'workProjects'},workResponsibility:{store:'workResponsibilities'},meeting:{store:'meetings'},learningItem:{store:'learningItems'},skill:{store:'skills'},course:{store:'courses'},learningProgress:{store:'learningProgress'},
    person:{store:'people'},relationship:{store:'relationships'},interaction:{store:'interactions'},importantDate:{store:'importantDates'},relationshipReminder:{store:'relationshipReminders'},
    value:{store:'values'},spiritualPractice:{store:'spiritualPractices'},commitment:{store:'commitments'},reflectionLink:{derived:'journal'},
    thing:{store:'things'},document:{store:'documents'},documentCollection:{store:'documentCollections'},warranty:{store:'warranties'},receipt:{store:'receipts'},certificate:{store:'certificates'},importantRecord:{store:'importantRecords'},attachment:{store:'attachments'},
    reminder:{store:'reminders'},achievementRule:{derived:'rule-engine'},achievementEvent:{derived:'event-engine'},searchIndex:{store:'searchIndex'}
  },
  relationships:{goal:['milestone','strategy','kpi','task','focusSession'],work:['task','focusSession','goal'],learning:['task','focusSession','goal'],spiritual:['habit','routine','journal','goal'],person:['interaction','task','reminder'],thing:['document','warranty','receipt','certificate','financeTransaction']},
  forbiddenTopLevel:['life-balance','personal','professional','mental','social','moral','economical','inbox','search','attachments']
});
function FinanceTransactionService(){return {list:()=>safeArr('finance'),add:tx=>{const value={id:uid(),type:tx.type||'expense',accountId:tx.accountId||null,category:tx.category||'Uncategorized',amount:Math.max(0,Number(tx.amount||0)),date:tx.date||today(),note:tx.note||'',linkedEntity:tx.linkedEntity||null,createdAt:Date.now()};state.finance.push(value);return value;},isTransfer:tx=>tx?.type==='transfer'}}
window.OmLifeOSFinanceTransactions=FinanceTransactionService();
const ACHIEVEMENT_RULES=Object.freeze([
  {id:'first-task',title:'First Task',test:()=>safeArr('tasks').length>=1},{id:'ten-tasks',title:'10 Tasks',test:()=>safeArr('tasks').length>=10},
  {id:'first-note',title:'First Note',test:()=>safeArr('notes').length>=1},{id:'first-journal',title:'First Journal',test:()=>safeArr('journal').length>=1},
  {id:'first-goal',title:'First Goal',test:()=>safeArr('goals').length>=1},{id:'focus-60',title:'60 Focus Minutes',test:()=>safeArr('focus').reduce((a,x)=>a+Number(x.durationSeconds||x.minutes*60||0),0)>=3600},
  {id:'habit-streak',title:'Habit streak',test:()=>safeArr('habitLogs').length>=7},{id:'finance-milestone',title:'Finance milestone',test:()=>safeArr('financialGoals').some(x=>Number(x.current||0)>=Number(x.target||Infinity))}
]);
function achievementEvents(){return ACHIEVEMENT_RULES.filter(r=>r.test()).map(r=>({id:r.id,type:'AchievementEvent',ruleId:r.id,title:r.title,occurredAt:Date.now()}))}
window.OmLifeOSAchievementRules=ACHIEVEMENT_RULES;
window.OmLifeOSAchievementEvents=achievementEvents;
const MigrationEngine={version:'4.7',detect(raw){if(!raw||typeof raw!=='object')return 'unknown';return raw.format||raw.version||raw.appVersion||'legacy'},parse(raw){return typeof mapLegacyData==='function'?mapLegacyData(raw):{data:raw,report:{}}},normalize(raw){const parsed=this.parse(raw);return parsed?.data||raw},validate(data){const issues=[];for(const k of ENTITY_KEYS){if(data[k]!=null&&!Array.isArray(data[k]))issues.push(`${k} must be an array`)}return {ok:issues.length===0,issues}},migrate(raw){const version=this.detect(raw),data=this.normalize(raw),validation=this.validate(data);return {version,data,validation,report:{pipeline:['Version Detector','Parser','Normalizer','Semantic Mapper','Validator','Repository','Verification'],status:validation.ok?'ready':'blocked'}}}};
window.OmLifeOSMigrationEngine=MigrationEngine;
window.OmLifeOSAttachmentService={store:storeFiles,remove:removeAttachment,open:openAttachment};
function architectureAudit(){const missing=[];for(const m of OM_LIFEOS_SPEC.modules)if(typeof ({dashboard,tasks,routine,goals,focus,notes,journal,finance,calculator,health,work,people,spiritual,things,settings}[m])!=='function')missing.push(m);return {ok:missing.length===0,missing,modules:OM_LIFEOS_SPEC.modules.length,entityContracts:Object.keys(OM_LIFEOS_SPEC.entities).length};}
window.OmLifeOSArchitecture={spec:OM_LIFEOS_SPEC,audit:architectureAudit};

/* ============================================================
   Nepal BS date widget — embedded, offline-safe BS ↔ AD conversion.
   Calendar data follows the MIT-licensed @sbmdkl/nepali-date-converter
   dataset (1978 BS–2099 BS / 1921 AD–2040 AD).
   ============================================================ */
const OM_BS_MONTHS=['Baisakh','Jestha','Ashadh','Shrawan','Bhadra','Ashwin','Kartik','Mangsir','Poush','Magh','Falgun','Chaitra'];
const OM_BS_MONTHS_NE=['बैशाख','जेठ','असार','श्रावण','भदौ','असोज','कार्तिक','मंसिर','पौष','माघ','फागुन','चैत'];
const OM_BS_DATA={1978:[31,31,32,31,31,31,30,29,30,29,30,30],
1979:[31,31,32,32,31,30,30,29,30,29,30,30],
1980:[31,32,31,32,31,30,30,30,29,29,30,31],
1981:[31,31,31,32,31,31,29,30,30,29,30,30],
1982:[31,31,32,31,31,31,30,29,30,29,30,30],
1983:[31,31,32,32,31,30,30,29,30,29,30,30],
1984:[31,32,31,32,31,30,30,30,29,29,30,31],
1985:[31,31,31,32,31,31,29,30,30,29,30,30],
1986:[31,31,32,31,31,31,30,29,30,29,30,30],
1987:[31,32,31,32,31,30,30,29,30,29,30,30],
1988:[31,32,31,32,31,30,30,30,29,29,30,31],
1989:[31,31,31,32,31,31,30,29,30,29,30,30],
1990:[31,31,32,31,31,31,30,29,30,29,30,30],
1991:[31,32,31,32,31,30,30,29,30,29,30,30],
1992:[31,32,31,32,31,30,30,30,29,30,29,31],
1993:[31,31,31,32,31,31,30,29,30,29,30,30],
1994:[31,31,32,31,31,31,30,29,30,29,30,30],
1995:[31,32,31,32,31,30,30,30,29,29,30,30],
1996:[31,32,31,32,31,30,30,30,29,30,29,31],
1997:[31,31,32,31,31,31,30,29,30,29,30,30],
1998:[31,31,32,31,31,31,30,29,30,29,30,30],
1999:[31,32,31,32,31,30,30,30,29,29,30,31],
2000:[30,32,31,32,31,30,30,30,29,30,29,31],
2001:[31,31,32,31,31,31,30,29,30,29,30,30],
2002:[31,31,32,32,31,30,30,29,30,29,30,30],
2003:[31,32,31,32,31,30,30,30,29,29,30,31],
2004:[30,32,31,32,31,30,30,30,29,30,29,31],
2005:[31,31,32,31,31,31,30,29,30,29,30,30],
2006:[31,31,32,32,31,30,30,29,30,29,30,30],
2007:[31,32,31,32,31,30,30,30,29,29,30,31],
2008:[31,31,31,32,31,31,29,30,30,29,29,31],
2009:[31,31,32,31,31,31,30,29,30,29,30,30],
2010:[31,31,32,32,31,30,30,29,30,29,30,30],
2011:[31,32,31,32,31,30,30,30,29,29,30,31],
2012:[31,31,31,32,31,31,29,30,30,29,30,30],
2013:[31,31,32,31,31,31,30,29,30,29,30,30],
2014:[31,31,32,32,31,30,30,29,30,29,30,30],
2015:[31,32,31,32,31,30,30,30,29,29,30,31],
2016:[31,31,31,32,31,31,29,30,30,29,30,30],
2017:[31,31,32,31,31,31,30,29,30,29,30,30],
2018:[31,32,31,32,31,30,30,29,30,29,30,30],
2019:[31,32,31,32,31,30,30,30,29,30,29,31],
2020:[31,31,31,32,31,31,30,29,30,29,30,30],
2021:[31,31,32,31,31,31,30,29,30,29,30,30],
2022:[31,32,31,32,31,30,30,30,29,29,30,30],
2023:[31,32,31,32,31,30,30,30,29,30,29,31],
2024:[31,31,31,32,31,31,30,29,30,29,30,30],
2025:[31,31,32,31,31,31,30,29,30,29,30,30],
2026:[31,32,31,32,31,30,30,30,29,29,30,31],
2027:[30,32,31,32,31,30,30,30,29,30,29,31],
2028:[31,31,32,31,31,31,30,29,30,29,30,30],
2029:[31,31,32,31,32,30,30,29,30,29,30,30],
2030:[31,32,31,32,31,30,30,30,29,29,30,31],
2031:[30,32,31,32,31,30,30,30,29,30,29,31],
2032:[31,31,32,31,31,31,30,29,30,29,30,30],
2033:[31,31,32,32,31,30,30,29,30,29,30,30],
2034:[31,32,31,32,31,30,30,30,29,29,30,31],
2035:[30,32,31,32,31,31,29,30,30,29,29,31],
2036:[31,31,32,31,31,31,30,29,30,29,30,30],
2037:[31,31,32,32,31,30,30,29,30,29,30,30],
2038:[31,32,31,32,31,30,30,30,29,29,30,31],
2039:[31,31,31,32,31,31,29,30,30,29,30,30],
2040:[31,31,32,31,31,31,30,29,30,29,30,30],
2041:[31,31,32,32,31,30,30,29,30,29,30,30],
2042:[31,32,31,32,31,30,30,30,29,29,30,31],
2043:[31,31,31,32,31,31,29,30,30,29,30,30],
2044:[31,31,32,31,31,31,30,29,30,29,30,30],
2045:[31,32,31,32,31,30,30,29,30,29,30,30],
2046:[31,32,31,32,31,30,30,30,29,29,30,31],
2047:[31,31,31,32,31,31,30,29,30,29,30,30],
2048:[31,31,32,31,31,31,30,29,30,29,30,30],
2049:[31,32,31,32,31,30,30,30,29,29,30,30],
2050:[31,32,31,32,31,30,30,30,29,30,29,31],
2051:[31,31,31,32,31,31,30,29,30,29,30,30],
2052:[31,31,32,31,31,31,30,29,30,29,30,30],
2053:[31,32,31,32,31,30,30,29,30,29,30,30],
2054:[31,32,31,32,31,30,30,30,29,30,29,31],
2055:[31,31,32,31,31,31,30,29,30,29,30,30],
2056:[31,31,32,31,32,30,30,29,30,29,30,30],
2057:[31,32,31,32,31,30,30,30,29,29,30,31],
2058:[30,32,31,32,31,30,30,30,29,30,29,31],
2059:[31,31,32,31,31,31,30,29,30,29,30,30],
2060:[31,31,32,32,31,30,30,29,30,29,30,30],
2061:[31,32,31,32,31,30,30,30,29,29,30,31],
2062:[30,32,31,32,31,31,29,30,29,30,29,31],
2063:[31,31,32,31,31,31,30,29,30,29,30,30],
2064:[31,31,32,32,31,30,30,29,30,29,30,30],
2065:[31,32,31,32,31,30,30,30,29,29,30,31],
2066:[31,31,31,32,31,31,29,30,30,29,29,31],
2067:[31,31,32,31,31,31,30,29,30,29,30,30],
2068:[31,31,32,32,31,30,30,29,30,29,30,30],
2069:[31,32,31,32,31,30,30,30,29,29,30,31],
2070:[31,31,31,32,31,31,29,30,30,29,30,30],
2071:[31,31,32,31,31,31,30,29,30,29,30,30],
2072:[31,32,31,32,31,30,30,29,30,29,30,30],
2073:[31,32,31,32,31,30,30,30,29,29,30,31],
2074:[31,31,31,32,31,31,30,29,30,29,30,30],
2075:[31,31,32,31,31,31,30,29,30,29,30,30],
2076:[31,32,31,32,31,30,30,30,29,29,30,30],
2077:[31,32,31,32,31,30,30,30,29,30,29,31],
2078:[31,31,31,32,31,31,30,29,30,29,30,30],
2079:[31,31,32,31,31,31,30,29,30,29,30,30],
2080:[31,32,31,32,31,30,30,30,29,29,30,30],
2081:[31,32,31,32,31,30,30,30,29,30,29,31],
2082:[31,31,32,31,31,31,30,29,30,29,30,30],
2083:[31,31,32,31,31,31,30,29,30,29,30,30],
2084:[31,31,32,31,31,30,30,30,29,30,30,30],
2085:[31,32,31,32,30,31,30,30,29,30,30,30],
2086:[30,32,31,32,31,30,30,30,29,30,30,30],
2087:[31,31,32,31,31,31,30,30,29,30,30,30],
2088:[30,31,32,32,30,31,30,30,29,30,30,30],
2089:[30,32,31,32,31,30,30,30,29,30,30,30],
2090:[30,32,31,32,31,30,30,30,29,30,30,30],
2091:[31,31,32,31,31,31,30,30,29,30,30,30],
2092:[30,31,32,32,31,30,30,30,29,30,30,30],
2093:[30,32,31,32,31,30,30,30,29,30,30,30],
2094:[31,31,32,31,31,30,30,30,29,30,30,30],
2095:[31,31,32,31,31,31,30,29,30,30,30,30],
2096:[30,31,32,32,31,30,30,29,30,29,30,30],
2097:[31,32,31,32,31,30,30,29,30,30,30,30],
2098:[31,31,32,31,31,31,29,30,29,30,29,31],
2099:[31,32,31,32,31,30,30,30,29,29,30,31]};
const OM_BS_START_AD='1921-04-13';
const OM_BS_MIN_YEAR=1978,OM_BS_MAX_YEAR=2099;
const OM_BS_DIGITS=['०','१','२','३','४','५','६','७','८','९'];
function omPad(n){return String(n).padStart(2,'0')}
function omNepaliDigits(v){return String(v).replace(/\d/g,d=>OM_BS_DIGITS[Number(d)])}
function omIsoDate(y,m,d){return `${y}-${omPad(m)}-${omPad(d)}`}
function omDaysInAdDate(y,m,d){return Math.floor(Date.UTC(y,m-1,d)/86400000)}
function omAdToBs(iso){
  const m=String(iso||'').match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);if(!m)throw new Error('AD date must be YYYY-MM-DD');
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  const diff=omDaysInAdDate(y,mo,d)-omDaysInAdDate(1921,4,13);
  if(diff<0)throw new Error('AD date is before the supported BS calendar range.');
  let rem=diff;
  for(let by=OM_BS_MIN_YEAR;by<=OM_BS_MAX_YEAR;by++){const months=OM_BS_DATA[by];if(!months)continue;const yearDays=months.reduce((a,b)=>a+b,0);if(rem<yearDays){for(let bm=1;bm<=12;bm++){const md=months[bm-1];if(rem<md)return {year:by,month:bm,day:rem+1,iso:omIsoDate(by,bm,rem+1)};rem-=md}}rem-=yearDays}
  throw new Error('AD date is outside the supported BS calendar range.');
}
function omBsToAd(iso){
  const m=String(iso||'').replace(/[०-९]/g,d=>OM_BS_DIGITS.indexOf(d)).match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/);if(!m)throw new Error('BS date must be YYYY-MM-DD');
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);const months=OM_BS_DATA[y];if(!months||mo<1||mo>12||d<1||d>months[mo-1])throw new Error('Invalid BS date.');
  let diff=d-1;for(let by=OM_BS_MIN_YEAR;by<y;by++)diff+=OM_BS_DATA[by].reduce((a,b)=>a+b,0);for(let bm=1;bm<mo;bm++)diff+=months[bm-1];
  const utc=omDaysInAdDate(1921,4,13)+diff;const dt=new Date(utc*86400000);return {year:dt.getUTCFullYear(),month:dt.getUTCMonth()+1,day:dt.getUTCDate(),iso:omIsoDate(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate())};
}
function omLocalIsoToday(){const d=new Date();return omIsoDate(d.getFullYear(),d.getMonth()+1,d.getDate())}
function omBsLabel(bs){return `${omNepaliDigits(bs.year)}-${omNepaliDigits(omPad(bs.month))}-${omNepaliDigits(omPad(bs.day))} · ${OM_BS_MONTHS_NE[bs.month-1]}`;}
function omAdLabel(ad){const d=new Date(Date.UTC(ad.year,ad.month-1,ad.day));return d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',weekday:'short',timeZone:'UTC'})}
function updateBsDateWidget(){try{const adIso=omLocalIsoToday(),bs=omAdToBs(adIso);const a=document.getElementById('bsDateWidgetMain'),b=document.getElementById('bsDateWidgetAd');if(a)a.textContent=`BS ${omBsLabel(bs)}`;if(b)b.textContent=`AD ${adIso}`;const bi=document.getElementById('bsDateInput'),ai=document.getElementById('adDateInput');if(bi&&!document.activeElement?.matches('#bsDateInput'))bi.value=bs.iso;if(ai&&!document.activeElement?.matches('#adDateInput'))ai.value=adIso;const r=document.getElementById('bsDateResult');if(r&&!document.getElementById('bsDateModal')?.classList.contains('open')){const adParts={year:Number(adIso.slice(0,4)),month:Number(adIso.slice(5,7)),day:Number(adIso.slice(8,10))};r.innerHTML=`<b>${omBsLabel(bs)}</b><div class="muted">${omAdLabel(adParts)}</div>`;}}catch(e){console.warn('BS widget update failed',e)}}
function openBsDatePanel(){const m=document.getElementById('bsDateModal');if(!m)return;const adIso=omLocalIsoToday(),bs=omAdToBs(adIso);document.getElementById('bsDateInput').value=bs.iso;document.getElementById('adDateInput').value=adIso;document.getElementById('bsDateResult').innerHTML=`<b>BS ${omBsLabel(bs)}</b><div class="muted">AD ${adIso} · linked automatically</div>`;m.classList.add('open');setTimeout(()=>document.getElementById('bsDateInput')?.focus(),0)}
function closeBsDatePanel(){document.getElementById('bsDateModal')?.classList.remove('open')}
function convertBsToAdUi(){try{const bs=document.getElementById('bsDateInput').value.trim();const ad=omBsToAd(bs);const adIso=ad.iso;document.getElementById('adDateInput').value=adIso;document.getElementById('bsDateResult').innerHTML=`<b>BS ${bs}</b><div class="muted">↔ AD ${adIso} · ${omAdLabel(ad)}</div>`}catch(e){toast('❌ '+e.message)}}
function convertAdToBsUi(){try{const adIso=document.getElementById('adDateInput').value;const bs=omAdToBs(adIso);document.getElementById('bsDateInput').value=bs.iso;document.getElementById('bsDateResult').innerHTML=`<b>AD ${adIso}</b><div class="muted">↔ BS ${omBsLabel(bs)}</div>`}catch(e){toast('❌ '+e.message)}}
function setBsTodayUi(){const adIso=omLocalIsoToday(),bs=omAdToBs(adIso);document.getElementById('bsDateInput').value=bs.iso;document.getElementById('adDateInput').value=adIso;document.getElementById('bsDateResult').innerHTML=`<b>BS ${omBsLabel(bs)}</b><div class="muted">↔ AD ${adIso} · Today</div>`}
window.OmLifeOSBsDate={adToBs:omAdToBs,bsToAd:omBsToAd,update:updateBsDateWidget};
setTimeout(updateBsDateWidget,0);setInterval(updateBsDateWidget,60000);
