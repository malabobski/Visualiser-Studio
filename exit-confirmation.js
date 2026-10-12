(() => {
  if(!window.windowControls?.onExitRequested)return;
  const dialog=document.createElement('dialog');dialog.className='exit-dialog';
  dialog.setAttribute('aria-labelledby','exitTitle');dialog.setAttribute('aria-describedby','exitMessage');
  dialog.innerHTML='<p class="eyebrow">VISUALISER STUDIO</p><h2 id="exitTitle">Ready to leave?</h2><p id="exitMessage"></p><div class="exit-actions"><button id="exitCancel" type="button" autofocus>Keep creating</button><button id="exitConfirm" type="button">Exit app</button></div>';
  document.body.append(dialog);
  $('exitCancel').onclick=()=>dialog.close();
  $('exitConfirm').onclick=()=>{dialog.close();window.windowControls.confirmExit();};
  window.windowControls.onExitRequested(async()=>{
    if(dialog.open){$('exitCancel').focus();return;}
    if(document.fullscreenElement)try{await document.exitFullscreen();}catch{}
    const recording=window.getLiveRecordingActivity?.();
    $('exitMessage').textContent=exporting?'A video is exporting. Exiting will stop it.':recording&&['recording','paused','saving'].includes(recording.state)?'A recording is still in progress. Exiting will lose any unsaved recording.':isActiveTemplateDirty()?'Your current template has unsaved changes. Exit anyway?':'Close Visualiser Studio?';
    dialog.showModal();$('exitCancel').focus();
  });
})();
