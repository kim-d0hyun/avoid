// 범퍼카 — 몰기 · 돌진 > 그냥 차 · 버티기 > 돌진 · 옆구리 > 버티기 · 떨어짐 · 좁아지기 · 5점 · 혼자면 컴퓨터 셋 ·
// 같이 하기(방장이 굴린다 · 손님은 키) · 꾸러미 · 그림.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R0 = new URL('../src/', import.meta.url).href;
const w = await import(R0 + 'game/world.js');
const { games } = await import(R0 + 'games/index.js');
const bumper = games.find((g) => g.id === 'bumper');
const B = await import(R0 + 'games/bumper.js');
process.env.REJOIN_LIB = '1';
const { room } = await import('./rejoin.mjs');
import { check, ok, say, note, done } from './check.mjs';

const FR = 1 / 60;
function mk({ watch = false } = {}) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'bumper');
  world.onRecord = () => {}; world.onMenu = () => {};
  world.onGameOver = (r) => { world.ended = r; };
  w.resize(world, 1512, 944); w.pickGame(world, 'bumper');
  if (watch) world.mp.waiting = true;
  world.state = 'play';
  return world;
}
const run = (world, n, each) => { for (let i = 0; i < n; i++) { each?.(i); w.update(world, FR); } };
/// 출발까지 굴리고, 컴퓨터는 세워 둔다(시험할 차만 움직이게) — 컴퓨터는 cpu 가 false 면 키를 안 받는다.
function go(world) {
  run(world, 1);
  run(world, 110);
  check('출발했다', world.bag.phase, 'go');
}
const car = (world, id) => world.bag.cars.find((c) => c.id === id);
function park(world) {
  // 컴퓨터를 세워 둔다 — 시험할 차만 움직이게
  for (const c of world.bag.cars) { if (c.id < 0) c.still = true; c.vx = 0; c.vy = 0; }
}

say('혼자면 컴퓨터 셋과 · 구경이면 컴퓨터끼리');
{
  const world = mk(); run(world, 2);
  check('나 + 컴퓨터 셋 = 네 대', world.bag.cars.length, 4);
  ok('내 차가 있다', !!car(world, world.mp.myId));
  const watch = mk({ watch: true }); run(watch, 2);
  check('구경 — 컴퓨터 셋', watch.bag.cars.map((c) => c.id).sort(), [-1, -2, -3].sort());
  ok('메뉴 이름', bumper.name === '범퍼카');
}

say('몰기 — ⌥↑ 가속 · 최고 빠르기 · 손 떼면 선다 · ⌥←→ 방향');
{
  const world = mk(); go(world); park(world);
  const me = car(world, world.mp.myId);
  me.x = 0; me.y = 0; me.h = 0;
  w.press(world, 'jump', true); run(world, 90); w.press(world, 'jump', false);
  const top = Math.hypot(me.vx, me.vy);
  note(`최고 빠르기 ${top.toFixed(0)}px/s`);
  ok('최고 빠르기 근처 (260)', top > 230 && top < 275);
  ok('앞(오른쪽)으로 갔다', me.x > 100);
  run(world, 120);
  ok('손 떼면 천천히 선다', Math.hypot(me.vx, me.vy) < 60);
  const h0 = me.h;
  w.press(world, 'right', true); run(world, 20); w.press(world, 'right', false);
  ok('⌥→ 로 방향을 튼다', me.h > h0 + 0.5);
}

say('돌진 > 그냥 차 · 버티기 > 돌진 · 옆구리 > 버티기');
{
  /// a 가 왼쪽에서 오른쪽 b 를 향해 돌진한다. b 는 pose 대로. 부딪힌 뒤 둘의 가로 빠르기.
  const crash = (pose) => {
    const world = mk(); go(world); park(world);
    const [a, b] = world.bag.cars.filter((c) => c.id < 0);
    // 둘만 남긴다 (나머지는 판 밖 멀리 — 셋 이상이 살아 있어야 판이 안 끝난다)
    for (const c of world.bag.cars) if (c !== a && c !== b) { c.x = 0; c.y = 400; c.vx = 0; c.vy = 0; c.still = true; }
    world.bag.cars.find((c) => c.id === world.mp.myId).y = -400;
    a.x = -100; a.y = 0; a.h = 0; b.x = 0; b.y = 0; b.h = pose === 'side' ? Math.PI / 2 : Math.PI;
    if (pose === 'brace' || pose === 'side') B.brace(b);
    B.boost(a);
    run(world, 12);
    return { a: a.vx, b: b.vx, bx: b.x, ax: a.x };
  };
  const plain = crash('plain'), braced = crash('brace'), side = crash('side');
  note(`돌진에 받힌 쪽 가로 빠르기 — 그냥 ${plain.b.toFixed(0)} · 버티기 ${braced.b.toFixed(0)} · 옆구리로 버티기 ${side.b.toFixed(0)}`);
  note(`돌진한 쪽 — 그냥 ${plain.a.toFixed(0)} · 버티기에 막힘 ${braced.a.toFixed(0)}`);
  ok('돌진에 받힌 그냥 차는 세게 밀려난다', plain.b > 300);
  ok('버티면 거의 안 밀린다', braced.b < plain.b * 0.5);
  ok('버티기에 막힌 돌진은 거꾸로 튕긴다', braced.a < -100);
  ok('옆구리로 받은 버티기는 더 밀린다', side.b > braced.b * 1.4);
  // 버티는 동안은 키를 안 듣는다
  const world = mk(); go(world); park(world);
  const me = car(world, world.mp.myId); me.x = 0; me.y = 0; me.vx = 0; me.vy = 0;
  B.brace(me);
  w.press(world, 'jump', true); run(world, 20); w.press(world, 'jump', false);
  ok('버티는 동안은 못 움직인다', Math.hypot(me.vx, me.vy) < 20);
  // 다시 쓰기까지
  ok('버티기 쿨다운 중엔 또 못 버틴다', !B.brace(me));
  const me2 = car(world, world.mp.myId); me2.braceT = 0; me2.braceCool = 0;
  ok('돌진 · 쿨다운', B.boost(me2) && !B.boost(me2));
}

say('범퍼카 손맛 — 옆을 맞으면 빙글 · 출렁 · 쿵/쾅 · 화면 흔들림');
{
  const hitAt = (bh, speed) => {
    const world = mk(); go(world); park(world);
    const [a, c] = world.bag.cars.filter((x) => x.id < 0);
    for (const o of world.bag.cars) if (o !== a && o !== c) { o.x = 0; o.y = 400; o.still = true; }
    a.x = -60; a.y = 0; a.h = 0; a.vx = speed; a.vy = 0;
    c.x = 0; c.y = 0; c.h = bh; c.vx = 0; c.vy = 0;
    world.shake = 0;
    let spin = 0, wob = 0, pop = null, shake = 0;
    run(world, 10, () => { spin = Math.max(spin, Math.abs(c.spin ?? 0)); wob = Math.max(wob, c.wob ?? 0);
      pop ??= world.bag.pops?.[0]?.word; shake = Math.max(shake, world.shake ?? 0); });
    return { spin, wob, pop, shake };
  };
  const side = hitAt(Math.PI / 2, 300), front = hitAt(Math.PI, 300), soft = hitAt(Math.PI / 2, 90), hard = hitAt(Math.PI / 2, 560);
  note(`도는 세기 — 옆구리 ${side.spin.toFixed(2)} · 정면 ${front.spin.toFixed(2)} rad/s`);
  ok('옆구리를 맞으면 빙글 돈다', side.spin > 1);
  ok('정면으로 맞으면 거의 안 돈다', front.spin < side.spin * 0.2);
  ok('부딪히면 출렁인다', side.wob > 0.4);
  check('살살 닿으면 글자는 없다', soft.pop ?? null, null);
  check('보통으로 받으면 「쿵」', side.pop, '쿵');
  check('세게 받으면 「쾅!」', hard.pop, '쾅!');
  ok('세게 받으면 화면이 흔들린다', hard.shake > 0.4 && soft.shake === 0);
  // 손님 화면에도 쿵 · 출렁 · 흔들림
  const host = mk(); go(host); run(host, 1);
  host.bag.popSeq = 3; host.bag.pops = [{ seq: 3, x: 0, y: 0, t: 0, word: '쾅!' }];
  host.bag.cars[0].wob = 0.8;
  const pk = JSON.parse(JSON.stringify(bumper.pack(host)));
  const guest = mk(); guest.mp.role = 'guest'; guest.shake = 0;
  bumper.unpack(guest, pk);
  ok('손님 화면에도 「쾅!」 · 흔들림', guest.bag.pops?.[0]?.word === '쾅!' && guest.shake > 0.4);
  ok('손님 화면에도 출렁임', guest.bag.cars[0].wob > 0.7);
}

say('누가 밀었나 — 들이받은 차만 적는다');
{
  const world = mk(); go(world); park(world);
  const A = B.arena(world);
  const [x] = world.bag.cars.filter((c) => c.id < 0);
  const m = world.bag.cars.find((c) => c.id === world.mp.myId);
  for (const o of world.bag.cars) if (o !== x && o !== m) { o.x = -A.R * 0.5; o.y = A.R * 0.4; }
  // 내가 가장자리 차를 들이받고, 내 힘에 나도 판 밖으로 나간다
  m.x = A.R - 200; m.y = 0; m.h = 0; x.x = A.R - 60; x.y = 0; x.h = Math.PI;
  B.boost(m);
  run(world, 40);
  const words = world.bag.words.map((w) => w.word);
  note(`외침 — ${words.join(' / ')}`);
  ok('받힌 차 — 「아웃! — 나」', words.some((t) => t.startsWith(`${world.bag.names.get(x.id)} 아웃! — ${world.bag.names.get(m.id)}`)));
  ok('제 힘에 나간 나 — 「떨어졌다」 (받힌 차가 민 걸로 안 나온다)', !m.alive ? words.some((t) => t === `${world.bag.names.get(m.id)} 떨어졌다`) : true);
}

say('떨어짐 · 한 판 · 좁아지기 · 5점');
{
  const world = mk({ watch: true }); go(world);
  const b = world.bag;
  const A = B.arena(world);
  const [x, y, z] = b.cars;
  x.x = A.R + 5; x.y = 0;
  world.shake = 0;
  run(world, 2);
  ok('원 밖으로 나가면 떨어진다', !x.alive);
  ok('떨어지는 순간 화면이 흔들린다', world.shake > 0.3);
  y.x = -A.R - 5; y.y = 0;
  run(world, 2);
  check('하나 남으면 판이 끝난다', b.phase, 'end');
  check('남은 차가 1점', b.score.get(z.id), 1);
  run(world, 120);
  check('다음 판 — 다시 셋', b.cars.filter((c) => c.alive).length, 3);
  // 좁아지기
  const w2 = mk({ watch: true }); go(w2);
  for (const c of w2.bag.cars) { c.think = 0; }
  w2.bag.clock = 50;
  run(w2, 2);
  ok('40초가 넘으면 경기장이 좁아진다', w2.bag.Rk < 0.8);
  // 다섯 점이면 끝
  const w3 = mk({ watch: true }); go(w3);
  const win = w3.bag.cars[0];
  w3.bag.score.set(win.id, 4);
  for (const c of w3.bag.cars) if (c !== win) { c.x = B.arena(w3).R + 30; c.y = 0; }
  run(w3, 140);
  ok('5점이면 게임이 끝난다', !!w3.ended);
}

say('컴퓨터끼리 — 끝까지 가는가 · 한 판 길이');
{
  const lens = [];
  for (let g = 0; g < 4; g++) {
    const world = mk({ watch: true });
    let t0 = 0, last = 0, i = 0;
    for (i = 0; i < 60 * 900 && !world.ended; i++) {
      w.update(world, FR);
      if (world.bag.round !== last) { if (last) lens.push((i - t0) / 60); t0 = i; last = world.bag.round; }
      for (const c of world.bag.cars) if (!Number.isFinite(c.x) || !Number.isFinite(c.vx)) throw new Error('NaN');
    }
    ok(`${g + 1}게임 — 5점에서 끝났다 (${(i / 60).toFixed(0)}초)`, !!world.ended);
  }
  lens.sort((a, b) => a - b);
  note(`한 판 — 중간 ${lens[lens.length >> 1].toFixed(1)}초 · 가장 긴 ${lens.at(-1).toFixed(1)}초 · ${lens.length}판`);
  ok('한 판 중간이 40초 안', lens[lens.length >> 1] < 40);
  ok('어느 판도 90초를 안 넘는다 (좁아지기가 끝을 낸다)', lens.at(-1) < 90);
}

say('같이 하기 — 손님 키로 방장이 굴린다 · 손님 화면에 차 · 나가면 떨어진다');
{
  const r = room('bumper');
  const g = r.join();
  r.advance(20); r.again(); r.advance(130);
  const h = r.host;
  check('둘이면 컴퓨터 없이 두 대', h.bag.cars.length, 2);
  check('손님 화면에도 두 대', g.bag.cars.length, 2);
  const gc = h.bag.cars.find((c) => c.id === g.mp.myId);
  const x0 = gc.x, y0 = gc.y;
  w.press(g, 'jump', true); r.advance(40); w.press(g, 'jump', false);
  ok('손님 ⌥↑ — 방장 화면에서 손님 차가 간다', Math.hypot(gc.x - x0, gc.y - y0) > 40);
  w.press(g, 'grab', true); w.press(g, 'grab', false); r.advance(4);
  ok('손님 돌진이 방장에게', gc.boostCool > 0);
  const mine = g.bag.cars.find((c) => c.id === g.mp.myId);
  ok('손님 화면 내 차 자리가 방장과 맞는다', Math.hypot(mine.x - gc.x, mine.y - gc.y) < 40);
  const gid = g.mp.myId;
  const before = [...h.bag.score.values()].reduce((a, v) => a + v, 0);
  r.leave(g);
  r.advance(10);
  ok('손님이 나가면 그 차는 없어진다', !h.bag.cars.find((c) => c.id === gid));
  check('나간 판은 무른다 — 남은 사람이 거저 점수를 안 받는다', [...h.bag.score.values()].reduce((a, v) => a + v, 0), before);
  check('혼자 남으면 바로 컴퓨터 셋과 다시', h.bag.cars.length, 4);
}

say('꾸러미 · 그림');
{
  const world = mk(); go(world); run(world, 30);
  const pk = JSON.parse(JSON.stringify(bumper.pack(world)));
  const guest = mk(); guest.mp.role = 'guest';
  bumper.unpack(guest, pk);
  check('차 수', guest.bag.cars.length, world.bag.cars.length);
  ok('자리', Math.abs(guest.bag.cars[0].x - world.bag.cars[0].x) < 0.2);
  bumper.unpack(guest, { c: 'x', s: 3 }); bumper.unpack(guest, null);
  ok('깨진 꾸러미에도 안 넘어진다', Array.isArray(guest.bag.cars));
  const { createCanvas } = await import('canvas');
  const ctx = createCanvas(1512, 944).getContext('2d');
  let fine = true;
  try { bumper.draw(ctx, world, 1); bumper.hud(ctx, world); bumper.draw(ctx, guest, 1); } catch (e) { fine = false; note(e.message); }
  ok('그린다', fine);
}

done('범퍼카');
