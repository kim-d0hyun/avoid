// 똥과, 바닥에 눌어붙는 얼룩.
//
// 화면에 예순 덩이가 동시에 떨어져도 60fps 를 지켜야 하므로 **미리 그려 두고 붙인다.**
// 손떨림은 크기마다 세 장을 따로 그려 두고 돌려 쓴다 — 매 프레임 다시 그리는 값의
// 1/3000 로 같은 「손으로 그린」 느낌이 난다.

import { INK, POOP, POOP_DARK, fillStroke, stroke, wiggle } from './ink.js';

const VARIANTS = 3;
const BUCKETS = [12, 16, 20, 25];
const PAD = 9;

/// 세 단 쌓인 고전적인 모양. 밑은 넓고 위로 갈수록 좁아지다 끝이 뾰족하게 말린다.
function outline(r) {
  const h = r * 2.0;
  const b = h * 0.5; // 바닥
  return [
    [-r, b], [-r * 1.02, h * 0.20], [-r * 0.54, h * 0.16],
    [-r * 0.84, -h * 0.06], [-r * 0.36, -h * 0.10],
    [-r * 0.54, -h * 0.30], [-r * 0.16, -h * 0.34],
    [-r * 0.08, -h * 0.52], [r * 0.14, -h * 0.42],
    [r * 0.50, -h * 0.32], [r * 0.36, -h * 0.10],
    [r * 0.86, -h * 0.04], [r * 0.54, h * 0.16],
    [r * 1.02, h * 0.20], [r, b],
  ];
}

function render(r, seed) {
  const size = Math.ceil((r + PAD) * 2);
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  ctx.translate(size / 2, size / 2);

  fillStroke(ctx, outline(r), { fill: POOP, color: INK, width: 2.4, seed, amp: r * 0.045 });

  // 단과 단 사이 주름. 이게 있어야 세 덩이로 읽힌다.
  const ridge = (y, half) => stroke(ctx, [[-half, y], [half * 0.2, y - r * 0.07], [half, y]],
                                    { width: 1.8, color: POOP_DARK, seed: seed + y, amp: r * 0.03, halo: false });
  ridge(r * 0.30, r * 0.50);
  ridge(-r * 0.10, r * 0.33);

  // 왼쪽에만 넣는 빗금. 빛이 어디서 오는지 한 방향으로 정해 둔다.
  ctx.globalAlpha = 0.32;
  for (let i = 0; i < 3; i++) {
    const y = -r * 0.22 + i * r * 0.34;
    stroke(ctx, [[-r * 0.72 + wiggle(seed, i, 1), y], [-r * 0.40, y + r * 0.22]],
           { width: 1.6, color: POOP_DARK, seed: seed + i * 7, amp: 0.6, halo: false });
  }
  ctx.globalAlpha = 1;

  return sprite;
}

const cache = BUCKETS.map((r) => Array.from({ length: VARIANTS }, (_, v) => render(r, v * 37 + r)));

export function bucketFor(r) {
  let best = 0;
  for (let i = 1; i < BUCKETS.length; i++) {
    if (Math.abs(BUCKETS[i] - r) < Math.abs(BUCKETS[best] - r)) best = i;
  }
  return best;
}

export function drawPoop(ctx, poop, boilFrame) {
  const sprite = cache[poop.bucket][(boilFrame + poop.seed) % VARIANTS];
  const scale = poop.r / BUCKETS[poop.bucket];
  ctx.save();
  ctx.translate(poop.x, poop.y);
  ctx.rotate(poop.spin);
  ctx.scale(scale, scale);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height / 2);
  ctx.restore();
}

// MARK: 얼룩 — 이 게임의 시그니처

/// 오래 버틸수록 바닥이 더러워진다. 남은 목숨도 점수판도 없는 게임에서
/// **여태 얼마나 버텼는지를 화면이 스스로 보여 주는** 유일한 물건이다.
function renderSplat(w, seed) {
  const width = Math.ceil(w * 2.6 + PAD * 2);
  const height = Math.ceil(w * 0.75 + PAD * 2);
  const sprite = document.createElement('canvas');
  sprite.width = width;
  sprite.height = height;
  const ctx = sprite.getContext('2d');
  ctx.translate(width / 2, height - PAD);

  // 옆으로 퍼진 자국. 밑은 바닥에 붙어 평평하고 위 능선만 울퉁불퉁하다.
  const points = [];
  const steps = 13;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = -w + t * w * 2;
    const bulge = Math.sin(t * Math.PI) * w * 0.40 * (0.75 + Math.abs(wiggle(seed, i, 0.6)));
    points.push([x, -bulge]);
  }
  points.push([w * 1.02, 0], [-w * 1.02, 0]);
  fillStroke(ctx, points, { fill: POOP, color: INK, width: 2.2, seed, amp: 1.3 });

  // 옆으로 튄 덩어리. 점이 아니라 작은 자국이라야 「튀었다」로 읽힌다.
  for (let i = 0; i < 2; i++) {
    const side = i === 0 ? -1 : 1;
    const dx = side * (w * 1.05 + Math.abs(wiggle(seed + 3, i, w * 0.28)));
    const rr = 3.2 + Math.abs(wiggle(seed + 9, i, 2.2));
    fillStroke(ctx, [
      [dx - rr, 0], [dx - rr * 0.7, -rr * 0.9], [dx, -rr * 1.05],
      [dx + rr * 0.7, -rr * 0.85], [dx + rr, 0],
    ], { fill: POOP, color: INK, width: 1.8, seed: seed + i * 5, amp: 0.7 });
  }
  return sprite;
}

const splatCache = [16, 23, 30].map((w, i) => renderSplat(w, i * 11 + 4));

export function drawSplat(ctx, splat) {
  const sprite = splatCache[splat.kind];
  // 떨어진 순간 살짝 튀어 올랐다 눌린다. 0.1초짜리지만 이게 없으면 얼룩이 그냥 「생긴다」.
  const pop = splat.pop;
  const sx = 0.55 + 0.45 * pop + Math.sin(Math.min(pop, 1) * Math.PI) * 0.16;
  const sy = 0.55 + 0.45 * pop - Math.sin(Math.min(pop, 1) * Math.PI) * 0.10;
  ctx.save();
  ctx.globalAlpha = splat.alpha;
  ctx.translate(splat.x, splat.y);
  ctx.scale(splat.flip * sx * splat.size, sy * splat.size);
  ctx.drawImage(sprite, -sprite.width / 2, -sprite.height + PAD);
  ctx.restore();
  ctx.globalAlpha = 1;
}

export const SPLAT_KINDS = splatCache.length;
