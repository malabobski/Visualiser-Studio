(function(root){
  function restartBlockReason({exporting=false,recording='',saving=false}={}){
    if(exporting)return 'Finish or cancel the video export before installing your update.';
    if(['recording','paused','saving','review'].includes(recording))return 'Save or discard your recording before installing your update.';
    if(saving)return 'Finish saving your project before installing your update.';
    return '';
  }
  if(typeof module!=='undefined'&&module.exports){module.exports={restartBlockReason};return;}
  const bridge=window.appUpdates;
  const group=document.createElement('details');group.className='settings-group';group.id='settingsUpdates';
  group.innerHTML='<summary>Updates</summary><div class="settings-row"><label class="settings-toggle"><input id="automaticUpdates" type="checkbox" checked><span>Automatic updates</span></label><small>Check and download quietly. You choose when to restart.</small></div><div class="update-settings-status"><strong id="updateInstalledVersion"></strong><p id="updateStatus" role="status"></p><progress id="updateProgress" max="100" value="0" aria-label="Update download progress" hidden></progress><div class="update-settings-actions"><button id="updateCheck" type="button" class="menu-default">Check for updates</button><button id="updateRestart" type="button" class="menu-default" hidden>Restart to install</button></div></div>';
  document.querySelector('.settings-footer').before(group);
  const notice=document.createElement('aside');notice.id='updateNotice';notice.className='update-notice';notice.hidden=true;notice.setAttribute('aria-label','App update');
  notice.innerHTML='<div><strong>A fresh version is ready</strong><span id="updateNoticeVersion"></span></div><button id="updateNoticeRestart" type="button">Restart to install</button><button id="updateNoticeLater" type="button" aria-label="Remind me later">×</button>';
  document.body.append(notice);
  const dialog=document.createElement('dialog');dialog.id='updateRestartDialog';dialog.className='record-dialog update-restart-dialog';dialog.setAttribute('aria-labelledby','updateRestartTitle');
  dialog.innerHTML='<div class="record-heading"><div><p class="eyebrow">UPDATE READY</p><h2 id="updateRestartTitle">A fresh start?</h2></div></div><p id="updateRestartMessage"></p><div class="update-restart-actions"><button id="updateCancelRestart" type="button" autofocus>Later</button><button id="updateDiscardRestart" type="button">Restart without saving</button><button id="updateSaveRestart" type="button">Save & restart</button></div>';
  document.body.append(dialog);
  let state={status:'development',currentVersion:'',automatic:true,message:'Updates are available in the desktop app.'},restartBusy=false,dirtyProject=false,dirtyTemplate=false,dismissed='';
  try{dismissed=localStorage.getItem('visualiserDismissedUpdate')||'';}catch{}
  const blockReason=()=>restartBlockReason({exporting,recording:window.getLiveRecordingActivity?.().state,saving:window.Projects?.isBusy()});
  function render(next){
    if(next)state=next;
    $('automaticUpdates').checked=state.automatic!==false;$('automaticUpdates').disabled=!bridge;
    $('updateInstalledVersion').textContent=state.currentVersion?'Installed · v'+state.currentVersion:'';
    if(state.currentVersion)$('settingsVersion').textContent='Visualiser Studio · v'+state.currentVersion;
    $('updateStatus').textContent=state.status==='downloading'?'Downloading v'+state.version+' · '+Math.round(state.progress)+'%':state.message||'';
    $('updateProgress').hidden=state.status!=='downloading';$('updateProgress').value=state.progress||0;
    $('updateCheck').disabled=['checking','downloading','installing'].includes(state.status);
    $('updateCheck').textContent=state.status==='checking'?'Checking…':'Check for updates';
    $('updateRestart').hidden=state.status!=='ready';$('updateRestart').disabled=restartBusy;
    const ready=state.status==='ready'&&dismissed!==state.version;
    notice.hidden=!ready;$('updateNoticeVersion').textContent='v'+state.version+' · Install whenever it suits you.';
    $('updateNoticeRestart').disabled=restartBusy;
  }
  async function requestRestart(){
    if(restartBusy||state.status!=='ready')return;
    const reason=blockReason();if(reason){showToast(reason);return;}
    if($('projectSaveDialog')?.open){showToast('Finish your project save first.');return;}
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
    const reason=blockReason();if(reason){dialog.close();showToast(reason);return;}
    restartBusy=true;render();
    try{
      if(save){
        dialog.close();
        if(dirtyProject){if(!await window.Projects.saveAndWait())return;}
        else if(dirtyTemplate){saveCurrentAsTemplate();if(!loadTemplates().some(t=>t.id===activeTemplateId)){showToast('Your template could not be saved. The update can wait.');return;}}
      }
      const afterSave=blockReason();if(afterSave){showToast(afterSave);return;}
      const result=await bridge.install();
      if(!result?.ok)showToast(result?.message||'The update could not be installed. Try again.');
      dialog.close();
    }catch{showToast('The update could not be installed. Try again.');}
    finally{restartBusy=false;render();}
  }
  $('updateCheck').onclick=async()=>{if(!bridge){showToast('Open the desktop app to check for updates.');return;}try{render(await bridge.check());}catch{showToast('Couldn’t check for updates. Try again.');}};
  $('automaticUpdates').onchange=async()=>{const value=$('automaticUpdates').checked;try{render(await bridge.setAutomatic(value));}catch{render();showToast('Could not save your update preference.');}};
  $('updateRestart').onclick=requestRestart;$('updateNoticeRestart').onclick=requestRestart;
  $('updateNoticeLater').onclick=()=>{dismissed=state.version;try{localStorage.setItem('visualiserDismissedUpdate',dismissed);}catch{}render();};
  $('updateCancelRestart').onclick=()=>dialog.close();$('updateDiscardRestart').onclick=()=>restart(false);$('updateSaveRestart').onclick=()=>restart(true);
  bridge?.onChange(render);render();bridge?.get().then(render).catch(()=>{});
})(typeof window==='undefined'?globalThis:window);
