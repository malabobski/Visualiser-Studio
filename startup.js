(() => {
  const destination=appSettings.startupScreen||'create';
  const nav=name=>document.querySelector(`[data-screen="${name}"]`)?.click();
  requestAnimationFrame(()=>{
    if(window.Tutorial?.shouldStart()){window.Tutorial.start();return;}
    if(['create','templates','batch'].includes(destination))nav(destination);
    else if(destination==='projects'){nav('create');window.Projects?.openLibrary();}
    else if(destination==='live'||destination==='liveaudio'){nav('live');document.querySelector(`[data-live-view="${destination==='liveaudio'?'liveaudio':'nowplaying'}"]`)?.click();}
    else if(destination==='settings'){nav('create');$('settingsToggle').click();}
    else if(destination==='miniplayer'){nav('live');window.miniPlayer?.open().catch(()=>{nav('create');$('status').textContent='Miniplayer could not open. You can open it from the sidebar.';});}
    else nav('create');
  });
})();
