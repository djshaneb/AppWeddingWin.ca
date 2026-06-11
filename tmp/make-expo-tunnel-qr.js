const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const qr = [
  '▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄',
  '█ ▄▄▄▄▄ █▄▄██████▄██▄▄█ ▄▄▄▄▄ █',
  '█ █   █ █ ▀█ ▄    ▀ ▄ █ █   █ █',
  '█ █▄▄▄█ █▄ ▄▄▀█▄▄▄█▀ ▀█ █▄▄▄█ █',
  '█▄▄▄▄▄▄▄█▄▀▄▀▄█▄█▄▀ ▀▄█▄▄▄▄▄▄▄█',
  '█  ▄ ▀▀▄█▄▀████ ▄  █▀▀▄▀▀ ▄ █ █',
  '██ ▀▄█▄▄█ ██▀▀▀███▄█▀▀ ██▀▀██▀█',
  '█▀█ █▀▄▄ ▄▄▀ █▀▀ ▀   █▄▀██▀▄ ▀█',
  '█▀█  ▀▄▄▀▀  █ ▀▄█ █▀▄▄▄█▄ █▄ ▄█',
  '█▄ ▀  ▀▄▄█▀ ▄▀▀█ ▀▀▀▄▀▄█▀▄█▀▀▄█',
  '█▄██▀▀▀▄▄▄▄▀▄ ██▄█▀▄▀█ █ █  ▀██',
  '██▄▄███▄▄ █▄▄  ▀█▀▄██ ▄▄▄ █▄  █',
  '█ ▄▄▄▄▄ ██▄█▄▄▄██▀▄▀▄ █▄█ ▄█ ██',
  '█ █   █ █▀▀█▀ █ ▀ ▄▄▀▄ ▄▄ ▄ █▀█',
  '█ █▄▄▄█ █ ▀  █▄▀▀▀▄ █ █▀█▀ █▀▄█',
  '█▄▄▄▄▄▄▄█▄███▄█▄███▄▄▄█▄▄▄▄█▄██',
];

const moduleSize = 14;
const margin = 6;
const matrixWidth = Math.max(...qr.map((line) => [...line].length));
const matrixHeight = qr.length * 2;
const matrixSize = Math.max(matrixWidth, matrixHeight);
const canvasModules = matrixSize + margin * 2;
const width = canvasModules * moduleSize;
const height = width;
const offsetX = Math.floor((matrixSize - matrixWidth) / 2) + margin;
const offsetY = Math.floor((matrixSize - matrixHeight) / 2) + margin;
const pixels = Buffer.alloc(width * height * 3, 255);

function paintModule(mx, my) {
  const x0 = mx * moduleSize;
  const y0 = my * moduleSize;
  for (let y = y0; y < y0 + moduleSize; y++) {
    for (let x = x0; x < x0 + moduleSize; x++) {
      const index = (y * width + x) * 3;
      pixels[index] = 0;
      pixels[index + 1] = 0;
      pixels[index + 2] = 0;
    }
  }
}

qr.forEach((line, row) => {
  [...line].forEach((ch, col) => {
    const top = ch === '█' || ch === '▀';
    const bottom = ch === '█' || ch === '▄';
    if (top) paintModule(offsetX + col, offsetY + row * 2);
    if (bottom) paintModule(offsetX + col, offsetY + row * 2 + 1);
  });
});

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const raw = Buffer.alloc((width * 3 + 1) * height);
for (let y = 0; y < height; y++) {
  raw[y * (width * 3 + 1)] = 0;
  pixels.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(width, 0);
ihdr.writeUInt32BE(height, 4);
ihdr[8] = 8;
ihdr[9] = 2;
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND'),
]);

const out = path.join(__dirname, '..', 'expo-tunnel-qr.png');
fs.writeFileSync(out, png);
console.log(out);
