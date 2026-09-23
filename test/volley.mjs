// 배구 — 편 · 점수 · 벽 · 바닥 · 천장 · 슬라이딩 · 게이지.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const { games } = await import(R + 'games/index.js');
const volley = games.find((g) => g.id === 'volley');
const { spike, tipHit, slideGauge, matchOver, deuce, myServe, hitServe, KEY_ROWS, SERVE_ROWS } = await import(R + 'games/volley.js');
const net = await import(R + 'game/net.js');
const { BODY_H, SWING_TIME, SWING_WHIP, TOSS_TIME, swingPhase, handPoint, drawStickman }
  = await import(R + 'draw/stickman.js');

import { check, ok, say, note, done } from './check.mjs';
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

say('네트 — 공은 그물 면에서 튄다 (사람이 멈추는 자리와 같은 폭)');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag, netX = world.w / 2;
  volley.update(world, 1 / 60); b.wait = 0; b.serving = false;        // 첫 프레임에 서브가 올라가고 잠깐 멎는다 — 그 대기를 끝낸다
  // 네트 몸통 높이(꼭대기 아래)에서 빠르게 날아가 바닥에 닿기 전에 그물에 맞는다
  b.ball.x = netX - 120; b.ball.y = world.groundY - 55; b.ball.vx = 1600; b.ball.vy = 0;
  let bounced = false; const xs = [];
  for (let i = 0; i < 30 && !bounced; i++) { volley.update(world, 1 / 60); xs.push(Math.round(b.ball.x - netX)); bounced = b.ball.vx < 0; }
  check('되돌아왔다', bounced, true);
  check('그물 면(가운데에서 14px)에 공 가장자리가 닿는 자리에서 튀었다', Math.round(netX - b.ball.x), 20 + 14);
}

say('편 — 네트를 넘어갈 수 없다');
{
  const world = mk();
  world.state = 'play';
  world.team = 0;
  world.player.x = 400;
  world.input.right = true;
  // 서브를 들고 있으면 서브 선(코트 뒤쪽 절반)까지만 간다 — 그건 아래에서 따로 본다.
  const run = (n) => { for (let i = 0; i < n; i++) { world.bag.serving = false; w.update(world, 1 / 60); } };
  run(240);                                                // 4초 내내 오른쪽으로
  check('네트 앞에서 멈춘다', world.player.x <= 1512 / 2, true);
  // 몸이 그물에 닿지 않는 자리까지만 간다 (NET_GAP 26). 그물 면(14)에 붙여 세웠더니
  // 팔을 휘두를 때 **서로 네트를 침범한 것처럼** 보였다.
  check('넘어가지 않았다', Math.round(world.player.x), 730);   // 756 - 26

  world.team = 1;
  world.player.x = 1100;
  world.input.right = false; world.input.left = true;
  run(240);
  check('반대쪽도 마찬가지', Math.round(world.player.x), 782);  // 756 + 26
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
  b.wait = 0; b.serving = false;
  const drop = (x) => {
    b.wait = 0; b.serving = false;
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
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
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
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
  b.ball.x = 100; b.ball.y = 300; b.ball.vx = -2100; b.ball.vy = 0;
  const xs = [];
  for (let i = 0; i < 20; i++) { volley.update(world, 1 / 60); xs.push(Math.round(b.ball.x)); }
  const stuck = xs.filter((x, i) => i > 0 && x === xs[i-1]).length;
  check('한자리에 머문 프레임 없음', stuck, 0);
  check('벽을 뚫지 않았다', Math.min(...xs) >= 15, true);
  check('되돌아 나왔다', b.ball.vx > 0, true);
}

say('듀스 — 다섯 점 먼저, 단 두 점 차로');
{
  check('4:4 는 듀스', deuce([4, 4]), true);
  check('4:3 은 아직 듀스 아님', deuce([4, 3]), false);
  check('5:4 도 듀스 (두 점 차가 안 났다)', deuce([5, 4]), true);
  check('5:3 은 끝', matchOver([5, 3]), true);
  check('5:4 는 안 끝', matchOver([5, 4]), false);
  check('6:4 는 끝', matchOver([6, 4]), true);
  check('7:6 은 안 끝', matchOver([7, 6]), false);
  check('8:6 은 끝', matchOver([8, 6]), true);
  check('0:5 는 끝', matchOver([0, 5]), true);

  // 판 안에서도 그렇게 굴러가나. 5:4 로 공이 떠 있으면 끝내지 않고, 6:4 가 되면 끝낸다.
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
  const ends = [];
  world.onGameOver = (r) => ends.push(r);
  b.score = [5, 4]; b.ball.x = 500; b.ball.y = 300; b.ball.vx = 0; b.ball.vy = -100;
  for (let i = 0; i < 5; i++) volley.update(world, 1 / 60);
  check('5:4 에서는 판이 안 끝난다', ends.length, 0);
  check('점수가 그대로다', b.score.join(':'), '5:4');
  b.score = [6, 4];
  for (let i = 0; i < 5; i++) volley.update(world, 1 / 60);
  check('6:4 가 되면 끝난다', ends.length, 1);
  check('빨강 편이 이겼다', ends[0]?.side, 0);
  check('순위표에 점수가 실린다', ends[0]?.rows?.[0]?.[2], 6);
}

say('바닥 — 닿는 즉시 끝');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false; b.score = [0, 0];
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
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
  world.player.x = 300; world.player.air = 0;
  // 손이 안 닿는 거리. 높이 띄워 둔다 — 도중에 바닥에 닿으면 점수가 나고 새 서브가 시작돼
  // 서브 선(코트 뒤쪽 절반)에 걸린다.
  b.ball.x = 620; b.ball.y = world.groundY - 420; b.ball.vy = -120;
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
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
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
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
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
  check('낮춰 둔 천장 위로는 안 간다', top >= 280, true);
  check('그렇다고 네트 높이에서 놀지도 않는다', top < world.groundY - 300, true);
  note(`가장 높이 올라간 자리 y=${top.toFixed(0)} (천장 300, 바닥 ${world.groundY.toFixed(0)})`);
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

say('스파이크 — 공보다 높이 떠서 때려야 꽂힌다 · 네트는 넘긴다');
{
  // 손 높이를 기준으로 공을 놓고 때려 본다. air 는 발이 땅에서 뜬 높이.
  // **자리도 넣는다** — 꽂는 각은 네트까지 남은 길에 걸린다 (netCap). 기본은 네트 앞(740).
  const hit = ({ x = 740, air = 100, under = 0, keys = {} }) => {
    const world = mk(); world.state = 'play'; world.team = 0;
    const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
    const p = world.player;
    p.x = x; p.air = air; p.vy = 0;
    const hand = p.groundY - p.air - BODY_H * 0.86;
    b.ball.x = x; b.ball.y = hand + under; b.ball.vx = 0; b.ball.vy = 120;
    Object.assign(world.input, { left: false, right: false, jump: false, duck: false }, keys);
    const ok = spike(world);
    return { ok, vx: b.ball.vx, vy: b.ball.vy, swing: p.swing ?? 0 };
  };

  const flat = hit({ under: 0 });
  check('손 높이의 공은 수평 미사일', Math.abs(flat.vy) < 1, true);
  check('앞으로 나간다', flat.vx > 300, true);

  const deep = hit({ under: BODY_H * 0.25 });
  check('손보다 밑이면 아래로 꽂힌다', deep.vy > 300, true);
  check('꽂을수록 가로는 준다', deep.vx < flat.vx, true);
  note(`손 높이 vy=${flat.vy.toFixed(0)} · 손 밑 vy=${deep.vy.toFixed(0)}`);

  // **너무 밑에서 잡으면 오히려 각을 못 낸다.** 손보다 한참 밑의 공은 그만큼 네트 꼭대기에
  // 가까워서, 가파르게 꽂으면 그물에 걸린다 — 그래서 가장 잘 꽂히는 건 손끝 바로 밑이다.
  const low = hit({ under: BODY_H * 0.5 });
  check('한참 밑에서 잡으면 각이 준다', low.vy > 0 && low.vy < deep.vy, true);

  // 같은 공을 **가운데에서** 때리면 갈 길이 멀어 꽂을 수 없다. 예전엔 여기서도 같은 각으로
  // 꽂아서 제 코트 바닥에 박혔다 — 「중간자리에서 스파이크가 안 된다」가 이거였다.
  const mid = hit({ x: 500, under: BODY_H * 0.25 });
  // 부호로는 못 본다 — 세게 나간 공은 살짝 아래로 가도 넘는다. 넘는지는 아래 「어느 자리에서
  // 때려도 네트를 넘어간다」가 진짜로 날려서 본다. 여기서는 각이 눕혀졌는지만 본다.
  check('가운데에서는 꽂지 않고 넘긴다', mid.vy < deep.vy / 4, true);
  note(`네트 앞 vy=${deep.vy.toFixed(0)} · 가운데 vy=${mid.vy.toFixed(0)}`);

  const weak = hit({ air: 20, under: BODY_H * 0.5 });
  check('낮게 뛰면 못 꽂는다 — 올려 주는 공이 된다', weak.vy < deep.vy, true);

  // v3.12 — ⌥↓ 를 페인트에 내주었다. 꽂는 각도는 **공이 손보다 얼마나 아래냐**로만 정해진다.
  // 원래도 그게 진짜 규칙이었고 ⌥↓ 는 그걸 최대로 올려 주는 덤이었다.
  const above = hit({ under: -20 });
  check('손 위의 공은 안 꽂힌다 — 수평으로 간다', above.vy, 0);

  // **⌥Space + ↓ 는 내리꽂기다.** 공이 손 밑에 있기만 하면 꽂을 수 있는 만큼 최대로 꽂는다 —
  // 네트 앞에서 쓰라고 있는 키다. (v3.12 에 ⌥↓ 를 페인트에 내줬다가, 페인트를 ⌥↑ 로 옮기고
  // 도로 가져왔다 — 꽂으려고 ↓ 를 누르는 순간 페인트가 먼저 나가면 두 기술을 같이 못 쓴다.)
  const drive = hit({ under: 6, keys: { duck: true } });
  const plain = hit({ under: 6 });
  check('⌥Space + ↓ 면 더 가파르게 꽂힌다', drive.vy > plain.vy + 100, true);
  note(`그냥 vy=${plain.vy.toFixed(0)} · ⌥↓ vy=${drive.vy.toFixed(0)}`);
  // **⌥↓ 가 그냥 친 공보다 약했다** (v3.24.0). 꽂는다고 가로를 덜어 둔 뒤 netCap 이 세로만
  // 도로 깎아서, 실제 점프 높이(58)로 네트 앞에서 치면 그냥 친 공이 1148 · ⌥↓ 가 792 였다.
  const real = (keys) => { const r = hit({ air: 58, under: 6, keys }); return Math.hypot(r.vx, r.vy); };
  const hard = real({ duck: true });
  const soft = real({});
  ok('네트 앞 ⌥↓ 는 그냥 친 공보다 확실히 세다', hard > soft * 1.25);
  note(`네트 앞 세기 — 그냥 ${soft.toFixed(0)} · ⌥↓ ${hard.toFixed(0)}`);
  // 공이 손 위면 ⌥↓ 를 눌러도 안 꽂힌다 — 밑에서 올려치는 공을 아래로 보낼 수는 없다.
  const above2 = hit({ under: -20, keys: { duck: true } });
  check('손 위의 공은 ⌥↓ 로도 안 꽂힌다', above2.vy, 0);
  // 가운데에서는 ⌥↓ 를 눌러도 네트를 넘겨야 하니 꽂히지 않는다
  const midDrive = hit({ x: 500, under: 6, keys: { duck: true } });
  const midPlain = hit({ x: 500, under: 6 });
  ok('가운데에서 ⌥↓ 는 꽂는 대신 넘긴다', midDrive.vy < drive.vy / 4);
  // 가운데에서는 각이 다 눕혀진다 — 그러면 세기도 그냥 친 공과 같아야 한다 (벌도 덤도 아니다).
  const sp = (r) => Math.hypot(r.vx, r.vy);
  ok('가운데 ⌥↓ 는 그냥 친 공만큼은 나간다', sp(midDrive) >= sp(midPlain) * 0.97);
  ok('가운데 ⌥↓ 가 덤이 되지도 않는다', sp(midDrive) <= sp(midPlain) * 1.15);
  note(`가운데 ⌥↓ vy=${midDrive.vy.toFixed(0)}`);

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
    const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
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

// ── 스파이크 ───────────────────────────────────────────────────────────────
//
// 아래 묶음들이 지키는 것: **치는 모션**(박자·손이 공에 닿는 자리), **세게 나가는 느낌**
// (히트스톱·흔들림·달아오름·탑스핀), **정타 규칙**(꼭대기+손끝, 그래도 받을 수 있음),
// **꾸러미 싱크**(남의 화면에서 같은 순간에 같은 모션).

const BALL_R = 20;
/// 한 번 치는 판을 차린다. air 는 발이 뜬 높이, off 는 손끝에서 공까지의 [가로, 세로].
// x — 코트 어디에서 치나. **꽂는 각은 네트까지 남은 길에 걸리므로**(netCap) 내리꽂기를
// 보는 시험은 네트 앞(740)에서 높이 떠서 쳐야 한다. 가운데(500)에서는 넘겨 주는 공이 된다.
function rig({ x = 500, air = 60, off = [66, -20], keys = {}, vy = 200 } = {}) {
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
  const p = world.player;
  p.x = x; p.air = air; p.vy = 0; p.facing = 1;
  const hand = p.groundY - p.air - BODY_H * 0.86;
  b.ball.x = p.x + off[0]; b.ball.y = hand + off[1]; b.ball.vx = 0; b.ball.vy = vy;
  Object.assign(world.input, { left: false, right: false, jump: false, duck: false }, keys);
  return { world, b, p, hand };
}

say('치는 모션 — 준비 · 휘두름 · 맞댐 · 따라 휘기');
{
  const { world, b, p } = rig();
  check('치기 전에는 안 휘두른다', p.swing ?? 0, 0);
  check('공이 다가오면 팔을 젖혀 둔다 (준비)', (p.cock ?? 0) > 0, false);
  // 공중에서 공이 가까워지는 동안 준비 자세가 차오른다 — 아무도 안 쳐도.
  for (let i = 0; i < 12; i++) volley.update(world, 1 / 60);
  check('공이 가까우면 저절로 젖혀진다', (p.cock ?? 0) > 0.6, true);

  const r = rig();
  check('쳤다', spike(r.world), true);
  check('휘두름은 정해진 길이로 시작한다', Math.round(r.p.swing * 1000), Math.round(SWING_TIME * 1000));
  check('때린 쪽으로 몸을 돌린다', r.p.swingDir, 1);
  check('겨눈 자리가 박혀 있다', Array.isArray(r.p.aim) && r.p.aim.length === 3, true);

  // 박자. 프레임마다 어느 대목인지 세어 본다.
  const beats = [];
  const gaps = [];
  for (let i = 0; i < 24; i++) {
    beats.push(swingPhase(r.p));
    const h = handPoint(r.p);
    gaps.push(Math.hypot(h.x - r.b.ball.x, h.y - r.b.ball.y));
    volley.update(r.world, 1 / 60);
  }
  const whip = beats.filter((x) => x === 'whip').length;
  const hold = beats.filter((x) => x === 'contact').length;
  check('휘두름은 두 프레임', whip, Math.round(SWING_WHIP * 60));
  check('그 다음 맞댐', hold, 2);
  check('그 다음은 따라 휘기', beats[whip + hold], 'follow');
  check('셋 말고 다른 대목은 없다', [...new Set(beats.filter(Boolean))].sort().join(','), 'contact,follow,whip');
  // **손이 공에 닿는가.** 맞댐 동안 손끝과 공 가운데의 거리가 공 반지름 안이어야 한다.
  const touching = gaps.slice(whip, whip + hold);
  check('맞댐 동안 손이 공 안에 있다', touching.every((g) => g <= BALL_R), true);
  check('휘두르기 전에는 손이 공에서 떨어져 있다', gaps[0] > BALL_R, true);
  check('따라 휘기에서는 손이 공을 놓는다', gaps[whip + hold + 4] > BALL_R * 2, true);
  note(`손-공 거리 — 휘두름 ${gaps[0].toFixed(0)}px · 맞댐 ${touching.map((g) => g.toFixed(0)).join('/')}px · 놓은 뒤 ${gaps[whip + hold + 4].toFixed(0)}px`);

  // 땅에서 치면 내리치는 팔이 아니라 받아 올리는 두 팔이다.
  const g = rig({ air: 0, off: [20, 30] });
  check('땅에서 치면 토스 동작', spike(g.world), true);
  check('땅에서는 안 내리친다', g.p.swing ?? 0, 0);
  check('두 팔을 밀어 올린다', Math.round(g.p.toss * 1000), Math.round(TOSS_TIME * 1000));
}

say('히트스톱 — 손이 공에 닿아 있는 동안 공은 멈춘다');
{
  const shot = (keys = {}, off = [66, -20]) => {     // 기본은 보통 강타 (손끝에서 69px)
    const r = rig({ keys, off });
    const ok = spike(r.world);
    const v = [Math.round(r.b.ball.vx), Math.round(r.b.ball.vy)];
    let still = 0;
    for (let i = 0; i < 12; i++) {
      const was = r.b.ball.x;
      volley.update(r.world, 1 / 60);
      if (r.b.ball.x !== was) break;
      still++;
    }
    return { ok, v, still, r };
  };
  const hit = shot();
  check('누르는 순간 속도는 이미 실려 있다', hit.v[0] > 800, true);
  check('그래도 네 프레임은 제자리', hit.still, 4);
  check('멈춘 길이 = 휘두름 + 맞댐', hit.still, Math.round((SWING_WHIP + 2 / 60) * 60));
  check('멈춤이 풀린 순간 팔도 맞댐을 벗어난다', swingPhase(hit.r.p), 'follow');

  // 정타는 한 프레임 더 붙든다.
  const ace = shot({}, [40, -10]);
  check('정타는 다섯 프레임', ace.still, 5);
  check('정타가 더 세다', ace.v[0] > hit.v[0], true);
  note(`강타 ${hit.v[0]} (${hit.still}프레임 멈춤) · 정타 ${ace.v[0]} (${ace.still}프레임)`);

  // 화면 흔들림. world.shake 는 제곱×9px 로 쓰인다 (main.js).
  const r2 = rig(); spike(r2.world);
  let peak = 0;
  for (let i = 0; i < 8; i++) { volley.update(r2.world, 1 / 60); peak = Math.max(peak, r2.world.shake ?? 0); }
  check('강타는 화면을 흔든다', peak > 0.4, true);
  check('그래도 죽을 때(1)만큼은 아니다', peak < 1, true);
  note(`흔들림 ${peak.toFixed(2)} → ${(peak * peak * 9).toFixed(1)}px`);

  // 멈춘 공을 둘이 동시에 치지 못한다.
  const r3 = rig();
  spike(r3.world);
  check('멈춰 있는 동안은 또 못 친다', spike(r3.world), false);
}

say('정타 — 꼭대기에서 손끝으로 맞혀야 한다');
{
  const shot = (o) => { const r = rig(o); const ok = spike(r.world); return { ok, ...r, hot: r.b.ball.hot, ace: r.b.ball.ace, vx: r.b.ball.vx, vy: r.b.ball.vy }; };
  const ace = shot({ air: 60, off: [40, -10] });
  check('꼭대기 + 손끝 → 정타', ace.ace, true);
  const low = shot({ air: 30, off: [40, -10] });
  check('낮게 뛰면 정타가 아니다', low.ace, false);
  const far = shot({ air: 60, off: [66, -20] });
  check('손끝에서 멀면 정타가 아니다', far.ace, false);
  check('그래도 치기는 친다', far.ok, true);
  const lob = shot({ air: 60, off: [40, -10], keys: { jump: true } });
  check('넘겨 주기(⌥↑)는 정타가 아니다', lob.ace, false);
  check('넘겨 주기는 달아오르지도 않는다', lob.hot, 0);
  check('정타가 보통 강타보다 세다', Math.abs(ace.vx) > Math.abs(far.vx), true);
  note(`정타 ${ace.vx.toFixed(0)} · 같은 자리 보통 ${far.vx.toFixed(0)} · 낮은 점프 ${low.vx.toFixed(0)}`);

  // **정타 칸이 실제로 닿는 자리에 있나.** 몸이 세로로 긴 알약이라, 손끝에서 너무 가까운
  // 자리는 치기 전에 몸에 먼저 맞는다. 36px 로 뒀을 때 정타가 한 번도 안 나온 이유다.
  const r = rig();
  const p = r.world.player;
  const feet = p.groundY - p.air;
  const hand = feet - BODY_H * 0.86;
  const chest = feet - BODY_H * 0.7;
  const body = (dx, by) => {
    const cx = Math.max(-11, Math.min(dx, 11));
    const cy = Math.max(feet - BODY_H, Math.min(by, feet));
    return (dx - cx) ** 2 + (by - cy) ** 2 < (BALL_R + 7) ** 2;
  };
  let free = 0, aces = 0;
  for (let dx = -90; dx <= 90; dx += 2) for (let dy = -120; dy <= 120; dy += 2) {
    if (dx * dx + dy * dy > 88 * 88) continue;        // 손이 안 닿는다
    const by = chest + dy;
    if (body(dx, by)) continue;                       // 몸이 먼저 받는다
    free++;
    const q = rig({ off: [dx, by - hand] });
    if (spike(q.world) && q.b.ball.ace) aces++;
  }
  check('정타 칸이 있기는 하다', aces > 0, true);
  check('그렇다고 아무 데서나 나지는 않는다', aces / free < 0.25, true);
  check('칠 수 있는 자리의 1할은 넘는다', aces / free > 0.1, true);
  note(`칠 수 있는 자리 ${free}칸 중 정타 ${aces}칸 (${(aces / free * 100).toFixed(0)}%)`);

  // **받는 쪽이 대응할 수 있다.** 아무리 센 정타도 몸에 맞으면 MAX_UP 까지만 떠오른다.
  const w2 = mk(); w2.state = 'play'; w2.team = 0;
  const b2 = w2.bag; b2.started = true; b2.wait = 0;
  w2.mp.others.set(2, { id: 2, name: '범창', x: 1100, air: 0, vy: 0, vx: 0, crouch: 0,
                        dead: false, waiting: false, slide: 0, groundY: w2.groundY });
  b2.ball.x = 900; b2.ball.y = w2.groundY - 60; b2.ball.vx = 3000; b2.ball.vy = 0;
  b2.ball.hot = 0.7; b2.ball.ace = true; b2.ball.topspin = true;
  let dug = null;
  for (let i = 0; i < 20 && !dug; i++) { volley.update(w2, 1 / 60); if (b2.ball.vy < 0) dug = [b2.ball.vx, b2.ball.vy]; }
  check('아무리 센 공도 몸으로 받으면 떠오른다', dug !== null, true);
  check('떠오르는 높이는 여느 공과 같다 (950 상한)', Math.abs(dug[1]) <= 950, true);
  check('받아 내면 공이 식는다', b2.ball.hot, 0);
  check('「받았다!」가 뜬다', b2.fx.some((f) => f.k === 'dig'), true);
  note(`3000px/s 정타를 몸으로 받은 뒤 vy=${dug[1].toFixed(0)} (상한 950)`);
}

say('세게 나가는 느낌 — 탑스핀 · 덜 타는 공기 · 식기');
{
  // 탑스핀. 달아오른 강타는 중력의 1.45배로 떨어진다.
  const drop = (hot) => {
    const world = mk(); world.state = 'play'; world.team = 0;
    const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
    b.ball.x = 300; b.ball.y = 360; b.ball.vx = 0; b.ball.vy = 0;
    b.ball.hot = hot ? 0.7 : 0; b.ball.topspin = hot; b.ball.ace = false;
    for (let i = 0; i < 18; i++) volley.update(world, 1 / 60);
    return b.ball.y - 360;
  };
  const plain = drop(false), spun = drop(true);
  check('달아오른 강타가 더 빨리 떨어진다', spun > plain * 1.3, true);
  note(`0.3초에 떨어진 거리 — 보통 ${plain.toFixed(0)}px · 탑스핀 ${spun.toFixed(0)}px (${(spun / plain).toFixed(2)}배)`);

  // 공기 저항. 달아오른 공은 4할만, 정타는 아예 안 탄다.
  const glide = (hot, ace) => {
    const world = mk(); world.state = 'play'; world.team = 0;
    const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
    b.ball.x = 500; b.ball.y = 300; b.ball.vx = 1700; b.ball.vy = 0;
    b.ball.hot = hot ? 9 : 0; b.ball.ace = ace; b.ball.topspin = false;
    for (let i = 0; i < 30; i++) { b.ball.y = 300; b.ball.vy = 0; if (b.ball.x > 1300) b.ball.x = 500; volley.update(world, 1 / 60); }
    return b.ball.vx / 1700;
  };
  const cold = glide(false, false), warm = glide(true, false), sharp = glide(true, true);
  check('달아오른 강타는 덜 잦아든다', warm > cold, true);
  check('정타는 아예 안 잦아든다', Math.round(sharp * 1000), 1000);
  note(`반 초 뒤 남은 속도 — 보통 ${(cold * 100).toFixed(0)}% · 강타 ${(warm * 100).toFixed(0)}% · 정타 ${(sharp * 100).toFixed(0)}%`);

  // 무엇이든 한 번 닿으면 식는다. 안 그러면 벽을 맞고도 아무도 못 받는 공이 된다.
  const bump = (set) => {
    const world = mk(); world.state = 'play'; world.team = 0;
    const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
    b.ball.hot = 0.7; b.ball.ace = true; b.ball.topspin = true;
    set(world, b);
    for (let i = 0; i < 14; i++) volley.update(world, 1 / 60);
    return b.ball.hot;
  };
  check('옆벽에 맞으면 식는다', bump((w2, b) => { b.ball.x = 60; b.ball.y = 500; b.ball.vx = -2000; b.ball.vy = 0; }), 0);
  check('네트에 맞으면 식는다', bump((w2, b) => { b.ball.x = w2.w / 2 - 100; b.ball.y = w2.groundY - 55; b.ball.vx = 2000; b.ball.vy = 0; }), 0);
  // 시간이 다 돼도 식는다
  const r = rig(); spike(r.world);
  check('친 직후에는 달아올라 있다', r.b.ball.hot > 0, true);
  for (let i = 0; i < 60; i++) { r.b.ball.x = 500; r.b.ball.y = 400; volley.update(r.world, 1 / 60); }
  check('0.7초가 지나면 식는다', r.b.ball.hot, 0);

  // **친 사람 몸은 잠깐 공을 안 받는다.** 머리 위 공을 내리꽂으면 공이 제 몸을 지나간다 —
  // 그 프레임에 몸에 맞아 도로 떠오르면 강타가 토스가 된다.
  const d = rig({ x: 740, air: 100, off: [6, 20] });
  check('내리꽂기가 먹혔다', spike(d.world), true);
  check('아래로 간다', d.b.ball.vy > 900, true);
  for (let i = 0; i < 6; i++) volley.update(d.world, 1 / 60);
  check('제 몸에 맞아 도로 떠오르지 않는다', d.b.ball.vy > 0, true);
  note(`제 몸을 지난 뒤 vy=${d.b.ball.vy.toFixed(0)} (예전에는 여기서 -811 이 됐다)`);

  // 바닥에 꽂히면 먼지가 인다.
  const s = rig({ x: 740, air: 100, off: [6, 20] });
  spike(s.world);
  for (let i = 0; i < 30; i++) volley.update(s.world, 1 / 60);
  check('달아오른 채 꽂히면 먼지와 금이 남는다', s.b.fx.some((f) => f.k === 'slam'), true);

  // 판이 끝나도 자국은 마저 사그라든다 — 얼어붙은 먼지가 우승 화면까지 따라오면 안 된다.
  const e = rig(); spike(e.world);
  const froze = e.b.fx[0];
  const was = froze.t;
  e.world.state = 'over';
  for (let i = 0; i < 3; i++) volley.update(e.world, 1 / 60);
  check('판이 끝나도 자국이 흐른다', froze.t > was, true);
  check('팔도 마저 돈다', e.p.swing < SWING_TIME, true);
  for (let i = 0; i < 40; i++) volley.update(e.world, 1 / 60);
  check('결국 다 사그라든다', e.b.fx.length, 0);
  check('팔도 멈춘다', e.p.swing, 0);
}

say('꾸러미 — 남의 화면에서도 같은 순간에 같은 모션');
{
  // 방장이 친다.
  const host = rig();
  host.world.mp.on = true; host.world.mp.role = 'host'; host.world.mp.myId = 1;
  check('쳤다', spike(host.world), true);
  const pkt = volley.pack(host.world);
  check('타격을 실었다', Array.isArray(pkt.f), true);
  check('일곱 칸 — 옛 세 칸 뒤에 번호·종류·방향·멈춤', pkt.f.length, 7);
  check('앞의 셋은 옛 모양 그대로 [x, y, 세기]', pkt.f.slice(0, 3).every(Number.isFinite), true);
  check('친 사람 번호가 실린다', pkt.f[3], 1);
  check('종류는 강타(1) 나 정타(2)', pkt.f[4] >= 1, true);
  check('멈춤 시간이 실린다', pkt.f[6] > 0, true);
  check('공에 달아오름 칸이 붙는다', pkt.b.length, 7);
  check('달아올랐다', pkt.b[6] >= 1, true);
  // **멈춰 있는 동안은 속도도 0으로 보낸다** — 안 그러면 손님 화면에서만 공이 계속 간다.
  check('히트스톱 중에는 속도를 0으로 보낸다', [pkt.b[2], pkt.b[3]], [0, 0]);
  for (let i = 0; i < 5; i++) volley.update(host.world, 1 / 60);
  const pkt2 = volley.pack(host.world);
  check('멈춤이 풀리면 진짜 속도를 보낸다', Math.abs(pkt2.b[2]) > 800, true);
  check('타격은 한 번만 보낸다', pkt2.f, undefined);

  // 손님이 받는다.
  const guest = mk(); guest.state = 'play'; guest.team = 1;
  guest.mp.on = true; guest.mp.role = 'guest'; guest.mp.myId = 2;
  guest.mp.others.set(1, { id: 1, name: '도현', x: 500, air: 60, vy: 0, vx: 0, crouch: 0,
                           dead: false, waiting: false, slide: 0, groundY: guest.groundY });
  volley.unpack(guest, pkt);
  const hitter = guest.mp.others.get(1);
  check('친 사람에게 팔이 걸린다', hitter.swing > 0, true);
  check('같은 길이로 돈다', Math.round(hitter.swing * 1000), Math.round(SWING_TIME * 1000));
  check('같은 쪽으로 몸을 돌린다', hitter.swingDir, pkt.f[5]);
  check('같은 자리를 겨눈다', [hitter.aim[0], hitter.aim[1]], [pkt.f[0], pkt.f[1]]);
  check('같은 자국이 터진다', guest.bag.fx.some((f) => f.k === 'hit'), true);
  check('자국은 손이 공에 닿는 순간에 맞춰 터진다', guest.bag.fx.find((f) => f.k === 'hit').t < 0, true);
  check('손님도 달아오른 공으로 그린다', guest.bag.ball.hot > 0, true);

  // 흔들림은 자국이 터질 때 온다 — 누르는 순간이 아니라.
  check('아직 안 흔들린다', guest.shake ?? 0, 0);
  for (let i = 0; i < 4; i++) volley.update(guest, 1 / 60);
  check('두 프레임 뒤에 흔들린다', (guest.shake ?? 0) > 0.4, true);

  // 내가 친 것은 두 번 안 터뜨린다 (내 화면에서 이미 보여 줬다).
  const me = mk(); me.state = 'play'; me.team = 0;
  me.mp.on = true; me.mp.role = 'guest'; me.mp.myId = 1;
  me.bag.started = true; me.bag.wait = 0;
  me.player.x = 500; me.player.air = 60;
  const hand = me.player.groundY - 60 - BODY_H * 0.86;
  me.bag.ball.x = 540; me.bag.ball.y = hand - 20; me.bag.ball.vy = 200;
  spike(me);
  const mine = me.bag.fx.length;
  volley.unpack(me, pkt);                       // 방장이 「네가 쳤다」고 알려 온다
  check('내가 친 것은 두 번 안 터진다', me.bag.fx.length, mine);

  // 옛 모양 꾸러미([x, y, 세기])를 받아도 안 터진다.
  const old = mk(); old.state = 'play'; old.team = 1;
  old.mp.on = true; old.mp.role = 'guest'; old.mp.myId = 2;
  old.mp.others.set(1, { id: 1, name: '도현', x: 500, air: 60, vy: 0, vx: 0, crouch: 0,
                         dead: false, waiting: false, slide: 0, groundY: old.groundY });
  volley.unpack(old, { f: [540, 700, 0.8], b: [540, 700, 900, 0, 0, 1], s: [0, 0], w: 0 });
  check('옛 모양도 받는다', old.mp.others.get(1).swing > 0, true);
  check('옛 모양에도 자국은 뜬다', old.bag.fx.some((f) => f.k === 'hit'), true);
  check('여섯 칸짜리 공도 그대로 받는다', Math.round(old.bag.baseVX), 900);
  check('달아오름 칸이 없으면 보통 공', old.bag.ball.hot, 0);

  // 바닥에 꽂힘·받아 냄도 건너간다.
  const slam = mk(); slam.state = 'play'; slam.team = 1;
  slam.mp.on = true; slam.mp.role = 'guest'; slam.mp.myId = 2;
  volley.unpack(slam, { e: [[1, 700, 0, 1], [2, 900, 500, 0]], b: [540, 700, 900, 0, 0, 1], s: [0, 0], w: 0 });
  check('바닥 꽂힘이 남의 화면에도 뜬다', slam.bag.fx.some((f) => f.k === 'slam'), true);
  check('받아 냄도 뜬다', slam.bag.fx.some((f) => f.k === 'dig'), true);
  check('모르는 번호는 조용히 지나간다',
        (() => { volley.unpack(slam, { e: [[9, 1, 2, 3], 'x', [1]], b: [540, 700, 900, 0, 0, 1], s: [0, 0], w: 0 }); return true; })(), true);

  // 손님이 친 것을 방장이 대신 쳐 준다 — 그쪽 사람에게도 팔이 걸린다.
  const h2 = mk(); h2.state = 'play'; h2.team = 0;
  h2.mp.on = true; h2.mp.role = 'host'; h2.mp.myId = 1;
  h2.bag.started = true; h2.bag.wait = 0;
  const away = { id: 2, name: '범창', x: 1000, air: 60, vy: 0, vx: 0, crouch: 0,
                 dead: false, waiting: false, slide: 0, groundY: h2.groundY };
  h2.mp.others.set(2, away);
  const hand2 = h2.groundY - 60 - BODY_H * 0.86;
  h2.bag.ball.x = 960; h2.bag.ball.y = hand2 - 20; h2.bag.ball.vy = 200;
  volley.message(h2, 2, { k: 'hit', at: { x: 1000, air: 60, side: 1 }, want: { held: -1, down: false, up: false } });
  check('손님 타격도 방장이 쳐 준다', h2.bag.ball.vx < -500, true);
  check('그 손님에게 팔이 걸린다', away.swing > 0, true);
  check('그 타격도 꾸러미에 실린다', volley.pack(h2).f[3], 2);
}


say('치는 모션은 배구에서만 — 다른 게임 그림은 안 바뀐다');
{
  // 졸라맨은 다른 게임도 쓴다. 배구가 남긴 p.swing 이 남의 그림에 새어 들면,
  // 휘두르던 사람이 판을 갈아 끼운 뒤 그 자세로 굳는다.
  check('배구는 제 그림 그리는 법을 따로 준다', typeof volley.figure, 'function');
  const other = games.find((g) => g.id === 'dodge') ?? games.find((g) => !g.figure && g.id !== 'volley');
  check('다른 게임은 안 준다 (졸라맨 그대로)', other?.figure, undefined);

  // 획을 세어 본다 — 켠 쪽과 끈 쪽이 다른 그림이어야 한다.
  //
  // 그리는 자리를 받아 적는 가짜 캔버스. 모르는 부름은 전부 흘려보내고, 자리를 받는
  // 몇 개만 적어 둔다 — 두 그림이 같은지는 **찍힌 자리가 같은지**로 본다.
  const tally = () => {
    const pts = [];
    const take = { moveTo: 1, lineTo: 1, arc: 1 };
    const ctx = new Proxy({}, {
      get: (_, k) => {
        if (k === 'measureText') return () => ({ width: 10 });
        if (k === 'canvas') return { width: 1512, height: 944 };
        return (...a) => { if (take[k]) pts.push([Math.round(a[0] * 100) / 100, Math.round(a[1] * 100) / 100]); };
      },
      set: () => true,
    });
    return { ctx, pts };
  };
  const r = rig();
  spike(r.world);
  const p = r.world.player;
  const on = tally(); volley.figure(on.ctx, p, 0, 0, {});
  const off = tally(); drawStickman(off.ctx, p, 0, 0, {});
  const same = on.pts.length === off.pts.length
    && on.pts.every(([x, y], i) => Math.abs(x - off.pts[i][0]) < 0.01 && Math.abs(y - off.pts[i][1]) < 0.01);
  check('휘두르는 중에는 두 그림이 다르다', same, false);

  // 안 휘두르면 똑같아야 한다 — 배구라고 평소 그림까지 바뀌면 안 된다.
  p.swing = 0; p.toss = 0; p.cock = 0;
  const on2 = tally(); volley.figure(on2.ctx, p, 0, 0, {});
  const off2 = tally(); drawStickman(off2.ctx, p, 0, 0, {});
  check('안 휘두를 때는 똑같다',
        on2.pts.length === off2.pts.length
        && on2.pts.every(([x, y], i) => Math.abs(x - off2.pts[i][0]) < 0.01 && Math.abs(y - off2.pts[i][1]) < 0.01), true);
}



// ══════════════ v3.12 — 창을 보이게 · 빗나간 까닭 · 블로킹 · 페인트 · 서브 · 디그 ══════════════
//
// 「어쩔 땐 되고 어쩔 땐 안 된다」를 재 보니 원인이 분명했다: 정타는 **보이지 않는 두 창이
// 겹칠 때만** 나는데(뜬 높이 0.22초 · 공이 손끝 안 8~10프레임) 둘 다 화면에 표시가 없고,
// 빗나가도 아무 일이 안 일어났다. 아래 시험이 그 넷을 지킨다.

say('빗나간 까닭 — 왜 못 쳤는지 알려 준다');
{
  // ① 늦다 — 히트스톱 중에 누르면 입력이 씹혔다. 이제는 **기억했다가 풀리는 프레임에 친다.**
  const a = rig({ x: 740, air: 100, off: [6, 20] });
  check('내리꽂았다', spike(a.world), true);
  check('공이 멈춰 있다 (히트스톱)', a.b.stop > 0, true);
  const vy0 = a.b.ball.vy;
  check('멈춘 사이에 눌러도 못 친다', spike(a.world), false);
  check('「늦다」가 뜬다', a.b.fx.some((f) => f.k === 'miss' && f.word === '늦다'), true);
  check('버리지 않고 기억해 둔다', !!a.b.hold, true);
  // 공을 손끝에 다시 두고 히트스톱을 흘려보낸다 — 기억해 둔 입력이 그 프레임에 풀린다.
  // (첫 타격은 **남이 친 것**으로 둔다. 같은 사람이 곧바로 두 번은 못 친다 — SELF_SKIP.)
  a.b.ball.skip = null; a.b.ball.skipT = 0;
  a.b.ball.x = a.p.x + 6; a.b.ball.y = a.hand + 20; a.b.ball.vy = 200;
  for (let i = 0; i < 8; i++) volley.update(a.world, 1 / 60);
  check('풀리는 프레임에 대신 쳐 준다', a.b.ball.vy > 900 && a.b.ball.vy !== vy0, true);
  check('한 번 쓰면 기억은 지운다', a.b.hold, null);

  // ② 멀다 — 공중에서 손이 안 닿는데 눌렀다. 네트에서 먼 곳이라 벽도 못 세운다.
  const far = rig({ air: 60, off: [300, 0] });
  far.p.x = 120;                                   // 네트(756)에서 멀리
  far.b.ball.x = far.p.x + 300;
  check('안 닿으면 못 친다', spike(far.world), false);
  check('「멀다」가 뜬다', far.b.fx.some((f) => f.k === 'miss' && f.word === '멀다'), true);

  // ③ 낮다 — 뛰자마자 눌러 발이 12px 을 못 넘었다. 강타가 아니라 토스가 나간다.
  const low = rig({ air: 8, off: [6, 20] });
  check('낮아도 치기는 친다', spike(low.world), true);
  check('「낮다」가 뜬다', low.b.fx.some((f) => f.k === 'miss' && f.word === '낮다'), true);
  check('토스라 위로 뜬다', low.b.ball.vy < 0, true);

  // 빗나간 까닭은 **내 화면에만** 뜬다 — 꾸러미에 실을 값이 아니다.
  const solo = rig({ air: 60, off: [300, 0] });
  solo.p.x = 120; solo.b.ball.x = 420;
  spike(solo.world);
  check('남에게 알리지 않는다', (solo.b.events ?? []).length, 0);
}

say('블로킹 — 네트 앞에서 손을 넘겨 벽을 세운다');
{
  // 손에 안 닿는데 네트 앞 공중이면 벽이 선다. 때리기와 **같은 키**다.
  const r = rig({ air: 60, off: [300, 0] });
  const netX = r.world.w / 2;
  r.p.x = netX - 40;
  r.b.ball.x = netX + 260; r.b.ball.y = r.hand;
  check('벽을 세운다', spike(r.world), true);
  check('손이 올라간다', r.p.block > 0, true);
  check('바로 또 세우지는 못한다', r.p.blockCool > 0, true);

  // 넘어온 강타가 벽에 맞으면 **들어온 세기 그대로** 되돌아간다.
  const g = rig({ air: 60, off: [300, 0] });
  g.p.x = netX - 40; g.world.team = 0;
  g.p.block = 0.3;
  const ball = g.b.ball;
  ball.x = g.p.x + 10; ball.y = g.p.groundY - g.p.air - BODY_H - 18;
  ball.vx = -1400; ball.vy = 400; ball.hot = 0.5; ball.ace = true;
  volley.update(g.world, 1 / 60);
  check('상대 코트 쪽으로 되돌아간다', ball.vx > 0, true);
  check('세게 온 공은 세게 돌아간다', ball.vx > 900, true);
  check('막힌 공은 식는다', ball.hot, 0);
  check('막은 쪽에 「막았다!」', g.b.fx.some((f) => f.word === '막았다!'), true);
  check('남에게도 알린다', (g.b.events ?? []).some((e) => e[0] === 3), true);

  // 벽은 **모두의 화면에서** 선다. 남의 팔이 안 올라가면 공이 왜 튕겼는지 모른다.
  const seen = rig({ air: 60 });
  seen.world.mp.myId = 1;
  const mate = { id: 2, x: 700, air: 55, groundY: seen.p.groundY, dead: false, waiting: false,
                 crouch: 0, vx: 0, vy: 0, facing: 1, walk: 0, slide: 0, grabbing: -1 };
  seen.world.mp.others.set(2, mate);
  volley.unpack(seen.world, { e: [[4, 0, 0, 2]] });
  check('남이 세운 벽도 내 화면에서 선다', mate.block > 0, true);
  volley.unpack(seen.world, { e: [[4, 0, 0, 1]] });
  check('내가 세운 것은 두 번 걸지 않는다', seen.p.block ?? 0, 0);

  // 벽은 **내려서면 내려간다.** 땅에 선 채로 손만 올라가 있으면 안 된다.
  const down = rig({ air: 60 });
  down.p.block = 0.3; down.p.air = 0;
  volley.update(down.world, 1 / 60);
  check('내려서면 벽도 내려간다', down.p.block, 0);

  // 네트에서 멀면 벽이 안 선다 — 코트 한가운데서 벽을 세울 수는 없다.
  const mid = rig({ air: 60, off: [300, 0] });
  mid.p.x = 120; mid.b.ball.x = 420;
  check('네트에서 멀면 못 세운다', spike(mid.world), false);
  check('벽도 안 선다', mid.p.block ?? 0, 0);
}

say('페인트 — 공중에서 ⌥↑ 로 살짝 얹어 블록 너머로');
{
  const r = rig({ air: 60, off: [6, 10] });
  check('공중이면 얹기가 된다', tipHit(r.world), true);
  const sp = Math.hypot(r.b.ball.vx, r.b.ball.vy);
  check('상대 코트 쪽으로 간다', r.b.ball.vx > 0, true);
  check('강타보다 훨씬 느리다', sp < 700, true);
  check('조금 떠올랐다 떨어진다', r.b.ball.vy < 0, true);
  check('달아오르지 않는다', r.b.ball.hot, 0);
  check('멈추지도 않는다 (톡 얹는 것이다)', r.b.stop, 0);
  check('두 팔로 밀어 올리는 동작', r.p.toss > 0, true);

  // 같은 자리에서 그냥 치면 강타다 — 페인트가 훨씬 느려야 블록을 넘기는 뜻이 있다.
  const hard = rig({ air: 60, off: [6, 10] });
  spike(hard.world);
  check('그냥 치면 강타가 훨씬 세다', Math.hypot(hard.b.ball.vx, hard.b.ball.vy) > sp * 1.6, true);

  // 땅에서 ⌥↓ 는 페인트가 아니다 — 웅크리기(디그)다.
  const ground = rig({ air: 0, off: [6, 10] });
  check('땅에서는 페인트가 안 나간다', tipHit(ground.world), false);

  // **공중의 ⌥↓ 는 이제 페인트가 아니다.** ↓ 는 내리꽂기를 고르는 키라(⌥Space + ↓),
  // 누르는 순간 페인트가 나가면 꽂을 수가 없다. 위는 얹기, 아래는 꽂기.
  const downTap = rig({ air: 60, off: [6, 10] });
  const still2 = [downTap.b.ball.vx, downTap.b.ball.vy];
  tap(downTap.world, 'duck');
  check('공중에서 ⌥↓ 만 누르면 공은 그대로', [downTap.b.ball.vx, downTap.b.ball.vy], still2);

  // **위쪽 키로도 페인트가 된다.** ⌥↓ 하나만 받게 뒀더니 「페인트가 잘 안 된다」는 말이
  // 나왔다 — 공중에서 위아래 키는 달리 쓸 데가 없으니 둘 다 얹기로 받는다.
  // 키를 누르는 길(world.press → game.tap)을 그대로 지나가게 본다.
  // **⌥↑ 는 네 프레임 기다렸다 얹는다** — 그 사이 ⌥Space 가 오면 넘겨 주기(⌥Space + ↑)다.
  const up = rig({ air: 60, off: [6, 10], vy: 0 });
  const upVy = up.b.ball.vy;
  tap(up.world, 'jump');
  check('누른 그 프레임에는 아직 안 얹는다', up.b.ball.vy, upVy);
  for (let i = 0; i < 5; i++) { up.p.air = 60; volley.update(up.world, 1 / 60); }
  check('점프 뒤 ⌥↑ 로도 페인트', up.b.ball.vx > 0 && up.b.ball.vx < 300, true);
  check('같이 떠오른다', Math.round(up.b.ball.vy) < -300, true);
  check('⌥↑ 페인트도 안 달아오른다', up.b.ball.hot, 0);

  // 땅에서 ⌥↑ 는 점프다 — 얹히지 않는다.
  const jumpOff = rig({ air: 0, off: [6, 10] });
  const still = jumpOff.b.ball.vy;
  tap(jumpOff.world, 'jump');
  check('땅에서 ⌥↑ 는 그냥 점프', jumpOff.b.ball.vy, still);

  // **어느 자리에서 얹으면 넘어가나.** 페인트는 살짝 얹는 것이라 앞자리 전용이다 —
  // 가운데에서 얹으면 제 코트에 떨어진다. 이게 페인트와 강타를 가르는 값이다.
  const land = (x, air) => {
    const t = rig({ x, air, off: [10, 10] });
    if (!tipHit(t.world)) return null;
    t.b.stop = 0; t.b.stopHold = 0; t.b.ball.gT = 0;
    let cross = false;
    for (let i = 0; i < 600; i++) {
      const was = t.b.ball.x;
      volley.update(t.world, 1 / 120);
      if ((was - 756) * (t.b.ball.x - 756) < 0) cross = true;
      if (t.b.ball.y > t.world.groundY - 40 && t.b.ball.vy > 0) return cross ? Math.round(t.b.ball.x) : -1;
    }
    return 0;
  };
  check('네트 앞(720)에서 얹으면 넘어간다', land(720, 65) > 756, true);
  check('중간 앞(620)에서도 넘어간다', land(620, 65) > 756, true);
  check('가운데(500)에서 얹으면 제 코트에 떨어진다', land(500, 65), -1);
  note(`페인트 착지 — 720→${land(720, 65)} · 620→${land(620, 65)}`);
}

// **자리마다 스파이크가 네트를 넘는다.**
//
// netCap 은 update() 의 공 셈을 흉내서 미리 날려 보고 각을 정한다. 흉낸 셈이 실제와 어긋나면
// 공이 다시 네트에 걸리는데, 그건 코드를 봐서는 안 보인다. 그래서 **진짜로 날려서** 본다.
// (이 시험이 없던 동안 가운데 자리 스파이크는 열 번에 열 번 제 코트에 꽂혔다.)
say('스파이크 — 어느 자리에서 때려도 네트를 넘어간다');
{
  const shot = (x, air, under, keys = {}) => {
    const r = rig({ x, air, off: [6, under], keys });
    if (!spike(r.world)) return '못침';
    r.b.stop = 0; r.b.stopHold = 0; r.b.ball.gT = 0;
    for (let i = 0; i < 600; i++) {
      const was = r.b.ball.x;
      volley.update(r.world, 1 / 120);
      // 네트를 지나갔다
      if ((was - 756) * (r.b.ball.x - 756) < 0) return Math.round(r.b.ball.x);
      // 지나가기 전에 땅에 닿았다 — 제 코트에 꽂혔다
      if (r.b.ball.y > r.world.groundY - 40 && r.b.ball.vy > 0) return '자책';
    }
    return '안넘음';
  };
  let worst = null;
  for (const x of [140, 260, 380, 500, 620, 700, 740]) {
    for (const under of [0, 10, 20]) {
      for (const keys of [{}, { right: true }, { duck: true }, { duck: true, right: true }]) {
        const got = shot(x, 65, under, keys);
        if (typeof got !== 'number') worst = `x ${x} · 손밑 ${under} · ${JSON.stringify(keys)} → ${got}`;
      }
    }
  }
  check('일곱 자리 × 세 높이 × 네 가지 키(⌥↓ 포함) — 다 넘어간다', worst, null);
  // **꼭대기가 아닌 높이에서도.** 위 시험은 air 65(실제로는 못 닿는 높이)로만 쟀다 — 각을 돌리며
  // 세기를 두는 netCap 이 뒤쪽에서 덜 뜬 채 친 평평한 공을 네트 앞에 떨어뜨리는 걸 못 봤다.
  worst = null;
  for (const x of [100, 200, 300, 400, 500, 650]) {
    for (const air of [15, 25, 40, 52, 61]) {
      for (const under of [-10, 0, 10]) {
        for (const keys of [{}, { right: true }, { duck: true }]) {
          const got = shot(x, air, under, keys);
          if (typeof got !== 'number' && got !== '못침') worst = `x ${x} · 뜬 높이 ${air} · 손밑 ${under} · ${JSON.stringify(keys)} → ${got}`;
        }
      }
    }
  }
  check('여섯 자리 × 다섯 뜬 높이 × 세 높이 × 세 키 — 다 넘어간다', worst, null);
  note(`가운데(500)에서 손밑 20 을 때리면 vy=${(() => {
    const r = rig({ x: 500, air: 65, off: [6, 20] }); spike(r.world); return r.b.ball.vy.toFixed(0);
  })()} — 예전에는 +790 으로 제 코트에 꽂혔다`);
}

say('디그 — 웅크려 받으면 높고 곧게 뜬다');
{
  const r = rig({ air: 0, off: [0, 0] });
  const p = r.p;
  p.crouch = 1;
  const ball = r.b.ball;
  ball.x = p.x + 8; ball.y = p.groundY - 20; ball.vx = 900; ball.vy = 700;
  volley.update(r.world, 1 / 60);
  const dug = { vx: ball.vx, vy: ball.vy };
  check('위로 뜬다', dug.vy < 0, true);
  check('받았다! 가 뜬다', r.b.fx.some((f) => f.word === '받았다!'), true);

  // 서서 받은 것과 견준다 — 같은 공인데 웅크리면 더 곧게 선다.
  const t = rig({ air: 0, off: [0, 0] });
  t.p.crouch = 0;
  const b2 = t.b.ball;
  b2.x = t.p.x + 8; b2.y = t.p.groundY - 20; b2.vx = 900; b2.vy = 700;
  volley.update(t.world, 1 / 60);
  check('웅크리면 가로로 덜 튄다', Math.abs(dug.vx) < Math.abs(b2.vx), true);
  check('웅크리면 더 높이 뜬다', dug.vy <= b2.vy, true);
  note(`웅크림 vx=${dug.vx.toFixed(0)} vy=${dug.vy.toFixed(0)} · 서서 vx=${b2.vx.toFixed(0)} vy=${b2.vy.toFixed(0)}`);
}

say('서브 자리 — 코트 뒤쪽 절반에서만 올린다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.idle = 0;
  b.serveBy = 0; b.serving = true; b.charge = -1;
  world.player.x = 200;
  world.input.right = true;
  for (let i = 0; i < 240; i++) w.update(world, 1 / 60);
  const line = 1512 / 2 * 0.5;
  check('서브 선에서 멈춘다', Math.round(world.player.x), Math.round(line));
  ok('네트 근처까지 못 간다', world.player.x < 1512 / 2 - 100);
  world.input.right = false;
  // 서브가 넘어가고 나면 다시 네트까지 갈 수 있다
  volley.action(world); b.charge = 0.5; volley.release(world);
  world.input.right = true;
  for (let i = 0; i < 240; i++) { b.serving = false; w.update(world, 1 / 60); }
  ok('서브가 끝나면 네트까지 간다', world.player.x > 1512 / 2 - 60);

  // 반대편도 같다
  const o = mk(); o.state = 'play'; o.team = 1;
  o.bag.started = true; o.bag.wait = 0; o.bag.serveBy = 1; o.bag.serving = true; o.bag.charge = -1;
  o.player.x = 1400;
  o.input.left = true;
  for (let i = 0; i < 240; i++) w.update(o, 1 / 60);
  check('반대편 서브 선', Math.round(o.player.x), Math.round(1512 - line));
}

say('서브는 바로 넘겨야 한다 — 올린 편은 넘어가기 전까지 못 건드린다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.idle = 0;
  b.serveBy = 0; b.serving = true; b.charge = -1;
  world.player.x = 320;
  for (let i = 0; i < 20; i++) volley.update(world, 1 / 60);
  volley.action(world); b.charge = 0.5; volley.release(world);
  check('올린 편에 잠금이 걸린다', b.mustCross, 0);
  // 내 쪽에서 치려고 해도 안 된다
  b.ball.x = world.player.x + 10; b.ball.y = world.player.groundY - 60;
  const vy0 = b.ball.vy;
  ok('손을 못 댄다', spike(world) === false);
  check('공이 안 바뀐다', b.ball.vy, vy0);
  // 몸에 맞아도 안 튄다
  world.player.x = b.ball.x;
  const before = { vx: b.ball.vx, vy: b.ball.vy };
  volley.update(world, 1 / 60);
  ok('몸에 맞아도 안 튄다', b.ball.vy >= before.vy);
  // 네트를 넘으면 잠금이 풀린다
  b.ball.x = 1512 / 2 + 40;
  volley.update(world, 1 / 60);
  check('넘어가면 풀린다', b.mustCross, null);
}

say('서브 — 잡고 있는 만큼 힘이 찬다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true;
  world.player.x = 300; world.player.air = 0;
  b.serveBy = 0; b.serving = true; b.charge = -1; b.wait = 0; b.idle = 0;
  ok('내가 올릴 차례다', myServe(world));
  check('처음엔 안 차 있다', b.charge, -1);
  volley.action(world);
  check('누르면 차기 시작한다', b.charge, 0);
  for (let i = 0; i < 24; i++) volley.update(world, 1 / 60);
  ok('잡고 있으면 찬다', b.charge > 0.35 && b.charge < 0.45);
  ok('아직 공은 손에 있다', b.serving && b.ball.vy === 0);
  volley.release(world);
  ok('떼면 넘어간다', !b.serving);
  ok('상대 쪽으로 간다', b.ball.vx > 0);
  ok('위로 뜬다', b.ball.vy < 0);
  note(`0.4초 잡음 → vx ${b.ball.vx.toFixed(0)} vy ${b.ball.vy.toFixed(0)}`);
}

say('서브 — 살살 올리면 높고 느리게, 꽉 채우면 낮고 빠르게');
{
  const hit = (held, dir = 0) => {
    const world = mk(); world.state = 'play'; world.team = 0;
    const b = world.bag; b.started = true; b.wait = 0; b.idle = 0;
    world.player.x = 300; b.serveBy = 0; b.serving = true; b.charge = -1;
    volley.action(world);
    for (let i = 0; i < Math.round(held * 60); i++) volley.update(world, 1 / 60);
    if (dir > 0) world.input.right = true;
    if (dir < 0) world.input.left = true;
    volley.release(world);
    return { vx: b.ball.vx, vy: b.ball.vy, serving: b.serving, score: b.score };
  };
  const soft = hit(0.2), hard = hit(0.72);
  note(`살살 vx ${soft.vx.toFixed(0)} vy ${soft.vy.toFixed(0)} · 꽉 vx ${hard.vx.toFixed(0)} vy ${hard.vy.toFixed(0)}`);
  ok('꽉 채우면 더 빠르다', hard.vx > soft.vx * 1.4);
  ok('살살 올리면 더 높이 뜬다', soft.vy < hard.vy);
  const deep = hit(0.45, 1), shortly = hit(0.45, -1);
  ok('⌥→ 로 더 깊게', deep.vx > shortly.vx);
  note(`깊게 ${deep.vx.toFixed(0)} · 짧게 ${shortly.vx.toFixed(0)}`);
}

// **서브는 채운 만큼 빨라져야 한다.** 1250 이던 시절에는 살살 넣은 공이 1.65초에 902,
// 꽉 채운 공이 1.13초에 1058 — 반 초 빨라지고 156px 더 갈 뿐이라 받는 쪽에는 둘 다
// 「높이 뜬 공이 천천히 온다」로 똑같이 보였다. 그게 「서브가 약하다」였다.
say('서브 — 꽉 채우면 빠르게 꽂히고, 살살 넣으면 높이 뜬다');
{
  // 코트 맨 뒤(x 200)에서 넣어 본다 — 제일 멀리서 넣는 자리다.
  const fly = (k, dir = 0) => {
    const world = mk(); world.state = 'play'; world.team = 0;
    const b = world.bag; b.started = true; b.wait = 0; b.idle = 0;
    world.player.x = 200; b.serveBy = 0; b.serving = true; b.charge = -1;
    // 공이 손 위로 **다 내려올 때까지** 둔다. 10프레임만 두었더니 공이 아직 바닥 위 269px 에
    // 떠 있었다 — 실제 서브는 손 높이(110)에서 나가는데, 표도 시험도 그 높이에서 쟀다.
    for (let f = 0; f < 40; f++) volley.update(world, 1 / 60);
    hitServe(world, k, dir);
    const spin = !!b.ball.topspin;
    let top = b.ball.y;
    for (let f = 0; f < 60 * 6; f++) {
      volley.update(world, 1 / 60);
      top = Math.min(top, b.ball.y);
      if (b.ball.y > world.groundY - 40 && b.ball.vy > 0) {
        return { t: (f + 1) / 60, x: b.ball.x, high: world.groundY - top, spin, vx: b.ball.vx };
      }
    }
    return { t: 99, x: b.ball.x, high: world.groundY - top, spin, vx: b.ball.vx };
  };

  const full = fly(1), soft = fly(0);
  ok('꽉 채운 서브는 1초 안에 상대 코트에 떨어진다', full.t < 1 && full.x > 1512 / 2);
  note(`꽉 ${full.t.toFixed(2)}초 · ${Math.round(full.x)} · 최고 ${Math.round(full.high)}px`);
  ok('살살 넣으면 1.4초 넘게 높이 뜬다', soft.t > 1.4 && soft.high > 300);
  note(`살살 ${soft.t.toFixed(2)}초 · ${Math.round(soft.x)} · 최고 ${Math.round(soft.high)}px`);
  ok('꽉 채운 쪽이 반 초 넘게 빨리 온다', soft.t - full.t > 0.5);
  ok('꽉 채운 쪽이 더 낮게 간다', full.high < soft.high * 0.6);

  // 강서브는 **앞으로 돌며** 간다 — 안 그러면 빨라진 공이 뒷벽까지 날아간다.
  ok('강서브는 앞으로 돈다', full.spin === true);
  ok('살살 넣은 공은 안 돈다', soft.spin === false);
  const deep = fly(1, 1), shortly = fly(1, -1);
  ok('⌥→ 로 더 깊이 꽂는다', deep.x > full.x && shortly.x < full.x);
  note(`깊게 ${Math.round(deep.x)} · 그냥 ${Math.round(full.x)} · 짧게 ${Math.round(shortly.x)}`);
  ok('어느 쪽이든 상대 코트 안이다', shortly.x > 1512 / 2 && deep.x < 1512 - 40);
}

say('서브 — 제자리에서 올리면 어떤 세기로도 네트를 넘는다');
{
  const cross = (held, dir) => {
    const world = mk(); world.state = 'play'; world.team = 0;
    world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1;
    world.mp.others.set(2, { id: 2, x: 1450, air: 0, vx: 0, vy: 0, dead: false, waiting: false,
                             groundY: world.groundY, crouch: 0, walk: 0, facing: -1,
                             grabbing: -1, heldBy: -1, grabAim: 0, slide: 0 });
    const b = world.bag;
    volley.update(world, 1 / 60);
    for (let f = 0; f < 80; f++) volley.update(world, 1 / 60);
    b.serveBy = 0; b.serving = true; b.charge = -1; b.idle = 0;
    world.player.x = 320;
    for (let f = 0; f < 20; f++) volley.update(world, 1 / 60);
    volley.action(world); b.charge = held;
    world.input.right = dir > 0; world.input.left = dir < 0;
    volley.release(world);
    world.player.x = 60; world.mp.others.get(2).x = 1460;
    // **공이 네트를 넘었는지를 본다.** 예전에는 점수로 갈랐는데, 서브가 빨라지고 나서
    // 깊은 서브가 뒤에 선 사람 몸에 맞고 되넘어와 **넘어갔는데도 상대 점수**가 났다 —
    // 그건 서브가 못 넘은 것이 아니라 그 뒤의 랠리를 진 것이다.
    const was = [...b.score];
    for (let f = 0; f < 60 * 8; f++) {
      volley.update(world, 1 / 60);
      if (b.ball.x > 1512 / 2 + 20) return true;   // 네트를 넘어갔다
      if (b.score[1] !== was[1]) return false;     // 못 넘고 내 코트에 떨어졌다
    }
    return null;
  };
  for (const held of [0.16, 0.3, 0.45, 0.6, 0.72]) {
    ok(`${held}초 잡고 올려도 넘어간다`, cross(held, 0) === true);
  }
  ok('⌥→ 로 깊게 올려도 넘어간다', cross(0.5, 1) === true);
  ok('⌥← 로 짧게 올려도 넘어간다', cross(0.5, -1) === true);
}

say('서브 — 너무 오래 잡으면 손에서 빠진다 (상대 점수)');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.idle = 0;
  world.player.x = 300; b.serveBy = 0; b.serving = true; b.charge = -1;
  b.score = [0, 0];
  volley.action(world);
  for (let i = 0; i < 90 && b.charge >= 0; i++) volley.update(world, 1 / 60);
  ok('1.06초를 넘기면 손에서 빠진다', !(b.charge >= 0));
  check('상대 점수', b.score, [0, 1]);
  // 이 게임은 **진 쪽이 다시 올린다** (원래 쓰던 규칙). 서브권이 넘어가지는 않는다.
  check('진 쪽이 다시 올린다', b.serveBy, 0);
  ok('새 서브를 들고 기다린다', b.serving && b.wait > 0);
  ok('공은 안 날아갔다', b.ball.vy === 0);
}

say('서브 잠금은 손님에게도 걸린다');
{
  const host = mk(); host.state = 'play'; host.team = 0;
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1;
  const guest = { id: 2, name: '손님', x: 1100, air: 0, groundY: host.groundY, dead: false, waiting: false };
  host.mp.others.set(2, guest);
  const b = host.bag; b.started = true; b.wait = 0; b.serving = false;
  b.mustCross = 1;                                  // 오른쪽(1편)이 올렸고 아직 안 넘어갔다
  const want = { held: 0, down: false, up: false, tip: false };
  const put = () => { b.ball.x = 1100; b.ball.y = host.groundY - 90; b.ball.vx = 300; b.ball.vy = -200; };
  put();
  volley.message(host, 2, { k: 'hit', at: { x: 1100, air: 0, side: 1 }, want });
  ok('올린 편 손님은 못 건드린다', b.ball.vx === 300 && b.ball.vy === -200);
  // 잠금이 풀리면 똑같은 말이 먹힌다 — 위 검사가 헛돌지 않았다는 증거다
  b.mustCross = null; b.stop = 0; put();
  volley.message(host, 2, { k: 'hit', at: { x: 1100, air: 0, side: 1 }, want });
  ok('풀리면 먹힌다', b.ball.vx !== 300 || b.ball.vy !== -200);
  // 손님 화면도 잠금을 안다 — 안 그러면 눌러 놓고 왜 안 맞는지 모른다
  const g2 = mk(); g2.mp.on = true; g2.mp.role = 'guest';
  b.mustCross = 0;
  volley.unpack(g2, volley.pack(host));
  check('손님도 잠금을 받는다', g2.bag.mustCross, 0);
}

say('기술표가 판 위에 있다 — 메뉴를 안 열어도 보이게');
{
  // 이 게임은 기술이 여덟인데 판 어디에도 안 적혀 있었다. 메뉴(⌥M)를 열면 나오지만
  // 판을 멈추고 메뉴를 여는 사람은 없다.
  const all = KEY_ROWS.map((r) => r.join(' ')).join(' / ');
  for (const skill of ['달리기', '점프', '강타', '페인트', '디그', '블로킹', '슬라이딩', '넘겨 주기']) {
    ok(`${skill} 이 적혀 있다`, all.includes(skill));
  }
  ok('한 줄에 키와 이름이 같이 있다', KEY_ROWS.every((r) => r.length === 2 && r[0].includes('⌥')));
  ok('여덟 줄을 안 넘는다 (구석에 작게 들어가야 한다)', KEY_ROWS.length <= 8);
  const serve = SERVE_ROWS.map((r) => r.join(' ')).join(' / ');
  ok('서브 때는 서브 조작만 적는다', serve.includes('서브') && !serve.includes('블로킹'));
}

say('네트 너머의 공은 못 친다 — 넘어가서 손을 대는 건 블로킹뿐이다');
{
  const netX = 1512 / 2;
  const tryAt = (over, air) => {
    const world = mk(); world.state = 'play'; world.team = 0;
    const b = world.bag; b.started = true; b.wait = 0; b.serving = false; b.stop = 0;
    world.player.x = netX - 14; world.player.air = air; world.player.groundY = world.groundY;
    b.ball.x = netX + over; b.ball.y = world.groundY - air - 74;
    b.ball.vx = 0; b.ball.vy = 0;
    volley.action(world);
    return b.ball.vx !== 0 || b.ball.vy !== 0;
  };
  ok('내 코트 공은 친다', tryAt(-40, 0));
  ok('네트에 걸친 공도 친다', tryAt(10, 0));
  // 손이 닿는 거리(88)가 네트 틈(14)보다 훨씬 커서, 막지 않으면 상대 코트 60px 안쪽
  // 공까지 땅에 서서 그냥 쳤다.
  ok('네트 너머 공은 못 친다', !tryAt(40, 0));
  ok('뛰어올라도 못 친다', !tryAt(40, 120));
  // 블로킹은 다른 길이다 — 네트 앞 공중에서 ⌥Space
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false; b.stop = 0;
  world.player.x = netX - 14; world.player.air = 120; world.player.groundY = world.groundY;
  b.ball.x = netX + 300; b.ball.y = world.groundY - 300;      // 손이 안 닿는 공
  volley.action(world);
  ok('네트 앞에서 뛰면 벽은 선다', world.player.block > 0);
}

say('마지막 점수가 나면 **그 자리에서** 끝난다 — 진 쪽 서브를 기다리지 않는다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
  b.score = [4, 0];
  const ends = [];
  world.onGameOver = (r) => ends.push(r);
  b.ball.x = 1200; b.ball.y = world.groundY - 40; b.ball.vy = 800; b.ball.vx = 0;
  world.player.x = 100;
  for (let i = 0; i < 8; i++) volley.update(world, 1 / 60);
  check('다섯 점째에 바로 끝난다', ends.length, 1);
  check('빨강 편이 이겼다', ends[0]?.side, 0);
  ok('공은 치워져 있다', b.ball.vy === 0);
  // 전에는 point() 가 곧바로 다음 서브로 넘겨 버리고, 서브를 기다리는 동안은 update 가
  // 일찍 돌아가서 끝 검사에 영영 안 닿았다 — 진 사람이 한 번 더 올려야 만세가 떴다.
}

say('빈 코트로 서브권이 가면 저절로 올라간다 — 안 그러면 혼자 할 때 판이 영영 멎는다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0;
  world.player.x = 300;                      // 나는 왼쪽(0편)에 있다
  b.serveBy = 1; b.serving = true; b.charge = -1;   // 아무도 없는 오른쪽이 올릴 차례
  let f = 0;
  for (; f < 60 * 6 && b.serving; f++) volley.update(world, 1 / 60);
  ok('몇 초 안에 올라간다', !b.serving && f < 60 * 4);
  ok('공이 실제로 날아간다', b.ball.vx !== 0);
  note(`빈 코트 서브까지 ${(f / 60).toFixed(1)}초`);
}

say('서브 — 아무도 안 누르면 저절로 올라가지 않는다 (누를 때까지 기다린다)');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0;
  world.player.x = 300; b.serveBy = 0; b.serving = true; b.charge = -1;
  for (let i = 0; i < 60 * 12; i++) volley.update(world, 1 / 60);
  ok('12초를 기다려도 안 넘어간다', b.serving);
  ok('점수도 안 난다', b.score[0] === 0 && b.score[1] === 0);
  ok('공은 손에 들려 있다', b.ball.vy === 0);
}

say('서브 — 올릴 차례가 아닌 사람은 못 올린다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0;
  world.player.x = 300; b.serveBy = 1; b.serving = true; b.charge = -1;   // 상대가 올릴 차례
  ok('내 차례가 아니다', !myServe(world));
  volley.action(world);
  check('눌러도 안 찬다', b.charge, -1);
  volley.release(world);
  ok('공은 그대로 손에 있다', b.serving);
}

say('서브 — 손님이 보낸 것을 방장이 대신 때린다');
{
  const host = mk(); host.state = 'play';
  host.mp.on = true; host.mp.role = 'host'; host.mp.myId = 1;
  host.team = 0; host.player.x = 300;
  host.mp.others.set(2, { id: 2, x: 1200, air: 0, dead: false, waiting: false });
  const b = host.bag; b.started = true; b.wait = 0; b.idle = 0;
  b.serveBy = 1; b.serving = true; b.charge = -1;     // 파랑(손님)이 올릴 차례
  volley.message(host, 2, { k: 'serve', p: 100, d: 0 });
  ok('방장이 대신 때렸다', !b.serving);
  ok('손님 쪽에서 내 쪽으로 온다', b.ball.vx < 0);
  // 올릴 차례가 아닌 손님이 보내면 안 먹는다
  const w2 = mk(); w2.state = 'play';
  w2.mp.on = true; w2.mp.role = 'host'; w2.mp.myId = 1;
  w2.team = 0; w2.player.x = 300;
  w2.mp.others.set(2, { id: 2, x: 1200, air: 0, dead: false, waiting: false });
  w2.bag.started = true; w2.bag.wait = 0;
  w2.bag.serveBy = 0; w2.bag.serving = true; w2.bag.charge = -1;   // 내가 올릴 차례
  volley.message(w2, 2, { k: 'serve', p: 100, d: 0 });
  ok('남의 차례에 보낸 서브는 안 먹는다', w2.bag.serving);
}

say('서브 — 올리는 사람 위로 공이 따라온다 (자리가 곧 조준이다)');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true;
  const p = world.player;
  p.x = 200; p.air = 0;
  b.serveBy = 0; b.wait = 1.0; b.serving = true; b.charge = -1;
  b.ball.x = world.w * 0.25; b.ball.y = 200;
  const was = b.ball.x;
  for (let i = 0; i < 30; i++) volley.update(world, 1 / 60);
  check('공이 서브하는 사람 쪽으로 온다', Math.abs(b.ball.x - p.x) < Math.abs(was - p.x), true);
  check('손에 들려 있다 — 안 떨어진다', b.ball.vy, 0);
  note(`${was.toFixed(0)} → ${b.ball.x.toFixed(0)} (사람은 ${p.x})`);

  // 반대편이 올릴 차례면 내 쪽으로 안 온다.
  const o = mk(); o.state = 'play'; o.team = 0;
  o.bag.started = true; o.bag.serveBy = 1; o.bag.wait = 1.0;
  o.player.x = 200;
  o.bag.ball.x = o.w * 0.75; o.bag.ball.y = 200;
  const far = o.bag.ball.x;
  for (let i = 0; i < 30; i++) volley.update(o, 1 / 60);
  check('남이 올릴 때는 안 따라온다', Math.abs(o.bag.ball.x - far) < 1, true);
}

// ══════════════ v3.25 — 주석대로 안 돌던 열둘 ══════════════
//
// 주석·커밋·기술표가 약속한 것을 **실제 점프 높이(61.5)·실제 손 높이·양쪽 코트**로 재서
// 어긋난 것을 고쳤다. 전부 시험이 대신 재던 값(가짜 높이, 부호)이 약속과 달라서 숨어 있었다.

say('서브 — 실제 손 높이에서, 서브 구역 어디서 어떤 세기·방향으로 넣어도 네트를 넘는다');
{
  // 예전 시험은 공이 손에 내려오기 전(바닥 위 269)에 쏘았다. 실제는 110 이라 뒤쪽(x≤140)의
  // 강서브·⌥← 서브가 네트에 걸렸다 — 서브 구역의 6할.
  const cross = (side, x, k, dir) => {
    const world = mk(); world.state = 'play'; world.team = side;
    const b = world.bag; b.started = true; b.wait = 0; b.idle = 0;
    world.player.x = side === 0 ? x : 1512 - x;
    b.serveBy = side; b.serving = true; b.charge = -1;
    for (let f = 0; f < 40; f++) volley.update(world, 1 / 60);
    if (!hitServe(world, k, dir)) return '못넣음';
    world.player.x = side === 0 ? 30 : 1482;
    for (let f = 0; f < 60 * 4; f++) {
      const was = b.ball.x;
      volley.update(world, 1 / 60);
      if ((was - 756) * (b.ball.x - 756) < 0) return true;
      if (b.serving) return '안넘음';
    }
    return '안옴';
  };
  let bad = null, n = 0;
  for (const side of [0, 1]) for (const x of [28, 60, 100, 140, 200, 260, 320, 378])
    for (const k of [0, 0.3, 0.6, 0.86, 1]) for (const dir of [-1, 0, 1]) {
      n++;
      const got = cross(side, x, k, dir);
      if (got !== true) bad = `편 ${side} · x ${x} · 세기 ${k} · 방향 ${dir} → ${got}`;
    }
  check(`${n}가지 다 넘어간다`, bad, null);
}

say('서브 — 쉬는 동안(점수 직후)은 못 넣는다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.idle = 0;
  world.player.x = 300; b.serveBy = 0; b.serving = true; b.charge = -1; b.wait = 0.9;
  volley.action(world);
  check('잡기 시작하지도 않는다', b.charge, -1);
  check('hitServe 도 거절한다', hitServe(world, 0.5, 0), false);
  check('공은 아직 손에', b.serving, true);
  b.wait = 0;
  volley.action(world);
  check('쉬는 게 끝나면 잡는다', b.charge, 0);
}

/// 방장 하나와 손님(2번, 파랑) 하나. 손님은 방장 장부의 others 로만 있다.
function hostWithGuest(gx = 1300, air = 0) {
  const world = mk(); world.state = 'play'; world.team = 0;
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1;
  world.player.x = 300;
  const g = { id: 2, name: '손님', x: gx, baseX: gx, air, groundY: world.groundY, vx: 0, vy: 0,
              crouch: 0, facing: -1, dead: false, waiting: false, grabbing: -1, heldBy: -1, slide: 0 };
  world.mp.others.set(2, g);
  const b = world.bag; b.started = true; b.wait = 0; b.idle = 0; b.serving = false;
  return { world, b, g };
}

say('서브 — 손님도 너무 오래 잡으면 손에서 빠진다');
{
  // 실패 검사가 방장의 b.charge 에만 걸려 있어서, 손님은 3초를 잡아도 세기 100 서브가 나갔다.
  const { world, b } = hostWithGuest(1300);
  b.serveBy = 1; b.serving = true; b.charge = -1; b.ball.x = 1300; b.score = [0, 0];
  volley.message(world, 2, { t: 'gm', k: 'hold' });
  check('방장이 손님 것을 센다', b.charge, 0);
  for (let i = 0; i < 70 && b.charge >= 0; i++) volley.update(world, 1 / 60);
  check('1.06초를 넘기자 실패 — 상대(빨강) 점수', b.score, [1, 0]);

  // 손님 제 화면에서도 넘기면 떼어도 안 나간다.
  const gw = mk(); gw.state = 'play'; gw.team = 1;
  gw.mp.on = true; gw.mp.role = 'guest'; gw.mp.myId = 2;
  gw.player.x = 1300;
  const gb = gw.bag; gb.started = true; gb.wait = 0; gb.serving = true; gb.serveBy = 1; gb.ball.x = 1300;
  const sent = []; gw.send = (m) => sent.push(m);
  volley.action(gw);
  check('누르면 방장에게 「잡았다」를 알린다', sent.some((m) => m.k === 'hold'), true);
  for (let i = 0; i < 70; i++) volley.update(gw, 1 / 60);
  volley.release(gw);
  check('너무 오래 잡은 뒤 떼도 서브를 안 보낸다', sent.some((m) => m.k === 'serve'), false);
}

say('손님 타격 — 서브를 기다리는 동안은 안 먹힌다 · 서브는 남은 달아오름을 지운다');
{
  const { world, b } = hostWithGuest(1100, 60);
  b.serving = true; b.serveBy = 0;
  b.ball.x = 1094; b.ball.y = world.groundY - 60 - BODY_H * 0.86; b.ball.vx = 0; b.ball.vy = 0;
  volley.message(world, 2, { t: 'gm', k: 'hit', at: { x: 1100, air: 60, side: 1 },
                             want: { held: 0, down: false, up: false, tip: false } });
  check('공은 그대로', [b.ball.vx, b.ball.vy, b.stop], [0, 0, 0]);
  check('달아오르지도 않았다', b.ball.hot, 0);
  // 무엇이 남아 있었든 서브는 식은 공으로 시작한다.
  b.ball.hot = 0.7; b.ball.topspin = true; b.wait = 0;
  hitServe(world, 0.1, 0);
  check('살살 넣은 서브는 탑스핀이 없다', b.ball.topspin, false);
}

say('손님 타격 — 히트스톱에 걸려도 버리지 않고 풀리면 친다');
{
  const { world, b, g } = hostWithGuest(1100, 60);
  b.ball.x = 1094; b.ball.y = world.groundY - 60 - BODY_H * 0.86 + 6; b.ball.vx = 0; b.ball.vy = 0;
  b.stop = 0.05;
  volley.message(world, 2, { t: 'gm', k: 'hit', at: { x: 1100, air: 60, side: 1 },
                             want: { held: 0, down: false, up: false, tip: false } });
  check('멈춘 동안은 안 친다', b.ball.vx, 0);
  check('들고 있다', b.guestHold.has(2), true);
  for (let i = 0; i < 6; i++) { g.air = 60; volley.update(world, 1 / 60); }
  ok('풀리자 쳤다 (빨강 쪽으로)', b.ball.vx < -300);
  check('다 썼다', b.guestHold.size, 0);

  // 손님 화면도 방장의 멈춤을 안다 — 그 사이 누른 것은 「늦다」로 기억했다가 풀리면 보낸다.
  const gw = mk(); gw.state = 'play'; gw.team = 1;
  gw.mp.on = true; gw.mp.role = 'guest'; gw.mp.myId = 2;
  gw.player.x = 1100; gw.player.air = 60;
  const sent = []; gw.send = (m) => sent.push(m);
  volley.unpack(gw, { f: [900, 700, 1, 1, 1, 1, 0.067], b: [1094, 800, 0, 0, 0, 0, 0], w: 0 });
  ok('손님도 히트스톱을 센다', gw.bag.stop > 0.06);
  check('그 사이 누르면 못 친다', spike(gw), false);
  check('기억해 둔다', !!gw.bag.hold, true);
  check('보내지도 않았다 (방장은 멈춘 채라 못 친다)', sent.length, 0);
}

say('슬라이딩 — 손님이 몸을 던져도 방장 판정에서 넓은 몸이다');
{
  // 꾸러미에 slide 칸이 없어서 방장은 손님을 늘 서 있는 몸(폭 11)으로 봤다.
  const gw = mk(); gw.state = 'play'; gw.team = 1; gw.player.x = 1100;
  w.startSlide(gw, 1);
  const packet = net.myPacket(gw);
  ok('꾸러미에 슬라이딩이 실린다 (남은 시간 × 방향)', packet[12] > 0);
  const { world, b } = hostWithGuest(1100, 0);
  net.handleMessage(world, { net: { send() {} }, log() {} }, 2, packet, {});
  const g = world.mp.others.get(2);
  ok('방장 쪽 손님 몸도 미끄러진다', g.slide > 0);
  g.x = 1100; g.air = 0; g.groundY = world.groundY;
  const drop = (slide) => {
    g.slide = slide;
    b.serving = false; b.wait = 0; b.stop = 0;
    b.ball.x = 1100 + 55; b.ball.y = world.groundY - 40; b.ball.vx = 0; b.ball.vy = 300;
    volley.update(world, 1 / 60);
    return b.ball.vy < 0;
  };
  check('미끄러지는 몸은 옆 55px 공을 받는다', drop(0.3), true);
  check('서 있는 몸은 못 받는다 (넓은 몸이 슬라이딩의 값이다)', drop(0), false);
}

say('슬라이딩 — 달리기보다 멀리 가고, 끝나면 잠깐 못 움직인다');
{
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
  const p = world.player; p.x = 200; p.air = 0;
  const step = () => { b.serving = false; b.wait = 0; w.update(world, 1 / 60); };
  w.startSlide(world, 1);
  const x0 = p.x;
  let t = 0;
  while (p.slide > 0 && t < 1) { step(); t += 1 / 60; }
  const slid = p.x - x0;
  // 전속으로 달리던 사람이 같은 시간 동안 가는 거리
  const r = mk(); r.state = 'play'; r.team = 0;
  r.player.x = 200; r.player.vx = 620; r.input.right = true;
  for (let i = 0; i < Math.round(t * 60); i++) { r.bag.serving = false; r.bag.wait = 0; w.update(r, 1 / 60); }
  const ran = r.player.x - 200;
  ok('끝까지 가도 전속 달리기보다 멀리 간다', slid > ran);
  note(`${t.toFixed(2)}초 — 슬라이딩 ${slid.toFixed(0)}px · 달리기 ${ran.toFixed(0)}px`);
  world.input.right = true;
  const x1 = p.x;
  for (let i = 0; i < 9; i++) step();
  ok('끝나고 0.15초는 거의 못 움직인다', Math.abs(p.x - x1) < 12);
  for (let i = 0; i < 30; i++) step();
  ok('그 뒤에는 다시 달린다', p.x - x1 > 80);
}

say('블로킹 — 손은 닿는데 공이 네트 너머면 벽을 세운다');
{
  // 손이 닿으면 치기로만 보냈다가, 치기가 「네트 너머」로 거절해서 벽도 까닭도 없었다.
  const r = rig({ x: 730, air: 50 });
  r.b.ball.x = 756 + 40; r.b.ball.y = r.hand + 10;
  check('눌렀다', spike(r.world), true);
  ok('벽이 섰다', r.p.block > 0);
  // 벽 쿨타임이면 막지는 못하되 까닭은 뜬다
  const c = rig({ x: 730, air: 50 });
  c.p.blockCool = 0.3;
  c.b.ball.x = 756 + 40; c.b.ball.y = c.hand + 10;
  check('쿨타임이면 못 막는다', spike(c.world), false);
  ok('까닭이 뜬다', c.b.fx.some((f) => f.k === 'miss'));
}

say('페인트 — 떠오른 블로커 손 위로 넘어간다');
{
  // 예전 페인트는 손 높이에서 25px 만 떠올라, 떠오른 블로커(벽 윗면 171)에 다 막혔다.
  const tip = (d, blockerAir) => {
    const r = rig({ x: 730 - d, air: 61.5, off: [10, 10], vy: 150 });
    if (blockerAir !== null) {
      r.world.mp.others.set(9, { id: 9, x: 782, air: blockerAir, groundY: r.world.groundY, vx: 0, vy: 0,
                                 crouch: 0, dead: false, waiting: false, block: 0.3, blockCool: 0.7, facing: -1 });
    }
    if (!tipHit(r.world)) return '못얹음';
    const s0 = r.b.score[0];
    for (let i = 0; i < 400; i++) {
      const o = r.world.mp.others.get(9); if (o) { o.block = 0.3; o.air = blockerAir; }
      r.p.x = 200; r.p.air = 0;
      volley.update(r.world, 1 / 120);
      if (r.b.fx.some((f) => f.word === '막았다!')) return '막힘';
      if (r.b.serving) return r.b.score[0] > s0 ? '넘김' : '제코트';
    }
    return '?';
  };
  for (const air of [40, 61.5]) check(`네트에서 80 — 블로커가 ${air} 떠 있어도 넘긴다`, tip(80, air), '넘김');
  check('네트에서 80 — 블로커가 없어도 넘긴다', tip(80, null), '넘김');
  check('가운데(250)에서는 제 코트에 떨어진다', tip(250, null), '제코트');
}

say('⌥↑ 와 ⌥Space + ↑ — 두 기술이 한 공을 두 번 치지 않는다');
{
  // ↑ 를 먼저 누르고 ⌥Space 를 누르면: 예전엔 페인트가 나간 뒤 같은 프레임에 또 쳤다.
  const r = rig({ air: 60, off: [6, 10], vy: 0, keys: { jump: true } });
  tap(r.world, 'jump'); r.world.input.jump = true;
  volley.action(r.world);
  ok('넘겨 주기가 나갔다 (팔을 휘두른다)', r.p.swing > 0 && !(r.p.toss > 0));
  for (let i = 0; i < 6; i++) { r.p.air = 60; volley.update(r.world, 1 / 60); }
  ok('기다리던 페인트는 버려졌다 (얹는 팔이 안 나온다)', !(r.p.toss > 0));
  // 같은 사람이 곧바로 두 번은 못 친다
  const d = rig({ air: 60, off: [6, 10] });
  check('얹었다', tipHit(d.world), true);
  check('곧바로 또 치면 안 먹힌다', spike(d.world), false);
}

say('넘겨 주기 — 천천히 떨어지던 공도 높이 뜬다');
{
  // 들어온 세로 속도에만 걸어 두어서, 느린 공은 13px 뜨고 강타 세기로 평평하게 날아갔다.
  const lob = rig({ x: 500, air: 60, off: [6, -10], vy: 100, keys: { jump: true } });
  spike(lob.world);
  const plain = rig({ x: 500, air: 60, off: [6, -10], vy: 100 });
  spike(plain.world);
  ok('위로 LOB_UP 넘게', lob.b.ball.vy <= -700);
  ok('가로는 그냥 친 공보다 덜 간다', Math.abs(lob.b.ball.vx) < Math.abs(plain.b.ball.vx) * 0.7);
  note(`넘겨 주기 vx ${lob.b.ball.vx.toFixed(0)} vy ${lob.b.ball.vy.toFixed(0)} · 그냥 vx ${plain.b.ball.vx.toFixed(0)}`);
}

say('천장은 없다 — 가장 세게 올린 공도 화면 안에서 돌아온다');
{
  // 뛰어서 손끝에서 MAX_UP 으로 올려 본다 — 이 게임에서 제일 높이 뜨는 공이다.
  const world = mk(); world.state = 'play'; world.team = 0;
  const b = world.bag; b.started = true; b.wait = 0; b.serving = false;
  world.player.x = 100;
  b.ball.x = 400; b.ball.y = world.groundY - 61.5 - BODY_H; b.ball.vx = 0; b.ball.vy = -950;
  let top = b.ball.y, flipped = false, prev = b.ball.vy;
  for (let i = 0; i < 120; i++) {
    volley.update(world, 1 / 60);
    top = Math.min(top, b.ball.y);
    if (prev < -100 && b.ball.vy > 0) flipped = true;
    prev = b.ball.vy;
  }
  check('어디에도 부딪혀 꺾이지 않는다', flipped, false);
  ok('화면 위로 안 나간다', top - BALL_R > 0);
  note(`바닥 위 최고 ${(world.groundY - top).toFixed(0)}px (판 ${world.h})`);
}

done('배구');
