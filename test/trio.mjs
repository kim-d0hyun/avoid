// 셋이서 — 셋이라서 달라지는 것만 본다.
//
// 타일 위의 물리와 규칙은 넷이서와 한 코드다 (coop.js 의 makeCoop). 그건 test/coop.mjs 가 본다.
// 여기서는 **인원이 셋이라는 사실**이 판 묶음·출구·입장·세계 색·게임 갈아 끼우기에 제대로 박혔는지,
// 그리고 두 게임이 서로의 살림살이를 물려받지 않는지를 본다.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
import { readFileSync } from 'node:fs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const net = await import(R + 'game/net.js');
const games = await import(R + 'games/index.js');
const trioMod = await import(R + 'games/trio.js');
const coopMod = await import(R + 'games/coop.js');
const trio = trioMod.default;
const coop = coopMod.default;
const { T, exitState } = trioMod;
const STAGES = trioMod.STAGES, WORLDS = trioMod.WORLDS, THEME = trioMod.THEME;
import { check, ok, say, note, done } from './check.mjs';

const MOVES = JSON.parse(readFileSync(new URL('trio-moves.json', import.meta.url), 'utf8'));
const stageAt = (name) => STAGES.findIndex((s) => s.name === name);

function make(stageName = STAGES[0].name, { mp = false, host = true, debug = true, id = 'trio' } = {}) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, id);
  world.debug = debug;
  world.onRecord = () => {}; world.onGameOver = (r) => { world.ended = r; };
  world.sent = []; world.send = (m, to) => world.sent.push({ m, to });
  if (mp) { world.mp.on = true; world.mp.role = host ? 'host' : 'guest'; world.mp.myId = host ? 1 : 2; }
  world.stage = Math.max(0, stageAt(stageName));
  w.restart(world);
  world.state = 'play';
  world.bump = false;
  return world;
}
const tick = (world, n = 1, input = {}) => {
  Object.assign(world.input, { left: false, right: false, jump: false, duck: false }, input);
  for (let i = 0; i < n; i++) w.update(world, 1 / 60);
};
const feetRow = (world) => Math.floor((world.groundY - world.player.air - 1) / T);
const setPos = (world, tx, ty) => { const p = world.player; p.x = (tx + 0.5) * T; p.air = world.groundY - (ty + 1) * T; p.vx = 0; p.vy = 0; p.grounded = true; p.onLadder = false; };
/// 남을 하나 세운다 (칸 단위, ty 는 발이 선 줄).
const other = (world, id, tx, ty) => {
  const x = (tx + 0.5) * T, air = world.groundY - (ty + 1) * T;
  world.mp.others.set(id, { id, name: `${id}번`, x, air, baseX: x, baseAir: air, age: 0, errorX: 0,
    vx: 0, vy: 0, crouch: 0, tcrouch: 0, facing: 1, walk: 0, dead: false, waiting: false, deadFor: 0,
    groundY: world.groundY, grabbing: -1, heldBy: -1, escapes: 0, seenEscapes: 0, vyDraw: 0, state: 0, heard: 1 });
};
/// mp 인원만 맞춘다 (자리는 아무 데나 — blocked 는 머릿수만 센다).
const crowd = (world, n) => { world.mp.others.clear(); for (let i = 2; i <= n; i++) other(world, i, 2, 3); };

// ── 판 묶음 ──────────────────────────────────────────────────────────────────

say('판 열셋 — 세계 넷, 시작 자리 셋, 글자 그림이 크기와 맞는다');
{
  check('판 수', STAGES.length, 13);
  check('세계', WORLDS.map((v) => v.name), ['놀이공원', '유령 저택', '항구', '종탑']);
  check('세계마다 넉 판, 종탑은 한 판', WORLDS.map((v) => STAGES.filter((s) => s.world === v.name).length), [4, 4, 4, 1]);
  let badArt = [], badSpawn = [], badExit = [], stray = [];
  for (const s of STAGES) {
    if (s.art.length !== s.h || s.art.some((r) => r.length !== s.w)) badArt.push(s.name);
    const joined = s.art.join('');
    const spawns = ['1', '2', '3'].map((c) => joined.split(c).length - 1);
    if (spawns.join() !== '1,1,1') badSpawn.push(`${s.name} ${spawns}`);
    if ((joined.split('O').length - 1) !== 1) badExit.push(s.name);
    if (joined.includes('4')) stray.push(s.name);              // 넷째 사람 자리가 남아 있으면 안 된다
    if (!WORLDS.some((v) => v.name === s.world)) stray.push(`${s.name} 세계`);
  }
  check('글자 그림이 w×h 와 맞는다', badArt, []);
  check('판마다 시작 자리가 1·2·3 하나씩', badSpawn, []);
  check('판마다 출구 하나', badExit, []);
  check('네 번째 사람 자리는 없다', stray, []);
  // v3.11 — 지하실·방파제를 전원 출구로 바꿨다 (한 명이 독주하고 둘이 기다리던 판). 이제 열세 판 모두 셋이 다 모여야 끝.
  check('끝 조건 — 전부 셋이 다 모여야', STAGES.map((s) => s.end), STAGES.map(() => 'all'));
  note(`한 명만 닿으면 끝인 판 — ${STAGES.filter((s) => s.end === 'one').map((s) => s.name).join('·')}`);
  note(`시간 제한 — ${STAGES.filter((s) => s.limit).map((s) => `${s.name} ${s.limit}초`).join(' · ')}`);
}

say('셋이서도 협동 엔진의 도우미를 다 내보낸다 — 봇이 games/trio.js 하나만 연다');
{
  // 빠지면 셋이서 봇이 승강기·신호탑·집결에서 「coopMod.xxx is not a function」으로 터진다 (v3.11 에서 한 번 그랬다)
  const need = ['T', 'tile', 'solidTile', 'floorBelow', 'bodyBlocked', 'blinkOn', 'exitState', 'stepObjects', 'loadStage',
                'beltDir', 'liftRect', 'stackUnder', 'rallyKey', 'SIGNALS', 'SIGNAL_TILES'];
  check('빠진 것', need.filter((n) => trioMod[n] === undefined), []);
  check('넷이서와 같은 것', need.filter((n) => trioMod[n] !== coopMod[n]), []);
}

say('내보낸 파일이 판과 맞는다 (trio-stages.js ↔ trio-moves.json)');
{
  check('풀이 수', MOVES.length, STAGES.length);
  check('이름과 순서', MOVES.map((m) => m.name), STAGES.map((s) => s.name));
  check('세계', MOVES.map((m) => m.world), STAGES.map((s) => s.world));
  check('끝 조건', MOVES.map((m) => m.end), STAGES.map((s) => s.end));
  ok('걸음이 다 들어 있다', MOVES.every((m) => Array.isArray(m.moves) && m.moves.length > 0));
  check('넷이서 판과 섞이지 않았다', STAGES.some((s) => coopMod.STAGES.some((c) => c.name === s.name)), false);
}

say('세계 색 — 네 세계가 다 있고, 도시 팔레트로 새지 않는다');
{
  check('THEME 키', Object.keys(THEME).sort(), ['놀이공원', '유령 저택', '종탑', '항구']);
  const missing = STAGES.filter((s) => !THEME[s.world]).map((s) => s.name);
  check('판마다 제 세계 색이 있다', missing, []);
  ok('통 이름도 세계마다 다르다', new Set(Object.values(THEME).map((t) => t.barrel)).size === 4);
  ok('넷이서 색과 안 겹친다', Object.values(THEME).every((t) => !['#c9a86a', '#b8912a', '#6b665c', '#55606c'].includes(t.ground)));
  for (const name of ['놀이공원', '유령 저택', '항구', '종탑']) {
    const world = make(STAGES.find((s) => s.world === name).name);
    check(`${name} 판이 제 색을 든다`, world.bag.theme.ground, THEME[name].ground);
  }
}

// ── 셋이라는 사실 ────────────────────────────────────────────────────────────

say('v3.11 — 지금 셋이서 판에는 판 전체 시간 제한이 없다 (박자는 10초 시한문·깜빡이 발판이 준다)');
{
  check('시간 제한이 남은 판', STAGES.filter((s) => s.limit).map((s) => s.name), []);
}

say('셋이어야 시작한다');
{
  const world = make(STAGES[0].name, { mp: true });
  check('인원', trio.crew, 3);
  crowd(world, 1);
  check('혼자면 막힌다', trio.blocked(world), '셋이어야 시작한다 — 지금 1명');
  crowd(world, 2);
  check('둘도 막힌다', trio.blocked(world), '셋이어야 시작한다 — 지금 2명');
  crowd(world, 3);
  check('셋이면 열린다', trio.blocked(world), null);
  crowd(world, 4);
  check('넷은 막힌다', trio.blocked(world), '셋이어야 시작한다 — 지금 4명');
  const solo = make(STAGES[0].name, { debug: false });
  check('혼자 하려면 방을 열라고 한다', trio.blocked(solo), '셋이서 하는 게임이다 — 방을 열어 둘을 더 부른다');
  check('개발용(DDONG_DEBUG)에서는 혼자도 된다', trio.blocked(make(STAGES[0].name)), null);
  check('넷이서 문구는 그대로다', coop.blocked(make(STAGES[0].name, { mp: true, id: 'coop' })), '넷이어야 시작한다 — 지금 1명');
}

say('출구 — 「셋」 판은 셋이 다, 「한 명」 판은 하나면');
{
  const all = STAGES.find((s) => s.end === 'all');
  const world = make(all.name, { mp: true });
  const b = world.bag;
  // 필요한 인원은 **이번 판에 몸이 있는 사람 수**에서 나온다 — 셋이 붙어 있으니 셋이다.
  other(world, 2, b.spawn[1].x, b.spawn[1].y); other(world, 3, b.spawn[2].x, b.spawn[2].y);
  setPos(world, b.exit.x, b.exit.y);
  check('나만 들어가 있으면 아직', exitState(world), { inside: 1, need: 3, ready: false });
  other(world, 2, b.exit.x - 1, b.exit.y);
  check('둘이어도 아직', exitState(world), { inside: 2, need: 3, ready: false });
  other(world, 3, b.exit.x + 1, b.exit.y);
  check('셋이면 된다', exitState(world), { inside: 3, need: 3, ready: true });

  // 한 명 판이 하나도 안 남아도(판을 다시 짜면 그럴 수 있다) 규칙은 시험한다 — 없으면 첫 판을 「한 명」으로 연다
  const one = STAGES.find((s) => s.end === 'one') ?? STAGES[0];
  const w1 = make(one.name, { mp: true });
  w1.bag.end = 'one';
  other(w1, 2, 3, w1.bag.spawn[1].y); other(w1, 3, 5, w1.bag.spawn[2].y);
  setPos(w1, w1.bag.exit.x, w1.bag.exit.y);
  check(`한 명 판(${one.name})은 하나면 된다`, exitState(w1).need, 1);
  const before = w1.bag.stage;
  tick(w1, 2, { jump: true });
  ok('넘어가기 시작', w1.bag.done > 0);
  tick(w1, 60, {});
  check('다음 판이 열렸다', w1.bag.stage, before + 1);
}

say('시작 자리 — 셋 칸뿐이고, 네 번째 자리를 달라고 해도 판 밖으로 안 나간다');
{
  const world = make(STAGES[0].name);
  check('자리 수', world.bag.spawn.length, 3);
  ok('셋 다 있다', world.bag.spawn.every(Boolean));
  trio.stand(world, 2);
  const three = world.player.x;
  trio.stand(world, 3);                                   // 없는 자리 — 마지막 자리로 잡힌다
  check('네 번째 자리는 셋째 자리로 붙는다', world.player.x, three);
  ok('판 안에 있다', world.player.x > 0 && world.player.x < world.bag.w * T);
  trio.stand(world, 0);
  check('첫 자리', feetRow(world), world.bag.spawn[0].y);
}

// ── 게임 갈아 끼우기 ─────────────────────────────────────────────────────────

say('목록에 넷이 있고, 셋이서를 고르면 첫 판부터');
{
  check('게임 일곱', games.games.map((g) => g.id), ['dodge', 'volley', 'ball', 'omok', 'alk', 'coop', 'trio']);
  check('이름', games.gameById('trio').name, '셋이서');
  check('판이 여럿인 게임 표시', games.games.filter((g) => g.staged).map((g) => g.id), ['coop', 'trio']);
  const world = w.createWorld({ ms: 0, dodged: 0 });
  world.onRecord = () => {}; world.onGameOver = () => {};
  w.resize(world, 1512, 944);
  w.pickGame(world, 'trio');
  check('갈아 끼웠다', world.gameId, 'trio');
  check('첫 판', world.bag.stage, 0);
  check('첫 판은 놀이공원', [world.bag.def.world, world.bag.def.name], ['놀이공원', STAGES[0].name]);
  world.stage = 5; w.restart(world);
  check('판 번호는 restart 가 지킨다', world.bag.stage, 5);
  w.pickGame(world, 'trio');
  check('다시 고르면 첫 판', world.bag.stage, 0);
}

say('손님이 방장의 셋이서 꾸러미를 보고 따라온다');
{
  const shell = { net: { send() {} }, log() {} };
  const host = w.createWorld({ ms: 0, dodged: 0 }); host.onRecord = () => {}; host.onGameOver = () => {}; w.resize(host, 1512, 944);
  const guest = w.createWorld({ ms: 0, dodged: 0 }); guest.onRecord = () => {}; guest.onGameOver = () => {}; w.resize(guest, 1512, 944);
  const sent = []; const hshell = { net: { send: (m) => sent.push(JSON.parse(JSON.stringify(m))) }, log() {} };
  const gapi = { restart: w.restart, setSize: (a, b) => w.resize(guest, a ?? 1512, b ?? 944) };
  w.pickGame(host, 'trio'); net.roleChanged(host, 'host', 'ZR95', 0, '방장');
  w.pickGame(guest, 'dodge'); net.roleChanged(guest, 'guest', 'ZR95', 7, '손님');
  host.state = 'play'; host.stage = 4; w.restart(host); host.state = 'play';
  for (let i = 0; i < 4; i++) net.pump(host, 1 / 60, hshell);
  const snap = sent.filter((m) => m.t === 's').pop();
  check('꾸러미의 게임 이름', snap.g, 'trio');
  net.handleMessage(guest, shell, 0, snap, gapi);
  check('손님도 셋이서로 갈아탔다', guest.gameId, 'trio');
  check('손님도 5판째', guest.bag.stage, 4);
  check('손님 판도 셋이서 것', guest.bag.def.name, STAGES[4].name);
  check('손님 자리도 셋', guest.bag.spawn.length, 3);
  check('똥은 사라졌다', guest.bag.poops, undefined);
}

say('넷이서와 셋이서를 오가도 서로 안 섞인다');
{
  const world = w.createWorld({ ms: 0, dodged: 0 });
  world.onRecord = () => {}; world.onGameOver = () => {};
  w.resize(world, 1512, 944);
  const snap = () => ({ id: world.gameId, crew: world.bag.crew, stages: world.bag.stages.length,
                        spawn: world.bag.spawn.length, world: world.bag.def.world,
                        ground: world.bag.theme.ground, need: world.bag.crewWord });
  w.pickGame(world, 'coop'); const c1 = snap();
  w.pickGame(world, 'trio'); const t1 = snap();
  w.pickGame(world, 'coop'); const c2 = snap();
  w.pickGame(world, 'trio'); const t2 = snap();
  check('넷이서', c1, { id: 'coop', crew: 4, stages: coopMod.STAGES.length, spawn: 4, world: coopMod.STAGES[0].world, ground: '#c9a86a', need: '넷' });
  check('셋이서', t1, { id: 'trio', crew: 3, stages: 13, spawn: 3, world: '놀이공원', ground: THEME['놀이공원'].ground, need: '셋' });
  check('되돌아온 넷이서가 그대로', c2, c1);
  check('되돌아온 셋이서가 그대로', t2, t1);
  // 한 판 굴려 본 뒤에도 — 모듈에 남는 값이 없어야 한다
  world.state = 'play'; tick(world, 30, { right: true });
  w.pickGame(world, 'coop'); world.state = 'play'; tick(world, 30, { right: true });
  check('굴린 뒤에도 넷이서', snap(), c1);
  w.pickGame(world, 'trio');
  check('굴린 뒤에도 셋이서', snap(), t1);
  // 판 번호(1-1 · 3-4)는 판 묶음에서 나온다 — 넷이서는 마지막이 4-2, 셋이서는 3-4 다.
  check('판 번호 글자도 제 묶음 것',
        [coopMod.stageNo({ stages: coopMod.STAGES, worlds: coopMod.WORLDS }, coopMod.STAGES.length - 1),
         coopMod.stageNo({ stages: STAGES, worlds: WORLDS }, STAGES.length - 1)], ['5-1', '4-1']);
}

say('되감기 — 셋이서 판도 제자리로 돌아온다');
{
  const world = make(STAGES[0].name);
  const b = world.bag;
  const box0 = b.boxes.length ? b.boxes[0].x : null;
  if (b.boxes.length) b.boxes[0].x += 5 * T;
  b.opened.add('r'); b.latched = true;
  coopMod.rewind(world, '시험');
  check('되감기 횟수', world.bag.resets, 1);
  check('열쇠가 도로 잠겼다', [...world.bag.opened], []);
  check('스위치도 도로', world.bag.latched, false);
  if (box0 !== null) check('상자가 제자리', world.bag.boxes[0].x, box0);
  check('판은 그대로', world.bag.def.name, STAGES[0].name);
  check('자리 수는 셋', world.bag.spawn.length, 3);
}

done('셋이서');
