const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
test('project deletion trashes only its own folder, preserves source audio, and rejects paths outside the library',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'vs-project-delete-'));
  try{
    const handlers={},trashed=[],source=path.join(dir,'original.wav'),project=path.join(dir,'projects','saved-project');
    await fs.mkdir(project,{recursive:true});await fs.writeFile(source,'original audio');
    await fs.writeFile(path.join(project,'project.json'),JSON.stringify({id:'saved-project',audioPath:source}));
    const code=await fs.readFile(path.join(__dirname,'../project-files.js'),'utf8');
    vm.runInNewContext(code,{require:name=>name==='electron'?{app:{getPath:()=>dir},ipcMain:{handle:(name,fn)=>handlers[name]=fn},shell:{trashItem:async target=>trashed.push(target)}}:require(name),Buffer});
    assert.deepEqual(JSON.parse(JSON.stringify(await handlers['projects:delete']({},'saved-project'))),{id:'saved-project'});
    assert.deepEqual(trashed,[project]);assert.equal(await fs.readFile(source,'utf8'),'original audio');
    for(const id of ['../original.wav','..','/','C:\\Windows','nested/project','missing'])await assert.rejects(()=>handlers['projects:delete']({},id));
    assert.equal(trashed.length,1);
  }finally{await fs.rm(dir,{recursive:true,force:true});}
});
