// 넷이서 — 봇 재생을 **실제 그림으로** 렌더해 판마다 mp4 를 만든다.
//
// coop-play.mjs 의 인형 세상(방장 하나에 나머지 셋을 세운다)이 열네 판을 다 깬다. 여기서는 그 재생을
// node-canvas 로 게임 그림 그대로 그려 프레임을 뽑고, ffmpeg 로 판마다 영상을 만든다. 그림은 앱과 같은
// 코드(coop.draw · block.js · ink.js)를 쓴다 — 창을 띄우지 않고도 실제로 보이는 대로 나온다.
//
//   node test/coop-render.mjs            # 열네 판 다
//   STAGE=옥상 node test/coop-render.mjs  # 한 판만
//   OUT=~/Downloads/... 로 폴더 지정

import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
// 한글 글자판이 네모로 안 나오게 시스템 폰트를 게임이 부르는 이름으로 등록한다.
for (const fam of ['Apple SD Gothic Neo', 'Gothic A1', 'IBM Plex Sans KR', 'IBM Plex Mono']) {
  try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: fam }); } catch {}
}

const R = new URL('../src/', import.meta.url).href;
const world = await import(R + 'game/world.js');
const coopMod = await import(R + 'games/coop.js');
const coop = coopMod.default;
const ink = await import(R + 'draw/ink.js');
const block = await import(R + 'draw/block.js');
const { T, STAGES } = coopMod;
const bot = await import('./coop-bot.mjs');
const { PuppetSim } = await import('./coop-play-sim.mjs');

const OUTDIR = process.env.OUT || `${homedir()}/Downloads/몰겜-넷이서-상황`;
const ONLY = process.env.STAGE;
const W = 900, H = 540;                       // 영상 크기
const VIEW_TILES = 22;                        // 가로로 보이는 칸 수
const vw = VIEW_TILES * T, vh = vw * H / W;   // 카메라가 보는 판 픽셀
const k = W / vw;                             // 판 픽셀 → 화면 픽셀
const STEP = 3;                               // 세 프레임에 한 장 (60→20fps)
const shirtColor = ink.shirtColor;
const upright = (cx, cy, fn) => fn();

function renderFrame(ctx, sim, time) {
  const w = sim.host;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#f6f5f2'; ctx.fillRect(0, 0, W, H);
  const boil = ink.boil(time);
  // 판 안 — 카메라를 잡고 그 만큼 옮겨 그린다
  const cam = coop.camera(w, vw, vh) ?? { x: 0, y: 0 };
  ctx.save();
  ctx.setTransform(k, 0, 0, k, -cam.x * k, -cam.y * k);
  coop.draw(ctx, w, time, boil, upright);
  // 사람 — 남(인형)들 먼저, 내 사람 맨 위. 넷이서는 네모(drawBlock).
  const ids = [w.mp.myId, ...w.mp.others.keys()].sort((a, b) => a - b);
  const markOf = (id) => ((id % 4) + 4) % 4;
  const hostId = w.mp.role === 'host' ? w.mp.myId : w.mp.hostId;
  for (const o of w.mp.others.values()) {
    block.drawBlock(ctx, o, time, boil, { name: o.name, faded: o.dead,
      color: shirtColor(o.id), mark: markOf(o.id), crown: o.id === hostId });
  }
  const me = w.player;
  block.drawBlock(ctx, me, time, boil, { name: w.mp.myName, mine: true,
    crown: w.mp.role === 'host', mark: markOf(w.mp.myId), color: shirtColor(w.mp.myId) });
  ctx.restore();
  // 글자판 — 화면 좌표. 판 이름·출구 안내·화면 밖 친구 화살표.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const hud = { ...w, w: W, h: H };
  const toScreen = (wx, wy) => [(wx - cam.x) * k, (wy - cam.y) * k];
  coop.hud?.(ctx, hud, time, toScreen);
}

function renderStage(stage) {
  const sim = new PuppetSim(stage.name);
  const dir = `/private/tmp/coop-render-${stage.name}`;
  rmSync(dir, { recursive: true, force: true }); mkdirSync(dir, { recursive: true });
  const ctx = createCanvas(W, H).getContext('2d');
  let shot = 0, tick = 0;
  const canvasOf = ctx.canvas;
  sim.onStep = () => {
    if (tick++ % STEP) return;
    renderFrame(ctx, sim, sim.frames / 60);
    execWrite(canvasOf, `${dir}/f${String(shot++).padStart(5, '0')}.png`);
  };
  const r = bot.play(stage, bot.MOVES.find((m) => m.name === stage.name).moves, sim);
  // 끝나고 잠깐 더 (마지막 자리 보여 주기)
  for (let i = 0; i < 20; i++) sim.step(sim.host, {});
  return { ok: r.ok, dir, shot, fail: r.ok ? null : r.err?.split('\n')[0] };
}

// node-canvas 는 toBuffer 로 png 를 준다
import { writeFileSync } from 'node:fs';
function execWrite(canvas, path) { writeFileSync(path, canvas.toBuffer('image/png')); }

// ── 돌리기 ──
mkdirSync(OUTDIR, { recursive: true });
const WORLD_NAMES = ['뒷마당', '학교', '도시', '지하철'];
const made = [];
for (const s of STAGES) {
  if (ONLY && s.name !== ONLY) continue;
  const idx = STAGES.indexOf(s);
  const no = `${WORLD_NAMES.indexOf(s.world) + 1}-${STAGES.filter((t, i) => t.world === s.world && i <= idx).length}`;
  process.stdout.write(`${no} ${s.name} … `);
  const r = renderStage(s);
  if (!r.ok) { console.log(`✗ ${r.fail} (프레임 ${r.shot})`); continue; }
  const out = `${OUTDIR}/${no}-${s.name}.mp4`;
  execFileSync('ffmpeg', ['-y', '-framerate', '20', '-i', `${r.dir}/f%05d.png`,
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', out], { stdio: 'ignore' });
  rmSync(r.dir, { recursive: true, force: true });
  console.log(`✓ ${r.shot}장 → ${out.split('/').pop()}`);
  made.push(out);
}
console.log(`\n${made.length}판 영상 → ${OUTDIR}`);
