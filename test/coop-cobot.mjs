// 협동 — 다 같이 **동시에** 논다. 사람 수만큼의 세상(방장 1 + 손님들)을 프레임마다 모두의 입력으로 함께 굴리고,
// 화면 하나(전원을 다 담는 카메라)로 렌더한다. 걷기·점프·사다리는 서로 겹쳐 동시에, 어깨·손잡기·밀기
// 같은 협동 마디는 그 순간만 낀 사람끼리 — 그래서 "여러 명이 같이 노는" 것처럼 보이면서 규칙이 안 어긋난다.
//
//   node test/coop-cobot.mjs             # 넷이서 열네 판 → ~/Downloads/몰겜-넷이서-동시/ (+ 전체 하나)
//   GAME=trio node test/coop-cobot.mjs   # 셋이서 열두 판 → ~/Downloads/몰겜-셋이서-동시/
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
  w, coop, coopMod, T, DT, IDS, GUESTS, GAME, HALF, BLOCK_H, HEAD, RUN, G, JUMP_V, FRICTION_G, FRICTION_A,
  STAGES, MOVES, WORLD_NAMES, col, row, makeWorld, puppet,
  floorAt, floorBelow, bodyBlocked, trackNear, trackCenterAfter, boxIndex, stackLayout,
} from './coop-bot.mjs';
const ink = await import(new URL('../src/draw/ink.js', import.meta.url).href);
const block = await import(new URL('../src/draw/block.js', import.meta.url).href);
const netjs = await import(new URL('../src/game/net.js', import.meta.url).href);
const tile = coopMod.tile, shirtColor = ink.shirtColor;

const LAG = Math.max(0, +(process.env.LAG ?? 2) | 0);
const OUTDIR = process.env.OUT || `${homedir()}/Downloads/몰겜-${coop.name}-동시`;
const ONLY = process.env.STAGE;
const W = 960, H = 560, STEP = 3;
const NOVID = !!process.env.NOVID;                       // 진단용 — 그림을 안 그린다
const px = (tx) => (tx + 0.5) * T, pfy = (ty) => (ty + 1) * T;
const FR = { n: 0 };                                    // 지금 프레임 (왕복 발판 타이밍용)
const framesNow = () => FR.n;

// ── 4세상 시뮬 ───────────────────────────────────────────────────────────────
class Quad {
  constructor(stageName) {
    this.frames = 0; this.worlds = {};
    for (const k of IDS) { this.worlds[k] = makeWorld(stageName, { id: +k }); this.worlds[k].bump = !!process.env.BUMP; }   // BUMP=1: 사람 충돌을 켠 채 (실제 조건)
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
    if (process.env.TRACE2 && this.frames >= +process.env.TRACE2 && this.frames < +process.env.TRACE2 + 40) { const k = process.env.TRACE2_WHO || '2', q = this.worlds[k], p = q.player; console.log(`f${this.frames} ${k}: x=${(p.x / T).toFixed(2)} fy=${((q.groundY - p.air) / T).toFixed(2)} vx=${p.vx.toFixed(0)} g=${p.grounded ? 1 : 0} load=${p.load} dead=${p.dead ? 1 : 0} in=${JSON.stringify(inputs[k] ?? {})} knock=${(p.knock ?? 0).toFixed(0)} stun=${(p.stun ?? 0).toFixed(2)} ahead=${floorAt(q, p.x + 25, q.groundY - p.air, true)} track=${trackNear(q, p.x + 25, q.groundY - p.air) ? 'Y' : 'n'} tracks=${q.bag.tracks.length} boxes=${q.bag.boxes.map((x) => (x.x / T).toFixed(1)).join('/')}`); }
    for (const k of GUESTS) this.queue.push({ due: this.frames + LAG, to: '1', from: +k, msg: this.packetOf(this.worlds[k]) });
    const host = this.host, mp = host.mp, players = [[1, ...this.packetOf(host).slice(1)]];
    for (const o of mp.others.values()) players.push([o.id, o.baseX, o.vx, o.baseAir, o.vy, o.tcrouch, o.facing, o.state ?? 0, o.grabbing, o.escapes, o.dodged ?? 0, Math.round(o.age * 1000) / 1000]);
    const snap = JSON.stringify({ t: 's', ms: Math.round(host.elapsed * 1000), st: host.state, r: mp.round, pl: players, vw: Math.round(host.w), vh: Math.round(host.h), g: host.gameId, h: 1, x: coop.pack(host) });
    for (const k of GUESTS) this.queue.push({ due: this.frames + LAG, to: k, from: 1, msg: snap });
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
        // 왕복 발판 위에서는 「조금 낮은 데로 내려선다」를 안 한다 — 발판이 되돌아가는 중에 물가로 내려서려다 연못에 빠진다.
        // 발판에서 내리는 건 경로의 뛰기(jump) 걸음이 한다.
        const onTrack = !!trackNear(world, p.x, fy);
        const ahead = floorAt(world, ax, fy, true) ?? (onTrack ? null : floorBelow(world, ax, fy + 16, fy + 60, 5, { people: true }));
        const tA = tile(b, col(ax), Math.floor((fy + 2) / T)), un = tile(b, col(p.x), Math.floor((fy + 2) / T));
        if (tA === '~' && un !== '~' && !((b.clock % 4) < 0.12)) hold = 0;
        if (hold && ahead === null) {
          const near = trackNear(world, ax, fy) || trackNear(world, targetX, fy);
          if (Math.abs(dx) <= HALF + 8) { if (floorAt(world, targetX, fy, true) === null && near) hold = 0; }
          else if (near) hold = 0;
          else { const gap = gapWidth(world, p.x, dir, fy); if (gap > 4) return; if (gap >= 3 && Math.abs(p.vx) < 250 && !opts.noRunup) { yield* gwalk(world, p.x - dir * 1.5 * T, { noRunup: true, frames: 120 }); continue; } jump = true; }
        }
        if (hold && !jump && Math.abs(dx) > HALF + 8 && bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1, BLOCK_H) && !bodyBlocked(world, p.x + dir * (HALF + 3), fy - 1 - T, BLOCK_H)) jump = true;
        // 동료가 같은 높이에서 바로 앞을 막고 서 있으면(충돌 켠 세상) 뛰어넘는다 — 사람이 하는 대로. 머리에 내려도 그 다음 걸음이 내려선다.
        if (hold && !jump && world.bump !== false && Math.abs(dx) > 2 * HALF + 10) {
          const blocker = [...world.mp.others.values()].some((o) => !o.dead && !o.waiting && Math.abs((o.groundY - o.air) - fy) < 20 && Math.sign(o.x - p.x) === dir && Math.abs(o.x - p.x) < 2 * HALF + 12);
          if (blocker) jump = true;
        }
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
  const dir = Math.sign(px(x1) - bx.x);
  // 모으기 — 다들 상자 뒤로 걸어온다 (동시에). 첫째가 상자에 붙고 나머지는 그 뒤에 34px 씩.
  const gens = {}; whoList.forEach((m, i) => { gens[m] = gwalk(quad.W(m), bx.x - dir * (T / 2 + HALF + 4 + 34 * i), { frames: 400 }); });
  let gathering = true;
  while (gathering) { const ins = {}; gathering = false; for (const m of whoList) { const r = gens[m].next(); if (!r.done) { ins[m] = r.value || {}; gathering = true; } } yield ins; }
  // 밀기 — 다 같이 그쪽으로. 목표 칸 가운데에 닿거나 지나치면 멈춘다.
  const y0 = bx.y; let lastBx = bx.x, still = 0;
  for (let f = 0; f < 60 * 40; f++) {
    const ins = {}; for (const m of whoList) ins[m] = { left: dir < 0, right: dir > 0 }; yield ins;
    if (Math.abs(bx.x - lastBx) > 3 * T) break; lastBx = bx.x;                                 // 포탈을 지났다
    if (bx.y > y0 + 2) { if (bx.vy === 0 && ++still > 6) break; else continue; }              // 떨어지는 중 — 앉을 때까지
    if (dir * (bx.x - px(x1)) > -3) break;                                                    // 닿았다
    if ('<>'.includes(tile(b, col(bx.x), Math.floor((bx.y + 2) / T))) && Math.abs(bx.x - px(x1)) < 6 * T) break;   // 무빙워크에 올렸다 — 알아서 간다
  }
  for (let f = 0; f < 12; f++) yield {};                                                      // 손을 뗀다
}
function* gchain(world, lay, me, present, upto, finalOffset) {
  // 머리 0..upto 를 차례로 딛고 올라간다. 다음다음 사람(j+2)이 있으면 그 발에 머리를 찧지 않게 뒤쪽 가장자리에.
  for (let j = 0; j <= upto; j++) {
    const edge = (j + 2 < present) ? -lay.lean * 20 : (j === upto ? finalOffset : 0);
    yield* gjump(world, lay.base + lay.lean * 14 * j + edge, me.fy - HEAD * (j + 1));
  }
}
function* mBoost(quad, stage, who, x1, y1, on) {
  const me0 = quad.at(who), dir = Math.sign(px(x1) - me0.x) || 1;
  const lay = stackLayout(quad.W(who), me0, dir, on.length);
  if (!lay) return;
  // 뛰는 사람이 먼저 스택 뒤로 비켜 선다
  if (!lay.tower) yield* one(who, gwalk(quad.W(who), lay.start, { frames: 400 }));
  // 밑 사람이 자리에 서고, 그 위 사람들은 뒤에서 걸어와 머리를 딛고 올라서서 14px 씩 기울여 선다
  yield* one(on[0], gwalk(quad.W(on[0]), lay.base, { frames: 400 }));
  for (let k = 1; k < on.length; k++) {
    yield* one(on[k], gwalk(quad.W(on[k]), lay.start, { frames: 400 }));
    yield* one(on[k], gchain(quad.W(on[k]), lay, me0, k, k - 1, lay.lean * 14));
  }
  for (let f = 0; f < 6; f++) yield {};
  // 뛰는 사람이 머리를 차례로 딛고 올라가 목표로 뛴다
  yield* one(who, gchain(quad.W(who), lay, me0, on.length, on.length - 1, 0));
  yield* one(who, gjump(quad.W(who), px(x1), pfy(y1)));
}
function* mTake(quad, who, color) { const g = gwalk(quad.W(who), quad.W(who).player.x, { frames: 8 }); for (let f = 0; f < 60 && !quad.host.bag.opened.has(color); f++) yield {}; }
function* mSwitch(quad) { for (let f = 0; f < 30 && !quad.host.bag.latched; f++) yield {}; }
function* mNeedPlate(quad, tag) { for (let f = 0; f < 40 && !quad.host.bag.plates[tag]; f++) yield {}; }
function* mRide(quad, stage, box, x1) { const bx = quad.host.bag.boxes[boxIndex(stage, box)]; for (let f = 0; f < 900 && Math.abs(bx.x - px(x1)) >= 3; f++) yield {}; }
function* mPortalBox(quad, stage, box, tag) { const b = quad.host.bag, bx = b.boxes[boxIndex(stage, box)], to = b.portals[other(tag)]; for (let f = 0; f < 120 && col(bx.x) !== to.x; f++) yield {}; }
// 포탈을 지나 저편에 내려설 때까지 **프레임을 흘려보내며** 기다린다 (제자리 걷기는 한 프레임도 안 흘려 바로 끝났다 — 그래서 다음 걸음 도중에 옮겨졌다)
function* mPortal(quad, who, tag) { const b = quad.host.bag, to = b.portals[other(tag)]; for (let f = 0; f < 240 && !(col(quad.W(who).player.x) === to.x && quad.W(who).player.grounded); f++) yield {}; for (let f = 0; f < 4; f++) yield {}; }
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
  // 열쇠·스위치·누름판은 **닿는 순간** 발동한다 — 그래서 take/switch/need_plate 바로 앞의 걷기가 진짜 방아쇠다.
  // 그 걷기도 협동 마디로 친다 (앞 걸음이 다 끝난 뒤에, 그 순간엔 그 사람만). 안 그러면 남이 아직 노란 바닥 위에 있는데 열쇠를 집는다.
  for (let i = 0; i < N; i++) {
    if (moves[i][0] !== 'walk') continue;
    const who = moves[i][1];
    let j = i + 1; while (j < N && moves[j][0] !== 'need_plate' && !meta[j].actors.includes(who)) j++;
    if (j < N && ['take', 'switch', 'need_plate'].includes(moves[j][0])) meta[i] = { ...meta[i], barrier: true };
  }
  const running = new Map();          // i → {gen, actors}
  const busy = new Set();
  const incBarrierBefore = (i) => { for (let j = 0; j < i; j++) if (!done[j] && meta[j].barrier) return true; return false; };
  const anyBefore = (i) => { for (let j = 0; j < i; j++) if (!done[j]) return true; return false; };
  const sharerBusy = (i) => { for (let j = 0; j < i; j++) if (!done[j] && !running.has(j) && meta[j].actors.some((x) => meta[i].actors.includes(x))) return true; return false; };
  // 같은 칸에 내리는 뛰기는 한 번에 하나 — 둘이 같은 발판을 노리면 뒤 사람이 앞 사람 머리에 내린다.
  const landingOf = (m) => (m[0] === 'jump' || m[0] === 'spring') ? `${m[2]},${m[3]}` : m[0] === 'hop' ? `h${m[2]}` : null;
  const landingTaken = (i) => { const key = landingOf(moves[i]); return !!key && [...running.values()].some((t) => t.key === key); };
  // 내릴 자리에 남이 서 있으면 비킬 때까지 기다린다 (내려선 사람은 바로 비켜 서는 걸음이 뒤에 있다)
  const waited = new Array(N).fill(0);
  const landingOccupied = (i) => {
    const m = moves[i]; if (m[0] !== 'jump') return false;
    if (waited[i] > 180) return false;                                              // 3초 기다렸으면 그냥 간다 (머리에 내려도 된다) — 교착 방지
    const tx = px(m[2]), tfy = pfy(m[3]);
    const occ = IDS.some((k) => k !== m[1] && (() => { const q = quad.at(k); return Math.abs(q.x - tx) < 0.7 * T && Math.abs(q.fy - tfy) < 20; })());
    if (occ) waited[i]++;
    return occ;
  };
  let guard = 0;
  while (done.some((d) => !d)) {
    if (++guard > 60 * 500) { const left = moves.map((m, i) => done[i] ? null : `${i}:${m.join(' ')}${running.has(i) ? '*' : ''}`).filter(Boolean).slice(0, 6).join(' | '); const spots = IDS.map((k) => { const q = quad.at(k); return `${k}:(${col(q.x)},${row(q.fy)})`; }).join(' '); return { ok: false, err: `시간 초과 (남은 ${done.filter((d) => !d).length}) ${left} · 자리 ${spots}` }; }
    for (let i = 0; i < N; i++) {
      if (done[i] || running.has(i)) continue;
      if (incBarrierBefore(i)) break;
      if (meta[i].barrier) { if (running.size === 0 && !anyBefore(i)) { running.set(i, { gen: makeGen(quad, stage, moves[i]), actors: meta[i].actors, budget: 60 * 60 }); meta[i].actors.forEach((p) => busy.add(p)); } break; }
      if (meta[i].actors.some((p) => busy.has(p))) continue;
      if (sharerBusy(i) || landingTaken(i) || landingOccupied(i)) continue;
      running.set(i, { gen: makeGen(quad, stage, moves[i]), actors: meta[i].actors, budget: 60 * 30, key: landingOf(moves[i]) }); meta[i].actors.forEach((p) => busy.add(p)); if (process.env.TRACE) console.log('start', i, moves[i].join(' '));
    }
    const inputs = {};
    for (const [i, task] of [...running]) {
      const r = (task.budget-- > 0) ? task.gen.next() : { done: true };
      if (r.done) { done[i] = true; task.actors.forEach((p) => busy.delete(p)); running.delete(i); if (process.env.TRACE) console.log('done ', i, moves[i].join(' '), '@', quad.frames); continue; }
      if (process.env.TRACE3 && quad.frames >= +process.env.TRACE3 && quad.frames < +process.env.TRACE3 + 3) console.log(`  f${quad.frames} task ${i} ${moves[i].join(' ')} → ${JSON.stringify(r.value)}`);
      if (process.env.TRACE_TASK && i === +process.env.TRACE_TASK && ((task.n = (task.n ?? 0) + 1) % 40 === 1)) { const who = moves[i][1], q = quad.W(who), pp = q.player; console.log(`  f${quad.frames} task ${i} ${moves[i].join(' ')} → ${JSON.stringify(r.value)} | ${who}: x=${(pp.x / T).toFixed(2)} fy=${((q.groundY - pp.air) / T).toFixed(2)} g=${pp.grounded ? 1 : 0} vx=${pp.vx.toFixed(0)} push=${pp.pushing ? 1 : 0} box=${q.bag.boxes.map((x) => (x.x / T).toFixed(2)).join('/')} others=${[...q.mp.others.values()].map((o) => `${o.id}@${(o.x / T).toFixed(1)}`).join(',')}`); }
      Object.assign(inputs, r.value || {});
    }
    quad.step(inputs);
    if (quad.anyDead()) { const who = IDS.filter((k) => quad.at(k).dead); const spots = IDS.map((k) => { const q = quad.at(k); return `${k}:(${col(q.x)},${row(q.fy)})${q.dead ? '†' : ''}`; }).join(' '); const run = [...running.keys()].map((i) => moves[i].join(' ')).join(' | '); return { ok: false, err: `${who.join('·')}번이 죽었다 (프레임 ${quad.frames}) 자리 ${spots} · 하던 것 ${run}` }; }
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
  const time = quad.frames / 60, boil = ink.boil(time);
  const PW = W / 2, PH = H / 2;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#e9e6df'; ctx.fillRect(0, 0, W, H);
  IDS.forEach((k, i) => {
    const wk = quad.W(k), px0 = (i % 2) * PW, py0 = Math.floor(i / 2) * PH;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.beginPath(); ctx.rect(px0, py0, PW, PH); ctx.clip();
    ctx.fillStyle = '#f6f5f2'; ctx.fillRect(px0, py0, PW, PH);
    const cam = coop.camera(wk, PW, PH) ?? { x: 0, y: 0 };
    ctx.setTransform(1, 0, 0, 1, px0 - cam.x, py0 - cam.y);
    coop.draw(ctx, wk, time, boil, upright);
    const hostId = 1;
    for (const o of wk.mp.others.values()) {
      block.drawBlock(ctx, o, time, boil, { name: o.name, faded: o.dead, color: shirtColor(o.id), mark: ((o.id % 4) + 4) % 4, crown: o.id === hostId });
    }
    block.drawBlock(ctx, wk.player, time, boil, { name: `${k}번`, mine: true, faded: wk.player.dead, color: shirtColor(+k), mark: ((+k) % 4 + 4) % 4, crown: +k === hostId });
    ctx.setTransform(1, 0, 0, 1, px0, py0);
    coop.hud?.(ctx, { ...wk, w: PW, h: PH }, time, (wx, wy) => [wx - cam.x, wy - cam.y]);
    // 누구 화면인지 — 오른쪽 아래 이름표
    const tag = `${k}번${+k === hostId ? ' · 방장' : ''} 화면`;
    ctx.font = '700 12px "Apple SD Gothic Neo", sans-serif'; const tw = ctx.measureText(tag).width;
    ctx.fillStyle = shirtColor(+k); ctx.globalAlpha = 0.92; ctx.fillRect(PW - tw - 18, PH - 24, tw + 12, 18); ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(tag, PW - tw - 12, PH - 15);
    ctx.restore();
  });
  // 칸막이
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.strokeStyle = '#141210'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(PW, 0); ctx.lineTo(PW, H); ctx.moveTo(0, PH); ctx.lineTo(W, PH); ctx.stroke();
}

// ── 돌리기 ──
function renderStage(stage) {
  renderFrame.cam = null;
  const quad = new Quad(stage.name);
  const dir = `/private/tmp/cobot-${GAME}-${stage.name}`; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
  let shot = 0;
  const onFrame = () => { if (NOVID) return; renderFrame(ctx, quad); execWrite(canvas, `${dir}/f${String(shot++).padStart(5, '0')}.png`); };
  const r = playConcurrent(stage, MOVES.find((m) => m.name === stage.name).moves, quad, onFrame);
  return { ...r, dir, shot };
}
import { writeFileSync } from 'node:fs';
function execWrite(canvas, path) { writeFileSync(path, canvas.toBuffer('image/png')); }

mkdirSync(OUTDIR, { recursive: true });
const made = [], failed = [];
for (const st of STAGES) {
  if (ONLY && st.name !== ONLY) continue;
  const idx = STAGES.indexOf(st), no = `${WORLD_NAMES.indexOf(st.world) + 1}-${STAGES.filter((t, i) => t.world === st.world && i <= idx).length}`;
  process.stdout.write(`${no} ${st.name} … `);
  let r; try { r = renderStage(st); } catch (e) { console.log(`✗ ${e.message}`); failed.push(`${no} ${st.name}: ${e.message}`); continue; }
  if (!r.ok) { console.log(`✗ ${r.err} (프레임 ${r.shot})`); failed.push(`${no} ${st.name}: ${r.err}`); rmSync(r.dir, { recursive: true, force: true }); continue; }
  const out = `${OUTDIR}/${no}-${st.name}.mp4`;
  if (NOVID) { rmSync(r.dir, { recursive: true, force: true }); console.log(`✓ (그림 없이) ${(quadFrames(r) / 60).toFixed(0)}초`); continue; }
  execFileSync('ffmpeg', ['-y', '-framerate', '20', '-i', `${r.dir}/f%05d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', out], { stdio: 'ignore' });
  rmSync(r.dir, { recursive: true, force: true });
  console.log(`✓ ${r.shot}장 · ${(quadFrames(r) / 60).toFixed(0)}초`); made.push(out);
}
if (!ONLY && made.length) {
  const list = `${OUTDIR}/.concat.txt`;
  writeFileSync(list, made.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n');
  const all = `${homedir()}/Downloads/몰겜-${coop.name}-동시-전체.mp4`;
  execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', all], { stdio: 'ignore' });
  rmSync(list, { force: true });
  console.log(`전체 → ${all}`);
}
console.log(`\n${made.length}판 → ${OUTDIR}${failed.length ? `\n실패 ${failed.length}: ` + failed.join(' | ') : ''}`);
function quadFrames(r) { return r.frames ?? r.shot * STEP; }
