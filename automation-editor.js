(() => {
  const clone=x=>JSON.parse(JSON.stringify(x));
  const tracksByStyle={};
  try{const saved=JSON.parse(localStorage.getItem('visualiserAutomationDrafts')||'{}');for(const style of Object.keys(styleParameters))if(saved[style])tracksByStyle[style]=ParameterAutomation.clean(saved[style]);}catch{}
  function persist(){try{localStorage.setItem('visualiserAutomationDrafts',JSON.stringify(tracksByStyle));}catch{}}
  function closeEditor(){persist();screen.hidden=true;drag=undefined;window.dispatchEvent(new Event('automation-saved'));}
  window.addEventListener('beforeunload',persist);let evaluating=false,zoom=1,waveFile,wave=[],decodeVersion=0,history=[],future=[],drag,snapToPlayhead=true;
  const tracks=()=>tracksByStyle[$('style').value]??=[];
  window.Automation={
    resetAll(){for(const key of Object.keys(tracksByStyle))delete tracksByStyle[key];history=[];future=[];waveFile=undefined;wave=[];decodeVersion++;persist();decorate();if(!screen.hidden){screen.hidden=true;drag=undefined;}},
    value(style,index,base){return evaluating?ParameterAutomation.evaluate(tracksByStyle[style]?.find(t=>t.index===index),audio.currentTime,base,styleParameters[style]?.[index]):base;},
    frame(fn){evaluating=true;try{return fn();}finally{evaluating=false;}},
    get(style){return clone(tracksByStyle[style]||[]);},
    set(style,data){tracksByStyle[style]=ParameterAutomation.clean(data);persist();decorate();},
  };
  const screen=document.createElement('section');screen.id='automationScreen';screen.hidden=true;
  screen.innerHTML=`<header class="automation-heading"><div><p class="eyebrow">CREATE · AUTOMATION</p><h1>Shape the song</h1><p>Give each parameter its own movement through time.</p></div><button id="automationClose" type="button">Back to Create ↗</button></header><div class="automation-workspace"><div class="automation-editor"><div class="automation-toolbar"><button id="automationPlay" type="button" aria-label="Play or pause">Play</button><button id="automationUndo" type="button" aria-label="Undo automation edit">Undo</button><button id="automationRedo" type="button" aria-label="Redo automation edit">Redo</button><button id="automationSnap" type="button" aria-pressed="true" data-hint="Snap nodes to the playhead when nearby. Hold Alt to bypass.">Snap to playhead</button><span id="automationTime">0:00 / 0:00</span><label>Zoom<input id="automationZoom" type="range" min="1" max="64" step=".25" value="1"></label></div><p class="automation-help" id="automationHelp" role="status">Click a lane to add a point · Drag to shape it · Right-click a point to remove it</p><div class="automation-scroll" id="automationScroll"><div id="automationTimeline"><div class="automation-ruler" id="automationRuler"></div><div class="automation-wave"><div class="automation-track-label"><strong>Audio</strong><small id="automationAudioName">Choose audio in Create</small></div><canvas id="automationWave" height="100" aria-label="Audio waveform. Click to seek."></canvas></div><div id="automationTracks"></div><div id="automationPlayhead"></div></div></div></div><aside class="automation-preview"><canvas id="automationPreview"></canvas><strong id="automationStyle"></strong><p>Your stage, live as you edit.</p><div class="automation-guide"><strong>A little guidance</strong><p>Ctrl+scroll to zoom. Scroll to pan left/right; Alt+scroll moves between tracks. The waveform is your reference. Each lane beneath it controls just one parameter.</p><p>Higher points mean higher values. Straight lines blend; Hold keeps each value until the next point.</p><p>Diamonds in Customise choose which lanes appear here. Switching one off keeps its points.</p></div></aside></div>`;
  document.body.append(screen);
  const button=document.createElement('button');button.id='automationOpen';button.type='button';button.textContent='◇ Edit automation';button.hidden=true;
  document.querySelector('#presetWindow .style-options').after(button);
  const duration=()=>Number.isFinite(audio.duration)?audio.duration:30;
  const timeText=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
  const historySnapshot=()=>({params:clone(tracks()),midi:window.MidiImport?.getState()?{points:clone(window.MidiImport.getState().tempoPoints),mode:window.MidiImport.getState().tempoMode}:null});
  function checkpoint(){history.push(historySnapshot());if(history.length>80)history.shift();future=[];updateHistory();}
  function updateHistory(){$('automationUndo').disabled=!history.length;$('automationRedo').disabled=!future.length;}
  function travel(back){const from=back?history:future,to=back?future:history;if(!from.length)return;to.push(historySnapshot());const snapshot=from.pop();tracksByStyle[$('style').value]=snapshot.params;if(snapshot.midi&&window.MidiImport?.getState()){const midi=window.MidiImport.getState();midi.tempoPoints=snapshot.midi.points;midi.tempoMode=snapshot.midi.mode;window.MidiImport.changed();}render();decorate();updateHistory();}
  function decorate(){
    const source=$('styleOptionControls');source.querySelectorAll('[data-style-setting]').forEach(input=>{
      const row=input.closest('.style-setting');if(row.querySelector('.automation-diamond'))return;
      const index=Number(input.dataset.styleSetting),diamond=document.createElement('button');diamond.type='button';diamond.className='automation-diamond';diamond.dataset.index=index;
      diamond.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2 14 8 8 14 2 8Z"/></svg>';
      diamond.addEventListener('click',()=>{const existing=tracks().find(t=>t.index===index);if(existing)existing.enabled=!existing.enabled;else tracks().push({index,enabled:true,mode:'linear',points:[{time:0,value:Number(input.value)}]});decorate();});row.append(diamond);
    });
    source.querySelectorAll('.automation-diamond').forEach(b=>{if(!styleParameters[$('style').value][Number(b.dataset.index)])return;const selected=tracks().some(t=>t.index===Number(b.dataset.index)&&t.enabled);b.classList.toggle('selected',selected);b.setAttribute('aria-pressed',String(selected));const name=styleParameters[$('style').value][Number(b.dataset.index)][0];b.setAttribute('aria-label',`${selected?'Disable':'Enable'} ${name} automation`);b.dataset.hint=`${selected?'Disable':'Automate'} ${name}`;});
    button.hidden=!tracks().some(t=>t.enabled);
  }
  new MutationObserver(decorate).observe($('styleOptionControls'),{childList:true,subtree:true});
  new MutationObserver(()=>{history=[];future=[];decorate();}).observe($('styleName'),{childList:true});
  const ns='http://www.w3.org/2000/svg';
  function svgElement(name,attributes){const e=document.createElementNS(ns,name);Object.entries(attributes).forEach(([key,value])=>e.setAttribute(key,value));return e;}
  function coordinates(e,svg,spec){const box=svg.getBoundingClientRect();const rawTime=Math.max(0,Math.min(duration(),(e.clientX-box.left)/box.width*duration()));const snapped=snapToPlayhead&&!e.altKey&&Math.abs(rawTime-audio.currentTime)*box.width/duration()<=10;return {snapped,time:snapped?audio.currentTime:Math.max(0,Math.min(duration(),(e.clientX-box.left)/box.width*duration())),value:Math.max(spec[1],Math.min(spec[2],spec[2]-(e.clientY-box.top-12)/(box.height-24)*(spec[2]-spec[1])))};}
  function quantise(p,spec){p.time=Number(p.time.toFixed(3));p.value=Number((spec[1]+Math.round((p.value-spec[1])/spec[4])*spec[4]).toFixed(6));return p;}
  function drawLane(svg,track,spec){
    svg.replaceChildren();svg._track=track;svg._spec=spec;const w=Math.max(1,svg.clientWidth),h=Math.max(1,svg.clientHeight);svg.setAttribute('viewBox',`0 0 ${w} ${h}`);const x=p=>p.time/duration()*w,y=p=>12+(spec[2]-p.value)/(spec[2]-spec[1])*(h-24);
    for(let i=1;i<4;i++)svg.append(svgElement('line',{x1:0,x2:w,y1:i*h/4,y2:i*h/4,class:'automation-grid'}));
    let d=`M 0 ${y(track.points[0]||{value:track.index===-1?120:valueFor($('style').value,track.index)})}`;
    track.points.forEach((p,i)=>{if(track.mode==='hold'&&i)d+=` H ${x(p)} V ${y(p)}`;else d+=` L ${x(p)} ${y(p)}`;});d+=` H ${w}`;
    svg.append(svgElement('path',{d,class:'automation-line'}));
    track.points.forEach((p,i)=>{const c=svgElement('circle',{cx:x(p),cy:y(p),r:5,class:'automation-point','data-point':i,tabindex:0,role:'button','aria-label':`${spec[0]} ${p.value} at ${timeText(p.time)}. Delete to remove.`});svg.append(c);});
  }
  function render(){
    const root=$('automationTracks');root.replaceChildren();$('automationStyle').textContent=$('styleName').textContent;
    renderMidiNotes();
    const tempo=window.MidiImport?.tempoTrack();
    [...(tempo?[tempo]:[]),...tracks().filter(t=>t.enabled)].forEach(track=>{
      const spec=track.index===-1?['MIDI tempo (BPM)',window.MidiImport.getState().data.tempos.reduce((v,t)=>Math.min(v,t.bpm),20),window.MidiImport.getState().data.tempos.reduce((v,t)=>Math.max(v,t.bpm),400),120,.1]:styleParameters[$('style').value][track.index];if(!spec)return;
      const lane=document.createElement('div');lane.className='automation-lane'+(track.index===-1?' automation-tempo':'');const label=document.createElement('div');label.className='automation-track-label';
      const title=document.createElement('strong');title.textContent=spec[0];const value=document.createElement('small');value.className='automation-current-value';value.dataset.index=track.index;
      const mode=document.createElement('div');mode.className='automation-mode';mode.setAttribute('role','group');mode.setAttribute('aria-label',spec[0]+' interpolation');for(const [kind,name] of [['linear','Blend'],['hold','Hold']]){const choice=document.createElement('button');choice.type='button';choice.textContent=name;choice.setAttribute('aria-pressed',String(track.mode===kind));choice.onclick=()=>{checkpoint();track.mode=kind;if(track.index===-1)window.MidiImport.changed();[...mode.children].forEach(b=>b.setAttribute('aria-pressed',String(b===choice)));drawLane(svg,track,spec);};mode.append(choice);}
      const reset=document.createElement('button');reset.type='button';reset.textContent='Reset lane';reset.onclick=()=>{checkpoint();track.points=[{time:0,value:track.index===-1?window.MidiImport.getState().bpm:valueFor($('style').value,track.index)}];if(track.index===-1)window.MidiImport.changed();drawLane(svg,track,spec);};label.append(title,value,mode,reset);
      const svg=svgElement('svg',{viewBox:'0 0 1000 140',preserveAspectRatio:'none',class:'automation-curve','aria-label':`${spec[0]} automation track`});lane.append(label,svg);root.append(lane);drawLane(svg,track,spec);
      svg.addEventListener('pointerdown',e=>{
        if(e.button!==0)return;e.preventDefault();checkpoint();let point;
        if(e.target.hasAttribute('data-point'))point=track.points[Number(e.target.dataset.point)];else{point=quantise(coordinates(e,svg,spec),spec);track.points.push(point);}
        drag={svg,track,spec,point};svg.setPointerCapture(e.pointerId);pointMove(e);
      });
      svg.addEventListener('pointermove',pointMove);
      svg.addEventListener('pointerup',()=>{drag=undefined;});svg.addEventListener('pointercancel',()=>{drag=undefined;});
      const remove=e=>{if(!e.target.hasAttribute('data-point'))return;e.preventDefault();if(track.index===-1&&track.points.length===1)return;checkpoint();track.points.splice(Number(e.target.dataset.point),1);if(track.index===-1)window.MidiImport.changed();drawLane(svg,track,spec);};svg.addEventListener('contextmenu',remove);svg.addEventListener('keydown',e=>{if(e.key==='Delete'||e.key==='Backspace')remove(e);});
    });
    renderTimeline();updateHistory();
  }
  function pointMove(e){if(!drag||drag.svg!==e.currentTarget)return;const location=coordinates(e,drag.svg,drag.spec);const point=quantise(location,drag.spec);Object.assign(drag.point,{time:location.snapped?audio.currentTime:point.time,value:point.value});drag.track.points.sort((a,b)=>a.time-b.time);if(drag.track.index===-1){MidiEngine.invalidate(window.MidiImport.getState());drawMidiNotes();}drawLane(drag.svg,drag.track,drag.spec);$('automationHelp').textContent=`${drag.spec[0]} · ${drag.point.value} at ${drag.point.time.toFixed(2)}s${location.snapped?' · Snapped to playhead':''}`;}
  function renderTimeline(){
    const viewport=$('automationScroll');$('automationTimeline').style.width=`${Math.max(600,viewport.clientWidth)*zoom}px`;
    screen.querySelectorAll('.automation-curve').forEach(svg=>drawLane(svg,svg._track,svg._spec));
    drawMidiNotes();
    const ruler=$('automationRuler');ruler.replaceChildren();for(let i=0;i<=10;i++){const tick=document.createElement('span');tick.textContent=timeText(duration()*i/10);tick.style.left=`${i*10}%`;ruler.append(tick);}
    const c=$('automationWave');c.width=Math.min(16384,Math.max(400,c.clientWidth*devicePixelRatio));c.height=100*devicePixelRatio;const g=c.getContext('2d');g.fillStyle='#99acdf';
    for(let i=0;i<c.width;i++){const amplitude=wave[Math.floor(i/c.width*wave.length)]||.015;g.fillRect(i,c.height/2-amplitude*c.height*.44,1,Math.max(1,amplitude*c.height*.88));}
  }
  async function loadWave(){
    if(!loadedFile){$('automationAudioName').textContent='Choose audio in Create';$('automationHelp').textContent='Choose an audio file in Create to edit against its waveform.';wave=[];renderTimeline();return;}
    $('automationAudioName').textContent=loadedFile.name||'Your audio';if(waveFile===loadedFile)return;
    const file=loadedFile,version=++decodeVersion;wave=[];$('automationHelp').textContent='Drawing your waveform…';let decoder;
    try{decoder=new AudioContext();const buffer=await decoder.decodeAudioData(await file.arrayBuffer());if(version!==decodeVersion)return;const count=4000,result=new Float32Array(count);for(let channel=0;channel<buffer.numberOfChannels;channel++){const data=buffer.getChannelData(channel);for(let i=0;i<count;i++){const start=Math.floor(i*data.length/count),end=Math.floor((i+1)*data.length/count);for(let j=start;j<end;j++)result[i]=Math.max(result[i],Math.abs(data[j]));}}wave=result;waveFile=file;$('automationHelp').textContent='Click a lane to add a point · Drag to shape it · Right-click a point to remove it';renderTimeline();}
    catch{$('automationHelp').textContent='Waveform unavailable for this file. You can still edit and preview automation.';}finally{if(decoder)await decoder.close();}
  }
  function renderMidiNotes(){screen.querySelector('.midi-notes-lane')?.remove();if(!window.MidiImport?.getState())return;const lane=document.createElement('div');lane.className='midi-notes-lane';lane.innerHTML='<div class="automation-track-label"><strong>MIDI notes</strong><small>Aligned with your audio</small></div>';lane.append(svgElement('svg',{class:'midi-note-svg',preserveAspectRatio:'none'}));$('automationTracks').before(lane);}
  function drawMidiNotes(){const svg=screen.querySelector('.midi-note-svg'),state=window.MidiImport?.getState();if(!svg||!state)return;svg.replaceChildren();const w=Math.max(1,svg.clientWidth),h=140;svg.setAttribute('viewBox',`0 0 ${w} ${h}`);const notes=MidiEngine.timing(state).notes;const min=notes.reduce((v,n)=>Math.min(v,n.pitch),60),max=notes.reduce((v,n)=>Math.max(v,n.pitch),72);const scroll=$('automationScroll'),left=Math.max(0,scroll.scrollLeft-180)/w*duration(),right=(scroll.scrollLeft+scroll.clientWidth)/w*duration();for(const n of notes){if(n.startTime>right)break;if(n.endTime<left)continue;svg.append(svgElement('rect',{x:n.startTime/duration()*w,y:8+(max-n.pitch)/Math.max(1,max-min)*(h-20),width:Math.max(1,(n.endTime-n.startTime)/duration()*w),height:Math.max(2,Math.min(8,(h-20)/Math.max(1,max-min))),rx:1,fill:state.colours[n.track%state.colours.length],opacity:.7}));}}
  function openEditor(){closePresets();screen.hidden=false;window.dispatchEvent(new Event('automation-open'));render();loadWave();}
  window.Automation.openEditor=openEditor;
  window.addEventListener('midi-changed',()=>{if(!screen.hidden)render();});
  window.addEventListener('midi-attached',()=>{history=[];future=[];updateHistory();});
  $('automationScroll').addEventListener('scroll',()=>{if(!screen.hidden)drawMidiNotes();});
  button.onclick=openEditor;
  audio.addEventListener('loadedmetadata',()=>{if(!screen.hidden)render();});
  $('automationClose').onclick=closeEditor;
  $('automationPlay').onclick=()=>{if(loadedFile)togglePlayback();else $('automationHelp').textContent='Choose an audio file in Create first.';};
  $('automationUndo').onclick=()=>travel(true);$('automationRedo').onclick=()=>travel(false);
  function setZoom(value,clientX){
    const viewport=$('automationScroll'),box=viewport.getBoundingClientRect();const anchor=Math.max(180,Math.min(viewport.clientWidth,clientX-box.left));const oldWidth=$('automationTimeline').clientWidth-180;const fraction=(viewport.scrollLeft+anchor-180)/Math.max(1,oldWidth);
    zoom=Math.max(1,Math.min(64,value));$('automationZoom').value=zoom;renderTimeline();viewport.scrollLeft=fraction*($('automationTimeline').clientWidth-180)-anchor+180;
  }
  $('automationZoom').oninput=()=>{const box=$('automationScroll').getBoundingClientRect();setZoom(Number($('automationZoom').value),box.left+box.width/2);};
  $('automationSnap').onclick=()=>{snapToPlayhead=!snapToPlayhead;$('automationSnap').setAttribute('aria-pressed',String(snapToPlayhead));};
  $('automationScroll').addEventListener('wheel',e=>{
    e.preventDefault();const viewport=e.currentTarget;const scale=e.deltaMode===1?16:e.deltaMode===2?viewport.clientWidth:1;
    if(e.ctrlKey||e.metaKey)setZoom(zoom*Math.exp(-e.deltaY*scale*.002),e.clientX);
    else if(e.altKey)viewport.scrollTop+=e.deltaY*scale;
    else viewport.scrollLeft+=(Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY)*scale;
  },{passive:false});
  $('automationWave').onclick=e=>{if(!loadedFile)return;const box=e.currentTarget.getBoundingClientRect();audio.currentTime=Math.max(0,Math.min(duration(),(e.clientX-box.left)/box.width*duration()));};
  screen.addEventListener('keydown',e=>e.stopPropagation());
  document.addEventListener('keydown',e=>{if(screen.hidden)return;if(e.target.matches('input,select')&&e.key!=='Escape'&&!((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())))return;e.stopImmediatePropagation();if(e.key==='Escape'){e.preventDefault();closeEditor();}else if(e.code==='Space'){e.preventDefault();$('automationPlay').click();}else if((e.ctrlKey||e.metaKey)&&['z','y'].includes(e.key.toLowerCase())){e.preventDefault();travel(e.key.toLowerCase()==='z'&&!e.shiftKey);}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();window.Projects?.save();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='t'){e.preventDefault();saveCurrentAsTemplate();}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='i'){e.preventDefault();$('easeSnapshot').click();}},true);
  new ResizeObserver(()=>{if(!screen.hidden)renderTimeline();}).observe($('automationScroll'));
  function tick(){if(!screen.hidden){$('automationTime').textContent=`${timeText(audio.currentTime)} / ${timeText(duration())}`;$('automationPlay').textContent=audio.paused?'Play':'Pause';const timeline=$('automationTimeline');$('automationPlayhead').style.left=`${180+(timeline.clientWidth-180)*audio.currentTime/duration()}px`;screen.querySelectorAll('.automation-current-value').forEach(v=>{const index=Number(v.dataset.index);if(index===-1){v.textContent=window.MidiImport?.getState()?MidiEngine.timing(window.MidiImport.getState()).bpmAt(audio.currentTime).toFixed(1)+' BPM':'';return;}v.textContent=ParameterAutomation.evaluate(tracks().find(t=>t.index===index),audio.currentTime,valueFor($('style').value,index),styleParameters[$('style').value][index]);});const preview=$('automationPreview');if(preview.width!==canvas.width||preview.height!==canvas.height){preview.width=canvas.width;preview.height=canvas.height;}preview.getContext('2d').drawImage(canvas,0,0);}requestAnimationFrame(tick);}tick();decorate();
})();
