# -*- coding: utf-8 -*-
import json, html, os
from stages import S, WORLDS
PLAY = json.load(open('play.json')) if os.path.exists('play.json') else []
STEPS_ALL = sum(len(s['steps']) for s in S)
import icons
from css import CSS
from parts import EXTRA_CSS, blocky, char_cards, pose_cards, SHIRTS
import views

def rows(items, cls=('k','','n')):
    return '\n'.join('<tr>' + ''.join(f'<td class="{c}">{v}</td>' for c, v in zip(cls, it)) + '</tr>' for it in items)
def verbs(items):
    return '\n'.join(f'<div class="verb"><b>{a}</b><span>{b}</span><span class="why">{c}</span></div>' for a, b, c in items)

MORE_CSS = """
<style>
.badge { font:600 11px/1 "IBM Plex Mono",monospace; letter-spacing:.06em; padding:5px 8px; border:1px solid var(--rule); }
.badge.one { color:var(--pen); border-color:var(--pen); }
.badge.all { color:var(--ink); }
.pattern { display:grid; grid-template-columns: 34px 1fr; gap:14px; align-items:start; padding:16px 18px; background:var(--paper); }
.pattern .no { font:900 20px/1 "Gothic A1",sans-serif; color:var(--pen); }
.pattern b { font-family:"Gothic A1",sans-serif; font-weight:800; font-size:16px; display:block; margin-bottom:4px; }
.pattern p { font-size:14px; }
.pattern .use { color:var(--pencil); font-size:12.5px; margin-top:6px; font-family:"IBM Plex Mono",monospace; }
.patterns { display:grid; grid-template-columns:repeat(auto-fit,minmax(300px,1fr)); gap:1px; background:var(--rule); border:1px solid var(--rule); }
.shapes { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); gap:1px; background:var(--rule); border:1px solid var(--rule); }
.shape { background:var(--paper); padding:14px; font-size:13px; color:var(--pencil); }
.shape svg { display:block; width:100%; height:auto; margin-bottom:8px; }
.shape b { color:var(--ink); display:block; font-family:"Gothic A1",sans-serif; font-weight:800; font-size:14px; }
.mush { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:1px; background:var(--rule); border:1px solid var(--rule); }
.mush div { background:var(--paper); padding:14px 16px; font-size:14px; }
.mush b { display:block; font-family:"Gothic A1",sans-serif; font-weight:800; margin-bottom:4px; }
.mush span { color:var(--pencil); font-size:13px; }
</style>
"""

def shape_svg(kind):
    """판 모양 도식. 화면 한 칸(점선)과 판(실선)."""
    if kind == 'one':    box = (10, 10, 60, 40)
    if kind == 'long':   box = (5, 20, 150, 30)
    if kind == 'tall':   box = (60, 2, 40, 76)
    if kind == 'lanes':  box = (5, 15, 150, 40)
    if kind == 'floors': box = (5, 5, 150, 60)
    x, y, w, h = box
    inner = ''
    if kind == 'lanes':  inner = f'<line x1="{x}" y1="{y+h/2}" x2="{x+w}" y2="{y+h/2}" stroke="var(--pencil)" stroke-width="1.2"/>'
    if kind == 'floors': inner = ''.join(f'<line x1="{x}" y1="{y+h*k/3}" x2="{x+w}" y2="{y+h*k/3}" stroke="var(--pencil)" stroke-width="1.2"/>' for k in (1,2))
    if kind == 'tall':   inner = ''.join(f'<line x1="{x}" y1="{y+h*k/5}" x2="{x+w}" y2="{y+h*k/5}" stroke="var(--pencil)" stroke-width="1.2"/>' for k in range(1,5))
    screen = f'<rect x="{x}" y="{y+h-40 if h>40 else y}" width="60" height="40" fill="none" stroke="var(--pen)" stroke-width="1.4" stroke-dasharray="3 3"/>'
    return f'<svg viewBox="0 0 160 80">{screen}<rect x="{x}" y="{y}" width="{w}" height="{h}" fill="none" stroke="var(--ink)" stroke-width="2"/>{inner}</svg>'

SHAPES = [('one','한 화면','36 × 22. 카메라가 안 움직인다. 「상자 계단」「두 열쇠」'),
          ('long','가로로 긴 한 층','108 × 22. 오른쪽으로 가면 흐른다. 「표지판」「지키는 사람」「움직이는 발판」「동시에」「무빙워크」'),
          ('lanes','위·아래 두 층','108 × 22. 두 복도가 나란히. 「두 길」「되돌아오기」'),
          ('tall','위로 긴 판','36 × 44 · 36 × 60. 사다리·리프트로 오른다. 「엘리베이터」「탑」'),
          ('floors','가로로 긴 3층','120 × 28. 층마다 사다리가 다른 자리. 「3층 창고」「옥상」「종점」')]

PATTERNS = [
    ('어깨 → 손','세 칸 턱은 혼자 못 넘는다. 한 명이 어깨를 내주고, 올라간 사람이 <b>손을 내려 끌어올린다</b>(세 칸 아래까지). 이 게임의 기본 동작.','표지판 · 두 열쇠 · 탑 · 3층 창고 · 마지막'),
    ('사람 계단','둘이 층층이 걸쳐 <b>서면</b> 계단이 된다 (선 머리는 한 칸 남짓, 웅크린 머리는 그 반 — 웅크리면 네 칸이 안 나온다). 그 위를 밟고 올라가 뛴다.','상자 계단'),
    ('열쇠 심부름','한 명이 팀의 도움으로 열쇠까지 간다. 집는 순간 그 색 블록이 사라져 나머지의 길이 열린다.','두 열쇠 · 두 길 · 되돌아오기 · 3층 창고 · 마지막'),
    ('발밑이 사라진다','열쇠가 놓인 바닥도 그 색 블록이다. 집으면 떨어진다 — 어디로 떨어질지, 누가 집을지, 어느 열쇠부터 집을지. <b>열쇠는 닿으면 집는다</b> — 지나가려면 뛰어 넘는다.','두 열쇠 · 두 길 · 탑 · 옥상(선반이 사라져 상자가 떨어진다) · 종점'),
    ('스위치 한 번','먼 길을 간 한 명이 밟으면 셔터가 열린 채 남는다. 가까운 길을 나머지에게 열어 준다.','표지판'),
    ('누름판 지키기','밟고 있는 동안만 열린다. 한 명이 남는다 — 「한 명만 닿으면 끝」 판과 짝.','지키는 사람(둘) · 엘리베이터(둘) · 동시에(둘)'),
    ('사람 대신 물건','누름판에 상자를 올려 두면 아무도 남지 않아도 된다. 상자가 스스로 떨어져 누르기도 한다.','움직이는 발판 · 3층 창고 · 옥상 · 무빙워크 · 종점'),
    ('상자 릴레이','상자를 밀어 단을 오르고, 틈으로 떨어뜨려 아래층 발판으로 쓰고, 상자 위에 둘이 서서 어깨를 내준다.','상자 계단 · 되돌아오기 · 탑 · 3층 창고 · 옥상'),
    ('두 길','위 복도와 아래 복도. 위의 한 명이 아래의 길을 열고, 끝에서 떨어져 합류한다.','두 길'),
    ('되돌아오기','출구가 코앞인데 막혔다. 맵 끝까지 가서 열쇠를 집고 다른 길로 돌아온다 — 갈 때 어깨, 올 때 상자.','표지판 · 되돌아오기'),
    ('때를 맞춘다','왕복 발판 · 리프트 · <b>깜빡이는 다리(2초 켜짐 2초 꺼짐)</b> · 굴러오는 통. 협동이 아니라 박자가 문제인 마디를 판마다 하나씩.','지키는 사람 · 엘리베이터 · 움직이는 발판 · 되돌아오기 · 3층 창고 · 동시에 · 옥상 · 종점'),
    ('한 명만 간다','넷 중 하나만 출구에 닿으면 끝. 나머지 셋은 그 한 명을 보내는 기계 — 누름판 둘, 어깨 하나, 달리기 하나.','두 열쇠 · 지키는 사람 · 엘리베이터 · 동시에'),
    ('한 명씩','<b>삭은 발판</b>은 0.5초 밟으면 부서지고 3초 뒤 돌아온다. 넷이 줄지어 건너면 넷째가 빠진다 — 간격과 순서가 협동이다.','무빙워크 · 종점'),
    ('상자를 보낸다','상자는 <b>무빙워크에 실려 가고 포탈을 지난다.</b> 사람이 못 가는 데로 상자를 보내 누름판을 누른다 — 3층에서 밀어 넣은 상자가 1층 끝에 떨어진다.','무빙워크 · 종점'),
]

MUSH = [
    ('색 열쇠 → 색 블록','열쇠를 집으면 같은 색 블록이 전부 사라진다. 문도 자물쇠도 없다 — 블록이 곧 문이다.','1-3 · 1-6 · 1-8 · 2-2 · 2-3 에서 그대로 보인다. 발밑 블록이 사라지는 순서 퍼즐(1-6, 1-8)을 「탑」과 「마지막」에 넣었다.'),
    ('표지판','땅에 화살표가 그려져 있다 — 「→」「↑」「←」. 설명 없이 길을 가리킨다.','1-1. 우리 「표지판」 판이 그 판이다: 오른쪽 아래로 가서 위로 돌아온다.'),
    ('출구가 시작 옆','포탈이 시작 자리 바로 옆인데 블록에 막혀 있다. 맵을 한 바퀴 돌아 열쇠를 집고 돌아온다.','2-4. 「되돌아오기」.'),
    ('두 레인','위 복도와 아래 복도가 나란하고, 위에서 집은 열쇠가 아래 길을 연다.','2-2. 「두 길」.'),
    ('왕복 발판 · 비행기','정해진 길을 오가는 발판. 빨간 화살표로 길이 그려져 있다.','2-4 의 비행기, 2-1 의 문어 블록. 「움직이는 발판」은 길을 점선으로 그린다.'),
    ('컨티뉴와 방장','월드마다 다시 시작 횟수가 정해져 있고, 재시작·강퇴·스킵은 방장 명령이다.','우리는 횟수로 막지 않고 **세기만 한다**. 리셋은 방장 ⌥R.'),
]

def canvas_data():
    return json.dumps([dict(art=s['art'], notes=s['notes']) for s in S], ensure_ascii=False)

cards = []
for wi, (wname, wdesc) in enumerate(WORLDS, 1):
    cards.append(f'<div class="world"><div class="num">{wi}단계</div><h3>{wname}</h3><p>{wdesc}</p></div>')
    for si, s in enumerate([s for s in S if s['world'] == wname], 1):
        idx = S.index(s)
        endb = ('<span class="badge one">한 명만 닿으면 끝</span>' if s['end'] == 'one'
                else '<span class="badge all">넷이 다 모여야 끝</span>')
        steps = ''.join(f'<li><b>{html.escape(who) or "·"}</b>{html.escape(t)}</li>' for who, t in s['steps'])
        tips = ''.join(f'<li>{t}</li>' for t in s['tips'])
        cards.append(f"""
<article class="stage">
  <div class="stage-head">
    <span class="stage-no">{wi}-{si}</span>
    <span class="stage-name">{s['name']}</span>
    <span class="stage-verb">{s['shape']} · {s['size'][0]}×{s['size'][1]}</span>
    {endb}
  </div>
  <p class="stage-line"><b>{s['pattern']}.</b> {s['scene']}</p>
  <div class="mapwrap"><canvas data-stage="{idx}" width="10" height="10"></canvas></div>
  <div class="solve">
    <div><h4>어떻게 깨나</h4><ul>{tips}</ul></div>
    <div class="fail"><h4>기계로 확인한 풀이</h4>
      <details><summary>{len(s['steps'])}걸음 — 매 걸음의 전제가 지형에서 성립한다</summary>
      <ol class="steps-list">{steps}</ol></details></div>
  </div>
</article>""")

LEGEND = [
    ('#','땅·벽','못 지나간다','#141210'), ('=','선반·발판','위에서만 딛는다','#6b665c'),
    ('H','사다리','⌥↑↓','#8a7a5a'), ('|','리프트','사다리처럼 탄다. 정해진 층 사이만','#8a7a5a'),
    ('-','왕복 발판의 길','발판이 이 길을 오간다. 어디서든 타고 내린다','#2f6fb0'),
    ('~','깜빡이는 발판','2초 켜지고 2초 꺼진다. 켜진 동안 건널 수 있는 폭이다','#b8912a'),
    ('^','가시·연못','닿으면 죽는다 — 시작 자리에서 다시 산다','#d02f22'),
    ('x / X','상자','밀고, 떨어뜨리고, 딛는다. X 는 둘이 민다','#6f4a2c'),
    ('r y b','빨강·노랑·파랑 열쇠','집으면 그 색 블록이 전부 사라진다','#d02f22'),
    ('R Y B','색 블록','같은 색 열쇠로 없앤다. 그 위에 있던 것은 떨어진다','#d97b1f'),
    ('a / A','스위치와 셔터','한 번 밟으면 열린 채 남는다','#3f8f56'),
    ('p q / P Q','누름판과 셔터','눌린 동안만 열린다. 상자를 올려 둬도 눌린다','#3f8f56'),
    ('u U · w W','포탈 한 쌍','들어가면 저편에서 나온다. 상자도 지난다','#2f6fb0'),
    ('{ }','통이 굴러 나오는 구멍','그쪽으로 굴러 나온다. 맞으면 밀려난다','#d97b1f'),
    ('S','스프링·트램펄린','다섯 칸 튀어 오른다. <b>내려앉을 때</b> 튄다 — 걸어 들어가면 안 튄다','#2f9c9c'),
    ('v','삭은 발판','0.5초 밟으면 부서지고 3초 뒤 돌아온다. 밟다 만 것은 비면 아물어 간다 — 한 명씩','#9c8f74'),
    ('> <','무빙워크','서 있으면 실려 간다. 상자도 실려 간다 (사람의 반). 역방향은 걸어서는 거의 못 간다 — 뛴다','#2f6fb0'),
    ('O','출구 포탈','⌥↑. 판마다 「한 명」 또는 「넷」','#8a5bb5'),
    ('1 2 3 4','시작 자리','죽으면 여기서 다시 산다','#2f6fb0'),
]

HTML = f"""<title>넷이서</title>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Gothic+A1:wght@800;900&family=IBM+Plex+Sans+KR:wght@400;600&family=IBM+Plex+Mono:wght@500;600&display=swap">
{CSS}{EXTRA_CSS}{MORE_CSS}{views.CSS}{icons.CSS}
<div class="page">

<header class="head">
  <div class="kicker">몰겜 · 세 번째 게임 · 기획 6판 — 검토판</div>
  <h1>넷이서</h1>
  <p class="lede"><b>뒷마당 · 학교 · 도시 · 지하철.</b> 판 열넷, 모양도 규칙도 다 다르다 — 한 화면짜리, 가로로 긴 것, 위로 긴 것, 두 복도, 3층, 무빙워크 통로.
     어떤 판은 <b>한 명만</b> 닿으면 끝나고 어떤 판은 <b>넷이 다</b> 모여야 끝난다.
     판마다 협동 마디가 넷 이상 — 어깨와 손, 사람 계단, 누름판 지키기, 깜빡이는 다리, 한 명씩 건너는 삭은 발판, 포탈로 보내는 상자.
     열네 판 풀이 {STEPS_ALL}걸음을 지형에 대 봤고, <b>같은 풀이를 실제 엔진에서 넷이 키를 눌러 전부 깼다</b> (아래 12).</p>
  <dl class="spec">
    <div><dt>인원</dt><dd>넷 고정</dd></div>
    <div><dt>판</dt><dd>4단계 · 열네 판 · 크기는 판마다</dd></div>
    <div><dt>끝나는 조건</dt><dd>판마다 「한 명」 / 「넷」</dd></div>
    <div><dt>죽으면</dt><dd>시작 자리에서 다시 · 방장이 ⌥R 로 판을 되감을 수 있다</dd></div>
    <div><dt>6판에서</dt><dd>지하철 두 판 · 삭은 발판 · 상자가 무빙워크를 탄다 · 엔진 버그 여덟 · 판 여섯 고침</dd></div>
  </dl>
</header>

<section>
  <div class="num">01</div>
  <h2>주황버섯의 소개팅에서 가져온 것</h2>
  <p class="sub">워크래프트 3 유즈맵. 두 사람이 주황버섯을 소개팅 장소까지 데려다 준다. 13개 월드, 월드마다 컨티뉴 20개.
     맵 열둘(1-1~1-8, 2-1~2-4)을 사진으로 뜯어봤다.</p>
  <div class="mush">{''.join(f'<div><b>{a}</b>{b}<br><span>{c}</span></div>' for a, b, c in MUSH)}</div>
  <p class="note">피코파크에서는 「무거운 것은 둘이 민다」「사람 위에 선다」「한 명이 죽으면 전원」을, 주황버섯에서는
     「색 열쇠」「표지판」「되돌아오는 루프」「두 레인」「방장이 되감는다」를 가져왔다. 둘을 섞은 게 이 판이다.</p>
</section>

<section>
  <div class="num">02</div>
  <h2>협동하는 법 열네 가지</h2>
  <p class="sub">장치보다 <b>사람이 갈리는 방식</b>이 협동이다. 판마다 이 중 두셋을 섞는다. 오른쪽 작은 글씨가 그 방식을 쓰는 판.</p>
  <div class="patterns">{''.join(f'<div class="pattern"><span class="no">{i:02d}</span><div><b>{a}</b><p>{b}</p><div class="use">{c}</div></div></div>' for i, (a, b, c) in enumerate(PATTERNS, 1))}</div>
</section>

<section>
  <div class="num">03</div>
  <h2>판 모양 다섯 가지</h2>
  <p class="sub">빨간 점선이 화면 한 칸(36 × 22). 판이 화면보다 크면 카메라가 <b>내 캐릭터</b>를 따라간다 — 나는 2층, 친구는 1층이면 다른 화면을 본다.</p>
  <div class="shapes">{''.join(f'<div class="shape">{shape_svg(k)}<b>{n}</b>{d}</div>' for k, n, d in SHAPES)}</div>
</section>

<section>
  <div class="num">04</div>
  <h2>끝나는 조건 · 죽음 · 되감기</h2>
  {verbs([
    ('넷이 다 모여야 끝','출구 포탈에 넷이 들어와 있으면 켜지고 아무나 ⌥↑. 흩어져 있으면 「2명 더」가 포탈 위에 뜬다. 포탈 앞에서 동료 머리 위에 서 있어도 「안」이다.','기본. 열네 판 중 열.'),
    ('한 명만 닿으면 끝','넷 중 하나가 포탈에 닿는 순간 끝. 나머지 셋은 그 한 명을 보내는 기계다 — 누름판을 밟고, 어깨를 내주고.','네 판. 누름판 지키기와 짝이 된다 — 지키는 사람이 못 와도 된다.'),
    ('죽으면 시작 자리에서','가시·연못에 닿으면 그 사람만 시작 자리에서 다시 산다. 판은 그대로 돈다.','팀이 이미 협동으로 건너간 자리면 혼자서는 못 따라간다 — 그래서 아래가 있다.'),
    ('방장이 되감는다','⌥R (방장만). 상자·블록·셔터·사람 전부 처음 자리로. 「되감기 3」처럼 횟수를 세어 단계 끝에 보여 준다.','주황버섯의 컨티뉴를 가져왔지만 막지는 않는다 — 점심시간에 하는 게임이 「컨티뉴 소진」으로 끝나면 안 된다.'),
    ('통·전동차는 죽이지 않는다','세 칸 밀려나고 0.5초 넘어진다. 밀려나서 가시에 닿는 것만 죽음이다.','죽는 이유가 둘뿐이면 실수를 남 탓하지 않는다.'),
    ('시간 제한은 단계 끝 판만','도시 「옥상」 120초, 지하철 「종점」 150초. 다 되면 방장이 되감은 것과 같다.','시간은 가장 싼 손잡이라 아껴 쓴다.'),
  ])}
</section>

<section>
  <div class="num">05</div>
  <h2>네모 캐릭터</h2>
  <p class="sub">살짝 둥근 직사각형 34 × 50px. 잉크 테두리에 색연필 빗금. 눈 둘, 입 하나, 짧은 다리 둘. 팔은 <b>뭔가를 잡을 때만</b>. 윗면이 평평해서 밟고 서기가 자연스럽다.</p>
  {char_cards()}
  {pose_cards()}
  {verbs([
    ('찌그러지고 늘어난다','웅크리면 넓고 낮게, 뛰면 좁고 길게. 착지하면 0.1초 눌렸다 돌아온다.','관절이 없는 대신 이게 아주 잘 읽힌다.'),
    ('누가 위에 서면 눌린다','머리 위에 한 명이면 10%, 둘이면 20%.','밟는 쪽 화면에서도 밟히는 쪽 화면에서도 「무게」가 보인다.'),
    ('넷은 똑같이 걷고 뛴다','다른 것은 옷 색과 머리 표뿐 — 삐친 머리 · 안경 · 단발 · 모자.','능력이 다르면 잘하는 사람이 다 해 버린다.'),
    ('내 것은 밑줄, 방장은 왕관','지금 게임 그대로.','바뀌지 않는 것은 바꾸지 않는다.'),
  ])}
</section>

<section>
  <div class="num">06</div>
  <h2>시야 — 각자 자기 카메라</h2>
  {verbs([
    ('내 캐릭터가 한가운데','가로 ±4칸 · 세로 ±3칸 죽은 구역 안에서는 안 움직이고, 벗어난 만큼만 0.12초에 걸쳐 따라붙는다. 판 끝에서는 벽에 붙어 멈춘다.','한 화면짜리 판에서는 카메라가 아예 안 움직인다.'),
    ('화면 밖 친구는 화살표','화면 가장자리에 옷 색 화살표 + 머리 표 + 「2층 ↑」. 넷이 다 보이면 사라진다.','다른 층 친구가 어디 있는지 알아야 「내려와」를 말할 수 있다.'),
    ('넷이 같은 판을 본다','지형·상자·블록·셔터·통은 하나. 카메라만 다르다.','상자·통·셔터는 방장이 굴리고 카메라는 각자 계산한다.'),
  ])}
</section>

<section>
  <div class="num">07</div>
  <h2>각자 보는 화면 — 같은 순간, 네 화면</h2>
  <p class="sub">「두 길」 판, 1번이 노란 열쇠 코앞에 선 순간. <b>지형은 하나인데 네 사람이 보는 화면은 다 다르다.</b>
     카메라는 내 캐릭터를 따라가고 판 끝에서 멈춘다. 화면 밖 친구는 가장자리 화살표 — 옷 색 네모, 이름, 몇 층인지, 몇 칸 떨어졌는지.
     바탕의 흐릿한 줄은 그 사람이 일하던 문서다 — 이 게임은 남의 화면 위에 투명하게 얹힌다.</p>
  {views.html_block()}
  <p class="note">3번은 판 왼쪽 끝에 있어 카메라가 벽에 붙는다 — 자기가 화면 한가운데에 있지 않다. 그게 맞다: 판 밖 검은 부분을 보여 주는 것보다
     한쪽으로 치우친 게 낫다. 2번과 4번은 같은 구역에 있어 서로 화면 안에 보이지만, 2번은 2층에서 4번은 1층에서 보는 것이라 화면이 다르다.</p>
</section>

<section>
  <div class="num">08</div>
  <h2>치수 · 조작</h2>
  <div class="scroll"><table>
    <tr><th>무엇</th><th>얼마</th><th>그래서</th></tr>
    {rows([('한 칸','42px','화면 36 × 22 칸'),('사람','0.8 × 1.2칸 · 판정 1 × 2','네모'),('점프','두 칸 위 · 네 칸 옆','세 칸 턱부터 어깨나 상자'),
           ('어깨','선 머리 한 명당 +53px (한 칸 남짓)','셋이 쌓이면 다섯 칸 — 「두 열쇠」의 기둥. 웅크린 머리는 31px — 계단은 서서'),('웅크리기','0.7칸','한 칸 굴'),('걷기 · 밀기','초당 7 · 2.2칸','X 는 둘이 붙어야 2.2. 무빙워크는 초당 6칸, 그 위 상자는 3칸'),
           ('스프링','다섯 칸 위 · 옆 네 칸','「움직이는 발판」의 트램펄린'),('왕복 발판','초당 3칸 · 길 끝에서 되돌아온다','넷이 타면 초당 2칸'),
           ('통','초당 5칸 · 두 번 떨어지면 부서진다','맞으면 세 칸 밀려나고 0.5초 넘어진다'),('포탈','바로 · 0.3초 뒤 재진입','상자도 지난다')])}
  </table></div>
  <div class="scroll"><table>
    <tr><th>키</th><th>하는 일</th><th>비고</th></tr>
    {rows([('⌥ ← →','걷기','사다리 위에서는 안 먹는다'),('⌥ ↑','점프 · 사다리 오르기 · <b>출구 포탈</b>','포탈 위면 다음 판'),('⌥ ↓','웅크리기 · <b>사다리 꼭대기에서 내려가기</b>','발밑 칸이 사다리면 웅크리는 게 아니라 잡고 내려간다'),
           ('⌥ Space 길게','잡기 — 상자 · 사람','떼면 놓는다'),('⌥ R','<b>이 판 되감기 (방장만)</b>','상자·블록·사람 전부 처음 자리로. 횟수를 센다'),
           ('⌥ M','메뉴','같이 하기 · 화면 · 홈으로'),('⌥ H','숨기기','⌥ 를 떼기만 해도 숨는다')])}
  </table></div>
</section>

<section>
  <div class="num">09</div>
  <h2>생김새 — 실제처럼</h2>
  <p class="sub">전부 볼펜 테두리에 색연필로 칠한다 (지금 게임 그림체). 단계마다 땅의 가죽이 다르다 — 뒷마당은 흙과 잔디, 학교는 벽돌, 도시는 콘크리트.
     <b>같은 일을 하는 것은 같게 그린다</b>: 미는 것은 전부 나무 상자, 여는 것은 전부 롤 셔터, 옮기는 것은 전부 세운 타원.</p>
  {icons.block_html()}
</section>

<section>
  <div class="num">10</div>
  <h2>지형지물</h2>
  <div class="scroll"><table>
    <tr><th>글자</th><th>무엇</th><th>규칙</th></tr>
    {rows([(f'<b style="color:{c}">{g}</b>', n, d) for g, n, d, c in LEGEND])}
  </table></div>
</section>

<section>
  <div class="num">11</div>
  <h2>판 열넷</h2>
  <p class="sub">맵은 가로로 스크롤된다. 진한 것이 땅, 갈색이 상자, 빨강·노랑·파랑 네모가 색 블록(같은 색 열쇠로 없앤다), 초록이 스위치·누름판·셔터,
     파란 점선이 왕복 발판의 길, 보라 타원이 출구. 네 네모가 시작 자리. 연필색 글은 배경 소품.</p>
  {''.join(cards)}
</section>

<section>
  <div class="num">12</div>
  <h2>깰 수 있다 — 어떻게 확인했나</h2>
  {verbs([
    ('풀이를 걸음으로 적었다','걷기 · 뛰기 · 사다리 · 어깨 · 밀기 · 포탈 · 스위치 · 누름판 · 스프링 · 열쇠 · 출구. 열두 판 489걸음.','「이렇게 하면 깨진다」를 말로 하지 않고 순서로 적는다.'),
    ('매 걸음의 전제를 지형에 댔다','길에 벽이 없나, 구멍이 네 칸을 안 넘나, 오르는 높이가 두 칸(+어깨) 안인가, 사다리가 그 줄에 있나, 상자가 앉을 바닥이 있나, 누름판 위에 뭐가 있나, 셔터·색 블록이 지금 열려 있나.','깨지면 그 자리에서 터진다. 만들면서 여덟 군데를 잡았다 — 탑을 세워 길을 막은 것, 발밑이 사라진 뒤 못 뛰어 넘는 폭, 리프트가 벽 반대편으로 데려다 준 것.'),
    ('열쇠를 집으면 떨어뜨려 봤다','색 블록이 사라지면 그 위의 사람·상자를 바닥까지 떨어뜨리고, 가시에 닿으면 실패로 친다.','「탑」과 「마지막」의 순서 퍼즐이 이걸로 확인된다.'),
    ('실제 엔진에서 넷이 키를 눌러 깼다 (6판)','같은 풀이를 <code>test/coop-play.mjs</code> 가 게임 물리 그대로 해 본다 — 걷다 구멍 앞에서 뛰고, 사다리를 타고, 상자를 밀고, 남의 머리를 딛고, 손을 잡아 끌어올리고, 왕복 발판을 기다리고, 깜빡이는 다리가 켜질 때 건너고, 출구에서 ⌥↑. 통만 뺐다 — 맞아도 죽지 않고 박자 문제라.','어림값(칸)과 픽셀 물리가 어긋난 판을 여섯 잡았다 — 아래 표와 13.'),
    ('안 본 것','통의 박자, 시간 제한, 넷이 동시에 움직일 때의 엇갈림(봇은 한 명씩 움직인다).','이 확인은 「길이 있다」이지 「쉽다」가 아니다. 쉬운지는 넷이 붙어 봐야 안다.'),
  ])}
  <div class="scroll"><table>
    <tr><th>판</th><th>걸음</th><th>엔진에서</th><th>한 명씩 움직여</th></tr>
    {rows([(f'<b>{p["no"]}</b> {p["name"]}', f'{p["steps"]}걸음', '깼다' if p['ok'] else f'✗ {html.escape(str(p["fail"]))}', f'{p["seconds"]:.0f}초') for p in PLAY], cls=('k','','','n'))}
  </table></div>
</section>

<section>
  <div class="num">13</div>
  <h2>6판에서 고친 것 — 검토</h2>
  <p class="sub">「맵을 다 검토하고, 버그도 검토하고, 처음 점프할 때 발이 땅 밑까지 들어가는 것도」. 엔진 여덟, 판 여섯, 검사기 둘.</p>
  <h3>엔진</h3>
  {verbs([
    ('남의 발이 착지마다 땅에 박혔다','남의 자리는 마지막 꾸러미에서 속도로 이어 그리는데 그 계산이 땅을 몰랐다 — 뛰어내리는 사람은 다음 꾸러미까지 발판을 뚫고 내려가 보였다. 내려가던 발이 바닥을 지나면 바닥에 세운다.','「처음에 점프할 때 발이 땅 밑까지 침범」의 첫째 원인.'),
    ('발끝이 땅 밑으로 4px 그려졌다','다리 획이 발 높이 아래까지 이어져 서 있는 사람도 발이 땅에 박혀 보였다. 발끝은 발 높이에서 끝난다.','둘째 원인. 2층 이상에서는 늘 「공중 다리」로 그려지던 것(높이로 공중을 가렸다)도 함께 — 바닥에 섰나로 본다.'),
    ('사다리 꼭대기에서 ⌥↓ 가 웅크리기였다','발밑 칸이 사다리면 잡고 내려간다. 밑에 닿으면 선다 — 안 그러면 ⌥↓ 를 잡은 채 허공에 매달려 걷지도 못했다. 리프트에서 옆으로 내리면 층 바닥이 발 높이 ±16px 안에 있을 때 올라선다.','「두 길」에서 2층 사람이 내려올 길이 없었다.'),
    ('상자·통이 빨리 떨어지면 바닥을 뚫었다','새 자리에서 바닥을 다시 찾아, 한 프레임에 19px 씩 가는 상자는 얇은 바닥을 지나쳐 판 밑으로 갔다. 지금 자리에서 본 가장 가까운 아래 바닥을 이번 프레임에 지나치면 거기 앉는다.','「3층 창고」의 상자가 1층 바닥을 통과했다.'),
    ('상자 밀기가 3/4 속도였다','밀 때 제자리에 서서 상자가 1.5px 앞서가면 4.8px 씩 따라 잡느라 네 프레임 중 하나를 놓쳤다. 상자에 붙는다.','초당 2.2칸이 1.6칸으로 가던 것.'),
    ('무빙워크가 사람을 상자 속으로 밀어 넣었다','실려 가는 만큼을 자리에 바로 더했다. 걸음과 합쳐 벽·상자에 대 본다.','새로 넣은 무빙워크에서 잡았다.'),
    ('손잡기가 벽 모서리 1px 위 허공에 세웠다','올라선 사람이 설 자리는 몸이 4px 이상 바닥에 걸쳐야 한다. 상대 쪽 옆, 반대쪽 옆, 아니면 내 자리.','「옥상」 세 칸 벽 위에서 끌어올린 사람이 도로 떨어졌다.'),
    ('출구 안에서 동료 머리 위에 서면 「안」이 아니었다','포탈 앞에 넷이 몰리면 누가 누구 머리 위에 서게 된다. 한 칸 반까지 안이다.','「움직이는 발판」 끝에서 넷이 모였는데 「2명 더」.'),
  ])}
  <h3>판</h3>
  {verbs([
    ('두 열쇠 — 셋을 쌓았는데 머리가 닿았다','다락 바닥이 기둥 옆 칸 위까지 덮어, 셋을 쌓고 뛰면 천장에 막혀 다섯 칸 기둥에 못 올랐다. 다락은 6칸부터.','칸 검사는 세로 길을 안 봤다.'),
    ('3층 창고 — 상자 위에서 벽 너머로 한 번에 못 갔다','한 칸 상자 위에서 두 칸 위 벽을 넘어 세 칸 옆에 내리는 건 달릴 자리가 없다. 벽 위에 올라선 뒤 내려선다.','칸 검사는 「두 칸 위」와 「네 칸 옆」을 따로 봤다.'),
    ('옥상 — 사다리 발치에서 뛰면 사다리를 잡았다','⌥↑ 는 점프이자 사다리다. 상자 옆 사다리를 두 칸 뗐다.',''),
    ('두 길 · 탑 — 열쇠를 지나치며 집었다','열쇠는 닿으면 집는다. 노란 열쇠를 먼저 집으면 발밑이 사라진다 — 길에 놓인 열쇠는 <b>뛰어 넘는다</b>(hop).','풀이에 뛰어넘기 걸음을 넣고, 검사기가 지나가는 걷기를 막는다.'),
    ('표지판 — 선반을 뚫고 내려뛰었다','서 있는 발판을 뚫고는 못 내려간다. 선반 가장자리 밖으로 뛴다.','검사기가 내려뛰기 기둥을 본다.'),
    ('탑 · 무빙워크 · 종점 — 손 닿는 자리에 다른 사람','손잡기는 옆 한 칸·아래 세 칸 안에서 가장 가까운 사람을 끌어올린다. 다른 사람이 그 안에 서 있으면 그쪽이 올라온다 — 두 칸 물러선다.','검사기가 곁 사람을 본다.'),
  ])}
  <h3>검사기</h3>
  {verbs([
    ('실전 검사기','<code>test/coop-play.mjs</code>. 풀이 원문(<code>test/coop-moves.json</code>)을 엔진에서 키로 실행한다. 넷을 한 세상에서 굴리되 움직이는 한 명만 진짜 물리, 나머지는 그 자리에 선 남 — 남의 물리는 그 사람 화면 것이니 서 있는 자리와 떨어지는 것만 흉내 낸다.','판마다 몇 초에 깨지는지도 남는다 (위 표).'),
    ('칸 검사기(solve.py) 규칙 다섯','열쇠는 닿으면 집는다 · 포탈은 지나가면 들어간다 · 내려뛰기는 발판을 뚫지 못한다 · 손잡기 곁에 다른 사람이 있으면 그쪽이 끌려온다 · 무빙워크 위 상자는 혼자 간다(ride).','어림값 검사가 엔진과 같은 말을 하게.'),
  ])}
</section>

<footer>
  <div>조사한 곳 — <a href="https://en.wikipedia.org/wiki/Pico_Park">Wikipedia: Pico Park</a> · <a href="https://picoparkgame.com/en/pp1/">피코파크 공식</a> ·
       <a href="https://namu.wiki/w/%EC%A3%BC%ED%99%A9%EB%B2%84%EC%84%AF%EC%9D%98%20%EC%86%8C%EA%B0%9C%ED%8C%85">나무위키: 주황버섯의 소개팅</a> (맵 사진 1-1~1-8, 2-1~2-4)</div>
  <div>열네 판은 조각 DSL 로 쌓았고, 풀이 {STEPS_ALL}걸음을 지형에 한 걸음씩 대서 확인한 뒤 실제 엔진에서 키를 눌러 다시 깼다. 자료는 리포 <code>docs/넷이서/</code>, 실전 검사는 <code>test/coop-play.mjs</code>.</div>
</footer>
</div>

<script>
const STAGES = {canvas_data()};
const COL = {{'#':'#141210','=':'#6b665c','H':'#8a7a5a','|':'#8a7a5a','-':'#2f6fb0','^':'#d02f22','x':'#6f4a2c','X':'#4f3320',
  'r':'#d02f22','y':'#c9a200','b':'#2f6fb0','R':'#e0857c','Y':'#e2cf6a','B':'#8fb3dc',
  'a':'#3f8f56','p':'#3f8f56','q':'#3f8f56','A':'#7fbf95','P':'#7fbf95','Q':'#7fbf95',
  'u':'#2f6fb0','U':'#2f6fb0','w':'#2f6fb0','W':'#2f6fb0','O':'#8a5bb5','{{':'#d97b1f','}}':'#d97b1f','S':'#2f9c9c','v':'#b8912a','~':'#b8912a','>':'#2f6fb0','<':'#2f6fb0'}};
const SHIRT = ['#2f6fb0','#3f8f56','#d97b1f','#8a5bb5'];
const T = 9;
function draw(cv, st) {{
  const rows = st.art.split('\\n'); const W = rows[0].length, H = rows.length;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = W*T*dpr; cv.height = H*T*dpr; cv.style.width = (W*T)+'px'; cv.style.height = (H*T)+'px';
  const g = cv.getContext('2d'); g.scale(dpr, dpr);
  const dark = (matchMedia('(prefers-color-scheme: dark)').matches && document.documentElement.dataset.theme !== 'light') || document.documentElement.dataset.theme === 'dark';
  const paper = dark ? '#1c1917' : '#f4efe2', ink = dark ? '#f2ece0' : '#141210';
  g.fillStyle = paper; g.fillRect(0,0,W*T,H*T);
  g.strokeStyle = dark ? 'rgba(242,236,224,.09)' : 'rgba(20,18,16,.09)'; g.lineWidth = 1;
  for (let x = 36; x < W; x += 36) {{ g.beginPath(); g.moveTo(x*T+.5, 0); g.lineTo(x*T+.5, H*T); g.stroke(); }}
  for (let y = 22; y < H; y += 22) {{ g.beginPath(); g.moveTo(0, y*T+.5); g.lineTo(W*T, y*T+.5); g.stroke(); }}
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {{
    const ch = rows[y][x]; if (ch === '.') continue;
    const X = x*T, Y = y*T;
    if ('1234'.includes(ch)) {{ const i = +ch-1; g.fillStyle = SHIRT[i]; g.strokeStyle = ink; g.lineWidth = 1.2;
      g.beginPath(); g.roundRect(X+T*0.1, Y-T*0.3, T*0.8, T*1.3, 2); g.fill(); g.stroke(); continue; }}
    g.fillStyle = (ch === '#') ? (dark ? '#c9c1b2' : '#141210') : (COL[ch] || '#999');
    if (ch === '=') {{ g.fillRect(X, Y+T*0.3, T, T*0.4); continue; }}
    if (ch === 'H' || ch === '|') {{ g.fillRect(X+1, Y, 2, T); g.fillRect(X+T-3, Y, 2, T); g.fillRect(X+1, Y+T/2-1, T-2, 2); continue; }}
    if (ch === '~') {{ g.fillRect(X+1, Y+T*0.3, T-2, T*0.4); g.fillStyle = paper; g.fillRect(X+T*0.45, Y+T*0.3, 1.2, T*0.4); continue; }}
    if (ch === '-') {{ g.setLineDash([2,2]); g.strokeStyle = COL['-']; g.beginPath(); g.moveTo(X, Y+T/2); g.lineTo(X+T, Y+T/2); g.stroke(); g.setLineDash([]); continue; }}
    if (ch === '^') {{ g.beginPath(); g.moveTo(X, Y+T); g.lineTo(X+T/2, Y+2); g.lineTo(X+T, Y+T); g.fill(); continue; }}
    if ('uUwWO'.includes(ch)) {{ g.beginPath(); g.ellipse(X+T/2, Y+T/2, T*0.42, T*0.62, 0, 0, Math.PI*2); g.fill();
      if (ch === 'O') {{ g.fillStyle = paper; g.font = '700 6px sans-serif'; g.textAlign='center'; g.fillText('↑', X+T/2, Y+T/2+2.5); }} continue; }}
    if ('ryb'.includes(ch)) {{ g.beginPath(); g.arc(X+T/2, Y+T/2, T*0.3, 0, Math.PI*2); g.fill(); g.fillRect(X+T/2, Y+T/2-1, T*0.45, 2); continue; }}
    if ('{{}}'.includes(ch)) {{ g.beginPath(); g.arc(X+T/2, Y+T/2, T*0.45, 0, Math.PI*2); g.fill(); continue; }}
    g.fillRect(X, Y, T, T);
    if ('RYB'.includes(ch)) {{ g.strokeStyle = ink; g.lineWidth = .8; g.strokeRect(X+.5, Y+.5, T-1, T-1); }}
    if ('xX'.includes(ch)) {{ g.strokeStyle = paper; g.lineWidth = 1; g.beginPath(); g.moveTo(X+T/2, Y); g.lineTo(X+T/2, Y+T); g.moveTo(X, Y+T/2); g.lineTo(X+T, Y+T/2); g.stroke(); }}
    if ('apq'.includes(ch)) {{ g.fillStyle = paper; g.fillRect(X+2, Y+T*0.55, T-4, T*0.3); }}
  }}
  g.fillStyle = dark ? 'rgba(242,236,224,.6)' : 'rgba(107,102,92,.95)'; g.font = '500 8px "IBM Plex Sans KR", sans-serif'; g.textAlign = 'left';
  for (const [x, y, text] of st.notes) g.fillText(text, x*T, y*T + 6);
}}
document.querySelectorAll('canvas[data-stage]').forEach(cv => draw(cv, STAGES[+cv.dataset.stage]));
/*VIEWS_JS*/
</script>
"""
HTML = HTML.replace('/*VIEWS_JS*/', views.JS)
open('coop-plan6.html','w').write(HTML); print('wrote', len(HTML))
