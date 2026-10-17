const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');

(async () => {
  assert.equal(process.platform, 'darwin', 'Verify the app on macOS');
  const folder = path.resolve('dist/mac-preview', process.arch === 'arm64' ? 'mac-arm64' : 'mac');
  const app = path.join(folder, 'Visualiser Studio Mac Preview.app');
  const resources = path.join(app, 'Contents/Resources');
  const asarPath = path.join(resources, 'app.asar');
  const asar = await import('@electron/asar');
  const metadata = JSON.parse(asar.extractFile(asarPath, 'package.json'));
  assert.equal(metadata.visualiserMacPreview, true);
  assert.equal(metadata.version, '1.2.9-mac.1');
  for (const file of ['main.js', 'mac-automation.js', 'mac-now-playing.js', 'mac-platform.js', 'mac-platform.css', 'index.html', 'mini-player.html']) {
    assert(asar.extractFile(asarPath, file).equals(fs.readFileSync(file)), 'Packaged file differs: ' + file);
  }
  for (const file of ['mac-media.jxa', 'mac-music-art.applescript']) {
    assert(fs.readFileSync(path.join(resources, 'app.asar.unpacked', file)).equals(fs.readFileSync(file)), 'Missing unpacked script: ' + file);
  }
  const plist = JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', path.join(app, 'Contents/Info.plist')], { encoding:'utf8' }));
  assert(plist.NSAudioCaptureUsageDescription);
  assert(plist.NSAppleEventsUsageDescription);
  assert.equal(plist.LSMinimumSystemVersion, '14.2');
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app], { stdio:'inherit' });
  const ffmpeg = path.join(resources, 'app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg');
  const architecture = execFileSync('/usr/bin/lipo', ['-archs', ffmpeg], { encoding:'utf8' });
  assert(architecture.includes(process.arch === 'x64' ? 'x86_64' : 'arm64'), 'Wrong FFmpeg architecture');
  assert.match(execFileSync(ffmpeg, ['-version'], { encoding:'utf8' }), /ffmpeg version/);
  // Load the packaged graphics library with the packaged Electron runtime,
  // rather than only proving the host's node_modules worked.
  const executable = path.join(app, 'Contents/MacOS', plist.CFBundleExecutable);
  const canvas = path.join(asarPath, 'node_modules/@napi-rs/canvas');
  const code = `const {createCanvas}=require(${JSON.stringify(canvas)});const canvas=createCanvas(64,64);canvas.getContext('2d').fillRect(0,0,64,64);if(canvas.toBuffer('image/png').length<50)throw Error('Canvas failed');console.log('Packaged native canvas passed')`;
  execFileSync(executable, ['-e', code], { env:{...process.env, ELECTRON_RUN_AS_NODE:'1'}, stdio:'inherit', timeout:30000 });
  console.log('Mac archive, signature, permissions, FFmpeg and native canvas verified for ' + process.arch);
})().catch(error => { console.error(error); process.exitCode = 1; });
