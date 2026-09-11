CSS = """
<style>
/* 몰겜의 색 그대로. src/draw/ink.js 에 있는 값을 옮겨 왔다 —
   종이 · 잉크 · 연필 · 빨간 볼펜, 그리고 네 사람의 셔츠 넷. */
:root {
  --paper:#faf7ee; --sheet:#f4efe2; --ink:#141210; --pencil:#6b665c;
  --pen:#d02f22; --rule:#e2d9c4; --box:#6f4a2c;
  --p1:#2f6fb0; --p2:#3f8f56; --p3:#d97b1f; --p4:#8a5bb5;
  --grid:rgba(20,18,16,.055);
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper:#131110; --sheet:#1c1917; --ink:#f2ece0; --pencil:#a29a8c;
    --pen:#ef5a48; --rule:#332e28; --box:#b98a5c;
    --p1:#6aa8e0; --p2:#6dc189; --p3:#e8a45c; --p4:#b58ce0;
    --grid:rgba(242,236,224,.05);
  }
}
:root[data-theme="dark"] {
  --paper:#131110; --sheet:#1c1917; --ink:#f2ece0; --pencil:#a29a8c;
  --pen:#ef5a48; --rule:#332e28; --box:#b98a5c;
  --p1:#6aa8e0; --p2:#6dc189; --p3:#e8a45c; --p4:#b58ce0;
  --grid:rgba(242,236,224,.05);
}

body {
  background:var(--paper); color:var(--ink);
  font:400 16px/1.75 "IBM Plex Sans KR","Apple SD Gothic Neo",sans-serif;
  /* 모눈종이. 기획은 모눈 위에서 한다. */
  background-image:linear-gradient(var(--grid) 1px,transparent 1px),
                   linear-gradient(90deg,var(--grid) 1px,transparent 1px);
  background-size:21px 21px;
  word-break:keep-all;
}
.page { max-width:1000px; margin:0 auto; padding:0 24px 96px 24px; }

/* 빨간 여백선. 게임 안 시계 카드에 그어 둔 그 선이다. */
@media (min-width:900px) {
  .page { padding-left:96px; position:relative; }
  .page::before {
    content:""; position:absolute; left:56px; top:0; bottom:0; width:2px;
    background:var(--pen); opacity:.55;
  }
}

h1,h2,h3 { font-family:"Gothic A1","Apple SD Gothic Neo",sans-serif; text-wrap:balance; margin:0; }
h1 { font-weight:900; font-size:clamp(40px,7vw,64px); letter-spacing:-.02em; line-height:1.05; }
h2 { font-weight:900; font-size:clamp(22px,3vw,28px); letter-spacing:-.01em; }
h3 { font-weight:800; font-size:18px; }
p { margin:0; max-width:62ch; }
a { color:var(--pen); }
:focus-visible { outline:2px solid var(--pen); outline-offset:3px; }

.head { padding:72px 0 40px 0; display:flex; flex-direction:column; gap:18px; }
.kicker { font:600 12px/1 "IBM Plex Mono",monospace; letter-spacing:.22em;
          text-transform:uppercase; color:var(--pen); }
.lede { font-size:19px; color:var(--ink); max-width:56ch; }
.spec { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
        gap:1px; background:var(--rule); border:1px solid var(--rule); margin-top:8px; }
.spec div { background:var(--paper); padding:12px 14px; }
.spec dt { font:600 11px/1 "IBM Plex Mono",monospace; letter-spacing:.14em;
           color:var(--pencil); text-transform:uppercase; }
.spec dd { margin:7px 0 0 0; font-weight:600; font-size:15px; }

section { padding-top:56px; display:flex; flex-direction:column; gap:20px; }
.num { font:500 12px/1 "IBM Plex Mono",monospace; color:var(--pencil); letter-spacing:.1em; }
.sub { color:var(--pencil); font-size:15px; max-width:62ch; }

table { border-collapse:collapse; width:100%; font-size:15px; }
th,td { text-align:left; padding:9px 14px 9px 0; border-bottom:1px solid var(--rule);
        vertical-align:top; }
th { font:600 11px/1.4 "IBM Plex Mono",monospace; letter-spacing:.12em; color:var(--pencil);
     text-transform:uppercase; padding-bottom:8px; }
td.k { font-family:"IBM Plex Mono",monospace; white-space:nowrap; font-weight:500; }
td.n { color:var(--pencil); }
.scroll { overflow-x:auto; }

.verbs { display:grid; gap:1px; background:var(--rule); border:1px solid var(--rule); }
.verb { background:var(--paper); padding:16px 18px; display:grid;
        grid-template-columns:minmax(110px,150px) minmax(0,1fr) minmax(0,1fr); gap:18px; align-items:baseline; }
.verb b { font-family:"Gothic A1",sans-serif; font-weight:800; font-size:17px; }
.verb .why { color:var(--pencil); font-size:14px; }
@media (max-width:760px) { .verb { grid-template-columns:1fr; gap:6px; } }

/* 스테이지 한 장 */
.stage { border-top:2px solid var(--ink); padding-top:16px;
         display:flex; flex-direction:column; gap:14px; }
/* 장 제목. 판 넷을 묶는 가로줄이라 빨간 볼펜으로 한 번 긋는다. */
.chapter { margin:44px 0 6px 0; padding-bottom:10px; font:900 20px/1 "Gothic A1",sans-serif;
           border-bottom:2px solid var(--pen); }
.chapter + .stage { border-top:0; padding-top:6px; }
.stage-head { display:flex; align-items:baseline; gap:14px; flex-wrap:wrap; }
.stage-no { font:900 26px/1 "Gothic A1",sans-serif; color:var(--pen); font-variant-numeric:tabular-nums; }
.stage-name { font:900 24px/1.2 "Gothic A1",sans-serif; }
.stage-verb { font:500 12px/1 "IBM Plex Mono",monospace; color:var(--pencil);
              border:1px solid var(--rule); padding:5px 8px; letter-spacing:.06em; }
.stage-line { color:var(--pencil); margin-top:-6px; }
.ruler { font:500 11px/1.4 "IBM Plex Mono",monospace; letter-spacing:.45em;
         color:var(--pencil); white-space:pre; }

.map { background:var(--sheet); border:1px solid var(--rule); padding:12px 16px 14px 16px;
       overflow-x:auto; }
.map .inner { display:inline-block; min-width:100%; }
/* 칸이 네모로 보여야 맵이 맵으로 읽힌다. 자간을 벌려 글자 한 칸의 가로를 줄 높이에 맞춘다. */
.map pre { margin:0; font:500 13px/1.02 "IBM Plex Mono",monospace; letter-spacing:.45em; }
.map i { color:var(--pencil); opacity:.3; font-style:normal; }
.map b { font-weight:700; }
.g{color:var(--ink)} .sp{color:var(--pen)} .pl{color:var(--pencil)}
.hk{color:var(--pencil)} .key{color:var(--pen)} .dr{color:var(--pen)}
.sw{color:var(--p2)} .sh{color:var(--p4)} .bx{color:var(--box)} .bx2{color:var(--box)}
.cv{color:var(--p1)}
.p1{color:var(--p1)} .p2{color:var(--p2)} .p3{color:var(--p3)} .p4{color:var(--p4)}

.solve { display:grid; grid-template-columns:1fr 1fr; gap:22px; }
@media (max-width:760px) { .solve { grid-template-columns:1fr; gap:14px; } }
.solve h4 { margin:0 0 4px 0; font:600 11px/1 "IBM Plex Mono",monospace;
            letter-spacing:.14em; text-transform:uppercase; color:var(--pencil); }
.solve .fail { border-left:2px solid var(--pen); padding-left:14px; }
.solve p { font-size:15px; }

.whos { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:1px;
        background:var(--rule); border:1px solid var(--rule); }
.who { background:var(--paper); margin:0; padding:18px; display:flex; gap:16px; align-items:flex-start; }
.who svg { flex:none; }
.who figcaption { display:flex; flex-direction:column; gap:6px; font-size:14px; }
.who figcaption b { font-family:"Gothic A1",sans-serif; font-weight:800; font-size:15px; }
.who figcaption span { color:var(--pencil); }
.who code, code { font:500 12px "IBM Plex Mono",monospace; color:var(--pencil); }

.steps { display:grid; gap:1px; background:var(--rule); border:1px solid var(--rule); }
.step { background:var(--paper); padding:18px; }
.step header { display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
.step h3 { font-size:17px; }
.step time { font:500 12px "IBM Plex Mono",monospace; color:var(--pencil); }
.step ul { margin:12px 0 0 0; padding-left:18px; color:var(--ink); font-size:15px; }
.step li { margin-bottom:5px; }

.note { border-left:2px solid var(--pen); padding-left:16px; color:var(--ink); }
footer { margin-top:72px; padding-top:24px; border-top:1px solid var(--rule);
         color:var(--pencil); font-size:14px; display:flex; flex-direction:column; gap:8px; }
footer a { color:var(--pencil); }
</style>
"""
