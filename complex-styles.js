(function(root){
const palettes=[['#70e2d2','#659ef7','#a68bf5','#ed91cf','#ffb69a','#eed987'],['#ff698b','#ffab6e','#ffe19a','#ae86ff','#6c9fff','#57d6c9'],['#82d6be','#7db5dc','#adabe8','#dbadc9','#e7cba0','#b8d591'],['#58c7ff','#7968ed','#cb75e3','#f68fb6','#faac7e','#a1e1d8']];
const names={prism:'Shatterfield',city:'Bass surf',notes:'Note trails'};
const movements=['None','Drift','Sweep','Orbit','Ripple','Breathe'],focuses=['Balanced','Notes','Transients'];
const specs=Object.fromEntries(Object.keys(names).map(id=>[id,[['Travel speed',.1,2,.7,.05],['Detail',8,40,22,1],['Force',.2,1.5,.8,.05],['Palette',0,3,0,1],['Movement',0,5,0,1],['Response focus',0,2,0,1]]]));
specs.prism.push(['Shard size',.3,3,1,.1],['Gravity',0,1.5,.5,.05],['Burst count',1,8,3,1]);
specs.notes.push(['Trail length',6,90,30,1],['Trail thickness',.3,3,1,.1],['Pitch bend',0,2,.6,.05]);
specs.city.push(['Surface depth',8,64,32,1],['Wave height',.2,2,1,.05],['Line thickness',.3,3,1,.1]);
const designs={},states=new WeakMap(),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v)),hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);},getDesign=style=>designs[style]||{};
function paint(ctx,w,h,spectrum,energy,style,time,params,design={}){
if(!names[style])return false;
const p=params||specs[style].map(v=>v[3]),speed=clamp(p[0]||.7,.1,2),detail=Math.round(clamp(p[1]||22,8,40)),force=clamp(p[2]||.8,.2,1.5),mode=Math.round(p[4]||0),focus=Math.round(p[5]||0);
let s=states.get(ctx);if(!s||s.style!==style||time<s.time||time-s.time>1.5){s={style,time,phase:0,previous:new Float32Array(48),smooth:new Float32Array(48),lastHit:new Float32Array(48).fill(-10),objects:[],history:[],springs:[],serial:0,clock:0};states.set(ctx,s);}
const rawDt=clamp(time-s.time,0,.1),dt=rawDt*speed;s.time=time;s.clock+=dt;
const custom=design.customColours!==false&&Array.isArray(design.colours)?design.colours.filter(c=>/^#[0-9a-f]{6}$/i.test(c)).slice(0,8):[],palette=custom.length>=2?custom:palettes[Math.round(p[3]||0)%4],colour=i=>palette[Math.abs(Math.floor(i))%palette.length];
const lanes=48,levels=new Float32Array(lanes),hits=[];
for(let i=0;i<lanes;i++){const a=Math.floor(i/lanes*spectrum.length),b=Math.max(a+1,Math.floor((i+1)/lanes*spectrum.length));let v=0;for(let j=a;j<b;j++)v=Math.max(v,spectrum[j]||0);const rise=Math.max(0,v-s.previous[i]),neighbours=((spectrum[Math.max(0,a-2)]||0)+(spectrum[Math.min(spectrum.length-1,b+2)]||0))/2,target=focus===1?clamp((v-neighbours*.45)*1.65):focus===2?clamp(v*.15+rise*4):v;s.smooth[i]+=(target-s.smooth[i])*(1-Math.exp(-Math.max(rawDt,.016)/(target>s.smooth[i]?.035:.22)));levels[i]=s.smooth[i];if((rise>.11||v>.4&&s.previous[i]<.24)&&s.clock-s.lastHit[i]>.12){hits.push({lane:i,v:clamp(rise*2+v*.5)});s.lastHit[i]=s.clock;}s.previous[i]=v;}
const mean=(a,b)=>levels.slice(a,b).reduce((sum,v)=>sum+v,0)/(b-a),bass=mean(0,16),mid=mean(16,34),treble=mean(34,48);s.phase+=dt*(bass*.5+mid*.3+treble*.2)*force*3;
const direction=(lane,seed)=>{let angle=(lane/lanes-.5)*2.1;if(mode===1)angle+=Math.sin(seed*6.28)*.7;if(mode===2)angle+=(lane%2?1:-1)*.85;if(mode===3)angle+=s.phase;if(mode===4)angle=seed*Math.PI*2;if(mode===5)angle+=Math.sin(s.phase)*bass;return angle;};
const emit=(hit,kind)=>{const n=++s.serial,seed=hash(n),angle=direction(hit.lane,seed),power=(.12+hit.v*.65)*force;s.objects.push({kind,lane:hit.lane,x:kind==='trail'?.02:hash(n+17)*.94+.03,y:kind==='trail'?1-(hit.lane+.5)/lanes:hash(n+39)*.86+.07,vx:Math.cos(angle)*power,vy:Math.sin(angle)*power,age:0,life:2.5+seed*2,r:0,amplitude:hit.v*force,rotation:seed*6.28,tail:[]});};
hits.forEach(hit=>{if(style==='prism')for(let i=0;i<Math.round(p[8]??3);i++)emit(hit,'shard');if(style==='notes')emit(hit,'trail');});s.objects=s.objects.filter(o=>o.age<o.life&&o.x>-1&&o.x<2&&o.y>-1&&o.y<2).slice(-250);
ctx.save();ctx.lineCap='round';ctx.lineJoin='round';const angle=(Number.isFinite(Number(design.angle))?Number(design.angle):45)*Math.PI/180,dx=Math.cos(angle)*w/2,dy=Math.sin(angle)*h/2,gradient=design.kind==='radial'?ctx.createRadialGradient(w/2,h/2,0,w/2,h/2,Math.max(w,h)*.6):ctx.createLinearGradient(w/2-dx,h/2-dy,w/2+dx,h/2+dy);palette.forEach((c,i)=>gradient.addColorStop(i/(palette.length-1),c));const brush=i=>design.kind==='solid'?colour(0):design.kind==='bands'?colour(i):custom.length||design.kind?gradient:colour(i);
if(style==='prism'||style==='notes'){
for(const o of s.objects){const v=levels[o.lane];o.age+=dt;if(dt){o.tail.push([o.x,o.y]);if(o.tail.length>Math.round(p[6]??30))o.tail.shift();}o.x+=o.vx*dt;o.y+=o.vy*dt;o.vy+=dt*(style==='prism'?(p[7]??.5)*.3*force:(bass-mid)*.3*(p[8]??.6));o.vx*=Math.exp(-dt*.22);o.rotation+=dt*(v+.2)*3;ctx.strokeStyle=brush(o.lane);ctx.fillStyle=brush(o.lane);ctx.globalAlpha=clamp(1-o.age/o.life);if(style==='notes'){ctx.lineWidth=Math.max(1,h/250*(1+v*5*force)*(p[7]??1));ctx.beginPath();o.tail.forEach(([x,y],i)=>i?ctx.lineTo(x*w,y*h):ctx.moveTo(x*w,y*h));ctx.lineTo(o.x*w,o.y*h);ctx.stroke();ctx.beginPath();ctx.arc(o.x*w,o.y*h,h*.006*(1+v*2),0,Math.PI*2);ctx.fill();}else{const size=h*.018*(.3+o.amplitude+v*force)*(p[6]??1);ctx.save();ctx.translate(o.x*w,o.y*h);ctx.rotate(o.rotation);ctx.beginPath();ctx.moveTo(-size,-size*.6);ctx.lineTo(size*1.5,0);ctx.lineTo(-size*.3,size);ctx.closePath();ctx.fill();ctx.restore();}}
if(style==='notes')for(let lane=0;lane<lanes;lane++){const v=levels[lane];if(v<.08)continue;ctx.globalAlpha=.65;ctx.fillStyle=brush(lane);ctx.fillRect(w*.014,h*(1-(lane+1)/lanes),w*.025*v*force,h/lanes*.65);}
}else if(style==='city'){
if(rawDt>0||!s.history.length){s.history.unshift(Array.from(levels));s.history=s.history.slice(0,Math.round(p[6]??32));}for(let row=s.history.length-1;row>=0;row--){const values=s.history[row],depth=row/(p[6]??32),base=h*(.35+depth*.65),spread=.35+depth*.7;ctx.strokeStyle=brush(row);ctx.globalAlpha=.25+depth*.6;ctx.lineWidth=(1+depth*2)*(p[8]??1);ctx.beginPath();for(let i=0;i<lanes;i++){const x=w/2+(i/(lanes-1)-.5)*w*spread+(mode?Math.sin(s.phase+mode+i*.1)*bass*w*.04:0),y=base-values[i]*h*(.12+depth*.25)*force*(p[7]??1)-(i<16?bass*h*.08:0);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}ctx.stroke();}
}

ctx.restore();return true;
}
const api={names,specs,palettes,paint,movements,focuses,designs,getDesign};if(typeof module!=='undefined')module.exports=api;else root.ComplexStyles=api;
})(typeof globalThis!=='undefined'?globalThis:this);
