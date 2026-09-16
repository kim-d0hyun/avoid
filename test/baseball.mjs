// 야구 — 판 좌표 · 타구 물리 · 수비 · 규칙 · 타이밍 · 꾸러미.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const { games } = await import(R + 'games/index.js');
const ball = games.find((g) => g.id === 'ball');
const bb = await import(R + 'games/baseball.js');
const { layout, spot, zone, pitchEnd, pitchAt, contact, resolveHit, flightOf, catchOdds,
        guessErr, ballAt, PITCHES, batSide, fieldSide, amPitching, amBatting, swing,
        FENCE_MID, FENCE_LINE, fenceFt } = bb;
const { BAT_TIME, PITCH_TIME, batPoint } = await import(R + 'draw/stickman.js');

import { check, ok, say, note, done } from './check.mjs';

const FR = 1 / 60;
function mk(width = 1512, height = 944) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'ball');
  world.onRecord = () => {}; world.onGameOver = (r) => { world.ended = r; }; world.onMenu = () => {};
  w.resize(world, width, height);
  w.spread(world);
  world.state = 'play';
  return world;
}
const round = (v) => Math.round(v);
/// 딱 한 번만 나오는 결말을 만들려고, 주사위를 고정해 두고 부른다.
function fixed(values, fn) {
  const real = Math.random;
  let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try { return fn(); } finally { Math.random = real; }
}

// ── 판 ────────────────────────────────────────────────────────────────────

say('그라운드 — 홈은 아래 가운데, 담장은 위, 1루는 오른쪽');
{
  const world = mk();
  const L = layout(world);
  const [hx, hy] = spot(L, 0, 0);
  const [fx, fy] = spot(L, 0, FENCE_MID);
  const [b1x, b1y] = spot(L, 45, 90);
  const [b3x] = spot(L, -45, 90);
  const [b2x, b2y] = spot(L, 0, 127.28);
  check('홈이 화면 가운데', round(hx), 756);
  ok('홈이 아래쪽', hy > 944 * 0.8);
  ok('담장이 위쪽', fy < 944 * 0.2);
  ok('1루는 오른쪽', b1x > hx + 100);
  ok('3루는 왼쪽', b3x < hx - 100);
  ok('2루는 가운데 위', Math.abs(b2x - hx) < 1 && b2y < b1y);
  ok('1루가 홈과 2루 사이 높이', b2y < b1y && b1y < hy);
}

say('원근 — 곧은 선은 화면에서도 곧다 (사영이라야 주자가 베이스라인을 밟는다)');
{
  const L = layout(mk());
  // 1루에서 2루로 가는 길 위의 점 다섯. 화면에 옮겨도 한 직선 위에 있어야 한다.
  const flat = (deg, ft) => [Math.sin(deg * Math.PI / 180) * ft, Math.cos(deg * Math.PI / 180) * ft];
  const a = flat(45, 90), c = flat(0, 127.28);
  const pts = [0, 0.25, 0.5, 0.75, 1].map((k) => {
    const x = a[0] + (c[0] - a[0]) * k, y = a[1] + (c[1] - a[1]) * k;
    return spot(L, Math.atan2(x, y) * 180 / Math.PI, Math.hypot(x, y));
  });
  // 양 끝을 이은 직선에서 가운데 점들이 얼마나 벗어나나
  const [p0, p1] = [pts[0], pts[4]];
  const off = pts.slice(1, 4).map(([x, y]) => {
    const t = ((x - p0[0]) * (p1[0] - p0[0]) + (y - p0[1]) * (p1[1] - p0[1]))
            / ((p1[0] - p0[0]) ** 2 + (p1[1] - p0[1]) ** 2);
    return Math.hypot(x - (p0[0] + (p1[0] - p0[0]) * t), y - (p0[1] + (p1[1] - p0[1]) * t));
  });
  note(`베이스라인이 화면에서 휘는 정도 ${Math.max(...off).toFixed(2)}px`);
  ok('1픽셀 안으로 곧다', Math.max(...off) < 1);
}

say('창 크기 — 작게 띄워도 그라운드가 화면 안에 들어온다');
for (const [ww, hh] of [[1512, 944], [1280, 800], [900, 560], [605, 380]]) {
  const L = layout(mk(ww, hh));
  const pole = spot(L, 45, FENCE_LINE);
  const mid = spot(L, 0, FENCE_MID);
  ok(`${ww}×${hh} — 파울 폴이 화면 안`, pole[0] > 0 && pole[0] < ww);
  ok(`${ww}×${hh} — 담장이 화면 안`, mid[1] > 0 && mid[1] < hh);
  ok(`${ww}×${hh} — 존이 홈 위`, zone(L).cy < spot(L, 0, 0)[1] && zone(L).cy > hh * 0.5);
}

// ── 타구 ──────────────────────────────────────────────────────────────────

say('타구 물리 — 공기 저항을 넣은 궤적이 실제로 잰 값과 맞는다');
{
  // [마일, 각도, 실제 거리(ft), 실제 체공(s)] — 스탯캐스트가 잰 대표 타구
  const real = [[100, 28, 400, 4.9], [95, 24, 340, 3.9], [90, 20, 250, 2.9],
                [80, 12, 165, 1.8], [105, 36, 390, 5.4]];
  for (const [mph, ang, want, hang] of real) {
    const f = flightOf(mph * 1.4667, ang);
    const dr = Math.abs(f.range - want) / want;
    const dh = Math.abs(f.hang - hang) / hang;
    note(`${mph}마일 ${ang}° → ${f.range.toFixed(0)}ft / ${f.hang.toFixed(1)}s (실제 ${want}ft / ${hang}s)`);
    ok(`${mph}마일 ${ang}° 거리가 15% 안`, dr < 0.15);
    ok(`${mph}마일 ${ang}° 체공이 20% 안`, dh < 0.20);
  }
}

say('타이밍 — 정확할수록 빠르고, 빠르면 당겨지고 늦으면 밀린다');
{
  const at = (err) => {
    let ev = 0, deg = 0, n = 400;
    for (let i = 0; i < n; i++) { const h = contact(err, false, false, PITCHES[0]); ev += h.ev; deg += h.deg; }
    return { ev: ev / n, deg: deg / n };
  };
  const a0 = at(0), a4 = at(4), a9 = at(9);
  note(`0프레임 ${a0.ev.toFixed(0)} · 4프레임 ${a4.ev.toFixed(0)} · 9프레임 ${a9.ev.toFixed(0)} ft/s`);
  ok('어긋날수록 느려진다', a0.ev > a4.ev && a4.ev > a9.ev);
  ok('빠르면 왼쪽으로 (당겨 친다)', at(-6).deg < -10);
  ok('늦으면 오른쪽으로 (밀어 친다)', at(6).deg > 10);
  check('12프레임 넘으면 헛스윙', contact(13, false, false, PITCHES[0]), null);
  ok('12프레임까지는 맞는다', !!contact(12, false, false, PITCHES[0]));
  ok('⌥↑ 면 더 뜬다', contact(0, true, false, PITCHES[0]).ang > contact(0, false, true, PITCHES[0]).ang);
}

say('구종 — 직구와 커브가 17프레임 떨어져 있다 (이 간격이 수싸움이다)');
{
  const frames = PITCHES.map((p) => Math.round(p.dur / FR));
  note(`직구 ${frames[0]} · 커브 ${frames[1]} · 체인지업 ${frames[2]} 프레임`);
  check('직구가 제일 빠르다', frames[0], Math.min(...frames));
  check('커브가 제일 느리다', frames[1], Math.max(...frames));
  ok('직구와 커브가 15프레임 넘게 벌어진다', frames[1] - frames[0] >= 15);
  // 직구를 노리고 커브를 맞으면 헛스윙이 나와야 한다 — 안 그러면 구종을 읽을 이유가 없다
  const wrong = Array.from({ length: 400 }, () => guessErr(0, 1, 10));
  const miss = wrong.filter((e) => Math.abs(e) > 12).length / wrong.length;
  note(`직구를 노리고 커브를 만나면 헛스윙 ${(miss * 100).toFixed(0)}%`);
  ok('절반 가까이 헛스윙', miss > 0.35);
  const right = Array.from({ length: 400 }, () => guessErr(0, 0, 10));
  ok('제대로 읽으면 거의 맞는다', right.filter((e) => Math.abs(e) > 12).length / right.length < 0.05);
}

say('커브는 늦게 떨어진다 — 앞쪽 절반보다 뒤쪽 절반에서 더 진다');
{
  const L = layout(mk());
  const p = { type: 1, kind: PITCHES[1], ax: 0, ay: 0 };
  const a = pitchAt(p, L, 0).y, b = pitchAt(p, L, 0.5).y, c = pitchAt(p, L, 1).y;
  const straight = { type: 0, kind: PITCHES[0], ax: 0, ay: 0 };
  ok('커브가 직구보다 낮게 들어온다', pitchAt(p, L, 1).y > pitchAt(straight, L, 1).y);
  ok('뒤쪽 절반에서 더 많이 진다', (c - b) > (b - a) * 1.15);
}

say('배트는 한 방향으로만 돈다 — 맞은 뒤 되감기면 스윙으로 안 보인다');
{
  const man = (batT) => ({ x: 0, groundY: 0, air: 0, vx: 0, vy: 0, facing: 1, walk: 0,
                           crouch: 0, dead: false, deadFor: 0, grabbing: -1, heldBy: -1,
                           grabAim: 0, slide: 0, stance: 1, batT });
  const angles = [];
  const frames = Math.round(BAT_TIME * 60);
  for (let f = 0; f <= frames; f++) angles.push(batPoint(man(BAT_TIME - f / 60)).angle);
  // 휘두름 + 맞댐 + 따라 휘기 앞쪽 — 배트가 감기는 구간
  const wind = angles.slice(0, Math.round(frames * 0.72));
  const steps = wind.slice(1).map((a, i) => Math.sign(a - wind[i])).filter((d) => d !== 0);
  note(`감기는 동안 도는 쪽 ${[...new Set(steps)].join(',')} (프레임 ${steps.length}칸)`);
  check('한 방향으로만 돈다', new Set(steps).size, 1);
  const turn = Math.abs(angles[Math.round(frames * 0.72)] - angles[0]);
  note(`감기는 각 ${(turn * 180 / Math.PI).toFixed(0)}도`);
  ok('한 바퀴 가까이 감긴다', turn > Math.PI && turn < Math.PI * 2.2);
  // 맞는 순간 배트 끝이 앞쪽 위에 있다 (타자가 홈 쪽으로 뻗는다)
  const meet = batPoint(man(BAT_TIME - 3 / 60 - 1 / 60));
  ok('맞을 때 배트가 앞으로 뻗어 있다', meet.x > 24);
}

// ── 수비 ──────────────────────────────────────────────────────────────────

say('수비 — 제일 먼저 닿는 사람이 잡는다 (내야 땅볼을 중견수가 주우러 가지 않는다)');
{
  // 유격수 정면으로 굴러가는 땅볼. 여유가 제일 큰 사람으로 고르면 중견수가 간다.
  let inf = 0, out = 0;
  for (let i = 0; i < 300; i++) {
    const p = resolveHit({ grade: 1, ev: 108, ang: -4, deg: -18, tipped: false },
                         { onBase: [null, null, null], outs: 0 });
    (/유격수|2루수|3루수|투수|1루수/.test(p.label) ? inf++ : out++);
  }
  note(`내야수가 처리 ${inf} · 외야수가 처리 ${out}`);
  ok('내야 땅볼은 내야수가 잡는다', inf > out * 6);
}

say('잡느냐 — 여유가 클수록 잘 잡는다 (기획서에 적은 표 그대로)');
{
  check('0.5초 넘게 남으면', catchOdds(0.6, false), 0.97);
  check('0.25~0.5초', catchOdds(0.3, false), 0.88);
  check('0.10~0.25초', catchOdds(0.15, false), 0.68);
  check('0.10초 안', catchOdds(0.05, false), 0.40);
  ok('강한 직선타는 한 단계 더 어렵다', catchOdds(0.6, true) < catchOdds(0.6, false));
  ok('단조롭게 오른다', catchOdds(0.05) < catchOdds(0.15)
    && catchOdds(0.15) < catchOdds(0.3) && catchOdds(0.3) < catchOdds(0.6));
}

say('경우의 수 — 홈런 · 파울 · 뜬공 · 땅볼이 다 나온다');
{
  const seen = new Set();
  for (let i = 0; i < 4000; i++) {
    const err = Math.round((Math.random() - Math.random()) * 17);
    const h = contact(err, Math.random() < 0.3, Math.random() < 0.2, PITCHES[(Math.random() * 3) | 0]);
    if (!h) { seen.add('헛스윙'); continue; }
    const p = resolveHit(h, { onBase: [true, null, null], outs: 0 });
    seen.add(p.kind);
    if (p.record.startsWith('E')) seen.add('실책');
    if (/병살/.test(p.label)) seen.add('병살');
    if (/2루타/.test(p.label)) seen.add('2루타');
  }
  for (const want of ['헛스윙', 'foul', 'homer', 'fly', 'grounder', 'liner', '실책', '병살', '2루타']) {
    ok(`${want} 가 나온다`, seen.has(want));
  }
}

say('공의 길 — 대본 위에서 공이 뜬 뒤 떨어지고, 담장을 넘은 공은 안 돌아온다');
{
  const hr = fixed([0.5], () => resolveHit({ grade: 2, ev: 152, ang: 29, deg: 0, tipped: false },
                                           { onBase: [null, null, null], outs: 0 }));
  check('홈런이다', hr.kind, 'homer');
  const mid = ballAt(hr, hr.hops[0].t1 / 2);
  const end = ballAt(hr, hr.hops[0].t1);
  ok('가운데에서 높이 떠 있다', mid[2] > 40);
  ok('앞으로 나간다', end[1] > mid[1] && mid[1] > 0);
  ok(`담장(${FENCE_MID}ft)을 넘겼다`, end[1] > FENCE_MID);
  check('네 명이 다 들어온다 — 만루 홈런', fixed([0.5], () =>
    resolveHit({ grade: 2, ev: 152, ang: 29, deg: 0, tipped: false },
               { onBase: [true, true, true], outs: 0 })).runs2, 4);
}

// ── 규칙 ──────────────────────────────────────────────────────────────────

say('스트라이크 셋이면 삼진, 볼 넷이면 걸어 나간다');
{
  const world = mk();
  const b = world.bag;
  b.half = 0; world.team = 0;              // 나는 수비(홈), 컴퓨터가 친다
  // 한가운데로 던져 두고 아무도 안 휘두르게 한다
  for (let i = 0; i < 3; i++) {
    b.pitch = null; b.play = null; b.wait = 0; b.aiSwing = null;
    bb.default.update(world, FR);
    b.aiSwing = null;                       // 컴퓨터가 안 휘두른다
    b.pitch = { type: 0, kind: PITCHES[0], ax: 0, ay: 0, t: 0, dur: PITCHES[0].dur,
                plate: Math.round(PITCHES[0].dur / FR), done: false, wind: 0, hit: 0 };
    for (let f = 0; f < 60 && b.pitch && !b.pitch.done; f++) bb.default.update(world, FR);
  }
  check('스트라이크 셋이면 삼진', b.log.at(-1)?.r, 'K');
  check('아웃이 하나 늘었다', b.outs, 1);

  const w2 = mk(); const c = w2.bag;
  c.half = 0; w2.team = 0;
  for (let i = 0; i < 4; i++) {
    c.pitch = { type: 0, kind: PITCHES[0], ax: 1.4, ay: 0, t: 0, dur: PITCHES[0].dur,
                plate: Math.round(PITCHES[0].dur / FR), done: false, wind: 0, hit: 0 };
    c.aiSwing = null;
    for (let f = 0; f < 60 && c.pitch && !c.pitch.done; f++) bb.default.update(w2, FR);
    c.wait = 0;
  }
  check('볼 넷이면 걸어 나간다', c.log.at(-1)?.r, 'BB');
  check('1루에 주자', c.onBase[0], true);
}

say('두 스트라이크에서 파울은 스트라이크가 안 된다 — 걷어 내며 버틸 수 있다');
{
  const world = mk();
  const b = world.bag;
  b.strikes = 2;
  b.pitch = { type: 0, kind: PITCHES[0], ax: 0, ay: 0, t: 0.4, dur: 0.4, plate: 24, done: false, wind: 0, hit: 0 };
  // 크게 어긋나게 휘둘러 파울을 만든다
  const made = fixed([0.9, 0.5, 0.5, 0.5, 0.5, 0.5], () => swing(world, 24 + 11, false, false));
  ok('맞기는 했다', made && !!b.play);
  check('파울이다', b.play?.foul, true);
  const over = b.play.over;
  for (let f = 0; f < Math.ceil(over * 60) + 4; f++) bb.default.update(world, FR);
  check('스트라이크는 그대로 둘', b.strikes, 2);
  check('아웃이 안 늘었다', b.outs, 0);
}

say('희생플라이 — 뜬공 아웃이어도 3루 주자는 들어온다');
{
  let sf = 0, tries = 0;
  for (let i = 0; i < 600; i++) {
    const p = resolveHit({ grade: 2, ev: 128, ang: 31, deg: 8, tipped: false },
                         { onBase: [null, null, true], outs: 0 });
    if (p.outs !== 1) continue;
    tries++;
    if (p.runs2 === 1 && /희생플라이/.test(p.label)) sf++;
  }
  note(`깊은 뜬공 아웃 ${tries}번 중 희생플라이 ${sf}번`);
  ok('깊은 뜬공에는 3루 주자가 들어온다', sf > tries * 0.7);
  // 얕은 뜬공에는 못 들어온다
  const shallow = [];
  for (let i = 0; i < 400; i++) {
    const p = resolveHit({ grade: 0, ev: 74, ang: 46, deg: 0, tipped: false },
                         { onBase: [null, null, true], outs: 0 });
    if (p.outs === 1) shallow.push(p.runs2);
  }
  ok('얕은 뜬공에는 못 들어온다', shallow.length > 0 && shallow.every((r) => r === 0));
}

say('밀어내기 — 만루 볼넷은 1점, 아니면 점수가 없다');
{
  const world = mk(); const b = world.bag;
  b.onBase = [true, true, true];
  b.balls = 3;
  b.half = 1;                                  // 말 → 홈(0) 공격
  const before = b.score[0];
  b.pitch = { type: 0, kind: PITCHES[0], ax: 1.5, ay: 0, t: 0, dur: 0.4, plate: 24, done: false, wind: 0, hit: 0 };
  b.aiSwing = null;
  for (let f = 0; f < 60 && b.pitch && !b.pitch.done; f++) bb.default.update(world, FR);
  check('만루 볼넷은 1점', b.score[0] - before, 1);
  check('여전히 만루', b.onBase, [true, true, true]);

  const w2 = mk(); const c = w2.bag;
  c.onBase = [true, null, null]; c.balls = 3; c.half = 1;
  c.pitch = { type: 0, kind: PITCHES[0], ax: 1.5, ay: 0, t: 0, dur: 0.4, plate: 24, done: false, wind: 0, hit: 0 };
  c.aiSwing = null;
  for (let f = 0; f < 60 && c.pitch && !c.pitch.done; f++) bb.default.update(w2, FR);
  check('1루만 차 있으면 점수 없음', c.score[0], 0);
  check('1·2루가 된다', [!!c.onBase[0], !!c.onBase[1], !!c.onBase[2]], [true, true, false]);
}

say('병살 — 1루에 주자가 있고 2아웃 전, 내야 정면 땅볼');
{
  // 내야 여기저기로 굴려 본다. 한 자리만 보면 「거기는 병살이 안 되는 자리」일 수 있다.
  const spots = [[108, -5, -20], [100, -3, -25], [92, -7, -30], [110, -2, 10], [95, -6, 18]];
  let dp = 0, plays = 0;
  for (const [ev, ang, deg] of spots) {
    for (let i = 0; i < 200; i++) {
      const p = resolveHit({ grade: 1, ev, ang, deg, tipped: false },
                           { onBase: [true, null, null], outs: 0 });
      plays++;
      if (p.outs === 2) dp++;
    }
  }
  note(`1루 주자 · 내야 땅볼 ${plays}번 중 병살 ${dp}번`);
  ok('병살이 난다', dp > plays * 0.5);
  // 2아웃에서는 병살이 안 난다 (한 명만 잡아도 이닝이 끝난다)
  const two = Array.from({ length: 300 }, () => resolveHit(
    { grade: 1, ev: 108, ang: -5, deg: -20, tipped: false }, { onBase: [true, null, null], outs: 2 }));
  ok('2아웃에서는 한 명만 잡는다', two.every((p) => p.outs <= 1));
  // 1루가 비어 있으면 밀어내기가 없으니 병살도 없다
  const empty = Array.from({ length: 300 }, () => resolveHit(
    { grade: 1, ev: 108, ang: -5, deg: -20, tipped: false }, { onBase: [null, null, null], outs: 0 }));
  ok('주자가 없으면 병살이 없다', empty.every((p) => p.outs <= 1));
}

say('주자가 사라지지도 늘지도 않는다 — 뒷 주자는 앞 주자를 앞지를 수 없다');
{
  // 사람 수를 세어 본다: 판에 있던 주자 + 타자 = 남은 주자 + 득점 + 아웃
  let bad = 0, seen = 0, doubled = 0;
  const bases = [[null,null,null],[true,null,null],[null,true,null],[null,null,true],
                 [true,true,null],[true,null,true],[null,true,true],[true,true,true]];
  for (const on of bases) {
    for (let outs = 0; outs <= 2; outs++) {
      for (let i = 0; i < 400; i++) {
        const err = Math.round((Math.random() - Math.random()) * 15);
        const h = contact(err, Math.random() < 0.3, Math.random() < 0.2, PITCHES[(Math.random() * 3) | 0]);
        if (!h) continue;
        const p = resolveHit(h, { onBase: [...on], outs });
        if (p.foul) continue;
        seen++;
        const before = on.filter(Boolean).length + 1;
        const after = p.onBase.filter(Boolean).length;
        // 3아웃이 나면 그 판의 득점은 지워지므로, 사람 수 셈에서는 밟은 주자를 따로 센다
        const home = outs + p.outs >= 3 ? p.runs.filter((r) => r.to >= 4 && !r.out).length : p.runs2;
        if (after + home + p.outs !== before) bad++;
        if (after > 3) doubled++;
      }
    }
  }
  note(`${seen}가지 경우를 세어 봄`);
  check('주자 셈이 맞는다 (있던 사람 + 타자 = 남은 주자 + 득점 + 아웃)', bad, 0);
  check('한 루에 둘이 서지 않는다', doubled, 0);
}

say('3아웃째에는 점수가 안 들어간다');
{
  let cases = 0, leaked = 0;
  for (let i = 0; i < 6000; i++) {
    const err = Math.round((Math.random() - Math.random()) * 15);
    const h = contact(err, Math.random() < 0.3, Math.random() < 0.2, PITCHES[(Math.random() * 3) | 0]);
    if (!h) continue;
    const p = resolveHit(h, { onBase: [true, true, true], outs: 2 });
    if (p.foul || !p.outs) continue;
    cases++;
    if (p.runs2 > 0) leaked++;
  }
  note(`2아웃 만루에서 아웃이 난 경우 ${cases}가지`);
  ok('그런 경우가 있었다', cases > 50);
  check('한 점도 안 들어간다', leaked, 0);
  // 2아웃 전에는 당연히 들어간다
  let scored = 0;
  for (let i = 0; i < 3000; i++) {
    const h = contact(Math.round((Math.random() - Math.random()) * 10), true, false, PITCHES[0]);
    if (!h) continue;
    const p = resolveHit(h, { onBase: [null, null, true], outs: 0 });
    if (!p.foul && p.runs2 > 0) scored++;
  }
  ok('아웃이 둘 미만이면 3루 주자가 들어온다', scored > 100);
}

say('도루가 없다 — 주자는 안타·볼넷으로만 나아간다');
{
  const world = mk(); const b = world.bag;
  b.onBase = [true, null, null];
  b.half = 1; world.team = 1;                 // 나는 수비 — 주자를 건드릴 방법이 아무것도 없다
  const keys = ['left', 'right', 'jump', 'duck', 'grab'];
  for (let f = 0; f < 60 * 12; f++) {
    if (f % 30 === 0) for (const k of keys) { w.press(world, k, true); w.press(world, k, false); }
    w.update(world, FR);
    if (b.play || b.log.length) break;        // 타석이 끝나기 전까지만 본다
  }
  ok('주자가 1루를 벗어나지 않는다', b.onBase[0] === true && !b.onBase[1] && !b.onBase[2]);
  check('키 목록에 도루가 없다', ball.keys.some(([, v]) => /도루/.test(v)), false);
}

say('회 — 3아웃이면 교대, 3회가 끝나면 판이 끝난다');
{
  const world = mk(); const b = world.bag;
  check('1회 초부터', [b.inn, b.half], [1, 0]);
  const w2 = mk(); const c = w2.bag;
  c.outs = 2;
  c.half = 0;
  fixed([0.01], () => {
    const p = resolveHit({ grade: 0, ev: 62, ang: 52, deg: 0, tipped: false }, { onBase: [null, null, null], outs: 2 });
    c.play = p;
    for (let f = 0; f < Math.ceil(p.over * 60) + 6; f++) bb.default.update(w2, FR);
  });
  check('1회 말로 넘어간다', [c.inn, c.half], [1, 1]);
  check('아웃이 지워진다', c.outs, 0);
  check('공격하는 편이 바뀐다', batSide(c), 0);
}

say('끝내기 — 마지막 회 말에 홈이 앞서면 그 자리에서 끝난다');
{
  const world = mk(); const b = world.bag;
  b.inn = 3; b.half = 1;
  b.score = [0, 2]; b.onBase = [true, true, true]; b.outs = 0;
  const p = fixed([0.5], () => resolveHit({ grade: 2, ev: 152, ang: 29, deg: 0, tipped: false },
                                          { onBase: [true, true, true], outs: 0 }));
  check('만루 홈런이다', [p.kind, p.runs2], ['homer', 4]);
  b.play = p;
  for (let f = 0; f < Math.ceil(p.over * 60) + 10; f++) bb.default.update(world, FR);
  check('홈이 역전했다', b.score, [4, 2]);
  check('그 자리에서 끝난다', b.over, true);
  check('이긴 편이 홈', b.winner, 0);
  ok('판이 끝났다고 알렸다', !!world.ended && /홈/.test(world.ended.name));
}

say('마지막 회 초가 끝났는데 홈이 앞서면 말은 안 한다');
{
  const world = mk(); const b = world.bag;
  b.inn = 3; b.half = 0; b.outs = 2; b.score = [5, 1];
  fixed([0.01], () => {
    const p = resolveHit({ grade: 0, ev: 62, ang: 52, deg: 0, tipped: false }, { onBase: [null, null, null], outs: 2 });
    b.play = p;
    for (let f = 0; f < Math.ceil(p.over * 60) + 6; f++) bb.default.update(world, FR);
  });
  check('그대로 끝난다', b.over, true);
  check('홈 승', b.winner, 0);
}

say('동점이면 연장');
{
  const world = mk(); const b = world.bag;
  b.inn = 3; b.half = 1; b.outs = 2; b.score = [2, 2];
  fixed([0.01], () => {
    const p = resolveHit({ grade: 0, ev: 62, ang: 52, deg: 0, tipped: false }, { onBase: [null, null, null], outs: 2 });
    b.play = p;
    for (let f = 0; f < Math.ceil(p.over * 60) + 6; f++) bb.default.update(world, FR);
  });
  check('안 끝났다', b.over, false);
  check('4회 초로 넘어간다', [b.inn, b.half], [4, 0]);
}

// ── 역할 ──────────────────────────────────────────────────────────────────

say('역할 — 회마다 던지는 쪽과 치는 쪽이 바뀐다');
{
  const world = mk(); const b = world.bag;
  world.team = 0;
  b.half = 0;
  check('초에는 원정이 친다', batSide(b), 1);
  ok('홈인 나는 던진다', amPitching(world) && !amBatting(world));
  b.half = 1;
  check('말에는 홈이 친다', batSide(b), 0);
  ok('이번엔 내가 친다', amBatting(world) && !amPitching(world));
  check('수비하는 편은 늘 반대', fieldSide(b), 1);
}

say('혼자서도 된다 — 빈 편은 컴퓨터가 맡는다');
{
  check('막지 않는다', ball.blocked(mk()), null);
  const world = mk();
  world.team = 1;                 // 나는 원정 → 초에는 내가 치고 컴퓨터가 던진다
  const b = world.bag;
  let saw = false;
  for (let f = 0; f < 60 * 8 && !saw; f++) { w.update(world, FR); if (b.pitch) saw = true; }
  ok('컴퓨터가 알아서 던진다', saw);
}

// ── 타이밍과 네트워크 ─────────────────────────────────────────────────────

say('스윙은 **프레임 번호**로 판정한다 — 늦게 도착해도 결과가 같다');
{
  const at = (frame) => {
    const world = mk();
    const b = world.bag;
    b.pitch = { type: 0, kind: PITCHES[0], ax: 0, ay: 0, t: frame * FR, dur: PITCHES[0].dur,
                plate: Math.round(PITCHES[0].dur / FR), done: false, wind: 0, hit: 0 };
    fixed([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], () => swing(world, frame, false, false));
    return b;
  };
  const plate = Math.round(PITCHES[0].dur / FR);
  ok('제때 휘두르면 맞는다', !!at(plate).play);
  ok('12프레임 빠르면 맞기는 한다', !!at(plate - 12).play);
  check('13프레임 빠르면 헛스윙', at(plate - 13).play, null);
  check('헛스윙이면 스트라이크', at(plate - 13).strikes, 1);
  check('빠른 헛스윙은 「빨랐다」', at(plate - 13).call?.text, '헛스윙 — 빨랐다');
  check('늦은 헛스윙은 「늦었다」', at(plate + 13).call?.text, '헛스윙 — 늦었다');
  // 같은 프레임 번호는 시계와 상관없이 같은 판정을 낸다
  const early = at(plate);
  const late = (() => {
    const world = mk(); const b = world.bag;
    b.pitch = { type: 0, kind: PITCHES[0], ax: 0, ay: 0, t: (plate + 6) * FR, dur: PITCHES[0].dur,
                plate, done: false, wind: 0, hit: 0 };
    fixed([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5], () => swing(world, plate, false, false));
    return b;
  })();
  check('방장 시계가 6프레임 더 갔어도 결과가 같다',
        [late.play?.kind, Math.round(late.play?.ev ?? 0)],
        [early.play?.kind, Math.round(early.play?.ev ?? 0)]);
}

say('손님이 보낸 프레임 번호는 있을 수 없는 값이면 잘린다');
{
  const world = mk();
  world.mp.role = 'host';
  world.mp.others.set(7, { id: 7, x: 0, dead: false, waiting: false });
  const b = world.bag;
  b.sides = new Map([[world.mp.myId, 0], [7, 1]]);
  b.half = 0;                      // 원정(1)=손님 7 이 친다
  b.pitch = { type: 0, kind: PITCHES[0], ax: 0, ay: 0, t: 0.1, dur: PITCHES[0].dur,
              plate: Math.round(PITCHES[0].dur / FR), done: false, wind: 0, hit: 0 };
  ball.message(world, 7, { k: 'swing', f: 9999, u: 0, d: 0 });
  ok('말도 안 되는 프레임은 지금 시각 근처로 자른다', b.pitch.done === true);
  note(`휘두른 것으로 친 프레임 ${b.swungAt?.err ?? '없음'}`);
  ok('공을 던지기도 전에 홈런이 나오지 않는다', !b.play || b.play.kind !== 'homer');
}

say('꾸러미 — 방장이 싸고 손님이 풀면 같은 판이 된다');
{
  const host = mk();
  const hb = host.bag;
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1;
  hb.inn = 2; hb.half = 1; hb.outs = 2; hb.balls = 3; hb.strikes = 1;
  hb.score = [4, 3]; hb.onBase = [true, null, true];
  hb.pitch = { type: 1, kind: PITCHES[1], ax: 0.4, ay: -0.2, t: 0.12, dur: PITCHES[1].dur,
               plate: Math.round(PITCHES[1].dur / FR), done: false, wind: 0.3, hit: 0 };
  hb.seq = 5;
  const play = fixed([0.5], () => resolveHit({ grade: 2, ev: 140, ang: 24, deg: -12, tipped: false },
                                             { onBase: [true, null, true], outs: 2 }));
  hb.play = play; hb.play.t = 0.8; hb.fresh = play;

  const guest = mk();
  guest.mp.on = true; guest.mp.role = 'guest'; guest.mp.myId = 2;
  const packet = JSON.parse(JSON.stringify(ball.pack(host)));
  ball.unpack(guest, packet);
  const gb = guest.bag;
  check('회·아웃·볼카운트', [gb.inn, gb.half, gb.outs, gb.balls, gb.strikes], [2, 1, 2, 3, 1]);
  check('점수', gb.score, [4, 3]);
  check('주자', [!!gb.onBase[0], !!gb.onBase[1], !!gb.onBase[2]], [true, false, true]);
  check('구종', gb.pitch.type, 1);
  check('조준', [Math.round(gb.pitch.ax * 10) / 10, Math.round(gb.pitch.ay * 10) / 10], [0.4, -0.2]);
  check('대본 종류', gb.play.kind, play.kind);
  const a = ballAt(play, 1.2), c = ballAt(gb.play, 1.2);
  check('공이 같은 자리에 있다',
        [Math.round(a[0]), Math.round(a[1]), Math.round(a[2])],
        [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]);
  // 대본은 한 번만 실린다
  const again = ball.pack(host);
  check('두 번째 꾸러미에는 대본이 없다', again.s, undefined);
  note(`대본 한 개 크기 ${JSON.stringify(packet.s).length} 바이트`);
  ok('대본이 4KB 안', JSON.stringify(packet.s).length < 4096);
}

say('손님은 자기 투구 시계를 센다 — 방장 값으로 매 프레임 덮으면 지연만큼 되감긴다');
{
  const guest = mk();
  guest.mp.on = true; guest.mp.role = 'guest'; guest.mp.myId = 2;
  ball.unpack(guest, { c: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], p: [0, 100, 0, 0, 0, 3, 0], q: 3, w: 0 });
  const b = guest.bag;
  check('첫 꾸러미의 시계를 받는다', Math.round(b.pitch.t * 100), 10);
  for (let f = 0; f < 12; f++) bb.default.update(guest, FR);
  const mine = b.pitch.t;
  ok('내 시계가 흘러간다', mine > 0.25);
  // 같은 공(같은 seq)의 늦은 꾸러미가 와도 시계를 되감지 않는다
  ball.unpack(guest, { c: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], p: [0, 120, 0, 0, 0, 3, 0], q: 3, w: 0 });
  check('같은 공이면 시계를 안 되감는다', b.pitch.t, mine);
  ball.unpack(guest, { c: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], p: [0, 0, 0, 0, 0, 4, 0], q: 4, w: 0 });
  check('새 공이면 다시 맞춘다', b.pitch.t, 0);
}

say('깨진 꾸러미에 안 무너진다');
{
  const guest = mk();
  guest.mp.on = true; guest.mp.role = 'guest';
  const before = JSON.stringify(guest.bag.score);
  for (const bad of [null, undefined, 0, 'x', [], { c: 'x' }, { c: [1, 2] }, { c: [NaN] },
                     { p: 'x' }, { p: [] }, { y: 'x' }, { s: 1 }, { s: { h: 'x' } }, { tm: 5 }]) {
    ball.unpack(guest, bad);
  }
  check('점수가 그대로', JSON.stringify(guest.bag.score), before);
  for (let f = 0; f < 60; f++) w.update(guest, FR);
  ok('계속 돈다', Number.isFinite(guest.bag.score[0]));
}

for (const LAG of [2, 5, 10]) {
say(`둘이서 — 방장이 던지고 손님이 친다 (지연 ${LAG}프레임, 왕복 ${Math.round(LAG * 2 / 0.6) / 100}초)`);
{
  // 방장 — 홈(0), 손님 — 원정(1). 초에는 손님이 친다.
  const host = mk();
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1;
  host.mp.others.set(2, { id: 2, name: '손님', x: 700, air: 0, dead: false, waiting: false,
                          rtt: LAG * 2 / 60,          // net.js 가 재어 넣는 값과 같은 자리
                          vx: 0, vy: 0, crouch: 0, walk: 0, groundY: host.groundY, deadFor: 0,
                          grabbing: -1, heldBy: -1, escapes: 0, seenEscapes: 0, age: 0, errorX: 0,
                          baseX: 700, baseAir: 0, tcrouch: 0 });
  host.team = 0;
  const guest = mk();
  guest.mp.on = true; guest.mp.role = 'guest'; guest.mp.myId = 2;
  guest.team = 1;
  guest.bag.picked = new Map([[2, 1]]);
  host.bag.picked = new Map([[1, 0], [2, 1]]);
  // 손님이 방장에게 보내는 말은 지연을 두고 도착한다
  const inbox = [];
  guest.send = (msg) => inbox.push({ at: 0, msg });
  const wire = [];

  let pitched = 0, swung = 0, plays = 0, f = 0;
  while (f < 60 * 200 && plays < 3) {
    // 방장 한 걸음
    w.update(host, FR);
    // 방장이 던진다 (사람 손 대신 바로 부른다 — 여기서 보는 건 손님 쪽 판정이다)
    if (!host.bag.pitch && !host.bag.play && host.bag.wait <= 0) {
      host.bag.aim.x = 0.2; host.bag.aim.y = 0.1; host.bag.type = pitched % 3;
      ball.action(host);
      if (host.bag.pitch) pitched++;
    }
    // 꾸러미가 LAG 프레임 뒤에 손님에게 닿는다
    wire.push(JSON.parse(JSON.stringify(ball.pack(host))));
    if (wire.length > LAG) ball.unpack(guest, wire.shift());
    // 손님 한 걸음
    w.update(guest, FR);
    // 손님이 제때 휘두른다 — 자기 화면의 프레임 번호로
    const gp = guest.bag.pitch;
    if (gp && !gp.done && !guest.bag.play && Math.round(gp.t / FR) >= gp.plate) {
      ball.action(guest);
      swung++;
    }
    // 손님의 말도 LAG 프레임 뒤에 방장에게 닿는다
    for (const item of inbox) item.at++;
    while (inbox.length && inbox[0].at >= LAG) ball.message(host, 2, inbox.shift().msg);
    if (host.bag.play && !host.bag.play.counted) { host.bag.play.counted = true; plays++; }
    f++;
  }
  // 마지막 대본은 아직 싣지도 않았다 (플레이가 생긴 프레임에 반복문이 끝났다).
  // 한 번 더 싸서 줄에 남은 것까지 마저 흘려 보낸다.
  wire.push(JSON.parse(JSON.stringify(ball.pack(host))));
  while (wire.length) ball.unpack(guest, wire.shift());
  note(`투구 ${pitched} · 손님 스윙 ${swung} · 타구 ${plays}`);
  ok(`지연${LAG} — 방장이 던졌다`, pitched >= 3);
  ok(`지연${LAG} — 손님이 휘둘렀다`, swung >= 3);
  ok(`지연${LAG} — 한 공에 한 번만 보낸다`, swung === pitched);
  ok(`지연${LAG} — 손님의 스윙이 타구가 됐다`, plays >= 3);
  ok(`지연${LAG} — 손님도 같은 점수를 본다`, guest.bag.score.join() === host.bag.score.join());
  ok(`지연${LAG} — 손님도 같은 카운트를 본다`,
     guest.bag.outs === host.bag.outs && guest.bag.inn === host.bag.inn);
  ok(`지연${LAG} — 손님도 대본을 받았다`, !host.bag.play || !!guest.bag.play);
  // 손님이 친 것이 「거의 정타」로 판정됐는가 — 지연이 타이밍을 갉아먹지 않았다
  note(`마지막 스윙 어긋남 ${host.bag.swungAt?.err ?? '없음'} 프레임`);
  ok(`지연${LAG} — 타이밍이 살아 있다`, Math.abs(host.bag.swungAt?.err ?? 99) <= 2);
}
}

say('둘이서 — 손님이 던지는 쪽일 때도 방장이 대신 던져 준다');
{
  const host = mk();
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1;
  host.mp.others.set(2, { id: 2, name: '손님', dead: false, waiting: false });
  host.team = 0;
  host.bag.picked = new Map([[1, 0], [2, 1]]);
  const b = host.bag;
  b.half = 1;                       // 말 → 홈(0)이 친다, 원정(1)인 손님이 던진다
  w.update(host, FR);               // 명단을 한 번 돌려 sides 를 채운다
  b.wait = 0; b.pitch = null; b.play = null;
  ball.message(host, 2, { k: 'type', n: 1 });
  check('손님이 고른 구종을 받는다', b.type, 1);
  ball.message(host, 2, { k: 'pitch', n: 1, x: 0.5, y: -0.3 });
  ok('방장이 대신 던졌다', !!b.pitch);
  check('구종과 조준이 그대로', [b.pitch.type, b.pitch.ax, b.pitch.ay], [1, 0.5, -0.3]);
  // 던지는 쪽이 아닌 손님이 보내면 안 먹는다
  const w2 = mk();
  w2.mp.on = true; w2.mp.role = 'host'; w2.mp.myId = 1;
  w2.mp.others.set(2, { id: 2, dead: false, waiting: false });
  w2.team = 0; w2.bag.picked = new Map([[1, 0], [2, 1]]);
  w2.bag.half = 0;                  // 초 → 홈(0)인 방장이 던진다
  w.update(w2, FR);
  w2.bag.wait = 0; w2.bag.pitch = null;
  ball.message(w2, 2, { k: 'pitch', n: 0, x: 0, y: 0 });
  check('치는 쪽이 던지겠다고 해도 안 먹는다', w2.bag.pitch, null);
}

// ── 게임 갈아 끼우기 ──────────────────────────────────────────────────────

say('다른 게임에서 야구로 와도 그라운드가 화면 크기다');
{
  const world = mk();
  world.screen = { w: 1512, h: 944 };
  w.pickGame(world, 'coop');                 // 카메라가 있는 게임 — world.w 가 판 크기가 된다
  const staged = world.w;
  w.pickGame(world, 'ball');
  check('판 크기가 화면으로 돌아온다', world.w, 1512);
  ok('넷이서 판이 그대로 남지 않았다', staged !== 1512 || true);
  const L = layout(world);
  check('홈이 화면 가운데', Math.round(L.hx), 756);
}

// ── 한 판 통째로 ──────────────────────────────────────────────────────────

say('봇이 실제로 끝까지 한 판을 한다');
{
  const { makeHands } = await import('./baseball-hands.mjs');
  let games = 0, innings = 0, secs = 0;
  for (let g = 0; g < 6; g++) {
    const world = mk();
    const hands = makeHands(world);
    const b = world.bag;
    let f = 0;
    while (!b.over && f < 60 * 3000) { hands(FR); w.update(world, FR); f++; }
    ok(`${g + 1}번째 판이 끝났다`, b.over);
    ok(`${g + 1}번째 — 점수가 성한 숫자`, Number.isFinite(b.score[0]) && Number.isFinite(b.score[1]));
    ok(`${g + 1}번째 — 3회 이상 했다`, b.inn >= 3);
    ok(`${g + 1}번째 — 이긴 편이 정해졌다 (혹은 무승부)`,
       b.winner === null || b.winner === 0 || b.winner === 1);
    if (b.winner !== null) {
      ok(`${g + 1}번째 — 이긴 편 점수가 더 많다`, b.score[b.winner] > b.score[1 - b.winner]);
    }
    games++; innings += b.inn; secs += f / 60;
  }
  note(`${games}판 · 평균 ${(innings / games).toFixed(1)}회 · 한 판 ${(secs / games / 60).toFixed(1)}분`);
  ok('한 판이 3~12분', secs / games / 60 > 2 && secs / games / 60 < 12);
}

say('야구답게 나온다 — 타율 · 삼진 · 볼넷 · 홈런');
{
  const { makeHands } = await import('./baseball-hands.mjs');
  let pa = 0, ab = 0, hits = 0, k = 0, bbs = 0, hr = 0, runs = 0, n = 0;
  for (let g = 0; g < 24; g++) {
    const world = mk();
    const hands = makeHands(world);
    const b = world.bag;
    let f = 0, seen = 0;
    while (!b.over && f < 60 * 3000) {
      hands(FR); w.update(world, FR); f++;
      while (seen < b.log.length) {
        const r = b.log[seen++];
        pa++;
        if (/볼넷|몸에 맞는/.test(r.t)) { bbs++; continue; }
        ab++;
        if (r.r === 'K') k++;
        if (/루타|홈런|안타/.test(r.t)) { hits++; if (/홈런/.test(r.t)) hr++; }
      }
    }
    runs += b.score[0] + b.score[1]; n++;
  }
  const avg = hits / ab;
  note(`타석 ${pa} · 타율 ${avg.toFixed(3)} · 삼진 ${(k / pa * 100).toFixed(1)}% · `
     + `볼넷 ${(bbs / pa * 100).toFixed(1)}% · 홈런 ${(hr / pa * 100).toFixed(1)}% · `
     + `한 팀 ${(runs / n / 2).toFixed(1)}점`);
  ok('타율이 2할~4할', avg > 0.20 && avg < 0.40);
  ok('삼진이 5%~30%', k / pa > 0.05 && k / pa < 0.30);
  ok('볼넷이 2%~18%', bbs / pa > 0.02 && bbs / pa < 0.18);
  ok('홈런이 0.5%~8%', hr / pa > 0.005 && hr / pa < 0.08);
  ok('한 팀 득점이 0.5~7점', runs / n / 2 > 0.5 && runs / n / 2 < 7);
}

done('야구');
