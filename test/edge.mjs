// 있을 법한 경우의 수 ①~⑭.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const net = await import(R + 'game/net.js');
const { games } = await import(R + 'games/index.js');
const volley = games.find((g) => g.id === 'volley');

import { check, ok, say, done } from './check.mjs';

const api = (world) => ({ restart: w.restart, spread: w.spread,
  setSize: (a, b) => w.resize(world, a ?? world.w, b ?? world.h) });
const shell = { net: { send() {} }, log() {} };

function make(gameId = 'dodge') {
  const world = w.createWorld({ ms: 0, dodged: 0 }, gameId);
  world.onRecord = () => {}; world.onDeath = () => {}; world.onGameOver = () => {};
  world.onMenu = () => {};
  w.resize(world, 1512, 944);
  return world;
}
const tap = (world, a) => { w.press(world, a, true); w.press(world, a, false); };
const snap = (world, over = {}) => net.handleMessage(world, shell, 0, {
  t: 's', ms: 5000, st: 'play', r: 1, pl: [[0, 400, 0, 0, 0, 0, 1, 0, -1, 0, 0]],
  vw: 1512, vh: 944, g: world.gameId, ...over,
}, api(world));

say('① 방을 나가면 혼자로 돌아온다');
{
  const world = make('volley');
  net.roleChanged(world, 'guest', 'AB12', 3, '나');
  snap(world, { g: 'volley', x: { tm: [[0,0],[3,1]], b: [700,300,0,0,0,0], s: [1,2], w: 0 } });
  ok('배구 중', world.gameId === 'volley' && world.state === 'play');
  net.roleChanged(world, 'off', null, 0, '나');
  w.update(world, 1/60);
  check('혼자로', world.mp.on, false);
  ok('탈 안 남', Number.isFinite(world.player.x));
}

say('② 방장이 판 도중에 게임을 바꾸면 손님도 따라온다');
{
  const world = make('dodge');
  net.roleChanged(world, 'guest', 'AB12', 3, '나');
  snap(world);
  ok('똥피하기 구경 중', world.gameId === 'dodge' && world.state === 'play');
  snap(world, { g: 'volley', x: { tm: [[0,0],[3,1]], b: [700,300,0,0,0,0], s: [0,0], w: 0 } });
  check('배구로 따라왔다', world.gameId, 'volley');
  for (let i = 0; i < 30; i++) w.update(world, 1/60);
  ok('공이 성하다', Number.isFinite(world.bag.ball.x));
}

say('③ 구경하는 사람은 공을 못 친다');
{
  const world = make('volley');
  net.roleChanged(world, 'guest', 'AB12', 3, '나');
  snap(world, { x: { tm: [[0,0],[3,1]], b: [700,300,0,0,0,0], s: [0,0], w: 0 } });
  world.mp.waiting = true; world.player.dead = true;
  const before = { ...world.bag.ball };
  tap(world, 'grab');
  check('공이 그대로', [world.bag.ball.vx, world.bag.ball.vy], [before.vx, before.vy]);
}

say('④ 죽은 사람은 슬라이딩도 못 한다');
{
  const world = make('volley');
  world.state = 'play'; world.bag.started = true; world.bag.wait = 0;
  world.player.dead = true;
  world.bag.ball.x = world.player.x + 300;
  tap(world, 'grab');
  check('안 미끄러진다', world.player.slide, 0);
}

say('⑤ 똥피하기에서는 편 고르기가 안 보인다');
{
  const world = make('dodge');
  tap(world, 'menu');
  ok('편 고르기 없음', !w.menuItems(world).some((i) => i.id === 'team'));
  const v = make('volley');
  v.state = 'ready';                       // 고르는 화면 말고 판 안에서
  tap(v, 'menu');
  ok('배구에는 있음', w.menuItems(v).some((i) => i.id === 'team'));
}

say('⑥ 하위 메뉴를 보는 중에 목록이 줄어도 안 터진다');
{
  const world = make('volley');
  world.screens = [{ number: 1, name: 'A', w: 1, h: 1, current: true },
                   { number: 2, name: 'B', w: 1, h: 1, current: false }];
  tap(world, 'menu');
  world.menu.sub = 'screens'; world.menu.index = 1;
  world.screens = [];                       // 모니터를 뽑았다
  const items = w.menuItems(world);
  ok('목록이 첫 화면으로', items[0].id === 'resume');
  tap(world, 'right');                      // 그 상태로 확인을 눌러도
  ok('안 터진다', true);
}

say('⑦ 판을 다시 시작해도 편·투명도·화면·게임이 남는다');
{
  const world = make('volley');
  world.team = 1; world.fade = 0.7;
  world.screens = [{ number: 9, name: 'X', w: 1, h: 1, current: true }];
  w.restart(world);
  check('편', world.team, 1);
  check('투명도', world.fade, 0.7);
  check('화면 목록', world.screens.length, 1);
  check('게임', world.gameId, 'volley');
}

say('⑧ 배구에서 붙잡기 키가 붙잡기로 새지 않는다');
{
  const world = make('volley');
  world.mp.on = true; world.mp.myId = 1; world.state = 'play';
  world.mp.others.set(2, { id: 2, x: world.player.x + 20, air: 0, dead: false, waiting: false,
                           grabbing: -1, escapes: 0, seenEscapes: 0, name: 'x', groundY: world.groundY });
  tap(world, 'grab');
  check('아무도 안 잡았다', world.player.grabbing, -1);
}

say('⑨ 공이 네트 꼭대기 선에 정확히 떨어져도 점수가 갈린다');
{
  const world = make('volley');
  world.state = 'play'; world.bag.started = true; world.bag.wait = 0;
  world.player.x = 100;
  world.bag.ball.x = world.w / 2; world.bag.ball.y = world.groundY - 5; world.bag.ball.vy = 400;
  w.update(world, 1/60);
  ok('한쪽이 점수를 얻었다', world.bag.score[0] + world.bag.score[1] === 1);
}

say('⑩ 사람이 없는 방에서 판이 끝나도 안 터진다');
{
  const world = make('dodge');
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1; world.state = 'play';
  net.checkRoundOver(world, shell);
  ok('혼자면 판을 안 끝낸다', world.state === 'play');
}

say('⑪ 창을 숨겼다 켜도 입력이 안 굳는다');
{
  const world = make('dodge');
  world.state = 'play';
  w.press(world, 'right', true);
  ok('달리는 중', world.input.right);
  tap(world, 'menu');                        // 메뉴를 열면 잡은 키를 놓은 것으로 친다
  check('키가 풀렸다', world.input.right, false);
}

say('⑫ 판 크기가 바뀌어도 사람이 화면 밖으로 안 나간다');
{
  const world = make('dodge');
  world.state = 'play'; world.player.x = 1500;
  w.resize(world, 800, 600);
  ok('안쪽에 있다', world.player.x <= 800 - 20);
}

say('⑬ 배구에서 판 크기가 바뀌어도 코트를 안 벗어난다');
{
  const world = make('volley');
  world.state = 'play'; world.team = 1; world.player.x = 1400;
  w.resize(world, 800, 600);
  for (let i = 0; i < 10; i++) w.update(world, 1/60);
  ok('오른쪽 코트 안', world.player.x > 400 && world.player.x < 800);
}

say('⑭ 손님이 깨진 꾸러미를 받아도 안 터진다');
{
  const world = make('volley');
  net.roleChanged(world, 'guest', 'AB12', 3, '나');
  for (const junk of [{ t: 's' }, { t: 's', pl: [] }, { t: 's', pl: [], x: {} },
                      { t: 's', pl: [], x: { b: [] } }, { t: 'gm' }, { t: 'over' }]) {
    net.handleMessage(world, shell, 0, junk, api(world));
  }
  for (let i = 0; i < 10; i++) w.update(world, 1/60);
  ok('살아 있다', Number.isFinite(world.player.x));
}

done('경우의 수 ①~⑭');
