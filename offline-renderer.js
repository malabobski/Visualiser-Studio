const { createCanvas } = require('@napi-rs/canvas');
const FFT = require('fft.js');
const { spawn } = require('child_process');

const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
function rgb(hex) { const n = parseInt(hex.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function rgba(hex, alpha = 1) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${alpha})`; }
function run(command, args, input) { return new Promise((resolve, reject) => { const p = spawn(command, args); const out = [], err = []; p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => err.push(d)); p.on('error', reject); p.on('close', code => code ? reject(new Error(Buffer.concat(err).toString().slice(-500))) : resolve(Buffer.concat(out))); if (input) p.stdin.end(input); }); }
function write(stream, buffer) { return stream.write(buffer) ? Promise.resolve() : new Promise(resolve => stream.once('drain', resolve)); }

async function renderOffline(input, output, settings, onProgress, ffmpegBin = 'ffmpeg') {
  const sampleRate = 48000, fftSize = 4096, fps = settings.fps;
  const pcm = await run(ffmpegBin, ['-v', 'error', '-i', input, '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1']);
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));
  const totalFrames = Math.max(1, Math.ceil(samples.length / sampleRate * fps));
  const canvas = createCanvas(settings.width, settings.height), ctx = canvas.getContext('2d');
  const fft = new FFT(fftSize), source = new Array(fftSize).fill(0), spectrum = fft.createComplexArray(), history = new Float32Array(112);
  const particles = Array.from({ length: 160 }, (_, i) => ({ x: (i * 37 % 157) / 157, y: (i * 91 % 151) / 151, s: .7 + i % 3, v: .04 + (i % 7) * .018 }));
  // VP9 (video) + Opus (audio) inside a .webm file: a high-quality, royalty-free
  // pairing that doesn't require the GPL-only libx264 encoder.
  // "-crf 28 -b:v 0" tells VP9 to aim for a fixed quality level rather than a
  // fixed file size — lower crf numbers = higher quality + bigger files.
  const encoder = spawn(ffmpegBin, ['-y', '-v', 'error', '-f', 'rawvideo', '-pixel_format', 'rgba', '-video_size', `${settings.width}x${settings.height}`, '-framerate', String(fps), '-i', 'pipe:0', '-i', input, '-map', '0:v', '-map', '1:a?', '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '28', '-pix_fmt', 'yuv420p', '-c:a', 'libopus', '-shortest', '-f', 'webm', output]);
  let encoderError = ''; encoder.stderr.on('data', d => { encoderError += d; });
  const complete = new Promise((resolve, reject) => { encoder.on('error', reject); encoder.on('close', code => code ? reject(new Error(encoderError.slice(-500))) : resolve()); });
  const reportProgress = (frame) => {
    if (typeof onProgress === 'function') {
      const percent = Math.round((frame + 1) / totalFrames * 100);
      onProgress({ frame: frame + 1, totalFrames, percent });
    }
  };
  for (let frame = 0; frame < totalFrames; frame++) {
    const centre = Math.floor(frame * sampleRate / fps), start = centre - fftSize / 2;
    for (let i = 0; i < fftSize; i++) { const sample = samples[start + i] || 0; source[i] = sample * (.5 - .5 * Math.cos(Math.PI * 2 * i / (fftSize - 1))); }
    fft.realTransform(spectrum, source);
    const values = new Float32Array(112); let energy = 0;
    for (let band = 0; band < values.length; band++) {
      const low = 20 * Math.pow(20000 / 20, band / values.length), high = 20 * Math.pow(20000 / 20, (band + 1) / values.length);
      const a = Math.max(1, Math.floor(low / sampleRate * fftSize)), b = Math.min(fftSize / 2 - 1, Math.ceil(high / sampleRate * fftSize)); let peak = 0;
      for (let bin = a; bin <= b; bin++) peak = Math.max(peak, Math.hypot(spectrum[bin * 2], spectrum[bin * 2 + 1]));
      peak /= fftSize / 2;
      const base = Math.pow(clamp(Math.log10(1 + peak * 120) / 2.1), 1.45); const transient = Math.max(0, base - history[band]) * 1.25;
      values[band] = clamp(base + transient); history[band] = history[band] * .7 + base * .3; energy += values[band];
    }
    const w = settings.width, h = settings.height, cx = w / 2, cy = h / 2, unit = Math.min(w, h), average = energy / values.length;
    ctx.fillStyle = settings.background; ctx.fillRect(0, 0, w, h);
    const valueAt = i => values[Math.min(values.length - 1, Math.floor(i / 96 * values.length))];
    if (settings.style === 'wave') { ctx.strokeStyle = settings.colour; ctx.lineWidth = Math.max(3, w / 360); ctx.beginPath(); for (let i = 0; i < w; i += 2) { const sample = samples[Math.floor(centre - fftSize / 2 + i / w * fftSize)] || 0, y = cy + sample * h * .35; i ? ctx.lineTo(i, y) : ctx.moveTo(i, y); } ctx.stroke(); }
    else if (settings.style === 'radial' || settings.style === 'rings' || settings.style === 'orbit') { for (let i = 0; i < 112; i++) { const v = values[i], a = i / 112 * Math.PI * 2, radius = unit * (.16 + (settings.style === 'rings' ? i % 8 * .045 : 0)); ctx.strokeStyle = rgba(settings.colour, .2 + v * .8); ctx.lineWidth = Math.max(2, unit * .004); ctx.beginPath(); if (settings.style === 'rings') ctx.arc(cx, cy, radius + v * unit * .04, 0, Math.PI * 2); else { ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); ctx.lineTo(cx + Math.cos(a) * (radius + v * unit * .3), cy + Math.sin(a) * (radius + v * unit * .3)); } ctx.stroke(); } }
    else if (settings.style === 'particles') { particles.forEach((p, i) => { const v = values[i % values.length]; p.y -= p.v * (1 + v * 5); if (p.y < 0) { p.y = 1; p.x = (p.x + .618) % 1; } ctx.fillStyle = rgba(settings.colour, .2 + v * .8); ctx.beginPath(); ctx.arc(p.x * w, p.y * h, p.s * (1 + v * 4), 0, Math.PI * 2); ctx.fill(); }); }
    else if (settings.style === 'aurora') { ctx.beginPath(); for (let i = 0; i < values.length; i++) { const x = i / (values.length - 1) * w, y = h * .7 - values[i] * h * .5; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fillStyle = rgba(settings.colour, .8); ctx.fill(); }
    else { const mirror = settings.style === 'mirror'; for (let i = 0; i < 96; i++) { const v = valueAt(i), bh = Math.max(3, v * h * .64), x = i / 96 * w; ctx.fillStyle = rgba(settings.colour, .24 + v * .76); ctx.fillRect(x, mirror ? cy - bh / 2 : h - bh, w / 96 * .72, bh); } }
    const image = ctx.getImageData(0, 0, settings.width, settings.height); await write(encoder.stdin, Buffer.from(image.data.buffer));
    reportProgress(frame);
  }
  encoder.stdin.end(); await complete;
}
module.exports = { renderOffline };
