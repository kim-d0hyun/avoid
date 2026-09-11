# -*- coding: utf-8 -*-
"""판을 조각으로 쌓는다. 크기는 판마다 다르다 — 한 화면짜리, 가로로 긴 것, 위로 긴 것.

한 칸 42px. 화면 하나가 36칸 × 22줄.

  #  땅·벽        =  선반(밑에서 통과)   H  사다리      ^  가시        S  스프링
  x  상자(1인)    X  무거운 상자(2인)
  r y b  빨강·노랑·파랑 열쇠 → 집으면 같은 색 블록 R Y B 가 사라진다
  a  스위치(밟으면 셔터 A 가 열린 채 남는다)     p q  누름판(밟는 동안만 P Q 가 열린다)
  u U · w W  포탈 한 쌍       -  왕복 발판이 오가는 길(어디서든 탈 수 있다)   |  리프트
  { }  통이 굴러 나오는 구멍(왼쪽/오른쪽으로)     >  <  컨베이어     v  삭은 발판
  ~  깜빡이는 발판 — 2초 켜지고 2초 꺼진다. 켜진 동안 건널 수 있는 폭이다
  1 2 3 4  시작 자리          O  출구 포탈
"""
SCREEN_W, SCREEN_H = 36, 22

class Grid:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.cells = [['.'] * w for _ in range(h)]
        self.notes = []
    def put(self, x, y, ch):
        if 0 <= x < self.w and 0 <= y < self.h: self.cells[y][x] = ch
        return self
    def get(self, x, y):
        return self.cells[y][x] if 0 <= x < self.w and 0 <= y < self.h else '#'
    def fill(self, x0, y0, x1, y1, ch='#'):
        for y in range(max(0, y0), min(self.h - 1, y1) + 1):
            for x in range(max(0, x0), min(self.w - 1, x1) + 1):
                self.cells[y][x] = ch
        return self
    def frame(self):
        self.fill(0, 0, self.w - 1, 0); self.fill(0, self.h - 1, self.w - 1, self.h - 1)
        self.fill(0, 0, 0, self.h - 1); self.fill(self.w - 1, 0, self.w - 1, self.h - 1)
        return self
    def ground(self, y, x0=1, x1=None):
        """y 줄부터 맨 밑까지 채운 땅."""
        x1 = self.w - 2 if x1 is None else x1
        return self.fill(x0, y, x1, self.h - 1)
    def slab(self, y, x0=1, x1=None):
        x1 = self.w - 2 if x1 is None else x1
        return self.fill(x0, y, x1, y)
    def hole(self, y, x0, x1):
        return self.fill(x0, y, x1, y, '.')
    def block(self, x0, y0, x1, y1, ch='#'):
        return self.fill(x0, y0, x1, y1, ch)
    def wall(self, x, y0, y1, ch='#'):
        return self.fill(x, y0, x, y1, ch)
    def shelf(self, x0, x1, y):
        return self.fill(x0, y, x1, y, '=')
    def ladder(self, x, y_top, y_bot):
        """y_top 줄(위 층 바닥)부터 y_bot 줄(아래 층 발 자리)까지 사다리."""
        return self.fill(x, y_top, x, y_bot, 'H')
    def lift(self, x, y_top, y_bot):
        return self.fill(x, y_top, x, y_bot, '|')
    def track(self, x0, x1, y):
        return self.fill(x0, y, x1, y, '-')
    def blink(self, x0, x1, y):
        return self.fill(x0, y, x1, y, '~')
    def spikes(self, x0, x1, y):
        return self.fill(x0, y, x1, y, '^')
    def stairs(self, x0, y_bottom, steps, dir=1, width=3):
        """계단. 바닥에서 위로 올라가는 층층대 — 주황버섯 맵의 그 계단."""
        for i in range(steps):
            x = x0 + dir * i * width
            xa, xb = sorted((x, x + dir * (width - 1)))
            self.fill(xa, y_bottom - i, xb, self.h - 1)
        return self
    def spawn(self, x, y, gap=2):
        for i, ch in enumerate('1234'): self.put(x + i * gap, y, ch)
        return self
    def note(self, x, y, text):
        self.notes.append((x, y, text)); return self
    def art(self):
        return '\n'.join(''.join(r) for r in self.cells)
    def find(self, ch):
        return [(x, y) for y in range(self.h) for x in range(self.w) if self.cells[y][x] == ch]

def check(g):
    a = g.art(); bad = []
    for ch in '1234O':
        if a.count(ch) != 1: bad.append(f"'{ch}' {a.count(ch)}개")
    for k, blk in (('r','R'), ('y','Y'), ('b','B')):
        if a.count(k) > 1: bad.append(f"열쇠 {k} 가 둘")
        if a.count(blk) and not a.count(k): bad.append(f"블록 {blk} 는 있는데 열쇠 {k} 가 없다")
    for pair in ('uU', 'wW'):
        n = [a.count(c) for c in pair]
        if n[0] != n[1] or n[0] > 1: bad.append(f'포탈 {pair} {n}')
    for sw in 'apq':
        if a.count(sw) > 1: bad.append(f"'{sw}' 가 둘")
        if a.count(sw) == 1 and a.count(sw.upper()) == 0: bad.append(f"'{sw}' 는 있는데 '{sw.upper()}' 가 없다")
    return bad
