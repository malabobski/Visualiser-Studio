(function(root){
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const hash=n=>{const x=Math.sin(n*127.1+311.7)*43758.5453;return x-Math.floor(x);};
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${clamp(a)})`;};
function mix(a,b,t){
  const x=parseInt(a.slice(1),16),y=parseInt(b.slice(1),16);
  return '#'+[16,8,0].map(shift=>Math.round((x>>shift&255)*(1-t)+(y>>shift&255)*t).toString(16).padStart(2,'0')).join('');
}
// Geometry and bounded wake histories use normalised coordinates.
// This keeps export, pause, scrubbing and repeated song sections consistent.
function paint(ctx,w,h,levels,s,p,dt,bass,mid,treble,palette,design,style,hits=[]){
  const target=clamp((bass*.52+mid*.33+treble*.15)*1.8*(p[2]??.8));
  const state=s.refraction??={level:target,previous:target,attack:0,motion:0,turn:0,elapsed:0,impulses:Array(48).fill(0),paths:[]};
  if(dt>0){
    const strike=hits.reduce((v,hit)=>Math.max(v,hit.v),0);
    state.attack=Math.max(state.attack*Math.exp(-dt/.17),clamp((target-state.previous)*3.5),strike);
    state.level+=(target-state.level)*(1-Math.exp(-dt/(target>state.level?.025:.23)));
    state.previous=target;
    state.elapsed+=dt;
    state.impulses=state.impulses.map(v=>v*Math.exp(-dt/.24));
    for(const hit of hits)state.impulses[hit.lane]=Math.max(state.impulses[hit.lane],hit.v);
    state.motion+=dt*(.55+state.level*1.55+state.attack*3.6)*(p[0]??.4)/.4;
    state.turn+=dt*state.attack*2.4;
  }
  const power=clamp(state.level+state.attack*.25),visible=clamp((power-.009)*2.5);
  if(visible<.002){state.paths=[];return;}
  const unit=Math.min(w,h),aspect=w/unit,phase=state.motion,detail=Math.round(p[1]??22);
  const glow=p[6]??1,split=design.kind==='solid'?0:p[7]??1,depth=p[8]??1,tail=p[9]??.5,shape=p[10]??1;
  const mode=Math.round(p[4]||0),angle=(design.angle??45)*Math.PI/180;
  function colour(index,x=0,y=0){
    if(design.kind==='solid')return palette[0];
    if(design.kind!=='linear'&&design.kind!=='radial')return palette[Math.abs(index)%palette.length];
    const position=design.kind==='radial'?clamp(Math.hypot(x,y)):clamp(.5+(x*Math.cos(angle)+y*Math.sin(angle))*.6);
    const at=position*(palette.length-1),i=Math.floor(at);return mix(palette[i],palette[Math.min(i+1,palette.length-1)],at-i);
  }
  const band=u=>levels[Math.min(levels.length-1,Math.floor(clamp(u)*levels.length))]||0;
  const impulse=u=>{const i=Math.min(47,Math.floor(u*48));return Math.max(...state.impulses.slice(Math.max(0,i-2),Math.min(48,i+3)));};
  ctx.save();ctx.translate(w/2,h/2);ctx.scale(unit,unit);ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.lineJoin='round';
  if(mode===1)ctx.translate(Math.sin(phase*.45)*.045,Math.cos(phase*.36)*.03);
  if(mode===2)ctx.rotate(Math.sin(phase*.55)*.12);
  if(mode===3)ctx.rotate(Math.sin(phase*.25)*.32);
  if(mode===5)ctx.scale(1+Math.sin(phase*.8)*power*.08,1+Math.sin(phase*.8)*power*.08);
  const line=(points,tint,alpha,width)=>{
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.strokeStyle=rgba(tint,alpha*visible);ctx.lineWidth=width;ctx.stroke();
  };
  function flare(x,y,radius,strength,tint){
    const r=Math.max(.001,radius),g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,rgba('#f4fbff',strength*.9));g.addColorStop(.12,rgba(tint,strength*.8));g.addColorStop(.4,rgba(tint,strength*.2));g.addColorStop(1,rgba(tint,0));
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  function star(x,y,size,strength,tint){
    if(strength<.005)return;
    if(glow)flare(x,y,size*4,strength*visible*glow,tint);
    for(const a of [Math.PI/4,-Math.PI/4]){
      const dx=Math.cos(a)*size,dy=Math.sin(a)*size;
      line([[x-dx,y-dy],[x,y],[x+dx,y+dy]],tint,strength,.003);
      line([[x-dx*.5,y-dy*.5],[x,y],[x+dx*.5,y+dy*.5]],'#eafaff',strength,.0013);
    }
  }
  // A white source, cold near-field colours and warm colours farther down a beam.
  function beam(x,y,endX,endY,width,strength,index){
    if(strength<.004)return;
    const dx=endX-x,dy=endY-y,length=Math.max(.001,Math.hypot(dx,dy)),nx=-dy/length,ny=dx/length;
    const gradient=ctx.createLinearGradient(x,y,endX,endY);
    gradient.addColorStop(0,rgba('#e9fbff',strength*visible*.8));
    gradient.addColorStop(.1,rgba(colour(index,x,y),strength*visible*.65));
    gradient.addColorStop(.48,rgba(colour(index+1,endX*.5,endY*.5),strength*visible*.3));
    gradient.addColorStop(.82,rgba(colour(index+2,endX,endY),strength*visible*.15));
    gradient.addColorStop(1,rgba(colour(index+2),0));
    ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(x-nx*.001,y-ny*.001);ctx.lineTo(endX-nx*width,endY-ny*width);ctx.lineTo(endX+nx*width,endY+ny*width);ctx.lineTo(x+nx*.001,y+ny*.001);ctx.closePath();ctx.fill();
  }
  if(style==='wings'){
    const gap=.08+power*.045+Math.sin(phase*1.3)*.028+state.attack*.07,coreRadius=(.026+power*.034)*shape;
    const coreY=Math.sin(phase*1.6)*(.035+mid*.055),bank=Math.sin(phase*.85)*.28;
    const rays=Math.max(8,Math.round(detail*.65)),reach=Math.min(aspect*.65,1.8)*(.5+depth*.5);
    // The emitters bank and separate; each light sweeps and carries travelling flashes.
    for(const side of [-1,1]){
      for(let i=0;i<rays;i++){
        const u=i/(rays-1),v=band(u),kick=impulse(u);
        const sweep=(u-.5)*(.55+power*.65)*shape+Math.sin(phase*1.6+u*5)*(.22+mid*.35)+bank+kick*(u-.5)*1.1;
        const sourceX=side*(gap+coreRadius*.75),sourceY=coreY+(u-.5)*coreRadius*1.7;
        const rayLength=reach*(.72+Math.sin(phase*1.9+i*.6)*.16+kick*.35);
        const points=[];
        for(let j=0;j<=28;j++){
          const t=j/28,x=sourceX+side*Math.cos(sweep)*t*rayLength,bend=Math.sin(t*7-phase*3+u*4)*t*(.035+mid*.08+kick*.04);
          const ripple=mode===4?Math.sin(t*14-phase*3)*t*.025*power:0;
          points.push([x,sourceY+Math.sin(sweep)*t*rayLength+bend+ripple]);
        }
        const strength=(.12+v*.45+kick*.6)*power;
        if(glow)beam(sourceX,sourceY,points.at(-1)[0],points.at(-1)[1],(.008+v*.018)*split,strength*glow,i);
        for(let j=0;j<points.length-1;j++){
          const t=j/(points.length-1),tint=design.kind==='solid'?palette[0]:colour(Math.floor(t*(palette.length-1)),points[j][0],points[j][1]);
          line([points[j],points[j+1]],tint,strength*Math.pow(1-t,1.5),.001+v*.0008);
        }
        line(points.slice(0,4),'#e8fcff',strength*.9,.0012);
        const travel=(phase*(1.15+v*.9)+i*.137)%1,at=travel*(points.length-1),index=Math.floor(at),fraction=at-index;
        const a=points[index],b=points[Math.min(points.length-1,index+1)],px=a[0]+(b[0]-a[0])*fraction,py=a[1]+(b[1]-a[1])*fraction;
        const behind=points[Math.max(0,index-2)];
        line([behind,[px,py]],'#e9fbff',strength*Math.sin(travel*Math.PI)*.9,.0018+kick*.002);
        if(glow)flare(px,py,.005+kick*.012,strength*Math.sin(travel*Math.PI)*glow*.35,colour(i));
      }
      // Rotating particle shells use projection and front/back shading for volume.
      const count=detail*12;
      for(let i=0;i<count;i++){
        const z=1-2*(i+.5)/count,phi=i*2.399963+phase*(.22+bass*.3),ring=Math.sqrt(1-z*z);
        const x=ring*Math.cos(phi),y=ring*Math.sin(phi),turn=phase*.37;
        const rx=x*Math.cos(turn)+z*Math.sin(turn),rz=z*Math.cos(turn)-x*Math.sin(turn),projection=1/(1-rz*.3*depth);
        const r=coreRadius*(1+band(i/count)*.3),px=side*(gap+rx*r*projection),py=coreY+y*r*projection;
        const strength=(.15+Math.max(0,rz)*.65)*visible*(.25+power*.7),tint=colour(3+Math.floor(i/count*2),px,py);
        if(tail>0)line([[px,py],[px-side*Math.sin(phi)*r*tail*.2,py-Math.cos(phi)*r*tail*.2]],tint,strength*.3,.0006);
        ctx.fillStyle=rgba(tint,strength);ctx.fillRect(px,py,.0008+projection*.00065,.0008+projection*.00065);
      }
      if(glow)flare(side*gap,coreY,coreRadius*1.3,visible*power*.12*glow,colour(3));
    }
    // Deterministic far-field streaks move through perspective without growing state.
    for(let i=0;i<detail*2;i++){
      const cycle=(phase*.45+hash(i+31))%1,a=hash(i+72)*Math.PI*2+state.turn*.2,r=.1+cycle*cycle*1.2;
      const x=Math.cos(a)*r*aspect*.6,y=Math.sin(a)*r*.6,fade=Math.sin(cycle*Math.PI)*treble*.45;
      line([[x,y],[x*(1+tail*(.2+state.attack*.4)),y*(1+tail*(.2+state.attack*.4))]],colour(3+i%2),fade,.0008+cycle*.0014);
    }
    star(0,coreY,.007+state.attack*.028,visible*(.2+state.attack*.8),colour(2));
  }else{
    const objects=[],count=Math.max(4,Math.round(detail/3));
    state.paths.length=count;
    for(let i=0;i<count;i++){
      const seed=hash(i+81)*Math.PI*2,kick=impulse(i/count),t=phase*(.7+hash(i+9)*.6);
      const z=1.1+Math.sin(t*.63+seed)*.55*depth,projection=1/(z+.65);
      const turn=state.turn*(hash(i+18)-.5),a=t*.8+seed+turn;
      const x=(Math.sin(a)*.6+Math.cos(t*1.7+seed)*.14)*aspect*projection+Math.cos(seed)*kick*.1;
      const y=(Math.cos(t*.93+seed*1.7)*.48+Math.sin(t*1.4+seed)*.12)*projection+Math.sin(seed)*kick*.1;
      const radius=(.05+hash(i+3)*.12)*projection*shape*(.65+power*.5+kick*.25);
      const path=state.paths[i]??=[];
      if(!path.length||dt>0&&state.elapsed-path.at(-1).at>=1/60-1e-6)path.push({x,y,at:state.elapsed});
      while(path.length>Math.max(2,Math.ceil(tail*40)+2))path.shift();
      objects.push({i,x,y,z,radius,path,kick});
    }
    objects.sort((a,b)=>b.z-a.z);
    for(const o of objects){
      const {i,x,y,radius:r,path,kick}=o;
      const fade=visible,tint=colour(i,x,y),emission=fade*(.25+power*.6+kick*.65),rim=[];
      if(fade<.002)continue;
      // Every wake follows that comet's actual recent positions, including recoil.
      if(tail>0&&path.length>1){
        const recent=[{x,y},...path.slice(0,-1).reverse()];
        for(let k=0;k<recent.length-1;k++){
          const a=recent[k],b=recent[k+1],age=k/(recent.length-1),dx=b.x-a.x,dy=b.y-a.y,length=Math.max(.0001,Math.hypot(dx,dy)),nx=-dy/length,ny=dx/length;
          const strength=emission*Math.pow(1-age,1.5);
          for(let j=0;j<3;j++){
            const offset=(j-1)*r*.22*split*(.2+age);
            line([[a.x+nx*offset,a.y+ny*offset],[b.x+nx*offset,b.y+ny*offset]],colour(i+j,a.x,a.y),strength*.5,r*(.05+age*.15)*(.35+glow*.65));
          }
          line([[a.x,a.y],[b.x,b.y]],'#d9f7ff',strength*.3,.0015+kick*.002);
        }
        const last=recent[Math.min(recent.length-1,5)];
        beam(x,y,last.x,last.y,r*.12*split,emission*.35*glow,i);
      }
      const shell=ctx.createRadialGradient(x-r*.3,y-r*.3,r*.05,x,y,r);
      shell.addColorStop(0,rgba(tint,fade*power*.045));shell.addColorStop(.74,rgba(tint,fade*power*.025));shell.addColorStop(.93,rgba(tint,emission*.12));shell.addColorStop(1,rgba(tint,0));
      ctx.fillStyle=shell;ctx.fillRect(x-r,y-r,r*2,r*2);
      const segments=64+detail;
      for(let j=0;j<=segments;j++){
        const a=j/segments*Math.PI*2,v=band(j/segments),ripple=(.004+v*.018)*Math.sin(a*9+phase*1.8+i)*power;
        const rr=r*(1+ripple+(mode===4?Math.sin(a*5-phase*2)*power*.025:0));rim.push([x+Math.cos(a)*rr,y+Math.sin(a)*rr]);
      }
      if(glow)line(rim,tint,emission*.13*glow,.008);
      for(let j=0;j<segments;j++){
        const a=j/segments*Math.PI*2,edge=(.16+.84*Math.pow(Math.sin(a-phase*.4-i),4))*emission;
        line([rim[j],rim[j+1]],colour(i+Math.floor(j/segments*palette.length),rim[j][0],rim[j][1]),edge,.0015);
        if(split>0)line([[x+(rim[j][0]-x)*(1+.014*split),rim[j][1]],[x+(rim[j+1][0]-x)*(1+.014*split),rim[j+1][1]]],colour(i+2),edge*.35,.0008);
        if(Math.cos(a+i)>.45)line([rim[j],rim[j+1]],'#d9f7ff',edge*.65,.0007);
      }
      // Sparse curved caustics make the spheres feel transparent rather than solid discs.
      for(let j=0;j<3;j++){
        const caustic=[],rotation=phase*.2+i+j;
        for(let k=0;k<=28;k++){
          const a=k/28*Math.PI*2,px=Math.cos(a)*r*(.15+j*.25),py=Math.sin(a)*r;
          caustic.push([x+px*Math.cos(rotation)-py*Math.sin(rotation),y+px*Math.sin(rotation)+py*Math.cos(rotation)]);
        }
        line(caustic,tint,emission*.035*glow,.0007);
      }
      star(x,y,.004+r*.09+kick*.012,emission*(.5+kick*.7),colour(i+1));
    }
    star(0,0,.005+state.attack*.025,visible*(.1+state.attack*.9),colour(2));
  }
  ctx.restore();
}
if(typeof module!=='undefined'&&module.exports)module.exports={paint};else root.RefractionStyles={paint};
})(typeof globalThis!=='undefined'?globalThis:this);
