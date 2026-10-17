const fs=require('node:fs'),path=require('node:path');
const {createCanvas,loadImage}=require('@napi-rs/canvas');
(async()=>{
  const source=await loadImage(path.join(__dirname,'icon.png'));
  const chunks=[];
  for(const [type,size] of [['ic10',1024],['ic09',512],['ic08',256],['ic07',128],['icp6',64],['icp5',32],['icp4',16]]){
    const canvas=createCanvas(size,size),context=canvas.getContext('2d');
    // Match the optical size of macOS Dock icons: artwork occupies 80% of
    // the canvas instead of filling the complete icon bounds.
    const scale=Math.min(size*.8/source.width,size*.8/source.height);
    const width=source.width*scale,height=source.height*scale;
    context.drawImage(source,(size-width)/2,(size-height)/2,width,height);
    const png=canvas.toBuffer('image/png'),header=Buffer.alloc(8);
    header.write(type);header.writeUInt32BE(png.length+8,4);chunks.push(header,png);
  }
  const header=Buffer.alloc(8);header.write('icns');header.writeUInt32BE(8+chunks.reduce((size,part)=>size+part.length,0),4);
  fs.writeFileSync(path.join(__dirname,'icon-mac.icns'),Buffer.concat([header,...chunks]));
})().catch(error=>{console.error(error);process.exitCode=1;});
