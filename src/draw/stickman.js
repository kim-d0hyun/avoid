// 졸라맨.
//
// 뼈대를 각도로 만들고 그 위에 획을 긋는다. 상태마다 포즈를 따로 잡는 이유는,
// 달리기 사이클 하나를 전 상태에 돌려 쓰면 「같은 그림이 빨라지기만」 하기 때문이다.
// 서 있을 때 숨을 쉬고, 달리면 몸이 앞으로 기울고, 맞으면 획이 사방으로 흩어진다.
//
// 각도는 전부 **똑바로 아래가 0**. 캔버스는 y 가 아래로 자라므로 sin 이 가로, cos 이 세로다.

import { INK, RED, PENCIL, stroke, circle, wiggle, text, setFade } from './ink.js';

const THIGH = 17, SHIN = 17, UPPER = 13, FORE = 13;
const TORSO = 29, NECK = 8, HEAD_R = 11;
const HIP_Y = -(THIGH + SHIN + 1);
/// 발끝에서 머리 꼭대기까지. 판정 상자가 이 값을 쓴다.
export const BODY_H = -HIP_Y + TORSO + NECK + HEAD_R * 2;

function limb(ox, oy, a1, l1, a2, l2) {
  const jx = ox + Math.sin(a1) * l1;
  const jy = oy + Math.cos(a1) * l1;
  return [[ox, oy], [jx, jy], [jx + Math.sin(a2) * l2, jy + Math.cos(a2) * l2]];
}

function pose(p, time) {
  const c = p.crouch;

  if (p.air > 0.5) {
    // 공중. 앞다리는 접고 뒷다리는 뻗고 팔은 위로 — 떴다는 게 실루엣만으로 읽혀야 한다.
    const rise = Math.max(-1, Math.min(1, (p.vyDraw ?? p.vy) / 420));
    return {
      hipY: HIP_Y, lean: 0.06, bob: 0,
      legs: [[-0.70, -1.45], [0.55, 0.85]],
      arms: [[-2.30 - rise * 0.22, -2.75], [-1.90 + rise * 0.18, -2.45]],
    };
  }

  if (c > 0.05) {
    // 웅크리기. 무릎을 깊게 접어 앉고 팔로 머리를 감싼다. 판정 상자가 절반이 되는 자세다.
    const deep = (a, b) => a + (b - a) * c;
    return {
      hipY: deep(HIP_Y, HIP_Y + 16), lean: deep(0.10, 0.46), bob: 0,
      legs: [[deep(0, -1.15), deep(0, 1.30)], [deep(0, 1.15), deep(0, -1.30)]],
      arms: [[deep(0.16, 2.05), deep(0.30, 2.80)], [deep(-0.16, -2.05), deep(-0.30, -2.80)]],
    };
  }

  const run = Math.min(Math.abs(p.vx) / 520, 1);
  if (run > 0.03) {
    // 달리기. 무릎은 뒤로만 접히고, 뒤꿈치는 발을 뒤로 뺄 때 가장 높이 올라온다.
    const ph = p.walk;
    const swing = 0.34 + run * 0.44;
    const heelUp = (phase) => 0.24 + 0.66 * (0.5 - 0.5 * Math.cos(phase)) * run;
    const thighL = Math.sin(ph) * swing;
    const thighR = -thighL;
    // 팔은 같은 쪽 다리와 반대 위상. 이게 어긋나면 사람이 아니라 인형처럼 걷는다.
    const armSwing = 0.30 + run * 0.40;
    const upperL = -Math.sin(ph) * armSwing;
    const elbow = 0.85 + run * 0.45;
    return {
      hipY: HIP_Y, lean: 0.09 + run * 0.16,
      bob: -Math.abs(Math.sin(ph)) * (1.4 + run * 2.0),
      legs: [[thighL, thighL - heelUp(ph)], [thighR, thighR - heelUp(ph + Math.PI)]],
      arms: [[upperL, upperL - elbow], [-upperL, -upperL - elbow]],
    };
  }

  // 가만히. 숨만 쉰다. 이 미세한 움직임이 없으면 죽은 그림으로 보인다.
  const breath = Math.sin(time * 2.3);
  return {
    hipY: HIP_Y, lean: 0.03, bob: breath * 0.8,
    legs: [[-0.13, -0.15], [0.14, 0.16]],
    arms: [[0.62 + breath * 0.05, 0.74 + breath * 0.07],
           [-0.62 - breath * 0.05, -0.74 - breath * 0.07]],
  };
}

/// opts: { name, mine, faded }
export function drawStickman(ctx, p, time, seed, opts = {}) {
  // 탈락한 사람은 옅게. 누워 있는 것만으로도 알 수 있지만, 살아 있는 사람 뒤에 겹치면
  // 누가 아직 뛰고 있는지 한눈에 안 들어온다.
  if (opts.faded) setFade(0.55);
  ctx.save();
  ctx.translate(p.x, p.groundY - p.air);

  if (p.dead) {
    // 뒤로 넘어간다. 회전이 끝나면 그 자리에 누워 있다.
    const t = Math.min(p.deadFor / 0.42, 1);
    const ease = 1 - (1 - t) * (1 - t);
    ctx.translate(-p.facing * 18 * ease, -3 * ease);
    ctx.rotate(p.facing * ease * Math.PI * 0.46);
  }
  ctx.scale(p.facing, 1); // 뒤집힌 공간 안에서는 +x 가 언제나 「앞」이다

  const s = pose(p, time);
  const hipY = s.hipY + s.bob;
  const lean = p.dead ? 0.02 : s.lean;

  // 몸통·목·머리는 엉덩이에서 기울기를 따라 쌓아 올린다.
  const shldX = Math.sin(lean) * TORSO;
  const shldY = hipY - Math.cos(lean) * TORSO;
  const neckX = shldX + Math.sin(lean) * NECK;
  const neckY = shldY - Math.cos(lean) * NECK;
  const headX = neckX + Math.sin(lean) * HEAD_R;
  const headY = neckY - Math.cos(lean) * HEAD_R;

  const w = 4.3;
  const pen = (i) => ({ width: w, color: INK, seed: seed + i, amp: 0.6 });
  const armA = limb(shldX, shldY, s.arms[0][0], UPPER, s.arms[0][1], FORE);
  const armB = limb(shldX, shldY, s.arms[1][0], UPPER, s.arms[1][1], FORE);

  // 다리를 먼저 그려 몸통 뒤로 보낸다.
  stroke(ctx, limb(0, hipY, s.legs[0][0], THIGH, s.legs[0][1], SHIN), pen(1));
  stroke(ctx, limb(0, hipY, s.legs[1][0], THIGH, s.legs[1][1], SHIN), pen(2));

  // 색연필로 슥 칠한 셔츠. **잉크 밑에 깔고** 위에 검은 선을 그대로 얹는다 —
  // 색이 낙서를 덮어 버리면 이 게임의 그림체가 아니게 된다. 소매는 어깨에서 팔꿈치까지만.
  // 몸통 잉크가 흰 후광을 두르고 위에 얹히므로, 그 폭보다 넓게 칠해야 색이 남는다.
  if (opts.color) {
    const shirt = { color: opts.color, alpha: 0.8, halo: false, amp: 0.5 };
    stroke(ctx, [[0, hipY], [shldX * 0.5, (hipY + shldY) / 2], [shldX, shldY]],
           { ...shirt, width: 22, seed: seed + 31 });
    stroke(ctx, [armA[0], armA[1]], { ...shirt, width: 16, seed: seed + 32 });
    stroke(ctx, [armB[0], armB[1]], { ...shirt, width: 16, seed: seed + 33 });
  }

  stroke(ctx, [[0, hipY], [shldX * 0.5, (hipY + shldY) / 2], [shldX, shldY]], pen(3));
  stroke(ctx, armA, pen(4));
  stroke(ctx, armB, pen(5));
  stroke(ctx, [[shldX, shldY], [neckX, neckY]], pen(6));
  circle(ctx, headX, headY, HEAD_R, { width: w, color: INK, seed: seed + 7, amp: 0.55 });

  drawFace(ctx, headX, headY, p, time, seed);
  ctx.restore();

  if (p.dead) drawImpact(ctx, p, seed);
  if (opts.name) drawTag(ctx, p, opts);
  if (opts.faded) setFade(1);
}

/// 머리 위 이름표. 뒤집힌 공간 밖에서 그린다 — 안에서 그리면 왼쪽을 볼 때 글자가 뒤집힌다.
function drawTag(ctx, p, opts) {
  if (p.dead) return;
  const y = p.groundY - p.air - BODY_H - 12;
  // 이름도 옷과 같은 색으로. 화면이 어수선할 때 누가 누군지 이걸로 잇는다.
  text(ctx, opts.name, p.x, y, {
    font: `700 13px "Apple SD Gothic Neo", sans-serif`,
    color: opts.color ?? (opts.mine ? INK : PENCIL), align: 'center',
  });
  // 내 졸라맨에만 빨간 밑줄. 여럿이 겹쳐 있을 때 어느 게 나인지 이걸로 찾는다.
  if (opts.mine) {
    const half = Math.max(14, ctx.measureText(opts.name).width / 2 + 3);
    stroke(ctx, [[p.x - half, y + 4], [p.x + half, y + 4]],
           { width: 2.2, color: RED, seed: 21, amp: 0.7, haloWidth: 3 });
  }
}

function drawFace(ctx, cx, cy, p, time, seed) {
  const face = { width: 1.9, color: INK, halo: false, seed: seed + 11, amp: 0.2 };

  if (p.dead) {
    // ✕ ✕. 만화에서 이것 말고 다른 뜻으로 읽히는 눈은 없다.
    for (const dx of [-4, 4]) {
      stroke(ctx, [[cx + dx - 2.4, cy - 3.6], [cx + dx + 2.4, cy + 1.2]], face);
      stroke(ctx, [[cx + dx + 2.4, cy - 3.6], [cx + dx - 2.4, cy + 1.2]], face);
    }
    return;
  }

  // 3.4초에 한 번, 0.12초 동안 눈을 감는다.
  const blink = (time % 3.4) < 0.12;
  for (const dx of [-3.2, 3.2]) {
    const x = cx + dx + 1.1; // 보는 쪽으로 눈이 살짝 쏠린다
    blink
      ? stroke(ctx, [[x - 1.9, cy - 1.6], [x + 1.9, cy - 1.6]], face)
      : stroke(ctx, [[x, cy - 3.4], [x, cy - 0.6]], face);
  }

  // 똥이 코앞이면 입이 벌어진다. 위험을 글자 없이 알려 주는 자리다.
  if (p.danger) {
    circle(ctx, cx + 0.7, cy + 4.4, 2.4, { width: 1.6, color: INK, fill: INK, halo: false, seed: seed + 13, amp: 0.15 });
  } else {
    stroke(ctx, [[cx - 2.4, cy + 4.4], [cx + 2.6, cy + 4.2]], face);
  }
}

/// 맞는 순간 사방으로 튀는 빨간 획. 0.5초 안에 사라진다.
function drawImpact(ctx, p, seed) {
  if (p.deadFor > 0.5) return;
  const fade = 1 - p.deadFor / 0.5;
  const grow = 16 + p.deadFor * 150;
  ctx.save();
  ctx.translate(p.x, p.groundY - p.air - BODY_H * 0.55);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + wiggle(seed, i, 0.4);
    stroke(ctx, [
      [Math.cos(a) * grow * 0.5, Math.sin(a) * grow * 0.36],
      [Math.cos(a) * grow, Math.sin(a) * grow * 0.72],
    ], { width: 3.2, color: RED, alpha: fade, seed: seed + i, amp: 1.2, halo: false });
  }
  ctx.restore();
}
