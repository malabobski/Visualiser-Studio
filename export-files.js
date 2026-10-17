const path = require('node:path');
const fs = require('node:fs');
const fsp = require('node:fs/promises');

const formats = { track:'{track}', style:'{track} - {style}', date:'{track} - {date}', custom:'' };
function exportFilename({title='visualiser',style='visualiser'}={},format='track',pattern='',now=new Date()) {
  const two=value=>String(value).padStart(2,'0');
  const values={track:String(title).replace(/\.[^.]+$/,''),style:String(style),date:`${now.getFullYear()}-${two(now.getMonth()+1)}-${two(now.getDate())}`,time:`${two(now.getHours())}-${two(now.getMinutes())}-${two(now.getSeconds())}`};
  let name=(format==='custom'?pattern:formats[format]||formats.track).replace(/\{(track|style|date|time)\}/g,(_match,key)=>values[key]);
  name=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/g,'').trim().slice(0,150);
  name=name.replace(/\.webm$/i,'');
  if(!name)name='visualiser';
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))name='_'+name;
  return name+'.webm';
}
function setupExportFiles({app,ipcMain,dialog,session,getWindow,getOrigin}) {
  const file=path.join(app.getPath('userData'),'export-preferences.json');
  let prefs={folder:'',format:'track',pattern:'{track} - {style}'},saving=Promise.resolve();
  try {
    const saved=JSON.parse(fs.readFileSync(file,'utf8'));
    if(typeof saved.folder==='string')prefs.folder=saved.folder;
    if(Object.hasOwn(formats,saved.format))prefs.format=saved.format;
    if(typeof saved.pattern==='string'&&saved.pattern.trim()&&saved.pattern.length<=120)prefs.pattern=saved.pattern;
  } catch {}
  const allowed=event=>!!getWindow()&&!getWindow().isDestroyed()&&event.sender===getWindow().webContents;
  const snapshot=()=>({...prefs,folderLabel:prefs.folder?(path.basename(prefs.folder)||prefs.folder):'Downloads',preview:exportFilename({title:'My song',style:'Bars'},prefs.format,prefs.pattern)});
  function save(change) {
    const operation=saving.then(async()=>{const next={...prefs,...change};await fsp.mkdir(path.dirname(file),{recursive:true});await fsp.writeFile(file,JSON.stringify(next));prefs=next;return snapshot();});
    saving=operation.catch(()=>{});return operation;
  }
  ipcMain.handle('exports:get',event=>allowed(event)?snapshot():null);
  ipcMain.handle('exports:folder',async event=>{
    if(!allowed(event))return null;
    const result=await dialog.showOpenDialog(getWindow(),{title:'Default export folder',defaultPath:prefs.folder||app.getPath('downloads'),properties:['openDirectory','createDirectory']});
    return result.canceled||!result.filePaths[0]?snapshot():save({folder:result.filePaths[0]});
  });
  ipcMain.handle('exports:naming',async(event,options)=>{
    if(!allowed(event)||!options||!Object.hasOwn(formats,options.format))throw Error('Choose a valid filename format.');
    const pattern=String(options.pattern||'').trim();
    if(options.format==='custom'&&(!pattern||pattern.length>120))throw Error('Enter a filename pattern of up to 120 characters.');
    return save({format:options.format,...(pattern?{pattern}:{})});
  });
  const pending=new Map();
  ipcMain.handle('exports:prepare',(event,request)=>{
    if(!allowed(event)||!request||!/^[\da-f-]{36}$/i.test(request.token)||typeof request.title!=='string'||typeof request.style!=='string')return false;
    for(const [key,value] of pending)if(Date.now()-value.created>600000)pending.delete(key);
    if(pending.size>=30)return false;
    pending.set(request.token,{title:request.title.slice(0,200),style:request.style.slice(0,80),created:Date.now()});return true;
  });
  session.on('will-download',(_event,item,contents)=>{
    if(contents!==getWindow()?.webContents)return;
    let url;try{url=new URL(item.getURL());}catch{return;}
    if(url.origin!==getOrigin()||url.pathname!=='/download')return;
    const token=url.searchParams.get('token'),metadata=pending.get(token);if(!metadata)return;
    pending.delete(token);
    let folder=prefs.folder||app.getPath('downloads');
    try{if(!fs.statSync(folder).isDirectory())folder=app.getPath('downloads');}catch{folder=app.getPath('downloads');}
    item.setSaveDialogOptions({title:'Save visualiser video',defaultPath:path.join(folder,exportFilename(metadata,prefs.format,prefs.pattern)),filters:[{name:'WebM video',extensions:['webm']}]});
    item.once('done',(_event,state)=>{
      if(state==='completed'&&item.getSavePath())save({folder:path.dirname(item.getSavePath())}).catch(()=>{});
    });
  });
}
module.exports={exportFilename,setupExportFiles};
