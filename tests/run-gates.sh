#!/bin/bash
# run-gates.sh — 게이트 3종(wf-lint·card-lint·done-gate) 자동 회귀 러너 (v0.23.4)
# clean 픽스처 = exit 0 기대, defect 픽스처 = exit 1 + 기대 규칙 ID가 violations에 실제 포함되는지까지 대조.
# (exit code만 보면 우연히 다른 규칙으로 잡혀도 통과하는 것을 막는다 — 2026-09-01 인계 스펙)
set -u
cd "$(dirname "$0")/.."
FAIL=0
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT

note() { printf '%s\n' "$*"; }
expect_exit() { # <이름> <기대exit> <실제exit>
  if [ "$2" -eq "$3" ]; then note "  PASS  $1 (exit $3)"; else note "  FAIL  $1 — 기대 exit $2, 실제 $3"; FAIL=1; fi
}
expect_rules() { # <이름> <json파일> <규칙ID...>  — violations[].rule ∪ cross_violations[].rule 에 전부 포함돼야 함
  local name="$1" json="$2"; shift 2
  if python3 - "$json" "$@" << 'PY'
import json, sys
r = json.load(open(sys.argv[1]))
rules = set()
for v in r.get('violations', []) or []: rules.add(v.get('rule'))
for c in r.get('cards', []) or []:
    for v in c.get('violations', []) or []: rules.add(v.get('rule'))
for x in r.get('cross_violations', []) or []: rules.add(x.get('rule'))
missing = [e for e in sys.argv[2:] if e not in rules]
if missing:
    print(f"    누락 규칙: {missing} (실제: {sorted(rules)})")
    sys.exit(1)
PY
  then note "  PASS  $name 규칙 대조 ($*)"; else note "  FAIL  $name — 기대 규칙 미포함"; FAIL=1; fi
}

note "── wf-lint ──"
node scripts/wf-lint.js tests/fixtures/wf-clean.js > "$OUT/wc.json"; expect_exit "wf-clean" 0 $?
node scripts/wf-lint.js tests/fixtures/wf-defect-20260829.js > "$OUT/wd.json"; expect_exit "wf-defect-20260829" 1 $?
expect_rules "wf-defect-20260829" "$OUT/wd.json" R3-model-pin R4-fanin-monopoly
node scripts/wf-lint.js tests/fixtures/wf-defect-empty-schema.js > "$OUT/we.json"; expect_exit "wf-defect-empty-schema" 1 $?
expect_rules "wf-defect-empty-schema" "$OUT/we.json" R2-schema

note "── card-lint ──"
node scripts/card-lint.js --dir tests/fixtures/cards-clean > "$OUT/cc.json"; expect_exit "cards-clean" 0 $?
node scripts/card-lint.js --dir tests/fixtures/cards-defect > "$OUT/cd.json"; expect_exit "cards-defect" 1 $?
expect_rules "cards-defect" "$OUT/cd.json" C3-review_mode C4-write_scope C5-scope-overlap

note "── done-gate ──"
# 자급 픽스처 repo (T3 구조 최소 재현 — 외부 스크립트 의존 없음)
R="$OUT/repo"; mkdir -p "$R/schemas" "$R/fixtures"
printf '{"type":"user","fields":["id","name"]}\n' > "$R/schemas/user.schema.json"
printf '{"type":"order","fields":["id","total"]}\n' > "$R/schemas/order.schema.json"
printf '{"id":1,"name":"kim"}\n' > "$R/fixtures/user.sample.json"
printf '{"id":9,"total":100}\n' > "$R/fixtures/order.sample.json"
printf '{"version":"1.0","shared_by":["schemas","fixtures"]}\n' > "$R/manifest.json"
printf '# 공통 규약\nID는 정수.\n' > "$R/CONVENTIONS.md"
git -C "$R" init -q
git -C "$R" add -A
git -C "$R" -c user.email=t@t -c user.name=t commit -qm baseline

node scripts/done-gate.js --repo "$R" --report tests/fixtures/done-gate/report-unjustified.md > "$OUT/du.json"; expect_exit "done-gate 무변경+심사없음" 1 $?
expect_rules "done-gate 무변경+심사없음" "$OUT/du.json" D1-audit-block
node scripts/done-gate.js --repo "$R" --report tests/fixtures/done-gate/report-justified.md > "$OUT/dj.json"; expect_exit "done-gate 무변경+파일별심사" 0 $?
printf '{"x":1}\n' >> "$R/manifest.json"
node scripts/done-gate.js --repo "$R" --report tests/fixtures/done-gate/report-unjustified.md > "$OUT/dc.json"; expect_exit "done-gate 변경있음" 0 $?

note "── hooks (합성 훅 JSON → exit 0/2 대조) ──"
export CLAUDE_PLUGIN_ROOT="$PWD"
hook_exit() { # <이름> <기대exit> <스크립트> <json>
  printf '%s' "$4" | bash "$3" >/dev/null 2>&1; local rc=$?
  if [ "$rc" -eq "$2" ]; then note "  PASS  $1 (exit $rc)"; else note "  FAIL  $1 — 기대 exit $2, 실제 $rc"; FAIL=1; fi
}
WF_DEFECT=$(python3 -c "import json;print(json.dumps({'tool_name':'Workflow','tool_input':{'script':open('tests/fixtures/wf-defect-20260829.js').read()}}))")
WF_CLEAN=$(python3 -c "import json;print(json.dumps({'tool_name':'Workflow','tool_input':{'script':open('tests/fixtures/wf-clean.js').read()}}))")
hook_exit "gate-wf defect 차단" 2 hooks/scripts/gate-wf.sh "$WF_DEFECT"
hook_exit "gate-wf clean 통과" 0 hooks/scripts/gate-wf.sh "$WF_CLEAN"
hook_exit "gate-wf 비대상 도구" 0 hooks/scripts/gate-wf.sh '{"tool_name":"Read","tool_input":{"file_path":"/x"}}'
HA="$OUT/h-agents"; mkdir -p "$HA/d/agents" "$HA/c/agents"
cp tests/fixtures/cards-defect/*.md "$HA/d/agents/"; cp tests/fixtures/cards-clean/*.md "$HA/c/agents/"
hook_exit "gate-card defect 피드백" 2 hooks/scripts/gate-card.sh "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$HA/d/agents/감사자.md\"}}"
hook_exit "gate-card clean 통과" 0 hooks/scripts/gate-card.sh "{\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"$HA/c/agents/감사자.md\"}}"
hook_exit "gate-card 비대상 경로" 0 hooks/scripts/gate-card.sh '{"tool_name":"Write","tool_input":{"file_path":"/tmp/foo.md"}}'
HD="$OUT/h-done"; mkdir -p "$HD/.kkirikkiri/runs" "$HD/output"; cp -R "$R" "$HD/repo"
git -C "$HD/repo" checkout -q -- . 2>/dev/null; git -C "$HD/repo" clean -qfd 2>/dev/null   # 위 done-gate 테스트의 변경 원복
cp tests/fixtures/done-gate/report-unjustified.md "$HD/output/report.md"
printf '{"outcome": null, "work": {"repo": "%s", "report": "%s"}}\n' "$HD/repo" "$HD/output/report.md" > "$HD/.kkirikkiri/runs/20260904_000000.json"
hook_exit "gate-done 무변경+무증적 차단" 2 hooks/scripts/gate-done.sh "{\"cwd\":\"$HD\",\"stop_hook_active\":false}"
hook_exit "gate-done stop_hook_active 루프방지" 0 hooks/scripts/gate-done.sh "{\"cwd\":\"$HD\",\"stop_hook_active\":true}"
hook_exit "gate-done 장부 없는 cwd" 0 hooks/scripts/gate-done.sh '{"cwd":"/tmp","stop_hook_active":false}'

if [ "$FAIL" -eq 0 ]; then note "── ALL GATES PASS ──"; else note "── GATE REGRESSION DETECTED ──"; fi
exit "$FAIL"
