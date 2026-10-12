// Keep native select values/events as the source of truth, with one shared menu.
(() => {
  let active;
  const controls=[];
  const close=()=>{if(!active)return;window.UiMotion.remove(active.menu);active.button.setAttribute('aria-expanded','false');active=null;};
  function optionIcon(option){
    const key=option?.dataset.icon;if(!key)return null;
    let source=document.querySelector('[data-screen="'+key+'"] svg');
    if(key==='miniplayer')source=document.querySelector('#sidebarMiniPlayer svg');
    if(key==='settings')source=document.querySelector('#settingsToggle svg');
    let icon;if(source)icon=source.cloneNode(true);else if(key==='projects'){icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.innerHTML='<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>';icon.setAttribute('fill','none');icon.setAttribute('stroke','currentColor');icon.setAttribute('stroke-width','1.8');icon.setAttribute('stroke-linejoin','round');}
    if(icon){icon.classList.add('unified-option-icon');icon.setAttribute('aria-hidden','true');}return icon;
  }
  function sync(control){
    const {select,button}=control;
    button.disabled=select.disabled;
    const text=select.selectedOptions[0]?.textContent||'Choose an option';
    if(control.caption.textContent!==text||control.caption.dataset.icon!==(select.selectedOptions[0]?.dataset.icon||'')){control.caption.replaceChildren();const icon=optionIcon(select.selectedOptions[0]);if(icon)control.caption.append(icon);control.caption.append(document.createTextNode(text));control.caption.dataset.icon=select.selectedOptions[0]?.dataset.icon||'';}
    const label=select.getAttribute('aria-label')||select.closest('label')?.childNodes[0]?.textContent?.trim()||'Choose an option';
    button.setAttribute('aria-label',`${label}: ${text}`);
  }
  function open(control){
    if(active===control){close();return;}
    close();
    control.select.dispatchEvent(new Event('focus'));
    sync(control);
    const {select,button,menu}=control;
    menu.replaceChildren();
    let lastGroup;
    for(const option of select.options){
      const group=option.parentElement.tagName==='OPTGROUP'?option.parentElement.label:'';if(group&&group!==lastGroup){const heading=document.createElement('div');heading.className='unified-group-heading';heading.textContent=group;menu.append(heading);}lastGroup=group;
      const item=document.createElement('button');item.type='button';item.className='unified-option';
      const icon=optionIcon(option);if(icon)item.append(icon);item.append(document.createTextNode(option.textContent));item.disabled=option.disabled;item.setAttribute('role','option');
      item.setAttribute('aria-selected',String(option.selected));
      item.onclick=e=>{e.preventDefault();e.stopPropagation();select.value=option.value;select.dispatchEvent(new Event('input',{bubbles:true}));select.dispatchEvent(new Event('change',{bubbles:true}));sync(control);close();button.focus();};
      menu.append(item);
    }
    (select.closest('dialog[open]')||document.fullscreenElement||document.body).append(menu);
    menu.showPopover();
    active=control;button.setAttribute('aria-expanded','true');
    const r=button.getBoundingClientRect();
    menu.style.width=`${Math.min(Math.max(r.width,140),window.innerWidth-16)}px`;
    menu.style.left=`${Math.max(8,Math.min(r.left,window.innerWidth-menu.offsetWidth-8))}px`;
    menu.style.maxHeight=`${Math.max(80,Math.min(300,Math.max(r.top,window.innerHeight-r.bottom)-16))}px`;
    menu.style.top=`${r.bottom+menu.offsetHeight+8<=window.innerHeight?r.bottom+6:Math.max(8,r.top-menu.offsetHeight-6)}px`;
    (menu.querySelector('[aria-selected="true"]:not(:disabled)')||menu.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});
  }
  document.querySelectorAll('select:not([multiple])').forEach((select,index)=>{
    const wrapper=document.createElement('span');wrapper.className='unified-select';
    select.before(wrapper);wrapper.append(select);select.classList.add('unified-native');
    const button=document.createElement('button');button.type='button';button.className='unified-toggle';
    const caption=document.createElement('span'),arrow=document.createElement('span');arrow.textContent='⌄';arrow.setAttribute('aria-hidden','true');button.append(caption,arrow);
    const menu=document.createElement('div');menu.className='unified-menu';menu.setAttribute('popover','manual');menu.id=`unified-menu-${index}`;menu.setAttribute('role','listbox');
    button.setAttribute('aria-haspopup','listbox');button.setAttribute('aria-controls',menu.id);button.setAttribute('aria-expanded','false');wrapper.append(button);
    const control={select,button,menu,caption};controls.push(control);
    button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();open(control);});
    button.addEventListener('keydown',e=>{e.stopPropagation();if(['ArrowDown','ArrowUp','Enter',' '].includes(e.key)){e.preventDefault();open(control);}});
    menu.addEventListener('keydown',e=>{
      e.stopPropagation();const items=[...menu.querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);
      if(e.key==='Escape'){e.preventDefault();close();button.focus();}
      else if(e.key==='Tab')close();
      else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}
    });
    select.addEventListener('change',()=>sync(control));
    new MutationObserver(()=>sync(control)).observe(select,{childList:true,subtree:true,attributes:true});sync(control);
  });
  // Existing settings also assign .value directly when restoring templates.
  setInterval(()=>controls.forEach(sync),200);
  document.addEventListener('pointerdown',e=>{if(active&&!active.menu.contains(e.target)&&!active.button.contains(e.target))close();},true);
  document.addEventListener('close',e=>{if(active&&e.target.contains(active.button))close();},true);
  document.addEventListener('fullscreenchange',close);window.addEventListener('resize',close);
  window.addEventListener('scroll',e=>{if(active&&!active.menu.contains(e.target))close();},true);
})();
