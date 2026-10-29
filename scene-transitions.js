(function(root){
const ComplexStyles=typeof module!=='undefined'?require('./complex-styles'):root.ComplexStyles;
const ParameterAutomation=typeof module!=='undefined'?require('./parameter-automation'):root.ParameterAutomation;
const FFT=typeof module!=='undefined'?require('fft.js'):root.SceneFFT;
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,n));
const specs={...ParameterAutomation.basicSpecs,...ComplexStyles.specs,particles:[['Density',40,300,180,1],['Speed',.05,.6,.2,.01],['Size',.4,4,1,.1]]};
const rgba=(hex,alpha=1)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${alpha})`;};
const particles=Array.from({length:300},(_,i)=>({x:(i*37%157)/157,y:(i*91%151)/151,s:.7+i%3,v:.04+(i%7)*.018}));
const fftWindow=Float64Array.from({length:4096},(_,i)=>.5-.5*Math.cos(Math.PI*2*i/4095));
const supportsStyle=style=>typeof style==='string'&&Object.hasOwn(specs,style);
function look(input){
  input=input&&typeof input==='object'?input:{};const style=Object.hasOwn(specs,input.style)?input.style:'bars';
  const colour=value=>/^#[0-9a-f]{6}$/i.test(value||'')?value:null;
  const design=input.design||{},colours=Array.isArray(design.colours)?design.colours.filter(colour).slice(0,8):[];
  return {style,colour:colour(input.colour)||'#9c6bff',background:colour(input.background)||'#11121a',params:specs[style].map((s,i)=>clamp(Number.isFinite(input.params?.[i])?input.params[i]:s[3],s[1],s[2])),automation:ParameterAutomation.clean(input.automation),design:{kind:['solid','bands','radial','linear'].includes(design.kind)?design.kind:'bands',angle:Number.isFinite(design.angle)?design.angle:45,customColours:design.customColours!==false,...(colours.length>=2?{colours}:{})}};
}
function clean(input){
  if(!input||typeof input!=='object')return null;
  if(Array.isArray(input.sections)&&input.sections.length){
    const sections=input.sections.slice(0,64).map((s,i)=>({name:String(s?.name||'Section '+(i+1)).slice(0,60),start:clamp(Number(s?.start)||0,0,86400),fade:clamp(Number(s?.fade)||0,0,60),look:look(s?.look)})).sort((a,b)=>a.start-b.start);
    sections[0].start=0;sections[0].fade=0;
    for(let i=sections.length-1;i>0;i--)if(sections[i].start-sections[i-1].start<.05&&!(i===1&&sections[i].start===0&&sections[i-1].start===0))sections.splice(i,1);
    sections.forEach((s,i)=>{if(sections[i+1])s.fade=Math.min(s.fade,sections[i+1].start-s.start);});
    return {enabled:input.enabled===true,sections};
  }
  return {enabled:input.enabled===true,start:clamp(Number(input.start)||0,0,86400),duration:clamp(Number(input.duration)||2,.05,60),a:look(input.a),b:look(input.b)};
}
function progress(config,time){const t=clamp((time-config.start)/config.duration);return t*t*(3-2*t);}
class AudioSource{
  constructor(samples,sampleRate){this.samples=samples;this.sampleRate=sampleRate;this.fft=new FFT(4096);this.input=new Array(4096).fill(0);this.output=this.fft.createComplexArray();this.cache=new Map();this.rawCache=new Map();this.bandBins=Array.from({length:112},(_,band)=>[Math.max(1,Math.floor(20*Math.pow(1000,band/112)/sampleRate*4096)),Math.min(2047,Math.ceil(20*Math.pow(1000,(band+1)/112)/sampleRate*4096))]);}
  frame(step){
    step=Math.max(0,Math.floor(step));if(this.cache.has(step))return this.cache.get(step);
    const base=this.baseFrame(step),history=new Float64Array(base.values.length);
    // Reconstruct the release envelope from audio, independent of render/seek order.
    // Older contributions are below float precision after 64 canonical frames.
    for(let previous=Math.max(0,step-64);previous<step;previous++){
      const values=this.baseFrame(previous).values;
      for(let band=0;band<history.length;band++)history[band]=history[band]*.7+values[band]*.3;
    }
    const values=Float32Array.from(base.values,(value,band)=>clamp(value+Math.max(0,value-history[band])*1.25));
    const data={values,energy:values.reduce((sum,value)=>sum+value,0)/values.length,wave:base.wave};
    this.cache.set(step,data);if(this.cache.size>1200)this.cache.delete(this.cache.keys().next().value);return data;
  }
  baseFrame(step){
    if(this.rawCache.has(step))return this.rawCache.get(step);
    const centre=Math.floor(step/60*this.sampleRate),values=new Float32Array(112),wave=new Float32Array(2048);
    for(let i=0;i<4096;i++)this.input[i]=(this.samples[centre-2048+i]||0)*fftWindow[i];
    this.fft.realTransform(this.output,this.input);let energy=0;
    for(let band=0;band<112;band++){const [a,b]=this.bandBins[band];let peak=0;for(let bin=a;bin<=b;bin++)peak=Math.max(peak,Math.hypot(this.output[bin*2],this.output[bin*2+1]));values[band]=Math.pow(clamp(Math.log10(1+peak/2048*120)/2.1),1.45);energy+=values[band];}
    for(let i=0;i<wave.length;i++)wave[i]=this.samples[centre-2048+i*2]||0;
    const data={values,energy:energy/112,wave};this.rawCache.set(step,data);if(this.rawCache.size>1200)this.rawCache.delete(this.rawCache.keys().next().value);return data;
  }
}
class Renderer{
  constructor(config,source,createCanvas,backgroundPaint){this.backgroundPaint=backgroundPaint;this.config=clean(config);this.source=source;this.make=createCanvas;this.sections=this.config.sections||[{start:0,fade:0,look:this.config.a},{start:this.config.start,fade:this.config.duration,look:this.config.b}];const shared=new Map();this.scenes=this.sections.map((section,index)=>{const key=JSON.stringify(section.look);if(shared.has(key))return shared.get(key);const origin=index?Math.max(0,Math.floor((section.start-6)*60)):0;const scene={look:section.look,origin,canvas:createCanvas(32,18),step:origin-1,checkpoints:new Map()};shared.set(key,scene);return scene;});}
  at(time){let index=0;for(let i=1;i<this.sections.length;i++){if(time>=this.sections[i].start)index=i;else break;}const s=this.sections[index],mix=index&&s.fade?progress({start:s.start,duration:s.fade},time):1;return {index,mix};}
  rewind(scene,step){let checkpoint=scene.origin-1;for(const key of scene.checkpoints.keys())if(key<step&&key>checkpoint)checkpoint=key;ComplexStyles.restore(scene.canvas.getContext('2d'),scene.checkpoints.get(checkpoint)||null);scene.step=checkpoint;}
  active(time){const {index,mix}=this.at(time);return mix<1?[this.scenes[index-1],this.scenes[index]]:[this.scenes[index]];}
  work(time,w,h){const step=Math.max(0,Math.floor(time*60+1e-6));return this.active(time).reduce((total,scene)=>{if(!ComplexStyles.names[scene.look.style])return total;let previous=scene.step;if(step<previous||scene.canvas.width!==w||scene.canvas.height!==h){previous=scene.origin-1;for(const key of scene.checkpoints.keys())if(key<step&&key>previous)previous=key;}return total+Math.max(0,step-previous);},0);}
  async prepare(time,w,h,current=()=>true){
    const step=Math.max(0,Math.floor(time*60+1e-6));
    for(const scene of this.active(time)){
      if(!ComplexStyles.names[scene.look.style])continue;
      if(step<scene.step||scene.canvas.width!==w||scene.canvas.height!==h){this.rewind(scene,step);scene.canvas.width=w;scene.canvas.height=h;}
      while(scene.step<step){if(!current())return;this.scene(scene,Math.min(step,scene.step+24),w,h);await new Promise(resolve=>setTimeout(resolve,0));}
    }
  }
  scene(scene,step,w,h){
    const canvas=scene.canvas,ctx=canvas.getContext('2d'),stateful=!!ComplexStyles.names[scene.look.style];
    if(scene.step===step&&canvas.width===w&&canvas.height===h)return canvas;
    if(stateful&&(step<=scene.step||canvas.width!==w||canvas.height!==h)){
      this.rewind(scene,step);
    }
    if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}
    const begin=stateful?scene.step+1:step;
    for(let frame=begin;frame<=step;frame++){
      const data=this.source.frame(frame),final=frame===step;
      paint(ctx,final?w:32,final?h:18,data.values,data.energy,frame/60,scene.look,data.wave,!!this.backgroundPaint);
      if(stateful&&frame%120===0){scene.checkpoints.set(frame,ComplexStyles.snapshot(ctx));if(scene.checkpoints.size>32)scene.checkpoints.delete(scene.checkpoints.keys().next().value);}
    }
    scene.step=step;return canvas;
  }
  composite(scene,step,w,h,time){
    const visual=this.scene(scene,step,w,h);if(!this.backgroundPaint)return visual;
    const c=scene.composite??=this.make(w,h);if(c.width!==w||c.height!==h){c.width=w;c.height=h;}const g=c.getContext('2d');g.clearRect(0,0,w,h);g.fillStyle=scene.look.background;g.fillRect(0,0,w,h);this.backgroundPaint(g,w,h,time);g.drawImage(visual,0,0,w,h);return c;
  }
  render(ctx,w,h,time){
    const step=Math.max(0,Math.floor(time*60+1e-6)),{index,mix}=this.at(time);
    ctx.save();ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    if(mix<1)ctx.drawImage(this.composite(this.scenes[index-1],step,w,h,time),0,0,w,h);
    if(mix>0){ctx.globalAlpha=mix;ctx.drawImage(this.composite(this.scenes[index],step,w,h,time),0,0,w,h);}
    ctx.restore();return {mix,style:this.sections[mix<.5?index-1:index].look.style};
  }
}
function paint(ctx,w,h,values,energyAvg,time,settings,waveform,transparent=false){
const style=settings.style,frameParams=settings.params.map((base,index)=>ParameterAutomation.evaluate(settings.automation.find(t=>t.index===index),time,base,specs[style]?.[index])),[p0,p1,p2]=frameParams,cx=w/2,cy=h/2,unit=Math.min(w,h);if(transparent)ctx.clearRect(0,0,w,h);else{ctx.fillStyle=settings.background;ctx.fillRect(0,0,w,h);}
    if (ComplexStyles.paint(ctx,w,h,values,energyAvg,style,time,frameParams,settings.design||{})) {
    } else if (style === 'bars' || style === 'mirror') {
      const mirror = style === 'mirror', count = Math.max(1, Math.round(p1)), gap = w / count, heightScale = p0, gapScale = p2;
      for (let i = 0; i < count; i++) {
        const v = values[Math.floor(i / count * values.length)], barH = Math.max(3, v * h * heightScale), x = i * gap;
        ctx.fillStyle = rgba(settings.colour, .22 + v * .78);
        if (mirror) ctx.fillRect(x, cy - barH / 2, gap * gapScale, barH);
        else ctx.fillRect(x, h - barH, gap * gapScale, barH);
      }
    } else if (style === 'wave') {
      const amplitude = p0, thickness = p1, step = Math.max(1, Math.round(p2));
      ctx.strokeStyle = settings.colour; ctx.lineWidth = thickness; ctx.beginPath();
      for (let i = 0; i < w; i += step) {
        const sample = waveform[Math.min(waveform.length-1,Math.floor(i/w*waveform.length))] || 0, y = cy + sample * h * amplitude * 2;
        i ? ctx.lineTo(i, y) : ctx.moveTo(i, y);
      }
      ctx.stroke();
    } else if (style === 'radial') {
      const core = p0, spread = p1, thickness = p2, radius = unit * core;
      for (let i = 0; i < 150; i++) {
        const a = i / 150 * Math.PI * 2, v = values[Math.floor(i / 150 * values.length)], length = radius + v * unit * spread;
        ctx.strokeStyle = rgba(settings.colour, .16 + v * .84); ctx.lineWidth = thickness;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); ctx.lineTo(cx + Math.cos(a) * length, cy + Math.sin(a) * length); ctx.stroke();
      }
      ctx.fillStyle = rgba(settings.colour, .45 + energyAvg * .45);
      ctx.beginPath(); ctx.arc(cx, cy, radius * (.55 + energyAvg * .23), 0, Math.PI * 2); ctx.fill();
    } else if (style === 'orbit') {
      const baseRadius = p0, dotCount = Math.max(1, Math.round(p1)), dotSize = p2;
      for (let i = 0; i < dotCount; i++) {
        const a = i / dotCount * Math.PI * 2, v = values[Math.floor(i / dotCount * values.length)], radius = unit * (baseRadius + v * .24);
        ctx.fillStyle = rgba(settings.colour, .18 + v * .82);
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, Math.max(1, v * unit * .011 * dotSize), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = rgba(settings.colour, .7);
      ctx.beginPath(); ctx.arc(cx, cy, unit * .06 * (1 + energyAvg), 0, Math.PI * 2); ctx.fill();
    } else if (style === 'rings') {
      const spacing = p0, thickness = p1, pulse = p2;
      for (let i = 0; i < 8; i++) {
        const v = values[Math.floor(i / 8 * values.length)], radius = unit * (.07 + i * spacing + v * pulse);
        ctx.strokeStyle = rgba(settings.colour, .16 + v * .84); ctx.lineWidth = thickness;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (style === 'particles') {
      const density = Math.max(1, Math.round(p0)), speedScale = Math.max(.05, Math.min(.6, p1)) * .03, sizeScale = p2;
      particles.slice(0, density).forEach((particle, i) => {
        const v = values[i % values.length], speed = (.25 + v * 4.7) * speedScale;
        const distance=particle.v*.25*speedScale*time*60,cycles=Math.floor(distance+1-particle.y),py=((particle.y-distance)%1+1)%1,px=(particle.x+Math.max(0,cycles)*.618)%1;
        ctx.fillStyle = rgba(settings.colour, .16 + v * .84);
        ctx.beginPath(); ctx.arc(px * w, py * h, particle.s * sizeScale * (1 + v * 4), 0, Math.PI * 2); ctx.fill();
      });
    } else if (style === 'aurora') {
      const heightScale = p0, flow = p1, opacity = p2;
      ctx.beginPath();
      for (let i = 0; i < values.length; i++) {
        const x = i / (values.length - 1) * w, y = h * .68 - values[i] * h * heightScale;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      const fill = ctx.createLinearGradient(0, 0, 0, h);
      fill.addColorStop(0, rgba(settings.colour, opacity)); fill.addColorStop(1, rgba(settings.colour, 0));
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = rgba(settings.colour, opacity); ctx.lineWidth = Math.max(2, w / 480 * flow);
      ctx.beginPath();
      for (let i = 0; i < values.length; i++) {
        const x = i / (values.length - 1) * w, y = h * .68 - values[i] * h * heightScale;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    } else if (style === 'spiral') {
      const arms = Math.max(1, Math.round(p0)), turns = p1, sizeScale = p2, points = 120;
      for (let arm = 0; arm < arms; arm++) {
        const armOffset = arm / arms * Math.PI * 2;
        for (let i = 0; i < points; i++) {
          const t = i / points, v = values[Math.floor(t * values.length)];
          const angle = t * turns * Math.PI * 2 + armOffset, radius = unit * .04 + t * unit * .46 * (.35 + v * .65);
          const x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
          ctx.fillStyle = rgba(settings.colour, .15 + v * .85);
          ctx.beginPath(); ctx.arc(x, y, Math.max(1, (1 + v * 3.5) * sizeScale * (unit * .006)), 0, Math.PI * 2); ctx.fill();
        }
      }
    } else if (style === 'grid') {
      const cols = Math.max(1, Math.round(p0)), rows = Math.max(1, Math.round(p1)), gapRatio = p2;
      const cellW = w / cols, cellH = h / rows;
      for (let c = 0; c < cols; c++) {
        const v = values[Math.floor(c / cols * values.length)], lit = Math.round(v * rows);
        for (let r = 0; r < rows; r++) {
          const on = r >= rows - lit, a = on ? .35 + (r - (rows - lit)) / Math.max(1, lit) * .65 : .06;
          ctx.fillStyle = rgba(settings.colour, a);
          const pad = Math.min(cellW, cellH) * gapRatio / 2;
          ctx.fillRect(c * cellW + pad, r * cellH + pad, cellW - pad * 2, cellH - pad * 2);
        }
      }
    } else if (style === 'starburst') {
      const core = unit * p0, lengthScale = p1, widthScale = p2, spikes = 72;
      for (let i = 0; i < spikes; i++) {
        const a = i / spikes * Math.PI * 2, v = values[Math.floor(i / spikes * values.length)];
        const outer = core + v * unit * lengthScale, halfWidth = (Math.PI / spikes) * widthScale * .5;
        ctx.fillStyle = rgba(settings.colour, .18 + v * .82);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a - halfWidth) * core, cy + Math.sin(a - halfWidth) * core);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.lineTo(cx + Math.cos(a + halfWidth) * core, cy + Math.sin(a + halfWidth) * core);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = rgba(settings.colour, .5 + energyAvg * .4);
      ctx.beginPath(); ctx.arc(cx, cy, core * .6, 0, Math.PI * 2); ctx.fill();
    } else if (style === 'tunnel') {
      const count = Math.max(1, Math.round(p0)), depth = p1, thickness = p2;
      for (let i = 0; i < count; i++) {
        const t = i / count, v = values[Math.floor(t * values.length)];
        const size = unit * .04 + t * unit * .5 * depth + v * unit * .06;
        ctx.strokeStyle = rgba(settings.colour, .12 + v * .7 * (1 - t * .5));
        ctx.lineWidth = thickness;
        ctx.strokeRect(cx - size, cy - size, size * 2, size * 2);
      }
    } else {
      // Unknown/future style name: fall back to plain bars at default settings
      // rather than crashing the export.
      const count = 96, gap = w / count;
      for (let i = 0; i < count; i++) {
        const v = values[Math.floor(i / count * values.length)], barH = Math.max(3, v * h * .7);
        ctx.fillStyle = rgba(settings.colour, .22 + v * .78);
        ctx.fillRect(i * gap, h - barH, gap * .72, barH);
      }
    }


}

const api={look,supportsStyle,clean,progress,AudioSource,Renderer};if(typeof module!=='undefined')module.exports=api;else root.SceneTransitions=api;
})(typeof globalThis!=='undefined'?globalThis:this);
