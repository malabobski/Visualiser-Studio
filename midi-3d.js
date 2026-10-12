/* Musical 3D scenes: deterministic geometry shared by preview and video export. */
(function(root) {
  const styles = new Set(['crystal', 'helix', 'portals', 'voxel', 'origami']);
  const TAU = Math.PI * 2;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const sub = (a,b) => a.map((v,i) => v-b[i]);
  const dot = (a,b) => a.reduce((sum,v,i) => sum+v*b[i],0);
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const norm = a => { const length=Math.hypot(...a)||1; return a.map(v=>v/length); };
  const rgbCache = new Map();
  function rgb(colour) {
    if(!rgbCache.has(colour)) rgbCache.set(colour,/^#[0-9a-f]{6}$/i.test(colour)?[1,3,5].map(i=>parseInt(colour.slice(i,i+2),16)):[145,185,245]);
    return rgbCache.get(colour);
  }
  function tint(colour,brightness) { return 'rgb('+rgb(colour).map(v=>Math.round(clamp(v*brightness,0,255))).join(',')+')'; }
  function turn([x,y,z],yaw,pitch=0) {
    const xx=x*Math.cos(yaw)+z*Math.sin(yaw),zz=z*Math.cos(yaw)-x*Math.sin(yaw);
    return [xx,y*Math.cos(pitch)-zz*Math.sin(pitch),y*Math.sin(pitch)+zz*Math.cos(pitch)];
  }
  function renderer(ctx,w,h,eye,target,opacity,glow) {
    const f=norm(sub(target,eye)),right=norm(cross(f,[0,1,0])),up=cross(right,f),lens=Math.min(w,h)*1.24,items=[];
    const project=p=>{const q=sub(p,eye),z=dot(q,f);return {x:w/2+dot(q,right)*lens/z,y:h/2-dot(q,up)*lens/z,z};};
    function path(points,colour,alpha=1,width=1,fill=false,brightness=1) {
      const p=points.map(project);if(p.length<2||p.some(v=>v.z<.45))return;
      items.push({p,colour,alpha,width,fill,brightness,z:p.reduce((a,v)=>a+v.z,0)/p.length});
    }
    function point(p,colour,alpha=1,size=2) { const q=project(p);if(q.z>.45)items.push({p:[q],colour,alpha,size:clamp(size*10/q.z,.45,12),z:q.z}); }
    function draw(){
      items.sort((a,b)=>b.z-a.z);ctx.save();ctx.lineJoin='round';ctx.lineCap='round';
      for(const item of items){const fog=clamp(1-(item.z-14)/55,.07,1),alpha=clamp(item.alpha*opacity*fog,0,1);if(alpha<.005)continue;
        ctx.globalAlpha=alpha;ctx.fillStyle=tint(item.colour,item.brightness||1);ctx.strokeStyle=ctx.fillStyle;
        if(item.size){const p=item.p[0];ctx.beginPath();ctx.arc(p.x,p.y,item.size,0,TAU);ctx.fill();continue;}
        ctx.beginPath();item.p.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));
        if(item.fill){ctx.closePath();ctx.fill();}else{if(glow&&item.alpha>.4){ctx.globalAlpha=alpha*.09;ctx.lineWidth=item.width*5+2;ctx.stroke();ctx.globalAlpha=alpha;}ctx.lineWidth=item.width;ctx.stroke();}
      }ctx.restore();
    }
    function bloom(position,colour,amount,radius=.12){if(!glow||amount<=0)return;const p=project(position);if(p.z<.45)return;const size=Math.min(w,h)*radius*clamp(10/p.z,.4,2),gradient=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,size);gradient.addColorStop(0,colour);gradient.addColorStop(1,'transparent');ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=clamp(amount*opacity,0,.55);ctx.fillStyle=gradient;ctx.fillRect(p.x-size,p.y-size,size*2,size*2);ctx.restore();}
    return {path,point,draw,bloom};
  }
  function musicalState(time,state,timing) {
    const events=[];let attack=0,energy=0,bass=0;
    for(const n of timing.notes){const age=time-n.startTime;if(age<0||time>n.endTime+3)continue;const release=time<=n.endTime?1:Math.exp(-(time-n.endTime)*1.8),hit=Math.exp(-age*4.5),strength=(.22+.78*hit)*(n.velocity||.5)*release;
      events.push({...n,age,release,hit,strength});attack+=hit*(n.velocity||.5);energy+=strength;if(n.pitch<60)bass+=strength;}
    return {events,attack:1-Math.exp(-attack*.5),energy:1-Math.exp(-energy*.35),bass:1-Math.exp(-bass*.6)};
  }
  // Stable identifiers keep saved projects intact while replacing their designs.
  function paint(ctx,w,h,time,state,timing) {
    const style=state.visual;if(!styles.has(style))return false;
    const music=musicalState(time,state,timing);if(!music.events.length)return true;
    const effects={glow:true,camera:true,rings:true,threads:true,streaks:true,mesh:true,trails:true,...state.effects?.[style]},speed=.25+clamp(Number(state.motionSpeed??.35),.1,1)*1.3,t=time*speed,opacity=clamp(Number(state.opacity??.85),.1,1),palette=state.colours?.length?state.colours:['#81bdff','#d99fff','#88e2d2'];
    const colour=n=>palette[((n.track||0)%palette.length+palette.length)%palette.length],tone=index=>palette[index%palette.length];
    let eye=[Math.sin(t*.1)*.7,1.2,10],target=[0,0,0];
    if(style==='voxel'){eye=[Math.sin(t*.08)*1.1,4.7,10];target=[0,-.8,-3];}
    if(style==='portals'){eye=[Math.sin(t*.12)*.35,Math.cos(t*.1)*.25,9];target=[0,0,-14];}
    if(!effects.camera)eye=style==='voxel'?[0,4.7,10]:[0,style==='portals'?0:1.2,10];
    const r=renderer(ctx,w,h,eye,target,opacity,effects.glow),blooms=[];
    // A faint atmosphere gives the geometry depth without replacing the chosen background.
    if(effects.glow){ctx.save();const gradient=ctx.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,Math.max(w,h)*.55);gradient.addColorStop(0,tone(0));gradient.addColorStop(1,'transparent');ctx.globalAlpha=opacity*(.035+music.energy*.035);ctx.fillStyle=gradient;ctx.fillRect(0,0,w,h);ctx.restore();}
    if(style==='crystal'){
      // Chord Reactor: each pitch bends a luminous orbit around a breathing core.
      const spin=t*.18,radius=2.3+music.bass*.3;
      const events=music.events;
      events.forEach((n,index)=>{const plane=(n.pitch%12)/12*Math.PI,tilt=.35+((n.pitch/12)%1)*1.5,ringRadius=radius+(n.pitch-60)*.018,segments=effects.rings?64:20,points=[];
        for(let i=0;i<=segments;i++){const a=i/segments*TAU,ripple=Math.sin(a*3-n.age*2)*n.strength*.22,rr=ringRadius+ripple,p=turn([Math.cos(a)*rr,Math.sin(a)*rr,0],plane+spin,tilt);points.push(p);}
        r.path(points,colour(n),n.release*(.2+n.strength*.7),.6+n.strength*2.4);
        const a=n.age*speed*.65+n.pitch,head=turn([Math.cos(a)*ringRadius,Math.sin(a)*ringRadius,0],plane+spin,tilt);r.point(head,colour(n),n.release,2+n.hit*3);if(n.hit>.08)blooms.push([head,colour(n),n.hit*.25,.09]);
      });
      const detail=32;for(let band=0;band<9;band++){const latitude=(band/8-.5)*Math.PI,points=[];for(let i=0;i<=detail;i++){const a=i/detail*TAU,rr=(.7+music.energy*.55)*(1+Math.sin(a*4+t*.8)*music.attack*.15);points.push(turn([Math.cos(a)*Math.cos(latitude)*rr,Math.sin(latitude)*rr,Math.sin(a)*Math.cos(latitude)*rr],spin*1.5));}r.path(points,tone(band),.2+music.energy*.35,1);}
      blooms.push([[0,0,0],tone(1),.12+music.attack*.25,.24]);
    }else if(style==='helix'){
      // Ribbon Current: sustained notes become broad, twisting ribbons flowing across the frame.
      music.events.forEach((n,index)=>{const pitch=(n.pitch-timing.low)/(timing.high-timing.low||1),phase=n.pitch*.24+n.track*.7,depth=((n.pitch*7)%11-5)*.32,release=n.release;
        const point=u=>{const x=(u-.5)*15,y=(pitch-.5)*4+Math.sin(u*TAU-t*.65+phase)*(.55+n.strength)+Math.sin(u*12+t*.4)*.18,z=depth+Math.cos(u*TAU-t*.4+phase)*1.2;return [x,y,z];};
        const width=.04+n.strength*.18;let previous;
        for(let i=0;i<=64;i++){const u=i/64,p=point(u),twist=u*8+t*.5+phase,left=[p[0],p[1]+Math.cos(twist)*width,p[2]+Math.sin(twist)*width],right=[p[0],p[1]-Math.cos(twist)*width,p[2]-Math.sin(twist)*width];if(previous){const edge=Math.pow(Math.sin(u*Math.PI),.4);r.path([previous.left,left,right,previous.right],colour(n),release*edge*.55,1,true,.65+.35*Math.sin(twist));}previous={left,right};}
        if(effects.threads)r.path(Array.from({length:65},(_,i)=>point(i/64)),colour(n),release*(.25+n.strength*.6),1.1);
        const u=.5+Math.sin(n.age*speed*.5+phase)*.3,head=point(u);r.point(head,'#f2edff',release*(.3+n.hit*.7),2.2+n.hit*2);if(n.hit>.1)blooms.push([head,colour(n),n.hit*.2,.08]);
      });
    }else if(style==='portals'){
      // Hyperdrive: steady forward travel with chord-triggered rings and travelling light streaks.
      for(let gate=0;gate<30;gate++){const progress=((gate*1.7-t*2.2)%51+51)%51,z=6-progress,fade=Math.min(1,progress/2)*Math.min(1,(51-progress)/4),angle=Math.sin(t*.13+progress*.06)*.35+music.bass*.14,rr=4.2+Math.sin(progress*.17-t*.22)*.45+music.attack*.16,points=[];
        for(let i=0;i<=8;i++){const a=i/8*TAU+angle;points.push([Math.cos(a)*rr,Math.sin(a)*rr,z]);}r.path(points,tone(gate),fade*(.14+music.energy*.4),.6+music.attack*1.7);
      }
      music.events.forEach(n=>{const age=n.age*speed,travel=age*4.2,z=5-travel;if(z< -48)return;const angle=n.pitch/12*TAU+t*.07,rr=4+Math.sin(age)*.25,head=[Math.cos(angle)*rr,Math.sin(angle)*rr,z];r.point(head,colour(n),n.release,3+n.hit*3);if(effects.streaks)r.path([head,[head[0],head[1],z-1.5-n.strength*3]],colour(n),n.release*.85,1.8);if(n.hit>.08)blooms.push([head,colour(n),n.hit*.18,.07]);});
    }else if(style==='voxel'){
      // Resonance Terrain: note-driven wave fronts travel through a shaded, continuous surface.
      const columns=42,rows=30,grid=[];
      for(let iz=0;iz<=rows;iz++){const row=[];for(let ix=0;ix<=columns;ix++){const x=(ix/columns-.5)*19,z=4-iz/rows*24;let y=-2+Math.sin(x*.5+z*.22+t*.45)*.22;
        for(const n of music.events){const centre=(n.pitch-timing.low)/(timing.high-timing.low||1)*16-8,distance=Math.hypot((x-centre)*.8,(z+6)*.48),wave=Math.cos(distance*1.3-n.age*2.4)*Math.exp(-Math.abs(distance-n.age*1.7)*.75);y+=wave*(n.velocity||.5)*n.release*1.05;}
        row.push([x,y,z]);}grid.push(row);}
      for(let iz=0;iz<rows;iz++)for(let ix=0;ix<columns;ix++){const a=grid[iz][ix],b=grid[iz][ix+1],c=grid[iz+1][ix+1],d=grid[iz+1][ix],height=(a[1]+b[1]+c[1]+d[1])/4,colour= tone(Math.floor(ix/7)),light=clamp(.5+(height+2)*.4,.22,1.25);r.path([a,b,c,d],colour,.7,1,true,light);}
      if(effects.mesh){for(let iz=0;iz<=rows;iz+=2)r.path(grid[iz],tone(Math.floor(iz/6)),.26+music.attack*.15,.7);for(let ix=0;ix<=columns;ix+=3)r.path(grid.map(row=>row[ix]),tone(Math.floor(ix/7)),.17,.6);}
      music.events.forEach(n=>{if(n.hit>.1){const x=(n.pitch-timing.low)/(timing.high-timing.low||1)*16-8;blooms.push([[x,-1.5,-6],colour(n),n.hit*.16,.09]);}});
    }else if(style==='origami'){
      // Starlight Swarm: cohesive flowing filaments, sculpted by pitch and velocity.
      const strongest=[...music.events].sort((a,b)=>b.strength-a.strength),streamCount=24,steps=48;
      for(let stream=0;stream<streamCount;stream++){const n=strongest[stream%strongest.length],phase=stream*2.39996+(n.pitch%12)*.09,points=[];
        for(let i=0;i<steps;i++){const u=i/(steps-1),a=u*TAU*1.5+t*.22+phase,radius=1.2+u*2.4+Math.sin(u*8-t*.4+phase)*(.2+music.bass*.4),p=turn([Math.cos(a)*radius,(u-.5)*6,Math.sin(a)*radius],Math.sin(t*.11)*.3,.5+Math.sin(t*.07)*.2);points.push(p);const sparkle=.35+.65*Math.pow(Math.sin(u*9-t*.8+phase),2);r.point(p,colour(n),n.release*singleFade(u)*sparkle*(.7+n.strength*.6),1+n.strength*2);}
        if(effects.trails)r.path(points,colour(n),n.release*(.24+n.strength*.28),.6);
        const head=points[Math.floor(((n.age*speed*.15+stream*.061)%1)*(steps-1))];r.point(head,'#f0edff',n.release*(.4+n.hit*.6),2+n.hit*2);if(n.hit>.15&&stream<8)blooms.push([head,colour(n),n.hit*.13,.08]);
      }
    }
    r.draw();for(const args of blooms)r.bloom(...args);return true;
  }
  function singleFade(u){return Math.pow(Math.sin(u*Math.PI),.4);}
  // Smaller scene signatures use the same geometry language at audio-style note anchors.
  function accent(ctx,look,x,y,size,colour,age,pitch,velocity,effects,motion,opacity){
    const r=renderer(ctx,size*8,size*6,[0,1,9],[0,0,0],opacity,effects.glow);ctx.save();ctx.translate(x-size*4,y-size*3);const t=age*(.25+motion*1.3),hit=Math.exp(-age*4.5);
    if(look==='crystal'){for(let ring=0;ring<3;ring++){const points=Array.from({length:49},(_,i)=>turn([Math.cos(i/48*TAU)*2,Math.sin(i/48*TAU)*2,0],ring*Math.PI/3+t*.25,ring*.5));r.path(points,colour,.4+hit*.5,1);}}
    else if(look==='portals'){for(let gate=0;gate<4;gate++){const z=-gate*2+((t*.6)%2),points=Array.from({length:9},(_,i)=>[Math.cos(i/8*TAU+t*.1)*2.4,Math.sin(i/8*TAU+t*.1)*2.4,z]);r.path(points,colour,.7-gate*.12,1);}}
    else{for(let strand=0;strand<4;strand++){const points=Array.from({length:33},(_,i)=>{const u=i/32;if(look==='origami')return turn([Math.cos(u*TAU+strand)*2,(u-.5)*4,Math.sin(u*TAU+strand)*2],t*.15,.4);return [(u-.5)*7,Math.sin(u*8-t+strand)*(.3+velocity*.5),strand*.45-1];});r.path(points,colour,.25+hit*.35,look==='helix'?1.5:.7);if(look==='origami')points.forEach((p,i)=>{if(i%3===0)r.point(p,colour,.7,1);});}}
    r.draw();r.bloom([0,0,0],colour,hit*.2,.25);ctx.restore();
  }
  const api={paint,styles,accent};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.Midi3D=api;
})(typeof window==='undefined'?globalThis:window);
