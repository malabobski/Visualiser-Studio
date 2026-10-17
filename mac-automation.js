const { execFile } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
const os = require('node:os');

// Arguments are passed to osascript as data, never interpolated into script text.
class MacAutomation {
  constructor({ execute = execFile, timeout = 12000 } = {}) {
    this.execute = execute;
    this.timeout = timeout;
    this.children = new Set();
    this.stopped = false;
  }
  run(operation, args = {}) {
    if (this.stopped) return Promise.resolve({ ok: false, reason: 'Media controls have stopped.' });
    return new Promise(resolve => {
      let child, completed = false;
      const done = (error, output) => {
        completed = true;
        this.children.delete(child);
        if (error) return resolve({ ok: false, reason: /1743|not authorized|not permitted/i.test(error.stderr || error.message || '')
          ? 'Allow Visualiser Studio in System Settings → Privacy & Security → Automation.'
          : 'Mac media controls are unavailable. Check Automation permissions.' });
        try { resolve(JSON.parse(output)); }
        catch { resolve({ ok: false, reason: 'The media app returned an unreadable response.' }); }
      };
      try {
        const artwork = operation === 'music-artwork';
        const script = path.join(__dirname, artwork ? 'mac-music-art.applescript' : 'mac-media.jxa').replace('app.asar', 'app.asar.unpacked');
        const parameters = artwork ? [script, args.file] : ['-l', 'JavaScript', script, operation, JSON.stringify(args)];
        child = this.execute('/usr/bin/osascript', parameters,
          { encoding: 'utf8', timeout: this.timeout, maxBuffer: 6 * 1024 * 1024 }, done);
        if (!completed && child) this.children.add(child);
      } catch (error) { done(error); }
    });
  }
  async musicArtwork() {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'visualiser-mac-art-'));
    try {
      const file = path.join(folder, 'cover');
      if (await this.run('music-artwork', { file }) !== true) return '';
      const info = await fs.stat(file);
      if (info.size > 4 * 1024 * 1024) return '';
      const data = await fs.readFile(file);
      const png = data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const jpeg = data[0] === 255 && data[1] === 216;
      return png || jpeg ? 'data:image/' + (png ? 'png' : 'jpeg') + ';base64,' + data.toString('base64') : '';
    } catch { return ''; }
    finally { await fs.rm(folder, { recursive: true, force: true }); }
  }
  stop() {
    this.stopped = true;
    for (const child of this.children) child.kill();
    this.children.clear();
  }
}

module.exports = { MacAutomation };
