(function(root){
  const clamp=value=>Math.max(0,Math.min(1,value));
  const smooth=value=>{const t=clamp(value);return t*t*(3-2*t);};
  function envelope(note,now){
    const attack=smooth((now-note.start)/55);
    if(note.end===null)return attack;
    return smooth((note.end-note.start)/55)*(1-smooth((now-note.end)/240));
  }
  class Renderer{
    constructor(){this.heads=new Map();this.last=0;}
    reset(){this.heads.clear();this.last=0;}
    paint(ctx,w,h,history,now,{style='notes',trail=5,response=1,glow=true,colour}={}){
      const dt=this.last?Math.min(100,Math.max(0,now-this.last)):16;this.last=now;
      const yFor=pitch=>h*.9-pitch/127*h*.8,head=w*.8,speed=w*.75/(trail*1000);
      ctx.save();ctx.lineCap='round';
      if(style==='notes'){
        ctx.lineWidth=1;ctx.strokeStyle='#ffffff07';
        for(let pitch=12;pitch<128;pitch+=12){const y=yFor(pitch);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke();}
      }
      const leads=new Map();
      for(const note of history){
        if(now<note.start)continue;
        const end=note.end??now,age=now-end,live=envelope(note,now),hex=colour(note.channel);
        if(age>trail*1000)continue;
        const strength=clamp(note.velocity*response),y=yFor(note.pitch);
        if(note.end===null||age<240)leads.set(note.channel,note);
        ctx.strokeStyle=ctx.fillStyle=ctx.shadowColor=hex;
        ctx.shadowBlur=glow?5+live*strength*15:0;
        if(style==='notes'){
          const x1=head-(now-note.start)*speed,x2=head-age*speed;
          if(x2<0)continue;
          ctx.globalAlpha=(.3+strength*.5)*(note.end===null?smooth((now-note.start)/55):1-smooth(age/(trail*1000)));
          ctx.lineWidth=2+strength*4;ctx.beginPath();ctx.moveTo(Math.max(0,x1),y);ctx.lineTo(x2,y);ctx.stroke();
          if(live>0){ctx.globalAlpha=live;ctx.beginPath();ctx.arc(x2,y,2+strength*3,0,Math.PI*2);ctx.fill();}
        }else if(style==='falling'){
          const x=w*.08+note.pitch/127*w*.84,base=h*.82;
          const bottom=base-age/(trail*1000)*h*.72,top=base-(now-note.start)/(trail*1000)*h*.72;
          ctx.globalAlpha=(.4+strength*.5)*(1-smooth(age/(trail*1000)));ctx.lineWidth=3+strength*6;
          ctx.beginPath();ctx.moveTo(x,Math.max(h*.08,top));ctx.lineTo(x,bottom);ctx.stroke();
          if(live>0){ctx.globalAlpha=live;ctx.beginPath();ctx.arc(x,bottom,4+strength*5,0,Math.PI*2);ctx.fill();}
        }else if(style==='constellation'&&live>0){
          const angle=(note.pitch%12)/12*Math.PI*2-Math.PI/2;
          const radius=Math.min(w,h)*(.13+note.pitch/127*.26+strength*live*.025);
          const x=w*.5+Math.cos(angle)*radius,cy=h*.5+Math.sin(angle)*radius;
          ctx.globalAlpha=live*(.4+strength*.6);ctx.lineWidth=1+strength*2;
          ctx.beginPath();ctx.moveTo(w*.5,h*.5);ctx.quadraticCurveTo(w*.5+Math.cos(angle+.35)*radius*.5,h*.5+Math.sin(angle+.35)*radius*.5,x,cy);ctx.stroke();
          ctx.beginPath();ctx.arc(x,cy,3+strength*live*9,0,Math.PI*2);ctx.fill();
        }
      }
      // A short visual glide joins each channel's melody. The note lanes keep
      // their actual pitches, including every voice of a chord.
      if(style==='notes')for(const [channel,note]of leads){
        const target=yFor(note.pitch),old=this.heads.get(channel),y=old?old.y+(target-old.y)*(1-Math.exp(-dt/45)):target;
        this.heads.set(channel,{y});const live=envelope(note,now);
        ctx.globalAlpha=live;ctx.fillStyle=ctx.shadowColor=colour(channel);ctx.shadowBlur=glow?18:0;
        ctx.beginPath();ctx.arc(head-(now-(note.end??now))*speed,y,3+clamp(note.velocity*response)*5,0,Math.PI*2);ctx.fill();
      }
      for(const channel of this.heads.keys())if(!leads.has(channel))this.heads.delete(channel);
      ctx.restore();
    }
  }
  const api={Renderer,envelope};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DawNoteVisuals=api;
})(typeof window==='undefined'?globalThis:window);
