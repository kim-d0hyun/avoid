// 배구.
//
// 가운데 네트, 좌우 두 편. 공이 우리 쪽 바닥에 닿으면 상대 점수. 다섯 점 먼저.
//
// 공을 누가 굴리나 — **방장이 굴린다.**
//
// 똥은 각자 굴려도 됐다. 사람과 부딪히지 않으니 각자 화면에서 계산이 조금 달라도
// 아무 일도 안 생긴다. 공은 다르다. 누가 언제 어느 각도로 쳤느냐로 궤적이 갈리는데,
// 화면마다 사람 자리가 몇 픽셀씩 다르면 **튀는 방향이 갈라지고 한번 갈라지면 안 돌아온다.**
// 내 화면에선 넘어간 공이 남의 화면에선 네트에 걸린다.
//
// 그래서 공은 방장 것이다. 방장이 굴리고 60Hz 로 자리와 속도를 뿌린다. 손님은 받은
// 속도로 사이를 메워 그리고, 어긋난 만큼은 사람한테 쓰는 것과 같은 방식으로 녹인다.
// 친 사람은 자기가 친 것이 한 왕복만큼 늦게 반영되는데, 사무실 랜에서는 1~3ms 라
// 아무도 못 느낀다. 애초에 같은 와이파이 전용이라 이 선택이 가능하다.

import { INK, RED, PENCIL, stroke, circle, text } from '../draw/ink.js';

// 편은 옷 색으로 가른다. 번호가 아니라 **보이는 것**으로 갈라야 한 눈에 읽힌다.
//
// 이 게임의 빨강(#c63028)은 「너에게 중요한 것」 한 가지 뜻으로만 쓰기로 한 색이라
// 셔츠에는 다른 빨강을 쓴다 — 색연필로 칠한 듯한, 조금 어둡고 탁한 벽돌색.
// 이름 밑 빨간 밑줄과 헷갈리지 않는다.
const TEAM_INK = ['#b5352f', '#2f6fb0'];
import { BODY_H } from '../draw/stickman.js';

const HAN = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

const BALL_R = 15;
const GRAVITY = 900;        // 똥보다 가볍게 — 랠리가 이어지려면 천천히 떠 있어야 한다
const BOUNCE = 0.92;        // 몸에 맞고 튈 때 남는 기운
const HIT_UP = 620;         // 몸에 맞으면 위로 이만큼 튄다
const HIT_SIDE = 300;       // 몸 중심에서 벗어난 만큼 옆으로
const SPIKE_REACH = 78;     // ⌥Space 로 때릴 수 있는 거리
const SPIKE_DOWN = 900;     // 공중에서 때리면 내리꽂는다
const SPIKE_SIDE = 640;
const TOSS_UP = 780;        // 땅에서 때리면 띄운다
const MAX_SPEED = 1500;
// 바닥에서 네트 꼭대기까지.
//
// 사람 키가 60, 점프 높이가 65다(480²÷2÷1760). 뛰면 손이 150쯤까지 올라가므로
// 125 로 두면 **서서는 못 넘기고 뛰면 넘긴다** — 그게 배구다. 190 이면 아무도 못 넘긴다.
const NET_H = 125;
const SERVE_UP = 520;
const WIN_AT = 5;
const RESET_WAIT = 1.1;     // 점수 난 뒤 다음 서브까지

// 편 가르기.
//
// **서 있는 자리가 곧 편이다.** 따로 주고받는 값이 없다 — 자리는 어차피 60Hz 로 오간다.
// 판이 도는 동안은 네트를 못 넘으니 편이 안 바뀌고, 판과 판 사이에는 걸어서 넘어가면
// 편이 바뀐다. 「편 바꾸기」 메뉴를 따로 둘 필요가 없고, 누가 어느 편인지 보고 있으면 안다.
const NET_GAP = 14;   // 네트에 몸이 닿는 자리까지는 간다

export const sideOfX = (world, x) => (x < world.w / 2 ? 0 : 1);
const teamName = (side) => (side === 0 ? '빨강' : '파랑');

/// 편 나누기는 **방장이 한다.**
///
/// 각자 정하게 두면 몰린다. 손님은 들어온 시각이 달라서 자기가 몇 번째인지도 서로 다르게
/// 알고, 그 상태로 각자 홀짝을 세면 네 명이 다 한쪽에 설 수도 있다. 그래서 방장이
/// 번호 순으로 갈라 명단을 만들어 뿌리고, 손님은 그 명단을 따른다.
///
/// 손으로 바꾼 사람은 그 선택을 지켜 준다 — 방장에게 알려 두면 다음 명단부터 반영된다.
function rosterSides(world) {
  const mp = world.mp;
  const ids = [mp.myId, ...mp.others.keys()].sort((a, b) => a - b);
  const picked = world.bag.picked ?? new Map();
  const out = new Map();
  let auto = 0;
  for (const id of ids) {
    if (picked.has(id)) out.set(id, picked.get(id));
    else out.set(id, auto++ % 2);       // 고른 사람을 빼고 남은 사람끼리 반씩
  }
  return out;
}

/// 지금 살아 있는 사람들을 편 별로 모은다. 이름표에 쓸 이름까지 같이.
export function teams(world) {
  const rows = [[], []];
  const add = (name, x, mine) => rows[sideOfX(world, x)].push({ name, mine });
  add(world.mp.myName || '나', world.player.x, true);
  for (const other of world.mp.others.values()) {
    if (other.waiting) continue;
    add(other.name || '?', other.x, false);
  }
  return rows;
}

function serve(world, toSide) {
  const b = world.bag;
  b.ball.x = toSide === 0 ? world.w * 0.25 : world.w * 0.75;
  b.ball.y = world.groundY - NET_H - 120;
  b.ball.vx = 0;
  b.ball.vy = -SERVE_UP;
  b.ball.spin = 0;
  b.ball.spinV = (Math.random() - 0.5) * 2;
  b.wait = RESET_WAIT;
}

/// 공이 사람 몸에 닿았나. 몸은 세로로 긴 알약이라 가로·세로를 따로 본다.
function touches(ball, p) {
  const feet = p.groundY - p.air;
  const top = feet - BODY_H * (1 - 0.44 * p.crouch);
  const cx = Math.max(p.x - 11, Math.min(ball.x, p.x + 11));
  const cy = Math.max(top, Math.min(ball.y, feet));
  const dx = ball.x - cx;
  const dy = ball.y - cy;
  return dx * dx + dy * dy < (BALL_R + 7) ** 2;
}

function bounceOff(ball, p) {
  const off = (ball.x - p.x) / 22;                 // 몸 가운데에서 벗어난 만큼 옆으로
  ball.vx = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, ball.vx * 0.35 + off * HIT_SIDE + p.vx * 0.35));
  ball.vy = -HIT_UP - Math.max(0, -p.vy) * 0.25;   // 뛰어오르며 맞히면 더 높이
  ball.spinV = off * 0.9;
  // 몸 밖으로 밀어내 둔다. 안 그러면 다음 프레임에 또 맞아서 붙어 버린다.
  ball.y = Math.min(ball.y, p.groundY - p.air - BODY_H - BALL_R * 0.4);
}

/// ⌥Space. 손이 닿으면 때린다 — 공중이면 내리꽂고 땅이면 띄운다.
export function spike(world) {
  const b = world.bag;
  const p = world.player;
  if (!b?.ball || world.state !== 'play' || p.dead || b.wait > 0) return false;
  const ball = b.ball;
  const dx = ball.x - p.x;
  const dy = ball.y - (p.groundY - p.air - BODY_H * 0.7);
  if (dx * dx + dy * dy > SPIKE_REACH * SPIKE_REACH) return false;

  const dir = p.facing || (dx >= 0 ? 1 : -1);
  if (p.air > 12) {
    ball.vx = dir * SPIKE_SIDE;
    ball.vy = SPIKE_DOWN;                          // 아래로 (y 는 아래가 +)
  } else {
    ball.vx = dir * (SPIKE_SIDE * 0.45);
    ball.vy = -TOSS_UP;
  }
  ball.spinV = dir * 2.2;
  b.hitBy = world.mp.myId;
  return true;
}

function point(world, toSide) {
  const b = world.bag;
  b.score[toSide]++;
  b.lastPoint = { side: toSide, at: world.elapsed };
  serve(world, 1 - toSide);                        // 진 쪽에서 다시 올린다
}

export default {
  id: 'volley',
  name: '배구',
  line: '빨강 편 대 파랑 편. 우리 쪽에 떨어뜨리면 상대 점수. 다섯 점 먼저 (혼자면 연습).',
  keys: [['⌥ ← →', '달리기 (네트는 못 넘는다)'], ['⌥ ↑', '점프'],
         ['⌥ Space', '때리기 (공중이면 강타)'], ['⌥ M', '편 바꾸기']],
  tally: (world) => `${world.bag?.score?.[0] ?? 0} : ${world.bag?.score?.[1] ?? 0}`,
  /// 배구는 몸으로 공을 맞히는 게임이라 서로 붙잡으면 아무것도 안 된다.
  noGrab: true,
  /// 편 이름. 이게 있으면 메뉴에 「편 바꾸기」가 생긴다.
  teamNames: ['빨강', '파랑'],
  /// 옷 색은 번호가 아니라 **선 자리**로 정한다. 왼쪽은 빨강, 오른쪽은 파랑.
  shirt: (world, x) => TEAM_INK[sideOfX(world, x)],
  /// ⌥Space 를 이 게임이 가져간다.
  action: (world) => spike(world),

  /// **네트는 못 넘는다.** 이게 팀전을 팀전으로 만든다 — 넘어 다닐 수 있으면 편이
  /// 이름뿐이고, 결국 다 같이 공 하나를 쫓는 게임이 된다. 언제나 자기 구역 안이다.
  /// 편을 바꾸려면 ⌥M → 편 바꾸기.
  confine(world, p) {
    const side = world.team ?? 0;
    const half = world.w / 2;
    if (side === 0 && p.x > half - NET_GAP) { p.x = half - NET_GAP; p.vx = Math.min(0, p.vx); }
    if (side === 1 && p.x < half + NET_GAP) { p.x = half + NET_GAP; p.vx = Math.max(0, p.vx); }
  },

  /// 자기 코트에 선다. 편을 아직 안 정했으면 번호 순으로 갈라 반씩 나눠 갖는다.
  stand(world, slot) {
    if (world.team === undefined) world.team = slot % 2;
    const half = world.w / 2;
    world.player.x = world.team === 0
      ? half * (0.3 + 0.4 * Math.random())
      : half + half * (0.3 + 0.4 * Math.random());
    world.player.vx = 0;
  },

  /// 판이 새로 열릴 때. 점수를 지우고 공을 다시 올린다.
  begin(world) {
    world.bag.score = [0, 0];
    world.bag.started = false;
  },

  fresh: () => ({
    ball: { x: 0, y: 0, vx: 0, vy: 0, spin: 0, spinV: 0 },
    score: [0, 0], wait: RESET_WAIT, lastPoint: null, started: false,
    // 손님이 받은 공을 부드럽게 따라가려고 남겨 두는 것.
    age: 0, errorX: 0, errorY: 0,
  }),

  update(world, dt) {
    const b = world.bag;
    if (!b.started) {
      // 판 크기를 알게 된 첫 프레임에 공을 올린다.
      if (!world.w) return;
      serve(world, Math.random() < 0.5 ? 0 : 1);
      b.started = true;
    }
    // 방장은 자기가 만든 명단을 자기도 따른다. 안 그러면 방장만 딴 편에 서 있게 된다.
    if (world.mp.role === 'host') {
      const mine = rosterSides(world).get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) {
        world.team = mine;
        const half = world.w / 2;
        if (mine === 0 && world.player.x > half) world.player.x = half * 0.6;
        if (mine === 1 && world.player.x < half) world.player.x = half * 1.4;
      }
    }
    if (world.state !== 'play') return;

    // 손님은 방장이 뿌린 공을 따라 그리기만 한다. 판정도 방장이 한다.
    if (world.mp.role === 'guest') {
      b.age = Math.min(b.age + dt, 0.18);
      b.errorX *= Math.exp(-dt / 0.06);
      b.errorY *= Math.exp(-dt / 0.06);
      b.ball.x = b.baseX + b.baseVX * b.age + b.errorX;
      b.ball.y = b.baseY + b.baseVY * b.age + 0.5 * GRAVITY * b.age * b.age + b.errorY;
      b.ball.spin += b.ball.spinV * dt;
      return;
    }

    if (b.wait > 0) { b.wait -= dt; return; }

    const ball = b.ball;
    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.spin += ball.spinV * dt;

    // 옆벽은 튕긴다. 공이 화면 밖으로 나가면 아무도 못 쫓아간다.
    if (ball.x < BALL_R) { ball.x = BALL_R; ball.vx = Math.abs(ball.vx) * BOUNCE; }
    if (ball.x > world.w - BALL_R) { ball.x = world.w - BALL_R; ball.vx = -Math.abs(ball.vx) * BOUNCE; }

    // 네트. 꼭대기는 넘어가고, 몸통에 맞으면 되돌아온다.
    const netX = world.w / 2;
    const netTop = world.groundY - NET_H;
    if (Math.abs(ball.x - netX) < BALL_R + 3 && ball.y > netTop) {
      ball.x = netX + Math.sign(ball.x - netX || 1) * (BALL_R + 3);
      ball.vx = -ball.vx * 0.55;
    }

    // 사람에게 맞았나. 살아 있는 사람만 친다.
    const bodies = [world.player, ...world.mp.others.values()].filter((p) => !p.dead && !p.waiting);
    for (const p of bodies) {
      if (touches(ball, p)) { bounceOff(ball, p); break; }
    }

    // 바닥에 닿으면 그쪽이 실점.
    if (ball.y + BALL_R >= world.groundY) {
      point(world, ball.x < netX ? 1 : 0);
      return;
    }

    if (b.score[0] >= WIN_AT || b.score[1] >= WIN_AT) {
      const won = b.score[0] > b.score[1] ? 0 : 1;
      // 순위표 칸은 [이름, 시간ms, 개수, 번호] 다. 배구에서는 「점수」를 개수 칸에 넣는다.
      const rows = [0, 1]
        .map((side) => [`${teamName(side)} 팀`, Math.round(world.elapsed * 1000), b.score[side], -1 - side])
        .sort((a, c) => c[2] - a[2]);
      world.onGameOver?.({ name: `${teamName(won)} 팀`, side: won, rows });
      b.score = [0, 0];
    }
  },

  draw(ctx, world, time, boil, upright) {
    const b = world.bag;
    if (!b?.ball) return;
    const netX = world.w / 2;
    const netTop = world.groundY - NET_H;

    // 네트. 기둥 한 줄에 그물 빗금.
    stroke(ctx, [[netX, netTop], [netX, world.groundY]],
           { width: 3.4, color: INK, seed: 61, amp: 1.1 });
    for (let y = netTop + 8; y < world.groundY - 4; y += 15) {
      stroke(ctx, [[netX - 11, y], [netX + 11, y + 9]],
             { width: 1.3, color: PENCIL, seed: y | 0, amp: 0.5, halo: false, alpha: 0.65 });
    }
    stroke(ctx, [[netX - 13, netTop], [netX + 13, netTop]],
           { width: 3, color: INK, seed: 62, amp: 0.8 });

    // 공. 잉크 동그라미에 실밥 두 줄.
    upright(b.ball.x, b.ball.y, () => {
      ctx.save();
      ctx.translate(b.ball.x, b.ball.y);
      ctx.rotate(b.ball.spin);
      circle(ctx, 0, 0, BALL_R, { width: 3.2, color: INK, seed: 63, amp: 0.7 });
      stroke(ctx, [[-BALL_R * 0.8, -4], [0, -7], [BALL_R * 0.8, -4]],
             { width: 1.8, color: PENCIL, seed: 64, amp: 0.5, halo: false });
      stroke(ctx, [[-BALL_R * 0.8, 5], [0, 8], [BALL_R * 0.8, 5]],
             { width: 1.8, color: PENCIL, seed: 65, amp: 0.5, halo: false });
      ctx.restore();
    });

    // 점수. 네트 위에 좌우로.
    const y = netTop - 34;
    text(ctx, String(b.score[0]), netX - 44, y,
         { font: `800 30px ${HAN}`, color: TEAM_INK[0], align: 'center', halo: 3 });
    text(ctx, ':', netX, y, { font: `800 24px ${HAN}`, color: PENCIL, align: 'center', halo: 3 });
    text(ctx, String(b.score[1]), netX + 44, y,
         { font: `800 30px ${HAN}`, color: TEAM_INK[1], align: 'center', halo: 3 });
    // 누가 어느 편인지. 점수 밑에 이름을 적어 두면 편을 물어볼 일이 없다.
    const rows = teams(world);
    rows.forEach((members, side) => {
      const at = netX + (side === 0 ? -44 : 44);
      const label = members.length
        ? members.map((m) => (m.mine ? `${m.name}(나)` : m.name)).join(' · ')
        : '아무도 없음';
      text(ctx, label, at, y + 20, {
        font: `${members.some((m) => m.mine) ? 800 : 600} 12px ${HAN}`,
        color: TEAM_INK[side], align: 'center', halo: 3,
      });
    });

    if (b.wait > 0) {
      text(ctx, '서브', b.ball.x, b.ball.y - 30,
           { font: `700 13px ${HAN}`, color: RED, align: 'center', halo: 3 });
    }
  },

  /// 손님이 「나 편 바꿨다」고 알려 온다. 방장만 듣는다.
  message(world, from, msg) {
    if (world.mp.role !== 'host' || typeof msg.s !== 'number') return;
    (world.bag.picked ??= new Map()).set(from, msg.s ? 1 : 0);
  },

  /// 편을 바꾼다. 내 화면에서 먼저 옮기고 방장에게 알린다 —
  /// 방장이 명단을 다시 뿌리면 남들 화면에서도 옮겨진다.
  swap(world, shell) {
    world.team = 1 - (world.team ?? 0);
    (world.bag.picked ??= new Map()).set(world.mp.myId, world.team);
    if (world.mp.on) shell?.net?.send?.({ t: 'gm', s: world.team });
  },

  pack(world) {
    const b = world.bag;
    const sides = rosterSides(world);
    return {
      tm: [...sides.entries()],
      b: [Math.round(b.ball.x * 10) / 10, Math.round(b.ball.y * 10) / 10,
          Math.round(b.ball.vx), Math.round(b.ball.vy),
          Math.round(b.ball.spin * 100) / 100, Math.round(b.ball.spinV * 100) / 100],
      s: b.score,
      w: Math.round(b.wait * 100) / 100,
    };
  },

  unpack(world, data) {
    const b = world.bag;
    // 방장이 나눠 준 편 명단. 내 편이 여기 적힌 대로 바뀐다.
    if (data?.tm) {
      b.sides = new Map(data.tm);
      const mine = b.sides.get(world.mp.myId);
      if (mine !== undefined && mine !== world.team) {
        world.team = mine;
        // 반대편에 서 있었으면 옮겨 준다. 네트를 넘을 수는 없으니 여기서 옮겨야 한다.
        const half = world.w / 2;
        if (mine === 0 && world.player.x > half) world.player.x = half * 0.6;
        if (mine === 1 && world.player.x < half) world.player.x = half * 1.4;
      }
    }
    if (!data?.b) return;
    // 지금 그리고 있던 자리와 방금 온 자리의 차이를 남겨 두고 60ms 에 걸쳐 녹인다.
    // 사람한테 쓰는 것과 같은 방법이다 — 톡 끊어 옮기면 공이 순간이동한다.
    const showX = b.ball.x;
    const showY = b.ball.y;
    const [x, y, vx, vy, spin, spinV] = data.b;
    b.baseX = x; b.baseY = y; b.baseVX = vx; b.baseVY = vy;
    b.ball.spin = spin; b.ball.spinV = spinV;
    b.age = 0;
    b.errorX = showX - x;
    b.errorY = showY - y;
    if (Math.abs(b.errorX) > 200 || Math.abs(b.errorY) > 200) { b.errorX = 0; b.errorY = 0; }
    b.score = data.s ?? b.score;
    b.wait = data.w ?? 0;
    b.started = true;
  },

  resize() {},
};
