  /* LifeOS Backup & Export + direct computer folder bridge */
  const COMPUTER_DB='lifeos-computer-connector-v1';
  const COMPUTER_STORE='connection';
  let computerDBPromise=null;
  let computerDirectoryHandle=null;

  function openComputerDB(){
    if(computerDBPromise)return computerDBPromise;
    computerDBPromise=new Promise((resolve,reject)=>{
      if(!('indexedDB' in window)){reject(new Error('IndexedDB unavailable'));return}
      const req=indexedDB.open(COMPUTER_DB,1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(COMPUTER_STORE))req.result.createObjectStore(COMPUTER_STORE)};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||new Error('Computer connector storage unavailable'));
    });
    return computerDBPromise;
  }
  async function loadComputerConnection(){
    try{
      const db=await openComputerDB();
      computerDirectoryHandle=await new Promise((resolve,reject)=>{
        const tx=db.transaction(COMPUTER_STORE,'readonly'),req=tx.objectStore(COMPUTER_STORE).get('directory');
        req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);
      });
      return computerDirectoryHandle;
    }catch(e){return null}
  }
  async function saveComputerConnection(handle){
    try{
      const db=await openComputerDB();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(COMPUTER_STORE,'readwrite');
        tx.objectStore(COMPUTER_STORE).put(handle,'directory');
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error||new Error('Connection save failed'));
      });
    }catch(e){console.warn('Computer connection persistence failed',e)}
  }
  async function clearComputerConnection(){
    computerDirectoryHandle=null;
    try{
      const db=await openComputerDB();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(COMPUTER_STORE,'readwrite');tx.objectStore(COMPUTER_STORE).delete('directory');
        tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);
      });
    }catch(e){}
    renderSettings();
  }
  async function ensureComputerPermission(handle){
    if(!handle)return false;
    try{
      let p=await handle.queryPermission?.({mode:'readwrite'});
      if(p==='granted')return true;
      if(handle.requestPermission){p=await handle.requestPermission({mode:'readwrite'});return p==='granted'}
      return false;
    }catch(e){return false}
  }
  function computerConnected(){return !!computerDirectoryHandle}
  function computerStatusHtml(){
    return computerConnected()
      ? `<span class="backup-connected">● Connected: ${esc(computerDirectoryHandle.name||'Computer folder')}</span>`
      : `<span class="backup-connected backup-disconnected">● Not connected</span>`;
  }
  async function connectComputer(){
    try{
      if(!window.showDirectoryPicker){
        toast('Chrome/Edge desktop में folder connection के लिए यह सुविधा चाहिए');
        return false;
      }
      const handle=await window.showDirectoryPicker({mode:'readwrite'});
      if(!(await ensureComputerPermission(handle)))throw new Error('Folder permission denied');
      computerDirectoryHandle=handle;
      await ensureExportSubfolders(handle);
      await saveComputerConnection(handle);
      renderSettings();
      toast(`✓ Computer connected: ${handle.name}`);
      return true;
    }catch(e){
      if(e?.name!=='AbortError')toast('Computer connection failed');
      return false;
    }
  }
  async function tryWindowsConnectorSave(filename,content){
    try{
      const base='http://127.0.0.1:8765';
      let status=await fetch(base+'/status',{cache:'no-store'}).then(r=>r.ok?r.json():null);
      if(!status?.ok)return null;
      if(!status.connected){
        const chosen=await fetch(base+'/choose',{method:'POST'}).then(r=>r.ok?r.json():null);
        if(!chosen?.ok)return false;
        status=chosen;
      }
      let contentBase64='';
      if(content instanceof Blob){
        const bytes=new Uint8Array(await content.arrayBuffer());
        let binary='';
        const chunk=0x8000;
        for(let i=0;i<bytes.length;i+=chunk)binary+=String.fromCharCode(...bytes.subarray(i,i+chunk));
        contentBase64=btoa(binary);
      }else{
        contentBase64=btoa(unescape(encodeURIComponent(String(content??''))));
      }
      const body={filename,contentBase64};
      const result=await fetch(base+'/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(r=>r.ok?r.json():null);
      if(result?.ok){toast(`✓ Saved to Windows folder: ${filename}`);return true;}
      return false;
    }catch(e){return null}
  }
  async function backupPayload(){
    await hydrateAttachmentsFromIDB(data);
    return {lifeOSBackup:'LifeOS',version:3,exportedAt:new Date().toISOString(),data:data};
  }
  async function backupJson(){return JSON.stringify(await backupPayload(),null,2)}
  function htmlEscapeAttr(s){return esc(String(s??''))}
  function valueToHtml(value,depth=0){
    if(depth>6)return '<em>…</em>';
    if(value===null||value===undefined)return '<span class="muted">null</span>';
    if(typeof value==='object'){
      if(Array.isArray(value))return value.length?`<ol>${value.map(v=>`<li>${valueToHtml(v,depth+1)}</li>`).join('')}</ol>`:'<span class="muted">[]</span>';
      return Object.entries(value).map(([k,v])=>`<div style="margin:4px 0;padding:5px 7px;border-left:2px solid #e0e3e9"><b>${esc(k)}</b>: ${valueToHtml(v,depth+1)}</div>`).join('')||'<span class="muted">{}</span>';
    }
    return esc(String(value));
  }
  async function ensureComputerFolderForExport(){
    /* If this page already has the handle, reuse it. Otherwise open the picker
       immediately from the user's click so the browser's user-activation is intact. */
    if(computerDirectoryHandle){
      if(await ensureComputerPermission(computerDirectoryHandle)){await ensureExportSubfolders(computerDirectoryHandle);return computerDirectoryHandle;}
      computerDirectoryHandle=null;
    }
    const ok=await connectComputer();
    if(ok)return computerDirectoryHandle;
    /* If the picker was not needed because a stored handle was available, try it once. */
    const stored=await loadComputerConnection();
    if(stored && await ensureComputerPermission(stored)){computerDirectoryHandle=stored;await ensureExportSubfolders(stored);return stored;}
    return null;
  }
  async function ensureExportSubfolders(handle){
    if(!handle)return false;
    for(const name of ['Word','Excel','PDF','Backup']) await handle.getDirectoryHandle(name,{create:true});
    return true;
  }
  async function saveComputerForExport(filename,content,mime,subfolder=''){
    const handle=await ensureComputerFolderForExport();
    if(!handle)return false;
    try{
      /* The user selects ONE root folder once. LifeOS creates/reuses a dedicated
         subfolder for each export format, so files stay organised and print-ready. */
      const target=String(subfolder||'').trim();
      const dir=target ? await handle.getDirectoryHandle(target,{create:true}) : handle;
      const fileHandle=await dir.getFileHandle(filename,{create:true});
      const writable=await fileHandle.createWritable();
      await writable.write(content instanceof Blob ? content : new Blob([content],{type:mime||'application/octet-stream'}));
      await writable.close();
      toast(`✓ Saved to ${handle.name}/${target||''}: ${filename}`);
      return true;
    }catch(e){
      console.error('Computer folder save failed',e);
      toast('Save failed: '+(e?.message||'Folder permission/error'));
      return false;
    }
  }
  window.exportLifeOSBackup=async function(){
    try{
      const name='LifeOS_Backup_'+today()+'.json',json=await backupJson();
      const ok=await saveComputerForExport(name,json,'application/json','Backup');
      if(!ok)return;
      toast('✓ JSON backup saved to selected folder');
    }catch(e){console.error(e);toast('Backup export failed: '+(e?.message||'Unknown error'))}
  };
  /* Robust Office export: generate real OOXML .docx/.xlsx files in-browser. */
  function officeXmlEsc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')}
  function u16(n){return new Uint8Array([n&255,(n>>>8)&255])}
  function u32(n){return new Uint8Array([n&255,(n>>>8)&255,(n>>>16)&255,(n>>>24)&255])}
  const CRC32_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0}return t})();
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
    if(id==='device-storage')return [{Storage:'Browser Local Storage',Status:'Active'},{Storage:'IndexedDB Device Storage',Status:'Available in supported browsers'},{Storage:'Computer Folder',Status:computerDirectoryHandle?'Connected':'Not connected'}];
    return [];
  }
  function exportSections(){
    const ids=['dashboard','mentor','planner','tasks','routine','habits','goals','focus','notes','journal','expenses','personal','professional','spiritual','economical','mental','social','moral','settings'];
    return ids.map(id=>({id,title:(navItems.find(x=>x[0]===id)?.[1]||id).replace(/^\S+\s/,''),rows:exportSectionRecords(id)}));
  }
  /* Export only the data that changed since the previous export of the same format.
     This keeps Word/Excel/PDF compact while the Dashboard/Summary always stays current. */
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
  function localDateISO(d=new Date()){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
  function getExportPeriod(){try{return JSON.parse(localStorage.getItem(EXPORT_PERIOD_KEY)||'null')||{mode:'all',from:'',to:''}}catch(e){return {mode:'all',from:'',to:''}}}
  function setExportPeriod(mode,from='',to=''){const p={mode,from,to};localStorage.setItem(EXPORT_PERIOD_KEY,JSON.stringify(p));const c=document.getElementById('exportCustomDates');if(c)c.style.display=mode==='custom'?'flex':'none';}
  function exportPeriodLabel(){const p=getExportPeriod();if(p.mode==='week')return 'This Week';if(p.mode==='month')return 'This Month';if(p.mode==='year')return 'This Year';if(p.mode==='custom'&&p.from&&p.to)return p.from+' → '+p.to;return 'All Data'}
  function exportPeriodBounds(){const p=getExportPeriod(),now=new Date();let from='',to='';if(p.mode==='week'){const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()),day=d.getDay(),diff=day===0?-6:1-day;d.setDate(d.getDate()+diff);from=localDateISO(d);const end=new Date(d.getFullYear(),d.getMonth(),d.getDate()+6);to=localDateISO(end)}else if(p.mode==='month'){from=localDateISO(new Date(now.getFullYear(),now.getMonth(),1));to=localDateISO(new Date(now.getFullYear(),now.getMonth()+1,0))}else if(p.mode==='year'){from=now.getFullYear()+'-01-01';to=now.getFullYear()+'-12-31'}else if(p.mode==='custom'){from=p.from;to=p.to}return {from,to}}
  function dateStringsFromValue(v){const out=[];if(v===null||v===undefined||v==='')return out;if(typeof v==='number'&&v>100000000000){const d=new Date(v);if(!Number.isNaN(d.getTime()))out.push(localDateISO(d));return out}const s=String(v);let m=s.match(/\d{4}[-/]\d{1,2}[-/]\d{1,2}/);if(m){const parts=m[0].split(/[-\/]/);out.push(parts[0]+'-'+String(parts[1]).padStart(2,'0')+'-'+String(parts[2]).padStart(2,'0'))}m=s.match(/\b(\d{1,2})[\/.](\d{1,2})[\/.](\d{4})\b/);if(m)out.push(m[3]+'-'+String(m[2]).padStart(2,'0')+'-'+String(m[1]).padStart(2,'0'));return out}
  function rowDateValues(row){const out=[...(row?.__exportDates||[])];Object.entries(row||{}).forEach(([k,v])=>{if(!/(date|time|created|updated|due|start|end|day|timestamp)/i.test(k))return;(Array.isArray(v)?v:[v]).forEach(x=>out.push(...dateStringsFromValue(x)))});return [...new Set(out.filter(Boolean))]}
  function filterRowsByExportPeriod(sec){const p=getExportPeriod();if(p.mode==='all')return sec.rows;const b=exportPeriodBounds();if(!b.from||!b.to)return [];if(sec.id==='settings'||sec.id==='device-storage')return [];return sec.rows.filter(row=>{const dates=rowDateValues(row);return dates.length>0&&dates.some(d=>d>=b.from&&d<=b.to)})}
  function filteredExportSections(){const sections=exportSections().map(sec=>({...sec,rows:filterRowsByExportPeriod(sec)}));if(getExportPeriod().mode!=='all')sections[0].rows=exportPeriodSummary(sections.slice(1));return sections}
  function exportPeriodSummary(sections){const find=id=>sections.find(s=>s.id===id)?.rows||[];const tasks=find('tasks'),notes=find('notes'),journal=find('journal'),habits=find('habits'),goals=find('goals'),routines=find('routine'),planner=find('planner'),focus=find('focus'),expenses=find('expenses');const expenseRows=expenses.filter(x=>String(x.recordType||'').toLowerCase()!=='income'),incomeRows=expenses.filter(x=>String(x.recordType||'').toLowerCase()==='income');const sum=rows=>rows.reduce((a,x)=>a+Number(x.amount||0),0);return [{Metric:'Tasks',Value:tasks.length,Completed:tasks.filter(x=>String(x.done).toLowerCase()==='true').length},{Metric:'Notes',Value:notes.length},{Metric:'Journal Entries',Value:journal.length},{Metric:'Habits',Value:habits.length},{Metric:'Goals',Value:goals.length},{Metric:'Routines',Value:routines.length},{Metric:'Daily Plans',Value:planner.length},{Metric:'Focus Sessions',Value:focus.length},{Metric:'Expenses Total',Value:sum(expenseRows)},{Metric:'Income Total',Value:sum(incomeRows)},{Metric:'Balance (Income - Expense)',Value:sum(incomeRows)-sum(expenseRows)},...Object.keys(LIFEOS_CATEGORIES||{}).map(id=>({Metric:LIFEOS_CATEGORIES[id][0].replace(/^\S+\s/,''),Value:find(id).length}))]}
  function exportStateKey(format){return KEY+'_export_state_'+format+'_'+exportPeriodLabel().replace(/[^a-z0-9]+/gi,'_')}
  function readExportState(format){try{return JSON.parse(localStorage.getItem(exportStateKey(format))||'null')}catch(e){return null}}
  function writeExportState(format,sections){try{const state={version:3,exportedAt:Date.now(),period:exportPeriodLabel(),sections:{}};sections.forEach(sec=>{state.sections[sec.id]=sec.rows.map(r=>exportRowKey(sec,r))});localStorage.setItem(exportStateKey(format),JSON.stringify(state));return true}catch(e){console.warn('Export state save failed',e);return false}}
  function exportChangedSections(format){const all=filteredExportSections();
    /* A selected period is a report request: always export the complete selected range.
       Incremental changed-only logic applies only to All Data, so Week/Month/Year/Custom
       reports never lose older entries merely because that format was exported before. */
    if(getExportPeriod().mode!=='all')return all;
    const previous=readExportState(format);if(!previous||!previous.sections)return all;const changed=[];all.forEach(sec=>{const old=new Set(previous.sections[sec.id]||[]);changed.push({...sec,rows:sec.rows.filter(r=>!old.has(exportRowKey(sec,r)))});});return changed}
  function currentExportStateSections(){return filteredExportSections()}
  function commitExportState(format,sections){writeExportState(format,sections)}
  function lifeosTextRows(sections=exportChangedSections('pdf')){
    const rows=[];
    sections.forEach(sec=>sec.rows.forEach(r=>rows.push([sec.title,...Object.values(r).map(exportSafeValue)])));
    if(!rows.length)rows.push(['LifeOS','No new or updated data since the last export','']);
    return rows;
  }
  function makeDocxBlob(sections=exportChangedSections('word')){
    const p=(text,style='Normal')=>`<w:p><w:pPr>${style!=='Normal'?`<w:pStyle w:val="${style}"/>`:''}</w:pPr><w:r><w:t xml:space="preserve">${officeXmlEsc(text)}</w:t></w:r></w:p>`;
    const heading=(text,level)=>`<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${level===1?28:23}"/></w:rPr><w:t>${officeXmlEsc(text)}</w:t></w:r></w:p>`;
    const cell=(text,bold=false)=>`<w:tc><w:tcPr><w:tcW w:w="4680" w:type="dxa"/><w:tcBorders><w:top w:val="single" w:sz="4" w:color="D9DEE7"/><w:left w:val="single" w:sz="4" w:color="D9DEE7"/><w:bottom w:val="single" w:sz="4" w:color="D9DEE7"/><w:right w:val="single" w:sz="4" w:color="D9DEE7"/></w:tcBorders></w:tcPr><w:p><w:r>${bold?'<w:rPr><w:b/></w:rPr>':''}<w:t xml:space="preserve">${officeXmlEsc(text)}</w:t></w:r></w:p></w:tc>`;
    const itemTable=(obj)=>{
      const entries=Object.entries(obj||{}).filter(([,v])=>String(v||'')!=='');
      if(!entries.length)return p('No data recorded.');
      const trs=entries.map(([k,v])=>`<w:tr>${cell(k,true)}${cell(exportSafeValue(v))}</w:tr>`).join('');
      return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="5" w:color="BFC6D1"/><w:left w:val="single" w:sz="5" w:color="BFC6D1"/><w:bottom w:val="single" w:sz="5" w:color="BFC6D1"/><w:right w:val="single" w:sz="5" w:color="BFC6D1"/><w:insideH w:val="single" w:sz="4" w:color="D9DEE7"/></w:tblBorders></w:tblPr>${trs}</w:tbl>`;
    };
    const periodBounds=exportPeriodBounds();
    const periodText=periodBounds.from&&periodBounds.to ? `Date Range: ${periodBounds.from} → ${periodBounds.to}` : `Date Range: ${exportPeriodLabel()}`;
    let body=heading('LifeOS — Summary',1)+p(periodText)+p('Exported: '+new Date().toLocaleString());
    const summary=sections[0].rows; summary.forEach(r=>body+=itemTable(r));
    sections.slice(1).forEach(sec=>{
      body+=heading(sec.title,1);
      if(!sec.rows.length){body+=p('No data recorded in this section.');return;}
      sec.rows.forEach((r,i)=>{if(sec.rows.length>1)body+=heading((r.title||r.name||r.Metric||`Entry ${i+1}`),2);body+=itemTable(r);});
    });
    const files=[
      {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`},
      {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`},
      {name:'word/_rels/document.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`},
      {name:'word/document.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720"/></w:sectPr></w:body></w:document>`},
      {name:'word/styles.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="21"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:rPr><w:b/><w:sz w:val="23"/></w:rPr></w:style></w:styles>`},
      {name:'docProps/core.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">LifeOS — Summary and Sections</dc:title><dc:creator xmlns:dc="http://purl.org/dc/elements/1.1/">LifeOS</dc:creator></cp:coreProperties>`}
    ];
    return zipStore(files);
  }
  function makeXlsxBlob(sections=exportChangedSections('excel')){
    const used=new Set();
    const sheetName=(title)=>{let n=String(title||'Sheet').replace(/[\\\/?*\[\]:]/g,' ').trim().slice(0,31)||'Sheet';let b=n,i=2;while(used.has(n)){n=(b.slice(0,28)+' '+i++).slice(0,31)}used.add(n);return n};
    const escCell=v=>officeXmlEsc(exportSafeValue(v));
    const colRef=ci=>{let n=ci+1,s='';while(n){const r=(n-1)%26;s=String.fromCharCode(65+r)+s;n=Math.floor((n-1)/26)}return s};
    const sheetXml=(sec)=>{
      const rows=sec.rows.length?sec.rows:[];
      const headers=[...new Set(rows.flatMap(r=>Object.keys(r||{})))];
      const finalHeaders=headers.length?headers:['Status'];
      const dataRows=rows.length?rows:[{Status:'No data recorded in this section.'}];
      const cells=[`<row r="1">${finalHeaders.map((h,ci)=>`<c r="${colRef(ci)}1" s="1" t="inlineStr"><is><t>${escCell(h)}</t></is></c>`).join('')}</row>`];
      dataRows.forEach((r,ri)=>{const rr=ri+2;cells.push(`<row r="${rr}">${finalHeaders.map((h,ci)=>{const col=colRef(ci);return `<c r="${col}${rr}" s="2" t="inlineStr"><is><t>${escCell(r?.[h])}</t></is></c>`}).join('')}</row>`)});
      const lastCol=colRef(finalHeaders.length-1);
      return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"/></sheetViews><sheetFormatPr defaultRowHeight="20"/><cols>${finalHeaders.map((_,i)=>`<col min="${i+1}" max="${i+1}" width="24" customWidth="1"/>`).join('')}</cols><sheetData>${cells.join('')}</sheetData><autoFilter ref="A1:${lastCol}${dataRows.length+1}"/><pageMargins left="0.3" right="0.3" top="0.5" bottom="0.5" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/><pageSetUpPr fitToPage="1"/></worksheet>`;
    };
    const periodBounds=exportPeriodBounds();
    const periodText=periodBounds.from&&periodBounds.to ? `Date Range: ${periodBounds.from} → ${periodBounds.to}` : `Date Range: ${exportPeriodLabel()}`;
    /* Put the selected export period visibly into the Summary sheet without changing the other section tabs. */
    if(sections.length){
      sections[0]={...sections[0],rows:[{Report:'LifeOS Export',DateRange:periodText,Exported:new Date().toLocaleString()},...sections[0].rows]};
    }
    const sheets=sections.map((sec,i)=>({name:sheetName(sec.title),xml:sheetXml(sec),id:i+1}));
    const workbookSheets=sheets.map(s=>`<sheet name="${officeXmlEsc(s.name)}" sheetId="${s.id}" r:id="rId${s.id}"/>`).join('');
    const rels=sheets.map(s=>`<Relationship Id="rId${s.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.id}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`;
    const contentOverrides=sheets.map(s=>`<Override PartName="/xl/worksheets/sheet${s.id}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('');
    const files=[
      {name:'[Content_Types].xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${contentOverrides}</Types>`},
      {name:'_rels/.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
      {name:'xl/_rels/workbook.xml.rels',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels}</Relationships>`},
      {name:'xl/workbook.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${workbookSheets}</sheets></workbook>`},
      {name:'xl/styles.xml',data:`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="E8ECF4"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs></styleSheet>`},
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
      if(ok){commitExportState('word',currentExportStateSections());toast('✓ Word में सिर्फ नया/updated data saved');}
    }catch(e){console.error(e);toast('Word export failed: '+(e?.message||'Unknown error'))}
  };
  window.exportLifeOSExcel=async function(){
    try{
      const name='LifeOS_Backup_'+today()+'.xlsx';
      const sections=exportChangedSections('excel');
      const blob=makeXlsxBlob(sections);
      const ok=await saveComputerForExport(name,blob,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Excel');
      if(ok){commitExportState('excel',currentExportStateSections());toast('✓ Excel में सिर्फ नया/updated data saved');}
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
      ctx.font='bold 30px '+font;ctx.fillText('LifeOS Backup',margin,margin+10);
      ctx.font='16px '+font;ctx.fillStyle='#667085';ctx.fillText('Date Range: '+(exportPeriodBounds().from&&exportPeriodBounds().to?exportPeriodBounds().from+' → '+exportPeriodBounds().to:exportPeriodLabel()),margin,margin+42);
      ctx.fillText('Exported: '+new Date().toLocaleString(),margin,margin+64);
      ctx.strokeStyle='#d9dee7';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(margin,margin+86);ctx.lineTo(W-margin,margin+86);ctx.stroke();
      let y=margin+headerH+5;
      page.forEach((item,i)=>{
        const isHeader=pageIndex===0&&i===0&&item.raw==='LifeOS Backup';
        ctx.font=(isHeader?'bold ':'')+'18px '+font;ctx.fillStyle='#1b2330';
        item.wrapped.forEach(line=>{ctx.fillText(line,margin,y);y+=lineH;}); y+=10;
      });
      ctx.strokeStyle='#d9dee7';ctx.beginPath();ctx.moveTo(margin,H-margin-footerH+10);ctx.lineTo(W-margin,H-margin-footerH+10);ctx.stroke();
      ctx.font='14px '+font;ctx.fillStyle='#667085';ctx.fillText('LifeOS • Standard A4',margin,H-margin-5);
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
      const blob=makePdfBlob(sections);
      const ok=await saveComputerForExport(name,blob,'application/pdf','PDF');
      if(ok){commitExportState('pdf',currentExportStateSections());toast('✓ PDF में सिर्फ नया/updated data saved');}
    }catch(e){console.error(e);toast('PDF export failed: '+(e?.message||'Unknown error'))}
  };
  window.importLifeOSBackup=function(input){
    const file=input?.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=async()=>{
      try{
        const payload=JSON.parse(String(reader.result||''));
        if(!payload||payload.lifeOSBackup!=='LifeOS'||!payload.data||typeof payload.data!=='object')throw new Error('Invalid backup');
        if(!confirm('Import this LifeOS backup? Current LifeOS data will be replaced by the backup.')){input.value='';return;}
        data=payload.data;
        data.__drafts=(data.__drafts&&typeof data.__drafts==='object')?data.__drafts:{};
        data.settings=(data.settings&&typeof data.settings==='object')?data.settings:{mode:'light'};
        data.categories=(data.categories&&typeof data.categories==='object')?data.categories:{};
        await persistDeviceNow();deviceStorageReady=true;
        await persistLocalNow();
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
  window.connectComputer=connectComputer;
  window.disconnectComputer=clearComputerConnection;
