# 셋이서 기획 페이지 — PLAN.md + 판 열셋의 지도(글자 한 칸)를 HTML 로. python3 build.py → plan3.html
import re, html, sys, importlib.util
HERE = '/Users/minishtech/orca/workspaces/ㄷㄷ/turban/docs/셋이서'
sys.path.insert(0, HERE)
import stages                                   # 셋이서 판 (이 폴더 것)
spec = importlib.util.spec_from_file_location('css4', '/Users/minishtech/orca/workspaces/ㄷㄷ/turban/docs/넷이서/css.py')
css4 = importlib.util.module_from_spec(spec); spec.loader.exec_module(css4); CSS = css4.CSS
COL = {'#':'#141210','=':'#6b665c','H':'#8a7a5a','|':'#8a7a5a','-':'#2f6fb0','~':'#b8912a','v':'#9c8f74','>':'#2f6fb0','<':'#2f6fb0','S':'#2f9c9c',
       'x':'#8a5a2b','X':'#5a3a1b','r':'#d02f22','y':'#c9a000','b':'#2f6fb0','R':'#f0a8a0','Y':'#efe0a0','B':'#a8c4f0',
       'a':'#3f8f56','p':'#3f8f56','q':'#3f8f56','A':'#7fbf95','P':'#7fbf95','Q':'#7fbf95','n':'#3f8f56','M':'#2f6fb0','m':'#2f6fb0',
       'u':'#2f6fb0','U':'#2f6fb0','w':'#2f6fb0','W':'#2f6fb0','O':'#8a5bb5','{':'#d97b1f','}':'#d97b1f','1':'#3f8f56','2':'#d97b1f','3':'#7a4fb5','4':'#2f6fb0',
       'c':'#2f9c9c','C':'#7fc9c9','t':'#d97b1f','T':'#f0c69a','l':'#2f9c9c','L':'#7fc9c9'}
def pre_map(art):
    rows = []
    for row in art.split('\n'):
        rows.append(''.join(' ' if ch == '.' else f'<b style="color:{COL.get(ch,"#141210")}">{html.escape(ch)}</b>' for ch in row))
    return '<pre class="map">' + '\n'.join(rows) + '</pre>'
def inline(s):
    s = html.escape(s); s = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', s); return re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
def md(text):
    out, para, tbl, lst = [], [], [], []
    def flush_p():
        nonlocal para
        if para: out.append('<p>' + inline(' '.join(para)) + '</p>'); para = []
    def flush_t():
        nonlocal tbl
        if tbl:
            rows = [r for r in tbl if not re.match(r'^\|[\s\-|:]+\|$', r)]
            cells = [[inline(c.strip()) for c in r.strip().strip('|').split('|')] for r in rows]
            h = '<tr>' + ''.join(f'<th>{c}</th>' for c in cells[0]) + '</tr>'
            b = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in cells[1:])
            out.append(f'<div class="tw"><table>{h}{b}</table></div>'); tbl = []
    def flush_l():
        nonlocal lst
        if lst: out.append('<ul>' + ''.join(f'<li>{inline(i)}</li>' for i in lst) + '</ul>'); lst = []
    for line in text.split('\n'):
        if line.startswith('|'): flush_p(); flush_l(); tbl.append(line); continue
        flush_t()
        m = re.match(r'^(#{1,3}) (.*)', line)
        if m:
            flush_p(); flush_l(); lvl = len(m.group(1))
            if lvl == 1: continue
            out.append(f'<h{lvl+1}>{inline(m.group(2))}</h{lvl+1}>'); continue
        if re.match(r'^(- |\d+\. )', line): flush_p(); lst.append(re.sub(r'^(- |\d+\. )', '', line)); continue
        if not line.strip(): flush_p(); flush_l(); continue
        para.append(line.strip())
    flush_p(); flush_t(); flush_l()
    return '\n'.join(out)
plan = open(f'{HERE}/PLAN.md', encoding='utf-8').read()
worlds = []
for s in stages.S:
    if s['world'] not in worlds: worlds.append(s['world'])
cards = []
for i, s in enumerate(stages.S):
    no = f"{worlds.index(s['world'])+1}-{sum(1 for t in stages.S[:i+1] if t['world']==s['world'])}"
    rows = s['art'].split('\n'); w, h = len(rows[0]), len(rows)
    end = '한 명만 닿으면 끝' if s['end']=='one' else '셋이 다 모여야 끝'
    tips = ''.join(f'<li>{html.escape(t)}</li>' for t in s['tips'])
    lim = f' · {s["limit"]}초' if s.get('limit') else ''
    cards.append(f'''<section class="stage"><div class="num">{no}</div><h3>{html.escape(s["name"])} <small>{html.escape(s["world"])} · {html.escape(s["shape"])} · {w}×{h} · {end}{lim} · {len(s["steps"])}걸음</small></h3>
<p class="stage-line"><b>{html.escape(s["pattern"])}.</b> {html.escape(s["scene"])}</p>
{pre_map(s["art"])}
<div class="two"><div><h4>어떻게 깨나</h4><ul>{tips}</ul></div></div></section>''')
EXTRA = """<style>
.map{font:10px/10px ui-monospace,Menlo,monospace;letter-spacing:1px;background:#faf7ee;border:1px solid #d9d2c0;padding:10px;overflow-x:auto;white-space:pre;color:#141210}
.map b{font-weight:800}
.stage{position:relative;margin:28px 0;padding-top:6px;border-top:1px solid var(--rule)}
.stage h3 small{font-weight:500;color:var(--pencil);font-size:.8em;margin-left:.5em}
.tw{overflow-x:auto}
.kicker{color:var(--pen);font-weight:700;letter-spacing:.06em;font-size:.85em}
</style>"""
legend = ('<p class="sub">글자 하나가 한 칸. <b style="color:#141210">#</b> 땅·벽 · <b style="color:#6b665c">=</b> 선반 · <b style="color:#8a7a5a">H</b> 사다리 · '
          '<b style="color:#2f6fb0">-</b> 왕복 발판 길 · <b style="color:#b8912a">~</b> 깜빡이는 발판 · <b style="color:#9c8f74">v</b> 삭은 발판 · <b style="color:#2f6fb0">&gt; &lt;</b> 무빙워크 · '
          '<b style="color:#2f9c9c">S</b> 스프링 · <b style="color:#8a5a2b">x X</b> 상자 · <b style="color:#d02f22">r y b</b> 열쇠 / <b style="color:#f0a8a0">R Y B</b> 그 색 블록 · '
          '<b style="color:#3f8f56">a p q</b> 스위치·누름판 / <b style="color:#7fbf95">A P Q</b> 셔터 · <b style="color:#3f8f56">n</b> <b style="color:#2f6fb0">M m</b> 나오는 발판 · '
          '<b style="color:#2f6fb0">u U w W</b> 포탈 · <b style="color:#8a5bb5">O</b> 출구 · <b style="color:#d97b1f">{ }</b> 통 · '
          '<b style="color:#2f9c9c">c</b> <b style="color:#7fc9c9">C</b> 집결판·집결문(체크포인트) · <b style="color:#d97b1f">t</b> <b style="color:#f0c69a">T</b> 10초 스위치·시한문 · '
          '<b style="color:#2f9c9c">l</b> <b style="color:#7fc9c9">L</b> 구조 레버·접이식 사다리 · <b>1 2 3</b> 시작 자리.</p>')
HTML = f"""<title>셋이서</title>
{CSS}{EXTRA}
<header>
  <div class="kicker">몰겜 · 넷째 게임 · 기획 2판 — 종탑과 새 장치 셋</div>
  <h1>셋이서</h1>
  <p class="lead">넷이서와 같은 타일·같은 물리로 만든 <b>3인 협동 판 열셋</b>. 손이 하나 모자란다는 전제 위에 세웠다 — 무거운 상자를 둘이 밀면 남는 건 하나, 어깨를 둘이 받치면 올라가는 것도 하나. 열세 판 풀이 541걸음을 칸 검사기로 확인하고 실제 엔진에서 셋이 키를 눌러 전부 깼다. v3.8.0 에서 게임이 됐고, v3.10.0 에서 종탑 「약속의 종」과 새 장치 셋 — 전원 집결 체크포인트 · 10초 시한문 · 접이식 구조 사다리 — 이 들어왔다 (5장).</p>
</header>
<main>
{md(plan)}
<h2>판 열셋 — 지도</h2>
{legend}
{''.join(cards)}
</main>
<footer><div>자료는 리포 <code>docs/셋이서/</code> — <code>stages.py</code>(판) · <code>solve.py</code>(3인 검사기) · <code>PLAN.md</code>. 확인: <code>python3 run.py</code> → 13판 · 541걸음.</div></footer>
"""
open(f'{HERE}/plan3.html', 'w', encoding='utf-8').write(HTML)
print('wrote', len(HTML), 'worlds', worlds, 'stages', len(stages.S))
