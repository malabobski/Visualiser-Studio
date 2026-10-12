(() => {
  const card = document.getElementById('nowPlayingCard');
  const row = document.createElement('div'); row.className = 'media-volume-row';
  row.innerHTML = '<label for="mediaVolume" class="media-volume-label">Volume</label><input id="mediaVolume" type="range" min="0" max="100" step="1" value="100" aria-label="System volume" disabled><output id="mediaVolumeValue" for="mediaVolume">—</output><details id="mediaOptions"><summary aria-label="Media player settings"></summary><div class="media-options-menu"><label>Volume slider<select id="mediaVolumeTarget"><option value="system">System volume</option><option value="app">Captured app volume</option></select></label><small id="mediaVolumeHint"></small></div></details>';
  card.append(row);
  row.addEventListener('keydown', event => { if ([' ', 'Enter', 'Tab'].includes(event.key)) event.stopPropagation(); });
  const gear = document.querySelector('#settingsToggle svg')?.cloneNode(true);
  if (gear) { gear.setAttribute('aria-hidden', 'true'); row.querySelector('summary').append(gear); }
  else row.querySelector('summary').textContent = '⚙';
  const control = MediaVolumeControl.mount({ slider: $('mediaVolume'), output: $('mediaVolumeValue'), select: $('mediaVolumeTarget'), hint: $('mediaVolumeHint'), getSource: () => desktopMedia, isActive: () => !card.hidden && !document.hidden, onNotice: showMediaNotice });
  window.nowPlaying?.onChange(() => { control.sourceChanged(); control.refresh(); });
  new MutationObserver(() => control.refresh()).observe(card, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('click', event => { if (!event.target.closest('#mediaOptions,.unified-menu')) $('mediaOptions').open = false; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') $('mediaOptions').open = false; });
  document.addEventListener('fullscreenchange', () => { $('mediaOptions').open = false; control.refresh(); });
})();
