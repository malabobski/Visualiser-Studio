(() => {
  document.addEventListener('DOMContentLoaded',()=>{
    const card=document.querySelector('.settings-card');if(!card)return;
    const exportGroup=document.getElementById('settingFramerate')?.closest('.settings-group');
    const bridge=window.exportFiles;
    if(exportGroup&&bridge){
      const row=document.createElement('div');row.className='settings-row';row.dataset.search='export download directory folder file name naming';
      row.innerHTML='<label class="settings-select-label">Export folder<button id="exportFolder" class="menu-default" type="button">Downloads</button></label><small>Used as the starting folder when saving a video. Your last save location is remembered.</small><label class="settings-select-label">Filename<select id="exportNaming"><option value="track">Track name</option><option value="style">Track name + style</option><option value="date">Track name + date</option><option value="custom">Custom pattern</option></select></label><label id="exportPatternRow" class="settings-select-label" hidden>Filename pattern<input id="exportPattern" type="text" maxlength="120" spellcheck="false" placeholder="{track} - {style}"></label><small id="exportPatternHelp" hidden>Use {track}, {style}, {date} or {time}. The .webm extension is added for you.</small><small id="exportFilenamePreview"></small><small id="exportPreferencesStatus" role="status"></small>';
      exportGroup.append(row);
      const naming=row.querySelector('#exportNaming'),pattern=row.querySelector('#exportPattern'),status=row.querySelector('#exportPreferencesStatus');
      let saved;
      function render(state){if(!state)return;saved=state;row.querySelector('#exportFolder').textContent=state.folderLabel;row.querySelector('#exportFolder').title=state.folder||'Downloads';naming.value=state.format;pattern.value=state.pattern;row.querySelector('#exportPatternRow').hidden=state.format!=='custom';row.querySelector('#exportPatternHelp').hidden=state.format!=='custom';row.querySelector('#exportFilenamePreview').textContent='Example: '+state.preview;status.textContent='';}
      async function persist(){
        if(naming.value==='custom'&&!pattern.value.trim())pattern.value='{track} - {style}';
        try{render(await bridge.naming({format:naming.value,pattern:pattern.value}));}
        catch(error){status.textContent=error.message||'Could not save export preferences.';}
      }
      naming.onchange=persist;pattern.onchange=persist;
      row.querySelector('#exportFolder').onclick=async()=>{try{render(await bridge.chooseFolder());}catch{status.textContent='Could not change the export folder.';}};
      exportGroup.addEventListener('toggle',()=>{if(exportGroup.open)bridge.get().then(render).catch(()=>{});});
      bridge.get().then(render).catch(()=>{status.textContent='Export preferences are unavailable.';});
    }
    const search=document.createElement('div');search.className='settings-search';
    search.innerHTML='<input id="settingsSearch" type="search" placeholder="Search settings…" aria-label="Search settings"><button type="button" aria-label="Clear settings search" hidden>×</button><small id="settingsSearchStatus" role="status" hidden></small>';
    card.querySelector('.preset-heading').after(search);
    const input=search.querySelector('input'),clear=search.querySelector('button'),message=search.querySelector('small');
    let expanded=null;
    const text=node=>(node.textContent+' '+(node.dataset.search||'')+' '+[...node.querySelectorAll('[aria-label],[data-search]')].map(child=>(child.getAttribute('aria-label')||'')+' '+(child.dataset.search||'')).join(' ')).toLowerCase();
    function filter(){
      const words=input.value.trim().toLowerCase().split(/\s+/).filter(Boolean),groups=[...card.querySelectorAll(':scope>.settings-group,:scope>.settings-footer')];
      if(words.length&&!expanded)expanded=new Map(groups.map(group=>[group,group.open]));
      let matches=0;
      for(const group of groups){
        const heading=group.querySelector(':scope>summary')?.textContent||'Help app version keyboard shortcuts';
        let visible=0;
        const rows=[...group.querySelectorAll(':scope>.settings-row')];
        for(const row of rows){const content=(heading+' '+text(row)).toLowerCase(),show=!words.length||words.every(word=>content.includes(word));row.toggleAttribute('data-settings-search-hidden',!show);if(show)visible++;}
        if(!rows.length)visible=!words.length||words.every(word=>text(group).includes(word))?1:0;
        group.toggleAttribute('data-settings-search-hidden',!visible);
        if(words.length&&visible&&group.tagName==='DETAILS')group.open=true;
        if(!words.length&&expanded?.has(group))group.open=expanded.get(group);
        matches+=visible;
      }
      if(!words.length)expanded=null;
      clear.hidden=!words.length;message.hidden=!words.length||!!matches;if(message.textContent!=='No settings match that search.')message.textContent='No settings match that search.';
    }
    input.oninput=filter;clear.onclick=()=>{input.value='';filter();input.focus();};
    input.onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();clear.click();}};
    new MutationObserver(()=>{if(input.value.trim())filter();}).observe(card,{childList:true,subtree:true});
    // Re-apply an active query when Settings is reopened and its sections reset.
    new MutationObserver(()=>{if(!card.closest('.settings-window').hidden&&input.value.trim())filter();}).observe(card.closest('.settings-window'),{attributes:true,attributeFilter:['hidden']});
  });
})();
