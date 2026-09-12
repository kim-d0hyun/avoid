// 넷이서 — 타일 위의 물리와 규칙.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
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

function make(stageName = '표지판', { mp = false, host = true, debug = true } = {}) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'coop');
  world.debug = debug;
  world.onRecord = () => {}; world.onGameOver = (r) => { world.ended = r; };
  world.sent = []; world.send = (m, to) => world.sent.push({ m, to });
  if (mp) { world.mp.on = true; world.mp.role = host ? 'host' : 'guest'; world.mp.myId = host ? 1 : 2; }
  world.stage = stage(stageName);
  w.restart(world);
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

say('판 — 열넷이 다 열리고 크기가 맞다');
{
  const world = make();
  check('판 수', STAGES.length, 14);
  for (const s of STAGES) {
    const world2 = make(s.name);
    const b = world2.bag;
    if (!b.rows || b.rows.length !== s.h || b.rows[0].length !== s.w) { check(`${s.name} 크기`, [b.rows?.length, b.rows?.[0]?.length], [s.h, s.w]); }
    if (!b.exit) check(`${s.name} 출구`, !!b.exit, true);
    if (!b.spawn.every(Boolean)) check(`${s.name} 시작 자리 넷`, b.spawn.every(Boolean), true);
    if (world2.w !== s.w * T || world2.groundY !== s.h * T) check(`${s.name} 판 크기`, [world2.w, world2.groundY], [s.w * T, s.h * T]);
  }
  ok('열넷 다 열렸다', true);
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
  setPos(world, 30, 11);                    // 다락 끝 빨간 열쇠 자리 (바닥이 빨간 블록)
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

say('손잡기 — 세 칸 아래 사람을 끌어올린다');
{
  const world = make('탑', { mp: true, host: true });
  const o = other(world, 2, 9, 56);         // 나는 위(3층 단)에 있고 상대는 셋 아래
  setPos(world, 8, 53); world.player.grounded = true;
  coop.action(world);
  const sent = world.sent.find((s) => s.m.k === 'pull');
  ok('끌어올리는 말을 보낸다', !!sent && sent.m.to === 2);
  check('당사자에게만', sent.to, 2);
  // 손님이 받으면 올라선다
  const guest = make('탑', { mp: true, host: false });
  setPos(guest, 9, 56);
  coop.message(guest, 1, { k: 'pull', to: 2, x: sent.m.x, air: sent.m.air });
  check('끌려 올라갔다', feetRow(guest), 53);
  // 너무 멀면 안 된다
  const w2 = make('탑', { mp: true, host: true });
  other(w2, 2, 9, 56); setPos(w2, 8, 50);
  coop.action(w2);
  ok('네 칸 아래는 못 잡는다', !w2.sent.some((s) => s.m.k === 'pull'));
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
  const world = make('종점', { mp: true });
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
  setPos(world, 30, 11); tick(world, 2, {});
  ok('열쇠를 집었다', world.bag.opened.has('r'));
  world.onMenu = (a) => { if (a === 'again') { world.bagResets = (world.bagResets ?? 0) + 1; w.restart(world); world.state = 'play'; } };
  tick(world, 40, {});                      // 판이 조금 돌아야 ⌥R 이 먹는다
  w.press(world, 'restart', true); w.press(world, 'restart', false);
  ok('빨간 블록이 돌아왔다', coopMod.solidTile(world.bag, 'R'));
  check('되감기 횟수', world.bag.resets, 1);
  check('같은 판이다', world.bag.def.name, '두 열쇠');
}

say('시간 제한 — 옥상 120초 · 종점 150초');
{
  const world = make('옥상', { mp: true });
  check('120초', world.bag.limit, 120);
  check('종점은 150초', make('종점', { mp: true }).bag.limit, 150);
  world.bag.clock = 119.9;
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
  coop.message(host, 2, { k: 'push', i: host.bag.boxes.indexOf(box), d: 1 });
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

say('손잡기 — 올라선 자리에 바닥이 있는 쪽을 고른다');
{
  const world = make('탑', { mp: true, host: true });   // 2층 바닥 47줄 (x 1~34)
  const b = world.bag;
  // 3층 단 위(53줄, 28~34칸) 왼쪽 끝에 서고 상대는 밑 27칸에 — 상대 쪽(왼쪽)은 허공, 오른쫀은 단
  setPos(world, 28, 53); world.player.grounded = true;
  other(world, 2, 27, 56);
  coop.action(world);
  const sent = world.sent.find((s) => s.m.k === 'pull');
  ok('끌어올린다', !!sent);
  ok('허공(왼쪽)이 아니라 단 위(오른쪽)에 세운다', sent.m.x > world.player.x);
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

  // ② 밀기 — 뒤(1)가 오른쪽으로 밀면 앞(2)이 밀려난다. 두 세상이 서로를 보고 각자 계산한다.
  const A = make('상자 계단'); A.bump = true; A.bag.boxes = [];
  const B = make('상자 계단'); B.bump = true; B.bag.boxes = [];
  A.mp.myId = 1; B.mp.myId = 2;
  setPos(A, 6, 18); setPos(B, 8, 18);               // A 뒤, B 앞
  const mirror = () => {
    A.mp.others.clear(); B.mp.others.clear();
    other(A, 2, 0, 18); const oa = A.mp.others.get(2); oa.x = oa.baseX = B.player.x; oa.air = oa.baseAir = B.player.air;
    other(B, 1, 0, 18); const ob = B.mp.others.get(1); ob.x = ob.baseX = A.player.x; ob.air = ob.baseAir = A.player.air;
  };
  const bx0 = B.player.x;
  for (let i = 0; i < 120; i++) { mirror(); Object.assign(A.input, { left:false, right:true, jump:false, duck:false }); Object.assign(B.input, { left:false, right:false, jump:false, duck:false }); w.update(A, 1/60); w.update(B, 1/60); }
  ok('가만있던 앞 사람이 밀려 나아갔다', B.player.x > bx0 + 40);
  ok('뒤 사람은 여전히 뒤에 있다', A.player.x < B.player.x);
  note(`앞 사람이 ${((B.player.x - bx0)/T).toFixed(2)}칸 밀렸다`);

  // ③ 머리 위/밑(계단·어깨)은 가로로 안 민다 — 세로 관계다
  const w3 = make('상자 계단'); w3.bump = true; w3.bag.boxes = [];
  setPos(w3, 8, 18);
  const under = other(w3, 2, 8, 18);
  under.air = w3.groundY - (18 * T - 53); under.baseAir = under.air;   // 그 사람 머리가 내 발
  const x0 = w3.player.x;
  tick(w3, 20, {});
  ok('밟고 선 사람은 가로로 안 밀어낸다', Math.abs(w3.player.x - x0) < 6);
}

done('넷이서');
