(() => {
  const clamp=v=>Math.max(0,Math.min(1,v));
  function rgb(h,s,v){const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;return (h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x]).map(n=>Math.round((n+m)*255));}
  const hex=values=>'#'+values.map(n=>n.toString(16).padStart(2,'0')).join('');
  function hsv(values,oldHue){const [r,g,b]=values.map(n=>n/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;let h=oldHue;if(d)h=(max===r?(g-b)/d:max===g?(b-r)/d+2:(r-g)/d+4)*60;return [(h+360)%360,max?d/max:0,max];}
  function attach(menu){
    if(menu.dataset.wheelReady)return;
    const channels=[...menu.querySelectorAll('input[type="range"]')];if(channels.length!==3)return;
    menu.dataset.wheelReady='true';menu.classList.add('wheel-menu');
    const root=document.createElement('div');root.className='colour-wheel';
    root.innerHTML='<div class="colour-wheel-disc" role="slider" tabindex="0" aria-label="Hue and saturation" aria-valuemin="0" aria-valuemax="359"><canvas width="240" height="240" aria-hidden="true"></canvas><i class="colour-wheel-handle"></i></div><label class="colour-wheel-brightness">Brightness<input type="range" min="0" max="100" step="1" value="100"></label><label class="colour-wheel-hex">Hex<input type="text" maxlength="7" spellcheck="false" aria-label="Colour hex code"></label>';
    [...menu.children].forEach(child=>child.classList.add('wheel-legacy'));
    menu.append(root);
    const disc=root.querySelector('.colour-wheel-disc'),canvas=root.querySelector('canvas'),handle=root.querySelector('i'),brightness=root.querySelector('input[type="range"]'),field=root.querySelector('input[type="text"]');
    let h=0,s=0,v=1,last='',writing=false;
    const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(240,240);
    for(let y=0;y<240;y++)for(let x=0;x<240;x++){const dx=(x-119.5)/119,dy=(y-119.5)/119,r=Math.hypot(dx,dy),i=(y*240+x)*4;if(r>1)continue;const colour=rgb((Math.atan2(dy,dx)*180/Math.PI+360)%360,r,1);pixels.data.set([...colour,Math.min(255,Math.round((1-r)*119*255))],i);}
    ctx.putImageData(pixels,0,0);
    function paint(){
      const colour=hex(rgb(h,s,v));field.value=colour;field.removeAttribute('aria-invalid');brightness.value=Math.round(v*100);brightness.style.background=`linear-gradient(to right,#000,${hex(rgb(h,s,1))})`;
      canvas.style.filter=`brightness(${v})`;handle.style.left=(50+Math.cos(h*Math.PI/180)*s*50)+'%';handle.style.top=(50+Math.sin(h*Math.PI/180)*s*50)+'%';handle.style.background=colour;
      disc.setAttribute('aria-valuenow',Math.round(h));disc.setAttribute('aria-valuetext',`Hue ${Math.round(h)}°, saturation ${Math.round(s*100)}%, brightness ${Math.round(v*100)}%`);
    }
    function sync(){if(writing)return;const values=channels.map(c=>Number(c.value)),current=hex(values);if(current===last)return;last=current;[h,s,v]=hsv(values,h);paint();}
    function apply(){writing=true;const values=rgb(h,s,v);channels.forEach((c,i)=>c.value=values[i]);channels[0].dispatchEvent(new Event('input',{bubbles:true}));last=hex(values);writing=false;paint();}
    function point(event){const rect=disc.getBoundingClientRect(),dx=(event.clientX-rect.left-rect.width/2)/(rect.width/2),dy=(event.clientY-rect.top-rect.height/2)/(rect.height/2);h=(Math.atan2(dy,dx)*180/Math.PI+360)%360;s=clamp(Math.hypot(dx,dy));apply();}
    disc.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();disc.focus();disc.setPointerCapture(event.pointerId);point(event);};
    disc.onpointermove=event=>{if(disc.hasPointerCapture(event.pointerId))point(event);};
    disc.onpointerup=event=>{if(disc.hasPointerCapture(event.pointerId))disc.releasePointerCapture(event.pointerId);channels[0].dispatchEvent(new Event('change',{bubbles:true}));};
    disc.onkeydown=event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();event.stopPropagation();const fine=event.ctrlKey||event.metaKey;if(event.key==='ArrowLeft'||event.key==='ArrowRight')h=(h+(event.key==='ArrowLeft'?-1:1)*(fine?1:5)+360)%360;else s=clamp(s+(event.key==='ArrowUp'?1:-1)*(fine?.01:.05));apply();};
    brightness.oninput=()=>{v=Number(brightness.value)/100;apply();};
    field.onchange=()=>{const value=field.value.trim();if(!/^#?[0-9a-f]{6}$/i.test(value)){field.setAttribute('aria-invalid','true');return;}const clean=value.replace('#','');[h,s,v]=hsv([0,2,4].map(i=>parseInt(clean.slice(i,i+2),16)),h);apply();};
    channels.forEach(c=>c.addEventListener('input',sync));
    // Existing project/palette restoration writes channel values directly.
    const timer=setInterval(()=>{if(!menu.isConnected){clearInterval(timer);return;}if(menu.getClientRects().length&&document.activeElement!==field)sync();},150);
    sync();
  }
  function scan(){document.querySelectorAll('.colour-menu,.live-rgb-menu,#complexRgb,#complexBackgroundRgb,.midi-rgb').forEach(attach);document.querySelectorAll('.colour-toggle,.live-rgb-toggle').forEach(button=>{[...button.children].forEach(child=>{if(child.textContent==='RGB')child.textContent='Colour';});});}
  scan();new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
})();
