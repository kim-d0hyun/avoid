import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { writeFileSync } from 'node:fs';
for (const fam of ['Apple SD Gothic Neo', 'Malgun Gothic']) { try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: fam }); } catch {} }
const R = new URL('../src/', import.meta.url).href;
const { drawStickman, bladeTip } = await import(R + 'draw/stickman.js');
const ink = await import(R + 'draw/ink.js');
// 펜싱 자세를 앱과 같은 그림 코드(stickman.js)로 한 장에 뽑는다. 눈으로 보는 시험.
//   node test/fence-poses.mjs   # ~/Downloads/몰겜-펜싱-자세.png  (OUT=... 로 바꿈)
const OUT = process.env.OUT || `${(await import('node:os')).homedir()}/Downloads/몰겜-펜싱-자세.png`;
const poses = [
  ['앙가르드 · 가운데', { act: null, line: 0 }],
  ['앙가르드 · 위', { act: null, line: 1 }],
  ['앙가르드 · 아래', { act: null, line: -1 }],
  ['찌르기', { act: 'thrust', k: 0.3, line: 0 }],
  ['런지', { act: 'lunge', k: 0.32, line: 0 }],
  ['베기 준비', { act: 'cut', k: 0.44, line: 0 }],
  ['베기 · 내리벤 끝', { act: 'cut', k: 0.62, line: 0 }],
  ['막기 · 위', { act: 'parry', k: 0.25, line: 1 }],
  ['막기 · 가운데', { act: 'parry', k: 0.25, line: 0 }],
  ['막기 · 아래', { act: 'parry', k: 0.25, line: -1 }],
];
const W = 170, H = 190, cols = 5;
const c = createCanvas(W * cols, H * Math.ceil(poses.length / cols)); const ctx = c.getContext('2d');
ctx.fillStyle = '#f6f5f2'; ctx.fillRect(0, 0, c.width, c.height);
poses.forEach(([label, fence], i) => {
  const ox = (i % cols) * W, oy = Math.floor(i / cols) * H;
  const p = { x: ox + 55, groundY: oy + 150, air: 0, vx: 0, vy: 0, crouch: 0, facing: 1, walk: 0, dead: false, fence };
  ctx.strokeStyle = '#999'; ctx.beginPath(); ctx.moveTo(ox + 10, oy + 150); ctx.lineTo(ox + W - 10, oy + 150); ctx.stroke();
  drawStickman(ctx, p, 0, 11 + i, { fence: true, color: '#c62f2a' });
  const t = bladeTip(p);
  ctx.fillStyle = '#1f8a4c'; ctx.beginPath(); ctx.arc(t.x, t.y, 2.5, 0, 6.3); ctx.fill();
  ctx.fillStyle = '#333'; ctx.font = '13px "Apple SD Gothic Neo"'; ctx.fillText(label, ox + 12, oy + 176);
});
writeFileSync(OUT, c.toBuffer('image/png'));
