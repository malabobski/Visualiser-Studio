(function(root){
  const key='visualiserOnboarding-v2',legacy='visualiserTutorialCompleted-v1',tools=['stage','automation','midi'];
  function create(storage){
    let saved;try{saved=JSON.parse(storage.getItem(key)||'null');}catch{}
    const status=value=>['new','in-progress','done','skipped'].includes(value)?value:'new';
    const state={intro:{status:status(saved?.intro?.status),step:Math.max(0,Math.min(5,Math.floor(Number(saved?.intro?.step)||0)))},tools:Object.fromEntries(tools.map(id=>[id,status(saved?.tools?.[id])]))};
    const snapshot=()=>JSON.parse(JSON.stringify(state));
    const persist=()=>{try{storage.setItem(key,JSON.stringify(state));}catch{}};
    return {
      snapshot,
      shouldStart(){if(['done','skipped'].includes(state.intro.status))return false;if(state.intro.status==='in-progress')return true;try{return storage.getItem(legacy)!=='done';}catch{return false;}},
      intro(value,step=0){state.intro={status:status(value),step:Math.max(0,Math.min(5,Math.floor(Number(step)||0)))};persist();if(['done','skipped'].includes(value))try{storage.setItem(legacy,'done');}catch{}},
      tool(id,value){if(!tools.includes(id))return;state.tools[id]=status(value);persist();},
      needsTool(id){return tools.includes(id)&&!['done','skipped'].includes(state.tools[id]);},
      resetMenus(){tools.forEach(id=>state.tools[id]='new');persist();}
    };
  }
  if(typeof module!=='undefined'&&module.exports)module.exports={create};else root.OnboardingState={create};
})(typeof globalThis!=='undefined'?globalThis:this);
