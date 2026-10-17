const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('non-Windows media bridge returns safe results without starting PowerShell', async () => {
  const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  for (const platform of ['linux']) {
    const handlers = {};
    const context = vm.createContext({ process: { platform }, macNowPlaying: undefined, isVolumeWindow: () => true, ipcMain: {
      handle(name, callback) { assert(!handlers[name]); handlers[name] = callback; }
    }, spawn() { throw Error('Must not start Windows helpers'); } });
    vm.runInContext(source.slice(source.indexOf('let nowPlayingProcess = null;'), source.indexOf('let recordingFolder;')), context);
    vm.runInContext('setupNowPlaying()', context);
    assert.equal(await handlers['now-playing:get'](), null);
    assert.equal(await handlers['now-playing:control']({}, 'toggle'), false);
  }
});

test('Mac build configuration is valid and separates architecture artifacts', async () => {
  const config = require('../package.json').build;
  await require('app-builder-lib/out/util/config/config').validateConfiguration(config, { isEnabled: false });
  assert(config.mac.target.includes('zip'));
  assert(config.mac.target.includes('dmg'));
  assert(config.mac.artifactName.includes('${arch}'));
  assert(config.mac.extendInfo.NSAudioCaptureUsageDescription);
  assert(config.mac.extendInfo.NSAppleEventsUsageDescription);
  const preview = require('../build/mac-preview.cjs');
  await require('app-builder-lib/out/util/config/config').validateConfiguration(preview, { isEnabled: false });
  assert.equal(preview.extraMetadata.visualiserMacPreview, true);
  assert.equal(preview.mac.identity, '-');
  assert.equal(preview.publish, null);
  assert.notEqual(preview.appId, config.appId);
});

test('Mac packaging refuses cross-building with Windows native dependencies', { skip: process.platform === 'darwin' }, () => {
  const result = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '../build/mac-build.cjs')], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Build the Mac app on a Mac/);
});
