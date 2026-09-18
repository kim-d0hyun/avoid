// 알까기 — 물리(충돌·마찰·터널링·결정론) · 세 단계 조작 · 10초 · 판정 · 꾸러미.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R0 = new URL('../src/', import.meta.url).href;
const w = await import(R0 + 'game/world.js');
const { games } = await import(R0 + 'games/index.js');
const alk = games.find((g) => g.id === 'alk');
const mod = await import(R0 + 'games/alkkagi.js');
const { R, FRICTION, VMAX, VMIN, BOUNCE, STOP, TURN_SECS, GAUGE_CYCLE, CREW,
        step, roll, still, speedOf, gaugeAt, shoot, lineUp, bestShot,
        fire, mine, whoseTurn, myTurn, seatsOf, layout, aliveOf } = mod;

import { check, ok, say, note, done } from './check.mjs';

const FR = 1 / 60;
function mk(width = 1512, height = 944) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'alk');
  world.onRecord = () => {}; world.onGameOver = (r) => { world.ended = r; }; world.onMenu = () => {};
  w.resize(world, width, height);
  w.spread(world);
  world.state = 'play';
  return world;
}
function join(world, id, side) {
  world.mp.others.set(id, { id, name: `손${id}`, x: 0, groundY: 0, air: 0, vx: 0, vy: 0,
                            dead: false, waiting: false, deadFor: 0, facing: 1, walk: 0,
                            crouch: 0, grabbing: -1, heldBy: -1, grabAim: 0, slide: 0 });
  if (side !== undefined) (world.mp.alkSides ??= new Map()).set(id, side);
  w.update(world, FR);
  return world.mp.others.get(id);
}
const one = (x, y, vx = 0, vy = 0, side = 0) => ({ x, y, vx, vy, side, alive: true });
const energy = (men) => men.reduce((s, m) => s + (m.alive ? m.vx * m.vx + m.vy * m.vy : 0), 0);
const speed = (m) => Math.hypot(m.vx, m.vy);

say('판과 돌 — 판 한 변을 1 로 센다 (창 크기와 물리를 떼어 놓는다)');
{
  const men = lineUp();
  check('편마다 다섯 개', [aliveOf(men, 0), aliveOf(men, 1)], [CREW, CREW]);
  ok('다 판 안에 있다', men.every((m) => m.x > R && m.x < 1 - R && m.y > R && m.y < 1 - R));
  ok('서로 안 겹친다', men.every((a, i) => men.every((b, j) =>
    i === j || Math.hypot(a.x - b.x, a.y - b.y) >= R * 2 - 1e-9)));
  check('검정은 아래, 하양은 위', [men[0].y > 0.5, men[CREW].y < 0.5], [true, true]);
  // **엇갈려 놓는다.** 마주 보게 두면 첫 수를 곧게 쏘는 것만으로 공짜로 한 개를 먹는다.
  ok('두 줄이 같은 세로줄에 마주 서 있지 않다',
     men.filter((m) => m.side === 0).every((a) =>
       men.filter((m) => m.side === 1).every((c) => Math.abs(a.x - c.x) > R * 1.5)));
  // 창을 줄여도 물리 좌표는 그대로다
  const big = layout(mk(1512, 944)), small = layout(mk(900, 600));
  ok('창이 작아지면 판도 작아진다', small.size < big.size);
  ok('그래도 물리는 판 좌표라 안 바뀐다', R === 0.024);
}

say('정면 충돌 — 쏜 돌이 서고 맞은 돌이 그대로 나간다');
{
  // 딱 붙여 놓고 아주 짧게 굴린다 (마찰이 끼어들지 않게)
  const men = [one(0.4, 0.5, 2, 0), one(0.4 + R * 2 - 1e-6, 0.5, 0, 0, 1)];
  step(men, 1e-5);
  note(`쏜 돌 ${men[0].vx.toFixed(3)} · 맞은 돌 ${men[1].vx.toFixed(3)} (반발 ${BOUNCE})`);
  // 같은 질량이면 v1' = v(1−e)/2, v2' = v(1+e)/2
  ok('쏜 돌은 거의 선다', Math.abs(men[0].vx - 2 * (1 - BOUNCE) / 2) < 0.02);
  ok('맞은 돌이 거의 다 받는다', Math.abs(men[1].vx - 2 * (1 + BOUNCE) / 2) < 0.02);
  ok('옆으로는 안 튄다', Math.abs(men[0].vy) < 1e-9 && Math.abs(men[1].vy) < 1e-9);
}

say('비스듬한 충돌 — 두 중심을 잇는 선 방향만 주고받는다');
{
  // 45도로 붙여 놓는다
  const d = R * 2 - 1e-6;
  const men = [one(0.4, 0.5, 2, 0), one(0.4 + d / Math.SQRT2, 0.5 + d / Math.SQRT2, 0, 0, 1)];
  step(men, 1e-5);
  note(`쏜 돌 (${men[0].vx.toFixed(2)}, ${men[0].vy.toFixed(2)}) · 맞은 돌 (${men[1].vx.toFixed(2)}, ${men[1].vy.toFixed(2)})`);
  ok('맞은 돌은 두 중심을 잇는 쪽으로 간다', Math.abs(men[1].vx - men[1].vy) < 0.02);
  ok('쏜 돌은 갈라져 나간다', men[0].vx > 0.2 && men[0].vy < -0.2);
  ok('둘이 갈라진다', men[0].vy < 0 && men[1].vy > 0);
}

say('에너지는 늘지 않는다 — 반발계수가 1보다 작으니 줄기만 한다');
{
  const men = [];
  for (let i = 0; i < 8; i++) men.push(one(0.2 + i * 0.07, 0.5 + (i % 2) * 0.05, 0, 0, i % 2));
  men[0].vx = 3.8; men[0].vy = 0.4;
  const first = energy(men);
  let top = 0;
  for (let f = 0; f < 240; f++) { roll(men, FR); top = Math.max(top, energy(men)); }
  note(`처음 ${first.toFixed(2)} · 굴리는 동안 최대 ${top.toFixed(2)}`);
  ok('처음보다 커지지 않는다', top <= first + 1e-6);
  ok('끝에는 다 멎는다', still(men));
}

say('터널링 — 최대 속도로도 돌을 통과하지 않는다');
{
  let missed = 0;
  for (let n = 0; n < 400; n++) {
    // 왼쪽 끝에서 최대 속도로 쏘고, 오른쪽에 돌을 세워 둔다. 반드시 맞아야 한다.
    const y = 0.5 + (n % 20) * 0.001;
    const men = [one(0.05, y, VMAX, 0), one(0.6, 0.5, 0, 0, 1)];
    const was = { x: men[1].x, v: 0 };
    for (let f = 0; f < 240 && !still(men); f++) roll(men, FR);
    if (Math.abs(men[1].x - was.x) < 1e-6 && men[1].alive) missed++;
  }
  note(`400번 쏴서 통과한 것 ${missed}번`);
  ok('한 번도 안 통과한다', missed === 0);
  // 부분 스텝을 안 쓰면 어떻게 되는지 — 한 프레임을 통째로 굴려 보면 통과한다
  const naive = [one(0.05, 0.5, VMAX, 0), one(0.05 + VMAX * FR * 0.5, 0.5, 0, 0, 1)];
  step(naive, FR);
  ok('한 프레임을 통째로 굴리면 통과한다 (그래서 쪼갠다)',
     Math.abs(naive[1].vx) < 1e-9 && naive[0].x > naive[1].x);
}

say('마찰 — 등감속이라 정지 거리가 v²/2a 그대로 나온다');
{
  const far = (v) => {
    const men = [one(0.02, 0.5, v, 0)];
    let went = 0;
    for (let f = 0; f < 600 && !still(men); f++) {
      const was = men[0].x;
      roll(men, FR);
      if (!men[0].alive) { went += 1 - was; break; }
      went += men[0].x - was;
    }
    return went;
  };
  const want = (v) => (v * v) / (2 * FRICTION);
  note(`최대 힘 ${far(VMAX).toFixed(2)} (셈 ${want(VMAX).toFixed(2)}) · 최소 힘 ${far(VMIN).toFixed(3)} (셈 ${want(VMIN).toFixed(3)})`);
  ok('최소 힘은 돌 지름 두 배쯤 간다', Math.abs(far(VMIN) - want(VMIN)) < 0.02);
  // **최대 힘의 정지 거리가 판 한 변쯤**이라야 「맞았는데 남았다」가 생긴다.
  ok('최대 힘은 판 한 변쯤 간다', want(VMAX) > 0.85 && want(VMAX) < 1.15);
  // **최대 힘으로 앞으로 쏘면 제 돌이 판을 나간다.** 정지 거리 1.9인데 판은 1이다 —
  // 이게 이 게임의 긴장 전부다. 「제일 세게」가 늘 정답이면 게이지가 뜻이 없다.
  const suicide = lineUp();
  shoot(suicide, 0, -90, 1);
  for (let f = 0; f < 300 && !still(suicide); f++) roll(suicide, FR);
  ok('최대 힘으로 곧게 쏘면 제 돌이 나간다', !suicide[0].alive);
  // 어떤 힘이든 4초 안에 멎는다 (판 안에서 부딪히며 굴러도)
  const men = [];
  for (let i = 0; i < 6; i++) men.push(one(0.3 + i * 0.06, 0.5, 0, 0, i % 2));
  men[0].vx = VMAX * 0.8; men[0].vy = 0.2;
  let secs = 0;
  for (; secs < 600 && !still(men); secs++) roll(men, FR);
  note(`여섯 개가 뒤엉킨 샷이 멎기까지 ${(secs / 60).toFixed(2)}초`);
  ok('4초 안에 다 멎는다', secs < 240);
}

say('판 밖 — 중심이 나가면 죽는다. 벽이 없다');
{
  const men = [one(0.9, 0.5, 3, 0)];
  for (let f = 0; f < 120 && men[0].alive; f++) roll(men, FR);
  ok('판을 넘어간 돌은 없어진다', !men[0].alive);
  ok('튕겨 돌아오지 않는다', men[0].vx === 0 && men[0].vy === 0);
  // 끝에 걸쳐 멎으면 산 것이다 (중심이 기준)
  const edge = [one(1 - R * 0.5, 0.5, 0, 0)];
  roll(edge, FR);
  ok('끝에 걸쳐 있으면 산 것', edge[0].alive);
}

say('결정론 — 같은 샷이면 같은 판이 된다 (그래서 세 값만 보내면 된다)');
{
  const runOnce = () => {
    const men = lineUp();
    shoot(men, 2, -84, 0.83);
    for (let f = 0; f < 300 && !still(men); f++) roll(men, FR);
    return men.map((m) => [Math.round(m.x * 1e6), Math.round(m.y * 1e6), m.alive ? 1 : 0]);
  };
  check('두 번 굴려 같은 자리', runOnce(), runOnce());
  // 프레임을 다르게 쪼개면 값이 달라진다 — 그래서 모두 같은 dt 로 굴려야 한다
  const half = (() => {
    const men = lineUp();
    shoot(men, 2, -84, 0.83);
    for (let f = 0; f < 600 && !still(men); f++) roll(men, FR / 2);
    return men.map((m) => m.alive ? 1 : 0);
  })();
  note(`1/60 로 굴린 결말과 1/120 로 굴린 결말이 같은가: ${JSON.stringify(half) === JSON.stringify(runOnce().map((r) => r[2]))}`);
}

say('게이지 — 톱니다. 가득 찼다가 0으로 뚝');
{
  check('바닥에서 시작', gaugeAt(0), 0);
  ok('반 바퀴면 절반', Math.abs(gaugeAt(GAUGE_CYCLE / 2) - 0.5) < 1e-9);
  ok('거의 한 바퀴면 거의 가득', gaugeAt(GAUGE_CYCLE * 0.999) > 0.99);
  ok('한 바퀴를 넘기면 0으로 떨어진다', gaugeAt(GAUGE_CYCLE * 1.01) < 0.02);
  ok('두 바퀴째도 같다', Math.abs(gaugeAt(GAUGE_CYCLE * 1.5) - 0.5) < 1e-9);
  check('게이지 0 은 최소 힘', speedOf(0), VMIN);
  check('게이지 1 은 최대 힘', speedOf(1), VMAX);
  ok('가운데는 그 사이', speedOf(0.5) > VMIN && speedOf(0.5) < VMAX);
}

say('세 단계 — 고르기 → 각 재기 → 힘 채우기');
{
  const world = mk(); const b = world.bag;
  world.team = 0;
  check('내 차례에 고르기부터', [b.turn, b.phase], [0, 'pick']);
  ok('내 돌만 고를 수 있다', mine(b, 0).every((i) => b.men[i].side === 0));
  check('내 돌 다섯', mine(b, 0).length, CREW);
  const first = b.pick;
  alk.tap(world, 'right');
  ok('⌥→ 로 옆 돌', b.pick !== first);
  alk.tap(world, 'left');
  check('⌥← 로 되돌아온다', b.pick, first);
  alk.action(world);
  check('스페이스로 각 재기로', b.phase, 'aim');
  const deg = b.deg;
  alk.tap(world, 'right');
  ok('⌥→ 로 각이 돈다', b.deg !== deg);
  alk.tap(world, 'duck');
  check('⌥↓ 로 고르기로 되돌아간다', b.phase, 'pick');
  alk.action(world); alk.action(world);
  check('한 번 더 누르면 힘 채우기', b.phase, 'charge');
  for (let f = 0; f < 27; f++) w.update(world, FR);     // 0.45초 — 게이지 절반
  ok('잡고 있으면 게이지가 찬다', b.gauge > 0.4 && b.gauge < 0.6);
  const half = b.gauge;
  alk.release(world);
  check('떼면 굴러간다', b.phase, 'roll');
  const shot = b.men[b.pick];
  ok('떼는 순간의 값으로 나간다', Math.abs(Math.hypot(shot.vx, shot.vy) - speedOf(half)) < 0.01);
  // 굴러가는 동안은 다시 쏠 수 없다 (화살표도 안 그린다)
  alk.action(world);
  check('굴러가는 중에는 단계가 안 바뀐다', b.phase, 'roll');
  alk.tap(world, 'right');
  check('굴러가는 중에는 각도 안 돈다', b.phase, 'roll');
}

say('10초 — 넘기면 그 차례는 넘어간다');
{
  const world = mk(); const b = world.bag;
  world.team = 0;
  check('차례마다 10초', Math.round(b.left), TURN_SECS);
  for (let f = 0; f < 60 * 9; f++) w.update(world, FR);
  ok('9초째에는 아직 내 차례', b.turn === 0 && b.left > 0);
  let flipped = 0;
  for (let f = 0; f < 60 * 2 && !flipped; f++) { w.update(world, FR); if (b.turn === 1) flipped = f; }
  ok('넘기면 차례가 넘어간다', flipped > 0);
  ok('시계도 다시 찬다', b.left > TURN_SECS - 2);
  ok('아무 데나 쏘지는 않는다', b.men.every((m) => m.vx === 0 && m.vy === 0) || b.phase === 'roll');
  ok('까닭을 알려 준다', /10초/.test(b.say ?? ''));
  // 넘어간 뒤로는 컴퓨터가 곧 쏘므로 마지막 줄이 아니다 — 어딘가에 남아 있으면 된다.
  ok('기록에도 남는다', b.log.some((r) => r.skip));
}

say('이기고 지는 것');
{
  const world = mk(); const b = world.bag;
  world.team = 0;
  // 하양 돌을 하나만 남기고 판 끝에 세운 뒤, 검정이 밀어낸다
  b.men = [one(0.5, 0.6, 0, 0, 0), one(0.5, 0.5 - R * 2 + 1e-6, 0, 0, 1)];
  b.men[1].y = 0.02;
  b.men[0].y = 0.02 + R * 2;
  b.turn = 0; b.phase = 'pick'; b.pick = 0;
  ok('쐈다', fire(world, 0, -90, 1));
  for (let f = 0; f < 300 && !b.over; f++) w.update(world, FR);
  ok('하양이 다 떨어지면 검정이 이긴다', b.over && b.winner === 0);
  ok('끝났다고 적어 둔다', /검정/.test(b.note ?? ''));
  // 내 돌로 쏴서 내 돌이 나가도 그대로 손해
  const w2 = mk(); const c = w2.bag;
  w2.team = 0;
  c.men = [one(0.5, 0.05, 0, 0, 0), one(0.2, 0.5, 0, 0, 1)];
  c.turn = 0;
  fire(w2, 0, -90, 1);
  for (let f = 0; f < 300 && !c.over; f++) w.update(w2, FR);
  ok('제 돌이 나가면 제 손해', c.over && c.winner === 1);
}

say('차례는 편 안에서도 돈다 — 여럿이서');
{
  const world = mk();
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1; world.team = 0;
  join(world, 2, 1); join(world, 3, 0); join(world, 4, 1);
  const b = world.bag;
  check('검정 둘', seatsOf(world, 0).map((s) => s.id), [1, 3]);
  check('하양 둘', seatsOf(world, 1).map((s) => s.id), [2, 4]);
  const order = [];
  for (let n = 0; n < 8; n++) {
    order.push(whoseTurn(world).id);
    // 아무 데나 살짝 밀어 차례만 넘긴다
    const i = mine(b, b.turn)[0];
    fire(world, i, b.turn === 0 ? -90 : 90, 0);
    for (let f = 0; f < 300 && b.phase === 'roll'; f++) w.update(world, FR);
  }
  check('검1 → 하1 → 검2 → 하2 … 로 돈다', order, [1, 2, 3, 4, 1, 2, 3, 4]);
}

say('편 바꾸기 — 둘이면 색을 맞바꾼다');
{
  const host = mk();
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1; host.team = 0;
  join(host, 2, 1);
  alk.swap(host, null, 1);
  check('맞바뀐다', [host.team, host.mp.alkSides.get(2)], [1, 0]);
  w.update(host, FR);
  check('양쪽에 한 명씩', [seatsOf(host, 0).length, seatsOf(host, 1).length], [1, 1]);
}

say('손님이 보내는 말 — 차례인 사람 것만 받는다');
{
  const host = mk();
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1; host.team = 0;
  join(host, 2, 1);
  const b = host.bag;
  alk.message(host, 2, { k: 'shot', i: mine(b, 1)[0], d: 90, g: 800 });
  check('차례가 아닌 손님 말은 흘린다', b.phase, 'pick');
  b.turn = 1;
  alk.message(host, 2, { k: 'shot', i: mine(b, 1)[0], d: 90, g: 800 });
  check('차례인 손님 말은 받는다', b.phase, 'roll');
  alk.message(host, 2, { k: 'shot', i: mine(b, 1)[0], d: 90, g: 800 });
  ok('굴러가는 중에는 또 안 받는다', b.log.length === 1);
  alk.message(host, 9, { k: 'shot', i: 0, d: 0, g: 500 });
  ok('명단에 없는 사람 말도 흘린다', b.log.length === 1);
}

say('꾸러미 — 손님이 같은 판을 본다');
{
  const host = mk();
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1; host.team = 0;
  join(host, 2, 1);
  fire(host, mine(host.bag, 0)[0], -80, 0.9);
  for (let f = 0; f < 3; f++) w.update(host, FR);     // 아직 굴러가는 중에 찍는다
  const guest = mk();
  guest.mp.on = true; guest.mp.role = 'guest'; guest.mp.myId = 2;
  alk.unpack(guest, alk.pack(host));
  const g = guest.bag;
  check('돌 수가 같다', g.men.length, host.bag.men.length);
  ok('자리가 같다', g.men.every((m, i) =>
    Math.abs(m.x - host.bag.men[i].x) < 1e-3 && Math.abs(m.y - host.bag.men[i].y) < 1e-3));
  ok('속도도 같이 온다 (그래서 손님도 이어 굴린다)',
     g.men.some((m) => Math.hypot(m.vx, m.vy) > 0.01));
  check('차례도 온다', g.turn, host.bag.turn);
  // 한 수마다 싣고, 그 사이에는 0.6초마다 한 번
  const a = alk.pack(host);
  ok('바로 다음 꾸러미에는 자리가 없다', a.m === undefined);
  host.elapsed += 0.7;
  ok('0.6초 뒤에는 다시 싣는다', Array.isArray(alk.pack(host).m));
  // 늦게 들어온 사람도 받는다
  const late = mk();
  late.mp.on = true; late.mp.role = 'guest'; late.mp.myId = 3;
  host.elapsed += 0.7;
  alk.unpack(late, alk.pack(host));
  check('늦게 들어온 사람도 판을 받는다', late.bag.men.length, host.bag.men.length);
}

say('컴퓨터 — 실제로 쏴 보고 고른다');
{
  // 하양 돌 하나가 판 끝에 붙어 있으면 그걸 밀어낸다
  const men = [one(0.5, 0.5, 0, 0, 0), one(0.5, 0.06, 0, 0, 1)];
  const pick = bestShot(men, 0);
  ok('쏠 돌과 각을 고른다', pick && pick.i === 0);
  const copy = men.map((m) => ({ ...m }));
  shoot(copy, pick.i, pick.deg, pick.gauge);
  for (let f = 0; f < 300 && !still(copy); f++) roll(copy, FR);
  ok('실제로 떨어뜨린다', !copy[1].alive);
  ok('제 돌은 안 버린다', copy[0].alive);
  // 빈 편은 컴퓨터가 알아서 쏜다
  const world = mk(); world.team = 0;
  const b = world.bag;
  b.turn = 1;                                    // 하양은 사람이 없다
  let f = 0;
  for (; f < 60 * 5 && b.turn === 1; f++) w.update(world, FR);
  ok('컴퓨터가 쏘고 차례를 넘긴다', b.turn === 0);
  ok('생각하는 시늉을 한다', f > 30);
}

say('한 판 — 컴퓨터끼리 두면 끝까지 간다');
{
  let done2 = 0, moves = 0;
  for (let g = 0; g < 4; g++) {
    const world = mk();
    world.mp.waiting = true;                     // 양쪽 다 컴퓨터
    const b = world.bag;
    let f = 0;
    for (; f < 60 * 600 && !b.over; f++) w.update(world, FR);
    if (b.over) done2++;
    moves = Math.max(moves, b.log.length);
    ok(`${g + 1}번째 — 끝났다`, b.over);
    if (b.over && b.winner !== null) {
      ok(`${g + 1}번째 — 한쪽이 비었다`,
         aliveOf(b.men, 0) === 0 || aliveOf(b.men, 1) === 0);
    }
  }
  note(`네 판 다 끝났나 ${done2 === 4} · 제일 긴 판 ${moves}수`);
}

done('알까기');
