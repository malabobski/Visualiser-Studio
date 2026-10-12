(() => {
  const palettes = [
    { name: 'Northern lights', background: '#101922', colours: ['#78e1cb', '#78a9f4', '#c2a3ef', '#f0c9df'] },
    { name: 'Peach dusk', background: '#21151e', colours: ['#ffb18c', '#ed8cae', '#be9dec', '#f8dfb8'] },
    { name: 'Moon garden', background: '#141b20', colours: ['#b4d8bd', '#7bbcb7', '#afafe5', '#ede3bf'] },
    { name: 'Velvet night', background: '#171321', colours: ['#b99aff', '#e295cf', '#809de3', '#eed0f0'] },
    { name: 'Coastal blue', background: '#101c26', colours: ['#82c9ee', '#8de0d0', '#b3b4f0', '#e7d8ae'] }
  ];
  let previousPalette = -1;
  const button = document.createElement('button');
  button.id = 'surpriseLook';
  button.type = 'button';
  button.className = 'surprise-look';
  button.innerHTML = '<span aria-hidden="true">✦</span> Surprise me';
  button.title = 'Try a different style with a matching colour palette. Undo with Ctrl+Z.';
  const heading = document.querySelector('#styleMenu > p');
  const row = document.createElement('div');
  row.className = 'style-menu-heading';
  heading.before(row);
  row.append(heading, button);
  button.addEventListener('click', () => {
    if (exporting) { showToast('Finish your export before changing the look.'); return; }
    const cards = [...document.querySelectorAll('.style-card')].filter(card =>
      card.dataset.style !== $('style').value &&
      ($('settingAdvanced').checked || !ComplexStyles.names[card.dataset.style]));
    if (!cards.length) return;
    window.dispatchEvent(new Event('visualiser-look-changing'));
    const card = cards[Math.floor(Math.random() * cards.length)];
    const choices = palettes.map((_, index) => index).filter(index => index !== previousPalette);
    previousPalette = choices[Math.floor(Math.random() * choices.length)];
    const palette = palettes[previousPalette];
    const style = card.dataset.style;
    if (ComplexStyles.names[style]) {
      ComplexStyles.designs[style] = { ...ComplexStyles.getDesign(style), colours: [...palette.colours], customColours: true };
      try { localStorage.setItem('visualiserComplexDesigns', JSON.stringify(ComplexStyles.designs)); } catch {}
    }
    card.click();
    applyPickerColour('colour', palette.colours[0]);
    applyPickerColour('background', palette.background);
    bandHistory = undefined;
    previousEnergy = 0;
    window.dispatchEvent(new Event('visualiser-look-changed'));
    $('styleToggle').focus();
    showToast(palette.name + ' · ' + card.querySelector('.card-name').textContent + '. Ctrl+Z to undo.');
  });
})();
