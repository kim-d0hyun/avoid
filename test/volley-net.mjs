// 배구 중계 — **손님 화면이 매끄러운가.** 방장과 손님을 따로 돌리고, 사이에 지연·손실·
// 와이파이 딸꾹을 넣어 손님 공이 멎거나 튀는 프레임을 센다.
//
// 이 시험이 없어서 같은 값을 두 번 잘못 건드렸다. 두 번의 오측이 무엇이었는지 적어 둔다 —
//   ① 랠리를 만들려고 공을 되돌려 놓는 프레임(불연속)을 그대로 셌다.
//   ② 방장이 서브 모드라 **공이 아예 안 움직이는데** 재고 있었다 (방장 걸음 0px).
// 그래서 여기서는 프레임마다 서브 모드를 꺼 두고, **방장 공이 진짜 움직인 판만** 쓰고,
// 방장 쪽 불연속(때림·벽·네트·바닥) 뒤 지연+4 프레임은 재는 데서 뺀다.
//
//   node test/volley-net.mjs
import './dom-stub.mjs';
import { check, ok, say, note, done } from './check.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const net = await import(R + 'game/net.js');
const volley = (await import(R + 'games/volley.js')).default;
const { spike } = await import(R + 'games/volley.js');
const { BODY_H } = await import(R + 'draw/stickman.js');

const DT = 1 / 60;
const SHELL = { net: { send() {} }, log() {} }, API = { setSize() {}, restart() {} };
const LAG = 3;                       // 한쪽 3프레임(50ms) — 사무실 와이파이쯤

/// 방장·손님 한 쌍을 만들어 **한 번의 랠리**를 돌린다.
function rally({ drop = 0, gap = null, phase = 0, seed = 7, high = 260, frames = 150 }) {
  let s = seed; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const mk = (role, id) => {
    const x = w.createWorld({ ms: 0, dodged: 0 });
    x.onRecord = () => {}; x.onGameOver = () => {}; x.onMenu = () => {};
    w.resize(x, 1512, 944); w.pickGame(x, 'volley');
    net.roleChanged(x, role, 'ZR95', id, id + '번');
    x.send = () => {};
    return x;
  };
  const host = mk('host', 1), guest = mk('guest', 2);
  net.peerChanged(host, SHELL, 2, '2번', true, { spread: w.spread });
  net.peerChanged(guest, SHELL, 1, '1번', true, { spread: w.spread });
  host.state = 'play'; guest.state = 'play'; guest.mp.waiting = false;
  host.team = 0; guest.team = 1;
  host.player.x = 500; guest.player.x = 1100; host.player.facing = 1;
  const b = host.bag;
  const q = [];
  const rows = [];
  let hitAt = -1;
  for (let fr = 0; fr < frames; fr++) {
    b.serving = false; b.wait = 0; b.mustCross = -1;
    // 공은 **첫 update 뒤에** 놓는다 — 서브 모드가 켜져 있는 첫 프레임에 공을 올리는
    // 사람 손으로 끌어가 버려서, 그냥 놓으면 공이 사람에게서 100px 떨어져 있다(안 닿는다).
    if (fr === 2) { b.ball.x = host.player.x + 62; b.ball.y = host.groundY - high; b.ball.vx = 0; b.ball.vy = 0; }
    const p = host.player;
    host.input.right = (fr % 48) < 24; host.input.left = (fr % 48) >= 24;   // 계속 걸어 다닌다
    const hand = p.groundY - p.air - BODY_H * 0.86;
    if (hitAt < 0 && p.air <= 0 && b.ball.y > hand - 150) host.input.jump = true;
    if (p.air > 30) host.input.jump = false;
    if (hitAt < 0 && p.air > 20 && b.ball.y - hand > 12 && b.ball.y - hand < 34 && spike(host)) hitAt = fr;
    w.update(host, DT); w.update(guest, DT);
    // 딸꾹은 판마다 다른 자리에서 시작한다 — 때리는 순간과 겹칠 때도, 안 겹칠 때도 본다.
    const lost = gap ? ((fr + phase) % gap.every) < gap.len : rnd() < drop;
    if (!lost) {
      q.push({ due: fr + LAG, msg: JSON.stringify({ t: 's', ms: 0, st: host.state, r: host.mp.round,
        pl: [[1, p.x, p.vx, p.air, p.vy, 0, p.facing, 0, -1, 0, 0, 0]],
        vw: 1512, vh: 944, g: 'volley', h: 1, x: volley.pack(host) }) });
    }
    const rest = [];
    for (const it of q) { if (it.due > fr) { rest.push(it); continue; } net.handleMessage(guest, SHELL, 1, JSON.parse(it.msg), API); }
    q.length = 0; q.push(...rest);
    rows.push({ hx: b.ball.x, hy: b.ball.y, gx: guest.bag.ball.x, gy: guest.bag.ball.y,
                hvx: b.ball.vx, hvy: b.ball.vy, land: b.ball.y > host.groundY - 40 });
  }
  return { rows, hitAt, w: host.w };
}

/// 여러 판을 재서 한 줄로 만든다. 멎음 — 방장은 가는데 손님 공이 제자리.
/// 순간이동 — 손님이 방장보다 40px 넘게 더 감.
function measure(opt, n = 10) {
  const st = { snap: 0, worstSnap: 0, freeze: 0, worstRun: 0, err: [], frames: 0, used: 0, out: 0 };
  for (let k = 0; k < n; k++) {
    const { rows, hitAt, w: width } = rally({ ...opt, phase: k * 11, seed: 300 + k * 17, high: 254 + (k % 6) * 12 });
    if (hitAt < 0) continue;
    let end = rows.length - 1;
    for (let i = hitAt + 2; i < rows.length; i++) if (rows[i].land) { end = i - 1; break; }
    // 방장 쪽 불연속은 손님 쪽에서 지연만큼 뒤에 나타난다 — 이을 것이 아니라 옮길 사건이다.
    const skip = new Set();
    for (let i = 1; i <= end; i++) {
      const dv = Math.hypot(rows[i].hvx - rows[i - 1].hvx, rows[i].hvy - rows[i - 1].hvy);
      if (dv > 300) for (let d = 0; d <= LAG + 4; d++) skip.add(i + d);
    }
    for (let d = 0; d <= LAG + 6; d++) skip.add(hitAt + d);
    let run = 0, moved = 0;
    for (let i = hitAt + 1; i <= end; i++) {
      const a = rows[i - 1], c = rows[i];
      const hs = Math.hypot(c.hx - a.hx, c.hy - a.hy);
      const gs = Math.hypot(c.gx - a.gx, c.gy - a.gy);
      moved += hs;
      // 손님 공이 코트 밖으로 나가 있으면 앞질러 그리기가 고삐를 놓은 것이다.
      if (c.gx < -60 || c.gx > width + 60) st.out++;
      if (skip.has(i)) { run = 0; continue; }
      st.frames++;
      if (gs > hs + 40) { st.snap++; st.worstSnap = Math.max(st.worstSnap, gs); }
      if (gs < 2 && hs > 8) { st.freeze++; run++; st.worstRun = Math.max(st.worstRun, run); } else run = 0;
      st.err.push(Math.hypot(c.gx - c.hx, c.gy - c.hy));
    }
    if (moved > 200) st.used++;      // 방장 공이 진짜 움직인 판만 센다
  }
  const at = (q) => { const a = [...st.err].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(a.length * q))] ?? 0; };
  return { ...st, p50: at(0.5), p95: at(0.95) };
}

say('배구 중계 — 시험판이 진짜 랠리를 돌리고 있나');
{
  const r = measure({}, 10);
  // 열 판 중 여덟 판은 방장이 진짜 때려서 공이 200px 넘게 날아야 한다 — 이게 안 되면
  // 아래 숫자는 **아무것도 안 재고 있는 것**이다 (앞서 그렇게 두 번 속았다).
  ok('여덟 판 넘게 진짜 랠리가 돌았다', r.used >= 8); note(`쓴 판 ${r.used}/10`);
  ok('잰 프레임이 넉넉하다', r.frames > 400); note(`잰 프레임 ${r.frames}`);
}

say('깨끗한 망 — 멎지도 튀지도 않는다');
{
  const r = measure({}, 10);
  check('순간이동 없음', r.snap, 0);
  check('멎음 없음', r.freeze, 0);
  ok('어긋남은 지연만큼(100px 아래)', r.p95 < 100);
  note(`어긋남 p50 ${r.p50.toFixed(0)}px · p95 ${r.p95.toFixed(0)}px`);
}

say('꾸러미를 잃어도 — 한 장에 판이 다 들어 있다');
{
  const r = measure({ drop: 0.3 }, 10);
  check('셋에 하나를 잃어도 멎지 않는다', r.freeze, 0);
  ok('순간이동도 거의 없다', r.snap <= 2); note(`순간이동 ${r.snap}회 · 어긋남 p95 ${r.p95.toFixed(0)}px`);
}

// **와이파이 딸꾹.** TCP 라 꾸러미를 잃지는 않고 **한꺼번에 늦게** 온다 — 0.2초쯤 멎었다가
// 몰려온다. 이때 손님 공이 제자리에 서면 그게 곧 「렉 걸렸다」로 보인다.
say('와이파이 딸꾹 0.2초 — 공은 가던 길로 계속 간다');
{
  const r = measure({ gap: { every: 90, len: 12 } }, 10);
  check('멎는 프레임이 없다', r.freeze, 0);
  ok('어긋남 p95 가 120px 아래', r.p95 < 120);
  note(`순간이동 ${r.snap}회(최대 ${Math.round(r.worstSnap)}px) · 어긋남 p95 ${r.p95.toFixed(0)}px`);
}

// 0.4초(24프레임) 끊기면 손님은 그 사이에 난 일을 **알 방법이 없다.** 멎는 것 자체는
// 못 없앤다 — 끊긴 길이보다 오래 멎지 않고, 엉뚱한 데(코트 밖)로 날아가지만 않으면 된다.
say('와이파이 딸꾹 0.4초 — 앞질러 그리기에도 끝이 있다');
{
  const r = measure({ gap: { every: 120, len: 24 } }, 10);
  ok('멎어도 끊긴 길이(24+3프레임)를 안 넘는다', r.worstRun <= 27);
  note(`가장 길게 멎은 ${r.worstRun}프레임 · 멎음 ${r.freeze}프레임`);
  ok('어긋남 p95 가 300px 아래', r.p95 < 300); note(`어긋남 p95 ${r.p95.toFixed(0)}px`);
  check('코트 밖으로 날아가지 않는다', r.out, 0);
}

done('배구 중계');
