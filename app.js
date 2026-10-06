const $ = (id) => document.getElementById(id);
const canvas = $('canvas'), ctx = canvas.getContext('2d');
const exportOverlay = $('exportScreen');
new MutationObserver(()=>{if(!exportOverlay.hidden)requestAnimationFrame(()=>exportOverlay.classList.add('is-visible'));else exportOverlay.classList.remove('is-visible');}).observe(exportOverlay,{attributes:true,attributeFilter:['hidden']});
const audio = new Audio();
let context, analyser, source, destination, previewGain, activeUrl, loadedFile, activeExportAbort, exporting = false;
let autoplayOnLoad = false;
let exportReached80At = null; // timestamp of when progress first hit 80%, so we can swap to "hang in there" messages if it lingers
let bandHistory, previousEnergy = 0;
const particles = Array.from({length:180},()=>({x:Math.random(),y:Math.random(),s:Math.random()*2+.35,v:Math.random()*.2+.03}));
const styleParameters={bars:[['Height',.35,1.2,.7,.05],['Density',40,150,96,1],['Gap',.25,.95,.72,.01]],mirror:[['Height',.35,1.2,.7,.05],['Density',40,150,96,1],['Gap',.25,.95,.72,.01]],radial:[['Core',.06,.3,.16,.01],['Spread',.1,.5,.31,.01],['Thickness',1,10,3,1]],wave:[['Amplitude',.15,.8,.35,.01],['Thickness',1,12,4,1],['Detail',1,6,2,1]],particles:[['Density',40,300,180,1],['Speed',.2,2,1, .05],['Size',.4,4,1,.1]],aurora:[['Height',.15,.8,.5,.01],['Flow',.2,2,1,.05],['Opacity',.15,1,.8,.01]],orbit:[['Radius',.08,.4,.2,.01],['Dots',30,180,110,1],['Size',.2,3,1,.1]],rings:[['Spacing',.02,.12,.047,.005],['Thickness',1,12,4,1],['Pulse',.01,.12,.04,.005]],spiral:[['Arms',1,6,3,1],['Turns',.5,4,2,.1],['Size',.3,3,1,.1]],grid:[['Columns',8,40,22,1],['Rows',4,20,10,1],['Gap',0,.6,.22,.02]],starburst:[['Core',.04,.22,.09,.01],['Length',.15,.6,.34,.01],['Width',1,12,4,1]],tunnel:[['Rings',6,30,14,1],['Depth',.4,2,1,.05],['Thickness',1,10,3,1]]};
const styleValues={};
function valueFor(style,index){const spec=styleParameters[style]||styleParameters.bars;styleValues[style]??=spec.map(item=>item[3]);return styleValues[style][index];}
function valueForAll(style){const spec=styleParameters[style]||styleParameters.bars;return spec.map((_,index)=>valueFor(style,index));}
function renderPresetWindow(){const style=$('style').value,spec=styleParameters[style]||styleParameters.bars;$('presetStyleName').textContent=$('styleName').textContent;$('styleOptionControls').innerHTML=spec.map((item,index)=>`<div class="style-setting"><label>${item[0]}</label><input type="range" min="${item[1]}" max="${item[2]}" step="${item[4]}" value="${valueFor(style,index)}" data-style-setting="${index}"><output>${valueFor(style,index)}</output></div>`).join('');document.querySelectorAll('[data-style-setting]').forEach(input=>input.addEventListener('input',()=>{const index=Number(input.dataset.styleSetting);styleValues[style][index]=Number(input.value);input.nextElementSibling.value=input.value;}));}
function hexRgb(hex,alpha=1){const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${(n>>8)&255},${n&255},${alpha})`;} 
function clamp(value,min=0,max=1){return Math.max(min,Math.min(max,value));}
function resize(){const [w,h]=$('size').value.split('x').map(Number);canvas.width=w;canvas.height=h;}
function setup(){if(context)return;context=new AudioContext();analyser=context.createAnalyser();analyser.fftSize=4096;analyser.smoothingTimeConstant=.3;analyser.minDecibels=-100;analyser.maxDecibels=-16;source=context.createMediaElementSource(audio);destination=context.createMediaStreamDestination();previewGain=context.createGain();previewGain.gain.value=Number($('volume').value)/100;source.connect(analyser);analyser.connect(destination);analyser.connect(previewGain);previewGain.connect(context.destination);}
function visualSpectrum(count=160){const values=new Float32Array(count);if(!analyser||!context)return{values,energy:0};const decibels=new Float32Array(analyser.frequencyBinCount);analyser.getFloatFrequencyData(decibels);bandHistory??=new Float32Array(count);const response=$('response').value;const settings=response==='punchy'?{curve:1.6,boost:2.25,release:.55}:response==='smooth'?{curve:1.05,boost:.55,release:.86}:{curve:1.32,boost:1.35,release:.69};const low=Number($('rangeLow').value),high=Math.min(Number($('rangeHigh').value),context.sampleRate*.49);let energy=0;for(let band=0;band<count;band++){const startHz=low*Math.pow(high/low,band/count),endHz=low*Math.pow(high/low,(band+1)/count);const start=Math.max(0,Math.floor(startHz/context.sampleRate*analyser.fftSize)),end=Math.min(decibels.length-1,Math.ceil(endHz/context.sampleRate*analyser.fftSize));let peak=-100;for(let bin=start;bin<=end;bin++)peak=Math.max(peak,decibels[bin]);const centre=Math.sqrt(startHz*endHz);const presence=centre<190?.82:centre<1400?1:centre<8000?1.28:1.1;const base=Math.pow(clamp((peak+94)/74)*presence,settings.curve);const transient=Math.max(0,base-bandHistory[band])*settings.boost;values[band]=clamp(base+transient);bandHistory[band]=bandHistory[band]*settings.release+base*(1-settings.release);energy+=values[band];}const average=energy/count,pulse=Math.max(0,average-previousEnergy)*3.5;previousEnergy=previousEnergy*.74+average*.26;return{values,energy:clamp(average+pulse)};}
function drawBars(data,w,h,colour,mirror=false){const style=mirror?'mirror':'bars',count=Math.round(valueFor(style,1)),gap=w/count,heightScale=valueFor(style,0),gapScale=valueFor(style,2);for(let i=0;i<count;i++){const v=data[Math.floor(i/count*data.length)],height=Math.max(3,v*h*heightScale);ctx.fillStyle=hexRgb(colour,.22+v*.78);if(mirror){ctx.fillRect(i*gap,h/2-height/2,gap*gapScale,height)}else{ctx.fillRect(i*gap,h-height,gap*gapScale,height)}}}
function draw(){if(document.querySelector('main').hidden){requestAnimationFrame(draw);return;}const w=canvas.width,h=canvas.height,colour=$('colour').value,bg=$('background').value,cx=w/2,cy=h/2;ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);const spectrum=visualSpectrum(),data=spectrum.values,style=$('style').value,unit=Math.min(w,h);if(style==='bars')drawBars(data,w,h,colour);else if(style==='mirror')drawBars(data,w,h,colour,true);else if(style==='wave'){const waveform=new Uint8Array(analyser?analyser.fftSize:2048),amplitude=valueFor('wave',0),thickness=valueFor('wave',1),detail=valueFor('wave',2);if(analyser)analyser.getByteTimeDomainData(waveform);ctx.strokeStyle=colour;ctx.lineWidth=thickness;ctx.beginPath();for(let i=0;i<waveform.length;i+=detail){const x=i/(waveform.length-1)*w,y=cy+(waveform[i]/255-.5)*h*amplitude*2;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();}else if(style==='radial'){const radius=unit*valueFor('radial',0),spread=valueFor('radial',1),thickness=valueFor('radial',2);for(let i=0;i<150;i++){const a=i/150*Math.PI*2,v=data[Math.floor(i/150*data.length)],length=radius+v*unit*spread;ctx.strokeStyle=hexRgb(colour,.16+v*.84);ctx.lineWidth=thickness;ctx.beginPath();ctx.moveTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius);ctx.lineTo(cx+Math.cos(a)*length,cy+Math.sin(a)*length);ctx.stroke();}ctx.fillStyle=hexRgb(colour,.45+spectrum.energy*.45);ctx.beginPath();ctx.arc(cx,cy,radius*(.55+spectrum.energy*.23),0,Math.PI*2);ctx.fill();}else if(style==='particles'){const density=Math.round(valueFor('particles',0)),speedScale=valueFor('particles',1),sizeScale=valueFor('particles',2);particles.slice(0,density).forEach((p,i)=>{const v=data[i%data.length],speed=(.25+v*4.7)*speedScale;p.y-=p.v*speed;if(p.y<0){p.y=1;p.x=Math.random()}ctx.fillStyle=hexRgb(colour,.16+v*.84);ctx.beginPath();ctx.arc(p.x*w,p.y*h,p.s*sizeScale*(1+v*4),0,Math.PI*2);ctx.fill();});}else if(style==='aurora'){const height=valueFor('aurora',0),flow=valueFor('aurora',1),opacity=valueFor('aurora',2);ctx.beginPath();for(let i=0;i<=data.length;i++){const x=i/data.length*w,v=data[Math.min(i,data.length-1)],y=h*.68-v*h*height;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.lineTo(w,h);ctx.lineTo(0,h);ctx.closePath();const fill=ctx.createLinearGradient(0,0,0,h);fill.addColorStop(0,hexRgb(colour,opacity));fill.addColorStop(1,hexRgb(colour,0));ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=hexRgb(colour,opacity);ctx.lineWidth=Math.max(2,w/480*flow);ctx.beginPath();for(let i=0;i<data.length;i++){const x=i/(data.length-1)*w,y=h*.68-data[i]*h*height;i?ctx.lineTo(x,y):ctx.moveTo(x,y)}ctx.stroke();}else if(style==='orbit'){const dotCount=Math.round(valueFor('orbit',1)),baseRadius=valueFor('orbit',0),dotSize=valueFor('orbit',2);for(let i=0;i<dotCount;i++){const a=i/dotCount*Math.PI*2,v=data[Math.floor(i/dotCount*data.length)],radius=unit*(baseRadius+v*.24);ctx.fillStyle=hexRgb(colour,.18+v*.82);ctx.beginPath();ctx.arc(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,Math.max(1,v*unit*.011*dotSize),0,Math.PI*2);ctx.fill();}ctx.fillStyle=hexRgb(colour,.7);ctx.beginPath();ctx.arc(cx,cy,unit*.06*(1+spectrum.energy),0,Math.PI*2);ctx.fill();}else if(style==='rings'){const spacing=valueFor('rings',0),thickness=valueFor('rings',1),pulse=valueFor('rings',2);for(let i=0;i<8;i++){const v=data[Math.floor(i/8*data.length)],radius=unit*(.07+i*spacing+v*pulse);ctx.strokeStyle=hexRgb(colour,.16+v*.84);ctx.lineWidth=thickness;ctx.beginPath();ctx.arc(cx,cy,radius,0,Math.PI*2);ctx.stroke();}}else if(style==='spiral'){const arms=Math.round(valueFor('spiral',0)),turns=valueFor('spiral',1),sizeScale=valueFor('spiral',2),points=120;for(let arm=0;arm<arms;arm++){const armOffset=arm/arms*Math.PI*2;for(let i=0;i<points;i++){const t=i/points,v=data[Math.floor(t*data.length)],angle=t*turns*Math.PI*2+armOffset,radius=unit*.04+t*unit*.46*(.35+v*.65),x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius;ctx.fillStyle=hexRgb(colour,.15+v*.85);ctx.beginPath();ctx.arc(x,y,Math.max(1,(1+v*3.5)*sizeScale*(unit*.006)),0,Math.PI*2);ctx.fill();}}}else if(style==='grid'){const cols=Math.round(valueFor('grid',0)),rows=Math.round(valueFor('grid',1)),gapRatio=valueFor('grid',2),cellW=w/cols,cellH=h/rows;for(let c=0;c<cols;c++){const v=data[Math.floor(c/cols*data.length)],lit=Math.round(v*rows);for(let r=0;r<rows;r++){const on=r>=rows-lit,alpha=on?.35+(r-(rows-lit))/Math.max(1,lit)*.65:.06;ctx.fillStyle=hexRgb(colour,alpha);const pad=Math.min(cellW,cellH)*gapRatio/2;ctx.fillRect(c*cellW+pad,r*cellH+pad,cellW-pad*2,cellH-pad*2);}}}else if(style==='starburst'){const core=unit*valueFor('starburst',0),lengthScale=valueFor('starburst',1),widthScale=valueFor('starburst',2),spikes=72;for(let i=0;i<spikes;i++){const a=i/spikes*Math.PI*2,v=data[Math.floor(i/spikes*data.length)],outer=core+v*unit*lengthScale,halfWidth=(Math.PI/spikes)*widthScale*.5;ctx.fillStyle=hexRgb(colour,.18+v*.82);ctx.beginPath();ctx.moveTo(cx+Math.cos(a-halfWidth)*core,cy+Math.sin(a-halfWidth)*core);ctx.lineTo(cx+Math.cos(a)*outer,cy+Math.sin(a)*outer);ctx.lineTo(cx+Math.cos(a+halfWidth)*core,cy+Math.sin(a+halfWidth)*core);ctx.closePath();ctx.fill();}ctx.fillStyle=hexRgb(colour,.5+spectrum.energy*.4);ctx.beginPath();ctx.arc(cx,cy,core*.6,0,Math.PI*2);ctx.fill();}else if(style==='tunnel'){const count=Math.round(valueFor('tunnel',0)),depth=valueFor('tunnel',1),thickness=valueFor('tunnel',2);for(let i=0;i<count;i++){const t=i/count,v=data[Math.floor(t*data.length)],size=unit*.04+t*unit*.5*depth+v*unit*.06;ctx.strokeStyle=hexRgb(colour,.12+v*.7*(1-t*.5));ctx.lineWidth=thickness;ctx.strokeRect(cx-size,cy-size,size*2,size*2);}}requestAnimationFrame(draw);}
// --- Live Audio (system loopback) -------------------------------------
// The main draw() above paints straight onto the preview canvas/context, so
// it can't be reused for a second canvas. drawBarsOn/paintStyleOn are a
// self-contained copy of the original canvas-agnostic paint logic (takes
// its canvas context as a parameter) used only by the Live Audio view below.
function drawBarsOn(targetCtx,data,w,h,colour,mirror=false){const style=mirror?'mirror':'bars',count=Math.round(valueFor(style,1)),gap=w/count,heightScale=valueFor(style,0),gapScale=valueFor(style,2);for(let i=0;i<count;i++){const v=data[Math.floor(i/count*data.length)],height=Math.max(3,v*h*heightScale);targetCtx.fillStyle=hexRgb(colour,.22+v*.78);if(mirror){targetCtx.fillRect(i*gap,h/2-height/2,gap*gapScale,height)}else{targetCtx.fillRect(i*gap,h-height,gap*gapScale,height)}}}
function paintStyleOn(targetCtx,w,h,data,energy,style,colour,analyserNode){const cx=w/2,cy=h/2,unit=Math.min(w,h);if(style==='bars')drawBarsOn(targetCtx,data,w,h,colour);else if(style==='mirror')drawBarsOn(targetCtx,data,w,h,colour,true);else if(style==='wave'){const waveform=new Uint8Array(analyserNode?analyserNode.fftSize:2048),amplitude=valueFor('wave',0),thickness=valueFor('wave',1),detail=valueFor('wave',2);if(analyserNode)analyserNode.getByteTimeDomainData(waveform);targetCtx.strokeStyle=colour;targetCtx.lineWidth=thickness;targetCtx.beginPath();for(let i=0;i<waveform.length;i+=detail){const x=i/(waveform.length-1)*w,y=cy+(waveform[i]/255-.5)*h*amplitude*2;i?targetCtx.lineTo(x,y):targetCtx.moveTo(x,y)}targetCtx.stroke();}else if(style==='radial'){const radius=unit*valueFor('radial',0),spread=valueFor('radial',1),thickness=valueFor('radial',2);for(let i=0;i<150;i++){const a=i/150*Math.PI*2,v=data[Math.floor(i/150*data.length)],length=radius+v*unit*spread;targetCtx.strokeStyle=hexRgb(colour,.16+v*.84);targetCtx.lineWidth=thickness;targetCtx.beginPath();targetCtx.moveTo(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius);targetCtx.lineTo(cx+Math.cos(a)*length,cy+Math.sin(a)*length);targetCtx.stroke();}targetCtx.fillStyle=hexRgb(colour,.45+energy*.45);targetCtx.beginPath();targetCtx.arc(cx,cy,radius*(.55+energy*.23),0,Math.PI*2);targetCtx.fill();}else if(style==='particles'){const density=Math.round(valueFor('particles',0)),speedScale=valueFor('particles',1),sizeScale=valueFor('particles',2);particles.slice(0,density).forEach((p,i)=>{const v=data[i%data.length],speed=(.25+v*4.7)*speedScale;p.y-=p.v*speed;if(p.y<0){p.y=1;p.x=Math.random()}targetCtx.fillStyle=hexRgb(colour,.16+v*.84);targetCtx.beginPath();targetCtx.arc(p.x*w,p.y*h,p.s*sizeScale*(1+v*4),0,Math.PI*2);targetCtx.fill();});}else if(style==='aurora'){const height=valueFor('aurora',0),flow=valueFor('aurora',1),opacity=valueFor('aurora',2);targetCtx.beginPath();for(let i=0;i<=data.length;i++){const x=i/data.length*w,v=data[Math.min(i,data.length-1)],y=h*.68-v*h*height;i?targetCtx.lineTo(x,y):targetCtx.moveTo(x,y)}targetCtx.lineTo(w,h);targetCtx.lineTo(0,h);targetCtx.closePath();const fill=targetCtx.createLinearGradient(0,0,0,h);fill.addColorStop(0,hexRgb(colour,opacity));fill.addColorStop(1,hexRgb(colour,0));targetCtx.fillStyle=fill;targetCtx.fill();targetCtx.strokeStyle=hexRgb(colour,opacity);targetCtx.lineWidth=Math.max(2,w/480*flow);targetCtx.beginPath();for(let i=0;i<data.length;i++){const x=i/(data.length-1)*w,y=h*.68-data[i]*h*height;i?targetCtx.lineTo(x,y):targetCtx.moveTo(x,y)}targetCtx.stroke();}else if(style==='orbit'){const dotCount=Math.round(valueFor('orbit',1)),baseRadius=valueFor('orbit',0),dotSize=valueFor('orbit',2);for(let i=0;i<dotCount;i++){const a=i/dotCount*Math.PI*2,v=data[Math.floor(i/dotCount*data.length)],radius=unit*(baseRadius+v*.24);targetCtx.fillStyle=hexRgb(colour,.18+v*.82);targetCtx.beginPath();targetCtx.arc(cx+Math.cos(a)*radius,cy+Math.sin(a)*radius,Math.max(1,v*unit*.011*dotSize),0,Math.PI*2);targetCtx.fill();}targetCtx.fillStyle=hexRgb(colour,.7);targetCtx.beginPath();targetCtx.arc(cx,cy,unit*.06*(1+energy),0,Math.PI*2);targetCtx.fill();}else if(style==='rings'){const spacing=valueFor('rings',0),thickness=valueFor('rings',1),pulse=valueFor('rings',2);for(let i=0;i<8;i++){const v=data[Math.floor(i/8*data.length)],radius=unit*(.07+i*spacing+v*pulse);targetCtx.strokeStyle=hexRgb(colour,.16+v*.84);targetCtx.lineWidth=thickness;targetCtx.beginPath();targetCtx.arc(cx,cy,radius,0,Math.PI*2);targetCtx.stroke();}}else if(style==='spiral'){const arms=Math.round(valueFor('spiral',0)),turns=valueFor('spiral',1),sizeScale=valueFor('spiral',2),points=120;for(let arm=0;arm<arms;arm++){const armOffset=arm/arms*Math.PI*2;for(let i=0;i<points;i++){const t=i/points,v=data[Math.floor(t*data.length)],angle=t*turns*Math.PI*2+armOffset,radius=unit*.04+t*unit*.46*(.35+v*.65),x=cx+Math.cos(angle)*radius,y=cy+Math.sin(angle)*radius;targetCtx.fillStyle=hexRgb(colour,.15+v*.85);targetCtx.beginPath();targetCtx.arc(x,y,Math.max(1,(1+v*3.5)*sizeScale*(unit*.006)),0,Math.PI*2);targetCtx.fill();}}}else if(style==='grid'){const cols=Math.round(valueFor('grid',0)),rows=Math.round(valueFor('grid',1)),gapRatio=valueFor('grid',2),cellW=w/cols,cellH=h/rows;for(let c=0;c<cols;c++){const v=data[Math.floor(c/cols*data.length)],lit=Math.round(v*rows);for(let r=0;r<rows;r++){const on=r>=rows-lit,alpha=on?.35+(r-(rows-lit))/Math.max(1,lit)*.65:.06;targetCtx.fillStyle=hexRgb(colour,alpha);const pad=Math.min(cellW,cellH)*gapRatio/2;targetCtx.fillRect(c*cellW+pad,r*cellH+pad,cellW-pad*2,cellH-pad*2);}}}else if(style==='starburst'){const core=unit*valueFor('starburst',0),lengthScale=valueFor('starburst',1),widthScale=valueFor('starburst',2),spikes=72;for(let i=0;i<spikes;i++){const a=i/spikes*Math.PI*2,v=data[Math.floor(i/spikes*data.length)],outer=core+v*unit*lengthScale,halfWidth=(Math.PI/spikes)*widthScale*.5;targetCtx.fillStyle=hexRgb(colour,.18+v*.82);targetCtx.beginPath();targetCtx.moveTo(cx+Math.cos(a-halfWidth)*core,cy+Math.sin(a-halfWidth)*core);targetCtx.lineTo(cx+Math.cos(a)*outer,cy+Math.sin(a)*outer);targetCtx.lineTo(cx+Math.cos(a+halfWidth)*core,cy+Math.sin(a+halfWidth)*core);targetCtx.closePath();targetCtx.fill();}targetCtx.fillStyle=hexRgb(colour,.5+energy*.4);targetCtx.beginPath();targetCtx.arc(cx,cy,core*.6,0,Math.PI*2);targetCtx.fill();}else if(style==='tunnel'){const count=Math.round(valueFor('tunnel',0)),depth=valueFor('tunnel',1),thickness=valueFor('tunnel',2);for(let i=0;i<count;i++){const t=i/count,v=data[Math.floor(t*data.length)],size=unit*.04+t*unit*.5*depth+v*unit*.06;targetCtx.strokeStyle=hexRgb(colour,.12+v*.7*(1-t*.5));targetCtx.lineWidth=thickness;targetCtx.strokeRect(cx-size,cy-size,size*2,size*2);}}}

// --- Live Audio (system loopback) -------------------------------------
// Mirrors visualSpectrum()/draw() above but against a second AudioContext
// fed by navigator.mediaDevices.getDisplayMedia({audio:true}) (system-wide
// loopback, granted without a picker dialog by main.js's
// setDisplayMediaRequestHandler). Kept as its own small state machine
// rather than reusing the file-playback analyser, since the two audio
// graphs are independent and can run at the same time.
let liveStream, liveAudioContext, liveAnalyser, liveActive = false;
let liveBandHistory, livePreviousEnergy = 0;
function computeLiveSpectrum(count = 160) {
  const values = new Float32Array(count);
  if (!liveAnalyser || !liveAudioContext) return { values, energy: 0 };
  const decibels = new Float32Array(liveAnalyser.frequencyBinCount);
  liveAnalyser.getFloatFrequencyData(decibels);
  liveBandHistory ??= new Float32Array(count);
  const response = liveLook?.response || $('response').value;
  const settings = response === 'punchy' ? { curve: 1.6, boost: 2.25, release: .55 } : response === 'smooth' ? { curve: 1.05, boost: .55, release: .86 } : { curve: 1.32, boost: 1.35, release: .69 };
  const low = 20, high = Math.min(20000, liveAudioContext.sampleRate * .49);
  let energy = 0;
  for (let band = 0; band < count; band++) {
    const startHz = low * Math.pow(high / low, band / count), endHz = low * Math.pow(high / low, (band + 1) / count);
    const start = Math.max(0, Math.floor(startHz / liveAudioContext.sampleRate * liveAnalyser.fftSize)), end = Math.min(decibels.length - 1, Math.ceil(endHz / liveAudioContext.sampleRate * liveAnalyser.fftSize));
    let peak = -100;
    for (let bin = start; bin <= end; bin++) peak = Math.max(peak, decibels[bin]);
    const centre = Math.sqrt(startHz * endHz), presence = centre < 190 ? .82 : centre < 1400 ? 1 : centre < 8000 ? 1.28 : 1.1;
    const base = Math.pow(clamp((peak + 94) / 74) * presence, settings.curve), transient = Math.max(0, base - liveBandHistory[band]) * settings.boost;
    values[band] = clamp(base + transient);
    liveBandHistory[band] = liveBandHistory[band] * settings.release + base * (1 - settings.release);
    energy += values[band];
  }
  const average = energy / count, pulse = Math.max(0, average - livePreviousEnergy) * 3.5;
  livePreviousEnergy = livePreviousEnergy * .74 + average * .26;
  return { values, energy: clamp(average + pulse) };
}
function liveDraw(now = performance.now()) {
  if (!liveActive) return;
  const liveCanvas = $('liveCanvas'), liveCtx = liveCanvas.getContext('2d');
  const w = liveCanvas.width, h = liveCanvas.height, style = liveLook?.style || $('style').value;
  const albumColour = animatedAlbumColour(performance.now());
  const colour = albumColour || liveLook?.colour || $('colour').value;
  const bg = albumColour ? hexRgb(albumColour, 1).replace(/rgba\((\d+),(\d+),(\d+),1\)/, (_,r,g,b)=>'rgb('+[r,g,b].map(v=>Math.round(Number(v)*.07+8)).join(',')+')') : liveLook?.background || $('background').value;
  liveCtx.fillStyle = bg; liveCtx.fillRect(0, 0, w, h);
  const spectrum = computeLiveSpectrum();
  const savedParams = styleValues[style];
  if (Array.isArray(liveLook?.params)) styleValues[style] = liveLook.params;
  try { paintStyleOn(liveCtx, w, h, spectrum.values, spectrum.energy, style, colour, liveAnalyser); }
  finally { if (savedParams) styleValues[style] = savedParams; else delete styleValues[style]; }
  window.liveRecordingFrame?.(now);
  requestAnimationFrame(liveDraw);
}
async function startLiveAudio() {
  if (liveActive || $('liveAudioStart').disabled) return;
  $('liveAudioStart').disabled = true;
  const statusEl = $('liveAudioStatus');
  try {
    statusEl.textContent = 'Requesting system audio…';
    // main.js's setDisplayMediaRequestHandler answers this with a fixed
    // screen source + audio:'loopback' and skips the OS picker dialog.
    liveStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: { channelCount: 2, sampleRate: 48000, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const audioTracks = liveStream.getAudioTracks();
    if (!audioTracks.length) throw new Error('No system audio track was returned — loopback capture may not be supported here.');
    liveAudioContext = new AudioContext();
    liveAnalyser = liveAudioContext.createAnalyser();
    liveAnalyser.fftSize = 4096; liveAnalyser.smoothingTimeConstant = .3; liveAnalyser.minDecibels = -100; liveAnalyser.maxDecibels = -16;
    liveAudioContext.createMediaStreamSource(liveStream).connect(liveAnalyser);
    liveStream.getVideoTracks().forEach(track => track.stop()); // never displayed, only needed to satisfy getDisplayMedia
    liveActive = true;
    $('liveAudioStop').disabled = false;
    $('liveAudioStart').hidden = true;
    $('liveCanvas').hidden = false;
    statusEl.textContent = 'Capturing desktop audio. Choose a saved template while you listen.';
    liveDraw();
    audioTracks[0].addEventListener('ended', stopLiveAudio);
  } catch (err) {
    stopLiveAudio();
    statusEl.textContent = `Couldn't start system audio capture: ${err.message}`;
  } finally { $('liveAudioStart').disabled = false; }
}
function stopLiveAudio() {
  window.dispatchEvent(new Event('live-capture-stopping'));
  liveActive = false;
  if (liveStream) liveStream.getTracks().forEach(track => track.stop());
  if (liveAudioContext) liveAudioContext.close().catch(() => {});
  liveStream = liveAudioContext = liveAnalyser = undefined;
  liveBandHistory = undefined; livePreviousEnergy = 0;
  const startBtn = $('liveAudioStart'); if (startBtn) startBtn.hidden = false;
  $('liveAudioStop').disabled = true;
  const statusEl = $('liveAudioStatus'); if (statusEl) statusEl.textContent = '';
}
$('liveAudioStart')?.addEventListener('click', startLiveAudio);
$('liveAudioStop').addEventListener('click', stopLiveAudio);
$('liveFullscreen').addEventListener('click', toggleFullscreen);
let liveLook = null;
const idleLiveCtx = $('liveCanvas').getContext('2d');
idleLiveCtx.fillStyle = $('background').value;
idleLiveCtx.fillRect(0, 0, 1280, 720);
idleLiveCtx.fillStyle = '#aeb5cb'; idleLiveCtx.font = '24px sans-serif'; idleLiveCtx.textAlign = 'center';
idleLiveCtx.fillText('Start capture to bring your music to life', 640, 360);
$('nowPlayingRefresh').addEventListener('click', async () => {
  const button = $('nowPlayingRefresh'); button.disabled = true;
  try { applyDesktopTrack(await window.nowPlaying?.get()); showMediaNotice(window.nowPlaying ? 'Track information refreshed.' : 'Track detection is available in the Windows desktop app.'); }
  catch { $('nowPlayingStatus').textContent = 'Could not refresh track information. Try again.'; }
  finally { button.disabled = false; }
});
$('nowPlayingVisualise').addEventListener('click', () => { document.querySelector('[data-live-view="liveaudio"]').click(); startLiveAudio(); });
let applyDesktopTrack = () => {};

// --- Live: diagonal Now Playing / Live Audio toggle ---------------------
(() => {
  const toggle = $('liveToggle');
  if (!toggle) return;
  const options = [...toggle.querySelectorAll('.live-toggle-option')];
  const panels = { nowplaying: $('liveNowPlaying'), liveaudio: $('liveAudioPanel') };
  options.forEach(option => option.addEventListener('click', () => {
    const view = option.dataset.liveView;

    options.forEach(item => { item.classList.toggle('selected', item === option); item.setAttribute('aria-selected', String(item === option)); });
    syncMediaLayout(view);
    refreshLiveTemplates();
    Object.entries(panels).forEach(([key, panel]) => panel.classList.toggle('is-active', key === view));
    if (view !== 'liveaudio' && liveActive) stopLiveAudio();
  }));
})();


function setLiveQuality() {
  const height = Number($('liveQuality').value), canvas=$('liveCanvas');
  canvas.width=Math.round(height*16/9); canvas.height=height;
  try { localStorage.setItem('visualiserLiveQuality',String(height)); } catch {}
  if (!liveActive) {
    const context=canvas.getContext('2d'); context.fillStyle=$('background').value; context.fillRect(0,0,canvas.width,height);
    context.fillStyle='#aeb5cb'; context.font= Math.round(height/30)+'px sans-serif'; context.textAlign='center';
    context.fillText('Start capture to bring your music to life',canvas.width/2,height/2);
  }
}
try { const saved=localStorage.getItem('visualiserLiveQuality'); if(['720','1080','1440','2160'].includes(saved))$('liveQuality').value=saved; } catch {}
$('liveQuality').addEventListener('change',setLiveQuality);
setLiveQuality();
$('mediaPlayPause').addEventListener('animationend',()=>$('mediaPlayPause').classList.remove('button-used'));
let desktopMedia = null, mediaNoticeTimer;
let mediaScrubbing = false;
let albumPalette = [], albumRGB = null, albumFrameTime = 0;
function extractAlbumPalette(pixels) {
  const buckets = new Map();
  for (let i=0;i<pixels.length;i+=4) {
    const rgb=Array.from(pixels.slice(i,i+3)),max=Math.max(...rgb),min=Math.min(...rgb);
    const luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    if(pixels[i+3]<200 || luminance>215 || luminance<28 || max-min<22)continue;
    const key=rgb.map(v=>Math.floor(v/32)).join(',');
    const bin=buckets.get(key)||{sum:[0,0,0],count:0}; bin.count++;rgb.forEach((v,j)=>bin.sum[j]+=v); buckets.set(key,bin);
  }
  const colours=[];
  for(const bin of [...buckets.values()].sort((a,b)=>b.count-a.count)) {
    let rgb=bin.sum.map(v=>v/bin.count);
    const light=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
    const scale=Math.min(1,180/Math.max(...rgb),130/light);
    rgb=rgb.map(v=>Math.round(v*scale));
    if(colours.every(c=>Math.hypot(...rgb.map((v,j)=>v-c[j]))>50))colours.push(rgb);
    if(colours.length===4)break;
  }
  return colours.length?colours:[[115,98,175],[67,130,145]];
}
function animatedAlbumColour(now) {
  if(!albumPalette.length || !$('liveAlbumColours').checked)return null;
  const reduced=document.body.classList.contains('reduce-motion');
  const phase=reduced?0:now/8000,index=Math.floor(phase)%albumPalette.length;
  const blend=reduced?0:(1-Math.cos((phase%1)*Math.PI))/2;
  const target=albumPalette[index].map((v,j)=>v+(albumPalette[(index+1)%albumPalette.length][j]-v)*blend);
  const dt=albumFrameTime?Math.min(100,now-albumFrameTime):16;albumFrameTime=now;
  albumRGB ||= target.slice();const ease=1-Math.exp(-dt/1600);
  albumRGB=albumRGB.map((v,j)=>v+(target[j]-v)*ease);
  return '#'+albumRGB.map(v=>Math.round(v).toString(16).padStart(2,'0')).join('');
}
$('nowPlayingArt').addEventListener('load',()=>{
  try {
    const sample=document.createElement('canvas');sample.width=48;sample.height=48;
    const context=sample.getContext('2d',{willReadFrequently:true});context.drawImage($('nowPlayingArt'),0,0,48,48);
    albumPalette=extractAlbumPalette(context.getImageData(0,0,48,48).data);
    const hex=rgb=>'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
    $('screen-live').style.setProperty('--album-glow',hex(albumPalette[0]));
    $('screen-live').style.setProperty('--album-glow-secondary',hex(albumPalette[1]||albumPalette[0]));
  } catch { albumPalette=[]; }
});
$('nowPlayingArt').addEventListener('error',()=>{albumPalette=[];});
$('mediaSeek').addEventListener('input',()=>{
  mediaScrubbing=true;const seek=$('mediaSeek');
  seek.style.setProperty('--progress',Number(seek.value)/Number(seek.max)*100+'%');
  $('mediaElapsed').textContent=format(Number(seek.value));
});
$('mediaSeek').addEventListener('blur',()=>{mediaScrubbing=false;updateMediaControls();});
function showMediaNotice(text) {
  clearTimeout(mediaNoticeTimer); const status=$('nowPlayingStatus');
  status.classList.remove('fading'); status.textContent=text;
  mediaNoticeTimer=setTimeout(()=>status.classList.add('fading'),3000);
}
function syncMediaLayout(view) {
  view ||= document.querySelector('[data-live-view].selected')?.dataset.liveView;
  const alongside = view==='liveaudio' && !!desktopMedia;
  $('livePanels').classList.toggle('has-media',alongside);
  const parent = document.fullscreenElement === $('liveStage') ? $('liveStage') : alongside ? $('livePanels') : $('liveNowPlaying');
  if ($('nowPlayingCard').parentElement !== parent) parent.append($('nowPlayingCard'));
}
document.addEventListener('fullscreenchange', () => syncMediaLayout());
try {
  const saved = localStorage.getItem('visualiserFullscreenPlayer');
  if (['auto','pinned','hidden'].includes(saved)) $('fullscreenPlayerMode').value = saved;
} catch {}
function applyFullscreenPlayerMode() {
  $('liveStage').dataset.playerMode = $('fullscreenPlayerMode').value;
  try { localStorage.setItem('visualiserFullscreenPlayer', $('fullscreenPlayerMode').value); } catch {}
}
$('fullscreenPlayerMode').addEventListener('change', applyFullscreenPlayerMode);
applyFullscreenPlayerMode();
// Drag the fullscreen card without interfering with its media controls.
(() => {
  const card = $('nowPlayingCard'), stage = $('liveStage');
  let drag = null, returnAnimation = null;
  const cancelReturn = () => {
    if(returnAnimation) { returnAnimation.cancel(); returnAnimation=null; }
    card.classList.remove('player-returning');
  };
  const controls = 'button,input,select,label,a,.media-timeline,.media-transport';
  const reset = (animate = false) => {
    const from=card.getBoundingClientRect();
    cancelReturn();
    card.style.removeProperty('left'); card.style.removeProperty('top');
    card.style.removeProperty('right'); card.style.removeProperty('bottom');
    if(!animate || document.body.classList.contains('reduce-motion') || window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
    card.classList.add('player-returning');
    const to=card.getBoundingClientRect(),dx=from.left-to.left,dy=from.top-to.top;
    if(Math.hypot(dx,dy)<1){card.classList.remove('player-returning');return;}
    const translate=(x,y)=>'translate('+x+'px,'+y+'px)';
    const animation=card.animate([
      {transform:translate(dx,dy),offset:0},
      {transform:translate(-dx*.025,-dy*.025),offset:.72},
      {transform:translate(dx*.006,dy*.006),offset:.9},
      {transform:'translate(0,0)',offset:1}
    ],{duration:650,easing:'cubic-bezier(.2,.75,.3,1)'});
    returnAnimation=animation;
    animation.onfinish=()=>{if(returnAnimation===animation){returnAnimation=null;card.classList.remove('player-returning');}};
  };
  const position = (left, top) => {
    const bounds=stage.getBoundingClientRect();
    card.style.left=Math.max(0,Math.min(bounds.width-card.offsetWidth,left))+'px';
    card.style.top=Math.max(0,Math.min(bounds.height-card.offsetHeight,top))+'px';
    card.style.right='auto';card.style.bottom='auto';
  };
  const finish = event => {
    if (!drag || (event && event.pointerId !== drag.id)) return;
    const id=drag.id;drag=null;card.classList.remove('player-dragging');
    if(card.hasPointerCapture(id))card.releasePointerCapture(id);
  };
  card.addEventListener('pointerdown', event => {
    if(document.fullscreenElement!==stage || event.button!==0 || event.target.closest(controls))return;
    const bounds=card.getBoundingClientRect(),stageBounds=stage.getBoundingClientRect();
    if(returnAnimation){cancelReturn();position(bounds.left-stageBounds.left,bounds.top-stageBounds.top);}
    drag={id:event.pointerId,x:event.clientX,y:event.clientY,left:bounds.left-stageBounds.left,top:bounds.top-stageBounds.top};
    card.setPointerCapture(event.pointerId);card.classList.add('player-dragging');event.preventDefault();
  });
  card.addEventListener('pointermove',event=>{
    if(!drag || event.pointerId!==drag.id)return;
    position(drag.left+event.clientX-drag.x,drag.top+event.clientY-drag.y);
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(name=>card.addEventListener(name,finish));
  card.addEventListener('dblclick',event=>{
    if(document.fullscreenElement!==stage)return;
    finish();reset(true);
  });
  document.addEventListener('fullscreenchange',()=>{finish();if(document.fullscreenElement!==stage)reset();});
  window.addEventListener('resize',()=>{
    if(returnAnimation){cancelReturn();reset();}
    if(document.fullscreenElement===stage && card.style.left)position(parseFloat(card.style.left),parseFloat(card.style.top));
  });
})();
function refreshLiveTemplates() {
  const select=$('liveTemplate'),previous=select.value,templates=loadTemplates();
  select.replaceChildren(new Option(templates.length ? 'Choose a template' : 'No available templates',''));
  templates.forEach(t=>select.add(new Option(t.name,t.id)));
  select.disabled=!templates.length;
  select.value=templates.some(t=>t.id===previous)?previous:'';
  if(!select.value)liveLook=null;
}
$('liveTemplate').addEventListener('pointerdown',refreshLiveTemplates);
$('liveTemplate').addEventListener('focus',refreshLiveTemplates);
$('liveTemplate').addEventListener('change',()=>{
  liveLook=loadTemplates().find(t=>t.id===$('liveTemplate').value)||null;
  liveBandHistory=undefined; livePreviousEnergy=0;
});
function updateMediaControls() {
  const d=desktopMedia, start=Number(d?.start)||0,end=Number(d?.end)||0,pos=Number(d?.position)||0;
  const duration=Math.max(0,end-start),elapsed=Math.max(0,Math.min(duration,pos-start));
  if(!mediaScrubbing)$('mediaElapsed').textContent=format(elapsed); $('mediaDuration').textContent='/ '+(duration?format(duration):'—:—');
  const seek=$('mediaSeek'); seek.max=duration||1; if(!mediaScrubbing)seek.value=elapsed;
  seek.disabled=!duration||!d?.canSeek;
  if(!mediaScrubbing)seek.style.setProperty('--progress',duration?elapsed/duration*100+'%':'0%');
  $('mediaBackTrack').disabled=!d?.canPrevious;
  $('mediaSkipTrack').disabled=!d?.canNext;
  $('mediaPrevious').disabled=!duration||!d?.canSeek; $('mediaNext').disabled=!duration||!d?.canSeek;
  const playPause = $('mediaPlayPause'), symbol=d?.playbackStatus==='Playing'?'Ⅱ':'▶';
  playPause.disabled=!d?.canToggle;
  if(playPause.textContent!==symbol)playPause.textContent=symbol;
  $('mediaPlayPause').setAttribute('aria-label',d?.playbackStatus==='Playing'?'Pause media':'Play media');
}
async function controlDesktopMedia(action,position) {
  try { if(!await window.nowPlaying?.control(action,position))showMediaNotice('This media app could not perform that action.'); }
  catch { showMediaNotice('Media control unavailable. Try again.'); }
}
$('mediaBackTrack').addEventListener('click',()=>controlDesktopMedia('previous'));
$('mediaSkipTrack').addEventListener('click',()=>controlDesktopMedia('next'));
$('mediaPrevious').addEventListener('click',()=>seekDesktopBy(-10));
$('mediaNext').addEventListener('click',()=>seekDesktopBy(10));
$('mediaPlayPause').addEventListener('click',()=>controlDesktopMedia('toggle'));
function seekDesktopBy(delta) {
  if(!desktopMedia?.canSeek)return;
  const start=Number(desktopMedia.start)||0,end=Number(desktopMedia.end)||0;
  controlDesktopMedia('seek',Math.max(start,Math.min(end,(Number(desktopMedia.position)||0)+delta)));
}
$('mediaSeek').addEventListener('change',()=>{
  mediaScrubbing=false;
  const position=Number($('mediaSeek').value)+(Number(desktopMedia?.start)||0);
  if(desktopMedia)desktopMedia.position=position;
  updateMediaControls();controlDesktopMedia('seek',position);
});
// --- Live: "Now Playing" (SMTC, Windows-only — see main.js) -------------
(() => {
  const emptyEl = $('nowPlayingEmpty'), cardEl = $('nowPlayingCard'), artEl = $('nowPlayingArt'), titleEl = $('nowPlayingTitle'), artistEl = $('nowPlayingArtist');
  if (!emptyEl) return;
  function applyNowPlaying(data) {
    desktopMedia = data?.title ? data : null;
    syncMediaLayout();
    updateMediaControls();
    if (!data?.artwork) { albumPalette=[];albumRGB=null;$('screen-live').style.removeProperty('--album-glow');$('screen-live').style.removeProperty('--album-glow-secondary'); }
    if (!desktopMedia) { $('albumArtOpen').disabled=true; emptyEl.hidden = false; cardEl.hidden = true; return; }
    emptyEl.hidden = true; cardEl.hidden = false;
    titleEl.textContent = data.title; artistEl.textContent = data.artist || '';
    $('nowPlayingState').textContent = data.playbackStatus || 'Media detected';
    $('mediaSource').textContent = mediaSourceName(data);
    artEl.hidden = !data.artwork;
    $('albumArtOpen').disabled = !data.artwork || !!document.fullscreenElement;
    if (data.artwork && artEl.src !== data.artwork) artEl.src = data.artwork;
  }
  applyDesktopTrack = applyNowPlaying;
  if (window.nowPlaying) {
    window.nowPlaying.onChange(applyNowPlaying);
    window.nowPlaying.get().then(applyNowPlaying).catch(() => applyNowPlaying(null));
  } else {
    applyNowPlaying(null); // no Electron preload bridge available — stay on the empty state
  }
})();

function format(seconds){return `${Math.floor(seconds/60)}:${String(Math.floor(seconds%60)||0).padStart(2,'0')}`;}
function closeStyleMenu(){$('styleMenu').hidden=true;$('styleToggle').setAttribute('aria-expanded','false');}
function closeRangeMenu(){$('rangeMenu').hidden=true;$('rangeToggle').setAttribute('aria-expanded','false');}
function closeSimpleMenus(){document.querySelectorAll('.simple-menu').forEach((menu)=>menu.hidden=true);document.querySelectorAll('.simple-picker .range-toggle').forEach((toggle)=>toggle.setAttribute('aria-expanded','false'));
}
function formatFrequency(value){return value>=10000?`${Number((value/1000).toFixed(1))}k Hz`:`${value} Hz`;}
function updateRange(changed){let low=Number($('rangeLow').value),high=Number($('rangeHigh').value);if(changed==='low'&&low>=high)high=Math.min(24000,low+10);if(changed==='high'&&high<=low)low=Math.max(20,high-10);$('rangeLow').value=low;$('rangeHigh').value=high;$('rangeLowText').value=low;$('rangeHighText').value=high;const left=(low-20)/(24000-20)*100,right=100-(high-20)/(24000-20)*100;$('rangeFill').style.left=`${left}%`;$('rangeFill').style.right=`${right}%`;$('rangeLabel').textContent=`${formatFrequency(low)}–${formatFrequency(high)}`;bandHistory=undefined;previousEnergy=0;}
function updatePreviewMeta(){const [width,height]=$('size').value.split('x');$('previewMeta').innerHTML=`${$('aspect').value}&nbsp;&nbsp;•&nbsp;&nbsp;${width} × ${height}&nbsp;&nbsp;•&nbsp;&nbsp;${$('framerate').value} FPS`;}
function updateSize(){const [a,b]=$('aspect').value.split(':').map(Number),height=Number($('resolution').value),width=Math.round(height*a/b/2)*2;$('size').value=`${width}x${height}`;$('sizeLabel').textContent=$('aspect').value==='16:9'&&height===1080?'1080p (default)':`${$('aspect').value} | ${height}p`;updatePreviewMeta();resize();}
function closeColourMenus(){document.querySelectorAll('.colour-menu').forEach((menu)=>menu.hidden=true);document.querySelectorAll('.colour-toggle').forEach((toggle)=>toggle.setAttribute('aria-expanded','false'));}
function configureColourPicker(picker){const input=picker.querySelector('input[type="hidden"]'),toggle=picker.querySelector('.colour-toggle'),menu=picker.querySelector('.colour-menu'),swatch=picker.querySelector('.colour-swatch'),channels=[...picker.querySelectorAll('[data-channel]')],outputs=[...picker.querySelectorAll('output')];const set=(hex)=>{input.value=hex;swatch.style.background=hex;toggle.style.background='var(--panel)';menu.style.background=`radial-gradient(circle at 50% 50%,${hex} 0%,${hex} 76%,#171b29 100%)`;const value=parseInt(hex.slice(1),16),rgb=[value>>16,(value>>8)&255,value&255],luminance=(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)/255;text= luminance>.57?'#111522':'#f6f7fb';menu.style.setProperty('--picker-text',text);menu.style.setProperty('--picker-input-text',luminance>.57?'#15192a':'#f6f7fb');channels.forEach((channel,index)=>{channel.value=rgb[index];outputs[index].value=rgb[index];});bandHistory=undefined;previousEnergy=0;};set(input.value);toggle.addEventListener('click',()=>{const open=menu.hidden;closeColourMenus();menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));});channels.forEach((channel)=>channel.addEventListener('input',()=>{const rgb=channels.map((item)=>Number(item.value));set(`#${rgb.map((value)=>value.toString(16).padStart(2,'0')).join('')}`);}));}
const volumeEl = $('volume');if(volumeEl){volumeEl.addEventListener('wheel',(e)=>{if(volumeEl.disabled)return;e.preventDefault();const stepSize=e.ctrlKey?1:5;const step=(e.deltaY<0?1:-1)*stepSize;const min=Number(volumeEl.min||0),max=Number(volumeEl.max||100);let v=Number(volumeEl.value)+step;v=Math.max(min,Math.min(max,v));if(v!==Number(volumeEl.value)){volumeEl.value=v;volumeEl.dispatchEvent(new Event('input',{bubbles:true}));}}, {passive:false});}
const originalConfigure = configureColourPicker;configureColourPicker = function(picker){originalConfigure(picker);try{const input=picker.querySelector('input[type="hidden"]');if(picker.dataset.colourPicker==='colour'&&input){const setAccent=(hex)=>{if(volumeEl){try{volumeEl.style.setProperty('accent-color',hex);volumeEl.style.accentColor=hex;volumeEl.style.setProperty('--volume-accent',hex);}catch(e){}}};setAccent(input.value);const channels=[...picker.querySelectorAll('[data-channel]')];channels.forEach(ch=>ch.addEventListener('input',()=>{const rgb=channels.map((item)=>Number(item.value));setAccent(`#${rgb.map((v)=>v.toString(16).padStart(2,'0')).join('')}`);}));}}catch(e){};};
document.querySelectorAll('.colour-picker').forEach(configureColourPicker);function configureSimplePicker(picker){const key=picker.dataset.picker,input=$(key),toggle=picker.querySelector('.range-toggle'),menu=picker.querySelector('.simple-menu'),label=picker.querySelector(`[id="${key}Label"]`);toggle.addEventListener('click',()=>{const open=menu.hidden;closeSimpleMenus();menu.hidden=!open;toggle.setAttribute('aria-expanded',String(open));});picker.querySelectorAll('.simple-option').forEach((option)=>option.addEventListener('click',()=>{input.value=option.dataset.value;label.textContent=option.textContent;picker.querySelectorAll('.simple-option').forEach((item)=>item.classList.toggle('selected',item===option));input.dispatchEvent(new Event(key==='response'?'input':'change'));closeSimpleMenus();}));}
// A tiny seeded PRNG so preview icons look "randomly" scattered but render
// byte-for-byte identically every time — Math.random() here would make
// template thumbnails visibly jitter on every re-render (e.g. after any
// rename/delete/pin action elsewhere in the grid).
function seededRandom(seed){
  let s=seed>>>0;
  return function(){
    s=(s*1664525+1013904223)>>>0;
    return s/4294967296;
  };
}
function drawStylePreviewIcon(c,w,h,type,colourHex,bgHex){colourHex=colourHex||'#8e7cff';bgHex=bgHex||'#111520';c.fillStyle=bgHex;c.fillRect(0,0,w,h);c.strokeStyle=colourHex;c.fillStyle=colourHex;if(type==='bars'||type==='mirror'){for(let i=0;i<34;i++){const bh=15+Math.abs(Math.sin(i*.62))*78;c.globalAlpha=.35+bh/140;c.fillRect(i*7.3,type==='mirror'?h/2-bh/2:h-bh,5,bh)}}else if(type==='wave'||type==='aurora'){c.globalAlpha=1;c.lineWidth=3;c.beginPath();for(let x=0;x<=w;x+=3){const y=h/2+Math.sin(x*.08)*19+Math.sin(x*.027)*13;x?c.lineTo(x,y):c.moveTo(x,y)}if(type==='aurora'){c.lineTo(w,h);c.lineTo(0,h);c.closePath();c.globalAlpha=.65;c.fill()}else c.stroke()}else if(type==='particles'||type==='orbit'){const rand=seededRandom(42);for(let i=0;i<55;i++){const a=i/55*Math.PI*2,r=type==='orbit'?25+Math.abs(Math.sin(i*.71))*30:rand()*92;c.globalAlpha=.28+rand()*.72;c.beginPath();c.arc(type==='orbit'?w/2+Math.cos(a)*r:rand()*w,type==='orbit'?h/2+Math.sin(a)*r:rand()*h,2+rand()*3,0,Math.PI*2);c.fill()}}else if(type==='radial'){const cx=w/2,cy=h/2;for(let i=0;i<40;i++){const a=i/40*Math.PI*2,len=14+Math.abs(Math.sin(i*.5))*46;c.globalAlpha=.3+Math.abs(Math.sin(i*.5))*.7;c.lineWidth=2;c.beginPath();c.moveTo(cx+Math.cos(a)*10,cy+Math.sin(a)*10);c.lineTo(cx+Math.cos(a)*(10+len),cy+Math.sin(a)*(10+len));c.stroke();}c.globalAlpha=.8;c.beginPath();c.arc(cx,cy,9,0,Math.PI*2);c.fill();}else if(type==='spiral'){const cx=w/2,cy=h/2;for(let i=0;i<70;i++){const t=i/70,angle=t*Math.PI*2*2.4,r=6+t*Math.min(w,h)*.42;c.globalAlpha=.25+t*.6;c.beginPath();c.arc(cx+Math.cos(angle)*r,cy+Math.sin(angle)*r,2+t*2,0,Math.PI*2);c.fill();}}else if(type==='grid'){const cols=16,rows=8,cellW=w/cols,cellH=h/rows;for(let cI=0;cI<cols;cI++){const lit=Math.round((1+Math.sin(cI*.7))/2*rows);for(let r=0;r<rows;r++){const on=r>=rows-lit;c.globalAlpha=on?.85:.08;c.fillRect(cI*cellW+1,r*cellH+1,cellW-2,cellH-2);}}}else if(type==='starburst'){const cx=w/2,cy=h/2,core=8;for(let i=0;i<28;i++){const a=i/28*Math.PI*2,len=10+Math.abs(Math.sin(i*.6))*50,hw=.14;c.globalAlpha=.3+Math.abs(Math.sin(i*.6))*.7;c.beginPath();c.moveTo(cx+Math.cos(a-hw)*core,cy+Math.sin(a-hw)*core);c.lineTo(cx+Math.cos(a)*(core+len),cy+Math.sin(a)*(core+len));c.lineTo(cx+Math.cos(a+hw)*core,cy+Math.sin(a+hw)*core);c.closePath();c.fill();}}else if(type==='tunnel'){const cx=w/2,cy=h/2;for(let i=0;i<9;i++){const t=i/9,size=8+t*58;c.globalAlpha=.2+t*.75;c.lineWidth=2;c.strokeRect(cx-size,cy-size,size*2,size*2);}}else{for(let i=0;i<7;i++){c.globalAlpha=.4+i*.07;c.lineWidth=2;c.beginPath();c.arc(w/2,h/2,12+i*7,0,Math.PI*2);c.stroke()}}c.globalAlpha=1;}
function renderStylePreviews(){document.querySelectorAll('[data-preview]').forEach((previewCanvas)=>{drawStylePreviewIcon(previewCanvas.getContext('2d'),previewCanvas.width,previewCanvas.height,previewCanvas.dataset.preview);});}
function loadAudio(file){if(!file){$('status').textContent='Please choose an audio file.';return;}const isAudio=file.type?.startsWith('audio/')||/\.(mp3|wav|m4a|ogg|flac|aac|aiff|alac|opus)$/i.test(file.name||'');if(!isAudio){$('status').textContent='Please choose an audio file.';return;}loadedFile=file;if(activeUrl)URL.revokeObjectURL(activeUrl);activeUrl=URL.createObjectURL(file);audio.src=activeUrl;$('title').textContent=file.name.replace(/\.[^.]+$/,'');$('play').disabled=false;$('export').disabled=false;document.querySelectorAll('#previewControls button,#previewControls input').forEach((control)=>control.disabled=false);$('dropZone').classList.add('has-file');$('dropZone').querySelector('strong').textContent=file.name;$('dropZone').querySelector('small').textContent='Ready to preview or export';$('status').textContent=`${file.name} is ready to be previewed or exported.`;setup();if(autoplayOnLoad){context.resume().then(()=>audio.play().catch(()=>{}));}}
function handleFileSelection(event){const file=event.target?.files?.[0]||event.dataTransfer?.files?.[0];if(file)loadAudio(file);}
$('file').addEventListener('change',handleFileSelection);$('dropZone').addEventListener('click',()=>$('file').click());['dragenter','dragover'].forEach((type)=>$('dropZone').addEventListener(type,(event)=>{event.preventDefault();$('dropZone').classList.add('dragging');}));['dragleave','drop'].forEach((type)=>$('dropZone').addEventListener(type,(event)=>{event.preventDefault();$('dropZone').classList.remove('dragging');}));$('dropZone').addEventListener('drop',handleFileSelection);async function togglePlayback(){if(!context)return;await context.resume();if(audio.paused)await audio.play();else audio.pause();}
$('play').onclick=togglePlayback;$('previewPlay').onclick=togglePlayback;$('rewind').onclick=()=>{audio.currentTime=Math.max(0,audio.currentTime-10);};$('forward').onclick=()=>{audio.currentTime=Math.min(audio.duration||Infinity,audio.currentTime+10);};$('volume').addEventListener('input',()=>{if(previewGain)previewGain.gain.value=Number($('volume').value)/100;const primary=document.querySelector('[data-colour-picker="colour"] input[type="hidden"]')?.value||'#7f6dff';updateVolumeStyle(primary,Number($('volume').value));});function updateVolumeStyle(hex,value){const el=$('volume');const track=document.querySelector('.volume-track');if(!el||!track)return;const pct=Math.round((value-(Number(el.min)||0))/((Number(el.max)||100)-(Number(el.min)||0))*100);const bgHex=document.querySelector('[data-colour-picker="background"] input[type="hidden"]')?.value||'#10121b';track.style.setProperty('--vol-fill',`${pct}%`);track.style.setProperty('--vol-color',hex);track.style.setProperty('--vol-bg',bgHex);}
audio.addEventListener('timeupdate',()=>{$('time').textContent=`${format(audio.currentTime)} / ${format(audio.duration||0)}`;});audio.addEventListener('play',()=>{$('play').textContent='Pause';$('previewPlay').textContent='Ⅱ';});audio.addEventListener('pause',()=>{$('play').textContent='Preview';$('previewPlay').textContent='▶';});audio.addEventListener('ended',()=>{$('play').textContent='Preview';$('previewPlay').textContent='▶';});$('response').addEventListener('input',()=>{bandHistory=undefined;previousEnergy=0;});$('aspect').addEventListener('change',updateSize);$('resolution').addEventListener('change',updateSize);$('framerate').addEventListener('change',updatePreviewMeta);$('styleToggle').addEventListener('click',()=>{const open=$('styleMenu').hidden;$('styleMenu').hidden=!open;$('styleToggle').setAttribute('aria-expanded',String(open));});document.querySelectorAll('.style-card').forEach((card)=>card.addEventListener('click',()=>{$('style').value=card.dataset.style;$('styleName').textContent=card.querySelector('.card-name').textContent;document.querySelectorAll('.style-card').forEach((other)=>other.classList.toggle('selected',other===card));closeStyleMenu();}));$('rangeToggle').addEventListener('click',()=>{const open=$('rangeMenu').hidden;$('rangeMenu').hidden=!open;$('rangeToggle').setAttribute('aria-expanded',String(open));});$('rangeLow').addEventListener('input',()=>updateRange('low'));$('rangeHigh').addEventListener('input',()=>updateRange('high'));$('rangeLowText').addEventListener('change',()=>{$('rangeLow').value=clamp(Number($('rangeLowText').value)||20,20,23990);updateRange('low');});$('rangeHighText').addEventListener('change',()=>{$('rangeHigh').value=clamp(Number($('rangeHighText').value)||24000,30,24000);updateRange('high');});$('rangeDefault').addEventListener('click',()=>{$('rangeLow').value=20;$('rangeHigh').value=20000;updateRange();});document.querySelectorAll('.simple-picker').forEach(configureSimplePicker);const primaryPicker=document.querySelector('.colour-picker[data-colour-picker="colour"]');if(primaryPicker){const hiddenInput=primaryPicker.querySelector('input[type="hidden"]');const channels=[...primaryPicker.querySelectorAll('[data-channel]')];const apply=()=>{if(hiddenInput){updateVolumeStyle(hiddenInput.value,Number($('volume').value));}};channels.forEach(ch=>ch.addEventListener('input',apply));apply();}
const backgroundColourPicker=document.querySelector('.colour-picker[data-colour-picker="background"]');if(backgroundColourPicker){const channels=[...backgroundColourPicker.querySelectorAll('[data-channel]')];const applyBg=()=>{const primary=document.querySelector('[data-colour-picker="colour"] input[type="hidden"]')?.value||'#7f6dff';updateVolumeStyle(primary,Number($('volume').value));};channels.forEach(ch=>ch.addEventListener('input',applyBg));}function applyPickerColour(id,hex){const picker=document.querySelector(`[data-colour-picker="${id}"]`),channels=[...picker.querySelectorAll('[data-channel]')],value=parseInt(hex.slice(1),16),rgb=[value>>16,(value>>8)&255,value&255];channels.forEach((channel,index)=>channel.value=rgb[index]);channels[0].dispatchEvent(new Event('input'));}
// The stage moves from sitting in normal page flow to `position:fixed`
// (and back) when the Customise panel opens/closes. Browsers can't smoothly
// transition `top`/`left`, so a plain class toggle makes the stage jump
// straight to its new spot with no way to animate that jump directly.
// Instead, this briefly fades the stage out, performs the (instant) layout
// change while invisible, then fades it back in — hiding the jump rather
// than trying to animate through it. The inline opacity is cleared once the
// fade-in finishes so any CSS-driven opacity (e.g. the dimmed mobile view)
// can take back over instead of being stuck at 1 permanently.
function animateStageTransition(mutate){
  const stage=document.querySelector('.stage');
  if(!stage){mutate();return;}
  const FADE_MS=260;
  stage.style.transition=`opacity ${FADE_MS}ms ease`;
  stage.style.opacity='0';
  setTimeout(()=>{
    mutate();
    stage.getBoundingClientRect();
    requestAnimationFrame(()=>{
      stage.style.opacity='1';
      setTimeout(()=>{stage.style.transition='';stage.style.opacity='';},FADE_MS);
    });
  },FADE_MS);
}
function openPresets(){renderPresetWindow();const window=$('presetWindow');window.hidden=false;animateStageTransition(()=>document.querySelector('main').classList.add('presets-open'));requestAnimationFrame(()=>window.classList.add('is-visible'));}function closePresets(){const window=$('presetWindow');window.classList.remove('is-visible');animateStageTransition(()=>document.querySelector('main').classList.remove('presets-open'));setTimeout(()=>{if(!window.classList.contains('is-visible'))window.hidden=true;},400);}document.addEventListener('keydown',event=>{if(!$('presetWindow').hidden&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(event.key==='Escape')closePresets();}},true);$('presets').addEventListener('click',openPresets);$('presetClose').addEventListener('click',closePresets);$('presetWindow').addEventListener('click',event=>{if(event.target===$('presetWindow'))closePresets();});document.querySelectorAll('.theme').forEach(theme=>theme.addEventListener('click',()=>{const presetWindow=$('presetWindow');if(presetWindow.hidden||!presetWindow.classList.contains('is-visible'))return;applyPickerColour('colour',theme.dataset.colour);applyPickerColour('background',theme.dataset.background);const artistSelect=$('artistTheme');if(artistSelect)artistSelect.value='';}));$('artistTheme')?.addEventListener('change',()=>{const presetWindow=$('presetWindow'),select=$('artistTheme');if(presetWindow.hidden||!presetWindow.classList.contains('is-visible')||!select.value)return;const[foreground,background]=select.value.split('|');applyPickerColour('colour',foreground);applyPickerColour('background',background);});function animateButton(button){button.classList.remove('button-used');void button.offsetWidth;button.classList.add('button-used');}function toggleLayout(){const change=()=>document.querySelector('main').classList.toggle('controls-left');if(document.startViewTransition)document.startViewTransition(change);else change();}
// Fullscreen button: fullscreens the whole stage (canvas + overlays + playback bar).
function toggleFullscreen(){const liveVisible=!$('screen-live').hidden;if(liveVisible&&!$('liveAudioPanel').classList.contains('is-active'))return;const stage=liveVisible?$('liveStage'):document.querySelector('main:not([hidden]) .stage');if(!document.fullscreenElement){stage?.requestFullscreen?.().catch(()=>{});}else{document.exitFullscreen?.();}}
$('fullscreenToggle').addEventListener('click',toggleFullscreen);
// Layout-switch button: does exactly what pressing Tab already does.
$('layoutToggle').addEventListener('click',toggleLayout);
document.addEventListener('click',(event)=>{const button=event.target.closest('button');if(button)animateButton(button);const stylePickers=[...document.querySelectorAll('.style-picker')];if(!stylePickers.some(p=>p.contains(event.target)))closeStyleMenu();const rangePickers=[...document.querySelectorAll('.range-picker')];if(!rangePickers.some(p=>p.contains(event.target)))closeRangeMenu();if(!event.target.closest('.colour-picker'))closeColourMenus();if(!event.target.closest('.simple-picker'))closeSimpleMenus();const sizePickers=[...document.querySelectorAll('.size-picker')];if(!sizePickers.some(p=>p.contains(event.target))){$('sizeMenu').hidden=true;$('sizeToggle').setAttribute('aria-expanded','false');}});document.addEventListener('keydown',(event)=>{if(event.key==='Escape'){closeStyleMenu();closeRangeMenu();closeColourMenus();closeSimpleMenus();$('sizeMenu').hidden=true;return;}if(event.ctrlKey||event.metaKey||event.altKey||event.repeat)return;if(event.target.closest('.simple-menu,.style-menu,.size-menu,.colour-menu,.range-menu,.ease-edit-menu'))return;if(document.querySelector('.settings-window:not([hidden]),.template-switch-dialog:not([hidden]),.preset-window:not([hidden]),dialog[open]'))return;const editing=event.target.matches('input:not([type="range"]):not([type="checkbox"]):not([type="color"]),select,textarea,[contenteditable="true"]');if(event.key==='Tab'&&!editing&&!document.querySelector('main').hidden){event.preventDefault();toggleLayout();return;}if(editing)return;if(event.code==='Space'&&!$('screen-live').hidden){event.preventDefault();if(desktopMedia?.canToggle)controlDesktopMedia('toggle');return;}if(event.code==='Space'){event.preventDefault();togglePlayback();animateButton($('previewPlay'));}if(event.key.toLowerCase()==='q'){(!$('screen-live').hidden?$('mediaPrevious'):$('rewind')).click();}if(event.key.toLowerCase()==='e'){(!$('screen-live').hidden?$('mediaNext'):$('forward')).click();}if(event.key.toLowerCase()==='f'){toggleFullscreen();}});$('sizeToggle').addEventListener('click',()=>{const open=$('sizeMenu').hidden;$('sizeMenu').hidden=!open;$('sizeToggle').setAttribute('aria-expanded',String(open));});$('sizeDefault').addEventListener('click',()=>{$('aspect').value='16:9';$('resolution').value='1080';updateSize();});function setExportProgress(value){const progress=Math.min(100,Math.round(value));$('exportFill').style.width=`${progress}%`;$('exportPercent').textContent=`${progress}%`;if(progress>=80){if(!exportReached80At)exportReached80At=Date.now();}else{exportReached80At=null;}}function showExportScreen(){const prompts=['Cooking up visuals…','Teaching pixels to dance…','Polishing the frequency glitter…','Making the bass look expensive…','Convincing the bars to behave…','Untangling the treble…','Asking the kick drum politely…','Giving the waveform a pep talk…','Applying questionable amounts of sparkle…','Negotiating with the sub-bass…','Putting pixels on the beat…','Teaching the snare some manners…','Rendering at irresponsible levels of enthusiasm…','Buffering enthusiasm into every frame…','Convincing FFmpeg this was a good idea…','Aligning pixels with the beat drop…','Sending good vibes to the render queue…','Coaxing colour out of the waveform…','Bribing the GPU with kind words…','Counting frames so you don\'t have to…'];const latePrompts=['We\'re not stuck. Promise.','Still rendering... definitely rendering.','The last 20% is emotionally complicated.','This part just takes longer, we swear.','Almost there, in a very relative sense.','Rendering the final stretch, slowly and with feeling.','The finish line is closer than it looks. Probably.','Quality takes patience. So does this.','Please enjoy this brief existential pause.'];const shuffle=items=>items.map(value=>({value,sort:Math.random()})).sort((a,b)=>a.sort-b.sort).map(item=>item.value);let queue=shuffle(prompts),index=0;let lateQueue=shuffle(latePrompts),lateIndex=0;exportReached80At=null;const nextPrompt=()=>{const useLate=exportReached80At&&(Date.now()-exportReached80At>10000);let text;if(useLate){if(lateIndex===lateQueue.length){lateQueue=shuffle(latePrompts);lateIndex=0;}text=lateQueue[lateIndex++];}else{if(index===queue.length){queue=shuffle(prompts);index=0;}text=queue[index++];}$('exportPrompt').style.opacity=0;setTimeout(()=>{$('exportPrompt').textContent=text;$('exportPrompt').style.opacity=1;},180);};setExportProgress(1);$('exportCheckmark').classList.remove('show');$('exportPrompt').textContent=queue[index++];$('exportScreen').hidden=false;const promptTimer=setInterval(nextPrompt,5000);return()=>clearInterval(promptTimer);}
$('exportCancel').addEventListener('click',()=>activeExportAbort?.abort());
// Moves the play/rewind/forward/volume bar into the export overlay (so the
// user can keep controlling playback while exporting) without moving or
// revealing the visualiser stage itself. Restored to its original spot in
// the stage afterwards, regardless of how the export finished.
let previewControlsHome=null;
function moveControlsIntoExportScreen(){
  const controls=$('previewControls');
  previewControlsHome={parent:controls.parentElement,next:controls.nextElementSibling};
  $('exportScreen').appendChild(controls);
}
function restoreControlsToStage(){
  const controls=$('previewControls');
  if(!previewControlsHome)return;
  previewControlsHome.parent.insertBefore(controls,previewControlsHome.next);
  previewControlsHome=null;
}
$('export').onclick=async()=>{if(exporting||!loadedFile)return;exporting=true;$('export').disabled=true;$('play').disabled=true;moveControlsIntoExportScreen();const stopExportUi=showExportScreen();try{activeExportAbort=new AbortController();const params=new URLSearchParams({style:$('style').value,colour:$('colour').value,background:$('background').value,size:$('size').value,fps:$('framerate').value,params:JSON.stringify(valueForAll($('style').value))});const response=await fetch(`/render?${params}`,{method:'POST',body:loadedFile,signal:activeExportAbort.signal});if(!response.ok)throw new Error(await response.text());const reader=response.body?.getReader();if(!reader)throw new Error('Export stream unavailable.');const decoder=new TextDecoder();let buffer='';let currentEvent='';let downloadToken='';while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});const lines=buffer.split('\n');buffer=lines.pop()||'';for(const line of lines){if(!line.trim())continue;if(line.startsWith('event:')){currentEvent=line.slice(6).trim();continue;}if(line.startsWith('data:')){const payload=JSON.parse(line.slice(5).trim());if(currentEvent==='progress'){setExportProgress(Math.max(2,Math.min(98,payload.percent||0)));}else if(currentEvent==='complete'){downloadToken=payload.token||'';}else if(currentEvent==='error'){throw new Error(payload.message||'Export failed.');}}}}if(!downloadToken)throw new Error('Export did not produce a download.');setExportProgress(100);$('exportPrompt').textContent='Your visual is ready.';$('exportCheckmark').classList.add('show');const download=document.createElement('a');download.href=`/download?token=${encodeURIComponent(downloadToken)}`;download.download=`${$('title').textContent||'visualiser'}.webm`;download.click();$('status').textContent='WEBM downloaded.';setTimeout(()=>{$('exportScreen').hidden=true;},700);}catch(error){$('exportPrompt').textContent=error.name==='AbortError'?'Export cancelled.':error.message;setExportProgress(0);setTimeout(()=>{$('exportScreen').hidden=true;},1600);}finally{activeExportAbort=undefined;stopExportUi();exporting=false;$('export').disabled=false;$('play').disabled=false;restoreControlsToStage();}};updateRange();updateSize();resize();draw();renderStylePreviews();
// Hover hints: a single tooltip element attached to the end of <body>, so it
// floats above every panel and never gets clipped by a scrolling or
// overflow-hidden container (the stage, the presets panel, etc).
(()=>{const tip=document.createElement('div');tip.className='hint-tip';document.body.appendChild(tip);document.addEventListener('fullscreenchange',()=>{(document.fullscreenElement||document.body).appendChild(tip);tip.classList.remove('visible');current=null;});let current=null;const position=(el)=>{const rect=el.getBoundingClientRect(),bounds=tip.getBoundingClientRect(),margin=8,half=bounds.width/2;const centre=Math.max(margin+half,Math.min(window.innerWidth-margin-half,rect.left+rect.width/2));tip.style.left=`${Math.round(centre)}px`;tip.style.top=`${Math.round(rect.top<bounds.height+18?rect.bottom+bounds.height+20:rect.top)}px`;};document.addEventListener('pointerover',(event)=>{const el=event.target.closest('[data-hint]');if(!el||el===current)return;current=el;tip.textContent=el.dataset.hint;position(el);tip.classList.add('visible');});document.addEventListener('pointerout',(event)=>{const el=event.target.closest('[data-hint]');if(!el||el!==current)return;tip.classList.remove('visible');current=null;});window.addEventListener('scroll',()=>{if(current)position(current);},true);})();
// Fullscreen auto-hide: while in fullscreen, hide the overlay controls (and
// the cursor) after 2 seconds of no mouse/keyboard activity. Any movement
// or key press brings them straight back.
(()=>{let idleTimer;const showUi=()=>{document.querySelectorAll('.stage,.live-stage').forEach(stage=>stage.classList.remove('ui-idle'));const stageEl=document.fullscreenElement;clearTimeout(idleTimer);if(document.fullscreenElement){idleTimer=setTimeout(()=>stageEl.classList.add('ui-idle'),2000);}};['mousemove','mousedown','keydown','wheel'].forEach(evt=>document.addEventListener(evt,showUi));document.addEventListener('fullscreenchange',showUi);})();

// Shared app settings (persisted to localStorage). Declared here, ahead of
// the panels that read/write it, so the Settings window and the Templates
// screen's "pin as startup" control both mutate the exact same object
// instead of drifting out of sync with separate copies.
const SETTINGS_KEY='visualiserSettings';
const settingsDefaults={reduceMotion:false,autoplay:false,framerate:'30',startupTemplateId:'',startupScreen:'create',accentColour:'',accentColour2:''};
let appSettings=settingsDefaults;
try{appSettings={...settingsDefaults,...JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}')};}catch{appSettings={...settingsDefaults};}
function persistAppSettings(){try{localStorage.setItem(SETTINGS_KEY,JSON.stringify(appSettings));}catch{}}

// Side panel: burger button opens a slide-in drawer with quick links.
// "Create" is the main screen; the other two are placeholders that swap in
// a dedicated "Coming soon" screen rather than doing nothing when clicked.
// A settings cog at the bottom opens a small preferences window with a few
// settings that actually do something, persisted to localStorage.
(()=>{
  const burger=$('burgerToggle'),overlay=$('sideOverlay'),panel=$('sidePanel');
  const screens={create:document.querySelector('main'),templates:$('screen-templates'),batch:$('screen-batch'),live:$('screen-live')};
  const navItems=[...document.querySelectorAll('.side-nav-item[data-screen]')];
  let currentScreen='create';

  function showScreen(name){
    if(!screens[name]||name===currentScreen)return;
    if(currentScreen==='live'&&typeof stopLiveAudio==='function')stopLiveAudio();
    Object.entries(screens).forEach(([key,el])=>{if(el)el.hidden=key!==name;});
    navItems.forEach(item=>{const selected=item.dataset.screen===name;item.classList.toggle('selected',selected);if(selected)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');});
    currentScreen=name;
    if(name==='templates')renderTemplatesScreen();
  }

  // The side rail is always visible now (never `hidden`) — the burger
  // button just toggles it between a slim icon-only rail and a wider
  // labelled one. The overlay is only used while expanded, so a click
  // outside the rail collapses it again.
  function openPanel(){
    overlay.hidden=false;
    requestAnimationFrame(()=>{overlay.classList.add('is-visible');panel.classList.add('expanded');});
    burger.setAttribute('aria-expanded','true');
    burger.setAttribute('aria-label','Collapse menu');
  }
  function closePanel(){
    overlay.classList.remove('is-visible');panel.classList.remove('expanded');
    burger.setAttribute('aria-expanded','false');
    burger.setAttribute('aria-label','Expand menu');
    setTimeout(()=>{overlay.hidden=true;},260);
  }

  burger.addEventListener('click',()=>{panel.classList.contains('expanded')?closePanel():openPanel();});
  overlay.addEventListener('click',closePanel);
  navItems.forEach(item=>item.addEventListener('click',()=>{showScreen(item.dataset.screen);closePanel();}));
  document.querySelectorAll('[data-back]').forEach(btn=>btn.addEventListener('click',()=>showScreen('create')));

  // Settings window.
  const settingsToggle=$('settingsToggle'),settingsClose=$('settingsClose'),settingsWindow=$('settingsWindow');
  const reduceMotionInput=$('settingReduceMotion'),autoplayInput=$('settingAutoplay'),frameSelect=$('settingFramerate'),startupTemplateSelect=$('settingStartupTemplate');
  const startupScreenSelect=$('settingStartupScreen'),accentInput=$('settingAccentColour'),accent2Input=$('settingAccentColour2'),accentResetBtn=$('settingAccentReset');
  const shortcutsDialog=$('shortcutsDialog'),shortcutsClose=$('shortcutsClose'),showShortcutsBtn=$('showShortcutsBtn');

  function setMainFramerate(value){
    if($('framerate').value===value)return;
    $('framerate').value=value;
    const option=document.querySelector(`#framerateMenu [data-value="${value}"]`);
    if(option){$('framerateLabel').textContent=option.textContent;document.querySelectorAll('#framerateMenu .simple-option').forEach(opt=>opt.classList.toggle('selected',opt===option));}
    updatePreviewMeta();
  }
  const DEFAULT_ACCENT='#7f6dff',DEFAULT_ACCENT_2='#3da5ff';
  function applyAccentColours(){
    const root=document.documentElement.style;
    if(appSettings.accentColour)root.setProperty('--accent',appSettings.accentColour);else root.removeProperty('--accent');
    if(appSettings.accentColour2)root.setProperty('--accent-2',appSettings.accentColour2);else root.removeProperty('--accent-2');
  }
  function applySettings(){
    document.body.classList.toggle('reduce-motion',appSettings.reduceMotion);
    reduceMotionInput.checked=appSettings.reduceMotion;
    autoplayInput.checked=appSettings.autoplay;
    autoplayOnLoad=appSettings.autoplay;
    frameSelect.value=appSettings.framerate;
    setMainFramerate(appSettings.framerate);
    startupScreenSelect.value=appSettings.startupScreen||'create';
    applyPickerColour('accent',appSettings.accentColour||DEFAULT_ACCENT);
    applyPickerColour('accent2',appSettings.accentColour2||DEFAULT_ACCENT_2);
    applyAccentColours();
  }
  applySettings();
  if(appSettings.startupScreen==='templates')showScreen('templates');

  function openSettings(){closePanel();populateStartupTemplateOptions();settingsWindow.hidden=false;requestAnimationFrame(()=>settingsWindow.classList.add('is-visible'));}
  function closeSettings(){settingsWindow.classList.remove('is-visible');setTimeout(()=>{settingsWindow.hidden=true;},200);}

  settingsToggle.addEventListener('click',openSettings);
  settingsClose.addEventListener('click',closeSettings);
  settingsWindow.addEventListener('click',event=>{if(event.target===settingsWindow)closeSettings();});
  reduceMotionInput.addEventListener('change',()=>{appSettings.reduceMotion=reduceMotionInput.checked;document.body.classList.toggle('reduce-motion',appSettings.reduceMotion);persistAppSettings();});
  autoplayInput.addEventListener('change',()=>{appSettings.autoplay=autoplayInput.checked;autoplayOnLoad=appSettings.autoplay;persistAppSettings();});
  frameSelect.addEventListener('change',()=>{appSettings.framerate=frameSelect.value;setMainFramerate(appSettings.framerate);persistAppSettings();});
  startupTemplateSelect.addEventListener('change',()=>{appSettings.startupTemplateId=startupTemplateSelect.value;persistAppSettings();renderTemplatesScreen();});
  startupScreenSelect.addEventListener('change',()=>{appSettings.startupScreen=startupScreenSelect.value;persistAppSettings();});
  // The accent swatches are built from the same .colour-picker component as
  // the main Colour/Background pickers (toggle + RGB sliders). Their value
  // lives on the hidden input, updated by the picker's own slider handlers,
  // so we listen on the R/G/B channels to know when it's changed.
  function wireAccentPicker(id,hiddenInput,onChange){
    const picker=document.querySelector(`.colour-picker[data-colour-picker="${id}"]`);
    if(!picker)return;
    picker.querySelectorAll('[data-channel]').forEach(channel=>channel.addEventListener('input',()=>onChange(hiddenInput.value)));
  }
  wireAccentPicker('accent',accentInput,(hex)=>{appSettings.accentColour=hex;persistAppSettings();applyAccentColours();});
  wireAccentPicker('accent2',accent2Input,(hex)=>{appSettings.accentColour2=hex;persistAppSettings();applyAccentColours();});
  accentResetBtn.addEventListener('click',()=>{
    appSettings.accentColour='';appSettings.accentColour2='';
    persistAppSettings();applyAccentColours();
    applyPickerColour('accent',DEFAULT_ACCENT);
    applyPickerColour('accent2',DEFAULT_ACCENT_2);
    showToast('Accent colour reset');
  });

  function openShortcuts(){closeSettings();shortcutsDialog.hidden=false;}
  function closeShortcuts(){shortcutsDialog.hidden=true;}
  showShortcutsBtn.addEventListener('click',openShortcuts);
  shortcutsClose.addEventListener('click',closeShortcuts);
  shortcutsDialog.addEventListener('click',event=>{if(event.target===shortcutsDialog)closeShortcuts();});

  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape')return;
    if(!shortcutsDialog.hidden)closeShortcuts();
    else if(!settingsWindow.hidden)closeSettings();
    else if(panel.classList.contains('expanded'))closePanel();
  });
})();

// Templates: saved "looks" (style, colours, per-style params, size/fps,
// response) stored locally. Applying one that isn't currently "dirty" is a
// silent switch; if the active template has unsaved edits, switching to a
// *different* template first confirms via a Switch/Cancel dialog so the
// edits aren't lost by accident.
const TEMPLATES_KEY='visualiserTemplates';
const TEMPLATES_COUNTER_KEY='visualiserTemplateCounter';
let activeTemplateId=null;
let activeTemplateSnapshot=null;
let pendingTemplateSwitchId=null;

// Small non-blocking confirmation for save/rename/delete/switch actions.
let toastTimer=null;
function showToast(message){
  let toast=document.getElementById('appToast');
  if(!toast){
    toast=document.createElement('div');
    toast.id='appToast';
    toast.className='app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent=message;
  toast.classList.remove('visible');
  void toast.offsetWidth; // restart the transition if a toast is already mid-fade
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('visible'),2400);
}

function loadTemplates(){
  try{const list=JSON.parse(localStorage.getItem(TEMPLATES_KEY)||'[]');return Array.isArray(list)?list:[];}catch{return [];}
}
function saveTemplatesList(list){
  try{localStorage.setItem(TEMPLATES_KEY,JSON.stringify(list));}catch{}
}
function nextTemplateName(){
  let n=Number(localStorage.getItem(TEMPLATES_COUNTER_KEY)||'0')+1;
  try{localStorage.setItem(TEMPLATES_COUNTER_KEY,String(n));}catch{}
  return `Template ${n}`;
}
function makeTemplateId(){
  return (window.crypto?.randomUUID?.())||`tpl_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

// The full "look" a template captures: style, colours, that style's own
// parameter sliders, output size, frame rate, and response curve.
function captureCurrentLook(){
  const style=$('style').value;
  return {
    style,
    colour:$('colour').value,
    background:$('background').value,
    params:valueForAll(style).slice(),
    aspect:$('aspect').value,
    resolution:$('resolution').value,
    framerate:$('framerate').value,
    response:$('response').value,
  };
}

function applyTemplateLook(t){
  const card=document.querySelector(`.style-card[data-style="${t.style}"]`);
  if(card){
    $('style').value=t.style;
    $('styleName').textContent=card.querySelector('.card-name').textContent;
    document.querySelectorAll('.style-card').forEach(o=>o.classList.toggle('selected',o===card));
  }
  if(Array.isArray(t.params))styleValues[t.style]=t.params.slice();
  if(t.colour)applyPickerColour('colour',t.colour);
  if(t.background)applyPickerColour('background',t.background);
  if(t.aspect)$('aspect').value=t.aspect;
  if(t.resolution)$('resolution').value=t.resolution;
  updateSize();
  if(t.framerate){
    $('framerate').value=t.framerate;
    const opt=document.querySelector(`#framerateMenu [data-value="${t.framerate}"]`);
    if(opt){$('framerateLabel').textContent=opt.textContent;document.querySelectorAll('#framerateMenu .simple-option').forEach(o=>o.classList.toggle('selected',o===opt));}
    updatePreviewMeta();
  }
  if(t.response){
    $('response').value=t.response;
    const opt=document.querySelector(`#responseMenu [data-value="${t.response}"]`);
    if(opt){$('responseLabel').textContent=opt.textContent;document.querySelectorAll('#responseMenu .simple-option').forEach(o=>o.classList.toggle('selected',o===opt));}
    bandHistory=undefined;previousEnergy=0;
  }
}

function setActiveTemplate(t){
  activeTemplateId=t.id;
  activeTemplateSnapshot=JSON.stringify({style:t.style,colour:t.colour,background:t.background,params:t.params,aspect:t.aspect,resolution:t.resolution,framerate:t.framerate,response:t.response});
}

function isActiveTemplateDirty(){
  if(!activeTemplateId)return false;
  return JSON.stringify(captureCurrentLook())!==activeTemplateSnapshot;
}

function useTemplate(t){
  applyTemplateLook(t);
  setActiveTemplate(t);
  renderTemplatesScreen();
  showToast(`Switched to "${t.name}"`);
}

// "Default" here means no template is currently tracked (activeTemplateId
// is null) — freely editable, nothing to lose, so switching never warns.
function requestUseTemplate(id){
  const target=loadTemplates().find(t=>t.id===id);
  if(!target)return;
  if(target.id===activeTemplateId){useTemplate(target);return;}
  if(activeTemplateId&&isActiveTemplateDirty()){
    pendingTemplateSwitchId=id;
    $('templateSwitchDialog').hidden=false;
    return;
  }
  useTemplate(target);
}

function closeTemplateSwitchDialog(){
  $('templateSwitchDialog').hidden=true;
  pendingTemplateSwitchId=null;
}
$('templateSwitchCancel').addEventListener('click',closeTemplateSwitchDialog);
$('templateSwitchConfirm').addEventListener('click',()=>{
  const pending=pendingTemplateSwitchId;
  closeTemplateSwitchDialog();
  if(pending==='__default__'){returnToDefaultLook();return;}
  const target=loadTemplates().find(t=>t.id===pending);
  if(target)useTemplate(target);
});
$('templateSwitchDialog').addEventListener('click',(event)=>{if(event.target===$('templateSwitchDialog'))closeTemplateSwitchDialog();});

// Delete confirmation — an app-styled dialog instead of the browser's own
// native confirm() box, so it matches the rest of the UI.
let pendingDeleteTemplateId=null;
function requestDeleteTemplate(id){
  const t=loadTemplates().find(x=>x.id===id);
  pendingDeleteTemplateId=id;
  $('templateDeleteHeading').textContent=`Delete "${t?.name||'this template'}"?`;
  $('templateDeleteDialog').hidden=false;
}
function closeTemplateDeleteDialog(){
  $('templateDeleteDialog').hidden=true;
  pendingDeleteTemplateId=null;
}
$('templateDeleteCancel').addEventListener('click',closeTemplateDeleteDialog);
$('templateDeleteConfirm').addEventListener('click',()=>{
  const id=pendingDeleteTemplateId;
  closeTemplateDeleteDialog();
  if(id)deleteTemplate(id);
});
$('templateDeleteDialog').addEventListener('click',(event)=>{if(event.target===$('templateDeleteDialog'))closeTemplateDeleteDialog();});
document.addEventListener('keydown',(event)=>{
  if(event.key!=='Escape')return;
  if(!$('templateDeleteDialog').hidden){closeTemplateDeleteDialog();return;}
  if(!$('templateSwitchDialog').hidden){closeTemplateSwitchDialog();return;}
});

function saveCurrentAsTemplate(){
  const t={id:makeTemplateId(),name:nextTemplateName(),...captureCurrentLook()};
  const list=loadTemplates();
  list.push(t);
  saveTemplatesList(list);
  setActiveTemplate(t);
  renderTemplatesScreen();
  showToast(`Saved as "${t.name}"`);
}

function renameTemplate(id,name){
  const list=loadTemplates();
  const t=list.find(x=>x.id===id);
  if(!t)return;
  t.name=name.trim()||t.name;
  saveTemplatesList(list);
  renderTemplatesScreen();
}

function deleteTemplate(id){
  const target=loadTemplates().find(t=>t.id===id);
  saveTemplatesList(loadTemplates().filter(t=>t.id!==id));
  if(activeTemplateId===id){activeTemplateId=null;activeTemplateSnapshot=null;}
  if(appSettings.startupTemplateId===id){appSettings.startupTemplateId='';persistAppSettings();}
  renderTemplatesScreen();
  if(target)showToast(`Deleted "${target.name}"`);
}

function duplicateTemplate(id){
  const source=loadTemplates().find(t=>t.id===id);
  if(!source)return;
  const {id:_oldId,name:_oldName,...look}=source;
  const copy={id:makeTemplateId(),name:nextTemplateName(),...look};
  const list=loadTemplates();
  list.push(copy);
  saveTemplatesList(list);
  renderTemplatesScreen();
  showToast(`Duplicated as "${copy.name}"`);
}

function toggleStartupPreset(id){
  const isPinned=appSettings.startupTemplateId===id;
  appSettings.startupTemplateId=isPinned?'':id;
  persistAppSettings();
  renderTemplatesScreen();
  const t=loadTemplates().find(x=>x.id===id);
  showToast(isPinned?'Removed as startup preset':`"${t?.name||'Template'}" will load on startup`);
}

// Populates the Settings window's startup dropdown from the current
// template list, keeping the selected value in sync with appSettings.
function populateStartupTemplateOptions(){
  const select=$('settingStartupTemplate');
  if(!select)return;
  const templates=loadTemplates();
  const valid=templates.some(t=>t.id===appSettings.startupTemplateId);
  select.innerHTML='<option value="">None (use default look)</option>'+templates.map(t=>{
    const label=t.name.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<option value="${t.id}">${label}</option>`;
  }).join('');
  select.value=valid?appSettings.startupTemplateId:'';
}

// The app's built-in defaults (matching styleParameters' own base values),
// used for "Return to default" and represented by activeTemplateId===null.
function defaultLook(){
  return {
    style:'bars',
    colour:'#9c6bff',
    background:'#11121a',
    params:(styleParameters.bars||[]).map(item=>item[3]),
    aspect:'16:9',
    resolution:'1080',
    framerate:'30',
    response:'dynamic',
  };
}
function returnToDefaultLook(){
  applyTemplateLook(defaultLook());
  activeTemplateId=null;
  activeTemplateSnapshot=null;
  renderTemplatesScreen();
  showToast('Back to default look');
}
function requestReturnToDefault(){
  if(activeTemplateId&&isActiveTemplateDirty()){
    pendingTemplateSwitchId='__default__';
    $('templateSwitchDialog').hidden=false;
    return;
  }
  returnToDefaultLook();
}
$('returnToDefault').addEventListener('click',requestReturnToDefault);

function renderTemplatesScreen(){
  const grid=$('templatesGrid');
  if(!grid)return;
  grid.querySelectorAll('.template-card:not(.template-card-new)').forEach(el=>el.remove());
  loadTemplates().forEach(t=>{
    const card=document.createElement('div');
    card.className='template-card'+(t.id===activeTemplateId?' is-active':'');
    card.dataset.templateId=t.id;

    // The thumbnail lives inside its own button (like the style-cards) so
    // it's properly clickable/keyboard-focusable without nesting the name
    // input or delete button inside another interactive element.
    const useTrigger=document.createElement('button');
    useTrigger.type='button';
    useTrigger.className='template-use-trigger';
    useTrigger.setAttribute('aria-label',`Use ${t.name} template`);
    const canvas=document.createElement('canvas');
    canvas.width=240;canvas.height=135;
    useTrigger.appendChild(canvas);
    const overlay=document.createElement('span');
    overlay.className='template-use-overlay';
    overlay.textContent='Use';
    useTrigger.appendChild(overlay);
    card.appendChild(useTrigger);

    const nameRow=document.createElement('div');
    nameRow.className='template-name-row';
    const nameInput=document.createElement('input');
    nameInput.type='text';
    nameInput.className='template-name';
    nameInput.value=t.name;
    nameInput.setAttribute('aria-label','Template name');
    nameRow.appendChild(nameInput);
    const pin=document.createElement('button');
    pin.type='button';
    pin.className='template-pin'+(appSettings.startupTemplateId===t.id?' is-pinned':'');
    pin.title='Load on startup';
    pin.setAttribute('aria-label',appSettings.startupTemplateId===t.id?'Remove as startup preset':'Set as startup preset');
    pin.textContent='★';
    nameRow.appendChild(pin);
    const dupe=document.createElement('button');
    dupe.type='button';
    dupe.className='template-duplicate';
    dupe.title='Duplicate';
    dupe.setAttribute('aria-label','Duplicate template');
    dupe.textContent='⧉';
    nameRow.appendChild(dupe);
    const del=document.createElement('button');
    del.type='button';
    del.className='template-delete';
    del.setAttribute('aria-label','Delete template');
    del.textContent='×';
    nameRow.appendChild(del);
    card.appendChild(nameRow);

    grid.appendChild(card);
    drawStylePreviewIcon(canvas.getContext('2d'),canvas.width,canvas.height,t.style,t.colour,t.background);

    useTrigger.addEventListener('click',()=>requestUseTemplate(t.id));
    nameInput.addEventListener('change',()=>renameTemplate(t.id,nameInput.value));
    nameInput.addEventListener('keydown',(event)=>{if(event.key==='Enter')nameInput.blur();});
    pin.addEventListener('click',()=>toggleStartupPreset(t.id));
    dupe.addEventListener('click',()=>duplicateTemplate(t.id));
    del.addEventListener('click',()=>{
      requestDeleteTemplate(t.id);
    });
  });
}
$('saveTemplateCard').addEventListener('click',saveCurrentAsTemplate);

// Auto-apply the "load on startup" template, if one is configured and
// still exists (it may have been deleted since it was set).
(function applyStartupTemplate(){
  if(!appSettings.startupTemplateId)return;
  const target=loadTemplates().find(t=>t.id===appSettings.startupTemplateId);
  if(target)useTemplate(target);
})();
