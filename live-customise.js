(() => {
  const defaults=()=>({style:'bars',params:styleParameters.bars.map(p=>p[3]),colour:'#ff7a18',background:'#0b0d16',response:'balanced',low:20,high:20000});
  const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}};
  const write=(key,value)=>{try{localStorage.setItem(key,JSON.stringify(value));}catch{}};
  liveLook={...defaults(),...(liveLook||{}),...read('visualiserLiveCustomise',{})};
  function normalise(){
    delete liveLook.beat;delete liveLook.strength;delete liveLook.tempo;
    if(!styleParameters[liveLook.style])liveLook.style='bars';
    liveLook.params=styleParameters[liveLook.style].map((p,i)=>clamp(Number.isFinite(Number(liveLook.params?.[i]))?Number(liveLook.params[i]):p[3],p[1],p[2]));
    liveLook.low=clamp(Number(liveLook.low)||20,20,19990);
    liveLook.high=clamp(Number(liveLook.high)||20000,liveLook.low+10,24000);
  }
  normalise();
  const dialog=$('liveCustomiseDialog');let song='';
  const stage=$('liveStage'), workspace=document.createElement('div'), editor=document.createElement('div'), scroll=document.createElement('div'), stagePane=document.createElement('div');
  workspace.className='live-customise-workspace';editor.className='live-customise-editor';scroll.className='live-customise-scroll';stagePane.className='live-customise-stage-pane';
  stagePane.setAttribute('role','region');stagePane.setAttribute('aria-label','Live audio stage');
  editor.append(dialog.querySelector('.record-heading'));
  scroll.append(...dialog.children);editor.append(scroll);workspace.append(editor,stagePane);dialog.append(workspace);
  dialog.setAttribute('aria-labelledby','liveCustomiseTitle');dialog.querySelector('h2').id='liveCustomiseTitle';
  let stageHome=null,opening=false,closing=false,setupVersion=0,motionVersion=0,stageAnimation=null;
  const reducedMotion=()=>document.body.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
  function restoreStage(){if(!stageHome)return;const {parent,next}=stageHome;if(next?.parentNode===parent)parent.insertBefore(stage,next);else parent.append(stage);stageHome=null;}
  async function stageTransition(change){
    const version=++motionVersion,opacity=Number(getComputedStyle(stage).opacity);
    stageAnimation?.cancel();stageAnimation=null;
    if(reducedMotion()){change();return;}
    const fadeOut=stage.animate([{opacity},{opacity:0}],{duration:260,easing:'ease',fill:'forwards'});stageAnimation=fadeOut;
    await fadeOut.finished.catch(()=>{});if(version!==motionVersion)return;
    try{change();}catch(error){fadeOut.cancel();stageAnimation=null;throw error;}
    const fadeIn=stage.animate([{opacity:0},{opacity:1}],{duration:260,easing:'ease',fill:'forwards'});stageAnimation=fadeIn;fadeOut.cancel();
    await fadeIn.finished.catch(()=>{});if(version===motionVersion){fadeIn.cancel();stageAnimation=null;}
  }
  async function openCustomise(){
    if(opening||closing||dialog.open)return;opening=true;const version=++setupVersion;render();
    if(document.fullscreenElement===stage){try{await document.exitFullscreen();}catch{opening=false;return;}}
    if(version!==setupVersion)return;
    try{await stageTransition(()=>{if(version!==setupVersion)return;stageHome={parent:stage.parentNode,next:stage.nextSibling};stagePane.append(stage);dialog.showModal();requestAnimationFrame(()=>{if(dialog.open&&!closing)dialog.classList.add('is-visible');});});}
    finally{if(version===setupVersion)opening=false;}
  }
  async function closeCustomise(){
    if(closing)return;closing=true;opening=false;const version=++setupVersion;dialog.classList.remove('is-visible');
    try{await stageTransition(()=>{if(version!==setupVersion)return;restoreStage();if(dialog.open)dialog.close();});}
    finally{if(version===setupVersion)closing=false;}
  }
  dialog.addEventListener('cancel',event=>{event.preventDefault();closeCustomise();});
  dialog.addEventListener('close',()=>{if(dialog.open)return;restoreStage();dialog.classList.remove('is-visible');opening=false;closing=false;});
  const rgbPickers=[];
  document.querySelectorAll('[data-live-colour]').forEach(picker=>{
    const input=$(picker.dataset.liveColour),button=picker.querySelector('button'),menu=picker.querySelector('.live-rgb-menu');
    const channels=['R','G','B'].map((name,index)=>{
      const row=document.createElement('span');row.className='live-rgb-row';
      const label=document.createElement('span');label.textContent=name;
      const slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=255;slider.step=1;slider.setAttribute('aria-label',`${input.id==='liveColour'?'Visual':'Background'} ${name}`);
      const output=document.createElement('output');row.append(label,slider,output);menu.append(row);
      slider.oninput=()=>{input.value='#'+channels.map(c=>Number(c.slider.value).toString(16).padStart(2,'0')).join('');input.dispatchEvent(new Event('change'));};
      return {slider,output,index};
    });
    const sync=()=>{const hex=input.value.slice(1);channels.forEach(c=>{c.slider.value=parseInt(hex.slice(c.index*2,c.index*2+2),16);c.output.value=c.slider.value;});button.querySelector('i').style.background=input.value;};
    button.onclick=e=>{e.preventDefault();const open=menu.hidden;rgbPickers.forEach(p=>{p.menu.hidden=true;p.button.setAttribute('aria-expanded','false');});menu.hidden=!open;button.setAttribute('aria-expanded',String(open));};
    rgbPickers.push({menu,button,sync});
  });
  document.addEventListener('click',e=>{if(!e.target.closest('.live-rgb-picker'))rgbPickers.forEach(p=>{p.menu.hidden=true;p.button.setAttribute('aria-expanded','false');});});
  dialog.addEventListener('keydown',e=>{if(e.key==='Escape'&&rgbPickers.some(p=>!p.menu.hidden)){e.preventDefault();e.stopPropagation();rgbPickers.forEach(p=>{p.menu.hidden=true;p.button.setAttribute('aria-expanded','false');});}});
  const persist=()=>{normalise();write('visualiserLiveCustomise',liveLook);write('visualiserLiveTemplate',$('liveTemplate').value);};
  function refreshStyles(){
    $('liveStyle').replaceChildren();
    Object.keys(styleParameters).filter(style=>appSettings.advanced||!ComplexStyles.names[style]).forEach(style=>$('liveStyle').add(new Option(ComplexStyles.names[style]||style[0].toUpperCase()+style.slice(1),style)));
  }
  refreshStyles();
  window.addEventListener('advanced-mode-changed',()=>{
    refreshStyles();if(!appSettings.advanced&&ComplexStyles.names[liveLook.style]){liveLook.style='bars';liveLook.params=styleParameters.bars.map(p=>p[3]);}persist();render();
  });
  function render(){
    normalise();
    for(const [id,key] of Object.entries({liveStyle:'style',liveResponse:'response',liveColour:'colour',liveBackground:'background',liveLow:'low',liveHigh:'high'}))$(id).value=liveLook[key];
    rgbPickers.forEach(p=>p.sync());
    $('liveParameters').replaceChildren();
    styleParameters[liveLook.style].forEach((p,i)=>{
      const label=document.createElement('label');label.className='live-param';label.textContent=p[0];
      const input=document.createElement('input'),output=document.createElement('output');
      input.type='range';input.min=p[1];input.max=p[2];input.step=p[4];input.value=liveLook.params[i];input.setAttribute('aria-label',p[0]);output.value=input.value;
      input.oninput=()=>{liveLook.params[i]=Number(input.value);output.value=input.value;persist();};
      label.append(input,output);$('liveParameters').append(label);
    });
  }
  $('liveCustomiseOpen').onclick=openCustomise;
  $('liveCustomiseClose').onclick=closeCustomise;
  let backdropPressed=false;
  dialog.addEventListener('pointerdown',event=>{backdropPressed=[dialog,workspace,stagePane].includes(event.target);});
  dialog.addEventListener('click',event=>{if(backdropPressed&&[dialog,workspace,stagePane].includes(event.target))closeCustomise();backdropPressed=false;});
  $('liveStyle').onchange=()=>{liveLook.style=$('liveStyle').value;liveLook.params=styleParameters[liveLook.style].map(p=>p[3]);$('liveTemplate').value='';persist();render();};
  for(const [id,key] of Object.entries({liveResponse:'response',liveColour:'colour',liveBackground:'background',liveLow:'low',liveHigh:'high'}))$(id).addEventListener('change',()=>{
    liveLook[key]=['low','high'].includes(key)?Number($(id).value):$(id).value;liveBandHistory=undefined;persist();render();
  });
  $('liveAlbumTheme').value=read('visualiserLiveAlbumTheme','dark');
  $('liveRandomSong').checked=read('visualiserLiveRandomSong',false);
  $('liveAlbumTheme').onchange=()=>write('visualiserLiveAlbumTheme',$('liveAlbumTheme').value);
  $('liveAlbumColours').addEventListener('change',()=>{$('liveAlbumTheme').disabled=!$('liveAlbumColours').checked;});
  $('liveAlbumTheme').disabled=!$('liveAlbumColours').checked;
  $('liveRandomSong').onchange=()=>write('visualiserLiveRandomSong',$('liveRandomSong').checked);
  document.addEventListener('click',e=>{if(!e.target.closest('.live-effects'))document.querySelector('.live-effects').open=false;});
  $('liveCustomiseReset').onclick=()=>{liveLook=defaults();$('liveTemplate').value='';persist();render();};
  window.liveCustomise={
    templateChanged(){liveLook={...defaults(),...liveLook};liveLook.low=liveLook.rangeLow??liveLook.low;liveLook.high=liveLook.rangeHigh??liveLook.high;persist();render();},
    mediaChanged(data){
      if(!data)return;
      const key=[data.sourceAppId,data.title,data.artist].join('|');if(key===song)return;song=key;
      if($('liveRandomSong').checked){
        const styles=Object.keys(styleParameters).filter(s=>s!==liveLook.style&&(appSettings.advanced||!ComplexStyles.names[s]));liveLook.style=styles[Math.floor(Math.random()*styles.length)];
        liveLook.params=styleParameters[liveLook.style].map(p=>Number((p[1]+Math.round(Math.random()*(p[2]-p[1])/p[4])*p[4]).toFixed(3)));
        $('liveTemplate').value='';persist();render();
      }
    },

  };
  render();
})();
