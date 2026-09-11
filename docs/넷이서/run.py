# 열두 판의 풀이를 지형에 대 본다. 하나라도 깨지면 여기서 멈춘다.
from stages import S
for s in S:
    print(f"✓ {s['world']} · {s['name']}  {s['size'][0]}×{s['size'][1]}  {'한 명만' if s['end']=='one' else '넷 모두'}  {len(s['steps'])}걸음")
print(f"{len(S)}판 · {sum(len(s['steps']) for s in S)}걸음 확인")
