(function(root){
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const rgba=(hex,a)=>{const n=parseInt(hex.slice(1),16);return `rgba(${n>>16},${n>>8&255},${n&255},${clamp(a)})`;};
// Geometry and history use normalised coordinates, so preview, Live and export
// share the same motion. No canvas objects enter the seek/checkpoint state.
function paint(ctx,w,h,levels,s,p,dt,bass,mid,treble,palette,design){
  const glow=p[6]??1,separation=p[7]??1,spread=p[8]??1,tail=p[9]??.22,twist=p[10]??.12;
  const target=clamp((bass*.55+mid*.3+treble*.15)*1.7*(p[2]??.8));
  const l=s.laser??={level:target,previous:target,attack:0,history:[],sample:-1};
  if(dt>0){
    l.attack=Math.max(l.attack*Math.exp(-dt/.14),clamp((target-l.previous)*3));
    l.level+=(target-l.level)*(1-Math.exp(-dt/(target>l.level?.025:.16)));
    l.previous=target;
  }
  const power=clamp(l.level+l.attack*.3),visibility=clamp((power-.008)*2.4);
  if(visibility<.002){l.history=[];return;}
  const unit=Math.min(w,h),phase=s.clock*2.1,n=Math.round(clamp(p[1]??22,8,40))*3;
  const mode=Math.round(p[4]||0),breath=mode===5?1+Math.sin(phase)*power*.12:1;
  const width=Math.min(w/unit*.46,(.025+Math.pow(power,.7)*.7)*spread*breath);
  const points=[];
  for(let i=0;i<=n;i++){
    const u=i/n,f=u*(levels.length-1),a=Math.floor(f),v=levels[a]*(1-(f-a))+(levels[Math.min(a+1,levels.length-1)]||0)*(f-a);
    const folds=.24+.76*Math.pow(Math.sin(u*11-phase*.8),2);
    const taper=Math.pow(Math.sin(Math.PI*(u*.97+.015)),.45);
    const ripple=mode===4?1+Math.sin(u*18-phase*3)*power*.25:1;
    const height=(.003+Math.pow(clamp(v),1.2)*(.11+power*.14)*folds)*taper*ripple;
    points.push([u*width,height]);
  }
  const angle=mode===0?0:Math.sin(phase*.27)*twist*.3+(mode===3?Math.sin(phase*.18)*.24:mode===2?Math.sin(phase*.7)*power*.3:0);
  const sample=Math.floor(s.clock*30);
  if(dt>0&&sample!==l.sample){l.history.push({points,at:s.clock,level:visibility,angle});l.sample=sample;}
  l.history=l.history.filter(frame=>s.clock-frame.at<tail).slice(-14);
  const preset=Math.round(p[3]??4)===4&&!(design.customColours!==false&&design.colours?.length>=2);
  const core=preset?'#ff19ab':palette[0],solid=design.kind==='solid';
  const fringe=solid?[core]:palette.slice().reverse();
  ctx.save();ctx.translate(w/2,h/2);ctx.scale(unit,unit);ctx.rotate(angle);
  if(mode===1)ctx.translate(Math.sin(phase*.4)*power*.08,Math.cos(phase*.3)*power*.04);
  ctx.globalCompositeOperation='lighter';ctx.lineCap='round';ctx.lineJoin='round';
  let ink=core;
  if(design.kind==='linear'||design.kind==='radial'){
    const a=(design.angle??45)*Math.PI/180,extent=Math.max(.04,width),dx=Math.cos(a)*extent,dy=Math.sin(a)*extent;
    ink=design.kind==='radial'?ctx.createRadialGradient(0,0,0,0,0,extent):ctx.createLinearGradient(-dx,-dy,dx,dy);
    palette.forEach((colour,i)=>ink.addColorStop(i/(palette.length-1),colour));
  }
  function contour(vertices,scaleX,scaleY,colour,alpha,thickness){
    ctx.globalAlpha=typeof colour==='string'?1:clamp(alpha);ctx.strokeStyle=typeof colour==='string'?rgba(colour,alpha):colour;ctx.lineWidth=thickness;
    ctx.beginPath();
    for(const side of [-1,1])for(const vertical of [-1,1])vertices.forEach(([x,y],i)=>{const px=side*x*scaleX,py=vertical*y*scaleY;i?ctx.lineTo(px,py):ctx.moveTo(px,py);});
    ctx.stroke();ctx.globalAlpha=1;
  }
  // Short expanding echoes create depth; quiet passages fall back into black.
  for(const frame of l.history){
    const age=s.clock-frame.at;if(age<.025)continue;
    const fade=Math.pow(1-age/Math.max(.001,tail),2)*frame.level*.14;
    contour(frame.points,1+age*1.8,1+age*2.8,ink,fade,.003);
  }
  // Refracted light fans emerge from frequency peaks rather than every point.
  if(separation>0&&glow>0){
    const strength=visibility*power*glow;
    for(let i=3;i<n;i+=Math.max(3,Math.round(n/12))){
      const [x,y]=points[i];if(y<.016)continue;
      for(const side of [-1,1])for(const vertical of [-1,1]){
        const reach=1.6+separation*2.2,px=side*x,py=vertical*y;
        const beam=ctx.createLinearGradient(px,py,px*reach,py*reach);
        beam.addColorStop(0,rgba(core,strength*.15));
        for(let band=0;band<fringe.length;band++)beam.addColorStop(.12+band/(fringe.length)*.72,rgba(fringe[band],strength*.055));
        beam.addColorStop(1,rgba(core,0));ctx.fillStyle=beam;
        ctx.beginPath();ctx.moveTo(px-.002,py);ctx.lineTo(px*reach-.025*separation,py*reach);ctx.lineTo(px*reach+.025*separation,py*reach);ctx.lineTo(px+.002,py);ctx.closePath();ctx.fill();
      }
    }
    for(let i=fringe.length-1;i>=0;i--){
      const distance=(i+1)/fringe.length*separation*(.3+power*.9);
      contour(points,1+distance,1+distance*2,fringe[i],visibility*.045*glow,.018+distance*.035);
    }
  }
  // A broad coloured halo, a saturated filament, then a narrow hot centre.
  if(glow>0){contour(points,1,1,ink,visibility*.10*glow,.035);contour(points,1,1,ink,visibility*.22*glow,.012);}
  contour(points,1,1,ink,visibility*.8,.0035);
  contour(points,1,1,preset?'#ffe7ff':ink,visibility*.72,.0012);
  ctx.beginPath();
  for(const [x,y] of points){if(y<.008)continue;for(const side of [-1,1]){ctx.moveTo(side*x,-y);ctx.lineTo(side*x,y);}}
  ctx.strokeStyle=rgba(core,visibility*.18);ctx.lineWidth=.0014;ctx.stroke();
  // Light knots flare on attacks, then decay instead of hiding the next hit.
  if(l.attack>.015){
    const radius=.012+l.attack*.065,hot=ctx.createRadialGradient(0,0,0,0,0,radius);
    hot.addColorStop(0,rgba('#fff4ff',l.attack*.65));hot.addColorStop(.2,rgba(core,l.attack*.4));hot.addColorStop(1,rgba(core,0));ctx.fillStyle=hot;ctx.fillRect(-radius,-radius,radius*2,radius*2);
  }
  ctx.restore();
}
if(typeof module!=='undefined'&&module.exports)module.exports={paint};else root.LaserBloom={paint};
})(typeof globalThis!=='undefined'?globalThis:this);
