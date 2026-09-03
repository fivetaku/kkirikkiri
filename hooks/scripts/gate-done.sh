#!/bin/bash
# gate-done.sh — Stop 훅: 열린 런 장부(outcome=null, work.repo 지정)가 cwd에 있으면 done-gate를 돌려
# 무행동 종료를 증적 없이 통과시키지 않는다. 위반 시 exit 2 → 종료 차단 + 사유 전달. (v0.24.0)
# 가드: cwd/.kkirikkiri/runs 가 없으면 즉시 exit 0. stop_hook_active=true(이미 훅으로 재개된 턴)면 무한 차단 방지로 exit 0.
INPUT=$(cat)
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
command -v node >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

CWD=$(printf '%s' "$INPUT" | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
if d.get("stop_hook_active"): sys.exit(0)
print(d.get("cwd") or "")' 2>/dev/null)
[ -n "$CWD" ] || CWD="$PWD"
RUNS="$CWD/.kkirikkiri/runs"
[ -d "$RUNS" ] || exit 0

# 열린 장부 중 work.repo가 지정된 것 (가장 최근 1개)
TARGET=$(python3 - "$RUNS" << 'PY' 2>/dev/null
import json, sys, os, glob
runs = sys.argv[1]
for f in sorted(glob.glob(os.path.join(runs, "*.json")), reverse=True):
    try: d = json.load(open(f))
    except Exception: continue
    if d.get("outcome") not in (None, {}): continue
    w = d.get("work") or {}
    repo = w.get("repo"); report = w.get("report")
    if repo and os.path.isdir(repo):
        print(f); print(repo); print(report or "")
        break
PY
)
[ -n "$TARGET" ] || exit 0
LEDGER=$(printf '%s\n' "$TARGET" | sed -n 1p)
REPO=$(printf '%s\n' "$TARGET" | sed -n 2p)
REPORT=$(printf '%s\n' "$TARGET" | sed -n 3p)
[ -n "$REPORT" ] || REPORT="$REPO/output/report.md"

OUT=$(node "$ROOT/scripts/done-gate.js" --repo "$REPO" --report "$REPORT" 2>/dev/null)
RC=$?
mkdir -p "$HOME/.cache/kkirikkiri" 2>/dev/null
printf '%s gate-done %s cwd=%s\n' "$(date '+%F %T')" "$([ "$RC" -eq 0 ] && echo pass || echo block)" "$CWD" >> "$HOME/.cache/kkirikkiri/hooks.log" 2>/dev/null
# 장부에 판정 기록 (실패든 성공이든)
python3 - "$LEDGER" "$RC" "$OUT" << 'PY' 2>/dev/null
import json, sys
p, rc, out = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    d = json.load(open(p)); d.setdefault("outcome_gate", {})
    d["outcome_gate"] = {"done_gate_exit": int(rc), "report": json.loads(out) if out else None}
    json.dump(d, open(p, "w"), ensure_ascii=False, indent=1)
except Exception:
    pass
PY
[ "$RC" -eq 0 ] && exit 0
printf '%s' "$OUT" | python3 -c '
import json, sys
try: r = json.load(sys.stdin)
except Exception: print("[kkirikkiri gate-done] done-gate 실행 실패"); sys.exit(0)
print("[kkirikkiri gate-done] 완료 불허 — %s" % r.get("msg", ""))
for v in r.get("violations", []): print("  - %s: %s" % (v["rule"], v["msg"]))
print("정비를 수행하거나 보고서에 \"## 무변경 종료 심사\" 파일별 3열 표를 채운 뒤 다시 완료하라.")
' >&2
exit 2
