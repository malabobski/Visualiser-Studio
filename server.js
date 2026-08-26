const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const { renderOffline } = require('./offline-renderer');

const root = __dirname;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function send(res, status, content, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(content);
}

function sendSseEvent(res, event, data) {
  if (res.writableEnded || res.destroyed) return;
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

async function convert(req, res, fps = 30, ffmpegBin = 'ffmpeg') {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'visualiser-'));
  const input = path.join(temp, 'recording.webm');
  const output = path.join(temp, 'visualiser.webm');
  const parts = [];
  let size = 0;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > 2 * 1024 * 1024 * 1024) { req.destroy(); return; }
    parts.push(chunk);
  });
  req.on('end', async () => {
    try {
      await fsp.writeFile(input, Buffer.concat(parts));
      const ffmpeg = spawn(ffmpegBin, ['-y', '-i', input, '-r', String(fps), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-f', 'webm', output]);
      let error = '';
      ffmpeg.stderr.on('data', (data) => { error += data; });
      ffmpeg.on('error', async (err) => {
        await fsp.rm(temp, { recursive: true, force: true });
        send(res, 500, `FFmpeg could not start. Install FFmpeg and restart the app. (${err.message})`);
      });
      ffmpeg.on('close', async (code) => {
        if (code !== 0) {
          await fsp.rm(temp, { recursive: true, force: true });
          return send(res, 500, `Video conversion failed. ${error.slice(-500)}`);
        }
        const stat = await fsp.stat(output);
        res.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': stat.size, 'Content-Disposition': 'attachment; filename="audio-visualiser.webm"' });
        const stream = fs.createReadStream(output);
        stream.pipe(res);
        stream.on('close', () => fsp.rm(temp, { recursive: true, force: true }));
      });
    } catch (err) {
      await fsp.rm(temp, { recursive: true, force: true });
      send(res, 500, err.message);
    }
  });
}

async function renderFromAudio(req, res, settings, ffmpegBin = 'ffmpeg') {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'visualiser-render-'));
  const input = path.join(temp, 'source-audio');
  const output = path.join(temp, 'visualiser.webm');
  const parts = []; let size = 0;
  req.on('data', (chunk) => { size += chunk.length; if (size > 2 * 1024 * 1024 * 1024) { req.destroy(); return; } parts.push(chunk); });
  req.on('end', async () => {
    try {
      await fsp.writeFile(input, Buffer.concat(parts));
      const colour = /^#[0-9a-f]{6}$/i.test(settings.colour) ? settings.colour.slice(1) : '9c6bff';
      const [width, height] = /^\d+x\d+$/.test(settings.size) ? settings.size.split('x').map(Number) : [1280, 720];
      const fps = [24, 30, 60].includes(settings.fps) ? settings.fps : 30;
      const waveform = settings.style === 'wave' || settings.style === 'aurora';
      const filter = waveform ? `showwaves=s=${width}x${height}:mode=cline:colors=0x${colour}` : `showfreqs=s=${width}x${height}:mode=bar:ascale=log:fscale=log:colors=0x${colour}`;
      const ffmpeg = spawn(ffmpegBin, ['-y', '-i', input, '-filter_complex', `[0:a]${filter}[v]`, '-map', '[v]', '-map', '0:a', '-r', String(fps), '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-f', 'webm', output]);
      let error = '';
      ffmpeg.stderr.on('data', (data) => { error += data; });
      ffmpeg.on('error', async (err) => { await fsp.rm(temp, { recursive: true, force: true }); send(res, 500, `FFmpeg could not start. (${err.message})`); });
      ffmpeg.on('close', async (code) => {
        if (code !== 0) { await fsp.rm(temp, { recursive: true, force: true }); return send(res, 500, `Video render failed. ${error.slice(-500)}`); }
        const stat = await fsp.stat(output); res.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': stat.size, 'Content-Disposition': 'attachment; filename="audio-visualiser.webm"' });
        fs.createReadStream(output).pipe(res).on('close', () => fsp.rm(temp, { recursive: true, force: true }));
      });
    } catch (err) { await fsp.rm(temp, { recursive: true, force: true }); send(res, 500, err.message); }
  });
}

async function renderExact(req, res, settings, ffmpegBin = 'ffmpeg') {
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'visualiser-offline-'));
  const input = path.join(temp, 'source-audio'), output = path.join(temp, 'visualiser.webm'), parts = [];
  const sendProgress = (progress) => sendSseEvent(res, 'progress', { percent: progress.percent, frame: progress.frame, totalFrames: progress.totalFrames });
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  let size = 0;
  req.on('data', chunk => { size += chunk.length; if (size > 2 * 1024 * 1024 * 1024) { req.destroy(); return; } parts.push(chunk); });
  req.on('end', async () => {
    try {
      await fsp.writeFile(input, Buffer.concat(parts));
      const [width, height] = /^\d+x\d+$/.test(settings.size) ? settings.size.split('x').map(Number) : [1280, 720];
      let params = [];
      try {
        const parsed = JSON.parse(settings.params || '[]');
        if (Array.isArray(parsed)) params = parsed.filter((n) => typeof n === 'number' && Number.isFinite(n));
      } catch { /* malformed/missing params — offline-renderer falls back to defaults */ }
      await renderOffline(input, output, { width, height, fps: [24, 30, 60].includes(settings.fps) ? settings.fps : 30, style: settings.style, colour: /^#[0-9a-f]{6}$/i.test(settings.colour) ? settings.colour : '#9c6bff', background: /^#[0-9a-f]{6}$/i.test(settings.background) ? settings.background : '#11121a', params }, sendProgress, ffmpegBin);
      sendSseEvent(res, 'complete', { output });
    } catch (err) {
      sendSseEvent(res, 'error', { message: `Offline render failed. ${err.message}` });
      await fsp.rm(temp, { recursive: true, force: true }).catch(() => {});
    } finally {
      res.end();
    }
  });
}

async function serveDownload(req, res, requestedFile) {
  const safeBase = path.resolve(os.tmpdir());
  const resolved = path.resolve(requestedFile);
  if (!resolved.startsWith(safeBase)) return send(res, 403, 'Forbidden');
  try {
    const stat = await fsp.stat(resolved);
    res.writeHead(200, { 'Content-Type': 'video/webm', 'Content-Length': stat.size, 'Content-Disposition': 'attachment; filename="audio-visualiser.webm"' });
    const stream = fs.createReadStream(resolved);
    stream.pipe(res);
    stream.on('close', () => fsp.rm(path.dirname(resolved), { recursive: true, force: true }).catch(() => {}));
  } catch {
    send(res, 404, 'Not found');
  }
}

// Builds and starts the server. ffmpegBin lets the caller (Electron, or you
// running this file directly) say exactly which ffmpeg program to use.
// If nothing is given, it falls back to whatever "ffmpeg" resolves to on the
// system's PATH, which is how the app worked before.
function startServer({ port = 3000, ffmpegBin = 'ffmpeg' } = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const requestUrl = new URL(req.url, 'http://localhost');
      if (req.method === 'POST' && requestUrl.pathname === '/convert') {
        const requestedFps = Number(requestUrl.searchParams.get('fps'));
        return convert(req, res, [24, 30, 60].includes(requestedFps) ? requestedFps : 30, ffmpegBin);
      }
      if (req.method === 'POST' && requestUrl.pathname === '/render') return renderExact(req, res, { style: requestUrl.searchParams.get('style') || 'bars', colour: requestUrl.searchParams.get('colour') || '#9c6bff', background: requestUrl.searchParams.get('background') || '#11121a', size: requestUrl.searchParams.get('size') || '1280x720', fps: Number(requestUrl.searchParams.get('fps')), params: requestUrl.searchParams.get('params') || '[]' }, ffmpegBin);
      if (req.method === 'GET' && requestUrl.pathname === '/download') return serveDownload(req, res, requestUrl.searchParams.get('file'));
      if (req.method !== 'GET') return send(res, 405, 'Method not allowed');
      const requested = req.url === '/' ? '/index.html' : req.url;
      const file = path.resolve(root, `.${requested.split('?')[0]}`);
      if (!file.startsWith(root)) return send(res, 403, 'Forbidden');
      try { send(res, 200, await fsp.readFile(file), mime[path.extname(file)] || 'application/octet-stream'); }
      catch { send(res, 404, 'Not found'); }
    });
    // If the requested port is already taken by something else (not a second
    // copy of this app, which is blocked separately in main.js), try the next
    // few ports rather than crashing the whole app with EADDRINUSE.
    const maxAttempts = 10;
    let attempt = 0;
    let currentPort = port;
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && attempt < maxAttempts) {
        attempt += 1;
        currentPort += 1;
        server.listen(currentPort);
        return;
      }
      reject(err);
    });
    server.listen(currentPort, () => {
      console.log(`Audio Visualiser Studio is ready at http://localhost:${currentPort}`);
      resolve({ server, port: currentPort });
    });
  });
}

// Running this file directly (e.g. `npm start`) still works exactly like
// before, using whatever "ffmpeg" is on your system PATH.
if (require.main === module) {
  startServer({ port: 3000, ffmpegBin: 'ffmpeg' });
}

module.exports = { startServer };
