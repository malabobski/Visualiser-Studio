const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { keepMiniPlayerOnTop } = require('../mini-player-window');

function fixture(platform = 'win32') {
  const win = new EventEmitter();
  const state = { visible: false, minimized: false, destroyed: false };
  const calls = [];
  const timers = new Set();
  win.isDestroyed = () => state.destroyed;
  win.isVisible = () => state.visible;
  win.isMinimized = () => state.minimized;
  win.setAlwaysOnTop = (...args) => calls.push(args);
  win.moveTop = () => calls.push('raise');
  win.focus = win.show = win.showInactive = () => assert.fail('Must not activate or show the window');
  keepMiniPlayerOnTop(win, {
    platform,
    schedule(callback, delay) {
      assert.equal(delay, 1000);
      const timer = { callback, unref() {} };
      timers.add(timer);
      return timer;
    },
    cancel: timer => timers.delete(timer),
  });
  return { win, state, calls, timers, tick: () => { for (const timer of timers) timer.callback(); } };
}

test('visible mini player reasserts its position after a game takes focus', () => {
  const f = fixture();
  assert.equal(f.timers.size, 0);
  f.state.visible = true;
  f.win.emit('show');
  f.win.emit('blur');
  f.tick();
  assert.equal(f.calls.filter(call => call === 'raise').length, 3);
  assert.ok(f.calls.filter(Array.isArray).every(call => call[0] === true && call[1] === 'screen-saver'));
  f.win.emit('show');
  assert.equal(f.timers.size, 1);
});

test('hiding and minimizing stop promotion; restoring restarts it once', () => {
  const f = fixture();
  f.state.visible = true;
  f.win.emit('show');
  f.state.visible = false;
  f.win.emit('hide');
  const count = f.calls.length;
  f.win.emit('blur');
  f.tick();
  assert.equal(f.calls.length, count);
  assert.equal(f.timers.size, 0);
  f.state.visible = true;
  f.win.emit('show');
  f.state.minimized = true;
  f.win.emit('minimize');
  assert.equal(f.timers.size, 0);
  f.state.minimized = false;
  f.win.emit('restore');
  f.win.emit('show');
  assert.equal(f.timers.size, 1);
});

test('closing releases the timer and pending callbacks cannot use a destroyed window', () => {
  const f = fixture();
  f.state.visible = true;
  f.win.emit('show');
  const pending = [...f.timers][0].callback;
  f.state.destroyed = true;
  f.win.emit('closed');
  const count = f.calls.length;
  pending();
  assert.equal(f.calls.length, count);
  assert.equal(f.timers.size, 0);
  assert.deepEqual(f.win.eventNames(), []);
});

test('other platforms retain their existing window behaviour', () => {
  for (const platform of ['darwin', 'linux']) {
    const f = fixture(platform);
    f.state.visible = true;
    f.win.emit('show');
    assert.deepEqual(f.calls, []);
    assert.equal(f.timers.size, 0);
    assert.deepEqual(f.win.eventNames(), []);
  }
});
