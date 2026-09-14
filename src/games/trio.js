// 셋이서 — 협동, 세 명.
//
// 물리와 규칙은 넷이서와 한 글자도 다르지 않다 (coop.js 의 makeCoop). 다른 것은 셋뿐이다:
// 판 묶음(trio-stages.js), 인원 셋, 그리고 세 세계의 색.
//
// 사람이 하나 줄면 규칙이 달라진다. 무거운 상자를 둘이 밀면 남는 건 하나, 어깨를 둘이 받치면
// 올라가는 것도 하나다. 열두 판이 전부 「손이 하나 모자란다」는 전제 위에 서 있다.

import { makeCoop } from './coop.js';
import { STAGES, WORLDS } from './trio-stages.js';

/// 세 세계의 색. 넷이서의 뒷마당·학교·도시·지하철과 겹치지 않게 골랐다.
/// edge 는 땅 윗면에 돋는 잔털 — 놀이공원은 늘어뜨린 전구, 항구는 물때, 저택은 없다(맨 석재).
const THEME = {
  '놀이공원':  { ground: '#c0533f', edge: '#e0b13c', hatch: '#8a3a2c', barrel: '팝콘통' },
  '유령 저택': { ground: '#584a5e', edge: null,      hatch: '#3a3040', barrel: '술통' },
  '항구':      { ground: '#6f8790', edge: '#1f6f7a', hatch: '#46555c', barrel: '드럼통' },
};

export default makeCoop({
  id: 'trio',
  name: '셋이서',
  line: '셋이 열쇠를 찾아 포탈에 모인다. 손이 하나 모자라게 만든 판 열둘.',
  crew: 3, crewWord: '셋', inviteWord: '둘',
  stages: STAGES, worlds: WORLDS, themes: THEME, fallbackTheme: THEME['항구'],
});

export { STAGES, WORLDS, THEME };
// 물리·타일은 넷이서와 같은 것을 쓴다. 봇과 시험이 `games/trio.js` 하나만 열어도 되게 그대로 내보낸다.
export { T, move, rewind, loadStage, placeAt, exitState, stepObjects, blinkOn, tile, solidTile,
         floorBelow, bodyBlocked, stageNo, makeCoop } from './coop.js';
