// 방에 들어가 게임이 갈아 끼워지는 길.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const net = await import(R + 'game/net.js');

import { check, say, done } from './check.mjs';

// 똥피하기를 혼자 한창 하고 있다
const world = w.createWorld({ ms: 0, dodged: 0 });
world.onRecord = () => {}; world.onGameOver = () => {};
w.resize(world, 1512, 944);
w.press(world, 'right', true); w.press(world, 'right', false);   // 똥피하기 고름
w.press(world, 'jump', true); w.press(world, 'jump', false);     // 시작
for (let i = 0; i < 60 * 4; i++) { if (i % 20 === 0) world.bag.poops.length = 0; w.update(world, 1/60); }
say('배구방에 들어가기 전');
check('게임', world.gameId, 'dodge');
check('판이 돌고 있다', world.state, 'play');
check('똥이 떠 있다', world.bag.poops.length > 0, true);

// ⌥M → 코드로 입장. 셸이 역할을 알려 주고, 곧 방장 꾸러미가 온다.
const shell = { net: { send() {} }, log() {} };
net.roleChanged(world, 'guest', 'ZR95', 7, '범창');
say('방에 들어간 직후');
check('손님이 됐다', world.mp.role, 'guest');

// 방장이 배구를 하고 있다고 알려 온다
net.handleMessage(world, shell, 0, {
  t: 's', ms: 12000, st: 'play', r: 3, pl: [[0, 400, 0, 0, 0, 0, 1, 0, -1, 0, 0]],
  vw: 1512, vh: 944, g: 'volley',
  x: { tm: [[0, 0], [7, 1]], b: [800, 400, 120, -300, 0, 0], s: [2, 1], w: 0 },
}, { restart: w.restart, setSize: (a, b) => w.resize(world, a ?? 1512, b ?? 944) });

say('방장 꾸러미를 한 번 받은 뒤');
check('배구로 갈아탔다', world.gameId, 'volley');
check('똥은 사라졌다', world.bag.poops, undefined);
check('공이 생겼다', typeof world.bag.ball, 'object');
check('방장 점수를 받았다', world.bag.score, [2, 1]);
check('내 편도 받았다', world.team, 1);
for (let i = 0; i < 30; i++) w.update(world, 1/60);
check('공이 움직인다', Number.isFinite(world.bag.ball.x) && world.bag.ball.x !== 0, true);
check('바로 판을 본다 (구경)', world.state, 'play');
check('이번 판에는 안 낀다', [world.mp.waiting, world.player.dead], [true, true]);

done('게임 갈아 끼우기');
