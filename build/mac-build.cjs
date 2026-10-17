// Build on the target architecture so ffmpeg-static and canvas match the app.
if (process.platform !== 'darwin') {
  console.error('Build the Mac app on a Mac. This keeps FFmpeg and the graphics library compatible with the installer.');
  process.exitCode = 1;
} else {
  const { spawnSync } = require('node:child_process');
  const path = require('node:path');
  const builder = require.resolve('electron-builder/cli.js');
  const preview = process.argv.includes('--preview');
  const result = spawnSync(process.execPath, [builder, '--mac', '--' + process.arch, '--publish', 'never',
    ...(preview ? ['--config', 'build/mac-preview.cjs'] : [])], {
    cwd: path.resolve(__dirname, '..'), stdio: 'inherit'
  });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
