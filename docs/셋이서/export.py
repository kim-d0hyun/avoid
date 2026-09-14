# stages.py → src/games/trio-stages.js. 판을 고치면 `python3 run.py` 로 확인하고 이걸 돌린다.
#
# 넷이서의 export.py 와 같은 일을 하되 **다른 경로**로 내보낸다 — 넷이서 판(coop-stages.js ·
# coop-moves.json)은 절대 건드리지 않는다.
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from stages import S, WORLDS
out = ["// 셋이서 — 판 열둘. docs/셋이서/stages.py 가 만든다. 손으로 고치지 않는다 (python3 export.py).\n",
       "//\n// 한 글자가 한 칸(42px). 글자의 뜻은 coop.js 에 있다 — 넷이서와 같은 타일 사전이다.\n\n",
       "export const WORLDS = " + json.dumps([{'name': n, 'line': d} for n, d in WORLDS], ensure_ascii=False, indent=2) + ";\n\n"]
rows = [{'world': s['world'], 'name': s['name'], 'shape': s['shape'], 'end': s['end'], 'pattern': s['pattern'],
         'scene': s['scene'], 'tips': s['tips'], 'w': s['size'][0], 'h': s['size'][1],
         'notes': [[x, y, t] for x, y, t in s['notes']], 'art': s['art'].split('\n'),
         'limit': s.get('limit', 0)} for s in S]
out.append("export const STAGES = " + json.dumps(rows, ensure_ascii=False, indent=1) + ";\n")
dst = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'games', 'trio-stages.js')
open(dst, 'w').write(''.join(out))
print('trio-stages.js', len(rows), '판')
# 풀이 원문 — GAME=trio node test/coop-play.mjs 가 이걸 읽어 실제 엔진에서 셋을 굴려 본다.
moves = [{'name': s['name'], 'world': s['world'], 'end': s['end'], 'moves': s['moves']} for s in S]
mdst = os.path.join(os.path.dirname(__file__), '..', '..', 'test', 'trio-moves.json')
open(mdst, 'w').write(json.dumps(moves, ensure_ascii=False, indent=0))
print('trio-moves.json', sum(len(m['moves']) for m in moves), '걸음')
