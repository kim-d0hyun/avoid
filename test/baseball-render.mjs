// 야구 — 봇이 실제로 한 판을 하는 동안 **앱과 같은 코드로** 그려서 영상과 장면을 뽑는다.
//
// 창을 띄우지 않는다. node-canvas 로 프레임을 찍고 ffmpeg 로 이어 붙인다.
//
//   node test/baseball-render.mjs            # 한 경기 영상
//   FRAMES=2400 node test/baseball-render.mjs  # 2400장(20fps 로 2분)까지만
//   SHOTS=1 node test/baseball-render.mjs    # 장면 몇 장만 PNG 로
//   OUT=~/Downloads/... 로 폴더 지정

import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

for (const fam of ['Apple SD Gothic Neo', 'Malgun Gothic']) {
  try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: fam }); } catch {}
}
for (const fam of ['American Typewriter', 'Courier New']) {
  try { registerFont('/System/Library/Fonts/Supplemental/Courier New Bold.ttf', { family: fam, weight: 'bold' }); } catch {}
  try { registerFont('/System/Library/Fonts/Supplemental/Courier New.ttf', { family: fam }); } catch {}
}

const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const ink = await import(R + 'draw/ink.js');
const bb = await import(R + 'games/baseball.js');
const { makeHands } = await import('./baseball-hands.mjs');

const W = +(process.env.W ?? 1200), H = +(process.env.H ?? 750);
const OUTDIR = process.env.OUT || `${homedir()}/Downloads/몰겜-야구`;
const STEP = 3;                                   // 세 프레임에 한 장 (60 → 20fps)
const upright = (cx, cy, fn) => fn();

function make() {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'ball');
  world.onRecord = () => {}; world.onGameOver = () => {}; world.onMenu = () => {};
  w.resize(world, W, H);
  w.spread(world);
  world.state = 'play';
  return world;
}

function frame(ctx, world, time) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#f6f5f2';
  ctx.fillRect(0, 0, W, H);
  const boil = ink.boil(time);
  bb.default.draw(ctx, world, time, boil, upright);
  bb.default.hud(ctx, world, time, (x, y) => [x, y]);
}

if (process.env.SHOTS) {
  // 판이 흘러가는 동안 「무슨 일이 벌어지는 순간」마다 한 장씩 남긴다.
  const world = make();
  const hands = makeHands(world);
  const ctx = createCanvas(W, H).getContext('2d');
  const dir = process.env.OUT || '/tmp/야구장면';
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const b = world.bag;
  let f = 0, shot = 0, want = ['조준', '투구', '타격', '뜬공', '땅볼', '홈런', '주루', '판정', '송구'];
  const seen = new Set();
  const save = (name) => {
    if (seen.has(name)) return;
    seen.add(name);
    frame(ctx, world, f / 60);
    writeFileSync(`${dir}/${String(++shot).padStart(2, '0')}-${name}.png`, ctx.canvas.toBuffer('image/png'));
  };
  while (f < 60 * 900 && seen.size < want.length) {
    hands(1 / 60); w.update(world, 1 / 60); f++;
    if (!b.pitch && !b.play && b.wait <= 0 && bb.amPitching(world)) save('조준');
    if (b.pitch && b.pitch.t > 0.12 && b.pitch.t < b.pitch.dur * 0.75) save('투구');
    if (b.batT > 0.29) save('타격');
    if (b.play?.kind === 'fly' && b.play.t > 1.0) save('뜬공');
    if (b.play?.kind === 'grounder' && b.play.t > 0.8) save('땅볼');
    if (b.play?.kind === 'homer' && b.play.t > 1.4) save('홈런');
    if (b.play && b.play.hops.some((h) => h.k === 'throw' && b.play.t > h.t0 + 0.12 && b.play.t < h.t1 - 0.05)) save('송구');
    if (b.call?.big && b.play) save('판정');
    if (b.play && b.play.runs.length > 1 && b.play.t > 1.2) save('주루');
  }
  // **몸에 맞는 공은 1%짜리**라 한 경기에서 한 번도 안 나올 수 있다. 따로 한 장 만든다 —
  // 홈에 붙어 선 타자에게 조준 한계까지 몸쪽으로 던지고, 제구가 밀리기를 기다린다.
  {
    const w2 = make(); const c = w2.bag;
    for (let i = 0; i < 600 && !c.hitBy; i++) {
      c.pitch = null; c.play = null; c.wait = 0; c.stand = 1;
      c.aim.x = -bb.AIM_OUT; c.aim.y = 0; c.type = 0;
      bb.default.action(w2);
      for (let k = 0; k < 90 && !c.hitBy; k++) w.update(w2, 1 / 60);
    }
    if (c.hitBy) {
      for (let k = 0; k < 6; k++) w.update(w2, 1 / 60);
      frame(ctx, w2, 0);
      writeFileSync(`${dir}/${String(++shot).padStart(2, '0')}-데드볼.png`, ctx.canvas.toBuffer('image/png'));
    }
  }
  // **타자 차례**는 봇이 말(1회 말)에 가서야 오므로 따로 한 장 만든다 — 미트가 보이는 장면.
  {
    const w3 = make(); const c = w3.bag;
    c.half = 1;                                  // 말 — 내가 친다
    c.wait = 0; c.mitt = { x: -0.55, y: 0.5 }; c.stand = 0.55;
    for (let k = 0; k < 60 * 30 && !(c.pitch && c.pitch.t > c.pitch.dur * 0.55); k++) {
      w.update(w3, 1 / 60);
      c.mitt = { x: -0.55, y: 0.5 }; c.stand = 0.55;
    }
    if (c.pitch) {
      frame(ctx, w3, 0);
      writeFileSync(`${dir}/${String(++shot).padStart(2, '0')}-미트.png`, ctx.canvas.toBuffer('image/png'));
    }
  }
  console.log(`${shot}장 → ${dir}`);
} else {
  const world = make();
  const hands = makeHands(world);
  const ctx = createCanvas(W, H).getContext('2d');
  const dir = '/private/tmp/ball-render';
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  mkdirSync(OUTDIR, { recursive: true });
  const b = world.bag;
  let f = 0, shot = 0;
  const cap = +(process.env.SECONDS ?? 0) * 60;
  const most = +(process.env.FRAMES ?? 0);          // 이만큼 찍고 그만둔다 (영상 길이 자르기)
  // **공 사이의 빈 시간은 안 찍는다.** 한 경기가 5분인데 그중 절반이 다음 공을 기다리는
  // 시간이라, 그대로 이어 붙이면 보는 사람이 멎은 화면만 본다. 판은 그대로 굴리고
  // 찍기만 건너뛴다 — 움직임은 늘 제 속도로 흐른다.
  const dull = () => !b.pitch && !b.play;
  while (!b.over && f < (cap || 60 * 900) && !(most && shot >= most)) {
    hands(1 / 60); w.update(world, 1 / 60); f++;
    if (f % STEP || dull()) continue;
    frame(ctx, world, f / 60);
    writeFileSync(`${dir}/f${String(shot++).padStart(5, '0')}.png`, ctx.canvas.toBuffer('image/png'));
  }
  // 끝난 뒤 잠깐 더 — 마지막 점수를 보여 준다.
  for (let i = 0; i < 90; i++) {
    w.update(world, 1 / 60); f++;
    if (f % STEP) continue;
    frame(ctx, world, f / 60);
    writeFileSync(`${dir}/f${String(shot++).padStart(5, '0')}.png`, ctx.canvas.toBuffer('image/png'));
  }
  const out = `${OUTDIR}/야구-${b.score[0]}대${b.score[1]}.mp4`;
  execFileSync('ffmpeg', ['-y', '-framerate', '20', '-i', `${dir}/f%05d.png`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '21', out], { stdio: 'ignore' });
  rmSync(dir, { recursive: true, force: true });
  console.log(`${shot}장 · ${(f / 60 / 60).toFixed(1)}분 · ${b.note} → ${out}`);
}
