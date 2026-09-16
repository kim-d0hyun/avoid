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
      const want = rnd() < 0.44 ? 1 : 2 + ((rnd() * 3) | 0);
      w.press(world, 'say' + want, true); w.press(world, 'say' + want, false);
      // 게임 안의 컴퓨터(aiPitch)와 같은 방식으로 **겨누기만** 한다 —
      // 실제로 어디로 가는지는 startPitch 의 제구가 정한다.
      const a = rnd() * Math.PI * 2;
      const behind = b.balls >= 3 || (b.balls === 2 && b.strikes === 0);
      const ahead = b.strikes === 2 && b.balls < 2;
      if (behind) { const m = rnd() < 0.24; const r2 = m ? 1.05 + rnd() * 0.2 : rnd() * 0.5;
                    b.aim.x = Math.cos(a) * r2; b.aim.y = Math.sin(a) * r2; }
      else {
        const out = rnd() < (ahead ? 0.78 : 0.54);
        let x, y;
        if (out) {
          const far = (1.08 + rnd() * 0.27) * (rnd() < 0.5 ? -1 : 1);
          const near = rnd() * 1.7 - 0.85;
          if (rnd() < 0.55) { x = far; y = near; } else { x = near; y = far; }
        } else { x = rnd() * 1.7 - 0.85; y = rnd() * 1.7 - 0.85; }
        b.aim.x = x;
        b.aim.y = y;
      }
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
        const chase = !inZone && rnd() < (b.strikes === 2 ? 0.34 : 0.17);
        const guess = rnd() < (b.strikes === 2 ? 0.45 : 0.62) ? 0 : 1 + ((rnd() * 3) | 0);
        plan = (inZone && rnd() > 0.38) || chase
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
