// 방에 들어가 게임이 갈아 끼워지는 길.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const net = await import(R + 'game/net.js');
const coop = (await import(R + 'games/coop.js')).default;

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

// 방장이 배구를 하던 중 ⌥M → 같이 하기 → 게임 바꾸기 → 똥피하기. 방장 쪽은 main.js 가 pickGame 을 부르고 결과를 지운다.
// 그 다음 스냅샷에 새 게임 이름이 실려 가고, 손님은 그걸 보고 갈아탄다.
say('방장이 하던 중에 게임을 바꾸면 손님도 따라간다');
{
  const host = w.createWorld({ ms: 0, dodged: 0 });
  host.onRecord = () => {}; host.onGameOver = () => {};
  w.resize(host, 1512, 944);
  w.pickGame(host, 'volley');
  const sent = []; const hshell = { net: { send: (m) => sent.push(m) }, log() {} };
  net.roleChanged(host, 'host', 'ZR95', 0, '방장');
  host.state = 'play';
  w.pickGame(host, 'dodge'); host.mp.results = null; host.mp.winner = null; host.mp.waiting = false;   // = onMenu('game:dodge')
  for (let i = 0; i < 4; i++) net.pump(host, 1 / 60, hshell);
  const snap = sent.filter((m) => m.t === 's').pop();
  check('방장 꾸러미에 새 게임 이름', snap?.g, 'dodge');
  check('방장은 시작 전 화면', snap?.st, 'ready');
  net.handleMessage(world, shell, 0, snap, { restart: w.restart, setSize: (a, b) => w.resize(world, a ?? 1512, b ?? 944) });
  check('손님도 똥피하기로 갈아탔다', world.gameId, 'dodge');
  check('손님도 시작 전 화면', world.state, 'ready');
  check('공은 사라졌다', world.bag.ball, undefined);
}

say('방장이 홈으로 나가면 손님은 시작 화면에서 기다리고, 같은 게임을 다시 골라도 첫 판으로 따라온다');
{
  const host = w.createWorld({ ms: 0, dodged: 0 }); host.onRecord = () => {}; host.onGameOver = () => {}; w.resize(host, 1512, 944);
  const guest = w.createWorld({ ms: 0, dodged: 0 }); guest.onRecord = () => {}; guest.onGameOver = () => {}; w.resize(guest, 1512, 944);
  const sent = []; const hshell = { net: { send: (m) => sent.push(JSON.parse(JSON.stringify(m))) }, log() {} };
  const gapi = { restart: w.restart, setSize: (a, b) => w.resize(guest, a ?? 1512, b ?? 944) };
  w.pickGame(host, 'coop'); net.roleChanged(host, 'host', 'ZR95', 0, '방장');
  w.pickGame(guest, 'coop'); net.roleChanged(guest, 'guest', 'ZR95', 7, '손님');
  const relay = () => { for (let i = 0; i < 4; i++) net.pump(host, 1 / 60, hshell); const s = sent.filter((m) => m.t === 's').pop(); net.handleMessage(guest, shell, 0, s, gapi); return s; };
  host.state = 'play'; host.stage = 3; w.restart(host); guest.state = 'play'; relay();
  check('손님도 4판째', guest.bag.stage, 3);
  w.goHome(host); const s1 = relay();
  check('방장 홈: 스냅샷', s1.st, 'pick');
  check('손님은 시작 화면에서 기다린다', guest.state, 'ready');
  w.pickGame(host, 'coop'); w.spread(host); const s2 = relay();
  check('같은 게임을 다시 골랐다 — 고른 횟수가 올랐다', s2.gs > s1.gs, true);
  check('손님도 첫 판으로 되돌아왔다', guest.bag.stage, 0);
  check('손님은 시작 전 화면', guest.state, 'ready');
  check('구경 표시가 아니다', guest.mp.waiting, false);
}

say('판 도중에 들어온 사람은 스스로 「구경」을 보고한다 — 방장은 그대로 전하고, 멀쩡한 사람은 안 덮는다');
{
  const host = w.createWorld({ ms: 0, dodged: 0 }); host.onRecord = () => {}; host.onGameOver = () => {}; w.resize(host, 1512, 944);
  const sent = []; const hshell = { net: { send: (m) => sent.push(JSON.parse(JSON.stringify(m))) }, log() {} };
  w.pickGame(host, 'coop'); net.roleChanged(host, 'host', 'ZR95', 0, '방장');
  for (const id of [1, 2, 3]) net.peerChanged(host, hshell, id, `손${id}`, true, { spread: w.spread });
  net.startRound(host, hshell, { restart: w.restart });
  check('판이 열렸다', host.state, 'play');
  // 판 도중에 들어온 손님(4)은 자기 세상에서 mp.waiting=true 이므로 스스로 state 2 를 보낸다 (myPacket)
  const late = w.createWorld({ ms: 0, dodged: 0 }); late.onRecord = () => {}; late.onGameOver = () => {}; w.resize(late, 1512, 944);
  w.pickGame(late, 'coop'); net.roleChanged(late, 'guest', 'ZR95', 4, '새손님');
  net.handleMessage(late, { net: { send() {} }, log() {} }, 0,
    { t: 's', ms: 0, st: 'play', r: 1, pl: [[0, 300, 0, 0, 0, 0, 1, 0, -1, 0, 0]], vw: 1512, vh: 944, g: 'coop', h: 0, x: coop.pack(host) },
    { restart: w.restart, setSize() {} });
  check('들어온 손님은 스스로 구경 상태', late.mp.waiting, true);
  let lateSent = null; const lshell = { net: { send: (m) => { if (Array.isArray(m)) lateSent = m; } }, log() {} };
  for (let i = 0; i < 3; i++) net.pump(late, 1 / 60, lshell);
  check('손님이 스스로 구경(2)으로 보고한다', lateSent[7], 2);
  // 방장이 그걸 받아 그대로 전한다
  net.handleMessage(host, hshell, 4, lateSent, { restart: w.restart, setSize() {} });
  const o = host.mp.others.get(4);
  check('방장 세상에서 구경하는 사람이다', o.waiting, true);
  // 명단에 있는 1 은 살아서 움직이고, 안 덮인다
  net.handleMessage(host, hshell, 1, ['p', 300, 0, 0, 0, 0, 1, 0, -1, 0, 0], { restart: w.restart, setSize() {} });
  for (let i = 0; i < 4; i++) net.pump(host, 1 / 60, hshell);
  const snap = sent.filter((m) => m.t === 's').pop();
  check('손님들에게도 구경(2)으로 간다', snap.pl.find((r) => r[0] === 4)[7], 2);
  check('명단에 있는 사람은 그대로 (0)', snap.pl.find((r) => r[0] === 1)[7], 0);
}

done('게임 갈아 끼우기');
