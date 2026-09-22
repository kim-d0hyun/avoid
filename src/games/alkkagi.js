// 알까기 — 바둑돌을 튕겨 상대 돌을 판 밖으로 떨어뜨린다.
//
// 벽이 없다. 판 끝이 곧 죽는 선이다 — 그래서 힘을 다 쓰는 것이 늘 좋은 수가 아니다.
//
// **물리는 판 크기와 상관없이 같다.** 자리와 속도를 「판 한 변 = 1」인 좌표로 들고 다니다가
// 그릴 때만 픽셀로 바꾼다. 창을 줄이면 물리가 달라지는 게임은 창을 줄일 수 없다.
//
// **주사위가 없다.** 그래서 손님에게 보낼 것은 「어느 돌·몇 도·얼마나 세게」 세 값뿐이고,
// 모두가 같은 셈을 해서 같은 판을 본다. 돌 열 개의 자리를 60번씩 실어 보내지 않는다.

import { INK, RED, PENCIL, PAPER_SOLID, stroke, circle, text, paperScrap } from '../draw/ink.js';
import { drawStickman } from '../draw/stickman.js';

const HAN = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const MONO = '"American Typewriter", "Courier New", monospace';
const TEAM_INK = ['#b5352f', '#2f6fb0'];
const TEAM_NAME = ['검정', '하양'];
/// 돌은 흑백이다. 하양은 종이색으로 **채워야** 한다 — 안 채우면 판의 줄이 비쳐서 돌로 안 보인다.
const STONE_FILL = ['#26221c', PAPER_SOLID];
const STONE_EDGE = ['#15120e', '#2f2a22'];
const BOARD_BACK = '#efe9da';
const BOARD_EDGE = '#cfc7b4';

// ── 물리 상수 ─────────────────────────────────────────────────────────────
//
// 실제 바둑판 455mm · 바둑돌 22mm 를 판 한 변 1 로 환산한 값들이다.

/// 돌 반지름. 22mm ÷ 455mm.
export const R = 0.024;
/// 마찰 감속 (판 한 변/초²). μ≈0.2 · g=9.8 → 1.96m/s² 를 판 크기로 옮긴 것.
///
/// **지수 감쇠가 아니라 등감속이다.** 미끄럼 마찰은 속도와 상관없이 일정하게 깎는다 —
/// 지수로 두면 돌이 영원히 기어가고, 살살 민 돌과 세게 쏜 돌의 「굴러가는 맛」이 같아진다.
export const FRICTION = 4.3;
/// 게이지를 꽉 채웠을 때의 속도. **정지 거리가 딱 판 한 변(1.0)** 이다.
///
/// 처음에 4.0(정지 거리 1.9)으로 뒀다가 내렸다. 세어 보니 **맞히면 100%가 죽었다** —
/// 37수에 상대 돌 31개, 「맞았는데 판에 남았다」가 두 번뿐이었다. 정면으로 맞으면 힘이
/// 96% 넘어가는데 그 힘이 판 두 배를 가니, 어디서 맞든 끝까지 밀려 나간 것이다.
/// 알까기의 재미(살살 밀기·자리 잡기·다음 수를 위해 남겨 두기)가 통째로 없어진다.
///
/// 1.0 이면 **맞은 돌이 판 안에 남는 수**가 생긴다. 제일 세게 쏘는 것은 여전히 위험하다 —
/// 안 맞히면 내 돌이 판을 지나 나간다.
export const VMAX = 2.9;
/// 게이지가 바닥일 때. 정지 거리 0.04 — 돌 지름 두 배쯤 살살 미는 힘.
export const VMIN = 0.6;
/// 반발계수. 유리·슬레이트 돌끼리. 1.0 이면 안 죽는 랠리가 생긴다.
export const BOUNCE = 0.92;
/// 이 아래 속도는 0으로 눌러 앉힌다. 없으면 돌이 평생 기어간다.
export const STOP = 0.03;
/// 한 스텝에 반지름의 1/3 이상 못 움직인다 — **없으면 돌이 서로를 통과한다.**
/// 최대 속도는 1/60초에 0.067을 가고 돌 지름은 0.048이다. 한 프레임에 돌 하나를 뛰어넘는다.
const STEP_MAX = R / 3;
const STEP_CAP = 48;

/// 차례마다 주는 시간. 고르기·각 재기·힘 채우기를 다 합쳐서 잰다.
///
/// 처음에 10초로 뒀다가 45초로 늘렸다 — 알까기는 어느 돌로 어디를 칠지 눈으로 재는
/// 게임이고, 게이지가 톱니라 힘 맞추는 데도 몇 바퀴가 걸린다. 10초는 급하다.
export const TURN_SECS = 45;
/// 게이지 한 바퀴. **톱니다** — 가득 찼다가 0으로 뚝 떨어지고 다시 찬다.
/// 왕복(찼다 줄어드는)으로 두면 「가득」 근처에 머무는 시간이 두 배라 아무나 최대로 쏜다.
export const GAUGE_CYCLE = 0.9;
/// 각을 한 번 눌렀을 때 / 꾹 누르고 있을 때 도는 몫.
const AIM_TAP = 3, AIM_SPIN = 90, AIM_WAIT = 0.26;
/// 컴퓨터가 생각하는 척하는 시간.
const THINK = 0.7;
/// 컴퓨터의 손 떨림 (도). 0.6 거리에서 빗나가는 각이 4.6도쯤이라 그 언저리로 둔다.
const AI_WOBBLE = 5.0;
const OVER_HOLD = 3.2;
/// 편마다 돌 몇 개로 시작하나.
export const CREW = 5;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const RAD = Math.PI / 180;

// ── 물리 ──────────────────────────────────────────────────────────────────

/// 한 스텝 굴린다. **판 밖으로 나간 돌은 그 자리에서 죽는다** (벽이 없다).
///
/// 돌아오는 값은 이 스텝에서 부딪힌 자리들 — 그림에서 고리를 튀겨 주려고 모은다.
export function step(men, h, hits = null) {
  for (const m of men) {
    if (!m.alive) continue;
    const v = Math.hypot(m.vx, m.vy);
    if (v <= 0) continue;
    // 마찰. 등감속이라 방향은 그대로 두고 크기만 깎는다.
    const left = v - FRICTION * h;
    if (left <= STOP) { m.vx = 0; m.vy = 0; }
    else { m.vx = m.vx / v * left; m.vy = m.vy / v * left; }
    m.x += m.vx * h;
    m.y += m.vy * h;
  }
  // 부딪힘. 같은 질량 탄성 충돌이라 **두 중심을 잇는 선 방향 성분만** 주고받는다 —
  // 정면으로 맞으면 쏜 돌이 서고 맞은 돌이 그대로 나간다. 알까기의 그 맛이 이것이다.
  for (let i = 0; i < men.length; i++) {
    const a = men[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < men.length; j++) {
      const b = men[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 >= (R * 2) * (R * 2) || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      // 파고든 만큼 서로 반대로 절반씩 밀어낸다. 안 하면 두 돌이 서로를 밀며 떤다.
      const over = R * 2 - d;
      a.x -= nx * over / 2; a.y -= ny * over / 2;
      b.x += nx * over / 2; b.y += ny * over / 2;
      const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (vn > 0) continue;                      // 멀어지는 중이면 건드리지 않는다
      const jimp = -(1 + BOUNCE) * vn / 2;       // 질량이 같으니 반씩
      a.vx -= jimp * nx; a.vy -= jimp * ny;
      b.vx += jimp * nx; b.vy += jimp * ny;
      if (hits) hits.push([a.x + nx * R, a.y + ny * R]);
    }
  }
  // 판 밖. **중심이 나가면 죽은 것**으로 본다 — 「조금이라도 걸치면」으로 하면 다툰다.
  for (const m of men) {
    if (!m.alive) continue;
    if (m.x < 0 || m.x > 1 || m.y < 0 || m.y > 1) {
      m.alive = false; m.vx = 0; m.vy = 0;
      if (hits) hits.push([clamp(m.x, 0, 1), clamp(m.y, 0, 1), 'out']);
    }
  }
}

/// 한 프레임. 빠를수록 여러 번 쪼개 굴린다.
export function roll(men, dt, hits = null) {
  let fast = 0;
  for (const m of men) if (m.alive) fast = Math.max(fast, Math.hypot(m.vx, m.vy));
  const steps = clamp(Math.ceil((fast * dt) / STEP_MAX), 1, STEP_CAP);
  const h = dt / steps;
  for (let s = 0; s < steps; s++) step(men, h, hits);
}

/// 다 멎었나.
export const still = (men) => men.every((m) => !m.alive || (m.vx === 0 && m.vy === 0));

/// 게이지를 힘으로. 0~1 → VMIN~VMAX.
export const speedOf = (gauge) => VMIN + (VMAX - VMIN) * clamp(gauge, 0, 1);

/// 톱니 게이지 — 잡고 있은 시간을 0~1 로.
export const gaugeAt = (held) => (held % GAUGE_CYCLE) / GAUGE_CYCLE;

/// 돌 하나를 쏜다.
export function shoot(men, i, deg, gauge) {
  const m = men[i];
  if (!m || !m.alive) return false;
  const v = speedOf(gauge);
  m.vx = Math.cos(deg * RAD) * v;
  m.vy = Math.sin(deg * RAD) * v;
  return true;
}

/// 판 끝에서 얼마나 안쪽에 놓고 시작하나.
///
/// **0.1 에 놓았더니 판이 아홉 수에 끝났다.** 돌 반지름까지 빼면 죽는 선까지 0.076 —
/// 게이지 최하(정지 거리 0.04)로 살짝만 밀어도 넘어간다. 그러면 「세게 쏠까 살살 밀까」가
/// 아니라 「닿기만 하면 끝」이 된다. 0.28 이면 어지간히 세게 맞아야 넘어가고,
/// 한 수로 안 되는 돌을 두 수에 걸쳐 끝으로 몰아가는 수가 생긴다.
const START_IN = 0.28;
/// 한 편을 반 칸 **엇갈려** 놓는다.
///
/// 마주 보게 놓았더니 **첫 수를 그냥 곧게 쏘면 공짜로 한 개를 먹었다** — 정면으로 맞으면
/// 쏜 돌이 서고 맞은 돌만 나가니 손해도 없다. 시작이 이미 풀린 게임은 시작이 없는 것과 같다.
/// 반 칸 엇갈려 놓으면 곧게 쏜 돌은 아무것도 안 맞고 판을 넘어간다 — **겨눠야 한다.**
const STAGGER = 0.08;

/// 판을 처음처럼 놓는다. 양 끝 줄에 다섯 개씩 나란히.
export function lineUp() {
  const men = [];
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < CREW; k++) {
      men.push({
        side,
        x: 0.5 + (k - (CREW - 1) / 2) * 0.16 + (side === 1 ? STAGGER : 0),
        y: side === 0 ? 1 - START_IN : START_IN,
        vx: 0, vy: 0, alive: true,
      });
    }
  }
  return men;
}

const aliveOf = (men, side) => men.filter((m) => m.alive && m.side === side).length;

// ── 컴퓨터 ────────────────────────────────────────────────────────────────

/// **실제로 쏴 보고 고른다.** 물리에 주사위가 없으니 머릿속에서 굴려 본 것이 곧 결과다.
///
/// 「상대를 떨어뜨린다」에 큰 값, 「내 돌이 나간다」에 큰 벌점. 한 수 앞만 본다.
///
/// **각도는 상대 돌을 향한 쪽만 본다.** 360도를 12도씩 훑으면 한 차례에 900번을 굴려야
/// 해서 화면이 멎는다 — 알까기에서 뜻이 있는 각은 「어느 돌을 향하는가」뿐이다.
/// 살짝 빗맞히는 수(±4도)까지 넣으면 비껴 쳐서 밀어내는 수도 나온다.
export function bestShot(men, side, spread = [-4, 0, 4]) {
  const foe = side === 0 ? 1 : 0;
  let best = null, top = -1e9;
  for (let i = 0; i < men.length; i++) {
    if (!men[i].alive || men[i].side !== side) continue;
    const from = men[i];
    const aims = [];
    for (const t of men) {
      if (!t.alive || t.side !== foe) continue;
      const base = Math.atan2(t.y - from.y, t.x - from.x) / RAD;
      for (const off of spread) aims.push((base + off + 360) % 360);
    }
    if (!aims.length) aims.push(side === 0 ? 270 : 90);
    for (const deg of aims) {
      for (const gauge of [0.3, 0.55, 0.8, 1]) {
        const copy = men.map((m) => ({ ...m }));
        shoot(copy, i, deg, gauge);
        // 다 멎을 때까지. 반발계수가 1보다 작으니 에너지는 줄기만 한다 — 2초면 다 선다.
        for (let t = 0; t < 150 && !still(copy); t++) roll(copy, 1 / 60);
        const gain = aliveOf(men, foe) - aliveOf(copy, foe);
        const loss = aliveOf(men, side) - aliveOf(copy, side);
        // 가운데로 모는 것도 조금 값으로 센다 — 떨어뜨릴 게 없을 때 판 끝에 붙어 있으면 다음에 죽는다.
        const safe = copy.filter((m) => m.alive && m.side === side)
          .reduce((sum, m) => sum + Math.min(m.x, 1 - m.x, m.y, 1 - m.y), 0);
        const score = gain * 100 - loss * 120 + safe * 4;
        if (score > top) { top = score; best = { i, deg, gauge }; }
      }
    }
  }
  return best;
}

// ── 차례 ──────────────────────────────────────────────────────────────────

const picks = (world) => (world.mp.alkSides ??= new Map());

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

/// 1:1 이면 색을 맞바꾼다 — 안 바꾸면 둘이 같은 편에 서고 빈 편은 컴퓨터가 맡는다.
function takeSide(world, id, side) {
  const want = side ? 1 : 0;
  const picked = picks(world);
  const before = id === world.mp.myId ? (world.team ?? 0) : (picked.get(id) ?? 0);
  const ids = [world.mp.myId, ...world.mp.others.keys()];
  const sideOf = (who) => (who === world.mp.myId ? (world.team ?? 0) : (picked.get(who) ?? 0));
  const foes = ids.filter((who) => who !== id && sideOf(who) === want);
  picked.set(id, want);
  if (id === world.mp.myId) world.team = want;
  if (ids.length === 2 && foes.length === 1 && before !== want) {
    const other = foes[0];
    picked.set(other, before);
    if (other === world.mp.myId) world.team = before;
  }
}

export function seatsOf(world, side) {
  const b = world.bag;
  const rows = [];
  if (!world.mp.waiting && (world.team ?? 0) === side) rows.push({ id: world.mp.myId, mine: true });
  for (const o of world.mp.others.values()) {
    if (o.dead || o.waiting) continue;
    if ((b.sides?.get(o.id) ?? 0) === side) rows.push({ id: o.id, mine: false, name: o.name });
  }
  return rows.sort((a, c) => a.id - c.id);
}

export function whoseTurn(world) {
  const b = world.bag;
  const seats = seatsOf(world, b.turn);
  if (!seats.length) return null;
  return seats[(b.seat[b.turn] ?? 0) % seats.length];
}

export const myTurn = (world) =>
  !!whoseTurn(world)?.mine && !world.bag.over && world.state === 'play';

/// 내가 쏠 수 있는 돌들 (번호 순). 고르기는 이 줄 안에서 옮긴다.
export function mine(b, side) {
  return b.men.map((m, i) => ({ m, i }))
    .filter(({ m }) => m.alive && m.side === side)
    .sort((a, c) => (a.m.x - c.m.x) || (a.m.y - c.m.y))
    .map(({ i }) => i);
}

// ── 판 ────────────────────────────────────────────────────────────────────

function freshBag() {
  return {
    men: lineUp(),
    turn: 0,                       // 검정이 먼저
    seat: [0, 0],
    phase: 'pick',                 // pick → aim → charge → roll
    pick: 0,                       // 고른 돌 (men 의 번호)
    deg: -90,                      // 조준 각 (화면 위쪽이 −90°)
    held: -1,                      // 스페이스를 잡고 있은 시간 (−1 이면 안 잡음)
    gauge: 0,
    left: TURN_SECS,
    aimHold: 0,
    shot: null,                    // 방금 쏜 것 (기록·표시)
    log: [],                       // 한 수마다 한 줄
    hits: [],                      // 부딪힌 자리 (고리)
    over: false, winner: null, hold: 0, note: null,
    say: null, sayT: 0,
    think: THINK,
    sides: new Map(),
    fresh: true, sentAt: -9,
  };
}

function say(b, text) { b.say = text; b.sayT = 0; }

/// 한 수가 끝났다 — 다음 사람에게 넘긴다.
function handOver(world, b) {
  const black = aliveOf(b.men, 0), white = aliveOf(b.men, 1);
  if (!black || !white) {
    b.over = true;
    b.winner = black === white ? null : (black ? 0 : 1);
    b.hold = OVER_HOLD;
    b.note = b.winner === null ? '둘 다 비었다 — 무승부' : `${TEAM_NAME[b.winner]} 편이 이겼다`;
    return;
  }
  b.seat[b.turn] = (b.seat[b.turn] ?? 0) + 1;
  b.turn = b.turn === 0 ? 1 : 0;
  b.phase = 'pick';
  b.pick = mine(b, b.turn)[0] ?? 0;
  b.deg = b.turn === 0 ? -90 : 90;              // 상대 쪽을 먼저 본다
  b.held = -1; b.gauge = 0; b.left = TURN_SECS; b.aimHold = 0;
  b.think = THINK;
}

/// 쏜다. **방장만 부른다.**
export function fire(world, i, deg, gauge) {
  const b = world.bag;
  if (b.over || b.phase === 'roll') return false;
  const m = b.men[i];
  if (!m || !m.alive || m.side !== b.turn) return false;
  b.hits = [];
  shoot(b.men, i, deg, gauge);
  b.shot = { i, deg, gauge, side: b.turn };
  b.log.push({ side: b.turn, deg: Math.round(deg), power: Math.round(gauge * 100) });
  if (b.log.length > 40) b.log.shift();
  b.phase = 'roll';
  b.fresh = true;
  return true;
}

export default {
  id: 'alk',
  name: '알까기',
  line: '바둑돌을 튕겨 상대 돌을 판 밖으로. 벽이 없다 — 세게 쏘면 내 돌이 먼저 나간다. 번갈아 한 번씩.',
  keys: [
    ['⌥ ← →', '쏠 돌 고르기 → 각 재기'],
    ['⌥ Space', '고른다 · 잡고 있으면 힘이 찬다 · 떼면 쏜다'],
    ['힘 게이지', '가득 찼다가 0으로 뚝 — 떼는 순간의 값으로 나간다'],
    ['한 차례', '45초. 넘기면 그 차례는 넘어간다'],
  ],
  tally: (world) => {
    const b = world.bag;
    if (!b?.men) return '';
    return `${aliveOf(b.men, 0)} : ${aliveOf(b.men, 1)}`;
  },

  noGrab: true,
  noClock: true,
  noResults: true,
  noGround: true,
  teamNames: TEAM_NAME,
  figure: () => {},
  shirt: (world, x, id) => TEAM_INK[id < 0 ? -1 - id : (world.bag?.sides?.get(id) ?? 0)],
  blocked: () => null,
  opensRoom: true,
  joinsAnytime: true,

  move(world) {
    const p = world.player;
    p.vx = 0; p.vy = 0; p.air = 0; p.knock = 0;
    p.grabbing = -1; p.heldBy = -1;
    p.groundY = world.groundY;
  },
  stand(world, slot) {
    if (world.team === undefined) world.team = slot % 2;
    world.player.x = world.w / 2;
    world.player.vx = 0;
  },
  swap(world, shell, side) {
    const want = side === undefined ? 1 - (world.team ?? 0) : (side ? 1 : 0);
    if (world.mp.on && world.mp.role === 'guest') {
      (shell?.net?.send ?? world.send)?.({ t: 'gm', s: want });
      return;
    }
    takeSide(world, world.mp.myId, want);
    if (world.mp.on) (shell?.net?.send ?? world.send)?.({ t: 'gm', s: world.team });
  },
  begin(world) { Object.assign(world.bag, freshBag()); },
  fresh: freshBag,

  /// 방향키를 **누른 순간** 한 칸 / 3도. 꾹 누르고 있는 동안은 update 가 이어서 돈다.
  ///
  /// **한 번 고른 돌은 무를 수 없다.** 되돌아가는 길을 두면 각을 재다 손이 미끄러져
  /// 처음으로 돌아가고, 그 사이 차례 시계는 계속 돈다. 차례가 끝나면 어차피 다시 고른다.
  tap(world, key) {
    const b = world.bag;
    if (b.over || !myTurn(world)) return;
    // **위아래는 아무것도 안 한다.** ⌥↓ 로 고르기로 되돌아가게 뒀더니, 각을 재다 아래를
    // 눌러 단계가 되감겼다 — 각을 내리려고 누르는 키다. 쏠 돌은 ⌥Space 로만 고른다.
    const dir = key === 'left' ? -1 : key === 'right' ? 1 : 0;
    if (!dir) return;
    if (b.phase === 'pick') {
      const row = mine(b, b.turn);
      if (!row.length) return;
      const at = Math.max(0, row.indexOf(b.pick));
      b.pick = row[(at + dir + row.length) % row.length];
    } else if (b.phase === 'aim') {
      b.deg = (b.deg + dir * AIM_TAP + 360) % 360;
      b.aimHold = 0;
    }
  },

  /// ⌥Space — 고르고, 잡고, 떼면 쏜다.
  action(world) {
    const b = world.bag;
    if (world.state !== 'play' || b.over || !myTurn(world)) return;
    if (b.phase === 'pick') {
      const row = mine(b, b.turn);
      if (!row.length) return;
      if (!row.includes(b.pick)) b.pick = row[0];
      b.phase = 'aim';
      return;
    }
    if (b.phase === 'aim') {
      b.phase = 'charge';
      b.held = 0;
      b.gauge = 0;
    }
  },

  /// ⌥Space 를 뗀 순간 — 그때의 게이지로 쏜다.
  release(world) {
    const b = world.bag;
    if (b.phase !== 'charge' || !myTurn(world)) return;
    const gauge = b.gauge;
    b.held = -1;
    if (world.mp.on && world.mp.role === 'guest') {
      // 손님은 세 값만 보낸다. 판은 방장이 굴린다 (그리고 모두가 같은 셈을 한다).
      world.send?.({ t: 'gm', k: 'shot', i: b.pick, d: Math.round(b.deg),
                     g: Math.round(gauge * 1000) });
      // **되돌아가지 않는다.** 뗀 뒤에 다시 「각 재기」로 돌려 놓으면 화살표가 한 번
      // 깜빡였다 사라진다 — 쏜 것을 무른 것처럼 보인다. 방장 꾸러미가 한두 프레임 뒤에
      // 돌을 굴리기 시작하고, 혹시 방장이 안 받아 줬으면 그 꾸러미가 단계를 되돌려 준다.
      b.phase = 'roll';
      return;
    }
    fire(world, b.pick, b.deg, gauge);
  },

  update(world, dt) {
    const b = world.bag;
    if (!b.men) Object.assign(b, freshBag());
    if (b.say) { b.sayT += dt; if (b.sayT > 1.3) b.say = null; }
    if (world.state !== 'play') return;
    if (world.mp.role === 'host') {
      b.sides = rosterSides(world);
      const mineSide = b.sides.get(world.mp.myId);
      if (mineSide !== undefined && mineSide !== world.team) world.team = mineSide;
    }

    // 돌이 굴러가는 동안. **모두가 같은 셈을 한다** — 손님도 자기 화면에서 굴린다.
    if (b.phase === 'roll') {
      roll(b.men, dt, b.hits);
      if (b.hits.length > 40) b.hits.splice(0, b.hits.length - 40);
      if (still(b.men) && world.mp.role !== 'guest') handOver(world, b);
      return;
    }

    if (b.over) {
      if (world.mp.role === 'guest') return;
      b.hold -= dt;
      if (b.hold <= 0 && !b.ended) {
        b.ended = true;
        world.onGameOver?.({
          name: b.winner === null ? null : `${TEAM_NAME[b.winner]} 편`,
          side: b.winner ?? 0, rows: [],
        });
      }
      return;
    }

    // 조준을 꾹 누르고 있으면 이어서 돈다.
    if (myTurn(world) && b.phase === 'aim') {
      const dir = (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0);
      if (dir) {
        b.aimHold += dt;
        if (b.aimHold > AIM_WAIT) b.deg = (b.deg + dir * AIM_SPIN * dt + 360) % 360;
      } else b.aimHold = 0;
    }

    // 톱니 게이지. 가득 찼다가 0으로 뚝 떨어지고 다시 찬다.
    if (b.phase === 'charge' && b.held >= 0) {
      b.held += dt;
      b.gauge = gaugeAt(b.held);
    }

    // **내가 겨누는 것을 남들에게 알려 준다.** 차례제 게임에서 남의 차례에 화면이 멎어
    // 있으면 「끊긴 건가」 싶다. 초당 열 번이면 충분하다 — 60번 보낼 값이 아니다.
    if (world.mp.on && world.mp.role === 'guest' && myTurn(world) && b.phase !== 'roll') {
      b.told = (b.told ?? 0) + dt;
      if (b.told >= 0.1) {
        b.told = 0;
        world.send?.({ t: 'gm', k: 'aim', p: b.pick, d: Math.round(b.deg),
                       g: Math.round(b.gauge * 1000), f: b.phase });
      }
    }

    if (world.mp.role === 'guest') return;

    // 차례 시계. 고르기·각 재기·힘 채우기를 다 합쳐서 잰다.
    const human = !!whoseTurn(world);
    if (human) {
      b.left -= dt;
      if (b.left <= 0) {
        say(b, `${TURN_SECS}초 넘었다 — 한 번 쉰다`);
        b.log.push({ side: b.turn, skip: true });
        handOver(world, b);
        return;
      }
    } else {
      // 사람이 없는 편은 컴퓨터가 쏜다. 실제로 굴려 보고 고른다.
      b.think -= dt;
      if (b.think <= 0) {
        const pickShot = bestShot(b.men, b.turn);
        if (pickShot) {
          // **손이 떨린다.** 굴려 보고 고르니 컴퓨터는 거의 다 맞힌다 — 그대로 두면
          // 여덟 수에 끝나고 사람은 한 개도 못 남긴다.
          //
          // 흔들림을 2도로 뒀더니 아무것도 안 달라졌다. **0.6 거리에서 돌(지름 0.048)을
          // 빗나가려면 4.6도 이상 틀려야 한다** — 2도는 맞히는 각이다. 사람은 한 번에 3도씩
          // 눈으로 재니 그만큼 틀린다. 컴퓨터도 그만큼 틀려야 공평하다.
          const wob = (Math.random() + Math.random() + Math.random() - 1.5) * AI_WOBBLE;
          const power = clamp(pickShot.gauge * (0.95 + Math.random() * 0.1), 0, 1);
          fire(world, pickShot.i, (pickShot.deg + wob + 360) % 360, power);
        } else handOver(world, b);
      }
    }
  },

  draw(ctx, world, time, boil, upright) {
    const b = world.bag;
    if (!b?.men) return;
    const L = layout(world);
    drawBoard(ctx, L);
    drawStones(ctx, L, b, time);
    drawAim(ctx, L, world, b, time);
    drawHits(ctx, L, b);
    drawCrew(ctx, world, b, time, boil);
  },

  hud(ctx, world, time) {
    const b = world.bag;
    if (!b?.men) return;
    drawKeys(ctx);
    if (world.state !== 'play') return;
    const who = whoseTurn(world);
    const line = b.over ? (b.note ?? '')
      : who ? `${TEAM_NAME[b.turn]} — ${who.mine ? '내 차례' : (who.name ?? '상대')}`
            : `${TEAM_NAME[b.turn]} — 컴퓨터`;
    ctx.font = `800 17px ${HAN}`;
    const wide = Math.max(220, ctx.measureText(line).width + 120);
    paperScrap(ctx, world.w / 2 - wide / 2, 14, wide, 54, 9);
    text(ctx, line, world.w / 2, 37,
         { font: `800 17px ${HAN}`, color: b.over ? RED : INK, align: 'center', halo: 0 });
    if (!b.over) {
      circle(ctx, world.w / 2 - wide / 2 + 20, 32, 9,
             { width: 2, color: STONE_EDGE[b.turn], fill: STONE_FILL[b.turn], seed: 3, amp: 0.3 });
    }
    const score = `${aliveOf(b.men, 0)} : ${aliveOf(b.men, 1)}`;
    const left = b.over || b.phase === 'roll' ? '' : ` · 남은 ${Math.ceil(Math.max(0, b.left))}초`;
    text(ctx, score + left, world.w / 2, 57,
         { font: `600 12px ${MONO}`, color: PENCIL, align: 'center', halo: 0 });
    if (b.say) {
      text(ctx, b.say, world.w / 2, world.h - 26,
           { font: `800 15px ${HAN}`, color: RED, align: 'center', halo: 4,
             alpha: clamp(1 - (b.sayT - 1) / 0.3, 0, 1) });
    }
  },

  message(world, from, msg) {
    if (world.mp.role !== 'host') return;
    const b = world.bag;
    if (typeof msg.s === 'number') { takeSide(world, from, msg.s ? 1 : 0); return; }
    if (world.state !== 'play' || b.over) return;
    // 손님이 겨누는 중이라고 알려 온 것. **차례인 사람 것만** 받아서 모두에게 전한다.
    if (msg.k === 'aim') {
      const turnNow = whoseTurn(world);
      if (!turnNow || turnNow.id !== from || b.phase === 'roll') return;
      b.pick = clamp(msg.p | 0, 0, b.men.length - 1);
      b.deg = ((+msg.d || 0) % 360 + 360) % 360;
      b.gauge = clamp((+msg.g || 0) / 1000, 0, 1);
      if (msg.f === 'pick' || msg.f === 'aim' || msg.f === 'charge') b.phase = msg.f;
      return;
    }
    if (msg.k !== 'shot') return;
    // **차례인 사람이 보낸 것만 받는다.**
    const who = whoseTurn(world);
    const side = b.sides?.get(from) ?? 0;
    if (!who || who.id !== from || side !== b.turn || b.phase === 'roll') return;
    fire(world, clamp(msg.i | 0, 0, b.men.length - 1),
         ((+msg.d || 0) % 360 + 360) % 360, clamp((+msg.g || 0) / 1000, 0, 1));
  },

  pack(world) {
    const b = world.bag;
    const fresh = b.fresh;
    b.fresh = false;
    // **돌이 굴러가는 동안에는 매 프레임 자리를 보낸다.**
    //
    // 처음엔 「쏜 순간 한 번 + 0.6초마다」만 보냈다. 물리에 주사위가 없으니 손님도 같은
    // 셈을 하면 될 줄 알았는데, **그 한 꾸러미가 늦거나 빠지면 손님은 속도를 못 받는다** —
    // 아무것도 안 움직이다가 0.6초 뒤 순간이동한다. 재 보니 꾸러미 다섯에 하나만 빠져도
    // **손님 화면은 열여덟 프레임 내내 멈춰 있었다.** 「결과만 보인다」가 이것이다.
    //
    // 굴러가는 건 한 수에 1초쯤이고 한 줄이 돌 열 개 × 숫자 여섯이다. 그 1초 동안
    // 초당 12킬로바이트를 더 쓰고 **빠진 꾸러미를 다음 꾸러미가 덮어 준다.**
    const rolling = b.phase === 'roll';
    const again = !fresh && !rolling && world.elapsed - (b.sentAt ?? -9) >= 0.6;
    if (fresh || again) b.sentAt = world.elapsed;
    return {
      tm: [...rosterSides(world).entries()],
      t: b.turn,
      st: [b.seat[0] ?? 0, b.seat[1] ?? 0],
      ph: b.phase,
      o: b.over ? 1 : 0,
      wn: b.winner === 0 || b.winner === 1 ? b.winner : -1,
      nt: b.note ?? null,
      lf: Math.round(Math.max(0, b.left) * 10),
      // 지금 겨누는 자리 — 숫자 셋이면 남의 차례에도 화면이 산다.
      pk: b.pick, dg: Math.round(b.deg), gg: Math.round(b.gauge * 1000),
      // **자리와 속도가 곧 「쏜 것」이다.** 쏜 순간의 속도가 실려 가니 손님은 그 값에서
      // 이어 굴리면 된다 — 「어느 돌·몇 도·얼마나 세게」를 따로 보낼 까닭이 없다.
      m: fresh || again || rolling
        ? b.men.map((m) => [Math.round(m.x * 1e4), Math.round(m.y * 1e4),
                            Math.round(m.vx * 1e3), Math.round(m.vy * 1e3),
                            m.side, m.alive ? 1 : 0])
        : undefined,
    };
  },

  unpack(world, data) {
    const b = world.bag;
    if (!data || typeof data !== 'object') return;
    if (!b.men) Object.assign(b, freshBag());
    if (Array.isArray(data.tm)) {
      b.sides = new Map(data.tm.filter((r) => Array.isArray(r) && r.length === 2));
      const mineSide = b.sides.get(world.mp.myId);
      if (mineSide !== undefined && mineSide !== world.team) world.team = mineSide;
    }
    if (Array.isArray(data.m)) {
      const rows = data.m.filter((r) => Array.isArray(r) && r.length >= 6 && r.every(Number.isFinite));
      if (rows.length) {
        b.men = rows.map((r) => ({ x: r[0] / 1e4, y: r[1] / 1e4, vx: r[2] / 1e3, vy: r[3] / 1e3,
                                   side: r[4] ? 1 : 0, alive: !!r[5] }));
      }
    }
    if (Number.isFinite(data.t)) b.turn = data.t ? 1 : 0;
    if (Array.isArray(data.st) && data.st.every(Number.isFinite)) b.seat = [data.st[0], data.st[1]];
    // **내 차례면 내 것이 맞다.** 방장 값으로 덮으면 내가 고르는 중에 커서가 튄다 —
    // 내가 보낸 값이 한 왕복 돌아 오는 것이라 늘 한 박자 늦다.
    const boss = !myTurn(world);
    if (typeof data.ph === 'string' && (boss || b.phase === 'pick' || b.phase === 'roll')) {
      b.phase = data.ph;
    }
    if (boss) {
      if (Number.isFinite(data.pk)) b.pick = clamp(data.pk | 0, 0, b.men.length - 1);
      if (Number.isFinite(data.dg)) b.deg = ((data.dg % 360) + 360) % 360;
      if (Number.isFinite(data.gg)) b.gauge = clamp(data.gg / 1000, 0, 1);
    }
    if (Number.isFinite(data.lf)) b.left = data.lf / 10;
    b.over = !!data.o;
    b.winner = data.wn === 0 || data.wn === 1 ? data.wn : null;
    if (typeof data.nt === 'string' || data.nt === null) b.note = data.nt;
  },
};

// ── 그리기 ────────────────────────────────────────────────────────────────

/// 판이 화면 어디에 얼마나 크게 놓이나. 물리는 판 한 변을 1 로 보므로 여기서만 픽셀이 된다.
export function layout(world) {
  const w = world.w ?? 1200, h = world.h ?? 800;
  const size = Math.max(180, Math.min(w - 320, h - 190));
  return { x: (w - size) / 2, y: 104 + (h - 190 - size) / 2, size };
}
const at = (L, x, y) => [L.x + x * L.size, L.y + y * L.size];

/// 별점 — 19줄 바둑판의 화점 자리(0부터 3·9·15번째 줄).
const STARS = [3 / 18, 9 / 18, 15 / 18];

function drawBoard(ctx, L) {
  const pad = L.size * 0.03;
  const back = [[L.x - pad, L.y - pad], [L.x + L.size + pad, L.y - pad],
                [L.x + L.size + pad, L.y + L.size + pad], [L.x - pad, L.y + L.size + pad]];
  stroke(ctx, [...back, back[0]], { width: 1, color: BOARD_EDGE, fill: BOARD_BACK,
                                    alpha: 0.32, seed: 2, amp: 1.1, sharp: true, halo: false });
  for (let i = 0; i < 19; i++) {
    const u = i / 18;
    const [ax, ay] = at(L, 0, u), [bx] = at(L, 1, u);
    stroke(ctx, [[ax, ay], [bx, ay]],
           { width: 0.8, color: PENCIL, seed: 10 + i, amp: 0.2, alpha: 0.4, haloWidth: 2 });
    const [cx, cy] = at(L, u, 0), [, dy] = at(L, u, 1);
    stroke(ctx, [[cx, cy], [cx, dy]],
           { width: 0.8, color: PENCIL, seed: 40 + i, amp: 0.2, alpha: 0.4, haloWidth: 2 });
  }
  // **판 끝은 죽는 선이다.** 다른 줄보다 진하게 — 여기를 넘으면 돌이 없어진다.
  const edge = [[L.x, L.y], [L.x + L.size, L.y], [L.x + L.size, L.y + L.size], [L.x, L.y + L.size]];
  stroke(ctx, [...edge, edge[0]],
         { width: 1.6, color: PENCIL, seed: 9, amp: 0.25, alpha: 0.72, sharp: true, haloWidth: 3 });
  for (const sy of STARS) for (const sx of STARS) {
    const [px, py] = at(L, sx, sy);
    circle(ctx, px, py, 2.2, { width: 1.1, color: PENCIL, fill: PENCIL, alpha: 0.45,
                               seed: 70 + sx * 30 + sy * 7, amp: 0.2 });
  }
}

function drawStones(ctx, L, b, time) {
  const r = R * L.size;
  b.men.forEach((m, i) => {
    if (!m.alive) return;
    const [px, py] = at(L, m.x, m.y);
    circle(ctx, px, py, r, { width: 2, color: STONE_EDGE[m.side], fill: STONE_FILL[m.side],
                             seed: 100 + i, amp: 0.4, halo: true });
    if (m.side === 1) {
      circle(ctx, px - r * 0.3, py - r * 0.32, r * 0.22,
             { width: 1.1, color: PENCIL, halo: false, alpha: 0.5, seed: 400 + i, amp: 0.2 });
    }
    // 굴러가는 동안 꼬리 — 어느 돌이 움직이는지 눈이 따라가게.
    const v = Math.hypot(m.vx, m.vy);
    if (v > 0.2) {
      const k = Math.min(1, v / VMAX);
      stroke(ctx, [[px - m.vx / v * r * (1 + k * 2.4), py - m.vy / v * r * (1 + k * 2.4)], [px, py]],
             { width: 1.6, color: PENCIL, halo: false, alpha: 0.35 * k, seed: 200 + i, amp: 0.3 });
    }
  });
}

/// 고른 돌과 화살표.
///
/// **남이 겨누는 것도 보여 준다.** 알까기에는 감출 것이 없다 — 돌이 다 보이는 판이고,
/// 실제로도 상대가 자세를 잡는 것을 보면서 기다린다. 감춰 두면 상대 차례에는 화면이
/// 멎은 것처럼 보인다(차례제 게임에서 그게 제일 답답하다). 내 것보다 옅게 그린다.
function drawAim(ctx, L, world, b, time) {
  if (b.over || world.state !== 'play') return;
  // **굴러가는 동안은 안 그린다.** 쏜 뒤에도 화살표가 남아 있으면 아직 쏠 수 있는 줄 안다.
  if (b.phase === 'roll') return;
  const who = whoseTurn(world);
  const mineNow = !!who?.mine;
  // 사람이 없는 편(컴퓨터)은 겨누는 그림이 없다 — 굴려 보고 바로 쏜다.
  if (!who) return;
  const m = b.men[b.pick];
  if (!m || !m.alive) return;
  const r = R * L.size;
  const [px, py] = at(L, m.x, m.y);
  const tint = TEAM_INK[b.turn];
  const dim = mineNow ? 1 : 0.55;
  // **고른 돌을 또렷하게.** 하양 돌 위에 옅은 테 하나만 두르면 판에 묻혀서 안 보인다 —
  // 잉크색 꺾쇠를 네 귀퉁이에 찍는다. 종이 위에서 제일 잘 읽히는 표시다.
  const b0 = r * 1.5, tick = r * 0.62;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    stroke(ctx, [[px + sx * b0, py + sy * b0 - sy * tick], [px + sx * b0, py + sy * b0],
                 [px + sx * b0 - sx * tick, py + sy * b0]],
           { width: 2.4, color: INK, seed: 20 + sx * 3 + sy, amp: 0.4, alpha: 0.85 * dim, haloWidth: 3 });
  }
  // 그 위에 편 색 고리 하나 — 누구 차례인지 색으로도 읽히게.
  const puls = 0.55 + 0.45 * Math.sin(time * 5);
  circle(ctx, px, py, r * 1.28, { width: 2.2, color: tint, alpha: puls * dim, seed: 6, amp: 0.4 });
  // 남이 겨누는 중이면 그렇다고 적어 준다.
  if (!mineNow) {
    text(ctx, `${who.name ?? '상대'} 겨누는 중`, px, py - r * 2.4,
         { font: `700 11px ${HAN}`, color: tint, align: 'center', halo: 3, alpha: 0.8 });
  }
  if (b.phase === 'pick') return;
  // 화살표 — 돌 중심에서 뻗는다. 힘을 채우는 동안은 그 힘만큼 길어진다.
  const reach = r * (3 + 7 * (b.phase === 'charge' ? b.gauge : 0.35));
  const dx = Math.cos(b.deg * RAD), dy = Math.sin(b.deg * RAD);
  const tipX = px + dx * reach, tipY = py + dy * reach;
  stroke(ctx, [[px + dx * r * 1.2, py + dy * r * 1.2], [tipX, tipY]],
         { width: 2.4, color: tint, seed: 7, amp: 0.4, haloWidth: 3, alpha: 0.9 * dim });
  // 화살촉 — 끝에서 뒤로 두 날개. 방향을 기준으로 ±26도 뒤로 접는다.
  const wing = r * 1.5;
  const barb = (off) => [tipX - Math.cos((b.deg + off) * RAD) * wing,
                         tipY - Math.sin((b.deg + off) * RAD) * wing];
  stroke(ctx, [barb(-26), [tipX, tipY], barb(26)],
         { width: 2.2, color: tint, seed: 8, amp: 0.4, haloWidth: 3, alpha: 0.9 * dim });
  if (b.phase !== 'charge') return;
  // 힘 막대. **화살표 반대쪽에 둔다** — 같은 쪽에 두면 화살표와 겹쳐서 둘 다 안 읽힌다.
  const bw = r * 5, bh = 6;
  const bx = px - bw / 2, by = py + (dy < 0 ? r * 2.2 : -r * 2.2 - bh);
  const box = [[bx, by], [bx + bw, by], [bx + bw, by + bh], [bx, by + bh]];
  stroke(ctx, [...box, box[0]], { width: 1.4, color: PENCIL, seed: 11, amp: 0.3,
                                  alpha: 0.6 * dim, sharp: true, haloWidth: 2 });
  const full = b.gauge > 0.92;
  stroke(ctx, [[bx + 1, by + bh / 2], [bx + 1 + (bw - 2) * b.gauge, by + bh / 2]],
         { width: bh - 2, color: full ? RED : tint, seed: 12, amp: 0.2, sharp: true,
           halo: false, alpha: dim });
}

/// 부딪힌 자리와 떨어진 자리. 무엇이 무엇을 쳤는지 눈으로 따라가게.
function drawHits(ctx, L, b) {
  b.hits.forEach((h, i) => {
    const [px, py] = at(L, h[0], h[1]);
    const out = h[2] === 'out';
    circle(ctx, px, py, out ? 14 : 7, { width: out ? 2.4 : 1.6, color: out ? RED : PENCIL,
                                        halo: false, alpha: out ? 0.5 : 0.28, seed: 300 + i, amp: 0.6 });
  });
}

function drawCrew(ctx, world, b, time, boil) {
  const L = layout(world);
  const who = whoseTurn(world);
  [0, 1].forEach((side) => {
    const seats = seatsOf(world, side);
    const baseX = side === 0 ? L.x - 74 : L.x + L.size + 74;
    seats.forEach((s, i) => {
      const y = L.y + 76 + i * 92;
      const p = {
        x: baseX, groundY: y, air: 0, vx: 0, vy: 0, facing: side === 0 ? 1 : -1,
        walk: 0, crouch: 0, dead: false, deadFor: 0, danger: false,
        grabbing: -1, heldBy: -1, grabAim: 0, slide: 0, swing: 0, toss: 0, block: 0,
      };
      drawStickman(ctx, p, time, boil, {
        color: TEAM_INK[side], name: s.mine ? '나' : (s.name ?? null), mine: s.mine,
      });
      circle(ctx, baseX, y - 96, 8, { width: 1.8, color: STONE_EDGE[side],
                                      fill: STONE_FILL[side], seed: 5 + i, amp: 0.3 });
      if (who && who.id === s.id && !b.over) {
        text(ctx, side === 0 ? '▶' : '◀', baseX + (side === 0 ? 34 : -34), y - 52,
             { font: `800 16px ${HAN}`, color: TEAM_INK[side], align: 'center', halo: 3,
               alpha: 0.55 + 0.45 * Math.sin(time * 5) });
      }
    });
  });
}

const KEY_ROWS = [
  ['⌥ ← →', '돌 고르기 → 각 재기'],
  ['⌥ Space', '고른다 · 잡으면 힘이 찬다 · 떼면 쏜다'],
  ['한 차례', '45초'],
];
function drawKeys(ctx) {
  const x = 16, y = 14, lh = 15;
  paperScrap(ctx, x, y, 244, 14 + KEY_ROWS.length * lh, 17);
  KEY_ROWS.forEach(([key, name], i) => {
    const ly = y + 20 + i * lh;
    text(ctx, key, x + 12, ly, { font: `700 10px ${HAN}`, color: INK, halo: 0, alpha: 0.75 });
    text(ctx, name, x + 92, ly, { font: `600 10px ${HAN}`, color: PENCIL, halo: 0, alpha: 0.7 });
  });
}

export { TEAM_NAME, TEAM_INK, aliveOf };
