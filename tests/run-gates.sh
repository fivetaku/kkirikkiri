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
# 하드캡: 차단 2회 더 누적(총 3회) → 그 다음은 종료 허용(exit 0)
hook_exit "gate-done 2회차 차단" 2 hooks/scripts/gate-done.sh "{\"cwd\":\"$HD\",\"stop_hook_active\":false}"
hook_exit "gate-done 3회차 차단→cap 해제" 0 hooks/scripts/gate-done.sh "{\"cwd\":\"$HD\",\"stop_hook_active\":false}"
hook_exit "gate-done 장부 없는 cwd" 0 hooks/scripts/gate-done.sh '{"cwd":"/tmp","stop_hook_active":false}'

note "── hooks: gate-init(UserPromptSubmit) / gate-spawn(PreToolUse Agent) ──"
HI="$OUT/h-init"; mkdir -p "$HI/repo"; git -C "$HI/repo" init -q
hook_exit "gate-init 비대상 프롬프트" 0 hooks/scripts/gate-init.sh "{\"cwd\":\"$HI\",\"prompt\":\"안녕\"}"
[ ! -d "$HI/.kkirikkiri" ] && note "  PASS  gate-init 비대상은 장부 미생성" || { note "  FAIL  gate-init 비대상인데 장부 생성"; FAIL=1; }
hook_exit "gate-init /kkirikkiri 프롬프트" 0 hooks/scripts/gate-init.sh "{\"cwd\":\"$HI\",\"prompt\":\"/kkirikkiri 아래 작업을 진행해줘\"}"
L=$(ls "$HI"/.kkirikkiri/runs/*.json 2>/dev/null | head -1)
if [ -n "$L" ] && python3 -c "import json,sys; d=json.load(open('$L')); sys.exit(0 if d['work']['repo'].endswith('/repo') and d['outcome'] is None else 1)"; then
  note "  PASS  gate-init 장부 생성 + work.repo 하위 git repo 자동 추정"; else note "  FAIL  gate-init 장부/repo 추정 실패"; FAIL=1; fi
hook_exit "gate-spawn 컨텍스트 없는 cwd → 무동작" 0 hooks/scripts/gate-spawn.sh '{"cwd":"/tmp","tool_name":"Agent","tool_input":{"prompt":"아무거나"}}'
hook_exit "gate-spawn 경계 없는 스폰 차단" 2 hooks/scripts/gate-spawn.sh "{\"cwd\":\"$HI\",\"tool_name\":\"Agent\",\"tool_input\":{\"name\":\"worker\",\"prompt\":\"당신은 스키마 정비자입니다. schemas를 정비하세요.\"}}"
hook_exit "gate-spawn 경계 있는 스폰 통과" 0 hooks/scripts/gate-spawn.sh "{\"cwd\":\"$HI\",\"tool_name\":\"Agent\",\"tool_input\":{\"name\":\"worker\",\"prompt\":\"허용 도구: Read, Write. write_scope: schemas/** (밖 파일 쓰기 금지). stop: maxTurns 20, done_when 스키마 정비 완료\"}}"
hook_exit "gate-spawn cwd 드리프트(하위 repo에서 스폰)도 차단" 2 hooks/scripts/gate-spawn.sh "{\"cwd\":\"$HI/repo\",\"tool_name\":\"Agent\",\"tool_input\":{\"name\":\"drift\",\"prompt\":\"경계 없음\"}}"
# 드리프트용 새 장부(위 HD는 block_count 3으로 cap 해제 상태라 별도 디렉토리)
HD2="$OUT/h-done2"; mkdir -p "$HD2/.kkirikkiri/runs" "$HD2/output"; cp -R "$R" "$HD2/repo"; git -C "$HD2/repo" checkout -q -- . 2>/dev/null
cp tests/fixtures/done-gate/report-unjustified.md "$HD2/output/report.md"
printf '{"outcome": null, "work": {"repo": "%s", "report": "%s"}}\n' "$HD2/repo" "$HD2/output/report.md" > "$HD2/.kkirikkiri/runs/20260904_000001.json"
hook_exit "gate-done cwd 드리프트(하위 repo에서 종료)도 판정" 2 hooks/scripts/gate-done.sh "{\"cwd\":\"$HD2/repo\",\"stop_hook_active\":false}"
hook_exit "gate-spawn read-only 리뷰어 통과" 0 hooks/scripts/gate-spawn.sh "{\"cwd\":\"$HI\",\"tool_name\":\"Agent\",\"tool_input\":{\"name\":\"critic\",\"prompt\":\"read-only 검증자. 쓰기 도구 없음. 정지 조건: maxTurns 15\"}}"
python3 -c "import json,sys; d=json.load(open('$L')); sys.exit(0 if any(v.get('gate')=='spawn' for v in d.get('boundary_violations',[])) else 1)" \
  && note "  PASS  gate-spawn 차단이 장부 boundary_violations에 기록" || { note "  FAIL  gate-spawn 장부 기록 없음"; FAIL=1; }
python3 -c "
import json,sys; d=json.load(open('$L')); ds=d.get('declarations',[])
ok = any(x['agent']=='worker' and 'schemas/**' in x['write_scope'] and not x['read_only'] for x in ds) and any(x['agent']=='critic' and x['read_only'] for x in ds)
sys.exit(0 if ok else 1)" \
  && note "  PASS  gate-spawn 통과 시 선언(write_scope·read_only) 장부 기록 (지표 v2 자동화 입력)" || { note "  FAIL  gate-spawn declarations 기록 불일치"; FAIL=1; }

if [ "$FAIL" -eq 0 ]; then note "── ALL GATES PASS ──"; else note "── GATE REGRESSION DETECTED ──"; fi
exit "$FAIL"
