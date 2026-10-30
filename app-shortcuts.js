(() => {
  const tabs=['create','templates','batch','live','daw','community'];
  window.addEventListener('keydown',event=>{
    if(event.isComposing||event.getModifierState?.('AltGraph'))return;
    const digit=/^(?:Digit|Numpad)([1-7])$/.exec(event.code)?.[1] || (/^[1-7]$/.test(event.key)?event.key:null);
    const tab=event.altKey&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&digit;
    const settings=(event.ctrlKey||event.metaKey)&&!event.altKey&&!event.shiftKey&&(event.code==='Comma'||event.key===',');
    if(!tab&&!settings)return;
    event.preventDefault();event.stopImmediatePropagation();if(event.repeat)return;
    // Preserve unfinished modal edits. Settings itself is a dismissible panel.
    if(document.querySelector('dialog[open],.template-switch-dialog:not([hidden]),.preset-window:not([hidden])'))return;
    if(settings){if(document.getElementById('settingsWindow').hidden)document.getElementById('settingsToggle').click();return;}
    if(!document.getElementById('settingsWindow').hidden)document.getElementById('settingsClose').click();
    if(digit==='7'){document.getElementById('sidebarMiniPlayer').click();return;}
    const target=document.querySelector('[data-screen="'+tabs[Number(digit)-1]+'"]');
    for(const id of ['projectLibrary','automationScreen']){const panel=document.getElementById(id);if(panel)panel.hidden=true;}
    target?.click();
  },true);
})();
