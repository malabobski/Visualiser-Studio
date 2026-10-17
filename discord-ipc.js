const net = require('node:net');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const BaseTransport = require('discord-rpc/src/transports/ipc');

function socketPaths(platform=process.platform, env=process.env, temporary=os.tmpdir()) {
  if (platform === 'win32') return Array.from({length:10},(_,i)=>'\\\\?\\pipe\\discord-ipc-'+i);
  const roots=[...new Set([env.XDG_RUNTIME_DIR,env.TMPDIR,env.TMP,env.TEMP,temporary,'/tmp','/private/tmp'].filter(Boolean))];
  return roots.flatMap(root=>Array.from({length:10},(_,i)=>path.posix.join(root,'discord-ipc-'+i)));
}
async function findSocket(paths=socketPaths(), connect=net.createConnection) {
  for (const location of paths) {
    if (process.platform !== 'win32' && connect === net.createConnection) {
      try { if(!fs.statSync(location).isSocket())continue; } catch { continue; }
    }
    try {
      return await new Promise((resolve,reject)=>{
        const socket=connect(location);
        const fail=error=>{socket.removeAllListeners('connect');socket.destroy();reject(error);};
        socket.once('error',fail);
        socket.setTimeout(350,()=>fail(Error('Discord socket timed out')));
        socket.once('connect',()=>{socket.removeListener('error',fail);socket.setTimeout(0);resolve(socket);});
      });
    } catch { /* Another Discord channel or directory may own the socket. */ }
  }
  throw Error('Discord desktop is not available');
}
class DiscordTransport extends BaseTransport {
  async connect() {
    this.socket=await findSocket(this.client.options?.ipcPaths);
    let buffer=Buffer.alloc(0),closed=false;
    const close=error=>{if(closed)return;closed=true;this.emit('close',error);};
    this.socket.on('close',close);this.socket.on('error',close);
    this.socket.on('data',packet=>{
      buffer=Buffer.concat([buffer,packet]);
      while(buffer.length>=8) {
        const op=buffer.readInt32LE(0),length=buffer.readUInt32LE(4);
        if(length>1024*1024){this.socket.destroy();return;}
        if(buffer.length<8+length)return;
        const raw=buffer.subarray(8,8+length);buffer=buffer.subarray(8+length);
        try {
          const data=JSON.parse(raw.toString());
          if(op===3)this.send(data,4);
          else if(op===1)this.emit('message',data);
          else if(op===2)this.socket.destroy();
        } catch {this.socket.destroy();return;}
      }
    });
    this.emit('open');
    this.socket.write(BaseTransport.encode(0,{v:1,client_id:this.client.clientId}));
  }
  async close() { this.socket?.destroy(); }
}
module.exports={DiscordTransport,socketPaths,findSocket};
