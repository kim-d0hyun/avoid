// 배구 캐릭터 — 다섯 명. 능력치 넷(달리기·점프·스파이크·받기)을 1~5로, **합은 모두 12**.
// 강약이 아니라 취향으로 고르게 한다. 저마다 ⌥C 스킬이 하나씩 있다. 기획: claude.ai 「몰겜 배구 캐릭터」.
//
// 캐릭터나 능력치를 늘릴 때는 이 표만 고친다 — 배구(volley.js)와 그림(draw/looks.js)은 여기 값을 읽는다.

/// 단계(1~5)마다의 값. 3 이 지금 게임 그대로다.
export const LEVELS = {
  run: [0.80, 0.90, 1, 1.10, 1.20],          // 달리기 — 최고 빠르기·슬라이딩 배율
  jump: [56, 60, 65, 71, 78],                // 점프 — 뛰는 높이(px). 3 = 65 (world.js JUMP_V 480 · 중력 1760)
  spike: [0.84, 0.92, 1, 1.08, 1.16],        // 스파이크 — 때린 공 빠르기 배율
  reach: [0.85, 0.92, 1, 1.08, 1.15],        // 받기 — 손이 닿는 거리·몸으로 받는 폭 배율
};
export const STAT_NAMES = { run: '달리기', jump: '점프', spike: '스파이크', reach: '받기' };
const BASE_JUMP = 65;

/// 기세 — 이만큼 차면 ⌥C. 점수를 내주면 LOSE_GAIN, 따면 WIN_GAIN.
export const GAUGE_FULL = 4;
export const WIN_GAIN = 1;
export const LOSE_GAIN = 2;

/// kind — now(누르는 즉시) · arm(켜 두면 이번 랠리 안의 다음 한 번)
export const CAST = [
  { id: 'dubu', name: '두부', line: '말랑하고 무던하다. 뭘 해도 중간은 한다.',
    st: { run: 3, jump: 3, spike: 3, reach: 3 },
    skill: { id: 'set', name: '말랑 받기', kind: 'arm', line: '다음에 받은 공이 네트 앞 때리기 좋은 높이로 뜬다' } },
  { id: 'kkang', name: '깡총', line: '하늘을 좋아한다. 높이는 최고인데 팔힘이 없다.',
    st: { run: 3, jump: 5, spike: 2, reach: 2 },
    skill: { id: 'double', name: '두 번 뛰기', kind: 'now', line: '공중에서 한 번 더 뛴다' } },
  { id: 'mangchi', name: '망치', line: '느릿느릿 걷다가 한 번 내리치면 끝.',
    st: { run: 2, jump: 4, spike: 5, reach: 1 },
    skill: { id: 'thunder', name: '벼락', kind: 'arm', line: '다음 스파이크 ×1.35, 불꽃 꼬리' } },
  { id: 'beongae', name: '번개', line: '코트를 휙휙 가로지르는 급한 성격.',
    st: { run: 5, jump: 2, spike: 3, reach: 2 },
    skill: { id: 'dash', name: '잔상 대시', kind: 'now', line: '누른 방향키 쪽으로 순간 120px' } },
  { id: 'muneo', name: '문어', line: '팔이 길어서 안 닿는 공이 없다.',
    st: { run: 3, jump: 2, spike: 2, reach: 5 },
    skill: { id: 'rescue', name: '건지기', kind: 'arm', line: '바닥에 닿기 직전 공을 한 번 건져 올린다' },
    arms: 1.25 },
];
export const DEFAULT_CAST = 'dubu';
const BY_ID = new Map(CAST.map((c) => [c.id, c]));

export const castOf = (id) => BY_ID.get(id) ?? BY_ID.get(DEFAULT_CAST);
export const isCast = (id) => BY_ID.has(id);

/// 그 캐릭터의 배율들. jumpMul 은 **속도** 배율이다 — 높이가 속도의 제곱에 비례하니 √ 를 씌운다.
export function statsOf(id) {
  const c = castOf(id);
  const lv = (k) => LEVELS[k][Math.max(1, Math.min(5, c.st[k])) - 1];
  return {
    run: lv('run'),
    jumpH: lv('jump'),
    jump: Math.sqrt(lv('jump') / BASE_JUMP),
    spike: lv('spike'),
    reach: lv('reach'),
  };
}
