// 볼펜 낙서 프리미티브.
//
// 이 게임은 남의 바탕화면 위에 그려진다. 벽지가 검을지 흴지 알 수 없으므로 **모든 획은
// 두 번 긋는다** — 먼저 두꺼운 종이색으로, 그 위에 잉크로. 흰 배경에서는 안 보이고
// 검은 배경에서는 종이에 그린 것처럼 보인다. 대비를 우연에 맡기지 않는 유일한 방법이다.

export const INK = '#141210';
export const RED = '#d02f22';
export const PENCIL = '#6b665c';
export const PAPER = 'rgba(250, 247, 238, 0.92)';
/// 후광은 살짝 비쳐도 되지만 **면으로 덮는 곳은 안 비쳐야 한다** —
/// 도장 안으로 떨어지는 똥이 유령처럼 배어 나온다.
export const PAPER_SOLID = '#faf7ee';
export const POOP = '#6f4a2c';

/// 같이 할 때 사람을 가르는 색연필. **빨강은 뺐다** — 빨간 볼펜은 이 게임에서
/// 「너에게 중요한 것」(여백선·기록 갱신·내 이름 밑줄) 한 가지 뜻으로만 쓴다.
/// 여덟 개면 한 방에 들어올 만큼은 되고, 넘치면 돌려 쓴다.
const SHIRTS = ['#2f6fb0', '#3f8f56', '#d97b1f', '#8a5bb5',
                '#2f9c9c', '#d45c8f', '#b8912a', '#5b6bbf'];
export function shirtColor(id) {
  return SHIRTS[((id % SHIRTS.length) + SHIRTS.length) % SHIRTS.length];
}
export const POOP_DARK = '#4f3320';

/// 한 덩이를 통째로 흐리게 그릴 때 쓴다. 획마다 알파를 받아 넘기는 대신 여기서 곱한다 —
/// 탈락한 사람을 옅게 그리는 자리 하나 때문에 모든 함수에 인자를 더할 이유가 없다.
let fade = 1;
export function setFade(value) { fade = value; }

/// 손떨림. 매 프레임 흔들면 지글거려서 눈이 아프다. 초당 9번만 바뀌게 해서
/// 손으로 다시 그린 그림이 넘어가는 것처럼 보이게 한다.
export function boil(time) {
  return Math.floor(time * 9);
}

/// 시드에서 -amp..amp 를 뽑는다. 같은 시드면 같은 값이라 획이 제자리에서 떤다.
export function wiggle(seed, index, amp) {
  const n = Math.sin(seed * 12.9898 + index * 78.233) * 43758.5453;
  return (n - Math.floor(n) - 0.5) * 2 * amp;
}

function trace(ctx, points, seed, amp, close, sharp) {
  ctx.beginPath();
  const shift = (p, i) => [p[0] + wiggle(seed, i * 2, amp), p[1] + wiggle(seed, i * 2 + 1, amp)];

  // 모서리가 살아 있어야 하는 것(도장 테두리 같은)은 부드럽게 잇지 않는다.
  if (sharp) {
    points.map(shift).forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
    if (close) ctx.closePath();
    return;
  }

  if (points.length === 2) {
    const [a, b] = [shift(points[0], 0), shift(points[1], 1)];
    // 자로 그은 직선은 낙서가 아니다. 중간을 살짝 부풀려 활처럼 만든다.
    const mx = (a[0] + b[0]) / 2 + wiggle(seed, 9, amp * 1.6);
    const my = (a[1] + b[1]) / 2 + wiggle(seed, 10, amp * 1.6);
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(mx, my, b[0], b[1]);
    return;
  }

  const shifted = points.map(shift);
  ctx.moveTo(shifted[0][0], shifted[0][1]);
  for (let i = 1; i < shifted.length - 1; i++) {
    const [x, y] = shifted[i];
    const [nx, ny] = shifted[i + 1];
    ctx.quadraticCurveTo(x, y, (x + nx) / 2, (y + ny) / 2);
  }
  const last = shifted[shifted.length - 1];
  ctx.lineTo(last[0], last[1]);
  if (close) ctx.closePath();
}

/// 점들을 이어 한 획 긋는다. halo=false 면 후광 없이 잉크만 (겹쳐 그릴 때 쓴다).
export function stroke(ctx, points, opts = {}) {
  const { width = 3, color = INK, seed = 0, amp = 0.7, close = false, halo = true,
          alpha = 1, sharp = false, fill = null, haloWidth = 5 } = opts;
  ctx.lineCap = sharp ? 'butt' : 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = alpha * fade;

  if (halo) {
    trace(ctx, points, seed, amp, close, sharp);
    ctx.lineWidth = width + haloWidth;
    ctx.strokeStyle = PAPER;
    ctx.stroke();
  }
  trace(ctx, points, seed, amp, close, sharp);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/// 채우고 테두리까지. 똥과 얼룩이 쓴다.
export function fillStroke(ctx, points, opts = {}) {
  const { width = 3, color = INK, fill = POOP, seed = 0, amp = 0.7, alpha = 1 } = opts;
  ctx.globalAlpha = alpha * fade;
  trace(ctx, points, seed, amp, true, false);
  ctx.lineWidth = width + 4.5;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = PAPER;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function circle(ctx, cx, cy, r, opts = {}) {
  const { width = 3, color = INK, fill = null, halo = true, alpha = 1, seed = 0, amp = 0.5 } = opts;
  ctx.globalAlpha = alpha * fade;
  ctx.beginPath();
  // 컴퍼스로 그린 원이 아니라 손으로 그린 원. 반지름을 각도마다 조금씩 흔든다.
  for (let i = 0; i <= 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = r + wiggle(seed, i, amp);
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.closePath();
  if (halo) {
    ctx.lineWidth = width + 4.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = PAPER;
    ctx.stroke();
  }
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/// 찢어 붙인 종이 조각.
///
/// 획마다 두른 후광만으로는 부족한 자리가 있다 — 밑에 깔린 게 슬랙 사이드바처럼
/// 글자로 빽빽하면 내 글자와 남의 글자가 서로 경쟁한다. 읽혀야 하는 덩어리 밑에는
/// 종이를 한 장 깐다. 모서리를 흔들어 둬서 상자가 아니라 찢은 조각으로 읽힌다.
export function paperScrap(ctx, x, y, w, h, seed = 0) {
  const points = [];
  const edge = (x0, y0, x1, y1, from) => {
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const nx = (y1 - y0) / Math.hypot(x1 - x0, y1 - y0);
      const ny = -(x1 - x0) / Math.hypot(x1 - x0, y1 - y0);
      const off = wiggle(seed, from + i, 2.2);
      points.push([x0 + (x1 - x0) * t + nx * off, y0 + (y1 - y0) * t + ny * off]);
    }
  };
  edge(x, y, x + w, y, 0);
  edge(x + w, y, x + w, y + h, 8);
  edge(x + w, y + h, x, y + h, 16);
  edge(x, y + h, x, y, 24);

  ctx.globalAlpha = 0.94 * fade;
  ctx.beginPath();
  points.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
  ctx.closePath();
  ctx.fillStyle = PAPER_SOLID;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/// 후광 깔린 글씨. 숫자는 타자기, 한글은 시스템 고딕으로 갈린다.
///
/// 후광 굵기는 **글자 크기에서 뽑는다**. 고정값을 쓰면 큰 숫자에서는 모자라고
/// 작은 한글에서는 획 사이 틈보다 두꺼워져 글자가 흰 덩어리로 뭉갠다.
export function text(ctx, value, x, y, opts = {}) {
  const { font = '400 16px "American Typewriter", "Courier New", monospace', color = INK,
          align = 'left', baseline = 'alphabetic', alpha = 1 } = opts;
  const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 16);
  const halo = opts.halo ?? size * 0.22;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  // 글씨가 깜빡일 때 후광까지 같이 흐려지면 어두운 벽지 위에서 글자가 뭉개진다.
  // 후광은 거의 그대로 두고 잉크만 옅어지게 한다.
  ctx.globalAlpha = Math.min(1, alpha + 0.32) * fade;
  ctx.lineWidth = halo;
  ctx.strokeStyle = PAPER;
  ctx.strokeText(value, x, y);
  ctx.globalAlpha = alpha * fade;
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
  ctx.globalAlpha = 1;
}
