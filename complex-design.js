(() => {
  try{const saved=JSON.parse(localStorage.getItem('visualiserComplexDesigns')||'{}');Object.assign(ComplexStyles.designs,saved);Object.values(ComplexStyles.designs).forEach(d=>{if(Array.isArray(d.colours)&&d.customColours===undefined)d.customColours=true;});}catch{}
  const save=()=>{try{localStorage.setItem('visualiserComplexDesigns',JSON.stringify(ComplexStyles.designs));}catch{}};
  let motionPreferences={};
  try{motionPreferences=JSON.parse(localStorage.getItem('visualiserComplexMotion')||'{}');}catch{}
  Object.keys(ComplexStyles.names).forEach(id=>{
    valueForAll(id);
    if(Number.isInteger(motionPreferences[id]?.movement))styleValues[id][4]=clamp(motionPreferences[id].movement,0,5);
    if(Number.isInteger(motionPreferences[id]?.focus))styleValues[id][5]=clamp(motionPreferences[id].focus,0,2);
  });
  const saveMotion=()=>{const style=$('style').value;motionPreferences[style]={movement:valueFor(style,4),focus:valueFor(style,5)};try{localStorage.setItem('visualiserComplexMotion',JSON.stringify(motionPreferences));}catch{}};
  const buttonWrap=document.createElement('div');buttonWrap.className='complex-colour-button';buttonWrap.hidden=true;
  buttonWrap.innerHTML='<span class="option-label">Colour design</span><button id="complexColourOpen" type="button" class="colour-toggle"><i class="complex-gradient-swatch"></i><span>Colour</span><span aria-hidden="true">⌄</span></button>';
  document.querySelector('main .options').append(buttonWrap);
  const movement=document.createElement('div');movement.className='complex-motion-controls';movement.hidden=true;
  movement.innerHTML='<label>Movement<select id="complexMovement"></select></label><label>Response focus<select id="complexFocus"></select></label><small>Notes emphasises frequency peaks. Transients emphasises sudden attacks. This is visual response, not note transcription.</small>';
  $('styleOptionControls').before(movement);
  ComplexStyles.movements.forEach((name,i)=>$('complexMovement').add(new Option(name,i)));
  ComplexStyles.focuses.forEach((name,i)=>$('complexFocus').add(new Option(name,i)));
  const dialog=document.createElement('dialog');dialog.className='record-dialog complex-colour-dialog';dialog.setAttribute('aria-labelledby','complexColourTitle');
  dialog.innerHTML='<div class="record-heading"><h2 id="complexColourTitle">Colour design</h2><button id="complexColourClose" type="button" aria-label="Close colour design">×</button></div><div id="complexGradientPreview"></div><div id="complexColourStops" aria-label="Gradient stops"></div><div class="complex-colour-actions"><button id="complexAddStop" type="button">Add colour</button><button id="complexRemoveStop" type="button">Remove colour</button><button id="complexResetColours" type="button">Use preset palette</button></div><label>Selected colour<input id="complexHex" type="text" maxlength="7" spellcheck="false" aria-label="Selected gradient colour hex"></label><details class="complex-rgb-popover"><summary><i id="complexSelectedSwatch"></i> RGB <span>⌄</span></summary><div id="complexRgb"></div></details><div class="live-customise-grid"><label>How colours are used<span id="complexGradientChoices" class="complex-gradient-choices"></span><input id="complexGradientKind" type="hidden"></label><label>Blend direction<input id="complexGradientAngle" type="range" min="0" max="360" step="5"></label></div><label>Stage background<input id="complexBackgroundHex" type="text" maxlength="7" spellcheck="false"></label><details class="complex-rgb-popover"><summary><i id="complexBackgroundSwatch"></i> Background RGB <span>⌄</span></summary><div id="complexBackgroundRgb"></div></details>';
  const editor=document.createElement('div');editor.className='complex-colour-editor';while(dialog.firstChild)editor.append(dialog.firstChild);const previewPane=document.createElement('div');previewPane.className='complex-stage-preview';dialog.append(editor,previewPane);
  document.body.append(dialog);let selected=0,editingStyle='',stageHome;
  for(const [id,containerId] of [['complexHex','complexRgb'],['complexBackgroundHex','complexBackgroundRgb']]){
    const input=$(id),popover=$(containerId).parentElement;popover.querySelector('summary').remove();popover.replaceWith($(containerId));const rgb=$(containerId);rgb.hidden=true;rgb.classList.add('complex-hex-popup');input.setAttribute('aria-controls',containerId);input.setAttribute('aria-expanded','false');input.addEventListener('click',()=>{rgb.hidden=!rgb.hidden;input.setAttribute('aria-expanded',String(!rgb.hidden));});input.addEventListener('keydown',e=>{if(e.key==='ArrowDown'){e.preventDefault();rgb.hidden=false;input.setAttribute('aria-expanded','true');rgb.querySelector('input')?.focus();}});
  }
  const hint=document.createElement('small');hint.id='complexGradientHint';$('complexGradientChoices').parentElement.after(hint);
  const modeDescriptions={bands:'Each frequency uses its own colour. Good for seeing different sounds.',linear:'Colours blend across the stage in one direction.',radial:'Colours blend outward from the centre of the stage.',solid:'The first colour is used for the whole visualiser.'};
  dialog.addEventListener('close',()=>{if(stageHome){stageHome.parent.insertBefore(stageHome.stage,stageHome.next);stageHome=null;}document.querySelectorAll('.complex-hex-popup').forEach(p=>p.hidden=true);});
  function stored(){return ComplexStyles.designs[editingStyle]??={};}
  function config(){const design=stored();return {...design,colours:design.customColours!==false&&Array.isArray(design.colours)?design.colours:[...ComplexStyles.palettes[Math.round(valueFor(editingStyle,3))%4]]};}
  function customConfig(){const colours=config().colours.slice();const design=stored();design.colours=colours;design.customColours=true;return design;}
  function preview(){
    const design=config(),gradient=design.kind==='solid'?design.colours[0]:design.kind==='radial'?`radial-gradient(circle,${design.colours.join(',')})`:`linear-gradient(${design.angle??45}deg,${design.colours.join(',')})`;
    $('complexGradientPreview').style.background=gradient;
    document.querySelector('.complex-gradient-swatch').style.background=gradient;
    $('complexColourStops').replaceChildren();
    design.colours.forEach((colour,i)=>{const stop=document.createElement('button');stop.type='button';stop.style.background=colour;stop.className=i===selected?'selected':'';stop.setAttribute('aria-label',`Edit colour ${i+1}`);stop.setAttribute('aria-pressed',String(i===selected));stop.onclick=()=>{selected=i;preview();};$('complexColourStops').append(stop);});
    $('complexHex').value=design.colours[selected];
    const value=parseInt(design.colours[selected].slice(1),16);
    document.querySelectorAll('[data-complex-channel]').forEach((slider,i)=>{slider.value=(value>>((2-i)*8))&255;slider.nextElementSibling.value=slider.value;});
    $('complexGradientKind').value=design.kind||'bands';document.querySelectorAll('[data-gradient-kind]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.gradientKind===$('complexGradientKind').value)));$('complexGradientAngle').disabled=['solid','bands'].includes($('complexGradientKind').value);$('complexHex').style.borderLeft=`8px solid ${design.colours[selected]}`;$('complexGradientHint').textContent=modeDescriptions[$('complexGradientKind').value];$('complexGradientAngle').parentElement.hidden=$('complexGradientKind').value!=='linear';syncBackground();$('complexGradientAngle').value=design.angle??45;
    $('complexAddStop').disabled=design.colours.length>=8;$('complexRemoveStop').disabled=design.colours.length<=2;
  }
  ['R','G','B'].forEach((name,index)=>{
    const row=document.createElement('label');row.className='complex-rgb-row';row.textContent=name;
    const slider=document.createElement('input'),output=document.createElement('output');slider.type='range';slider.min=0;slider.max=255;slider.dataset.complexChannel=index;slider.setAttribute('aria-label',name);row.append(slider,output);$('complexRgb').append(row);
    slider.oninput=()=>{customConfig().colours[selected]='#'+[...document.querySelectorAll('[data-complex-channel]')].map(s=>Number(s.value).toString(16).padStart(2,'0')).join('');save();preview();};
  });
  $('complexHex').onchange=()=>{if(/^#[0-9a-f]{6}$/i.test($('complexHex').value)){customConfig().colours[selected]=$('complexHex').value;save();}preview();};
  $('complexColourOpen').onclick=()=>{editingStyle=$('style').value;selected=0;$('complexBackgroundHex').value=$('background').value;preview();const stage=canvas.closest('.stage');stageHome={stage,parent:stage.parentElement,next:stage.nextSibling};previewPane.append(stage);dialog.showModal();};
  $('complexColourClose').onclick=()=>dialog.close();
  ['bands','linear','radial','solid'].forEach(kind=>{const b=document.createElement('button');b.type='button';b.dataset.gradientKind=kind;b.textContent={bands:'Separate colours',linear:'Across the stage',radial:'From the centre',solid:'One colour'}[kind];b.onclick=()=>{$('complexGradientKind').value=kind;$('complexGradientKind').dispatchEvent(new Event('change'));};$('complexGradientChoices').append(b);});
  function syncBackground(){const colour=$('background').value;$('complexBackgroundHex').value=colour;$('complexBackgroundHex').style.borderLeft=`8px solid ${colour}`;document.querySelectorAll('[data-background-channel]').forEach((slider,i)=>{slider.value=(parseInt(colour.slice(1),16)>>((2-i)*8))&255;slider.nextElementSibling.value=slider.value;});}
  ['R','G','B'].forEach((name,index)=>{const row=document.createElement('label');row.className='complex-rgb-row';row.textContent=name;const slider=document.createElement('input'),output=document.createElement('output');slider.type='range';slider.min=0;slider.max=255;slider.dataset.backgroundChannel=index;slider.setAttribute('aria-label','Background '+name);row.append(slider,output);$('complexBackgroundRgb').append(row);slider.oninput=()=>{const hex='#'+[...document.querySelectorAll('[data-background-channel]')].map(s=>Number(s.value).toString(16).padStart(2,'0')).join('');applyPickerColour('background',hex);syncBackground();};});

  $('complexAddStop').onclick=()=>{if(config().colours.length<8){customConfig().colours.push('#b8a0ee');selected=config().colours.length-1;save();preview();}};
  $('complexRemoveStop').onclick=()=>{if(config().colours.length>2){customConfig().colours.splice(selected,1);selected=Math.min(selected,config().colours.length-1);save();preview();}};
  $('complexResetColours').onclick=()=>{delete stored().colours;stored().customColours=false;selected=0;save();preview();};
  $('complexGradientKind').onchange=()=>{stored().kind=$('complexGradientKind').value;save();preview();};
  $('complexGradientAngle').oninput=()=>{stored().angle=Number($('complexGradientAngle').value);save();preview();};
  $('complexBackgroundHex').onchange=()=>{if(/^#[0-9a-f]{6}$/i.test($('complexBackgroundHex').value))applyPickerColour('background',$('complexBackgroundHex').value);else $('complexBackgroundHex').value=$('background').value;syncBackground();};
  dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))dialog.close();});
  dialog.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&[...dialog.querySelectorAll('.complex-hex-popup')].some(p=>!p.hidden)){
      e.preventDefault();e.stopPropagation();dialog.querySelectorAll('.complex-hex-popup').forEach(p=>p.hidden=true);$('complexHex').setAttribute('aria-expanded','false');$('complexBackgroundHex').setAttribute('aria-expanded','false');
    }
  });
  const sync=()=>{
    const complex=!!ComplexStyles.names[$('style').value];document.querySelector('main').classList.toggle('complex-colours',complex);buttonWrap.hidden=!complex;movement.hidden=!complex;
    if(complex){const d=ComplexStyles.getDesign($('style').value),colours=d.customColours!==false&&Array.isArray(d.colours)?d.colours:ComplexStyles.palettes[Math.round(valueFor($('style').value,3))%4];document.querySelector('.complex-gradient-swatch').style.background=`linear-gradient(90deg,${colours.join(',')})`;$('complexMovement').value=valueFor($('style').value,4);$('complexFocus').value=valueFor($('style').value,5);}
  };
  new MutationObserver(sync).observe($('styleName'),{childList:true,subtree:true});
  new MutationObserver(sync).observe($('styleOptionControls'),{childList:true});sync();
  $('styleOptionControls').addEventListener('input',e=>{if(e.target.dataset.styleSetting==='3'){sync();if(dialog.open&&editingStyle===$('style').value&&!stored().customColours)preview();}});
  $('complexMovement').onchange=()=>{styleValues[$('style').value][4]=Number($('complexMovement').value);saveMotion();};
  $('complexFocus').onchange=()=>{styleValues[$('style').value][5]=Number($('complexFocus').value);saveMotion();bandHistory=undefined;previousEnergy=0;};
})();
