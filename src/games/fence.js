// 펜싱 — 좁은 판(피스트) 위 1대1. 배구처럼 실시간이다.
//
// 세 수가 서로 물린다 — 찌르기는 베기를 이기고(휘두르는 틈을 찌른다), 베기는 막기를 이기고(막는 칼째
// 쳐낸다), 막기는 찌르기를 이긴다(줄이 맞으면 쳐내고 되찌를 틈이 생긴다). 위·아래 줄이 한 겹 더 얹힌다:
// 찌르기와 막기는 고른 줄 하나만, 베기는 두 줄을 덮는다. 기획: claude.ai 「몰겜 펜싱 기획」.
//
// **판정은 방장이 한다** (배구와 같다). 손님은 「이 수를 이 줄로 냈다」를 보내고, 제 화면에서는 바로
// 칼을 뻗는다(손맛). 맞았는지는 방장이 칼끝 자리(stickman.js bladeTip — 그림과 같은 칼)로 정한다.
// 혼자거나 한 편이 비면 컴퓨터가 그 편을 맡는다.

import { INK, RED, PENCIL, stroke, circle, text, paperScrap } from '../draw/ink.js';
import { drawStickman, bladeTip } from '../draw/stickman.js';

const HAN = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const TEAM_INK = ['#c62f2a', '#1f8a4c'];
const TEAM_NAME = ['빨강', '초록'];
const WIN_AT = 15;

// ── 수 — [준비, 맞는 때, 돌아옴] 프레임 (60분의 1초). 기획의 막대 그대로 ──
const FR = 1 / 60;
export const MOVES = {
  thrust: { wind: 5, act: 6, rec: 15 },
  lunge:  { wind: 14, act: 8, rec: 30 },
  cut:    { wind: 13, act: 8, rec: 21 },
  parry:  { wind: 1, act: 14, rec: 18 },
  // 뒤로 빠른 스텝 — 뒤쪽 방향키 두 번. 떠 있는 동안 HOP_STEP 만큼 빠지고, 내려앉는 동안은 아무것도 못 한다.
  // 칼 수가 아니라 발 수다 — 판정에 안 들어간다. 런지 끝을 피하는 데 쓰라고 둔다.
  hop:    { wind: 1, act: 10, rec: 8 },
};
/// 칼로 치는 수 (판정이 보는 것). 막기·스텝은 아니다.
const ATTACKS = new Set(['thrust', 'lunge', 'cut']);
/// 그림(stickman fencePose)의 진행 k 와 맞춘다 — 준비 동안 0→뻗음, 맞는 때 내내 뻗은 채, 돌아옴에 풀린다.
const POSE = { thrust: [0.3, 0.3], lunge: [0.32, 0.32], cut: [0.45, 0.62], parry: [0.25, 0.25], hop: [0.05, 0.75] };
const total = (m) => (m.wind + m.act + m.rec) * FR;

const WALK = 210;          // 걷는 빠르기 (px/s)
const ACCEL = 1500;        // 걸음이 붙는 빠르기 — 0.14초에 다 붙는다
const BRAKE = 2800;        // 서는 빠르기 — 0.075초
const LUNGE_STEP = 85;     // 런지로 뛰어드는 거리 — 준비+맞는 때 동안
const HOP_STEP = 72;       // 뒤로 스텝 한 번에 빠지는 거리 — 런지 끝(~170px)에서 벗어날 만큼
const STUN = 0.3;          // 막혔을 때 · 막기가 깨졌을 때 굳는 시간
const KEEP = 34;           // 둘이 이보다 가까이 못 붙는다 (몸이 겹친다)
const DOUBLE = 4 * FR;     // 이 안에 둘 다 닿으면 무효
const FREEZE = 1.2;        // 점수가 나면 이만큼 멈춰 보인다 (득점등)
const ALLEZ = 0.7;         // 시작선에 선 뒤 「알레!」까지
const BODY_HALF = 12;      // 몸 판정 폭의 절반
const TARGET_TOP = 72;     // 발에서 이만큼 위까지가 맞는 곳 (머리 위는 안 친다)
const TARGET_LOW = 18;     // 발에서 이만큼 위부터 (발목은 안 친다)

/// 판 — 실제 피스트(14m)를 화면 폭에 맞춘다. 시작선은 가운데에서 2m, 끝 2m 는 경고 구역.
export function piste(world) {
  const L = 90, R = world.w - 90;
  const m = (R - L) / 14;
  return { L, R, m, mid: world.w / 2, start: [world.w / 2 - 2 * m, world.w / 2 + 2 * m] };
}

// ── 편 ──
const picks = (world) => (world.mp.fenceSides ??= new Map());
function rosterSides(world) {
  const sides = new Map();
  const picked = picks(world);
  const ids = [world.mp.myId, ...world.mp.others.keys()].sort((a, c) => a - c);
  ids.forEach((id, i) => {
    const own = id === world.mp.myId ? world.team : picked.get(id);
    sides.set(id, own === undefined ? i % 2 : (own ? 1 : 0));
  });
  return sides;
}
const sideOf = (world, id) => (world.bag.sides?.get(id) ?? (id === world.mp.myId ? world.team ?? 0 : 0));

/// 편마다 피스트에 서는 사람 — 그 편에서 번호가 제일 작은 사람. 없으면 컴퓨터(-1).
function fencersOf(world) {
  const out = [-1, -1];
  const ids = [];
  if (!world.mp.waiting) ids.push(world.mp.myId);
  for (const o of world.mp.others.values()) if (!o.waiting && !o.dead) ids.push(o.id);
  ids.sort((a, c) => a - c);
  for (const id of ids) {
    const s = sideOf(world, id);
    if (out[s] === -1) out[s] = id;
  }
  return out;
}

/// 그 편의 사람(그림 · 자리를 가진 것). 내 사람 · 남 · 컴퓨터.
function body(world, side) {
  const b = world.bag;
  const id = b.fencers[side];
  if (id === -1) return b.cpu[side];
  if (id === world.mp.myId) return world.player;
  return world.mp.others.get(id) ?? b.cpu[side];
}

function freshBag() {
  return {
    score: [0, 0], fencers: [-1, -1], sides: new Map(),
    // 컴퓨터 — 편마다 하나씩 들고 있다가 그 편이 비면 나온다.
    cpu: [0, 1].map((side) => ({ id: -1 - side, side, x: 0, vx: 0, air: 0, vy: 0, crouch: 0, facing: side ? -1 : 1,
                                 walk: 0, dead: false, groundY: 0, fence: idle(), think: 0, plan: null, back: 0 })),
    phase: 'allez',            // allez(시작선에서 기다림) · fight · freeze(점수 난 뒤)
    timer: ALLEZ, call: '앙가르드', callT: 0, callInk: INK,
    lamp: null,                // { side, t } — 먼저 닿게 한 사람 아래 불
    hits: [],                  // 이번 맞댐에서 닿은 것 [{ side, at }]
    reset: 0,                  // 시작선으로 돌린 횟수 (손님이 보고 제 자리를 옮긴다)
    clock: 0, over: false, winner: null, spark: null,
  };
}
const idle = () => ({ act: null, t: 0, line: 0, k: 0, stun: 0, hit: false, parried: false });

/// 수를 낸다. 굳어 있거나 다른 수 중이면 못 낸다 — **돌아오는 동안이 곧 빈틈이다.**
function start(f, act, line) {
  if (f.stun > 0 || f.act) return false;
  Object.assign(f, { act, t: 0, line, k: 0, hit: false, parried: false });
  return true;
}

/// 수의 박자. wind · act · rec · null(끝).
function phaseOf(f) {
  const m = MOVES[f.act];
  if (!m) return null;
  const n = f.t / FR;
  if (n < m.wind) return 'wind';
  if (n < m.wind + m.act) return 'act';
  if (n < m.wind + m.act + m.rec) return 'rec';
  return null;
}

/// 시간을 한 걸음. 그림의 k 도 여기서 맞춘다.
function step(f, dt) {
  f.stun = Math.max(0, f.stun - dt);
  // 그림이 쓰는 줄 — 줄을 바꾸면 손이 0.1초쯤에 걸쳐 옮겨 간다 (뚝 바뀌면 순간이동처럼 보인다)
  const lv = Number.isFinite(f.lv) ? f.lv : f.line;
  f.lv = lv + (f.line - lv) * Math.min(1, dt * 16);
  if (!f.act) { f.k = 0; return; }
  f.t += dt;
  const m = MOVES[f.act];
  const [p0, p1] = POSE[f.act];
  const n = f.t / FR;
  if (n < m.wind) f.k = (n / m.wind) * p0;
  else if (n < m.wind + m.act) f.k = p0 + (p1 - p0) * ((n - m.wind) / m.act);
  else if (n < m.wind + m.act + m.rec) f.k = p1 + (1 - p1) * ((n - m.wind - m.act) / m.rec);
  else { Object.assign(f, { act: null, t: 0, k: 0 }); }
}

/// 칼(칼끝 쪽 절반 · 베기는 칼날 거의 전부)이 상대 몸에 닿았나. 칼끝 한 점만 보면 붙어 선 상대는
/// 칼끝이 몸 뒤로 지나가 안 맞는다 — 칼날 위 여러 점으로 쓸어 본다.
function touches(att, def) {
  const tip = bladeTip(att);
  if (!tip) return false;
  const feet = def.groundY - (def.air ?? 0);
  const inBody = (x, y) => Math.abs(x - def.x) <= BODY_HALF && y <= feet - TARGET_LOW && y >= feet - TARGET_TOP;
  for (let i = 3; i <= 10; i++) {
    const u = i / 10;
    if (inBody(tip.handX + (tip.x - tip.handX) * u, tip.handY + (tip.y - tip.handY) * u)) return true;
  }
  return false;
}
/// 칼끝이 상대 막을 자리까지 왔나 (몸 앞 한 뼘) — 막기가 걸리는 거리.
function reaches(att, def) {
  const tip = bladeTip(att);
  return tip && Math.abs(tip.x - def.x) <= BODY_HALF + 26;
}
/// 베기는 줄 둘을 덮는다 — 위에서 내리베면 위+가운데, 아래서 쓸면 아래+가운데, 가운데는 가운데만.
const cutCovers = (cutLine, parryLine) => parryLine === cutLine || parryLine === 0;

// ── 판정 (방장만) ──
function judge(world, dt) {
  const b = world.bag;
  const A = [body(world, 0), body(world, 1)];
  const F = [A[0].fence, A[1].fence];
  for (const s of [0, 1]) {
    const att = A[s], def = A[1 - s], fa = F[s], fd = F[1 - s];
    if (!ATTACKS.has(fa.act) || phaseOf(fa) !== 'act' || fa.hit || fa.parried) continue;
    const sweep = fa.act === 'cut';
    // ① 막기 — 막는 창 안이고 칼끝이 막을 자리까지 왔다
    if (fd.act === 'parry' && phaseOf(fd) === 'act' && reaches(att, def)) {
      if (sweep) {
        // 베기는 막기를 깬다 — 막은 쪽이 굳고, 베기는 그대로 들어간다
        fd.act = null; fd.stun = STUN;
        say(world, '막기가 깨졌다!', TEAM_INK[s]);
      } else if (fd.line === fa.line) {
        fa.parried = true; fa.stun = STUN; fa.act = null;
        fd.act = null;             // 막은 쪽은 곧바로 되찌를 수 있다 (리포스트)
        say(world, '파라드!', TEAM_INK[1 - s]);
        b.spark = { x: (att.x + def.x) / 2, y: att.groundY - 46, t: 0, ink: INK };
        continue;
      }
    }
    // ② 베기끼리 맞부딪힘 — 둘 다 튕겨 난다
    if (sweep && fd.act === 'cut' && phaseOf(fd) === 'act' && Math.abs(att.x - def.x) < 130) {
      fa.act = null; fd.act = null; fa.stun = STUN * 0.5; fd.stun = STUN * 0.5;
      say(world, '쨍!', INK);
      continue;
    }
    // ③ 몸에 닿았나
    if (touches(att, def)) {
      fa.hit = true;
      b.hits.push({ side: s, at: b.clock });
      const tip = bladeTip(att);
      b.spark = { x: tip.x, y: tip.y, t: 0, ink: TEAM_INK[s] };
    }
  }
  // 닿은 것을 셈한다 — 둘 다 닿았으면 4프레임 안이면 무효
  if (b.hits.length) {
    const first = b.hits[0];
    const late = b.clock - first.at;
    const both = b.hits.some((h) => h.side !== first.side);
    if (both && late <= DOUBLE) { touche(world, -1, '무효 — 둘 다 닿았다'); return; }
    if (late > DOUBLE || both) touche(world, first.side, '투셰!');
  }
  // ④ 판 끝 — 뒤로 밀려 넘어가면 상대 점수
  const P = piste(world);
  for (const s of [0, 1]) {
    const x = A[s].x;
    if ((s === 0 && x < P.L) || (s === 1 && x > P.R)) { touche(world, 1 - s, '판 밖으로 — 투셰!'); return; }
  }
}

function say(world, word, ink = INK) {
  const b = world.bag;
  b.call = word; b.callT = 0; b.callInk = ink;
}

/// 점수가 났다 (side −1 이면 무효). 멈춰 보이고 시작선으로 돌린다.
function touche(world, side, word) {
  const b = world.bag;
  b.hits = [];
  b.phase = 'freeze'; b.timer = FREEZE;
  if (side >= 0) {
    b.score[side]++;
    b.lamp = { side, t: FREEZE };
    say(world, word, TEAM_INK[side]);
  } else {
    b.lamp = { side: -1, t: FREEZE };
    say(world, word, PENCIL);
  }
  if (side >= 0 && b.score[side] >= WIN_AT) {
    b.over = true; b.winner = side;
    say(world, `${TEAM_NAME[side]} 편이 이겼다`, TEAM_INK[side]);
  }
}

/// 시작선으로. 손님은 꾸러미의 reset 이 바뀐 걸 보고 제 사람을 옮긴다.
function toStart(world) {
  const b = world.bag;
  const P = piste(world);
  b.reset++;
  for (const s of [0, 1]) {
    const p = body(world, s);
    p.x = P.start[s]; p.vx = 0;
    p.facing = s === 0 ? 1 : -1;
    p.fence = idle();
    if (p === world.player) placeMine(world);
  }
  b.phase = 'allez'; b.timer = ALLEZ;
  if (!b.over) say(world, '앙가르드', PENCIL);
}
function placeMine(world) {
  const P = piste(world);
  const s = sideOf(world, world.mp.myId);
  const p = world.player;
  if (world.bag.fencers[s] === world.mp.myId) p.x = P.start[s];
  else p.x = s === 0 ? 34 : world.w - 34;        // 피스트에 안 서는 사람은 판 바깥 의자에
  p.vx = 0; p.facing = s === 0 ? 1 : -1;
}

// ── 컴퓨터 ──
/// 사람처럼 읽는다 — 상대가 칼을 젖히면(베기 준비) 찔러 끊고, 찌르기가 오면 그 줄을 막는다.
/// 짐작을 늘 믿으면 이길 수가 없으니 반쯤만 믿는다(READ). 반응도 사람만큼 늦다(REACT).
const READ = 0.3, REACT = 0.18;
function cpuThink(world, side, dt) {
  const b = world.bag;
  const me = b.cpu[side], foe = body(world, 1 - side);
  const f = me.fence, ff = foe.fence;
  const dir = side === 0 ? 1 : -1;
  const gap = (foe.x - me.x) * dir;
  me.think -= dt;
  if (me.still) { me.aim = 0; return; }      // 시험·시연에서 세워 둔 컴퓨터
  // 걷기 — **런지 거리 밖**(160~210px)에서 재다가, 들어갈 때는 걸어 들어간다. 그 걸음이 곧 예고다 —
  // 사람은 그걸 보고 물러나거나, 들어오는 발에 먼저 뛰어들 수 있다.
  let want = 0;
  if (me.plan) {
    me.plan.t -= dt;
    if (me.plan.t <= 0) me.plan = null;
  }
  if (!f.act && f.stun <= 0) {
    if (me.plan) want = 1;
    else if (gap > 210) want = 1;
    else if (gap < 160) want = -1;
    else want = Math.sin(b.clock * 2.3 + side * 2) > 0.4 ? 1 : (Math.sin(b.clock * 1.7 + side) < -0.5 ? -1 : 0);
  }
  // 등 뒤 경고 구역(끝 2m)에서는 더 안 물러난다 — 판 밖으로 나가면 상대 점수다.
  const P = piste(world);
  const room = side === 0 ? me.x - P.L : P.R - me.x;
  if (want < 0 && room < P.m * 1.2) want = gap < KEEP + 8 ? 0 : 1;
  me.back = Math.max(0, (me.back ?? 0) - dt);
  me.aim = me.back > 0 && !f.act && f.stun <= 0 ? -dir * WALK : want * dir * WALK * (me.plan ? 1 : 0.55);
  // 재는 동안 칼끝을 위아래로 옮긴다 — 줄을 읽히지 않으려고, 그리고 사람이 「줄」을 눈으로 배운다.
  if (!f.act && f.stun <= 0 && Math.random() < dt * 0.7) f.line = Math.floor(Math.random() * 3) - 1;
  if (me.think > 0 || f.act || f.stun > 0) return;
  me.think = REACT * (0.7 + Math.random() * 0.6);
  // 칼이 닿는 거리 — 그냥 찌르기·베기는 ~80px, 런지는 ~150px. 안 닿는 데서 휘두르면 빈틈만 준다.
  const poke = gap < 80, leap = gap < 150;
  const anyLine = () => Math.floor(Math.random() * 3) - 1;
  // 상대가 수를 내고 있다 — 읽어서 받아친다
  if (ATTACKS.has(ff.act) && phaseOf(ff) === 'wind') {
    if (Math.random() < READ) {
      if (ff.act === 'cut' && leap) { start(f, poke ? 'thrust' : 'lunge', 0); return; }  // 베기 준비를 찌른다
      if (ff.act !== 'cut') { start(f, 'parry', ff.line); return; }                     // 그 줄을 막는다
    }
    // 못 읽었으면 가끔은 뒤로 뛰어 빠진다 — 베기는 짧고, 런지도 한 스텝 빠지면 칼끝이 모자란다
    if (ff.act !== 'thrust' && Math.random() < 0.3 && room > P.m * 1.6) { start(f, 'hop', f.line); return; }
  }
  // 상대가 굳었다 — 리포스트
  if (ff.stun > 0 && leap) { start(f, poke ? 'thrust' : 'lunge', anyLine()); return; }
  // 들어가는 중 — 닿는 거리에 오면 낸다
  if (me.plan?.kind === 'lunge' && gap < 140) { start(f, 'lunge', anyLine()); me.plan = null; return; }
  if (me.plan?.kind === 'close' && poke) {
    start(f, Math.random() < 0.6 ? 'thrust' : 'cut', anyLine()); me.plan = null; return;
  }
  // 이미 코앞이면 (런지가 끝났거나 상대가 들어왔다) 바로 친다
  const r = Math.random();
  if (poke && r < 0.15) { start(f, r < 0.09 ? 'thrust' : 'cut', anyLine()); return; }
  // 상대가 런지 거리로 걸어 들어온다 — 들어오는 발에 먼저 뛰어든다
  const coming = (foe.vx ?? 0) * -dir > 40;
  if (!me.plan && coming && gap < 145 && r < 0.05) { start(f, 'lunge', anyLine()); return; }
  // 들어갈 마음을 먹는다
  // 오래 재기만 하면 조급해진다 — 맞댐이 끝없이 늘어지지 않게
  if (!me.plan && r < 0.06 + Math.min(0.2, (b.bout ?? 0) * 0.02)) me.plan = { kind: Math.random() < 0.6 ? 'lunge' : 'close', t: 1.4 };
}

// ── 걷기 (내 사람 · 컴퓨터) ──
function walkBody(world, p, side, vx, dt) {
  const P = piste(world);
  const foe = body(world, 1 - side);
  const dir = side === 0 ? 1 : -1;
  const f = p.fence;
  // 걸음은 붙었다 멎는다 — 한 번에 최고 빠르기가 되면 미끄러지듯 보인다. 서는 건 걷기보다 빠르다.
  const want = f.stun > 0 || (f.act && f.act !== 'lunge') ? 0 : vx;
  const cur = Number.isFinite(p.vx) ? p.vx : 0;
  const speeding = Math.abs(want) > Math.abs(cur) && Math.sign(want) === Math.sign(cur || want);
  const rate = (speeding ? ACCEL : BRAKE) * dt;
  let v = cur + Math.max(-rate, Math.min(rate, want - cur));
  // 런지 — 준비와 맞는 때 동안 앞으로 뛰어든다
  if (f.act === 'lunge') {
    const m = MOVES.lunge;
    const n = f.t / FR;
    v = n < m.wind + m.act ? dir * LUNGE_STEP / ((m.wind + m.act) * FR) : 0;
  }
  // 뒤로 스텝 — 떠 있는 동안 뒤로, 내려앉으면 선다
  if (f.act === 'hop') {
    const m = MOVES.hop;
    const n = f.t / FR;
    v = n < m.wind + m.act ? -dir * HOP_STEP / ((m.wind + m.act) * FR) : 0;
  }
  p.vx = v;
  const was = p.x;
  p.x += v * dt;
  // 상대를 지나치거나 겹치지 않는다 — **다가가던 쪽만 멈춘다.** 서 있는 사람을 밀어내면
  // 걸어 들어가기만 해도 상대를 판 밖으로 밀어내 점수를 딴다.
  if (foe && v * dir > 0 && (foe.x - p.x) * dir < KEEP) p.x = dir > 0 ? Math.min(p.x, Math.max(was, foe.x - KEEP))
                                                                      : Math.max(p.x, Math.min(was, foe.x + KEEP));
  // 판 끝 — 앞쪽은 막고, 뒤로는 넘어가면 판정이 점수를 준다
  p.x = Math.max(P.L - 20, Math.min(P.R + 20, p.x));
  p.facing = dir;
  p.walk = (p.walk ?? 0) + Math.abs(v) * dt * 0.06;
  p.air = 0; p.vy = 0; p.groundY = world.groundY;
}

/// 사람마다 칼끝이 지나온 자리 (그림만 — 꾸러미에 안 싣는다).
const TRAILS = new WeakMap();

const lineOf = (world) => (world.input.jump ? 1 : world.input.duck ? -1 : 0);
const iFence = (world) => world.bag.fencers[sideOf(world, world.mp.myId)] === world.mp.myId;

/// 내가 수를 냈다. 손님이면 방장에게도 알린다 — 내 화면에서는 바로 칼을 뻗는다.
function act(world, kind) {
  const b = world.bag;
  if (world.state !== 'play' || b.over || b.phase !== 'fight' || !iFence(world)) return false;
  const line = lineOf(world);
  // 걷는 중에 찌르면 런지
  const moving = (world.input.right || world.input.left) && kind === 'thrust'
    && ((world.input.right ? 1 : -1) === (sideOf(world, world.mp.myId) === 0 ? 1 : -1));
  const real = moving ? 'lunge' : kind;
  const f = (world.player.fence ??= idle());
  if (!start(f, real, line)) return false;
  if (world.mp.role === 'guest') { world.send?.({ t: 'gm', k: 'act', a: real, l: line }); world.player.sentLine = line; }
  return true;
}

const KEY_ROWS = [
  ['⌥ ← →', '걷기 — 칼끝은 늘 상대를 본다'],
  ['⌥ ↑ / ↓', '줄 — 위 / 아래 (놓으면 가운데)'],
  ['⌥ Space', '찌르기 · 걸으며 누르면 런지'],
  ['⌥ X', '베기 — 막기를 깬다, 준비가 길다'],
  ['⌥ C', '막기 — 같은 줄 찌르기를 쳐낸다'],
  ['뒤로 두 번', '뒤로 빠른 스텝 — 런지 끝을 피한다'],
];

export default {
  id: 'fence',
  name: '펜싱',
  line: '좁은 판 위 1대1. 찌르기·베기·막기가 서로 물린다 — 위·아래 줄까지 읽어라. 15점 먼저.',
  keys: KEY_ROWS,
  tally: (world) => `${world.bag?.score?.[0] ?? 0} : ${world.bag?.score?.[1] ?? 0}`,
  noGrab: true,
  noClock: true,
  noResults: true,
  noGround: true,                 // 바닥은 피스트가 대신한다
  teamNames: TEAM_NAME,
  joinsAnytime: true,
  blocked: () => null,
  shirt: (world, x, id) => TEAM_INK[id < 0 ? -1 - id : sideOf(world, id)],
  figure: (ctx, p, time, seed, opts = {}) => drawStickman(ctx, p, time, seed, { ...opts, fence: true }),

  fresh: freshBag,
  /// 피스트를 바닥에서 띄운다 — 그 밑에 득점등이 들어갈 자리가 있어야 한다 (엔진 바닥은 화면 맨 아래다).
  resize(world) {
    world.groundY = world.h - 90; world.player.groundY = world.groundY;
    // 판 도중 창 크기가 바뀌면 판 끝도 옮겨진다 — 서 있던 자리가 새 판 밖일 수 있으니 시작선으로.
    if (world.bag?.cpu && world.state === 'play' && world.mp.role !== 'guest') toStart(world);
  },
  begin(world) { Object.assign(world.bag, freshBag()); world.player.fence = idle(); },

  stand(world, slot) {
    if (world.team === undefined) world.team = slot % 2;
    const P = piste(world);
    world.player.x = P.start[world.team ?? 0];
    world.player.vx = 0;
    world.player.facing = (world.team ?? 0) === 0 ? 1 : -1;
  },
  swap(world, shell, side) {
    const want = side === undefined ? 1 - (world.team ?? 0) : (side ? 1 : 0);
    world.team = want;
    picks(world).set(world.mp.myId, want);
    if (world.mp.on) (shell?.net?.send ?? world.send)?.({ t: 'gm', s: want });
  },

  /// ⌥Space — 찌르기(걸으며면 런지). ⌥X — 베기. ⌥C — 막기.
  action(world) { act(world, 'thrust'); },
  release() {},
  drop(world) { act(world, 'cut'); },
  guard(world) { act(world, 'parry'); },
  /// 뒤쪽 방향키를 0.28초 안에 두 번 — 뒤로 빠른 스텝.
  tap(world, action) {
    const back = sideOf(world, world.mp.myId) === 0 ? 'left' : 'right';
    const p = world.player;
    if (action !== back) { p.backTap = null; return; }
    const now = world.elapsed ?? 0;
    if (p.backTap !== null && p.backTap !== undefined && now - p.backTap < 0.28) { p.backTap = null; act(world, 'hop'); return; }
    p.backTap = now;
  },

  /// 내 사람의 걸음. 엔진의 달리기·점프 대신 펜싱 걸음(앞뒤로만, 줄 키는 점프가 아니다).
  move(world, dt) {
    const p = world.player;
    p.fence ??= idle();
    const b = world.bag;
    const s = sideOf(world, world.mp.myId);
    p.groundY = world.groundY;
    if (!iFence(world)) { placeMine(world); p.air = 0; p.onPiste = null; return; }
    // 의자에서 막 피스트로 올라왔거나 편이 바뀌었다 — 시작선으로. 안 그러면 의자 자리(판 밖)에서
    // 알레를 맞아 그대로 「판 밖으로」 상대 점수가 난다.
    if (p.onPiste !== s) { placeMine(world); p.fence = idle(); p.onPiste = s; }
    const dir = (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0);
    const go = world.state === 'play' && b.phase === 'fight' && !b.over;
    walkBody(world, p, s, go ? dir * WALK : 0, dt);
    p.fence.line = p.fence.act ? p.fence.line : lineOf(world);
    // 줄은 수를 안 내도 남에게 보여야 한다 — 상대가 내 칼끝 높이를 보고 막을 줄을 고른다.
    if (world.mp.role === 'guest' && !p.fence.act && p.sentLine !== p.fence.line) {
      p.sentLine = p.fence.line;
      world.send?.({ t: 'gm', k: 'line', l: p.fence.line });
    }
    if (world.mp.role === 'guest') step(p.fence, dt);       // 손님은 제 칼을 제가 굴린다 (방장이 고쳐 준다)
  },

  update(world, dt) {
    const b = world.bag;
    if (!b.score) Object.assign(b, freshBag());
    world.player.fence ??= idle();
    if (b.callT < 9) b.callT += dt;
    if (b.spark) { b.spark.t += dt; if (b.spark.t > 0.35) b.spark = null; }
    if (b.lamp) { b.lamp.t -= dt; if (b.lamp.t <= 0) b.lamp = null; }
    if (world.mp.role === 'guest') {
      // 꾸러미 사이에도 남의 칼을 굴린다 — 안 그러면 칼이 꾸러미 올 때만 뚝뚝 움직인다.
      if (world.state === 'play') {
        for (const s of [0, 1]) {
          const p = body(world, s);
          if (p !== world.player && p.fence) step(p.fence, dt);
        }
      }
      return;
    }

    // 편과 피스트에 설 사람 (방장)
    if (world.mp.on) {
      b.sides = rosterSides(world);
      const mine = b.sides.get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) world.team = mine;
    } else {
      b.sides = new Map([[world.mp.myId, world.team ?? 0]]);
    }
    const before = b.fencers.join();
    b.fencers = fencersOf(world);
    const P = piste(world);
    for (const s of [0, 1]) {
      const c = b.cpu[s];
      c.groundY = world.groundY;
      if (!c.x) c.x = P.start[s];
    }
    if (before !== b.fencers.join()) toStart(world);
    if (world.state !== 'play') return;
    b.clock += dt;

    // 컴퓨터 · 남의 칼 · 내 칼을 굴린다
    for (const s of [0, 1]) {
      const p = body(world, s);
      p.fence ??= idle();
      if (b.fencers[s] === -1) {
        if (b.phase === 'fight' && !b.over) cpuThink(world, s, dt);
        else p.aim = 0;
        walkBody(world, p, s, b.phase === 'fight' ? p.aim ?? 0 : 0, dt);
      }
      step(p.fence, dt);
    }

    if (b.phase === 'allez') {
      b.timer -= dt;
      if (b.timer <= 0) { b.phase = 'fight'; b.bout = 0; say(world, '알레!', INK); }
      return;
    }
    if (b.phase === 'freeze') {
      b.timer -= dt;
      if (b.timer > 0) return;
      if (b.over) {
        if (!b.ended) {
          b.ended = true;
          world.onGameOver?.({ name: `${TEAM_NAME[b.winner]} 편`, side: b.winner, rows: [] });
        }
        return;
      }
      toStart(world);
      return;
    }
    b.bout = (b.bout ?? 0) + dt;
    judge(world, dt);
  },

  draw(ctx, world, time) {
    const b = world.bag;
    if (!b?.score) return;
    const P = piste(world);
    const g = world.groundY;
    // 피스트 — 바닥 띠, 끝 2m 경고 구역, 가운데 선, 시작선
    ctx.save(); ctx.fillStyle = 'rgba(205, 210, 207, 0.55)'; ctx.fillRect(P.L, g, P.R - P.L, 16);
    ctx.fillStyle = 'rgba(170, 176, 173, 0.55)';
    ctx.fillRect(P.L, g, P.m * 2, 16); ctx.fillRect(P.R - P.m * 2, g, P.m * 2, 16); ctx.restore();
    stroke(ctx, [[P.L, g], [P.R, g]], { width: 2.4, color: INK, seed: 3, amp: 0.5 });
    stroke(ctx, [[P.mid, g - 6], [P.mid, g + 16]], { width: 2.2, color: INK, seed: 4, amp: 0.3 });
    for (const x of P.start) stroke(ctx, [[x, g + 2], [x, g + 14]], { width: 1.6, color: PENCIL, seed: 5, amp: 0.3 });
    // 득점등 — **먼저 몸에 칼을 댄 사람 아래**에 그 편 색으로. 무효면 둘 다 흰 등.
    for (const s of [0, 1]) {
      const cx = s === 0 ? P.mid - 330 : P.mid + 330;
      const on = b.lamp && (b.lamp.side === s || b.lamp.side === -1);
      ctx.save();
      if (on && b.lamp.side === s) { ctx.shadowColor = TEAM_INK[s]; ctx.shadowBlur = 18; }
      ctx.fillStyle = on ? (b.lamp.side === -1 ? '#ffffff' : TEAM_INK[s]) : 'rgba(217, 220, 218, 0.9)';
      ctx.fillRect(cx - 70, g + 30, 140, 14);
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.6; ctx.strokeStyle = INK; ctx.strokeRect(cx - 70, g + 30, 140, 14);
      ctx.restore();
      if (on && b.lamp.side === s) {
        const p = body(world, s);
        ctx.save(); ctx.globalAlpha = 0.4; ctx.fillStyle = TEAM_INK[s];
        ctx.beginPath(); ctx.ellipse(p.x, g + 4, 44, 8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      }
    }
    // 칼이 지나간 자리 — 찌르기는 곧은 한 줄, 베기는 휘는 호. 빠른 칼이 「빠르게」 읽힌다.
    for (const s of [0, 1]) {
      const p = body(world, s);
      const f = p.fence;
      let trail = TRAILS.get(p);
      if (!trail) TRAILS.set(p, (trail = []));
      const swinging = f?.act && f.act !== 'parry' && f.k > 0.02 && f.k < (f.act === 'cut' ? 0.66 : 0.36);
      if (!swinging) { trail.length = 0; continue; }
      const tip = bladeTip(p, time);
      if (tip) trail.push([tip.x, tip.y, time]);
      while (trail.length && time - trail[0][2] > 0.12) trail.shift();
      if (trail.length < 2) continue;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < trail.length; i++) {
        const u = i / trail.length;
        ctx.globalAlpha = 0.45 * u;
        ctx.strokeStyle = TEAM_INK[s];
        ctx.lineWidth = 1 + u * (f.act === 'cut' ? 5 : 3);
        ctx.beginPath(); ctx.moveTo(trail[i - 1][0], trail[i - 1][1]); ctx.lineTo(trail[i][0], trail[i][1]); ctx.stroke();
      }
      ctx.restore();
    }
    // 컴퓨터 — 남·나는 main.js 가 그린다. 컴퓨터는 판의 것이라 여기서.
    for (const s of [0, 1]) {
      if (b.fencers[s] !== -1) continue;
      const c = b.cpu[s];
      drawStickman(ctx, c, time, 41 + s, { fence: true, color: TEAM_INK[s], name: '컴퓨터' });
    }
    // 닿은 자리의 불꽃
    if (b.spark) {
      const u = b.spark.t / 0.35;
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2, r0 = 6 + u * 10;
        stroke(ctx, [[b.spark.x + Math.cos(a) * r0, b.spark.y + Math.sin(a) * r0],
                     [b.spark.x + Math.cos(a) * (r0 + 8), b.spark.y + Math.sin(a) * (r0 + 8)]],
               { width: 2.4, color: b.spark.ink, seed: 70 + i, amp: 0.3, halo: false, alpha: 1 - u });
      }
    }
  },

  hud(ctx, world) {
    const b = world.bag;
    // 시작 전·끝난 뒤에는 엔진 안내판이 같은 키를 크게 보여 준다 — 판이 도는 동안만 작게 붙인다
    if (!b?.score || world.state !== 'play') return;
    const mid = world.w / 2;
    // 기술표 — 왼쪽 위 작게
    const x = 16, y = 14, lh = 15;
    paperScrap(ctx, x, y, 270, 14 + KEY_ROWS.length * lh, 17);
    KEY_ROWS.forEach(([k, v], i) => {
      text(ctx, k, x + 12, y + 20 + i * lh, { font: `700 10px ${HAN}`, color: INK, halo: 0, alpha: 0.75 });
      text(ctx, v, x + 86, y + 20 + i * lh, { font: `600 10px ${HAN}`, color: PENCIL, halo: 0, alpha: 0.7 });
    });
    // 점수 — 15점 먼저
    text(ctx, String(b.score[0]), mid - 46, 52, { font: `800 32px ${HAN}`, color: TEAM_INK[0], align: 'center', halo: 3 });
    text(ctx, ':', mid, 50, { font: `800 26px ${HAN}`, color: PENCIL, align: 'center', halo: 3 });
    text(ctx, String(b.score[1]), mid + 46, 52, { font: `800 32px ${HAN}`, color: TEAM_INK[1], align: 'center', halo: 3 });
    text(ctx, `${WIN_AT}점 먼저`, mid, 72, { font: `600 12px ${HAN}`, color: PENCIL, align: 'center', halo: 2 });
    // 심판 소리
    if (b.call && b.callT < 1.3) {
      const k = Math.min(1, b.callT / 0.12);
      text(ctx, b.call, mid, 140 - (1 - k) * 10, { font: `800 30px ${HAN}`, color: b.callInk ?? INK,
                                                   align: 'center', halo: 6, alpha: Math.min(k, 1.3 - b.callT > 0.3 ? 1 : (1.3 - b.callT) / 0.3) });
    }
    if (!iFence(world) && world.mp.on && !world.mp.waiting) {
      text(ctx, '다음 차례를 기다린다 — 판 밖 의자에서 구경', mid, world.h - 30,
           { font: `700 13px ${HAN}`, color: PENCIL, align: 'center', halo: 3 });
    }
  },

  /// 손님이 보낸 말 — 방장만.
  message(world, from, msg) {
    if (world.mp.role !== 'host') return;
    const b = world.bag;
    if (typeof msg.s === 'number') { picks(world).set(from, msg.s ? 1 : 0); return; }
    if (msg.k === 'line') {
      const o = world.mp.others.get(from);
      if (o) { o.fence ??= idle(); if (!o.fence.act) o.fence.line = Math.max(-1, Math.min(1, msg.l | 0)); }
      return;
    }
    if (msg.k !== 'act' || world.state !== 'play' || b.phase !== 'fight' || b.over) return;
    const s = b.fencers.indexOf(from);
    if (s < 0) return;                               // 피스트에 안 선 사람
    const other = world.mp.others.get(from);
    if (!other) return;
    other.fence ??= idle();
    const a = ['thrust', 'lunge', 'cut', 'parry', 'hop'].includes(msg.a) ? msg.a : null;
    if (!a) return;
    // 손님 화면에서는 앞 수가 이미 끝났다 — 여기서 끝나기 직전이면 마저 끝낸다. 안 그러면 와이파이가
    // 조금만 늦어도 「끝나자마자 다시 찌른」 수를 방장이 씹는다.
    const f = other.fence;
    if (f.act && phaseOf(f) === 'rec' && total(MOVES[f.act]) - f.t < 0.12) Object.assign(f, { act: null, t: 0, k: 0 });
    start(f, a, Math.max(-1, Math.min(1, msg.l | 0)));
  },

  pack(world) {
    const b = world.bag;
    const fz = {};
    for (const s of [0, 1]) {
      const p = body(world, s);
      const f = p.fence ?? idle();
      fz[s] = [b.fencers[s], f.act ?? '', Math.round(f.t * 1000), f.line, Math.round(f.stun * 1000),
               Math.round(p.x * 10) / 10];
    }
    return {
      tm: [...(b.sides ?? new Map()).entries()],
      sc: b.score, ph: b.phase, tm2: Math.round(b.timer * 100), fz, rs: b.reset,
      cl: b.call, ct: Math.round(b.callT * 100), ci: b.callInk,
      lp: b.lamp ? [b.lamp.side, Math.round(b.lamp.t * 100)] : null,
      sp: b.spark ? [Math.round(b.spark.x), Math.round(b.spark.y), Math.round(b.spark.t * 100), b.spark.ink] : null,
      ov: b.over ? 1 : 0, wn: b.winner ?? -1,
    };
  },

  unpack(world, d) {
    const b = world.bag;
    if (!d || typeof d !== 'object') return;
    if (!b.score) Object.assign(b, freshBag());
    if (Array.isArray(d.tm)) {
      b.sides = new Map(d.tm.filter((r) => Array.isArray(r) && r.length === 2));
      const mine = b.sides.get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) world.team = mine;
    }
    if (Array.isArray(d.sc) && d.sc.length === 2) b.score = d.sc.map((v) => v | 0);
    if (typeof d.ph === 'string') b.phase = d.ph;
    if (Number.isFinite(d.tm2)) b.timer = d.tm2 / 100;
    if (d.fz && typeof d.fz === 'object') {
      for (const s of [0, 1]) {
        const r = d.fz[s];
        if (!Array.isArray(r) || r.length < 6) continue;
        const [id, a, t, line, stun, x] = r;
        b.fencers[s] = id | 0;
        const f = { act: MOVES[a] ? a : null, t: (t | 0) / 1000, line: line | 0, k: 0, stun: (stun | 0) / 1000 };
        if (id === world.mp.myId) {
          // 내 칼 — 방장이 굳혔거나 거절했으면 따른다. 아니면 내가 굴리던 것을 둔다(손맛).
          const mine = (world.player.fence ??= idle());
          if (f.stun > 0 || (!f.act && mine.act && mine.t > 0.25)) Object.assign(mine, f);
        } else if (id === -1) {
          const c = b.cpu[s];
          Object.assign(c.fence, f);
          step(c.fence, 0);
          c.x = Number.isFinite(x) ? x : c.x; c.groundY = world.groundY; c.facing = s === 0 ? 1 : -1;
        } else {
          const o = world.mp.others.get(id);
          if (o) { o.fence = { ...(o.fence ?? idle()), ...f }; step(o.fence, 0); }
        }
      }
    }
    // 시작선으로 돌렸다 — 내 사람도 옮긴다
    if (Number.isFinite(d.rs) && d.rs !== b.reset) { b.reset = d.rs; world.player.fence = idle(); placeMine(world); }
    if (typeof d.cl === 'string' && (d.cl !== b.call || (d.ct | 0) / 100 < b.callT)) {
      b.call = d.cl; b.callT = (d.ct | 0) / 100; b.callInk = typeof d.ci === 'string' ? d.ci : INK;
    }
    b.lamp = Array.isArray(d.lp) ? { side: d.lp[0] | 0, t: (d.lp[1] | 0) / 100 } : null;
    b.spark = Array.isArray(d.sp) ? { x: d.sp[0], y: d.sp[1], t: d.sp[2] / 100, ink: d.sp[3] } : null;
    b.over = !!d.ov; b.winner = d.wn >= 0 ? d.wn : null;
  },
};

export { TEAM_INK, TEAM_NAME, WIN_AT, body, fencersOf, touches, judge, phaseOf, start, idle, step };
