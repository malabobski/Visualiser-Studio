const {test}=require('node:test'),assert=require('node:assert/strict'),{create}=require('../onboarding-state');
function memory(seed={}){const map=new Map(Object.entries(seed));return {getItem:key=>map.get(key)||null,setItem:(key,value)=>map.set(key,value)};}
test('Fresh installs start the introduction while existing tutorial completions are respected',()=>{
  assert(create(memory()).shouldStart());assert(!create(memory({'visualiserTutorialCompleted-v1':'done'})).shouldStart());
});
test('Intro progress, skips and menu introductions persist independently',()=>{
  const storage=memory(),first=create(storage);first.intro('in-progress',3);assert(create(storage).shouldStart());assert.equal(create(storage).snapshot().intro.step,3);
  first.intro('skipped',3);const reopened=create(storage);assert(!reopened.shouldStart());assert(reopened.needsTool('midi'));
  reopened.tool('midi','done');reopened.tool('stage','skipped');assert(!create(storage).needsTool('midi'));assert(!create(storage).needsTool('stage'));assert(create(storage).needsTool('automation'));
  reopened.resetMenus();const reset=create(storage);assert(reset.needsTool('midi'));assert(!reset.shouldStart());
});
test('Malformed progress is bounded, unknown menus ignored, and storage failures do not block Skip',()=>{
  const model=create(memory({'visualiserOnboarding-v2':'{"intro":{"step":999,"status":"invalid"},"tools":{"midi":"invalid"}}'}));assert.equal(model.snapshot().intro.step,5);assert(model.needsTool('midi'));model.tool('unknown','done');assert(!('unknown' in model.snapshot().tools));
  const denied=create({getItem(){throw Error('denied');},setItem(){throw Error('full');}});denied.intro('skipped');assert(!denied.shouldStart());denied.tool('midi','done');assert(!denied.needsTool('midi'));
});
