# 환경 스캔 상세 (SKILL.md Step 2에서 옮김)

> SKILL.md Step 2는 스캔 명령과 결과 변수만 둔다. Auto-memory 활용·에이전트 동적 매칭·재활용·MCP 확인 상세는 여기 있다.

### Auto-memory 활용

Auto-memory를 2가지 용도로 활용한다:

**1. 환경 캐싱 (시작 속도 향상):**
- 이전 스캔 결과가 있으면 빠른 확인만 수행 (변경 없으면 "이전과 동일한 환경입니다" 한 줄로 진행)
- 선호 프리셋/팀 구성 패턴이 기억에 있으면 인터뷰 시 "(기억 기반 추천)" 표시

**2. 공유 컨텍스트 인덱스 (팀원 교체 대응):**
팀원이 교체되면 새 팀원은 기존 맥락을 모른다. 팀장이 팀원 프롬프트에 공유 문서 인덱스를 포함하여 교체된 팀원이 즉시 따라잡을 수 있게 한다.

팀장이 교체 팀원에게 전달할 컨텍스트 인덱스:
```
프로젝트 공유 메모리 (반드시 읽을 것):
- {KKIRIKKIRI_DIR}/TEAM_PLAN.md — 전체 계획 + 역할 배분 (최우선)
- {KKIRIKKIRI_DIR}/TEAM_PROGRESS.md — 현재 진행 상황
- {KKIRIKKIRI_DIR}/TEAM_FINDINGS.md — 지금까지 발견한 것들
- {KKIRIKKIRI_DIR}/TEAM_FINDINGS.md (DEAD_ENDS 섹션) — 실패한 접근 (이 방법은 하지 마)
```

교체 팀원 온보딩 순서: DEAD_ENDS(하지 말 것) → TEAM_PLAN(할 것) → PROGRESS(현재 상황) → FINDINGS(참고)

Step 8 완료 시, 이 인덱스 + 팀 구성/환경/결과를 자연어로 요약 출력하여 Auto-memory 저장을 유도한다.


### 에이전트 동적 매칭

`.claude/agents/` 스캔 결과에서 프리셋에 맞는 에이전트를 **description 기반으로 동적 매칭**한다.

#### 매칭 우선순위 (높은 순)

1. **recommended-for 필드 일치**: 에이전트 frontmatter에 `recommended-for: {현재 프리셋 id}`가 있으면 무조건 매칭
2. **agent_match_keywords 일치**: presets.md의 `agent_match_keywords`와 에이전트 description의 키워드가 2개 이상 겹치면 매칭
3. **범용 관련성 판단**: 위 두 방법으로 매칭 안 되면, 에이전트 description과 현재 팀 목표의 의미적 관련성으로 판단

#### 매칭 절차

```
1. ls .claude/agents/*.md 로 에이전트 목록 확인
2. 각 에이전트 파일의 frontmatter를 Read (limit=10)로 읽기
3. recommended-for 필드 확인 → 현재 프리셋 id와 일치하면 즉시 매칭
4. description에서 presets.md의 agent_match_keywords 키워드 포함 여부 확인
5. 매칭된 에이전트를 "기존에 설정된 전문가"로 팀에 우선 제안
```

> **주의**: 파일명으로 매칭하지 않는다. 반드시 description/recommended-for 내용을 읽고 판단한다.

### 기존 에이전트 재활용

`.claude/agents/` 에 기존 에이전트 파일이 있으면 팀에 활용할 수 있습니다.

#### 재활용 판단 기준

1. 기존 에이전트 파일의 frontmatter를 Read로 읽기 (description, recommended-for, team-compatible 확인)
2. 에이전트의 역할/도구/목표가 현재 팀 목적과 관련 있는지 판단 (동적 매칭 결과 활용)
3. 관련 있으면 → 해당 에이전트를 팀원으로 포함 (별도 스폰 불필요)
4. 관련 없으면 → 무시
5. team-compatible: false인 에이전트는 팀 편입 시 "팀 어댑터" 적용 (공유 메모리 + R&R 오버레이)

#### 재활용 방법

기존 에이전트를 팀에 포함할 때:

```
Task({
  name: "[에이전트-파일명]",
  subagent_type: "[에이전트-파일명]",  // .claude/agents/ 내 파일명
  model: selected_models[task_id],  // 승인된 선택값 (기본값 상속 금지)
  prompt: "[card-template.md §2-1 스폰 프롬프트 — 경계 + 브리프 + 공유 메모리 경로]"
})
```

- 기존 에이전트의 시스템 프롬프트에 공유 메모리 규칙을 **추가로** 덧붙임
- 기존 에이전트의 원래 역할은 그대로 유지
- 팀장에게 "이 팀원은 기존에 정의된 전문가입니다" 알림

#### 사용자 안내

기존 에이전트를 발견하면:
```
"기존에 설정된 전문가가 있어요: [에이전트 설명].
 팀에 포함시킬까요?"
```

### MCP 확인 방법

현재 세션에서 사용 가능한 MCP 도구가 있는지 확인한다:
- `mcp__perplexity__` 로 시작하는 도구 → Perplexity MCP 있음
- 기타 MCP 도구 → 해당 도구 활용 가능
