// One activity resolver prevents background playback from replacing the
// user's current activity. Discord receives changes, not per-frame updates.
(() => {
  if (!window.discord?.setStatus) return;
  let lastKey = '', refreshTimer;
  const visible = id => { const element=$(id);return !!element && !element.hidden; };
  function activity() {
    const recording=window.getLiveRecordingActivity?.();
    const track=desktopMedia ? `${desktopMedia.artist ? desktopMedia.artist+' — ' : ''}${desktopMedia.title}` : 'Desktop audio';
    const liveStyle=liveLook?.name || (liveLook?.style || $('style').value);
    if(exporting)return {details:'Exporting a visualiser video',state:`${$('title').textContent} · ${$('exportPercent').textContent}`};
    if(recording?.state==='recording')return {details:'Recording live audio',state:`${recording.quality}p · ${recording.fps} FPS · ${track}`};
    if(recording?.state==='paused')return {details:'Live recording paused',state:track};
    if(recording?.state==='saving')return {details:'Saving a live recording',state:`${recording.quality}p · ${recording.fps} FPS`};
    if($('recordPreview').open)return {details:'Reviewing a live recording',state:`${recording?.quality || 1080}p · ${recording?.fps || 60} FPS`};
    if($('recordSetup').open)return {details:'Setting up a live recording',state:`${$('recordQuality').value}p · ${$('recordFps').value} FPS`};
    if(visible('settingsWindow'))return {details:'Adjusting preferences',state:'Visualiser Studio'};
    if(visible('presetWindow'))return {details:'Customising a visualiser',state:$('styleName').textContent};
    if($('albumArtViewer').open)return {details:'Viewing cover art',state:track};
    if(visible('screen-live')) {
      const fullscreen=document.fullscreenElement===$('liveStage');
      if(liveActive)return {details:fullscreen?'Watching a fullscreen visualiser':'Visualising desktop audio',state:desktopMedia?track:liveStyle};
      if($('liveAudioPanel').classList.contains('is-active'))return {details:'Setting up Live Audio',state:liveStyle};
      if(desktopMedia)return {details:desktopMedia.playbackStatus==='Playing'?`Listening on ${mediaSourceName(desktopMedia)}`:`Media paused · ${mediaSourceName(desktopMedia)}`,state:track};
      return {details:'Checking Now Playing',state:'Waiting for media'};
    }
    if(visible('screen-templates'))return {details:'Browsing visualiser templates',state:`${loadTemplates().length} saved templates`};
    if(visible('screen-batch'))return {details:'Exploring Batch Export',state:'Visualiser Studio'};
    if(loadedFile)return {details:audio.paused?'Editing a visualiser':'Previewing a visualiser',state:`${$('title').textContent} · ${$('styleName').textContent}`};
    return {details:'Creating a new visualiser',state:'Choosing audio and a visual style'};
  }
  function refresh() {
    const result=activity(),key=JSON.stringify(result);
    if(key===lastKey)return;
    lastKey=key;window.discord.setStatus(result.details,result.state);
  }
  const schedule=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(refresh,150);};
  ['click','change','fullscreenchange'].forEach(name=>document.addEventListener(name,schedule));
  ['play','pause','ended','loadedmetadata'].forEach(name=>audio.addEventListener(name,schedule));
  setInterval(refresh,1000);refresh();
})();
