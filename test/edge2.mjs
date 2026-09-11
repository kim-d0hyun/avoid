// 있을 법한 경우의 수 ⑮~㉖.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const net = await import(R + 'game/net.js');
const { games } = await import(R + 'games/index.js');
const volley = games.find((g) => g.id === 'volley');

import { check, ok, say, done } from './check.mjs';
const shell = { net: { send() {} }, log() {} };
const api = (world) => ({ restart: w.restart, spread: w.spread,
  setSize: (a, b) => w.resize(world, a ?? world.w, b ?? world.h) });
function make(id='dodge', mp=false) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, id);
  world.onRecord=()=>{}; world.onDeath=()=>{}; world.onGameOver=()=>{}; world.onMenu=()=>{};
  w.resize(world, 1512, 944);
  if (mp) { world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1; }
  return world;
}
const peer = (id, x, o={}) => ({ id, name:`p${id}`, x, baseX:x, vx:0, air:0, vy:0, crouch:0,
  facing:1, walk:0, dead:false, waiting:false, deadFor:0, danger:false, age:0, errorX:0,
  state:0, grabbing:-1, escapes:0, seenEscapes:0, dodged:0, grabAim:0, groundY:0, ...o });
const tap = (world,a)=>{ w.press(world,a,true); w.press(world,a,false); };

say('⑮ 서로 동시에 붙잡으면');
{
  const world = make('dodge', true);
  world.state='play';
  const o = peer(2, world.player.x + 25); o.groundY = world.groundY;
  o.grabbing = 1;                        // 저쪽이 나를 잡았다
  world.mp.others.set(2, o);
  net.interpolate(world, 1/60);
  tap(world, 'grab');                    // 나도 동시에 눌렀다 → 뿌리치기가 된다
  ok('둘 다 잡은 상태로 안 엉킨다', !(world.player.grabbing >= 0 && world.player.heldBy >= 0));
}

say('⑯ 잡고 있던 사람이 방을 나가면');
{
  const world = make('dodge', true);
  world.state='play';
  const o = peer(2, world.player.x + 25); o.groundY = world.groundY;
  world.mp.others.set(2, o);
  w.press(world, 'grab', true);          // **누르고 있는다.** 떼면 놓는 게 지금 규칙이다
  check('잡았다', world.player.grabbing, 2);
  net.peerChanged(world, shell, 2, 'p2', false, api(world));
  for (let i=0;i<10;i++){ world.bag.poops.length=0; w.update(world,1/60); }
  check('손이 풀렸다', world.player.grabbing, -1);
  ok('안 터진다', Number.isFinite(world.player.x));
}

say('⑰ 잡고 있는데 내가 죽으면');
{
  const world = make('dodge', true);
  world.state='play';
  const o = peer(2, world.player.x + 25); o.groundY = world.groundY;
  world.mp.others.set(2, o);
  w.press(world, 'grab', true);
  w.kill(world);
  for (let i=0;i<10;i++){ world.bag.poops.length=0; w.update(world,1/60); }
  check('손이 풀렸다', world.player.grabbing, -1);
}

say('⑱ 배구 도중 한 편이 통째로 나가면');
{
  const world = make('volley', true);
  world.bag.started = true; world.state='play'; world.team = 0; world.player.x = 300;
  world.mp.others.set(2, peer(2, 1200, { groundY: world.groundY }));
  ok('처음엔 양쪽에 사람이 있다', volley.blocked(world) === null);
  net.peerChanged(world, shell, 2, 'p2', false, api(world));
  ok('한쪽이 비었다고 말한다', typeof volley.blocked(world) === 'string');
  let ended = false;
  world.onGameOver = (r) => { ended = true; check('이긴 편 없이 끝난다', r.name, null); };
  for (let i=0;i<60;i++) w.update(world,1/60);
  ok('빈 코트로 계속 돌지 않고 판을 접는다', ended);
  ok('점수를 쌓지 않았다', world.bag.score[0] + world.bag.score[1] === 0);
  ok('그래도 안 터진다', Number.isFinite(world.bag.ball.x));
}

say('⑲ 게임을 빠르게 여러 번 갈아 끼워도');
{
  const world = make('dodge');
  for (let k=0;k<6;k++) {
    w.pickGame(world, k%2 ? 'volley' : 'dodge');
    tap(world,'jump');
    for (let i=0;i<20;i++){ if (world.bag.poops) world.bag.poops.length=0; w.update(world,1/60); }
  }
  ok('살아 있다', Number.isFinite(world.player.x));
  ok('살림살이가 게임과 맞다', world.gameId === 'dodge' ? !!world.bag.poops : !!world.bag.ball);
}

say('⑳ 공이 한 프레임에 두 사람에게 닿으면');
{
  const world = make('volley', true);
  world.state='play'; world.bag.started=true; world.bag.wait=0; world.team=0;
  world.player.x = 400; world.player.air = 0;
  world.mp.others.set(2, peer(2, 402, { groundY: world.groundY }));
  world.bag.ball.x = 401; world.bag.ball.y = world.groundY - 40; world.bag.ball.vy = 600;
  w.update(world, 1/60);
  ok('한 번만 튕긴다 (위로)', world.bag.ball.vy < 0);
  ok('말도 안 되게 빠르지 않다', Math.abs(world.bag.ball.vy) < 3000);
}

say('㉑ 판 크기를 모르는 채로 굴려도');
{
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'volley');
  world.onRecord=()=>{}; world.onGameOver=()=>{};
  world.state = 'play';
  for (let i=0;i<10;i++) w.update(world, 1/60);      // resize 를 아직 안 불렀다
  ok('안 터진다', true);
  w.resize(world, 1512, 944);
  for (let i=0;i<30;i++) w.update(world, 1/60);
  ok('그 뒤에도 성하다', Number.isFinite(world.bag.ball.x));
}

say('㉒ 내 번호가 편 명단에 없으면');
{
  const world = make('volley');
  net.roleChanged(world, 'guest', 'AB12', 9, '나');
  net.handleMessage(world, shell, 0, { t:'s', ms:1000, st:'play', r:1,
    pl: [[0,400,0,0,0,0,1,0,-1,0,0]], vw:1512, vh:944, g:'volley',
    x: { tm: [[0,0],[5,1]], b:[700,300,0,0,0,0], s:[0,0], w:0 } }, api(world));
  ok('편이 성한 값', world.team === undefined || world.team === 0 || world.team === 1);
  for (let i=0;i<20;i++) w.update(world,1/60);
  ok('안 터진다', Number.isFinite(world.player.x));
}

say('㉓ 슬라이딩으로 벽에 박으면');
{
  const world = make('volley');
  world.state='play'; world.team=0; world.player.x = 40; world.player.air = 0;
  world.bag.started=true; world.bag.wait=0;
  world.bag.ball.x = -300;                       // 왼쪽 멀리
  tap(world,'grab');
  for (let i=0;i<40;i++) w.update(world,1/60);
  ok('벽 안쪽', world.player.x >= 18);
  ok('미끄러짐이 끝났다', world.player.slide === 0);
}

say('㉔ 아주 오래 굴려도 (시계·자국)');
{
  const world = make('dodge');
  world.state='play';
  for (let i=0;i<60*120;i++){ world.bag.poops.length=0; world.player.dead=false; w.update(world,1/60); }
  ok('시계가 성하다', Number.isFinite(world.elapsed) && world.elapsed > 100);
  ok('자국이 안 쌓인다', world.bag.splats.length <= 48);
}

say('㉕ 방장이 혼자일 때 판 끝내기');
{
  const world = make('volley', true);
  world.state='play';
  net.endRound(world, shell, { winner: { id: -1, name: '빨강 팀' }, results: [] });
  check('끝났다', world.state, 'over');
  for (let i=0;i<60;i++) w.update(world,1/60);
  ok('세리머니가 돈다', world.overFor > 0);
}

say('㉖ 고르는 화면에서 메뉴를 열고 게임 바꾸기');
{
  const world = make('dodge');
  check('고르는 화면', world.state, 'pick');
  tap(world,'menu');
  ok('메뉴가 열린다', world.menu.open);
  const labels = w.menuItems(world).map((i)=>i.id);
  ok('방 만들기가 없다', !labels.includes('host'));
  ok('코드로 입장이 없다', !labels.includes('join'));
  ok('게임 바꾸기도 없다 (이미 고르는 중)', !labels.includes('pick'));
  ok('끝내기는 있다', labels.includes('quit'));
  tap(world,'left');
  ok('닫힌다', !world.menu.open);
  check('여전히 고르는 화면', world.state, 'pick');
}

done('경우의 수 ⑮~㉖');
