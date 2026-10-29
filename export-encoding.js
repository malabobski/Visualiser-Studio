const os=require('node:os');
function videoEncodingArgs(threads=os.availableParallelism?.()||os.cpus().length){
  const count=Math.max(1,Math.min(32,Math.floor(Number(threads)||1)));
  // Parallelise the existing quality preset. Do not trade quality for speed,
  // drop frames, change chroma sampling, or impose a bitrate ceiling.
  return ['-c:v','libvpx-vp9','-row-mt','1','-threads',String(count),'-b:v','0','-crf','28','-pix_fmt','yuv420p'];
}
module.exports={videoEncodingArgs};
