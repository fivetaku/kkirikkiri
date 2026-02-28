#!/bin/bash
# check-env.sh — 끼리끼리 설치 환경 점검
#
# Usage: bash check-env.sh
#
# 필수 조건과 선택 조건을 확인하고 결과를 출력합니다.

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; }
warn() { echo -e "  ${YELLOW}△${NC} $1"; }

echo ""
echo "끼리끼리 환경 점검"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 필수 조건 ──

echo ""
echo "필수 조건:"

REQUIRED_OK=true

# Claude Code
if command -v claude &>/dev/null; then
  pass "Claude Code 설치됨"
else
  fail "Claude Code 미설치 — https://claude.ai/download"
  REQUIRED_OK=false
fi

# Agent Teams 환경변수
SETTINGS_FILE="$HOME/.claude/settings.json"
if [ -f "$SETTINGS_FILE" ] && grep -q "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS" "$SETTINGS_FILE" 2>/dev/null; then
  pass "Agent Teams 환경변수 설정됨"
else
  fail "Agent Teams 환경변수 미설정"
  echo ""
  echo "    다음을 ~/.claude/settings.json에 추가하세요:"
  echo '    { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }'
  REQUIRED_OK=false
fi

# tmux
if command -v tmux &>/dev/null; then
  pass "tmux 설치됨 ($(tmux -V 2>/dev/null || echo 'version unknown'))"
else
  fail "tmux 미설치 — brew install tmux (macOS) / apt install tmux (Linux)"
  REQUIRED_OK=false
fi

# Node.js (run-cli.sh 실행용)
if command -v node &>/dev/null; then
  pass "Node.js 설치됨 ($(node --version 2>/dev/null))"
else
  fail "Node.js 미설치 — https://nodejs.org"
  REQUIRED_OK=false
fi

# ── 선택 조건 ──

echo ""
echo "선택 조건 (멀티 모델):"

if command -v codex &>/dev/null; then
  pass "Codex CLI 설치됨 — 코드 분석/리뷰 역할 활용 가능"
else
  warn "Codex CLI 미설치 — npm i -g @openai/codex (없어도 동작)"
fi

if command -v gemini &>/dev/null; then
  pass "Gemini CLI 설치됨 — 대규모 분석 역할 활용 가능"
else
  warn "Gemini CLI 미설치 — npm i -g @google/gemini-cli (없어도 동작)"
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
  echo -e "${GREEN}모든 필수 조건이 충족되었습니다. /kkirikkiri를 사용할 수 있어요!${NC}"
else
  echo -e "${RED}필수 조건이 충족되지 않았습니다. 위의 안내를 따라 설정해주세요.${NC}"
fi

echo ""
