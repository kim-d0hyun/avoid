# -*- coding: utf-8 -*-
"""풀이를 한 걸음씩 지형에 대 본다.

「깰 수 있다」를 말로만 하지 않는다. 판마다 풀이를 걸음(step)으로 적고, 매 걸음의 전제가
지금 지형·상자·셔터 상태에서 성립하는지 확인한다. 성립하지 않으면 그 자리에서 터진다.

모델은 단순하다 — 사람은 한 칸 폭 두 칸 높이, 점프는 두 칸 위 네 칸 옆, 한 명이 어깨를
내주면 한 칸을 더 오른다. 통(장애물)은 죽이지도 막지도 않아서 여기서는 안 본다.
"""
from grid import Grid, FLOOR, stand

JUMP_UP, JUMP_ACROSS, SPRING_UP = 2, 4, 5

class Bad(Exception): pass

class Run:
    def __init__(self, g, weights=None):
        self.g = g
        self.p = {}                  # 이름 → (x, y)  발 자리
        for ch in '1234':
            (x, y), = g.find(ch)
            self.p[ch] = (x, y)
        self.boxes = {}              # 이름 → (x, y, 무게)
        for i, (x, y) in enumerate(g.find('x')): self.boxes[f'x{i}'] = (x, y, 1)
        for i, (x, y) in enumerate(g.find('X')): self.boxes[f'X{i}'] = (x, y, 2)
        self.latched = set()         # 밟아서 열린 스위치 (a, b)
        self.key = None
        self.log = []

    # ── 지형 묻기 ──
    def box_at(self, x, y):
        return any((bx, by) == (x, y) for bx, by, _ in self.boxes.values())
    def plate_held(self, tag):
        cells = self.g.find(tag)
        for (x, y) in cells:
            if any(pos == (x, y) for pos in self.p.values()): return True
            if self.box_at(x, y): return True
        return False
    def solid(self, x, y):
        ch = self.g.get(x, y)
        if ch == '#': return True
        if ch in 'AB': return ch.lower() not in self.latched
        if ch in 'PQ': return not self.plate_held(ch.lower())
        if self.box_at(x, y): return True
        return False
    def support(self, x, y):
        below = self.g.get(x, y + 1)
        here = self.g.get(x, y)
        # '=' 선반 · '><' 컨베이어 · 'v' 부서지는 발판 · 'H' 사다리 · 't' 리프트 위에는 선다
        return (self.solid(x, y + 1) or below in '=<>v' or here in 'Ht' or below in 'Ht')
    def free(self, x, y):
        # 가시 위에 서면 죽는다 — 걸어서 지나갈 수 없는 칸으로 친다
        if self.g.get(x, y) == '^' or self.g.get(x, y - 1) == '^': return False
        return not self.solid(x, y) and not self.solid(x, y - 1)
    def standable(self, x, y):
        return self.free(x, y) and self.support(x, y)

    # ── 걸음 ──
    def say(self, who, text):
        self.log.append((who, text))

    def walk(self, who, x1):
        x, y = self.p[who]
        step = 1 if x1 > x else -1
        gap = 0
        cx = x
        while cx != x1:
            cx += step
            if not self.free(cx, y):
                # 한 칸짜리 것(상자·낮은 턱)은 뛰어넘는다. 점프가 두 칸이라 한 칸 위로는 넘어간다.
                low = self.solid(cx, y) and not self.solid(cx, y - 1) and not self.solid(cx, y - 2) \
                      and self.g.get(cx, y) != '^'
                if low and cx != x1 and self.standable(cx + step, y):
                    self.say(who, f'{cx}칸의 상자를 뛰어넘는다'); cx += step; gap = 0; continue
                raise Bad(f'{who} 걷기 {x}→{x1} 줄{y}: {cx}칸이 막혀 있다 ({self.g.get(cx,y)}/{self.g.get(cx,y-1)})')
            if self.support(cx, y):
                gap = 0
            else:
                gap += 1
                if gap > JUMP_ACROSS: raise Bad(f'{who} 걷기 {x}→{x1}: {cx}칸 앞 구멍이 {gap}칸 — 못 뛴다')
        if not self.support(x1, y): raise Bad(f'{who} 걷기 끝 {x1}에 발판이 없다')
        self.p[who] = (x1, y)
        self.say(who, f'{"→" if step>0 else "←"} {x1}칸까지 걷는다')

    def jump(self, who, x1, y1, boost=0):
        x, y = self.p[who]
        if abs(x1 - x) > JUMP_ACROSS: raise Bad(f'{who} 점프 {x}→{x1}: 옆으로 {abs(x1-x)}칸은 못 뛴다')
        if y - y1 > JUMP_UP + boost: raise Bad(f'{who} 점프 {y}→{y1}: 위로 {y-y1}칸은 못 뛴다 (한도 {JUMP_UP+boost})')
        if not self.standable(x1, y1): raise Bad(f'{who} 점프 착지 ({x1},{y1})에 설 수 없다')
        self.p[who] = (x1, y1)
        self.say(who, f'({x1},{y1})로 {"올라" if y1<y else "내려"} 뛴다' + (f' — 어깨 {boost}명' if boost else ''))

    def boost(self, who, x1, y1, on):
        """on 에 적힌 사람들이 쌓여서 어깨를 내준다. 그 사람들은 who 옆 칸에 서 있어야 한다."""
        x, y = self.p[who]
        for o in on:
            ox, oy = self.p[o]
            if abs(ox - x) > 1 or oy != y: raise Bad(f'{o} 가 {who} 옆에 없다 ({ox},{oy}) vs ({x},{y})')
        self.jump(who, x1, y1, boost=len(on))

    def climb(self, who, y1):
        x, y = self.p[who]
        lo, hi = sorted((y, y1))
        for cy in range(lo, hi + 1):
            if cy == y1 and self.standable(x, y1): continue
            if self.g.get(x, cy) not in 'Ht' and self.g.get(x, cy + 1) not in 'Ht':
                raise Bad(f'{who} 사다리 {x}칸 줄{cy}에 사다리가 없다')
        self.p[who] = (x, y1)
        self.say(who, f'사다리로 줄{y1}까지 {"오른다" if y1<y else "내려간다"}')

    def drop_down(self, who, y1):
        """구멍으로 뛰어내린다. 밑에 닿을 때까지 비어 있어야 한다."""
        x, y = self.p[who]
        for cy in range(y + 1, y1 + 1):
            if self.solid(x, cy): raise Bad(f'{who} 뛰어내리기: ({x},{cy})가 막혀 있다')
        if not self.support(x, y1): raise Bad(f'{who} 뛰어내린 자리 ({x},{y1})에 바닥이 없다')
        self.p[who] = (x, y1)
        self.say(who, f'줄{y1}로 뛰어내린다')

    def push(self, box, x1, who):
        bx, by, w = self.boxes[box]
        if len(who) < w: raise Bad(f'{box} 는 {w}명이 밀어야 한다 ({len(who)}명)')
        step = 1 if x1 > bx else -1
        for o in who:
            ox, oy = self.p[o]
            if oy != by or (ox - bx) * step > 0: raise Bad(f'{o} 가 {box} 뒤에 서 있지 않다')
        cx = bx
        while cx != x1:
            cx += step
            if self.solid(cx, by): raise Bad(f'{box} 밀기: {cx}칸이 막혀 있다')
            if not self.support(cx, by):
                # 여기서 떨어진다 — drop 으로 이어 적어야 한다
                self.boxes[box] = (cx, by, w)
                for o in who: self.p[o] = (cx - step, by)
                self.say('+'.join(who), f'{box} 를 {cx}칸까지 밀어 구멍으로 떨어뜨린다')
                return
        self.boxes[box] = (x1, by, w)
        for o in who: self.p[o] = (x1 - step, by)
        self.say('+'.join(who), f'{box} 를 {x1}칸까지 민다')

    def fall(self, box, y1):
        bx, by, w = self.boxes[box]
        for cy in range(by + 1, y1 + 1):
            if self.solid(bx, cy): raise Bad(f'{box} 떨어지기: ({bx},{cy})가 막혀 있다')
        below = self.g.get(bx, y1 + 1)
        if not (self.solid(bx, y1 + 1) or below == '='): raise Bad(f'{box} 가 ({bx},{y1})에 앉을 바닥이 없다')
        self.boxes[box] = (bx, y1, w)
        self.say('', f'{box} 가 줄{y1}에 떨어져 앉는다')

    def portal(self, who, tag):
        x, y = self.p[who]
        if self.g.get(x, y) != tag: raise Bad(f'{who} 가 포탈 {tag} 위에 없다 ({x},{y}) 는 {self.g.get(x,y)}')
        other = tag.upper() if tag.islower() else tag.lower()
        (ox, oy), = self.g.find(other)
        if not self.support(ox, oy): raise Bad(f'포탈 {other} 나오는 자리에 바닥이 없다')
        self.p[who] = (ox, oy)
        self.say(who, f'포탈 {tag}→{other} 로 옮겨 간다')

    def box_portal(self, box, tag):
        bx, by, w = self.boxes[box]
        if self.g.get(bx, by) != tag: raise Bad(f'{box} 가 포탈 {tag} 위에 없다')
        other = tag.upper() if tag.islower() else tag.lower()
        (ox, oy), = self.g.find(other)
        self.boxes[box] = (ox, oy, w)
        self.say('', f'{box} 가 포탈 {tag}→{other} 로 넘어간다')

    def switch(self, who, tag):
        x, y = self.p[who]
        if self.g.get(x, y) != tag: raise Bad(f'{who} 가 스위치 {tag} 위에 없다 ({x},{y})')
        self.latched.add(tag)
        self.say(who, f'스위치 {tag} 를 밟는다 → 셔터 {tag.upper()} 가 열린 채 남는다')

    def need_plate(self, tag):
        if not self.plate_held(tag): raise Bad(f'누름판 {tag} 위에 아무것도 없다')
        self.say('', f'누름판 {tag} 가 눌려 셔터 {tag.upper()} 가 열려 있다')

    def spring(self, who, x1, y1):
        x, y = self.p[who]
        if self.g.get(x, y) != 'S' and self.g.get(x, y + 1) != 'S': raise Bad(f'{who} 가 스프링 위에 없다')
        if y - y1 > SPRING_UP: raise Bad(f'스프링으로 {y-y1}칸은 못 오른다')
        if abs(x1 - x) > JUMP_ACROSS: raise Bad('스프링 옆으로 너무 멀다')
        if not self.standable(x1, y1): raise Bad(f'스프링 착지 ({x1},{y1})에 설 수 없다')
        self.p[who] = (x1, y1)
        self.say(who, f'스프링으로 ({x1},{y1})까지 튀어 오른다')

    def take_key(self, who):
        (kx, ky), = self.g.find('K')
        if self.p[who] != (kx, ky): raise Bad(f'{who} 가 열쇠 자리 ({kx},{ky})에 없다: {self.p[who]}')
        self.key = who
        self.say(who, '열쇠를 집는다')

    def exit(self):
        (ox, oy), = self.g.find('O')
        if not self.key: raise Bad('열쇠를 아무도 안 들었다')
        for who, (x, y) in self.p.items():
            if abs(x - ox) > 2 or y != oy: raise Bad(f'{who} 가 포탈 O 에 없다 ({x},{y}) vs ({ox},{oy})')
        self.say('넷', '포탈 안에 다 모여 ⌥↑ — 다음 판')

def run(g, steps):
    r = Run(g)
    for s in steps:
        name, *args = s
        getattr(r, name)(*args)
    r.exit()
    return r
