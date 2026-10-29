const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const { loadMiniPlayerBounds, rememberMiniPlayerBounds } = require('../mini-player-state');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-player-state-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'position.json');
  const area = { x: 0, y: 0, width: 1920, height: 1040 };
  const screen = { getDisplayMatching: () => ({ workArea: area }) };
  return { file, area, screen };
}

test('last compact size and position survive reopening', t => {
  const f = fixture(t), win = new EventEmitter();
  let bounds = { x: 1500, y: 900, width: 340, height: 104 };
  win.isDestroyed = win.isMinimized = () => false;
  win.getBounds = () => bounds;
  const pending = new Set();
  rememberMiniPlayerBounds(win, f.file, {
    schedule: callback => { pending.add(callback); return callback; },
    cancel: callback => pending.delete(callback),
  });
  win.emit('move');win.emit('resize');
  assert.equal(pending.size, 1);
  [...pending][0]();
  assert.deepEqual(loadMiniPlayerBounds(f.file, f.screen), bounds);
  bounds = { ...bounds, x: 100, y: 200, height: 400 };
  win.emit('move');win.emit('close');win.emit('closed');
  assert.deepEqual(loadMiniPlayerBounds(f.file, f.screen), bounds);
  assert.equal(pending.size, 0);
  assert.deepEqual(win.eventNames(), []);
});

test('missing or invalid preferences use the default placement', t => {
  const f = fixture(t);
  assert.deepEqual(loadMiniPlayerBounds(f.file, f.screen), {});
  for (const data of ['{broken', 'null', '{"x":0,"y":0}', '{"x":0,"y":0,"width":-1,"height":104}']) {
    fs.writeFileSync(f.file, data);
    assert.deepEqual(loadMiniPlayerBounds(f.file, f.screen), {});
  }
});

test('a disconnected monitor or smaller work area cannot strand the player', t => {
  const f = fixture(t);
  fs.writeFileSync(f.file, JSON.stringify({ x: -1800, y: 1100, width: 1600, height: 1200 }));
  Object.assign(f.area, { width: 1280, height: 720 });
  assert.deepEqual(loadMiniPlayerBounds(f.file, f.screen), { x: 0, y: 0, width: 1280, height: 720 });
});

test('negative coordinates on a connected left monitor are retained', t => {
  const f = fixture(t), bounds = { x: -1500, y: 100, width: 340, height: 104 };
  Object.assign(f.area, { x: -1920 });
  fs.writeFileSync(f.file, JSON.stringify(bounds));
  assert.deepEqual(loadMiniPlayerBounds(f.file, f.screen), bounds);
});
