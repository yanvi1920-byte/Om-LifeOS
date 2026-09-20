
  /* Settings + currency */
  window.setCustomCurrency=function(v){
    const raw=String(v??'').trim();data.settings.customCurrency={code:'CUSTOM',symbol:(raw||'¤').slice(0,8)};
    data.settings.currencyCode='CUSTOM';save();renderSettings();
  };
  window.setLifeOSCurrency=function(code){
    data.settings.currencyCode=code||'NPR';save();renderSettings();render();scheduleCurrencyText();
  };
  window.convertCurrencyAmount=function(){
    const amount=Number(document.getElementById('convAmount')?.value||0);
    const rate=Number(document.getElementById('convRate')?.value||0);
    const from=document.getElementById('convFrom')?.value||currencyCode();
    const to=document.getElementById('convTo')?.value||'USD';
    const result=document.getElementById('convResult');
    if(!result)return;
    if(!Number.isFinite(amount)||!Number.isFinite(rate)||rate<=0){result.textContent='Enter a valid amount and rate';return}
    const fromInfo=from==='CUSTOM'?(data.settings.customCurrency||{symbol:'¤'}):(CURRENCIES.find(x=>x[0]===from)||[from,from]);
    const toInfo=to==='CUSTOM'?(data.settings.customCurrency||{symbol:'¤'}):(CURRENCIES.find(x=>x[0]===to)||[to,to]);
    const value=amount*rate;
    result.textContent=`${fromInfo.symbol||from} ${amount.toLocaleString('en-IN')} = ${toInfo.symbol||to} ${value.toLocaleString('en-IN',{maximumFractionDigits:4})}`;
  };

  window.changeExportPeriod=function(mode){
    const current=getExportPeriod();setExportPeriod(mode,current.from,current.to);
    const from=document.getElementById('exportFromDate'),to=document.getElementById('exportToDate');
    if(from)from.value=current.from||'';if(to)to.value=current.to||'';
    const label=document.getElementById('exportPeriodLabel');if(label)label.textContent=exportPeriodLabel();
  };
  window.applyCustomExportPeriod=function(){
    const from=document.getElementById('exportFromDate')?.value||'',to=document.getElementById('exportToDate')?.value||'';
    if(!from||!to){toast('Please select both From and To dates');return}
    if(from>to){toast('From date cannot be after To date');return}
    setExportPeriod('custom',from,to);
    const label=document.getElementById('exportPeriodLabel');if(label)label.textContent=exportPeriodLabel();
    const sel=document.getElementById('exportPeriodSelect');if(sel)sel.value='custom';
    toast('✓ Export date range set: '+from+' → '+to);
  };
  function syncExportPeriodUi(){
    const p=getExportPeriod(),sel=document.getElementById('exportPeriodSelect'),from=document.getElementById('exportFromDate'),to=document.getElementById('exportToDate'),custom=document.getElementById('exportCustomDates'),label=document.getElementById('exportPeriodLabel');
    if(sel)sel.value=p.mode||'all';if(from)from.value=p.from||'';if(to)to.value=p.to||'';if(custom)custom.style.display=p.mode==='custom'?'flex':'none';if(label)label.textContent=exportPeriodLabel();
  }
  window.backupOmDatabase=async function(){
    const out=document.getElementById('omDbBackupStatus');
    if(out)out.textContent='Creating backup…';
    try{
      if(!window.omDb?.autoBackup)throw new Error('Database backup bridge unavailable');
      const path=await window.omDb.autoBackup();
      if(out)out.textContent='✓ Local backup saved';
      toast('✓ Database backup saved to Documents/Om-LifeOS/DatabaseBackups');
      return path;
    }catch(e){
      if(out)out.textContent='Backup failed';
      toast('Database backup failed: '+(e?.message||'Unknown error'));
      return null;
    }
  };

  window.checkOmDatabase=async function(){
    const out=document.getElementById('omDbStatus');
    if(!out)return;
    out.textContent='Checking…';
    try{
      if(!window.omDb)throw new Error('Database bridge unavailable');
      const result=await window.omDb.integrityCheck();
      const stats=window.__omDbStats;
      out.textContent=result==='ok'?`✓ Healthy${stats?.records!=null?` · ${Number(stats.records).toLocaleString()} records`:''}`:'⚠ '+result;
    }catch(e){out.textContent='Fallback storage active';}
  };

  window.renderSettings=function(){
    const el=document.getElementById('settings');if(!el)return;
    const code=currencyCode(),info=currencyInfo();
    el.innerHTML=`<div class="two settings-top-grid">
      <div class="settings-left-stack">
        <div class="card"><h2>🎨 Appearance</h2><p class="muted">Readable light mode is default. Theme switch remains available in the sidebar.</p><button class="secondary" type="button" onclick="window.toggleAppearance();return false">🌗 Toggle Light / Dark</button></div>
        <div class="card"><h2>⚡ Performance</h2><p class="muted">Native SQLite is the long-life record store for the Windows app: WAL mode, indexed date queries, background writes and bounded list/search APIs. IndexedDB is used for browser fallback/legacy attachment migration; native SQLite is the canonical long-life store and includes attachment payloads after migration. Large synchronous localStorage writes stay off the critical path.</p></div>
        <div class="card"><h2>🗄️ Long-life Database</h2><p class="muted">ॐ keeps records in native SQLite. Changed sections are written incrementally, so adding thousands of records does not require rewriting the whole history. The app also creates rolling local database backups automatically.</p><div class="row"><button class="secondary" type="button" onclick="window.checkOmDatabase()">Check database</button><button class="secondary" type="button" onclick="window.backupOmDatabase()">Backup now</button><span id="omDbStatus" class="meta">Checking…</span></div><div id="omDbBackupStatus" class="meta" style="margin-top:6px">Quiet auto-backup: checks about every 5 min and only snapshots after 90s idle when data changed · Documents/Om-LifeOS/DatabaseBackups</div></div>
      </div>
      <div class="card settings-backup-card"><div class="between"><div><h2>💾 Backup &amp; Export</h2><p class="muted">Document-friendly backups</p></div><div id="backupConnectionStatus">${computerStatusHtml()}</div></div><div class="export-period-box"><div class="backup-actions-title">Export Period</div><div class="export-period-controls"><select id="exportPeriodSelect" onchange="window.changeExportPeriod(this.value)"><option value="all">All Data</option><option value="week">This Week</option><option value="month">This Month</option><option value="year">This Year</option><option value="custom">Custom Date Range</option></select><div id="exportCustomDates" style="display:none;gap:8px;align-items:center;flex-wrap:wrap"><label>From <input id="exportFromDate" type="date"></label><label>To <input id="exportToDate" type="date"></label><button class="secondary" type="button" onclick="window.applyCustomExportPeriod()">Apply</button></div></div><div class="muted" style="margin-top:6px">Current export: <span id="exportPeriodLabel">All Data</span></div></div><div class="backup-actions-title">Backup Controls</div><div class="backup-actions-grid"><label class="secondary backup-import-label">⬆️ JSON Backup<input type="file" accept="application/json,.json" onchange="window.importLifeOSBackup(this)"></label><div class="backup-export-menu-wrap"><button class="secondary" type="button" onclick="window.toggleBackupExportMenu(event)">⬇️ Export ▾</button><div class="backup-export-menu" id="backupExportMenu"><button type="button" onclick="window.exportLifeOSWord();window.toggleBackupExportMenu()">▣ Word</button><button type="button" onclick="window.exportLifeOSExcel();window.toggleBackupExportMenu()">▤ Excel</button><button type="button" onclick="window.exportLifeOSPdf();window.toggleBackupExportMenu()">▧ PDF</button><button type="button" onclick="window.exportLifeOSBackup();window.toggleBackupExportMenu()">▣ JSON Backup</button></div></div><button class="secondary backup-connect" type="button" onclick="${computerConnected()?'window.disconnectComputer()':'window.connectComputer()'}">▣ ${computerConnected()?'Disconnect Computer':'Connect Computer'}</button></div><div class="card import-data-card"><div class="between"><div><h3>📥 Direct Data Import</h3><p class="muted">Excel data ka destination aap khud choose kar sakte ho: Auto, Expenses, Income, Tasks ya Notes.</p><div style="margin-top:8px"><label class="meta">Import Excel as <select id="lifeosImportMode" style="margin-left:6px;min-width:170px"><option value="auto">Auto detect</option><option value="expenses">Expenses</option><option value="income">Income</option><option value="tasks">Tasks</option><option value="notes">Notes</option></select></label></div></div><label class="primary import-data-label">📂 Import Files<input id="lifeosDocumentImport" type="file" multiple accept=".xlsx,.xls,.docx,.pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf" onchange="window.importLifeOSDocuments(this)"></label></div><div class="import-data-help">Excel Auto mode income/expense/type columns ko alag map karega. Explicit mode select karne par wahi destination use hoga. Word/PDF Notes mein jayenge. Existing data replace nahi hoga. True legacy <b>.xls</b> may need conversion to <b>.xlsx</b>.</div></div><div class="currency-note" style="margin-top:9px">Connect Computer में एक root Windows folder चुनें. Word, Excel, PDF और Backup अलग folders में save होंगे. All Data में सिर्फ नया/बदला हुआ data आएगा; Week/Month/Year/Custom में चुनी हुई पूरी date range का data export होगा.</div></div>
    </div>
    <div class="card settings-card"><h2>💱 Currency</h2><p class="muted">Changing currency changes display/accounting currency only. Existing amounts are not live-converted and no exchange-rate API is used.</p><div class="currency-grid"><label>Currency<select id="lifeosCurrencySelect" onchange="setLifeOSCurrency(this.value)">${CURRENCIES.filter(x=>x&&x[0]).map(x=>`<option value="${esc(x[0])}" ${x[0]===code?'selected':''}>${esc(x[0])} — ${esc(x[1]||x[0])}</option>`).join('')}<option value="CUSTOM" ${code==='CUSTOM'?'selected':''}>CUSTOM — ${esc(info[1]||'¤')}</option></select></label><label>Custom Currency Symbol / Code<input id="customCurrencyInput" value="${esc(data.settings.customCurrency?.symbol||'¤')}" placeholder="e.g. ₿ or XYZ" onchange="setCustomCurrency(this.value)"></label></div><div class="currency-note" style="margin-top:7px">Default: NPR — रू · Includes INR, USD, EUR, GBP, JPY, CNY, AUD, CAD, AED, SAR, RUB and the broader ISO-style list.</div></div>
    <div class="card settings-card"><h2>🔄 Currency Converter</h2><p class="muted">Manual-rate converter: enter the rate as <b>1 From = X To</b>. No live exchange-rate API is used.</p><div class="currency-converter-grid"><label>From<select id="convFrom" onchange="convertCurrencyAmount()">${CURRENCIES.filter(x=>x&&x[0]).map(x=>`<option value="${esc(x[0])}" ${x[0]===code?'selected':''}>${esc(x[0])} — ${esc(x[1]||x[0])}</option>`).join('')}<option value="CUSTOM">CUSTOM — ${esc(info[1]||'¤')}</option></select></label><label>To<select id="convTo" onchange="convertCurrencyAmount()">${CURRENCIES.filter(x=>x&&x[0]).map(x=>`<option value="${esc(x[0])}" ${x[0]==='USD'?'selected':''}>${esc(x[0])} — ${esc(x[1]||x[0])}</option>`).join('')}<option value="CUSTOM">CUSTOM — ${esc(info[1]||'¤')}</option></select></label><label>Amount<input id="convAmount" type="number" step="any" min="0" value="1" oninput="convertCurrencyAmount()"></label><label>Rate (1 From = X To)<input id="convRate" type="number" step="any" min="0" value="1" oninput="convertCurrencyAmount()"></label></div><div id="convResult" class="currency-result" style="margin-top:9px">—</div></div>
`;
    const panel=document.getElementById('settingsDeviceStorage');
    const btn=document.getElementById('deviceStorageToggle');
    const chev=document.getElementById('deviceStorageChevron');
    if(panel){panel.hidden=true;panel.innerHTML='';}
    if(btn)btn.setAttribute('aria-expanded','false');
    if(chev)chev.textContent='▾';
    convertCurrencyAmount();
    if(window.omDb)window.checkOmDatabase();
  }
    syncExportPeriodUi();;

  /* Render wrapper: keep new currency/date UI synchronized. */
  const baseShow=window.show;
  window.show=function(id){
    const r=baseShow.apply(this,arguments);
    syncBsFromAd();scheduleCurrencyText();
    return r;
  };
  const baseRender=window.render;
  window.render=function(){
    const r=baseRender.apply(this,arguments);
    scheduleCurrencyText();
    return r;
  };

  data.settings.currencyCode=data.settings.currencyCode||'NPR';
  if(!data.settings.customCurrency||typeof data.settings.customCurrency!=='object')data.settings.customCurrency={code:'CUSTOM',symbol:'¤'};
  data.settings.customCurrency.symbol=String(data.settings.customCurrency.symbol||data.settings.customCurrency.code||'¤').trim()||'¤';
  save();
  syncBsFromAd();scheduleCurrencyText();

nav();show('dashboard');

// Keep below-the-fold images cheap; the brand logo stays eager for instant header paint.
document.querySelectorAll('img:not(.brand-logo)').forEach(img=>{img.loading='lazy';img.decoding='async'});


