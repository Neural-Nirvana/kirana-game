import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync, deflateSync } from 'node:zlib';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = join(root, 'src/assets/arena');
const sourcePath = process.argv[2];
const crcTable = new Uint32Array(256);

for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c >>> 0;
}

if (!sourcePath || !existsSync(sourcePath)) {
  throw new Error('Usage: node scripts/extract-arena-sprite-sheet.mjs /path/to/generated-sprite-sheet.png');
}

mkdirSync(outDir, { recursive: true });

const crops = [
  ['robot-shopkeeper.png', 28, 20, 238, 286],
  ['customer-student.png', 690, 18, 142, 292],
  ['customer-regular.png', 840, 20, 142, 292],
  ['customer-teen.png', 992, 20, 136, 290],
  ['customer-elder.png', 1130, 18, 148, 294],
  ['customer-family.png', 1280, 18, 148, 294],

  ['rack-milk.png', 35, 324, 196, 262],
  ['rack-bread.png', 246, 326, 180, 260],
  ['rack-grocery.png', 828, 326, 190, 260],
  ['rack-snacks.png', 632, 326, 188, 260],
  ['rack-household.png', 1365, 326, 154, 260],
  ['fridge.png', 1022, 318, 150, 270],
  ['produce-fridge.png', 1182, 318, 180, 270],
  ['conveyor.png', 30, 604, 462, 118],
  ['conveyor-corner.png', 510, 606, 132, 120],
  ['conveyor-short.png', 678, 610, 372, 106],
  ['ai-kiosk.png', 1136, 612, 360, 112],

  ['effect-cash.png', 44, 730, 96, 96],
  ['effect-customers.png', 160, 730, 96, 96],
  ['effect-trust.png', 284, 730, 104, 96],
  ['effect-cash-down.png', 430, 730, 96, 96],
  ['effect-angry.png', 535, 730, 96, 96],
  ['effect-warning.png', 968, 730, 96, 96],
  ['effect-khata.png', 748, 728, 92, 98],
  ['effect-reward.png', 1075, 728, 100, 100],
  ['effect-star.png', 1184, 728, 102, 100],

  ['product-milk.png', 42, 842, 132, 166],
  ['product-bread.png', 192, 842, 148, 166],
  ['product-eggs.png', 350, 842, 150, 166],
  ['product-maggi.png', 548, 842, 138, 166],
  ['product-chips.png', 718, 842, 140, 166],
  ['product-cold-drinks.png', 888, 842, 130, 166],
  ['product-bananas.png', 1026, 842, 128, 166],
  ['product-rice.png', 1160, 842, 130, 166],
  ['product-oil.png', 1302, 842, 120, 166],
  ['product-detergent.png', 1430, 842, 104, 166],
];

const source = decodePng(readFileSync(sourcePath));
const background = average([
  pixelAt(source, 2, 2),
  pixelAt(source, source.width - 3, 2),
  pixelAt(source, 2, source.height - 3),
  pixelAt(source, source.width - 3, source.height - 3),
]);

for (const [name, x, y, width, height] of crops) {
  writeFileSync(join(outDir, name), encodePng(cropToRgba(source, x, y, width, height, background)));
}

console.log(`Extracted ${crops.length} arena sprites from ${sourcePath}`);

function decodePng(buffer) {
  const signature = buffer.subarray(0, 8);
  if (signature.toString('hex') !== '89504e470d0a1a0a') throw new Error('Not a PNG file');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
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
      bitDepth = data[8];
      colorType = data[9];
      const interlace = data[12];
      if (bitDepth !== 8 || interlace !== 0 || ![2, 6].includes(colorType)) {
        throw new Error(`Unsupported PNG format: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${interlace}`);
      }
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

function cropToRgba(source, x, y, width, height, background) {
  const pixels = new Uint8Array(width * height * 4);
  for (let yy = 0; yy < height; yy += 1) {
    for (let xx = 0; xx < width; xx += 1) {
      const sourceIndex = ((y + yy) * source.width + x + xx) * 4;
      const targetIndex = (yy * width + xx) * 4;
      const r = source.pixels[sourceIndex];
      const g = source.pixels[sourceIndex + 1];
      const b = source.pixels[sourceIndex + 2];
      const sourceAlpha = source.pixels[sourceIndex + 3];
      const alpha = sourceAlpha === 0 ? 0 : backgroundAlpha([r, g, b], background);
      pixels[targetIndex] = r;
      pixels[targetIndex + 1] = g;
      pixels[targetIndex + 2] = b;
      pixels[targetIndex + 3] = Math.min(sourceAlpha, alpha);
    }
  }
  return { width, height, pixels };
}

function backgroundAlpha(rgb, background) {
  const distance = colorDistance(rgb, background);
  const transparentAt = 9;
  const opaqueAt = 30;
  if (distance <= transparentAt) return 0;
  if (distance >= opaqueAt) return 255;
  return Math.round(((distance - transparentAt) / (opaqueAt - transparentAt)) * 255);
}

function pixelAt(image, x, y) {
  const index = (y * image.width + x) * 4;
  return [image.pixels[index], image.pixels[index + 1], image.pixels[index + 2]];
}

function average(colors) {
  return colors[0].map((_, index) => Math.round(colors.reduce((total, color) => total + color[index], 0) / colors.length));
}

function colorDistance(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
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
