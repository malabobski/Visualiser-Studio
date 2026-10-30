(function(root){
  const names=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
  const shapes=[
    ['', [0,4,7]],['m',[0,3,7]],['dim',[0,3,6]],['aug',[0,4,8]],
    ['sus2',[0,2,7]],['sus4',[0,5,7]],['5',[0,7]],
    ['7',[0,4,7,10]],['maj7',[0,4,7,11]],['m7',[0,3,7,10]],['m(maj7)',[0,3,7,11]],
    ['dim7',[0,3,6,9]],['m7♭5',[0,3,6,10]],['6',[0,4,7,9]],['m6',[0,3,7,9]],
    ['add9',[0,2,4,7]],['m(add9)',[0,2,3,7]],['7sus4',[0,5,7,10]],
    ['9',[0,2,4,7,10]],['maj9',[0,2,4,7,11]],['m9',[0,2,3,7,10]],
    ['11',[0,2,4,5,7,10]],['m11',[0,2,3,5,7,10]],['13',[0,2,4,7,9,10]]
  ];
  function pitches(notes,channel){return [...notes].filter(n=>Number.isInteger(n.pitch)&&n.pitch>=0&&n.pitch<=127&&(!channel||n.channel===channel)).map(n=>n.pitch).sort((a,b)=>a-b);}
  function analyse(values){
    if(!values.length)return {label:'—',notes:[],kind:'empty',alternatives:[]};
    const pcs=[...new Set(values.map(p=>p%12))].sort((a,b)=>a-b),bass=values[0]%12;
    const matches=[];
    for(const root of pcs)for(const [suffix,intervals]of shapes){
      if(intervals.length!==pcs.length||!intervals.every(i=>pcs.includes((root+i)%12)))continue;
      matches.push({root,label:names[root]+suffix+(root===bass?'':'/'+names[bass])});
    }
    matches.sort((a,b)=>(b.root===bass)-(a.root===bass));
    return {label:matches[0]?.label||pcs.map(pc=>names[pc]).join(' · '),notes:pcs.map(pc=>names[pc]),kind:matches.length?'chord':'notes',alternatives:matches.slice(1).map(m=>m.label)};
  }
  function identify(notes,channel=0){return analyse(pitches(notes,channel));}
  class Tracker{
    constructor(){this.reset();}
    reset(){this.key=null;this.since=0;this.pending=null;this.value=analyse([]);}
    update(notes,now,channel=0){
      const values=pitches(notes,channel),pcs=[...new Set(values.map(p=>p%12))].sort((a,b)=>a-b);
      const key=channel+':'+(values.length?values[0]%12:'')+':'+pcs.join(',');
      if(key!==this.key){this.key=key;this.since=now;this.pending=analyse(values);}
      if(this.pending&&now-this.since>=(values.length?130:280)){this.value=this.pending;this.pending=null;}
      return this.value;
    }
  }
  const api={identify,Tracker};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DawChords=api;
})(typeof window==='undefined'?globalThis:window);
