#!/bin/bash
# gate-card.sh — PostToolUse(Write|Edit|MultiEdit|apply_patch) 훅: 팀원 카드(*/agents/*.md)가 저장되면 그 디렉토리를 card-lint로 검사한다.
# 위반 시 exit 2 → stderr가 Claude에게 피드백된다(스폰 전에 고치게). (v0.24.0)
# 가드: 경로가 agents/ 카드가 아니면 즉시 exit 0.
INPUT=$(cat)
ROOT="${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/../.." && pwd)}"
command -v node >/dev/null 2>&1 || exit 0
command -v python3 >/dev/null 2>&1 || exit 0

DIRS=$(printf '%s' "$INPUT" | python3 -c '
import json, sys, os, re
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
tool = d.get("tool_name")
ti = d.get("tool_input") or {}
cwd = d.get("cwd") or os.getcwd()
paths = []
if tool in ("Write", "Edit", "MultiEdit"):
    paths = [ti.get("file_path") or ""]
elif tool == "apply_patch":
    # Codex: 패치 본문(tool_input.command)의 "*** Update File:" / "*** Add File:" / "*** Move to:" 줄에서 대상 경로를 뽑는다
    body = ti.get("command") or ti.get("input") or ""
    if isinstance(body, list):
        body = "\n".join(str(x) for x in body)
    for m in re.finditer(r"(?m)^\*\*\* (?:Update File|Add File|Move to):[ \t]*(.+?)[ \t]*$", str(body)):
        q = m.group(1)
        paths.append(q if os.path.isabs(q) else os.path.join(cwd, q))
seen = []
for p in paths:
    # kkirikkiri 카드 규약: .../agents/<역할명>.md  (.claude/agents 등 다른 agents 디렉토리는 frontmatter에 archetype가 있어야만 대상)
    if not re.search(r"/agents/[^/]+\.md$", p) or not os.path.isfile(p):
        continue
    try:
        head = open(p, encoding="utf-8", errors="ignore").read(2000)
    except Exception:
        continue
    if not head.startswith("---") or "archetype:" not in head:
        continue  # kkirikkiri 카드가 아님
    dd = os.path.dirname(p)
    if dd not in seen:
        seen.append(dd)
        print(dd)
' 2>/dev/null)
[ -n "$DIRS" ] || exit 0

RC=0
REPORT=""
DIR=""
while IFS= read -r D; do
  [ -n "$D" ] || continue
  R1=$(node "$ROOT/scripts/card-lint.js" --dir "$D" 2>/dev/null)
  RC1=$?
  mkdir -p "$HOME/.cache/kkirikkiri" 2>/dev/null
  printf '%s gate-card %s dir=%s\n' "$(date '+%F %T')" "$([ "$RC1" -eq 0 ] && echo pass || echo block)" "$D" >> "$HOME/.cache/kkirikkiri/hooks.log" 2>/dev/null
  if [ "$RC1" -ne 0 ] && [ "$RC" -eq 0 ]; then RC=$RC1; REPORT="$R1"; DIR="$D"; fi
done <<EOF2
$DIRS
EOF2
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
