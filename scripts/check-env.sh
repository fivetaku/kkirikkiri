#!/bin/bash
# check-env.sh — 끼리끼리 설치 환경 점검
#
# Usage: bash check-env.sh
#
# 필수: Claude Code + Node.js + 실행 방식 최소 1개
#   - 작전 통제실(Agent Teams): CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 설정
#   - 공정 라인(Workflows):     Claude Code 버전 ≥ 2.1.154

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

WORKFLOWS_MIN="2.1.154"

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}△${NC} $1"; }

# semver 비교: $1 >= $2 이면 0
semver_gte() {
  [ "$(printf '%s\n%s\n' "$2" "$1" | sort -V | head -1)" = "$2" ]
}

echo ""
echo "끼리끼리 환경 점검"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 필수 조건 ──

echo ""
echo "필수 조건:"

REQUIRED_OK=true
CLAUDE_VERSION=""

# Claude Code
if command -v claude &>/dev/null; then
  CLAUDE_VERSION_TEXT=$(claude --version 2>/dev/null || echo "")
  CLAUDE_VERSION=$(echo "$CLAUDE_VERSION_TEXT" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || echo "")
  pass "Claude Code 설치됨 (${CLAUDE_VERSION_TEXT:-version unknown})"
else
  fail "Claude Code 미설치 — https://claude.ai/download"
  REQUIRED_OK=false
fi

# Node.js (run-cli.sh 실행용)
if command -v node &>/dev/null; then
  pass "Node.js 설치됨 ($(node --version 2>/dev/null))"
else
  fail "Node.js 미설치 — https://nodejs.org"
  REQUIRED_OK=false
fi

# ── 실행 방식 (둘 중 최소 1개) ──

echo ""
echo "실행 방식 (둘 중 최소 1개 필요):"

# 작전 통제실 (Agent Teams)
SETTINGS_FILE="$HOME/.claude/settings.json"
TEAMS_ENABLED=false
if [ -f "$SETTINGS_FILE" ] && grep -q "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" "$SETTINGS_FILE" 2>/dev/null; then
  TEAMS_ENABLED=true
  pass "작전 통제실(Agent Teams) 사용 가능 — 환경변수 설정됨"
else
  warn "작전 통제실(Agent Teams) 비활성 — 사용하려면 ~/.claude/settings.json에 추가:"
  echo '      { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }'
fi

# 공정 라인 (Workflows) — Claude Code 버전 ≥ 2.1.154
WORKFLOWS_AVAILABLE=false
if [ -n "$CLAUDE_VERSION" ] && semver_gte "$CLAUDE_VERSION" "$WORKFLOWS_MIN"; then
  WORKFLOWS_AVAILABLE=true
  pass "공정 라인(Workflows) 사용 가능 — Claude Code $CLAUDE_VERSION ≥ $WORKFLOWS_MIN"
elif [ -n "$CLAUDE_VERSION" ]; then
  warn "공정 라인(Workflows) 비활성 — Claude Code $CLAUDE_VERSION < $WORKFLOWS_MIN. 업데이트: claude update"
else
  warn "공정 라인(Workflows) 확인 불가 — Claude Code 버전을 읽지 못했습니다"
fi

if [ "$TEAMS_ENABLED" = false ] && [ "$WORKFLOWS_AVAILABLE" = false ]; then
  fail "실행 방식이 하나도 없습니다 — 위 안내에 따라 둘 중 하나를 켜주세요"
  REQUIRED_OK=false
fi

# tmux (선택 — Agent Teams는 in-process로 동작, tmux는 split-pane 표시용)
echo ""
echo "선택 조건 (표시):"
if command -v tmux &>/dev/null; then
  pass "tmux 설치됨 ($(tmux -V 2>/dev/null || echo 'version unknown')) — split-pane 표시 가능"
else
  warn "tmux 미설치 — in-process로 정상 동작 (split-pane 표시만 비활성). 원하면 brew/apt install tmux"
fi

# ── 선택 조건 (멀티 모델) ──

echo ""
echo "선택 조건 (멀티 모델):"

if command -v codex &>/dev/null; then
  pass "Codex CLI 설치됨 — 코드·대규모 분석 + cross-model 검토 활용 가능"
else
  warn "Codex CLI 미설치 — npm i -g @openai/codex (없어도 동작)"
fi

if command -v agy &>/dev/null; then
  pass "Antigravity CLI(agy) 설치됨 — 디자인/UI 역할 활용 가능 (Gemini CLI 대체본)"
else
  warn "Antigravity CLI(agy) 미설치 — curl -fsSL https://antigravity.google/cli/install.sh | bash (없어도 동작)"
fi

if command -v gh &>/dev/null; then
  pass "GitHub CLI 설치됨 — PR 관리 활용 가능"
else
  warn "GitHub CLI 미설치 (없어도 동작)"
fi

# ── 결과 ──

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$REQUIRED_OK" = true ]; then
  MODES=""
  [ "$TEAMS_ENABLED" = true ] && MODES="작전 통제실"
  if [ "$WORKFLOWS_AVAILABLE" = true ]; then
    [ -n "$MODES" ] && MODES="$MODES + 공정 라인" || MODES="공정 라인"
  fi
  echo -e "${GREEN}필수 조건 충족 (사용 가능: $MODES). /kkirikkiri를 사용할 수 있어요!${NC}"
else
  echo -e "${RED}필수 조건이 충족되지 않았습니다. 위의 안내를 따라 설정해주세요.${NC}"
  exit 1
fi

echo ""
