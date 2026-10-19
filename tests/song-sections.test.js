const {test}=require('node:test'),assert=require('node:assert/strict');
const Scenes=require('../scene-transitions'),{createCanvas}=require('@napi-rs/canvas');
const source=()=>new Scenes.AudioSource(new Float32Array(48000*4),48000);
const sections=[{name:'Intro',start:0,fade:0,look:{style:'bars',background:'#ff0000'}},{name:'Verse',start:1,fade:.5,look:{style:'wave',background:'#0000ff'}},{name:'Chorus',start:2,fade:0,look:{style:'radial',background:'#00ff00'}}];
const pixel=(r,t)=>{const c=createCanvas(160,90);r.render(c.getContext('2d'),160,90,t);return [...c.getContext('2d').getImageData(0,0,1,1).data];};
test('Sections play in order, crossfade at boundaries and cut exactly at the next boundary',()=>{const r=new Scenes.Renderer({enabled:true,sections},source(),createCanvas);assert.deepEqual(pixel(r,0),[255,0,0,255]);assert.deepEqual(pixel(r,1),[255,0,0,255]);const blend=pixel(r,1.25);assert(Math.abs(blend[0]-127)<2&&Math.abs(blend[2]-128)<2);assert.deepEqual(pixel(r,1.99),[0,0,255,255]);assert.deepEqual(pixel(r,2),[0,255,0,255]);assert.deepEqual(pixel(r,.2),[255,0,0,255]);});
test('Section data survives saving, bounds blends and rejects duplicate boundaries',()=>{const c=Scenes.clean({enabled:true,sections:[...sections,{name:'Duplicate',start:2,look:{}}]});assert.equal(c.sections.length,3);assert.deepEqual(Scenes.clean(JSON.parse(JSON.stringify(c))),c);const long=Scenes.clean({enabled:true,sections:sections.map(s=>({...s,fade:60}))});assert.equal(long.sections[0].fade,0);assert.equal(long.sections[1].fade,1);});
test('Multi-section complex look seeking matches continuous rendering',()=>{const c={enabled:true,sections:sections.map((s,i)=>({...s,look:{...s.look,style:i===1?'notes':'bars'}}))},a=new Scenes.Renderer(c,source(),createCanvas);let result;for(let f=0;f<=100;f++)result=pixel(a,f/60);const b=new Scenes.Renderer(c,source(),createCanvas);assert.deepEqual(pixel(b,100/60),result);assert.deepEqual(pixel(a,2.2),pixel(b,2.2));});

test('Actual WebM export follows three song sections and a final cut',async()=>{
  const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process'),ff=require('ffmpeg-static');
  const {server}=await require('../server').startServer({port:0,ffmpegBin:ff}),base='http://localhost:'+server.address().port;
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'style-fade-'));try{
    const input=path.join(dir,'audio.wav'),output=path.join(dir,'fade.webm');cp.execFileSync(ff,['-y','-v','error','-f','lavfi','-i','sine=frequency=220:duration=1',input]);
    const transition={enabled:true,sections:[{name:'Intro',start:0,look:{style:'bars',background:'#ff0000'}},{name:'Verse',start:.2,fade:.2,look:{style:'radial',background:'#0000ff'}},{name:'Chorus',start:.7,fade:0,look:{style:'bars',background:'#00ff00'}}]};
    const prepared=await fetch(base+'/render-transition',{method:'POST',body:JSON.stringify(transition)});assert.equal(prepared.status,200);const {token}=await prepared.json();
    const response=await fetch(base+'/render?size=160x90&fps=30&transitionToken='+token,{method:'POST',body:await fs.readFile(input)}),events=await response.text();
    assert.equal(response.status,200);assert(!events.includes('event: error'),events);
    const complete=events.match(/event: complete\s+data: ([^\n]+)/);assert(complete,events);
    const download=await fetch(base+'/download?token='+JSON.parse(complete[1]).token);assert.equal(download.status,200);await fs.writeFile(output,Buffer.from(await download.arrayBuffer()));
    assert.equal((await fetch(base+'/render?transitionToken='+token,{method:'POST',body:'unused'})).status,400);
    const bytes=cp.execFileSync(ff,['-v','error','-i',output,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:16*1024*1024}),size=160*90*3;
    assert(bytes.length>=size*29);const first=bytes.subarray(0,3),last=bytes.subarray(size*25,size*25+3);
    assert(first[0]>200&&first[2]<30);assert(last[1]>200&&last[0]<30&&last[2]<30);const middle=bytes.subarray(size*15,size*15+3);assert(middle[2]>200&&middle[0]<30);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});
test('A legacy fade beginning at zero keeps both looks after section migration',()=>{const legacy=Scenes.clean({enabled:true,start:0,duration:1,a:{style:'bars',background:'#ff0000'},b:{style:'bars',background:'#0000ff'}});const migrated=Scenes.clean({enabled:true,sections:[{name:'Intro',start:0,fade:0,look:legacy.a},{name:'Section 2',start:legacy.start,fade:legacy.duration,look:legacy.b}]});assert.equal(migrated.sections.length,2);const a=new Scenes.Renderer(legacy,source(),createCanvas),b=new Scenes.Renderer(migrated,source(),createCanvas);for(const t of [0,.5,1])assert.deepEqual(pixel(a,t),pixel(b,t));});
