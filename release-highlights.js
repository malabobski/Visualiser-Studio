const fs=require('node:fs/promises');
const path=require('node:path');

// Keep this short and written for listeners. Refresh it when preparing a release.
const highlights={
  title:'Your session, in colour.',
  sections:[
    {title:'Meet DAW Link',items:['A dedicated workspace brings your MIDI notes to life while you make music.','The Ableton connector links up to 16 tracks at once, with helper tracks that follow your solos.']},
    {title:'See what you play',items:['Pitch trails, Note cascade and Chord constellation respond to your notes, chords and velocity.','Choose a different colour for each MIDI channel and identify chords live, including inversions.']},
    {title:'Stay in sync',items:['See Ableton tempo beside MIDI clock, with a compact progress bar while tracks connect.','Choose DAW Link or Community as your startup screen. Alt+5 opens DAW Link, Alt+6 Community and Alt+7 Miniplayer.']},
    {title:'Smoother sessions',items:['Softer note transitions and cleaner controls keep the focus on your music.','Discord Rich Presence recovers automatically from failed updates and stalled connections.']}
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
