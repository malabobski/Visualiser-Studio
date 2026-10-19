const {test}=require('node:test');
const assert=require('node:assert/strict');
const Automation=require('../parameter-automation');
const Midi=require('../midi-engine');

test('Blend curves retain endpoints, bend in both directions and survive save cleaning',()=>{
  const track={index:0,enabled:true,mode:'linear',points:[{time:0,value:0,curve:1},{time:4,value:100}]};
  assert.equal(Automation.evaluate(track,0,0),0);
  assert.equal(Automation.evaluate(track,2,0),25);
  assert.equal(Automation.evaluate(track,4,0),100);
  const restored=Automation.clean(JSON.parse(JSON.stringify([track])))[0];
  assert.equal(Automation.evaluate(restored,2,0),25);
  track.points[0].curve=-1;assert(Math.abs(Automation.evaluate(track,2,0)-70.710678)<1e-6);
  track.points[0].curve=0;assert.equal(Automation.evaluate(track,2,0),50);
  track.points[0].curve=4;track.mode='hold';assert.equal(Automation.evaluate(track,2,0),0);
  assert.equal(Automation.evaluate(track,4,0),100);
});

test('Curve sanitizing bounds invalid data while preserving old linear projects',()=>{
  const clean=Automation.clean([{index:0,points:[{time:0,value:10,curve:Infinity},{time:1,value:20,curve:100}]}])[0];
  assert.equal(clean.points[0].curve,undefined);assert.equal(clean.points[1].curve,4);
  assert.equal(Automation.evaluate(clean,.5,0),15);
});

test('Curved MIDI tempo integrates exactly, inverts and respects offset and Hold',()=>{
  const data={tracks:[],notes:[],tempos:[{beat:0,bpm:120}]};
  for(const curve of [-4,-1,1,4])for(const offset of [0,1.25]){
    const state={data,offset,tempoMode:'linear',tempoPoints:[{time:0,value:120,curve},{time:4,value:60},{time:7,value:180,curve:-1},{time:10,value:90}]};
    const timing=Midi.timing(state);
    for(let time=offset;time<13;time+=.13){
      assert(Math.abs(timing.timeAt(timing.beatsAt(time))-time)<1e-8);
      const delta=.000001,derivative=(timing.beatsAt(time+delta)-timing.beatsAt(time))/delta*60;
      if(state.tempoPoints.every(point=>Math.abs(point.time-time)>.001))assert(Math.abs(derivative-timing.bpmAt(time))<.02);
    }
  }
  const state={data,offset:0,tempoMode:'linear',tempoPoints:[{time:0,value:120,curve:1},{time:4,value:60}]};
  assert.equal(Midi.timing(state).bpmAt(2),105);
  assert(Math.abs(Midi.timing(state).beatsAt(4)-20/3)<1e-10);
  state.tempoMode='hold';Midi.invalidate(state);assert.equal(Midi.timing(state).beatsAt(4),8);
});
