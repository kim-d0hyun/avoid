// 판 안의 규칙 — 메뉴 · 화면 고르기 · 붙잡기 · 뿌리치기 · 투명도 · 게임 갈아 끼우기.
//
// 고칠 때마다 `npm test` 로 전부 돌린다. 결과는 test/결과.md 에 남는다.

import './dom-stub.mjs';
const { createWorld, resize, press, menuItems, update, restart, clearedStage } = await import(new URL('../src/game/world.js', import.meta.url));
const { interpolate } = await import(new URL('../src/game/net.js', import.meta.url));
const { games } = await import(new URL('../src/games/index.js', import.meta.url));

import { check, ok, say, done } from './check.mjs';

function make(screens = []) {
  const w = createWorld({ ms: 0, dodged: 0 });
  resize(w, 1512, 982);
  w.state = 'ready';        // 고르는 화면이 아니라 판 앞에서 연다 (메뉴가 다르다)
  w.screens = screens;
  w.picked = [];
  w.onMenu = (a) => w.picked.push(a);
  return w;
}
const labels = (w) => menuItems(w).map((i) => i.label);
const tap = (w, a) => { press(w, a, true); press(w, a, false); };

const THREE = [
  { number: 1, name: 'Built-in Retina Display', w: 1512, h: 982, current: true },
  { number: 2, name: 'DELL U2723QE', w: 2560, h: 1440, current: false },
  { number: 7, name: 'LG UltraFine', w: 3840, h: 2160, current: false },
];

const into = (w, id) => {           // 그 줄까지 내려가 한 겹 들어간다
  let guard = 0;
  while (menuItems(w)[w.menu.index].id !== id && guard++ < 20) tap(w, 'duck');
  tap(w, 'right');
};

say('메뉴 — 첫 화면은 여섯 줄이다');
{
  const w = make([{ number: 1, name: '노트북', w: 1512, h: 982, current: true }]);
  tap(w, 'menu');
  check('항목', labels(w),
        ['이어서 하기', '같이 하기', '설정', '홈으로 나가기', '화면 숨기기', '게임 끝내기']);
  check('지금 혼자인지 옆에 적는다', menuItems(w)[1].note, '혼자 하는 중');
  check('창을 어떻게 띄워 뒀는지도', menuItems(w)[2].note, '화면 전체');
  check('무슨 게임 중인지도', menuItems(w)[3].note, '똥피하기');
}

say('메뉴 — 판을 하는 중이면 「다시 시작」이 붙는다');
{
  const w = make([]);
  w.state = 'play';
  tap(w, 'menu');
  check('둘째 줄', labels(w)[1], '다시 시작');
}

say('메뉴 — 게임 도중 홈으로 나간다');
{
  const w = make([]);
  w.state = 'play';
  tap(w, 'menu');
  while (menuItems(w)[w.menu.index].id !== 'pick') tap(w, 'duck');
  tap(w, 'right');
  check('게임 고르는 화면으로', w.state, 'pick');
  check('메뉴는 닫힌다', w.menu.open, false);
  check('고르는 줄은 하던 게임에 가 있다', w.pick, 0);
  // 홈에서는 「홈으로 나가기」와 「다시 시작」이 없다
  tap(w, 'menu');
  check('홈 메뉴', labels(w), ['고르던 데로', '같이 하기', '설정', '화면 숨기기', '게임 끝내기']);
}

say('방 목록 — 코드를 받아 적지 않아도 골라서 들어간다');
{
  const w = make([]);
  tap(w, 'menu'); into(w, 'together');
  ok('같이 하기에 방 목록이 있다', labels(w).includes('방 목록'));
  into(w, 'rooms');
  check('찾은 게 없으면 없다고 적는다', labels(w), ['열려 있는 방이 없다']);
  // 셸이 목록을 밀어 주면 그대로 뜬다
  w.rooms = [{ code: 'K3P9', game: '야구', people: 2, old: false },
             { code: 'QW21', game: '오목', people: 1, old: true }];
  check('찾은 방이 줄로 뜬다', labels(w), ['K3P9', 'QW21']);
  const rows = menuItems(w);
  check('무슨 게임에 몇 명인지 적는다', rows[0].note, '야구 · 2명');
  check('버전이 다르면 그것도 적는다', rows[1].note, '오목 · 1명 · 버전 다름');
  check('고르면 그 방으로 들어간다', rows[0].id, 'join:K3P9');
  // 같이 하기 줄에는 몇 개 열려 있는지 적힌다
  tap(w, 'left');
  const back = menuItems(w).find((r) => r.id === 'rooms');
  check('몇 개 열려 있는지', back.note, '2개');
}

say('아무도 안 들어온 내 방에서도 남의 방에 들어갈 수 있다');
{
  // 야구·오목은 고르는 순간 방이 열린다(opensRoom). 그러면 곧바로 「방 안」이 되는데
  // 방 안 메뉴에 코드 입력이 없어서 **친구가 불러 준 코드를 넣을 데가 사라졌다.**
  const w = make([]);
  w.mp.on = true; w.mp.role = 'host'; w.mp.code = 'AB12'; w.mp.myId = 1;
  tap(w, 'menu');
  into(w, 'together');
  ok('혼자 있는 방에서는 코드로 입장이 보인다', labels(w).includes('코드로 입장'));
  // 남이 들어와 있으면 안 보인다 — 두고 나가면 그 사람만 남는다
  w.mp.others.set(2, { id: 2, name: '손2', dead: false, waiting: false });
  tap(w, 'left'); into(w, 'together');
  ok('남이 들어오면 안 보인다', !labels(w).includes('코드로 입장'));
  // 손님일 때도 안 보인다 (나가기가 따로 있다)
  const g = make([]);
  g.mp.on = true; g.mp.role = 'guest'; g.mp.code = 'AB12'; g.mp.myId = 2;
  tap(g, 'menu'); into(g, 'together');
  ok('손님 화면에도 안 보인다', !labels(g).includes('코드로 입장'));
}

say('같이 하기 — 방을 열 때 무슨 게임인지부터 고른다');
{
  const w = make([]);
  tap(w, 'menu');
  into(w, 'together');
  check('안으로 들어왔다', w.menu.path, ['together']);
  check('고를 것', labels(w), ['방 만들기', '방 목록', '코드로 입장', '이름 바꾸기']);

  into(w, 'host');
  check('또 한 겹', w.menu.path, ['together', 'host']);
  check('게임 목록', labels(w), ['똥피하기', '배구', '야구', '오목', '알까기', '윷놀이', '넷이서', '셋이서']);
  check('처음 짚는 것은 하던 게임', w.menu.index, 0);

  tap(w, 'duck');                                    // 배구
  tap(w, 'right');
  check('셸로 넘어간 것', w.picked, ['host:volley']);
  check('메뉴는 닫힌다', w.menu.open, false);
}

say('같이 하기 — 방 안에서는 코드 복사와 닫기');
{
  const w = make([]);
  w.mp.on = true; w.mp.role = 'host'; w.mp.code = 'K3P9';
  tap(w, 'menu');
  check('방 이름이 옆에 뜬다', menuItems(w)[1].note, '방 K3P9 · 1명');
  into(w, 'together');
  check('고를 것', labels(w), ['이름 바꾸기', '코드 복사', '방 목록', '코드로 입장', '게임 바꾸기', '방 깨기 — 모두 홈으로']);   // 방장은 게임도 바꾼다. 혼자면 남의 방에도 갈 수 있다
  check('코드가 옆에', menuItems(w)[1].note, 'K3P9');
  w.mp.role = 'guest';
  check('손님은 나가기', labels(w)[2], '방에서 나가기');
}

say('이름 바꾸기 — 메뉴에 있다');
{
  const w = make([]);
  tap(w, 'menu');
  into(w, 'together');
  check('혼자일 때도 고칠 수 있다', labels(w), ['방 만들기', '방 목록', '코드로 입장', '이름 바꾸기']);
  while (menuItems(w)[w.menu.index].id !== 'name') tap(w, 'duck');
  tap(w, 'right');
  check('셸이 이름 묻는 창을 연다', w.picked, ['name']);
  check('메뉴는 닫힌다', w.menu.open, false);
}

say('방장은 하던 중에도 게임을 바꾼다 — 같이 하기 ▸ 게임 바꾸기');
{
  const w = make([]);
  w.mp.on = true; w.mp.role = 'host'; w.mp.myId = 1; w.mp.code = 'K3P9';
  tap(w, 'menu'); into(w, 'together');
  check('방장 메뉴에 게임 바꾸기가 있다', labels(w).includes('게임 바꾸기'), true);
  into(w, 'game');
  check('게임 여덟을 고른다', labels(w), ['똥피하기', '배구', '야구', '오목', '알까기', '윷놀이', '넷이서', '셋이서']);
  check('처음 짚는 것은 하던 게임', w.menu.index, 0);
  tap(w, 'duck'); tap(w, 'right');
  check('고르면 game: 으로 알린다', w.picked, ['game:volley']);
  check('메뉴가 닫힌다', w.menu.open, false);
  // 손님 메뉴에는 없다
  const g = make([]); g.mp.on = true; g.mp.role = 'guest'; g.mp.myId = 2;
  tap(g, 'menu'); into(g, 'together');
  check('손님 메뉴에는 게임 바꾸기가 없다', labels(g).includes('게임 바꾸기'), false);

}

say('내보내기 — 방장만, 그 자리에서');
{
  const w = make([]);
  w.mp.on = true; w.mp.role = 'host'; w.mp.code = 'K3P9'; w.mp.myId = 1;
  w.mp.others.set(2, { id: 2, name: '범창', waiting: false, dead: false });
  w.mp.others.set(3, { id: 3, name: '잠수', waiting: true, dead: true });
  tap(w, 'menu');
  into(w, 'together');
  check('방장에게는 내보내기가 있다', labels(w), ['이름 바꾸기', '코드 복사', '게임 바꾸기', '내보내기', '방 깨기 — 모두 홈으로']);
  check('몇 명인지 옆에', menuItems(w).find((i) => i.id === 'kick').note, '2명');

  into(w, 'kick');
  check('사람 목록', labels(w), ['범창', '잠수']);
  check('뭐 하고 있는지도', menuItems(w).map((i) => i.note), ['하는 중', '구경 중']);

  tap(w, 'duck');                                    // 잠수
  tap(w, 'right');
  check('셸로 넘어간 것', w.picked, ['kick:3']);
  check('목록에 남아 있다 (둘째도 내보낼 수 있다)', [w.menu.open, w.menu.path], [true, ['together', 'kick']]);

  w.mp.others.delete(3);                             // 셸이 끊고 알려 준다
  w.mp.others.delete(2);
  check('다 내보내면 한 겹 나온다', labels(w), ['이름 바꾸기', '코드 복사', '방 목록', '코드로 입장', '게임 바꾸기', '방 깨기 — 모두 홈으로']);
  check('길도 나왔다', w.menu.path, ['together']);
}

say('내보내기 — 손님은 못 한다');
{
  const w = make([]);
  w.mp.on = true; w.mp.role = 'guest'; w.mp.code = 'K3P9';
  w.mp.others.set(1, { id: 1, name: '방장', waiting: false, dead: false });
  tap(w, 'menu');
  into(w, 'together');
  check('나가기만 있다', labels(w), ['이름 바꾸기', '코드 복사', '방에서 나가기']);
}

say('설정 — 화면 크기·창 위치·투명도·키·모니터로 갈린다');
{
  const w = make([{ number: 1, name: '노트북', w: 1512, h: 982, current: true }]);
  tap(w, 'menu');
  into(w, 'settings');
  check('화면 전체면 「창 위치」가 없다 (한 대라 모니터 설정은 「한 대」)', labels(w), ['화면 크기', '화면 투명도', '키 설정', '모니터 설정', '스크린샷에 잡히기']);

  into(w, 'size');
  check('두 겹 안', w.menu.path, ['settings', 'size']);
  check('고를 것들', labels(w), ['화면 전체', '3/4', '절반', '작게', '아주 작게']);
  check('지금 것에 점', menuItems(w).map((i) => !!i.mark), [true, false, false, false, false]);

  tap(w, 'duck'); tap(w, 'duck');                    // 절반
  tap(w, 'right');
  check('셸로 넘어간 것', w.picked, ['size:0.55']);
  check('고르고도 열려 있다', [w.menu.open, w.menu.path], [true, ['settings', 'size']]);

  w.size = 0.55;                                     // 셸이 줄이고 알려 준다
  tap(w, 'left');
  check('한 겹 뒤로', w.menu.path, ['settings']);
  check('줄이고 나면 「창 위치」가 생긴다', labels(w),
        ['화면 크기', '창 위치', '화면 투명도', '키 설정', '모니터 설정', '스크린샷에 잡히기']);
  check('첫 줄 옆에 지금 상태', menuItems(w).find((i) => i.id === 'size').note, '절반');

  into(w, 'spot');
  check('놓을 자리', labels(w), ['정중앙', '왼쪽 위', '오른쪽 위', '왼쪽 아래', '오른쪽 아래']);
  tap(w, 'duck'); tap(w, 'duck');
  tap(w, 'right');
  check('셸로 넘어간 것', w.picked, ['size:0.55', 'spot:tr']);

  tap(w, 'left'); tap(w, 'left');
  check('첫 화면까지 나왔다', w.menu.path, []);
  tap(w, 'left');
  check('한 번 더 누르면 닫힌다', w.menu.open, false);
}

say('⌥ 떼면 숨기기 — 그 자리에서 켜고 끈다');
{
  const w = make([]);
  tap(w, 'menu');
  into(w, 'settings'); into(w, 'keys');
  const row = () => menuItems(w).find((i) => i.id.startsWith('peek:'));
  check('처음엔 켜져 있다', [row().note, !!row().mark], ['켜짐', true]);

  while (!menuItems(w)[w.menu.index].id.startsWith('peek:')) tap(w, 'duck');
  tap(w, 'right');
  check('셸로 넘어간 것', w.picked, ['peek:0']);
  check('메뉴는 그대로 열려 있다', [w.menu.open, w.menu.path], [true, ['settings', 'keys']]);

  w.optionHide = false;                              // 셸이 끄고 알려 준다
  check('꺼진 것이 보인다', [row().note, !!row().mark], ['꺼짐', false]);
  tap(w, 'right');
  check('다시 켜는 값이 넘어간다', w.picked, ['peek:0', 'peek:1']);
}

say('설정 — 모니터가 여럿이면 「모니터 설정」에 목록이 뜬다');
{
  const w = make(THREE);
  tap(w, 'menu');
  into(w, 'settings');
  check('모니터 설정 옆에 지금 화면', menuItems(w).find((i) => i.id === 'where').note, 'Built-in Retina Display');

  into(w, 'where');
  check('목록', labels(w), ['Built-in Retina Display', 'DELL U2723QE', 'LG UltraFine']);
  check('해상도도 같이', menuItems(w).map((i) => i.note), ['1512×982', '2560×1440', '3840×2160']);
  check('지금 화면에 표시', menuItems(w).map((i) => !!i.mark), [true, false, false]);
  check('처음 짚는 것은 지금 화면', w.menu.index, 0);

  tap(w, 'duck');
  tap(w, 'right');
  check('셸로 넘어간 것', w.picked, ['screen:2']);
  check('고르고도 메뉴는 열려 있다', [w.menu.open, w.menu.path], [true, ['settings', 'where']]);
}

say('모니터 설정 — 고르는 중에 모니터를 뽑으면 「하나뿐」 안내가 뜬다');
{
  const w = make(THREE);
  tap(w, 'menu');
  into(w, 'settings');
  into(w, 'where');
  w.screens = [THREE[0]];
  check('한 대뿐이라 안내 한 줄', labels(w), ['모니터가 하나뿐이에요']);
  tap(w, 'right');                          // 안내 줄은 골라도 아무 일 없다
  check('안 터진다', w.menu.open, true);
}

say('투명도 — 화면 안에서 고르고 셸로 넘어간다');
{
  const w = make([]);
  tap(w, 'menu');
  into(w, 'settings');
  into(w, 'fade');
  check('목록', labels(w), ['그대로', '85%', '70%', '55%', '40%']);
  tap(w, 'duck'); tap(w, 'duck');
  tap(w, 'right');
  check('셸로 넘어간 것', w.picked, ['fade:0.7']);
}

say('메뉴 — 화면 목록이 판을 다시 시작해도 안 사라진다');
{
  const w = make(THREE);
  restart(w);
  check('남아 있다', w.screens.length, 3);
}

// ── 붙잡기
function duo() {
  const w = make();
  w.mp.on = true;
  w.mp.myId = 1;
  w.mp.role = 'host';
  w.state = 'play';
  w.player.x = 400;
  w.player.groundY = w.groundY;
  const other = {
    id: 2, name: '범창', x: 430, baseX: 430, vx: 0, air: 0, vy: 0, crouch: 0, facing: -1,
    walk: 0, dead: false, waiting: false, deadFor: 0, danger: false, age: 0, errorX: 0,
    state: 0, grabbing: -1, escapes: 0, seenEscapes: 0, dodged: 0, grabAim: 0, groundY: w.groundY,
  };
  w.mp.others.set(2, other);
  return [w, other];
}

say('붙잡기 — 누르고 있는 동안 잡는다');
{
  const [w, other] = duo();
  press(w, 'grab', true);
  check('잡았다', w.player.grabbing, 2);
  for (let i = 0; i < 60; i++) update(w, 1 / 60);       // 1초 내내 누르고 있는다
  check('1초 뒤에도 잡고 있다', w.player.grabbing, 2);
  press(w, 'grab', false);
  check('떼면 놓는다', w.player.grabbing, -1);
}

say('붙잡기 — 예전처럼 4초에 저절로 풀리지 않는다');
{
  const [w] = duo();
  press(w, 'grab', true);
  // 똥은 치워 둔다. 여기서 보려는 건 「시간이 지나면 저절로 풀리나」 하나뿐이다.
  for (let i = 0; i < 60 * 6; i++) { w.bag.poops.length = 0; update(w, 1 / 60); }
  check('안 죽었다', w.player.dead, false);
  check('6초 뒤에도 잡고 있다', w.player.grabbing, 2);
}

say('붙잡기 — 더 가까이 붙는다');
{
  const [w, other] = duo();
  press(w, 'grab', true);
  for (let i = 0; i < 60; i++) update(w, 1 / 60);
  const gap = Math.abs(other.x - w.player.x);
  check('간격이 21픽셀 언저리', Math.round(gap), 21);
  check('예전 32보다 붙었다', gap < 26, true);
}

say('붙잡기 — 잡힌 쪽이 스페이스바로 뿌리친다');
{
  const [w, other] = duo();
  other.grabbing = 1;                                   // 남이 나를 잡았다
  interpolate(w, 1 / 60);
  check('잡혔다', w.player.heldBy, 2);
  const before = w.player.escapes;
  press(w, 'grab', true);
  check('풀렸다', w.player.heldBy, -1);
  check('뿌리친 횟수가 늘었다', w.player.escapes, before + 1);
}

say('뿌리치기 — 밀쳐 내면서 풀려난다 (잡힌 쪽)');
{
  const [w, other] = duo();                             // 잡은 놈이 내 오른쪽(430 > 400)
  other.grabbing = 1;
  interpolate(w, 1 / 60);
  const x0 = w.player.x;
  press(w, 'grab', true);                               // 뿌리친다
  check('왼쪽으로 밀려난다', w.player.knock < 0, true);
  for (let i = 0; i < 12; i++) { w.bag.poops.length = 0; update(w, 1 / 60); }
  check('실제로 물러났다', w.player.x < x0 - 8, true);
  check('0.2초면 3분의 1 밑으로 잦아든다', Math.round(Math.abs(w.player.knock)) < 100, true);
}

say('뿌리치기 — 반대쪽에서 잡혔으면 반대로 밀려난다');
{
  const [w, other] = duo();
  other.x = 370; other.baseX = 370;                     // 잡은 놈이 내 왼쪽
  other.grabbing = 1;
  interpolate(w, 1 / 60);
  press(w, 'grab', true);
  check('오른쪽으로 밀려난다', w.player.knock > 0, true);
}

say('뿌리치기 — 붙잡고 있던 쪽이 뒤로 밀린다');
{
  const [w, other] = duo();                             // 내가 오른쪽 놈(430)을 잡는다
  press(w, 'grab', true);
  update(w, 1 / 60);
  check('내가 잡았다', w.player.grabbing, 2);
  const x0 = w.player.x;
  other.escapes = 7;                                    // 저쪽이 뿌리쳤다고 알려 온다
  interpolate(w, 1 / 60);
  check('손이 풀렸다', w.player.grabbing, -1);
  check('왼쪽으로 밀려난다', w.player.knock < 0, true);
  check('잡힌 쪽보다 세게 밀린다', Math.abs(w.player.knock) > 500, true);
  for (let i = 0; i < 12; i++) { w.bag.poops.length = 0; update(w, 1 / 60); }
  check('실제로 물러났다', w.player.x < x0 - 20, true);
  check('팔 방향도 풀렸다', w.player.grabAim, 0);
}

say('뿌리치기 — 밀려나도 벽은 안 뚫는다');
{
  const [w, other] = duo();
  w.player.x = 20;                                      // 왼쪽 벽에 붙어 있다
  other.x = 44; other.baseX = 44;
  other.grabbing = 1;
  interpolate(w, 1 / 60);
  press(w, 'grab', true);                               // 왼쪽으로 밀려난다
  for (let i = 0; i < 20; i++) { w.bag.poops.length = 0; update(w, 1 / 60); }
  check('벽 안에 남는다', w.player.x >= 18, true);
  check('벽에 닿으면 밀려남이 멈춘다', w.player.knock, 0);
}

say('뿌리치기 — 밀려남이 영영 남지 않는다');
{
  const [w, other] = duo();
  other.grabbing = 1;
  interpolate(w, 1 / 60);
  press(w, 'grab', true);
  for (let i = 0; i < 60; i++) { w.bag.poops.length = 0; update(w, 1 / 60); }
  check('1초 뒤엔 0', w.player.knock, 0);
}

say('붙잡기 — 오른쪽을 잡고 왼쪽으로 가면 팔은 오른쪽에 남는다');
{
  const [w, other] = duo();                             // 상대는 내 오른쪽(430 > 400)
  press(w, 'grab', true);
  w.input.left = true;
  for (let i = 0; i < 30; i++) update(w, 1 / 60);
  check('걸음은 왼쪽', w.player.facing, -1);
  check('팔은 오른쪽', w.player.grabAim, 1);
  check('실제로 왼쪽으로 갔다', w.player.vx < 0, true);
  press(w, 'grab', false);
  for (let i = 0; i < 5; i++) update(w, 1 / 60);
  check('놓으면 팔 방향도 풀린다', w.player.grabAim, 0);
}

say('붙잡기 — 남이 남을 잡은 것도 보인다');
{
  const [w, other] = duo();
  const third = { ...other, id: 3, x: 470, baseX: 470, name: '보람' };
  w.mp.others.set(3, third);
  other.grabbing = 3;                                   // 2번이 3번을 잡았다 (3번은 오른쪽)
  interpolate(w, 1 / 60);
  check('3번은 붙잡힌 상태로 그려진다', third.heldBy, 2);
  check('2번의 팔은 3번 쪽(오른쪽)', other.grabAim, 1);
  check('3번의 팔은 2번 쪽(왼쪽)', third.grabAim, -1);
  check('나는 아무와도 안 엮였다', [w.player.grabbing, w.player.heldBy], [-1, -1]);
}

say('붙잡기 — 메뉴를 열었다 닫아도 손이 안 굳는다');
{
  const [w] = duo();
  press(w, 'grab', true);
  tap(w, 'menu');                                       // 메뉴 열기
  press(w, 'grab', false);                              // 메뉴 위에서 손을 뗐다
  check('놓였다', w.player.grabbing, -1);
}

say('게임 고르기 — 배구로 갈아 끼우면 살림살이도 바뀐다');
{
  const w = make();
  w.state = 'pick';        // 이 시험만은 진짜 고르는 화면에서 시작한다
  check('켜면 고르는 화면', w.state, 'pick');
  tap(w, 'duck');
  tap(w, 'right');
  check('배구', w.gameId, 'volley');
  check('공이 생겼다', typeof w.bag.ball, 'object');
  check('점수 0:0', w.bag.score, [0, 0]);
  tap(w, 'menu');
  const at = menuItems(w).findIndex((i) => i.id === 'pick');
  w.menu.index = at;
  check('메뉴에 지금 게임이 적힌다', menuItems(w)[at].note, '배구');
  tap(w, 'right');
  check('다시 고르는 화면', w.state, 'pick');
}

say('붙잡기 — 누르고 있으면 다가오는 사람을 잡는다');
{
  const [w2, other] = duo();
  other.x = w2.player.x + 300; other.baseX = other.x;    // 아직 멀다
  press(w2, 'grab', true);                               // 손을 뻗고 기다린다
  check('아직 못 잡는다', w2.player.grabbing, -1);
  for (let i = 0; i < 40; i++) {                          // 상대가 다가온다
    other.x -= 8; other.baseX = other.x;
    w2.bag.poops.length = 0;
    update(w2, 1 / 60);
    if (w2.player.grabbing >= 0) break;
  }
  check('다가오자 잡혔다', w2.player.grabbing, 2);
  press(w2, 'grab', false);
  check('떼면 놓는다', w2.player.grabbing, -1);
}

say('안내 종이 — 한 번 놀아 본 게임은 기억한다');
{
  const w = createWorld({ ms: 0, dodged: 0 });
  resize(w, 1512, 944);
  check('처음엔 아무 게임도 안 놀아 봤다', !!w.seen?.dodge, false);
  w.state = 'ready';
  update(w, 1 / 60);
  check('준비 화면만으로는 놀아 본 게 아니다', !!w.seen?.dodge, false);
  w.state = 'play';
  update(w, 1 / 60);
  check('판이 돌면 놀아 본 것', w.seen?.dodge, true);
  restart(w);
  check('다시 시작해도 기억한다', w.seen?.dodge, true);
  check('다른 게임은 아직', !!w.seen?.volley, false);
}

// ── 열린 판 · 판 고르기 · 대기방

/// 협동 게임을 방 안 시작 전 화면(ready)에 세운다.
function coopRoom(progress = {}) {
  const w = createWorld({ ms: 0, dodged: 0 }, 'coop');
  resize(w, 1512, 982);
  restart(w);                       // coop begin 이 첫 판을 연다
  w.state = 'ready';
  w.mp.on = true; w.mp.role = 'host'; w.mp.myId = 1; w.mp.code = 'K3P9';
  w.progress = progress;
  w.picked = [];
  // main.js 의 stage: 처리와 같은 길 — 고른 판을 다시 연다.
  w.onMenu = (a) => {
    w.picked.push(a);
    if (a.startsWith('stage:')) { w.stage = Number(a.slice(6)); w.bagResets = 0; restart(w); }
  };
  return w;
}

say('열린 판 — 판을 깨면 다음 판까지 열리고, 셸에 남긴다');
{
  const w = createWorld({ ms: 0, dodged: 0 }, 'coop');
  const saved = [];
  w.saveProgress = (id, i) => saved.push([id, i]);
  check('처음엔 아무것도 안 열려 있다', w.progress.coop ?? 0, 0);
  clearedStage(w, 'coop', 0, 13);           // 1판(index 0)을 깼다
  check('둘째 판까지 열린다', w.progress.coop, 1);
  check('셸에 남겼다', saved, [['coop', 1]]);
  clearedStage(w, 'coop', 0, 13);           // 같은 판을 또 깨도 안 내려간다
  check('되돌아가지 않는다', w.progress.coop, 1);
  clearedStage(w, 'coop', 4, 13);           // 5판을 깼다 — 뛰어오른다
  check('여섯째 판까지', w.progress.coop, 5);
  clearedStage(w, 'coop', 13, 13);          // 마지막 판을 깼다
  check('마지막 판은 열린 채로 (그 위로는 안 간다)', w.progress.coop, 13);
  check('저장은 올라간 때만 불렀다', saved, [['coop', 1], ['coop', 5], ['coop', 13]]);
}

say('판 고르기 — 방장은 판을 골라 바로 그 판부터 한다');
{
  const w = coopRoom({ coop: 2 });          // 3판까지 열려 있다 (index 0·1·2)
  tap(w, 'menu');
  into(w, 'together');
  check('방장 메뉴에 판 고르기가 있다', labels(w).includes('판 고르기'), true);
  into(w, 'stage');
  check('열다섯 다 목록에 있다', menuItems(w).length, 15);
  check('라벨은 월드 번호 · 이름', menuItems(w)[0].label, '1-1 · 표지판');
  const locked = menuItems(w).map((i) => !!i.locked);
  check('셋까지 열리고 넷째부터 잠긴다', [locked[0], locked[2], locked[3], locked[13]], [false, false, true, true]);
  check('처음 짚는 것은 지금 판(0)', w.menu.index, 0);
  check('지금 판에 점', menuItems(w)[0].mark, true);

  // 잠긴 판은 못 고른다
  w.menu.index = menuItems(w).findIndex((i) => i.id === 'stage:6');
  tap(w, 'right');
  check('잠긴 판은 안 넘어간다', w.picked, []);
  check('메뉴도 그대로 열려 있다', [w.menu.open, w.menu.path], [true, ['together', 'stage']]);

  // 열린 판(3판 = index 2)을 고른다
  w.menu.index = menuItems(w).findIndex((i) => i.id === 'stage:2');
  tap(w, 'right');
  check('셸로 넘어간 것', w.picked, ['stage:2']);
  check('메뉴가 닫힌다', w.menu.open, false);
  check('그 판을 world.stage 에 앉힌다', w.stage, 2);
  check('그 판을 다시 열었다', w.bag.stage, 2);
  check('시작 전 화면이다 (바로 시작하지 않는다)', w.state, 'ready');
}

say('판 고르기 · 대기방 — 판이 없는 게임(똥피하기·배구)에는 없다');
{
  const dodge = games.find((g) => g.id === 'dodge');
  const volley = games.find((g) => g.id === 'volley');
  check('똥피하기는 판이 없다', !!dodge.staged, false);
  check('배구는 판이 없다', !!volley.staged, false);
  check('똥피하기는 대기방 없음', !!dodge.waitsForCrew, false);
  check('배구는 대기방 없음', !!volley.waitsForCrew, false);
  // 메뉴에도 안 뜬다
  const w = make([]);                       // 똥피하기
  w.mp.on = true; w.mp.role = 'host'; w.mp.myId = 1; w.mp.code = 'K3P9';
  tap(w, 'menu'); into(w, 'together');
  check('똥피하기 방장 메뉴에 판 고르기가 없다', labels(w).includes('판 고르기'), false);
}


say('넷이서·셋이서는 고르는 순간 방이 열린다 (혼자 못 한다)');
{
  const w = make([]);           // 고르는 화면, 방 없음
  w.picked = []; w.onMenu = (a) => w.picked.push(a);
  press(w, 'right', true); press(w, 'right', false);   // 첫 게임(똥피하기) 고름 — 방 안 연다
  check('똥피하기는 방 없이', w.picked.some((a) => String(a).startsWith('host:')), false);
  // 넷이서로 커서를 옮겨 고른다
  w.state = 'pick';
  while (games[w.pick].id !== 'coop') press(w, 'duck', true), press(w, 'duck', false);
  w.picked = [];
  press(w, 'right', true); press(w, 'right', false);
  check('넷이서를 고르면 방을 연다', w.picked, ['host:coop']);
  // 셋이서도
  w.state = 'pick'; while (games[w.pick].id !== 'trio') press(w, 'duck', true), press(w, 'duck', false);
  w.picked = [];
  press(w, 'right', true); press(w, 'right', false);
  check('셋이서도 방을 연다', w.picked, ['host:trio']);
  // 이미 방에 있으면 다시 안 연다
  const g = make([]); g.state = 'pick'; g.mp.on = true; g.mp.role = 'host';
  while (games[g.pick].id !== 'coop') tap(g, 'duck');
  g.picked = []; g.onMenu = (a) => g.picked.push(a);
  tap(g, 'right');
  check('이미 방이면 host: 안 보낸다', g.picked.some((a) => String(a).startsWith('host:')), false);
}

say('홈으로 나가기 — 방 안이면 방을 떠난다 (방장이면 방이 깨진다)');
{
  const w = make([]); w.state = 'play';
  w.mp.on = true; w.mp.role = 'host'; w.mp.code = 'K3P9';
  w.picked = []; w.onMenu = (a) => w.picked.push(a);
  tap(w, 'menu');
  while (menuItems(w)[w.menu.index].id !== 'pick') tap(w, 'duck');
  tap(w, 'right');
  check('방을 떠나라고 셸에 알린다', w.picked, ['leave']);
  check('메뉴는 닫힌다', w.menu.open, false);
  // 혼자면 그냥 홈으로 (방 안 떠남)
  const s = make([]); s.state = 'play'; s.picked = []; s.onMenu = (a) => s.picked.push(a);
  tap(s, 'menu'); while (menuItems(s)[s.menu.index].id !== 'pick') tap(s, 'duck'); tap(s, 'right');
  check('혼자면 leave 안 보낸다', s.picked, []);
  check('혼자면 홈으로', s.state, 'pick');
}

done('판 안의 규칙');
