// 전부 돌리고, 무엇을 확인했는지 test/결과.md 에 남긴다.
//
// 시험은 돌린 사람 머릿속에만 남으면 없는 것과 같다. 「이 경우는 봤나?」를 물어볼 자리가
// 있어야 한다. 그래서 돌릴 때마다 확인한 것 전부를 한 파일에 적어 두고, 그 파일을 같이 넣는다.
//
//   npm test          전부 돌리고 결과.md 를 새로 적는다
//   node test/volley.mjs   한 자리만 눈으로 본다

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SUITES = [
  ['world.mjs', '판 안의 규칙', '메뉴 · 화면 고르기 · 붙잡기 · 뿌리치기 · 투명도'],
  ['volley.mjs', '배구', '편 · 점수 · 벽 · 바닥 · 천장 · 슬라이딩'],
  ['net.mjs', '여럿이 붙잡기', '뭉쳐 있을 때 손이 몇 개나 가나'],
  ['switch.mjs', '게임 갈아 끼우기', '똥피하기를 하다 배구방에 들어가기'],
  ['edge.mjs', '경우의 수 ①~⑭', '나가기 · 구경 · 깨진 꾸러미 · 판 크기'],
  ['edge2.mjs', '경우의 수 ⑮~㉖', '동시에 붙잡기 · 한 편이 통째로 나가기 · 오래 굴리기'],
];

// 경로에 한글이 들어 있다. URL 의 pathname 은 %E3%84%B7 로 감싸져 있어서 그대로는 못 쓴다.
const here = fileURLToPath(new URL('.', import.meta.url));
const git = (args) => spawnSync('git', args, { cwd: here, encoding: 'utf8' }).stdout?.trim() ?? '';

let cases = 0;
let bad = 0;
const report = [];

for (const [file, name, what] of SUITES) {
  const run = spawnSync(process.execPath, [file], { cwd: here, encoding: 'utf8' });
  const lines = (run.stdout + run.stderr).split('\n');
  const tally = lines.find((l) => l.startsWith('::결과'));
  // 이름에 빈칸이 들어 있다 (「판 안의 규칙」). 숫자는 맨 뒤 한 토막이다.
  const [passed, total] = (tally?.trim().split(' ').pop() ?? '0/0').split('/').map(Number);
  cases += total;
  bad += total - passed;

  // 확인한 것들을 묶음 제목과 함께 그대로 옮겨 적는다.
  const rows = [];
  let group = null;
  for (const line of lines) {
    if (line.startsWith('::') || !line.trim()) continue;
    if (!line.startsWith(' ')) { group = line.trim(); rows.push({ group }); continue; }
    const m = line.match(/^ {2}(ok  |FAIL) (.+?)  →  (.*)$/);
    if (m) { rows.push({ ok: m[1] === 'ok  ', label: m[2], got: m[3] }); continue; }
    // 재 본 값 (note). 통과·실패는 아니지만 남겨 둘 값이다.
    if (line.startsWith('     ')) rows.push({ note: line.trim() });
  }
  report.push({ file, name, what, passed, total, rows, crashed: !tally });

  const mark = !tally ? '터짐' : passed === total ? '통과' : `${total - passed}개 실패`;
  console.log(`${passed === total && tally ? '  ok  ' : '  FAIL'} ${name.padEnd(16)} ${passed}/${total} ${mark}`);
  if (!tally) console.log(run.stdout + run.stderr);
  else for (const l of lines) if (l.includes('FAIL')) console.log(`        ${l.trim()}`);
}

const when = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });
const head = [
  '# 시험 결과',
  '',
  '`npm test` 가 적는다. 손으로 고치지 않는다.',
  '',
  `- 돌린 때 ${when}`,
  `- 버전 ${git(['describe', '--tags', '--always'])} (${git(['rev-parse', '--short', 'HEAD'])})`,
  `- **${cases}가지 중 ${cases - bad}가지 통과${bad ? `, ${bad}가지 실패` : ''}**`,
  '',
  '| 자리 | 무엇을 보나 | 결과 |',
  '| --- | --- | --- |',
  ...report.map((r) => `| \`test/${r.file}\` ${r.name} | ${r.what} | ${r.passed}/${r.total} |`),
  '',
];

const line = (row) => {
  if (row.group) return `\n**${row.group}**\n`;
  if (row.note) return `- _${row.note}_`;
  return `- ${row.ok ? '' : '**떨어짐** '}${row.label} → \`${row.got}\``;
};
const body = report.flatMap((r) => [`## ${r.name}`, ...r.rows.map(line), '']);

writeFileSync(new URL('결과.md', import.meta.url), head.concat(body).join('\n') + '\n');
console.log(`\n${cases}가지 중 ${cases - bad}가지 통과 → test/결과.md`);
process.exit(bad === 0 ? 0 : 1);
