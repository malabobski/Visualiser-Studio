// Convenience features share the existing playback, look and template state.
(() => {
  if (window.windowControls) {
    $('windowButtons').hidden = false;
    $('windowMinimise').onclick = () => window.windowControls.minimise();
    $('windowMaximise').onclick = () => window.windowControls.maximise();
    $('windowClose').onclick = () => window.windowControls.close();
    const updateWindowState = state => {
      const button=$('windowMaximise');
      const label=state.maximised?'Restore window':'Maximise window';
      button.title=label; button.setAttribute('aria-label',label);
      button.innerHTML=state.maximised?'<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"><path d="M4 3V1.5h6.5V8H9"/><rect x="1.5" y="4" width="6.5" height="6.5"/></svg>':'<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor"><rect x="1.5" y="1.5" width="9" height="9"/></svg>';
    };
    window.windowControls.onStateChange(updateWindowState);
    window.windowControls.getState().then(updateWindowState).catch(()=>{});
  }
  const artViewer=$('albumArtViewer'), artTrigger=$('albumArtOpen');
  let artClosingTimer, artZoom = 1;
  const setArtZoom = value => {
    artZoom = Math.max(.5, Math.min(4, value));
    const image=$('albumArtLarge');
    const width=image.naturalWidth || $('nowPlayingArt').naturalWidth || 400;
    const height=image.naturalHeight || $('nowPlayingArt').naturalHeight || 400;
    const fit=Math.min(1,(window.innerWidth-64)/width,(window.innerHeight-64)/height);
    const scale=Math.min(fit*artZoom,(window.innerWidth-48)/width,(window.innerHeight-48)/height);
    image.style.width=width*scale+'px';image.style.height=height*scale+'px';
    image.style.removeProperty('transform');
  };
  $('albumArtLarge').addEventListener('load',()=>setArtZoom(artZoom));
  window.addEventListener('resize',()=>{if(artViewer.open)setArtZoom(artZoom);});
  const closeArt=()=>{
    if(!artViewer.open || artViewer.classList.contains('closing'))return;
    artViewer.classList.add('closing');
    const reduced=document.body.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    artClosingTimer=setTimeout(()=>{artViewer.close();artViewer.classList.remove('closing');},reduced?0:220);
  };
  artTrigger.addEventListener('click',()=>{
    if(document.fullscreenElement || $('nowPlayingArt').hidden)return;
    clearTimeout(artClosingTimer);artViewer.classList.remove('closing');
    artZoom=1;
    $('albumArtLarge').src=$('nowPlayingArt').src;
    setArtZoom(1);
    artViewer.showModal();
  });
  artViewer.addEventListener('wheel',event=>{
    if(!artViewer.open || artViewer.classList.contains('closing'))return;
    event.preventDefault();
    const pixels=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?window.innerHeight:1);
    setArtZoom(artZoom*Math.exp(-Math.max(-240,Math.min(240,pixels))*.0015));
  },{passive:false});
  artViewer.addEventListener('cancel',event=>{event.preventDefault();closeArt();});
  artViewer.addEventListener('click',event=>{if(event.target===artViewer)closeArt();});
  artViewer.addEventListener('close',()=>{clearTimeout(artClosingTimer);artTrigger.focus();});
  document.addEventListener('fullscreenchange',()=>{
    artTrigger.disabled=!!document.fullscreenElement || $('nowPlayingArt').hidden;
    if(document.fullscreenElement && artViewer.open)artViewer.close();
  });
  const openMiniPlayer=async()=>{try{await window.miniPlayer?.open();}catch{showToast('Could not open the miniplayer. Please try again.');}};
  $('openMiniPlayer').onclick=openMiniPlayer;
  $('sidebarMiniPlayer').onclick=openMiniPlayer;
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { showToast('Could not save this preference.'); } };
  const nav = screen => document.querySelector(`[data-screen="${screen}"]`)?.click();
  const createVisible = () => !document.querySelector('main').hidden;
  const snapshots = [JSON.stringify(captureCurrentLook())];
  let position = 0, historyTimer, applying = false;
  const previousDraft = read('visualiserDraft', null);
  $('easeRestore').disabled = !previousDraft;
  function historyButtons() { $('easeUndo').disabled = position === 0; $('easeRedo').disabled = position === snapshots.length - 1; }
  function rememberLook() {
    if (applying) return;
    const snapshot = JSON.stringify(captureCurrentLook());
    if (snapshot === snapshots[position]) return;
    snapshots.splice(position + 1); snapshots.push(snapshot);
    if (snapshots.length > 60) snapshots.shift();
    position = snapshots.length - 1; historyButtons(); write('visualiserDraft', JSON.parse(snapshot));
  }
  function travel(delta) {
    clearTimeout(historyTimer); rememberLook();
    const next = position + delta; if (next < 0 || next >= snapshots.length) return;
    position = next; applying = true;
    try { applyTemplateLook(JSON.parse(snapshots[position])); } finally { applying = false; }
    historyButtons(); write('visualiserDraft', JSON.parse(snapshots[position])); showToast(delta < 0 ? 'Visual edit undone' : 'Visual edit restored');
  }
  document.addEventListener('input', event => {
    if (event.target.closest('main,.preset-window')) { clearTimeout(historyTimer); historyTimer = setTimeout(rememberLook, 450); }
  });
  document.addEventListener('click', event => {
    if (event.target.closest('main,.preset-window')) { clearTimeout(historyTimer); historyTimer = setTimeout(rememberLook, 80); }
  });
  $('easeUndo').onclick = () => travel(-1); $('easeRedo').onclick = () => travel(1);
  $('easeRestore').onclick = () => {
    if (!previousDraft || !styleParameters[previousDraft.style]) return;
    applyTemplateLook(previousDraft); rememberLook(); showToast('Previous visual draft restored');
  };
  $('easeSave').onclick = () => { saveCurrentAsTemplate(); rememberLook(); };
  $('easeSnapshot').onclick = () => {
    const image = createVisible() ? canvas : $('liveCanvas');
    image.toBlob(blob => {
      if (!blob) return showToast('Could not save the image.');
      const url = URL.createObjectURL(blob), link = document.createElement('a');
      link.href = url; link.download = 'visualiser-' + Date.now() + '.png'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000); showToast('Image saved');
    });
  };

  document.addEventListener('click',event=>{
    if(!event.target.closest('#easeEdit') || event.target.closest('#easeEdit button'))$('easeEdit').open=false;
  });
  $('easeEdit').addEventListener('keydown',event=>{
    if(event.key==='Escape') { event.stopPropagation(); $('easeEdit').open=false; $('easeEdit').querySelector('summary').focus(); }
  });
  const seek = $('easeSeek'); let scrubbing = false;
  const updateSeek = () => {
    const duration = Number.isFinite(audio.duration) ? audio.duration : 0;
    seek.disabled = !duration; seek.max = duration || 1;
    if (!scrubbing) seek.value = audio.currentTime;
    seek.style.setProperty('--progress', duration ? Number(seek.value) / duration * 100 + '%' : '0%');
  };
  ['timeupdate', 'loadedmetadata', 'emptied'].forEach(name => audio.addEventListener(name, updateSeek));
  seek.addEventListener('input', () => { scrubbing = true; updateSeek(); $('time').textContent = `${format(Number(seek.value))} / ${format(audio.duration || 0)}`; });
  seek.addEventListener('change', () => { audio.currentTime = Number(seek.value); scrubbing = false; updateSeek(); });
  seek.addEventListener('blur', () => { scrubbing = false; updateSeek(); });
  let rememberedVolume = read('visualiserVolume', 100);
  $('volume').value = Math.max(0, Math.min(100, Number(rememberedVolume) || 0));
  $('volume').dispatchEvent(new Event('input'));
  $('volume').addEventListener('input', () => { write('visualiserVolume', Number($('volume').value)); });
  const mute = () => {
    const volume = $('volume'); if (Number(volume.value)) { rememberedVolume = Number(volume.value); volume.value = 0; } else volume.value = rememberedVolume || 100;
    volume.dispatchEvent(new Event('input'));
  };
  $('easeSpeed').value = String(read('visualiserSpeed', 1));
  if (!$('easeSpeed').value) $('easeSpeed').value = '1';
  audio.playbackRate = Number($('easeSpeed').value);
  $('easeSpeed').onchange = () => { audio.playbackRate = Number($('easeSpeed').value); write('visualiserSpeed', audio.playbackRate); };
  $('easeLoop').checked = read('visualiserLoop', false); audio.loop = $('easeLoop').checked;
  $('easeLoop').onchange = () => { audio.loop = $('easeLoop').checked; write('visualiserLoop', audio.loop); };
  audio.addEventListener('error', () => { $('status').textContent = 'This audio file could not be played. Try another file or format.'; });
  const main = document.querySelector('main'); main.classList.toggle('controls-left', read('visualiserControlsLeft', false));
  new MutationObserver(() => write('visualiserControlsLeft', main.classList.contains('controls-left'))).observe(main, { attributes: true, attributeFilter: ['class'] });
  refreshLiveTemplates();
  const savedLiveTemplate = read('visualiserLiveTemplate', '');
  if(loadTemplates().some(t=>t.id===savedLiveTemplate)) { $('liveTemplate').value=savedLiveTemplate; $('liveTemplate').dispatchEvent(new Event('change')); }
  $('liveTemplate').addEventListener('change',()=>write('visualiserLiveTemplate',$('liveTemplate').value));
  $('liveAlbumColours').checked = read('visualiserAlbumColours', true);
  $('liveAlbumColours').addEventListener('change', () => write('visualiserAlbumColours', $('liveAlbumColours').checked));
  document.addEventListener('dragover', event => { if (event.dataTransfer?.types.includes('Files')) event.preventDefault(); });
  document.addEventListener('drop', event => {
    if (!event.dataTransfer?.files.length || event.target.closest('#dropZone')) return;
    event.preventDefault(); if (exporting) return showToast('Finish or cancel the export before opening another track.');
    nav('create'); loadAudio(event.dataTransfer.files[0]);
  });
  window.addEventListener('beforeunload', event => { if (exporting) { event.preventDefault(); event.returnValue = ''; } });

  const libraryTools = document.createElement('div'); libraryTools.className = 'ease-library-tools';
  libraryTools.innerHTML = '<input id="easeTemplateSearch" type="search" placeholder="Search templates…" aria-label="Search templates"><select id="easeTemplateSort" aria-label="Sort templates"><option value="newest">Newest first</option><option value="name">Name A–Z</option><option value="style">Visual style</option></select><button id="easeTemplateClear" type="button" hidden>Clear search</button><span id="easeTemplateCount" role="status"></span>';
  $('templatesGrid').before(libraryTools);
  function filterTemplates() {
    const query = $('easeTemplateSearch').value.trim().toLowerCase(), templates = loadTemplates();
    const cards = [...$('templatesGrid').querySelectorAll('.template-card:not(.template-card-new)')]; let shown = 0;
    const order = $('easeTemplateSort').value;
    cards.sort((a,b) => {
      const ta = templates.find(t => t.id === a.dataset.templateId), tb = templates.find(t => t.id === b.dataset.templateId);
      if (!ta || !tb) return 0;
      return order === 'newest' ? templates.indexOf(tb) - templates.indexOf(ta) : String(order === 'style' ? ta.style : ta.name).localeCompare(String(order === 'style' ? tb.style : tb.name));
    }).forEach(card => {
      const template = templates.find(t => t.id === card.dataset.templateId);
      card.hidden = !template || !`${template.name} ${template.style}`.toLowerCase().includes(query);
      if (!card.hidden) shown++; card.style.order = cards.indexOf(card) + 1;
    });
    $('easeTemplateClear').hidden = !query;
    $('easeTemplateCount').textContent = shown ? `${shown} template${shown === 1 ? '' : 's'}` : 'No matching templates';
  }
  $('easeTemplateSort').value = read('visualiserTemplateSort','newest');
  if (!$('easeTemplateSort').value) $('easeTemplateSort').value='newest';
  $('easeTemplateSearch').oninput = filterTemplates;
  $('easeTemplateSort').onchange = () => { write('visualiserTemplateSort',$('easeTemplateSort').value); filterTemplates(); };
  const clearTemplateSearch = () => { $('easeTemplateSearch').value=''; filterTemplates(); $('easeTemplateSearch').focus(); };
  $('easeTemplateClear').onclick = clearTemplateSearch;
  $('easeTemplateSearch').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();clearTemplateSearch();}});
  document.addEventListener('keydown', event => {
    const toggle=event.target.closest('button[aria-expanded][aria-controls]');
    if(toggle && ['ArrowDown','ArrowUp'].includes(event.key)) {
      const menu=$(toggle.getAttribute('aria-controls'));
      if(!menu)return;
      event.preventDefault();if(menu.hidden)toggle.click();
      const options=[...menu.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled)')];
      (event.key==='ArrowDown'?options[0]:options.at(-1))?.focus();return;
    }
    const menu=event.target.closest('.simple-menu,.style-menu,.size-menu,.colour-menu,.range-menu');
    if(!menu)return;
    const owner=document.querySelector('button[aria-controls="'+menu.id+'"]');
    if(event.key==='Escape' && owner){event.preventDefault();owner.focus();return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key) && event.target.matches('button')) {
      const options=[...menu.querySelectorAll('button:not(:disabled)')],index=options.indexOf(event.target);
      event.preventDefault();
      const next=event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options[next]?.focus();
    }
  });
  new MutationObserver(filterTemplates).observe($('templatesGrid'), { childList: true }); filterTemplates();

  const commands = [
    ['Open audio', 'Ctrl+O / Ctrl+0', () => { nav('create'); $('file').click(); }],
    ['Open mini player', '', () => window.miniPlayer?.open()],
    ['Go to Create', 'Alt+1', () => nav('create')], ['Go to Templates', 'Alt+2', () => nav('templates')], ['Go to Live', 'Alt+3', () => nav('live')],
    ['Save current look as template', 'Ctrl+S', () => saveCurrentAsTemplate()],
    ['Undo visual edit', 'Ctrl+Z', () => travel(-1)], ['Redo visual edit', 'Ctrl+Y', () => travel(1)],
    ['Restore previous draft', '', () => $('easeRestore').click()],
    ['Save stage image', 'Ctrl+I', () => $('easeSnapshot').click()],
    ['Toggle control layout', '', toggleLayout], ['Preferences', '', () => $('settingsToggle').click()],
    ['Keyboard shortcuts', '?', () => $('showShortcutsBtn').click()],
    ['Start live audio', '', () => { nav('live'); document.querySelector('[data-live-view="liveaudio"]').click(); startLiveAudio(); }],
    ['Stop live audio', '', stopLiveAudio], ['Fullscreen stage', 'F', toggleFullscreen],
    ['Mute preview', 'M', mute], ['Export video', '', () => { nav('create'); if ($('export').disabled) showToast('Load an audio file first.'); else $('export').click(); }]
  ];
  const palette = $('easePalette'); let returnFocus;
  function renderCommands() {
    const query = $('easeSearch').value.toLowerCase(); $('easeResults').replaceChildren();
    commands.filter(([name]) => name.toLowerCase().includes(query)).forEach(([name,key,run]) => {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = name;
      const hint = document.createElement('kbd'); hint.textContent = key; button.append(hint);
      button.onclick = () => { palette.close(); run(); }; $('easeResults').append(button);
    });
    if (!$('easeResults').children.length) $('easeResults').textContent = 'No matching actions';
  }
  function openCommands() { if (palette.open) return; returnFocus = document.activeElement; $('easeSearch').value = ''; renderCommands(); palette.showModal(); $('easeSearch').focus(); }
  palette.addEventListener('close', () => returnFocus?.focus());
  $('easeActions').onclick = openCommands; $('easePaletteClose').onclick = () => palette.close(); $('easeSearch').oninput = renderCommands;
  palette.addEventListener('click', event => { if (event.target === palette) { const rect = palette.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) palette.close(); } });
  palette.addEventListener('keydown', event => {
    const buttons = [...$('easeResults').querySelectorAll('button')], index = buttons.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); buttons[(index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus(); }
    if (event.key === 'Enter' && document.activeElement === $('easeSearch')) { event.preventDefault(); buttons[0]?.click(); }
  });
  document.addEventListener('keydown', event => {
    const editing = event.target.matches('input:not([type="range"]):not([type="checkbox"]):not([type="color"]),textarea,[contenteditable="true"]'), key = event.key.toLowerCase(), ctrl = event.ctrlKey || event.metaKey;
    const handle = action => { event.preventDefault(); event.stopImmediatePropagation(); action(); };
    if (ctrl && key === 'k') return handle(openCommands);
    if (palette.open || document.querySelector('dialog[open],.settings-window:not([hidden]),.template-switch-dialog:not([hidden]),.preset-window:not([hidden])')) return;
    if (ctrl && (key === 'o' || key === '0')) return handle(() => { nav('create'); $('file').click(); });
    if (editing) return;
    if (ctrl && key === 'i') return handle(() => $('easeSnapshot').click());
    if (ctrl && key === 's') return handle(saveCurrentAsTemplate);
    if (ctrl && key === 'z') return handle(() => travel(event.shiftKey ? 1 : -1));
    if (ctrl && key === 'y') return handle(() => travel(1));
    if (event.altKey && ['1','2','3'].includes(key)) return handle(() => nav({1:'create',2:'templates',3:'live'}[key]));
    if (event.key === '?') return handle(() => $('showShortcutsBtn').click());
    if (key === 'm' && createVisible()) return handle(mute);
  }, true);
  document.querySelectorAll('button[data-hint]').forEach(button => button.removeAttribute('title'));
})();
