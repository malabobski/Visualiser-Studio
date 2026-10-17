// Capture once for sliders created anywhere in the app, including dialogs.
// Two-finger scrolling arrives as small pixel-wheel events; accumulate those
// rather than jumping once for every tiny trackpad packet.
(() => {
  const gestures = new WeakMap();
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
    const step = slider.step === 'any' ? (max-min)/100 : Number(slider.step || 1);
    const volume = ['volume','mediaVolume','miniVolume'].includes(slider.id);
    const increment = volume && !event.ctrlKey && !event.metaKey && !event.shiftKey ? Math.max(step,5) : step;
    const value = Math.max(min,Math.min(max,Number(slider.value)-direction*ticks*increment));
    if (!Number.isFinite(value) || value === Number(slider.value)) return;
    slider.value = String(Number(value.toFixed(8)));
    slider.dispatchEvent(new Event('input',{bubbles:true}));
    slider.dispatchEvent(new Event('change',{bubbles:true}));
  }, {capture:true,passive:false});
})();
