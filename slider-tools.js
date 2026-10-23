(() => {
  const controls=new WeakMap();
  let editor,editing,copiedValue;
  let contextMenu;
  window.AppContextMenu={open(event,items){
    event.preventDefault();event.stopPropagation();contextMenu?.hidePopover();close();
    const box=document.createElement('div');contextMenu=box;box.className='app-context-menu';box.popover='auto';box.setAttribute('role','menu');
    (event.target.closest('dialog[open]')||document.body).append(box);
    for(const item of items){const button=document.createElement('button');button.type='button';button.textContent=item.label;button.disabled=!!item.disabled;button.setAttribute('role','menuitem');button.onclick=()=>{box.hidePopover();item.run();};box.append(button);}
    box.addEventListener('toggle',e=>{if(e.newState==='closed'){if(contextMenu===box)contextMenu=null;box.remove();}});
    box.addEventListener('keydown',e=>{if(!['ArrowDown','ArrowUp','Escape'].includes(e.key))return;e.preventDefault();e.stopPropagation();if(e.key==='Escape'){box.hidePopover();event.target.focus?.();return;}const buttons=[...box.querySelectorAll('button:not(:disabled)')],i=buttons.indexOf(document.activeElement);buttons[(i+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();});
    box.showPopover();box.style.left=Math.max(8,Math.min(innerWidth-box.offsetWidth-8,event.clientX))+'px';box.style.top=Math.max(8,Math.min(innerHeight-box.offsetHeight-8,event.clientY))+'px';box.querySelector('button:not(:disabled)')?.focus();
  }};
  function defaults(slider){
    const explicit=slider.dataset.default;
    if(explicit!==undefined&&Number.isFinite(Number(explicit)))return Number(explicit);
    const known={volume:100,mediaVolume:100,miniVolume:100,miniOpacity:100,interfaceScale:100,midiOffsetSlider:0,midiOpacity:.85,midiMotionSpeed:.35,automationZoom:1};
    if(Object.hasOwn(known,slider.id))return known[slider.id];
    const colours={colour:'#9c6bff',background:'#11121a',accent:'#7f6dff',accent2:'#3da5ff'},key=slider.closest('[data-colour-picker]')?.dataset.colourPicker,channel={r:0,g:1,b:2}[slider.dataset.channel];
    if(colours[key]&&channel!==undefined)return parseInt(colours[key].slice(1+channel*2,3+channel*2),16);
    const attr=slider.getAttribute('value');
    return attr!==null&&Number.isFinite(Number(attr))?Number(attr):Number(slider.value);
  }
  function labelFor(slider){
    return slider.getAttribute('aria-label')||slider.closest('.style-setting')?.querySelector('label')?.textContent||slider.closest('label')?.childNodes[0]?.textContent?.trim()||'Value';
  }
  function apply(slider,value){
    // A change event hands ownership back from any active scroll animation.
    slider.dispatchEvent(new Event('change',{bubbles:true}));
    const min=slider.min===''?0:Number(slider.min),max=slider.max===''?100:Number(slider.max),step=Number(slider.step)||0;
    value=Math.max(min,Math.min(max,value));
    if(step)value=min+Math.round((value-min)/step)*step;
    slider.value=String(Number(value.toFixed(8)));
    slider.dispatchEvent(new Event('input',{bubbles:true}));slider.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function close(){if(!editor)return;editor.hidePopover();editing=null;}
  function open(slider,anchor){
    if(slider.disabled)return;
    close();
    slider.dispatchEvent(new Event('change',{bubbles:true}));
    if(!editor){
      editor=document.createElement('div');editor.className='slider-number-editor';editor.popover='manual';
      editor.innerHTML='<label><span id="sliderNumberLabel">Value</span><input id="sliderNumber" type="number" aria-labelledby="sliderNumberLabel"></label><small id="sliderNumberError" role="status"></small><div><button type="button" data-slider-apply aria-label="Apply value" title="Apply value">✓</button></div>';
      const save=()=>{
        if(!editing?.isConnected||editing.disabled){close();return;}
        const field=editor.querySelector('input'),value=Number(field.value);
        if(!field.value.trim()||!Number.isFinite(value)){editor.querySelector('small').textContent='Enter a number.';field.focus();return;}
        apply(editing,value);close();
      };
      editor.querySelector('[data-slider-apply]').onclick=save;
      editor.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();save();}if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();}},true);
    }
    editing=slider;
    const parent=slider.closest('dialog[open]')||document.body;parent.append(editor);
    const input=editor.querySelector('input');editor.querySelector('span').textContent=labelFor(slider);editor.querySelector('small').textContent='';
    input.min=slider.min;input.max=slider.max;input.step=slider.step||'1';input.value=slider.value;
    editor.showPopover();
    const rect=(anchor||slider).getBoundingClientRect(),width=editor.offsetWidth,height=editor.offsetHeight;
    editor.style.left=Math.max(12,Math.min(innerWidth-width-12,rect.left))+'px';
    editor.style.top=Math.max(12,Math.min(innerHeight-height-12,rect.bottom+8))+'px';
    input.focus();input.select();
  }
  function attach(slider){
    if(controls.has(slider))return;
    const initial=defaults(slider);controls.set(slider,{initial});
    if(slider.id==='stageDesignerSeek'){slider.addEventListener('contextmenu',e=>e.preventDefault());return;}
    const context=event=>{if(['easeSeek','mediaSeek','miniSeek'].includes(slider.id)){event.preventDefault();return;}if(slider.disabled)return;AppContextMenu.open(event,[{label:'Enter value…',run:()=>open(slider,event.target)},{label:'Reset to default',run:()=>apply(slider,slider.dataset.default===undefined?initial:defaults(slider))},{label:'Copy value',run:()=>{copiedValue=Number(slider.value);}},{label:'Paste value',disabled:copiedValue===undefined,run:()=>apply(slider,copiedValue)}]);};
    slider.addEventListener('contextmenu',context);
    slider.addEventListener('dblclick',event=>{if(slider.disabled)return;event.preventDefault();event.stopPropagation();apply(slider,slider.dataset.default===undefined?initial:defaults(slider));});
    // Track timing already has an exact-value number field beside its slider.
    const numberFields={rangeLow:'rangeLowText',rangeHigh:'rangeHighText'};
    if(slider.parentElement.querySelector('input[type="number"]')||numberFields[slider.id]&&document.getElementById(numberFields[slider.id]))return;
    const container=slider.closest('.rgb-control,.complex-rgb-row,.live-rgb-row,.style-setting,.live-param')||slider.parentElement;
    let output=container.querySelector('output');
    if(!output||container.querySelectorAll('input[type="range"]').length>1)output=slider.id?document.getElementById(slider.id+'Value'):null;
    const seekLabels={mediaSeek:'mediaElapsed',miniSeek:'miniElapsed',easeSeek:'time',midiMotionSpeed:'midiMotionReadout',midiOffsetSlider:'midiOffsetReadout'};
    if(!output&&seekLabels[slider.id])output=document.getElementById(seekLabels[slider.id]);
    const generated=!output;
    if(generated){output=document.createElement('button');output.type='button';output.className='slider-value-control slider-value-generated';(slider.closest('.volume-track')||slider).after(output);}
    else{output.classList.add('slider-value-control');output.setAttribute('role','button');output.tabIndex=0;}
    output.setAttribute('aria-label','Enter exact '+labelFor(slider).toLowerCase());output.title='Click to enter a value · Double-click the slider to reset';
    output.addEventListener('contextmenu',context);
    output.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();open(slider,output);});
    output.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();event.stopImmediatePropagation();open(slider);}});
    if(generated){const render=()=>{const text=String(Number(Number(slider.value).toFixed(5)));if(output.textContent!==text)output.textContent=text;};slider.addEventListener('input',render);slider.addEventListener('change',render);render();}
  }
  window.addEventListener('keydown',event=>{
    if(!editing||!editor.contains(event.target)||!['Enter','Escape'].includes(event.key))return;
    event.preventDefault();event.stopImmediatePropagation();
    if(event.key==='Enter')editor.querySelector('[data-slider-apply]').click();else close();
  },true);
  document.addEventListener('pointerdown',event=>{if(editing&&!editor.contains(event.target)&&!event.target.closest('.slider-value-control'))close();},true);
  function attachNumber(input){
    if(input.parentElement.classList.contains('number-stepper'))return;
    const wrapper=document.createElement('span');wrapper.className='number-stepper';
    input.before(wrapper);wrapper.append(input);
    const arrows=document.createElement('span');arrows.className='number-stepper-arrows';wrapper.append(arrows);
    for(const direction of [1,-1]){
      const button=document.createElement('button');button.type='button';button.tabIndex=-1;
      button.setAttribute('aria-label',direction===1?'Increase value':'Decrease value');
      button.innerHTML=`<svg viewBox="0 0 12 8" aria-hidden="true"><path d="${direction===1?'M2 6 6 2 10 6':'M2 2 6 6 10 2'}"/></svg>`;
      button.addEventListener('pointerdown',e=>{e.preventDefault();e.stopPropagation();});
      button.addEventListener('click',e=>{
        e.preventDefault();e.stopPropagation();if(input.disabled||input.readOnly)return;
        input.focus({preventScroll:true});const previous=input.value;
        if(input.step==='any'){
          const value=(Number(input.value)||0)+direction;
          input.value=String(Math.max(input.min===''?-Infinity:Number(input.min),Math.min(input.max===''?Infinity:Number(input.max),value)));
        }else if(direction===1)input.stepUp();else input.stepDown();
        if(input.value!==previous){input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change',{bubbles:true}));}
      });arrows.append(button);
    }
    const sync=()=>{for(const button of arrows.children)button.disabled=input.disabled||input.readOnly;};sync();
    new MutationObserver(sync).observe(input,{attributes:true,attributeFilter:['disabled','readonly']});
  }
  document.addEventListener('DOMContentLoaded',()=>{
    const scan=root=>{if(root.nodeType!==Node.ELEMENT_NODE)return;if(root.matches('input[type="range"]'))attach(root);root.querySelectorAll('input[type="range"]').forEach(attach);if(root.matches('input[type="number"]'))attachNumber(root);root.querySelectorAll('input[type="number"]').forEach(attachNumber);};
    scan(document.body);new MutationObserver(changes=>{for(const change of changes)for(const node of change.addedNodes)scan(node);}).observe(document.body,{childList:true,subtree:true});
  });
})();
