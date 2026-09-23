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

import { INK, RED, PENCIL, stroke, circle, text, PAPER, paperScrap } from '../draw/ink.js';
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
const LOB_UP = 720;         // 넘겨 주기는 적어도 이만큼 위로 — 바닥 위 400 넘게 뜬다
const LOB_SIDE = 0.6;       // 넘겨 주기는 가로를 덜어 낸다
const SPIKE_REACH = 88;     // 손이 닿는 거리
const MAX_SPEED = 2600 * SLOW;
const WALL_KEEP = 0.98;     // 옆벽은 거의 손실 없이 반사한다
// **천장은 없다.** 한참 안쪽에 두고(화면 위 300 → 바닥 위 470) 세게 올린 공을 되돌리려 했는데,
// 위로 뜨는 공은 MAX_UP 이 상한이라(잘해야 바닥 위 600) 없어도 화면을 안 벗어난다 — 그냥 열어 둔다.
// 위로 이보다 빠르게는 안 보낸다. 중력 950 에서 950 이면 475픽셀쯤 오른다 —
// 이게 천장 대신이다. 뛰어서 친 공도 바닥 위 600 안쪽에서 돌아온다.
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

// 서브. **누르고 있는 동안 힘이 찬다.**
//
// 예전에는 공이 저절로 떠올랐고 올리는 사람은 그걸 때리기만 했다 — 매 점수마다 아무 선택이
// 없었다. 이제 ⌥Space 를 잡고 있는 만큼 힘이 차고, ⌥←→ 로 깊이를 정한다.
// **너무 오래 잡으면 손에서 빠져 네트에 걸린다** — 꽉 채우고 싶은 마음에 값을 매긴다.
const SERVE_HOLD = 0.14;          // 이만큼은 눌러야 힘이 붙기 시작한다
const SERVE_FULL = 0.72;          // 여기서 꽉 찬다
const SERVE_BURST = 1.06;         // 여기를 넘기면 실패
const SERVE_SLOW = 700 * SLOW;    // 톡 쳐도 이만큼은 간다 — **넘기지도 못하면 고를 게 없다**
/// 꽉 채운 서브.
///
/// 1250 은 **채우는 보람이 없었다.** 코트 맨 뒤(x200)에서 재 보면 살살 넣은 공은 1.82초에
/// 926 에 떨어지고 꽉 채운 공은 1.35초에 1173 — 받는 쪽에는 둘 다 「높이 뜬 공이 천천히
/// 온다」로 똑같이 보였다. 그게 「서브가 약하다」였다. 2200 이면:
///
///   | 힘   | 예전                  | 지금                        |
///   |------|----------------------|----------------------------|
///   | 0%   | 926 · 1.82초         | 그대로 (살살은 안 건드렸다)   |
///   | 100% | 1173 · 1.35초 · 최고 378 | **1275 · 0.80초 · 최고 292** |
///
/// (**이 표는 공을 바닥 위 269 에 두고 잰 것이다** — 실제로는 손 높이 110 에서 나간다. 거기서 다시
/// 재면 x200 에서 0% 가 895 · 1.63초 · 최고 389, 100% 가 999 · 0.57초 · 최고 135. 그 높이에서는
/// 뒤쪽 서브가 네트에 걸려서 hitServe 가 넘을 만큼 각을 든다.)
///
/// 네트를 0.43초에 넘는다(예전 0.77초). 공 자체는 1452 로 강타(1201)보다 빠르다 —
/// 실제 배구의 점프 서브가 스파이크보다 빠른 것과 같다. 대신 갈 길이 멀어서 받는 쪽에는
/// 네트를 넘고도 0.37초가 남는다 (디그·슬라이딩이 닿는 시간).
const SERVE_FAST = 2200 * SLOW;
const SERVE_AIM = 250 * SLOW;     // ⌥←→ 로 더 깊이 / 더 짧게
const SERVE_LIFT = 1150 * SLOW;   // 살살 넘기면 높이 뜬다
const SERVE_FLAT = 750 * SLOW;    // 꽉 채울수록 낮고 곧게 간다
/// 여기를 넘겨 채우면 **앞으로 돌며 꽂힌다**(탑스핀).
///
/// 빠르게만 하면 공이 길어져 뒷벽까지 날아간다 — 세게 칠수록 코트를 벗어나면 셀 수가 없다.
/// 실제 배구도 같은 이유로 강서브에 회전을 건다. 「강서브!」가 뜨는 세기와 **같은 값**이라,
/// 글자가 뜨면 꽂힌 것이고 안 뜨면 길게 뜬 것이다 — 보고 배울 수 있다.
const SERVE_SPIN = 0.85;
const SERVE_BAR = 46;             // 머리 위 힘 막대 길이
/// **서브는 뒤쪽 절반에서만 올린다.** 배구가 엔드라인 뒤에서 넣는 것과 같은 뜻이고,
/// 네트 코앞에서 꽉 채워 때리면 그물을 스치거나 뒷벽을 맞고 되돌아오던 것도 여기서 사라진다.
/// 자기 코트 폭의 이만큼까지만 앞으로 나갈 수 있다 (0 이 맨 뒤, 1 이 네트).
const SERVE_ZONE = 0.5;
const EMPTY_WAIT = 1.1;
/// 아래·위를 따로 받는 가두기. 이 파일의 clamp 은 ±한 값짜리라 자리에는 못 쓴다.
const clamp2 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));         // 빈 코트가 올리기까지 (사람이 있으면 안 쓴다)
/// 손님이 **옛 속도로 앞질러 그리는** 한도.
///
/// 이 값을 두 번 잘못 건드렸다. 두 번 다 **재는 자리가 틀렸다.**
///   ① 「강타가 나면 손님 공이 684px 튄다」 → 튀던 두 프레임은 첫 꾸러미와 서브 리셋이었다.
///   ② 「공은 처음부터 매끄러웠다」 → 꾸러미가 **한 번도 안 늦는** 망에서 쟀다. 그 망에서는
///      age 가 늘 0이라 이 값이 무슨 값이든 그림이 같다 — 아무것도 안 재고 있었던 것이다.
///
/// 제대로 재는 자리는 **와이파이가 딸꾹할 때**다 (TCP 라 잃지는 않고 한꺼번에 늦게 온다).
/// 방장·손님을 따로 돌리고 0.2초 끊김을 넣어 재 보면 (test/volley-net.mjs):
///
///   | 한도  | 0.2초 딸꾹                  | 0.4초 딸꾹                        |
///   |-------|----------------------------|----------------------------------|
///   | 0.066 | 멎음 191프레임 (최장 9)      | 멎음 312 (최장 21) · 어긋남 299px |
///   | 0.18  | 멎음 47 (최장 2)            | 멎음 207 (최장 14) · 219px        |
///   | 0.30  | **멎음 0**                  | 멎음 110 (최장 7) · **124px**     |
///
/// 공이 제자리에 서는 것이 곧 「렉 걸렸다」로 보인다 — 0.066 이 그래서 나빴다.
/// 공의 길은 다음 사람이 닿기 전까지 정해져 있으니(중력·톱스핀) 0.3초는 이어 그려도 맞는다.
/// 더 늘리면 그 사이에 난 타격을 모른 채 엉뚱한 데까지 날아간다 — 0.5초는 튀는 폭이 커졌다.
const AGE_CAP = 0.30;
/// 이 넘게 어긋나면 녹이지 않고 그 자리에 놓는다.
const SNAP_AT = 200;

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
/// **⌥Space + ↓ 는 짧게 뚝 떨어진다.** 앞으로 세게 감아 친 공이라 달아오른 동안 이만큼 더 무겁다.
///
/// 예전 ⌥↓ 는 「공을 더 가파르게」였는데, 꽂는 각은 어차피 자리가 정한다(netCap — 네트를 넘을
/// 수 있는 가장 가파른 각). 그래서 네트 앞이 아니면 그냥 친 공과 똑같았고, 네트 앞에서도 ⌥→ 와
/// 각이 같았다(17° 대 18°). 이제 ⌥→ 는 **빠르고 깊게**, ⌥↓ 는 **네트를 넘자마자 앞쪽에** —
/// 받는 쪽이 뒤로 물러설지 앞으로 붙을지를 두고 흔들리는 두 수가 된다.
const DIP_SPIN = GRAVITY * 2.5;
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

// ── 창을 보이게 ────────────────────────────────────────────────────────────
//
// 정타는 **서로 보이지 않는 두 창이 겹칠 때만** 난다: 발이 APEX_AIR 넘게 떴고(때), 공이
// 손끝 SWEET_R 안이고(자리). 둘 다 표시가 없어서 「어쩔 땐 되고 어쩔 땐 안 된다」로 읽혔다.
// 재 보니 겹치는 건 잘해야 10프레임, 센 공이면 8프레임이다 — 표시 없이 맞히라는 건 무리다.
//
//   발밑 고리   뜨면 생기고, 정타 높이에 닿는 순간 **탁 조여들며 편 색으로 바뀐다**
//   공 달무리   공이 내 손끝 원 안에 들면 공 둘레가 빛난다
//
// 둘이 **같이** 켜진 순간이 정타다. 설명하지 않아도 두어 번이면 안다.
// 둘 다 공 자리와 사람 자리만으로 정해져서 따로 주고받을 것이 없다 (p.cock 과 같다).
const RING_R = 30;            // 뜨자마자의 고리 반지름. 정타 높이에서 공 크기까지 조인다
const RING_FADE = 0.28;       // 내려선 뒤 고리가 사라지는 시간

// ── 빗나간 까닭 ────────────────────────────────────────────────────────────
//
// 못 친 이유가 셋인데 셋 다 화면에 아무 표시가 없었다. 무엇이 틀렸는지 모르니 배우질 못한다.
const MISS_LIFE = 0.42;
/// 히트스톱에 씹힌 입력을 기억하는 시간. 맞은 공이 멈춰 있는 4~5프레임 동안 누른 건
/// 통째로 버려져서 랠리 중에 한 번씩 씹혔다 — 그만큼 기억했다가 풀리는 프레임에 친다.
const BUFFER = 6 / 60;

// ── 블로킹 ─────────────────────────────────────────────────────────────────
//
// 강타 하나뿐이라 수비하는 쪽이 할 일이 없었다. 네트 앞에서 뛰어 손을 넘기면 벽이 된다 —
// 강타를 막고, 막은 공은 상대 코트로 되돌아간다. 늦게 뛰면 그대로 얻어맞는다.
//
// **누르는 키는 때리기와 같다.** 손에 닿으면 치고, 안 닿는데 네트 앞이면 막는다 —
// 「닿으면 치고 안 닿으면 슬라이딩」과 같은 규칙이라 새로 외울 것이 없다.
const BLOCK_NEAR = 104;       // 네트에서 이 안쪽에 있어야 벽을 세운다 (두 칸 반)
const BLOCK_TIME = 0.3;
const BLOCK_UP = 30;          // 손이 머리 위로 뻗는 높이
const BLOCK_KEEP = 0.92;      // 막은 공이 되돌아가는 세기 (들어온 속도의)
const BLOCK_MIN = 640 * SLOW;
const BLOCK_COOL = 0.4;       // 다시 막기까지

// ── 페인트 ─────────────────────────────────────────────────────────────────
//
// 블록을 넘기는 유일한 수단. 때리는 대신 손끝으로 톡 건드려 블로커 머리 너머에 떨군다.
// **⌥↓ 를 강타에서 떼어 여기 준다** — ⌥↓+⌥Space 의 「내리꽂기」는 공이 손 밑이면 어차피
// 저절로 나오던 것이라(under) 잃는 것이 없고, 공중의 ⌥↓ 는 원래 아무 일도 안 하던 키다.
/// **블로커 손 위로 넘긴다.** 330×SLOW(218)로 조금만 띄웠더니 공이 손 높이(바닥 위 130~145)에서
/// 거의 안 올랐다 — 떠오른 블로커의 벽 윗면(발 61 + 몸 80 + 손 30 = 171)보다 낮아서
/// **블록을 넘기는 유일한 수단이 블록에 다 막혔다.** 이제 높이 띄우고, 가로는 네트 바로 너머
/// (TIP_LAND)에 떨어지게 겨눈다 — 블로커 등 뒤로 톡 떨어지는 공이다.
const TIP_UP = 1000 * SLOW;
const TIP_LAND = 140;          // 네트에서 이만큼 너머에 떨군다
/// 가로 상한. **앞자리 전용**이 여기서 나온다 — 가운데(500)에서 얹으면 이 세기로는 네트에
/// 못 닿아 제 코트에 떨어진다. 네트에서 150 안쪽이면 넘어가고, 80 안쪽이면 떠오른 블로커도 넘는다
/// (30 안쪽은 넘어온 블로커 손 안이라 못 넘는다 — 벽이 네트 너머 43px 까지 온다).
const TIP_SIDE = 170;

// ── 디그 ───────────────────────────────────────────────────────────────────
//
// 웅크리고 받으면 공이 **높고 곧게** 뜬다. 세게 온 공도 팀이 다시 올릴 수 있는 공이 된다 —
// 지금은 세게 맞으면 그냥 밀려났다. 받아 낸 쪽에도 잘한 보람을 준다.
const DIG_CROUCH = 0.5;
const DIG_SIDE = 0.34;        // 가로로 덜 튄다 — 세워 올린다

// 편 가르기.
//
// **서 있는 자리가 곧 편이다.** 따로 주고받는 값이 없다 — 자리는 어차피 60Hz 로 오간다.
// 판이 도는 동안은 네트를 못 넘으니 편이 안 바뀌고, 판과 판 사이에는 걸어서 넘어가면
// 편이 바뀐다. 「편 바꾸기」 메뉴를 따로 둘 필요가 없고, 누가 어느 편인지 보고 있으면 안다.
/// 공이 튀는 그물 **면**. 가운데 선에서 튀면 그물을 파고든 뒤 튀어 보인다.
const NET_FACE = 14;
/// 꽂는 공이 그물 위를 이만큼 띄워 지나가게 잡는다 (netCap).
const NET_CLEAR = 8;
/// 사람이 네트에서 이만큼 떨어져 선다.
///
/// 그물 면(14)과 같이 뒀더니 몸이 그물에 닿아서 **서로 네트를 침범한 것처럼** 보였다 —
/// 어깨에서 손끝까지가 22px 이라 팔을 휘두르면 그물을 지나간다. 그 팔이 안 닿는 자리에 세운다.
const NET_GAP = ARM_LEN + 4;

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
  b.serveBy = toSide;
  b.ball.x = toSide === 0 ? world.w * 0.25 : world.w * 0.75;   // 뒤쪽 절반 한가운데
  b.ball.y = world.groundY - NET_H - 150;
  b.ball.vx = 0;
  b.ball.vy = 0;
  b.ball.spin = 0;
  b.ball.spinV = 0;
  cool(b.ball);
  b.ball.skip = null; b.ball.skipT = 0; b.ball.gT = 0;
  b.stop = 0;
  b.tail = [];
  b.wait = RESET_WAIT;
  // 공을 손에 들고 기다린다. 올리는 사람이 누를 때까지 판이 안 돈다.
  b.serving = true;
  b.charge = -1;
  b.mustCross = null;
}

/// 서브를 올릴 때 앞으로 나갈 수 있는 끝 자리.
export function serveLine(world, side) {
  const half = world.w / 2;
  return side === 0 ? half * SERVE_ZONE : world.w - half * SERVE_ZONE;
}

/// 지금 서브를 올리는 사람이 나인가. 그 편에서 공에 제일 가까운 사람이 올린다.
export function myServe(world) {
  const b = world.bag;
  if (!b.serving || world.mp.waiting || world.state !== 'play') return false;
  if ((world.team ?? 0) !== b.serveBy) return false;
  return serverOf(world, b.serveBy) === world.player;
}

/// 서브를 때린다. power 0~1, dir 은 누른 방향(−1·0·1).
export function hitServe(world, power, dir) {
  const b = world.bag;
  // 점수 난 뒤 쉬는 동안(RESET_WAIT)은 못 넣는다. 공이 아직 손으로 내려오는 중이라
  // 높은 데서, 선 자리가 아닌 데서 나가고 — 받는 쪽은 준비도 안 됐다.
  if (!b.serving || b.wait > 0) return false;
  b.serving = false;
  b.charge = -1;
  const k = clamp01(power);
  const across = b.serveBy === 0 ? 1 : -1;
  const ball = b.ball;
  // 서브 전에 공에 남은 것을 지운다 — 기다리는 동안 들어온 타격이 달아오름을 남겨 두면
  // 살살 넣은 서브가 탑스핀을 물려받는다.
  cool(ball);
  ball.vx = across * (SERVE_SLOW + (SERVE_FAST - SERVE_SLOW) * k) + dir * across * SERVE_AIM;
  ball.vy = -(SERVE_LIFT - SERVE_FLAT * k);
  ball.spinV = across * (2 + k * 4);
  // 강서브는 달아오른 채 앞으로 돌며 간다 — 중력의 1.45배로 떨어져 코트 안에 꽂힌다.
  // (달아오름은 꾸러미의 일곱째 칸으로 가고, 손님은 그걸 보고 같은 회전을 그린다.)
  const spin = k > SERVE_SPIN;
  if (spin) { ball.hot = HOT_TIME; ball.ace = false; ball.topspin = true; }
  // **어느 세기로 넣어도 네트는 넘는다.** 표의 값은 공을 지면 위 269px 에 두고 잰 것이었는데
  // 실제로 공은 손 높이(110px, 네트보다 15px 위)에서 나간다. 거기서는 서브 구역 뒤쪽(x≤140)의
  // 강서브·⌥← 서브가 네트에 걸렸다 — 서브 구역의 6할이다. 넘을 때까지만 **각을 든다**
  // (스파이크의 netCap 과 같은 날려 보기를 쓴다). 세기와 깊이는 그대로다.
  const clears = (vx, vy) => flies(world, ball.x, ball.y, vx, vy, spin, false);
  // **가장 덜 바꾸는 쪽부터** 찾는다 — 각을 조금씩 들어 보고, 끝까지 들어도 안 되면 세기를 조금 더한다.
  // (더 든다고 늘 잘 넘는 것은 아니다 — 너무 들면 네트 앞에 떨어진다. 그래서 반으로 좁히지 않는다.)
  // (맨 뒤에서 살살 짧게(⌥←) 넣은 297px/s 가 그 경우다 — 각만으로는 못 넘는다.)
  if (!clears(ball.vx, ball.vy)) {
    const vy0 = ball.vy;
    let found = false;
    // 세기를 더해도 SERVE_FAST 까지만 (깊은 강서브는 이미 그보다 빨라 각만 든다).
    const most = Math.max(1, SERVE_FAST / Math.abs(ball.vx));
    for (let fast = 1; fast <= most && !found; fast += 0.08) {
      for (let vy = vy0; vy >= -MAX_UP; vy -= 25) {
        if (clears(ball.vx * fast, vy)) { ball.vx *= fast; ball.vy = vy; found = true; break; }
      }
    }
  }
  b.tail = [];
  // **서브는 바로 넘겨야 한다.** 넘어가기 전까지 올린 편은 공을 못 건드린다 —
  // 올려 놓고 자기 편끼리 주고받다 넘기는 건 서브가 아니다.
  b.mustCross = b.serveBy;
  addFx(b, { k: 'dig', x: ball.x, y: ball.y, t: 0, life: 0.4,
             word: k > SERVE_SPIN ? '강서브!' : null });
  netEvent(world, [5, Math.round(ball.x), Math.round(ball.y), Math.round(k * 100)]);
  return true;
}

/// 너무 오래 잡고 있었다. 손에서 빠져 네트에 걸린다 — 상대 점수.
function serveFault(world) {
  const b = world.bag;
  b.serving = false;
  b.charge = -1;
  addFx(b, { k: 'miss', x: b.ball.x, y: b.ball.y - 26, t: 0, life: 0.9, word: '서브 실패' });
  point(world, 1 - b.serveBy);
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));

/// 달아오른 강타를 식힌다. 몸·벽·네트·바닥·서브 — 무엇이든 한 번 닿으면 보통 공이다.
function cool(ball) {
  ball.hot = 0; ball.ace = false; ball.topspin = false; ball.dip = false;
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
///
/// **디그** — 웅크린 채로 받으면 가로로 덜 튀고 최대 높이로 올라간다. 세게 온 공을 받아
/// 그냥 밀려나는 대신 **다시 칠 수 있는 공**으로 세워 올리는 것이다. 돌려주는 값이 그거다.
function bounceOff(ball, p) {
  const off = ball.x - p.x;
  const dug = (p.crouch ?? 0) > DIG_CROUCH && (p.air ?? 0) <= 2;
  ball.vx = clamp((off * OFF_CENTER + p.vx * CARRY) * (dug ? DIG_SIDE : 1), MAX_SPEED);
  const up = Math.abs(ball.vy);
  ball.vy = -Math.min(MAX_UP, dug ? MAX_UP : Math.max(up, MIN_UP));
  ball.spinV = clamp(off * 0.12, 8);
  ball.hit = 1;                       // 맞은 자리에 잠깐 뜨는 표시
  ball.hitX = ball.x; ball.hitY = ball.y;
  // 몸 밖으로 밀어내 둔다. 안 그러면 다음 프레임에 또 맞아서 붙어 버린다.
  ball.y = Math.min(ball.y, p.groundY - p.air - BODY_H - BALL_R * 0.3);
  return dug;
}

/// 손이 닿는 자리인가. 때리기·빗나간 까닭·달무리가 모두 이 하나를 본다 — 셋이 따로 재면
/// 화면에 켜진 표시와 실제 판정이 어긋난다.
function inReach(ball, at) {
  const dx = ball.x - at.x;
  const dy = ball.y - (at.groundY - at.air - BODY_H * 0.7);
  return dx * dx + dy * dy <= SPIKE_REACH * SPIKE_REACH;
}

/// 공이 내 코트 쪽인가 — **네트 너머의 공은 못 친다** (넘어가서 손을 대는 건 블로킹뿐).
/// 네트 면에 걸친 공(공 반지름만큼)까지는 친다 — 실제 규칙도 그렇다.
function onMySide(world, ball, side) {
  const netX = world.w / 2;
  return side === 1 ? ball.x > netX - BALL_R : ball.x < netX + BALL_R;
}

/// 손끝 자리 (정타를 재는 기준). 발에서 BODY_H×0.86.
const handY = (at) => at.groundY - at.air - BODY_H * 0.86;

/// 공이 내 손끝 원 안인가 — 정타의 두 조건 가운데 **자리** 쪽.
function inSweet(ball, at) {
  return Math.hypot(ball.x - at.x, ball.y - handY(at)) <= SWEET_R;
}

/// 벽에 닿았나. 머리 위로 뻗은 손이 네트 쪽으로 한 뼘 나간 넓적한 칸이다.
function blocks(ball, p, netX) {
  if (!(p.block > 0)) return false;
  if (Math.abs(ball.x - netX) > BLOCK_NEAR * 1.6) return false;   // 벽은 네트에서만 선다
  const feet = p.groundY - p.air;
  const toward = Math.sign(netX - p.x) || 1;
  const x0 = Math.min(p.x, p.x + toward * 26) - 15;
  const x1 = Math.max(p.x, p.x + toward * 26) + 15;
  const top = feet - BODY_H - BLOCK_UP;
  const cx = Math.max(x0, Math.min(ball.x, x1));
  const cy = Math.max(top, Math.min(ball.y, feet - BODY_H * 0.55));
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  return dx * dx + dy * dy < (BALL_R + 8) ** 2;
}

/// 막았다. **들어온 세기 그대로 상대 코트로 되돌린다** — 세게 친 쪽이 더 세게 돌려받는다.
/// 그게 블로킹을 무서운 수로 만든다. 살살 온 공도 최소한 네트는 넘어간다.
function blockBack(ball, p, netX) {
  const away = Math.sign(netX - p.x) || 1;
  const back = Math.max(BLOCK_MIN, Math.hypot(ball.vx, ball.vy) * BLOCK_KEEP);
  ball.vx = clamp(away * back * 0.82, MAX_SPEED);
  ball.vy = Math.min(MAX_SPEED, Math.max(150, back * 0.34));     // 네트 너머로 꽂힌다
  ball.spinV = clamp(away * 9, 12);
  ball.hit = 1; ball.hitX = ball.x; ball.hitY = ball.y;
  ball.smash = 0.7;
  // 벽에 맞은 공은 식는다 — 막힌 강타가 달아오른 채로 가면 막은 보람이 없다.
  cool(ball);
  ball.skip = p; ball.skipT = SELF_SKIP;
  // 벽 바깥으로 밀어내 둔다. 안 그러면 다음 프레임에 또 맞는다.
  ball.x += away * (BALL_R + 10);
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
  if (!inReach(ball, at)) return null;
  // **네트 너머의 공은 못 친다.** 손이 닿는 거리(88px)가 네트 틈(14px)보다 훨씬 커서,
  // 네트에 붙어 서면 **상대 코트 60px 안쪽 공까지 그냥 쳤다** — 땅에 서서도 됐다.
  // 배구에서 그건 반칙이고, 넘어가서 손을 대는 건 **블로킹뿐**이다 (canBlock 이 따로 있다).
  // 네트 면에 걸친 공(공 반지름만큼)까지는 친다 — 실제 규칙도 그렇다.
  if (!onMySide(world, ball, at.side)) return null;
  // **같은 사람이 곧바로 두 번 못 친다.** 공중 ⌥↑(페인트)로 얹은 공을 같은 프레임의 ⌥Space 가
  // 또 쳐서 넘겨 주기가 됐다 — 한 사람이 두 번 친 것이다. 친 사람 몸을 건너뛰는 몫(SELF_SKIP)을
  // 손에도 쓴다.
  if (body && ball.skip === body && ball.skipT > 0) return null;

  const away = at.side === 1 ? -1 : 1;             // 상대 코트 쪽
  const held = want.held | 0;
  let vx;
  let vy;
  let kind = 0;
  let ace = false;
  let lob = false;
  let smash = 0;
  let flat = 0;              // 꽂지 않고 수평으로 쳤을 때의 세기 (netCap 이 각을 눕힐 때 쓴다)
  let dip = false;           // ⌥Space + ↓ — 감아 쳐서 짧게 떨어지는 공 (DIP_SPIN)
  if (want.tip && at.air > 12) {
    // **페인트.** 때리는 대신 손끝으로 톡 건드려 블로커 머리 너머에 떨군다.
    // 느리게, 짧게, 조금 떠올랐다 떨어진다 — 블록을 넘기는 유일한 수단이다.
    vy = -TIP_UP;
    // 바닥에 닿을 때까지의 시간으로 가로를 겨눈다 (느린 공이라 공기 저항은 거의 없다).
    const h0 = Math.max(0, world.groundY - BALL_R - ball.y);
    const fall = (TIP_UP + Math.sqrt(TIP_UP * TIP_UP + 2 * GRAVITY * h0)) / GRAVITY;
    const goal = (world.w / 2 + away * TIP_LAND - ball.x) * away;
    vx = away * clamp2(goal / fall, 60, TIP_SIDE) + held * 60;
    kind = 3;
  } else if (at.air <= 12) {
    // 토스. 위로 올려 주고 옆으로는 살짝만.
    vx = clamp((ball.x - at.x) * OFF_CENTER * 0.6 + held * 240, MAX_SPEED);
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
    const hand = handY(at);
    const under = (ball.y - hand) / (BODY_H * 0.55);
    // **⌥Space + ↓ 는 내리꽂기다.** 공이 손 밑에 있기만 하면 **꽂을 수 있는 만큼 최대로**
    // 꽂는다 — 네트 앞에서 쓰라고 있는 키다. 다만 공이 손보다 위면 여전히 못 꽂는다.
    // 밑에서 올려치는 공을 아래로 보낼 수는 없고, 그 규칙이 이 게임 스파이크의 전부다.
    // (얼마나 가파르게 나갈지는 netCap 이 자리를 보고 다시 깎는다 — 네트에 걸릴 각은 안 나간다.)
    const deep = want.down && under > 0 ? 1 : 0;
    const dive = want.up ? 0 : Math.max(deep, Math.max(0, Math.min(1, under)));
    // 높이 뜰수록 세다. 뛰자마자 치는 것과 꼭대기에서 치는 것이 같으면 점프에 뜻이 없다.
    // (예전엔 120 으로 나눴는데 점프가 65 까지밖에 안 올라가서 끝까지 못 썼다.)
    const lift = 0.78 + 0.34 * Math.min(1, at.air / JUMP_TOP);
    lob = !!want.up && !want.down;
    dip = !lob && deep > 0;
    // 정타 — 꼭대기에서, 손끝으로.
    ace = !lob && at.air >= APEX_AIR && inSweet(ball, at);
    const power = ace ? ACE_POWER : 1;
    const cap = ace ? ACE_CAP : MAX_SPEED;
    const side = held !== 0 ? held : away;
    // 가파르게 꽂을수록 가로로는 덜 간다. 힘의 총량은 그대로 두고 방향만 아래로 돌린다.
    flat = Math.min(cap, (held !== 0 ? SMASH_SIDE : SMASH_FLAT) * lift * power);
    vx = clamp(side * (held !== 0 ? SMASH_SIDE : SMASH_FLAT) * lift * (1 - 0.32 * dive) * power, cap);
    if (dive > 0.02) vy = clamp(SMASH_DIVE * dive * lift * power, cap);
    else if (want.up) {
      // **넘겨 주기는 높이 뜬다.** 들어온 세로 속도에만 걸어 두었더니, 천천히 떨어지던 공을
      // 넘기면 13px 만 뜨고 강타 세기로 평평하게 날아갔다 — 이름과 반대다. 적어도 LOB_UP 만큼
      // 띄우고, 가로는 덜어 낸다(받는 쪽이 올려 칠 공이다).
      vy = -Math.min(MAX_UP, Math.max(LOB_UP, Math.abs(ball.vy) * SMASH_UP));
      vx *= LOB_SIDE;
    }
    else vy = 0;                                   // 수평 미사일
    // 번쩍임 세기. 가파르게 꽂을수록 크게 터진다.
    smash = Math.max(0.4, dive);
    kind = ace ? 2 : 1;
  }

  const dir = Math.sign(vx) || away;
  // 페인트(3)는 때린 게 아니라 얹은 것이다 — 멈춤도 번쩍임도 없다.
  const hold = kind === 0 || kind === 3 ? 0 : ace ? ACE_HOLD : HIT_HOLD;
  const stop = kind === 0 || kind === 3 ? 0 : HIT_WHIP + hold;
  // 몸을 어느 쪽으로 돌려 치나 — 공이 가는 쪽. 다만 공이 등 뒤 낮은 데 있으면 공 쪽을 본다
  // (그 자리를 앞으로 휘둘러 치려면 팔이 한 바퀴를 돌아야 한다).
  let face = dir;
  let hx = ball.x;
  let hy = ball.y;
  if (kind === 1 || kind === 2) {
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
    // 손끝 자리가 정해진 뒤에 각을 다듬는다 — 공은 여기서 출발한다.
    const raw = [vx, vy];
    [vx, vy] = netCap(world, hx, hy, vx, vy, !lob, ace, flat, dip);
    // 감아 친 공이 어떤 각으로도 못 넘는다(뒤쪽에서 덜 뜬 채 쳤다) — 감지 않고 그냥 강타로 친다.
    // 제 코트에 꽂히는 것보다는 그게 낫다.
    if (dip && !flies(world, hx, hy, vx, vy, true, ace, true)) {
      dip = false;
      [vx, vy] = netCap(world, hx, hy, raw[0], raw[1], !lob, ace, flat, false);
    }
  }
  const info = { kind, ace, face, hold, stop, x: hx, y: hy, smash };

  if (world.mp.role !== 'guest') {
    ball.vx = vx;
    ball.vy = vy;
    ball.spinV = clamp(vx * 0.006, 12);
    ball.smash = smash;
    if (kind === 1 || kind === 2) {
      ball.gx = ball.x - hx; ball.gy = ball.y - hy; ball.gT = HIT_WHIP;
      ball.x = hx; ball.y = hy;
      b.stop = stop; b.stopHold = hold;
      // 넘겨 주기(⌥↑)는 강타가 아니다 — 달아오르지 않는다.
      if (lob) cool(ball);
      else { ball.hot = HOT_TIME; ball.ace = ace; ball.topspin = true; ball.dip = dip; }
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

/// 이 속도로 때리면 **그물 위를 지나가나.** 진짜 같은 걸음걸이로 미리 날려 본다.
///
/// 손으로 풀 수도 있었지만(포물선) 공기 저항이 제곱이라 안 맞는다 — 올라가는 공은 저항이
/// 위로 향한 vy 까지 깎아서 계산보다 **13px 덜 올라갔고, 그만큼이 네트에 걸렸다.**
/// 그래서 셈을 흉내지 말고 그냥 날려 본다. 한 번 칠 때 240걸음이니 값이 싸다.
///
/// **아래 셈은 update() 의 공 셈과 같아야 한다.** 어긋나면 test/volley.mjs 의
/// 「자리마다 스파이크가 네트를 넘는다」가 실제로 날려 보고 잡아낸다.
function flies(world, x, y, vx, vy, hot, ace, dip = false) {
  const netX = world.w / 2;
  const toward = Math.sign(netX - x);
  const face = BALL_R + NET_FACE;
  const dt = 1 / 120;
  let hotLeft = hot ? HOT_TIME : 0;
  // 3초까지 날려 본다. 살살 넣은 서브는 네트까지 2초 가까이 걸린다.
  for (let i = 0; i < 360; i++) {
    vy += (GRAVITY + (hotLeft > 0 ? TOPSPIN + (dip ? DIP_SPIN : 0) : 0)) * dt;
    const speed = Math.hypot(vx, vy);
    if (speed > 0) {
      const air = hotLeft > 0 ? (ace ? 0 : HOT_DRAG) : 1;
      const lose = Math.min(0.5, DRAG * speed * dt * air);
      vx -= vx * lose; vy -= vy * lose;
    }
    hotLeft = Math.max(0, hotLeft - dt);
    x += vx * dt; y += vy * dt;
    // 그물 면 안이다 — **지나가는 동안 내내** 꼭대기보다 위여야 한다 (NET_CLEAR 만큼 여유).
    // 면에 들어서는 첫 걸음만 봤더니 68px 폭을 지나는 대여섯 걸음 사이에 더 떨어져 걸렸다.
    if (Math.abs(x - netX) < face) {
      if (y > world.groundY - NET_H - NET_CLEAR) return false;
    } else if (Math.sign(netX - x) !== toward) return true;   // 다 지나갔다
    if (y > world.groundY || y < 0) return false;
  }
  return false;
}

/// 네트를 넘길 수 있는 만큼만 꽂는다 — **꽂는 각도의 마지막 손질.**
///
/// 각도를 「공이 손보다 얼마나 아래냐」로만 정했더니 자리를 아예 안 봤다. 재 보니
/// **가운데(x 500)에서 제대로 뛰어 때린 공이 열 번에 열 번 네트에 맞았다** — 세게 칠수록
/// 빨리 죽는 게임이었다. 갈 길이 322px 남았는데 네트 코앞과 같은 각으로 꽂으니 당연하다.
///
/// 그래서 **그물 위를 지나갈 수 있는 가장 가파른 각**까지만 꽂는다. 네트 코앞이면 갈 길이
/// 없어 제한이 거의 없고(꽂기가 그대로 산다), 뒤로 갈수록 저절로 평평해지고, 아주 뒤에서는
/// 살짝 들어 올린다 — 수평으로 쏘면 가는 동안 떨어지니까. 높이 뜬 공은 여전히 세게 꽂힌다.
/// 「공보다 높이 떠서 때려야 꽂힌다」가 이걸로 **진짜**가 된다.
function netCap(world, x, y, vx, vy, hot, ace, flat = 0, dip = false) {
  if (flies(world, x, y, vx, vy, hot, ace, dip)) return [vx, vy];
  // **각을 눕혀도 세기는 남긴다.** 예전엔 vx 를 둔 채 vy 만 깎았다. 그런데 꽂는 공은 가로를
  // 덜어 둔 공(1 - 0.32·dive)이라, 각을 도로 눕히고 나면 **가로도 세로도 약한 공**이 남았다 —
  // 네트 앞에서 ⌥↓ 를 누르고 친 공(792)이 그냥 친 공(1111)보다 느렸다.
  // 이제 각을 돌리고, 세기는 **꽂는 각이 살아남은 만큼** 꽂는 세기로 간다. 다 눕혀졌으면
  // (가운데) 그냥 친 공과 같은 세기 — 가운데에서 ⌥↓ 가 벌이 되지도, 덤이 되지도 않는다.
  const full = Math.hypot(vx, vy);
  const base = Math.min(full, flat || full);
  const dir = Math.sign(vx) || 1;
  const want = Math.atan2(vy, Math.abs(vx));
  const at = (a) => {
    const kept = want > 0 ? Math.max(0, Math.min(1, a / want)) : 0;
    const speed = base + (full - base) * kept;
    return [dir * speed * Math.cos(a), speed * Math.sin(a)];
  };
  // 각을 위로 들수록 잘 넘는다 — 넘는 가장 가파른 각을 반으로 좁혀 찾는다.
  let steep = want;                                          // 안 넘는 쪽
  let soft = -Math.asin(Math.min(1, MAX_UP / full));         // 넘는 쪽 (여기서도 못 넘으면 어차피 그게 최선이다)
  for (let i = 0; i < 12; i++) {
    const mid = (steep + soft) / 2;
    if (flies(world, x, y, ...at(mid), hot, ace, dip)) soft = mid; else steep = mid;
  }
  const turned = at(soft);
  if (flies(world, x, y, ...turned, hot, ace, dip)) return turned;
  // **돌리기만으로는 못 넘는다** — 뒤쪽에서 덜 뜬 채 평평하게 친 공이다. 세기를 그대로 두고
  // 돌리면 위로 향한 만큼 가로를 잃어서, 위로 MAX_UP 까지 들어도 네트 앞에 떨어졌다.
  // 그때는 예전처럼 **가로는 두고 위로만 더한다.**
  let low = vy;
  let high = -MAX_UP;
  for (let i = 0; i < 9; i++) {
    const mid = (low + high) / 2;
    if (flies(world, x, y, vx, mid, hot, ace, dip)) high = mid; else low = mid;
  }
  return [vx, high];
}

/// 친 사람에게 동작을 건다. 강타는 내리치는 팔(p.swing), 토스는 밀어 올리는 두 팔(p.toss).
/// late — 이미 이만큼 지난 뒤에 알게 됐다(손님이 꾸러미로 받을 때). 그만큼 앞선 박자에서 시작한다.
function startSwing(p, info, late = 0) {
  if (!p) return;
  // 토스(0)와 페인트(3)는 두 팔로 밀어 올리는 같은 동작이다.
  if (info.kind === 0 || info.kind === 3) { p.toss = Math.max(0, TOSS_TIME - late); return; }
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
export function spike(world, tipping = false) {
  const b = world.bag;
  const p = world.player;
  if (!b?.ball || world.state !== 'play' || p.dead || b.wait > 0) return false;
  return attempt(world, {
    held: (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0),
    down: !!world.input.duck,
    up: !!world.input.jump,
    tip: tipping,
  }, true);
}

/// ⌥↓ — 공중에서 누르면 **페인트**. 땅에서는 그냥 웅크리기(디그)라 여기서 할 일이 없다.
export function tipHit(world) {
  const p = world.player;
  if (!p || p.dead || (p.air ?? 0) <= 12) return false;
  return spike(world, true);
}

/// 한 번 쳐 본다. 못 쳤으면 **왜 못 쳤는지** 띄운다 — 이게 없어서 「눌렀는데 안 나갔다」가 됐다.
/// first — 처음 누른 것인가. 기억해 둔 입력을 다시 쓸 때는 false 라 또 기억하지 않는다.
function attempt(world, want, first) {
  {
    const b = world.bag;
    // 서브가 아직 안 넘어갔다. 올린 편은 손을 못 댄다.
    if ((b.mustCross === 0 || b.mustCross === 1) && (world.team ?? 0) === b.mustCross) {
      if (first) missWord(world, world.player, '바로 넘겨야');
      return false;
    }
  }
  const b = world.bag;
  const p = world.player;
  const at = { x: p.x, air: p.air, groundY: p.groundY, side: world.team ?? 0 };

  // ① 지금 누가 치는 중인가 (히트스톱). 여기서 버리면 랠리 중에 입력이 한 번씩 씹힌다 —
  //    **버리지 말고 기억했다가** 풀리는 프레임에 대신 친다.
  if (b.stop > STOP_EPS) {
    if (first) { b.hold = { want, t: BUFFER }; missWord(world, p, '늦다'); }
    return false;
  }

  // ② 손이 닿나. 안 닿으면 — 땅에서는 몸을 던지고, 네트 앞 공중에서는 **벽을 세운다**.
  if (!inReach(b.ball, at)) {
    if (p.air <= 0) {
      const lean = (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0);
      return startSlide(world, lean || Math.sign(b.ball.x - p.x) || p.facing);
    }
    if (!want.tip && canBlock(world, p)) return doBlock(world, p, true, world.mp.myId);
    missWord(world, p, '멀다');
    return false;
  }

  // ②-2 손은 닿는데 공이 네트 너머다 — 칠 수는 없고 **막을 수는 있다.** 상대 공격수 손 앞
  //    (네트 너머 30~50px)이 블로킹을 제일 많이 누르는 자리인데, 손이 닿는다고 치기로만 보냈다가
  //    치기가 「네트 너머」로 거절해서 **벽도 안 서고 까닭도 안 떴다.**
  if (!onMySide(world, b.ball, at.side)) {
    if (!want.tip && canBlock(world, p)) return doBlock(world, p, true, world.mp.myId);
    missWord(world, p, '네트 너머');
    return false;
  }

  // ③ 발이 떴나. 12px 을 못 넘으면 강타가 아니라 토스다 — 뛰자마자 누르면 여기 걸린다.
  if (p.air > 0 && p.air <= 12) missWord(world, p, '낮다');

  // 손님은 방장에게 부탁한다. 내 화면에서도 바로 반응은 보여 주되(손맛),
  // 진짜로 정하는 건 방장이다 — 곧 오는 꾸러미가 이 값을 덮는다.
  if (world.mp.role === 'guest') world.send?.({ t: 'gm', k: 'hit', at, want });
  const hit = applyHit(world, at, want, p, world.mp.myId);
  // 손님은 공을 못 건드리지만 **팔은 바로 돈다.** 내 손이 0.1초 늦게 움직이면
  // 내가 친 게 아니라 화면이 친 것처럼 느껴진다.
  if (hit) { startSwing(p, hit); b.mineAt = 0; b.hold = null; }
  return !!hit;
}

/// 벽을 세울 수 있나 — 네트 앞이고, 떠 있고, 방금 세우지 않았다.
function canBlock(world, p) {
  return (p.air ?? 0) > 12 && !(p.blockCool > 0)
    && Math.abs(p.x - world.w / 2) <= BLOCK_NEAR;
}

/// 벽을 세운다. 0.3초 동안 손이 머리 위로 뻗는다.
///
/// **모두의 화면에서 서야 한다.** 내 화면에서만 팔이 올라가면, 남들은 공이 왜 튕겨 나갔는지
/// 모른 채 결과만 본다. 그래서 세 길로 간다: 누른 사람은 제 화면에서 바로(손맛), 손님이면
/// 방장에게 부탁하고, 방장은 판정한 뒤 **한 줄로 모두에게** 알린다.
/// mine — 내가 누른 것인가. who — 누가 세웠나 (모두에게 알릴 때 쓴다).
function doBlock(world, p, mine, who) {
  p.block = BLOCK_TIME;
  p.blockCool = BLOCK_TIME + BLOCK_COOL;
  if (mine && world.mp.role === 'guest') world.send?.({ t: 'gm', k: 'block' });
  if (world.mp.role !== 'guest') netEvent(world, [4, 0, 0, Number.isFinite(who) ? who : -1]);
  return true;
}

/// **기술표 — 왼쪽 위 구석에 작게.**
///
/// 이 게임은 기술이 아홉인데 판 위 어디에도 안 적혀 있었다. 메뉴(⌥M)를 열면 나오지만
/// **판을 멈추고 메뉴를 여는 사람은 없다.** 그래서 대부분은 「달리고 때리기」만 하다 끝난다.
/// 서브를 올리는 동안에는 서브 두 줄만 — 그때 쓸 수 없는 기술을 적어 두면 읽을 까닭이 없다.
export const KEY_ROWS = [
  ['⌥ ← →', '달리기'],
  ['⌥ ↑', '점프 · 공중이면 페인트'],
  ['⌥ Space', '때리기 · 공중이면 강타'],
  ['⌥ Space + ← →', '그쪽으로 세게 · 깊게'],
  // 위는 얹기, 아래는 꽂기. 한 줄에 같이 적는다 — 종이 쪽지는 여덟 줄까지만 들어간다.
  ['⌥ Space + ↑ ↓', '높이 넘겨 주기 / 짧게 뚝'],
  ['⌥ ↓', '땅이면 디그'],
  ['⌥ Space', '네트 앞 공중이면 블로킹'],
  ['⌥ Space', '공이 멀면 슬라이딩'],
];
export const SERVE_ROWS = [
  ['⌥ Space 길게', '서브 — 잡은 만큼 세게'],
  ['⌥ ← →', '깊게 / 짧게'],
];
function drawKeys(ctx, world, b) {
  if (world.state !== 'play') return;
  const rows = b.serving && myServe(world) ? SERVE_ROWS : KEY_ROWS;
  const x = 16, y = 14, lh = 15;
  const h = 14 + rows.length * lh;
  paperScrap(ctx, x, y, 230, h, 17);
  rows.forEach(([key, name], i) => {
    const ly = y + 20 + i * lh;
    text(ctx, key, x + 12, ly,
         { font: `700 10px ${HAN}`, color: INK, halo: 0, alpha: 0.75 });
    text(ctx, name, x + 98, ly,
         { font: `600 10px ${HAN}`, color: PENCIL, halo: 0, alpha: 0.7 });
  });
}

/// 빗나간 까닭을 짧게 띄운다. **내 화면에만** 뜬다 — 남이 왜 헛쳤는지는 알 필요가 없고,
/// 꾸러미에 실을 값도 아니다.
function missWord(world, p, word) {
  addFx(world.bag, { k: 'miss', x: p.x, y: p.groundY - p.air - BODY_H - 6,
                     t: 0, life: MISS_LIFE, word, tint: PENCIL });
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
    // 벽은 0.3초. 내려서면 바로 내린다 — 땅에 선 채로 손만 올라가 있으면 안 된다.
    if (p.block > 0) p.block = (p.air ?? 0) > 6 ? Math.max(0, p.block - dt) : 0;
    if (p.blockCool > 0) p.blockCool = Math.max(0, p.blockCool - dt);
  }
  // 발밑 고리는 내려선 뒤 잠깐 남았다 사라진다.
  b.ringFade = (world.player.air ?? 0) > 6 ? RING_FADE : Math.max(0, (b.ringFade ?? 0) - dt);
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
  if (info.kind === 0 || info.kind === 3) {
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

/// 기억해 둔 입력을 푼다. 히트스톱이 풀린 **그 프레임에** 대신 쳐 준다 —
/// 누른 사람은 「눌렀다」고 알고 있는데 아무 일도 안 일어나는 게 제일 억울하다.
/// 공이 돌고 있나 — 서브를 기다리거나 점수 뒤 쉬는 동안은 아무도 공을 못 건드린다.
/// 방장 자신은 spike()·action() 에서 걸리는데, 손님이 보낸 타격은 이 검사 없이 들어와서
/// 서브를 들고 있는 공을 쳤다(달아오름·멈춤이 남아 뒤이은 서브가 물려받았다).
function inRally(world) {
  const b = world.bag;
  return world.state === 'play' && !b.serving && !(b.wait > 0);
}

/// 손님이 때렸다. **공은 내 것이니 내가 대신 쳐 준다.** (방장만)
///
/// 자리는 손님이 보내온 값을 믿되, 내가 알고 있는 자리와 너무 다르면 무시한다 —
/// 남의 화면 값을 그대로 믿으면 코트 밖에서도 공을 칠 수 있게 된다.
function guestHit(world, from, at, want) {
  const other = world.mp.others.get(from);
  if (!other || other.dead) return null;
  if (!inRally(world)) return null;
  if (Math.abs(other.x - at.x) > 120) { world.debug && world.log?.(`손님타격 무시(자리차이) ${from}`); return null; }
  // **서브는 바로 넘겨야 한다 — 손님에게도.** 잠금 검사가 attempt() 한 곳에만 있어서
  // 이 길로 들어온 타격은 그냥 통과했다.
  const gside = at.side === 1 ? 1 : 0;
  const b = world.bag;
  if ((b.mustCross === 0 || b.mustCross === 1) && gside === b.mustCross) {
    world.debug && world.log?.(`손님타격 무시(서브잠금) ${from}`);
    return null;
  }
  // **히트스톱에 걸렸다 — 버리지 않는다.** 방장 자신은 attempt ① 이 기억해 두는데 손님
  // 타격은 그 길을 안 지나서, 멈춘 0.08초 안에 온 손님 타격은 끝내 안 쳐졌다(손님 화면에는
  // 친 것처럼 보였다). 한 사람에 하나씩 들고 있다가 풀리는 프레임에 친다.
  if (b.stop > STOP_EPS) {
    (b.guestHold ??= new Map()).set(from, { at, want, t: BUFFER });
    return null;
  }
  const ok = applyHit(world, { x: other.x, air: other.air, groundY: world.groundY, side: gside },
                      want, other, from);
  if (ok) startSwing(other, ok);
  world.debug && world.log?.(`손님타격 ${from} ${ok ? '먹힘' : '안닿음'}`);
  return ok;
}

function releaseHold(world, dt) {
  const b = world.bag;
  if (!b.hold) return;
  b.hold.t -= dt;
  if (b.hold.t <= 0) { b.hold = null; return; }
  if (b.stop > STOP_EPS) return;
  const want = b.hold.want;
  b.hold = null;
  attempt(world, want, false);
}

/// 서브를 올리는 쪽에서 공에 제일 가까운 사람. 그 사람 위로 공이 따라온다.
function serverOf(world, side) {
  if (side !== 0 && side !== 1) return null;
  const b = world.bag;
  let best = null;
  let near = Infinity;
  for (const p of [world.player, ...world.mp.others.values()]) {
    if (p.dead || p.waiting) continue;
    if (sideOfX(world, p.x) !== side) continue;
    const gap = Math.abs(p.x - b.ball.x);
    if (gap < near) { near = gap; best = p; }
  }
  return best;
}

/// 벽에 막혔다. 막은 쪽에도 보람을 준다 — 잘 뛴 것이다.
function spawnBlock(world, x, y) {
  netEvent(world, [3, Math.round(x), Math.round(y), 0]);
  addFx(world.bag, { k: 'dig', x, y, t: 0, life: 0.55, word: '막았다!', shake: SHAKE_HIT });
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
      const size = Math.round((f.k === 'miss' ? 13 : f.k === 'dig' ? 14 : f.ace ? 22 : 17) * pop);
      const y = f.y - (f.k === 'slam' ? 30 : f.k === 'miss' ? 0 : 34) - 20 * (1 - (1 - g) ** 2);
      const color = f.tint ?? (f.k === 'dig' ? INK : RED);
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

/// **발밑 고리** — 정타의 두 조건 가운데 「때」를 보여 준다.
///
/// 뜨면 생기고, 정타 높이(APEX_AIR)에 닿는 순간 **탁 조여들며 편 색으로 바뀐다.**
/// 내 것만 그린다 — 남이 언제 뛰었는지는 알 필요가 없고, 넷이 다 고리를 달고 있으면 화면이 시끄럽다.
function drawApexRing(ctx, world, upright) {
  const b = world.bag;
  const p = world.player;
  if (p.dead || world.mp.waiting || world.state !== 'play') return;
  const air = p.air ?? 0;
  const fade = air > 6 ? 1 : Math.min(1, (b.ringFade ?? 0) / RING_FADE);
  if (fade <= 0.01) return;

  const ready = air >= APEX_AIR;
  // 정타 높이에 가까울수록 조여든다. 닿으면 공 크기까지 와서 멈춘다.
  const k = Math.max(0, Math.min(1, air / APEX_AIR));
  const r = RING_R - (RING_R - BALL_R) * k;
  const y = p.groundY - 3;
  const tint = ready ? TEAM_INK[world.team ?? 0] : PENCIL;
  upright(p.x, y, () => {
    // 바닥에 눕혀 그린다 — 발밑에 놓인 고리라야 「얼마나 떴나」로 읽힌다.
    ctx.save();
    ctx.translate(p.x, y); ctx.scale(1, 0.34); ctx.translate(-p.x, -y);
    circle(ctx, p.x, y, r, { width: ready ? 3 : 1.8, color: tint, seed: 210, amp: 0.5,
                             halo: false, alpha: (ready ? 0.9 : 0.5) * fade });
    ctx.restore();
  });
}

/// **공 달무리** — 정타의 두 조건 가운데 「자리」를 보여 준다.
///
/// 공이 내 손끝 원(SWEET_R) 안에 들면 공 둘레가 빛난다. 발밑 고리와 **같이** 켜진 순간이 정타다.
function drawSweetHalo(ctx, world, upright, bx, by) {
  const p = world.player;
  if (p.dead || world.mp.waiting || world.state !== 'play') return;
  if ((p.air ?? 0) <= 6) return;                 // 땅에서는 어차피 토스라 뜻이 없다
  const at = { x: p.x, air: p.air, groundY: p.groundY };
  if (!inSweet({ x: bx, y: by }, at)) return;
  // ⌥↑ 를 잡고 있으면 치는 것은 넘겨 주기라 정타가 안 난다 — 정타 빛도 안 켠다.
  const ready = (p.air ?? 0) >= APEX_AIR && !world.input.jump;
  const tint = ready ? TEAM_INK[world.team ?? 0] : PENCIL;
  upright(bx, by, () => {
    circle(ctx, bx, by, BALL_R + 7, { width: ready ? 3 : 1.8, color: tint, seed: 211, amp: 0.7,
                                      halo: false, alpha: ready ? 0.95 : 0.45 });
  });
}

/// 서브 힘 막대. **올리는 사람 머리 위에만** 뜬다 — 상대도 본다 (얼마나 세게 올지는
/// 숨길 것이 아니라 읽을 것이다). 꽉 찬 뒤에도 잡고 있으면 빨갛게 타들어 간다.
function drawServeGauge(ctx, world, upright) {
  const b = world.bag;
  if (!b.serving || world.state !== 'play') return;
  const server = serverOf(world, b.serveBy);
  if (!server) return;
  const held = world.mp.role === 'guest' && myServe(world) ? b.myCharge : b.charge;
  const w = SERVE_BAR, h = 6;
  const x = server.x - w / 2;
  const y = server.groundY - server.air - BODY_H - 46;
  const tint = TEAM_INK[b.serveBy];
  const full = clamp01(((held ?? -1) - SERVE_HOLD) / (SERVE_FULL - SERVE_HOLD));
  const burn = held > SERVE_FULL ? clamp01((held - SERVE_FULL) / (SERVE_BURST - SERVE_FULL)) : 0;
  upright(server.x, y, () => {
    stroke(ctx, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]],
           { width: 1.6, color: PENCIL, seed: 97, amp: 0.4, close: true, sharp: true,
             halo: false, alpha: 0.8 });
    if (full > 0.01) {
      const fill = Math.max(2, (w - 4) * full);
      stroke(ctx, [[x + 2, y + h / 2], [x + 2 + fill, y + h / 2]],
             { width: h - 2.4, color: burn > 0 ? RED : tint, seed: 98, amp: 0.25,
               halo: false, alpha: 0.9 });
    }
    // 꽉 찬 뒤로는 눈금이 떨린다 — 여기서부터는 놓아야 한다.
    if (burn > 0) {
      const shake = (Math.random() - 0.5) * 3 * burn;
      text(ctx, '놔!', server.x + w / 2 + 12 + shake, y + h,
           { font: `800 12px ${HAN}`, color: RED, align: 'left', halo: 3 });
    }
    if (held < 0) {
      text(ctx, '⌥Space 눌러 서브', server.x, y - 6,
           { font: `700 11px ${HAN}`, color: PENCIL, align: 'center', halo: 3 });
    }
  });
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

/// 판을 끝낸다. **점수가 나는 그 자리에서** 본다.
///
/// 전에는 update 끝에서 봤는데, 점수가 나면 곧바로 다음 서브로 넘어가고 서브를 기다리는
/// 동안은 update 가 일찍 돌아가 버린다 — 그래서 **이긴 사람이 진 사람의 다음 서브를
/// 기다려야** 만세가 떴다. 진 사람이 안 올리면 영영 안 끝났다.
function finish(world, b) {
  const won = b.score[0] > b.score[1] ? 0 : 1;
  // 순위표 칸은 [이름, 시간ms, 개수, 번호] 다. 배구에서는 「점수」를 개수 칸에 넣는다.
  const rows = [0, 1]
    .map((side) => [`${teamName(side)} 팀`, Math.round(world.elapsed * 1000), b.score[side], -1 - side])
    .sort((a, c) => c[2] - a[2]);
  world.onGameOver?.({ name: `${teamName(won)} 팀`, side: won, rows });
  b.score = [0, 0];
}

function point(world, toSide) {
  const b = world.bag;
  b.score[toSide]++;
  b.lastPoint = { side: toSide, at: world.elapsed };
  serve(world, 1 - toSide);                        // 진 쪽에서 다시 올린다 (공을 치운다)
  if (matchOver(b.score)) finish(world, b);        // 끝은 **그 자리에서** 본다
}

export default {
  id: 'volley',
  name: '배구',
  line: '빨강 편 대 파랑 편. 우리 쪽에 떨어뜨리면 상대 점수. 다섯 점 먼저, 4:4 부터는 듀스 (두 점 차).',
  keys: [['⌥ Space (서브)', '잡고 있는 만큼 힘이 찬다 — 너무 오래 잡으면 실패'],
         ['⌥ ← → (서브)', '깊게 / 짧게. 서 있는 자리가 좌우 조준 — 뒤쪽 절반까지만'],
         ['⌥ ← →', '달리기 (네트는 못 넘는다)'], ['⌥ ↑', '점프'],
         ['⌥ Space', '때리기 — 뛰어서 누르면 강타'],
         ['⌥ Space + ← →', '그 방향으로 세게 — 빠르고 깊게 간다'], ['⌥ Space + ↑', '높이 넘겨 주기'],
         ['⌥ Space + ↓', '감아 치기 — 네트를 넘자마자 뚝 떨어진다. 공이 손 밑에 있을 때'],
         ['⌥ ↑ (공중)', '페인트 — 살짝 얹어 블록 너머로. 네트 앞에서만 넘어간다'],
         ['⌥ ↓ (땅)', '디그 — 웅크려 받으면 높고 곧게 뜬다'],
         ['⌥ Space (네트 앞 공중)', '블로킹 — 손을 넘겨 벽을 세운다'],
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
  /// ⌥Space 를 이 게임이 가져간다. 서브를 올릴 차례면 **누르고 있는 동안 힘이 찬다.**
  action(world) {
    const b = world.bag;
    b.spaceDown = true;
    if (b.serving) {
      // 쉬는 동안(RESET_WAIT)은 잡기 시작하지도 않는다 — hitServe 도 막지만, 여기서 차오르면
      // 막대가 찬 채로 못 넣는 까닭을 모른다.
      if (!myServe(world) || b.wait > 0) return;
      if (world.mp.role === 'guest') {
        b.myCharge = 0;
        // **방장도 같이 센다.** 손님 혼자 세면 너무 오래 잡아도 실패가 없었다(3초 잡아도
        // 세기 100 서브) — 실패는 방장만 보는 b.charge 에 걸려 있었다. 방장이 세면 실패도,
        // 남들 화면의 힘 막대(sv)도 저절로 따라온다.
        world.send?.({ t: 'gm', k: 'hold' });
        return;
      }
      b.charge = 0;
      return;
    }
    spike(world);
  },
  /// ⌥Space 를 뗐다. 차 있던 힘으로 서브를 때린다.
  release(world) {
    const b = world.bag;
    b.spaceDown = false;
    // 내가 올릴 차례일 때만. 방장의 b.charge 는 손님이 잡은 것을 세기도 한다 —
    // 방장이 딴 데서 ⌥Space 를 떼도 손님 서브가 나가면 안 된다.
    if (!b.serving || !myServe(world)) return;
    const held = world.mp.role === 'guest' ? b.myCharge : b.charge;
    if (!(held >= 0)) return;
    const power = clamp01((held - SERVE_HOLD) / (SERVE_FULL - SERVE_HOLD));
    const dir = (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0);
    if (world.mp.role === 'guest') {
      b.myCharge = -1;
      world.send?.({ t: 'gm', k: 'serve', p: Math.round(power * 100), d: dir });
      return;
    }
    hitServe(world, power, dir);
  },
  /// 방향키를 누른 순간 — **공중의 ⌥↑ 는 페인트다.** 나머지는 흘린다.
  ///
  /// 한동안 ⌥↓ 로도 됐는데 도로 뺐다. ↓ 는 이제 **내리꽂기**를 고르는 키(⌥Space + ↓)라,
  /// 꽂으려고 ↓ 를 누르는 순간 페인트가 먼저 나가 버린다 — 두 기술이 같은 키를 못 쓴다.
  /// 위는 얹기(페인트·넘겨 주기), 아래는 꽂기. 손가락이 외우기에도 이쪽이 맞다.
  ///
  /// **누른 그 순간 얹는다.** v3.25.0 에 ⌥Space 가 뒤따르나 네 프레임 기다리게 했더니, 같은 때에
  /// 눌러도 ⌥Space 보다 네 프레임 늦게 나가서 그 사이 공이 손 밑으로 빠졌다(「페인트가 잘 안 된다」).
  /// ↑ 를 새로 누르고 곧바로 ⌥Space 를 눌러도 두 번 치지는 않는다 — 같은 사람은 곧바로 두 번 못 친다.
  /// ⌥Space 를 잡은 채 누른 ↑ 는 페인트가 아니다 (그건 넘겨 주기를 고르는 손이다).
  tap: (world, key) => {
    if (key !== 'jump' || world.bag.spaceDown || (world.player.air ?? 0) <= 12) return;
    tipHit(world);
  },


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
    // 서브를 올릴 차례면 **뒤쪽 절반 안에서만** 선다. 공이 내 자리를 따라오므로
    // 이게 곧 서브 조준의 범위다 — 네트 코앞에서 넣는 서브는 없다.
    if (myServe(world)) {
      const line = serveLine(world, side);
      if (side === 0 && p.x > line) { p.x = line; p.vx = Math.min(0, p.vx); }
      if (side === 1 && p.x < line) { p.x = line; p.vx = Math.max(0, p.vx); }
    }
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
            hot: 0, ace: false, topspin: false, dip: false, skip: null, skipT: 0, gx: 0, gy: 0, gT: 0 },
    tail: [], tailT: 0,
    // 타격 자국(각자 굴린다) · 남에게 알릴 한 줄짜리 일 · 히트스톱 남은 시간.
    fx: [], events: [], stop: 0, stopHold: 0, mineAt: 9,
    // 기억해 둔 입력 · 발밑 고리 남은 시간 · 서브를 올리는 쪽.
    hold: null, ringFade: 0, serveBy: 0, mustCross: null,
    // ⌥Space 를 잡고 있나 · 히트스톱에 씹힌 손님 타격(방장만).
    spaceDown: false, guestHold: new Map(),
    // 서브 — 들고 있나 · 얼마나 찼나 · 손님이 제 화면에서 세는 몫.
    serving: false, charge: -1, myCharge: -1,
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
      if (b.myCharge >= 0) b.myCharge += dt;
      // 너무 오래 잡았다. 실패는 방장이 제 셈으로 낸다(hold) — 여기서는 떼도 안 나가게만 한다.
      if (b.myCharge > SERVE_BURST) b.myCharge = -1;
      if (b.baseX === undefined) return;
      // 방장이 알려 온 히트스톱(unpack)을 제 화면에서도 센다 — 그래야 그 사이 누른 것을
      // 버리지 않고 기억했다가(attempt ①) 풀리는 프레임에 보낸다.
      if (b.stop > 0) b.stop = Math.max(0, b.stop - dt);
      b.age = Math.min(b.age + dt, AGE_CAP);
      b.errorX *= Math.exp(-dt / 0.06);
      b.errorY *= Math.exp(-dt / 0.06);
      // 탑스핀도 방장과 같은 식으로 이어 그린다. 안 그러면 달아오른 공만 손님 화면에서
      // 조금 위로 뜨고, 그 차이가 꾸러미마다 다시 녹느라 공이 미세하게 떤다.
      const g = GRAVITY + (b.ball.topspin ? TOPSPIN + (b.ball.dip ? DIP_SPIN : 0) : 0);
      // **앞질러 그리는 셈은 벽을 모른다.** 그대로 두면 끊긴 사이에 공이 코트 밖으로
      // 나갔다 돌아온다 — 재 보니 0.4초 끊길 때 스무 프레임이 밖에 있었다. 판 안에 가둔다.
      // (net.js 가 남의 자리를 판 안에 가두는 것과 같은 까닭이다.)
      b.ball.x = clamp2(b.baseX + b.baseVX * b.age + b.errorX, BALL_R, world.w - BALL_R);
      b.ball.y = Math.min(b.baseY + b.baseVY * b.age + 0.5 * g * b.age * b.age + b.errorY,
                          world.groundY - BALL_R);
      b.ball.spin += b.ball.spinV * dt;
      releaseHold(world, dt);
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

    if (b.wait > 0) b.wait -= dt;
    // 서브를 기다리는 동안. **공은 올리는 사람 손에 들려 있고 판은 안 돈다.**
    //
    // 공이 그 사람 위로 따라오는 것은 그대로 둔다 — 걸어서 자리를 잡는 것이 좌우 조준이다
    // (「대각선은 조준이 아니라 자리다」, 이 게임이 이미 쓰던 규칙). 거기에 **힘**이 붙었다.
    if (b.serving) {
      const server = serverOf(world, b.serveBy);
      if (server) {
        const want = Math.max(BALL_R + 8, Math.min(world.w - BALL_R - 8, server.x));
        b.ball.x += (want - b.ball.x) * Math.min(1, dt * 9);
        b.ball.y += ((server.groundY - server.air - BODY_H - 30) - b.ball.y) * Math.min(1, dt * 9);
      }
      if (world.mp.role === 'guest') return;          // 손님은 방장이 굴린 것을 볼 뿐이다
      if (b.wait > 0) return;
      // **올릴 사람이 아무도 없는 코트면 저절로 올라간다.** 혼자 하거나 그 편이 다 나갔을
      // 때다. 자동 서브를 없앤 것은 「올릴 사람이 생각하는 동안 대신 눌러 주지 말라」는
      // 뜻이지, **아무도 없는데 판이 멎어 있으라**는 뜻이 아니다 — 혼자 하면 내가 한 점
      // 내는 순간 서브권이 빈 코트로 넘어가서 그대로 영영 멎었다.
      if (!server) {
        b.idle = (b.idle ?? 0) + dt;
        if (b.idle > EMPTY_WAIT) { b.idle = 0; hitServe(world, 0.3 + Math.random() * 0.55, 0); }
        return;
      }
      b.idle = 0;
      // **저절로 올라가지 않는다.** 올리는 사람이 누를 때까지 기다린다 —
      // 서브는 매 점수마다 주어지는 선택이고, 몇 초 만에 대신 눌러 주면 그 선택이 없어진다.
      if (b.charge >= 0) {
        b.charge += dt;
        if (b.charge > SERVE_BURST) { serveFault(world); return; }
      }
      return;
    }

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
    // 히트스톱에 씹혔던 입력을 여기서 푼다 — 누른 사람은 「눌렀다」고 알고 있다.
    releaseHold(world, dt);
    // 손님 것도. 손님 타격은 방장에게 와서야 판정되니, 방장의 히트스톱에 걸리면 여기서 푼다.
    for (const [from, h] of b.guestHold ?? []) {
      b.guestHold.delete(from);
      h.t -= dt;
      if (h.t > 0) guestHit(world, from, h.at, h.want);
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
    ball.vy += (GRAVITY + (ball.topspin ? TOPSPIN + (ball.dip ? DIP_SPIN : 0) : 0)) * dt;

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

    // 옆벽. **들어간 만큼 되접는다** — 벽에 자리를 붙여 버리면 안 된다.
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
              () => ball.vx, (v) => { ball.vx = v; });
    // 벽에 한 번 닿으면 그냥 공이다. 벽을 맞고도 달아오른 채로 다니면 아무도 못 받는다.
    if (bounced) { ball.hit = 1; ball.hitX = ball.x; ball.hitY = ball.y; cool(ball); }

    // 네트. 꼭대기는 넘어가고, 몸통에 맞으면 되돌아온다.
    const netX = world.w / 2;
    const netTop = world.groundY - NET_H;
    if (Math.abs(ball.x - netX) < BALL_R + NET_FACE && ball.y > netTop) {
      ball.x = netX + Math.sign(ball.x - netX || 1) * (BALL_R + NET_FACE);
      ball.vx = -ball.vx * 0.55;
      cool(ball);
    }

    trail(b, dt);
    report(world, b, dt);

    // 사람에게 맞았나. 살아 있는 사람만 친다.
    const bodies = [world.player, ...world.mp.others.values()].filter((p) => !p.dead && !p.waiting);
    // **벽이 먼저다.** 손이 몸보다 위에 있으니, 벽에 맞을 공이 몸에 먼저 맞으면 안 된다.
    let walled = false;
    for (const p of bodies) {
      if (p === ball.skip || !blocks(ball, p, netX)) continue;
      blockBack(ball, p, netX);
      spawnBlock(world, ball.x, ball.y);
      walled = true;
      break;
    }
    if (walled) { trail(b, dt); return; }

    // 서브가 아직 네트를 안 넘었다. 넘은 순간 잠금이 풀린다.
    if (b.mustCross === 0 || b.mustCross === 1) {
      const netX = world.w / 2;
      if (b.mustCross === 0 ? ball.x > netX : ball.x < netX) b.mustCross = null;
    }
    for (const p of bodies) {
      // 올린 편은 넘어가기 전까지 못 건드린다 (서브는 바로 넘겨야 한다).
      if ((b.mustCross === 0 || b.mustCross === 1) && sideOfX(world, p.x) === b.mustCross) continue;
      // 머리 위 공을 내리꽂으면 공이 제 몸을 지나간다. 그 프레임에 몸에 맞아 도로 떠오르면
      // **강타가 토스가 된다** (vy +1700 → -811 을 실제로 봤다). 친 사람만 잠깐 건너뛴다.
      if (p === ball.skip || !touches(ball, p)) continue;
      // **달아오른 강타를 몸으로 받아 냈다.** 아무리 세게 와도 몸에 맞은 공은 MAX_UP 까지만
      // 떠오른다(bounceOff) — 정타가 사기가 안 되는 건 여기다. 받아 낸 쪽에 「받았다!」가 뜬다.
      const hot = ball.hot > 0;
      cool(ball);
      // **디그** — 웅크린 채 받으면 높고 곧게 세워 올린다. 세게 온 공을 받아 냈어도 마찬가지다.
      const dug = bounceOff(ball, p);
      if (dug || hot) spawnDig(world, ball.x, ball.y);
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

    // 점수를 손으로 세워 둔 판(시험·되돌리기)에서도 끝은 본다. 진짜 판에서는 point() 가
    // 그 자리에서 이미 봤다.
    if (matchOver(b.score)) finish(world, b);

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

    // 발밑 고리는 제일 밑에 — 사람과 공이 그 위에 온다.
    drawApexRing(ctx, world, upright);

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

    // 손끝에 든 공은 빛난다 — 발밑 고리와 같이 켜지면 정타다.
    drawSweetHalo(ctx, world, upright, bx, by);

    // 「쾅!」·「받았다!」는 공 위에 뜬다.
    drawFx(ctx, b, upright, true);

    // 서브 선 — 여기까지만 나갈 수 있다. 서브를 올리는 동안만 보인다.
    if (b.serving && myServe(world)) {
      const line = serveLine(world, world.team ?? 0);
      stroke(ctx, [[line, world.groundY - 8], [line, world.groundY - 74]],
             { width: 2, color: PENCIL, seed: 99, amp: 1.0, halo: false, alpha: 0.45 });
      text(ctx, '서브 선', line, world.groundY - 82,
           { font: `700 11px ${HAN}`, color: PENCIL, align: 'center', halo: 3 });
    }
    // 서브 힘 막대 — 올리는 사람 머리 위.
    drawServeGauge(ctx, world, upright);
    // 내 슬라이딩 게이지. 남의 것은 안 그린다 — 오가는 값도 아니고, 알 필요도 없다.
    drawSlideGauge(ctx, world, upright);

    // 기술표. 왼쪽 위 구석에 작게.
    drawKeys(ctx, world, b);

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


  },

  /// 손님이 보내오는 말. 방장만 듣는다.
  message(world, from, msg) {
    if (world.mp.role !== 'host') return;
    if (msg.k === 'hit' && msg.at && msg.want) {
      guestHit(world, from, msg.at, msg.want);
      return;
    }
    // 손님이 벽을 세웠다. 자리는 방장이 아는 것을 쓰고, 조건도 방장이 다시 본다 —
    // 남의 화면 값을 그대로 믿으면 코트 한가운데서도 벽이 선다.
    // 손님이 서브를 때렸다. **그 사람이 올릴 차례일 때만** 듣는다.
    if (msg.k === 'serve' || msg.k === 'hold') {
      const other = world.mp.others.get(from);
      if (!other || other.dead || other.waiting) return;
      const b = world.bag;
      if (!b.serving || b.wait > 0 || sideOfX(world, other.x) !== b.serveBy) return;
      if (serverOf(world, b.serveBy) !== other) return;
      // 잡기 시작했다 — 방장이 센다. 실패(SERVE_BURST)도 여기서 난다.
      if (msg.k === 'hold') { b.charge = 0; return; }
      // 옛 손님은 hold 를 안 보낸다. 그때는 b.charge 가 −1 인 채로 온다 — 보내온 세기를 쓴다.
      hitServe(world, clamp01((+msg.p || 0) / 100), Math.sign(+msg.d || 0));
      return;
    }
    if (msg.k === 'block') {
      const other = world.mp.others.get(from);
      if (!inRally(world)) return;
      if (other && !other.dead && canBlock(world, other)) doBlock(world, other, false, from);
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
          b.ball.hot > 0 ? (b.ball.ace ? 2 : 1) : 0,
          // 여덟째 칸 — 감아 친 공(⌥↓)인가. 손님이 같은 무게로 이어 그린다. 옛 손님은 안 읽는다.
          b.ball.hot > 0 && b.ball.dip ? 1 : 0],
      s: b.score,
      w: Math.round(b.wait * 100) / 100,
      // 서브 — 들고 있나 · 누가 올리나 · 얼마나 찼나.
      sv: b.serving ? [b.serveBy, Math.round(Math.max(0, b.charge) * 100), b.charge >= 0 ? 1 : 0] : null,
      // 방금 터진 타격. 있을 때만 싣고 바로 비운다.
      f: flash ?? undefined,
      // 바닥에 꽂힘·받아 냄. 같은 식으로 한 번만 싣는다.
      e: events ?? undefined,
      // **서브 잠금.** 이걸 안 실어서 손님 쪽은 늘 null 이었다 — 방장은 「바로 넘겨야」로
      // 막히는데 손님만 자기 팀 서브를 네트 앞에서 받아 꽂을 수 있었다.
      mc: b.mustCross === 0 || b.mustCross === 1 ? b.mustCross : -1,
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
        hold: kind === 2 ? ACE_HOLD : kind === 3 ? 0 : HIT_HOLD, stop: old ? 0 : data.f[6],
        x: hx, y: hy, smash: hard,
      };
      // 방장의 히트스톱을 손님도 안다. 모르면 그 사이 누른 타격을 곧장 보내고, 방장은
      // 멈춘 채라 못 친다 — 손님 화면에만 팔과 「쾅」이 뜬다. 알면 기억했다가 풀리면 보낸다.
      if (info.stop > 0) b.stop = Math.max(b.stop ?? 0, info.stop);
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
      else if (ev[0] === 3) addFx(world.bag, { k: 'dig', x: ev[1], y: ev[2], t: 0, life: 0.55,
                                               word: '막았다!', shake: SHAKE_HIT });
      else if (ev[0] === 5) addFx(world.bag, { k: 'dig', x: ev[1], y: ev[2], t: 0, life: 0.4,
                                               word: ev[3] > 85 ? '강서브!' : null });
      // 누가 벽을 세웠다. **내가 세운 것이면 이미 내 화면에서 올렸다** — 두 번 걸지 않는다.
      else if (ev[0] === 4) {
        const id = ev[3];
        const one = id === world.mp.myId ? null : world.mp.others.get(id);
        if (one && !one.dead) { one.block = BLOCK_TIME; one.blockCool = BLOCK_TIME + BLOCK_COOL; }
      }
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
    const [x, y, vx, vy, spin, spinV, hot, dipped] = data.b;
    b.baseX = x; b.baseY = y; b.baseVX = vx; b.baseVY = vy;
    b.ball.spin = spin; b.ball.spinV = spinV;
    // 달아오름은 보이는 것(속도선·탑스핀)에만 쓴다. 판정은 어차피 방장이 한다.
    b.ball.hot = hot > 0 ? HOT_TIME : 0;
    b.ball.ace = hot === 2;
    b.ball.topspin = hot > 0;
    b.ball.dip = hot > 0 && dipped === 1;
    b.age = 0;
    b.errorX = first ? 0 : showX - x;
    b.errorY = first ? 0 : showY - y;
    // 오차가 너무 크면 녹이지 않고 그 자리에 놓는다 — 화면을 가로질러 스르르 미끄러지는
    // 공은 더 이상하다 (서브 리셋·첫 꾸러미가 여기로 온다).
    if (Math.abs(b.errorX) > SNAP_AT || Math.abs(b.errorY) > SNAP_AT) { b.errorX = 0; b.errorY = 0; }
    if (first) { b.ball.x = x; b.ball.y = y; b.tail = []; }
    if (Array.isArray(data.s) && data.s.length === 2 && data.s.every(Number.isFinite)) b.score = data.s;
    b.wait = Number.isFinite(data.w) ? data.w : 0;
    // 서브를 들고 있는 중인가. 내가 올리는 사람이면 **내가 잡고 있는 시간은 내 것**을 쓴다 —
    // 방장 값으로 덮으면 막대가 한 왕복 늦게 차오른다.
    if (Array.isArray(data.sv) && data.sv.length >= 3 && data.sv.every(Number.isFinite)) {
      b.serving = true;
      b.serveBy = data.sv[0] ? 1 : 0;
      if (!(b.myCharge >= 0)) b.charge = data.sv[2] ? data.sv[1] / 100 : -1;
    } else if (data.sv === null) { b.serving = false; b.charge = -1; b.myCharge = -1; }
    // 서브 잠금 — 넘어가기 전까지 올린 편은 못 건드린다. 손님도 자기 화면에서 미리 막혀야
    // 「바로 넘겨야」가 뜬다 (안 그러면 눌러 놓고 왜 안 맞는지 모른다).
    if (Number.isFinite(data.mc)) b.mustCross = data.mc === 0 || data.mc === 1 ? data.mc : null;
    b.started = true;
  },

  resize() {},
};
