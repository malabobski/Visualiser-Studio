(() => {
  const panel=document.createElement('details');panel.className='automation-transition';panel.open=true;
  panel.innerHTML='<summary>Section look <span id="sectionCount"></span></summary><p>Split at the playhead. Choose a look for each part of your song.</p><label class="transition-enabled"><input id="transitionEnabled" type="checkbox"> Use song sections</label><button id="sectionSplit" type="button">＋ Split at playhead</button><div id="sectionInspector"><small id="sectionTiming"></small><div class="section-actions"><button id="sectionLoop" type="button">Loop section</button><button id="sectionPreview" type="button">Preview transition</button></div><label>Section name<input id="sectionName" type="text" maxlength="60"></label><label>Style<select id="sectionStyle"></select></label><div id="sectionColours"></div><details class="section-parameters"><summary>Parameters</summary><div id="sectionParams"></div></details><div id="sectionBlend"><label>Transition into this section<select id="sectionTransition"><option value="cut">Cut</option><option value="fade">Crossfade</option></select></label><label id="sectionFadeRow">Blend length (seconds)<input id="sectionFade" type="number" min="0" max="60" step=".1"></label></div><button id="sectionCapture" type="button">Use current Create look</button></div><small id="transitionStatus" role="status"></small>';
  document.querySelector('.automation-add-track').before(panel);
  const band=document.createElement('div');band.className='automation-transition-band looks-track';band.innerHTML='<div class="automation-track-label"><strong>Looks</strong><small>Split · Style · Blend</small></div><div class="transition-band-body"></div>';
  $('automationRuler').after(band);const body=band.querySelector('.transition-band-body');
  let config=null,source=null,sourceFile=null,pending=null,renderer=null,warming=null,revision=0,selected=0,moving=null;
  const current=()=>SceneTransitions.look(captureCurrentLook());
  const songLength=()=>Number.isFinite(audio.duration)?audio.duration:30;
  function migrate(value){const c=SceneTransitions.clean(value);if(!c||c.sections)return c;return SceneTransitions.clean({enabled:c.enabled,sections:[{name:'Intro',start:0,fade:0,look:c.a},{name:'Section 2',start:c.start,fade:c.duration,look:c.b}]});}
  function draft(){return config??={enabled:false,sections:[{name:'Intro',start:0,fade:0,look:current()}]};}
  const checkpoint=()=>window.Automation.checkpoint();
  function changed(rebuild=true){renderer=null;$('transitionEnabled').checked=!!config?.enabled;if(rebuild)render();window.dispatchEvent(new Event('automation-saved'));if(config?.enabled)prepare().catch(error=>$('transitionStatus').textContent=error.message);}
  function edit(fn){checkpoint();draft().enabled=true;fn();config=SceneTransitions.clean(config);changed();}
  function select(index,preview=true){selected=index;panel.open=true;render();const section=draft().sections[index];if(preview&&loadedFile&&audio.paused){audio.currentTime=Math.min((draft().sections[index+1]?.start??songLength())-.001,section.start+section.fade+.001);}}
  const name=style=>ComplexStyles.names[style]||style[0].toUpperCase()+style.slice(1);
  function drawTrack(){
    const sections=config?.sections||[{name:'Whole song',start:0,fade:0,look:current()}],length=songLength();body.replaceChildren();band.classList.toggle('is-disabled',!config?.enabled);
    sections.forEach((section,index)=>{
      const end=sections[index+1]?.start??length;if(section.start>=length)return;
      const block=document.createElement('button');block.type='button';block.className='look-section'+(index===selected?' is-selected':'');block.dataset.section=index;block.style.left=section.start/length*100+'%';block.style.width=(end-section.start)/length*100+'%';block.style.setProperty('--section-colour',section.look.colour);
      const title=document.createElement('strong'),subtitle=document.createElement('small');title.textContent=section.name;subtitle.textContent=name(section.look.style);block.append(title,subtitle);block.title=section.name+' · '+section.start.toFixed(2)+'s to '+end.toFixed(2)+'s';block.onclick=()=>select(index);body.append(block);
      if(index){
        const blend=document.createElement('div');blend.className='section-blend-zone';blend.style.left=section.start/length*100+'%';blend.style.width=section.fade/length*100+'%';body.append(blend);
        for(const kind of ['boundary','blend']){const handle=document.createElement('button');handle.type='button';handle.className='section-handle section-'+kind;handle.dataset.section=index;handle.dataset.handle=kind;handle.style.left=(section.start+(kind==='blend'?section.fade:0))/length*100+'%';handle.setAttribute('aria-label',kind==='boundary'?'Move start of '+section.name:'Adjust crossfade into '+section.name);handle.title=kind==='boundary'?'Drag section boundary':'Drag right to blend · Drag back to cut';handle.textContent=kind==='blend'?'◇':'';body.append(handle);}
      }
    });
  }
  function colourButton(label,value,set){
    const button=document.createElement('button');button.type='button';button.className='section-colour-button';button.textContent=label;button.style.setProperty('--swatch',value);
    button.onclick=()=>{
      const popup=document.createElement('div');popup.className='midi-rgb section-colour-popup';popup.popover='auto';const channels=[1,3,5].map(offset=>{const row=document.createElement('label'),input=document.createElement('input');input.type='range';input.min=0;input.max=255;input.value=parseInt(value.slice(offset,offset+2),16);row.append(input);popup.append(row);return input;});
      let saved=false;channels[0].oninput=()=>{if(!saved){checkpoint();saved=true;}const hex='#'+channels.map(c=>Number(c.value).toString(16).padStart(2,'0')).join('');draft().enabled=true;set(hex);button.style.setProperty('--swatch',hex);value=hex;changed(false);drawTrack();};
      document.body.append(popup);popup.showPopover();const r=button.getBoundingClientRect();popup.style.left=Math.max(8,Math.min(innerWidth-250,r.left))+'px';popup.style.top=Math.max(8,Math.min(innerHeight-330,r.bottom+6))+'px';popup.addEventListener('toggle',e=>{if(e.newState==='closed')popup.remove();});
    };return button;
  }
  function render(){
    selected=Math.min(selected,(config?.sections.length||1)-1);const sections=config?.sections||[{name:'Intro',start:0,fade:0,look:current()}],section=sections[selected];
    $('transitionEnabled').checked=!!config?.enabled;$('sectionCount').textContent=sections.length+' '+(sections.length===1?'section':'sections');$('sectionName').value=section.name;
    const styles=$('sectionStyle');if(!styles.options.length)Object.keys(styleParameters).forEach(style=>styles.add(new Option(name(style),style)));styles.value=section.look.style;
    $('sectionTiming').textContent=section.start.toFixed(2)+'s – '+(sections[selected+1]?.start??songLength()).toFixed(2)+'s';$('sectionPreview').disabled=selected===0||!loadedFile;$('sectionLoop').disabled=!loadedFile;
    $('sectionBlend').hidden=selected===0;$('sectionTransition').value=section.fade?'fade':'cut';$('sectionFadeRow').hidden=!section.fade;$('sectionFade').value=section.fade;
    const colours=$('sectionColours');colours.replaceChildren();
    const setColour=key=>hex=>{draft().sections[selected].look[key]=hex;};
    if(ComplexStyles.names[section.look.style]){
      const palette=section.look.design.colours||[section.look.colour,'#7ec9ef','#efb897'];
      palette.forEach((hex,i)=>colours.append(colourButton('Colour '+(i+1),hex,value=>{const look=draft().sections[selected].look;look.design.colours=[...(look.design.colours||palette)];look.design.colours[i]=value;look.design.customColours=true;})));
    }else colours.append(colourButton('Colour',section.look.colour,setColour('colour')));
    colours.append(colourButton('Background',section.look.background,setColour('background')));
    const params=$('sectionParams');params.replaceChildren();styleParameters[section.look.style].forEach((spec,index)=>{const row=document.createElement('label');row.textContent=spec[0];const input=document.createElement('input');input.type='range';input.min=spec[1];input.max=spec[2];input.step=spec[4];input.value=section.look.params[index];input.dataset.default=spec[3];input.setAttribute('aria-label',spec[0]);let started=false;input.addEventListener('input',()=>{if(!started){checkpoint();started=true;}draft().enabled=true;draft().sections[selected].look.params[index]=Number(input.value);changed(false);});input.addEventListener('change',()=>{started=false;});row.append(input);params.append(row);});
    $('sectionSplit').disabled=sections.length>=64||audio.currentTime<=.05||audio.currentTime>=songLength()-.05;
    $('transitionStatus').textContent=config?.enabled?'Drag a section edge to change its timing. Drag ◇ to blend.':'Enable sections or split the song to get started.';drawTrack();
  }
  function split(time=audio.currentTime){if(time<=.05||time>=songLength()-.05||draft().sections.length>=64)return;const list=draft().sections;if(list.some(s=>Math.abs(s.start-time)<.05))return;edit(()=>{const index=list.findLastIndex(s=>s.start<time);const next=JSON.parse(JSON.stringify(list[index]));next.start=time;next.fade=Math.min(1,(list[index+1]?.start??songLength())-time);next.name='Section '+(list.length+1);list.splice(index+1,0,next);selected=index+1;});}
  $('sectionLoop').onclick=()=>{const list=draft().sections;window.AutomationLoop?.set(list[selected].start,list[selected+1]?.start??songLength());};
  $('sectionPreview').onclick=()=>{const section=draft().sections[selected];window.AutomationLoop?.clear();audio.currentTime=Math.max(0,section.start-1);if(audio.paused)togglePlayback();};
  $('sectionSplit').onclick=()=>split();
  $('transitionEnabled').onchange=e=>{checkpoint();draft().enabled=e.target.checked;changed();};
  $('sectionName').onchange=e=>edit(()=>{draft().sections[selected].name=e.target.value.trim()||'Section '+(selected+1);});
  $('sectionStyle').onchange=e=>edit(()=>{const s=draft().sections[selected];s.look=SceneTransitions.look({...s.look,style:e.target.value,params:undefined,automation:[]});});
  $('sectionCapture').onclick=()=>edit(()=>{draft().sections[selected].look=current();});
  $('sectionTransition').onchange=e=>edit(()=>{const s=draft().sections[selected];s.fade=e.target.value==='cut'?0:Math.min(1,(draft().sections[selected+1]?.start??songLength())-s.start);});
  $('sectionFade').onchange=e=>{if(Number.isFinite(e.target.valueAsNumber))edit(()=>{const s=draft().sections[selected];s.fade=Math.max(0,Math.min(60,e.target.valueAsNumber,(draft().sections[selected+1]?.start??songLength())-s.start));});};
  body.addEventListener('pointerdown',e=>{const handle=e.target.closest('[data-handle]');if(!handle||e.button!==0)return;e.preventDefault();e.stopPropagation();checkpoint();selected=Number(handle.dataset.section);draft().enabled=true;moving={index:selected,kind:handle.dataset.handle};body.setPointerCapture(e.pointerId);});
  body.addEventListener('pointermove',e=>{if(!moving)return;const list=draft().sections,s=list[moving.index],r=body.getBoundingClientRect();let t=(e.clientX-r.left)/r.width*songLength();if(!e.altKey&&$('automationSnap').getAttribute('aria-pressed')==='true'&&Math.abs(t-audio.currentTime)*r.width/songLength()<10)t=audio.currentTime;const end=list[moving.index+1]?.start??songLength();if(moving.kind==='boundary'){s.start=Number(Math.max(list[moving.index-1].start+.05,Math.min(end-.05,t)).toFixed(3));list[moving.index-1].fade=Math.min(list[moving.index-1].fade,s.start-list[moving.index-1].start);s.fade=Math.min(s.fade,end-s.start);}else s.fade=Number(Math.max(0,Math.min(60,end-s.start,t-s.start)).toFixed(3));changed(false);drawTrack();$('transitionStatus').textContent=moving.kind==='boundary'?s.name+' starts at '+s.start.toFixed(2)+'s':s.fade?'Crossfade · '+s.fade.toFixed(2)+'s':'Cut · instant switch';});
  const finish=()=>{if(!moving)return;moving=null;render();};body.addEventListener('pointerup',finish);body.addEventListener('lostpointercapture',finish);body.addEventListener('pointercancel',finish);
  body.addEventListener('contextmenu',e=>{const target=e.target.closest('[data-section]');if(!target)return;const index=Number(target.dataset.section);AppContextMenu.open(e,[{label:'Loop section',disabled:!loadedFile,run:()=>{select(index,false);$('sectionLoop').click();}},{label:'Rename section',run:()=>{select(index,false);$('sectionName').focus();$('sectionName').select();}},{label:'Duplicate look into next section',disabled:index>=draft().sections.length-1,run:()=>edit(()=>{draft().sections[index+1].look=JSON.parse(JSON.stringify(draft().sections[index].look));})},{label:'Remove section',disabled:draft().sections.length===1,run:()=>edit(()=>{draft().sections.splice(index,1);selected=Math.max(0,index-1);})}]);});
  audio.addEventListener('timeupdate',()=>{const index=config?.sections.findLastIndex(s=>s.start<=audio.currentTime);body.querySelectorAll('.look-section').forEach(b=>b.classList.toggle('is-playing',config?.enabled&&Number(b.dataset.section)===index));$('sectionSplit').disabled=audio.currentTime<=.05||audio.currentTime>=songLength()-.05||(config?.sections.length||0)>=64;});
  async function prepare(){
    if(!loadedFile)throw Error('Choose an audio file in Create first.');
    if(sourceFile===loadedFile&&source)return source;
    if(sourceFile===loadedFile&&pending)return pending;
    const file=loadedFile,version=revision;sourceFile=file;
    pending=(async()=>{const decoder=new AudioContext({sampleRate:48000});try{
      const decoded=await decoder.decodeAudioData(await file.arrayBuffer());if(version!==revision||file!==loadedFile)return null;
      const samples=new Float32Array(decoded.length);for(let channel=0;channel<decoded.numberOfChannels;channel++){const values=decoded.getChannelData(channel);for(let i=0;i<samples.length;i++)samples[i]+=values[i]/decoded.numberOfChannels;}
      source=new SceneTransitions.AudioSource(samples,decoded.sampleRate);renderer=null;render();return source;
    }finally{await decoder.close();if(version===revision)pending=null;}})();return pending;
  }
  window.StyleTransition={
    get:()=>config?JSON.parse(JSON.stringify(config)):null,
    set(value){config=migrate(value);selected=0;changed();},
    async exportConfig(){if(!config?.enabled)return null;await prepare();return this.get();},
    async exportToken(){const value=await this.exportConfig();if(!value)return '';const response=await fetch('/render-transition',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});if(!response.ok)throw Error('Could not prepare the style fade for export.');return (await response.json()).token;},
    paint(){
      if(!config?.enabled||!source||sourceFile!==loadedFile||document.querySelector('main').hidden)return false;
      renderer??=new SceneTransitions.Renderer(config,source,(w,h)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c;});
      if(warming||renderer.work(audio.currentTime,canvas.width,canvas.height)>60){
        if(!warming){const instance=renderer,time=audio.currentTime;$('transitionStatus').textContent='Warming the scenes for this position…';const job=instance.prepare(time,canvas.width,canvas.height,()=>renderer===instance&&Math.abs(audio.currentTime-time)<10).catch(error=>{$('transitionStatus').textContent=error.message;}).finally(()=>{if(warming===job){warming=null;if(renderer===instance)render();}});warming=job;}
        return true;
      }
      renderer.render(ctx,canvas.width,canvas.height,audio.currentTime);
      const midi=window.MidiImport?.getState();if(midi?.enabled!==false&&midi?.data){if(midi.layer==='replace'){ctx.fillStyle=$('background').value;ctx.fillRect(0,0,canvas.width,canvas.height);}const frame=source.frame(Math.floor(audio.currentTime*60+1e-6));MidiEngine.paint(ctx,canvas.width,canvas.height,audio.currentTime,midi,{style:$('style').value,values:frame.values,params:valueForAll($('style').value)});}
      return true;
    }
  };
  function reset(){selected=0;revision++;config=null;source=null;sourceFile=null;pending=null;renderer=null;render();}
  window.addEventListener('create-audio-loaded',reset);window.addEventListener('project-new',reset);window.addEventListener('automation-open',render);audio.addEventListener('loadedmetadata',render);render();
})();
