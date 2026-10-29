const fs=require('node:fs/promises');
const path=require('node:path');

// Keep this short and written for listeners. Refresh it when preparing a release.
const highlights={
  title:'More ways to hang out with your music.',
  sections:[
    {title:'Fresh looks for your music',items:['Meet Laser Bloom, Spectral Wings and Glass Comets—three new reactive styles with glowing trails and moving light.']},
    {title:'An easier place to start',items:['A new step-by-step introduction reveals the basics as you go.','Short guides help you find your feet in Stage Designer, MIDI and Automation.']},
    {title:'Make it yours',items:['Drag Stage Designer layers above or below the visualiser to arrange your scene.','A cleaner file picker includes drive shortcuts and image previews.']},
    {title:'Less waiting, more listening',items:['Video exports are faster while keeping the same quality settings.','Clearer menus, named Live controls and more helpful notifications make everyday use smoother.']}
  ]
};
function newer(a,b){
  if(!/^\d+\.\d+\.\d+$/.test(a||''))return false;if(!b)return true;
  if(!/^\d+\.\d+\.\d+$/.test(b))return false;
  const left=a.split('.').map(Number),right=b.split('.').map(Number);
  return (left.map((v,i)=>v-right[i]).find(v=>v!==0)||0)>0;
}
async function loadReleaseHighlights({directory,version,packaged}){
  if(!packaged)return {snapshot:()=>null,acknowledge:async()=>false};
  const file=path.join(directory,'release-highlights.json');let saved;
  try{saved=JSON.parse(await fs.readFile(file,'utf8'));}catch{}
  let existing=false;try{existing=(await fs.stat(path.join(directory,'Local Storage','leveldb'))).isDirectory();}catch{}
  const seenVersion=typeof saved?.seenVersion==='string'?saved.seenVersion:existing?'':version;
  let pending=newer(version,seenVersion);
  const persist=async seen=>{await fs.mkdir(directory,{recursive:true});await fs.writeFile(file,JSON.stringify({seenVersion:seen}));};
  // First installs establish a baseline; existing profiles see the first supported update too.
  if(!saved&&!pending)await persist(version);
  return {
    snapshot:()=>pending?{version,...highlights}:null,
    acknowledge:async()=>{await persist(version);pending=false;return true;}
  };
}
module.exports={loadReleaseHighlights,newer};
