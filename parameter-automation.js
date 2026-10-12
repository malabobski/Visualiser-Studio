(function(root){
  const clean=tracks=>Array.isArray(tracks)?tracks.slice(0,64).filter(t=>Number.isInteger(t.index)&&t.index>=0&&t.index<64).map(t=>({index:t.index,enabled:t.enabled!==false,mode:t.mode==='hold'?'hold':'linear',points:(Array.isArray(t.points)?t.points:[]).slice(0,2000).filter(p=>Number.isFinite(p.time)&&p.time>=0&&Number.isFinite(p.value)).map(p=>({time:p.time,value:p.value})).sort((a,b)=>a.time-b.time)})):[];
  function evaluate(track,time,fallback,spec){
    if(!track||track.enabled===false||!track.points?.length)return fallback;
    const points=track.points;let value=points[0].value;
    if(time>=points[points.length-1].time)value=points[points.length-1].value;
    else for(let i=1;i<points.length;i++)if(time<points[i].time){const a=points[i-1],b=points[i];value=track.mode==='hold'?a.value:a.value+(b.value-a.value)*Math.max(0,(time-a.time)/Math.max(.000001,b.time-a.time));break;}
    if(spec){value=Math.max(spec[1],Math.min(spec[2],value));value=spec[1]+Math.round((value-spec[1])/spec[4])*spec[4];}
    return Number(value.toFixed(6));
  }
  const basicSpecs={"bars":[["Height",0.35,1.2,0.7,0.05],["Density",40,150,96,1],["Gap",0.25,0.95,0.72,0.01]],"mirror":[["Height",0.35,1.2,0.7,0.05],["Density",40,150,96,1],["Gap",0.25,0.95,0.72,0.01]],"radial":[["Core",0.06,0.3,0.16,0.01],["Spread",0.1,0.5,0.31,0.01],["Thickness",1,10,3,1]],"wave":[["Amplitude",0.15,0.8,0.35,0.01],["Thickness",1,12,4,1],["Detail",1,6,2,1]],"particles":[["Density",40,300,180,1],["Speed",0.2,2,1,0.05],["Size",0.4,4,1,0.1]],"aurora":[["Height",0.15,0.8,0.5,0.01],["Flow",0.2,2,1,0.05],["Opacity",0.15,1,0.8,0.01]],"orbit":[["Radius",0.08,0.4,0.2,0.01],["Dots",30,180,110,1],["Size",0.2,3,1,0.1]],"rings":[["Spacing",0.02,0.12,0.047,0.005],["Thickness",1,12,4,1],["Pulse",0.01,0.12,0.04,0.005]],"spiral":[["Arms",1,6,3,1],["Turns",0.5,4,2,0.1],["Size",0.3,3,1,0.1]],"grid":[["Columns",8,40,22,1],["Rows",4,20,10,1],["Gap",0,0.6,0.22,0.02]],"starburst":[["Core",0.04,0.22,0.09,0.01],["Length",0.15,0.6,0.34,0.01],["Width",1,12,4,1]],"tunnel":[["Rings",6,30,14,1],["Depth",0.4,2,1,0.05],["Thickness",1,10,3,1]]};
  const api={clean,evaluate,basicSpecs};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.ParameterAutomation=api;
})(typeof window==='undefined'?globalThis:window);
