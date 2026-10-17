// Capture once for sliders created anywhere in the app, including dialogs.
// Two-finger scrolling arrives as small pixel-wheel events; accumulate those
// rather than jumping once for every tiny trackpad packet.
(() => {
  const gestures = new WeakMap();
  const animated = new WeakMap();
  const reduced = () => document.body?.classList.contains('reduce-motion') || matchMedia('(prefers-reduced-motion: reduce)').matches;
  const snap = (value,min,max,step) => Number(Math.max(min,Math.min(max,min+Math.round((value-min)/step)*step)).toFixed(8));
  function finish(slider,state) {
    cancelAnimationFrame(state.frame);
    slider.step=state.originalStep;slider.value=String(state.target);
    animated.delete(slider);
    if(!slider.isConnected||slider.disabled)return;
    if(Number(slider.value)!==state.emitted){state.writing=true;slider.dispatchEvent(new Event('input',{bubbles:true}));state.writing=false;}
    slider.dispatchEvent(new Event('change',{bubbles:true}));
  }
  function animate(slider,target,min,max,step) {
    let state=animated.get(slider);
    if(!state){state={originalStep:slider.getAttribute('step')||'',emitted:Number(slider.value)};animated.set(slider,state);}
    cancelAnimationFrame(state.frame);
    state.from=Number(slider.value);state.target=target;state.start=performance.now();
    if(reduced()){finish(slider,state);return;}
    slider.step='any';
    const frame=now=>{
      if(!slider.isConnected||slider.disabled){slider.step=state.originalStep;animated.delete(slider);return;}
      const progress=Math.min(1,(now-state.start)/170),value=state.from+(state.target-state.from)*(1-Math.pow(1-progress,3));
      const discrete=snap(value,min,max,step);
      if(discrete!==state.emitted){
        slider.value=String(discrete);state.emitted=discrete;state.writing=true;
        slider.dispatchEvent(new Event('input',{bubbles:true}));state.writing=false;
      }
      slider.value=String(value);
      if(progress>=1)finish(slider,state);
      else state.frame=requestAnimationFrame(frame);
    };
    state.frame=requestAnimationFrame(frame);
  }
  // Dragging, typing or a programmatic edit takes ownership immediately.
  for(const name of ['pointerdown','keydown','input','change'])window.addEventListener(name,event=>{
    const slider=event.target,state=animated.get(slider);if(!state||state.writing)return;
    cancelAnimationFrame(state.frame);slider.step=state.originalStep;animated.delete(slider);
  },true);
  window.addEventListener('blur',event=>{const state=animated.get(event.target);if(state)finish(event.target,state);},true);
  window.addEventListener('wheel', event => {
    const slider = event.target.closest?.('input[type="range"]');
    if (!slider || slider.disabled || event.deltaY === 0) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const pixels = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1);
    const now = performance.now(), direction = Math.sign(pixels);
    let gesture = gestures.get(slider);
    if (!gesture || now - gesture.time > 180 || gesture.direction !== direction) gesture = { total:0, direction };
    gesture.time = now; gesture.total += pixels;
    const ticks = Math.min(3, Math.floor(Math.abs(gesture.total) / 40));
    gestures.set(slider, gesture);
    if (!ticks) return;
    gesture.total -= direction * ticks * 40;
    const min = slider.min === '' ? 0 : Number(slider.min), max = slider.max === '' ? 100 : Number(slider.max);
    const state=animated.get(slider),originalStep=state?state.originalStep:slider.getAttribute('step');
    const step = originalStep === 'any' ? (max-min)/100 : Number(originalStep || 1);
    const volume = ['volume','mediaVolume','miniVolume'].includes(slider.id);
    const fine=event.ctrlKey||event.metaKey||event.shiftKey;
    const steps=(max-min)/step;
    const increment = step*(fine?1:volume||steps>100?5:steps>=20?2:1);
    const current=state?state.target:Number(slider.value);
    const value=snap(current-direction*ticks*increment,min,max,step);
    if (!Number.isFinite(value) || value === current) return;
    animate(slider,value,min,max,step);
  }, {capture:true,passive:false});
})();
