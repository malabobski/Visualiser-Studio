(function(root){
  function parse(input){
    const a=input instanceof Uint8Array?input:new Uint8Array(input),v=new DataView(a.buffer,a.byteOffset,a.byteLength);let p=0;
    const need=n=>{if(p+n>a.length)throw Error('This MIDI file is truncated.');};const u8=()=>{need(1);return a[p++];},u16=()=>{need(2);const n=v.getUint16(p);p+=2;return n;},u32=()=>{need(4);const n=v.getUint32(p);p+=4;return n;},tag=()=>String.fromCharCode(u8(),u8(),u8(),u8());
    const vlq=()=>{let n=0;for(let i=0;i<4;i++){const b=u8();n=(n<<7)|(b&127);if(!(b&128))return n;}throw Error('Invalid MIDI event length.');};
    if(a.length>16*1024*1024)throw Error('Please use a MIDI file smaller than 16 MB.');if(tag()!=='MThd')throw Error('Please choose a standard .mid or .midi file.');const length=u32();if(length<6)throw Error('Invalid MIDI header.');const format=u16(),count=u16(),division=u16();if(count>4096)throw Error('This MIDI has more than 4,096 tracks.');if(format>1)throw Error('This MIDI uses independent sequences (format 2). Export it as format 0 or 1.');if(!division||(division&32768))throw Error('Export the MIDI with musical beat timing (PPQN), rather than SMPTE timing.');need(length-6);p+=length-6;
    const notes=[],tracks=[],tempos=[{beat:0,bpm:120}];let lastBeat=0;
    for(let t=0;t<count;t++){
      if(tag()!=='MTrk')throw Error('Invalid MIDI track.');const len=u32();need(len);const end=p+len;let tick=0,status=0,name='Track '+(t+1);const active=new Map(),held=new Map(),pedal=new Map();
      const finish=(note,at)=>{note.end=Math.max(note.start+.001,at/division);notes.push(note);if(notes.length>100000)throw Error('This MIDI contains more than 100,000 notes.');};
      while(p<end){tick+=vlq();lastBeat=Math.max(lastBeat,tick/division);let byte=u8();if(byte<128){if(!status)throw Error('Invalid MIDI running status.');p--;byte=status;}else if(byte<240)status=byte;
        if(byte===255){const type=u8(),n=vlq();need(n);if(p+n>end)throw Error('Invalid MIDI meta event.');if(type===81&&n===3){const micros=(a[p]<<16)|(a[p+1]<<8)|a[p+2];if(micros){tempos.push({beat:tick/division,bpm:60000000/micros});if(tempos.length>20000)throw Error('This MIDI has more than 20,000 tempo changes.');}}if(type===3)name=new TextDecoder().decode(a.slice(p,p+n)).slice(0,100);p+=n;if(type===47)break;continue;}
        if(byte===240||byte===247){status=0;const n=vlq();need(n);if(p+n>end)throw Error('Invalid MIDI system event.');p+=n;continue;}if(byte>=240)throw Error('Unsupported MIDI system event.');
        const kind=byte>>4,ch=byte&15,d1=u8(),d2=kind===12||kind===13?0:u8();if(d1>127||d2>127||p>end)throw Error('Invalid MIDI channel event.');const key=ch+':'+d1;
        if(kind===9&&d2){const list=active.get(key)||[];list.push({start:tick/division,end:0,pitch:d1,velocity:d2/127,track:t,channel:ch});active.set(key,list);}
        else if(kind===8||(kind===9&&!d2)){const list=active.get(key);if(list?.length){const note=list.shift();if(pedal.get(ch)){const delayed=held.get(ch)||[];delayed.push(note);held.set(ch,delayed);}else finish(note,tick);}}
        else if(kind===11&&d1===64){const down=d2>=64;pedal.set(ch,down);if(!down){(held.get(ch)||[]).forEach(note=>finish(note,tick));held.delete(ch);}}
      }
      for(const list of active.values())list.forEach(note=>finish(note,tick));for(const list of held.values())list.forEach(note=>finish(note,tick));p=end;tracks.push({id:t,name});
    }
    notes.sort((a,b)=>a.start-b.start);tempos.sort((a,b)=>a.beat-b.beat);const tempoMap=[];for(const e of tempos){if(tempoMap.length&&tempoMap[tempoMap.length-1].beat===e.beat)tempoMap[tempoMap.length-1]=e;else tempoMap.push(e);}const usedTracks=new Set(notes.map(n=>n.track));return {notes,tracks:tracks.filter(t=>usedTracks.has(t.id)),tempos:tempoMap,beats:lastBeat};
  }
  const Midi3D=typeof module!=='undefined'&&module.exports?require('./midi-3d'):root.Midi3D;
  const cache=new WeakMap(),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  function nativeTimes(data){let seconds=0,last=0,bpm=120;return data.tempos.map(e=>{seconds+=(e.beat-last)*60/bpm;last=e.beat;bpm=e.bpm;return {time:seconds,value:bpm};});}
  function timing(state){
    if(cache.has(state))return cache.get(state);const offset=Number(state.offset)||0;
    let points=state.tempoPoints?.length?state.tempoPoints.map(p=>({time:Number(p.time),value:clamp(Number(p.value)||120,.01,60000000)})):state.useSourceTempo?nativeTimes(state.data).map(p=>({time:p.time+offset,value:p.value})):[{time:offset,value:clamp(Number(state.bpm)||120,20,400)}];
    points=points.filter(p=>Number.isFinite(p.time)).sort((a,b)=>a.time-b.time).filter((p,i,list)=>i===list.length-1||list[i+1].time!==p.time);if(!points.length)points=[{time:offset,value:120}];
    const linear=state.tempoPoints?.length&&state.tempoMode!=='hold';const lastBefore=(list,value,key)=>{let lo=0,hi=list.length-1;while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(list[mid][key]<=value)lo=mid;else hi=mid-1;}return lo;};
    const at=t=>{const i=lastBefore(points,t,'time'),previous=points[i],next=points[i+1];return linear&&next?previous.value+(next.value-previous.value)*clamp((t-previous.time)/Math.max(.000001,next.time-previous.time),0,1):previous.value;};
    const times=[offset,...points.filter(p=>p.time>offset).map(p=>p.time)];const segments=[];let beat=0;
    for(let i=0;i<times.length;i++){const start=times[i],end=times[i+1]??Infinity,bpm=at(start),slope=linear&&Number.isFinite(end)?(at(end)-bpm)/(end-start):0;segments.push({start,end,beat,bpm,slope});if(Number.isFinite(end)){const dt=end-start;beat+=(bpm*dt+slope*dt*dt/2)/60;}}
    const beatsAt=time=>{if(time<offset)return (time-offset)*segments[0].bpm/60;const s=segments[lastBefore(segments,time,'start')],dt=time-s.start;return s.beat+(s.bpm*dt+s.slope*dt*dt/2)/60;};
    const timeAt=beat=>{if(beat<0)return offset+beat*60/segments[0].bpm;const s=segments[lastBefore(segments,beat,'beat')];const delta=beat-s.beat,dt=Math.abs(s.slope)<1e-9?delta*60/s.bpm:120*delta/(s.bpm+Math.sqrt(Math.max(0,s.bpm*s.bpm+120*s.slope*delta)));return s.start+dt;};
    const selected=state.selectedTracks||state.data.tracks.map(t=>t.id);const notes=state.data.notes.filter(n=>selected.includes(n.track)).map(n=>{const settings=state.trackSettings?.[n.track]||{},shift=clamp(Number(settings.offset)||0,-3600,3600),octave=clamp(Math.round(Number(settings.octave)||0),-8,8);return {...n,pitch:clamp(n.pitch+octave*12,0,127),startTime:timeAt(n.start)+shift,endTime:timeAt(n.end)+shift};});const result={beatsAt,timeAt,notes,bpmAt:at,low:notes.reduce((v,n)=>Math.min(v,n.pitch),48),high:notes.reduce((v,n)=>Math.max(v,n.pitch),84)};cache.set(state,result);return result;
  }
  const effectDefaults={rain:{bounce:true,glow:true,ripples:true,sparks:true,beams:true},trails:{bounce:true,glow:true,echoes:true,ribbons:true,shimmer:true},constellation:{bounce:true,glow:true,orbit:true,links:true,satellites:true,veil:true}};
  const sceneCatalog={
    crystal:{name:'Chord Reactor · 3D',description:'Notes bend luminous orbits around a breathing core. Chords reshape the whole sculpture.'},
    helix:{name:'Ribbon Current · 3D',description:'Broad ribbons twist through space, with pitch shaping their height and notes sending bright pulses along them.'},
    portals:{name:'Hyperdrive · 3D',description:'Fly through a turning light corridor as notes fire streaks into its depth.'},
    voxel:{name:'Resonance Terrain · 3D',description:'Notes launch waves through a continuous illuminated landscape, building overlapping chord ripples.'},
    harp:{name:'Aurora Harp',description:'Each pitch plucks its own string, sending travelling waves and coloured ribbons through it.'},
    nebula:{name:'Nebula Bloom',description:'Notes unfold into layered petals; sustained chords form gently breathing celestial flowers.'},
    origami:{name:'Starlight Swarm · 3D',description:'Flowing particle filaments form a turning sculpture, with notes steering its colour and intensity.'}
  };
  Object.assign(effectDefaults,{crystal:{glow:true,camera:true,rings:true},helix:{glow:true,camera:true,threads:true},portals:{glow:true,camera:true,streaks:true},voxel:{glow:true,camera:true,mesh:true},harp:{glow:true,waves:true,ribbons:true},nebula:{glow:true,petals:true,pulse:true},origami:{glow:true,camera:true,trails:true}});
  function polygon(ctx,vertices,fill=true){ctx.beginPath();vertices.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();fill?ctx.fill():ctx.stroke();}
  function sceneGlyph(ctx,look,x,y,size,colour,age,pitch,velocity,effects,motion,opacity){
    if(Midi3D?.styles.has(look)){Midi3D.accent(ctx,look,x,y,size,colour,age,pitch,velocity,effects,motion,opacity);return;}
    ctx.save();ctx.translate(x,y);ctx.strokeStyle=colour;ctx.fillStyle=colour;ctx.lineWidth=Math.max(1,size*.035);const pulse=Math.exp(-Math.max(0,age)*3.5),phase=age*motion;
    if(effects.glow)noteHalo(ctx,0,0,size*.22,colour,opacity,age,velocity);ctx.globalAlpha=opacity*(effects.glow?glowEnvelope(age,velocity):1);
    if(look==='harp'){const amplitude=effects.waves?size*(.2+pulse*.8):0;ctx.beginPath();for(let i=0;i<=36;i++){const t=i/36,px=Math.sin(t*Math.PI)*Math.sin(t*14-phase*5)*amplitude,py=(t-.5)*size*8;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();if(effects.ribbons){ctx.globalAlpha=opacity*.22;ctx.lineWidth=size*.18;ctx.stroke();}ctx.globalAlpha=opacity;ctx.beginPath();ctx.arc(0,0,size*.16*(1+pulse),0,Math.PI*2);ctx.fill();}
    else if(look==='nebula'){const count=effects.petals?7:3,breathe=effects.pulse?1+pulse*.35+Math.sin(phase*1.2)*.035:1;for(let i=0;i<count;i++){ctx.save();ctx.rotate(i*Math.PI*2/count+phase*.12);ctx.globalAlpha=opacity*.16;ctx.beginPath();ctx.ellipse(size*.5*breathe,0,size*.75*breathe,size*.24,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=opacity*.45;ctx.stroke();ctx.restore();}ctx.globalAlpha=opacity;ctx.beginPath();ctx.arc(0,0,size*.2,0,Math.PI*2);ctx.fill();}
    ctx.restore();
  }
  function paintScene(ctx,w,h,time,state){const {notes,low,high}=timing(state),look=state.visual,effects={...effectDefaults[look],...state.effects?.[look]},motion=clamp(Number(state.motionSpeed??.35),.1,1),opacity=clamp(Number(state.opacity??.85),.1,1),unit=Math.min(w,h),palette=state.colours||['#9bb8ff'];
    for(const n of notes){const age=time-n.startTime;if(age<0||time>n.endTime+1.2)continue;const pitch=(n.pitch-low+.5)/(high-low+1),velocity=clamp(Number(n.velocity)||.5,0,1),fade=time<=n.endTime?1:Math.max(0,1-(time-n.endTime)/1.2),phase=time*motion;let x=pitch*w*.85+w*.075,y=h/2,size=unit*.075;
      if(look==='nebula'){const angle=n.pitch*2.39996+phase*.06,radius=unit*(.1+pitch*.3);x=w/2+Math.cos(angle)*radius;y=h/2+Math.sin(angle)*radius;size=unit*(.035+velocity*.025);}
      sceneGlyph(ctx,look,x,y,size,palette[n.track%palette.length],age,n.pitch,velocity,effects,motion,opacity*fade);
    }
  }
  const motionCache=new WeakMap();
  function smoothAudio(state,time,style,values){
    const speed=clamp(Number(state.motionSpeed??.35),.1,1);let previous=motionCache.get(state);
    if(!previous||previous.style!==style||previous.values.length!==values.length||time<previous.time||time-previous.time>1){previous={style,time,values:Array.from(values)};motionCache.set(state,previous);return previous.values;}
    const dt=Math.max(0,time-previous.time);for(let i=0;i<values.length;i++){const target=Number(values[i])||0,tau=(target>previous.values[i] ? .22 : .55)/speed;previous.values[i]+=(target-previous.values[i])*(1-Math.exp(-dt/tau));}previous.time=time;return previous.values;
  }
  function glowEnvelope(age,velocity=1){return age<0?0:.28+.72*Math.exp(-age*3.5)*(.55+.45*clamp(velocity,0,1));}
  function noteHalo(ctx,x,y,size,colour,opacity,age,velocity){const flare=Math.exp(-Math.max(0,age)*3.5)*(.55+.45*velocity);ctx.save();ctx.globalCompositeOperation='screen';ctx.globalAlpha=opacity*(.12+flare*.6);ctx.fillStyle=colour;ctx.shadowColor=colour;ctx.shadowBlur=size*(2+flare*5);ctx.beginPath();ctx.arc(x,y,size*(1+flare*.8),0,Math.PI*2);ctx.fill();if(flare>.05){ctx.globalAlpha=opacity*flare*.85;ctx.fillStyle='#f5efff';ctx.shadowBlur=size*2;ctx.beginPath();ctx.arc(x,y,Math.max(1,size*.38),0,Math.PI*2);ctx.fill();}ctx.restore();}
  function noteDetails(ctx,x,y,size,colour,opacity,age,pitch,effects,motion){
    if(age<0)return;ctx.save();ctx.shadowBlur=0;ctx.strokeStyle=colour;ctx.fillStyle=colour;
    if(effects.beams&&age<1){ctx.globalAlpha=opacity*Math.exp(-age*5)*.28;const gradient=ctx.createLinearGradient(0,0,0,-size*12);gradient.addColorStop(0,colour);gradient.addColorStop(1,'transparent');ctx.fillStyle=gradient;ctx.fillRect(-size*.35,-size*12,size*.7,size*12);ctx.fillStyle=colour;}
    if(effects.shimmer){for(let i=0;i<3;i++){ctx.globalAlpha=opacity*.18;ctx.strokeStyle=i===1?'#e7f0ff':colour;ctx.lineWidth=Math.max(.7,size*.08);ctx.beginPath();for(let j=0;j<=20;j++){const t=j/20,px=-t*size*18,py=Math.sin(t*10-age*motion*3+pitch*.17+i)*size*t*1.2;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}ctx.strokeStyle=colour;}
    if(effects.sparks&&age<1.2){const fade=Math.pow(1-age/1.2,2);for(let i=0;i<5;i++){const angle=i*Math.PI*2/5+pitch*.17,distance=size+age*size*(3+i*.25);ctx.globalAlpha=opacity*fade*.55;ctx.beginPath();ctx.arc(x+Math.cos(angle)*distance,y+Math.sin(angle)*distance+age*age*size,Math.max(.6,size*.12),0,Math.PI*2);ctx.fill();}}
    if(effects.ribbons){for(let strand=0;strand<2;strand++){ctx.globalAlpha=opacity*(strand?.18:.32);ctx.lineWidth=Math.max(1,size*.15);ctx.beginPath();for(let i=0;i<=24;i++){const t=i/24,px=x-t*size*16,py=y+Math.sin(t*8-age*motion*4+pitch*.19+strand*Math.PI)*size*t*1.8;i?ctx.lineTo(px,py):ctx.moveTo(px,py);}ctx.stroke();}}
    if(effects.satellites){for(let i=0;i<2;i++){const angle=age*motion*.9+i*Math.PI+pitch*.2,radius=size*(2.1+i*.45);ctx.globalAlpha=opacity*.2;ctx.lineWidth=.7;ctx.beginPath();ctx.ellipse(x,y,radius,radius*.65,pitch*.1,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=opacity*.65;ctx.beginPath();ctx.arc(x+Math.cos(angle)*radius,y+Math.sin(angle)*radius*.65,Math.max(1,size*.18),0,Math.PI*2);ctx.fill();}}ctx.restore();
  }
  function chordVeil(ctx,stars,opacity){if(stars.length<3)return;const visible=stars.slice(0,24),cx=visible.reduce((v,p)=>v+p.x,0)/visible.length,cy=visible.reduce((v,p)=>v+p.y,0)/visible.length;visible.sort((a,b)=>Math.atan2(a.y-cy,a.x-cx)-Math.atan2(b.y-cy,b.x-cx));ctx.save();ctx.shadowBlur=0;ctx.globalAlpha=opacity*.06;ctx.fillStyle=visible[0].colour;polygon(ctx,visible.map(p=>[p.x,p.y]));ctx.restore();}
  function paintOverlay(ctx,w,h,time,state,audioLook){
    const {notes,low,high}=timing(state),style=audioLook.style,values=smoothAudio(state,time,style,audioLook.values||[]),params=audioLook.params||[],unit=Math.min(w,h),look=state.visual||'rain',effects={...effectDefaults[look],...state.effects?.[look]},opacity=clamp(Number(state.opacity??.85),.1,1),palette=state.colours||['#9bb8ff'],points=[],motion=clamp(Number(state.motionSpeed??.35),.1,1),moveTime=time*motion;
    ctx.save();
    for(const note of notes){const age=time-note.startTime;if(age<0||time>note.endTime+.45)continue;const pitch=(note.pitch-low+.5)/(high-low+1),v=values.length?(values[Math.min(values.length-1,Math.floor(pitch*values.length))]||0):0,velocity=clamp(Number(note.velocity)||.5,0,1),attack=Math.exp(-Math.max(0,age)*7)*velocity,fade=time<=note.endTime?1:Math.max(0,1-(time-note.endTime)/.45),angle=pitch*Math.PI*2-Math.PI/2,bounce=effects.bounce?Math.sin(age*10)*attack*.45:0;let x=pitch*w,y=h*.5,a=angle;
      if(style==='bars'||style==='mirror'){const count=Math.max(1,Math.round(params[1]||64)),index=Math.min(count-1,Math.floor(pitch*count)),height=Math.max(3,(values[Math.floor(index/count*values.length)]||0)*h*(params[0]||.8));x=(index+.5)*w/count;y=style==='mirror'?h/2-height/2:h-height;}
      else if(style==='wave'){y=h/2+Math.sin(pitch*Math.PI*8+moveTime*2)*v*h*.25;}
      else if(style==='aurora'){y=h*.68-v*h*(params[0]||.6);}
      else if(style==='notes'){x=(pitch*w+moveTime*w*.04)%w;y=h*.18+(1-pitch)*h*.64;}
      else if(style==='city'){x=pitch*w;y=h*.65-v*h*.25+Math.sin(pitch*12+time)*h*.03;}
      else if(style==='prism'){a=angle+Math.sin(moveTime*.3+note.track)*.35;const radius=unit*(.15+pitch*.3+v*.08);x=w/2+Math.cos(a)*radius;y=h/2+Math.sin(a)*radius+Math.min(age,2)*unit*.006;}
      else if(style==='grid'){const columns=12,index=Math.floor(pitch*72);x=(index%columns+.5)*w/columns;y=(Math.floor(index/columns)+.5)*h/6;}
      else if(style==='particles'){x=((note.pitch*137.5+note.track*43+moveTime*18)%w+w)%w;y=((note.pitch*71+note.track*61-moveTime*(12+velocity*18))%h+h)%h;}
      else {let radius=unit*.3;if(style==='radial')radius=unit*(params[0]||.2)+v*unit*(params[1]||.3);if(style==='rings')radius=unit*(.1+pitch*.35+v*.06);if(style==='orbit'){a+=moveTime*(params[1]||.2);radius=unit*(.12+pitch*.3);}if(style==='spiral'){a=pitch*(params[1]||3)*Math.PI*2+moveTime*.15;radius=unit*(.04+pitch*.46)*(.35+v*.65);}if(style==='starburst')radius=unit*(.12+v*.35);if(style==='tunnel'){a+=moveTime*.15;radius=unit*(.08+((pitch+moveTime*.1)%1)*.4);}x=w/2+Math.cos(a)*radius;y=h/2+Math.sin(a)*radius;}
      y-=bounce*unit*.025;const colour=palette[note.track%palette.length],size=unit*(.005+velocity*.009)*(1+attack*.8);if(effects.glow)noteHalo(ctx,x,y,size,colour,opacity*fade,age,velocity);ctx.globalAlpha=opacity*fade*(effects.glow?glowEnvelope(age,velocity):1);ctx.fillStyle=colour;ctx.strokeStyle=colour;ctx.shadowColor=colour;ctx.shadowBlur=effects.glow?3+Math.exp(-age*3.5)*48:0;ctx.lineWidth=2;noteDetails(ctx,x,y,size,colour,opacity*fade,age,note.pitch,effects,motion);
      if(look==='rain'){ctx.save();ctx.translate(x,y);if(!['bars','mirror','wave','aurora','city','notes','grid'].includes(style))ctx.rotate(a+Math.PI/2);ctx.fillRect(-size/2,-size*2,size,size*2);ctx.restore();if(effects.ripples&&age<.7){ctx.globalAlpha*=1-age/.7;ctx.beginPath();ctx.arc(x,y,size+age*unit*.06,0,Math.PI*2);ctx.stroke();}}
      else if(look==='trails'){ctx.beginPath();ctx.moveTo(x-size*(2+velocity*4),y);ctx.lineTo(x,y);ctx.stroke();ctx.beginPath();ctx.arc(x,y,size*.65,0,Math.PI*2);ctx.fill();if(effects.echoes){ctx.shadowBlur=0;for(let i=1;i<=3;i++){ctx.globalAlpha=opacity*fade*(1-i/4)*.3;ctx.beginPath();ctx.arc(x-i*size*(2+.25*Math.sin(age*2+i)),y+Math.sin(age*2.5+note.pitch*.17-i*.8)*size*.8,size*(1-i/5),0,Math.PI*2);ctx.fill();}}}
      else if(sceneCatalog[look]){sceneGlyph(ctx,look,x,y,size*3,colour,age,note.pitch,velocity,effects,motion,opacity*fade);}
      else{if(effects.orbit){x+=Math.cos(moveTime*.8+note.pitch)*size*2;y+=Math.sin(moveTime*.8+note.pitch)*size*2;}ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();points.push({x,y,colour});}
    }
    if(look==='constellation'&&effects.veil)chordVeil(ctx,points,opacity);
    if(look==='constellation'&&effects.links){ctx.shadowBlur=0;ctx.globalAlpha=opacity*.2;const stars=points.slice(0,64);for(let i=0;i<stars.length;i++)for(let j=i+1;j<stars.length;j++){if(Math.hypot(stars[i].x-stars[j].x,stars[i].y-stars[j].y)>unit*.35)continue;ctx.strokeStyle=stars[i].colour;ctx.beginPath();ctx.moveTo(stars[i].x,stars[i].y);ctx.lineTo(stars[j].x,stars[j].y);ctx.stroke();}}ctx.restore();
  }
  function paint(ctx,w,h,time,state,audioLook){
    if(!state?.data||state.enabled===false)return;
    if(state.layer!=='replace'&&audioLook?.style){paintOverlay(ctx,w,h,time,state,audioLook);return;}
    if(Midi3D?.styles.has(state.visual)){Midi3D.paint(ctx,w,h,time,state,timing(state));return;}
    if(sceneCatalog[state.visual]){paintScene(ctx,w,h,time,state);return;}
    const {notes,low,high}=timing(state),look=state.visual||'rain',effects={...effectDefaults[look],...state.effects?.[look]},palette=state.colours||['#9bb8ff','#d3a9ee','#8fdbcf','#e9b796','#d9d18f','#aeb9e2'],opacity=clamp(Number(state.opacity??.85),.1,1),stars=[],motion=clamp(Number(state.motionSpeed??.35),.1,1);
    ctx.save();
    for(const n of notes){
      const ahead=look==='trails'?.35/(.16*motion):look==='rain'?.82/(.19*motion):0,behind=look==='trails'?.65/(.16*motion):look==='rain'?.18/(.19*motion):.5;if(n.startTime>time+ahead||n.endTime<time-behind)continue;
      const colour=palette[n.track%palette.length],x=(n.pitch-low+.5)/(high-low+1)*w,active=time>=n.startTime&&time<=n.endTime,age=time-n.startTime,velocity=clamp(Number(n.velocity)||.5,0,1),attack=age>=0?Math.exp(-age*7)*velocity:0,bounce=effects.bounce?Math.sin(Math.max(0,age)*20)*attack:0;
      ctx.fillStyle=colour;ctx.strokeStyle=colour;ctx.shadowColor=colour;ctx.shadowBlur=effects.glow&&active?3+Math.exp(-age*3.5)*48:0;
      if(look==='rain'){
        const scale=h*.19*motion,y=h*.82-(n.startTime-time)*scale,height=Math.max(3,(n.endTime-n.startTime)*scale),width=Math.max(3,w/(high-low+1)*.72)*(1+bounce*.3);
        ctx.globalAlpha=(active?effects.glow?glowEnvelope(age,velocity):1:.45)*opacity;ctx.fillRect(x-width/2,y-height,width,height);
        if(active){noteDetails(ctx,x,h*.82,width*.7,colour,opacity,age,n.pitch,effects,motion);if(effects.glow)noteHalo(ctx,x,h*.82,width*.7,colour,opacity,age,velocity);ctx.fillRect(x-width/2,h*.82-2-bounce*8,width,4+attack*6);}
        if(effects.ripples&&age>=0&&age<.7){ctx.shadowBlur=0;ctx.globalAlpha=(1-age/.7)*velocity*opacity;ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(x,h*.82,4+age*w*.08,2+age*h*.025,0,0,Math.PI*2);ctx.stroke();}
      }else if(look==='trails'){
        const y=(1-(n.pitch-low)/Math.max(1,high-low))*h*.8+h*.1-bounce*h*.025,head=w*.65+(n.startTime-time)*w*.16*motion,length=Math.max(5,(n.endTime-n.startTime)*w*.16*motion);
        ctx.globalAlpha=(active?effects.glow?glowEnvelope(age,velocity):.95:.4)*opacity;ctx.lineWidth=2+velocity*4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(head,y);ctx.lineTo(head+length,y);ctx.stroke();
        if(active){const radius=(4+velocity*5)*(1+attack*.8);noteDetails(ctx,w*.65,y,radius,colour,opacity,age,n.pitch,effects,motion);if(effects.glow)noteHalo(ctx,w*.65,y,radius,colour,opacity,age,velocity);ctx.beginPath();ctx.arc(w*.65,y,radius,0,Math.PI*2);ctx.fill();if(effects.echoes){ctx.shadowBlur=0;ctx.globalAlpha=opacity*.2;ctx.lineWidth=1.2;ctx.beginPath();ctx.moveTo(w*.65,y);for(let i=1;i<=12;i++){const distance=i/3;ctx.lineTo(w*.65-distance*w*.018+Math.cos(age*1.7+distance)*radius*.35,y+Math.sin(age*2.5+n.pitch*.17-distance*.8)*Math.max(3,radius*.8));}ctx.stroke();for(let i=1;i<=4;i++){ctx.globalAlpha=opacity*(1-i/5)*.35;ctx.beginPath();const drift=Math.sin(age*2.5+n.pitch*.17-i*.8)*Math.max(3,radius*.8),echoX=w*.65-i*w*.018+Math.cos(age*1.7+i)*radius*.35;ctx.arc(echoX,y+drift,Math.max(1,radius*(1-i/6)),0,Math.PI*2);ctx.fill();}}}
      }else if(active||time>n.endTime&&time-n.endTime<.5){
        const angle=n.pitch*.63+n.track*.7+(effects.orbit?time*motion*(.08+(n.track%3)*.025):0),radius=Math.min(w,h)*(.13+(n.pitch%12)/12*.28)*(1+bounce*.12),cx=w/2+Math.cos(angle)*radius,cy=h/2+Math.sin(angle)*radius,fade=active?1:Math.max(0,1-(time-n.endTime)*2);
        if(active)noteDetails(ctx,cx,cy,5+velocity*14,colour,opacity*fade,age,n.pitch,effects,motion);if(effects.glow&&active)noteHalo(ctx,cx,cy,5+velocity*14,colour,opacity*fade,age,velocity);ctx.globalAlpha=fade*opacity*(effects.glow?glowEnvelope(age,velocity):1);ctx.beginPath();ctx.arc(cx,cy,(5+velocity*14)*(1+attack*.6),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;if(active)stars.push({x:cx,y:cy,colour,velocity});
      }
    }
    ctx.shadowBlur=0;
    if(look==='constellation'&&effects.links){ctx.lineWidth=1;const visible=stars.slice(0,64);for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){const a=visible[i],b=visible[j],distance=Math.hypot(a.x-b.x,a.y-b.y);if(distance>Math.min(w,h)*.5)continue;ctx.globalAlpha=opacity*.25*(1-distance/Math.min(w,h));ctx.strokeStyle=a.colour;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}}
    if(look==='rain'){ctx.globalAlpha=.25*opacity;ctx.strokeStyle='#c3cee8';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,h*.82);ctx.lineTo(w,h*.82);ctx.stroke();}ctx.restore();
  }
  const api={parse,timing,paint,nativeTimes,effectDefaults,sceneCatalog,smoothAudio,glowEnvelope,invalidate:state=>{cache.delete(state);motionCache.delete(state);}};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.MidiEngine=api;
})(typeof window==='undefined'?globalThis:window);
