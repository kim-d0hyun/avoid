// 네모. 넷이서(협동)에서 사람을 그리는 모양.
//
// 졸라맨은 머리 위에 서면 목이 부러져 보인다. 이 게임은 사람 위에 사람이 서고, 웅크려 계단이
// 되고, 손을 내려 끌어올리는 게임이라 **윗면이 평평한 네모**여야 한다 — 피코파크의 고양이가
// 그렇게 생긴 이유다. 머리가 곧 몸이고, 다리는 밑으로 나온 짧은 획 둘, 팔은 뭔가를 잡을 때만.
//
// 관절이 없는 대신 **찌그러지고 늘어난다**: 웅크리면 넓고 낮게, 뛰면 좁고 길게, 누가 위에 서면
// 눌린다. 이것 말고는 움직임을 보일 길이 없는데, 이게 아주 잘 읽힌다.

import { INK, RED, PENCIL, stroke, circle, text, setFade } from './ink.js';

export const BLOCK_W = 34;     // 한 칸(42)의 0.8
export const BLOCK_H = 50;     // 1.2칸
export const CROUCH_H = 28;    // 웅크리면 0.7칸 — 한 칸 굴을 지난다

/// 공중에 있나. 넷이서의 air 는 판 맨 밑에서 잰 높이라 2층에 서 있어도 크다 — 높이로는 못 가른다.
/// 내 사람은 grounded 가 있고, 남은 세로 속도(vyDraw)로 본다 (서 있으면 0 으로 온다).
export function inAir(p) {
  if (p.grounded !== undefined) return !p.grounded && !p.onLadder;
  return Math.abs(p.vyDraw ?? 0) > 1;
}

/// 몸통 크기. 웅크림·점프·눌림에 따라 달라진다.
export function blockSize(p) {
  const c = p.crouch ?? 0;
  const flying = inAir(p) && Math.abs(p.vyDraw ?? p.vy ?? 0) > 60;
  let w = BLOCK_W + c * 8 - (flying ? 5 : 0);
  let h = BLOCK_H - c * (BLOCK_H - CROUCH_H) + (flying ? 7 : 0);
  // 누가 위에 서 있으면 눌린다. 무게가 보여야 「밟고 있다」가 양쪽 화면에서 읽힌다.
  const load = Math.min(2, p.load ?? 0);
  h *= 1 - 0.1 * load; w *= 1 + 0.06 * load;
  // 착지 직후 0.1초 눌렸다 돌아온다.
  const land = Math.max(0, p.landed ?? 0);
  h *= 1 - 0.18 * land; w *= 1 + 0.12 * land;
  return { w, h };
}

/// opts: { name, mine, color, mark, crown, faded, host }
export function drawBlock(ctx, p, time, seed, opts = {}) {
  if (opts.faded) setFade(0.55);
  // 끌려 올라오는 중이면 시작 자리에서 지금 자리로 스르륵 (자기 화면에서만).
  let px = p.x, pair = p.air;
  if ((p.lift ?? 0) > 0 && p.liftFrom) { const t = 1 - p.lift / 0.32; px = p.liftFrom.x + (p.x - p.liftFrom.x) * t; pair = p.liftFrom.air + (p.air - p.liftFrom.air) * t; }
  const feetY = p.groundY - pair;
  const { w, h } = blockSize(p);
  const tilt = (p.knock ? Math.sign(p.knock) * Math.min(0.26, Math.abs(p.knock) / 900) : 0)
             + (p.hang ? 0.08 * Math.sin(time * 6) : 0);
  const color = opts.color ?? PENCIL;

  ctx.save();
  ctx.translate(px, feetY);
  if (tilt) ctx.rotate(tilt);
  ctx.scale(p.facing < 0 ? -1 : 1, 1);           // 뒤집힌 공간에서 +x 가 늘 「앞」

  const x0 = -w / 2, y0 = -h - 3;
  const pen = (i, wd = 3.4) => ({ width: wd, color: INK, seed: seed + i, amp: 0.55 });
  // 색연필 빗금 — 잉크 밑에 깔린다. 색이 낙서를 덮으면 이 게임 그림체가 아니다.
  ctx.save();
  ctx.beginPath(); roundRect(ctx, x0 + 2, y0 + 2, w - 4, h - 4, 7); ctx.clip();
  for (let k = -h; k < w + h; k += 7) {
    stroke(ctx, [[x0 + k, y0 + h], [x0 + k + h, y0]],
           { width: 2.2, color, seed: seed + 60 + k, amp: 0.25, halo: false, alpha: 0.55 });
  }
  ctx.restore();
  // 테두리. 둥근 네모를 손으로 그은 획 넷.
  const r = 8;
  stroke(ctx, [[x0 + r, y0], [x0 + w - r, y0]], pen(1));
  stroke(ctx, [[x0 + w, y0 + r], [x0 + w, y0 + h - r]], pen(2));
  stroke(ctx, [[x0 + w - r, y0 + h], [x0 + r, y0 + h]], pen(3));
  stroke(ctx, [[x0, y0 + h - r], [x0, y0 + r]], pen(4));
  for (const [cx, cy, a0] of [[x0 + r, y0 + r, Math.PI], [x0 + w - r, y0 + r, -Math.PI / 2],
                              [x0 + w - r, y0 + h - r, 0], [x0 + r, y0 + h - r, Math.PI / 2]]) {
    ctx.beginPath(); ctx.lineWidth = 3.4; ctx.strokeStyle = INK; ctx.lineCap = 'round';
    ctx.arc(cx, cy, r, a0, a0 + Math.PI / 2); ctx.stroke();
  }

  // 다리 — 몸 밑으로 나온 짧은 획 둘. 걸을 때 번갈아, 뛸 때 접는다.
  // **발끝은 발 높이(0)에서 끝난다.** 밑으로 더 그으면 서 있는 사람의 발이 땅에 박혀 보인다.
  const legL = -w * 0.27, legR = w * 0.27;
  if (inAir(p)) {
    stroke(ctx, [[legL, -4], [legL + 3, 0]], pen(5, 3));
    stroke(ctx, [[legR, -4], [legR - 3, 0]], pen(6, 3));
  } else {
    const ph = Math.sin(p.walk ?? 0) * Math.min(1, Math.abs(p.vx ?? 0) / 120);
    stroke(ctx, [[legL, -4], [legL - ph * 5, 0]], pen(5, 3));
    stroke(ctx, [[legR, -4], [legR + ph * 5, 0]], pen(6, 3));
  }

  // 팔 — 잡고 있을 때만. 밀 때는 앞으로 둘, 매달릴 때는 위로 하나, 끌어올릴 때는 아래로 하나.
  if (p.pushing) {
    stroke(ctx, [[x0 + w, y0 + h * 0.45], [x0 + w + 10, y0 + h * 0.4]], pen(7, 3));
    stroke(ctx, [[x0 + w, y0 + h * 0.7], [x0 + w + 10, y0 + h * 0.7]], pen(8, 3));
  } else if (p.hang) {
    stroke(ctx, [[0, y0], [0, y0 - 14]], pen(7, 3));
  } else if (p.pulling) {
    // 끌어올리는 손 — 옆 아래로 크게 뻗고 끝에 손(동그라미). 「내가 잡아 준다」가 보이게.
    stroke(ctx, [[x0 + w, y0 + h * 0.5], [x0 + w + 16, y0 + h + 16]], pen(7, 3.4));
    circle(ctx, x0 + w + 16, y0 + h + 16, 3.2, { width: 2, color: INK, halo: false, seed: seed + 9, amp: 0.2 });
  } else if ((p.pulled ?? 0) > 0) {
    // 잡혀 올라오는 손 — 위로 뻗는다.
    stroke(ctx, [[0, y0], [12, y0 - 14]], pen(7, 3.4));
    circle(ctx, 12, y0 - 14, 3, { width: 2, color: INK, halo: false, seed: seed + 10, amp: 0.2 });
  }

  // 얼굴 — 윗쪽 3분의 1. 눈 둘, 입 하나. 3.4초에 한 번 깜빡인다.
  const ey = y0 + h * 0.32;
  const face = { width: 1.8, color: INK, halo: false, seed: seed + 11, amp: 0.18 };
  if (p.dead || p.stun > 0) {
    for (const dx of [-6, 6]) {
      stroke(ctx, [[dx - 2.5, ey - 3], [dx + 2.5, ey + 2]], face);
      stroke(ctx, [[dx + 2.5, ey - 3], [dx - 2.5, ey + 2]], face);
    }
  } else {
    const blink = (time % 3.4) < 0.12;
    for (const dx of [-6, 6]) {
      const x = dx + 1.2;
      blink ? stroke(ctx, [[x - 2, ey - 1], [x + 2, ey - 1]], face)
            : stroke(ctx, [[x, ey - 3.2], [x, ey + 0.4]], face);
    }
    if (p.danger) circle(ctx, 0.6, ey + 8, 2.6, { width: 1.6, color: INK, fill: INK, halo: false, seed: seed + 13, amp: 0.15 });
    else stroke(ctx, [[-3.4, ey + 8.5], [3.6, ey + 8]], face);
  }

  // 머리 표 — 삐친 머리 · 안경 · 단발 · 모자 (졸라맨과 같은 규칙).
  drawMark(ctx, x0, y0, w, ey, opts.mark, color, seed);
  ctx.restore();

  if (opts.name) drawTag(ctx, p, opts, h);
  if (opts.faded) setFade(1);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
}

function drawMark(ctx, x0, y0, w, ey, mark, color, seed) {
  if (mark === undefined || mark === null) return;
  const pen = (i, wd = 2) => ({ width: wd, color, seed: seed + 40 + i, amp: 0.3, halo: false });
  const cx = 0;
  switch (((mark % 4) + 4) % 4) {
    case 0: stroke(ctx, [[cx - 3, y0 + 1], [cx - 1, y0 - 6], [cx + 6, y0 - 9], [cx + 3, y0 - 3]], pen(0, 2.2)); break;
    case 1:
      circle(ctx, -4.8, ey - 1.4, 4.6, pen(1, 1.6)); circle(ctx, 7.2, ey - 1.4, 4.6, pen(2, 1.6));
      stroke(ctx, [[-0.2, ey - 1.6], [2.6, ey - 1.6]], pen(3, 1.4)); break;
    case 2:
      stroke(ctx, [[x0 - 1.5, y0 + 16], [x0 - 2, y0 + 3], [cx, y0 - 4], [x0 + w + 2, y0 + 3], [x0 + w + 1.5, y0 + 16]], pen(4, 2.6)); break;
    default:
      stroke(ctx, [[x0 + 3, y0 + 1], [x0 + 6, y0 - 4], [cx, y0 - 6], [x0 + w - 6, y0 - 4], [x0 + w - 3, y0 + 1]], pen(5, 5.5));
      stroke(ctx, [[cx + 2, y0 - 1.5], [x0 + w + 9, y0 - 3]], pen(6, 2.8)); break;
  }
}

const TAG_W = 92, TAG_MIN = 8.5;
function tagFont(ctx, label, size) {
  const font = (px) => `700 ${px}px "Apple SD Gothic Neo", sans-serif`;
  ctx.font = font(size);
  const wide = ctx.measureText(label).width;
  return font(wide <= TAG_W ? size : Math.max(TAG_MIN, size * TAG_W / wide));
}

function drawTag(ctx, p, opts, bodyH) {
  const y = p.groundY - p.air - bodyH - 22;
  const font = tagFont(ctx, opts.name, 12);
  const tint = opts.color ?? (opts.mine ? INK : PENCIL);
  ctx.font = font;
  const half = ctx.measureText(opts.name).width / 2;
  if (opts.crown) {
    const cx = p.x - half - 9, cy = y - 4;
    stroke(ctx, [[cx - 5, cy], [cx - 5, cy - 5], [cx - 2.5, cy - 2], [cx, cy - 6.5], [cx + 2.5, cy - 2], [cx + 5, cy - 5], [cx + 5, cy]],
           { width: 1.7, color: tint, seed: 88, amp: 0.35, halo: false });
    stroke(ctx, [[cx - 5.5, cy + 1.2], [cx + 5.5, cy + 1.2]], { width: 1.7, color: tint, seed: 89, amp: 0.3, halo: false });
  }
  text(ctx, opts.name, p.x, y, { font, color: tint, align: 'center' });
  if (opts.mine) {
    ctx.font = font;
    const hw = Math.max(14, ctx.measureText(opts.name).width / 2 + 3);
    stroke(ctx, [[p.x - hw, y + 4], [p.x + hw, y + 4]], { width: 2.2, color: RED, seed: 21, amp: 0.7, haloWidth: 3 });
  }
}
