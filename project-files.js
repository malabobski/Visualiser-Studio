const {app,ipcMain}=require('electron');
const fs=require('fs/promises'),path=require('path'),{randomUUID}=require('crypto');
const root=()=>path.join(app.getPath('userData'),'projects');
const folder=id=>{if(!/^[a-zA-Z0-9-]{1,80}$/.test(id||''))throw Error('Invalid project.');return path.join(root(),id);};
async function read(id){return JSON.parse(await fs.readFile(path.join(folder(id),'project.json'),'utf8'));}
async function write(project){const dir=folder(project.id);await fs.mkdir(dir,{recursive:true});await fs.writeFile(path.join(dir,'project.tmp'),JSON.stringify(project));try{await fs.rename(path.join(dir,'project.tmp'),path.join(dir,'project.json'));}catch(error){if(!['EPERM','EACCES'].includes(error.code))throw error;await fs.copyFile(path.join(dir,'project.tmp'),path.join(dir,'project.json'));await fs.rm(path.join(dir,'project.tmp'),{force:true});}}
ipcMain.handle('projects:list',async()=>{await fs.mkdir(root(),{recursive:true});const ids=await fs.readdir(root());const results=await Promise.all(ids.map(async id=>{try{const p=await read(id);return {id:p.id,name:p.name,createdAt:p.createdAt,updatedAt:p.updatedAt,thumbnail:p.thumbnail,audioName:p.audioName};}catch{return null;}}));return results.filter(Boolean).sort((a,b)=>b.updatedAt-a.updatedAt);});
ipcMain.handle('projects:save',async(_event,data)=>{
  const previous=data.id?await read(data.id):null;const id=previous?.id||randomUUID();let audioPath=data.audioPath||previous?.audioPath;
  if(!audioPath&&data.audioBytes){await fs.mkdir(folder(id),{recursive:true});audioPath=path.join(folder(id),'audio'+path.extname(data.audioName||'.wav'));await fs.writeFile(audioPath,Buffer.from(data.audioBytes));}
  if(!audioPath)throw Error('Choose audio before saving a project.');
  const p={version:1,id,name:String(data.name||previous?.name||'Untitled project').trim().slice(0,120),createdAt:previous?.createdAt||Date.now(),updatedAt:Date.now(),audioPath,audioName:data.audioName||previous?.audioName,look:data.look,thumbnail:previous?.customThumbnail?previous.thumbnail:data.thumbnail||previous?.thumbnail||'',customThumbnail:previous?.customThumbnail||false};await write(p);return p;
});
ipcMain.handle('projects:open',async(_event,id)=>{const p=await read(id);try{return {...p,audioBytes:new Uint8Array(await fs.readFile(p.audioPath))};}catch{return {...p,audioMissing:true};}});
ipcMain.handle('projects:update',async(_event,id,change)=>{const p=await read(id);if(typeof change.name==='string'&&change.name.trim())p.name=change.name.trim().slice(0,120);if(typeof change.thumbnail==='string'&&/^data:image\/(png|jpeg|webp);base64,/.test(change.thumbnail)&&change.thumbnail.length<3000000){p.thumbnail=change.thumbnail;p.customThumbnail=true;}if(typeof change.audioPath==='string'&&change.audioPath){await fs.access(change.audioPath);p.audioPath=change.audioPath;p.audioName=path.basename(change.audioPath);}p.updatedAt=Date.now();await write(p);return p;});
