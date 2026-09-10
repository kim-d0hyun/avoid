// 부팅, 화면 크기, 루프, 셸과의 연결.

import { boil, shirtColor } from './draw/ink.js';
import { drawPoop, drawSplat } from './draw/poop.js';
import { drawStickman } from './draw/stickman.js';
import { makeGround, drawClock, drawIntro, drawFreeze, drawStamp, drawRoom, drawResults, drawMenu }
  from './draw/hud.js';
import { createWorld, resize, update, press, restart, addPoop, spread } from './game/world.js';
import { pump, handleMessage, peerChanged, roleChanged, reportDeath, startRound } from './game/net.js';

/// 셸이 없을 때(브라우저에서 열어 볼 때)도 돌아가도록 빈 껍데기를 둔다.
const shell = window.ddong ?? {
  best: { ms: 0, dodged: 0 },
  saveBest() {},
  onInput() {},
  onVisible() {},
  log: console.log.bind(console),
  net: { role: 'off', code: null, id: 0, name: '나', send() {}, onMessage() {}, onRole() {}, onPeer() {} },
};

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');
const world = createWorld(shell.best);
world.mp.myName = shell.net.name;
world.onRecord = (record) => shell.saveBest(record);
world.onDeath = (record) => reportDeath(world, shell, record);

// 게임 안 메뉴에서 고른 것. 방을 열고 닫는 일은 셸이 해야 해서 이름만 넘긴다.
const SHELL_ACTIONS = { host: 'host', join: 'join', leave: 'leave', hide: 'hide', quitYes: 'quit' };
world.onMenu = (action) => {
  if (action === 'again') {
    world.mp.on ? startRound(world, shell, { restart }) : restart(world);
    return;
  }
  const name = SHELL_ACTIONS[action];
  if (name) shell.menu?.(name);
};

let ground = null;
let hidden = false;
/// 방장이 쓰는 판 크기. 방에 들어가 있으면 이걸 따라가고, 혼자면 내 화면 크기 그대로다.
let shared = null;

/// 세계는 **모두가 같은 크기**로 굴리고, 그리는 순간에만 내 화면에 맞춰 늘린다.
///
/// 각자 자기 화면 크기로 굴리면 같은 방에 있어도 다른 게임이 된다 — 똥이 다른 자리에
/// 떨어지고, 넓은 화면 사람이 좁은 화면 사람의 화면 밖에 서 있게 된다.
/// 화면에 맞추는 배율. 자리는 가로·세로 따로 늘리고(화면을 꽉 채워야 하니까),
/// 물건은 세로 배율 하나로만 그린다(안 그러면 27인치에서 졸라맨이 납작해진다).
let view = { dpr: 1, sx: 1, sy: 1, screenW: 0, screenH: 0, squash: 1 };

function fit() {
  // 5K 에서 3배로 그리면 픽셀만 늘고 보이는 건 같다. 2배에서 끊는다.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const screenW = window.innerWidth;
  const screenH = window.innerHeight;
  canvas.width = Math.round(screenW * dpr);
  canvas.height = Math.round(screenH * dpr);
  canvas.style.width = `${screenW}px`;
  canvas.style.height = `${screenH}px`;

  const w = shared?.w ?? screenW;
  const h = shared?.h ?? screenH;
  // squash 로 가로 늘림을 물건 단위로 되돌린다 → 화면 비율이 달라도 안 찌그러진다.
  view = { dpr, sx: screenW / w, sy: screenH / h, screenW, screenH, squash: 1 };
  view.squash = view.sy / view.sx;
  resize(world, w, h);
  ground = makeGround(w);
}

/// 물건 하나를 제 자리에서 비율을 지켜 그린다.
function upright(cx, cy, draw) {
  if (view.squash === 1) { draw(); return; }
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(view.squash, 1);
  ctx.translate(-cx, -cy);
  draw();
  ctx.restore();
}

/// 방장이 알려 준 판 크기로 갈아탄다. 방을 나가면 null 로 되돌린다.
function setSize(w, h) {
  shared = w && h ? { w, h } : null;
  fit();
}

window.addEventListener('resize', fit);
fit();

// DDONG_DEBUG=1 로 띄웠을 때만. 셸로 가는 통로가 살아 있는지 여기서 한 번에 확인된다 —
// 이 줄이 안 보이면 기록 저장도 안 된다.
if (shell.debug) {
  shell.log(`부팅 ${canvas.width}×${canvas.height} dpr=${window.devicePixelRatio} 최고=${shell.best.ms}ms`);
}

// MARK: 입력

// 셸이 전역 핫키로 잡아 보내 준다. 창이 포커스를 안 가져가므로 이 길이 유일하다.
shell.onInput((action, down) => press(world, action, down));

shell.onVisible((visible) => {
  hidden = !visible;
  // 숨은 사이에 떨어지던 똥은 그대로 있다. 다시 보이면 멈춰 세운 화면을 2초 보여 주고
  // 이어서 간다 — 판을 지워 주면 ⌥H 가 위기 탈출 버튼이 되어 기록이 뜻을 잃는다.
  // 같이 하는 중에는 멈추지 않는다. 남의 시계까지 세울 수는 없다.
  if (visible && world.state === 'play' && !world.mp.on) world.frozen = 2;
});

// MARK: 같이 하기

shell.net.onRole((role, code, id, name) => {
  roleChanged(world, role, code, id, name);
  // 방을 나가면 내 화면 크기로 돌아온다. 방장은 처음부터 자기 크기로 논다.
  if (role !== 'guest' && shared) setSize(null, null);
  if (world.state === 'ready') spread(world);
});
shell.net.onPeer((id, name, joined) => peerChanged(world, shell, id, name, joined, { spread }));
// 셸이 한 프레임치를 모아서 이미 풀린 객체로 넘겨준다.
shell.net.onMessage((from, message) => {
  handleMessage(world, shell, from, message, { addPoop, restart, setSize });
});

// 브라우저에서 열어 볼 때와, 혹시 창이 키를 직접 받게 됐을 때의 길.
const KEYS = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'duck',
  KeyR: 'restart', KeyM: 'menu',
};
for (const [type, down] of [['keydown', true], ['keyup', false]]) {
  window.addEventListener(type, (event) => {
    const action = KEYS[event.code];
    if (!action || !event.altKey) return;
    event.preventDefault();
    if (!event.repeat || !down) press(world, action, down);
  });
}

// 앱 밖(브라우저)에서 열었을 때만 속을 열어 둔다. 그림을 눈으로 맞추려면 붙잡을 데가 있어야 한다.
if (!window.ddong) {
  window.__world = world;
  window.__setSize = setSize;   // 화면 비율을 눈으로 맞춰 볼 때 쓴다
}

// 셸이 기록을 지우면 화면에도 바로 반영한다.
window.__ddongBest = (ms, dodged) => {
  world.best.ms = ms;
  world.best.dodged = dodged;
};

// MARK: 봇 (시험용)

/// 사람 없이 여럿이 붙은 상태를 시험하려고 둔다. `DDONG_DEBUG=1 DDONG_BOT=1` 일 때만 돈다.
///
/// 사람 흉내를 내는 게 목적이다: 제일 급한 똥에서 멀어지고, 코앞이면 뛰고, 가끔은 남의
/// 앞을 일부러 막아선다 — 막는 재미가 그림에 나와야 시험이 된다.
function makeBot(seed) {
  let pressed = { left: false, right: false, jump: false, duck: false };
  let mood = 0;      // 0 이상이면 「남 막아서기」 중
  let cooldown = 1 + seed;

  const hold = (action, want) => {
    if (pressed[action] === want) return;
    pressed[action] = want;
    press(world, action, want);
  };

  return (dt) => {
    if (world.state === 'over') {
      cooldown -= dt;
      if (cooldown <= 0) { cooldown = 1.2 + seed * 0.4; world.onMenu?.('again'); }
      return;
    }
    if (world.state === 'ready') {
      cooldown -= dt;
      if (cooldown <= 0) { cooldown = 2; press(world, 'right', true); press(world, 'right', false); }
      return;
    }
    const p = world.player;
    if (p.dead) { hold('left', false); hold('right', false); hold('jump', false); return; }

    // 제일 급한 똥. 남은 시간이 짧고 가까울수록 급하다.
    let worst = null;
    let best = 1e9;
    for (const poop of world.poops) {
      const eta = (world.groundY - poop.y) / poop.vy;
      const gap = Math.abs(poop.x - p.x);
      if (eta > 1.3 || gap > 300) continue;
      const score = eta * 260 + gap;
      if (score < best) { best = score; worst = poop; }
    }

    mood -= dt;
    if (mood < -6 - seed * 3) mood = 1.4;   // 이따금 남 앞을 막아선다

    let want = 0;
    if (worst) {
      want = worst.x > p.x ? -1 : 1;
    } else if (mood > 0) {
      // 제일 가까운 사람 쪽으로 붙는다.
      let target = null;
      let near = 1e9;
      for (const other of world.mp.others.values()) {
        if (other.dead) continue;
        const gap = Math.abs(other.x - p.x);
        if (gap < near) { near = gap; target = other; }
      }
      if (target && near > 30) want = Math.sign(target.x - p.x);
    }
    // 벽에 몰리면 되돌아 나온다.
    if (p.x < 110) want = 1;
    if (p.x > world.w - 110) want = -1;

    hold('left', want < 0);
    hold('right', want > 0);
    // 코앞에 떨어지는데 옆이 막혔으면 뛴다.
    const cornered = worst && Math.abs(worst.x - p.x) < 52 && p.squeeze > 0.25;
    hold('jump', Boolean(cornered) && p.air === 0);
  };
}

const bot = shell.debug && shell.bot ? makeBot(Math.random()) : null;

// MARK: 루프

let last = performance.now();

/// 한 걸음. draw 가 거짓이면 계산만 하고 그리지 않는다.
function step(now, draw) {
  // 숨어 있던 동안 쌓인 시간이 한 프레임에 몰리면 똥이 화면을 관통한다.
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;

  bot?.(dt);
  update(world, dt);
  pump(world, dt, shell);
  if (draw) render(now / 1000);
}

function render(time) {
  const boilFrame = boil(time);
  const { dpr, sx, sy, screenW, screenH } = view;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, screenW, screenH);

  // ── 판 안의 것들: 자리는 판 좌표 그대로, 화면 배율만 얹는다
  ctx.save();
  ctx.setTransform(dpr * sx, 0, 0, dpr * sy, 0, 0);
  if (world.shake > 0) {
    const s = world.shake * world.shake * 9;
    ctx.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
  }

  if (ground) ctx.drawImage(ground, 0, world.groundY - 8);
  for (const splat of world.splats) upright(splat.x, splat.y, () => drawSplat(ctx, splat));
  for (const poop of world.poops) upright(poop.x, poop.y, () => drawPoop(ctx, poop, boilFrame));

  // 남들을 먼저 그리고 내가 맨 위에 선다. 겹쳤을 때 내 몸을 놓치면 안 된다.
  for (const other of world.mp.others.values()) {
    upright(other.x, world.groundY, () => drawStickman(ctx, other, time, boilFrame,
      { name: other.name, faded: other.dead, color: shirtColor(other.id) }));
  }
  // 혼자 할 때는 색을 안 입힌다 — 구분할 사람이 없으면 그냥 낙서가 맞다.
  upright(world.player.x, world.groundY, () => drawStickman(ctx, world.player, time, boilFrame, {
    name: world.mp.on ? world.mp.myName : null,
    mine: true,
    color: world.mp.on ? shirtColor(world.mp.myId) : null,
  }));
  ctx.restore();

  // ── 글자판은 화면 좌표로. 판이 커지든 작아지든 글씨 크기는 그대로여야 읽힌다.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hud = { ...world, w: screenW, h: screenH, groundY: world.groundY * sy };
  drawClock(ctx, hud);
  if (world.mp.on) drawRoom(ctx, hud);
  if (world.state === 'ready') drawIntro(ctx, hud, time);
  if (world.state === 'over') {
    world.mp.on && world.mp.results ? drawResults(ctx, hud) : drawStamp(ctx, hud);
  }
  if (world.frozen > 0) drawFreeze(ctx, hud);
  if (world.menu.open) drawMenu(ctx, hud);
}

function frame(now) {
  requestAnimationFrame(frame);
  // 숨어 있으면 여기서 굴리지 않는다. macOS 가 안 보이는 창의 requestAnimationFrame 을
  // 초당 몇 번으로 죽이기 때문에, 그동안은 셸이 __ddongTick 으로 대신 부른다.
  if (hidden) return;
  step(now, true);
}

/// 숨어 있는 동안 셸이 60Hz 로 부른다. 같이 하는 중에만 부르므로 혼자일 때는 그대로 멈춘다.
window.__ddongTick = () => step(performance.now(), false);

/// 시연 녹화용. 셸이 DDONG_SHOTS 로 띄웠을 때만 부른다 — 창을 화면에 내지 않고도
/// 「그 사람 화면」을 그대로 뽑아낸다. 남의 바탕화면을 녹화에 담지 않으려고 이 길을 둔다.
let shotCanvas = null;
window.__ddongShot = (background, scale) => {
  render(performance.now() / 1000);
  if (!shotCanvas) shotCanvas = document.createElement('canvas');
  shotCanvas.width = Math.round(view.screenW * scale);
  shotCanvas.height = Math.round(view.screenH * scale);
  const shot = shotCanvas.getContext('2d');
  shot.fillStyle = background;
  shot.fillRect(0, 0, shotCanvas.width, shotCanvas.height);
  shot.drawImage(canvas, 0, 0, shotCanvas.width, shotCanvas.height);
  return shotCanvas.toDataURL('image/jpeg', 0.78);
};

requestAnimationFrame(frame);
