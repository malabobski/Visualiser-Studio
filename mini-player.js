(() => {
  const $=id=>document.getElementById(id),format=seconds=>`${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)).padStart(2,'0')}`;
  let media=null,scrubbing=false,noticeTimer,drag,resizeFrame;
  const notice=text=>{$('miniNotice').textContent=text;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('miniNotice').textContent='',3500);};
  function render(data) {
    media=data?.title?data:null;
    $('miniTitle').textContent=media?.title||'Nothing playing right now';$('miniArtist').textContent=media?.artist||'';
    $('miniSource').textContent=media?mediaSourceName(media):'NOW PLAYING';$('miniState').textContent=media?.playbackStatus||'';
    $('miniArt').hidden=!media?.artwork;if(media?.artwork && $('miniArt').src!==media.artwork)$('miniArt').src=media.artwork;
    const duration=Math.max(0,(Number(media?.end)||0)-(Number(media?.start)||0)),elapsed=Math.max(0,Math.min(duration,(Number(media?.position)||0)-(Number(media?.start)||0)));
    const seek=$('miniSeek');seek.max=duration||1;seek.disabled=!duration||!media?.canSeek;
    if(!scrubbing){seek.value=elapsed;seek.style.setProperty('--progress',duration?elapsed/duration*100+'%':'0%');$('miniElapsed').textContent=format(elapsed);}
    $('miniDuration').textContent='/ '+(duration?format(duration):'—:—');
    $('miniBack').disabled=!media?.canPrevious;$('miniSkip').disabled=!media?.canNext;
    $('miniRewind').disabled=seek.disabled;$('miniForward').disabled=seek.disabled;$('miniPlay').disabled=!media?.canToggle;
    const symbol=media?.playbackStatus==='Playing'?'Ⅱ':'▶';if($('miniPlay').textContent!==symbol)$('miniPlay').textContent=symbol;
  }
  async function control(action,position){try{if(!await window.nowPlaying.control(action,position))notice('This action is unavailable in the media app.');}catch{notice('Could not control this media app.');}}
  const seekBy=amount=>{if(media?.canSeek)control('seek',Math.max(Number(media.start)||0,Math.min(Number(media.end)||0,(Number(media.position)||0)+amount)));};
  $('miniBack').onclick=()=>control('previous');$('miniSkip').onclick=()=>control('next');$('miniPlay').onclick=()=>control('toggle');$('miniRewind').onclick=()=>seekBy(-10);$('miniForward').onclick=()=>seekBy(10);
  $('miniSeek').oninput=()=>{scrubbing=true;$('miniSeek').style.setProperty('--progress',Number($('miniSeek').value)/Number($('miniSeek').max)*100+'%');$('miniElapsed').textContent=format(Number($('miniSeek').value));};
  $('miniSeek').onchange=()=>{scrubbing=false;const pos=Number($('miniSeek').value)+(Number(media?.start)||0);if(media)media.position=pos;render(media);control('seek',pos);};
  $('miniSeek').onblur=()=>{scrubbing=false;render(media);};
  window.nowPlaying.onChange(render);window.nowPlaying.get().then(render).catch(()=>render(null));
  const layout=()=>document.body.classList.toggle('portrait',window.innerHeight>window.innerWidth*.95);
  window.addEventListener('resize',layout);layout();
  $('miniFull').onclick=()=>window.miniPlayer.action('full');$('miniQuit').onclick=()=>window.miniPlayer.action('quit');
  const opacity=()=>{const value=Number($('miniOpacity').value);$('miniOpacityValue').textContent=value+'%';window.miniPlayer.action('opacity',value/100);try{localStorage.setItem('miniPlayerOpacity',String(value));}catch{}};
  try{const saved=Number(localStorage.getItem('miniPlayerOpacity'));if(saved>=35&&saved<=100)$('miniOpacity').value=saved;}catch{}
  $('miniOpacity').oninput=opacity;opacity();
  document.addEventListener('click',event=>{if(!event.target.closest('#miniOptions'))$('miniOptions').open=false;});
  const finish=event=>{if(!drag || event.pointerId!==drag.id)return;const old=drag;drag=null;cancelAnimationFrame(resizeFrame);old.button.classList.remove('resizing');if(old.button.hasPointerCapture(old.id))old.button.releasePointerCapture(old.id);};
  document.querySelectorAll('.resize-arc').forEach(button=>{
    button.addEventListener('pointerdown',async event=>{
      if(event.button!==0)return;event.preventDefault();
      const current={id:event.pointerId,x:event.screenX,y:event.screenY,button,corner:button.dataset.corner};drag=current;
      button.setPointerCapture(event.pointerId);button.classList.add('resizing');
      current.bounds=await window.miniPlayer.bounds();
    });
    button.addEventListener('pointermove',event=>{
      if(!drag?.bounds || event.pointerId!==drag.id)return;
      const current=drag,dx=event.screenX-current.x,dy=event.screenY-current.y,b=current.bounds,left=current.corner.includes('l'),top=current.corner.includes('t');
      const width=Math.max(340,Math.min(1800,b.width+(left?-dx:dx))),height=Math.max(220,Math.min(1400,b.height+(top?-dy:dy)));
      cancelAnimationFrame(resizeFrame);resizeFrame=requestAnimationFrame(()=>{if(drag===current)window.miniPlayer.resize({x:left?b.x+b.width-width:b.x,y:top?b.y+b.height-height:b.y,width,height});});
    });
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>button.addEventListener(name,finish));
    button.addEventListener('dblclick',()=>{if(drag)finish({pointerId:drag.id});window.miniPlayer.action('default-size');});
    button.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();window.miniPlayer.action('default-size');}});
  });
  document.addEventListener('keydown',event=>{
    if(event.target.matches('input') || $('miniOptions').open)return;
    if(event.code==='Space'){event.preventDefault();if(media?.canToggle)control('toggle');}
    if(event.key.toLowerCase()==='q')seekBy(-10);if(event.key.toLowerCase()==='e')seekBy(10);
  });
})();
