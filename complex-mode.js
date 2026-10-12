(() => {
  const basic=document.querySelector('#styleMenu .style-grid');basic.id='basicStyles';basic.setAttribute('role','tabpanel');basic.setAttribute('aria-labelledby','basicStyleTab');
  const complex=document.createElement('div');complex.className='style-grid';complex.id='complexStyles';complex.hidden=true;complex.setAttribute('role','tabpanel');complex.setAttribute('aria-labelledby','complexStyleTab');
  basic.querySelectorAll('.complex-style-card').forEach(card=>complex.append(card));basic.after(complex);
  const toggle=$('settingAdvanced');toggle.checked=!!appSettings.advanced;
  $('basicStyleTab').setAttribute('aria-controls',basic.id);$('complexStyleTab').setAttribute('aria-controls',complex.id);
  function category(isComplex){
    isComplex=isComplex&&toggle.checked;basic.hidden=isComplex;complex.hidden=!isComplex;
    $('basicStyleTab').setAttribute('aria-selected',String(!isComplex));$('complexStyleTab').setAttribute('aria-selected',String(isComplex));
  }
  $('basicStyleTab').onclick=()=>category(false);$('complexStyleTab').onclick=()=>category(true);
  const refresh=()=>{$('complexStyleTab').hidden=!toggle.checked;category(toggle.checked&&!!ComplexStyles.names[$('style').value]);};
  toggle.onchange=()=>{
    appSettings.advanced=toggle.checked;persistAppSettings();
    if(!toggle.checked&&ComplexStyles.names[$('style').value])document.querySelector('.style-card[data-style="bars"]').click();
    refresh();window.dispatchEvent(new Event('advanced-mode-changed'));
  };
  $('styleToggle').addEventListener('click',refresh);refresh();
  const paletteNames=['Dreamscape','Candy night','Sea glass','Electric dusk'];
  const parameterLabels=()=>{
    if(!ComplexStyles.names[$('style').value])return;
    const slider=$('styleOptionControls').querySelector('[data-style-setting="3"]');
    if(slider)slider.nextElementSibling.value=paletteNames[Number(slider.value)];
  };
  new MutationObserver(parameterLabels).observe($('styleOptionControls'),{childList:true});
  $('styleOptionControls').addEventListener('input',parameterLabels);
  // Animate only the visible complex thumbnails while the picker is open.
  let lastFrame=0;
  function previews(now){
    if(!$('styleMenu').hidden&&!complex.hidden&&now-lastFrame>100){
      lastFrame=now;const time=document.body.classList.contains('reduce-motion')?3:now/1000;
      complex.querySelectorAll('canvas').forEach(canvas=>{const ctx=canvas.getContext('2d');ctx.fillStyle='#11121a';ctx.fillRect(0,0,canvas.width,canvas.height);const data=Float32Array.from({length:160},(_,i)=>.25+.55*Math.abs(Math.sin(i*.2+time)));ComplexStyles.paint(ctx,canvas.width,canvas.height,data,.45,canvas.dataset.preview,time,valueForAll(canvas.dataset.preview),ComplexStyles.getDesign(canvas.dataset.preview));});
    }
    requestAnimationFrame(previews);
  }
  requestAnimationFrame(previews);
})();
