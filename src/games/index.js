// 어떤 게임들이 있나.
//
// 게임 하나는 이 다섯 가지만 지키면 된다:
//
//   fresh()                      판 하나가 쓸 살림살이를 새로 만든다 (world.bag 이 된다)
//   update(world, dt)            굴린다. 방장인지 손님인지는 world.mp.role 로 갈라 쓴다
//   draw(ctx, world, t, boil, upright)   판 안의 것을 그린다 (글자판은 hud.js 가 그린다)
//   pack(world) / unpack(world, x)       방장이 손님에게 넘길 것. 없으면 null 을 준다
//
// 더 가질 수 있는 것: move(world, dt) 로 내 사람의 물리를 통째로 바꾸고(넷이서 — 땅이 평평하지 않다),
// camera(world, vw, vh) 로 화면을 따라다니게 하고, figure 로 사람 그리는 법을 바꾸고, hud 로 글자판을 덧그린다.
//
// 달리기·점프·부딪힘·붙잡기·판 시작과 끝·순위표는 게임이 신경 쓰지 않는다. world.js 것이다.

import dodge from './dodge.js';
import volley from './volley.js';
import coop from './coop.js';

export const games = [dodge, volley, coop];

export const DEFAULT_GAME = dodge.id;

export function gameById(id) {
  return games.find((g) => g.id === id) ?? games[0];
}
