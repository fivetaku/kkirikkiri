#!/bin/bash
# gate-done.sh — Stop 훅: 열린 런 장부(outcome=null, work.repo 지정)가 cwd에 있으면 done-gate를 돌려
# 무행동 종료를 증적 없이 통과시키지 않는다. 위반 시 exit 2 → 종료 차단 + 사유 전달. (v0.24.0)
# 가드: cwd/.kkirikkiri/runs 가 없으면 즉시 exit 0. stop_hook_active=true(이미 훅으로 재개된 턴)면 무한 차단 방지로 exit 0.
INPUT=$(cat)
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
command -v node >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

# stop_hook_active(훅으로 재개된 턴의 종료)면 **평가는 하되 차단은 하지 않는다** — 최종 상태를 장부·로그에 남기기 위해 (R4 실측: 조기 exit 0은 최종 판정 공백을 만들었다)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET=$(python3 -B - "$INPUT" "$SCRIPT_DIR" << 'PY'
import json, sys, os
sys.path.insert(0, sys.argv[2])
from gate_ledger import resolve_ledger, session_id
try:
    d = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)
cwd = d.get("cwd") or os.getcwd()
target = resolve_ledger(cwd, session_id(d))
if target:
    path, ledger = target
    work = ledger.get("work") or {}
    repo = work.get("repo")
    if repo and os.path.isdir(repo):
        print(path); print(repo); print(work.get("report") or "")
        print(cwd); print("1" if d.get("stop_hook_active") else "0")
        print(work.get("contract") or ""); print(session_id(d) or "")
PY
)
RC=$?
[ "$RC" -eq 0 ] || exit "$RC"
[ -n "$TARGET" ] || exit 0
LEDGER=$(printf '%s\n' "$TARGET" | sed -n 1p)
REPO=$(printf '%s\n' "$TARGET" | sed -n 2p)
REPORT=$(printf '%s\n' "$TARGET" | sed -n 3p)
CWD=$(printf '%s\n' "$TARGET" | sed -n 4p)
ACTIVE=$(printf '%s\n' "$TARGET" | sed -n 5p)
CONTRACT=$(printf '%s\n' "$TARGET" | sed -n 6p)
SESSION=$(printf '%s\n' "$TARGET" | sed -n 7p)
[ -n "$REPORT" ] || REPORT="$REPO/output/report.md"

EXTRA=()
[ -n "$CONTRACT" ] && EXTRA+=(--contract "$CONTRACT")
[ -n "$SESSION" ] && EXTRA+=(--session-id "$SESSION")
OUT=$(node "$ROOT/scripts/done-gate.js" --repo "$REPO" --report "$REPORT" "${EXTRA[@]}" 2>/dev/null)
RC=$?
mkdir -p "$HOME/.cache/kkirikkiri" 2>/dev/null
VERDICT=$([ "$RC" -eq 0 ] && echo pass || { [ "$ACTIVE" = "1" ] && echo "final-unjustified" || echo block; })
printf '%s gate-done %s cwd=%s\n' "$(date '+%F %T')" "$VERDICT" "$CWD" >> "$HOME/.cache/kkirikkiri/hooks.log" 2>/dev/null
# 장부에 판정 기록 (실패든 성공이든) + 차단 횟수 누적. 3회 차단 후에는 종료를 허용한다(무한루프 하드캡 —
# headless 실측 2026-09-04: stop_hook_active 가드만으로는 연속 차단이 3회 발생).
BLOCKS=$(python3 - "$LEDGER" "$RC" "$OUT" "$ACTIVE" << 'PY' 2>/dev/null
import json, sys
p, rc, out, active = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4] == "1"
try:
    d = json.load(open(p)); g = d.get("outcome_gate") or {}
    # 재개 턴(active)의 평가는 차단이 아니므로 block_count에 세지 않는다 (하드캡 3회는 실제 차단만)
    blocks = int(g.get("block_count", 0)) + (1 if (rc != 0 and not active) else 0)
    d["outcome_gate"] = {"done_gate_exit": rc, "block_count": blocks, "report": json.loads(out) if out else None}
    json.dump(d, open(p, "w"), ensure_ascii=False, indent=1)
    print(blocks)
except Exception:
    print(0)
PY
)
[ "$RC" -eq 0 ] && exit 0
if [ "$ACTIVE" = "1" ]; then
  echo "[kkirikkiri gate-done] (재개 턴) 무변경 종료가 여전히 정당화되지 않음 — 장부 outcome_gate에 기록, 종료는 허용" >&2
  exit 0
fi
if [ "${BLOCKS:-0}" -ge 3 ]; then
  printf '%s gate-done cap-release cwd=%s (3회 차단 후 종료 허용)\n' "$(date '+%F %T')" "$CWD" >> "$HOME/.cache/kkirikkiri/hooks.log" 2>/dev/null
  echo "[kkirikkiri gate-done] 3회 차단 후 종료 허용 — 무변경 종료가 정당화되지 않은 채 끝났음을 장부(block_count=$BLOCKS)에 남김" >&2
  exit 0
fi
printf '%s' "$OUT" | python3 -c '
import json, sys
try: r = json.load(sys.stdin)
except Exception: print("[kkirikkiri gate-done] done-gate 실행 실패"); sys.exit(0)
print("[kkirikkiri gate-done] 완료 불허 — %s" % r.get("msg", ""))
for v in r.get("violations", []): print("  - %s: %s" % (v["rule"], v["msg"]))
print("정비를 수행하거나 보고서에 \"## 무변경 종료 심사\" 파일별 3열 표를 채운 뒤 다시 완료하라.")
' >&2
exit 2
