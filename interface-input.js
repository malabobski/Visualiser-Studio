// Tab belongs to the app's view shortcuts, rather than browser focus traversal.
window.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  event.preventDefault();
  if (event.repeat) event.stopImmediatePropagation();
}, true);

// Native image dragging can swallow pointer release and strand player controls.
document.addEventListener('dragstart', event => {
  if (event.target.closest?.('img,.media-art,.mini-art')) event.preventDefault();
}, true);
