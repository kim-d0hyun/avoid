// 시험 하나하나를 세는 곳.
//
// 여섯 자리에서 제각각 세면 모아 적을 수가 없다. 세는 법을 여기 하나로 두고,
// run.mjs 는 맨 끝의 `::결과` 한 줄만 읽는다.

let total = 0;
let bad = 0;
// 모아 돌릴 때는 통과한 줄을 안 찍는다. 떨어진 것만 눈에 남아야 한다.
const quiet = process.env.TEST_QUIET === '1';

export function check(label, got, want) {
  total++;
  const same = JSON.stringify(got) === JSON.stringify(want);
  if (!same) bad++;
  if (!same || !quiet) {
    console.log(`  ${same ? 'ok  ' : 'FAIL'} ${label}  →  ${JSON.stringify(got)}`
              + (same ? '' : `  (기대 ${JSON.stringify(want)})`));
  }
  return same;
}

export const ok = (label, cond) => check(label, !!cond, true);

/// 묶음 제목.
export function say(title) { if (!quiet) console.log(`\n${title}`); }

/// 재 본 값을 곁들여 적을 때. 통과·실패를 가르지 않는다.
export function note(line) { if (!quiet) console.log(`     ${line}`); }

/// 맨 끝에 한 번. 이 줄을 run.mjs 가 읽는다.
export function done(name) {
  console.log(`::결과 ${name} ${total - bad}/${total}`);
  process.exit(bad === 0 ? 0 : 1);
}
