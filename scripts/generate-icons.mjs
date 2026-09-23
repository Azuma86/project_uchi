/**
 * PWA 用アイコンを生成するスクリプト。
 *
 * 依存ライブラリを増やさずに済むよう、PNG エンコーダを最小限だけ自前で書いている
 * (zlib は Node 標準)。デザイナーが用意した画像に差し替える場合は
 * public/icons/ 配下のファイルを置き換えるだけでよい。
 *
 *   node scripts/generate-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'icons');

const BRAND = [0x0b, 0x72, 0xb5];
const WHITE = [0xff, 0xff, 0xff];

// ---------------------------------------------------------------------------
// PNG エンコード
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])));
  return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter type: None
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// 図形 (64x64 の座標系で定義し、出力サイズへスケールする)
// ---------------------------------------------------------------------------
const HOUSE = [
  [32, 15],
  [51, 31.5],
  [45.5, 31.5],
  [45.5, 48],
  [35.5, 48],
  [35.5, 38.5],
  [28.5, 38.5],
  [28.5, 48],
  [18.5, 48],
  [18.5, 31.5],
  [13, 31.5],
];

const PLUS = [
  [46.2, 11.5, 49.8, 22.5],
  [42.5, 15.2, 53.5, 18.8],
];

function inPolygon(x, y, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function inRoundedRect(x, y, size, radius) {
  if (x < 0 || y < 0 || x > size || y > size) return false;
  const cx = Math.min(Math.max(x, radius), size - radius);
  const cy = Math.min(Math.max(y, radius), size - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2 + 1e-9;
}

/**
 * @param size       出力ピクセルサイズ
 * @param maskable   true なら余白を大きく取る (Android のマスク対応)
 * @param background true なら角丸背景を描く。false は透過背景。
 */
function render(size, { maskable = false, cornerRadius = 0.25 } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const SS = 3; // スーパーサンプリング (アンチエイリアス)
  // maskable アイコンは中央 80% 内に図柄を収める必要がある
  const scale = maskable ? 0.72 : 0.92;
  const radius = size * (maskable ? 0.5 : cornerRadius);

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < SS; sy += 1) {
        for (let sx = 0; sx < SS; sx += 1) {
          const x = px + (sx + 0.5) / SS;
          const y = py + (sy + 0.5) / SS;
          if (!inRoundedRect(x, y, size, radius)) continue;
          bg += 1;

          // 64x64 の図形座標へ変換
          const u = ((x - size / 2) / (size * scale)) * 64 + 32;
          const v = ((y - size / 2) / (size * scale)) * 64 + 32;

          const isHouse = inPolygon(u, v, HOUSE);
          const isPlus = PLUS.some(([x0, y0, x1, y1]) => u >= x0 && u <= x1 && v >= y0 && v <= y1);
          if (isHouse || isPlus) fg += 1;
        }
      }

      const total = SS * SS;
      const alpha = bg / total;
      const fgRatio = fg / total;
      const offset = (py * size + px) * 4;

      if (alpha === 0) continue;
      const mix = fgRatio / alpha;
      rgba[offset] = Math.round(BRAND[0] * (1 - mix) + WHITE[0] * mix);
      rgba[offset + 1] = Math.round(BRAND[1] * (1 - mix) + WHITE[1] * mix);
      rgba[offset + 2] = Math.round(BRAND[2] * (1 - mix) + WHITE[2] * mix);
      rgba[offset + 3] = Math.round(alpha * 255);
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(OUT_DIR, { recursive: true });

const targets = [
  ['icon-192.png', 192, {}],
  ['icon-512.png', 512, {}],
  // iOS のホーム画面アイコンは角丸を OS 側で付けるので四角のまま出す
  ['apple-touch-icon.png', 180, { cornerRadius: 0 }],
  ['icon-maskable-512.png', 512, { maskable: true }],
  ['favicon-32.png', 32, {}],
];

for (const [name, size, options] of targets) {
  writeFileSync(join(OUT_DIR, name), render(size, options));
  console.log(`generated public/icons/${name} (${size}x${size})`);
}
