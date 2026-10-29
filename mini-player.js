(() => {
  const $=id=>document.getElementById(id),format=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  let media=null,scrubbing=false,noticeTimer,drag,resizeFrame,volumeControl;
  const titleViewport=$('miniTitle'),titleText=document.createElement('span');
  titleText.className='mini-title-text';titleText.textContent=titleViewport.textContent;titleViewport.replaceChildren(titleText);
  const reducedMotion=window.matchMedia('(prefers-reduced-motion: reduce)');
  let titleAnimation,titleFrame,titleSignature='';
  function updateTitleScroll() {
    const width=titleViewport.clientWidth,textWidth=titleText.scrollWidth;
    const signature=JSON.stringify([titleText.textContent,width,textWidth,reducedMotion.matches]);
    if(signature===titleSignature)return;
    titleSignature=signature;titleAnimation?.cancel();titleAnimation=null;
    const distance=Math.max(0,textWidth-width),scrolling=width>0&&distance>1&&!reducedMotion.matches;
    titleViewport.classList.toggle('is-scrolling',scrolling);
    if(!scrolling)return;
    // Keep a constant, gentle speed regardless of the length of the title.
    const hold=1600,travel=distance/24*1000,endHold=1200,fade=500,reset=50;
    const duration=hold+travel+endHold+fade+reset+fade;
    const end=`translateX(-${distance}px)`;
    titleAnimation=titleText.animate([
      {transform:'translateX(0)',opacity:1,offset:0},
      {transform:'translateX(0)',opacity:1,offset:hold/duration},
      {transform:end,opacity:1,offset:(hold+travel)/duration},
      {transform:end,opacity:1,offset:(hold+travel+endHold)/duration},
      {transform:end,opacity:0,offset:(hold+travel+endHold+fade)/duration},
      {transform:'translateX(0)',opacity:0,offset:(duration-fade)/duration},
      {transform:'translateX(0)',opacity:1,offset:1}
    ],{duration,iterations:Infinity,easing:'linear'});
  }
  function scheduleTitleScroll(){cancelAnimationFrame(titleFrame);titleFrame=requestAnimationFrame(updateTitleScroll);}
  const titleObserver=new ResizeObserver(scheduleTitleScroll);
  titleObserver.observe(titleViewport);titleObserver.observe(titleText);
  reducedMotion.addEventListener('change',scheduleTitleScroll);
  document.fonts.ready.then(scheduleTitleScroll);
  const notice=text=>{$('miniNotice').textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('miniNotice').textContent='',3500);};
  const trackSurfaces=[document.querySelector('.mini-meta'),document.querySelector('.mini-art')];
  let trackKey,trackVersion=0,trackTransition=false,trackAnimations=[];
  function renderMetadata() {
    const nextTitle=media?.title||'Nothing playing right now';
    if(titleText.textContent!==nextTitle){titleText.textContent=nextTitle;scheduleTitleScroll();}
    $('miniArtist').textContent=media?.artist||'';
    $('miniTitle').title=$('miniTitle').textContent;$('miniArtist').title=$('miniArtist').textContent;
    $('miniSource').textContent=media?mediaSourceName(media):'NOW PLAYING';$('miniState').textContent=media?.playbackStatus||'';
    $('miniArt').hidden=!media?.artwork;if(media?.artwork && $('miniArt').src!==media.artwork)$('miniArt').src=media.artwork;
  }
  async function transitionTrack() {
    const version=++trackVersion;
    const opacities=trackSurfaces.map(element=>getComputedStyle(element).opacity);
    trackAnimations.forEach(animation=>animation.cancel());trackAnimations=[];
    if(reducedMotion.matches){trackTransition=false;renderMetadata();return;}
    trackTransition=true;
    try {
      trackAnimations=trackSurfaces.map((element,index)=>element.animate([
        {opacity:opacities[index]},{opacity:0}
      ],{duration:180,easing:'ease-out',fill:'forwards'}));
      await Promise.all(trackAnimations.map(animation=>animation.finished));
      if(version!==trackVersion)return;
      // Read the latest metadata after fading, so quick skips never reveal an older song.
      titleAnimation?.cancel();titleSignature='';renderMetadata();scheduleTitleScroll();
      const artwork=$('miniArt');
      if(!artwork.hidden){
        await Promise.race([artwork.decode().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,300))]);
      }
      if(version!==trackVersion)return;
      trackAnimations.forEach(animation=>animation.cancel());
      trackAnimations=trackSurfaces.map(element=>element.animate([
        {opacity:0},{opacity:1}
      ],{duration:320,easing:'ease-in-out',fill:'forwards'}));
      await Promise.all(trackAnimations.map(animation=>animation.finished));
      if(version!==trackVersion)return;
      trackAnimations.forEach(animation=>animation.cancel());trackAnimations=[];
      trackTransition=false;renderMetadata();
    } catch(error) {
      // Cancelling an animation during a rapid track change rejects its finished promise.
      if(version===trackVersion){
        trackAnimations.forEach(animation=>animation.cancel());trackAnimations=[];
        trackTransition=false;renderMetadata();
      }
    }
  }
  reducedMotion.addEventListener('change',()=>{if(trackTransition)transitionTrack();});
  function render(data) {
    media=data?.title?data:null;
    const nextKey=JSON.stringify([media?.title,media?.artist,media?mediaSourceName(media):'']);
    const changed=trackKey!==undefined&&nextKey!==trackKey;trackKey=nextKey;
    if(changed)transitionTrack();else if(!trackTransition)renderMetadata();
    const duration=Math.max(0,(Number(media?.end)||0)-(Number(media?.start)||0)),elapsed=Math.max(0,Math.min(duration,(Number(media?.position)||0)-(Number(media?.start)||0)));
    const seek=$('miniSeek');seek.max=duration||1;seek.disabled=!duration||!media?.canSeek;
    if(!scrubbing){seek.value=elapsed;seek.style.setProperty('--progress',duration?elapsed/duration*100+'%':'0%');$('miniElapsed').textContent=format(elapsed);}
    $('miniDuration').textContent='/ '+(duration?format(duration):'—:—');
    $('miniBack').disabled=!media?.canPrevious;$('miniSkip').disabled=!media?.canNext;
    $('miniRewind').disabled=seek.disabled;$('miniForward').disabled=seek.disabled;$('miniPlay').disabled=!media?.canToggle;
    volumeControl?.sourceChanged();
    const symbol=media?.playbackStatus==='Playing'?'Ⅱ':'▶';if($('miniPlay').textContent!==symbol)$('miniPlay').textContent=symbol;
  }
  async function control(action,position){try{if(!await window.nowPlaying.control(action,position))notice('This action is unavailable in the media app.');}catch{notice('Could not control this media app.');}}
  const seekBy=amount=>{if(media?.canSeek)control('seek',Math.max(Number(media.start)||0,Math.min(Number(media.end)||0,(Number(media.position)||0)+amount)));};
  $('miniBack').onclick=()=>control('previous');$('miniSkip').onclick=()=>control('next');$('miniPlay').onclick=()=>control('toggle');$('miniRewind').onclick=()=>seekBy(-10);$('miniForward').onclick=()=>seekBy(10);
  $('miniSeek').oninput=()=>{scrubbing=true;$('miniSeek').style.setProperty('--progress',Number($('miniSeek').value)/Number($('miniSeek').max)*100+'%');$('miniElapsed').textContent=format(Number($('miniSeek').value));};
  $('miniSeek').onchange=()=>{scrubbing=false;const pos=Number($('miniSeek').value)+(Number(media?.start)||0);if(media)media.position=pos;render(media);control('seek',pos);};
  $('miniSeek').onblur=()=>{scrubbing=false;render(media);};
  volumeControl=MediaVolumeControl.mount({slider:$('miniVolume'),output:$('miniVolumeValue'),select:$('miniVolumeTarget'),hint:$('miniVolumeHint'),getSource:()=>media,isActive:()=>!document.hidden,onNotice:notice});
  window.nowPlaying.onChange(render);window.nowPlaying.get().then(render).catch(()=>render(null));
  const layout=()=>{
    const compact=window.innerHeight<=220||(window.innerWidth<=380&&window.innerHeight<=280);
    const enteredCompact=compact&&!document.body.classList.contains('mini-compact');
    document.body.classList.toggle('mini-compact',compact);
    document.body.classList.toggle('portrait',!compact&&window.innerHeight>window.innerWidth*.95);
    if(enteredCompact&&!drag)window.miniPlayer.action('compact-size');
  };
  window.addEventListener('resize',layout);layout();
  $('miniFull').onclick=()=>window.miniPlayer.action('full');$('miniQuit').onclick=()=>window.miniPlayer.action('quit');
  const opacity=()=>{const value=Number($('miniOpacity').value);$('miniOpacityValue').textContent=value+'%';window.miniPlayer.action('opacity',value/100);try{localStorage.setItem('miniPlayerOpacity',String(value));}catch{}};
  try{const saved=Number(localStorage.getItem('miniPlayerOpacity'));if(saved>=35&&saved<=100)$('miniOpacity').value=saved;}catch{}
  $('miniOpacity').oninput=opacity;opacity();
  document.addEventListener('click',event=>{if(!event.target.closest('#miniOptions'))$('miniOptions').open=false;});
  document.addEventListener('pointerdown',event=>{
    if($('miniOptions').open&&event.target.closest('.resize-arc')){event.preventDefault();event.stopImmediatePropagation();return;}
    if(!event.target.closest('#miniOptions'))$('miniOptions').open=false;
  },true);
  $('miniOptions').addEventListener('keydown',event=>{if([' ', 'Enter'].includes(event.key))event.stopPropagation();});
  const finish=event=>{
    if(!drag || event.pointerId!==drag.id)return;
    const old=drag;drag=null;cancelAnimationFrame(resizeFrame);
    // Flush the final pointer position before deciding whether to collapse.
    if(old.target)window.miniPlayer.resize(old.target);
    const width=old.target?.width??window.innerWidth,height=old.target?.height??window.innerHeight;
    if(height<=220||(width<=380&&height<=280))window.miniPlayer.action('compact-size',old.corner);
    old.button.classList.remove('resizing');
    if(old.button.hasPointerCapture(old.id))old.button.releasePointerCapture(old.id);
  };
  const settingsMenu=document.querySelector('.mini-options-menu');settingsMenu.setAttribute('popover','manual');
  const settingsHeading=document.createElement('div');settingsHeading.className='mini-settings-heading';settingsHeading.innerHTML='<strong>Player settings</strong><button type="button" aria-label="Close settings">×</button>';settingsHeading.querySelector('button').onclick=()=>{$('miniOptions').open=false;};
  const settingsBody=document.createElement('div');settingsBody.className='mini-settings-body';
  settingsBody.append(settingsMenu.querySelector('.mini-volume-target'),$('miniVolumeHint'),$('miniOpacity').closest('label'));
  const settingsActions=document.createElement('div');settingsActions.className='mini-settings-actions';settingsActions.append($('miniFull'),$('miniQuit'));settingsMenu.append(settingsHeading,settingsBody,settingsActions);
  $('miniOptions').addEventListener('toggle',()=>{const open=$('miniOptions').open;document.body.classList.toggle('mini-settings-open',open);if(open){if(drag)finish({pointerId:drag.id});settingsMenu.showPopover();}else settingsMenu.hidePopover();});
  document.querySelectorAll('.resize-arc').forEach(button=>{
    button.addEventListener('pointerdown',async event=>{
      if(event.button!==0||$('miniOptions').open)return;event.preventDefault();
      const current={id:event.pointerId,x:event.screenX,y:event.screenY,button,corner:button.dataset.corner};drag=current;
      button.setPointerCapture(event.pointerId);button.classList.add('resizing');
      current.bounds=await window.miniPlayer.bounds();
    });
    button.addEventListener('pointermove',event=>{
      if(!drag?.bounds || event.pointerId!==drag.id)return;
      const current=drag,dx=event.screenX-current.x,dy=event.screenY-current.y,b=current.bounds,left=current.corner.includes('l'),top=current.corner.includes('t');
      const width=Math.max(280,Math.min(1800,b.width+(left?-dx:dx))),height=Math.max(104,Math.min(1400,b.height+(top?-dy:dy)));
      current.target={x:left?b.x+b.width-width:b.x,y:top?b.y+b.height-height:b.y,width,height};
      cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(drag===current)window.miniPlayer.resize(current.target);});
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>button.addEventListener(name,finish));
    button.addEventListener('dblclick',()=>{if(drag)finish({pointerId:drag.id});window.miniPlayer.action('default-size');});
    button.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();window.miniPlayer.action('default-size');}});
  });
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&$('miniOptions').open){$('miniOptions').open=false;return;}
    if(event.target.matches('input') || $('miniOptions').open)return;
    if(event.code==='Space'){event.preventDefault();if(media?.canToggle)control('toggle');}
    if(event.key.toLowerCase()==='q')seekBy(-10);if(event.key.toLowerCase()==='e')seekBy(10);
  });
})();
