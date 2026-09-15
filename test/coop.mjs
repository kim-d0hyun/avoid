// 넷이서 — 타일 위의 물리와 규칙.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
import { readFileSync } from 'node:fs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const net = await import(R + 'game/net.js');
const coopMod = await import(R + 'games/coop.js');
const coop = coopMod.default;
const { T, STAGES, exitState, blinkOn } = coopMod;
import { check, ok, say, note, done } from './check.mjs';

const stage = (name) => STAGES.findIndex((s) => s.name === name);
const HALF_PX = 17;
const BUMP_W = 34;   // 몸 폭 (coop.js BUMP_AT)

// 물리·규칙 시험은 v3.10.0 의 넷이서 지도 위에서 돈다 (test/coop-legacy-stages.json). 판을 다시 짜도 「상자 계단 (24,15) 누름판」 같은
// 자리를 믿는 시험이 흔들리지 않게. 지금 판 묶음을 보는 시험(판 수·크기·마지막 판)은 legacy:false 로 부른다.
const LEGACY = JSON.parse(readFileSync(new URL('coop-legacy-stages.json', import.meta.url), 'utf8'));
function make(stageName = '표지판', { mp = false, host = true, debug = true, legacy = true } = {}) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'coop');
  world.debug = debug;
  world.onRecord = () => {}; world.onGameOver = (r) => { world.ended = r; };
  world.sent = []; world.send = (m, to) => world.sent.push({ m, to });
  if (mp) { world.mp.on = true; world.mp.role = host ? 'host' : 'guest'; world.mp.myId = host ? 1 : 2; }
  world.stage = stage(stageName);
  w.restart(world);
  const L = legacy ? LEGACY.findIndex((s) => s.name === stageName) : -1;
  if (L >= 0) { world.bag.stages = LEGACY; world.stage = L; coopMod.loadStage(world, L); coop.stand(world, 0); }
  world.state = 'play';
  world.bump = false;                         // 기존 시험은 충돌 끈 채로 본다 (충돌은 아래 따로)
  return world;
}
const tick = (world, n = 1, input = {}) => {
  Object.assign(world.input, { left: false, right: false, jump: false, duck: false }, input);
  for (let i = 0; i < n; i++) w.update(world, 1 / 60);
};
const feetRow = (world) => Math.floor((world.groundY - world.player.air - 1) / T);
const col = (world) => Math.floor(world.player.x / T);
const setPos = (world, tx, ty) => { const p = world.player; p.x = (tx + 0.5) * T; p.air = world.groundY - (ty + 1) * T; p.vx = 0; p.vy = 0; p.grounded = true; p.onLadder = false; };
/// 남을 하나 세운다 (자리는 칸 단위, ty 는 발이 선 줄).
const other = (world, id, tx, ty, extra = {}) => {
  const x = (tx + 0.5) * T, air = world.groundY - (ty + 1) * T;
  // interpolate 가 매 프레임 baseX/baseAir 로 자리를 다시 계산한다 — 그것까지 채워야 산 사람이다
  const o = { id, name: `친구${id}`, x, air, baseX: x, baseAir: air, age: 0, errorX: 0, vx: 0, vy: 0, crouch: 0, tcrouch: 0,
              facing: 1, walk: 0, dead: false, waiting: false, deadFor: 0, groundY: world.groundY, grabbing: -1, heldBy: -1,
              escapes: 0, seenEscapes: 0, ...extra };
  if (extra.crouch !== undefined) o.tcrouch = extra.crouch;
  world.mp.others.set(id, o); return o;
};

say('판 — 열다섯이 다 열리고 크기가 맞다');
{
  const world = make();
  check('판 수', STAGES.length, 15);
  for (const s of STAGES) {
    const world2 = make(s.name, { legacy: false });
    const b = world2.bag;
    if (!b.rows || b.rows.length !== s.h || b.rows[0].length !== s.w) { check(`${s.name} 크기`, [b.rows?.length, b.rows?.[0]?.length], [s.h, s.w]); }
    if (!b.exit) check(`${s.name} 출구`, !!b.exit, true);
    if (!b.spawn.every(Boolean)) check(`${s.name} 시작 자리 넷`, b.spawn.every(Boolean), true);
    if (world2.w !== s.w * T || world2.groundY !== s.h * T) check(`${s.name} 판 크기`, [world2.w, world2.groundY], [s.w * T, s.h * T]);
  }
  ok('열다섯 다 열렸다', true);
  check('첫 판은 뒷마당 표지판', [world.bag.def.world, world.bag.def.name], ['뒷마당', '표지판']);
  check('내 발이 시작 줄에 선다', feetRow(world), 18);
  check('시작 자리 칸', col(world), 20);
}

say('걷기 — 벽에 막히고, 구멍은 뛰어 넘고, 떨어진다');
{
  const world = make('상자 계단');           // 36×22, 땅 19줄, 단 둘
  world.bag.boxes = [];                     // 상자는 딴 시험에서. 여기선 벽만 본다
  setPos(world, 3, 18);
  tick(world, 200, { right: true });
  ok('오른콍으로 걸었다', world.player.x > 3.5 * T + 100);
  ok('첫 단(16칸) 앞에 막혔다', col(world) <= 15 && world.player.x > 15 * T);
  const x0 = world.player.x;
  tick(world, 30, { right: true });
  ok('벽에 붙어 더 못 간다', Math.abs(world.player.x - x0) < 2);
  ok('땅에 서 있다', world.player.grounded === true);
}

say('점프 — 두 칸은 넘고 세 칸은 못 넘는다');
{
  const world = make('상자 계단');
  // 벽 없는 곳에서 뛰어 꼭대기를 잰다
  setPos(world, 5, 18);
  let peak = 0;
  tick(world, 1, { jump: true });
  for (let i = 0; i < 60; i++) { tick(world, 1, {}); peak = Math.max(peak, world.player.air - (world.groundY - 19 * T)); }
  note(`점프 꼭대기 ${(peak / T).toFixed(2)}칸`);
  ok('두 칸은 넘는다', peak > 2.05 * T);
  ok('세 칸은 못 넘는다', peak < 2.95 * T);
  // 옆으로 네 칸: 달리면서 뛰어 얼마나 가나
  setPos(world, 5, 18);
  tick(world, 40, { right: true });
  const x0 = world.player.x; let far = 0;
  tick(world, 1, { right: true, jump: true });
  for (let i = 0; i < 80 && !world.player.grounded; i++) { tick(world, 1, { right: true }); far = world.player.x - x0; }
  note(`뛰어서 옆으로 ${(far / T).toFixed(2)}칸`);
  ok('네 칸은 간다', far > 4 * T);
}

say('웅크리기 — 한 칸 굴을 지난다');
{
  const world = make('상자 계단');
  world.bag.boxes = [];
  // 굴을 하나 만든다: 12~14칸 위에 천장(18줄)
  for (let x = 10; x <= 14; x++) world.bag.rows[17][x] = '#';   // 머리 위 한 칸 남기고 막는다 (발 18줄, 천장 17줄)
  setPos(world, 7, 18);
  tick(world, 90, { right: true });
  ok('서서는 굴에 못 들어간다', col(world) < 10);
  setPos(world, 7, 18);
  tick(world, 20, { duck: true });
  ok('웅크렸다', world.player.crouch > 0.9);
  tick(world, 220, { duck: true, right: true });
  ok('웅크려서 굴을 지난다', col(world) > 14);
}

say('사다리 — ⌥↑ 로 오르고 좌우를 누르면 놓는다');
{
  const world = make('두 길');               // 12칸에 사다리 (11~18줄)
  setPos(world, 12, 18);
  tick(world, 1, { jump: true });
  ok('사다리에 붙었다', world.player.onLadder === true);
  tick(world, 120, { jump: true });
  ok('2층에 올라섰다', feetRow(world) === 10 && world.player.grounded);
  setPos(world, 12, 18);
  tick(world, 1, { jump: true }); tick(world, 30, { jump: true });
  tick(world, 5, { right: true });
  ok('좌우를 누르면 사다리를 놓는다', world.player.onLadder === false);
}

say('가시 — 닿으면 죽고 시작 자리에서 다시 선다');
{
  const world = make('지키는 사람');          // 68~75칸 밑이 가시, 위는 깜빡이는 발판
  world.bag.clock = 2.5;                    // 발판이 꺼진 때
  setPos(world, 66, 18);
  tick(world, 1, { right: true });
  let died = false;
  for (let i = 0; i < 120 && !died; i++) { tick(world, 1, { right: true }); died = world.player.dead; }
  ok('꺼진 다리에서 떨어져 가시에 닿으면 죽는다', died);
  check('죽음을 센다', world.bag.deaths, 1);
  tick(world, 60, {});
  ok('0.8초 뒤 다시 선다', !world.player.dead);
  check('시작 자리다', col(world), 4);
}

say('깜빡이는 발판 — 켜진 2초 안에 여덟 칸을 건넌다');
{
  const world = make('지키는 사람');
  setPos(world, 62, 18);
  tick(world, 40, { right: true });          // 다리 앞까지 달려 속도를 붙인다
  world.bag.clock = 0.05;                   // 막 켜진 때
  ok('켜져 있다', blinkOn(world.bag));
  for (let i = 0; i < 130 && col(world) < 77; i++) tick(world, 1, { right: true });
  ok('건넜다', col(world) >= 77 && !world.player.dead);
  note(`건너는 데 ${world.bag.clock.toFixed(2)}초 (2초 안)`);
  world.bag.clock = 2.2;
  ok('2초 지나면 꺼진다', !blinkOn(world.bag));
}

say('상자 — 걸어가서 밀고, 무거운 것은 혼자 못 민다 (같이 할 때)');
{
  const world = make('상자 계단');
  const box = world.bag.boxes.find((b) => Math.round(b.y / T) === 19);   // 땅의 상자 (12칸)
  const bx0 = box.x;
  setPos(world, 10, 18);
  tick(world, 60, { right: true });
  ok('상자가 밀렸다', box.x > bx0 + 20);
  ok('미는 그림', world.player.pushing === true || box.x > bx0);
  // 무거운 상자: 같이 할 때 혼자면 안 밀린다
  const w2 = make('옥상', { mp: true, host: true });
  const heavy = w2.bag.boxes.find((b) => b.weight === 2);
  const hx0 = heavy.x;
  setPos(w2, 10, 26);
  tick(w2, 60, { right: true });
  ok('무거운 상자는 혼자 안 밀린다', Math.abs(heavy.x - hx0) < 1);
  // 둘이 밀면 밀린다 — 남 하나가 옆에서 같은 쪽으로. 남의 자리는 그쪽 화면이 정하니 상자에 붙여 따라오게 한다
  const mate = other(w2, 2, 11, 26, { vx: 4 });
  setPos(w2, 11, 26);
  for (let i = 0; i < 60; i++) { mate.baseX = heavy.x - 40; mate.age = 0; mate.errorX = 0; tick(w2, 1, { right: true }); }
  ok('둘이 밀면 밀린다', heavy.x > hx0 + 20);
  note(`둘이 1초 밀어 ${((heavy.x - hx0) / T).toFixed(2)}칸`);
}

say('상자 — 틈으로 밀면 떨어져 아래층에 앉는다');
{
  const world = make('3층 창고');
  const box = world.bag.boxes[0];           // 2층 45칸 상자
  check('2층에 있다', Math.round(box.y / T), 18);
  setPos(world, 44, 17);
  for (let i = 0; i < 400 && Math.round(box.y / T) < 27; i++) tick(world, 1, { right: true });
  check('1층 바닥에 앉았다', Math.round(box.y / T), 27);
  ok('틈 자리(52칸) 밑이다', Math.abs(box.x / T - 52.5) < 1.2);
}

say('색 열쇠 — 집으면 그 색 블록이 사라지고, 발밑이면 떨어진다');
{
  const world = make('두 열쇠');
  const b = world.bag;
  ok('빨간 블록이 막고 있다', coopMod.solidTile(b, 'R'));
  setPos(world, 34, 11);                    // 다락 끝 빨간 열쇠 자리 (바닥이 빨간 블록)
  tick(world, 2, {});
  ok('열쇠를 집었다', b.opened.has('r'));
  ok('빨간 블록이 사라졋다', !coopMod.solidTile(b, 'R'));
  tick(world, 90, {});
  check('발밑이 사라져 복도로 떨어졋다', feetRow(world), 18);
  ok('파란 블록은 아직 있다', coopMod.solidTile(b, 'B'));
}

say('스위치와 누름판 — 스위치는 남고, 누름판은 밟는 동안만');
{
  const world = make('표지판');
  const b = world.bag;
  ok('셔터 A 가 막고 있다', coopMod.solidTile(b, 'A'));
  setPos(world, 9, 7); tick(world, 2, {});
  ok('스위치를 밟으면 열린다', !coopMod.solidTile(b, 'A'));
  setPos(world, 40, 18); tick(world, 2, {});
  ok('내려와도 열린 채', !coopMod.solidTile(b, 'A'));

  const w2 = make('지키는 사람');
  ok('셔터 P 가 막고 있다', coopMod.solidTile(w2.bag, 'P'));
  setPos(w2, 20, 18); tick(w2, 2, {});
  ok('밟고 있으면 열린다', !coopMod.solidTile(w2.bag, 'P'));
  setPos(w2, 15, 18); tick(w2, 2, {});
  ok('떠나면 닫힌다', coopMod.solidTile(w2.bag, 'P'));
  // 상자를 올려 두면 열려 있다
  const w3 = make('3층 창고');
  const box = w3.bag.boxes[1];              // 1층 70칸 상자
  box.x = 64.5 * T; box.y = 27 * T;         // 누름판(64) 위로
  setPos(w3, 10, 26); tick(w3, 2, {});
  ok('상자가 눌러도 열린다', !coopMod.solidTile(w3.bag, 'P'));
}

say('포탈 — 들어가면 저편에서 나온다, 상자도');
{
  const world = make('탑');
  // 이 판엔 포탈이 없으니 하나 만든다
  const b = world.bag;
  b.rows[56][10] = 'u'; b.rows[46][20] = 'U'; b.portals = { u: { x: 10, y: 56 }, U: { x: 20, y: 46 } };
  setPos(world, 8, 56);
  for (let i = 0; i < 60 && feetRow(world) !== 46; i++) tick(world, 1, { right: true });
  ok('2층 20칸 근처로 나왔다', feetRow(world) === 46 && col(world) >= 20 && col(world) <= 22);
  // 상자
  const bx = b.boxes[0]; bx.x = 10.5 * T; bx.y = 57 * T;
  tick(world, 2, {});
  check('상자도 저편으로', [Math.round(bx.x / T - 0.5), Math.round(bx.y / T)], [20, 47]);
}

say('스프링 — 다섯 칸 튄다');
{
  const world = make('움직이는 발판');
  setPos(world, 57, 17);                    // 스프링(57,18) 바로 위에서 떨어진다
  world.player.grounded = false; world.player.vy = -10;
  let peak = 0;
  for (let i = 0; i < 120; i++) { tick(world, 1, {}); peak = Math.max(peak, world.player.air - (world.groundY - 19 * T)); }
  note(`스프링 꼭대기 ${(peak / T).toFixed(2)}칸`);
  ok('다섯 칸쯤 튄다', peak > 4.8 * T && peak < 6.5 * T);
}

say('왕복 발판 — 길을 오가고, 위에 서면 같이 간다');
{
  const world = make('움직이는 발판');
  const tr = world.bag.tracks.find((t) => t.x0 === 20);
  check('첫 길은 20~40칸', [tr.x0, tr.x1], [20, 40]);
  const p0 = tr.pos;
  tick(world, 60, {});
  ok('발판이 움직였다', Math.abs(tr.pos - p0) > 60);
  for (let i = 0; i < 1200 && tr.dir !== -1; i++) tick(world, 1, {});
  ok('끝에서 되돌아온다', tr.dir === -1);
  // 위에 서면 같이 간다
  const r = { x: tr.x0 * T + tr.pos + 60 };
  world.player.x = r.x; world.player.air = world.groundY - (tr.y * T + T * 0.3); world.player.grounded = true; world.player.vy = 0;
  const x0 = world.player.x;
  tick(world, 30, {});
  ok('발판 위에서 같이 움직였다', Math.abs(world.player.x - x0) > 30 && world.player.grounded);
}

say('남의 머리 — 밟고 서고, 웅크린 사람은 낮다 (계단)');
{
  const world = make('상자 계단', { mp: true });
  const o = other(world, 2, 8, 18);
  setPos(world, 8, 15); world.player.grounded = false; world.player.vy = -10;
  tick(world, 60, {});
  const fy = world.groundY - world.player.air;
  const top = o.groundY - o.air - 50 - 3;
  ok('머리 위에 섰다', Math.abs(fy - top) < 3 && world.player.grounded);
  o.crouch = 1; o.tcrouch = 1;
  tick(world, 30, {});
  const fy2 = world.groundY - world.player.air;
  ok('웅크리면 내가 내려온다 (계단)', fy2 > fy + 10);
  // 어깨: 머리 위에서 뛰면 세 칸 턱을 넘는다
  const peak0 = world.player.air;
  o.crouch = 0; o.tcrouch = 0; tick(world, 20, {});
  let peak = world.player.air;
  tick(world, 1, { jump: true });
  for (let i = 0; i < 60; i++) { tick(world, 1, {}); peak = Math.max(peak, world.player.air); }
  ok('머리 위에서 뛰면 세 칸을 넘는다', peak - (world.groundY - 19 * T) > 3 * T);
}

say('밟힌 사람 — 뛰지 못하고, 걸으면 위 사람이 같이 가고, 밑에서 뛰어 남을 뚫지 못한다');
{
  // ① 누가 내 머리 위에 서 있으면 나는 뛰지 못한다
  const world = make('상자 계단', { mp: true });
  setPos(world, 8, 18);
  const myTop = (19 * T) - 50 - 3;                       // 내 머리 꼭대기 (발 19T, 키 50, 틈 3)
  const o = other(world, 2, 8, 18);
  o.air = o.baseAir = world.groundY - myTop;             // 그 사람 발을 내 머리에 얹는다
  tick(world, 2, {});
  check('머리 위에 한 명', world.player.load, 1);
  const air0 = world.player.air;                          // 이 판의 바닥은 18줄 — air 가 0 이 아니다
  tick(world, 1, { jump: true });
  let top = 0;
  for (let i = 0; i < 30; i++) { tick(world, 1, { jump: true }); top = Math.max(top, world.player.air - air0); }
  ok('사람을 얹은 채로는 뛰지 못한다', top < 2);
  // 내려가면 뛴다
  world.mp.others.clear();
  tick(world, 2, {});
  check('머리 위에 아무도 없다', world.player.load, 0);
  tick(world, 1, { jump: true });
  for (let i = 0; i < 30; i++) { tick(world, 1, { jump: true }); top = Math.max(top, world.player.air - air0); }
  ok('내려가면 뛴다', top > 40);

  // ② 남의 머리 위에 서 있으면 그 사람이 걷는 만큼 같이 간다
  const w2 = make('상자 계단', { mp: true });
  const c = other(w2, 2, 8, 18);
  setPos(w2, 8, 15); w2.player.grounded = false; w2.player.vy = -10;
  tick(w2, 60, {});
  ok('머리 위에 섰다', w2.player.grounded && Math.abs((w2.groundY - w2.player.air) - (c.groundY - c.air - 53)) < 3);
  const x0 = w2.player.x;
  for (let i = 0; i < 60; i++) { c.baseX += 100 / 60; c.x = c.baseX; tick(w2, 1, {}); }
  ok('밟힌 사람이 100 걸으면 나도 100 간다', Math.abs((w2.player.x - x0) - 100) < 6);
  ok('그동안 떨어지지 않았다', w2.player.grounded);

  // ③ 위에 선 사람 밑에서 뛰면 몸에 머리를 찧고 떨어진다 — 뚫고 올라가 그 머리에 서지 않는다
  const w3 = make('상자 계단', { mp: true });
  setPos(w3, 8, 18);
  other(w3, 2, 8, 15);                                   // 나보다 세 줄 위에 떠 있는 사람 (발 16T = 내 머리 위 76px)
  tick(w3, 2, {});
  const air3 = w3.player.air;
  tick(w3, 1, { jump: true });
  let peak = 0;
  for (let i = 0; i < 90; i++) { tick(w3, 1, {}); peak = Math.max(peak, w3.player.air - air3); }
  ok('그 사람 발까지만 오르고 멎는다 (76px 안)', peak > 60 && peak < 80);
  check('다시 바닥에 선다', feetRow(w3), 18);
  ok('그 사람 머리 위에 올라서지 않았다', w3.player.grounded && Math.abs(w3.player.air - air3) < 2);
}

say('출구 — 「넷」 판은 넷이 다, 「한 명」 판은 하나면');
{
  const world = make('표지판', { mp: true });   // all
  const b = world.bag;
  setPos(world, b.exit.x, b.exit.y);
  check('하나면 아직', exitState(world).ready, false);
  other(world, 2, b.exit.x - 1, b.exit.y); other(world, 3, b.exit.x + 1, b.exit.y); other(world, 4, b.exit.x, b.exit.y);
  check('넷이면 된다', exitState(world), { inside: 4, need: 4, ready: true });
  const w1 = make('지키는 사람', { mp: true });  // one
  other(w1, 2, 5, 18); other(w1, 3, 5, 18); other(w1, 4, 5, 18);
  setPos(w1, w1.bag.exit.x, w1.bag.exit.y);
  check('한 명 판은 하나면 된다', exitState(w1).ready, true);
  // ⌥↑ 를 누르면 다음 판으로
  const before = w1.bag.stage;
  tick(w1, 2, { jump: true });
  ok('넘어가기 시작', w1.bag.done > 0);
  tick(w1, 60, {});
  check('다음 판이 열렸다', w1.bag.stage, before + 1);
  check('시작 자리에 선다', feetRow(w1), 18);
}

say('마지막 판을 깨면 끝');
{
  const world = make('마지막 열차', { mp: true });
  const b = world.bag;
  setPos(world, b.exit.x, b.exit.y);
  other(world, 2, b.exit.x, b.exit.y); other(world, 3, b.exit.x, b.exit.y); other(world, 4, b.exit.x, b.exit.y);
  tick(world, 2, { jump: true }); tick(world, 60, {});
  ok('이겼다', !!world.ended && world.ended.name === '넷이서');
}

say('시작 조건 — 넷이어야');
{
  const world = make('표지판', { mp: true, debug: false });
  check('셋이면 막힌다', coop.blocked(world), '넷이어야 시작한다 — 지금 1명');
  other(world, 2, 4, 18); other(world, 3, 4, 18);
  check('셋', coop.blocked(world), '넷이어야 시작한다 — 지금 3명');
  other(world, 4, 4, 18);
  check('넷이면 열린다', coop.blocked(world), null);
  other(world, 5, 4, 18);
  check('다섯도 막힌다', coop.blocked(world), '넷이어야 시작한다 — 지금 5명');
  const solo = make('표지판', { debug: false });
  ok('혼자는 막힌다 (개발용 아니면)', typeof coop.blocked(solo) === 'string');
}

say('되감기 — 방장 ⌥R 이면 상자·열쇠·사람이 처음으로, 횟수를 센다');
{
  const world = make('두 열쇠', { mp: true });
  world.mp.others.set(2, other(world, 2, 4, 18)); other(world, 3, 4, 18); other(world, 4, 4, 18);
  setPos(world, 34, 11); tick(world, 2, {});
  ok('열쇠를 집었다', world.bag.opened.has('r'));
  world.onMenu = (a) => { if (a === 'again') { world.bagResets = (world.bagResets ?? 0) + 1; w.restart(world); world.state = 'play'; } };
  tick(world, 40, {});                      // 판이 조금 돌아야 ⌥R 이 먹는다
  w.press(world, 'restart', true); w.press(world, 'restart', false);
  ok('빨간 블록이 돌아왔다', coopMod.solidTile(world.bag, 'R'));
  check('되감기 횟수', world.bag.resets, 1);
  check('같은 판이다', world.bag.def.name, '두 열쇠');
}

say('시간 제한 — 마지막 다섯 판에만 붙는다');
{
  const world = make('옥상', { mp: true });
  check('옥상은 170초', world.bag.limit, 170);
  check('3층 창고는 180초', make('3층 창고', { mp: true }).bag.limit, 180);
  check('동시에는 160초', make('동시에', { mp: true }).bag.limit, 160);
  check('무빙워크는 150초', make('무빙워크', { mp: true }).bag.limit, 150);
  check('종점은 180초', make('종점', { mp: true }).bag.limit, 180);
  // 앞의 아홉 판은 시간을 안 잰다
  for (const n of ['표지판', '상자 계단', '두 열쇠', '지키는 사람', '두 길', '엘리베이터', '움직이는 발판', '되돌아오기', '탑']) {
    if (make(n, { mp: true }).bag.limit !== 0) check(`${n} 은 제한 없음`, make(n, { mp: true }).bag.limit, 0);
  }
  ok('앞의 아홉 판은 제한이 없다', true);
  world.bag.clock = 169.9;
  tick(world, 10, {});
  ok('다 되면 되감는다', world.bag.resets === 1 && world.bag.clock < 1);
}

say('통 — 구멍에서 나와 굴러가고 벽에 부딛히면 부서진다, 맞으면 밀려난다');
{
  const world = make('지키는 사람');           // 104칸 구멍, 왼쪽으로
  const b = world.bag;
  tick(world, 100, {});                       // 1.5초 뒤 첫 통
  ok('통이 나왔다', b.barrels.length >= 1);
  const br = b.barrels[0];
  ok('왼쪽으로 굴러간다', br.vx < 0);
  setPos(world, 97, 18);                    // 구멍(104)과 셔터(92) 사이 — 통이 지나가는 길
  let hit = false;
  for (let i = 0; i < 600 && !hit; i++) { tick(world, 1, {}); hit = world.player.stun > 0; }
  ok('맞으면 넘어진다', hit);
  ok('밀려난다', Math.abs(world.player.knock) > 0 || world.player.x < 97 * T);
  ok('죽지는 않는다', !world.player.dead);
  for (let i = 0; i < 2000 && b.barrels.some((r) => !r.dead && r === br); i++) tick(world, 1, {});
  ok('벽(셔터·담)에 부딛혀 부서졌다', br.dead === true || !b.barrels.includes(br));
}

say('꾸러미 — 방장이 싼 것을 손님이 풀면 같은 판이 된다');
{
  const host = make('3층 창고', { mp: true, host: true });
  host.bag.boxes[0].x += 100; host.bag.opened.add('r'); host.bag.latched = true; host.bag.clock = 7.5; host.bag.resets = 2;
  const packed = JSON.parse(JSON.stringify(coop.pack(host)));
  check('판 번호', packed.st, stage('3층 창고'));
  const guest = make('표지판', { mp: true, host: false });
  coop.unpack(guest, packed);
  check('손님이 그 판을 연다', guest.bag.def.name, '3층 창고');
  check('시계', guest.bag.clock, 7.5);
  ok('열쇠 상태', guest.bag.opened.has('r'));
  ok('상자 자리가 따라온다 (멀면 그냥 옮긴다)', Math.abs(guest.bag.boxes[0].x - host.bag.boxes[0].x) < 1);
  check('되감기 횟수', guest.bag.resets, 2);
  // 깨진 꾸러미
  coop.unpack(guest, null); coop.unpack(guest, { st: 'x', bx: 'no', br: [[1]], ks: 7 });
  ok('깨진 꾸러미에도 안 터진다', guest.bag.def.name === '3층 창고');
}

say('손님 — 밀기와 출구는 방장에게 부탁한다');
{
  const guest = make('상자 계단', { mp: true, host: false });
  setPos(guest, 10, 18);
  tick(guest, 30, { right: true });
  ok('밀기 부탁을 보낸다', guest.sent.some((s) => s.m.k === 'push'));
  const host = make('상자 계단', { mp: true, host: true });
  other(host, 2, 10, 18, { vx: 4 });
  const box = host.bag.boxes.find((b) => Math.round(b.y / T) === 19);
  const bx0 = box.x;
  coop.message(host, 2, { k: 'push', i: host.bag.boxes.indexOf(box), d: 1, ep: host.mp.stageEpoch });
  tick(host, 30, {});
  ok('방장이 대신 민다', box.x > bx0 + 10);
  // 출구 부탁
  const g2 = make('지키는 사람', { mp: true, host: false });
  setPos(g2, g2.bag.exit.x, g2.bag.exit.y);
  tick(g2, 2, { jump: true });
  ok('출구 부탁', g2.sent.some((s) => s.m.k === 'exit'));
}

say('카메라 — 나를 따라가고 판 끝에서 멈춘다');
{
  const world = make('표지판');              // 108×22
  const vw = 36 * T, vh = 22 * T;
  setPos(world, 4, 18);
  let cam; for (let i = 0; i < 120; i++) cam = coop.camera(world, vw, vh);
  check('왼쪽 끝에서는 0 에 붙는다', Math.round(cam.x), 0);
  setPos(world, 60, 18);
  for (let i = 0; i < 200; i++) cam = coop.camera(world, vw, vh);
  ok('가운데쯤이면 나를 가운데 둔다', Math.abs(cam.x + vw / 2 - world.player.x) <= 4 * T + 1);
  setPos(world, 105, 18);
  for (let i = 0; i < 200; i++) cam = coop.camera(world, vw, vh);
  check('오른쪽 끝에서는 판 끝에 붙는다', Math.round(cam.x), 108 * T - vw);
  const small = make('상자 계단');           // 36×22 — 화면과 같다
  const c2 = small.bag && coop.camera(small, vw, vh);
  check('한 화면짜리 판은 안 움직인다', [Math.round(c2.x), Math.round(c2.y)], [0, 0]);
}


say('남의 발 — 꾸러미 사이에 발판을 뚫고 내려가지 않는다');
{
  // 남의 자리는 마지막 속도로 이어 그린다. 떨어지는 사람은 다음 꾸러미까지 발판 밑으로 파고든다 —
  // 넷이서에서는 착지마다 발이 땅에 박혀 보였다. 내려가던 발이 바닥을 지나면 바닥에 세운다.
  const world = make('상자 계단', { mp: true });   // 첫 단 윗면 16줄 (x 16~25)
  const top = 16 * T;
  const o = other(world, 2, 20, 15);
  o.baseAir = world.groundY - (top - 30); o.air = o.baseAir; o.vy = -120;   // 30px 위에서 떨어지는 중
  let lowest = 0;
  for (let i = 0; i < 40; i++) { tick(world, 1, {}); lowest = Math.max(lowest, o.groundY - o.air); }
  ok('발이 단 윗면 밑으로 안 내려간다', lowest <= top + 0.5);
  ok('단 윗면에 선다', Math.abs((o.groundY - o.air) - top) < 0.5);
  check('세로 속도 그림도 0', o.vyDraw, 0);
  // 올라가는 사람은 건드리지 않는다 — 선반 밑에서 뛰어 오르는 중일 수 있다
  const w2 = make('상자 계단', { mp: true });
  const u = other(w2, 2, 20, 18);
  u.vy = 500; u.baseAir = u.air;
  tick(w2, 10, {});
  ok('올라가는 중은 그대로 (16줄 단을 뚫고 오른다)', u.groundY - u.air < 19 * T - 40);
}

say('사다리 — 꼭대기에 서서 ⌥↓ 로 내려가고, 옆으로 내리면 그 층에 선다');
{
  const world = make('두 길');                // 12칸 사다리 11~18줄, 2층 바닥 11줄
  setPos(world, 12, 10);                     // 사다리 꼭대기 칸 위에 선다
  tick(world, 2, {});
  ok('꼭대기는 바닥이다', world.player.grounded && feetRow(world) === 10);
  tick(world, 30, { duck: true });
  ok('⌥↓ 로 사다리를 잡고 내려간다', world.player.onLadder === true && feetRow(world) > 10);
  ok('웅크리지 않았다', world.player.crouch < 0.3);
  tick(world, 200, { duck: true });
  ok('1층까지 내려와 선다', feetRow(world) === 18 && world.player.grounded);
  // 리프트 옆으로 내리기 — 바닥 끝을 몇 픽셀 못 미쳐도 올라선다
  const w2 = make('엘리베이터');              // 리프트 10칸 20~40줄, 2층 바닥 30줄 (x 11~)
  setPos(w2, 10, 29); w2.player.onLadder = true; w2.player.grounded = false;
  tick(w2, 1, { jump: true });               // 잡은 채 한 프레임
  tick(w2, 20, { right: true });
  ok('⌥→ 로 2층에 내려선다', w2.player.grounded && feetRow(w2) === 29 && col(w2) >= 10);
  ok('통로로 떨어지지 않았다', w2.player.onLadder === false && feetRow(w2) === 29);
}

say('삭은 발판 — 0.5초 밟으면 부서지고 3초 뒤 돌아온다');
{
  const world = make('상자 계단');
  const b = world.bag;
  b.boxes = [];
  for (let x = 8; x <= 12; x++) b.rows[15][x] = 'v';    // 15줄에 삭은 판자 다섯, 밑은 허공(16~18줄) — 땅은 19줄
  setPos(world, 10, 14); world.player.air = world.groundY - (15 * T + T * 0.3); world.player.grounded = true;
  tick(world, 12, {});
  ok('판자 위에 서 있다', world.player.grounded && Math.abs((world.groundY - world.player.air) - (15 * T + T * 0.3)) < 1);
  ok('삭아 가는 중', (b.rot.get('10,15')?.t ?? 0) > 0.1);
  tick(world, 30, {});
  ok('부서졌다', (b.rot.get('10,15')?.gone ?? 0) > 2);
  ok('부서진 자리는 발판이 아니다', !coopMod.floorBelow(world, 10.5 * T, 15 * T, 15 * T + 20));
  tick(world, 60, {});
  check('떨어져 땅에 섰다', feetRow(world), 18);
  tick(world, 200, {});
  ok('3초 뒤 돌아온다', !b.rot.has('10,15'));
  // 꾸러미에 실린다
  const packed = JSON.parse(JSON.stringify(coop.pack(world)));
  b.rot.set('10,15', { t: 0.2, gone: 1.5 });
  const p2 = coop.pack(world);
  check('삭은 발판 상태가 꾸러미에', p2.rt, [['10,15', 0.2, 1.5]]);
  const guest = make('상자 계단', { mp: true, host: false });
  coop.unpack(guest, JSON.parse(JSON.stringify(p2)));
  check('손님이 받는다', guest.bag.rot.get('10,15'), { t: 0.2, gone: 1.5 });
  ok('빈 꾸러미도 괜찮다', (coop.unpack(guest, packed), guest.bag.rot.size === 0));
}

say('네모 — 공중인지는 높이가 아니라 「섰나」로 본다');
{
  const { inAir } = await import(R + 'draw/block.js');
  ok('내 사람: 바닥에 서면 공중이 아니다 (2층이라 air 가 커도)', inAir({ grounded: true, air: 300 }) === false);
  ok('내 사람: 떠 있으면 공중', inAir({ grounded: false, air: 300 }) === true);
  ok('사다리에 매달리면 공중 아님', inAir({ grounded: false, onLadder: true }) === false);
  ok('남: 세로 속도 0 이면 서 있다', inAir({ vyDraw: 0, air: 300 }) === false);
  ok('남: 떨어지는 중이면 공중', inAir({ vyDraw: -200, air: 300 }) === true);
}

say('떨어지는 것 — 상자·통이 빨라져도 바닥을 뚫지 않는다');
{
  // 3층 창고: 2층 틈(52) 으로 떨어진 상자는 아홉 칸 아래 1층(27줄)에 앉아야 한다. 한 프레임에 19px 씩 갈 때다.
  const world = make('3층 창고');
  const box = world.bag.boxes[0];
  box.x = 52.5 * T; box.y = 18 * T;
  for (let i = 0; i < 120; i++) tick(world, 1, {});
  check('상자가 1층 바닥에 앉는다 (밑 27줄)', Math.round(box.y / T), 27);
  ok('판 밑으로 안 갔다', box.y < world.groundY);
  // 통: 상자 계단 언덕(12줄)에서 첫 단(16줄)으로 네 칸 떨어져도 단 위에 선다
  const w2 = make('상자 계단');
  w2.bag.chutes = [];
  w2.bag.barrels.push({ x: 24.5 * T, y: 12 * T, vx: 0, vy: 0, falls: 0, dead: false, spin: 0 });
  const br = w2.bag.barrels[0];
  for (let i = 0; i < 90; i++) tick(w2, 1, {});
  ok('통이 첫 단 위(16줄)에 선다', !br.dead && Math.abs(br.y - 16 * T) < 1);
}


say('무빙워크 — 사람을 실어 가고, 상자를 실어 가고, 상자에 밀어붙여도 속으로 넣지 않는다');
{
  const world = make('무빙워크');            // 44~48 역방향(<), 12~21 순방향(>)
  const b = world.bag;
  setPos(world, 16, 18); tick(world, 30, {});
  ok('순방향 무빙워크가 서 있는 사람을 오른쪽으로 실어 간다', world.player.x > 16.5 * T + 60);
  // 상자를 역방향 무빙워크에 올리면 알아서 왼쪽으로 가 턱(43)에 걸린다
  const box = b.boxes.find((x) => Math.round(x.x / T - 0.5) === 50);
  box.x = 48.5 * T;
  for (let i = 0; i < 300 && Math.abs(box.x - 44.5 * T) > 1; i++) tick(world, 1, {});
  ok('상자가 무빙워크에 실려 44칸까지 온다', Math.abs(box.x - 44.5 * T) < 2);
  ok('누름판이 눌린다', b.plates.p === true);
  // 사람이 46칸에 서면 왼쪽으로 실려 가 상자에 막힌다 — 상자 속이 아니라 옆에
  setPos(world, 46, 18); tick(world, 60, {});
  ok('상자 옆에서 선다 (속으로 안 들어간다)', world.player.x - HALF_PX >= box.x + T / 2 - 1);
  // 붙은 채로 반대쪽으로 걸으면 벗어난다 — 벨트가 끌어다 붙이는 걸 「내가 민다」로 치면 영영 못 벗어났다 (3.5.1)
  tick(world, 120, { right: true });
  ok('상자에 붙어 있다가 반대로 걸으면 벗어난다', world.player.x > 47 * T);
  setPos(world, 46, 18); tick(world, 60, {});
  ok('상자는 턱에 걸려 그대로', Math.abs(box.x - 44.5 * T) < 2);
}


say('남의 발 — 사다리를 타고 내려오는 사람은 꼭대기에 붙잡히지 않는다');
{
  // 사다리 꼭대기 칸은 「딛는 바닥」이다. 남의 발을 바닥에 세우는 계산이 그걸 바닥으로 치면,
  // 사다리를 내려오는 동료가 내 화면에서는 꼭대기에 붙어 안 내려온다.
  const world = make('두 길', { mp: true });        // 12칸 사다리, 꼭대기 11줄 (2층 바닥 높이)
  const o = other(world, 2, 12, 10);                // 꼭대기에 서 있다 (발 11T)
  tick(world, 3, {});                               // 서 있던 것으로 기억된다 (fyPrev = 꼭대기)
  o.vy = -190; o.age = 0;                           // 내려가기 시작 (초당 4.5칸) — 다음 꾸러미
  for (let i = 0; i < 6; i++) tick(world, 1, {});
  const fy = o.groundY - o.air;
  ok('여섯 프레임 뒤 내려와 있다 (꼭대기에 붙잡히지 않는다)', fy > 11 * T + 12);
  note(`발 ${(fy / T).toFixed(2)}줄 (꼭대기 11.00)`);
}


say('상자 위의 사람 — 상자가 무빙워크에 실려 가면 같이 간다');
{
  const world = make('무빙워크');
  const box = world.bag.boxes.find((x) => Math.round(x.x / T - 0.5) === 50);
  box.x = 48.5 * T;                                      // 역방향 무빙워크 위
  setPos(world, 48, 17); world.player.air = world.groundY - 18 * T; world.player.grounded = true;   // 상자 위
  tick(world, 2, {});
  const x0 = world.player.x;
  tick(world, 30, {});
  ok('상자가 왼쪽으로 갔다', box.x < 48.5 * T - 40);
  ok('위에 선 사람도 같이 갔다 (상자 위에 그대로)', Math.abs((world.player.x - x0) - (box.x - 48.5 * T)) < 6 && world.player.grounded);
}


say('사람끼리 부딪힘 — 같은 높이면 막고, 뒤에서 밀면 앞 사람이 밀린다');
{
  // ① 막힘 — 앞에 선 남을 뚫고 못 지나간다 (접촉해서 멈춘다)
  const world = make('상자 계단'); world.bump = true; world.bag.boxes = [];
  setPos(world, 6, 18);
  const o = other(world, 2, 8, 18);                 // 두 칸 오른쪽
  tick(world, 90, { right: true });
  ok('앞 사람을 뚫지 못한다', world.player.x < o.x);
  ok('접촉해서 멈춘다 (몸 폭 안)', o.x - world.player.x < BUMP_W + 4);
  note(`나 ${(world.player.x/T).toFixed(2)}칸, 앞 사람 ${(o.x/T).toFixed(2)}칸`);

  // ② 사람은 물리로 밀지 못한다 — 걸어 들어가면 접촉에서 멈추고, 가만한 동료는 밀려나지 않는다.
  // (무거운 상자는 사람을 미는 게 아니라 등 뒤 사슬을 세어 함께 민다 — 위 「기차놀이」.)
  const A = make('상자 계단'); A.bump = true; A.bag.boxes = [];
  const B = make('상자 계단'); B.bump = true; B.bag.boxes = [];
  A.mp.myId = 1; B.mp.myId = 2;
  setPos(A, 6, 18); setPos(B, 8, 18);               // A 뒤(걸어 들어감), B 앞(가만)
  const mirror = () => {
    A.mp.others.clear(); B.mp.others.clear();
    other(A, 2, 0, 18); const oa = A.mp.others.get(2); oa.x = oa.baseX = B.player.x; oa.air = oa.baseAir = B.player.air;
    other(B, 1, 0, 18); const ob = B.mp.others.get(1); ob.x = ob.baseX = A.player.x; ob.air = ob.baseAir = A.player.air;
  };
  const bx0 = B.player.x, ax0 = A.player.x;
  for (let i = 0; i < 120; i++) { mirror(); Object.assign(A.input, { left:false, right:true, jump:false, duck:false }); Object.assign(B.input, { left:false, right:false, jump:false, duck:false }); w.update(A, 1/60); w.update(B, 1/60); }
  ok('가만한 앞 사람은 밀려나지 않는다', Math.abs(B.player.x - bx0) < 2);
  ok('걸어온 뒤 사람은 접촉에서 멈춘다 (뚫지 않는다)', A.player.x < B.player.x && B.player.x - A.player.x <= BUMP_W + 2);
  ok('뒤 사람이 앞으로 나아가긴 했다', A.player.x > ax0 + 20);
  note(`앞 ${((B.player.x-bx0)/T).toFixed(2)}칸, 뒤 ${((A.player.x-ax0)/T).toFixed(2)}칸, 사이 ${(B.player.x-A.player.x).toFixed(0)}px`);

  // ③ 머리 위/밑(계단·어깨)은 가로로 안 민다 — 세로 관계다
  const w3 = make('상자 계단'); w3.bump = true; w3.bag.boxes = [];
  setPos(w3, 8, 18);
  const under = other(w3, 2, 8, 18);
  under.air = w3.groundY - (18 * T - 53); under.baseAir = under.air;   // 그 사람 머리가 내 발
  const x0 = w3.player.x;
  tick(w3, 20, {});
  ok('밟고 선 사람은 가로로 안 밀어낸다', Math.abs(w3.player.x - x0) < 6);
}


say('스위치로 나오는 발판 n — a 를 밟으면 solid, 아니면 통과');
{
  const world = make('표지판');
  const b = world.bag;
  b.rows[10][40] = 'n';                       // 아무 데나 하나
  ok('처음엔 발판이 없다 (통과)', !coopMod.solidTile(b, 'n'));
  b.latched = true;
  ok('스위치를 밟으면 발판이 나온다 (solid)', coopMod.solidTile(b, 'n'));
  ok('나온 발판을 딛는다', coopMod.floorBelow(world, 40.5 * T, 10 * T, 10 * T + 20) === 10 * T);
}

say('누름판으로 나오는 발판 M — p 를 밟는 동안만');
{
  const world = make('표지판');
  const b = world.bag;
  ok('안 밟으면 없다', !coopMod.solidTile(b, 'M'));
  b.plates.p = true;
  ok('p 를 밟으면 나온다', coopMod.solidTile(b, 'M'));
}


say('나오는 발판 위에 서 있는데 누름판이 풀리면 — 떨어진다');
{
  const world = make('3층 창고');                    // (106,7) 이 m, (102,8) 이 q
  const b = world.bag;
  const holder = other(world, 2, 102, 8);          // 2 가 누름판 q 를 밟고 있다
  tick(world, 3, {});
  ok('남이 밟아도 누름판이 눌린다', b.plates.q === true);
  setPos(world, 106, 6); world.player.grounded = true;   // 나는 발판 m 위
  tick(world, 10, {});
  check('발판이 받쳐 준다', feetRow(world), 6);
  holder.x = 104.5 * T; holder.baseX = holder.x;   // 2 가 내려선다
  tick(world, 60, {});
  ok('누름판이 풀렸다', b.plates.q === false);
  check('발판이 사라져 3층 바닥까지 떨어졌다', feetRow(world), 8);
}


say('상자로 누른 누름판 — 사람이 없어도 다리가 남는다');
{
  const world = make('상자 계단');                   // 첫 단 위 누름판 (24,15) · 가시 구덩이 위 다리 M (26~29,16)
  const b = world.bag;
  ok('처음엔 다리가 없다', !coopMod.solidTile(b, 'M'));
  const box = b.boxes.find((x) => Math.round(x.y / T) === 16);   // 첫 단 위 상자 (20,15)
  box.x = 24.5 * T;                                              // 누름판 위로
  setPos(world, 3, 18); tick(world, 3, {});
  ok('상자가 누르면 누름판이 눌린다', b.plates.p === true);
  ok('아무도 없는데 다리가 나 있다', coopMod.solidTile(b, 'M'));
  check('구덩이 위를 딛는다', coopMod.floorBelow(world, 27.5 * T, 16 * T, 16 * T + 20), 16 * T);
  box.x = 20.5 * T; tick(world, 3, {});
  ok('상자를 치우면 다리가 사라진다', !coopMod.solidTile(b, 'M') && b.plates.p === false);
}

say('구멍에 넣은 상자 — 4층에서 로비 누름판까지 떨어진다');
{
  const world = make('엘리베이터');                  // 26~27칸이 4층부터 로비까지 뚫려 있다. 로비 누름판 (27,40)
  const b = world.bag;
  ok('로비 셔터 P 가 막고 있다', coopMod.solidTile(b, 'P'));
  const box = b.boxes.find((x) => Math.round(x.y / T) === 12);   // 4층 상자 (33,11)
  box.x = 27.5 * T;                                              // 구멍 위로
  setPos(world, 3, 40);
  for (let i = 0; i < 300 && Math.round(box.y / T) < 41; i++) tick(world, 1, {});
  tick(world, 5, {});
  check('세 층을 지나 로비 바닥에 앉았다', Math.round(box.y / T), 41);
  ok('누름판이 눌려 셔터가 열린다', b.plates.p === true && !coopMod.solidTile(b, 'P'));
}

say('포탈 — 저편에 내려선 채 가만히 있어도 되돌아가지 않는다. 떠났다 다시 들어오면 다시 탄다');
{
  const world = make('무빙워크');                    // u (62,15) 선반 위 · U (78,11) 승강장 선반
  const b = world.bag, p = world.player;
  setPos(world, 62, 15); p.grounded = true;
  tick(world, 5, {});
  check('포탈을 탔다', Math.floor(p.x / T), 78);
  tick(world, 120, {});                            // 2초 가만히
  check('가만히 서 있어도 그 자리', Math.floor(p.x / T), 78);
  tick(world, 30, { right: true });                // 칸을 떠난다
  ok('떠났다', Math.floor(p.x / T) !== 78);
  setPos(world, 78, 11); p.grounded = true; tick(world, 5, {});
  check('다시 들어오면 다시 탄다 (u 로)', Math.floor(p.x / T), 62);
  // 뛰어 오르는 중에 들어가도 저편에서 튀어 올랐다 되돌아가지 않는다 — 오르던 속도는 포탈에서 버린다
  // (어깨에서 뛴 것처럼) 몸 가운데가 포탈 칸 바로 아래에서 오르는 중 — 다음 프레임에 포탈 칸으로 들어간다
  b.portalCool = 0; p.x = 62.5 * T; p.air = world.groundY - 700; p.grounded = false; p.vx = 0; p.vy = 468; p.onPortal = false; tick(world, 6, {});
  check('뛰어 들어가도 저편(U)에 나온다', Math.floor(p.x / T), 78);
  tick(world, 90, {});
  check('1.5초 뒤에도 저편에 그대로 (되돌아가지 않았다)', Math.floor(p.x / T), 78);
}


say('판 도중에 들어온 사람 — 출구 인원에 안 세고, 다음 판부터 낀다');
{
  const world = make('표지판', { mp: true, host: true });
  world.mp.round = 1; world.mp.roster = new Set([2, 3, 4]);
  const b = world.bag, cx = b.exit.x, cy = b.exit.y;
  setPos(world, cx, cy); world.player.grounded = true;
  for (const id of [2, 3, 4]) other(world, id, cx + (id - 3), cy);
  const late = other(world, 5, 3, 18); late.waiting = true; late.dead = true;          // 판 도중 들어와 구경 중
  const ex = coopMod.exitState(world);
  check('넷이 모이면 된다 — 구경하는 다섯째는 안 센다', ex.need, 4);
  ok('출구가 켜진다', ex.ready);
  // 다음 판으로 넘어가면 그 사람도 낀다
  world.bag.done = 0.01; world.input.jump = true;
  tick(world, 3, { jump: true });
  ok('다음 판으로 갔다', b.stage === 1);
  ok('방장 명단에 올랐다', world.mp.roster.has(5) && world.mp.alive.get(5) === true);
  ok('몸이 생겼다', !late.waiting && !late.dead);
  // 손님(구경 중) 쪽 — 판이 바뀐 스냅샷을 받으면 구경을 끝낸다
  const guest = make('표지판', { mp: true, host: false });
  guest.mp.waiting = true; guest.player.dead = true;
  coop.unpack(guest, { st: 1, rs: 0, ck: 0, ks: '', la: false, pl: [false, false], bx: [], br: [], tr: [], rt: [], dn: 0 });
  ok('손님도 구경을 끝내고 판에 낀다', !guest.mp.waiting && !guest.player.dead && guest.bag.stage === 1);
}


say('기차놀이 — 무거운 상자는 등 뒤에 붙어 같은 쪽으로 걷는 사람까지 센다 (사람끼리 겹치지 않아도)');
{
  const world = make('옥상', { mp: true, host: true }); world.bump = true;
  const b = world.bag; const bx = b.boxes.find((x) => x.weight === 2);
  const fyRow = Math.round(bx.y / T) - 1;                                    // 상자가 선 줄
  const front = bx.x - (T / 2 + HALF_PX + 0.5), back = front - (2 * HALF_PX + 2), far = front - (2 * HALF_PX + 40);
  const place = (x) => { world.player.x = x; world.player.air = world.groundY - (fyRow + 1) * T; world.player.grounded = true; };
  // ① 혼자 붙어 밀면 안 움직인다
  place(front); const x0 = bx.x; tick(world, 30, { right: true });
  ok('혼자서는 무거운 상자가 안 밀린다', Math.abs(bx.x - x0) < 1);
  // ② 등 뒤에 한 명이 붙어 같은 쪽으로 걸으면 둘 — 밀린다
  const o = other(world, 2, 0, fyRow); o.x = o.baseX = back; o.vx = 120;
  place(front); tick(world, 60, { right: true });
  ok('등 뒤에서 같이 밀면 밀린다', bx.x - x0 > 30);
  note(`상자 ${((bx.x - x0) / T).toFixed(2)}칸 이동`);
  // ③ 뒤 사람이 서 있기만 하면(걷지 않으면) 사슬이 아니다
  const w3 = make('옥상', { mp: true, host: true }); w3.bump = true; const b3 = w3.bag.boxes.find((x) => x.weight === 2);
  const o3 = other(w3, 2, 0, fyRow); o3.x = o3.baseX = b3.x - (T / 2 + HALF_PX + 0.5) - (2 * HALF_PX + 2); o3.vx = 0;
  w3.player.x = b3.x - (T / 2 + HALF_PX + 0.5); w3.player.air = w3.groundY - (fyRow + 1) * T; w3.player.grounded = true;
  const x3 = b3.x; tick(w3, 60, { right: true });
  ok('서 있기만 하는 사람은 안 센다', Math.abs(b3.x - x3) < 1);
  // ④ 사슬이 끊기면(뒤 사람이 한 칸 떨어져) 안 센다
  const w4 = make('옥상', { mp: true, host: true }); w4.bump = true; const b4 = w4.bag.boxes.find((x) => x.weight === 2);
  const o4 = other(w4, 2, 0, fyRow); o4.x = o4.baseX = b4.x - (T / 2 + HALF_PX + 0.5) - (2 * HALF_PX + 40); o4.vx = 120;
  w4.player.x = b4.x - (T / 2 + HALF_PX + 0.5); w4.player.air = w4.groundY - (fyRow + 1) * T; w4.player.grounded = true;
  const x4 = b4.x; tick(w4, 60, { right: true });
  ok('떨어져 걷는 사람은 사슬이 아니다', Math.abs(b4.x - x4) < 1);
}

say('기차놀이 — 두 세상이 각자 굴려도 등 뒤에서 함께 밀면 밀린다 (충돌 켠 채)');
{
  const A = make('옥상', { mp: true, host: true }); A.bump = true;
  const B = make('옥상', { mp: true, host: false }); B.bump = true; B.mp.myId = 2;
  const bx = A.bag.boxes.find((x) => x.weight === 2); const fyRow = Math.round(bx.y / T) - 1;
  const front = bx.x - (T / 2 + HALF_PX + 0.5);
  A.player.x = front; A.player.air = A.groundY - (fyRow + 1) * T; A.player.grounded = true;
  B.player.x = front - (2 * HALF_PX + 2); B.player.air = B.groundY - (fyRow + 1) * T; B.player.grounded = true;
  A.send = () => {}; B.send = (m) => { if (m.k === 'push') coop.message(A, 2, m); };   // 손님의 밀기 부탁은 방장에게
  const mirror = () => {
    A.mp.others.clear(); B.mp.others.clear();
    const oa = other(A, 2, 0, fyRow); oa.x = oa.baseX = B.player.x; oa.vx = B.player.vx;
    const ob = other(B, 1, 0, fyRow); ob.x = ob.baseX = A.player.x; ob.vx = A.player.vx;
    B.bag.boxes[A.bag.boxes.indexOf(bx)].x = bx.x;                            // 방장 상자 자리를 손님이 받는다
  };
  const x0 = bx.x;
  for (let i = 0; i < 90; i++) { mirror(); Object.assign(A.input, { left: false, right: true, jump: false, duck: false }); Object.assign(B.input, { left: false, right: true, jump: false, duck: false }); w.update(A, 1 / 60); w.update(B, 1 / 60); }
  ok('앞은 상자에, 뒤는 앞사람 등에 붙어 둘이 밀었다', bx.x - x0 > 40);
  ok('둘은 겹치지 않았다 (등에 붙어 몇 px 파묻힐 뿐)', A.player.x - B.player.x >= 2 * HALF_PX - 10);
  note(`상자 ${((bx.x - x0) / T).toFixed(2)}칸 · 사이 ${(A.player.x - B.player.x).toFixed(0)}px`);
}


say('되감기 — 방에 넷이 아니어도(하나 나갔거나 구경이 있어도) 방장 ⌥R 이 먹는다');
{
  const world = make('표지판', { mp: true, host: true });
  const sent = []; const shell = { net: { send: (m) => sent.push(m) }, log() {} };
  for (const id of [2, 3, 4]) other(world, id, 4, 18);
  net.startRound(world, shell, { restart: (w0) => w.restart(w0) });
  check('넷이 시작', world.state, 'play');
  world.mp.others.delete(4);                                                 // 하나 나갔다 — 셋
  world.stage = 0; world.player.x = 30 * T; const r0 = world.mp.round;
  net.startRound(world, shell, { restart: (w0) => w.restart(w0) });         // ⌥R
  ok('셋이어도 되감긴다', world.mp.round === r0 + 1 && Math.abs(world.player.x - 30 * T) > T);
  ok('손님에게 go 가 간다', sent.some((m) => m.t === 'go'));
}

say('부딪힘 — 벼랑 끝에 선 사람은 동료가 밀어도 떨어지지 않는다 (떨어지는 건 제 발로만)');
{
  const world = make('표지판', { mp: true, host: true }); world.bump = true; world.bag.chutes = [];
  const b = world.bag;
  let edge = -1; for (let x = 2; x < b.w - 1; x++) if (b.rows[19][x] === '#' && b.rows[19][x + 1] !== '#') { edge = x; break; }
  ok('도랑 가장자리를 찾았다', edge > 0);
  setPos(world, edge, 18); world.player.grounded = true;                    // 나는 벼랑 끝에 서 있다
  const o = other(world, 2, edge - 1, 18); o.vx = 200;                       // 동료가 뒤에서 걸어 들어온다
  const x0 = world.player.x;
  for (let i = 0; i < 120; i++) { o.x = o.baseX = world.player.x - 2 * HALF_PX + 6; tick(world, 1, {}); }   // 계속 등에 붙어 밀린다
  ok('벼랑 밖으로 안 밀렸다 (발밑에 바닥이 있는 자리까지만)', world.player.x <= (edge + 1) * T - 6 && !world.player.dead);
  note(`가장자리 ${edge}칸, 나 ${(world.player.x / T).toFixed(2)}칸 (시작 ${(x0 / T).toFixed(2)})`);
}


say('부딪힘 — 누름판을 밟고 선 사람은 동료가 밀어도 안 밀린다 (다리가 사라지면 안 된다)');
{
  const world = make('표지판', { mp: true, host: true }); world.bump = true; world.bag.chutes = [];
  const b = world.bag; let px = -1, py = -1;
  for (let y = 0; y < b.h && px < 0; y++) for (let x = 0; x < b.w; x++) if (b.rows[y][x] === 'p') { px = x; py = y; break; }
  ok('누름판을 찾았다', px > 0);
  setPos(world, px, py); world.player.grounded = true; tick(world, 2, {});
  ok('밟고 있다', b.plates.p === true);
  const o = other(world, 2, px - 1, py); o.vx = 200;
  for (let i = 0; i < 120; i++) { o.x = o.baseX = world.player.x - 2 * HALF_PX + 6; tick(world, 1, {}); }
  ok('누름판에서 밀려나지 않았다', Math.floor(world.player.x / T) === px && b.plates.p === true);
}

say('이모트 — ⌥1~4 는 머리 위에 3초 말풍선. 방장이 손님 것을 남들에게 전한다');
{
  const world = make('표지판', { mp: true, host: true });
  w.press(world, "say1", true); w.press(world, "say1", false);
  check('내 머리에 「여기로 와!」', world.player.chat?.text, '여기로 와!');
  check('3초짜리', Math.round(world.player.chat.t), 3);
  ok('말을 보냈다', world.sent.some((s) => s.m.k === 'say' && s.m.n === 1));
  tick(world, 60, {}); ok('1초 뒤 아직 있다', (world.player.chat?.t ?? 0) > 1.5);
  tick(world, 130, {}); ok('3초 지나면 사라진다', !world.player.chat);
  // 손님이 보낸 say 를 방장이 받아 남에게 단다
  const host = make('표지판', { mp: true, host: true });
  other(host, 2, 10, 18);
  coop.message(host, 2, { k: 'say', n: 2, who: 2 });
  check('2번 머리에 「먼저 가!」', host.mp.others.get(2).chat?.text, '먼저 가!');
  ok('방장이 다른 손님들에게 전한다', host.sent.some((s) => s.m.k === 'say' && s.m.who === 2));
  // 없는 번호는 무시
  const w3 = make('표지판', { mp: true, host: true });
  w.press(w3, "say5", true);
  ok('없는 번호(5)는 아무 일 없다', !w3.player.chat);
}

say('열린 판 — 방장이 판을 깨면 다음 판까지 열리고 셸에 남는다');
{
  const world = make('표지판', { mp: true, host: true });
  const saved = [];
  world.progress = {};
  world.saveProgress = (id, i) => saved.push([id, i]);
  world.mp.round = 1; world.mp.roster = new Set([2, 3, 4]);
  const b = world.bag;
  for (const id of [2, 3, 4]) other(world, id, b.exit.x + (id - 3), b.exit.y);
  setPos(world, b.exit.x, b.exit.y); world.player.grounded = true;
  ok('넷이 출구에 모였다', exitState(world).ready);
  tick(world, 2, { jump: true }); tick(world, 60, {});
  check('다음 판이 열렸다', b.stage, 1);
  check('열린 판이 1까지', world.progress.coop, 1);
  check('셸에도 남겼다', saved, [['coop', 1]]);
}

say('새 협동 장치 — 전원 집결 체크포인트, 시한문, 구조 사다리');
{
  const world = make('표지판', { mp: true, host: true });
  world.bag.chutes = [];
  for (let x = 5; x <= 8; x++) world.bag.rows[18][x] = 'c';
  for (let y = 16; y <= 18; y++) world.bag.rows[y][12] = 'C';
  setPos(world, 5, 18);
  for (const [id, x] of [[2, 6], [3, 7], [4, 8]]) other(world, id, x, 18);
  tick(world, 17, {});
  ok('0.3초 전에는 집결문이 닫혀 있다', coopMod.solidTile(world.bag, 'C'));
  tick(world, 2, {});
  ok('넷이 모이면 집결문이 열린다', !coopMod.solidTile(world.bag, 'C') && world.bag.rally);
  const checkpointX = world.player.x;
  setPos(world, 20, 18); world.player.dead = true; world.player.deadFor = 0;
  tick(world, 50, {});
  check('사망하면 집결 지점에서 부활한다', Math.round(world.player.x), Math.round(checkpointX));
  const cam = coop.camera(world, 600, 400);
  ok('부활 화면은 집결 자리를 가운데 둔다 (출발 자리로 튀지 않는다)', Math.abs((cam.x + 300) - (checkpointX + 1.5 * T)) < T * 2);

  world.bag.rows[18][22] = 't';
  for (let y = 16; y <= 18; y++) world.bag.rows[y][25] = 'T';
  setPos(world, 22, 18); tick(world, 1, {});
  ok('시한 스위치가 문을 연다', world.bag.timed > 9 && !coopMod.solidTile(world.bag, 'T'));
  setPos(world, 25, 18); world.bag.timed = 1 / 120; tick(world, 2, {});
  ok('사람이 문 안에 있으면 닫히지 않는다', world.bag.timed > 0 && !coopMod.solidTile(world.bag, 'T'));

  world.bag.rows[18][28] = 'l';
  for (let y = 15; y <= 18; y++) world.bag.rows[y][30] = 'L';
  setPos(world, 30, 18); tick(world, 1, { jump: true });
  ok('펼치기 전 구조 사다리는 잡히지 않는다', !world.player.onLadder);
  setPos(world, 28, 18); tick(world, 1, {});
  ok('구조 스위치를 밟으면 사다리가 펼쳐진다', world.bag.ladderOpen);
  setPos(world, 30, 18); tick(world, 1, { jump: true });
  ok('펼친 구조 사다리를 잡는다', world.player.onLadder);

  const guest = make('표지판', { mp: true, host: false });
  world.bag.timed = 4;
  coop.unpack(guest, coop.pack(world));
  ok('신규 장치 상태와 체크포인트가 동기화된다', guest.bag.rally && guest.bag.timed > 0
    && guest.bag.ladderOpen && guest.bag.checkpoint?.length === 4);
}

// ── 기획서 4장 장치 — 빈 시험 판에 세워 본다 ──────────────────────────────────
/// 글자 그림으로 시험 판을 하나 만들어 판 묶음 끝에 붙이고 연다. 땅은 19줄(발은 18줄).
function custom(paint, { mp = true } = {}) {
  const W0 = 44, H0 = 22;
  const g = Array.from({ length: H0 }, (_, y) => Array.from({ length: W0 }, (_, x) => (y === 0 || y >= 19 || x === 0 || x === W0 - 1) ? '#' : '.'));
  g[18][2] = '1'; g[18][3] = '2'; g[18][4] = '3'; g[18][5] = '4'; g[18][40] = 'O';
  paint((x, y, ch) => { g[y][x] = ch; });
  const world = make('표지판', { mp });
  const b = world.bag;
  const def = { ...STAGES[0], name: '시험 판', w: W0, h: H0, art: g.map((r) => r.join('')), notes: [], limit: 0, end: 'all' };
  b.stages = [...b.stages, def];
  coopMod.loadStage(world, b.stages.length - 1); coop.stand(world, 0);
  b.chutes = [];
  return world;
}
const standAt = (world, o, fy) => { o.air = o.baseAir = world.groundY - fy; o.fyPrev = undefined; };
const moveTo = (o, x) => { o.x = o.baseX = x; };            // 남의 자리는 매 프레임 baseX 에서 다시 잡힌다

say('사람 계단 — 밑에서 뛰어오르는 남의 머리가 위 사람을 들어 올리지 않는다');
{
  // 가운데 받침(나)은 맨 밑 받침(2) 머리 위에 서 있고, 오르는 사람(3)이 땅에서 내 옆에 몸이 겹쳐 붙어 뛴다.
  // 3 의 머리는 처음에 내 발과 같은 높이다. 고치기 전에는 3 이 뛰는 대로 내가 한 몸 높이 솟았다.
  const world = custom(() => {});
  const fy0 = 19 * T, p = world.player;
  other(world, 2, 10, 18);
  p.x = 10.5 * T; p.air = world.groundY - (fy0 - 53); p.grounded = true; p.vy = 0;
  tick(world, 3, {});
  check('나는 2 의 머리 위에 선다', Math.round(world.groundY - p.air), fy0 - 53);
  const c = other(world, 3, 10, 18); moveTo(c, 10.5 * T + 20);
  let highest = world.groundY - p.air;
  for (let i = 0; i < 20; i++) { standAt(world, c, fy0 - 9 * (i + 1)); tick(world, 1, {}); highest = Math.min(highest, world.groundY - p.air); }
  check('3 이 뛰어도 나는 안 솟는다', Math.round(highest), fy0 - 53);
}

say('무거운 상자 — 늦게 오는 동료가 상자를 지나쳐 보여도, 밀기를 부탁했으면 센다');
{
  // 남은 마지막 꾸러미에서 **속도로 이어 그린다**. 상자에 막혀 선 사람도 vx 는 달리는 속도 그대로라
  // 유령이 최대 1.24칸 앞질러 — 상자를 지나쳐 — 그려진다. 그 자리로 「상자 뒤에 있나」를 재면 미는 사람이 빠졌다.
  const world = custom((put) => { put(20, 18, 'X'); });
  const b = world.bag, box = b.boxes[0], x0 = box.x;
  check('무거운 상자다', box.weight, 2);
  setPos(world, 19, 18);
  const o = other(world, 2, 18, 18, { vx: 290 });
  coop.message(world, 2, { k: 'push', i: 0, d: 1, ep: world.mp.stageEpoch });
  o.x = o.baseX = box.x + 26;                      // 유령이 상자를 지나쳐 보인다
  tick(world, 40, { right: true });
  ok('둘이 미니 상자가 간다', box.x > x0 + 10);
  // 부탁하지 않은 동료는 그대로 자리로 판정한다 — 상자 너머에 선 사람은 미는 사람이 아니다
  const world2 = custom((put) => { put(20, 18, 'X'); });
  const box2 = world2.bag.boxes[0], y0 = box2.x;
  setPos(world2, 19, 18);
  const o2 = other(world2, 2, 18, 18, { vx: 290 });
  o2.x = o2.baseX = box2.x + 26;
  tick(world2, 40, { right: true });
  ok('부탁 없이 상자 너머에 선 사람은 안 센다', Math.abs(box2.x - y0) < 3);
}

say('집결판 무리 둘 — 무리마다 한 번씩 체크포인트, 첫 집결이 집결문을 연다');
{
  const world = custom((put) => { for (const x of [6, 8, 10, 12]) put(x, 18, 'c'); for (let y = 16; y <= 18; y++) put(16, y, 'C');
                                  for (const x of [24, 26, 28, 30]) put(x, 18, 'c'); });
  const b = world.bag;
  const gather = (xs) => { setPos(world, xs[0], 18); [2, 3, 4].forEach((id, i) => other(world, id, xs[i + 1], 18)); tick(world, 25); };
  gather([6, 8, 10, 24]);
  ok('무리가 섞이면 집결이 아니다', !b.rally);
  gather([6, 8, 10, 12]);
  ok('첫 무리 — 집결문이 열리고 체크포인트', b.rally && !coopMod.solidTile(b, 'C') && Math.round(b.checkpoint[0][0]) === Math.round(6.5 * T));
  gather([24, 26, 28, 30]);
  ok('둘째 무리 — 체크포인트가 앞으로 옮겨진다', b.rallyDone.size === 2 && Math.round(b.checkpoint[0][0]) === Math.round(24.5 * T));
  gather([6, 8, 10, 12]);
  ok('지난 무리로 돌아가도 체크포인트는 그대로', Math.round(b.checkpoint[0][0]) === Math.round(24.5 * T));
  const guest = custom((put) => { for (const x of [6, 8, 10, 12]) put(x, 18, 'c'); for (let y = 16; y <= 18; y++) put(16, y, 'C'); for (const x of [24, 26, 28, 30]) put(x, 18, 'c'); });
  guest.mp.role = 'guest';
  coop.unpack(guest, coop.pack(world));
  check('손님도 두 무리를 안다', [...guest.bag.rallyDone].sort(), ['24,18', '6,18']);
  coop.unpack(guest, { ...coop.pack(world), ra: ['99,99', 'x', 7] });
  ok('없는 무리 이름은 버린다', guest.bag.rallyDone.size === 0);
}

say('사람 수 누름판 — k 는 서로 다른 둘, e 는 셋. 상자는 안 센다');
{
  const world = custom((put) => { put(10, 18, 'k'); put(11, 18, 'k'); for (let y = 16; y <= 18; y++) put(20, y, 'K');
                                  put(24, 18, 'e'); put(25, 18, 'e'); put(26, 18, 'e'); for (let y = 16; y <= 18; y++) put(30, y, 'E'); });
  const b = world.bag;
  setPos(world, 10, 18); coopMod.stepObjects(world, 1 / 60);
  ok('한 명이면 K 가 닫혀 있다', coopMod.solidTile(b, 'K'));
  other(world, 2, 11, 18); coopMod.stepObjects(world, 1 / 60);
  ok('둘이 밟으면 K 가 열린다', !coopMod.solidTile(b, 'K'));
  world.mp.others.delete(2); b.boxes.push({ x: 11.5 * T, y: 19 * T, vx: 0, vy: 0, weight: 1 }); coopMod.stepObjects(world, 1 / 60);
  ok('사람 하나 + 상자는 둘이 아니다', coopMod.solidTile(b, 'K'));
  b.boxes = [];
  setPos(world, 24, 18); other(world, 2, 25, 18); coopMod.stepObjects(world, 1 / 60);
  ok('둘이면 E 가 닫혀 있다', coopMod.solidTile(b, 'E'));
  other(world, 3, 26, 18); coopMod.stepObjects(world, 1 / 60);
  ok('셋이면 E 가 열린다', !coopMod.solidTile(b, 'E'));
  const guest = custom(() => {}, { mp: true }); guest.mp.role = 'guest';
  guest.bag.plateTiles = b.plateTiles;
  coop.unpack(guest, coop.pack(world));
  ok('사람 수 누름판 상태가 손님에게 간다', guest.bag.plates.e && !guest.bag.plates.k);
  const solo = custom((put) => { put(10, 18, 'k'); for (let y = 16; y <= 18; y++) put(20, y, 'K'); }, { mp: false });
  setPos(solo, 10, 18); coopMod.stepObjects(solo, 1 / 60);
  ok('혼자 연습할 때는 한 명이면 된다', !coopMod.solidTile(solo.bag, 'K'));
}

say('교대문 — 누름판 p 가 둘이면 어느 쪽이 눌려도 P 가 열린다');
{
  const world = custom((put) => { put(10, 18, 'p'); put(30, 18, 'p'); for (let y = 16; y <= 18; y++) put(20, y, 'P'); });
  setPos(world, 10, 18); coopMod.stepObjects(world, 1 / 60);
  ok('이쪽 판', world.bag.plates.p);
  setPos(world, 30, 18); coopMod.stepObjects(world, 1 / 60);
  ok('저쪽 판 — 건너간 사람이 이어받는다', world.bag.plates.p);
  setPos(world, 25, 18); coopMod.stepObjects(world, 1 / 60);
  ok('둘 다 비면 닫힌다', !world.bag.plates.p);
}

say('탑 감지기 — 전원이 층층이 쌓인 탑의 꼭대기가 닿아야 켜진다');
{
  // 발 19T. 넷 탑의 꼭대기 사람은 발이 19T-159 → 몸이 14~15줄에 걸린다.
  const world = custom((put) => { put(10, 15, 'i'); put(10, 14, 'i'); for (let y = 16; y <= 18; y++) put(20, y, 'I'); });
  const b = world.bag, fy0 = 19 * T, p = world.player;
  p.x = 10.5 * T; p.air = world.groundY - (fy0 - 159); p.grounded = false;
  coopMod.stepObjects(world, 1 / 60);
  ok('혼자 그 높이로 뛰어 스치면 안 켜진다', !b.tower && coopMod.solidTile(b, 'I'));
  for (const [id, k] of [[2, 0], [3, 1], [4, 2]]) { const o = other(world, id, 10, 18); standAt(world, o, fy0 - 53 * k); }
  moveTo(world.mp.others.get(4), 10.5 * T + 40);   // 셋째가 옆으로 비켜 섰다 — 사슬이 끊겼다
  coopMod.stepObjects(world, 1 / 60);
  ok('사슬이 끊기면 안 켜진다', !b.tower);
  moveTo(world.mp.others.get(4), 10.5 * T);
  coopMod.stepObjects(world, 1 / 60);
  ok('넷이 쌓은 탑의 꼭대기가 닿으면 켜진다', b.tower && !coopMod.solidTile(b, 'I'));
  world.mp.others.clear(); p.air = world.groundY - fy0; coopMod.stepObjects(world, 1 / 60);
  ok('내려와도 열린 채 남는다', b.tower);
  const guest = custom(() => {}); coop.unpack(guest, coop.pack(world));
  ok('손님도 열린 문을 본다', guest.bag.tower);
}

say('승강기 — V 는 둘이 타야 오르고, 비면 도로 내려온다. 오르다 내리면 떨어뜨리지 않고 돌아간다');
{
  // 기둥 21칸, 12~18줄. 위 승강장은 12줄 양옆 땅(19~20 · 23~24칸).
  const paint = (ch) => (put) => { for (let y = 12; y <= 18; y++) put(21, y, ch); for (const x of [17, 18, 19, 23, 24, 25]) put(x, 12, '#'); };
  const world = custom(paint('V'));
  const b = world.bag, lf = b.lifts[0], p = world.player;
  check('승강기 하나 · 길이 일곱 칸', [b.lifts.length, lf.len / T], [1, 7]);
  const top = () => coopMod.liftRect(lf).top;
  check('아래 승강장 발판은 땅과 높이가 같다', top(), 19 * T);
  setPos(world, 21, 18);
  tick(world, 60);
  check('혼자 서 있으면 안 오른다', lf.pos, 0);
  const o = other(world, 2, 20, 18);
  const ride = (n, carry = true) => { for (let i = 0; i < n; i++) { if (carry) standAt(world, o, top()); tick(world, 1); } };
  ride(30);
  ok('둘이 0.3초 서 있으면 오르기 시작한다', lf.dir === 1 && lf.pos > 0);
  ride(260);
  check('위 승강장에 선다', [lf.pos, lf.dir], [lf.len, 0]);
  check('내 발도 위 승강장 높이', Math.round(world.groundY - p.air), 12 * T);
  standAt(world, o, 12 * T); moveTo(o, 24.5 * T);   // 둘째가 내려 옆 땅에 섰다
  ride(150, false);
  check('누가 아직 타고 있으면 위에서 기다린다', [lf.pos, Math.round(world.groundY - p.air)], [lf.len, 12 * T]);
  setPos(world, 18, 11);                               // 나도 내려 왼쪽 땅에
  ride(60, false);
  check('비고 1초는 그대로', lf.pos, lf.len);
  ride(300, false);
  check('비고 1.5초 지나면 아래 승강장으로 내려온다', [lf.pos, lf.dir], [0, 0]);
  // 오르다 하나가 뛰어내리면 — 도로 내려간다
  setPos(world, 21, 18); standAt(world, o, top()); moveTo(o, 20.5 * T);
  ride(60);
  ok('다시 둘이 오른다', lf.dir === 1 && lf.pos > 0);
  moveTo(o, 15.5 * T); standAt(world, o, 19 * T);
  ride(4, false);
  check('하나가 내리면 아래로 돌아간다', lf.dir, -1);
  ride(300, false);
  check('떨어뜨리지 않고 아래 승강장에', [lf.pos, Math.round(world.groundY - p.air), p.dead], [0, 19 * T, false]);
  // N — 전원
  const all = custom(paint('N'));
  const lfN = all.bag.lifts[0];
  setPos(all, 21, 18); other(all, 2, 20, 18); other(all, 3, 22, 18);
  tick(all, 60);
  check('N 은 셋으로는 안 오른다', lfN.pos, 0);
  other(all, 4, 21, 18); standAt(all, all.mp.others.get(4), 19 * T - 53);   // 넷째는 누구 머리 위가 아니라 — 발판 위여야 한다
  moveTo(all.mp.others.get(4), 22.2 * T); standAt(all, all.mp.others.get(4), 19 * T);
  tick(all, 25);
  ok('넷이 다 타면 오른다', lfN.dir === 1);
  // 꾸러미
  const guest = custom(paint('V')); guest.mp.role = 'guest';
  lf.pos = 100; lf.dir = 1;
  coop.unpack(guest, coop.pack(world));
  ok('손님 승강기가 방장 쪽으로 녹아든다', guest.bag.lifts[0].pos > 20 && guest.bag.lifts[0].dir === 1);
  const solo = custom(paint('V'), { mp: false });
  setPos(solo, 21, 18); tick(solo, 40);
  ok('혼자 연습할 때는 혼자 타도 오른다', solo.bag.lifts[0].pos > 0);
}

say('분기 벨트 — 누름판을 밟는 동안 앞으로, 아니면 회수 쪽으로 · 상자 정차대');
{
  const world = custom((put) => { for (let x = 12; x <= 28; x++) put(x, 19, 'J'); put(8, 18, 'p'); });
  const b = world.bag;
  b.boxes = [{ x: 20.5 * T, y: 19 * T, vx: 0, vy: 0, weight: 1 }];
  setPos(world, 34, 18);
  tick(world, 30);
  ok('누름판이 비면 왼쪽(회수)으로', b.boxes[0].x < 20.5 * T - 20);
  const x0 = b.boxes[0].x;
  setPos(world, 8, 18); tick(world, 30);
  ok('누름판을 밟는 동안 오른쪽으로', b.boxes[0].x > x0 + 20);
  ok('사람도 벨트를 탄다', coopMod.beltDir(b, 'J') === 1);
  // 정차대 — 벨트 끝이 아니라 누름판에서 선다
  const park = custom((put) => { for (let x = 12; x <= 30; x++) put(x, 19, '>'); put(22, 18, 'q'); for (let y = 16; y <= 18; y++) put(36, y, 'Q'); });
  park.bag.boxes = [{ x: 14.5 * T, y: 19 * T, vx: 0, vy: 0, weight: 1 }];
  setPos(park, 5, 18);
  tick(park, 240);
  check('벨트가 실어 온 상자가 누름판에 선다', Math.floor(park.bag.boxes[0].x / T), 22);
  ok('누름판이 눌린 채', park.bag.plates.q);
  // 밀다가 조금 지나쳐도 누름판 가운데로 자리 잡는다
  const nudge = custom((put) => { put(20, 18, 'p'); });
  nudge.bag.boxes = [{ x: 20.5 * T + 15, y: 19 * T, vx: 0, vy: 0, weight: 1 }];
  setPos(nudge, 5, 18); tick(nudge, 30);
  ok('누름판 위 상자는 가운데로 자리 잡는다', Math.abs(nudge.bag.boxes[0].x - 20.5 * T) < 2 && nudge.bag.plates.p);
}

say('신호탑 — 신호탑에 보이는 모양의 버튼을 ⌥↓ 로. 틀리면 신호가 바뀐다');
{
  const world = custom((put) => { put(30, 17, 'z'); put(6, 18, 'd'); put(8, 18, 'f'); put(10, 18, 'g'); for (let y = 16; y <= 18; y++) put(14, y, 'Z'); });
  const b = world.bag;
  ok('신호는 셋 중 하나', [0, 1, 2].includes(b.signal));
  b.signal = 1;                                              // 동그라미 → f
  setPos(world, 6, 18); tick(world, 20);
  ok('걸어 서 있기만 해서는 안 눌린다', !b.signalOk && b.signal === 1);
  tick(world, 15, { duck: true });
  ok('틀린 버튼(세모)을 누르면 안 열리고 신호가 바뀐다', !b.signalOk && b.signal !== 1 && b.signalLock > 0);
  const changed = b.signal;
  tick(world, 90, { duck: true });
  check('누른 채로 기다려도 다시 안 먹는다 (한 번뿐)', [b.signal, b.signalOk], [changed, false]);
  tick(world, 5);
  b.signal = 2;                                              // 네모 → g
  setPos(world, 10, 18); tick(world, 15, { duck: true });
  ok('맞는 버튼을 누르면 신호문이 열린다', b.signalOk && !coopMod.solidTile(b, 'Z'));
  const guest = custom((put) => { put(30, 17, 'z'); put(6, 18, 'd'); put(8, 18, 'f'); put(10, 18, 'g'); for (let y = 16; y <= 18; y++) put(14, y, 'Z'); });
  guest.mp.role = 'guest';
  coop.unpack(guest, coop.pack(world));
  ok('신호와 신호문이 손님에게 간다', guest.bag.signal === 2 && guest.bag.signalOk);
  const fresh = custom((put) => { put(30, 17, 'z'); put(6, 18, 'd'); put(8, 18, 'f'); put(10, 18, 'g'); for (let y = 16; y <= 18; y++) put(14, y, 'Z'); });
  fresh.bag.signal = 0; guest.bag.signalOk = false;
  const packed = coop.pack(fresh); packed.sg = 7;
  coop.unpack(guest, packed);
  ok('엉뚱한 신호 번호는 버린다', guest.bag.signal === 2);
}

say('v3.11 — 지금 넷이서 판에는 판 전체 시간 제한이 없다 (박자는 10초 시한문·깜빡이 발판이 준다)');
{
  check('시간 제한이 남은 판', STAGES.filter((s) => s.limit).map((s) => s.name), []);
}

say('대기방 — 인원이 다 안 차면 뜬다 (인원으로 막는 게임에만)');
{
  check('넷이서는 인원을 기다리는 게임', coop.waitsForCrew, true);
  const world = make('표지판', { mp: true, host: true, debug: false });
  const notFull = () => !!coop.waitsForCrew && (world.mp.others.size + 1) < coop.crew;
  ok('혼자면 대기방이 뜬다', notFull());
  other(world, 2, 4, 18); other(world, 3, 4, 18);
  ok('셋이어도 아직 대기방', notFull());
  other(world, 4, 4, 18);
  ok('넷이 차면 대기방이 사라진다', !notFull());
  check('그때 blocked 도 풀린다', coop.blocked(world), null);
}

say('판 고르기 — 손님이 방장이 고른 판으로 시작 전 화면에서 따라온다');
{
  const host = make('표지판', { mp: true, host: true });
  host.state = 'ready';
  const sent = []; const hshell = { net: { send: (m) => sent.push(JSON.parse(JSON.stringify(m))) }, log() {} };
  const guest = make('표지판', { mp: true, host: false });
  guest.state = 'ready';
  const gapi = { restart: w.restart, setSize() {} };
  const relay = () => {
    for (let i = 0; i < 3; i++) net.pump(host, 1 / 60, hshell);
    const s = sent.filter((m) => m.t === 's').pop();
    net.handleMessage(guest, hshell, 0, s, gapi);
    return s;
  };
  // 방장이 6판(index 5)을 고른다 = main.js 의 onMenu('stage:5')
  host.stage = 5; host.bagResets = 0; w.restart(host);
  check('방장이 그 판을 연다', host.bag.stage, 5);
  check('방장은 시작 전 화면', host.state, 'ready');
  const s = relay();
  check('스냅샷에 판 번호가 실린다 (새 칸 없이)', s.x.st, 5);
  check('손님도 그 판으로 따라온다', guest.bag.stage, 5);
  check('손님도 시작 전 화면 (바로 시작하지 않는다)', guest.state, 'ready');
  // 방장이 판을 연다 → go 가 가고 둘 다 그 판에서 시작
  for (const id of [2, 3, 4]) other(host, id, 4, 18);         // 넷을 채워 blocked 를 푼다
  net.startRound(host, hshell, { restart: w.restart });
  check('방장이 그 판에서 시작', [host.state, host.bag.stage], ['play', 5]);
  const go = sent.filter((m) => m.t === 'go').pop();
  net.handleMessage(guest, hshell, 0, go, gapi);
  check('손님도 그 판에서 시작', [guest.state, guest.bag.stage], ['play', 5]);
}

done('넷이서');
