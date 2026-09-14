// 싱크 — 넷(셋)이 각자 세상에서, 실제 net 코드로. 재접속·비대칭 지연·패킷 손실·연속 전환을 넣고
// **모든 쌍이 서로 보이고 판이 늘 일치하는지** 본다. 「나는 남이 안 보이는데 남은 나를 봄」 회귀 방지.
//   GAME=trio node test/coop-sync.mjs
import './dom-stub.mjs';
import { check, ok, say, note, done } from './check.mjs';
const R = new URL('../src/', import.meta.url).href;
const w = await import(R + 'game/world.js');
const net = await import(R + 'game/net.js');
const GAME = process.env.GAME === 'trio' ? 'trio' : 'coop';
const coop = (await import(R + `games/${GAME}.js`)).default;
const T = 42, DT = 1 / 60;
const ids = GAME === 'trio' ? ['1', '2', '3'] : ['1', '2', '3', '4'];
const LAGS = { '2': 2, '3': 5, '4': 9 };
let seed = 999; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const W = {}; const present = new Set();
const SH = { net: { send() {} }, log() {} }, api = { setSize() {}, restart() {} };
const q = []; let fr = 0;
function spawn(k) {
  const x = w.createWorld({ ms: 0, dodged: 0 }); x.onRecord = () => {}; x.onGameOver = () => {}; w.resize(x, 1512, 944);
  w.pickGame(x, GAME); net.roleChanged(x, k === '1' ? 'host' : 'guest', 'ZR95', +k, k + '번');
  x.send = (m, to) => { if (!present.has(k)) return; const tgt = x.mp.role === 'host' ? String(to) : '1'; if (!present.has(tgt)) return; const lag = x.mp.role === 'host' ? (LAGS[tgt] || 2) : (LAGS[k] || 2); q.push({ due: fr + lag, to: tgt, from: +k, msg: JSON.parse(JSON.stringify(m)) }); };
  W[k] = x;
}
const connect = (k) => { for (const j of ids) { if (j === k || !present.has(j)) continue; net.peerChanged(W[j], SH, +k, k + '번', true, { spread: w.spread }); net.peerChanged(W[k], SH, +j, j + '번', true, { spread: w.spread }); } };
const pk = (x) => { const p = x.player, r = (v) => Math.round(v * 10) / 10; const st = x.mp.waiting ? 2 : (p.dead ? 1 : 0); return ['p', r(p.x), r(p.vx), r(p.air), r(p.vy), Math.round(p.crouch * 100) / 100, p.facing, st, p.grabbing, p.escapes, x.dodged]; };
const host = () => W['1'];
function step(inp = {}, drop = 0.1) {
  for (const k of ids) if (present.has(k)) { Object.assign(W[k].input, { left: false, right: false, jump: false, duck: false }, inp[k] || {}); w.update(W[k], DT); }
  for (const k of ids.slice(1)) if (present.has(k) && rnd() > drop) q.push({ due: fr + LAGS[k], to: '1', from: +k, msg: pk(W[k]) });
  if (present.has('1')) {
    const mp = host().mp, players = [[1, ...pk(host()).slice(1)]];
    for (const o of mp.others.values()) players.push([o.id, o.baseX, o.vx, o.baseAir, o.vy, o.tcrouch, o.facing, o.state ?? 0, o.grabbing, o.escapes, o.dodged ?? 0, Math.round(o.age * 1000) / 1000]);
    const snap = JSON.stringify({ t: 's', ms: 0, st: host().state, r: mp.round, pl: players, vw: 1512, vh: 944, g: GAME, h: 1, x: coop.pack(host()) });
    for (const k of ids.slice(1)) if (present.has(k) && rnd() > drop) q.push({ due: fr + LAGS[k], to: k, from: 1, msg: snap });
  }
  const rest = []; for (const it of q) { if (it.due > fr) { rest.push(it); continue; } if (present.has(it.to)) net.handleMessage(W[it.to], SH, it.from, typeof it.msg === 'string' ? JSON.parse(it.msg) : it.msg, api); } q.length = 0; q.push(...rest);
  fr++;
}
const toExit = () => { const b = host().bag; for (const k of ids) if (present.has(k)) { const p = W[k].player; p.x = (b.exit.x + 0.5) * T; p.air = W[k].groundY - (b.exit.y + 1) * T; p.grounded = true; p.dead = false; } };
const clearRound = () => { toExit(); for (let i = 0; i < 8; i++) step(); for (let i = 0; i < 12; i++) step({ '1': { jump: true } }); for (let i = 0; i < 60; i++) step(); };
const seen = (k, j) => { const o = W[k].mp.others.get(+j); return !!o && !o.waiting && !o.dead; };
function pairsAllSee() { for (const k of ids) { if (!present.has(k)) continue; for (const j of ids) { if (j === k || !present.has(j)) continue; if (!seen(k, j)) return `${k}→${j}`; } } return null; }
function sameStage() { return new Set(ids.filter((k) => present.has(k)).map((k) => W[k].bag.stage)).size === 1; }

say(`싱크 — ${ids.length}명, 비대칭 지연·패킷 손실·재접속·연속 전환 (${GAME})`);
for (const k of ids) { spawn(k); present.add(k); }
for (const k of ids) connect(k);
host().state = 'play'; net.startRound(host(), SH, { restart: w.restart });
for (const k of ids.slice(1)) { W[k].state = 'play'; W[k].mp.waiting = false; }
for (let i = 0; i < 40; i++) step();
ok('1판 — 모든 쌍이 서로 보인다', pairsAllSee() === null); note('안보임 ' + (pairsAllSee() || '없음'));
ok('1판 — 판이 일치', sameStage());
clearRound();
ok('2판 전환 — 다 같은 판', sameStage());
check('2판 전환 — 판 번호', host().bag.stage, 1);
ok('2판 전환 — 모든 쌍이 서로 보인다', pairsAllSee() === null); note('안보임 ' + (pairsAllSee() || '없음'));
// 마지막 손님 나갔다 재접속
const last = ids[ids.length - 1];
present.delete(last); for (const k of ids) if (k !== last && present.has(k)) net.peerChanged(W[k], SH, +last, last + '번', false, { spread: w.spread });
for (let i = 0; i < 60; i++) step();
ok('한 명 나가도 남은 사람끼리 다 보인다', pairsAllSee() === null);
spawn(last); present.add(last); connect(last);
for (let i = 0; i < 100; i++) step();
clearRound();
ok('재접속·전환 뒤 모든 쌍이 서로 보인다', pairsAllSee() === null); note('안보임 ' + (pairsAllSee() || '없음'));
ok('재접속·전환 뒤 판 일치', sameStage());
clearRound();
ok('연속 전환에도 모든 쌍이 서로 보인다', pairsAllSee() === null);
ok('연속 전환에도 판 일치', sameStage());
done(`싱크 ${GAME === 'trio' ? '셋이서' : '넷이서'}`);
