// Borderless games can raise themselves above other topmost Windows windows.
// Reassert the mini player's position without activating it or taking game input.
function keepMiniPlayerOnTop(win, {
  platform = process.platform,
  schedule = setInterval,
  cancel = clearInterval,
} = {}) {
  if (platform !== 'win32') return;

  let timer = null;
  const raise = () => {
    if (win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.moveTop();
  };
  const stop = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const start = () => {
    if (win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
    raise();
    if (timer === null) {
      timer = schedule(raise, 1000);
      timer.unref?.();
    }
  };

  win.setAlwaysOnTop(true, 'screen-saver');
  win.on('show', start);
  win.on('restore', start);
  win.on('blur', raise);
  win.on('hide', stop);
  win.on('minimize', stop);
  win.once('closed', () => {
    stop();
    win.removeListener('show', start);
    win.removeListener('restore', start);
    win.removeListener('blur', raise);
    win.removeListener('hide', stop);
    win.removeListener('minimize', stop);
  });
  start();
}

module.exports = { keepMiniPlayerOnTop };
