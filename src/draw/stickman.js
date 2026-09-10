// 졸라맨.
//
// 뼈대를 각도로 만들고 그 위에 획을 긋는다. 상태마다 포즈를 따로 잡는 이유는,
// 달리기 사이클 하나를 전 상태에 돌려 쓰면 「같은 그림이 빨라지기만」 하기 때문이다.
// 서 있을 때 숨을 쉬고, 달리면 몸이 앞으로 기울고, 맞으면 획이 사방으로 흩어진다.
//
// 각도는 전부 **똑바로 아래가 0**. 캔버스는 y 가 아래로 자라므로 sin 이 가로, cos 이 세로다.

import { INK, RED, PENCIL, stroke, circle, wiggle, text, setFade } from './ink.js';

const THIGH = 14, SHIN = 14, UPPER = 11, FORE = 11;
const TORSO = 25, NECK = 7, HEAD_R = 9.5;
const HIP_Y = -(THIGH + SHIN + 1);
/// 발끝에서 머리 꼭대기까지. 판정 상자가 이 값을 쓴다.
export const BODY_H = -HIP_Y + TORSO + NECK + HEAD_R * 2;

function limb(ox, oy, a1, l1, a2, l2) {
  const jx = ox + Math.sin(a1) * l1;
  const jy = oy + Math.cos(a1) * l1;
  return [[ox, oy], [jx, jy], [jx + Math.sin(a2) * l2, jy + Math.cos(a2) * l2]];
}

/// 달릴 때의 다리. 무릎은 뒤로만 접히고, 뒤꿈치는 발을 뒤로 뺄 때 가장 높이 올라온다.
function runLegs(ph, run) {
  const swing = 0.34 + run * 0.44;
  const heelUp = (phase) => 0.24 + 0.66 * (0.5 - 0.5 * Math.cos(phase)) * run;
  const thigh = Math.sin(ph) * swing;
  return [[thigh, thigh - heelUp(ph)], [-thigh, -thigh - heelUp(ph + Math.PI)]];
}

function pose(p, time) {
  const c = p.crouch;

  // 이긴 사람. 두 팔을 번쩍 들고 발을 구른다.
  if (p.cheer) {
    const hop = Math.abs(Math.sin(time * 5.5));
    return {
      hipY: HIP_Y - hop * 7, lean: 0, bob: -hop * 3,
      legs: [[-0.30 - hop * 0.5, -0.46 - hop * 0.7], [0.30 + hop * 0.5, 0.46 + hop * 0.7]],
      arms: [[2.55 + hop * 0.12, 2.95], [-2.55 - hop * 0.12, -2.95]],
    };
  }

  // 다음 판을 기다리는 사람. 넘어져 있으면 「죽었다」로 읽히는데 그건 사실이 아니다 —
  // 팔짱을 끼고 서서 구경하는 자세로 둔다.
  if (p.waiting) {
    const sway = Math.sin(time * 1.6);
    return {
      hipY: HIP_Y, lean: 0.02, bob: sway * 0.6,
      legs: [[-0.16, -0.18], [0.17, 0.19]],
      arms: [[1.15, 2.35], [-1.15, -2.35]],   // 팔짱
    };
  }

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

  // 몸을 던진 자세. 거의 눕다시피 해서 팔을 앞으로 뻗는다 —
  // 서서 못 받는 공을 받는 동작이라, 낮고 길어 보여야 뜻이 통한다.
  if (p.slide > 0) {
    const go = Math.min(1, p.slide / 0.42);
    return {
      hipY: HIP_Y * 0.34, lean: 1.18, bob: 0,
      legs: [[-0.55, -0.30], [-0.20, 0.34]],
      arms: [[1.52, 1.66], [1.34, 1.52]],
      slide: go,
    };
  }

  const run = Math.min(Math.abs(p.vx) / 520, 1);

  // 붙잡고 있으면 앞팔을 상대 쪽으로 뻗는다. 뻗은 팔 하나로 상황이 다 읽힌다.
  // **다리는 제 갈 길을 간다** — 끌고 가는 중이면 걷는 다리가 나와야 끌고 가는 것으로 보인다.
  if (p.grabbing >= 0 || p.heldBy >= 0) {
    const holding = p.grabbing >= 0;
    const shake = p.heldBy >= 0 ? Math.sin(time * 34) * 0.16 : 0;
    return {
      hipY: HIP_Y, lean: holding ? 0.24 : -0.16,
      bob: run > 0.05 ? -Math.abs(Math.sin(p.walk)) * (1.2 + run * 1.6)
                      : Math.sin(time * 9) * 1.2,
      legs: run > 0.05 ? runLegs(p.walk, run) : [[-0.34, -0.42], [0.36, 0.44]],
      // 잡은 쪽은 두 팔을 앞으로, 잡힌 쪽은 뿌리치듯 위로 허둥댄다.
      arms: holding
        ? [[1.45, 1.62], [1.30, 1.50]]
        : [[-1.9 + shake, -2.6 + shake], [-1.5 - shake, -2.3 - shake]],
    };
  }

  if (run > 0.03) {
    const ph = p.walk;
    // 팔은 같은 쪽 다리와 반대 위상. 이게 어긋나면 사람이 아니라 인형처럼 걷는다.
    const armSwing = 0.30 + run * 0.40;
    const upperL = -Math.sin(ph) * armSwing;
    const elbow = 0.85 + run * 0.45;
    return {
      hipY: HIP_Y, lean: 0.09 + run * 0.16,
      bob: -Math.abs(Math.sin(ph)) * (1.4 + run * 2.0),
      legs: runLegs(ph, run),
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
  // 다음 판을 기다리는 사람은 **넘어지지 않는다.** 죽은 자세로 그리면 「쟤 죽었네」로
  // 읽히는데, 사실은 다음 판을 기다리며 구경하는 중이다.
  const waiting = Boolean(p.waiting);
  // 탈락한 사람은 옅게. 누워 있는 것만으로도 알 수 있지만, 살아 있는 사람 뒤에 겹치면
  // 누가 아직 뛰고 있는지 한눈에 안 들어온다.
  if (opts.faded) setFade(0.55);
  ctx.save();
  ctx.translate(p.x, p.groundY - p.air);

  if (p.dead && !waiting) {
    // 뒤로 넘어간다. 회전이 끝나면 그 자리에 누워 있다.
    const t = Math.min(p.deadFor / 0.42, 1);
    const ease = 1 - (1 - t) * (1 - t);
    ctx.translate(-p.facing * 18 * ease, -3 * ease);
    ctx.rotate(p.facing * ease * Math.PI * 0.46);
  }
  ctx.scale(p.facing, 1); // 뒤집힌 공간 안에서는 +x 가 언제나 「앞」이다
  // 몸을 던지면 앞으로 쏠린다. 발이 뒤에 남고 어깨가 앞으로 나간다.
  if (p.slide > 0) ctx.translate(-6, 0);

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

  const w = 3.7;
  const pen = (i) => ({ width: w, color: INK, seed: seed + i, amp: 0.6 });

  // 팔은 몸과 따로 방향을 잡는다. 오른쪽 사람을 붙잡은 채 왼쪽으로 끌고 갈 때,
  // 다리는 왼쪽으로 걷고 팔은 오른쪽으로 뻗어 있어야 붙잡고 있는 것으로 읽힌다.
  // 몸 전체가 facing 으로 이미 뒤집혀 있으므로, 반대쪽을 잡았으면 각도만 뒤집는다.
  const armFlip = p.grabAim && p.grabAim !== p.facing ? -1 : 1;
  const arm = (i) => limb(shldX, shldY, s.arms[i][0] * armFlip, UPPER, s.arms[i][1] * armFlip, FORE);
  const armA = arm(0);
  const armB = arm(1);

  // 다리를 먼저 그려 몸통 뒤로 보낸다.
  stroke(ctx, limb(0, hipY, s.legs[0][0], THIGH, s.legs[0][1], SHIN), pen(1));
  stroke(ctx, limb(0, hipY, s.legs[1][0], THIGH, s.legs[1][1], SHIN), pen(2));

  // 색연필로 슥 칠한 셔츠. **잉크 밑에 깔고** 위에 검은 선을 그대로 얹는다 —
  // 색이 낙서를 덮어 버리면 이 게임의 그림체가 아니게 된다. 소매는 어깨에서 팔꿈치까지만.
  // 몸통 잉크가 흰 후광을 두르고 위에 얹히므로, 그 폭보다 넓게 칠해야 색이 남는다.
  if (opts.color) {
    const shirt = { color: opts.color, alpha: 0.8, halo: false, amp: 0.45 };
    stroke(ctx, [[0, hipY], [shldX * 0.5, (hipY + shldY) / 2], [shldX, shldY]],
           { ...shirt, width: 19, seed: seed + 31 });
    stroke(ctx, [armA[0], armA[1]], { ...shirt, width: 14, seed: seed + 32 });
    stroke(ctx, [armB[0], armB[1]], { ...shirt, width: 14, seed: seed + 33 });
  }

  stroke(ctx, [[0, hipY], [shldX * 0.5, (hipY + shldY) / 2], [shldX, shldY]], pen(3));
  stroke(ctx, armA, pen(4));
  stroke(ctx, armB, pen(5));
  stroke(ctx, [[shldX, shldY], [neckX, neckY]], pen(6));
  circle(ctx, headX, headY, HEAD_R, { width: w, color: INK, seed: seed + 7, amp: 0.55 });

  drawFace(ctx, headX, headY, p, time, seed);
  ctx.restore();

  if (p.slide > 0) {
    // 미끄러진 자국. 뒤로 흩날리는 짧은 선 몇 개.
    const feet = p.groundY - p.air;
    for (let i = 0; i < 3; i++) {
      const back = -p.facing * (16 + i * 13);
      const up = 2 + i * 3;
      stroke(ctx, [[p.x + back, feet - up], [p.x + back - p.facing * 12, feet - up - 3]],
             { width: 1.8, color: PENCIL, seed: seed + 90 + i, amp: 0.7, halo: false,
               alpha: 0.5 * Math.min(1, p.slide / 0.2) });
    }
  }
  if (p.dead && !waiting) drawImpact(ctx, p, seed);
  if (opts.name) drawTag(ctx, p, opts);
  if (opts.faded) setFade(1);
}

/// 머리 위 이름표. 뒤집힌 공간 밖에서 그린다 — 안에서 그리면 왼쪽을 볼 때 글자가 뒤집힌다.
/// 이름표가 사람보다 넓어지지 않게 글씨를 줄인다.
///
/// 「전자결재 담당자」를 12px 로 쓰면 이름표 하나가 졸라맨 세 명 폭이 된다. 셋만 모여도
/// 이름표끼리 겹쳐서 누가 누군지 못 읽는다. 짧은 이름은 그대로 두고 긴 것만 줄인다.
const TAG_W = 92;
const TAG_MIN = 8.5;
function tagFont(ctx, label, size) {
  const font = (px) => `700 ${px}px "Apple SD Gothic Neo", sans-serif`;
  ctx.font = font(size);
  const wide = ctx.measureText(label).width;
  return font(wide <= TAG_W ? size : Math.max(TAG_MIN, size * TAG_W / wide));
}

function drawTag(ctx, p, opts) {
  if (p.waiting) {
    const y = p.groundY - p.air - BODY_H - 12;
    const label = `${opts.name} · 다음 판`;
    text(ctx, label, p.x, y, {
      font: tagFont(ctx, label, 11), color: opts.color ?? PENCIL, align: 'center',
    });
    return;
  }
  if (p.dead) return;
  const y = p.groundY - p.air - BODY_H - 12;
  // 이름도 옷과 같은 색으로. 화면이 어수선할 때 누가 누군지 이걸로 잇는다.
  const font = tagFont(ctx, opts.name, 12);
  text(ctx, opts.name, p.x, y, {
    font, color: opts.color ?? (opts.mine ? INK : PENCIL), align: 'center',
  });
  // 내 졸라맨에만 빨간 밑줄. 여럿이 겹쳐 있을 때 어느 게 나인지 이걸로 찾는다.
  if (opts.mine) {
    ctx.font = font;
    const half = Math.max(14, ctx.measureText(opts.name).width / 2 + 3);
    stroke(ctx, [[p.x - half, y + 4], [p.x + half, y + 4]],
           { width: 2.2, color: RED, seed: 21, amp: 0.7, haloWidth: 3 });
  }
}

function drawFace(ctx, cx, cy, p, time, seed) {
  const face = { width: 1.7, color: INK, halo: false, seed: seed + 11, amp: 0.18 };

  if (p.dead && !p.waiting) {
    // ✕ ✕. 만화에서 이것 말고 다른 뜻으로 읽히는 눈은 없다.
    for (const dx of [-3.4, 3.4]) {
      stroke(ctx, [[cx + dx - 2, cy - 3], [cx + dx + 2, cy + 1]], face);
      stroke(ctx, [[cx + dx + 2, cy - 3], [cx + dx - 2, cy + 1]], face);
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
