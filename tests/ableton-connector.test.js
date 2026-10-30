const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),dgram=require('node:dgram');
const {AbletonConnector,setupAbletonConnector}=require('../ableton-connector');
const {EventEmitter}=require('node:events');
async function fixture(t){const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vs-ableton-'));const connector=new AbletonConnector({directory,port:0});t.after(async()=>{connector.close();await fs.rm(directory,{recursive:true,force:true});});return {directory,connector};}
const state=()=>({protocol:1,kind:'status',tracks:[{id:'a'.repeat(32),name:'Keys',frozen:false},{id:'b'.repeat(32),name:'Bass',frozen:true}],revision:'a'.repeat(20),helpers:0,tempo:178.5,setName:'My Set'});
test('local bridge ignores invalid authentication, oversized messages and remote hosts; snapshots contain no token',async t=>{
 const {connector}=await fixture(t);await connector.config();const remote={address:'127.0.0.1',port:4000},send=data=>connector.receive(Buffer.from(JSON.stringify(data)),remote);
 send({...state(),token:'x'.repeat(64)});send({...state(),token:'😀'.repeat(32)});send({...state(),token:['a'.repeat(64)]});assert(!connector.snapshot().connected);
 const valid={...state(),token:connector.configuration.token};connector.receive(Buffer.from(JSON.stringify(valid)),{...remote,address:'192.168.0.1'});assert(!connector.snapshot().connected);
 send(valid);assert(connector.snapshot().connected);assert.equal(connector.snapshot().tracks[0].name,'Keys');assert.equal(connector.snapshot().tempo,178.5);assert(!JSON.stringify(connector.snapshot()).includes(connector.configuration.token));
 connector.receive(Buffer.alloc(60001),remote);assert(connector.snapshot().connected);
 connector.now=()=>Date.now()+6000;assert(!connector.snapshot().connected);assert.equal(connector.snapshot().tempo,null);
});
test('only read-only commands reach the loopback peer while automatic routing is paused',async t=>{
 const {connector}=await fixture(t);await connector.start();const peer=dgram.createSocket('udp4');await new Promise(r=>peer.bind(0,'127.0.0.1',r));t.after(()=>peer.close());
 connector.receive(Buffer.from(JSON.stringify({...state(),token:connector.configuration.token})),{address:'127.0.0.1',port:peer.address().port});
 peer.on('message',bytes=>{const command=JSON.parse(bytes);assert.equal(command.action,'refresh');peer.send(Buffer.from(JSON.stringify({protocol:1,token:connector.configuration.token,kind:'reply',id:command.id,ok:true,result:{created:1}})),connector.port,'127.0.0.1');});
 const result=await connector.command({action:'refresh'});assert.deepEqual(result,{ok:true,result:{created:1}});
 assert.equal((await connector.command({action:'route',tracks:['a'.repeat(32)],revision:'a'.repeat(20),output:'VS Link'})).ok,false);
 assert.equal((await connector.command({action:'remove'})).ok,false);assert.equal(connector.snapshot().routingEnabled,false);
});
test('a busy local port reports a recoverable error without crashing the app',async t=>{
 const first=await fixture(t),second=await fixture(t);await first.connector.start();second.connector.port=first.connector.port;
 await assert.rejects(second.connector.start());assert.match(second.connector.snapshot().message,/Another app instance/);assert(!second.connector.snapshot().connected);
});
test('installer is repeatable, keeps the connection token stable and refuses edited or unrelated scripts',async t=>{
 const {directory,connector}=await fixture(t),library=path.join(directory,'User Library');await fs.mkdir(library);const installed=await connector.install(library);assert(installed.ok);const config=JSON.parse(await fs.readFile(path.join(installed.installation,'config.json'),'utf8'));assert.equal(config.token,connector.configuration.token);assert.equal(config.port,0);
 assert((await connector.install(library)).ok);await fs.appendFile(path.join(installed.installation,'routing.py'),'\n# My changes\n');await assert.rejects(connector.install(library),/edited/);
 const other=path.join(directory,'Other Library'),target=path.join(other,'Remote Scripts','Visualiser_Studio_Link');await fs.mkdir(target,{recursive:true});await fs.writeFile(path.join(target,'user.txt'),'keep');await assert.rejects(connector.install(other),/other files/);assert.equal(await fs.readFile(path.join(target,'user.txt'),'utf8'),'keep');
});
test('connector IPC rejects other windows and subframes before opening a folder chooser',async t=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'vs-ableton-ipc-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));const handlers={},app=new EventEmitter();app.getPath=()=>directory;const frame={},contents={mainFrame:frame,send(){}},win={webContents:contents,isDestroyed:()=>false};let opened=0;
 const connector=setupAbletonConnector({app,ipcMain:{handle:(name,fn)=>handlers[name]=fn},dialog:{showOpenDialog:async()=>{opened++;return{canceled:true};}},getWindow:()=>win});t.after(()=>connector.close());
 await assert.rejects(handlers['ableton:install']({sender:{},senderFrame:frame}));await assert.rejects(handlers['ableton:install']({sender:contents,senderFrame:{}}));assert.equal(opened,0);
 assert.deepEqual(await handlers['ableton:install']({sender:contents,senderFrame:frame}),{ok:false,canceled:true});assert.equal(opened,1);
});
