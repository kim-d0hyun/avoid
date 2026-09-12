// 넷이서 — 판을 **실제 엔진에서** 넷이 깬다 (인형 세상).
//
// docs/넷이서/solve.py 는 풀이를 칸 단위로 지형에 대 본다 — 「두 칸 위 네 칸 옆」같은 어림값으로.
// 그 어림값이 coop.js 의 물리(픽셀·속도·중력·머리 높이 53px·웅크린 머리 31px)와 어긋나면
// 검사는 통과하는데 사람은 못 깨는 판이 나온다. 그래서 같은 풀이(test/coop-moves.json)를
// 여기서 **키를 눌러** 그대로 해 본다. 걸음은 test/coop-bot.mjs 에.
//
// 방장 세상 하나. 움직이는 한 명만 진짜 물리(world.player)고 나머지 셋은 그 자리에 선 남(world.mp.others) —
// 차례가 오면 그 사람을 world.player 로 갈아 끼운다. 남의 물리는 서 있는 자리와 떨어지는 것만 흉내 낸다.
// 넷을 각자 세상으로 굴리는 진짜 시뮬레이션은 coop-net.mjs.

import { writeFileSync } from 'node:fs';
import { check, ok, say, note, done } from './check.mjs';
import { runAll } from './coop-bot.mjs';
import { PuppetSim } from './coop-play-sim.mjs';

// PuppetSim 은 coop-play-sim.mjs 에.

say('열네 판 — 풀이 그대로 키를 눌러 넷이 깬다 (인형 세상 · 통은 뺐다)');
const results = runAll((name) => new PuppetSim(name), { ok, note });
if (!process.env.STAGE) writeFileSync(new URL('../docs/넷이서/play.json', import.meta.url), JSON.stringify(results, null, 1));
done('넷이서 실전');
