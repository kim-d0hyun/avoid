// 야구 — 사람 몫을 대신 눌러 주는 손. 시험과 영상이 같이 쓴다.
//
// **게임 안의 컴퓨터(aiPitch·aiSwing)와 다른 물건이다.** 이쪽은 실제로 키를 눌러서
// world.press 를 지난다 — 그래야 「사람이 하면 이렇게 된다」를 재는 것이 된다.
// 컴퓨터는 반대편(사람이 없는 편)을 맡는다.
//
// skill 을 올리면 손이 덜 떨린다 (1 이 사람 수준).
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const bb = await import(R + 'games/baseball.js');

const rnd = () => Math.random();
export function makeHands(world, skill = 1) {
  let plan = null;      // 이번 공에 언제 휘두를까
  let seq = -1;
  const tap = (a) => { w.press(world, a, true); w.press(world, a, false); };
  return (dt) => {
    const b = world.bag;
    if (world.state !== 'play' || b.over) return;
    // 던지기
    if (bb.amPitching(world) && !b.pitch && !b.play && b.wait <= 0) {
      const want = rnd() < 0.5 ? 1 : rnd() < 0.5 ? 2 : 3;
      w.press(world, 'say' + want, true); w.press(world, 'say' + want, false);
      const a = rnd() * Math.PI * 2;
      const behind = b.balls >= 3 || (b.balls === 2 && b.strikes === 0);
      const ahead = b.strikes === 2 && b.balls < 2;
      const g = () => (rnd() + rnd() + rnd() + rnd() + rnd() + rnd() - 3) * Math.SQRT2;
      let tx = 0, ty = 0, wob = 0.62;
      if (behind) wob = 0.42;
      else if (ahead && rnd() < 0.62) { tx = Math.cos(a) * 1.30; ty = Math.sin(a) * 1.15; wob = 0.34; }
      else { tx = Math.cos(a) * 0.62; ty = Math.sin(a) * 0.55; wob = 0.72; }
      b.aim.x = tx + g() * wob;
      b.aim.y = ty + g() * wob * 0.9 + bb.PITCHES[want - 1].drop;
      tap('grab');
      return;
    }
    // 치기
    if (bb.amBatting(world) && b.pitch && !b.pitch.done && !b.play) {
      if (seq !== b.seq) {
        seq = b.seq;
        const L = bb.layout(world);
        const end = bb.pitchEnd(b.pitch, L);
        const z = bb.zone(L);
        const inZone = Math.abs(end.x - z.cx) < z.w / 2 + 4 && Math.abs(end.y - z.cy) < z.h / 2 + 4;
        const chase = !inZone && rnd() < (b.strikes === 2 ? 0.38 : 0.20);
        const guess = rnd() < (b.strikes === 2 ? 0.45 : 0.62) ? 0 : rnd() < 0.5 ? 1 : 2;
        plan = (inZone && rnd() > 0.30) || chase
          ? { at: b.pitch.plate + bb.guessErr(guess, b.pitch.type, 10 / skill),
              up: rnd() < 0.26, down: rnd() < 0.2 }
          : null;
      }
      if (plan && Math.round(b.pitch.t / (1 / 60)) >= plan.at) {
        world.input.jump = plan.up; world.input.duck = plan.down;
        tap('grab');
        world.input.jump = false; world.input.duck = false;
        plan = null;
      }
    }
  };
}
