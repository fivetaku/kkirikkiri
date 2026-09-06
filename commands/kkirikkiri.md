---
name: kkirikkiri
description: "자연어 한마디로 AI 에이전트 팀을 자동 구성하고 실행합니다. 리서치, 개발, 분석, 콘텐츠 — 목적에 맞는 팀을 만들어보세요."
argument-hint: "[자연어 요청]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - SendMessage
  - Workflow
  - WebSearch
  - WebFetch
---

<!-- first-run setup: idempotent, non-blocking, self-skips after first run -->
**Step 0 — run once at the very start, before anything else:** run `bash "${CLAUDE_PLUGIN_ROOT}/setup/setup.sh" ask`. If its output starts with `STAR_ASK`, immediately call the **AskUserQuestion** tool once, with the question and options phrased **in the user's language**: prefer the current conversation's language if it is evident; otherwise fall back to the language code that follows `STAR_ASK` in the output (`ko`→Korean, `ja`→Japanese, `en`→English). Never default to Korean blindly.
- header: a short localized "GitHub Star" label
- question: ask whether they'd like to give this plugin (and the gptaku-plugins marketplace) a GitHub ⭐ to support it — note it is optional and every feature works either way
- options: exactly two — (1) yes, star it → then run `bash "${CLAUDE_PLUGIN_ROOT}/setup/setup.sh" star yes`; (2) no thanks → then run `bash "${CLAUDE_PLUGIN_ROOT}/setup/setup.sh" star no`

If the output is empty, just continue silently. (AskUserQuestion must NOT be in frontmatter allowed-tools.) Do not narrate beyond the question itself.

# /kkirikkiri Command

자연어 입력을 받아 AI 에이전트 팀을 자동 구성하고 실행하는 커맨드.

## Parse Arguments

Inspect `$ARGUMENTS` to determine the action:

| Argument Pattern | Action |
|-----------------|--------|
| `[자연어 요청]` | 의도 파악 → 인터뷰 → 팀 생성 → 실행 |
| (no argument) | 인터랙티브 메뉴 표시 |

## No Argument Provided

**EXECUTE:** 아래 JSON으로 AskUserQuestion 도구를 즉시 호출한다:

```json
{
  "questions": [
    {
      "question": "어떤 팀이 필요하세요?",
      "header": "팀 빌더",
      "options": [
        {
          "label": "팀 만들기 (추천)",
          "description": "하고 싶은 걸 자유롭게 말해주세요. 2-3개 질문 후 최적의 팀을 구성해드려요."
        },
        {
          "label": "프리셋 둘러보기",
          "description": "리서치, 개발, 분석, 콘텐츠 — 4종 프리셋을 먼저 확인해보세요."
        },
        {
          "label": "사용법 안내",
          "description": "끼리끼리가 뭔지, 어떻게 쓰는지 알려드려요."
        }
      ],
      "multiSelect": false
    }
  ]
}
```

After user selection:
- **팀 만들기** → Ask for one-sentence request if not provided, then execute kkirikkiri skill
- **프리셋 둘러보기** → Read presets.md and show 4 presets summary in plain Korean, then ask which one to use
- **사용법 안내** → Explain in plain Korean:
  1. 하고 싶은 걸 한마디로 말하면 인터뷰가 시작됨
  2. 2-3개 질문에 답하면 팀이 자동 구성됨
  3. 팀 구성을 확인한 후 실행
  4. 작업 완료 후 리포트를 받음

## Execute

Read the skill, then load references only when the selected step needs them:

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/SKILL.md`
2. Follow SKILL.md's workflow with user's request: `$ARGUMENTS`. Do not eagerly
   preload interview or metaphor references when the request already answers
   those questions. Within one preparation attempt, reuse unchanged references
   already read by this session; workers still receive their own required context.
   - Step 3.5에서 사용자가 실행 방식을 고른다: **Agent Teams** 또는 **Workflow**
   - Agent Teams → Step 4~8 (팀 구성·실행·Ralph 검증)
   - Workflow → Step 4-W/6-W/7-W/8-W (워크플로우 스크립트 구성·실행·내부 검증)
   - Workflow 도구는 사용자가 "Workflow"를 골랐을 때만 호출한다
   - Teams·Workflow 모두 구성 확인 AskUserQuestion에 모델 선택을 함께 넣는다
     (`references/model-selection.md`). 이미 지정한 모델은 재질문하지 않는다.
   - 모델 선택을 장부와 실행 계획에 저장하고 실제 호출에서 보존한다. 추천값으로 되돌리거나
     사용 불가 모델을 승인 없이 대체하지 않는다.
