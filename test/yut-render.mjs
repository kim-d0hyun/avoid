// 윷놀이 — **판과 말이 같은 자리에 있나**를 앱과 같은 코드로 그려서 눈으로 확인한다.
//
// 창을 띄우지 않는다. node-canvas 로 판을 잘라 PNG 로 뽑는다.
//
//   node test/yut-render.mjs            # ~/Downloads/몰겜-윷판.png
//   OUT=... 로 파일 지정
//
// 보려는 것은 이것뿐이다 — **모 넷이 귀퉁이에 있고, 지름길이 그 모에서 시작하나.**
// (밭 자리가 한 칸 밀려 있어서 「걸인데 두 칸만 간다」가 났다.)

import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname } from 'node:path';

for (const fam of ['Apple SD Gothic Neo', 'Malgun Gothic']) {
  try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: fam }); } catch {}
}

const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const ink = await import(R + 'draw/ink.js');
const yut = (await import(R + 'games/yut.js')).default;
const { layout, HOME, CENTER } = await import(R + 'games/yut.js');

const W = 1200, H = 800;
const OUT = process.env.OUT || `${homedir()}/Downloads/몰겜-윷판.png`;
const upright = (cx, cy, fn) => fn();

const world = w.createWorld({ ms: 0, dodged: 0 }, 'yut');
world.onRecord = () => {}; world.onGameOver = () => {}; world.onMenu = () => {};
w.resize(world, W, H);
w.spread(world);
world.state = 'play';
const b = world.bag;
// 길목마다 말을 하나씩 놓는다 — 집 · 첫 밭 · 첫 모 · 지름길 · 방 · 긴 대각선 · 출발 직전.
const spots = [HOME, 1, 5, 21, CENTER, 23, 20];
b.men.forEach((m, i) => { m.at = spots[i % spots.length]; m.on = -1; m.done = false; });

const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#efece6';
ctx.fillRect(0, 0, W, H);
yut.draw(ctx, world, 0.3, ink.boil(0.3), upright);
yut.hud?.(ctx, world, 0.3, (x, y) => [x, y]);

// 던지는 자리도 한 장 — **표 있는 짝**이 보여야 빽도를 알아본다.
{
  const b2 = world.bag;
  b2.phase = 'pick';
  b2.fly = 9;
  b2.roll = { name: '빽도', steps: -1, nak: false, flats: 1, back: true,
              sticks: [0, 1, 2, 3].map((i) => ({ flat: i === 0, turns: 3 + i * 0.3,
                                                 lane: (i - 1.5) * 0.062, dist: 0.5 + i * 0.07, spin: 3 })) };
  const c2 = createCanvas(W, H);
  const g2 = c2.getContext('2d');
  g2.fillStyle = '#efece6'; g2.fillRect(0, 0, W, H);
  yut.draw(g2, world, 0.3, ink.boil(0.3), upright);
  const L2 = layout(world);
  const cut2 = createCanvas(L2.matW * 1.15, L2.matW * 0.8);
  cut2.getContext('2d').drawImage(c2, L2.matX - L2.matW * 0.08, L2.matY - L2.matW * 0.4,
                                  L2.matW * 1.15, L2.matW * 0.8, 0, 0, L2.matW * 1.15, L2.matW * 0.8);
  const OUT2 = OUT.replace(/\.png$/, '-윷짝.png');
  writeFileSync(OUT2, cut2.toBuffer('image/png'));
  console.log('던지는 자리 —', OUT2);
  b2.phase = 'charge'; b2.roll = null;
}

const L = layout(world);
const pad = L.size * 0.22;
const cut = createCanvas(L.size + pad * 2, L.size + pad * 2);
cut.getContext('2d').drawImage(canvas, L.x - pad, L.y - pad, L.size + pad * 2, L.size + pad * 2,
                               0, 0, L.size + pad * 2, L.size + pad * 2);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, cut.toBuffer('image/png'));
console.log('윷판 —', OUT);
