const { EventEmitter } = require('events');

// Updater state is owned by the main process. Ordinary exits never install updates.
class UpdateService extends EventEmitter {
  constructor({ updater, version, enabled, savePreference = async () => {}, onInstall = () => {}, onInstallError = () => {}, inspectLatestVersion }) {
    super();
    this.updater = updater; this.enabled = enabled; this.savePreference = savePreference;
    this.inspectLatestVersion = inspectLatestVersion;
    this.onInstall = onInstall; this.onInstallError = onInstallError;
    this.state = { status: enabled ? 'idle' : 'development', currentVersion: version, version: '', progress: 0, automatic: true, lastChecked: null, message: enabled ? 'Updates will be checked quietly in the background.' : 'Automatic updates are available in the installed app.' };
    this.handlers = [];
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    const listen = (name, handler) => { updater.on(name, handler); this.handlers.push([name, handler]); };
    listen('checking-for-update', () => this.set({ status: 'checking', message: 'Checking for updates…', progress: 0 }));
    listen('update-available', info => this.set({ status: 'downloading', version: String(info.version).slice(0,64), progress: 0, message: 'Downloading a fresh version in the background.' }));
    listen('update-not-available', () => this.set({ status: 'current', version: '', progress: 0, lastChecked: Date.now(), message: 'You’re up to date.' }));
    listen('download-progress', progress => this.set({ status: 'downloading', progress: Number.isFinite(progress.percent) ? Math.max(0,Math.min(100,progress.percent)) : 0 }));
    listen('update-downloaded', info => this.set({ status: 'ready', version: String(info.version).slice(0,64), progress: 100, lastChecked: Date.now(), message: 'Your update is ready. Restart whenever it suits you.' }));
    listen('error', error => this.fail(error));
  }
  snapshot() { return { ...this.state }; }
  set(change) { Object.assign(this.state,change); this.emit('change',this.snapshot()); }
  fail(error) {
    const installing = this.state.status === 'installing';
    const noRelease = /404|No published versions|Cannot find latest|Cannot find channel|latest\.yml.*not found/i.test(error?.message || '');
    this.set({ status: 'error', message: installing ? 'The update could not be installed. Check again to retry.' : noRelease ? 'No update files are published yet. Try again after the next release.' : 'Couldn’t get the update. Check your connection and try again.' });
    if (installing) this.onInstallError();
  }
  async check() {
    if (!this.enabled) {
      if (!this.inspectLatestVersion) return this.snapshot();
      if (this.checking) return this.checking;
      this.set({ status: 'checking', message: 'Checking for updates…' });
      this.checking = Promise.resolve().then(() => this.inspectLatestVersion()).then(version => {
        const latest = String(version).replace(/^v/, '');
        if (!/^\d+\.\d+\.\d+$/.test(latest)) throw Error('Invalid release version');
        const a = latest.split('.').map(Number), b = this.state.currentVersion.split('.').map(Number);
        const difference = a.map((value,index) => value - b[index]).find(value => value !== 0) || 0;
        this.set({ status: 'development', version: latest, lastChecked: Date.now(), message: difference > 0 ? 'v'+latest+' is available on GitHub. Install the desktop app to receive automatic updates.' : 'You’re up to date. Automatic installation is available in the installed app.' });
        return this.snapshot();
      }).catch(() => {
        this.set({ status: 'development', message: 'Couldn’t check GitHub. Check your connection and try again.' });
        return this.snapshot();
      }).finally(() => { this.checking = null; });
      return this.checking;
    }
    if (['downloading','ready','installing'].includes(this.state.status)) return this.snapshot();
    if (this.checking) return this.checking;
    this.set({ status: 'checking', message: 'Checking for updates…' });
    this.checking = Promise.resolve().then(() => this.updater.checkForUpdates()).then(result => {
      // The download runs after the check returns; always handle its rejection.
      result?.downloadPromise?.catch(error => this.fail(error));
      if (this.state.status === 'checking') this.set({ status: 'current', lastChecked: Date.now(), message: 'You’re up to date.' });
      return this.snapshot();
    }).catch(error => { this.fail(error); return this.snapshot(); }).finally(() => { this.checking = null; });
    return this.checking;
  }
  async setAutomatic(value) {
    if (typeof value !== 'boolean') throw Error('Invalid update preference.');
    await this.savePreference(value); this.set({ automatic: value });
    if (value && this.enabled && this.started) this.check();
    return this.snapshot();
  }
  start(automatic = true) {
    if (this.started) return; this.started = true; this.set({ automatic: automatic !== false });
    if (!this.enabled) return;
    this.startTimer = setTimeout(() => { if (this.state.automatic) this.check(); },8000);
    this.interval = setInterval(() => { if (this.state.automatic) this.check(); },6*60*60*1000);
    this.startTimer.unref?.(); this.interval.unref?.();
  }
  install() {
    if (!this.enabled || this.state.status !== 'ready') return { ok: false, message: 'Download an update before restarting.' };
    this.set({ status: 'installing', message: 'Restarting to install your update…' });
    try { this.onInstall(); this.updater.quitAndInstall(true,true); }
    catch (error) { this.fail(error); }
    return { ok: this.state.status === 'installing', message: this.state.message };
  }
  dispose() {
    clearTimeout(this.startTimer); clearInterval(this.interval);
    for (const [name,handler] of this.handlers) this.updater.removeListener(name,handler);
  }
}

module.exports = { UpdateService };
