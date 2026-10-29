const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {setupFileExplorer,drivePlaces}=require('../file-explorer-main');
test('drive discovery includes available Windows disks and skips disconnected drives',async()=>{
  const result=await drivePlaces('win32',{stat:async root=>{if(['C:\\','G:\\','Z:\\'].includes(root))return {isDirectory:()=>true};throw Error('Unavailable');}});
  assert.deepEqual(result.map(p=>p.path),['C:\\','G:\\','Z:\\']);assert(result.every(p=>p.group==='drives'));
});
test('Mac drive discovery includes mounted volumes and the system root',async()=>{
  const result=await drivePlaces('darwin',{readdir:async()=>[{name:'External music'},{name:'.hidden'}],stat:async()=>({isDirectory:()=>true})});
  assert.deepEqual(result.map(p=>p.path),['/','/Volumes/External music']);
});
async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'vs-picker-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const handlers={},sent=[],contents=new EventEmitter();contents.send=(name,data)=>sent.push({name,data});const win={webContents:contents,isDestroyed:()=>false};let answer=0;
  const dialogs=setupFileExplorer({app:{getPath:()=>root},ipcMain:{handle:(name,fn)=>handlers[name]=fn},dialog:{showMessageBox:async()=>({response:answer})},getWindow:()=>win});
  return {root,handlers,sent,win,dialogs,event:{sender:contents},answer:value=>answer=value};
}
test('picker lists folders first, rejects other windows, and creates only direct child folders',async t=>{
  const f=await fixture(t);await fs.writeFile(path.join(f.root,'audio.wav'),'audio');await fs.mkdir(path.join(f.root,'Music'));
  assert.throws(()=>f.handlers['files:places']({sender:{}}));await assert.rejects(f.handlers['files:list']({sender:{}},f.root));
  const list=await f.handlers['files:list'](f.event,f.root);assert.equal(list.entries[0].name,'Music');assert.equal(list.entries[1].name,'audio.wav');
  await assert.rejects(f.handlers['files:mkdir'](f.event,f.root,'../escape'));await f.handlers['files:mkdir'](f.event,f.root,'New music');assert((await fs.stat(path.join(f.root,'New music'))).isDirectory());
});
test('folder and save dialogs cancel safely and confirm replacement before resolving',async t=>{
  const f=await fixture(t),existing=path.join(f.root,'clip.webm');await fs.writeFile(existing,'keep');
  let pending=f.dialogs.showOpenDialog(f.win,{properties:['openDirectory']});let id=f.sent.at(-1).data.id;
  await assert.rejects(f.handlers['files:finish'](f.event,id,existing));await f.handlers['files:finish'](f.event,id,null);assert((await pending).canceled);
  pending=f.dialogs.showSaveDialog(f.win,{defaultPath:existing});id=f.sent.at(-1).data.id;
  assert.equal(await f.handlers['files:finish'](f.event,id,existing),false);assert.equal(await fs.readFile(existing,'utf8'),'keep');
  f.answer(1);assert.equal(await f.handlers['files:finish'](f.event,id,existing),true);assert.equal((await pending).filePath,existing);assert.equal(await fs.readFile(existing,'utf8'),'keep');
});
test('opening a file returns its bytes and a selected-file token; destroyed windows cancel requests',async t=>{
  const f=await fixture(t),file=path.join(f.root,'song.wav');await fs.writeFile(file,'sound');
  const pending=f.handlers['files:pick'](f.event,{accept:'audio/*'});await f.handlers['files:finish'](f.event,f.sent.at(-1).data.id,file);const result=await pending;
  assert.equal(Buffer.from(result.bytes).toString(),'sound');assert.equal(f.handlers['files:path'](f.event,result.token),file);assert.equal(f.handlers['files:path']({sender:{}},result.token),'');
  const folder=f.dialogs.showOpenDialog(f.win,{properties:['openDirectory']});f.win.webContents.emit('destroyed');assert((await folder).canceled);
});
