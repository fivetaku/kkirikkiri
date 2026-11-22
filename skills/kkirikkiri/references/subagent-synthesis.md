# 서브에이전트 동적 합성 가이드

> 어떤 요청이 와도 역할 분해 → archetype 매칭 → 경계가 정해진 카드로 팀원을 만든다.
>
> Step 4(팀 구성)에서 이 파일을 참조한다. **카드 틀과 스폰 브리프의 정본은 `card-template.md` 하나다.**

**모델 정책:** archetype은 행동 원칙이지 모델 고정 규칙이 아니다. 모델 관련
표·예시는 추천으로만 사용하고, `model-selection.md`의 승인된 task별 선택을
카드와 실제 스폰에 그대로 반영한다.

---

## 합성 흐름

```
사용자 요청
   ↓
[1] 역할명 / 도메인 / 검증 방식 추출
   ↓
[2] archetype 매칭 (team-prompts.md 7종 중 1개)
   ↓
[3] 경계·브리프 값 정하기 (tools / write_scope / stop / effort / 목표 / 반환 형식 / 범위 밖)
   ↓
[4] 카드 작성 → {KKIRIKKIRI_DIR}/agents/{역할명}.md (card-template.md §1)
   ↓
[5] 스폰 — card-template.md §2-1 프롬프트 (경계 + 브리프 + 카드 경로)
```

**핵심 원칙:** archetype은 **행동 원칙**(Evidence-First, Quality-First 등)을 결정하고, 카드의 경계 블록은 **무엇을 할 수 있고 언제 멈추는가**를 결정한다. 능력·권한은 페르소나가 아니라 경계 블록이 정한다.

---

## [1] 역할 분해 — 요청에서 무엇을 추출하나

사용자 인터뷰 답변과 환경 스캔에서 다음 4가지를 추출:

| 추출 항목 | 어디서 | 예시 |
|----------|--------|------|
| **역할명** | 인터뷰 / 프리셋 | "Solidity 감사자", "TikTok 마케터", "백엔드 아키텍트" |
| **도메인** | 키워드 + 컨텍스트 | "스마트 컨트랙트 보안", "Gen Z 소셜", "마이크로서비스" |
| **검증 방식** | "이 사람의 결과물이 옳다는 걸 어떻게 알까?" | 실행 / 출처 / 사용성 / 반박 / 데이터 / 전달 / 조율 |
| **출력 형태** | 인터뷰 답변 | 코드 / 리포트 / 문서 / 디자인 / 검증 보고 |

검증 방식이 곧 archetype 시그널이다.

---

## [2] archetype 매칭 — 7종 중 1개 선택

`team-prompts.md`의 archetype 7종을 그대로 사용. 매칭 규칙:

| 검증 방식 시그널 | archetype | 신호 키워드 |
|-----------------|-----------|------------|
| "동작하나?" / 코드·시스템·인프라 산출 | **Builder** | 개발, 구현, 엔지니어, 빌드, 배포, SRE |
| "전달되나?" / 텍스트 산출, 청중 의식 | **Writer** | 문서, README, 카피, 콘텐츠, 튜토리얼, PRD |
| "쓸 수 있나?" / 시각·UX 산출 | **Designer** | UI, UX, 디자인, 비주얼, 토큰, 브랜드 |
| "출처 있나?" / 외부 정보 수집 | **Researcher** | 리서치, 조사, 시장분석, 트렌드, 인터뷰 |
| "패턴 있나?" / 분류·통계·구조 | **Analyst** | 분석, 데이터, 전략, 매트릭스, 시나리오 |
| "반박 가능한가?" / 검증·감사 | **Critic** | QA, 리뷰, 감사, 보안, 사실확인, 레드팀 |
| "조율" | (팀장 = 현재 세션) | 팀장, PM, 코디네이터 — 별도 워커로 스폰하지 않음 |

### 매칭 규칙

1. 검증 방식 → archetype 매칭
2. 한 사람이 여러 검증 방식을 요구하면 → **분리해서 다른 팀원으로 스폰** (한 사람에게 두 archetype 금지)
3. 매칭 모호하면 → Researcher 기본값 + 인터뷰 추가 질문 1개
4. 팀에는 **독립 검증 Critic 1명**을 기본 권장한다. 조율(Leader)은 현재 세션이 맡고 별도 Leader 워커는 사용자가 명시할 때만 둔다 (SKILL.md Step 4-B와 동일)

### 흔한 오매칭 주의

| 잘못된 매칭 | 올바른 매칭 | 이유 |
|------------|------------|------|
| 기술 문서 작성 → Builder | **Writer** | 산출은 코드가 아니라 청중에게 전달되는 텍스트 |
| 코드 리뷰 → Builder | **Critic** | 산출은 동작이 아니라 반박/약점 도출 |
| UI 컴포넌트 구현 → Builder | **Builder + Designer 분리** | 디자인 결정과 구현 검증 방식이 다름 |
| 마케팅 카피 → Researcher | **Writer** | 정보 수집이 아니라 청중을 향한 출력 |
| 시장 조사 → Analyst | **Researcher** | 외부 정보 수집이 핵심, 분류는 부수 |

---

## [3] 경계·브리프 값 정하기

카드를 쓰기 전에 아래 값을 정한다. 하나라도 정하지 못하면 [1]로 돌아가 역할을 다시 나눈다.

| 값 | 정하는 법 |
|---|---|
| tools | 역할에 필요한 최소 도구. 검증자는 쓰기 도구 없음 |
| write_scope | 쓰기 역할이면 배타적 glob. 팀원 간 겹치면 소유자 1명 |
| stop | maxTurns 정수 + done_when 측정 가능한 한 줄 |
| effort | 단순 3-10 툴콜 / 비교 10-15 / 복잡은 별도 합의 |
| review_mode | Critic이면 true |
| model | 승인된 model_selection 값 |
| 목표·입력·반환 형식·범위 밖 | 인터뷰·TEAM_PLAN에서 옮긴다 |

도메인 지식(스택·흔한 실수)은 **도구 지침**과 **범위 밖**에 짧게 녹인다. 따로 큰 표를 만들지 않는다.
페르소나와 KPI는 모으지 않는다 — 페르소나는 객관 과제 성능을 바꾸지 못하고(Wharton 2025-12, 커뮤니티 카드 360개 전수에서 경계 필드 사실상 0건), 지어낸 KPI 수치는 검증 근거 없는 환각이다. KPI는 사용자·PRD가 준 수치만 옮긴다.

LLM 자체 지식으로 부족한 특수 도메인이면 심부름꾼에게 1회 조사를 맡긴다. 이때도 브리프 형식(`card-template.md` §2)과 승인된 모델을 쓴다:

```
Task({
  subagent_type: "general-purpose",
  model: selected_models[task_id],   // 승인된 선택값 — 상속·하드코딩 금지
  prompt: "목표: [도메인]의 흔한 실수 5개를 출처 URL과 함께 정리\n반환 형식: 목록(실수, 결과, URL)\n도구 지침: 공식 문서·1차 자료 우선, GUI 브라우저 금지\n범위 밖: 수치 KPI 창작\n노력 예산: 툴콜 8회 이내"
})
```

## [4] 카드 작성

`card-template.md` §1 틀로 `{KKIRIKKIRI_DIR}/agents/{역할명}.md`를 쓴다. 목표 30~60줄. 경계 블록이 frontmatter 맨 앞에 오고 필수이며 `scripts/card-lint.js`(훅 `gate-card.sh`)가 C1~C5로 검사한다. 위반이 남으면 스폰하지 않는다. 예시는 `card-template.md` §3.

## [5] 스폰

`card-template.md` §2-1 프롬프트를 쓴다 — 경계(허용 도구·write_scope·stop) + 브리프(목표·반환 형식·도구 지침·범위 밖·노력 예산) + 카드·archetype·공유 메모리 경로. archetype 본문은 `team-prompts.md` 한 곳에만 두고 경로로 참조한다.

---

## 부록 — agency-agents 외부 자원 (옵션)

[agency-agents](https://github.com/msitarzewski/agency-agents)는 60+개 도메인별 서브에이전트 정의를 공개한 외부 자원이다. **kkirikkiri는 이것에 의존하지 않는다** — 위의 동적 합성으로 충분히 농밀한 카드를 만든다. 다만 사용자가 이미 설치했거나 특정 도메인의 462줄급 깊이가 필요하면 보조 자원으로 활용 가능.

### 활용 시나리오

**시나리오 A — 사용자 환경에 설치됨 (`vibe:` 필드 감지)**
```
환경 스캔 결과 agency_agents_installed = true 이고
ls ~/.claude/agents/{후보-에이전트명}.md 존재하면:
  → subagent_type: "{에이전트명}" 직접 사용 (외부 정의 그대로)
  → 카드는 도메인 정체성/추가 KPI만 보강
```

**시나리오 B — 특정 도메인의 깊은 레퍼런스가 필요 (확신 80%↑)**
```
역할이 매우 전문적이고 카탈로그에 정확한 매칭이 있을 때:
  → WebFetch("https://raw.githubusercontent.com/msitarzewski/agency-agents/main/{path}")
  → 결과를 {KKIRIKKIRI_DIR}/agent-cache/{filename}.md 캐시
  → 동적 합성한 카드에 외부 자료를 보충 자료로 첨부
```

**시나리오 C — 일반적 역할** (기본값)
```
agency-agents 무시. 위의 [1]~[5] 절차로 동적 합성.
```

### agency-agents 카탈로그 인덱스 (시나리오 A/B 매칭용)

다음은 agency-agents가 정의해둔 도메인 목록. **이 인덱스를 의존하지 말 것** — 단순히 외부 자원이 어떤 도메인을 다루는지 보여주는 참고용.

```
Engineering: frontend-developer, backend-architect, mobile-app-builder, ai-engineer,
  devops-automator, rapid-prototyper, senior-developer, security-engineer, code-reviewer,
  software-architect, technical-writer, sre, data-engineer, database-optimizer,
  git-workflow-master, incident-response-commander, solidity-smart-contract-engineer,
  embedded-firmware-engineer, codebase-onboarding-engineer, voice-ai-integration-engineer

Design: ui-designer, ux-researcher, ux-architect, brand-guardian, whimsy-injector,
  image-prompt-engineer

Marketing: growth-hacker, content-creator, seo-specialist, social-media-strategist,
  linkedin-content-creator, tiktok-strategist, reddit-community-builder,
  ai-citation-strategist, video-optimization-specialist

Product: product-manager, trend-researcher, sprint-prioritizer

Sales: outbound-strategist, discovery-coach, deal-strategist, sales-engineer, pipeline-analyst

Testing: reality-checker, accessibility-auditor

Specialized: agents-orchestrator, blockchain-security-auditor, mcp-builder,
  workflow-architect, compliance-auditor

Finance: financial-analyst, investment-researcher

Game Dev: game-designer, narrative-designer, unity-architect, unreal-systems-engineer,
  godot-gameplay-scripter

Project Mgmt: project-manager-senior
```

raw URL 패턴: `https://raw.githubusercontent.com/msitarzewski/agency-agents/main/{category}/{filename}.md`

### 환경 스캔 — agency-agents 감지

```bash
# vibe 필드 = agency-agents 포맷
ls ~/.claude/agents/*.md 2>/dev/null | xargs grep -l "^vibe:" 2>/dev/null | wc -l
```

결과 0이면 시나리오 C 진행. 0보다 크면 시나리오 A 검토.

---

## 자주 묻는 케이스

### Q. 한 사람이 여러 archetype을 동시에 해야 한다면?
A. 분리한다. 디자인 결정 + 구현이면 Designer 1명 + Builder 1명.

### Q. archetype 매칭이 정말 모호하면?
A. Researcher 기본값 + 인터뷰 추가 질문 1개로 검증 방식을 명확히 한다.

### Q. 카드가 30~60줄이면 깊이가 부족하지 않나?
A. 깊이는 카드 길이가 아니라 브리프(목표·반환 형식·범위 밖)와 정지 조건에서 나온다. 도메인 사실이 더 필요하면 입력·도구 지침에 출처를 적고, 필요하면 심부름꾼 1회 조사를 쓴다.

### Q. agency-agents 외부 자원을 항상 fetch하는 게 낫지 않나?
A. 아니다. fetch는 토큰·시간 비용이다. LLM 자체 지식이 부족한 도메인(특수 규제·신생 프레임워크)에서만 권한다.
