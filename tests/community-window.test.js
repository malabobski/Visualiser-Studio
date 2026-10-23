const test=require('node:test');
const assert=require('node:assert/strict');
const {focusCommunityWindow}=require('../community-window');
function fixture({top=false,destroyed=false}={}) {
  const calls=[];let cleanup;
  const win={isDestroyed:()=>destroyed,isMinimized:()=>true,isAlwaysOnTop:()=>top,restore:()=>calls.push('restore'),show:()=>calls.push('show'),setAlwaysOnTop:value=>calls.push(['top',value]),moveTop:()=>calls.push('raise'),focus:()=>calls.push('focus'),webContents:{send:channel=>calls.push(channel)}};
  return {calls,win,app:{focus:options=>calls.push(['app-focus',options])},schedule:fn=>{cleanup=fn;},cleanup:()=>cleanup?.()};
}
test('Windows browser return restores, raises and opens Community without staying pinned',()=>{
  const f=fixture();focusCommunityWindow({...f,platform:'win32'});
  assert.deepEqual(f.calls,['restore','show',['top',true],'raise','focus','community:open']);
  f.cleanup();assert.deepEqual(f.calls.at(-1),['top',false]);
});
test('existing always-on-top preference is preserved',()=>{
  const f=fixture({top:true});focusCommunityWindow({...f,platform:'win32'});f.cleanup();
  assert.equal(f.calls.some(Array.isArray),false);
});
test('Mac activates the app and destroyed windows are ignored',()=>{
  const f=fixture();focusCommunityWindow({...f,platform:'darwin'});
  assert.ok(f.calls.some(c=>Array.isArray(c)&&c[0]==='app-focus'&&c[1].steal));
  assert.equal(f.calls.some(c=>Array.isArray(c)&&c[0]==='top'),false);
  const gone=fixture({destroyed:true});focusCommunityWindow({...gone,platform:'win32'});assert.deepEqual(gone.calls,[]);
});
