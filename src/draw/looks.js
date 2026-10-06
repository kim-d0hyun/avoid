// 배구 캐릭터의 생김새 — 졸라맨 위에 덧그리는 것. 옷 색은 편 색 그대로 두고(편을 읽는 데 쓴다),
// 캐릭터는 **머리 모양 · 소품 · 몸 비율**로만 가른다.
//
// drawStickman 의 opts.decor 로 들어간다. 뒤집힌 공간(+x 가 앞)이고, 머리 가운데·어깨·엉덩이 자리를 받는다.
//   phase 'under' — 몸통보다 먼저 (몸집)   'over' — 얼굴까지 그린 뒤 (머리에 얹는 것)

import { INK, PENCIL, PAPER_SOLID, stroke } from './ink.js';

const GOLD = '#d9a21b';

const LOOKS = {
  /// 두부 — 얼굴을 감싸는 둥근 네모(두부 한 모).
  dubu: {
    over(ctx, g) {
      const { headX: x, headY: y } = g;
      const r = 11.5;
      stroke(ctx, [[x - r, y - r + 3], [x - r + 3, y - r], [x + r - 3, y - r], [x + r, y - r + 3],
                   [x + r, y + r - 3], [x + r - 3, y + r], [x - r + 3, y + r], [x - r, y + r - 3]],
             { width: 2.2, color: INK, close: true, seed: g.seed + 61, amp: 0.4, halo: false });
      stroke(ctx, [[x - 6, y - r + 3.5], [x - 2, y - r + 3.5]],
             { width: 1.3, color: PENCIL, seed: g.seed + 62, amp: 0.2, halo: false });
    },
  },
  /// 깡총 — 토끼귀 머리띠. 한쪽 귀가 살짝 꺾였다.
  kkang: {
    over(ctx, g) {
      const { headX: x, headY: y } = g;
      stroke(ctx, [[x - 9, y - 5], [x - 5, y - 10], [x + 5, y - 10], [x + 9, y - 5]],
             { width: 2, color: g.color ?? INK, seed: g.seed + 63, amp: 0.2, halo: false });
      const ear = (bx, tip, s) => stroke(ctx,
        [[bx - 2.5, y - 9], [bx - 3.5, y - 18], tip, [bx + 3.5, y - 18], [bx + 2.5, y - 9]],
        { width: 2.2, color: INK, seed: g.seed + s, amp: 0.4, halo: true, fill: PAPER_SOLID });
      ear(x - 3, [x - 5, y - 30], 64);
      ear(x + 4, [x + 13, y - 25], 65);
    },
  },
  /// 망치 — 몸통이 두껍고(옷 색 덩어리) 머리를 짧게 쳤다.
  mangchi: {
    under(ctx, g) {
      const cx = g.shldX * 0.5, cy = (g.hipY + g.shldY) / 2 + 1;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(g.lean);
      ctx.beginPath();
      ctx.ellipse(1.5, 0, 17.5, 18, 0, 0, Math.PI * 2);
      ctx.lineWidth = 6; ctx.strokeStyle = PAPER_SOLID; ctx.stroke();
      ctx.fillStyle = g.color ?? '#c9c3b6'; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
      ctx.restore();
    },
    over(ctx, g) {
      const { headX: x, headY: y } = g;
      for (let i = -3; i <= 3; i++) {
        stroke(ctx, [[x + i * 2.6, y - 9.5], [x + i * 2.6 + 0.6, y - 12.5]],
               { width: 1.6, color: INK, seed: g.seed + 70 + i, amp: 0.1, halo: false });
      }
    },
  },
  /// 번개 — 이마에서 앞으로 꺾여 나가는 번개 앞머리.
  beongae: {
    over(ctx, g) {
      const { headX: x, headY: y } = g;
      stroke(ctx, [[x - 8, y - 7], [x - 1, y - 13], [x + 1, y - 7], [x + 9, y - 14], [x + 8, y - 6], [x + 16, y - 10]],
             { width: 2.4, color: GOLD, seed: g.seed + 80, amp: 0.15, halo: true, sharp: true });
    },
  },
  /// 문어 — 팔이 길다(drawStickman opts.arms). 머리엔 아무것도 없다 — 긴 팔이 곧 얼굴이다.
  muneo: {},
};

/// 그 캐릭터의 덧그림 함수 (없으면 undefined).
export function lookDecor(id) {
  const look = LOOKS[id];
  if (!look || (!look.under && !look.over)) return undefined;
  return (ctx, phase, g) => look[phase]?.(ctx, g);
}
