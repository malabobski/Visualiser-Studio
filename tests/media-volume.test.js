const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const vm = require('node:vm');
const { MediaVolume } = require('../media-volume');

function fakeHelper() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
  child.commands = []; child.stdin.write = (line, done) => { child.commands.push(JSON.parse(line)); done(); };
  child.kill = () => { child.killed = true; };
  child.reply = (command, result) => child.stdout.emit('data', JSON.stringify({ id: command.id, result }) + '\n');
  return child;
}
test('volume service reuses its helper and correlates out-of-order replies', async () => {
  const child = fakeHelper(); let launches = 0;
  const service = new MediaVolume({ platform: 'win32', spawnProcess: (_cmd, _args, options) => { assert(options.windowsHide); launches++; return child; } });
  const system = service.request('system'), app = service.request('app', 'Spotify.exe', 35);
  assert.equal(launches, 1); assert.equal(child.commands[1].sourceAppId, 'Spotify.exe'); assert.equal(child.commands[1].value, 35);
  child.reply(child.commands[1], { available: true, value: 35 }); child.reply(child.commands[0], { available: true, value: 70 });
  assert.equal((await app).value, 35); assert.equal((await system).value, 70); service.stop(); assert(child.killed);
});
test('invalid, missing-app and unsupported requests never launch a helper', async () => {
  const service = new MediaVolume({ platform: 'win32', spawnProcess: () => { throw Error('Must not launch'); } });
  for (const args of [['other'], ['app'], ['system', '', NaN], ['system', '', -1], ['app', 'Spotify.exe', 101]]) assert.equal((await service.request(...args)).available, false);
  assert.equal((await new MediaVolume({ platform: 'darwin' }).request('system')).available, false);
});
test('helper failure resolves waiting sliders and allows a clean restart', async () => {
  const first = fakeHelper(), second = fakeHelper(); let launches = 0;
  const service = new MediaVolume({ platform: 'win32', spawnProcess: () => ++launches === 1 ? first : second });
  const pending = service.request('system'); first.emit('error', Error('Unavailable')); assert.equal((await pending).available, false);
  const next = service.request('system'); second.reply(second.commands[0], { available: true, value: 44 }); assert.equal((await next).value, 44);
  first.emit('close'); assert.equal(service.child, second); service.stop();
});
test('a stalled helper is stopped and pending requests are resolved', async () => {
  const child = fakeHelper(), service = new MediaVolume({ platform: 'win32', spawnProcess: () => child, timeout: 15 });
  assert.equal((await service.request('system')).available, false); assert(child.killed); assert.equal(service.pending.size, 0);
});
test('JSON replies survive pipe fragmentation and unavailable app volumes stay unavailable', async () => {
  const child = fakeHelper(), service = new MediaVolume({ platform: 'win32', spawnProcess: () => child });
  const request = service.request('app', 'Unknown.exe'); const json = JSON.stringify({ id: child.commands[0].id, result: { available: false, reason: 'No matching session' } });
  child.stdout.emit('data', json.slice(0, 12)); child.stdout.emit('data', json.slice(12) + '\n');
  const result = await request; assert.equal(result.available, false); assert.equal(result.reason, 'No matching session'); assert.equal(child.commands.length, 1); service.stop();
});
function handlers() {
  const source = fs.readFileSync(require('path').join(__dirname, '../main.js'), 'utf8');
  const listeners = {}, calls = [], mainWindow = { webContents: {} }, miniWindow = { webContents: {} };
  const box = { mainWindow, miniWindow, desktopSourceAppId: 'Spotify.exe', ipcMain: { handle: (id, handler) => listeners[id] = handler }, app: { on() {} }, mediaVolume: { request: async (...args) => { calls.push(args); return { available: true, value: 42 }; }, stop() {} } };
  const start=source.indexOf('const isVolumeWindow');
  vm.createContext(box); vm.runInContext(source.slice(start, source.indexOf("app.on('will-quit'",start)), box);
  return { listeners, box, calls, event: { sender: mainWindow.webContents } };
}
test('volume IPC accepts only the app windows and rejects stale app targets', async () => {
  const { listeners, event, calls, box } = handlers();
  assert.equal((await listeners['media-volume:set']({ sender: {} }, { target: 'system', value: 50 })).available, false);
  assert.equal((await listeners['media-volume:set'](event, { target: 'app', sourceAppId: 'Chrome', value: 50 })).available, false);
  assert.equal(calls.length, 0);
  assert.equal((await listeners['media-volume:set'](event, { target: 'app', sourceAppId: 'Spotify.exe', value: 50 })).available, true);
  assert.deepEqual(calls[0], ['app', 'Spotify.exe', 50]);
  box.desktopSourceAppId = ''; assert.equal((await listeners['media-volume:set'](event, { target: 'app', sourceAppId: '', value: 50 })).available, false);
});
test('a media source change during a read cannot return a stale app volume', async () => {
  const { listeners, event, box } = handlers(); let resolve;
  box.mediaVolume.request = () => new Promise(done => resolve = done);
  const pending = listeners['media-volume:get'](event, 'app'); box.desktopSourceAppId = 'Chrome'; resolve({ available: true, value: 42 });
  assert.equal((await pending).available, false);
});
test('native source matching distinguishes app identities without relying on media titles', { skip: process.platform !== 'win32' }, () => {
  const script = fs.readFileSync(require('path').join(__dirname, '../media-volume.ps1'), 'utf8');
  const start = script.indexOf("Add-Type -TypeDefinition @'"), end = script.indexOf("\n'@", start) + 3;
  const checks = script.slice(start, end) + `
    $cases = @(
      [VisualiserVolume.Audio]::Matches('Spotify.exe', 'C:\\Spotify\\Spotify.exe', ''),
      [VisualiserVolume.Audio]::Matches('Chrome.123', 'C:\\Chrome\\chrome.exe', ''),
      [VisualiserVolume.Audio]::Matches('package!Music', 'C:\\Music\\player.exe', 'package!Music'),
      -not [VisualiserVolume.Audio]::Matches('Spotify.exe', 'C:\\Chrome\\chrome.exe', ''),
      -not [VisualiserVolume.Audio]::Matches('notchrome.exe', 'C:\\Chrome\\chrome.exe', ''),
      -not [VisualiserVolume.Audio]::Matches('', 'C:\\Chrome\\chrome.exe', '')
    ); if ($cases -contains $false) { throw 'Incorrect app match' }; 'matched'
  `;
  const result = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Mta', '-Command', checks], { encoding: 'utf8', windowsHide: true });
  assert.match(result, /matched/);
});
