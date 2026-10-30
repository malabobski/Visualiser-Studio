const {EventEmitter}=require('node:events');
const dgram=require('node:dgram');
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomBytes,randomUUID,createHash,timingSafeEqual}=require('node:crypto');
const PORT=48671;
const SCRIPT='Visualiser_Studio_Link';
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');

class AbletonConnector extends EventEmitter{
  constructor({directory,sources=path.join(__dirname,'connectors','ableton',SCRIPT),port=PORT,now=Date.now}){
    super();Object.assign(this,{directory,sources,port,now});this.pending=new Map();this.peer=null;this.remote=null;this.message='Open Ableton and select Visualiser_Studio_Link as a control surface.';
  }
  async config(){
    if(this.configuration)return this.configuration;
    if(this.loading)return this.loading;
    this.loading=(async()=>{let saved;try{saved=JSON.parse(await fs.readFile(path.join(this.directory,'ableton-link.json'),'utf8'));}catch{}
      this.configuration={token:/^[a-f0-9]{64}$/.test(saved?.token||'')?saved.token:randomBytes(32).toString('hex'),installation:typeof saved?.installation==='string'?saved.installation:''};
      await this.persist();return this.configuration;
    })();return this.loading;
  }
  async persist(){await fs.mkdir(this.directory,{recursive:true});await fs.writeFile(path.join(this.directory,'ableton-link.json'),JSON.stringify(this.configuration),{mode:0o600});}
  snapshot(){const connected=!!this.peer&&this.now()-this.peer.seen<5000;return {routingEnabled:connected&&this.remote.connectorVersion===3&&this.remote.routingEnabled===true,routingReason:connected?(this.remote.connectorVersion===3?this.remote.routingReason:'Reinstall the updated connector and restart Live to enable project routing.'):'Connect to Live before routing.',busy:connected&&this.remote.busy===true,progress:connected?this.remote.progress:0,tempo:connected?this.remote.tempo:null,connected,listening:!!this.socket?.address&&this.listening===true,installed:!!this.configuration?.installation,installation:this.configuration?.installation||'',tracks:connected?this.remote.tracks:[],revision:connected?this.remote.revision:'',helpers:connected?this.remote.helpers:0,setName:connected?this.remote.setName:'',message:connected?this.remote.message:this.message};}
  async start(){
    if(this.starting)return this.starting;if(this.socket)return this.snapshot();
    this.starting=(async()=>{await this.config();const socket=dgram.createSocket('udp4');this.socket=socket;
      socket.on('message',(bytes,remote)=>this.receive(bytes,remote));
      await new Promise((resolve,reject)=>{const failed=error=>{socket.close();this.socket=null;reject(error);};socket.once('error',failed);socket.bind(this.port,'127.0.0.1',()=>{socket.removeListener('error',failed);this.port=socket.address().port;this.listening=true;resolve();});});
      socket.on('error',()=>{this.message='The Ableton connection stopped. Reopen DAW Link to retry.';this.close();});
      this.timer=setInterval(()=>this.emit('change',this.snapshot()),1000);this.timer.unref?.();return this.snapshot();
    })().catch(error=>{this.message=error.code==='EADDRINUSE'?'Another app instance is using the Ableton connection. Close it and reconnect.':'Could not start the local Ableton connection.';throw error;}).finally(()=>this.starting=null);return this.starting;
  }
  receive(bytes,remote){
    if(remote.address!=='127.0.0.1'||bytes.length>60000)return;
    let data;try{data=JSON.parse(bytes.toString('utf8'));}catch{return;}
    if(data?.protocol!==1||typeof data.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token)||!this.configuration||!timingSafeEqual(Buffer.from(data.token),Buffer.from(this.configuration.token)))return;
    if(data.kind==='reply'){
      const pending=this.pending.get(data.id);if(!pending||pending.port!==remote.port)return;
      clearTimeout(pending.timeout);clearInterval(pending.retry);this.pending.delete(data.id);
      pending.resolve(data.ok===true?{ok:true,result:data.result||{}}:{ok:false,message:String(data.message||'Ableton could not complete that action.').slice(0,300)});return;
    }
    if(data.kind!=='status'||!Array.isArray(data.tracks)||data.tracks.length>128||!/^[a-f0-9]{20}$/.test(data.revision||''))return;
    if(this.peer&&this.now()-this.peer.seen<5000&&this.peer.port!==remote.port)return;
    const tracks=data.tracks.filter(track=>typeof track?.id==='string'&&/^[a-f0-9]{32}$/.test(track.id)&&typeof track.name==='string').map(track=>({id:track.id,name:track.name.slice(0,120),frozen:track.frozen===true}));
    this.peer={port:remote.port,seen:this.now()};this.remote={connectorVersion:data.connectorVersion,routingEnabled:data.routingEnabled===true,routingReason:String(data.routingReason||'Working projects remain read-only.').slice(0,300),tempo:Number.isFinite(data.tempo)&&data.tempo>0&&data.tempo<=1000?data.tempo:null,busy:data.busy===true,progress:Number.isFinite(data.progress)?Math.max(0,Math.min(1,data.progress)):0,tracks,revision:data.revision,helpers:Number.isInteger(data.helpers)?Math.max(0,Math.min(256,data.helpers)):0,setName:String(data.setName||'Live Set').slice(0,120),message:String(data.message||'Connected to Ableton.').slice(0,300)};this.emit('change',this.snapshot());
  }
  async command(request){
    await this.start();const state=this.snapshot();if(!state.connected)return {ok:false,message:'Open Ableton and select the Visualiser Studio control surface first.'};
    if(!request||!['refresh','route','remove'].includes(request.action))throw Error('Invalid connector action.');
    if(['route','remove'].includes(request.action)&&!state.routingEnabled)return {ok:false,message:state.routingReason};
    if(request.action==='route'){
      if(!Array.isArray(request.tracks)||request.tracks.length<1||request.tracks.length>16||new Set(request.tracks).size!==request.tracks.length||request.tracks.some(id=>!state.tracks.some(track=>track.id===id&&!track.frozen)))throw Error('Select up to 16 available MIDI tracks.');
      if(request.revision!==state.revision)throw Error('The Set changed. Refresh your track selection.');
      if(typeof request.output!=='string'||!request.output.trim()||request.output.length>120)throw Error('Choose the virtual MIDI output name.');
    }
    if(this.pending.size)throw Error('Wait for the current Ableton action to finish.');
    const id=randomUUID(),port=this.peer.port,payload=Buffer.from(JSON.stringify({protocol:1,token:this.configuration.token,id,action:request.action,...(request.action==='route'?{tracks:request.tracks,output:request.output.trim(),revision:request.revision}:{})}));
    return new Promise(resolve=>{const send=()=>{if(this.socket)this.socket.send(payload,port,'127.0.0.1',()=>{});};
      const retry=setInterval(send,1000),timeout=setTimeout(()=>{clearInterval(retry);this.pending.delete(id);resolve({ok:false,message:'Ableton did not confirm the action. Refresh the track list before trying again.'});},120000);
      this.pending.set(id,{resolve,port,retry,timeout});send();
    });
  }
  async install(userLibrary){
    await this.config();const root=await fs.realpath(userLibrary);if(!(await fs.stat(root)).isDirectory())throw Error('Choose your Ableton User Library folder.');
    const parent=path.join(root,'Remote Scripts');try{if((await fs.lstat(parent)).isSymbolicLink())throw Error('Choose a User Library with a regular Remote Scripts folder.');}catch(error){if(error.code!=='ENOENT')throw error;}
    await fs.mkdir(parent,{recursive:true});const target=path.join(parent,SCRIPT);if(!target.startsWith(root+path.sep))throw Error('Invalid connector destination.');
    try{if((await fs.lstat(target)).isSymbolicLink())throw Error('The connector destination is a link. Choose a regular folder.');}catch(error){if(error.code!=='ENOENT')throw error;}
    let owned;try{owned=JSON.parse(await fs.readFile(path.join(target,'.visualiser-owner.json'),'utf8'));}catch{}
    let existing=[];try{existing=await fs.readdir(target);}catch(error){if(error.code!=='ENOENT')throw error;}
    if(existing.length&&owned?.owner!==SCRIPT)throw Error('That connector folder already contains other files. Keep it safe and choose a different User Library.');
    const files={};for(const name of ['__init__.py','connector.py','routing.py'])files[name]=await fs.readFile(path.join(this.sources,name));
    files['config.json']=Buffer.from(JSON.stringify({token:this.configuration.token,port:this.port,routing_mode:"project",connector_version:3}));
    // Leave edited connector files intact rather than overwriting custom work.
    if(owned)for(const name of Object.keys(files)){try{const data=await fs.readFile(path.join(target,name));if(owned.files?.[name]!==digest(data))throw Error('A connector file has been edited. Back it up before reinstalling.');}catch(error){if(error.code!=='ENOENT')throw error;}}
    await fs.mkdir(target,{recursive:true});for(const [name,data]of Object.entries(files))await fs.writeFile(path.join(target,name),data,{mode:0o600});
    await fs.writeFile(path.join(target,'.visualiser-owner.json'),JSON.stringify({owner:SCRIPT,files:Object.fromEntries(Object.entries(files).map(([name,data])=>[name,digest(data)]))}));
    this.configuration.installation=target;await this.persist();return {ok:true,installation:target,message:'Installed. Restart Ableton, then select Visualiser_Studio_Link in Control Surface preferences. Leave its Input and Output set to None.'};
  }
  close(){clearInterval(this.timer);this.listening=false;if(this.socket){this.socket.close();this.socket=null;}for(const pending of this.pending.values()){clearTimeout(pending.timeout);clearInterval(pending.retry);pending.resolve({ok:false,message:'Ableton connection closed.'});}this.pending.clear();this.peer=null;}
}

function setupAbletonConnector({app,ipcMain,dialog,getWindow,port=PORT}){
  const connector=new AbletonConnector({directory:app.getPath('userData'),port});const allowed=event=>{const contents=getWindow()?.webContents;return !!contents&&event.sender===contents&&event.senderFrame===contents.mainFrame;};
  connector.on('change',state=>{const win=getWindow();if(win&&!win.isDestroyed())win.webContents.send('ableton:state',state);});
  ipcMain.handle('ableton:get',async event=>{if(!allowed(event))throw Error('Unavailable.');try{return await connector.start();}catch{return connector.snapshot();}});
  ipcMain.handle('ableton:command',(event,request)=>{if(!allowed(event))throw Error('Unavailable.');return connector.command(request);});
  ipcMain.handle('ableton:install',async event=>{if(!allowed(event))throw Error('Unavailable.');
    const defaultPath=path.join(app.getPath(process.platform==='darwin'?'music':'documents'),'Ableton','User Library');
    const result=await dialog.showOpenDialog(getWindow(),{title:'Select your Ableton User Library',defaultPath,properties:['openDirectory']});
    if(result.canceled||!result.filePaths[0])return {ok:false,canceled:true};return connector.install(result.filePaths[0]);
  });
  app.on('will-quit',()=>connector.close());return connector;
}
module.exports={AbletonConnector,setupAbletonConnector,PORT,SCRIPT};
