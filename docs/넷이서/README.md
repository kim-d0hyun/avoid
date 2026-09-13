# 넷이서 — 기획 자료 (6판)

아티팩트: https://claude.ai/code/artifact/3d0c1480-176b-4891-96bd-a3f0e44c66cd

| 파일 | 무엇 |
|---|---|
| `grid.py` | 판을 조각으로 쌓는 DSL. 크기는 판마다 다르다 (한 화면 · 가로로 긴 것 · 위로 긴 것 · 3층) |
| `stages.py` | 판 열넷 — 뒷마당 · 학교 · 도시 각 네 판, 지하철 두 판. 맵 · 장면 · 협동 방식 · 끝나는 조건 · 풀이 · 팁 · 시간 제한 |
| `solve.py` | 풀이를 한 걸음씩 지형에 대 보는 검사. 열쇠는 닿으면 집고(지나가려면 `hop`), 포탈은 지나가면 들어가고, 내려뛰기는 발판을 뚫지 못하고, 스위치 `a`·누름판 `p` `q` 는 셔터를 열거나 발판 `n` `M` `m` 을 낸다 |
| `run.py` | `python3 run.py` — 열네 판 전부 확인 |
| `export.py` | `stages.py` → `src/games/coop-stages.js`(판) + `test/coop-moves.json`(풀이 원문) |
| `../../test/coop-play.mjs` | **실제 엔진에서** 풀이를 키로 그대로 해 본다. `npm test` 에 들어 있다. 결과는 `play.json` |
| `build.py` | 아티팩트 페이지 (`python3 build.py` → `coop-plan7.html`) |
| `icons.py` · `views.py` | 지형지물 도감 SVG · 「각자 보는 화면」 네 장 |

참고한 것: 피코파크(Steam) · 주황버섯의 소개팅(워크래프트 3 유즈맵, 나무위키 맵 사진 1-1~1-8, 2-1~2-4).
판을 고치면 `run.py` → `export.py` → `npm test` 순으로 돌린다. `run.py` 는 어림값(칸)으로, `coop-play.mjs` 는 픽셀 물리로 본다 — 둘 다 지나야 판이다.
