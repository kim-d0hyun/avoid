# -*- coding: utf-8 -*-
"""지형지물 도감 — 게임이 그릴 모양을 SVG 로 먼저 그려 본다. 잉크 테두리 + 색연필 칠."""
INK, PEN, PENCIL = 'var(--ink)', '#d02f22', 'var(--pencil)'

def svg(body, w=120, h=90):
    return f'<svg viewBox="0 0 {w} {h}" aria-hidden="true">{body}</svg>'

def hatch(x, y, w, h, color, step=7, op=.55):
    out = []
    for k in range(0, w + h, step):
        x1, y1 = x + min(k, w), y + max(0, k - w)
        x2, y2 = x + max(0, k - h), y + min(k, h)
        out.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.6" opacity="{op}"/>')
    return ''.join(out)

def ground(theme):
    """땅·벽 — 단계마다 다른 가죽. 뒷마당 흙+잔디 · 학교 벽돌 · 도시 콘크리트."""
    if theme == 'yard':
        return svg(f'<rect x="8" y="30" width="104" height="52" fill="#c9a86a" fill-opacity=".45" stroke="{INK}" stroke-width="3"/>'
                   + hatch(8, 30, 104, 52, '#8a6a3a')
                   + ''.join(f'<path d="M{x} 30 q3 -8 6 0" fill="none" stroke="#3f8f56" stroke-width="2.4" stroke-linecap="round"/>' for x in range(10, 110, 9))
                   + f'<circle cx="40" cy="60" r="3" fill="{INK}" opacity=".5"/><circle cx="82" cy="70" r="2.4" fill="{INK}" opacity=".5"/>')
    if theme == 'school':
        rows = ''.join(f'<line x1="8" y1="{y}" x2="112" y2="{y}" stroke="{INK}" stroke-width="1.4"/>' for y in range(42, 82, 12))
        bricks = ''.join(f'<line x1="{x + (12 if (y//12)%2 else 0)}" y1="{y}" x2="{x + (12 if (y//12)%2 else 0)}" y2="{y+12}" stroke="{INK}" stroke-width="1.4"/>'
                         for y in range(30, 82, 12) for x in range(8, 112, 24))
        return svg(f'<rect x="8" y="30" width="104" height="52" fill="#b8912a" fill-opacity=".35" stroke="{INK}" stroke-width="3"/>{rows}{bricks}')
    return svg(f'<rect x="8" y="30" width="104" height="52" fill="#6b665c" fill-opacity=".25" stroke="{INK}" stroke-width="3"/>'
               + hatch(8, 30, 104, 52, '#6b665c', 9, .5)
               + ''.join(f'<circle cx="{x}" cy="{y}" r="1.8" fill="{INK}"/>' for x in (16, 104) for y in (38, 74))
               + f'<line x1="8" y1="56" x2="112" y2="56" stroke="{INK}" stroke-width="2" stroke-dasharray="6 4"/>')

def platform():
    """선반·발판 — 나무 판자. 밑에서 통과."""
    return svg(f'<rect x="10" y="40" width="100" height="12" fill="#c9a86a" fill-opacity=".5" stroke="{INK}" stroke-width="3"/>'
               f'<line x1="14" y1="46" x2="106" y2="46" stroke="#8a6a3a" stroke-width="1.4"/>'
               f'<circle cx="20" cy="46" r="1.6" fill="{INK}"/><circle cx="100" cy="46" r="1.6" fill="{INK}"/>'
               f'<path d="M60 62 l-6 8 m6 -8 l6 8" stroke="{PENCIL}" stroke-width="1.6" fill="none"/>')

def ladder():
    return svg(f'<line x1="44" y1="6" x2="44" y2="86" stroke="{INK}" stroke-width="3.2"/><line x1="76" y1="6" x2="76" y2="86" stroke="{INK}" stroke-width="3.2"/>'
               + ''.join(f'<line x1="44" y1="{y}" x2="76" y2="{y}" stroke="{INK}" stroke-width="2.6"/>' for y in range(16, 86, 14))
               + hatch(46, 8, 28, 76, '#8a6a3a', 11, .35))

def lift():
    return svg(f'<line x1="60" y1="4" x2="60" y2="86" stroke="{INK}" stroke-width="2" stroke-dasharray="4 4"/>'
               f'<rect x="30" y="38" width="60" height="16" fill="#6b665c" fill-opacity=".35" stroke="{INK}" stroke-width="3"/>'
               f'<path d="M36 38 l24 -20 l24 20" fill="none" stroke="{INK}" stroke-width="2"/>'
               f'<path d="M60 8 l-4 6 m4 -6 l4 6 M60 86 l-4 -6 m4 6 l4 -6" stroke="{PEN}" stroke-width="2" fill="none"/>')

def track():
    return svg(f'<line x1="8" y1="46" x2="112" y2="46" stroke="#2f6fb0" stroke-width="2" stroke-dasharray="5 4"/>'
               f'<rect x="44" y="38" width="32" height="12" fill="#c9a86a" fill-opacity=".5" stroke="{INK}" stroke-width="3"/>'
               f'<path d="M12 46 l6 -4 m-6 4 l6 4 M108 46 l-6 -4 m6 4 l-6 4" stroke="#2f6fb0" stroke-width="2" fill="none"/>')

def blink():
    tiles = ''.join(f'<rect x="{12 + i*26}" y="40" width="20" height="10" fill="#b8912a" fill-opacity="{.55 if i%2==0 else .12}" stroke="{INK}" stroke-width="{2.6 if i%2==0 else 1}" stroke-dasharray="{"" if i%2==0 else "3 3"}"/>' for i in range(4))
    return svg(tiles)

def switch():
    return svg(f'<rect x="30" y="62" width="60" height="12" fill="#6b665c" fill-opacity=".3" stroke="{INK}" stroke-width="3"/>'
               f'<rect x="44" y="46" width="32" height="18" rx="4" fill="{PEN}" fill-opacity=".8" stroke="{INK}" stroke-width="3"/>'
               f'<circle cx="60" cy="40" r="3" fill="#3f8f56" stroke="{INK}" stroke-width="1.5"/>'
               f'<path d="M60 26 v8" stroke="{PENCIL}" stroke-width="1.5"/>')

def plate():
    return svg(f'<rect x="20" y="60" width="80" height="8" fill="#3f8f56" fill-opacity=".45" stroke="{INK}" stroke-width="3"/>'
               f'<rect x="20" y="68" width="80" height="6" fill="none" stroke="{INK}" stroke-width="2"/>'
               + ''.join(f'<circle cx="{x}" cy="64" r="1.6" fill="{INK}"/>' for x in (28, 60, 92))
               + f'<path d="M100 64 q14 0 14 -14 v-30" fill="none" stroke="{PENCIL}" stroke-width="1.6" stroke-dasharray="4 3"/>')

def shutter():
    slats = ''.join(f'<line x1="40" y1="{y}" x2="80" y2="{y}" stroke="{INK}" stroke-width="1.6"/>' for y in range(24, 74, 6))
    return svg(f'<rect x="40" y="18" width="40" height="58" fill="#6b665c" fill-opacity=".3" stroke="{INK}" stroke-width="3"/>{slats}'
               f'<rect x="34" y="10" width="52" height="10" rx="3" fill="{INK}"/>'
               f'<path d="M92 40 v-14 m0 14 l-4 -5 m4 5 l4 -5" stroke="{PEN}" stroke-width="2" fill="none"/>')

def portal(color='#2f6fb0', exit_=False):
    swirl = f'<path d="M60 26 c14 6 14 26 0 32 c-10 4 -14 -8 -6 -12 c6 -3 10 4 6 8" fill="none" stroke="{color}" stroke-width="2" opacity=".8"/>'
    arrow = f'<path d="M60 72 v-40 m-8 8 l8 -8 l8 8" fill="none" stroke="var(--paper)" stroke-width="3.5"/>' if exit_ else ''
    return svg(f'<ellipse cx="60" cy="44" rx="18" ry="30" fill="{color}" fill-opacity="{.85 if exit_ else .25}" stroke="{INK}" stroke-width="3"/>'
               + (arrow if exit_ else swirl)
               + f'<ellipse cx="60" cy="76" rx="24" ry="4" fill="none" stroke="{PENCIL}" stroke-width="1.5"/>')

def key(color):
    return svg(f'<circle cx="40" cy="44" r="13" fill="none" stroke="{color}" stroke-width="4"/>'
               f'<circle cx="40" cy="44" r="5" fill="none" stroke="{color}" stroke-width="2.5"/>'
               f'<line x1="53" y1="44" x2="92" y2="44" stroke="{color}" stroke-width="4" stroke-linecap="round"/>'
               f'<line x1="82" y1="44" x2="82" y2="54" stroke="{color}" stroke-width="4" stroke-linecap="round"/><line x1="90" y1="44" x2="90" y2="52" stroke="{color}" stroke-width="4" stroke-linecap="round"/>'
               f'<ellipse cx="62" cy="72" rx="26" ry="3" fill="none" stroke="{PENCIL}" stroke-width="1.4"/>')

def block(color):
    return svg(f'<rect x="30" y="20" width="60" height="60" rx="4" fill="{color}" fill-opacity=".35" stroke="{color}" stroke-width="4"/>'
               f'<rect x="30" y="20" width="60" height="60" rx="4" fill="none" stroke="{INK}" stroke-width="1.6"/>'
               f'<line x1="40" y1="70" x2="80" y2="30" stroke="var(--paper)" stroke-width="5" opacity=".7"/>')

def box(heavy=False):
    band = f'<rect x="26" y="34" width="68" height="6" fill="{INK}"/><rect x="26" y="66" width="68" height="6" fill="{INK}"/>' if heavy else ''
    dots = (f'<circle cx="52" cy="26" r="3" fill="{INK}"/><circle cx="68" cy="26" r="3" fill="{INK}"/>' if heavy
            else f'<circle cx="60" cy="26" r="3" fill="{INK}"/>')
    return svg(f'<rect x="26" y="20" width="68" height="60" fill="#6f4a2c" fill-opacity=".45" stroke="{INK}" stroke-width="3.2"/>'
               + ''.join(f'<line x1="26" y1="{y}" x2="94" y2="{y}" stroke="#4f3320" stroke-width="1.4"/>' for y in (42, 58))
               + f'<line x1="30" y1="76" x2="90" y2="24" stroke="#4f3320" stroke-width="2"/>'
               + ''.join(f'<circle cx="{x}" cy="{y}" r="1.5" fill="{INK}"/>' for x in (32, 88) for y in (26, 74))
               + band + dots)

def chute():
    return svg(f'<rect x="8" y="24" width="30" height="50" fill="{INK}" fill-opacity=".85"/>'
               f'<circle cx="70" cy="60" r="14" fill="#6f4a2c" fill-opacity=".5" stroke="{INK}" stroke-width="3"/>'
               f'<line x1="56" y1="60" x2="84" y2="60" stroke="{INK}" stroke-width="1.6"/><line x1="70" y1="46" x2="70" y2="74" stroke="{INK}" stroke-width="1.6"/>'
               f'<path d="M92 60 h14 m-4 -4 l4 4 l-4 4" stroke="{PEN}" stroke-width="2" fill="none"/>')

def spring():
    return svg(f'<rect x="26" y="60" width="68" height="10" rx="3" fill="#2f9c9c" fill-opacity=".4" stroke="{INK}" stroke-width="3"/>'
               + ''.join(f'<path d="M{x} 60 q5 -8 10 0" fill="none" stroke="{INK}" stroke-width="2"/>' for x in range(30, 90, 12))
               + ''.join(f'<line x1="{x}" y1="70" x2="{x}" y2="80" stroke="{INK}" stroke-width="2.4"/>' for x in (34, 86))
               + f'<path d="M60 48 v-30 m-6 8 l6 -8 l6 8" fill="none" stroke="{PEN}" stroke-width="2"/>')

ITEMS = [
    ('땅 · 벽 — 뒷마당', ground('yard'), '흙에 잔디 한 줄. 색연필 빗금으로 채운다. 벽도 같은 무늬 — 땅이 서 있는 것이다.'),
    ('땅 · 벽 — 학교', ground('school'), '벽돌 줄무늬. 줄이 한 칸씩 엇갈린다.'),
    ('땅 · 벽 — 도시', ground('city'), '콘크리트. 성긴 빗금과 리벳 넷, 가운데 점선 이음매.'),
    ('선반 · 발판', platform(), '나무 판자 한 장에 못 둘. 밑에서 뛰면 통과한다.'),
    ('사다리', ladder(), '세로줄 둘에 가로대. 사다리 앞에서 ⌥↑.'),
    ('리프트', lift(), '철판 발판 위에 삼각 걸이. 오가는 길은 점선, 끝은 빨간 화살표.'),
    ('왕복 발판', track(), '판자가 점선 길을 오간다. 어디서든 타고 내린다.'),
    ('깜빡이는 발판', blink(), '켜진 칸은 진하게, 꺼진 칸은 점선 윤곽만. 꺼지기 0.5초 전부터 떨린다.'),
    ('스위치', switch(), '받침 위 빨간 버튼. 밟으면 내려간 채로 남고 초록 불이 켜진다.'),
    ('누름판', plate(), '넓은 초록 철판. 밟으면 3분의 1 내려간다. 점선이 셔터까지 이어져 무엇을 여는지 보인다.'),
    ('셔터', shutter(), '가로 살 롤 셔터. 열리면 위 통으로 말려 올라간다.'),
    ('포탈 한 쌍', portal('#2f6fb0'), '세운 타원 고리 안에 소용돌이. 쌍마다 색이 같다. 바닥에 그림자 타원.'),
    ('출구 포탈', portal('#8a5bb5', True), '보라, 위쪽 화살표. 조건이 차면 안이 밝아진다 — 「2명 더」가 위에 뜬다.'),
    ('열쇠 — 빨강', key('#d02f22'), '둥근 머리에 톱니 둘. 살짝 떠서 오르내린다. 집으면 그 색 블록이 깨지듯 사라진다.'),
    ('색 블록', block('#d97b1f'), '반투명 유리 블록에 그 색 테두리, 안에 ✕. 사라질 때 조각이 튄다.'),
    ('상자', box(), '나무 상자. 판자 줄 둘에 대각선 띠, 못 넷. 뚜껑 점 하나 = 한 명이 민다.'),
    ('무거운 상자', box(True), '같은 상자에 철띠 둘, 뚜껑 점 둘 = 둘이 민다. 모양은 같고 띠와 점만 다르다.'),
    ('굴러 나오는 구멍 · 통', chute(), '검은 구멍에서 통이 나온다. 뒷마당은 나무 통, 학교는 여행 가방, 도시는 파이프.'),
    ('스프링 · 트램펄린', spring(), '용수철 다섯 개 위에 매트. 밟으면 다섯 칸.'),
]

CSS = """
<style>
.icons { display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); gap:1px; background:var(--rule); border:1px solid var(--rule); }
.icon { background:var(--paper); padding:14px 14px 16px 14px; display:flex; flex-direction:column; gap:6px; }
.icon svg { width:100%; height:auto; background:var(--sheet); border:1px solid var(--rule); }
.icon b { font-family:"Gothic A1",sans-serif; font-weight:800; font-size:14px; }
.icon span { color:var(--pencil); font-size:12.5px; line-height:1.5; }
</style>
"""

def block_html():
    return '<div class="icons">' + ''.join(f'<figure class="icon">{s}<b>{n}</b><span>{d}</span></figure>' for n, s, d in ITEMS) + '</div>'
