// 윷놀이 — 판 길 · 던지기 확률 · 낙 · 잡기·업기·나기 · 차례(2:2) · 꾸러미.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R0 = new URL('../src/', import.meta.url).href;
const w = await import(R0 + 'game/world.js');
const { games } = await import(R0 + 'games/index.js');
const yut = games.find((g) => g.id === 'yut');
const m = await import(R0 + 'games/yut.js');
const { HOME, OUT, CENTER, nextOf, walk, spotOf, isCorner, toss, flatUp, NAMES, STEPS, again,
        throwTo, isNak, MAT_NEAR, MAT_FAR, SAFE_LOW, SAFE_HIGH, GAUGE_CYCLE, gaugeAt,
        preview, move, movable, movableWith, backOf, MARKED, doneOf, pileOf, riders, throwYut, playMove, whoseTurn, myTurn, seatsOf,
        aiPick, aiGauge, CREW } = m;

import { check, ok, say, note, done } from './check.mjs';

const FR = 1 / 60;
function mk() {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'yut');
  world.onRecord = () => {}; world.onGameOver = (r) => { world.ended = r; }; world.onMenu = () => {};
  w.resize(world, 1512, 944); w.spread(world); world.state = 'play';
  return world;
}
function join(world, id, side) {
  world.mp.others.set(id, { id, name: `손${id}`, x: 0, groundY: 0, air: 0, vx: 0, vy: 0,
    dead: false, waiting: false, deadFor: 0, facing: 1, walk: 0, crouch: 0,
    grabbing: -1, heldBy: -1, grabAim: 0, slide: 0 });
  if (side !== undefined) (world.mp.yutSides ??= new Map()).set(id, side);
  w.update(world, FR);
}

say('판 길 — 스무 밭 한 바퀴, 모에 정확히 서면 지름길');
{
  check('집에서 한 칸이면 1번 밭', walk(HOME, 1), 1);
  check('집에서 다섯이면 첫 모', walk(HOME, 5), 5);
  ok('5·10·15·20 이 모다', [5, 10, 15, 20].every(isCorner) && !isCorner(7));
  // 모를 **지나가는** 것으로는 지름길을 안 탄다
  check('4번에서 셋이면 7번 (모를 지나쳤다)', walk(4, 3), 7);
  // 모에 **서 있다가** 떠날 때 지름길을 탄다
  check('첫 모에서 한 칸이면 지름길', walk(5, 1), 21);
  check('첫 모에서 셋이면 방', walk(5, 3), CENTER);
  check('두 번째 모에서 셋이면 방', walk(10, 3), CENTER);
  // **방에 섰다 떠나면** 짧은 길(출발 쪽), **그냥 지나가면** 타던 대각선 그대로(→15).
  check('방에 섰다 떠나면 출발 쪽으로', nextOf(CENTER, true), 28);
  check('방을 지나가면 왼쪽 아래 모 쪽으로', nextOf(CENTER, false), 23);
  check('방에서 셋이면 난다', walk(CENTER, 3), OUT);
  check('첫 모에서 넷이면 방을 지나 23번', walk(5, 4), 23);
  check('첫 모에서 여섯이면 왼쪽 아래 모(15)', walk(5, 6), 15);
  check('20번에서 한 칸이면 난다', walk(20, 1), OUT);
  check('19번에서 둘이면 난다', walk(19, 2), OUT);
  // 지름길이 실제로 짧다
  const ring = (() => { let at = 5, n = 0; while (at !== OUT && n < 40) { at = nextOf(at, false); n++; } return n; })();
  const short = (() => { let at = 5, n = 0; let first = true;
    while (at !== OUT && n < 40) { at = nextOf(at, first || at === CENTER); first = false; n++; } return n; })();
  note(`첫 모에서 나기까지 — 바깥으로 ${ring}칸 · 지름길로 ${short}칸`);
  ok('지름길이 더 짧다', short < ring);
  // 밭은 다 판 안에 있다
  for (let n = 1; n <= 29; n++) {
    if (n > 20 && ![21, 22, 23, 24, 26, 27, 28, 29, CENTER].includes(n)) continue;
    const [u, v] = spotOf(n);
    ok(`${n}번 밭이 판 안`, u >= -0.01 && u <= 1.01 && v >= -0.01 && v <= 1.01);
  }
  check('방은 한가운데', spotOf(CENTER), [0.5, 0.5]);
}

// **그려지는 자리가 한 칸씩 밀려 있었다.** 「걸인데 왜 두 칸만 가지?」가 이것이었다 —
// 집에서 나온 말이 출발 귀퉁이에 서서(1번 밭이 거기 그려졌다) 거기서부터 세게 됐다.
// 모(5·10·15·20)도 귀퉁이가 아닌 데 그려져서 지름길이 엉뚱한 밭에서 새는 것처럼 보였다.
// 셈(walk)과 그림(spotOf)이 따로 놀면 눈으로는 잡기 어렵다 — 그래서 시험이 잡는다.
say('판 그림 — 셈한 밭과 그려지는 자리가 맞나');
{
  const near = (a, b, why) => ok(why, Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9);
  // 모 넷은 판의 네 귀퉁이다. 20번(출발)이 오른쪽 아래.
  near(spotOf(20), [1, 1], '20번(출발)은 오른쪽 아래 귀퉁이');
  near(spotOf(5), [1, 0], '첫 모(5)는 오른쪽 위 귀퉁이');
  near(spotOf(10), [0, 0], '두 번째 모(10)는 왼쪽 위 귀퉁이');
  near(spotOf(15), [0, 1], '세 번째 모(15)는 왼쪽 아래 귀퉁이');
  // 집에서 한 칸 나온 말은 귀퉁이가 아니라 **한 칸 간 자리**에 선다.
  near(spotOf(1), [1, 0.8], '1번 밭은 출발에서 한 칸 올라간 자리');
  // 바깥 스무 밭이 고르게 한 칸씩
  for (let n2 = 1; n2 <= 20; n2++) {
    const a = spotOf(n2 === 1 ? 20 : n2 - 1), b = spotOf(n2);
    const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    ok(`${n2}번은 앞 밭에서 한 칸`, Math.abs(d - 0.2) < 1e-9);
  }
  // 지름길은 모에서 방까지 곧게 이어진다 — 셈이 가는 길과 그림이 같아야 한다.
  const line = (from, mids, to, why) => {
    const a = spotOf(from), z = spotOf(to);
    const okAll = mids.every((m, k) => {
      const t = (k + 1) / (mids.length + 1);
      const want = [a[0] + (z[0] - a[0]) * t, a[1] + (z[1] - a[1]) * t];
      const got = spotOf(m);
      return Math.abs(got[0] - want[0]) < 1e-9 && Math.abs(got[1] - want[1]) < 1e-9;
    });
    ok(why, okAll);
  };
  line(5, [21, 22], CENTER, '첫 지름길(5→21→22→방)이 곧다');
  line(10, [26, 27], CENTER, '두 번째 지름길(10→26→27→방)이 곧다');
  line(CENTER, [23, 24], 15, '방에서 왼쪽 아래 모로 가는 길이 곧다');
  line(CENTER, [28, 29], 20, '방에서 출발로 나가는 길이 곧다');
}

say('윷 던지기 — 실제 윷과 같은 확률이 나오나');
{
  const tally = {}; let nak = 0, n = 0;
  for (let i = 0; i < 60000; i++) {
    const g = SAFE_LOW + Math.random() * (SAFE_HIGH - SAFE_LOW);
    const r = toss(g, i * 7919 + 13);
    if (r.nak) { nak++; continue; }
    n++; tally[r.name] = (tally[r.name] ?? 0) + 1;
  }
  const pct = (k) => ((tally[k] ?? 0) / n) * 100;
  note(`도 ${pct('도').toFixed(1)}% · 개 ${pct('개').toFixed(1)}% · 걸 ${pct('걸').toFixed(1)}%`
     + ` · 윷 ${pct('윷').toFixed(1)}% · 모 ${pct('모').toFixed(1)}% (실제 35·35·15·2.6·13)`);
  // **등이 둥글어 엎어지는 쪽이 잦다** — 그래서 도와 모가 많고 윷이 드물다.
  // 도 가운데 표 있는 짝이 젖혀진 것이 **빽도**라, 둘을 합쳐야 예전의 「도」다.
  note(`그중 빽도 ${pct('빽도').toFixed(1)}% (도의 넷에 하나쯤)`);
  ok('도+빽도가 30~40%', pct('도') + pct('빽도') > 30 && pct('도') + pct('빽도') < 40);
  ok('빽도가 도의 20~30%', pct('빽도') / (pct('도') + pct('빽도')) > 0.2
                          && pct('빽도') / (pct('도') + pct('빽도')) < 0.3);
  ok('개가 30~40%', pct('개') > 30 && pct('개') < 40);
  ok('걸이 10~20%', pct('걸') > 10 && pct('걸') < 20);
  ok('윷이 제일 드물다', pct('윷') < pct('모') && pct('윷') < 5);
  ok('모가 8~18%', pct('모') > 8 && pct('모') < 18);
  ok('윷·모는 한 번 더', again(4) && again(0) && !again(1) && !again(2) && !again(3));
  check('걸음 수', [STEPS[1], STEPS[2], STEPS[3], STEPS[4], STEPS[0]], [1, 2, 3, 4, 5]);
}

// **빽도** — 표 있는 짝 하나만 젖혀지면 한 칸 뒤로. 실제 윷놀이에서 판을 뒤집는 수다.
say('빽도 — 한 칸 뒤로. 1번에서는 출발 귀퉁이로');
{
  check('빽도는 한 칸 뒤', walk(3, -1), 2);
  check('1번에서 빽도면 출발 귀퉁이(20)', walk(1, -1), 20);
  check('집에 있는 말은 뒤로 못 간다', walk(HOME, -1), null);
  check('지름길 첫 밭에서 뒤로 가면 첫 모', walk(21, -1), 5);
  check('방에서 뒤로 가면 지름길', walk(CENTER, -1), 22);
  check('방을 지난 밭에서 뒤로 가면 방', walk(23, -1), CENTER);
  check('두 번째 지름길도 마찬가지', walk(26, -1), 10);

  // 뒤로 가서 **잡는다** — 빽도의 맛이 이것이다
  {
    const men = [{ side: 0, face: 0, at: 4, done: false, on: -1 },
                 { side: 1, face: 0, at: 3, done: false, on: -1 }];
    const res = move(men, 0, -1);
    check('뒤로 가서 적 말을 잡는다', [res.to, res.ate], [3, true]);
    check('잡힌 말은 집으로', men[1].at, HOME);
  }

  // 빽도가 나오면 **집에 있는 말은 못 고른다** (길 위에 있는 말만)
  {
    const men = [{ side: 0, face: 0, at: HOME, done: false, on: -1 },
                 { side: 0, face: 1, at: 7, done: false, on: -1 },
                 { side: 1, face: 0, at: 12, done: false, on: -1 }];
    check('빽도면 길 위의 말만 고른다', movableWith(men, 0, -1), [1]);
    check('도면 둘 다 고른다', movableWith(men, 0, 1), [0, 1]);
  }

  // 던지기에서 나오나 — 표 있는 짝(0번)만 젖혀진 자리를 찾아 본다
  {
    let back = 0, plainDo = 0;
    for (let i = 0; i < 20000; i++) {
      const r = toss(SAFE_LOW + ((i * 37) % 100) / 100 * (SAFE_HIGH - SAFE_LOW), i * 7919 + 5);
      if (r.nak) continue;
      if (r.back) { back++; ok2(r, back); } else if (r.name === '도') plainDo++;
    }
    function ok2(r, k) {
      if (k > 3) return;
      check(`빽도 ${k} — 걸음은 -1`, r.steps, -1);
      check(`빽도 ${k} — 이름은 빽도`, r.name, '빽도');
      check(`빽도 ${k} — 젖혀진 짝은 하나`, r.flats, 1);
      check(`빽도 ${k} — 그 하나가 표 있는 짝`, r.sticks[MARKED].flat, true);
    }
    ok('빽도와 그냥 도가 둘 다 나온다', back > 100 && plainDo > 100);
    note(`빽도 ${back}번 · 그냥 도 ${plainDo}번`);
  }

  // 빽도는 **한 번 더**가 아니다 (도와 같은 한 짝)
  ok('빽도는 한 번 더가 아니다', !again(1));
}

say('낙 — 못 닿거나 넘어가면 그 차례를 잃는다');
{
  ok('약하게 던지면 못 닿는다', isNak(throwTo(0)));
  ok('세게 던지면 넘어간다', isNak(throwTo(1)));
  ok('가운데로 던지면 멍석에 닿는다', !isNak(throwTo((SAFE_LOW + SAFE_HIGH) / 2)));
  let nak = 0;
  for (let i = 0; i < 4000; i++) if (toss(0.02, i).nak) nak++;
  check('제일 약하게 던지면 늘 낙', nak, 4000);
  nak = 0;
  for (let i = 0; i < 4000; i++) if (toss(1, i).nak) nak++;
  check('제일 세게 던져도 늘 낙', nak, 4000);
  let mid = 0;
  const g = (SAFE_LOW + SAFE_HIGH) / 2;
  for (let i = 0; i < 4000; i++) if (toss(g, i).nak) mid++;
  note(`가운데로 던졌을 때 낙 ${(mid / 40).toFixed(1)}%`);
  ok('가운데는 거의 안 난다', mid / 4000 < 0.05);
  ok('낙이면 걸음이 0', toss(0.02, 7).steps === 0);
  ok('살아 있는 구간이 게이지의 절반쯤', SAFE_HIGH - SAFE_LOW > 0.4 && SAFE_HIGH - SAFE_LOW < 0.7);
}

say('게이지 — 톱니다');
{
  check('바닥에서 시작', gaugeAt(0), 0);
  ok('반 바퀴면 절반', Math.abs(gaugeAt(GAUGE_CYCLE / 2) - 0.5) < 1e-9);
  ok('한 바퀴를 넘기면 0으로 떨어진다', gaugeAt(GAUGE_CYCLE * 1.01) < 0.02);
}

say('잡기 · 업기 · 나기');
{
  // 잡기 — 상대 말이 있는 밭에 정확히 서면 집으로 보낸다
  const men = [{ side: 0, face: 0, at: 3, done: false, on: -1 },
               { side: 1, face: 0, at: 5, done: false, on: -1 }];
  const plan = preview(men, 0, 2);
  check('두 칸 가면 5번', plan.to, 5);
  check('거기 상대 말이 있다', plan.eat, [1]);
  const res = move(men, 0, 2);
  ok('잡았다고 알려 준다', res.ate);
  check('잡힌 말은 집으로', men[1].at, HOME);
  check('내 말이 그 자리에', men[0].at, 5);
  // 업기 — 내 말이 있는 밭에 서면 같이 간다
  const two = [{ side: 0, face: 0, at: 3, done: false, on: -1 },
               { side: 0, face: 1, at: 5, done: false, on: -1 }];
  move(two, 0, 2);
  check('업어서 둘이 됐다', pileOf(two, 0), 2);
  check('업힌 말이 업은 말을 가리킨다', two[1].on, 0);
  check('업힌 말은 못 고른다', movable(two, 0), [0]);
  // 나기 — 업은 말이 같이 난다
  const out = [{ side: 0, face: 0, at: 20, done: false, on: -1 },
               { side: 0, face: 1, at: 20, done: false, on: 0 },
               { side: 0, face: 2, at: HOME, done: false, on: -1 }];
  move(out, 0, 1);
  check('업은 말과 업힌 말이 같이 난다', doneOf(out, 0), 2);
  // **한 번도 안 나온 말이 대신 나가면 안 된다** — 업혔던 말이 유령으로 남아 그 편이 멎는다
  ok('집에 있던 말은 그대로 남는다', !out[2].done && out[2].at === HOME);
  // 업은 말이 잡히면 업힌 말까지 통째로 집으로
  const cau = [{ side: 0, face: 0, at: 7, done: false, on: -1 },
               { side: 0, face: 1, at: 7, done: false, on: 0 },
               { side: 1, face: 0, at: 4, done: false, on: -1 }];
  // 5번(모)에서 두 칸이면 지름길로 새니, 4번에서 셋을 가서 7번을 밟는다
  move(cau, 2, 3);
  check('업은 말도 업힌 말도 집으로', [cau[0].at, cau[1].at, cau[1].on], [HOME, HOME, -1]);
}

say('한 차례 — 던지고 고르고 옮긴다');
{
  const world = mk(); const b = world.bag;
  world.team = 0;
  check('내 차례에 던지기부터', [b.turn, b.phase], [0, 'charge']);
  yut.action(world);
  ok('스페이스를 잡으면 힘이 찬다', b.held >= 0);
  for (let f = 0; f < 25; f++) w.update(world, FR);
  ok('게이지가 찼다', b.gauge > 0.2);
  // 멍석에 닿는 힘으로 맞춰 둔 뒤 던진다
  b.held = GAUGE_CYCLE * ((SAFE_LOW + SAFE_HIGH) / 2);
  b.gauge = gaugeAt(b.held);
  yut.release(world);
  check('던졌다', b.phase, 'fly');
  ok('윷 네 짝이 난다', b.roll.sticks.length === 4);
  for (let f = 0; f < 200 && b.phase === 'fly'; f++) w.update(world, FR);
  ok('떨어지면 고르기나 다음 차례로', b.phase === 'pick' || b.phase === 'charge');
  if (b.phase === 'pick') {
    const row = movable(b.men, b.turn);
    ok('고를 말이 있다', row.length > 0);
    const before = b.men[b.pick].at;
    yut.action(world);
    ok('옮겼다', b.men.some((x) => x.at !== HOME) || before !== HOME);
  }
}

say('차례는 편 안에서도 돈다 — 2:2');
{
  const world = mk();
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1; world.team = 0;
  join(world, 2, 1); join(world, 3, 0); join(world, 4, 1);
  const b = world.bag;
  check('빨강 둘', seatsOf(world, 0).map((s) => s.id), [1, 3]);
  check('파랑 둘', seatsOf(world, 1).map((s) => s.id), [2, 4]);
  const order = [];
  for (let n = 0; n < 8; n++) {
    order.push(whoseTurn(world).id);
    // **잡히거나 윷이 나면 한 번 더 던진다** — 그건 규칙이 맞다. 차례가 도는 것만 보려고
    // 매번 말을 멀찍이 떼어 놓고 개(두 칸)만 쓴다. 안 그러면 다 같이 2번 밭에 모여 잡는다.
    b.men.forEach((x, i) => { x.at = i < CREW ? 1 + i * 2 : 12 + (i - CREW) * 2; x.on = -1; x.done = false; });
    b.roll = { name: '개', steps: 2, nak: false, flats: 2, sticks: [] };
    b.phase = 'pick';
    playMove(world, movable(b.men, b.turn)[0]);
    for (let f = 0; f < 5; f++) w.update(world, FR);
  }
  check('빨1 → 파1 → 빨2 → 파2 … 로 돈다', order, [1, 2, 3, 4, 1, 2, 3, 4]);
}

say('윷·모·잡기면 한 번 더 던진다');
{
  const world = mk(); world.team = 0;
  const b = world.bag;
  b.roll = { name: '윷', steps: 4, nak: false, flats: 4, sticks: [] };
  b.phase = 'pick';
  playMove(world, movable(b.men, 0)[0]);
  check('윷이면 차례가 그대로', b.turn, 0);
  check('다시 던지기로', b.phase, 'charge');
  // 잡으면 한 번 더
  const w2 = mk(); w2.team = 0;
  const c = w2.bag;
  c.men[0].at = 3; c.men[4].at = 5;              // 내 말 3번, 상대 말 5번
  c.roll = { name: '개', steps: 2, nak: false, flats: 2, sticks: [] };
  c.phase = 'pick';
  playMove(w2, 0);
  check('잡으면 차례가 그대로', c.turn, 0);
  ok('잡았다고 알려 준다', /잡았다/.test(c.say ?? ''));
  // 낙이면 넘어간다
  const w3 = mk(); w3.team = 0;
  const d = w3.bag;
  d.phase = 'charge';
  throwYut(w3, 0.02);                            // 못 닿는 힘
  ok('낙이다', d.roll.nak);
  for (let f = 0; f < 200 && d.phase === 'fly'; f++) w.update(w3, FR);
  check('낙이면 차례가 넘어간다', d.turn, 1);
  ok('까닭을 알려 준다', /낙/.test(d.say ?? ''));
}

say('이기는 것 — 말 넷을 다 내보내면');
{
  const world = mk(); world.team = 0;
  const b = world.bag;
  for (let i = 0; i < CREW - 1; i++) { b.men[i].done = true; b.men[i].at = OUT; }
  b.men[CREW - 1].at = 20;
  b.roll = { name: '도', steps: 1, nak: false, flats: 1, sticks: [] };
  b.phase = 'pick';
  playMove(world, CREW - 1);
  ok('넷을 다 내보내면 끝난다', b.over);
  check('이긴 편', b.winner, 0);
  ok('끝났다고 적어 둔다', /빨강/.test(b.note ?? ''));
}

say('컴퓨터 — 잡는 수를 고른다');
{
  const men = [{ side: 0, face: 0, at: 3, done: false, on: -1 },
               { side: 0, face: 1, at: 8, done: false, on: -1 },
               { side: 1, face: 0, at: 5, done: false, on: -1 }];
  check('잡을 수 있는 말을 고른다', aiPick(men, 0, 2), 0);
  const g = aiGauge();
  ok('멍석에 닿는 힘을 노린다', g > SAFE_LOW - 0.05 && g < SAFE_HIGH + 0.05);
  // 빈 편은 컴퓨터가 한다
  const world = mk(); world.team = 0;
  const b = world.bag;
  b.turn = 1;
  let f = 0;
  for (; f < 60 * 12 && b.turn === 1; f++) w.update(world, FR);
  ok('컴퓨터가 던지고 차례를 넘긴다', b.turn === 0);
}

say('꾸러미 — 손님이 같은 판을 본다');
{
  const host = mk();
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1; host.team = 0;
  join(host, 2, 1);
  const b = host.bag;
  b.men[0].at = 7; b.men[1].at = 7; b.men[1].on = 0; b.men[5].at = 12;
  throwYut(host, (SAFE_LOW + SAFE_HIGH) / 2);
  for (let f = 0; f < 6; f++) w.update(host, FR);
  const guest = mk();
  guest.mp.on = true; guest.mp.role = 'guest'; guest.mp.myId = 2;
  yut.unpack(guest, yut.pack(host));
  const g = guest.bag;
  check('말이 같은 밭에', g.men.map((x) => x.at), b.men.map((x) => x.at));
  check('업은 것도 온다', pileOf(g.men, 0), 2);
  check('차례도 온다', g.turn, b.turn);
  check('던진 것도 온다', g.roll.name, b.roll.name);
  ok('윷 네 짝이 다 온다', g.roll.sticks.length === 4);
  ok('나는 중이면 매 프레임 싣는다', Array.isArray(yut.pack(host).m));
  // 판이 멎으면 0.6초마다
  b.phase = 'pick';
  yut.pack(host);
  ok('멎었으면 매 프레임은 안 싣는다', yut.pack(host).m === undefined);
  host.elapsed += 0.7;
  ok('0.6초 뒤에는 다시 싣는다', Array.isArray(yut.pack(host).m));
}

say('한 판 — 컴퓨터끼리 두면 끝까지 간다');
{
  let ends = 0; const lens = [];
  for (let n = 0; n < 4; n++) {
    const world = mk();
    world.mp.waiting = true;                     // 양쪽 다 컴퓨터
    const b = world.bag;
    let f = 0;
    for (; f < 60 * 900 && !b.over; f++) w.update(world, FR);
    if (b.over) ends++;
    lens.push(b.log.length);
    ok(`${n + 1}번째 — 끝났다`, b.over);
    if (b.over) ok(`${n + 1}번째 — 한쪽이 말 넷을 냈다`,
                   doneOf(b.men, 0) >= CREW || doneOf(b.men, 1) >= CREW);
    // **유령 말이 없다** — 판에도 없고 나지도 않고 집에도 없는 말이 생기면 그 편은 멎는다
    ok(`${n + 1}번째 — 유령 말이 없다`, b.men.every((x) =>
      x.done || x.on !== -1 || x.at === HOME || (x.at >= 1 && x.at <= 29)));
  }
  note(`네 판 다 끝났나 ${ends === 4} · 던진 횟수 ${lens.join(' ')}`);
}

// **판을 수십 번 돌려 규칙이 깨지는 데가 있나 본다.**
//
// 한 판만 봐서는 안 걸리는 것들이 있다 — 업고 업힌 채로 잡히고, 업은 말이 나고, 낙이 겹치고,
// 한 편이 말을 다 내보내는 그 수까지 가야 나온다. 그래서 **사람처럼 던지는 판을 여럿 돌리고
// 한 수마다 판이 성한지 본다.** (이 점검으로 「업힌 말의 밭이 옛 밭에 남는」 것을 잡았다.)
say('전수 점검 — 예순 판을 돌려 규칙이 깨지는 데를 찾는다');
{
  const mid = (SAFE_LOW + SAFE_HIGH) / 2, half = (SAFE_HIGH - SAFE_LOW) / 2;
  let hangs = 0, wrongTurn = 0, throwsAll = 0, pickless = 0;
  const broke = new Map();
  const flag = (why) => broke.set(why, (broke.get(why) ?? 0) + 1);
  const audit = (men) => {
    for (const side of [0, 1]) {
      if (men.filter((m) => m.side === side).length !== CREW) flag('말이 넷이 아니다');
    }
    men.forEach((m, i) => {
      if (m.done && (m.at !== OUT || m.on !== -1)) flag('난 말이 판에 남아 있다');
      if (m.at === HOME && m.on !== -1) flag('집에 있는데 업혀 있다');
      if (m.on === -1) return;
      const c = men[m.on];
      if (!c) flag('업은 말이 없다');
      else if (c.done) flag('난 말에 업혀 있다');
      else if (c.side !== m.side) flag('적 말에 업혀 있다');
      else if (c.on !== -1) flag('업은 말이 또 업혀 있다');
      // **업힌 말은 업은 말과 같은 밭에 있어야 한다.** 판에는 안 보이지만(업힌 말은 안 그린다)
      // 여기가 어긋나면 「저 밭에 있다」고 거짓을 적어 둔 말이 된다.
      else if (c.at !== m.at) flag('업힌 말이 딴 밭에 있다');
    });
    const field = new Map();
    men.forEach((m) => {
      if (m.done || m.at === HOME || m.on !== -1) return;
      const row = field.get(m.at) ?? []; row.push(m.side); field.set(m.at, row);
    });
    for (const row of field.values()) {
      if (row.length > 1) flag('한 밭에 안 업힌 말이 둘');
    }
  };

  for (let g = 0; g < 60; g++) {
    const world = mk();
    const b = world.bag;
    b.seed = (g * 2654435761) >>> 0;
    let guard = 0;
    while (!b.over && guard++ < 3000) {
      const before = b.turn;
      // 사람처럼 안전한 구간을 노린다. 가끔은 아무렇게나 던져 낙도 섞는다.
      const gauge = g % 7 === 0 && guard % 9 === 0 ? 0.02
        : Math.max(0, Math.min(1, mid + ((guard * 37 % 100) / 50 - 1) * half * 1.05));
      if (!throwYut(world, gauge)) { flag('못 던졌다'); break; }
      throwsAll++;
      for (let f = 0; f < 200 && b.phase === 'fly'; f++) w.update(world, FR);
      audit(b.men);
      if (b.phase === 'pick') {
        const row = movable(b.men, b.turn);
        if (!row.length) { pickless++; continue; }
        const before2 = b.men.map((m) => ({ ...m }));
        const roll = b.roll;
        if (!playMove(world, aiPick(b.men, b.turn, roll.steps))) flag('말을 못 옮겼다');
        audit(b.men);
        // 차례는 **윷·모·잡기일 때만** 그대로다
        const ate = before2.some((m, i) => m.at !== HOME && b.men[i].at === HOME && m.side !== b.turn);
        const keep = ate || again(roll.flats);
        if (!b.over && ((keep && b.turn !== before) || (!keep && b.turn === before))) wrongTurn++;
      }
    }
    if (!b.over) hangs++;
    else if (doneOf(b.men, b.winner) !== CREW) flag('이겼는데 말이 넷이 안 났다');
  }
  check('예순 판이 다 끝난다 (멎는 판이 없다)', hangs, 0);
  check('차례가 규칙과 어긋난 적이 없다', wrongTurn, 0);
  check('규칙이 깨진 데가 없다', [...broke.keys()], []);
  note(`던짐 ${throwsAll}번 · 고를 말이 없어 넘긴 차례 ${pickless}번`);
}

done('윷놀이');
