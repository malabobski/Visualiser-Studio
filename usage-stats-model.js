(function(root){
  const prefix='visualiserUsage-v1-',empty=()=>({time:{create:0,live:0,mini:0},styles:{},exports:0,exportSeconds:0,projects:0});
  function create(storage,role,clock=Date.now){
    const read=key=>{try{return JSON.parse(storage.getItem(prefix+key)||'null');}catch{return null;}},write=(key,value)=>{try{storage.setItem(prefix+key,JSON.stringify(value));}catch{}};
    if(!read('since'))write('since',clock());
    let last=clock();
    function add(kind,value=1,style){const state=read(role)||empty();if(['create','live','mini'].includes(kind)){state.time[kind]+=value;if(style&&style!=='__proto__'&&style!=='constructor')state.styles[style]=(Number(state.styles[style])||0)+value;}else if(kind==='export'){state.exports++;state.exportSeconds+=Math.max(0,Number(value)||0);}else if(kind==='project')state.projects++;write(role,state);}
    return {add,tick(kind,style){const now=clock(),dt=(now-last)/1000;last=now;if(role==='main')write('activity',{at:now,active:!!kind});const main=read('activity');if(role==='mini'&&main?.active&&now-main.at<2500)return;if(kind&&dt>0&&dt<5)add(kind,dt,style);},snapshot(){const total=empty();for(const key of ['main','mini']){const state=read(key);if(!state)continue;for(const k of Object.keys(total.time))total.time[k]+=Number(state.time?.[k])||0;for(const [style,seconds]of Object.entries(state.styles||{}))if(style!=='__proto__'&&style!=='constructor')total.styles[style]=(total.styles[style]||0)+(Number(seconds)||0);for(const k of ['exports','exportSeconds','projects'])total[k]+=Number(state[k])||0;}return {...total,since:read('since')};},reset(){write('main',empty());write('mini',empty());write('since',clock());last=clock();}};
  }
  if(typeof module!=='undefined'){module.exports={create};return;}root.UsageStatsModel={create};
})(globalThis);
