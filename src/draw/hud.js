// 지면, 시계, 안내, 게임오버 도장.
//
// 가운데 정렬한 카드를 안 쓰는 이유는 이게 남의 작업 화면 위이기 때문이다. 한가운데는
// 그 사람이 지금 보고 있는 자리다. 정보는 노트 여백처럼 **왼쪽 위 구석에 세로로** 붙인다.

import { INK, RED, PENCIL, PAPER_SOLID, stroke, circle, text, paperScrap } from './ink.js';
import { menuItems, canRestart, VICTORY_SECONDS, gameOf } from '../game/world.js';
import { games } from '../games/index.js';
import { drawStickman } from './stickman.js';

const MONO = '"American Typewriter", "Courier New", monospace';
const HAN = '"Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
/// ⌥ ← ↑ 같은 키 기호는 시스템 폰트만 제대로 그린다. 타자기 폰트에 없어서 글자마다
/// 아무 폰트로나 떨어지면 알아볼 수 없는 부호가 된다. 여기서만 시스템 폰트를 쓴다.
const KEYS = '-apple-system, "SF Pro Text", "Apple SD Gothic Neo", sans-serif';

export function formatMs(ms) {
  const t = Math.max(0, ms);
  return `${String(Math.floor(t / 60000)).padStart(2, '0')}:${
    String(Math.floor(t / 1000) % 60).padStart(2, '0')}.${
    String(Math.floor((t % 1000) / 10)).padStart(2, '0')}`;
}

/// 지면은 한 번만 그려 두고 붙인다. 화면 폭만큼 빗금을 매 프레임 긋는 건 낭비다.
export function makeGround(w) {
  const layer = document.createElement('canvas');
  layer.width = Math.max(1, Math.ceil(w));
  layer.height = 34;
  const ctx = layer.getContext('2d');
  ctx.translate(0, 8);

  // 지면은 화면을 가로지르는 유일한 선이라 후광을 얇게 준다. 넓히면 흰 띠가 된다.
  stroke(ctx, [[0, 0], [w * 0.33, -1.4], [w * 0.66, 1.2], [w, -0.4]],
         { width: 4, color: INK, seed: 3, amp: 1.1, haloWidth: 3 });
  for (let x = 10; x < w; x += 27) {
    stroke(ctx, [[x, 2], [x - 9, 15]], { width: 1.8, color: INK, seed: x, amp: 0.9, halo: false, alpha: 0.5 });
  }
  return layer;
}

export function drawClock(ctx, world) {
  const x = 68;
  const ms = Math.round(world.elapsed * 1000);
  const clock = formatMs(ms);
  const tally = gameOf(world).tally(world);
  const best = world.best.ms ? `최고 ${formatMs(world.best.ms)}   ${tally}` : tally;

  ctx.font = `500 52px ${MONO}`;
  const wide = ctx.measureText(clock).width;
  ctx.font = `600 15px ${HAN}`;
  const width = Math.max(wide, ctx.measureText(best).width) + 46;
  paperScrap(ctx, 34, 18, width, 104, 2);

  // 노트 여백선. 빨간 볼펜은 이 선과 기록 갱신, 두 군데에만 쓴다.
  stroke(ctx, [[48, 30], [48, 110]], { width: 2, color: RED, seed: 1, amp: 1.2, alpha: 0.8, halo: false });

  text(ctx, clock, x, 80, { font: `500 52px ${MONO}`, color: INK, halo: 0 });
  text(ctx, best, x + 3, 106, { font: `600 15px ${HAN}`, color: PENCIL, halo: 0 });
}

/// 종이 한 장을 화면 안에 넣는다.
///
/// 창을 작게 띄울 수 있게 되면서 **카드가 화면보다 커지는 일**이 생겼다. 30% 로 줄인 창은
/// 450×280 밖에 안 되는데 메뉴 종이는 300×470 이다. 줄을 빼거나 글자만 줄이는 대신
/// 통째로 줄인다 — 비율이 그대로라 「작게 띄운 같은 화면」으로 읽힌다.
/// 반드시 save/restore 사이에서 부른다.
function fitCenter(ctx, world, w, h) {
  const fit = Math.min(1, (world.w - 20) / w, (world.h - 20) / h);
  if (fit >= 1) return;
  ctx.translate(world.w / 2, world.h / 2);
  ctx.scale(fit, fit);
  ctx.translate(-world.w / 2, -world.h / 2);
}

export function drawIntro(ctx, world, time) {
  const x = 72;
  const y = world.groundY - 196;
  const rows = [...gameOf(world).keys, ['⌥ H', '숨기기'], ['⌥ M', '메뉴 · 게임 바꾸기']];
  const stop = gameOf(world).blocked?.(world);
  const hint = stop ? `${stop} — ⌥M 에서 편을 고른다`
    : world.mp.on && world.mp.role !== 'host' ? '방장이 시작하기를 기다리는 중'
    : world.mp.on ? '⌥R 로 판 시작 (방장만)' : '아무 방향키나 누르면 시작';
  // 종이는 **제일 긴 줄**에 맞춘다. 안내 문구만 재면 설명이 종이 밖으로 삐져나간다.
  ctx.font = `600 16px ${HAN}`;
  const widest = rows.reduce((most, [, label]) => Math.max(most, ctx.measureText(label).width), 0);
  ctx.font = `700 16px ${HAN}`;
  const cw = Math.max(232, ctx.measureText(hint).width + 44, widest + 130);
  const ch = rows.length * 28 + 56;
  const left = x - 22;
  // **창을 작게 띄우면 이 종이가 화면을 넘어간다.** 배구는 줄이 아홉이라 300픽셀이 넘는데,
  // 창을 40% 로 줄이면 화면 세로가 그만하다. 두 가지로 넣는다:
  //
  //   1) 밑으로 넘치면 위로 끌어올린다. 바닥에 세우는 게 원칙이지만 화면 밖보다는 낫다
  //   2) 그러고도 화면의 3분의 2를 넘으면 통째로 줄인다 — 안내가 판을 덮으면 안 된다
  //
  // 글자만 줄이거나 줄을 빼지 않는다. 종이와 여백이 따로 놀고, 모르는 키가 생긴다.
  const want = y - 30;
  const top = Math.min(want, world.h - 12 - ch);
  const bottom = top + ch;
  const fit = Math.min(1, (world.w - left - 16) / cw, (world.h * 0.66) / ch);
  ctx.save();
  ctx.translate(0, top - want);
  if (fit < 1) {
    // 왼쪽 아래를 붙잡고 줄인다. 바닥에 서 있는 종이라 밑변이 움직이면 떠 보인다.
    ctx.translate(left, bottom);
    ctx.scale(fit, fit);
    ctx.translate(-left, -bottom);
  }

  paperScrap(ctx, left, y - 30, cw, ch, 7);

  rows.forEach(([key, label], i) => {
    const ly = y + i * 28;
    text(ctx, key, x, ly, { font: `600 17px ${KEYS}`, color: INK, halo: 0 });
    text(ctx, label, x + 86, ly, { font: `600 16px ${HAN}`, color: INK, halo: 0 });
  });

  // 시작 안내만 깜빡인다. 화면에서 유일하게 움직이는 글자여야 눈이 간다.
  const pulse = 0.72 + 0.28 * Math.sin(time * 3.4);
  text(ctx, hint, x, y + rows.length * 28 + 14,
       { font: `700 16px ${HAN}`, color: RED, alpha: pulse, halo: 0 });
  ctx.restore();
}

/// 켜면 제일 먼저 나오는 화면. 무슨 게임을 할지 고른다.
///
/// 남의 작업 화면 위라서 한가운데를 크게 덮지 않는다. 왼쪽에 세로로 세운 목록 하나뿐이고,
/// 고른 것 옆에만 설명이 붙는다. 카드 세 장을 늘어놓지 않는 이유가 이것이다.
export function drawPick(ctx, world, time) {
  const picked = Math.max(0, Math.min(games.length - 1, world.pick));
  // 세로로 선 종이 한 장. 가로로 눕히면 화면을 가로질러 남의 작업을 덮는다 —
  // 세로로 세우면 좁고, 좁으면 덜 가린다.
  const w = 300;
  const h = 196 + games.length * 46;
  const x = (world.w - w) / 2;
  const y = (world.h - h) / 2;

  ctx.fillStyle = 'rgba(20, 18, 16, 0.16)';
  ctx.fillRect(0, 0, world.w, world.h);

  ctx.save();
  fitCenter(ctx, world, w, h);
  paperScrap(ctx, x, y, w, h, 5);
  stroke(ctx, [[x + 8, y + 8], [x + w - 8, y + 8],
               [x + w - 8, y + h - 8], [x + 8, y + h - 8]],
         { width: 1.6, color: INK, seed: 51, amp: 1.1, close: true, sharp: true, halo: false });

  // 제목은 가운데. 밑에 빨간 볼펜 한 줄.
  const mid = x + w / 2;
  text(ctx, '몰겜', mid, y + 56, { font: `800 34px ${HAN}`, color: INK, align: 'center', halo: 0 });
  stroke(ctx, [[mid - 37, y + 67], [mid + 37, y + 67]],
         { width: 2.6, color: RED, seed: 71, amp: 1.1, halo: false });
  text(ctx, '몰래 하는 게임 · 누가 오면 ⌥H', mid, y + 87,
       { font: `600 11px ${KEYS}`, color: PENCIL, align: 'center', halo: 0 });

  // 낙서는 제목 밑 가운데에 나란히.
  doodles(ctx, mid - 23, y + 122, time);

  games.forEach((game, i) => {
    const gy = y + 176 + i * 46;
    const on = i === picked;
    if (on) {
      text(ctx, '▸', x + 26, gy, { font: `700 14px ${KEYS}`, color: RED, halo: 0 });
      stroke(ctx, [[x + 42, gy + 7], [x + w - 30, gy + 7]],
             { width: 1.9, color: RED, seed: 73 + i, amp: 0.8, halo: false });
    }
    // 이름만 세운다. 설명은 안 쓴다 — 무슨 게임인지는 이름이면 충분하고,
    // 들어가면 시작 화면에 키가 다 적혀 있다.
    text(ctx, game.name, x + 42, gy, {
      font: `${on ? 800 : 600} ${on ? 18 : 15}px ${HAN}`, color: on ? INK : PENCIL, halo: 0,
    });
  });

  text(ctx, '⌥↑↓ 고르기   ⌥→ 시작', mid, y + h - 22,
       { font: `700 11.5px ${KEYS}`, color: RED, align: 'center', halo: 0,
         alpha: 0.72 + 0.28 * Math.sin(time * 3.4) });
  ctx.restore();
}

/// 제목 밑 낙서. 떨어지는 똥 하나와 통통 튀는 공 하나 — 있는 게임 둘을 그린 것이다.
function doodles(ctx, cx, cy, time) {
  const bob = Math.sin(time * 2.2) * 4;
  // 똥. 동글동글한 세 덩이를 쌓는다.
  ctx.save();
  ctx.translate(cx, cy + bob);
  circle(ctx, 0, 8, 9.5, { width: 2.4, color: INK, seed: 61, amp: 0.8, halo: false });
  circle(ctx, -1, -1, 7, { width: 2.4, color: INK, seed: 62, amp: 0.8, halo: false });
  circle(ctx, 1, -8, 4.8, { width: 2.4, color: INK, seed: 63, amp: 0.8, halo: false });
  ctx.restore();

  // 공
  const swing = Math.sin(time * 2.8) * 6;
  circle(ctx, cx + 40, cy - 4 + swing, 11.5, { width: 2.6, color: INK, seed: 64, amp: 0.7, halo: false });
  stroke(ctx, [[cx + 31, cy - 8 + swing], [cx + 49, cy - 8 + swing]],
         { width: 1.5, color: PENCIL, seed: 65, amp: 0.4, halo: false });
  stroke(ctx, [[cx + 31, cy + 1 + swing], [cx + 49, cy + 1 + swing]],
         { width: 1.5, color: PENCIL, seed: 66, amp: 0.4, halo: false });
}

/// 다시 띄웠을 때 주는 준비 시간. 숨은 사이에 죽어 있으면 억울하다.
export function drawFreeze(ctx, world) {
  const n = Math.ceil(world.frozen);
  text(ctx, String(n), world.w / 2, world.h * 0.42,
       { font: `500 110px ${MONO}`, color: INK, align: 'center', baseline: 'middle', halo: 12,
         alpha: Math.min(1, world.frozen - n + 1) });
}

/// 게임오버는 카드가 아니라 **도장**이다. 위에서 쿵 찍히고, 기울어져 있고, 빨갛다.
export function drawStamp(ctx, world) {
  const t = Math.min(world.overFor / 0.26, 1);
  const ease = 1 - Math.pow(1 - t, 3);
  const scale = 1.55 - 0.55 * ease;
  const alpha = Math.min(1, world.overFor / 0.1);

  const w = 300;
  const h = world.newRecord ? 176 : 150;
  const cx = world.w / 2;
  const cy = world.h * 0.38;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-0.105);
  ctx.scale(scale, scale);
  ctx.globalAlpha = alpha;

  // 손으로 그은 네모라 모서리가 살아 있어야 한다. 종이 바탕도 같은 네모로 채운다 —
  // 반듯한 사각형 위에 삐뚤빼뚤한 테두리를 올리면 둘이 어긋난 게 그대로 보인다.
  const box = (inset, width, fill) => stroke(ctx, [
    [-w / 2 + inset, -h / 2 + inset], [w / 2 - inset, -h / 2 + inset],
    [w / 2 - inset, h / 2 - inset], [-w / 2 + inset, h / 2 - inset],
  ], { width, color: RED, seed: 5 + inset, amp: 1.7, close: true, sharp: true, halo: false, fill });
  box(0, 4, PAPER_SOLID);
  box(8, 1.6, null);

  let y = -h / 2 + 42;
  if (world.newRecord) {
    text(ctx, '최고 기록', 0, y, { font: `800 20px ${HAN}`, color: RED, align: 'center', halo: 0 });
    y += 32;
  }
  text(ctx, '맞았다', 0, y, { font: `800 26px ${HAN}`, color: INK, align: 'center', halo: 0 });
  text(ctx, formatMs(Math.round(world.elapsed * 1000)), 0, y + 46,
       { font: `500 42px ${MONO}`, color: INK, align: 'center', halo: 0 });
  text(ctx, `피한 똥 ${world.dodged}개   ·   최고 ${formatMs(world.best.ms)}`, 0, y + 70,
       { font: `600 13px ${HAN}`, color: PENCIL, align: 'center', halo: 0 });

  ctx.restore();

  if (canRestart(world, 0.9)) {
    hint(ctx, '⌥R  또는  아무 방향키나 눌러 다시', cx, cy + h * 0.62 + 40,
         0.72 + 0.28 * Math.sin(world.overFor * 3.4));
  }
}

// MARK: 같이 하기

/// 오른쪽 위 방 표시. 코드는 불러 주려고 있는 것이라 크고 또렷해야 한다.
export function drawRoom(ctx, world) {
  const mp = world.mp;
  const alive = (world.player.dead ? 0 : 1)
    + [...mp.others.values()].filter((other) => !other.dead).length;
  const total = mp.others.size + 1;

  const code = mp.code ?? '····';
  ctx.font = `500 30px ${MONO}`;
  const width = Math.max(150, ctx.measureText(code).width + 46);
  const x = world.w - width - 26;
  paperScrap(ctx, x, 18, width, 84, 11);

  text(ctx, code, x + 22, 54, { font: `500 30px ${MONO}`, color: INK, halo: 0 });

  let note;
  if (world.state === 'play') {
    note = world.player.dead ? `탈락 · ${alive}명 남음` : `${alive} / ${total}명 버티는 중`;
  } else if (mp.waiting) {
    note = '다음 판부터 낀다';
  } else {
    note = `${total}명 · ${mp.role === 'host' ? '방장' : '손님'}`;
  }
  text(ctx, note, x + 22, 78, {
    font: `600 13px ${HAN}`, color: world.player.dead ? RED : PENCIL, halo: 0,
  });
}

/// 판이 끝나면 순위표. 도장 대신 이게 뜬다 — 혼자 죽은 게 아니라 다 같이 끝난 거다.
/// 어두운 벽지 위의 안내 한 줄. 종이를 깔지 않으면 빨간 글씨가 뭉갠다.
function hint(ctx, label, cx, y, alpha) {
  ctx.font = `700 15px ${KEYS}`;
  const width = ctx.measureText(label).width + 36;
  ctx.globalAlpha = alpha;
  paperScrap(ctx, cx - width / 2, y - 21, width, 30, 29);
  ctx.globalAlpha = 1;
  text(ctx, label, cx, y, { font: `700 15px ${KEYS}`, color: RED, align: 'center', halo: 0, alpha });
}

/// 한 판에 열여섯도 붙는다. 열 줄까지 보여 주고, 내가 잘려 나갔으면 내 줄은 따로 붙인다 —
/// 내 순위를 못 보는 순위표는 순위표가 아니다.
const TOP_ROWS = 10;

export function drawResults(ctx, world) {
  const rows = world.mp.results ?? [];
  const shown = rows.slice(0, TOP_ROWS);
  // 이름이 아니라 번호로 나를 찾는다. 같은 이름이 둘이면 이름으로는 못 가른다.
  const myRank = rows.findIndex((row) => row[3] === world.mp.myId);
  const showMine = myRank >= TOP_ROWS;
  const w = 404;
  const h = 96 + (shown.length + (showMine ? 1 : 0)) * 30;
  const x = (world.w - w) / 2;
  const y = world.h * 0.30;
  const grow = Math.min(1, world.overFor / 0.2);

  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(0.9 + 0.1 * grow, 0.9 + 0.1 * grow);
  ctx.translate(-w / 2, -h / 2);
  ctx.globalAlpha = grow;

  stroke(ctx, [[0, 0], [w, 0], [w, h], [0, h]],
         { width: 3.5, color: RED, seed: 9, amp: 1.7, close: true, sharp: true,
           halo: false, fill: PAPER_SOLID });

  text(ctx, '판 끝', w / 2, 40, { font: `800 24px ${HAN}`, color: INK, align: 'center', halo: 0 });

  const line = (row, rank, y) => {
    const [name, ms, dodged, id] = row;
    const mine = id === world.mp.myId;
    text(ctx, `${rank}`, 26, y, { font: `500 16px ${MONO}`, color: rank === 1 ? RED : PENCIL, halo: 0 });
    text(ctx, name, 52, y, { font: `${mine ? 800 : 600} 15px ${HAN}`, color: INK, halo: 0 });
    // 시간과 개수는 **둘 다 오른쪽 맞춤**. 왼쪽에 붙이면 자릿수가 달라질 때 서로 파고든다.
    text(ctx, formatMs(ms), w - 82, y, {
      font: `500 17px ${MONO}`, color: INK, align: 'right', halo: 0,
    });
    text(ctx, `${dodged}개`, w - 26, y, {
      font: `600 12px ${HAN}`, color: PENCIL, align: 'right', halo: 0,
    });
    if (mine) {
      stroke(ctx, [[22, y + 6], [w - 22, y + 6]],
             { width: 1.6, color: RED, seed: 41, amp: 0.6, halo: false, alpha: 0.7 });
    }
  };

  shown.forEach((row, i) => line(row, i + 1, 76 + i * 30));
  if (showMine) {
    const y = 76 + shown.length * 30;
    stroke(ctx, [[22, y - 20], [w - 22, y - 20]],
           { width: 1, color: PENCIL, seed: 43, amp: 0.5, halo: false, alpha: 0.5 });
    line(rows[myRank], myRank + 1, y + 4);
  }
  if (!rows.length) {
    text(ctx, '아무도 안 버텼다', w / 2, 82, { font: `600 14px ${HAN}`, color: PENCIL, align: 'center', halo: 0 });
  }
  ctx.restore();

  // 세리머니 중에는 눌러도 안 되니 그렇게 말한다. 안 되는 걸 하라고 하면 안 된다.
  const left = world.mp.winner ? VICTORY_SECONDS - world.overFor : 0;
  if (left > 0) {
    hint(ctx, `다음 판까지 ${Math.ceil(left)}초`, world.w / 2, y + h + 40, 0.85);
  } else if (canRestart(world)) {
    hint(ctx, '⌥R  누르면 다음 판', world.w / 2, y + h + 40,
         0.72 + 0.28 * Math.sin(world.overFor * 3.4));
  }
}

// MARK: 게임 안 메뉴

/// 남는 자리에 안 들어가면 뒤를 자른다. 모니터 이름 길이는 우리가 정하는 게 아니다.
function clip(ctx, value, font, room) {
  ctx.font = font;
  if (room <= 0) return '';
  if (ctx.measureText(value).width <= room) return value;
  let cut = value;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > room) cut = cut.slice(0, -1);
  return `${cut}…`;
}

/// 메뉴 막대 아이콘을 못 찾아도 여기서 끝낼 수 있어야 한다. 그게 이 메뉴의 존재 이유다.
/// 한 겹 안으로 들어갔을 때의 제목. 무엇을 고르는 중인지 제목이 말해 줘야 한다.
const MENU_TITLES = {
  'team': '어느 편으로?',
  'together': '같이 하기',
  'together/host': '무슨 게임으로 방을 열까?',
  'screen': '화면',
  'screen/size': '창을 얼마나 크게?',
  'screen/spot': '창을 어디에?',
  'screen/fade': '얼마나 흐리게?',
  'screen/where': '어느 화면에 띄울까?',
};

export function drawMenu(ctx, world) {
  const items = menuItems(world);
  const at = world.menu.path.join('/');
  const picking = at === 'screen/where' && world.screens.length > 1;
  // 모니터 이름은 「DELL U2723QE」처럼 길다. 그 화면에서만 종이를 넓게 쓴다.
  const w = picking ? 400 : 300;
  const foot = world.mp.on ? 52 : 34;
  const h = 62 + items.length * 34 + foot;
  const x = (world.w - w) / 2;
  const y = (world.h - h) / 2 - 40;

  // 뒤를 살짝 눌러 둔다. 메뉴가 떠 있는 동안은 이게 앞이라는 표시다.
  ctx.fillStyle = 'rgba(20, 18, 16, 0.28)';
  ctx.fillRect(0, 0, world.w, world.h);

  ctx.save();
  fitCenter(ctx, world, w, h + 80);
  paperScrap(ctx, x, y, w, h, 17);
  stroke(ctx, [[x + 8, y + 8], [x + w - 8, y + 8], [x + w - 8, y + h - 8], [x + 8, y + h - 8]],
         { width: 2, color: INK, seed: 19, amp: 1.4, close: true, sharp: true, halo: false });

  const title = world.menu.confirmQuit ? '정말 끝낼까?' : (MENU_TITLES[at] ?? '몰겜');
  text(ctx, title, x + 26, y + 40, { font: `800 19px ${HAN}`, color: INK, halo: 0 });

  items.forEach((item, i) => {
    const iy = y + 74 + i * 34;
    const picked = i === world.menu.index;
    if (picked) {
      stroke(ctx, [[x + 22, iy + 7], [x + w - 26, iy + 7]],
             { width: 2.4, color: RED, seed: 23 + i, amp: 0.8, halo: false });
      text(ctx, '▸', x + 8, iy, { font: `700 15px ${KEYS}`, color: RED, halo: 0 });
    }
    // 지금 이 창이 떠 있는 화면에는 점을 찍는다. 이름만으로는 어느 쪽인지 모른다.
    if (item.mark) {
      text(ctx, '●', x + w - 34, iy, { font: `700 11px ${KEYS}`, color: RED, align: 'right', halo: 0 });
    }
    text(ctx, item.label, x + 26, iy, {
      font: `${picked ? 700 : 600} 16px ${HAN}`, color: picked ? INK : PENCIL, halo: 0,
    });
    if (item.note) {
      const font = `500 12px ${MONO}`;
      const right = x + w - (item.mark ? 48 : 26);
      ctx.font = `${picked ? 700 : 600} 16px ${HAN}`;
      const room = right - (x + 26 + ctx.measureText(item.label).width + 14);
      text(ctx, clip(ctx, item.note, font, room), right, iy,
           { font, color: PENCIL, align: 'right', halo: 0 });
    }
  });

  let fy = y + h - foot + 8;
  if (world.mp.on) {
    text(ctx, '같이 하는 중에는 판이 안 멈춘다', x + 26, fy,
         { font: `600 12px ${HAN}`, color: RED, halo: 0 });
    fy += 18;
  }
  // 화면을 고르는 동안은 메뉴가 안 닫히니 ⌥← 가 「닫기」가 아니라 「뒤로」다.
  text(ctx, at ? '⌥↑↓ 고르기   ⌥→ 고름   ⌥← 뒤로' : '⌥↑↓ 고르기   ⌥→ 확인   ⌥← 닫기',
       x + 26, fy, { font: `600 12px ${KEYS}`, color: PENCIL, halo: 0 });
  ctx.restore();
}

// MARK: 우승

/// 이긴 사람이 화면 한가운데서 만세를 부른다. 이 3초가 지나야 다음 판을 시작할 수 있다 —
/// 이긴 사람이 이겼다는 걸 볼 새도 없이 다음 판이 시작되면 이길 이유가 없어진다.
export function drawVictory(ctx, world, time, color, alone = false) {
  const winner = world.mp.winner;
  if (!winner) return;
  const rise = Math.min(1, world.overFor / 0.3);

  const figure = {
    x: world.w / 2, air: 0, vx: 0, vy: 0, crouch: 0, facing: 1, walk: 0,
    groundY: world.groundY, dead: false, waiting: false, danger: false, deadFor: 0,
    grabbing: -1, heldBy: -1, cheer: true,
  };
  ctx.save();
  ctx.globalAlpha = rise;
  // 조금 크게 세운다. 이 사람이 오늘의 주인공이다.
  ctx.translate(figure.x, world.groundY);
  ctx.scale(1.35, 1.35);
  ctx.translate(-figure.x, -world.groundY);
  drawStickman(ctx, figure, time, Math.floor(time * 9), { color });
  ctx.restore();

  text(ctx, `${winner.name} 승!`, world.w / 2, world.groundY - 150, {
    font: `800 30px ${HAN}`, color: RED, align: 'center', alpha: rise,
  });

  // 순위표 없이 이 카드만 뜨는 게임(배구)에서는 「다음 판」 안내도 여기가 갖는다.
  if (!alone) return;
  const left = VICTORY_SECONDS - world.overFor;
  if (left > 0) {
    hint(ctx, `다음 판까지 ${Math.ceil(left)}초`, world.w / 2, world.groundY - 210, 0.85);
  } else if (canRestart(world)) {
    hint(ctx, world.mp.on ? '⌥R  누르면 다음 판' : '⌥R  또는  아무 방향키나 눌러 다시',
         world.w / 2, world.groundY - 210, 0.72 + 0.28 * Math.sin(world.overFor * 3.4));
  }
}
