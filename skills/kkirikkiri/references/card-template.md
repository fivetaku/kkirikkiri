# 팀원 카드 정본 틀 + 공통 최소 브리프

> **카드 틀은 이 파일 하나뿐이다.** SKILL.md Step 6-2.5, `subagent-synthesis.md` [4],
> `team-prompts.md`는 모두 이 틀을 가리킨다. 경계 블록은 `scripts/card-lint.js`가
> 검사하고(훅 `gate-card.sh`), 스폰 프롬프트의 경계는 `gate-spawn.sh`가 검사한다.

## 1. 카드 틀 (목표 30~60줄)

경계 블록이 먼저 오고 **필수**다. 하나라도 비면 카드를 쓰지 않는다 — 값을 정할 수
없으면 역할 분해로 돌아가 경계가 정해질 때까지 역할을 다시 정의한다.

```markdown
---
# ── 경계 블록 (필수 — card-lint C1~C5) ──
tools: [허용 도구 최소 목록 — 예: Read, Grep, WebSearch]
write_scope: [쓰기 역할이면 필수 — 배타적 glob. 예: "src/api/**"]
stop: {maxTurns: 정수, done_when: 측정 가능한 완료 판정 한 줄}
effort: [노력 예산 — 단순 3-10 툴콜 / 비교 10-15 / 복잡은 별도 합의]
review_mode: [검증(Critic) 역할이면 true — true면 Write·Edit 금지]
model: [승인된 model_selection 값 — 역할 추천값으로 되돌리지 않음]
# ── 식별 ──
name: [역할명]
archetype: [Researcher / Analyst / Builder / Writer / Designer / Critic]
domain: [도메인 한 줄]
team: [team_name]
created: [timestamp]
---

# [역할명]

## 목표
[이 팀원이 끝내야 할 한 가지 결과 — 한두 줄]

## 입력
[읽을 파일·URL·앞 단계 산출물·사용자 제약]

## 도구 지침
[언제 어떤 도구를 쓰는지, 1차 출처 우선순위, 심부름꾼 사용 여부]

## 쓰기 범위
[write_scope를 사람 말로 — 공유 파일은 소유자만 쓰고 나머지는 변경 요청]

## 정지 조건
[done_when 상세 + maxTurns 도달 시 행동(지금까지 결과로 보고)]

## 반환 형식
[보고 구조 — 필드·표·파일 경로]

## 범위 밖
[하지 않을 일 — 다른 팀원 몫, 추측 금지 영역, 외부 발송 등]

## (선택) 소통 스타일
[다양성이 필요할 때만 1~2줄. 능력·권한은 여기에 쓰지 않는다]

## (선택) KPI
[사용자·PRD가 준 수치만 옮긴다. 없으면 이 절을 지운다]

## 공유 메모리
- {KKIRIKKIRI_DIR}/TEAM_PLAN.md · TEAM_PROGRESS.md · TEAM_FINDINGS.md
```

작성 규칙:
- **frontmatter에는 실제 값만** 쓴다. `[...]`·`{KKIRIKKIRI_DIR}`·TBD 같은 자리표시는
  card-lint가 결핍으로 본다. write_scope에는 치환된 실제 경로를 쓴다.
- `stop`의 `done_when`에는 쉼표를 쓰지 않는다(인라인 맵 파서가 쉼표로 나눈다).
- 공유 메모리(TEAM_*.md)는 팀 운영 파일이라 write_scope에 넣지 않는다. 팀원의
  산출물 파일만 소유를 선언한다. 두 카드의 write_scope가 겹치면 C5 위반이다.
- 페르소나(정체성·성격·발언 예시)는 **필수가 아니다.** 페르소나는 객관 과제 성능을
  올리지 못한다(team-prompts.md 능동 코디네이션 "성격 부여 금지", Wharton 2025-12
  실험). 쓰더라도 스타일 1~2줄로 두고 능력·권한은 경계 블록에만 둔다.
- **KPI 수치를 지어내지 않는다.** 사용자·PRD·승인된 완료 계약에 있는 수치만 옮긴다.
  만든 숫자는 검증 근거가 없는 환각이 된다. 없으면 `done_when`과 반환 형식이 기준이다.
- archetype 행동 원칙은 `team-prompts.md`에 한 곳만 둔다. 카드에 복사하지 않는다.
- Leader 카드는 기본으로 만들지 않는다 — 팀장은 현재 호스트 세션이다.

## 2. 공통 최소 브리프 (스폰 프롬프트·Workflow agent() 공통)

모든 위임은 아래 다섯 줄을 갖는다. 한 줄 지시("[조사 지시] X")로 보내지 않는다.

| 항목 | 내용 |
|---|---|
| 목표 | 끝내야 할 결과 한 가지와 그것이 어디에 쓰이는지 |
| 반환 형식 | 필드·표·파일 경로. Workflow면 schema와 일치시킨다 |
| 도구 지침 | 쓸 도구·1차 출처 우선순위·쓰지 말 도구(GUI 브라우저 등) |
| 범위 밖 | 하지 않을 일. 다른 팀원/단계의 몫 |
| 노력 예산 | 툴콜 상한 또는 단순/비교/복잡 등급. 넘으면 지금까지 결과로 반환 |

### 2-1. Agent Teams 스폰 프롬프트

`gate-spawn.sh`가 `허용 도구`·`write_scope`·`maxTurns`/`done_when` 표기를 찾으므로
아래 레이블을 그대로 쓴다.

```
당신은 [역할명]입니다. ([archetype] + [도메인])

## 경계 (카드 값과 동일)
- 허용 도구: [도구 목록]
- write_scope: [실제 glob 목록; 검증자면 [] 와 read-only]
- stop: maxTurns [정수], done_when [완료 판정]

## 브리프
- 목표: [...]
- 반환 형식: [...]
- 도구 지침: [...]
- 범위 밖: [...]
- 노력 예산: [...]

## 참고 파일
- 카드: {KKIRIKKIRI_DIR}/agents/{역할명}.md
- 행동 원칙: ${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/team-prompts.md 의 "# [archetype]"
- 공유 메모리: {KKIRIKKIRI_DIR}/TEAM_PLAN.md · TEAM_PROGRESS.md · TEAM_FINDINGS.md
- 팀장: 현재 호스트 세션 / 다른 팀원: [목록]
```

### 2-2. Workflow agent() 브리프

스크립트 맨 위에 작은 조립 함수를 두고 모든 agent()에 쓴다.

```javascript
const brief = (goal, ret, tools, out, budget) => [
  '목표: ' + goal, '반환 형식: ' + ret, '도구 지침: ' + tools,
  '범위 밖: ' + out, '노력 예산: ' + budget,
].join('\n')

agent(brief(
  `${s} 의 공개 가격표에서 플랜별 월·연 가격과 조건을 뽑는다`,
  'FINDING_SCHEMA JSON. 가격마다 출처 URL과 수집일',
  '공식 가격 페이지 우선. GUI 브라우저 금지',
  '다른 회사 조사·종합 판단',
  '툴콜 10회 이내. 넘으면 지금까지 결과 반환'),
  {model: 'sonnet', phase: '수집', schema: FINDING_SCHEMA})
```

## 3. 예시 — "웹 리서치 팀: 경쟁사 3곳 가격 비교"의 가격 리서처 (47줄, card-lint 통과)

````markdown
---
tools: [WebSearch, WebFetch, Read, Write]
write_scope: [".kkirikkiri/teams/kkirikkiri-research-20261122-1000-a1b2/findings/pricing.md"]
stop: {maxTurns: 25, done_when: 3사 공개 플랜 가격표와 출처 URL을 pricing.md에 기록}
effort: 비교 과제 10-15 tool calls
review_mode: false
model: sonnet
name: 가격-리서처
archetype: Researcher
domain: SaaS 경쟁사 공개 가격 조사
team: kkirikkiri-research-20261122-1000-a1b2
created: 2026-11-22T10:00:00+09:00
---

# 가격-리서처

## 목표
경쟁사 3곳(A사·B사·C사)의 공개 플랜 가격을 같은 단위로 비교할 수 있게 표로 만든다.

## 입력
- TEAM_PLAN.md의 회사 목록과 비교 기준(사용자 승인)
- 각 사 공식 가격 페이지

## 도구 지침
- 공식 /pricing 페이지가 1차 출처다. 약관·FAQ는 조건(최소 좌석·약정) 확인용
- 리뷰 사이트 숫자는 공식가가 없을 때 "참고"로만 표시
- 노력 예산이 비교 등급이므로 핵심 가격은 공식 페이지 1곳 + 확인 1곳이면 충분
- GUI 브라우저를 띄우지 않는다

## 쓰기 범위
findings/pricing.md만 쓴다. TEAM_FINDINGS.md에는 요약 3줄과 파일 경로만 남긴다.

## 정지 조건
3사 전 공개 플랜이 표에 들어가고 셀마다 출처 URL·수집일이 있으면 끝. 25턴에 닿으면 채운 만큼 보고한다.

## 반환 형식
- 표: 회사 | 플랜 | 월 결제 | 연 결제 | 통화 | 최소 좌석 | 사용량 한도 | 출처 URL | 수집일
- 각주: 숨은 조건, 환산 기준
- 미확인: 공개가가 없는 플랜

## 범위 밖
- 어느 회사가 낫다는 판단(종합 담당 몫)
- 공개되지 않은 엔터프라이즈 가격 추정
- 영업팀 문의·외부 발송

## 공유 메모리
- {KKIRIKKIRI_DIR}/TEAM_PLAN.md · TEAM_PROGRESS.md · TEAM_FINDINGS.md
````
