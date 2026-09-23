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

const L = layout(world);
const pad = L.size * 0.22;
const cut = createCanvas(L.size + pad * 2, L.size + pad * 2);
cut.getContext('2d').drawImage(canvas, L.x - pad, L.y - pad, L.size + pad * 2, L.size + pad * 2,
                               0, 0, L.size + pad * 2, L.size + pad * 2);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, cut.toBuffer('image/png'));
console.log('윷판 —', OUT);
