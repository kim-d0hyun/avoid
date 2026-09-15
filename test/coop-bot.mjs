// 협동 봇 — 풀이(test/coop-moves.json · test/trio-moves.json)를 **키를 눌러** 실제 엔진에서 해 보는 공통 부분.
//
// 두 가지 세상에서 돈다:
//   coop-play.mjs  인형 — 방장 세상 하나. 움직이는 한 명만 진짜 물리, 나머지는 그 자리에 세운 남. 빠르고 결정적이다.
//   coop-net.mjs   여럿 — 방장 1 + 손님들, 세상도 그만큼. 자리 꾸러미와 방장 스냅샷을 지연을 두고 주고받는다. 손님 물리·
//                  꾸러미·중계(손잡기·밀기·출구 부탁)·남의 자리 예측이 전부 진짜다.
//
// **어느 게임인지는 GAME 이 정한다** — 기본은 넷이서(coop), `GAME=trio` 면 셋이서. 명단(IDS)·판 묶음·
// 풀이 파일이 전부 그 게임에서 나온다. 물리는 둘이 같은 것을 쓴다 (coop.js 의 makeCoop).
//
// 걸음(verb)은 solve.py 와 같다: walk jump hop climb boost stairs push ride take switch need_plate rally timer deploy lift tower signal choose sync portal box_portal spring.

import './dom-stub.mjs';
import { readFileSync } from 'node:fs';
import { note } from './check.mjs';
const R = new URL('../src/', import.meta.url).href;
export const GAME = process.env.GAME === 'trio' ? 'trio' : 'coop';
export const w = await import(R + 'game/world.js');
export const netjs = await import(R + 'game/net.js');
export const coopMod = await import(R + `games/${GAME}.js`);
export const coop = coopMod.default;
export const { T, STAGES, exitState, blinkOn, tile, floorBelow, bodyBlocked } = coopMod;

export const MOVES = JSON.parse(readFileSync(new URL(`${GAME}-moves.json`, import.meta.url), 'utf8'));
export const TRACE = process.env.TRACE === '1';
const TRACE2 = process.env.TRACE === '2';

// coop.js 의 값과 같아야 한다 (봇이 뛸 때를 재는 데 쓴다).
export const HALF = 17, BLOCK_H = 50, HEAD = BLOCK_H + 3;    // 머리 꼭대기 = 발 - 53
export const RUN = 290, G = 1700, JUMP_V = 568;
export const FRICTION_G = 2600, FRICTION_A = 2600 * 0.35;
export const DT = 1 / 60;
// 명단과 세계 이름은 판 묶음에서 읽는다 — 넷이서면 넷, 셋이서면 셋.
export const IDS = Array.from({ length: coop.crew }, (_, i) => String(i + 1));
export const GUESTS = IDS.slice(1);                          // 방장(1) 말고
export const WORLD_NAMES = coopMod.WORLDS.map((v) => v.name);

export const col = (x) => Math.floor(x / T);
export const row = (fy) => Math.floor((fy - 1) / T);
export const where = (world) => { const p = world.player; return `(${col(p.x)},${row(world.groundY - p.air)})`; };

/// 세상 하나 — id 번 사람의 것. 방장(1)이거나 손님.
export function makeWorld(stageName, { id = 1 } = {}) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, GAME);
  world.debug = true;
  world.onRecord = () => {}; world.onGameOver = (r) => { world.ended = r; };
  world.sent = []; world.send = (m, to) => world.sent.push({ m, to });
  world.mp.on = true; world.mp.role = id === 1 ? 'host' : 'guest'; world.mp.myId = id; world.mp.myName = `${id}번`;
  world.mp.hostId = 1;
  world.stage = STAGES.findIndex((s) => s.name === stageName);
  w.restart(world);
  world.state = 'play';
  world.bag.chutes = [];                                // 통은 뺀다 — 맞아도 죽지 않고 박자 문제라, 봇을 넘어뜨려 결과를 흔든다
  return world;
}

/// 남 하나 (인형). 자리는 픽셀 (x, 발 y).
export function puppet(world, id, x, fy) {
  const air = world.groundY - fy;
  return { id, name: `${id}번`, x, air, baseX: x, baseAir: air, age: 0, errorX: 0, vx: 0, vy: 0, crouch: 0, tcrouch: 0,
           facing: 1, walk: 0, dead: false, waiting: false, deadFor: 0, groundY: world.groundY, grabbing: -1, heldBy: -1,
           escapes: 0, seenEscapes: 0, vyDraw: 0, fyPrev: undefined, rtt: 0.008, state: 0, heard: 1 };
}

// ── 지형 묻기 ───────────────────────────────────────────────────────────────

/// x 앞에 발 높이 근처(±16px) 바닥이 있나. 좁은 기둥으로 찔러 본다.
export const floorAt = (world, x, fy, people = false) => floorBelow(world, x, fy - 16, fy + 16, 5, { people });
/// 이 자리를 지나는 왕복 발판 길 — 발판 윗면이 발 높이 근처인 것.
export function trackNear(world, x, fy) {
  return world.bag.tracks.find((tr) => Math.abs(tr.y * T + T * 0.3 - fy) < 22 && x >= tr.x0 * T - 6 && x <= (tr.x1 + 1) * T + 6) ?? null;
}
export function trackRect(tr) { const x0 = tr.x0 * T + tr.pos; return { x0, x1: x0 + 3 * T }; }
/// 왕복 발판이 dt 초 뒤 어디 있을지 (끝에서 되돌아오는 것까지). 발판 가운데 x.
export function trackCenterAfter(tr, dt) {
  let pos = tr.pos, dir = tr.dir ?? 1, left = 126 * dt;
  while (left > 0) {
    const room = dir > 0 ? tr.len - pos : pos;
    if (left <= room) { pos += dir * left; break; }
    pos += dir * room; left -= room; dir = -dir;
  }
  return tr.x0 * T + pos + 1.5 * T;
}
/// 앞의 구멍이 몇 칸인가 (바닥 없는 칸 수, 최대 8).
function gapWidth(world, x, dir, fy) {
  let n = 0;
  for (let k = 1; k <= 8; k++) {
    const px = x + dir * (HALF + 8 + (k - 0.5) * T);
    if (floorAt(world, px, fy) !== null) break;
    n++;
  }
  return n;
}
/// 상자 이름(x0, X1 …) → 엔진의 상자 번호. 둘 다 위→아래, 왼→오른 순서인데 엔진은 x·X 를 섞어 센다.
export function boxIndex(stage, name) {
  const kind = name[0], n = +name.slice(1);
  let seen = 0, all = 0;
  for (let y = 0; y < stage.h; y++) for (let x = 0; x < stage.w; x++) {
    const ch = stage.art[y][x];
    if (ch !== 'x' && ch !== 'X') continue;
    if (ch === kind) { if (seen === n) return all; seen++; }
    all++;
  }
  return -1;
}

// ── 움직임 (sim.step 으로 한 프레임씩) ───────────────────────────────────────

/// x1(px) 까지 걷는다. 구멍은 뛰어 넘고, 낮은 턱도 뛰어 넘고, 깜빡이는 발판 앞에서는 켜질 때를 기다리고,
/// 왕복 발판 줄에서는 발판을 기다리거나 타고 간다. 포탈로 옮겨지면 거기서 끝.
export function walkTo(sim, world, targetX, opts = {}) {
  const p = world.player, b = world.bag;
  const dist = Math.abs(targetX - p.x);
  const limit = opts.frames ?? Math.round(60 * (dist / RUN + 24));
  let lastX = p.x;
  for (let f = 0; f < limit; f++) {
    if (p.dead) return `죽었다 ${where(world)}`;
    if (Math.abs(p.x - lastX) > 3 * T) return null;      // 포탈로 옮겨졌다 — 걷기는 여기서 끝
    lastX = p.x;
    const fy = world.groundY - p.air;
    const dx = targetX - p.x;
    if (Math.abs(dx) < 3 && p.grounded && Math.abs(p.vx) < 40) { p.vx = 0; return null; }
    // 무빙워크 위에서는 가만히 설 수가 없다 — 반 칸 안이면 된 것으로 친다
    const belt = p.grounded && '<>Jj'.includes(tile(b, col(p.x), Math.floor((fy + 2) / T)));
    if (belt && Math.abs(dx) < T * 0.5) return null;
    const dir = Math.sign(dx);
    let hold = dir, jump = false;
    if (!p.grounded) {
      const stop = p.vx * p.vx / (2 * FRICTION_A);
      hold = Math.abs(dx) > stop + 3 ? dir : 0;
    } else {
      const stop = p.vx * p.vx / (2 * FRICTION_G);
      if (Math.abs(dx) <= stop + 2) hold = 0;
      if (hold) {
        const ax = p.x + dir * (HALF + 8);
        // 남의 머리 위인가 — 엔진이 알려 주는 것(rideId)과 자리로 본 것 둘 다. 밑 사람이 걷는 중이면 머리가 몇 px 흔들린다.
        const onHead = p.rideId != null || [...world.mp.others.values()].some((o) => !o.dead && !o.waiting && Math.abs(o.x - p.x) < HALF + 17 && Math.abs((o.groundY - o.air - HEAD) - fy) < 9);
        // 조금 낮은 데는 내려선다. 남의 머리 위(탑·어깨)에 서 있으면 네 칸 아래 땅까지 — 구멍이 아니라 내려오는 것이다.
        const ahead = floorAt(world, ax, fy, true) ?? floorBelow(world, ax, fy + 16, fy + (onHead ? 4 * T : 60), 5, { people: true });
        const tAhead = tile(b, col(ax), Math.floor((fy + 2) / T));
        const under = tile(b, col(p.x), Math.floor((fy + 2) / T));
        // 깜빡이는 발판에 발을 들이기 전 — 막 켜졌을 때만 간다 (여덟 칸을 2초 안에)
        if (tAhead === '~' && under !== '~' && !((b.clock % 4) < 0.12)) hold = 0;
        if (hold && ahead === null) {
          const near = trackNear(world, ax, fy) || trackNear(world, targetX, fy);
          if (Math.abs(dx) <= HALF + 8) {
            // 목표가 코앞. 목표 자리에 바닥이 있으면 간다 (남의 머리 위에서 몇 픽셀 옮길 때).
            // 없는데 왕복 발판 줄이면 발판이 올 때까지 선다 — 걸어 나가면 연못이다.
            if (floorAt(world, targetX, fy, true) === null && near) hold = 0;
          } else if (near) hold = 0;                     // 왕복 발판을 기다린다 (타고 있으면 실려 간다)
          else {
            const gap = gapWidth(world, p.x, dir, fy);
            if (gap > 4) return `걷기 ${where(world)}→${col(targetX)}칸: ${gap}칸 구멍`;
            if (gap >= 3 && Math.abs(p.vx) < 250 && !opts.noRunup) {
              // 달려야 넘는 구멍 — 한 칸 반 물러섰다 달려온다
              const back = walkTo(sim, world, p.x - dir * 1.5 * T, { noRunup: true, frames: 120 });
              if (back) return back;
              continue;
            }
            jump = true;
          }
        }
        // 낮은 턱 — 목표가 그 너머인데 앞이 막혔고 한 칸 위가 비었으면 뛰어 오른다
        // 판자 두께만큼의 턱(14px 안)은 엔진이 걸어서 올려 준다 — 뛰지 않는다. 뛰면 턱 너머로 멀리 날아가 깜빡이는 발판에
        // 켜진 시간 끝자락에 내려앉는다 (삭은 판자 → 땅 턱 → 깜빡이는 다리가 이어진 3층 창고).
        const ledge = floorBelow(world, p.x + dir * (HALF + 3), fy - 15, fy - 2, HALF - 2, { people: false });
        if (hold && !jump && Math.abs(dx) > HALF + 8 && ledge === null && bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1, BLOCK_H)
            && !bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1 - T, BLOCK_H)) jump = true;
      }
    }
    sim.step(world, { left: hold < 0, right: hold > 0, jump });
  }
  return `걷기 시간 초과 ${where(world)} → ${col(targetX)}칸`;
}

/// (tX, tFy) 로 뛴다. 위로 뛸 때는 내려오면서 그 높이를 지나는 순간에 닿게 뛸 때를 잰다.
export function jumpTo(sim, world, tX, tFy, opts = {}) {
  const p = world.player, b = world.bag;
  const fy0 = world.groundY - p.air;
  const dy = fy0 - tFy;                                  // + 면 위로
  if (dy > 0 && JUMP_V * JUMP_V - 2 * G * (dy + 6) < 0) return `점프 ${where(world)}→(${col(tX)},${row(tFy)}): ${(dy / T).toFixed(2)}칸 위는 못 뛴다`;
  let phase = 'run';
  // 목표가 왕복 발판 위면 발판은 움직인다. 뛰어서 내려앉기까지의 시간(tLand) 뒤 발판 가운데를 노린다.
  const tr = dy > 0 ? trackNear(world, tX, tFy) : null;
  const tLandUp = dy > 0 ? (JUMP_V + Math.sqrt(Math.max(0, JUMP_V * JUMP_V - 2 * G * Math.max(0, dy - 12)))) / G : 0;
  let t0 = 0;
  const aimX = () => tr ? trackCenterAfter(tr, Math.max(0, tLandUp - (sim.frames - t0) / 60)) : tX;
  let lastX = p.x;
  for (let f = 0; f < 1500; f++) {
    if (p.dead) return `죽었다 ${where(world)}`;
    if (Math.abs(p.x - lastX) > 3 * T) return null;      // 포탈로 옮겨졌다
    lastX = p.x;
    const fy = world.groundY - p.air;
    const dx = (phase === 'run' ? tX : aimX()) - p.x, dir = Math.sign(dx) || p.facing || 1;
    if (phase === 'run') {
      if (TRACE2) console.log(`        run f${f} x=${p.x.toFixed(0)} fy=${fy.toFixed(0)} vx=${p.vx.toFixed(0)} g=${p.grounded ? 1 : 0} load=${p.load}`);
      if (!p.grounded) { phase = 'air'; continue; }
      let jumpNow = false;
      if (tr) {
        // 발판 — 착지 때 발판 가장자리가 가만히 서서 뛰어 닿을 거리에 오면 뛴다
        const reach = 24 + RUN * Math.max(0, tLandUp - 0.165);
        const gap = Math.abs(trackCenterAfter(tr, tLandUp) - p.x) - (1.5 * T - 15);
        if (gap > reach - 20) { sim.step(world, {}); continue; }
        t0 = sim.frames;
        sim.step(world, { left: dir < 0, right: dir > 0, jump: true }); phase = 'air'; continue;
      }
      if (dy > 0) {
        const tLand = (JUMP_V + Math.sqrt(Math.max(0, JUMP_V * JUMP_V - 2 * G * dy))) / G;
        const reach = RUN * tLand * 0.92;
        jumpNow = Math.abs(dx) <= Math.max(reach, HALF + 6);
        // 목표 바로 밑 벽에 붙었으면 그냥 뛴다
        if (!jumpNow && bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1, BLOCK_H)) jumpNow = true;
      } else {
        const ax = p.x + dir * (HALF + 8);
        const ahead = floorAt(world, ax, fy, true);
        if (ahead === null) {
          if (trackNear(world, ax, fy)) { sim.step(world, {}); continue; }
          jumpNow = !(dy < 0 && Math.abs(dx) < 1.6 * T);   // 바로 아래로 내려가는 거면 걸어서 떨어진다
        } else if (bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1, BLOCK_H)) jumpNow = true;
      }
      if (dy <= 0 && Math.abs(dx) < 3 && Math.abs(p.vx) < 40 && Math.abs(fy - tFy) < 16) return null;   // 걸어서 닿았다
      const stop = p.vx * p.vx / (2 * FRICTION_G);
      const hold = (dy <= 0 && Math.abs(dx) <= stop + 2) ? 0 : dir;
      if (jumpNow) { sim.step(world, { left: dir < 0, right: dir > 0, jump: true }); phase = 'air'; continue; }
      sim.step(world, { left: hold < 0, right: hold > 0 });
    } else if (phase === 'air') {
      if (TRACE2) console.log(`        f${f} x=${p.x.toFixed(0)} fy=${(world.groundY - p.air).toFixed(0)} vx=${p.vx.toFixed(0)} vy=${p.vy.toFixed(0)} g=${p.grounded ? 1 : 0}`);
      if (p.grounded) { phase = 'landed'; continue; }
      const stop = p.vx * p.vx / (2 * FRICTION_A);
      const hold = Math.abs(dx) > stop + 3 ? dir : 0;
      sim.step(world, { left: hold < 0, right: hold > 0 });
    } else {
      const fyL = world.groundY - p.air;
      // 목표 자리에 동료·상자가 있으면 그 위에 내린다 — 자리는 맞다. 다음 걸음에 내려선다.
      const onHead = [...world.mp.others.values()].some((o) => !o.dead && Math.abs(o.x - p.x) < 30 && Math.abs((o.groundY - o.air - HEAD) - fyL) < 4);
      const onBox = b.boxes.some((x) => Math.abs(x.x - p.x) < 36 && Math.abs((x.y - T) - fyL) < 4);
      const higher = fyL < tFy && tFy - fyL <= HEAD * 2 && (onHead || onBox) && Math.abs(dx) <= 1.6 * T;
      if (Math.abs(fyL - tFy) > 16 && !higher) return `점프 착지 (${col(tX)},${row(tFy)}) 를 노렸는데 ${where(world)} — 발이 ${(fyL / T).toFixed(2)}줄`;
      if (!tr && Math.abs(dx) > 1.6 * T) return `점프 착지 (${col(tX)},${row(tFy)}) 를 노렸는데 ${where(world)}`;
      if (tr) return null;                                 // 발판 위에 내렸다 — 실려 간다
      return walkTo(sim, world, tX, { frames: 240, noRunup: true });
    }
  }
  return `점프 시간 초과 ${where(world)} → (${col(tX)},${row(tFy)})`;
}

/// 사다리·리프트로 fy 까지. 밑에 동료가 서 있으면 그 머리에 내려선다 (자리는 맞다).
export function climbTo(sim, world, tFy) {
  const p = world.player;
  let wasUp = true;
  for (let f = 0; f < 900; f++) {
    if (p.dead) return `죽었다 ${where(world)}`;
    const fy = world.groundY - p.air;
    if (p.grounded && !p.onLadder && Math.abs(fy - tFy) < 16) return null;
    if (p.grounded && !p.onLadder && fy < tFy && fy > tFy - 16 - HEAD * 3
        && [...world.mp.others.values()].some((o) => !o.dead && Math.abs(o.x - p.x) < 30 && Math.abs((o.groundY - o.air - HEAD) - fy) < 4)) return null;
    if (p.onLadder && (f > 0) && ((wasUp && fy <= tFy + 2) || (!wasUp && fy >= tFy - 2))) return null;
    const up = tFy < fy;
    if (f === 0) wasUp = up;
    sim.step(world, { jump: up, duck: !up });
  }
  return `사다리 시간 초과 ${where(world)} → ${row(tFy)}줄`;
}

/// 제자리 높이로 뛰어 넘는다 — 열쇠·포탈을 안 밟고. 한 칸 반 물러나 달려와서 뛴다.
export function hopTo(sim, world, tX) {
  const p = world.player, dir = Math.sign(tX - p.x);
  const back = walkTo(sim, world, p.x - dir * 1.5 * T, { frames: 200, noRunup: true });
  if (back) return `뛰어넘기 준비: ${back}`;
  for (let f = 0; f < 200 && Math.abs(tX - p.x) > RUN * 0.6; f++) sim.step(world, { left: dir < 0, right: dir > 0 });
  sim.step(world, { left: dir < 0, right: dir > 0, jump: true });
  for (let f = 0; f < 120 && !p.grounded && !p.dead; f++) {
    const dx = tX - p.x, stop = p.vx * p.vx / (2 * FRICTION_A);
    const hold = Math.abs(dx) > stop + 3 ? Math.sign(dx) : 0;
    sim.step(world, { left: hold < 0, right: hold > 0 });
  }
  if (p.dead) return '뛰어넘다 죽었다';
  if (Math.abs(tX - p.x) > 1.6 * T) return `뛰어넘기 착지 ${where(world)} (목표 ${col(tX)}칸)`;
  return walkTo(sim, world, tX, { frames: 240, noRunup: true });
}

/// 어깨·사람 계단의 자리. 맨 밑 사람이 base, 위로 갈수록 lean 쪽으로 14px 씩. 뛰는 사람은 스택 뒤(-lean) 44px 에서 시작한다.
/// 벽·기둥에 막히면 스택을 뒤로 14px 씩 물려 자리를 찾는다. 좁은 데(상자 위)면 한 명을 내 자리에 세운다.
export function stackLayout(world, me, dir, n) {
  const free = (x, fy) => !bodyBlocked(world, x, fy - 1, BLOCK_H);
  const layouts = [];
  for (let j = 0; j < 8; j++) layouts.push({ base: me.x + dir * (32 - 14 * j), lean: dir });
  for (let j = 0; j < 8; j++) layouts.push({ base: me.x - dir * 14 * j, lean: -dir });
  for (const L of layouts) L.start = L.base - L.lean * 44;
  let lay = layouts.find((L) => [...Array(n).keys()].every((k) => free(L.base + L.lean * 14 * k, me.fy - HEAD * k))
                                && floorAt(world, L.base, me.fy, false) !== null
                                && floorAt(world, L.start, me.fy, false) !== null && free(L.start, me.fy));
  if (!lay && n === 1) lay = { base: me.x, lean: dir, start: me.x, tower: true };
  return lay ?? null;
}
/// 전원 탑의 자리 — 꼭대기 사람이 감지기 칸(topX) 가운데에 서도록 밑 사람 자리(base)를 거꾸로 잡는다.
/// queue 가 있으면 오를 자리(start) 뒤로 40px 씩 그만큼 줄 설 바닥도 있어야 한다 (동시 봇이 차례로 오르려고 줄을 세운다).
/// 한쪽이 벽·문에 막히면 반대로 기울여 본다.
export function towerLayout(world, me, topX, n, queue = 0) {
  const free = (x, fy) => !bodyBlocked(world, x, fy - 1, BLOCK_H);
  for (const lean of [1, -1]) for (const shift of [0, 6, -6, 12, -12]) {
    const base = topX - lean * 14 * (n - 1) + shift, start = base - lean * 44;
    const room = [...Array(n + 1).keys()].every((k) => free(base + lean * 14 * Math.min(k, n - 1), me.fy - HEAD * k));
    const line = [...Array(queue).keys()].every((j) => { const x = start - lean * 40 * (j + 1); return floorAt(world, x, me.fy) !== null && free(x, me.fy); });
    if (room && line && floorAt(world, base, me.fy) !== null && floorAt(world, start, me.fy) !== null && free(start, me.fy)) return { base, lean, start };
  }
  return null;
}
/// 감지기 i — 내 자리 좌우 한 칸 안, 내 발보다 위.
export function sensorAbove(b, me) {
  for (let y = row(me.fy) - 1; y >= 0; y--) for (let x = col(me.x) - 1; x <= col(me.x) + 1; x++) if (tile(b, x, y) === 'i') return { x, y };
  return null;
}
/// 승강기 — 아래 승강장 발판 위(기둥 좌우 한 칸 안)에 선 사람 곁의 것. 탈 자리는 발판 왼쪽부터 34px 씩.
/// 탈 사람 가운데 누가 아래 승강장 발판에 서 있으면 그 승강기. 없으면 기둥 좌우 한 칸 안에 있는 사람의 것 (남의 머리 위에 서 있어도).
export function liftFor(b, qs) {
  qs = Array.isArray(qs) ? qs : [qs];
  return b.lifts.find((l) => qs.some((q) => Math.abs(col(q.x) - l.x) <= 1 && Math.abs(q.fy - (l.y1 + 1) * T) < 16))
      ?? b.lifts.find((l) => qs.some((q) => Math.abs(col(q.x) - l.x) <= 1 && q.fy <= (l.y1 + 1) * T + 16 && q.fy >= (l.y1 + 1) * T - 4 * T)) ?? null;
}
export const liftSpot = (lf, i) => (lf.x - 1) * T + 21 + 34 * i;
/// 신호 버튼 — 지금 신호가 가리키는 것.
export function signalSpot(b) {
  const ch = coopMod.SIGNAL_TILES[b.signal];
  for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) if (b.rows[y][x] === ch) return { x, y };
  return null;
}

/// 스택의 머리를 차례로 딛고 올라간다. present 개의 머리가 있고, 그중 upto 번째까지 오른다.
/// 머리 j 에서 다음다음 사람(j+2)이 있으면 그 발에 머리를 찧지 않게 뒤쪽 가장자리(-lean·20)에 선다.
export function hopChain(sim, world, lay, me, present, upto, finalOffset) {
  for (let j = 0; j <= upto; j++) {
    const edge = (j + 2 < present) ? -lay.lean * 20 : (j === upto ? finalOffset : 0);
    const err = jumpTo(sim, world, lay.base + lay.lean * 14 * j + edge, me.fy - HEAD * (j + 1));
    if (err) return `머리 ${j} 에 올라서기: ${err}`;
  }
  return null;
}

// ── 풀이 한 판 ──────────────────────────────────────────────────────────────

/// sim 이 갖춰야 할 것:
///   frames · host · step(world, input) · activate(k) → world · land(world) → err · at(k) → {x, fy}
///   deadOne() → k|null · stack(on, lay, me) → err · settle() → err · holdMates(mates, box, dir) · releaseMates(mates)
///   ids()
export function play(stage, moves, sim) {
  const host = sim.host, b = host.bag;
  const px = (tx) => (tx + 0.5) * T, pfy = (ty) => (ty + 1) * T;
  const trace = (s) => { if (TRACE) console.log('      ' + s); };
  const per = Object.fromEntries([...IDS.map((k) => [k, 0]), ['판', 0]]);
  const dump = (world, err, i, label) => {
    const p = world.player, fy = world.groundY - p.air, cx = col(p.x), cy = row(fy);
    const around = [];
    for (let y = Math.max(0, cy - 3); y <= Math.min(b.h - 1, cy + 2); y++) {
      let line = '';
      for (let x = Math.max(0, cx - 6); x <= Math.min(b.w - 1, cx + 6); x++) line += (x === cx && y === cy) ? '@' : b.rows[y][x];
      around.push(`${String(y).padStart(2)} ${line}`);
    }
    const spots = IDS.map((k) => { const q = sim.at(k); return `${k}:(${col(q.x)},${row(q.fy)})`; }).join(' ');
    return { ok: false, at: i, label, per, err: `${err}\n      자리 ${spots} · 상자 ${b.boxes.map((x) => `(${col(x.x)},${Math.round(x.y / T) - 1})`).join(' ')} · 열쇠 ${[...b.opened].join('') || '-'}\n      ${around.join('\n      ')}` };
  };

  for (let i = 0; i < moves.length; i++) {
    const [verb, ...a] = moves[i];
    const label = `${i + 1}/${moves.length} ${verb} ${a.map((v) => Array.isArray(v) ? v.join('·') : v).join(' ')}`;
    trace(label);
    const f0 = sim.frames;
    let err = null, world = host, actor = '판';
    const go = (who) => { actor = who; world = sim.activate(who); return sim.land(world); };
    switch (verb) {
      case 'walk': { err = go(a[0]) ?? walkTo(sim, world, px(a[1])); break; }
      case 'jump': { err = go(a[0]) ?? jumpTo(sim, world, px(a[1]), pfy(a[2])); break; }
      case 'climb': { err = go(a[0]) ?? climbTo(sim, world, pfy(a[1])); break; }
      case 'hop': { err = go(a[0]) ?? hopTo(sim, world, px(a[1])); break; }
      case 'boost': case 'stairs': {
        // 어깨·사람 계단 — 남들이 14px 씩 물려 층층이 **서고**, 내가 하나씩 딛고 올라가 뛴다.
        // (웅크린 머리는 31px 라 한 칸이 안 된다. 서면 53px — 한 칸 남짓.)
        const [who, x1, y1, on] = a;
        err = go(who); if (err) break;
        const me = sim.at(who);
        const dir = Math.sign(px(x1) - me.x) || 1;
        const lay = stackLayout(world, me, dir, on.length);
        if (!lay) { err = `어깨를 세울 자리가 없다 ${where(world)}`; break; }
        err = sim.stack(on, lay, me); if (err) break;
        world = sim.activate(who);
        if (!lay.tower && Math.abs(lay.start - world.player.x) > 2) err = walkTo(sim, world, lay.start, { frames: 300, noRunup: true });
        if (!err) err = hopChain(sim, world, lay, me, on.length, on.length - 1, 0);
        if (!err) err = jumpTo(sim, world, px(x1), pfy(y1));
        break;
      }
      case 'push': {
        const [box, x1, who] = a;
        const idx = boxIndex(stage, box);
        const bx = b.boxes[idx];
        if (!bx) { err = `상자 ${box} 가 없다`; break; }
        err = go(who[0]); if (err) break;
        const dir = Math.sign(px(x1) - bx.x);
        const mates = who.slice(1);
        err = sim.holdMates(mates, bx, dir); if (err) break;
        world = sim.activate(who[0]);
        const y0 = bx.y;
        let fell = false, warped = false;
        const limit = Math.round(60 * (Math.abs(px(x1) - bx.x) / 92 + 12));
        let lastBx = bx.x;
        for (let f = 0; f < limit; f++) {
          if (world.player.dead) { err = `죽었다 ${where(world)}`; break; }
          if (Math.abs(bx.x - lastBx) > 3 * T) { warped = true; break; }   // 포탈을 지났다
          lastBx = bx.x;
          if (bx.y > y0 + 2) fell = true;
          if (fell && bx.vy === 0 && Math.abs(bx.y - y0) > T * 0.9) break;
          if (!fell && Math.abs(bx.x - px(x1)) < 3) break;
          if (TRACE2 && f % 60 === 0) console.log(`        push f${f} box=${bx.x.toFixed(0)} me=${world.player.x.toFixed(0)} pushing=${world.player.pushing} px=${bx.px}`);
          // 상자가 떨어지기 시작하면 손을 뗀다 — 계속 밀면 미는 사람도 벼랑 끝을 따라 떨어진다
          sim.step(world, fell ? {} : { left: dir < 0, right: dir > 0 });
        }
        sim.releaseMates(mates);
        if (!err) {
          // 다 밀고 나서 떨어지기 시작할 수 있다 — 상자가 가만히 있을 때까지 본다
          for (let f = 0, still = 0; f < 180 && still < 6; f++) { sim.step(world, {}); still = bx.vy === 0 && Math.abs(bx.y - (bx.yPrev ?? bx.y)) < 0.01 ? still + 1 : 0; bx.yPrev = bx.y; }
          const onBelt = '<>Jj'.includes(tile(b, col(bx.x), Math.floor((bx.y + 2) / T)));
          if (warped) note(`${box} 가 포탈을 지나 (${col(bx.x)},${Math.round(bx.y / T) - 1}) 에`);
          else if (Math.abs(bx.y - y0) > 2) { fell = true; note(`${box} 가 (${col(bx.x)},${Math.round(bx.y / T) - 1}) 로 떨어졌다`); }
          else if (onBelt) note(`${box} 가 무빙워크에 올랐다 (${col(bx.x)}칸)`);
          else if (Math.abs(bx.x - px(x1)) >= 3) err = `${box} 를 ${x1}칸까지 못 밀었다 — ${col(bx.x)}칸에서 멈춤 (${where(world)})`;
        }
        break;
      }
      case 'ride': {
        const bx = b.boxes[boxIndex(stage, a[0])];
        for (let f = 0; f < 900 && Math.abs(bx.x - px(a[1])) >= 3; f++) sim.step(world, {});
        if (Math.abs(bx.x - px(a[1])) >= 3) err = `상자 ${a[0]} 가 무빙워크로 ${a[1]}칸까지 안 왔다 — ${col(bx.x)}칸`;
        else note(`${a[0]} 가 무빙워크에 실려 ${col(bx.x)}칸까지`);
        break;
      }
      case 'take': {
        const [who, color] = a;
        err = go(who); if (err) break;
        for (let f = 0; f < 40 && !b.opened.has(color); f++) sim.step(world, {});
        if (!b.opened.has(color)) { err = `${color} 열쇠를 못 집었다 ${where(world)}`; break; }
        err = sim.settle();
        for (let f = 0; f < 150 && (!world.player.grounded || b.boxes.some((x) => x.vy !== 0)); f++) sim.step(world, {});
        if (world.player.dead) err = `열쇠를 집고 떨어져 죽었다`;
        break;
      }
      case 'switch': {
        err = go(a[0]); if (err) break;
        for (let f = 0; f < 30 && !b.latched; f++) sim.step(world, {});
        if (!b.latched) err = `스위치가 안 눌렸다 ${where(world)}`;
        break;
      }
      case 'need_plate': {
        for (let f = 0; f < 30 && !b.plates[a[0]]; f++) sim.step(world, {});
        if (!b.plates[a[0]]) err = `누름판 ${a[0]} 가 안 눌려 있다 — ${IDS.map((k) => { const q = sim.at(k); return `${k}:(${col(q.x)},${row(q.fy)})`; }).join(' ')} 상자 ${b.boxes.map((x) => `(${col(x.x)},${Math.round(x.y / T) - 1})`).join(' ')}`;
        break;
      }
      case 'rally': {
        // 지금 1번이 선 집결판 무리가 체크포인트가 됐나 — 판에 집결판 무리가 여럿이면 앞 무리로는 안 된다
        const q0 = sim.at(IDS[0]), key = coopMod.rallyKey(b, col(q0.x), row(q0.fy));
        const rallied = () => !!key && b.rallyDone.has(key);
        for (let f = 0; f < 30 && !rallied(); f++) sim.step(world, {});
        if (!rallied()) err = `전원 집결판이 안 켜졌다 — ${IDS.map((k) => { const q = sim.at(k); return `${k}:(${col(q.x)},${row(q.fy)})`; }).join(' ')}`;
        break;
      }
      case 'timer': case 'deploy': {
        err = go(a[0]); if (err) break;
        const ready = () => verb === 'timer' ? b.timed > 0 : b.ladderOpen;
        for (let f = 0; f < 30 && !ready(); f++) sim.step(world, {});
        if (!ready()) err = `${verb === 'timer' ? '시한 스위치' : '구조 사다리'}가 작동하지 않았다 ${where(world)}`;
        break;
      }
      case 'lift': {
        // 정원만큼 아래 승강장 발판에 올라서면 승강기가 오른다. 인형은 발판을 따라 옮겨 준다 (sim.carry).
        const riders = a, lf = liftFor(b, riders.map((k) => sim.at(k)));
        if (!lf) { err = `${riders[0]}번 곁에 승강기 아래 승강장이 없다 ${where(sim.activate(riders[0]))}`; break; }
        const order = [...riders].sort((m, n) => sim.at(m).x - sim.at(n).x);
        for (const k of riders) { err = go(k) ?? walkTo(sim, world, liftSpot(lf, order.indexOf(k)), { frames: 600, noRunup: true }); if (err) break; }
        if (err) break;
        sim.carry?.(riders.filter((k) => k !== actor), lf);
        for (let f = 0; f < 60 * 20 && !(lf.pos >= lf.len && lf.dir === 0); f++) sim.step(world, {});
        sim.carry?.(null);
        if (lf.pos < lf.len) err = `승강기가 위 승강장까지 안 올라갔다 — ${Math.round(lf.pos)}/${lf.len}px`;
        break;
      }
      case 'tower': {
        // 전원 탑 — 밑 사람들이 층층이 서고 who 가 머리를 딛고 꼭대기에 올라 감지기에 닿는다. 켜지면 도로 뛰어내린다.
        const [who, on] = a;
        err = go(who); if (err) break;
        // 탑은 땅에서 쌓는다 — 누가 남의 머리 위에 서 있어도 가장 낮은 발(땅)을 기준으로
        const me = { x: sim.at(who).x, fy: Math.max(...[who, ...on].map((k) => sim.at(k).fy)) }, sensor = sensorAbove(b, me);
        if (!sensor) { err = `감지기 i 가 ${who}번 위에 없다 ${where(world)}`; break; }
        const lay = towerLayout(world, me, (sensor.x + 0.5) * T, on.length);
        if (!lay) { err = `탑을 세울 자리가 없다 ${where(world)}`; break; }
        err = sim.stack(on, lay, me); if (err) break;
        world = sim.activate(who);
        err = walkTo(sim, world, lay.start, { frames: 300, noRunup: true }) ?? hopChain(sim, world, lay, me, on.length, on.length - 1, 0);
        if (err) break;
        for (let f = 0; f < 40 && !b.tower; f++) sim.step(world, {});
        if (!b.tower) { err = `탑 꼭대기가 감지기 (${sensor.x},${sensor.y}) 에 안 닿았다 ${where(world)}`; break; }
        err = jumpTo(sim, world, lay.start, me.fy);
        break;
      }
      case 'sync': break;                                   // 동시 봇의 맞춤 지점 — 한 명씩 하는 세상에서는 할 일이 없다
      case 'signal': {
        err = go(a[0]); if (err) break;
        if (!b.signalAt) err = '신호탑 z 가 없다';
        else if (Math.abs(col(world.player.x) - b.signalAt.x) > 3) err = `${a[0]}번이 신호탑 앞에 없다 ${where(world)}`;
        break;
      }
      case 'choose': {
        // 신호탑 앞 사람이 말해 준 버튼으로 가서 ⌥↓. 틀리면(신호가 바뀌면) 다시 듣고 다시 누른다.
        err = go(a[0]); if (err) break;
        for (let tries = 0; tries < 4 && !b.signalOk && !err; tries++) {
          const spot = signalSpot(b);
          err = walkTo(sim, world, px(spot.x), { frames: 400, noRunup: true }); if (err) break;
          for (let f = 0; f < 30 && !b.signalOk && b.signalLock <= 0; f++) sim.step(world, { duck: true });
          for (let f = 0; f < 8; f++) sim.step(world, {});
          for (let f = 0; f < 80 && b.signalLock > 0; f++) sim.step(world, {});
        }
        if (!err && !b.signalOk) err = `신호 버튼을 맞게 못 눌렀다 ${where(world)}`;
        break;
      }
      case 'portal': {
        const [who, tag] = a;
        err = go(who); if (err) break;
        const to = b.portals[tag === tag.toLowerCase() ? tag.toUpperCase() : tag.toLowerCase()];
        // 저편 포탈 **한 칸 안**에 서면 지난 것이다. 딱 그 칸이어야 한다고 보면, 들어갈 때 남은 속도로
        // 몇 픽셀 미끄러진 사람이 못 지난 것으로 읽힌다 (뛰면서 포탈에 들어가면 늘 그렇다).
        const toX = (to.x + 0.5) * T;
        const there = () => Math.abs(world.player.x - toX) < T && world.player.grounded;
        for (let f = 0; f < 120 && !there(); f++) sim.step(world, {});
        if (!there()) err = `포탈 ${tag} 를 못 지났다 ${where(world)}`;
        break;
      }
      case 'box_portal': {
        const [box, tag] = a;
        const bx = b.boxes[boxIndex(stage, box)];
        const to = b.portals[tag === tag.toLowerCase() ? tag.toUpperCase() : tag.toLowerCase()];
        for (let f = 0; f < 120 && col(bx.x) !== to.x; f++) sim.step(world, {});
        if (col(bx.x) !== to.x) err = `상자 ${box} 가 포탈을 못 지났다`;
        break;
      }
      case 'spring': {
        const [who, x1, y1] = a;
        err = go(who); if (err) break;
        // 스프링은 **내려앉을 때** 튄다. 제자리에서 한 번 뛰어 스프링에 내린 뒤 목표로 조종한다.
        const p = world.player;
        const tr = trackNear(world, px(x1), pfy(y1));
        const rise = (world.groundY - p.air) - pfy(y1);
        const flight = (890 + Math.sqrt(Math.max(0, 890 * 890 - 2 * G * rise))) / G;
        const reach = 24 + RUN * Math.max(0, flight - 0.165);
        let t0 = 0;
        const aim = () => tr ? trackCenterAfter(tr, Math.max(0, flight - (sim.frames - t0) / 60)) : px(x1);
        if (tr) {
          const gap = () => Math.abs(trackCenterAfter(tr, flight) - p.x) - (1.5 * T - 15);   // 발판 가장자리까지
          for (let f = 0; f < 1200 && gap() > reach - 24; f++) sim.step(world, {});
          if (gap() > reach - 24) { err = `스프링: 발판이 닿을 거리(${(reach / T).toFixed(1)}칸)에 안 온다`; break; }
        }
        t0 = sim.frames;
        sim.step(world, { jump: true });
        let bounced = false;
        for (let f = 0; f < 90 && !bounced && !p.dead; f++) { sim.step(world, {}); bounced = p.vy > 600; }
        if (p.dead) { err = `스프링에 내리다 죽었다`; break; }
        if (!bounced) { err = `스프링이 안 튀었다 ${where(world)}`; break; }
        for (let f = 0; f < 200 && !p.grounded && !p.dead; f++) {
          const dx = aim() - p.x, dir = Math.sign(dx);
          const stop = p.vx * p.vx / (2 * FRICTION_A);
          const hold = Math.abs(dx) > stop + 3 ? dir : 0;
          sim.step(world, { left: hold < 0, right: hold > 0 });
        }
        if (p.dead) { err = `스프링으로 날다 죽었다 (${x1},${y1} 를 노렸다)`; break; }
        const fyL = world.groundY - p.air;
        if (Math.abs(fyL - pfy(y1)) > 16) err = `스프링 착지 (${x1},${y1}) 를 노렸는데 ${where(world)}`;
        else if (!tr) err = walkTo(sim, world, px(x1), { frames: 240, noRunup: true });
        break;
      }
      default: err = `모르는 걸음 ${verb}`;
    }
    per[actor] += sim.frames - f0;
    if (!err) err = sim.settle();
    if (!err) { const d = sim.deadOne(); if (d) err = `${d}번이 가만히 있다가 죽었다 (${(() => { const q = sim.at(d); return `${col(q.x)},${row(q.fy)}`; })()})`; }
    if (TRACE) console.log(`      → ${IDS.map((k) => { const q = sim.at(k); return `${k}:(${col(q.x)},${row(q.fy)})`; }).join(' ')}  ${where(world)}`);
    if (process.env.TRACE_POS) console.log(`pos ${i + 1} ${verb} ${a.join(' ')} | ${IDS.map((k) => { const q = sim.at(k); return `${k}:${(q.x / T).toFixed(1)},${(q.fy / T).toFixed(2)}`; }).join(' ')} | box ${b.boxes.map((x) => `${(x.x / T).toFixed(2)},${(x.y / T).toFixed(2)}`).join(' ')} | pl ${b.plates.p ? 'p' : ''}${b.plates.q ? 'q' : ''}`);
    if (err) return dump(world, err, i, label);
  }
  // 출구 — 조건이 차고 안에 있는 누가 ⌥↑
  for (let f = 0; f < 6; f++) sim.step(host, {});
  const ex = exitState(host);
  if (!ex.ready) {
    const spots = IDS.map((k) => { const q = sim.at(k); return `${k}:(${col(q.x)},${row(q.fy)})`; }).join(' ');
    return { ok: false, at: moves.length, label: '출구', per, err: `출구 조건이 안 찼다 — 안에 ${ex.inside}명 (필요 ${ex.need}). 자리 ${spots}` };
  }
  const cx = (b.exit.x + 0.5) * T, top = (b.exit.y + 1) * T;
  const inside = IDS.find((k) => { const q = sim.at(k); return Math.abs(q.x - cx) < T * 2.5 && q.fy <= top + T * 0.6 && q.fy > top - T * 1.5; });
  const world = sim.activate(inside);
  for (let f = 0; f < 3; f++) sim.step(world, {});
  for (let f = 0; f < 12 && !(b.done > 0); f++) sim.step(world, { jump: f < 3 });
  if (!(b.done > 0)) return { ok: false, at: moves.length, label: '출구', per, err: `⌥↑ 를 눌렀는데 다음 판으로 안 넘어간다 (${inside}번이 눌렀다)` };
  return { ok: true, per };
}

/// 판을 처음부터 끝까지 돈다. makeSim(stageName) 이 세상을 만든다. 결과를 돌려준다 (기록은 부르는 쪽이).
export function runAll(makeSim, { only = process.env.STAGE, ok, note: noteFn } = {}) {
  const results = [];
  for (const m of MOVES) {
    if (only && m.name !== only) continue;
    const stage = STAGES.find((s) => s.name === m.name);
    const sim = makeSim(stage.name);
    const r = play(stage, m.moves, sim);
    const seconds = sim.frames / 60;
    const idx = STAGES.indexOf(stage);
    const no = `${WORLD_NAMES.indexOf(stage.world) + 1}-${STAGES.filter((s, i) => s.world === stage.world && i <= idx).length}`;
    // 다 같이 동시에 움직이면 걸리는 시간의 어림 — 가장 많이 움직인 사람의 시간 + 아무도 안 움직인 시간
    const par = Math.max(...IDS.map((k) => r.per[k])) + r.per['판'];
    if (r.ok) ok(`${no} ${m.name} — ${m.moves.length}걸음 · 한 명씩 ${seconds.toFixed(0)}초 · 동시에 ≈${(par / 60).toFixed(0)}초${stage.limit ? ` (제한 ${stage.limit})` : ''}`, true);
    else { ok(`${no} ${m.name} — ${r.label}`, false); noteFn(r.err); }
    results.push({ no, name: m.name, world: stage.world, ok: r.ok, steps: m.moves.length, seconds: Math.round(seconds * 10) / 10,
                   parallel: Math.round(par / 60 * 10) / 10, limit: stage.limit || 0, fail: r.ok ? null : `${r.label}: ${r.err.split('\n')[0]}` });
  }
  return results;
}
