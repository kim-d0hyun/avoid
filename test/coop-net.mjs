// 넷이서 — 넷이 **각자 세상**에서 깬다. 방장 1 + 손님 3, 세상 넷, 꾸러미는 지연을 두고 오간다.
//
// coop-play.mjs 는 방장 세상 하나에 인형 셋을 세운다 — 빠르지만 손님 쪽은 안 본다. 여기서는 사람마다 세상이 있다:
//   · 손님은 자기 물리로 걷고 뛰고 무빙워크에 실려 간다. 상자·누름판·열쇠·삭은 발판은 방장 스냅샷(pack/unpack)으로 받는다.
//   · 자리 꾸러미는 손님 → 방장, 방장 스냅샷은 방장 → 손님. LAG 프레임 뒤에 닿는다 (기본 3 = 50ms 편도).
//   · 손잡기·밀기·출구 부탁은 게임 말(gm)로 오간다 — 방장이 중계한다. net.js 의 handleMessage 를 그대로 탄다.
//   · 가만히 있는 셋도 자기 물리로 산다 — 발밑이 사라지면 떨어지고, 무빙워크에 실려 가고, 죽으면 판이 실패한다.
//
//   LAG=0 node test/coop-net.mjs      지연 없이
//   LAG=8 STAGE=옥상 node test/coop-net.mjs

import { writeFileSync } from 'node:fs';
import { check, ok, say, note, done } from './check.mjs';
import { w, netjs, coop, coopMod, T, DT, IDS, HALF, HEAD, col, row, where,
         makeWorld, puppet, walkTo, jumpTo, hopChain, runAll } from './coop-bot.mjs';

const LAG = Math.max(0, +(process.env.LAG ?? 3) | 0);

class NetSim {
  constructor(stageName) {
    this.frames = 0;
    this.worlds = {};
    for (const k of IDS) { this.worlds[k] = makeWorld(stageName, { id: +k }); this.worlds[k].bump = false; }   // 봇은 한 명씩 움직인다 — 서 있는 셋이 길을 막지 않게 사람 충돌은 끈다 (충돌은 coop.mjs 가 따로 본다)
    this.host = this.worlds['1'];
    // 서로를 안다 — 이름표, 왕복 시간 (핑은 안 돌린다: 재 봤다고 친다)
    for (const k of IDS) {
      const wk = this.worlds[k];
      wk.mp.rtt = 2 * LAG * DT;
      for (const j of IDS) {
        if (j === k) continue;
        wk.mp.names.set(+j, `${j}번`);
        const q = this.worlds[j];
        const o = puppet(wk, +j, q.player.x, q.groundY - q.player.air);
        o.rtt = 2 * LAG * DT;
        wk.mp.others.set(+j, o);
      }
      wk.send = (m, to) => this.route(wk, m, to);
    }
    this.queue = [];                                      // { due, to, from, msg }
    this.held = {};                                       // k → input 을 계속 누르고 있는 사람
    this.shell = { net: { send: () => {} }, log: () => {} };
    this.api = { setSize: () => {}, restart: () => {} };
  }
  ids() { return IDS; }
  idOf(world) { return String(world.mp.myId); }

  /// 게임 말 — 손님 것은 방장에게, 방장 것은 받는 사람에게. 지연을 둔다.
  route(fromWorld, msg, to) {
    const from = fromWorld.mp.myId;
    const target = fromWorld.mp.role === 'host' ? String(to) : '1';
    if (!this.worlds[target]) return;
    this.queue.push({ due: this.frames + LAG, to: target, from, msg: JSON.parse(JSON.stringify(msg)) });
  }

  step(activeWorld, input) {
    const blank = { left: false, right: false, jump: false, duck: false };
    for (const k of IDS) {
      const wk = this.worlds[k];
      Object.assign(wk.input, blank, wk === activeWorld ? input : (this.held[k] ?? {}));
    }
    for (const k of IDS) w.update(this.worlds[k], DT);
    // 자리 꾸러미 — 손님 → 방장 (net.js 의 myPacket 과 같은 모양)
    const packetOf = (wk) => {
      const p = wk.player, r1 = (v) => Math.round(v * 10) / 10;
      const state = p.dead ? (wk.mp.waiting ? 2 : 1) : 0;
      return ['p', r1(p.x), r1(p.vx), r1(p.air), r1(p.vy), Math.round(p.crouch * 100) / 100, p.facing, state, p.grabbing, p.escapes, wk.dodged];
    };
    for (const k of ['2', '3', '4']) this.queue.push({ due: this.frames + LAG, to: '1', from: +k, msg: packetOf(this.worlds[k]) });
    // 방장 스냅샷 — 방장 → 손님 (net.js 의 pump 와 같은 모양: 내 자리 + 남들에게서 받은 그대로 + 게임 꾸러미)
    const host = this.host, mp = host.mp;
    const players = [[1, ...packetOf(host).slice(1)]];
    for (const o of mp.others.values()) {
      players.push([o.id, o.baseX, o.vx, o.baseAir, o.vy, o.tcrouch, o.facing, o.state ?? 0, o.grabbing, o.escapes, o.dodged ?? 0, Math.round(o.age * 1000) / 1000]);
    }
    const snapshot = { t: 's', ms: Math.round(host.elapsed * 1000), st: host.state, r: mp.round, pl: players,
                       vw: Math.round(host.w), vh: Math.round(host.h), g: host.gameId, h: 1, x: coop.pack(host) };
    const frozen = JSON.stringify(snapshot);
    for (const k of ['2', '3', '4']) this.queue.push({ due: this.frames + LAG, to: k, from: 1, msg: frozen });
    // 닿을 때가 된 것을 넘긴다
    const rest = [];
    for (const item of this.queue) {
      if (item.due > this.frames) { rest.push(item); continue; }
      const msg = typeof item.msg === 'string' ? JSON.parse(item.msg) : item.msg;
      netjs.handleMessage(this.worlds[item.to], this.shell, item.from, msg, this.api);
    }
    this.queue = rest;
    this.frames++;
  }

  activate(who) { this.lastActive = who; return this.worlds[who]; }
  /// 허공에 있으면 내려앉을 때까지 (남이 밟던 머리에서 떨어졌을 때 등)
  land(world) {
    const p = world.player;
    if (p.onLadder || p.grounded) return null;
    for (let f = 0; f < 120 && !p.grounded; f++) this.step(world, {});
    if (p.dead) return `${this.idOf(world)}번이 차례를 받자 떨어져 죽었다`;
    return null;
  }
  at(who) { const q = this.worlds[who]; return { x: q.player.x, fy: q.groundY - q.player.air }; }
  deadOne() { for (const k of IDS) if (this.worlds[k].player.dead) return k; return null; }
  /// 물리가 알아서 한다 — 잠깐 굴려서 떨어질 것은 떨어지게 둔다
  settle() { for (let f = 0; f < 12; f++) this.step(this.host, {}); return null; }
  /// 어깨 스택 — 남들이 **직접** 걸어가 밑 사람부터 서고, 위 사람은 머리를 딛고 올라간다.
  stack(on, lay, me) {
    for (let k = 0; k < on.length; k++) {
      const wk = this.activate(on[k]);
      const target = lay.base + lay.lean * 14 * k;
      let err = null;
      if (k === 0) err = walkTo(this, wk, target, { frames: 400 });
      else {
        const back = walkTo(this, wk, lay.start, { frames: 400 });
        if (back) return `${on[k]}번이 스택 뒤로 가기: ${back}`;
        err = hopChain(this, wk, lay, me, k, k - 1, lay.lean * 14);
      }
      if (err) return `${on[k]}번 어깨 서기: ${err}`;
      if (Math.abs(wk.player.x - target) > 12) return `${on[k]}번이 어깨 자리에 못 섰다 (${where(wk)} · 목표 ${col(target)}칸)`;
    }
    return null;
  }
  /// 같이 미는 사람은 상자 뒤에 걸어가 붙어 서서, 미는 동안 그쪽 키를 누르고 있다.
  holdMates(mates, box, dir) {
    for (const m of mates) {
      const wk = this.worlds[m];
      const err = walkTo(this, wk, box.x - dir * (T / 2 + HALF + 4), { frames: 400 });
      if (err) return `${m}번이 상자 뒤에 서기: ${err}`;
      this.held[m] = { left: dir < 0, right: dir > 0 };
    }
    return null;
  }
  releaseMates(mates) { for (const m of mates) delete this.held[m]; }
}

say(`열네 판 — 넷이 각자 세상에서, 꾸러미 지연 ${LAG}프레임(${Math.round(LAG * 1000 / 60)}ms 편도)`);
const results = runAll((name) => new NetSim(name), { ok, note });
if (!process.env.STAGE && !process.env.LAG) writeFileSync(new URL('../docs/넷이서/play-net.json', import.meta.url), JSON.stringify(results, null, 1));
done('넷이서 넷');
