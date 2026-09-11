# stages.py → src/games/coop-stages.js. 판을 고치면 `python3 run.py` 로 확인하고 이걸 돌린다.
import json, os
from stages import S, WORLDS
out = ["// 넷이서 — 판 열둘. docs/넷이서/stages.py 가 만든다. 손으로 고치지 않는다 (python3 export.py).\n",
       "//\n// 한 글자가 한 칸(42px). 글자의 뜻은 coop.js 의 TILES 에 있다.\n\n",
       "export const WORLDS = " + json.dumps([{'name': n, 'line': d} for n, d in WORLDS], ensure_ascii=False, indent=2) + ";\n\n"]
rows = [{'world': s['world'], 'name': s['name'], 'shape': s['shape'], 'end': s['end'], 'pattern': s['pattern'],
         'scene': s['scene'], 'tips': s['tips'], 'w': s['size'][0], 'h': s['size'][1],
         'notes': [[x, y, t] for x, y, t in s['notes']], 'art': s['art'].split('\n'),
         'limit': 120 if s['name'] == '마지막' else 0} for s in S]
out.append("export const STAGES = " + json.dumps(rows, ensure_ascii=False, indent=1) + ";\n")
dst = os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'games', 'coop-stages.js')
open(dst, 'w').write(''.join(out))
print('coop-stages.js', len(rows), '판')
