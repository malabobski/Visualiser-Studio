(() => {
  const card=document.querySelector('.settings-card');
  const groups=[
    ['Visualiser styles',['settingAdvanced','settingShowMidi']],
    ['Playback',['settingAutoplay']],
    ['Appearance',['settingReduceMotion','settingAccentColour']],
    ['Export defaults',['settingFramerate']],
    ['Startup',['settingStartupTemplate','settingStartupScreen']],
    ['Discord',['settingRichPresence']]
  ];
  const footer=document.createElement('div');footer.className='settings-footer';
  for(const id of ['showShortcutsBtn','settingsVersion'])footer.append(document.getElementById(id).closest('.settings-row'));
  groups.forEach(([name,ids])=>{
    const group=document.createElement('details');group.className='settings-group';group.open=false;
    const summary=document.createElement('summary');summary.textContent=name;group.append(summary);
    ids.forEach(id=>group.append(document.getElementById(id).closest('.settings-row')));
    card.append(group);
  });
  card.append(footer);
})();
