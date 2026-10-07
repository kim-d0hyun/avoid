// 범퍼카 — 둥근 경기장에서 서로 밀어 떨어뜨린다. 마지막에 남은 사람이 한 판, 5점 먼저.
// 몰겜에서 처음으로 **위에서 내려다보는** 게임이다. 기획: claude.ai 「몰겜 범퍼카」.
//
// 원작(백래쉬)처럼 **닿으면 충격파가 터진다** — 받힌 차는 날아가고 들이받은 차는 조금 튄다. 따로 키는 돌진(⌥Space) 하나.
// (버티기 ⌥C 는 v3.41.0 에 뺐다 — 원작처럼 키 없이 부딪히는 맛만 남긴다.)
//
// **방장이 모든 차를 굴린다** — 부딪힘은 모두가 같은 값을 봐야 공정하다. 손님은 키를 보내고,
// 방장이 계산한 자리를 받아 그린다. 내 차만은 받은 자리에서 내 키로 조금 앞질러 그린다(손맛).
// 혼자면 컴퓨터 셋과 붙는다. 사람끼리 모이면 사람만.

import { INK, RED, PENCIL, PAPER_SOLID, stroke, circle, text, paperScrap, shirtColor } from '../draw/ink.js';

const HAN = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const WIN_AT = 5;

// ── 경기장 · 차 ──
const SQ = 0.55;            // 비스듬히 내려다본 눌림 — 판정은 둥근 원, 그림만 눌린다
const CAR_R = 36;          // 차 반지름 — 26 은 판에 비해 작아 보였다 (32 → 36)
const MAX = 380;            // 최고 빠르기 (px/s) — 원작(백래쉬)은 판을 2~3초에 가로지른다. 260 은 굼떴다
const ACC = 1400;           // 가속 — 0.3초면 최고 빠르기 (원작처럼 툭 튀어 나간다)
const BACK = 0.6;           // 후진·브레이크는 이만큼
const TURN = 3.4;           // 방향 틀기 (rad/s) — 빠를수록 덜 돈다 (컴퓨터)
const SCREEN_TURN = 7;      // 사람 — 누른 화면 방향으로 차가 도는 빠르기 (반 바퀴에 0.45초)
const FRIC = 1.3;           // 앞뒤 마찰 (손 떼면 천천히 선다)
const GRIP = 4.2;           // 옆 미끄러짐 마찰 — 차처럼 앞으로 가되, 빠르게 돌면 살짝 미끄러지며 둥글게 돈다
const BOUNCE = 1.0;         // 범퍼 탄성 — 고무 범퍼라 힘을 안 잃고 튄다
// 충격파 — 원작(백래쉬)처럼 **닿으면 터진다**(따로 키 없음). 받힌 차는 날아가고 들이받은 차는 조금 튄다.
const SHOCK = 520;          // 두 차가 서로 떨어지는 빠르기 — 살살 닿아도 이만큼 (원작은 천천히 닿아도 차 두세 대를 날린다)
const SHOCK_MUL = 1.3;      //   세게 받으면 부딪힌 빠르기의 이만큼
const SHOCK_MIN = 30;       // 이보다 살살 닿으면(맞대고 미는 중) 안 터진다
const SHOCK_HIT = 0.8;      // 들이받은 쪽이 분명하면 받힌 차가 이만큼, 들이받은 차가 나머지를 가져간다
const SHOCK_BACK = 0.15;    // 들이받은 차도 적어도 이만큼 뒤로 튄다 (「서로 밀린다」)
const SLIDE_T = 0.7;        // 충격파를 맞으면 이 동안 바퀴가 미끄러진다 — 옆구리로 날아가도 바로 안 선다
const SLIDE_GRIP = 1.0;     //   그동안의 옆 마찰 (평소 GRIP). 이게 없으면 옆으로 날아간 차가 차 세 대 거리에서 섰다
const BOOST = 1.9;          // 돌진 — 최고 빠르기의 이만큼
const BOOST_T = 0.25, BOOST_COOL = 1.5;
const ROUND = 60;           // 한 판
const SHRINK_AT = 40;       // 이때부터 가장자리가 무너진다
const SHRINK_TO = 0.4;      // 60초에 반지름이 이만큼까지
const OVERTIME = 4;         // 60초 뒤엔 이만큼 빨리 무너진다 — 가운데서 둘이 버티기만 하면 판이 10초 넘게 늘어졌다
const COUNT = 1.6;          // 판 시작 전 셋·둘·하나
const END_WAIT = 1.8;       // 판이 끝나고 다음 판까지
const FALL_T = 1.0;         // 떨어지는 데 걸리는 시간 — 짧으면 「사라졌다」로만 보인다
const FALL_DROP = 230;      // 그동안 아래로 떨어지는 거리 (px, 점점 빨라진다)
const SPIN = 4.2;           // 옆을 맞으면 도는 세기 (rad/s, 최고 빠르기로 받았을 때)
const SPIN_DECAY = 3.2;
const SPIN_MAX = 7;         // 가장 세게 돌 때 — 다 돌면 약 125°
const WOB_DECAY = 2.4;      // 부딪혀 출렁이는 것이 잦아드는 빠르기
const POP_T = 0.55;         // 「쿵」·「쾅!」이 떠 있는 시간
const CPU_COLORS = ['#c0392b', '#d9a21b', '#3f8f56'];
const CPU_NAMES = ['빨강봇', '노랑봇', '초록봇'];

/// 경기장 — 화면 가운데, 가로로 긴 화면에 맞춘 원(눌린 채 그린다).
export function arena(world) {
  const cx = world.w / 2, cy = world.h * 0.56;
  const R = Math.max(160, Math.min(world.w / 2 - 50, (world.h * 0.8) / (2 * SQ)));
  return { cx, cy, R };
}
const scr = (A, x, y) => [A.cx + x, A.cy + y * SQ];

// ── 판 ──
function freshBag() {
  return {
    cars: [], phase: 'count', timer: COUNT, clock: 0, score: new Map(), names: new Map(),
    words: [], wordSeq: 0, round: 0, over: false, winner: null, Rk: 1, inputs: new Map(),
  };
}

/// 이번 판에 차를 탈 사람들. 구경 중인 사람은 빼고, 혼자면 컴퓨터 셋.
function roster(world) {
  const ids = [];
  if (!world.mp.waiting) ids.push(world.mp.myId);
  for (const o of world.mp.others.values()) if (!o.waiting) ids.push(o.id);
  ids.sort((a, c) => a - c);
  if (ids.length <= 1) for (let i = 0; i < 3; i++) ids.push(-1 - i);
  return ids;
}
const nameOf = (world, id) => (id < 0 ? CPU_NAMES[-1 - id] : id === world.mp.myId ? (world.mp.myName || '나')
  : world.mp.others.get(id)?.name ?? `${id}번`);
const colorOf = (id) => (id < 0 ? CPU_COLORS[(-1 - id) % CPU_COLORS.length] : shirtColor(id));

/// 새 판 — 원 둘레에 고르게 세우고 가운데를 보게 한다.
function newRound(world) {
  const b = world.bag;
  const A = arena(world);
  const ids = roster(world);
  b.round++;
  b.cars = ids.map((id, i) => {
    const a = (i / ids.length) * Math.PI * 2 + Math.PI / 2 + b.round * 0.7;
    const r = A.R * 0.55;
    return { id, x: Math.cos(a) * r, y: Math.sin(a) * r, vx: 0, vy: 0, h: a + Math.PI,
             boostT: 0, boostCool: 0, slideT: 0, alive: true, fallT: 0, lastHit: null, think: 0,
             spin: 0, wob: 0, wobT: 0 };
  });
  for (const id of ids) { if (!b.score.has(id)) b.score.set(id, 0); b.names.set(id, nameOf(world, id)); }
  b.phase = 'count'; b.timer = COUNT; b.clock = 0; b.Rk = 1;
}

function say(world, word, color = INK) {
  const b = world.bag;
  b.wordSeq = (b.wordSeq + 1) % 1000;
  b.words.push({ word, color, t: 0, seq: b.wordSeq });
  if (b.words.length > 4) b.words.shift();
}

// ── 키 ──
/// 그 차를 모는 손 — 내 차는 내 키, 손님 차는 손님이 보낸 키, 컴퓨터는 컴퓨터.
/// 사람 손은 **화면 방향**이다(screen: true) — ⌥→ 면 화면 오른쪽, ⌥↑ 면 화면 위로 간다. 차가 그쪽으로 돌아서 간다.
/// 처음엔 차 기준(↑ 앞으로 · ←→ 차가 보는 쪽에서 돌기)이었는데, 차가 화면 아래를 보고 있으면 ⌥→ 가 화면 왼쪽으로
/// 돌아서 「방향키대로 안 움직인다」였다. 컴퓨터는 차 기준 그대로 몬다.
function inputOf(world, car) {
  if (car.id === world.mp.myId) {
    const i = world.input;
    return { u: !!i.jump, d: !!i.duck, l: !!i.left, r: !!i.right, screen: true };
  }
  const got = world.bag.inputs.get(car.id) ?? { u: false, d: false, l: false, r: false };
  return { ...got, screen: true };
}

function boost(car) {
  if (!car.alive || car.boostCool > 0) return false;
  car.boostT = BOOST_T; car.boostCool = BOOST_COOL;
  return true;
}

// ── 물리 (방장 — 그리고 손님이 제 차를 앞질러 그릴 때) ──
/// 한 대를 dt 만큼 — 키 · 돌진 · 마찰. 부딪힘과 떨어짐은 따로.
export function drive(car, input, dt) {
  car.boostCool = Math.max(0, car.boostCool - dt);
  // 옆을 맞아 빙글 — 돌진 중에도 돈다 (범퍼카다)
  if (car.spin) { car.h += car.spin * dt; car.spin *= Math.exp(-SPIN_DECAY * dt); if (Math.abs(car.spin) < 0.02) car.spin = 0; }
  const fx = Math.cos(car.h), fy = Math.sin(car.h);
  if (car.boostT > 0) {
    // 돌진 — 그동안은 방향도 못 튼다. 앞으로 최고 빠르기의 BOOST 배.
    car.boostT = Math.max(0, car.boostT - dt);
    car.vx = fx * MAX * BOOST; car.vy = fy * MAX * BOOST;
    return;
  }
  const sp = Math.hypot(car.vx, car.vy);
  let go;
  if (input.screen) {
    // 화면 방향 — 누른 방향키를 합친 쪽으로 차를 돌리고(빠르게), 그쪽을 볼수록 세게 나간다.
    // 반대쪽을 누르면 먼저 브레이크가 걸리고(cos 가 음수) 돌아서 간다.
    const dx = (input.r ? 1 : 0) - (input.l ? 1 : 0), dy = (input.d ? 1 : 0) - (input.u ? 1 : 0);
    if (dx || dy) {
      let e = Math.atan2(dy, dx) - car.h; e = Math.atan2(Math.sin(e), Math.cos(e));
      const turn = SCREEN_TURN * (1 - 0.35 * Math.min(1, sp / MAX)) * dt;
      car.h += Math.max(-turn, Math.min(turn, e));
      go = Math.max(-BACK, Math.cos(e));
    } else go = 0;
  } else {
    const steer = (input.r ? 1 : 0) - (input.l ? 1 : 0);
    car.h += steer * TURN * (1 - 0.45 * Math.min(1, sp / MAX)) * dt;
    go = (input.u ? 1 : 0) - (input.d ? BACK : 0);
  }
  car.vx += Math.cos(car.h) * go * ACC * dt;
  car.vy += Math.sin(car.h) * go * ACC * dt;
  // 앞뒤 마찰 · 옆 미끄러짐 마찰 — 차처럼 바라보는 쪽으로 간다
  const nx = Math.cos(car.h), ny = Math.sin(car.h);
  let along = car.vx * nx + car.vy * ny;
  let side = -car.vx * ny + car.vy * nx;
  along *= Math.exp(-FRIC * dt);
  car.slideT = Math.max(0, (car.slideT ?? 0) - dt);
  side *= Math.exp(-(car.slideT > 0 ? SLIDE_GRIP : GRIP) * dt);
  // 최고 빠르기 — 돌진에 밀려 빨라진 것은 마찰로 천천히 잦아든다(바로 깎지 않는다)
  if (Math.abs(along) > MAX && go !== 0 && Math.sign(go) === Math.sign(along)) along = Math.sign(along) * Math.max(MAX, Math.abs(along) * Math.exp(-3 * dt));
  car.vx = along * nx - side * ny;
  car.vy = along * ny + side * nx;
}

/// 부딪힘 — 겹친 두 원을 맞닿은 방향으로 튕기고 충격파를 터뜨린다. 차 무게는 모두 같다.
function bump(world, a, c) {
  const dx = c.x - a.x, dy = c.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= CAR_R * 2 || d < 1e-6) return false;
  const nx = dx / d, ny = dy / d;
  const ma = 1, mc = 1;
  // 겹친 만큼 무게에 맞춰 밀어낸다
  const push = CAR_R * 2 - d;
  a.x -= nx * push * (mc / (ma + mc)); a.y -= ny * push * (mc / (ma + mc));
  c.x += nx * push * (ma / (ma + mc)); c.y += ny * push * (ma / (ma + mc));
  const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
  if (rel >= 0) return false;                                   // 이미 멀어지는 중
  // 누가 들이받았나 — 상대 쪽으로 더 빨리 가던 차. 받힌 차에만 적는다 (떨어지면 「아웃! — 민 사람」).
  const aIn = a.vx * nx + a.vy * ny, cIn = -(c.vx * nx + c.vy * ny);
  const j = -(1 + BOUNCE) * rel / (1 / ma + 1 / mc);
  a.vx -= (j / ma) * nx; a.vy -= (j / ma) * ny;
  c.vx += (j / mc) * nx; c.vy += (j / mc) * ny;
  // **충격파** — 원작 영상: 천천히 다가가 닿기만 해도 반투명 돔이 터지며 받힌 차가 0.2초 만에 차 두세 대 거리를
  // 날아가고, 들이받은 차는 거의 그 자리. 맞닿은 방향 빠르기만 바꾼다(옆으로 미끄러지던 건 그대로).
  // 누가 받혔나는 상대 쪽으로 다가가던 빠르기로 나눈다 — 정면으로 둘 다 오면 반반.
  let S = 0;
  if (-rel > SHOCK_MIN) {
    S = Math.max(SHOCK, SHOCK_MUL * -rel);
    const wa = Math.max(0, aIn), wc = Math.max(0, cIn);
    let fc = wa + wc > 0 ? wa / (wa + wc) : 0.5;                 // c 가 가져갈 몫
    fc = Math.max(1 - SHOCK_HIT, Math.min(SHOCK_HIT, fc));
    const com = ((a.vx * nx + a.vy * ny) * ma + (c.vx * nx + c.vy * ny) * mc) / (ma + mc);
    const an = a.vx * nx + a.vy * ny, cn = c.vx * nx + c.vy * ny;
    const cWant = Math.max(cn, com + (S * fc) / mc);
    const aWant = Math.min(an, com - (S * (1 - fc)) / ma, -(S * SHOCK_BACK) / ma);
    a.vx += (aWant - an) * nx; a.vy += (aWant - an) * ny;
    c.vx += (cWant - cn) * nx; c.vy += (cWant - cn) * ny;
  }
  // 돌진 중에 터지면 돌진은 끝난다 — 안 그러면 돌진이 빠르기를 계속 덮어써 받힌 차를 따라가 몇 번이고 다시 터진다
  if (S > 0) for (const x of [a, c]) { x.boostT = 0; x.slideT = SLIDE_T; }
  // **범퍼카의 손맛** — 옆을 맞으면 빙글 돌고, 몸통이 출렁이고, 「쿵」.
  // 맞은 방향이 차가 보는 쪽과 어긋날수록(옆구리) 많이 돈다. 정면·뒤로 맞으면 거의 안 돈다.
  const hit = -rel;
  const sideOf = (car, mx, my) => Math.cos(car.h) * my - Math.sin(car.h) * mx;   // 앞 방향 × 맞은 방향
  const capSpin = (v) => Math.max(-SPIN_MAX, Math.min(SPIN_MAX, v));   // 돌진에 받혀도 한 바퀴씩 돌지는 않게
  c.spin = capSpin((c.spin ?? 0) + SPIN * ((j / mc) / MAX) * sideOf(c, nx, ny));
  a.spin = capSpin((a.spin ?? 0) + SPIN * ((j / ma) / MAX) * sideOf(a, -nx, -ny));
  const boom = Math.max(hit, S * 0.6);                           // 손맛 세기 — 살살 닿아도 충격파가 터지면 「쿵」
  for (const car of [a, c]) { car.wob = Math.max(car.wob ?? 0, Math.min(1, boom / 600)); car.wobT = 0; }
  const b = world.bag;
  const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
  if (boom > 200) {
    b.popSeq = ((b.popSeq ?? 0) + 1) % 1000;
    (b.pops ??= []).push({ x: mx, y: my, t: 0, word: boom > 550 ? '쾅!' : '쿵', seq: b.popSeq });
  }
  if (boom > 440) world.shake = Math.max(world.shake ?? 0, Math.min(0.8, boom / 1000));
  // 세게 부딪혔으면 **받힌 차에** 민 차를 적어 둔다. 둘 다에 적었더니, 들이받고 제 힘에 판 밖으로 나간 차가
  // 「받힌 차가 밀었다」로 나왔다.
  if (S > 0 || hit > 170) {
    if (aIn >= cIn) c.lastHit = { id: a.id, at: b.clock };
    else a.lastHit = { id: c.id, at: b.clock };
  }
  // 충격 고리 — 원작의 반투명 충격파처럼 맞닿은 자리에서 퍼진다. 세면 빨간 빛살도.
  if (S > 0) (b.sparks ??= []).push({ x: mx, y: my, t: 0, k: Math.min(1, boom / 600) });
  return true;
}

// ── 컴퓨터 ──
/// 가장자리에 가까운 차를 노린다. 가운데 쪽에서 바깥쪽으로 밀도록 돌아 들어가고, 정면이 맞으면 돌진.
/// 나를 향해 돌진이 오면 반쯤은 버틴다(조금 늦게). 나도 가장자리면 먼저 가운데로 돌아온다.
function cpuDrive(world, car, dt) {
  if (car.still) return { u: false, d: false, l: false, r: false };   // 시험 · 시연에서 세워 둔 컴퓨터
  const b = world.bag;
  const A = arena(world);
  const R = A.R * b.Rk;
  car.think -= dt;
  const me = Math.hypot(car.x, car.y);
  const foes = b.cars.filter((o) => o !== car && o.alive);
  const input = { u: false, d: false, l: false, r: false };
  const steerTo = (tx, ty) => {
    const want = Math.atan2(ty - car.y, tx - car.x);
    let e = want - car.h; e = Math.atan2(Math.sin(e), Math.cos(e));
    input.l = e < -0.08; input.r = e > 0.08;
    return Math.abs(e);
  };
  // 맞붙어 밀기만 하면 둘 다 안 움직인다 — 0.5초 넘게 붙어 서 있으면 물러났다가 다시 들이받는다
  const touching = foes.some((o) => Math.hypot(o.x - car.x, o.y - car.y) < CAR_R * 2.3);
  const slow = Math.hypot(car.vx, car.vy) < 70;
  car.stuck = touching && slow ? (car.stuck ?? 0) + dt : 0;
  if (car.stuck > 0.5) { car.back = 0.45 + Math.random() * 0.2; car.stuck = 0; }
  if (car.back > 0) {
    car.back -= dt;
    input.d = true; input.l = Math.sin(car.id * 7 + b.clock) > 0; input.r = !input.l;
    return input;
  }
  if (me > R * 0.72) {
    const err = steerTo(0, 0); input.u = err < 1.2;
  } else if (foes.length) {
    // 가장자리에 가까운 놈 — 그 바깥쪽으로 밀 자리(놈과 가운데 사이)를 겨눈다
    const t = foes.reduce((p, o) => (Math.hypot(o.x, o.y) - Math.hypot(o.x - car.x, o.y - car.y) * 0.4
      > Math.hypot(p.x, p.y) - Math.hypot(p.x - car.x, p.y - car.y) * 0.4 ? o : p));
    const err = steerTo(t.x, t.y);
    input.u = err < 0.9;
    const dist = Math.hypot(t.x - car.x, t.y - car.y);
    if (car.think <= 0) {
      car.think = 0.12 + Math.random() * 0.12;
      if (err < 0.3 && dist < 230 && Math.random() < 0.7) boost(car);
    }
  }
  return input;
}

// ── 굴리기 (방장) ──
function step(world, dt) {
  const b = world.bag;
  const A = arena(world);
  b.clock += dt;
  // 가장자리가 무너진다
  // 60초가 넘어도 계속 무너진다 — 멈추면 좁은 원에 둘이 끼어 판이 영영 안 끝난다.
  // 60초 뒤엔 OVERTIME 배로 — 가운데서 둘이 버티면 차 두 대가 못 들어갈 만큼 금방 좁아진다.
  if (b.clock > SHRINK_AT) {
    const t = Math.min(b.clock, ROUND) - SHRINK_AT + Math.max(0, b.clock - ROUND) * OVERTIME;
    b.Rk = Math.max(0.02, 1 - (1 - SHRINK_TO) * t / (ROUND - SHRINK_AT));
  }
  const R = A.R * b.Rk;
  for (const car of b.cars) {
    if (!car.alive) { car.fallT += dt; continue; }
    const input = car.id < 0 ? cpuDrive(world, car, dt) : inputOf(world, car);
    drive(car, input, dt);
  }
  const SUB = 2;
  for (let s = 0; s < SUB; s++) {
    for (const car of b.cars) if (car.alive) { car.x += car.vx * dt / SUB; car.y += car.vy * dt / SUB; }
    for (let i = 0; i < b.cars.length; i++) for (let j = i + 1; j < b.cars.length; j++) {
      if (b.cars[i].alive && b.cars[j].alive) bump(world, b.cars[i], b.cars[j]);
    }
  }
  // 떨어졌나 — 차 가운데가 원 밖
  for (const car of b.cars) {
    if (!car.alive || Math.hypot(car.x, car.y) <= R) continue;
    car.alive = false; car.fallT = 0;
    world.shake = Math.max(world.shake ?? 0, 0.45);          // 떨어지는 순간 쿵 — 화면이 한 번 흔들린다
    const by = car.lastHit && b.clock - car.lastHit.at < 2.5 ? car.lastHit.id : null;
    say(world, by !== null ? `${b.names.get(car.id)} 아웃! — ${b.names.get(by)}` : `${b.names.get(car.id)} 떨어졌다`,
        by !== null ? colorOf(by) : PENCIL);
  }
  for (const sp of b.sparks ?? []) sp.t += dt;
  b.sparks = (b.sparks ?? []).filter((sp) => sp.t < 0.3);
  const alive = b.cars.filter((c) => c.alive);
  if (alive.length <= 1 && b.cars.length > 1) {
    b.phase = 'end'; b.timer = END_WAIT;
    const win = alive[0];
    if (win) {
      b.score.set(win.id, (b.score.get(win.id) ?? 0) + 1);
      say(world, `이번 판 — ${b.names.get(win.id)}`, colorOf(win.id));
      if (b.score.get(win.id) >= WIN_AT) { b.over = true; b.winner = win.id; }
    } else say(world, '모두 떨어졌다 — 무승부', PENCIL);
  }
}

// ── 그림 ──
const ring = (cx, cy, r, n = 64) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r * SQ];
});
// 결정론 난수 — 그림의 흠집·볼트 자리가 프레임마다 바뀌면 바닥이 떤다.
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/// 뒤 철망 벽 — 판 뒤쪽 반을 두른 녹슨 철망(기둥 · 가로대 · 촘촘한 살). 경기장이 줄어도 벽은 제자리.
function cageWall(ctx, A, time = 0, excite = 0) {
  const { cx, cy, R } = A;
  const WR = R + 26, WH = Math.min(70, Math.max(24, cy - WR * SQ - 80));   // 위 점수판을 덮지 않을 만큼
  const at = (a, up) => [cx + Math.cos(a) * WR, cy + Math.sin(a) * WR * SQ - up];
  const N = 72;
  ctx.save();
  // 벽 판 — 위로 갈수록 어둡다
  ctx.beginPath();
  for (let i = 0; i <= N; i++) { const [x, y] = at(Math.PI + (i / N) * Math.PI, 0); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
  for (let i = N; i >= 0; i--) { const [x, y] = at(Math.PI + (i / N) * Math.PI, WH); ctx.lineTo(x, y); }
  ctx.closePath();
  const g = ctx.createLinearGradient(0, cy - WR * SQ - WH, 0, cy);
  g.addColorStop(0, '#2a1f19'); g.addColorStop(0.5, '#5b3b27'); g.addColorStop(1, '#3a2a20');
  ctx.fillStyle = g; ctx.fill();
  ctx.clip();
  // 관중 — 철망 너머 계단석에 줄지어 선 사람들. 크게 부딪히거나 떨어지면(화면이 흔들리면) 들썩인다.
  crowd(ctx, at, WH, time, excite);
  // 촘촘한 철망 살
  ctx.strokeStyle = 'rgba(190,140,95,0.28)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 180; i++) {
    const a = Math.PI + (i / 180) * Math.PI, [x0, y0] = at(a, 0), [x1, y1] = at(a, WH);
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  }
  ctx.restore();
  // 가로대 셋 · 기둥
  ctx.save(); ctx.lineCap = 'round';
  for (const [up, w, col] of [[WH, 3, '#8a8f96'], [WH * 0.5, 2, '#6d6258'], [4, 2.5, '#4a4d52']]) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
    for (let i = 0; i <= N; i++) { const [x, y] = at(Math.PI + (i / N) * Math.PI, up); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i <= 18; i++) {
    const a = Math.PI + (i / 18) * Math.PI, [x0, y0] = at(a, 0), [x1, y1] = at(a, WH + 4);
    ctx.strokeStyle = '#25272b'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = '#7d828a'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(x0 - 1, y0); ctx.lineTo(x1 - 1, y1); ctx.stroke();
  }
  ctx.restore();
  // 현수막 — 철망에 건 네 편 색 천 (기둥 사이 몇 칸). 바람에 살짝 흔들린다
  const COLS = ['#2f6db0', '#c0392b', '#d9a21b', '#3f8f56'];
  for (let i = 0; i < 18; i++) {
    if (i % 3 !== 1) continue;
    const a0 = Math.PI + (i / 18) * Math.PI + 0.025, a1 = Math.PI + ((i + 1) / 18) * Math.PI - 0.025;
    const [x0, y0] = at(a0, WH - 2), [x1, y1] = at(a1, WH - 2);
    const drop = WH * 0.55, sway = Math.sin(time * 1.7 + i) * 1.5;
    const col = COLS[(i / 3 | 0) % 4];
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
    ctx.lineTo(x1 + sway, y1 + drop); ctx.lineTo((x0 + x1) / 2 + sway, (y0 + y1) / 2 + drop * 1.18); ctx.lineTo(x0 + sway, y0 + drop);
    ctx.closePath();
    const bg = ctx.createLinearGradient(x0, 0, x1, 0);
    bg.addColorStop(0, mix(col, -0.35)); bg.addColorStop(0.5, col); bg.addColorStop(1, mix(col, -0.35));
    ctx.fillStyle = bg; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x0 + sway * 0.5, y0 + drop * 0.32); ctx.lineTo(x1 + sway * 0.5, y1 + drop * 0.32); ctx.stroke();
    ctx.restore();
  }
}

/// 관중 — 철망 뒤 계단석 세 줄. 뒷줄일수록 위에·작게·어둡게. 사람마다 옷 색·키·흔들림이 다르다(결정론).
function crowd(ctx, at, WH, time, excite) {
  const SHIRTS = ['#2f6db0', '#c0392b', '#d9a21b', '#3f8f56', '#e6e2d8', '#6b4a8a', '#2b2b2b', '#b5651d'];
  const SKIN = ['#f1c9a5', '#d9a47c', '#b7825c', '#8d5a3b'];
  for (let row = 2; row >= 0; row--) {
    const n = 64 - row * 6, base = WH * (0.12 + row * 0.3), sz = 1 - row * 0.16, dim = row * 0.18;
    for (let i = 0; i < n; i++) {
      const id = row * 100 + i;
      const a = Math.PI + ((i + 0.5 + (row % 2) * 0.5) / n) * Math.PI;
      const jump = excite > 0.05 ? Math.abs(Math.sin(time * 14 + hash(id) * 6)) * excite * 9 : 0;
      const bob = Math.sin(time * (1.5 + hash(id + 5)) + hash(id) * 9) * 0.8;
      const [x, y] = at(a, base + jump + bob);
      const s = (5.5 + hash(id + 9) * 1.5) * sz;
      ctx.fillStyle = mix(SHIRTS[(hash(id + 3) * SHIRTS.length) | 0], -0.25 - dim);
      ctx.beginPath(); ctx.ellipse(x, y, s * 0.95, s * 1.1, 0, Math.PI, 0); ctx.lineTo(x + s * 0.95, y + s); ctx.lineTo(x - s * 0.95, y + s); ctx.fill();
      ctx.fillStyle = mix(SKIN[(hash(id + 7) * SKIN.length) | 0], -0.2 - dim);
      ctx.beginPath(); ctx.arc(x, y - s * 1.35, s * 0.55, 0, Math.PI * 2); ctx.fill();
      // 신나면 팔을 든다
      if (jump > 2 && hash(id + 11) > 0.4) {
        ctx.strokeStyle = ctx.fillStyle; ctx.lineWidth = Math.max(1, s * 0.3);
        ctx.beginPath(); ctx.moveTo(x - s * 0.7, y - s * 0.5); ctx.lineTo(x - s * 1.1, y - s * 2); ctx.moveTo(x + s * 0.7, y - s * 0.5); ctx.lineTo(x + s * 1.1, y - s * 2); ctx.stroke();
      }
    }
  }
  // 위로 갈수록 그늘 — 계단석 뒤쪽은 조명이 덜 닿는다
  ctx.fillStyle = 'rgba(20,14,10,0.25)';
  const [, yTop] = at(Math.PI * 1.5, WH);
  ctx.fillRect(0, yTop - 10, 99999, WH * 0.45);
}

/// 조명탑 — 판 뒤 양쪽 모서리에 선 기둥과 등 여섯 칸, 판 위로 떨어지는 빛기둥.
function lightTowers(ctx, A, time) {
  const { cx, cy, R } = A;
  const WR = R + 26;
  for (const side of [-1, 1]) {
    const a = side < 0 ? Math.PI + 0.34 : Math.PI * 2 - 0.34;
    const bx = cx + Math.cos(a) * (WR + 14), by = cy + Math.sin(a) * (WR + 14) * SQ;
    const H = Math.min(150, Math.max(80, by - 90));
    const tx = bx, ty = by - H;
    // 빛기둥 — 등에서 판 가운데 쪽으로 퍼진다
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const fx = cx + side * R * 0.15, fy = cy + R * SQ * 0.1;
    const lg = ctx.createLinearGradient(tx, ty, fx, fy);
    lg.addColorStop(0, 'rgba(255,244,210,0.16)'); lg.addColorStop(1, 'rgba(255,244,210,0)');
    ctx.fillStyle = lg;
    const nx = -(fy - ty), ny = fx - tx, nl = Math.hypot(nx, ny) || 1, w = R * 0.42;
    ctx.beginPath(); ctx.moveTo(tx - side * 6, ty); ctx.lineTo(fx + (nx / nl) * w, fy + (ny / nl) * w * SQ);
    ctx.lineTo(fx - (nx / nl) * w, fy - (ny / nl) * w * SQ); ctx.closePath(); ctx.fill();
    ctx.restore();
    // 기둥 — 격자 철탑
    ctx.save();
    ctx.strokeStyle = '#2b2e33'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(bx - 6, by); ctx.lineTo(tx - 3, ty + 8); ctx.moveTo(bx + 6, by); ctx.lineTo(tx + 3, ty + 8); ctx.stroke();
    ctx.lineWidth = 1.2; ctx.strokeStyle = '#4a4e55';
    for (let k = 0; k < 8; k++) {
      const t0 = k / 8, t1 = (k + 1) / 8, w0 = 6 - 3 * t0, w1 = 6 - 3 * t1;
      const y0 = by - (by - ty - 8) * t0, y1 = by - (by - ty - 8) * t1;
      ctx.beginPath(); ctx.moveTo(bx - w0, y0); ctx.lineTo(bx + w1, y1); ctx.moveTo(bx + w0, y0); ctx.lineTo(bx - w1, y1); ctx.stroke();
    }
    // 등 머리 — 2×3 칸, 하나씩 깜박
    const hw = 30, hh = 18;
    ctx.fillStyle = '#25282d'; ctx.fillRect(tx - hw / 2 - 2, ty - hh / 2 - 2, hw + 4, hh + 4);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const x = tx - hw / 2 + i * (hw / 3) + 1.5, y = ty - hh / 2 + j * (hh / 2) + 1.5;
      const flick = 0.85 + 0.15 * Math.sin(time * 9 + i * 3 + j * 5 + side);
      ctx.save(); ctx.shadowColor = '#fff3c4'; ctx.shadowBlur = 10;
      ctx.fillStyle = `rgba(255,248,220,${flick})`; ctx.fillRect(x, y, hw / 3 - 3, hh / 2 - 3);
      ctx.restore();
    }
    ctx.restore();
  }
}

/// 경기장 — **철판 바닥의 범퍼카장.** 잉크 선 그림체는 그대로, 재료를 그린다:
/// 판 밑 낭떠러지(어둠) · 철판 옆벽(골) · 이음매로 나뉜 철판과 볼트 · 미끄럼 방지 무늬 · 닳은 자국 ·
/// 가운데 칠한 원과 바닥 글씨 · 가장자리 경고띠와 테두리 등. 무너지면 바닥이 그 반지름까지만 남는다.
function drawArena(ctx, A, Rk, time, excite = 0) {
  const { cx, cy, R } = A;
  const r = R * Rk;                                          // 남은 바닥
  const path = (pts) => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); };
  // ① 밑 — 판 아래 낭떠러지. 가장자리 밖으로 갈수록 어둡다 (떨어지면 저 아래로)
  ctx.save();
  const pit = ctx.createRadialGradient(cx, cy + 60, R * 0.3, cx, cy + 60, R * 1.25);
  pit.addColorStop(0, 'rgba(14,16,20,0.75)'); pit.addColorStop(0.75, 'rgba(14,16,20,0.35)'); pit.addColorStop(1, 'rgba(14,16,20,0)');
  ctx.fillStyle = pit; ctx.beginPath(); ctx.ellipse(cx, cy + 60, R * 1.25, R * 1.25 * SQ, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // 무너진 자리 — 원래 테두리만 끊긴 철골처럼 남는다
  if (Rk < 1) {
    ctx.save(); ctx.setLineDash([14, 10]);
    stroke(ctx, ring(cx, cy, R), { width: 2, color: PENCIL, close: true, seed: 2, amp: 1.4, halo: false, alpha: 0.6 });
    ctx.restore();
  }
  // ①½ 뒤 철망 벽 — 원작처럼 판 뒤쪽을 녹슨 철망이 두른다 (앞쪽은 안 그린다 — 차를 가린다). 너머엔 관중.
  cageWall(ctx, A, time, excite);
  // ② 옆벽 — 두꺼운 철판 원통. 가운데가 밝고 양옆이 어둡다(둥근 면). 세로 골이 진다
  const wall = 34;
  ctx.save();
  ctx.beginPath(); ctx.ellipse(cx, cy + wall, r, r * SQ, 0, 0, Math.PI); ctx.lineTo(cx - r, cy); ctx.ellipse(cx, cy, r, r * SQ, 0, Math.PI, 0, true); ctx.closePath();
  const wg = ctx.createLinearGradient(cx - r, 0, cx + r, 0);
  wg.addColorStop(0, '#2c2f34'); wg.addColorStop(0.4, '#7a7f86'); wg.addColorStop(0.55, '#8d9197'); wg.addColorStop(1, '#25282d');
  ctx.fillStyle = wg; ctx.fill();
  ctx.restore();
  ctx.save(); ctx.strokeStyle = 'rgba(15,16,18,0.45)'; ctx.lineWidth = 1.2;
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    if (Math.sin(a) < -0.05) continue;                       // 뒤쪽 벽은 안 보인다
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * SQ;
    ctx.beginPath(); ctx.moveTo(x, y + 3); ctx.lineTo(x, y + wall); ctx.stroke();
  }
  ctx.restore();
  stroke(ctx, ring(cx, cy + wall, r), { width: 2.4, color: INK, close: true, seed: 3, amp: 0.8 });
  // ③ 바닥 — 철판. 가운데가 밝고(조명) 가장자리로 갈수록 그늘
  ctx.save(); path(ring(cx, cy, r));
  const floor = ctx.createRadialGradient(cx, cy - r * 0.15 * SQ, r * 0.1, cx, cy, r);
  floor.addColorStop(0, '#b4b7bb'); floor.addColorStop(0.6, '#94989d'); floor.addColorStop(1, '#6c7075');
  ctx.fillStyle = floor; ctx.fill();
  ctx.clip();
  // 철판 이음매 — 큰 판을 격자로 깔았다 (경기장 좌표에서 110px 칸)
  const T = 110;
  ctx.strokeStyle = 'rgba(30,32,36,0.45)'; ctx.lineWidth = 1.4;
  for (let gx = -Math.ceil(R / T) * T; gx <= R; gx += T) {
    ctx.beginPath(); ctx.moveTo(cx + gx, cy - R * SQ); ctx.lineTo(cx + gx, cy + R * SQ); ctx.stroke();
  }
  for (let gy = -Math.ceil(R / T) * T; gy <= R; gy += T) {
    ctx.beginPath(); ctx.moveTo(cx - R, cy + gy * SQ); ctx.lineTo(cx + R, cy + gy * SQ); ctx.stroke();
  }
  // 볼트 — 이음매가 만나는 자리마다 넷
  ctx.fillStyle = 'rgba(30,32,36,0.6)';
  for (let gx = -Math.ceil(R / T) * T; gx <= R; gx += T) {
    for (let gy = -Math.ceil(R / T) * T; gy <= R; gy += T) {
      if (Math.hypot(gx, gy) > r) continue;
      for (const [ox, oy] of [[-8, -8], [8, -8], [-8, 8], [8, 8]]) {
        ctx.beginPath(); ctx.ellipse(cx + gx + ox, cy + (gy + oy) * SQ, 1.7, 1.7 * SQ + 0.4, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  // 미끄럼 방지 무늬 — 판마다 짧은 빗금 몇 개 (철판의 돌기)
  ctx.strokeStyle = 'rgba(235,238,242,0.22)'; ctx.lineWidth = 1;
  for (let n = 0; n < 260; n++) {
    const x = (hash(n) * 2 - 1) * R, y = (hash(n + 999) * 2 - 1) * R;
    if (Math.hypot(x, y) > r) continue;
    const s = n % 2 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(cx + x - 4, cy + (y - 4 * s) * SQ); ctx.lineTo(cx + x + 4, cy + (y + 4 * s) * SQ); ctx.stroke();
  }
  // 닳은 자국 — 오래 달린 범퍼카장의 검은 얼룩
  for (let n = 0; n < 9; n++) {
    const a = hash(n + 50) * Math.PI * 2, d = (0.25 + hash(n + 70) * 0.6) * r;
    const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d * SQ;
    const g = ctx.createRadialGradient(x, y, 0, x, y, 40 + hash(n) * 50);
    g.addColorStop(0, 'rgba(20,22,26,0.12)'); g.addColorStop(1, 'rgba(20,22,26,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, 90, 90 * SQ, 0, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // 위 조명 — 판 가운데 위쪽이 번들거린다
  ctx.save(); path(ring(cx, cy, r)); ctx.clip();
  const spot = ctx.createRadialGradient(cx - r * 0.15, cy - r * SQ * 0.35, 0, cx - r * 0.15, cy - r * SQ * 0.35, r * 0.9);
  spot.addColorStop(0, 'rgba(255,255,255,0.22)'); spot.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spot; ctx.fillRect(cx - r, cy - r * SQ, r * 2, r * 2 * SQ);
  ctx.restore();
  // ④ 가운데 — 칠한 노란 원(군데군데 벗겨졌다)과 바닥 글씨
  const cr = R * 0.26 * Math.min(1, Rk / 0.5);
  ctx.save(); ctx.setLineDash([46, 6, 18, 5]);
  stroke(ctx, ring(cx, cy, cr), { width: 4, color: '#d9a21b', close: true, seed: 6, amp: 0.6, halo: false, alpha: 0.9 });
  ctx.restore();
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, SQ);
  text(ctx, '몰겜', 0, 14, { font: `900 ${Math.round(cr * 0.62)}px ${HAN}`, color: '#202226', align: 'center', halo: 0, alpha: 0.14 });
  ctx.restore();
  // ⑤ 가장자리 경고띠 — 노랑·검정 (떨어지기 직전 칸)
  const band = 16;
  for (let i = 0; i < 64; i++) {
    const a0 = (i / 64) * Math.PI * 2, a1 = ((i + 1) / 64) * Math.PI * 2;
    const p = (a, rr) => [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * SQ];
    ctx.save(); ctx.beginPath();
    [p(a0, r), p(a1, r), p(a1, r - band), p(a0, r - band)].forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.fillStyle = i % 2 ? '#1c1a17' : '#e0b228';
    ctx.globalAlpha = Rk < 1 ? 0.75 + 0.25 * Math.sin(time * 8) : 0.9;
    ctx.fill(); ctx.restore();
  }
  // 띠 안쪽 흰 선 · 바깥 철 테두리
  stroke(ctx, ring(cx, cy, r - band - 3), { width: 1.6, color: '#fbfaf6', close: true, seed: 8, amp: 0.4, halo: false, alpha: 0.8 });
  stroke(ctx, ring(cx, cy, r), { width: 3, color: Rk < 1 ? RED : INK, close: true, seed: 4, amp: 0.7 });
  // ⑥ 테두리 등 — 스물넷. 평소엔 호박색, 무너지기 시작하면 빨갛게 깜박인다
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const x = cx + Math.cos(a) * (r + 1), y = cy + Math.sin(a) * (r + 1) * SQ;
    const on = Rk < 1 ? (Math.sin(time * 10 + i) > 0) : true;
    const col = Rk < 1 ? '#e2412b' : '#f2b233';
    ctx.save();
    if (on) { ctx.shadowColor = col; ctx.shadowBlur = 8; }
    ctx.fillStyle = on ? col : '#6b665c';
    ctx.beginPath(); ctx.ellipse(x, y, 3.2, 2.4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
}

/// 바퀴 자국 — 미끄러지거나(옆으로 쓸린 빠르기) 돌진·급정거할 때 바닥에 검은 줄이 남고 몇 초에 걸쳐 옅어진다.
/// 그림만이다 (꾸러미에 안 싣는다) — 누구 화면에서나 제 눈에 보이는 차 움직임으로 남긴다.
const SKID_LIFE = 6;
function skidMarks(ctx, A, b, cars, time) {
  b.skids ??= [];
  b.skidLast ??= new Map();
  for (const c of cars) {
    if (!c.alive) { b.skidLast.delete(c.id); continue; }
    const last = b.skidLast.get(c.id);
    b.skidLast.set(c.id, { x: c.x, y: c.y });
    if (!last) continue;
    const step = Math.hypot(c.x - last.x, c.y - last.y);
    if (step < 1 || step > 60) continue;
    const side = Math.abs(-c.vx * Math.sin(c.h) + c.vy * Math.cos(c.h));
    if (!(side > 90 || c.boostT > 0 || (c.spin && Math.abs(c.spin) > 1.5))) continue;
    for (const s of [-1, 1]) {
      const ox = -Math.sin(c.h) * s * CAR_R * 0.55, oy = Math.cos(c.h) * s * CAR_R * 0.55;
      b.skids.push([last.x + ox, last.y + oy, c.x + ox, c.y + oy, time]);
    }
  }
  b.skids = b.skids.filter((k) => time - k[4] < SKID_LIFE && time >= k[4]);
  if (b.skids.length > 600) b.skids.splice(0, b.skids.length - 600);
  ctx.save(); ctx.lineCap = 'round'; ctx.lineWidth = 3;
  for (const [x0, y0, x1, y1, t] of b.skids) {
    const [a, c0] = scr(A, x0, y0), [d, e] = scr(A, x1, y1);
    ctx.strokeStyle = `rgba(20,22,26,${0.16 * (1 - (time - t) / SKID_LIFE)})`;
    ctx.beginPath(); ctx.moveTo(a, c0); ctx.lineTo(d, e); ctx.stroke();
  }
  ctx.restore();
}

// ── 차 (3D) — 원작(백래쉬)의 범퍼카: 두툼한 고무 범퍼 치마 위에 색 몸통, 가운데 흰 줄, 뒤쪽 유리 덮개와 손잡이 고리.
// 위에서 비스듬히 본 원기둥 두 단을 그림자·빛으로 세운다(옆면은 가운데가 밝은 원통 빛, 윗면은 왼쪽 위 빛).
const mix = (hex, t) => {           // t>0 이면 흰색 쪽, t<0 이면 검정 쪽
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  const m = c.map((v) => Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t)));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
};
/// 원뿔대 한 단 — 바닥 높이 y0 (반지름 rx) 에서 위로 h (반지름 rt). 옆면(원통 빛) 다음 윗면.
function drum(ctx, x, y0, rx, rt, h, side, top) {
  ctx.beginPath();
  ctx.ellipse(x, y0, rx, rx * SQ, 0, 0, Math.PI);               // 아래 반원(앞쪽)
  ctx.lineTo(x - rt, y0 - h);
  ctx.ellipse(x, y0 - h, rt, rt * SQ, 0, Math.PI, 0, true);     // 윗면 앞 가장자리
  ctx.closePath();
  const g = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
  g.addColorStop(0, side[0]); g.addColorStop(0.38, side[1]); g.addColorStop(1, side[2]);
  ctx.fillStyle = g; ctx.fill();
  const ry = rt * SQ;
  ctx.beginPath(); ctx.ellipse(x, y0 - h, rt, ry, 0, 0, Math.PI * 2);
  const t = ctx.createRadialGradient(x - rt * 0.35, y0 - h - ry * 0.4, rt * 0.05, x, y0 - h, rt);
  t.addColorStop(0, top[0]); t.addColorStop(0.55, top[1]); t.addColorStop(1, top[2]);
  ctx.fillStyle = t; ctx.fill();
}
function carBody(ctx, sx, sy, r, color, h, alpha) {
  const hx = Math.cos(h), hy = Math.sin(h);
  const skirtH = r * 0.26, bodyH = r * 0.42;
  const rs = r * 0.9;                // 범퍼 치마 윗면
  const rb = r * 0.86, rt = r * 0.62; // 몸통 아래 · 윗면 — 위로 갈수록 좁아지는 종 모양
  const topY = sy - skirtH - bodyH;
  // 바닥 그림자 — 차 밑이 가장 진하다
  const sh = ctx.createRadialGradient(sx + 4, sy + 3, r * 0.2, sx + 4, sy + 3, r * 1.25);
  sh.addColorStop(0, 'rgba(10,10,12,0.45)'); sh.addColorStop(1, 'rgba(10,10,12,0)');
  ctx.fillStyle = sh; ctx.beginPath(); ctx.ellipse(sx + 4, sy + 3, r * 1.25, r * 1.25 * SQ, 0, 0, Math.PI * 2); ctx.fill();
  // 고무 범퍼 치마 — 흰 회색 두툼한 고리
  drum(ctx, sx, sy, r, rs, skirtH, ['#8e9196', '#f3f3f1', '#7d8085'], ['#ffffff', '#e4e5e3', '#b9bbbd']);
  // 몸통 — 사람 색
  drum(ctx, sx, sy - skirtH, rb, rt, bodyH, [mix(color, -0.5), mix(color, 0.12), mix(color, -0.55)], [mix(color, 0.5), color, mix(color, -0.3)]);
  // 윗면 흰 줄 — 앞뒤로 (바라보는 쪽)
  ctx.save();
  ctx.beginPath(); ctx.ellipse(sx, topY, rt, rt * SQ, 0, 0, Math.PI * 2); ctx.clip();
  ctx.lineCap = 'butt';
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = rt * 0.36;
  ctx.beginPath(); ctx.moveTo(sx - hx * rt, topY - hy * rt * SQ); ctx.lineTo(sx + hx * rt, topY + hy * rt * SQ); ctx.stroke();
  ctx.strokeStyle = mix(color, -0.15); ctx.lineWidth = rt * 0.09;
  ctx.beginPath(); ctx.moveTo(sx - hx * rt, topY - hy * rt * SQ); ctx.lineTo(sx + hx * rt, topY + hy * rt * SQ); ctx.stroke();
  ctx.restore();
  // 옆면 흰 줄 — 윗면 줄이 앞뒤로 흘러내린다 (보이는 쪽만)
  for (const phi of [h, h + Math.PI]) {
    if (Math.sin(phi) < -0.05) continue;
    const w = 0.2;
    const at = (rr, y, d) => [sx + Math.cos(phi + d) * rr, y + Math.sin(phi + d) * rr * SQ];
    ctx.beginPath();
    [at(rb, sy - skirtH, -w), at(rt, topY, -w * 1.2), at(rt, topY, w * 1.2), at(rb, sy - skirtH, w)].forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.fill();
  }
  // 뒷등 둘 — 빨강 (등을 보이면 어느 쪽을 보는지 안다)
  for (const s of [-0.5, 0.5]) {
    const a = h + Math.PI + s;
    if (Math.sin(a) < -0.15) continue;
    const lr = (rb + rt) / 2;
    const lx = sx + Math.cos(a) * lr, ly = sy - skirtH - bodyH * 0.5 + Math.sin(a) * lr * SQ;
    ctx.fillStyle = '#d6332a'; ctx.beginPath(); ctx.ellipse(lx, ly, r * 0.09, r * 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,34,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  }
  // 전조등 둘 — 앞쪽 몸통 가장자리 (앞이 보이는 쪽이면 옆면, 아니면 윗면 가장자리)
  for (const s of [-0.42, 0.42]) {
    const a = h + s, front = Math.sin(a) > -0.15;
    const lr = front ? (rb + rt) / 2 : rt;
    const lx = sx + Math.cos(a) * lr * 0.98, ly = (front ? sy - skirtH - bodyH * 0.5 : topY) + Math.sin(a) * lr * SQ * 0.98;
    const lg = ctx.createRadialGradient(lx - 1, ly - 1, 0.5, lx, ly, r * 0.13);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.6, '#fff1b0'); lg.addColorStop(1, '#b59b45');
    ctx.fillStyle = lg; ctx.beginPath(); ctx.ellipse(lx, ly, r * 0.12, r * 0.12 * (front ? 0.95 : SQ), 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(30,30,34,0.55)'; ctx.lineWidth = 1; ctx.stroke();
  }
  // 유리 덮개 — 몸통 가운데에서 조금 뒤, 둥근 회색 돔
  const dx = sx - hx * rt * 0.1, dy = topY - hy * rt * 0.1 * SQ;
  const dr = rt * 0.72, dh = dr * 0.6;
  ctx.beginPath();
  ctx.ellipse(dx, dy, dr, dr * SQ, 0, 0, Math.PI);
  ctx.ellipse(dx, dy - dh * 0.15, dr, dh + dr * SQ * 0.4, 0, Math.PI, 0);
  ctx.closePath();
  const dg = ctx.createRadialGradient(dx - dr * 0.35, dy - dh, dr * 0.05, dx, dy - dh * 0.3, dr * 1.1);
  dg.addColorStop(0, '#f3f5f7'); dg.addColorStop(0.35, '#9aa1a9'); dg.addColorStop(1, '#3b4047');
  ctx.fillStyle = dg; ctx.fill();
  ctx.strokeStyle = 'rgba(20,20,24,0.5)'; ctx.lineWidth = 1.2; ctx.stroke();
  // 손잡이 고리 — 덮개 위로 솟은 은색 아치. 원작처럼 앞뒤로 (다리미 손잡이)
  const px = hx, py = hy;
  const ax = dx + px * dr * 0.85, ay = dy + py * dr * 0.85 * SQ, bx = dx - px * dr * 0.85, by = dy - py * dr * 0.85 * SQ;
  const top = dy - dh - dr * 0.75;
  ctx.lineCap = 'round';
  for (const [w, col] of [[5, 'rgba(25,25,30,0.6)'], [3, '#e9ecef'], [1.2, '#ffffff']]) {
    ctx.strokeStyle = col; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(dx, top, bx, by); ctx.stroke();
  }
}

function drawCar(ctx, A, car, color, { mine = false, name = '', time = 0 } = {}) {
  const fall = car.alive ? 0 : Math.min(1, car.fallT / FALL_T);
  if (fall >= 1) return;
  // **떨어진다** — 가장자리 너머로 조금 더 미끄러져 나가며 고꾸라지고, 점점 빨리 아래로 떨어진다.
  // 끝 30% 에서만 옅어진다 (처음부터 옅어지면 떨어지는 게 아니라 사라지는 것으로 보인다).
  const d = Math.hypot(car.x, car.y) || 1;
  const out = 34 * Math.min(1, fall * 2.5);
  const [sx, sy0] = scr(A, car.x + (car.x / d) * out, car.y + (car.y / d) * out);
  const sy = sy0 + FALL_DROP * fall * fall;
  const k = 1 - fall * 0.45;
  const r = CAR_R * k * (1 + 0.08 * Math.max(-1, Math.min(1, car.y / A.R)));   // 가까운(아래) 차가 조금 크다
  const alpha = fall < 0.7 ? 1 : 1 - (fall - 0.7) / 0.3;
  if (fall > 0) {
    // 떨어지는 길 — 차 위로 속도선
    for (let i = -1; i <= 1; i++) {
      stroke(ctx, [[sx + i * 10, sy - r * SQ - 8], [sx + i * 10, sy - r * SQ - 8 - 40 * fall]],
             { width: 2, color: PENCIL, seed: 40 + i, amp: 0.4, halo: false, alpha: alpha * 0.7 });
    }
  }
  ctx.save();
  ctx.globalAlpha = alpha;
  if (fall > 0) { ctx.translate(sx, sy); ctx.rotate(fall * 2.2 * (car.x >= 0 ? 1 : -1)); ctx.translate(-sx, -sy); }
  // 부딪혀 출렁 — 가로로 퍼졌다 세로로 섰다 하며 잦아든다
  if (car.wob > 0.01) {
    const q = car.wob * Math.sin((car.wobT ?? 0) * 30) * 0.2;
    ctx.translate(sx, sy); ctx.scale(1 + q, 1 - q); ctx.translate(-sx, -sy);
  }
  const hx = Math.cos(car.h), hy = Math.sin(car.h);
  carBody(ctx, sx, sy, r, color, car.h, alpha);
  if (car.boostT > 0) for (let i = -1; i <= 1; i++) {
    const ox = -hy * i * 12, oy = hx * i * 12 * SQ;
    stroke(ctx, [[sx - hx * r * 1.2 + ox, sy - hy * r * 1.2 * SQ + oy], [sx - hx * r * 2.8 + ox, sy - hy * r * 2.8 * SQ + oy]],
           { width: 2.2, color: PENCIL, seed: 20 + i, amp: 0.4, halo: false, alpha });
  }
  ctx.restore();
  if (fall > 0) return;
  // 이름표 · 내 차는 밑줄과 돌진 막대
  text(ctx, name, sx, sy - r * 1.35 - 6, { font: `700 11px ${HAN}`, color, align: 'center', halo: 3 });
  if (mine) {
    stroke(ctx, [[sx - 14, sy - r * 1.35 - 2], [sx + 14, sy - r * 1.35 - 2]], { width: 2, color: RED, seed: 17, amp: 0.3, halo: false });
    const bar = (y, left, total, col, label) => {
      const w = 28, f = 1 - Math.min(1, left / total);
      ctx.fillStyle = 'rgba(107,102,92,0.3)'; ctx.fillRect(sx - w / 2, y, w, 3);
      ctx.fillStyle = f >= 1 ? col : PENCIL; ctx.fillRect(sx - w / 2, y, w * f, 3);
      if (f >= 1) text(ctx, label, sx + w / 2 + 3, y + 4, { font: `700 8px ${HAN}`, color: col, halo: 2 });
    };
    bar(sy + r * SQ + 14, car.boostCool, BOOST_COOL, INK, '돌진');
  }
}

// ── 카메라 — 내 차를 따라간다 ──
// 원작(백래쉬)은 내 차 뒤에서 살짝 확대해 따라간다 — 판 전체가 다 보이면 생동감이 없다.
// 화면을 돌리지는 않는다(방향키가 화면 방향이라 화면이 돌면 키가 헷갈린다). 확대·따라가기만.
const CAM_ZOOM = 1.7;       // 따라갈 때 확대
const CAM_LEAD = 0.3;       // 달리는 쪽을 이만큼(초) 앞서 보여 준다 — 어디로 가는지 보이게
const CAM_EASE = 4.5;       // 따라가는 부드러움 (클수록 바짝)
function camera(world, A, all, time) {
  const b = world.bag;
  const me = all.find((c) => c.id === world.mp.myId);
  const follow = me && !b.over && (me.alive || me.fallT < 0.8);
  let x = A.cx, y = A.cy, z = 1;
  if (follow) {
    const lead = me.alive ? CAM_LEAD : 0;
    [x, y] = scr(A, me.x + me.vx * lead, me.y + me.vy * lead);
    z = CAM_ZOOM;
  }
  const ax = world.w / 2, ay = world.h * 0.56;
  const cam = (b.cam ??= { x, y, z, t: time });
  const dt = Math.max(0, Math.min(0.1, time - cam.t));
  cam.t = time;
  const k = 1 - Math.exp(-CAM_EASE * dt), kz = 1 - Math.exp(-CAM_EASE * 0.6 * dt);
  cam.x += (x - cam.x) * k; cam.y += (y - cam.y) * k; cam.z += (z - cam.z) * kz;
  // 기준점(ax, ay)이 경기장 가운데와 같은 자리다 — 판 전체로 돌아가면(z=1, 가운데) 예전 그림 그대로.
  return { x: cam.x, y: cam.y, z: cam.z, ax, ay };
}
/// 화면 밖 차 — 화면 가장자리에 그 차 색 세모와 이름. 확대하면 다 안 보이니 어디서 오는지 알려 준다.
function offscreenMarks(ctx, world, A, all, cam) {
  if (cam.z < 1.05) return;
  const b = world.bag;
  const M = 26, top = 92;
  for (const car of all) {
    if (!car.alive || car.id === world.mp.myId) continue;
    const [wx, wy] = scr(A, car.x, car.y);
    const sx = (wx - cam.x) * cam.z + cam.ax, sy = (wy - cam.y) * cam.z + cam.ay;
    if (sx > M && sx < world.w - M && sy > top && sy < world.h - M) continue;
    const ex = Math.max(M, Math.min(world.w - M, sx)), ey = Math.max(top, Math.min(world.h - M, sy));
    const a = Math.atan2(sy - ey || sy - world.h / 2, sx - ex || sx - world.w / 2);
    const col = colorOf(car.id);
    ctx.save(); ctx.translate(ex, ey); ctx.rotate(a);
    ctx.fillStyle = col; ctx.strokeStyle = '#fbfaf6'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(-7, -9); ctx.lineTo(-7, 9); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    const tx = ex - Math.cos(a) * 22, ty = ey - Math.sin(a) * 18;
    text(ctx, b.names.get(car.id) ?? '', tx, ty + 4, { font: `700 11px ${HAN}`, color: col, align: 'center', halo: 3 });
  }
}

/// 「쿵」·「쾅!」 — 부딪힌 자리에서 톡 튀어나와 떠오르며 옅어진다.
function drawPops(ctx, world) {
  const b = world.bag;
  if (!b?.pops?.length) return;
  const A = arena(world);
  for (const p of b.pops) {
    const [x, y] = scr(A, p.x, p.y);
    const g = p.t / POP_T;
    const pop = 1 + 0.5 * Math.max(0, 1 - p.t / 0.08);
    text(ctx, p.word, x, y - 30 - g * 18, { font: `800 ${Math.round((p.word === '쾅!' ? 22 : 16) * pop)}px ${HAN}`,
      color: p.word === '쾅!' ? RED : INK, align: 'center', halo: 4, alpha: 1 - g * g });
  }
}

const KEY_ROWS = [
  ['⌥ 방향키', '그쪽으로 간다 — 차가 돌아서 간다 (대각선도)'],
  ['손 떼기', '천천히 선다'],
  ['⌥ Space', '돌진 — 그냥 차를 멀리 민다'],
];

/// 손님 — 받은 차 자리를 다음 꾸러미까지 이어 그린다. 내 차는 내 키로 앞질러 굴린다.
function predicted(world, car) {
  const b = world.bag;
  const age = Math.min(0.25, b.age ?? 0);
  const c = { ...car };
  if (!car.alive || age <= 0) return c;
  if (car.id === world.mp.myId && b.phase === 'go') {
    const input = inputOf(world, c);
    for (let t = 0; t < age; t += 1 / 60) { drive(c, input, Math.min(1 / 60, age - t)); c.x += c.vx / 60; c.y += c.vy / 60; }
  } else { c.x += c.vx * age; c.y += c.vy * age; }
  return c;
}

export default {
  id: 'bumper',
  name: '범퍼카',
  line: '둥근 경기장에서 서로 밀어 떨어뜨린다. 마지막에 남으면 한 판, 5점 먼저. 닿으면 충격파가 터져 받힌 차가 날아간다.',
  keys: KEY_ROWS,
  tally: (world) => [...(world.bag?.score ?? new Map()).values()].join(' : '),
  noGrab: true,
  noClock: true,
  noResults: true,
  noGround: true,
  joinsAnytime: true,
  blocked: () => null,
  /// 사람은 차로만 보인다 — 졸라맨(서 있는 사람)은 안 그린다. 차는 draw 가 그린다.
  figure: () => {},

  fresh: freshBag,
  begin(world) { Object.assign(world.bag, freshBag()); },
  /// 내 사람은 판 위에 없다 — 엔진의 달리기·점프를 끈다(위아래 키는 가속·브레이크다).
  move(world) { const p = world.player; p.air = 0; p.vx = 0; p.vy = 0; p.groundY = world.groundY; },

  /// ⌥Space — 돌진. 손님은 방장에게 부탁하고, 제 화면에서도 바로 건다(손맛).
  action(world) { act(world, 'boost'); },
  release() {},
  drop() {},
  tap(world) { sendKeys(world); },

  update(world, dt) {
    const b = world.bag;
    if (!b.cars) Object.assign(b, freshBag());
    for (const w of b.words) w.t += dt;
    b.words = b.words.filter((w) => w.t < 2.2);
    // 출렁임 · 「쿵」은 누구 화면에서나 제 시간으로 잦아든다
    for (const car of b.cars ?? []) { car.wobT = (car.wobT ?? 0) + dt; car.wob = Math.max(0, (car.wob ?? 0) - WOB_DECAY * dt); }
    for (const p of b.pops ?? []) p.t += dt;
    b.pops = (b.pops ?? []).filter((p) => p.t < POP_T);
    if (world.mp.role === 'guest') {
      b.age = (b.age ?? 0) + dt;
      sendKeys(world);
      return;
    }
    if (!b.cars.length) newRound(world);
    // 사람이 나가면 **그 판은 무르고** 다시 한다 — 남은 사람이 「마지막 생존」으로 거저 점수를 받으면 안 된다.
    // 들어온 사람은 다음 판부터 탄다(그동안은 구경).
    const ids = new Set(roster(world));
    if (b.cars.some((car) => car.id >= 0 && !ids.has(car.id)) && !b.over) {
      say(world, '사람이 나가서 이 판은 다시 한다', PENCIL);
      newRound(world);
    }
    if (world.state !== 'play') return;
    if (b.over) {
      if (!b.ended) {
        b.ended = true;
        world.onGameOver?.({ name: b.names.get(b.winner) ?? '', side: 0, rows: [] });
      }
      return;
    }
    if (b.phase === 'count') {
      b.timer -= dt;
      if (b.timer <= 0) { b.phase = 'go'; say(world, '출발!', INK); }
      return;
    }
    if (b.phase === 'end') {
      b.timer -= dt;
      for (const car of b.cars) if (!car.alive) car.fallT += dt;
      if (b.timer <= 0) newRound(world);
      return;
    }
    step(world, dt);
  },

  draw(ctx, world, time) {
    const b = world.bag;
    if (!b?.cars) return;
    const A = arena(world);
    const all = (world.mp.role === 'guest' ? b.cars.map((c) => predicted(world, c)) : b.cars);
    // 카메라 — 내 차를 따라 확대한다(원작처럼 3인칭 느낌). 판 밖으로 나가면 다시 판 전체.
    const cam = camera(world, A, all, time);
    ctx.save();
    ctx.translate(cam.ax, cam.ay); ctx.scale(cam.z, cam.z); ctx.translate(-cam.x, -cam.y);
    const fallingBack = all.filter((c) => !c.alive && c.y < 0);
    // **먼 쪽(위) 가장자리로 떨어진 차는 경기장 뒤로** 숨는다 — 바닥을 나중에 그려 가린다.
    for (const car of fallingBack) drawCar(ctx, A, car, colorOf(car.id), { name: b.names.get(car.id) ?? '', time });
    drawArena(ctx, A, b.Rk ?? 1, time, world.shake ?? 0);
    skidMarks(ctx, A, b, all, time);
    lightTowers(ctx, A, time);
    // 떨어진 자리 — 가장자리에 흙먼지 고리 (어디서 떨어졌는지 남는다)
    for (const car of all) {
      if (car.alive || car.fallT > 0.6) continue;
      const d = Math.hypot(car.x, car.y) || 1;
      const R = A.R * (b.Rk ?? 1);
      const [ex, ey] = scr(A, car.x / d * R, car.y / d * R);
      const g = car.fallT / 0.6;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        circle(ctx, ex + Math.cos(a) * (10 + 26 * g), ey + Math.sin(a) * (6 + 14 * g), 4 + 3 * g,
               { width: 1.6, color: PENCIL, seed: 50 + i, amp: 0.4, halo: false, alpha: 0.8 * (1 - g) });
      }
    }
    // 나머지는 위에서 아래 순서로 (가까운 차가 앞에). 가까운 쪽으로 떨어지는 차는 가장자리 앞으로 떨어진다.
    const cars = all.filter((c) => !(fallingBack.includes(c))).sort((p, q) => (p.y - q.y));
    for (const car of cars) {
      drawCar(ctx, A, car, colorOf(car.id), { mine: car.id === world.mp.myId, name: b.names.get(car.id) ?? '', time });
    }
    for (const sp of b.sparks ?? []) {
      const [x, y] = scr(A, sp.x, sp.y);
      const k = sp.k ?? 1, g = sp.t / 0.3;
      // 퍼지는 충격 고리 — 빠르게 커지며 옅어진다
      const rr = CAR_R * (0.6 + (1.2 + k * 1.6) * (1 - (1 - g) * (1 - g)));
      ctx.save();
      ctx.globalAlpha = (1 - g) * (0.35 + 0.4 * k);
      ctx.strokeStyle = '#7fd4c4'; ctx.lineWidth = 3 + 5 * k * (1 - g);
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * SQ, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#bff0e6'; ctx.globalAlpha *= 0.35;
      ctx.beginPath(); ctx.ellipse(x, y, rr, rr * SQ, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      if (k < 0.5) continue;
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2, r0 = 8 + sp.t * 40;
        stroke(ctx, [[x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.7], [x + Math.cos(a) * (r0 + 9), y + Math.sin(a) * (r0 + 9) * 0.7]],
               { width: 2.2, color: RED, seed: 30 + i, amp: 0.3, halo: false, alpha: 1 - sp.t / 0.3 });
      }
    }
    drawPops(ctx, world);
    ctx.restore();
    offscreenMarks(ctx, world, A, all, cam);
  },

  hud(ctx, world) {
    const b = world.bag;
    if (!b?.cars || world.state !== 'play') return;
    const mid = world.w / 2;
    // 기술표
    paperScrap(ctx, 16, 14, 300, 14 + KEY_ROWS.length * 15, 17);
    KEY_ROWS.forEach(([k, v], i) => {
      text(ctx, k, 28, 34 + i * 15, { font: `700 10px ${HAN}`, color: INK, halo: 0, alpha: 0.75 });
      text(ctx, v, 100, 34 + i * 15, { font: `600 10px ${HAN}`, color: PENCIL, halo: 0, alpha: 0.7 });
    });
    // 점수 — 사람마다 자기 색으로, 5점 먼저
    const ids = [...b.score.keys()].filter((id) => b.names.has(id));
    ids.forEach((id, i) => {
      const x = mid - (ids.length - 1) * 55 + i * 110;
      text(ctx, `${b.names.get(id)}`, x, 40, { font: `700 12px ${HAN}`, color: colorOf(id), align: 'center', halo: 3 });
      text(ctx, String(b.score.get(id)), x, 66, { font: `800 24px ${HAN}`, color: colorOf(id), align: 'center', halo: 3 });
    });
    text(ctx, `${WIN_AT}점 먼저`, mid, 84, { font: `600 11px ${HAN}`, color: PENCIL, align: 'center', halo: 2 });
    // 시계 — 남은 시간, 40초부터는 「무너진다」
    if (b.phase === 'go') {
      const left = Math.max(0, Math.ceil(ROUND - b.clock));
      text(ctx, left > 0 ? String(left) : '막판', world.w - 60, 52, { font: `800 30px ${HAN}`, color: b.clock > SHRINK_AT ? RED : INK, align: 'center', halo: 3 });
      if (b.clock > SHRINK_AT) text(ctx, left > 0 ? '가장자리가 무너진다' : '빨리 무너진다', world.w - 60, 72, { font: `700 10px ${HAN}`, color: RED, align: 'center', halo: 2 });
    }
    if (b.phase === 'count') {
      text(ctx, String(Math.ceil(b.timer / (COUNT / 3))), mid, world.h * 0.3, { font: `800 46px ${HAN}`, color: INK, align: 'center', halo: 5 });
    }
    // 외침 — 「○○이 밀었다!」 · 「○○ 이 판을 땄다」
    b.words.forEach((w, i) => {
      const a = w.t < 1.8 ? 1 : 1 - (w.t - 1.8) / 0.4;
      text(ctx, w.word, mid, world.h * 0.22 + i * 26, { font: `800 18px ${HAN}`, color: w.color, align: 'center', halo: 4, alpha: Math.max(0, a) });
    });
  },

  /// 손님이 보낸 키 · 수. 방장만.
  message(world, from, msg) {
    if (world.mp.role !== 'host') return;
    const b = world.bag;
    if (msg.k === 'in') { b.inputs.set(from, { u: !!msg.u, d: !!msg.d, l: !!msg.l, r: !!msg.r }); return; }
    if (msg.k === 'act' && b.phase === 'go') {
      const car = b.cars.find((c) => c.id === from);
      if (car && msg.a === 'boost') boost(car);
    }
  },

  pack(world) {
    const b = world.bag;
    const r = (v) => Math.round(v * 10) / 10;
    return {
      c: b.cars.map((c) => [c.id, r(c.x), r(c.y), Math.round(c.vx), Math.round(c.vy), Math.round(c.h * 1000) / 1000,
        c.alive ? 1 : 0, Math.round(c.fallT * 100), Math.round(c.boostT * 100), 0,
        Math.round(c.boostCool * 100), 0,                    // 9·11 은 버티기 자리였다 (뺐다 — 자리만 둔다)
        Math.round((c.wob ?? 0) * 100), Math.round((c.spin ?? 0) * 100), Math.round((c.slideT ?? 0) * 100)]),
      po: (b.pops ?? []).map((p) => [p.seq, Math.round(p.x), Math.round(p.y), p.word]),
      s: [...b.score.entries()], n: [...b.names.entries()], ph: b.phase, tm: Math.round(b.timer * 100),
      ck: Math.round(b.clock * 100), rk: Math.round(b.Rk * 1000), rd: b.round,
      w: b.words.map((w) => [w.seq, w.word, w.color]), sp: (b.sparks ?? []).map((s) => [Math.round(s.x), Math.round(s.y), Math.round(s.t * 100), Math.round((s.k ?? 1) * 100)]),
      ov: b.over ? 1 : 0, wn: b.winner,
    };
  },

  unpack(world, d) {
    const b = world.bag;
    if (!d || typeof d !== 'object') return;
    if (!b.cars) Object.assign(b, freshBag());
    if (Array.isArray(d.c)) {
      const prev = b.cars ?? [];
      b.cars = d.c.filter((r) => Array.isArray(r) && r.length >= 12 && r.every(Number.isFinite)).map((r) => ({
        id: r[0], x: r[1], y: r[2], vx: r[3], vy: r[4], h: r[5], alive: !!r[6], fallT: r[7] / 100,
        boostT: r[8] / 100, boostCool: r[10] / 100, lastHit: null, think: 0,
        slideT: Number.isFinite(r[14]) ? r[14] / 100 : 0,
        wob: Number.isFinite(r[12]) ? r[12] / 100 : 0, spin: Number.isFinite(r[13]) ? r[13] / 100 : 0,
        wobT: b.cars.find((o) => o.id === r[0])?.wobT ?? 0,
      }));
      // 방금 떨어진 차가 있다 — 손님 화면도 한 번 흔든다
      if (prev.some((p) => p.alive && b.cars.find((c) => c.id === p.id && !c.alive))) world.shake = Math.max(world.shake ?? 0, 0.45);
      b.age = 0;
    }
    const pairs = (v) => (Array.isArray(v) ? v.filter((p) => Array.isArray(p) && p.length === 2) : null);
    const s = pairs(d.s); if (s) b.score = new Map(s.filter(([, v]) => Number.isFinite(v)));
    const n = pairs(d.n); if (n) b.names = new Map(n.filter(([, v]) => typeof v === 'string'));
    if (typeof d.ph === 'string') b.phase = d.ph;
    if (Number.isFinite(d.tm)) b.timer = d.tm / 100;
    if (Number.isFinite(d.ck)) b.clock = d.ck / 100;
    if (Number.isFinite(d.rk)) b.Rk = d.rk / 1000;
    if (Number.isFinite(d.rd)) b.round = d.rd;
    if (Array.isArray(d.w)) {
      const seen = new Set(b.words.map((w) => w.seq));
      for (const r of d.w) if (Array.isArray(r) && r.length === 3 && !seen.has(r[0])) b.words.push({ seq: r[0], word: String(r[1]), color: String(r[2]), t: 0 });
      if (b.words.length > 4) b.words.splice(0, b.words.length - 4);
    }
    // 「쿵」·「쾅!」 — 새 것만 받아 제 화면에서 띄우고, 「쾅!」이면 화면도 흔든다
    if (Array.isArray(d.po)) {
      const seen = new Set((b.pops ?? []).map((p) => p.seq));
      for (const r of d.po) {
        if (!Array.isArray(r) || r.length !== 4 || seen.has(r[0])) continue;
        (b.pops ??= []).push({ seq: r[0], x: r[1], y: r[2], word: String(r[3]), t: 0 });
        if (r[3] === '쾅!') world.shake = Math.max(world.shake ?? 0, 0.6);
      }
    }
    if (Array.isArray(d.sp)) b.sparks = d.sp.filter((r) => Array.isArray(r) && r.length >= 3).map(([x, y, t, k]) => ({ x, y, t: t / 100, k: Number.isFinite(k) ? k / 100 : 1 }));
    b.over = !!d.ov; b.winner = d.wn ?? null;
  },
};

/// 손님 — 키가 바뀌면 방장에게 보낸다.
function sendKeys(world) {
  if (world.mp.role !== 'guest') return;
  const i = world.input;
  const key = `${+!!i.jump}${+!!i.duck}${+!!i.left}${+!!i.right}`;
  const b = world.bag;
  if (b.sentKeys === key) return;
  b.sentKeys = key;
  world.send?.({ t: 'gm', k: 'in', u: !!i.jump, d: !!i.duck, l: !!i.left, r: !!i.right });
}

function act(world, kind) {
  const b = world.bag;
  if (world.state !== 'play' || b.phase !== 'go' || b.over) return;
  const car = b.cars.find((c) => c.id === world.mp.myId);
  if (!car || !car.alive) return;
  if (world.mp.role === 'guest') {
    world.send?.({ t: 'gm', k: 'act', a: kind });
    boost(car);                                           // 제 화면에서 바로 (방장 값이 곧 덮는다)
    return;
  }
  boost(car);
}

export { WIN_AT, MAX, BOOST, CAR_R, step, newRound, roster, boost, bump, colorOf };
