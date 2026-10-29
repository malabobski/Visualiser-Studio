(function(root){
  function restartBlockReason({exporting=false,recording='',saving=false}={}){
    if(exporting)return 'Finish or cancel the video export before installing your update.';
    if(['recording','paused','saving','review'].includes(recording))return 'Save or discard your recording before installing your update.';
    if(saving)return 'Finish saving your project before installing your update.';
    return '';
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={restartBlockReason};return;}
  const bridge=window.appUpdates;
  const highlightsDialog=document.createElement('dialog');highlightsDialog.id='updateHighlights';highlightsDialog.setAttribute('aria-labelledby','updateHighlightsTitle');
  highlightsDialog.innerHTML='<header><div><p class="eyebrow">FRESHLY UPDATED <span data-version></span></p><h2 id="updateHighlightsTitle">What’s new?</h2><p data-intro></p></div><button type="button" data-close aria-label="Close what’s new">×</button></header><div data-highlights></div><footer><p>Your update is installed. Make yourself at home.</p><button type="button" data-done>Let’s go</button></footer>';
  document.body.append(highlightsDialog);let highlightsTimer,shownHighlights='',pendingHighlights=null;
  function showHighlights(){
    clearTimeout(highlightsTimer);if(!pendingHighlights||shownHighlights===pendingHighlights.version)return;
    if(document.hidden||document.fullscreenElement||exporting||document.querySelector('dialog[open]')||root.Tutorial?.active||['recording','paused','saving','review'].includes(window.getLiveRecordingActivity?.().state)){highlightsTimer=setTimeout(showHighlights,1000);return;}
    const notes=pendingHighlights;highlightsDialog.querySelector('[data-version]').textContent='v'+notes.version;highlightsDialog.querySelector('[data-intro]').textContent=notes.title;
    const content=highlightsDialog.querySelector('[data-highlights]');content.replaceChildren();
    for(const section of notes.sections){const card=document.createElement('section'),title=document.createElement('h3'),list=document.createElement('ul');title.textContent=section.title;for(const text of section.items){const item=document.createElement('li');item.textContent=text;list.append(item);}card.append(title,list);content.append(card);}
    shownHighlights=notes.version;highlightsDialog.showModal();highlightsDialog.querySelector('[data-done]').focus();
  }
  function closeHighlights(){highlightsDialog.close();}
  highlightsDialog.querySelector('[data-close]').onclick=closeHighlights;highlightsDialog.querySelector('[data-done]').onclick=closeHighlights;
  highlightsDialog.addEventListener('close',()=>{pendingHighlights=null;bridge?.acknowledgeHighlights?.().catch(()=>{});});
  highlightsDialog.addEventListener('click',event=>{const r=highlightsDialog.getBoundingClientRect();if(event.target===highlightsDialog&&(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom))closeHighlights();});
  const updateToast=message=>showToast(message,{onClick:async()=>{
    if($('projectSaveDialog')?.open){$('projectName')?.focus();return;}
    if(exporting)return root.AppNotifications.navigate({screen:'create',target:'exportScreen'});
    const recording=window.getLiveRecordingActivity?.().state;
    if(['recording','paused','saving','review'].includes(recording)){
      await root.AppNotifications.navigate({screen:'live',target:'liveRecordSetup'});
      if(recording==='review'&&!$('recordPreview').open)$('liveRecordSetup').click();return;
    }
    return root.AppNotifications.navigate({settings:'settingsUpdates'});
  }});
  const group=document.createElement('details');group.className='settings-group';group.id='settingsUpdates';
  group.innerHTML='<summary>Updates</summary><div class="settings-row"><label class="settings-toggle"><input id="automaticUpdates" type="checkbox" checked><span>Automatic updates</span></label><small>Check and download quietly. You choose when to restart.</small></div><div class="update-settings-status"><strong id="updateInstalledVersion"></strong><p id="updateStatus" role="status"></p><progress id="updateProgress" max="100" value="0" aria-label="Update download progress" hidden></progress><div class="update-settings-actions"><button id="updateCheck" type="button" class="menu-default">Check for updates</button><button id="updateRestart" type="button" class="menu-default" hidden>Restart to install</button></div></div>';
  document.querySelector('.settings-footer').before(group);
  const dialog=document.createElement('dialog');dialog.id='updateRestartDialog';dialog.className='record-dialog update-restart-dialog';dialog.setAttribute('aria-labelledby','updateRestartTitle');
  dialog.innerHTML='<div class="record-heading"><div><p class="eyebrow">UPDATE READY</p><h2 id="updateRestartTitle">A fresh start?</h2></div></div><p id="updateRestartMessage"></p><div class="update-restart-actions"><button id="updateCancelRestart" type="button" autofocus>Later</button><button id="updateDiscardRestart" type="button">Restart without saving</button><button id="updateSaveRestart" type="button">Save & restart</button></div>';
  document.body.append(dialog);
  let state={status:'development',currentVersion:'',automatic:true,message:'Updates are available in the desktop app.'},restartBusy=false,dirtyProject=false,dirtyTemplate=false,notifiedVersion='';
  const blockReason=()=>restartBlockReason({exporting,recording:window.getLiveRecordingActivity?.().state,saving:window.Projects?.isBusy()});
  function render(next){
    if(next)state=next;
    if(state.whatsNew&&state.whatsNew.version===state.currentVersion&&shownHighlights!==state.currentVersion){pendingHighlights=state.whatsNew;clearTimeout(highlightsTimer);highlightsTimer=setTimeout(showHighlights,800);}
    $('automaticUpdates').checked=state.automatic!==false;$('automaticUpdates').disabled=!bridge||state.status==='development';
    $('updateInstalledVersion').textContent=state.currentVersion?'Installed · v'+state.currentVersion:'';
    if(state.currentVersion)$('settingsVersion').textContent='Visualiser Studio · v'+state.currentVersion;
    $('updateStatus').textContent=state.status==='downloading'?'Downloading v'+state.version+' · '+Math.round(state.progress)+'%':state.message||'';
    $('updateProgress').hidden=state.status!=='downloading';$('updateProgress').value=state.progress||0;
    $('updateCheck').disabled=['checking','downloading','installing'].includes(state.status);
    $('updateCheck').textContent=state.status==='checking'?'Checking…':'Check for updates';
    $('updateRestart').hidden=state.status!=='ready';$('updateRestart').disabled=restartBusy;
    if(state.status==='ready'&&state.version&&notifiedVersion!==state.version){notifiedVersion=state.version;root.AppNotifications?.show({key:'update-ready',group:'updates',title:'Update ready',message:'v'+state.version+' has downloaded. Click to choose when to restart.',symbol:'↓',duration:10000,onClick:async()=>{await root.AppNotifications.navigate({settings:"settingsUpdates"});if(state.status==="ready")return requestRestart();}});}
  }
  async function requestRestart(){
    if(restartBusy||state.status!=='ready')return;
    const reason=blockReason();if(reason){updateToast(reason);return;}
    if($('projectSaveDialog')?.open){updateToast('Finish your project save first.');return;}
    if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}
    dirtyProject=!!window.Projects?.isDirty();dirtyTemplate=!dirtyProject&&isActiveTemplateDirty();
    $('updateRestartMessage').textContent=dirtyProject?'Save your project before installing v'+state.version+'?':dirtyTemplate?'Your template has unsaved changes. Keep them before restarting?':liveActive?'Live Audio capture will stop while v'+state.version+' installs.':'The app will close briefly while v'+state.version+' installs.';
    $('updateSaveRestart').hidden=!dirtyProject&&!dirtyTemplate;
    $('updateSaveRestart').textContent=dirtyProject?'Save project & restart':'Save template & restart';
    $('updateDiscardRestart').textContent=dirtyProject||dirtyTemplate?'Restart without saving':'Restart to install';
    if(!dialog.open)dialog.showModal();$('updateCancelRestart').focus();
  }
  async function restart(save){
    if(restartBusy||state.status!=='ready')return;
    const reason=blockReason();if(reason){dialog.close();updateToast(reason);return;}
    restartBusy=true;render();
    try{
      if(save){
        dialog.close();
        if(dirtyProject){if(!await window.Projects.saveAndWait())return;}
        else if(dirtyTemplate){const saved=await saveCurrentAsTemplate();if(!saved||!loadTemplates().some(t=>t.id===activeTemplateId)){updateToast('Your template could not be saved. The update can wait.');return;}}
      }
      const afterSave=blockReason();if(afterSave){updateToast(afterSave);return;}
      const result=await bridge.install();
      if(!result?.ok)updateToast(result?.message||'The update could not be installed. Try again.');
      dialog.close();
    }catch{updateToast('The update could not be installed. Try again.');}
    finally{restartBusy=false;render();}
  }
  $('updateCheck').onclick=async()=>{if(!bridge){updateToast('Open the desktop app to check for updates.');return;}try{render(await bridge.check());}catch{updateToast('Couldn’t check for updates. Try again.');}};
  $('automaticUpdates').onchange=async()=>{const value=$('automaticUpdates').checked;try{render(await bridge.setAutomatic(value));}catch{render();updateToast('Could not save your update preference.');}};
  $('updateRestart').onclick=requestRestart;
  $('updateCancelRestart').onclick=()=>dialog.close();$('updateDiscardRestart').onclick=()=>restart(false);$('updateSaveRestart').onclick=()=>restart(true);
  bridge?.onChange(render);render();bridge?.get().then(render).catch(()=>{});
})(typeof window==='undefined'?globalThis:window);
