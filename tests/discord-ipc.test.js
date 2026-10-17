const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const net=require('node:net'),os=require('node:os'),path=require('node:path'),fs=require('node:fs/promises');
const {socketPaths,DiscordTransport}=require('../discord-ipc');
const {encode}=require('discord-rpc/src/transports/ipc');
test('Mac socket search includes every runtime folder and tmp fallback',()=>{
 const paths=socketPaths('darwin',{TMPDIR:'/var/folders/my-user/T',TMP:'/custom'},'/other');
 for(const root of ['/var/folders/my-user/T','/custom','/other','/tmp','/private/tmp'])assert(paths.includes(root+'/discord-ipc-0'));
 assert.equal(new Set(paths).size,paths.length);
 assert.equal(socketPaths('win32',{},'')[0],'\\\\?\\pipe\\discord-ipc-0');
});
test('Discord handshake and fragmented or combined replies survive stream boundaries',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'vs-rpc-'));
 const location=process.platform==='win32'?'\\\\?\\pipe\\vs-rpc-'+process.pid:path.join(folder,'rpc');
 const server=net.createServer();await new Promise(resolve=>server.listen(location,resolve));
 let peer;
 const handshake=new Promise(resolve=>server.once('connection',socket=>{peer=socket;socket.once('data',resolve);}));
 const transport=new DiscordTransport({clientId:'123',options:{ipcPaths:[location]}});
 try{
  await transport.connect();const hello=await handshake;
  assert.equal(hello.readInt32LE(0),0);assert.equal(JSON.parse(hello.subarray(8)).client_id,'123');
  const messages=[],received=new Promise(resolve=>transport.on('message',data=>{messages.push(data);if(messages.length===2)resolve();}));
  const first=encode(1,{evt:'READY'}),second=encode(1,{nonce:'activity'});
  peer.write(first.subarray(0,3));await new Promise(resolve=>setTimeout(resolve,10));peer.write(Buffer.concat([first.subarray(3),second]));
  await received;assert.deepEqual(messages,[{evt:'READY'},{nonce:'activity'}]);
 } finally {await transport.close();peer?.destroy();await new Promise(resolve=>server.close(resolve));await fs.rm(folder,{recursive:true,force:true});}
});
