// 배구.
//
// 가운데 네트, 좌우 두 편. 공이 우리 쪽 바닥에 닿으면 상대 점수. 다섯 점 먼저.
//
// 공을 누가 굴리나 — **방장이 굴린다.**
//
// 똥은 각자 굴려도 됐다. 사람과 부딪히지 않으니 각자 화면에서 계산이 조금 달라도
// 아무 일도 안 생긴다. 공은 다르다. 누가 언제 어느 각도로 쳤느냐로 궤적이 갈리는데,
// 화면마다 사람 자리가 몇 픽셀씩 다르면 **튀는 방향이 갈라지고 한번 갈라지면 안 돌아온다.**
// 내 화면에선 넘어간 공이 남의 화면에선 네트에 걸린다.
//
// 그래서 공은 방장 것이다. 방장이 굴리고 60Hz 로 자리와 속도를 뿌린다. 손님은 받은
// 속도로 사이를 메워 그리고, 어긋난 만큼은 사람한테 쓰는 것과 같은 방식으로 녹인다.

import { INK, RED, PENCIL, stroke, circle, text, PAPER } from '../draw/ink.js';
import { drawStickman } from '../draw/stickman.js';
import { BODY_H, SWING_TIME, SWING_WHIP, TOSS_TIME, ARM_LEN, swingShoulder } from '../draw/stickman.js';
import { startSlide, SLIDE_COOL } from '../game/world.js';

// 편은 옷 색으로 가른다. 번호가 아니라 **보이는 것**으로 갈라야 한 눈에 읽힌다.
//
// 이 게임의 빨강(#c63028)은 「너에게 중요한 것」 한 가지 뜻으로만 쓰기로 한 색이라
// 셔츠에는 다른 빨강을 쓴다 — 색연필로 칠한 듯한, 조금 어둡고 탁한 벽돌색.
const TEAM_INK = ['#b5352f', '#2f6fb0'];

const HAN = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

// 물리는 피카츄 배구(1997)의 것을 그대로 옮겼다.
//
// 원판은 432px 폭에 25fps 로 돌고, 값이 전부 「프레임당 픽셀」이다. 내 판은 1512px 이라
// 3.5배. 코트를 건너는 데 걸리는 시간이 같아지도록 그 배율로 옮겼다.
//
//   원판                        여기
//   중력      1 px/f²           2180 px/s²
//   최소 튀어오름  15 px/f       1310 px/s
//   강타      10~20 px/f        880 / 1760 px/s
//
// **가장 중요한 건 숫자가 아니라 이 한 줄이다: 몸에 맞을 때 vy = -|vy|.**
// 속도를 안 깎고 방향만 뒤집는다. 그래서 랠리가 갈수록 빨라지고, 마지막엔 아무도 못 받는다.
// 내가 처음에 만든 것은 맞을 때마다 정해진 속도로 리셋해서 영원히 같은 속도로 떠 있었다 —
// 그게 「느리다」의 정체였다.
const BALL_R = 20;
// 원판 값의 0.66배로 낮춰 둔다. 원판은 432px 코트를 두 사람이 지키지만 여기는 1512px 을
// 사람이 걸어서 지킨다 — 그대로 쓰면 손이 못 따라간다. 비율은 그대로라 느낌은 같다.
// 시간을 통째로 늦추는 값이라 중력·속도·강타가 한꺼번에 같은 비율로 준다.
const SLOW = 0.66;
const GRAVITY = 2180 * SLOW * SLOW;   // 중력은 시간의 제곱이라 두 번 곱한다
const MIN_UP = 1310 * SLOW;  // 맞으면 적어도 이만큼은 위로. 그보다 빨랐으면 그 속도 그대로
const OFF_CENTER = 44 * SLOW;     // 몸 가운데에서 벗어난 만큼 옆으로 — 대각선은 여기서 나온다
const CARRY = 0.45;         // 치는 사람이 달리던 속도가 실린다
const SMASH_SIDE = 1760 * SLOW;   // 방향키를 누르고 때리면
// 안 누르고 때리면 (수평 미사일). 원판 비율(880)대로 두었더니 받아 올린 공(MIN_UP 865)보다도
// 느렸다 — 강타가 토스보다 느리니 「세게 안 나간다」가 맞는 말이었다. 꼭대기에서 치면 받아
// 올린 공보다 한 뼘 빠르게(960쯤) 되도록 올렸다. 방향키를 누른 강타(SMASH_SIDE)는 그대로다.
const SMASH_FLAT = 1300 * SLOW;
/// 내리꽂는 세로 속도. **손보다 아래에 있는 공을 때렸을 때** 여기까지 간다.
const SMASH_DIVE = 2350 * SLOW;     // ⌥↓ 를 누르고 때리면 아래로 이 배수
const SMASH_UP = 1.6;       // ⌥↑ 를 누르고 때리면 위로 (넘겨 주기)
const SPIKE_REACH = 88;     // 손이 닿는 거리
const MAX_SPEED = 2600 * SLOW;
const WALL_KEEP = 0.98;     // 옆벽·천장은 거의 손실 없이 반사한다
// 천장은 화면 맨 위가 아니라 **한참 안쪽**이다.
//
// 처음엔 화면 끝에 뒀는데, 공이 거기까지 갈 일이 거의 없으니 천장이 없는 것과 같았다.
// 높이 뜬 공은 내려올 때까지 아무도 할 일이 없어서 랠리가 거기서 한 번씩 끊긴다.
// 낮춰 두면 세게 올린 공이 천장을 치고 빨리 돌아온다 — 화면도 덜 가린다.
const CEIL = 300;
// 위로 이보다 빠르게는 안 보낸다. 중력 950 에서 950 이면 475픽셀쯤 오른다 —
// 사람 머리 높이에서 때리면 딱 천장에 닿는다.
const MAX_UP = 950;
/// 공기 저항 계수 (1/픽셀). 초당 깎이는 비율이 DRAG × 속도다 —
/// 1800짜리 강타는 1초에 3할쯤 잦아들고, 500짜리 토스는 1할이 채 안 된다.
const DRAG = 0.00017;
// 바닥에서 네트 꼭대기까지.
//
// 사람 키가 60, 점프해서 머리가 125까지 간다. 95 로 두면 **서서는 못 넘기고 뛰면 넘긴다** —
// 원판도 네트가 사람 키의 1.2배쯤이라 뛰면 훌쩍 넘어간다.
const NET_H = 95;
const SERVE_UP = 900 * SLOW;
const WIN_AT = 5;
const RESET_WAIT = 1.1;     // 점수 난 뒤 다음 서브까지

// ── 스파이크의 손맛 ────────────────────────────────────────────────────────
//
// 공만 빨갛게 번쩍이고 끝나면 세게 쳤다는 게 안 읽힌다 — 실제로 그런 말을 들었다. 그래서 치는
// 순간을 **멈추고, 흔들고, 흩뿌리고, 늘여서** 보인다. 전부 한 번의 타격에 묶여 있다.
//
//   히트스톱  젖힌 팔이 공까지 오는 두 프레임 + 맞은 채 붙들어 두는 두 프레임(정타는 세 프레임).
//             공이 그만큼 멈췄다가 튀어 나간다. **손이 공에 닿는 순간 = 공이 떠나는 순간.**
//   흔들림    world.shake (죽을 때가 1, 흔들림 폭은 제곱×9px). 강타 0.45 → 2px, 정타 0.8 → 6px,
//             달아오른 공이 바닥에 꽂히면 한 번 더.
//   잔상      달아오른 공(hot) 뒤로 속도선 셋. 빠른 공은 가는 쪽으로 늘어나 그려진다.
//   탑스핀    달아오른 강타는 중력의 0.45배만큼 더 빨리 떨어진다 — 앞으로 도는 공이 꺾여 꽂히는 모양.
//
// **정타** — 점프 꼭대기(발이 52px 넘게 떴을 때)에서, 공 가운데가 손끝 36px 안에 있을 때 친 강타.
// 1.25배 세고 상한도 1.2배로 풀리고, 달아오른 동안 공기 저항을 안 받는다. 「쾅!」이 뜬다.
// 외우는 키가 아니라 **뛰는 때와 공을 맞추는 일**이고, 받는 쪽은 여전히 몸으로 받으면 받힌다 —
// 몸에 맞은 공은 속도와 상관없이 MAX_UP 까지만 떠오른다(bounceOff). 받아 내면 「받았다!」가 뜬다.
const JUMP_TOP = 65;          // world.js 의 점프(480 px/s, 중력 1760)가 올라가는 높이
const HIT_WHIP = SWING_WHIP;  // 팔이 공까지 오는 동안에도 공은 멈춰 있다
const HIT_HOLD = 2 / 60;      // 맞은 채 붙들어 두는 시간
const ACE_HOLD = 3 / 60;
const APEX_AIR = 52;          // JUMP_TOP 의 8할. 꼭대기 앞뒤 0.12초씩, 0.25초 창이다 (점프는 0.55초)
/// 손끝(발에서 BODY_H×0.86)에서 공 가운데까지. **36 으로 뒀더니 정타가 한 번도 안 나왔다** —
/// 몸이 세로로 긴 알약이라 공이 손에서 38px 까지밖에 못 다가온다. 그 안쪽은 치기 전에 몸에
/// 먼저 맞아 도로 떠오르는 자리다. 52 면 「손 닿고 몸엔 안 닿는」 자리의 16% 가 정타 칸이다
/// (3726칸 중 603칸, test/volley.mjs 가 이 숫자를 지킨다).
const SWEET_R = 52;
const ACE_POWER = 1.25;
const ACE_CAP = MAX_SPEED * 1.2;
const HOT_TIME = 0.7;         // 강타가 달아오른 채 가는 시간. 몸·벽·네트·바닥에 닿으면 식는다
const TOPSPIN = GRAVITY * 0.45;
const HOT_DRAG = 0.4;         // 보통 강타는 공기 저항을 4할만 받는다. 정타는 안 받는다
/// 친 사람 몸은 잠깐 공을 안 받는다. 머리 위 공을 내리꽂으면 공이 제 몸을 지나가는데,
/// 그 프레임에 몸에 맞아 도로 떠올라서 **강타가 토스가 됐다** (vy +1700 → -811, 시험에 남겼다).
const SELF_SKIP = 0.25;
const STOP_EPS = 1e-6;
const SHAKE_HIT = 0.45;
const SHAKE_ACE = 0.8;
const SHAKE_SLAM = 0.5;
const SHAKE_SLAM_ACE = 0.85;
/// 공중에서 공이 이만큼 가까워지면 팔을 젖힌다(준비 자세). 멀면 0, 가까우면 1.
const COCK_NEAR = 110;
const COCK_FAR = 230;
const FX_MAX = 24;

// 편 가르기.
//
// **서 있는 자리가 곧 편이다.** 따로 주고받는 값이 없다 — 자리는 어차피 60Hz 로 오간다.
// 판이 도는 동안은 네트를 못 넘으니 편이 안 바뀌고, 판과 판 사이에는 걸어서 넘어가면
// 편이 바뀐다. 「편 바꾸기」 메뉴를 따로 둘 필요가 없고, 누가 어느 편인지 보고 있으면 안다.
const NET_GAP = 14;   // 네트에 몸이 닿는 자리까지는 간다

export const sideOfX = (world, x) => (x < world.w / 2 ? 0 : 1);
const teamName = (side) => (side === 0 ? '빨강' : '파랑');

/// 편 나누기는 **방장이 한다.**
///
/// 각자 정하게 두면 몰린다. 손님은 들어온 시각이 달라서 자기가 몇 번째인지도 서로 다르게
/// 알고, 그 상태로 각자 홀짝을 세면 네 명이 다 한쪽에 설 수도 있다. 그래서 방장이
/// 번호 순으로 갈라 명단을 만들어 뿌리고, 손님은 그 명단을 따른다.
///
/// 손으로 바꾼 사람은 그 선택을 지켜 준다 — 방장에게 알려 두면 다음 명단부터 반영된다.
function rosterSides(world) {
  const mp = world.mp;
  // 관전 중인 사람은 뺀다. 아직 이 세트에 안 낀 사람까지 세면 편이 어그러진다.
  const ids = [
    ...(mp.waiting ? [] : [mp.myId]),
    ...[...mp.others.keys()].filter((id) => !mp.others.get(id)?.waiting),
  ].sort((a, b) => a - b);
  const picked = world.bag.picked ?? new Map();
  const out = new Map();
  let auto = 0;
  for (const id of ids) {
    if (picked.has(id)) out.set(id, picked.get(id));
    else out.set(id, auto++ % 2);       // 고른 사람을 빼고 남은 사람끼리 반씩
  }
  return out;
}

/// 지금 살아 있는 사람들을 편 별로 모은다. 이름표에 쓸 이름까지 같이.
export function teams(world) {
  const rows = [[], []];
  const add = (name, x, mine) => rows[sideOfX(world, x)].push({ name, mine });
  if (!world.mp.waiting) add(world.mp.myName || '나', world.player.x, true);
  for (const other of world.mp.others.values()) {
    if (other.waiting) continue;
    add(other.name || '?', other.x, false);
  }
  return rows;
}

/// 한쪽 편이 비었나. 비었으면 그 까닭을 돌려준다.
///
/// **2대1도 된다.** 편이 안 맞아도 하고 싶으면 하는 것이다 — 사무실에서 셋이 모이면
/// 그렇게 논다. 다만 **한쪽이 비면 안 된다.** 상대 없이 넘기는 건 배구가 아니고,
/// 공이 빈 코트에 떨어지면 그냥 점수만 쌓인다.
function emptySide(world) {
  if (!world.mp.on) return null;              // 혼자면 연습이니 막지 않는다
  const rows = teams(world);
  if (!rows[0].length) return '빨강 편에 아무도 없다';
  if (!rows[1].length) return '파랑 편에 아무도 없다';
  return null;
}

function serve(world, toSide) {
  const b = world.bag;
  b.ball.x = toSide === 0 ? world.w * 0.25 : world.w * 0.75;
  b.ball.y = world.groundY - NET_H - 260;
  b.ball.vx = 0;
  b.ball.vy = -Math.min(MAX_UP, SERVE_UP);
  b.ball.spin = 0;
  b.ball.spinV = (Math.random() - 0.5) * 2;
  cool(b.ball);
  b.ball.skip = null; b.ball.skipT = 0; b.ball.gT = 0;
  b.stop = 0;
  b.tail = [];
  b.wait = RESET_WAIT;
}

/// 달아오른 강타를 식힌다. 몸·벽·네트·바닥·서브 — 무엇이든 한 번 닿으면 보통 공이다.
function cool(ball) {
  ball.hot = 0; ball.ace = false; ball.topspin = false;
}

/// 공이 사람 몸에 닿았나. 몸은 세로로 긴 알약이라 가로·세로를 따로 본다.
function touches(ball, p) {
  const feet = p.groundY - p.air;
  // 미끄러지는 몸은 낮고 길다. 그래서 서서 못 받는 공을 받는다 — 그게 슬라이딩의 값이다.
  const sliding = (p.slide ?? 0) > 0;
  const top = feet - BODY_H * (sliding ? 0.42 : (1 - 0.44 * p.crouch));
  const half = sliding ? 42 : 11;
  const cx = Math.max(p.x - half, Math.min(ball.x, p.x + half));
  const cy = Math.max(top, Math.min(ball.y, feet));
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  return dx * dx + dy * dy < (BALL_R + 7) ** 2;
}

const clamp = (v, m) => Math.max(-m, Math.min(m, v));

/// 몸에 맞았다.
///
/// **속도를 안 깎는다.** vy = -|vy| 로 방향만 뒤집고, 그보다 느렸을 때만 최소값까지 올린다.
/// 이 한 줄이 랠리를 갈수록 빠르게 만든다 — 세게 온 공은 세게 나간다.
/// 가로는 **몸 가운데에서 얼마나 벗어나 맞았느냐**로 정해진다. 발끝에 맞히면 대각선으로
/// 멀리 날아가고, 정통으로 받으면 거의 수직으로 뜬다. 대각선을 만드는 건 조준이 아니라 자리다.
function bounceOff(ball, p) {
  const off = ball.x - p.x;
  ball.vx = clamp(off * OFF_CENTER + p.vx * CARRY, MAX_SPEED);
  const up = Math.abs(ball.vy);
  ball.vy = -Math.min(MAX_UP, Math.max(up, MIN_UP));
  ball.spinV = clamp(off * 0.12, 8);
  ball.hit = 1;                       // 맞은 자리에 잠깐 뜨는 표시
  ball.hitX = ball.x; ball.hitY = ball.y;
  // 몸 밖으로 밀어내 둔다. 안 그러면 다음 프레임에 또 맞아서 붙어 버린다.
  ball.y = Math.min(ball.y, p.groundY - p.air - BODY_H - BALL_R * 0.3);
}

/// 때리기의 알맹이. **누가 쳤든 결국 방장 화면에서 이 함수가 돈다.**
///
/// 공이 방장 것이라 손님이 자기 화면에서 공을 밀어 봐야 다음 꾸러미에 덮인다.
/// 그래서 손님은 「내가 여기서 이렇게 쳤다」를 보내고, 방장이 그 값으로 이 함수를 부른다.
/// 손님 화면에서도 부르지만 **공은 안 건드리고** 손맛(번쩍임·파편·흔들림)만 먼저 보인다.
///
/// 돌려주는 것: 못 쳤으면 null, 쳤으면 { kind, ace, face, hold, stop, x, y, smash }.
///   kind  0 토스(땅) · 1 강타 · 2 정타      face  몸을 돌려 칠 쪽(±1)
///   hold  맞댄 채 붙드는 시간                stop  공이 멈춰 있는 시간 = 휘두름 + hold
///   x, y  손끝이 공에 닿은 자리
function applyHit(world, at, want, body = null, who = -1) {
  const b = world.bag;
  const ball = b.ball;
  // 이미 누가 치고 있다(히트스톱 중). 멈춘 공을 둘이 동시에 치면 누구 것도 아니게 된다.
  if (b.stop > STOP_EPS) return null;
  const dx = ball.x - at.x;
  const dy = ball.y - (at.groundY - at.air - BODY_H * 0.7);
  if (dx * dx + dy * dy > SPIKE_REACH * SPIKE_REACH) return null;

  const away = at.side === 1 ? -1 : 1;             // 상대 코트 쪽
  const held = want.held | 0;
  let vx;
  let vy;
  let kind = 0;
  let ace = false;
  let lob = false;
  let smash = 0;
  if (at.air <= 12) {
    // 토스. 위로 올려 주고 옆으로는 살짝만.
    vx = clamp(dx * OFF_CENTER * 0.6 + held * 240, MAX_SPEED);
    // 받아 올릴 때마다 조금씩 죽인다. 1에 가까우면 랠리가 돌수록 공이 빨라져서
    // 나중에는 아무도 못 받는다 — 원판도 여기서 조금 깎는다.
    vy = -Math.min(MAX_UP, Math.max(Math.abs(ball.vy), MIN_UP) * 0.90);
  } else {
    // 공중 강타. **손보다 공이 아래에 있으면 꽂는다.**
    //
    // 실제 배구의 스파이크가 그렇다 — 공보다 높이 떠야 내리칠 수 있고, 밑에서 올려치면
    // 아무리 세게 쳐도 넘겨 주는 공이 된다. 그래서 이 게임의 스파이크는 외우는 키가 아니라
    // **뜨는 때를 맞추는 일**이 된다: 공이 떨어지기를 기다렸다가 손 높이 밑에서 때린다.
    //
    //   공이 손보다 아래  →  내리꽂기 (깊을수록 가파르다)
    //   공이 손 높이      →  수평 미사일 (원판의 그 장면)
    //   ⌥↓               →  무조건 최대로 꽂는다
    //   ⌥↑               →  높이 넘겨 주기
    const hand = at.groundY - at.air - BODY_H * 0.86;
    const under = (ball.y - hand) / (BODY_H * 0.55);
    const dive = want.down ? 1 : want.up ? 0 : Math.max(0, Math.min(1, under));
    // 높이 뜰수록 세다. 뛰자마자 치는 것과 꼭대기에서 치는 것이 같으면 점프에 뜻이 없다.
    // (예전엔 120 으로 나눴는데 점프가 65 까지밖에 안 올라가서 끝까지 못 썼다.)
    const lift = 0.78 + 0.34 * Math.min(1, at.air / JUMP_TOP);
    lob = !!want.up && !want.down;
    // 정타 — 꼭대기에서, 손끝으로.
    ace = !lob && at.air >= APEX_AIR && Math.hypot(ball.x - at.x, ball.y - hand) <= SWEET_R;
    const power = ace ? ACE_POWER : 1;
    const cap = ace ? ACE_CAP : MAX_SPEED;
    const side = held !== 0 ? held : away;
    // 가파르게 꽂을수록 가로로는 덜 간다. 힘의 총량은 그대로 두고 방향만 아래로 돌린다.
    vx = clamp(side * (held !== 0 ? SMASH_SIDE : SMASH_FLAT) * lift * (1 - 0.32 * dive) * power, cap);
    if (dive > 0.02) vy = clamp(SMASH_DIVE * dive * lift * power, cap);
    else if (want.up) vy = -Math.min(MAX_UP, Math.abs(ball.vy) * SMASH_UP);
    else vy = 0;                                   // 수평 미사일
    // 번쩍임 세기. 가파르게 꽂을수록 크게 터진다.
    smash = Math.max(0.4, dive);
    kind = ace ? 2 : 1;
  }

  const dir = Math.sign(vx) || away;
  const hold = kind === 0 ? 0 : ace ? ACE_HOLD : HIT_HOLD;
  const stop = kind === 0 ? 0 : HIT_WHIP + hold;
  // 몸을 어느 쪽으로 돌려 치나 — 공이 가는 쪽. 다만 공이 등 뒤 낮은 데 있으면 공 쪽을 본다
  // (그 자리를 앞으로 휘둘러 치려면 팔이 한 바퀴를 돌아야 한다).
  let face = dir;
  let hx = ball.x;
  let hy = ball.y;
  if (kind > 0) {
    if ((ball.x - at.x) * dir < -10 && ball.y > swingShoulder(at, dir).y - 10) face = -dir;
    // **공을 손끝으로.** 치는 거리(88)는 팔이 닿는 거리(팔 22 + 공 20)보다 넉넉하다 — 봐주는 몫이다.
    // 그 틈을 그대로 두면 팔이 허공을 치고 공이 혼자 날아간다. 팔은 1.3배까지 뻗고, 남는 틈은
    // 공이 손으로 온다. 공이 멈춰 있는 두 프레임 동안 미끄러져 오므로 순간이동으로 안 보인다.
    const s = swingShoulder(at, face);
    const gx = ball.x - s.x;
    const gy = ball.y - s.y;
    const far = Math.hypot(gx, gy);
    const keep = ARM_LEN * 1.3 + BALL_R * 0.8;
    if (far > keep) { hx = s.x + gx / far * keep; hy = s.y + gy / far * keep; }
  }
  const info = { kind, ace, face, hold, stop, x: hx, y: hy, smash };

  if (world.mp.role !== 'guest') {
    ball.vx = vx;
    ball.vy = vy;
    ball.spinV = clamp(vx * 0.006, 12);
    ball.smash = smash;
    if (kind > 0) {
      ball.gx = ball.x - hx; ball.gy = ball.y - hy; ball.gT = HIT_WHIP;
      ball.x = hx; ball.y = hy;
      b.stop = stop; b.stopHold = hold;
      // 넘겨 주기(⌥↑)는 강타가 아니다 — 달아오르지 않는다.
      if (lob) cool(ball);
      else { ball.hot = HOT_TIME; ball.ace = ace; ball.topspin = true; }
    } else {
      cool(ball);
    }
    // 친 사람 몸은 잠깐 공을 안 받는다 (SELF_SKIP).
    ball.skip = body; ball.skipT = body ? SELF_SKIP : 0;
    // 손님 화면에도 같은 순간에 같은 팔과 같은 번쩍임이 보여야 한다. 다음 꾸러미에 실어 보낸다.
    //   [x, y, 세기, 친 사람 번호, 종류, 몸 방향, 멈춤 시간] — 앞의 셋은 옛 모양 그대로다.
    b.flash = [Math.round(hx), Math.round(hy), Math.round(smash * 100) / 100,
               Number.isFinite(who) ? who : -1, kind, face, Math.round(stop * 1000) / 1000];
  }
  spawnHit(world, info);
  return info;
}

/// 친 사람에게 동작을 건다. 강타는 내리치는 팔(p.swing), 토스는 밀어 올리는 두 팔(p.toss).
/// late — 이미 이만큼 지난 뒤에 알게 됐다(손님이 꾸러미로 받을 때). 그만큼 앞선 박자에서 시작한다.
function startSwing(p, info, late = 0) {
  if (!p) return;
  if (info.kind === 0) { p.toss = Math.max(0, TOSS_TIME - late); return; }
  p.swing = Math.max(0.001, SWING_TIME - late);
  p.swingDir = info.face;
  p.swingHold = info.hold;
  p.aim = [info.x, info.y, BALL_R];
  p.cock = 1;
}

/// 옛 모양 꾸러미(번호 없이 [x, y, 세기])를 받았을 때 — 그 자리에 떠 있던 사람을 찾아 붙인다.
function nearestHitter(world, x, y, airborne) {
  let best = null;
  let near = 130 * 130;
  for (const p of [world.player, ...world.mp.others.values()]) {
    if (p.dead || (airborne && (p.air ?? 0) <= 8)) continue;
    const dx = p.x - x;
    const dy = (p.groundY - p.air - BODY_H * 0.7) - y;
    const gap = dx * dx + dy * dy;
    if (gap < near) { near = gap; best = p; }
  }
  return best;
}

/// ⌥Space — 때리기.
///
/// 원판의 강타를 그대로 옮겼다. **방향키를 안 누르고 공중에서 때리면 vy 가 0이 되어
/// 수평으로 쏘는 미사일**이 된다. 그게 피카츄 배구의 그 장면이다.
///
///   ⌥Space 만            → 수평 미사일 (880)
///   ⌥← 나 ⌥→ 를 누른 채  → 그 방향으로 두 배 (1760)
///   ⌥↓ 를 누른 채        → 내리꽂기
///   ⌥↑ 를 누른 채        → 높이 넘겨 주기
///
/// 땅에서 때리면 강타가 아니라 토스다. 뛰어야 세게 나간다.
export function spike(world) {
  const b = world.bag;
  const p = world.player;
  if (!b?.ball || world.state !== 'play' || p.dead || b.wait > 0) return false;

  // 손이 안 닿으면 **몸을 던진다.** 같은 키로 치기와 슬라이딩이 갈리는 기준은 거리다 —
  // 닿으면 치고, 안 닿으면 미끄러진다.
  //
  // **어느 쪽으로 던질지는 방향키가 정한다.** 공 쪽으로만 던지게 두면, 공은 대개 네트
  // 쪽에 있으니 늘 같은 방향으로만 몸을 날리게 된다 — 실제로 그랬다.
  // ⌥← 나 ⌥→ 를 잡고 누르면 그쪽으로, 아무것도 안 잡았으면 공 쪽으로 간다.
  const gap = b.ball.x - p.x;
  const dyNow = b.ball.y - (p.groundY - p.air - BODY_H * 0.7);
  if (gap * gap + dyNow * dyNow > SPIKE_REACH * SPIKE_REACH && p.air <= 0) {
    const lean = (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0);
    return startSlide(world, lean || Math.sign(gap) || p.facing);
  }

  const at = { x: p.x, air: p.air, groundY: p.groundY, side: world.team ?? 0 };
  const want = {
    held: (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0),
    down: !!world.input.duck,
    up: !!world.input.jump,
  };
  // 손님은 방장에게 부탁한다. 내 화면에서도 바로 반응은 보여 주되(손맛),
  // 진짜로 정하는 건 방장이다 — 곧 오는 꾸러미가 이 값을 덮는다.
  if (world.mp.role === 'guest') world.send?.({ t: 'gm', k: 'hit', at, want });
  const hit = applyHit(world, at, want, p, world.mp.myId);
  // 손님은 공을 못 건드리지만 **팔은 바로 돈다.** 내 손이 0.1초 늦게 움직이면
  // 내가 친 게 아니라 화면이 친 것처럼 느껴진다.
  if (hit) { startSwing(p, hit); b.mineAt = 0; }
  return !!hit;
}

/// 지나온 자리를 몇 개 남긴다. 빠른 공이 빨라 보이려면 잔상이 있어야 한다 —
/// 초당 1700픽셀로 날아가는 동그라미는 잔상이 없으면 그냥 순간이동으로 보인다.
const TRAIL = 7;
function trail(b, dt) {
  b.tail ??= [];
  b.tailT = (b.tailT ?? 0) - dt;
  if (b.tailT > 0) return;
  b.tailT = 1 / 90;
  b.tail.push([b.ball.x, b.ball.y]);
  while (b.tail.length > TRAIL) b.tail.shift();
}

/// 화면끼리 얼마나 같은지 재려고 남기는 자국. DDONG_DEBUG 일 때만 찍는다.
function report(world, b, dt) {
  if (!world.debug) return;
  b.logT = (b.logT ?? 0) - dt;
  if (b.logT > 0) return;
  b.logT = 1 / 20;
  // 방장은 자기 시계, 손님은 **방장이 말해 준 시계**로 찍는다. 그래야 나란히 놓고 견준다.
  const t = world.mp.role === 'guest' ? (world.mp.hostMs ?? 0) / 1000 : world.elapsed;
  world.log?.(`공 t=${t.toFixed(2)} x=${b.ball.x.toFixed(1)} y=${b.ball.y.toFixed(1)}`
    + ` v=${Math.round(Math.hypot(b.ball.vx, b.ball.vy))} 점수=${b.score.join(':')}`);
}

/// 맞은 자국·강타 번쩍임·팔 동작·파편이 시간에 따라 사그라든다. 판이 안 돌 때도 돈다 —
/// 안 그러면 마지막 점수를 낸 강타의 파편이 끝난 판 위에 얼어붙는다.
function visuals(world, b, dt) {
  const ball = b.ball;
  ball.hit = Math.max(0, (ball.hit ?? 0) - dt * 4);
  ball.smash = Math.max(0, (ball.smash ?? 0) - dt * 2.2);
  ball.gT = Math.max(0, (ball.gT ?? 0) - dt);
  // 내가 마지막으로 친 뒤 흐른 시간. 방장이 「네가 쳤다」고 알려 와도 두 번 안 터뜨리려고 센다.
  b.mineAt = Math.min(9, (b.mineAt ?? 9) + dt);
  // 팔 도는 시간은 world 가 모르는 값이라 여기서 줄인다. **공이 멈춰 있는 시간(b.stop)과 같은
  // 프레임에 같은 만큼 줄여야** 손이 공에서 떨어지는 순간과 공이 튀어 나가는 순간이 맞는다.
  for (const p of [world.player, ...world.mp.others.values()]) {
    if (p.swing > 0) p.swing = Math.max(0, p.swing - dt);
    if (p.toss > 0) p.toss = Math.max(0, p.toss - dt);
  }
  stepFx(world, b, dt);
}

/// 팔을 공에 맞춘다 — 휘두르는 사람은 공을 겨누고, 공중에서 공이 다가오는 사람은 팔을 젖힌다.
///
/// 젖힌 팔(p.cock)은 따로 주고받지 않는다. **공 자리와 사람 자리만으로 정해져서** 누구 화면에서
/// 셈해도 같은 사람이 같은 때에 팔을 젖힌다.
function arms(world, b, dt) {
  const [bx, by] = shownBall(b);
  const live = world.state === 'play' && !(b.wait > 0);
  for (const p of [world.player, ...world.mp.others.values()]) {
    // 휘두르는 중에는 젖힌 자세를 푼다 — 따라 휘기가 끝나면 그냥 공중 자세로 돌아가야 한다.
    // **겨눈 자리(p.aim)는 맞은 자리에 굳혀 둔다.** 날아가는 공을 계속 겨누게 두면 이미 때린
    // 팔이 공을 쫓아 홱 돌아간다 — 따라 휘기가 따라 휘기로 안 보인다.
    let want = 0;
    if (!(p.swing > 0) && live && !p.dead && !p.waiting && (p.air ?? 0) > 6) {
      const near = Math.hypot(bx - p.x, by - (p.groundY - p.air - BODY_H * 0.7));
      want = Math.max(0, Math.min(1, (COCK_FAR - near) / (COCK_FAR - COCK_NEAR)));
    }
    p.cock = (p.cock ?? 0) + (want - (p.cock ?? 0)) * Math.min(1, dt * 14);
    if (p.cock < 0.002) p.cock = 0;
  }
}

/// 공이 그려지는 자리. 방장 화면에서는 손끝으로 옮겨 붙인 공이 휘두름 두 프레임에 걸쳐
/// 미끄러져 온다(손님은 꾸러미 오차를 녹이는 것으로 같은 일이 된다).
function shownBall(b) {
  const k = (b.ball.gT ?? 0) > 0 ? (b.ball.gT / HIT_WHIP) ** 2 : 0;
  return [b.ball.x + (b.ball.gx ?? 0) * k, b.ball.y + (b.ball.gy ?? 0) * k];
}

// ── 타격 자국 ──────────────────────────────────────────────────────────────
//
// 파편·먼지·글자는 **화면마다 따로** 굴린다. 방장이 알려 주는 건 「언제 어디서 무엇이」뿐이고,
// 파편 하나하나가 어디로 튀는지는 화면마다 달라도 아무도 모른다. 꾸러미를 무겁게 할 이유가 없다.

/// 강타 자국. 손이 공에 닿는 순간(휘두름 두 프레임 뒤)에 터진다 — 누르는 순간에 터지면
/// 팔이 아직 머리 뒤에 있는데 공이 먼저 터진다.
function spawnHit(world, info, late = 0) {
  const b = world.bag;
  if (info.kind === 0) {
    b.ball.hit = 1; b.ball.hitX = info.x; b.ball.hitY = info.y;
    return;
  }
  const ace = info.kind === 2;
  const bits = [];
  const n = ace ? 12 : 8;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = (ace ? 200 : 150) + Math.random() * (ace ? 240 : 150);
    // 공이 가는 쪽으로 조금 더 쏠린다.
    bits.push({ x: 0, y: 0, vx: Math.cos(a) * sp + info.face * 140, vy: Math.sin(a) * sp - 90,
                len: 5 + Math.random() * 7, seed: 150 + i });
  }
  addFx(b, { k: 'hit', x: info.x, y: info.y, t: late - HIT_WHIP, life: ace ? 0.62 : 0.45,
             ace, face: info.face, bits, shake: ace ? SHAKE_ACE : SHAKE_HIT, word: ace ? '쾅!' : null });
}

/// 달아오른 강타가 바닥에 꽂혔다. 먼지가 양옆으로 일고 바닥에 금이 간다.
function spawnSlam(world, x, ace) {
  const b = world.bag;
  netEvent(world, [1, Math.round(x), 0, ace ? 1 : 0]);
  const puffs = [];
  const n = ace ? 10 : 7;
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    puffs.push({ x: 0, y: 0, vx: side * (90 + Math.random() * (ace ? 260 : 170)),
                 vy: -(20 + Math.random() * 70), r: 5 + Math.random() * 5, seed: 170 + i });
  }
  const cracks = [];
  for (let i = 0; i < (ace ? 5 : 3); i++) {
    const a = (i / (ace ? 4 : 2) - 0.5) * 2.2 + (Math.random() - 0.5) * 0.3;
    cracks.push({ a, len: 14 + Math.random() * (ace ? 22 : 12), seed: 190 + i });
  }
  addFx(b, { k: 'slam', x, y: world.groundY, t: 0, life: 0.65, ace, bits: puffs, cracks,
             shake: ace ? SHAKE_SLAM_ACE : SHAKE_SLAM, word: ace ? '쿵!' : null });
}

/// 달아오른 강타를 몸으로 받아 냈다. 받는 쪽도 칭찬을 받아야 한다.
function spawnDig(world, x, y) {
  netEvent(world, [2, Math.round(x), Math.round(y), 0]);
  addFx(world.bag, { k: 'dig', x, y, t: 0, life: 0.55, word: '받았다!' });
}

/// 남의 화면에서도 같은 자국이 터지게 한 줄 남겨 둔다. 파편 하나하나가 어디로 튀는지는
/// 화면마다 달라도 되지만 **언제 어디서 터졌나**는 같아야 한다. pack 이 한 번만 싣고 비운다.
function netEvent(world, ev) {
  if (world.mp.role === 'guest') return;       // 손님은 받기만 한다
  const b = world.bag;
  (b.events ??= []).push(ev);
  if (b.events.length > 8) b.events.splice(0, b.events.length - 8);
}

function addFx(b, fx) {
  b.fx ??= [];
  b.fx.push(fx);
  if (b.fx.length > FX_MAX) b.fx.splice(0, b.fx.length - FX_MAX);
}

function stepFx(world, b, dt) {
  if (!b.fx?.length) return;
  for (const f of b.fx) {
    const was = f.t;
    f.t += dt;
    if (f.t < 0) continue;
    if (f.shake && !f.shook) { world.shake = Math.max(world.shake ?? 0, f.shake); f.shook = true; }
    const step = was < 0 ? f.t : dt;
    const fall = f.k === 'slam' ? 120 : 900;           // 먼지는 거의 안 떨어진다
    const drag = Math.exp(-step * (f.k === 'slam' ? 4.5 : 2.2));
    for (const s of f.bits ?? []) {
      s.vx *= drag; s.vy = s.vy * drag + fall * step;
      s.x += s.vx * step; s.y += s.vy * step;
    }
  }
  b.fx = b.fx.filter((f) => f.t < f.life);
}

/// 뒤에 깔리는 자국(고리·파편·먼지·금)과 위에 뜨는 글자를 따로 그린다.
function drawFx(ctx, b, upright, front) {
  for (const f of b.fx ?? []) {
    if (f.t < 0) continue;
    const g = Math.min(1, f.t / f.life);
    const fade = 1 - g;
    if (front) {
      if (!f.word) continue;
      // 톡 튀어나왔다가(0.08초) 떠오르며 옅어진다.
      const pop = 1 + 0.55 * Math.max(0, 1 - f.t / 0.08);
      const size = Math.round((f.k === 'dig' ? 14 : f.ace ? 22 : 17) * pop);
      const y = f.y - (f.k === 'slam' ? 30 : 34) - 20 * (1 - (1 - g) ** 2);
      const color = f.k === 'dig' ? INK : RED;
      upright(f.x, y, () => text(ctx, f.word, f.x, y, {
        font: `900 ${size}px ${HAN}`, color, align: 'center', halo: 4, alpha: Math.min(1, fade * 1.8),
      }));
      continue;
    }
    upright(f.x, f.y, () => {
      if (f.k === 'hit') {
        const e = 1 - (1 - g) ** 2;
        circle(ctx, f.x, f.y, BALL_R * (1 + e * (f.ace ? 1.5 : 1.0)), {
          width: 1 + 2.4 * fade, color: f.ace ? RED : INK, seed: 77, amp: 1.4, halo: false, alpha: 0.9 * fade,
        });
        if (f.ace) {
          circle(ctx, f.x, f.y, BALL_R * (1 + e * 0.8), {
            width: 1 + 1.6 * fade, color: INK, seed: 78, amp: 1.2, halo: false, alpha: 0.65 * fade,
          });
          // 번쩍임 살 — 원판의 그 번쩍임. 공 반지름의 절반쯤 되는 짧은 선 여덟.
          for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + 0.2;
            const r0 = BALL_R * (1.15 + e * 0.8);
            const r1 = r0 + 8 + e * 13;
            stroke(ctx, [[f.x + Math.cos(a) * r0, f.y + Math.sin(a) * r0],
                         [f.x + Math.cos(a) * r1, f.y + Math.sin(a) * r1]],
                   { width: 2.2, color: RED, seed: 80 + i, amp: 0.8, halo: false, alpha: 0.85 * fade });
          }
        }
        for (const s of f.bits) {
          const sp = Math.hypot(s.vx, s.vy) || 1;
          const x0 = f.x + s.x;
          const y0 = f.y + s.y;
          stroke(ctx, [[x0, y0], [x0 - s.vx / sp * s.len, y0 - s.vy / sp * s.len]],
                 { width: 2.4, color: f.ace && s.seed % 2 ? RED : INK, seed: s.seed, amp: 0.5,
                   halo: false, alpha: fade });
        }
      } else if (f.k === 'slam') {
        for (const s of f.bits) {
          circle(ctx, f.x + s.x, f.y - 4 + s.y, s.r * (1 + g * 1.6), {
            width: 1.8, color: PENCIL, seed: s.seed, amp: 1.1, halo: false, alpha: 0.75 * fade,
          });
        }
        // 바닥의 금. 지그재그 세 마디.
        for (const c of f.cracks) {
          const ux = Math.sin(c.a);
          const uy = Math.abs(Math.cos(c.a)) * 0.45 + 0.1;     // 바닥 선 밑으로 비스듬히
          const pts = [[f.x, f.y]];
          for (let j = 1; j <= 3; j++) {
            const d = (c.len * j) / 3;
            pts.push([f.x + ux * d + (j % 2 ? 3 : -3) * uy, f.y + uy * d * 0.9]);
          }
          stroke(ctx, pts, { width: 2.2, color: INK, seed: c.seed, amp: 0.6, halo: false,
                             alpha: Math.min(1, fade * 1.6), sharp: true });
        }
      } else if (f.k === 'dig') {
        circle(ctx, f.x, f.y, BALL_R * (1.1 + g * 1.4), {
          width: 2, color: PENCIL, seed: 79, amp: 1.2, halo: false, alpha: 0.7 * fade,
        });
      }
    });
  }
}

/// 머리 위 게이지. **비었다가 쭉 차면 다시 던질 수 있다.**
///
/// 쿨타임을 숫자로 알려 주면 아무도 안 읽는다. 막대가 차오르는 건 곁눈으로도 보인다.
/// 내 것만 그린다 — 남의 쿨타임은 오가지도 않고 알 필요도 없다.
export function slideGauge(p) {
  // 미끄러지는 동안은 비어 있고, 그 뒤 쿨타임 동안 찬다. 1 이면 또 던질 수 있다.
  if (p.slide > 0) return 0;
  if (p.slideCool > 0) return Math.max(0, 1 - p.slideCool / SLIDE_COOL);
  return 1;
}

function drawSlideGauge(ctx, world, upright) {
  const b = world.bag;
  const p = world.player;
  if (p.dead || world.mp.waiting || world.state !== 'play') return;
  const cooling = p.slide > 0 || p.slideCool > 0;
  if (!cooling && !(b.readyFlash > 0)) return;

  const full = slideGauge(p);
  const w = 44;
  const h = 6;
  const x = p.x - w / 2;
  const y = p.groundY - p.air - BODY_H - 36;   // 이름표 위. 겹치면 둘 다 못 읽는다
  const tint = TEAM_INK[world.team ?? 0];
  const fading = !cooling ? Math.min(1, b.readyFlash / 0.35) : 1;

  upright(p.x, y, () => {
    // 테두리. 손으로 그은 네모라 게임 그림체와 붙는다.
    stroke(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
           { width: 1.6, color: PENCIL, seed: 95, amp: 0.4, close: true, sharp: true,
             halo: false, alpha: 0.75 * fading });
    if (full > 0.01) {
      const fill = Math.max(2, (w - 4) * full);
      stroke(ctx, [[x + 2, y + h / 2], [x + 2 + fill, y + h / 2]],
             { width: h - 2.4, color: full >= 0.999 ? tint : PENCIL, seed: 96, amp: 0.25,
               halo: false, alpha: (full >= 0.999 ? 0.95 : 0.7) * fading });
    }
  });
}

/// 끝났나. 다섯 점 먼저, 단 **두 점 차**로. 4:4 부터는 듀스 — 5:4 로는 안 끝나고 6:4 라야 끝난다.
export function matchOver(score) {
  const [a, c] = score;
  return Math.max(a, c) >= WIN_AT && Math.abs(a - c) >= 2;
}

/// 듀스 중인가. 둘 다 네 점 이상이면 그때부터는 두 점 차 싸움이다.
export function deuce(score) {
  return Math.min(score[0], score[1]) >= WIN_AT - 1;
}

function point(world, toSide) {
  const b = world.bag;
  b.score[toSide]++;
  b.lastPoint = { side: toSide, at: world.elapsed };
  serve(world, 1 - toSide);                        // 진 쪽에서 다시 올린다
}

export default {
  id: 'volley',
  name: '배구',
  line: '빨강 편 대 파랑 편. 우리 쪽에 떨어뜨리면 상대 점수. 다섯 점 먼저, 4:4 부터는 듀스 (두 점 차).',
  keys: [['⌥ ← →', '달리기 (네트는 못 넘는다)'], ['⌥ ↑', '점프'],
         ['⌥ Space', '때리기 — 뛰어서 누르면 강타'],
         ['⌥ Space + ← →', '그 방향으로 세게'], ['⌥ Space + ↓', '내리꽂기 (공이 손 밑이면 그냥도)'],
         ['⌥ Space (멀 때)', '슬라이딩 — ⌥←→ 쪽으로, 머리 위 막대가 차면']],
  tally: (world) => `${world.bag?.score?.[0] ?? 0} : ${world.bag?.score?.[1] ?? 0}`,
  /// 배구는 몸으로 공을 맞히는 게임이라 서로 붙잡으면 아무것도 안 된다.
  noGrab: true,
  /// 편 이름. 이게 있으면 메뉴에 「편 고르기」가 생긴다.
  teamNames: ['빨강', '파랑'],

  /// 판을 열 수 있나. 못 열면 그 이유를 돌려준다.
  ///
  /// **2대1도 된다.** 편이 안 맞아도 하고 싶으면 하는 것이다 — 사무실에서 셋이 모이면
  /// 그렇게 논다. 다만 **한쪽이 비면 안 된다.** 상대 없이 넘기는 건 배구가 아니고,
  /// 공이 빈 코트에 떨어지면 그냥 점수만 쌓인다.
  blocked: (world) => emptySide(world),
  /// 옷 색은 번호가 아니라 **선 자리**로 정한다. 왼쪽은 빨강, 오른쪽은 파랑.
  /// 만세 부르는 우승 인형은 번호가 음수로 온다 (-1 빨강, -2 파랑) — 그건 자리로 못 정한다.
  shirt: (world, x, id) => TEAM_INK[id < 0 ? -1 - id : sideOfX(world, x)],

  /// **시계를 안 띄운다.** 배구는 오래 버티는 게임이 아니다. 점수는 네트 위에 있고,
  /// 시간은 아무 뜻이 없는데 화면 왼쪽 위를 제일 큰 글씨로 차지하고 있었다.
  noClock: true,
  /// **순위표도 안 띄운다.** 끝나면 이긴 편만 남는다 — 만세 부르는 인형과 편 이름.
  noResults: true,
  /// ⌥Space 를 이 게임이 가져간다.
  action: (world) => spike(world),

  /// 사람 그리는 법. 졸라맨 그대로인데 **치는 모션 스위치만 켠다.** 졸라맨은 다른 게임도
  /// 쓰니 p.swing·p.toss·p.cock 을 아무나 읽게 두면, 휘두르던 사람이 판을 갈아 끼운 뒤
  /// 다음 게임에서 그 자세로 굳는다. 켜고 끄는 자리를 여기 하나로 둔다.
  figure: (ctx, p, time, seed, opts = {}) => drawStickman(ctx, p, time, seed, { ...opts, spike: true }),

  /// **네트는 못 넘는다.** 이게 팀전을 팀전으로 만든다 — 넘어 다닐 수 있으면 편이
  /// 이름뿐이고, 결국 다 같이 공 하나를 쫓는 게임이 된다. 언제나 자기 구역 안이다.
  /// 편을 바꾸려면 ⌥M → 편 바꾸기.
  confine(world, p) {
    if (world.mp.waiting) return;      // 관전 중에는 아무 데나 서 있어도 된다
    const side = world.team ?? 0;
    const half = world.w / 2;
    if (side === 0 && p.x > half - NET_GAP) { p.x = half - NET_GAP; p.vx = Math.min(0, p.vx); }
    if (side === 1 && p.x < half + NET_GAP) { p.x = half + NET_GAP; p.vx = Math.max(0, p.vx); }
  },

  /// 자기 코트에 선다. 편을 아직 안 정했으면 번호 순으로 갈라 반씩 나눠 갖는다.
  stand(world, slot) {
    if (world.team === undefined) world.team = slot % 2;
    const half = world.w / 2;
    world.player.x = world.team === 0
      ? half * (0.3 + 0.4 * Math.random())
      : half + half * (0.3 + 0.4 * Math.random());
    world.player.vx = 0;
  },

  /// 판이 새로 열릴 때. 점수를 지우고 공을 다시 올린다.
  begin(world) {
    world.bag.score = [0, 0];
    world.bag.started = false;
  },

  fresh: () => ({
    ball: { x: 0, y: 0, vx: 0, vy: 0, spin: 0, spinV: 0, hit: 0, smash: 0, hitX: 0, hitY: 0,
            // 달아오른 강타: 남은 시간 · 정타인가 · 탑스핀인가. 친 사람 몸을 건너뛰는 몫(skip)과
            // 손끝으로 미끄러져 오는 몫(g*) 도 여기 산다.
            hot: 0, ace: false, topspin: false, skip: null, skipT: 0, gx: 0, gy: 0, gT: 0 },
    tail: [], tailT: 0,
    // 타격 자국(각자 굴린다) · 남에게 알릴 한 줄짜리 일 · 히트스톱 남은 시간.
    fx: [], events: [], stop: 0, stopHold: 0, mineAt: 9,
    score: [0, 0], wait: RESET_WAIT, lastPoint: null, started: false, emptyFor: 0,
    // 손님이 받은 공을 부드럽게 따라가려고 남겨 두는 것.
    age: 0, errorX: 0, errorY: 0, baseX: undefined,
  }),

  update(world, dt) {
    const b = world.bag;
    // 슬라이딩 게이지. 다 찬 뒤에도 잠깐 더 보여 준다 — 「이제 된다」를 봐야
    // 다음 번에 언제 누를지 알 수 있다.
    const p = world.player;
    const cooling = p.slide > 0 || p.slideCool > 0;
    if (cooling) b.readyFlash = 0.7;
    else b.readyFlash = Math.max(0, (b.readyFlash ?? 0) - dt);
    if (!b.started) {
      // 판 크기를 알게 된 첫 프레임에 공을 올린다.
      if (!world.w) return;
      serve(world, Math.random() < 0.5 ? 0 : 1);
      b.started = true;
    }
    // 방장은 자기가 만든 명단을 자기도 따른다. 안 그러면 방장만 딴 편에 서 있게 된다.
    if (world.mp.role === 'host') {
      const mine = rosterSides(world).get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) {
        world.team = mine;
        const half = world.w / 2;
        if (mine === 0 && world.player.x > half) world.player.x = half * 0.6;
        if (mine === 1 && world.player.x < half) world.player.x = half * 1.4;
      }
    }
    // 자국·팔 동작·파편은 **판이 도는 것과 상관없이** 사그라든다. 서브를 기다리는 동안에도,
    // 판이 끝난 뒤에도 돈다 — 안 그러면 마지막 점수를 낸 강타의 먼지와 「쿵!」이 끝난 판 위에
    // 얼어붙은 채로 우승 화면까지 따라온다.
    visuals(world, b, dt);
    arms(world, b, dt);
    if (world.state !== 'play') return;

    // 손님은 방장이 뿌린 공을 따라 그리기만 한다. 판정도 방장이 한다.
    if (world.mp.role === 'guest') {
      // **첫 꾸러미가 오기 전에는 계산하지 않는다.** 안 그러면 없는 값으로 셈해서 NaN 이 되고,
      // 그 NaN 이 다음 꾸러미의 오차 계산에 다시 들어가 영영 안 돌아온다.
      if (b.baseX === undefined) return;
      b.age = Math.min(b.age + dt, 0.18);
      b.errorX *= Math.exp(-dt / 0.06);
      b.errorY *= Math.exp(-dt / 0.06);
      b.ball.x = b.baseX + b.baseVX * b.age + b.errorX;
      // 탑스핀도 방장과 같은 식으로 이어 그린다. 안 그러면 달아오른 공만 손님 화면에서
      // 조금 위로 뜨고, 그 차이가 꾸러미마다 다시 녹느라 공이 미세하게 떤다.
      const g = GRAVITY + (b.ball.topspin ? TOPSPIN : 0);
      b.ball.y = b.baseY + b.baseVY * b.age + 0.5 * g * b.age * b.age + b.errorY;
      b.ball.spin += b.ball.spinV * dt;
      trail(b, dt);
      report(world, b, dt);
      return;
    }

    // **판이 도는 중에 한쪽이 비면 거기서 끊는다.** 안 그러면 빈 코트에 공이 떨어지며
    // 혼자 남은 편이 다섯 점을 채운다 — 이긴 것도 아니고 진 것도 아닌 판이 된다.
    b.emptyFor = emptySide(world) ? (b.emptyFor ?? 0) + dt : 0;
    if (b.emptyFor > 0.6) {
      b.emptyFor = 0;
      b.score = [0, 0];
      world.onGameOver?.({ name: null, rows: [] });
      return;
    }

    if (b.wait > 0) { b.wait -= dt; return; }

    const ball = b.ball;

    // **히트스톱.** 젖힌 팔이 공까지 내려오는 두 프레임 + 손이 공에 붙어 있는 두 프레임
    // (정타는 세 프레임), 그동안 공은 제자리에서 돌기만 한다. 속도는 이미 실려 있고 자리만
    // 멎어 있다 — 그 4~5프레임이 「쾅」 하는 손맛을 만든다. 공이 빨라지기만 해서는
    // 세게 친 게 안 읽힌다는 말을 실제로 들었다.
    if (b.stop > STOP_EPS) {
      b.stop = Math.max(0, b.stop - dt);
      ball.spin += ball.spinV * dt;
      report(world, b, dt);
      return;
    }
    // 친 사람 몸은 잠깐 공을 안 받는다 (SELF_SKIP).
    ball.skipT = Math.max(0, (ball.skipT ?? 0) - dt);
    if (ball.skipT <= 0) ball.skip = null;
    // 달아오른 시간이 다 되면 그냥 공이다.
    if (ball.hot > 0) {
      ball.hot = Math.max(0, ball.hot - dt);
      if (ball.hot <= 0) cool(ball);
    }
    // **탑스핀.** 앞으로 도는 강타는 중력의 1.45배로 떨어진다 — 포물선이 아니라 꺾여 꽂힌다.
    ball.vy += (GRAVITY + (ball.topspin ? TOPSPIN : 0)) * dt;

    // 공기 저항. **빠를수록 많이 깎인다** (제곱 저항).
    //
    // 이게 없으면 한 번 세게 때린 공이 그 속도를 영영 갖고 다닌다. 벽과 사람 사이를
    // 같은 세기로 왕복하는 게 「너무 튄다」로 읽힌다. 살살 올린 공은 거의 그대로고,
    // 미사일처럼 날아간 공만 눈에 띄게 잦아든다 — 실제 공이 그렇다.
    const speed = Math.hypot(ball.vx, ball.vy);
    if (speed > 0) {
      // 달아오른 강타는 공기를 4할만 타고, 정타는 아예 안 탄다. 세게 친 공이 네트도 못 넘고
      // 잦아들면 세게 친 보람이 없다 — 달아오른 0.7초 동안만 뚫고 간다.
      const air = ball.hot > 0 ? (ball.ace ? 0 : HOT_DRAG) : 1;
      const lose = Math.min(0.5, DRAG * speed * dt * air);
      ball.vx -= ball.vx * lose;
      ball.vy -= ball.vy * lose;
    }

    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += ball.spinV * dt;

    // 옆벽과 천장. **들어간 만큼 되접는다** — 벽에 자리를 붙여 버리면 안 된다.
    //
    // 초당 2900픽셀이면 한 프레임에 48픽셀을 간다. 벽을 지난 자리를 그냥 벽에 붙이면
    // 그 48픽셀이 사라져서 공이 벽에 잠깐 붙었다 튀는 것처럼 보이고, 다음 프레임에도
    // 조건에 걸려 번쩍임이 계속 뜬다. 들어간 깊이만큼 되접으면 **입사각 그대로 반사각**이
    // 나오고, 벽을 지나친 그 프레임에만 한 번 튄다.
    const reflect = (lo, hi, get, set, getV, setV) => {
      const v = getV();
      if (get() < lo && v < 0) { set(lo + (lo - get())); setV(-v * WALL_KEEP); return true; }
      if (get() > hi && v > 0) { set(hi - (get() - hi)); setV(-v * WALL_KEEP); return true; }
      return false;
    };
    const bounced =
      reflect(BALL_R, world.w - BALL_R, () => ball.x, (v) => { ball.x = v; },
              () => ball.vx, (v) => { ball.vx = v; })
      | reflect(CEIL, Infinity, () => ball.y, (v) => { ball.y = v; },
                () => ball.vy, (v) => { ball.vy = v; });
    // 벽에 한 번 닿으면 그냥 공이다. 벽을 맞고도 달아오른 채로 다니면 아무도 못 받는다.
    if (bounced) { ball.hit = 1; ball.hitX = ball.x; ball.hitY = ball.y; cool(ball); }

    // 네트. 꼭대기는 넘어가고, 몸통에 맞으면 되돌아온다.
    const netX = world.w / 2;
    const netTop = world.groundY - NET_H;
    // 공은 그물 **면**에서 튄다 — 사람이 닿아 멈추는 자리(NET_GAP)와 같은 폭. 가운데 선에서 튀면 그물을 11px 파고든 뒤 튀어 보였다.
    if (Math.abs(ball.x - netX) < BALL_R + NET_GAP && ball.y > netTop) {
      ball.x = netX + Math.sign(ball.x - netX || 1) * (BALL_R + NET_GAP);
      ball.vx = -ball.vx * 0.55;
      cool(ball);
    }

    trail(b, dt);
    report(world, b, dt);

    // 사람에게 맞았나. 살아 있는 사람만 친다.
    const bodies = [world.player, ...world.mp.others.values()].filter((p) => !p.dead && !p.waiting);
    for (const p of bodies) {
      // 머리 위 공을 내리꽂으면 공이 제 몸을 지나간다. 그 프레임에 몸에 맞아 도로 떠오르면
      // **강타가 토스가 된다** (vy +1700 → -811 을 실제로 봤다). 친 사람만 잠깐 건너뛴다.
      if (p === ball.skip || !touches(ball, p)) continue;
      // **달아오른 강타를 몸으로 받아 냈다.** 아무리 세게 와도 몸에 맞은 공은 MAX_UP 까지만
      // 떠오른다(bounceOff) — 정타가 사기가 안 되는 건 여기다. 받아 낸 쪽에 「받았다!」가 뜬다.
      if (ball.hot > 0) spawnDig(world, ball.x, ball.y);
      cool(ball);
      bounceOff(ball, p);
      break;
    }

    // 바닥에 **닿는 순간** 끝이다. 떨어진 자리에 자국만 남기고 곧바로 다음 서브로 넘어간다.
    if (ball.y + BALL_R >= world.groundY) {
      ball.hit = 1; ball.hitX = ball.x; ball.hitY = world.groundY - BALL_R * 0.3;
      // 달아오른 채 꽂혔다. 먼지가 양옆으로 일고 바닥에 금이 간다 — 점수보다 이게 먼저 보인다.
      if (ball.hot > 0) spawnSlam(world, ball.x, ball.ace);
      point(world, ball.x < netX ? 1 : 0);
      return;
    }

    if (matchOver(b.score)) {
      const won = b.score[0] > b.score[1] ? 0 : 1;
      // 순위표 칸은 [이름, 시간ms, 개수, 번호] 다. 배구에서는 「점수」를 개수 칸에 넣는다.
      const rows = [0, 1]
        .map((side) => [`${teamName(side)} 팀`, Math.round(world.elapsed * 1000), b.score[side], -1 - side])
        .sort((a, c) => c[2] - a[2]);
      world.onGameOver?.({ name: `${teamName(won)} 팀`, side: won, rows });
      b.score = [0, 0];
    }
  },

  draw(ctx, world, time, boil, upright) {
    const b = world.bag;
    if (!b?.ball) return;
    const netX = world.w / 2;
    const netTop = world.groundY - NET_H;

    // 네트. 이 앱은 업무 화면 위에 반투명으로 뜨니, 가는 연필 빗금은 바탕 글자에 묻혀 안 보였다 —
    // 기둥 둘 사이에 그물을 **종이 후광을 깐 잉크 격자**로 짠다. 높이(NET_H)는 그대로다.
    const half = 14;
    ctx.save(); ctx.globalAlpha = 0.85; ctx.fillStyle = PAPER;
    ctx.fillRect(netX - half - 3, netTop - 4, half * 2 + 6, world.groundY - netTop + 4); ctx.restore();   // 그물 뒤 종이
    for (let y = netTop + 6; y < world.groundY - 3; y += 11) {                                          // 가로줄
      stroke(ctx, [[netX - half, y], [netX + half, y]], { width: 1.5, color: INK, seed: 90 + (y | 0), amp: 0.4, halo: false, alpha: 0.7 });
    }
    for (let x = netX - half + 5; x < netX + half; x += 9) {                                           // 세로줄
      stroke(ctx, [[x, netTop + 3], [x, world.groundY]], { width: 1.5, color: INK, seed: 120 + (x | 0), amp: 0.4, halo: false, alpha: 0.7 });
    }
    stroke(ctx, [[netX - half, netTop], [netX - half, world.groundY]], { width: 3.6, color: INK, seed: 61, amp: 1.0 });   // 기둥 둘
    stroke(ctx, [[netX + half, netTop], [netX + half, world.groundY]], { width: 3.6, color: INK, seed: 64, amp: 1.0 });
    stroke(ctx, [[netX - half - 4, netTop], [netX + half + 4, netTop]], { width: 4.2, color: INK, seed: 62, amp: 0.8 });   // 윗줄(테이프)

    // 지나온 자리. 뒤로 갈수록 옅어지고 작아진다.
    (b.tail ?? []).forEach(([tx, ty], i) => {
      const k = (i + 1) / TRAIL;
      upright(tx, ty, () => circle(ctx, tx, ty, BALL_R * (0.3 + 0.6 * k), {
        width: 1.6, color: PENCIL, seed: 70 + i, amp: 0.4, halo: false, alpha: 0.30 * k,
      }));
    });

    // 세게 갔다는 표시. 맞은 자리에서 터지듯 번진다 — 원판의 그 번쩍임이다.
    if (b.ball.hit > 0) {
      const grow = 1 - b.ball.hit;
      const hard = (b.ball.smash ?? 0) > 0;
      upright(b.ball.hitX, b.ball.hitY, () => {
        circle(ctx, b.ball.hitX, b.ball.hitY, BALL_R * (1 + grow * (hard ? 2.6 : 1.4)), {
          width: hard ? 3.4 : 2, color: hard ? RED : PENCIL, seed: 77, amp: 1.4,
          halo: false, alpha: b.ball.hit * (hard ? 0.9 : 0.5),
        });
        if (hard) {
          for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2 + b.ball.spin;
            const r0 = BALL_R * (1.3 + grow * 1.6);
            const r1 = r0 + 16 + grow * 20;
            stroke(ctx, [[b.ball.hitX + Math.cos(a) * r0, b.ball.hitY + Math.sin(a) * r0],
                         [b.ball.hitX + Math.cos(a) * r1, b.ball.hitY + Math.sin(a) * r1]],
                   { width: 2.6, color: RED, seed: 80 + i, amp: 0.8, halo: false,
                     alpha: b.ball.hit * 0.85 });
          }
        }
      });
    }

    // 타격 자국 — 고리·파편·먼지·금은 공 뒤에 깔린다.
    drawFx(ctx, b, upright, false);

    // 공이 그려지는 자리. 맞은 두 프레임 동안 손끝으로 미끄러져 온다.
    const [bx, by] = shownBall(b);
    const sp = Math.hypot(b.ball.vx, b.ball.vy);
    // **속도선.** 달아오른 강타 뒤로 선 셋이 흐른다. 동그라미 하나는 아무리 빨라도
    // 빨라 보이지 않는다 — 지나온 자리에 선을 그어야 속도가 보인다.
    if (b.ball.hot > 0 && sp > 200 && !(b.stop > STOP_EPS)) {
      const ux = b.ball.vx / sp;
      const uy = b.ball.vy / sp;
      const len = Math.min(95, sp * 0.045);
      upright(bx, by, () => {
        for (let i = 0; i < 3; i++) {
          const off = (i - 1) * BALL_R * 0.66;          // 가운데 선이 제일 길다
          const grow = 1 - Math.abs(i - 1) * 0.4;
          const x0 = bx - uy * off - ux * BALL_R * 0.95;
          const y0 = by + ux * off - uy * BALL_R * 0.95;
          // **연필로 긋는다.** 빨강은 이미 타격 고리와 「쾅!」이 쓰고 있어서, 속도선까지
          // 빨가면 셋이 한 덩어리로 뭉쳐 무엇이 무엇인지 안 갈린다.
          stroke(ctx, [[x0, y0], [x0 - ux * len * grow, y0 - uy * len * grow]],
                 { width: 2.2, color: PENCIL, seed: 95 + i, amp: 0.5, halo: false, alpha: 0.5 });
        }
      });
    }

    // 공. 잉크 동그라미에 실밥 두 줄. **빠른 공은 가는 쪽으로 늘어난다** — 한 프레임에
    // 30픽셀을 가는 동그라미는 늘어나 있어야 그 속도로 읽힌다.
    upright(bx, by, () => {
      ctx.save();
      ctx.translate(bx, by);
      // 멈춰 있는 동안은 안 늘인다. 안 가는 공이 늘어나 있으면 그냥 찌그러진 공이다.
      if (sp > 600 && !(b.stop > STOP_EPS)) {
        const k = Math.min(0.34, (sp - 600) / 3000);
        const a = Math.atan2(b.ball.vy, b.ball.vx);
        ctx.rotate(a); ctx.scale(1 + k, 1 - k * 0.55); ctx.rotate(-a);
      }
      ctx.rotate(b.ball.spin);
      circle(ctx, 0, 0, BALL_R, { width: 3.4, color: INK, seed: 63, amp: 0.7 });
      stroke(ctx, [[-BALL_R * 0.82, -5], [0, -9], [BALL_R * 0.82, -5]],
             { width: 2, color: PENCIL, seed: 64, amp: 0.5, halo: false });
      stroke(ctx, [[-BALL_R * 0.82, 6], [0, 10], [BALL_R * 0.82, 6]],
             { width: 2, color: PENCIL, seed: 65, amp: 0.5, halo: false });
      ctx.restore();
    });

    // 「쾅!」·「받았다!」는 공 위에 뜬다.
    drawFx(ctx, b, upright, true);

    // 내 슬라이딩 게이지. 남의 것은 안 그린다 — 오가는 값도 아니고, 알 필요도 없다.
    drawSlideGauge(ctx, world, upright);

    // 점수. 네트 위에 좌우로.
    const y = netTop - 34;
    text(ctx, String(b.score[0]), netX - 44, y,
         { font: `800 30px ${HAN}`, color: TEAM_INK[0], align: 'center', halo: 3 });
    text(ctx, ':', netX, y, { font: `800 24px ${HAN}`, color: PENCIL, align: 'center', halo: 3 });
    text(ctx, String(b.score[1]), netX + 44, y,
         { font: `800 30px ${HAN}`, color: TEAM_INK[1], align: 'center', halo: 3 });
    // 듀스. 두 점 차가 나야 끝난다는 걸 점수 위에 적어 둔다 — 안 그러면 5:4 에 왜 안 끝나냐고 묻는다.
    if (deuce(b.score)) {
      text(ctx, '듀스 — 두 점 차로', netX, y - 28,
           { font: `800 13px ${HAN}`, color: RED, align: 'center', halo: 3 });
    }
    // 누가 어느 편인지. 점수 밑에 이름을 적어 두면 편을 물어볼 일이 없다.
    const rows = teams(world);
    rows.forEach((members, side) => {
      const at = netX + (side === 0 ? -44 : 44);
      const label = members.length
        ? members.map((m) => (m.mine ? `${m.name}(나)` : m.name)).join(' · ')
        : '아무도 없음';
      text(ctx, label, at, y + 20, {
        font: `${members.some((m) => m.mine) ? 800 : 600} 12px ${HAN}`,
        color: TEAM_INK[side], align: 'center', halo: 3,
      });
    });

    if (b.wait > 0) {
      text(ctx, '서브', bx, by - 30,
           { font: `700 13px ${HAN}`, color: RED, align: 'center', halo: 3 });
    }
  },

  /// 손님이 보내오는 말. 방장만 듣는다.
  message(world, from, msg) {
    if (world.mp.role !== 'host') return;
    if (msg.k === 'hit' && msg.at && msg.want) {
      // 손님이 때렸다. **공은 내 것이니 내가 대신 쳐 준다.**
      // 자리는 손님이 보내온 값을 믿되, 내가 알고 있는 자리와 너무 다르면 무시한다 —
      // 남의 화면 값을 그대로 믿으면 코트 밖에서도 공을 칠 수 있게 된다.
      const other = world.mp.others.get(from);
      if (!other || other.dead) return;
      if (Math.abs(other.x - msg.at.x) > 120) { world.debug && world.log?.(`손님타격 무시(자리차이) ${from}`); return; }
      const ok = applyHit(world, { x: other.x, air: other.air, groundY: world.groundY,
                                   side: msg.at.side === 1 ? 1 : 0 }, msg.want, other, from);
      if (ok) startSwing(other, ok);
      world.debug && world.log?.(`손님타격 ${from} ${ok ? '먹힘' : '안닿음'}`);
      return;
    }
    if (typeof msg.s === 'number') (world.bag.picked ??= new Map()).set(from, msg.s ? 1 : 0);
  },

  /// 편을 고른다. 내 화면에서 먼저 옮기고 방장에게 알린다 —
  /// 방장이 명단을 다시 뿌리면 남들 화면에서도 옮겨진다.
  swap(world, shell, side) {
    world.team = side === undefined ? 1 - (world.team ?? 0) : (side ? 1 : 0);
    (world.bag.picked ??= new Map()).set(world.mp.myId, world.team);
    if (world.mp.on) (shell?.net?.send ?? world.send)?.({ t: 'gm', s: world.team });
  },

  pack(world) {
    const b = world.bag;
    const sides = rosterSides(world);
    const flash = b.flash;
    b.flash = null;                              // 한 번만 보낸다
    const events = b.events?.length ? b.events : null;
    b.events = [];
    // **히트스톱 중에는 속도도 0으로 보낸다.** 자리만 멎고 속도는 실어 보내면, 손님은 그
    // 속도로 공을 이어 그려서 방장 화면만 멎고 손님 화면은 안 멎는다 — 멈춤이 반만 보인다.
    const still = b.stop > STOP_EPS;
    return {
      tm: [...sides.entries()],
      b: [Math.round(b.ball.x * 10) / 10, Math.round(b.ball.y * 10) / 10,
          still ? 0 : Math.round(b.ball.vx), still ? 0 : Math.round(b.ball.vy),
          Math.round(b.ball.spin * 100) / 100, Math.round(b.ball.spinV * 100) / 100,
          // 일곱째 칸 — 달아오름(0 보통 · 1 강타 · 2 정타). 옛 손님은 여섯 칸만 읽고 지나간다.
          b.ball.hot > 0 ? (b.ball.ace ? 2 : 1) : 0],
      s: b.score,
      w: Math.round(b.wait * 100) / 100,
      // 방금 터진 타격. 있을 때만 싣고 바로 비운다.
      f: flash ?? undefined,
      // 바닥에 꽂힘·받아 냄. 같은 식으로 한 번만 싣는다.
      e: events ?? undefined,
    };
  },

  unpack(world, data) {
    const b = world.bag;
    // 방장 쪽에서 누가 때렸다. 번쩍임·파편·흔들림과 내리치는 팔을 같이 띄운다.
    //
    // **늦게 온 만큼을 따로 앞당기지 않는다.** 손님 화면에서는 공도 사람도 같은 만큼 늦게
    // 오니, 팔과 공이 서로 맞아 있으면 그걸로 맞는 것이다. 앞당기면 팔만 먼저 가서
    // 허공을 친 뒤에 공이 튄다.
    if (Array.isArray(data?.f) && data.f.length >= 3 && data.f.every(Number.isFinite)) {
      const [hx, hy, hard] = data.f;
      // 옛 모양([x, y, 세기])에는 번호도 종류도 없다. 세기로 강타인지 가리고 사람은 찾아 붙인다.
      const old = data.f.length < 7;
      const kind = old ? (hard > 0.05 ? 1 : 0) : data.f[4] | 0;
      const who = old ? -1 : data.f[3] | 0;
      const info = {
        kind, ace: kind === 2, face: old ? 1 : (data.f[5] < 0 ? -1 : 1),
        hold: kind === 2 ? ACE_HOLD : HIT_HOLD, stop: old ? 0 : data.f[6],
        x: hx, y: hy, smash: hard,
      };
      // **내가 친 것이면 이미 내 화면에서 보여 줬다**(spike). 두 번 터뜨리지 않는다.
      if (!(who >= 0 && who === world.mp.myId && (b.mineAt ?? 9) < 0.5)) {
        const hitter = who >= 0
          ? (who === world.mp.myId ? world.player : world.mp.others.get(who))
          : nearestHitter(world, hx, hy, kind > 0);
        startSwing(hitter, info);
        spawnHit(world, info);
      }
    }
    // 바닥에 꽂힘(1) · 받아 냄(2). 모르는 번호는 조용히 지나간다 — 나중에 늘어날 자리다.
    for (const ev of Array.isArray(data?.e) ? data.e : []) {
      if (!Array.isArray(ev) || ev.length < 4 || !ev.every(Number.isFinite)) continue;
      if (ev[0] === 1) spawnSlam(world, ev[1], !!ev[3]);
      else if (ev[0] === 2) spawnDig(world, ev[1], ev[2]);
    }
    // 방장이 나눠 준 편 명단. 내 편이 여기 적힌 대로 바뀐다.
    if (Array.isArray(data?.tm)) {
      b.sides = new Map(data.tm.filter((r) => Array.isArray(r) && r.length === 2));
      const mine = b.sides.get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) {
        world.team = mine;
        // 반대편에 서 있었으면 옮겨 준다. 네트를 넘을 수는 없으니 여기서 옮겨야 한다.
        const half = world.w / 2;
        if (mine === 0 && world.player.x > half) world.player.x = half * 0.6;
        if (mine === 1 && world.player.x < half) world.player.x = half * 1.4;
      }
    }
    // 여섯 칸짜리 숫자 배열이 아니면 손대지 않는다. 하나라도 이상하면 공이 NaN 이 되고,
    // 그 NaN 이 다음 꾸러미의 오차 계산에 되먹여져 영영 안 돌아온다.
    if (!Array.isArray(data?.b) || data.b.length < 6 || !data.b.every(Number.isFinite)) return;
    // 지금 그리고 있던 자리와 방금 온 자리의 차이를 남겨 두고 60ms 에 걸쳐 녹인다.
    // 사람한테 쓰는 것과 같은 방법이다 — 톡 끊어 옮기면 공이 순간이동한다.
    // 첫 꾸러미이거나 그리던 값이 성치 않으면 오차를 녹이지 않고 그냥 그 자리에 놓는다.
    const first = b.baseX === undefined
      || !Number.isFinite(b.ball.x) || !Number.isFinite(b.ball.y);
    const showX = b.ball.x;
    const showY = b.ball.y;
    const [x, y, vx, vy, spin, spinV, hot] = data.b;
    b.baseX = x; b.baseY = y; b.baseVX = vx; b.baseVY = vy;
    b.ball.spin = spin; b.ball.spinV = spinV;
    // 달아오름은 보이는 것(속도선·탑스핀)에만 쓴다. 판정은 어차피 방장이 한다.
    b.ball.hot = hot > 0 ? HOT_TIME : 0;
    b.ball.ace = hot === 2;
    b.ball.topspin = hot > 0;
    b.age = 0;
    b.errorX = first ? 0 : showX - x;
    b.errorY = first ? 0 : showY - y;
    if (Math.abs(b.errorX) > 200 || Math.abs(b.errorY) > 200) { b.errorX = 0; b.errorY = 0; }
    if (first) { b.ball.x = x; b.ball.y = y; b.tail = []; }
    if (Array.isArray(data.s) && data.s.length === 2 && data.s.every(Number.isFinite)) b.score = data.s;
    b.wait = Number.isFinite(data.w) ? data.w : 0;
    b.started = true;
  },

  resize() {},
};
