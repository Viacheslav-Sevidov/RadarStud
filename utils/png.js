'use strict';

const zlib = require('zlib');

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function createCanvas(width, height, background) {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    pixels[i * 3] = background[0];
    pixels[i * 3 + 1] = background[1];
    pixels[i * 3 + 2] = background[2];
  }
  return { width, height, pixels };
}

function setPixel(canvas, x, y, color) {
  if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) {
    return;
  }
  const index = (y * canvas.width + x) * 3;
  canvas.pixels[index] = color[0];
  canvas.pixels[index + 1] = color[1];
  canvas.pixels[index + 2] = color[2];
}

function fillRect(canvas, x, y, w, h, color) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      setPixel(canvas, x + i, y + j, color);
    }
  }
}

function drawLine(canvas, x1, y1, x2, y2, color, thickness) {
  x1 = Math.round(x1);
  y1 = Math.round(y1);
  x2 = Math.round(x2);
  y2 = Math.round(y2);
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  const stepX = x1 < x2 ? 1 : -1;
  const stepY = y1 < y2 ? 1 : -1;
  let error = dx - dy;
  const width = thickness || 1;
  const half = Math.floor(width / 2);
  while (true) {
    fillRect(canvas, x1 - half, y1 - half, width, width, color);
    if (x1 === x2 && y1 === y2) {
      break;
    }
    const doubled = 2 * error;
    if (doubled > -dy) {
      error = error - dy;
      x1 = x1 + stepX;
    }
    if (doubled < dx) {
      error = error + dx;
      y1 = y1 + stepY;
    }
  }
}

const FONT = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '001', '001', '001'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '.': ['000', '000', '000', '000', '010'],
  '-': ['000', '000', '111', '000', '000'],
  ':': ['000', '010', '000', '010', '000'],
  ' ': ['000', '000', '000', '000', '000'],
};

function textWidth(text, scale) {
  if (text.length === 0) {
    return 0;
  }
  return text.length * 4 * scale - scale;
}

function drawText(canvas, text, x, y, color, scale) {
  let cursor = x;
  const size = scale || 1;
  for (const char of text) {
    const glyph = FONT[char];
    if (glyph !== undefined) {
      for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 3; col++) {
          if (glyph[row][col] === '1') {
            fillRect(canvas, cursor + col * size, y + row * size, size, size, color);
          }
        }
      }
    }
    cursor = cursor + 4 * size;
  }
}

function makeChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData), 0);
  return Buffer.concat([length, typeAndData, crc]);
}

function encodePng(canvas) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.width, 0);
  header.writeUInt32BE(canvas.height, 4);
  header[8] = 8;
  header[9] = 2;
  const rowSize = canvas.width * 3;
  const raw = Buffer.alloc((rowSize + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    canvas.pixels.copy(raw, y * (rowSize + 1) + 1, y * rowSize, (y + 1) * rowSize);
  }
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', header),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = {
  createCanvas,
  setPixel,
  fillRect,
  drawLine,
  drawText,
  textWidth,
  encodePng,
  crc32,
  makeChunk,
  FONT,
};
