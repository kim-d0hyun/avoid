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
        self.rallied = False
        self.timed = False
        self.ladder_open = False
        self.tower_done = False     # 탑 감지기 i → 문 I
        self.signaled = False       # 신호탑 z 앞에서 누가 신호를 봤다
        self.signal_open = False    # 신호 버튼 d f g 를 맞게 눌렀다 → 문 Z
        # 승강기 — V(둘) · N(전원). 한 기둥이 한 대. 아래 승강장은 맨 아래 칸(y1) 줄, 위 승강장은 맨 위 칸(y0) 바로 위 줄.
        self.lifts = []
        for ch in 'VN':
            for (x, y) in g.find(ch):
                l = next((l for l in self.lifts if l['x'] == x and l['y1'] == y - 1), None)
                if l: l['y1'] = y
                else: self.lifts.append({'x': x, 'y0': y, 'y1': y, 'all': ch == 'N', 'top': False})
        self.log = []

    # ── 지형 ──
    def box_at(self, x, y): return any((bx, by) == (x, y) for bx, by, _ in self.boxes.values())
    COUNT_NEED = {'k': 2, 'e': 3}
    def plate_held(self, tag):
        if tag in self.COUNT_NEED:   # 사람 수 누름판 — 서로 다른 사람 N명 이상, 상자는 안 센다
            tiles = self.g.find(tag)
            return sum(1 for pos in self.p.values() if pos in tiles) >= self.COUNT_NEED[tag]
        return any(any(pos == c for pos in self.p.values()) or self.box_at(*c) for c in self.g.find(tag))
    def belt_dir(self, ch):
        if ch == '>': return 1
        if ch == '<': return -1
        if ch == 'J': return 1 if self.plate_held('p') else -1   # 분기 벨트 — 누름판을 밟는 동안 오른쪽, 아니면 회수 쪽
        if ch == 'j': return 1 if self.plate_held('q') else -1
        return 0
    def lift_under(self, x, y):
        """(x, y) 에 선 사람을 받치는 승강기 발판. 아래에 있으면 땅이 받치니 위 승강장만 본다."""
        for l in self.lifts:
            if l['top'] and abs(x - l['x']) <= 1 and y + 1 == l['y0']: return l
        return None
    def solid(self, x, y):
        ch = self.g.get(x, y)
        if ch == '#': return True
        if ch in 'RYB': return ch.lower() not in self.opened
        if ch == 'A': return 'a' not in self.latched
        if ch == 'n': return 'a' in self.latched          # 스위치로 나오는 발판
        if ch == 'M': return self.plate_held('p')          # 누름판으로 나오는 발판
        if ch == 'm': return self.plate_held('q')
        if ch in 'PQ': return not self.plate_held(ch.lower())
        if ch == 'C': return not self.rallied
        if ch == 'T': return not self.timed
        if ch == 'K': return not self.plate_held('k')
        if ch == 'E': return not self.plate_held('e')
        if ch == 'I': return not self.tower_done
        if ch == 'Z': return not self.signal_open
        return self.box_at(x, y)
    def support(self, x, y):
        below, here = self.g.get(x, y + 1), self.g.get(x, y)
        ladder = 'H|' + ('L' if self.ladder_open else '')
        return (self.solid(x, y + 1) or below in '=<>v-~Jj' or here in ladder or below in ladder
                or self.lift_under(x, y) is not None)
    def free(self, x, y):
        if self.g.get(x, y) == '^' or self.g.get(x, y - 1) == '^': return False
        return not self.solid(x, y) and not self.solid(x, y - 1)
    def standable(self, x, y): return self.free(x, y) and self.support(x, y)
    def say(self, who, text): self.log.append((who, text))

    def settle(self):
        """바닥이 사라진 사람과 상자를 떨어뜨린다. 열쇠를 집은 뒤에 부른다."""
        for name in list(self.boxes):
            bx, by, w = self.boxes[name]
            while not (self.solid(bx, by + 1) or self.g.get(bx, by + 1) in '=<>v-~Jj') and by < self.g.h - 2:
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
                if self.solid(x1, cy) or ch in '=~v-<>SJj': raise Bad(f'{who} 내려뛰기 ({x},{y})→({x1},{y1}): ({x1},{cy}) 가 막는다 — 발판 가장자리 밖으로 뛰어야 한다')
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
        ladder = 'H|' + ('L' if self.ladder_open else '')
        for cy in range(lo, hi + 1):
            if cy == y1 and self.standable(x, y1): continue
            if self.g.get(x, cy) not in ladder and self.g.get(x, cy + 1) not in ladder:
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
            if not (self.solid(cx, by + 1) or self.g.get(cx, by + 1) in '=<>v-~Jj'):
                self.boxes[box] = (cx, by, w)
                for o in who: self.p[o] = (cx - step, by)
                self.say('+'.join(who), f'{box} 를 {cx}칸까지 밀어 구멍으로 떨어뜨린다')
                self.settle(); return
        self.boxes[box] = (x1, by, w)
        for o in who: self.p[o] = (x1 - step, by)
        self.say('+'.join(who), f'{box} 를 {x1}칸까지 민다')

    def ride(self, box, x1):
        """무빙워크 위의 상자는 혼자 간다 — 그 방향의 벨트 칸을 따라, 막히는 데까지. 분기 벨트 J·j 는 누름판 p·q 가
        눌린 동안 오른쪽, 아니면 왼쪽(회수)으로 돈다. 벨트 위 누름판 p·q 에 든 상자는 거기 선다 (상자 정차대)."""
        bx, by, w = self.boxes[box]
        step = self.belt_dir(self.g.get(bx, by + 1))
        if not step: raise Bad(f'{box} 가 무빙워크 위에 없다 ({bx},{by}) 밑은 {self.g.get(bx, by + 1)}')
        if (x1 - bx) * step <= 0: raise Bad(f'{box} 는 무빙워크가 {"오른쪽" if step > 0 else "왼쪽"}으로 간다 — {x1}칸은 반대다')
        cx = bx
        while cx != x1:
            if self.g.get(cx, by) in 'pq' and cx != bx: raise Bad(f'{box} 실려 가기: {cx}칸 누름판에서 선다 — {x1}칸까지 안 간다')
            if self.solid(cx + step, by): raise Bad(f'{box} 실려 가기: {cx+step}칸이 막혀 있다')
            if self.belt_dir(self.g.get(cx + step, by + 1)) == 0 and not self.solid(cx + step, by + 1): raise Bad(f'{box} 실려 가기: {cx+step}칸 밑에 바닥이 없다')
            cx += step
        parks = self.g.get(x1, by) in 'pq'
        if not parks and not self.solid(x1 + step, by) and self.belt_dir(self.g.get(x1, by + 1)): raise Bad(f'{box} 는 {x1}칸에서 안 선다 — 막는 것이 없다')
        self.boxes[box] = (x1, by, w); self.say('', f'{box} 가 무빙워크에 실려 {x1}칸까지 간다' + (' — 누름판에 선다' if parks else ''))

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
        self.latched.add('a'); self.say(who, '스위치를 밟는다 → ' + ('셔터 A 가 열린 채 남는다' if self.g.find('A') else '발판 n 이 나온 채 남는다'))

    def need_plate(self, tag):
        if not self.plate_held(tag): raise Bad(f'누름판 {tag} 위에 아무것도 없다')
        held_by = [w for w, pos in self.p.items() if pos in self.g.find(tag)]
        what = ('셔터 ' + tag.upper() + ' 가 열려 있다') if self.g.find(tag.upper()) else ('발판 ' + ('M' if tag == 'p' else 'm') + ' 이 나와 있다')
        self.say('', f'누름판 {tag} 가 눌려 {what}' + (f' ({"·".join(held_by)} 가 밟고 있다)' if held_by else ' (상자)'))

    def rally(self):
        if not all(pos in self.g.find('c') for pos in self.p.values()): raise Bad('전원이 집결판 c 위에 있지 않다')
        self.rallied = True; self.say('1·2·3·4', '전원 집결 → 체크포인트 저장, 집결문 C 개방')

    def timer(self, who):
        if self.p[who] not in self.g.find('t'): raise Bad(f'{who} 가 시한 스위치 t 위에 없다')
        self.timed = True; self.say(who, '시한 스위치 → 10초 동안 T 개방')

    def deploy(self, who):
        if self.p[who] not in self.g.find('l'): raise Bad(f'{who} 가 구조 레버 l 위에 없다')
        self.ladder_open = True; self.say(who, '구조 레버 → 접이식 사다리 L 전개')

    def lift(self, *who):
        """승강기 — who 가 다 아래 승강장 발판(기둥 좌우 한 칸 안, 맨 아래 칸 줄)에 서 있고 정원(V 둘 · N 전원)이 차면
        다 같이 위 승강장으로 오른다. 내리면 빈 승강기는 도로 내려간다."""
        who = list(who)
        x0, y0 = self.p[who[0]]
        l = next((l for l in self.lifts if abs(x0 - l['x']) <= 2 and y0 == l['y1']), None)
        if l is None: raise Bad(f'{who[0]} 가 승강기 아래 승강장에 없다 ({x0},{y0})')
        need = 4 if l['all'] else 2
        # 정원만큼 딱 탄다 — V 는 둘이 0.3초 서면 떠난다. 셋째가 늦게 오르려다 놓치는 풀이는 실제로 안 된다.
        if len(who) != need: raise Bad(f'승강기 ({l["x"]}칸) 는 {need}명이 타야 한다 — {len(who)}명')
        for w in who:
            x, y = self.p[w]
            # 넷이 세 칸 발판에 서려면 몸이 가장자리에 걸친다 — 발판 옆 한 칸까지는 탄 것으로 친다 (봇은 발판 위 자리로 올린다)
            if abs(x - l['x']) > 2 or y != l['y1']: raise Bad(f'{w} 가 승강기 발판 곁에 없다 ({x},{y})')
        for cy in range(l['y0'] - 2, l['y1'] + 1):
            for cx in range(l['x'] - 1, l['x'] + 2):
                if self.solid(cx, cy): raise Bad(f'승강기 길 ({cx},{cy}) 이 막혀 있다')
        l['top'] = True
        for w in who:
            x, y = self.p[w]; self.p[w] = (x, l['y0'] - 1)
        self.say('·'.join(who), f'승강기로 줄{l["y0"] - 1}까지 오른다')

    def after_step(self):
        """위 승강장이 비면 승강기는 도로 내려간다."""
        for l in self.lifts:
            if l['top'] and not any(abs(x - l['x']) <= 1 and y == l['y0'] - 1 for x, y in self.p.values()):
                l['top'] = False

    def tower(self, who, on):
        """전원 탑 — on 이 who 옆에 서고, 층층이 올라선 맨 위의 who 몸이 감지기 i 에 닿는다. 문 I 가 열린 채 남는다.
        who 는 다시 내려와 제자리에 선다 (공중에서 스치는 것으로는 안 켜진다 — 엔진이 발밑 사슬을 센다)."""
        x, y = self.p[who]
        if len(on) + 1 < 4: raise Bad(f'탑은 전원이 쌓아야 한다 — {len(on) + 1}명')
        for o in on:
            ox, oy = self.p[o]
            if abs(ox - x) > 1 or oy != y: raise Bad(f'{o} 가 {who} 옆에 없다 ({ox},{oy}) vs ({x},{y})')
        n = len(on)
        feet = (y + 1) * 42 - 53 * n
        rows = {(feet - 6) // 42, (feet - 44) // 42}
        hit = [(sx, sy) for sx, sy in self.g.find('i') if abs(sx - x) <= 1 and sy in rows]
        if not hit: raise Bad(f'{who} 탑 꼭대기(줄 {sorted(rows)}) 가 감지기 i 에 안 닿는다 — 감지기는 {self.g.find("i")}')
        for cy in range(min(rows), y):
            if self.solid(x, cy): raise Bad(f'탑 자리 ({x},{cy}) 위가 막혀 있다')
        self.tower_done = True; self.say(who, f'{"·".join(on)} 위로 올라가 감지기에 닿는다 → 문 I 가 열린 채 남는다')

    def signal(self, who):
        """신호탑 z 앞(가로 세 칸·세로 두 줄 안)에서 지금 신호를 본다. 누르는 사람에게 말로 전한다."""
        (zx, zy), = self.g.find('z')
        x, y = self.p[who]
        if abs(x - zx) > 3 or abs(y - zy) > 2: raise Bad(f'{who} 가 신호탑 앞에 없다 ({x},{y}) — 신호탑 ({zx},{zy})')
        self.signaled = True; self.say(who, '신호탑의 모양을 읽어 준다')

    def choose(self, who):
        """신호 버튼 d f g 가운데 들은 것을 ⌥↓ 로 누른다 → 신호문 Z 가 열린 채 남는다. 셋 다 설 수 있어야 한다."""
        if not self.signaled: raise Bad('신호를 본 사람이 없다 — 먼저 signal')
        x, y = self.p[who]
        spots = {ch: self.g.find(ch)[0] for ch in 'dfg'}
        near = [ch for ch, (bx, by) in spots.items() if by == y and abs(bx - x) <= 6]
        if len(near) < 3: raise Bad(f'{who} 곁에 신호 버튼 셋이 다 있지 않다 ({x},{y}) — {spots}')
        for ch, (bx, by) in spots.items():
            if not self.standable(bx, by): raise Bad(f'신호 버튼 {ch} ({bx},{by}) 에 설 수 없다')
        self.signal_open = True; self.say(who, '들은 모양의 버튼을 누른다 → 신호문 Z 가 열린 채 남는다')

    def sync(self):
        """맞춤 — 지형에는 아무 일도 없다. 동시 봇에게 「앞 걸음이 다 끝난 뒤에 다음을 시작한다」를 알린다
        (한 사다리를 여럿이 줄지어 오를 때, 한 명씩 건너야 하는 곳)."""
        pass

    def spring(self, who, x1, y1):
        x, y = self.p[who]
        if self.g.get(x, y) != 'S' and self.g.get(x, y + 1) != 'S': raise Bad(f'{who} 가 스프링 위에 없다 ({x},{y})')
        if y - y1 > SPRING_UP or abs(x1 - x) > JUMP_ACROSS: raise Bad('스프링으로 못 닿는다')
        if not self.standable(x1, y1): raise Bad(f'스프링 착지 ({x1},{y1})에 설 수 없다')
        self.p[who] = (x1, y1); self.say(who, f'스프링으로 ({x1},{y1})까지')

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
    for name, *args in steps:
        getattr(r, name)(*args)
        r.after_step()
    r.finish(); return r
