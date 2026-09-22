// 윷놀이 — 윷 네 짝을 던져 말 넷을 먼저 내보낸다.
//
// **던지는 것이 절반이다.** 스페이스를 잡고 있으면 힘이 차고, 떼는 순간의 힘으로 던진다.
// 약하면 판에 못 닿고 세면 판을 넘어간다 — 둘 다 **낙**이라 그 차례를 잃는다.
// 윷 네 짝이 공중에서 굴러 떨어지고, 엎어진 짝을 세어 도·개·걸·윷·모가 나온다.
//
// **말은 판 좌표(0~1 네모)로 들고 다닌다.** 창을 줄이면 물리가 달라지는 게임은 창을
// 줄일 수 없다 — 알까기에서 배운 것을 그대로 쓴다.

import { INK, RED, PENCIL, PAPER_SOLID, stroke, circle, text, paperScrap, fillStroke } from '../draw/ink.js';
import { drawStickman } from '../draw/stickman.js';

const HAN = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const MONO = '"American Typewriter", "Courier New", monospace';
const TEAM_INK = ['#b5352f', '#2f6fb0'];
const TEAM_NAME = ['빨강', '파랑'];
/// 말 넷이 저마다 다르게 생겼다. 색만 다르면 「내 말이 어느 것이었지」가 된다.
const FACES = ['토끼', '곰', '고양이', '병아리'];

// ── 판 ────────────────────────────────────────────────────────────────────
//
// 바깥 한 바퀴 스무 밭 + 지름길 둘. 밭마다 자리(0~1)와 다음 밭을 들고 있다.
//
//   20(출발) 19 18 17 16 15 ← 위
//   1                    14
//   ...   지름길과 방     ...
//   5                    10
//   6  7  8  9  10 ← 아래
//
// **지름길은 모(꼭짓점)에 정확히 섰을 때만 탄다.** 지나가는 것으로는 안 된다 —
// 그게 윷놀이의 수싸움 전부다.

/// 밭 번호: 1~20 바깥, 21·22 첫 지름길, 23·24 방에서 세모 쪽, 25 방(중앙),
/// 26·27 두 번째 지름길, 28·29 방에서 출발 쪽. 0 은 아직 안 나온 말, 99 는 다 난 말.
export const HOME = 0, OUT = 99, CENTER = 25;
const RING = 20;

/// 다음 밭. 지름길에 올라탄 말은 그 길을 따라간다.
export function nextOf(at, viaShort = false) {
  if (at === OUT) return OUT;
  if (at >= 1 && at <= RING) {
    if (at === RING) return OUT;                 // 출발을 지나면 난다
    if (viaShort && at === 5) return 21;         // 첫 모 → 지름길
    if (viaShort && at === 10) return 26;        // 두 번째 모 → 지름길
    return at + 1;
  }
  if (at === 21) return 22;
  if (at === 22) return CENTER;
  if (at === CENTER) return 28;                  // **방에서는 출발 쪽으로 나간다** (제일 짧은 길)
  if (at === 23) return 24;
  if (at === 24) return 15;
  if (at === 26) return 27;
  if (at === 27) return CENTER;
  if (at === 28) return 29;
  if (at === 29) return OUT;
  return OUT;
}

/// 말 하나가 n 칸 간 뒤 서는 밭. 출발 전(0)이면 1번 밭부터 센다.
///
/// **지름길은 「모에 서 있다가 떠날 때」만 탄다.** 지나가는 것으로는 안 된다 —
/// 처음에 한 칸씩 걸어가며 그때그때 모인지를 봤더니, **4번에서 셋을 가면 7번이 아니라
/// 지름길로 새 버렸다**(5번을 밟고 지나가는 것까지 「모에 섰다」로 봤다).
/// 그래서 **첫 걸음에서만** 꺾는지를 본다 — 앞 차례에 그 모에 정확히 섰다는 뜻이다.
export function walk(at, n) {
  let cur = at;
  for (let step = 0; step < n; step++) {
    if (cur === HOME) { cur = 1; continue; }     // 첫 걸음은 1번 밭
    const viaShort = step === 0 && (cur === 5 || cur === 10 || cur === CENTER);
    cur = nextOf(cur, viaShort);
    if (cur === OUT) return OUT;
    if (step === n - 1) return cur;
  }
  return cur;
}

/// 밭이 판 어디에 있나 (0~1 네모). 바깥은 네모로 돌고 지름길은 대각선이다.
export function spotOf(at) {
  if (at === HOME) return [0.5, 1.06];
  if (at === OUT) return [0.5, -0.06];
  if (at >= 1 && at <= RING) {
    // 20번(출발)이 오른쪽 아래. 반시계로 돈다 — 실제 윷판과 같은 방향이다.
    const side = Math.floor((at - 1) / 5), k = ((at - 1) % 5) / 5;
    if (side === 0) return [1, 1 - k];           // 오른쪽 위로
    if (side === 1) return [1 - k, 0];           // 위쪽 왼쪽으로
    if (side === 2) return [0, k];               // 왼쪽 아래로
    return [k, 1];                               // 아래쪽 오른쪽으로
  }
  if (at === CENTER) return [0.5, 0.5];
  if (at === 21) return [1 - 1 / 6, 1 / 6];      // 오른쪽 위 모(5) → 방
  if (at === 22) return [1 - 2 / 6, 2 / 6];
  if (at === 23) return [1 - 4 / 6, 4 / 6];      // 방 → 왼쪽 아래 모(15)
  if (at === 24) return [1 - 5 / 6, 5 / 6];
  if (at === 26) return [1 / 6, 1 / 6];          // 왼쪽 위 모(10) → 방
  if (at === 27) return [2 / 6, 2 / 6];
  if (at === 28) return [4 / 6, 4 / 6];          // 방 → 오른쪽 아래(출발)
  if (at === 29) return [5 / 6, 5 / 6];
  return [0.5, 0.5];
}

/// 모(꼭짓점)인가 — 지름길을 탈 수 있는 밭.
export const isCorner = (at) => at === 5 || at === 10 || at === 15 || at === RING;

// ── 윷 던지기 ─────────────────────────────────────────────────────────────

/// 판(멍석)이 놓인 자리. 여기 안에 떨어져야 한다.
export const MAT_NEAR = 0.3, MAT_FAR = 0.92;
/// 게이지 0~1 이 던지는 거리로. 약하면 못 닿고 세면 넘어간다 — **양쪽 다 낙이다.**
export const throwTo = (gauge) => 0.12 + 1.15 * gauge;
/// 낙인가.
export const isNak = (dist) => dist < MAT_NEAR || dist > MAT_FAR;
/// 게이지가 살아 있는 구간 (여기 안이면 판에 떨어진다).
export const SAFE_LOW = (MAT_NEAR - 0.12) / 1.15, SAFE_HIGH = (MAT_FAR - 0.12) / 1.15;

/// 게이지 한 바퀴. 톱니다 — 가득 찼다가 0으로 뚝 떨어지고 다시 찬다.
export const GAUGE_CYCLE = 0.85;
export const gaugeAt = (held) => (held % GAUGE_CYCLE) / GAUGE_CYCLE;

/// 윷 한 짝이 **젖혀졌나(평평한 배가 위)**.
///
/// **등이 둥글어서 배를 바닥에 깔고 멎는 쪽이 더 잦다.** 둥근 등으로는 오래 못 서 있고
/// 평평한 배로는 안정하게 눕는다 — 그러니까 「엎어짐(등이 위)」이 앉을 자리가 더 넓다.
/// 그 넓이를 FLAT_WIN(0.4)으로 둔다. 처음엔 반 바퀴마다 뒤집게만 했더니 동전 던지기가
/// 되어 **도 25% · 개 37%** 가 나왔다 — 실제 윷은 도와 모가 훨씬 잦다.
const FLAT_WIN = 0.4;
export function flatUp(turns) {
  const frac = turns - Math.floor(turns);
  return frac < FLAT_WIN;
}

/// 던진 결과를 이름으로. 젖혀진 짝 수 → 도·개·걸·윷, 하나도 없으면 모.
export const NAMES = ['모', '도', '개', '걸', '윷'];
export const STEPS = [5, 1, 2, 3, 4];
/// 한 번 더 던지는가 (윷·모).
export const again = (flats) => flats === 4 || flats === 0;

/// 윷 네 짝을 던진다. 게이지와 씨앗만으로 결과가 정해진다 (손님도 같은 셈을 한다).
export function toss(gauge, seed) {
  const dist = throwTo(gauge);
  const sticks = [];
  let rnd = (seed * 1103515245 + 12345) >>> 0;
  const next = () => ((rnd = (rnd * 1103515245 + 12345) >>> 0) >>> 8) / 16777216;
  for (let i = 0; i < 4; i++) {
    // 짝마다 조금씩 다르게 던져진다 — 손에서 한꺼번에 놓아도 같이 구르지 않는다.
    const spin = 2.4 + next() * 5.2;             // 몇 바퀴 구르나
    const start = next();                        // 손에서 놓일 때 이미 조금 돌아 있다
    const turns = spin * (0.8 + gauge * 0.5) + start;
    sticks.push({
      turns,
      flat: flatUp(turns),
      lane: (i - 1.5) * 0.062 + (next() - 0.5) * 0.04,
      dist: dist + (next() - 0.5) * 0.09,
      spin,
    });
  }
  const nak = sticks.some((s) => isNak(s.dist));
  const flats = sticks.filter((s) => s.flat).length;
  return { sticks, nak, flats, steps: nak ? 0 : STEPS[flats], name: nak ? '낙' : NAMES[flats] };
}

// ── 말 ────────────────────────────────────────────────────────────────────

const CREW = 4;

/// **업힌 말은 업은 말을 가리킨다** (`on`). 업은 말이 몇 마리를 지고 있나(`pile`)로
/// 세었더니, 업은 말이 날 때 「집에 있는 말」을 아무거나 골라 내보내서 **한 번도 안 나온
/// 말이 대신 나가고 업혔던 말이 유령으로 남았다** — 판에도 없고 나지도 않은 말이 되어
/// 그 편은 영영 못 움직인다(스무 판에 네 판이 그렇게 멎었다). 누가 업혔는지를 적어 두면
/// 잡힐 때도 날 때도 **그 말들만** 정확히 따라간다.
function freshMen() {
  const men = [];
  for (let side = 0; side < 2; side++) {
    for (let k = 0; k < CREW; k++) men.push({ side, face: k, at: HOME, done: false, on: -1 });
  }
  return men;
}

/// 이 말이 업고 있는 말들 (자기는 안 센다).
export const riders = (men, i) => men.map((m, j) => (m.on === i ? j : -1)).filter((j) => j >= 0);
/// 몇 마리가 함께 가나 (자기까지).
export const pileOf = (men, i) => 1 + riders(men, i).length;

/// 이 말이 n 칸 가면 어떻게 되나 — 서는 밭, 잡는 말, 업는 말.
///
/// 업혀 가는 말은 세지 않는다 — 업은 말만 보면 된다.
export function preview(men, i, n) {
  const me = men[i];
  if (!me || me.done || me.on !== -1) return null;
  const to = walk(me.at, n);
  const eat = [], ride = [];
  if (to !== OUT) {
    men.forEach((m, j) => {
      if (j === i || m.done || m.on !== -1 || m.at !== to) return;
      if (m.side === me.side) ride.push(j); else eat.push(j);
    });
  }
  return { to, eat, ride };
}

/// 말을 옮긴다. 잡으면 잡은 말을 집으로 보내고 **한 번 더** 던진다.
export function move(men, i, n) {
  const plan = preview(men, i, n);
  if (!plan) return null;
  const me = men[i];
  const { to, eat, ride } = plan;
  // 잡힌 말은 **업고 있던 말까지 통째로** 집으로 간다.
  for (const j of eat) {
    for (const k of riders(men, j)) { men[k].on = -1; men[k].at = HOME; }
    men[j].at = HOME; men[j].on = -1;
  }
  if (to === OUT) {
    // 업고 있던 **그 말들이** 같이 난다 (아무 말이나가 아니다).
    for (const k of riders(men, i)) { men[k].done = true; men[k].at = OUT; men[k].on = -1; }
    me.done = true; me.at = OUT;
  } else {
    me.at = to;
    for (const j of ride) {
      // 업는 말이 업고 있던 말들도 나에게 옮겨 붙는다.
      for (const k of riders(men, j)) men[k].on = i;
      men[j].on = i;
      men[j].at = to;
    }
  }
  return { ...plan, ate: eat.length > 0 };
}

export const homeLeft = (men, side) =>
  men.filter((m) => m.side === side && !m.done && m.on === -1 && m.at === HOME).length;
export const doneOf = (men, side) => men.filter((m) => m.side === side && m.done).length;
/// 지금 움직일 수 있는 말들 (아직 안 난 말 · 업혀 있지 않은 말).
export const movable = (men, side) =>
  men.map((m, i) => ({ m, i })).filter(({ m }) => m.side === side && !m.done && m.on === -1).map(({ i }) => i);

// ── 차례 ──────────────────────────────────────────────────────────────────

const picks = (world) => (world.mp.yutSides ??= new Map());

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

// ── 판 살림 ───────────────────────────────────────────────────────────────

/// 윷이 공중에 있는 시간 · 떨어진 뒤 보여 주는 시간.
const FLY = 0.85, SHOW = 1.1, THINK = 0.8, OVER_HOLD = 3.2;

function freshBag() {
  return {
    men: freshMen(),
    turn: 0,
    seat: [0, 0],
    phase: 'charge',              // charge → fly → pick
    held: -1, gauge: 0,
    fly: 0, roll: null,           // roll = { sticks, nak, flats, steps, name }
    pick: 0,
    log: [],
    over: false, winner: null, hold: 0, note: null,
    say: null, sayT: 0,
    think: THINK, seed: 1,
    sides: new Map(),
    fresh: true, sentAt: -9,
  };
}
function say(b, text) { b.say = text; b.sayT = 0; }

/// 다음 사람에게. 한 번 더 던질 차례면 같은 사람이 이어서 던진다.
function handOver(world, b, keep = false) {
  const me = doneOf(b.men, 0), you = doneOf(b.men, 1);
  if (me >= CREW || you >= CREW) {
    b.over = true;
    b.winner = me >= CREW ? 0 : 1;
    b.hold = OVER_HOLD;
    b.note = `${TEAM_NAME[b.winner]} 편이 이겼다`;
    return;
  }
  if (!keep) {
    b.seat[b.turn] = (b.seat[b.turn] ?? 0) + 1;
    b.turn = b.turn === 0 ? 1 : 0;
  }
  b.phase = 'charge';
  b.held = -1; b.gauge = 0; b.roll = null; b.fly = 0;
  b.think = THINK;
  b.fresh = true;
}

/// 윷을 던진다. **방장만 부른다.**
export function throwYut(world, gauge) {
  const b = world.bag;
  if (b.over || b.phase !== 'charge') return false;
  b.seed = (b.seed * 1103515245 + 12345) >>> 0;
  b.roll = toss(gauge, b.seed);
  b.gauge = gauge;
  b.phase = 'fly';
  b.fly = 0;
  b.fresh = true;
  return true;
}

/// 던진 것이 땅에 닿았다 — 결과를 판에 적용할 준비를 한다.
function landed(world, b) {
  const r = b.roll;
  b.log.push({ side: b.turn, name: r.name });
  if (b.log.length > 40) b.log.shift();
  if (r.nak) {
    say(b, '낙 — 한 번 쉰다');
    handOver(world, b);
    return;
  }
  const row = movable(b.men, b.turn);
  if (!row.length) {
    // 움직일 말이 없다 (다 났거나 다 업혀 있다). 한 번 더 던질 차례면 이어서 던진다.
    say(b, `${r.name} — 움직일 말이 없다`);
    handOver(world, b, again(r.flats));
    return;
  }
  b.pick = row[0];
  b.phase = 'pick';
}

/// 고른 말을 옮긴다. **방장만 부른다.**
export function playMove(world, i) {
  const b = world.bag;
  if (b.over || b.phase !== 'pick' || !b.roll) return false;
  const row = movable(b.men, b.turn);
  if (!row.includes(i)) return false;
  const res = move(b.men, i, b.roll.steps);
  if (!res) return false;
  const bonus = res.ate || again(b.roll.flats);
  if (res.ate) say(b, '잡았다 — 한 번 더!');
  else if (again(b.roll.flats)) say(b, `${b.roll.name} — 한 번 더!`);
  handOver(world, b, bonus);
  return true;
}

// ── 컴퓨터 ────────────────────────────────────────────────────────────────

/// 게이지는 살아 있는 구간 가운데를 노린다 (사람처럼 조금 흔들린다).
export const aiGauge = () => {
  const mid = (SAFE_LOW + SAFE_HIGH) / 2;
  const wob = (Math.random() + Math.random() - 1) * (SAFE_HIGH - SAFE_LOW) * 0.34;
  return Math.max(0, Math.min(1, mid + wob));
};

/// 어느 말을 옮길까. 잡는 수가 제일 값지고, 다음이 나는 수, 그다음이 많이 간 말이다.
export function aiPick(men, side, steps) {
  const row = movable(men, side);
  let best = row[0], top = -1e9;
  for (const i of row) {
    const plan = preview(men, i, steps);
    if (!plan) continue;
    const far = plan.to === OUT ? 40 : plan.to;
    const score = plan.eat.length * 100 + (plan.to === OUT ? 60 : 0)
                + plan.ride.length * 12 + far * 0.6
                + (pileOf(men, i) > 1 ? 8 : 0);
    if (score > top) { top = score; best = i; }
  }
  return best;
}

export default {
  id: 'yut',
  name: '윷놀이',
  line: '윷 네 짝을 던져 말 넷을 먼저 내보낸다. 약하거나 세게 던지면 낙 — 한 번 쉰다. 1:1 도 2:2 도 된다.',
  keys: [
    ['⌥ Space', '잡고 있으면 힘이 찬다 · 떼면 던진다'],
    ['⌥ ← →', '옮길 말 고르기'],
    ['⌥ Space', '그 말을 옮긴다'],
    ['윷 · 모 · 잡기', '한 번 더 던진다'],
    ['낙', '판을 벗어나거나 못 닿으면 그 차례를 잃는다'],
  ],
  tally: (world) => {
    const b = world.bag;
    if (!b?.men) return '';
    return `${doneOf(b.men, 0)} : ${doneOf(b.men, 1)}`;
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

  /// 말 고르기는 좌우로만. 위아래는 아무것도 안 한다.
  tap(world, key) {
    const b = world.bag;
    if (b.over || !myTurn(world) || b.phase !== 'pick') return;
    const dir = key === 'left' ? -1 : key === 'right' ? 1 : 0;
    if (!dir) return;
    const row = movable(b.men, b.turn);
    if (!row.length) return;
    const at = Math.max(0, row.indexOf(b.pick));
    b.pick = row[(at + dir + row.length) % row.length];
  },

  /// ⌥Space — 잡으면 힘이 차고, 고르는 중이면 그 말을 옮긴다.
  action(world) {
    const b = world.bag;
    if (world.state !== 'play' || b.over || !myTurn(world)) return;
    if (b.phase === 'charge') { b.held = 0; b.gauge = 0; return; }
    if (b.phase === 'pick') {
      if (world.mp.on && world.mp.role === 'guest') {
        world.send?.({ t: 'gm', k: 'move', i: b.pick });
        return;
      }
      playMove(world, b.pick);
    }
  },

  /// 떼는 순간의 힘으로 던진다.
  release(world) {
    const b = world.bag;
    if (b.phase !== 'charge' || b.held < 0 || !myTurn(world)) return;
    const gauge = b.gauge;
    b.held = -1;
    if (world.mp.on && world.mp.role === 'guest') {
      world.send?.({ t: 'gm', k: 'toss', g: Math.round(gauge * 1000) });
      return;
    }
    throwYut(world, gauge);
  },

  update(world, dt) {
    const b = world.bag;
    if (!b.men) Object.assign(b, freshBag());
    if (b.say) { b.sayT += dt; if (b.sayT > 1.4) b.say = null; }
    if (world.state !== 'play') return;
    if (world.mp.role === 'host') {
      b.sides = rosterSides(world);
      const mineSide = b.sides.get(world.mp.myId);
      if (mineSide !== undefined && mineSide !== world.team) world.team = mineSide;
    }

    // 톱니 게이지. 잡고 있는 동안 찼다가 0으로 뚝 떨어지고 다시 찬다.
    if (b.phase === 'charge' && b.held >= 0) {
      b.held += dt;
      b.gauge = gaugeAt(b.held);
    }

    // 내가 겨누는 힘을 남들에게도 알려 준다 — 남의 차례에 화면이 멎어 있으면 안 된다.
    if (world.mp.on && world.mp.role === 'guest' && myTurn(world)) {
      b.told = (b.told ?? 0) + dt;
      if (b.told >= 0.1) {
        b.told = 0;
        world.send?.({ t: 'gm', k: 'aim', g: Math.round(b.gauge * 1000), p: b.pick,
                       h: b.held >= 0 ? 1 : 0 });
      }
    }

    // 윷이 공중에 있다. 다 떨어지면 결과를 읽는다.
    if (b.phase === 'fly') {
      b.fly += dt;
      if (b.fly >= FLY + SHOW && world.mp.role !== 'guest') landed(world, b);
      return;
    }

    if (b.over) {
      if (world.mp.role === 'guest') return;
      b.hold -= dt;
      if (b.hold <= 0 && !b.ended) {
        b.ended = true;
        world.onGameOver?.({ name: `${TEAM_NAME[b.winner ?? 0]} 편`, side: b.winner ?? 0, rows: [] });
      }
      return;
    }

    if (world.mp.role === 'guest') return;

    // 사람이 없는 편은 컴퓨터가 한다.
    if (!whoseTurn(world)) {
      b.think -= dt;
      if (b.think <= 0) {
        b.think = THINK;
        if (b.phase === 'charge') throwYut(world, aiGauge());
        else if (b.phase === 'pick') playMove(world, aiPick(b.men, b.turn, b.roll.steps));
      }
    }
  },

  draw(ctx, world, time, boil, upright) {
    const b = world.bag;
    if (!b?.men) return;
    const L = layout(world);
    drawBoard(ctx, L);
    drawMen(ctx, L, world, b, time);
    drawMat(ctx, L, b);
    drawSticks(ctx, L, b, time);
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
    const wide = Math.max(240, ctx.measureText(line).width + 130);
    paperScrap(ctx, world.w / 2 - wide / 2, 14, wide, 54, 9);
    text(ctx, line, world.w / 2, 37,
         { font: `800 17px ${HAN}`, color: b.over ? RED : INK, align: 'center', halo: 0 });
    if (!b.over) {
      circle(ctx, world.w / 2 - wide / 2 + 20, 32, 9,
             { width: 2, color: TEAM_INK[b.turn], fill: TEAM_INK[b.turn], seed: 3, amp: 0.3 });
    }
    const step = b.phase === 'pick' && b.roll ? ` · ${b.roll.name} — 옮길 말을 고른다` : '';
    text(ctx, `난 말 ${doneOf(b.men, 0)} : ${doneOf(b.men, 1)}${step}`, world.w / 2, 57,
         { font: `600 12px ${MONO}`, color: PENCIL, align: 'center', halo: 0 });
    // 방금 나온 것 — 크게 한 번
    if (b.roll && b.phase !== 'charge' && b.fly > FLY * 0.9) {
      const k = Math.min(1, (b.fly - FLY * 0.9) / 0.25);
      // **멍석 위에 띄운다.** 화면 가운데에 띄웠더니 판 오른쪽 위 귀퉁이에 겹쳤다 —
      // 눈이 윷 떨어지는 데 가 있으니 글자도 거기 있어야 한다.
      const L2 = layout(world);
      text(ctx, b.roll.name, L2.matX + L2.matW * 0.55, L2.matY - L2.matW * 0.2 - (1 - k) * 20, {
        font: `900 ${Math.round(34 + k * 8)}px ${HAN}`, color: b.roll.nak ? RED : INK,
        align: 'center', halo: 10, alpha: Math.min(1, k * 2),
      });
    }
    if (b.say) {
      text(ctx, b.say, world.w / 2, world.h - 26,
           { font: `800 15px ${HAN}`, color: RED, align: 'center', halo: 4,
             alpha: Math.max(0, Math.min(1, 1 - (b.sayT - 1.1) / 0.3)) });
    }
  },

  message(world, from, msg) {
    if (world.mp.role !== 'host') return;
    const b = world.bag;
    if (typeof msg.s === 'number') { takeSide(world, from, msg.s ? 1 : 0); return; }
    if (world.state !== 'play' || b.over) return;
    const who = whoseTurn(world);
    if (!who || who.id !== from) return;
    if (msg.k === 'aim') {
      if (b.phase === 'charge') b.gauge = Math.max(0, Math.min(1, (+msg.g || 0) / 1000));
      if (b.phase === 'pick') {
        const row = movable(b.men, b.turn);
        const want = msg.p | 0;
        if (row.includes(want)) b.pick = want;
      }
      return;
    }
    if (msg.k === 'toss') throwYut(world, Math.max(0, Math.min(1, (+msg.g || 0) / 1000)));
    if (msg.k === 'move') playMove(world, msg.i | 0);
  },

  pack(world) {
    const b = world.bag;
    const fresh = b.fresh;
    b.fresh = false;
    // 윷이 나는 동안은 매 프레임 — 그 한 꾸러미를 놓치면 손님은 결과만 보게 된다
    // (알까기에서 그렇게 당했다). 나머지 때는 0.6초마다 한 번.
    const flying = b.phase === 'fly';
    const again2 = !fresh && !flying && world.elapsed - (b.sentAt ?? -9) >= 0.6;
    if (fresh || again2) b.sentAt = world.elapsed;
    return {
      tm: [...rosterSides(world).entries()],
      t: b.turn, st: [b.seat[0] ?? 0, b.seat[1] ?? 0],
      ph: b.phase, pk: b.pick, gg: Math.round(b.gauge * 1000),
      fy: Math.round(b.fly * 100),
      o: b.over ? 1 : 0, wn: b.winner === 0 || b.winner === 1 ? b.winner : -1,
      nt: b.note ?? null,
      sy: b.say ?? null,
      // 던진 것 — 짝마다 [엎/젖, 몇 바퀴, 어느 줄, 얼마나 멀리]
      rl: b.roll ? { n: b.roll.name, s: b.roll.steps, k: b.roll.nak ? 1 : 0, f: b.roll.flats,
                     t: b.roll.sticks.map((x) => [x.flat ? 1 : 0, Math.round(x.turns * 100),
                                                  Math.round(x.lane * 1000), Math.round(x.dist * 1000)]) }
                 : null,
      m: fresh || again2 || flying
        ? b.men.map((m) => [m.side, m.face, m.at, m.on, m.done ? 1 : 0])
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
      const rows = data.m.filter((r) => Array.isArray(r) && r.length >= 5 && r.every(Number.isFinite));
      if (rows.length) {
        b.men = rows.map((r) => ({ side: r[0] ? 1 : 0, face: r[1] | 0, at: r[2] | 0,
                                   on: r[3] | 0, done: !!r[4] }));
      }
    }
    if (Number.isFinite(data.t)) b.turn = data.t ? 1 : 0;
    if (Array.isArray(data.st) && data.st.every(Number.isFinite)) b.seat = [data.st[0], data.st[1]];
    const boss = !myTurn(world);
    if (typeof data.ph === 'string' && (boss || b.phase !== 'charge')) b.phase = data.ph;
    if (boss) {
      if (Number.isFinite(data.gg)) b.gauge = data.gg / 1000;
      if (Number.isFinite(data.pk)) b.pick = data.pk | 0;
    }
    if (Number.isFinite(data.fy)) b.fly = data.fy / 100;
    if (data.rl && typeof data.rl === 'object' && Array.isArray(data.rl.t)) {
      b.roll = {
        name: String(data.rl.n ?? ''), steps: data.rl.s | 0, nak: !!data.rl.k, flats: data.rl.f | 0,
        sticks: data.rl.t.filter((x) => Array.isArray(x) && x.length >= 4).map((x) => ({
          flat: !!x[0], turns: x[1] / 100, lane: x[2] / 1000, dist: x[3] / 1000, spin: 3,
        })),
      };
    } else if (data.rl === null) b.roll = null;
    b.over = !!data.o;
    b.winner = data.wn === 0 || data.wn === 1 ? data.wn : null;
    if (typeof data.nt === 'string' || data.nt === null) b.note = data.nt;
    if (typeof data.sy === 'string' && data.sy !== b.say) { b.say = data.sy; b.sayT = 0; }
  },
};

// ── 그리기 ────────────────────────────────────────────────────────────────

/// 판이 화면 어디에. 판은 왼쪽, 윷 던지는 자리는 오른쪽에 둔다.
export function layout(world) {
  const w = world.w ?? 1200, h = world.h ?? 800;
  // **판 위아래로 말 놓을 자리를 남긴다.** 난 말은 판 위에, 집에서 기다리는 말은 판 아래에
  // 줄 세우는데, 판을 꽉 채우면 그 두 줄이 화면 밖으로 잘린다.
  const size = Math.max(180, Math.min(w * 0.44, h - 250));
  return { x: w * 0.055, y: 104 + (h - 250 - size) / 2 + 24, size,
           matX: w * 0.6, matY: 104 + (h - 250) * 0.5, matW: w * 0.34 };
}
const at2 = (L, u, v) => [L.x + u * L.size, L.y + v * L.size];

function drawBoard(ctx, L) {
  const pad = L.size * 0.08;
  const back = [[L.x - pad, L.y - pad], [L.x + L.size + pad, L.y - pad],
                [L.x + L.size + pad, L.y + L.size + pad], [L.x - pad, L.y + L.size + pad]];
  stroke(ctx, [...back, back[0]], { width: 1, color: '#cfc7b4', fill: '#efe9da',
                                    alpha: 0.32, seed: 2, amp: 1.1, sharp: true, halo: false });
  // 바깥 네모와 지름길 두 줄
  const corners = [at2(L, 1, 1), at2(L, 1, 0), at2(L, 0, 0), at2(L, 0, 1)];
  stroke(ctx, [...corners, corners[0]],
         { width: 1.1, color: PENCIL, seed: 5, amp: 0.3, alpha: 0.5, sharp: true, haloWidth: 2 });
  stroke(ctx, [at2(L, 1, 0), at2(L, 0, 1)], { width: 1, color: PENCIL, seed: 6, amp: 0.3, alpha: 0.4, haloWidth: 2 });
  stroke(ctx, [at2(L, 0, 0), at2(L, 1, 1)], { width: 1, color: PENCIL, seed: 7, amp: 0.3, alpha: 0.4, haloWidth: 2 });
  // 밭. 모(꼭짓점)와 방은 크게 — 지름길을 탈 수 있는 자리다.
  for (let n = 1; n <= 29; n++) {
    if (n > 20 && n !== CENTER && ![21, 22, 23, 24, 26, 27, 28, 29].includes(n)) continue;
    const [u, v] = spotOf(n);
    const [px, py] = at2(L, u, v);
    const big = isCorner(n) || n === CENTER;
    circle(ctx, px, py, big ? L.size * 0.045 : L.size * 0.027, {
      width: big ? 2 : 1.4, color: PENCIL, fill: PAPER_SOLID,
      alpha: big ? 0.85 : 0.6, seed: 30 + n, amp: 0.3,
    });
    if (n === CENTER) {
      text(ctx, '방', px, py + 4, { font: `800 ${Math.round(L.size * 0.045)}px ${HAN}`,
                                    color: PENCIL, align: 'center', halo: 2, alpha: 0.7 });
    }
  }
  const [sx, sy] = at2(L, ...spotOf(RING));
  text(ctx, '출발', sx + L.size * 0.09, sy + L.size * 0.02,
       { font: `700 ${Math.round(L.size * 0.05)}px ${HAN}`, color: PENCIL, halo: 2, alpha: 0.6 });
}

/// **귀여운 말.** 동글동글한 몸에 귀와 눈. 넷이 저마다 다르게 생겼다 —
/// 색만 다르면 「내 말이 어느 것이었지」가 된다.
function drawPiece(ctx, px, py, r, side, face, opts = {}) {
  const tint = TEAM_INK[side];
  const seed = 500 + side * 7 + face;
  const dim = opts.alpha ?? 1;
  // 귀 — 생김새마다 다르다
  if (face === 0) {                               // 토끼: 긴 귀 둘
    for (const dx of [-0.42, 0.42]) {
      fillStroke(ctx, [[px + dx * r, py - r * 0.5], [px + dx * r * 1.4, py - r * 1.9],
                       [px + dx * r * 0.4, py - r * 1.75]],
                 { width: 1.6, color: tint, fill: PAPER_SOLID, seed: seed + dx * 3, amp: 0.4, close: true, alpha: dim });
    }
  } else if (face === 1) {                        // 곰: 동그란 귀 둘
    for (const dx of [-0.72, 0.72]) {
      circle(ctx, px + dx * r, py - r * 0.72, r * 0.36,
             { width: 1.6, color: tint, fill: PAPER_SOLID, seed: seed + dx * 5, amp: 0.3, alpha: dim });
    }
  } else if (face === 2) {                        // 고양이: 뾰족한 귀 둘
    for (const dx of [-0.6, 0.6]) {
      fillStroke(ctx, [[px + dx * r * 1.1, py - r * 0.4], [px + dx * r * 0.9, py - r * 1.55],
                       [px + dx * r * 0.15, py - r * 0.85]],
                 { width: 1.5, color: tint, fill: PAPER_SOLID, seed: seed + dx * 7, amp: 0.35, close: true, alpha: dim });
    }
  } else {                                        // 병아리: 머리 위 깃털 하나
    stroke(ctx, [[px, py - r * 0.9], [px - r * 0.2, py - r * 1.7], [px + r * 0.25, py - r * 1.4]],
           { width: 1.8, color: tint, seed, amp: 0.4, alpha: dim });
  }
  // 몸
  circle(ctx, px, py, r, { width: 2.2, color: tint, fill: PAPER_SOLID, seed, amp: 0.35, alpha: dim });
  // 눈 둘과 입
  for (const dx of [-0.34, 0.34]) {
    circle(ctx, px + dx * r, py - r * 0.12, r * 0.12,
           { width: 1.2, color: INK, fill: INK, halo: false, seed: seed + dx * 11, amp: 0.15, alpha: dim });
  }
  if (face === 3) {                               // 병아리는 부리
    fillStroke(ctx, [[px - r * 0.16, py + r * 0.28], [px + r * 0.16, py + r * 0.28], [px, py + r * 0.55]],
               { width: 1.2, color: '#d97b1f', fill: '#e8a33f', seed, amp: 0.2, close: true, alpha: dim });
  } else {
    stroke(ctx, [[px - r * 0.2, py + r * 0.34], [px, py + r * 0.46], [px + r * 0.2, py + r * 0.34]],
           { width: 1.3, color: INK, halo: false, seed: seed + 2, amp: 0.2, alpha: dim * 0.8 });
  }
  // 업고 있으면 숫자
  if (opts.pile > 1) {
    text(ctx, `×${opts.pile}`, px + r * 1.1, py - r * 0.9,
         { font: `800 ${Math.round(r * 1.1)}px ${MONO}`, color: tint, halo: 3, alpha: dim });
  }
}

function drawMen(ctx, L, world, b, time) {
  const r = L.size * 0.042;
  // 집에서 기다리는 말 — 판 아래에 줄 세운다
  [0, 1].forEach((side) => {
    const waiting = b.men.filter((m) => m.side === side && !m.done && m.on === -1 && m.at === HOME);
    waiting.forEach((m, k) => {
      const px = L.x + (side === 0 ? 0.12 : 0.88) * L.size + (k - 1.5) * r * 2.4 * (side === 0 ? 1 : -1);
      const py = L.y + L.size + L.size * 0.085;
      drawPiece(ctx, px, py, r * 0.8, side, m.face, { alpha: 0.75 });
    });
  });
  // 판 위의 말
  b.men.forEach((m, i) => {
    if (m.done || m.at === HOME || m.on !== -1) return;
    const [u, v] = spotOf(m.at);
    const [px, py] = at2(L, u, v);
    // 같은 밭에 여럿이면 조금씩 비껴 놓는다
    const sameSpot = b.men.filter((x, j) => j < i && !x.done && x.at === m.at && x.on === -1).length;
    drawPiece(ctx, px + sameSpot * r * 0.5, py - sameSpot * r * 0.5, r, m.side, m.face,
              { pile: pileOf(b.men, i) });
  });
  // 난 말 — 판 위쪽에 모아 둔다
  [0, 1].forEach((side) => {
    const out = b.men.filter((m) => m.side === side && m.done);
    out.forEach((m, k) => {
      const px = L.x + (side === 0 ? 0.12 : 0.88) * L.size + (k - 1.5) * r * 2.4 * (side === 0 ? 1 : -1);
      const py = L.y - L.size * 0.085;
      drawPiece(ctx, px, py, r * 0.72, side, m.face, { alpha: 0.5 });
    });
  });
  // 고른 말에 꺾쇠 — 옅은 테 하나로는 판에 묻힌다 (알까기에서 배운 것)
  if (myTurn(world) && b.phase === 'pick') {
    const m = b.men[b.pick];
    if (m && !m.done && m.on === -1) {
      const [u, v] = m.at === HOME ? [null, null] : spotOf(m.at);
      let px, py;
      if (u === null) {
        const waiting = b.men.filter((x) => x.side === m.side && !x.done && x.on === -1 && x.at === HOME);
        const k = waiting.indexOf(m);
        px = L.x + (m.side === 0 ? 0.12 : 0.88) * L.size + (k - 1.5) * r * 2.4 * (m.side === 0 ? 1 : -1);
        py = L.y + L.size + L.size * 0.085;
      } else [px, py] = at2(L, u, v);
      const b0 = r * 1.9, tick = r * 0.8;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        stroke(ctx, [[px + sx * b0, py + sy * b0 - sy * tick], [px + sx * b0, py + sy * b0],
                     [px + sx * b0 - sx * tick, py + sy * b0]],
               { width: 2.4, color: INK, seed: 20 + sx * 3 + sy, amp: 0.4, alpha: 0.85, haloWidth: 3 });
      }
      // 이 말이 어디로 가는지 미리 보여 준다
      const plan = b.roll ? preview(b.men, b.pick, b.roll.steps) : null;
      if (plan) {
        const [tu, tv] = spotOf(plan.to);
        const [tx, ty] = at2(L, tu, tv);
        stroke(ctx, [[px, py], [tx, ty]], { width: 1.6, color: TEAM_INK[m.side], seed: 9, amp: 0.6,
                                            alpha: 0.4 + 0.2 * Math.sin(time * 5), halo: false });
        circle(ctx, tx, ty, r * 0.9, { width: 2, color: plan.eat.length ? RED : TEAM_INK[m.side],
                                       seed: 10, amp: 0.5, alpha: 0.8, halo: false });
        if (plan.eat.length) {
          text(ctx, '잡는다!', tx, ty - r * 2, { font: `800 13px ${HAN}`, color: RED,
                                                align: 'center', halo: 3 });
        }
      }
    }
  }
}

/// 멍석 — 여기 안에 떨어져야 한다. 살아 있는 구간을 눈으로 보여 주는 것이 곧 게이지다.
function drawMat(ctx, L, b) {
  const y = L.matY;
  const x0 = L.matX + L.matW * MAT_NEAR * 0.9, x1 = L.matX + L.matW * MAT_FAR * 0.9;
  const box = [[x0, y - L.matW * 0.13], [x1, y - L.matW * 0.13],
               [x1, y + L.matW * 0.13], [x0, y + L.matW * 0.13]];
  stroke(ctx, [...box, box[0]], { width: 1.4, color: '#a8761c', fill: 'rgba(216,186,130,0.22)',
                                  seed: 40, amp: 0.9, sharp: true, halo: false, alpha: 0.9 });
  text(ctx, '멍석', (x0 + x1) / 2, y + L.matW * 0.19,
       { font: `700 11px ${HAN}`, color: PENCIL, align: 'center', halo: 2, alpha: 0.7 });
}

/// 윷 네 짝. 공중에서 구르다 멍석에 떨어진다 — **던지는 그림이 절반이다.**
function drawSticks(ctx, L, b, time) {
  const r = L.matW * 0.05;
  const from = L.matX + L.matW * 0.02;
  const showRoll = b.roll && (b.phase === 'fly' || b.phase === 'pick');
  if (!showRoll) {
    // 아직 손에 있다 — 던지는 사람 손 앞에 네 짝을 모아 둔다
    for (let i = 0; i < 4; i++) {
      drawStick(ctx, from, L.matY + (i - 1.5) * r * 0.9, r, Math.PI / 2 + i * 0.05, true, 0.85);
    }
    if (b.phase === 'charge' && b.held >= 0) drawGauge(ctx, L, b);
    return;
  }
  b.roll.sticks.forEach((s, i) => {
    const t = Math.min(1, b.fly / FLY);
    // 나는 길 — 위로 던져 올려 떨어진다 (포물선). 구르는 각도는 몇 바퀴 × 진행률.
    const land = L.matX + L.matW * s.dist * 0.9;
    const px = from + (land - from) * t;
    const arc = Math.sin(t * Math.PI) * L.matW * 0.42;
    const py = L.matY + s.lane * L.matW - arc;
    const spin = t < 1 ? s.turns * t * Math.PI * 2 : s.turns * Math.PI * 2;
    drawStick(ctx, px, py, r, spin, t >= 1 ? s.flat : (Math.floor(s.turns * t * 2) % 2 === 0), 1);
  });
}

function drawStick(ctx, px, py, r, angle, flat, alpha) {
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const len = r * 2.1, wide = r * 0.42;
  const pt = (dx, dy) => [px + dx * ca - dy * sa, py + dx * sa + dy * ca];
  fillStroke(ctx, [pt(-len, -wide), pt(len, -wide), pt(len, wide), pt(-len, wide)],
             { width: 1.8, color: '#6b4a24', fill: flat ? '#e8d5ae' : '#b98a4e',
               seed: Math.round(px + py), amp: 0.4, close: true, alpha });
  // 젖혀진 짝(배가 위)에는 가운데에 금이 하나 — 눈으로 바로 세게
  if (flat) {
    stroke(ctx, [pt(-len * 0.5, 0), pt(len * 0.5, 0)],
           { width: 1.4, color: '#6b4a24', seed: Math.round(px), amp: 0.3, halo: false, alpha: alpha * 0.8 });
  }
}

/// 힘 막대. **살아 있는 구간을 막대 위에 그려 준다** — 안 그러면 어디서 떼야 하는지 알 수가 없다.
function drawGauge(ctx, L, b) {
  const w = L.matW * 0.78, h = 14;
  const x = L.matX - L.matW * 0.02, y = L.matY + L.matW * 0.3;
  const box = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  stroke(ctx, [...box, box[0]], { width: 1.5, color: PENCIL, seed: 50, amp: 0.3,
                                  alpha: 0.7, sharp: true, haloWidth: 2 });
  // 멍석에 닿는 구간
  const lo = x + w * SAFE_LOW, hi = x + w * SAFE_HIGH;
  stroke(ctx, [[lo, y + h / 2], [hi, y + h / 2]],
         { width: h - 3, color: '#3f8f56', seed: 51, amp: 0.2, sharp: true, halo: false, alpha: 0.28 });
  // 지금 힘
  const now = x + w * b.gauge;
  stroke(ctx, [[x + 1.5, y + h / 2], [now, y + h / 2]],
         { width: h - 5, color: b.gauge >= SAFE_LOW && b.gauge <= SAFE_HIGH ? INK : RED,
           seed: 52, amp: 0.2, sharp: true, halo: false });
  text(ctx, '멍석에 닿는 힘', (lo + hi) / 2, y - 6,
       { font: `700 10px ${HAN}`, color: '#3f8f56', align: 'center', halo: 2, alpha: 0.85 });
}

function drawCrew(ctx, world, b, time, boil) {
  const L = layout(world);
  const who = whoseTurn(world);
  [0, 1].forEach((side) => {
    const seats = seatsOf(world, side);
    seats.forEach((s, i) => {
      const px = L.matX + L.matW * (side === 0 ? 0.08 : 0.88);
      const y = L.matY - L.matW * 0.3 + i * 88;
      const p = {
        x: px, groundY: y, air: 0, vx: 0, vy: 0, facing: side === 0 ? 1 : -1,
        walk: 0, crouch: 0, dead: false, deadFor: 0, danger: false,
        grabbing: -1, heldBy: -1, grabAim: 0, slide: 0, swing: 0, toss: 0, block: 0,
      };
      // **던지는 몸짓.** 윷이 나는 동안 팔을 휘두른다 (배구 토스와 같은 자리를 쓴다).
      if (who && who.id === s.id && b.phase === 'fly') p.toss = Math.min(1, b.fly / (FLY * 0.5));
      drawStickman(ctx, p, time, boil, {
        color: TEAM_INK[side], name: s.mine ? '나' : (s.name ?? null), mine: s.mine,
      });
      if (who && who.id === s.id && !b.over) {
        text(ctx, side === 0 ? '▶' : '◀', px + (side === 0 ? 32 : -32), y - 52,
             { font: `800 16px ${HAN}`, color: TEAM_INK[side], align: 'center', halo: 3,
               alpha: 0.55 + 0.45 * Math.sin(time * 5) });
      }
    });
  });
}

const KEY_ROWS = [
  ['⌥ Space', '잡으면 힘이 찬다 · 떼면 던진다'],
  ['⌥ ← →', '옮길 말 고르기'],
  ['윷 · 모 · 잡기', '한 번 더'],
  ['낙', '못 닿거나 넘어가면 한 번 쉰다'],
];
function drawKeys(ctx) {
  const x = 16, y = 14, lh = 15;
  paperScrap(ctx, x, y, 250, 14 + KEY_ROWS.length * lh, 17);
  KEY_ROWS.forEach(([key, name], i) => {
    const ly = y + 20 + i * lh;
    text(ctx, key, x + 12, ly, { font: `700 10px ${HAN}`, color: INK, halo: 0, alpha: 0.75 });
    text(ctx, name, x + 104, ly, { font: `600 10px ${HAN}`, color: PENCIL, halo: 0, alpha: 0.7 });
  });
}

export { TEAM_NAME, TEAM_INK, CREW, FACES, FLY };
