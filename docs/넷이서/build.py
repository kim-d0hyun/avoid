# -*- coding: utf-8 -*-
import json, html
from stages import S, WORLDS
from grid import SCREEN_W, SCREEN_H
from css import CSS

def rows(items, cls=('k','','n')):
    return '\n'.join('<tr>' + ''.join(f'<td class="{c}">{v}</td>' for c, v in zip(cls, it)) + '</tr>'
                     for it in items)
def verbs(items):
    return '\n'.join(f'<div class="verb"><b>{a}</b><span>{b}</span><span class="why">{c}</span></div>'
                     for a, b, c in items)

EXTRA_CSS = """
<style>
.mapwrap { background:var(--sheet); border:1px solid var(--rule); overflow:auto; max-height:560px; }
.mapwrap canvas { display:block; }
.legendrow { display:flex; flex-wrap:wrap; gap:14px 22px; font-size:13px; color:var(--pencil); }
.legendrow span::before { content:""; display:inline-block; width:12px; height:12px; margin-right:6px;
  vertical-align:-2px; border:1px solid var(--ink); background:var(--c); }
.steps-list { font-size:14px; line-height:1.6; columns:2; column-gap:28px; }
@media (max-width:760px) { .steps-list { columns:1; } }
.steps-list li { break-inside:avoid; margin-bottom:2px; }
.steps-list b { font-family:"IBM Plex Mono",monospace; font-weight:600; font-size:12px; padding:1px 5px;
                border:1px solid var(--rule); margin-right:6px; }
.world { margin-top:56px; padding:22px 0 8px 0; border-top:3px solid var(--ink); }
.world h3 { font:900 26px/1.1 "Gothic A1",sans-serif; }
.world p { color:var(--pencil); margin-top:8px; }
.chars { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1px;
         background:var(--rule); border:1px solid var(--rule); }
.char { background:var(--paper); padding:18px; display:flex; flex-direction:column; gap:10px; }
.char svg { width:100%; height:auto; }
.char b { font-family:"Gothic A1",sans-serif; font-weight:800; }
.char span { color:var(--pencil); font-size:13px; }
.poses { display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:1px;
         background:var(--rule); border:1px solid var(--rule); }
.pose { background:var(--paper); padding:14px; text-align:center; font-size:13px; color:var(--pencil); }
.pose svg { width:80px; height:auto; display:block; margin:0 auto 6px auto; }
details { border:1px solid var(--rule); padding:12px 16px; }
summary { cursor:pointer; font-weight:600; }
</style>
"""

SHIRTS = ['#2f6fb0', '#3f8f56', '#d97b1f', '#8a5bb5']
MARKS = ['삐친 머리', '안경', '단발', '모자']

def blocky(i, pose='stand', w=34, h=50, face=True, name=None):
    """네모 캐릭터 한 장. 게임이 그릴 획을 그대로 SVG 로 옮긴다."""
    c = SHIRTS[i % 4]
    if pose == 'crouch': w, h = 40, 28
    if pose == 'jump':   w, h = 28, 58
    cx = 50; top = 90 - h
    body = (f'<rect x="{cx-w/2}" y="{top}" width="{w}" height="{h}" rx="8" ry="8" fill="{c}" fill-opacity=".55"'
            f' stroke="var(--ink)" stroke-width="3.2"/>')
    # 색연필 빗금
    hatch = ''.join(f'<line x1="{cx-w/2+4+k*7}" y1="{top+h-4}" x2="{cx-w/2+4+k*7+6}" y2="{top+4}" stroke="{c}" stroke-width="2" opacity=".7"/>'
                    for k in range(int(w//7)))
    ey = top + h * 0.32
    eyes = '' if not face else (
        f'<line x1="{cx-7}" y1="{ey-4}" x2="{cx-7}" y2="{ey+2}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>'
        f'<line x1="{cx+7}" y1="{ey-4}" x2="{cx+7}" y2="{ey+2}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>'
        f'<path d="M{cx-5} {ey+11} Q{cx+1} {ey+13} {cx+6} {ey+10}" fill="none" stroke="var(--ink)" stroke-width="2.6" stroke-linecap="round"/>')
    if pose == 'dead':
        eyes = ''.join(f'<path d="M{x-4} {ey-4} L{x+4} {ey+4} M{x+4} {ey-4} L{x-4} {ey+4}" stroke="var(--ink)" stroke-width="2.6"/>'
                       for x in (cx-7, cx+7))
    legs = (f'<line x1="{cx-9}" y1="90" x2="{cx-9}" y2="98" stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round"/>'
            f'<line x1="{cx+9}" y1="90" x2="{cx+9}" y2="98" stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round"/>')
    if pose == 'walk':
        legs = (f'<line x1="{cx-9}" y1="90" x2="{cx-14}" y2="98" stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round"/>'
                f'<line x1="{cx+9}" y1="90" x2="{cx+13}" y2="98" stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round"/>')
    if pose == 'jump':
        legs = (f'<line x1="{cx-8}" y1="90" x2="{cx-4}" y2="95" stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round"/>'
                f'<line x1="{cx+8}" y1="90" x2="{cx+4}" y2="95" stroke="var(--ink)" stroke-width="3.4" stroke-linecap="round"/>')
    arms = ''
    if pose == 'push':
        arms = (f'<line x1="{cx+w/2}" y1="{top+22}" x2="{cx+w/2+14}" y2="{top+20}" stroke="var(--ink)" stroke-width="3.2" stroke-linecap="round"/>'
                f'<line x1="{cx+w/2}" y1="{top+34}" x2="{cx+w/2+14}" y2="{top+34}" stroke="var(--ink)" stroke-width="3.2" stroke-linecap="round"/>'
                f'<rect x="{cx+w/2+14}" y="{top+h-38}" width="38" height="38" fill="none" stroke="var(--ink)" stroke-width="3"/>'
                f'<path d="M{cx+w/2+14} {top+h-19} H{cx+w/2+52} M{cx+w/2+33} {top+h-38} V{top+h}" stroke="var(--pencil)" stroke-width="2"/>')
    if pose == 'hang':
        arms = (f'<line x1="{cx}" y1="{top}" x2="{cx}" y2="{top-16}" stroke="var(--ink)" stroke-width="3.2" stroke-linecap="round"/>'
                f'<circle cx="{cx}" cy="{top-20}" r="5" fill="none" stroke="var(--pencil)" stroke-width="2.4"/>')
    mark = ''
    m = i % 4
    if m == 0: mark = f'<path d="M{cx-3} {top+1} C{cx-1} {top-9} {cx+9} {top-14} {cx+4} {top-5}" fill="none" stroke="{c}" stroke-width="3.6" stroke-linecap="round"/>'
    if m == 1: mark = (f'<circle cx="{cx-7}" cy="{ey-1}" r="6.5" fill="none" stroke="{c}" stroke-width="2.6"/>'
                       f'<circle cx="{cx+7}" cy="{ey-1}" r="6.5" fill="none" stroke="{c}" stroke-width="2.6"/>')
    if m == 2: mark = f'<path d="M{cx-w/2-2} {top+16} L{cx-w/2-2} {top+3} Q{cx} {top-6} {cx+w/2+2} {top+3} L{cx+w/2+2} {top+16}" fill="none" stroke="{c}" stroke-width="3.8" stroke-linecap="round"/>'
    if m == 3: mark = (f'<path d="M{cx-w/2+3} {top+2} Q{cx} {top-8} {cx+w/2-3} {top+2}" fill="none" stroke="{c}" stroke-width="9" stroke-linecap="round"/>'
                       f'<line x1="{cx+2}" y1="{top-1}" x2="{cx+w/2+12}" y2="{top-3}" stroke="{c}" stroke-width="4.5" stroke-linecap="round"/>')
    label = f'<text x="{cx}" y="16" text-anchor="middle" font-family="IBM Plex Sans KR, sans-serif" font-size="11" font-weight="600" fill="{c}">{name}</text>' if name else ''
    ul = f'<line x1="{cx-16}" y1="20" x2="{cx+16}" y2="20" stroke="#d02f22" stroke-width="2"/>' if name and i == 0 else ''
    return f'<svg viewBox="0 0 130 100" aria-hidden="true">{label}{ul}{body}{hatch}{mark}{eyes}{legs}{arms}</svg>'

def char_cards():
    say = ['정수리에서 앞으로 휘는 한 올. 획 하나.',
           '동그란 안경 둘. 눈이 그 안에 있다.',
           '머리를 두르고 볼까지 내려오는 단발.',
           '정수리를 덮는 굵은 띠에 챙 하나.']
    return '<div class="chars">' + ''.join(
        f'<figure class="char">{blocky(i, name=["파랑","초록","주황","보라"][i])}'
        f'<b style="color:{SHIRTS[i]}">{i+1}번 · {MARKS[i]}</b><span>{say[i]}</span></figure>'
        for i in range(4)) + '</div>'

def pose_cards():
    ps = [('stand','서 있다'), ('walk','걷는다 — 다리만 번갈아'), ('jump','뛴다 — 길어진다'),
          ('crouch','웅크린다 — 넓어진다'), ('push','민다 — 팔이 나온다'), ('hang','매달린다'), ('dead','죽었다 — ✕ ✕')]
    return '<div class="poses">' + ''.join(f'<div class="pose">{blocky(1, p)}{t}</div>' for p, t in ps) + '</div>'

# 맵 데이터 (캔버스가 그린다)
DATA = json.dumps([dict(world=s['world'], name=s['name'], art=s['art'], notes=s['notes']) for s in S], ensure_ascii=False)

STAGE_HTML = []
n_by_world = {}
for s in S:
    w = s['world']; n_by_world[w] = n_by_world.get(w, 0) + 1
    idx = len(STAGE_HTML)
    if n_by_world[w] == 1:
        wi = [k for k, _ in WORLDS].index(w)
        STAGE_HTML.append(f'<div class="world"><div class="num">{wi+1}단계</div><h3>{w}</h3><p>{WORLDS[wi][1]}</p></div>')
    steps = ''.join(f'<li><b>{html.escape(who) or "·"}</b>{html.escape(t)}</li>' for who, t in s['steps'])
    tips = ''.join(f'<li>{t}</li>' for t in s['tips'])
    STAGE_HTML.append(f"""
<article class="stage">
  <div class="stage-head">
    <span class="stage-no">{[k for k,_ in WORLDS].index(w)+1}-{n_by_world[w]}</span>
    <span class="stage-name">{s['name']}</span>
    <span class="stage-verb">120 × 28 칸 · 3층</span>
    <span class="stage-verb">풀이 {len(s['steps'])}걸음 확인</span>
  </div>
  <p class="stage-line">{s['scene']}</p>
  <div class="mapwrap"><canvas data-stage="{idx}" width="10" height="10"></canvas></div>
  <div class="solve">
    <div><h4>어떻게 깨나</h4><ul>{tips}</ul></div>
    <div class="fail"><h4>기계로 확인한 풀이</h4>
      <details><summary>{len(s['steps'])}걸음 — 매 걸음의 전제가 지형에서 성립한다</summary>
      <ol class="steps-list">{steps}</ol></details></div>
  </div>
</article>""")

LEGEND = [
    ('#','땅·벽','콘크리트. 못 지나간다','#141210'),
    ('=','선반·발판','위에서만 딛는다','#6b665c'),
    ('H','사다리','⌥↑↓ 로 오르내린다. 층과 층을 잇는다','#8a7a5a'),
    ('t','리프트','사다리처럼 탄다. 크레인 옆','#8a7a5a'),
    ('^','위험','전기 레일·깨진 유리. 닿으면 죽는다','#d02f22'),
    ('x / X','상자','밀고, 떨어뜨리고, 딛는다. X 는 둘이 민다','#6f4a2c'),
    ('a b / A B','스위치와 셔터','한 번 밟으면 열린 채 남는다','#3f8f56'),
    ('p q / P Q','누름판과 셔터','눌린 동안만 열린다. 상자를 올려 둔다','#3f8f56'),
    ('u U · w W','포탈 한 쌍','들어가면 저편에서 나온다. 상자도 지난다','#2f6fb0'),
    ('O','다음 판 포탈','넷이 다 모이고 열쇠가 있으면 ⌥↑ 로 다음 판','#8a5bb5'),
    ('r / l','굴러 나오는 구멍','통·가방·파이프가 그쪽으로 굴러 나온다. 맞으면 밀려난다','#d97b1f'),
    ('> <','컨베이어·무빙워크','그쪽으로 흐른다','#2f6fb0'),
    ('v','삭은 발판','밟으면 1초 뒤 부서지고 3초 뒤 돌아온다','#b8912a'),
    ('S','송풍구·매트리스','위에 서면 다섯 칸 튀어 오른다','#2f9c9c'),
    ('K','열쇠','들고 다닌다. 던질 수 있다','#d02f22'),
    ('1 2 3 4','시작 자리','네 사람','#2f6fb0'),
]

HTML = f"""<title>넷이서</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@800;900&family=IBM+Plex+Sans+KR:wght@400;600&family=IBM+Plex+Mono:wght@500;600&display=swap">
{CSS}
{EXTRA_CSS}
<div class="page">

<header class="head">
  <div class="kicker">몰겜 · 세 번째 게임 · 기획 3판</div>
  <h1>넷이서</h1>
  <p class="lede"><b>창고 · 지하철역 · 공사장.</b> 3층짜리 긴 판 아홉 개를 포탈로 이어 간다. 열쇠를 찾아 넷이 포탈에
     모이면 다음 판. <b>아홉 판 모두 풀이를 한 걸음씩 지형에 대 봐서 깨지는 것을 확인했다.</b></p>
  <dl class="spec">
    <div><dt>인원</dt><dd>넷 고정</dd></div>
    <div><dt>판</dt><dd>3단계 × 3판 · 각 120 × 28 칸 (3.3 × 1.3 화면)</dd></div>
    <div><dt>시야</dt><dd>각자 자기 캐릭터를 따라간다</dd></div>
    <div><dt>조작</dt><dd>새 키 없음 · ⌥ 와 방향키 그대로</dd></div>
  </dl>
</header>

<section>
  <div class="num">01</div>
  <h2>이번 판에서 달라진 것</h2>
  {verbs([
    ('판이 길고 높다','한 판이 가로 3.3 화면, 세로 1.3 화면. 1·2·3층을 사다리·리프트·포탈로 오간다.','한 화면짜리 퍼즐 방이 아니라 <b>장소</b>다. 창고를 걸어 다니는 느낌이어야 한다.'),
    ('시야는 각자','카메라가 <b>내 캐릭터</b>를 따라간다. 나는 2층, 친구는 1층이면 서로 다른 화면을 본다. 지형·상자·통은 하나다.','넷이 흩어질 수 있어야 층이 뜻이 있다. 화면 밖 친구는 가장자리 화살표로 보인다.'),
    ('포탈로 판을 잇는다','판 끝 포탈에 넷이 모이고 열쇠가 있으면 아무나 ⌥↑ — 0.6초 어두워지고 다음 판 시작 자리에 선다.','한 단계는 세 판이 이어진 한 장소다. 문이 아니라 포탈이라 어디로든 이을 수 있다.'),
    ('장애물이 굴러다닌다','통·여행 가방·파이프가 구멍에서 굴러 나와 바닥을 따라 가고, 틈에서 아래층으로 떨어져 거기서도 굴러간다.','맞으면 세 칸 밀려나고 0.5초 넘어진다. <b>죽지 않는다</b> — 아래층으로 굴러떨어지는 게 벌이자 웃음이다.'),
    ('상자로 뭔가를 한다','밀고, 틈으로 떨어뜨려 아래층 발판으로 쓰고, 포탈에 밀어 넣어 저편에 보내고, 누름판에 올려 둔다.','상자 하나가 네 가지 일을 한다. 새 물건을 늘리는 대신 상자에 일을 준다.'),
    ('캐릭터가 네모다','살짝 둥근 직사각형. 머리가 곧 몸이고, 윗면이 평평해서 <b>밟고 서기</b>가 자연스럽다.','졸라맨은 머리 위에 서면 목이 부러져 보인다. 네모는 쌓이는 그림이다.'),
  ])}
</section>

<section>
  <div class="num">02</div>
  <h2>네모 캐릭터</h2>
  <p class="sub">살짝 둥근 직사각형 — 한 칸 폭 0.8, 높이 1.2 (34 × 50px). 잉크 테두리에 색연필 빗금으로 옷 색을 칠한다.
     눈 둘과 입 하나가 윗쪽 3분의 1에, 다리는 밑으로 나온 짧은 획 둘. 팔은 <b>뭔가를 잡을 때만</b> 나온다.</p>
  {char_cards()}
  <p class="sub">넷은 똑같이 걷고 똑같이 뛴다. 다른 것은 옷 색과 머리 표뿐이다 — 겹쳐 서거나 창을 줄이면 색은 안 보여도 모양은 보인다.</p>
  {pose_cards()}
  {verbs([
    ('찌그러지고 늘어난다','웅크리면 넓고 낮게(40 × 28), 뛰면 좁고 길게(28 × 58). 착지하면 0.1초 눌렸다 돌아온다.','네모는 관절이 없어서 이것 말고는 움직임을 보일 길이 없다. 대신 이게 아주 잘 읽힌다.'),
    ('누가 위에 서면 눌린다','머리 위에 사람이 올라서면 10% 눌린다. 둘이면 20%.','무게가 보인다. 「내가 밟고 있다」가 밟는 쪽 화면에서도 밟히는 쪽 화면에서도 보인다.'),
    ('맞으면 기운다','통에 맞으면 15° 기울며 밀려나고, 눈이 잠깐 ✕ 가 된다.','죽는 게 아니라 넘어지는 것. 눈 ✕ 는 0.5초만.'),
    ('내 것은 밑줄, 방장은 왕관','이름 밑 빨간 밑줄 · 이름 앞 작은 왕관. 지금 게임 그대로.','바뀌지 않는 것은 바꾸지 않는다.'),
  ])}
</section>

<section>
  <div class="num">03</div>
  <h2>시야 — 각자 자기 카메라</h2>
  {verbs([
    ('내 캐릭터가 한가운데','카메라는 내 자리를 따라간다. 가로 ±4칸 · 세로 ±3칸의 <b>죽은 구역</b> 안에서는 안 움직이고, 벗어난 만큼만 0.12초에 걸쳐 따라붙는다.','판이 화면보다 넓고 높으니 세로도 따라간다. 사다리를 오르면 화면이 함께 오른다.'),
    ('판 끝에서는 멈춘다','왼쪽·오른쪽·위·아래 끝에서 카메라가 벽에 붙는다. 판 밖 검은 부분은 안 보인다.','끝에 서면 내가 화면 가운데에 있지 않다 — 그게 맞다.'),
    ('화면 밖 친구는 화살표','화면 가장자리에 그 사람 옷 색 화살표와 머리 표, 몇 층인지 (「3층 ↑」). 넷이 다 보이면 사라진다.','다른 층에 있는 친구가 어디 있는지 알아야 「내려와」를 말할 수 있다.'),
    ('넷이 같은 판을 본다','지형·상자·통·셔터·열쇠는 하나다. 카메라만 다르다. 내 화면에서 상자가 떨어지면 친구 화면에서도 같은 자리에 떨어진다.','상자·통·셔터는 방장이 굴리고, 카메라는 각자 계산한다.'),
    ('포탈이 모이게 한다','판 끝 포탈은 넷이 다 들어와야 켜진다. 흩어져 있으면 「2명 더」가 포탈 위에 뜬다.','화면 가장자리가 벽이던 앞 기획을 버렸다. 층이 있으니 흩어지는 게 맞고, 모이는 자리를 정해 주면 된다.'),
  ])}
</section>

<section>
  <div class="num">04</div>
  <h2>치수</h2>
  <div class="scroll"><table>
    <tr><th>무엇</th><th>얼마</th><th>그래서</th></tr>
    {rows([
      ('한 칸','42px','화면 36 × 22 칸 (1512 × 924)'),
      ('한 판','120 × 28 칸','가로 3.3 화면 · 세로 1.3 화면. 1층 바닥 27줄 · 2층 18줄 · 3층 9줄'),
      ('층 높이','9칸 (머리 위 8칸)','사다리 8칸을 오르는 데 1.6초'),
      ('사람','0.8 × 1.2칸','판정은 한 칸 폭 두 칸 높이'),
      ('점프','두 칸 위 · 네 칸 옆','세 칸 턱부터는 상자나 어깨'),
      ('어깨','한 명당 +1칸','넷이 쌓이면 다섯 칸'),
      ('웅크리기','0.7칸','한 칸 굴을 지난다'),
      ('걷기 · 상자 밀기','초당 4.5칸 · 2.2칸','무거운 상자는 둘이 붙어야 2.2칸'),
      ('통','초당 5칸 · 두 번 떨어지면 부서진다','맞으면 세 칸 밀려나고 0.5초 넘어진다'),
      ('송풍구','다섯 칸 위','옆으로 네 칸까지 기울일 수 있다'),
      ('삭은 발판','밟고 1초 뒤 부서짐 · 3초 뒤 복구','한 발판에 한 사람'),
      ('포탈','들어가는 순간 · 0.3초 뒤 다시 들어갈 수 있다','상자도 지난다. 속도는 그대로'),
    ])}
  </table></div>
</section>

<section>
  <div class="num">05</div>
  <h2>조작</h2>
  <div class="scroll"><table>
    <tr><th>키</th><th>하는 일</th><th>비고</th></tr>
    {rows([
      ('⌥ ← →','걷기','사다리 위에서는 안 먹는다'),
      ('⌥ ↑','점프 · 사다리 오르기 · <b>포탈 발동</b>','사다리 앞이면 오르고, 판 끝 포탈 위면 다음 판'),
      ('⌥ ↓','웅크리기 · 사다리 내리기','한 칸 굴, 어깨 내주기'),
      ('⌥ Space 길게','잡기 — 상자 · 사람 · 열쇠','떼면 놓는다'),
      ('⌥ Space 짧게','던지기','열쇠를 보는 쪽으로'),
      ('⌥ R','이 판 다시 (방장)','한 명이 죽으면 자동'),
      ('⌥ M','메뉴','같이 하기 · 화면 · 홈으로'),
      ('⌥ H','숨기기','⌥ 를 떼기만 해도 숨는다'),
    ])}
  </table></div>
</section>

<section>
  <div class="num">06</div>
  <h2>지형지물</h2>
  <p class="sub">판은 글자 그림이다. 한 글자가 한 칸. 아래 맵은 그 글자를 캔버스에 색으로 그린 것이다.</p>
  <div class="scroll"><table>
    <tr><th>글자</th><th>무엇</th><th>규칙</th></tr>
    {rows([(f'<b style="color:{c}">{g}</b>', n, d) for g, n, d, c in LEGEND])}
  </table></div>
  <div class="legendrow">
    {''.join(f'<span style="--c:{c}">{n}</span>' for g, n, d, c in LEGEND)}
  </div>
</section>

<section>
  <div class="num">07</div>
  <h2>판 아홉 개</h2>
  <p class="sub">맵은 가로로 스크롤된다. 진한 것이 벽·바닥, 갈색이 상자, 빨강이 위험, 파랑이 포탈·컨베이어, 초록이 스위치·누름판·셔터.
     네 네모가 시작 자리다. 연필색 글은 배경 소품 — 부딛히지 않는다.</p>
  {''.join(STAGE_HTML)}
</section>

<section>
  <div class="num">08</div>
  <h2>깰 수 있다 — 어떻게 확인했나</h2>
  {verbs([
    ('풀이를 걸음으로 적었다','걷기 · 뛰기 · 사다리 · 어깨 · 밀기 · 떨어뜨리기 · 포탈 · 스위치 · 누름판 · 송풍구 · 열쇠 · 포탈 모임. 아홉 판에 401걸음.','「이렇게 하면 깨진다」를 말로 하지 않고 순서로 적는다.'),
    ('매 걸음의 전제를 지형에 댔다','걷는 길에 벽이 없나, 구멍이 네 칸을 안 넘나, 뛰어 오르는 높이가 두 칸(+어깨) 안인가, 사다리가 그 줄에 있나, 상자가 앉을 바닥이 있나, 누름판 위에 뭐가 있나, 셔터가 지금 열려 있나.','전제가 하나라도 깨지면 그 자리에서 터진다. 만들면서 실제로 셋을 잡았다 — 통로를 막는 누름판, 벽 반대편에서 나오는 상자, 문이 시작 자리를 덮은 것.'),
    ('안 본 것','굴러다니는 통과 전동차는 안 본다 — 막지도 죽이지도 않아서(전기 레일 위로 튕기는 것만 죽는다) 풀 수 있느냐와 무관하다. 시간 제한도 안 본다.','이 확인은 「길이 있다」이지 「쉽다」가 아니다. 쉬운지는 넷이 붙어 봐야 안다.'),
    ('만들 때도 같은 것을 돌린다','coop-stages.js 의 글자 그림과 이 풀이가 그대로 시험이 된다. 판을 고치면 풀이가 깨지는지 바로 안다.','기획서의 표가 아니라 살아 있는 검사다.'),
  ])}
</section>

<section>
  <div class="num">09</div>
  <h2>누가 무엇을 정하나</h2>
  <div class="scroll"><table>
    <tr><th></th><th>무엇</th><th>왜</th></tr>
    {rows([
      ('방장이 정하는 것','상자 · 통 · 셔터 · 누름판 · 열쇠 주인 · 삭은 발판 · 죽음 · 리셋 · 판 번호 · 포탈 발동','물건 하나가 화면마다 다른 자리에 있으면 「같이 민다」가 성립하지 않는다.'),
      ('각자 계산하는 것','내 걷기·점프·사다리·웅크리기, 남의 머리 위에 서기, <b>내 카메라</b>','내 조작이 60ms 늦으면 협동이 아니라 지연이다.'),
      ('꾸러미에 싣는 것','st(판) · rs(리셋) · bx(상자들) · rl(통들 x y vx 층) · sw(눌린 것) · vp(부서진 발판) · kx ky kw(열쇠) · t(시간)','통이 대여섯 개 굴러도 배구 공 두 개 값이다.'),
      ('어긋나면','방장 말이 맞다. 되돌아간다.','두 화면에서 다른 곳에 있는 상자보다 낫다.'),
    ])}
  </table></div>
</section>

<section>
  <div class="num">10</div>
  <h2>만드는 순서</h2>
  <div class="steps">{''.join(f'''<div class="step"><header><h3>{t}</h3><time>{d}</time></header><ul>{"".join(f"<li>{x}</li>" for x in xs)}</ul></div>''' for t, d, xs in [
    ('1차 — 걸어 다니는 창고', '3~4일', ['타일맵·층·사다리·각자 카메라·화면 밖 화살표', '네모 캐릭터 (찌그러짐·눌림·팔)', '사람 위에 서기 · 웅크리기', '열쇠 · 판 끝 포탈 · 다음 판 · 죽으면 전원 리셋', '창고 1-1 이 그대로 돌아간다']),
    ('2차 — 상자와 문', '3일', ['상자: 밀기·떨어뜨리기·딛기·포탈 통과·누름판', '스위치·누름판·셔터 (점선으로 이어 그림)', '포탈 한 쌍', '창고 1-2 · 1-3']),
    ('3차 — 굴러다니는 것', '3일', ['통·가방·파이프: 구멍에서 나와 굴러가고 떨어지고 부서진다', '맞으면 밀려나기·넘어지기', '전동차 (지하철 1층)', '지하철역 세 판']),
    ('4차 — 공사장', '3일', ['삭은 발판 · 송풍구 · 리프트 · 무빙워크', '시간 제한', '공사장 세 판 · 단계 기록 · 한 바퀴 돌아 보고 치수 고치기']),
  ])}</div>
</section>

<footer>
  <div>조사한 곳 — <a href="https://en.wikipedia.org/wiki/Pico_Park">Wikipedia: Pico Park</a> · <a href="https://picoparkgame.com/en/pp1/">공식 사이트</a> ·
       <a href="https://pico-park.fandom.com/wiki/World_Mode">PICO PARK Wiki</a> · <a href="https://earlyguides.com/pico-park">EarlyGuides</a></div>
  <div>판 아홉 장은 조각 DSL 로 쌓았고, 아홉 판의 풀이 401걸음을 지형에 한 걸음씩 대서 확인했다.</div>
</footer>
</div>

<script>
const STAGES = {DATA};
const COL = {{
  '#':'#141210', '=':'#6b665c', 'H':'#8a7a5a', 't':'#8a7a5a', '^':'#d02f22',
  'x':'#6f4a2c', 'X':'#4f3320', 'a':'#3f8f56','b':'#3f8f56','p':'#3f8f56','q':'#3f8f56',
  'A':'#7fbf95','B':'#7fbf95','P':'#7fbf95','Q':'#7fbf95',
  'u':'#2f6fb0','U':'#2f6fb0','w':'#2f6fb0','W':'#2f6fb0', 'O':'#8a5bb5',
  'r':'#d97b1f','l':'#d97b1f', '>':'#2f6fb0','<':'#2f6fb0', 'v':'#b8912a', 'S':'#2f9c9c', 'K':'#d02f22',
}};
const SHIRT = ['#2f6fb0','#3f8f56','#d97b1f','#8a5bb5'];
const T = 9;   // 한 칸 픽셀
function draw(cv, st) {{
  const rows = st.art.split('\\n'); const W = rows[0].length, H = rows.length;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W*T*dpr; cv.height = H*T*dpr; cv.style.width = (W*T)+'px'; cv.style.height = (H*T)+'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const dark = matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light'
             || document.documentElement.dataset.theme === 'dark';
  g.fillStyle = dark ? '#1c1917' : '#f4efe2'; g.fillRect(0,0,W*T,H*T);
  // 화면 한 칸 눈금
  g.strokeStyle = dark ? 'rgba(242,236,224,.08)' : 'rgba(20,18,16,.08)'; g.lineWidth = 1;
  for (let x = 36; x < W; x += 36) {{ g.beginPath(); g.moveTo(x*T+.5, 0); g.lineTo(x*T+.5, H*T); g.stroke(); }}
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {{
    const ch = rows[y][x]; if (ch === '.') continue;
    if ('1234'.includes(ch)) {{
      const i = +ch - 1; g.fillStyle = SHIRT[i]; g.strokeStyle = dark ? '#f2ece0' : '#141210'; g.lineWidth = 1.2;
      const bw = T*0.8, bh = T*1.3; const bx = x*T + (T-bw)/2, by = (y+1)*T - bh;
      g.beginPath(); g.roundRect(bx, by, bw, bh, 2); g.fill(); g.stroke();
      continue;
    }}
    if (ch === '#' && dark) g.fillStyle = '#c9c1b2'; else g.fillStyle = COL[ch] || '#999';
    if (ch === '=') {{ g.fillRect(x*T, y*T+T*0.3, T, T*0.4); continue; }}
    if (ch === 'H' || ch === 't') {{ g.fillRect(x*T+1, y*T, 2, T); g.fillRect(x*T+T-3, y*T, 2, T); g.fillRect(x*T+1, y*T+T/2-1, T-2, 2); continue; }}
    if (ch === '^') {{ g.beginPath(); g.moveTo(x*T, (y+1)*T); g.lineTo(x*T+T/2, y*T+2); g.lineTo(x*T+T, (y+1)*T); g.fill(); continue; }}
    if ('uUwWO'.includes(ch)) {{ g.beginPath(); g.ellipse(x*T+T/2, y*T+T/2, T*0.42, T*0.62, 0, 0, Math.PI*2); g.fill();
      if (ch === 'O') {{ g.fillStyle = dark ? '#f2ece0' : '#faf7ee'; g.font = '700 6px sans-serif'; g.textAlign='center'; g.fillText('↑', x*T+T/2, y*T+T/2+2.5); }} continue; }}
    if (ch === 'K') {{ g.beginPath(); g.arc(x*T+T/2, y*T+T/2, T*0.32, 0, Math.PI*2); g.fill(); continue; }}
    if ('><'.includes(ch)) {{ g.fillRect(x*T, y*T, T, T); g.fillStyle = dark?'#1c1917':'#f4efe2'; g.font='700 7px sans-serif'; g.textAlign='center'; g.fillText(ch, x*T+T/2, y*T+T-2); continue; }}
    if ('rl'.includes(ch)) {{ g.beginPath(); g.arc(x*T+T/2, y*T+T/2, T*0.45, 0, Math.PI*2); g.fill(); continue; }}
    g.fillRect(x*T, y*T, T, T);
    if ('xX'.includes(ch)) {{ g.strokeStyle = dark ? '#f2ece0' : '#faf7ee'; g.lineWidth = 1; g.beginPath(); g.moveTo(x*T+T/2, y*T); g.lineTo(x*T+T/2, y*T+T); g.moveTo(x*T, y*T+T/2); g.lineTo(x*T+T, y*T+T/2); g.stroke(); }}
    if ('abpq'.includes(ch)) {{ g.fillStyle = dark?'#1c1917':'#f4efe2'; g.fillRect(x*T+2, y*T+T*0.55, T-4, T*0.3); }}
  }}
  // 배경 소품 글
  g.fillStyle = dark ? 'rgba(242,236,224,.55)' : 'rgba(107,102,92,.9)'; g.font = '500 8px "IBM Plex Sans KR", sans-serif'; g.textAlign = 'left';
  for (const [x, y, text] of st.notes) g.fillText(text, x*T, y*T + 6);
  // 층 표시
  g.fillStyle = dark ? 'rgba(242,236,224,.5)' : 'rgba(107,102,92,.8)'; g.font = '600 8px "IBM Plex Mono", monospace';
  for (const [f, row] of [[1,27],[2,18],[3,9]]) g.fillText(f+'층', 2*T, row*T - 3);
}}
document.querySelectorAll('canvas[data-stage]').forEach(cv => draw(cv, STAGES[+cv.dataset.stage]));
</script>
"""
open('coop-plan3.html','w').write(HTML)
print('wrote', len(HTML))
