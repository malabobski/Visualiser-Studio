(() => {
  const key='visualiserTutorialCompleted-v1';
  const steps=[
    {title:'Make something that feels like your music',text:'A quick tour of Visualiser Studio. You can skip any time, and replay this from Settings.',target:null},
    {title:'Start with a song',text:'Choose audio or drop a file into Create. Ctrl+Shift+O opens the audio picker.',target:'.controls .file'},
    {title:'Find your look',text:'Pick a visual style. Advanced mode in Settings unlocks the Complex styles, with more detailed colour and movement controls.',target:'#styleToggle'},
    {title:'Make it yours',text:'Customise groups the controls into shape, motion, sound response and colour. Preview your changes on the stage.',target:'#presets'},
    {title:'Keep projects and reusable looks',text:'Ctrl+S saves a project, including its audio reference, style and automation. Ctrl+T saves a template. File also has recent projects and the project library.',target:'#fileMenu > summary'},
    {title:'Choose the format, then export',text:'Video size sets the aspect ratio and resolution. Frame rate controls smoothness. When audio is loaded, Export WEBM makes your video.',target:'#sizeToggle'},
    {title:'Listen live',text:'Live shows what is playing and visualises desktop audio. You can customise its look and record it. The sidebar also opens Miniplayer for a smaller player.',target:'[data-screen="live"]'},
    {title:'Make yourself at home',text:'Have fun, try things out, and make something you love.\n\nOh, and one last thing… don’t forget to look for secrets 💜',target:null}
  ];
  let index=0,previousScreen='create',previousFocus=null;
  const dialog=document.createElement('dialog');dialog.id='tutorialDialog';dialog.setAttribute('aria-labelledby','tutorialTitle');dialog.innerHTML='<div class="tutorial-highlight" aria-hidden="true"></div><div class="tutorial-card"><div class="tutorial-top"><span id="tutorialCount"></span><button id="tutorialSkip" type="button">Skip tour</button></div><div class="tutorial-progress" aria-hidden="true"></div><h2 id="tutorialTitle"></h2><p id="tutorialText"></p><div class="tutorial-bottom"><button id="tutorialBack" type="button">Back</button><button id="tutorialNext" type="button">Next →</button></div></div>';document.body.append(dialog);
  const card=dialog.querySelector('.tutorial-card'),highlight=dialog.querySelector('.tutorial-highlight');
  const group=document.createElement('details');group.className='settings-group';group.innerHTML='<summary>Help & guidance</summary><div class="settings-row"><button id="restartTutorial" class="menu-default" type="button">Restart Tutorial</button><small>A quick guided tour of the main screens and controls.</small></div>';
  document.querySelector('.settings-footer').before(group);
  function shouldStart(){try{return localStorage.getItem(key)!=='done';}catch{return false;}}
  function position(){if(!dialog.open)return;const target=steps[index].target?document.querySelector(steps[index].target):null;
    const w=window.innerWidth,h=window.innerHeight,cw=Math.min(380,w-40),ch=card.offsetHeight;card.style.width=cw+'px';let left=(w-cw)/2,top=(h-ch)/2;
    if(target){const r=target.getBoundingClientRect();highlight.hidden=false;Object.assign(highlight.style,{left:Math.max(4,r.left-3)+'px',top:Math.max(4,r.top-3)+'px',width:r.width+6+'px',height:r.height+6+'px'});
      left=Math.max(20,Math.min(w-cw-20,r.left));top=r.bottom+22;if(top+ch>h-20)top=r.top-ch-22;if(top<45){top=Math.max(45,(h-ch)/2);left=r.right+22;if(left+cw>w-20)left=Math.max(20,r.left-cw-22);}
    }else highlight.hidden=true;
    card.style.left=Math.max(20,Math.min(w-cw-20,left))+'px';card.style.top=Math.max(45,Math.min(h-ch-20,top))+'px';
  }
  function show(){const step=steps[index];$('tutorialTitle').textContent=step.title;$('tutorialText').textContent=step.text;$('tutorialCount').textContent=`${index+1} / ${steps.length}`;$('tutorialBack').disabled=index===0;$('tutorialNext').textContent=index===steps.length-1?'Let’s create':'Next →';dialog.querySelector('.tutorial-progress').replaceChildren(...steps.map((_,i)=>{const dot=document.createElement('span');dot.className=i<=index?'active':'';return dot;}));
    const target=step.target?document.querySelector(step.target):null;target?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});requestAnimationFrame(position);
  }
  function start(){if(dialog.open)return;if(document.querySelector('dialog[open]'))return;
    previousFocus=document.activeElement;previousScreen=document.querySelector('[data-screen][aria-current="page"]')?.dataset.screen||'create';
    if(!$('settingsWindow').hidden)$('settingsClose').click();if(!$('presetWindow').hidden)closePresets();$('projectLibrary').hidden=true;$('automationScreen').hidden=true;
    document.querySelector('[data-screen="create"]')?.click();index=0;dialog.showModal();show();$('tutorialNext').focus();
  }
  function finish(){try{localStorage.setItem(key,'done');}catch{}dialog.close();document.querySelector(`[data-screen="${previousScreen}"]`)?.click();if(previousFocus?.isConnected)previousFocus.focus();}
  $('tutorialNext').onclick=()=>{if(index===steps.length-1)finish();else{index++;show();}};$('tutorialBack').onclick=()=>{if(index>0){index--;show();}};$('tutorialSkip').onclick=finish;$('restartTutorial').onclick=start;
  dialog.addEventListener('cancel',e=>{e.preventDefault();finish();});dialog.addEventListener('keydown',e=>e.stopPropagation());window.addEventListener('resize',position);window.addEventListener('scroll',position,true);
  window.addEventListener('keydown',e=>{if(!dialog.open)return;e.stopImmediatePropagation();if((e.ctrlKey||e.metaKey)&&['s','t','o','n','k'].includes(e.key.toLowerCase()))e.preventDefault();if(e.key==='ArrowRight'){e.preventDefault();$('tutorialNext').click();}else if(e.key==='ArrowLeft'){e.preventDefault();$('tutorialBack').click();}},true);
  window.Tutorial={start,shouldStart};
})();
