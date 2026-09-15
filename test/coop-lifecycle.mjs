import './dom-stub.mjs';
import { check, ok, say, done } from './check.mjs';
import * as w from '../src/game/world.js';
import * as net from '../src/game/net.js';
import { loadStage, rewind, stepObjects, T } from '../src/games/coop.js';

const DT = 1 / 60;

function room(gameId) {
  const count = gameId === 'trio' ? 3 : 4;
  const worlds = Array.from({ length: count }, (_, i) => {
    const world = w.createWorld({ ms: 0, dodged: 0 }, gameId);
    world.debug = true;
    net.roleChanged(world, i === 0 ? 'host' : 'guest', 'TEST', i + 1, `${i + 1}`);
    w.resize(world, 1512, 944);
    w.restart(world);
    return world;
  });
  const queue = [];
  let frame = 0;
  const shells = worlds.map((world) => ({ net: { send(message, to) {
    const targets = world.mp.role === 'host'
      ? worlds.filter((other) => other !== world && (to === undefined || to === other.mp.myId))
      : [worlds[0]];
    for (const target of targets) queue.push({ due: frame + target.mp.myId + world.mp.myId,
      target, from: world.mp.myId, message: structuredClone(message) });
  } } }));
  const api = (world) => ({ restart: w.restart, setSize: (width, height) => w.resize(world, width, height) });
  for (const [i, world] of worlds.entries()) {
    world.send = shells[i].net.send;
    for (const other of worlds) if (other !== world) {
      net.peerChanged(world, shells[i], other.mp.myId, `${other.mp.myId}`, true, { spread: w.spread });
    }
  }
  const advance = (frames, dropGo = false) => {
    for (let i = 0; i < frames; i++) {
      frame++;
      for (let j = queue.length - 1; j >= 0; j--) {
        const event = queue[j];
        if (event.due > frame) continue;
        queue.splice(j, 1);
        if (dropGo && event.message.t === 'go') continue;
        net.handleMessage(event.target, shells[event.target.mp.myId - 1], event.from, event.message, api(event.target));
      }
      for (const [j, world] of worlds.entries()) {
        w.update(world, DT);
        net.pump(world, DT, shells[j]);
      }
    }
  };
  return { worlds, host: worlds[0], shells, advance, api };
}

for (const gameId of ['coop', 'trio']) {
  say(`${gameId} - actual pump, delayed packets and resets`);
  const sim = room(gameId), { host, worlds, shells } = sim;
  const game = w.gameOf(host);
  // 스위치 a 가 있는 첫 판에서 — 되감은 뒤 옛 팀원 자리가 스위치를 다시 켜지 않는지 본다 (판을 다시 짜도 시험이 설 자리를 찾는다)
  const withSwitch = host.bag.stages.findIndex((s) => s.art.some((r) => r.includes('a')));
  const withBox = host.bag.stages.findIndex((s) => s.art.some((r) => /[xX]/.test(r)));
  host.stage = Math.max(0, withSwitch);
  net.startRound(host, shells[0], { restart: w.restart });
  sim.advance(80, true);
  ok('시작 메시지를 놓쳐도 스냅샷으로 전원 참가', worlds.every((world) => world.state === 'play' && !world.mp.waiting && !world.player.dead));
  ok('전원 같은 판 세대', worlds.every((world) => world.mp.stageEpoch === host.mp.stageEpoch));

  const delayedPosition = net.myPacket(worlds[1]);
  const delayedPush = { t: 'gm', k: 'push', i: 0, d: 1, ep: host.mp.stageEpoch };
  const oldEpoch = host.mp.stageEpoch;
  const oldSnapshot = { t: 's', sq: 0, g: gameId, st: 'play', r: host.mp.round, ms: 0, x: game.pack(host) };
  let b = host.bag;
  let switchAt;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.rows[y][x] === 'a') switchAt = { x, y };
  const other = host.mp.others.get(2);
  other.x = (switchAt.x + 0.5) * T;
  other.air = host.groundY - (switchAt.y + 1) * T;
  host.player.dead = true; host.player.deadFor = 0.4;
  host.player.rideId = 2; host.player.onPortal = true;
  b.pushWants.set(2, { i: 0, d: 1, t: 0.12 }); b.exitAsk = 0.2;
  rewind(host);
  ok('죽은 상태에서도 되감으면 즉시 살아난다', !host.player.dead && host.player.deadFor === 0);
  ok('탑승과 포탈 접촉 상태를 지운다', host.player.rideId === null && !host.player.onPortal);
  check('이전 밀기와 출구 요청을 지운다', [b.pushWants.size, b.exitAsk], [0, 0]);
  check('방장이 보는 팀원도 출발점으로', other.x, (b.spawn[1].x + 0.5) * T);
  stepObjects(host, DT);
  ok('지난 판 위치로 스위치가 다시 켜지지 않는다', !b.latched);
  net.handleMessage(host, shells[0], 2, delayedPosition, sim.api(host));
  check('늦게 온 이전 좌표를 버린다', other.baseX, (b.spawn[1].x + 0.5) * T);
  net.handleMessage(host, shells[0], 2, delayedPush, sim.api(host));
  check('늦게 온 이전 밀기를 버린다', b.pushWants.size, 0);
  sim.advance(80);
  ok('되감기 뒤 전원 같은 세대와 초기 스위치', worlds.every((world) => world.mp.stageEpoch === oldEpoch + 1 && !world.bag.latched));
  const before = worlds[1].mp.stageEpoch;
  net.handleMessage(worlds[1], shells[1], 1, oldSnapshot, sim.api(worlds[1]));
  check('과거 스냅샷으로 되돌아가지 않는다', worlds[1].mp.stageEpoch, before);

  for (const [i, stage] of host.bag.stages.entries()) {
    loadStage(host, i); game.stand(host, 0);
    for (const guest of worlds.slice(1)) game.unpack(guest, game.pack(host));
    const cameras = worlds.map((world) => game.camera(world, 1512, 944));
    ok(`${stage.name} - 시작 배경과 맵 크기 일치`, cameras.every((cam) => JSON.stringify(cam) === JSON.stringify(cameras[0]))
      && worlds.every((world) => world.w === host.w && world.h === host.h));
  }

  host.stage = 0;
  net.startRound(host, shells[0], { restart: w.restart });
  sim.advance(80);
  const exit = host.bag.exit;
  for (const [i, world] of worlds.entries()) {
    world.player.x = (exit.x + 0.5) * T + (i - (worlds.length - 1) / 2) * 35;
    world.player.air = world.groundY - (exit.y + 1) * T;
    world.player.vx = 0; world.player.vy = 0; world.player.grounded = true;
  }
  sim.advance(20);
  host.input.jump = true;
  sim.advance(5);
  host.input.jump = false;
  sim.advance(100);
  ok('실제 출구 입력으로 전원 다음 판에 도착', worlds.every((world) => world.bag.stage === 1 && !world.player.dead));
  ok('다음 판에서도 전원 같은 초기화 세대', worlds.every((world) => world.mp.stageEpoch === host.mp.stageEpoch));
  host.state = 'over';
  sim.advance(30);
  ok('종료 메시지 없이 스냅샷만으로 종료 동기화', worlds.every((world) => world.state === 'over'));
  host.state = 'play';

  b = host.bag;
  loadStage(host, 0); game.stand(host, 0);
  host.player.dead = true; host.player.deadFor = 0;
  for (let i = 0; i < 30; i++) w.update(host, DT);
  ok('사망 후 0.5초에는 아직 대기', host.player.dead);
  for (let i = 0; i < 20; i++) w.update(host, DT);
  ok('사망 후 0.8초가 지나면 부활', !host.player.dead);

  let plank;
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (!plank && b.rows[y][x] === 'v') plank = { x, y };
  if (plank) {
    host.player.x = (plank.x + 0.5) * T;
    host.player.air = host.groundY - (plank.y + 0.3) * T;
    b.rot.clear();
    stepObjects(host, DT);
    const key = `${plank.x},${plank.y}`;
    check('한 사람의 양발을 한 번만 센다', b.rot.get(key).t, DT);
    for (let i = 0; i < 15; i++) stepObjects(host, DT);
    check('0.27초에는 삭은 발판이 남는다', b.rot.get(key).gone, 0);
    for (let i = 0; i < 16; i++) stepObjects(host, DT);
    ok('0.5초가 지나면 삭은 발판이 부서진다', b.rot.get(key).gone > 0);
  }
  for (const direction of [-1, 1]) {
    loadStage(host, 0); game.stand(host, 0);
    const p = host.player;
    const startX = p.x;
    host.mp.others.clear();
    host.mp.others.set(2, { ...p, id: 2, groundY: host.groundY, x: startX + direction * 12, waiting: false });
    host.input.left = direction < 0;
    host.input.right = direction > 0;
    game.move(host, DT);
    ok(`겹친 동료에게 걸어도 반대 방향으로 밀리지 않는다 (${direction})`, (p.x - startX) * direction >= 0);
    host.input.left = false; host.input.right = false;
  }
  loadStage(worlds[1], Math.max(0, withBox)); game.stand(worlds[1], 0);
  const guest = worlds[1], guestBox = guest.bag.boxes[0];
  guest.player.x = guestBox.x;
  guest.player.air = guest.groundY - (guestBox.y - T);
  guest.player.grounded = true;
  const riderX = guest.player.x;
  const packed = game.pack(guest);
  packed.bx[0][0] += T;
  game.unpack(guest, packed);
  game.move(guest, DT);
  ok('손님도 동기화된 상자 위에서 함께 이동한다', guest.player.x > riderX);
  net.roleChanged(worlds[1], 'guest', 'NEXT', 2, '2');
  check('다른 방에 입장하면 수신 세대를 초기화', [worlds[1].mp.stageEpoch, worlds[1].mp.lastSnapshotSeq], [0, -1]);
}

done('협동 초기화');
