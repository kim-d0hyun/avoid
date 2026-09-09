// build/icon.png 를 만든다. 의존성 없이 픽셀을 직접 찍고 PNG 로 인코딩한다 —
// 아이콘 하나 만들자고 node_modules 를 들이지 않는다.
//
//   node scripts/make-icon.mjs
//
// 게임과 같은 언어로 그린다: 종이 타일 위에 볼펜 낙서. 다만 아이콘의 똥에는 얼굴이 있다.
// 24픽셀로 줄었을 때 「덩어리」가 아니라 「캐릭터」로 읽혀야 하기 때문이다.

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';

const OUT = 1024;
const SS = 2; // 2배로 그리고 줄여서 계단을 없앤다
const N = OUT * SS;

const PAPER = [250, 247, 238];
const INK = [20, 18, 16];
const BROWN = [111, 74, 44];
const BROWN_DARK = [79, 51, 32];
const WHITE = [252, 251, 247];

/// 타원까지의 대략적인 거리. 정확할 필요는 없고 부호와 크기만 맞으면 된다.
const ellipse = (x, y, cx, cy, rx, ry) => {
  const u = (x - cx) / rx;
  const v = (y - cy) / ry;
  return (Math.hypot(u, v) - 1) * Math.min(rx, ry);
};

const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
];

/// -1 = 완전히 안, +1 = 완전히 밖. 경계에서만 섞는다.
const cover = (d, soft) => Math.max(0, Math.min(1, 0.5 - d / soft));

function shade(px, py) {
  // 아이콘 좌표계: -1..1
  let x = (px / N) * 2 - 1;
  let y = (py / N) * 2 - 1;
  const soft = 2 / N * 2.4;

  // 종이 타일 (초타원). macOS 아이콘 격자는 사방에 여백을 남기므로 캔버스를 꽉 채우지 않는다.
  const a = 0.82;
  const tile = (Math.pow(Math.abs(x / a), 5) + Math.pow(Math.abs(y / a), 5) - 1) * 0.22;
  const inTile = cover(tile, soft);
  if (inTile <= 0) return [0, 0, 0, 0];

  // 종이 결. 아주 옅게 — 24픽셀에서는 안 보이고 512픽셀에서만 보인다.
  const grain = (Math.sin(px * 0.7) * Math.sin(py * 0.9) + Math.sin(px * 0.13 + py * 0.21)) * 1.6;
  let color = [PAPER[0] + grain, PAPER[1] + grain, PAPER[2] + grain];

  // 타일 테두리
  color = mix(color, INK, cover(Math.abs(tile) - 0.012, soft) * 0.85);

  // 똥은 타일 안쪽에 맞춰 조금 줄이고 아래로 내려 앉힌다.
  const s = 0.86;
  x = x / s;
  y = (y - 0.03) / s;

  // 세 단. 밑에서부터 좁아진다.
  const body = Math.min(
    Math.max(ellipse(x, y, 0, 0.34, 0.62, 0.30), 0.34 - y - 0.30),
    ellipse(x, y, -0.02, 0.02, 0.44, 0.24),
    ellipse(x, y, 0.04, -0.28, 0.28, 0.19),
  );
  // 말린 끝. 위로 삐죽 솟은 꼬리가 있어야 똥으로 읽힌다.
  const tip = Math.min(
    ellipse(x, y, 0.10, -0.46, 0.13, 0.12),
    ellipse(x, y, 0.19, -0.56, 0.065, 0.07),
  );
  const poop = Math.min(body, tip);
  // 바닥은 평평하게 자른다.
  const solid = Math.max(poop, y - 0.62);

  const line = 0.022;
  const inside = cover(solid + line, soft);
  if (inside > 0) {
    // 왼쪽 아래가 그늘. 광원을 한쪽으로 정해 둬야 덩어리로 보인다.
    const shadow = Math.max(0, Math.min(1, (-x - y * 0.5 + 0.1) * 0.9));
    color = mix(color, mix(BROWN, BROWN_DARK, shadow * 0.55), inside);

    // 단과 단 사이 주름
    for (const [cy, half] of [[0.08, 0.42], [-0.20, 0.26]]) {
      const ridge = Math.abs(y - cy - Math.pow(x / half, 2) * 0.03) - 0.012;
      const within = Math.abs(x) < half ? 1 : 0;
      color = mix(color, BROWN_DARK, cover(ridge, soft) * 0.5 * within * inside);
    }
  }
  // 테두리 잉크
  color = mix(color, INK, cover(Math.abs(solid) - line, soft));

  // 얼굴. 눈은 흰자 + 검은 눈동자, 입은 웃는 호.
  for (const ex of [-0.155, 0.135]) {
    const eye = ellipse(x, y, ex, -0.03, 0.088, 0.10);
    color = mix(color, WHITE, cover(eye, soft));
    color = mix(color, INK, cover(Math.abs(eye) - 0.012, soft));
    color = mix(color, INK, cover(ellipse(x, y, ex + 0.012, -0.012, 0.042, 0.05), soft));
  }
  const smile = Math.abs(Math.hypot(x + 0.01, (y - 0.06) * 1.15) - 0.145) - 0.022;
  const lower = y > 0.10 ? 1 : 0;
  color = mix(color, INK, cover(smile, soft) * lower);

  return [color[0], color[1], color[2], 255 * inTile];
}

// MARK: 그리기 + 축소

const big = new Float64Array(N * N * 4);
for (let py = 0; py < N; py++) {
  for (let px = 0; px < N; px++) {
    const [r, g, b, a] = shade(px + 0.5, py + 0.5);
    const i = (py * N + px) * 4;
    big[i] = r; big[i + 1] = g; big[i + 2] = b; big[i + 3] = a;
  }
}

const out = Buffer.alloc(OUT * OUT * 4);
for (let y = 0; y < OUT; y++) {
  for (let x = 0; x < OUT; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let dy = 0; dy < SS; dy++) {
      for (let dx = 0; dx < SS; dx++) {
        const i = ((y * SS + dy) * N + x * SS + dx) * 4;
        const w = big[i + 3] / 255;
        r += big[i] * w; g += big[i + 1] * w; b += big[i + 2] * w; a += big[i + 3];
      }
    }
    const weight = a / 255 || 1;
    const o = (y * OUT + x) * 4;
    out[o] = Math.round(r / weight);
    out[o + 1] = Math.round(g / weight);
    out[o + 2] = Math.round(b / weight);
    out[o + 3] = Math.round(a / (SS * SS));
  }
}

// MARK: PNG 인코딩

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(OUT, 0);
ihdr.writeUInt32BE(OUT, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // RGBA
// 나머지(압축·필터·인터레이스)는 전부 0

// 각 줄 앞에 필터 바이트 0 을 붙인다. 필터를 안 쓰면 압축이 조금 손해지만 코드가 짧다.
const raw = Buffer.alloc(OUT * (OUT * 4 + 1));
for (let y = 0; y < OUT; y++) {
  out.copy(raw, y * (OUT * 4 + 1) + 1, y * OUT * 4, (y + 1) * OUT * 4);
}

mkdirSync(new URL('../build/', import.meta.url), { recursive: true });
const file = new URL('../build/icon.png', import.meta.url);
writeFileSync(file, Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]));
console.log(`› build/icon.png  ${OUT}×${OUT}`);
