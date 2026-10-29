const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../complex-styles'),S=require('../scene-transitions'),{createCanvas}=require('@napi-rs/canvas');
const signal=Float32Array.from({length:160},(_,i)=>.15+.65*Math.pow(Math.sin(i*.13),2));
const canvas=createCanvas(320,180),ctx=canvas.getContext('2d'),params=C.specs.laser.map(p=>p[3]);
function draw(time,values=signal,p=params){ctx.clearRect(0,0,320,180);C.paint(ctx,320,180,values,.5,'laser',time,p);return Buffer.from(ctx.getImageData(0,0,320,180).data);}
const light=buffer=>buffer.reduce((sum,value,i)=>sum+(i%4===3?value:0),0);
test('Laser Bloom is recognised in saved looks and sharing with bounded parameters',()=>{
  const look=S.look({style:'laser',params:[999]});assert.equal(look.style,'laser');assert.equal(look.params[0],2);assert.equal(look.params[3],4);assert.equal(look.params.length,11);
});
test('Laser Bloom responds to sound, settles into silence, and freezes on pause',()=>{
  C.restore(ctx,null);const silent=draw(0,new Float32Array(160));assert.equal(light(silent),0);
  for(let i=1;i<=30;i++)draw(i/60);const bright=draw(.5);assert(light(bright)>10000);
  assert.deepEqual(draw(.5),bright,'Paused geometry changes');
  for(let i=31;i<=240;i++)draw(i/60,new Float32Array(160));assert.equal(light(draw(4,new Float32Array(160))),0);
});
test('Laser Bloom seek checkpoints reproduce the same trails and keep history bounded',()=>{
  C.restore(ctx,null);for(let i=0;i<90;i++)draw(i/60);const state=C.snapshot(ctx),expected=draw(1.5);
  draw(2);C.restore(ctx,state);assert.deepEqual(draw(1.5),expected);assert(C.snapshot(ctx).laser.history.length<=14);
});

test('Turning movement off returns Laser Bloom to a centred, horizontal stage while paused',()=>{
  C.restore(ctx,null);const moving=params.slice();moving[4]=3;moving[10]=1;
  for(let i=0;i<120;i++)draw(i/60,signal,moving);
  const rotations=[],rotate=ctx.rotate.bind(ctx);ctx.rotate=angle=>{rotations.push(angle);rotate(angle);};
  try{
    draw(2,signal,moving);assert(rotations.at(-1)>.01,'Orbit did not rotate');
    moving[4]=0;draw(2,signal,moving);assert.equal(rotations.at(-1),0,'None keeps residual rotation');
    const transform=ctx.getTransform();assert.equal(transform.e,0);assert.equal(transform.f,0);
  }finally{ctx.rotate=rotate;}
});
