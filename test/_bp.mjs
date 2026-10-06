import './dom-stub.mjs';
const w = await import('../src/game/world.js');
const lens = [];
for (let g = 0; g < 5; g++) {
  const world = w.createWorld({ms:0,dodged:0},'bumper'); world.onRecord=()=>{}; let over=null; world.onGameOver=(r)=>{over=r}; world.onMenu=()=>{};
  w.resize(world,1512,944); w.pickGame(world,'bumper'); world.mp.waiting = true; world.state='play';
  let t0 = 0, lastRound = 0; let i=0;
  for (i=0;i<60*900 && !over;i++){ w.update(world,1/60); const b=world.bag; if (b.round!==lastRound){ if (lastRound) lens.push((i-t0)/60); t0=i; lastRound=b.round; } }
  console.log('판', g, over?.name ?? '안 끝남', [...world.bag.score.values()].join(':'), (i/60).toFixed(0)+'s');
}
lens.sort((a,b)=>a-b); console.log('한 판 길이 중간', lens[lens.length>>1].toFixed(1), '최대', lens.at(-1).toFixed(1), '판 수', lens.length);
