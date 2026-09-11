# -*- coding: utf-8 -*-
import html
EXTRA_CSS = """
<style>
.mapwrap { background:var(--sheet); border:1px solid var(--rule); overflow:auto; max-height:560px; }
.mapwrap canvas { display:block; margin:0 auto; }
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

