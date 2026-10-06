// 배구 캐릭터 재연 — 열 명의 스킬을 게임 코드 그대로(world.update · press · volley.draw · figure) 한 장면씩 해 보고
// 영상으로 뽑는다. 사람이 하듯 키를 눌러서 한다(공을 손으로 옮기지 않는다 — 처음 놓는 자리만 정한다).
//
//   node test/volley-cast-play.mjs        # ~/Downloads/몰겜-배구-캐릭터-재연.mp4   (OUT=… · ONLY=kkang …)
//
// 장면마다 「의도대로 됐나」를 같이 적는다(마지막 줄 표). 시험이 아니라 눈으로 보는 재연이다.

import './dom-stub.mjs';
import { createCanvas, registerFont } from 'canvas';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { homedir, tmpdir } from 'node:os';

for (const fam of ['Apple SD Gothic Neo', 'Malgun Gothic']) {
  try { registerFont('/System/Library/Fonts/Supplemental/AppleGothic.ttf', { family: fam }); } catch {}
}
let seed = 5;
Math.random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const { games } = await import(R + 'games/index.js');
const volley = games.find((g) => g.id === 'volley');
const C = await import(R + 'games/volley-cast.js');
const ink = await import(R + 'draw/ink.js');

const W = 1280, H = 600, FPS = 30, SIM = 60;
const OUT = process.env.OUT || `${homedir()}/Downloads/몰겜-배구-캐릭터-재연.mp4`;
const DIR = `${tmpdir()}/molgem-volley-cast`;
const HAN = '"Apple SD Gothic Neo", sans-serif';
const G = 2180 * 0.66 * 0.66;

function mkWorld(cast) {
  const world = w.createWorld({ ms: 0, dodged: 0 }, 'volley');
  world.onRecord = () => {}; world.onGameOver = () => {}; world.onMenu = () => {};
  w.resize(world, W, H); world.state = 'ready'; w.spread(world);
  world.mp.myCast = cast; world.team = 0;
  world.state = 'play';
  volley.update(world, 1 / SIM);
  const b = world.bag;
  b.started = true; b.wait = 0; b.serving = false; b.mustCross = null;
  for (let i = 0; i < 3; i++) w.update(world, 1 / SIM);
  b.serving = false; b.wait = 0;
  return world;
}
const press = (world, a, d) => w.press(world, a, d);
const tap = (world, a) => { press(world, a, true); press(world, a, false); };

/// 공이 손 높이(hitY)로 **내려오는** 자리와 시간 — 실제 셈(중력·탑스핀·저항·옆벽)대로 날려 본다.
function predict(world, hitY) {
  const ball = world.bag.ball;
  let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy, t = 0;
  const g = G * (ball.topspin ? 1.45 : 1);
  for (let i = 0; i < 600; i++) {
    const dt = 1 / 120;
    vy += g * dt;
    const sp = Math.hypot(vx, vy), lose = Math.min(0.5, 0.00017 * sp * dt * (ball.hot > 0 ? 0.4 : 1));
    vx -= vx * lose; vy -= vy * lose;
    x += vx * dt; y += vy * dt; t += dt;
    if (x < 20) { x = 40 - x; vx = -vx; }
    if (x > world.w - 20) { x = 2 * (world.w - 20) - x; vx = -vx; }
    if (vy > 0 && y >= hitY) return { x, t };
  }
  return { x, t: 9 };
}

/// 사람처럼 친다 — 떨어질 자리 뒤에 서서, 내려오는 공에 맞춰 뛰고, 손이 닿으면 누른다.
/// mode: 'spike'(뛰어서 강타 · 오른쪽으로 세게) · 'toss'(땅에서 받기) · 'drop'(뛰어서 ⌥X)
function hitter(world, mode, { lead = 26, jumpAt = 0.3, keys = 'right' } = {}) {
  let wait = 0, jumped = false;
  return () => {
    const p = world.player, b = world.bag, ball = b.ball;
    wait--;
    const net = world.w / 2;
    const hand = mode === 'toss' ? 55 : 110;
    const pr = predict(world, world.groundY - hand);
    const want = Math.min(net - 34, pr.x - lead);
    world.input.right = want - p.x > 6;
    world.input.left = want - p.x < -6;
    if (mode !== 'toss' && !jumped && p.air <= 0 && ball.vy > -100 && pr.t < jumpAt && Math.abs(pr.x - lead - p.x) < 50) {
      world.input.jump = true; jumped = true;
    } else world.input.jump = false;
    const hx = p.x, hy = p.groundY - p.air - 60;
    const d = Math.hypot(ball.x - hx, ball.y - hy);
    // 손이 닿는 거리는 캐릭터마다 다르다(받기 능력치) — 사람도 제 캐릭터 손 길이를 안다.
    const reach = 72 * (p.reachMul ?? 1);
    const ready = mode === 'toss' ? p.air <= 0 && ball.vy > 0 && d < reach - 4 : p.air > 20 && d < reach;
    if (ready && wait <= 0 && ball.x < net + 10) {
      if (mode === 'drop') tap(world, 'drop');
      else { world.input.right = keys === 'right'; tap(world, 'grab'); }
      wait = 20;
      return 'hit';
    }
    return null;
  };
}

// ── 장면 — 놓는 자리 · 누르는 키 · 「의도대로 됐나」 재는 것 ──
const SCENES = {
  dubu: {
    title: '두부 · 말랑 받기 — 받은 공이 네트 앞 때리기 좋은 자리로',
    setup(world) { const b = world.bag; world.player.x = 330; b.ball.x = 900; b.ball.y = 200; b.ball.vx = -470; b.ball.vy = -250; },
    script(world, f, st) {
      if (f === 5) { world.bag.gauge.set(0, 4); tap(world, 'guard'); }
      if (!st.toss) st.toss = hitter(world, 'toss', { lead: 0 });
      if (!st.tossed) { if (st.toss() === 'hit') { st.tossed = f; st.spike = hitter(world, 'spike'); } return; }
      if (!st.hit && st.spike() === 'hit') st.hit = f;
    },
    check(world, st) { return st.tossed && st.hit ? '받아서 네트 앞에서 때렸다' : !st.tossed ? '받지 못했다' : '받았지만 못 때렸다'; },
  },
  kkang: {
    title: '깡총 · 두 번 뛰기 — 공중에서 한 번 더',
    setup(world) { const b = world.bag; world.player.x = 505; b.ball.x = 545; b.ball.y = 40; b.ball.vx = 0; b.ball.vy = -60; },
    script(world, f, st) {
      const p = world.player;
      if (f === 2) world.bag.gauge.set(0, 4);
      if (f === 22) world.input.jump = true;
      if (f === 23) world.input.jump = false;
      if (!st.doubled && p.air > 40 && p.vy < 80) { tap(world, 'guard'); st.doubled = f; st.top = 0; }
      // 공이 손 높이로 내려올 때 친다 (올라오는 머리로 받으면 위로 튄다)
      if (world.bag.ball.y < p.groundY - p.air - 70) return;
      if (st.doubled) st.top = Math.max(st.top, p.air);
      const d = Math.hypot(world.bag.ball.x - p.x, world.bag.ball.y - (p.groundY - p.air - 60));
      if (st.doubled && !st.hit && d < 72 * (p.reachMul ?? 1)) { world.input.right = true; tap(world, 'grab'); st.hit = f; }
      if (p.air <= 0 && f > 20) world.input.right = false;
    },
    check(world, st) { return `두 번째 점프 꼭대기 ${Math.round(st.top ?? 0)}px${st.hit ? ' · 높은 공을 쳤다' : ' · 공에 안 닿았다'}`; },
  },
  mangchi: {
    title: '망치 · 벼락 — 다음 스파이크 ×1.35, 불꽃 꼬리',
    setup(world) { const b = world.bag; world.player.x = 470; b.ball.x = 520; b.ball.y = 150; b.ball.vx = 40; b.ball.vy = -380; },
    script(world, f, st) {
      if (f === 3) { world.bag.gauge.set(0, 4); tap(world, 'guard'); }
      st.spike ??= hitter(world, 'spike');
      if (!st.hit && st.spike() === 'hit') { st.hit = f; st.v = Math.hypot(world.bag.ball.vx, world.bag.ball.vy); st.fire = world.bag.ball.fire > 0; }
    },
    check(world, st) { return st.hit ? `공 빠르기 ${Math.round(st.v)} · 불꽃 ${st.fire ? '있음' : '없음'}` : '못 쳤다'; },
  },
  beongae: {
    title: '번개 · 잔상 대시 — 못 갈 공을 순간 120px',
    setup(world) { const b = world.bag; world.player.x = 150; b.ball.x = 760; b.ball.y = 180; b.ball.vx = -360; b.ball.vy = -150; },
    script(world, f, st) {
      const p = world.player, ball = world.bag.ball;
      if (f === 2) world.bag.gauge.set(0, 4);
      const pr = predict(world, world.groundY - 55);
      world.input.right = pr.x - p.x > 6; world.input.left = pr.x - p.x < -6;
      if (!st.dashed && f > 8 && pr.x - p.x > 150) { st.from = p.x; tap(world, 'guard'); st.dashed = f; st.to = p.x; }
      const d = Math.hypot(ball.x - p.x, ball.y - (p.groundY - 55));
      if (!st.hit && ball.vy > 0 && d < 70) { tap(world, 'grab'); st.hit = f; }
    },
    check(world, st) { return st.dashed ? `대시 ${Math.round(st.to - st.from)}px${st.hit ? ' · 받았다' : ' · 못 받았다'}` : '대시 안 함'; },
  },
  muneo: {
    title: '문어 · 건지기 — 바닥 직전 공을 한 번',
    setup(world) { const b = world.bag; world.player.x = 120; b.ball.x = 700; b.ball.y = 160; b.ball.vx = -260; b.ball.vy = -100; },
    script(world, f, st) {
      if (f === 3) { world.bag.gauge.set(0, 4); tap(world, 'guard'); }
      const s0 = world.bag.score.join();
      st.score ??= s0;
      if (!st.saved && world.bag.ball.vy < -600 && world.bag.ball.y > world.groundY - 60) st.saved = f;
      if (st.saved && !st.toss) st.toss = hitter(world, 'toss', { lead: 0 });
      if (st.toss && !st.hit && st.toss() === 'hit') st.hit = f;
    },
    check(world, st) { return `${st.saved ? '건졌다' : '못 건졌다'}${st.hit ? ' · 이어 받았다' : ''} · 점수 ${world.bag.score.join(':')}`; },
  },
  kongtteok: {
    title: '콩떡 · 회오리 서브 — 흔들리며 날아간다',
    serve: true,
    script(world, f, st) {
      if (f === 4) { world.bag.gauge.set(0, 4); tap(world, 'guard'); st.armed = world.bag.armed.has(0); }
      if (f === 10) press(world, 'grab', true);
      if (f === 46) { press(world, 'grab', false); st.served = world.bag.ball.wobble > 0; }
      // 네트를 넘기 전까지의 가로 빠르기 — 넘은 뒤엔 벽에 튕겨 거꾸로 갈 수 있다(그건 흔들림이 아니다)
      if (f > 46 && !st.crossed) { const v = world.bag.ball.vx; st.lo = Math.min(st.lo ?? v, v); st.hi = Math.max(st.hi ?? v, v); }
      if (f > 46 && world.bag.ball.x > world.w / 2) st.crossed = true;
    },
    check(world, st) { return `${st.served ? '회오리' : '보통'} 서브 · 가로 빠르기 ${Math.round(st.lo)}~${Math.round(st.hi)} · 네트 ${st.crossed ? '넘음' : '못 넘음'}`; },
  },
  byeokdol: {
    title: '벽돌 · 만리장성 — 넓은 벽, 막은 공이 그대로 꽂힌다',
    setup(world) { const b = world.bag; world.player.x = world.w / 2 - 40; b.ball.x = 1050; b.ball.y = 330; b.ball.vx = -1250; b.ball.vy = -60; },
    script(world, f, st) {
      const p = world.player, ball = world.bag.ball;
      if (f === 2) { world.bag.gauge.set(0, 4); tap(world, 'guard'); }
      if (f === 8) world.input.jump = true;
      if (f === 9) world.input.jump = false;
      if (!st.blocked && p.air > 30 && Math.abs(ball.x - world.w / 2) < 200) { tap(world, 'grab'); st.blocked = f; }
      if (st.blocked && !st.back && ball.vx > 0) st.back = { vx: ball.vx, vy: ball.vy };
    },
    check(world, st) { return st.back ? `막았다 — 되돌아간 공 (가로 ${Math.round(st.back.vx)}, 아래로 ${Math.round(st.back.vy)})` : '못 막았다'; },
  },
  pungseon: {
    title: '풍선 · 둥실 — 공중에서 0.6초 멈춘다 (특성 체공)',
    setup(world) { const b = world.bag; world.player.x = 470; b.ball.x = 500; b.ball.y = 60; b.ball.vx = 30; b.ball.vy = -60; },
    script(world, f, st) {
      const p = world.player;
      if (f === 2) world.bag.gauge.set(0, 4);
      if (f === 4) world.input.jump = true;
      if (f === 5) world.input.jump = false;
      if (!st.hov && p.air > 40 && p.vy < 50) { tap(world, 'guard'); st.hov = f; }
      if (st.hov && p.air > 0) st.airFrames = (st.airFrames ?? 0) + 1;
      const d = Math.hypot(world.bag.ball.x - p.x, world.bag.ball.y - (p.groundY - p.air - 60));
      if (st.hov && !st.hit && d < 72 * (p.reachMul ?? 1)) { world.input.right = true; tap(world, 'grab'); st.hit = f; }
    },
    check(world, st) { return `둥실 뒤 공중 ${st.airFrames ?? 0}프레임${st.hit ? ' · 늦게 오는 공을 쳤다' : ' · 공에 안 닿았다'}`; },
  },
  nabi: {
    title: '나비 · 네트 인 — 드롭이 테이프를 스치고 툭',
    setup(world) { const b = world.bag; world.player.x = 520; b.ball.x = 560; b.ball.y = 150; b.ball.vx = 20; b.ball.vy = -380; },
    script(world, f, st) {
      if (f === 3) { world.bag.gauge.set(0, 4); tap(world, 'guard'); }
      st.drop ??= hitter(world, 'drop');
      if (!st.hit && st.drop() === 'hit') st.hit = f;
      if (st.hit && !st.land && world.bag.score[0] > 0) st.land = st.last;
      st.last = world.bag.ball.x;
    },
    check(world, st) { return st.land ? `네트 너머 ${Math.round(st.land - world.w / 2)}px 에 떨어졌다` : st.hit ? '드롭했지만 점수가 안 났다' : '드롭 못 함'; },
  },
  meari: {
    title: '메아리 · 그림자 스파이크 — 가짜 공이 하나 더',
    setup(world) { const b = world.bag; world.player.x = 470; b.ball.x = 520; b.ball.y = 150; b.ball.vx = 40; b.ball.vy = -380; },
    script(world, f, st) {
      if (f === 3) { world.bag.gauge.set(0, 4); tap(world, 'guard'); }
      st.spike ??= hitter(world, 'spike');
      if (!st.hit && st.spike() === 'hit') st.hit = f;
      const g = world.bag.ghost;
      if (st.hit && g?.t > 0 && !(g.wait > 0)) {
        if (g.x < world.w / 2 && g.y > world.groundY - 60) st.ghostLow = true;
        if (g.x > world.w / 2) st.ghostOver = true;
        st.apart = Math.max(st.apart ?? 0, Math.hypot(g.x - world.bag.ball.x, g.y - world.bag.ball.y));
      }
    },
    check(world, st) { return st.hit ? `가짜 공 — 네트 ${st.ghostOver ? '넘음' : '못 넘음'}${st.ghostLow ? ' · 내 코트 바닥에 박힘!' : ''} · 둘 사이 최대 ${Math.round(st.apart ?? 0)}px` : '못 쳤다'; },
  },
};

rmSync(DIR, { recursive: true, force: true });
mkdirSync(DIR, { recursive: true });
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');
let n = 0;
const report = [];
const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
for (const c of C.CAST) {
  if (only && !only.includes(c.id)) continue;
  const sc = SCENES[c.id];
  const world = mkWorld(c.id);
  const b = world.bag;
  if (sc.serve) {
    b.serving = true; b.serveBy = 0; b.wait = 0; b.charge = -1;
    world.player.x = 180;
    for (let i = 0; i < 6; i++) w.update(world, 1 / SIM);
  } else {
    sc.setup(world);
  }
  const st = {};
  const frames = SIM * 3.4;
  for (let f = 0; f < frames; f++) {
    sc.script(world, f, st);
    w.update(world, 1 / SIM);
    if (f % (SIM / FPS)) continue;
    ctx.fillStyle = '#f6f5f2'; ctx.fillRect(0, 0, W, H);
    volley.draw(ctx, world, f / SIM, 0, (x, y, d) => d());
    volley.figure(ctx, world.player, f / SIM, 3, { color: '#b5352f', name: c.name, mine: true });
    ink.paperScrap(ctx, W - 470, 12, 456, 34, 9);
    ink.text(ctx, sc.title, W - 26, 35, { font: `800 15px ${HAN}`, color: ink.INK, align: 'right', halo: 0 });
    writeFileSync(`${DIR}/f${String(n++).padStart(5, '0')}.png`, canvas.toBuffer('image/png'));
  }
  report.push(`${c.name.padEnd(4, ' ')} ${sc.check(world, st)} · 끝 점수 ${world.bag.score.join(':')}`);
}
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', `${DIR}/f%05d.png`,
                        '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '22', OUT]);
if (!process.env.KEEP) rmSync(DIR, { recursive: true, force: true });
console.log(`${OUT} — ${n}프레임 · ${(n / FPS).toFixed(1)}초`);
for (const r of report) console.log('  ' + r);
