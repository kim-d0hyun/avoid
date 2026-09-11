# -*- coding: utf-8 -*-
"""「각자 보는 화면」 — 한 순간에 넷이 각자 무엇을 보는지 네 화면으로 그린다."""
import json
MOMENT = json.load(open('moment.json'))

CSS = """
<style>
.views { display:grid; grid-template-columns:repeat(auto-fit,minmax(420px,1fr)); gap:18px; }
.view { display:flex; flex-direction:column; gap:8px; }
.view canvas { width:100%; height:auto; display:block; border:1px solid var(--rule); }
.view figcaption { font-size:13.5px; line-height:1.55; }
.view figcaption b { font-family:"Gothic A1",sans-serif; font-weight:800; }
</style>
"""

CAPTIONS = [
    ('1', '파랑 · 방장', '2층 복도. 파란 열쇠는 이미 집었고 노란 열쇠 네 칸 앞 — 저 바닥은 노랗다, 집으면 떨어진다. 나머지 셋은 화면 밖: 왼쪽 가장자리에 화살표 셋, 이름 · 몇 층 · 몇 칸.'),
    ('2', '초록', '어깨를 내주고 남은 자리, 세 칸 벽 바로 앞. 오른쪽으로 1번이 보이고 아래 복도의 4번도 화면 안. 3번만 왼쪽 밖.'),
    ('3', '주황', '시작 자리에서 기다리는 중. 판 왼쪽 끝이라 카메라가 벽에 붙어 내가 화면 가운데에 있지 않다 — 그게 맞다. 4번은 오른쪽에, 1·2번은 위 오른쪽 화살표.'),
    ('4', '보라', '1층 복도를 걸어 노란 블록 앞. 블록이 사라지길 기다린다. 2층의 2번이 위에 보이고, 1번은 오른쪽 위 화살표, 3번은 왼쪽 화살표.'),
]

def html_block():
    figs = ''.join(f"""
<figure class="view">
  <canvas data-view="{who}" width="10" height="10"></canvas>
  <figcaption><b>{who}번 · {name}</b> — {text}</figcaption>
</figure>""" for who, name, text in CAPTIONS)
    return f'<div class="views">{figs}</div>'

JS = """
const MOMENT = __MOMENT__;
function drawView(cv, st, me) {
  const rows = st.art.split('\\n'); const W = rows[0].length, H = rows.length;
  const VW = 36, VH = 22, T = 12;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = VW*T*dpr; cv.height = VH*T*dpr; cv.style.aspectRatio = (VW*T) + '/' + (VH*T);
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const dark = (matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light') || document.documentElement.dataset.theme === 'dark';
  const paper = dark ? '#1c1917' : '#faf7ee', ink = dark ? '#f2ece0' : '#141210', pencil = dark ? '#a29a8c' : '#6b665c';
  const P = MOMENT.p; const [mx, my] = P[me];
  // 카메라 — 내 자리 중심, 판 끝에서 멈춘다
  let cx = Math.round(mx - VW/2 + 0.5), cy = Math.round(my - VH/2 + 2);
  cx = Math.max(0, Math.min(W - VW, cx)); cy = Math.max(0, Math.min(H - VH, cy));
  // 남의 작업 화면 위 — 흐릿한 문서 몇 줄로 「투명한 창」임을 보인다
  g.fillStyle = paper; g.fillRect(0, 0, VW*T, VH*T);
  g.fillStyle = dark ? 'rgba(242,236,224,.05)' : 'rgba(20,18,16,.05)';
  for (let i = 0; i < 9; i++) g.fillRect(40, 60 + i*22, 120 + ((i*53)%180), 6);
  g.fillRect(40, 40, 200, 10);
  // 지형
  for (let y = 0; y < VH; y++) for (let x = 0; x < VW; x++) {
    const ch = (rows[cy+y] || '')[cx+x]; if (!ch || ch === '.' || '1234'.includes(ch)) continue;
    const X = x*T, Y = y*T;
    g.fillStyle = (ch === '#') ? ink : (COL[ch] || pencil);
    if (ch === '=') { g.fillRect(X, Y+T*0.3, T, T*0.4); continue; }
    if (ch === 'H' || ch === '|') { g.fillRect(X+2, Y, 2, T); g.fillRect(X+T-4, Y, 2, T); g.fillRect(X+2, Y+T/2-1, T-4, 2); continue; }
    if (ch === '^') { g.beginPath(); g.moveTo(X, Y+T); g.lineTo(X+T/2, Y+2); g.lineTo(X+T, Y+T); g.fill(); continue; }
    if ('uUwWO'.includes(ch)) { g.beginPath(); g.ellipse(X+T/2, Y+T/2, T*0.42, T*0.7, 0, 0, Math.PI*2); g.fill(); continue; }
    if ('ryb'.includes(ch)) { g.beginPath(); g.arc(X+T/2, Y+T/2, T*0.3, 0, Math.PI*2); g.fill(); g.fillRect(X+T/2, Y+T/2-1, T*0.5, 2); continue; }
    if (ch === '#') { g.fillRect(X, Y, T, T); g.strokeStyle = paper; g.lineWidth = .6; g.beginPath(); g.moveTo(X+2, Y+T-2); g.lineTo(X+T-2, Y+2); g.stroke(); continue; }
    g.fillRect(X, Y, T, T);
    if ('RYB'.includes(ch)) { g.strokeStyle = ink; g.lineWidth = 1; g.strokeRect(X+.5, Y+.5, T-1, T-1); }
    if ('xX'.includes(ch)) { g.strokeStyle = paper; g.lineWidth = 1; g.beginPath(); g.moveTo(X+T/2, Y); g.lineTo(X+T/2, Y+T); g.moveTo(X, Y+T/2); g.lineTo(X+T, Y+T/2); g.stroke(); }
  }
  // 사람 — 화면 안에 있는 사람만 그린다
  const names = {1:'도현', 2:'범창', 3:'민지', 4:'수아'};
  const floorOf = (y) => y <= 11 ? '2층' : '1층';
  for (const who of ['1','2','3','4']) {
    const [px, py] = P[who]; const i = +who - 1;
    const vx = px - cx, vy = py - cy;
    if (vx < 0 || vx >= VW || vy < 0 || vy >= VH) {
      // 화면 밖 — 가장자리 화살표. 그 사람 쪽을 가리키고, 옷 색 네모와 몇 층인지 적는다
      const ax = Math.max(T, Math.min(VW*T - T, (vx + .5)*T)), ay = Math.max(T*1.4, Math.min(VH*T - T, (vy + .5)*T));
      const dx = Math.sign(vx < 0 ? -1 : vx >= VW ? 1 : 0), dy = vy < 0 ? -1 : vy >= VH ? 1 : 0;
      g.save(); g.translate(ax, ay); g.rotate(Math.atan2(dy, dx || (dy ? 0 : 1)));
      g.fillStyle = SHIRT[i]; g.beginPath(); g.moveTo(8, 0); g.lineTo(-4, -6); g.lineTo(-4, 6); g.closePath(); g.fill(); g.restore();
      g.fillStyle = SHIRT[i]; g.strokeStyle = ink; g.lineWidth = 1;
      const bx = ax - dx*22 - 5, by = ay - 8 + (dy < 0 ? 14 : dy > 0 ? -14 : 0);
      g.beginPath(); g.roundRect(bx, by, 10, 15, 2); g.fill(); g.stroke();
      g.fillStyle = ink; g.font = '600 9px "IBM Plex Sans KR", sans-serif'; g.textAlign = dx > 0 ? 'right' : 'left';
      g.fillText(names[who] + ' · ' + floorOf(py) + ' ' + Math.abs(px - mx) + '칸', bx + (dx > 0 ? -4 : 14), by + 11);
      continue;
    }
    const X = (vx + .5)*T, feet = (vy + 1)*T;
    const bw = T*0.8, bh = T*1.2;
    g.fillStyle = SHIRT[i]; g.strokeStyle = ink; g.lineWidth = 1.4;
    g.beginPath(); g.roundRect(X - bw/2, feet - bh - 2, bw, bh, 2.5); g.fill(); g.stroke();
    g.strokeStyle = ink; g.lineWidth = 1.2; g.beginPath(); g.moveTo(X-3, feet-2); g.lineTo(X-3, feet); g.moveTo(X+3, feet-2); g.lineTo(X+3, feet); g.stroke();
    g.fillStyle = ink; g.fillRect(X-2.5, feet-bh+3, 1.2, 2.4); g.fillRect(X+1.3, feet-bh+3, 1.2, 2.4);
    // 머리 표
    g.strokeStyle = SHIRT[i]; g.lineWidth = 1.6; g.beginPath();
    if (i === 0) { g.moveTo(X-1, feet-bh-2); g.quadraticCurveTo(X, feet-bh-8, X+3, feet-bh-6); }
    if (i === 1) { g.arc(X-2.5, feet-bh+4, 2.2, 0, Math.PI*2); g.moveTo(X+3.7, feet-bh+4); g.arc(X+1.5, feet-bh+4, 2.2, 0, Math.PI*2); }
    if (i === 2) { g.moveTo(X-bw/2-1.5, feet-bh+5); g.lineTo(X-bw/2-1.5, feet-bh-1); g.quadraticCurveTo(X, feet-bh-5, X+bw/2+1.5, feet-bh-1); g.lineTo(X+bw/2+1.5, feet-bh+5); }
    if (i === 3) { g.lineWidth = 3; g.moveTo(X-bw/2+1, feet-bh-1); g.quadraticCurveTo(X, feet-bh-5, X+bw/2-1, feet-bh-1); g.moveTo(X+1, feet-bh-1.5); g.lineTo(X+bw/2+4, feet-bh-2.5); }
    g.stroke();
    // 이름표 — 내 것은 빨간 밑줄, 방장은 왕관
    g.fillStyle = SHIRT[i]; g.font = '700 9px "IBM Plex Sans KR", sans-serif'; g.textAlign = 'center';
    const ty = feet - bh - 12; g.fillText(names[who], X, ty);
    if (who === MOMENT.host) { g.fillStyle = SHIRT[i]; g.font = '700 8px sans-serif'; g.fillText('♛', X - g.measureText(names[who]).width/2 - 7, ty); }
    if (who === me) { g.strokeStyle = '#d02f22'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(X-12, ty+3); g.lineTo(X+12, ty+3); g.stroke(); }
  }
  // 글자판 — 왼쪽 위 판 이름, 오른쪽 위 방
  const card = (x, y, w, h) => { g.fillStyle = dark ? 'rgba(28,25,23,.92)' : 'rgba(250,247,238,.92)'; g.fillRect(x, y, w, h); g.strokeStyle = pencil; g.lineWidth = .6; g.strokeRect(x+.5, y+.5, w-1, h-1); };
  card(8, 8, 118, 26); g.fillStyle = '#d02f22'; g.fillRect(12, 12, 1.5, 18);
  g.fillStyle = ink; g.textAlign = 'left'; g.font = '800 11px "Gothic A1", sans-serif'; g.fillText('2-1 두 길', 20, 21);
  g.fillStyle = pencil; g.font = '600 8px "IBM Plex Sans KR", sans-serif'; g.fillText('학교 · 되감기 0 · 넷이 다 모여야 끝', 20, 30);
  card(VW*T - 96, 8, 88, 26); g.fillStyle = ink; g.font = '600 12px "IBM Plex Mono", monospace'; g.fillText('K3P9', VW*T - 88, 21);
  g.fillStyle = pencil; g.font = '600 8px "IBM Plex Sans KR", sans-serif'; g.fillText('4명 · ' + (me === MOMENT.host ? '방장' : '손님'), VW*T - 88, 30);
}
document.querySelectorAll('canvas[data-view]').forEach(cv => drawView(cv, STAGES[MOMENT.stage], cv.dataset.view));
""".replace("__MOMENT__", json.dumps(MOMENT, ensure_ascii=False))
