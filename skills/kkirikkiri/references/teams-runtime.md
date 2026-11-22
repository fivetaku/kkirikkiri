# Agent Teams 런타임 상세 (SKILL.md에서 옮김)

> 실행 경로는 SKILL.md에 있다. 여기는 레거시 마이그레이션, 외부 CLI 절차, 에러 대응 상세다.

## 팀 형성 확인 (SKILL.md Step 6-1, 첫 스폰 직후 1회)

```bash
SID=$(echo "${CLAUDE_CODE_SESSION_ID:-}" | cut -c1-8)
if [ -n "$SID" ] && [ -f "$HOME/.claude/teams/session-$SID/config.json" ]; then
  python3 -c "
import json,sys
c=json.load(open('$HOME/.claude/teams/session-$SID/config.json'))
mates=[m['name'] for m in c.get('members',[]) if m.get('agentType')!='team-lead']
print('TEAM_OK' if mates else 'NO_TEAMMATES', mates)
"
else
  echo "NO_TEAM_DIR"
fi
```

결과 해석은 SKILL.md Step 6-1에 있다.

## 레거시 마이그레이션 시임 (flat → session-scoped)
이전 버전(flat layout)의 `.kkirikkiri/TEAM_PLAN.md`가 존재하면 한 번만 마이그레이션한다.
`mkdir` 기반 락으로 동시 세션 간 레이스 컨디션을 방지한다.

```bash
# 레거시 감지 + 마이그레이션 (한 번만 실행)
if [ -f "{프로젝트루트}/.kkirikkiri/TEAM_PLAN.md" ]; then
  if mkdir "{프로젝트루트}/.kkirikkiri/.migration.lock" 2>/dev/null; then
    LEGACY_TS=$(date +%s)
    mkdir -p "{프로젝트루트}/.kkirikkiri/teams/legacy-${LEGACY_TS}"
    mv "{프로젝트루트}/.kkirikkiri/TEAM_PLAN.md" \
       "{프로젝트루트}/.kkirikkiri/teams/legacy-${LEGACY_TS}/" 2>/dev/null || true
    mv "{프로젝트루트}/.kkirikkiri/TEAM_PROGRESS.md" \
       "{프로젝트루트}/.kkirikkiri/teams/legacy-${LEGACY_TS}/" 2>/dev/null || true
    mv "{프로젝트루트}/.kkirikkiri/TEAM_FINDINGS.md" \
       "{프로젝트루트}/.kkirikkiri/teams/legacy-${LEGACY_TS}/" 2>/dev/null || true
    mv "{프로젝트루트}/.kkirikkiri/agents" \
       "{프로젝트루트}/.kkirikkiri/teams/legacy-${LEGACY_TS}/" 2>/dev/null || true
    mv "{프로젝트루트}/.kkirikkiri/prompts" \
       "{프로젝트루트}/.kkirikkiri/teams/legacy-${LEGACY_TS}/" 2>/dev/null || true
    mv "{프로젝트루트}/.kkirikkiri/agent-cache" \
       "{프로젝트루트}/.kkirikkiri/teams/legacy-${LEGACY_TS}/" 2>/dev/null || true
    echo "레거시 파일이 legacy-${LEGACY_TS}/로 이동되었습니다."
  fi
  # mkdir 실패 = 다른 세션이 이미 마이그레이션 중 → 스킵
fi
```

## 외부 CLI 실행 (Step 6-5 상세)

외부 CLI가 배정된 역할이 있으면, 팀장에게 다음 지시를 포함한다.
`--provider`는 `codex`(코드·대규모 분석) | `antigravity`(디자인/UI) | `gjc`(코드 구현·분석 + 교차검토, 멀티모델) | `grok`(코드 교차 검토) 중 환경 스캔에서 설치 확인된 것을 사용한다
(antigravity의 실제 바이너리는 `agy`다).

**검토 역할일 때는 적대적 프롬프트로:** 프롬프트 파일에 "검토해줘"가 아니라 **"다음 산출물의 결함을 찾아 반박하라(refute)"**로 쓴다. build와 다른 family가 검토하는 것이 원칙 — Sonnet/Opus가 만든 것은 Codex가 검토.

```
## 외부 AI 활용
Codex CLI로 [역할]을 수행합니다. 다음 절차를 따르세요:

1. 프롬프트 파일 작성:
   Write 도구로 {KKIRIKKIRI_DIR}/prompts/{task-id}.md에 분석 요청 작성

2. CLI 실행:
   Bash(run_in_background=true):
   "bash ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.sh start --provider codex --prompt-file {KKIRIKKIRI_DIR}/prompts/{task-id}.md"
   → 출력되는 JOB_DIR 경로를 저장
   (디자인/UI 역할은 --provider antigravity. 단 agy 1.0.x는
    비-TTY에서 stdout 출력이 비는 버그가 있어 results가 빈 경우 Claude 폴백 권장)
   (build를 codex가 했고 grok_cli=true이면 코드 교차 검토는 --provider grok으로 수행한다.
    grok_cli=false이면 설치 확인된 다른 family의 검토자를 선택한다. 다른 family가 없으면
    기존 Claude 독립 에이전트의 적대적 검토로 폴백하고 교차모델 검증은 미실시로 기록한다.
    미설치 CLI를 실행하거나 설치·인증을 강제하지 않는다.)

3. 완료 대기:
   Bash: "bash ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.sh wait JOB_DIR"

4. 결과 확인:
   Bash: "bash ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.sh results JOB_DIR"

5. 결과를 TEAM_FINDINGS.md에 기록
6. 작업 디렉토리 정리:
   Bash: "bash ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.sh clean JOB_DIR"
```

## 에러 처리

### 팀원 무응답/오류 (TeammateIdle 품질 훅)

팀원이 유휴(idle) 상태가 되면 자동 알림이 옵니다. 3단계 에스컬레이션으로 관리:

| 단계 | 상태 | 대응 |
|------|------|------|
| **1회 idle** | 정상 | 무시 — 메시지 보내고 응답 대기 중일 수 있음 |
| **2회 연속 idle** | 주의 | 팀장에게 확인 요청: "이 팀원이 진행 중인지 확인해주세요" |
| **3회 연속 idle** | 조치 | 팀장에게 교체 지시: "이 팀원이 멈춘 것 같습니다. 해고하고 새 팀원을 요청하세요" |

팀장에게 전달할 품질 훅 지시:
```
## 팀원 모니터링 규칙
- 팀원이 태스크를 받고 오랫동안 진행 보고가 없으면 → SendMessage로 진행 상황 확인
- 확인 후에도 응답 없으면 → shutdown_request 후 메인 세션에 교체 요청
- 팀원이 같은 실수를 2회 반복하면 → 즉시 교체 요청 (kill criteria)
```

- 팀원 에러 발생 → 팀장이 판단하여 재시도 또는 다른 팀원에게 재배정

### 심부름꾼 관리

- 심부름꾼이 응답 없음 → 팀원이 직접 해당 작업 수행 또는 새 심부름꾼 스폰
- 심부름꾼 결과 품질 낮음 → 팀원이 직접 보완 또는 다른 심부름꾼에게 재지시

### CLI 실행 실패

- 선택한 CLI/모델 실행 실패 → 실패를 알리고 재시도·대체 모델·취소를 선택받는다. 승인 전에 Claude(Opus) 등으로 자동 대체하지 않는다.
- 사용자에게 기술적 에러 메시지 그대로 노출 금지
- 대신: "외부 도구에서 문제가 생겼어요. 다시 시도할지, 다른 모델로 바꿀지 골라 주세요" 수준으로 안내하고, 사용자가 대체를 승인한 뒤에만 바꾼다

### 인터뷰 중단

- 사용자가 인터뷰 중 취소 → 즉시 종료, 팀 생성하지 않음
- "언제든 다시 시작할 수 있어요" 안내

