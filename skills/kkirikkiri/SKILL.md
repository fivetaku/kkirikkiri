---
name: kkirikkiri
description: 자연어 한마디로 AI 에이전트 팀을 자동 구성하고 실행하는 스킬. "/kkirikkiri", "팀 만들어줘", "리서치 팀", "끼리끼리", "팀 구성해줘" 같은 요청에 사용됩니다.
---

# 끼리끼리 Team Builder Skill

> 자연어 한마디 → 인터뷰 → 환경 스캔 → 팀 구성 → 실행 → 리포트

---

## WHEN TRIGGERED - EXECUTE IMMEDIATELY

**이 문서는 참고 문서가 아니라 실행 지시서다.**
- 첫 번째 action: 사전 준비(레퍼런스 파일 읽기) 후 즉시 Step 1~3의 AskUserQuestion 도구를 호출
- 텍스트 출력 후 질문하지 않는다. 도구를 먼저 호출한다.
- 모든 질문은 AskUserQuestion 도구 호출로만 진행한다.

---

## 사전 준비

이 스킬이 호출되면 반드시 다음 레퍼런스 파일을 읽는다:
- `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/presets.md` — 프리셋 정의 (팀 구성, 인터뷰 질문, 동적 조정 규칙)
- `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/interview-guide.md` — 인터뷰 방법론 (AskUserQuestion 규칙, 바이브코더 대응)
- `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/metaphor-guide.md` — 기술 용어 → 일상 표현 변환표

**PM 프리셋 매칭 시 추가로 읽는다:**
- `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/pm-frameworks.md` — PM 프레임워크 (PRD, OST, Strategy Canvas 등)

**팀 생성/실행 시 읽는다:**
- `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/team-prompts.md` — 팀원/팀장 프롬프트 템플릿 + 공유 메모리 규칙

**검증 루프 진입 시 읽는다:**
- `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/verification-loop.md` — 품질 판정 기준 + 라운드별 전략 + 에러 처리

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
**프리셋별 키워드와 팀 구성은 presets.md 참조.**

### 입력 모드

| 모드 | 입력 예시 | 처리 |
|------|----------|------|
| **자연어** (기본) | "리서치 팀 만들어줘" | 키워드 매칭 → 프리셋 → 인터뷰 |
| **파일 지정** | "@deep-research 팀으로 실행해줘" | 파일 분석 → 역할 자동 분해 |

#### 파일 모드 처리

사용자 입력에 `@파일명` 또는 파일 경로가 포함되면:
1. 해당 파일을 Read로 읽기
2. 파일 내용을 분석하여 필요한 역할 자동 추출
3. 인터뷰는 1-2개로 축소 (파일에서 대부분의 정보를 이미 파악했으므로)

### 매칭 주의사항
- "분석해줘"는 research와 analysis 모두 매칭 가능 → 문맥으로 판단
- "경쟁분석"/"시장분석"은 product와 research 모두 매칭 가능 → 문맥으로 판단
- "기획"/"전략"은 product 프리셋 강매칭
- **매칭 실패 시**: generic(범용) 인터뷰로 전환

---

## Step 2: 환경 스캔

인터뷰와 **병렬로** 환경을 스캔한다.

### 스캔 항목

```bash
# 1. 외부 AI CLI 확인
command -v codex >/dev/null 2>&1 && codex --version
command -v gemini >/dev/null 2>&1 && gemini --version

# 2. 개발 도구 확인
command -v gh >/dev/null 2>&1
command -v npm >/dev/null 2>&1
command -v bun >/dev/null 2>&1

# 3. 기존 에이전트 파일 확인
ls .claude/agents/*.md 2>/dev/null
```

### MCP 확인
- `mcp__perplexity__` 로 시작하는 도구 → Perplexity MCP 있음

### Auto-memory 활용
- 이전 스캔 결과가 있으면 빠른 확인만 수행
- 선호 프리셋/팀 구성 패턴이 기억에 있으면 "(기억 기반 추천)" 표시

### 기존 에이전트 재활용
`.claude/agents/`에 기존 에이전트가 있으면 팀에 활용 가능. 사용자에게 확인 후 포함.

---

## Step 3: 인터뷰

**presets.md에 정의된 프리셋별 인터뷰 질문을 반드시 AskUserQuestion 도구로 진행한다.**

### 인터뷰 실행 규칙

1. **Q1만 스킵 가능, Q2/Q3는 반드시 AskUserQuestion으로 호출** (예외 없음)
   - Q1(열린 질문)은 사용자가 이미 자연어로 답한 경우에만 생략
   - "테스트", "진행해줘" 같은 모호한 입력은 Q1도 스킵하지 않는다

2. **인터뷰 질문/옵션 규칙은 interview-guide.md 참조**

3. **절대 금지**:
   - 4개 이상 질문 금지
   - 기술 용어(Opus, Sonnet, MCP, Agent Teams) 유저에게 노출 금지
   - 설명 없이 옵션만 나열 금지

---

## Step 4: 동적 팀 구성

인터뷰 답변 + 환경 스캔 결과를 종합하여 최종 팀을 구성한다.
**프리셋별 기본/확장 구성과 동적 조정 규칙은 presets.md 참조.**

### 모델 배정 규칙 (절대 준수)

| 역할 | 모델 |
|------|------|
| Lead (팀장) | **Opus** — 무조건, 예외 없음 |
| 핵심 작업자 | **Opus** |
| 보조 작업자 | **Sonnet** — 최소한으로만 |
| Haiku | **사용 금지** |
| 외부 CLI | Codex/Gemini — 없으면 Opus/Sonnet 폴백 |

### 팀장 R&R (절대 준수)

팀장은 **코드를 짜지 않고**, **직접 검색하지 않고**, **직접 문서를 작성하지 않는다**.
계획 수립, 태스크 분배, 결과 검증, 최종 통합만 수행.

---

## Step 5: 팀 구성 제안 + 유저 확인

**반드시 AskUserQuestion을 호출하여 유저의 승인을 받는다.**

markdown 필드에 팀 구성 트리 + 역할 + 예상 소요시간을 동적 생성하여 전달한다.
**metaphor-guide.md의 표현을 사용하여 모델명/기술 용어를 일상 용어로 변환.**

| 팀 규모 | 예상 소요 시간 |
|---------|---------------|
| 기본 3명 | 10-15분 |
| 확장 4-5명 | 15-25분 |
| 외부 CLI 포함 | +5-10분 |

**응답 처리:**
- "네, 시작해주세요" → Step 6으로
- "조정하고 싶어요" → 추가 질문 후 Step 4로
- "처음부터 다시" → Step 1로

---

## Step 6: 팀 생성 + 공유 메모리 + 실행

**상세 프롬프트 템플릿과 공유 메모리 초기화 절차는 team-prompts.md 참조.**

### 6-1. 팀 생성

```
TeamCreate({
  team_name: "kkirikkiri-{preset}-{timestamp}",
  description: "[팀 목표 요약]"
})
```

### 6-2. 공유 메모리 초기화
team-prompts.md의 절차에 따라 `.kkirikkiri/` 디렉토리에 TEAM_PLAN.md, TEAM_PROGRESS.md, TEAM_FINDINGS.md를 생성.

### 6-3. 팀원 스폰
team-prompts.md의 팀원/팀장 프롬프트 템플릿에 따라 Task 도구로 스폰.
팀장을 먼저 스폰한 후, 팀원을 스폰한다.

### 6-4. 태스크 배정
팀장에게 SendMessage로 태스크 배분을 지시한다.

---

## Step 7: 검증 루프

**상세 품질 판정 기준, 자동 판정 로직, A/B/C 방식은 verification-loop.md 참조.**

### 흐름 요약

1. 팀장의 완료 보고 수신
2. 리포트 + TEAM_PLAN.md의 "검증 결과" 확인
3. 품질 충분 → Step 8로
4. 품질 부족 → AskUserQuestion으로 사용자에게 보강 여부 확인
5. 자동 판정 로직에 따라 방식 A/B/C 중 선택하여 2라운드 진행
6. **최대 3라운드** 제한

---

## Step 8: 결과 수집 + 리포트

### 8-1. 팀 종료
모든 팀원에게 shutdown_request → TeamDelete()

### 8-2. 유저에게 결과 전달
```
끼리끼리 팀 작업이 완료되었어요!

팀: [팀 구성 요약]
목표: [목표]
결과: [리포트 파일 경로]
라운드: [수행한 라운드 수]

[리포트 핵심 요약 2-3줄]
```

### 8-3. Auto-memory 유도
team-prompts.md의 세션 요약 형식에 따라 팀 운영 맥락을 출력하여 Auto-memory 저장 유도.

### 8-4. 팀 저장 (선택)
AskUserQuestion으로 팀 저장 여부 확인. 저장 시 team-prompts.md의 형식에 따라 `.kkirikkiri/saved-teams/`에 기록.

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
- [ ] 검증 없이 결과를 유저에게 전달하지 마
- [ ] 4라운드 이상 반복하지 마
- [ ] 팀 재구성 시 공유 메모리 파일을 삭제하지 마

## 항상 해 (전체 워크플로우)

- [ ] 모든 인터뷰 질문에 "(추천)" 기본 옵션 포함
- [ ] 모든 인터뷰 질문에 "잘 모르겠어요 → 추천대로" 옵션 포함
- [ ] 팀 구성 제안 시 역할을 일상 용어로 설명
- [ ] 팀 실행 전 반드시 유저 확인
- [ ] 환경 스캔에서 Codex/Gemini CLI 설치 여부 확인
- [ ] 프리셋 매칭 실패 시 범용 인터뷰로 전환
- [ ] 결과 리포트에 팀 구성 + 작업 과정 + 산출물 포함
- [ ] 팀 생성 직후 공유 메모리 3종 파일 초기화
- [ ] 팀장 프롬프트에 공유 메모리 관리 의무 포함
- [ ] 팀원 프롬프트에 공유 메모리 + 심부름꾼 스폰 방법 포함
- [ ] 1라운드 완료 후 반드시 품질 판정 수행
- [ ] 품질 부족 시 유저에게 2라운드 진행 여부 확인
- [ ] 팀 재구성 시 TEAM_FINDINGS.md를 새 팀에 반드시 전달
- [ ] `.claude/agents/`에 기존 에이전트가 있으면 재활용 여부 확인
- [ ] 작업 완료 후 팀 저장 여부 확인
