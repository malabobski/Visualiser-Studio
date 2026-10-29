const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {loadReleaseHighlights,newer}=require('../release-highlights');
test('release comparison excludes equal versions, downgrades and invalid values',()=>{
 assert(newer('1.3.2','1.3.1'));assert(newer('1.10.0','1.9.9'));assert(!newer('1.3.1','1.3.1'));assert(!newer('1.3.0','1.3.1'));assert(!newer('dev','1.3.1'));
});
test('notes appear after an installed update, remain pending until closed, and stay dismissed',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vs-highlights-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const load=version=>loadReleaseHighlights({directory,version,packaged:true});
 assert.equal((await load('1.3.1')).snapshot(),null);
 const upgraded=await load('1.3.2');assert.equal(upgraded.snapshot().version,'1.3.2');assert(upgraded.snapshot().sections.length);
 assert.equal((await load('1.3.2')).snapshot().version,'1.3.2');await upgraded.acknowledge();assert.equal((await load('1.3.2')).snapshot(),null);
 assert.equal((await load('1.3.1')).snapshot(),null);assert.equal((await load('1.3.3')).snapshot().version,'1.3.3');
});
test('existing users receive the first supported update notes; development builds never show them',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vs-highlights-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 await fs.mkdir(path.join(directory,'Local Storage','leveldb'),{recursive:true});
 assert.equal((await loadReleaseHighlights({directory,version:'1.3.2',packaged:true})).snapshot().version,'1.3.2');
 assert.equal((await loadReleaseHighlights({directory,version:'1.3.2',packaged:false})).snapshot(),null);
});
