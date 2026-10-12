(() => {
  const diamond=document.getElementById('windowDiamond');
  let resetTimer,typed='';
  const reduced=()=>document.body.classList.contains('reduce-motion');
  function particles(kind,count){
    if(reduced())return;
    const layer=document.createElement('div');layer.className='egg-layer';
    (document.fullscreenElement||document.body).append(layer);
    const rect=diamond.getBoundingClientRect();
    for(let i=0;i<count;i++){
      const dot=document.createElement('span');dot.className=`egg-particle egg-${kind}`;
      dot.textContent=kind==='confetti'?'▪':kind==='star'?'✦':'✧';
      const constellation=kind==='constellation';
      dot.style.left=`${constellation?Math.random()*window.innerWidth:rect.left+rect.width/2}px`;
      dot.style.top=`${constellation?60+Math.random()*(window.innerHeight-100):rect.bottom}px`;
      dot.style.setProperty('--egg-x',`${(Math.random()-.5)*360}px`);
      dot.style.setProperty('--egg-y',`${80+Math.random()*200}px`);
      dot.style.setProperty('--egg-delay',`${Math.random()*.3}s`);
      dot.style.color=['#b9a0ff','#ffd594','#a5e8df','#eea5c9'][i%4];layer.append(dot);
    }
    setTimeout(()=>layer.remove(),3200);
  }
  function chime(){
    try{
      const context=new AudioContext();
      [523.25,659.25,783.99].forEach((frequency,i)=>{
        const tone=context.createOscillator(),gain=context.createGain(),start=context.currentTime+i*.12;
        tone.frequency.value=frequency;tone.connect(gain);gain.connect(context.destination);
        gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.06,start+.02);gain.gain.exponentialRampToValueAtTime(.001,start+.4);
        tone.start(start);tone.stop(start+.45);
      });setTimeout(()=>context.close(),1500);
    }catch{}
  }
  function surprise(message,fromDiamond=false){
    if(diamond.classList.contains('egg-gold')&&!fromDiamond){
      if(message==='Secret handshake accepted.')particles('sparkle',12);
      return;
    }
    clearTimeout(resetTimer);diamond.classList.remove('egg-disco','egg-boop','egg-gold');diamond.textContent='◈';
    if(message==='Sparkles!!!!!!'||message.includes('sparkle'))particles('sparkle',22);
    if(message==='You found the party!')particles('confetti',38);
    if(message==='Shh… secret mode.')diamond.textContent='☾';
    if(message==='Boop!'&&!reduced()){void diamond.offsetWidth;diamond.classList.add('egg-boop');}
    if(message==='The pixels are dancing.'&&!reduced()){
      document.querySelectorAll('.side-nav-item svg').forEach((icon,i)=>{icon.classList.add('egg-wiggle');icon.style.animationDelay=`${i*.06}s`;setTimeout(()=>{icon.classList.remove('egg-wiggle');icon.style.animationDelay='';},1400);});
    }
    if(message==='Disco diamond!'&&!reduced())diamond.classList.add('egg-disco');
    if(message==='A shooting star!')particles('star',1);
    if(message==='Make a wish.')particles('constellation',28);
    if(message==='Rare diamond discovered!'){diamond.classList.add('egg-gold');chime();}
    if(message==='Secret handshake accepted.')particles('sparkle',12);
    if(message==='You unlocked: absolutely nothing ♥'){
      const badge=document.createElement('div');badge.className='egg-achievement';badge.textContent='🏆 Achievement unlocked · Absolutely nothing';document.body.append(badge);setTimeout(()=>badge.remove(),3500);
    }
    if(message!=='Rare diamond discovered!')resetTimer=setTimeout(()=>{diamond.textContent='◈';diamond.classList.remove('egg-disco','egg-boop');},3500);
  }
  window.addEventListener('diamond-surprise',e=>surprise(e.detail,true));
  document.addEventListener('keydown',e=>{
    if(e.ctrlKey||e.metaKey||e.altKey||e.target.closest('input,textarea,select,[contenteditable],dialog[open]'))return;
    if(e.key.length!==1)return;typed=(typed+e.key.toLowerCase()).slice(-8);
    if(typed==='sparkles'){typed='';showToast('Secret handshake accepted.');surprise('Secret handshake accepted.');}
  });
  // A returning visitor gets a quiet greeting on their first diamond click.
  try{
    const visits=Number(localStorage.getItem('visualiserDiamondVisits')||0)+1;
    localStorage.setItem('visualiserDiamondVisits',String(visits));
    if(visits>1)diamond.addEventListener('click',()=>{if(visits%5===0)setTimeout(()=>showToast('You again? ♥'),100);},{once:true});
  }catch{}
  const fanfare=new Audio('assets/disco-fanfare.mp3');
  const emptyRecord=document.getElementById('emptyRecord');let recordTimer,recordFadeTimer;
  const recordFace=document.createElement('span');recordFace.className='egg-cd-face';recordFace.setAttribute('aria-hidden','true');emptyRecord.append(recordFace);
  emptyRecord.addEventListener('click',()=>{
    clearTimeout(recordTimer);clearTimeout(recordFadeTimer);emptyRecord.classList.remove('egg-cd','egg-cd-fading');void emptyRecord.offsetWidth;emptyRecord.classList.add('egg-cd');
    recordTimer=setTimeout(()=>{
      emptyRecord.classList.add('egg-cd-fading');
      recordFadeTimer=setTimeout(()=>emptyRecord.classList.remove('egg-cd','egg-cd-fading'),450);
    },2400);
  });
  let defaultPresses=[];
  document.getElementById('returnToDefault').addEventListener('click',()=>{
    if(document.getElementById('screen-templates').hidden)return;
    const now=performance.now();
    defaultPresses=defaultPresses.filter(time=>now-time<=1800);
    defaultPresses.push(now);
    if(defaultPresses.length<5)return;
    defaultPresses=[];
    window.dispatchEvent(new Event('disco-unlocked'));
  });
  window.addEventListener('disco-unlocked',()=>{
    const list=loadTemplates();
    if(!list.some(t=>t.id==='secret-disco')){
      list.push({...defaultLook(),id:'secret-disco',name:'Disco',style:'orbit',params:[.22,140,1.7],colour:'#e88dff',background:'#160e28',response:'punchy'});
      saveTemplatesList(list);renderTemplatesScreen();refreshLiveTemplates();
    }
    fanfare.currentTime=0;fanfare.play().catch(()=>{});showToast('Disco preset discovered! 🪩');particles('confetti',30);
    document.querySelector('[data-template-id="secret-disco"]')?.scrollIntoView({block:'nearest',behavior:reduced()?'instant':'smooth'});
  });
  const heading=document.querySelector('#screen-live h2');let headingTimer;
  heading?.addEventListener('dblclick',()=>{clearTimeout(headingTimer);heading.textContent='Alive';headingTimer=setTimeout(()=>heading.textContent='Live',1800);});
  document.addEventListener('pointerdown',e=>{
    const art=e.target.closest('.media-art');
    if(art&&document.getElementById('nowPlayingArt').hidden&&!reduced()){
      art.classList.remove('egg-record');void art.offsetWidth;art.classList.add('egg-record');setTimeout(()=>art.classList.remove('egg-record'),1800);
    }
  },true);
  window.addEventListener('visualiser-export-complete',()=>{
    try{const count=Number(localStorage.getItem('visualiserCompletedExports')||0)+1;localStorage.setItem('visualiserCompletedExports',String(count));if(count===100){showToast('100 exports! Your pixels deserve a party.');particles('confetti',70);}}catch{}
  });
  let sleepTimer;
  audio.addEventListener('pause',()=>{clearTimeout(sleepTimer);sleepTimer=setTimeout(()=>{if(audio.paused&&audio.currentTime>0){const sleep=document.createElement('span');sleep.id='eggSleeping';sleep.setAttribute('aria-label','Sleeping');for(let i=0;i<3;i++){const z=document.createElement('span');z.textContent='z';z.setAttribute('aria-hidden','true');z.style.setProperty('--sleep-delay',`${i*.6}s`);sleep.append(z);}sleep.className='egg-sleeping';document.querySelector('main .stage').append(sleep);}},20000);});
  audio.addEventListener('play',()=>{clearTimeout(sleepTimer);document.getElementById('eggSleeping')?.remove();});
  const credits=document.createElement('dialog');credits.className='egg-credits';credits.setAttribute('aria-label','Visualiser Studio credits');
  const close=document.createElement('button');close.type='button';close.className='egg-credits-close';close.textContent='×';close.setAttribute('aria-label','Close credits');close.onclick=()=>credits.close();
  const viewport=document.createElement('div');viewport.className='egg-credits-viewport';
  const roll=document.createElement('div');roll.className='egg-credits-roll';
  const title=document.createElement('h2');title.textContent='Visualiser Studio';roll.append(title);
  ['Creator','Design','Development','Creative direction','Audio engineering','Animation','Visual effects','Quality assurance','Template design','Easter egg department','Chief sparkle officer','Disco supervisor','Pixel wrangler','Late-night debugging','Moral support','Everything else'].forEach(role=>{
    const entry=document.createElement('p'),label=document.createElement('span'),name=document.createElement('strong');label.textContent=role;name.textContent='malchim';entry.append(label,name);roll.append(entry);
  });
  const end=document.createElement('p');end.textContent='Made with love · malchim';roll.append(end);viewport.append(roll);credits.append(close,viewport);document.body.append(credits);
  document.getElementById('settingsVersion').onclick=()=>{credits.showModal();roll.style.animation='none';void roll.offsetWidth;roll.style.animation='';viewport.scrollTop=0;};
  credits.addEventListener('click',e=>{const r=credits.getBoundingClientRect();if(e.target===credits&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))credits.close();});
})();
// A secret arrow sequence exists only while Keyboard shortcuts is open.
(() => {
  const windowEl=document.getElementById('shortcutsDialog'),card=windowEl.querySelector('.shortcuts-card');
  const sequence=['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight'];
  let progress=0,lastPress=0,running=false;
  const reset=()=>{progress=0;lastPress=0;};
  function sound(){
    try{const context=new AudioContext();context.resume().catch(()=>{});
      [523.25,659.25,783.99,1046.5,783.99,1046.5,1318.51,1567.98].forEach((frequency,i)=>{
        const start=context.currentTime+i*.065,tone=context.createOscillator(),gain=context.createGain();tone.type='triangle';tone.frequency.setValueAtTime(frequency,start);gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(.045,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+.2);tone.connect(gain);gain.connect(context.destination);tone.start(start);tone.stop(start+.22);
      });setTimeout(()=>context.close().catch(()=>{}),1100);
    }catch{}
  }
  function celebrate(){
    if(running)return;running=true;sound();
    const reduced=document.body.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
    const effect=document.createElement('div');effect.className='shortcut-secret-effect';effect.setAttribute('aria-hidden','true');document.body.append(effect);
    const rect=card.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
    const ring=document.createElement('span');ring.className='shortcut-secret-ring';ring.style.left=x+'px';ring.style.top=y+'px';effect.append(ring);
    if(!reduced)for(let i=0;i<20;i++){const dot=document.createElement('span');dot.className='shortcut-secret-key';dot.textContent=['↑','↓','←','→','✦'][i%5];dot.style.left=x+'px';dot.style.top=y+'px';const angle=i/20*Math.PI*2,distance=120+Math.random()*170;dot.style.setProperty('--secret-x',Math.cos(angle)*distance+'px');dot.style.setProperty('--secret-y',Math.sin(angle)*distance+'px');dot.style.setProperty('--secret-rotation',(Math.random()-.5)*100+'deg');dot.style.color=['#baacee','#8bbbd5','#e4b9d1'][i%3];effect.append(dot);}
    const frames=reduced?[{boxShadow:'0 0 0 #bba7eb00'},{boxShadow:'0 0 30px #bba7eb55'},{boxShadow:'0 0 0 #bba7eb00'}]:[{transform:'rotate(0deg) scale(1)',offset:0},{transform:'rotate(180deg) scale(.96)',offset:.5},{transform:'rotate(360deg) scale(1)',offset:1}];
    const spin=card.animate(frames,{duration:reduced?550:1050,easing:'cubic-bezier(.4,0,.2,1)'});
    spin.finished.catch(()=>{}).finally(()=>{effect.remove();running=false;});
  }
  document.addEventListener('keydown',event=>{
    if(windowEl.hidden){reset();return;}if(!sequence.includes(event.key)||event.ctrlKey||event.altKey||event.metaKey){reset();return;}
    event.preventDefault();event.stopImmediatePropagation();if(event.repeat||running)return;
    const now=performance.now();if(now-lastPress>750)progress=0;lastPress=now;
    if(event.key===sequence[progress])progress++;else progress=event.key===sequence[0]?(progress===2?2:1):0;
    if(progress===sequence.length){reset();celebrate();}
  },true);
  new MutationObserver(()=>{if(windowEl.hidden)reset();}).observe(windowEl,{attributes:true,attributeFilter:['hidden']});window.addEventListener('blur',reset);
})();
