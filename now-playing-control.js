const path = require('path');
const { spawn } = require('child_process');

// Keep WinRT ready between clicks; launching PowerShell per click adds latency.
class NowPlayingControl {
  constructor({ spawnProcess = spawn, timeout = 10000 } = {}) {
    this.spawnProcess = spawnProcess;
    this.timeout = timeout;
    this.pending = new Map();
    this.serial = 0;
  }
  start() {
    if (this.child) return;
    const script = path.join(__dirname, 'now-playing.ps1').replace('app.asar', 'app.asar.unpacked');
    try {
      const child = this.spawnProcess('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-ControlServer'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      this.child = child;
      let buffer = '';
      child.stdout.on('data', chunk => {
        if (this.child !== child) return;
        buffer += chunk.toString();
        const lines = buffer.split('\n'); buffer = lines.pop();
        for (const line of lines) {
          try {
            const reply = JSON.parse(line), entry = this.pending.get(reply.id);
            if (!entry) continue;
            this.pending.delete(reply.id); clearTimeout(entry.timer);
            entry.resolve(reply.result === true);
          } catch { /* Only complete JSON replies are commands. */ }
        }
      });
      child.stdin.on('error', () => this.stop(child));
      child.stderr.on('data', () => {});
      child.on('error', () => this.stop(child));
      child.on('close', () => this.stop(child));
    } catch { this.child = null; }
  }
  request(action, position) {
    if (!['toggle', 'previous', 'next', 'seek'].includes(action)) return Promise.resolve(false);
    if (action === 'seek' && (!Number.isFinite(position) || position < 0)) return Promise.resolve(false);
    this.start();
    const child = this.child;
    if (!child) return Promise.resolve(false);
    const id = ++this.serial;
    return new Promise(resolve => {
      const timer = setTimeout(() => this.stop(child), this.timeout);
      this.pending.set(id, { resolve, timer });
      const command = { id, action };
      if (action === 'seek') command.position = position;
      try {
        child.stdin.write(JSON.stringify(command) + '\n', error => { if (error) this.stop(child); });
      } catch { this.stop(child); }
    });
  }
  stop(child = this.child) {
    if (child !== this.child) return;
    this.child = null;
    for (const entry of this.pending.values()) { clearTimeout(entry.timer); entry.resolve(false); }
    this.pending.clear();
    if (child) child.kill();
  }
}

module.exports = { NowPlayingControl };
