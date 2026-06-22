import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const assetDir = join(root, 'src/assets/arena');

mkdirSync(assetDir, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

const canvas = createImage(1600, 390);
drawScene(canvas);
writePng('stage-backdrop.png', canvas);
writePng('phase-morning.png', drawPhaseOverlay('#f59e0b', '#38bdf8', 56));
writePng('phase-afternoon.png', drawPhaseOverlay('#fde047', '#22c55e', 40));
writePng('phase-evening.png', drawPhaseOverlay('#7c3aed', '#f97316', 68));
writePng('day-start-panel.png', drawCeremonyPanel('start'));
writePng('day-complete-panel.png', drawCeremonyPanel('complete'));
writePng('customer-jhola-full.png', drawFilledJhola());
writePng('score-burst-good.png', drawScoreBurst('good'));
writePng('score-burst-bad.png', drawScoreBurst('bad'));
console.log(`Arena backdrop and viewer assets generated in ${assetDir}`);

function writePng(name, image) {
  writeFileSync(join(assetDir, name), encodePng(image));
}

function drawScene(image) {
  verticalGradient(image, '#281913', '#0e111b');
  rect(image, 0, 0, image.width, 116, rgba('#21120e'));
  rect(image, 0, 116, image.width, 274, rgba('#2f241f'));

  for (let y = 116; y < image.height; y += 42) line(image, 0, y, image.width, y, 2, rgba('#5b4634', 120));
  for (let x = -70; x < image.width; x += 78) line(image, x, 116, x + 82, image.height, 2, rgba('#5b4634', 96));

  rect(image, 0, 0, 160, image.height, rgba('#0f172a', 120));
  rect(image, 24, 44, 108, 178, rgba('#1e293b', 176));
  rect(image, 38, 62, 80, 118, rgba('#0f766e', 72));
  for (let y = 70; y < 178; y += 22) line(image, 42, y, 116, y - 10, 2, rgba('#7dd3fc', 74));
  roundRect(image, 28, 236, 106, 88, 10, rgba('#431407', 205));
  rect(image, 36, 248, 90, 14, rgba('#f59e0b', 210));
  rect(image, 36, 274, 90, 14, rgba('#fb7185', 190));
  rect(image, 36, 300, 68, 12, rgba('#fef3c7', 176));

  roundRect(image, 154, 24, 454, 326, 20, rgba('#0f2438', 206));
  rect(image, 174, 40, 414, 68, rgba('#1f2937', 188));
  rect(image, 174, 110, 414, 214, rgba('#111827', 142));
  line(image, 174, 208, 588, 208, 2, rgba('#5eead4', 76));
  for (let x = 216; x < 570; x += 84) line(image, x, 112, x, 322, 2, rgba('#cbd5e1', 34));
  for (let x = 210; x < 584; x += 96) {
    rect(image, x, 336, 48, 7, rgba('#334155'));
    rect(image, x, 336, 25, 7, rgba('#22c55e'));
  }

  roundRect(image, 622, 42, 330, 308, 24, rgba('#2d173e', 196));
  composite(image, loadAsset('ai-kiosk.png'), 636, 229, 1.18);
  rect(image, 656, 296, 274, 17, rgba('#5b371f'));
  rect(image, 656, 313, 274, 31, rgba('#3a2418'));
  line(image, 922, 261, 1010, 280, 7, rgba('#22c55e', 110));
  line(image, 922, 261, 996, 244, 7, rgba('#22c55e', 92));

  roundRect(image, 980, 24, 592, 326, 20, rgba('#12321f', 180));
  composite(image, loadAsset('rack-milk.png'), 996, 61, 0.92);
  composite(image, loadAsset('rack-bread.png'), 1144, 62, 0.9);
  composite(image, loadAsset('rack-snacks.png'), 1292, 60, 0.92);
  composite(image, loadAsset('fridge.png'), 1450, 54, 0.72);
  composite(image, loadAsset('produce-fridge.png'), 1414, 224, 0.56);
  composite(image, loadAsset('conveyor.png'), 1020, 270, 0.92);

  for (let x = 1088; x < 1435; x += 76) {
    line(image, x, 301, x + 36, 301, 5, rgba('#22d3ee', 92));
    line(image, x + 20, 287, x + 42, 301, 4, rgba('#60a5fa', 78));
  }

  radialGlow(image, 372, 250, 330, rgba('#38bdf8', 54));
  radialGlow(image, 790, 205, 260, rgba('#a855f7', 58));
  radialGlow(image, 1280, 210, 330, rgba('#22c55e', 46));
  rect(image, 0, 0, image.width, image.height, rgba('#020617', 18));
}

function drawPhaseOverlay(top, bottom, strength) {
  const image = createImage(1600, 390);
  const a = rgba(top);
  const b = rgba(bottom);
  for (let y = 0; y < image.height; y += 1) {
    const t = y / Math.max(1, image.height - 1);
    const alpha = Math.round(strength * (1 - Math.abs(t - 0.46)));
    rect(image, 0, y, image.width, 1, [
      Math.round(a[0] * (1 - t) + b[0] * t),
      Math.round(a[1] * (1 - t) + b[1] * t),
      Math.round(a[2] * (1 - t) + b[2] * t),
      alpha,
    ]);
  }
  radialGlow(image, 810, 116, 520, [255, 255, 255, 32]);
  return image;
}

function drawCeremonyPanel(mode) {
  const image = createImage(680, 188);
  const primary = mode === 'start' ? '#38bdf8' : '#f5c451';
  const secondary = mode === 'start' ? '#14b8a6' : '#22c55e';
  radialGlow(image, 340, 94, 280, rgba(primary, 90));
  roundRect(image, 12, 14, 656, 160, 22, rgba('#06111f', 232));
  roundRect(image, 24, 28, 632, 132, 18, rgba('#10233a', 230));
  line(image, 40, 52, 640, 52, 3, rgba(primary, 180));
  line(image, 40, 136, 640, 136, 3, rgba(secondary, 160));
  ellipse(image, 82, 94, 36, 36, rgba(primary, 210));
  ellipse(image, 598, 94, 36, 36, rgba(secondary, 210));
  for (let i = 0; i < 8; i += 1) {
    const x = 154 + i * 54;
    line(image, x, 76, x + 22, 94, 4, rgba(i % 2 === 0 ? primary : secondary, 150));
    line(image, x + 22, 94, x, 112, 4, rgba(i % 2 === 0 ? secondary : primary, 150));
  }
  return image;
}

function drawFilledJhola() {
  const image = createImage(92, 92);
  line(image, 30, 28, 46, 12, 7, rgba('#d97706', 230));
  line(image, 46, 12, 62, 28, 7, rgba('#d97706', 230));
  roundRect(image, 18, 26, 56, 54, 8, rgba('#fef3c7', 242));
  rect(image, 23, 36, 46, 9, rgba('#2563eb', 230));
  rect(image, 23, 49, 35, 9, rgba('#ef4444', 230));
  rect(image, 23, 62, 42, 9, rgba('#22c55e', 230));
  line(image, 18, 31, 74, 31, 2, rgba('#92400e', 210));
  ellipse(image, 68, 34, 9, 9, rgba('#facc15', 232));
  return image;
}

function drawScoreBurst(tone) {
  const image = createImage(156, 156);
  const color = tone === 'good' ? '#22c55e' : '#ef4444';
  const alt = tone === 'good' ? '#facc15' : '#f97316';
  radialGlow(image, 78, 78, 76, rgba(color, 180));
  for (let i = 0; i < 16; i += 1) {
    const angle = (Math.PI * 2 * i) / 16;
    const x0 = 78 + Math.cos(angle) * 32;
    const y0 = 78 + Math.sin(angle) * 32;
    const x1 = 78 + Math.cos(angle) * 70;
    const y1 = 78 + Math.sin(angle) * 70;
    line(image, x0, y0, x1, y1, 5, rgba(i % 2 === 0 ? color : alt, 210));
  }
  ellipse(image, 78, 78, 40, 40, rgba('#0f172a', 226));
  ellipse(image, 78, 78, 30, 30, rgba(color, 230));
  return image;
}

function loadAsset(name) {
  const path = join(assetDir, name);
  if (!existsSync(path)) throw new Error(`Missing arena asset: ${path}`);
  return decodePng(readFileSync(path));
}

function createImage(width, height) {
  return { width, height, pixels: new Uint8Array(width * height * 4) };
}

function rgba(hex, alpha = 255) {
  const value = hex.replace('#', '');
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
    alpha,
  ];
}

function rect(image, x, y, w, h, color) {
  for (let yy = Math.max(0, Math.floor(y)); yy < Math.min(image.height, y + h); yy += 1) {
    for (let xx = Math.max(0, Math.floor(x)); xx < Math.min(image.width, x + w); xx += 1) {
      blendPixel(image, xx, yy, color);
    }
  }
}

function roundRect(image, x, y, w, h, r, color) {
  rect(image, x + r, y, w - r * 2, h, color);
  rect(image, x, y + r, w, h - r * 2, color);
  ellipse(image, x + r, y + r, r, r, color);
  ellipse(image, x + w - r, y + r, r, r, color);
  ellipse(image, x + r, y + h - r, r, r, color);
  ellipse(image, x + w - r, y + h - r, r, r, color);
}

function ellipse(image, cx, cy, rx, ry, color) {
  for (let yy = Math.floor(cy - ry); yy <= cy + ry; yy += 1) {
    for (let xx = Math.floor(cx - rx); xx <= cx + rx; xx += 1) {
      const nx = (xx - cx) / rx;
      const ny = (yy - cy) / ry;
      if (nx * nx + ny * ny <= 1) blendPixel(image, xx, yy, color);
    }
  }
}

function line(image, x0, y0, x1, y1, thickness, color) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 0; i <= steps; i += 1) {
    const x = x0 + (dx * i) / steps;
    const y = y0 + (dy * i) / steps;
    ellipse(image, x, y, thickness / 2, thickness / 2, color);
  }
}

function verticalGradient(image, top, bottom) {
  const a = rgba(top);
  const b = rgba(bottom);
  for (let y = 0; y < image.height; y += 1) {
    const t = y / Math.max(1, image.height - 1);
    rect(image, 0, y, image.width, 1, [
      Math.round(a[0] * (1 - t) + b[0] * t),
      Math.round(a[1] * (1 - t) + b[1] * t),
      Math.round(a[2] * (1 - t) + b[2] * t),
      255,
    ]);
  }
}

function radialGlow(image, cx, cy, radius, color) {
  for (let yy = Math.floor(cy - radius); yy <= cy + radius; yy += 1) {
    for (let xx = Math.floor(cx - radius); xx <= cx + radius; xx += 1) {
      const d = Math.hypot(xx - cx, yy - cy) / radius;
      if (d <= 1) blendPixel(image, xx, yy, [color[0], color[1], color[2], Math.round(color[3] * (1 - d))]);
    }
  }
}

function composite(target, source, x, y, scale = 1) {
  const w = Math.round(source.width * scale);
  const h = Math.round(source.height * scale);
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      const sx = Math.min(source.width - 1, Math.floor(xx / scale));
      const sy = Math.min(source.height - 1, Math.floor(yy / scale));
      const sourceIndex = (sy * source.width + sx) * 4;
      blendPixel(target, x + xx, y + yy, [
        source.pixels[sourceIndex],
        source.pixels[sourceIndex + 1],
        source.pixels[sourceIndex + 2],
        source.pixels[sourceIndex + 3],
      ]);
    }
  }
}

function blendPixel(image, x, y, color) {
  if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
  const index = (Math.floor(y) * image.width + Math.floor(x)) * 4;
  const alpha = color[3] / 255;
  const inv = 1 - alpha;
  image.pixels[index] = color[0] * alpha + image.pixels[index] * inv;
  image.pixels[index + 1] = color[1] * alpha + image.pixels[index + 1] * inv;
  image.pixels[index + 2] = color[2] * alpha + image.pixels[index + 2] * inv;
  image.pixels[index + 3] = Math.min(255, color[3] + image.pixels[index + 3] * inv);
}

function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  let colorType = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const bpp = colorType === 6 ? 4 : 3;
  const stride = width * bpp;
  const inflated = inflateSync(Buffer.concat(idat));
  const pixels = new Uint8Array(width * height * 4);
  let input = 0;
  let previous = new Uint8Array(stride);

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[input];
    input += 1;
    const row = new Uint8Array(stride);
    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[input + x];
      const left = x >= bpp ? row[x - bpp] : 0;
      const up = previous[x] ?? 0;
      const upLeft = x >= bpp ? previous[x - bpp] : 0;
      row[x] = unfilter(filter, raw, left, up, upLeft);
    }
    input += stride;

    for (let x = 0; x < width; x += 1) {
      const sourceIndex = x * bpp;
      const targetIndex = (y * width + x) * 4;
      pixels[targetIndex] = row[sourceIndex];
      pixels[targetIndex + 1] = row[sourceIndex + 1];
      pixels[targetIndex + 2] = row[sourceIndex + 2];
      pixels[targetIndex + 3] = bpp === 4 ? row[sourceIndex + 3] : 255;
    }
    previous = row;
  }

  return { width, height, pixels };
}

function unfilter(filter, raw, left, up, upLeft) {
  if (filter === 0) return raw;
  if (filter === 1) return (raw + left) & 255;
  if (filter === 2) return (raw + up) & 255;
  if (filter === 3) return (raw + Math.floor((left + up) / 2)) & 255;
  if (filter === 4) return (raw + paeth(left, up, upLeft)) & 255;
  throw new Error(`Unsupported PNG filter: ${filter}`);
}

function paeth(left, up, upLeft) {
  const p = left + up - upLeft;
  const pa = Math.abs(p - left);
  const pb = Math.abs(p - up);
  const pc = Math.abs(p - upLeft);
  if (pa <= pb && pa <= pc) return left;
  if (pb <= pc) return up;
  return upLeft;
}

function encodePng(image) {
  const raw = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    raw[y * (image.width * 4 + 1)] = 0;
    for (let x = 0; x < image.width; x += 1) {
      const source = (y * image.width + x) * 4;
      const target = y * (image.width * 4 + 1) + 1 + x * 4;
      raw[target] = image.pixels[source];
      raw[target + 1] = image.pixels[source + 1];
      raw[target + 2] = image.pixels[source + 2];
      raw[target + 3] = image.pixels[source + 3];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(image.width, 0);
  header.writeUInt32BE(image.height, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
