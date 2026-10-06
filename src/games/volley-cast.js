// 배구 캐릭터 — 열 명. 능력치 여섯(달리기·점프·스파이크·받기·서브·블로킹)을 1~5로, **합은 모두 18**.
// 강약이 아니라 취향으로 고르게 한다. 저마다 ⌥C 스킬이 하나씩, 몇 명은 숫자로 못 적는 특성이 하나씩 있다.
// 기획: claude.ai 「몰겜 배구 캐릭터」(1판 다섯 · 2판 확장 다섯).
//
// 캐릭터나 능력치를 늘릴 때는 이 표만 고친다 — 배구(volley.js)와 그림(draw/looks.js)은 여기 값을 읽는다.

/// 단계(1~5)마다의 값. 3 이 지금 게임 그대로다.
export const LEVELS = {
  run: [0.80, 0.90, 1, 1.10, 1.20],          // 달리기 — 최고 빠르기·슬라이딩 배율
  jump: [56, 60, 65, 71, 78],                // 점프 — 뛰는 높이(px). 3 = 65 (world.js JUMP_V 480 · 중력 1760)
  spike: [0.84, 0.92, 1, 1.08, 1.16],        // 스파이크 — 때린 공 빠르기 배율
  reach: [0.85, 0.92, 1, 1.08, 1.15],        // 받기 — 손이 닿는 거리·몸으로 받는 폭 배율
  serve: [0.86, 0.93, 1, 1.07, 1.14],        // 서브 — 서브 빠르기 배율 · 점프 서브가 덜 실패한다
  block: [0.80, 0.90, 1, 1.10, 1.20],        // 블로킹 — 벽 폭·높이 배율, 다시 막기까지는 그만큼 짧게
};
export const STAT_NAMES = { run: '달리기', jump: '점프', spike: '스파이크', reach: '받기', serve: '서브', block: '블로킹' };
export const STAT_SUM = 18;
const BASE_JUMP = 65;

/// 기세 — 이만큼 차면 ⌥C. 점수를 내주면 LOSE_GAIN, 따면 WIN_GAIN.
export const GAUGE_FULL = 4;
export const WIN_GAIN = 1;
export const LOSE_GAIN = 2;

/// kind — now(누르는 즉시) · arm(켜 두면 이번 랠리 안의 다음 한 번)
export const CAST = [
  { id: 'dubu', name: '두부', line: '말랑하고 무던하다. 뭘 해도 중간은 한다.',
    st: { run: 3, jump: 3, spike: 3, reach: 3, serve: 3, block: 3 },
    skill: { id: 'set', name: '말랑 받기', kind: 'arm', line: '다음에 받은 공이 네트 앞 때리기 좋은 높이로 뜬다' } },
  { id: 'kkang', name: '깡총', line: '하늘을 좋아한다. 높이는 최고인데 팔힘이 없다.',
    st: { run: 3, jump: 5, spike: 2, reach: 2, serve: 2, block: 4 },
    skill: { id: 'double', name: '두 번 뛰기', kind: 'now', line: '공중에서 한 번 더 뛴다' } },
  { id: 'mangchi', name: '망치', line: '느릿느릿 걷다가 한 번 내리치면 끝.',
    st: { run: 2, jump: 4, spike: 5, reach: 1, serve: 4, block: 2 },
    skill: { id: 'thunder', name: '벼락', kind: 'arm', line: '다음 스파이크 ×1.35, 불꽃 꼬리' } },
  { id: 'beongae', name: '번개', line: '코트를 휙휙 가로지르는 급한 성격.',
    st: { run: 5, jump: 2, spike: 3, reach: 2, serve: 3, block: 3 },
    skill: { id: 'dash', name: '잔상 대시', kind: 'now', line: '누른 방향키 쪽으로 순간 120px' } },
  { id: 'muneo', name: '문어', line: '팔이 길어서 안 닿는 공이 없다.',
    st: { run: 3, jump: 2, spike: 2, reach: 5, serve: 2, block: 4 },
    skill: { id: 'rescue', name: '건지기', kind: 'arm', line: '바닥에 닿기 직전 공을 한 번 건져 올린다' },
    arms: 1.25 },
  { id: 'kongtteok', name: '콩떡', line: '서브 장인. 손에서 떠난 공이 춤을 춘다.',
    st: { run: 3, jump: 2, spike: 2, reach: 3, serve: 5, block: 3 },
    skill: { id: 'spin', name: '회오리 서브', kind: 'arm', line: '다음 서브가 좌우로 흔들리며 날아간다 (내 서브 때)' } },
  { id: 'byeokdol', name: '벽돌', line: '네트 앞에 서면 벽이 된다.',
    st: { run: 2, jump: 4, spike: 2, reach: 3, serve: 2, block: 5 },
    skill: { id: 'wall', name: '만리장성', kind: 'arm', line: '다음 블로킹이 1.6배 넓고, 막은 공이 그대로 꽂힌다' } },
  { id: 'pungseon', name: '풍선', line: '바람만 불어도 뜬다. 천천히 내려온다.',
    st: { run: 3, jump: 3, spike: 3, reach: 3, serve: 3, block: 3 },
    trait: { id: 'float', name: '체공', line: '내려올 때 천천히 (중력 절반)' },
    skill: { id: 'hover', name: '둥실', kind: 'now', line: '공중에서 0.6초 멈춘다' } },
  { id: 'nabi', name: '나비', line: '살랑살랑, 손끝이 예민하다.',
    st: { run: 4, jump: 3, spike: 2, reach: 3, serve: 3, block: 3 },
    trait: { id: 'sense', name: '감각', line: '정타 판정이 1.5배 넓다' },
    skill: { id: 'netin', name: '네트 인', kind: 'arm', line: '다음 드롭이 네트 테이프에 맞고 툭 넘어간다' } },
  { id: 'meari', name: '메아리', line: '어디로 칠지 아무도 모른다.',
    st: { run: 4, jump: 3, spike: 3, reach: 2, serve: 3, block: 3 },
    skill: { id: 'ghost', name: '그림자 스파이크', kind: 'arm', line: '다음 스파이크 때 가짜 공이 하나 더 날아간다' } },
];
export const DEFAULT_CAST = 'dubu';
const BY_ID = new Map(CAST.map((c) => [c.id, c]));

export const castOf = (id) => BY_ID.get(id) ?? BY_ID.get(DEFAULT_CAST);
export const isCast = (id) => BY_ID.has(id);

/// 그 캐릭터의 배율들. jumpMul 은 **속도** 배율이다 — 높이가 속도의 제곱에 비례하니 √ 를 씌운다.
export function statsOf(id) {
  const c = castOf(id);
  const lv = (k) => LEVELS[k][Math.max(1, Math.min(5, c.st[k] ?? 3)) - 1];
  return {
    run: lv('run'),
    jumpH: lv('jump'),
    jump: Math.sqrt(lv('jump') / BASE_JUMP),
    spike: lv('spike'),
    reach: lv('reach'),
    serve: lv('serve'),
    block: lv('block'),
    fall: c.trait?.id === 'float' ? 0.5 : 1,        // 체공 — 내려올 때 중력 절반
    sense: c.trait?.id === 'sense' ? 1.5 : 1,       // 감각 — 정타 원 배율
  };
}
