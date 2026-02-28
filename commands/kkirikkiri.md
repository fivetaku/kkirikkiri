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
  - AskUserQuestion
  - TaskCreate
  - TaskUpdate
  - TaskList
  - TaskGet
  - TeamCreate
  - TeamDelete
  - SendMessage
  - WebSearch
  - WebFetch
---

# /kkirikkiri Command

자연어 입력을 받아 AI 에이전트 팀을 자동 구성하고 실행하는 커맨드.

## Parse Arguments

Inspect `$ARGUMENTS` to determine the action:

| Argument Pattern | Action |
|-----------------|--------|
| `[자연어 요청]` | 의도 파악 → 인터뷰 → 팀 생성 → 실행 |
| (no argument) | 인터랙티브 메뉴 표시 |

## No Argument Provided

When no argument is provided, present the following interactive menu using `AskUserQuestion`:

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

Read the skill and reference files, then follow the workflow:

1. Read `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/SKILL.md`
2. Read `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/presets.md`
3. Read `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/interview-guide.md`
4. Read `${CLAUDE_PLUGIN_ROOT}/skills/kkirikkiri/references/metaphor-guide.md`
5. Follow SKILL.md's 8-step workflow with user's request: `$ARGUMENTS`
