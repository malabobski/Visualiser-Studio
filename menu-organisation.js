(() => {
  const section=(title,open=false)=>{
    const details=document.createElement('details');details.className='customise-section';details.open=open;
    const summary=document.createElement('summary');summary.textContent=title;details.append(summary);return details;
  };
  // Keep file actions out of the history/edit menu. Existing buttons and hotkeys
  // are retained, including their listeners and enabled state.
  const file=document.createElement('details');file.className='ease-edit';file.id='fileMenu';
  file.innerHTML='<summary>File <span aria-hidden="true">⌄</span></summary><div class="ease-edit-menu"></div>';
  const fileContent=file.querySelector('div');
  const open=document.createElement('button');open.type='button';open.innerHTML='Open audio <kbd>Ctrl+Shift+O</kbd>';open.onclick=()=>{file.open=false;window.Projects?.openAudio();};fileContent.append(open);
  ['easeSave','easeSnapshot'].forEach(id=>fileContent.append($(id)));
  $('easeEdit').before(file);
  $('easeSnapshot').firstChild.textContent='Save stage image ';
  file.addEventListener('toggle',()=>{if(file.open)$('easeEdit').open=false;});
  $('easeEdit').addEventListener('toggle',()=>{if($('easeEdit').open)file.open=false;});
  file.addEventListener('click',e=>{if(e.target.closest('button'))file.open=false;});
  document.addEventListener('click',e=>{if(!file.contains(e.target))file.open=false;});
  document.addEventListener('keydown',e=>{if(e.key==='Escape')file.open=false;});
  const frameLabel=$('settingFramerate').closest('label');frameLabel.firstChild.textContent='Default export frame rate';
  const artistLabel=document.querySelector('.artist-theme-picker label');if(artistLabel)artistLabel.textContent='Artist-inspired colours';
  $('presetWindow').querySelector('.eyebrow').textContent='CUSTOMISE VISUALISER';
  $('styleOptionHint').textContent='Design & response';
  const themes=document.querySelector('#presetWindow .theme-panel');
  const movement=document.querySelector('.complex-motion-controls');
  // These selects keep their original handlers but belong to different groups.
  const moveLabel=$('complexMovement').closest('label'),focusLabel=$('complexFocus').closest('label'),focusHelp=movement.querySelector('small');
  movement.style.display='none';
  // Return persistent controls before the parameter rows are rebuilt.
  window.prepareCustomiseMenus=()=>movement.append(moveLabel,focusLabel,focusHelp);
  const source=$('styleOptionControls');
  function organiseCreate(){
    const rows=[...source.children].filter(e=>e.classList.contains('style-setting'));
    if(!rows.length)return;
    const complex=!!ComplexStyles.names[$('style').value];
    const groups={shape:section('Shape & detail',true),motion:section('Motion'),sound:section('Sound response'),colour:section('Colour')};
    rows.forEach(row=>{
      const i=Number(row.querySelector('input').dataset.styleSetting);
      const name=row.querySelector('label').textContent;
      const group=!complex?(['Speed','Flow','Pulse'].includes(name)?'motion':'shape'):i===3?'colour':i===2?'sound':i===0||name==='Gravity'||name==='Pitch bend'?'motion':'shape';
      groups[group].append(row);
    });
    if(complex){
      groups.motion.prepend(moveLabel);groups.sound.prepend(focusLabel);groups.sound.append(focusHelp);
      const colours=document.createElement('button');colours.type='button';colours.className='menu-default';colours.textContent='Edit colours & background';colours.onclick=()=>$('complexColourOpen').click();groups.colour.append(colours);
    }else groups.colour.append(themes);
    for(const group of Object.values(groups))if(group.children.length>1)source.append(group);
    // Hide the unused two-colour themes for Complex styles.
    if(complex)themes.remove();
  }
  new MutationObserver(organiseCreate).observe(source,{childList:true});
  // Live uses the same categories, with capture and recording settings staying
  // next to the stage and inside Recording respectively.
  const live=$('liveCustomiseDialog'),styleLabel=$('liveStyle').closest('label'),responseLabel=$('liveResponse').closest('label');
  const low=$('liveLow').closest('label'),high=$('liveHigh').closest('label'),visual=$('liveColour').closest('label'),background=$('liveBackground').closest('label');
  const oldDetails=visual.closest('details'),colourHelp=oldDetails.querySelector('small');
  const liveStyle=section('Style',true),liveSound=section('Sound response'),liveColour=section('Colour');
  liveStyle.append(styleLabel,$('liveParameters'));
  const frequencies=document.createElement('div');frequencies.className='live-customise-grid';frequencies.append(low,high);liveSound.append(responseLabel,frequencies);
  const colours=document.createElement('div');colours.className='live-customise-grid';colours.append(visual,background);liveColour.append(colours,colourHelp);
  oldDetails.remove();const emptyGrid=live.querySelector('.live-customise-grid');if(emptyGrid&&!emptyGrid.children.length)emptyGrid.remove();
  $('liveCustomiseReset').before(liveStyle,liveSound,liveColour);
  const liveParams=$('liveParameters');
  new MutationObserver(()=>{
    const rows=[...liveParams.children].filter(e=>e.classList.contains('live-param'));if(!rows.length)return;
    const complex=!!ComplexStyles.names[liveLook.style];
    const groups={shape:section('Shape & detail',true),motion:section('Motion'),sound:section('Response tuning'),colour:section('Palette')};
    rows.forEach((row,i)=>{
      const name=styleParameters[liveLook.style][i][0];
      const key=!complex?(['Speed','Flow','Pulse'].includes(name)?'motion':'shape'):i===3?'colour':i===2||i===5?'sound':i===0||i===4||name==='Gravity'||name==='Pitch bend'?'motion':'shape';groups[key].append(row);
    });
    Object.values(groups).forEach(group=>{if(group.children.length>1)liveParams.append(group);});
  }).observe(liveParams,{childList:true});
  const effects=document.querySelector('.live-effects');effects.querySelector('summary').textContent='Live options';
  const menu=effects.querySelector('.live-effects-menu');
  const heading=document.createElement('span');heading.className='menu-group-label';heading.textContent='Album colours';menu.prepend(heading);
  const automation=document.createElement('span');automation.className='menu-group-label';automation.textContent='Song changes';$('liveRandomSong').closest('label').before(automation);
})();
