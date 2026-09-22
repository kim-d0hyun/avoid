// 오목 — 다섯 줄을 먼저 잇는다.
//
// 방향키로 자리를 고르고 ⌥Space 로 놓는다. 그게 전부다. 이 앱의 다른 게임과 달리
// **달리지도 뛰지도 않는다** — 그래서 사람은 판 옆에 서서 보고만 있다.
//
// **N:N 이다.** 편마다 여럿이 서고, 차례는 편을 번갈아 돌되 **그 편 안에서도 돌아간다** —
// 검정 1번 → 하양 1번 → 검정 2번 → 하양 2번 … 이렇게. 한 사람이 연달아 두 번 놓지 않는다.
// 셋이 한 편이면 셋이 돌아가며 한 수씩 둔다. 이게 이 게임이 여럿이서 재미있는 까닭이다 —
// 내 차례가 아니어도 판은 내 편의 판이고, 앞사람이 둔 수를 이어받는다.
//
// 자리는 **방장이 정한다.** 손님은 「여기 놓고 싶다」만 보내고, 놓을 수 있는지(내 차례인가,
// 빈 자리인가)는 방장이 다시 본다. 안 그러면 두 사람이 같은 칸에 동시에 놓는다.
//
// **커서는 차례인 사람 것만 모두에게 보인다.** 예전에는 커서가 제 화면에만 있었는데,
// 그러면 남의 차례에 판이 통째로 멎어 있어서 「끊긴 건가」 싶다 — 오목은 달리지도 뛰지도
// 않으니 커서 말고는 움직이는 것이 없다. 차례인 사람은 어차피 곧 놓으니 잃을 수싸움이
// 몇 초뿐이고, **차례가 아닌 사람의 커서는 여전히 제 화면에만 있다** — 미리 재 두는 수는
// 감춰진다. 커서는 세 모양으로 갈린다 (drawAim · drawTurnAim 참조):
//   내 차례          닫힌 네모 + 맥박 + 놓을 돌 미리보기
//   남의 차례(그 사람) 닫힌 네모 + 이름표    ← 방장이 모아서 보낸 것
//   남의 차례(나)     귀퉁이 갈고리만        ← 움직이지만 지금은 못 놓는다
// 옅기만 달리하면 어두운 벽지에서 둘이 같아 보인다. 그래서 **모양**을 달리한다.

import { INK, RED, PENCIL, PAPER_SOLID, stroke, circle, text, paperScrap } from '../draw/ink.js';
import { drawStickman } from '../draw/stickman.js';

const N = 19;                     // 열아홉 줄 — 진짜 바둑판과 같은 크기
const WIN = 5;                    // 다섯이면 이긴다
/// **사람**의 색 (판 옆에 선 졸라맨과 커서). 이 앱의 편 색 그대로다.
const TEAM_INK = ['#b5352f', '#2f6fb0'];
/// **돌**의 색. 오목은 흑백이다 — 편 색으로 그리면 「빨강 편 돌」이지 바둑돌이 아니다.
/// 검정은 속을 채우고, 하양은 종이색으로 채운 뒤 테두리를 두른다 (안 채우면 판의 줄이
/// 돌 위로 비쳐서 돌이 아니라 동그라미로 보인다).
const STONE_FILL = ['#26221c', PAPER_SOLID];
const STONE_EDGE = ['#15120e', '#2f2a22'];
/// 판 뒤에 까는 바닥. 진한 흰 판이 아니라 **비치는 한 겹**이다 (알파 0.5 로 깐다).
const BOARD_BACK = '#efe9da';
const BOARD_EDGE = '#cfc7b4';
const TEAM_NAME = ['검정', '하양'];
const HAN = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const MONO = '"American Typewriter", "Courier New", monospace';

/// 커서를 **누르고 있을 때** 얼마나 기다렸다가, 얼마 만에 한 칸씩 더 가나.
/// 누른 그 순간 한 칸은 tap 이 옮긴다 — 한 칸만 옮기려는데 서너 칸 가면 못 쓴다.
const REPEAT_WAIT = 0.34, REPEAT_EVERY = 0.075;
/// 차례인 사람이 제 커서를 알려주는 간격, 그리고 그 뒤로 몇 초까지를 살아 있는 것으로 보나.
const AIM_TELL = 0.1, AIM_STALE = 1.2;
/// 남의 커서가 칸 사이를 미끄러지는 빠르기. 0.1초에 한 번 오는 자리를 그냥 튀게 그리면
/// **움직이는 중인지 멎어 있는지** 구분이 안 된다 — 미끄러져야 「지금 고르고 있다」가 보인다.
const AIM_GLIDE = 14;
/// 컴퓨터가 생각하는 척하는 시간. 곧바로 두면 사람이 둔 수를 볼 틈이 없다.
const THINK = 0.65;
/// 대국이 끝나고 다음 판까지.
const OVER_HOLD = 2.6;

const at = (cells, x, y) => (x < 0 || y < 0 || x >= N || y >= N ? -1 : cells[y * N + x]);
/// 내가 어느 편인가 (구경하는 사람은 −1 — 어느 쪽도 「상대」가 아니다).
const side0 = (world) => (world.mp.waiting ? -1 : (world.team ?? 0));
/// 방금 둔 자리를 크게 보이는 시간.
const MARK_LOUD = 2.5;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ── 판 읽기 ───────────────────────────────────────────────────────────────

const DIRS = [[1, 0], [0, 1], [1, 1], [1, -1]];

/// 이 자리에 놓으면 **다섯이 되나.** 되면 그 다섯(혹은 그 이상) 칸을 돌려준다.
///
/// 돌을 놓은 자리에서 네 방향으로 양쪽을 훑는다. 판 전체를 다시 세지 않는다 —
/// 한 수로 달라지는 것은 그 수를 지나는 네 줄뿐이다.
///
/// **칸 값은 0 빈 칸 · 1 검정 · 2 하양** 하나로 쓴다 (판 밖은 −1). 편 번호(0·1)와
/// 칸 값을 섞어 쓰면 「빈 칸」과 「검정」이 같은 0 이 되어 조용히 틀린다.
export function winLine(cells, x, y, stone) {
  for (const [dx, dy] of DIRS) {
    const row = [[x, y]];
    for (let s = 1; s < N; s++) {
      if (at(cells, x + dx * s, y + dy * s) !== stone) break;
      row.push([x + dx * s, y + dy * s]);
    }
    for (let s = 1; s < N; s++) {
      if (at(cells, x - dx * s, y - dy * s) !== stone) break;
      row.unshift([x - dx * s, y - dy * s]);
    }
    if (row.length >= WIN) return row;
  }
  return null;
}

// ── 금수 (흑만) ────────────────────────────────────────────────────────────
//
// **검정이 먼저 두는 값을 치른다.** 먼저 두는 쪽이 그냥 이긴다 — 그래서 한국식 오목은
// 흑에게만 금수를 둔다: 삼삼 · 사사 · 장목. 백은 아무 데나 둘 수 있다.
//
// 판정은 「그 자리에 놓았다 치고」 그 수를 지나는 네 줄만 본다.

/// 한 방향으로 −5..+5 를 훑은 줄. 가운데(5번)가 방금 놓은 자리다.
function lineOf(cells, x, y, dx, dy, stone) {
  const row = [];
  for (let s = -5; s <= 5; s++) {
    row.push(s === 0 ? stone : at(cells, x + dx * s, y + dy * s));
  }
  return row;
}

/// 가운데를 지나는 연속 길이.
function runThrough(row, stone) {
  let len = 1;
  for (let i = 6; i < row.length && row[i] === stone; i++) len++;
  for (let i = 4; i >= 0 && row[i] === stone; i--) len++;
  return len;
}

/// 가운데를 지나는 줄의 **양 끝이 트였나**.
function openEnds(row, stone) {
  let hi = 6; while (hi < row.length && row[hi] === stone) hi++;
  let lo = 4; while (lo >= 0 && row[lo] === stone) lo--;
  return (row[hi] === 0 ? 1 : 0) + (lo >= 0 && row[lo] === 0 ? 1 : 0);
}

/// 이 줄에 **사**가 있나 — 한 칸만 더 놓으면 다섯이 되는 자리가 몇 군데인가.
function fourPoints(row, stone) {
  let n = 0;
  for (let i = 0; i < row.length; i++) {
    if (row[i] !== 0) continue;
    const copy = row.slice();
    copy[i] = stone;
    if (runThrough(copy, stone) >= WIN) n++;
  }
  return n;
}

/// 이 줄이 **열린 삼**인가 — 한 칸 더 놓으면 «열린 사»가 되는 자리가 있나.
///
/// 열린 사는 양쪽 어느 쪽으로도 다섯이 되어서 **막을 수가 없다.** 그래서 열린 삼을
/// 둘 만들면(삼삼) 흑이 그냥 이긴다 — 그걸 막는 것이 금수다.
function isOpenThree(row, stone) {
  for (let i = 0; i < row.length; i++) {
    if (row[i] !== 0) continue;
    const copy = row.slice();
    copy[i] = stone;
    if (runThrough(copy, stone) !== 4) continue;       // 정확히 넷이라야 한다
    if (openEnds(copy, stone) === 2) return true;      // 양쪽이 트인 넷 = 열린 사
  }
  return false;
}

/// 흑이 여기에 두면 금수인가. 금수면 까닭('삼삼'·'사사'·'장목'), 아니면 null.
///
/// **다섯이 되면 금수가 아니다.** 오목이 먼저다 — 삼삼이든 사사든 그 수로 다섯이 나면 이긴다.
export function forbidden(cells, x, y, stone = 1) {
  if (stone !== 1) return null;                        // 백은 금수가 없다
  if (at(cells, x, y) !== 0) return null;
  let five = false, over = false, fours = 0, opens = 0;
  for (const [dx, dy] of DIRS) {
    const row = lineOf(cells, x, y, dx, dy, stone);
    const len = runThrough(row, stone);
    if (len === WIN) five = true;
    if (len > WIN) over = true;
    fours += Math.min(2, fourPoints(row, stone));
    if (isOpenThree(row, stone)) opens++;
  }
  if (five) return null;
  if (over) return '장목';
  if (fours >= 2) return '사사';
  if (opens >= 2) return '삼삼';
  return null;
}

/// 한 줄의 값. **몇 개가 이어졌나**와 **양 끝이 막혔나**로 정한다.
///
/// 열린 삼(양쪽이 트인 셋)은 막지 않으면 다음 수에 열린 사가 되고, 열린 사는 막을 수가
/// 없다. 그래서 값이 계단처럼 뛴다 — 이 표가 컴퓨터의 수 전부다.
function runValue(len, openEnds) {
  if (len >= WIN) return 100000;
  if (len === 4) return openEnds >= 2 ? 12000 : openEnds === 1 ? 1200 : 0;
  if (len === 3) return openEnds >= 2 ? 1000 : openEnds === 1 ? 120 : 0;
  if (len === 2) return openEnds >= 2 ? 90 : openEnds === 1 ? 18 : 0;
  if (len === 1) return openEnds >= 2 ? 8 : 2;
  return 0;
}

/// 이 자리에 이 편이 놓으면 얼마나 좋은가. 네 방향을 다 더한다.
export function spotValue(cells, x, y, stone) {
  if (at(cells, x, y) !== 0) return -1;
  let sum = 0;
  for (const [dx, dy] of DIRS) {
    let len = 1, ends = 0;
    let fx = x + dx, fy = y + dy;
    while (at(cells, fx, fy) === stone) { len++; fx += dx; fy += dy; }
    if (at(cells, fx, fy) === 0) ends++;
    let bx = x - dx, by = y - dy;
    while (at(cells, bx, by) === stone) { len++; bx -= dx; by -= dy; }
    if (at(cells, bx, by) === 0) ends++;
    sum += runValue(len, ends);
  }
  return sum;
}

/// 컴퓨터가 둘 자리.
///
/// 한 수 앞만 본다. **내가 놓았을 때 좋아지는 값**과 **상대가 거기 놓았을 때 좋아지는 값**을
/// 같이 재서 더한다 — 막는 것도 결국 그 자리의 값이다. 상대 쪽을 조금 덜 쳐서(0.92) 같은
/// 값이면 공격을 고르게 했다. 이것만으로도 열린 삼을 놓치지 않는다.
///
/// 빈 판이면 한가운데. 그리고 **돌 언저리만 본다** — 225칸을 다 재면 첫 수부터 구석에 둔다.
export function bestSpot(cells, stone, jitter = 0.08) {
  const foe = stone === 1 ? 2 : 1;
  let best = null, top = -1;
  let any = false;
  for (let i = 0; i < cells.length; i++) if (cells[i]) { any = true; break; }
  if (!any) return [(N / 2) | 0, (N / 2) | 0];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      if (at(cells, x, y) !== 0) continue;
      if (!nearStone(cells, x, y, 2)) continue;
      if (forbidden(cells, x, y, stone)) continue;     // 흑은 금수를 못 둔다
      const mine = spotValue(cells, x, y, stone);
      const yours = spotValue(cells, x, y, foe);
      const score = (mine + yours * 0.92) * (1 + Math.random() * jitter);
      if (score > top) { top = score; best = [x, y]; }
    }
  }
  return best ?? [(N / 2) | 0, (N / 2) | 0];
}

/// 이 칸 둘레에 돌이 있나 (몇 칸 안까지 볼지).
function nearStone(cells, x, y, r) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      if (!dx && !dy) continue;
      if (at(cells, x + dx, y + dy) > 0) return true;
    }
  }
  return false;
}

// ── 차례 ──────────────────────────────────────────────────────────────────

const picks = (world) => (world.mp.omokSides ??= new Map());

/// 누가 어느 편인가. **방장이 정한 것을 모두가 따른다** — 각자 정하게 두면 다 한쪽에 선다.
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

/// **편을 바꾼다.** 방장이 정한다.
///
/// 1:1 에서 내가 상대 편으로 가면 **색을 맞바꾼다.** 안 바꾸면 둘이 같은 편에 서고
/// 빈 편은 컴퓨터가 맡는다 — 편을 고른 게 아니라 상대를 컴퓨터로 갈아 치운 셈이 된다.
/// 셋 이상이면 그냥 옮긴다 (누구와 바꿀지 알 수 없다).
function takeSide(world, id, side) {
  const want = side ? 1 : 0;
  const picked = picks(world);
  const before = id === world.mp.myId ? (world.team ?? 0) : (picked.get(id) ?? 0);
  const ids = [world.mp.myId, ...world.mp.others.keys()];
  const sideOf = (who) => (who === world.mp.myId ? (world.team ?? 0) : (picked.get(who) ?? 0));
  const foes = ids.filter((who) => who !== id && sideOf(who) === want);
  picked.set(id, want);
  if (id === world.mp.myId) world.team = want;
  // 둘뿐이고 그 한 사람이 내가 가려는 편에 있으면 자리를 맞바꾼다.
  if (ids.length === 2 && foes.length === 1 && before !== want) {
    const other = foes[0];
    picked.set(other, before);
    if (other === world.mp.myId) world.team = before;
  }
}

/// 그 편에 선 사람들 (번호 순). 번호 순이라 방장과 손님이 같은 차례를 센다.
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

/// **지금 둘 사람.** 그 편에 아무도 없으면 null — 그럼 컴퓨터가 둔다.
export function whoseTurn(world) {
  const b = world.bag;
  const seats = seatsOf(world, b.turn);
  if (!seats.length) return null;
  return seats[(b.seat[b.turn] ?? 0) % seats.length];
}

/// 남의 커서가 칸 사이를 미끄러지게 한다. **사람이 바뀌면 미끄러지지 않고 건너뛴다** —
/// 판을 가로질러 스르르 날아가면 그건 새 사람의 커서가 아니라 유령이다.
/// 지수 보간이라 프레임률이 흔들려도 같은 빠르기로 간다.
function glideAim(b, dt) {
  const t = b.turnAim;
  if (!t) { b.turnGlide = null; return; }
  const g = b.turnGlide;
  if (!g || g.id !== t.id) { b.turnGlide = { x: t.x, y: t.y, id: t.id }; return; }
  const k = 1 - Math.exp(-AIM_GLIDE * Math.max(0, dt));
  g.x += (t.x - g.x) * k;
  g.y += (t.y - g.y) * k;
}

/// 지금이 내 차례인가.
export function myTurn(world) {
  const who = whoseTurn(world);
  return !!who && who.mine && !world.bag.over && world.state === 'play';
}

// ── 두기 ──────────────────────────────────────────────────────────────────

/// 한 수 둔다. **방장만 부른다.** 둘 수 없는 자리면 false 를 돌려준다.
export function put(world, x, y, side) {
  const b = world.bag;
  if (b.over) return false;
  if (x < 0 || y < 0 || x >= N || y >= N) return false;
  if (b.cells[y * N + x] !== 0) return false;
  if (side !== b.turn) return false;
  // **흑의 금수.** 삼삼·사사·장목은 못 둔다 — 먼저 두는 값이다.
  const no = forbidden(b.cells, x, y, side + 1);
  if (no) { b.foul = { x, y, why: no, t: 0 }; return false; }
  b.cells[y * N + x] = side + 1;
  b.moves.push(y * N + x);
  b.last = [x, y];
  b.lastBy = side;                          // 누가 뒀나 — 「상대가 둔 자리」로 적으려고
  b.mark = 0;                               // 방금 둔 자리를 얼마나 오래 크게 보일지
  b.fresh = true;                       // 손님에게 판을 다시 보낸다
  const line = winLine(b.cells, x, y, side + 1);
  if (line) {
    b.over = true; b.winner = side; b.line = line;
    b.hold = OVER_HOLD;
    b.note = `${TEAM_NAME[side]} 편이 이겼다`;
    return true;
  }
  if (b.moves.length >= N * N) {
    b.over = true; b.winner = null; b.line = null;
    b.hold = OVER_HOLD;
    b.note = '판이 다 찼다 — 무승부';
    return true;
  }
  // **차례는 편 안에서도 돈다.** 방금 둔 편의 다음 사람에게 넘기고, 편을 바꾼다.
  b.seat[side] = (b.seat[side] ?? 0) + 1;
  b.turn = side === 0 ? 1 : 0;
  b.think = THINK;
  return true;
}

function freshBag() {
  return {
    cells: new Array(N * N).fill(0),      // 0 빈 칸 · 1 검정 · 2 하양
    moves: [],
    turn: 0,                              // 검정이 먼저 (오목의 규칙)
    seat: [0, 0],                         // 편마다 누구 차례인가
    aim: { x: (N / 2) | 0, y: (N / 2) | 0 },
    /// **차례인 사람이 재고 있는 칸.** 모두가 같은 것을 본다 — `aim` 과 절대 섞지 않는다
    /// (섞으면 꾸러미가 손님의 제 커서를 덮어써서 남이 내 커서를 끌고 다닌다).
    turnAim: null,                        // { x, y, id } — 방장이 정하고 모두에게 보낸다
    turnGlide: null,                      // 그려지는 자리. 칸 사이를 미끄러진다
    aimOf: new Map(),                     // 방장만: id → { x, y, at } 손님이 알려온 커서
    told: 0,                              // 손님이 제 커서를 알려준 지 얼마
    held: 0, rep: 0,
    last: null, lastBy: null, mark: null, line: null,
    over: false, winner: null, hold: 0,
    note: null, say: null, sayT: 0,
    think: THINK,
    sides: new Map(),
    fresh: true, sentAt: -9,
  };
}

// ── 판 그리기 ─────────────────────────────────────────────────────────────

/// 판이 화면 어디에 얼마나 크게 놓이나.
export function layout(world) {
  const w = world.w ?? 1200, h = world.h ?? 800;
  // 위쪽 100px 은 차례를 적는 자리, 아래 60px 은 사람이 서는 자리.
  const room = Math.min(w - 300, h - 190);
  // 열아홉 줄이라 칸이 작아진다. 작은 창에서도 판이 통째로 보이는 쪽을 고른다 —
  // 칸이 커서 판이 잘리면 둘 자리가 화면 밖으로 나간다.
  const step = Math.max(11, room / (N - 1));
  const size = step * (N - 1);
  return { x: (w - size) / 2, y: 104 + (h - 190 - size) / 2, step, size };
}

const cellAt = (L, x, y) => [L.x + x * L.step, L.y + y * L.step];

/// 별점 — 진짜 바둑판에 찍혀 있는 아홉 점(화점). 눈이 자리를 세는 기준이 된다.
/// 열아홉 줄이면 4·10·16번째 줄, 곧 0부터 세어 3·9·15 다.
const STARS = [3, 9, 15];

function drawBoard(ctx, L, b) {
  // **판 뒤에 아주 옅은 바닥 한 장.** 벽지가 줄 사이로 그대로 비치면 벽지 무늬와 줄이
  // 섞여서 눈이 아프다 — 줄을 아무리 옅게 해도 그건 안 없어진다. 바닥이 한 겹 깔리면
  // 줄은 오히려 더 옅게 그어도 읽힌다. 진한 흰 판이 아니라 **비치는 한 겹**이다.
  const pad = L.step * 0.8;
  const back = [[L.x - pad, L.y - pad], [L.x + L.size + pad, L.y - pad],
                [L.x + L.size + pad, L.y + L.size + pad], [L.x - pad, L.y + L.size + pad]];
  // sharp 를 안 주면 네 점을 곡선으로 이어서 **네모가 아니라 동그란 얼룩**이 된다.
  stroke(ctx, [...back, back[0]], { width: 1, color: BOARD_EDGE, fill: BOARD_BACK,
                                    alpha: 0.32, seed: 2, amp: 1.1, sharp: true, halo: false });
  // 줄은 **얇게.** 열아홉 줄이 다 굵으면 격자가 웅웅거린다. 흔들림(amp)도 줄인다 —
  // 긴 줄이 구불거리면 그 자체로 눈이 피로하다.
  for (let i = 0; i < N; i++) {
    const [x0, y0] = cellAt(L, 0, i), [x1] = cellAt(L, N - 1, i);
    stroke(ctx, [[x0, y0], [x1, y0]],
           { width: 0.8, color: PENCIL, seed: 10 + i, amp: 0.2, alpha: 0.46, haloWidth: 2 });
    const [ax, ay] = cellAt(L, i, 0), [, by] = cellAt(L, i, N - 1);
    stroke(ctx, [[ax, ay], [ax, by]],
           { width: 0.8, color: PENCIL, seed: 40 + i, amp: 0.2, alpha: 0.46, haloWidth: 2 });
  }
  // 네 귀퉁이는 조금 더 진하게 — 판이 어디까지인지는 알아야 한다.
  const edge = [[L.x, L.y], [L.x + L.size, L.y], [L.x + L.size, L.y + L.size], [L.x, L.y + L.size]];
  stroke(ctx, [...edge, edge[0]],
         { width: 1.1, color: PENCIL, seed: 9, amp: 0.25, alpha: 0.6, sharp: true, haloWidth: 3 });
  for (const sy of STARS) for (const sx of STARS) {
    const [px, py] = cellAt(L, sx, sy);
    circle(ctx, px, py, 2.2, { width: 1.1, color: PENCIL, fill: PENCIL,
                               alpha: 0.5, seed: 70 + sx * 3 + sy, amp: 0.2 });
  }
}

function drawStones(ctx, L, b, time, world) {
  const r = L.step * 0.42;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = b.cells[y * N + x];
      if (!v) continue;
      const [px, py] = cellAt(L, x, y);
      const side = v - 1;
      // **돌에도 후광을 두른다.** 검은 돌을 어두운 벽지 위에 그냥 그리면 안 보인다 —
      // 종이색 테를 한 겹 두르면 흰 벽지에서는 안 보이고 검은 벽지에서는 돌이 된다.
      circle(ctx, px, py, r, {
        width: 2, color: STONE_EDGE[side], fill: STONE_FILL[side],
        seed: 100 + y * N + x, amp: 0.4, halo: true,
      });
      // 하양 돌에 **왼쪽 위 빛** 한 점. 종이 위에서 하양 돌은 그냥 빈 동그라미로 보이는데,
      // 이 점 하나로 「놓인 돌」이 된다.
      if (side === 1) {
        circle(ctx, px - r * 0.3, py - r * 0.32, r * 0.22, {
          width: 1.1, color: PENCIL, halo: false, alpha: 0.5, seed: 400 + y * N + x, amp: 0.2,
        });
      }
    }
  }
  // **마지막 수.** 어디에 뒀는지 모르면 다음 수를 생각할 수가 없다 — 특히 남이 둔 수는
  // 눈앞에서 놓이는 것을 못 보니 **판이 바뀐 것조차 모른다.** 그래서 두 겹으로 남긴다:
  // 놓인 뒤 2.5초 동안은 고리가 퍼지며 크게, 그 뒤로는 작은 점으로 다음 수까지 계속.
  if (b.last) {
    const [px, py] = cellAt(L, b.last[0], b.last[1]);
    const age = b.mark ?? 99;
    if (age < MARK_LOUD) {
      const k = age / MARK_LOUD;
      // 퍼지는 고리 — 눈이 저절로 그리로 간다.
      circle(ctx, px, py, r * (1.1 + k * 1.5),
             { width: 2.4 * (1 - k), color: RED, halo: false, seed: 11, amp: 0.5, alpha: 1 - k });
      circle(ctx, px, py, r * 0.95,
             { width: 2.6, color: RED, halo: false, seed: 12, amp: 0.4, alpha: 0.9 - k * 0.5 });
      // 누가 둔 자리인가. 내 편이 둔 것과 상대가 둔 것은 뜻이 다르다.
      const foe = b.lastBy !== null && b.lastBy !== side0(world);
      text(ctx, foe ? '상대가 둔 자리' : '방금 둔 자리', px, py - r * 2.2 - 4,
           { font: `800 12px ${HAN}`, color: RED, align: 'center', halo: 3, alpha: 1 - k * 0.8 });
    }
    if (!b.over) {
      circle(ctx, px, py, r * 0.42, { width: 2.2, color: RED, halo: false, seed: 9, amp: 0.3,
                                      alpha: 0.6 + 0.25 * Math.sin(time * 4) });
    }
  }
  // 이긴 줄 — 다섯을 가로질러 긋는다.
  if (b.line?.length >= 2) {
    const a = cellAt(L, b.line[0][0], b.line[0][1]);
    const c = cellAt(L, b.line[b.line.length - 1][0], b.line[b.line.length - 1][1]);
    stroke(ctx, [a, c], { width: 4, color: RED, seed: 8, amp: 1.2, alpha: 0.85 });
  }
}

/// 네 귀퉁이 갈고리. **닫힌 네모와 달라 보이는 것이 요점**이다 — 색이나 옅기로만 나누면
/// 어두운 벽지에서는 둘이 같아 보인다. 모양이 다르면 한눈에 갈린다.
function corners(ctx, px, py, r, o) {
  const k = r * 0.52;
  const arms = [
    [[px - r, py - r + k], [px - r, py - r], [px - r + k, py - r]],
    [[px + r - k, py - r], [px + r, py - r], [px + r, py - r + k]],
    [[px + r, py + r - k], [px + r, py + r], [px + r - k, py + r]],
    [[px - r + k, py + r], [px - r, py + r], [px - r, py + r - k]],
  ];
  arms.forEach((arm, i) => stroke(ctx, arm, { ...o, seed: 60 + i, sharp: true }));
}

/// **차례인 사람이 재고 있는 칸.** 방장이 모아서 모두에게 보낸 것이라 온 화면이 같은 자리를
/// 가리킨다 — 남의 차례에 판이 멎어 보이지 않게 하는 것이 이것 하나다.
///
/// 내 차례일 때는 이걸 그리지 않는다. 그때 차례인 사람은 나이고, 내 커서(`drawAim`)가
/// 왕복 없이 곧바로 움직이니 그쪽이 더 정확하다. **그래서 이 커서와 「내 차례 커서」는
/// 절대 같이 나오지 않는다** — 둘을 헷갈릴 일이 없다는 뜻이다.
function drawTurnAim(ctx, L, world, b, time) {
  if (b.over || world.state !== 'play') return;
  const g = b.turnGlide;
  if (!g) return;
  const who = whoseTurn(world);
  if (!who || who.mine) return;                  // 내 차례면 아래 drawAim 이 그린다
  const side = b.turn;
  const [px, py] = cellAt(L, g.x, g.y);
  const r = L.step * 0.5;
  const tint = TEAM_INK[side];
  const puls = 0.65 + 0.35 * Math.sin(time * 5);
  // 닫힌 네모 — 「지금 놓을 수 있는 사람」의 표시다.
  const box = [[px - r, py - r], [px + r, py - r], [px + r, py + r], [px - r, py + r]];
  stroke(ctx, [...box, box[0]], { width: 2.2, color: tint, seed: 6, amp: 0.6,
                                  alpha: puls, sharp: true, halo: true });
  // **누구 커서인지 적는다.** 한 편에 여럿이 서면 편 색만으로는 누구인지 모른다.
  text(ctx, who.name ?? '상대', px, py - r - 6,
       { font: `800 11px ${HAN}`, color: tint, align: 'center', halo: 3, alpha: 0.9 });
  // 놓일 돌을 아주 옅게 비쳐 둔다 — 어떤 모양이 될지 같이 본다.
  // **칸은 미끄러지는 자리가 아니라 닿을 자리로 본다** — 미끄러지는 동안 옆 칸을 보면
  // 돌이 깜빡인다. (꾸러미가 커서를 지운 바로 그 프레임에는 glide 만 남아 있다.)
  const cell = b.turnAim;
  if (cell && !b.cells[cell.y * N + cell.x]) {
    circle(ctx, px, py, L.step * 0.42, {
      width: 1.3, color: STONE_EDGE[side], fill: STONE_FILL[side],
      alpha: 0.24, seed: 7, amp: 0.3, halo: false,
    });
  }
}

/// 내 커서. **두 모양으로 그린다.**
///
/// - 내 차례 → **닫힌 네모 + 맥박 + 놓을 돌 미리보기.** 지금 누르면 놓인다.
/// - 내 차례 아님 → **네 귀퉁이 갈고리만.** 움직이기는 하지만 지금 눌러도 안 놓인다.
///
/// 옅기만 달리하면 어두운 벽지에서 둘이 같아 보인다 — 그래서 **모양**을 달리한다.
/// 내 차례가 아닐 때도 또렷이 보여야 한다(이 앱은 남의 바탕화면 위에 그려진다).
function drawAim(ctx, L, world, b, time) {
  if (b.over || world.state !== 'play' || world.mp.waiting) return;
  const mine = myTurn(world);
  const [px, py] = cellAt(L, b.aim.x, b.aim.y);
  const r = L.step * 0.5;
  const side = world.team ?? 0;
  const tint = TEAM_INK[side];
  if (mine) {
    const box = [[px - r, py - r], [px + r, py - r], [px + r, py + r], [px - r, py + r]];
    stroke(ctx, [...box, box[0]], { width: 2.4, color: tint, seed: 6, amp: 0.6,
                                    alpha: 0.75 + 0.25 * Math.sin(time * 5),
                                    sharp: true, halo: true });
  } else {
    // 갈고리만. 맥박도 없다 — 맥박은 「네가 누를 차례」라는 뜻으로 아껴 둔다.
    corners(ctx, px, py, r, { width: 2, color: tint, alpha: 0.62, amp: 0.5, halo: true });
  }
  // 내 차례면 **놓을 돌을 옅게 비쳐 둔다.** 다음 수가 어떤 모양이 되는지 눈으로 본다.
  if (mine && !b.cells[b.aim.y * N + b.aim.x] && !forbidden(b.cells, b.aim.x, b.aim.y, side + 1)) {
    circle(ctx, px, py, L.step * 0.42, {
      width: 1.6, color: STONE_EDGE[side], fill: STONE_FILL[side],
      alpha: 0.4, seed: 7, amp: 0.3,
    });
  }
  // **금수 자리는 미리 알려 준다.** 눌러 보고 나서야 알면 늦다.
  if (mine && !b.cells[b.aim.y * N + b.aim.x]) {
    const no = forbidden(b.cells, b.aim.x, b.aim.y, (world.team ?? 0) + 1);
    if (no) {
      text(ctx, no, px, py - r - 6,
           { font: `800 12px ${HAN}`, color: RED, align: 'center', halo: 3 });
      stroke(ctx, [[px - r * 0.5, py - r * 0.5], [px + r * 0.5, py + r * 0.5]],
             { width: 2, color: RED, seed: 3, amp: 0.4, halo: false, alpha: 0.75 });
      stroke(ctx, [[px + r * 0.5, py - r * 0.5], [px - r * 0.5, py + r * 0.5]],
             { width: 2, color: RED, seed: 2, amp: 0.4, halo: false, alpha: 0.75 });
    }
  }
  // 놓을 자리가 이미 찼으면 가위표.
  if (b.cells[b.aim.y * N + b.aim.x] && mine) {
    stroke(ctx, [[px - r * 0.5, py - r * 0.5], [px + r * 0.5, py + r * 0.5]],
           { width: 2, color: RED, seed: 5, amp: 0.4, halo: false, alpha: 0.8 });
    stroke(ctx, [[px + r * 0.5, py - r * 0.5], [px - r * 0.5, py + r * 0.5]],
           { width: 2, color: RED, seed: 4, amp: 0.4, halo: false, alpha: 0.8 });
  }
}

/// 판 양옆에 선 사람들. **N:N 이라 누가 몇 번째인지가 보여야 한다** —
/// 지금 둘 사람 위에 화살표를 찍는다.
function drawCrew(ctx, world, b, time, boil) {
  const L = layout(world);
  const who = whoseTurn(world);
  [0, 1].forEach((side) => {
    const seats = seatsOf(world, side);
    const baseX = side === 0 ? L.x - 74 : L.x + L.size + 74;
    seats.forEach((s, i) => {
      const y = L.y + 76 + i * 92;      // 기술표·차례 쪽지와 안 겹치게 내려 세운다
      const p = {
        x: baseX, groundY: y, air: 0, vx: 0, vy: 0, facing: side === 0 ? 1 : -1,
        walk: 0, crouch: 0, dead: false, deadFor: 0, danger: false,
        grabbing: -1, heldBy: -1, grabAim: 0, slide: 0, swing: 0, toss: 0, block: 0,
      };
      drawStickman(ctx, p, time, boil, {
        color: TEAM_INK[side], name: s.mine ? '나' : (s.name ?? null), mine: s.mine,
      });
      // 이 사람이 **어느 돌**인가. 사람 색(빨강·파랑)과 돌 색(흑백)은 따로다 —
      // 사람은 서로 가려야 하고, 돌은 오목이라 흑백이라야 한다.
      circle(ctx, baseX, y - 96, 8, { width: 1.8, color: STONE_EDGE[side],
                                      fill: STONE_FILL[side], seed: 5 + i, amp: 0.3 });
      // 지금 둘 사람을 가리킨다. **머리 위가 아니라 판 쪽 옆구리**에 — 위에는 이름이 있다.
      if (who && who.id === s.id && !b.over) {
        text(ctx, side === 0 ? '▶' : '◀', baseX + (side === 0 ? 34 : -34), y - 52,
             { font: `800 16px ${HAN}`, color: TEAM_INK[side], align: 'center', halo: 3,
               alpha: 0.55 + 0.45 * Math.sin(time * 5) });
      }
    });
  });
}

const KEY_ROWS = [
  ['⌥ ← → ↑ ↓', '자리 고르기 (꾹 누르면 계속)'],
  ['⌥ Space', '놓는다'],
  ['⌥ M', '편 바꾸기 · 다시 시작'],
  ['검정 금수', '삼삼 · 사사 · 장목'],
  // 커서가 남에게 보인다는 것은 **말해 줘야 한다.** 모르고 재고 다니면 속은 셈이 된다.
  ['차례인 사람 커서', '모두에게 보인다'],
];

export default {
  id: 'omok',
  name: '오목',
  line: '검정 편 대 하양 편. 다섯 줄을 먼저 이으면 이긴다. 검정은 삼삼·사사·장목을 못 둔다. 여럿이면 편 안에서 차례가 돈다.',
  keys: [
    ['⌥ ← → ↑ ↓', '놓을 자리 고르기 — 꾹 누르면 계속 간다'],
    ['⌥ Space', '거기에 놓는다'],
    ['금수 (검정만)', '삼삼 · 사사 · 장목 — 먼저 두는 값이다'],
  ],
  tally: (world) => {
    const b = world.bag;
    return b?.over ? (b.winner === null ? '무승부' : `${TEAM_NAME[b.winner]} 승`)
                   : `${b?.moves?.length ?? 0}수`;
  },

  /// 달리지도 뛰지도 붙잡지도 않는다. ⌥Space 는 이 게임이 가져간다.
  noGrab: true,
  noClock: true,
  noResults: true,
  noGround: true,
  teamNames: TEAM_NAME,
  /// 사람은 이 게임이 판 옆에 그린다 — 엔진이 그리면 판 한가운데를 가로질러 선다.
  figure: () => {},
  shirt: (world, x, id) => TEAM_INK[id < 0 ? -1 - id : (world.bag?.sides?.get(id) ?? 0)],
  /// 혼자서도 된다 — 빈 편은 컴퓨터가 둔다.
  blocked: () => null,
  /// **고르는 순간 방을 연다.** 혼자서도 되지만 둘이 두는 게 본디 모습이다.
  opensRoom: true,
  /// **판 도중에 들어와도 바로 낀다.** 차례가 돌아오면 그때부터 두면 된다 —
  /// 오목은 한 수가 곧 한 차례라 도중에 껴도 불공평할 것이 없다.
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
    // 손님은 **부탁만** 한다. 맞바꾸기는 방장이 정한다 — 손님이 제 화면에서 바꿔 놓으면
    // 방장이 뿌리는 명단에 곧 덮여서, 편이 잠깐 깜빡였다 돌아온다.
    if (world.mp.on && world.mp.role === 'guest') {
      (shell?.net?.send ?? world.send)?.({ t: 'gm', s: want });
      return;
    }
    takeSide(world, world.mp.myId, want);
    if (world.mp.on) (shell?.net?.send ?? world.send)?.({ t: 'gm', s: world.team });
  },
  begin(world) { Object.assign(world.bag, freshBag()); },
  fresh: freshBag,

  /// 방향키를 **누른 순간** 한 칸. 꾹 누르고 있는 동안은 update 가 이어서 옮긴다.
  tap(world, key) {
    const b = world.bag;
    if (b.over || world.mp.waiting) return;
    const step = { left: [-1, 0], right: [1, 0], jump: [0, -1], duck: [0, 1] }[key];
    if (!step) return;
    b.aim.x = clamp(b.aim.x + step[0], 0, N - 1);
    b.aim.y = clamp(b.aim.y + step[1], 0, N - 1);
    b.held = 0; b.rep = 0;
  },

  /// ⌥Space — 거기에 놓는다.
  action(world) {
    const b = world.bag;
    if (world.state !== 'play' || b.over) return;
    if (!myTurn(world)) { say(b, '내 차례가 아니다'); return; }
    if (b.cells[b.aim.y * N + b.aim.x]) { say(b, '거기엔 이미 돌이 있다'); return; }
    const no = forbidden(b.cells, b.aim.x, b.aim.y, (world.team ?? 0) + 1);
    if (no) { say(b, `${no} — 검정은 거기 못 둔다`); return; }
    if (world.mp.role === 'guest') {
      world.send?.({ t: 'gm', k: 'put', x: b.aim.x, y: b.aim.y });
      return;
    }
    put(world, b.aim.x, b.aim.y, world.team ?? 0);
  },

  update(world, dt) {
    const b = world.bag;
    if (b.say) { b.sayT += dt; if (b.sayT > 1.2) b.say = null; }
    if (b.mark !== null && b.mark < 99) b.mark += dt;    // 방금 둔 자리가 사그라드는 시계
    if (b.foul) { b.foul.t += dt; if (b.foul.t > 1.4) b.foul = null; }
    if (world.state !== 'play') return;
    if (world.mp.role === 'host') {
      b.sides = rosterSides(world);
      const mine = b.sides.get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) world.team = mine;
    }

    // 커서를 꾹 누르고 있으면 이어서 간다.
    if (!b.over && !world.mp.waiting) {
      const dx = (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0);
      const dy = (world.input.duck ? 1 : 0) - (world.input.jump ? 1 : 0);
      if (dx || dy) {
        b.held += dt;
        if (b.held >= REPEAT_WAIT) {
          b.rep += dt;
          while (b.rep >= REPEAT_EVERY) {
            b.rep -= REPEAT_EVERY;
            b.aim.x = clamp(b.aim.x + dx, 0, N - 1);
            b.aim.y = clamp(b.aim.y + dy, 0, N - 1);
          }
        }
      } else { b.held = 0; b.rep = 0; }
    }

    // **내 차례면 내가 재는 칸을 알려 준다.** 차례인 사람이 어디를 보고 있는지 남들이
    // 못 보면, 남의 차례에는 판이 멎어 있어서 「끊긴 건가」 싶다. 알까기에서 쓴 수법 그대로
    // 초당 열 번이면 넉넉하다 — 커서는 0.075초에 한 칸이니 60번 보낼 값이 아니다.
    // **내 차례가 아닐 때는 안 보낸다** — 그건 내 화면에만 있는 내 커서다(아래 참조).
    if (world.mp.on && world.mp.role === 'guest' && myTurn(world)) {
      b.told += dt;
      if (b.told >= AIM_TELL) {
        b.told = 0;
        world.send?.({ t: 'gm', k: 'aim', x: b.aim.x, y: b.aim.y });
      }
    } else {
      b.told = AIM_TELL;                        // 차례가 오면 첫 칸을 곧바로 알린다
    }

    // **방장이 「차례인 사람의 커서」를 하나로 모은다.** 제 차례면 제 커서를, 손님 차례면
    // 손님이 알려온 것을. 컴퓨터 차례면 없다.
    if (world.mp.role !== 'guest') {
      const who = whoseTurn(world);
      if (!who || b.over) b.turnAim = null;
      else if (who.mine) b.turnAim = { x: b.aim.x, y: b.aim.y, id: who.id };
      else {
        const told = b.aimOf.get(who.id);
        // 굳어 버린 커서는 지운다 — 앱이 멈춘 사람의 커서가 남의 자리를 가리키고 있으면
        // 그건 알려 주는 것이 아니라 거짓말이다.
        b.turnAim = told && world.elapsed - told.at < AIM_STALE
          ? { x: told.x, y: told.y, id: who.id } : null;
      }
    }

    glideAim(b, dt);

    if (world.mp.role === 'guest') return;      // 판은 방장 것이다

    if (b.over) {
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

    // **그 편에 사람이 없으면 컴퓨터가 둔다.** 혼자서도 끝까지 둘 수 있어야 한다.
    if (!whoseTurn(world)) {
      b.think -= dt;
      if (b.think <= 0) {
        const [x, y] = bestSpot(b.cells, b.turn + 1);
        put(world, x, y, b.turn);
      }
    }
  },

  draw(ctx, world, time, boil, upright) {
    const b = world.bag;
    if (!b?.cells) return;
    const L = layout(world);
    drawBoard(ctx, L, b);
    drawStones(ctx, L, b, time, world);
    // 남의 커서를 먼저, 내 커서를 그 위에 — 겹치면 내가 쥔 것이 위에 있어야 한다.
    drawTurnAim(ctx, L, world, b, time);
    drawAim(ctx, L, world, b, time);
    drawCrew(ctx, world, b, time, boil);
  },

  hud(ctx, world, time) {
    const b = world.bag;
    if (!b?.cells) return;
    // 기술표 — 왼쪽 위 구석에 작게. 메뉴를 안 열어도 보이게.
    const x = 16, y = 14, lh = 15;
    paperScrap(ctx, x, y, 226, 14 + KEY_ROWS.length * lh, 17);
    KEY_ROWS.forEach(([key, name], i) => {
      const ly = y + 20 + i * lh;
      text(ctx, key, x + 12, ly, { font: `700 10px ${HAN}`, color: INK, halo: 0, alpha: 0.75 });
      text(ctx, name, x + 96, ly, { font: `600 10px ${HAN}`, color: PENCIL, halo: 0, alpha: 0.7 });
    });

    if (world.state !== 'play') return;
    // 차례 — 가운데 위. **누구 차례인지가 이 게임의 전부**라 제일 큰 글자다.
    const who = whoseTurn(world);
    const line = b.over
      ? (b.note ?? '')
      : who
        ? `${TEAM_NAME[b.turn]} — ${who.mine ? '내 차례' : (who.name ?? '상대')}`
        : `${TEAM_NAME[b.turn]} — 컴퓨터`;
    ctx.font = `800 17px ${HAN}`;
    const wide = Math.max(180, ctx.measureText(line).width + 60);
    paperScrap(ctx, world.w / 2 - wide / 2, 14, wide, 54, 9);
    text(ctx, line, world.w / 2, 37,
         { font: `800 17px ${HAN}`, color: b.over ? RED : INK, align: 'center', halo: 0 });
    // 지금 두는 돌을 글자 옆에 하나 그려 둔다 — 「검정」이라고 읽는 것보다 빠르다.
    if (!b.over) {
      const sx = world.w / 2 - wide / 2 + 20;
      circle(ctx, sx, 32, 9, { width: 2, color: STONE_EDGE[b.turn], fill: STONE_FILL[b.turn],
                               seed: 3, amp: 0.3 });
    }
    text(ctx, `${b.moves.length}수`, world.w / 2, 57,
         { font: `600 12px ${MONO}`, color: PENCIL, align: 'center', halo: 0 });
    // 「내 차례가 아니다」 같은 한 줄.
    if (b.say) {
      text(ctx, b.say, world.w / 2, world.h - 26,
           { font: `800 15px ${HAN}`, color: RED, align: 'center', halo: 4,
             alpha: clamp(1 - (b.sayT - 0.9) / 0.3, 0, 1) });
    }
  },

  /// 손님이 보내오는 말. 방장만 듣는다.
  message(world, from, msg) {
    if (world.mp.role !== 'host') return;
    const b = world.bag;
    if (typeof msg.s === 'number') { takeSide(world, from, msg.s ? 1 : 0); return; }
    if (world.state !== 'play' || b.over) return;
    // 손님이 「여기를 재고 있다」고 알려온 것. **차례인 사람 것만 받는다** — 아니면
    // 아무나 남의 차례에 온 화면의 커서를 끌고 다닐 수 있다.
    if (msg.k === 'aim') {
      const turnNow = whoseTurn(world);
      if (!turnNow || turnNow.id !== from) return;
      b.aimOf.set(from, { x: clamp(msg.x | 0, 0, N - 1), y: clamp(msg.y | 0, 0, N - 1),
                          at: world.elapsed });
      return;
    }
    if (msg.k !== 'put') return;
    const side = b.sides?.get(from) ?? 0;
    // **차례인 사람이 보낸 것만 받는다.** 안 보면 손님이 아무 때나 둘 수 있다.
    const who = whoseTurn(world);
    if (!who || who.id !== from || side !== b.turn) return;
    put(world, clamp(msg.x | 0, 0, N - 1), clamp(msg.y | 0, 0, N - 1), side);
  },

  pack(world) {
    const b = world.bag;
    const fresh = b.fresh;
    b.fresh = false;
    // **판은 한 수마다, 그리고 0.6초마다 한 번 더 보낸다.** 한 번만 보내면 그 한 번을
    // 놓친 사람(판 도중에 들어온 손님)은 빈 판을 보고 앉아 있게 된다.
    const again = !fresh && world.elapsed - (b.sentAt ?? -9) >= 0.6;
    if (fresh || again) b.sentAt = world.elapsed;
    return {
      tm: [...rosterSides(world).entries()],
      t: b.turn,
      st: [b.seat[0] ?? 0, b.seat[1] ?? 0],
      n: b.moves.length,
      o: b.over ? 1 : 0,
      wn: b.winner === 0 || b.winner === 1 ? b.winner : -1,
      nt: b.note ?? null,
      ls: b.last ?? null,
      lb: b.lastBy === 0 || b.lastBy === 1 ? b.lastBy : -1,
      ln: b.line ?? null,
      // **차례인 사람의 커서.** 매 꾸러미에 싣는다 — 이건 「움직이는 중」을 보이는 것이라
      // 늦게 오면 뜻이 없다. 세 숫자뿐이라 실어도 가볍다.
      ca: b.turnAim ? [b.turnAim.x, b.turnAim.y, b.turnAim.id] : null,
      mv: fresh || again ? b.moves : undefined,
    };
  },

  unpack(world, data) {
    const b = world.bag;
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.tm)) {
      b.sides = new Map(data.tm.filter((r) => Array.isArray(r) && r.length === 2));
      const mine = b.sides.get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) world.team = mine;
    }
    if (Array.isArray(data.mv) && data.mv.every(Number.isFinite)) {
      b.moves = data.mv.slice(0, N * N);
      b.cells = new Array(N * N).fill(0);
      b.moves.forEach((cell, i) => {
        if (cell >= 0 && cell < N * N) b.cells[cell] = (i % 2) + 1;
      });
    }
    if (Number.isFinite(data.t)) b.turn = data.t ? 1 : 0;
    if (Array.isArray(data.st) && data.st.every(Number.isFinite)) b.seat = [data.st[0], data.st[1]];
    b.over = !!data.o;
    b.winner = data.wn === 0 || data.wn === 1 ? data.wn : null;
    if (typeof data.nt === 'string' || data.nt === null) b.note = data.nt;
    const was = b.last;
    b.last = Array.isArray(data.ls) && data.ls.length === 2 ? data.ls : null;
    // **새 수가 왔으면 시계를 되감는다.** 손님은 남이 두는 것을 눈앞에서 못 보니,
    // 여기서 안 알려 주면 판이 언제 바뀌었는지 알 길이 없다.
    if (b.last && (!was || was[0] !== b.last[0] || was[1] !== b.last[1])) b.mark = 0;
    if (Number.isFinite(data.lb)) b.lastBy = data.lb === 0 || data.lb === 1 ? data.lb : null;
    b.line = Array.isArray(data.ln) ? data.ln : null;
    // **차례인 사람의 커서는 `turnAim` 으로만 받는다.** `b.aim` 은 건드리지 않는다 —
    // 거기에 넣으면 남이 내 커서를 끌고 다니고, 내 차례가 왔을 때 엉뚱한 칸에서 시작한다.
    b.turnAim = Array.isArray(data.ca) && data.ca.length === 3 && data.ca.every(Number.isFinite)
      ? { x: clamp(data.ca[0], 0, N - 1), y: clamp(data.ca[1], 0, N - 1), id: data.ca[2] }
      : null;
  },
};

function say(b, text) { b.say = text; b.sayT = 0; }

export { N, WIN, TEAM_NAME, TEAM_INK };
