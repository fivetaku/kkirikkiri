#!/bin/bash
# test-step36-routing.sh — Step 3.6 실행형태 라우팅 규칙 회귀 테스트
#
# SKILL.md의 신호 표를 **문서에서 직접 읽어** 시나리오를 라우팅한다.
# 표를 고치면 이 테스트가 따라간다(하드코딩 아님).
# 지키는 것: 신호 없으면 안 묻고 병렬(과잉질문 가드), 있으면 되묻기.
set -u
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec python3 "$SCRIPT_DIR/step36_routing.py" "$SCRIPT_DIR/../skills/kkirikkiri/SKILL.md"
