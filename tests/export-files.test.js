const {test}=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {exportFilename,setupExportFiles}=require('../export-files');
test('export naming expands patterns and produces safe portable WebM filenames',()=>{
 const date=new Date(2026,9,17,12,4,6),metadata={title:'My.song.flac',style:'Note trails'};
 assert.equal(exportFilename(metadata,'track'), 'My.song.webm');
 assert.equal(exportFilename(metadata,'custom','{track} - {style} - {date} - {time}',date),'My.song - Note trails - 2026-10-17 - 12-04-06.webm');
 assert.equal(exportFilename({title:'CON.wav'}),'_CON.webm');
 assert(!/[<>:"/\\|?*]/.test(exportFilename({title:'../../bad:name.wav'})));
 assert.equal(exportFilename(metadata,'custom','.webm'),'visualiser.webm');
 assert(exportFilename({title:'x'.repeat(500)}).length<=155);
});
async function fixture(t){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'vs-exports-'));assert(path.resolve(root).startsWith(path.join(os.tmpdir(),'vs-exports-')));
 t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const handlers={},session=new EventEmitter(),window={webContents:{},isDestroyed:()=>false},downloads=path.join(root,'Downloads');await fs.mkdir(downloads);
 let selection={canceled:true,filePaths:[]};
 const options={app:{getPath:key=>key==='downloads'?downloads:root},ipcMain:{handle:(name,handler)=>handlers[name]=handler},dialog:{showOpenDialog:async()=>selection},session,getWindow:()=>window,getOrigin:()=> 'http://localhost:3000'};
 setupExportFiles(options);
 return{root,handlers,session,window,event:{sender:window.webContents},select:value=>selection=value,options,downloads};
}
test('export preferences validate callers, persist names and remember chosen folders',async t=>{
 const f=await fixture(t);
 assert.equal(f.handlers['exports:get']({sender:{}}),null);
 await assert.rejects(f.handlers['exports:naming'](f.event,{format:'other'}));
 await assert.rejects(f.handlers['exports:naming'](f.event,{format:'custom',pattern:''}));
 const folder=path.join(f.root,'Videos');await fs.mkdir(folder);f.select({canceled:false,filePaths:[folder]});
 await Promise.all([f.handlers['exports:folder'](f.event),f.handlers['exports:naming'](f.event,{format:'style',pattern:''})]);
 const saved=JSON.parse(await fs.readFile(path.join(f.root,'export-preferences.json'),'utf8'));
 assert.equal(saved.folder,folder);assert.equal(saved.format,'style');
 const fresh={};setupExportFiles({...f.options,ipcMain:{handle:(name,handler)=>fresh[name]=handler},session:new EventEmitter()});
 assert.equal(fresh['exports:get'](f.event).folder,folder);
});
test('only prepared own-window exports use preferences and successful saves update the folder',async t=>{
 const f=await fixture(t),token='12345678-abcd-abcd-abcd-123456789abc';
 await f.handlers['exports:naming'](f.event,{format:'style'});
 function item(origin='http://localhost:3000'){
  const result=new EventEmitter();result.getURL=()=>origin+'/download?token='+token;result.setSaveDialogOptions=value=>result.options=value;result.getSavePath=()=>path.join(f.root,'Another folder','song.webm');return result;
 }
 assert.equal(f.handlers['exports:prepare'](f.event,{token:'../file',title:'Song.wav',style:'Bars'}),false);
 f.handlers['exports:prepare'](f.event,{token,title:'Song.wav',style:'Bars'});
 const foreign=item('https://example.com');f.session.emit('will-download',{},foreign,f.window.webContents);assert(!foreign.options);
 const wrongWindow=item();f.session.emit('will-download',{},wrongWindow,{});assert(!wrongWindow.options);
 const valid=item();f.session.emit('will-download',{},valid,f.window.webContents);
 assert.equal(valid.options.defaultPath,path.join(f.downloads,'Song - Bars.webm'));
 valid.emit('done',{},'cancelled');assert.equal(f.handlers['exports:get'](f.event).folder,'');
 f.handlers['exports:prepare'](f.event,{token,title:'Song.wav',style:'Bars'});
 const complete=item();f.session.emit('will-download',{},complete,f.window.webContents);complete.emit('done',{},'completed');
 for(let tries=0;tries<50&&!f.handlers['exports:get'](f.event).folder;tries++)await new Promise(resolve=>setTimeout(resolve,10));
 assert.equal(f.handlers['exports:get'](f.event).folder,path.join(f.root,'Another folder'));
});
