#!/bin/bash
# gate-card.sh — PostToolUse(Write|Edit) 훅: 팀원 카드(*/agents/*.md)가 저장되면 그 디렉토리를 card-lint로 검사한다.
# 위반 시 exit 2 → stderr가 Claude에게 피드백된다(스폰 전에 고치게). (v0.24.0)
# 가드: 경로가 agents/ 카드가 아니면 즉시 exit 0.
INPUT=$(cat)
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
command -v node >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

DIR=$(printf '%s' "$INPUT" | python3 -c '
import json, sys, os, re
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
if d.get("tool_name") not in ("Write", "Edit", "MultiEdit"):
    sys.exit(0)
p = (d.get("tool_input") or {}).get("file_path") or ""
# kkirikkiri 카드 규약: .../agents/<역할명>.md  (.claude/agents 등 다른 agents 디렉토리는 frontmatter에 archetype가 있어야만 대상)
if not re.search(r"/agents/[^/]+\.md$", p) or not os.path.isfile(p):
    sys.exit(0)
try:
    head = open(p, encoding="utf-8", errors="ignore").read(2000)
except Exception:
    sys.exit(0)
if not head.startswith("---") or "archetype:" not in head:
    sys.exit(0)  # kkirikkiri 카드가 아님
print(os.path.dirname(p))
' 2>/dev/null)
[ -n "$DIR" ] || exit 0

REPORT=$(node "$ROOT/scripts/card-lint.js" --dir "$DIR" 2>/dev/null)
RC=$?
[ "$RC" -eq 0 ] && exit 0
printf '%s' "$REPORT" | python3 -c '
import json, sys, os
try:
    r = json.load(sys.stdin)
except Exception:
    print("[kkirikkiri gate-card] card-lint 실행 실패"); sys.exit(0)
print("[kkirikkiri gate-card] 팀원 카드 경계 블록 위반 — 스폰 전에 고쳐라 (총 %d건):" % r.get("summary", {}).get("total", 0))
for c in r.get("cards", []):
    for v in c.get("violations", []):
        print("  - %s: %s — %s" % (os.path.basename(c["file"]), v["rule"], v["msg"]))
for x in r.get("cross_violations", []):
    print("  - %s — %s" % (x["rule"], x["msg"]))
' >&2
exit 2
