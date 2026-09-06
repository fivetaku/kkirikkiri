#!/bin/bash
# gate-wf.sh — PreToolUse(Workflow) 훅: Workflow 도구 호출 직전에 스크립트를 wf-lint로 검사한다.
# 위반 시 exit 2 → 도구 호출 차단 + stderr가 Claude에게 전달된다. (v0.24.0 — 게이트를 SKILL 텍스트에서 하네스 계층으로 이관)
# 가드: Workflow 이외 도구·스크립트 없음이면 즉시 exit 0 (다른 세션·워크스페이스에 부담 0).
INPUT=$(cat)
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
command -v python3 >/dev/null 2>&1 || exit 0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
MODELS=$(python3 -B - "$INPUT" "$SCRIPT_DIR" << 'PY'
import json, sys, os
sys.path.insert(0, sys.argv[2])
from gate_ledger import resolve_ledger, session_id
try:
    data = json.loads(sys.argv[1])
except ValueError:
    sys.exit(0)
if data.get("tool_name") != "Workflow":
    sys.exit(0)
target = resolve_ledger(data.get("cwd") or os.getcwd(), session_id(data))
if target and "model_selection" in target[1]:
    print(json.dumps(target[1]["model_selection"], ensure_ascii=False))
PY
)
[ "$?" -eq 0 ] || exit 2
if ! command -v node >/dev/null 2>&1; then
  [ -z "$MODELS" ] && exit 0
  echo '[kkirikkiri gate-wf] model-selection: node validator unavailable' >&2
  exit 2
fi

# tool_input.script(인라인) 또는 tool_input.scriptPath(파일)에서 스크립트 본문 추출
SCRIPT=$(printf '%s' "$INPUT" | python3 -c '
import json, sys, os
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if d.get("tool_name") != "Workflow":
    sys.exit(0)
ti = d.get("tool_input") or {}
s = ti.get("script")
p = ti.get("scriptPath")
if not s and p:
    p = os.path.join(d.get("cwd") or os.getcwd(), p)
    if os.path.isfile(p):
        try:
            s = open(p, encoding="utf-8").read()
        except (OSError, UnicodeError) as error:
            print("[kkirikkiri gate-wf] script-read-error: " + str(error), file=sys.stderr)
            sys.exit(2)
if s and not isinstance(s, str):
    print("[kkirikkiri gate-wf] script must be a string", file=sys.stderr)
    sys.exit(2)
if s:
    sys.stdout.write(s)
' )
[ "$?" -eq 0 ] || exit 2
if [ -z "$SCRIPT" ]; then
  [ -z "$MODELS" ] && exit 0 # Legacy named workflows remain supported.
  echo '[kkirikkiri gate-wf] model-selection: script required to verify selected phases/models' >&2
  exit 2
fi

MODEL_ARGS=()
[ -z "$MODELS" ] || MODEL_ARGS=(--models-json "$MODELS")
REPORT=$(printf '%s' "$SCRIPT" | node "$ROOT/scripts/wf-lint.js" - "${MODEL_ARGS[@]}")
RC=$?
# 관측 로그 — 발화 실측용 (대상 확정 후에만 기록, 통과/차단 모두). ddiring last-notify 패턴.
mkdir -p "$HOME/.cache/kkirikkiri" 2>/dev/null
printf '%s gate-wf %s cwd=%s\n' "$(date '+%F %T')" "$([ "$RC" -eq 0 ] && echo pass || echo block)" "$(printf '%s' "$INPUT" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("cwd",""))' 2>/dev/null)" >> "$HOME/.cache/kkirikkiri/hooks.log" 2>/dev/null
if [ "$RC" -eq 0 ]; then
  exit 0
fi
# 위반 요약을 Claude에게 — 발사 차단
printf '%s' "$REPORT" | python3 -c '
import json, sys
try:
    r = json.load(sys.stdin)
except Exception:
    print("[kkirikkiri gate-wf] wf-lint 실행 실패 — 스크립트를 점검하라"); sys.exit(0)
errs = [v for v in r.get("violations", []) if v.get("severity") != "warn"]
print("[kkirikkiri gate-wf] Workflow 발사 차단 — wf-lint 위반 %d건. 아래를 고치고 다시 호출하라:" % len(errs))
for v in errs:
    print("  - %s (%s): %s" % (v.get("rule"), v.get("loc"), v.get("msg")))
for v in r.get("violations", []):
    if v.get("severity") == "warn":
        print("  ~ (경고) %s: %s" % (v.get("rule"), v.get("msg")))
' >&2
exit 2
