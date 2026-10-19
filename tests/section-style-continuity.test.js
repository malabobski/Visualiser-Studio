const {test}=require('node:test'),assert=require('node:assert/strict');
const S=require('../scene-transitions'),C=require('../complex-styles'),P=require('../parameter-automation'),{createCanvas}=require('@napi-rs/canvas');
const samples=Float32Array.from({length:48000*10},(_,i)=>Math.sin(i/48000*440*Math.PI*2)*.1*(.5+.5*Math.sin(i/48000*12)));
const canvas=createCanvas(160,90),ctx=canvas.getContext('2d');
const frame=(r,t)=>{r.render(ctx,160,90,t);return Buffer.from(ctx.getImageData(0,0,160,90).data);};
test('Section analysis restores transient response and is independent of seek order',()=>{
 const source=new S.AudioSource(samples,48000),expected=source.frame(3);assert(expected.values.some((v,i)=>v>source.baseFrame(3).values[i]+.01));
 source.frame(500);source.frame(0);assert.deepEqual(source.frame(3),expected);assert.deepEqual(new S.AudioSource(samples,48000).frame(3),expected);
 const renderer=new S.Renderer({enabled:true,sections:[{start:0,look:{style:'prism'}}]},source,createCanvas);for(let step=0;step<180;step++)frame(renderer,step/60);
 assert(C.snapshot(renderer.scenes[0].canvas.getContext('2d')).serial>0,'Shatterfield must emit shards for this rising signal');
});
for(const style of [...Object.keys(P.basicSpecs),...Object.keys(C.specs)])test(style+': repeated identical sections preserve the complete visual, including across fades',()=>{
 const look={style},source=new S.AudioSource(samples,48000);
 const single=new S.Renderer({enabled:true,sections:[{start:0,look}]},source,createCanvas);
 const split=new S.Renderer({enabled:true,sections:[{start:0,look},{start:7,fade:1,look},{start:8.5,fade:0,look}]},source,createCanvas);
 for(const time of [6.9,7,7.5,8.6,2,9])assert.deepEqual(frame(split,time),frame(single,time),'Appearance changed at '+time);
});
