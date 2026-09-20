
  /* AD ↔ BS, both editable */
  window.syncBsFromAd=function(){
    const ad=document.getElementById('today')?.value||'',bs=adToBs(ad),b=document.getElementById('todayBs');
    if(b)b.value=bs?bs.label:'';
  };
  window.syncTodayFromBs=function(){
    const b=document.getElementById('todayBs'),ad=bsToAd(b?.value?.trim()||'');
    if(!ad){toast('Valid BS date लिखें, जैसे 2083-06-02');return}
    const a=document.getElementById('today');if(a)a.value=ad;syncBsFromAd();render();
  };
  window.syncFieldBs=function(id){
    const a=document.getElementById(id),b=document.getElementById(id+'Bs');if(!a)return;
    const bs=adToBs(a.value||'');if(b)b.value=bs?bs.label:'';
    if(id==='mentorSelectedDate'){data.mentorSelectedDate=a.value||today();save();setTimeout(renderMentor,0)}
  };
  window.syncFieldAdFromBs=function(id){
    const b=document.getElementById(id+'Bs'),ad=bsToAd(b?.value?.trim()||'');
    if(!ad){toast('Valid BS date लिखें, जैसे 2083-06-02');return}
    const a=document.getElementById(id);if(a)a.value=ad;syncFieldBs(id);
  };
  window.dateFieldMarkup=function(id,value='',label='Date'){
    const bs=adToBs(value||'');
    return `<div class="universal-date-field full"><div class="label" style="margin-bottom:4px">${esc(label)}</div><div class="universal-date-control"><label><span class="meta">AD</span><input id="${id}" type="date" value="${esc(value||'')}" aria-label="${esc(label)} (AD)" onchange="syncFieldBs('${id}')"></label><label><span class="meta">BS</span><input id="${id}Bs" class="bs-date-input" type="text" inputmode="numeric" value="${bs?esc(bs.label):''}" placeholder="YYYY-MM-DD" aria-label="${esc(label)} (BS)" onchange="syncFieldAdFromBs('${id}')"></label></div></div>`;
  };
  window.selectBsCalendarDate=function(ad){
    const input=document.getElementById(bsCalendarTarget);if(!input)return;input.value=ad;
    if(bsCalendarTarget==='today'){syncBsFromAd();render()}else{syncFieldBs(bsCalendarTarget)}closeBsCalendar();
  };

  /* Daily Plan — Ultra Command Center */
  function plannerPercent(value){
    const n=Number(String(value??'').replace('%','').trim());
    return Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):0;
  }
  function plannerDay(){
    const d=dayObj();
    if(!Array.isArray(d.planPoints))d.planPoints=[];
    if(!Array.isArray(d.achievementPoints))d.achievementPoints=[];
    if(!Array.isArray(d.reflectionPoints))d.reflectionPoints=[];
    return d;
  }
  function plannerPointRow(kind,x){
    return `<div class="ultra-point ${x.done?'is-done':''}" data-point-kind="${esc(kind)}" data-point-id="${esc(x.id)}">
      <button class="ultra-check" type="button" aria-label="${x.done?'Mark incomplete':'Mark complete'}" onclick="togglePointFast('${esc(kind)}','${esc(x.id)}')">${x.done?'✓':''}</button>
      <span class="ultra-point-text">${esc(x.text)}</span>
      <button class="ultra-icon-btn ultra-delete" type="button" aria-label="Delete point" onclick="delPointFast('${esc(kind)}','${esc(x.id)}')">×</button>
    </div>`;
  }
  function plannerList(kind,title,icon,placeholder){
    const items=plannerDay()[kind]||[];
    return `<section class="ultra-board-section" data-kind="${esc(kind)}">
      <div class="ultra-board-head"><div><div class="ultra-section-kicker">${icon} ${esc(title)}</div><div class="ultra-count" data-count="${esc(kind)}">${items.filter(x=>x.done).length}/${items.length} complete</div></div><span class="ultra-status-dot" aria-hidden="true"></span></div>
      <div class="ultra-points" data-points="${esc(kind)}">${items.length?items.map(x=>plannerPointRow(kind,x)).join(''):'<div class="ultra-empty">Nothing here yet — add one clear point.</div>'}</div>
      <div class="ultra-add-row"><input class="ultra-add-input" data-add-input="${esc(kind)}" placeholder="${esc(placeholder)}" maxlength="240"><button type="button" class="ultra-add-btn" onclick="addPointFast('${esc(kind)}')">＋ Add</button></div>
    </section>`;
  }
  function updatePlannerStats(){
    const d=plannerDay(),all=[...(d.planPoints||[]),...(d.achievementPoints||[]),...(d.reflectionPoints||[])],done=all.filter(x=>x.done).length;
    const pct=plannerPercent(d.progress), planDone=(d.planPoints||[]).filter(x=>x.done).length;
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v};
    set('plannerPct',pct+'%');set('plannerDone',planDone+'/'+(d.planPoints||[]).length);set('plannerAllDone',done+'/'+all.length);
    const bar=document.getElementById('plannerProgressBar');if(bar)bar.style.width=pct+'%';
  }
  window.saveDailyPlan=function(){
    if(!data||typeof data!=='object')return toast('Data अभी तैयार नहीं है');
    const d=plannerDay(),key=today(),t=document.querySelector('#planner #dailyTarget'),p=document.querySelector('#planner #dailyProgress'),range=document.getElementById('dailyProgressRange');
    d.target=t?t.value.trim():'';
    d.progress=range?String(plannerPercent(range.value)):String(plannerPercent(p?.value||0));
    if(p)p.value=d.progress+'%';
    data.daily[key]=d;save();updatePlannerStats();toast('Daily Plan saved ✓');
  };
  window.deleteTodayPlan=function(){
    if(!data||typeof data!=='object')return toast('Data अभी तैयार नहीं है');
    if(!data.daily||typeof data.daily!=='object'||Array.isArray(data.daily))data.daily={};
    if(!data.daily[today()])return toast('आज का Daily Plan खाली है');
    if(!confirm('आज का पूरा Daily Plan delete करें?'))return;
    delete data.daily[today()];save();renderPlanner();toast('Today deleted');
  };
  window.setPlannerProgress=function(v){
    const n=plannerPercent(v),input=document.getElementById('dailyProgress');if(input)input.value=n+'%';
    const bar=document.getElementById('plannerProgressBar');if(bar)bar.style.width=n+'%';
    if(data?.daily?.[today()]){data.daily[today()].progress=String(n);save();}
    updatePlannerStats();
  };
  window.addPointFast=function(kind){
    const input=document.querySelector(`[data-add-input="${CSS.escape(kind)}"]`);const text=input?.value?.trim();if(!text)return input?.focus();
    const d=plannerDay();d[kind].push({id:uid(),text,done:false});save();
    const box=document.querySelector(`[data-points="${CSS.escape(kind)}"]`);if(box){const empty=box.querySelector('.ultra-empty');if(empty)empty.remove();box.insertAdjacentHTML('beforeend',plannerPointRow(kind,d[kind][d[kind].length-1]));}
    if(input)input.value='';updatePlannerStats();refreshPlannerCounts();
  };
  window.togglePointFast=function(kind,id){
    const p=plannerDay()[kind]?.find(x=>x.id===id);if(!p)return;p.done=!p.done;save();
    const row=document.querySelector(`[data-point-kind="${CSS.escape(kind)}"][data-point-id="${CSS.escape(id)}"]`);if(row){row.classList.toggle('is-done',p.done);const c=row.querySelector('.ultra-check');if(c){c.textContent=p.done?'✓':'';c.setAttribute('aria-label',p.done?'Mark incomplete':'Mark complete');}}
    updatePlannerStats();refreshPlannerCounts();
  };
  window.delPointFast=function(kind,id){
    const d=plannerDay(),a=d[kind]||[];d[kind]=a.filter(x=>x.id!==id);save();
    document.querySelector(`[data-point-kind="${CSS.escape(kind)}"][data-point-id="${CSS.escape(id)}"]`)?.remove();
    const box=document.querySelector(`[data-points="${CSS.escape(kind)}"]`);if(box&&!box.children.length)box.innerHTML='<div class="ultra-empty">Nothing here yet — add one clear point.</div>';
    updatePlannerStats();refreshPlannerCounts();
  };
  function refreshPlannerCounts(){
    const d=plannerDay();for(const kind of ['planPoints','achievementPoints','reflectionPoints']){const a=d[kind]||[],el=document.querySelector(`[data-count="${CSS.escape(kind)}"]`);if(el)el.textContent=`${a.filter(x=>x.done).length}/${a.length} complete`;}
  }
  window.renderPlanner=function(){
    const d=plannerDay(),pct=plannerPercent(d.progress),ad=today(),bs=adToBs(ad);
    const target=document.getElementById('planner');if(!target)return;
    target.innerHTML=`<div class="ultra-planner-shell">
      <div class="ultra-planner-hero">
        <div class="ultra-planner-hero-copy"><div class="ultra-eyebrow">DAILY COMMAND CENTER</div><h2>Plan the day. Execute the day.</h2><p>${esc(ad)} · ${esc(bs?.label||'')} · Keep the system clear, focused and measurable.</p></div>
        <div class="ultra-day-chip"><span class="ultra-live-dot"></span><span>Today</span><strong>${esc(bs?.monthName||'')}</strong></div>
      </div>
      <div class="ultra-stat-grid">
        <div class="ultra-stat"><span>Progress</span><strong id="plannerPct">${pct}%</strong><div class="ultra-progress"><i id="plannerProgressBar" style="width:${pct}%"></i></div></div>
        <div class="ultra-stat"><span>Priority points</span><strong id="plannerDone">${d.planPoints.filter(x=>x.done).length}/${d.planPoints.length}</strong><small>completed</small></div>
        <div class="ultra-stat"><span>All points</span><strong id="plannerAllDone">${[...d.planPoints,...d.achievementPoints,...d.reflectionPoints].filter(x=>x.done).length}/${d.planPoints.length+d.achievementPoints.length+d.reflectionPoints.length}</strong><small>completed</small></div>
      </div>
      <div class="ultra-planner-grid">
        <div class="ultra-main-card">
          <div class="ultra-card-head"><div><div class="ultra-section-kicker">🎯 MAIN TARGET</div><h3>What makes today successful?</h3></div><span class="ultra-badge">FOCUS</span></div>
          <textarea id="dailyTarget" class="ultra-target" maxlength="500" placeholder="Write one clear outcome for today…">${esc(d.target||'')}</textarea>
          <div class="ultra-progress-head"><label for="dailyProgressRange">Execution progress</label><output id="dailyProgressOutput">${pct}%</output></div>
          <input id="dailyProgressRange" class="ultra-range" type="range" min="0" max="100" step="5" value="${pct}" aria-label="Daily progress" oninput="document.getElementById('dailyProgressOutput').value=this.value+'%';document.getElementById('plannerPct').textContent=this.value+'%';document.getElementById('plannerProgressBar').style.width=this.value+'%';">
          <input id="dailyProgress" class="ultra-hidden-progress" value="${pct}%" aria-label="Daily progress value">
          <div class="ultra-actions"><button class="ultra-primary" type="button" onclick="saveDailyPlan()">Save plan</button><button class="ultra-secondary" type="button" onclick="setPlannerProgress(0)">Reset progress</button><button class="ultra-danger" type="button" onclick="deleteTodayPlan()">Delete day</button></div>
        </div>
        <div class="ultra-side-card">${plannerList('planPoints','Top priorities','⚡','Add the next important action…')}</div>
      </div>
      <div class="ultra-lower-grid"><div class="ultra-side-card">${plannerList('achievementPoints','Achievements','🏆','What did you accomplish?')}</div><div class="ultra-side-card">${plannerList('reflectionPoints','Reflection','🪞','What should you learn or improve?')}</div></div>
    </div>`;
    ['planPoints','achievementPoints','reflectionPoints'].forEach(kind=>{const input=document.querySelector(`[data-add-input="${CSS.escape(kind)}"]`);input?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addPointFast(kind)}})});
    updatePlannerStats();
  };

  window.renderCategory=function(id){
    const el=document.getElementById(id),meta=LIFEOS_CATEGORIES[id];if(!el||!meta)return;
    const items=getCategoryItems(id);
    el.innerHTML=`<div class="hero"><div class="eyebrow">LIFE BALANCE</div><h2>${meta[0]}</h2><p>${meta[1]}</p></div><div class="two"><div class="card"><h2>＋ Add ${meta[0].replace(/^\S+\s/,'')} item</h2><div class="form"><input id="catTitle-${id}" placeholder="Title / priority"><textarea id="catText-${id}" placeholder="Write a thought, plan, habit, responsibility or next action..."></textarea><button class="primary" onclick="addCategoryItem('${id}')">Save Item</button></div></div><div class="card"><h2>Focus areas</h2><p class="muted">${meta[2]}</p><div class="list"><div class="item">Keep one clear next action.</div><div class="item">Review this area weekly.</div><div class="item">Avoid overloading the page with unnecessary effects.</div></div></div></div><div class="card" style="margin-top:14px"><div class="between"><h2>Saved items</h2><span class="tag">${items.length} items</span></div><div class="list">${items.length?items.map(x=>`<div class="item ${x.done?'done':''}"><div class="saved-item-row"><div class="saved-main"><b>${esc(x.title)}</b><div class="meta">${esc(x.text||'')}</div></div><div class="saved-item-actions"><button class="secondary" type="button" onclick="toggleCategoryItem('${id}','${x.id}',${!x.done})">${x.done?'↩ Undo':'✓ Done'}</button><button class="danger" type="button" onclick="deleteCategoryItem('${id}','${x.id}')">🗑 Delete</button></div></div></div>`).join(''):'<div class="empty">अभी कोई item नहीं।</div>'}</div></div>`;
  };

