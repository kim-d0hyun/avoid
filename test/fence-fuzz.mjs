// 펜싱 막 두드리기 — 여럿이 마구 누르고, 들어오고 나가고, 편을 바꾸고, 방장이 바뀌어도
// 안 넘어지고 · 안 굳고 · 서로 다른 판을 보지 않는가.   node test/fence-fuzz.mjs  (SEED=… ROUNDS=…)

import './dom-stub.mjs';
const R0 = new URL('../src/', import.meta.url).href;
const w = await import(R0 + 'game/world.js');
const F = await import(R0 + 'games/fence.js');
process.env.REJOIN_LIB = '1';
const { room } = await import('./rejoin.mjs');
import { ok, say, note, done } from './check.mjs';

let seed = Number(process.env.SEED ?? 3);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
Math.random = rnd;
const ROUNDS = Number(process.env.ROUNDS ?? 6);
const KEYS = ['grab', 'drop', 'guard'];

say(`여럿이 막 두드리기 — ${ROUNDS}판`);
let crashes = 0, stuck = 0, offside = 0, apart = 0, ended = 0;
for (let round = 0; round < ROUNDS; round++) {
  const r = room('fence');
  const people = () => [r.host, ...r.guests.values()];
  r.join(); r.join();
  r.advance(30); r.again(); r.advance(30);
  let lastScore = '', still = 0;
  try {
    for (let i = 0; i < 60 * 240; i++) {
      // 사람마다 사람처럼 — 몇 프레임에 한 번 손을 바꾼다
      for (const p of people()) {
        if (rnd() < 0.08) {
          // 앞으로 가는 쪽이 조금 많다 — 사람은 상대에게 다가간다
          const fwd = (p.team ?? 0) === 0 ? 'right' : 'left', back = fwd === 'right' ? 'left' : 'right';
          const u = rnd(); p.input[fwd] = u < 0.45; p.input[back] = u > 0.8;
          p.input.jump = rnd() < 0.25; p.input.duck = !p.input.jump && rnd() < 0.25;
        }
        if (rnd() < 0.02) { const k = KEYS[Math.floor(rnd() * 3)]; w.press(p, k, true); w.press(p, k, false); }
      }
      // 드나들기 · 편 바꾸기 · 방장 넘기기
      const e = rnd();
      if (e < 0.0006 && r.guests.size) r.leave([...r.guests.values()][Math.floor(rnd() * r.guests.size)]);
      else if (e < 0.0012 && r.guests.size < 3) r.join();
      else if (e < 0.0018) { const p = people()[Math.floor(rnd() * people().length)]; w.gameOf(p).swap(p, r.shellOf.get(p)); }
      else if (e < 0.0020 && r.guests.size) r.promote([...r.guests.values()][0]);
      r.advance(1);
      const h = r.host, b = h.bag;
      if (h.state === 'over' || b.over) { ended++; break; }
      if (h.state === 'ready') { r.again(); continue; }
      // 싸우는 동안 피스트 위 두 사람이 판 안에 있나 (판 끝 너머 20px 까지는 「밖으로」 판정 대기).
      // 알레 전 대기 중에는 손님 화면에 「네 차례」가 아직 안 닿았을 수 있다 — 그건 센다고 안 친다.
      const P = F.piste(h);
      if (b.phase === 'fight') for (const s of [0, 1]) { const x = F.body(h, s).x; if (x < P.L - 21 || x > P.R + 21) { if (offside++ < 3) note(`판 밖: 편${s} 검객${b.fencers[s]} x=${x.toFixed(0)} 국면 ${b.phase} 손님편 ${JSON.stringify([...b.sides])} i=${i}`); } }
      // 손님 화면과 방장 화면이 같은 점수 · 같은 검객을 보나 (꾸러미가 닿은 뒤)
      for (const g of r.guests.values()) {
        if (g.state === 'play' && b.phase === 'fight' && i % 30 === 29 && g.bag.score.join() !== b.score.join() && g.bag.phase === b.phase) apart++;
      }
      // 30초 넘게 점수가 안 바뀌면 굳은 것으로 본다
      const sc = b.score.join() + b.phase;
      if (sc === lastScore) { if (++still > 60 * 30) { stuck++; note(`굳음: 국면 ${b.phase} 타이머 ${b.timer?.toFixed(2)} 검객 ${b.fencers} 상태 ${h.state} 점수 ${b.score} 끝 ${b.over} x ${[0,1].map((q) => F.body(h, q).x.toFixed(0))} 손님들 ${[...r.guests.values()].map((g) => g.mp.myId + ':' + g.player.x.toFixed(0) + ':' + g.state + ':' + (g.bag.fencers))}`); break; } } else { still = 0; lastScore = sc; }
    }
  } catch (err) { crashes++; note(`넘어졌다: ${err.stack.split('\n').slice(0, 3).join(' | ')}`); }
  note(`${round + 1}판 — ${r.host.bag.score.join(':')} · 방장 ${r.host.mp.myId} · 손님 ${r.guests.size}`);
}
ok('한 번도 안 넘어졌다', crashes === 0);
ok('굳은 판이 없다', stuck === 0);
ok('판 밖에 선 검객이 없다', offside === 0);
note(`손님 화면 점수가 어긋난 순간 ${apart}번`);
ok('손님 화면 점수가 어긋나지 않는다', apart === 0);
note(`끝까지 간 판 ${ended}/${ROUNDS}`);
done('펜싱 막 두드리기');
