# 넷이서 — 기획 자료 (5판)

아티팩트: https://claude.ai/code/artifact/3d0c1480-176b-4891-96bd-a3f0e44c66cd

| 파일 | 무엇 |
|---|---|
| `grid.py` | 판을 조각으로 쌓는 DSL. 크기는 판마다 다르다 (한 화면 · 가로로 긴 것 · 위로 긴 것 · 3층) |
| `stages.py` | 판 열둘 — 뒷마당 · 학교 · 도시 각 네 판. 맵 · 장면 · 협동 방식 · 끝나는 조건 · 풀이 · 팁 |
| `solve.py` | 풀이를 한 걸음씩 지형에 대 보는 검사. 색 열쇠로 블록이 사라지면 그 위의 사람·상자를 떨어뜨린다 |
| `run.py` | `python3 run.py` — 열두 판 전부 확인 |
| `build.py` | 아티팩트 페이지 (`python3 build.py` → `coop-plan5.html`) |
| `icons.py` · `views.py` | 지형지물 도감 SVG · 「각자 보는 화면」 네 장 |

참고한 것: 피코파크(Steam) · 주황버섯의 소개팅(워크래프트 3 유즈맵, 나무위키 맵 사진 1-1~1-8, 2-1~2-4).
판을 고치면 `run.py` 를 돌린다. `src/games/coop-stages.js` 는 `stages.py` 의 글자 그림을 그대로 옮긴다.
