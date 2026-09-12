// 넷이서 — 판을 **실제 엔진에서** 넷이 깬다 (인형 세상).
//
// docs/넷이서/solve.py 는 풀이를 칸 단위로 지형에 대 본다 — 「두 칸 위 네 칸 옆」같은 어림값으로.
// 그 어림값이 coop.js 의 물리(픽셀·속도·중력·머리 높이 53px·웅크린 머리 31px)와 어긋나면
// 검사는 통과하는데 사람은 못 깨는 판이 나온다. 그래서 같은 풀이(test/coop-moves.json)를
// 여기서 **키를 눌러** 그대로 해 본다. 걸음은 test/coop-bot.mjs 에.
//
// 방장 세상 하나. 움직이는 한 명만 진짜 물리(world.player)고 나머지 셋은 그 자리에 선 남(world.mp.others) —
// 차례가 오면 그 사람을 world.player 로 갈아 끼운다. 남의 물리는 서 있는 자리와 떨어지는 것만 흉내 낸다.
// 넷을 각자 세상으로 굴리는 진짜 시뮬레이션은 coop-net.mjs.

import { writeFileSync } from 'node:fs';
import { check, ok, say, note, done } from './check.mjs';
import { w, coop, T, floorBelow, bodyBlocked, HALF, BLOCK_H, HEAD, DT, IDS, col, row,
         makeWorld, puppet, walkTo, jumpTo, runAll } from './coop-bot.mjs';

class PuppetSim {
  constructor(stageName) {
    this.frames = 0;
    this.host = makeWorld(stageName);
    const b = this.host.bag;
    this.pos = {};
    for (let i = 0; i < 4; i++) this.pos[String(i + 1)] = { x: (b.spawn[i].x + 0.5) * T, fy: (b.spawn[i].y + 1) * T, ladder: false };
    this.active = null;
    this.settleActive = false;
    this.mates = null;
    this.activate('1');
  }
  ids() { return IDS; }
  step(world, input) {
    Object.assign(world.input, { left: false, right: false, jump: false, duck: false }, input);
    // 같이 미는 인형은 상자 뒤에 붙어 그쪽으로 걷는 시늉
    if (this.mates) for (const m of this.mates.ids) { this.place(m, this.mates.box.x - this.mates.dir * 40, this.mates.box.y); const o = world.mp.others.get(+m); if (o) o.vx = this.mates.dir * 4; }
    w.update(world, DT);
    this.frames++;
  }
  /// 누가 움직일 차례인지 갈아 끼운다.
  activate(who) {
    const world = this.host, p = world.player;
    if (this.active === who) return world;
    if (this.active) {
      // 사다리·리프트에 매달린 채 차례를 넘기면 그대로 매달려 있다 (자리표에 적어 둔다)
      this.pos[this.active] = { x: p.x, fy: world.groundY - p.air, ladder: !!p.onLadder };
      world.mp.others.set(+this.active, puppet(world, +this.active, p.x, world.groundY - p.air));
    }
    world.mp.others.delete(+who);
    const at = this.pos[who];
    p.x = at.x; p.air = world.groundY - at.fy; p.vx = 0; p.vy = 0; p.grounded = !at.ladder; p.onLadder = !!at.ladder;
    p.crouch = 0; p.dead = false; p.stun = 0; p.knock = 0; p.jumpHeld = false; p.rideId = null; p.load = 0;
    this.active = who;
    this.settleActive = true;
    for (const k of IDS) {
      if (k === who) continue;
      const q = this.pos[k];
      const o = world.mp.others.get(+k);
      if (!o) world.mp.others.set(+k, puppet(world, +k, q.x, q.fy));
      else if (Math.abs(o.x - q.x) > 0.5 || Math.abs((o.groundY - o.air) - q.fy) > 0.5) this.place(k, q.x, q.fy);
    }
    return world;
  }
  /// 차례를 받은 사람이 허공에 있으면 내려앉을 때까지 굴린다 (밟고 있던 사람이 떠났으면 떨어진다).
  land(world) {
    if (!this.settleActive) return null;
    this.settleActive = false;
    const p = world.player;
    if (p.onLadder) return null;
    for (let f = 0; f < 120 && !(p.grounded && f > 0); f++) this.step(world, {});
    if (p.dead) return `${this.active}번이 차례를 받자 떨어져 죽었다`;
    return null;
  }
  place(who, x, fy) {
    const world = this.host;
    this.pos[who] = { x, fy, ladder: false };
    if (who === this.active) { world.player.x = x; world.player.air = world.groundY - fy; return; }
    const o = world.mp.others.get(+who);
    if (!o) { world.mp.others.set(+who, puppet(world, +who, x, fy)); return; }
    o.x = o.baseX = x; o.air = o.baseAir = world.groundY - fy; o.age = 0; o.errorX = 0; o.vx = 0; o.vy = 0; o.fyPrev = undefined;
  }
  at(who) {
    if (who === this.active) { const p = this.host.player; return { x: p.x, fy: this.host.groundY - p.air }; }
    const o = this.host.mp.others.get(+who);
    return { x: o.x, fy: o.groundY - o.air };
  }
  deadOne() { return null; }                              // 인형은 죽지 않는다
  /// k 번 발밑의 바닥 — 타일·상자·발판, 그리고 다른 사람의 머리.
  floorUnder(k) {
    const world = this.host, q = this.at(k);
    let best = floorBelow(world, q.x, q.fy - 1, world.groundY + T, HALF - 2, { people: false });
    for (const j of IDS) {
      if (j === k) continue;
      const o = this.at(j);
      if (Math.abs(o.x - q.x) >= 30) continue;
      const top = o.fy - HEAD;
      if (top >= q.fy - 1 && (best === null || top < best)) best = top;
    }
    return best;
  }
  /// 발밑이 사라진 남을 바닥까지 떨어뜨린다. 위에 선 사람부터 본다.
  settle() {
    for (let pass = 0; pass < 4; pass++) {
      let moved = false;
      for (const k of IDS) {
        if (k === this.active || this.pos[k].ladder) continue;
        const q = this.at(k);
        const floor = this.floorUnder(k);
        if (floor === null) return `${k}번이 떨어져 판 밖으로 나간다 (${col(q.x)},${row(q.fy)})`;
        if (Math.abs(floor - q.fy) > 0.5) { this.place(k, q.x, floor); moved = true; }
      }
      if (!moved) break;
    }
    return null;
  }
  /// 어깨 스택 — 인형은 그냥 세운다.
  stack(on, lay, me) {
    on.forEach((o, k) => this.place(o, lay.base + lay.lean * 14 * k, me.fy - HEAD * k));
    return null;
  }
  holdMates(mates, box, dir) { this.mates = mates.length ? { ids: mates, box, dir } : null; return null; }
  releaseMates(mates) {
    const world = this.host;
    const dir = this.mates?.dir ?? 1;
    this.mates = null;
    for (const m of mates) { const o = world.mp.others.get(+m); if (o) o.vx = 0; this.place(m, world.player.x - dir * (2 * HALF + 4), world.groundY - world.player.air); }
    for (let f = 0; f < 6; f++) this.step(world, {});
  }
  /// 손잡기 — 방장 세상에서 action 을 부르고, 보낸 말을 인형에 적용한다.
  pull(who, by) {
    const world = this.host;
    world.sent = [];
    coop.action(world);
    const msg = world.sent.find((s) => s.m.k === 'pull' && s.m.to === +who);
    if (!msg) { const q = this.at(who), me = this.at(by); return `손이 안 닿는다 — ${who}번은 ${((q.fy - me.fy) / T).toFixed(2)}칸 아래 ${(Math.abs(q.x - me.x) / T).toFixed(2)}칸 옆 · 보낸 것=${JSON.stringify(world.sent.map((s) => s.m))}`; }
    this.place(who, msg.m.x, world.groundY - msg.m.air);
    const err = this.settle();
    const q = this.at(who), me = this.at(by);
    if (!err && Math.abs(q.fy - me.fy) > 16) return `끌어올린 ${who}번이 설 바닥이 없다 (${col(q.x)},${row(q.fy)}) — 세운 자리 x=${msg.m.x} air=${msg.m.air}`;
    return err;
  }
}

say('열네 판 — 풀이 그대로 키를 눌러 넷이 깬다 (인형 세상 · 통은 뺐다)');
const results = runAll((name) => new PuppetSim(name), { ok, note });
if (!process.env.STAGE) writeFileSync(new URL('../docs/넷이서/play.json', import.meta.url), JSON.stringify(results, null, 1));
done('넷이서 실전');
