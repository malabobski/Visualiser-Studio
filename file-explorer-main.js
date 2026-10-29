const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');

async function drivePlaces(platform=process.platform,files=fs){
  if(platform==='win32'){
    const drives=await Promise.all(Array.from({length:26},async(_,index)=>{
      const letter=String.fromCharCode(65+index),root=letter+':\\';
      try{return (await files.stat(root)).isDirectory()?{name:letter+':',path:root,group:'drives'}:null;}catch{return null;}
    }));
    return drives.filter(Boolean);
  }
  const base=platform==='darwin'?'/Volumes':'/mnt';
  let entries=[];try{entries=await files.readdir(base,{withFileTypes:true});}catch{}
  const volumes=await Promise.all(entries.filter(e=>!e.name.startsWith('.')).map(async entry=>{
    const location=path.posix.join(base,entry.name);
    try{return (await files.stat(location)).isDirectory()?{name:entry.name,path:location,group:'drives'}:null;}catch{return null;}
  }));
  return [{name:'System',path:'/',group:'drives'},...volumes.filter(Boolean)];
}

function setupFileExplorer({app,ipcMain,dialog,getWindow}){
  const pending=new Map(),selected=new Map();
  const allowed=event=>event.sender===getWindow()?.webContents;
  const places=async()=>[...['home','desktop','documents','downloads','music','pictures','videos'].map(key=>({name:key[0].toUpperCase()+key.slice(1),path:app.getPath(key)})),...await drivePlaces()];
  function request(options){
    const win=getWindow();if(!win||win.isDestroyed())return Promise.resolve(null);
    const id=randomUUID();
    return new Promise(resolve=>{const finish=value=>{pending.delete(id);win.webContents.removeListener('destroyed',cancel);resolve(value);};const cancel=()=>finish(null);pending.set(id,{options,finish});win.webContents.once('destroyed',cancel);win.webContents.send('files:show',{id,...options});});
  }
  ipcMain.handle('files:places',event=>{if(!allowed(event))throw Error('Unavailable.');return places();});
  ipcMain.handle('files:preview',async(event,location)=>{
    if(!allowed(event)||typeof location!=='string')throw Error('Unavailable.');
    const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.avif':'image/avif','.bmp':'image/bmp'}[path.extname(location).toLowerCase()];
    if(!mime)return null;const stat=await fs.stat(location);if(!stat.isFile()||stat.size>20*1024*1024)return null;
    return `data:${mime};base64,${(await fs.readFile(location)).toString('base64')}`;
  });
  ipcMain.handle('files:list',async(event,location)=>{
    if(!allowed(event))throw Error('Unavailable.');
    const directory=path.resolve(typeof location==='string'&&location?location:app.getPath('downloads'));
    const entries=await fs.readdir(directory,{withFileTypes:true});
    return {path:directory,parent:path.dirname(directory),entries:entries.filter(e=>!e.name.startsWith('.')).map(e=>({name:e.name,path:path.join(directory,e.name),directory:e.isDirectory()})).sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name,undefined,{numeric:true}))};
  });
  ipcMain.handle('files:mkdir',async(event,location,name)=>{
    if(!allowed(event)||typeof name!=='string'||!name.trim()||/[<>:"/\\|?*\x00-\x1f]/.test(name)||name==='.'||name==='..')throw Error('Choose a valid folder name.');
    await fs.mkdir(path.join(path.resolve(location),name.trim()));
  });
  ipcMain.handle('files:finish',async(event,id,selection)=>{
    if(!allowed(event))throw Error('Unavailable.');const item=pending.get(id);if(!item)return false;
    if(!selection){item.finish(null);return true;}
    const target=path.resolve(selection),stat=await fs.stat(target).catch(error=>{if(error.code==='ENOENT')return null;throw error;});
    if(item.options.mode==='folder'&&!stat?.isDirectory())throw Error('Choose a folder.');
    if(item.options.mode==='open'&&!stat?.isFile())throw Error('Choose a file.');
    if(item.options.mode==='save'){
      if(stat&&!stat.isFile())throw Error('Choose a filename.');
      if(!(await fs.stat(path.dirname(target))).isDirectory())throw Error('Choose an existing folder.');
      if(stat){const result=await dialog.showMessageBox(getWindow(),{type:'question',message:`Replace “${path.basename(target)}”?`,detail:'A file with this name already exists.',buttons:['Cancel','Replace'],defaultId:0,cancelId:0,noLink:true});if(result.response!==1)return false;}
    }
    item.finish(target);return true;
  });
  ipcMain.handle('files:pick',async(event,options={})=>{
    if(!allowed(event))throw Error('Unavailable.');
    const target=await request({mode:'open',title:'Choose a file',accept:String(options.accept||'')});if(!target)return null;
    const stat=await fs.stat(target);if(stat.size>1024*1024*1024)throw Error('Choose a file smaller than 1 GB.');
    const token=randomUUID();selected.set(token,target);if(selected.size>100)selected.delete(selected.keys().next().value);
    return {name:path.basename(target),bytes:new Uint8Array(await fs.readFile(target)),modified:stat.mtimeMs,token};
  });
  ipcMain.handle('files:path',(event,token)=>allowed(event)?selected.get(token)||'':'');
  const showOpenDialog=async(_win,options)=>{
    const target=await request({mode:options.properties?.includes('openDirectory')?'folder':'open',title:options.title,defaultPath:options.defaultPath||''});
    return {canceled:!target,filePaths:target?[target]:[]};
  };
  const showSaveDialog=async(_win,options)=>{
    const target=await request({mode:'save',title:options.title,defaultPath:options.defaultPath||'',extension:options.filters?.[0]?.extensions?.[0]||''});
    return {canceled:!target,filePath:target||undefined};
  };
  return {...dialog,showOpenDialog,showSaveDialog};
}
module.exports={setupFileExplorer,drivePlaces};
