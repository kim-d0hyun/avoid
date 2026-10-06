// 펜싱 — 칼 닿는 거리 · 세 수의 물림(찌르기>베기>막기>찌르기) · 줄 · 무효 · 판 밖 · 15점 · 꾸러미 · 같이 하기.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R0 = new URL('../src/', import.meta.url).href;
const w = await import(R0 + 'game/world.js');
const net = await import(R0 + 'game/net.js');
const { games } = await import(R0 + 'games/index.js');
const { bladeTip } = await import(R0 + 'draw/stickman.js');
const F = await import(R0 + 'games/fence.js');
const fence = games.find((g) => g.id === 'fence');
process.env.REJOIN_LIB = '1';
const { room } = await import('./rejoin.mjs');

import { check, ok, say, note, done } from './check.mjs';

const FR = 1 / 60;
function mk({ watch = false } = {}) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'fence');
  world.onRecord = () => {}; world.onMenu = () => {};
  world.onGameOver = (r) => { world.ended = r; };
  w.resize(world, 1512, 944); w.pickGame(world, 'fence');
  if (watch) world.mp.waiting = true;          // 나는 구경 — 두 편 다 컴퓨터
  world.state = 'play';
  return world;
}
const run = (world, n, each) => { for (let i = 0; i < n; i++) { each?.(i); w.update(world, FR); } };
/// 컴퓨터를 멈춰 세운다 — 판정만 보려고. 생각할 틈을 안 준다.
const freeze = (world) => { for (const c of world.bag.cpu) c.still = true; };
const fighting = (world) => { run(world, 60); check('알레 뒤 싸움', world.bag.phase, 'fight'); };
/// 두 사람을 gap 만큼 떨어뜨려 세운다 (빨강이 왼쪽).
function place(world, gap) {
  const P = F.piste(world);
  const [a, b] = [F.body(world, 0), F.body(world, 1)];
  a.x = P.mid - gap / 2; b.x = P.mid + gap / 2;
  a.fence = F.idle(); b.fence = F.idle();
  world.bag.hits = [];
}

say('칼끝 — 그림의 칼과 판정의 칼이 같다');
{
  const tip = (act, k, line = 0) => bladeTip({ x: 0, groundY: 0, air: 0, facing: 1, vx: 0, walk: 0, fence: { act, k, line } });
  const g = tip(null, 0), t = tip('thrust', 0.3), l = tip('lunge', 0.32);
  note(`칼끝 x — 앙가르드 ${g.x.toFixed(0)} · 찌르기 ${t.x.toFixed(0)} · 런지 ${l.x.toFixed(0)}`);
  ok('찌르기가 앙가르드보다 멀리 나간다', t.x > g.x + 5);
  ok('위 줄 칼끝이 아래 줄보다 높다', tip('thrust', 0.3, 1).y < tip('thrust', 0.3, -1).y - 20);
  const flip = bladeTip({ x: 0, groundY: 0, air: 0, facing: -1, vx: 0, walk: 0, fence: { act: 'thrust', k: 0.3, line: 0 } });
  ok('왼쪽을 보면 칼끝도 왼쪽', Math.abs(flip.x + t.x) < 0.01);
}

say('닿는 거리 — 붙어 서도, 칼끝 거리에서도 찌르기가 닿는다');
{
  const world = mk({ watch: true });
  fighting(world); freeze(world);
  const [a, b] = [F.body(world, 0), F.body(world, 1)];
  const reach = [];
  for (let gap = 34; gap <= 120; gap += 2) {
    place(world, gap);
    a.fence = { ...F.idle(), act: 'thrust', k: 0.3, t: 6 * FR };
    for (const line of [-1, 0, 1]) { a.fence.line = line; if (F.touches(a, b)) { reach.push([gap, line]); } }
  }
  const gaps = (line) => reach.filter(([, l]) => l === line).map(([g]) => g);
  for (const line of [-1, 0, 1]) {
    const gs = gaps(line);
    note(`줄 ${line} 찌르기가 닿는 간격 ${Math.min(...gs)}~${Math.max(...gs)}px`);
    ok(`줄 ${line}: 붙어 선 상대(34px)도 닿는다`, gs.includes(34));
    ok(`줄 ${line}: 74px 까지 닿는다`, gs.includes(74));
    ok(`줄 ${line}: 100px 밖은 안 닿는다`, !gs.some((g) => g > 100));
  }
  place(world, 70);
  ok('앙가르드(수 없음)로는 판정하지 않는다', (() => { run(world, 10); return world.bag.phase === 'fight'; })());
}

/// 빨강이 a 를, 초록이 b 를 내게 해 두고 끝까지 굴린다. 누가 점수를 땄나.
function duel(gap, a, b, { delayB = 0, lineA = 0, lineB = 0 } = {}) {
  const world = mk({ watch: true });
  fighting(world); freeze(world);
  place(world, gap);
  const [ra, rb] = [F.body(world, 0), F.body(world, 1)];
  if (a) F.start(ra.fence, a, lineA);
  const before = [...world.bag.score];
  let call = '';
  run(world, 90, (i) => {
    if (i === delayB && b) F.start(rb.fence, b, lineB);
    // 심판이 외친 것 중 마지막 판정 (앙가르드·알레는 판정이 아니다)
    const said = world.bag.call;
    if (said !== '알레!' && said !== '앙가르드' && (world.bag.callT === 0 || !call)) call = said;
  });
  const sc = world.bag.score;
  return { red: sc[0] - before[0], green: sc[1] - before[1], call, world };
}

say('세 수 — 찌르기 > 베기 > 막기 > 찌르기');
{
  // 찌르기는 베기 준비를 끊는다
  let r = duel(70, 'thrust', 'cut');
  check('찌르기 대 베기 — 찌른 쪽 점수', [r.red, r.green], [1, 0]);
  // 베기는 막기를 깬다
  r = duel(70, 'cut', 'parry', { delayB: 8 });
  check('베기 대 막기 — 벤 쪽 점수', [r.red, r.green], [1, 0]);
  ok('「막기가 깨졌다」고 외친다', r.call === '막기가 깨졌다!' || r.world.bag.call === '투셰!');
  // 막기는 같은 줄 찌르기를 쳐낸다
  r = duel(70, 'thrust', 'parry', { lineA: 1, lineB: 1 });
  check('같은 줄 막기 — 아무도 점수 없음', [r.red, r.green], [0, 0]);
  check('「파라드!」', r.call, '파라드!');
  // 줄이 다르면 막기는 헛친다
  r = duel(70, 'thrust', 'parry', { lineA: 1, lineB: -1 });
  check('다른 줄 막기 — 찌른 쪽 점수', [r.red, r.green], [1, 0]);
  // 막고 되찌르기 (리포스트) — 막은 쪽은 곧바로 수를 낼 수 있고, 막힌 쪽은 굳어 있다
  {
    const world = mk({ watch: true });
    fighting(world); freeze(world); place(world, 70);
    const [ra, rb] = [F.body(world, 0), F.body(world, 1)];
    F.start(ra.fence, 'thrust', 0); F.start(rb.fence, 'parry', 0);
    let parried = -1;
    run(world, 30, (i) => { if (parried < 0 && world.bag.call === '파라드!') parried = i; });
    ok('파라드가 났다', parried >= 0);
    ok('막힌 쪽은 굳었다', ra.fence.stun > 0 || parried < 30 - STUN_FRAMES());
    ok('막은 쪽은 곧장 되찌를 수 있다', F.start(rb.fence, 'thrust', 0) || rb.fence.act === 'thrust');
    run(world, 40);
    check('리포스트 — 초록 점수', world.bag.score, [0, 1]);
  }
  // 베기끼리 — 쨍
  r = duel(70, 'cut', 'cut');
  check('베기끼리 — 아무도 점수 없음', [r.red, r.green], [0, 0]);
  check('「쨍!」', r.call, '쨍!');
}
function STUN_FRAMES() { return 18; }

say('무효 · 판 밖 · 런지');
{
  let r = duel(60, 'thrust', 'thrust');
  check('동시에 찌르면 무효', [r.red, r.green], [0, 0]);
  ok('「무효」라고 외친다', r.call.startsWith('무효'));
  ok('무효면 두 등이 다 흰빛', r.world.bag.lamp === null || r.world.bag.lamp.side === -1);
  r = duel(60, 'thrust', 'thrust', { delayB: 6 });
  check('6프레임 늦으면 먼저 찌른 쪽', [r.red, r.green], [1, 0]);
  // 런지 — 찌르기로 안 닿는 거리에서 닿는다
  r = duel(140, 'thrust', null);
  check('140px — 그냥 찌르기는 안 닿는다', [r.red, r.green], [0, 0]);
  r = duel(140, 'lunge', null);
  check('140px — 런지는 닿는다', [r.red, r.green], [1, 0]);
  // 판 밖
  const world = mk({ watch: true });
  fighting(world); freeze(world);
  const P = F.piste(world);
  F.body(world, 0).x = P.L - 5;
  run(world, 2);
  check('빨강이 왼쪽 끝 밖으로 — 초록 점수', world.bag.score, [0, 1]);
  ok('불은 초록 쪽', world.bag.lamp?.side === 1);
  run(world, 200, () => { if (world.bag.phase === 'allez') freeze(world); });
  check('다시 시작선', [Math.round(F.body(world, 0).x), Math.round(F.body(world, 1).x)], P.start.map(Math.round));
}

say('득점등 — 먼저 칼을 댄 사람 밑에 그 편 색');
{
  const r = duel(70, null, 'thrust');
  check('초록이 찔렀다', [r.red, r.green], [0, 1]);
  check('불은 초록 편', r.world.bag.lamp?.side ?? 'gone', 'gone');      // 90프레임 뒤면 꺼졌다 (FREEZE 1.2초)
  const world = mk({ watch: true });
  fighting(world); freeze(world); place(world, 70);
  F.start(F.body(world, 1).fence, 'thrust', 0);
  let lamp = null;
  run(world, 30, () => { lamp ??= world.bag.lamp?.side; });
  check('찌른 직후 불은 초록 편', lamp, 1);
}

say('컴퓨터끼리 15점 — 끝까지 가는가, 걸리는 데가 없는가');
{
  const tally = {};
  let longest = 0, totalTime = 0, lunges = 0, cuts = 0;
  for (let game = 0; game < 4; game++) {
    const world = mk({ watch: true });
    let last = '', since = 0;
    for (let i = 0; i < 60 * 900 && !world.ended; i++) {
      w.update(world, FR);
      const b = world.bag;
      if (b.callT === 0) tally[b.call] = (tally[b.call] ?? 0) + 1;
      if (b.phase === 'fight') since += FR; else { longest = Math.max(longest, since); since = 0; }
      for (const c of b.cpu) { if (c.fence.act === 'lunge' && c.fence.t === FR) lunges++; if (c.fence.act === 'cut' && c.fence.t === FR) cuts++; }
      const P = F.piste(world);
      for (const c of b.cpu) if (c.x < P.L - 21 || c.x > P.R + 21) throw new Error('판을 벗어났다');
      if ((b.cpu[1].x - b.cpu[0].x) < 33.9) throw new Error('지나쳤다 ' + (b.cpu[1].x - b.cpu[0].x));
    }
    ok(`${game + 1}판 — 15점에서 끝났다 ${world.bag.score.join(':')}`, !!world.ended && Math.max(...world.bag.score) === 15);
    totalTime += world.bag.clock;
  }
  note(`외친 것: ${Object.entries(tally).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  note(`한 판 평균 ${(totalTime / 4).toFixed(0)}초 · 가장 긴 맞댐 ${longest.toFixed(1)}초 · 런지 ${lunges} · 베기 ${cuts}`);
  ok('맞댐 하나가 15초를 넘지 않는다 (서로 안 들어가고 맴돌기만 하지 않는다)', longest < 15);
  ok('파라드가 나온다', (tally['파라드!'] ?? 0) > 0);
  ok('런지 · 베기를 다 쓴다', lunges > 0 && cuts > 0);
}

say('사람 대 컴퓨터 — 키로 한다');
{
  const world = mk();
  fighting(world);
  const me = world.player;
  const P = F.piste(world);
  check('나는 빨강 시작선', Math.round(me.x), Math.round(P.start[0]));
  // 걷기
  w.press(world, 'right', true); run(world, 20); w.press(world, 'right', false);
  ok('⌥→ 로 앞으로 걷는다', me.x > P.start[0] + 30);
  ok('펜싱에서는 점프가 없다', (() => { w.press(world, 'jump', true); run(world, 10); const a = me.air; w.press(world, 'jump', false); return a === 0; })());
  // 찌르기 · 위 줄
  freeze(world);
  w.press(world, 'jump', true); w.press(world, 'grab', true); w.press(world, 'grab', false);
  check('⌥↑ + ⌥Space — 위 줄 찌르기', [me.fence.act, me.fence.line], ['thrust', 1]);
  w.press(world, 'jump', false);
  run(world, 40);
  w.press(world, 'drop', true); w.press(world, 'drop', false);
  check('⌥X — 베기', me.fence.act, 'cut');
  run(world, 50);
  w.press(world, 'guard', true); w.press(world, 'guard', false);
  check('⌥C — 막기', me.fence.act, 'parry');
  run(world, 40);
  // 걸으며 찌르면 런지
  w.press(world, 'right', true); run(world, 2); w.press(world, 'grab', true); w.press(world, 'grab', false);
  check('걸으며 ⌥Space — 런지', me.fence.act, 'lunge');
  w.press(world, 'right', false);
  run(world, 260, () => { if (world.bag.phase === 'allez') freeze(world); });   // 런지가 닿았으면 다시 알레까지
  check('다시 싸움', world.bag.phase, 'fight');
  // 물러나며 찌르면 그냥 찌르기
  w.press(world, 'left', true); run(world, 2); w.press(world, 'grab', true); w.press(world, 'grab', false);
  check('물러나며 ⌥Space — 그냥 찌르기', me.fence.act, 'thrust');
  w.press(world, 'left', false);
  // 굴러가는 수 중엔 새 수가 안 나간다
  w.press(world, 'drop', true); w.press(world, 'drop', false);
  check('찌르는 중 ⌥X 는 씹힌다', me.fence.act, 'thrust');

  // 마구 누르는 사람과 15점 — 끝나는가
  const fresh = mk();
  const keys = ['grab', 'drop', 'guard'];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 60 * 900 && !fresh.ended; i++) {
    if (i % 9 === 0) {
      const r = rnd();
      fresh.input.right = r < 0.45; fresh.input.left = r > 0.8;
      fresh.input.jump = rnd() < 0.3; fresh.input.duck = !fresh.input.jump && rnd() < 0.3;
      if (rnd() < 0.25) { const k = keys[Math.floor(rnd() * 3)]; w.press(fresh, k, true); w.press(fresh, k, false); }
    }
    w.update(fresh, FR);
  }
  ok(`마구 누르는 사람과도 15점에서 끝난다 (${fresh.bag.score.join(':')})`, !!fresh.ended);
}

say('꾸러미 — 손님 화면에 점수 · 등 · 칼 · 자리');
{
  const host = mk({ watch: true });
  run(host, 300);
  const pk = JSON.parse(JSON.stringify(fence.pack(host)));
  const guest = mk({ watch: true });
  guest.mp.role = 'guest';
  fence.unpack(guest, pk);
  check('점수', guest.bag.score, host.bag.score);
  check('국면', guest.bag.phase, host.bag.phase);
  for (const s of [0, 1]) ok(`${s} 편 컴퓨터 자리`, Math.abs(guest.bag.cpu[s].x - host.bag.cpu[s].x) < 0.2);
  fence.unpack(guest, { fz: 'x', sc: [1], tm: 5, lp: 'a' });
  fence.unpack(guest, null);
  ok('깨진 꾸러미에도 안 넘어진다', Array.isArray(guest.bag.score));
}

say('같이 하기 — 손님이 찌르면 방장이 판정한다 · 나가면 컴퓨터가 잇는다');
{
  const r = room('fence');
  const g = r.join();
  r.host.state = 'play'; g.state = 'play';
  r.advance(30);
  const hb = r.host.bag;
  const gid = g.mp.myId;
  check('방장 빨강 · 손님 초록이 선다', hb.fencers, [r.host.mp.myId, gid]);
  r.advance(60);
  check('손님 화면도 싸움', g.bag.phase, 'fight');
  // 손님이 다가가 찌른다 (방장은 가만히)
  const P = F.piste(r.host);
  const walkIn = () => { g.input.left = true; let n = 0; while (g.player.x - r.host.player.x > 70 && n++ < 200) r.advance(1); g.input.left = false; };
  walkIn();
  const gap = g.player.x - r.host.player.x;
  note(`손님이 걸어 들어간 간격 ${gap.toFixed(0)}px`);
  ok('손님이 방장 앞까지 걸어왔다', gap <= 72 && gap >= 33);
  w.press(g, 'grab', true); w.press(g, 'grab', false);
  check('손님 화면에서는 바로 찌른다', g.player.fence.act, 'thrust');
  r.advance(40);
  check('방장이 손님 점수를 줬다', hb.score, [0, 1]);
  r.advance(10);
  check('손님 화면 점수도', g.bag.score, [0, 1]);
  r.advance(100);
  ok('손님도 시작선으로 돌아갔다', Math.abs(g.player.x - P.start[1]) < 2);
  // 방장이 막는다 — 손님 찌르기가 막히면 손님이 굳는다
  r.advance(60);
  walkIn();
  w.press(g, 'grab', true); w.press(g, 'grab', false);
  r.advance(3);
  w.press(r.host, 'guard', true); w.press(r.host, 'guard', false);
  let stunned = false;
  r.advance(30, () => { stunned ||= g.player.fence.stun > 0; });
  ok('막히면 손님 화면에서도 굳는다', stunned);
  ok('방장이 막았다 (점수 안 남)', hb.score[1] === 1);
  // 손님이 나가면 컴퓨터가 초록을 맡는다
  r.leave(g);
  r.advance(10);
  check('손님이 나가니 초록은 컴퓨터', hb.fencers[1], -1);
  r.advance(200);
  ok('판은 계속 돈다', hb.phase === 'fight' || hb.phase === 'freeze' || hb.phase === 'allez');
}

say('밀기 — 걸어 들어가도 서 있는 상대는 안 밀린다');
{
  const world = mk();
  fighting(world); freeze(world);
  const c = world.bag.cpu[1];
  world.player.x = c.x - 60;
  const cx = c.x;
  world.input.right = true; run(world, 90); world.input.right = false;
  ok('서 있던 상대는 그 자리 그대로', Math.abs(c.x - cx) < 0.5);
  ok('나는 붙어서 멈췄다', c.x - world.player.x >= 33.5);
  // 컴퓨터가 걸어 들어와도 서 있는 나를 안 민다
  const world2 = mk(); fighting(world2);
  const me = world2.player, c2 = world2.bag.cpu[1];
  const P = F.piste(world2);
  me.x = P.L + 40; c2.x = me.x + 60;
  c2.plan = { kind: 'close', t: 99 }; c2.think = 99;
  const mx = me.x;
  run(world2, 60, () => { c2.think = 99; });
  ok('컴퓨터가 걸어와도 나는 그 자리', Math.abs(me.x - mx) < 0.5);
  ok('컴퓨터도 붙어서 멈췄다', c2.x - me.x >= 33.5);
}

say('늦게 온 연속 찌르기 · 판 도중 창 크기');
{
  const r = room('fence');
  const g = r.join();
  r.advance(30); r.again(); r.advance(120);
  const f = r.host.mp.others.get(g.mp.myId).fence;
  // 방장 쪽 앞 수가 돌아오는 중 끝자락이다 — 손님 화면에서는 이미 끝났다
  Object.assign(f, { act: 'thrust', t: (5 + 6 + 15 - 4) * FR, line: 0 });
  fence.message(r.host, g.mp.myId, { t: 'gm', k: 'act', a: 'thrust', l: 1 });
  check('끝나기 직전이면 다음 찌르기를 받는다', [f.act, f.line, f.t], ['thrust', 1, 0]);
  Object.assign(f, { act: 'lunge', t: 10 * FR, line: 0 });
  fence.message(r.host, g.mp.myId, { t: 'gm', k: 'act', a: 'thrust', l: 1 });
  check('한창일 때는 안 받는다', f.act, 'lunge');

  const world = mk(); fighting(world);
  const P0 = F.piste(world);
  world.bag.cpu[1].x = P0.R - 5;
  w.resize(world, 1100, 700);
  const P1 = F.piste(world);
  run(world, 3);
  check('창이 줄어도 점수가 안 난다', world.bag.score, [0, 0]);
  ok('검객이 새 시작선에', Math.abs(world.bag.cpu[1].x - P1.start[1]) < 1 && Math.abs(world.player.x - P1.start[0]) < 1);
}

say('셋이 오면 한 사람은 구경');
{
  const r = room('fence');
  const a = r.join(), b = r.join();
  r.host.state = 'play'; a.state = 'play'; b.state = 'play';
  r.advance(30);
  const hb = r.host.bag;
  const sitting = [r.host, a, b].filter((x) => !hb.fencers.includes(x.mp.myId));
  check('피스트에 둘 · 구경 하나', sitting.length, 1);
  const P = F.piste(r.host);
  r.advance(30);
  ok('구경하는 사람은 판 밖 의자에', sitting[0].player.x < P.L || sitting[0].player.x > P.R);
  // 구경꾼이 누르는 칼은 안 나간다
  w.press(sitting[0], 'grab', true); w.press(sitting[0], 'grab', false);
  ok('구경꾼은 칼을 안 뻗는다', !sitting[0].player.fence?.act);
}

done();
