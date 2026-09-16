// 졸라맨.
//
// 뼈대를 각도로 만들고 그 위에 획을 긋는다. 상태마다 포즈를 따로 잡는 이유는,
// 달리기 사이클 하나를 전 상태에 돌려 쓰면 「같은 그림이 빨라지기만」 하기 때문이다.
// 서 있을 때 숨을 쉬고, 달리면 몸이 앞으로 기울고, 맞으면 획이 사방으로 흩어진다.
//
// 각도는 전부 **똑바로 아래가 0**. 캔버스는 y 가 아래로 자라므로 sin 이 가로, cos 이 세로다.

import { INK, RED, PENCIL, stroke, circle, wiggle, text, setFade } from './ink.js';

const THIGH = 14, SHIN = 14, UPPER = 11, FORE = 11;
const TORSO = 25, NECK = 7, HEAD_R = 9.5;
const HIP_Y = -(THIGH + SHIN + 1);
/// 발끝에서 머리 꼭대기까지. 판정 상자가 이 값을 쓴다.
export const BODY_H = -HIP_Y + TORSO + NECK + HEAD_R * 2;
/// 내리치는 팔이 도는 시간 — 휘두름 · 맞댐 · 따라 휘기를 다 합친 길이.
/// 게임 쪽(배구)이 p.swing 에 이 값을 넣으면 그 자세가 나온다. 다른 게임은 안 넣으니 안 바뀐다.
export const SWING_TIME = 0.36;
/// 젖혀 둔 팔이 공까지 내려오는 시간. 두 프레임. 배구는 이 동안 공을 멈춰 둔다(히트스톱) —
/// 그래야 **손이 공에 닿는 순간과 공이 튀어 나가는 순간이 같다.**
export const SWING_WHIP = 2 / 60;
/// 땅에서 받아 올릴 때 두 팔을 머리 위로 밀어 올리는 시간.
export const TOSS_TIME = 0.22;
/// 어깨에서 손끝까지.
export const ARM_LEN = UPPER + FORE;
/// 맞는 순간 몸이 앞으로 숙는 정도. 게임 쪽이 어깨 자리를 셈할 때 같은 값을 쓴다.
const LEAN_HIT = 0.32;
const TAU = Math.PI * 2;
const EPS = 1e-6;

// 강타 준비 — 활시위를 당긴 모양. 치는 팔은 팔꿈치를 머리 뒤 위로 들고 손을 뒤통수 옆에 두고,
// 반대 팔은 앞으로 뻗어 공을 겨눈다. 등은 살짝 젖히고 두 다리는 뒤로 접는다.
const COCK = {
  lean: -0.16,
  legs: [[-0.32, -1.60], [0.12, -1.10]],
  // 치는 팔은 **팔꿈치를 귀 높이로 들고 손을 뒤로 접는다** — 팔꿈치가 안 접혀 있으면
  // 그냥 팔을 뒤로 늘어뜨린 그림이라 「당겼다」가 안 보이고, 따라서 휘두름도 안 보인다.
  arms: [[-2.55, -0.95], [2.15, 2.60]],
};
// 맞은 뒤. 반대 팔은 옆구리로 끌어내리고(반동), 다리는 앞으로 차올린다 — 몸이 접힌다.
const OFF_HIT = [0.35, -0.15];
const KICK_LEGS = [[0.20, -0.55], [0.55, 0.10]];
// 토스. 두 팔을 머리 위 앞으로.
const TOSS_ARMS = [[2.62, 2.95], [2.45, 2.85]];
// 블로킹 — 두 팔을 **곧게 위로.** 손이 머리 위로 뻗어 네트 너머를 덮는 모양이다.
// 토스(밀어 올리기)와 달리 팔꿈치를 안 접는다 — 접으면 벽이 아니라 받는 자세로 보인다.
const BLOCK_ARMS = [[3.02, 3.10], [2.90, 2.98]];
const BLOCK_LEGS = [[-0.22, -1.30], [0.10, -0.95]];   // 다리는 뒤로 살짝 접는다 (뛴 채)

// 야구 — 던지기와 치기.
//
// 배구의 내리치기(spike)와 **다른 스위치로 가른다.** 졸라맨은 게임 넷이 같이 쓰는 그림이라,
// 야구가 남겨 둔 p.pitchT 가 배구 화면에 새어 들면 서브를 올리다 투구 자세가 나온다.
//
// 각도는 이 파일의 규칙 그대로 — **똑바로 아래가 0**, 늘어나면 앞(sin) 을 지나 위(π) 로 돈다.

/// 다리를 들어 올리는 데서 공을 놓기까지. 이 시간이 곧 「던지는 티」다 —
/// 짧으면 공이 그냥 튀어나오고, 길면 누르고 나서 한참 기다리게 된다.
export const PITCH_TIME = 0.62;
/// 공이 손을 떠나는 지점 (0~1). 팔이 머리 위를 넘어 앞으로 나온 자리다.
export const PITCH_RELEASE = 0.86;
/// 배트가 도는 시간. 휘두름 · 맞댐 · 따라 휘기를 다 합친 길이.
export const BAT_TIME = 0.34;
/// 젖혀 둔 배트가 공까지 오는 데 걸리는 시간. 배구의 SWING_WHIP 과 같은 뜻이고,
/// 야구도 이 동안 공을 멈춰 둔다 — **배트가 공에 닿는 순간과 공이 튀어 나가는 순간이 같아야** 한다.
export const BAT_WHIP = 3 / 60;
/// 배트가 공에 붙어 있는 시간.
export const BAT_HOLD = 2 / 60;
/// 배트 길이 (어깨에서 손끝까지가 22 이니, 그보다 조금 길다).
const BAT_LEN = 31;

/// 투구 다섯 박자. [때, 기울기, 다리, 팔] — 사이는 이어 섞는다.
///
/// 셋째에서 넷째로 갈 때 치는 팔이 -2.30 에서 +2.20 으로 건너간다. 짧은 쪽으로 이으면
/// **머리 위를 넘어간다** — 그래야 오버핸드로 보인다. 밑으로 돌면 언더핸드가 된다.
const PITCH_KEYS = [
  [0.00,  0.02, [[-0.16, -0.20], [0.17, 0.21]], [[0.55, 1.05], [-0.50, -1.00]]],
  [0.40, -0.22, [[1.44, 0.34], [-0.10, -0.14]], [[2.58, 2.98], [2.38, 2.82]]],
  [0.70, -0.12, [[1.18, 1.02], [-0.42, -0.72]], [[-2.30, -1.48], [1.92, 2.42]]],
  [0.86,  0.28, [[0.86, 0.62], [-0.60, -1.16]], [[2.20, 1.70], [-1.18, -1.88]]],
  [1.00,  0.42, [[0.66, 0.46], [-0.78, -1.38]], [[1.02, 0.52], [-0.98, -1.58]]],
];

/// **공을 놓는 순간의 손 모양.** 구종마다 다르다.
///
/// 이게 없으면 타자에게 주어진 정보가 날아오는 공뿐이라 **수싸움의 절반이 비어 있다** —
/// 기획서에 「안 보여 주면 순전히 찍기가 된다」고 적어 놓고 안 넣었던 자리다.
/// 세 프레임짜리 차이라 처음엔 안 보이지만, 보기 시작하면 읽힌다.
///
///   fore  아래팔(손목)을 얼마나 틀었나   off  글러브 팔이 어디로 빠지나   reach  손이 얼마나 뻗나
const GRIPS = [
  { fore: 0.00, off: 0.00, reach: 1.00 },   // 직구 — 손끝이 곧게 앞으로
  { fore: 0.62, off: -0.34, reach: 0.90 },  // 슬라이더 — 손목을 옆으로 눕혀 긁는다
  { fore: -0.78, off: 0.38, reach: 0.84 },  // 커브 — 손목을 안으로 꺾어 감아 내린다
  { fore: 0.26, off: 0.22, reach: 1.10 },   // 체인지업 — 손이 한 박자 늦게 빠진다
];
/// 손 모양이 드러나기 시작하는 지점 (0~1 중). 팔이 머리 위를 넘어온 뒤다.
const GRIP_FROM = 0.62;

/// 타격 세 박자. 배트 각도까지 같이 든다 — 배트는 손끝에서 이 각도로 뻗는다.
/// 배트 각은 **한 바퀴를 편 채로** 적는다 (−2.78 → −4.56 → −6.50).
///
/// 짧은 쪽으로 잇는 lerpAngle 에 맡기면, 맞은 뒤 따라 휘기에서 배트만 **되감긴다** —
/// 팔은 계속 앞으로 도는데 배트는 머리 위를 거슬러 올라갔다 내려온다. 한 구간이 π 를 넘는
/// 순간 짧은 쪽이 반대쪽이 되기 때문이다. 배트만 섞는 법을 따로 두어(mixPose) 곧이곧대로 잇는다.
const BAT_STANCE = { lean: -0.07, legs: [[-0.32, -0.36], [0.28, 0.32]],
                     arms: [[-1.28, -2.28], [-1.06, -2.06]], bat: -2.78 };
const BAT_MEET   = { lean:  0.24, legs: [[0.30, 0.16], [-0.34, -0.52]],
                     arms: [[1.34, 1.66], [1.08, 1.42]], bat: -4.56 };
const BAT_THRU   = { lean:  0.14, legs: [[0.46, 0.30], [-0.50, -0.86]],
                     arms: [[2.55, 3.05], [2.30, 2.80]], bat: -6.50 };
/// 글러브를 낀 수비수가 공을 기다리는 자세. 무릎을 조금 굽히고 두 손을 앞으로 낮게.
const FIELD_READY = { lean: 0.16, legs: [[-0.40, -0.66], [0.38, 0.62]],
                      arms: [[1.15, 1.48], [0.92, 1.26]] };

const lerp = (a, b, t) => a + (b - a) * t;
/// 각도를 짧은 쪽으로 잇는다. 그냥 섞으면 머리 위로 올라가야 할 팔이 발밑을 지나 돈다.
const wrapPi = (a) => a - TAU * Math.round(a / TAU);
const lerpAngle = (a, b, t) => a + wrapPi(b - a) * t;
const mixLimbs = (a, b, t) => a.map((pair, i) => pair.map((v, j) => lerpAngle(v, b[i][j], t)));
const smooth = (t) => { const k = Math.max(0, Math.min(1, t)); return k * k * (3 - 2 * k); };

/// 몸을 어느 쪽으로 돌려 그리나. 휘두르는 동안은 **때린 쪽**을 본다 — 뒷걸음질하다 쳐도
/// 팔은 공이 가는 쪽으로 돈다.
export function faceOf(p, spike = true) {
  return spike && p.swing > 0 && (p.swingDir === 1 || p.swingDir === -1) ? p.swingDir : p.facing;
}

/// 맞는 순간의 어깨 자리(판 좌표). 배구가 공을 손끝에 붙일 때 이걸 쓴다.
export function swingShoulder(p, face = faceOf(p)) {
  return {
    x: p.x + face * Math.sin(LEAN_HIT) * TORSO,
    y: p.groundY - p.air + HIP_Y - Math.cos(LEAN_HIT) * TORSO,
  };
}

/// 지금 휘두름의 어느 박자인가. whip(내려오는 중) · contact(공에 닿아 있음) · follow(따라 휘기).
export function swingPhase(p) {
  if (!(p.swing > 0)) return null;
  const u = SWING_TIME - p.swing;
  const hold = p.swingHold ?? 2 / 60;
  if (u < SWING_WHIP - EPS) return 'whip';
  if (u < SWING_WHIP + hold - EPS) return 'contact';
  return 'follow';
}

function limb(ox, oy, a1, l1, a2, l2) {
  const jx = ox + Math.sin(a1) * l1;
  const jy = oy + Math.cos(a1) * l1;
  return [[ox, oy], [jx, jy], [jx + Math.sin(a2) * l2, jy + Math.cos(a2) * l2]];
}

/// 달릴 때의 다리. 무릎은 뒤로만 접히고, 뒤꿈치는 발을 뒤로 뺄 때 가장 높이 올라온다.
function runLegs(ph, run) {
  const swing = 0.34 + run * 0.44;
  const heelUp = (phase) => 0.24 + 0.66 * (0.5 - 0.5 * Math.cos(phase)) * run;
  const thigh = Math.sin(ph) * swing;
  return [[thigh, thigh - heelUp(ph)], [-thigh, -thigh - heelUp(ph + Math.PI)]];
}

function basePose(p, time, spike = true) {
  const c = p.crouch;

  // 이긴 사람. 두 팔을 번쩍 들고 발을 구른다.
  if (p.cheer) {
    const hop = Math.abs(Math.sin(time * 5.5));
    return {
      hipY: HIP_Y - hop * 7, lean: 0, bob: -hop * 3,
      legs: [[-0.30 - hop * 0.5, -0.46 - hop * 0.7], [0.30 + hop * 0.5, 0.46 + hop * 0.7]],
      arms: [[2.55 + hop * 0.12, 2.95], [-2.55 - hop * 0.12, -2.95]],
    };
  }

  // 다음 판을 기다리는 사람. 넘어져 있으면 「죽었다」로 읽히는데 그건 사실이 아니다 —
  // 팔짱을 끼고 서서 구경하는 자세로 둔다.
  if (p.waiting) {
    const sway = Math.sin(time * 1.6);
    return {
      hipY: HIP_Y, lean: 0.02, bob: sway * 0.6,
      legs: [[-0.16, -0.18], [0.17, 0.19]],
      arms: [[1.15, 2.35], [-1.15, -2.35]],   // 팔짱
    };
  }

  if (p.air > 0.5) {
    // 공중. 앞다리는 접고 뒷다리는 뻗고 팔은 위로 — 떴다는 게 실루엣만으로 읽혀야 한다.
    const rise = Math.max(-1, Math.min(1, (p.vyDraw ?? p.vy) / 420));
    const air = {
      hipY: HIP_Y, lean: 0.06, bob: 0,
      legs: [[-0.70, -1.45], [0.55, 0.85]],
      arms: [[-2.30 - rise * 0.22, -2.75], [-1.90 + rise * 0.18, -2.45]],
    };
    // 배구 — 공이 가까이 오면 팔을 젖혀 둔다(p.cock, 0~1). 치기 **전**에 준비 자세가 보여야
    // 휘두름이 휘두름으로 읽힌다. 공과 사람 자리만으로 정해지니 누구 화면에서나 같다.
    const ck = spike ? (p.cock ?? 0) : 0;   // 웅크리기(c) 와 헷갈리지 않게 따로 이름을 둔다
    if (ck > 0.001) {
      air.lean = lerp(air.lean, COCK.lean, ck);
      air.legs = mixLimbs(air.legs, COCK.legs, ck);
      air.arms = mixLimbs(air.arms, COCK.arms, ck);
    }
    return air;
  }

  if (c > 0.05) {
    // 웅크리기. 무릎을 깊게 접어 앉고 팔로 머리를 감싼다. 판정 상자가 절반이 되는 자세다.
    const deep = (a, b) => a + (b - a) * c;
    return {
      hipY: deep(HIP_Y, HIP_Y + 16), lean: deep(0.10, 0.46), bob: 0,
      legs: [[deep(0, -1.15), deep(0, 1.30)], [deep(0, 1.15), deep(0, -1.30)]],
      arms: [[deep(0.16, 2.05), deep(0.30, 2.80)], [deep(-0.16, -2.05), deep(-0.30, -2.80)]],
    };
  }

  // 몸을 던진 자세. 거의 눕다시피 해서 팔을 앞으로 뻗는다 —
  // 서서 못 받는 공을 받는 동작이라, 낮고 길어 보여야 뜻이 통한다.
  if (p.slide > 0) {
    const go = Math.min(1, p.slide / 0.42);
    return {
      hipY: HIP_Y * 0.34, lean: 1.18, bob: 0,
      legs: [[-0.55, -0.30], [-0.20, 0.34]],
      arms: [[1.52, 1.66], [1.34, 1.52]],
      slide: go,
    };
  }

  const run = Math.min(Math.abs(p.vx) / 520, 1);

  // 붙잡고 있으면 앞팔을 상대 쪽으로 뻗는다. 뻗은 팔 하나로 상황이 다 읽힌다.
  // **다리는 제 갈 길을 간다** — 끌고 가는 중이면 걷는 다리가 나와야 끌고 가는 것으로 보인다.
  if (p.grabbing >= 0 || p.heldBy >= 0) {
    const holding = p.grabbing >= 0;
    const shake = p.heldBy >= 0 ? Math.sin(time * 34) * 0.16 : 0;
    return {
      hipY: HIP_Y, lean: holding ? 0.24 : -0.16,
      bob: run > 0.05 ? -Math.abs(Math.sin(p.walk)) * (1.2 + run * 1.6)
                      : Math.sin(time * 9) * 1.2,
      legs: run > 0.05 ? runLegs(p.walk, run) : [[-0.34, -0.42], [0.36, 0.44]],
      // 잡은 쪽은 두 팔을 앞으로, 잡힌 쪽은 뿌리치듯 위로 허둥댄다.
      arms: holding
        ? [[1.45, 1.62], [1.30, 1.50]]
        : [[-1.9 + shake, -2.6 + shake], [-1.5 - shake, -2.3 - shake]],
    };
  }

  if (run > 0.03) {
    const ph = p.walk;
    // 팔은 같은 쪽 다리와 반대 위상. 이게 어긋나면 사람이 아니라 인형처럼 걷는다.
    const armSwing = 0.30 + run * 0.40;
    const swing = -Math.sin(ph);            // +1 이면 앞, -1 이면 뒤
    const upperL = swing * armSwing;
    // **팔꿈치는 앞으로만 접힌다.** 사람 팔꿈치가 그렇게 생겼다.
    //
    // 앞으로 나온 팔은 깊게 접혀 손이 가슴 앞에 서고, 뒤로 간 팔은 거의 펴져 손이
    // 엉덩이 뒤에 남는다. 접는 각을 고정해 두면 두 손이 **늘 뒤를 향하는** 그림이 나온다 —
    // 위팔만 앞뒤로 흔들리고 아래팔이 그만큼 뒤로 꺾여서, 달리는 게 아니라 끌려가 보인다.
    const bend = (front) => (0.62 + 0.82 * front) * (0.7 + run * 0.3);
    return {
      hipY: HIP_Y, lean: 0.09 + run * 0.16,
      bob: -Math.abs(Math.sin(ph)) * (1.4 + run * 2.0),
      legs: runLegs(ph, run),
      arms: [[upperL, upperL + bend(swing)], [-upperL, -upperL + bend(-swing)]],
    };
  }

  // 가만히. 숨만 쉰다. 이 미세한 움직임이 없으면 죽은 그림으로 보인다.
  const breath = Math.sin(time * 2.3);
  return {
    hipY: HIP_Y, lean: 0.03, bob: breath * 0.8,
    legs: [[-0.13, -0.15], [0.14, 0.16]],
    arms: [[0.62 + breath * 0.05, 0.74 + breath * 0.07],
           [-0.62 - breath * 0.05, -0.74 - breath * 0.07]],
  };
}

/// spike — **배구에서만 켠다.** 치는 모션(p.swing·p.toss·p.cock)은 이 스위치가 켜져야 나온다.
/// 졸라맨은 다른 게임도 쓰니, 배구가 남겨 둔 값이 남의 그림에 새어 들면 안 된다 —
/// 판을 갈아 끼울 때 휘두르던 사람이 다음 게임에서 그 자세로 굳는 일이 실제로 일어난다.
function pose(p, time, face = faceOf(p), spike = true, bat = false) {
  const base = basePose(p, time, spike);
  if (p.dead || p.cheer || p.waiting) return base;
  // 야구. 던지기 · 치기 · 배트 세우고 기다리기 · 글러브 들고 기다리기 — 이 순서로 센다.
  // 달리는 중에는 아무것도 안 덮는다(주자와 타구를 쫓는 수비수는 그냥 달려야 한다).
  if (bat) {
    if (p.pitchT > 0) return pitchPose(p, base);
    if (p.batT > 0) return batPose(p, base);
    // 웅크린 포수와 달리는 사람은 제 자세를 그대로 쓴다. 글러브만 얹는다.
    if (p.crouch > 0.05 || Math.abs(p.vx ?? 0) > 16) return p.glove ? { ...base, glove: 1 } : base;
    if (p.stance) return stancePose(p, base);
    if (p.glove) return readyPose(p, base);
    return base;
  }
  if (!spike) return base;
  // 벽이 먼저다 — 벽을 세운 사람은 휘두르지 않는다.
  if (p.block > 0) return blockPose(p, base);
  if (p.swing > 0) return swingPose(p, base, face);
  if (p.toss > 0) return tossPose(p, base);
  return base;
}

/// **내리치기** — 준비 · 휘두름 · 따라 휘기.
///
/// 공이 빨라지는 것만으로는 「세게 쳤다」가 안 읽힌다. 치는 사람이 팔을 젖혔다가 공을 향해
/// 내리쳐야 맞은 공이 세 보인다. 박자는 셋이다:
///
///   휘두름   SWING_WHIP (두 프레임)  젖힌 팔이 머리 위를 넘어 **공 쪽으로** 내려온다. 가속하며.
///   맞댐     p.swingHold             팔을 쭉 뻗어 손끝이 공에 닿아 있다. 이 동안 공은 멈춰 있다.
///   따라 휘기  나머지                  팔이 앞 아래로 끝까지 돌고, 몸이 접혔다가 원래 자세로 풀린다.
///
/// 팔은 정해진 각도로 도는 게 아니라 **공을 겨눈다** (p.aim = [x, y, 반지름]). 공이 머리 위에
/// 있든 앞에 있든 손끝이 공에 닿는다. 팔 길이가 모자라면 조금(1.35배까지) 늘여 뻗는다.
function swingPose(p, base, face) {
  const hold = p.swingHold ?? 2 / 60;
  const u = SWING_TIME - p.swing;
  const follow = Math.max(0.05, SWING_TIME - SWING_WHIP - hold);

  // 맞을 때의 어깨에서 공까지. 뒤집힌 공간이라 +x 가 늘 앞(때리는 쪽)이다.
  const sx = Math.sin(LEAN_HIT) * TORSO;
  const sy = HIP_Y - Math.cos(LEAN_HIT) * TORSO;
  let aim = 2.3;                 // 공을 모르면 앞 위
  let reach = 1;
  const [ax, ay, ar] = Array.isArray(p.aim) ? p.aim : [];
  if (Number.isFinite(ax) && Number.isFinite(ay)) {
    const dx = (ax - p.x) * face - sx;
    const dy = ay - (p.groundY - p.air) - sy;
    aim = Math.atan2(dx, dy);
    reach = Math.max(0.75, Math.min(1.35, (Math.hypot(dx, dy) - (ar ?? 20) * 0.8) / ARM_LEN));
  }
  // 젖힌 자리에서 **머리 위를 넘어** 공까지 간다 — 각이 줄어드는 쪽으로만 돈다.
  let hit = aim;
  while (hit > COCK.arms[0][0] + 0.9) hit -= TAU;
  while (hit <= COCK.arms[0][0] + 0.9 - TAU) hit += TAU;

  const airborne = p.air > 0.5;
  if (u < SWING_WHIP) {
    const e = (u / SWING_WHIP) ** 2;                 // 가속하며 내려온다
    return {
      hipY: HIP_Y, lean: lerp(COCK.lean, LEAN_HIT, e), bob: 0,
      legs: airborne ? mixLimbs(COCK.legs, KICK_LEGS, e) : base.legs,
      // 팔꿈치가 먼저 오고 손은 한 박자 늦게 채찍처럼 따라온다.
      arms: [[lerp(COCK.arms[0][0], hit, e), lerp(COCK.arms[0][1], hit, e ** 1.7)],
             [lerpAngle(COCK.arms[1][0], OFF_HIT[0], e), lerpAngle(COCK.arms[1][1], OFF_HIT[1], e)]],
      reach: [lerp(1, reach, e), 1],
    };
  }
  if (u < SWING_WHIP + hold) {
    return {
      hipY: HIP_Y, lean: LEAN_HIT, bob: 0,
      legs: airborne ? KICK_LEGS : base.legs,
      arms: [[hit, hit], [...OFF_HIT]],
      reach: [reach, 1],
    };
  }
  // 따라 휘기. 앞쪽 55% 동안 팔이 앞 아래로 끝까지 돌고, 남은 동안 원래 자세로 풀린다.
  const k = Math.min(1, (u - SWING_WHIP - hold) / follow);
  const e = 1 - (1 - Math.min(1, k / 0.55)) ** 3;
  const end = Math.min(hit - 0.5, -TAU + 0.35);      // 앞 아래, 엉덩이 앞
  const w = smooth((k - 0.55) / 0.45);
  const upper = lerp(hit, end, e);
  const fore = lerp(hit, end - 0.35, e);             // 손목이 먼저 꺾여 내려간다
  return {
    hipY: lerp(HIP_Y, base.hipY, w), lean: lerp(lerp(LEAN_HIT, 0.55, e), base.lean, w),
    bob: base.bob * w,
    legs: airborne ? mixLimbs(KICK_LEGS, base.legs, w) : base.legs,
    arms: [[lerpAngle(upper, base.arms[0][0], w), lerpAngle(fore, base.arms[0][1], w)],
           [lerpAngle(OFF_HIT[0], base.arms[1][0], w), lerpAngle(OFF_HIT[1], base.arms[1][1], w)]],
    reach: [lerp(lerp(reach, 1, e), 1, w), 1],
  };
}

/// 받아 올리기(토스). 두 팔을 머리 위로 재빨리 밀어 올렸다가 천천히 내린다. 발끝으로 살짝 선다.
/// **블로킹** — 두 팔을 곧게 위로 뻗어 벽을 만든다. 0.3초 동안 섰다가 스르르 내린다.
function blockPose(p, base) {
  const k = Math.max(0, Math.min(1, p.block / 0.3));
  const w = smooth(Math.min(1, k * 3));          // 올라갈 땐 빠르게, 내려올 땐 남은 시간만큼
  return {
    ...base,
    lean: lerp(base.lean, -0.06, w),
    arms: mixLimbs(base.arms, BLOCK_ARMS, w),
    legs: mixLimbs(base.legs, BLOCK_LEGS, w),
  };
}

function tossPose(p, base) {
  const k = Math.max(0, Math.min(1, (TOSS_TIME - p.toss) / TOSS_TIME));
  const w = k < 0.22 ? smooth(k / 0.22) : 1 - smooth((k - 0.22) / 0.78);
  return {
    ...base,
    hipY: base.hipY - 3 * w,
    lean: lerp(base.lean, -0.04, w),
    arms: mixLimbs(base.arms, TOSS_ARMS, w),
  };
}

/// **투구.** 다리를 들었다가 내딛으며 팔이 머리 위를 넘어온다.
///
/// 박자를 다섯으로 나눠 둔 이유는, 하나짜리 곡선으로 이으면 「팔만 도는 그림」이 되기
/// 때문이다. 던지는 티는 팔이 아니라 **다리와 몸통**에서 난다 — 들고, 내딛고, 따라 나간다.
function pitchPose(p, base) {
  const u = Math.max(0, Math.min(1, 1 - p.pitchT / PITCH_TIME));
  let i = 0;
  while (i < PITCH_KEYS.length - 2 && u > PITCH_KEYS[i + 1][0]) i++;
  const [u0, lean0, legs0, arms0] = PITCH_KEYS[i];
  const [u1, lean1, legs1, arms1] = PITCH_KEYS[i + 1];
  const k = smooth((u - u0) / Math.max(1e-6, u1 - u0));
  const arms = mixLimbs(arms0, arms1, k);
  // 구종별 손 모양. 팔이 머리 위를 넘어온 뒤부터 드러나고 놓는 순간 제일 크다.
  const grip = GRIPS[((p.grip | 0) % GRIPS.length + GRIPS.length) % GRIPS.length];
  const show = smooth((u - GRIP_FROM) / (1 - GRIP_FROM));
  if (show > 0.001) {
    arms[0][1] += grip.fore * show;
    arms[1][0] += grip.off * show;
    arms[1][1] += grip.off * show * 0.6;
  }
  return {
    hipY: HIP_Y, bob: 0,
    lean: lerp(lean0, lean1, k),
    legs: mixLimbs(legs0, legs1, k),
    arms,
    reach: [1 + (grip.reach - 1) * show, 1],
    glove: 1,
  };
}

/// **타격.** 젖힌 배트가 공까지 돌고(휘두름), 잠깐 붙어 있다가(맞댐), 어깨 너머로 감긴다.
/// 배구의 내리치기와 같은 세 박자다 — 맞댐이 있어야 「닿았다」가 보인다.
function batPose(p, base) {
  const u = BAT_TIME - p.batT;
  if (u < BAT_WHIP) return mixPose(BAT_STANCE, BAT_MEET, (u / BAT_WHIP) ** 1.7);
  if (u < BAT_WHIP + BAT_HOLD) return mixPose(BAT_MEET, BAT_MEET, 0);
  const k = Math.min(1, (u - BAT_WHIP - BAT_HOLD) / Math.max(0.05, BAT_TIME - BAT_WHIP - BAT_HOLD));
  // 앞 60% 는 배트가 끝까지 감기고, 나머지는 준비 자세로 풀린다.
  return k < 0.6 ? mixPose(BAT_MEET, BAT_THRU, smooth(k / 0.6))
                 : mixPose(BAT_THRU, BAT_STANCE, smooth((k - 0.6) / 0.4));
}

/// 배트를 세우고 기다리는 자세. 숨 쉬는 몫만 base 에서 가져온다.
function stancePose(p, base) {
  return { ...mixPose(BAT_STANCE, BAT_STANCE, 0), bob: base.bob * 0.6 };
}

/// 글러브를 앞으로 낮게 든 수비 자세.
function readyPose(p, base) {
  return { hipY: HIP_Y, bob: base.bob * 0.5, lean: FIELD_READY.lean,
           legs: FIELD_READY.legs, arms: FIELD_READY.arms, glove: 1 };
}

function mixPose(a, b, k) {
  return {
    hipY: HIP_Y, bob: 0,
    lean: lerp(a.lean, b.lean, k),
    legs: mixLimbs(a.legs, b.legs, k),
    arms: mixLimbs(a.arms, b.arms, k),
    // 배트는 **짧은 쪽으로 잇지 않는다.** 위 주석 참고 — 각을 편 채로 적어 두고 그대로 섞는다.
    bat: a.bat === undefined ? undefined : lerp(a.bat, b.bat, k),
  };
}

/// 배트 끝이 판 어디에 있나. 시험이 「휘두름이 한 방향으로 도나」를 재는 데 쓴다.
export function batPoint(p, time = 0) {
  const face = faceOf(p, false);
  const s = pose(p, time, face, false, true);
  if (s.bat === undefined) return null;
  const hipY = s.hipY + s.bob;
  const sx = Math.sin(s.lean) * TORSO;
  const sy = hipY - Math.cos(s.lean) * TORSO;
  const r = s.reach?.[0] ?? 1;
  const [, , hand] = limb(sx, sy, s.arms[0][0], UPPER * r, s.arms[0][1], FORE * r);
  return { x: p.x + (hand[0] + Math.sin(s.bat) * BAT_LEN) * face,
           y: p.groundY - p.air + hand[1] + Math.cos(s.bat) * BAT_LEN, angle: s.bat };
}

/// 공을 놓는 손이 판 어디에 있나 (야구 자세). 시험이 「구종마다 손 모양이 다른가」를 잰다.
export function pitchHand(p, time = 0) {
  const face = faceOf(p, false);
  const s = pose(p, time, face, false, true);
  const hipY = s.hipY + s.bob;
  const sx = Math.sin(s.lean) * TORSO;
  const sy = hipY - Math.cos(s.lean) * TORSO;
  const r = s.reach?.[0] ?? 1;
  const [, , hand] = limb(sx, sy, s.arms[0][0], UPPER * r, s.arms[0][1], FORE * r);
  return { x: p.x + hand[0] * face, y: p.groundY - p.air + hand[1] };
}

/// 치는 손(첫째 팔) 끝이 판 어디에 있나. 시험이 「손이 공에 닿았나」를 재는 데 쓴다.
export function handPoint(p, time = 0) {
  const face = faceOf(p);
  const s = pose(p, time, face, true);
  const hipY = s.hipY + s.bob;
  const sx = Math.sin(s.lean) * TORSO;
  const sy = hipY - Math.cos(s.lean) * TORSO;
  const r = s.reach?.[0] ?? 1;
  const [, , hand] = limb(sx, sy, s.arms[0][0], UPPER * r, s.arms[0][1], FORE * r);
  return { x: p.x + hand[0] * face, y: p.groundY - p.air + hand[1] };
}

/// opts: { name, mine, faded, spike }. spike 는 배구만 켠다 — 게임 쪽에서 figure 로 넣는다.
export function drawStickman(ctx, p, time, seed, opts = {}) {
  // 다음 판을 기다리는 사람은 **넘어지지 않는다.** 죽은 자세로 그리면 「쟤 죽었네」로
  // 읽히는데, 사실은 다음 판을 기다리며 구경하는 중이다.
  const waiting = Boolean(p.waiting);
  // 탈락한 사람은 옅게. 누워 있는 것만으로도 알 수 있지만, 살아 있는 사람 뒤에 겹치면
  // 누가 아직 뛰고 있는지 한눈에 안 들어온다.
  if (opts.faded) setFade(0.55);
  ctx.save();
  ctx.translate(p.x, p.groundY - p.air);

  if (p.dead && !waiting) {
    // 뒤로 넘어간다. 회전이 끝나면 그 자리에 누워 있다.
    const t = Math.min(p.deadFor / 0.42, 1);
    const ease = 1 - (1 - t) * (1 - t);
    ctx.translate(-p.facing * 18 * ease, -3 * ease);
    ctx.rotate(p.facing * ease * Math.PI * 0.46);
  }
  const spike = !!opts.spike;
  const bat = !!opts.bat;
  const face = faceOf(p, spike);
  ctx.scale(face, 1); // 뒤집힌 공간 안에서는 +x 가 언제나 「앞」이다
  // 몸을 던지면 앞으로 쏠린다. 발이 뒤에 남고 어깨가 앞으로 나간다.
  if (p.slide > 0) ctx.translate(-6, 0);

  const s = pose(p, time, face, spike, bat);
  const hipY = s.hipY + s.bob;
  const lean = p.dead ? 0.02 : s.lean;

  // 몸통·목·머리는 엉덩이에서 기울기를 따라 쌓아 올린다.
  const shldX = Math.sin(lean) * TORSO;
  const shldY = hipY - Math.cos(lean) * TORSO;
  const neckX = shldX + Math.sin(lean) * NECK;
  const neckY = shldY - Math.cos(lean) * NECK;
  const headX = neckX + Math.sin(lean) * HEAD_R;
  const headY = neckY - Math.cos(lean) * HEAD_R;

  const w = 3.7;
  const pen = (i) => ({ width: w, color: INK, seed: seed + i, amp: 0.6 });

  // 팔은 몸과 따로 방향을 잡는다. 오른쪽 사람을 붙잡은 채 왼쪽으로 끌고 갈 때,
  // 다리는 왼쪽으로 걷고 팔은 오른쪽으로 뻗어 있어야 붙잡고 있는 것으로 읽힌다.
  // 몸 전체가 facing 으로 이미 뒤집혀 있으므로, 반대쪽을 잡았으면 각도만 뒤집는다.
  const armFlip = p.grabAim && p.grabAim !== p.facing ? -1 : 1;
  // 공을 향해 뻗은 팔은 조금 늘어난다(reach). 배구에서 손끝이 공에 닿게 하는 몫이다.
  const arm = (i) => {
    const r = s.reach?.[i] ?? 1;
    return limb(shldX, shldY, s.arms[i][0] * armFlip, UPPER * r, s.arms[i][1] * armFlip, FORE * r);
  };
  const armA = arm(0);
  const armB = arm(1);

  // 다리를 먼저 그려 몸통 뒤로 보낸다.
  stroke(ctx, limb(0, hipY, s.legs[0][0], THIGH, s.legs[0][1], SHIN), pen(1));
  stroke(ctx, limb(0, hipY, s.legs[1][0], THIGH, s.legs[1][1], SHIN), pen(2));

  // 색연필로 슥 칠한 셔츠. **잉크 밑에 깔고** 위에 검은 선을 그대로 얹는다 —
  // 색이 낙서를 덮어 버리면 이 게임의 그림체가 아니게 된다. 소매는 어깨에서 팔꿈치까지만.
  // 몸통 잉크가 흰 후광을 두르고 위에 얹히므로, 그 폭보다 넓게 칠해야 색이 남는다.
  if (opts.color) {
    const shirt = { color: opts.color, alpha: 0.8, halo: false, amp: 0.45 };
    stroke(ctx, [[0, hipY], [shldX * 0.5, (hipY + shldY) / 2], [shldX, shldY]],
           { ...shirt, width: 19, seed: seed + 31 });
    stroke(ctx, [armA[0], armA[1]], { ...shirt, width: 14, seed: seed + 32 });
    stroke(ctx, [armB[0], armB[1]], { ...shirt, width: 14, seed: seed + 33 });
  }

  stroke(ctx, [[0, hipY], [shldX * 0.5, (hipY + shldY) / 2], [shldX, shldY]], pen(3));
  stroke(ctx, armA, pen(4));
  stroke(ctx, armB, pen(5));
  stroke(ctx, [[shldX, shldY], [neckX, neckY]], pen(6));
  circle(ctx, headX, headY, HEAD_R, { width: w, color: INK, seed: seed + 7, amp: 0.55 });

  // 야구 — 배트와 글러브. 손끝에서 자라므로 팔을 그린 **뒤**에 얹는다.
  if (s.bat !== undefined) {
    const [hx, hy] = armA[2];
    // 손잡이는 가늘고 머리는 굵다. 획 둘이면 방망이로 읽힌다.
    const tip = [hx + Math.sin(s.bat) * BAT_LEN, hy + Math.cos(s.bat) * BAT_LEN];
    const mid = [hx + Math.sin(s.bat) * BAT_LEN * 0.45, hy + Math.cos(s.bat) * BAT_LEN * 0.45];
    stroke(ctx, [[hx, hy], mid], { width: 3.2, color: INK, seed: seed + 51, amp: 0.3 });
    stroke(ctx, [mid, tip], { width: 5.4, color: INK, seed: seed + 52, amp: 0.3 });
  }
  if (s.glove) {
    const [gx, gy] = armB[2];
    circle(ctx, gx, gy, 6.2, { width: 2.6, color: INK, seed: seed + 53, amp: 0.4 });
  }

  drawMark(ctx, headX, headY, opts.mark, opts.color ?? INK, seed);
  drawFace(ctx, headX, headY, p, time, seed);
  ctx.restore();

  if (p.slide > 0) {
    // 미끄러진 자국. 뒤로 흩날리는 짧은 선 몇 개.
    const feet = p.groundY - p.air;
    for (let i = 0; i < 3; i++) {
      const back = -p.facing * (16 + i * 13);
      const up = 2 + i * 3;
      stroke(ctx, [[p.x + back, feet - up], [p.x + back - p.facing * 12, feet - up - 3]],
             { width: 1.8, color: PENCIL, seed: seed + 90 + i, amp: 0.7, halo: false,
               alpha: 0.5 * Math.min(1, p.slide / 0.2) });
    }
  }
  if (p.dead && !waiting) drawImpact(ctx, p, seed);
  if (opts.name) drawTag(ctx, p, opts);
  if (opts.faded) setFade(1);
}

/// 머리 위 이름표. 뒤집힌 공간 밖에서 그린다 — 안에서 그리면 왼쪽을 볼 때 글자가 뒤집힌다.
/// 작은 왕관. 세 봉우리에 아래를 받치는 선 하나 — 이 크기에서는 이게 왕관으로 읽히는
/// 최소한이다. 더 그리면 뭉개진다.
function drawCrown(ctx, cx, cy, color) {
  stroke(ctx, [[cx - 5, cy], [cx - 5, cy - 5], [cx - 2.5, cy - 2], [cx, cy - 6.5],
               [cx + 2.5, cy - 2], [cx + 5, cy - 5], [cx + 5, cy]],
         { width: 1.7, color, seed: 88, amp: 0.35, halo: false });
  stroke(ctx, [[cx - 5.5, cy + 1.2], [cx + 5.5, cy + 1.2]],
         { width: 1.7, color, seed: 89, amp: 0.3, halo: false });
}

/// 이름표가 사람보다 넓어지지 않게 글씨를 줄인다.
///
/// 「전자결재 담당자」를 12px 로 쓰면 이름표 하나가 졸라맨 세 명 폭이 된다. 셋만 모여도
/// 이름표끼리 겹쳐서 누가 누군지 못 읽는다. 짧은 이름은 그대로 두고 긴 것만 줄인다.
const TAG_W = 92;
const TAG_MIN = 8.5;
function tagFont(ctx, label, size) {
  const font = (px) => `700 ${px}px "Apple SD Gothic Neo", sans-serif`;
  ctx.font = font(size);
  const wide = ctx.measureText(label).width;
  return font(wide <= TAG_W ? size : Math.max(TAG_MIN, size * TAG_W / wide));
}

function drawTag(ctx, p, opts) {
  // 머리에 표가 있으면 이름표를 그만큼 올린다. 안 올리면 빨간 밑줄이 삐친 머리를 덮는다.
  const lift = opts.mark === undefined || opts.mark === null ? 12 : 21;
  if (p.waiting) {
    const y = p.groundY - p.air - BODY_H - lift;
    const label = `${opts.name} · 다음 판`;
    text(ctx, label, p.x, y, {
      font: tagFont(ctx, label, 11), color: opts.color ?? PENCIL, align: 'center',
    });
    return;
  }
  if (p.dead) return;
  const y = p.groundY - p.air - BODY_H - lift;
  // 이름도 옷과 같은 색으로. 화면이 어수선할 때 누가 누군지 이걸로 잇는다.
  const font = tagFont(ctx, opts.name, 12);
  const tint = opts.color ?? (opts.mine ? INK : PENCIL);
  ctx.font = font;
  const half = ctx.measureText(opts.name).width / 2;
  // 방장에게는 이름 앞에 작은 왕관. 판을 여는 사람이 누군지 한눈에 보여야 한다.
  if (opts.crown) drawCrown(ctx, p.x - half - 9, y - 4, tint);
  text(ctx, opts.name, p.x, y, { font, color: tint, align: 'center' });
  // 내 졸라맨에만 빨간 밑줄. 여럿이 겹쳐 있을 때 어느 게 나인지 이걸로 찾는다.
  if (opts.mine) {
    ctx.font = font;
    const half = Math.max(14, ctx.measureText(opts.name).width / 2 + 3);
    stroke(ctx, [[p.x - half, y + 4], [p.x + half, y + 4]],
           { width: 2.2, color: RED, seed: 21, amp: 0.7, haloWidth: 3 });
  }
}

function drawFace(ctx, cx, cy, p, time, seed) {
  const face = { width: 1.7, color: INK, halo: false, seed: seed + 11, amp: 0.18 };

  if (p.dead && !p.waiting) {
    // ✕ ✕. 만화에서 이것 말고 다른 뜻으로 읽히는 눈은 없다.
    for (const dx of [-3.4, 3.4]) {
      stroke(ctx, [[cx + dx - 2, cy - 3], [cx + dx + 2, cy + 1]], face);
      stroke(ctx, [[cx + dx + 2, cy - 3], [cx + dx - 2, cy + 1]], face);
    }
    return;
  }

  // 3.4초에 한 번, 0.12초 동안 눈을 감는다.
  const blink = (time % 3.4) < 0.12;
  for (const dx of [-3.2, 3.2]) {
    const x = cx + dx + 1.1; // 보는 쪽으로 눈이 살짝 쏠린다
    blink
      ? stroke(ctx, [[x - 1.9, cy - 1.6], [x + 1.9, cy - 1.6]], face)
      : stroke(ctx, [[x, cy - 3.4], [x, cy - 0.6]], face);
  }

  // 똥이 코앞이면 입이 벌어진다. 위험을 글자 없이 알려 주는 자리다.
  if (p.danger) {
    circle(ctx, cx + 0.7, cy + 4.4, 2.4, { width: 1.6, color: INK, fill: INK, halo: false, seed: seed + 13, amp: 0.15 });
  } else {
    stroke(ctx, [[cx - 2.4, cy + 4.4], [cx + 2.6, cy + 4.2]], face);
  }
}

/// 머리에 붙는 표. **색만으로는 누가 누군지 모른다.**
///
/// 넷이 탑처럼 쌓이면 이름표는 서로 가려지고, 창을 40% 로 줄이면 졸라맨 하나가 30픽셀이다.
/// 그 크기에서 파랑과 보라는 같은 색이고, 색약인 사람에게는 처음부터 같은 색이다.
/// 그래서 **실루엣**을 가른다 — 획 두세 개면 멀리서도 모양으로 읽힌다.
///
///   0 삐친 머리   1 안경   2 단발   3 모자
///
/// 옷 색과 같은 규칙(번호 나머지)으로 정해서, 색과 모양이 늘 짝을 이룬다.
function drawMark(ctx, cx, cy, mark, color, seed) {
  if (mark === undefined || mark === null) return;
  const pen = (i, w = 1.9) => ({ width: w, color, seed: seed + 40 + i, amp: 0.3, halo: false });
  const r = HEAD_R;
  switch (((mark % 4) + 4) % 4) {
    case 0:   // 삐친 머리 한 올. 정수리에서 앞으로 크게 휘어 오른다.
      stroke(ctx, [[cx - 2, cy - r + 1], [cx - 1, cy - r - 5], [cx + 5, cy - r - 8],
                   [cx + 2, cy - r - 3]], pen(0, 2.1));
      break;
    case 1:   // 동그란 안경. 눈은 그 밑에 그대로 그려진다.
      circle(ctx, cx - 3.2, cy - 2, 3.4, pen(1, 1.5));
      circle(ctx, cx + 3.6, cy - 2, 3.4, pen(2, 1.5));
      stroke(ctx, [[cx - 0.2, cy - 2.2], [cx + 0.6, cy - 2.2]], pen(3, 1.4));
      break;
    case 2:   // 단발. 머리를 두르고 귀밑까지 내려온다.
      stroke(ctx, [[cx - r - 0.5, cy + 3], [cx - r - 1, cy - 3], [cx - 3, cy - r - 1.5],
                   [cx + 3, cy - r - 1.5], [cx + r + 1, cy - 3], [cx + r + 0.5, cy + 3]], pen(4, 2.2));
      break;
    default:  // 모자. 정수리를 덮는 굵은 띠 하나에 챙 하나 — 획 둘로 모자가 된다.
      //        챙은 보는 쪽으로 나온다 (뒤집힌 공간이라 +x 가 늘 앞이다).
      stroke(ctx, [[cx - r + 1.5, cy - 3.5], [cx - r + 3, cy - r - 1], [cx + 1, cy - r - 3],
                   [cx + r - 2, cy - r], [cx + r - 0.5, cy - 3.5]], pen(5, 5.2));
      stroke(ctx, [[cx + 1, cy - 4.6], [cx + r + 6.5, cy - 5.4]], pen(6, 2.6));
      break;
  }
}

/// 맞는 순간 사방으로 튀는 빨간 획. 0.5초 안에 사라진다.
function drawImpact(ctx, p, seed) {
  if (p.deadFor > 0.5) return;
  const fade = 1 - p.deadFor / 0.5;
  const grow = 16 + p.deadFor * 150;
  ctx.save();
  ctx.translate(p.x, p.groundY - p.air - BODY_H * 0.55);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + wiggle(seed, i, 0.4);
    stroke(ctx, [
      [Math.cos(a) * grow * 0.5, Math.sin(a) * grow * 0.36],
      [Math.cos(a) * grow, Math.sin(a) * grow * 0.72],
    ], { width: 3.2, color: RED, alpha: fade, seed: seed + i, amp: 1.2, halo: false });
  }
  ctx.restore();
}
