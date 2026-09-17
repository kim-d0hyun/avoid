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
export const FENCE_MID = 348;   // 가운데 담장
export const FENCE_LINE = 248;  // 파울 폴
const FOUL_DEG = 45;            // 파울선까지의 각

/// 수비 아홉. 번호는 **야구 기록지의 수비 번호 그대로**다 — 병살을 6-4-3 으로 적는 그 번호.
/// 판이 끝나면 이 번호로 적은 줄이 그대로 기록지가 된다.
export const POSTS = [
  { no: 1, name: '투수', deg: 0, ft: MOUND_FT },
  { no: 2, name: '포수', deg: 0, ft: -15 },
  { no: 3, name: '1루수', deg: 39, ft: 103 },
  { no: 4, name: '2루수', deg: 21, ft: 149 },
  { no: 5, name: '3루수', deg: -39, ft: 103 },
  { no: 6, name: '유격수', deg: -21, ft: 149 },
  { no: 7, name: '좌익수', deg: -30, ft: 240 },
  { no: 8, name: '중견수', deg: 0, ft: 270 },
  { no: 9, name: '우익수', deg: 30, ft: 240 },
];
const PITCHER = 0, CATCHER = 1;
/// 내야 넷 (1루수·2루수·3루수·유격수). 시프트는 이 넷만 움직인다.
const INNERS = [2, 3, 4, 5];
/// **수비 시프트.** 내야를 한쪽으로 통째로 옮긴다 — 당겨 치는 타자를 상대로 미리 서는 것이다.
/// 옮긴 쪽은 막히고 **반대쪽은 비어서**, 맞히기만 하면 그쪽으로 빠진다. 공짜가 아니다.
/// 넷을 **옆으로 나란히** 이만큼 옮긴다 (피트).
///
/// 처음엔 각도로 옮겼는데, 그러면 홈에서 먼 사람이 더 많이 움직여서 **가운데가 벌어진다** —
/// 당김 수비를 걸면 3루 쪽이 아니라 한가운데에 70피트짜리 구멍이 났다.
/// 옆으로 같은 거리만큼 옮기면 간격이 그대로 유지되고, 비는 곳도 옮긴 만큼만 생긴다.
/// 시프트를 걸면 **가운데 한 명이 2루를 넘어 건너간다** — 실제 시프트가 그 모양이다.
/// 나머지 셋은 그쪽으로 조금 당겨 선다.
///
/// 처음엔 넷을 통째로 옆으로 밀었다. 그러면 **가는 쪽도 오는 쪽도 다 손해**였다 —
/// 3루수는 이미 파울선 근처라 더 갈 데가 없고, 가운데에는 40도짜리 구멍이 생겼다.
/// 당겨 치는 타자를 상대로도 시프트가 늘 손해라면 그건 고를 이유가 없는 손잡이다.
/// 이 거리 안쪽이 내야다. 「구르는 공을 주워 담는 몫」이 여기서 갈린다.
const INFIELD_FT = 165;
const SHIFT_CROSS = 9;          // 건너간 사람이 서는 각
const SHIFT_NUDGE = 10;         // 나머지 셋이 그쪽으로 당겨 서는 몫 (피트)
const SHIFT_NAME = ['보통', '당김 수비 (3루 쪽)', '밀어침 수비 (1루 쪽)'];
const SHIFT_SHORT = ['수비 보통', '당김 수비', '밀어침 수비'];
/// 친 순간 외치는 타구 이름. **결과(아웃·안타)는 몇 초 뒤에 나오는데, 그 사이에 화면에서
/// 무슨 일이 일어나고 있는지가 안 읽혔다** — 공 하나만 보고 뜬공인지 땅볼인지 가리기 어렵다.
const KIND_WORD = { grounder: '땅볼', popup: '내야 뜬공', liner: '직선타', fly: '뜬공', wall: '큰 타구!' };

/// 시프트를 얹은 수비 자리. 내야 넷만 움직이고 투수·포수·외야는 그대로다.
export function postAt(i, shift) {
  const post = POSTS[i];
  if (!shift || !INNERS.includes(i)) return post;
  if (shift < 0 && i === 3) return { ...post, deg: -SHIFT_CROSS };   // 2루수가 3루 쪽으로 건너간다
  if (shift > 0 && i === 5) return { ...post, deg: SHIFT_CROSS };    // 유격수가 1루 쪽으로
  const [x, y] = flat(post.deg, post.ft);
  const [deg, ft] = polar(x + shift * SHIFT_NUDGE, y);
  return { ...post, deg, ft };
}

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
/// 프레임으로 고쳐 두면 24 · 28 · 41 · 33 이다. **직구와 커브가 17프레임 떨어져 있다** —
/// 이 간격이 이 게임의 전부다. 처음엔 25 · 36 · 33 으로 뒀는데, 그러면 구종을 잘못 읽어도
/// 빗맞기만 할 뿐 헛스윙이 안 나온다. 재 보니 타율이 4할 3푼이었고 삼진이 한 번도 없었다.
/// **틀리면 헛스윙이 나와야 맞히는 게 뜻을 갖는다.**
///
/// 슬라이더는 **속도로 속이지 않고 옆으로 속인다** — 직구와 네 프레임밖에 안 떨어져 있어서
/// 박자는 맞는데, 존 폭의 0.6배만큼 옆으로 휘어 몸쪽·바깥쪽을 한 칸 옮겨 놓는다.
export const PITCHES = [
  { name: '직구', dur: 0.40, drop: 0.00, bend: 0.00, tilt: 0 },
  { name: '슬라이더', dur: 0.47, drop: 0.26, bend: -0.62, tilt: -3 },
  { name: '커브', dur: 0.68, drop: 0.70, bend: -0.14, tilt: -8 },
  { name: '체인지업', dur: 0.55, drop: 0.22, bend: 0.30, tilt: -2 },
];

/// 스트라이크 존. 홈 플레이트 위에 떠 있는 네모다.
///
/// 높이를 진짜 자(1.6~3.5피트)로 그리면 3픽셀이 된다. 여기만 크게 부풀린다 —
/// 존이 안 읽히면 「왜 볼이지」를 영영 알 수 없고, 그러면 조준하는 재미가 통째로 없어진다.
export function zone(L) {
  const k = Math.min(1, L.rise / 900);
  return { cx: L.hx, cy: L.hy - 64 * k, w: 92 * k, h: 112 * k };
}
/// **조준은 존 언저리까지만.** 존 반폭의 이만큼 밖으로는 못 겨눈다 (1 이 존 테두리).
///
/// 터무니없는 데를 겨눌 수 있으면 그건 조준이 아니라 도망이다 — 타자가 절대 못 치는 자리에
/// 계속 던지고 볼넷을 주는 쪽이 늘 이득이 된다. 컴투스 프로야구가 그랬듯, 던지는 사람은
/// **존과 그 한 겹 바깥까지**만 고르고 나머지는 제구가 정한다.
export const AIM_OUT = 1.35;
/// 겨눈 자리와 실제로 가는 자리의 차이 — **제구.** 사람이 던져도 그대로 꽂히지 않는다.
/// 이게 없으면 겨눈 곳에 100% 들어가서, 던지는 쪽이 한 번도 실수하지 않는다.
const WILD = 0.21;
/// 이보다 몸쪽으로 들어오면 타자를 맞힌다. 조준 한계(1.35)보다 바깥이라 **겨눠서 맞힐 수는 없다** —
/// 몸쪽을 파다가 제구가 더 밀리면 맞는 것이다.
const HBP_AT = 1.62;
/// 홈에 붙어 선 타자는 그만큼 더 맞는다. 바깥쪽 공을 얻는 값이다.
const HBP_CROWD = 0.34;
const AIM_STEP = 2.6;           // 초당 몇 칸 (존 반폭 기준)

// ── 치기 ──────────────────────────────────────────────────────────────────

/// 휘두른 때가 홈을 지나는 순간에서 몇 프레임 어긋났나 — 그 폭으로 결과가 갈린다.
/// 배구에서 배운 것을 그대로 옮겼다: **빗나간 까닭을 안 알려 주면 아무리 해도 운으로 남는다.**
export const BARREL = 3;        // 정타
export const SOLID = 7;         // 안타권
export const CONTACT = 12;      // 한가운데 공. 여기까지는 맞기는 한다. 넘으면 헛스윙
export const EASY = 0.38;       // 이 안쪽은 어디로 오든 한가운데와 같다 (배트 가운데)
export const REACH_DROP = 0.24;
export const MITT_OUT = 1.2;    // 미트가 나갈 수 있는 끝 (존 반폭 기준)
const MITT_STEP = 2.2;          // 미트가 움직이는 속도 (초당)
const READ_MISS = 0.62;         // 컴퓨터 타자가 자리를 짚는 솜씨 (작을수록 잘 짚는다)
const SWING_TILT = 0.45;        // 미트를 이만큼 올리면 띄워 치기, 내리면 눌러 치기
const BREAK_SHOW = 3.4;         // 오는 길의 휨을 눈에 보이게 부풀리는 값 (도착 자리는 그대로) // 구석으로 갈수록 창이 이만큼씩 좁아진다

/// 제일 잘 맞았을 때의 타구 속도 (ft/s). 공기 저항을 안 넣었으므로 진짜 값(150)보다 낮다 —
/// 이 값에서 28도로 뜨면 400피트가 나온다.
const EV_MAX = 152;
/// 담장 앞에서 이만큼은 떠 있어야 넘어간다.
const HR_CLEAR = 6;
const REACT = 0.30;             // 공을 보고 몸이 움직이기까지
const RUN_FIELD = 29;           // 내야수가 다 달렸을 때의 속도 ft/s
/// 외야수는 더 빠르다. **웅크려 기다리다 옆으로 반응하는 것과, 등을 돌리고 3초를 달리는 것은
/// 다른 일이다.** 한 값으로 두었더니 내야에 구멍을 내면 외야도 같이 뚫려서, 땅볼을 살리면
/// 뜬 공이 전부 안타가 됐다. 둘을 따로 두면 각각 맞출 수 있다.
const RUN_OUT = 33;
const OUTFIELD = [6, 7, 8];
/// 처음 20피트는 이만큼밖에 못 간다. **몸을 일으키고 방향을 잡는 몫**이다.
///
/// 이게 없으면 내야에 구멍이 없다. 등속으로 재면 유격수가 1.0초에 29피트를 가서
/// 2루수와 커버 범위가 겹쳐 버리고, 그러면 땅볼이 전부 아웃이 된다 — 실제로 그렇게
/// 만들어 놓고 재 보니 땅볼 피안타율이 0할이었다. 야구에서 「구멍을 뚫었다」가 되려면
/// 처음 한 걸음이 느려야 한다.
const BURST = 17, BURST_FT = 14;
const runSecs = (d, out = false) => {
  const top = out ? RUN_OUT : RUN_FIELD;
  return REACT + (d <= BURST_FT ? d / BURST : BURST_FT / BURST + (d - BURST_FT) / top);
};
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
const BASE_RUN = 4.25;          // 타자가 1루까지 (선 자리에서 출발). 타자마다 발이 다르다
/// 친 뒤 타석을 뜨기까지. 배트가 도는 시간과 같다 — 그동안은 타석에 서 있는 그림이 남는다.
const LEAVE = 0.3;
const FROM_BASE = 3.90;         // 루에 선 주자가 다음 루까지
const NEXT_BASE = 3.15;         // 이미 달리고 있는 주자가 한 루 더
const TAG_UP = 3.20;            // 뜬공을 잡은 뒤 3루 주자가 홈까지
/// 굴러가는 공이 줄어드는 정도 (ft/s²). 땅볼은 흙 위에서 튀며 빨리 죽고,
/// 떨어진 뜬 공은 잔디 위를 멀리 굴러간다 — 그 차이가 1루타와 2루타를 가른다.
const ROLL_DIRT = 26, ROLL_GRASS = 13;

/// **투구 시계.** 사람이 던지는 쪽일 때만 돈다.
///
/// 없을 때는 상대가 자리를 비우면 판이 영영 멎었다 — 다른 한 사람은 가만히 선 그라운드를
/// 보고 있게 된다. 실제 야구도 2023년에 같은 이유로 넣었고, 시간도 거기서 가져왔다
/// (주자가 있으면 조금 더 준다).
const CLOCK_EMPTY = 15, CLOCK_ON = 20;
const clockFor = (b) => (b.onBase.some(Boolean) ? CLOCK_ON : CLOCK_EMPTY);

/// 타순 아홉.
///
/// 지금까지는 아홉 번을 쳐도 **같은 사람이 아홉 번 치는 것**이었다. 셋만 다르게 둔다 —
/// 힘 · 눈 · 발. 그 셋이면 던지는 쪽에 「이 타자한테는 뭘 던질까」가 생기고,
/// 치는 쪽에도 「내 차례에 뭘 할 수 있나」가 생긴다.
///
///   pow  타구 속도 배수
///   eye  맞는 창이 몇 프레임 넓나 (넓을수록 헛스윙이 적다)
///   leg  1루까지 걸리는 시간에 더하는 몫 (음수가 빠르다)
///   pull 어느 쪽으로 치나 (음수가 당겨 치기 — 3루 쪽)
///
/// **성향이 있어야 시프트가 뜻을 갖는다.** 처음엔 넷 다 고르게 치게 뒀더니 수비 시프트가
/// 늘 손해였다 — 한쪽을 막아도 막을 쪽이 없으니 반대쪽만 비는 것이다.
///
/// 타순은 실제 야구가 짜는 모양을 따른다 — 앞에는 발과 눈, 가운데는 힘, 뒤는 고루 약하다.
const SPOTS_ROLE = [
  { name: '발', pow: 0.90, eye: 2, leg: -0.24, pull: 0.5 },
  { name: '눈', pow: 0.93, eye: 2, leg: -0.14, pull: 0.2 },
  { name: '교타', pow: 1.00, eye: 1, leg: -0.06, pull: 0.0 },
  { name: '장타', pow: 1.12, eye: -1, leg: 0.16, pull: -1.0 },
  { name: '장타', pow: 1.09, eye: -1, leg: 0.12, pull: -0.8 },
  { name: '중심', pow: 1.04, eye: 0, leg: 0.04, pull: -0.5 },
  { name: '보통', pow: 0.97, eye: 0, leg: 0.00, pull: 0.0 },
  { name: '보통', pow: 0.94, eye: -1, leg: 0.06, pull: 0.3 },
  { name: '하위', pow: 0.90, eye: -2, leg: 0.02, pull: -0.3 },
];
/// 성향을 사람 말로. 던지는 쪽이 이걸 보고 시프트를 건다.
export const pullWord = (v) => (v <= -0.45 ? '당겨침' : v >= 0.45 ? '밀어침' : '고루');
/// 같은 씨앗이면 어디서 돌려도 같은 타순이 나온다 — 방장과 손님이 따로 만들어도 어긋나지 않는다.
function seeded(n) {
  let x = (n | 0) || 1;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x |= 0;
    return ((x >>> 0) % 100000) / 100000;
  };
}
export function makeOrder(seed) {
  const r = seeded(seed);
  return [0, 1].map((side) => SPOTS_ROLE.map((role, i) => ({
    no: i + 1,
    name: role.name,
    // 같은 자리라도 사람마다 조금씩 다르다. 아홉이 아홉으로 보여야 타순이 뜻을 갖는다.
    pow: Math.round((role.pow + (r() - 0.5) * 0.10) * 100) / 100,
    eye: Math.max(-3, Math.min(3, role.eye + (r() < 0.25 ? (r() < 0.5 ? -1 : 1) : 0))),
    leg: Math.round((role.leg + (r() - 0.5) * 0.10) * 100) / 100,
    pull: Math.round(clamp(role.pull + (r() - 0.5) * 0.5, -1, 1) * 100) / 100,
  })));
}
/// 지금 치는 타자.
export function atBat(b) {
  const side = batSide(b);
  const row = b.order?.[side];
  if (!row?.length) return { no: 1, name: '보통', pow: 1, eye: 0, leg: 0 };
  return row[(b.upNext?.[side] ?? 0) % row.length];
}

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

const ZERO_SPOT = { side: 0, high: 0 };
const ANY_BAT = { pow: 1, eye: 0, leg: 0, pull: 0 };
const rnd = () => Math.random();
/// 가운데가 두툼한 흔들림 — 표준편차 1 쯤. 제구가 흔들리는 모양은 네모가 아니라 이것이다.
const gauss = () => (rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) * Math.SQRT2;
const spread = (amp) => (Math.random() - Math.random()) * amp;   // 가운데가 두툼한 흩뿌림

/// 친 순간 세 값이 나온다 — **타구 속도 · 발사각 · 방향.** 나머지는 전부 이 셋에서 나온다.
///
/// 진짜 야구를 재는 방식 그대로다. 이 셋만 있으면 어디에 떨어질지도, 얼마나 떠 있을지도,
/// 잡을 수 있는지도 다 계산으로 나온다 — 「이 경우엔 2루타」 같은 표를 만들 필요가 없다.
export function contact(err, up, down, pitch, spot = ZERO_SPOT, bat = ANY_BAT) {
  const acc = Math.abs(err);
  // **눈 좋은 타자는 맞는 창이 넓다.** 헛스윙의 경계만 움직이고 정타·안타권은 그대로 둔다 —
  // 눈이 좋다고 더 세게 치는 건 아니다.
  const side = clamp(spot.side ?? 0, -AIM_OUT, AIM_OUT);    // − 몸쪽 · + 바깥쪽
  const high = clamp(spot.high ?? 0, -AIM_OUT, AIM_OUT);    // + 높은 공
  // **배트가 닿는 창은 공이 들어온 자리에 따라 좁아진다.** 한가운데는 넓고 구석은 좁다.
  // 이게 없으면 「네모 안 아무 데나 던져도 휘두르면 다 맞는」 게임이 된다 — 자리가
  // 방향과 힘만 바꾸고 **맞느냐는 안 건드리면**, 던지는 쪽은 결국 타이밍만 흔들면 된다.
  const far = Math.hypot(side, high);                      // 0 가운데 · 1 존 테두리 · 1.35 한계
  // **창이 통째로 좁아진다.** 헛스윙 경계만 좁히면 모자란다 — 정타·안타권 경계를 그대로
  // 두면 구석 공도 타이밍만 맞추면 한가운데와 똑같이 정타가 나서, 「네모 안 아무 데나
  // 던져도 다 쳐진다」가 그대로 남는다. 재 보니 정타 비율이 어느 자리든 32%로 같았다.
  const tight = 1 - clamp(far - EASY, 0, 1.5) * REACH_DROP;
  const reach = (CONTACT + (bat.eye ?? 0)) * tight;
  if (acc > reach) return null;                           // 헛스윙
  const grade = acc <= BARREL * tight ? 2 : acc <= SOLID * tight ? 1 : 0;
  // 타이밍이 정확할수록 빠르다. **계단이 아니라 비탈이다** — 세 칸으로 끊으면 3프레임과
  // 4프레임이 전혀 다른 공이 되고, 그러면 1프레임 차이가 안 느껴진다.
  //
  // **어디로 들어온 공이냐도 같이 본다.** 처음엔 때만 봤더니 한가운데 공이든 바깥쪽 낮은
  // 공이든 똑같은 타구가 나왔다 — 그러면 조준하는 쪽이 할 일이 없다.
  //   · 존 가장자리로 갈수록 제대로 맞히기 어렵다 (힘이 준다)
  //   · 높은 공은 뜨고 낮은 공은 구른다
  //   · 몸쪽 공은 당겨지고 바깥쪽 공은 밀린다
  // 존 안쪽 절반은 어디로 오든 같다. **구석에 붙인 공만** 힘이 준다 —
  // 0.5부터 깎았더니 컴퓨터 투수가 늘 언저리를 노리는 탓에 리그 전체 타율이 1할대로 내려갔다.
  const edge = Math.max(0, far - 0.8);
  // 구석 공은 **맞아도 안 뻗는다.** 프레임은 정수라 정타 경계를 좁히는 것만으로는
  // 구석과 테두리가 잘 안 갈린다 (2.55프레임이나 2.36프레임이나 결국 2프레임이다).
  // 힘은 연속이라 여기서 갈린다 — 구석에 붙인 공은 담장 앞에서 죽고 땅볼도 느려진다.
  const power = (1 - (acc / reach) ** 1.5 * 0.52) * (1 - clamp(edge, 0, 1.4) * 0.24);
  const ev = EV_MAX * power * (bat.pow ?? 1) * (0.88 + rnd() * 0.15);

  // 발사각. ⌥↑ 면 올라가고 ⌥↓ 면 눌린다. 떨어지는 공(커브)은 위를 치게 되어 저절로 땅볼이 된다.
  //
  // 흩뿌림이 넓다. 정타라도 각까지 고르지는 못하는 게 야구다 — 제일 잘 맞은 공이
  // 땅볼이 되기도 하고, 빗맞은 공이 담장을 넘기도 한다. 그 어긋남이 이 경기를 만든다.
  const ang = (up ? 26 : down ? -8 : 11) + pitch.tilt + high * 7
            + (grade === 2 ? spread(24) : grade === 1 ? spread(36) : spread(46));

  // 방향. 조준이 아니라 **때**가 정한다 — 빠르면 당겨지고 늦으면 밀린다.
  // 많이 어긋날수록 더 옆으로 쏠려서, 끝에서는 파울선을 넘는다.
  // 많이 어긋날수록 **더 가파르게** 쏠린다. 이게 완만하면 파울이 거의 안 나오고,
  // 파울이 없으면 타석이 두세 개 공에 끝나 버려 「버티기」가 사라진다.
  const over = Math.max(0, acc - 6);
  // **타자마다 치는 쪽이 있다.** 당겨 치는 타자는 3루 쪽으로 쏠린다.
  const deg = err * 3.6 + Math.sign(err) * over * over * 0.75 + side * 9
            + (bat.pull ?? 0) * 17 + spread(6);
  // **뒤로 걷어 내는 파울.** 각도만으로 가르면 파울이 5%밖에 안 나오고, 그러면 타석이
  // 공 두세 개에 끝난다 — 볼넷이 아예 안 나오고 삼진도 거의 안 나온다. 실제 야구에서
  // 파울은 투구의 17%다. 빗맞을수록 뒤로 가기 쉽다.
  const tipped = rnd() < (acc / reach) ** 1.7 * 0.72;
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
function chase(deg, path, t0, t1, shift = 0) {
  let best = null;
  POSTS.forEach((_, i) => {
    const post = postAt(i, shift);
    let ease = -99, meet = null;
    for (let t = t0; t <= t1 + 1e-9; t += 0.05) {
      const ft = path(t);
      const need = runSecs(ftDist(post.deg, post.ft, deg, ft), OUTFIELD.includes(i));
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
function runTo(from, ballAt, ballDeg, ballFt, most, first, toFirst = BASE_RUN) {
  // 수비가 「던질까 말까」 망설이는 몫. 공이 멀수록 중계를 한 번 더 거치고, 그만큼 늦는다.
  // 담장까지 굴러간 공에 주자가 2루를 밟는 건 발이 빨라서가 아니라 이 망설임 때문이다.
  const lag = 0.35 + ballFt / 240;
  let at = from;
  for (let step = 1; step <= 4; step++) {
    const want = from + step;
    if (want > most) break;
    const arrive = (first ? toFirst : FROM_BASE) + (step - 1) * NEXT_BASE;
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
  p.far = Math.round(f.range * 0.3048);
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
  // **치자마자 안다.** 「홈런!」이 공이 담장에 닿을 때야 떴더니, 그 전 3초 동안 화면에서
  // 아무 일도 안 일어났다 — 타자는 사라지고 공은 점만 해지고 점수판은 그대로였다.
  // 넘어갈 것을 먼저 알려 주고, 넘어가는 순간 한 번 더 크게 띄운다.
  p.calls.push({ t: 0.55, text: '넘어간다!', big: false });
  p.calls.push({ t: Math.max(1.2, f.hang * 0.78), text: `홈런!  ${p.far}m`, big: true });
  p.label = `홈런 (${runners.length}점)`;
  p.record = 'HR';
  p.over = f.hang + 1.4;
  return p;
}

/// 친 공이 그라운드 안에 떨어졌다. 여기서부터가 이 게임의 속살이다.
///
/// 규칙은 **하나**다. 「공이 그 루에 먼저 닿나, 주자가 먼저 닿나.」 내야 땅볼도, 외야에
/// 빠진 안타도, 병살도 전부 이 한 줄에서 나온다. 「이 경우엔 2루타」 같은 표를 만들면
/// 경우가 하나 늘 때마다 표를 고쳐야 하고, 고치다 보면 반드시 앞뒤가 어긋난다.
function inPlay(hit, state) {
  const { onBase, outs } = state;
  const shift = state.shift ?? 0;
  // **발.** 타자마다 1루까지 걸리는 시간이 다르다 — 내야 안타와 병살이 여기서 갈린다.
  const TO_FIRST = BASE_RUN + (state.leg ?? 0);
  const f = flightOf(hit.ev, hit.ang);
  const grounder = hit.ang <= 2 || f.range < 26;
  const wall = fenceFt(hit.deg);

  // ① 공의 길. 뜬 공은 떨어질 때까지 날고 그 뒤로 구른다. 담장에 맞으면 거기서 떨어진다.
  let land = grounder ? 0 : f.range;
  let hang = grounder ? 0 : f.hang;
  // 굴러가는 공은 방망이에 맞은 속도 그대로 안 간다 — 한 번 튀는 데서 크게 죽는다.
  const drag = grounder ? ROLL_DIRT : ROLL_GRASS;
  let rollV = grounder
    ? Math.max(20, hit.ev * Math.cos(clamp(hit.ang, -16, 0) * RAD) * 0.84)
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
  // 친 순간 타구 이름부터 외친다. 결과는 그 뒤에 덮어쓴다.
  p.calls.push({ t: 0.05, text: KIND_WORD[kind] ?? '타구', big: false });
  const path = (t) => (t < hang ? alongPts(f.pts, t)[0]
    : Math.min(wall - 2, land + rollFt(rollV, t - hang, drag)));

  // ② **닿나.** 뜬 공은 떨어지는 한 점에서만 잡을 수 있다. 담장 맞은 공은 못 잡는다.
  const hard = kind === 'liner' && hit.ev > 96;
  const air = !grounder && !offWall && hang > 0.35 ? chase(hit.deg, () => land, hang, hang, shift) : null;
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
    const got = chase(hit.deg, path, Math.max(0.25, hang), Math.min(tEnd, 7), shift);
    if (got) {
      who = got.i; ballFt = got.ft; ease = got.ease;
      ballAt = got.t + (got.ft > INFIELD_FT ? PICKUP : PICKUP_IN);
    }
    else {
      let near = 0, bestD = 1e9;
      POSTS.forEach((_, i) => {
        const post = postAt(i, shift);
        const d = ftDist(post.deg, post.ft, hit.deg, stopFt);
        if (d < bestD) { bestD = d; near = i; }
      });
      who = near; ballFt = stopFt;
      ballAt = Math.max(tEnd, runSecs(bestD, OUTFIELD.includes(near))) + PICKUP;
    }
  }

  // ④ 잡다 흘렸다. 뜬 공은 위에서 이미 봤으니 굴러온 공만 다시 본다.
  let muff = false;
  if (!caught && !fumble && ease !== null && rnd() > catchOdds(ease, rollV > 108)) {
    muff = ease > 0.45;                            // 편하게 오던 공만 실책으로 적는다
    ballAt += 1.0;
  }

  // ⑤ 공을 따라가는 수비수 그림.
  // **몸을 던진다.** 여유가 거의 없이 겨우 닿은 공은 서서 받는 게 아니다 —
  // 잡을 확률 40% 구간이 이 게임에서 제일 손에 땀 쥐는 자리인데 그림이 없었다.
  // 기획서의 「달리면서 뻗어 · 몸을 던져서」 두 칸(여유 0.25초 아래)에서 몸을 던진다.
  const dive = ease !== null && ease < 0.25 ? Math.max(0.3, (caught || fumble) ? hang : ballAt) : null;
  p.men.push({ i: who, t0: REACT, t1: Math.max(REACT + 0.1, ballAt),
               deg: hit.deg, ft: ballFt, dive, shift });
  p.hops.push(...ballTrack(hit.deg, f, hang, land, rollV, drag, ballAt, ballFt, caught));

  // 얼마나 갔나. 뜬 공은 떨어진 자리, 땅볼은 굴러가 멎은 자리 — 사람은 미터로 센다.
  p.far = Math.round(Math.max(land, ballFt, 0) * 0.3048);

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
    // **타자도 1루로 뛴다.** 잡히면 거기서 멎는다 — 안 그리면 친 사람이 공중에서 사라진다.
    p.runs.push({ from: 0, to: 1, t0: LEAVE, t1: TO_FIRST, out: true, outAt: hang + 0.1 });
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
    // 잡은 공을 되돌려 보낸다. 점수가 들어왔으면 홈으로, 아니면 마운드로.
    const back = scored ? BASES[0] : [0, MOUND_FT];
    const dist = ftDist(hit.deg, ballFt, back[0], back[1]);
    addThrow(p, [hit.deg, ballFt], back, hang + 0.35,
             hang + 0.35 + TRANSFER + dist / THROW, scored ? CATCHER : undefined);
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
    addThrow(p, [hit.deg, ballFt], pivot, ballAt, leadT, guard);
    if (made === 2) addThrow(p, pivot, firstBase, leadT + PIVOT, dpT, baseGuard(1));
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
    addThrow(p, [hit.deg, ballFt], BASES[1], ballAt, firstT, baseGuard(1));
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
      r.at = Math.max(first ? 1 : r.from,
                      runTo(r.from, ballAt, hit.deg, ballFt, first ? 3 : 4, first, TO_FIRST));
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
    // 안타라도 **던지기는 한다.** 제일 앞선 주자보다 한 루 앞으로 — 더 못 가게 붙잡는 송구다.
    const lead2 = Math.max(...crew.map((r) => Math.min(r.at, 3)));
    const hold = (lead2 + 1) % 4;
    addThrow(p, [hit.deg, ballFt], BASES[hold], ballAt,
             ballAt + throwTime(hit.deg, ballFt, hold), baseGuard(hold));
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

/// **송구 한 줄.** 공이 잡힌 자리에서 그 루까지 날아가고, 그 루를 지키는 사람이 미리 가 선다.
///
/// 이게 없으면 수비수가 공을 잡은 채로 가만히 서 있고 판만 끝난다 — 실제로 그렇게 만들어
/// 놓고 보니 「잡고 안 던진다」가 제일 먼저 눈에 띄었다. 결말은 이미 정해져 있으니
/// 여기서 하는 일은 **정해진 결말을 눈에 보이게 옮기는 것**뿐이다.
function addThrow(p, from, to, t0, t1, cover) {
  const end = Math.max(t0 + 0.12, t1);
  p.hops.push({ k: 'throw', t0, t1: end, a: from, b: to });
  p.hops.push({ k: 'rest', t0: end, t1: 99, deg: to[0], ft: to[1], z: 3.2 });
  // 루를 지키는 사람은 **던지기 전에** 가 있어야 한다. 공보다 늦게 가면 허공에 꽂힌다.
  // 한 사람에게 길을 두 번 주지 않는다 — 공을 쫓던 사람이 그 루도 지키면 순간이동한다.
  if (cover !== undefined && cover !== null && !p.men.some((m) => m.i === cover)) {
    p.men.push({ i: cover, t0: 0.12, t1: Math.max(0.5, t0 - 0.15), deg: to[0], ft: to[1] });
  }
  p.over = Math.max(p.over, end + 0.7);
  return end;
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
/// 판이 도는 동안 **제자리에 서 있는 주자**가 누구인가 (루 번호 1~3).
/// 대본에 줄이 없는 사람 = 안 움직이는 사람이고, 그 사람도 화면에 있어야 한다.
export function standers(b) {
  if (!b.play) return [];
  const moving = new Set((b.play.runs ?? []).map((r) => r.from));
  return b.onBase.map((on, i) => (on && !moving.has(i + 1) ? i + 1 : 0)).filter(Boolean);
}

export function ballAt(play, t) {
  let last = [0, 0, 2];
  for (const h of play.hops) {
    if (t < h.t0) break;
    const u = Math.min(t, h.t1) - h.t0;
    if (h.k === 'fly') { const [ft, z] = alongPts(h.pts, u); last = [h.deg, ft, z]; }
    else if (h.k === 'roll') last = [h.deg, h.ft0 + rollFt(h.v, u, h.g ?? ROLL_DIRT), 0.6];
    else if (h.k === 'rest') last = [h.deg, h.ft, h.z];
    else if (h.k === 'throw') {
      // 던진 공은 곧게 날아가되 가운데가 살짝 뜬다. 땅에 붙여 그리면 굴러가는 것과 안 갈린다.
      const k = clamp(u / Math.max(0.05, h.t1 - h.t0), 0, 1);
      const a = flat(h.a[0], h.a[1]);
      const c = flat(h.b[0], h.b[1]);
      const [deg, ft] = polar(lerp(a[0], c[0], k), lerp(a[1], c[1], k));
      last = [deg, ft, 3.2 + Math.sin(k * Math.PI) * 11];
    }
  }
  return last;
}

// ── 게임 ──────────────────────────────────────────────────────────────────

function freshBag() {
  return {
    inn: 1, half: 0, outs: 0, balls: 0, strikes: 0,
    score: [0, 0], onBase: [null, null, null],
    log: [],                          // 한 타석마다 한 줄
    aim: { x: 0, y: 0 }, type: 0, shift: 0, hitBy: 0,
    // **타자의 미트.** 게임빌·컴투스 프로야구가 그랬듯 **치는 쪽도 조준한다** —
    // 투수가 코스를 고르고 타자가 미트를 놓는다. 둘의 어긋남이 곧 타구의 질이다.
    mitt: { x: 0, y: 0 }, stand: 0,
    // 던진 공 기록 — 배합을 읽는 자리. 공수 교대 때 지운다.
    thrown: [],
    pitch: null, play: null, seq: 0, seen: -1,
    wait: 1.6, call: null, note: null,
    started: false, over: false, winner: null,
    sides: new Map(),
    // 기록지 — 이닝별 득점 · 안타 · 실책. 판이 끝나면 이걸로 한 장이 된다.
    lines: [[], []], hits: [0, 0], errs: [0, 0],
    // 타순 아홉 — 씨앗 하나로 양쪽이 같은 명단을 만든다.
    seed: (Math.random() * 1e9) | 0, order: null, upNext: [0, 0],
    // 컴퓨터가 대신할 때 미리 정해 두는 것.
    ai: null, aiSwing: null,
    // 손님에게 한 번만 보낼 대본.
    fresh: null,
  };
}

/// 이번 타석을 끝내고 다음 타자를 세운다.
function nextBatter(world, b, line) {
  const side = batSide(b);
  const me = atBat(b);
  b.log.push({ ...line, no: me.no });
  b.upNext[side] = ((b.upNext[side] ?? 0) + 1) % 9;      // 다음 타자
  if (b.log.length > 40) b.log.shift();
  b.balls = 0; b.strikes = 0;
  b.pitch = null; b.play = null;
  b.wait = 1.5;
  b.mitt = { x: 0, y: 0 };          // **새 타자는 가운데서 시작한다** — 앞사람이 놓은 자리를 물려받지 않는다
  b.stand = 0;
  b.clock = null;
  b.ai = null; b.aiSwing = null;
  if (b.outs >= 3) halfOver(world, b);
  else checkWalkOff(world, b);
}

/// 공수 교대.
function halfOver(world, b) {
  // 이닝별 득점을 적어 둔다. 기록지의 한 칸이다.
  const bat = batSide(b);
  (b.lines[bat] ??= [])[b.inn - 1] = b.halfRuns ?? 0;
  b.halfRuns = 0;
  b.outs = 0;
  b.onBase = [null, null, null];
  b.thrown = [];
  b.shift = 0;
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
///
/// **그냥 끝내지 않는다.** 야구에서 제일 큰 장면이라 이름을 붙여 주고 화면을 흔든다 —
/// 조용히 점수만 바뀌고 끝나면 무엇이 일어났는지 모른 채 판이 닫힌다.
function checkWalkOff(world, b) {
  if (b.half !== 1 || b.inn < INNINGS) return;
  if (b.score[0] <= b.score[1]) return;
  b.walkOff = true;
  say(b, '끝내기!', true);
  world.shake = 1;
  finish(world, b);
}

function finish(world, b) {
  if (b.over) return;
  b.over = true;
  // 마지막 회의 득점도 기록지에 적는다 — **그 회가 실제로 돌고 있었을 때만.**
  // 끝내기와 「말 생략」이 여기를 지나는데, 조건 없이 적었더니 시작도 안 한 회가
  // 0 으로 한 칸 생겨서 기록지에 빈 이닝이 붙었다.
  const bat = batSide(b);
  const running = b.outs > 0 || (b.halfRuns ?? 0) > 0 || b.onBase.some(Boolean);
  if (running) (b.lines[bat] ??= [])[b.inn - 1] = b.halfRuns ?? 0;
  const home = b.score[0], away = b.score[1];
  b.winner = home === away ? null : home > away ? 0 : 1;
  b.note = home === away ? '무승부'
    : `${b.walkOff ? '끝내기 — ' : ''}${TEAM_NAME[b.winner]} 승 ${Math.max(home, away)}:${Math.min(home, away)}`;
  world.onGameOver?.({
    name: b.winner === null ? null : `${TEAM_NAME[b.winner]} 편`,
    side: b.winner ?? 0, rows: [],
  });
}

/// 던진 공 하나를 적어 둔다. 배합은 읽으라고 있는 것이지 숨길 것이 아니다 —
/// 실제로도 타자와 포수가 다 보고 센다. 공수 교대 때 지운다.
const PITCH_BALL = 0, PITCH_STRIKE = 1, PITCH_PLAY = 2, PITCH_MISS = 3, PITCH_FOUL = 4;
function logPitch(b, res) {
  const p = b.pitch;
  if (!p) return;
  b.thrown.push({ t: p.type, x: clamp(p.ax, -AIM_OUT, AIM_OUT),
                  y: clamp(p.ay, -AIM_OUT, AIM_OUT), r: res });
  if (b.thrown.length > 8) b.thrown.shift();
}

/// 한 점 넣는다.
function addRun(b, n) {
  if (!n) return;
  b.score[batSide(b)] += n;
  b.halfRuns = (b.halfRuns ?? 0) + n;
}

/// 스트라이크 하나.
function strike(world, b, why) {
  logPitch(b, why === '스트라이크' ? PITCH_STRIKE : PITCH_MISS);
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
  logPitch(b, PITCH_BALL);
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
/// **네모로 겨눈다.** 존은 네모인데 조준을 동그라미로(반지름 하나로) 잡으면, 「뺀다」고
/// 고른 공의 절반이 모서리를 피해 존 안으로 들어온다. 재 보니 뺀 공의 47%가 스트라이크였다.
function aiPitch(b) {
  const type = rnd() < 0.44 ? 0 : 1 + ((rnd() * 3) | 0);
  const behind = b.balls >= 3 || (b.balls === 2 && b.strikes === 0);
  const ahead = b.strikes === 2 && b.balls < 2;
  // **겨누는 자리만 정한다.** 실제로 어디로 가는지는 startPitch 의 제구가 정한다 —
  // 사람이든 컴퓨터든 같은 손잡이를 쓴다. 여기서 또 흔들면 두 번 흔들린다.
  //
  // 불리하면 한가운데, 유리하면 존 언저리, 나머지는 그 사이.
  // **불리해도 한가운데로만 넣지는 않는다.** 3볼에서 무조건 스트라이크를 넣게 뒀더니
  // 볼넷이 한 번도 안 나왔다 — 진짜 투수도 3볼에서 서너 번에 한 번은 또 뺀다.
  if (behind) {
    if (rnd() < 0.24) {                              // 또 뺀다
      const far = (1.08 + rnd() * 0.27) * (rnd() < 0.5 ? -1 : 1);
      const near = rnd() * 1.7 - 0.85;
      const side = rnd() < 0.55;
      return { type, x: clamp(side ? far : near, -AIM_OUT, AIM_OUT),
               y: clamp(side ? near : far, -AIM_OUT, AIM_OUT) };
    }
    const a2 = rnd() * Math.PI * 2, r2 = rnd() * 0.5;   // 한가운데
    return { type, x: Math.cos(a2) * r2, y: Math.sin(a2) * r2 };
  }
  // **넣을까 뺄까를 먼저 고른다.** 진짜 투수도 「이 공은 뺀다」를 정하고 던진다.
  //
  // 자리는 **네모로** 고른다. 동그랗게(반지름으로) 골랐더니 반지름 1.2 로 빼도 절반은
  // 존 안으로 들어왔다 — 존은 네모인데 조준이 동그라미라 모서리가 안 맞는다.
  // 그래서 존 안이 70%가 되고 볼넷이 한 번도 안 나왔다.
  const out = rnd() < (ahead ? 0.78 : 0.54);
  let x, y;
  if (out) {
    const far = (1.08 + rnd() * 0.27) * (rnd() < 0.5 ? -1 : 1);
    const near = rnd() * 1.7 - 0.85;
    if (rnd() < 0.55) { x = far; y = near; } else { x = near; y = far; }
  } else {
    x = rnd() * 1.7 - 0.85;
    y = rnd() * 1.7 - 0.85;
  }
  return { type, x: clamp(x, -AIM_OUT, AIM_OUT), y: clamp(y, -AIM_OUT, AIM_OUT) };
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
  const me = atBat(b);
  const end = pitchEnd(pitch, L);
  const z = zone(L);
  const inZone = Math.abs(end.x - z.cx) < z.w / 2 + 4 && Math.abs(end.y - z.cy) < z.h / 2 + 4;
  const chase = !inZone && rnd() < (b.strikes === 2 ? 0.34 : 0.17);
  if (!inZone && !chase) return null;
  if (inZone && rnd() < 0.38) return null;              // 좋은 공도 그냥 보낸다
  // 직구를 제일 많이 노린다. 두 스트라이크면 변화구까지 생각한다.
  const guess = rnd() < (b.strikes === 2 ? 0.45 : 0.62) ? 0 : 1 + ((rnd() * 3) | 0);
  // 눈 좋은 타자는 손이 덜 떨린다.
  const err = guessErr(guess, pitch.type, 10 - (me.eye ?? 0) * 1.1);
  // **컴퓨터도 미트를 놓는다.** 눈이 좋을수록 공이 올 자리를 잘 짚는다 —
  // 안 놓아 두면 컴퓨터는 늘 한가운데만 노리는 셈이라 구석 공에 손도 못 댄다.
  const read = READ_MISS - (me.eye ?? 0) * 0.12;
  const mitt = { x: clamp(pitch.ax + gauss() * read, -MITT_OUT, MITT_OUT),
                 y: clamp(pitch.ay + gauss() * read, -MITT_OUT, MITT_OUT) };
  return { err, mitt, up: mitt.y > SWING_TILT, down: mitt.y < -SWING_TILT };
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
  // **겨눈 자리가 곧 도착 자리다.** 떨어지고 휘는 것은 **오는 길**에서만 일어나고,
  // 홈에 닿을 때는 겨눈 그 자리에 온다.
  //
  // 전에는 떨어지는 몫·휘는 몫을 도착 자리에 더해 두고 던지는 쪽이 그만큼 미리 빼서 겨눴다.
  // 그러면 조준 한계(존 한 겹 밖)와 보정이 서로 물려서 **커브는 존 밖으로 겨눌 수가 없었다** —
  // 0.7 을 미리 빼야 하는데 한계가 1.35 라 실제로는 0.65 까지밖에 못 나간다.
  // 그래서 존 안 비율이 63% 에서 안 내려가고 볼넷이 한 번도 안 나왔다.
  return { x: z.cx + pitch.ax * z.w / 2, y: z.cy - pitch.ay * z.h / 2 };
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
  //
  // **크게 휘어야 한다.** 도착 자리는 그대로 두고 오는 길만 부풀리는 값(BREAK_SHOW)이다.
  // 이걸 안 곱했을 때 커브가 곧은 선에서 벗어나는 폭이 존 반높이의 0.21배 — 90픽셀짜리
  // 존에서 9픽셀이었다. **구종을 넷이나 만들어 놓고 화면에서는 속도밖에 안 달랐다.**
  // 도착 자리는 겨눈 그 자리 그대로니, 부풀려도 판정은 하나도 안 바뀐다.
  const late = pitch.kind.drop * z.h * 0.5 * (u ** 3 - e) * BREAK_SHOW;
  const bend = pitch.kind.bend * z.w * 0.5 * (u ** 2.4 - e) * BREAK_SHOW;
  return {
    x: lerp(from.x, to.x, e) + bend,
    y: lerp(from.y, to.y, e) + late,
    r: lerp(5.5, 13, e),
  };
}

// ── 갱신 ──────────────────────────────────────────────────────────────────

function startPitch(world, b, L, type, ax, ay) {
  const kind = PITCHES[clamp(type | 0, 0, PITCHES.length - 1)];
  // **겨눈 자리는 존 한 겹 밖까지만.** 손님이 보낸 값이든 봇이 넣은 값이든 여기서 한 번 자른다 —
  // 이 한 줄이 없으면 터무니없는 데를 겨눠서 계속 볼을 던지는 길이 열린다.
  const tx = clamp(+ax || 0, -AIM_OUT, AIM_OUT);
  const ty = clamp(+ay || 0, -AIM_OUT, AIM_OUT);
  // **겨눈 자리와 가는 자리는 다르다.** 여기서 한 번 흔들고, 그 뒤로는 그대로 날아간다.
  const wx = clamp(tx + gauss() * WILD, -AIM_OUT - 0.55, AIM_OUT + 0.55);
  const wy = clamp(ty + gauss() * WILD, -AIM_OUT - 0.55, AIM_OUT + 0.55);
  b.pitch = {
    type: clamp(type | 0, 0, PITCHES.length - 1), kind, ax: wx, ay: wy, aimX: tx, aimY: ty,
    t: -PITCH_TIME * PITCH_RELEASE,        // 팔이 도는 동안은 아직 손에 있다
    dur: kind.dur, plate: Math.round(kind.dur / FR),
    done: false, wind: PITCH_TIME,
  };
  b.seq++;
  b.clock = null;
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
  // **공이 미트에서 얼마나 어긋났나.** 자리 그 자체가 아니라 **어긋남**이다 —
  // 미트를 그 자리에 놓았으면 구석 공도 한가운데처럼 맞고, 한가운데 공도 미트가
  // 딴 데 있으면 빗맞는다. 게임빌·컴투스의 수싸움이 이 한 줄에 있다.
  const mitt = b.mitt ?? { x: 0, y: 0 };
  const spot = { side: p.ax - mitt.x, high: p.ay - mitt.y };
  const me = atBat(b);
  const hit = contact(err, up, down, p.kind, spot, me);
  b.spotWord = spotName(spot);
  b.swungAt = { err, at: world.elapsed };
  if (!hit) {
    // 헛스윙. 왜 빗나갔는지 알려 준다 — 배구의 「늦다/멀다/낮다」와 같은 자리다.
    strike(world, b, err < 0 ? '헛스윙 — 빨랐다' : '헛스윙 — 늦었다');
    return true;
  }
  b.batWord = err === 0 ? '정확' : `${Math.abs(err)}프레임 ${err < 0 ? '빨랐다' : '늦었다'}`;
  launch(world, b, L, hit, me);
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

/// 들어온 자리를 사람 말로. 휘두른 뒤 화면에 한 줄로 뜬다 — 왜 그 방향으로 갔는지 알아야
/// 다음에 조준이 뜻을 갖는다.
/// 공이 **미트에서 어느 쪽으로 어긋났나.** 자리 이름이 아니라 어긋난 쪽이다 —
/// 다음 공에 미트를 어디로 옮길지가 여기서 나온다.
function spotName(spot) {
  const side = spot.side < -0.55 ? '몸쪽' : spot.side > 0.55 ? '바깥쪽' : '';
  const high = spot.high > 0.55 ? '위' : spot.high < -0.55 ? '아래' : '';
  const both = [side, high].filter(Boolean).join('·');
  return both ? `미트에서 ${both}으로` : '미트 한복판';
}

/// 맞은 공을 판에 띄운다.
function launch(world, b, L, hit, bat = ANY_BAT) {
  const p = resolveHit(hit, { onBase: b.onBase, outs: b.outs, leg: bat.leg ?? 0,
                              shift: b.shift ?? 0 });
  p.hitWord = b.batWord;
  p.grade = hit.grade;
  p.ev = Math.round(hit.ev);
  p.ang = Math.round(hit.ang);
  logPitch(b, p.foul ? PITCH_FOUL : PITCH_PLAY);
  b.play = p;
  b.fresh = p;                              // 손님에게 보낼 대본
  b.playSeq = b.seq;                        // 이 대본의 이름표 — 같은 것을 두 번 안 세운다
  b.sentAt = 0;                             // 다시 싣는 시계 (0.6초마다)
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
  // 기록지 — 안타와 실책을 센다. 끝나면 R·H·E 로 한 줄이 된다.
  if (/루타|안타|홈런/.test(p.label)) b.hits[batSide(b)]++;
  if (p.record.startsWith('E')) b.errs[fieldSide(b)]++;
  nextBatter(world, b, { r: p.record, t: p.label + (p.runs2 ? ` · ${p.runs2}점` : '') });
}

// ── 그리기 도우미 ─────────────────────────────────────────────────────────

/// 주자가 t 에 어디쯤 있나 — [각도, 거리].
export function runnerAt(r, t) {
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
///
/// **달리는 속도로 간다.** 처음엔 구간 전체를 부드럽게 늘였는데(smooth), 그러면 공이 멀리
/// 갈수록 같은 거리를 더 오래 걸려 가서 **공이 멈출 때까지 안 움직이는 것처럼** 보였다.
/// 사람은 늘 같은 속도로 달린다 — 먼저 닿으면 거기 서서 기다린다.
export function manAt(m, post, t) {
  const a = flat(post.deg, post.ft);
  const c = flat(m.deg, m.ft);
  const far = Math.hypot(c[0] - a[0], c[1] - a[1]);
  const secs = Math.max(0.1, far / (OUTFIELD.includes(m.i) ? RUN_OUT : RUN_FIELD));
  const k = clamp((t - m.t0) / secs, 0, 1);
  // 첫 한 걸음만 붙인다 — 멈춰 있다 갑자기 최고 속도가 되면 미끄러지는 것으로 보인다.
  const e = k < 0.18 ? (k * k) / 0.18 : k;
  return polar(lerp(a[0], c[0], e), lerp(a[1], c[1], e));
}
/// 이 길을 다 가는 데 걸리는 시간.
function manSecs(m, post) {
  const a = flat(post.deg, post.ft);
  const c = flat(m.deg, m.ft);
  const top = OUTFIELD.includes(m.i) ? RUN_OUT : RUN_FIELD;
  return Math.max(0.1, Math.hypot(c[0] - a[0], c[1] - a[1]) / top);
}
/// 화면에서 어느 쪽으로 가고 있나 (−1 왼쪽 · 1 오른쪽). 팔다리가 향할 쪽을 이걸로 정한다.
/// 극좌표의 각도로 정하면 1루에서 2루로 가는 주자가 **뒤로 달리는 것처럼** 보인다 —
/// 각도는 오른쪽(+)인데 화면에서는 왼쪽으로 가고 있기 때문이다.
export function facingOf(L, at, t, back = 0.12) {
  const [ax] = spot(L, ...at(Math.max(0, t - back)));
  const [bx] = spot(L, ...at(t));
  return bx - ax > 0.6 ? 1 : bx - ax < -0.6 ? -1 : 0;
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
    ['⌥ 1 · 2 · 3 · 4', '직구 · 슬라이더 · 커브 · 체인지업'],
    ['⌥ Space', '던진다 / 휘두른다'],
    ['⌥ ← → ↑ ↓', '미트 — 칠 자리를 고른다 (칠 때). 내 화면에만 보인다'],
    ['미트 위', '띄워 치기 — 뜬공과 홈런'],
    ['미트 아래', '눌러 치기 — 빠른 땅볼'],
    ['미트 몸쪽', '홈에 붙어 선다 — 바깥쪽이 닿는 대신 몸에 맞는다'],
    ['⌥ 5', '수비 시프트 — 보통 / 당김 / 밀어침 (던질 때)'],
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
  /// **고르는 순간 방을 연다.** 혼자서도 되지만 둘이 하는 게 본디 모습이라, 코드를 불러
  /// 주기만 하면 상대가 들어온다. 기다리는 동안은 컴퓨터가 상대를 해 준다.
  opensRoom: true,
  /// **판 도중에 들어와도 바로 낀다.** 한 판이 5분인데 다음 판까지 구경만 시키면, 그동안
  /// 그 사람 자리를 컴퓨터가 대신 친다 — 실제로 「내가 아무것도 안 했는데 스윙한다」가 됐다.
  /// 타석은 한 타자마다 새로 열리니 도중에 껴도 불공평할 것이 없다.
  joinsAnytime: true,

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
    // ⌥5 — 수비 시프트를 한 칸 돌린다 (보통 → 당김 → 밀어침 → 보통).
    if ((n | 0) === 5) {
      b.shift = b.shift === 0 ? -1 : b.shift === -1 ? 1 : 0;
      say(b, SHIFT_NAME[b.shift === 0 ? 0 : b.shift < 0 ? 1 : 2], false);
      if (world.mp.on && world.mp.role !== 'host') world.send?.({ t: 'gm', k: 'shift', n: b.shift });
      return;
    }
    const want = clamp((n | 0) - 1, 0, PITCHES.length - 1);
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
      // **띄워 칠지 눌러 칠지는 미트가 정한다.** 방향키를 스윙 옵션으로도 쓰면 미트를 위로
      // 올리는 동안 저절로 띄워 치기가 되어 두 조작이 서로 물린다 — 미트 하나로 모은다.
      const up = b.mitt.y > SWING_TILT, down = b.mitt.y < -SWING_TILT;
      if (world.mp.role === 'guest') {
        world.send?.({ t: 'gm', k: 'swing', f: frame, u: up ? 1 : 0, d: down ? 1 : 0,
                       s: Math.round(b.mitt.x * 100), v: Math.round(b.mitt.y * 100) });
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
    if (!b.order) b.order = makeOrder(b.seed);

    // 판정 글자와 자국은 판이 도는 것과 상관없이 사그라든다.
    if (b.call) { b.call.t += dt; if (b.call.t > b.call.life) b.call = null; }
    if (b.batT > 0) b.batT = Math.max(0, b.batT - dt);
    if (b.hitBy > 0) b.hitBy = Math.max(0, b.hitBy - dt);
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
    // 타석에서 한 발. 홈에 붙어 서면 바깥쪽 공이 닿고 몸쪽에 막힌다 — 조준하는 쪽과
    // 치는 쪽이 **같은 한 줄(몸쪽↔바깥쪽)을 서로 당긴다.** 공이 날아오는 중에도 움직인다.
    if (amBatting(world) && !b.play && !b.over) {
      const dx = (world.input.right ? 1 : 0) - (world.input.left ? 1 : 0);
      const dy = (world.input.jump ? 1 : 0) - (world.input.duck ? 1 : 0);
      if (dx) b.mitt.x = clamp(b.mitt.x + dx * MITT_STEP * dt, -MITT_OUT, MITT_OUT);
      if (dy) b.mitt.y = clamp(b.mitt.y + dy * MITT_STEP * dt, -MITT_OUT, MITT_OUT);
      // 몸쪽을 노리면 저절로 홈에 붙어 선다 — 바깥쪽이 닿는 대신 몸에 맞는다.
      b.stand = clamp(-b.mitt.x, -1, 1);
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
    // 투구 시계. 던질 수 있는 동안에만 돌고, 다 가면 볼 하나가 된다.
    if (!b.pitch && !b.play && b.wait <= 0 && humanOn(world, fieldSide(b))) {
      if (!(b.clock > 0)) b.clock = clockFor(b);
      b.clock -= dt;
      if (b.clock <= 0) {
        b.clock = null;
        say(b, '투구 시계 — 볼', false);
        ballFour(world, b);
        return;
      }
    } else if (b.pitch || b.play) b.clock = null;
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
      // 맞은 사람은 **움찔한 다음에** 1루로 간다. 그 자리에서 바로 내보내면 홈에서
      // 움츠리고 있는 사람이 1루에도 서 있게 된다 — 한 사람이 두 군데 있다.
      if (p.hbp) {
        if (b.hitBy <= 0.22) { p.hbp = false; walkTo(world, b, '몸에 맞는 공', 'HBP'); }
        return;
      }
      // 컴퓨터가 치는 쪽이면, 공이 날아간 순간 언제 휘두를지 정해 둔다.
      if (b.aiSwing === undefined) {
        b.aiSwing = humanOn(world, batSide(b)) ? null : aiSwing(b, p, L);
      }
      if (b.aiSwing && !p.done && p.t >= (p.plate + b.aiSwing.err) * FR) {
        if (b.aiSwing.mitt) { b.mitt = { ...b.aiSwing.mitt }; b.stand = clamp(-b.mitt.x, -1, 1); }
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
        // 홈에 붙어 설수록 더 맞는다 — 바깥쪽 공을 얻는 값이다.
        if (side < -(HBP_AT - (b.stand ?? 0) * HBP_CROWD)) {
          say(b, '몸에 맞는 공!', true);
          world.shake = 0.9;
          b.hitBy = 0.6;                            // 타자가 움찔하는 시간
          p.hbp = true;                             // 걸어 나가는 건 움찔한 **다음**
          b.wait = 1.4;
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
      // 컴퓨터도 타자 성향을 읽고 시프트를 건다 — 늘 맞히지는 않는다.
      const pull = atBat(b).pull ?? 0;
      b.shift = Math.abs(pull) < 0.45 || rnd() < 0.3 ? 0 : (pull < 0 ? -1 : 1);
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
    for (const m of b.play?.men ?? []) if (!moving.has(m.i)) moving.set(m.i, m);

    const batter = humanOn(world, batSide(b));
    const pitcherMan = humanOn(world, fieldSide(b));
    const batTint = TEAM_INK[batSide(b)];
    const fieldTint = TEAM_INK[fieldSide(b)];

    // 수비 시프트. 판이 도는 중에는 **대본에 적힌 것**을 쓴다 — 그 사이에 바꿔도 안 흔들린다.
    const shift = b.play ? (b.play.men[0]?.shift ?? 0) : (b.shift ?? 0);
    POSTS.forEach((_, i) => {
      const post = postAt(i, shift);
      const leg = moving.get(i);
      const [deg, ft] = leg ? manAt(leg, post, t) : [post.deg, post.ft];
      // 달리는 쪽을 보게 한다. 안 움직이면 가운데(홈 쪽)를 본다.
      const face = leg ? facingOf(L, (tt) => manAt(leg, post, tt), t) : 0;
      const mine = i === PITCHER && pitcherMan?.mine;
      // **몸을 던진다.** 겨우 닿는 공은 서서 받지 않는다.
      const dive = leg?.dive != null && t > leg.dive - 0.3 && t < leg.dive + 0.55
        ? Math.max(0.02, 0.42 * (1 - (t - (leg.dive - 0.3)) / 0.85)) : 0;
      const p = puppet(0, 0, {
        facing: face || (Math.sin(deg * RAD) >= 0 ? -1 : 1),
        glove: 1,
        stance: 0,
        slide: dive, slideDir: face || 1,
        // 공이 떠 있는 동안은 **마지막 자세로 붙잡아 둔다.** 팔이 도는 시간(wind)이 0 이 되는
        // 때는 공을 놓고 0.09초 뒤인데, 거기서 놓아 버리면 공이 아직 날아가는 중에 투수가
        // 팔을 한 프레임에 40도 튕기며 서 있는 자세로 돌아가고 글러브도 사라졌다.
        pitchT: i === PITCHER && b.pitch ? Math.max(0.001, b.pitch.wind) : 0,
        grip: b.pitch ? b.pitch.type : b.type,
        crouch: i === CATCHER ? 1 : 0,
        vx: leg && t > leg.t0 && t < leg.t0 + 0.15 + manSecs(leg, post) ? 260 : 0,
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
    // 타석에 남겨 두고, 주자는 그 뒤에 걸어 나간다.
    //
    // 경계는 **주자가 홈을 떠나는 때(LEAVE)** 다. BAT_TIME(0.34)으로 재고 있었는데
    // LEAVE 는 0.3 이라, 그 틈 2.4프레임 동안 타석의 타자와 뛰어나가는 주자가 **둘 다**
    // 그려졌다 — 한 사람이 두 군데 있었다.
    const showBatter = !b.play || b.play.foul || b.play.t < LEAVE;
    if (showBatter) {
      const bp = puppet(0, 0, {
        facing: 1, stance: b.hitBy > 0 ? 0 : 1, batT: b.batT ?? 0,
        // 맞으면 몸을 웅크린다. 한 줄 글자보다 이게 먼저 보인다.
        crouch: b.hitBy > 0 ? Math.min(1, b.hitBy / 0.25) : 0,
        danger: b.hitBy > 0,
        walk: 0,
      });
      const [bx, by] = spot(L, 0, 0);
      rows.push({ ft: -2, draw: () => {
        bp.x = bx - 46 + (b.stand ?? 0) * 26; bp.groundY = by + 4;
        ctx.save();
        drawStickman(ctx, bp, time, boil, {
          bat: true, color: batTint, name: batter?.name ?? null,
          mine: !!batter?.mine, crown: !!batter?.crown,
        });
        ctx.restore();
      } });
    }

    // 주자.
    //
    // **대본에 줄이 없는 주자도 그려야 한다.** 태그업을 안 한 주자, 안 밀린 주자는 runs 에
    // 안 들어가는데 그 갈래를 안 그렸더니 **판이 도는 동안 사람이 통째로 사라졌다** —
    // 내야 뜬공이면 열에 아홉, 인플레이 전체의 다섯에 하나였고, 제일 긴 것은 11초였다.
    // 1루 주자를 두고 뜬공이 잡히면 그 사람이 몇 초 동안 없어졌다가 끝나는 순간 1루에
    // 다시 나타났다. **아직 안 뛴 주자**(t < t0)도 같다 — 제자리에 세워 둔다.
    for (const at of standers(b)) {
      const [deg, ft] = BASES[at];
      const rp = puppet(0, 0, { facing: 1, walk: 0 });
      rows.push({ ft, draw: () => drawAt(ctx, L, deg, ft, rp, time, boil, { color: batTint }) });
    }
    for (const r of b.play?.runs ?? []) {
      if (t < r.t0) {
        if (r.from === 0) continue;                 // 타자는 타석에 이미 서 있다
        const [deg, ft] = BASES[r.from];
        const rp = puppet(0, 0, { facing: 1, walk: 0 });
        rows.push({ ft, draw: () => drawAt(ctx, L, deg, ft, rp, time, boil, { color: batTint }) });
        continue;
      }
      const gone = r.out && t > (r.outAt ?? 99);
      // 아웃된 주자는 **거기서 멎는다.** 계속 흘러가면 잡힌 뒤에도 옅어진 채 루를 돈다.
      const stop = (tt) => runnerAt(r, gone ? Math.min(tt, r.outAt) : tt);
      const [deg, ft] = stop(t);
      const rp = puppet(0, 0, { facing: facingOf(L, stop, t) || 1, vx: gone ? 0 : 260,
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
    // 존과 조준점 — **던지는 사람 화면에만.** 던진 공 기록은 둘 다 본다.
    drawThrown(ctx, L, b);
    drawZone(ctx, L, world, b, time);
    // 투구 시계 — 마운드 옆에 크게. 눈이 거기 가 있으니 숫자도 거기 있어야 한다.
    if (b.clock > 0 && !b.pitch && !b.play && !b.over) {
      const [mx, my] = spot(L, 0, MOUND_FT);
      const late = b.clock <= 5;
      const beat = late ? 0.7 + 0.3 * Math.sin(time * 9) : 1;
      text(ctx, Math.ceil(b.clock).toString(), mx + 58, my - 10, {
        font: `900 ${late ? 34 : 26}px ${MONO}`, color: late ? RED : PENCIL,
        align: 'center', alpha: beat, halo: 4,
      });
    }
    // 판정 글자.
    drawCall(ctx, L, b);
  },

  hud(ctx, hud, time, toScreen) {
    drawBoard(ctx, hud, time);
    if (hud.bag?.over) drawCard(ctx, hud);
  },

  message(world, from, msg) {
    if (world.mp.role !== 'host') return;
    const b = world.bag;
    // 편 고르기(s)는 판 밖에서도 받는다. 나머지는 **판이 돌 때만** — 안 그러면 판이
    // 야구 밖의 이유로 끝난 뒤(방장이 끝냈다거나)에도 손님 말 한 줄로 공이 날아간다.
    if (typeof msg.s !== 'number' && (world.state !== 'play' || b.over)) return;
    const side = b.sides?.get(from) ?? 0;
    if (msg.k === 'type' && side === fieldSide(b)) { b.type = clamp(msg.n | 0, 0, PITCHES.length - 1); return; }
    if (msg.k === 'shift' && side === fieldSide(b)) { b.shift = clamp(msg.n | 0, -1, 1); return; }
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
      // 타석에서 선 자리도 손님이 보내온 것을 쓴다. 내 화면의 값은 그 사람 것이 아니다.
      b.mitt = { x: clamp((+msg.s || 0) / 100, -MITT_OUT, MITT_OUT),
                 y: clamp((+msg.v || 0) / 100, -MITT_OUT, MITT_OUT) };
      b.stand = clamp(-b.mitt.x, -1, 1);
      swing(world, f, !!msg.u, !!msg.d);
      return;
    }
    if (typeof msg.s === 'number') picks(world).set(from, msg.s ? 1 : 0);
  },

  pack(world) {
    const b = world.bag;
    const fresh = b.fresh;
    b.fresh = null;
    // **대본은 한 번만 보내면 되지만, 그 한 번을 놓친 사람은 5초짜리 연기를 통째로 못 본다** —
    // 판 도중에 들어온 손님 화면에는 공도 주자도 없는 빈 그라운드만 보이다가 결과만 툭 바뀐다.
    // 0.6초마다 한 번씩 다시 싣는다. 대본 하나가 700바이트쯤이니 초당 1킬로바이트면 된다.
    if (b.play && !Number.isFinite(b.sentAt)) b.sentAt = b.play.t;   // 처음 보는 대본
    const again = !fresh && b.play && !b.play.done && b.play.t - b.sentAt >= 0.6;
    if (again) b.sentAt = b.play.t;
    return {
      c: [b.inn, b.half, b.outs, b.balls, b.strikes, b.score[0], b.score[1],
          b.onBase[0] ? 1 : 0, b.onBase[1] ? 1 : 0, b.onBase[2] ? 1 : 0, b.over ? 1 : 0],
      // 타순 — 씨앗 하나와 차례 둘이면 손님도 같은 아홉을 만든다.
      o: [b.seed, b.upNext[0] ?? 0, b.upNext[1] ?? 0],
      // 투구 시계 · 기록지 (안타 · 실책 · 이닝별 득점).
      cl: b.clock > 0 ? Math.round(b.clock * 10) : 0,
      sh: b.shift ?? 0,
      th: b.thrown.map((x) => [x.t, Math.round(x.x * 100), Math.round(x.y * 100), x.r]),
      hz: [b.hits[0], b.hits[1], b.errs[0], b.errs[1]],
      ln: b.lines,
      tm: [...rosterSides(world).entries()],
      p: b.pitch ? [b.pitch.type, Math.round(b.pitch.t * 1000), Math.round(b.pitch.ax * 100),
                    Math.round(b.pitch.ay * 100), b.pitch.done ? 1 : 0, b.seq,
                    Math.round(b.pitch.wind * 1000)] : null,
      y: b.play ? Math.round(b.play.t * 1000) : null,
      // 새 대본. 있을 때만 싣는다 — 몇 초에 한 번이라 두꺼워도 된다.
      s: fresh ? packPlay(fresh) : again ? packPlay(b.play) : undefined,
      // 대본 이름표. 같은 대본을 다시 받으면 손님은 그냥 흘린다 (판정 글자가 다시 뜬다).
      pid: b.play ? (b.playSeq ?? 0) : 0,
      q: b.seq,
      k: b.call ? [b.call.text, b.call.big ? 1 : 0, Math.round(b.call.t * 100)] : null,
      // **기록판·기록지의 글자도 손님 것이다.** 이 셋이 안 실려서 손님 화면은 최근 기록
      // 세 줄이 늘 비어 있었고, 끝난 뒤 기록지 맨 윗줄(「홈 승 3:1」)도 빈칸이었다.
      lg: b.log.slice(-3).map((r) => [r.no ?? 0, r.r, r.t]),
      nt: b.note ?? null,
      wn: b.winner === 0 || b.winner === 1 ? b.winner : -1,
      w: Math.round((b.wait ?? 0) * 100),
      bt: Math.round((b.batT ?? 0) * 1000),
      hb: Math.round((b.hitBy ?? 0) * 100),
      md: [Math.round(b.mitt.x * 100), Math.round(b.mitt.y * 100)],
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
    if (Array.isArray(data.o) && data.o.length === 3 && data.o.every(Number.isFinite)) {
      if (b.seed !== data.o[0]) { b.seed = data.o[0]; b.order = makeOrder(b.seed); }
      b.upNext = [data.o[1] % 9, data.o[2] % 9];
    }
    b.clock = Number.isFinite(data.cl) && data.cl > 0 ? data.cl / 10 : null;
    if (Number.isFinite(data.sh)) b.shift = clamp(data.sh | 0, -1, 1);
    if (Array.isArray(data.th)) {
      b.thrown = rows(data.th, 4).map((r) => ({ t: clamp(r[0] | 0, 0, PITCHES.length - 1),
                                                x: num(r[1]) / 100, y: num(r[2]) / 100,
                                                r: clamp(r[3] | 0, 0, 4) }));
    }
    if (Array.isArray(data.hz) && data.hz.length === 4 && data.hz.every(Number.isFinite)) {
      b.hits = [data.hz[0], data.hz[1]]; b.errs = [data.hz[2], data.hz[3]];
    }
    if (Array.isArray(data.ln) && data.ln.length === 2) {
      b.lines = data.ln.map((r) => (Array.isArray(r) ? r.map((v) => num(v)) : []));
    }
    if (Array.isArray(data.tm)) {
      b.sides = new Map(data.tm.filter((r) => Array.isArray(r) && r.length === 2));
      const mine = b.sides.get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) world.team = mine;
    }
    // 새 대본이 왔다.
    if (data.s && typeof data.s === 'object' && !Array.isArray(data.s)
        && !(b.play && Number.isFinite(data.pid) && b.playSeq === data.pid)) {
      b.play = unpackPlay(data.s);
      b.play.t = num(data.y) / 1000;
      b.playSeq = Number.isFinite(data.pid) ? data.pid : null;
      // 이미 지나간 자리의 판정 글자는 다시 안 띄운다 — 늦게 받은 대본이 「뜬공」을
      // 처음부터 다시 외치면 판이 뒤로 감긴 것처럼 보인다.
      for (const c of b.play.calls) if (b.play.t >= c.t) c.shown = true;
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
        const kind = PITCHES[clamp(type | 0, 0, PITCHES.length - 1)];
        b.pitch = { type: clamp(type | 0, 0, PITCHES.length - 1), kind, ax: ax / 100, ay: ay / 100, t: ms / 1000, dur: kind.dur,
                    plate: Math.round(kind.dur / FR), done: !!done, wind: wind / 1000 };
        b.seen = seq;
      } else {
        b.pitch.done = b.pitch.done || !!done;   // 한 번 닫힌 공은 다시 안 열린다
        b.pitch.wind = wind / 1000;
      }
    } else if (data.p === null) { b.pitch = null; b.seen = data.q ?? b.seen; }

    if (Array.isArray(data.lg)) {
      b.log = data.lg.filter((r) => Array.isArray(r) && r.length >= 3)
        .map(([no, r, t]) => ({ no: num(no), r: String(r), t: String(t) }));
    }
    if (typeof data.nt === 'string' || data.nt === null) b.note = data.nt;
    if (Number.isFinite(data.wn)) b.winner = data.wn === 0 || data.wn === 1 ? data.wn : null;
    if (Array.isArray(data.k)) b.call = { text: String(data.k[0]), big: !!data.k[1], t: num(data.k[2]) / 100, life: data.k[1] ? 1.4 : 1.0 };
    else if (data.k === null) b.call = null;
    // 배트가 도는 것도 따라 그린다. 내가 이미 돌리고 있으면 그건 내 것을 쓴다 —
    // 내 스윙은 누른 그 프레임에 돌았고, 방장 것은 한 왕복 늦게 온다.
    if (!(b.batT > 0) && Number.isFinite(data.bt)) b.batT = data.bt / 1000;
    if (Number.isFinite(data.hb)) b.hitBy = data.hb / 100;
    // 타석 자리는 **치는 사람 것이 맞다.** 내가 치는 쪽이면 내 값을 쓰고, 아니면 받아 쓴다.
    if (!amBatting(world) && Array.isArray(data.md) && data.md.every(Number.isFinite)) {
      b.mitt = { x: clamp(data.md[0] / 100, -MITT_OUT, MITT_OUT),
                 y: clamp(data.md[1] / 100, -MITT_OUT, MITT_OUT) };
      b.stand = clamp(-b.mitt.x, -1, 1);
    }
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
      : h.k === 'throw' ? [3, r2(h.t0), r2(h.t1), r2(h.a[0]), r2(h.a[1]), r2(h.b[0]), r2(h.b[1])]
      : [2, r2(h.t0), r2(h.t1), r2(h.deg), r2(h.ft), r2(h.z)])),
    m: p.men.map((m) => [m.i, r2(m.t0), r2(m.t1), r2(m.deg), r2(m.ft),
                         m.dive === null || m.dive === undefined ? -1 : r2(m.dive), m.shift ?? 0]),
    r: p.runs.map((r) => [r.from, r.to, r.t0, r.t1, r.out ? 1 : 0, r.outAt ?? -1]
      .map((v) => Math.round(v * 100) / 100)),
    c: p.calls.map((c) => [c.t, c.text, c.big ? 1 : 0]),
    w: p.hitWord ?? '', e: p.ev ?? 0, a: p.ang ?? 0, fr: p.far ?? 0,
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
                                      t0: num(r[1]), t1: num(r[2]), deg: num(r[3]), ft: num(r[4]),
                                      dive: num(r[5], -1) < 0 ? null : num(r[5]),
                                      shift: clamp(num(r[6]) | 0, -1, 1) }));
  p.runs = rows(d?.r, 5).map((r) => ({ from: clamp(r[0] | 0, 0, 4), to: clamp(r[1] | 0, 0, 4),
                                       t0: num(r[2]), t1: num(r[3]), out: !!r[4],
                                       outAt: num(r[5], -1) < 0 ? undefined : num(r[5]) }));
  p.calls = rows(d?.c, 2).map((r) => ({ t: num(r[0]), text: String(r[1] ?? ''),
                                        big: !!r[2], shown: true }));
  p.hitWord = typeof d?.w === 'string' ? d.w : '';
  p.ev = num(d?.e); p.ang = num(d?.a); p.far = num(d?.fr);
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
    // **무슨 타구인지 공 하나만 보고는 안 읽힌다.** 뜬공이면 떨어질 자리를 땅에 찍고
    // 남은 길을 점으로 깔아 둔다. 땅볼이면 굴러온 자국을 남긴다 — 땅볼은 공과 그림자가
    // 겹쳐 있어서, 아무 표시가 없으면 점 하나가 미끄러지는 것으로만 보였다.
    const fly = b.play.hops.find((h) => h.k === 'fly');
    if (fly && b.play.t < fly.t1 && b.play.kind !== 'grounder') {
      const end = fly.pts[fly.pts.length - 1];
      const [ex, ey] = spot(L, fly.deg, end[1]);
      const es = depth(fly.deg, end[1]);
      const near = clamp(b.play.t / Math.max(0.2, fly.t1), 0, 1);   // 가까워질수록 진해진다
      circle(ctx, ex, ey, (7 + 6 * (1 - near)) * es,
             { width: 1.6, color: PENCIL, halo: false, alpha: 0.16 + near * 0.42, seed: 36, amp: 0.6 });
      for (const [pt, pf, pz] of fly.pts) {
        if (pt <= b.play.t) continue;
        const [px2, py2] = spot(L, fly.deg, pf);
        circle(ctx, px2, py2 - lift(L, pz, fly.deg, pf), 1.7 * depth(fly.deg, pf),
               { width: 1.1, color: PENCIL, halo: false, alpha: 0.22, seed: 37, amp: 0.3 });
      }
    }
    if (b.play.kind === 'grounder') {
      for (let i = 1; i <= 4; i++) {
        const tt = b.play.t - i * 0.055;
        if (tt <= 0) break;
        const [d2, f2] = ballAt(b.play, tt);
        const [tx, ty] = spot(L, d2, f2);
        circle(ctx, tx, ty, 3.6 * depth(d2, f2),
               { width: 1.2, color: PENCIL, halo: false, alpha: 0.3 - i * 0.06, seed: 38 + i, amp: 0.7 });
      }
    }
    // **얼마나 갔나.** 뜬 공이 떠 있는 동안 공 옆에 붙여 둔다 — 담장을 넘길지 말지가
    // 여기서 읽힌다. 땅볼에는 안 붙인다 (거리가 뜻이 없다).
    if (b.play.far > 12 && z > 8) {
      text(ctx, `${Math.round(ft * 0.3048)}m`, gx + 16 * s + 10, y - 4,
           { font: `700 ${Math.round(11 + 3 * s)}px ${MONO}`, color: PENCIL, halo: 3 });
    }
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
  // **겨눌 수 있는 한계.** 존 한 겹 바깥 — 여기까지만 고르고 나머지는 제구가 정한다.
  if (amPitching(world) && !b.pitch && !b.play) {
    const ow = half[0] * AIM_OUT, oh = half[1] * AIM_OUT;
    const out = [[z.cx - ow, z.cy - oh], [z.cx + ow, z.cy - oh],
                 [z.cx + ow, z.cy + oh], [z.cx - ow, z.cy + oh]];
    stroke(ctx, [...out, out[0]], { width: 1.3, color: PENCIL, seed: 45, amp: 0.5,
                                    alpha: 0.26, sharp: true, halo: false });
  }
  // **타자의 미트 — 치는 쪽 화면에만.** 던지는 쪽이 미리 알면 수싸움이 통째로 없어진다.
  // 공이 날아오는 동안에도 그린다. 미트 안으로 들어왔는지를 눈으로 봐야 다음 공에
  // 어디로 옮길지가 정해진다.
  if (amBatting(world) && !b.play && !b.over) {
    const mx = z.cx + b.mitt.x * half[0];
    const my = z.cy - b.mitt.y * half[1];
    const rx = half[0] * EASY, ry = half[1] * EASY;      // 이 안이면 한가운데와 같다
    const tint = TEAM_INK[batSide(b)];
    const box = [[mx - rx, my - ry], [mx + rx, my - ry], [mx + rx, my + ry], [mx - rx, my + ry]];
    stroke(ctx, [...box, box[0]], { width: 2, color: tint, seed: 46, amp: 0.5,
                                    alpha: b.pitch ? 0.9 : 0.66, sharp: true, halo: false });
    // 가운데 십자 — 네모만 있으면 어디가 한복판인지 안 보인다.
    stroke(ctx, [[mx - 4, my], [mx + 4, my]], { width: 1.6, color: tint, seed: 47, amp: 0.3, halo: false, alpha: 0.8 });
    stroke(ctx, [[mx, my - 4], [mx, my + 4]], { width: 1.6, color: tint, seed: 48, amp: 0.3, halo: false, alpha: 0.8 });
  }
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
/// 던진 공 기록. 존 둘레에 작은 표로 찍는다 — 오래된 것일수록 옅다.
/// 숨기지 않는다. 실제로도 타자와 포수가 다 보고 세는 것이고, 감춰 두면 배합이 그냥 찍기가 된다.
const THROWN_INK = ['#b5352f', '#a8761c', '#2f6fb0', '#3f8f56'];
function drawThrown(ctx, L, b) {
  if (!b.thrown?.length || b.over) return;
  const z = zone(L);
  b.thrown.forEach((x, i) => {
    const age = (i + 1) / b.thrown.length;              // 마지막 것이 제일 진하다
    const px = z.cx + clamp(x.x, -AIM_OUT, AIM_OUT) * z.w / 2;
    const py = z.cy - clamp(x.y, -AIM_OUT, AIM_OUT) * z.h / 2;
    const tint = THROWN_INK[x.t % THROWN_INK.length];
    const r = 4.6;
    if (x.r === 2) {          // 인플레이 — 속이 찬 동그라미
      circle(ctx, px, py, r, { width: 1.4, color: tint, fill: tint, halo: false,
                               alpha: 0.35 + age * 0.5, seed: 70 + i, amp: 0.3 });
    } else if (x.r === 0) {   // 볼 — 빈 동그라미
      circle(ctx, px, py, r, { width: 1.5, color: tint, halo: false,
                               alpha: 0.28 + age * 0.45, seed: 71 + i, amp: 0.3 });
    } else {                  // 스트라이크 · 헛스윙 · 파울 — 가위표
      const a = 0.3 + age * 0.5;
      stroke(ctx, [[px - r, py - r], [px + r, py + r]],
             { width: 1.6, color: tint, halo: false, alpha: a, seed: 72 + i, amp: 0.3 });
      stroke(ctx, [[px + r, py - r], [px - r, py + r]],
             { width: 1.6, color: tint, halo: false, alpha: a, seed: 73 + i, amp: 0.3 });
    }
  });
}

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

/// 판이 끝나면 기록지 한 장. 이닝별 득점과 R·H·E — 진짜 야구 기록지가 생긴 모양이다.
function drawCard(ctx, world) {
  const b = world.bag;
  const innings = Math.max(INNINGS, b.lines[0].length, b.lines[1].length);
  const cw = 18, x0 = 92;
  const w = x0 + cw * innings + 96;
  const h = 118;
  const x = Math.round((world.w - w) / 2);
  const y = Math.round(world.h * 0.20);
  paperScrap(ctx, x, y, w, h, 13);
  text(ctx, b.note ?? '', x + w / 2, y + 26,
       { font: `900 17px ${HAN}`, color: b.winner === null ? INK : TEAM_INK[b.winner],
         align: 'center', halo: 0 });
  for (let i = 0; i < innings; i++) {
    text(ctx, String(i + 1), x + x0 + cw * i + cw / 2, y + 48,
         { font: `600 11px ${MONO}`, color: PENCIL, align: 'center', halo: 0 });
  }
  ['R', 'H', 'E'].forEach((k, i) => {
    text(ctx, k, x + x0 + cw * innings + 16 + i * 26, y + 48,
         { font: `700 11px ${MONO}`, color: PENCIL, align: 'center', halo: 0 });
  });
  [1, 0].forEach((side, row) => {
    const ly = y + 72 + row * 24;
    text(ctx, TEAM_NAME[side], x + 24, ly,
         { font: `800 13px ${HAN}`, color: TEAM_INK[side], halo: 0 });
    for (let i = 0; i < innings; i++) {
      const v = b.lines[side][i];
      text(ctx, v === undefined ? '·' : String(v), x + x0 + cw * i + cw / 2, ly,
           { font: `600 12px ${MONO}`, color: INK, align: 'center', halo: 0 });
    }
    // E 는 **그 편이 저지른** 실책이다 (쌓는 쪽이 errs[수비한 편]). 같은 줄에서 H 는
    // [side] 로 읽으면서 E 만 [1 - side] 로 읽고 있어서, 홈이 저지른 실책이 원정 줄에 붙었다.
    [b.score[side], b.hits[side], b.errs[side]].forEach((v, i) => {
      text(ctx, String(v), x + x0 + cw * innings + 16 + i * 26, ly,
           { font: `${i === 0 ? 800 : 600} 13px ${MONO}`, color: i === 0 ? TEAM_INK[side] : PENCIL,
             align: 'center', halo: 0 });
    });
  });
}

/// 기록판. 회·점수·아웃·볼카운트·주자. 왼쪽 위 여백에 세로로 — 이 게임의 다른 글자판과 같은 자리.
function drawBoard(ctx, world, time) {
  const b = world.bag;
  if (!b || world.state === 'pick') return;
  const x = 28, y = 16, w = 252, h = 148;
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

  // R · H · E. 야구 기록지의 세 칸이다.
  text(ctx, `H${b.hits[1]} E${b.errs[1]}`, x + 116, y + 54,
       { font: `600 10px ${MONO}`, color: PENCIL, halo: 0, alpha: 0.85 });
  text(ctx, `H${b.hits[0]} E${b.errs[0]}`, x + 116, y + 76,
       { font: `600 10px ${MONO}`, color: PENCIL, halo: 0, alpha: 0.85 });

  // 지금 타석에 선 타자. 아홉이 아홉으로 보이려면 누구인지 적혀 있어야 한다.
  // 성향까지 적는다 — 던지는 쪽이 이걸 보고 시프트를 건다.
  const me = atBat(b);
  text(ctx, `타석 ${me.no}번 · ${me.name} · ${pullWord(me.pull ?? 0)}`, x + 26, y + 126,
       { font: `700 12px ${HAN}`, color: TEAM_INK[bat], halo: 0 });

  // 마지막 기록 몇 줄. 기록지가 그대로 쌓인다.
  const rows = b.log.slice(-3);
  rows.forEach((row, i) => {
    const ly = y + h + 20 + i * 17;
    text(ctx, `${row.no ?? ''}`, x + 26, ly,
         { font: `600 11px ${MONO}`, color: PENCIL, halo: 2, alpha: 0.6, align: 'left' });
    text(ctx, row.r, x + 44, ly, { font: `700 12px ${MONO}`, color: PENCIL, halo: 2, alpha: 0.9 });
    text(ctx, row.t, x + 80, ly, { font: `600 12px ${HAN}`, color: PENCIL, halo: 2, alpha: 0.9 });
  });

  // 지금 내가 무엇을 하는 사람인가, 그리고 **상대가 사람인가 컴퓨터인가.**
  // 회마다 역할이 바뀌는 게임이라 이 두 줄이 없으면 「왜 내가 안 치지」를 묻게 된다.
  if (world.state === 'play' && !b.over) {
    const shiftWord = b.shift ? (b.shift < 0 ? ' · 당김 수비' : ' · 밀어침 수비') : '';
    const role = world.mp.waiting ? '구경'
      : amPitching(world) ? `던진다 — ${PITCHES[b.type].name}${shiftWord}`
      : `친다 — ${atBat(b).no}번 ${atBat(b).name}`;
    const swung = b.swungAt && world.elapsed - b.swungAt.at < 1.4 && amBatting(world);
    // **고르는 키를 적어 둔다.** 구종 넷이 이 게임의 절반인데 ⌥1~4 를 아무 데도 안 적어
    // 놓으면, 모르는 사람은 평생 직구만 던진다. 던질 차례에 사이일 때만 — 공이 날아가는
    // 동안에는 글자가 하나라도 적은 편이 낫다.
    const keys = amPitching(world) && !b.pitch && !b.play;
    const tags = keys ? PITCHES.map((k, i) => `${i + 1} ${k.name}`)
                             .concat(`5 ${SHIFT_SHORT[b.shift === 0 ? 0 : b.shift < 0 ? 1 : 2]}`) : [];
    const KEY_FONT = `700 12px ${HAN}`;
    ctx.font = KEY_FONT;
    const each = tags.map((t) => ctx.measureText(t).width);
    const GAP = 12;
    const keyW = each.reduce((a, c) => a + c, 0) + GAP * Math.max(0, tags.length - 1);
    // 종이 한 장을 깔고 그 위에 적는다. 담장과 외야수 위에 글자만 얹으면 안 읽힌다.
    ctx.font = `800 15px ${HAN}`;
    const wide = Math.max(150, ctx.measureText(role).width + 60, keys ? keyW + 34 : 0);
    paperScrap(ctx, world.w / 2 - wide / 2, 14, wide, swung ? 74 : keys ? 76 : 50, 9);
    text(ctx, role, world.w / 2, 34,
         { font: `800 15px ${HAN}`, color: amPitching(world) ? TEAM_INK[fieldSide(b)] : TEAM_INK[batSide(b)],
           align: 'center', halo: 0 });
    const foe = humanOn(world, amPitching(world) ? batSide(b) : fieldSide(b));
    const foeName = foe ? (foe.name ?? '상대') : '컴퓨터';
    text(ctx, `상대 — ${foeName}`, world.w / 2, 53,
         { font: `600 12px ${HAN}`, color: PENCIL, align: 'center', halo: 0 });
    if (keys) {
      let kx = world.w / 2 - keyW / 2;
      tags.forEach((t, i) => {
        const on = i === b.type || (i === PITCHES.length && b.shift);
        text(ctx, t, kx + each[i] / 2, 72,
             { font: KEY_FONT, color: on ? RED : PENCIL, align: 'center',
               alpha: on ? 1 : 0.45, halo: 0 });
        kx += each[i] + GAP;
      });
    }
    if (swung) {
      const e = b.swungAt.err;
      const when = e === 0 ? '정확!' : `${Math.abs(e)}프레임 ${e < 0 ? '빨랐다' : '늦었다'}`;
      text(ctx, `${when}${b.spotWord ? ` · ${b.spotWord}` : ''}`, world.w / 2, 74,
           { font: `700 13px ${HAN}`, color: RED, align: 'center', halo: 0 });
    }
  }
}
