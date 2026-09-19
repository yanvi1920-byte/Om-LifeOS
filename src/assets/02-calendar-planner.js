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

  /* Daily Plan */
  window.saveDailyPlan=function(){
    const key=today(),existing=data.daily[key]||{target:'',progress:'',planPoints:[],achievementPoints:[],reflectionPoints:[]};
    const t=document.querySelector('#planner #dailyTarget'),p=document.querySelector('#planner #dailyProgress');
    data.daily[key]={...existing,target:t?t.value:'',progress:p?p.value:''};
    save();
    toast('Daily Plan saved ✓');
    renderPlanner();
  };
  window.deleteTodayPlan=function(){
    if(!data.daily[today()])return toast('आज का Daily Plan खाली है');
    if(!confirm('आज का पूरा Daily Plan delete करें?'))return;
    delete data.daily[today()];save();renderPlanner();toast('Today deleted');
  };
  window.renderPlanner=function(){
    const d=dayObj();
    document.getElementById('planner').innerHTML=`<div class="two"><div class="card"><h2>📅 Daily Plan</h2><div class="formgrid"><div class="full"><label class="label">Main Target</label><input id="dailyTarget" value="${esc(d.target||'')}" placeholder="आज का मुख्य लक्ष्य"></div><div><label class="label">Progress</label><input id="dailyProgress" value="${esc(d.progress||'')}" placeholder="जैसे 70%"></div></div><div class="row" style="margin-top:10px"><button class="primary" type="button" onclick="saveDailyPlan()">💾 Save</button><button class="danger" type="button" onclick="deleteTodayPlan()">🗑 Delete Today</button></div><h2 style="margin-top:18px">📌 Top Priorities — Point Wise</h2><div class="points">${pointHtml('planPoints')}</div><button class="secondary" type="button" onclick="addPoint('planPoints')">+ Add Priority Point</button></div><div class="card"><h2>🏆 Achievement — Point Wise</h2><div class="points">${pointHtml('achievementPoints')}</div><button class="secondary" type="button" onclick="addPoint('achievementPoints')">+ Add Achievement Point</button><h2 style="margin-top:20px">🪞 Reflection — Point Wise</h2><div class="points">${pointHtml('reflectionPoints')}</div><button class="secondary" type="button" onclick="addPoint('reflectionPoints')">+ Add Reflection Point</button></div></div>`;
  };

  window.renderCategory=function(id){
    const el=document.getElementById(id),meta=LIFEOS_CATEGORIES[id];if(!el||!meta)return;
    const items=getCategoryItems(id);
    el.innerHTML=`<div class="hero"><div class="eyebrow">LIFE BALANCE</div><h2>${meta[0]}</h2><p>${meta[1]}</p></div><div class="two"><div class="card"><h2>＋ Add ${meta[0].replace(/^\S+\s/,'')} item</h2><div class="form"><input id="catTitle-${id}" placeholder="Title / priority"><textarea id="catText-${id}" placeholder="Write a thought, plan, habit, responsibility or next action..."></textarea><button class="primary" onclick="addCategoryItem('${id}')">Save Item</button></div></div><div class="card"><h2>Focus areas</h2><p class="muted">${meta[2]}</p><div class="list"><div class="item">Keep one clear next action.</div><div class="item">Review this area weekly.</div><div class="item">Avoid overloading the page with unnecessary effects.</div></div></div></div><div class="card" style="margin-top:14px"><div class="between"><h2>Saved items</h2><span class="tag">${items.length} items</span></div><div class="list">${items.length?items.map(x=>`<div class="item ${x.done?'done':''}"><div class="saved-item-row"><div class="saved-main"><b>${esc(x.title)}</b><div class="meta">${esc(x.text||'')}</div></div><div class="saved-item-actions"><button class="secondary" type="button" onclick="toggleCategoryItem('${id}','${x.id}',${!x.done})">${x.done?'↩ Undo':'✓ Done'}</button><button class="danger" type="button" onclick="deleteCategoryItem('${id}','${x.id}')">🗑 Delete</button></div></div></div>`).join(''):'<div class="empty">अभी कोई item नहीं।</div>'}</div></div>`;
  };
