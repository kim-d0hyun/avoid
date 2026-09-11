// 배구 — 편 · 점수 · 벽 · 바닥 · 천장 · 슬라이딩 · 게이지.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const { games } = await import(R + 'games/index.js');
const volley = games.find((g) => g.id === 'volley');
const { spike, slideGauge } = await import(R + 'games/volley.js');
const { BODY_H } = await import(R + 'draw/stickman.js');

import { check, say, note, done } from './check.mjs';
function mk() {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'volley');
  world.onRecord = () => {}; world.onGameOver = () => {};
  world.picked = [];
  // main.js 가 하는 것과 같게 이어 준다 — 메뉴는 이름만 넘기고 실제 일은 게임이 한다.
  world.onMenu = (a) => {
    world.picked.push(a);
    if (a.startsWith('team:')) { volley.swap(world, null, Number(a.slice(5))); volley.stand(world, world.team, 2); }
  };
  w.resize(world, 1512, 944);
  world.state = 'ready';    // 고르는 화면 메뉴에는 편 고르기가 없다
  w.spread(world);
  return world;
}
const tap = (world, a) => { w.press(world, a, true); w.press(world, a, false); };

say('편 — 네트를 넘어갈 수 없다');
{
  const world = mk();
  world.state = 'play';
  world.team = 0;
  world.player.x = 400;
  world.input.right = true;
  for (let i = 0; i < 240; i++) w.update(world, 1 / 60);   // 4초 내내 오른쪽으로
  check('네트 앞에서 멈춘다', world.player.x <= 1512 / 2, true);
  check('넘어가지 않았다', Math.round(world.player.x), 742);   // 756 - 14

  world.team = 1;
  world.player.x = 1100;
  world.input.right = false; world.input.left = true;
  for (let i = 0; i < 240; i++) w.update(world, 1 / 60);
  check('반대쪽도 마찬가지', Math.round(world.player.x), 770);  // 756 + 14
}

say('편 — 판이 끝나도 못 넘는다');
{
  const world = mk();
  world.team = 0; world.state = 'ready'; world.player.x = 400;
  world.input.right = true;
  for (let i = 0; i < 240; i++) w.update(world, 1 / 60);
  check('시작 전에도 못 넘는다', world.player.x <= 756, true);
}

say('편 — 메뉴에서 골라 옮긴다');
{
  const world = mk();
  world.team = 0;
  world.player.x = 300;
  tap(world, 'menu');
  const items = w.menuItems(world);
  const at = items.findIndex((i) => i.id === 'team');
  check('메뉴에 편 고르기가 있다', at >= 0, true);
  check('지금 편이 옆에 적힌다', items[at].note, '빨강');
  world.menu.index = at;
  tap(world, 'right');
  check('안으로 들어왔다', world.menu.path, ['team']);
  check('목록', w.menuItems(world).map((i) => i.label), ['빨강 편', '파랑 편']);
  check('지금 편에 점', w.menuItems(world).map((i) => !!i.mark), [true, false]);
  tap(world, 'duck');
  tap(world, 'right');
  check('편이 바뀌었다', world.team, 1);
  check('오른쪽 코트로 옮겨졌다', world.player.x > 756, true);
  check('고르고도 메뉴는 열려 있다', [world.menu.open, world.menu.path], [true, ['team']]);
  check('이제 파랑에 점', w.menuItems(world).map((i) => !!i.mark), [false, true]);
}

say('편 — 다시 시작해도 편은 남는다');
{
  const world = mk();
  world.team = 1;
  w.restart(world);
  check('그대로 파랑', world.team, 1);
  check('오른쪽에 선다', world.player.x > 756, true);
}

say('편 — 옷 색이 편을 따라간다');
{
  const world = mk();
  check('왼쪽은 빨강', volley.shirt(world, 300), '#b5352f');
  check('오른쪽은 파랑', volley.shirt(world, 1200), '#2f6fb0');
}

say('점수 — 우리 쪽에 떨어지면 상대 점수');
{
  const world = mk();
  world.state = 'play';
  const b = world.bag;
  b.started = true;          // 첫 서브를 건너뛰고 원하는 자리에 공을 놓는다
  b.wait = 0;
  const drop = (x) => {
    b.wait = 0;
    b.ball.x = x; b.ball.y = world.groundY - 5; b.ball.vy = 400; b.ball.vx = 0;
    world.player.x = x > 756 ? 100 : 1400;      // 공에서 멀리 (반대 코트)
    w.update(world, 1 / 60);                     // **한 프레임이면 끝난다**
  };
  drop(300);
  check('왼쪽에 떨어지면 그 즉시 파랑 득점', b.score, [0, 1]);
  drop(1200);
  check('오른쪽에 떨어지면 그 즉시 빨강 득점', b.score, [1, 1]);
  check('바로 다음 서브를 기다린다', b.wait > 0, true);
}


say('벽 — 입사각 그대로 반사각');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0;
  // 45도로 왼쪽 벽에 꽂는다
  b.ball.x = 60; b.ball.y = 300; b.ball.vx = -900; b.ball.vy = -900;
  // **튕기는 그 프레임의 앞뒤만** 견준다. 여러 프레임을 굴리면 중력이 vy 를 바꿔서
  // 반사와 중력을 구분할 수 없게 된다.
  let before = null;
  for (let i = 0; i < 30; i++) {
    const was = { vx: b.ball.vx, vy: b.ball.vy };
    volley.update(world, 1 / 60);
    if (was.vx < 0 && b.ball.vx > 0) { before = was; break; }
  }
  check('튕기긴 했다', !!before, true);
  const a0 = Math.atan2(-before.vy, -before.vx) * 180 / Math.PI;   // 들어온 각
  const a1 = Math.atan2(-b.ball.vy, b.ball.vx) * 180 / Math.PI;    // 나간 각
  check('세로 속도는 거의 그대로 (중력 한 프레임분만 차이)',
        Math.abs(b.ball.vy - before.vy) < 40, true);
  check('가로만 뒤집혔다', b.ball.vx > 0, true);
  check('입사각 = 반사각 (2도 안쪽)', Math.abs(a0 - a1) < 2, true);
  check('벽 안쪽에 있다', b.ball.x >= 20, true);
}

say('벽 — 아주 빠른 공도 벽에 안 붙는다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0;
  b.ball.x = 100; b.ball.y = 300; b.ball.vx = -2100; b.ball.vy = 0;
  const xs = [];
  for (let i = 0; i < 20; i++) { volley.update(world, 1 / 60); xs.push(Math.round(b.ball.x)); }
  const stuck = xs.filter((x, i) => i > 0 && x === xs[i-1]).length;
  check('한자리에 머문 프레임 없음', stuck, 0);
  check('벽을 뚫지 않았다', Math.min(...xs) >= 15, true);
  check('되돌아 나왔다', b.ball.vx > 0, true);
}

say('바닥 — 닿는 즉시 끝');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.score = [0, 0];
  b.ball.x = 1200; b.ball.y = world.groundY - 40; b.ball.vy = 800; b.ball.vx = 200;
  world.player.x = 100;
  let scoredAt = -1;
  let lowest = 0;
  for (let i = 0; i < 300; i++) {
    volley.update(world, 1 / 60);
    lowest = Math.max(lowest, b.ball.y);
    if ((b.score[0] + b.score[1]) > 0) { scoredAt = i; break; }
  }
  check('점수가 올라갔다', b.score[0], 1);
  check('바닥에 닿은 그 프레임에 끝났다', scoredAt <= 3, true);
  check('바닥 밑으로 안 내려갔다', lowest <= world.groundY + 2, true);
}


say('슬라이딩 — 손이 안 닿으면 몸을 던진다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0;
  world.player.x = 300; world.player.air = 0;
  b.ball.x = 620; b.ball.y = world.groundY - 40;         // 손이 안 닿는 거리
  spike(world);
  check('미끄러지기 시작했다', world.player.slide > 0, true);
  check('공 쪽으로', world.player.slideDir, 1);
  const x0 = world.player.x;
  // 슬라이딩은 0.42초다. 절반쯤 가서 방향키를 눌러 본다.
  for (let i = 0; i < 12; i++) w.update(world, 1 / 60);
  check('실제로 미끄러져 갔다', world.player.x - x0 > 80, true);
  check('아직 미끄러지는 중', world.player.slide > 0, true);
  world.input.left = true;
  const x1 = world.player.x;
  for (let i = 0; i < 6; i++) w.update(world, 1 / 60);
  check('도중에 방향을 못 튼다', world.player.x > x1, true);
  world.input.left = false;
  // 끝날 때까지만 굴린다 (쉬는 시간이 지나가 버리지 않게)
  for (let i = 0; i < 12 && world.player.slide > 0; i++) w.update(world, 1 / 60);
  check('끝났다', world.player.slide, 0);
  check('끝나면 쉰다', world.player.slideCool > 0, true);
  b.ball.x = world.player.x + 400;            // 다시 멀리 둔다
  check('쉬는 동안엔 또 못 던진다', (spike(world), world.player.slide), 0);
}

say('슬라이딩 — 닿는 거리면 던지지 말고 쳐야 한다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0;
  world.player.x = 300; world.player.air = 0;
  b.ball.x = 330; b.ball.y = world.groundY - 50;         // 손이 닿는다
  b.ball.vy = 500;
  spike(world);
  check('안 미끄러진다', world.player.slide, 0);
  check('공이 위로 떴다', b.ball.vy < 0, true);
}

say('한쪽 편이 비면 판이 안 열린다');
{
  const world = mk();
  world.mp.on = true; world.mp.myId = 1; world.mp.myName = '도현';
  world.team = 0; world.player.x = 300;
  check('나 혼자 빨강 → 못 연다', volley.blocked(world), '파랑 편에 아무도 없다');
  // 파랑에 한 명 세운다
  world.mp.others.set(2, { id: 2, name: '범창', x: 1200, dead: false, waiting: false, air: 0 });
  check('2대1 이 아니라 1대1 → 열린다', volley.blocked(world), null);
  world.mp.others.set(3, { id: 3, name: '보람', x: 400, dead: false, waiting: false, air: 0 });
  check('2대1 도 열린다', volley.blocked(world), null);
  check('편 이름표', volley.tally(world) !== undefined, true);
  // 파랑 사람이 빨강으로 넘어가면 다시 막힌다
  world.mp.others.get(2).x = 500;
  check('파랑이 비면 다시 막힌다', volley.blocked(world), '파랑 편에 아무도 없다');
}


say('천장 — 위로 안 벗어난다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0;
  let top = 1e9;
  // 있는 힘껏 위로 올려 본다: 빠른 공을 정통으로 받아넘기기를 반복
  for (let round = 0; round < 6; round++) {
    b.ball.x = 400; b.ball.y = world.groundY - 60; b.ball.vy = 2000; b.ball.vx = 0;
    world.player.x = 400; world.player.air = 0;
    for (let i = 0; i < 200; i++) {
      volley.update(world, 1 / 60);
      top = Math.min(top, b.ball.y);
      if (b.ball.vy > 0 && b.ball.y > world.groundY - 120) break;
    }
  }
  check('화면 위로 안 나간다', top >= 0, true);
  check('공이 통째로 보이는 자리 안쪽', top >= 30, true);
  note(`가장 높이 올라간 자리 y=${top.toFixed(0)} (화면 높이 ${world.h}, 0 이 맨 위)`);
}


say('슬라이딩 — 방향키가 방향을 정한다');
{
  const dive = (input, ballX) => {
    const world = mk(); world.state='play'; world.team=0;
    const b = world.bag; b.started=true; b.wait=0;
    world.player.x = 600; world.player.air = 0; world.player.facing = 1;
    b.ball.x = ballX; b.ball.y = world.groundY - 40;
    Object.assign(world.input, { left: false, right: false }, input);
    spike(world);
    return world.player.slideDir;
  };
  check('공이 오른쪽, 키 안 잡음 → 오른쪽', dive({}, 950), 1);
  check('공이 왼쪽, 키 안 잡음 → 왼쪽', dive({}, 250), -1);
  check('공이 오른쪽인데 ⌥← 를 잡음 → 왼쪽', dive({ left: true }, 950), -1);
  check('공이 왼쪽인데 ⌥→ 를 잡음 → 오른쪽', dive({ right: true }, 250), 1);
}

say('스파이크 — 공보다 높이 떠서 때려야 꽂힌다');
{
  // 손 높이를 기준으로 공을 놓고 때려 본다. air 는 발이 땅에서 뜬 높이.
  const hit = ({ air = 100, under = 0, keys = {} }) => {
    const world = mk(); world.state = 'play'; world.team = 0;
    const b = world.bag; b.started = true; b.wait = 0;
    const p = world.player;
    p.x = 400; p.air = air; p.vy = 0;
    const hand = p.groundY - p.air - BODY_H * 0.86;
    b.ball.x = 400; b.ball.y = hand + under; b.ball.vx = 0; b.ball.vy = 120;
    Object.assign(world.input, { left: false, right: false, jump: false, duck: false }, keys);
    const ok = spike(world);
    return { ok, vx: b.ball.vx, vy: b.ball.vy, swing: p.swing ?? 0 };
  };

  const flat = hit({ under: 0 });
  check('손 높이의 공은 수평 미사일', Math.abs(flat.vy) < 1, true);
  check('앞으로 나간다', flat.vx > 300, true);

  const deep = hit({ under: BODY_H * 0.5 });
  check('손보다 한참 밑이면 아래로 꽂힌다', deep.vy > 900, true);
  check('꽂을수록 가로는 준다', deep.vx < flat.vx, true);
  note(`손 높이 vy=${flat.vy.toFixed(0)} · 손 밑 vy=${deep.vy.toFixed(0)}`);

  const half = hit({ under: BODY_H * 0.25 });
  check('중간 높이는 중간 각도', half.vy > 100 && half.vy < deep.vy, true);

  const low = hit({ air: 20, under: BODY_H * 0.5 });
  check('낮게 뛰면 덜 세다', low.vy < deep.vy, true);

  const forced = hit({ under: -20, keys: { duck: true } });
  check('⌥↓ 는 손 위의 공도 꽂는다', forced.vy > 900, true);

  const lob = hit({ under: BODY_H * 0.5, keys: { jump: true } });
  check('⌥↑ 는 밑에서 때려도 올려 준다', lob.vy < 0, true);

  check('때린 사람 팔이 돈다', deep.swing > 0, true);

  // 땅에서는 토스. 뛰어야 꽂힌다.
  const toss = hit({ air: 0, under: BODY_H * 0.3 });
  check('땅에서 때리면 위로 올라간다', toss.vy < 0, true);
  check('땅에서는 팔이 안 돈다', toss.swing, 0);
}

say('공기 저항 — 세게 때린 공만 눈에 띄게 잦아든다');
{
  // 중력이 안 섞이도록 가로로만 날린다.
  const glide = (vx) => {
    const world = mk(); world.state = 'play'; world.team = 0;
    const b = world.bag; b.started = true; b.wait = 0;
    b.ball.x = 756; b.ball.y = 300; b.ball.vx = vx; b.ball.vy = 0;
    for (let i = 0; i < 30; i++) {                 // 0.5초
      b.ball.y = 300; b.ball.vy = 0;               // 중력은 빼고 본다
      if (b.ball.x < 120 || b.ball.x > 1390) b.ball.x = 756;   // 벽은 안 건드린다
      volley.update(world, 1 / 60);
    }
    return b.ball.vx / vx;
  };
  const fast = glide(1800);
  const soft = glide(400);
  check('강타는 반 초에 1할 넘게 준다', fast < 0.88, true);
  check('살살 올린 공은 거의 그대로', soft > 0.96, true);
  check('빠를수록 많이 깎인다', fast < soft, true);
  note(`반 초 뒤 남은 속도 — 강타 ${(fast * 100).toFixed(0)}% · 토스 ${(soft * 100).toFixed(0)}%`);
}

say('슬라이딩 게이지 — 비었다가 꽉 차면 또 된다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  world.bag.started = true; world.bag.wait = 0;
  const p = world.player;
  p.x = 600; p.air = 0;
  check('평소에는 꽉 차 있다', slideGauge(p), 1);

  w.startSlide(world, 1);
  check('던지자마자 텅 빈다', slideGauge(p), 0);

  // 미끄러지는 동안 내내 0, 끝나면 쿨타임 동안 차오른다.
  let duringSlide = [];
  let filling = [];
  let readyAt = null;
  for (let i = 0; i < 120; i++) {
    w.update(world, 1 / 60);
    const g = slideGauge(p);
    if (p.slide > 0) duringSlide.push(g);
    else if (readyAt === null) {
      filling.push(g);
      if (g >= 1) readyAt = i / 60;
    }
  }
  check('미끄러지는 동안은 계속 비어 있다', duringSlide.every((g) => g === 0), true);
  check('그 뒤로는 줄지 않고 찬다',
        filling.every((g, i) => i === 0 || g >= filling[i - 1]), true);
  check('중간에 반쯤 찬 구간이 있다', filling.some((g) => g > 0.3 && g < 0.7), true);
  check('결국 꽉 찬다', slideGauge(p), 1);
  note(`비운 뒤 ${(w.SLIDE_TIME + w.SLIDE_COOL).toFixed(2)}초, 실제로 ${readyAt?.toFixed(2)}초 만에 꽉 참`);

  // 게이지가 꽉 차야 또 던져진다 — 보이는 것과 되는 것이 같아야 한다.
  const again = mk(); again.state = 'play';
  const q = again.player; q.x = 600; q.air = 0;
  w.startSlide(again, 1);
  let mismatch = 0;
  for (let i = 0; i < 120; i++) {
    w.update(again, 1 / 60);
    if (q.slide > 0 || q.air > 0) continue;
    const shown = slideGauge(q) >= 1;
    const can = w.startSlide(again, 1);
    if (can) { q.slide = 0; q.slideCool = 0; q.vx = 0; }   // 되돌려 놓고 계속 본다
    if (shown !== can) mismatch++;
  }
  check('꽉 찬 것과 실제로 되는 것이 한 프레임도 안 어긋난다', mismatch, 0);
}

done('배구');
