// Generate NSIS bitmap branding from the app's existing logo and canvas shapes.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

function writeBmp(canvas, filename) {
  const { width, height } = canvas;
  const rgba = canvas.getContext('2d').getImageData(0, 0, width, height).data;
  const stride = Math.ceil(width * 3 / 4) * 4;
  const bmp = Buffer.alloc(54 + stride * height);
  bmp.write('BM'); bmp.writeUInt32LE(bmp.length, 2); bmp.writeUInt32LE(54, 10);
  bmp.writeUInt32LE(40, 14); bmp.writeInt32LE(width, 18); bmp.writeInt32LE(height, 22);
  bmp.writeUInt16LE(1, 26); bmp.writeUInt16LE(24, 28); bmp.writeUInt32LE(stride * height, 34);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const pixel = (y * width + x) * 4;
    const target = 54 + (height - 1 - y) * stride + x * 3;
    bmp[target] = rgba[pixel + 2]; bmp[target + 1] = rgba[pixel + 1]; bmp[target + 2] = rgba[pixel];
  }
  fs.writeFileSync(path.join(__dirname, filename), bmp);
}

(async () => {
  const logo = await loadImage(path.join(__dirname, 'icon.png'));
  const sidebar = createCanvas(164, 314), ctx = sidebar.getContext('2d');
  ctx.fillStyle = '#131827'; ctx.fillRect(0, 0, 164, 314);
  const glow = ctx.createRadialGradient(82, 85, 4, 82, 100, 170);
  glow.addColorStop(0, '#554271'); glow.addColorStop(.55, '#29223e'); glow.addColorStop(1, '#131827');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, 164, 314);
  ctx.drawImage(logo, 42, 43, 80, 80);
  ctx.textAlign = 'center'; ctx.fillStyle = '#eef0fc'; ctx.font = '600 19px "Segoe UI"';
  ctx.fillText('Visualiser', 82, 158); ctx.fillText('Studio', 82, 181);
  ctx.fillStyle = '#b0a6c9'; ctx.font = '11px "Segoe UI"'; ctx.fillText('See your sound.', 82, 206);
  for (let line = 0; line < 7; line++) {
    ctx.beginPath(); ctx.strokeStyle = `rgba(171,145,215,${.1 + line * .018})`; ctx.lineWidth = 1;
    for (let x = 0; x <= 164; x++) {
      const y = 263 + line * 6 + Math.sin(x / 30 + line * .22) * (7 + line);
      if (!x) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  writeBmp(sidebar, 'installerSidebar.bmp');
  const header = createCanvas(150, 57), h = header.getContext('2d');
  h.fillStyle = '#171c28'; h.fillRect(0, 0, 150, 57);
  h.drawImage(logo, 96, 7, 43, 43);
  writeBmp(header, 'installerHeader.bmp');
  console.log('Installer branding generated.');
})().catch(error => { console.error(error); process.exitCode = 1; });
