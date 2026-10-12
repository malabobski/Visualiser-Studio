(() => {
  // Portalled dropdowns are removed from the DOM, so preserve a non-interactive
  // visual copy while their close animation runs. The real control closes now.
  window.UiMotion={remove(element){
    const reduced=document.body.classList.contains('reduce-motion')||matchMedia('(prefers-reduced-motion: reduce)').matches;
    if(!element.isConnected||reduced){element.remove();return;}
    const rect=element.getBoundingClientRect(),copy=element.cloneNode(true);
    copy.removeAttribute('id');copy.querySelectorAll('[id]').forEach(e=>e.removeAttribute('id'));copy.setAttribute('aria-hidden','true');copy.inert=true;
    Object.assign(copy.style,{position:'fixed',left:rect.left+'px',top:rect.top+'px',width:rect.width+'px',height:rect.height+'px',boxSizing:'border-box',margin:'0',pointerEvents:'none',animation:'none'});
    element.parentElement.append(copy);element.remove();
    if(copy.hasAttribute('popover'))copy.showPopover();
    const animation=copy.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(5px)'}],{duration:180,easing:'ease-out',fill:'forwards'});
    animation.finished.catch(()=>{}).finally(()=>copy.remove());
  }};
})();
