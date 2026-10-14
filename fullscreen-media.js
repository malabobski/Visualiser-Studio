(() => {
  const stage=$('liveStage'),card=$('nowPlayingCard'),art=$('albumArtOpen'),options=$('mediaOptions');
  const menu=options.querySelector('.media-options-menu'),mode=$('fullscreenPlayerMode');
  const restore=document.createElement('button');restore.id='restoreFullscreenPlayer';restore.type='button';restore.className='stage-toggle';restore.textContent='Show player';restore.title='Bring back the fullscreen media player';restore.hidden=true;
  stage.querySelector('.live-stage-toolbar').prepend(restore);
  let lastVisibleMode=mode.value==='pinned'?'pinned':'auto';
  const preference='visualiserFullscreenOverlay';
  let settings={size:72};
  try{const saved=JSON.parse(localStorage.getItem(preference)||'{}');if([56,72,88].includes(saved.size))settings.size=saved.size;}catch{}
  const modeLabel=mode.closest('label');modeLabel.className='fullscreen-overlay-setting';modeLabel.firstChild.textContent='Fullscreen player';
  mode.options[0].textContent='Cover art · click for controls';mode.options[1].textContent='Keep controls expanded';mode.options[2].textContent='Hide in fullscreen';menu.append(modeLabel);
  const extra=document.createElement('div');extra.className='fullscreen-overlay-settings';
  extra.innerHTML='<label>Cover size<select id="fullscreenCoverSize"><option value="56">Small</option><option value="72">Medium</option><option value="88">Large</option></select></label>';menu.append(extra);
  $('fullscreenCoverSize').value=settings.size;
  let readyTimer,expanded=false,coverDrag=null,draggedUntil=0;
  const fullscreen=()=>document.fullscreenElement===stage;
  const reduced=()=>document.body.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
  function controlsReady(ready){card.classList.toggle('media-controls-ready',ready);for(const child of card.children)if(child!==art)child.inert=fullscreen()&&!ready;}
  function clampPlayer(){
    if(!fullscreen()||coverDrag||card.classList.contains('player-dragging'))return;
    const bounds=stage.getBoundingClientRect(),r=card.getBoundingClientRect();
    if(!r.width||!r.height)return;
    const left=Math.max(16,Math.min(bounds.width-r.width-16,r.left-bounds.left));
    const top=Math.max(16,Math.min(bounds.height-r.height-16,r.top-bounds.top));
    if(Math.abs(left-(r.left-bounds.left))>.5||Math.abs(top-(r.top-bounds.top))>.5){card.style.left='auto';card.style.top='auto';card.style.right=Math.max(16,bounds.width-left-r.width)+'px';card.style.bottom=Math.max(16,bounds.height-top-r.height)+'px';}
  }
  function expand(){
    if(!fullscreen()||mode.value==='hidden'||expanded)return;
    expanded=true;card.classList.add('media-expanded');clearTimeout(readyTimer);
    readyTimer=setTimeout(()=>{if(expanded&&fullscreen()){controlsReady(true);clampPlayer();}},reduced()?0:340);
  }
  function collapse(){
    if(!fullscreen()||mode.value==='pinned')return;
    options.open=false;expanded=false;clearTimeout(readyTimer);controlsReady(false);card.classList.remove('media-expanded');
  }
  function finishCoverDrag(event){
    if(!coverDrag||(event?.pointerId!=null&&event.pointerId!==coverDrag.id))return;
    const old=coverDrag;coverDrag=null;if(old.moved)draggedUntil=performance.now()+250;
    if(art.hasPointerCapture(old.id))art.releasePointerCapture(old.id);
    card.classList.remove('cover-moving');
  }
  function sync(){
    finishCoverDrag();clearTimeout(readyTimer);expanded=false;
    stage.classList.toggle('fullscreen-media-stage',fullscreen());card.classList.remove('media-expanded');controlsReady(!fullscreen());
    restore.hidden=!fullscreen()||mode.value!=='hidden';
    card.style.setProperty('--media-cover-size',settings.size+'px');
    art.disabled=fullscreen()?false:$('nowPlayingArt').hidden;art.setAttribute('aria-label',fullscreen()?'Drag to move; click for media controls':'View cover art');
    if(fullscreen()&&mode.value==='pinned')expand();
  }
  art.addEventListener('pointerdown',event=>{
    if(!fullscreen()||event.button!==0)return;event.preventDefault();
    const rect=card.getBoundingClientRect();coverDrag={id:event.pointerId,x:event.clientX,y:event.clientY,right:rect.right,bottom:rect.bottom,moved:false};
    art.setPointerCapture(event.pointerId);
  });
  art.addEventListener('pointermove',event=>{
    if(!coverDrag||event.pointerId!==coverDrag.id)return;
    const dx=event.clientX-coverDrag.x,dy=event.clientY-coverDrag.y;
    if(!coverDrag.moved&&Math.hypot(dx,dy)<6)return;
    coverDrag.moved=true;card.classList.add('cover-moving');
    const bounds=stage.getBoundingClientRect();
    card.style.left='auto';card.style.top='auto';
    card.style.right=Math.max(16,Math.min(bounds.width-card.offsetWidth-16,bounds.right-coverDrag.right-dx))+'px';
    card.style.bottom=Math.max(16,Math.min(bounds.height-card.offsetHeight-16,bounds.bottom-coverDrag.bottom-dy))+'px';
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])art.addEventListener(name,finishCoverDrag);
  window.addEventListener('pointerup',finishCoverDrag);window.addEventListener('pointercancel',finishCoverDrag);
  window.addEventListener('blur',()=>finishCoverDrag());window.addEventListener('dragend',()=>finishCoverDrag());
  art.addEventListener('click',event=>{if(!fullscreen())return;event.preventDefault();if(performance.now()<draggedUntil)return;if(expanded)collapse();else expand();});
  document.addEventListener('pointerdown',event=>{if(fullscreen()&&expanded&&!card.contains(event.target)&&!event.target.closest('.unified-menu'))collapse();});
  options.addEventListener('toggle',()=>{if(options.open)expand();});
  document.addEventListener('fullscreenchange',sync);mode.addEventListener('change',()=>{if(mode.value!=='hidden')lastVisibleMode=mode.value;options.open=false;sync();});
  restore.addEventListener('click',()=>{mode.value=lastVisibleMode;mode.dispatchEvent(new Event('change',{bubbles:true}));art.focus({preventScroll:true});});
  $('fullscreenCoverSize').addEventListener('change',()=>{settings.size=Number($('fullscreenCoverSize').value);card.style.setProperty('--media-cover-size',settings.size+'px');try{localStorage.setItem(preference,JSON.stringify(settings));}catch{}});
  new ResizeObserver(clampPlayer).observe(card);
  // A top-layer settings panel stays clickable outside the animated card's bounds.
  menu.setAttribute('popover','manual');
  function positionMenu(){
    if(!options.open||!menu.matches(':popover-open'))return;
    const r=options.querySelector('summary').getBoundingClientRect(),width=Math.min(280,innerWidth-32);
    menu.style.width=width+'px';menu.style.maxHeight=Math.max(80,innerHeight-32)+'px';
    const height=menu.getBoundingClientRect().height;
    menu.style.left=Math.max(16,Math.min(innerWidth-width-16,r.right-width))+'px';
    menu.style.top=Math.max(16,Math.min(innerHeight-height-16,r.top-height-10))+'px';
  }
  options.addEventListener('toggle',()=>{if(options.open){menu.style.visibility='hidden';menu.showPopover();requestAnimationFrame(()=>{positionMenu();menu.style.visibility='';});}else menu.hidePopover();});
  new ResizeObserver(positionMenu).observe(menu);
  card.addEventListener('transitionend',positionMenu);
  window.addEventListener('resize',()=>{if(options.open)positionMenu();});
  document.addEventListener('fullscreenchange',()=>menu.hidePopover());sync();
  window.nowPlaying?.onChange(()=>{if(fullscreen())art.disabled=false;});
})();
