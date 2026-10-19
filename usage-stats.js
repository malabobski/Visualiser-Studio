(() => {
  const mini=!!document.getElementById('miniState'),tracker=UsageStatsModel.create(localStorage,mini?'mini':'main');
  function active(){
    if(mini)return !document.hidden&&document.getElementById('miniState').textContent==='Playing'?['mini']:[];
    if(typeof audio!=='undefined'&&!audio.paused&&!audio.ended){let style=$('style').value;const c=window.StyleTransition?.get();if(c?.enabled&&c.sections){let i=c.sections.findLastIndex(s=>s.start<=audio.currentTime);if(i>0&&audio.currentTime<c.sections[i].start+c.sections[i].fade/2)i--;style=c.sections[Math.max(0,i)].look.style;}return ['create',style];}
    if(typeof liveActive!=='undefined'&&liveActive)return ['live',liveLook.style];return [];
  }
  setInterval(()=>tracker.tick(...active()),1000);window.addEventListener('beforeunload',()=>tracker.tick(...active()));
  if(mini)return;
  window.addEventListener('visualiser-export-complete',e=>tracker.add('export',e.detail?.duration||0));
  window.addEventListener('usage-project-created',()=>tracker.add('project'));
  const duration=seconds=>{const n=Math.floor(seconds);return n>=3600?Math.floor(n/3600)+'h '+Math.floor(n%3600/60)+'m':n>=60?Math.floor(n/60)+'m '+n%60+'s':n+'s';};
  const sortRow=document.createElement('label');sortRow.className='create-style-sort';sortRow.innerHTML='<span>Sort styles</span><select id="createStyleSort" aria-label="Sort Create styles"><option value="default">Default order</option><option value="most">Most used</option><option value="least">Least used</option><option value="name">Name</option></select>';
  $('basicStyles').before(sortRow);
  const original=new Map([...document.querySelectorAll('#styleMenu .style-card')].map((card,i)=>[card,i]));
  const sortSelect=$('createStyleSort');try{const saved=localStorage.getItem('visualiserStyleSort');if([...sortSelect.options].some(o=>o.value===saved))sortSelect.value=saved;}catch{}
  function sortStyles(){const usage=tracker.snapshot().styles,mode=sortSelect.value;for(const id of ['basicStyles','complexStyles']){const grid=$(id),cards=[...grid.querySelectorAll('.style-card')];cards.sort((a,b)=>mode==='name'?a.querySelector('.card-name').textContent.localeCompare(b.querySelector('.card-name').textContent):mode==='default'?original.get(a)-original.get(b):(mode==='least'?(usage[a.dataset.style]||0)-(usage[b.dataset.style]||0):(usage[b.dataset.style]||0)-(usage[a.dataset.style]||0))||original.get(a)-original.get(b));cards.forEach(card=>grid.append(card));}}
  sortSelect.onchange=()=>{try{localStorage.setItem('visualiserStyleSort',sortSelect.value);}catch{}sortStyles();};$('styleToggle').addEventListener('click',sortStyles);sortStyles();
  function setup(){
    const group=$('restartTutorial')?.closest('.settings-group');if(!group)return;
    const row=document.createElement('div');row.className='settings-row';row.innerHTML='<button id="showUsageStats" class="menu-default" type="button">▥ Statistics</button><small>Your time with music and the things you’ve made.</small>';group.append(row);
    const dialog=document.createElement('dialog');dialog.id='usageStatsDialog';dialog.className='record-dialog usage-stats';dialog.setAttribute('aria-labelledby','usageStatsTitle');
    dialog.innerHTML='<div class="record-heading"><div><p class="eyebrow">YOUR TIME WITH MUSIC</p><h2 id="usageStatsTitle">Statistics</h2></div><button type="button" id="usageStatsClose" aria-label="Close statistics">×</button></div><div class="usage-time-card"><button id="usageTime" class="usage-total" aria-expanded="false" aria-controls="usageBreakdown"><span>Time spent with your music</span><strong></strong><small><span>View breakdown</span><i aria-hidden="true">⌄</i></small></button><div class="usage-breakdown-reveal" aria-hidden="true" inert><div class="usage-breakdown-clip"><div id="usageBreakdown"></div></div></div></div><div class="usage-counters"><div><strong id="usageExports"></strong><span>Videos exported</span><small id="usageExportDuration"></small></div><div><strong id="usageProjects"></strong><span>Projects created</span><small>New saved projects</small></div></div><footer><small id="usageSince"></small><button id="usageReset" type="button">Reset statistics</button></footer><div id="usageResetConfirm" hidden><span>Clear all usage statistics?</span><button id="usageKeep" type="button">Keep them</button><button id="usageResetAccept" type="button">Reset</button></div>';
    document.body.append(dialog);
    function render(){const data=tracker.snapshot(),total=Object.values(data.time).reduce((a,b)=>a+b,0);$('usageTime').querySelector('strong').textContent=duration(total);$('usageBreakdown').replaceChildren();for(const [key,label]of [['create','Create playback'],['live','Live audio'],['mini','Mini player']]){const r=document.createElement('div');r.textContent=label;const value=document.createElement('strong');value.textContent=duration(data.time[key]);r.append(value);$('usageBreakdown').append(r);}$('usageExports').textContent=data.exports.toLocaleString();$('usageProjects').textContent=data.projects.toLocaleString();$('usageExportDuration').textContent=duration(data.exportSeconds)+' of video';
      $('usageSince').textContent='Stored on this device · Since '+new Date(data.since).toLocaleDateString();
    }
    $('showUsageStats').onclick=()=>{render();dialog.showModal();};$('usageStatsClose').onclick=()=>dialog.close();
    $('usageTime').onclick=()=>{const open=$('usageTime').getAttribute('aria-expanded')!=='true',card=dialog.querySelector('.usage-time-card'),reveal=dialog.querySelector('.usage-breakdown-reveal');card.classList.toggle('is-expanded',open);reveal.inert=!open;reveal.setAttribute('aria-hidden',String(!open));$('usageTime').setAttribute('aria-expanded',String(open));$('usageTime').querySelector('small span').textContent=open?'Hide breakdown':'View breakdown';};
    $('usageReset').onclick=()=>{$('usageResetConfirm').hidden=false;};$('usageKeep').onclick=()=>{$('usageResetConfirm').hidden=true;};$('usageResetAccept').onclick=()=>{tracker.reset();sortStyles();$('usageResetConfirm').hidden=true;render();};
    dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))dialog.close();});dialog.addEventListener('close',()=>{$('usageResetConfirm').hidden=true;$('showUsageStats').focus();});setInterval(()=>{if(dialog.open)render();},1000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup);else setup();
})();
