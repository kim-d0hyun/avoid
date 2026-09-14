// 두 명이 무거운 상자를 같이 미는 걸 **실제 엔진 + 실제 네트워크 경로 + 충돌 켠 채** 렌더해 mp4 로.
// 방장(1)이 앞, 손님(2)이 뒤. 각자 자기 세상을 굴리고 꾸러미를 주고받는다. 방장 세상을 그린다(상자는 방장 것).
// 매 프레임 미는 사람 수와 상자 위치를 stderr 로 찍는다.
//   GAME=trio STAGE=유령열차 node test/push-demo.mjs
import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
for (const f of ['Apple SD Gothic Neo', 'Gothic A1', 'IBM Plex Mono']) { try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: f }); } catch {} }
import { w, coop, coopMod, T, DT, makeWorld, puppet, GAME } from './coop-bot.mjs';
const ink = await import(new URL('../src/draw/ink.js', import.meta.url).href);
const block = await import(new URL('../src/draw/block.js', import.meta.url).href);
const netjs = await import(new URL('../src/game/net.js', import.meta.url).href);
const shirtColor = ink.shirtColor, HALF = 17;
const STAGE = process.env.STAGE || (GAME === 'trio' ? '유령열차' : '옥상');
const LAG = Math.max(0, +(process.env.LAG ?? 2));

const A = makeWorld(STAGE, { id: 1 }); A.bump = true;   // 방장 앞
const B = makeWorld(STAGE, { id: 2 }); B.bump = true;   // 손님 뒤
const bx = A.bag.boxes.find((x) => x.weight === 2);
if (!bx) { console.error('무거운 상자 없음'); process.exit(1); }
const fyRow = Math.round(bx.y / T) - 1;
const front = bx.x - (T / 2 + HALF + 0.5), back = front - (2 * HALF + 2);
A.player.x = front; A.player.air = A.groundY - (fyRow + 1) * T; A.player.grounded = true;
B.player.x = back;  B.player.air = B.groundY - (fyRow + 1) * T; B.player.grounded = true;
const shell = { net: { send() {} }, log() {} }, api = { setSize() {}, restart() {} };
const queue = []; let frame = 0;
for (const [wd, jd] of [[A, 2], [B, 1]]) { wd.mp.rtt = 2 * LAG * DT; wd.mp.names.set(jd, `${jd}번`); wd.mp.others.set(jd, puppet(wd, jd, 0, wd.groundY)); }
for (const wd of [A, B]) wd.send = (m, to) => { const tgt = wd.mp.role === 'host' ? String(to) : '1'; const t = tgt === '1' ? A : B; queue.push({ due: frame + LAG, to: t, from: wd.mp.myId, msg: JSON.parse(JSON.stringify(m)) }); };
const packetOf = (wd) => { const p = wd.player, r1 = (v) => Math.round(v * 10) / 10; return ['p', r1(p.x), r1(p.vx), r1(p.air), r1(p.vy), Math.round(p.crouch * 100) / 100, p.facing, p.dead ? 1 : 0, p.grabbing, p.escapes, wd.dodged]; };
function step(ai, bi) {
  Object.assign(A.input, { left: false, right: false, jump: false, duck: false }, ai);
  Object.assign(B.input, { left: false, right: false, jump: false, duck: false }, bi);
  w.update(A, DT); w.update(B, DT);
  queue.push({ due: frame + LAG, to: A, from: 2, msg: packetOf(B) });
  const players = [[1, ...packetOf(A).slice(1)]];
  const o = A.mp.others.get(2); players.push([2, o.baseX, o.vx, o.baseAir, o.vy, o.tcrouch, o.facing, o.state ?? 0, o.grabbing, o.escapes, o.dodged ?? 0, Math.round(o.age * 1000) / 1000]);
  queue.push({ due: frame + LAG, to: B, from: 1, msg: JSON.stringify({ t: 's', ms: 0, st: 'play', r: 0, pl: players, vw: Math.round(A.w), vh: Math.round(A.h), g: A.gameId, h: 1, x: coop.pack(A) }) });
  const rest = []; for (const it of queue) { if (it.due > frame) { rest.push(it); continue; } netjs.handleMessage(it.to, shell, it.from, typeof it.msg === 'string' ? JSON.parse(it.msg) : it.msg, api); }
  queue.length = 0; queue.push(...rest);
  frame++;
}

// 렌더 — 상자 둘레를 크게. 방장 세상.
const W = 720, H = 420, vw = 13 * T, vh = vw * H / W, k = W / vw;
const canvas = createCanvas(W, H), ctx = canvas.getContext('2d');
const dir = '/private/tmp/push-demo'; rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
let shot = 0;
function draw() {
  const time = frame / 60, boil = ink.boil(time);
  const camx = Math.max(0, bx.x - vw * 0.55), camy = Math.max(0, (fyRow + 1) * T - vh * 0.72);
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#f6f5f2'; ctx.fillRect(0, 0, W, H);
  ctx.setTransform(k, 0, 0, k, -camx * k, -camy * k);
  coop.draw(ctx, A, time, boil, (cx, cy, fn) => fn());
  const o = A.mp.others.get(2);
  block.drawBlock(ctx, o, time, boil, { name: '2번(손님)', color: shirtColor(2), mark: 2 });
  block.drawBlock(ctx, A.player, time, boil, { name: '1번(방장)', mine: true, color: shirtColor(1), mark: 1, crown: true });
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ink.text(ctx, `무거운 상자 — 둘이 같이 (${STAGE})`, W / 2, 26, { font: '700 15px "Apple SD Gothic Neo", sans-serif', color: '#141210', align: 'center', halo: 4 });
  writeFileSync(`${dir}/f${String(shot++).padStart(5, '0')}.png`, canvas.toBuffer('image/png'));
}

const x0 = bx.x, dirPush = Math.sign((A.bag.boxes.find((z) => z.weight === 2), (fyRow, 1)));  // 오른쪽으로
// 1) 앞뒤로 걸어와 붙는다 (1초), 2) 둘이 오른쪽으로 민다 (4초)
for (let i = 0; i < 30; i++) { step({}, { right: true }); if (i % 2 === 0) draw(); }
const log = [];
for (let i = 0; i < 300; i++) {
  step({ right: true }, { right: true });
  if (i % 2 === 0) draw();
  if (i % 30 === 0) log.push(`t${(i / 60).toFixed(1)}s 상자 ${((bx.x - x0) / T).toFixed(2)}칸 · 앞 ${(A.player.x / T).toFixed(1)} 뒤 ${(B.player.x / T).toFixed(1)} · px=${bx.px ?? 0}`);
}
console.error(log.join('\n'));
console.error(`상자 총 ${((bx.x - x0) / T).toFixed(2)}칸 이동 · 뒷사람 ${((B.player.x - back) / T).toFixed(2)}칸`);
const out = `${homedir()}/Downloads/몰겜-무거운상자-둘이-밀기.mp4`;
execFileSync('ffmpeg', ['-y', '-framerate', '30', '-i', `${dir}/f%05d.png`, '-vf', 'scale=720:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', out], { stdio: 'ignore' });
rmSync(dir, { recursive: true, force: true });
console.log('영상 →', out, '·', shot, '장');
