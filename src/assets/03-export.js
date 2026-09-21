
  /* LifeOS Backup & Export — local computer folder connection.
     Desktop/Tauri keeps using the native folder bridge. Standalone HTML uses the
     browser File System Access API, so exports are written directly to the
     connected local folder. */
  const COMPUTER_PATH_KEY='lifeos-computer-export-path-v2';
  const COMPUTER_HANDLE_DB='lifeos-local-folder-v1';
  const COMPUTER_HANDLE_STORE='handles';
  let computerDirectoryPath='';
  let computerDirectoryHandle=null;

  function nativeInvoke(command,args){
    const invoke=window.__TAURI__?.core?.invoke;
    if(typeof invoke==='function')return invoke(command,args);
    const internals=window.__TAURI_INTERNALS__;
    if(internals && typeof internals.invoke==='function')return internals.invoke(command,args);
    throw new Error('Native Tauri bridge unavailable');
  }
  function hasNativeBridge(){return typeof window.__TAURI__?.core?.invoke==='function' || typeof window.__TAURI_INTERNALS__?.invoke==='function'}
  function hasLocalFolderPicker(){return typeof window.showDirectoryPicker==='function'}

  function openComputerHandleDb(){
    return new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}
      const req=indexedDB.open(COMPUTER_HANDLE_DB,1);
      req.onupgradeneeded=()=>{try{req.result.createObjectStore(COMPUTER_HANDLE_STORE)}catch(e){}}
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Folder connection storage unavailable'));
    });
  }
  async function readStoredComputerHandle(){
    try{const db=await openComputerHandleDb();return await new Promise((resolve,reject)=>{const tx=db.transaction(COMPUTER_HANDLE_STORE,'readonly');const req=tx.objectStore(COMPUTER_HANDLE_STORE).get('computer');req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error||new Error('Could not read folder connection'))})}catch(e){return null}
  }
  async function writeStoredComputerHandle(handle){
    try{const db=await openComputerHandleDb();await new Promise((resolve,reject)=>{const tx=db.transaction(COMPUTER_HANDLE_STORE,'readwrite');tx.objectStore(COMPUTER_HANDLE_STORE).put(handle,'computer');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Could not save folder connection'));tx.onabort=()=>reject(tx.error||new Error('Could not save folder connection'))})}catch(e){console.warn('Local folder connection persistence unavailable',e)}
  }
  async function clearStoredComputerHandle(){
    try{const db=await openComputerHandleDb();await new Promise((resolve,reject)=>{const tx=db.transaction(COMPUTER_HANDLE_STORE,'readwrite');tx.objectStore(COMPUTER_HANDLE_STORE).delete('computer');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}catch(e){}
  }

  async function loadComputerConnection(){
    try{
      if(hasNativeBridge()){
        computerDirectoryPath=String(localStorage.getItem(COMPUTER_PATH_KEY)||'').trim();
        return computerDirectoryPath||null;
      }
      if(isMobileRuntime() || !hasLocalFolderPicker())return null;
      const handle=await readStoredComputerHandle();
      if(!handle)return null;
      computerDirectoryHandle=handle;
      computerDirectoryPath=String(handle.name||'').trim();
      try{if(await handle.queryPermission({mode:'readwrite'})!=='granted')computerDirectoryPath=''}catch(e){computerDirectoryPath=''}
      return computerDirectoryPath||null;
    }catch(e){computerDirectoryPath='';computerDirectoryHandle=null;return null}
  }

  async function saveComputerConnection(pathOrHandle){
    try{
      if(hasNativeBridge()){
        computerDirectoryPath=String(pathOrHandle||'').trim();
        if(computerDirectoryPath)localStorage.setItem(COMPUTER_PATH_KEY,computerDirectoryPath);else localStorage.removeItem(COMPUTER_PATH_KEY);
      }else if(pathOrHandle && typeof pathOrHandle==='object'){
        computerDirectoryHandle=pathOrHandle;
        computerDirectoryPath=String(pathOrHandle.name||'').trim();
        await writeStoredComputerHandle(pathOrHandle);
      }
    }catch(e){console.warn('Computer connection persistence failed',e)}
  }
  async function clearComputerConnection(){computerDirectoryPath='';computerDirectoryHandle=null;try{localStorage.removeItem(COMPUTER_PATH_KEY)}catch(e){}await clearStoredComputerHandle();renderSettings()}

  async function chooseComputerFolder(){
    if(hasNativeBridge()){
      const path=await nativeInvoke('choose_export_directory');
      if(!path)return null;
      await saveComputerConnection(path);return path;
    }
    if(isMobileRuntime())return null;
    if(!hasLocalFolderPicker())throw new Error('Local folder connection is not supported by this browser. Use Chrome or Edge.');
    const handle=await window.showDirectoryPicker({mode:'readwrite',id:'om-lifeos-export-folder'});
    if(!handle)return null;
    await saveComputerConnection(handle);return handle.name||'Local folder';
  }

  function computerConnected(){return !!(computerDirectoryPath && (hasNativeBridge() || computerDirectoryHandle))}
  function computerStatusHtml(){
    if(isMobileRuntime())return '<span class="backup-connected">● Mobile storage active</span>';
    if(computerConnected())return `<span class="backup-connected">● Local folder: ${esc(computerDirectoryPath)}</span>`;
    if(hasNativeBridge())return '<span class="backup-connected backup-disconnected">● Local computer not connected</span>';
    if(hasLocalFolderPicker())return '<span class="backup-connected backup-disconnected">● Local folder not connected</span>';
    return '<span class="backup-connected backup-disconnected">● Local folder connection unavailable</span>';
  }
  async function connectComputer(){
    if(isMobileRuntime()){toast('Mobile storage uses Downloads or Share.');return false}
    try{const path=await chooseComputerFolder();if(!path)return false;renderSettings();toast(`✓ Local computer folder connected: ${path}`);return true}
    catch(e){if(e?.name!=='AbortError')toast('Local connection failed: '+(e?.message||'Folder picker unavailable'));return false}
  }
  async function ensureComputerFolderForExport(){if(isMobileRuntime())return null;if(!computerConnected()){const ok=await connectComputer();if(!ok)return null}return computerDirectoryPath||computerDirectoryHandle}

  async function saveComputerForExport(filename,content,mime,subfolder=''){
    if(isMobileRuntime())return saveBlobForMobile(filename,content,mime);
    if(hasNativeBridge()){
      const root=await ensureComputerFolderForExport();if(!root)return false;
      try{
        const blob=content instanceof Blob?content:new Blob([content],{type:mime||'application/octet-stream'});
        const bytes=new Uint8Array(await blob.arrayBuffer());
        const savedPath=await nativeInvoke('save_export_file',{root,subfolder:String(subfolder||'').trim(),filename:String(filename),bytes:Array.from(bytes)});
        toast(`✓ Saved: ${savedPath}`);return true;
      }catch(e){
        console.error('Native computer folder save failed',e);const message=e?.message||String(e)||'Folder permission/error';
        if(/no longer exists|not found|cannot find|could not find/i.test(message))await clearComputerConnection();
        toast('Save failed: '+message);return false;
      }
    }
    if(!hasLocalFolderPicker()){toast('Local folder connection is not supported by this browser.');return false}
    try{
      if(!computerDirectoryHandle){const ok=await connectComputer();if(!ok)return false}
      const permission=await computerDirectoryHandle.requestPermission({mode:'readwrite'});
      if(permission!=='granted'){toast('Local folder write permission was not granted.');return false}
      let target=computerDirectoryHandle;const folder=String(subfolder||'').trim();
      if(folder)target=await target.getDirectoryHandle(folder,{create:true});
      const file=await target.getFileHandle(String(filename),{create:true});
      const writable=await file.createWritable();
      const blob=content instanceof Blob?content:new Blob([content],{type:mime||'application/octet-stream'});
      await writable.write(blob);await writable.close();
      toast(`✓ Saved locally: ${folder?folder+'/':''}${filename}`);return true;
    }catch(e){
      console.error('Local folder save failed',e);
      if(e?.name==='NotAllowedError')toast('Local folder permission was denied. Connect Computer again.');
      else if(e?.name!=='AbortError')toast('Local save failed: '+(e?.message||String(e)));
      return false;
    }
  }

  loadComputerConnection().then(()=>{if(typeof renderSettings==='function')renderSettings()}).catch(()=>{});
  /* Selection is persisted locally so the next export starts with the user's last chosen menu set. */

  async function backupPayload(){
    // Native SQLite is lazy-loaded in memory, so a portable JSON backup must
    // page through the canonical database instead of serializing only the
    // currently visible UI windows. Older attachment blobs are hydrated page-by-page
    // during native lazy loads and are included in the record payload.
    const snapshot=(NATIVE_RUNTIME&&window.omDb?.exportAll)?await window.omDb.exportAll():null;
    if(snapshot)return {lifeOSBackup:'LifeOS',version:4,exportedAt:new Date().toISOString(),data:snapshot};
    await hydrateAttachmentsFromIDB(data);
    return {lifeOSBackup:'LifeOS',version:4,exportedAt:new Date().toISOString(),data:data};
  }
  async function backupJson(){return JSON.stringify(await backupPayload(),null,2)}
  // Keep this callable in browser/local-preview mode as well as Tauri.
  window.backupJson=backupJson;
  window.exportLifeOSBackup=async function(){
    try{
      const name='LifeOS_Backup_'+today()+'.json',json=await backupJson();
      const ok=await saveComputerForExport(name,json,'application/json','Backup');
      if(!ok)return;
      toast('✓ JSON backup saved to selected folder');
    }catch(e){console.error(e);toast('Backup export failed: '+(e?.message||'Unknown error'))}
  };
  function isMobileRuntime(){return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent||'')}
  window.lifeosIsMobileRuntime=isMobileRuntime;
  async function saveBlobForMobile(filename,content,mime){
    const blob=content instanceof Blob?content:new Blob([content],{type:mime||'application/octet-stream'});
    // Native Android: save directly into Downloads when the Tauri fs scope is available.
    if(isMobileRuntime() && window.__TAURI__?.fs){
      try{
        const fs=window.__TAURI__.fs;
        const bytes=new Uint8Array(await blob.arrayBuffer());
        await fs.writeFile(filename,bytes,{baseDir:fs.BaseDirectory.Download});
        toast('✓ Backup saved in Downloads');
        return true;
      }catch(e){console.warn('Native Downloads save unavailable',e)}
    }
    try{
      const file=new File([blob],filename,{type:mime||blob.type||'application/octet-stream'});
      if(navigator.share && (!navigator.canShare || navigator.canShare({files:[file]}))){
        await navigator.share({title:'LifeOS Backup',text:'LifeOS Backup: '+filename,files:[file]});
        toast('✓ File shared'); return true;
      }
    }catch(e){if(e?.name==='AbortError')return false}
    try{
      const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.rel='noopener';a.style.display='none';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);toast('✓ File download started');return true;
    }catch(e){toast('Mobile file save failed: '+(e?.message||'Unknown error'));return false}
  }

  /* Robust Office export: generate real OOXML .docx/.xlsx files in-browser. */
  function officeXmlEsc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
  function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
  function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
  const CRC32_TABLE=(()=>{
const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0}return t})();
  function crc32(bytes){let c=0xffffffff;for(const b of bytes)c=CRC32_TABLE[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0}
  function concatBytes(parts){let n=0;for(const p of parts)n+=p.length;const out=new Uint8Array(n);let o=0;for(const p of parts){out.set(p,o);o+=p.length}return out}
  function zipStore(files){
    const enc=new TextEncoder(), locals=[], centrals=[]; let offset=0;
    for(const f of files){const name=enc.encode(f.name), dataBytes=typeof f.data==='string'?enc.encode(f.data):f.data, crc=crc32(dataBytes);
      const lh=concatBytes([new Uint8Array([80,75,3,4]),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(dataBytes.length),u32(dataBytes.length),u16(name.length),u16(0),name,dataBytes]);
      locals.push(lh);
      const ch=concatBytes([new Uint8Array([80,75,1,2]),u16(20),u16(20),u16(0),u16(0),u16(0),u16(0),u32(crc),u32(dataBytes.length),u32(dataBytes.length),u16(name.length),u16(0),u16(0),u16(0),u16(0),u32(0),u32(offset),name]);
      centrals.push(ch); offset+=lh.length;
    }
    const central=concatBytes(centrals), body=concatBytes(locals), cdOffset=body.length;
    const end=concatBytes([new Uint8Array([80,75,5,6]),u16(0),u16(0),u16(files.length),u16(files.length),u32(central.length),u32(cdOffset),u16(0)]);
    return new Blob([body,central,end],{type:'application/zip'});
  }
  function exportSafeValue(v){
    if(v===null||v===undefined)return '';
    if(typeof v==='string')return v.replace(/\s+/g,' ').trim();
    if(typeof v==='number'||typeof v==='boolean')return String(v);
    if(Array.isArray(v)){
      return v.map(x=>{
        if(x&&typeof x==='object'){
          const y={...x};delete y.data;delete y.images;delete y.files;
          return Object.entries(y).map(([k,val])=>`${k}: ${exportSafeValue(val)}`).join(' | ');
        }
        return exportSafeValue(x);
      }).filter(Boolean).join(' ; ');
    }
    if(typeof v==='object'){
      const y={...v};delete y.data;delete y.images;delete y.files;
      return Object.entries(y).map(([k,val])=>`${k}: ${exportSafeValue(val)}`).join(' | ');
    }
    return String(v);
  }
  function exportCleanRecord(obj){
    const out={};
    Object.entries(obj||{}).forEach(([k,v])=>{
      if(['id','createdAt'].includes(k))return;
      if(k==='html'){
        const tmp=document.createElement('div');tmp.innerHTML=String(v||'');out['Content']=tmp.textContent||'';return;
      }
      if(k==='body'&&out['Content'])return;
      if(k==='images'||k==='files'){
        if(Array.isArray(v)&&v.length)out['Attachments']=v.map(x=>x?.name||'Image').filter(Boolean).join(', ');
        return;
      }
      out[k]=exportSafeValue(v);
    });
    const exportDates=[];Object.entries(obj||{}).forEach(([k,v])=>{if(/(date|time|created|updated|due|start|end|day|timestamp)/i.test(k))(Array.isArray(v)?v:[v]).forEach(x=>exportDates.push(...dateStringsFromValue(x)))});
    Object.defineProperty(out,'__exportDates',{value:[...new Set(exportDates)],enumerable:false});
    return out;
  }
  function exportRecordsFromArray(arr){return (Array.isArray(arr)?arr:[]).map(exportCleanRecord)}
  function exportCategoryRecords(id){return getCategoryItems(id).map(exportCleanRecord)}
  function exportSummaryRecords(){
    const tasks=Array.isArray(data.tasks)?data.tasks:[], habits=Array.isArray(data.habits)?data.habits:[], goals=Array.isArray(data.goals)?data.goals:[];
    const expenses=Array.isArray(data.expenses)?data.expenses:[],income=Array.isArray(data.income)?data.income:[];
    const focus=Array.isArray(data.focusSessions)?data.focusSessions:[];
    const daily=Object.values(data.daily||{});
    const totalExpense=expenses.reduce((a,x)=>a+Number(x.amount||0),0),totalIncome=income.reduce((a,x)=>a+Number(x.amount||0),0);
    return [
      {Metric:'Tasks',Value:tasks.length,Completed:tasks.filter(x=>x.done).length},
      {Metric:'Notes',Value:(data.notes||[]).length},
      {Metric:'Journal Entries',Value:(data.journal||[]).length},
      {Metric:'Habits',Value:habits.length},
      {Metric:'Goals',Value:goals.length},
      {Metric:'Routines',Value:(data.routines||[]).length},
      {Metric:'Daily Plans',Value:daily.length},
      {Metric:'Focus Sessions',Value:focus.length},
      {Metric:'Mentor Quotes',Value:(data.mentorQuotes||[]).length},
      {Metric:'Expenses Total',Value:totalExpense},
      {Metric:'Income Total',Value:totalIncome},
      {Metric:'Balance (Income - Expense)',Value:totalIncome-totalExpense},
      ...Object.keys(LIFEOS_CATEGORIES||{}).map(id=>({Metric:LIFEOS_CATEGORIES[id][0].replace(/^\S+\s/,''),Value:exportCategoryRecords(id).length}))
    ];
  }
  function exportSectionRecords(id){
    if(id==='dashboard')return exportSummaryRecords();
    if(id==='mentor'){
      const rows=[];
      rows.push({Type:'Capital & Settings',...exportCleanRecord(data.mentor||{})});
      Object.entries(data.mentorKpis||{}).forEach(([date,v])=>rows.push({Type:'KPI',Date:date,...exportCleanRecord(v||{})}));
      (data.mentorQuotes||[]).forEach(v=>rows.push({Type:'Quote',...exportCleanRecord(v)}));
      (data.mentorRules||[]).forEach(v=>rows.push({Type:'Rule',...exportCleanRecord(v)}));
      return rows;
    }
    if(id==='planner')return Object.entries(data.daily||{}).map(([date,v])=>({Date:date,...exportCleanRecord(v||{})}));
    if(id==='tasks')return exportRecordsFromArray(data.tasks);
    if(id==='routine')return exportRecordsFromArray(data.routines);
    if(id==='habits')return exportRecordsFromArray(data.habits);
    if(id==='goals')return exportRecordsFromArray(data.goals);
    if(id==='focus')return exportRecordsFromArray(data.focusSessions);
    if(id==='notes')return exportRecordsFromArray(data.notes);
    if(id==='journal')return exportRecordsFromArray(data.journal);
    if(id==='expenses')return exportRecordsFromArray([...(data.expenses||[]),...(data.income||[]).map(x=>({...x,recordType:'Income'}))]);
    if(LIFEOS_CATEGORIES[id])return exportCategoryRecords(id);
    if(id==='settings')return Object.entries(data.settings||{}).map(([key,value])=>({Setting:key,Value:exportSafeValue(value)}));
    if(id==='device-storage')return [{Storage:'Browser Local Storage',Status:'Active'},{Storage:'IndexedDB Device Storage',Status:'Available in supported browsers'},{Storage:'Computer Folder',Status:computerConnected()?'Connected':'Not connected'}];
    return [];
  }
  function exportSections(){
    const ids=allExportMenuIds();
    return ids.map(id=>({id,title:(navItems.find(x=>x[0]===id)?.[1]||id).replace(/^\S+\s/,''),rows:exportSectionRecords(id)}));
  }
  function selectedExportSections(){
    const selected=new Set(getExportSelection());
    return exportSections().filter(sec=>selected.has(sec.id));
  }
  /* Export the complete current data for the selected menu items and date range.
     Every export is a fresh report; previous exports never hide unchanged records. */
  function exportStable(v){
    if(v===null||v===undefined)return '';
    if(Array.isArray(v))return '['+v.map(exportStable).sort().join(',')+']';
    if(typeof v==='object')return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+exportStable(v[k])).join(',')+'}';
    return JSON.stringify(v);
  }
  function exportRowKey(section,row){
    return section.id+'::'+exportStable(row);
  }
  const EXPORT_PERIOD_KEY='LifeOS_export_period';
  const EXPORT_SELECTION_KEY='LifeOS_export_selection_v1';
  function localDateISO(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function allExportMenuIds(){return (Array.isArray(navItems)?navItems:[]).map(x=>String(x?.[0]||'')).filter(Boolean)}
  function getExportPeriod(){
    try{
      const raw=JSON.parse(localStorage.getItem(EXPORT_PERIOD_KEY)||'null');
      if(raw && typeof raw==='object'){
        const mode=['all','week','month','year','custom'].includes(raw.mode)?raw.mode:'all';
        return {mode,from:String(raw.from||''),to:String(raw.to||'')};
      }
    }catch(e){}
    return {mode:'all',from:'',to:''};
  }
  function syncExportSelectionUi(){
    const selected=new Set(getExportSelection());
    document.querySelectorAll('[data-export-section]').forEach(el=>{el.checked=selected.has(String(el.value||''));});
    const label=document.getElementById('exportSelectionLabel');
    if(label)label.textContent=exportSelectionLabel();
  }
  function getExportSelection(){
    const ids=allExportMenuIds();
    try{
      const raw=JSON.parse(localStorage.getItem(EXPORT_SELECTION_KEY)||'null');
      if(Array.isArray(raw))return raw.map(String).filter(id=>ids.includes(id));
    }catch(e){}
    if(Array.isArray(window.__lifeosExportSelection))return window.__lifeosExportSelection.map(String).filter(id=>ids.includes(id));
    return ids;
  }
  function setExportSelection(ids){
    const allowed=new Set(allExportMenuIds());
    const picked=[...new Set((Array.isArray(ids)?ids:[]).map(String).filter(id=>allowed.has(id)))];
    window.__lifeosExportSelection=picked;
    try{localStorage.setItem(EXPORT_SELECTION_KEY,JSON.stringify(picked));}catch(e){console.warn('Export selection persistence unavailable',e)}
    syncExportSelectionUi();
  }
  function exportSelectionLabel(){
    const selected=getExportSelection(), total=allExportMenuIds().length;
    return `${selected.length}/${total} menu items selected`;
  }
  function isExportSectionSelected(id){return getExportSelection().includes(id)}
  function toggleExportSection(id,checked){
    const selected=new Set(getExportSelection());
    if(checked)selected.add(id);else selected.delete(id);
    setExportSelection([...selected]);
  }
  function selectAllExportSections(){setExportSelection(allExportMenuIds());}
  function clearExportSections(){setExportSelection([]);}
  window.changeExportSection=function(id,checked){toggleExportSection(id,!!checked)}
  window.selectAllExportSections=selectAllExportSections;
  window.clearExportSections=clearExportSections;
  window.refreshExportSelection=syncExportSelectionUi;
  function setExportPeriod(mode,from='',to=''){const p={mode,from,to};try{localStorage.setItem(EXPORT_PERIOD_KEY,JSON.stringify(p))}catch(e){console.warn('Export period persistence unavailable',e)}const c=document.getElementById('exportCustomDates');if(c)c.style.display=mode==='custom'?'flex':'none';}
  function exportPeriodLabel(){const p=getExportPeriod();if(p.mode==='week')return 'This Week';if(p.mode==='month')return 'This Month';if(p.mode==='year')return 'This Year';if(p.mode==='custom'&&p.from&&p.to)return p.from+' → '+p.to;return 'All Data'}
  function exportPeriodBounds(){const p=getExportPeriod(),now=new Date();let from='',to='';if(p.mode==='week'){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()),day=d.getDay(),diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);from=localDateISO(d);const end=new Date(d.getFullYear(),d.getMonth(),d.getDate()+6);to=localDateISO(end)}else if(p.mode==='month'){from=localDateISO(new Date(now.getFullYear(),now.getMonth(),1));to=localDateISO(new Date(now.getFullYear(),now.getMonth()+1,0))}else if(p.mode==='year'){from=now.getFullYear()+'-01-01';to=now.getFullYear()+'-12-31'}else if(p.mode==='custom'){from=p.from;to=p.to}return {from,to}}
  function dateStringsFromValue(v){const out=[];if(v===null||v===undefined||v==='')return out;if(typeof v==='number'&&v>100000000000){const d=new Date(v);if(!Number.isNaN(d.getTime()))out.push(localDateISO(d));return out}const s=String(v);let m=s.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/);if(m){const parts=m[0].split(/[-\/]/);out.push(parts[0]+'-'+String(parts[1]).padStart(2,'0')+'-'+String(parts[2]).padStart(2,'0'))}m=s.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/);if(m)out.push(m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'));return out}
  function rowDateValues(row){const out=[...(row?.__exportDates||[])];Object.entries(row||{}).forEach(([k,v])=>{if(!/(date|time|created|updated|due|start|end|day|timestamp)/i.test(k))return;(Array.isArray(v)?v:[v]).forEach(x=>out.push(...dateStringsFromValue(x)))});return [...new Set(out.filter(Boolean))]}
  function filterRowsByExportPeriod(sec){
    const p=getExportPeriod();if(p.mode==='all')return sec.rows;
    const b=exportPeriodBounds();if(!b.from||!b.to)return [];
    return sec.rows.filter(row=>{
      const dates=rowDateValues(row);
      /* Metadata/menu selections without record dates remain available so a selected
         menu never silently disappears from a date-filtered export. */
      if(!dates.length)return ['settings','device-storage','mentor'].includes(sec.id);
      return dates.some(d=>d>=b.from&&d<=b.to);
    });
  }
  function filteredExportSections(){
    const sections=selectedExportSections().map(sec=>({...sec,rows:filterRowsByExportPeriod(sec)}));
    const dashboard=sections.find(sec=>sec.id==='dashboard');
    if(dashboard)dashboard.rows=exportPeriodSummary(sections.filter(sec=>sec.id!=='dashboard'));
    return sections;
  }
  function exportPeriodSummary(sections){const find=id=>sections.find(s=>s.id===id)?.rows||[];const tasks=find('tasks'),notes=find('notes'),journal=find('journal'),habits=find('habits'),goals=find('goals'),routines=find('routine'),planner=find('planner'),focus=find('focus'),expenses=find('expenses');const expenseRows=expenses.filter(x=>String(x.recordType||'').toLowerCase()!=='income'),incomeRows=expenses.filter(x=>String(x.recordType||'').toLowerCase()==='income');const sum=rows=>rows.reduce((a,x)=>a+Number(x.amount||0),0);return [{Metric:'Tasks',Value:tasks.length,Completed:tasks.filter(x=>String(x.done).toLowerCase()==='true').length},{Metric:'Notes',Value:notes.length},{Metric:'Journal Entries',Value:journal.length},{Metric:'Habits',Value:habits.length},{Metric:'Goals',Value:goals.length},{Metric:'Routines',Value:routines.length},{Metric:'Daily Plans',Value:planner.length},{Metric:'Focus Sessions',Value:focus.length},{Metric:'Expenses Total',Value:sum(expenseRows)},{Metric:'Income Total',Value:sum(incomeRows)},{Metric:'Balance (Income - Expense)',Value:sum(incomeRows)-sum(expenseRows)},...Object.keys(LIFEOS_CATEGORIES||{}).map(id=>({Metric:LIFEOS_CATEGORIES[id][0].replace(/^\S+\s/,''),Value:find(id).length}))]}
  function exportStateKey(format){return KEY+'_export_state_'+format+'_'+exportPeriodLabel().replace(/[^a-z0-9]+/gi,'_')}
  function readExportState(format){try{return JSON.parse(localStorage.getItem(exportStateKey(format))||'null')}catch(e){return null}}
  function writeExportState(format,sections){try{const state={version:3,exportedAt:Date.now(),period:exportPeriodLabel(),sections:{}};sections.forEach(sec=>{state.sections[sec.id]=sec.rows.map(r=>exportRowKey(sec,r))});localStorage.setItem(exportStateKey(format),JSON.stringify(state));return true}catch(e){console.warn('Export state save failed',e);return false}}
  function exportChangedSections(format){
    /* Word/Excel/PDF are user-requested reports: always export the complete data
       for the selected menu items and selected date range. Never silently downgrade
       an All Data export to changed-only rows after a previous export. */
    const all=filteredExportSections();
    return getExportSelection().length?all:[];
  }
  function currentExportStateSections(){return filteredExportSections()}
  function commitExportState(format,sections){writeExportState(format,sections)}
  function lifeosTextRows(sections=exportChangedSections('pdf')){
    const rows=[['ॐ Om-LifeOS — Advanced Export'],['Professional report / form export'],[exportPeriodBounds().from&&exportPeriodBounds().to?`Date Range: ${exportPeriodBounds().from} → ${exportPeriodBounds().to}`:`Date Range: ${exportPeriodLabel()}`],['Exported: '+new Date().toLocaleString()],['']];
    sections.forEach(sec=>{
      rows.push([`SECTION: ${sec.title}`]);
      const rs=sec.rows||[];
      if(!rs.length){rows.push(['No data recorded in the selected period.'],['']);return;}
      const hs=[...new Set(rs.flatMap(r=>Object.keys(r||{})))].slice(0,10);
      if(hs.length)rows.push(hs);
      rs.slice(0,500).forEach(r=>rows.push(hs.map(h=>exportSafeValue(r?.[h]??''))));
      if(rs.length>500)rows.push([`Showing first 500 of ${rs.length} selected records.`]);
      rows.push(['']);
    });
    if(rows.length===5)rows.push(['No data recorded in the selected export.']);
    return rows;
  }
  function makeDocxBlob(sections=exportChangedSections('word')){
    const p=(text='',bold=false,size=21)=>`<w:p><w:pPr><w:spacing w:after="90"/></w:pPr><w:r><w:rPr>${bold?'<w:b/>':''}<w:sz w:val="${size}"/></w:rPr><w:t xml:space="preserve">${officeXmlEsc(text)}</w:t></w:r></w:p>`;
    const heading=(text,level=1)=>`<w:p><w:pPr><w:spacing w:before="180" w:after="100"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${level===1?30:24}"/></w:rPr><w:t>${officeXmlEsc(text)}</w:t></w:r></w:p>`;
    const cell=(text,bold=false,shade='FFFFFF')=>`<w:tc><w:tcPr><w:shd w:fill="${shade}"/><w:tcW w:w="4680" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="5" w:color="D9DEE7"/><w:left w:val="single" w:sz="5" w:color="D9DEE7"/><w:bottom w:val="single" w:sz="5" w:color="D9DEE7"/><w:right w:val="single" w:sz="5" w:color="D9DEE7"/></w:tcBorders></w:tcPr><w:p><w:r>${bold?'<w:rPr><w:b/></w:rPr>':''}<w:t xml:space="preserve">${officeXmlEsc(text)}</w:t></w:r></w:p></w:tc>`;
    const table=(headers,rows)=>{
      const hs=headers.length?headers:['Status']; const rs=rows.length?rows:[{Status:'No data recorded in this section.'}];
      const head=`<w:tr>${hs.map(h=>cell(h,true,'E8ECF4')).join('')}</w:tr>`;
      const body=rs.map(r=>`<w:tr>${hs.map(h=>cell(exportSafeValue(r?.[h]??''))).join('')}</w:tr>`).join('');
      return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="autofit"/><w:tblBorders><w:top w:val="single" w:sz="6" w:color="BFC6D1"/><w:left w:val="single" w:sz="6" w:color="BFC6D1"/><w:bottom w:val="single" w:sz="6" w:color="BFC6D1"/><w:right w:val="single" w:sz="6" w:color="BFC6D1"/><w:insideH w:val="single" w:sz="4" w:color="D9DEE7"/><w:insideV w:val="single" w:sz="4" w:color="D9DEE7"/></w:tblBorders></w:tblPr>${head}${body}</w:tbl>`;
    };
    const periodBounds=exportPeriodBounds();
    const periodText=periodBounds.from&&periodBounds.to ? `Date Range: ${periodBounds.from} → ${periodBounds.to}` : `Date Range: ${exportPeriodLabel()}`;
    let body=heading('ॐ Om-LifeOS — Executive Dashboard',1)+p('Advanced export-ready report • AD + BS • Actual selected LifeOS data',false,22)+p(periodText)+p('Exported: '+new Date().toLocaleString());
    const summary=sections.find(sec=>sec.id==='dashboard');
    if(summary){
      body+=heading('Executive KPI Summary',1);
      const kpis=summary.rows.slice(0,4).map(r=>({Metric:r.Metric||'',Value:r.Value??'',Completed:r.Completed??''}));
      if(kpis.length)body+=table(['KPI','Value','Status / Completed'],kpis);
      body+=p('');
      body+=table(['Metric','Value','Completed'],summary.rows.map(r=>({Metric:r.Metric||r.Report||'',Value:r.Value??r.DateRange??'',Completed:r.Completed??''})));
    }
    sections.filter(sec=>sec.id!=='dashboard').forEach(sec=>{
      body+=heading(sec.title,1);
      const rows=sec.rows||[];
      if(!rows.length){body+=p('No data recorded in the selected period.');return;}
      const headers=[...new Set(rows.flatMap(r=>Object.keys(r||{})))].slice(0,12);
      body+=table(headers,rows.slice(0,500));
      if(rows.length>500)body+=p(`Showing first 500 rows of ${rows.length} selected records.`);
    });
    const files=[
      {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`},
      {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`},
      {name:'word/_rels/document.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
      {name:'word/document.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="15840" w:h="12240"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`},
      {name:'word/styles.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="21"/></w:rPr></w:style></w:styles>`},
      {name:'docProps/core.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">Om-LifeOS Advanced Export</dc:title><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">Om-LifeOS</dc:creator></cp:coreProperties>`}
    ];
    return zipStore(files);
  }
  function makeXlsxBlob(sections=exportChangedSections('excel')){
    const used=new Set();
    const sheetName=(title)=>{let n=String(title||'Sheet').replace(/[\\\/?*\[\]:]/g,' ').trim().slice(0,31)||'Sheet';let b=n,i=2;while(used.has(n)){n=(b.slice(0,28)+' '+i++).slice(0,31)}used.add(n);return n};
    const escCell=v=>officeXmlEsc(exportSafeValue(v));
    const colRef=ci=>{let n=ci+1,s='';while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s};
    const rowsFor=(sec)=>sec.rows.length?sec.rows:[{Status:'No data recorded in the selected period.'}];
    const sheetXml=(sec,kind='normal')=>{
      const rows=rowsFor(sec), headers=[...new Set(rows.flatMap(r=>Object.keys(r||{})))].slice(0,20); const hs=headers.length?headers:['Status'];
      const title=sec.title||'LifeOS';
      const cells=[];
      const isDash=sec.id==='dashboard';
      cells.push(`<row r="1" ht="34" customHeight="1"><c r="A1" s="3" t="inlineStr"><is><t>${escCell(isDash?'Om-LifeOS Executive Dashboard':title)}</t></is></c></row>`);
      cells.push(`<row r="2"><c r="A2" s="4" t="inlineStr"><is><t>${escCell('Advanced export-ready report • AD + BS • '+periodText)}</t></is></c></row>`);
      cells.push(`<row r="3"><c r="A3" s="4" t="inlineStr"><is><t>${escCell('Exported: '+new Date().toLocaleString())}</t></is></c></row>`);
      let tableStart=5;
      if(isDash){
        const cards=rows.slice(0,4);
        cards.forEach((r,i)=>{const c=i*2;cells.push(`<row r="4"><c r="${colRef(c)}4" s="1" t="inlineStr"><is><t>${escCell(r.Metric||'KPI')}</t></is></c><c r="${colRef(c+1)}4" s="1" t="inlineStr"><is><t>${escCell(r.Completed!==undefined?String(r.Value??'')+' / '+String(r.Completed):r.Value??'')}</t></is></c></row>`)});
        tableStart=7;
      }
      cells.push(`<row r="${tableStart}">${hs.map((h,ci)=>`<c r="${colRef(ci)}${tableStart}" s="1" t="inlineStr"><is><t>${escCell(h)}</t></is></c>`).join('')}</row>`);
      rows.slice(0,2000).forEach((r,ri)=>{const rr=ri+tableStart+1;cells.push(`<row r="${rr}">${hs.map((h,ci)=>`<c r="${colRef(ci)}${rr}" s="2" t="inlineStr"><is><t>${escCell(r?.[h])}</t></is></c>`).join('')}</row>`)});
      const lastCol=colRef(hs.length-1), lastRow=Math.max(tableStart+1,rows.length+tableStart);
      const widths=Array.from({length:Math.max(hs.length,isDash?8:1)},(_,i)=>`<col min="${i+1}" max="${i+1}" width="${i===0?24:22}" customWidth="1"/>`).join('');
      const merges=isDash?'<mergeCells count="1"><mergeCell ref="A1:H1"/></mergeCells>':'';
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView showGridLines="0" workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${widths}</cols><sheetData>${cells.join('')}</sheetData>${merges}<autoFilter ref="A${tableStart}:${lastCol}${lastRow}"/><freezePane ySplit="${tableStart}" topLeftCell="A${tableStart+1}" activePane="bottomLeft" state="frozen"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/><pageSetUpPr fitToPage="1"/></worksheet>`;
    };
    const periodBounds=exportPeriodBounds();
    const periodText=periodBounds.from&&periodBounds.to ? `Date Range: ${periodBounds.from} → ${periodBounds.to}` : `Date Range: ${exportPeriodLabel()}`;
    const sectionsCopy=sections.map(s=>({...s,rows:Array.isArray(s.rows)?s.rows.slice():[]}));
    const dashboard=sectionsCopy.find(s=>s.id==='dashboard');
    if(dashboard)dashboard.rows=exportPeriodSummary(sectionsCopy.filter(s=>s.id!=='dashboard'));
    const sheets=sectionsCopy.map((sec,i)=>({name:sheetName(sec.title),xml:sheetXml(sec),id:i+1}));
    const workbookSheets=sheets.map(s=>`<sheet name="${officeXmlEsc(s.name)}" sheetId="${s.id}" r:id="rId${s.id}"/>`).join('');
    const rels=sheets.map(s=>`<Relationship Id="rId${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.id}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    const contentOverrides=sheets.map(s=>`<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const files=[
      {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${contentOverrides}</Types>`},
      {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
      {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`},
      {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView showSheetTabs="1"/></bookViews><sheets>${workbookSheets}</sheets></workbook>`},
      {name:'xl/styles.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="18"/><name val="Aptos Display"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="E8ECF4"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="DCE6F1"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="3" borderId="0" applyAlignment="1"><alignment vertical="center"/></xf></cellXfs></styleSheet>`},
      ...sheets.map(s=>({name:`xl/worksheets/sheet${s.id}.xml`,data:s.xml}))
    ];
    return zipStore(files);
  }
  let backupExportObjectUrls={word:null,excel:null};
  function prepareBackupExportLinks(){
    try{
      const word=document.getElementById('lifeosWordDownload'), excel=document.getElementById('lifeosExcelDownload');
      if(backupExportObjectUrls.word)URL.revokeObjectURL(backupExportObjectUrls.word);
      if(backupExportObjectUrls.excel)URL.revokeObjectURL(backupExportObjectUrls.excel);
      backupExportObjectUrls.word=URL.createObjectURL(makeDocxBlob());
      backupExportObjectUrls.excel=URL.createObjectURL(makeXlsxBlob());
      if(word){word.href=backupExportObjectUrls.word;word.download='LifeOS_Backup_'+today()+'.docx'}
      if(excel){excel.href=backupExportObjectUrls.excel;excel.download='LifeOS_Backup_'+today()+'.xlsx'}
      return true;
    }catch(e){console.error(e);toast('Office file prepare failed: '+(e?.message||'Unknown error'));return false}
  }

  window.exportLifeOSWord=async function(){
    try{
      const name='LifeOS_Backup_'+today()+'.docx';
      const sections=exportChangedSections('word');
      const blob=makeDocxBlob(sections);
      const ok=await saveComputerForExport(name,blob,'application/vnd.openxmlformats-officedocument.wordprocessingml.document','Word');
      if(ok){commitExportState('word',currentExportStateSections());toast('✓ Word exported: selected menu + date range');}
    }catch(e){console.error(e);toast('Word export failed: '+(e?.message||'Unknown error'))}
  };
  window.exportLifeOSExcel=async function(){
    try{
      const name='LifeOS_Backup_'+today()+'.xlsx';
      const sections=exportChangedSections('excel');
      const blob=makeXlsxBlob(sections);
      const ok=await saveComputerForExport(name,blob,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Excel');
      if(ok){commitExportState('excel',currentExportStateSections());toast('✓ Excel exported: selected menu + date range');}
    }catch(e){console.error(e);toast('Excel export failed: '+(e?.message||'Unknown error'))}
  };
  function pdfTextLines(sections=exportChangedSections('pdf')){
    const rows=lifeosTextRows(sections);
    const b=exportPeriodBounds();
    const periodText=b.from&&b.to ? `Date Range: ${b.from} → ${b.to}` : `Date Range: ${exportPeriodLabel()}`;
    const lines=['LifeOS Backup',periodText,'Exported: '+new Date().toLocaleString(),''];
    rows.forEach(r=>{
      const text=r.filter(Boolean).join(' | ');
      if(text)lines.push(text);
    });
    return lines;
  }
  function makePdfBlob(sections=exportChangedSections('pdf')){
    /* Print-ready A4 PDF rendered from only changed export rows. Canvas keeps Hindi/Unicode readable. */
    const lines=pdfTextLines(sections), pages=[];
    const W=1240,H=1754,margin=82,lineH=30,headerH=120,footerH=55,maxWidth=W-margin*2;
    const font='Arial, "Noto Sans Devanagari", "Segoe UI", sans-serif';
    const wrapText=(ctx,text)=>{
      const out=[]; const words=String(text||'').split(/\s+/); let line='';
      for(const word of words){
        let test=line?line+' '+word:word;
        if(ctx.measureText(test).width>maxWidth && line){out.push(line);line=word;}else line=test;
      }
      if(line)out.push(line); return out.length?out:[''];
    };
    let current=[]; let used=0;
    const measureCanvas=document.createElement('canvas'),mctx=measureCanvas.getContext('2d');
    mctx.font='18px '+font;
    for(const raw of lines){
      const wrapped=wrapText(mctx,raw); const h=wrapped.length*lineH+10;
      if(current.length && used+h>H-margin*2-headerH-footerH){pages.push(current);current=[];used=0;}
      current.push({raw,wrapped});used+=h;
    }
    if(current.length)pages.push(current);
    const images=[];
    pages.forEach((page,pageIndex)=>{
      const c=document.createElement('canvas');c.width=W;c.height=H;const ctx=c.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);ctx.fillStyle='#1b2330';
      ctx.font='bold 30px '+font;ctx.fillText('ॐ Om-LifeOS — Advanced Export',margin,margin+10);
      ctx.font='16px '+font;ctx.fillStyle='#667085';ctx.fillText('Date Range: '+(exportPeriodBounds().from&&exportPeriodBounds().to?exportPeriodBounds().from+' → '+exportPeriodBounds().to:exportPeriodLabel()),margin,margin+42);
      ctx.fillText('Exported: '+new Date().toLocaleString(),margin,margin+64);
      ctx.strokeStyle='#d9dee7';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(margin,margin+86);ctx.lineTo(W-margin,margin+86);ctx.stroke();
      let y=margin+headerH+5;
      page.forEach((item,i)=>{
        const isHeader=pageIndex===0&&i===0&&String(item.raw||'').startsWith('ॐ Om-LifeOS');
        ctx.font=(isHeader?'bold ':'')+'18px '+font;ctx.fillStyle='#1b2330';
        item.wrapped.forEach(line=>{ctx.fillText(line,margin,y);y+=lineH;}); y+=10;
      });
      ctx.strokeStyle='#d9dee7';ctx.beginPath();ctx.moveTo(margin,H-margin-footerH+10);ctx.lineTo(W-margin,H-margin-footerH+10);ctx.stroke();
      ctx.font='14px '+font;ctx.fillStyle='#667085';ctx.fillText('Om-LifeOS • Advanced A4 Report',margin,H-margin-5);
      const pg='Page '+(pageIndex+1)+' of '+pages.length;ctx.fillText(pg,W-margin-ctx.measureText(pg).width,H-margin-5);
      images.push(c.toDataURL('image/jpeg',0.92).split(',')[1]);
    });
    const b64ToBytes=b64=>{const bin=atob(b64),a=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)a[i]=bin.charCodeAt(i);return a};
    const enc=new TextEncoder(),objects=[null],pageIds=[],imageIds=[];let next=3;
    const catalogId=1,pagesId=2;
    images.forEach(()=>{pageIds.push(next++);imageIds.push(next++);});
    objects[catalogId]=enc.encode(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    objects[pagesId]=enc.encode(`<< /Type /Pages /Count ${pages.length} /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] >>`);
    images.forEach((b64,i)=>{
      const imgId=imageIds[i],pageId=pageIds[i],img=b64ToBytes(b64),contentId=next++;
      const content=enc.encode(`q 595 0 0 842 0 0 cm /Im${i+1} Do Q`);
      objects[pageId]=enc.encode(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /Im${i+1} ${imgId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      objects[contentId]=concatBytes([enc.encode(`<< /Length ${content.length} >>\nstream\n`),content,enc.encode('\nendstream')]);
      objects[imgId]=concatBytes([enc.encode(`<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.length} >>\nstream\n`),img,enc.encode('\nendstream')]);
    });
    const chunks=[enc.encode('%PDF-1.4\n%LifeOS\n')];let offset=chunks[0].length,offsets=[0];
    for(let i=1;i<objects.length;i++){const head=enc.encode(`${i} 0 obj\n`),tail=enc.encode('\nendobj\n');offsets[i]=offset;chunks.push(head,objects[i],tail);offset+=head.length+objects[i].length+tail.length;}
    const xrefOffset=offset;let xref=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for(let i=1;i<objects.length;i++)xref+=String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    xref+=`trailer\n<< /Size ${objects.length} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;chunks.push(enc.encode(xref));
    return new Blob(chunks,{type:'application/pdf'});
  }
  window.exportLifeOSPdf=async function(){
    try{
      const name='LifeOS_Backup_'+today()+'.pdf';
      const sections=exportChangedSections('pdf');
      if(!sections.length){toast('Please select at least one menu item for PDF export');return;}
      const blob=makePdfBlob(sections);
      const ok=await saveComputerForExport(name,blob,'application/pdf','PDF');
      if(ok){commitExportState('pdf',currentExportStateSections());toast('✓ PDF exported: selected menu + date range');}
    }catch(e){console.error(e);toast('PDF export failed: '+(e?.message||'Unknown error'))}
  };
  /* Universal document/data importer: Excel (.xlsx/.xls), Word (.docx/.doc) and PDF.
     Imported content is added safely without replacing existing LifeOS data. */
  async function importReadFileBytes(file){ return new Uint8Array(await file.arrayBuffer()); }
  function importU16(b,o){ return b[o]|(b[o+1]<<8); }
  function importU32(b,o){ return (b[o]|(b[o+1]<<8)|(b[o+2]<<16)|(b[o+3]<<24))>>>0; }
  async function importInflateRaw(bytes){
    if(typeof DecompressionStream==='undefined') throw new Error('This runtime cannot decompress ZIP files');
    const ds=new DecompressionStream('deflate-raw');
    const stream=new Blob([bytes]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(stream).arrayBuffer());
  }
  async function importZipEntries(bytes){
    const out=new Map(); let p=0, guard=0;
    while(p+30<=bytes.length && guard++<20000){
      if(importU32(bytes,p)!==0x04034b50) break;
      const method=importU16(bytes,p+8), csize=importU32(bytes,p+18), usize=importU32(bytes,p+22);
      const nlen=importU16(bytes,p+26), xlen=importU16(bytes,p+28);
      const name=new TextDecoder().decode(bytes.slice(p+30,p+30+nlen));
      const start=p+30+nlen+xlen, raw=bytes.slice(start,start+csize);
      let value;
      if(method===0) value=raw;
      else if(method===8) value=await importInflateRaw(raw);
      else { p=start+csize; continue; }
      if(usize && value.length!==usize) console.warn('ZIP size mismatch',name);
      out.set(name,value); p=start+csize;
    }
    return out;
  }
  function importXml(bytes){ return new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml'); }
  function importXmlText(node){
    return String(node?.textContent||'').replace(/\s+/g,' ').trim();
  }
  function importEscPdfText(s){
    return String(s||'').replace(/\\([\\()])/g,'$1').replace(/\\n/g,'\n').replace(/\\r/g,'\r').replace(/\\t/g,'\t').replace(/\\([0-7]{1,3})/g,(_,o)=>String.fromCharCode(parseInt(o,8)));
  }
  async function importDocxText(file){
    const z=await importZipEntries(await importReadFileBytes(file));
    const xml=z.get('word/document.xml'); if(!xml) throw new Error('DOCX document.xml not found');
    const doc=importXml(xml);
    return Array.from(doc.getElementsByTagName('w:p')).map(p=>importXmlText(p)).filter(Boolean).join('\n');
  }
  async function importXlsxRows(file){
    const z=await importZipEntries(await importReadFileBytes(file));
    const shared=[];
    const ss=z.get('xl/sharedStrings.xml');
    if(ss){
      const doc=importXml(ss);
      Array.from(doc.getElementsByTagName('si')).forEach(si=>shared.push(
        Array.from(si.getElementsByTagName('t')).map(t=>t.textContent||'').join('')
      ));
    }
    const workbook=z.get('xl/workbook.xml');
    if(!workbook) throw new Error('XLSX workbook.xml not found');
    const wb=importXml(workbook), relsBytes=z.get('xl/_rels/workbook.xml.rels');
    const relMap={};
    if(relsBytes){
      const rd=importXml(relsBytes);
      Array.from(rd.getElementsByTagName('Relationship')).forEach(r=>relMap[r.getAttribute('Id')]=r.getAttribute('Target'));
    }
    const sheets=Array.from(wb.getElementsByTagName('sheet'));
    const result=[];
    for(const sh of sheets){
      const rid=sh.getAttribute('r:id')||sh.getAttribute('id');
      let target=relMap[rid]||'';
      target=target.replace(/^\/+/, '');
      // OOXML relationship targets may be ../worksheets/sheet1.xml.
      let path='';
      if(target){
        const parts=('xl/'+target).split('/'); const clean=[];
        for(const part of parts){ if(!part||part==='.') continue; if(part==='..') clean.pop(); else clean.push(part); }
        path=clean.join('/');
      }else path='xl/worksheets/sheet'+(result.length+1)+'.xml';
      const bytes=z.get(path);
      if(!bytes){ console.warn('Worksheet not found:', path, target); continue; }
      const doc=importXml(bytes), rows=[];
      Array.from(doc.getElementsByTagName('row')).forEach(row=>{
        const vals=[];
        Array.from(row.getElementsByTagName('c')).forEach(c=>{
          const ref=c.getAttribute('r')||'';
          const m=ref.match(/[A-Z]+/); let col=0;
          if(m){for(const ch of m[0]) col=col*26+ch.charCodeAt(0)-64; col--;}
          const t=c.getAttribute('t'), v=c.getElementsByTagName('v')[0]?.textContent||'';
          let value=v;
          if(t==='s') value=shared[Number(v)]??v;
          else if(t==='inlineStr') value=Array.from(c.getElementsByTagName('t')).map(x=>x.textContent||'').join('');
          while(vals.length<col) vals.push('');
          vals[col]=value;
        });
        while(vals.length && vals[vals.length-1]==='') vals.pop();
        if(vals.length) rows.push(vals);
      });
      if(rows.length) result.push({name:sh.getAttribute('name')||`Sheet ${result.length+1}`,rows});
    }
    return result;
  }
  async function importPdfText(file){
    const bytes=await importReadFileBytes(file);
    const latin=new TextDecoder('latin1').decode(bytes);
    const chunks=[]; let foundStream=false, cursor=0;
    const streamRe=/stream\r?\n/g; let m;
    while((m=streamRe.exec(latin))){
      foundStream=true; const start=m.index+m[0].length, end=latin.indexOf('endstream',start); if(end<0) break;
      let raw=bytes.slice(start,end);
      const header=latin.slice(Math.max(0,m.index-500),m.index);
      if(/\/FlateDecode/.test(header)){
        try{ raw=await importInflateRaw(raw); }catch(_){ raw=null; }
      }
      if(raw){
        const txt=new TextDecoder('latin1').decode(raw);
        for(const x of txt.matchAll(/\((?:\\.|[^\\()])*\)\s*Tj/g)) chunks.push(importEscPdfText(x[0].replace(/\)\s*Tj$/,'').slice(1)));
        for(const x of txt.matchAll(/\[(.*?)\]\s*TJ/gs)){
          const parts=x[1].match(/\((?:\\.|[^\\()])*\)/g)||[];
          if(parts.length) chunks.push(parts.map(v=>importEscPdfText(v.slice(1,-1))).join(''));
        }
      }
      cursor=end+9;
    }
    if(!chunks.length){
      const fallback=latin.match(/\((?:\\.|[^\\()]){2,}\)/g)||[];
      chunks.push(...fallback.slice(0,500).map(v=>importEscPdfText(v.slice(1,-1))));
    }
    return chunks.join('\n').replace(/\n{3,}/g,'\n\n').trim();
  }
  function importAddNote(title,body,category='Imported Data'){
    const text=String(body||'').trim(); if(!text) return false;
    const note={id:uid(),title:title||'Imported document',body:text,html:'',points:'',category,tags:'imported',color:'#eef5ff',date:today(),images:[]};
    data.notes.unshift(note); return true;
  }
  function importNumber(v){const n=Number(String(v??'').replace(/[,₹$€£\s]/g,''));return Number.isFinite(n)?Math.abs(n):0;}
  function importExcelToLifeOS(sheets,mode='auto'){
    let imported=0,structuredTasks=0,structuredExpenses=0,structuredIncome=0;
    let dirtyTasks=false,dirtyExpenses=false,dirtyIncome=false,dirtyNotes=false;
    for(const sheet of sheets){
      const rows=sheet.rows||[];if(!rows.length)continue;
      const headers=rows[0].map(x=>String(x??'').trim());
      const norm=headers.map(x=>x.toLowerCase().replace(/[^a-z0-9]+/g,''));
      const idx=names=>norm.findIndex(h=>names.includes(h));
      const titleI=idx(['title','task','taskname','name','subject','description','particular','details','narration']);
      const amountI=idx(['amount','expense','cost','value','price','debit','credit','money','total']);
      const expenseI=idx(['expense','expenses','cost','debit','spent','spending']);
      const incomeI=idx(['income','incomes','revenue','earning','earnings','credit','received','receipts','salary']);
      const dateI=idx(['date','day','targetdate','duedate','transactiondate','entrydate']);
      const statusI=idx(['status','state']);
      const catI=idx(['category','cat','type','source','account','vendor','payee']);
      const typeI=idx(['type','transactiontype','recordtype','flow','nature']);
      const addExpense=(r,c)=>{const amount=importNumber(r[c]);if(amount<=0)return;data.expenses.unshift({id:uid(),source:catI>=0?String(r[catI]??'Imported'):'Imported',amount,date:dateI>=0?String(r[dateI]??''):today(),note:titleI>=0?String(r[titleI]??''):''});structuredExpenses++;dirtyExpenses=true;};
      const addIncome=(r,c)=>{const amount=importNumber(r[c]);if(amount<=0)return;data.income.unshift({id:uid(),source:catI>=0?String(r[catI]??'Imported'):'Imported',amount,date:dateI>=0?String(r[dateI]??''):today(),note:titleI>=0?String(r[titleI]??''):''});structuredIncome++;dirtyIncome=true;};
      if(mode==='tasks'||(mode==='auto'&&titleI>=0&&statusI>=0)){for(const r of rows.slice(1)){const title=String(r[titleI]??'').trim();if(!title)continue;data.tasks.unshift({id:uid(),title,category:catI>=0?String(r[catI]??''):'',date:dateI>=0?String(r[dateI]??''):today(),time:'',priority:'Medium',tags:'imported',done:/done|complete|completed|finished|yes|true|1/i.test(String(r[statusI]||''))});structuredTasks++;dirtyTasks=true;}continue;}
      if(mode==='expenses'){for(const r of rows.slice(1))addExpense(r,expenseI>=0?expenseI:amountI);continue;}
      if(mode==='income'){for(const r of rows.slice(1))addIncome(r,incomeI>=0?incomeI:amountI);continue;}
      if(mode==='notes'){const body=rows.map(r=>r.map(v=>String(v??'')).join(' | ')).join('\n');if(importAddNote(`Imported Excel — ${sheet.name}`,body,'Imported Excel')){imported++;dirtyNotes=true;}continue;}
      if(mode==='auto'&&(expenseI>=0||incomeI>=0)){for(const r of rows.slice(1)){if(expenseI>=0)addExpense(r,expenseI);if(incomeI>=0)addIncome(r,incomeI);if(expenseI<0&&incomeI<0&&typeI>=0&&/expense|debit|spent|cost/i.test(String(r[typeI]||'')))addExpense(r,amountI);if(expenseI<0&&incomeI<0&&typeI>=0&&/income|credit|received|revenue|earning/i.test(String(r[typeI]||'')))addIncome(r,amountI);}continue;}
      if(mode==='auto'&&amountI>=0){for(const r of rows.slice(1)){const typ=typeI>=0?String(r[typeI]||'').toLowerCase():'';if(/income|credit|received|revenue|earning|salary/.test(typ))addIncome(r,amountI);else addExpense(r,amountI);}continue;}
      const body=rows.map(r=>r.map(v=>String(v??'')).join(' | ')).join('\n');if(importAddNote(`Imported Excel — ${sheet.name}`,body,'Imported Excel')){imported++;dirtyNotes=true;}
    }
    if(dirtyTasks)__dirtySections.add('tasks');if(dirtyExpenses)__dirtySections.add('expenses');if(dirtyIncome)__dirtySections.add('income');if(dirtyNotes)__dirtySections.add('notes');
    return {imported,structuredTasks,structuredExpenses,structuredIncome};
  }
  window.importLifeOSDocuments=async function(input){
    const files=[...(input?.files||[])]; if(!files.length) return;
      const mode=(document.getElementById('lifeosImportMode')?.value||'auto').toLowerCase();
    try{
      let notes=0, tasks=0, expenses=0, income=0, filesDone=0;
      for(const file of files){
        const name=file.name||'Imported file', ext=(name.split('.').pop()||'').toLowerCase();
        if(ext==='xlsx'){
          const sheets=await importXlsxRows(file); const r=importExcelToLifeOS(sheets,mode);
          notes+=r.imported; tasks+=r.structuredTasks; expenses+=r.structuredExpenses; if(r.structuredIncome) income+=r.structuredIncome;
        }else if(ext==='xls'){
          throw new Error('Legacy .xls (BIFF) is not supported by the browser importer yet. Save the workbook as .xlsx, then import it with the selected destination.');
        }else if(ext==='docx'){
          const text=await importDocxText(file); if(importAddNote(name.replace(/\.docx$/i,''),text,'Imported Word')) notes++;
        }else if(ext==='pdf'){
          const text=await importPdfText(file); if(importAddNote(name.replace(/\.pdf$/i,''),text,'Imported PDF')) notes++;
        }else if(ext==='doc'){
          throw new Error('.doc legacy format is not supported directly; save it as .docx first.');
        }else throw new Error(`Unsupported file: ${name}`);
        filesDone++;
      }
      save();
      render(); renderSettings();
      save(); render(); toast(`✓ ${filesDone} file imported · ${notes} notes · ${tasks} tasks · ${expenses} expenses · ${income} income`);
    }catch(e){ console.error('Universal import failed',e); toast('Import failed: '+(e?.message||'Unsupported/invalid file')); }
    finally{if(input)input.value='';}
  };

  window.importLifeOSBackup=function(input){
    const file=input?.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=async()=>{
      try{
        const payload=JSON.parse(String(reader.result||''));
        if(!payload||payload.lifeOSBackup!=='LifeOS'||!payload.data||typeof payload.data!=='object')throw new Error('Invalid backup');
        if(!confirm('Import this LifeOS backup? Current LifeOS data will be replaced by the backup.')){input.value='';return;}
        data=makeReactiveData(payload.data);
        data.__drafts=(data.__drafts&&typeof data.__drafts==='object')?data.__drafts:{};
        data.settings=(data.settings&&typeof data.settings==='object')?data.settings:{mode:'light'};
        data.categories=(data.categories&&typeof data.categories==='object')?data.categories:{};
        __dirtySections.clear();
        for(const k of ['tasks','notes','journal','expenses','income','habits','routines','goals','focusSessions','personal','professional','spiritual','economical','mental','social','moral'])__dirtySections.add(k);
        if(window.omDb?.saveSnapshot) await window.omDb.saveSnapshot(data,{sections:['tasks','notes','journal','expenses','income','habits','routines','goals','focusSessions','personal','professional','spiritual','economical','mental','social','moral']});
        await persistDeviceNow();
        input.value='';render();renderSettings();toast('✓ LifeOS backup imported');
      }catch(e){input.value='';toast('Invalid LifeOS backup file')}
    };
    reader.readAsText(file);
  };
  window.toggleBackupExportMenu=function(ev){
    if(ev)ev.stopPropagation();
    const m=document.getElementById('backupExportMenu');
    if(!m)return;
    const willOpen=!m.classList.contains('open');
    if(willOpen)prepareBackupExportLinks();
    m.classList.toggle('open',willOpen);
  };
  document.addEventListener('click',e=>{
    const m=document.getElementById('backupExportMenu');
    if(m&&!e.target.closest('.backup-export-menu-wrap'))m.classList.remove('open');
  });
  window.renderDeviceStorage=function(){const el=document.getElementById('device-storage');if(!el)return;const mobile=isMobileRuntime();el.innerHTML=`<div class="hero"><h2>💾 Device Storage</h2><p class="muted">${mobile?'LifeOS keeps app data in its private app storage. Backups can be saved to Downloads or shared to another device.':'LifeOS uses native SQLite plus browser storage fallback.'}</p></div><div class="grid"><div class="card"><h3>App storage</h3><p class="muted">IndexedDB + SQLite: Active</p></div><div class="card"><h3>Downloads</h3><p class="muted">${mobile?'JSON backups can be saved to the Android Downloads folder.':'Computer exports use the connected folder.'}</p></div><div class="card"><h3>Permissions</h3><p class="muted">${mobile?'Only the Downloads file access needed for backup is used; no broad file browsing is required.':'Desktop folder access is requested only when you connect a folder.'}</p></div></div><div class="card"><h3>Backup</h3><p class="muted">Export JSON Backup for a complete portable backup. Import accepts the same JSON backup file.</p><div class="row"><button class="primary" type="button" onclick="window.exportLifeOSBackup()">⬇️ Export JSON Backup</button></div></div>`};
  window.connectComputer=connectComputer;
  window.disconnectComputer=clearComputerConnection;

