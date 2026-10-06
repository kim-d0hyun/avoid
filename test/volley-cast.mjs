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

say('표 — 열 명, 능력치 여섯의 합은 모두 18, 스파이크는 2 이상(1:1 이라 누구나 때려야 한다)');
{
  check('열 명', C.CAST.map((c) => c.name), ['두부', '깡총', '망치', '번개', '문어', '콩떡', '벽돌', '풍선', '나비', '메아리']);
  for (const c of C.CAST) {
    const sum = Object.values(c.st).reduce((a, v) => a + v, 0);
    ok(`${c.name} — 능력치 여섯 · 합 18 (${Object.values(c.st).join('/')})`, sum === 18 && Object.keys(c.st).length === 6);
    ok(`${c.name} — 스파이크 ${c.st.spike} ≥ 2`, c.st.spike >= 2);
    ok(`${c.name} — 스킬 ${c.skill.name}`, ['arm', 'now'].includes(c.skill.kind));
  }
  check('두부는 지금 게임 그대로 (전부 3)', C.statsOf('dubu'),
        { run: 1, jumpH: 65, jump: 1, spike: 1, reach: 1, serve: 1, block: 1, fall: 1, sense: 1 });
  ok('스킬 아이디가 다 다르다', new Set(C.CAST.map((c) => c.skill.id)).size === C.CAST.length);
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

/// 내 서브 차례로 만든다 (대기 끝).
function serving(cast, side = 0) {
  const world = mk(cast); world.state = 'play';
  volley.update(world, FR);
  const b = world.bag;
  b.started = true; b.serving = true; b.serveBy = side; b.wait = 0; b.charge = -1; b.mustCross = null;
  world.player.x = 200;
  run(world, 2);
  return { world, b, p: world.player };
}
/// ⌥Space 를 secs 초 잡았다 놓는다. 그 사이 each 를 부른다.
function holdServe(world, secs, each) {
  w.press(world, 'grab', true);
  run(world, Math.round(secs * 60), each);
  w.press(world, 'grab', false);
}

say('서브 — 능력치 · 점프 서브 · 회오리 서브(콩떡)');
{
  const speed = (cast) => { const { world, b } = serving(cast); holdServe(world, 0.7); return Math.abs(b.ball.vx); };
  const strong = speed('kongtteok'), mid = speed('dubu'), weak = speed('kkang');
  note(`서브 가로 빠르기 — 콩떡 ${strong.toFixed(0)} · 두부 ${mid.toFixed(0)} · 깡총 ${weak.toFixed(0)}`);
  ok('콩떡(5)이 두부보다 빠르다', strong > mid * 1.05);
  ok('깡총(2)이 두부보다 느리다', weak < mid * 0.97);
  // 점프 서브 — 잡은 채 뛰어서 놓는다
  {
    const { world, b, p } = serving('dubu');
    w.press(world, 'grab', true);
    run(world, 28);
    world.input.jump = true; run(world, 1); world.input.jump = false;
    run(world, 12);
    ok('떠 있다', p.air > 12);
    w.press(world, 'grab', false);
    ok('점프 서브가 나갔다', !b.serving && Math.abs(b.ball.vx) > mid * 1.1);
    let crossed = false; run(world, 120, () => { crossed ||= b.ball.x > world.w / 2; });
    ok('점프 서브도 네트를 넘는다', crossed);
  }
  {
    const { world, b, p } = serving('dubu');
    w.press(world, 'grab', true);
    run(world, 44);
    world.input.jump = true; run(world, 1); world.input.jump = false;
    run(world, 12);
    w.press(world, 'grab', false);
    ok('너무 오래 잡은 점프 서브는 실패 (보통 서브라면 아직 괜찮을 시간)', b.score[1] === 1);
  }
  // 회오리 서브
  {
    const { world, b } = serving('kongtteok');
    b.gauge.set(world.mp.myId, 4);
    tap(world, 'guard');
    check('켜 두었다', b.armed.get(world.mp.myId), 'spin');
    holdServe(world, 0.5);
    ok('흔들리는 공', b.ball.wobble > 0);
    const vxs = []; let crossed = false;
    run(world, 70, () => { vxs.push(b.ball.vx); crossed ||= b.ball.x > world.w / 2; });
    const swing = Math.max(...vxs.slice(0, 40)) - Math.min(...vxs.slice(0, 40));
    note(`회오리 — 가로 빠르기가 ${swing.toFixed(0)}px/s 폭으로 흔들린다`);
    ok('가로 빠르기가 크게 흔들린다', swing > 300);
    ok('그래도 네트는 넘는다', crossed);
    const w2 = rally(mk('kongtteok')); const world2 = mk('kongtteok'); const b2 = rally(world2); void w2;
    b2.gauge.set(world2.mp.myId, 4); tap(world2, 'guard');
    ok('내 서브가 아니면 못 켠다', !b2.armed.has(world2.mp.myId) && b2.gauge.get(world2.mp.myId) === 4);
  }
}

say('블로킹 — 능력치(폭·다시 막기) · 만리장성(벽돌) · 터치아웃');
{
  // 네트 앞에서 뛰어 벽을 세운 사람에게 공을 쏜다
  const wallRig = (cast, { arm = false, aim = 0, dy = 0, dx = 0 } = {}) => {
    const world = mk(cast); const b = rally(world); run(world, 2);
    const p = world.player, netX = world.w / 2;
    p.x = netX - 40; p.air = 50; p.vy = 0;
    if (arm) { b.gauge.set(world.mp.myId, 4); tap(world, 'guard'); }
    world.input.left = aim < 0; world.input.right = aim > 0;
    b.ball.x = netX + 60; b.ball.y = p.groundY - p.air - BODY_H - 10 + dy; b.ball.vx = 0; b.ball.vy = 0;
    ok(`${cast} 벽을 세웠다`, spike(world));
    world.input.left = false; world.input.right = false;
    b.ball.x = netX + 30 + dx; b.ball.vx = -900; b.ball.vy = 0;
    let back = null;
    run(world, 6, () => { if (back === null && b.ball.vx > 0) back = { vx: b.ball.vx, vy: b.ball.vy }; });
    return { world, b, p, back };
  };
  // 높이 — 벽 위쪽 끝을 스치는 공 (두부 벽보다 4px 위)
  // 공이 벽 꼭대기에서 51px 위 — 두부 벽(30 + 공 반지름 28)은 못 닿고, 벽돌 벽(36 + 28)은 닿는다
  const hi = (cast) => wallRig(cast, { dy: -51 }).back;
  ok('두부 벽은 그 높이를 못 막는다', !hi('dubu'));
  ok('벽돌(5) 벽은 막는다', !!hi('byeokdol'));
  const plain = wallRig('dubu').back;
  ok('보통 블로킹 — 되돌려 보냈다', !!plain);
  const deep = wallRig('dubu', { aim: 1 }).back;      // 빨강(왼쪽) — 상대 쪽은 오른쪽
  const short = wallRig('dubu', { aim: -1 }).back;
  note(`터치아웃 — 보통 vx ${plain.vx.toFixed(0)} · 깊게 ${deep.vx.toFixed(0)} · 짧게 ${short.vx.toFixed(0)}`);
  ok('상대 쪽 방향키 — 더 깊게', deep.vx > plain.vx * 1.15);
  ok('내 쪽 방향키 — 네트 너머로 짧게 (가로를 덜고 아래로)', short.vx < plain.vx * 0.5 && short.vy > plain.vy);
  const wall = wallRig('byeokdol', { arm: true });
  ok('만리장성 — 그대로 꽂힌다 (아래로 빠르게)', wall.back && wall.back.vy > plain.vy * 1.8);
  ok('한 번 쓰면 꺼진다', !wall.b.armed.has(wall.world.mp.myId));
  // 다시 막기까지
  const cool = (cast) => { const r = wallRig(cast); return r.p.blockCool; };
  ok('벽돌(5)은 다시 막기까지 짧다', cool('byeokdol') < cool('dubu'));
}

say('공중 — 둥실(풍선) · 체공(풍선) · 시간차(누구나)');
{
  const air = (cast, during) => {
    const world = mk(cast); const b = rally(world); run(world, 2);
    const p = world.player; p.x = 300;
    world.input.jump = true; run(world, 1); world.input.jump = false;
    let n = 0, apex = 0;
    while (n < 240) { during?.(world, b, p, n); w.update(world, FR); apex = Math.max(apex, p.air); n++; if (p.air <= 0) break; }
    return { frames: n, apex };
  };
  const base = air('dubu');
  const floaty = air('pungseon');
  note(`뜬 시간 — 두부 ${base.frames}프레임 · 풍선 ${floaty.frames}프레임 (체공)`);
  ok('풍선은 같은 높이를 더 오래 떠 있다', floaty.frames > base.frames * 1.15 && Math.abs(floaty.apex - base.apex) < 3);
  const hov = air('pungseon', (world, b, p, n) => { if (n === 14) { b.gauge.set(world.mp.myId, 4); tap(world, 'guard'); } });
  note(`둥실 — ${hov.frames}프레임`);
  ok('둥실 — 0.6초쯤 더 떠 있다', hov.frames - floaty.frames > 30);
  const fake = air('dubu', (world, b, p, n) => { if (n === 3) tap(world, 'duck'); });
  note(`시간차 — 꼭대기 ${fake.apex.toFixed(0)}px (보통 ${base.apex.toFixed(0)}px)`);
  ok('시간차는 반도 안 뜬다', fake.apex < base.apex * 0.5);
  const late = air('dubu', (world, b, p, n) => { if (n === 15) tap(world, 'duck'); });
  ok('늦게 누른 ⌥↓ 는 시간차가 아니다', Math.abs(late.apex - base.apex) < 2);
}

say('정타 · 드롭 · 스파이크 — 감각(나비) · 네트 인(나비) · 그림자 스파이크(메아리)');
{
  // 감각 — 손끝에서 60px 떨어진 공을 꼭대기에서 친다: 두부는 강타, 나비는 정타
  const ace = (cast) => { const r = rig(cast, { air: 60, off: [40, -44], keys: { right: true } }); spike(r.world); return r.b.ball.ace; };
  ok('두부 — 정타 원 밖이라 그냥 강타', !ace('dubu'));
  ok('나비 — 감각으로 정타', ace('nabi'));
  // 네트 인 — 드롭이 네트 바로 너머에 떨어진다
  const landing = (arm) => {
    const r = rig('nabi', { air: 50, off: [20, 10], x: 600 });
    if (arm) { r.b.gauge.set(r.world.mp.myId, 4); tap(r.world, 'guard'); }
    tap(r.world, 'drop');
    // 점수가 나는 그 프레임에 공이 서브 자리로 돌아간다 — 바로 앞 프레임 자리를 떨어진 자리로 본다.
    let x = null, last = r.b.ball.x;
    run(r.world, 150, () => { if (x === null && r.b.score[1] + r.b.score[0] > 0) x = last; last = r.b.ball.x; });
    return x - r.world.w / 2;
  };
  const tipX = landing(false), netIn = landing(true);
  note(`드롭이 떨어진 자리 — 그냥 네트에서 ${tipX?.toFixed(0)}px · 네트 인 ${netIn?.toFixed(0)}px`);
  ok('네트 인은 네트 바로 너머(15~70px)에 떨어진다', netIn > 15 && netIn < 70);
  ok('그냥 드롭보다 짧다', netIn < tipX);
  // 그림자 스파이크 — 가짜 공이 진짜와 다른 쪽으로
  const g = rig('meari', { off: [30, 10], keys: { right: true } });
  g.b.gauge.set(g.world.mp.myId, 4); tap(g.world, 'guard');
  spike(g.world);
  ok('가짜 공이 떴다', g.b.ghost?.t > 0);
  const turn = Math.abs(Math.atan2(g.b.ghost.vy, g.b.ghost.vx) - Math.atan2(g.b.ball.vy, g.b.ball.vx));
  note(`가짜가 비튼 각 ${(turn * 180 / Math.PI).toFixed(1)}°`);
  ok('가짜는 진짜와 **조금만** 다른 각 (5~10° — 한눈에 안 갈리게)', turn > 0.08 && turn < 0.17);
  // 진짜가 히트스톱에 멈춘 동안 가짜도 기다린다 — 따로 먼저 날아가면 가짜인 게 티 난다
  const gx0 = g.b.ghost.x;
  g.world.bag.stop > 0 && volley.update(g.world, FR);
  ok('멈춘 동안 가짜도 그 자리', Math.abs(g.b.ghost.x - gx0) < 0.5);
  // **제 코트 바닥에 박히지 않는다** — 네트를 넘어 상대 코트 쪽으로 간다 (예전엔 6프레임 만에 바닥에 박혀 굴렀다)
  const netX = g.world.w / 2;
  let lowMine = false, crossed = false, near = null, far = 0, n = 0;
  run(g.world, 45, () => {
    const gh = g.b.ghost;
    if (!(gh?.t > 0)) return;
    if (!(gh.wait > 0)) {
      n++;
      const apart = Math.hypot(gh.x - g.b.ball.x, gh.y - g.b.ball.y);
      if (n === 12) near = apart;                 // 0.2초 뒤
      far = Math.max(far, apart);
    }
    if (gh.x < netX && gh.y > g.world.groundY - 60) lowMine = true;
    if (gh.x > netX) crossed = true;
  });
  ok('가짜가 내 코트 바닥 쪽으로 안 꽂힌다', !lowMine);
  ok('가짜도 네트를 넘는다', crossed);
  note(`두 공 사이 — 0.2초 뒤 ${near?.toFixed(0)}px · 가장 멀 때 ${far.toFixed(0)}px`);
  ok('0.2초 뒤에도 붙어 간다 (80px 안)', near !== null && near < 80);
  ok('갈수록 벌어진다 (진짜가 떨어지기 전까지)', far > near + 15);
  ok('가짜도 진짜처럼 돌고 잔상을 남긴다 (같은 그림으로 그린다)', (g.b.ghost.tail?.length ?? 0) > 3 && Number.isFinite(g.b.ghost.spin));
  ok('0.6초 안팎에 사라진다', !(g.b.ghost.t > 0));
  // 꽂는 스파이크(↓)일 때도
  const g2 = rig('meari', { off: [30, 30], keys: { duck: true } });
  g2.b.gauge.set(g2.world.mp.myId, 4); tap(g2.world, 'guard'); spike(g2.world);
  let low2 = false, cross2 = false;
  run(g2.world, 45, () => { const gh = g2.b.ghost; if (!(gh?.t > 0)) return;
    if (gh.x < netX && gh.y > g2.world.groundY - 60) low2 = true; if (gh.x > netX) cross2 = true; });
  ok('내리꽂기 때도 가짜가 네트를 넘는다', cross2 && !low2);
  // 진짜가 떨어져 점수가 나면 가짜도 같이 거둔다
  const g3 = rig('meari', { off: [30, 30], keys: { duck: true } });
  g3.b.gauge.set(g3.world.mp.myId, 4); tap(g3.world, 'guard'); spike(g3.world);
  let left = false;
  run(g3.world, 45, () => { if (g3.b.score[0] > 0 && g3.b.ghost?.t > 0) left = true; });
  ok('점수가 나면 가짜 공도 사라진다', g3.b.score[0] > 0 && !left);
}

say('같이 할 때 — 새 스킬도 방장이 판정 · 가짜 공은 손님 화면에도');
{
  const r = room('volley');
  const g = r.join();
  g.mp.myCast = 'meari';
  r.advance(30); r.again(); r.advance(90);
  const h = r.host;
  check('손님은 메아리', h.mp.volleyActive.get(g.mp.myId), 'meari');
  h.bag.gauge.set(g.mp.myId, 4);
  r.advance(5);
  tap(g, 'guard');
  r.advance(8);
  check('방장이 그림자 스파이크를 켰다', h.bag.armed.get(g.mp.myId), 'ghost');
  h.bag.ghost = { x: 900, y: 400, vx: 800, vy: 0, t: 0.35, seq: 7 };
  r.advance(4);
  ok('손님 화면에도 가짜 공', g.bag.ghost?.t > 0 && g.bag.ghostSeq === 7);
  // 손님의 블로킹 방향(터치아웃)이 방장에게 간다
  const other = h.mp.others.get(g.mp.myId);
  volley.message(h, g.mp.myId, { t: 'gm', k: 'block', h: -1 });
  ok('터치아웃 방향이 방장에게 (블로킹을 못 세운 자리면 무시)', other.blockAim === -1 || !(other.block > 0));
}

say('스킬 표시 — 지금 쓸 수 있나');
{
  const { skillState } = await import(R + 'games/volley.js');
  const world = mk('kkang'); const b = rally(world); run(world, 2);
  const me = world.mp.myId;
  check('기세가 모자라면', skillState(world).why, '기세 0/4');
  b.gauge.set(me, 4);
  check('두 번 뛰기는 땅에서는', skillState(world).why, '뛰어서');
  world.input.jump = true; run(world, 1); world.input.jump = false; run(world, 4);
  ok('뜨면 쓸 수 있다', skillState(world).ready);
  tap(world, 'guard');
  ok('쓰고 나면 못 쓴다', !skillState(world).ready);
  const w2 = mk('mangchi'); const b2 = rally(w2); run(w2, 2);
  b2.gauge.set(w2.mp.myId, 4);
  ok('벼락 — 기세가 차면 바로', skillState(w2).ready);
  tap(w2, 'guard');
  check('켜 두면 「켬」', skillState(w2).why, '켬');
  const s3 = serving('kongtteok'); s3.b.gauge.set(s3.world.mp.myId, 4);
  ok('회오리 — 내 서브 때는 된다', skillState(s3.world).ready);
  const w4 = mk('kongtteok'); const b4 = rally(w4); run(w4, 2); b4.gauge.set(w4.mp.myId, 4);
  check('회오리 — 랠리 중에는', skillState(w4).why, '내 서브 때');
}

say('그림 — 열 명 모두 그린다 (덧그림 · 긴 팔)');
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
  check('메뉴에 열 명', w.menuItems(world).length, 10);
}

done('배구 캐릭터');
