// 펜싱 실전 녹화 — 게임 코드 그대로(world.update · fence.draw · fence.hud) 컴퓨터 둘을 붙여 15점 한 판을 뽑는다.
//
// 연출이 아니다. 판정·득점등·심판 소리가 다 게임이 낸 것이다. 버그를 눈으로 잡으려고 둔다.
//
//   node test/fence-play.mjs        # ~/Downloads/몰겜-펜싱-실전.mp4   (OUT=... · SEED=... · MAX=초)

import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';

for (const fam of ['Apple SD Gothic Neo', 'Malgun Gothic']) {
  try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: fam }); } catch {}
}
// 컴퓨터가 Math.random 으로 고른다 — 씨앗을 주면 같은 판이 다시 나온다.
let seed = Number(process.env.SEED ?? 11);
Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const { games } = await import(R + 'games/index.js');
const fence = games.find((g) => g.id === 'fence');

const W = 1280, H = 600, FPS = 30, SIM = 60;
const OUT = process.env.OUT || `${homedir()}/Downloads/몰겜-펜싱-실전.mp4`;
const MAX = Number(process.env.MAX ?? 400);
const DIR = `${tmpdir()}/molgem-fence-play`;

const world = w.createWorld({ ms: 0, dodged: 0 }, 'fence');
world.onRecord = () => {}; world.onMenu = () => {};
world.onGameOver = (r) => { world.ended = r; };
w.resize(world, W, H); w.pickGame(world, 'fence');
world.mp.waiting = true;                 // 나는 구경 — 두 편 다 컴퓨터
world.state = 'play';

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
const upright = (x, y, draw) => draw();
let n = 0, tail = 0;
for (let f = 0; f < MAX * SIM && tail < 3 * SIM; f++) {
  w.update(world, 1 / SIM);
  if (world.ended) tail++;
  if (f % (SIM / FPS)) continue;
  const time = f / SIM;
  ctx.fillStyle = '#f6f5f2'; ctx.fillRect(0, 0, W, H);
  fence.draw(ctx, world, time, 0, upright);
  fence.hud(ctx, world, time);
  writeFileSync(`${DIR}/f${String(n++).padStart(5, '0')}.png`, canvas.toBuffer('image/png'));
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${DIR}/f%05d.png`,
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', OUT]);
rmSync(DIR, { recursive: true, force: true });
console.log(`${OUT} — ${n}프레임 · ${(n / FPS).toFixed(1)}초 · ${world.bag.score.join(':')}`);
