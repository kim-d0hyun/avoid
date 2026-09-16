// 야구.
//
// 둘이 한다. 한 사람은 **던지기만**, 한 사람은 **치기만** 한다. 달리기도 수비도 송구도
// 판이 알아서 한다 — 사람이 정하는 건 「무엇을 어디로 던질까」와 「언제 휘두를까」 둘뿐이다.
//
// 왜 이렇게 잘랐나. 야구는 규칙이 끝없이 나오는 경기라, 사람이 할 수 있는 일을 하나씩
// 늘리다 보면 사무실에서 3분 하는 게임이 아니게 된다. 손이 하는 일을 두 개로 묶어 두면
// 남는 것은 **수싸움과 타이밍**인데, 그 둘이 야구에서 제일 재미있는 부분이다.
//
// 화면은 하나다. 홈이 아래 가운데, 그라운드가 위로 열린다. 투구는 화면 아래로 날아오고
// 타구는 위로 날아간다. 카메라를 안 바꾼다 — 업무 화면 위에 띄워 놓고 곁눈으로 봐야 하니까.
//
// 공을 누가 굴리나 — **방장이 굴린다.** 배구와 같은 이유다. 다만 야구는 한 번 친 뒤에
// 벌어지는 일이 길다(수비수가 달리고, 주자가 돌고, 송구가 오간다). 그걸 60Hz 로 실어
// 나르는 대신 **친 순간에 결말을 통째로 정해서 대본 하나로 보낸다.** 손님은 그 대본을
// 자기 화면에서 연기한다 — 오갈 것이 한 번뿐이라 지연이 끼어들 틈이 없다.

import { INK, RED, PENCIL, PAPER_SOLID, stroke, circle, text, paperScrap } from '../draw/ink.js';
import { drawStickman, PITCH_TIME, PITCH_RELEASE, BAT_TIME } from '../draw/stickman.js';

// 편은 옷 색으로 가른다. 배구와 같은 두 색 — 이 게임 안에서 「빨강 편/파랑 편」은
// 한 가지 뜻으로만 읽혀야 한다.
const TEAM_INK = ['#b5352f', '#2f6fb0'];
const TEAM_NAME = ['홈', '원정'];
const HAN = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const MONO = '"American Typewriter", "Courier New", monospace';
const GRASS = 'rgba(112, 146, 88, 0.17)';
const DIRT = 'rgba(176, 140, 96, 0.22)';

const RAD = Math.PI / 180;
const FR = 1 / 60;
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const smooth = (t) => { const k = clamp(t, 0, 1); return k * k * (3 - 2 * k); };

// ── 판. 피트로 재고, 그릴 때만 화면 좌표로 옮긴다 ─────────────────────────────

const G = 32.2;                 // 중력 ft/s²
const BASE_FT = 90;             // 루간
const SECOND_FT = 127.28;       // 홈에서 2루까지 (루간의 √2 배)
const MOUND_FT = 60.5;
export const FENCE_MID = 352;   // 가운데 담장
export const FENCE_LINE = 248;  // 파울 폴
const FOUL_DEG = 45;            // 파울선까지의 각

/// 수비 아홉. 번호는 **야구 기록지의 수비 번호 그대로**다 — 병살을 6-4-3 으로 적는 그 번호.
/// 판이 끝나면 이 번호로 적은 줄이 그대로 기록지가 된다.
const POSTS = [
  { no: 1, name: '투수', deg: 0, ft: MOUND_FT },
  { no: 2, name: '포수', deg: 0, ft: -15 },
  { no: 3, name: '1루수', deg: 38, ft: 103 },
  { no: 4, name: '2루수', deg: 20, ft: 148 },
  { no: 5, name: '3루수', deg: -38, ft: 103 },
  { no: 6, name: '유격수', deg: -20, ft: 148 },
  { no: 7, name: '좌익수', deg: -30, ft: 268 },
  { no: 8, name: '중견수', deg: 0, ft: 298 },
  { no: 9, name: '우익수', deg: 30, ft: 268 },
];
const PITCHER = 0, CATCHER = 1;
/// 이 거리 안쪽이 내야다. 병살과 「내야 안타」가 이 선으로 갈린다.
const INFIELD_FT = 165;

/// 루의 자리 — [각도, 거리]. 0번이 홈이고 시계 반대 방향으로 1·2·3루.
const BASES = [[0, 0], [FOUL_DEG, BASE_FT], [0, SECOND_FT], [-FOUL_DEG, BASE_FT]];

/// 평면 위의 두 점 사이 (진짜 피트). 그리는 배율은 가로세로가 다르지만, **재는 것은
/// 늘 진짜 거리로 재야** 수비수가 왼쪽·오른쪽으로 똑같이 달린다.
const flat = (deg, ft) => [Math.sin(deg * RAD) * ft, Math.cos(deg * RAD) * ft];
function ftDist(d1, f1, d2, f2) {
  const a = flat(d1, f1), b = flat(d2, f2);
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}
/// 평면 좌표를 다시 [각도, 거리] 로.
function polar(x, y) {
  return [Math.atan2(x, y) / RAD, Math.hypot(x, y)];
}
/// 담장까지의 거리. 가운데가 제일 멀고 파울선 쪽이 제일 가깝다.
/// 가운데는 평평하게 멀고 파울선 쪽에서 뚝 떨어진다. 코사인으로 두면 담장이 밋밋한
/// 직선처럼 보여서 그라운드가 부채가 아니라 세모로 읽힌다 — 진짜 구장의 담장이 그리는 선이다.
export const fenceFt = (deg) =>
  FENCE_MID - (FENCE_MID - FENCE_LINE) * (Math.abs(clamp(deg, -FOUL_DEG, FOUL_DEG)) / FOUL_DEG) ** 1.35;

/// 화면에 앉히는 자. 창 크기가 달라져도 그라운드가 늘 한 화면에 들어오게 다시 잰다.
///
/// **원근법으로 앉힌다.** 거리에 비례해 올리면(그게 처음에 만든 것이다) 홈에서 마운드까지가
/// 60피트인데 담장까지가 336피트라, 마운드가 홈 바로 위 100픽셀 자리에 붙는다. 스트라이크
/// 존을 그릴 자리가 없어서 존과 마운드가 겹쳐 버렸다. 카메라를 홈 뒤로 물린 것처럼 깊이를
/// 나누면 **가까운 데가 넓게 펴지고 먼 데가 접힌다** — 사람 눈이 야구장을 보는 모양 그대로다.
const CAM = 300;                                    // 카메라가 홈 뒤로 물러난 만큼 (피트)
const persp = (ft) => CAM / (Math.max(-CAM * 0.6, ft) + CAM);

export function layout(world) {
  const w = world.w || 1512;
  const h = world.h || 944;
  const hy = h - 92;                                // 홈 — 포수와 백스톱 자리를 아래 남긴다
  const rise = (hy - Math.max(60, h * 0.085)) / (1 - persp(FENCE_MID));
  // 파울 폴이 화면 가장자리에 닿게 가로를 편다.
  const pole = Math.sin(FOUL_DEG * RAD) * FENCE_LINE;
  const kx = (w / 2 - 38) / (pole * persp(zOf(FOUL_DEG, FENCE_LINE)));
  return { w, h, hx: w / 2, hy, rise, kx };
}
/// [각도, 거리] → 화면 [x, y].
///
/// **깊이는 반지름 거리가 아니라 앞으로 나간 몫(cos)이다.** 처음엔 반지름을 그대로 넣었는데,
/// 그러면 투영이 원근법이 아니게 되어 **곧은 선이 휜다** — 1루에서 2루로 달리는 주자가
/// 베이스라인 밖으로 부풀어 나갔고, 마름모가 마름모로 안 보였다.
export function spot(L, deg, ft) {
  const r = deg * RAD;
  const k = persp(Math.cos(r) * ft);
  return [L.hx + Math.sin(r) * ft * L.kx * k, L.hy - L.rise * (1 - k)];
}
/// 카메라에서 본 깊이.
const zOf = (deg, ft) => Math.cos(deg * RAD) * ft;
/// 공이 떠 있는 높이. 깊이와 **다른 자로 재고**, 멀수록 같이 줄어든다.
const HIGH = 2.4;
const lift = (L, z, deg, ft) => z * HIGH * persp(zOf(deg, ft));
/// 멀수록 작게. 2차원 화면에서 깊이를 알려 주는 건 이 크기 하나뿐이다.
/// 원근 그대로(persp) 줄이면 담장 앞 사람이 너무 작아진다 — 절반만 따라간다.
const depth = (deg, ft) => 0.45 + 0.55 * persp(zOf(deg, ft));

// ── 던지기 ────────────────────────────────────────────────────────────────

/// 구종 셋.
///
/// 판을 가르는 건 **속도차**다. 직구를 노리면 커브에 앞서고, 커브를 노리면 직구에 늦는다.
/// 체인지업은 직구와 같은 길로 나가다 느린 공이라, 「직구다」 하고 휘두르면 한 박자 빠르다.
///
///   dur   홈까지 걸리는 시간 (초)
///   drop  존 높이의 몇 배만큼 늦게 떨어지나
///   bend  옆으로 휘는 몫 (존 폭의 배수)
///   tilt  이 공을 치면 발사각이 몇 도 눌리나 — 떨어지는 공은 위를 치게 된다
/// 프레임으로 고쳐 두면 24 · 41 · 33 이다. **직구와 커브가 17프레임 떨어져 있다** —
/// 이 간격이 이 게임의 전부다. 처음엔 25 · 36 · 33 으로 뒀는데, 그러면 구종을 잘못 읽어도
/// 빗맞기만 할 뿐 헛스윙이 안 나온다. 재 보니 타율이 4할 3푼이었고 삼진이 한 번도 없었다.
/// **틀리면 헛스윙이 나와야 맞히는 게 뜻을 갖는다.**
export const PITCHES = [
  { name: '직구', dur: 0.40, drop: 0.00, bend: 0.00, tilt: 0 },
  { name: '커브', dur: 0.68, drop: 0.70, bend: -0.12, tilt: -8 },
  { name: '체인지업', dur: 0.55, drop: 0.22, bend: 0.07, tilt: -2 },
];

/// 스트라이크 존. 홈 플레이트 위에 떠 있는 네모다.
///
/// 높이를 진짜 자(1.6~3.5피트)로 그리면 3픽셀이 된다. 여기만 크게 부풀린다 —
/// 존이 안 읽히면 「왜 볼이지」를 영영 알 수 없고, 그러면 조준하는 재미가 통째로 없어진다.
export function zone(L) {
  const k = Math.min(1, L.rise / 900);
  return { cx: L.hx, cy: L.hy - 64 * k, w: 92 * k, h: 112 * k };
}
/// 조준점이 존 밖으로 이만큼까지 나간다 (존 반폭의 배수). 여기 끝까지 빼면 몸에 맞는 공이다.
const AIM_OUT = 1.9;
/// 몸쪽으로 이만큼 넘어가면 타자 몸에 맞는다.
const HBP_AT = 1.55;
const AIM_STEP = 2.6;           // 초당 몇 칸 (존 반폭 기준)

// ── 치기 ──────────────────────────────────────────────────────────────────

/// 휘두른 때가 홈을 지나는 순간에서 몇 프레임 어긋났나 — 그 폭으로 결과가 갈린다.
/// 배구에서 배운 것을 그대로 옮겼다: **빗나간 까닭을 안 알려 주면 아무리 해도 운으로 남는다.**
export const BARREL = 3;        // 정타
export const SOLID = 7;         // 안타권
export const CONTACT = 12;      // 여기까지는 맞기는 한다. 넘으면 헛스윙

/// 제일 잘 맞았을 때의 타구 속도 (ft/s). 공기 저항을 안 넣었으므로 진짜 값(150)보다 낮다 —
/// 이 값에서 28도로 뜨면 400피트가 나온다.
const EV_MAX = 152;
/// 담장 앞에서 이만큼은 떠 있어야 넘어간다.
const HR_CLEAR = 6;
const REACT = 0.30;             // 공을 보고 몸이 움직이기까지
const RUN_FIELD = 29;           // 다 달렸을 때의 속도 ft/s
/// 처음 20피트는 이만큼밖에 못 간다. **몸을 일으키고 방향을 잡는 몫**이다.
///
/// 이게 없으면 내야에 구멍이 없다. 등속으로 재면 유격수가 1.0초에 29피트를 가서
/// 2루수와 커버 범위가 겹쳐 버리고, 그러면 땅볼이 전부 아웃이 된다 — 실제로 그렇게
/// 만들어 놓고 재 보니 땅볼 피안타율이 0할이었다. 야구에서 「구멍을 뚫었다」가 되려면
/// 처음 한 걸음이 느려야 한다.
const BURST = 17, BURST_FT = 14;
const runSecs = (d) => REACT + (d <= BURST_FT ? d / BURST : BURST_FT / BURST + (d - BURST_FT) / RUN_FIELD);
const THROW = 115;              // 송구 ft/s
const RELAY_AT = 190;           // 이보다 멀면 중계를 한 번 거친다
const RELAY_TURN = 0.45;        // 중계수가 잡고 돌아서는 데 드는 한 박자
const RELAY = 105;              // 중계 뒤의 두 번째 송구
const TRANSFER = 0.55;          // 잡아서 던지기까지
/// 구르는 공을 주워 담는 몫. 뜬 공을 잡는 것과 달리 한 번 더듬는다.
///
/// 내야와 외야가 다르다. 내야수는 정면으로 굴러오는 공을 마중 나가 글러브에 담고 곧바로
/// 던지지만, 외야수는 등지고 쫓아가 한 번 멈춰 서서 주워야 한다. 이걸 한 값으로 두었더니
/// 내야수가 공을 잡고 0.55초를 서 있게 되어 **병살이 영영 안 됐다.**
const PICKUP = 0.55, PICKUP_IN = 0.18;
/// 루를 밟고 곧바로 던지는 몫. 잡아서 던지는 보통 송구(TRANSFER 0.55)보다 짧다 —
/// 이미 공을 기다리고 있었고 발만 떼면 되기 때문이다. **여기에 TRANSFER 를 또 얹으면
/// 병살이 0.01초 차이로 늘 실패한다.** 실제로 그렇게 만들어 놓고 800번 굴려 봤더니
/// 병살이 한 번도 안 났다.
const PIVOT = 0.35;
const TO_FIRST = 4.25;          // 타자가 1루까지 (선 자리에서 출발)
/// 친 뒤 타석을 뜨기까지. 배트가 도는 시간과 같다 — 그동안은 타석에 서 있는 그림이 남는다.
const LEAVE = 0.3;
const FROM_BASE = 3.90;         // 루에 선 주자가 다음 루까지
const NEXT_BASE = 3.15;         // 이미 달리고 있는 주자가 한 루 더
const TAG_UP = 3.20;            // 뜬공을 잡은 뒤 3루 주자가 홈까지
/// 굴러가는 공이 줄어드는 정도 (ft/s²). 땅볼은 흙 위에서 튀며 빨리 죽고,
/// 떨어진 뜬 공은 잔디 위를 멀리 굴러간다 — 그 차이가 1루타와 2루타를 가른다.
const ROLL_DIRT = 27, ROLL_GRASS = 13;

const INNINGS = 3;              // 정규 이닝
const LAST_INNING = 9;          // 연장은 여기까지. 그래도 동점이면 무승부

// ── 살림살이 ──────────────────────────────────────────────────────────────

/// 사람 하나를 그리기 위한 최소한. 졸라맨은 x·groundY·air 만 있으면 그려진다.
function puppet(x, y, more = {}) {
  return {
    x, groundY: y, air: 0, vx: 0, vy: 0, facing: 1, walk: 0, crouch: 0,
    dead: false, deadFor: 0, danger: false, grabbing: -1, heldBy: -1, grabAim: 0,
    slide: 0, swing: 0, toss: 0, block: 0, ...more,
  };
}

/// 지금 공격하는 편. 초(0)에는 원정(1)이, 말(1)에는 홈(0)이 친다 — 진짜 야구 그대로다.
export const batSide = (b) => (b.half === 0 ? 1 : 0);
export const fieldSide = (b) => (b.half === 0 ? 0 : 1);

/// 이 판에서 내가 던지는 쪽인가 / 치는 쪽인가.
///
/// 편을 안 골랐으면 홈(0)으로 친다. 구경하는 사람(waiting)은 어느 쪽도 아니다.
export function amPitching(world) {
  if (world.mp.waiting) return false;
  return (world.team ?? 0) === fieldSide(world.bag);
}
export function amBatting(world) {
  if (world.mp.waiting) return false;
  return (world.team ?? 0) === batSide(world.bag);
}

/// 그 편에 사람이 있나. 없으면 컴퓨터가 대신한다 — 혼자서도 끝까지 할 수 있어야 한다.
function humanOn(world, side) {
  const rows = [];
  if (!world.mp.waiting && (world.team ?? 0) === side) {
    rows.push({ id: world.mp.myId, mine: true, name: world.mp.on ? world.mp.myName : null });
  }
  for (const o of world.mp.others.values()) {
    if (o.dead || o.waiting) continue;
    if ((world.bag.sides?.get(o.id) ?? 0) === side) rows.push({ id: o.id, mine: false, name: o.name, body: o });
  }
  rows.sort((a, c) => a.id - c.id);
  return rows[0] ?? null;
}

/// 누가 어느 편을 골랐나.
///
/// **판 살림살이(bag)가 아니라 방(mp)에 얹는다.** bag 은 판이 다시 열릴 때 통째로 새로 만들어진다
/// (`world.js` 의 restart 가 begin 보다 **먼저** 갈아 끼운다). bag 에 두었더니 판마다 고른 편이
/// 지워져서, 한 편에 셋이 모여 있어도 다음 판에 번호 순으로 반씩 쪼개졌다.
const picks = (world) => (world.mp.ballSides ??= new Map());

/// 편 명단. 방장이 모아 뿌린다 (배구와 같은 방식).
function rosterSides(world) {
  const sides = new Map();
  const picked = picks(world);
  const ids = [world.mp.myId, ...world.mp.others.keys()].sort((a, c) => a - c);
  ids.forEach((id, i) => {
    const own = id === world.mp.myId ? world.team : picked.get(id);
    sides.set(id, own === undefined ? i % 2 : (own ? 1 : 0));
  });
  return sides;
}

// ── 타구 만들기 ───────────────────────────────────────────────────────────

const rnd = () => Math.random();
/// 가운데가 두툼한 흔들림 — 표준편차 1 쯤. 제구가 흔들리는 모양은 네모가 아니라 이것이다.
const gauss = () => (rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) * Math.SQRT2;
const spread = (amp) => (Math.random() - Math.random()) * amp;   // 가운데가 두툼한 흩뿌림

/// 친 순간 세 값이 나온다 — **타구 속도 · 발사각 · 방향.** 나머지는 전부 이 셋에서 나온다.
///
/// 진짜 야구를 재는 방식 그대로다. 이 셋만 있으면 어디에 떨어질지도, 얼마나 떠 있을지도,
/// 잡을 수 있는지도 다 계산으로 나온다 — 「이 경우엔 2루타」 같은 표를 만들 필요가 없다.
export function contact(err, up, down, pitch) {
  const acc = Math.abs(err);
  if (acc > CONTACT) return null;                         // 헛스윙
  const grade = acc <= BARREL ? 2 : acc <= SOLID ? 1 : 0;
  // 타이밍이 정확할수록 빠르다. **계단이 아니라 비탈이다** — 세 칸으로 끊으면 3프레임과
  // 4프레임이 전혀 다른 공이 되고, 그러면 1프레임 차이가 안 느껴진다.
  const power = 1 - (acc / CONTACT) ** 1.5 * 0.52;
  const ev = EV_MAX * power * (0.88 + rnd() * 0.15);

  // 발사각. ⌥↑ 면 올라가고 ⌥↓ 면 눌린다. 떨어지는 공(커브)은 위를 치게 되어 저절로 땅볼이 된다.
  //
  // 흩뿌림이 넓다. 정타라도 각까지 고르지는 못하는 게 야구다 — 제일 잘 맞은 공이
  // 땅볼이 되기도 하고, 빗맞은 공이 담장을 넘기도 한다. 그 어긋남이 이 경기를 만든다.
  const ang = (up ? 26 : down ? -8 : 11) + pitch.tilt
            + (grade === 2 ? spread(24) : grade === 1 ? spread(36) : spread(46));

  // 방향. 조준이 아니라 **때**가 정한다 — 빠르면 당겨지고 늦으면 밀린다.
  // 많이 어긋날수록 더 옆으로 쏠려서, 끝에서는 파울선을 넘는다.
  // 많이 어긋날수록 **더 가파르게** 쏠린다. 이게 완만하면 파울이 거의 안 나오고,
  // 파울이 없으면 타석이 두세 개 공에 끝나 버려 「버티기」가 사라진다.
  const over = Math.max(0, acc - 6);
  const deg = err * 3.6 + Math.sign(err) * over * over * 0.75 + spread(6);
  // **뒤로 걷어 내는 파울.** 각도만으로 가르면 파울이 5%밖에 안 나오고, 그러면 타석이
  // 공 두세 개에 끝난다 — 볼넷이 아예 안 나오고 삼진도 거의 안 나온다. 실제 야구에서
  // 파울은 투구의 17%다. 빗맞을수록 뒤로 가기 쉽다.
  const tipped = rnd() < (acc / CONTACT) ** 2 * 0.55;
  return { grade, ev, ang, deg: clamp(deg, -72, 72), tipped };
}

/// 뜬 공의 길. **공기 저항을 넣어 한 걸음씩 굴린다.**
///
/// 포물선으로 두면 안 된다. 저항이 없으면 같은 거리를 가는 공이 훨씬 짧게 떠 있고,
/// 그러면 외야수가 도무지 쫓아갈 수가 없어서 **뜬 공이 전부 안타가 된다.** 실제로
/// 그렇게 만들어 놓고 재 보니 피안타율이 4할 7푼이었다. 저항은 장식이 아니라 규칙이다.
///
/// 덤으로 그림도 맞는다 — 진짜 뜬 공은 올라갈 때보다 내려올 때가 가파르다.
/// 저항 계수(ft⁻¹)와 **떠받쳐진 중력.**
///
/// 중력을 26.8 로 낮춰 잡은 것은 실수가 아니다. 진짜 타구는 백스핀이 걸려 있어서
/// 공기가 공을 떠받친다 — 그 몫을 따로 셈하는 대신 중력에서 뺐다. 이 두 값은 스탯캐스트가
/// 실제로 잰 타구(100마일 28도 → 400피트·4.9초 같은 것) 일곱 가지에 맞춰 뽑았고,
/// 거리도 체공 시간도 10% 안쪽으로 맞는다. **체공 시간이 맞아야 수비가 맞는다.**
const DRAG = 0.00215;
const G_FLY = 26.8;
const START_Z = 2.9;            // 배트에 맞는 높이
const STEP = 0.02;

export function flightOf(ev, ang) {
  const r = ang * RAD;
  let vh = ev * Math.cos(r);
  let vz = ev * Math.sin(r);
  let ft = 0, z = START_Z, t = 0;
  // 길을 성기게 남겨 둔다 — 그리기도 수비 계산도 이 몇 점을 이어 쓴다.
  const pts = [[0, 0, START_Z]];
  let mark = 0;
  while (z > 0 && t < 9) {
    const v = Math.hypot(vh, vz);
    vh -= DRAG * v * vh * STEP;
    vz -= (DRAG * v * vz + G_FLY) * STEP;
    ft += vh * STEP;
    z += vz * STEP;
    t += STEP;
    if (t >= mark + 0.15) { mark = t; pts.push([r2(t), r2(ft), r2(z)]); }
  }
  // 마지막은 땅에 닿는 순간으로 맞춘다.
  const hang = Math.max(0, t);
  pts.push([r2(hang), r2(ft), 0]);
  return { hang, range: Math.max(0, ft), vh: ev * Math.cos(r), vz: ev * Math.sin(r), pts };
}
const r2 = (v) => Math.round(v * 100) / 100;

/// 남겨 둔 길 위에서 t 초일 때의 [거리, 높이].
export function alongPts(pts, t) {
  if (!pts?.length) return [0, 0];
  if (t <= pts[0][0]) return [pts[0][1], pts[0][2]];
  for (let i = 1; i < pts.length; i++) {
    if (t > pts[i][0]) continue;
    const a = pts[i - 1], c = pts[i];
    const k = (t - a[0]) / Math.max(1e-6, c[0] - a[0]);
    return [lerp(a[1], c[1], k), lerp(a[2], c[2], k)];
  }
  const last = pts[pts.length - 1];
  return [last[1], last[2]];
}
/// 굴러가는 공.
function rollFt(v0, t, drag) {
  const stop = v0 / drag;
  const k = Math.min(t, stop);
  return v0 * k - 0.5 * drag * k * k;
}
const rollStop = (v0, drag) => v0 * v0 / (2 * drag);

/// 송구에 걸리는 시간.
///
/// 190피트를 넘으면 한 번 중계한다. **중계는 거리만 늘리는 게 아니라 한 박자를 통째로
/// 먹는다** — 잡고, 돌아서고, 다시 던진다. 외야 깊은 곳에서 2루까지가 3초를 넘는 건
/// 공이 느려서가 아니라 이 한 박자 때문이고, 2루타는 거기서 나온다.
function throwTime(fromDeg, fromFt, toBase) {
  const [bd, bf] = BASES[toBase % 4];
  const d = ftDist(fromDeg, fromFt, bd, bf);
  // 멀리서 던지는 사람은 **한 발 뛰어 붙였다가** 던진다 (크로우 홉). 그 한 발이 0.35초다.
  const hop = d > 120 ? 0.35 : 0;
  if (d <= RELAY_AT) return TRANSFER + hop + d / THROW;
  return TRANSFER + hop + RELAY_AT / THROW + RELAY_TURN + (d - RELAY_AT) / RELAY;
}

/// **닿을 수 있나.** 공이 지나는 길 위에서 수비수가 가장 여유 있는 때를 찾는다.
///
/// 두 값을 같이 돌려준다. 하나는 **언제 잡나**(여유가 0 이 되는 제일 이른 때 — 수비수는
/// 공을 마중 나간다), 다른 하나는 **얼마나 쉬웠나**(길 전체에서 가장 큰 여유). 둘을 나눠야
/// 「제자리에 온 느린 땅볼」과 「전력으로 쫓아간 빠른 땅볼」이 갈린다 — 잡는 때는 비슷해도
/// 하나는 거저 잡고 하나는 놓친다.
function chase(deg, path, t0, t1, only) {
  let best = null;
  POSTS.forEach((post, i) => {
    if (only && !only.includes(i)) return;
    let ease = -99, meet = null;
    for (let t = t0; t <= t1 + 1e-9; t += 0.05) {
      const ft = path(t);
      const need = runSecs(ftDist(post.deg, post.ft, deg, ft));
      const slack = t - need;
      if (slack > ease) ease = slack;
      if (meet === null && slack >= 0) meet = { t, ft };
    }
    if (meet === null) return;
    // **제일 먼저 닿는 사람이 잡는다.** 여유가 제일 큰 사람이 아니다 —
    // 그렇게 골랐더니 내야 땅볼을 중견수가 주우러 갔고, 그동안 타자가 1루에 닿아서
    // 굴러가는 공이 죄다 안타가 되었다. 여유는 「누가」가 아니라 「잡을까 놓칠까」에만 쓴다.
    // 같은 때에 닿는 사람이 둘이면(뜬 공은 낙하점 한 점이라 늘 그렇다) 여유가 큰 쪽이 간다.
    const sooner = !best || meet.t < best.t - 1e-6;
    const easier = best && Math.abs(meet.t - best.t) <= 1e-6 && ease > best.ease;
    if (sooner || easier) best = { i, ease, t: meet.t, ft: meet.ft };
  });
  return best;
}

/// **잡느냐.** 얼마나 여유 있게 닿았느냐로 갈린다. 강한 직선타는 한 단계 더 어렵다.
export function catchOdds(ease, hard) {
  const base = ease > 0.5 ? 0.97 : ease > 0.25 ? 0.88 : ease > 0.10 ? 0.68 : 0.40;
  return clamp(hard ? base - 0.17 : base, 0.3, 0.98);
}

// ── 판정 ──────────────────────────────────────────────────────────────────

/// 주자 한 명이 어디까지 갈 수 있나.
///
/// 표를 미리 만들어 두지 않는다. **주자가 다음 루까지 가는 시간**과 **수비가 공을 잡아
/// 거기로 던지는 시간**을 재서 그때그때 갈린다. 그래서 같은 안타가 없다.
function runTo(from, ballAt, ballDeg, ballFt, most, first) {
  // 수비가 「던질까 말까」 망설이는 몫. 공이 멀수록 중계를 한 번 더 거치고, 그만큼 늦는다.
  // 담장까지 굴러간 공에 주자가 2루를 밟는 건 발이 빨라서가 아니라 이 망설임 때문이다.
  const lag = 0.35 + ballFt / 240;
  let at = from;
  for (let step = 1; step <= 4; step++) {
    const want = from + step;
    if (want > most) break;
    const arrive = (first ? TO_FIRST : FROM_BASE) + (step - 1) * NEXT_BASE;
    if (arrive >= ballAt + throwTime(ballDeg, ballFt, want % 4) + lag) break;
    at = want;
  }
  return at;
}

/// 밀어내기가 걸린 주자들. 타자가 1루로 가면 1루 주자가 밀리고, 1루가 차 있으면 2루 주자가 밀린다.
function forcedList(onBase) {
  const out = [0];                                       // 타자는 늘 1루로 밀린다
  if (onBase[0]) out.push(1);
  if (onBase[0] && onBase[1]) out.push(2);
  if (onBase[0] && onBase[1] && onBase[2]) out.push(3);
  return out;
}

/// 수비 번호로 적은 기록. 6-4-3 · E5 · F8 처럼.
const noOf = (i) => POSTS[i].no;

// ── 대본 만들기 ───────────────────────────────────────────────────────────
//
// 친 순간 결말을 통째로 정한다. 여기서 나온 대본(play)은 **더 이상 안 바뀐다** —
// 손님에게 한 번만 보내면 되고, 화면은 그 대본을 연기하기만 한다.

function play0(kind) {
  return { kind, t: 0, over: 2.4, hops: [], men: [], runs: [], calls: [],
           outs: 0, runs2: 0, onBase: [null, null, null], record: '', label: '',
           strike: false, ball: false, foul: false, done: false };
}

/// 파울. 공은 그냥 관중석으로 날아가고 판정만 남는다.
function foulPlay(hit) {
  const p = play0('foul');
  const f = flightOf(hit.ev, Math.max(6, hit.ang));
  p.hops.push({ k: 'fly', t0: 0, t1: Math.min(2.2, f.hang || 1.2), deg: hit.deg, pts: f.pts });
  p.over = Math.min(2.2, (f.hang || 1.2) + 0.5);
  p.calls.push({ t: 0.2, text: '파울', big: false });
  p.foul = true;
  p.label = '파울';
  p.record = 'F';
  return p;
}

/// 담장을 넘겼다.
function homerPlay(hit, onBase) {
  const p = play0('homer');
  const f = flightOf(hit.ev, hit.ang);
  p.hops.push({ k: 'fly', t0: 0, t1: f.hang, deg: hit.deg, pts: f.pts });
  // 주자가 다 들어온다. 한 바퀴 도는 데 걸리는 시간만 그림에 쓴다.
  const runners = [];
  for (let i = 2; i >= 0; i--) if (onBase[i]) runners.push({ from: i + 1 });
  runners.push({ from: 0 });
  runners.forEach((r, i) => {
    p.runs.push({ from: r.from, to: 4, t0: 0.1 + i * 0.05, t1: f.hang + 1.2, out: false });
  });
  p.runs2 = runners.length;
  p.onBase = [null, null, null];
  p.calls.push({ t: Math.max(0.6, f.hang * 0.75), text: '홈런!', big: true });
  p.label = `홈런 (${runners.length}점)`;
  p.record = 'HR';
  p.over = f.hang + 2.0;
  return p;
}

/// 친 공이 그라운드 안에 떨어졌다. 여기서부터가 이 게임의 속살이다.
///
/// 규칙은 **하나**다. 「공이 그 루에 먼저 닿나, 주자가 먼저 닿나.」 내야 땅볼도, 외야에
/// 빠진 안타도, 병살도 전부 이 한 줄에서 나온다. 「이 경우엔 2루타」 같은 표를 만들면
/// 경우가 하나 늘 때마다 표를 고쳐야 하고, 고치다 보면 반드시 앞뒤가 어긋난다.
function inPlay(hit, state) {
  const { onBase, outs } = state;
  const f = flightOf(hit.ev, hit.ang);
  const grounder = hit.ang <= 2 || f.range < 26;
  const wall = fenceFt(hit.deg);

  // ① 공의 길. 뜬 공은 떨어질 때까지 날고 그 뒤로 구른다. 담장에 맞으면 거기서 떨어진다.
  let land = grounder ? 0 : f.range;
  let hang = grounder ? 0 : f.hang;
  // 굴러가는 공은 방망이에 맞은 속도 그대로 안 간다 — 한 번 튀는 데서 크게 죽는다.
  const drag = grounder ? ROLL_DIRT : ROLL_GRASS;
  let rollV = grounder
    ? Math.max(20, hit.ev * Math.cos(clamp(hit.ang, -16, 0) * RAD) * 0.78)
    // 떨어진 공은 **잔디 위를 멀리 굴러간다.** 이게 짧으면 2루타가 아예 안 나온다 —
    // 외야수가 공을 등지고 쫓아가는 그 몇 초가 곧 한 루다.
    : Math.max(8, f.vh * 0.55);
  let offWall = false;
  if (!grounder && land >= wall) {                 // 담장을 맞고 떨어진다 (넘어간 공은 여기 안 온다)
    land = wall - 5;
    hang = land / Math.max(1, f.vh);
    rollV = 14;
    offWall = true;
  }
  const kind = grounder ? 'grounder' : offWall ? 'wall'
    : hit.ang > 42 ? 'popup' : f.hang < 1.45 ? 'liner' : 'fly';
  const p = play0(kind);
  const path = (t) => (t < hang ? alongPts(f.pts, t)[0]
    : Math.min(wall - 2, land + rollFt(rollV, t - hang, drag)));

  // ② **닿나.** 뜬 공은 떨어지는 한 점에서만 잡을 수 있다. 담장 맞은 공은 못 잡는다.
  const hard = kind === 'liner' && hit.ev > 96;
  const air = !grounder && !offWall && hang > 0.35 ? chase(hit.deg, () => land, hang, hang) : null;
  const reachable = air && air.ease >= 0;
  const caught = reachable && rnd() < catchOdds(air.ease, hard);
  const fumble = reachable && !caught;
  // **놓쳤다고 다 실책은 아니다.** 전력으로 쫓아가 겨우 뻗은 손에서 빠진 공은 기록지에
  // 안타로 적힌다. 편하게 서서 받다 흘린 것만 E 다 — 진짜 기록원이 가르는 법 그대로다.
  const blamed = fumble && air.ease > 0.45;

  // ③ 공을 손에 넣는 때와 자리.
  let who, ballAt, ballFt, ease = null;
  if (caught || fumble) {
    who = air.i; ballFt = land; ease = air.ease;
    // 놓치면 주워 담는 데 시간이 든다 — 이 한 박자가 「잡았다가 놓쳤다」를 안타로 만든다.
    ballAt = hang + (fumble ? 0.95 : 0);
  } else {
    const stopFt = Math.min(wall - 2, land + rollStop(rollV, drag));
    const tEnd = Math.max(hang + 0.1, rollTimeTo(rollV, stopFt, land, hang, drag) ?? hang + 3.4);
    const got = chase(hit.deg, path, Math.max(0.25, hang), Math.min(tEnd, 7));
    if (got) {
      who = got.i; ballFt = got.ft; ease = got.ease;
      ballAt = got.t + (got.ft > INFIELD_FT ? PICKUP : PICKUP_IN);
    }
    else {
      let near = 0, bestD = 1e9;
      POSTS.forEach((post, i) => {
        const d = ftDist(post.deg, post.ft, hit.deg, stopFt);
        if (d < bestD) { bestD = d; near = i; }
      });
      who = near; ballFt = stopFt;
      ballAt = Math.max(tEnd, runSecs(bestD)) + PICKUP;
    }
  }

  // ④ 잡다 흘렸다. 뜬 공은 위에서 이미 봤으니 굴러온 공만 다시 본다.
  let muff = false;
  if (!caught && !fumble && ease !== null && rnd() > catchOdds(ease, rollV > 108)) {
    muff = ease > 0.45;                            // 편하게 오던 공만 실책으로 적는다
    ballAt += 1.0;
  }

  // ⑤ 공을 따라가는 수비수 그림.
  p.men.push({ i: who, t0: REACT, t1: Math.max(REACT + 0.1, ballAt), deg: hit.deg, ft: ballFt });
  p.hops.push(...ballTrack(hit.deg, f, hang, land, rollV, drag, ballAt, ballFt, caught));

  const base = [...onBase];
  let made = 0, scored = 0;

  // ⑥ 잡았다 — 타자는 아웃, 주자는 태그업.
  if (caught) {
    made = 1;
    const word = kind === 'popup' ? '내야 뜬공' : hard ? '직선타' : '뜬공';
    const mark = kind === 'popup' ? 'P' : hard ? 'L' : 'F';
    p.calls.push({ t: hang + 0.12, text: `${word} 아웃`, big: false });
    p.record = `${mark}${noOf(who)}`;
    p.label = `${POSTS[who].name} ${word}`;
    if (outs + made < 3) {
      for (let i = 2; i >= 0; i--) {
        if (!base[i]) continue;
        const want = i + 2;                       // 3루 주자는 홈(4), 2루 주자는 3루
        const need = TAG_UP + (2 - i) * 0.25;     // 뒤쪽 주자일수록 조심스럽다
        if (need >= throwTime(hit.deg, ballFt, want % 4) - 0.05) continue;
        const t1 = hang + need;
        if (want >= 4) { scored++; base[2] = null; p.runs.push({ from: 3, to: 4, t0: hang, t1, out: false }); p.label += ' — 희생플라이'; p.record = `SF${noOf(who)}`; }
        else { base[want - 1] = base[i]; base[i] = null; p.runs.push({ from: i + 1, to: want, t0: hang, t1, out: false }); }
      }
    }
    p.over = hang + 1.6;
    p.outs = made; p.runs2 = scored; p.onBase = base;
    return p;
  }

  // ⑦ 안 잡혔다. **공이 그 루에 먼저 닿나, 주자가 먼저 닿나.**
  const forced = forcedList(onBase);
  const lead = forced[forced.length - 1];           // 제일 앞선 밀어내기 (0 이면 타자뿐)
  const leadBase = lead === 0 ? 1 : lead + 1;
  const leadT = ballAt + throwTime(hit.deg, ballFt, leadBase % 4);
  const leadRun = lead === 0 ? TO_FIRST : FROM_BASE;
  const firstT = ballAt + throwTime(hit.deg, ballFt, 1);
  const gotLead = leadT < leadRun - 0.05;
  const gotFirst = firstT < TO_FIRST - 0.05;

  if (muff && !gotFirst) {
    // 흘린 공. 안타가 아니라 기록지에 E 로 남는다.
    p.record = `E${noOf(who)}`;
    p.label = `${POSTS[who].name} 실책`;
    p.calls.push({ t: Math.max(0.6, ballAt - 0.6), text: '놓쳤다 — 실책', big: false });
  } else if (blamed) {
    p.record = `E${noOf(who)}`;
    p.label = `${POSTS[who].name} 실책`;
    p.calls.push({ t: hang + 0.12, text: '잡았다가 놓쳤다!', big: false });
  } else if (fumble) {
    p.calls.push({ t: hang + 0.12, text: '글러브에 맞고 빠졌다!', big: false });
  }

  if (gotLead && lead > 0) {
    // 밀어내기 — 제일 앞선 주자를 그 루에서 잡는다. 이어서 1루로 던지면 병살이다.
    //
    // **판을 통째로 다시 세운다.** 처음엔 아웃된 사람만 지우고 타자를 1루에 얹었는데,
    // 주자를 true/false 로만 들고 있어서 **1루에 이미 서 있던 사람 위에 타자를 덮어썼다.**
    // 1·2루에서 3루 봉살이 나면 사람이 하나 사라졌다. 밀린 사람은 한 루씩 옮겨 놓고,
    // 타자는 그 뒤에 1루에 세운다.
    made = 1;
    // 잡은 사람이 그 루를 지키는 사람이면 번호를 한 번만 적는다 (3루수가 3루를 밟는 5-5 대신 5).
    const guard = baseGuard(leadBase % 4);
    const chain = guard === who ? [noOf(who)] : [noOf(who), noOf(guard)];
    const where = leadBase >= 4 ? '홈' : `${leadBase}루`;
    p.calls.push({ t: leadT, text: '아웃', big: false });
    p.runs.push({ from: lead, to: leadBase, t0: 0.05, t1: leadRun, out: true, outAt: leadT });

    base[0] = null; base[1] = null; base[2] = null;
    for (let b2 = lead - 1; b2 >= 1; b2--) {           // 아웃된 사람 뒤의 밀린 주자들
      if (!onBase[b2 - 1]) continue;
      base[b2] = true;
      p.runs.push({ from: b2, to: b2 + 1, t0: 0.05, t1: FROM_BASE, out: false });
    }
    for (let i = 2; i >= 0; i--) {                     // 밀어내기에 안 걸린 앞 주자는 제자리
      if (onBase[i] && i + 1 > lead) base[i] = true;
    }

    const pivot = BASES[leadBase % 4];
    const firstBase = BASES[1];
    const dpT = leadT + PIVOT + ftDist(pivot[0], pivot[1], firstBase[0], firstBase[1]) / THROW;
    if (outs + made < 3 && dpT < TO_FIRST - 0.05) {
      made = 2;
      chain.push(noOf(2));
      p.calls.push({ t: dpT, text: '병살!', big: true });
      p.runs.push({ from: 0, to: 1, t0: LEAVE, t1: TO_FIRST, out: true, outAt: dpT });
      p.label = '병살타';
    } else {
      base[0] = true;
      p.runs.push({ from: 0, to: 1, t0: LEAVE, t1: TO_FIRST, out: false });
      p.label = `${where} 봉살`;
    }
    p.record = chain.join('-');
    scored += freeThird(base, onBase, p, lead, hit.deg, ballFt, ballAt);
    p.over = Math.max(leadT, TO_FIRST) + 1.2;
  } else if (gotFirst) {
    // 1루에서 타자를 잡았다 — 흔한 땅볼 아웃.
    made = 1;
    p.calls.push({ t: firstT, text: '아웃', big: false });
    p.runs.push({ from: 0, to: 1, t0: LEAVE, t1: TO_FIRST, out: true, outAt: firstT });
    p.record = `${noOf(who)}-${noOf(2)}`;
    p.label = `${POSTS[who].name} ${grounder ? '땅볼' : '뜬공 처리'}`;
    advanceFree(base, p, hit.deg, ballFt, ballAt);
    scored += p.freeRuns ?? 0;
    p.over = Math.max(firstT, TO_FIRST) + 1.2;
  } else {
    // 아무도 못 잡았다 — 안타다. 주자들이 어디까지 가나.
    //
    // **뒷 주자는 앞 주자를 앞지를 수 없다.** 각자 따로 재서 넣었더니 1루 주자가 2루에 서고
    // 2루타를 친 타자도 2루에 서서, 둘 중 하나가 판에서 사라졌다. 앞선 주자부터 자리를
    // 정한 뒤, 뒤에서부터 훑으며 겹치면 앞사람을 한 루 밀어낸다 — 밀어내기가 그렇게 생겼다.
    const crew = [];
    for (let i = 2; i >= 0; i--) if (onBase[i]) crew.push({ from: i + 1, at: 0 });
    crew.push({ from: 0, at: 0 });                       // 타자는 맨 뒤
    for (const r of crew) {
      const first = r.from === 0;
      r.at = Math.max(first ? 1 : r.from, runTo(r.from, ballAt, hit.deg, ballFt, first ? 3 : 4, first));
    }
    for (let i = crew.length - 2; i >= 0; i--) {
      crew[i].at = Math.min(4, Math.max(crew[i].at, crew[i + 1].at + 1));
    }
    const to = crew[crew.length - 1].at;
    base[0] = null; base[1] = null; base[2] = null;
    for (const r of crew) {
      const legs = Math.max(1, r.at - r.from);
      const t1 = (r.from === 0 ? TO_FIRST : FROM_BASE) + (legs - 1) * NEXT_BASE;
      p.runs.push({ from: r.from, to: r.at, t0: r.from === 0 ? LEAVE : 0.05, t1, out: false });
      if (r.at >= 4) scored++;
      else base[r.at - 1] = true;
    }
    const word = ['', '1루타', '2루타', '3루타'][to];
    if (!p.record) {
      p.record = `${to}B${noOf(who)}`;
      p.label = ballFt <= 150 ? `내야 안타` : `${POSTS[who].name} 앞 ${word}`;
      p.calls.push({ t: TO_FIRST * 0.85, text: word, big: to >= 2 });
    } else {
      p.calls.push({ t: TO_FIRST * 0.85, text: '세이프', big: false });
    }
    p.over = Math.max(ballAt + 0.9, TO_FIRST + (to - 1) * NEXT_BASE) + 1.1;
  }

  p.outs = made;
  // **3아웃째가 나면 그 플레이의 득점은 없다.** 야구 규칙이다 — 밀어내기 아웃이나 타자가
  // 1루에서 잡히는 것으로 이닝이 끝나면, 그 사이 홈을 밟은 주자도 점수가 안 된다.
  // 이 게임의 아웃은 전부 그 두 종류라 한 줄로 가른다.
  if (outs + made >= 3) {
    // **3아웃째가 나면 그 플레이의 득점은 없다.** 야구 규칙이다 — 밀어내기 아웃이나 타자가
    // 1루에서 잡히는 것으로 이닝이 끝나면, 그 사이 홈을 밟은 주자도 점수가 안 된다.
    // 이 게임의 아웃은 전부 그 두 종류라 한 줄로 가른다.
    //
    // **주자는 그대로 홈을 밟게 둔다.** 진짜 야구가 그렇고, 대신 왜 점수가 안 붙는지를
    // 한 줄 띄운다 — 안 그러면 홈을 밟았는데 기록판이 안 움직이는 것으로만 보인다.
    const crossing = p.runs.some((r) => !r.out && r.to >= 4);
    p.runs2 = 0;
    if (crossing) {
      const at = Math.max(...p.runs.filter((r) => r.out).map((r) => r.outAt ?? r.t1), 0.4);
      p.calls.push({ t: at + 0.25, text: '3아웃 — 득점 없음', big: false });
      p.over = Math.max(p.over, at + 1.6);
    }
  } else {
    p.runs2 = scored;
  }
  p.onBase = base;
  return p;
}

/// 밀어내기에 안 걸린 3루 주자. 밀어내기는 타자부터 줄줄이 이어지므로, 아웃된 사람보다
/// 앞에 남는 주자는 3루뿐이다 (1루에 주자가 있고 2루가 비었을 때). 그 사람만 홈을 노린다.
function freeThird(base, onBase, p, lead, deg, ft, ballAt) {
  if (!onBase[2] || lead >= 3) return 0;
  if (FROM_BASE >= ballAt + throwTime(deg, ft, 0) - 0.1) return 0;
  base[2] = null;
  p.runs.push({ from: 3, to: 4, t0: 0.05, t1: FROM_BASE, out: false });
  return 1;
}

/// 아웃이 나는 사이 남은 주자들이 한 루씩 간다. `skip` 은 방금 아웃된 주자다.
///
/// 3루 주자는 공이 홈에 닿기 전에 들어올 수 있으면 들어온다 — 그 한 점이 야구에서
/// 「땅볼로 점수를 냈다」가 되는 자리다.
function advanceFree(base, p, deg, ft, ballAt) {
  let runs = 0;
  for (let i = 2; i >= 0; i--) {
    if (!base[i]) continue;
    if (i === 2) {
      if (FROM_BASE >= ballAt + throwTime(deg, ft, 0) - 0.1) continue;
      base[2] = null; runs++;
      p.runs.push({ from: 3, to: 4, t0: 0.05, t1: FROM_BASE, out: false });
    } else if (!base[i + 1]) {
      base[i + 1] = base[i]; base[i] = null;
      p.runs.push({ from: i + 1, to: i + 2, t0: 0.05, t1: FROM_BASE, out: false });
    }
  }
  p.freeRuns = runs;
}

/// 굴러가는 공이 그 거리에 닿는 때. 못 닿으면 null.
function rollTimeTo(v0, want, from, hang, drag) {
  if (want <= from) return hang;
  if (rollStop(v0, drag) + from < want) return null;
  // v0 t - ½ a t² = d
  const d = want - from;
  const disc = v0 * v0 - 2 * drag * d;
  if (disc < 0) return null;
  return hang + (v0 - Math.sqrt(disc)) / drag;
}

/// 그 루를 지키는 수비수. 송구가 날아가 닿는 사람이다.
function baseGuard(base) {
  return base === 1 ? 2 : base === 2 ? 3 : base === 3 ? 4 : CATCHER;
}

/// 공이 지나온 길을 그림 구간으로 옮긴다.
function ballTrack(deg, f, hang, land, rollV, drag, ballAt, ballFt, caught) {
  const hops = [];
  if (hang > 0) hops.push({ k: 'fly', t0: 0, t1: hang, deg, pts: f.pts });
  if (caught) { hops.push({ k: 'rest', t0: hang, t1: 99, deg, ft: land, z: 3.4 }); return hops; }
  const from = hang > 0 ? land : 0;
  hops.push({ k: 'roll', t0: hang, t1: Math.max(hang + 0.05, ballAt), deg, ft0: from, v: rollV, g: drag });
  hops.push({ k: 'rest', t0: ballAt, t1: 99, deg, ft: ballFt, z: 2.6 });
  return hops;
}

/// 대본 위에서 공이 지금 어디 있나 — [각도, 거리, 높이(피트)].
export function ballAt(play, t) {
  let last = [0, 0, 2];
  for (const h of play.hops) {
    if (t < h.t0) break;
    const u = Math.min(t, h.t1) - h.t0;
    if (h.k === 'fly') { const [ft, z] = alongPts(h.pts, u); last = [h.deg, ft, z]; }
    else if (h.k === 'roll') last = [h.deg, h.ft0 + rollFt(h.v, u, h.g ?? ROLL_DIRT), 0.6];
    else if (h.k === 'rest') last = [h.deg, h.ft, h.z];
  }
  return last;
}

// ── 게임 ──────────────────────────────────────────────────────────────────

function freshBag() {
  return {
    inn: 1, half: 0, outs: 0, balls: 0, strikes: 0,
    score: [0, 0], onBase: [null, null, null],
    log: [],                          // 한 타석마다 한 줄
    aim: { x: 0, y: 0 }, type: 0,
    pitch: null, play: null, seq: 0, seen: -1,
    wait: 1.6, call: null, note: null,
    started: false, over: false, winner: null,
    sides: new Map(),
    // 컴퓨터가 대신할 때 미리 정해 두는 것.
    ai: null, aiSwing: null,
    // 손님에게 한 번만 보낼 대본.
    fresh: null,
  };
}

/// 이번 타석을 끝내고 다음 타자를 세운다.
function nextBatter(world, b, line) {
  b.log.push(line);
  if (b.log.length > 40) b.log.shift();
  b.balls = 0; b.strikes = 0;
  b.pitch = null; b.play = null;
  b.wait = 1.5;
  b.ai = null; b.aiSwing = null;
  if (b.outs >= 3) halfOver(world, b);
  else checkWalkOff(world, b);
}

/// 공수 교대.
function halfOver(world, b) {
  b.halfRuns = 0;
  b.outs = 0;
  b.onBase = [null, null, null];
  // 마지막 회 초가 끝났는데 홈이 앞서면 말은 안 한다 — 진짜 야구 규칙이다.
  const last = b.inn >= INNINGS;
  if (b.half === 0 && last && b.score[0] > b.score[1]) { finish(world, b); return; }
  if (b.half === 0) { b.half = 1; b.note = `${b.inn}회 말`; return; }
  b.half = 0;
  b.inn++;
  if (b.inn > INNINGS && b.score[0] !== b.score[1]) { finish(world, b); return; }
  if (b.inn > LAST_INNING) { finish(world, b); return; }
  b.note = b.inn > INNINGS ? `연장 ${b.inn}회 초` : `${b.inn}회 초`;
}

/// 끝내기. 마지막 회 말에 홈이 역전하면 그 자리에서 끝난다.
function checkWalkOff(world, b) {
  if (b.half !== 1 || b.inn < INNINGS) return;
  if (b.score[0] > b.score[1]) finish(world, b);
}

function finish(world, b) {
  if (b.over) return;
  b.over = true;
  const home = b.score[0], away = b.score[1];
  b.winner = home === away ? null : home > away ? 0 : 1;
  b.note = home === away ? '무승부' : `${TEAM_NAME[b.winner]} 승 ${Math.max(home, away)}:${Math.min(home, away)}`;
  world.onGameOver?.({
    name: b.winner === null ? null : `${TEAM_NAME[b.winner]} 편`,
    side: b.winner ?? 0, rows: [],
  });
}

/// 한 점 넣는다.
function addRun(b, n) {
  if (!n) return;
  b.score[batSide(b)] += n;
  b.halfRuns = (b.halfRuns ?? 0) + n;
}

/// 스트라이크 하나.
function strike(world, b, why) {
  b.strikes++;
  if (b.strikes >= 3) {
    b.outs++;
    say(b, '삼진!', true);
    nextBatter(world, b, { r: 'K', t: '삼진' });
  } else {
    say(b, why, false);
    b.wait = 1.0;                    // 공은 포수 미트까지 날아간 뒤에 사라진다 (update 가 치운다)
  }
}
function ballFour(world, b) {
  b.balls++;
  if (b.balls >= 4) {
    say(b, '볼넷', false);
    walkTo(world, b, '볼넷', 'BB');
  } else { say(b, '볼', false); b.wait = 0.9; }
}
/// 볼넷·몸에 맞는 공 — 밀어내기로만 주자가 움직인다.
function walkTo(world, b, word, mark) {
  const base = b.onBase;
  let runs = 0;
  if (base[0] && base[1] && base[2]) { runs = 1; }
  else if (base[0] && base[1]) { base[2] = true; }
  else if (base[0]) { base[1] = true; }
  base[0] = true;
  addRun(b, runs);
  nextBatter(world, b, { r: mark, t: word + (runs ? ' (밀어내기 1점)' : '') });
}

function say(b, text, big) {
  b.call = { text, t: 0, life: big ? 1.4 : 1.0, big };
}

// ── 컴퓨터 ────────────────────────────────────────────────────────────────
//
// 혼자서도 끝까지 할 수 있어야 한다. 사람이 없는 편은 컴퓨터가 맡는다.

/// 컴퓨터 투수가 고르는 공. 카운트를 보고 존 안팎을 가른다.
///
/// **떨어지는 몫을 미리 빼서 겨눈다.** 커브는 존 높이의 0.7배만큼 늦게 지므로, 겨눈 자리
/// 그대로 던지면 늘 낮은 볼이 된다 — 사람은 몇 번 던져 보면 저절로 알지만 컴퓨터는 알려
/// 줘야 한다. 이걸 안 넣었더니 컴퓨터가 던진 커브가 하나도 스트라이크가 안 됐다.
function aiPitch(b) {
  const type = rnd() < 0.48 ? 0 : rnd() < 0.55 ? 1 : 2;
  const behind = b.balls >= 3 || (b.balls === 2 && b.strikes === 0);
  const ahead = b.strikes === 2 && b.balls < 2;
  // 겨눈 자리와 실제로 가는 자리는 다르다. **제구란 이 흔들림의 크기**다.
  // 불리하면 한가운데를 겨누고 조심해서 던지고, 유리하면 일부러 뺀다.
  let tx = 0, ty = 0, wob = 0.62;
  if (behind) { wob = 0.42; }
  else if (ahead && rnd() < 0.62) {
    const a = rnd() * Math.PI * 2;
    tx = Math.cos(a) * 1.30; ty = Math.sin(a) * 1.15; wob = 0.34;
  } else {
    const a = rnd() * Math.PI * 2;
    tx = Math.cos(a) * 0.62; ty = Math.sin(a) * 0.55; wob = 0.72;
  }
  return {
    type,
    x: clamp(tx + gauss() * wob, -AIM_OUT, AIM_OUT),
    y: clamp(ty + gauss() * wob * 0.9 + PITCHES[type].drop, -AIM_OUT, AIM_OUT),
  };
}

/// 타자는 **예상하고** 휘두른다. 공을 다 보고 치는 것이 아니다.
///
/// 이것이 야구의 수싸움이다. 마음속으로 구종 하나를 정해 놓고 그 박자로 나가되, 날아오는
/// 동안 손 모양과 속도를 읽어 얼마간 고쳐 잡는다(READ). 다 고쳐 잡을 수 있으면 예상이
/// 아무 뜻이 없고, 하나도 못 고치면 찍기가 된다.
const READ = 0.28;              // 틀린 예상 중 이만큼은 날아오는 동안 되찾는다
/// 사람 손의 흔들림 (프레임). 이 값이 곧 「얼마나 잘 치나」다.
export function guessErr(guessType, realType, wobble) {
  const off = Math.round(PITCHES[guessType].dur / FR) - Math.round(PITCHES[realType].dur / FR);
  return Math.round(off * (1 - READ) + (rnd() + rnd() + rnd() - 1.5) * wobble);
}

/// 컴퓨터 타자가 이 공에 언제 휘두를까.
function aiSwing(b, pitch, L) {
  const end = pitchEnd(pitch, L);
  const z = zone(L);
  const inZone = Math.abs(end.x - z.cx) < z.w / 2 + 4 && Math.abs(end.y - z.cy) < z.h / 2 + 4;
  const chase = !inZone && rnd() < (b.strikes === 2 ? 0.38 : 0.20);
  if (!inZone && !chase) return null;
  if (inZone && rnd() < 0.30) return null;              // 좋은 공도 그냥 보낸다
  // 직구를 제일 많이 노린다. 두 스트라이크면 변화구까지 생각한다.
  const guess = rnd() < (b.strikes === 2 ? 0.45 : 0.62) ? 0 : rnd() < 0.5 ? 1 : 2;
  const err = guessErr(guess, pitch.type, 10);
  return { err, up: rnd() < 0.26, down: rnd() < 0.2 };
}

// ── 투구 그림 ─────────────────────────────────────────────────────────────

/// 공을 놓는 자리 — 투수의 손끝 언저리.
function release(L) {
  const [px, py] = spot(L, 0, MOUND_FT);
  const s = depth(0, MOUND_FT);
  return { x: px + 17 * s, y: py - 64 * s };
}
/// 이 공이 홈에서 어디로 들어오나 (화면 좌표).
export function pitchEnd(pitch, L) {
  const z = zone(L);
  return { x: z.cx + pitch.ax * z.w / 2, y: z.cy - pitch.ay * z.h / 2 + pitch.kind.drop * z.h * 0.5 };
}
/// 던진 공이 u(0~1) 만큼 왔을 때의 자리와 크기.
export function pitchAt(pitch, L, u) {
  const from = release(L);
  const to = pitchEnd(pitch, L);
  const z = zone(L);
  // 가까워질수록 빨라 보이게 깊이를 조금 당긴다. 등속으로 그리면 멀리서 느리게 오다
  // 갑자기 사라지는 것처럼 보인다.
  const e = u ** 1.28;
  // 커브는 **늦게** 떨어진다. 떨어지는 몫을 u³ 에 실어서, 끝에 가서야 뚝 진다.
  const late = pitch.kind.drop * z.h * 0.5 * (u ** 3 - e);
  const bend = pitch.kind.bend * z.w * 0.5 * (u ** 2.4 - e);
  return {
    x: lerp(from.x, to.x, e) + bend,
    y: lerp(from.y, to.y, e) + late,
    r: lerp(5.5, 13, e),
  };
}

// ── 갱신 ──────────────────────────────────────────────────────────────────

function startPitch(world, b, L, type, ax, ay) {
  const kind = PITCHES[clamp(type | 0, 0, 2)];
  b.pitch = {
    type: clamp(type | 0, 0, 2), kind, ax, ay,
    t: -PITCH_TIME * PITCH_RELEASE,        // 팔이 도는 동안은 아직 손에 있다
    dur: kind.dur, plate: Math.round(kind.dur / FR),
    done: false, wind: PITCH_TIME,
  };
  b.seq++;
  b.aiSwing = undefined;                   // 다음 프레임에 정한다
  b.call = null;
}

/// 심판이 기다려 주는 몫.
///
/// 치는 사람이 손님이면 **그 사람의 스윙이 도착할 때까지 기다려야 한다.** 안 기다리면
/// 손님은 아무리 제때 휘둘러도 늘 「안 휘둘렀다」로 판정된다 — 스윙이 방장에게 닿기 전에
/// 심판이 먼저 외쳐 버리기 때문이다. 왕복 시간을 알면 그만큼, 모르면 넉넉히 기다린다.
/// 혼자 하거나 내가 타자면 기다릴 것이 없다.
function judgeWait(world, b) {
  const man = humanOn(world, batSide(b));
  if (!man || man.mine) return 0.10;
  const rtt = world.mp.others.get(man.id)?.rtt;
  // 왕복 시간을 모르면 넉넉히 잡는다. 회사 와이파이에서 0.3초가 나오는 건 드문 일이 아니고,
  // 짧게 잡으면 그 사람은 아무리 잘 쳐도 판정이 안 난다.
  return 0.12 + clamp(Number.isFinite(rtt) ? rtt : 0.24, 0.06, 0.45);
}

/// 휘둘렀다. frame 은 **공이 날아온 지 몇 프레임째**인가 — 벽시계가 아니다.
///
/// 이게 이 게임에서 제일 중요한 한 줄이다. 치는 사람이 손님이면 스윙이 방장에게
/// 50~80밀리초 늦게 도착한다. 그대로 재면 정타를 칠 수가 없다. 프레임 번호로 보내면
/// **늦게 도착해도 그 사람이 본 화면에서의 때**가 그대로 남는다.
export function swing(world, frame, up, down) {
  const b = world.bag;
  const p = b.pitch;
  if (!p || p.done || b.play) return false;
  p.done = true;
  const L = layout(world);
  const err = frame - p.plate;
  const hit = contact(err, up, down, p.kind);
  b.swungAt = { err, at: world.elapsed };
  if (!hit) {
    // 헛스윙. 왜 빗나갔는지 알려 준다 — 배구의 「늦다/멀다/낮다」와 같은 자리다.
    strike(world, b, err < 0 ? '헛스윙 — 빨랐다' : '헛스윙 — 늦었다');
    return true;
  }
  b.batWord = err === 0 ? '정확' : `${Math.abs(err)}프레임 ${err < 0 ? '빨랐다' : '늦었다'}`;
  launch(world, b, L, hit);
  return true;
}

/// 그 거리에 닿았을 때 공이 얼마나 떠 있나 — 담장을 넘는지 보는 자리.
function heightAt(f, ft) {
  for (let i = 1; i < f.pts.length; i++) {
    if (f.pts[i][1] < ft) continue;
    const a = f.pts[i - 1], c = f.pts[i];
    const k = (ft - a[1]) / Math.max(1e-6, c[1] - a[1]);
    return lerp(a[2], c[2], k);
  }
  return 0;
}

/// 친 공 하나를 끝까지 푼다. **결말을 정하는 자리는 여기 하나뿐이다** —
/// 게임도 시험도 같은 문을 지난다.
export function resolveHit(hit, state) {
  if (hit.tipped || Math.abs(hit.deg) > FOUL_DEG) return foulPlay(hit);
  const f = flightOf(hit.ev, hit.ang);
  const wall = fenceFt(hit.deg);
  // 담장 앞에서 아직 이만큼 떠 있어야 넘어간다.
  const over = f.range >= wall && heightAt(f, wall) > HR_CLEAR;
  return over ? homerPlay(hit, state.onBase) : inPlay(hit, state);
}

/// 맞은 공을 판에 띄운다.
function launch(world, b, L, hit) {
  const p = resolveHit(hit, { onBase: b.onBase, outs: b.outs });
  p.hitWord = b.batWord;
  p.grade = hit.grade;
  p.ev = Math.round(hit.ev);
  p.ang = Math.round(hit.ang);
  b.play = p;
  b.fresh = p;                              // 손님에게 한 번만 보낸다
}

/// 대본이 끝났다 — 결말을 판에 반영한다.
function settle(world, b) {
  const p = b.play;
  b.play = null;
  if (p.foul) {
    // 파울은 스트라이크지만 **두 스트라이크에서는 늘어나지 않는다.** 걷어 내며 버틸 수 있다.
    if (b.strikes < 2) b.strikes++;
    b.pitch = null; b.wait = 1.0;
    return;
  }
  b.outs += p.outs;
  addRun(b, p.runs2);
  b.onBase = p.onBase;
  nextBatter(world, b, { r: p.record, t: p.label + (p.runs2 ? ` · ${p.runs2}점` : '') });
}

// ── 그리기 도우미 ─────────────────────────────────────────────────────────

/// 주자가 t 에 어디쯤 있나 — [각도, 거리].
function runnerAt(r, t) {
  const k = clamp((t - r.t0) / Math.max(0.05, r.t1 - r.t0), 0, 1);
  // **루를 하나씩 밟고 돈다.** 처음 것과 마지막 것을 바로 이으면 1루에서 3루로 가는 주자가
  // 마운드를 가로지르고, 홈런 친 사람은 제자리에 선 채로 있었다 (홈 → 홈이라서).
  const at = r.from + (r.to - r.from) * k;
  const leg = Math.min(Math.floor(at), 3);
  const a = flat(...BASES[leg % 4]);
  const c = flat(...BASES[(leg + 1) % 4]);
  const u = clamp(at - leg, 0, 1);
  return polar(lerp(a[0], c[0], u), lerp(a[1], c[1], u));
}
/// 수비수가 t 에 어디쯤 있나.
function manAt(m, post, t) {
  const k = clamp((t - m.t0) / Math.max(0.05, m.t1 - m.t0), 0, 1);
  const a = flat(post.deg, post.ft);
  const c = flat(m.deg, m.ft);
  return polar(lerp(a[0], c[0], smooth(k)), lerp(a[1], c[1], smooth(k)));
}

/// 사람 하나를 깊이에 맞게 줄여 그린다.
function drawAt(ctx, L, deg, ft, p, time, boil, opts) {
  const [x, y] = spot(L, deg, ft);
  const s = depth(deg, ft);
  p.x = x; p.groundY = y;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.translate(-x, -y);
  drawStickman(ctx, p, time, boil, { ...opts, bat: true });
  ctx.restore();
  return [x, y, s];
}

// ── 게임 하나 ─────────────────────────────────────────────────────────────

export default {
  id: 'ball',
  name: '야구',
  line: '투수와 타자. 던지고 치기만 하면 달리기도 수비도 판이 알아서 한다. 3회, 도루 없음.',
  keys: [
    ['⌥ ← → ↑ ↓', '조준 — 내 화면에만 보인다 (던질 때)'],
    ['⌥ 1 · 2 · 3', '직구 · 커브 · 체인지업'],
    ['⌥ Space', '던진다 / 휘두른다'],
    ['⌥ Space + ↑', '띄워 치기 — 뜬공과 홈런'],
    ['⌥ Space + ↓', '눌러 치기 — 빠른 땅볼'],
  ],
  tally: (world) => `${world.bag?.score?.[0] ?? 0} : ${world.bag?.score?.[1] ?? 0}`,

  /// 몸으로 공을 맞히는 게임이라 서로 붙잡으면 아무것도 안 된다. ⌥Space 는 이 게임이 가져간다.
  noGrab: true,
  teamNames: TEAM_NAME,
  /// 시계도 순위표도 안 띄운다. 야구는 회로 끝나지 시간으로 끝나지 않는다.
  noClock: true,
  noResults: true,
  /// 바닥선을 안 그린다 — 그라운드를 이 게임이 통째로 그린다.
  noGround: true,
  /// 사람도 이 게임이 그린다. 아홉에 주자까지 깊이 순으로 겹쳐 그려야 해서,
  /// 판 밖에서 「남 먼저, 나 나중」으로 그리면 멀리 선 사람이 가까운 사람을 덮는다.
  figure: () => {},
  shirt: (world, x, id) => TEAM_INK[id < 0 ? -1 - id : (world.bag?.sides?.get(id) ?? 0)],

  /// 혼자서도 된다 — 빈 편은 컴퓨터가 맡는다. 그래서 막지 않는다.
  blocked: () => null,

  /// 사람은 제자리에 선다. 달리기는 이 게임에 없다.
  move(world, dt) {
    const p = world.player;
    p.vx = 0; p.vy = 0; p.air = 0; p.knock = 0;
    p.grabbing = -1; p.heldBy = -1;
    p.groundY = world.groundY;
  },

  stand(world, slot) {
    if (world.team === undefined) world.team = slot % 2;
    world.player.x = world.w / 2;
    world.player.vx = 0;
  },

  swap(world, shell, side) {
    world.team = side === undefined ? 1 - (world.team ?? 0) : (side ? 1 : 0);
    picks(world).set(world.mp.myId, world.team);
    if (world.mp.on) (shell?.net?.send ?? world.send)?.({ t: 'gm', s: world.team });
  },

  begin(world) {
    Object.assign(world.bag, freshBag());
  },

  fresh: freshBag,

  /// ⌥1·2·3 — 구종 고르기. 던지는 쪽만.
  emote(world, n) {
    const b = world.bag;
    if (!amPitching(world) || b.pitch || b.play || b.over) return;
    const want = clamp((n | 0) - 1, 0, 2);
    b.type = want;
    if (world.mp.on && world.mp.role !== 'host') world.send?.({ t: 'gm', k: 'type', n: want });
  },

  /// ⌥Space — 던지거나 휘두른다.
  action(world) {
    const b = world.bag;
    if (world.state !== 'play' || b.over) return;
    const L = layout(world);
    // 던지는 쪽 — 사이일 때만.
    if (amPitching(world) && !b.pitch && !b.play && b.wait <= 0 && !(b.cool > 0)) {
      if (world.mp.role === 'guest') {
        world.send?.({ t: 'gm', k: 'pitch', n: b.type, x: b.aim.x, y: b.aim.y });
        b.cool = 0.5;                       // 방장이 받아 줄 때까지 두 번 안 보낸다
        return;
      }
      startPitch(world, b, L, b.type, b.aim.x, b.aim.y);
      return;
    }
    // 치는 쪽.
    if (amBatting(world) && b.pitch && !b.pitch.done && !b.play) {
      const frame = Math.round(b.pitch.t / FR);
      const up = !!world.input.jump, down = !!world.input.duck;
      if (world.mp.role === 'guest') {
        world.send?.({ t: 'gm', k: 'swing', f: frame, u: up ? 1 : 0, d: down ? 1 : 0 });
        // 내 화면에서도 배트는 바로 돈다. 판정은 방장이 한다 —
        // 배트가 한 왕복 뒤에 돌면 「안 눌렸나」 싶어 또 누르게 된다.
        b.batT = BAT_TIME;
        b.pitch.done = true;              // 한 공에 한 번만 보낸다
        return;
      }
      swing(world, frame, up, down);
      b.batT = BAT_TIME;
    }
  },

  /// 방향키를 누른 순간. 조준은 누르고 있는 동안 계속 움직이므로 여기선 아무것도 안 한다.
  tap() {},

  update(world, dt) {
    const b = world.bag;
    const L = layout(world);
    b.L = L;

    // 판정 글자와 자국은 판이 도는 것과 상관없이 사그라든다.
    if (b.call) { b.call.t += dt; if (b.call.t > b.call.life) b.call = null; }
    if (b.batT > 0) b.batT = Math.max(0, b.batT - dt);
    if (world.state !== 'play') return;

    // 방장이 명단을 다시 뿌리면 나도 그걸 따른다.
    if (world.mp.role === 'host') {
      b.sides = rosterSides(world);
      const mine = b.sides.get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) world.team = mine;
    }

    // 조준. **내 화면에서만** 움직인다 — 남이 볼 수 없으니 오갈 것도 없다.
    if (amPitching(world) && !b.pitch && !b.play && !b.over) {
      const dx = (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0);
      const dy = (world.input.jump ? 1 : 0) - (world.input.duck ? 1 : 0);
      b.aim.x = clamp(b.aim.x + dx * AIM_STEP * dt, -AIM_OUT, AIM_OUT);
      b.aim.y = clamp(b.aim.y + dy * AIM_STEP * dt, -AIM_OUT, AIM_OUT);
    }

    // 손님은 방장이 굴린 것을 따라 그리기만 한다. 다만 **투구 시계는 자기가 센다** —
    // 내가 본 공이 몇 프레임째인지가 곧 판정 기준이라, 남이 세어 준 값을 쓰면 안 된다.
    if (world.mp.role === 'guest') {
      if (b.cool > 0) b.cool -= dt;
      if (b.pitch) b.pitch.t += dt;
      if (b.play) b.play.t += dt;
      return;
    }

    if (b.over) return;

    // 사이. 다음 공을 기다린다. 판정이 끝난 공은 포수 미트에 꽂힌 뒤에 치운다 —
    // 스트라이크를 외치는 순간 공이 허공에서 사라지면 「어디로 갔지」가 된다.
    if (b.wait > 0) b.wait -= dt;
    if (b.pitch?.done && !b.play && b.wait > 0 && b.wait < 0.52) b.pitch = null;
    if (b.cool > 0) b.cool -= dt;

    // 대본이 돌고 있으면 그것만 굴린다.
    if (b.play) {
      b.play.t += dt;
      // 대본 안에 적힌 판정 글자를 때맞춰 띄운다.
      for (const c of b.play.calls) {
        if (!c.shown && b.play.t >= c.t) { c.shown = true; say(b, c.text, c.big); }
      }
      if (b.play.t >= b.play.over) settle(world, b);
      return;
    }

    // 던지는 중.
    if (b.pitch) {
      const p = b.pitch;
      p.t += dt;
      if (p.wind > 0) p.wind = Math.max(0, p.wind - dt);
      // 컴퓨터가 치는 쪽이면, 공이 날아간 순간 언제 휘두를지 정해 둔다.
      if (b.aiSwing === undefined) {
        b.aiSwing = humanOn(world, batSide(b)) ? null : aiSwing(b, p, L);
      }
      if (b.aiSwing && !p.done && p.t >= (p.plate + b.aiSwing.err) * FR) {
        b.batT = BAT_TIME;
        swing(world, p.plate + b.aiSwing.err, b.aiSwing.up, b.aiSwing.down);
        return;
      }
      // 홈을 지났다. 안 휘둘렀으면 심판이 가른다.
      if (!p.done && p.t >= p.dur + judgeWait(world, b)) {
        p.done = true;
        const end = pitchEnd(p, L);
        const z = zone(L);
        const side = (end.x - z.cx) / (z.w / 2);
        const high = (z.cy - end.y) / (z.h / 2);
        if (side < -HBP_AT) {                       // 타자 쪽(왼쪽)으로 크게 빠졌다
          say(b, '몸에 맞는 공', false);
          walkTo(world, b, '몸에 맞는 공', 'HBP');
        } else if (Math.abs(side) <= 1 && Math.abs(high) <= 1) {
          strike(world, b, '스트라이크');
        } else {
          ballFour(world, b);
        }
      }
      return;
    }

    // 던질 사람이 없으면(컴퓨터) 여기서 던진다.
    if (b.wait <= 0 && !humanOn(world, fieldSide(b))) {
      if (!b.ai) b.ai = aiPitch(b);
      startPitch(world, b, L, b.ai.type, b.ai.x, b.ai.y);
      b.ai = null;
    }
  },

  draw(ctx, world, time, boil, upright) {
    const b = world.bag;
    const L = b.L ?? layout(world);
    drawField(ctx, L, time);

    // 사람과 공을 깊이 순으로 모아 한 번에 그린다 — 멀리 선 사람이 뒤로 가야 한다.
    const rows = [];
    const t = b.play?.t ?? 0;
    const moving = new Map();
    for (const m of b.play?.men ?? []) moving.set(m.i, manAt(m, POSTS[m.i], t));

    const batter = humanOn(world, batSide(b));
    const pitcherMan = humanOn(world, fieldSide(b));
    const batTint = TEAM_INK[batSide(b)];
    const fieldTint = TEAM_INK[fieldSide(b)];

    POSTS.forEach((post, i) => {
      const [deg, ft] = moving.get(i) ?? [post.deg, post.ft];
      const mine = i === PITCHER && pitcherMan?.mine;
      const p = puppet(0, 0, {
        facing: Math.sin(deg * RAD) >= 0 ? -1 : 1,
        glove: 1,
        stance: 0,
        // 공이 떠 있는 동안은 **마지막 자세로 붙잡아 둔다.** 팔이 도는 시간(wind)이 0 이 되는
        // 때는 공을 놓고 0.09초 뒤인데, 거기서 놓아 버리면 공이 아직 날아가는 중에 투수가
        // 팔을 한 프레임에 40도 튕기며 서 있는 자세로 돌아가고 글러브도 사라졌다.
        pitchT: i === PITCHER && b.pitch ? Math.max(0.001, b.pitch.wind) : 0,
        crouch: i === CATCHER ? 1 : 0,
        vx: moving.has(i) ? 220 : 0,
        walk: time * 7,
      });
      rows.push({ ft, draw: () => drawAt(ctx, L, deg, ft, p, time, boil, {
        color: i === PITCHER ? fieldTint : null,
        name: i === PITCHER && pitcherMan ? (pitcherMan.name ?? null) : null,
        mine, crown: i === PITCHER && pitcherMan?.crown,
      }) });
    });

    // 타자. 홈 옆에 선다.
    // 친 순간 타자가 사라지면 **휘두르는 그림이 통째로 안 보인다.** 배트가 도는 동안은
    // 타석에 남겨 두고, 주자는 그 뒤에 걸어 나간다 (아래 runs 의 t0 와 같은 값).
    const showBatter = !b.play || b.play.foul || b.play.t < BAT_TIME;
    if (showBatter) {
      const bp = puppet(0, 0, {
        facing: 1, stance: 1, batT: b.batT ?? 0,
        walk: 0,
      });
      const [bx, by] = spot(L, 0, 0);
      rows.push({ ft: -2, draw: () => {
        bp.x = bx - 46; bp.groundY = by + 4;
        ctx.save();
        drawStickman(ctx, bp, time, boil, {
          bat: true, color: batTint, name: batter?.name ?? null,
          mine: !!batter?.mine, crown: !!batter?.crown,
        });
        ctx.restore();
      } });
    }

    // 주자.
    for (const r of b.play?.runs ?? []) {
      if (t < r.t0) continue;
      const gone = r.out && t > (r.outAt ?? 99);
      const [deg, ft] = runnerAt(r, t);
      const rp = puppet(0, 0, { facing: Math.sin(deg * RAD) >= 0 ? 1 : -1, vx: gone ? 0 : 260,
                               walk: time * 8, dead: false });
      rows.push({ ft, draw: () => drawAt(ctx, L, deg, ft, rp, time, boil,
        { color: batTint, faded: gone }) });
    }
    // 루에 서 있는 주자 (플레이가 없을 때).
    if (!b.play) {
      b.onBase.forEach((on, i) => {
        if (!on) return;
        const [deg, ft] = BASES[i + 1];
        const rp = puppet(0, 0, { facing: 1, walk: 0 });
        rows.push({ ft, draw: () => drawAt(ctx, L, deg, ft, rp, time, boil, { color: batTint }) });
      });
    }

    rows.sort((a, c) => c.ft - a.ft);      // 먼 것부터
    for (const r of rows) r.draw();

    // 공.
    drawBall(ctx, L, world, b, time);
    // 존과 조준점 — **던지는 사람 화면에만.**
    drawZone(ctx, L, world, b, time);
    // 판정 글자.
    drawCall(ctx, L, b);
  },

  hud(ctx, hud, time, toScreen) {
    drawBoard(ctx, hud, time);
  },

  message(world, from, msg) {
    if (world.mp.role !== 'host') return;
    const b = world.bag;
    // 편 고르기(s)는 판 밖에서도 받는다. 나머지는 **판이 돌 때만** — 안 그러면 판이
    // 야구 밖의 이유로 끝난 뒤(방장이 끝냈다거나)에도 손님 말 한 줄로 공이 날아간다.
    if (typeof msg.s !== 'number' && (world.state !== 'play' || b.over)) return;
    const side = b.sides?.get(from) ?? 0;
    if (msg.k === 'type' && side === fieldSide(b)) { b.type = clamp(msg.n | 0, 0, 2); return; }
    if (msg.k === 'pitch' && side === fieldSide(b)) {
      if (b.pitch || b.play || b.wait > 0 || b.over) return;
      startPitch(world, b, layout(world), msg.n, clamp(+msg.x || 0, -AIM_OUT, AIM_OUT),
                 clamp(+msg.y || 0, -AIM_OUT, AIM_OUT));
      return;
    }
    if (msg.k === 'swing' && side === batSide(b)) {
      // **손님이 본 프레임 번호를 그대로 믿는다.** 다만 있을 수 없는 값은 자른다 —
      // 남의 화면 값을 검사 없이 쓰면 공을 던지기도 전에 홈런을 칠 수 있게 된다.
      if (!b.pitch || b.pitch.done || b.play) return;
      const here = Math.round(b.pitch.t / FR);
      const f = clamp(msg.f | 0, here - 40, here + 2);
      swing(world, f, !!msg.u, !!msg.d);
      return;
    }
    if (typeof msg.s === 'number') picks(world).set(from, msg.s ? 1 : 0);
  },

  pack(world) {
    const b = world.bag;
    const fresh = b.fresh;
    b.fresh = null;                                   // 한 번만 보낸다
    return {
      c: [b.inn, b.half, b.outs, b.balls, b.strikes, b.score[0], b.score[1],
          b.onBase[0] ? 1 : 0, b.onBase[1] ? 1 : 0, b.onBase[2] ? 1 : 0, b.over ? 1 : 0],
      tm: [...rosterSides(world).entries()],
      p: b.pitch ? [b.pitch.type, Math.round(b.pitch.t * 1000), Math.round(b.pitch.ax * 100),
                    Math.round(b.pitch.ay * 100), b.pitch.done ? 1 : 0, b.seq,
                    Math.round(b.pitch.wind * 1000)] : null,
      y: b.play ? Math.round(b.play.t * 1000) : null,
      // 새 대본. 있을 때만 싣는다 — 몇 초에 한 번이라 두꺼워도 된다.
      s: fresh ? packPlay(fresh) : undefined,
      q: b.seq,
      k: b.call ? [b.call.text, b.call.big ? 1 : 0, Math.round(b.call.t * 100)] : null,
      w: Math.round((b.wait ?? 0) * 100),
      bt: Math.round((b.batT ?? 0) * 1000),
    };
  },

  unpack(world, data) {
    const b = world.bag;
    if (!data || typeof data !== 'object') return;
    if (Array.isArray(data.c) && data.c.length >= 11 && data.c.every(Number.isFinite)) {
      const [inn, half, outs, balls, strikes, s0, s1, r1, r2, r3, over] = data.c;
      b.inn = inn; b.half = half; b.outs = outs; b.balls = balls; b.strikes = strikes;
      b.score = [s0, s1];
      b.onBase = [!!r1, !!r2, !!r3];
      b.over = !!over;
    }
    if (Array.isArray(data.tm)) {
      b.sides = new Map(data.tm.filter((r) => Array.isArray(r) && r.length === 2));
      const mine = b.sides.get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) world.team = mine;
    }
    // 새 대본이 왔다.
    if (data.s && typeof data.s === 'object' && !Array.isArray(data.s)) {
      b.play = unpackPlay(data.s);
      b.play.t = num(data.y) / 1000;
    }
    else if (b.play && Number.isFinite(data.y)) {
      // 흘러가는 시각은 내 시계로 센다. 너무 벌어졌을 때만 맞춘다 —
      // 매 꾸러미마다 덮어쓰면 지연만큼 되감겨서 주자가 뒷걸음질한다.
      const want = data.y / 1000;
      if (Math.abs(want - b.play.t) > 0.25) b.play.t = want;
    } else if (data.y === null && b.play) b.play = null;

    // 투구. **새 공일 때만** 시계를 맞춘다 — 그 뒤로는 내가 센다.
    if (Array.isArray(data.p) && data.p.length >= 7 && data.p.every((v, i) => i === 0 || Number.isFinite(v))) {
      const [type, ms, ax, ay, done, seq, wind] = data.p;
      if (!b.pitch || b.seen !== seq) {
        const kind = PITCHES[clamp(type | 0, 0, 2)];
        b.pitch = { type: clamp(type | 0, 0, 2), kind, ax: ax / 100, ay: ay / 100, t: ms / 1000, dur: kind.dur,
                    plate: Math.round(kind.dur / FR), done: !!done, wind: wind / 1000 };
        b.seen = seq;
      } else {
        b.pitch.done = b.pitch.done || !!done;   // 한 번 닫힌 공은 다시 안 열린다
        b.pitch.wind = wind / 1000;
      }
    } else if (data.p === null) { b.pitch = null; b.seen = data.q ?? b.seen; }

    if (Array.isArray(data.k)) b.call = { text: String(data.k[0]), big: !!data.k[1], t: num(data.k[2]) / 100, life: 1.4 };
    else if (data.k === null) b.call = null;
    // 배트가 도는 것도 따라 그린다. 내가 이미 돌리고 있으면 그건 내 것을 쓴다 —
    // 내 스윙은 누른 그 프레임에 돌았고, 방장 것은 한 왕복 늦게 온다.
    if (!(b.batT > 0) && Number.isFinite(data.bt)) b.batT = data.bt / 1000;
    b.wait = Number.isFinite(data.w) ? data.w / 100 : 0;
    b.started = true;
  },

  resize(world) { if (world.bag) world.bag.L = layout(world); },
};

// ── 대본 싣고 풀기 ────────────────────────────────────────────────────────
//
// 몇 초에 한 번만 오가므로 사람이 읽을 수 있는 모양 그대로 보낸다. 숫자만 줄여 담는다.

function packPlay(p) {
  return {
    k: p.kind, o: p.over, f: p.foul ? 1 : 0,
    h: p.hops.map((h) => (h.k === 'fly'
      ? [0, r2(h.t0), r2(h.t1), r2(h.deg), h.pts.flat()]
      : h.k === 'roll' ? [1, r2(h.t0), r2(h.t1), r2(h.deg), r2(h.ft0), r2(h.v), r2(h.g)]
      : [2, r2(h.t0), r2(h.t1), r2(h.deg), r2(h.ft), r2(h.z)])),
    m: p.men.map((m) => [m.i, m.t0, m.t1, m.deg, m.ft].map((v) => Math.round(v * 100) / 100)),
    r: p.runs.map((r) => [r.from, r.to, r.t0, r.t1, r.out ? 1 : 0, r.outAt ?? -1]
      .map((v) => Math.round(v * 100) / 100)),
    c: p.calls.map((c) => [c.t, c.text, c.big ? 1 : 0]),
    w: p.hitWord ?? '', e: p.ev ?? 0, a: p.ang ?? 0,
  };
}
const chunk3 = (flat) => {
  const out = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]);
  return out.length ? out : [[0, 0, START_Z]];
};
/// 배열이 아니면 빈 배열로. **깨진 꾸러미 하나에 판이 통째로 멎으면 안 된다** —
/// 옛 버전이 보낸 것일 수도 있고, 중간에 잘린 것일 수도 있다.
const rows = (v, n) => (Array.isArray(v) ? v.filter((r) => Array.isArray(r) && r.length >= n) : []);
const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback);

function unpackPlay(d) {
  const p = play0(typeof d?.k === 'string' ? d.k : 'fly');
  p.over = clamp(num(d?.o, 2), 0.2, 30);
  p.foul = !!d?.f;
  p.hops = rows(d?.h, 5).map((r) => (r[0] === 0
    ? { k: 'fly', t0: num(r[1]), t1: num(r[2]), deg: num(r[3]),
        pts: chunk3(Array.isArray(r[4]) ? r[4].map((v) => num(v)) : []) }
    : r[0] === 1
      ? { k: 'roll', t0: num(r[1]), t1: num(r[2]), deg: num(r[3]), ft0: num(r[4]),
          v: num(r[5]), g: num(r[6], ROLL_DIRT) || ROLL_DIRT }
      : { k: 'rest', t0: num(r[1]), t1: num(r[2]), deg: num(r[3]), ft: num(r[4]), z: num(r[5]) }));
  p.men = rows(d?.m, 5).map((r) => ({ i: clamp(r[0] | 0, 0, POSTS.length - 1),
                                      t0: num(r[1]), t1: num(r[2]), deg: num(r[3]), ft: num(r[4]) }));
  p.runs = rows(d?.r, 5).map((r) => ({ from: clamp(r[0] | 0, 0, 4), to: clamp(r[1] | 0, 0, 4),
                                       t0: num(r[2]), t1: num(r[3]), out: !!r[4],
                                       outAt: num(r[5], -1) < 0 ? undefined : num(r[5]) }));
  p.calls = rows(d?.c, 2).map((r) => ({ t: num(r[0]), text: String(r[1] ?? ''),
                                        big: !!r[2], shown: true }));
  p.hitWord = typeof d?.w === 'string' ? d.w : '';
  p.ev = num(d?.e); p.ang = num(d?.a);
  return p;
}

// ── 그림 ──────────────────────────────────────────────────────────────────

/// 그라운드. 잔디 부채꼴 하나에 담장, 파울선, 내야 마름모.
function drawField(ctx, L, time) {
  // 잔디.
  ctx.beginPath();
  const home = spot(L, 0, 0);
  ctx.moveTo(home[0], home[1]);
  for (let d = -FOUL_DEG; d <= FOUL_DEG + 0.01; d += 2.5) {
    const [x, y] = spot(L, d, fenceFt(d));
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = GRASS;
  ctx.fill();

  // 내야 흙.
  ctx.beginPath();
  const arc = [];
  for (let d = -FOUL_DEG; d <= FOUL_DEG + 0.01; d += 3) arc.push(spot(L, d, 118));
  ctx.moveTo(home[0], home[1]);
  arc.forEach(([x, y]) => ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = DIRT;
  ctx.fill();

  // 담장.
  const fence = [];
  for (let d = -FOUL_DEG; d <= FOUL_DEG + 0.01; d += 3) fence.push(spot(L, d, fenceFt(d)));
  stroke(ctx, fence, { width: 3.4, color: INK, seed: 11, amp: 1.2 });

  // 파울선. 두 줄 다 홈에서 파울 폴까지.
  for (const s of [-1, 1]) {
    stroke(ctx, [spot(L, s * FOUL_DEG, 2), spot(L, s * FOUL_DEG, fenceFt(FOUL_DEG))],
           { width: 2.2, color: PENCIL, seed: 12 + s, amp: 0.9, alpha: 0.75 });
  }

  // 내야 마름모.
  const diamond = [spot(L, 0, 0), spot(L, FOUL_DEG, BASE_FT), spot(L, 0, SECOND_FT),
                   spot(L, -FOUL_DEG, BASE_FT)];
  stroke(ctx, [...diamond, diamond[0]], { width: 2.4, color: PENCIL, seed: 14, amp: 0.8,
                                          alpha: 0.9, sharp: true });

  // 루. 작은 네모 셋과 오각형 하나.
  for (let i = 1; i <= 3; i++) {
    const [x, y] = spot(L, BASES[i][0], BASES[i][1]);
    const r = 11 * depth(BASES[i][0], BASES[i][1]) + 4;
    stroke(ctx, [[x - r, y], [x, y - r * 0.62], [x + r, y], [x, y + r * 0.62]],
           { width: 2, color: INK, seed: 20 + i, amp: 0.4, close: true, fill: PAPER_SOLID });
  }
  const [hx, hy] = home;
  // 홈 둘레의 흙. 타석 네모를 그렸더니 스트라이크 존과 겹쳐 무엇이 무엇인지 안 갈렸다.
  ctx.beginPath();
  ctx.ellipse(hx, hy + 4, 78, 40, 0, 0, Math.PI * 2);
  ctx.fillStyle = DIRT;
  ctx.fill();
  stroke(ctx, [[hx - 9, hy - 4], [hx + 9, hy - 4], [hx + 9, hy + 2], [hx, hy + 7], [hx - 9, hy + 2]],
         { width: 2, color: INK, seed: 24, amp: 0.4, close: true, fill: PAPER_SOLID });

  // 마운드.
  const [mx, my] = spot(L, 0, MOUND_FT);
  circle(ctx, mx, my + 4, 30 * depth(0, MOUND_FT) + 6,
         { width: 2, color: PENCIL, seed: 26, amp: 0.8, alpha: 0.7, halo: false });
}

/// 공. 날아가는 동안 발밑에 그림자가 따라간다 — 2차원 화면에서 높이는 그림자 없이는 안 읽힌다.
function drawBall(ctx, L, world, b, time) {
  if (b.play) {
    const [deg, ft, z] = ballAt(b.play, b.play.t);
    const [gx, gy] = spot(L, deg, ft);
    const s = depth(deg, ft);
    const y = gy - lift(L, z, deg, ft);
    // 그림자. 낮을수록 진하고 작다.
    const shade = clamp(1 - z / 90, 0.12, 0.85);
    circle(ctx, gx, gy, (6 + z * 0.10) * s, { width: 1.4, color: PENCIL, halo: false,
                                              alpha: shade * 0.5, seed: 31, amp: 0.4 });
    circle(ctx, gx, y, 8.5 * s + 2, { width: 2.6, color: INK, seed: 32, amp: 0.5 });
    return;
  }
  if (b.pitch) {
    const p = b.pitch;
    if (p.t < 0) return;                                 // 아직 손에 있다
    const u = clamp(p.t / p.dur, 0, 1.12);
    const at = pitchAt(p, L, Math.min(1, u));
    // 홈을 지난 공은 포수 미트로 빨려 들어간다. **얼마나 지났든 미트에서 멈춘다** —
    // 꾸러미가 한동안 안 오면 손님 쪽 시계만 계속 흘러서, 안 자르면 공이 화면 밑으로 날아간다.
    const past = Math.min(0.6, Math.max(0, u - 1));
    const y = at.y + past * 180;
    circle(ctx, at.x, y, at.r, { width: 2.6, color: INK, seed: 33, amp: 0.5 });
    // 지나온 자리에 옅은 꼬리 — 이게 없으면 공이 순간이동하는 것처럼 보인다.
    for (let i = 1; i <= 3; i++) {
      const uu = Math.min(1, u) - i * 0.055;
      if (uu <= 0) continue;
      const t2 = pitchAt(p, L, uu);
      circle(ctx, t2.x, t2.y, t2.r * 0.8, { width: 1.5, color: PENCIL, halo: false,
                                            alpha: 0.30 - i * 0.07, seed: 34 + i, amp: 0.4 });
    }
  }
}

/// 스트라이크 존과 조준점.
///
/// **던지는 사람 화면에만 조준점이 보인다.** 타자가 미리 알면 수싸움이 통째로 없어진다 —
/// 넷이서의 신호탑과 같은 수법이다. 존 자체는 둘 다 본다. 그건 규칙이라 감출 것이 아니다.
function drawZone(ctx, L, world, b, time) {
  if (world.state !== 'play' || b.over) return;
  const z = zone(L);
  const half = [z.w / 2, z.h / 2];
  const box = [[z.cx - half[0], z.cy - half[1]], [z.cx + half[0], z.cy - half[1]],
               [z.cx + half[0], z.cy + half[1]], [z.cx - half[0], z.cy + half[1]]];
  // 모서리를 살려 긋는다 — 부드럽게 이으면 네모가 아니라 둥근 자국이 된다.
  // 네 귀퉁이만 짧게 그어도 네모로 읽히지만, 공이 어디로 들어왔는지 눈으로 재려면
  // 테두리가 통째로 있어야 한다.
  stroke(ctx, [...box, box[0]], { width: 1.7, color: PENCIL, seed: 41, amp: 0.45,
                                  alpha: b.play ? 0.16 : b.pitch ? 0.62 : 0.40,
                                  sharp: true, haloWidth: 3 });
  if (!amPitching(world) || b.pitch || b.play) return;
  const x = z.cx + b.aim.x * half[0];
  const y = z.cy - b.aim.y * half[1];
  const pulse = 0.55 + 0.35 * Math.sin(time * 5);
  circle(ctx, x, y, 13, { width: 2.2, color: RED, seed: 42, amp: 0.5, alpha: pulse, halo: false });
  stroke(ctx, [[x - 20, y], [x - 7, y]], { width: 2, color: RED, seed: 43, amp: 0.4, alpha: pulse, halo: false });
  stroke(ctx, [[x + 7, y], [x + 20, y]], { width: 2, color: RED, seed: 44, amp: 0.4, alpha: pulse, halo: false });
  // 무슨 공을 고를지도 여기 적는다 — 눈이 조준점에 가 있으니 구종도 거기 있어야 한다.
  text(ctx, PITCHES[b.type].name, x, y - 24,
       { font: `800 14px ${HAN}`, color: RED, align: 'center', halo: 3 });
  if (b.wait > 0) {
    text(ctx, '…', x, y + 30, { font: `800 15px ${HAN}`, color: PENCIL, align: 'center', halo: 3 });
  }
}

/// 판정 한 줄. 홈 위에 크게 뜬다.
function drawCall(ctx, L, b) {
  if (!b.call) return;
  const k = clamp(b.call.t / b.call.life, 0, 1);
  const rise = smooth(Math.min(1, k * 4)) * 26;
  const fade = k > 0.72 ? 1 - (k - 0.72) / 0.28 : 1;
  const size = b.call.big ? 40 : 25;
  // **마운드와 존 사이**에 띄운다. 더 위로 올리면 투수 몸에 겹쳐서 글자가 사람에 묻히고,
  // 더 내리면 타자와 포수를 덮는다. 창을 줄이면 그 틈도 같이 좁아지므로 판 크기를 따라간다.
  const y = L.hy - Math.min(148, L.rise * 0.115) - rise;
  text(ctx, b.call.text, L.hx, y, {
    font: `900 ${size}px ${HAN}`, color: b.call.big ? RED : INK, align: 'center',
    alpha: fade, halo: size * 0.34,
  });
}

/// 기록판. 회·점수·아웃·볼카운트·주자. 왼쪽 위 여백에 세로로 — 이 게임의 다른 글자판과 같은 자리.
function drawBoard(ctx, world, time) {
  const b = world.bag;
  if (!b || world.state === 'pick') return;
  const x = 28, y = 16, w = 212, h = 124;
  paperScrap(ctx, x, y, w, h, 5);
  stroke(ctx, [[x + 12, y + 10], [x + 12, y + h - 10]],
         { width: 2, color: RED, seed: 1, amp: 1.2, alpha: 0.8, halo: false });

  const inn = b.over ? '끝' : `${b.inn > INNINGS ? '연장 ' : ''}${b.inn}회 ${b.half === 0 ? '초' : '말'}`;
  text(ctx, inn, x + 26, y + 30, { font: `800 15px ${HAN}`, color: INK, halo: 0 });
  // 점수. 공격 중인 편을 굵게 — 지금 누가 치는지가 한눈에 보여야 한다.
  const bat = batSide(b);
  text(ctx, TEAM_NAME[1], x + 26, y + 54, { font: `${bat === 1 ? 800 : 500} 13px ${HAN}`, color: TEAM_INK[1], halo: 0 });
  text(ctx, String(b.score[1]), x + 96, y + 54, { font: `700 18px ${MONO}`, color: TEAM_INK[1], align: 'right', halo: 0 });
  text(ctx, TEAM_NAME[0], x + 26, y + 76, { font: `${bat === 0 ? 800 : 500} 13px ${HAN}`, color: TEAM_INK[0], halo: 0 });
  text(ctx, String(b.score[0]), x + 96, y + 76, { font: `700 18px ${MONO}`, color: TEAM_INK[0], align: 'right', halo: 0 });

  // 볼·스트라이크·아웃.
  text(ctx, `${b.balls} - ${b.strikes}`, x + 26, y + 102, { font: `700 17px ${MONO}`, color: INK, halo: 0 });
  text(ctx, '아웃', x + 84, y + 102, { font: `600 11px ${HAN}`, color: PENCIL, halo: 0 });
  for (let i = 0; i < 2; i++) {
    circle(ctx, x + 118 + i * 15, y + 97, 5,
           { width: 1.8, color: i < b.outs ? RED : PENCIL, halo: false, seed: 50 + i, amp: 0.3,
             fill: i < b.outs ? RED : null, alpha: i < b.outs ? 1 : 0.45 });
  }

  // 주자 마름모.
  const dx = x + w - 44, dy = y + 54;
  const corner = [[dx + 15, dy], [dx, dy - 15], [dx - 15, dy]];
  corner.forEach(([cx, cy], i) => {
    stroke(ctx, [[cx - 8, cy], [cx, cy - 6], [cx + 8, cy], [cx, cy + 6]],
           { width: 1.6, color: b.onBase[i] ? TEAM_INK[bat] : PENCIL, seed: 60 + i, amp: 0.3,
             close: true, halo: false, fill: b.onBase[i] ? TEAM_INK[bat] : null,
             alpha: b.onBase[i] ? 0.9 : 0.4 });
  });
  stroke(ctx, [[dx - 5, dy + 16], [dx + 5, dy + 16], [dx + 5, dy + 20], [dx, dy + 24], [dx - 5, dy + 20]],
         { width: 1.4, color: PENCIL, seed: 64, amp: 0.25, close: true, halo: false, alpha: 0.5 });

  // 마지막 기록 몇 줄. 기록지가 그대로 쌓인다.
  const rows = b.log.slice(-3);
  rows.forEach((row, i) => {
    const ly = y + h + 18 + i * 17;
    text(ctx, row.r, x + 26, ly, { font: `700 12px ${MONO}`, color: PENCIL, halo: 2, alpha: 0.9 });
    text(ctx, row.t, x + 62, ly, { font: `600 12px ${HAN}`, color: PENCIL, halo: 2, alpha: 0.9 });
  });

  // 지금 내가 무엇을 하는 사람인가. 회마다 바뀌니 화면에 적어 둔다.
  if (world.state === 'play' && !b.over) {
    const role = world.mp.waiting ? '구경'
      : amPitching(world) ? `던진다 — ${PITCHES[b.type].name}` : '친다';
    const cw = 150;
    text(ctx, role, world.w / 2, 34,
         { font: `800 15px ${HAN}`, color: amPitching(world) ? TEAM_INK[fieldSide(b)] : TEAM_INK[batSide(b)],
           align: 'center', halo: 4 });
    if (b.swungAt && world.elapsed - b.swungAt.at < 1.2 && amBatting(world)) {
      const e = b.swungAt.err;
      text(ctx, e === 0 ? '정확!' : `${Math.abs(e)}프레임 ${e < 0 ? '빨랐다' : '늦었다'}`,
           world.w / 2, 56, { font: `700 13px ${HAN}`, color: RED, align: 'center', halo: 3 });
    }
  }
}
