const {test}=require('node:test'),assert=require('node:assert/strict');
const {Input,noteName}=require('../daw-midi');

test('traffic diagnostics distinguish clock, notes and filtered channels; reset clears counters',()=>{
 const input=new Input();input.receive([248],0);assert.equal(input.clockMessages,1);assert.equal(input.noteMessages,0);
 input.receive(new Uint8Array([145,36,110]),1,1);assert.equal(input.noteMessages,1);assert.equal(input.lastNoteChannel,2);assert.equal(input.notes.size,0);
 input.receive(new Uint8Array([145,36,110]),2,0);assert.equal(input.notes.size,1);input.receive([145,36,0],3);assert.equal(input.noteMessages,2);
 input.clear();assert.equal(input.noteMessages,2);input.reset();assert.equal(input.messages,0);assert.equal(input.noteMessages,0);assert.equal(input.clockMessages,0);assert.equal(input.lastNoteChannel,null);
});
test('live MIDI tracks note velocity, repeated attacks and note-off without stuck notes',()=>{
 const input=new Input();input.receive([144,60,100],0);const first=input.notes.get('1:60');assert.equal(first.velocity,100/127);input.receive([144,60,127],100);assert.equal(first.end,100);assert.equal(input.history.length,2);input.receive([144,60,0],200);assert.equal(input.notes.size,0);assert.equal(input.history[1].end,200);assert.equal(noteName(60),'C4');
});
test('sustain releases held voices when lifted and panic messages clear a channel',()=>{
 const input=new Input();input.receive([176,64,127],0);input.receive([144,60,80],10);input.receive([128,60,0],100);assert.equal(input.notes.size,1);input.receive([176,64,0],200);assert.equal(input.notes.size,0);assert.equal(input.history[0].end,200);input.receive([145,64,100],300);input.receive([177,123,0],400);assert.equal(input.notes.size,0);
});
test('channel filtering preserves clock and transport; stop releases all voices',()=>{
 const input=new Input();input.receive([144,60,100],0,2);assert.equal(input.notes.size,0);input.receive([145,60,100],1,2);assert.equal(input.notes.size,1);input.receive([250],2,2);assert(input.running);input.receive([248],3,2);assert.equal(input.pulses,1);input.receive([252],4,2);assert(!input.running);assert.equal(input.notes.size,0);assert.equal(input.history[0].end,4);
});
test('24 MIDI clock pulses per beat produce 120 BPM and song position follows six pulses per unit',()=>{
 const input=new Input();input.receive([250],0);for(let i=0;i<49;i++)input.receive([248],i*60000/120/24);assert.equal(input.bpm,120);assert.equal(input.pulses,49);input.receive([242,16,0],1100);assert.equal(input.pulses,96);input.receive([252],1200);input.receive([251],1300);assert.equal(input.pulses,96);assert(input.running);
});
test('note history and clock samples are bounded and reset clears the entire connection',()=>{
 const input=new Input();for(let i=0;i<3000;i++){input.receive([144,60,100],i);input.receive([128,60,0],i+.1);}assert(input.history.length<=2048);for(let i=0;i<200;i++)input.receive([248],i*21);assert(input.clock.length<=49);input.reset();assert.equal(input.notes.size,0);assert.equal(input.history.length,0);assert.equal(input.bpm,null);assert.equal(input.messages,0);
});
