#!/bin/bash
# gate-spawn.sh — PreToolUse(Agent|Task) 훅: kkirikkiri 런 컨텍스트(열린 장부)에서 팀원을 스폰할 때
# 스폰 프롬프트에 경계 블록(도구 허용목록 또는 read-only / 쓰기 소유권 / 정지 조건)이 없으면 차단한다. (v0.24.2)
# 이유: 카드 파일 기반 card-lint는 카드를 안 쓰면 무력 — 스폰이라는 도구 호출 자체에 경계를 강제한다.
# 가드: cwd에 열린 kkirikkiri 장부가 없으면 즉시 exit 0 (다른 세션의 Agent 호출에 영향 없음).
INPUT=$(cat)
command -v python3 >/dev/null 2>&1 || exit 0
python3 - "$INPUT" << 'PY'
import json, sys, os, re, glob, datetime
try:
    d = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)
if d.get("tool_name") not in ("Agent", "Task"):
    sys.exit(0)
cwd = d.get("cwd") or os.getcwd()
runs = os.path.join(cwd, ".kkirikkiri", "runs")
if not os.path.isdir(runs):
    sys.exit(0)
open_ledger = None
for f in sorted(glob.glob(os.path.join(runs, "*.json")), reverse=True):
    try:
        x = json.load(open(f))
        if x.get("outcome") in (None, {}): open_ledger = f; break
    except Exception:
        continue
if not open_ledger:
    sys.exit(0)
ti = d.get("tool_input") or {}
p = json.dumps(ti, ensure_ascii=False)
has_tools = bool(re.search(r"(허용 도구|tools\s*[:=]|allowlist|read-?only|읽기 ?전용|review_mode)", p, re.I))
has_scope = bool(re.search(r"(write_scope|쓰기 소유|소유 영역|쓰기 ?범위|밖 파일 쓰기 금지|read-?only|읽기 ?전용)", p, re.I))
has_stop  = bool(re.search(r"(maxTurns|max_turns|stop\s*[:=]|정지 조건|완료 조건|done_when|완료 판정)", p, re.I))
missing = [n for ok, n in ((has_tools, "허용 도구(tools) 또는 read-only 선언"),
                          (has_scope, "쓰기 소유권(write_scope) 또는 read-only 선언"),
                          (has_stop, "정지 조건(stop.maxTurns/done_when)")) if not ok]
def log(kind):
    os.makedirs(os.path.expanduser("~/.cache/kkirikkiri"), exist_ok=True)
    with open(os.path.expanduser("~/.cache/kkirikkiri/hooks.log"), "a") as lg:
        lg.write(f"{datetime.datetime.now():%F %T} gate-spawn {kind} cwd={cwd} agent={ti.get('name') or ti.get('description') or ''}\n")
if not missing:
    # 지표 v2 자동화(R3): 선언된 경계를 장부에 기록 — violation-collector --ledger 가 사람 개입 없이 scopes를 구성한다
    scopes = []
    m = re.search(r"write_scope\s*[:=]\s*\[?([^\]\n]+?)\]?(?:\s|$|\.|\(|,\s*stop)", p)
    if m:
        scopes = [s.strip().strip('"\'`') for s in re.split(r"[,、]\s*", m.group(1)) if s.strip()]
        scopes = [s for s in scopes if re.match(r"^[\w./*\-]+$", s)]
    read_only = bool(re.search(r"read-?only|읽기 ?전용|review_mode", p, re.I))
    try:
        x = json.load(open(open_ledger)); x.setdefault("declarations", []).append(
            {"agent": ti.get("name") or ti.get("description") or f"agent{len(x.get('declarations', []))+1}",
             "write_scope": scopes, "read_only": read_only})
        json.dump(x, open(open_ledger, "w"), ensure_ascii=False, indent=1)
    except Exception:
        pass
    log("pass"); sys.exit(0)
log("block")
try:
    x = json.load(open(open_ledger)); x.setdefault("boundary_violations", []).append(
        {"gate": "spawn", "agent": ti.get("name") or ti.get("description"), "missing": missing})
    json.dump(x, open(open_ledger, "w"), ensure_ascii=False, indent=1)
except Exception:
    pass
print("[kkirikkiri gate-spawn] 팀원 스폰 차단 — 스폰 프롬프트에 경계 블록이 없다. 다음을 본문에 명시하고 다시 스폰하라:", file=sys.stderr)
for m in missing: print(f"  - {m}", file=sys.stderr)
print("  예) 허용 도구: Read, Grep, Write / write_scope: schemas/** (밖 파일 쓰기 금지, 공유 파일은 소유자에게 요청) / stop: maxTurns 25, done_when \"…\"", file=sys.stderr)
print("  검증 역할은 read-only(쓰기 도구 없음)로 선언한다. 상세: references/gates.md §2", file=sys.stderr)
sys.exit(2)
PY
