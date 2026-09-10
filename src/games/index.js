// 어떤 게임들이 있나.
//
// 게임 하나는 이 다섯 가지만 지키면 된다:
//
//   fresh()                      판 하나가 쓸 살림살이를 새로 만든다 (world.bag 이 된다)
//   update(world, dt)            굴린다. 방장인지 손님인지는 world.mp.role 로 갈라 쓴다
//   draw(ctx, world, t, boil, upright)   판 안의 것을 그린다 (글자판은 hud.js 가 그린다)
//   pack(world) / unpack(world, x)       방장이 손님에게 넘길 것. 없으면 null 을 준다
//
// 달리기·점프·부딪힘·붙잡기·판 시작과 끝·순위표는 게임이 신경 쓰지 않는다. world.js 것이다.

import dodge from './dodge.js';
import volley from './volley.js';

export const games = [dodge, volley];

export const DEFAULT_GAME = dodge.id;

export function gameById(id) {
  return games.find((g) => g.id === id) ?? games[0];
}
