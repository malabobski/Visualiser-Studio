const path = require('path');
const { spawn } = require('child_process');

// One hidden helper handles slider updates, avoiding a PowerShell launch per tick.
class MediaVolume {
  constructor({ platform = process.platform, spawnProcess = spawn, timeout = 10000 } = {}) {
    this.platform = platform;
    this.spawnProcess = spawnProcess;
    this.timeout = timeout;
    this.pending = new Map();
    this.serial = 0;
  }
  unavailable(reason = 'Volume control is unavailable.') { return { available: false, reason }; }
  request(target, sourceAppId = '', value) {
    if (!['system', 'app'].includes(target)) return Promise.resolve(this.unavailable('Choose a volume target.'));
    if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 100)) return Promise.resolve(this.unavailable('Invalid volume.'));
    if (this.platform !== 'win32') return Promise.resolve(this.unavailable('Volume control is available on Windows.'));
    if (target === 'app' && !sourceAppId) return Promise.resolve(this.unavailable('Play something in a media app first.'));
    if (!this.child) this.start();
    const child = this.child;
    if (!child) return Promise.resolve(this.unavailable());
    const id = ++this.serial;
    return new Promise(resolve => {
      const timer = setTimeout(() => this.stop(child), this.timeout);
      this.pending.set(id, { resolve, timer });
      const command = { id, target, sourceAppId, operation: value === undefined ? 'get' : 'set' };
      if (value !== undefined) command.value = value;
      child.stdin.write(JSON.stringify(command) + '\n', error => { if (error) this.stop(child); });
    });
  }
  start() {
    let script = path.join(__dirname, 'media-volume.ps1').replace('app.asar', 'app.asar.unpacked');
    try {
      const child = this.spawnProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-Mta', '-ExecutionPolicy', 'Bypass', '-File', script], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      let buffer = '';
      child.stdout.on('data', chunk => {
        buffer += chunk.toString();
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
          try {
            const data = JSON.parse(line), entry = this.pending.get(data.id);
            if (!entry) continue;
            this.pending.delete(data.id); clearTimeout(entry.timer);
            const result = data.result;
            if (result?.available && Number.isFinite(result.value)) entry.resolve({ ...result, value: Math.max(0, Math.min(100, result.value)) });
            else entry.resolve(this.unavailable(result?.reason));
          } catch { /* Ignore startup diagnostics; only JSON replies are used. */ }
        }
      });
      child.stdin.on('error', () => this.stop(child));
      child.stderr.on('data', () => {});
      child.on('error', () => this.stop(child));
      child.on('close', () => this.stop(child));
    } catch { this.child = null; }
  }
  stop(child = this.child) {
    if (child !== this.child) return;
    this.child = null;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.resolve(this.unavailable()); }
    this.pending.clear();
    if (child) child.kill();
  }
}

module.exports = { MediaVolume };
