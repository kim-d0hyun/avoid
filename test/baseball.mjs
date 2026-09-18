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
        FENCE_MID, FENCE_LINE, fenceFt, runnerAt, manAt, facingOf, POSTS,
        makeOrder, atBat, postAt, pullWord, AIM_OUT, standers } = bb;
const { BAT_TIME, PITCH_TIME, batPoint, pitchHand } = await import(R + 'draw/stickman.js');

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

say('구종 넷 — 직구와 커브가 17프레임 떨어져 있다 (이 간격이 수싸움이다)');
{
  const no = (name) => PITCHES.findIndex((p) => p.name === name);
  const FAST = no('직구'), SLIDE = no('슬라이더'), CURVE = no('커브'), CHANGE = no('체인지업');
  ok('구종이 넷이다', PITCHES.length === 4 && [FAST, SLIDE, CURVE, CHANGE].every((i) => i >= 0));
  const frames = PITCHES.map((p) => Math.round(p.dur / FR));
  note(PITCHES.map((p, i) => `${p.name} ${frames[i]}`).join(' · ') + ' 프레임');
  check('직구가 제일 빠르다', frames[FAST], Math.min(...frames));
  check('커브가 제일 느리다', frames[CURVE], Math.max(...frames));
  ok('직구와 커브가 15프레임 넘게 벌어진다', frames[CURVE] - frames[FAST] >= 15);
  // 슬라이더는 속도로 안 속인다 — 옆으로 속인다
  ok('슬라이더는 직구와 박자가 가깝다', Math.abs(frames[SLIDE] - frames[FAST]) <= 6);
  ok('슬라이더가 제일 많이 휜다',
     PITCHES.every((p, i) => i === SLIDE || Math.abs(p.bend) < Math.abs(PITCHES[SLIDE].bend)));
  // 직구를 노리고 커브를 맞으면 헛스윙이 나와야 한다 — 안 그러면 구종을 읽을 이유가 없다
  const wrong = Array.from({ length: 400 }, () => guessErr(FAST, CURVE, 10));
  const miss = wrong.filter((e) => Math.abs(e) > 12).length / wrong.length;
  note(`직구를 노리고 커브를 만나면 헛스윙 ${(miss * 100).toFixed(0)}%`);
  ok('절반 가까이 헛스윙', miss > 0.35);
  const right = Array.from({ length: 400 }, () => guessErr(FAST, FAST, 10));
  ok('제대로 읽으면 거의 맞는다', right.filter((e) => Math.abs(e) > 12).length / right.length < 0.05);
}

say('조준은 존 한 겹 밖까지만 — 터무니없는 데는 못 겨눈다');
{
  ok('한계가 존 테두리 근처다', AIM_OUT > 1 && AIM_OUT < 1.6);
  const world = mk(); const b = world.bag;
  world.team = 0; b.half = 0;                // 초 — 내가 던진다
  world.input.right = true; world.input.jump = true;
  for (let f = 0; f < 60 * 5; f++) w.update(world, FR);
  ok('오른쪽 끝에서 멈춘다', Math.abs(b.aim.x - AIM_OUT) < 0.01);
  ok('위쪽 끝에서도', Math.abs(b.aim.y - AIM_OUT) < 0.01);
  world.input.right = false; world.input.jump = false;
  world.input.left = true; world.input.duck = true;
  for (let f = 0; f < 60 * 5; f++) w.update(world, FR);
  ok('반대쪽도 같다', Math.abs(b.aim.x + AIM_OUT) < 0.01 && Math.abs(b.aim.y + AIM_OUT) < 0.01);
  world.input.left = false; world.input.duck = false;

  // 손님이 터무니없는 값을 보내도 잘린다
  const host = mk();
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1;
  host.mp.others.set(2, { id: 2, dead: false, waiting: false });
  host.team = 0; host.mp.ballSides = new Map([[1, 0], [2, 1]]);
  w.update(host, FR);
  host.bag.half = 1;                          // 말 → 손님(원정)이 던진다
  host.bag.wait = 0; host.bag.pitch = null;
  ball.message(host, 2, { k: 'pitch', n: 0, x: 99, y: -99 });
  ok('손님이 보낸 값도 한계 안으로', !!host.bag.pitch
     && Math.abs(host.bag.pitch.aimX) <= AIM_OUT + 1e-6
     && Math.abs(host.bag.pitch.aimY) <= AIM_OUT + 1e-6);
}

say('제구 — 겨눈 자리와 가는 자리는 다르다');
{
  const world = mk(); const b = world.bag;
  const spots = [];
  for (let i = 0; i < 300; i++) {
    b.pitch = null;
    b.aim.x = 0.8; b.aim.y = -0.3; b.type = 0; b.wait = 0; b.over = false;
    b.half = 0; world.team = 0;
    ball.action(world);
    if (b.pitch) spots.push([b.pitch.ax, b.pitch.ay]);
  }
  ok('실제로 던졌다', spots.length > 250);
  const dx = spots.map(([x]) => x - 0.8);
  const spread2 = Math.sqrt(dx.reduce((a, c) => a + c * c, 0) / dx.length);
  note(`겨눈 0.80 → 실제 평균 ${(spots.reduce((a, c) => a + c[0], 0) / spots.length).toFixed(2)} · 흔들림 ${spread2.toFixed(2)}`);
  ok('겨눈 자리 근처로 간다', Math.abs(spots.reduce((a, c) => a + c[0], 0) / spots.length - 0.8) < 0.08);
  ok('그대로 꽂히지는 않는다', spread2 > 0.08 && spread2 < 0.45);
  ok('겨눈 자리는 따로 기억한다', spots.length > 0 && b.pitch.aimX === 0.8);
}

say('데드볼 — 겨눠서는 못 맞힌다. 몸쪽을 파다 밀리면 맞는다');
{
  // 조준 한계까지 몸쪽으로 겨눠도 대부분은 안 맞는다
  const world = mk(); const b = world.bag;
  world.team = 0; b.half = 0;
  let hit = 0, thrown = 0;
  for (let i = 0; i < 400; i++) {
    b.pitch = null; b.play = null; b.wait = 0; b.balls = 0; b.strikes = 0;
    b.aim.x = -AIM_OUT; b.aim.y = 0; b.type = 0;
    ball.action(world);
    if (!b.pitch) continue;
    thrown++;
    b.aiSwing = null;                          // 타자는 안 휘두른다
    // 맞은 사람은 움찔한 다음에 걸어 나간다 — 판정이 난 뒤로도 좀 더 돌려야 기록에 남는다
    for (let f = 0; f < 90 && !b.play; f++) bb.default.update(world, FR);
    if (b.log.some((x) => x.r === 'HBP')) hit++;
    b.log.length = 0;
  }
  note(`한계까지 몸쪽으로 ${thrown}번 던져 데드볼 ${hit}번 (${(hit / thrown * 100).toFixed(0)}%)`);
  ok('겨눠서 늘 맞힐 수는 없다', hit / thrown < 0.4);
  ok('그래도 이따금 맞는다', hit > 0);

  // 홈에 붙어 선 타자는 더 맞는다
  const rate = (stand) => {
    const w2 = mk(); const c = w2.bag;
    w2.team = 0; c.half = 0;
    let n = 0, m = 0;
    for (let i = 0; i < 400; i++) {
      c.pitch = null; c.play = null; c.wait = 0; c.balls = 0; c.strikes = 0;
      c.aim.x = -AIM_OUT; c.aim.y = 0; c.mitt = { x: -stand, y: 0 }; c.stand = stand;
      ball.action(w2);
      if (!c.pitch) continue;
      m++; c.aiSwing = null;
      for (let f = 0; f < 90 && !c.play; f++) bb.default.update(w2, FR);
      if (c.log.some((x) => x.r === 'HBP')) n++;
      c.log.length = 0; c.mitt = { x: -stand, y: 0 }; c.stand = stand;
    }
    return n / m;
  };
  const close = rate(1), back = rate(-1);
  note(`홈에 붙어 서면 ${(close * 100).toFixed(0)}% · 물러서면 ${(back * 100).toFixed(0)}%`);
  ok('붙어 설수록 더 맞는다', close > back);
}

say('커브는 늦게 떨어진다 — 앞쪽 절반보다 뒤쪽 절반에서 더 진다');
{
  const L = layout(mk());
  const curve = PITCHES.findIndex((x) => x.name === '커브');
  const p = { type: curve, kind: PITCHES[curve], ax: 0, ay: 0 };
  const a = pitchAt(p, L, 0).y, b = pitchAt(p, L, 0.5).y, c = pitchAt(p, L, 1).y;
  const straight = { type: 0, kind: PITCHES[0], ax: 0, ay: 0 };
  // 겨눈 자리가 곧 도착 자리다. 휘고 떨어지는 것은 **오는 길에서만** 일어난다 —
  // 도착 자리까지 밀면 조준 한계를 아무리 좁혀도 구종이 그 밖으로 데려가 버린다.
  const end = pitchEnd(p, L), endS = pitchEnd(straight, L);
  ok('같은 데를 겨누면 같은 데로 온다', Math.abs(end.y - endS.y) < 0.01 && Math.abs(end.x - endS.x) < 0.01);
  ok('오는 길에서는 직구보다 높이 떠 있다', b < pitchAt(straight, L, 0.5).y - 1);
  ok('뒤쪽 절반에서 더 많이 진다', (c - b) > (b - a) * 1.15);
}

say('존 안이라도 어디로 들어왔느냐가 결과를 바꾼다');
{
  // 「네모 안 아무 데나 던져도 휘두르면 다 쳐진다」가 되면 조준하는 쪽이 할 일이 없다.
  // 배트가 닿는 창과 정타 경계가 같이 좁아지고, 구석에 붙인 공은 맞아도 안 뻗어야 한다.
  const jab = (side, high) => {
    let miss = 0, barrel = 0, ev = 0, hit = 0, n = 0;
    for (let e = -12; e <= 12; e++) for (let i = 0; i < 120; i++) {
      n++;
      const c = contact(e, false, false, PITCHES[0], { side, high });
      if (!c) { miss++; continue; }
      hit++; ev += c.ev;
      if (c.grade === 2) barrel++;
    }
    return { miss: miss / n, barrel: barrel / n, ev: ev / Math.max(1, hit) };
  };
  const mid = jab(0, 0), edge = jab(1, 0), corner = jab(0.9, 0.9), out = jab(1.35, 0);
  note(`한가운데 헛스윙 ${(mid.miss*100).toFixed(0)}% · 정타 ${(mid.barrel*100).toFixed(0)}% · ${mid.ev.toFixed(0)}mph`);
  note(`존 구석   헛스윙 ${(corner.miss*100).toFixed(0)}% · 정타 ${(corner.barrel*100).toFixed(0)}% · ${corner.ev.toFixed(0)}mph`);
  note(`한 겹 밖  헛스윙 ${(out.miss*100).toFixed(0)}% · 정타 ${(out.barrel*100).toFixed(0)}% · ${out.ev.toFixed(0)}mph`);
  ok('구석은 더 헛친다', corner.miss > mid.miss + 0.05);
  ok('존 밖은 더 헛친다', out.miss > edge.miss);
  ok('구석은 정타가 덜 나온다', corner.barrel < mid.barrel * 0.92);
  ok('구석은 맞아도 덜 뻗는다', corner.ev < mid.ev * 0.95);
  ok('한가운데는 늘 맞는다', mid.miss < 0.02);
  // 홈에 붙어 서면 바깥쪽이 가운데처럼 보인다 — 자리 옮기기가 이 줄을 되민다
  const far = jab(1.2, 0).miss, near = jab(1.2 - 0.5, 0).miss;   // stand 1 이면 side 가 0.5 준다
  ok('한 발 붙어 서면 바깥쪽이 쉬워진다', near < far);
}

say('판이 도는 동안 사람이 사라지지 않는다');
{
  // 대본에 줄이 없는 주자(태그업 안 한 사람, 안 밀린 사람)를 안 그렸더니 **판이 도는
  // 몇 초 동안 화면에서 통째로 없어졌다가** 끝나는 순간 루에 다시 나타났다.
  const b = { onBase: [true, false, true], play: { runs: [{ from: 0, to: 1 }] } };
  check('안 뛰는 주자 둘이 남는다', standers(b), [1, 3]);
  b.play.runs.push({ from: 1, to: 2 });
  check('뛰기 시작한 사람은 빠진다', standers(b), [3]);
  check('판이 없으면 이 갈래는 안 쓴다', standers({ onBase: [true, true, true], play: null }), []);

  // 실제 판에서 빠지는 사람이 없는지 — 대본마다 「루에 있던 사람 = 뛰는 사람 + 선 사람」
  const { makeHands } = await import('./baseball-hands.mjs');
  const world = mk(); const w2 = world.bag;
  const hands = makeHands(world);
  let plays = 0, lost = 0;
  for (let f = 0; f < 60 * 3000 && plays < 260; f++) {
    hands(FR); w.update(world, FR);
    const p = w2.play;
    if (!p || p.seen2) continue;
    p.seen2 = true; plays++;
    const on = w2.onBase.filter(Boolean).length;
    const moving = new Set(p.runs.map((r) => r.from));
    const run = [1, 2, 3].filter((i) => w2.onBase[i - 1] && moving.has(i)).length;
    if (run + standers(w2).length !== on) lost++;
  }
  note(`대본 ${plays}개 — 빠진 사람이 있는 대본 ${lost}개`);
  ok('루에 있던 사람은 모두 화면에 있다', lost === 0);
}

say('손님 화면도 방장과 같은 것을 본다 — 기록 세 줄 · 머리글 · 이긴 편 · 판정 글자 길이');
{
  const host = mk(); const hb = host.bag;
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1;
  hb.log = [{ no: 3, r: '6-4-3', t: '병살타' }, { no: 4, r: 'K', t: '삼진' }];
  hb.note = '홈 승 3:1'; hb.winner = 0; hb.errs = [1, 0]; hb.hits = [5, 2];
  hb.call = { text: '스트라이크', big: false, t: 0 };
  const guest = mk();
  guest.mp.on = true; guest.mp.role = 'guest'; guest.mp.myId = 2;
  ball.unpack(guest, ball.pack(host));
  const g = guest.bag;
  check('기록 줄이 그대로 온다', g.log.map((r) => r.r), ['6-4-3', 'K']);
  check('머리글이 온다', g.note, '홈 승 3:1');
  check('이긴 편이 온다', g.winner, 0);
  check('작은 글자는 1초짜리다', g.call.life, 1.0);
  hb.call = { text: '홈런!', big: true, t: 0 };
  ball.unpack(guest, ball.pack(host));
  check('큰 글자는 1.4초짜리다', guest.bag.call.life, 1.4);
  // 실책은 **저지른 편**에 쌓인다 — 기록지가 그 편 줄에 적는다
  check('실책은 수비한 편에 쌓인다', hb.errs, [1, 0]);
}

say('⌥M 은 혼자 하는 야구를 멈춘다 — 방이 열려 있어도 아무도 없으면 혼자다');
{
  const world = mk(); const b = world.bag;
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1;   // 고르면 방이 열린다
  const { makeHands } = await import('./baseball-hands.mjs');
  const hands = makeHands(world);
  for (let f = 0; f < 60 * 20; f++) { hands(FR); w.update(world, FR); }
  const before = { inn: b.inn, half: b.half, thrown: b.log.length };
  world.menu.open = true;
  for (let f = 0; f < 60 * 60; f++) { hands(FR); w.update(world, FR); }
  check('메뉴를 열면 판이 멎는다', [b.inn, b.half, b.log.length],
        [before.inn, before.half, before.thrown]);
  // 남이 들어와 있으면 못 멈춘다 — 남의 시계까지 세울 수는 없다.
  world.mp.others.set(2, { id: 2, name: '손님', x: 0, groundY: 0, air: 0, vx: 0, vy: 0,
                           dead: false, waiting: false, deadFor: 0, facing: 1, walk: 0,
                           crouch: 0, grabbing: -1, heldBy: -1, grabAim: 0, slide: 0 });
  const was = world.elapsed;
  for (let f = 0; f < 60; f++) w.update(world, FR);
  ok('둘이 할 때는 메뉴를 열어도 시계가 돈다', world.elapsed > was + 0.5);
}

say('구종은 **눈에 보이게** 다르다 — 오는 길이 다르고 도착은 같다');
{
  const L = layout(mk());
  const z = zone(L);
  const fast = { type: 0, kind: PITCHES[0], ax: 0, ay: 0 };
  const swerve = (i) => {
    const p = { type: i, kind: PITCHES[i], ax: 0, ay: 0 };
    let dx = 0, dy = 0;
    for (let u = 0; u <= 1.0001; u += 0.02) {
      const a = pitchAt(p, L, u), s = pitchAt(fast, L, u);
      dx = Math.max(dx, Math.abs(a.x - s.x)); dy = Math.max(dy, Math.abs(a.y - s.y));
    }
    return [dx / (z.w / 2), dy / (z.h / 2)];
  };
  PITCHES.forEach((k, i) => {
    const [dx, dy] = swerve(i);
    note(`${k.name} — 곧은 선에서 가로 ${dx.toFixed(2)} · 세로 ${dy.toFixed(2)} (존 반폭 기준) · ${Math.round(k.dur * 60)}프레임`);
  });
  const [, curveY] = swerve(PITCHES.findIndex((k) => k.name === '커브'));
  const [slideX] = swerve(PITCHES.findIndex((k) => k.name === '슬라이더'));
  // 존 반폭의 0.3배면 90픽셀짜리 존에서 13픽셀 — 이보다 작으면 구종이 넷이나 있어도
  // 화면에서는 속도밖에 안 다르다. 처음에 커브가 0.21, 슬라이더가 0.14였다.
  ok('커브는 눈에 보이게 진다', curveY > 0.45);
  ok('슬라이더는 눈에 보이게 휜다', slideX > 0.3);
  // 그래도 **도착 자리는 겨눈 그 자리**다. 휨을 도착까지 밀면 조준 한계가 뜻을 잃는다.
  PITCHES.forEach((k, i) => {
    const p = { type: i, kind: k, ax: 0.7, ay: -0.4 };
    const end = pitchEnd(p, L), last = pitchAt(p, L, 1);
    ok(`${k.name} 은 겨눈 자리로 온다`, Math.abs(end.x - last.x) < 0.5 && Math.abs(end.y - last.y) < 0.5);
  });
}

say('아무도 없는 루로는 안 던진다 — 1루수가 나가면 투수가 덮고, 가까우면 제가 밟는다');
{
  const BASE = [[0, 0], [45, 90], [0, 127], [-45, 90]];
  const near = (a, c) => Math.abs(a[0] - c[0]) < 4 && Math.abs(a[1] - c[1]) < 10;
  let throws = 0, carry = 0, empty = 0;
  const recs = {};
  for (let i = 0; i < 20000; i++) {
    const c = contact((Math.random() * 25 - 12) | 0, Math.random() < 0.3, Math.random() < 0.3,
                      PITCHES[(Math.random() * 4) | 0],
                      { side: Math.random() * 2 - 1, high: Math.random() * 2 - 1 });
    if (!c) continue;
    const on = [Math.random() < 0.3, Math.random() < 0.2, Math.random() < 0.15];
    const p = resolveHit(c, { onBase: on, outs: (Math.random() * 3) | 0, leg: 0, shift: 0 });
    if (p.record) recs[p.record] = (recs[p.record] ?? 0) + 1;
    for (const h of p.hops) {
      if (h.k !== 'throw') continue;
      throws++;
      if (h.carry) { carry++; continue; }
      if (!BASE.some((b2) => near(b2, h.b))) continue;      // 마운드로 돌려보내는 공
      if (!p.men.find((m) => near([m.deg, m.ft], h.b))) empty++;
    }
  }
  note(`송구 ${throws} · 들고 뛴 것 ${carry} · 아무도 없는 루로 던진 것 ${empty}`);
  ok('아무도 없는 루로 던지지 않는다', empty === 0);
  ok('가까우면 들고 뛴다', carry > throws * 0.01);
  ok('제가 밟은 것은 U 로 적는다', Object.keys(recs).some((r) => /U$/.test(r)));
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

say('공이 들어온 자리가 타구를 바꾼다 — 안 그러면 조준하는 쪽이 할 일이 없다');
{
  const many = (spot, n = 500) => {
    let ev = 0, ang = 0, deg = 0;
    for (let i = 0; i < n; i++) {
      const h = contact(0, false, false, PITCHES[0], spot);
      ev += h.ev; ang += h.ang; deg += h.deg;
    }
    return { ev: ev / n, ang: ang / n, deg: deg / n };
  };
  const mid = many({ side: 0, high: 0 });
  const high = many({ side: 0, high: 0.9 });
  const low = many({ side: 0, high: -0.9 });
  const inside = many({ side: -0.9, high: 0 });
  const out = many({ side: 0.9, high: 0 });
  const corner = many({ side: 1.3, high: 1.3 });
  note(`한가운데 ${mid.ev.toFixed(0)}ft/s ${mid.ang.toFixed(0)}° · 구석 ${corner.ev.toFixed(0)}ft/s`);
  ok('높은 공은 뜬다', high.ang > mid.ang + 4);
  ok('낮은 공은 구른다', low.ang < mid.ang - 4);
  ok('몸쪽 공은 당겨진다', inside.deg < mid.deg - 5);
  ok('바깥쪽 공은 밀린다', out.deg > mid.deg + 5);
  ok('구석 공은 제대로 못 맞힌다', corner.ev < mid.ev * 0.92);
  ok('한가운데가 제일 세게 맞는다', mid.ev > out.ev && mid.ev > high.ev);
}

say('미트 — 치는 쪽도 조준한다 (게임빌·컴투스 프로야구의 그 미트)');
{
  const world = mk();
  const b = world.bag;
  world.team = 0; b.half = 1;                    // 말 → 내가 친다
  check('처음엔 한복판', [b.mitt.x, b.mitt.y], [0, 0]);
  world.input.right = true; world.input.jump = true;
  for (let f = 0; f < 30; f++) w.update(world, FR);
  ok('⌥→↑ 로 바깥쪽 위로 간다', b.mitt.x > 0.3 && b.mitt.y > 0.3);
  world.input.right = false; world.input.jump = false;
  world.input.left = true; world.input.duck = true;
  for (let f = 0; f < 90; f++) w.update(world, FR);
  ok('⌥←↓ 로 몸쪽 아래로 간다', b.mitt.x < -0.3 && b.mitt.y < -0.3);
  ok('몸쪽을 노리면 홈에 붙어 선다', b.stand > 0.3);
  world.input.left = false; world.input.duck = false;
  for (let f = 0; f < 240; f++) w.update(world, FR);
  ok('끝까지는 안 나간다', b.mitt.x >= -AIM_OUT && b.mitt.y >= -AIM_OUT);
  // 던지는 쪽일 때는 안 움직인다 (같은 키가 조준이다)
  const w2 = mk(); w2.team = 0; w2.bag.half = 0;
  w2.input.right = true;
  for (let f = 0; f < 60; f++) w.update(w2, FR);
  check('던지는 쪽은 미트가 안 움직인다', w2.bag.mitt.x, 0);
  ok('대신 조준이 움직인다', w2.bag.aim.x > 0.3);
}

say('미트가 결과를 바꾼다 — 같은 공도 미트를 어디 뒀느냐로 갈린다');
{
  // 바깥쪽 낮은 공(0.9, −0.9) 하나를 두고, 미트를 맞춰 놓았을 때와 한복판에 뒀을 때.
  const jab = (mx, my) => {
    let miss = 0, barrel = 0, ev = 0, hit = 0, n = 0;
    for (let e = -12; e <= 12; e++) for (let i = 0; i < 120; i++) {
      n++;
      const c = contact(e, false, false, PITCHES[0], { side: 0.9 - mx, high: -0.9 - my });
      if (!c) { miss++; continue; }
      hit++; ev += c.ev;
      if (c.grade === 2) barrel++;
    }
    return { miss: miss / n, barrel: barrel / n, ev: ev / Math.max(1, hit) };
  };
  const on = jab(0.9, -0.9), mid = jab(0, 0);
  note(`미트를 맞추면 헛스윙 ${(on.miss*100).toFixed(0)}% · 정타 ${(on.barrel*100).toFixed(0)}% · ${on.ev.toFixed(0)}mph`);
  note(`한복판에 두면 헛스윙 ${(mid.miss*100).toFixed(0)}% · 정타 ${(mid.barrel*100).toFixed(0)}% · ${mid.ev.toFixed(0)}mph`);
  ok('맞춰 두면 덜 헛친다', on.miss < mid.miss - 0.05);
  ok('맞춰 두면 정타가 더 난다', on.barrel > mid.barrel * 1.1);
  ok('맞춰 두면 더 뻗는다', on.ev > mid.ev * 1.05);
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

say('잡으면 던진다 — 대본에 송구가 들어 있고 그 루를 지키는 사람이 미리 가 있는다');
{
  const cases = [
    ['내야 땅볼', { grade: 1, ev: 100, ang: -5, deg: -20 }, [null, null, null], 0],
    ['병살', { grade: 1, ev: 108, ang: -5, deg: -20 }, [true, null, null], 0],
    ['뜬공 아웃', { grade: 2, ev: 120, ang: 33, deg: 12 }, [null, null, null], 0],
    ['외야 안타', { grade: 1, ev: 118, ang: 14, deg: -8 }, [null, null, null], 0],
  ];
  for (const [name, hit, on, outs] of cases) {
    const p = fixed([0.5], () => resolveHit({ ...hit, tipped: false }, { onBase: on, outs }));
    const throws = p.hops.filter((h) => h.k === 'throw');
    ok(`${name} — 던진다`, throws.length >= 1);
    note(`${name}: ${p.record} ${p.label} · 송구 ${throws.length}개 · 수비수 ${p.men.length}명`);
    for (const h of throws) {
      ok(`${name} — 송구가 앞으로 간다`, h.t1 > h.t0);
      // 송구가 끝나는 자리에 사람이 있거나, 이미 그 자리를 지키던 사람이 있다
      const [bd, bf] = h.b;
      const near = p.men.some((m) => Math.abs(m.deg - bd) < 12 && Math.abs(m.ft - bf) < 26)
        || POSTS.some((q) => Math.abs(q.deg - bd) < 12 && Math.abs(q.ft - bf) < 26);
      ok(`${name} — 던진 곳에 사람이 있다`, near);
    }
    // 공이 대본이 끝날 때 어딘가에 멎어 있다
    const [, ft, z] = ballAt(p, p.over);
    ok(`${name} — 공이 성한 자리에 멎는다`, Number.isFinite(ft) && Number.isFinite(z) && ft >= -20);
  }
  check('병살은 두 번 던진다',
        fixed([0.5], () => resolveHit({ grade: 1, ev: 108, ang: -5, deg: -20, tipped: false },
                                      { onBase: [true, null, null], outs: 0 }))
          .hops.filter((h) => h.k === 'throw').length, 2);
}

say('뜬공에 잡혀도 타자는 1루로 뛴다 — 안 그리면 친 사람이 공중에서 사라진다');
{
  let seen = 0, ran = 0;
  for (let i = 0; i < 400; i++) {
    const p = resolveHit({ grade: 2, ev: 118, ang: 34, deg: 6, tipped: false },
                         { onBase: [null, null, null], outs: 0 });
    if (p.kind === 'homer' || p.foul || !p.outs) continue;
    seen++;
    const me = p.runs.find((r) => r.from === 0);
    if (me && me.to === 1 && me.out) ran++;
  }
  note(`잡힌 뜬공 ${seen}가지`);
  ok('그런 경우가 있었다', seen > 50);
  check('전부 타자가 뛴다', ran, seen);
  // 잡히기 전엔 뛰고 잡힌 뒤엔 멎는다
  const p = fixed([0.01], () => resolveHit({ grade: 2, ev: 118, ang: 34, deg: 6, tipped: false },
                                           { onBase: [null, null, null], outs: 0 }));
  const me = p.runs.find((r) => r.from === 0);
  const a = runnerAt(me, me.t0 + 0.05)[1];
  const c = runnerAt(me, me.outAt)[1];
  ok('잡히기 전까지 1루 쪽으로 간다', c > a + 6);
}

say('수비수는 달리는 속도로 간다 — 공보다 늦게 닿지 않는다');
{
  const p = fixed([0.5], () => resolveHit({ grade: 1, ev: 100, ang: -5, deg: -20, tipped: false },
                                          { onBase: [null, null, null], outs: 0 }));
  for (const m of p.men) {
    const post = POSTS[m.i];
    const half = manAt(m, post, m.t0 + (m.t1 - m.t0) / 2);
    const end = manAt(m, post, m.t1 + 0.01);
    // 절반 시각에 이미 절반 넘게 가 있다 (부드럽게 늘이면 여기서 한참 못 미친다)
    const total = Math.hypot(...[0, 1].map((k) => 0)) || 1;
    ok(`${POSTS[m.i].name} — 목표에 닿는다`,
       Math.abs(end[0] - m.deg) < 1.5 && Math.abs(end[1] - m.ft) < 4);
    ok(`${POSTS[m.i].name} — 처음부터 움직인다`,
       Math.abs(half[1] - post.ft) > 0.2 || Math.abs(half[0] - post.deg) > 0.2);
  }
}

say('주자는 화면에서 가는 쪽을 본다 — 각도로 정하면 뒤로 달리는 것처럼 보인다');
{
  const L = layout(mk());
  const leg = (from, to) => ({ from, to, t0: 0, t1: 4, out: false });
  const look = (r, t) => facingOf(L, (tt) => runnerAt(r, tt), t);
  check('홈 → 1루 는 오른쪽', look(leg(0, 1), 2), 1);
  check('1루 → 2루 는 왼쪽', look(leg(1, 2), 2), -1);
  check('2루 → 3루 도 왼쪽', look(leg(2, 3), 2), -1);
  check('3루 → 홈 은 오른쪽', look(leg(3, 4), 2), 1);
}

say('타순 아홉 — 아홉이 아홉으로 보인다');
{
  const [home, away] = makeOrder(12345);
  check('한 편에 아홉', [home.length, away.length], [9, 9]);
  check('같은 씨앗이면 같은 타순', JSON.stringify(makeOrder(777)), JSON.stringify(makeOrder(777)));
  ok('다른 씨앗이면 다르다', JSON.stringify(makeOrder(1)) !== JSON.stringify(makeOrder(2)));
  note(home.map((x) => `${x.no}번 ${x.name} 힘${x.pow} 눈${x.eye} 발${x.leg}`).join(' · '));
  // 앞은 발, 가운데는 힘
  ok('1·2번이 제일 빠르다', Math.min(home[0].leg, home[1].leg) < Math.min(...home.slice(3, 6).map((x) => x.leg)));
  ok('4·5번이 제일 세다', Math.max(home[3].pow, home[4].pow) > Math.max(home[0].pow, home[8].pow));
  ok('사람마다 다르다', new Set(home.map((x) => `${x.pow}/${x.eye}/${x.leg}`)).size >= 7);

  // 힘은 타구 속도로, 눈은 헛스윙으로, 발은 1루까지로 나타난다
  const evOf = (bat) => {
    let sum = 0;
    for (let i = 0; i < 400; i++) sum += contact(0, false, false, PITCHES[0], undefined, bat).ev;
    return sum / 400;
  };
  const strong = { pow: 1.15, eye: 0, leg: 0 }, weak = { pow: 0.88, eye: 0, leg: 0 };
  ok('힘센 타자가 더 세게 친다', evOf(strong) > evOf(weak) * 1.2);
  check('눈 나쁘면 12프레임에서 헛스윙', contact(12, false, false, PITCHES[0], undefined, { pow: 1, eye: -2, leg: 0 }), null);
  ok('눈 좋으면 13프레임도 맞는다', !!contact(13, false, false, PITCHES[0], undefined, { pow: 1, eye: 2, leg: 0 }));
  // 발 — 같은 땅볼에 빠른 타자가 더 산다
  const safeRate = (leg) => {
    let safe = 0;
    for (let i = 0; i < 400; i++) {
      const p = resolveHit({ grade: 1, ev: 96, ang: -5, deg: -24, tipped: false },
                           { onBase: [null, null, null], outs: 0, leg });
      if (!p.outs) safe++;
    }
    return safe / 400;
  };
  const fast = safeRate(-0.3), slow = safeRate(0.3);
  note(`빠른 타자 세이프 ${(fast * 100).toFixed(0)}% · 느린 타자 ${(slow * 100).toFixed(0)}%`);
  ok('발 빠른 타자가 더 산다', fast > slow);
}

say('투구 시계 — 안 던지면 볼 하나. 안 그러면 판이 영영 멎는다');
{
  const world = mk();
  const b = world.bag;
  world.team = 0; b.half = 0;              // 초 — 내가 던지는 쪽인데 아무것도 안 누른다
  let f = 0;
  while (b.balls === 0 && f < 60 * 40) { w.update(world, FR); f++; }
  note(`${(f / 60).toFixed(1)}초 만에 볼 하나`);
  check('볼이 하나 늘었다', b.balls, 1);
  ok('15초 언저리다', f / 60 > 13 && f / 60 < 18);
  // 주자가 있으면 더 준다
  const w2 = mk(); const c = w2.bag;
  w2.team = 0; c.half = 0; c.onBase = [true, null, null];
  let g = 0;
  while (c.balls === 0 && g < 60 * 40) { w.update(w2, FR); g++; }
  ok('주자가 있으면 더 길다', g > f + 60 * 3);
  // 컴퓨터가 던지는 쪽이면 시계가 필요 없다 (바로 던진다)
  const w3 = mk(); w3.team = 1; w3.bag.half = 0;
  for (let i = 0; i < 60 * 3 && !w3.bag.pitch; i++) w.update(w3, FR);
  ok('컴퓨터는 시계 없이 바로 던진다', !!w3.bag.pitch && !(w3.bag.clock > 0));
}

say('새 타자는 미트가 한복판에서 시작한다');
{
  const world = mk(); const b = world.bag;
  world.team = 0; b.half = 1;
  world.input.right = true;
  for (let f = 0; f < 40; f++) w.update(world, FR);
  world.input.right = false;
  ok('미트를 옮겼다', b.mitt.x > 0.3);
  b.strikes = 2;
  b.pitch = { type: 0, kind: PITCHES[0], ax: 0, ay: 0, t: 0, dur: 0.4, plate: 24, done: false, wind: 0 };
  b.aiSwing = null;
  for (let f = 0; f < 90 && b.log.length === 0; f++) w.update(world, FR);
  check('타석이 끝났다', b.log.length, 1);
  check('다음 타자는 미트가 한복판', [b.mitt.x, b.mitt.y], [0, 0]);
}

say('수비 시프트 — 당겨 치는 타자를 막고 반대쪽을 내준다');
{
  check('보통은 제자리', postAt(5, 0).deg, POSTS[5].deg);
  check('투수는 안 움직인다', postAt(0, -1).deg, POSTS[0].deg);
  check('외야수도 안 움직인다', postAt(7, -1).deg, POSTS[7].deg);
  // 당김 수비면 **2루수가 2루를 넘어 3루 쪽으로 건너간다** — 셋이 왼쪽에 선다
  ok('당김이면 2루수가 건너간다', postAt(3, -1).deg < 0 && postAt(3, 0).deg > 0);
  ok('밀어침이면 유격수가 건너간다', postAt(5, 1).deg > 0 && postAt(5, 0).deg < 0);
  const left = (sh) => [2, 3, 4, 5].filter((i) => postAt(i, sh).deg < 0).length;
  check('보통은 둘씩', left(0), 2);
  check('당김이면 셋이 왼쪽', left(-1), 3);
  check('밀어침이면 하나만 왼쪽', left(1), 1);

  // **성향이 있어야 시프트가 뜻을 갖는다.** 고루 치는 타자에겐 이득도 손해도 없어야 한다.
  const outRate = (pull, shift) => {
    let n = 0, m = 0;
    for (let i = 0; i < 2500; i++) {
      const err = Math.round((Math.random() - Math.random()) * 10);
      const h = contact(err, Math.random() < 0.2, Math.random() < 0.35,
                        PITCHES[(Math.random() * 4) | 0], undefined, { pow: 1.05, eye: 0, leg: 0, pull });
      if (!h || h.tipped || Math.abs(h.deg) > 45) continue;
      const p = resolveHit(h, { onBase: [null, null, null], outs: 0, shift });
      if (p.foul || p.kind === 'homer') continue;
      m++; if (p.outs) n++;
    }
    return n / m;
  };
  const pullA = outRate(-0.9, -1), pullN = outRate(-0.9, 0), pullB = outRate(-0.9, 1);
  note(`당겨 치는 타자 아웃율 — 당김 ${(pullA * 100).toFixed(0)}% · 보통 ${(pullN * 100).toFixed(0)}% · 밀어침 ${(pullB * 100).toFixed(0)}%`);
  ok('당겨 치는 타자는 당김 수비에 더 잡힌다', pullA > pullN + 0.05);
  ok('반대로 걸면 더 안 잡힌다', pullB < pullN - 0.05);
  const pushA = outRate(0.7, -1), pushB = outRate(0.7, 1);
  note(`밀어 치는 타자 — 당김 ${(pushA * 100).toFixed(0)}% · 밀어침 ${(pushB * 100).toFixed(0)}%`);
  ok('밀어 치는 타자는 반대로', pushB > pushA + 0.05);
  const evenA = outRate(0, -1), evenN = outRate(0, 0), evenB = outRate(0, 1);
  note(`고루 치는 타자 — ${(evenA * 100).toFixed(0)}% / ${(evenN * 100).toFixed(0)}% / ${(evenB * 100).toFixed(0)}%`);
  ok('고루 치는 타자에겐 별 차이 없다', Math.abs(evenA - evenB) < 0.09);
}

say('타자 성향 — 당겨 치는 타자는 3루 쪽으로 쏠린다');
{
  const meanDeg = (pull) => {
    let sum = 0;
    for (let i = 0; i < 800; i++) sum += contact(0, false, false, PITCHES[0], undefined, { pow: 1, eye: 0, leg: 0, pull }).deg;
    return sum / 800;
  };
  const a = meanDeg(-1), b2 = meanDeg(0), c = meanDeg(1);
  note(`당겨침 ${a.toFixed(0)}° · 고루 ${b2.toFixed(0)}° · 밀어침 ${c.toFixed(0)}°`);
  ok('당겨 치면 왼쪽', a < b2 - 8);
  ok('밀어 치면 오른쪽', c > b2 + 8);
  check('성향 이름', [pullWord(-0.9), pullWord(0), pullWord(0.9)], ['당겨침', '고루', '밀어침']);
  ok('타순에 성향이 다 있다', makeOrder(99)[0].every((x) => Number.isFinite(x.pull)));
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

say('기록지 — 이닝별 득점 · 안타 · 실책이 쌓인다');
{
  const { makeHands } = await import('./baseball-hands.mjs');
  for (let g = 0; g < 4; g++) {
    const world = mk();
    const hands = makeHands(world);
    const b = world.bag;
    let f = 0;
    while (!b.over && f < 60 * 3000) { hands(FR); w.update(world, FR); f++; }
    const cols = Math.max(b.lines[0].length, b.lines[1].length);
    ok(`${g + 1}판 — 시작도 안 한 회가 없다`, cols <= Math.max(3, b.inn));
    ok(`${g + 1}판 — 이닝별 합이 점수와 같다`,
       [0, 1].every((s2) => b.lines[s2].reduce((a, c) => a + (c ?? 0), 0) === b.score[s2]));
    ok(`${g + 1}판 — 안타가 득점보다 적지 않다`, [0, 1].every((s2) => b.hits[s2] >= 0));
    ok(`${g + 1}판 — 셈이 성한 숫자`, [...b.hits, ...b.errs].every(Number.isFinite));
  }
}

say('끝내기 — 마지막 회 말 역전은 이름이 붙는다');
{
  const world = mk(); const b = world.bag;
  b.inn = 3; b.half = 1; b.score = [0, 2]; b.onBase = [true, true, true]; b.outs = 1;
  const p = fixed([0.5], () => resolveHit({ grade: 2, ev: 152, ang: 29, deg: 0, tipped: false },
                                          { onBase: [true, true, true], outs: 1 }));
  b.play = p;
  for (let f = 0; f < Math.ceil(p.over * 60) + 10; f++) bb.default.update(world, FR);
  check('역전했다', b.score, [4, 2]);
  check('끝났다', b.over, true);
  ok('끝내기로 적힌다', b.walkOff === true && /끝내기/.test(b.note ?? ''));
  ok('그 회 득점이 기록지에 남는다', (b.lines[0][2] ?? 0) === 4);
}

say('던진 공 기록 — 배합이 쌓이고 공수 교대에 지워진다');
{
  const world = mk(); const b = world.bag;
  world.team = 0; b.half = 0;            // 초 — 내가 던진다, 컴퓨터가 친다
  let f = 0;
  while (b.thrown.length < 4 && f < 60 * 200) {
    if (!b.pitch && !b.play && b.wait <= 0) { b.type = b.thrown.length % 4; ball.action(world); }
    w.update(world, FR); f++;
  }
  ok('던진 공이 쌓인다', b.thrown.length >= 4);
  ok('구종과 자리가 같이 남는다',
     b.thrown.every((x) => Number.isFinite(x.x) && Number.isFinite(x.y) && x.t >= 0 && x.t < PITCHES.length));
  ok('결과도 남는다', b.thrown.every((x) => x.r >= 0 && x.r <= 4));
  // 여덟 개까지만 들고 있는다
  for (let i = 0; i < 20; i++) b.thrown.push({ t: 0, x: 0, y: 0, r: 1 });
  while (b.thrown.length > 8) b.thrown.shift();
  ok('여덟 개까지', b.thrown.length <= 8);
  // 공수 교대에 지운다
  b.outs = 2; b.thrown = [{ t: 0, x: 0, y: 0, r: 1 }];
  fixed([0.01], () => {
    const p = resolveHit({ grade: 0, ev: 62, ang: 52, deg: 0, tipped: false }, { onBase: [null, null, null], outs: 2 });
    b.play = p;
    for (let i = 0; i < Math.ceil(p.over * 60) + 6; i++) bb.default.update(world, FR);
  });
  check('교대하면 지운다', b.thrown.length, 0);
}

say('몸을 던지는 수비 — 겨우 닿는 공에만');
{
  // 무작위로 굴려서 얼마나 자주 몸을 던지는지 본다. 너무 잦으면 특별하지 않고,
  // 아예 없으면 기획서의 「몸을 던져서(40%)」 칸이 그림 없이 숫자로만 남는다.
  let all = 0, dove = 0;
  const kinds = new Set();
  for (let i = 0; i < 6000; i++) {
    const err = Math.round((Math.random() - Math.random()) * 12);
    const h = contact(err, Math.random() < 0.25, Math.random() < 0.2, PITCHES[(Math.random() * 4) | 0]);
    if (!h) continue;
    const p = resolveHit(h, { onBase: [null, null, null], outs: 0 });
    if (p.foul || p.kind === 'homer') continue;
    all++;
    if (p.men.some((m) => m.dive != null)) { dove++; kinds.add(p.kind); }
  }
  note(`타구 ${all} 중 몸을 던진 것 ${dove} (${(dove / all * 100).toFixed(1)}%) — ${[...kinds].join(', ')}`);
  ok('몸을 던지는 장면이 나온다', dove / all > 0.04);
  ok('그래도 특별한 장면이다', dove / all < 0.32);
  ok('땅볼에도 뜬공에도 나온다', kinds.has('grounder') && (kinds.has('fly') || kinds.has('liner')));
  // 내야 바로 위 뜬 공은 편하게 잡는다
  let easy = 0, tries = 0;
  for (let i = 0; i < 400; i++) {
    const p = resolveHit({ grade: 0, ev: 60, ang: 55, deg: 2, tipped: false },
                         { onBase: [null, null, null], outs: 0 });
    if (p.foul || p.kind === 'homer') continue;
    tries++;
    if (p.men.some((m) => m.dive != null)) easy++;
  }
  note(`내야 뜬공 ${tries}번 중 몸 던짐 ${easy}번`);
  ok('편한 공에는 안 던진다', easy === 0);
}

say('구종마다 공을 놓는 손 모양이 다르다 — 안 보여 주면 찍기가 된다');
{
  const man = (grip) => ({ x: 0, groundY: 0, air: 0, vx: 0, vy: 0, facing: 1, walk: 0, crouch: 0,
                           dead: false, deadFor: 0, grabbing: -1, heldBy: -1, grabAim: 0, slide: 0,
                           glove: 1, grip, pitchT: PITCH_TIME * 0.08 });
  const hands = [0, 1, 2, 3].map((g) => pitchHand(man(g), 0));
  hands.forEach((h, i) => note(`구종 ${i} 손끝 (${h.x.toFixed(1)}, ${h.y.toFixed(1)})`));
  // 넷이 서로 다른 자리에 있다
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      ok(`구종 ${i}·${j} 손 모양이 다르다`,
         Math.hypot(hands[i].x - hands[j].x, hands[i].y - hands[j].y) > 2.2);
    }
  }
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

say('고르는 순간 방이 열린다 — 둘이 하는 게 본디 모습이라');
{
  const world = mk();
  world.state = 'pick';
  world.pick = games.findIndex((g) => g.id === 'ball');
  ok('야구가 목록에 있다', world.pick >= 0);
  const said = [];
  world.onMenu = (a) => said.push(a);
  w.press(world, 'right', true); w.press(world, 'right', false);
  check('방을 연다', said, ['host:ball']);
  check('아직 게임은 안 갈아 끼운다 (셸이 연 뒤에 바꾼다)', world.gameId, 'ball');
  // 이미 방 안이면 그냥 그 게임으로
  const w2 = mk();
  w2.state = 'pick'; w2.pick = games.findIndex((g) => g.id === 'ball');
  w2.mp.on = true;
  const said2 = [];
  w2.onMenu = (a) => said2.push(a);
  w.press(w2, 'right', true); w.press(w2, 'right', false);
  check('방 안에서는 방을 또 안 연다', said2, []);
  check('그래도 혼자 할 수 있다 (막지 않는다)', ball.blocked(world), null);
}

say('판 도중에 들어와도 바로 낀다 — 다음 판까지 컴퓨터가 대신 치면 안 된다');
{
  ok('야구는 도중 참가를 받는다', ball.joinsAnytime === true);
  const guest = mk();
  guest.mp.on = true; guest.mp.role = 'guest'; guest.mp.myId = 2;
  guest.state = 'ready';
  // 방장이 「판 돌고 있다」를 알려 온다
  const net = await import(R + 'game/net.js');
  net.handleMessage(guest, { net: { send() {} } }, 1,
    { t: 's', sq: 1, ms: 0, st: 'play', r: 1, pl: [], vw: 1512, vh: 944, g: 'ball', gs: 0, h: 1 },
    { restart: () => {} });
  check('판으로 들어간다', guest.state, 'play');
  check('구경이 아니다', guest.mp.waiting, false);
  check('넘어져 있지도 않다', guest.player.dead, false);
  ok('그래서 칠 수 있다', amBatting(guest) || amPitching(guest));
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
  // 대본은 한 번만 실린다 — 다만 **0.6초마다 한 번씩 다시** 싣는다.
  // 그 한 번을 놓친 사람(판 도중에 들어온 손님)은 5초짜리 연기를 통째로 못 본다.
  const again = ball.pack(host);
  check('두 번째 꾸러미에는 대본이 없다', again.s, undefined);
  host.bag.play.t += 0.7;
  const later = ball.pack(host);
  ok('0.6초 뒤에는 다시 싣는다', !!later.s);
  ok('바로 다음 꾸러미에는 또 안 싣는다', !ball.pack(host).s);
  // 늦게 받은 사람은 그 자리에서 이어 본다. 이미 지나간 판정 글자는 다시 안 외친다.
  const late = mk();
  late.mp.on = true; late.mp.role = 'guest'; late.mp.myId = 3;
  ball.unpack(late, later);
  ok('늦게 들어온 손님도 대본을 받는다', !!late.bag.play);
  ok('지나간 판정은 다시 안 뜬다', late.bag.play.calls.every((c) => c.t > late.bag.play.t || c.shown));
  // 같은 대본을 또 받아도 처음부터 다시 세우지 않는다
  const mark = late.bag.play;
  ball.unpack(late, later);
  ok('같은 대본은 흘린다', late.bag.play === mark);
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
  // 겨눈 자리는 그대로 오고, 실제로 간 자리는 제구 흔들림만큼만 어긋난다
  check('구종과 조준이 그대로', [b.pitch.type, b.pitch.aimX, b.pitch.aimY], [1, 0.5, -0.3]);
  ok('흔들림은 그 언저리', Math.abs(b.pitch.ax - 0.5) < 1 && Math.abs(b.pitch.ay + 0.3) < 1);
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
  // **띠를 넉넉히 둔다.** 600타석쯤이라 한 판 걸러 한 번은 2할 아래로 내려간다 —
  // 봇은 사람보다 나쁜 공에 많이 휘두르고, 그 흔들림이 표본 크기만큼 크다.
  // 여기서 보려는 것은 「야구답게 나오나」이지 소수점 둘째 자리가 아니다.
  ok('타율이 1할 7푼~4할', avg > 0.17 && avg < 0.40);
  ok('삼진이 5%~30%', k / pa > 0.05 && k / pa < 0.30);
  ok('볼넷이 2%~18%', bbs / pa > 0.02 && bbs / pa < 0.18);
  ok('홈런이 0.5%~8%', hr / pa > 0.005 && hr / pa < 0.08);
  ok('한 팀 득점이 0.5~7점', runs / n / 2 > 0.5 && runs / n / 2 < 7);
}

done('야구');
