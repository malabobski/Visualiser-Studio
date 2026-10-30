const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),{spawn,spawnSync}=require('node:child_process');
const {AbletonConnector}=require('../ableton-connector');
const python=[process.env.VISUALISER_TEST_PYTHON,'python3','python'].filter(Boolean).find(command=>spawnSync(command,['--version'],{stdio:'ignore',windowsHide:true,timeout:5000}).status===0);
test('Incremental routing isolates the disposable Set and stops safely on failure',{skip:!python},()=>{
 const result=spawnSync(python,['-B',path.join(__dirname,'ableton-routing-test.py')],{encoding:'utf8',windowsHide:true,timeout:15000});assert.equal(result.status,0,result.stderr);
});

test('playback heartbeats avoid native project rescans and explicit stopped refresh stays current',{skip:!python},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vs-ableton-performance-')),connector=new AbletonConnector({directory,port:0});
 t.after(async()=>{connector.close();await fs.rm(directory,{recursive:true,force:true});});
 await connector.start();const library=path.join(directory,'User Library');await fs.mkdir(library);const installed=await connector.install(library);
 const result=spawnSync(python,['-B',path.join(__dirname,'ableton-script-fixture.py'),installed.installation,'performance'],{encoding:'utf8',windowsHide:true,timeout:10000});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/PASS playback uses cached tracks/);
});
test('the remote script remains read-only and refuses routing even when the desktop gate is bypassed',{skip:!python,timeout:15000},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vs-ableton-python-')),connector=new AbletonConnector({directory,port:0});let child;
 t.after(async()=>{child?.kill();connector.close();await new Promise(r=>setTimeout(r,100));await fs.rm(directory,{recursive:true,force:true});});
 await connector.start();const library=path.join(directory,'User Library');await fs.mkdir(library);const installed=await connector.install(library);
 const configPath=path.join(installed.installation,'config.json');const config=JSON.parse(await fs.readFile(configPath,'utf8'));delete config.routing_mode;await fs.writeFile(configPath,JSON.stringify(config));
 child=spawn(python,['-B',path.join(__dirname,'ableton-script-fixture.py'),installed.installation],{stdio:['ignore','pipe','pipe'],windowsHide:true});let output='',errors='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>errors+=data);
 for(let i=0;i<80&&!connector.snapshot().connected;i++)await new Promise(r=>setTimeout(r,50));assert(connector.snapshot().connected,errors||'Python connector never connected');
 const state=connector.snapshot();assert.equal(state.tracks.length,2);assert.equal(state.setName,'Connector test Set');
 let discarded=false;const receive=connector.receive.bind(connector);connector.receive=(bytes,remote)=>{const data=JSON.parse(bytes);if(data.kind==='reply'&&!discarded){discarded=true;return;}receive(bytes,remote);};
 const result=await connector.command({action:'refresh'});assert(result.ok,result.message);
 for(const action of ['route','remove']){
   const id=require('node:crypto').randomUUID();
   const reply=new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{connector.socket.removeListener('message',handler);reject(Error('No guarded reply'));},2000);const handler=bytes=>{const data=JSON.parse(bytes);if(data.id===id){clearTimeout(timeout);connector.socket.removeListener('message',handler);resolve(data);}};connector.socket.on('message',handler);});
   connector.socket.send(Buffer.from(JSON.stringify({protocol:1,token:connector.configuration.token,id,action,tracks:state.tracks.map(t=>t.id),revision:state.revision,output:'VS Link'})),connector.peer.port,'127.0.0.1');
   const rejected=await reply;assert.equal(rejected.ok,false);assert.match(rejected.message,/Rename the two empty MIDI tracks/);
 }
 await new Promise(r=>setTimeout(r,100));const after=JSON.parse(output.trim().split(/\r?\n/).at(-1));assert.deepEqual(after.names,['Keys','Bass','Audio']);assert.equal(after.undo,0);assert.equal(after.ended,0);
});
test('disposable Set routing runs one native mutation per guarded scheduled tick',{skip:!python,timeout:15000},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vs-ableton-scheduled-')),connector=new AbletonConnector({directory,port:0});let child;
 t.after(async()=>{child?.kill();connector.close();await new Promise(r=>setTimeout(r,100));await fs.rm(directory,{recursive:true,force:true});});
 await connector.start();const library=path.join(directory,'User Library');await fs.mkdir(library);const installed=await connector.install(library);
 child=spawn(python,['-B',path.join(__dirname,'ableton-script-fixture.py'),installed.installation,'test'],{stdio:['ignore','pipe','pipe'],windowsHide:true});let output='',errors='';child.stdout.on('data',data=>output+=data);child.stderr.on('data',data=>errors+=data);
 for(let i=0;i<80&&!connector.snapshot().routingEnabled;i++)await new Promise(r=>setTimeout(r,50));const state=connector.snapshot();assert(state.routingEnabled,errors||state.routingReason);
 let discarded=false;const receive=connector.receive.bind(connector);connector.receive=(bytes,remote)=>{const data=JSON.parse(bytes);if(data.kind==='reply'&&!discarded){discarded=true;return;}receive(bytes,remote);};
 const routed=await connector.command({action:'route',tracks:state.tracks.map(t=>t.id),revision:state.revision,output:'VS Port'});assert(routed.ok,routed.message);assert.equal(routed.result.created,2);
 await new Promise(r=>setTimeout(r,100));const afterRoute=JSON.parse(output.trim().split(/\r?\n/).at(-1));assert.equal(afterRoute.creations,2,'Retried command duplicated native track creation');assert.equal(afterRoute.deletions,0);assert.equal(afterRoute.names.length,4);
 const removed=await connector.command({action:'remove'});assert(removed.ok,removed.message);assert.equal(removed.result.removed,2);await new Promise(r=>setTimeout(r,100));const after=JSON.parse(output.trim().split(/\r?\n/).at(-1));assert.deepEqual(after.names,['VS Test 1','VS Test 2']);assert.equal(after.deletions,2);assert.equal(after.undo,0);assert(!errors.includes('Native mutation outside'),errors);
});

 test('project routing supports instruments and audio without modifying original tracks',{skip:!python,timeout:25000},async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vs-ableton-project-')),connector=new AbletonConnector({directory,port:0});let child;
 t.after(async()=>{child?.kill();connector.close();await new Promise(r=>setTimeout(r,100));await fs.rm(directory,{recursive:true,force:true});});
 await connector.start();const library=path.join(directory,'User Library');await fs.mkdir(library);const installed=await connector.install(library);
 child=spawn(python,['-B',path.join(__dirname,'ableton-script-fixture.py'),installed.installation,'many'],{stdio:['ignore','pipe','pipe'],windowsHide:true});let output='',errors='';child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>errors+=d);
 for(let i=0;i<80&&!connector.snapshot().routingEnabled;i++)await new Promise(r=>setTimeout(r,50));const state=connector.snapshot();assert(state.routingEnabled,errors||state.routingReason);
 const routed=await connector.command({action:'route',tracks:state.tracks.map(t=>t.id),revision:state.revision,output:'VS Port'});assert(routed.ok,routed.message);assert.equal(routed.result.created,16);
 const removed=await connector.command({action:'remove'});assert(removed.ok,removed.message);assert.equal(removed.result.removed,16);await new Promise(r=>setTimeout(r,100));const after=JSON.parse(output.trim().split(/\r?\n/).at(-1));assert.deepEqual(after.names,['Keys','Bass','Audio',...Array.from({length:14},(_,i)=>'Extra '+i)]);assert(!errors.includes('Native mutation outside'),errors);
 });
