// 게임 상태. 그리는 일은 하지 않는다.

import { createSession, interpolate } from './net.js';
import { games, gameById, DEFAULT_GAME } from '../games/index.js';

const ACCEL = 5400;
const MAX_SPEED = 620;
const CROUCH_SPEED = 230;
const FRICTION = 4600;
const AIR_CONTROL = 0.62;
const JUMP_V = 480;
const GRAVITY = 1760;
const HALF_W = 9;

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

// 슬라이딩. 몸을 던져 못 닿을 공을 받는다.
//
// 달리기로는 못 닿는 자리가 있어야 몸을 던지는 게 뜻이 생긴다. 그래서 **달리기보다 빠르되
// 방향을 못 바꾸고**, 끝나면 잠깐 못 움직인다. 공짜로 빠른 이동이 되면 아무도 안 걷는다.
const SLIDE_SPEED = 880;
const SLIDE_TIME = 0.42;
const SLIDE_COOL = 0.55;

/// 이긴 사람이 만세를 부르는 시간. 이 동안은 다음 판을 못 시작한다 —
/// 이겼다는 걸 볼 새도 없이 다음 판이 시작되면 이길 이유가 없어진다.
export const VICTORY_SECONDS = 3;
export { ESCAPE_SHOVE };


export function createWorld(best, gameId = DEFAULT_GAME) {
  const game = gameById(gameId);
  return {
    w: 0, h: 0, groundY: 0,
    /// pick → ready → play → over.
    /// pick 은 무슨 게임을 할지 고르는 화면이다. 켜면 여기서 시작한다.
    state: 'pick',
    gameId: game.id,
    /// 지금 게임만 쓰는 살림살이. 똥이든 공이든 전부 여기 들어간다.
    bag: game.fresh(),
    /// 게임이 「이걸로 끝」이라고 알릴 때 부른다 (배구의 다섯 점처럼).
    onGameOver: null,
    elapsed: 0,          // 초
    dodged: 0,
    best: { ms: best.ms | 0, dodged: best.dodged | 0 },
    newRecord: false,
    frozen: 0,           // 다시 보일 때 주는 준비 시간
    overFor: 0,
    shake: 0,
    mp: createSession(),
    myResult: null,
    /// ⌥M 으로 여는 게임 안 메뉴. 메뉴 막대 아이콘을 못 찾아도 여기서 다 된다.
    menu: { open: false, index: 0, confirmQuit: false, sub: null },
    /// 셸이 알려 주는, 지금 물려 있는 화면들. 한 대뿐이면 비어 있는 것과 같이 친다.
    screens: [],
    /// 고르는 화면에서 짚고 있는 줄.
    pick: 0,
    /// 창 투명도. 셸이 정하고 알려 준다 — 실제로 흐리게 만드는 건 창 쪽 일이다.
    fade: 1,
    /// 편이 있는 게임에서 내가 선 편 (0/1). 판이 바뀌어도 남는다.
    team: undefined,
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
      /// 슬라이딩. 남은 시간과 미끄러지는 쪽. 배구에서 못 닿는 공을 몸을 던져 받는 동작이다.
      slide: 0, slideDir: 1, slideCool: 0,
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
  gameOf(world).resize?.(world);
}

/// 지금 하고 있는 게임.
export function gameOf(world) { return gameById(world.gameId); }

/// 몸을 던진다. 땅에 발이 붙어 있을 때만, 그리고 쉬는 시간이 끝났을 때만.
/// 미끄러지는 쪽은 **누르는 순간의 방향**으로 굳는다 — 도중에 못 튼다.
export function startSlide(world, dir) {
  const p = world.player;
  if (p.dead || p.air > 0 || p.slide > 0 || p.slideCool > 0) return false;
  p.slide = SLIDE_TIME;
  p.slideDir = dir || p.facing || 1;
  p.facing = p.slideDir;
  p.vx = p.slideDir * SLIDE_SPEED;
  if (world.debug) world.log?.(`슬라이딩 f${String(world.shot ?? 0).padStart(5, '0')} ${p.slideDir > 0 ? '→' : '←'} x=${Math.round(p.x)}`);
  return true;
}

/// 게임을 갈아 끼운다. 판은 처음부터 다시 시작한다.
export function pickGame(world, gameId) {
  world.gameId = gameById(gameId).id;
  restart(world);
  world.state = 'ready';
}

export function restart(world) {
  // 누르고 있는 키와 기록 콜백은 그대로 넘긴다 — 방향키를 잡은 채 다시 시작하면
  // 손을 떼었다 다시 누르지 않아도 바로 달려야 한다.
  const { w, h, best, input, onRecord, onDeath, onMenu, onGameOver,
          mp, menu, screens, gameId, pick, fade, team, debug, log, send } = world;
  Object.assign(world, createWorld(best, gameId),
                { w, h, input, onRecord, onDeath, onMenu, onGameOver,
                  mp, menu, screens, pick, fade, team, debug, log, send });
  world.state = 'ready';
  resize(world, w, h);
  spread(world);
  gameOf(world).begin?.(world);
}

/// 같이 할 때 다 같은 자리에 서면 첫 프레임부터 서로 밀어내며 엉킨다.
/// 번호 순으로 화면을 나눠 선다 — 모두가 같은 규칙으로 계산하므로 자리도 안 겹친다.
export function spread(world) {
  const mp = world.mp;
  if (!mp.on) {
    world.player.x = world.w / 2;
    gameOf(world).stand?.(world, 0, 1);
    return;
  }
  const ids = [mp.myId, ...mp.others.keys()].sort((a, b) => a - b);
  const slot = Math.max(0, ids.indexOf(mp.myId));
  world.player.x = (world.w * (slot + 1)) / (ids.length + 1);
  world.player.vx = 0;
  gameOf(world).stand?.(world, slot, ids.length);
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

  p.slideCool = Math.max(0, p.slideCool - dt);
  if (p.slide > 0) {
    // 미끄러지는 동안은 방향키도 점프도 안 듣는다. 던진 몸은 되돌릴 수 없다.
    p.slide -= dt;
    p.vx = p.slideDir * SLIDE_SPEED * Math.max(0.25, p.slide / SLIDE_TIME);
    p.x += p.vx * dt;
    const lo = HALF_W + 9;
    const hi = world.w - HALF_W - 9;
    if (p.x < lo) { p.x = lo; p.slide = 0; }
    if (p.x > hi) { p.x = hi; p.slide = 0; }
    gameOf(world).confine?.(world, p);
    p.walk += Math.abs(p.vx) * dt * 0.052;
    if (p.slide <= 0) { p.slide = 0; p.slideCool = SLIDE_COOL; p.vx *= 0.3; }
    return;
  }

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
  // 게임마다 발이 다르다. 똥피하기는 피하는 게임이라 조금 느려야 손에 잡히고,
  // 배구는 넓은 코트를 지켜야 해서 그대로 둔다.
  const pace = gameOf(world).pace ?? 1;
  let top = (MAX_SPEED - (MAX_SPEED - CROUCH_SPEED) * p.crouch) * pace;
  top *= Math.max(SQUEEZE_FLOOR, 1 - SQUEEZE_TOP * p.squeeze);
  // 잡은 쪽은 무겁고, 잡힌 쪽은 거의 못 간다.
  if (p.heldBy >= 0) top *= HELD_SPEED;
  else if (p.grabbing >= 0) top *= GRABBER_SPEED;
  if (dir !== 0) {
    // 남에게 끼여 있으면 발이 헛돈다. 못 가는 게 아니라 느려지는 것이라 뚫고 나갈 수는 있다.
    const accel = ACCEL * pace * (1 - SQUEEZE_DRAG * p.squeeze);
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
  // 게임이 더 좁은 울타리를 칠 수 있다. 배구는 네트 너머로 못 넘어간다.
  gameOf(world).confine?.(world, p);

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
export function kill(world) {
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

  const game = gameOf(world);

  if (world.state === 'over') {
    world.overFor += dt;
    game.update(world, dt);
    return;
  }

  if (world.mp.on && !game.noGrab) stepGrab(world, dt);
  if (!p.dead) movePlayer(world, dt);

  // 시작 전에도 게임은 굴린다. 배구는 여기서 공을 올려 두고 기다린다 —
  // 시작 신호가 와야 공이 생기면 첫 프레임에 공이 화면 구석에서 튀어나온다.
  if (world.state === 'ready' || world.state === 'pick') { game.update(world, dt); return; }

  world.elapsed += dt;
  game.update(world, dt);
}

/// 다음 판을 시작해도 되는 때인가. 우승 세리머니 중에는 안 된다.
export function canRestart(world, minimum = 0.45) {
  if (world.state !== 'over') return false;
  const wait = world.mp.winner ? VICTORY_SECONDS : minimum;
  return world.overFor > wait;
}

/// 고를 수 있는 투명도. 100% 는 지금까지와 같고, 아래로 갈수록 바탕화면이 비쳐 보인다.
/// 40% 밑으로는 안 내려간다 — 안 보이는 게임은 숨긴 것과 같고, 그건 ⌥H 가 할 일이다.
export const FADES = [1, 0.85, 0.7, 0.55, 0.4];

/// 메뉴에 세울 것들. 상황에 따라 달라지므로 그릴 때와 고를 때가 같은 함수를 본다.
export function menuItems(world) {
  if (world.menu.confirmQuit) {
    return [{ id: 'quitYes', label: '네, 끝낸다' }, { id: 'quitNo', label: '아니, 계속한다' }];
  }
  // 화면 고르기는 한 겹 안으로 들어간다. 모니터가 셋이면 첫 화면이 그것만으로 꽉 찬다.
  // 보던 중에 모니터를 뽑아 한 대만 남으면 고를 것이 없으니 그냥 첫 화면으로 돌아간다.
  if (world.menu.sub === 'team') {
    const names = gameById(world.gameId).teamNames ?? [];
    return names.map((name, side) => ({
      id: `team:${side}`, label: `${name} 편`,
      note: side === (world.team ?? 0) ? '지금 여기' : '이쪽으로',
      mark: side === (world.team ?? 0),
    }));
  }
  if (world.menu.sub === 'fade') {
    return FADES.map((f) => ({
      id: `fade:${f}`,
      label: f === 1 ? '그대로' : `${Math.round(f * 100)}%`,
      note: f === 1 ? '지금까지와 같다' : '바탕화면이 비친다',
      mark: Math.abs(f - world.fade) < 0.02,
    }));
  }
  if (world.menu.sub === 'screens' && world.screens.length > 1) {
    return world.screens.map((screen) => ({
      id: `screen:${screen.number}`,
      label: screen.name,
      note: `${screen.w}×${screen.h}`,
      mark: !!screen.current,
    }));
  }
  const items = [{ id: 'resume', label: '이어서 하기' }];
  // 「다시 시작」은 판을 하고 있을 때만. 고르는 화면과 시작 전에는 다시 시작할 판이 없다.
  if (world.state === 'play' || (world.state === 'over' && canRestart(world))) {
    items.push({ id: 'again', label: '다시 시작' });
  }
  if (world.mp.on) {
    items.push({ id: 'leave', label: world.mp.role === 'host' ? '방 닫기' : '방에서 나가기' });
  } else {
    items.push({ id: 'host', label: '방 만들기' });
    items.push({ id: 'join', label: '코드로 입장' });
  }
  items.push({ id: 'pick', label: '게임 바꾸기', note: gameById(world.gameId).name });
  const game = gameById(world.gameId);
  if (game.teamNames) {
    items.push({
      id: 'team', label: '편 고르기',
      note: game.teamNames[world.team ?? 0],
    });
  }
  items.push({
    id: 'fade', label: '투명도',
    note: world.fade >= 0.99 ? '그대로' : `${Math.round(world.fade * 100)}%`,
  });
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
  world.menu.sub = null;
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
    case 'pick':
      openMenu(world, false);
      world.state = 'pick';
      world.pick = Math.max(0, games.findIndex((g) => g.id === world.gameId));
      return;
    case 'screens':
      world.menu.sub = 'screens';
      world.menu.index = Math.max(0, world.screens.findIndex((screen) => screen.current));
      return;
    case 'team':
      // 편을 고르는 유일한 길. 네트는 못 넘으니 여기서 옮겨 준다.
      world.menu.sub = 'team';
      world.menu.index = world.team ?? 0;
      return;
    case 'fade':
      world.menu.sub = 'fade';
      world.menu.index = Math.max(0, FADES.findIndex((f) => Math.abs(f - world.fade) < 0.02));
      return;
    case 'again':
      openMenu(world, false);
      world.onMenu?.('again');
      return;
    default:
      // 화면을 옮기는 동안은 메뉴를 열어 둔다. 창이 그 모니터에 뜨는 걸 눈으로 보고
      // 아니다 싶으면 바로 다른 걸 고를 수 있어야 한다.
      // 화면과 투명도는 고르고도 메뉴를 열어 둔다. 바뀐 걸 눈으로 보고 다시 고를 수 있어야 한다.
      if (picked.id.startsWith('screen:') || picked.id.startsWith('fade:')
          || picked.id.startsWith('team:')) {
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
  // 고르는 화면. 여기서는 ⌥↑↓ 로 고르고 ⌥→ 로 시작하는 것 말고 아무것도 안 된다.
  if (world.state === 'pick' && !world.menu.open) {
    if (!down) return;
    if (action === 'jump') world.pick = (world.pick + games.length - 1) % games.length;
    if (action === 'duck') world.pick = (world.pick + 1) % games.length;
    if (action === 'right' || action === 'restart') pickGame(world, games[world.pick].id);
    if (action === 'menu') openMenu(world, true);
    return;
  }
  if (action === 'grab') {
    const game = gameOf(world);
    if (game.noGrab) {
      // 붙잡기가 없는 게임에서는 이 키를 게임이 가져간다 (배구의 때리기).
      if (down && !world.menu.open) game.action?.(world);
      return;
    }
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
      else if (world.menu.sub) { world.menu.sub = null; world.menu.index = 0; }
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
    // 아직 열 수 없는 판이면 아무 키도 안 먹는다. 이유는 시작 안내에 떠 있다.
    if (gameOf(world).blocked?.(world)) return;
    // 편을 고르는 게임은 방향키로 시작하지 않는다. 시작 전에 걸어서 자기 편으로 가야 하는데,
    // 한 걸음 떼자마자 판이 열리면 편을 고를 틈이 없다. ⌥R 로 시작한다.
    // 같이 할 때 판을 여는 건 방장이다. 손님이 누르면 방장에게 부탁이 간다.
    world.mp.on ? world.onMenu?.('again') : (world.state = 'play');
  } else if (world.state === 'over' && action !== 'duck' && canRestart(world, 0.9)) {
    world.onMenu?.('again');
  }
}
