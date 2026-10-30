const {test}=require('node:test'),assert=require('node:assert/strict');
const {Renderer,envelope}=require('../daw-note-visuals');
const note=(pitch,channel=1)=>({pitch,channel,start:0,end:null,velocity:.8});
function context(){const points=[];return{points,save(){},restore(){},beginPath(){},moveTo(...p){points.push(p)},lineTo(...p){points.push(p)},quadraticCurveTo(...p){points.push(p)},arc(...p){points.push(p)},stroke(){},fill(){}};}
test('note attacks and releases ease continuously without changing MIDI timing',()=>{
 const n=note(60);assert.equal(envelope(n,0),0);assert(envelope(n,25)>0&&envelope(n,25)<1);assert.equal(envelope(n,55),1);
 n.end=100;assert.equal(envelope(n,100),1);assert(envelope(n,220)>0&&envelope(n,220)<1);assert.equal(envelope(n,340),0);assert.equal(n.end,100);
});
test('melody heads ease toward a new pitch while history retains separate note pitches',()=>{
 const renderer=new Renderer(),ctx=context(),a=note(40),b={...note(76),start:100};renderer.paint(ctx,1280,720,[a],90,{colour:()=> '#abcdff'});const y=renderer.heads.get(1).y;
 a.end=100;renderer.paint(ctx,1280,720,[a,b],110,{colour:()=> '#abcdff'});const target=720*.9-76/127*720*.8;
 assert(renderer.heads.get(1).y<y&&renderer.heads.get(1).y>target);assert.equal(a.pitch,40);assert.equal(b.pitch,76);renderer.reset();assert.equal(renderer.heads.size,0);
});
test('every MIDI style handles chords and the full pitch range with finite drawing coordinates',()=>{
 for(const style of ['notes','falling','constellation']){const renderer=new Renderer(),ctx=context(),channels=[];renderer.paint(ctx,1280,720,[note(0,1),note(60,2),note(64,2),note(127,16)],100,{style,colour:channel=>{channels.push(channel);return '#aabbff'}});assert(ctx.points.length>0);assert(ctx.points.flat().every(Number.isFinite));assert(channels.includes(1)&&channels.includes(2)&&channels.includes(16));}
});
