// 오목 — **커서 세 모양**을 앱과 같은 코드로 그려서 눈으로 확인한다.
//
// 창을 띄우지 않는다. node-canvas 로 판 한 귀퉁이를 잘라 PNG 로 뽑는다.
//
//   node test/omok-render.mjs                 # 세 장
//   OUT=~/Downloads/... 로 폴더 지정
//
// 보려는 것은 이것뿐이다 — **셋이 한눈에 갈리나.**
//   ① 내 차례          닫힌 네모 + 맥박 + 놓을 돌
//   ② 남의 차례        남은 닫힌 네모 + 이름표, 나는 귀퉁이 갈고리만
//   ③ 같은 편 둘        편 색이 같아도 이름표로 갈린다

import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';

for (const fam of ['Apple SD Gothic Neo', 'Malgun Gothic']) {
  try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: fam }); } catch {}
}

const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const ink = await import(R + 'draw/ink.js');
const omok = (await import(R + 'games/omok.js')).default;
const { layout, put } = await import(R + 'games/omok.js');

const W = 1200, H = 750;
const OUTDIR = process.env.OUT || `${homedir()}/Downloads/몰겜-오목-커서`;
const FR = 1 / 60;
const upright = (cx, cy, fn) => fn();

function make() {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'omok');
  world.onRecord = () => {}; world.onGameOver = () => {}; world.onMenu = () => {};
  w.resize(world, W, H);
  w.spread(world);
  world.state = 'play';
  return world;
}

function join(world, id, name, side) {
  world.mp.others.set(id, { id, name, x: 0, groundY: 0, air: 0, vx: 0, vy: 0,
                            dead: false, waiting: false, deadFor: 0, facing: 1, walk: 0,
                            crouch: 0, grabbing: -1, heldBy: -1, grabAim: 0, slide: 0 });
  (world.mp.omokSides ??= new Map()).set(id, side);
  // **명단을 한 번 돌린다.** 방장의 b.sides 가 비어 있으면 seatsOf 가 아무도 못 찾아서
  // 손님이 알려온 커서를 「차례인 사람이 아니다」로 걷어찬다.
  w.update(world, FR);
  return world.mp.others.get(id);
}

/// 바탕을 **어둡게** 깔고도 그린다. 이 앱은 남의 바탕화면 위에 그려지니, 흰 종이에서만
/// 보이는 것은 보인다고 할 수 없다 — 「옅게 하는 것과 안 보이게 하는 것은 다르다」.
function shot(name, world, time, dark) {
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = dark ? '#2b2f36' : '#f6f5f2';
  ctx.fillRect(0, 0, W, H);
  const boil = ink.boil(time);
  omok.draw(ctx, world, time, boil, upright);
  omok.hud(ctx, world, time, (x, y) => [x, y]);
  // 판만 잘라 낸다 — 커서를 크게 보려고.
  const L = layout(world);
  const pad = 60;
  const cut = createCanvas(L.size + pad * 2, L.size + pad * 2);
  cut.getContext('2d').drawImage(canvas, L.x - pad, L.y - pad, L.size + pad * 2,
                                 L.size + pad * 2, 0, 0, L.size + pad * 2, L.size + pad * 2);
  const file = `${OUTDIR}/${name}.png`;
  writeFileSync(file, cut.toBuffer('image/png'));
  console.log('  ', file);
}

mkdirSync(OUTDIR, { recursive: true });
console.log('오목 커서 —', OUTDIR);

// ① 내 차례 — 닫힌 네모 + 맥박 + 놓을 돌 미리보기
{
  const world = make();
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1; world.team = 0;
  join(world, 2, '손님', 1);
  const b = world.bag;
  put(world, 9, 9, 0); put(world, 10, 10, 1);      // 몇 수 놓아 두고
  b.turn = 0; b.seat = [0, 0];
  b.aim = { x: 8, y: 7 };
  for (let i = 0; i < 6; i++) w.update(world, FR);
  shot('1-내차례', world, 0.31, false);
  shot('1-내차례-어두운바탕', world, 0.31, true);
}

// ② 남의 차례 — 남의 닫힌 네모 + 이름표, 내 커서는 귀퉁이 갈고리만
{
  const world = make();
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1; world.team = 0;
  join(world, 2, '영희', 1);
  const b = world.bag;
  put(world, 9, 9, 0);                             // 내가 뒀으니 이제 하양(영희) 차례
  b.aim = { x: 5, y: 13 };                         // 내 커서는 딴 데
  omok.message(world, 2, { k: 'aim', x: 12, y: 6 });
  for (let i = 0; i < 40; i++) w.update(world, FR);   // 미끄러짐이 닿을 만큼
  shot('2-남의차례', world, 0.31, false);
  shot('2-남의차례-어두운바탕', world, 0.31, true);
}

// ③ 같은 편에 둘 — 편 색이 같아도 이름표로 누구인지 안다
{
  const world = make();
  world.mp.on = true; world.mp.role = 'host'; world.mp.myId = 1; world.team = 0;
  join(world, 2, '철수', 0);                        // 나와 같은 검정 편
  join(world, 3, '영희', 1);
  const b = world.bag;
  put(world, 9, 9, 0);                             // 검1(나) 두고 → 하양
  put(world, 10, 9, 1);                            // 하양 두고 → 검2(철수)
  b.aim = { x: 6, y: 6 };
  omok.message(world, 2, { k: 'aim', x: 11, y: 12 });
  for (let i = 0; i < 40; i++) w.update(world, FR);
  shot('3-같은편-둘', world, 0.31, false);
}

console.log('끝.');
