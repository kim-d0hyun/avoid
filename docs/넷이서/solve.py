# -*- coding: utf-8 -*-
"""풀이를 한 걸음씩 지형에 대 본다 (색 열쇠 · 자동 낙하 · 출구 규칙 있는 판).

사람은 한 칸 폭 두 칸 높이. 점프는 두 칸 위 네 칸 옆. 어깨 한 명당 한 칸.
색 열쇠를 집으면 그 색 블록이 사라지고, 그 위에 있던 사람·상자는 떨어진다 —
주황버섯의 소개팅에서 가장 재미있던 규칙이라 그대로 가져왔다.
"""
JUMP_UP, JUMP_ACROSS, SPRING_UP = 2, 4, 5

class Bad(Exception): pass

class Run:
    def __init__(self, g, end='all'):
        self.g, self.end = g, end
        self.p = {ch: g.find(ch)[0] for ch in '1234'}
        self.boxes = {}
        for i, (x, y) in enumerate(g.find('x')): self.boxes[f'x{i}'] = (x, y, 1)
        for i, (x, y) in enumerate(g.find('X')): self.boxes[f'X{i}'] = (x, y, 2)
        self.latched = set()      # 밟은 스위치 a
        self.opened = set()       # 집은 색 열쇠 r y b
        self.log = []

    # ── 지형 ──
    def box_at(self, x, y): return any((bx, by) == (x, y) for bx, by, _ in self.boxes.values())
    def plate_held(self, tag):
        return any(any(pos == c for pos in self.p.values()) or self.box_at(*c) for c in self.g.find(tag))
    def solid(self, x, y):
        ch = self.g.get(x, y)
        if ch == '#': return True
        if ch in 'RYB': return ch.lower() not in self.opened
        if ch == 'A': return 'a' not in self.latched
        if ch in 'PQ': return not self.plate_held(ch.lower())
        return self.box_at(x, y)
    def support(self, x, y):
        below, here = self.g.get(x, y + 1), self.g.get(x, y)
        return self.solid(x, y + 1) or below in '=<>v-~' or here in 'H|' or below in 'H|'
    def free(self, x, y):
        if self.g.get(x, y) == '^' or self.g.get(x, y - 1) == '^': return False
        return not self.solid(x, y) and not self.solid(x, y - 1)
    def standable(self, x, y): return self.free(x, y) and self.support(x, y)
    def say(self, who, text): self.log.append((who, text))

    def settle(self):
        """바닥이 사라진 사람과 상자를 떨어뜨린다. 열쇠를 집은 뒤에 부른다."""
        for name in list(self.boxes):
            bx, by, w = self.boxes[name]
            while not (self.solid(bx, by + 1) or self.g.get(bx, by + 1) in '=<>v-~') and by < self.g.h - 2:
                by += 1
            if by != self.boxes[name][1]:
                self.boxes[name] = (bx, by, w); self.say('', f'{name} 가 줄{by}까지 떨어진다')
        for who, (x, y) in list(self.p.items()):
            ny = y
            while not self.support(x, ny) and ny < self.g.h - 2: ny += 1
            if ny != y:
                if self.g.get(x, ny) == '^': raise Bad(f'{who} 가 떨어져 가시에 닿는다 ({x},{ny})')
                self.p[who] = (x, ny); self.say(who, f'발판이 사라져 줄{ny}로 떨어진다')

    # ── 열쇠는 닿으면 집는다 (엔진이 그렇다). 지나가는 길에 있으면 걷기는 실패 — take 로 집거나 hop 으로 넘는다.
    def key_at(self, x, y):
        for cy in (y, y - 1):
            ch = self.g.get(x, cy)
            if ch in 'ryb' and ch not in self.opened: return ch
        return None
    def touch(self, who):
        x, y = self.p[who]; k = self.key_at(x, y)
        if k: self.take(who, k)

    # ── 걸음 ──
    def walk(self, who, x1):
        x, y = self.p[who]; step = 1 if x1 > x else -1; gap = 0; cx = x
        while cx != x1:
            cx += step
            k = self.key_at(cx, y)
            if k and cx != x1: raise Bad(f'{who} 걷기 {x}→{x1}: {cx}칸의 {k} 열쇠에 닿아 집게 된다 — take 로 집거나 hop 으로 넘는다')
            if self.g.get(cx, y) in 'uUwW' and cx != x1: raise Bad(f'{who} 걷기 {x}→{x1}: {cx}칸의 포탈에 들어가 버린다 — portal 로 타거나 hop 으로 넘는다')
            if not self.free(cx, y):
                low = (self.solid(cx, y) and not self.solid(cx, y - 1) and not self.solid(cx, y - 2)
                       and self.g.get(cx, y) != '^')
                if low and cx != x1 and self.standable(cx + step, y):
                    self.say(who, f'{cx}칸의 것을 뛰어넘는다'); cx += step; gap = 0; continue
                raise Bad(f'{who} 걷기 {x}→{x1} 줄{y}: {cx}칸이 막혀 있다 ({self.g.get(cx,y)}/{self.g.get(cx,y-1)})')
            if self.support(cx, y): gap = 0
            else:
                gap += 1
                if gap > JUMP_ACROSS: raise Bad(f'{who} 걷기 {x}→{x1}: {cx}칸 앞 구멍이 {gap}칸')
        if not self.support(x1, y): raise Bad(f'{who} 걷기 끝 {x1}에 발판이 없다')
        self.p[who] = (x1, y); self.say(who, f'{"→" if step > 0 else "←"} {x1}칸까지 걷는다')
        self.touch(who)

    def hop(self, who, x1):
        """제자리 높이로 뛰어 넘는다 — 길에 놓인 열쇠를 안 집고 지나가려고. 옆으로 네 칸까지, 머리 위가 비어야."""
        x, y = self.p[who]; step = 1 if x1 > x else -1
        if abs(x1 - x) > JUMP_ACROSS: raise Bad(f'{who} 뛰어넘기 {x}→{x1}: 옆으로 {abs(x1-x)}칸')
        for cx in range(x + step, x1, step):
            if self.solid(cx, y - 1) or self.solid(cx, y - 2) or self.solid(cx, y - 3):
                raise Bad(f'{who} 뛰어넘기 {x}→{x1}: {cx}칸 위가 막혀 있다')
        if not self.standable(x1, y): raise Bad(f'{who} 뛰어넘기 착지 ({x1},{y})에 설 수 없다')
        self.p[who] = (x1, y); self.say(who, f'{x1}칸으로 뛰어 넘는다 — 열쇠를 안 집고')
        self.touch(who)

    def jump(self, who, x1, y1, boost=0):
        x, y = self.p[who]
        if abs(x1 - x) > JUMP_ACROSS: raise Bad(f'{who} 점프 {x}→{x1}: 옆으로 {abs(x1-x)}칸')
        if y - y1 > JUMP_UP + boost: raise Bad(f'{who} 점프 ({x},{y})→({x1},{y1}): 위로 {y-y1}칸 (한도 {JUMP_UP+boost})')
        if y1 > y:
            # 내려뛰기 — 서 있는 발판을 뚫고 내려갈 수는 없다. 착지 기둥(x1) 이 내 발 밑줄부터 착지 줄까지 비어 있어야 한다.
            for cy in range(y + 1, y1 + 1):
                ch = self.g.get(x1, cy)
                if self.solid(x1, cy) or ch in '=~v-<>S': raise Bad(f'{who} 내려뛰기 ({x},{y})→({x1},{y1}): ({x1},{cy}) 가 막는다 — 발판 가장자리 밖으로 뛰어야 한다')
        if not self.standable(x1, y1): raise Bad(f'{who} 점프 착지 ({x1},{y1})에 설 수 없다')
        self.p[who] = (x1, y1)
        self.say(who, f'({x1},{y1})로 {"올라" if y1 < y else "내려"} 뛴다' + (f' — 어깨 {boost}명' if boost else ''))
        self.touch(who)

    def boost(self, who, x1, y1, on):
        x, y = self.p[who]
        for o in on:
            ox, oy = self.p[o]
            if abs(ox - x) > 1 or oy != y: raise Bad(f'{o} 가 {who} 옆에 없다 ({ox},{oy}) vs ({x},{y})')
        self.jump(who, x1, y1, boost=len(on))

    def climb(self, who, y1):
        x, y = self.p[who]; lo, hi = sorted((y, y1))
        for cy in range(lo, hi + 1):
            if cy == y1 and self.standable(x, y1): continue
            if self.g.get(x, cy) not in 'H|' and self.g.get(x, cy + 1) not in 'H|':
                raise Bad(f'{who} 사다리 {x}칸 줄{cy}에 사다리·리프트가 없다')
        self.p[who] = (x, y1); self.say(who, f'{"사다리" if self.g.get(x, y) == "H" else "리프트"}로 줄{y1}까지')

    def push(self, box, x1, who):
        bx, by, w = self.boxes[box]
        if len(who) < w: raise Bad(f'{box} 는 {w}명이 밀어야 한다')
        step = 1 if x1 > bx else -1
        for o in who:
            ox, oy = self.p[o]
            if oy != by or (ox - bx) * step > 0: raise Bad(f'{o} 가 {box} 뒤에 서 있지 않다 ({ox},{oy})')
        cx = bx
        while cx != x1:
            cx += step
            if self.solid(cx, by): raise Bad(f'{box} 밀기: {cx}칸이 막혀 있다')
            if not (self.solid(cx, by + 1) or self.g.get(cx, by + 1) in '=<>v-~'):
                self.boxes[box] = (cx, by, w)
                for o in who: self.p[o] = (cx - step, by)
                self.say('+'.join(who), f'{box} 를 {cx}칸까지 밀어 구멍으로 떨어뜨린다')
                self.settle(); return
        self.boxes[box] = (x1, by, w)
        for o in who: self.p[o] = (x1 - step, by)
        self.say('+'.join(who), f'{box} 를 {x1}칸까지 민다')

    def ride(self, box, x1):
        """무빙워크 위의 상자는 혼자 간다 — 그 방향의 '>' '<' 칸을 따라, 막히는 데까지."""
        bx, by, w = self.boxes[box]
        belt = self.g.get(bx, by + 1)
        if belt not in '<>': raise Bad(f'{box} 가 무빙워크 위에 없다 ({bx},{by}) 밑은 {belt}')
        step = 1 if belt == '>' else -1
        if (x1 - bx) * step <= 0: raise Bad(f'{box} 는 무빙워크가 {"오른쪽" if step > 0 else "왼쪽"}으로 간다 — {x1}칸은 반대다')
        cx = bx
        while cx != x1:
            if self.solid(cx + step, by): raise Bad(f'{box} 실려 가기: {cx+step}칸이 막혀 있다')
            if self.g.get(cx + step, by + 1) not in '<>' and not self.solid(cx + step, by + 1): raise Bad(f'{box} 실려 가기: {cx+step}칸 밑에 바닥이 없다')
            cx += step
        if not self.solid(x1 + step, by) and self.g.get(x1, by + 1) in '<>': raise Bad(f'{box} 는 {x1}칸에서 안 선다 — 막는 것이 없다')
        self.boxes[box] = (x1, by, w); self.say('', f'{box} 가 무빙워크에 실려 {x1}칸까지 간다')

    def portal(self, who, tag):
        x, y = self.p[who]
        if self.g.get(x, y) != tag: raise Bad(f'{who} 가 포탈 {tag} 위에 없다 ({x},{y})')
        other = tag.swapcase(); (ox, oy), = self.g.find(other)
        if not self.support(ox, oy): raise Bad(f'포탈 {other} 나오는 자리에 바닥이 없다')
        self.p[who] = (ox, oy); self.say(who, f'포탈 {tag}→{other}')

    def box_portal(self, box, tag):
        bx, by, w = self.boxes[box]
        if self.g.get(bx, by) != tag: raise Bad(f'{box} 가 포탈 {tag} 위에 없다')
        (ox, oy), = self.g.find(tag.swapcase())
        self.boxes[box] = (ox, oy, w); self.say('', f'{box} 가 포탈 {tag}→{tag.swapcase()} 로'); self.settle()

    def switch(self, who):
        x, y = self.p[who]
        if self.g.get(x, y) != 'a': raise Bad(f'{who} 가 스위치 위에 없다 ({x},{y})')
        self.latched.add('a'); self.say(who, '스위치를 밟는다 → 셔터 A 가 열린 채 남는다')

    def need_plate(self, tag):
        if not self.plate_held(tag): raise Bad(f'누름판 {tag} 위에 아무것도 없다')
        held_by = [w for w, pos in self.p.items() if pos in self.g.find(tag)]
        self.say('', f'누름판 {tag} 가 눌려 셔터 {tag.upper()} 가 열려 있다' + (f' ({"·".join(held_by)} 가 밟고 있다)' if held_by else ' (상자)'))

    def spring(self, who, x1, y1):
        x, y = self.p[who]
        if self.g.get(x, y) != 'S' and self.g.get(x, y + 1) != 'S': raise Bad(f'{who} 가 스프링 위에 없다 ({x},{y})')
        if y - y1 > SPRING_UP or abs(x1 - x) > JUMP_ACROSS: raise Bad('스프링으로 못 닿는다')
        if not self.standable(x1, y1): raise Bad(f'스프링 착지 ({x1},{y1})에 설 수 없다')
        self.p[who] = (x1, y1); self.say(who, f'스프링으로 ({x1},{y1})까지')

    def pull(self, who, by_whom):
        """위에 선 사람이 손을 내밀어 끌어올린다. 세 칸 아래까지, 바로 옆 칸이어야 한다."""
        x, y = self.p[who]; ux, uy = self.p[by_whom]
        if abs(ux - x) > 1: raise Bad(f'{by_whom} 가 {who} 바로 위쫀에 없다 ({ux},{uy}) vs ({x},{y})')
        if not (0 < y - uy <= 3): raise Bad(f'{by_whom} 가 {who} 보다 1~3칸 위에 있어야 한다 ({y-uy})')
        if not self.standable(ux, uy): raise Bad(f'{by_whom} 가 설 자리가 아니다')
        # 엔진은 손 닿는 데(옆 한 칸 · 아래 세 칸) 있는 사람 중 **가장 가까운** 사람을 끌어올린다. 다른 사람이 그 안에 서 있으면 그쪽이 끌려온다.
        for o, (ox, oy) in self.p.items():
            if o in (who, by_whom): continue
            if abs(ox - ux) <= 1 and 0 < oy - uy <= 3: raise Bad(f'{by_whom} 손 닿는 자리에 {o} 도 있다 ({ox},{oy}) — {who} 대신 끌려올 수 있다. 비켜 서야 한다')
        # 끌어올린 사람은 끌어 준 사람 옆에 선다 (같은 칸이면 그 칸)
        land = None
        for lx in (ux + (1 if ux >= x else -1), ux, ux - (1 if ux >= x else -1)):
            if self.standable(lx, uy): land = lx; break
        if land is None: raise Bad(f'{who} 가 올라설 자리가 없다 ({ux},{uy}) 근처')
        self.p[who] = (land, uy); self.say(by_whom, f'{who} 의 손을 잡아 ({land},{uy})로 끌어올린다')

    def stairs(self, who, x1, y1, on):
        """사람 계단. on 에 적힌 사람들이 웅크린 채 층층이 걸쳐 앉아 있고, who 가 그 위를 밟고 올라가 뛴다.
        한 명이 한 칸씩 더 준다 — 어깨(boost)와 높이는 같지만, **옆으로도** 그만큼 더 간다 (계단을 밟으며 나아가니까)."""
        x, y = self.p[who]
        for i, o in enumerate(on):
            ox, oy = self.p[o]
            if oy != y or abs(ox - x) > i + 1: raise Bad(f'계단 {o} 가 제자리에 없다 ({ox},{oy}); {who} 는 ({x},{y})')
        n = len(on)
        if abs(x1 - x) > JUMP_ACROSS + n: raise Bad(f'{who} 사람 계단: 옆으로 {abs(x1-x)}칸 (한도 {JUMP_ACROSS+n})')
        if y - y1 > JUMP_UP + n: raise Bad(f'{who} 사람 계단: 위로 {y-y1}칸 (한도 {JUMP_UP+n})')
        if not self.standable(x1, y1): raise Bad(f'{who} 사람 계단 착지 ({x1},{y1})에 설 수 없다')
        self.p[who] = (x1, y1); self.say(who, f'{"·".join(on)} 을 계단처럼 밟고 ({x1},{y1})로 건너뛴다')

    def take(self, who, color):
        x, y = self.p[who]
        if color in self.opened: return                     # 걸어 들어오며 이미 집었다
        if self.g.get(x, y) != color and self.g.get(x, y - 1) != color: raise Bad(f'{who} 가 {color} 열쇠 자리에 없다 ({x},{y}) 는 {self.g.get(x,y)}')
        self.opened.add(color)
        name = {'r': '빨간', 'y': '노란', 'b': '파란'}[color]
        self.say(who, f'{name} 열쇠를 집는다 → {name} 블록이 전부 사라진다')
        self.settle()

    def finish(self):
        (ox, oy), = self.g.find('O')
        inside = [w for w, (x, y) in self.p.items() if abs(x - ox) <= 2 and y == oy]
        if self.end == 'all' and len(inside) < 4:
            out = [w for w in self.p if w not in inside]
            raise Bad(f'넷이 다 출구에 없다 — {out} 는 {[self.p[w] for w in out]}')
        if self.end == 'one' and not inside: raise Bad('아무도 출구에 없다')
        self.say('·'.join(inside), '출구 포탈에서 ⌥↑ — ' + ('넷이 다 모였다' if self.end == 'all' else '한 명이 닿았으니 끝'))

def run(g, steps, end='all'):
    r = Run(g, end)
    for name, *args in steps: getattr(r, name)(*args)
    r.finish(); return r
