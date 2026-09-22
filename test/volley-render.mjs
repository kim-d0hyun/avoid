// 배구 — **자리마다 스파이크가 어디로 가나**를 앱과 같은 코드로 그려 영상으로 뽑는다.
//
// 창을 띄우지 않는다. node-canvas 로 한 프레임씩 그려 ffmpeg 에 붙인다.
//
//   node test/volley-render.mjs              # ~/Downloads/몰겜-배구-스파이크.mp4
//   OUT=... 로 파일 지정
//
// 보려는 것은 이것뿐이다 — **가운데에서 때린 공이 네트를 넘나.**
//   ① 가운데(x 500)에서 강타   예전에는 제 코트 바닥에 꽂혔다
//   ② 네트 앞(x 720)에서 강타  꽂기는 그대로 산다
//   ③ 네트 앞에서 ⌥↑ 페인트    위쪽 키로도 얹힌다

import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';

for (const fam of ['Apple SD Gothic Neo', 'Malgun Gothic']) {
  try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: fam }); } catch {}
}

const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const ink = await import(R + 'draw/ink.js');
const volley = (await import(R + 'games/volley.js')).default;
const { spike, tipHit } = await import(R + 'games/volley.js');
const { BODY_H, drawStickman } = await import(R + 'draw/stickman.js');

const W = 1512, H = 620;
const FR = 1 / 60;
const OUT = process.env.OUT || `${homedir()}/Downloads/몰겜-배구-스파이크.mp4`;
const DIR = `${tmpdir()}/molgem-volley-render`;
const upright = (cx, cy, fn) => fn();

function make(x) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'volley');
  world.onRecord = () => {}; world.onGameOver = () => {}; world.onMenu = () => {};
  w.resize(world, W, H);
  w.spread(world);
  world.state = 'play';
  world.team = 0;
  const b = world.bag;
  b.started = true; b.wait = 0; b.serving = false;
  world.player.x = x; world.player.facing = 1;
  // 공을 **몸 옆** 머리 위로 올려 둔다 — 떨어지는 걸 기다려 때린다.
  // 몸 앞이면 손보다 밑으로 내려오기 전에 몸에 맞아 저절로 떠오른다(자동 받기).
  b.ball.x = x + 62; b.ball.y = world.groundY - 300; b.ball.vx = 0; b.ball.vy = 0;
  return world;
}

let n = 0;
function frame(world, t, label) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#efece6';
  ctx.fillRect(0, 0, W, H);
  const boil = ink.boil(t);
  volley.draw(ctx, world, t, boil, upright);
  // 사람은 게임이 아니라 main.js 가 그린다 — 여기서도 같은 순서로 그려 준다.
  drawStickman(ctx, world.player, t, boil, { mine: true, color: volley.shirt?.(world, world.player.x, 0) });
  volley.hud?.(ctx, world, t, (x, y) => [x, y]);
  ink.text(ctx, label, W / 2, 48, { font: `700 26px "Apple SD Gothic Neo"`, color: ink.INK, align: 'center' });
  writeFileSync(`${DIR}/${String(n++).padStart(4, '0')}.png`, canvas.toBuffer('image/png'));
}

/// 한 장면. 공이 손 높이로 떨어지기를 기다려 뛰고, 손밑에 왔을 때 때린다 — 사람이 하는 대로.
function scene(x, label, how) {
  const world = make(x);
  const b = world.bag;
  const p = world.player;
  let hit = false;
  for (let i = 0; i < 200; i++) {
    const hand = p.groundY - p.air - BODY_H * 0.86;
    // 공이 머리 위 120px 까지 오면 뛴다
    if (!hit && p.air <= 0 && b.ball.y > hand - 150) world.input.jump = true;
    if (p.air > 30) world.input.jump = false;
    // 손보다 조금 밑에 온 순간에 때린다 — 꽂는 각이 나오는 자리다.
    if (!hit && p.air > 20 && b.ball.y - hand > 12 && b.ball.y - hand < 34) {
      hit = how(world);
      if (hit) { b.stop = 0; b.stopHold = 0; }     // 히트스톱은 영상에서만 걷어낸다
    }
    const spot = Math.round(b.ball.x);
    const was = (b.score ?? [0, 0]).join();
    w.update(world, FR);
    frame(world, i * FR, label);
    // 공이 바닥에 닿으면 점수가 난다 — 그 자리를 적고 조금 더 보여 주고 끝낸다.
    if (hit && (b.score ?? [0, 0]).join() !== was) {
      for (let k = 0; k < 30; k++) { w.update(world, FR); frame(world, (i + k) * FR, label); }
      return `${label} → ${spot} ${spot > W / 2 ? '(상대 코트)' : '(자책)'}`;
    }
  }
  return `${label} → 안떨어짐`;
}

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
console.log(scene(500, '가운데에서 강타 — 네트를 넘어간다', (world) => spike(world)));
// 네트 앞은 690 까지다 — 공을 몸 옆(+62)에 두니 그보다 앞이면 공이 네트를 넘어가 버린다.
console.log(scene(690, '네트 앞에서 강타 — 꽂는다', (world) => spike(world)));
console.log(scene(680, '네트 앞에서 ⌥↑ — 페인트', (world) => tipHit(world)));
execFileSync('ffmpeg', ['-y', '-framerate', '60', '-i', `${DIR}/%04d.png`,
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', OUT],
             { stdio: ['ignore', 'ignore', 'pipe'] });
console.log('영상 —', OUT);
