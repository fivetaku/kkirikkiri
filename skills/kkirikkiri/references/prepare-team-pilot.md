# Opt-in Teams preparation pilot

이 경로는 **승인된 독립 태스크 계획을 조립하는 실험 기능**이다. 모델의 의도 파악,
작업 분해, 전문 판단, 독립 검증을 대체하지 않는다. 사용자에게 이 경로를 사용할지
확인한 뒤 적용하며, 다른 Workflow나 협업 형태로 자동 확장하지 않는다.

## 범위

- 생산자와 최소 한 Critic을 합쳐 **총 2~6명**.
- 쓰기 범위는 정확한 상대 파일 경로 또는 `directory/**`만 지원.
- 생산자 완료 후 검증자를 실행하는 두 단계.
- 현재 Claude Code의 암묵적 세션 팀에 대한 Agent 입력만 생성한다.
- `team_name`은 작업의 논리적 라벨이다. deprecated 실행 인자로 전달하지 않는다.
- `tools`, `write_scope`, `stop`, `effort`는 선언이며 권한 샌드박스가 아니다.
  런타임에서 실제 적용한 제한은 호스트가 따로 확인한다.

## 입력

```json
{
  "version": 1,
  "run_id": "run-001",
  "session_id": "현재-호스트-세션-ID",
  "revision": 1,
  "mode": "teams",
  "team_name": "task-directory-label",
  "approval": {"revision": 1, "mode": "teams"},
  "acceptance": [{"id": "A1", "description": "승인된 구체적 완료 기준"}],
  "tasks": [
    {
      "id": "builder",
      "role": "기능 구현",
      "archetype": "Builder",
      "domain": "기능 도메인",
      "model": "sonnet",
      "tools": ["Read", "Write", "Edit"],
      "write_scope": ["src/feature.js"],
      "stop": {"maxTurns": 20, "done_when": "A1 구현과 검증 보고"},
      "effort": "medium",
      "instruction": "승인된 요구사항과 인터페이스에 맞게 구현한다.",
      "acceptance_ids": ["A1"]
    },
    {
      "id": "critic",
      "role": "독립 검증",
      "archetype": "Critic",
      "domain": "기능 검증",
      "model": "opus",
      "tools": ["Read", "Grep", "Glob"],
      "write_scope": [],
      "stop": {"maxTurns": 15, "done_when": "A1 검증 결과와 결함 보고"},
      "effort": "high",
      "instruction": "생산자 결과가 나온 뒤 독립적으로 A1 충족 여부를 검토한다.",
      "acceptance_ids": ["A1"]
    }
  ]
}
```

식별자는 영문·숫자·점·밑줄·하이픈을 사용한다. 모델은 opus/sonnet/haiku 중 명시한다.
작업 성격에 따른 모델 선택은 기존 정책을 따르며 준비기가 저가 모델로 바꾸지 않는다.
본문 도메인 정보는 `instruction`에 보존한다. 카드의 단일행 메타데이터는 기존
card-lint 문법을 만족해야 한다. 준비기는 실제 card-lint 검사를 재사용하며,
지원하지 않는 필드나 호환되지 않는 값을 조용히 버리지 않고 거부한다.

approval은 호스트가 기록한 승인 정보다. 이 도구가 사용자 신원이나 승인을 인증하는
것은 아니다. 모드·모델·범위·완료 기준을 바꾸면 호스트가 재승인하고 revision을 바꾼다.

## 실행

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/prepare-team.js" \
  --input "/absolute/path/approved-plan.json" \
  --out "/absolute/path/new-prepared-directory"
```

출력 디렉터리는 새 경로여야 한다. 기존 카드/실행 묶음을 덮어쓰지 않는다.
검증 실패 시 `pass:false`와 오류를 반환한다. 성공하면 `agents/*.md`,
`launch.json`, 동일한 JSON stdout을 제공한다.

호스트는 다음 순서를 따른다:

1. 입력 계획의 session_id가 실제 현재 세션과 맞고 승인이 유효한지 확인한다.
2. `launch.json`의 `stages` 순서대로 실행한다.
3. `produce`의 task_ids에 해당하는 `requests[].input`을 실제 Agent 도구에 전달한다.
4. 모든 생산자 결과를 수신한 뒤 `review`의 검증 요청을 전달한다.
5. 모델·description·subagent_type·prompt를 재작성하지 않는다. 런타임에 필요한
   비동기 옵션은 호스트가 붙일 수 있지만 권한이나 실행 의미를 조용히 바꾸지 않는다.
6. 실제 도구가 없는 필드를 요구하거나 이 경로를 지원하지 않으면 실행하지 않고
   기존 경로/대안을 설명한다. 단순 생성 성공을 에이전트 실행 성공으로 보고하지 않는다.
7. 결과와 완료 계약 검사를 확인한 뒤에만 최종 완료로 판정한다.

생성 카드는 같은 기록의 사람이 읽는 표시본이다. 이 경로에서는 별도의 100~150줄
페르소나 카드로 확장하거나 카드 내용을 다시 스폰 프롬프트로 작성하지 않는다.
도메인 사실과 필요한 원본 참조가 instruction에 부족하면 조립 전에 보완한다.

## 검증 범위

동일한 작은 승인 계획에서 모델 조립·수정과 준비기 모두 기존 카드/스폰 훅을
통과했고, 실제 호스트에서 생성된 모델·프롬프트 그대로 Agent 3회가 실행됐다.
생산자 2개 결과 뒤 검증자가 실행되는 순서도 이벤트로 확인했다.

이는 준비 조립의 검증이다. 전체 프로젝트 완료 시간·비용·품질을 보증하지 않으며,
다른 도메인·모델·대규모 팀으로 확장하려면 별도 동등성 실험이 필요하다.
