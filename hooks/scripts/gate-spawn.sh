#!/bin/bash
# gate-spawn.sh — PreToolUse(Agent|Task) 훅: kkirikkiri 런 컨텍스트(열린 장부)에서 팀원을 스폰할 때
# 스폰 프롬프트에 경계 블록(도구 허용목록 또는 read-only / 쓰기 소유권 / 정지 조건)이 없으면 차단한다. (v0.24.2)
# 이유: 카드 파일 기반 card-lint는 카드를 안 쓰면 무력 — 스폰이라는 도구 호출 자체에 경계를 강제한다.
# 가드: cwd에 열린 kkirikkiri 장부가 없으면 즉시 exit 0 (다른 세션의 Agent 호출에 영향 없음).
INPUT=$(cat)
command -v python3 >/dev/null 2>&1 || exit 0
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
python3 -B - "$INPUT" "$SCRIPT_DIR" << 'PY'
import json, sys, os, re, datetime, subprocess
sys.path.insert(0, sys.argv[2])
from gate_ledger import resolve_ledger, session_id
try:
    d = json.loads(sys.argv[1])
except Exception:
    sys.exit(0)
if d.get("tool_name") not in ("Agent", "Task"):
    sys.exit(0)
cwd = d.get("cwd") or os.getcwd()
target = resolve_ledger(cwd, session_id(d))
if not target:
    sys.exit(0)
open_ledger, ledger = target
ti = d.get("tool_input") or {}
if "model_selection" in ledger:
    validator = os.path.join(sys.argv[2], "..", "..", "scripts", "model-selection.js")
    try:
        checked = subprocess.run(["node", validator], input=json.dumps({
            "selection": ledger["model_selection"],
            "id": ti.get("name") or ti.get("description"), "model": ti.get("model")
        }), text=True, capture_output=True, timeout=10)
    except (OSError, subprocess.TimeoutExpired) as error:
        print(f"[kkirikkiri gate-spawn] model-selection: validator unavailable: {error}", file=sys.stderr)
        sys.exit(2)
    if checked.returncode:
        print("[kkirikkiri gate-spawn] " + (checked.stderr.strip() or "model-selection: validation failed"), file=sys.stderr)
        sys.exit(2)
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
    # 종결자: 여는 괄호 / 줄바꿈(\n 또는 JSON 이스케이프 \\n) / 'stop' / '허용' — '.'은 파일 확장자라 종결자로 쓰지 않는다 (R4 실측: CONVENTIONS.md → CONVENTIONS 절단)
    # "write_scope (배타적 쓰기 소유권)**:" 처럼 콜론 앞에 괄호·마크다운이 끼는 표기 허용 (O2 실측)
    m = re.search(r"write_scope(?:\s*\([^)]{0,40}\))?\**\s*[:=]\s*\**\[?([^\]\n(]+?)(?:\]|\\n|\n|\s*\(|\s+stop\b|\s*/\s*stop|\s+—\s|$)", p)
    canonical = re.search(r'(?m)^write_scope:\s*(\[(?:"[^\r\n]*|\s*)\])(?:\s+read-only)?\s*$', ti.get("prompt") or "")
    if canonical:
        try:
            scopes = json.loads(canonical.group(1))
            if not isinstance(scopes, list) or not all(
                isinstance(scope, str) and scope and not os.path.isabs(scope)
                and ".." not in scope.replace("\\", "/").split("/") for scope in scopes
            ):
                raise ValueError("expected relative scope strings")
        except (ValueError, TypeError) as error:
            print(f"[kkirikkiri gate-spawn] invalid structured write_scope: {error}", file=sys.stderr)
            sys.exit(2)
    elif m:
        # 산문 혼합 표기 대응(R4 실측: "repo/schemas/** 및 repo/CONVENTIONS.md에 규약 한두 줄 추가만 허용") — 경로형 토큰만 추출
        seg = m.group(1)
        # "…는 읽기만/수정 금지/read-only" 뒤에 오는 경로는 쓰기 범위가 아니다 — 그 마커 앞까지만 본다 (Y4 reconciler 실측)
        seg = re.split(r"읽기만|읽기 ?전용|수정 ?금지|쓰기 ?금지|read-?only", seg, maxsplit=1)[0]
        # ASCII 경로 토큰만 — \w는 한글도 매치해 "CONVENTIONS.md에" 같은 조사 붙은 토큰이 생긴다
        scopes = re.findall(r"[A-Za-z0-9_./*\-]*(?:/|\*\*|\.(?:md|json|js|ts|py|ya?ml|txt))[A-Za-z0-9_./*\-]*", seg)
        scopes = [s.strip('"\'`.,') for s in scopes if s.strip('"\'`.,') and s.lower() not in ("none", "없음")]
        seen = set(); scopes = [s for s in scopes if not (s in seen or seen.add(s))]
    # read_only는 write_scope가 없을 때만 — 쓰기 소유권이 선언된 팀원은 다른 파일을 '읽기 전용'이라 언급해도 read-only가 아니다 (R4 실측: reconciler 오판)
    read_only = (not scopes) and bool(re.search(r"read-?only|읽기 ?전용|review_mode", p, re.I))
    # C5@spawn: 이미 선언된 다른 팀원의 write_scope와 겹치면 차단 — 공유 파일은 소유자 1명 (R4 Y4 실측: 두 소유자가 CONVENTIONS.md를 함께 선언 → 위반 7)
    try:
        prev = (json.load(open(open_ledger)).get("declarations") or [])
    except Exception:
        prev = []
    me = ti.get("name") or ti.get("description") or ""
    def overlap(a, b):
        a2, b2 = a.rstrip("/*"), b.rstrip("/*")
        return a == b or a2 == b2 or a2.startswith(b2 + "/") or b2.startswith(a2 + "/")
    clashes = [(g, d0["agent"], h) for d0 in prev if d0.get("agent") != me for g in scopes for h in (d0.get("write_scope") or []) if overlap(g, h)]
    if clashes and not re.search(r"소유자\s*교체|takeover|재배정", p):
        log("block-overlap")
        try:
            x = json.load(open(open_ledger)); x.setdefault("boundary_violations", []).append(
                {"gate": "spawn-overlap", "agent": me, "clashes": [{"mine": g, "theirs": h, "owner": o} for g, o, h in clashes]})
            json.dump(x, open(open_ledger, "w"), ensure_ascii=False, indent=1)
        except Exception:
            pass
        print("[kkirikkiri gate-spawn] 스폰 차단 — write_scope가 이미 선언된 팀원과 겹친다 (공유 파일은 소유자 1명):", file=sys.stderr)
        for g, o, h in clashes: print(f"  - {g} ↔ {o}의 {h}", file=sys.stderr)
        print("  겹치는 파일은 한 팀원에게만 두고, 나머지는 그 팀원에게 변경을 요청하는 방식으로 프롬프트를 고쳐라. 상세: references/gates.md §2", file=sys.stderr)
        sys.exit(2)
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
