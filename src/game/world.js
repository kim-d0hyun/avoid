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
const HALF_W = 9;
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
const SHOULDER = 39;
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
const STEP_OVER = 39;

// 붙잡기.
//
// 미는 것만으로는 길을 잠깐 막을 뿐이다. 붙잡으면 상대를 **똥 밑에 세워 둘 수 있다** —
// 대신 잡은 쪽도 같이 느려져서, 잡는 동안은 나도 위험해진다. 서로 물고 늘어지는 순간이
// 이 게임에서 제일 웃긴 장면이라 넣는다.
const GRAB_REACH = 53;      // 손이 닿는 거리
const GRAB_COOLDOWN = 0.7;  // 놓친 뒤 다시 잡기까지
const GRAB_HOLD_AT = 21;    // 잡고 있을 때 유지되는 거리 — 어깨가 닿을 만큼 붙는다
/// 이만큼까지만 벌어지는 걸 봐준다. 넘으면 그 자리에서 끌어다 붙인다.
///
/// 당기는 힘만으로는 **끌고 갈 때 반드시 벌어진다.** 비례 제어라서, 잡은 사람이 초당
/// 360픽셀로 달리면 힘이 k 일 때 360/k 만큼 뒤처진 자리에서 균형이 잡힌다 —
/// 예전 k=6 이면 60픽셀이다. 힘을 올려 뒤처짐을 줄이고, 그래도 남는 건 여기서 자른다.
const GRAB_SLACK = 7;
const GRAB_PULL_HOLDER = 15;   // 잡은 쪽이 상대에게 붙는 힘
const GRAB_PULL_HELD = 22;     // 끌려가는 쪽이 딸려오는 힘. 끌려가는 쪽이 더 세게 붙어야 한다
const GRABBER_SPEED = 0.58; // 잡은 쪽도 무겁다
const HELD_SPEED = 0.22;    // 잡힌 쪽은 거의 못 움직인다
// 뿌리치기. 그냥 풀리기만 하면 「풀렸나?」 싶다 — **밀쳐 내야** 뿌리친 것으로 읽힌다.
// 미는 쪽이 더 세게 날아가고, 뿌리친 쪽도 그만큼은 아니어도 반동으로 물러난다.
const ESCAPE_SHOVE = 540;   // 붙잡고 있던 쪽이 밀려나는 세기
const ESCAPE_KICK = 300;    // 뿌리친 쪽이 반동으로 물러나는 세기
const KNOCK_TAU = 0.17;     // 밀려남이 잦아드는 시간

/// 이긴 사람이 만세를 부르는 시간. 이 동안은 다음 판을 못 시작한다 —
/// 이겼다는 걸 볼 새도 없이 다음 판이 시작되면 이길 이유가 없어진다.
export const VICTORY_SECONDS = 3;
export { ESCAPE_SHOVE };

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
    menu: { open: false, index: 0, confirmQuit: false, pickScreen: false },
    /// 셸이 알려 주는, 지금 물려 있는 화면들. 한 대뿐이면 비어 있는 것과 같이 친다.
    screens: [],
    spawnTimer: 0,
    stormTimer: 22,
    input: { left: false, right: false, jump: false, duck: false },
    player: {
      x: 0, vx: 0, air: 0, vy: 0, crouch: 0, facing: 1, walk: 0, squeeze: 0,
      groundY: 0, dead: false, deadFor: 0, danger: false,
      /// 붙잡기. grabbing 은 내가 잡은 사람 번호, heldBy 는 나를 잡은 사람 번호 (-1 이면 없음).
      grabbing: -1, heldBy: -1, grabCool: 0, escapes: 0, shake: 0,
      /// 뿌리치며 밀려난 속도. vx 와 따로 두는 이유는 마찰과 달리기 상한에 안 먹히게 하려고다 —
      /// vx 에 얹으면 4600/s 짜리 마찰이 70밀리초 만에 먹어 치워서 아무것도 안 보인다.
      knock: 0,
      /// 팔이 향할 쪽(-1/0/1). 걸음과 따로 논다 — 오른쪽 사람을 잡은 채 왼쪽으로 끌고 갈 수 있다.
      grabAim: 0,
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
  const { w, h, best, input, onRecord, onDeath, onMenu, mp, menu, screens } = world;
  Object.assign(world, createWorld(best),
                { w, h, input, onRecord, onDeath, onMenu, mp, menu, screens });
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
  const r = 10 + sizeBias * 12;
  const { speed } = difficulty(world.elapsed);
  // 큰 놈은 느리고 작은 놈은 빠르다. 크기만 보고도 언제 닿을지 가늠할 수 있어야 한다.
  const fall = (322 - r * 4.0) * speed * (0.92 + Math.random() * 0.16);
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

/// 방장이 뿌린 똥을 그대로 올린다. 판 크기가 같으니 자리도 그대로 쓴다.
export function addPoop(world, [x, y, r, vx, vy, spin, spinV, seed]) {
  world.poops.push({ x, y, r, bucket: bucketFor(r), vy, vx, spin, spinV, seed });
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
    kind: Math.max(0, Math.min(SPLAT_KINDS - 1, Math.round((poop.r - 10) / 6))),
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
  const halfW = HALF_W + player.crouch * 5;
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
      // 붙잡고 있는 상대와는 어깨를 좁힌다. 안 그러면 당겨 붙이는 힘과 밀어내는 힘이
      // 같은 자리에서 맞서서 둘이 덜덜 떤다.
      const locked = other.id === p.grabbing || other.id === p.heldBy;
      const shoulder = locked ? GRAB_HOLD_AT : SHOULDER;
      if (gap >= shoulder) continue;

      const overlap = (shoulder - gap) / shoulder;
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
  // 잡은 쪽은 무겁고, 잡힌 쪽은 거의 못 간다.
  if (p.heldBy >= 0) top *= HELD_SPEED;
  else if (p.grabbing >= 0) top *= GRABBER_SPEED;
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

  p.x += (p.vx + p.knock) * dt;
  if (p.knock !== 0) {
    p.knock *= Math.exp(-dt / KNOCK_TAU);
    if (Math.abs(p.knock) < 8) p.knock = 0;
  }
  // 벽에 붙으면 속도를 죽인다. 안 죽이면 벽에 낀 채로 달리는 애니메이션이 나온다.
  const lo = HALF_W + 9;
  const hi = world.w - HALF_W - 9;
  if (p.x < lo) { p.x = lo; p.vx = 0; p.knock = 0; }
  if (p.x > hi) { p.x = hi; p.vx = 0; p.knock = 0; }

  if (input.jump && grounded && p.crouch < 0.3 && p.heldBy < 0) {
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
  p.grabbing = -1;
  p.heldBy = -1;
  p.dead = true;
  p.deadFor = 0;
  p.vx = 0;
  p.knock = 0;
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

  if (world.mp.on) stepGrab(world, dt);
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
    if (Math.abs(poop.x - p.x) < 66 && poop.y > world.groundY - 260) danger = true;
    if (hits(p, poop)) {
      kill(world);
      break;
    }
  }
  p.danger = danger && !p.dead;

  for (const splat of world.splats) splat.pop = Math.min(1, splat.pop + dt * 9);
}

/// 다음 판을 시작해도 되는 때인가. 우승 세리머니 중에는 안 된다.
export function canRestart(world, minimum = 0.45) {
  if (world.state !== 'over') return false;
  const wait = world.mp.winner ? VICTORY_SECONDS : minimum;
  return world.overFor > wait;
}

/// 메뉴에 세울 것들. 상황에 따라 달라지므로 그릴 때와 고를 때가 같은 함수를 본다.
export function menuItems(world) {
  if (world.menu.confirmQuit) {
    return [{ id: 'quitYes', label: '네, 끝낸다' }, { id: 'quitNo', label: '아니, 계속한다' }];
  }
  // 화면 고르기는 한 겹 안으로 들어간다. 모니터가 셋이면 첫 화면이 그것만으로 꽉 찬다.
  // 보던 중에 모니터를 뽑아 한 대만 남으면 고를 것이 없으니 그냥 첫 화면으로 돌아간다.
  if (world.menu.pickScreen && world.screens.length > 1) {
    return world.screens.map((screen) => ({
      id: `screen:${screen.number}`,
      label: screen.name,
      note: `${screen.w}×${screen.h}`,
      mark: !!screen.current,
    }));
  }
  const items = [{ id: 'resume', label: '이어서 하기' }];
  if (world.state !== 'ready' && (world.state !== 'over' || canRestart(world))) {
    items.push({ id: 'again', label: '다시 시작' });
  }
  if (world.mp.on) {
    items.push({ id: 'leave', label: world.mp.role === 'host' ? '방 닫기' : '방에서 나가기' });
  } else {
    items.push({ id: 'host', label: '방 만들기' });
    items.push({ id: 'join', label: '코드로 입장' });
  }
  if (world.screens.length > 1) {
    const here = world.screens.find((screen) => screen.current);
    items.push({ id: 'screens', label: '띄울 화면 바꾸기', note: here?.name ?? '' });
  }
  items.push({ id: 'hide', label: '화면 숨기기' });
  items.push({ id: 'quit', label: '게임 끝내기' });
  return items;
}

function openMenu(world, open) {
  world.menu.open = open;
  world.menu.index = 0;
  world.menu.confirmQuit = false;
  world.menu.pickScreen = false;
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
    case 'screens':
      world.menu.pickScreen = true;
      world.menu.index = Math.max(0, world.screens.findIndex((screen) => screen.current));
      return;
    case 'again':
      openMenu(world, false);
      world.onMenu?.('again');
      return;
    default:
      // 화면을 옮기는 동안은 메뉴를 열어 둔다. 창이 그 모니터에 뜨는 걸 눈으로 보고
      // 아니다 싶으면 바로 다른 걸 고를 수 있어야 한다.
      if (picked.id.startsWith('screen:')) {
        world.onMenu?.(picked.id);
        return;
      }
      openMenu(world, false);
      world.onMenu?.(picked.id);
  }
}

/// 스페이스바를 누른 순간. 잡혀 있으면 뿌리치고, 아니면 가까운 사람을 잡는다.
/// 잡고 있는 동안은 **키를 누르고 있는 동안**이다 — 떼면 grabReleased 가 놓는다.
function grabPressed(world) {
  const p = world.player;
  if (!world.mp.on || p.dead || world.state !== 'play') return;

  // 잡혀 있으면 먼저 뿌리친다. 한 번이면 풀린다 — 연타로 괴롭히는 게임이 아니다.
  if (p.heldBy >= 0) {
    const holder = world.mp.others.get(p.heldBy);
    p.heldBy = -1;
    p.escapes = (p.escapes + 1) % 1000;   // 잡은 쪽이 이 숫자가 바뀐 걸 보고 놓는다
    p.grabCool = GRAB_COOLDOWN;
    // 밀쳐 내며 풀려난다. 미는 반동으로 나도 반대쪽으로 물러난다 —
    // 붙잡고 있던 쪽이 밀려나는 건 그쪽 화면에서 계산한다(net.js).
    if (holder) {
      p.knock = -Math.sign(holder.x - p.x || 1) * ESCAPE_KICK;
      p.grabAim = 0;
    }
    return;
  }
  if (p.grabbing >= 0) return;                  // 이미 잡고 있다. 놓는 건 키를 뗄 때다
  if (p.grabCool > 0) return;

  // 손이 닿는 사람 중 제일 가까운 사람.
  let target = null;
  let near = GRAB_REACH;
  for (const other of world.mp.others.values()) {
    if (other.dead || other.waiting) continue;
    if (Math.abs(p.air - other.air) > STEP_OVER) continue;
    const gap = Math.abs(other.x - p.x);
    if (gap < near) { near = gap; target = other; }
  }
  if (!target) return;
  p.grabbing = target.id;
  p.grabAim = Math.sign(target.x - p.x) || p.facing;
}

/// 스페이스바를 뗀 순간. 잡고 있던 사람을 놓는다.
function grabReleased(world) {
  const p = world.player;
  if (p.grabbing >= 0) release(p);
}

function release(p) {
  p.grabbing = -1;
  p.grabAim = 0;
  p.grabCool = GRAB_COOLDOWN;
}

/// 붙잡은 거리(GRAB_HOLD_AT)로 당긴다. 당기고도 남는 틈은 그 자리에서 잘라 붙인다 —
/// 양쪽 화면이 각자 절반씩 좁히므로, 둘이 만나는 자리는 그대로 가운데다.
function pullTo(p, other, dt, force) {
    const dx = other.x - p.x;
    const dir = Math.sign(dx) || 1;
    p.x += (dx - dir * GRAB_HOLD_AT) * Math.min(1, dt * force);

    const over = Math.abs(other.x - p.x) - (GRAB_HOLD_AT + GRAB_SLACK);
    if (over > 0) p.x += Math.sign(other.x - p.x) * over * 0.5;
}

/// 잡고 있는 동안 서로를 끌어당긴다. 놓아야 할 이유가 생기면 놓는다.
function stepGrab(world, dt) {
  const p = world.player;
  p.grabCool = Math.max(0, p.grabCool - dt);
  p.shake = Math.max(0, p.shake - dt * 4);

  if (p.grabbing >= 0) {
    const target = world.mp.others.get(p.grabbing);
    // 시간 제한은 없다. 잡는 동안은 키를 누르고 있는 동안이고, 잡힌 쪽은 언제든 뿌리친다.
    const gone = !target || target.dead || target.waiting;
    const tooFar = target && Math.abs(target.x - p.x) > GRAB_REACH * 1.8;
    if (p.dead || gone || tooFar) {
      release(p);
    } else {
      // 붙잡은 거리로 끌어당긴다. 상대 쪽에서도 같은 계산을 하므로 둘이 함께 모인다.
      pullTo(p, target, dt, GRAB_PULL_HOLDER);
      // 걸음은 걸음대로 두고 **팔만** 상대 쪽으로 보낸다. 오른쪽 사람을 붙잡은 채
      // 왼쪽으로 끌고 갈 수 있어야 한다.
      p.grabAim = Math.sign(target.x - p.x) || p.grabAim;
    }
  } else if (p.heldBy < 0) {
    p.grabAim = 0;
  }

  if (p.heldBy >= 0) {
    const holder = world.mp.others.get(p.heldBy);
    if (p.dead || !holder || holder.dead || holder.grabbing !== world.mp.myId) {
      p.heldBy = -1;
      p.grabAim = 0;
    } else {
      p.grabAim = Math.sign(holder.x - p.x) || p.grabAim;
      // 잡힌 쪽은 딸려간다. 끌고 가는 게 보이려면 이쪽이 더 세게 붙어야 한다.
      pullTo(p, holder, dt, GRAB_PULL_HELD);
      p.shake = 1;
    }
  }
}

export function press(world, action, down) {
  if (action === 'grab') {
    // 누르고 있는 동안 붙잡는다. 메뉴가 열려 있어도 **떼는 건** 받아야 한다 —
    // 안 그러면 잡은 채 메뉴를 열었다 닫는 것만으로 영영 붙잡고 있게 된다.
    if (!down) grabReleased(world);
    else if (!world.menu.open) grabPressed(world);
    return;
  }
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
    // ⌥← 는 한 겹 나가기다. 한 겹 안(끝낼까 묻는 중 · 화면 고르는 중)이면 첫 화면으로,
    // 첫 화면이면 메뉴를 닫는다.
    if (action === 'left') {
      if (world.menu.confirmQuit) { world.menu.confirmQuit = false; world.menu.index = 0; }
      else if (world.menu.pickScreen) { world.menu.pickScreen = false; world.menu.index = 0; }
      else openMenu(world, false);
    }
    return;
  }

  if (action === 'restart') {
    if (down && canRestart(world)) world.onMenu?.('again');
    return;
  }
  if (!(action in world.input)) return;
  world.input[action] = down;

  if (!down) return;
  if (world.state === 'ready') {
    // 같이 할 때 판을 여는 건 방장이다. 손님이 누르면 방장에게 부탁이 간다.
    world.mp.on ? world.onMenu?.('again') : (world.state = 'play');
  } else if (world.state === 'over' && action !== 'duck' && canRestart(world, 0.9)) {
    world.onMenu?.('again');
  }
}
