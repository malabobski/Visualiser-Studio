const { createCanvas } = require('@napi-rs/canvas');
const FFT = require('fft.js');
const { spawn } = require('child_process');

const clamp = (n, min = 0, max = 1) => Math.max(min, Math.min(max, n));
function rgb(hex) { const n = parseInt(hex.replace('#', ''), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function rgba(hex, alpha = 1) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${alpha})`; }
function run(command, args, input) { return new Promise((resolve, reject) => { const p = spawn(command, args); const out = [], err = []; p.stdout.on('data', d => out.push(d)); p.stderr.on('data', d => err.push(d)); p.on('error', reject); p.on('close', code => code ? reject(new Error(Buffer.concat(err).toString().slice(-500))) : resolve(Buffer.concat(out))); if (input) p.stdin.end(input); }); }
function write(stream, buffer) { return stream.write(buffer) ? Promise.resolve() : new Promise(resolve => stream.once('drain', resolve)); }

// Mirrors app.js's styleParameters defaults (3rd entry per param). Keeping
// these in sync means an export always looks right even if the client sent
// no/partial/malformed params (older client, network hiccup, etc).
const DEFAULT_PARAMS = {
  bars: [.7, 96, .72],
  mirror: [.7, 96, .72],
  radial: [.16, .31, 3],
  wave: [.35, 4, 2],
  particles: [180, 1, 1],
  aurora: [.5, 1, .8],
  orbit: [.2, 110, 1],
  rings: [.047, 4, .04],
  spiral: [3, 2, 1],
  grid: [22, 10, .22],
  starburst: [.09, .34, 4],
  tunnel: [14, 1, 3],
};

function resolveParams(style, provided) {
  const defaults = DEFAULT_PARAMS[style] || DEFAULT_PARAMS.bars;
  const clean = Array.isArray(provided) ? provided : [];
  return defaults.map((fallback, i) => (typeof clean[i] === 'number' && Number.isFinite(clean[i]) ? clean[i] : fallback));
}

async function renderOffline(input, output, settings, onProgress, ffmpegBin = 'ffmpeg') {
  const sampleRate = 48000, fftSize = 4096, fps = settings.fps;
  const pcm = await run(ffmpegBin, ['-v', 'error', '-i', input, '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1']);
  const samples = new Float32Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.length / 4));
  const totalFrames = Math.max(1, Math.ceil(samples.length / sampleRate * fps));
  const canvas = createCanvas(settings.width, settings.height), ctx = canvas.getContext('2d');
  const fft = new FFT(fftSize), source = new Array(fftSize).fill(0), spectrum = fft.createComplexArray(), history = new Float32Array(112);
  // Sized to the top of the Density param's range (300) so every value in
  // that range has a real particle to draw, matching the live preview.
  const particles = Array.from({ length: 300 }, (_, i) => ({ x: (i * 37 % 157) / 157, y: (i * 91 % 151) / 151, s: .7 + i % 3, v: .04 + (i % 7) * .018 }));
  const style = settings.style;
  const [p0, p1, p2] = resolveParams(style, settings.params);
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
    const w = settings.width, h = settings.height, cx = w / 2, cy = h / 2, unit = Math.min(w, h), energyAvg = energy / values.length;
    ctx.fillStyle = settings.background; ctx.fillRect(0, 0, w, h);

    if (style === 'bars' || style === 'mirror') {
      const mirror = style === 'mirror', count = Math.max(1, Math.round(p1)), gap = w / count, heightScale = p0, gapScale = p2;
      for (let i = 0; i < count; i++) {
        const v = values[Math.floor(i / count * values.length)], barH = Math.max(3, v * h * heightScale), x = i * gap;
        ctx.fillStyle = rgba(settings.colour, .22 + v * .78);
        if (mirror) ctx.fillRect(x, cy - barH / 2, gap * gapScale, barH);
        else ctx.fillRect(x, h - barH, gap * gapScale, barH);
      }
    } else if (style === 'wave') {
      const amplitude = p0, thickness = p1, step = Math.max(1, Math.round(p2));
      ctx.strokeStyle = settings.colour; ctx.lineWidth = thickness; ctx.beginPath();
      for (let i = 0; i < w; i += step) {
        const sample = samples[Math.floor(centre - fftSize / 2 + i / w * fftSize)] || 0, y = cy + sample * h * amplitude * 2;
        i ? ctx.lineTo(i, y) : ctx.moveTo(i, y);
      }
      ctx.stroke();
    } else if (style === 'radial') {
      const core = p0, spread = p1, thickness = p2, radius = unit * core;
      for (let i = 0; i < 150; i++) {
        const a = i / 150 * Math.PI * 2, v = values[Math.floor(i / 150 * values.length)], length = radius + v * unit * spread;
        ctx.strokeStyle = rgba(settings.colour, .16 + v * .84); ctx.lineWidth = thickness;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius); ctx.lineTo(cx + Math.cos(a) * length, cy + Math.sin(a) * length); ctx.stroke();
      }
      ctx.fillStyle = rgba(settings.colour, .45 + energyAvg * .45);
      ctx.beginPath(); ctx.arc(cx, cy, radius * (.55 + energyAvg * .23), 0, Math.PI * 2); ctx.fill();
    } else if (style === 'orbit') {
      const baseRadius = p0, dotCount = Math.max(1, Math.round(p1)), dotSize = p2;
      for (let i = 0; i < dotCount; i++) {
        const a = i / dotCount * Math.PI * 2, v = values[Math.floor(i / dotCount * values.length)], radius = unit * (baseRadius + v * .24);
        ctx.fillStyle = rgba(settings.colour, .18 + v * .82);
        ctx.beginPath(); ctx.arc(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, Math.max(1, v * unit * .011 * dotSize), 0, Math.PI * 2); ctx.fill();
      }
      ctx.fillStyle = rgba(settings.colour, .7);
      ctx.beginPath(); ctx.arc(cx, cy, unit * .06 * (1 + energyAvg), 0, Math.PI * 2); ctx.fill();
    } else if (style === 'rings') {
      const spacing = p0, thickness = p1, pulse = p2;
      for (let i = 0; i < 8; i++) {
        const v = values[Math.floor(i / 8 * values.length)], radius = unit * (.07 + i * spacing + v * pulse);
        ctx.strokeStyle = rgba(settings.colour, .16 + v * .84); ctx.lineWidth = thickness;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.stroke();
      }
    } else if (style === 'particles') {
      const density = Math.max(1, Math.round(p0)), speedScale = p1, sizeScale = p2;
      particles.slice(0, density).forEach((particle, i) => {
        const v = values[i % values.length], speed = (.25 + v * 4.7) * speedScale;
        particle.y -= particle.v * speed;
        if (particle.y < 0) { particle.y = 1; particle.x = (particle.x + .618) % 1; }
        ctx.fillStyle = rgba(settings.colour, .16 + v * .84);
        ctx.beginPath(); ctx.arc(particle.x * w, particle.y * h, particle.s * sizeScale * (1 + v * 4), 0, Math.PI * 2); ctx.fill();
      });
    } else if (style === 'aurora') {
      const heightScale = p0, flow = p1, opacity = p2;
      ctx.beginPath();
      for (let i = 0; i < values.length; i++) {
        const x = i / (values.length - 1) * w, y = h * .68 - values[i] * h * heightScale;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
      const fill = ctx.createLinearGradient(0, 0, 0, h);
      fill.addColorStop(0, rgba(settings.colour, opacity)); fill.addColorStop(1, rgba(settings.colour, 0));
      ctx.fillStyle = fill; ctx.fill();
      ctx.strokeStyle = rgba(settings.colour, opacity); ctx.lineWidth = Math.max(2, w / 480 * flow);
      ctx.beginPath();
      for (let i = 0; i < values.length; i++) {
        const x = i / (values.length - 1) * w, y = h * .68 - values[i] * h * heightScale;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.stroke();
    } else if (style === 'spiral') {
      const arms = Math.max(1, Math.round(p0)), turns = p1, sizeScale = p2, points = 120;
      for (let arm = 0; arm < arms; arm++) {
        const armOffset = arm / arms * Math.PI * 2;
        for (let i = 0; i < points; i++) {
          const t = i / points, v = values[Math.floor(t * values.length)];
          const angle = t * turns * Math.PI * 2 + armOffset, radius = unit * .04 + t * unit * .46 * (.35 + v * .65);
          const x = cx + Math.cos(angle) * radius, y = cy + Math.sin(angle) * radius;
          ctx.fillStyle = rgba(settings.colour, .15 + v * .85);
          ctx.beginPath(); ctx.arc(x, y, Math.max(1, (1 + v * 3.5) * sizeScale * (unit * .006)), 0, Math.PI * 2); ctx.fill();
        }
      }
    } else if (style === 'grid') {
      const cols = Math.max(1, Math.round(p0)), rows = Math.max(1, Math.round(p1)), gapRatio = p2;
      const cellW = w / cols, cellH = h / rows;
      for (let c = 0; c < cols; c++) {
        const v = values[Math.floor(c / cols * values.length)], lit = Math.round(v * rows);
        for (let r = 0; r < rows; r++) {
          const on = r >= rows - lit, a = on ? .35 + (r - (rows - lit)) / Math.max(1, lit) * .65 : .06;
          ctx.fillStyle = rgba(settings.colour, a);
          const pad = Math.min(cellW, cellH) * gapRatio / 2;
          ctx.fillRect(c * cellW + pad, r * cellH + pad, cellW - pad * 2, cellH - pad * 2);
        }
      }
    } else if (style === 'starburst') {
      const core = unit * p0, lengthScale = p1, widthScale = p2, spikes = 72;
      for (let i = 0; i < spikes; i++) {
        const a = i / spikes * Math.PI * 2, v = values[Math.floor(i / spikes * values.length)];
        const outer = core + v * unit * lengthScale, halfWidth = (Math.PI / spikes) * widthScale * .5;
        ctx.fillStyle = rgba(settings.colour, .18 + v * .82);
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a - halfWidth) * core, cy + Math.sin(a - halfWidth) * core);
        ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer);
        ctx.lineTo(cx + Math.cos(a + halfWidth) * core, cy + Math.sin(a + halfWidth) * core);
        ctx.closePath();
        ctx.fill();
      }
      ctx.fillStyle = rgba(settings.colour, .5 + energyAvg * .4);
      ctx.beginPath(); ctx.arc(cx, cy, core * .6, 0, Math.PI * 2); ctx.fill();
    } else if (style === 'tunnel') {
      const count = Math.max(1, Math.round(p0)), depth = p1, thickness = p2;
      for (let i = 0; i < count; i++) {
        const t = i / count, v = values[Math.floor(t * values.length)];
        const size = unit * .04 + t * unit * .5 * depth + v * unit * .06;
        ctx.strokeStyle = rgba(settings.colour, .12 + v * .7 * (1 - t * .5));
        ctx.lineWidth = thickness;
        ctx.strokeRect(cx - size, cy - size, size * 2, size * 2);
      }
    } else {
      // Unknown/future style name: fall back to plain bars at default settings
      // rather than crashing the export.
      const count = 96, gap = w / count;
      for (let i = 0; i < count; i++) {
        const v = values[Math.floor(i / count * values.length)], barH = Math.max(3, v * h * .7);
        ctx.fillStyle = rgba(settings.colour, .22 + v * .78);
        ctx.fillRect(i * gap, h - barH, gap * .72, barH);
      }
    }

    const image = ctx.getImageData(0, 0, settings.width, settings.height); await write(encoder.stdin, Buffer.from(image.data.buffer));
    reportProgress(frame);
  }
  encoder.stdin.end(); await complete;
}
module.exports = { renderOffline };
