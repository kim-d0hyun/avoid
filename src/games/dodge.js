// 똥피하기.
//
// 하늘에서 쏟아지는 똥을 피한다. 오래 버틴 사람이 이긴다.
// 이 파일에는 **똥에 관한 것만** 있다. 달리기·점프·부딪힘·붙잡기는 world.js 가 갖는다.

import { bucketFor, SPLAT_KINDS, drawPoop, drawSplat } from '../draw/poop.js';
import { BODY_H } from '../draw/stickman.js';
import { kill } from '../game/world.js';

const SPLAT_CAP = 48;
const HALF_W = 9;

/// 난이도. 시간이 곧 난이도이고 다른 손잡이는 없다.
/// 속도는 3.2배에서 멈추지만 **쏟아지는 양은 안 멈춘다** — 마지막에 사람을 잡는 건 속도가
/// 아니라 밀도다. 시작부터 여덟 덩이쯤 떠 있고, 40초에는 화면이 반쯤 찬다.
export function difficulty(t) {
  return {
    speed: Math.min(1 + t * 0.040, 3.2),
    interval: Math.max(0.06, 0.26 * Math.pow(0.970, t)),
  };
}

function spawn(world, x, sizeBias = Math.random()) {
  const bag = world.bag;
  const r = 10 + sizeBias * 12;
  const { speed } = difficulty(world.elapsed);
  // 큰 놈은 느리고 작은 놈은 빠르다. 크기만 보고도 언제 닿을지 가늠할 수 있어야 한다.
  const fall = (322 - r * 4.0) * speed * (0.92 + Math.random() * 0.16);
  const poop = {
    x, y: -r * 2 - 10, r,
    bucket: bucketFor(r),
    vy: fall,
    vx: (Math.random() - 0.5) * 46,
    spin: (Math.random() - 0.5) * 0.5,
    spinV: (Math.random() - 0.5) * 0.95,
    seed: (Math.random() * 3) | 0,
  };
  bag.poops.push(poop);
  // 방장은 뿌린 것을 그대로 넘긴다. 손님은 이 초기값으로 **같은 물리를 각자 돌린다** —
  // 매 프레임 좌표를 받아 그리면 20Hz 로 뚝뚝 끊긴다.
  if (world.mp.role === 'host') {
    bag.fresh.push([poop.x, poop.y, poop.r, poop.vx, poop.vy, poop.spin, poop.spinV, poop.seed]);
  }
}

function randomX(world) {
  return 24 + Math.random() * (world.w - 48);
}

/// 소나기. 한 줄로 쏟아붓되 **반드시 한 칸은 비워 둔다** — 못 피하는 벽은 난이도가 아니라 버그다.
///
/// 비워 두는 칸은 화면 아무 데나가 아니라 **지금 서 있는 자리 근처**에 낸다. 반대편 끝에 내면
/// 후반 낙하 속도(초당 850픽셀)에서는 전력으로 달려도 못 닿아서, 「비어 있지만 못 가는 칸」이 된다.
/// 그래도 150픽셀쯤은 떨어뜨려 둬서 가만히 서 있으면 맞는다.
function storm(world) {
  const margin = 40;
  const shift = (Math.random() < 0.5 ? -1 : 1) * (110 + Math.random() * 70);
  const safe = Math.max(margin, Math.min(world.w - margin, world.player.x + shift));
  const lanes = 7;
  for (let i = 0; i < lanes; i++) {
    const x = 30 + ((i + Math.random() * 0.6) / lanes) * (world.w - 60);
    if (Math.abs(x - safe) < 130) continue;
    spawn(world, x, Math.random() * 0.6);
  }
}

function land(world, poop) {
  world.dodged++;
  world.bag.splats.push({
    x: poop.x, y: world.groundY + 2,
    kind: Math.max(0, Math.min(SPLAT_KINDS - 1, Math.round((poop.r - 10) / 6))),
    flip: Math.random() < 0.5 ? -1 : 1,
    // 크기와 진하기를 조금씩 흩어 놓는다. 똑같은 자국이 줄지어 있으면 도장 찍은 것처럼 보인다.
    size: 0.82 + Math.random() * 0.36,
    alpha: 0.7 + Math.random() * 0.3,
    pop: 0,
  });
  if (world.bag.splats.length > SPLAT_CAP) world.bag.splats.shift();
}

function hits(player, poop) {
  const height = BODY_H * (1 - 0.44 * player.crouch);
  const halfW = HALF_W + player.crouch * 5;
  const feet = player.groundY - player.air;
  const top = feet - height;
  // 원 대 사각형. 사각형에서 원 중심에 가장 가까운 점까지의 거리를 잰다.
  const cx = Math.max(player.x - halfW, Math.min(poop.x, player.x + halfW));
  const cy = Math.max(top, Math.min(poop.y, feet));
  const dx = poop.x - cx;
  const dy = poop.y - cy;
  // 0.72 배. 그림보다 판정을 좁게 잡아야 「스쳤는데 죽었다」가 안 나온다.
  const rr = poop.r * 0.72;
  return dx * dx + dy * dy < rr * rr;
}

function stepPoops(world, dt) {
  const p = world.player;
  const bag = world.bag;
  let danger = false;

  for (let i = bag.poops.length - 1; i >= 0; i--) {
    const poop = bag.poops[i];
    poop.y += poop.vy * dt;
    poop.x += poop.vx * dt;
    poop.spin += poop.spinV * dt;

    if (poop.y - poop.r * 0.6 > world.groundY) {
      land(world, poop);
      bag.poops.splice(i, 1);
      continue;
    }
    if (p.dead) continue;
    if (Math.abs(poop.x - p.x) < 66 && poop.y > world.groundY - 260) danger = true;
    if (hits(p, poop)) {
      kill(world);
      break;
    }
  }
  p.danger = danger && !p.dead;
  for (const splat of bag.splats) splat.pop = Math.min(1, splat.pop + dt * 9);
}

export default {
  id: 'dodge',
  name: '똥피하기',
  line: '하늘에서 쏟아지는 똥을 피한다. 오래 버틴 사람이 이긴다.',
  /// 발이 조금 느리다. 피하는 게임이라 전속력으로 미끄러지면 몸이 손을 앞질러 간다.
  pace: 0.84,
  /// 점프도 조금 낮다. 높이 뜨면 떨어지는 동안 못 움직여서 오히려 못 피한다.
  hop: 0.9,
  keys: [['⌥ ← →', '달리기'], ['⌥ ↑', '점프'], ['⌥ ↓', '웅크리기'], ['⌥ Space', '붙잡기']],
  /// 시계 밑에 붙는 한 줄.
  tally: (world) => `피함 ${world.dodged}`,

  fresh: () => ({ poops: [], splats: [], fresh: [] }),

  update(world, dt) {
    if (world.state === 'over') {
      for (const splat of world.bag.splats) splat.pop = Math.min(1, splat.pop + dt * 9);
      return;
    }
    if (world.state !== 'play') return;

    // 손님은 똥을 뿌리지 않는다. 방장이 뿌린 것을 받아 각자 굴린다.
    if (world.mp.role === 'guest') { stepPoops(world, dt); return; }

    const { interval } = difficulty(world.elapsed);
    world.bag.spawnTimer = (world.bag.spawnTimer ?? 0) - dt;
    while (world.bag.spawnTimer <= 0) {
      spawn(world, randomX(world));
      // 30초부터는 가끔 둘씩. 겹쳐 떨어지면 두 덩이가 한 덩이로 보이기만 하고 난이도는 그대로다.
      // 벽에 붙어 있으면 반대쪽으로 떼어, 잘라 낸 뒤에도 간격이 남게 한다.
      if (world.elapsed > 30 && Math.random() < 0.18) {
        const first = world.bag.poops[world.bag.poops.length - 1];
        const away = first.x > world.w / 2 ? -1 : 1;
        const x = first.x + away * (190 + Math.random() * 160);
        spawn(world, Math.max(24, Math.min(world.w - 24, x)));
      }
      world.bag.spawnTimer += interval;
    }

    world.bag.stormTimer = (world.bag.stormTimer ?? 22) - dt;
    if (world.bag.stormTimer <= 0) {
      storm(world);
      world.bag.stormTimer = 20 + Math.random() * 6;
    }
    stepPoops(world, dt);
  },

  draw(ctx, world, time, boil, upright) {
    for (const splat of world.bag.splats) upright(splat.x, splat.y, () => drawSplat(ctx, splat));
    for (const poop of world.bag.poops) upright(poop.x, poop.y, () => drawPoop(ctx, poop, boil));
  },

  /// 방장이 손님에게 넘길 것. 뿌린 초기값만 넘기고 굴리기는 각자 한다.
  pack(world) {
    const fresh = world.bag.fresh;
    if (!fresh.length) return null;
    const add = fresh.splice(0, fresh.length);
    return { add };
  },

  unpack(world, data) {
    if (!data?.add) return;
    for (const [x, y, r, vx, vy, spin, spinV, seed] of data.add) {
      world.bag.poops.push({ x, y, r, bucket: bucketFor(r), vy, vx, spin, spinV, seed });
    }
  },

  resize(world) {
    for (const splat of world.bag.splats) splat.y = world.groundY + 2;
  },
};
