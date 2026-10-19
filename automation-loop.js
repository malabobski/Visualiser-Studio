(() => {
  const screen=$('automationScreen'),wave=$('automationWave');
  const lane=document.createElement('div');lane.className='automation-loop-lane';
  lane.innerHTML='<div class="automation-track-label"><button id="automationRegionToggle" type="button" aria-pressed="false">Loop selection</button><button id="automationRegionClear" type="button" title="Clear loop selection" aria-label="Clear loop selection">×</button></div><div class="automation-loop-body" aria-label="Drag to select a loop"><span class="automation-loop-hint">Drag here to loop part of the song</span><div class="automation-loop-range" hidden><button type="button" data-loop-edge="start" aria-label="Move loop start"></button><span></span><button type="button" data-loop-edge="end" aria-label="Move loop end"></button></div></div>';
  document.querySelector('.automation-wave').before(lane);
  const body=lane.querySelector('.automation-loop-body'),region=lane.querySelector('.automation-loop-range'),toggle=$('automationRegionToggle');
  let selection=null,enabled=false,drag=null,suppressClick=false;
  const duration=()=>Number.isFinite(audio.duration)?audio.duration:30;
  const format=t=>`${Math.floor(t/60)}:${(t%60).toFixed(2).padStart(5,'0')}`;
  function render(){region.hidden=!selection;lane.classList.toggle('loop-enabled',enabled);toggle.setAttribute('aria-pressed',String(enabled));$('automationRegionClear').disabled=!selection;lane.querySelector('.automation-loop-hint').hidden=!!selection;if(selection){region.style.left=selection.start/duration()*100+'%';region.style.width=(selection.end-selection.start)/duration()*100+'%';region.querySelector('span').textContent=format(selection.start)+' – '+format(selection.end);region.title='Drag to move loop · Drag edges to resize';}}
  function set(start,end,on=true){const length=duration(),min=Math.min(.1,length);start=Math.max(0,Math.min(length-min,Number(start)||0));end=Math.max(start+min,Math.min(length,Number(end)||0));selection={start,end};enabled=on;render();}
  function time(e,target){const r=target.getBoundingClientRect();let t=Math.max(0,Math.min(duration(),(e.clientX-r.left)/r.width*duration()));if(!e.altKey&&$('automationSnap').getAttribute('aria-pressed')==='true'){const points=[0,duration(),audio.currentTime,...(window.StyleTransition?.get()?.sections||[]).map(s=>s.start)];const near=points.reduce((a,b)=>Math.abs(b-t)<Math.abs(a-t)?b:a,points[0]);if(Math.abs(near-t)*r.width/duration()<10)t=near;}return t;}
  function down(e,target){if(e.button!==0||!loadedFile)return;e.preventDefault();e.stopImmediatePropagation();const t=time(e,target),edge=e.target.dataset.loopEdge;drag={target,anchor:t,original:selection&&{...selection},mode:edge||(e.target.closest('.automation-loop-range')?'move':'new')};target.setPointerCapture(e.pointerId);if(drag.mode==='new')set(t,t+.1);}
  function move(e){if(!drag)return;const t=time(e,drag.target),old=drag.original;if(drag.mode==='new')set(Math.min(drag.anchor,t),Math.max(drag.anchor,t));else if(drag.mode==='start')set(Math.min(t,old.end-.1),old.end);else if(drag.mode==='end')set(old.start,Math.max(t,old.start+.1));else{const span=old.end-old.start,start=Math.max(0,Math.min(duration()-span,old.start+t-drag.anchor));set(start,start+span);}}
  function finish(){if(!drag)return;suppressClick=drag.target===wave;drag=null;}
  body.addEventListener('pointerdown',e=>down(e,body));
  wave.addEventListener('pointerdown',e=>{if(e.shiftKey)down(e,wave);},true);
  for(const target of [body,wave]){target.addEventListener('pointermove',move);target.addEventListener('pointerup',finish);target.addEventListener('pointercancel',finish);target.addEventListener('lostpointercapture',finish);}
  wave.addEventListener('click',e=>{if(suppressClick){suppressClick=false;e.preventDefault();e.stopImmediatePropagation();}},true);
  toggle.onclick=()=>{if(!selection){$('automationHelp').textContent='Drag in the loop lane, Shift-drag the waveform, or choose Loop section.';return;}enabled=!enabled;render();};
  const clear=()=>{selection=null;enabled=false;drag=null;render();};$('automationRegionClear').onclick=clear;
  function active(){return enabled&&selection&&!screen.hidden&&loadedFile;}
  function enforce(){if(active()&&!audio.paused&&(audio.currentTime>=selection.end||audio.currentTime<selection.start))audio.currentTime=selection.start;}
  audio.addEventListener('play',enforce);audio.addEventListener('timeupdate',enforce);
  audio.addEventListener('ended',()=>{if(active()){audio.currentTime=selection.start;audio.play().catch(()=>{});}});
  function tick(){enforce();requestAnimationFrame(tick);}tick();
  window.AutomationLoop={set,get:()=>selection?{...selection,enabled}:null,clear};
  window.addEventListener('create-audio-loaded',clear);window.addEventListener('project-new',clear);audio.addEventListener('loadedmetadata',clear);
  render();
})();
