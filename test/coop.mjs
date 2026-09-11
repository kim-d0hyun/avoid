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

function make(stageName = '표지판', { mp = false, host = true, debug = true } = {}) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'coop');
  world.debug = debug;
  world.onRecord = () => {}; world.onGameOver = (r) => { world.ended = r; };
  world.sent = []; world.send = (m, to) => world.sent.push({ m, to });
  if (mp) { world.mp.on = true; world.mp.role = host ? 'host' : 'guest'; world.mp.myId = host ? 1 : 2; }
  world.stage = stage(stageName);
  w.restart(world);
  world.state = 'play';
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

say('판 — 열둘이 다 열리고 크기가 맞다');
{
  const world = make();
  check('판 수', STAGES.length, 12);
  for (const s of STAGES) {
    const world2 = make(s.name);
    const b = world2.bag;
    if (!b.rows || b.rows.length !== s.h || b.rows[0].length !== s.w) { check(`${s.name} 크기`, [b.rows?.length, b.rows?.[0]?.length], [s.h, s.w]); }
    if (!b.exit) check(`${s.name} 출구`, !!b.exit, true);
    if (!b.spawn.every(Boolean)) check(`${s.name} 시작 자리 넷`, b.spawn.every(Boolean), true);
    if (world2.w !== s.w * T || world2.groundY !== s.h * T) check(`${s.name} 판 크기`, [world2.w, world2.groundY], [s.w * T, s.h * T]);
  }
  ok('열둘 다 열렸다', true);
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
  const w2 = make('마지막', { mp: true, host: true });
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
  const world = make('마지막', { mp: true });
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

say('시간 제한 — 마지막 판 120초');
{
  const world = make('마지막', { mp: true });
  check('120초', world.bag.limit, 120);
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

done('넷이서');
