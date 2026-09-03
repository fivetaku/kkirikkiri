#!/bin/bash
# gate-init.sh — UserPromptSubmit 훅: 프롬프트가 /kkirikkiri 호출이면 런 컨텍스트(장부)를 **훅이** 만든다. (v0.24.2)
# 이유: 장부·카드 같은 "모델이 만들어야 하는 아티팩트"에 걸린 훅은 모델의 미준수를 물려받는다(2026-09-04 실측 — T런 0/2 생성).
# 컨텍스트 수립을 하네스 쪽으로 옮겨 gate-spawn/gate-done이 항상 대상을 갖게 한다.
# 가드: 프롬프트가 /kkirikkiri(또는 /kkirikkiri:kkirikkiri, 끼리끼리)로 시작하지 않으면 즉시 exit 0.
INPUT=$(cat)
command -v python3 >/dev/null 2>&1 || exit 0
python3 - "$INPUT" << 'PY'
import json, sys, os, re, datetime, subprocess
try:
    d = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)
prompt = (d.get("prompt") or "").strip()
if not re.match(r"^/kkirikkiri(:kkirikkiri)?\b|^/끼리끼리\b|^끼리끼리[ ,:]", prompt):
    sys.exit(0)
cwd = d.get("cwd") or os.getcwd()
runs = os.path.join(cwd, ".kkirikkiri", "runs")
os.makedirs(runs, exist_ok=True)
# 이미 열린 장부가 있으면 재생성하지 않음
for f in sorted(os.listdir(runs), reverse=True):
    if not f.endswith(".json"): continue
    try:
        x = json.load(open(os.path.join(runs, f)))
        if x.get("outcome") in (None, {}): sys.exit(0)
    except Exception:
        pass
def is_git(p):
    return os.path.isdir(os.path.join(p, ".git"))
# 작업 repo 추정: cwd가 git이면 cwd, 아니면 cwd 직속 하위 중 git repo가 정확히 1개면 그것
repo = cwd if is_git(cwd) else None
if repo is None:
    subs = [os.path.join(cwd, s) for s in os.listdir(cwd) if os.path.isdir(os.path.join(cwd, s)) and not s.startswith(".")]
    gits = [s for s in subs if is_git(s)]
    if len(gits) == 1: repo = gits[0]
ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
ledger = {
    "origin": "hook:gate-init", "prompt_head": prompt[:200],
    "diagnosis": None, "spec": None, "lint_report": None,
    "work": {"repo": repo, "report": os.path.join(cwd, "output", "report.md")} if repo else None,
    "budget_used": None, "missing_axes": None, "boundary_violations": [], "repair_cycles": 0,
    "liveness_events": [], "outcome": None,
}
with open(os.path.join(runs, f"{ts}.json"), "w", encoding="utf-8") as fh:
    json.dump(ledger, fh, ensure_ascii=False, indent=1)
os.makedirs(os.path.expanduser("~/.cache/kkirikkiri"), exist_ok=True)
with open(os.path.expanduser("~/.cache/kkirikkiri/hooks.log"), "a") as lg:
    lg.write(f"{datetime.datetime.now():%F %T} gate-init ledger cwd={cwd} repo={repo}\n")
PY
exit 0
