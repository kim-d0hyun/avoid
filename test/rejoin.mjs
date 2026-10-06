// 드나들기 — 나갔다 다시 들어오기 · 초대받아 들어오기 · 판 도중에 들어오기 · 방장 혼자 남기.
//
// 방장과 손님을 **따로 굴리고** 꾸러미를 실제처럼 주고받는다 (net.js 의 pump / handleMessage 그대로).
// 셸(main.swift)이 하는 일도 흉내 낸다 — 방장 번호는 0, 손님은 들어올 때마다 새 번호를 받는다.
// 나갈 때 손님은 역할이 off 가 되어 홈으로 가고(main.js onRole), 방장은 「나갔다」를 듣는다.
//
//   node test/rejoin.mjs

import './dom-stub.mjs';
import { check, ok, say, note, done } from './check.mjs';
import * as w from '../src/game/world.js';
import * as net from '../src/game/net.js';

const DT = 1 / 60;
const LAG = 3;

/// 방 하나. 방장 world 하나와 손님 자리들. 손님은 넣고 뺄 수 있다.
export function room(gameId) {
  let frame = 0;
  let nextId = 1;
  const queue = [];
  const guests = new Map();         // id → world
  const shellOf = new Map();        // world → shell
  let host = null;

  function make() {
    const world = w.createWorld({ ms: 0, dodged: 0 }, gameId);
    world.onRecord = () => {}; world.onDeath = (r) => net.reportDeath(world, shellOf.get(world), r);
    world.onGameOver = (r) => { if (world.mp.role === 'host') net.endRound(world, shellOf.get(world), { winner: r?.side !== undefined ? { side: r.side, name: r.name } : null, results: r?.rows }); };
    world.onMenu = (a) => {
      if (a === 'again') world.mp.on ? net.startRound(world, shellOf.get(world), { restart: w.restart }) : w.restart(world);
    };
    w.resize(world, 1512, 944);
    w.pickGame(world, gameId);
    const shell = { debug: false, log() {}, net: { send(message, to) {
      const me = world.mp.myId;
      const targets = world.mp.role === 'host'
        ? [...guests.entries()].filter(([id]) => to === undefined || to === id).map(([, g]) => g)
        : world.mp.role === 'guest' ? [host] : [];
      for (const target of targets) {
        queue.push({ due: frame + LAG, target, from: me, message: structuredClone(message) });
      }
    } } };
    world.send = shell.net.send;
    shellOf.set(world, shell);
    return world;
  }
  host = make();
  net.roleChanged(host, 'host', 'TEST', 0, '방장');

  const api = (world) => ({ restart: w.restart, spread: w.spread,
                            setSize: (a, b) => w.resize(world, a ?? world.w, b ?? world.h) });

  /// 손님이 들어온다 (초대를 받아서든 코드를 쳐서든 셸에서는 같은 길이다). world 를 주면 그 앱이 다시 들어온다.
  function join(world = make(), name = `손님${nextId}`) {
    const id = nextId++;
    guests.set(id, world);
    const wasOn = world.mp.on;
    net.roleChanged(world, 'guest', 'TEST', id, name);
    if (world.state === 'ready') w.spread(world);
    void wasOn;
    net.peerChanged(world, shellOf.get(world), 0, '방장', true, api(world));
    for (const [other, g] of guests) {
      if (other !== id) net.peerChanged(world, shellOf.get(world), other, g.mp.myName, true, api(world));
    }
    net.peerChanged(host, shellOf.get(host), id, name, true, api(host));
    return world;
  }

  /// 손님이 나간다. 그 손님 앱은 역할이 off 가 되어 홈으로 간다 (main.js onRole 과 같다).
  function leave(world) {
    const id = world.mp.myId;
    guests.delete(id);
    net.roleChanged(world, 'off', null, 0, world.mp.myName);
    w.leftRoom(world);
    net.peerChanged(host, shellOf.get(host), id, world.mp.myName, false, api(host));
    // 가는 중이던 꾸러미는 버린다 (줄이 끊겼다)
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].target === world || queue[i].from === id) queue.splice(i, 1);
  }

  /// 앞으로 n 프레임. inputs 는 프레임마다 world → input 을 준다.
  function advance(n, each = null) {
    for (let i = 0; i < n; i++) {
      frame++;
      for (let j = 0; j < queue.length; j++) {
        const e = queue[j];
        if (e.due > frame) continue;
        queue.splice(j--, 1);
        if (e.target !== host && !guests.has(e.target.mp.myId)) continue;
        net.handleMessage(e.target, shellOf.get(e.target), e.from, e.message, api(e.target));
      }
      each?.(i);
      for (const world of [host, ...guests.values()]) {
        w.update(world, DT);
        net.interpolate(world, DT);
        net.pump(world, DT, shellOf.get(world));
      }
    }
  }
  /// 방장이 ⌥R 을 누른다 (판 시작 · 다음 판).
  const again = () => host.onMenu('again');

  /// **방장이 나가고 heir 가 넘겨받는다** (net.swift migrate 와 같은 순서). 셸은 heir 에게 방장 역할을,
  /// 나머지에게는 heir 방에 다시 붙은 새 번호를 준다. 옛 방장 앱은 하던 게임에 혼자 남는다.
  function promote(heir) {
    const old = host;
    net.roleChanged(old, 'off', null, 0, old.mp.myName); w.leftRoom(old);
    queue.length = 0;
    const rest = [...guests.values()].filter((g) => g !== heir);
    guests.clear();
    host = heir;
    net.roleChanged(heir, 'host', 'TEST', 0, heir.mp.myName);
    nextId = 1;
    for (const g of rest) join(g, g.mp.myName);
    return heir;
  }
  return { get host() { return host; }, guests, join, leave, advance, again, shellOf, promote };
}

if (process.env.REJOIN_LIB) { /* 시험 틀만 빌려 쓴다 */ } else {
/// 손님이 오른쪽(또는 왼쪽)으로 걸으면 **방장 화면에서도** 그 사람이 움직이나.
function moves(r, guest, frames = 40) {
  // 양쪽으로 걸어 본다 — 자리는 무작위라 벽이나 서브 선에 붙어 설 때가 있다(그쪽으로는 못 간다).
  const id = guest.mp.myId;
  let best = { self: 0, seen: 0 };
  for (const dir of ['left', 'right']) {
    const before = r.host.mp.others.get(id)?.x;
    const mine0 = guest.player.x;
    guest.input[dir] = true;
    r.advance(frames);
    guest.input[dir] = false;
    r.advance(10);
    const after = r.host.mp.others.get(id)?.x;
    const got = { self: Math.abs(guest.player.x - mine0), seen: Math.abs((after ?? 0) - (before ?? 0)) };
    if (got.self > best.self) best = got;
  }
  return best;
}

/// 사람이 판에 끼어 있나 — 구경이 아니고, 살아 있고, 판이 돈다.
const inPlay = (world) => world.state === 'play' && !world.mp.waiting && !world.player.dead;
const state = (world) => `${world.state}${world.mp.waiting ? '·구경' : ''}${world.player.dead ? '·죽음' : ''}`;

// 판 도중에 들어오면 **바로 끼는** 게임과, 다음 판까지 구경하는 게임(똥피하기 — 안 보이던 똥에 맞는다).
const ANYTIME = ['volley', 'ball', 'omok', 'alk', 'yut', 'fence', 'bumper'];
const ALL = [...ANYTIME, 'dodge'];
const wait = (r, test, max = 300) => { for (let i = 0; i < max && !test(); i++) r.advance(1); return test(); };

for (const gameId of ALL) {
  const anytime = ANYTIME.includes(gameId);
  say(`${gameId} — 1:1 하다 손님이 나갔다가 다시 들어온다 (초대받아 같은 앱으로)`);
  {
    const r = room(gameId);
    const g = r.join();
    r.advance(30); r.again(); r.advance(90);
    ok('둘 다 판에 들어갔다', inPlay(r.host) && inPlay(g));
    r.leave(g);
    r.advance(120);
    // 나간 손님은 **하던 게임에 혼자 남는다** (홈으로 보냈더니 방향키가 메뉴를 움직여 캐릭터가 굳어 보였다)
    ok('나간 손님은 하던 게임의 시작 전 화면에 혼자 남는다', g.state === 'ready' && g.gameId === gameId && !g.mp.on);
    ok('남은 방장은 안 굳는다', r.host.state === 'play' || r.host.state === 'over' || r.host.state === 'ready');
    r.join(g);
    if (anytime) {
      ok('⌥R 없이 바로 낀다', wait(r, () => inPlay(r.host) && inPlay(g)));
      if (gameId === 'volley') {
        const m = moves(r, g);
        ok('다시 들어온 손님이 움직이고 방장 화면에도 보인다', m.self > 30 && m.seen > 30);
      }
    } else {
      wait(r, () => r.host.state !== 'play', 600);
      r.again();
      ok('방장이 다음 판을 열면 같이 낀다', wait(r, () => inPlay(r.host) && inPlay(g)));
    }
  }

  say(`${gameId} — 혼자 연 방에 판 도중 새 사람이 들어온다`);
  {
    const r = room(gameId);
    r.advance(10); r.again(); r.advance(60);
    const g = r.join();
    if (anytime) ok('바로 낀다', wait(r, () => inPlay(g)));
    else {
      ok('다음 판까지는 구경', wait(r, () => g.state === 'play' && g.mp.waiting));
      wait(r, () => r.host.state !== 'play', 600); r.again();
      ok('다음 판엔 낀다', wait(r, () => inPlay(g)));
    }
  }

  say(`${gameId} — 시작 전 화면에서 나갔다 들어온다`);
  {
    const r = room(gameId);
    const g = r.join();
    r.advance(30);
    r.leave(g); r.advance(30);
    r.join(g); r.advance(30);
    ok('둘 다 시작 전 화면', r.host.state === 'ready' && g.state === 'ready');
    r.again();
    ok('⌥R 로 같이 시작한다', wait(r, () => inPlay(r.host) && inPlay(g)));
  }

  say(`${gameId} — 1:1 에 셋째가 들어온다`);
  {
    const r = room(gameId);
    const a = r.join(); r.advance(30); r.again(); r.advance(90);
    const c = r.join();
    if (anytime) ok('셋째도 바로 낀다', wait(r, () => inPlay(c) && inPlay(a) && inPlay(r.host)));
    else ok('셋째는 구경, 나머지는 그대로', wait(r, () => c.mp.waiting && inPlay(a)));
  }

  say(`${gameId} — 방장이 나가 방이 깨진다`);
  {
    const r = room(gameId);
    const g = r.join(); r.advance(30); r.again(); r.advance(60);
    // 셸이 손님에게 「방이 깨졌다」를 알린다 — 역할이 off 가 되고 홈으로
    net.roleChanged(g, 'off', null, 0, g.mp.myName); w.leftRoom(g);
    r.guests.delete(g.mp.myId);
    for (let i = 0; i < 60; i++) w.update(g, DT);
    ok('손님은 하던 게임에 혼자 남는다', g.state === 'ready' && g.gameId === gameId && !g.mp.on && !g.mp.waiting);
    const x0 = g.player.x;
    const dir = g.player.x < g.w / 2 ? 'left' : 'right';
    w.press(g, dir, true); for (let i = 0; i < 40; i++) w.update(g, DT); w.press(g, dir, false);
    ok('바로 걸을 수 있다 (방향키 하나로 혼자 이어 한다)', Math.abs(g.player.x - x0) > 30 || !['volley', 'dodge'].includes(gameId));
  }
}

say('둘이 오래 가만히 있다가 한 사람이 나가면 — 남은 사람이 움직이나');
for (const gameId of ['volley', 'dodge', 'coop', 'trio', 'fence']) {
  for (const who of ['손님이 나감', '방장이 나감']) {
    const r = room(gameId);
    const g = r.join();
    if (gameId === 'coop') { r.join(); r.join(); }
    if (gameId === 'trio') r.join();
    r.advance(30); r.again(); r.advance(60);
    r.advance(60 * 60);                           // 1분 동안 아무도 아무것도 안 한다
    const stay = who === '손님이 나감' ? r.host : g;
    const before = state(stay);
    if (who === '손님이 나감') r.leave(g);
    else { net.roleChanged(g, 'off', null, 0, g.mp.myName); w.leftRoom(g); r.guests.delete(g.mp.myId); }
    r.advance(90);
    const x0 = stay.player.x;
    // 남은 사람이 걷는다 — 판이 끝나 있으면 아무 방향키나 눌러 다시 연다(사람이 하는 대로)
    // 네트 반대쪽으로 걷는다 — 서브를 들고 있으면 네트 쪽은 서브 선에 막힌다(그건 규칙이다).
    const dir = stay.player.x < stay.w / 2 ? 'left' : 'right';
    w.press(stay, dir, true); r.advance(2); w.press(stay, dir, false);
    r.advance(30);
    w.press(stay, dir, true); r.advance(60); w.press(stay, dir, false);
    const moved = Math.abs(stay.player.x - x0);
    note(`${gameId} · ${who} — 나가기 전 ${before} → 뒤 ${state(stay)} · 걸은 거리 ${moved.toFixed(0)}px`);
    ok(`${gameId} · ${who} — 남은 사람이 움직인다`, moved > 30 || stay.state === 'pick');
  }
}

say('차례인 사람이 나가도 판이 이어진다 (컴퓨터가 받는다)');
for (const gameId of ['omok', 'alk', 'yut', 'ball']) {
  const r = room(gameId);
  const g = r.join(); r.advance(30); r.again(); r.advance(60);
  const before = JSON.stringify(w.gameOf(r.host).pack(r.host)).length;
  // **손님 차례로 만들어 두고** 나가게 한다 — 그 차례를 아무도 안 받으면 판이 멎는다.
  if (gameId !== 'ball' && r.host.bag.turn !== undefined) r.host.bag.turn = (r.host.team ?? 0) === 0 ? 1 : 0;
  r.advance(5);
  r.leave(g);
  // 손님 차례였든 아니든, 10초 안에 판이 움직이면(주고받은 꾸러미가 달라지면) 안 멎은 것이다.
  const snap = () => JSON.stringify({ ...w.gameOf(r.host).pack(r.host), gg: 0, fy: 0, sy: 0 });
  const s0 = snap();
  let moved = false;
  for (let i = 0; i < 600 && !moved; i++) { r.advance(1); moved = snap() !== s0; }
  // 방장 차례면 방장이 둘 때까지 기다리는 게 맞다 — 그건 멎음이 아니다.
  const turn = w.gameOf(r.host);
  const hostTurn = (await import(`../src/games/${{ alk: 'alkkagi', ball: 'baseball' }[gameId] ?? gameId}.js`)).whoseTurn?.(r.host)?.mine;
  note(`${gameId} — 나간 뒤 차례: ${hostTurn ? '방장' : '컴퓨터/손님 편'} · 판 ${r.host.state} · ${r.host.bag.phase ?? ''}`);
  ok(`${gameId} — 손님이 나간 뒤에도 판이 움직인다 (방장 차례면 기다린다)`, moved || hostTurn);
  void before; void turn;
}

say('방장이 나가면 남은 사람 중 한 명이 방장을 넘겨받는다 — 판이 이어진다');
for (const gameId of ANYTIME) {
  const r = room(gameId);
  const a = r.join(), b = r.join();
  r.advance(30); r.again(); r.advance(90);
  ok(`${gameId} — 셋이 판에`, inPlay(r.host) && inPlay(a) && inPlay(b));
  r.promote(a);
  r.advance(120);
  ok(`${gameId} — 넘겨받은 사람이 방장이고 판이 그대로다`, a.mp.role === 'host' && a.state === 'play');
  ok(`${gameId} — 옛 방장 장부는 비웠다 (옛 번호가 안 남는다)`, [...a.mp.others.keys()].every((id) => id === b.mp.myId));
  ok(`${gameId} — 다시 붙은 사람이 바로 낀다`, wait(r, () => inPlay(b) && inPlay(a)));
  if (gameId === 'volley') {
    const m = moves(r, b);
    ok('volley — 다시 붙은 사람이 움직이고 새 방장 화면에도 보인다', m.self > 30 && m.seen > 30);
  }
}

say('배구 — 서브를 들고 있던 손님이 나가면 빈 코트가 저절로 올린다');
{
  const r = room('volley');
  const g = r.join(); r.advance(30); r.again(); r.advance(60);
  const b = r.host.bag;
  // 손님 쪽(파랑) 서브로 만든다
  b.serving = true; b.serveBy = g.team ?? 1; b.wait = 0;
  r.leave(g);
  ok('서브가 올라간다', wait(r, () => !r.host.bag.serving, 300));
  r.join(g);
  ok('다시 들어오면 바로 낀다', wait(r, () => inPlay(g)));
}

done('드나들기');
}
