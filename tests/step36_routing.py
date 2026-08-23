import re, sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()
seg = s[s.index('## Step 3.6'):s.index('## Step 4:')]
rows = re.findall(r'\|\s*사용자가 (순서·단계·의존|경쟁·비교·품질)을 명시했다\s*\|\s*(.+?)\s*\|', seg)
if len(rows) != 2:
    print("  ✗ SKILL.md에서 신호 표를 읽지 못했다 — 표 구조가 바뀌었나?"); sys.exit(1)
signals = {k: [e.strip().strip('"') for e in v.split(',')] for k, v in rows}
allsig = signals['순서·단계·의존'] + signals['경쟁·비교·품질']

def route(r):
    return 'ASK' if any(x in r for x in allsig) else 'PARALLEL'

CASES = [
    # 신호 없음 → 묻지 않고 병렬 (과잉질문 가드)
    ("경쟁사 5곳 가격 정책을 각각 조사해줘", 'PARALLEL'),   # '경쟁'은 대상이지 방식이 아님
    ("경쟁 분석 리포트 3개 만들어줘",        'PARALLEL'),
    ("리포트 10개를 전부 요약해줘",           'PARALLEL'),
    ("컴포넌트 4개 동시에 만들어줘",          'PARALLEL'),
    # 순서 신호 → 되묻기
    ("스키마 먼저 잡고 그 다음 API를 만들어줘", 'ASK'),
    ("데이터 정제 A 끝나고 B 분석 돌려줘",     'ASK'),
    ("빌드 이후에 배포 스크립트 돌려줘",        'ASK'),
    ("1단계 결과로 2단계를 채워줘",            'ASK'),
    # 경쟁 신호 → 되묻기
    ("이 함수 여러 개 붙여서 제일 좋은 걸로 가줘", 'ASK'),
    ("두 접근법을 경쟁시켜 보고 더 나은 쪽 채택해줘", 'ASK'),
    ("codex랑 grok 대결시켜서 나은 거 써줘",   'ASK'),
    ("토너먼트로 구현해줘",                    'ASK'),
]
P = F = 0
print("\nStep 3.6 라우팅 규칙")
print("────────────────────────────────────────")
for req, want in CASES:
    got = route(req)
    if got == want:
        P += 1; print(f"  \033[0;32m✓\033[0m {want:9} ← {req}")
    else:
        F += 1; print(f"  \033[0;31m✗\033[0m 기대={want} 실제={got} ← {req}")

print("[게이트 불가 작업의 토너먼트 거부 지시]")
for need in ['게이트를 만들 수 없는', '병렬로 진행할게요', '게이트 없는 토너먼트는 실행하지 않는다']:
    if need in seg: P += 1; print(f"  \033[0;32m✓\033[0m {need!r}")
    else: F += 1; print(f"  \033[0;31m✗\033[0m 지시 없음: {need!r}")

print("────────────────────────────────────────")
print(f"{P} passed, {F} failed")
sys.exit(1 if F else 0)
