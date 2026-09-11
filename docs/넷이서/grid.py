# -*- coding: utf-8 -*-
"""층이 있는 긴 판을 조각으로 쌓는다.

한 칸 42px. 화면 하나가 36칸 × 22줄. 판은 그보다 넓고 높다 — 카메라가 사람마다 따라다닌다.
층 슬래브는 정해진 줄에 깐다: 1층 바닥 27, 2층 바닥 18, 3층 바닥 9. 각 층 머리 위 8칸.
"""
SCREEN_W, SCREEN_H = 36, 22
W, H = 120, 28
FLOOR = {1: 27, 2: 18, 3: 9}          # 그 층의 바닥(슬래브) 줄
def stand(f): return FLOOR[f] - 1     # 그 층에 서 있는 사람의 발 줄

SOLID = set('#')
ONEWAY = set('=')
LADDER = set('H')

class Grid:
    def __init__(self, w=W, h=H):
        self.w, self.h = w, h
        self.cells = [['.'] * w for _ in range(h)]
        self.notes = []                 # (x, y, 글) — 배경 소품. 부딛히지 않는다
    def put(self, x, y, ch):
        if 0 <= x < self.w and 0 <= y < self.h: self.cells[y][x] = ch
        return self
    def get(self, x, y):
        return self.cells[y][x] if 0 <= x < self.w and 0 <= y < self.h else '#'
    def fill(self, x0, y0, x1, y1, ch='#'):
        for y in range(max(0, y0), min(self.h, y1) + 1):
            for x in range(max(0, x0), min(self.w, x1) + 1):
                self.cells[y][x] = ch
        return self
    def frame(self):
        """바깥 벽. 왼쪽·오른쫀 끝과 천장, 맨 밑."""
        self.fill(0, 0, self.w - 1, 0); self.fill(0, self.h - 1, self.w - 1, self.h - 1)
        self.fill(0, 0, 0, self.h - 1); self.fill(self.w - 1, 0, self.w - 1, self.h - 1)
        return self
    def slab(self, f, x0=1, x1=None):
        """그 층의 바닥 한 줄."""
        x1 = self.w - 2 if x1 is None else x1
        return self.fill(x0, FLOOR[f], x1, FLOOR[f])
    def hole(self, f, x0, x1):
        """바닥에 뚫린 구멍. 밑 층으로 떨어진다 (죽지 않는다)."""
        return self.fill(x0, FLOOR[f], x1, FLOOR[f], '.')
    def ladder(self, x, f_lo, f_hi):
        """f_lo 층에서 f_hi 층으로 오르는 사다리. 위 층 바닥을 뚫는다."""
        for y in range(FLOOR[f_hi], FLOOR[f_lo]):
            self.put(x, y, 'H')
        return self
    def shelf(self, x0, x1, y):
        return self.fill(x0, y, x1, y, '=')
    def wall(self, x, y0, y1):
        return self.fill(x, y0, x, y1)
    def block(self, x0, y0, x1, y1):
        return self.fill(x0, y0, x1, y1)
    def spikes(self, x0, x1, y):
        return self.fill(x0, y, x1, y, '^')
    def spawn(self, x, f):
        y = stand(f)
        for i, ch in enumerate('1234'): self.put(x + i * 2, y, ch)
        return self
    def note(self, x, y, text):
        self.notes.append((x, y, text)); return self
    def art(self):
        return '\n'.join(''.join(r) for r in self.cells)
    def find(self, ch):
        return [(x, y) for y in range(self.h) for x in range(self.w) if self.cells[y][x] == ch]

def check(g, needs='1234KO'):
    bad = []
    a = g.art()
    for ch in needs:
        if a.count(ch) != 1: bad.append(f"'{ch}' {a.count(ch)}개")
    for pair in ('uU', 'wW'):
        n = [a.count(c) for c in pair]
        if n[0] != n[1] or n[0] > 1: bad.append(f'포탈 {pair} {n}')
    for sw in 'abpq':
        if a.count(sw) > 1: bad.append(f"'{sw}' 가 둘")
        if a.count(sw) == 1 and a.count(sw.upper()) == 0: bad.append(f"'{sw}' 는 있는데 '{sw.upper()}' 가 없다")
    return bad
