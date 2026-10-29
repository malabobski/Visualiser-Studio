const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas'),C=require('../complex-styles'),S=require('../scene-transitions');
const signal=Float32Array.from({length:160},(_,i)=>.2+.6*Math.sin(i*.13)**2),silence=new Float32Array(160);
for(const style of ['wings','glass']){
  test(style+': audio response, pause, silence, checkpoint restoration and canvas isolation',()=>{
    const canvas=createCanvas(320,180),ctx=canvas.getContext('2d'),params=C.specs[style].map(p=>p[3]);
    const draw=(t,values=signal,design={})=>{ctx.clearRect(0,0,320,180);C.paint(ctx,320,180,values,.5,style,t,params,design);return Buffer.from(ctx.getImageData(0,0,320,180).data);};
    assert(S.supportsStyle(style));assert.equal(S.look({style}).style,style);
    const empty=draw(0,silence);assert(empty.every(n=>n===0));
    for(let i=1;i<=60;i++)draw(i/60);
    const state=C.snapshot(ctx),bright=draw(61/60);
    assert(bright.some((v,i)=>i%4===3&&v>0),'Sound produced a blank frame');
    assert.deepEqual(draw(61/60),bright,'Pause changes the frame');
    draw(1.3);C.restore(ctx,state);assert.deepEqual(draw(61/60),bright,'Checkpoint differs');
    assert.equal(ctx.globalCompositeOperation,'source-over');assert.equal(ctx.getTransform().a,1);
    for(let i=62;i<=360;i++)draw(i/60,silence);
    assert(draw(6,silence).every(n=>n===0),'Silence never settles');
    assert(JSON.stringify(C.snapshot(ctx)).length<10000,'State grows unexpectedly');
  });
  test(style+': colour design and motion options produce distinct frames',()=>{
    function render(design,mode=0){const c=createCanvas(320,180),ctx=c.getContext('2d'),p=C.specs[style].map(s=>s[3]);p[4]=mode;for(let i=0;i<=30;i++){ctx.clearRect(0,0,320,180);C.paint(ctx,320,180,signal,.6,style,i/60,p,design);}return Buffer.from(ctx.getImageData(0,0,320,180).data);}
    const base=render({});for(const mode of [1,2,3,4,5])assert(!base.equals(render({},mode)),'Movement '+mode+' does nothing');
    for(const kind of ['solid','linear','radial'])assert(!base.equals(render({kind,colours:['#00ff00','#ff0000'],customColours:true})),'Colour mode '+kind+' does nothing');
  });
}

test('Glass Comets travel independently under sustained audio and their wakes stay bounded',()=>{
  const c=createCanvas(320,180),ctx=c.getContext('2d'),p=C.specs.glass.map(s=>s[3]);
  const draw=t=>{ctx.clearRect(0,0,320,180);C.paint(ctx,320,180,signal,.6,'glass',t,p);};
  for(let i=0;i<=30;i++)draw(i/60);
  const before=C.snapshot(ctx).refraction.paths.map(path=>path.at(-1));
  for(let i=31;i<=90;i++)draw(i/60);
  const state=C.snapshot(ctx).refraction,after=state.paths.map(path=>path.at(-1));
  assert(after.filter((point,i)=>Math.hypot(point.x-before[i].x,point.y-before[i].y)>.12).length>=4,'Comets mostly sit still');
  const directions=after.map((point,i)=>Math.atan2(point.y-before[i].y,point.x-before[i].x));
  assert(new Set(directions.map(a=>Math.round(a))).size>=3,'Comets all follow the same direction');
  assert(state.paths.every(path=>path.length<=42),'Wake history grows without bound');
  assert(JSON.stringify(C.snapshot(ctx)).length<60000,'Wake checkpoints grow too large');
});

test('Fresh frequency attacks accelerate motion and change comet trajectories immediately',()=>{
  const c=createCanvas(160,90),ctx=c.getContext('2d'),p=C.specs.glass.map(s=>s[3]),steady=new Float32Array(160).fill(.25);
  for(let i=0;i<=30;i++)C.paint(ctx,160,90,steady,.25,'glass',i/60,p);
  const checkpoint=C.snapshot(ctx);
  C.paint(ctx,160,90,steady,.25,'glass',31/60,p);const ordinary=C.snapshot(ctx).refraction;
  C.restore(ctx,checkpoint);C.paint(ctx,160,90,new Float32Array(160).fill(.9),.9,'glass',31/60,p);const struck=C.snapshot(ctx).refraction;
  assert(struck.motion-ordinary.motion>.025,'Attack only changes orb size');
  assert(struck.paths.some((path,i)=>{const a=path.at(-1),b=ordinary.paths[i].at(-1);return Math.hypot(a.x-b.x,a.y-b.y)>.035;}),'Attack does not move the lights');
});
