// 배구 캐릭터 — 능력치(달리기·점프·스파이크·받기) · 다음 점수부터 · 기세(지는 쪽이 빨리) · ⌥C 스킬 다섯 ·
// 같이 할 때(방장이 정한다) · 메뉴 · 저장.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const { games } = await import(R + 'games/index.js');
const volley = games.find((g) => g.id === 'volley');
const { spike } = await import(R + 'games/volley.js');
const C = await import(R + 'games/volley-cast.js');
const { BODY_H } = await import(R + 'draw/stickman.js');
process.env.REJOIN_LIB = '1';
const { room } = await import('./rejoin.mjs');
import { check, ok, say, note, done } from './check.mjs';

const FR = 1 / 60;
function mk(cast = 'dubu') {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'volley');
  world.onRecord = () => {}; world.onGameOver = () => {};
  world.saved = {};
  world.savePref = (k, v) => { world.saved[k] = v; };
  world.onMenu = (a) => { if (a.startsWith('cast:')) volley.pickCast(world, null, a.slice(5)); };
  w.resize(world, 1512, 944);
  world.state = 'ready';
  w.spread(world);
  world.mp.myCast = cast;
  world.team = 0;
  return world;
}
/// 랠리 중으로 만든다 (서브 끝 · 대기 끝).
function rally(world) {
  world.state = 'play';
  volley.update(world, FR);
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false; b.mustCross = null;
  return b;
}
const run = (world, n, each) => { for (let i = 0; i < n; i++) { each?.(i); w.update(world, FR); } };
const tap = (world, a) => { w.press(world, a, true); w.press(world, a, false); };

say('표 — 다섯 명, 능력치 합은 모두 12, 스파이크는 2 이상(1:1 이라 누구나 때려야 한다)');
{
  check('다섯 명', C.CAST.map((c) => c.name), ['두부', '깡총', '망치', '번개', '문어']);
  for (const c of C.CAST) {
    const sum = Object.values(c.st).reduce((a, v) => a + v, 0);
    ok(`${c.name} — 합 12 (${Object.values(c.st).join('/')})`, sum === 12);
    ok(`${c.name} — 스파이크 ${c.st.spike} ≥ 2`, c.st.spike >= 2);
    ok(`${c.name} — 스킬 ${c.skill.name}`, ['arm', 'now'].includes(c.skill.kind));
  }
  check('두부는 지금 게임 그대로 (전부 3)', C.statsOf('dubu'), { run: 1, jumpH: 65, jump: 1, spike: 1, reach: 1 });
  check('모르는 이름은 두부', C.castOf('없는애').id, 'dubu');
}

say('달리기 · 점프 — 엔진이 내 몸에 배율을 건다');
{
  const top = (cast) => {
    const world = mk(cast); rally(world);
    const p = world.player; p.x = 200;
    world.input.right = true;
    let best = 0;
    run(world, 40, () => { best = Math.max(best, Math.abs(p.vx)); });
    return best;
  };
  const jump = (cast) => {
    const world = mk(cast); rally(world);
    const p = world.player; p.x = 300;
    run(world, 2);
    world.input.jump = true; run(world, 1); world.input.jump = false;
    let apex = 0;
    run(world, 60, () => { apex = Math.max(apex, p.air); });
    return apex;
  };
  const fast = top('beongae'), mid = top('dubu'), slow = top('mangchi');
  note(`최고 빠르기 — 번개 ${fast.toFixed(0)} · 두부 ${mid.toFixed(0)} · 망치 ${slow.toFixed(0)} px/s`);
  ok('번개(5)는 ×1.2', Math.abs(fast / mid - 1.2) < 0.02);
  ok('망치(2)는 ×0.9', Math.abs(slow / mid - 0.9) < 0.02);
  const hi = jump('kkang'), j3 = jump('dubu'), lo = jump('beongae');
  note(`점프 높이 — 깡총 ${hi.toFixed(1)} · 두부 ${j3.toFixed(1)} · 번개 ${lo.toFixed(1)} px`);
  // 프레임 셈이라 실제 꼭대기는 명목값(65)보다 조금 낮다 — 비율로 본다 (78/65 · 60/65)
  ok('깡총(5)은 두부의 1.2배 높이', Math.abs(hi / j3 - 78 / 65) < 0.03);
  ok('번개(2)는 두부의 0.92배 높이', Math.abs(lo / j3 - 60 / 65) < 0.03);
  // 다른 게임은 그대로 — 배율은 배구가 몸에 붙인다
  const dodge = w.createWorld({ ms: 0, dodged: 0 }, 'dodge');
  ok('똥피하기 사람에게는 배율이 없다', dodge.player.runMul === undefined && dodge.player.jumpMul === undefined);
}

/// 한 번 치는 판 — 손끝 기준 off 만큼 떨어진 공을 때린다.
function rig(cast, { air = 60, off = [66, -20], x = 600, keys = {} } = {}) {
  const world = mk(cast); const b = rally(world);
  const p = world.player;
  p.x = x; p.air = air; p.vy = 0; p.facing = 1;
  const hand = p.groundY - p.air - BODY_H * 0.86;
  b.ball.x = p.x + off[0]; b.ball.y = hand + off[1]; b.ball.vx = 0; b.ball.vy = 200;
  Object.assign(world.input, { left: false, right: false, jump: false, duck: false }, keys);
  return { world, b, p };
}

say('스파이크 · 받기 — 때린 공 빠르기와 손이 닿는 거리');
{
  const speed = (cast) => {
    const { world, b } = rig(cast, { off: [30, 10], keys: { right: true } });
    ok(`${cast} 쳤다`, spike(world));
    return Math.hypot(b.ball.vx, b.ball.vy);
  };
  const strong = speed('mangchi'), mid = speed('dubu'), weak = speed('kkang');
  note(`강타 빠르기 — 망치 ${strong.toFixed(0)} · 두부 ${mid.toFixed(0)} · 깡총 ${weak.toFixed(0)}`);
  ok('망치(5)가 두부보다 세다', strong > mid * 1.08);
  ok('깡총(2)이 두부보다 약하다', weak < mid * 0.96);
  // 손이 닿는 거리 — 몸 기준 95px 떨어진 공
  const reaches = (cast) => {
    const { world } = rig(cast, { air: 30, off: [0, 0] });
    const b = world.bag, p = world.player;
    b.ball.x = p.x + 95; b.ball.y = p.groundY - p.air - BODY_H * 0.7;
    return spike(world);
  };
  ok('문어(5)는 95px 공에 손이 닿는다', reaches('muneo'));
  ok('두부(3)는 안 닿는다', !reaches('dubu'));
}

say('다음 점수부터 — 랠리 중에 바꾸면 그 점수가 끝나야 바뀐다 · 바꾸면 기세 0');
{
  const world = mk('dubu'); const b = rally(world);
  run(world, 2);
  const me = world.mp.myId;
  b.gauge.set(me, 3);
  w.press(world, 'menu', true);
  ok('메뉴에 「캐릭터」가 있다', w.menuItems(world).some((i) => i.id === 'cast'));
  w.press(world, 'menu', true);
  volley.pickCast(world, null, 'mangchi');
  check('저장한다', world.saved.volleyCast, 'mangchi');
  run(world, 2);
  check('랠리 중에는 아직 두부', world.player.look, 'dubu');
  // 공을 내 코트 바닥에 떨어뜨려 점수를 낸다 (내 몸에서 먼 데)
  world.player.x = 600;
  b.ball.x = 150; b.ball.y = world.groundY - 22; b.ball.vx = 0; b.ball.vy = 300;
  run(world, 3);
  ok('점수가 났다', b.score[1] === 1);
  run(world, 2);
  check('점수가 끝나니 망치', world.player.look, 'mangchi');
  check('바꾸면 기세 0', b.gauge.get(me), 0);
}

say('기세 — 점수를 내주면 2칸, 따면 1칸, 4칸이 최대');
{
  const r = room('volley');
  const g = r.join();
  r.advance(30); r.again(); r.advance(90);
  const h = r.host, hb = h.bag;
  const hostSide = h.team ?? 0;
  const drop = (side) => {
    hb.serving = false; hb.wait = 0; hb.stop = 0; hb.mustCross = null;
    hb.ball.x = side === 0 ? 120 : h.w - 120; hb.ball.y = h.groundY - 22; hb.ball.vx = 0; hb.ball.vy = 300;
    r.advance(3);
  };
  drop(hostSide);          // 방장 코트에 떨어졌다 — 방장이 내줬다
  check('내준 방장 2칸 · 딴 손님 1칸', [hb.gauge.get(h.mp.myId), hb.gauge.get(g.mp.myId)], [2, 1]);
  r.advance(10);
  check('손님 화면에도 같다', [g.bag.gauge.get(h.mp.myId), g.bag.gauge.get(g.mp.myId)], [2, 1]);
  drop(hostSide); drop(hostSide);
  check('넘쳐도 4칸', hb.gauge.get(h.mp.myId), 4);
}

say('스킬 — 기세가 모자라면 안 나간다 · 두 번 뛰기 · 대시');
{
  const world = mk('kkang'); const b = rally(world);
  run(world, 2);
  const me = world.mp.myId, p = world.player;
  world.input.jump = true; run(world, 1); world.input.jump = false;
  run(world, 10);
  tap(world, 'guard');
  ok('기세 0 — 안 나간다', !p.doubled);
  b.gauge.set(me, 4);
  run(world, 1);
  const vyBefore = p.vy;
  tap(world, 'guard');
  ok('공중 ⌥C — 한 번 더 뛴다', p.doubled && p.vy > vyBefore + 200);
  check('기세를 다 쓴다', b.gauge.get(me), 0);
  b.gauge.set(me, 4);
  tap(world, 'guard');
  ok('한 번 뜬 동안 두 번은 안 된다', b.gauge.get(me) === 4);
  let apex = 0; run(world, 60, () => { apex = Math.max(apex, p.air); });
  note(`두 번 뛰기 꼭대기 ${apex.toFixed(0)}px`);
  ok('그냥 점프보다 높다', apex > 90 && apex < 135);
  // 땅에서는 안 된다
  b.gauge.set(me, 4); run(world, 30);
  tap(world, 'guard');
  ok('땅에서는 안 나간다', b.gauge.get(me) === 4);

  const w2 = mk('beongae'); const b2 = rally(w2); run(w2, 2);
  const q = w2.player; q.x = 200; b2.gauge.set(w2.mp.myId, 4);
  w2.input.right = true; tap(w2, 'guard'); w2.input.right = false;
  check('번개 — 오른쪽으로 120px', Math.round(q.x), 320);
  b2.gauge.set(w2.mp.myId, 4);
  q.x = w2.w / 2 - 60;
  w2.input.right = true; tap(w2, 'guard'); w2.input.right = false;
  ok('대시로 네트를 못 넘는다', q.x < w2.w / 2);
}

say('스킬 — 벼락 · 말랑 받기 · 건지기 (켜 두면 다음 한 번)');
{
  // 벼락 — 다음 스파이크 ×1.35, 불꽃
  const plain = rig('mangchi', { off: [30, 10], keys: { right: true } });
  spike(plain.world);
  const base = Math.hypot(plain.b.ball.vx, plain.b.ball.vy);
  const r = rig('mangchi', { off: [30, 10], keys: { right: true } });
  r.b.gauge.set(r.world.mp.myId, 4);
  tap(r.world, 'guard');
  check('켜 두었다', r.b.armed.get(r.world.mp.myId), 'thunder');
  spike(r.world);
  const bolt = Math.hypot(r.b.ball.vx, r.b.ball.vy);
  note(`벼락 ${bolt.toFixed(0)} / 보통 ${base.toFixed(0)} = ×${(bolt / base).toFixed(2)}`);
  ok('×1.3 넘게 세다', bolt / base > 1.3);
  ok('불꽃이 붙었다', r.b.ball.fire > 0);
  ok('한 번 쓰면 꺼진다', !r.b.armed.has(r.world.mp.myId));

  // 말랑 받기 — 땅에서 받은 공이 네트 앞 높이로
  const s = rig('dubu', { air: 0, off: [10, 10], x: 300 });
  s.b.gauge.set(s.world.mp.myId, 4);
  tap(s.world, 'guard');
  s.b.ball.y = s.p.groundY - BODY_H * 0.8; s.b.ball.x = s.p.x + 10;
  spike(s.world);
  // 높이 떴다가 **때리는 자리로 떨어지나** — 내려오며 손끝 높이를 지날 때 네트 앞인가
  const want = s.world.groundY - 65 - BODY_H * 0.86 - 6;
  let top = 1e9, at = null, t = 0;
  for (let i = 0; i < 150 && !at; i++) {
    volley.update(s.world, FR);
    top = Math.min(top, s.b.ball.y);
    if (s.b.ball.vy > 0 && s.b.ball.y >= want) { at = s.b.ball.x; t = i * FR; }
  }
  const netX = s.world.w / 2;
  note(`말랑 받기 — 꼭대기가 손끝보다 ${(want - top).toFixed(0)}px 위 · ${t.toFixed(2)}초 뒤 네트 ${(netX - at).toFixed(0)}px 앞에서 손끝 높이`);
  ok('높이 뜬다 (손끝보다 90px 넘게 위)', want - top > 90);
  ok('네트 앞 40~120px 로 떨어진다', netX - at > 40 && netX - at < 120);
  ok('달려가 뛸 시간이 있다 (0.7초 넘게)', t > 0.7);

  // 건지기 — 바닥 직전 공을 한 번
  const world = mk('muneo'); const b = rally(world); run(world, 2);
  world.player.x = 100;
  b.gauge.set(world.mp.myId, 4);
  tap(world, 'guard');
  b.ball.x = 500; b.ball.y = world.groundY - 30; b.ball.vx = 0; b.ball.vy = 600;
  run(world, 4);
  check('바닥에 안 닿았다 — 점수 없음', b.score, [0, 0]);
  ok('공이 다시 뜬다', b.ball.vy < 0);
  run(world, 150);
  ok('두 번째는 못 건진다 — 결국 떨어진다', b.score[1] === 1);
}

say('같이 할 때 — 손님 캐릭터를 방장이 안다 · 스킬은 방장이 판정');
{
  const r = room('volley');
  const g = r.join();
  g.mp.myCast = 'muneo';
  r.advance(30); r.again(); r.advance(90);
  const h = r.host;
  check('방장이 아는 손님 캐릭터 (들어오기 전에 고른 것)', h.mp.volleyActive.get(g.mp.myId), 'muneo');
  check('손님 화면에 방장 생김새', g.mp.others.get(h.mp.myId)?.look, 'dubu');
  check('방장 화면에 손님 생김새', h.mp.others.get(g.mp.myId)?.look, 'muneo');
  // 손님이 랠리 중에 바꾼다
  h.bag.serving = false; h.bag.wait = 0;
  volley.pickCast(g, null, 'beongae');
  r.advance(10);
  check('방장도 「골랐다」는 안다', h.mp.volleyCast.get(g.mp.myId), 'beongae');
  check('아직 문어로 뛴다', h.mp.volleyActive.get(g.mp.myId), 'muneo');
  h.bag.ball.x = 120; h.bag.ball.y = h.groundY - 22; h.bag.ball.vx = 0; h.bag.ball.vy = 300;
  r.advance(20);
  check('점수가 끝나면 번개', h.mp.volleyActive.get(g.mp.myId), 'beongae');
  check('손님 몸도 번개 배율', g.player.runMul, 1.2);
  // 손님 스킬 — 기세가 차 있어야, 방장이 쓴 것으로 적는다
  h.bag.gauge.set(g.mp.myId, 4);
  r.advance(5);
  g.player.x = 1000;
  g.input.right = true; tap(g, 'guard'); g.input.right = false;
  r.advance(10);
  check('방장 화면 손님 기세 0', h.bag.gauge.get(g.mp.myId), 0);
  // 기세 없이 보낸 부탁은 방장이 버린다
  volley.message(h, g.mp.myId, { t: 'gm', k: 'skill' });
  ok('기세 없는 부탁은 무시', h.bag.gauge.get(g.mp.myId) === 0 && !h.bag.armed.has(g.mp.myId));
  // 이상한 캐릭터 이름은 무시
  volley.message(h, g.mp.myId, { t: 'gm', c: '해커' });
  check('모르는 이름은 안 받는다', h.mp.volleyCast.get(g.mp.myId), 'beongae');
}

say('그림 — 다섯 명 모두 그린다 (덧그림 · 긴 팔)');
{
  const { createCanvas } = await import('canvas');
  const cv = createCanvas(200, 200); const ctx = cv.getContext('2d');
  for (const c of C.CAST) {
    const p = { id: 1, x: 100, groundY: 180, air: 0, vx: 0, vy: 0, crouch: 0, facing: 1, walk: 0, dead: false,
                swing: 0, toss: 0, block: 0, slide: 0, look: c.id };
    let fine = true;
    try { volley.figure(ctx, p, 0, 3, { color: '#b5352f' }); } catch (e) { fine = false; note(e.message); }
    ok(`${c.name} 그린다`, fine);
  }
  const world = mk('mangchi'); w.press(world, 'menu', true);
  world.menu.path = ['cast']; world.menu.index = 2;
  const { drawMenu } = await import(R + 'draw/hud.js');
  let fine = true;
  try { drawMenu(createCanvas(1512, 944).getContext('2d'), world); } catch (e) { fine = false; note(e.message); }
  ok('캐릭터 메뉴 + 카드를 그린다', fine);
  check('지금 캐릭터에 「지금」', w.menuItems(world).findIndex((i) => i.note.startsWith('지금')), 2);
}

done('배구 캐릭터');
