// 오목 — 판 · 놓기 · 다섯 줄 · 차례(N:N) · 커서 · 컴퓨터 · 꾸러미.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const { games } = await import(R + 'games/index.js');
const omok = games.find((g) => g.id === 'omok');
const mod = await import(R + 'games/omok.js');
const { N, WIN, winLine, spotValue, bestSpot, put, whoseTurn, myTurn, seatsOf, layout, forbidden } = mod;

import { check, ok, say, note, done } from './check.mjs';

const FR = 1 / 60;
function mk(width = 1512, height = 944) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'omok');
  world.onRecord = () => {}; world.onGameOver = (r) => { world.ended = r; }; world.onMenu = () => {};
  w.resize(world, width, height);
  w.spread(world);
  world.state = 'play';
  return world;
}
/// 손님 하나를 방장 세상에 세운다.
function join(world, id, side) {
  world.mp.others.set(id, { id, name: `손${id}`, x: 0, groundY: 0, air: 0, vx: 0, vy: 0,
                            dead: false, waiting: false, deadFor: 0, facing: 1, walk: 0,
                            crouch: 0, grabbing: -1, heldBy: -1, grabAim: 0, slide: 0 });
  if (side !== undefined) (world.mp.omokSides ??= new Map()).set(id, side);
  w.update(world, FR);                        // 명단을 한 번 돌린다
  return world.mp.others.get(id);
}
const cells = (b) => b.cells;
const mark = (b, list, stone) => { for (const [x, y] of list) b.cells[y * N + x] = stone; };

say('판 — 열다섯 줄, 빈 판에서 검정이 먼저');
{
  const world = mk(); const b = world.bag;
  check('줄 수', N, 19);
  check('이기는 길이', WIN, 5);
  check('칸 수', b.cells.length, N * N);
  ok('처음엔 다 비어 있다', b.cells.every((v) => v === 0));
  check('검정이 먼저', b.turn, 0);
  check('커서는 한가운데', [b.aim.x, b.aim.y], [(N / 2) | 0, (N / 2) | 0]);
  const L = layout(world);
  ok('판이 화면 안에 들어간다', L.x > 0 && L.y > 0 && L.x + L.size < world.w && L.y + L.size < world.h);
  ok('칸이 손가락만큼은 된다', L.step >= 11);
}

say('다섯 줄 — 가로 · 세로 · 두 대각선');
{
  const b = mk().bag;
  // 가로
  mark(b, [[3, 5], [4, 5], [5, 5], [6, 5]], 1);
  ok('넷은 아직 아니다', !winLine(b.cells, 6, 5, 1));
  b.cells[5 * N + 7] = 1;
  const row = winLine(b.cells, 7, 5, 1);
  ok('다섯이면 이긴다', !!row && row.length === 5);
  // 세로
  const c = mk().bag;
  mark(c, [[2, 1], [2, 2], [2, 3], [2, 4], [2, 5]], 2);
  ok('세로도 센다', !!winLine(c.cells, 2, 3, 2));
  // ↘ 대각선
  const d = mk().bag;
  mark(d, [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]], 1);
  ok('↘ 대각선도 센다', !!winLine(d.cells, 3, 3, 1));
  // ↗ 대각선
  const e = mk().bag;
  mark(e, [[1, 9], [2, 8], [3, 7], [4, 6], [5, 5]], 2);
  ok('↗ 대각선도 센다', !!winLine(e.cells, 3, 7, 2));
  // 다른 편 돌이 끼면 안 된다
  const f = mk().bag;
  mark(f, [[1, 1], [2, 1], [4, 1], [5, 1], [6, 1]], 1);
  f.cells[1 * N + 3] = 2;
  ok('사이에 상대 돌이 있으면 아니다', !winLine(f.cells, 5, 1, 1));
  // 여섯도 이긴 것이다 (장목을 따로 벌하지 않는다 — 규칙을 단순하게 둔다)
  const g = mk().bag;
  mark(g, [[1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3]], 1);
  ok('여섯도 이긴 것', winLine(g.cells, 4, 3, 1).length >= 5);
  // 판 끝에서 넘어가지 않는다
  const h = mk().bag;
  mark(h, [[0, 0], [1, 0], [2, 0], [3, 0]], 1);
  ok('판 끝을 넘어 세지 않는다', !winLine(h.cells, 0, 0, 1));
}

say('놓기 — 빈 칸에만, 차례인 편만');
{
  const world = mk(); const b = world.bag;
  ok('검정이 둔다', put(world, 7, 7, 0));
  check('돌이 놓였다', b.cells[7 * N + 7], 1);
  check('차례가 넘어갔다', b.turn, 1);
  ok('같은 자리에 또 못 놓는다', !put(world, 7, 7, 1));
  ok('차례가 아닌 편은 못 놓는다', !put(world, 8, 8, 0));
  ok('판 밖에는 못 놓는다', !put(world, -1, 3, 1) && !put(world, 3, N, 1));
  ok('하양이 둔다', put(world, 8, 8, 1));
  check('수가 둘 쌓였다', b.moves.length, 2);
  check('다시 검정 차례', b.turn, 0);
}

say('이기면 거기서 멎는다');
{
  const world = mk(); const b = world.bag;
  for (let i = 0; i < 4; i++) { put(world, i, 0, 0); put(world, i, 5, 1); }
  ok('아직 안 끝났다', !b.over);
  put(world, 4, 0, 0);
  ok('다섯을 이으면 끝난다', b.over);
  check('이긴 편', b.winner, 0);
  check('이긴 줄이 다섯', b.line.length, 5);
  ok('끝난 뒤에는 못 놓는다', !put(world, 9, 9, 1));
  ok('끝났다고 적어 둔다', /검정/.test(b.note ?? ''));
}

say('차례는 편 안에서도 돈다 — N:N 이라 한 사람이 연달아 두지 않는다');
{
  // 검정 둘(1·3번), 하양 둘(2·4번). 번호 순으로 앉는다.
  const world = mk();
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1; world.team = 0;
  join(world, 2, 1); join(world, 3, 0); join(world, 4, 1);
  const b = world.bag;
  check('검정 편은 둘', seatsOf(world, 0).map((s) => s.id), [1, 3]);
  check('하양 편도 둘', seatsOf(world, 1).map((s) => s.id), [2, 4]);
  const order = [];
  for (let i = 0; i < 8; i++) {
    const who = whoseTurn(world);
    order.push(who.id);
    put(world, i, i % 2 ? 12 : 0, b.turn);     // 아무 데나, 다섯이 안 되게
  }
  check('검1 → 하1 → 검2 → 하2 … 로 돈다', order, [1, 2, 3, 4, 1, 2, 3, 4]);
  // 내 차례가 아니면 못 놓는다
  ok('지금은 1번 차례', whoseTurn(world).id === 1);
  ok('내(1번) 차례다', myTurn(world));
}

say('혼자면 컴퓨터가 상대한다');
{
  const world = mk(); world.team = 0;
  const b = world.bag;
  ok('하양 편에는 아무도 없다', !seatsOf(world, 1).length);
  put(world, 7, 7, 0);                          // 내가 한 수
  check('하양 차례', b.turn, 1);
  let f = 0;
  for (; f < 60 * 5 && b.moves.length < 2; f++) w.update(world, FR);
  ok('컴퓨터가 둔다', b.moves.length === 2);
  ok('생각하는 시늉을 한다 (바로 두지 않는다)', f > 10);
  check('다시 내 차례', b.turn, 0);
}

say('컴퓨터가 막을 것은 막고, 이길 수 있으면 이긴다');
{
  // 검정 넷이 나란히 열려 있다 — 하양이 안 막으면 진다
  const world = mk(); world.team = 1;            // 나는 하양, 검정은 컴퓨터
  const b = world.bag;
  mark(b, [[3, 7], [4, 7], [5, 7], [6, 7]], 1);
  b.moves = [7 * N + 3, 7 * N + 4, 7 * N + 5, 7 * N + 6];
  b.turn = 1;
  const spot = bestSpot(b.cells, 2);
  ok('넷을 막는다', (spot[0] === 2 || spot[0] === 7) && spot[1] === 7);
  // 제 돌 넷이 있으면 막기보다 이긴다
  const c = mk().bag;
  mark(c, [[3, 7], [4, 7], [5, 7], [6, 7]], 2);   // 하양 넷
  mark(c, [[3, 9], [4, 9], [5, 9], [6, 9]], 1);   // 검정도 넷
  const win = bestSpot(c.cells, 2);
  ok('이길 수 있으면 이긴다', win[1] === 7 && (win[0] === 2 || win[0] === 7));
  // 빈 판이면 한가운데
  const d = mk().bag;
  check('빈 판이면 한가운데', bestSpot(d.cells, 1), [(N / 2) | 0, (N / 2) | 0]);
}

say('자리 값 — 열린 셋이 막힌 셋보다 값지다');
{
  const b = mk().bag;
  mark(b, [[5, 5], [6, 5]], 1);
  const open = spotValue(b.cells, 7, 5, 1);
  const c = mk().bag;
  mark(c, [[5, 5], [6, 5]], 1);
  c.cells[5 * N + 4] = 2;                        // 한쪽이 막혔다
  const shut = spotValue(c.cells, 7, 5, 1);
  note(`열린 셋 ${open} · 한쪽 막힌 셋 ${shut}`);
  ok('열린 쪽이 값지다', open > shut);
  ok('찬 칸은 값이 없다', spotValue(b.cells, 5, 5, 1) < 0);
}

say('금수 — 검정만 삼삼 · 사사 · 장목을 못 둔다');
{
  const b = mk().bag;
  // 삼삼 — 가로 열린 삼과 세로 열린 삼이 한 점에서 만난다
  mark(b, [[5, 7], [6, 7]], 1);
  mark(b, [[7, 5], [7, 6]], 1);
  check('삼삼은 금수', forbidden(b.cells, 7, 7, 1), '삼삼');
  check('하양은 삼삼을 둬도 된다', forbidden(b.cells, 7, 7, 2), null);
  // 장목 — 여섯이 된다
  const c = mk().bag;
  mark(c, [[3, 7], [4, 7], [5, 7], [7, 7], [8, 7]], 1);
  check('장목은 금수', forbidden(c.cells, 6, 7, 1), '장목');
  // 다섯이 되면 금수가 아니다 — 오목이 먼저다
  const d = mk().bag;
  mark(d, [[3, 7], [4, 7], [5, 7], [6, 7]], 1);
  check('다섯은 언제나 된다', forbidden(d.cells, 7, 7, 1), null);
  // 사사 — 두 방향으로 「한 칸이면 다섯」이 동시에 생긴다
  const e = mk().bag;
  mark(e, [[4, 7], [5, 7], [6, 7]], 1);          // 가로 셋 (오른쪽에 두면 넷)
  mark(e, [[7, 4], [7, 5], [7, 6]], 1);          // 세로 셋
  const why = forbidden(e.cells, 7, 7, 1);
  note(`가로 셋 + 세로 셋이 만나는 자리 → ${why}`);
  ok('두 방향이 겹치면 금수', why === '사사' || why === '삼삼');
  // 그냥 한 줄이면 금수가 아니다
  const f = mk().bag;
  mark(f, [[5, 7], [6, 7]], 1);
  check('열린 삼 하나는 둬도 된다', forbidden(f.cells, 7, 7, 1), null);
  // 빈 판 한가운데도 당연히 된다
  check('빈 판은 아무 데나', forbidden(mk().bag.cells, 7, 7, 1), null);
}

say('금수 자리에는 놓이지 않는다');
{
  const world = mk(); const b = world.bag;
  mark(b, [[5, 7], [6, 7]], 1);
  mark(b, [[7, 5], [7, 6]], 1);
  b.moves = [0, 0, 0, 0];                        // 네 수 둔 셈
  b.turn = 0;
  ok('검정은 삼삼에 못 놓는다', !put(world, 7, 7, 0));
  check('돌이 안 놓였다', b.cells[7 * N + 7], 0);
  check('까닭을 적어 둔다', b.foul?.why, '삼삼');
  check('차례도 안 넘어간다', b.turn, 0);
  ok('다른 자리에는 놓인다', put(world, 2, 2, 0));
  // 하양은 같은 자리에 둘 수 있다
  ok('하양은 삼삼 자리에 둔다', put(world, 7, 7, 1));
}

say('컴퓨터도 금수를 안 둔다');
{
  // 컴퓨터(검정)가 삼삼 자리를 제일 좋게 보더라도 거기 두면 안 된다
  const b = mk().bag;
  mark(b, [[5, 7], [6, 7]], 1);
  mark(b, [[7, 5], [7, 6]], 1);
  const spot = bestSpot(b.cells, 1);
  ok('삼삼 자리를 안 고른다', !(spot[0] === 7 && spot[1] === 7));
  check('고른 자리는 금수가 아니다', forbidden(b.cells, spot[0], spot[1], 1), null);
}

say('커서 — 한 칸씩, 꾹 누르면 이어서, 판 밖으로는 안 나간다');
{
  const world = mk(); const b = world.bag;
  const mid = (N / 2) | 0;
  omok.tap(world, 'right');
  check('누른 순간 한 칸', [b.aim.x, b.aim.y], [mid + 1, mid]);
  omok.tap(world, 'jump');
  check('위로도 한 칸', [b.aim.x, b.aim.y], [mid + 1, mid - 1]);
  // 꾹 누르고 있으면 잠깐 뒤부터 이어서 간다
  world.input.right = true;
  for (let f = 0; f < 18; f++) w.update(world, FR);     // 0.3초 — 아직
  check('바로는 안 흐른다', b.aim.x, mid + 1);
  for (let f = 0; f < 42; f++) w.update(world, FR);     // 0.7초
  ok('꾹 누르면 이어서 간다', b.aim.x > mid + 2);
  world.input.right = false;
  for (let f = 0; f < 600; f++) { world.input.left = true; w.update(world, FR); }
  check('왼쪽 끝에서 멎는다', b.aim.x, 0);
  world.input.left = false;
  for (let f = 0; f < 600; f++) { world.input.duck = true; w.update(world, FR); }
  check('아래쪽 끝에서도 멎는다', b.aim.y, N - 1);
  world.input.duck = false;
}

say('⌥Space — 내 차례에 빈 칸에만');
{
  const world = mk(); world.team = 0;
  const b = world.bag;
  b.aim = { x: 4, y: 4 };
  omok.action(world);
  check('놓였다', b.cells[4 * N + 4], 1);
  b.aim = { x: 4, y: 4 };
  omok.action(world);                            // 이미 찼다 (그리고 내 차례도 아니다)
  check('두 번 안 놓인다', b.moves.length, 1);
  ok('까닭을 알려 준다', !!b.say);
}

say('손님이 보내는 말 — 차례인 사람 것만 받는다');
{
  const world = mk();
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1; world.team = 0;
  join(world, 2, 1);
  const b = world.bag;
  omok.message(world, 2, { k: 'put', x: 3, y: 3 });
  check('차례가 아닌 손님 말은 흘린다', b.moves.length, 0);
  put(world, 7, 7, 0);                           // 방장이 두고
  omok.message(world, 2, { k: 'put', x: 3, y: 3 });
  check('차례인 손님 말은 받는다', b.cells[3 * N + 3], 2);
  omok.message(world, 2, { k: 'put', x: 5, y: 5 });
  check('연달아 두 번은 안 받는다', b.moves.length, 2);
  omok.message(world, 9, { k: 'put', x: 6, y: 6 });
  check('명단에 없는 사람 말도 흘린다', b.moves.length, 2);
}

say('꾸러미 — 손님이 같은 판을 본다');
{
  const host = mk();
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1; host.team = 0;
  join(host, 2, 1);
  put(host, 7, 7, 0); put(host, 8, 8, 1); put(host, 7, 8, 0);
  const guest = mk();
  guest.mp.on = true; guest.mp.role = 'guest'; guest.mp.myId = 2;
  omok.unpack(guest, omok.pack(host));
  const g = guest.bag;
  check('판이 그대로 온다', g.cells.join(''), host.bag.cells.join(''));
  check('차례도 온다', g.turn, host.bag.turn);
  check('수도 그대로', g.moves.length, 3);
  check('마지막 수도 온다', g.last, [7, 8]);
  // 판은 한 수마다 싣는다 — 그 사이에는 안 싣는다
  const a = omok.pack(host);
  ok('바로 다음 꾸러미에는 판이 없다', a.mv === undefined);
  // **그 한 번을 놓친 사람**도 0.6초 뒤에는 받는다
  host.elapsed += 0.7;
  const later = omok.pack(host);
  ok('0.6초 뒤에는 다시 싣는다', Array.isArray(later.mv));
  const late = mk();
  late.mp.on = true; late.mp.role = 'guest'; late.mp.myId = 3;
  omok.unpack(late, later);
  check('늦게 들어온 사람도 판을 받는다', late.bag.moves.length, 3);
  // 끝난 판도 그대로 간다
  const done2 = mk();
  for (let i = 0; i < 4; i++) { put(done2, i, 0, 0); put(done2, i, 5, 1); }
  put(done2, 4, 0, 0);
  const g2 = mk(); g2.mp.on = true; g2.mp.role = 'guest'; g2.mp.myId = 5;
  omok.unpack(g2, omok.pack(done2));
  ok('끝난 것도 간다', g2.bag.over && g2.bag.winner === 0);
  check('이긴 줄도 간다', g2.bag.line.length, 5);
}

say('한 판 — 컴퓨터끼리 두면 끝까지 간다');
{
  let wins = 0, draws = 0;
  let longest = 0;
  for (let g = 0; g < 6; g++) {
    const world = mk();
    world.mp.waiting = true;                     // 아무도 안 앉는다 — 양쪽 다 컴퓨터
    const b = world.bag;
    let f = 0;
    for (; f < 60 * 400 && !b.over; f++) w.update(world, FR);
    longest = Math.max(longest, b.moves.length);
    ok(`${g + 1}번째 — 끝났다`, b.over);
    if (b.winner === null) draws++; else wins++;
    // 이겼다면 정말로 다섯이 이어져 있다
    if (b.winner !== null) {
      const [lx, ly] = b.last;
      ok(`${g + 1}번째 — 다섯이 이어져 있다`, !!winLine(b.cells, lx, ly, b.winner + 1));
    }
  }
  note(`여섯 판 — 이긴 판 ${wins} · 무승부 ${draws} · 제일 긴 판 ${longest}수`);
  ok('무한히 돌지 않는다', longest <= N * N);
}

say('판이 다 차면 무승부');
{
  // 225수째까지 아무도 다섯을 못 이으면 무승부다. 진짜로 225칸을 다 채우면서 다섯이
  // 한 번도 안 이어지는 판을 손으로 짜기는 어렵다 — **세는 규칙 자체**를 본다.
  const world = mk(); const b = world.bag;
  b.moves = new Array(N * N - 1).fill(0);        // 224수까지 뒀다 치고
  b.turn = (N * N - 1) % 2;
  put(world, 0, 0, b.turn);                      // 마지막 한 수 (다섯이 안 된다)
  ok('225수째에 끝난다', b.over);
  check('이긴 편이 없다', b.winner, null);
  ok('무승부라고 적는다', /무승부/.test(b.note ?? ''));
  ok('끝난 뒤에는 못 놓는다', !put(world, 1, 1, b.turn));
}

say('게임을 갈아 끼워도 남는 것이 없다');
{
  const world = mk();
  put(world, 7, 7, 0);
  w.pickGame(world, 'dodge');
  w.pickGame(world, 'omok');
  const b = world.bag;
  ok('판이 새로 열린다', b.cells.every((v) => v === 0) && b.moves.length === 0);
  check('검정부터 다시', b.turn, 0);
}

done('오목');
