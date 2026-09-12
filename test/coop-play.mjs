// 넷이서 — 판을 **실제 엔진에서** 넷이 깬다.
//
// docs/넷이서/solve.py 는 풀이를 칸 단위로 지형에 대 본다 — 「두 칸 위 네 칸 옆」같은 어림값으로.
// 그 어림값이 coop.js 의 물리(픽셀·속도·중력·머리 높이 53px·웅크린 머리 31px)와 어긋나면
// 검사는 통과하는데 사람은 못 깨는 판이 나온다. 그래서 같은 풀이(test/coop-moves.json)를
// 여기서 **키를 눌러** 그대로 해 본다: 걷고, 구멍 앞에서 뛰고, 사다리를 타고, 상자를 밀고,
// 남의 머리를 딛고, 손을 잡아 끌어올리고, 출구에서 ⌥↑.
//
// 넷을 한 세상에서 굴린다. 움직이는 한 명만 진짜 물리(world.player)고 나머지 셋은 그 자리에 선
// 남(world.mp.others)이다 — 남의 물리는 그 사람 화면이 계산하는 것이라, 여기서는 서 있는 자리와
// 바닥에 떨어지는 것만 흉내 낸다. 누가 움직일 차례가 되면 그 사람을 world.player 로 갈아 끼운다.
//
// 통은 뺐다. 맞아도 죽지 않고 박자 문제라 「길이 있다」와는 무관한데, 봇을 넘어뜨려 결과를 흔든다.

import './dom-stub.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const coopMod = await import(R + 'games/coop.js');
const coop = coopMod.default;
const { T, STAGES, exitState, blinkOn, tile, floorBelow, bodyBlocked } = coopMod;
import { check, ok, say, note, done } from './check.mjs';

const MOVES = JSON.parse(readFileSync(new URL('coop-moves.json', import.meta.url), 'utf8'));
const ONLY = process.env.STAGE;                       // STAGE=탑 node test/coop-play.mjs — 한 판만
const TRACE = process.env.TRACE === '1';

// coop.js 의 값과 같아야 한다 (봇이 뛸 때를 재는 데 쓴다).
const HALF = 17, BLOCK_H = 50, HEAD = BLOCK_H + 3;    // 머리 꼭대기 = 발 - 53
const RUN = 290, G = 1700, JUMP_V = 568;
const FRICTION_G = 2600, FRICTION_A = 2600 * 0.35;
const DT = 1 / 60;

// ── 세상 만들기 ─────────────────────────────────────────────────────────────

function makeWorld(stageName) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'coop');
  world.debug = true;
  world.onRecord = () => {}; world.onGameOver = (r) => { world.ended = r; };
  world.sent = []; world.send = (m, to) => world.sent.push({ m, to });
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1;
  world.stage = STAGES.findIndex((s) => s.name === stageName);
  w.restart(world);
  world.state = 'play';
  world.bag.chutes = [];                                // 통은 뺀다 (위 설명)
  return world;
}

/// 남 하나. 자리는 픽셀 (x, 발 y).
function puppet(world, id, x, fy) {
  const air = world.groundY - fy;
  return { id, name: `${id}번`, x, air, baseX: x, baseAir: air, age: 0, errorX: 0, vx: 0, vy: 0, crouch: 0, tcrouch: 0,
           facing: 1, walk: 0, dead: false, waiting: false, deadFor: 0, groundY: world.groundY, grabbing: -1, heldBy: -1,
           escapes: 0, seenEscapes: 0, vyDraw: 0, fyPrev: undefined };
}

/// 넷의 자리표. 움직이는 사람(active)만 world.player 에 살고 나머지는 others 에 선다.
class Team {
  constructor(world) {
    this.world = world;
    this.pos = {};
    const b = world.bag;
    for (let i = 0; i < 4; i++) this.pos[String(i + 1)] = { x: (b.spawn[i].x + 0.5) * T, fy: (b.spawn[i].y + 1) * T };
    this.active = null;
    this.activate('1');
  }
  /// 누가 움직일 차례인지 갈아 끼운다.
  activate(who) {
    const world = this.world, p = world.player;
    if (this.active === who) return;
    if (this.active) {
      // 사다리·리프트에 매달린 채 차례를 넘기면 그대로 매달려 있다 (자리표에 적어 둔다)
      this.pos[this.active] = { x: p.x, fy: world.groundY - p.air, ladder: !!p.onLadder };
      world.mp.others.set(+this.active, puppet(world, +this.active, p.x, world.groundY - p.air));
    }
    world.mp.others.delete(+who);
    const at = this.pos[who];
    p.x = at.x; p.air = world.groundY - at.fy; p.vx = 0; p.vy = 0; p.grounded = !at.ladder; p.onLadder = !!at.ladder;
    p.crouch = 0; p.dead = false; p.stun = 0; p.knock = 0; p.jumpHeld = false; p.rideId = null; p.load = 0;
    this.active = who;
    this.settleActive = true;
    // 다른 셋은 자리표대로 세워 둔다
    for (const k of ['1', '2', '3', '4']) {
      if (k === who) continue;
      const q = this.pos[k];
      const o = world.mp.others.get(+k);
      if (!o) world.mp.others.set(+k, puppet(world, +k, q.x, q.fy));
      else if (Math.abs(o.x - q.x) > 0.5 || Math.abs((o.groundY - o.air) - q.fy) > 0.5) this.place(k, q.x, q.fy);
    }
  }
  /// 남을 어디에 세운다 (픽셀).
  place(who, x, fy) {
    const world = this.world;
    this.pos[who] = { x, fy, ladder: false };
    if (who === this.active) { world.player.x = x; world.player.air = world.groundY - fy; return; }
    const o = world.mp.others.get(+who);
    if (!o) { world.mp.others.set(+who, puppet(world, +who, x, fy)); return; }
    o.x = o.baseX = x; o.air = o.baseAir = world.groundY - fy; o.age = 0; o.errorX = 0; o.vx = 0; o.vy = 0; o.fyPrev = undefined;
  }
  at(who) {
    if (who === this.active) { const p = this.world.player; return { x: p.x, fy: this.world.groundY - p.air }; }
    const o = this.world.mp.others.get(+who);
    return { x: o.x, fy: o.groundY - o.air };
  }
  /// k 번 발밑의 바닥 — 타일·상자·발판, 그리고 **다른 사람의 머리**. 없으면 null.
  floorUnder(k) {
    const world = this.world, q = this.at(k);
    let best = floorBelow(world, q.x, q.fy - 1, world.groundY + T, HALF - 2, { people: false });
    for (const j of ['1', '2', '3', '4']) {
      if (j === k) continue;
      const o = this.at(j);
      if (Math.abs(o.x - q.x) >= 30) continue;
      const top = o.fy - HEAD;
      if (top >= q.fy - 1 && (best === null || top < best)) best = top;
    }
    return best;
  }
  /// 발밑이 사라진 남을 바닥까지 떨어뜨린다. 그 사람 화면에서는 물리가 그렇게 한다.
  /// 위에 선 사람부터 본다 — 밑 사람이 먼저 떨어지면 위 사람은 그 머리를 따라 내려간다.
  settle() {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const k of ['1', '2', '3', '4']) {
        if (k === this.active || this.pos[k].ladder) continue;
        const q = this.at(k);
        const floor = this.floorUnder(k);
        if (floor === null) return `${k}번이 떨어져 판 밖으로 나간다 (${col(q.x)},${row(q.fy)})`;
        if (Math.abs(floor - q.fy) > 0.5) { this.place(k, q.x, floor); moved = true; }
      }
      if (!moved) break;
    }
    return null;
  }
  /// 차례를 받은 사람이 허공에 있으면 내려앉을 때까지 굴린다.
  landActive() {
    if (!this.settleActive) return null;
    this.settleActive = false;
    const p = this.world.player;
    if (p.onLadder) return null;
    for (let f = 0; f < 120 && !(p.grounded && f > 0); f++) tick(this.world, {});
    if (p.dead) return `${this.active}번이 차례를 받자 떨어져 죽었다`;
    return null;
  }
}

const col = (x) => Math.floor(x / T);
const row = (fy) => Math.floor((fy - 1) / T);
const where = (world) => { const p = world.player; return `(${col(p.x)},${row(world.groundY - p.air)})`; };

let frames = 0;
function tick(world, input = {}) {
  Object.assign(world.input, { left: false, right: false, jump: false, duck: false }, input);
  w.update(world, DT);
  frames++;
}

// ── 지형 묻기 ───────────────────────────────────────────────────────────────

/// x 앞에 발 높이 근처(±16px) 바닥이 있나. 좁은 기둥으로 찔러 본다.
const floorAt = (world, x, fy, people = false) => floorBelow(world, x, fy - 16, fy + 16, 5, { people });
/// 이 자리를 지나는 왕복 발판 길 — 발판 윗면이 발 높이 근처인 것.
function trackNear(world, x, fy) {
  return world.bag.tracks.find((tr) => Math.abs(tr.y * T + T * 0.3 - fy) < 22 && x >= tr.x0 * T - 6 && x <= (tr.x1 + 1) * T + 6) ?? null;
}
function trackRect(tr) { const x0 = tr.x0 * T + tr.pos; return { x0, x1: x0 + 3 * T }; }
/// 왕복 발판이 dt 초 뒤 어디 있을지 (끝에서 되돌아오는 것까지). 발판 가운데 x.
function trackCenterAfter(tr, dt) {
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

// ── 움직임 ──────────────────────────────────────────────────────────────────

/// x1(px) 까지 걷는다. 구멍은 뛰어 넘고, 낮은 턱도 뛰어 넘고, 깜빡이는 발판 앞에서는 켜질 때를 기다리고,
/// 왕복 발판 줄에서는 발판을 기다리거나 타고 간다.
function walkTo(world, targetX, opts = {}) {
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
    const belt = p.grounded && '<>'.includes(tile(b, col(p.x), Math.floor((fy + 2) / T)));
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
        const ahead = floorAt(world, ax, fy, true) ?? floorBelow(world, ax, fy + 16, fy + 60, 5, { people: true });   // 조금 낮은 데는 내려선다
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
              const back = walkTo(world, p.x - dir * 1.5 * T, { noRunup: true, frames: 120 });
              if (back) return back;
              continue;
            }
            jump = true;
          }
        }
        // 낮은 턱 — 목표가 그 너머인데 앞이 막혔고 한 칸 위가 비었으면 뛰어 오른다
        if (hold && !jump && Math.abs(dx) > HALF + 8 && bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1, BLOCK_H)
            && !bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1 - T, BLOCK_H)) jump = true;
      }
    }
    tick(world, { left: hold < 0, right: hold > 0, jump });
  }
  return `걷기 시간 초과 ${where(world)} → ${col(targetX)}칸`;
}

/// (tX, tFy) 로 뛴다. 위로 뛸 때는 내려오면서 그 높이를 지나는 순간에 닿게 뛸 때를 잰다.
function jumpTo(world, tX, tFy, opts = {}) {
  const p = world.player, b = world.bag;
  const fy0 = world.groundY - p.air;
  const dy = fy0 - tFy;                                  // + 면 위로
  if (dy > 0 && JUMP_V * JUMP_V - 2 * G * (dy + 6) < 0) return `점프 ${where(world)}→(${col(tX)},${row(tFy)}): ${(dy / T).toFixed(2)}칸 위는 못 뛴다`;
  let phase = 'run';
  // 목표가 왕복 발판 위면 발판은 움직인다. 뛰어서 내려앉기까지의 시간(tLand) 뒤 발판 가운데를 노린다.
  const tr = dy > 0 ? trackNear(world, tX, tFy) : null;
  const tLandUp = dy > 0 ? (JUMP_V + Math.sqrt(Math.max(0, JUMP_V * JUMP_V - 2 * G * Math.max(0, dy - 12)))) / G : 0;
  let t0 = 0;
  const aimX = () => tr ? trackCenterAfter(tr, Math.max(0, tLandUp - (frames - t0) / 60)) : tX;
  let lastX = p.x;
  for (let f = 0; f < 1500; f++) {
    if (p.dead) return `죽었다 ${where(world)}`;
    if (Math.abs(p.x - lastX) > 3 * T) return null;      // 포탈로 옮겨졌다
    lastX = p.x;
    const fy = world.groundY - p.air;
    const dx = (phase === 'run' ? tX : aimX()) - p.x, dir = Math.sign(dx) || p.facing || 1;
    if (phase === 'run') {
      if (process.env.TRACE === '2') console.log(`        run f${f} x=${p.x.toFixed(0)} fy=${fy.toFixed(0)} vx=${p.vx.toFixed(0)} g=${p.grounded ? 1 : 0} load=${p.load} held=${p.jumpHeld} crouch=${p.crouch.toFixed(2)} stun=${p.stun} ladder=${p.onLadder} others=${[...world.mp.others.values()].map((o) => `${o.id}:${(o.x - p.x).toFixed(0)},${((o.groundY - o.air) - fy).toFixed(0)}`).join(' ')}`);
      if (!p.grounded) { phase = 'air'; continue; }
      let jumpNow = false;
      if (tr) {
        // 발판 — 착지 때 발판 가장자리가 가만히 서서 뛰어 닿을 거리에 오면 뛴다
        const reach = 24 + RUN * Math.max(0, tLandUp - 0.165);
        const gap = Math.abs(trackCenterAfter(tr, tLandUp) - p.x) - (1.5 * T - 15);
        if (gap > reach - 20) { tick(world, {}); continue; }
        t0 = frames;
        tick(world, { left: dir < 0, right: dir > 0, jump: true }); phase = 'air'; continue;
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
          if (trackNear(world, ax, fy)) { tick(world, {}); continue; }
          jumpNow = !(dy < 0 && Math.abs(dx) < 1.6 * T);   // 바로 아래로 내려가는 거면 걸어서 떨어진다
        } else if (bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1, BLOCK_H)) jumpNow = true;
      }
      if (dy <= 0 && Math.abs(dx) < 3 && Math.abs(p.vx) < 40 && Math.abs(fy - tFy) < 16) return null;   // 걸어서 닿았다
      const stop = p.vx * p.vx / (2 * FRICTION_G);
      const hold = (dy <= 0 && Math.abs(dx) <= stop + 2) ? 0 : dir;
      if (jumpNow) { tick(world, { left: dir < 0, right: dir > 0, jump: true }); phase = 'air'; continue; }
      tick(world, { left: hold < 0, right: hold > 0 });
    } else if (phase === 'air') {
      if (process.env.TRACE === '2') console.log(`        f${f} x=${p.x.toFixed(0)} fy=${(world.groundY - p.air).toFixed(0)} vx=${p.vx.toFixed(0)} vy=${p.vy.toFixed(0)} g=${p.grounded ? 1 : 0}`);
      if (p.grounded) { phase = 'landed'; continue; }
      const stop = p.vx * p.vx / (2 * FRICTION_A);
      const hold = Math.abs(dx) > stop + 3 ? dir : 0;
      tick(world, { left: hold < 0, right: hold > 0 });
    } else {
      const fyL = world.groundY - p.air;
      // 목표 자리에 동료가 서 있으면 그 머리 위에 내린다 — 자리는 맞다. 다음 걸음에 내려선다.
      const onHead = [...world.mp.others.values()].some((o) => !o.dead && Math.abs(o.x - p.x) < 30 && Math.abs((o.groundY - o.air - HEAD) - fyL) < 4);
      const onBox = b.boxes.some((x) => Math.abs(x.x - p.x) < 36 && Math.abs((x.y - T) - fyL) < 4);
      const higher = fyL < tFy && tFy - fyL <= HEAD * 2 && (onHead || onBox) && Math.abs(dx) <= 1.6 * T;
      if (Math.abs(fyL - tFy) > 16 && !higher) return `점프 착지 (${col(tX)},${row(tFy)}) 를 노렸는데 ${where(world)} — 발이 ${(fyL / T).toFixed(2)}줄`;
      if (!tr && Math.abs(dx) > 1.6 * T) return `점프 착지 (${col(tX)},${row(tFy)}) 를 노렸는데 ${where(world)}`;
      if (tr) return null;                                 // 발판 위에 내렸다 — 실려 간다
      return walkTo(world, tX, { frames: 240, noRunup: true });
    }
  }
  return `점프 시간 초과 ${where(world)} → (${col(tX)},${row(tFy)})`;
}

/// 사다리·리프트로 fy 까지.
function climbTo(world, tFy) {
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
    if (process.env.TRACE === '2' && (f < 5 || f % 30 === 0)) console.log(`        climb f${f} x=${p.x.toFixed(0)} fy=${fy.toFixed(1)} onLadder=${p.onLadder} g=${p.grounded} stun=${p.stun} crouch=${p.crouch.toFixed(2)} load=${p.load} up=${up}`);
    tick(world, { jump: up, duck: !up });
  }
  return `사다리 시간 초과 ${where(world)} → ${row(tFy)}줄`;
}

// ── 풀이 한 걸음 ────────────────────────────────────────────────────────────

/// 상자 이름(x0, X1 …) → 엔진의 상자 번호. 둘 다 위→아래, 왼→오른 순서인데 엔진은 x·X 를 섞어 센다.
function boxIndex(stage, name) {
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

function play(stage, moves) {
  const world = makeWorld(stage.name);
  const team = new Team(world);
  const b = world.bag;
  const px = (tx) => (tx + 0.5) * T, pfy = (ty) => (ty + 1) * T;
  const trace = (s) => { if (TRACE) console.log('      ' + s); };

  for (let i = 0; i < moves.length; i++) {
    const [verb, ...a] = moves[i];
    const label = `${i + 1}/${moves.length} ${verb} ${a.map((v) => Array.isArray(v) ? v.join('·') : v).join(' ')}`;
    trace(label);
    let err = null;
    const go = (who) => { team.activate(who); return team.landActive(); };
    switch (verb) {
      case 'walk': { err = go(a[0]) ?? walkTo(world, px(a[1])); break; }
      case 'jump': { err = go(a[0]) ?? jumpTo(world, px(a[1]), pfy(a[2])); break; }
      case 'climb': { err = go(a[0]) ?? climbTo(world, pfy(a[1])); break; }
      case 'hop': {
        // 제자리 높이로 뛰어 넘는다 — 열쇠를 안 집고. 한 칸 반 물러나 달려와서, 공중 0.67초에 닿을 거리에서 뛴다.
        err = go(a[0]); if (err) break;
        const p = world.player, tX = px(a[1]), dir = Math.sign(tX - p.x);
        err = walkTo(world, p.x - dir * 1.5 * T, { frames: 200, noRunup: true }); if (err) { err = `뛰어넘기 준비: ${err}`; break; }
        for (let f = 0; f < 200 && Math.abs(tX - p.x) > RUN * 0.6; f++) tick(world, { left: dir < 0, right: dir > 0 });
        tick(world, { left: dir < 0, right: dir > 0, jump: true });
        for (let f = 0; f < 120 && !p.grounded && !p.dead; f++) {
          const dx = tX - p.x, stop = p.vx * p.vx / (2 * FRICTION_A);
          const hold = Math.abs(dx) > stop + 3 ? Math.sign(dx) : 0;
          tick(world, { left: hold < 0, right: hold > 0 });
        }
        if (p.dead) { err = `뛰어넘다 죽었다`; break; }
        if (Math.abs(tX - p.x) > 1.6 * T) { err = `뛰어넘기 착지 ${where(world)} (목표 ${a[1]}칸)`; break; }
        err = walkTo(world, tX, { frames: 240, noRunup: true });
        break;
      }
      case 'boost': case 'stairs': {
        // 어깨·사람 계단 — 남들이 14px 씩 물려 층층이 **서고**, 내가 하나씩 딛고 올라가 뛴다.
        // (웅크린 머리는 31px 라 한 칸이 안 된다. 서면 53px — 한 칸 남짓.)
        // 자리가 있으면 목표 쪽으로 기울여 세우고(계단), 벽에 붙어 있으면 반대쪽으로 기울여 세우고 내가 물러선다(어깨).
        const [who, x1, y1, on] = a;
        err = go(who); if (err) break;
        const me = team.at(who);
        const dir = Math.sign(px(x1) - me.x) || 1;
        const n = on.length;
        const free = (x, fy) => !bodyBlocked(world, x, fy - 1, BLOCK_H);
        // 스택: 맨 밑 사람이 base, 위로 갈수록 lean 쪽으로 14px 씩. 나는 스택 뒤(-lean 쪽) 44px 에서 시작해
        // 머리를 하나씩 딛는다 — 머리 k 에서는 다음 사람 발에 머리를 찧지 않게 뒤쪽 가장자리(-lean·20)에 선다.
        // 벽·기둥에 막히면 스택을 뒤로 14px 씩 물려 자리를 찾는다.
        const layouts = [];
        for (let j = 0; j < 8; j++) layouts.push({ base: me.x + dir * (32 - 14 * j), lean: dir });
        for (let j = 0; j < 8; j++) layouts.push({ base: me.x - dir * 14 * j, lean: -dir });
        for (const L of layouts) L.start = L.base - L.lean * 44;
        let lay = layouts.find((L) => on.every((o, k) => free(L.base + L.lean * 14 * k, me.fy - HEAD * k))
                                    && floorAt(world, L.base, me.fy, false) !== null
                                    && floorAt(world, L.start, me.fy, false) !== null && free(L.start, me.fy));
        // 상자 위처럼 좁은 데서는 옆에 설 자리가 없다. 한 명이면 **내 자리에** 세우고 제자리에서 뛰어 그 머리에 선다
        // (몸은 겹쳐도 된다 — 발이 같은 높이면 머리를 찧지도, 내 머리 위에 선 것으로 치지도 않는다).
        if (!lay && n === 1) lay = { base: me.x, lean: dir, start: me.x };
        if (!lay) { err = `어깨를 세울 자리가 없다 ${where(world)}`; break; }
        on.forEach((o, k) => team.place(o, lay.base + lay.lean * 14 * k, me.fy - HEAD * k));
        if (Math.abs(lay.start - me.x) > 2) err = walkTo(world, lay.start, { frames: 300, noRunup: true });
        for (let k = 0; k < n && !err; k++) {
          const edge = k < n - 1 ? -lay.lean * 20 : 0;
          err = jumpTo(world, lay.base + lay.lean * 14 * k + edge, me.fy - HEAD * (k + 1));
          if (err) err = `${on[k]}번 머리에 올라서기: ${err}`;
        }
        if (!err) err = jumpTo(world, px(x1), pfy(y1));
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
        const y0 = bx.y;
        let fell = false, warped = false;
        const limit = Math.round(60 * (Math.abs(px(x1) - bx.x) / 92 + 12));
        let lastBx = bx.x;
        for (let f = 0; f < limit; f++) {
          if (world.player.dead) { err = `죽었다 ${where(world)}`; break; }
          if (Math.abs(bx.x - lastBx) > 3 * T) { warped = true; break; }   // 포탈을 지났다
          lastBx = bx.x;
          // 같이 미는 사람은 상자 뒤에 붙어 그쪽으로 걷는 시늉
          for (const m of mates) { team.place(m, bx.x - dir * 40, bx.y); const o = world.mp.others.get(+m); o.vx = dir * 4; }
          if (bx.y > y0 + 2) fell = true;
          if (fell && bx.vy === 0 && Math.abs(bx.y - y0) > T * 0.9) break;
          if (!fell && Math.abs(bx.x - px(x1)) < 3) break;
          if (process.env.TRACE === '2' && f % 60 === 0) console.log(`        push f${f} box=${bx.x.toFixed(0)} me=${world.player.x.toFixed(0)} pushing=${world.player.pushing} px=${bx.px}`);
          tick(world, { left: dir < 0, right: dir > 0 });
        }
        if (!err) {
          // 다 밀고 나서 떨어지기 시작할 수 있다 — 상자가 가만히 있을 때까지 본다
          for (let f = 0, still = 0; f < 180 && still < 6; f++) { tick(world, {}); still = bx.vy === 0 && Math.abs(bx.y - (bx.yPrev ?? bx.y)) < 0.01 ? still + 1 : 0; bx.yPrev = bx.y; }
          const onBelt = '<>'.includes(tile(b, col(bx.x), Math.floor((bx.y + 2) / T)));
          if (warped) note(`${box} 가 포탈을 지나 (${col(bx.x)},${Math.round(bx.y / T) - 1}) 에`);
          else if (Math.abs(bx.y - y0) > 2) { fell = true; note(`${box} 가 (${col(bx.x)},${Math.round(bx.y / T) - 1}) 로 떨어졌다`); }
          else if (onBelt) note(`${box} 가 무빙워크에 올랐다 (${col(bx.x)}칸)`);
          else if (Math.abs(bx.x - px(x1)) >= 3) err = `${box} 를 ${x1}칸까지 못 밀었다 — ${col(bx.x)}칸에서 멈춤 (${where(world)})`;
          for (const m of mates) { const o = world.mp.others.get(+m); o.vx = 0; team.place(m, world.player.x - dir * (2 * HALF + 4), world.groundY - world.player.air); }
          for (let f = 0; f < 6; f++) tick(world, {});
          err = err ?? team.settle();
        }
        break;
      }
      case 'pull': {
        const [who, by] = a;
        err = go(by); if (err) break;
        for (let f = 0; f < 4; f++) tick(world, {});
        world.sent = [];
        coop.action(world);
        if (TRACE) { const p = world.player, fy = world.groundY - p.air; for (const x of [p.x - 38, p.x + 38]) console.log(`      pull 후보 x=${x.toFixed(0)} blocked=${bodyBlocked(world, x, fy - 1, BLOCK_H)} floor=${floorBelow(world, x, fy - 2, fy + 2, HALF - 2, { people: false })} fy=${fy}`); }
        const msg = world.sent.find((s) => s.m.k === 'pull' && s.m.to === +who);
        if (!msg) { const q = team.at(who), me = team.at(by), p = world.player; err = `손이 안 닿는다 — ${who}번은 ${((q.fy - me.fy) / T).toFixed(2)}칸 아래 ${(Math.abs(q.x - me.x) / T).toFixed(2)}칸 옆 · 나 g=${p.grounded} dead=${p.dead} pulling=${p.pulling} 보낸 것=${JSON.stringify(world.sent)}`; break; }
        const meBefore = team.at(by), qBefore = team.at(who);
        team.place(who, msg.m.x, world.groundY - msg.m.air);
        err = team.settle();
        const q = team.at(who), me = team.at(by);
        if (!err && Math.abs(q.fy - me.fy) > 16) err = `끌어올린 ${who}번이 설 바닥이 없다 (${col(q.x)},${row(q.fy)}) — ${by}번은 (${col(meBefore.x)},${row(meBefore.fy)}) x=${meBefore.x.toFixed(0)} fy=${meBefore.fy.toFixed(0)}, ${who}번은 (${col(qBefore.x)},${row(qBefore.fy)}), 세운 자리 x=${msg.m.x} air=${msg.m.air}`;
        break;
      }
      case 'take': {
        const [who, color] = a;
        err = go(who); if (err) break;
        for (let f = 0; f < 6 && !b.opened.has(color); f++) tick(world, {});
        if (!b.opened.has(color)) { err = `${color} 열쇠를 못 집었다 ${where(world)}`; break; }
        err = team.settle();
        for (let f = 0; f < 150 && (!world.player.grounded || b.boxes.some((x) => x.vy !== 0)); f++) tick(world, {});
        if (world.player.dead) err = `열쇠를 집고 떨어져 죽었다`;
        break;
      }
      case 'switch': {
        err = go(a[0]); if (err) break;
        for (let f = 0; f < 6; f++) tick(world, {});
        if (!b.latched) err = `스위치가 안 눌렸다 ${where(world)}`;
        break;
      }
      case 'need_plate': {
        for (let f = 0; f < 3; f++) tick(world, {});
        if (!b.plates[a[0]]) err = `누름판 ${a[0]} 가 안 눌려 있다 — ${['1','2','3','4'].map((k) => { const q = team.at(k); return `${k}:(${col(q.x)},${row(q.fy)}) fy=${q.fy.toFixed(1)}`; }).join(' ')} 상자 ${b.boxes.map((x) => `(${col(x.x)},${Math.round(x.y / T) - 1})`).join(' ')}`;
        break;
      }
      case 'portal': {
        const [who, tag] = a;
        err = go(who); if (err) break;
        const to = b.portals[tag === tag.toLowerCase() ? tag.toUpperCase() : tag.toLowerCase()];
        for (let f = 0; f < 120 && !(col(world.player.x) === to.x && world.player.grounded); f++) tick(world, {});
        if (col(world.player.x) !== to.x) err = `포탈 ${tag} 를 못 지났다 ${where(world)}`;
        break;
      }
      case 'ride': {
        // 무빙워크 위 상자가 혼자 x1 까지 간다
        const bx = b.boxes[boxIndex(stage, a[0])];
        for (let f = 0; f < 900 && Math.abs(bx.x - px(a[1])) >= 3; f++) tick(world, {});
        if (Math.abs(bx.x - px(a[1])) >= 3) err = `상자 ${a[0]} 가 무빙워크로 ${a[1]}칸까지 안 왔다 — ${col(bx.x)}칸`;
        else note(`${a[0]} 가 무빙워크에 실려 ${col(bx.x)}칸까지`);
        break;
      }
      case 'box_portal': {
        const [box, tag] = a;
        const bx = b.boxes[boxIndex(stage, box)];
        const to = b.portals[tag === tag.toLowerCase() ? tag.toUpperCase() : tag.toLowerCase()];
        for (let f = 0; f < 120 && col(bx.x) !== to.x; f++) tick(world, {});
        if (col(bx.x) !== to.x) err = `상자 ${box} 가 포탈을 못 지났다`;
        break;
      }
      case 'spring': {
        const [who, x1, y1] = a;
        err = go(who); if (err) break;
        // 스프링은 **내려앉을 때** 튄다. 제자리에서 한 번 뛰어 스프링에 내린 뒤 목표로 조종한다.
        const p = world.player;
        const tr = trackNear(world, px(x1), pfy(y1));
        // 발판이 목표면: 튀어 올라 그 높이로 내려앉기까지의 시간(flight) 동안 발판이 어디까지 갈지 — 끝에서
        // 되돌아오는 것까지 — 셈해서, 그 자리가 닿을 거리(가만히 서서 뛰어 갈 수 있는 거리)에 올 때 뛴다.
        // 날면서는 「남은 시간 뒤 발판 가운데」를 노린다.
        const rise = (world.groundY - p.air) - pfy(y1);
        const flight = (890 + Math.sqrt(Math.max(0, 890 * 890 - 2 * G * rise))) / G;
        const reach = 24 + RUN * Math.max(0, flight - 0.165);
        let t0 = 0;
        const aim = () => tr ? trackCenterAfter(tr, Math.max(0, flight - (frames - t0) / 60)) : px(x1);
        if (tr) {
          const gap = () => Math.abs(trackCenterAfter(tr, flight) - p.x) - (1.5 * T - 15);   // 발판 가장자리까지
          for (let f = 0; f < 1200 && gap() > reach - 24; f++) tick(world, {});
          if (gap() > reach - 24) { err = `스프링: 발판이 닿을 거리(${(reach / T).toFixed(1)}칸)에 안 온다`; break; }
        }
        t0 = frames;
        tick(world, { jump: true });
        let bounced = false;
        for (let f = 0; f < 90 && !bounced && !p.dead; f++) { tick(world, {}); bounced = p.vy > 600; }
        if (p.dead) { err = `스프링에 내리다 죽었다`; break; }
        if (!bounced) { err = `스프링이 안 튀었다 ${where(world)}`; break; }
        for (let f = 0; f < 200 && !p.grounded && !p.dead; f++) {
          const dx = aim() - p.x, dir = Math.sign(dx);
          const stop = p.vx * p.vx / (2 * FRICTION_A);
          const hold = Math.abs(dx) > stop + 3 ? dir : 0;
          if (process.env.TRACE === '2') console.log(`        spring f${f} x=${p.x.toFixed(0)} fy=${(world.groundY - p.air).toFixed(0)} vx=${p.vx.toFixed(0)} vy=${p.vy.toFixed(0)} aim=${aim().toFixed(0)} plat=${tr ? trackRect(tr).x0.toFixed(0) : '-'}`);
          tick(world, { left: hold < 0, right: hold > 0 });
        }
        if (p.dead) { err = `스프링으로 날다 죽었다 (${x1},${y1} 를 노렸다)`; break; }
        const fyL = world.groundY - p.air;
        if (Math.abs(fyL - pfy(y1)) > 16) err = `스프링 착지 (${x1},${y1}) 를 노렸는데 ${where(world)}`;
        else if (!tr) err = walkTo(world, px(x1), { frames: 240, noRunup: true });
        break;
      }
      default: err = `모르는 걸음 ${verb}`;
    }
    if (!err) err = team.settle();
    if (TRACE) console.log(`      → ${['1', '2', '3', '4'].map((k) => { const q = team.at(k); return `${k}:(${col(q.x)},${row(q.fy)})${team.pos[k]?.ladder && k !== team.active ? 'H' : ''}`; }).join(' ')}  ${where(world)} fy=${(world.groundY - world.player.air).toFixed(1)}`);
    if (err) {
      // 실패한 자리 둘레 지형 — 왜 못 갔는지 보려고
      const p = world.player, fy = world.groundY - p.air, cx = col(p.x), cy = row(fy);
      const around = [];
      for (let y = Math.max(0, cy - 3); y <= Math.min(b.h - 1, cy + 2); y++) {
        let line = '';
        for (let x = Math.max(0, cx - 6); x <= Math.min(b.w - 1, cx + 6); x++) line += (x === cx && y === cy) ? '@' : b.rows[y][x];
        around.push(`${String(y).padStart(2)} ${line}`);
      }
      const spots = ['1', '2', '3', '4'].map((k) => { const q = team.at(k); return `${k}:(${col(q.x)},${row(q.fy)})`; }).join(' ');
      return { ok: false, at: i, label, err: `${err}\n      자리 ${spots} · 상자 ${b.boxes.map((x) => `(${col(x.x)},${Math.round(x.y / T) - 1})`).join(' ')} · 열쇠 ${[...b.opened].join('') || '-'}\n      ${around.join('\n      ')}` };
    }
  }
  // 출구 — 조건이 차고 안에 있는 누가 ⌥↑
  for (let f = 0; f < 3; f++) tick(world, {});
  const ex = exitState(world);
  if (!ex.ready) {
    const spots = ['1', '2', '3', '4'].map((k) => { const q = team.at(k); return `${k}:(${col(q.x)},${row(q.fy)})`; }).join(' ');
    return { ok: false, at: moves.length, label: '출구', err: `출구 조건이 안 찼다 — 안에 ${ex.inside}명 (필요 ${ex.need}). 자리 ${spots}` };
  }
  // 안에 있는 사람이 누른다
  const cx = (b.exit.x + 0.5) * T, top = (b.exit.y + 1) * T;
  const inside = ['1', '2', '3', '4'].find((k) => { const q = team.at(k); return Math.abs(q.x - cx) < T * 2.5 && Math.abs(q.fy - top) < T * 0.6; });
  team.activate(inside);
  for (let f = 0; f < 3; f++) tick(world, {});
  tick(world, { jump: true }); tick(world, { jump: true });
  if (!(b.done > 0)) return { ok: false, at: moves.length, label: '출구', err: '⌥↑ 를 눌렀는데 다음 판으로 안 넘어간다' };
  return { ok: true };
}

// ── 돌리기 ──────────────────────────────────────────────────────────────────

say('열두 판 — 풀이 그대로 키를 눌러 넷이 깬다 (통은 뺐다)');
const results = [];
for (const m of MOVES) {
  if (ONLY && m.name !== ONLY) continue;
  const stage = STAGES.find((s) => s.name === m.name);
  frames = 0;
  const r = play(stage, m.moves);
  const seconds = frames / 60;
  const idx = STAGES.indexOf(stage);
  const no = `${['뒷마당', '학교', '도시', '지하철'].indexOf(stage.world) + 1}-${STAGES.filter((s, i) => s.world === stage.world && i <= idx).length}`;
  if (r.ok) {
    ok(`${no} ${m.name} — ${m.moves.length}걸음 · ${seconds.toFixed(1)}초`, true);
  } else {
    ok(`${no} ${m.name} — ${r.label}`, false);
    note(`${r.err}`);
  }
  results.push({ no, name: m.name, world: stage.world, ok: r.ok, steps: m.moves.length, seconds: Math.round(seconds * 10) / 10, fail: r.ok ? null : `${r.label}: ${r.err}` });
}
if (!ONLY) writeFileSync(new URL('../docs/넷이서/play.json', import.meta.url), JSON.stringify(results, null, 1));
done('넷이서 실전');
