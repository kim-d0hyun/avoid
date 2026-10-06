// 범퍼카 여러 경우 — 게임 코드 그대로(world.update · press · bumper.draw · hud) 장면마다 키를 눌러 해 보고 영상으로 뽑는다.
// 장면마다 「의도대로 됐나」를 같이 적는다(끝 표). 화면 흔들림도 main.js 처럼 그린다.
//
//   node test/bumper-cases.mjs        # ~/Downloads/몰겜-범퍼카-여러-경우.mp4   (OUT=… · ONLY=2,3)

import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';

for (const fam of ['Apple SD Gothic Neo', 'Malgun Gothic']) {
  try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: fam }); } catch {}
}
let seed = 9;
Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const { games } = await import(R + 'games/index.js');
const game = games.find((g) => g.id === 'bumper');
const B = await import(R + 'games/bumper.js');
const ink = await import(R + 'draw/ink.js');

const W = 1280, H = 600, FPS = 30, SIM = 60;
const OUT = process.env.OUT || `${homedir()}/Downloads/몰겜-범퍼카-여러-경우.mp4`;
const DIR = `${tmpdir()}/molgem-bumper-cases`;
const HAN = '"Apple SD Gothic Neo", sans-serif';

function mkWorld({ watch = false } = {}) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'bumper');
  world.onRecord = () => {}; world.onMenu = () => {};
  world.onGameOver = (r) => { world.ended = r; };
  w.resize(world, W, H); w.pickGame(world, 'bumper');
  if (watch) world.mp.waiting = true;
  world.state = 'play';
  for (let i = 0; i < 2 + 100; i++) w.update(world, 1 / SIM);      // 셋·둘·하나 지나 출발
  return world;
}
const tap = (world, a) => { w.press(world, a, true); w.press(world, a, false); };
const me = (world) => world.bag.cars.find((c) => c.id === world.mp.myId);
const bots = (world) => world.bag.cars.filter((c) => c.id < 0);
/// 차를 놓는다 — 나머지 컴퓨터는 판 구석에 세워 둔다.
function place(world, list) {
  const A = B.arena(world);
  const used = new Set(list.map(([c]) => c));
  let k = 0;
  for (const c of world.bag.cars) {
    c.vx = 0; c.vy = 0; c.spin = 0; c.boostCool = 0; c.braceCool = 0;
    if (c.id < 0) c.still = true;
    if (!used.has(c)) { c.x = -A.R * 0.55 + k * 70; c.y = A.R * 0.62; c.h = -Math.PI / 2; k++; }
  }
  for (const [c, x, y, h] of list) { c.x = x; c.y = y; c.h = h; }
}

const SCENES = [
  {
    title: '살살 부딪히면 살짝 밀린다 — 쿵, 출렁',
    setup(world) { const [b1] = bots(world); place(world, [[me(world), -230, 0, 0], [b1, 0, 0, -Math.PI / 2]]); },
    script(world, f, st) {
      world.input.jump = f < 40;
      st.b ??= bots(world)[0]; st.x0 ??= st.b.x;
      st.wob = Math.max(st.wob ?? 0, st.b.wob ?? 0);
    },
    check(world, st) { return `밀린 거리 ${Math.round(st.b.x - st.x0)}px · 출렁 ${st.wob.toFixed(2)}`; },
  },
  {
    title: '옆구리를 받으면 빙글 돈다',
    setup(world) { const [b1] = bots(world); place(world, [[me(world), -150, 0, 0], [b1, 0, 0, -Math.PI / 2]]); },
    script(world, f, st) {
      if (f === 6) tap(world, 'grab');
      st.b ??= bots(world)[0]; st.h0 ??= st.b.h;
      st.turn = Math.max(st.turn ?? 0, Math.abs(st.b.h - st.h0));
    },
    check(world, st) { return `받힌 차가 ${Math.round(st.turn * 180 / Math.PI)}° 돌았다`; },
  },
  {
    title: '돌진으로 가장자리 차를 밀어 떨어뜨린다',
    setup(world) { const A = B.arena(world); const [b1] = bots(world); place(world, [[me(world), A.R - 260, 0, 0], [b1, A.R - 90, 0, Math.PI]]); },
    script(world, f, st) {
      if (f === 10) tap(world, 'grab'); st.b ??= bots(world)[0];
      st.said = [...new Set([...(st.said ?? []), ...world.bag.words.map((x) => x.word)])];
    },
    check(world, st) { return `${st.b.alive ? '안 떨어졌다' : '떨어뜨렸다'} · 외침 「${st.said.join(' / ')}」`; },
  },
  {
    title: '버티기 — 돌진해 온 차가 거꾸로 튕겨 나간다',
    setup(world) { const [b1] = bots(world); place(world, [[me(world), 60, 0, Math.PI], [b1, -120, 0, 0]]); },
    script(world, f, st) {
      st.b ??= bots(world)[0];
      if (f === 14) B.boost(st.b);
      if (f === 18) tap(world, 'guard');
      st.minVx = Math.min(st.minVx ?? 0, st.b.vx);
      st.myMax = Math.max(st.myMax ?? 0, Math.abs(me(world).vx));
    },
    check(world, st) { return `돌진한 차 가로 빠르기 최저 ${Math.round(st.minVx)} (음수면 튕겨 나감) · 내 차 최대 ${Math.round(st.myMax)}`; },
  },
  {
    title: '버티는 차는 옆구리가 약하다 — 돌아 들어가 민다',
    setup(world) { const [b1] = bots(world); place(world, [[me(world), 0, 150, -Math.PI / 2], [b1, 0, 0, Math.PI]]); },
    script(world, f, st) {
      st.b ??= bots(world)[0];
      if (f === 4) B.brace(st.b);
      if (f === 8) tap(world, 'grab');
      st.y0 ??= st.b.y; st.moved = Math.max(st.moved ?? 0, Math.abs(st.b.y - st.y0));
    },
    check(world, st) { return `버티던 차가 ${Math.round(st.moved)}px 밀렸다`; },
  },
  {
    title: '40초 — 가장자리가 무너진다',
    watch: true,
    setup(world) { world.bag.clock = 43; for (const c of world.bag.cars) c.still = false; },
    script(world, f, st) { st.rk = world.bag.Rk; },
    check(world, st) { return `경기장 반지름 ${Math.round(st.rk * 100)}% 까지`; },
    frames: SIM * 5,
  },
  {
    title: '셋이 엉켜 붙는다 — 컴퓨터끼리 한 판',
    watch: true,
    setup() {},
    script(world, f, st) { st.round ??= world.bag.round; st.done = world.bag.round !== st.round || world.bag.phase === 'end'; },
    check(world, st) { return `${st.done ? '판이 끝났다' : '아직 판 중'} · 점수 ${[...world.bag.score.values()].join(':')}`; },
    frames: SIM * 14,
  },
  {
    title: '다섯 점째 — 게임 끝',
    watch: true,
    setup(world) {
      const A = B.arena(world);
      const [b1, b2, b3] = bots(world);
      world.bag.score.set(b1.id, 4);
      for (const c of [b1, b2, b3]) c.still = true;
      b1.x = A.R - 200; b1.y = 0; b1.h = 0;
      b2.x = A.R - 50; b2.y = 0; b2.h = Math.PI;
      b3.alive = false; b3.fallT = 9;                   // 셋째는 이미 떨어졌다 — 둘 남은 판
    },
    script(world, f) { if (f === 10) B.boost(bots(world)[0]); },
    check(world) { return world.ended ? `게임 끝 — ${world.ended.name} 우승` : `안 끝났다 · 점수 ${[...world.bag.score.values()].join(':')}`; },
    frames: SIM * 3.6,
  },
];

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
let n = 0;
const report = [];
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
SCENES.forEach((sc, i) => {
  if (only && !only.includes(i + 1)) return;
  const world = mkWorld({ watch: !!sc.watch });
  sc.setup(world);
  const st = {};
  const frames = sc.frames ?? SIM * 3.2;
  for (let f = 0; f < frames; f++) {
    sc.script(world, f, st);
    w.update(world, 1 / SIM);
    if (f % (SIM / FPS)) continue;
    ctx.save();
    ctx.fillStyle = '#f6f5f2'; ctx.fillRect(0, 0, W, H);
    if (world.shake > 0) { const s = world.shake * world.shake * 9; ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s); }
    game.draw(ctx, world, f / SIM);
    game.hud(ctx, world, f / SIM);
    ctx.restore();
    ink.paperScrap(ctx, W / 2 - 250, H - 46, 500, 34, 9);
    ink.text(ctx, `${i + 1}. ${sc.title}`, W / 2, H - 23, { font: `800 15px ${HAN}`, color: ink.INK, align: 'center', halo: 0 });
    if (world.ended) ink.text(ctx, `${world.ended.name} 우승!`, W / 2, H * 0.42, { font: `800 40px ${HAN}`, color: ink.RED, align: 'center', halo: 6 });
    writeFileSync(`${DIR}/f${String(n++).padStart(5, '0')}.png`, canvas.toBuffer('image/png'));
  }
  report.push(`${i + 1}. ${sc.title} — ${sc.check(world, st)}`);
});
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${DIR}/f%05d.png`,
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', OUT]);
if (!process.env.KEEP) rmSync(DIR, { recursive: true, force: true });
console.log(`${OUT} — ${n}프레임 · ${(n / FPS).toFixed(1)}초`);
for (const r of report) console.log('  ' + r);
