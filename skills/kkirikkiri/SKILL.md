---
name: kkirikkiri
description: Auto-assembles and runs an AI agent team from one natural-language sentence — interviews the user with 2-3 questions, proposes specialized agents, then executes in parallel. Korean triggers: "/kkirikkiri", "팀 만들어줘", "리서치 팀", "끼리끼리", "팀 구성해줘". English triggers: "build a team", "research team", "agent team", "kkirikkiri".
---

# 끼리끼리 Team Builder Skill

> 자연어 한마디 → 인터뷰 → 환경 스캔 → 팀 구성 → 실행 → 리포트

사용자의 자연어 요청을 받아 목적에 맞는 AI 에이전트 팀을 구성하고 실행한다.

---

## WHEN TRIGGERED - EXECUTE IMMEDIATELY

**이 문서는 참고 문서가 아니라 실행 지시서다.**
- 첫 번째 action: 사전 준비(`presets.md` 읽기) 후 즉시 Step 1로 진행
- 이후 각 Step 진입 시 본문의 `EXECUTE NOW: Read(...)` 박스를 즉시 실행한다 (per-step lazy read)
- 텍스트 출력 후 질문하지 않는다. 도구를 먼저 호출한다.
- 모든 질문은 AskUserQuestion 도구 호출로만 진행한다.
- **AskUserQuestion 응답 수신 후 즉시 다음 Step으로 계속 진행한다.** 응답 요약/텍스트만 출력하고 종료하면 워크플로우 위반 — 반드시 다음 Step의 Read 박스나 도구 호출을 이어서 실행한다.

---

## 사전 준비

이 스킬이 호출되면 즉시 다음 레퍼런스 파일을 읽는다:
- `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/presets.md` — 프리셋 정의 + 인터뷰 질문 (Step 1 매칭에 필수)

**Per-step EXECUTE Read 인덱스 — 각 Step 본문의 `EXECUTE NOW` 박스가 실제 트리거다:**

| Step 진입 | Read 대상 |
|----------|-----------|
| Step 3 진입 | `interview-guide.md` + `metaphor-guide.md` |
| Step 4 진입 | `agency-agents-catalog.md` (Tier 2 진입 시 agency-agents README 추가 fetch) |
| Step 6-2 진입 | `shared-memory.md` |
| Step 6-4 진입 | `team-prompts.md` |
| Step 7-6 진입 | `validation-guide.md` |
| Step 8-2 직후 | `output-guide.md` |

> 위 표는 인덱스다. 실제 도구 호출은 각 Step 본문의 `🚨 EXECUTE NOW: Read(...)` 박스를 발견하면 즉시 실행한다. 박스를 건너뛰지 말 것.

**KKIRIKKIRI_DIR 변수 — 세션 격리 경로 placeholder:**
```
KKIRIKKIRI_DIR={프로젝트루트}/.kkirikkiri/teams/{team_name}
```
실제 값은 Step 6-1에서 `team_name` 생성과 함께 substitute된다. Step 2/4/team-prompts에서 미리 참조될 때는 placeholder 형태로 유지하고, Step 6-1 이후에는 실제 경로로 substitute한다.

**PM 프리셋 매칭 시 추가로 읽는다:**
- `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/pm-frameworks.md` — PM 프레임워크 레퍼런스 (PRD, OST, Strategy Canvas 등)

---

## 워크플로우 개요

```
Step 1: 의도 파악 + 프리셋 매칭
Step 2: 환경 스캔 (백그라운드)
Step 3: 인터뷰 (AskUserQuestion)
Step 4: 동적 팀 구성
Step 5: 팀 구성 제안 + 유저 확인
Step 6: 팀 생성 + 공유 메모리 초기화 + 실행
Step 7: 검증 루프 (품질이 충분할 때까지 반복)
Step 8: 결과 수집 + 리포트
```

### 핵심 운영 원칙

**1. 기억 외부화**: 클로드의 기억력을 믿지 마. 중요한 결정은 반드시 파일에 기록.
**2. 심부름꾼 패턴**: 팀원은 필요하면 하위 에이전트를 스폰하여 병렬 작업 가능.
**3. 검증 루프**: 1라운드 결과가 부족하면 팀을 재구성하여 2라운드 진행.

---

## Step 1: 의도 파악 + 프리셋 매칭

사용자의 자연어 입력에서 키워드를 추출하여 프리셋을 매칭한다.

### 매칭 규칙 (presets.md의 keywords 참조)

| 프리셋 | 키워드 |
|--------|--------|
| research | 조사, 리서치, 찾아줘, 알아봐줘, 검색, 분석해줘, 비교해줘 |
| development | 만들어줘, 구현해줘, 개발해줘, 코딩해줘, 기능 추가, 리팩토링 |
| analysis | 분석해줘, 파악해줘, 구조 분석, 코드 분석, 리뷰해줘, 검토해줘 |
| content | 문서, README, 작성해줘, 써줘, 블로그, 가이드, 튜토리얼 |
| product | PRD, 전략, 기획, OKR, 로드맵, 가설, 검증, 디스커버리, 페르소나, GTM, 런칭, 경쟁분석, 시장분석, 비즈니스모델, 가격, 포지셔닝, North Star, 사용자스토리, 스프린트 |

### 입력 모드

| 모드 | 입력 예시 | 처리 |
|------|----------|------|
| **자연어** (기본) | "리서치 팀 만들어줘" | 키워드 매칭 → 프리셋 → 인터뷰 |
| **파일 지정** | "@deep-research 팀으로 실행해줘" | 파일 분석 → 역할 자동 분해 |

#### 파일 모드 처리

사용자 입력에 `@파일명` 또는 파일 경로가 포함되면:

1. 해당 파일을 Read로 읽기 (`.claude/agents/*.md`, 스킬 파일, 일반 `.md` 등)
2. 파일 내용을 분석하여 필요한 역할 자동 추출:
   - 스킬 파일 → 스킬의 단계별 역할을 팀원으로 분해
   - 에이전트 파일 → 해당 에이전트를 팀원으로 포함
   - 일반 문서 → 문서 목표를 기반으로 프리셋 매칭
3. 인터뷰는 1-2개로 축소 (파일에서 대부분의 정보를 이미 파악했으므로)

```
사용자: "@deep-research 팀으로 실행해줘"
→ .claude/agents/deep-research.md 읽기
→ 에이전트의 역할/도구/목표 파악
→ 필요한 보조 역할 자동 설계
→ "이 에이전트를 중심으로 팀을 구성할게요. 추가로 뭘 도와줄까요?" (인터뷰 축소)
```

### 매칭 방법 (자연어 모드)
1. 사용자 입력에서 각 프리셋의 키워드 매칭 횟수를 세기
2. 가장 많이 매칭된 프리셋 선택
3. 동점이면 입력 문맥을 분석하여 가장 적합한 것 선택
4. **매칭 실패 시**: generic(범용) 인터뷰로 전환 (presets.md의 "범용 팀" 참조)

### 주의
- "분석해줘"는 research와 analysis 모두 매칭 가능 → 문맥으로 판단
  - "경쟁사 분석" → research (외부 정보 조사)
  - "코드 분석" → analysis (내부 코드 탐색)
- "경쟁분석"/"시장분석"은 product와 research 모두 매칭 가능 → 문맥으로 판단
  - "경쟁사 3곳 비교해줘" → research (단순 리서치)
  - "경쟁분석 + PRD 만들어줘" → product (PM 워크플로우)
  - "시장분석해서 전략 세워줘" → product (전략 수립 포함)
- "기획"/"전략"은 product 프리셋 강매칭 — 다른 프리셋보다 우선

---

## Step 2: 환경 스캔

인터뷰와 **병렬로** 환경을 스캔한다. Bash 도구로 아래를 확인한다.

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

### 스캔 항목

```bash
# 1. 외부 AI CLI 확인
command -v codex >/dev/null 2>&1 && codex --version
command -v gemini >/dev/null 2>&1 && gemini --version

# 2. 개발 도구 확인
command -v gh >/dev/null 2>&1    # GitHub CLI
command -v npm >/dev/null 2>&1   # npm
command -v bun >/dev/null 2>&1   # bun
command -v pnpm >/dev/null 2>&1  # pnpm

# 3. 기존 에이전트 파일 확인
ls ~/.claude/agents/*.md 2>/dev/null

# 4. agency-agents 설치 확인 (vibe 필드 = agency-agents 포맷)
ls ~/.claude/agents/*.md 2>/dev/null | xargs grep -l "^vibe:" 2>/dev/null | wc -l
```

### 스캔 결과 저장 (내부 변수로 관리)

스캔 결과를 다음 구조로 정리한다 (파일 저장 불필요, 메모리에만):

```
환경 정보:
- codex_cli: true/false (경로, 버전)
- gemini_cli: true/false (경로, 버전)
- gh_cli: true/false
- package_manager: npm/bun/pnpm
- existing_agents: [파일 목록]
- agency_agents_installed: true/false (vibe 필드 있는 파일 수 > 0)
- perplexity_mcp: true/false (MCP 도구 목록에서 perplexity 확인)
```

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
  team_name: "[팀이름]",
  name: "[에이전트-파일명]",
  subagent_type: "[에이전트-파일명]",  // .claude/agents/ 내 파일명
  model: "opus",
  prompt: "[팀 컨텍스트 + 공유 메모리 경로 추가]"
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

---

## Step 3: 인터뷰

> **🚨 EXECUTE NOW — Step 3 진입 즉시 실행:**
> ```
> Read("${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/interview-guide.md")
> Read("${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/metaphor-guide.md")
> ```
> 인터뷰 질문 설계 원칙, 바이브코더 대응 전략, 기술 용어→일상 표현 변환표가 여기 있다.
> 이 두 Read 호출 없이 AskUserQuestion을 호출하지 말 것.

presets.md에 정의된 프리셋별 인터뷰 질문을 **반드시 AskUserQuestion 도구를 호출하여** 진행한다. 질문/옵션을 텍스트로 출력하면 안 된다.

### 인터뷰 실행 규칙

1. **Q1만 스킵 가능, Q2/Q3는 반드시 AskUserQuestion으로 호출한다** (예외 없음)
   - Q1(열린 질문)은 사용자가 이미 자연어로 답한 경우에만 생략 가능
   - 예: "경쟁사 3곳 비교 리서치 해줘" → Q1("어떤 주제?")의 답이 이미 있음
   - Q2, Q3는 **절대 스킵하지 않는다**. 반드시 AskUserQuestion을 호출하여 사용자 선택을 받는다
   - "테스트", "진행해줘" 같은 모호한 입력은 Q1도 스킵하지 않는다

2. **EXECUTE:** presets.md의 프리셋별 질문을 아래 JSON 형식으로 변환한 후 AskUserQuestion 도구를 즉시 호출한다:

   ```json
   {
     "questions": [
       {
         "question": "결과물은 어떤 형태면 좋겠어요?",
         "header": "결과물",
         "options": [
           {"label": "종합 리포트 (추천)", "description": "깊이 있는 분석 문서. 여러 소스 교차 검증. 시간 좀 걸림."},
           {"label": "비교표", "description": "여러 옵션을 나란히 비교. 의사결정할 때 좋음."},
           {"label": "핵심 요약", "description": "1-2페이지. 빠르게 핵심만."},
           {"label": "잘 모르겠어요", "description": "종합 리포트로 갈게요."}
         ],
         "multiSelect": false
       }
     ]
   }
   ```

3. **AskUserQuestion 응답 수신 후 — Continuation Contract:**
   - 모든 질문 응답을 받으면 **즉시 Step 4로 진행한다**
   - 응답을 텍스트로 요약만 하고 멈추는 것은 워크플로우 위반
   - Step 4의 `EXECUTE NOW: Read(...)` 박스가 다음 액션이다 — 박스를 즉시 실행할 것

4. **절대 금지**:
   - 4개 이상 질문 금지
   - 기술 용어(Opus, Sonnet, MCP, Agent Teams) 유저에게 노출 금지
   - 설명 없이 옵션만 나열 금지

5. **generic 프리셋일 경우**:
   - Q1으로 목표 파악 → Q2로 유형 선택 → 해당 프리셋 인터뷰 이어서 진행

---

## Step 4: 동적 팀 구성

> **🚨 EXECUTE NOW — Step 4 진입 즉시 실행:**
> ```
> Read("${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/agency-agents-catalog.md")
> ```
> 10개 에이전트 패턴, 3-tier 선택 로직(설치→GitHub→동적생성), 프리셋별 매핑 테이블이 여기 있다.
> 이 Read 호출 없이 팀원 역할을 결정하지 말 것. Step 6 역할 파일 생성 시에도 이 파일 기준 밀도 사용.

인터뷰 답변 + 환경 스캔 결과를 종합하여 최종 팀을 구성한다.

### 구성 프로세스

1. **프리셋 기본 구성**에서 시작 (presets.md 참조)
2. **인터뷰 답변으로 조정**:
   - 리서치 Q3 "깊고 포괄적" → 확장 구성 (4-5명)
   - 개발 Q3 "테스트도 같이" → Tester 추가
   - 분석 Q2에서 여러 관점 선택 → Explorer 역할 세분화
3. **환경 스캔으로 조정**:
   - Codex CLI 있음 → 코드 리뷰/분석 역할에 외부 CLI 배정
   - Gemini CLI 있음 → 디자인/대규모 분석에 외부 CLI 배정
   - Perplexity MCP 있음 → 리서치 팀원에게 도구로 배정
   - gh CLI 있음 → 개발 팀에 PR 관리 가능 알림

### 에이전트 선택 3단계 (토큰 효율 순)

각 팀원의 역할이 결정되면 아래 순서로 에이전트를 선택한다. **agency-agents-catalog.md의 프리셋별 매핑 테이블 참조.**

**Tier 1 — 설치된 agency-agents 직접 사용 (토큰 0)**
```
agency_agents_installed = true 이면:
  카탈로그 매핑에서 후보 에이전트명 확인 (예: engineering-rapid-prototyper)
  ls ~/.claude/agents/{에이전트명}.md 존재 확인
  존재하면 → subagent_type: "{에이전트명}", prompt에는 컨텍스트만 추가
  없으면 → Tier 2로
```

**Tier 2 — README 인덱스 기반 온디맨드 페치**
```
조건: 역할이 구체적이고 전문 도메인이 명확할 때 (확신 80% 이상)
  → agency-agents-catalog.md의 Tier 2 절차 참조
     (README fetch → When to Use 매칭 → 개별 파일 fetch → 캐시)

캐시 확인 먼저: {KKIRIKKIRI_DIR}/agent-cache/{filename}.md 존재하면 fetch 없이 즉시 사용
캐시 없으면: README fetch → 매칭 → 개별 파일 fetch → 캐시에 Write

✅ 페치 예: "Godot 멀티플레이어", "Solidity 감사자", "리액트 UI 구현"
❌ Tier 3으로: "개발자", "리서처", "분석가" (너무 일반적, When to Use 명확히 매핑 불가)

  → 확신 80% 미만이면 즉시 Tier 3 (fetch 비용 > 생성 비용)
  subagent_type: "general-purpose"
```

**Tier 3 — 내제화 카탈로그 기반 동적 생성 (기본값)**
```
조건: Tier 1/2 해당 없거나 일반적인 역할
  agency-agents-catalog.md의 10개 패턴 중 가장 유사한 것 참고
  패턴 구조 (정체성→핵심미션→절대규칙→성공기준→소통방식) 따라 프롬프트 생성
  subagent_type: "general-purpose"
```

### 모델 배정 규칙 (절대 준수)

| 역할 | 모델 | 비고 |
|------|------|------|
| Lead (팀장) | **Opus** | 무조건. 예외 없음 |
| 핵심 작업자 | **Opus** | 기본값 |
| 보조 작업자 | **Sonnet** | 최소한으로만 |
| Haiku | **사용 금지** | 어떤 역할에도 배정하지 않음 |
| 외부 분석 | **Codex CLI** | CLI 없으면 Opus로 폴백 |
| 외부 디자인/분석 | **Gemini CLI** | CLI 없으면 Sonnet으로 폴백 |

### 팀장 R&R (절대 준수)

- 팀장은 **코드를 짜지 않는다**
- 팀장은 **직접 검색하지 않는다**
- 팀장은 **직접 문서를 작성하지 않는다**
- 팀장은 **계획 수립, 태스크 분배, 결과 검증, 최종 통합**만 수행
- 팀장이 직접 작업하면 R&R 위반

### CLI 없을 때 폴백

외부 CLI(Codex/Gemini)가 없는 경우:

1. 사용자에게 안내 (기술 용어 없이):
   ```
   "추가 AI 도구가 있으면 더 전문적인 분석이 가능해요.
    설치하시겠어요? (선택사항이에요, 없어도 잘 동작해요)"
   ```
2. 사용자가 거절하면 → 해당 역할을 Claude(Opus 또는 Sonnet)로 대체
3. 사용자가 수락하면 → 설치 명령어 안내 후 재스캔

---

## Step 5: 팀 구성 제안 + 유저 확인

최종 팀 구성을 사용자에게 보여주고 확인을 받습니다.

### 제안 형식

```
이렇게 팀을 구성할게요:

📋 목표: [인터뷰에서 파악한 목표]

팀 구성:
├── 팀장 — [구체적 역할 설명] (가장 똑똑한 AI)
├── [역할명 1] — [구체적 역할 설명] (전문 AI)
├── [역할명 2] — [구체적 역할 설명] (전문 AI)
└── (선택) [외부 도구] — [역할 설명] (백그라운드)

예상 작업 방식:
1. 팀장이 전체 계획을 세우고 각자 역할을 배분합니다
2. 팀원들이 동시에 작업을 수행합니다
3. 팀장이 결과를 검증하고 통합합니다
4. 최종 리포트를 생성합니다

⏱️ 예상 소요 시간: [규모에 따라 10-30분]

📁 팀원 역할 파일 (시작 후 생성됩니다):
  {KKIRIKKIRI_DIR}/agents/[팀장명].md
  {KKIRIKKIRI_DIR}/agents/[역할명1].md
  {KKIRIKKIRI_DIR}/agents/[역할명2].md

이대로 진행할까요?
```

### 비용/시간 안내 규칙

유저에게 팀 구성을 제안할 때, **예상 소요 시간**을 반드시 안내한다.

| 팀 규모 | 예상 소요 시간 |
|---------|---------------|
| 기본 3명 | 10-15분 |
| 확장 4-5명 | 15-25분 |
| 외부 CLI 포함 | +5-10분 |

비용 절약 힌트도 제공:
```
💡 팁: 빠르게 핵심만 필요하면 팀 규모를 줄일 수 있어요.
   대신 깊이가 좀 얕아질 수 있어요.
```

### 모델 비유 용어 (유저에게 보여줄 때)

| 내부 모델명 | 유저에게 보여줄 표현 | 설명 |
|------------|-------------------|------|
| Opus | "가장 똑똑한 AI" | 복잡한 판단, 기획, 통합에 적합 |
| Sonnet | "전문 AI" 또는 "균형잡힌 AI" | 실행력 좋고 효율적 |
| Codex CLI | "코드 전문 AI" | 코드 분석/리뷰 특화 |
| Gemini CLI | "대규모 분석 AI" | 큰 파일/많은 문서 처리에 강함 |

### 제안 시 금지사항
- 모델명(Opus, Sonnet) 노출 금지
- 기술 용어(TeamCreate, Task, MCP) 노출 금지
- 위의 비유 용어표를 사용하여 일상 용어로 설명

### 유저 확인

AskUserQuestion의 `preview` 필드 또는 일반 텍스트로 팀 구성을 보여주고, 확인을 받는다.

**Step 5-1: 팀 구성을 일반 텍스트로 출력**

제안 형식(위 섹션)에 따라 팀 구성 트리 + 예상 소요시간을 일반 텍스트로 출력한다.
이 텍스트는 접히지 않고 항상 사용자에게 보인다.

**Step 5-2: AskUserQuestion으로 확인만 받기**

**EXECUTE:** 텍스트 출력 직후 AskUserQuestion 도구를 즉시 호출한다:

```json
{
  "questions": [
    {
      "question": "이 팀 구성으로 시작할까요?",
      "header": "팀 확인",
      "options": [
        {
          "label": "네, 시작해주세요 (추천)",
          "description": "위 구성대로 팀을 만들고 바로 작업을 시작합니다."
        },
        {
          "label": "팀원을 조정하고 싶어요",
          "description": "역할이나 인원수를 바꿀 수 있어요."
        },
        {
          "label": "처음부터 다시",
          "description": "인터뷰를 다시 진행합니다."
        }
      ],
      "multiSelect": false
    }
  ]
}
```

**응답 처리 (Continuation Contract — 응답 수신 후 즉시 실행, 텍스트만 출력하고 멈춤 금지):**
- "네, 시작해주세요" → 즉시 Step 6-1의 team_name 생성 + KKIRIKKIRI_DIR 정의 + TeamCreate 호출로 진행
- "조정하고 싶어요" → 어떤 부분을 바꿀지 추가 AskUserQuestion 호출 후 Step 4 재실행
- "처음부터 다시" → Step 1로 복귀, presets 재매칭부터 시작

---

## Step 6: 팀 생성 + 공유 메모리 + 실행

확인을 받으면 Claude Code Agent Teams를 사용하여 팀을 생성하고 실행한다.

### 6-1. 팀 생성

> **SESSION-SCOPED PATHS — 이 단계에서 KKIRIKKIRI_DIR을 정의한다. 이후 모든 파일 경로는 이 변수를 기준으로 한다.**

#### team_name 생성

```bash
# timestamp: YYYYMMDD-HHMM (8+4 = 12자)
# rand4: 4자리 랜덤 hex (충돌 방지)
RAND4=$(openssl rand -hex 2 2>/dev/null || printf '%04x' $((RANDOM % 65536)))
team_name="kkirikkiri-{preset}-$(date +%Y%m%d-%H%M)-${RAND4}"
# 예: kkirikkiri-research-20260503-1430-a3f2
```

#### KKIRIKKIRI_DIR 정의

```
KKIRIKKIRI_DIR={프로젝트루트}/.kkirikkiri/teams/{team_name}
```

> **이 변수를 세션 전체에서 일관되게 사용한다. 모든 팀 파일은 이 경로 아래에 생성된다.**

#### 사용자에게 team_name 출력

팀 생성 직후 사용자에게 세션 핸들을 알린다:

```
팀이 생성되었습니다.
세션 ID: {team_name}
작업 디렉토리: {KKIRIKKIRI_DIR}
```

#### 레거시 마이그레이션 시임 (flat → session-scoped)

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

#### 세션 디렉토리 생성

```bash
mkdir -p {KKIRIKKIRI_DIR}/{agents,prompts,agent-cache,archive}
mkdir -p {프로젝트루트}/.kkirikkiri/shared/saved-teams
```

#### TeamCreate 호출

```
TeamCreate({
  team_name: "{team_name}",
  description: "[팀 목표 요약]"
})
```

team_name 예시: `kkirikkiri-research-20260503-1430-a3f2`

### 6-2. 공유 메모리 초기화 (기억 외부화)

> **클로드의 기억력을 믿지 마. 중요한 결정은 반드시 파일에 기록.**
> 대화가 길어지면 오래된 내용이 압축되어 까먹는다.
> 파일에 기록하면 기억이 날아가도 파일만 읽으면 복구된다.

팀 생성 직후, 프로젝트 루트에 공유 메모리 파일 3종을 생성한다.

> **🚨 MANDATORY READ — 공유 메모리 초기화 전 반드시 실행:**
> ```
> Read("${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/shared-memory.md")
> ```
> 세션 격리 모델, TEAM_PLAN/PROGRESS/FINDINGS 파일 템플릿, 공유 메모리 규칙이 모두 여기 있다.
> 이 파일을 읽지 않고 공유 메모리를 초기화하지 말 것.

### 6-2.5. 에이전트 정의 문서 생성

팀원 스폰 전에 각 팀원의 역할 정의를 `{KKIRIKKIRI_DIR}/agents/`에 파일로 저장한다.

**왜 필요한가:**
- 팀원이 기억을 잃었을 때 파일 읽으면 역할 즉시 복구
- 팀 해산 후 재구성 시 동일한 역할 파일 재사용
- 팀장이 팀원에게 "당신 역할 파일 읽어" 지시 가능
- 교체 팀원이 전임자 역할을 파악하는 온보딩 문서

디렉토리는 Step 6-1에서 이미 생성됨 (`mkdir -p {KKIRIKKIRI_DIR}/agents`).

각 팀원마다 아래 **압축 포맷**으로 Write (전체 프롬프트 복사 금지):

```
파일 경로: {KKIRIKKIRI_DIR}/agents/{역할명}.md
목표 크기: 30-50줄 이내 (코드 예시, 긴 설명 제외)
```

```markdown
---
name: [역할명]
role: [프리셋]-[역할 유형]
team: [team_name]
model: [opus/sonnet]
source: [tier1-{subagent_type} | tier2-github | tier3-generated]
created: [timestamp]
---

# [역할명]

## 정체성
- **역할**: [한줄 전문성 정의]
- **성격**: [3-4개 형용사]
- **경험**: [도메인 + 성공/실패 패턴 한줄]

## 핵심 미션
- [핵심 업무 1]
- [핵심 업무 2]
- [핵심 업무 3]

## 절대 규칙
- [가장 중요한 제약 1]
- [가장 중요한 제약 2]
- 절대 [금지 사항]

## 성공 기준
- [측정 가능한 지표 1]
- [측정 가능한 지표 2]

## 공유 메모리
- 계획: {KKIRIKKIRI_DIR}/TEAM_PLAN.md
- 진행: {KKIRIKKIRI_DIR}/TEAM_PROGRESS.md
- 발견: {KKIRIKKIRI_DIR}/TEAM_FINDINGS.md
```

**압축 기준 (중간 밀도 — 역할 수행 가능 + 토큰 절약):**

| 포함 | 제외 |
|------|------|
| 정체성 (역할·성격·경험) 3-4줄 | 코드 예시 |
| 핵심 미션 불릿 5-7개 | 단계별 워크플로우 설명 |
| 절대 규칙 3-5개 | 소통 스타일 예시 문장 |
| 성공 기준 3-4개 | 기술 스택 세부 설명 |
| 공유 메모리 경로 | 도구 사용법 상세 |

목표: 에이전트가 파일 읽고 즉시 역할 수행 가능한 최소 정보.
agency-agents-catalog.md의 10개 압축 포맷이 기준 밀도.

**팀원 스폰 시 프롬프트에 자신의 파일 경로 포함:**
```
## 내 역할 정의 파일
{KKIRIKKIRI_DIR}/agents/{역할명}.md
컨텍스트가 흐릿해지면 이 파일을 Read로 다시 읽어 역할을 복구하세요.
```

**팀장 프롬프트에 전체 팀원 파일 인덱스 포함:**
```
## 팀원 역할 파일 인덱스
- {KKIRIKKIRI_DIR}/agents/[팀원1].md — [역할 한줄 설명]
- {KKIRIKKIRI_DIR}/agents/[팀원2].md — [역할 한줄 설명]
팀원이 역할을 혼동하면 해당 파일을 읽도록 지시하세요.
```

**아카이빙 규칙:**
- `agents/` 디렉토리는 세션 디렉토리(`{KKIRIKKIRI_DIR}/agents/`) 안에 격리됨 — 세션 간 충돌 없음
- Phase 1: 세션이 끝나도 `{KKIRIKKIRI_DIR}/` 전체가 유지됨 (참조 가능)
- `saved-teams/`에 팀 저장 시 `{KKIRIKKIRI_DIR}/` 경로를 함께 기록하여 재구성 가능

### 6-3. 태스크 생성

팀장이 수행할 전체 작업 계획을 기반으로 TaskCreate로 태스크를 생성한다.

```
TaskCreate({
  subject: "[태스크 제목]",
  description: "[구체적 작업 내용, 기대 결과물, 제약사항]",
  activeForm: "[진행 중 표시 텍스트]"
})
```

태스크 예시 (리서치 팀):
1. "리서치 계획 수립" — 팀장이 소스 배분, 검색 전략 결정
2. "웹 리서치 수행" — 리서처 1이 최신 뉴스/블로그 조사
3. "문서 리서치 수행" — 리서처 2가 공식 문서/학술 자료 조사
4. "결과 통합 + 리포트" — 팀장이 검증/통합, 리포트 작성 지시

### 6-4. Claude 팀원 스폰

각 팀원을 Task 도구로 스폰한다. **Step 4의 3-tier 선택 결과에 따라 subagent_type 결정:**

```
// Tier 1: agency-agents 설치된 경우 → 전문 에이전트 직접 사용
Task({
  team_name: "{team_name}",
  name: "[팀원-이름]",
  subagent_type: "engineering-rapid-prototyper",  // 실제 설치된 파일명
  model: "opus",
  prompt: "[팀 컨텍스트 + 공유 메모리 경로 + 에이전트 파일 경로만 추가]"
})

// Tier 2/3: 미설치 or 동적 생성 → general-purpose + 압축 프롬프트
Task({
  team_name: "{team_name}",
  name: "[팀원-이름]",
  subagent_type: "general-purpose",
  model: "opus",
  prompt: "[6-2.5에서 생성한 {KKIRIKKIRI_DIR}/agents/{역할명}.md 읽기 지시 + 추가 컨텍스트]"
})
```

**Tier 2/3 프롬프트 핵심 패턴 (토큰 절약):**
역할 정의를 프롬프트에 직접 쓰지 않고 파일 읽기로 대체:
```
당신의 역할 정의가 파일에 저장되어 있습니다.
먼저 Read("{KKIRIKKIRI_DIR}/agents/{역할명}.md")로 읽고 역할을 파악하세요.
그 다음 아래 지시를 따르세요:
[태스크 지시]
```

### 팀원/팀장 프롬프트 작성

> **🚨 MANDATORY READ — 팀원 스폰 전 반드시 실행:**
> ```
> Read("${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/team-prompts.md")
> ```
> 팀원 프롬프트 전체 템플릿, 섹션별 작성법, 심부름꾼 활용법, 팀장 프롬프트, 스폰 재시도 로직이 모두 여기 있다.
> 이 파일을 읽지 않고 팀원/팀장을 스폰하지 말 것.


**팀장 프롬프트에 추가할 지시:**
팀장의 시스템 프롬프트(Step 6의 팀장 스폰 부분)에 다음 지시를 추가:
```
팀원이 응답하지 않거나 스폰에 실패하면:
1. 해당 팀원의 역할을 다른 팀원에게 재배분
2. 재배분이 불가하면 팀장이 직접 수행
3. 핵심 역할이 빠지면 사용자에게 알리고 판단을 요청
```

### 6-5. 외부 CLI 실행 (Codex/Gemini)

외부 CLI가 배정된 역할이 있으면, 팀장에게 다음 지시를 포함한다:

```
## 외부 AI 활용
Codex CLI로 [역할]을 수행합니다. 다음 절차를 따르세요:

1. 프롬프트 파일 작성:
   Write 도구로 {KKIRIKKIRI_DIR}/prompts/{task-id}.md에 분석 요청 작성

2. CLI 실행:
   Bash(run_in_background=true):
   "bash ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.sh start --provider codex --prompt-file {KKIRIKKIRI_DIR}/prompts/{task-id}.md"
   → 출력되는 JOB_DIR 경로를 저장

3. 완료 대기:
   Bash: "bash ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.sh wait JOB_DIR"

4. 결과 확인:
   Bash: "bash ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.sh results JOB_DIR"

5. 결과를 TEAM_FINDINGS.md에 기록
6. 작업 디렉토리 정리:
   Bash: "bash ${CLAUDE_PLUGIN_ROOT}/scripts/run-cli.sh clean JOB_DIR"
```

### 6-6. 태스크 배정

팀장이 스폰되면, 팀장에게 메시지를 보내 태스크 배분을 지시한다:

```
SendMessage({
  type: "message",
  to: "[leader-name]",
  content: "팀이 구성되었습니다. 공유 메모리 파일({KKIRIKKIRI_DIR}/)이 초기화되었습니다. TEAM_PLAN.md를 읽고 팀원들에게 태스크를 배분해주세요.",
  summary: "팀 구성 완료, 태스크 배분 시작"
})
```

---

## Step 7: 검증 루프 (Ralph Pattern)

> **1라운드로 끝내지 않는다. 품질이 충분할 때까지 반복한다.**
> ddg.kang: "팀리더가 30명 심부름꾼이 구현한거 최종검토 → 나에게 최종 보고 = 버그 하나도 없음"

### 7-1. 진행 상황 모니터링

팀장과 팀원들의 메시지를 수신하며 진행 상황을 모니터링한다.
메시지는 자동으로 전달되므로 별도 폴링 불필요.

### 7-2. 1라운드 완료 확인

팀장이 완료 보고를 보내면:

1. 리포트 파일 확인 (Read 도구)
2. TEAM_PLAN.md의 "검증 결과" 섹션 확인
3. 팀장의 품질 평가 확인

### 7-3. 품질 판정

팀장의 보고를 기반으로 품질을 판정:

```
판정 기준:
- 목표 달성도: 인터뷰에서 파악한 목표를 충족하는가?
- 완성도: 빠진 항목/분석/코드가 없는가?
- 정확성: 출처/근거/테스트가 충분한가?
- 일관성: 팀원 간 결과가 모순되지 않는가?
```

### 7-4. 품질 충분 → Step 8로

모든 기준 통과 시 Step 8(결과 수집 + 리포트)로 진행.

### 7-5. 품질 부족 → 자동 판정 + 2라운드 진행

품질이 부족하면, 먼저 **어떤 기준이 미달인지** 파악하여 최적 전략을 자동 결정한다.

#### 자동 판정 로직 (Agent Council 합의)

```
IF 목표_달성도 = FAIL:
    → 방식 B (전체 재구성) — 방향 자체가 잘못됨

ELIF 일관성 = FAIL:
    → 방식 C (부분 교체) — 모순된 결과를 낸 팀원만 교체

ELIF 완성도 = FAIL OR 정확성 = FAIL:
    → 방식 A (팀 유지 + 보강) — 방향은 맞고 양/질이 부족

ELIF 라운드 >= 3:
    → 중단 — 현재 최선 결과로 리포트 생성
```

판정 결과를 사용자에게 제안 (최종 결정은 유저):

**EXECUTE:** 아래 JSON의 question 필드를 품질 판정 결과로 채운 후 AskUserQuestion 도구를 즉시 호출한다:

```json
{
  "questions": [
    {
      "question": "(동적: 1라운드 결과 + 부족한 부분 설명). 보강할까요?",
      "header": "품질 검증",
      "options": [
        {"label": "네, 보강해주세요 (추천)", "description": "부족한 부분을 집중적으로 보완합니다. 시간이 좀 더 걸려요."},
        {"label": "이 정도면 괜찮아요", "description": "현재 결과를 최종 리포트로 정리합니다."},
        {"label": "처음부터 다시", "description": "팀을 해산하고 새로 구성합니다."}
      ],
      "multiSelect": false
    }
  ]
}
```

**응답 처리 (Continuation Contract — 응답 수신 후 즉시 실행, 텍스트만 출력하고 멈춤 금지):**
- "네, 보강해주세요" → 즉시 Step 7-6의 EXECUTE NOW Read 박스 실행 후 방식 A/B/C 선택
- "이 정도면 괜찮아요" → 즉시 Step 8-1로 진행 (TeamDelete 호출)
- "처음부터 다시" → Step 1로 복귀

### 7-6. 2라운드 실행 방식 (3가지)

사용자가 "보강해주세요" 선택 시, 자동 판정 결과에 따라 A/B/C 중 선택:

> **🚨 EXECUTE NOW — 2라운드 진입 즉시 실행:**
> ```
> Read("${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/validation-guide.md")
> ```
> 방식 A/B/C 상세 절차 + 라운드별 권장 전략이 여기 있다.

### 7-7. 최대 라운드 제한

- **최대 3라운드**까지만 진행
- 3라운드 후에도 부족하면: 현재까지의 최선 결과로 리포트 생성
- 사용자에게 솔직하게: "3번 시도했는데 [이 부분]은 한계가 있어요. 현재 결과를 정리해드릴게요."

---

## Step 8: 결과 수집 + 리포트

### 8-1. 팀 종료

```
# 모든 팀원에게 종료 요청 (팀장이 이미 보냈을 수 있음)
SendMessage({
  type: "shutdown_request",
  to: "[각 팀원 이름]",
  content: "작업이 완료되었습니다. 수고하셨습니다."
})

# 팀 리소스 정리
TeamDelete()
```

### 8-2. 유저에게 결과 전달 + Auto-memory 유도

팀 종료 후 사용자에게 결과를 보여줍니다:

```
끼리끼리 팀 작업이 완료되었어요!

📋 팀: [팀 구성 요약]
🎯 목표: [목표]
📄 결과: [리포트 파일 경로]
🔄 라운드: [수행한 라운드 수]

[리포트 핵심 요약 2-3줄]

상세 내용은 리포트 파일을 확인해주세요.
```

> **🚨 EXECUTE NOW — 결과 전달 직후 실행:**
> ```
> Read("${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/output-guide.md")
> ```
> Auto-memory 저장 유도 형식, 팀 저장 파일 형식, 에이전트 저장 절차가 여기 있다.
> 이 Read 호출 없이 Step 8-3 (팀 저장)으로 진행하지 말 것.

### 8-3. 팀 저장 (선택)

잘 동작한 팀 구성을 저장하여 나중에 재사용할 수 있습니다.

**EXECUTE:** 아래 JSON으로 AskUserQuestion 도구를 즉시 호출한다:

```json
{
  "questions": [
    {
      "question": "이 팀 구성을 저장해둘까요? 나중에 비슷한 작업할 때 바로 불러올 수 있어요.",
      "header": "팀 저장",
      "options": [
        {"label": "네, 저장해주세요", "description": "다음에 비슷한 작업할 때 인터뷰 없이 바로 시작할 수 있어요."},
        {"label": "아니요, 괜찮아요", "description": "이번만 사용하고 저장하지 않아요."}
      ],
      "multiSelect": false
    }
  ]
}
```

**응답 처리 (Continuation Contract — 응답 수신 후 즉시 실행, 텍스트만 출력하고 멈춤 금지):**
- "네, 저장해주세요" → 즉시 아래 Write 호출로 `shared/saved-teams/{team_name}.md` 생성 후 Step 8-3-1로 진행
- "아니요, 괜찮아요" → 즉시 Step 8-3-1로 진행 (팀원 에이전트 저장 단계)

저장 시 `shared/saved-teams/` 디렉토리에 기록 (크로스 세션 공유):

```
Write → {프로젝트루트}/.kkirikkiri/shared/saved-teams/{team_name}.md
```

→ 파일 형식 및 저장된 팀 불러오기 절차: `output-guide.md` 참조 (위 MANDATORY READ)

### 8-3-1. 팀원 에이전트 저장

팀 저장 후, 잘 동작한 팀원을 `.claude/agents/`에 재사용 가능한 에이전트로 저장할 수 있습니다.

**EXECUTE:** 아래 JSON으로 AskUserQuestion 도구를 즉시 호출한다:

```json
{
  "questions": [
    {
      "question": "잘 동작한 팀원을 에이전트로 저장할까요? 다른 프로젝트에서도 바로 쓸 수 있어요.",
      "header": "에이전트 저장",
      "options": [
        {"label": "네, 저장할게요", "description": "팀원의 역할과 능력을 에이전트 파일로 저장해요. 다음에 팀을 만들 때 자동으로 감지돼요."},
        {"label": "괜찮아요", "description": "이번만 쓰고 저장하지 않아요."}
      ],
      "multiSelect": false
    }
  ]
}
```

**응답 처리 (Continuation Contract — 응답 수신 후 즉시 실행, 텍스트만 출력하고 멈춤 금지):**
- "네, 저장할게요" → 즉시 `output-guide.md`의 저장 절차에 따라 팀원 선택 AskUserQuestion 호출, 이후 Write 호출로 `.claude/agents/{역할명}.md` 생성, 완료 후 Step 8-4로 진행
- "괜찮아요" → 즉시 Step 8-4로 진행 (공유 메모리 정리 안내)

→ 저장 절차 (팀원 선택 → 프롬프트 정제 → 파일 생성 → 충돌 처리): `output-guide.md` 참조 (Step 8-2 EXECUTE NOW로 이미 로드됨)

### 8-4. 공유 메모리 정리

작업 완료 후 `{KKIRIKKIRI_DIR}/` 디렉토리는 유지한다 (나중에 참조 가능).
사용자가 원하면 삭제:
```
"이번 세션 작업 기록({KKIRIKKIRI_DIR}/)을 삭제할까요? 남겨두면 나중에 참고할 수 있어요."
```

---

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

- Codex/Gemini CLI 실행 실패 → Claude(Opus)로 해당 작업 수행
- 사용자에게 기술적 에러 메시지 그대로 노출 금지
- 대신: "외부 도구에서 문제가 생겨서 내부 AI로 대체했어요" 수준의 안내

### 인터뷰 중단

- 사용자가 인터뷰 중 취소 → 즉시 종료, 팀 생성하지 않음
- "언제든 다시 시작할 수 있어요" 안내

---

## 절대 하지 마 (전체 워크플로우)

- [ ] 유저 확인 없이 팀을 생성하지 마
- [ ] 프리셋을 고정값으로 쓰지 마 — 인터뷰 + 환경스캔으로 동적 조정
- [ ] 기술 용어를 유저에게 노출하지 마 — Opus/Sonnet/MCP/TeamCreate 등
- [ ] 인터뷰 질문 4개 이상 하지 마
- [ ] Haiku를 어떤 역할에도 배정하지 마
- [ ] 팀장에게 코드 작성을 시키지 마
- [ ] 에러 메시지를 그대로 보여주지 마
- [ ] 공유 메모리 파일 초기화 없이 팀을 실행하지 마
- [ ] 팀원 프롬프트에서 공유 메모리 경로를 빠뜨리지 마
- [ ] 심부름꾼을 Opus로 스폰하지 마 — 심부름꾼은 항상 Sonnet
- [ ] 검증 없이 결과를 유저에게 전달하지 마 — 반드시 품질 판정 거쳐야
- [ ] 4라운드 이상 반복하지 마 — 최대 3라운드 제한
- [ ] 팀 재구성 시 공유 메모리 파일을 삭제하지 마 — 새 팀에 전달해야
- [ ] 에이전트 정의 파일을 전체 프롬프트 그대로 복사하지 마 — 압축 포맷 사용
- [ ] 확신 80% 미만인 역할에 GitHub fetch 하지 마 — Tier 3으로 바로 넘어갈 것

## 항상 해 (전체 워크플로우)

- [ ] 모든 인터뷰 질문에 "(추천)" 기본 옵션 포함
- [ ] 모든 인터뷰 질문에 "잘 모르겠어요 → 추천대로" 옵션 포함
- [ ] 팀 구성 제안 시 역할을 일상 용어로 설명
- [ ] 팀 구성 제안 시 `{KKIRIKKIRI_DIR}/agents/` 파일 경로 목록 함께 표시
- [ ] 팀 실행 전 반드시 유저 확인
- [ ] 환경 스캔에서 Codex/Gemini CLI + agency-agents 설치 여부 확인
- [ ] 프리셋 매칭 실패 시 범용 인터뷰로 전환
- [ ] 결과 리포트에 팀 구성 + 작업 과정 + 산출물 포함
- [ ] 팀 생성 직후 공유 메모리 3종 파일 초기화 (TEAM_PLAN, TEAM_PROGRESS, TEAM_FINDINGS)
- [ ] 팀원 스폰 전 {KKIRIKKIRI_DIR}/agents/{역할명}.md 압축 정의 파일 생성
- [ ] 팀원 프롬프트에 자신의 역할 파일 경로 포함 (컨텍스트 복구용)
- [ ] 팀장 프롬프트에 전체 팀원 파일 인덱스 포함
- [ ] 팀장 프롬프트에 공유 메모리 관리 의무 포함
- [ ] 팀원 프롬프트에 공유 메모리 읽기/쓰기 + 심부름꾼 스폰 방법 포함
- [ ] Step 4에서 3-tier 순서로 에이전트 선택 (설치 → GitHub 완전핏 → 내제화 생성)
- [ ] 1라운드 완료 후 반드시 품질 판정 수행 (목표 달성/완성도/정확성/일관성)
- [ ] 품질 부족 시 유저에게 2라운드 진행 여부 확인
- [ ] 팀 재구성 시 TEAM_FINDINGS.md 내용을 새 팀에 반드시 전달
- [ ] 팀장의 최종 통합 전 공유 메모리 3개 파일 전부 읽기 필수
- [ ] `.claude/agents/` 에 기존 에이전트가 있으면 재활용 여부 사용자에게 확인
- [ ] 파일 모드(@파일명) 입력 시 파일 분석 → 역할 자동 분해
- [ ] 작업 완료 후 팀 저장 여부 사용자에게 확인
- [ ] 저장된 팀 재사용 요청 시 saved-teams 디렉토리에서 불러오기
- [ ] 팀원 idle 3회 연속 시 팀장에게 교체 지시
- [ ] 세션 내 재구성(7-6 방식 B) 시 이전 라운드 TEAM_FINDINGS.md 내용을 새 팀에 전달
