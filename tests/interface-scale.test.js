const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
test('interface zoom persists validated main-window values and rejects other windows',async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');
 const handlers={},writes=[],zooms=[],mainWindow={webContents:{},isDestroyed:()=>false},miniWindow={webContents:{}};
 const context=vm.createContext({mainWindow,miniWindow,ipcMain:{handle:(name,handler)=>handlers[name]=handler},app:{getPath:()=>'/test'},path,
  isUpdateWindow:event=>event.sender===mainWindow.webContents,
  fsp:{mkdir:async()=>{},writeFile:async(...args)=>writes.push(args)}});
 mainWindow.webContents.setZoomMode=mode=>assert.equal(mode,'isolated');mainWindow.webContents.setZoomFactor=value=>zooms.push(value);
 const start=source.indexOf('const isVolumeWindow');
 vm.runInContext(source.slice(start,source.indexOf("let macMediaPreference",start)),context);
 const event={sender:mainWindow.webContents};
 assert.equal(await handlers['interface:zoom-get'](event),100);
 assert.equal(await handlers['interface:zoom-set'](event,125),125);
 assert.equal(JSON.parse(writes[0][1]).zoom,125);assert.deepEqual(zooms,[1.25]);
 for(const value of [NaN,Infinity,0,200,123,'100'])await assert.rejects(handlers['interface:zoom-set'](event,value));
 await assert.rejects(handlers['interface:zoom-set']({sender:miniWindow.webContents},100));
 assert.equal(writes.length,1);
});
test('Mac icon contains standard image sizes with transparent optical padding',async()=>{
 const data=fs.readFileSync(path.join(__dirname,'../build/icon-mac.icns'));
 assert.equal(data.subarray(0,4).toString(),'icns');assert.equal(data.readUInt32BE(4),data.length);
 const {loadImage,createCanvas}=require('@napi-rs/canvas');
 const length=data.readUInt32BE(12),image=await loadImage(data.subarray(16,8+length));
 const canvas=createCanvas(image.width,image.height),c=canvas.getContext('2d');c.drawImage(image,0,0);
 const pixel=c.getImageData(0,0,image.width,image.height).data;
 let left=image.width,right=0;
 for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++)if(pixel[(y*image.width+x)*4+3]>10){left=Math.min(left,x);right=Math.max(right,x);}
 assert(left>=image.width*.095);assert(right<=image.width*.905);
});
