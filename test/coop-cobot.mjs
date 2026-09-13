// 넷이서 — 넷이 **동시에** 논다. 4세상(방장 1 + 손님 3)을 프레임마다 넷의 입력으로 함께 굴리고,
// 화면 하나(넷을 다 담는 카메라)로 렌더한다. 걷기·점프·사다리는 서로 겹쳐 동시에, 어깨·손잡기·밀기
// 같은 협동 마디는 그 순간만 낀 사람끼리 — 그래서 "여러 명이 같이 노는" 것처럼 보이면서 규칙이 안 어긋난다.
//
//   node test/coop-cobot.mjs             # 열네 판 → ~/Downloads/몰겜-넷이서-동시/ (+ 전체 하나)
//   STAGE=상자 계단 node test/coop-cobot.mjs
//
// 움직임은 coop-bot 의 물리 그대로 (제너레이터가 프레임마다 입력을 내보낸다). 충돌·손잡기 실제 엔진.

import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
for (const fam of ['Apple SD Gothic Neo', 'Gothic A1', 'IBM Plex Sans KR', 'IBM Plex Mono'])
  try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: fam }); } catch {}

import {
  w, coop, coopMod, T, DT, IDS, HALF, BLOCK_H, HEAD, RUN, G, JUMP_V, FRICTION_G, FRICTION_A,
  STAGES, MOVES, WORLD_NAMES, col, row, makeWorld, puppet,
  floorAt, floorBelow, bodyBlocked, trackNear, trackCenterAfter, boxIndex, stackLayout,
} from './coop-bot.mjs';
const ink = await import(new URL('../src/draw/ink.js', import.meta.url).href);
const block = await import(new URL('../src/draw/block.js', import.meta.url).href);
const netjs = await import(new URL('../src/game/net.js', import.meta.url).href);
const tile = coopMod.tile, shirtColor = ink.shirtColor;

const LAG = Math.max(0, +(process.env.LAG ?? 2) | 0);
const OUTDIR = process.env.OUT || `${homedir()}/Downloads/몰겜-넷이서-동시`;
const ONLY = process.env.STAGE;
const W = 960, H = 560, STEP = 3;
const px = (tx) => (tx + 0.5) * T, pfy = (ty) => (ty + 1) * T;
const FR = { n: 0 };                                    // 지금 프레임 (왕복 발판 타이밍용)
const framesNow = () => FR.n;

// ── 4세상 시뮬 ───────────────────────────────────────────────────────────────
class Quad {
  constructor(stageName) {
    this.frames = 0; this.worlds = {};
    for (const k of IDS) { this.worlds[k] = makeWorld(stageName, { id: +k }); this.worlds[k].bump = false; }
    this.host = this.worlds['1'];
    for (const k of IDS) {
      const wk = this.worlds[k]; wk.mp.rtt = 2 * LAG * DT;
      for (const j of IDS) if (j !== k) { wk.mp.names.set(+j, `${j}번`); const q = this.worlds[j]; const o = puppet(wk, +j, q.player.x, q.groundY - q.player.air); o.rtt = 2 * LAG * DT; wk.mp.others.set(+j, o); }
      wk.send = (m, to) => this.route(wk, m, to);
    }
    this.queue = [];
    this.shell = { net: { send: () => {} }, log: () => {} }; this.api = { setSize: () => {}, restart: () => {} };
  }
  route(fw, msg, to) { const t = fw.mp.role === 'host' ? String(to) : '1'; if (this.worlds[t]) this.queue.push({ due: this.frames + LAG, to: t, from: fw.mp.myId, msg: JSON.parse(JSON.stringify(msg)) }); }
  packetOf(wk) { const p = wk.player, r1 = (v) => Math.round(v * 10) / 10, st = p.dead ? (wk.mp.waiting ? 2 : 1) : 0; return ['p', r1(p.x), r1(p.vx), r1(p.air), r1(p.vy), Math.round(p.crouch * 100) / 100, p.facing, st, p.grabbing, p.escapes, wk.dodged]; }
  step(inputs) {
    const blank = { left: false, right: false, jump: false, duck: false };
    for (const k of IDS) Object.assign(this.worlds[k].input, blank, inputs[k] ?? {});
    for (const k of IDS) w.update(this.worlds[k], DT);
    for (const k of ['2', '3', '4']) this.queue.push({ due: this.frames + LAG, to: '1', from: +k, msg: this.packetOf(this.worlds[k]) });
    const host = this.host, mp = host.mp, players = [[1, ...this.packetOf(host).slice(1)]];
    for (const o of mp.others.values()) players.push([o.id, o.baseX, o.vx, o.baseAir, o.vy, o.tcrouch, o.facing, o.state ?? 0, o.grabbing, o.escapes, o.dodged ?? 0, Math.round(o.age * 1000) / 1000]);
    const snap = JSON.stringify({ t: 's', ms: Math.round(host.elapsed * 1000), st: host.state, r: mp.round, pl: players, vw: Math.round(host.w), vh: Math.round(host.h), g: host.gameId, h: 1, x: coop.pack(host) });
    for (const k of ['2', '3', '4']) this.queue.push({ due: this.frames + LAG, to: k, from: 1, msg: snap });
    const rest = []; for (const it of this.queue) { if (it.due > this.frames) { rest.push(it); continue; } netjs.handleMessage(this.worlds[it.to], this.shell, it.from, typeof it.msg === 'string' ? JSON.parse(it.msg) : it.msg, this.api); }
    this.queue = rest; this.frames++; FR.n = this.frames;
  }
  W(id) { return this.worlds[id]; }
  at(k) { const q = this.worlds[k]; return { x: q.player.x, fy: q.groundY - q.player.air, air: q.player.air, dead: q.player.dead }; }
  anyDead() { return IDS.some((k) => this.worlds[k].player.dead); }
}

// ── 움직임 제너레이터 — 한 프레임 입력을 yield ────────────────────────────────
function gapWidth(world, x, dir, fy) { let n = 0; for (let k = 1; k <= 8; k++) { if (floorAt(world, x + dir * (HALF + 8 + (k - 0.5) * T), fy) !== null) break; n++; } return n; }
function* gwalk(world, targetX, opts = {}) {
  const p = world.player, b = world.bag, limit = opts.frames ?? Math.round(60 * (Math.abs(targetX - p.x) / RUN + 24));
  let lastX = p.x;
  for (let f = 0; f < limit; f++) {
    if (p.dead) return;
    if (Math.abs(p.x - lastX) > 3 * T) return; lastX = p.x;
    const fy = world.groundY - p.air, dx = targetX - p.x;
    if (Math.abs(dx) < 3 && p.grounded && Math.abs(p.vx) < 40) return;
    const belt = p.grounded && '<>'.includes(tile(b, col(p.x), Math.floor((fy + 2) / T)));
    if (belt && Math.abs(dx) < T * 0.5) return;
    const dir = Math.sign(dx); let hold = dir, jump = false;
    if (!p.grounded) { const stop = p.vx * p.vx / (2 * FRICTION_A); hold = Math.abs(dx) > stop + 3 ? dir : 0; }
    else {
      const stop = p.vx * p.vx / (2 * FRICTION_G); if (Math.abs(dx) <= stop + 2) hold = 0;
      if (hold) {
        const ax = p.x + dir * (HALF + 8);
        const ahead = floorAt(world, ax, fy, true) ?? floorBelow(world, ax, fy + 16, fy + 60, 5, { people: true });
        const tA = tile(b, col(ax), Math.floor((fy + 2) / T)), un = tile(b, col(p.x), Math.floor((fy + 2) / T));
        if (tA === '~' && un !== '~' && !((b.clock % 4) < 0.12)) hold = 0;
        if (hold && ahead === null) {
          const near = trackNear(world, ax, fy) || trackNear(world, targetX, fy);
          if (Math.abs(dx) <= HALF + 8) { if (floorAt(world, targetX, fy, true) === null && near) hold = 0; }
          else if (near) hold = 0;
          else { const gap = gapWidth(world, p.x, dir, fy); if (gap > 4) return; if (gap >= 3 && Math.abs(p.vx) < 250 && !opts.noRunup) { yield* gwalk(world, p.x - dir * 1.5 * T, { noRunup: true, frames: 120 }); continue; } jump = true; }
        }
        if (hold && !jump && Math.abs(dx) > HALF + 8 && bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1, BLOCK_H) && !bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1 - T, BLOCK_H)) jump = true;
      }
    }
    yield { left: hold < 0, right: hold > 0, jump };
  }
}
function* gjump(world, tX, tFy) {
  const p = world.player, b = world.bag, dy = (world.groundY - p.air) - tFy;
  if (dy > 0 && JUMP_V * JUMP_V - 2 * G * (dy + 6) < 0) return;
  const tr = dy > 0 ? trackNear(world, tX, tFy) : null;
  const up = dy > 0 ? (JUMP_V + Math.sqrt(Math.max(0, JUMP_V * JUMP_V - 2 * G * Math.max(0, dy - 12)))) / G : 0;
  let t0 = 0, phase = 'run', lastX = p.x;
  const aimX = () => tr ? trackCenterAfter(tr, Math.max(0, up - (framesNow() - t0) / 60)) : tX;
  for (let f = 0; f < 1500; f++) {
    if (p.dead) return;
    if (Math.abs(p.x - lastX) > 3 * T) return; lastX = p.x;
    const fy = world.groundY - p.air, dx = (phase === 'run' ? tX : aimX()) - p.x, dir = Math.sign(dx) || p.facing || 1;
    if (phase === 'run') {
      if (!p.grounded) { phase = 'air'; continue; }
      if (tr) { const reach = 24 + RUN * Math.max(0, up - 0.165); if (Math.abs(trackCenterAfter(tr, up) - p.x) - (1.5 * T - 15) > reach - 20) { yield {}; continue; } t0 = framesNow(); yield { left: dir < 0, right: dir > 0, jump: true }; phase = 'air'; continue; }
      let go = false;
      if (dy > 0) { const tl = (JUMP_V + Math.sqrt(Math.max(0, JUMP_V * JUMP_V - 2 * G * dy))) / G; go = Math.abs(dx) <= Math.max(RUN * tl * 0.92, HALF + 6); if (!go && bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1, BLOCK_H)) go = true; }
      else { const ax = p.x + dir * (HALF + 8), ah = floorAt(world, ax, fy, true); if (ah === null) { if (trackNear(world, ax, fy)) { yield {}; continue; } go = !(dy < 0 && Math.abs(dx) < 1.6 * T); } else if (bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1, BLOCK_H)) go = true; }
      if (dy <= 0 && Math.abs(dx) < 3 && Math.abs(p.vx) < 40 && Math.abs(fy - tFy) < 16) return;
      const stop = p.vx * p.vx / (2 * FRICTION_G), hold = (dy <= 0 && Math.abs(dx) <= stop + 2) ? 0 : dir;
      if (go) { yield { left: dir < 0, right: dir > 0, jump: true }; phase = 'air'; continue; }
      yield { left: hold < 0, right: hold > 0 };
    } else if (phase === 'air') {
      if (p.grounded) { phase = 'landed'; continue; }
      const stop = p.vx * p.vx / (2 * FRICTION_A); yield { left: dx < -stop - 3 ? true : false, right: dx > stop + 3 ? true : false };
    } else {
      const fyL = world.groundY - p.air;
      const onHead = [...world.mp.others.values()].some((o) => !o.dead && Math.abs(o.x - p.x) < 30 && Math.abs((o.groundY - o.air - HEAD) - fyL) < 4);
      const onBox = b.boxes.some((x) => Math.abs(x.x - p.x) < 36 && Math.abs((x.y - T) - fyL) < 4);
      const higher = fyL < tFy && tFy - fyL <= HEAD * 2 && (onHead || onBox) && Math.abs(dx) <= 1.6 * T;
      if (Math.abs(fyL - tFy) > 16 && !higher) return;
      if (tr || Math.abs(dx) <= 1.6 * T) { if (!tr && Math.abs(dx) > 3) yield* gwalk(world, tX, { frames: 240, noRunup: true }); return; }
      return;
    }
  }
}
function* gclimb(world, tFy) {
  const p = world.player; let wasUp = true;
  for (let f = 0; f < 900; f++) {
    if (p.dead) return; const fy = world.groundY - p.air;
    if (p.grounded && !p.onLadder && Math.abs(fy - tFy) < 16) return;
    if (p.grounded && !p.onLadder && fy < tFy && fy > tFy - 16 - HEAD * 3 && [...world.mp.others.values()].some((o) => !o.dead && Math.abs(o.x - p.x) < 30 && Math.abs((o.groundY - o.air - HEAD) - fy) < 4)) return;
    if (p.onLadder && f > 0 && ((wasUp && fy <= tFy + 2) || (!wasUp && fy >= tFy - 2))) return;
    const up = tFy < fy; if (f === 0) wasUp = up; yield { jump: up, duck: !up };
  }
}
function* ghop(world, tX) {
  const p = world.player, dir = Math.sign(tX - p.x);
  yield* gwalk(world, p.x - dir * 1.5 * T, { frames: 200, noRunup: true });
  for (let f = 0; f < 200 && Math.abs(tX - p.x) > RUN * 0.6; f++) yield { left: dir < 0, right: dir > 0 };
  yield { left: dir < 0, right: dir > 0, jump: true };
  for (let f = 0; f < 120 && !p.grounded && !p.dead; f++) { const stop = p.vx * p.vx / (2 * FRICTION_A), h = Math.abs(tX - p.x) > stop + 3 ? Math.sign(tX - p.x) : 0; yield { left: h < 0, right: h > 0 }; }
  yield* gwalk(world, tX, { frames: 240, noRunup: true });
}
function* gspring(world, tX, tY) {
  const p = world.player, tr = trackNear(world, px(tX), pfy(tY));
  const rise = (world.groundY - p.air) - pfy(tY), flight = (890 + Math.sqrt(Math.max(0, 890 * 890 - 2 * G * rise))) / G;
  const reach = 24 + RUN * Math.max(0, flight - 0.165); let t0 = 0;
  const aim = () => tr ? trackCenterAfter(tr, Math.max(0, flight - (framesNow() - t0) / 60)) : px(tX);
  if (tr) for (let f = 0; f < 1200 && Math.abs(trackCenterAfter(tr, flight) - p.x) - (1.5 * T - 15) > reach - 24; f++) yield {};
  t0 = framesNow(); yield { jump: true };
  for (let f = 0; f < 90 && !(p.vy > 600) && !p.dead; f++) yield {};
  for (let f = 0; f < 200 && !p.grounded && !p.dead; f++) { const stop = p.vx * p.vx / (2 * FRICTION_A), h = Math.abs(aim() - p.x) > stop + 3 ? Math.sign(aim() - p.x) : 0; yield { left: h < 0, right: h > 0 }; }
  if (!tr) yield* gwalk(world, px(tX), { frames: 240, noRunup: true });
}

// 한 사람 제너레이터 → {id: 입력} 로 태그
function* one(who, gen) { let r; while (!(r = gen.next()).done) yield { [who]: r.value || {} }; }

// ── 협동·즉시 마디 — {id: 입력} 를 프레임마다 yield ──────────────────────────
function* mPush(quad, stage, box, x1, whoList) {
  const idx = boxIndex(stage, box), b = quad.host.bag, bx = b.boxes[idx];
  const dir = Math.sign(px(x1) - bx.x), main = whoList[0];
  // 모으기 — 다들 상자 뒤로 걸어온다 (동시에)
  const gens = {}; whoList.forEach((m, i) => { gens[m] = gwalk(quad.W(m), bx.x - dir * (T / 2 + HALF + 4 + 34 * i), { frames: 400 }); });
  let gathering = true;
  while (gathering) { const ins = {}; gathering = false; for (const m of whoList) { const r = gens[m].next(); if (!r.done) { ins[m] = r.value || {}; gathering = true; } } yield ins; }
  // 밀기 — 다 같이 그쪽으로
  const y0 = bx.y; let lastBx = bx.x, still = 0;
  for (let f = 0; f < 60 * 40; f++) {
    const ins = {}; for (const m of whoList) ins[m] = { left: dir < 0, right: dir > 0 }; yield ins;
    if (Math.abs(bx.x - lastBx) > 3 * T) return; lastBx = bx.x;
    if (bx.y > y0 + 2) { if (bx.vy === 0 && ++still > 6) return; } else still = 0;
    if (bx.y <= y0 + 2 && Math.abs(bx.x - px(x1)) < 4) return;
    if ('<>'.includes(tile(b, col(bx.x), Math.floor((bx.y + 2) / T))) && Math.abs(bx.x - px(x1)) < 6 * T) return;
  }
}
function* mBoost(quad, stage, who, x1, y1, on) {
  const me0 = quad.at(who), dir = Math.sign(px(x1) - me0.x) || 1;
  const lay = stackLayout(quad.W(who), me0, dir, on.length);
  if (!lay) return;
  const gens = {}; on.forEach((o, j) => { gens[o] = gwalk(quad.W(o), lay.base + lay.lean * 14 * j, { frames: 400 }); });
  const meGen = gwalk(quad.W(who), lay.start, { frames: 400 });
  let gathering = true;
  while (gathering) { const ins = {}; gathering = false; for (const o of on) { const r = gens[o].next(); if (!r.done) { ins[o] = r.value || {}; gathering = true; } } const rm = meGen.next(); if (!rm.done) { ins[who] = rm.value || {}; gathering = true; } yield ins; }
  // who 가 머리를 밟고 올라가 뛴다
  for (let j = 0; j < on.length; j++) { const edge = j < on.length - 1 ? -lay.lean * 20 : 0; yield* one(who, gjump(quad.W(who), lay.base + lay.lean * 14 * j + edge, me0.fy - HEAD * (j + 1))); }
  yield* one(who, gjump(quad.W(who), px(x1), pfy(y1)));
}
function* mTake(quad, who, color) { const g = gwalk(quad.W(who), quad.W(who).player.x, { frames: 8 }); for (let f = 0; f < 60 && !quad.host.bag.opened.has(color); f++) yield {}; }
function* mSwitch(quad) { for (let f = 0; f < 30 && !quad.host.bag.latched; f++) yield {}; }
function* mNeedPlate(quad, tag) { for (let f = 0; f < 40 && !quad.host.bag.plates[tag]; f++) yield {}; }
function* mRide(quad, stage, box, x1) { const bx = quad.host.bag.boxes[boxIndex(stage, box)]; for (let f = 0; f < 900 && Math.abs(bx.x - px(x1)) >= 3; f++) yield {}; }
function* mPortalBox(quad, stage, box, tag) { const b = quad.host.bag, bx = b.boxes[boxIndex(stage, box)], to = b.portals[other(tag)]; for (let f = 0; f < 120 && col(bx.x) !== to.x; f++) yield {}; }
function* mPortal(quad, who, tag) { const b = quad.host.bag, to = b.portals[other(tag)]; for (let f = 0; f < 120 && !(col(quad.W(who).player.x) === to.x && quad.W(who).player.grounded); f++) yield* one(who, gwalk(quad.W(who), quad.W(who).player.x, { frames: 1 })); }
const other = (t) => (t === t.toLowerCase() ? t.toUpperCase() : t.toLowerCase());

function makeGen(quad, stage, move) {
  const [v, ...a] = move, who = a[0];
  switch (v) {
    case 'walk': return one(who, gwalk(quad.W(who), px(a[1])));
    case 'jump': return one(who, gjump(quad.W(who), px(a[1]), pfy(a[2])));
    case 'climb': return one(who, gclimb(quad.W(who), pfy(a[1])));
    case 'hop': return one(who, ghop(quad.W(who), px(a[1])));
    case 'spring': return one(who, gspring(quad.W(who), a[1], a[2]));
    case 'push': return mPush(quad, stage, a[0], a[1], a[2]);
    case 'boost': case 'stairs': return mBoost(quad, stage, a[0], a[1], a[2], a[3]);
    case 'take': return mTake(quad, a[0], a[1]);
    case 'switch': return mSwitch(quad);
    case 'need_plate': return mNeedPlate(quad, a[0]);
    case 'ride': return mRide(quad, stage, a[0], a[1]);
    case 'box_portal': return mPortalBox(quad, stage, a[0], a[1]);
    case 'portal': return mPortal(quad, a[0], a[1]);
    default: return (function* () {})();
  }
}
function actorsOf(m) {
  const [v, ...a] = m;
  if (v === 'boost' || v === 'stairs') return { actors: [a[0], ...a[3]], barrier: true };
  if (v === 'push') return { actors: a[2].slice(), barrier: true };
  if (v === 'take' || v === 'switch') return { actors: [a[0] ?? '1'], barrier: true };
  if (v === 'need_plate' || v === 'ride' || v === 'box_portal') return { actors: [], barrier: true };
  return { actors: [a[0]], barrier: false };
}

// ── 스케줄러 ────────────────────────────────────────────────────────────────
function playConcurrent(stage, moves, quad, onFrame) {
  const N = moves.length, meta = moves.map(actorsOf), done = new Array(N).fill(false);
  const running = new Map();          // i → {gen, actors}
  const busy = new Set();
  const incBarrierBefore = (i) => { for (let j = 0; j < i; j++) if (!done[j] && meta[j].barrier) return true; return false; };
  const anyBefore = (i) => { for (let j = 0; j < i; j++) if (!done[j]) return true; return false; };
  const sharerBusy = (i) => { for (let j = 0; j < i; j++) if (!done[j] && !running.has(j) && meta[j].actors.some((x) => meta[i].actors.includes(x))) return true; return false; };
  let guard = 0;
  while (done.some((d) => !d)) {
    if (++guard > 60 * 500) return { ok: false, err: `시간 초과 (남은 ${done.filter((d) => !d).length})` };
    for (let i = 0; i < N; i++) {
      if (done[i] || running.has(i)) continue;
      if (incBarrierBefore(i)) break;
      if (meta[i].barrier) { if (running.size === 0 && !anyBefore(i)) { running.set(i, { gen: makeGen(quad, stage, moves[i]), actors: meta[i].actors, budget: 60 * 60 }); meta[i].actors.forEach((p) => busy.add(p)); } break; }
      if (meta[i].actors.some((p) => busy.has(p))) continue;
      if (sharerBusy(i)) continue;
      running.set(i, { gen: makeGen(quad, stage, moves[i]), actors: meta[i].actors, budget: 60 * 30 }); meta[i].actors.forEach((p) => busy.add(p)); if (process.env.TRACE) console.log('start', i, moves[i].join(' '));
    }
    const inputs = {};
    for (const [i, task] of [...running]) {
      const r = (task.budget-- > 0) ? task.gen.next() : { done: true };
      if (r.done) { done[i] = true; task.actors.forEach((p) => busy.delete(p)); running.delete(i); if (process.env.TRACE) console.log('done ', i, moves[i].join(' '), '@', quad.frames); continue; }
      Object.assign(inputs, r.value || {});
    }
    quad.step(inputs);
    if (quad.anyDead()) return { ok: false, err: `누가 죽었다 (프레임 ${quad.frames})` };
    if (quad.frames % STEP === 0) onFrame();
  }
  // 출구 — 안에 있는 누가 ⌥↑
  for (let f = 0; f < 8; f++) { quad.step({}); if (quad.frames % STEP === 0) onFrame(); }
  const b = quad.host.bag, ex = coopMod.exitState(quad.host);
  if (!ex.ready) { const spots = IDS.map((k) => { const q = quad.at(k); return `${k}:(${col(q.x)},${row(q.fy)})${q.dead?'죽음':''}`; }).join(' '); return { ok: false, err: `출구 조건 안 참 (안에 ${ex.inside}/${ex.need}) 자리 ${spots} 출구(${b.exit.x},${b.exit.y})` }; }
  const cx = (b.exit.x + 0.5) * T, top = (b.exit.y + 1) * T;
  const inside = IDS.find((k) => { const q = quad.at(k); return Math.abs(q.x - cx) < T * 2.5 && q.fy <= top + T * 0.6 && q.fy > top - T * 1.5; });
  for (let f = 0; f < 16 && !(b.done > 0); f++) { quad.step({ [inside]: { jump: f < 4 } }); if (quad.frames % STEP === 0) onFrame(); }
  for (let f = 0; f < 30; f++) { quad.step({}); if (quad.frames % STEP === 0) onFrame(); }   // 판 넘어가는 어두워짐 보여 주기
  return { ok: b.done >= 0 };
}

// ── 렌더 (넷을 다 담는 카메라) ────────────────────────────────────────────────
const upright = (cx, cy, fn) => fn();
function renderFrame(ctx, quad) {
  const w0 = quad.host, b = w0.bag, time = quad.frames / 60;
  // 카메라 — 산 사람 넷을 다 담는 상자에 여백. 너무 확대/축소 안 되게 최소/최대.
  const alive = IDS.map((k) => quad.at(k)).filter((q) => !q.dead);
  const xs = alive.map((q) => q.x), ys = alive.map((q) => q.fy);
  let cx0 = Math.min(...xs) - 3 * T, cx1 = Math.max(...xs) + 3 * T, cy0 = Math.min(...ys) - 6 * T, cy1 = Math.max(...ys) + 2 * T;
  let vw = Math.max(16 * T, cx1 - cx0), vh = vw * H / W;
  if (vh < cy1 - cy0) { vh = cy1 - cy0; vw = vh * W / H; }
  vw = Math.min(vw, b.w * T); vh = Math.min(vh, b.h * T);
  let camx = (cx0 + cx1) / 2 - vw / 2, camy = (cy0 + cy1) / 2 - vh / 2;
  camx = Math.max(0, Math.min(b.w * T - vw, camx)); camy = Math.max(0, Math.min(b.h * T - vh, camy));
  // 카메라를 부드럽게
  const s = renderFrame; s.cam ??= { x: camx, y: camy, vw, vh };
  s.cam.x += (camx - s.cam.x) * 0.15; s.cam.y += (camy - s.cam.y) * 0.15; s.cam.vw += (vw - s.cam.vw) * 0.1; s.cam.vh += (vh - s.cam.vh) * 0.1;
  const cam = s.cam, k = W / cam.vw;
  b.cam = { x: cam.x, y: cam.y, w: cam.vw, h: cam.vh };
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f6f5f2'; ctx.fillRect(0, 0, W, H);
  const boil = ink.boil(time);
  ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
  coop.draw(ctx, w0, time, boil, upright);
  // 사람 넷 — 각자 자기 세상에서 자기 자리 (제일 정확). 방장 세상의 others 대신 각 세상의 player 를 그린다.
  for (const k2 of IDS) {
    const wk = quad.W(k2), p = wk.player;
    block.drawBlock(ctx, p, time, boil, { name: `${k2}번`, faded: p.dead, color: shirtColor(+k2), mark: ((+k2) % 4 + 4) % 4, crown: k2 === '1', mine: false });
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const hud = { ...w0, w: W, h: H };
  coop.hud?.(ctx, hud, time, (wx, wy) => [(wx - cam.x) * k, (wy - cam.y) * k]);
}

// ── 돌리기 ──
function renderStage(stage) {
  renderFrame.cam = null;
  const quad = new Quad(stage.name);
  const dir = `/private/tmp/cobot-${stage.name}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  let shot = 0;
  const onFrame = () => { renderFrame(ctx, quad); execWrite(canvas, `${dir}/f${String(shot++).padStart(5, '0')}.png`); };
  const r = playConcurrent(stage, MOVES.find((m) => m.name === stage.name).moves, quad, onFrame);
  return { ...r, dir, shot };
}
import { writeFileSync } from 'node:fs';
function execWrite(canvas, path) { writeFileSync(path, canvas.toBuffer('image/png')); }

mkdirSync(OUTDIR, { recursive: true });
const made = [];
for (const s of STAGES) {
  if (ONLY && s.name !== ONLY) continue;
  const idx = STAGES.indexOf(s), no = `${WORLD_NAMES.indexOf(s.world) + 1}-${STAGES.filter((t, i) => t.world === s.world && i <= idx).length}`;
  process.stdout.write(`${no} ${s.name} … `);
  let r; try { r = renderStage(s); } catch (e) { console.log(`✗ ${e.message}`); continue; }
  if (!r.ok) { console.log(`✗ ${r.err} (프레임 ${r.shot})`); rmSync(r.dir, { recursive: true, force: true }); continue; }
  const out = `${OUTDIR}/${no}-${s.name}.mp4`;
  execFileSync('ffmpeg', ['-y', '-framerate', '20', '-i', `${r.dir}/f%05d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', out], { stdio: 'ignore' });
  rmSync(r.dir, { recursive: true, force: true });
  console.log(`✓ ${r.shot}장`); made.push(out);
}
console.log(`\n${made.length}판 → ${OUTDIR}`);
