# Codex에서 실행할 때 (kkirikkiri)

SKILL.md 절차는 그대로 따르고, 아래 차이만 적용한다. 이 문서의 `references/…`는 SKILL.md가 있는 폴더 기준이고, `${CLAUDE_PLUGIN_ROOT}`는 플러그인 루트(SKILL.md에서 두 단계 위)로 바꿔 읽는다.

## 질문 = 질문 도구 (이번 세션 도구 목록으로 판단)

1. `request_user_input_async`가 있으면 질문 1콜 = 이 도구 1콜(문항 ≤4개).
   - 형식: `{"questions":[{"title":"헤더 — 한 줄 질문","options":["라벨 (추천) — 설명","대안 — 설명"]}]}`
   - 문항에는 `title`·`options`만. `question`·`header`·`id`를 넣으면 파싱 오류가 난다. 추천안을 맨 앞에. "기타" 선택지는 넣지 않는다(자유 입력 칸 자동).
   - 부른 뒤 "위 질문에 답해 주시면 이어서 진행합니다" 한 줄만 쓰고 턴을 끝낸다. 답은 다음 사용자 메시지로 온다.
2. Plan 모드라 `request_user_input`만 있으면: 1콜 3문항까지, `header`(12자 이내)·`id`(snake_case)·`question`, 선택지 2~3개(`label`·`description`), 추천 라벨 끝에 `(Recommended)`.
3. 둘 다 없으면 채팅에 번호 선택지 블록을 쓰고 다음 자유 텍스트 답을 읽는다.
4. `codex exec`(비대화)는 묻지 않는다 — 추천안으로 진행하고 가정을 한 줄 남긴다.
- 프리뷰는 도구 호출 직전에 채팅 본문에 먼저 쓴다. 여러 개 선택은 제목에 "(여러 개면 쉼표로)".

## 도구 대응

- `AskUserQuestion` → 위 질문 도구. `Skill` → 그 스킬의 SKILL.md를 열어 따른다.
- 팀원 스폰(`Agent`/`Task`) → `spawn_agent`(입력 `message`). 팀장은 이 세션이고 팀원 산출을 정독·재지시한다. 모델 인자를 받지 않으면 카드 frontmatter와 장부 `model_selection`에 기록한다.
- `Workflow` 도구는 없다 → 스크립트는 린트 가능한 계약서로 두고 오케스트레이터가 phase를 순차·`spawn_agent` 병렬로 실행한다. 실행 전 `node "${CLAUDE_PLUGIN_ROOT}/scripts/wf-lint.js" <스크립트>`를 스킬 단계로 직접 돌린다(훅 없음). exit≠0이면 고치고 다시.
- 파일 수정은 `apply_patch`, 셸은 `Bash`.

## 게이트(훅)

`hooks/hooks.json`을 Codex도 읽는다. 팀원 경계 블록 검사(`spawn_agent`의 `message`에 허용 도구·write_scope·정지 조건 필요)와 카드 검사(`apply_patch`로 `agents/*.md` 카드를 고칠 때)는 같은 스크립트가 자동 실행한다. 차단 사유(stderr)를 고치고 다시 한다. 장부(`.kkirikkiri/runs`)는 UserPromptSubmit 훅이 만든다.
- Codex의 `.codex/agents/`가 기존 에이전트 스캔 위치다(`.claude/agents/` 대신).
