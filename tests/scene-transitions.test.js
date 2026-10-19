const {test}=require('node:test'),assert=require('node:assert/strict');
const {createCanvas}=require('@napi-rs/canvas');
const Scenes=require('../scene-transitions');
const samples=Float32Array.from({length:48000*4},(_,i)=>Math.sin(i/48000*440*Math.PI*2)*(.12+.1*Math.sin(i/48000*7)));
const config=(style='bars')=>({enabled:true,start:.5,duration:1,a:{style,background:'#ff0000',colour:'#ffffff'},b:{style:'radial',background:'#0000ff',colour:'#ffffff'}});
function frame(renderer,time){const c=createCanvas(160,90);renderer.render(c.getContext('2d'),160,90,time);return c;}
test('Fade is bounded, smooth, and composites both scene backgrounds without a black dip',()=>{
  const c=Scenes.clean(config());assert.equal(Scenes.progress(c,0),0);assert.equal(Scenes.progress(c,1),.5);assert.equal(Scenes.progress(c,2),1);
  const renderer=new Scenes.Renderer(c,new Scenes.AudioSource(samples,48000),createCanvas);
  const pixel=time=>Array.from(frame(renderer,time).getContext('2d').getImageData(0,0,1,1).data);
  assert.deepEqual(pixel(0),[255,0,0,255]);assert.deepEqual(pixel(2),[0,0,255,255]);const mid=pixel(1);assert(Math.abs(mid[0]-127)<2&&Math.abs(mid[2]-128)<2&&mid[3]===255);
});
test('Seeking reconstructs complex scenes and particles identically to continuous playback',()=>{
  for(const style of ['notes','prism','city','particles']){
    const c=config(style);c.start=3;const source=new Scenes.AudioSource(samples,48000),renderer=new Scenes.Renderer(c,source,createCanvas);
    let sequential;for(let step=0;step<=150;step++)sequential=frame(renderer,step/60);
    const direct=frame(new Scenes.Renderer(c,new Scenes.AudioSource(samples,48000),createCanvas),2.5);
    assert.deepEqual(direct.toBuffer('image/png'),sequential.toBuffer('image/png'),style+' direct seek differs');
    frame(renderer,.25);assert.deepEqual(frame(renderer,2.5).toBuffer('image/png'),direct.toBuffer('image/png'),style+' rewind differs');
  }
});
test('Captured automation curves and colours survive transition cleaning',()=>{
  const c=config();c.a.automation=[{index:0,mode:'linear',points:[{time:0,value:.35,curve:1},{time:2,value:1.2}]}];
  const saved=Scenes.clean(JSON.parse(JSON.stringify(c)));assert.equal(saved.a.automation[0].points[0].curve,1);assert.equal(saved.a.background,'#ff0000');
  assert.equal(Scenes.clean({...c,duration:-1}).duration,.05);assert.equal(Scenes.look({style:'missing'}).style,'bars');
});
test('Chunked scene warm-up yields to the interface and matches direct rendering',async()=>{
  const c=config();c.start=5;c.b.style='notes';const renderer=new Scenes.Renderer(c,new Scenes.AudioSource(samples,48000),createCanvas);
  let yielded=false;setTimeout(()=>{yielded=true;},0);await renderer.prepare(5.5,160,90);assert(yielded);
  const direct=frame(new Scenes.Renderer(c,new Scenes.AudioSource(samples,48000),createCanvas),5.5);
  assert.deepEqual(frame(renderer,5.5).toBuffer('image/png'),direct.toBuffer('image/png'));
});
test('Actual WebM export contains the timed A to B fade',async()=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),ff=require('ffmpeg-static');
  const {server}=await require('../server').startServer({port:0,ffmpegBin:ff}),base='http://localhost:'+server.address().port;
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'style-fade-'));try{
    const input=path.join(dir,'audio.wav'),output=path.join(dir,'fade.webm');cp.execFileSync(ff,['-y','-v','error','-f','lavfi','-i','sine=frequency=220:duration=1',input]);
    const transition=config();transition.start=.2;transition.duration=.4;
    const prepared=await fetch(base+'/render-transition',{method:'POST',body:JSON.stringify(transition)});assert.equal(prepared.status,200);const {token}=await prepared.json();
    const response=await fetch(base+'/render?size=160x90&fps=30&transitionToken='+token,{method:'POST',body:await fs.readFile(input)}),events=await response.text();
    assert.equal(response.status,200);assert(!events.includes('event: error'),events);
    const complete=events.match(/event: complete\s+data: ([^\n]+)/);assert(complete,events);
    const download=await fetch(base+'/download?token='+JSON.parse(complete[1]).token);assert.equal(download.status,200);await fs.writeFile(output,Buffer.from(await download.arrayBuffer()));
    assert.equal((await fetch(base+'/render?transitionToken='+token,{method:'POST',body:'unused'})).status,400);
    const bytes=cp.execFileSync(ff,['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:16*1024*1024}),size=160*90*3;
    assert(bytes.length>=size*29);const first=bytes.subarray(0,3),last=bytes.subarray(size*25,size*25+3);
    assert(first[0]>200&&first[2]<30);assert(last[2]>200&&last[0]<30);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});
