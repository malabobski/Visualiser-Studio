const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas'),{videoEncodingArgs}=require('../export-encoding'),Stage=require('../stage-composition');
test('Parallel encoding preserves the quality preset, unrestricted bitrate and output colour format',()=>{
  for(const cores of [1,4,16,128]){
    const args=videoEncodingArgs(cores),value=key=>args[args.indexOf(key)+1];
    assert.equal(value('-c:v'),'libvpx-vp9');assert.equal(value('-crf'),'28');assert.equal(value('-b:v'),'0');assert.equal(value('-pix_fmt'),'yuv420p');assert.equal(value('-row-mt'),'1');
    assert(+value('-threads')>=1&&+value('-threads')<=32);assert(!args.includes('-cpu-used'));assert(!args.includes('-deadline'));assert(!args.includes('-r'));assert(!args.includes('-vf'));
  }
});
test('Native pixel transfer preserves opaque stage pixels before the canvas is reused',()=>{
  const c=createCanvas(120,80),ctx=c.getContext('2d');ctx.fillStyle='#11121b';ctx.fillRect(0,0,120,80);
  ctx.globalAlpha=.4;ctx.fillStyle='#ff0088';ctx.beginPath();ctx.arc(43,35,22,0,Math.PI*2);ctx.fill();ctx.globalCompositeOperation='lighter';ctx.fillStyle='#0088ff';ctx.fillRect(20,15,50,50);
  const pixels=c.data(),expected=Buffer.from(ctx.getImageData(0,0,120,80).data);assert(pixels.equals(expected),'Native pixels differ from the original extraction');
});
test('Text layout is reused across frames and invalidated for edited text or sizing',()=>{
  const c=createCanvas(320,180),ctx=c.getContext('2d'),r=new Stage.Renderer(()=>{}),design=Stage.clean({layers:[{id:'title',type:'text',text:'A long title wraps across the frame',width:.35,fontSize:72,start:0,fadeIn:0,fadeOut:0}]});
  let measured=0;const original=ctx.measureText.bind(ctx);ctx.measureText=text=>{measured++;return original(text);};
  r.paint(ctx,320,180,1,design,10);const first=measured;assert(first>0);r.paint(ctx,320,180,2,design,10);assert.equal(measured,first);
  design.layers[0].text='Different words for a new song';r.paint(ctx,320,180,2,design,10);assert(measured>first);const edited=measured;
  r.paint(ctx,640,360,2,design,10);assert(measured>edited);
});
test('Cancelled exports reject before starting a decoder',async()=>{
  const {renderOffline}=require('../offline-renderer'),controller=new AbortController();controller.abort();
  await assert.rejects(renderOffline('missing','unused',{},()=>{},'missing',controller.signal),{name:'AbortError'});
});
test('Cancellation and encoder errors terminate exports without hanging', {timeout:10000},async()=>{
  const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process'),ff=require('ffmpeg-static'),{renderOffline}=require('../offline-renderer');
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'export-cancel-'));
  try{
    const input=path.join(temp,'source.wav');cp.execFileSync(ff,['-y','-v','error','-f','lavfi','-i','sine=frequency=220:duration=2',input]);
    const controller=new AbortController(),settings={width:320,height:180,fps:30,style:'bars',colour:'#ff0088',background:'#11121b'};
    await assert.rejects(renderOffline(input,path.join(temp,'cancel.webm'),settings,()=>controller.abort(),ff,controller.signal));
    await assert.rejects(renderOffline(input,path.join(temp,'missing','fail.webm'),settings,()=>{},ff));
  }finally{await fs.rm(temp,{recursive:true,force:true});}
});
