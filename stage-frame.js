(() => {
  const stage=canvas.closest('.stage'),border=document.createElement('div');border.className='create-stage-boundary';border.setAttribute('aria-hidden','true');stage.append(border);
  function update(){const ratio=canvas.width/canvas.height,box=stage.getBoundingClientRect();const width=Math.min(box.width,box.height*ratio),height=width/ratio;stage.style.setProperty('--boundary-width',width+'px');stage.style.setProperty('--boundary-height',height+'px');stage.dataset.showBoundary=$('aspect').value!=='16:9'?'true':'false';}
  new ResizeObserver(update).observe(stage);new MutationObserver(update).observe(canvas,{attributes:true,attributeFilter:['width','height']});document.addEventListener('fullscreenchange',update);update();
})();
