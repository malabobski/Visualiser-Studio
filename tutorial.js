(() => {
  const store=OnboardingState.create(localStorage),main=document.querySelector('main');
  const intro=[
    {title:'Start with a song.',text:'Choose an audio file below. We’ll reveal the rest together, one little step at a time.',target:'.controls > .file',next:'Choose audio',wait:'audio'},
    {title:'Let’s hear it.',text:'Press play on the stage. This is your space to watch your music come alive.',target:'#previewPlay',next:'Play my song',wait:'play'},
    {title:'Find your look.',text:'Open Style and try a few looks while your song plays. Pick whatever feels right.',target:'#styleToggle',next:'Keep this look'},
    {title:'Give it your colours.',text:'Choose a visualiser colour and a background. Your changes appear on the stage as you make them.',target:'.options > .colour-picker[data-colour-picker="colour"],.options > .colour-picker[data-colour-picker="background"]',next:'Looks good'},
    {title:'Make it feel like your music.',text:'Customise lets you change the shape and response. Try a slider, then come back here when you’re happy.',target:'#presets',next:'Keep going'},
    {title:'Your first look is ready.',text:'Video size sets your frame. Export WEBM turns this look and your audio into a video. You can save reusable looks from File → Save template.',target:'#export',next:'Make yourself at home'}
  ];
  const menus={
    stage:{root:'#stageDesignerDialog',name:'Stage Designer',steps:[
      {title:'Build on your music.',text:'Add text, an image or the track’s artwork. These become layers on your stage.',target:'#stageAddText'},
      {title:'Put everything in its place.',text:'Select a layer on the stage, drag to move it, and use its corner to resize. The layer list lets you place it in front of or behind the visualiser.',target:'.designer-preview'},
      {title:'Give each layer its moment.',text:'Select a layer to set when it appears, when it ends, and its fades. Use the playback controls to check the timing.',target:'.designer-inspector'}
    ]},
    automation:{root:'#automationScreen',name:'Automation',steps:[
      {title:'Let a setting change with the song.',text:'Each track controls one setting. Click its line to add a point, then drag the point to choose a time and value.',target:'#automationTracks'},
      {title:'Find the right moment.',text:'Click or drag the numbered ruler to move the playhead. Ctrl+scroll zooms, and scrolling moves along the song.',target:'#automationRuler'},
      {title:'Choose how the change feels.',text:'Blend moves smoothly between points. Hold keeps a value until the next point. Alt-drag a Blend line to bend its curve.',target:'#automationTracks'}
    ]},
    midi:{root:'#midiSetup',name:'MIDI',steps:[
      {title:'Line the notes up with your music.',text:'The audio stays in place. Adjust the MIDI offset until the notes line up, and click the timeline to listen at that moment.',target:'.midi-alignment'},
      {title:'Give the notes a look.',text:'Choose a MIDI effect and how it sits with your visualiser. Effects change the glow, trails and movement.',target:'#midiVisual'},
      {title:'Make room for each instrument.',text:'Open Instrument tracks to change a track’s colour, timing or octave. The checkbox shows or hides that instrument.',target:'#midiTrackChoices'}
    ]}
  };
  const prompt=document.createElement('aside');prompt.id='tutorialPrompt';prompt.className='tutorial-card';prompt.popover='manual';prompt.setAttribute('aria-label','Getting started');
  prompt.innerHTML='<span class="tutorial-diamond" aria-hidden="true">◈</span><div class="tutorial-copy"><div class="tutorial-top"><span id="tutorialCount"></span><button id="tutorialSkip" type="button">Skip tutorial</button></div><h2 id="tutorialTitle"></h2><p id="tutorialText" aria-live="polite"></p><div class="tutorial-bottom"><div class="tutorial-progress" aria-hidden="true"></div><button id="tutorialBack" type="button">Back</button><button id="tutorialNext" type="button">Next</button></div></div>';
  const highlight=document.createElement('div');highlight.className='tutorial-highlight';highlight.popover='manual';highlight.setAttribute('aria-hidden','true');document.body.append(highlight,prompt);
  const help=document.createElement('details');help.className='settings-group';help.name='visualiser-settings';help.innerHTML='<summary>Help & guidance</summary><div class="settings-row"><button id="restartTutorial" class="menu-default" type="button">Restart introduction</button><small>Start with a song and reveal the basic controls, one step at a time.</small></div><div class="settings-row"><button id="resetMenuGuides" class="menu-default" type="button">Show menu introductions again</button><small id="menuGuideStatus">Menus with tutorials will show you the ropes again</small></div>';document.querySelector('.settings-footer').before(help);
  let active=null,index=0,version=0,highlighted=null,hidden=new Map(),animations=[],previousFocus=null,trackingFrame=null;
  const reduced=()=>document.body.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
  const list=()=>active==='intro'?intro:menus[active]?.steps||[];
  const query=selector=>active==='intro'?document.querySelector(selector):document.querySelector(menus[active].root)?.querySelector(selector);
  const visible=el=>el&&el.isConnected&&el.getClientRects().length&&getComputedStyle(el).visibility!=='hidden';
  function animate(el,frames,duration=600){if(reduced()||!el?.animate)return;if(el===prompt)frames=frames.map(frame=>({...frame,transform:'translateX(-50%) '+(frame.transform==='none'?'':frame.transform||'')}));const animation=el.animate(frames,{duration,easing:'cubic-bezier(.2,.8,.2,1)'});animations.push(animation);animation.finished.catch(()=>{}).finally(()=>{animations=animations.filter(item=>item!==animation);});}
  function setHidden(el,value){
    if(!el)return;if(!hidden.has(el))hidden.set(el,{inert:el.inert,aria:el.getAttribute('aria-hidden')});
    el.toggleAttribute('data-onboarding-hidden',value);el.inert=value||hidden.get(el).inert;
    if(value)el.setAttribute('aria-hidden','true');else{const aria=hidden.get(el).aria;if(aria===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',aria);}
  }
  function reveal(){
    const targets=[...main.querySelectorAll('.options > :not(input),.actions > button')],stage=canvas.closest('.stage');
    const before=new Map([stage,main.querySelector('.controls'),...targets].filter(visible).map(el=>[el,el.getBoundingClientRect()]));
    document.body.dataset.onboardingStep=String(index);
    for(const selector of ['.side-panel','.side-overlay','main > .intro','#fileMenu','#easeEdit','#easeActions','#burgerToggle','#automationOpen'])setHidden(document.querySelector(selector),true);
    document.querySelectorAll('#presetWindow .automation-diamond,#presetWindow .style-setting-diamond').forEach(el=>setHidden(el,true));
    setHidden(main.querySelector('.options'),index<2);setHidden(main.querySelector('.actions'),index<4);
    setHidden($('dropZone'),true);setHidden(main.querySelector('.midi-import-slot'),true);setHidden($('status'),true);
    for(const el of targets){
      const show=el.matches('.style-picker')?index>=2:el.matches('.colour-picker,.complex-colour-button')?index>=3:el.id==='presets'?index>=4:el.matches('.size-picker,[data-picker="framerate"]')||el.id==='export'?index>=5:false;
      setHidden(el,!show);
    }
    for(const selector of ['#previewControls','.ease-seek','.track','.stage-toggles','#previewMeta'])setHidden(stage.querySelector(selector),index<1);
    setHidden($('complexStyleTab'),true);
    for(const el of [stage,main.querySelector('.controls'),...targets].filter(visible)){
      const now=el.getBoundingClientRect(),old=before.get(el);
      if(old&&old.width&&now.width){const dx=old.left-now.left,dy=old.top-now.top;if(Math.abs(dx)+Math.abs(dy)+Math.abs(old.width-now.width)>2)animate(el,[{translate:`${dx}px ${dy}px`,scale:`${old.width/now.width} ${old.height/now.height}`,transformOrigin:'top left'},{translate:'0px 0px',scale:'1 1',transformOrigin:'top left'}]);}
      else animate(el,[{opacity:0,transform:'translateY(12px)',filter:'blur(5px)'},{opacity:1,transform:'none',filter:'blur(0)'}]);
    }
    measure();
  }
  function restore(){for(const [el,prior]of hidden){el.removeAttribute('data-onboarding-hidden');el.inert=prior.inert;if(prior.aria===null)el.removeAttribute('aria-hidden');else el.setAttribute('aria-hidden',prior.aria);}hidden.clear();}
  function measure(){
    if(!active||document.fullscreenElement)return;const height=Math.ceil(prompt.getBoundingClientRect().height);document.body.style.setProperty('--tutorial-prompt-height',height+'px');
    if(active==='intro'){const height=Math.ceil(main.querySelector('.controls').getBoundingClientRect().height);document.body.style.setProperty('--tutorial-controls-height',height+'px');}
    position();
  }
  function position(){
    if(!active||document.fullscreenElement)return;
    const scope=active==='intro'?document:document.querySelector(menus[active].root);
    const customiseOpen=active==='intro'&&index===4&&!$('presetWindow').hidden;
    const selector=customiseOpen?'#styleOptionControls':list()[index].target;
    let targets=[...scope.querySelectorAll(selector)];
    // Closed instrument sections and empty tracks still get a useful, visible anchor.
    targets=targets.map(target=>{const closed=target.closest('details:not([open])');return closed?.querySelector('summary')||closed||target;}).filter(target=>visible(target)&&target.getBoundingClientRect().height>=8);
    if(!targets.length){highlight.hidePopover();highlighted=null;return;}
    const boxes=targets.map(target=>target.getBoundingClientRect()),r={top:Math.min(...boxes.map(b=>b.top)),bottom:Math.max(...boxes.map(b=>b.bottom)),left:Math.min(...boxes.map(b=>b.left)),right:Math.max(...boxes.map(b=>b.right))};
    const top=Math.max(r.top,prompt.getBoundingClientRect().bottom+10),left=Math.max(8,r.left-5),right=Math.min(innerWidth-8,r.right+5),bottom=Math.min(innerHeight-8,r.bottom+5);
    if(bottom<=top||right<=left){highlight.hidePopover();highlighted=null;return;}
    Object.assign(highlight.style,{left:left+'px',top:(top-5)+'px',width:(right-left)+'px',height:(bottom-top+5)+'px'});
    if(!highlight.matches(':popover-open'))highlight.showPopover();highlighted=targets[0];
  }
  function track(){if(!active){trackingFrame=null;return;}position();trackingFrame=requestAnimationFrame(track);}
  function show(){
    if(!active)return;const step=list()[index];if(!step)return;
    $('tutorialTitle').textContent=step.title;$('tutorialText').textContent=step.text;
    $('tutorialCount').textContent=(active==='intro'?'YOUR FIRST LOOK':menus[active].name.toUpperCase())+' · '+(index+1)+' / '+list().length;
    $('tutorialBack').disabled=index===0;$('tutorialNext').textContent=step.next||(index===list().length-1?'Got it':'Next');
    prompt.querySelector('.tutorial-progress').replaceChildren(...list().map((_,i)=>{const dot=document.createElement('span');dot.className=i<=index?'active':'';return dot;}));
    if(active==='intro'){store.intro('in-progress',index);reveal();}
    animate(prompt.querySelector('.tutorial-copy'),[{opacity:.2,transform:'translateY(5px)'},{opacity:1,transform:'none'}],320);
    const token=++version;requestAnimationFrame(()=>{if(token===version)measure();});setTimeout(()=>{if(token===version)position();},450);
  }
  function mount(parent){if(prompt.matches(':popover-open'))prompt.hidePopover();if(highlight.matches(':popover-open'))highlight.hidePopover();parent.append(highlight,prompt);prompt.showPopover();if(trackingFrame===null)trackingFrame=requestAnimationFrame(track);}
  function finish(skipped=false){
    if(!active)return;const was=active,moving=was==='intro'&&postureClosed()?canvas.closest('.stage'):was!=='intro'?document.querySelector(menus[was].root):null;
    const old=visible(moving)?moving.getBoundingClientRect():null;active=null;version++;cancelAnimationFrame(trackingFrame);trackingFrame=null;animations.forEach(animation=>animation.cancel());animations=[];
    if(was==='intro'){
      store.intro(skipped?'skipped':'done',index);if(!postureClosed())closePresets();restore();
      document.body.classList.remove('onboarding-intro');delete document.body.dataset.onboardingStep;
      window.dispatchEvent(new CustomEvent('tutorial-finished',{detail:{kind:'intro'}}));
      animate(main,[{opacity:.65,transform:'translateY(6px)'},{opacity:1,transform:'none'}],650);
      for(const el of [document.querySelector('.side-panel'),...main.querySelectorAll('.actions>button,.options>div')].filter(visible))animate(el,[{opacity:0,transform:'translateY(7px)'},{opacity:1,transform:'none'}],650);
    }else store.tool(was,skipped?'skipped':'done');
    delete document.body.dataset.tutorialTool;prompt.hidePopover();highlight.hidePopover();highlighted=null;
    prompt.classList.remove('tutorial-enter');document.body.append(highlight,prompt);
    document.body.style.removeProperty('--tutorial-prompt-height');document.body.style.removeProperty('--tutorial-controls-height');
    if(old&&visible(moving)){const now=moving.getBoundingClientRect();if(now.width&&now.height)animate(moving,[{translate:`${old.left-now.left}px ${old.top-now.top}px`,scale:`${old.width/now.width} ${old.height/now.height}`,transformOrigin:'top left'},{translate:'0px 0px',scale:'1 1',transformOrigin:'top left'}],700);}
    if(previousFocus?.isConnected&&!previousFocus.closest('[hidden]'))previousFocus.focus({preventScroll:true});
  }
  function postureClosed(){return $('presetWindow').hidden;}
  function start({resume=false}={}){
    if(active||document.querySelector('dialog[open]'))return false;
    previousFocus=document.activeElement;if(!$('settingsWindow').hidden)$('settingsClose').click();if(!postureClosed())closePresets();
    $('projectLibrary').hidden=true;$('automationScreen').hidden=true;document.querySelector('[data-screen="create"]')?.click();
    active='intro';index=resume&&loadedFile?store.snapshot().intro.step:0;
    document.body.classList.add('onboarding-intro');document.documentElement.classList.remove('onboarding-pending');
    mount(document.body);show();animate(prompt,[{opacity:0,transform:'translateY(-14px)'},{opacity:1,transform:'none'}],600);return true;
  }
  function toolOpen(id){const root=document.querySelector(menus[id].root);return root&&(root.matches('dialog')?root.open:!root.hidden);}
  function startTool(id){
    if(active||!store.needsTool(id)||!toolOpen(id))return;
    previousFocus=document.activeElement;active=id;index=0;store.tool(id,'in-progress');document.body.dataset.tutorialTool=id;
    const root=document.querySelector(menus[id].root);mount(root.matches('dialog')?root:document.body);show();animate(prompt,[{opacity:0,transform:'translateY(-14px)'},{opacity:1,transform:'none'}],600);
  }
  function next(){
    if(!active)return;const step=list()[index];
    if(active==='intro'&&step.wait==='audio'&&!loadedFile){$('file').click();return;}
    if(active==='intro'&&step.wait==='play'&&audio.paused){togglePlayback().catch(()=>{$('tutorialText').textContent='Your song isn’t ready to play yet. Try pressing play again in a moment.';});return;}
    if(index===list().length-1){finish();return;}
    if(active==='intro'){closeStyleMenu();closeColourMenus();if(!postureClosed())closePresets();}
    index++;show();
  }
  $('tutorialNext').onclick=next;$('tutorialBack').onclick=()=>{if(index>0){if(active==='intro'&&!postureClosed())closePresets();index--;show();}};$('tutorialSkip').onclick=()=>finish(true);
  $('restartTutorial').onclick=()=>start();$('resetMenuGuides').onclick=()=>{store.resetMenus();$('settingsClose').click();showToast('Menu tutorials are ready. They’ll show you the ropes next time you open them.',{destination:{settings:'resetMenuGuides'}});};
  window.addEventListener('create-audio-loaded',()=>{if(active==='intro'&&index===0){index=1;show();}});
  audio.addEventListener('play',()=>{if(active==='intro'&&index===1){index=2;show();}});
  document.addEventListener('click',event=>{if(active==='intro'&&index===2&&event.target.closest('.style-card')){const token=version;setTimeout(()=>{if(active==='intro'&&index===2&&token===version){index=3;show();}},450);}});
  const watched=new WeakSet();
  function watchMenus(){for(const id of Object.keys(menus)){
    const root=document.querySelector(menus[id].root);if(!root||watched.has(root))continue;watched.add(root);
    new MutationObserver(()=>{if(active===id&&!toolOpen(id))finish(true);else if(!active&&toolOpen(id))startTool(id);}).observe(root,{attributes:true,attributeFilter:['open','hidden']});
  }}
  watchMenus();document.addEventListener('DOMContentLoaded',watchMenus,{once:true});
  new ResizeObserver(measure).observe(prompt);new ResizeObserver(()=>{if(active==='intro')measure();}).observe(main.querySelector('.controls'));
  window.addEventListener('resize',measure);window.addEventListener('scroll',()=>{if(active)position();},true);
  document.addEventListener('fullscreenchange',()=>{if(!active)return;if(document.fullscreenElement){animations.forEach(animation=>animation.cancel());animations=[];highlight.hidePopover();prompt.hidePopover();}else{const root=active==='intro'?document.body:document.querySelector(menus[active].root);mount(root.matches('dialog')?root:document.body);requestAnimationFrame(measure);}});
  document.addEventListener('toggle',()=>{if(active)requestAnimationFrame(position);},true);
  window.addEventListener('keydown',event=>{
    const target=event.target instanceof Element?event.target:document.activeElement||document.body;
    if(active&&prompt.contains(target)&&['Enter',' '].includes(event.key)&&target.matches('button')){event.preventDefault();event.stopImmediatePropagation();if(!event.repeat)target.click();return;}
    if(active&&prompt.contains(target)&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();finish(true);return;}
    if(active!=='intro')return;
    const editing=target.matches('input:not([type=range]):not([type=checkbox]):not([type=file]),textarea,[contenteditable=true]');
    const shortcut=(event.ctrlKey||event.metaKey)&&['s','t','n','o','k',','].includes(event.key.toLowerCase())&&!(event.shiftKey&&event.key.toLowerCase()==='o');
    if(shortcut||!editing&&(event.key==='Tab'||event.altKey||event.code==='KeyF')){event.preventDefault();event.stopImmediatePropagation();}
    if(event.key==='Escape'&&!document.querySelector('dialog[open],.colour-menu:not([hidden]),.style-menu:not([hidden]),.preset-window:not([hidden])')){event.preventDefault();event.stopImmediatePropagation();finish(true);}
  },true);
  window.Tutorial={start,shouldStart:()=>store.shouldStart(),get activeIntro(){return active==='intro';},get active(){return active;},get step(){return index;}};
})();
