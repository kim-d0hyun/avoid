// 같이 하기. 셸이 날라 주는 문자열에 규칙을 입히는 층이다.
//
// 나눠 갖는 방식:
//   · 방장이 똥을 뿌린다. 뿌릴 때 초기값(자리·속도·회전)을 통째로 보내고, 그다음부터는
//     각자 똑같은 물리로 굴린다. 20Hz 스냅샷으로 좌표를 따라가게 하면 뚝뚝 끊긴다.
//   · **자기 몸은 자기가 굴린다.** 방장에게 물어보고 움직이면 손끝이 무거워진다.
//   · **부딪힘도 각자 푼다.** 겹쳐도 되는 물렁한 충돌이라, 두 화면의 계산이 조금 달라도
//     아무도 못 알아챈다. 권한을 한쪽에 몰아 두면 서로 튕기는 고무줄이 생긴다.
//   · 맞았는지는 **자기 화면 기준**으로 판정한다. 내가 본 그림대로 죽어야 억울하지 않다.

// world.js 와 서로를 부르는 모양이 되지만, 값을 읽는 건 모듈이 다 올라온 뒤(호출 시점)라
// 문제가 없다. 밀쳐 내는 세기는 물리 상수라 world.js 한 곳에만 둔다.
import { ESCAPE_SHOVE, gameOf, pickGame, say } from './world.js';
import { games } from '../games/index.js';

const SEND_HZ = 60;
/// 이만큼 아무 소식이 없으면 상대가 사라진 것으로 친다.
///
/// 끊긴 것을 TCP 가 늘 알려 주지는 않는다. 방장 쪽 맥이 잠들거나 프로세스가 갑자기
/// 죽으면 **연결은 열려 있는 채로 아무것도 안 온다.** 그러면 손님은 허공에 대고 60Hz 로
/// 계속 보내면서 화면은 멈춰 있게 된다 — 실제로 그랬다. 그래서 「얼마나 안 들렸나」를 센다.
const LOST_AFTER = 4;
/// 예측을 이만큼 넘어가서까지 밀지는 않는다. 꾸러미가 끊기면 그 자리에 세운다.
const MAX_LEAD = 0.18;
/// 지연을 메우려고 미리 내다보는 한도. 망이 요동쳐도 여기서 끊어 헛것이 안 보이게 한다.
const MAX_AHEAD = 0.08;
/// 틀린 만큼을 되돌리는 데 걸리는 시간. 짧으면 튀고, 길면 늦게 보인다.
const FIX_TAU = 0.06;
/// **world.js 의 GRAVITY 와 같아야 한다.** 남의 점프를 여기서 이어 그리는 데 쓴다.
const GRAVITY = 1760;

export function createSession() {
  return {
    on: false,
    role: 'off',
    code: null,
    myId: 0,
    myName: '',
    others: new Map(),   // id → 남의 졸라맨
    alive: new Map(),     // 방장만 씀. id → 살아 있나
    names: new Map(),
    results: null,        // 판이 끝나면 [[이름, ms, 피한수, 번호, 살아남음]]
    winner: null,         // 이긴 사람 { id, name } — 만세 세리머니에 쓴다
    roundResults: [],     // 방장이 이번 판에 적어 두는 장부
    waiting: false,       // 판 도중에 들어왔다. 다음 판부터.
    round: 0,
    roster: new Set(),
    sendTimer: 0,
    /// 왕복 시간. 이걸 알아야 「지금쯤 저 사람은 여기 있겠다」를 맞게 계산한다.
    rtt: 0.008,
    pingTimer: 0.15,
    pingSeq: 0,
    pings: new Map(),
    /// 마지막으로 소식을 들은 때. 끊긴 것을 알아채려고 센다.
    heard: 0,
    lost: false,
    /// 방장 번호. 손님은 꾸러미에서 받고, 방장은 자기 번호다.
    hostId: -1,
    /// 마지막으로 보낸 이름표. 바뀔 때만 다시 싣는다.
    namesSent: '',
  };
}

const now = () => performance.now() / 1000;

function blankOther(id, name) {
  return {
    id, name,
    // 마지막으로 받은 상태와, 그걸 받은 뒤 흐른 시간.
    baseX: 0, baseAir: 0, vx: 0, vy: 0, age: 0, errorX: 0, rtt: 0.008,
    state: 2, waiting: true, grabbing: -1, escapes: 0, dodged: 0, seenEscapes: 0, grabAim: 0,
    heard: 0,
    x: 0, air: 0, crouch: 0, tcrouch: 0,
    facing: 1, walk: 0, vyDraw: 0, dead: true, groundY: 0, danger: false, deadFor: 0,
  };
}

/// 남의 졸라맨을 **이어 그린다.**
///
/// 받은 자리를 그대로 찍거나 목표점으로 당겨 붙이면, 꾸러미 간격만큼 늘 늦게 보인다.
/// 부딪혀서 길을 막는 게임에서 늦게 보이는 몸은 없는 몸이나 마찬가지다. 그래서
/// **마지막 속도로 지금 있을 자리를 계산해서** 그린다 — 랜에서는 오차가 몇 픽셀이다.
///
/// 새 꾸러미가 오면 자리를 톡 끊어 옮기지 않고, 틀렸던 만큼을 60ms 에 걸쳐 녹인다.
/// 정확하면서 안 튄다.
/// 번호로 사람을 찾는다. 내 번호면 나다.
function pick(world, me, id) {
  if (id < 0) return null;
  return id === world.mp.myId ? me : world.mp.others.get(id) ?? null;
}

export function interpolate(world, dt) {
  const me = world.player;
  // 누가 누구를 잡고 있는지 먼저 한 장으로 정리한다.
  const held = new Map();
  if (me.grabbing >= 0) held.set(me.grabbing, world.mp.myId);
  for (const other of world.mp.others.values()) {
    if (other.grabbing >= 0 && !other.dead) held.set(other.grabbing, other.id);
  }

  for (const other of world.mp.others.values()) {
    // 남이 「나를 잡았다」고 말하면 잡힌 것이다. 판정을 한쪽에만 두어야 서로 안 엇갈린다.
    //
    // 방금 뿌리쳤으면 잠깐(grabCool) 안 잡힌다. 두 가지를 한꺼번에 막는다:
    // 뿌리친 걸 상대가 아직 모르는 한 왕복 동안 도로 끌려가는 것, 그리고 뿌리치자마자
    // 다시 잡혀서 뿌리칠 이유가 없어지는 것.
    if (other.grabbing === world.mp.myId && !other.dead && !me.dead && me.grabCool <= 0) {
      if (me.heldBy !== other.id) { me.heldBy = other.id; me.grabbing = -1; }
    } else if (me.heldBy === other.id) {
      me.heldBy = -1;
    }
    // 내가 잡은 사람이 뿌리쳤으면 놓는다. 그냥 놓는 게 아니라 **밀쳐진다** —
    // 미는 쪽 계산은 그쪽 화면에서 하고, 밀려나는 나는 여기서 뒤로 튄다.
    if (me.grabbing === other.id && other.escapes !== other.seenEscapes) {
      me.grabbing = -1;
      me.grabAim = 0;
      me.grabCool = 0.7;
      me.knock = -Math.sign(other.x - me.x || 1) * ESCAPE_SHOVE;
    }
    other.seenEscapes = other.escapes;

    // 남이 붙잡혀 있는지는 꾸러미에 없다 — 「내가 누구를 잡았다」만 오간다. 그래서
    // 여기서 뒤집어 만든다. 이게 있어야 붙잡힌 사람이 허둥대는 자세로 그려진다.
    other.heldBy = held.get(other.id) ?? -1;
    // 팔이 향할 쪽. 잡은 상대(나일 수도 있다) 쪽으로 보낸다 — 걸음과 따로 움직여야
    // 「오른쪽 사람을 붙잡은 채 왼쪽으로 끌고 가는」 그림이 된다.
    const partner = pick(world, me, other.grabbing >= 0 ? other.grabbing : other.heldBy);
    other.grabAim = partner ? (Math.sign(partner.x - other.x) || other.grabAim) : 0;
    other.age = Math.min(other.age + dt, MAX_LEAD);
    other.errorX *= Math.exp(-dt / FIX_TAU);

    const before = other.x;
    // 예측은 벽을 모른다. 판 밖으로 그리면 남이 화면 밖으로 사라진 것처럼 보인다.
    const raw = other.baseX + other.vx * other.age + other.errorX;
    other.x = Math.max(12, Math.min(world.w - 12, raw));

    // 점프는 포물선이라 속도만으로는 안 맞는다. 중력까지 넣어 이어 그린다.
    const flight = other.baseAir + other.vy * other.age - 0.5 * GRAVITY * other.age * other.age;
    other.air = Math.max(0, flight);
    other.vyDraw = other.air > 0 ? other.vy - GRAVITY * other.age : 0;

    other.crouch += (other.tcrouch - other.crouch) * Math.min(1, dt * 18);
    // 다리를 굴리려면 속도가 있어야 한다. 실제로 움직인 만큼을 쓴다.
    other.walk += Math.abs(dt > 0 ? (other.x - before) / dt : 0) * dt * 0.052;
    other.groundY = world.groundY;
    if (other.dead) other.deadFor += dt;
  }
}

// MARK: 보내기

/// 자리만 보내면 받는 쪽이 이어 그릴 수가 없다. **속도까지 같이 보낸다.**
///
/// 칸: x, vx, air, vy, crouch, facing, 상태, 잡은사람, 뿌리친횟수, 피한수
/// 상태는 0 살아있음 · 1 죽음 · 2 다음판대기.
function myPacket(world) {
  const p = world.player;
  const r1 = (v) => Math.round(v * 10) / 10;
  const state = p.dead ? (world.mp.waiting ? 2 : 1) : 0;
  return ['p', r1(p.x), r1(p.vx), r1(p.air), r1(p.vy),
          Math.round(p.crouch * 100) / 100, p.facing, state,
          p.grabbing, p.escapes, world.dodged];
}

export function pump(world, dt, shell) {
  const mp = world.mp;
  if (!mp.on) return;

  // 왕복 시간 재기. 1초에 한 번이면 랜에서는 충분하다.
  mp.pingTimer -= dt;
  if (mp.pingTimer <= 0) {
    // 0.3초마다. 왕복 시간을 모르는 동안은 남들이 늦게 보이므로 빨리 수렴해야 한다.
    mp.pingTimer = 0.3;
    const key = ++mp.pingSeq;
    mp.pings.set(key, now());
    if (mp.pings.size > 8) mp.pings.delete(mp.pings.keys().next().value);
    shell.net.send({ t: 'ping', k: key });
  }

  // 소식이 끊겼나.
  if (mp.role === 'guest') {
    if (!mp.heard) mp.heard = now();
    if (!mp.lost && now() - mp.heard > LOST_AFTER) {
      // 허공에 대고 계속 보내지 않는다. 방을 놓고 혼자로 돌아간다.
      mp.lost = true;
      world.onMenu?.('leave');
      return;
    }
  } else if (mp.role === 'host') {
    // 조용해진 손님은 내보낸다. 안 그러면 없는 사람을 기다리느라 판이 안 끝난다.
    for (const other of [...mp.others.values()]) {
      if (!other.heard) { other.heard = now(); continue; }
      if (now() - other.heard > LOST_AFTER) {
        peerChanged(world, shell, other.id, other.name, false, { spread: () => {} });
      }
    }
  }

  mp.sendTimer -= dt;
  if (mp.sendTimer > 0) return;
  mp.sendTimer += 1 / SEND_HZ;

  if (mp.role === 'guest') {
    shell.net.send(myPacket(world));
    return;
  }

  // 방장: 모두의 자리 + 이번에 새로 뿌린 똥.
  const players = [[mp.myId, ...myPacket(world).slice(1)]];
  for (const other of mp.others.values()) {
    // 손님에게서 **받은 그대로** 넘긴다. 여기서 보간한 값을 실으면 방장을 거칠 때마다
    // 한 번 더 늦어져서, 손님끼리는 서로 두 배로 늦게 보인다.
    // 마지막 칸은 **내가 이 소식을 들은 지 얼마나 됐나.** 받는 쪽은 자기 지연에
    // 이걸 더해야 「지금쯤 저 사람이 있을 자리」가 나온다. 안 실으면 손님끼리는
    // 방장을 거치는 만큼 늘 뒤처져 보인다.
    players.push([other.id, other.baseX, other.vx, other.baseAir, other.vy,
                  other.tcrouch, other.facing, other.state,
                  other.grabbing, other.escapes, other.dodged,
                  Math.round(other.age * 1000) / 1000]);
  }
  const snapshot = {
    t: 's', ms: Math.round(world.elapsed * 1000), st: world.state, r: mp.round, pl: players,
    // **판의 크기.** 손님은 이 크기로 세계를 굴리고, 그리는 순간에만 자기 화면에 맞춘다.
    // 각자 자기 화면 크기로 굴리면 똥 떨어지는 자리도, 남이 서 있는 자리도 서로 어긋난다.
    vw: Math.round(world.w), vh: Math.round(world.h),
    // **무슨 게임을 하고 있나.** 방장이 정하고 방 전체가 따라간다.
    g: world.gameId,
    // 방장이 누군지. 손님은 이걸 보고 머리 위에 왕관을 씌운다 —
    // 판을 여는 사람이 누군지 보여야 「왜 시작이 안 되지」를 안 묻는다.
    h: mp.myId,
  };
  // **이름표.** 손님은 남의 이름을 알 길이 없다 — 방장만 join 꾸러미로 듣는다.
  // 바뀔 때만 싣는다. 60Hz 로 매번 보내면 사람이 여덟이어도 쓸데없이 두껍다.
  const roster = [[mp.myId, mp.myName], ...mp.names.entries()]
    .map(([id, label]) => [id, label ?? '']);
  const stamp = JSON.stringify(roster);
  if (stamp !== mp.namesSent) {
    snapshot.nm = roster;
    mp.namesSent = stamp;
  }
  // 게임이 손님에게 넘길 것. 똥은 새로 뿌린 것만, 공은 매번 자리와 속도를 통째로.
  const pack = gameOf(world).pack?.(world);
  if (pack) snapshot.x = pack;
  shell.net.send(snapshot);
}

// MARK: 받기

export function handleMessage(world, shell, from, message, api) {
  const mp = world.mp;
  if (!mp.on) return;

  // **무엇이 왔든 맨 먼저 「들었다」를 찍는다.**
  //
  // 손님이 보내는 건 거의 전부 자리 꾸러미(['p', ...])다. 이걸 아래 switch 뒤에서 찍으면
  // 자리 꾸러미는 그 앞에서 return 해 버려 영영 안 찍힌다 — 그러면 멀쩡히 놀고 있는
  // 손님을 조용해졌다고 내보내고, 다음 꾸러미에 이름 없는 「누군가」로 되살아난다.
  if (mp.role === 'guest') mp.heard = now();
  else if (mp.role === 'host') {
    const talker = mp.others.get(from);
    if (talker) talker.heard = now();
  }

  // 손님이 보내는 자리 꾸러미. 배열로 와서 첫 칸이 종류다.
  if (Array.isArray(message) && message[0] === 'p') {
    if (mp.role !== 'host') return;
    const other = mp.others.get(from) ?? blankOther(from, mp.names.get(from) ?? '누군가');
    applyPacket(other, message, other.rtt / 2);
    mp.others.set(from, other);
    return;
  }

  // 방장이 내보냈다. 4초 뒤에 「조용해졌다」로 알아채기 전에 이유를 알려 주고 나간다.
  if (message.t === 'kick') {
    say(world, '방장이 방에서 내보냈다');
    world.onMenu?.('leave');
    return;
  }

  // 손님이 이름을 고쳤다. 방장이 이름표를 갈아 끼우고 다음 스냅샷에 실어 나눠 준다.
  if (message.t === 'nm') {
    if (mp.role !== 'host') return;
    const name = typeof message.n === 'string' ? message.n.trim().slice(0, 16) : '';
    if (!name) return;
    mp.names.set(from, name);
    const other = mp.others.get(from);
    if (other) other.name = name;
    mp.namesSent = '';
    return;
  }

  if (message.t === 'ping') {
    shell.net.send({ t: 'pong', k: message.k }, from);
    return;
  }
  if (message.t === 'pong') {
    const sent = mp.pings.get(message.k);
    if (sent === undefined) return;
    const sample = Math.max(0, now() - sent);
    if (mp.role === 'host') {
      // 핑 하나를 모두에게 뿌리고 답을 여럿에게서 받는다. 여기서 지우면 두 번째
      // 사람부터는 왕복 시간을 영영 못 잰다 — 오래된 것만 크기로 밀어낸다.
      const other = mp.others.get(from);
      if (other) other.rtt += (sample - other.rtt) * 0.35;
    } else {
      mp.pings.delete(message.k);
      mp.rtt += (sample - mp.rtt) * 0.35;
    }
    return;
  }

  switch (message.t) {
    case 's': {
      if (mp.role !== 'guest') return;
      // 방장이 쓰는 판 크기를 그대로 따라간다. 이게 맞아야 모두 같은 화면을 본다.
      if (message.vw && (message.vw !== world.w || message.vh !== world.h)) {
        api.setSize(message.vw, message.vh);
      }
      // 시계는 방장 것이 맞다. 확 끌어당기면 숫자가 튀므로 조금씩 맞춘다.
      const hostSeconds = message.ms / 1000;
      world.elapsed += (hostSeconds - world.elapsed) * 0.25;
      // 방장이 말한 시각을 날것 그대로 남겨 둔다. 화면끼리 얼마나 같은지 잴 때
      // 이게 있어야 **같은 순간**을 견줄 수 있다 — 내 시계는 방장 쪽으로 끌려가는 중이라
      // 순간마다 조금씩 다르다.
      mp.hostMs = message.ms;
      mp.round = message.r;
      if (Number.isFinite(message.h)) mp.hostId = message.h;
      // 방장이 보내 준 이름표. 이미 만들어 둔 사람의 이름도 같이 고친다.
      if (Array.isArray(message.nm)) {
        for (const row of message.nm) {
          if (!Array.isArray(row) || row.length !== 2) continue;
          const [id, label] = row;
          if (!Number.isFinite(id) || typeof label !== 'string') continue;
          mp.names.set(id, label);
          const known = mp.others.get(id);
          if (known) known.name = label;
        }
      }
      // 방장이 다른 게임을 하고 있으면 따라간다. 방 전체가 같은 게임을 하는 게 규칙이다.
      // 모르는 게임 이름이 오면 무시한다. gameById 가 첫 게임으로 떨어뜨려서
      // 방장은 배구인데 나만 똥피하기가 되는 일이 없게 한다.
      if (typeof message.g === 'string' && message.g !== world.gameId
          && games.some((g) => g.id === message.g)) {
        pickGame(world, message.g);
      }

      // **모양을 안 믿는다.** 남이 보낸 글자다 — 줄이 잘렸거나, 다음 버전이 칸을 바꿨거나,
      // 아무거나 올 수 있다. 여기서 터지면 그 프레임 처리가 통째로 날아간다.
      for (const row of Array.isArray(message.pl) ? message.pl : []) {
        if (!Array.isArray(row) || row.length < 8) continue;
        if (row[0] === mp.myId) continue; // 내 몸은 내가 안다
        const other = mp.others.get(row[0]) ?? blankOther(row[0], mp.names.get(row[0]) ?? '');
        // 여기까지 오는 데 걸린 시간 = 방장이 들고 있던 시간 + 방장에서 나까지의 편도.
        applyPacket(other, ['p', ...row.slice(1, 11)], (row[11] ?? 0) + mp.rtt / 2);
        mp.others.set(row[0], other);
      }
      // 판 도중에 들어왔으면 구경만 한다. 안 보이던 똥에 맞아 죽는 것보다 낫다.
      // 아직 아무도 시작 안 했으면 기다릴 것도 없다.
      if (message.st === 'ready') mp.waiting = false;
      else if (mp.waiting) world.player.dead = true;
      // **구경도 판을 봐야 구경이다.** 방장은 한창인데 내 화면만 시작 화면에 멈춰 있으면
      // 들어온 사람은 아무것도 못 본다. 방장이 판을 돌고 있으면 나도 판으로 들어가되,
      // 이번 판에는 안 낀다(기다리는 사람으로 둔다).
      if (message.st === 'play' && world.state !== 'play') {
        world.state = 'play';
        mp.waiting = true;
        world.player.dead = true;
      }
      if (message.x && typeof message.x === 'object') gameOf(world).unpack?.(world, message.x);
      if (message.st === 'ready' && world.state !== 'ready') world.state = 'ready';
      return;
    }
    // 게임이 자기끼리 주고받는 말. 셸도 net 도 안을 열어 보지 않는다.
    case 'gm':
      gameOf(world).message?.(world, from, message);
      return;
    case 'go':
      mp.round = message.r;
      mp.results = null;
      mp.waiting = false;
      api.restart(world);
      world.state = 'play';
      return;
    case 'over':
      mp.results = Array.isArray(message.results) ? message.results : [];
      mp.winner = message.winner ?? null;
      world.state = 'over';
      world.overFor = 0;
      return;
    case 'dead': {
      if (mp.role !== 'host') return;
      mp.alive.set(from, false);
      const other = mp.others.get(from);
      if (other) { other.dead = true; other.deadFor = 0; }
      recordResult(mp, from, mp.names.get(from) ?? '누군가', message.ms, message.dodged);
      checkRoundOver(world, shell);
      return;
    }
    case 'again':
      // 옛 버전 손님이 보내오는 부탁. 이제는 방장만 판을 연다 — 조용히 버린다.
      return;
    case 'again_ignored':
      if (mp.role === 'host') startRound(world, shell, api);
      return;
    default:
  }
}

function applyPacket(other, packet, stale = 0) {
  // 지금 화면에 그리고 있던 자리와, 방금 온 진짜 자리의 차이. 이걸 천천히 녹인다.
  const showing = other.baseX + other.vx * other.age + other.errorX;
  other.baseX = packet[1];
  other.vx = packet[2];
  other.baseAir = packet[3];
  other.vy = packet[4];
  other.tcrouch = packet[5];
  other.facing = packet[6];
  other.state = packet[7] ?? 0;
  other.waiting = other.state === 2;
  other.grabbing = packet[8] ?? -1;
  other.escapes = packet[9] ?? 0;
  other.dodged = packet[10] ?? 0;
  // 0 부터 세지 않는다. 이미 늦게 도착한 소식이므로 그만큼 앞선 자리에서 시작한다.
  other.age = Math.min(stale, MAX_AHEAD);
  // 오차는 「그리던 자리」와 **새로 계산한 지금 자리**의 차이다. baseX 와 재면
  // 앞서 내다본 만큼(vx × 지연)이 매 꾸러미마다 오차로 다시 들어가, 사람이 여럿일수록
  // 계속 뒤로 끌린다.
  other.errorX = showing - (other.baseX + other.vx * other.age);
  // 너무 많이 틀렸으면 녹이지 않고 그냥 옮긴다 — 뒤늦게 스르륵 가는 게 더 이상하다.
  if (Math.abs(other.errorX) > 90) other.errorX = 0;

  const dead = other.state !== 0;
  if (dead && !other.dead) other.deadFor = 0;
  other.dead = dead;
}

// MARK: 판 진행 (방장만)

function recordResult(mp, id, name, ms, dodged, survived = false) {
  mp.roundResults ??= [];
  if (mp.roundResults.some((row) => row[3] === id)) return;
  mp.roundResults.push([name, ms | 0, dodged | 0, id, survived]);
}

/// 판이 끝났는지 본다. **마지막 한 사람이 남으면 그 사람이 이기고 끝난다** —
/// 혼자 남아 계속 뛰는 걸 나머지가 몇 분씩 구경하게 두지 않는다.
/// 이번 판에 낀 사람이 애초에 하나뿐이면(혼자 방을 연 경우) 그 사람이 죽어야 끝난다.
/// 게임이 스스로 「끝」이라고 할 때 (배구의 다섯 점처럼). 방장만 부른다.
///
/// 똥피하기는 마지막 한 명이 남으면 끝이고, 배구는 점수로 끝난다. 끝나는 이유는
/// 게임마다 다르지만 **끝난 뒤에 벌어지는 일은 같다** — 순위표, 만세, 다음 판 기다리기.
export function endRound(world, shell, { winner, results }) {
  const mp = world.mp;
  if (mp.role !== 'host' || world.state !== 'play') return;
  mp.results = results ?? [];
  mp.winner = winner ?? null;
  world.state = 'over';
  world.overFor = 0;
  shell.net.send({ t: 'over', results: mp.results, winner: mp.winner });
}

export function checkRoundOver(world, shell) {
  const mp = world.mp;
  if (mp.role !== 'host' || world.state !== 'play') return;

  const roster = mp.roster ?? new Set();
  const standing = [];
  if (!world.player.dead) standing.push(mp.myId);
  for (const id of roster) if (mp.alive.get(id)) standing.push(id);

  const enough = roster.size + 1 >= 2;      // 둘 이상이 시작했나
  if (standing.length > 1) return;
  if (standing.length === 1 && !enough) return;

  // 살아남은 사람이 있으면 그 사람 기록도 지금 시각으로 적는다. 이 사람이 1등이다.
  const survivor = standing[0];
  if (survivor !== undefined) {
    const ms = Math.round(world.elapsed * 1000);
    if (survivor === mp.myId) {
      recordResult(mp, mp.myId, mp.myName, ms, world.dodged, true);
    } else {
      const other = mp.others.get(survivor);
      recordResult(mp, survivor, mp.names.get(survivor) ?? '누군가', ms, other?.dodged ?? 0, true);
    }
  }

  const results = (mp.roundResults ?? []).slice().sort((a, b) => b[1] - a[1]);
  const champion = survivor !== undefined
    ? { id: survivor, name: results.find((row) => row[3] === survivor)?.[0] ?? '?' }
    : null;
  mp.results = results;
  mp.winner = champion;
  world.state = 'over';
  world.overFor = 0;
  shell.net.send({ t: 'over', results, winner: champion });
}

export function startRound(world, shell, api) {
  const mp = world.mp;
  // 세리머니 중이면 무시한다.
  if (world.state === 'over' && mp.winner && world.overFor < 3) return;
  // **판을 여는 건 방장뿐이다.** 손님이 아무 때나 열면 아직 준비 안 된 사람이 끌려 들어간다 —
  // 편을 고르는 중일 수도, 방금 들어와 자리를 잡는 중일 수도 있다.
  if (mp.role !== 'host') return;
  // 게임이 「아직 안 된다」고 하면 안 연다 (배구에서 한쪽 편이 비었을 때).
  if (gameOf(world).blocked?.(world)) return;
  mp.round++;
  mp.results = null;
  mp.winner = null;
  mp.roundResults = [];
  mp.waiting = false;
  // 이번 판에 낀 사람 명단. 도중에 들어온 사람은 여기 없으니 판을 붙잡지 않는다.
  mp.roster = new Set(mp.others.keys());
  for (const id of mp.others.keys()) {
    mp.alive.set(id, true);
    const other = mp.others.get(id);
    other.dead = false;
    other.deadFor = 0;
  }
  api.restart(world);
  world.state = 'play';
  shell.net.send({ t: 'go', r: mp.round });
}

/// 방장에게 내가 죽었다고 알린다. 방장이면 자기 장부에 적는다.
export function reportDeath(world, shell, result) {
  const mp = world.mp;
  if (!mp.on) return;
  if (mp.role === 'guest') {
    shell.net.send({ t: 'dead', ms: result.ms, dodged: result.dodged });
    return;
  }
  recordResult(mp, mp.myId, mp.myName, result.ms, result.dodged);
  checkRoundOver(world, shell);
}

// MARK: 들어오고 나가고

export function peerChanged(world, shell, id, name, joined, api) {
  const mp = world.mp;
  if (joined) {
    mp.names.set(id, name);
    mp.alive.set(id, false); // 다음 판부터
    mp.others.set(id, blankOther(id, name));
  } else {
    mp.names.delete(id);
    mp.alive.delete(id);
    mp.others.delete(id);
    mp.roster?.delete(id);
    if (mp.role === 'host') checkRoundOver(world, shell);
  }
  // 아직 아무도 시작 안 했으면 자리를 다시 나눈다. 겹쳐 선 채로 기다리면 보기 나쁘다.
  if (world.state === 'ready') api?.spread(world);
}

export function roleChanged(world, role, code, myId, myName) {
  const mp = world.mp;
  // **이름만 바뀐 것이면 이름만 바꾼다.**
  //
  // 셸은 이름을 고칠 때도 이 길로 알려 온다. 여기서 방 상태를 되감으면 이름을 고쳤다는
  // 이유로 손님이 구경으로 밀려나고(waiting) 방장의 판 번호가 0으로 돌아간다.
  if (mp.on && role === mp.role && code === mp.code && myId === mp.myId) {
    if (myName !== mp.myName) {
      mp.myName = myName;
      mp.namesSent = '';                       // 방장은 다음 스냅샷에 새 이름표를 싣는다
      // 손님 이름은 방장만 남들에게 나눠 줄 수 있다. 바뀐 걸 알린다.
      if (role === 'guest') world.send?.({ t: 'nm', n: myName });
    }
    return;
  }
  // 방이 바뀌면 「안 들린 시간」도 새로 센다.
  mp.heard = 0;
  mp.lost = false;
  mp.namesSent = '';
  mp.role = role;
  mp.code = code;
  mp.myId = myId;
  mp.myName = myName;
  mp.on = role !== 'off';
  if (!mp.on) {
    mp.others.clear();
    mp.alive.clear();
    mp.names.clear();
    mp.results = null;
    mp.waiting = false;
  } else if (role === 'guest') {
    mp.waiting = true; // 첫 스냅샷을 보고 이번 판에 낄지 정한다
  } else {
    mp.round = 0;
    mp.roundResults = [];
  }
}
