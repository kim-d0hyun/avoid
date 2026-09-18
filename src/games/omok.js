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
const TEAM_NAME = ['검정', '하양'];
const HAN = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const MONO = '"American Typewriter", "Courier New", monospace';

/// 커서를 **누르고 있을 때** 얼마나 기다렸다가, 얼마 만에 한 칸씩 더 가나.
/// 누른 그 순간 한 칸은 tap 이 옮긴다 — 한 칸만 옮기려는데 서너 칸 가면 못 쓴다.
const REPEAT_WAIT = 0.34, REPEAT_EVERY = 0.075;
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
  // **판은 아주 옅게.** 몰래 하는 게임이다 — 화면에서 제일 큰 것이 바둑판인데, 그게 진하면
  // 옆에서 지나가는 사람 눈에 제일 먼저 걸린다. 종이 바닥도 깔지 않는다(바탕이 곧 종이다).
  // 진해야 하는 것은 **돌**뿐이다. 돌만 보이면 판은 눈이 알아서 잇는다.
  for (let i = 0; i < N; i++) {
    const [x0, y0] = cellAt(L, 0, i), [x1] = cellAt(L, N - 1, i);
    stroke(ctx, [[x0, y0], [x1, y0]],
           { width: 0.9, color: PENCIL, seed: 10 + i, amp: 0.4, alpha: 0.26, halo: false });
    const [ax, ay] = cellAt(L, i, 0), [, by] = cellAt(L, i, N - 1);
    stroke(ctx, [[ax, ay], [ax, by]],
           { width: 0.9, color: PENCIL, seed: 40 + i, amp: 0.4, alpha: 0.26, halo: false });
  }
  // 네 귀퉁이만 조금 진하게 — 판이 어디까지인지는 알아야 한다.
  const edge = [[L.x, L.y], [L.x + L.size, L.y], [L.x + L.size, L.y + L.size], [L.x, L.y + L.size]];
  stroke(ctx, [...edge, edge[0]],
         { width: 1.1, color: PENCIL, seed: 9, amp: 0.4, alpha: 0.4, sharp: true, halo: false });
  for (const sy of STARS) for (const sx of STARS) {
    const [px, py] = cellAt(L, sx, sy);
    circle(ctx, px, py, 2.2, { width: 1.2, color: PENCIL, fill: PENCIL, halo: false,
                               alpha: 0.34, seed: 70 + sx * 3 + sy, amp: 0.2 });
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
      circle(ctx, px, py, r, {
        width: 2, color: STONE_EDGE[side], fill: STONE_FILL[side],
        seed: 100 + y * N + x, amp: 0.4, halo: false,
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

/// 내 커서. **내 화면에만 보인다** — 남이 어디를 재고 있는지까지 보이면 수싸움이 없어진다.
function drawAim(ctx, L, world, b, time) {
  if (b.over || world.state !== 'play' || world.mp.waiting) return;
  const mine = myTurn(world);
  const [px, py] = cellAt(L, b.aim.x, b.aim.y);
  const r = L.step * 0.5;
  const side = world.team ?? 0;
  const tint = mine ? TEAM_INK[side] : PENCIL;
  const puls = mine ? 0.7 + 0.3 * Math.sin(time * 5) : 0.3;
  const box = [[px - r, py - r], [px + r, py - r], [px + r, py + r], [px - r, py + r]];
  stroke(ctx, [...box, box[0]], { width: 2, color: tint, seed: 6, amp: 0.6,
                                  alpha: puls, sharp: true, halo: false });
  // 내 차례면 **놓을 돌을 옅게 비쳐 둔다.** 다음 수가 어떤 모양이 되는지 눈으로 본다.
  if (mine && !b.cells[b.aim.y * N + b.aim.x] && !forbidden(b.cells, b.aim.x, b.aim.y, side + 1)) {
    circle(ctx, px, py, L.step * 0.42, {
      width: 1.6, color: STONE_EDGE[side], fill: STONE_FILL[side],
      alpha: 0.4, seed: 7, amp: 0.3, halo: false,
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
                                      fill: STONE_FILL[side], seed: 5 + i, amp: 0.3, halo: false });
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
    world.team = side === undefined ? 1 - (world.team ?? 0) : (side ? 1 : 0);
    picks(world).set(world.mp.myId, world.team);
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
                               seed: 3, amp: 0.3, halo: false });
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
    if (typeof msg.s === 'number') { picks(world).set(from, msg.s ? 1 : 0); return; }
    if (world.state !== 'play' || b.over) return;
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
  },
};

function say(b, text) { b.say = text; b.sayT = 0; }

export { N, WIN, TEAM_NAME, TEAM_INK };
