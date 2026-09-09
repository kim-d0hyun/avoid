// 게임 상태. 그리는 일은 하지 않는다.

import { BODY_H } from '../draw/stickman.js';
import { bucketFor, SPLAT_KINDS } from '../draw/poop.js';
import { createSession, interpolate } from './net.js';

const ACCEL = 5400;
const MAX_SPEED = 620;
const CROUCH_SPEED = 230;
const FRICTION = 4600;
const AIR_CONTROL = 0.62;
const JUMP_V = 480;
const GRAVITY = 1760;
const HALF_W = 11;
const SPLAT_CAP = 48;

// 사람끼리 부딪히는 느낌.
//
// 뚫고 지나가지도, 벽에 막히듯 딱 서지도 않아야 한다. 두 손잡이를 다르게 굴려서 만든다:
//
//   · **최고 속도**는 닿는 순간 급격히 죽인다. 620px/s 로 달리는 몸에 부드러운 힘을
//     걸어 봐야 그냥 통과한다. 발이 헛도는 느낌은 여기서 나온다.
//   · **밀어내는 힘**은 겹친 깊이에 비례해 부드럽게. 세게 걸면 사람이 튕겨 날아간다.
//
// 둘이 만나는 자리가 26픽셀쯤 — 어깨가 겹쳐 보이지만 두 사람으로 읽히는 거리다.
// 정면으로 박으면 서로 버티고, 어깨만 스치면 그냥 지나간다. 막힌 사람은 ⌥↑ 로 넘는다.
const SHOULDER = 46;
/// 겹친 깊이에 비례해 밀어낸다. **자리를 직접 옮긴다** — 속도로만 밀면 마찰이 그대로
/// 먹어 버려서 둘이 붙은 채 영영 안 떨어진다.
const SEPARATE = 310;
/// 밀릴 때 같이 붙는 속도. 툭 튕기는 손맛만 담당한다.
const SHOVE = 620;
/// 겹친 동안 줄어드는 가속.
const SQUEEZE_DRAG = 0.5;
/// 최고 속도가 깎이는 기울기. 1.8 이면 겹침 0.55 에서 바닥을 친다.
const SQUEEZE_TOP = 1.8;
/// 아무리 끼여도 이만큼은 낸다. 0 으로 두면 완전히 얼어붙어 「고장」으로 보인다.
const SQUEEZE_FLOOR = 0.06;
/// 이만큼 높이가 다르면 서로 안 민다. 막아선 사람을 뛰어넘을 길을 남긴다.
const STEP_OVER = 46;

/// 난이도. 시간이 곧 난이도이고 다른 손잡이는 없다.
/// 속도는 3.8배에서 멈추지만 **쏟아지는 양은 안 멈춘다** — 마지막에 사람을 잡는 건 속도가
/// 아니라 밀도다. 시작부터 여덟 덩이쯤 떠 있고, 40초에는 화면이 반쯤 찬다.
export function difficulty(t) {
  return {
    speed: Math.min(1 + t * 0.040, 3.2),
    interval: Math.max(0.06, 0.26 * Math.pow(0.970, t)),
  };
}

export function createWorld(best) {
  return {
    w: 0, h: 0, groundY: 0,
    state: 'ready',      // ready → play → over
    elapsed: 0,          // 초
    dodged: 0,
    best: { ms: best.ms | 0, dodged: best.dodged | 0 },
    newRecord: false,
    frozen: 0,           // 다시 보일 때 주는 준비 시간
    overFor: 0,
    shake: 0,
    poops: [],
    splats: [],
    /// 이번에 새로 뿌린 똥. 방장이 손님들에게 넘길 때만 쌓인다.
    freshSpawns: [],
    mp: createSession(),
    myResult: null,
    /// ⌥M 으로 여는 게임 안 메뉴. 메뉴 막대 아이콘을 못 찾아도 여기서 다 된다.
    menu: { open: false, index: 0, confirmQuit: false },
    spawnTimer: 0,
    stormTimer: 22,
    input: { left: false, right: false, jump: false, duck: false },
    player: {
      x: 0, vx: 0, air: 0, vy: 0, crouch: 0, facing: 1, walk: 0, squeeze: 0,
      groundY: 0, dead: false, deadFor: 0, danger: false,
    },
  };
}

export function resize(world, w, h) {
  const wasCentered = world.state === 'ready' || world.w === 0;
  world.w = w;
  world.h = h;
  world.groundY = h - 26;
  world.player.groundY = world.groundY;
  if (wasCentered) world.player.x = w / 2;
  world.player.x = Math.max(HALF_W + 12, Math.min(w - HALF_W - 12, world.player.x));
  for (const splat of world.splats) splat.y = world.groundY + 2;
}

export function restart(world) {
  // 누르고 있는 키와 기록 콜백은 그대로 넘긴다 — 방향키를 잡은 채 다시 시작하면
  // 손을 떼었다 다시 누르지 않아도 바로 달려야 한다.
  const { w, h, best, input, onRecord, onDeath, onMenu, mp, menu } = world;
  Object.assign(world, createWorld(best), { w, h, input, onRecord, onDeath, onMenu, mp, menu });
  resize(world, w, h);
  spread(world);
}

/// 같이 할 때 다 같은 자리에 서면 첫 프레임부터 서로 밀어내며 엉킨다.
/// 번호 순으로 화면을 나눠 선다 — 모두가 같은 규칙으로 계산하므로 자리도 안 겹친다.
export function spread(world) {
  const mp = world.mp;
  if (!mp.on) {
    world.player.x = world.w / 2;
    return;
  }
  const ids = [mp.myId, ...mp.others.keys()].sort((a, b) => a - b);
  const slot = Math.max(0, ids.indexOf(mp.myId));
  world.player.x = (world.w * (slot + 1)) / (ids.length + 1);
  world.player.vx = 0;
}

function spawn(world, x, sizeBias = Math.random()) {
  const r = 12 + sizeBias * 14;
  const { speed } = difficulty(world.elapsed);
  // 큰 놈은 느리고 작은 놈은 빠르다. 크기만 보고도 언제 닿을지 가늠할 수 있어야 한다.
  const fall = (330 - r * 4.2) * speed * (0.92 + Math.random() * 0.16);
  const poop = {
    x, y: -r * 2 - 10, r,
    bucket: bucketFor(r),
    vy: fall,
    vx: (Math.random() - 0.5) * 46,
    spin: (Math.random() - 0.5) * 0.5,
    spinV: (Math.random() - 0.5) * 0.95,
    seed: (Math.random() * 3) | 0,
  };
  world.poops.push(poop);
  // 방장은 뿌린 것을 그대로 넘긴다. 손님은 이 초기값으로 **같은 물리를 각자 돌린다** —
  // 매 프레임 좌표를 받아 그리면 20Hz 로 뚝뚝 끊긴다.
  if (world.mp.role === 'host') {
    world.freshSpawns.push([poop.x, poop.y, poop.r, poop.vx, poop.vy, poop.spin, poop.spinV, poop.seed]);
  }
}

/// 방장이 뿌린 똥을 손님 화면에 올린다. 가로 자리는 비율로 와서 여기서 화면 폭에 맞춘다.
export function addPoop(world, [ratio, y, r, vx, vy, spin, spinV, seed]) {
  world.poops.push({
    x: ratio * world.w, y, r, bucket: bucketFor(r), vy, vx, spin, spinV, seed,
  });
}

function randomX(world) {
  return 24 + Math.random() * (world.w - 48);
}

/// 소나기. 한 줄로 쏟아붓되 **반드시 한 칸은 비워 둔다** — 못 피하는 벽은 난이도가 아니라 버그다.
///
/// 비워 두는 칸은 화면 아무 데나가 아니라 **지금 서 있는 자리 근처**에 낸다. 반대편 끝에 내면
/// 후반 낙하 속도(초당 850픽셀)에서는 전력으로 달려도 못 닿아서, 「비어 있지만 못 가는 칸」이 된다.
/// 그래도 150픽셀쯤은 떨어뜨려 둬서 가만히 서 있으면 맞는다.
function storm(world) {
  const margin = 40;
  const shift = (Math.random() < 0.5 ? -1 : 1) * (110 + Math.random() * 70);
  const safe = Math.max(margin, Math.min(world.w - margin, world.player.x + shift));
  const lanes = 7;
  for (let i = 0; i < lanes; i++) {
    const x = 30 + ((i + Math.random() * 0.6) / lanes) * (world.w - 60);
    if (Math.abs(x - safe) < 130) continue;
    spawn(world, x, Math.random() * 0.6);
  }
}

function land(world, poop) {
  world.dodged++;
  world.splats.push({
    x: poop.x, y: world.groundY + 2,
    kind: Math.max(0, Math.min(SPLAT_KINDS - 1, Math.round((poop.r - 12) / 7))),
    flip: Math.random() < 0.5 ? -1 : 1,
    // 크기와 진하기를 조금씩 흩어 놓는다. 똑같은 자국이 줄지어 있으면 도장 찍은 것처럼 보인다.
    size: 0.82 + Math.random() * 0.36,
    alpha: 0.7 + Math.random() * 0.3,
    pop: 0,
  });
  if (world.splats.length > SPLAT_CAP) world.splats.shift();
}

function hits(player, poop) {
  const height = BODY_H * (1 - 0.44 * player.crouch);
  const halfW = HALF_W + player.crouch * 6;
  const feet = player.groundY - player.air;
  const top = feet - height;
  // 원 대 사각형. 사각형에서 원 중심에 가장 가까운 점까지의 거리를 잰다.
  const cx = Math.max(player.x - halfW, Math.min(poop.x, player.x + halfW));
  const cy = Math.max(top, Math.min(poop.y, feet));
  const dx = poop.x - cx;
  const dy = poop.y - cy;
  // 0.72 배. 그림보다 판정을 좁게 잡아야 「스쳤는데 죽었다」가 안 나온다.
  const rr = poop.r * 0.72;
  return dx * dx + dy * dy < rr * rr;
}

/// 남과 부딪히는 힘. 딱딱하게 막지 않는다 — 몸은 겹치되, 깊이 겹칠수록 급하게 밀려난다.
///
/// 겹친 정도의 **제곱**으로 미는 게 핵심이다. 스칠 때는 거의 안 밀려서 옆을 스쳐 지나갈 수
/// 있고, 깊이 파고들면 급격히 밀려나 튕겨 나온다. 선형으로 하면 살짝만 닿아도 밀려나서
/// 「벽」이 되고, 상수로 하면 겹친 채로 굳는다.
function bumpInto(world, dt) {
    const p = world.player;
    let impulse = 0;
    let deepest = 0;
    if (!world.mp.on || p.dead) return { impulse, deepest };

    for (const other of world.mp.others.values()) {
      if (other.dead) continue;
      // 머리 위를 지나는 중이면 안 민다. 막아선 사람은 뛰어넘으라는 뜻이다.
      if (Math.abs(p.air - other.air) > STEP_OVER) continue;
      const dx = p.x - other.x;
      const gap = Math.abs(dx);
      if (gap >= SHOULDER) continue;

      const overlap = (SHOULDER - gap) / SHOULDER;
      // 완전히 겹쳐 방향을 못 정할 때는 번호로 가른다. 안 그러면 둘이 같은 쪽으로 밀린다.
      const dir = gap < 0.5 ? (world.mp.myId < other.id ? -1 : 1) : Math.sign(dx);

      // 자리를 직접 옮긴다. 속도로만 밀면 마찰이 그대로 먹어서 붙은 채 안 떨어진다.
      p.x += dir * SEPARATE * overlap * dt;
      impulse += dir * SHOVE * overlap * overlap * dt;
      deepest = Math.max(deepest, overlap);
    }
    return { impulse, deepest };
}

function movePlayer(world, dt) {
  const p = world.player;
  const input = world.input;
  const grounded = p.air <= 0;

  const wantCrouch = input.duck && grounded ? 1 : 0;
  p.crouch += (wantCrouch - p.crouch) * Math.min(1, dt * 16);
  if (p.crouch < 0.01) p.crouch = 0;

  const bump = bumpInto(world, dt);
  // 부딪히는 순간은 **즉시** 반영하고, 떨어질 때만 천천히 푼다. 둘 다 천천히 하면
  // 전속력으로 스쳐 지나가는 0.05초 안에는 값이 올라오지도 못해서 아무 일도 안 일어난다.
  p.squeeze = bump.deepest > p.squeeze
    ? bump.deepest
    : p.squeeze + (bump.deepest - p.squeeze) * Math.min(1, dt * 9);
  if (p.squeeze < 0.01) p.squeeze = 0;

  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let top = MAX_SPEED - (MAX_SPEED - CROUCH_SPEED) * p.crouch;
  top *= Math.max(SQUEEZE_FLOOR, 1 - SQUEEZE_TOP * p.squeeze);
  if (dir !== 0) {
    // 남에게 끼여 있으면 발이 헛돈다. 못 가는 게 아니라 느려지는 것이라 뚫고 나갈 수는 있다.
    const accel = ACCEL * (1 - SQUEEZE_DRAG * p.squeeze);
    p.vx += dir * accel * (grounded ? 1 : AIR_CONTROL) * dt;
    p.vx = Math.max(-top, Math.min(top, p.vx));
    p.facing = dir;
  } else if (grounded) {
    const drop = FRICTION * dt;
    p.vx = Math.abs(p.vx) <= drop ? 0 : p.vx - Math.sign(p.vx) * drop;
  }

  // 밀려나는 속도는 달리기 상한 **밖에서** 더한다. 안 그러면 부딪힌 순간 제자리에 굳는다.
  p.vx += bump.impulse;
  const fling = MAX_SPEED * 1.7;
  p.vx = Math.max(-fling, Math.min(fling, p.vx));

  p.x += p.vx * dt;
  // 벽에 붙으면 속도를 죽인다. 안 죽이면 벽에 낀 채로 달리는 애니메이션이 나온다.
  const lo = HALF_W + 10;
  const hi = world.w - HALF_W - 10;
  if (p.x < lo) { p.x = lo; p.vx = 0; }
  if (p.x > hi) { p.x = hi; p.vx = 0; }

  if (input.jump && grounded && p.crouch < 0.3) {
    p.vy = JUMP_V;
    p.air = 0.01;
  }
  if (p.air > 0) {
    p.vy -= GRAVITY * dt;
    p.air += p.vy * dt;
    if (p.air <= 0) { p.air = 0; p.vy = 0; }
  }

  p.walk += Math.abs(p.vx) * dt * 0.052;
}

/// 맞았다. 혼자 할 때는 여기서 판이 끝나지만, 같이 할 때는 **나만 빠진다** —
/// 남은 사람들의 똥은 계속 떨어져야 하고, 나는 넘어진 채로 그걸 보게 된다.
function kill(world) {
  const p = world.player;
  p.dead = true;
  p.deadFor = 0;
  p.vx = 0;
  world.shake = 1;

  const ms = Math.round(world.elapsed * 1000);
  const result = { ms, dodged: world.dodged };
  world.myResult = result;

  // 개인 최고 기록은 같이 할 때도 센다. 버틴 시간은 버틴 시간이다.
  world.newRecord = ms > world.best.ms;
  if (ms > world.best.ms) world.best.ms = ms;
  if (world.dodged > world.best.dodged) world.best.dodged = world.dodged;
  world.onRecord?.(result);

  if (world.mp.on) {
    world.onDeath?.(result);
  } else {
    world.state = 'over';
    world.overFor = 0;
  }
}

export function update(world, dt) {
  const p = world.player;

  // 혼자 할 때 메뉴는 판을 멈춘다. 같이 할 때는 못 멈춘다 — 남의 시계까지 세울 수는 없다.
  if (world.menu.open && !world.mp.on) return;
  if (world.frozen > 0) {
    world.frozen -= dt;
    return;
  }
  if (p.dead) p.deadFor += dt;
  world.shake = Math.max(0, world.shake - dt * 3.2);
  if (world.mp.on) interpolate(world, dt);

  if (world.state === 'over') {
    world.overFor += dt;
    for (const splat of world.splats) splat.pop = Math.min(1, splat.pop + dt * 9);
    return;
  }

  if (!p.dead) movePlayer(world, dt);

  if (world.state === 'ready') return;

  world.elapsed += dt;
  const { interval } = difficulty(world.elapsed);

  // 손님은 똥을 뿌리지 않는다. 방장이 뿌린 것을 받아 각자 굴린다.
  if (world.mp.role === 'guest') {
    stepPoops(world, dt);
    return;
  }

  world.spawnTimer -= dt;
  while (world.spawnTimer <= 0) {
    spawn(world, randomX(world));
    // 30초부터는 가끔 둘씩. 겹쳐 떨어지면 두 덩이가 한 덩이로 보이기만 하고 난이도는 그대로다.
    // 벽에 붙어 있으면 반대쪽으로 떼어, 잘라 낸 뒤에도 간격이 남게 한다.
    if (world.elapsed > 30 && Math.random() < 0.18) {
      const first = world.poops[world.poops.length - 1];
      const away = first.x > world.w / 2 ? -1 : 1;
      const x = first.x + away * (190 + Math.random() * 160);
      spawn(world, Math.max(24, Math.min(world.w - 24, x)));
    }
    world.spawnTimer += interval;
  }

  world.stormTimer -= dt;
  if (world.stormTimer <= 0) {
    storm(world);
    world.stormTimer = 20 + Math.random() * 6;
  }

  stepPoops(world, dt);
}

/// 똥을 굴리고, 바닥에 닿은 것은 얼룩으로 바꾸고, 나를 맞혔는지 본다.
/// 방장이든 손님이든 **같은 함수를 돌린다** — 판정을 각자 자기 화면 기준으로 해야
/// 「내 눈에는 안 맞았는데 죽었다」가 안 나온다.
function stepPoops(world, dt) {
  const p = world.player;
  let danger = false;

  for (let i = world.poops.length - 1; i >= 0; i--) {
    const poop = world.poops[i];
    poop.y += poop.vy * dt;
    poop.x += poop.vx * dt;
    poop.spin += poop.spinV * dt;

    if (poop.y - poop.r * 0.6 > world.groundY) {
      land(world, poop);
      world.poops.splice(i, 1);
      continue;
    }
    if (p.dead) continue;
    if (Math.abs(poop.x - p.x) < 78 && poop.y > world.groundY - 260) danger = true;
    if (hits(p, poop)) {
      kill(world);
      break;
    }
  }
  p.danger = danger && !p.dead;

  for (const splat of world.splats) splat.pop = Math.min(1, splat.pop + dt * 9);
}

/// 메뉴에 세울 것들. 상황에 따라 달라지므로 그릴 때와 고를 때가 같은 함수를 본다.
export function menuItems(world) {
  if (world.menu.confirmQuit) {
    return [{ id: 'quitYes', label: '네, 끝낸다' }, { id: 'quitNo', label: '아니, 계속한다' }];
  }
  const items = [{ id: 'resume', label: '이어서 하기' }];
  if (world.state !== 'ready') items.push({ id: 'again', label: '다시 시작' });
  if (world.mp.on) {
    items.push({ id: 'leave', label: world.mp.role === 'host' ? '방 닫기' : '방에서 나가기' });
  } else {
    items.push({ id: 'host', label: '방 만들기' });
    items.push({ id: 'join', label: '코드로 입장' });
  }
  items.push({ id: 'hide', label: '화면 숨기기' });
  items.push({ id: 'quit', label: '게임 끝내기' });
  return items;
}

function openMenu(world, open) {
  world.menu.open = open;
  world.menu.index = 0;
  world.menu.confirmQuit = false;
  // 메뉴로 들어가면 잡고 있던 방향키는 놓은 것으로 친다. 안 그러면 나올 때 혼자 달린다.
  if (open) for (const key of Object.keys(world.input)) world.input[key] = false;
}

function chooseMenu(world) {
  const items = menuItems(world);
  const picked = items[Math.max(0, Math.min(items.length - 1, world.menu.index))];
  switch (picked.id) {
    case 'resume':
    case 'quitNo':
      openMenu(world, false);
      return;
    case 'quit':
      world.menu.confirmQuit = true;
      world.menu.index = 1; // 기본 선택은 「아니」 — 손이 미끄러져 꺼지면 안 된다
      return;
    case 'again':
      openMenu(world, false);
      world.onMenu?.('again');
      return;
    default:
      openMenu(world, false);
      world.onMenu?.(picked.id);
  }
}

export function press(world, action, down) {
  if (action === 'menu') {
    if (down) openMenu(world, !world.menu.open);
    return;
  }

  if (world.menu.open) {
    if (!down) return;
    const count = menuItems(world).length;
    if (action === 'jump') world.menu.index = (world.menu.index + count - 1) % count;
    if (action === 'duck') world.menu.index = (world.menu.index + 1) % count;
    if (action === 'right' || action === 'restart') chooseMenu(world);
    if (action === 'left') {
      world.menu.confirmQuit ? (world.menu.confirmQuit = false, world.menu.index = 0)
                             : openMenu(world, false);
    }
    return;
  }

  if (action === 'restart') {
    if (down && world.state === 'over' && world.overFor > 0.45) world.onMenu?.('again');
    return;
  }
  if (!(action in world.input)) return;
  world.input[action] = down;

  if (!down) return;
  if (world.state === 'ready') {
    // 같이 할 때 판을 여는 건 방장이다. 손님이 누르면 방장에게 부탁이 간다.
    world.mp.on ? world.onMenu?.('again') : (world.state = 'play');
  } else if (world.state === 'over' && world.overFor > 0.9 && action !== 'duck') {
    world.onMenu?.('again');
  }
}
