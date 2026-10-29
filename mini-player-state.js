const fs = require('node:fs');
const path = require('node:path');

function validBounds(bounds) {
  return bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])) &&
    Math.abs(bounds.x) < 2147483647 && Math.abs(bounds.y) < 2147483647 &&
    bounds.width > 0 && bounds.height > 0;
}

function loadMiniPlayerBounds(file, screen) {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!validBounds(saved)) return {};
    const bounds = Object.fromEntries(Object.entries(saved).filter(([key]) => ['x', 'y', 'width', 'height'].includes(key)).map(([key, value]) => [key, Math.round(value)]));
    bounds.width = Math.max(280, Math.min(1800, bounds.width));
    bounds.height = Math.max(104, Math.min(1400, bounds.height));
    const area = screen.getDisplayMatching(bounds).workArea;
    bounds.width = Math.min(bounds.width, area.width);
    bounds.height = Math.min(bounds.height, area.height);
    bounds.x = Math.max(area.x, Math.min(bounds.x, area.x + area.width - bounds.width));
    bounds.y = Math.max(area.y, Math.min(bounds.y, area.y + area.height - bounds.height));
    return bounds;
  } catch {
    return {};
  }
}

function rememberMiniPlayerBounds(win, file, { schedule = setTimeout, cancel = clearTimeout } = {}) {
  let timer = null;
  let lastSaved = '';
  const clear = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const save = () => {
    clear();
    if (win.isDestroyed() || win.isMinimized()) return;
    const bounds = win.getBounds();
    if (!validBounds(bounds)) return;
    const data = JSON.stringify(bounds);
    if (data === lastSaved) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', data);
      fs.renameSync(file + '.tmp', file);
      lastSaved = data;
    } catch (error) {
      console.warn('[mini-player] Could not save window position:', error.message);
    }
  };
  const queue = () => {
    clear();
    timer = schedule(save, 250);
    timer.unref?.();
  };
  win.on('move', queue);
  win.on('resize', queue);
  // Flush synchronously while the native window still exists, including app quit.
  win.on('close', save);
  win.once('closed', () => {
    clear();
    win.removeListener('move', queue);
    win.removeListener('resize', queue);
    win.removeListener('close', save);
  });
}

module.exports = { loadMiniPlayerBounds, rememberMiniPlayerBounds };
