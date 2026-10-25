// Shared stage-style hints, including controls created after startup.
(() => {
  const setup=()=>{
    const tip=document.createElement('div');tip.className='hint-tip';tip.id='appHint';tip.popover='manual';tip.setAttribute('role','tooltip');
    document.body.append(tip);let current=null;const migrated=new WeakMap();
    function migrate(el){
      if(!el.hasAttribute('title'))return;
      const text=el.getAttribute('title');el.removeAttribute('title');
      if(text){el.dataset.hint=text;migrated.set(el,text);}
      else if(migrated.get(el)===el.dataset.hint){delete el.dataset.hint;migrated.delete(el);}
    }
    function scan(root){if(root.nodeType!==1)return;migrate(root);root.querySelectorAll('[title]').forEach(migrate);}
    scan(document.documentElement);
    new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')migrate(r.target);else r.addedNodes.forEach(scan);}}).observe(document.documentElement,{subtree:true,childList:true,attributes:true,attributeFilter:['title']});
    function hide(){tip.classList.remove('visible');if(tip.matches(':popover-open'))tip.hidePopover();current=null;}
    function position(){
      if(!current?.isConnected){hide();return;}
      const r=current.getBoundingClientRect(),b=tip.getBoundingClientRect();
      const x=Math.max(8,Math.min(innerWidth-b.width-8,r.left+(r.width-b.width)/2));
      let y=r.top-b.height-10;if(y<8)y=r.bottom+10;y=Math.max(8,Math.min(innerHeight-b.height-8,y));
      tip.style.left=Math.round(x)+'px';tip.style.top=Math.round(y)+'px';
    }
    function show(el){
      if(!el?.dataset.hint){hide();return;}
      current=el;tip.textContent=el.dataset.hint;
      const host=document.fullscreenElement||document.body;if(tip.parentElement!==host)host.append(tip);
      if(!tip.matches(':popover-open'))tip.showPopover();position();tip.classList.add('visible');
    }
    document.addEventListener('pointerover',event=>{const el=event.target.closest?.('[title],[data-hint]');if(el){migrate(el);if(el!==current)show(el);}});
    document.addEventListener('pointerout',event=>{if(current&&!current.contains(event.relatedTarget))hide();});
    document.addEventListener('focusin',event=>{const el=event.target.closest?.('[data-hint]');if(el)show(el);});
    document.addEventListener('focusout',hide);document.addEventListener('pointerdown',hide,true);document.addEventListener('keydown',hide,true);
    document.addEventListener('fullscreenchange',hide);window.addEventListener('resize',hide);
    window.addEventListener('scroll',()=>{if(current)position();},true);
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
