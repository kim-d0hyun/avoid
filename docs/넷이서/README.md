# 넷이서 — 기획 자료

아티팩트: https://claude.ai/code/artifact/3d0c1480-176b-4891-96bd-a3f0e44c66cd

| 파일 | 무엇 |
|---|---|
| `grid.py` | 층이 있는 긴 판을 조각으로 쌓는 DSL (120 × 28 칸, 1·2·3층) |
| `stages.py` | 판 아홉 개 — 창고 · 지하철역 · 공사장 각 세 판. 맵 · 장면 · 풀이 · 팁 |
| `solve.py` | 풀이를 한 걸음씩 지형에 대 보는 검사. 전제가 깨지면 그 자리에서 터진다 |
| `run.py` | `python3 run.py` — 아홉 판 전부 확인 |
| `build.py` | 아티팩트 페이지를 만든다 (`python3 build.py` → `coop-plan3.html`) |

판을 고치면 `run.py` 를 돌린다. 나중에 `src/games/coop-stages.js` 는 `stages.py` 의 글자 그림을 그대로 옮긴다.
