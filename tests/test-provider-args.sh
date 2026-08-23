#!/bin/bash
#
# test-provider-args.sh — run-cli-worker.js 프로바이더 → (바이너리, 인자) 계약 회귀 테스트
#
# 실제 CLI를 호출하지 않는다. PATH 앞에 argv를 그대로 기록하는 가짜 바이너리를 두고,
# 워커가 각 프로바이더에 대해 **어떤 명령을 어떤 플래그로** 부르는지 고정한다.
# 플래그가 조용히 바뀌면(예: --sandbox 누락) 여기서 잡힌다.
#
# Usage: bash tests/test-provider-args.sh
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
WORKER="$PLUGIN_DIR/scripts/run-cli-worker.js"
JOB_SCRIPT="$PLUGIN_DIR/scripts/run-cli-job.js"

TMP="$(mktemp -d)"
mkdir -p "$TMP/fakehome"
trap 'rm -rf "$TMP"' EXIT

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[0;31m✗\033[0m %s\n     %s\n' "$1" "$2"; }

# ── 가짜 바이너리: argv를 한 줄에 하나씩 기록하고 즉시 종료 ──
FAKEBIN="$TMP/bin"; mkdir -p "$FAKEBIN"
for name in codex agy gjc grok; do
  cat > "$FAKEBIN/$name" <<EOF
#!/bin/bash
: > "\$FAKE_ARGV_FILE"
for a in "\$@"; do printf '%s\n' "\$a" >> "\$FAKE_ARGV_FILE"; done
echo "fake-$name-ok"
exit 0
EOF
  chmod +x "$FAKEBIN/$name"
done

run_provider() {
  # $1 = provider, $2 = prompt content → argv 파일 경로를 stdout으로
  local provider="$1" prompt="$2"
  local jobdir="$TMP/job-$provider"
  mkdir -p "$jobdir"
  printf '%s' "$prompt" > "$jobdir/prompt.txt"
  local argvfile="$TMP/argv-$provider.txt"
  : > "$argvfile"
  # HOME을 임시 디렉토리로 바꿔 EXTRA_BIN_DIRS(~/.grok/bin)가 존재하지 않게 만든다.
  # 안 그러면 구현의 PATH 선점(실제 grok 우선)이 가짜 바이너리를 이겨 테스트가 실제 CLI를 호출한다.
  FAKE_ARGV_FILE="$argvfile" HOME="$TMP/fakehome" PATH="$FAKEBIN:$PATH" \
    node "$WORKER" --job-dir "$jobdir" --provider "$provider" --timeout 30 >/dev/null 2>&1
  printf '%s' "$argvfile"
}

# argv 파일에 특정 값이 있는지
has_arg() { grep -Fxq -- "$2" "$1"; }
# argv 파일의 마지막 값
last_arg() { tail -1 "$1"; }
# argv 파일의 n번째 값 (1-indexed)
nth_arg() { sed -n "${2}p" "$1"; }

echo
echo "run-cli-worker.js 프로바이더 인자 계약"
echo "────────────────────────────────────────"

PROMPT='테스트 프롬프트 본문'

# ── codex ──
echo "[codex]"
F=$(run_provider codex "$PROMPT")
[ "$(nth_arg "$F" 1)" = "exec" ] \
  && ok "첫 인자가 exec" \
  || bad "첫 인자가 exec" "got: $(nth_arg "$F" 1)"
has_arg "$F" "--dangerously-bypass-approvals-and-sandbox" \
  && ok "승인·샌드박스 우회 플래그" \
  || bad "승인·샌드박스 우회 플래그" "없음"
[ "$(last_arg "$F")" = "$PROMPT" ] \
  && ok "프롬프트가 마지막 positional (파일 경로 아님)" \
  || bad "프롬프트가 마지막 positional" "got: $(last_arg "$F")"

# ── antigravity (agy) ──
echo "[antigravity]"
F=$(run_provider antigravity "$PROMPT")
has_arg "$F" "--dangerously-skip-permissions" \
  && ok "승인 우회 플래그" || bad "승인 우회 플래그" "없음"
has_arg "$F" "-p" && ok "-p 사용" || bad "-p 사용" "없음"
[ "$(last_arg "$F")" = "$PROMPT" ] \
  && ok "프롬프트가 -p 값으로 전달" || bad "프롬프트가 -p 값" "got: $(last_arg "$F")"

# ── gjc ──
echo "[gjc]"
F=$(run_provider gjc "$PROMPT")
[ "$(nth_arg "$F" 1)" = "--print" ] \
  && ok "첫 인자가 --print" || bad "첫 인자가 --print" "got: $(nth_arg "$F" 1)"
[ "$(last_arg "$F")" = "$PROMPT" ] \
  && ok "프롬프트가 마지막 positional" || bad "프롬프트가 마지막 positional" "got: $(last_arg "$F")"

# ── grok (이번에 추가) ──
echo "[grok]"
F=$(run_provider grok "$PROMPT")
has_arg "$F" "--no-auto-update" \
  && ok "자동 업데이터 차단 (실행 중 끼어듦 방지)" \
  || bad "--no-auto-update" "없음 — 워커 실행 중 자동 업데이트가 끼어들 수 있다"
has_arg "$F" "--no-alt-screen" \
  && ok "대체화면 TUI 진입 차단" || bad "--no-alt-screen" "없음"
has_arg "$F" "--sandbox" && has_arg "$F" "workspace" \
  && ok "샌드박스 workspace로 조임 (grok은 기본 off)" \
  || bad "--sandbox workspace" "없음 — grok은 샌드박스가 기본 off라 이게 빠지면 무제한 접근"
has_arg "$F" "--always-approve" \
  && ok "승인 우회 플래그" || bad "--always-approve" "없음"
[ "$(last_arg "$F")" = "$PROMPT" ] \
  && ok "프롬프트가 -p 값으로 전달" || bad "프롬프트가 -p 값" "got: $(last_arg "$F")"
! has_arg "$F" "-m" \
  && ok "모델 미지정이 기본 (KKIRIKKIRI_GROK_MODEL 없을 때)" \
  || bad "모델 미지정 기본" "-m이 붙었다"

# ── grok 모델 오버라이드 ──
echo "[grok + KKIRIKKIRI_GROK_MODEL]"
jobdir="$TMP/job-grok-model"; mkdir -p "$jobdir"
printf '%s' "$PROMPT" > "$jobdir/prompt.txt"
argvfile="$TMP/argv-grok-model.txt"; : > "$argvfile"
FAKE_ARGV_FILE="$argvfile" HOME="$TMP/fakehome" PATH="$FAKEBIN:$PATH" KKIRIKKIRI_GROK_MODEL="grok-4.5" \
  node "$WORKER" --job-dir "$jobdir" --provider grok --timeout 30 >/dev/null 2>&1
has_arg "$argvfile" "-m" && has_arg "$argvfile" "grok-4.5" \
  && ok "환경변수로 모델 핀 가능" || bad "모델 핀" "-m grok-4.5가 없음"

# ── 미지원 프로바이더 거부 ──
echo "[미지원 프로바이더]"
jobdir="$TMP/job-bogus"; mkdir -p "$jobdir"; printf 'x' > "$jobdir/prompt.txt"
PATH="$FAKEBIN:$PATH" node "$WORKER" --job-dir "$jobdir" --provider bogus >/dev/null 2>&1
rc=$?
[ "$rc" -ne 0 ] && ok "미지원 프로바이더는 0이 아닌 코드로 종료 (rc=$rc)" \
  || bad "미지원 프로바이더 거부" "rc=0으로 통과했다"
grep -q "Unsupported provider" "$jobdir/status.json" 2>/dev/null \
  && ok "status.json에 사유 기록" || bad "status.json 사유" "Unsupported provider 문구 없음"

# ── PROVIDER_BINARIES 와 워커 분기의 정합성 ──
echo "[프로바이더 목록 정합성]"
for p in codex antigravity gjc grok; do
  out=$(PATH="$FAKEBIN:$PATH" node "$JOB_SCRIPT" check "$p" 2>&1)
  case "$out" in
    *"found at"*) ok "check $p → found" ;;
    *) bad "check $p" "got: $out" ;;
  esac
done
out=$(node "$JOB_SCRIPT" check bogus 2>&1)
case "$out" in
  *"unsupported provider"*) ok "check bogus → unsupported" ;;
  *) bad "check bogus" "got: $out" ;;
esac

# ── PATH 선점: 구현이 ~/.grok/bin 을 PATH 앞에 붙이는지 ──
# (실제 HOME 사용. ~/.grok/bin 이 있으면 가짜 grok을 무시하고 그쪽을 잡아야 한다.)
echo "[PATH 선점]"
if [ -d "$HOME/.grok/bin" ]; then
  out=$(PATH="$FAKEBIN:$PATH" node "$JOB_SCRIPT" check grok 2>&1)
  case "$out" in
    *"$HOME/.grok/bin/grok"*) ok "가짜 바이너리가 PATH 앞에 있어도 ~/.grok/bin 을 선점" ;;
    *) bad "PATH 선점" "got: $out (서드파티 @vibe-kit/grok-cli 가 잡힐 위험)" ;;
  esac
else
  printf '  \033[0;33m△\033[0m ~/.grok/bin 없음 — PATH 선점 케이스 건너뜀\n'
fi

# ── 결과 ──
echo "────────────────────────────────────────"
echo "$PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ] || exit 1
