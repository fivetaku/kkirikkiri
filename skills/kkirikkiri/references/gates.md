# 게이트 3종 — 상세 절차 (v0.24.0부터 훅 계층에서 강제)

> SKILL.md 본문에는 앵커 1줄씩만 남기고 상세는 여기로 외부화했다(지시 희석 방지 — 2026-09-01 실측: SKILL 1,648줄 시 게이트 발화 0/4).
> **강제 수단은 이 문서가 아니라 `hooks/hooks.json`의 훅이다.** 여기 절차는 오케스트레이터가 "왜 차단됐고 어떻게 고치는지"를 이해하기 위한 참고다.

## 강제력 층위 (프로젝트 실측)

| 층위 | 강제력 | 실측 |
|---|---|---|
| 페르소나(프롬프트) | 없음 | 객관 과제 성능 무변화 |
| SKILL 규정 서술 | 샌다 | 경계 블록 발화 0회 |
| SKILL `EXECUTE` 앵커 | 불안정 | 발화 100% ↔ 0% 진동 |
| 스키마(도구 계층) | 지켜짐 | 팬아웃 반환 10/10 |
| **훅(하네스 계층)** | 텍스트·모델 판단 무관 | v0.24.0에서 이관 |

## 1. wf-lint — Workflow 발사 전 (PreToolUse 훅 `gate-wf.sh`)

Workflow 도구 호출 시 `tool_input.script`(또는 scriptPath)를 자동 린트한다. **위반이면 호출 자체가 차단**되고 사유가 돌아온다 — 고치고 다시 호출하면 된다.

| 규칙 | 검사 | 근거 |
|---|---|---|
| R1 meta 리터럴 | `export const meta` 순수 리터럴 | Workflow 도구 요구 |
| R2 팬아웃 schema | `.map(... => agent(` 호출에 schema 존재 + **빈 객체 금지** | 스키마 계약 10/10 준수 실측 |
| R3 model 핀 | 모든 agent()에 model | 세션 모델 상속 비용 폭증 |
| R4 fan-in 독점 | flatMap→slice에 라운드로빈/쿼터 부재 | 2026-08-29 확장 슬롯 독점 실측 |
| R5 예산 필드 | schema에 `*_count`/budget | 검색 200캡은 조용한 빈 결과 |
| R6 폭 | parallel 변수의 리터럴/slice 폭 ≤6 | rate-limit 가드 |
| R7 refute | 검증 스테이지 부재 → 경고 | 기존 규칙 |

수동 실행: `node "${CLAUDE_PLUGIN_ROOT}/scripts/wf-lint.js" <script.js>` (stdin `-` 가능).

**W1 WorkflowSpec(권장 절차)**: 스크립트보다 명세를 먼저 — 런 장부에 `spec{axes,width,fanin_rule,barrier_reason,models,contract_layers,est_tokens}` 기록. `contract_layers`에서 기계 판정 가능한 계약을 prompt층에 두는 것은 설계 결함(프롬프트 계약만 구멍 난 실측).
**W3 설계 카드**: 발사 전 축×폭×예산×모델×견적(46,338·N+59,132) 요약을 사용자에게 표시 — 자답 진단 체제의 Workflow opt-in 지점.
**W4 프리플라이트**: 1라운드 결과 수신 시 누락 축·예산(search_count 합)·계약 위반을 즉시 검사하고 장부(`budget_used`·`missing_axes`·`repair_cycles`)에 기록.

## 0. 런 컨텍스트는 훅이 만든다 (UserPromptSubmit `gate-init.sh`, v0.24.2)

`/kkirikkiri …` 프롬프트가 들어오면 **훅이** `.kkirikkiri/runs/<ts>.json` 장부를 생성한다(열린 장부가 이미 있으면 재사용). 작업 repo는 cwd가 git이면 cwd, 아니면 cwd 직속 하위 git repo가 정확히 1개일 때 그것으로 자동 추정해 `work.repo`에 넣고, 보고서 기본 경로는 `<cwd>/output/report.md`.
- 이유(실측 2026-09-04): 장부·카드 같은 "모델이 만들어야 하는 아티팩트"에 걸린 훅은 모델이 그걸 안 만들면 무력하다(T런 2/2 카드·장부 0건). 컨텍스트 수립을 하네스로 옮겨 아래 gate-spawn/gate-done이 항상 대상을 갖게 한다.
- 오케스트레이터는 이 장부를 **덮어쓰지 말고 채운다**(diagnosis·spec·lint_report·outcome). `work.repo` 추정이 틀렸으면 고쳐 쓴다.

## 2. 경계 강제 — 팀원 스폰 전 (PreToolUse `gate-spawn.sh` + PostToolUse `gate-card.sh`)

**gate-spawn (도구 호출 기반 — 1차 강제)**: 열린 장부가 있는 cwd에서 Agent/Task를 호출하면 스폰 프롬프트 본문에 ① 허용 도구 또는 read-only 선언 ② write_scope(쓰기 소유권) 또는 read-only ③ 정지 조건(maxTurns/done_when) 세 가지가 있어야 한다. 없으면 **스폰이 차단**되고 누락 항목이 돌아온다 — 카드 파일 유무와 무관하게 작동한다. 차단은 장부 `boundary_violations`에 기록.

**gate-card (아티팩트 기반 — 2차, 카드를 쓴 경우)**:

`*/agents/<역할>.md`(frontmatter에 `archetype:` 있는 kkirikkiri 카드)가 Write/Edit되면 그 디렉토리 전체를 검사한다. 위반 사유가 돌아오면 **스폰 전에 카드를 고친다**.

| 규칙 | 검사 |
|---|---|
| C1 | 필수 경계 필드 tools·stop·effort·model (플레이스홀더도 결핍) |
| C2 | stop.maxTurns 정수 · stop.done_when 존재 |
| C3 | Critic은 review_mode: true 필수, review_mode면 Write/Edit 도구 금지 |
| C4 | 쓰기 역할(Builder/Writer/Designer/Analyst 또는 쓰기 도구 보유)은 write_scope 필수 |
| **C5** | **카드 간 write_scope 교집합 금지** — 공유 파일은 소유자 1명 지정, 나머지는 변경 요청 |

수동 실행: `node "${CLAUDE_PLUGIN_ROOT}/scripts/card-lint.js" --dir "{KKIRIKKIRI_DIR}/agents"`.
경계 블록 필드 정의는 `subagent-synthesis.md` [4] 참조. 페르소나는 스타일 층, 능력·권한은 경계 블록.

## 3. done-gate — 완료 직전 (Stop 훅 `gate-done.sh`)

cwd의 `.kkirikkiri/runs/*.json` 중 `outcome`이 비어 있고 `work.repo`가 지정된 장부가 있으면, 세션 종료 시 자동으로 done-gate를 돌린다.
- 변경 있음 → 통과(diff --stat이 `outcome_gate`에 기록됨 — 완료 보고에 동봉).
- 변경 없음 → 보고서(`work.report`, 기본 `<repo>/output/report.md`)에 `## 무변경 종료 심사` 블록이 추적 파일 전수를 3열 표(파일 / 검사 내용 / 변경 불요 근거)로 커버해야 통과. 아니면 **종료 차단** — 정비를 하거나 심사를 채운다.
- 근거: 무행동 종료 런이 0→1→2→3/4로 늘고 품질 −3.8점(2026-09-01). "점검했더니 이상 없음"은 증명 대상이다.

**장부에 `work` 블록을 반드시 기록해야 훅이 대상을 안다** (W1 또는 팀 구성 시):
```json
"work": {"repo": "/abs/path/to/target-repo", "report": "/abs/path/to/output/report.md"}
```

## 회귀·검증

- `bash tests/run-gates.sh` — 픽스처 6종 + 훅 스모크(합성 JSON을 stdin으로 주입해 exit 0/2 대조). CI(gates.yml)가 push/PR마다 실행.
- 훅은 전 세션에 로드되므로 **비대상 입력에서 50ms 내 exit 0**이 설계 계약이다(가드 우선, node 호출은 대상 확정 후).
