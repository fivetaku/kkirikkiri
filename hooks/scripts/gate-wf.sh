#!/bin/bash
# gate-wf.sh — PreToolUse(Workflow) 훅: Workflow 도구 호출 직전에 스크립트를 wf-lint로 검사한다.
# 위반 시 exit 2 → 도구 호출 차단 + stderr가 Claude에게 전달된다. (v0.24.0 — 게이트를 SKILL 텍스트에서 하네스 계층으로 이관)
# 가드: Workflow 이외 도구·스크립트 없음이면 즉시 exit 0 (다른 세션·워크스페이스에 부담 0).
INPUT=$(cat)
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
command -v node >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

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
if not s and p and os.path.isfile(p):
    s = open(p, encoding="utf-8", errors="ignore").read()
if s:
    sys.stdout.write(s)
' 2>/dev/null)
[ -n "$SCRIPT" ] || exit 0   # 저장된 워크플로 이름(name) 실행 등 — 검사 대상 없음

REPORT=$(printf '%s' "$SCRIPT" | node "$ROOT/scripts/wf-lint.js" - 2>/dev/null)
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
