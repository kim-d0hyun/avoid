// 여럿이 붙잡을 때 — 뭉쳐 있을 때 손이 몇 개나 가나.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const R = new URL('../src/game/', import.meta.url).href;
const { createWorld, resize, press, update } = await import(R + 'world.js');
const { interpolate } = await import(R + 'net.js');

import { check, say, done } from './check.mjs';
const peer = (id, x, over = {}) => ({
  id, name: `p${id}`, x, baseX: x, vx: 0, air: 0, vy: 0, crouch: 0, facing: 1, walk: 0,
  dead: false, waiting: false, deadFor: 0, danger: false, age: 0, errorX: 0, state: 0,
  grabbing: -1, escapes: 0, seenEscapes: 0, dodged: 0, grabAim: 0, groundY: 0, ...over,
});
function scene(myX, others) {
  const w = createWorld({ ms: 0, dodged: 0 });
  resize(w, 1512, 982); w.mp.on = true; w.mp.myId = 1; w.state = 'play';
  w.onMenu = () => {}; w.player.x = myX;
  for (const o of others) { o.groundY = w.groundY; w.mp.others.set(o.id, o); }
  return w;
}

say('뭉쳐 있을 때 한 번에 몇 명을 잡나');
{
  // 내 양옆에 셋이 다 손 닿는 거리(53px) 안에 있다
  const w = scene(400, [peer(2, 418), peer(3, 430), peer(4, 385)]);
  press(w, 'grab', true);
  check('한 명만 잡는다', w.player.grabbing >= 0 ? 1 : 0, 1);
  check('제일 가까운 사람(4번, 15px)을 잡는다', w.player.grabbing, 4);
  press(w, 'grab', false);
  press(w, 'grab', true);
  check('놓자마자 다시 누르면 안 잡힌다 (0.7초 쉼)', w.player.grabbing, -1);
  for (let i = 0; i < 45; i++) { w.bag.poops.length = 0; update(w, 1/60); }
  press(w, 'grab', true);
  check('0.75초 지나면 다시 잡힌다', w.player.grabbing >= 0, true);
  check('그래도 한 명뿐', typeof w.player.grabbing, 'number');
}

say('둘이 한 사람을 잡고 있다가 뿌리쳐지면 — 잡은 쪽 둘 다 놓는다');
{
  // 잡은 쪽 화면에서 본다. 내가 3번을 잡고 있고, 2번도 3번을 잡고 있다.
  const w = scene(400, [peer(2, 460, { grabbing: 3 }), peer(3, 421)]);
  press(w, 'grab', true);
  check('내가 3번을 잡았다', w.player.grabbing, 3);
  w.mp.others.get(3).escapes = 5;      // 3번이 뿌리쳤다
  interpolate(w, 1 / 60);
  check('내 손이 풀렸다', w.player.grabbing, -1);
  check('내가 뒤로 밀려난다', w.player.knock !== 0, true);
  check('다시 잡기까지 쉬어야 한다', w.player.grabCool > 0, true);
}

say('여러 명이 같은 한 사람을 동시에 잡을 수는 있나');
{
  const w = scene(400, [peer(2, 421, { grabbing: 1 }), peer(3, 379, { grabbing: 1 })]);
  interpolate(w, 1 / 60);
  check('나는 잡힌 상태다', w.player.heldBy >= 0, true);
  // 둘 다 「내가 저 사람을 잡았다」고 말하고 있으므로 양쪽에서 끌어당긴다
  for (let i = 0; i < 30; i++) { w.bag.poops.length = 0; interpolate(w, 1/60); update(w, 1/60); }
  check('30프레임 뒤에도 잡혀 있다', w.player.heldBy >= 0, true);
  check('둘 사이에 끼여 거의 못 움직인다', Math.abs(w.player.x - 400) < 14, true);

  const before = w.player.escapes;
  press(w, 'grab', true);                       // 한 번 눌러 뿌리친다
  check('한 번에 풀린다', w.player.heldBy, -1);
  check('뿌리침 횟수 +1', w.player.escapes, before + 1);
  // 뿌리침은 번호 하나라 **둘 다** 그것을 보고 놓는다
  check('밀려난다', w.player.knock !== 0, true);
}

say('내가 잡고 있는 동안 또 누가 붙어도 내 손은 한 명뿐');
{
  const w = scene(400, [peer(2, 420), peer(3, 424)]);
  press(w, 'grab', true);
  const first = w.player.grabbing;
  for (let i = 0; i < 20; i++) { w.bag.poops.length = 0; update(w, 1/60); }
  check('계속 같은 사람', w.player.grabbing, first);
  press(w, 'grab', true);                        // 누른 채로 또 눌러도
  check('바뀌지 않는다', w.player.grabbing, first);
}

done('여럿이 붙잡기');
