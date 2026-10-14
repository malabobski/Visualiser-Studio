const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createTracker,diamondMessages,secrets,key}=require('../achievements');
function storage(initial){let value=initial;return {getItem:()=>value,setItem:(name,next)=>{assert.equal(name,key);value=next;}};}
test('diamond progress counts unique known messages, persists, and completes only the full collection',()=>{
  const disk=storage();const first=createTracker(disk);
  first.recordMessage(diamondMessages[0]);first.recordMessage(diamondMessages[0]);first.recordMessage('not a diamond message');
  const restored=createTracker(disk);assert.equal(restored.snapshot().messages.length,1);assert(!restored.snapshot().unlocked.includes('diamond-messages'));
  diamondMessages.slice(0,-1).forEach(message=>restored.recordMessage(message));assert(!restored.snapshot().unlocked.includes('diamond-messages'));
  restored.recordMessage(diamondMessages.at(-1));assert.equal(restored.snapshot().messages.length,diamondMessages.length);assert(restored.snapshot().unlocked.includes('diamond-messages'));
  assert(createTracker(disk).snapshot().unlocked.includes('diamond-messages'));
});
test('rare diamond and visual secrets unlock independently of the cheat code',()=>{
  const tracker=createTracker(storage());tracker.recordMessage('Rare diamond discovered!');tracker.recordMessage('Disco diamond!');
  assert(tracker.snapshot().unlocked.includes('rare-diamond'));assert(tracker.snapshot().unlocked.includes('disco-diamond'));assert(!tracker.snapshot().unlocked.includes('cheat-code'));
  assert(tracker.unlock('cheat-code'));assert(!tracker.unlock('cheat-code'));assert(!tracker.unlock('unknown-secret'));
  assert.equal(secrets.find(secret=>secret.id==='cheat-code').hint,'input a cheat code somewhere..');
});
test('malformed stored data cannot add unknown messages or duplicate achievements',()=>{
  const tracker=createTracker(storage(JSON.stringify({messages:[diamondMessages[0],diamondMessages[0],'unknown'],unlocked:['alive','alive','made-up']})));
  assert.deepEqual(tracker.snapshot(),{messages:[diamondMessages[0]],unlocked:['alive']});
  assert.deepEqual(createTracker(storage('broken json')).snapshot(),{messages:[],unlocked:[]});
});
test('storage failures preserve discoveries in memory without breaking Easter eggs',()=>{
  let saved;const tracker=createTracker({getItem(){throw Error('unavailable');},setItem(){throw Error('full');}},(_state,stored)=>saved=stored);
  assert(tracker.unlock('alive'));assert.equal(saved,false);assert(tracker.snapshot().unlocked.includes('alive'));tracker.recordMessage(diamondMessages[0]);assert.equal(tracker.snapshot().messages.length,1);
});
test('unlock notifications identify only first discoveries, including message-based secrets',()=>{
  const notices=[];const tracker=createTracker(storage(),(_state,_stored,newly)=>notices.push(...newly));
  tracker.recordMessage('You have unlocked: absolutely nothing ♥');tracker.recordMessage('You have unlocked: absolutely nothing ♥');
  tracker.unlock('alive');tracker.unlock('alive');tracker.recordMessage('Rare diamond discovered!');
  assert.deepEqual(notices,['nothing','alive','rare-diamond']);
});
test('reset clears and persists progress and allows secrets to be earned again',()=>{
  const disk=storage(),notices=[];const tracker=createTracker(disk,(_state,_stored,newly)=>notices.push(...newly));
  tracker.unlock('alive');tracker.recordMessage(diamondMessages[0]);tracker.reset();
  assert.deepEqual(tracker.snapshot(),{messages:[],unlocked:[]});const restored=createTracker(disk);assert.equal(restored.firstUse,false);assert.deepEqual(restored.snapshot(),{messages:[],unlocked:[]});
  assert(tracker.unlock('alive'));assert.deepEqual(notices,['alive','alive']);
});
