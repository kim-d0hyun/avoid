// 넷이서 — 협동.
//
// 넷이 열쇠를 찾아 출구 포탈에 모이면 다음 판. 판마다 「한 명만 닿으면」/「넷이 다 모여야」가 다르다.
// 혼자서는 못 하게 만든 판 열둘 — 세 칸 턱(어깨 → 손), 한 칸 굴(웅크리기), 무거운 상자(둘이 민다),
// 누름판(밟는 동안만), 색 열쇠(집으면 그 색 블록이 사라진다 — 발밑까지), 포탈, 깜빡이는 다리.
//
// 이 파일은 **타일 위의 물리와 규칙**만 갖는다. 사람의 자리·이름·방·순위는 world.js 와 net.js 것이고,
// 판의 글자 그림은 coop-stages.js(docs/넷이서/stages.py 가 만든다)에 있다.
//
// 누가 무엇을 정하나 — 배구의 공과 같다. **방장이 정한다**: 상자·통·누름판·셔터·열쇠·판 번호·되감기.
// 내 걷기·점프·사다리·카메라는 각자 계산한다. 어긋나면 방장 말이 맞고 되돌아간다.

import { INK, RED, PENCIL, PAPER_SOLID, stroke, circle, text, paperScrap } from '../draw/ink.js';
import { drawBlock, blockSize, BLOCK_W, BLOCK_H, CROUCH_H } from '../draw/block.js';
import { STAGES, WORLDS } from './coop-stages.js';
import { say } from '../game/world.js';

export const T = 42;                       // 한 칸
const HALF = BLOCK_W / 2;                  // 몸 반 폭 17
const RUN = 290;                           // 초당 7칸. 네 칸 구멍을 뛰어 넘으려면 이만큼은 달려야 한다
const ACCEL = 2200, FRICTION = 2600, AIR_CONTROL = 0.8;
const G = 1700;
const JUMP_V = 568;                        // 꼭대기 95px = 2.3칸. 두 칸 턱은 넘고 세 칸은 못 넘는다. 공중 0.67초 × 290 = 4.6칸
const CLIMB = 190;                         // 사다리 초당 4.5칸
const PUSH = 92;                           // 상자는 초당 2.2칸
const CONVEYOR = 250;                      // 무빙워크 초당 6칸 — 걷는 것보다 조금 빠르다
const SPRING_V = 890;                      // 다섯 칸
const BLINK_ON = 2, BLINK_OFF = 2;         // 깜빡이는 발판. 켜진 2초 안에 여덟 칸을 건널 수 있다
const TRACK_SPEED = 126;                   // 왕복 발판 초당 3칸
const TRACK_W = 3 * T;
const BARREL_SPEED = 210, BARREL_EVERY = 4, BARREL_R = 19;
const KNOCK = 380, STUN = 0.5;             // 통에 맞으면 세 칸 밀려나고 0.5초 넘어진다
const PULL_REACH = 3 * T + 8;              // 손잡기: 세 칸 아래까지
const PORTAL_COOL = 0.3;
const ROT_AFTER = 0.5, ROT_GONE = 3;         // 삭은 발판: 0.5초 밟으면 부서지고 3초 뒤 돌아온다 — 한 명씩 건넌다
const DIE_FOR = 0.8;                       // 죽고 나서 시작 자리에 다시 서기까지
const NEXT_FADE = 0.6;                     // 판 사이 어두워지는 시간
const SHIRTS = ['#2f6fb0', '#3f8f56', '#d97b1f', '#8a5bb5'];
const KEY_COLOR = { r: '#d02f22', y: '#c9a200', b: '#2f6fb0' };
const BLOCK_COLOR = { R: '#d02f22', Y: '#c9a200', B: '#2f6fb0' };
const THEME = {
  '뒷마당': { ground: '#c9a86a', edge: '#3f8f56', hatch: '#8a6a3a', barrel: '통' },
  '학교':   { ground: '#b8912a', edge: null,      hatch: '#7a6020', barrel: '가방' },
  '도시':   { ground: '#6b665c', edge: null,      hatch: '#4a463f', barrel: '파이프' },
  '지하철': { ground: '#55606c', edge: '#2f9c9c', hatch: '#39434d', barrel: '카트' },
};

// ── 판 살림살이 ──────────────────────────────────────────────────────────────

function loadStage(world, index) {
  const b = world.bag;
  const s = STAGES[Math.max(0, Math.min(STAGES.length - 1, index))];
  b.stage = index;
  b.def = s;
  b.w = s.w; b.h = s.h;
  b.rows = s.art.map((r) => r.split(''));
  b.end = s.end;
  b.limit = s.limit || 0;
  b.clock = 0;
  b.opened = new Set();
  b.latched = false;
  b.plates = { p: false, q: false };
  b.boxes = []; b.barrels = []; b.chutes = []; b.tracks = []; b.keys = {}; b.portals = {};
  b.rot = new Map();                       // 삭은 발판 — 'tx,ty' → { t: 밟은 시간, gone: 부서져 있는 남은 시간 }
  b.spawn = [null, null, null, null];
  b.exit = null;
  b.done = 0;                              // 다음 판으로 넘어가는 중이면 남은 시간
  b.portalCool = 0;
  b.cam = null;
  for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) {
    const ch = b.rows[y][x];
    if (ch >= '1' && ch <= '4') { b.spawn[+ch - 1] = { x, y }; b.rows[y][x] = '.'; }
    else if (ch === 'x' || ch === 'X') { b.boxes.push({ x: (x + 0.5) * T, y: (y + 1) * T, vx: 0, vy: 0, weight: ch === 'X' ? 2 : 1, on: false }); b.rows[y][x] = '.'; }
    else if (ch === 'r' || ch === 'y' || ch === 'b') { b.keys[ch] = { x, y, taken: false }; }
    else if (ch === '{' || ch === '}') { b.chutes.push({ x, y, dir: ch === '{' ? -1 : 1, t: 1.5 }); }
    else if (ch === 'O') { b.exit = { x, y }; }
    else if ('uUwW'.includes(ch)) { b.portals[ch] = { x, y }; }
    else if (ch === '-') {
      // 왕복 발판의 길. 한 줄로 이어진 '-' 가 길 하나다.
      const last = b.tracks[b.tracks.length - 1];
      if (last && last.y === y && last.x1 === x - 1) last.x1 = x;
      else b.tracks.push({ x0: x, x1: x, y });
    }
  }
  for (const tr of b.tracks) { tr.len = (tr.x1 - tr.x0 + 1) * T - TRACK_W; tr.pos = 0; }
  world.w = s.w * T; world.h = s.h * T; world.groundY = s.h * T;
  b.deaths = b.deaths ?? 0;
  b.resets = b.resets ?? 0;
}

/// 시작 자리에 세운다. slot 은 번호 순서 (방장 0).
function placeAt(world, p, slot) {
  const b = world.bag;
  const sp = b.spawn[Math.max(0, Math.min(3, slot))] ?? b.spawn.find(Boolean) ?? { x: 2, y: b.h - 3 };
  p.x = (sp.x + 0.5) * T;
  p.air = world.groundY - (sp.y + 1) * T;
  p.vx = 0; p.vy = 0; p.knock = 0; p.crouch = 0; p.onLadder = false; p.stun = 0;
  p.groundY = world.groundY;
}

function mySlot(world) {
  const mp = world.mp;
  if (!mp.on) return 0;
  const ids = [mp.myId, ...mp.others.keys()].sort((a, c) => a - c);
  return Math.max(0, ids.indexOf(mp.myId));
}

// ── 타일 묻기 ───────────────────────────────────────────────────────────────

function tile(b, tx, ty) {
  if (ty < 0 || ty >= b.h || tx < 0 || tx >= b.w) return '#';
  return b.rows[ty][tx];
}
function blinkOn(b) { return (b.clock % (BLINK_ON + BLINK_OFF)) < BLINK_ON; }
function blinkWarn(b) { const m = b.clock % (BLINK_ON + BLINK_OFF); return m > BLINK_ON - 0.5 && m < BLINK_ON; }
/// 몸이 뚫고 지나갈 수 없는 칸인가.
function solidTile(b, ch) {
  if (ch === '#') return true;
  if (ch === 'R' || ch === 'Y' || ch === 'B') return !b.opened.has(ch.toLowerCase());
  if (ch === 'A') return !b.latched;
  if (ch === 'P') return !b.plates.p;
  if (ch === 'Q') return !b.plates.q;
  return false;
}
/// 위에서만 딛는 칸인가 (밑에서는 통과).
function onewayTile(b, ch, tx, ty) {
  if (ch === '=' || ch === '>' || ch === '<' || ch === 'S') return true;
  if (ch === 'v') return !rotGone(b, tx, ty);
  if (ch === '~') return blinkOn(b);
  return false;
}
/// 삭은 발판이 지금 부서져 있나.
function rotGone(b, tx, ty) { return (b.rot?.get(tx + ',' + ty)?.gone ?? 0) > 0; }
/// 왕복 발판의 지금 자리. [x0px, x1px, ypx(윗면)]
function trackRect(tr) {
  const x0 = tr.x0 * T + tr.pos;
  return { x0, x1: x0 + TRACK_W, top: tr.y * T + T * 0.3, bottom: tr.y * T + T * 0.7 };
}

// ── 사람 물리 (내 것만) ───────────────────────────────────────────────────────

/// 발판 높이를 찾는다. x 자리에서 발이 fy 로 내려올 때 딛는 윗면 y (없으면 null).
/// 타일 · 상자 · 왕복 발판 · **남의 머리** 순으로 본다.
/// opt.ladders=false 면 사다리 꼭대기를 바닥으로 안 친다 (사다리를 타고 내려갈 때).
/// opt.people=false 면 남의 머리를 안 본다 (남의 자리를 바닥에 맞출 때 — 자기 머리를 밟으면 안 된다).
function floorBelow(world, x, fyOld, fyNew, halfW = HALF - 2, opt = {}) {
  const b = world.bag;
  let best = null;
  const take = (top) => { if (top >= fyOld - 1 && top <= fyNew + 1 && (best === null || top < best)) best = top; };
  const tx0 = Math.floor((x - halfW) / T), tx1 = Math.floor((x + halfW) / T);
  const ty0 = Math.max(0, Math.floor(fyOld / T) - 1), ty1 = Math.min(b.h - 1, Math.floor(fyNew / T) + 1);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const ch = tile(b, tx, ty);
    if (solidTile(b, ch)) take(ty * T);
    else if (onewayTile(b, ch, tx, ty)) take(ty * T + (ch === '=' || ch === 'v' ? T * 0.3 : 0));
    // 사다리 꼭대기는 딛는 바닥이다 (위 칸이 사다리가 아닐 때). 중간 칸은 매달리는 곳.
    else if (opt.ladders !== false && (ch === 'H' || ch === '|') && !'H|'.includes(tile(b, tx, ty - 1))) take(ty * T);
  }
  for (const bx of b.boxes) {
    if (Math.abs(bx.x - x) < HALF + T / 2 - 2) take(bx.y - T);
  }
  for (const tr of b.tracks) {
    const r = trackRect(tr);
    if (x + halfW > r.x0 && x - halfW < r.x1) take(r.top);
  }
  if (opt.people === false) return best;
  // 남의 머리. 웅크린 사람은 낮다 — 그래서 계단이 된다.
  for (const o of world.mp.others.values()) {
    if (o.dead || o.waiting) continue;
    if (Math.abs(o.x - x) >= HALF + BLOCK_W / 2 - 4) continue;
    const oh = blockSize(o).h;
    const top = o.groundY - o.air - oh - 3;
    if (top < fyOld - 4) continue;                   // 내 발보다 위에 있는 머리는 바닥이 아니다
    take(top);
  }
  return best;
}

/// 내 머리 위에 선 사람 수. 발이 내 머리에 닿아 있고 가로로 겹치는 사람.
function ridersOn(world, x, fy, h) {
  let n = 0;
  const top = fy - h - 3;
  for (const o of world.mp.others.values()) {
    if (o.dead || o.waiting) continue;
    if (Math.abs(o.x - x) < BLOCK_W - 4 && Math.abs((o.groundY - o.air) - top) < 6) n++;
  }
  return n;
}

/// 내가 밟고 선 사람. 머리 꼭대기가 내 발과 맞고 가로로 겹치는 사람.
function carrierUnder(world, x, fy) {
  for (const o of world.mp.others.values()) {
    if (o.dead || o.waiting) continue;
    if (Math.abs(o.x - x) >= HALF + BLOCK_W / 2 - 4) continue;
    const top = o.groundY - o.air - blockSize(o).h - 3;
    if (Math.abs(top - fy) < 4) return o;
  }
  return null;
}

/// 위로 오르다 남의 몸에 머리를 찧나 — 내 머리 윗선이 남의 발을 지나 몸 안으로 들어가면.
/// 사람은 서로 뚫고 지나가는 물건이 아니다. 밑에서 뛰어 위 사람을 통과해 그 머리에 올라서면
/// 「버그」로 읽힌다.
function headBonk(world, x, fyOld, fyNew, h) {
  for (const o of world.mp.others.values()) {
    if (o.dead || o.waiting) continue;
    if (Math.abs(o.x - x) >= HALF + BLOCK_W / 2 - 6) continue;
    const feet = o.groundY - o.air;
    if (fyNew - h < feet && fyOld - h >= feet - 6) return true;
  }
  return false;
}

function bodyBlocked(world, x, fy, h) {
  const b = world.bag;
  const tx0 = Math.floor((x - HALF + 2) / T), tx1 = Math.floor((x + HALF - 2) / T);
  const ty0 = Math.floor((fy - h + 2) / T), ty1 = Math.floor((fy - 2) / T);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (solidTile(b, tile(b, tx, ty))) return true;
  }
  for (const bx of b.boxes) {
    if (Math.abs(bx.x - x) < HALF + T / 2 - 2 && fy - h < bx.y && fy > bx.y - T) return true;
  }
  return false;
}

function onLadderColumn(b, x, fy, h) {
  const tx = Math.floor(x / T);
  for (let ty = Math.floor((fy - h * 0.5) / T); ty <= Math.floor((fy - 1) / T); ty++) {
    const ch = tile(b, tx, ty);
    if (ch === 'H' || ch === '|') return true;
  }
  return false;
}

function inSpikes(b, x, fy, h) {
  const tx0 = Math.floor((x - HALF + 4) / T), tx1 = Math.floor((x + HALF - 4) / T);
  const ty0 = Math.floor((fy - h + 6) / T), ty1 = Math.floor((fy - 4) / T);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    if (tile(b, tx, ty) === '^') return true;
  }
  return false;
}

function die(world) {
  const p = world.player;
  if (p.dead) return;
  p.dead = true; p.deadFor = 0; p.vx = 0; p.knock = 0;
  world.shake = 0.6;
  world.bag.deaths++;
  if (world.debug) world.log?.(`죽음 f${String(world.shot ?? 0).padStart(5, '0')} x=${Math.round(p.x)} air=${Math.round(p.air)}`);
}

/// 남의 발을 바닥 위에 세운다.
///
/// 남의 자리는 마지막 꾸러미에서 속도로 이어 그린다 (net.js interpolate). 그 계산은 땅을 모른다 —
/// 뛰어내리는 사람은 다음 꾸러미가 오기까지 발판을 **뚫고 내려가** 보인다. 랜에서도 왕복 시간만큼은
/// 앞서 그리니 착지 순간마다 발이 땅에 몇 픽셀씩 박힌다. 여기서 내려가던 발이 바닥을 지나면 바닥에 세운다.
/// 올라가는 중은 건드리지 않는다 — 선반 밑에서 뛰어 오르는 사람은 정말로 선반을 지나는 중이다.
function settleOthers(world) {
  for (const o of world.mp.others.values()) {
    const fy = o.groundY - o.air;
    const prev = o.fyPrev;
    o.fyPrev = fy;
    if (o.dead || o.waiting || prev === undefined || fy <= prev + 0.01) continue;
    // 사다리 꼭대기는 여기서 바닥이 아니다 — 그걸 바닥으로 치면 사다리를 내려오는 동료가 꼭대기에 붙어 안 내려온다.
    const floor = floorBelow(world, o.x, prev, fy, HALF - 2, { people: false, ladders: false });
    if (floor !== null && floor < fy) { o.air = o.groundY - floor; o.vyDraw = 0; o.fyPrev = floor; }
  }
}

/// 내 사람을 한 프레임 굴린다. world.js 의 movePlayer 대신 이걸 쓴다 — 여기는 땅이 평평하지 않다.
export function move(world, dt) {
  const b = world.bag;
  const p = world.player;
  const input = world.input;
  if (!b?.rows) return;
  p.groundY = world.groundY;
  if (world.mp.on) settleOthers(world);

  // 죽어 있으면 잠깐 누워 있다가 시작 자리에서 다시 선다.
  if (p.dead) {
    p.deadFor += dt;
    if (p.deadFor >= DIE_FOR) { p.dead = false; placeAt(world, p, mySlot(world)); }
    return;
  }
  if (p.stun > 0) p.stun = Math.max(0, p.stun - dt);
  p.landed = Math.max(0, (p.landed ?? 0) - dt * 10);
  b.portalCool = Math.max(0, b.portalCool - dt);

  let fy = world.groundY - p.air;             // 발 y (아래로 자란다)
  const grounded = p.grounded ?? false;
  const climbing = p.onLadder && onLadderColumn(b, p.x, fy, BLOCK_H);

  // 사다리 꼭대기에 서서 ⌥↓ — 내려간다. 꼭대기 칸은 딛는 바닥이라 그냥은 웅크리기가 된다.
  // 발밑 칸이 사다리면 웅크리는 게 아니라 잡고 내려가는 것이다.
  if (!climbing && grounded && input.duck && !input.jump && p.stun <= 0 && p.load === 0
      && 'H|'.includes(tile(b, Math.floor(p.x / T), Math.floor((fy + 2) / T)))) {
    p.onLadder = true; p.grounded = false; p.vx = 0; p.vy = 0;
    p.x = (Math.floor(p.x / T) + 0.5) * T;
  }
  const onLadder = p.onLadder && (onLadderColumn(b, p.x, fy, BLOCK_H) || 'H|'.includes(tile(b, Math.floor(p.x / T), Math.floor((fy + 2) / T))));
  // 웅크리기 — 땅에서, 사다리 아니면. 한 칸 굴은 웅크려야 지난다.
  const wantCrouch = input.duck && grounded && !climbing && !onLadder ? 1 : 0;
  p.crouch += (wantCrouch - p.crouch) * Math.min(1, dt * 16);
  if (p.crouch < 0.01) p.crouch = 0;
  const h = BLOCK_H - p.crouch * (BLOCK_H - CROUCH_H);

  // 사다리 타기·내리기 — 사다리 칸 위에서 ⌥↑/⌥↓. 좌우를 누르면 놓는다.
  const dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (!climbing && onLadderColumn(b, p.x, fy, BLOCK_H) && (input.jump || (input.duck && !grounded)) && p.stun <= 0) {
    p.onLadder = true; p.vx = 0; p.vy = 0; p.jumpHeld = true;
    p.x = (Math.floor(p.x / T) + 0.5) * T;
  }
  if (p.onLadder) {
    const column = onLadderColumn(b, p.x, fy, BLOCK_H) || 'H|'.includes(tile(b, Math.floor(p.x / T), Math.floor((fy + 2) / T)));
    if (!column) p.onLadder = false;
    else if (dir !== 0 && !input.jump && !input.duck) {
      // 옆으로 내린다. 그 층 바닥이 발 높이 근처(±16px)에 있으면 거기 올라선다 — 리프트에서 2층에
      // 내리려고 ⌥← 를 누른 사람이 바닥 끝을 몇 픽셀 못 미쳐 통로로 떨어지는 일이 없게.
      p.onLadder = false;
      const side = floorBelow(world, p.x + dir * (T * 0.5 + 6), fy - 16, fy + 16, HALF - 2, { ladders: false, people: false });
      if (side !== null && !bodyBlocked(world, p.x + dir * 8, side - 1, BLOCK_H)) {
        fy = side; p.air = world.groundY - fy; p.grounded = true; p.vy = 0; p.x += dir * 8;
      }
    }
  }

  if (p.onLadder && p.stun <= 0) {
    const up = (input.jump ? 1 : 0) - (input.duck ? 1 : 0);
    let nfy = fy - up * CLIMB * dt;
    // 사다리 끝: 내려가다 바닥에 닿으면 선다. 사다리 꼭대기 칸은 여기서는 바닥이 아니다 — 그걸 바닥으로
    // 치면 꼭대기에서 ⌥↓ 를 눌러도 한 발도 못 내려간다.
    const floor = up > 0 ? null : floorBelow(world, p.x, fy, nfy, HALF - 2, { ladders: false });
    // 바닥에 닿으면 **선 것**이다. 안 그러면 ⌥↓ 를 잡은 채로는 다음 프레임에 도로 사다리를 잡아
    // 바닥 위 허공에 매달린 채 걷지도 못한다.
    if (floor !== null) { nfy = floor; p.onLadder = false; p.grounded = true; p.vy = 0; }
    if (up > 0 && !onLadderColumn(b, p.x, nfy - 2, 4)) {
      // 사다리 꼭대기. 그 위에 설 자리가 있으면 올라선다.
      const tx = Math.floor(p.x / T), ty = Math.floor((nfy - 1) / T);
      const above = tile(b, tx, ty);
      // 잡고 있던 ⌥↑ 로 곧장 뛰어오르면 안 된다 — 사다리를 오르는 손과 뛰는 발은 다른 동작이다.
      if (!solidTile(b, above)) { nfy = ty * T + T; p.onLadder = false; p.grounded = true; p.jumpHeld = true; }
      else nfy = fy;
    }
    fy = nfy;
    p.air = world.groundY - fy;
    p.walk += CLIMB * dt * 0.03;
    p.hang = true;
    return;
  }
  p.hang = false;

  // 좌우
  const top = RUN * (1 - 0.55 * p.crouch) * (p.stun > 0 ? 0 : 1);
  if (dir !== 0 && p.stun <= 0) {
    p.vx += dir * ACCEL * (grounded ? 1 : AIR_CONTROL) * dt;
    p.vx = Math.max(-top, Math.min(top, p.vx));
    p.facing = dir;
  } else {
    const drop = FRICTION * dt * (grounded ? 1 : 0.35);
    p.vx = Math.abs(p.vx) <= drop ? 0 : p.vx - Math.sign(p.vx) * drop;
  }
  // 무빙워크·왕복 발판이 실어 가는 만큼. 자리에 바로 더하지 않고 걸음과 합쳐 아래에서 벽·상자에 대 본다 —
  // 그냥 더하면 무빙워크가 사람을 상자 **속으로** 밀어 넣는다.
  let drift = 0;
  if (grounded) {
    const under = tile(b, Math.floor(p.x / T), Math.floor((fy + 2) / T));
    if (under === '>') drift += CONVEYOR * dt;
    if (under === '<') drift -= CONVEYOR * dt;
    for (const tr of b.tracks) {
      const r = trackRect(tr);
      if (Math.abs(fy - r.top) < 3 && p.x > r.x0 - HALF && p.x < r.x1 + HALF) drift += (tr.vx ?? 0) * dt;
    }
  }

  // 남의 머리 위에 서 있으면 **그 사람이 걷는 만큼 같이 간다.** 안 그러면 밟힌 사람이 한 걸음 떼는
  // 순간 위 사람이 허공에 남았다가 떨어진다.
  const carrier = grounded ? carrierUnder(world, p.x, fy) : null;
  let ride = 0;
  if (carrier) {
    if (p.rideId === carrier.id) ride = carrier.x - p.rideX;
    p.rideId = carrier.id; p.rideX = carrier.x;
  } else {
    p.rideId = null;
  }

  // x 로 움직이고 벽·상자에 막히면 되돌린다. 상자는 **밀린다** — 밀 수 있으면.
  let nx = p.x + (p.vx + p.knock) * dt + ride + drift;
  p.pushing = false;
  if (bodyBlocked(world, nx, fy - 1, h) && grounded) {
    // 판자 두께만큼의 턱(14px 안)은 걸어서 올라선다 — 선반에 발이 걸려 서는 일이 없게.
    const step = floorBelow(world, nx, fy - 15, fy - 1);
    if (step !== null && !bodyBlocked(world, nx, step - 1, h)) { fy = step; p.air = world.groundY - fy; }
  }
  if (bodyBlocked(world, nx, fy - 1, h)) {
    const box = grounded && p.stun <= 0 ? boxInFront(world, nx, fy, h, Math.sign(nx - p.x)) : null;
    if (box) {
      p.pushing = true;
      const dir = Math.sign(nx - p.x);
      pushBox(world, box, dir, dt);
      // 상자에 **붙는다.** 제자리에 두면 상자가 1.5px 앞서 가고 나는 4.8px 씩 뒤따라 잡는 사이 세 프레임 중
      // 한 프레임은 밀지 못한다 — 초당 2.2칸짜리 상자가 1.6칸으로 간다.
      if (bodyBlocked(world, nx, fy - 1, h)) nx = box.x - dir * (T / 2 + HALF + 0.5);
      if (bodyBlocked(world, nx, fy - 1, h)) nx = p.x;
    } else {
      // 한 칸씩 물러서 벽에 붙인다
      const step = Math.sign(nx - p.x);
      while (bodyBlocked(world, nx, fy - 1, h) && Math.abs(nx - p.x) > 0.5) nx -= step * 0.5;
      if (bodyBlocked(world, nx, fy - 1, h)) nx = p.x;
      p.vx = 0;
    }
  }
  p.x = nx;
  if (p.knock !== 0) { p.knock *= Math.exp(-dt / 0.17); if (Math.abs(p.knock) < 8) p.knock = 0; }

  // 누가 내 머리 위에 서 있나 — 눌리는 그림이 되고, **뛰지 못한다.** 사람을 얹은 채 뛰면 위 사람을
  // 뚫고 오르거나(내 화면) 위 사람이 튕겨 오른다(그 사람 화면). 사람 계단은 웅크리기·손잡기로 오르는 것이다.
  p.load = ridersOn(world, p.x, fy, h);
  // 점프 — 땅에서만. 웅크린 채로는 안 뛴다 (굴 안에서 머리를 찧는다).
  if (input.jump && grounded && p.crouch < 0.3 && p.stun <= 0 && !p.jumpHeld && p.load === 0) {
    p.vy = JUMP_V; p.grounded = false; p.jumpHeld = true;
  }
  if (!input.jump) p.jumpHeld = false;

  // y — 중력, 착지, 천장
  let vy = p.grounded ? 0 : p.vy - G * dt;
  if (p.grounded) {
    // 발밑이 사라졌나 (열쇠로 블록이 지워졌다, 발판이 꺼졌다, 상자가 밀려났다, 남이 움직였다).
    // 발밑이 **올라왔나** 도 본다 — 밟고 있던 사람이 일어서면 나도 같이 올라간다.
    const under = floorBelow(world, p.x, fy - 28, fy + 6);
    if (under === null) p.grounded = false;
    else if (Math.abs(under - fy) > 0.5) fy = under;
  }
  if (!p.grounded) {
    const nfy = fy - vy * dt;
    if (vy <= 0) {
      const floor = floorBelow(world, p.x, fy, nfy);
      if (floor !== null) {
        fy = floor; vy = 0; p.grounded = true; p.landed = 1;
        // 스프링 위에 내렸으면 튄다
        const under = tile(b, Math.floor(p.x / T), Math.floor((fy + 2) / T));
        if (under === 'S') { vy = SPRING_V; p.grounded = false; p.landed = 0; }
      } else fy = nfy;
    } else {
      // 위로 — 천장. 남의 몸도 천장이다.
      if ((bodyBlocked(world, p.x, nfy - 0.5, h) && !bodyBlocked(world, p.x, fy - 0.5, h))
          || headBonk(world, p.x, fy, nfy, h)) { vy = 0; }
      else fy = nfy;
    }
    p.vy = vy;
  }
  p.air = world.groundY - fy;
  p.walk += Math.abs(p.vx) * dt * 0.052;

  // 죽는 것 둘 — 가시, 판 밖으로 떨어지기
  if (inSpikes(b, p.x, fy, h) || fy > world.groundY + T) { die(world); return; }

  // 포탈 — 몸 가운데가 포탈 칸에 들어가면 저편으로
  if (b.portalCool <= 0) {
    const ch = tile(b, Math.floor(p.x / T), Math.floor((fy - h / 2) / T));
    if ('uUwW'.includes(ch)) {
      const other = b.portals[ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()];
      if (other) {
        p.x = (other.x + 0.5) * T; p.air = world.groundY - (other.y + 1) * T; p.grounded = false;
        b.portalCool = PORTAL_COOL; b.flash = { x: p.x, y: world.groundY - p.air - h / 2, t: 0.4 };
      }
    }
  }
  // 통에 맞았나
  for (const br of b.barrels) {
    if (br.dead) continue;
    if (Math.abs(br.x - p.x) < HALF + BARREL_R - 6 && br.y > fy - h && br.y - BARREL_R < fy && p.stun <= 0) {
      p.knock = Math.sign(br.vx || (br.x < p.x ? 1 : -1)) * KNOCK; p.stun = STUN; p.vx = 0;
    }
  }
}

/// 내 앞의 상자 — 밀 수 있는 자리에 있으면.
function boxInFront(world, nx, fy, h, dir) {
  for (const bx of world.bag.boxes) {
    if (Math.abs(bx.x - nx) < HALF + T / 2 - 1 && Math.abs(bx.y - fy) < T * 0.6 && Math.sign(bx.x - nx) === dir) return bx;
  }
  return null;
}

/// 상자를 민다. 무거운 상자는 미는 사람이 둘 이상이어야 움직인다 — 방장이 세고, 손님은 부탁한다.
function pushBox(world, box, dir, dt) {
  const b = world.bag;
  const idx = b.boxes.indexOf(box);
  if (world.mp.on && world.mp.role !== 'host') {
    world.send?.({ t: 'gm', k: 'push', i: idx, d: dir });
    if (box.weight === 1) box.x += dir * PUSH * dt;            // 손맛 — 방장 꾸러미가 곧 덮는다
    return;
  }
  const pushers = countPushers(world, box, dir);
  if (pushers >= box.weight) box.px = dir;                      // 이번 프레임에 이 방향으로 밀린다
}

function countPushers(world, box, dir) {
  let n = 0;
  // 상자에서 한 칸 남짓 안에 서서 그쪽으로 걷고 있으면 미는 사람이다. 딱 붙어 있지 않아도 센다 —
  // 둘이 나란히 밀면 뒤의 사람은 앞사람 어깨에 막혀 몇 픽셀 떨어져 선다.
  const near = (x, fy) => Math.abs(box.y - fy) < T * 0.6 && Math.abs(box.x - x) < HALF + T / 2 + 14 && Math.sign(box.x - x) === dir;
  const me = world.player;
  if (!me.dead && near(me.x, world.groundY - me.air)) n++;
  for (const o of world.mp.others.values()) {
    if (!o.dead && near(o.x, o.groundY - o.air) && Math.sign(o.vx || 0) === dir) n++;
  }
  for (const [id, want] of (world.bag.pushWants ?? new Map())) {
    const o = world.mp.others.get(id);
    if (o && want.i === world.bag.boxes.indexOf(box) && want.d === dir && want.t > 0) n++;
  }
  return Math.max(n, world.mp.on ? 0 : box.weight);            // 혼자(연습) 할 때는 무게를 안 따진다
}

// ── 물건 (방장·혼자가 굴린다) ─────────────────────────────────────────────────

function everyone(world) {
  const list = [];
  const me = world.player;
  if (!me.dead) list.push({ x: me.x, fy: world.groundY - me.air, h: blockSize(me).h, id: world.mp.myId, me: true });
  for (const o of world.mp.others.values()) {
    if (!o.dead && !o.waiting) list.push({ x: o.x, fy: o.groundY - o.air, h: blockSize(o).h, id: o.id });
  }
  return list;
}

function stepObjects(world, dt) {
  const b = world.bag;
  const people = everyone(world);
  // 손님의 밀기 부탁은 잠깐만 산다. 살아 있는 동안은 매 프레임 밀어 준다 (사람이 충분하면).
  for (const [id, w] of (b.pushWants ?? new Map())) {
    w.t -= dt;
    if (w.t <= 0) { b.pushWants.delete(id); continue; }
    const box = b.boxes[w.i];
    if (box && countPushers(world, box, w.d) >= box.weight) box.px = w.d;
  }

  // 삭은 발판 — 누가 밟고 서 있으면 삭아 가고, 다 삭으면 부서진다. 부서진 것은 시간이 돌아오게 하고,
  // 밟다 만 것은 비어 있는 동안 아물어 간다 (안 그러면 넷이 한 명씩 지나가도 넷째가 빠진다).
  const stood = new Set();
  for (const q of people) {
    const ty = Math.floor((q.fy + 2) / T);
    for (const tx of [Math.floor((q.x - HALF + 3) / T), Math.floor((q.x + HALF - 3) / T)]) {
      if (tile(b, tx, ty) !== 'v' || rotGone(b, tx, ty) || Math.abs(q.fy - (ty * T + T * 0.3)) > 3) continue;
      const key = tx + ',' + ty;
      stood.add(key);
      const r = b.rot.get(key) ?? { t: 0, gone: 0 };
      r.t += dt;
      if (r.t >= ROT_AFTER) { r.t = 0; r.gone = ROT_GONE; }
      b.rot.set(key, r);
    }
  }
  for (const [key, r] of b.rot) {
    if (r.gone > 0) { r.gone = Math.max(0, r.gone - dt); }
    else if (!stood.has(key)) r.t = Math.max(0, r.t - dt * 1.5);
    if (r.gone === 0 && r.t === 0) b.rot.delete(key);
  }
  // 누름판 — 사람이든 상자든 위에 있으면 눌린다
  for (const tag of ['p', 'q']) {
    let held = false;
    for (let y = 0; y < b.h && !held; y++) for (let x = 0; x < b.w && !held; x++) {
      if (b.rows[y][x] !== tag) continue;
      const cx = (x + 0.5) * T, top = (y + 1) * T;
      for (const q of people) if (Math.abs(q.x - cx) < HALF + T / 2 && Math.abs(q.fy - top) < 4) held = true;
      for (const bx of b.boxes) if (Math.abs(bx.x - cx) < T / 2 && Math.abs(bx.y - top) < 4) held = true;
    }
    b.plates[tag] = held;
  }
  // 스위치 · 열쇠 — 몸이 닿으면
  for (const q of people) {
    const tx = Math.floor(q.x / T), ty = Math.floor((q.fy - 6) / T), ty2 = Math.floor((q.fy - q.h + 6) / T);
    for (const y of [ty, ty2]) {
      const ch = tile(b, tx, y);
      if (ch === 'a') b.latched = true;
      if ((ch === 'r' || ch === 'y' || ch === 'b') && !b.opened.has(ch)) {
        b.opened.add(ch); b.keys[ch].taken = true;
        b.flash = { x: (tx + 0.5) * T, y: (y + 0.5) * T, t: 0.6, color: KEY_COLOR[ch] };
      }
    }
  }
  // 상자 — 밀리고, 무빙워크에 실려 가고, 떨어지고, 포탈을 지난다
  for (const bx of b.boxes) {
    // 무빙워크 위의 상자는 혼자 간다 — 사람 걷는 속도의 절반. 밀지 않아도 누름판까지 실어다 준다.
    const belt = tile(b, Math.floor(bx.x / T), Math.floor((bx.y + 2) / T));
    const drift = bx.px ? bx.px * PUSH : belt === '>' ? CONVEYOR * 0.5 : belt === '<' ? -CONVEYOR * 0.5 : 0;
    if (drift) {
      const dir = Math.sign(drift);
      const nx = bx.x + drift * dt;
      const tx = Math.floor((nx + dir * (T / 2 - 1)) / T), ty = Math.floor((bx.y - T / 2) / T);
      const blocked = solidTile(b, tile(b, tx, ty)) || b.boxes.some((o) => o !== bx && Math.abs(o.x - nx) < T - 1 && Math.abs(o.y - bx.y) < T - 1);
      if (!blocked) bx.x = nx;
      bx.px = 0;
    }
    // 떨어지기. 지금 자리에서 본 **가장 가까운 아래 바닥**을 이번 프레임에 지나치면 거기 앉는다 —
    // 새 자리에서 다시 찾으면, 아홉 칸을 떨어져 한 프레임에 19px 씩 가는 상자는 바닥을 뚫고 판 밑으로 간다.
    const under = boxFloor(world, bx);
    if (under === null || under > bx.y + 0.5) {
      bx.vy = (bx.vy ?? 0) + G * dt;
      let ny = bx.y + bx.vy * dt;
      if (under !== null && ny >= under) { ny = under; bx.vy = 0; }
      bx.y = ny;
      if (bx.y > world.groundY + T) { bx.y = world.groundY; bx.vy = 0; }   // 판 밖으로는 안 떨어진다
    } else { bx.vy = 0; bx.y = under; }
    // 포탈
    const ch = tile(b, Math.floor(bx.x / T), Math.floor((bx.y - T / 2) / T));
    if ('uUwW'.includes(ch) && (bx.cool ?? 0) <= 0) {
      const o = b.portals[ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase()];
      if (o) { bx.x = (o.x + 0.5) * T; bx.y = (o.y + 1) * T; bx.cool = 1; }
    }
    bx.cool = Math.max(0, (bx.cool ?? 0) - dt);
  }
  // 통 — 구멍에서 나와 굴러가고, 떨어지고, 벽에 부딛히면 부서진다
  for (const c of b.chutes) {
    c.t -= dt;
    if (c.t <= 0 && b.barrels.filter((r) => !r.dead).length < 6) {
      c.t = BARREL_EVERY;
      b.barrels.push({ x: (c.x + 0.5) * T, y: (c.y + 1) * T, vx: c.dir * BARREL_SPEED, vy: 0, falls: 0, dead: false, spin: 0 });
    }
  }
  for (const br of b.barrels) {
    if (br.dead) continue;
    br.spin += br.vx * dt / BARREL_R;
    const nx = br.x + br.vx * dt;
    const tx = Math.floor((nx + Math.sign(br.vx) * BARREL_R) / T), ty = Math.floor((br.y - BARREL_R) / T);
    if (solidTile(b, tile(b, tx, ty))) { br.dead = true; br.burst = 0.4; continue; }
    br.x = nx;
    // 이번 프레임에 내려갈 자리까지 본다 — 빨리 떨어지는 통이 얇은 발판을 지나쳐 판 밑으로 사라지지 않게
    const drop = Math.max(8, (br.vy + G * dt) * dt + 1);
    const under = floorBelow(world, br.x, br.y - 1, br.y + drop, BARREL_R - 6, { people: false });
    if (under === null) {
      br.vy += G * dt; br.falling = true;
      br.y += br.vy * dt;
      if (br.y > world.groundY + T) { br.dead = true; continue; }
    } else {
      if (br.falling) { br.falls++; br.falling = false; if (br.falls >= 2) { br.dead = true; br.burst = 0.4; continue; } }
      br.vy = 0; br.y = under;
    }
  }
  b.barrels = b.barrels.filter((r) => !r.dead || (r.burst = (r.burst ?? 0) - dt) > 0);
  // 왕복 발판
  for (const tr of b.tracks) {
    tr.dir = tr.dir ?? 1;
    const before = tr.pos;
    tr.pos += tr.dir * TRACK_SPEED * dt;
    if (tr.pos >= tr.len) { tr.pos = tr.len; tr.dir = -1; }
    if (tr.pos <= 0) { tr.pos = 0; tr.dir = 1; }
    tr.vx = dt > 0 ? (tr.pos - before) / dt : 0;
  }
}

function boxFloor(world, box, y = box.y) {
  const b = world.bag;
  let best = null;
  const take = (top) => { if (top >= y - 1 && (best === null || top < best)) best = top; };
  const tx0 = Math.floor((box.x - T / 2 + 2) / T), tx1 = Math.floor((box.x + T / 2 - 2) / T);
  for (let ty = Math.max(0, Math.floor(y / T) - 1); ty < b.h; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const ch = tile(b, tx, ty);
      if (solidTile(b, ch)) take(ty * T);
      else if (onewayTile(b, ch, tx, ty)) take(ty * T + (ch === '=' || ch === 'v' ? T * 0.3 : 0));
    }
    if (best !== null) break;
  }
  for (const o of b.boxes) if (o !== box && Math.abs(o.x - box.x) < T - 2 && o.y - T >= y - 1) take(o.y - T);
  for (const tr of b.tracks) { const r = trackRect(tr); if (box.x > r.x0 && box.x < r.x1 && r.top >= y - 1) take(r.top); }
  return best;
}

/// 출구 조건. 몇 명이 포탈 안에 있나, 조건이 찼나.
function exitState(world) {
  const b = world.bag;
  if (!b.exit) return { inside: 0, ready: false };
  const cx = (b.exit.x + 0.5) * T, top = (b.exit.y + 1) * T;
  let inside = 0;
  // 세로로는 한 칸 반 — 포탈 앞에 넷이 몰리면 누가 누구 머리 위에 서게 된다(머리 53px). 그것도 안에 있는 것이다.
  for (const q of everyone(world)) if (Math.abs(q.x - cx) < T * 2.5 && q.fy <= top + T * 0.6 && q.fy > top - T * 1.5) inside++;
  // 「넷」 판은 방에 있는 사람 전부 (넷이어야 시작하니 넷). 혼자 남았어도 둘은 되어야 — 혼자서 끝내는 판이 아니다.
  const need = b.end === 'one' ? 1 : (world.mp.on ? Math.max(2, world.mp.others.size + 1) : 1);
  return { inside, need, ready: inside >= need };
}

function meAtExit(world) {
  const b = world.bag, p = world.player;
  if (!b.exit || p.dead) return false;
  const fy = world.groundY - p.air, top = (b.exit.y + 1) * T;
  return Math.abs(p.x - (b.exit.x + 0.5) * T) < T * 2.5 && fy <= top + T * 0.6 && fy > top - T * 1.5;
}

function nextStage(world) {
  const b = world.bag;
  if (b.stage + 1 >= STAGES.length) {
    world.onGameOver?.({ name: '넷이서', side: 0, rows: [] });
    return;
  }
  world.stage = b.stage + 1;
  const deaths = b.deaths, resets = b.resets;
  loadStage(world, world.stage);
  b.deaths = deaths; b.resets = resets;
  placeAt(world, world.player, mySlot(world));
  say(world, `${STAGES[b.stage].world} ${stageNo(b.stage)} · ${STAGES[b.stage].name}`);
}

function stageNo(index) {
  const s = STAGES[index];
  const wi = WORLDS.findIndex((w) => w.name === s.world);
  const si = STAGES.filter((t, i) => t.world === s.world && i <= index).length;
  return `${wi + 1}-${si}`;
}

// ── 그리기 ──────────────────────────────────────────────────────────────────

function drawTiles(ctx, world, time, boil) {
  const b = world.bag;
  const theme = THEME[b.def.world] ?? THEME['도시'];
  const cam = b.cam ?? { x: 0, y: 0, w: world.w, h: world.h };
  const tx0 = Math.max(0, Math.floor(cam.x / T) - 1), tx1 = Math.min(b.w - 1, Math.floor((cam.x + cam.w) / T) + 1);
  const ty0 = Math.max(0, Math.floor(cam.y / T) - 1), ty1 = Math.min(b.h - 1, Math.floor((cam.y + cam.h) / T) + 1);
  const on = blinkOn(b), warn = blinkWarn(b);
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const ch = b.rows[ty][tx];
    if (ch === '.' || ch === '-') continue;
    const x = tx * T, y = ty * T;
    switch (ch) {
      case '#': {
        // 땅. 색연필로 채우고, 노출된 윗면만 잉크로 긋는다 — 칸마다 네모를 그리면 격자가 된다.
        ctx.fillStyle = theme.ground; ctx.globalAlpha = 0.42; ctx.fillRect(x, y, T, T); ctx.globalAlpha = 1;
        if (((tx * 7 + ty * 13) % 5) < 2) stroke(ctx, [[x + 6, y + T - 6], [x + T - 6, y + 6]], { width: 1.4, color: theme.hatch, seed: tx * 31 + ty, amp: 0.5, halo: false, alpha: 0.5 });
        if (!solidTile(b, tile(b, tx, ty - 1))) {
          stroke(ctx, [[x, y], [x + T, y]], { width: 3, color: INK, seed: tx * 3 + ty * 7, amp: 0.7, halo: false });
          if (theme.edge) for (let k = 4; k < T; k += 9) stroke(ctx, [[x + k, y], [x + k + 2, y - 5]], { width: 1.8, color: theme.edge, seed: tx * 5 + k, amp: 0.4, halo: false });
        }
        if (!solidTile(b, tile(b, tx, ty + 1))) stroke(ctx, [[x, y + T], [x + T, y + T]], { width: 2.4, color: INK, seed: tx * 3 + ty * 7 + 1, amp: 0.6, halo: false });
        if (!solidTile(b, tile(b, tx - 1, ty))) stroke(ctx, [[x, y], [x, y + T]], { width: 2.4, color: INK, seed: tx * 3 + ty * 7 + 2, amp: 0.6, halo: false });
        if (!solidTile(b, tile(b, tx + 1, ty))) stroke(ctx, [[x + T, y], [x + T, y + T]], { width: 2.4, color: INK, seed: tx * 3 + ty * 7 + 3, amp: 0.6, halo: false });
        break;
      }
      case '=': {
        // 나무 판자. 못 둘.
        ctx.fillStyle = '#c9a86a'; ctx.globalAlpha = 0.45; ctx.fillRect(x, y + T * 0.3, T, T * 0.4); ctx.globalAlpha = 1;
        stroke(ctx, [[x, y + T * 0.3], [x + T, y + T * 0.3], [x + T, y + T * 0.7], [x, y + T * 0.7]], { width: 2.2, color: INK, seed: tx + ty * 9, amp: 0.5, close: true, halo: false, sharp: true });
        circle(ctx, x + 8, y + T * 0.5, 1.6, { width: 1, color: INK, fill: INK, halo: false, seed: 1, amp: 0 });
        break;
      }
      case 'v': {
        // 삭은 판자. 회색빛에 금이 갔다. 밟으면 금이 벌어지다 부서지고, 부서진 자리는 점선 윤곽만 남는다.
        const r = b.rot.get(tx + ',' + ty);
        if (r?.gone > 0) {
          ctx.save(); ctx.setLineDash([3, 5]); ctx.strokeStyle = PENCIL; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.5;
          ctx.strokeRect(x + 1, y + T * 0.3, T - 2, T * 0.4); ctx.restore();
          break;
        }
        const crack = Math.min(1, (r?.t ?? 0) / ROT_AFTER);
        const jit = crack > 0 ? Math.sin(time * 50) * crack * 1.5 : 0;
        ctx.fillStyle = '#9c8f74'; ctx.globalAlpha = 0.45; ctx.fillRect(x + jit, y + T * 0.3, T, T * 0.4); ctx.globalAlpha = 1;
        stroke(ctx, [[x + jit, y + T * 0.3], [x + T + jit, y + T * 0.3], [x + T + jit, y + T * 0.7], [x + jit, y + T * 0.7]], { width: 2.2, color: INK, seed: tx + ty * 9, amp: 0.5, close: true, halo: false, sharp: true });
        stroke(ctx, [[x + 10 + jit, y + T * 0.3], [x + 16 + jit, y + T * 0.5], [x + 12 + jit, y + T * 0.7]], { width: 1.4 + crack * 1.6, color: INK, seed: tx * 5 + ty, amp: 0.6, halo: false });
        stroke(ctx, [[x + 28 + jit, y + T * 0.7], [x + 30 + jit, y + T * 0.45]], { width: 1.2 + crack, color: INK, seed: tx * 5 + ty + 1, amp: 0.5, halo: false });
        break;
      }
      case '~': {
        // 깜빡이는 발판. 켜지면 판자, 꺼지면 점선 윤곽만. 꺼지기 0.5초 전부터 떨린다.
        const jit = warn ? Math.sin(time * 40) * 1.5 : 0;
        if (on) {
          ctx.fillStyle = '#b8912a'; ctx.globalAlpha = 0.5; ctx.fillRect(x + jit, y, T, T * 0.4); ctx.globalAlpha = 1;
          stroke(ctx, [[x + jit, y], [x + T + jit, y], [x + T + jit, y + T * 0.4], [x + jit, y + T * 0.4]], { width: 2.2, color: INK, seed: tx + ty * 9, amp: 0.5, close: true, halo: false, sharp: true });
        } else {
          ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = PENCIL; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.6;
          ctx.strokeRect(x + 1, y + 1, T - 2, T * 0.4); ctx.restore();
        }
        break;
      }
      case 'H': case '|': {
        const col = ch === 'H' ? '#8a6a3a' : '#6b665c';
        stroke(ctx, [[x + 9, y], [x + 9, y + T]], { width: 2.6, color: INK, seed: tx * 2 + ty, amp: 0.4, halo: false });
        stroke(ctx, [[x + T - 9, y], [x + T - 9, y + T]], { width: 2.6, color: INK, seed: tx * 2 + ty + 1, amp: 0.4, halo: false });
        for (const k of [10, 24, 38]) if (k < T) stroke(ctx, [[x + 9, y + k], [x + T - 9, y + k]], { width: 2.2, color: col, seed: tx + ty + k, amp: 0.3, halo: false });
        break;
      }
      case '^': {
        // 가시 — 빗금 삼각형 셋. 도시에서는 전기 레일로 읽힌다.
        for (let k = 0; k < 3; k++) {
          const bx = x + k * (T / 3);
          stroke(ctx, [[bx, y + T], [bx + T / 6, y + 4], [bx + T / 3, y + T]], { width: 2, color: RED, seed: tx * 5 + k, amp: 0.5, halo: false, fill: 'rgba(208,47,34,.25)' });
        }
        break;
      }
      case 'R': case 'Y': case 'B': {
        if (b.opened.has(ch.toLowerCase())) break;
        const c = BLOCK_COLOR[ch];
        ctx.fillStyle = c; ctx.globalAlpha = 0.28; ctx.fillRect(x + 2, y + 2, T - 4, T - 4); ctx.globalAlpha = 1;
        stroke(ctx, [[x + 3, y + 3], [x + T - 3, y + 3], [x + T - 3, y + T - 3], [x + 3, y + T - 3]], { width: 3, color: c, seed: tx * 7 + ty, amp: 0.6, close: true, halo: false, sharp: true });
        stroke(ctx, [[x + 12, y + 12], [x + T - 12, y + T - 12]], { width: 2, color: c, seed: tx + ty, amp: 0.4, halo: false, alpha: 0.8 });
        stroke(ctx, [[x + T - 12, y + 12], [x + 12, y + T - 12]], { width: 2, color: c, seed: tx + ty + 1, amp: 0.4, halo: false, alpha: 0.8 });
        break;
      }
      case 'A': case 'P': case 'Q': {
        const open = !solidTile(b, ch);
        // 롤 셔터. 열리면 위 통으로 말려 올라간다 — 위 칸(통)이 있을 때만 통을 그린다.
        const topMost = !'APQ'.includes(tile(b, tx, ty - 1));
        if (topMost) stroke(ctx, [[x - 3, y - 2], [x + T + 3, y - 2], [x + T + 3, y + 6], [x - 3, y + 6]], { width: 2.4, color: INK, seed: tx, amp: 0.5, close: true, halo: false, fill: PAPER_SOLID });
        if (!open) {
          ctx.fillStyle = '#6b665c'; ctx.globalAlpha = 0.25; ctx.fillRect(x + 3, y, T - 6, T); ctx.globalAlpha = 1;
          for (let k = 6; k < T; k += 8) stroke(ctx, [[x + 4, y + k], [x + T - 4, y + k]], { width: 1.6, color: INK, seed: tx + ty + k, amp: 0.3, halo: false });
          stroke(ctx, [[x + 3, y], [x + 3, y + T]], { width: 2, color: INK, seed: tx * 3, amp: 0.3, halo: false });
          stroke(ctx, [[x + T - 3, y], [x + T - 3, y + T]], { width: 2, color: INK, seed: tx * 3 + 1, amp: 0.3, halo: false });
        }
        break;
      }
      case 'a': {
        // 스위치 — 받침 위 빨간 버튼. 밟으면 내려간 채로, 불이 켜진다.
        const down = b.latched ? 5 : 0;
        stroke(ctx, [[x + 6, y + T], [x + T - 6, y + T], [x + T - 6, y + T - 6], [x + 6, y + T - 6]], { width: 2, color: INK, seed: tx, amp: 0.4, close: true, halo: false, fill: 'rgba(107,102,92,.3)' });
        stroke(ctx, [[x + 12, y + T - 6], [x + T - 12, y + T - 6], [x + T - 12, y + T - 16 + down], [x + 12, y + T - 16 + down]], { width: 2.2, color: INK, seed: tx + 1, amp: 0.4, close: true, halo: false, fill: 'rgba(208,47,34,.75)' });
        circle(ctx, x + T / 2, y + T - 22 + down, 2.6, { width: 1.4, color: INK, fill: b.latched ? '#3f8f56' : PAPER_SOLID, halo: false, seed: tx, amp: 0.1 });
        break;
      }
      case 'p': case 'q': {
        const held = b.plates[ch];
        const dy = held ? 4 : 0;
        stroke(ctx, [[x + 2, y + T - 8 + dy], [x + T - 2, y + T - 8 + dy], [x + T - 2, y + T], [x + 2, y + T]], { width: 2.2, color: INK, seed: tx * 3 + ty, amp: 0.4, close: true, halo: false, fill: held ? 'rgba(63,143,86,.7)' : 'rgba(63,143,86,.4)', sharp: true });
        for (const k of [8, T / 2, T - 8]) circle(ctx, x + k, y + T - 4 + dy, 1.4, { width: 1, color: INK, fill: INK, halo: false, seed: 1, amp: 0 });
        break;
      }
      case 'S': {
        stroke(ctx, [[x + 3, y + T - 8], [x + T - 3, y + T - 8], [x + T - 3, y + T - 2], [x + 3, y + T - 2]], { width: 2.2, color: INK, seed: tx, amp: 0.4, close: true, halo: false, fill: 'rgba(47,156,156,.45)' });
        for (let k = 6; k < T - 4; k += 8) stroke(ctx, [[x + k, y + T - 8], [x + k + 4, y + T - 16], [x + k + 8, y + T - 8]], { width: 1.6, color: INK, seed: tx + k, amp: 0.3, halo: false });
        break;
      }
      case '>': case '<': {
        ctx.fillStyle = '#2f6fb0'; ctx.globalAlpha = 0.3; ctx.fillRect(x, y, T, T); ctx.globalAlpha = 1;
        stroke(ctx, [[x, y], [x + T, y]], { width: 2.4, color: INK, seed: tx, amp: 0.4, halo: false });
        const ph = ((time * (ch === '>' ? 1 : -1) * 40) % T + T) % T;
        stroke(ctx, [[x + ph - 6, y + T / 2], [x + ph, y + T / 2 - (ch === '>' ? 5 : -5) * 0 + 0], [x + ph - 6, y + T / 2 + 6]].map(([a, c]) => [a, c]), { width: 1.6, color: '#2f6fb0', seed: tx, amp: 0.2, halo: false, alpha: 0.9 });
        break;
      }
      case 'u': case 'U': case 'w': case 'W': {
        const c = ch.toLowerCase() === 'u' ? '#2f6fb0' : '#2f9c9c';
        drawPortal(ctx, x + T / 2, y + T, c, time, false);
        break;
      }
      case 'O': {
        drawPortal(ctx, x + T / 2, y + T, '#8a5bb5', time, true, exitState(world).ready);
        break;
      }
      case '{': case '}': {
        ctx.fillStyle = INK; ctx.globalAlpha = 0.85; ctx.fillRect(x + 4, y - T * 0.6, T - 8, T * 1.6); ctx.globalAlpha = 1;
        break;
      }
      case 'r': case 'y': case 'b': {
        if (b.opened.has(ch)) break;
        const bob = Math.sin(time * 2.4 + tx) * 3;
        drawKey(ctx, x + T / 2, y + T / 2 + bob, KEY_COLOR[ch], tx);
        break;
      }
      default: break;
    }
  }
  // 왕복 발판 길과 발판
  for (const tr of b.tracks) {
    ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = '#2f6fb0'; ctx.lineWidth = 1.4; ctx.globalAlpha = 0.6;
    ctx.beginPath(); ctx.moveTo(tr.x0 * T, tr.y * T + T / 2); ctx.lineTo((tr.x1 + 1) * T, tr.y * T + T / 2); ctx.stroke(); ctx.restore();
    const r = trackRect(tr);
    ctx.fillStyle = '#c9a86a'; ctx.globalAlpha = 0.5; ctx.fillRect(r.x0, r.top, TRACK_W, r.bottom - r.top); ctx.globalAlpha = 1;
    stroke(ctx, [[r.x0, r.top], [r.x1, r.top], [r.x1, r.bottom], [r.x0, r.bottom]], { width: 2.4, color: INK, seed: tr.x0, amp: 0.5, close: true, halo: false, sharp: true });
  }
}

function drawPortal(ctx, cx, bottom, color, time, exit, lit = false) {
  const cy = bottom - T * 0.75;
  circle(ctx, cx, bottom - 3, T * 0.42, { width: 1.4, color: PENCIL, halo: false, seed: 5, amp: 0.4, alpha: 0.6 });
  ctx.save(); ctx.translate(cx, cy); ctx.scale(0.6, 1);
  circle(ctx, 0, 0, T * 0.68, { width: 3, color: INK, fill: exit ? (lit ? color : 'rgba(138,91,181,.35)') : `${color}44`, halo: false, seed: 6, amp: 0.7 });
  ctx.restore();
  if (exit) {
    stroke(ctx, [[cx, cy + 14], [cx, cy - 14]], { width: 3, color: lit ? PAPER_SOLID : color, seed: 7, amp: 0.3, halo: false });
    stroke(ctx, [[cx - 7, cy - 7], [cx, cy - 15], [cx + 7, cy - 7]], { width: 3, color: lit ? PAPER_SOLID : color, seed: 8, amp: 0.3, halo: false });
  } else {
    const a = time * 3;
    stroke(ctx, [[cx + Math.cos(a) * 6, cy + Math.sin(a) * 14], [cx + Math.cos(a + 2) * 4, cy + Math.sin(a + 2) * 8], [cx + Math.cos(a + 4) * 2, cy + Math.sin(a + 4) * 3]], { width: 1.8, color, seed: 9, amp: 0.4, halo: false, alpha: 0.85 });
  }
}

function drawKey(ctx, cx, cy, color, seed) {
  circle(ctx, cx - 8, cy, 6, { width: 3, color, halo: false, seed, amp: 0.4 });
  circle(ctx, cx - 8, cy, 2.2, { width: 1.6, color, halo: false, seed: seed + 1, amp: 0.2 });
  stroke(ctx, [[cx - 2, cy], [cx + 13, cy]], { width: 3, color, seed: seed + 2, amp: 0.3, halo: false });
  stroke(ctx, [[cx + 8, cy], [cx + 8, cy + 5]], { width: 3, color, seed: seed + 3, amp: 0.2, halo: false });
  stroke(ctx, [[cx + 12, cy], [cx + 12, cy + 4]], { width: 3, color, seed: seed + 4, amp: 0.2, halo: false });
}

function drawBox(ctx, bx, seed) {
  const x = bx.x - T / 2, y = bx.y - T;
  ctx.fillStyle = '#6f4a2c'; ctx.globalAlpha = 0.42; ctx.fillRect(x + 2, y + 2, T - 4, T - 4); ctx.globalAlpha = 1;
  stroke(ctx, [[x + 2, y + 2], [x + T - 2, y + 2], [x + T - 2, y + T - 2], [x + 2, y + T - 2]], { width: 3, color: INK, seed, amp: 0.6, close: true, halo: false, sharp: true });
  stroke(ctx, [[x + 2, y + T * 0.38], [x + T - 2, y + T * 0.38]], { width: 1.4, color: '#4f3320', seed: seed + 1, amp: 0.3, halo: false });
  stroke(ctx, [[x + 2, y + T * 0.7], [x + T - 2, y + T * 0.7]], { width: 1.4, color: '#4f3320', seed: seed + 2, amp: 0.3, halo: false });
  stroke(ctx, [[x + 5, y + T - 5], [x + T - 5, y + 5]], { width: 2, color: '#4f3320', seed: seed + 3, amp: 0.4, halo: false });
  if (bx.weight === 2) {
    stroke(ctx, [[x + 2, y + 10], [x + T - 2, y + 10]], { width: 3.4, color: INK, seed: seed + 4, amp: 0.2, halo: false });
    stroke(ctx, [[x + 2, y + T - 10], [x + T - 2, y + T - 10]], { width: 3.4, color: INK, seed: seed + 5, amp: 0.2, halo: false });
    circle(ctx, x + T / 2 - 5, y + 6, 2, { width: 1, color: INK, fill: INK, halo: false, seed: 1, amp: 0 });
    circle(ctx, x + T / 2 + 5, y + 6, 2, { width: 1, color: INK, fill: INK, halo: false, seed: 1, amp: 0 });
  } else circle(ctx, x + T / 2, y + 6, 2, { width: 1, color: INK, fill: INK, halo: false, seed: 1, amp: 0 });
}

function drawBarrel(ctx, br, seed) {
  if (br.dead) {
    const k = 1 - Math.max(0, br.burst ?? 0) / 0.4;
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + seed;
      stroke(ctx, [[br.x + Math.cos(a) * 8 * (1 + k * 2), br.y - BARREL_R + Math.sin(a) * 8 * (1 + k * 2)], [br.x + Math.cos(a) * 14 * (1 + k * 2), br.y - BARREL_R + Math.sin(a) * 14 * (1 + k * 2)]], { width: 2, color: '#6f4a2c', seed: seed + i, amp: 0.5, halo: false, alpha: 1 - k });
    }
    return;
  }
  const cy = br.y - BARREL_R;
  circle(ctx, br.x, cy, BARREL_R, { width: 3, color: INK, fill: 'rgba(111,74,44,.5)', halo: false, seed, amp: 0.6 });
  ctx.save(); ctx.translate(br.x, cy); ctx.rotate(br.spin);
  stroke(ctx, [[-BARREL_R + 4, 0], [BARREL_R - 4, 0]], { width: 1.8, color: INK, seed: seed + 1, amp: 0.3, halo: false });
  stroke(ctx, [[0, -BARREL_R + 4], [0, BARREL_R - 4]], { width: 1.8, color: INK, seed: seed + 2, amp: 0.3, halo: false });
  ctx.restore();
}

// ── 게임 모듈 ───────────────────────────────────────────────────────────────

export default {
  id: 'coop',
  name: '넷이서',
  line: '넷이 열쇠를 찾아 포탈에 모인다. 혼자서는 아무것도 못 하게 만든 판 열둘.',
  keys: [['⌥ ← →', '걷기 (상자는 걸어가서 민다)'], ['⌥ ↑', '점프 · 사다리 오르기 · 포탈에서 다음 판'],
         ['⌥ ↓', '웅크리기 (한 칸 굴) · 사다리 내리기'], ['⌥ Space', '손잡기 — 아래 사람을 끌어올린다 (세 칸)'],
         ['⌥ R', '판 되감기 (방장만)']],
  noGrab: true, noClock: true, noResults: true, noGround: true,
  /// ⌥R 은 판 도중에도 먹는다 — 방장이 되감는다. 다른 게임은 판이 끝난 뒤에만.
  rewindable: true,
  figure: drawBlock,
  tally: () => '',

  fresh: () => ({ rows: null, stage: 0, deaths: 0, resets: 0 }),

  /// 판을 연다. 처음이거나 되감을 때. 판 번호는 world.stage 에 남는다 (restart 가 지켜 준다).
  begin(world) {
    loadStage(world, world.stage ?? 0);
    world.bag.resets = (world.bagResets ?? 0);
    placeAt(world, world.player, mySlot(world));
  },

  /// spread 가 부른다 — 시작 자리에 세운다.
  stand(world, slot) { if (world.bag?.rows) placeAt(world, world.player, slot); },

  resize(world) {
    // 창 크기가 바뀌어도 판 크기는 그대로다. 카메라가 화면에 맞춘다.
    if (world.bag?.rows) { world.w = world.bag.w * T; world.h = world.bag.h * T; world.groundY = world.bag.h * T; }
  },

  /// 넷이어야 시작한다. 혼자는 개발용(DDONG_DEBUG)에서만.
  blocked(world) {
    const n = world.mp.on ? world.mp.others.size + 1 : 1;
    if (!world.mp.on) return world.debug ? null : '넷이서 하는 게임이다 — 방을 열어 셋을 더 부른다';
    if (n !== 4) return `넷이어야 시작한다 — 지금 ${n}명`;
    return null;
  },

  move,

  /// ⌥Space — 손잡기. 바로 밑(세 칸 안)의 사람을 내 옆으로 끌어올린다.
  action(world) {
    const p = world.player;
    if (p.dead || !p.grounded) return;
    const fy = world.groundY - p.air;
    let best = null, bestD = 1e9;
    for (const o of world.mp.others.values()) {
      if (o.dead) continue;
      const ofy = o.groundY - o.air;
      const dy = ofy - fy, dx = Math.abs(o.x - p.x);
      if (dy > 8 && dy <= PULL_REACH && dx < T * 1.3 && dy + dx < bestD) { best = o; bestD = dy + dx; }
    }
    if (!best) return;
    p.pulling = 0.35;
    const side = Math.sign(best.x - p.x) || p.facing || 1;
    // 올라선 사람이 설 자리 — 상대 쪽 옆, 안 되면 반대쪽 옆, 그것도 안 되면 내 자리.
    // 「선다」는 막히지 않고 **발밑에 바닥이 있다**는 뜻이다. 벼랑 끝에서 끌어올린 사람을 허공에 세우면
    // 그 사람 화면에서 도로 떨어진다.
    const standable = (x) => !bodyBlocked(world, x, fy - 1, BLOCK_H) && floorBelow(world, x, fy - 2, fy + 2, HALF - 6, { people: false }) !== null;
    const land = { x: p.x, air: p.air };
    for (const x of [p.x + side * (BLOCK_W + 4), p.x - side * (BLOCK_W + 4)]) { if (standable(x)) { land.x = x; break; } }
    world.send?.({ t: 'gm', k: 'pull', to: best.id, x: Math.round(land.x), air: Math.round(land.air) }, world.mp.role === 'host' ? best.id : undefined);
    if (world.debug) world.log?.(`손잡기 ${best.id} → ${Math.round(land.x)}`);
  },

  update(world, dt) {
    const b = world.bag;
    if (!b?.rows) return;
    const p = world.player;
    p.pulling = Math.max(0, (p.pulling ?? 0) - dt);
    if (b.flash) { b.flash.t -= dt; if (b.flash.t <= 0) b.flash = null; }
    // p.load (머리 위에 선 사람 수) 는 move 가 센다 — 뛸 수 있는지에 쓰인다.

    // 개발용 심장 소리 — 1초에 한 번. 판 · 상태 · 내 자리 · 잡은 키.
    if (world.debug) {
      b.beat = (b.beat ?? 0) + dt;
      if (b.beat >= 1) {
        b.beat = 0;
        const i = world.input;
        world.log?.(`넷이서 ${stageNo(b.stage)} ${world.state} x=${Math.round(p.x)} air=${Math.round(p.air)} g=${p.grounded ? 1 : 0}`
          + ` 키=${['left','right','jump','duck'].filter((k) => i[k]).join('+') || '-'} 시계=${b.clock.toFixed(1)}`);
      }
    }
    if (world.state !== 'play') return;
    b.clock += dt;
    const host = !world.mp.on || world.mp.role === 'host';

    if (host) {
      stepObjects(world, dt);
      // 시간 제한
      if (b.limit && b.clock > b.limit && !b.done) { rewind(world, '시간이 다 됐다'); }
      // 출구 — 조건이 차고, 안에 있는 누가 ⌥↑ 를 눌렀다
      const ex = exitState(world);
      if (!b.done && ex.ready && ((meAtExit(world) && world.input.jump) || b.exitAsk > 0)) { b.done = NEXT_FADE; }
      b.exitAsk = Math.max(0, (b.exitAsk ?? 0) - dt);
      if (b.done > 0) { b.done -= dt; if (b.done <= 0) { b.done = 0; nextStage(world); } }
    } else {
      // 손님도 통과 왕복 발판은 같은 식으로 굴려서 매끈하게 보인다 (방장 꾸러미가 자리를 잡아 준다)
      for (const tr of b.tracks) { tr.dir = tr.dir ?? 1; const before = tr.pos; tr.pos += tr.dir * TRACK_SPEED * dt; if (tr.pos >= tr.len) { tr.pos = tr.len; tr.dir = -1; } if (tr.pos <= 0) { tr.pos = 0; tr.dir = 1; } tr.vx = dt > 0 ? (tr.pos - before) / dt : 0; }
      for (const br of b.barrels) { if (!br.dead) { br.x += br.vx * dt; br.spin += br.vx * dt / BARREL_R; } }
      if (meAtExit(world) && world.input.jump && !b.asked) { world.send?.({ t: 'gm', k: 'exit' }); b.asked = true; }
      if (!world.input.jump) b.asked = false;
    }
  },

  /// 사람마다 다른 카메라. 내 자리를 따라가되 죽은 구역 안에서는 안 움직이고, 판 끝에서 멈춘다.
  camera(world, vw, vh, dt = 1 / 60) {
    const b = world.bag;
    if (!b?.rows) return null;
    const p = world.player;
    const mw = b.w * T, mh = b.h * T;
    const px = p.x, py = world.groundY - p.air - BLOCK_H / 2;
    const cam = b.cam ?? { x: Math.max(0, Math.min(mw - vw, px - vw / 2)), y: Math.max(0, Math.min(mh - vh, py - vh / 2)), w: vw, h: vh };
    cam.w = vw; cam.h = vh;
    const dead = { x: 4 * T, y: 3 * T };
    let tx = cam.x, ty = cam.y;
    if (px - (cam.x + vw / 2) > dead.x) tx = px - dead.x - vw / 2;
    if (px - (cam.x + vw / 2) < -dead.x) tx = px + dead.x - vw / 2;
    if (py - (cam.y + vh / 2) > dead.y) ty = py - dead.y - vh / 2;
    if (py - (cam.y + vh / 2) < -dead.y) ty = py + dead.y - vh / 2;
    tx = Math.max(0, Math.min(Math.max(0, mw - vw), tx));
    ty = Math.max(0, Math.min(Math.max(0, mh - vh), ty));
    if (mw <= vw) tx = -(vw - mw) / 2;             // 판이 화면보다 작으면 가운데
    if (mh <= vh) ty = -(vh - mh) / 2;
    const k = 1 - Math.exp(-dt / 0.12);
    cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k;
    b.cam = cam;
    return cam;
  },

  draw(ctx, world, time, boil, upright) {
    const b = world.bag;
    if (!b?.rows) return;
    drawTiles(ctx, world, time, boil);
    // 배경 소품 글 — 연필로 살짝
    for (const [x, y, label] of b.def.notes ?? []) {
      text(ctx, label, x * T, y * T + T * 0.7, { font: '600 11px "Apple SD Gothic Neo", sans-serif', color: PENCIL, halo: 0, alpha: 0.7 });
    }
    b.boxes.forEach((bx, i) => drawBox(ctx, bx, 300 + i));
    b.barrels.forEach((br, i) => drawBarrel(ctx, br, 400 + i));
    if (b.flash) {
      circle(ctx, b.flash.x, b.flash.y, 18 + (0.6 - b.flash.t) * 60, { width: 2.4, color: b.flash.color ?? '#2f6fb0', halo: false, seed: 77, amp: 1.2, alpha: Math.max(0, b.flash.t / 0.6) });
    }
    // 판 사이 어두워지기
    if (b.done > 0) {
      ctx.fillStyle = `rgba(20,18,16,${Math.min(0.85, (NEXT_FADE - b.done) / NEXT_FADE)})`;
      ctx.fillRect(b.cam?.x ?? 0, b.cam?.y ?? 0, b.cam?.w ?? world.w, b.cam?.h ?? world.h);
    }
  },

  /// 글자판. 화면 좌표. 판 이름 · 되감기 · 출구 상태 · 화면 밖 친구 화살표.
  hud(ctx, hud, time, toScreen) {
    const world = hud;
    const b = world.bag;
    if (!b?.rows || world.state === 'pick') return;
    const def = b.def;
    // 왼쪽 위 — 판
    const label = `${stageNo(b.stage)} ${def.name}`;
    const sub = `${def.world} · 되감기 ${b.resets} · ${b.end === 'one' ? '한 명만 닿으면 끝' : '넷이 다 모여야 끝'}${b.limit ? ` · ${Math.max(0, Math.ceil(b.limit - b.clock))}초` : ''}`;
    ctx.font = '600 11px "Apple SD Gothic Neo", sans-serif';
    const w = Math.max(150, ctx.measureText(sub).width + 30);
    paperScrap(ctx, 24, 16, w, 50, 3);
    stroke(ctx, [[34, 26], [34, 56]], { width: 2, color: RED, seed: 1, amp: 1, alpha: 0.8, halo: false });
    text(ctx, label, 42, 40, { font: '800 15px "Apple SD Gothic Neo", sans-serif', color: INK, halo: 0 });
    text(ctx, sub, 42, 57, { font: '600 11px "Apple SD Gothic Neo", sans-serif', color: PENCIL, halo: 0 });

    // 출구 — 가까이 가면 몇 명 더 필요한지
    if (b.exit && !b.done) {
      const ex = exitState(world);
      const [sx, sy] = toScreen((b.exit.x + 0.5) * T, (b.exit.y + 1) * T - T * 1.9);
      if (sx > -60 && sx < world.w + 60 && sy > -40 && sy < world.h + 40) {
        const msg = ex.ready ? (meAtExit(world) ? '⌥↑ 다음 판' : '⌥↑ 로 다음 판') : `${ex.need - ex.inside}명 더`;
        text(ctx, msg, sx, sy, { font: '700 13px "Apple SD Gothic Neo", sans-serif', color: ex.ready ? '#8a5bb5' : PENCIL, align: 'center', halo: 3, alpha: ex.ready ? 0.7 + 0.3 * Math.sin(time * 4) : 0.9 });
      }
    }

    // 화면 밖 친구 — 가장자리 화살표 (옷 색 · 이름 · 층 · 몇 칸)
    const me = world.player;
    const ids = [world.mp.myId, ...world.mp.others.keys()].sort((a, c) => a - c);
    for (const o of world.mp.others.values()) {
      if (o.dead && !o.waiting) continue;
      const [sx, sy] = toScreen(o.x, o.groundY - o.air - BLOCK_H / 2);
      const inside = sx > 0 && sx < world.w && sy > 0 && sy < world.h;
      if (inside) continue;
      const color = SHIRTS[(((ids.indexOf(o.id)) % 4) + 4) % 4];
      const ax = Math.max(22, Math.min(world.w - 22, sx)), ay = Math.max(80, Math.min(world.h - 22, sy));
      const ang = Math.atan2(sy - ay, sx - ax);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang);
      stroke(ctx, [[10, 0], [-4, -7], [-4, 7]], { width: 2, color, seed: o.id, amp: 0.4, close: true, halo: false, fill: color });
      ctx.restore();
      const dxT = Math.round(Math.abs(o.x - me.x) / T);
      const floor = Math.max(1, Math.round((o.air) / (9 * T)) + 1);
      const info = `${o.name || '?'} · ${b.h > 24 ? `${floor}층 ` : ''}${dxT}칸`;
      const tx = ax + (sx < ax ? 16 : -16);
      text(ctx, info, tx, ay + 4, { font: '600 11px "Apple SD Gothic Neo", sans-serif', color, align: sx < ax ? 'left' : 'right', halo: 3 });
    }
    if (me.dead) {
      text(ctx, '다시 선다…', world.w / 2, world.h * 0.4, { font: '800 22px "Apple SD Gothic Neo", sans-serif', color: RED, align: 'center', halo: 6, alpha: 0.9 });
    }
  },

  /// 방장이 손님에게 넘길 것. 판 번호 · 되감기 · 시계 · 열쇠 · 스위치 · 누름판 · 상자 · 통 · 넘어가는 중.
  pack(world) {
    const b = world.bag;
    if (!b?.rows) return null;
    return {
      st: b.stage, rs: b.resets, ck: Math.round(b.clock * 100) / 100,
      ks: [...b.opened].join(''), la: b.latched ? 1 : 0, pl: (b.plates.p ? 'p' : '') + (b.plates.q ? 'q' : ''),
      bx: b.boxes.map((x) => [Math.round(x.x), Math.round(x.y)]),
      br: b.barrels.filter((r) => !r.dead).map((r) => [Math.round(r.x), Math.round(r.y), Math.round(r.vx), r.falls]),
      tr: b.tracks.map((t) => [Math.round(t.pos), t.dir ?? 1]),
      rt: [...b.rot].map(([k, r]) => [k, Math.round(r.t * 100) / 100, Math.round(r.gone * 100) / 100]),
      dn: Math.round(b.done * 100) / 100,
    };
  },

  unpack(world, d) {
    const b = world.bag;
    if (!b || !d || typeof d !== 'object') return;
    if (typeof d.st === 'number' && (d.st !== b.stage || !b.rows || d.rs !== b.resets)) {
      const stage = Math.max(0, Math.min(STAGES.length - 1, d.st | 0));
      world.stage = stage;
      loadStage(world, stage);
      b.resets = d.rs | 0;
      placeAt(world, world.player, mySlot(world));
    }
    if (!b.rows) return;
    if (typeof d.ck === 'number') b.clock = d.ck;
    if (typeof d.ks === 'string') b.opened = new Set(d.ks.split('').filter((c) => 'ryb'.includes(c)));
    for (const k of Object.keys(b.keys)) b.keys[k].taken = b.opened.has(k);
    b.latched = !!d.la;
    if (typeof d.pl === 'string') { b.plates.p = d.pl.includes('p'); b.plates.q = d.pl.includes('q'); }
    if (Array.isArray(d.bx)) d.bx.forEach((row, i) => {
      const bx = b.boxes[i];
      if (!bx || !Array.isArray(row) || !row.every(Number.isFinite)) return;
      // 톡 옮기지 않고 녹인다 — 상자가 순간이동하면 밀고 있던 손이 헛돈다
      const dx = row[0] - bx.x, dy = row[1] - bx.y;
      if (Math.abs(dx) > 60 || Math.abs(dy) > 60) { bx.x = row[0]; bx.y = row[1]; }
      else { bx.x += dx * 0.35; bx.y += dy * 0.35; }
    });
    if (Array.isArray(d.br)) {
      b.barrels = d.br.filter((r) => Array.isArray(r) && r.length >= 3 && r.every(Number.isFinite))
        .map((r, i) => ({ x: r[0], y: r[1], vx: r[2], vy: 0, falls: r[3] | 0, dead: false, spin: b.barrels[i]?.spin ?? 0 }));
    }
    if (Array.isArray(d.tr)) d.tr.forEach((row, i) => { if (b.tracks[i] && Array.isArray(row)) { b.tracks[i].pos = row[0]; b.tracks[i].dir = row[1]; } });
    if (Array.isArray(d.rt)) {
      b.rot = new Map();
      for (const row of d.rt) if (Array.isArray(row) && typeof row[0] === 'string' && Number.isFinite(row[1]) && Number.isFinite(row[2])) b.rot.set(row[0], { t: row[1], gone: row[2] });
    }
    if (typeof d.dn === 'number') b.done = d.dn;
  },

  /// 손님의 말. 밀기 부탁 · 출구 ⌥↑ · 손잡기. 손잡기는 방장이 받아 당사자에게 넘긴다.
  message(world, from, msg) {
    const b = world.bag;
    if (!b?.rows) return;
    const host = world.mp.role === 'host';
    if (msg.k === 'push' && host) {
      const i = msg.i | 0, d = Math.sign(msg.d | 0);
      if (i < 0 || i >= b.boxes.length || !d) return;
      (b.pushWants ??= new Map()).set(from, { i, d, t: 0.12 });
      const box = b.boxes[i];
      if (countPushers(world, box, d) >= box.weight) box.px = d;
      return;
    }
    if (msg.k === 'exit' && host) {
      if (exitState(world).ready) b.exitAsk = 0.2;
      return;
    }
    if (msg.k === 'pull') {
      // 당사자에게 왔으면 올라선다. 방장에게 왔으면 당사자에게 넘긴다.
      if (msg.to === world.mp.myId) {
        const p = world.player;
        if (p.dead || !Number.isFinite(msg.x) || !Number.isFinite(msg.air)) return;
        p.x = msg.x; p.air = msg.air; p.vx = 0; p.vy = 0; p.grounded = true; p.onLadder = false;
        say(world, '끌려 올라갔다', 1.2);
      } else if (host && world.mp.others.has(msg.to)) {
        world.send?.({ t: 'gm', k: 'pull', to: msg.to, x: msg.x, air: msg.air }, msg.to);
      }
    }
  },
};

/// 방장이 판을 되감는다 (⌥R 이나 시간 초과). 상자·블록·사람 전부 처음 자리로.
export function rewind(world, why) {
  const b = world.bag;
  const resets = (b.resets ?? 0) + 1;
  const deaths = b.deaths ?? 0;
  loadStage(world, b.stage);
  b.resets = resets; b.deaths = deaths;
  world.bagResets = resets;
  placeAt(world, world.player, mySlot(world));
  say(world, why ? `${why} — 판을 되감았다` : '판을 되감았다', 2.5);
}

export { loadStage, placeAt, exitState, stepObjects, blinkOn, tile, solidTile, floorBelow, bodyBlocked, STAGES };
