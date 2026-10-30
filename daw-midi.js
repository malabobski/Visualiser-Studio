(function(root){
  const noteName=pitch=>['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'][pitch%12]+(Math.floor(pitch/12)-1);
  class Input {
    constructor(){this.notes=new Map();this.history=[];this.pedal=new Set();this.clock=[];this.pulses=0;this.running=false;this.bpm=null;this.lastMessage=0;this.messages=0;this.noteMessages=0;this.lastNoteChannel=null;this.clockMessages=0;}
    clear(){this.notes.clear();this.pedal.clear();this.history=[];}
    reset(){this.clear();this.clock=[];this.pulses=0;this.running=false;this.bpm=null;this.messages=0;this.lastMessage=0;this.noteMessages=0;this.lastNoteChannel=null;this.clockMessages=0;}
    receive(data,now,channel=0){
      const status=data?.[0];if(!Number.isInteger(status))return;
      this.lastMessage=now;this.messages++;
      if(status===248)this.clockMessages++;
      if((status>>4)===9&&data.length>=3&&data[1]>=0&&data[1]<=127&&data[2]>0&&data[2]<=127){this.noteMessages++;this.lastNoteChannel=(status&15)+1;}
      if(status===248){this.clock.push(now);this.clock=this.clock.filter(t=>now-t<2500).slice(-49);if(this.clock.length>=13){const intervals=this.clock.slice(1).map((t,i)=>t-this.clock[i]).filter(t=>t>0);if(intervals.length){intervals.sort((a,b)=>a-b);this.bpm=Math.round(60000/(intervals[Math.floor(intervals.length/2)]*24)*10)/10;}}if(this.running)this.pulses++;return;}
      if(status===250){this.running=true;this.pulses=0;return;}if(status===251){this.running=true;return;}
      if(status===252){this.running=false;for(const note of this.notes.values())note.end=now;this.notes.clear();this.pedal.clear();return;}
      if(status===242){if(data.length>=3)this.pulses=(data[1]+(data[2]<<7))*6;return;}
      const kind=status>>4,ch=(status&15)+1;if(status>=240||channel&&channel!==ch||data.length<3)return;
      const pitch=data[1],velocity=data[2];if(pitch>127||velocity>127)return;const key=ch+':'+pitch;
      if(kind===9&&velocity){const old=this.notes.get(key);if(old)old.end=now;const note={pitch,channel:ch,velocity:velocity/127,start:now,end:null,released:false};this.notes.set(key,note);this.history.push(note);}
      else if(kind===8||kind===9&&!velocity){const note=this.notes.get(key);if(note){if(this.pedal.has(ch))note.released=true;else{note.end=now;this.notes.delete(key);}}}
      else if(kind===11){if(pitch===64){if(velocity>=64)this.pedal.add(ch);else{this.pedal.delete(ch);for(const [id,note]of this.notes)if(note.channel===ch&&note.released){note.end=now;this.notes.delete(id);}}}else if(pitch===120||pitch===123){for(const [id,note]of this.notes)if(note.channel===ch){note.end=now;this.notes.delete(id);}this.pedal.delete(ch);}}
      this.history=this.history.filter(note=>note.end===null||now-note.end<12000).slice(-2048);
    }
  }
  const api={Input,noteName};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.DawMidi=api;
})(typeof window==='undefined'?globalThis:window);
