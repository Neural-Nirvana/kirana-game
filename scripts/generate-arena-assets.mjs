import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'src/assets/arena');
mkdirSync(outDir, { recursive: true });

const crcTable = new Uint32Array(256);
for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
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

function image(width, height) {
  const pixels = new Uint8ClampedArray(width * height * 4);

  function blendPixel(x, y, color) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const index = (Math.floor(y) * width + Math.floor(x)) * 4;
    const alpha = color[3] / 255;
    const inv = 1 - alpha;
    pixels[index] = color[0] * alpha + pixels[index] * inv;
    pixels[index + 1] = color[1] * alpha + pixels[index + 1] * inv;
    pixels[index + 2] = color[2] * alpha + pixels[index + 2] * inv;
    pixels[index + 3] = Math.min(255, color[3] + pixels[index + 3] * inv);
  }

  function rect(x, y, w, h, color) {
    for (let yy = Math.floor(y); yy < y + h; yy += 1) {
      for (let xx = Math.floor(x); xx < x + w; xx += 1) blendPixel(xx, yy, color);
    }
  }

  function ellipse(cx, cy, rx, ry, color) {
    const x0 = Math.floor(cx - rx);
    const x1 = Math.ceil(cx + rx);
    const y0 = Math.floor(cy - ry);
    const y1 = Math.ceil(cy + ry);
    for (let yy = y0; yy <= y1; yy += 1) {
      for (let xx = x0; xx <= x1; xx += 1) {
        const nx = (xx - cx) / rx;
        const ny = (yy - cy) / ry;
        if (nx * nx + ny * ny <= 1) blendPixel(xx, yy, color);
      }
    }
  }

  function line(x0, y0, x1, y1, thickness, color) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    for (let i = 0; i <= steps; i += 1) {
      const x = x0 + (dx * i) / steps;
      const y = y0 + (dy * i) / steps;
      ellipse(x, y, thickness / 2, thickness / 2, color);
    }
  }

  function roundRect(x, y, w, h, r, color) {
    rect(x + r, y, w - r * 2, h, color);
    rect(x, y + r, w, h - r * 2, color);
    ellipse(x + r, y + r, r, r, color);
    ellipse(x + w - r, y + r, r, r, color);
    ellipse(x + r, y + h - r, r, r, color);
    ellipse(x + w - r, y + h - r, r, r, color);
  }

  function save(name) {
    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y += 1) {
      raw[y * (width * 4 + 1)] = 0;
      for (let x = 0; x < width; x += 1) {
        const source = (y * width + x) * 4;
        const target = y * (width * 4 + 1) + 1 + x * 4;
        raw[target] = pixels[source];
        raw[target + 1] = pixels[source + 1];
        raw[target + 2] = pixels[source + 2];
        raw[target + 3] = pixels[source + 3];
      }
    }
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    writeFileSync(
      join(outDir, name),
      Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
      ])
    );
  }

  return { rect, ellipse, line, roundRect, save };
}

function robot() {
  const im = image(320, 360);
  im.ellipse(160, 338, 104, 15, rgba('#000000', 70));
  im.roundRect(88, 142, 144, 168, 40, rgba('#e9f7ff'));
  im.roundRect(100, 164, 120, 126, 20, rgba('#19465d'));
  im.roundRect(112, 204, 96, 72, 14, rgba('#102c3b'));
  im.roundRect(122, 216, 76, 42, 8, rgba('#244f35'));
  im.ellipse(160, 74, 84, 64, rgba('#eaf8ff'));
  im.ellipse(160, 82, 68, 44, rgba('#113247'));
  im.ellipse(134, 82, 12, 12, rgba('#62e5ff'));
  im.ellipse(184, 82, 12, 12, rgba('#62e5ff'));
  im.line(142, 108, 178, 108, 7, rgba('#62e5ff'));
  im.ellipse(88, 184, 22, 58, rgba('#dbeafe'));
  im.ellipse(232, 184, 22, 58, rgba('#dbeafe'));
  im.ellipse(80, 238, 22, 20, rgba('#c7f9ff'));
  im.ellipse(240, 238, 22, 20, rgba('#c7f9ff'));
  im.line(160, 8, 160, 24, 5, rgba('#62e5ff'));
  im.ellipse(160, 7, 8, 8, rgba('#62e5ff'));
  im.line(116, 300, 96, 336, 16, rgba('#dbeafe'));
  im.line(204, 300, 224, 336, 16, rgba('#dbeafe'));
  im.rect(92, 334, 52, 14, rgba('#102c3b'));
  im.rect(176, 334, 52, 14, rgba('#102c3b'));
  im.save('robot-shopkeeper.png');
}

function customer(name, shirt, pants, sari = false) {
  const im = image(180, 300);
  im.ellipse(90, 286, 54, 10, rgba('#000000', 62));
  im.ellipse(90, 58, 31, 34, rgba('#bf7a44'));
  im.ellipse(90, 34, 34, 20, rgba('#2d1b12'));
  im.ellipse(78, 54, 4, 5, rgba('#172033'));
  im.ellipse(102, 54, 4, 5, rgba('#172033'));
  im.line(82, 70, 100, 70, 3, rgba('#6f341f'));
  if (sari) {
    im.roundRect(58, 92, 64, 104, 18, rgba(shirt));
    im.line(62, 106, 120, 198, 18, rgba('#f8c56b'));
  } else {
    im.roundRect(52, 90, 76, 94, 18, rgba(shirt));
    im.rect(61, 176, 24, 86, rgba(pants));
    im.rect(96, 176, 24, 86, rgba(pants));
  }
  im.line(50, 108, 28, 170, 14, rgba('#bf7a44'));
  im.line(130, 108, 154, 170, 14, rgba('#bf7a44'));
  im.rect(50, 256, 36, 16, rgba('#141b2d'));
  im.rect(96, 256, 36, 16, rgba('#141b2d'));
  im.roundRect(126, 150, 36, 44, 8, rgba('#c0842f'));
  im.save(name);
}

function rack(name, accent, fill) {
  const im = image(360, 300);
  im.roundRect(10, 10, 340, 280, 18, rgba('#5b3419'));
  im.roundRect(24, 22, 312, 246, 8, rgba('#8a5425'));
  for (const y of [86, 154, 222]) im.rect(24, y, 312, 10, rgba('#3b210f'));
  for (const x of [93, 174, 255]) im.rect(x, 22, 8, 246, rgba('#3b210f'));
  im.rect(26, 28, 308 * fill, 8, rgba(accent));
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      const x = 42 + col * 80;
      const y = 42 + row * 68;
      im.roundRect(x, y, 42, 38, 5, rgba(row % 2 === 0 ? '#f59e0b' : '#2dd4bf'));
      im.rect(x + 5, y + 10, 32, 10, rgba('#ffffff', 190));
    }
  }
  im.save(name);
}

function fridge() {
  const im = image(190, 360);
  im.roundRect(20, 8, 150, 340, 18, rgba('#1e3a8a'));
  im.roundRect(32, 30, 126, 260, 8, rgba('#dbeafe', 210));
  im.line(95, 32, 95, 288, 4, rgba('#1e3a8a'));
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      const x = 48 + col * 32;
      const y = 48 + row * 44;
      im.roundRect(x, y, 15, 32, 5, rgba(col % 2 ? '#10b981' : '#ef4444'));
      im.rect(x + 3, y + 10, 9, 8, rgba('#ffffff', 190));
    }
  }
  im.rect(36, 304, 118, 26, rgba('#38bdf8'));
  im.save('fridge.png');
}

function conveyor() {
  const im = image(620, 170);
  im.roundRect(18, 54, 584, 86, 30, rgba('#1f2937'));
  im.roundRect(52, 66, 516, 52, 14, rgba('#0f172a'));
  for (let x = 80; x < 560; x += 60) im.line(x, 66, x + 30, 118, 4, rgba('#38bdf8', 150));
  im.ellipse(68, 96, 38, 38, rgba('#111827'));
  im.ellipse(552, 96, 38, 38, rgba('#111827'));
  im.ellipse(68, 96, 20, 20, rgba('#64748b'));
  im.ellipse(552, 96, 20, 20, rgba('#64748b'));
  im.save('conveyor.png');
}

function kiosk() {
  const im = image(420, 270);
  im.ellipse(210, 250, 160, 16, rgba('#000000', 70));
  im.roundRect(54, 72, 312, 156, 18, rgba('#6b3f1f'));
  im.rect(76, 42, 84, 86, rgba('#0f172a'));
  im.roundRect(188, 52, 92, 70, 10, rgba('#111827'));
  im.rect(212, 122, 42, 24, rgba('#111827'));
  im.roundRect(286, 42, 58, 82, 8, rgba('#1e293b'));
  im.roundRect(300, 58, 30, 46, 6, rgba('#86efac'));
  im.roundRect(84, 152, 84, 48, 8, rgba('#172033'));
  im.roundRect(208, 152, 74, 48, 8, rgba('#172033'));
  im.roundRect(302, 152, 44, 48, 8, rgba('#172033'));
  im.save('ai-kiosk.png');
}

function floor() {
  const im = image(1280, 720);
  im.rect(0, 0, 1280, 720, rgba('#2a1d17'));
  for (let y = 0; y < 720; y += 64) im.rect(0, y, 1280, 2, rgba('#5f4530'));
  for (let x = 0; x < 1280; x += 96) im.rect(x, 0, 2, 720, rgba('#5f4530'));
  im.rect(0, 0, 1280, 118, rgba('#1c1210', 210));
  im.rect(0, 584, 1280, 136, rgba('#20140f', 230));
  im.save('shop-floor.png');
}

function icon(name, kind) {
  const im = image(96, 96);
  im.ellipse(48, 48, 43, 43, rgba(kind === 'warning' ? '#f59e0b' : kind === 'trust' ? '#ef4444' : '#16a34a'));
  if (kind === 'cash') {
    im.rect(30, 28, 36, 8, rgba('#ffffff'));
    im.rect(42, 28, 8, 42, rgba('#ffffff'));
    im.line(30, 46, 62, 46, 7, rgba('#ffffff'));
  } else if (kind === 'trust') {
    im.ellipse(38, 38, 15, 15, rgba('#ffffff'));
    im.ellipse(58, 38, 15, 15, rgba('#ffffff'));
    im.line(29, 46, 48, 70, 24, rgba('#ffffff'));
    im.line(67, 46, 48, 70, 24, rgba('#ffffff'));
  } else if (kind === 'khata') {
    im.roundRect(26, 18, 44, 58, 6, rgba('#f8fafc'));
    for (let y = 31; y < 67; y += 12) im.rect(34, y, 28, 4, rgba('#92400e'));
  } else if (kind === 'warning') {
    im.line(48, 20, 22, 72, 8, rgba('#111827'));
    im.line(48, 20, 74, 72, 8, rgba('#111827'));
    im.line(24, 72, 72, 72, 8, rgba('#111827'));
    im.rect(45, 40, 6, 20, rgba('#111827'));
    im.rect(45, 64, 6, 6, rgba('#111827'));
  } else {
    im.ellipse(48, 48, 16, 36, rgba('#ffffff'));
    im.ellipse(48, 48, 36, 16, rgba('#ffffff'));
  }
  im.save(name);
}

robot();
customer('customer-student.png', '#22c55e', '#1d4ed8');
customer('customer-regular.png', '#7c3aed', '#7c2d12', true);
customer('customer-teen.png', '#f59e0b', '#111827');
customer('customer-elder.png', '#f8fafc', '#374151');
customer('customer-family.png', '#ec4899', '#374151', true);
rack('rack-grocery.png', '#22c55e', 0.76);
rack('rack-snacks.png', '#f59e0b', 0.58);
fridge();
conveyor();
kiosk();
floor();
icon('effect-cash.png', 'cash');
icon('effect-trust.png', 'trust');
icon('effect-khata.png', 'khata');
icon('effect-warning.png', 'warning');
icon('effect-reward.png', 'reward');

console.log(`Arena assets generated in ${outDir}`);
