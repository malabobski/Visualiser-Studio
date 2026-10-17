const allowedApps = ['auto', 'com.spotify.client', 'com.apple.Music'];

class MacNowPlaying {
  constructor({ automation, onChange, fetchArtwork = fetch, interval = 1500 }) {
    this.automation = automation;
    this.onChange = onChange;
    this.fetchArtwork = fetchArtwork;
    this.interval = interval;
    this.preferred = 'auto';
    this.reason = '';
    this.media = null;
    this.artKey = '';
    this.artwork = '';
    this.artworkAbort = null;
  }
  start(preferred = 'auto') {
    this.setPreferred(preferred);
    this.stopped = false;
    this.poll();
  }
  setPreferred(preferred) {
    if (!allowedApps.includes(preferred)) return false;
    this.preferred = preferred;
    this.generation = (this.generation || 0) + 1;
    this.media = null;
    this.artworkAbort?.abort();
    this.onChange(null);
    return true;
  }
  async readArtwork(media) {
    const key = media.sourceAppId + ':' + media.trackId + ':' + media.artworkUrl;
    if (key === this.artKey) return this.artwork;
    this.artKey = key;
    this.artwork = '';
    if (media.sourceAppId === 'com.apple.Music') {
      this.artwork = await this.automation.musicArtwork();
      return this.artwork;
    }
    // Spotify track artwork is served by its CDN. Do not fetch arbitrary URLs
    // or redirects supplied by another process.
    let url;
    try { url = new URL(media.artworkUrl); } catch { return ''; }
    if (url.protocol !== 'https:' || !['i.scdn.co', 'mosaic.scdn.co'].includes(url.hostname) || url.port || url.username || url.password) return '';
    const controller = new AbortController();
    this.artworkAbort = controller;
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      const response = await this.fetchArtwork(url.href, { signal: controller.signal, redirect: 'error' });
      const type = (response.headers.get('content-type') || '').split(';')[0];
      if (!response.ok || !['image/jpeg', 'image/png', 'image/webp'].includes(type)) return '';
      const reader = response.body.getReader(), chunks = [];
      let length = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.byteLength;
          if (length > 4 * 1024 * 1024) { controller.abort(); return ''; }
          chunks.push(Buffer.from(value));
        }
      } finally { reader.releaseLock(); }
      this.artwork = 'data:' + type + ';base64,' + Buffer.concat(chunks).toString('base64');
      return this.artwork;
    } catch { return ''; }
    finally { clearTimeout(timer); if (this.artworkAbort === controller) this.artworkAbort = null; }
  }
  async poll() {
    if (this.stopped || this.polling) return;
    this.polling = true;
    const generation = this.generation;
    try {
      const result = await this.automation.run('poll', { preferred: this.preferred, previous: this.media?.sourceAppId || '' });
      if (this.stopped || generation !== this.generation) return;
      this.reason = result.reason || '';
      const media = result.ok && result.media?.title ? result.media : null;
      if (media) media.artwork = await this.readArtwork(media);
      if (this.stopped || generation !== this.generation) return;
      this.media = media;
      this.onChange(media);
    } catch {
      if (!this.stopped && generation === this.generation) {
        this.reason = 'Mac media controls are unavailable. Check Automation permissions.'; this.media = null; this.onChange(null);
      }
    }
    finally {
      this.polling = false;
      if (!this.stopped) {
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.poll(), this.interval);
        this.timer.unref?.();
      }
    }
  }
  async control(action, position) {
    if (!this.media || !['toggle', 'next', 'previous', 'seek'].includes(action)) return false;
    if (action === 'seek' && (!Number.isFinite(position) || position < 0)) return false;
    const result = await this.automation.run('control', { sourceAppId: this.media.sourceAppId, action, position });
    return result.ok === true;
  }
  stop() { this.stopped = true; clearTimeout(this.timer); this.artworkAbort?.abort(); }
}

module.exports = { MacNowPlaying, allowedApps };
