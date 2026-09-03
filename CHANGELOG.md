# Changelog

## 0.24.5 (2026-09-04)

R4 8런 실측 반영 — 선언 추출 정밀화 + 스폰 시점 교집합 차단.

- **gate-spawn C5@spawn**: 새 팀원의 write_scope가 이미 선언된 다른 팀원과 겹치면 **스폰 차단**(공유 파일은 소유자 1명) — R4 Y4에서 두 소유자가 CONVENTIONS.md를 함께 선언해 위반 7이 난 유형을 스폰 시점에 봉합. 장부 `boundary_violations[gate=spawn-overlap]` 기록
- **write_scope 추출 정밀화**: `.`을 종결자로 쓰지 않음(CONVENTIONS.md 절단 방지) / 산문 혼합 표기에서 ASCII 경로 토큰만 추출(한글 조사 부착 방지) / "읽기만·수정 금지·read-only" 뒤 경로는 제외 / write_scope가 있으면 read_only로 오판하지 않음
- **gate-done 재개 턴 평가**: stop_hook_active여도 평가·기록은 하고 차단만 안 함(final-unjustified 로그) — 최종 판정 공백 제거. 재개 턴은 block_count에 세지 않음
- 러너 41 어서션 (C5@spawn 2건·산문 추출·드리프트 포함)


## 0.24.4 (2026-09-04)

- **cwd 드리프트 봉합**: 모델이 `cd repo` 후 스폰·종료하면 훅의 cwd가 하위 디렉토리라 장부를 못 찾던 문제(R2-b 실측: T-X1 gate-spawn 0회, W-X1 gate-done 0회) — gate-spawn·gate-done이 상위 5단계까지 `.kkirikkiri/runs`를 탐색. 러너에 드리프트 케이스 2건 추가(34 어서션)


## 0.24.3 (2026-09-04)

지표 v2 자동화(R3) — 경계 위반 측정에서 사람 개입 제거.

- **gate-spawn이 통과 시 선언을 장부에 기록**: `declarations[{agent, write_scope[], read_only}]` — 스폰 프롬프트에서 write_scope glob·read-only를 추출
- 실험 도구 violation-collector `--ledger <장부>` 모드: declarations에서 scopes를 자동 구성, 단독 소유 glob은 조율된 소유로 자동 유도. 선언 0인 팀은 모든 변경이 위반(경계 미선언 = 전부 위반) — 검증 3케이스(조율 0 / 비조율 overlap 1 / 미선언 3)
- 한계 명시(gates.md): 선언 "존재"는 검증하지만 선언 "준수"(소유자 외 팀원의 실제 접촉)는 팀원별 산출 격리 없이는 판정 불가 — v0.25 백로그


## 0.24.2 (2026-09-04)

게이트를 **아티팩트 기반 → 도구 호출 기반**으로 — R2 실측(gate-wf 2/2 발화 vs gate-card·gate-done 0/2: 모델이 카드·장부를 안 만들면 아티팩트 훅은 무력).

- **gate-init.sh (UserPromptSubmit) 신설**: `/kkirikkiri` 프롬프트 감지 시 훅이 런 장부를 생성하고 작업 repo를 자동 추정(cwd 또는 유일 하위 git repo) — 컨텍스트 수립을 하네스로 이관
- **gate-spawn.sh (PreToolUse Agent|Task) 신설**: 열린 장부 컨텍스트에서 스폰 프롬프트에 허용 도구/read-only·write_scope·정지 조건이 없으면 **스폰 차단** + 누락 항목 안내. 카드 없이 스폰하는 경로를 닫음
- **gate-done 하드캡**: stop_hook_active 가드가 연속 차단을 막지 못함(headless 3회 차단 실측) → 장부 block_count 3회 후 종료 허용(cap-release 로그)
- 러너 30 어서션(픽스처 12 + 훅 18), gates.md §0 신설


## 0.24.1 (2026-09-04)

- 훅 관측 로그: 3게이트가 대상을 평가할 때마다 `~/.cache/kkirikkiri/hooks.log`에 1줄(pass/block·cwd) 기록 — 발화율 실측용(통과 시 무증적 문제 해소). 비대상 입력은 기록하지 않음


## 0.24.0 (2026-09-04)

게이트 3종을 SKILL 텍스트에서 **훅(하네스 계층)으로 이관** — 텍스트 앵커 방식의 발화 불안정(100%↔0% 진동) 해소.

- **hooks/hooks.json 신설(플러그인 훅, settings.json 불필요)**: PreToolUse(Workflow)→gate-wf.sh(wf-lint, 위반 시 호출 차단) / PostToolUse(Write|Edit, `*/agents/*.md` 카드만)→gate-card.sh(card-lint 피드백) / Stop→gate-done.sh(열린 장부의 `work{repo,report}` 대상 done-gate, 무변경 무증적 종료 차단, stop_hook_active 시 무한루프 방지)
- **가드 계약**: 비대상 입력은 ~65ms 내 exit 0 (실측) — 타 세션·워크스페이스 부담 없음
- **SKILL.md 다이어트**: 게이트 상세를 `references/gates.md`로 외부화, 본문은 앵커 1줄씩. 런 장부 스키마에 `work{repo,report}` 추가(done-gate 대상 지정), `outcome`은 완료 전 null
- **run-gates.sh에 훅 스모크 추가**: 합성 훅 JSON을 stdin으로 주입해 exit 0/2 대조 (3게이트 × 차단/통과/비대상)


## 0.23.4 (2026-09-01)

게이트 3종 자동 회귀 러너 + R2 조임 + CI 편입 (타 세션 인계 스펙 #14060 이행).

- **tests/run-gates.sh 신설**: 픽스처 6종 전수 — clean은 exit 0, defect는 exit 1 + **JSON violations의 기대 규칙 ID 포함까지 대조**(우연히 다른 규칙으로 잡혀도 통과하는 것 차단). done-gate용 repo 픽스처는 러너가 자급 생성(외부 의존 0)
- **wf-lint R2 조임**: `schema: {}` 및 `const EMPTY = {}` 참조형 빈 스키마를 R2-schema 위반으로 검출(필드 1개 이상 강제). 신규 fixture wf-defect-empty-schema.js — 러너가 조이기 전 이 구멍을 실제로 FAIL로 잡는 것을 확인 후 수정
- **CI 편입**: .github/workflows/gates.yml — push/PR마다 러너 실행


## 0.23.3 (2026-09-01)

done-gate 발화 수정 — v0.23.2에서 게이트를 공통 규정에만 두어 4런 중 1런만 발화한 문제.

- **Step 7(팀 완료 보고)·Step 7-W(워크플로 결과 수신)에 `🚨 EXECUTE NOW` 앵커 삽입** — exit 1이면 완료 불허·반려
- **게이트 배치 원칙 규정화**: 새 게이트는 스크립트 + 규정 서술 + **실행 스텝 앵커** 3종을 모두 채운다. 규정 섹션에만 두면 프롬프트 지시와 다를 바 없다(실측 교훈)


## 0.23.2 (2026-09-01)

무행동 종료 방지 — H1 재측정에서 드러난 다음 병목(무행동 런 0→1→2 증가, 품질 −3.8점)에 대한 코드 게이트.

- **scripts/done-gate.js 신설**: 완료 보고 직전 검사. 변경 있으면 diff --stat을 증적으로 반환(pass), 변경 0이면 보고서의 `## 무변경 종료 심사` 블록이 추적 파일 전수를 3열 표(파일/검사 내용/변경 불요 근거)로 커버해야 pass — D1 심사블록 부재 / D2 파일 커버리지 누락 / D3 근거 셀 미달을 잡는다
- **SKILL.md 공통 규정에 완료 게이트 추가**: 판정 결과를 런 장부 `outcome.done_gate`에 기록
- 회귀 fixture: tests/fixtures/done-gate/ (무변경+심사없음=exit 1 / 무변경+파일별심사=exit 0 / 변경있음=exit 0)


## 0.23.1 (2026-08-31)

경계 블록을 프롬프트 지시에서 **코드 게이트로 강등** — Phase 2 전/후 실측에서 프롬프트층 지시만으로는 발화하지 않음(Teams 런 언급 0회)이 확인된 데 따른 후속.

- **scripts/card-lint.js 신설**: 팀원 카드 frontmatter 검사 — C1 필수 경계 필드(tools·stop·effort·model) / C2 stop 하위 키 / C3 Critic의 review_mode + read-only 강제 / C4 쓰기 역할 write_scope / **C5 카드 간 write_scope 교집합 금지**
- **SKILL.md Step 6-2.6 신설**: 카드 Write 직후·spawn 직전 card-lint 필수 실행, exit 1이면 스폰 금지. 6-4에 선행 조건 명시("즉시 실행" 요청에도 게이트 유지)
- 스폰 프롬프트에 경계 블록 본문 재명시 규정 추가
- 회귀 fixture: tests/fixtures/cards-defect(10 violations, C5 교집합 2건 포함) / cards-clean(통과)


## 0.23.0 (2026-08-30)

구조적 팀 빌더 개편 — "역할극이 아닌 자원 경계로 팀을 짠다"

- **Step 3.5 절단선 3문 진단**: 오케스트레이터가 독립성/상호의존/나눌 가치를 자답해 Workflow·Teams·single_session을 판정하고 근거를 표시. 애매할 때만 질문 폴백
- **Workflow 4단 게이트**: W1 WorkflowSpec 선작성 → W2 wf-lint 결정론 린트 → W3 설계 카드 → W4 발사 직후 프리플라이트
- **scripts/wf-lint.js 신설**: R1 meta 리터럴 / R2 팬아웃 schema / R3 model 핀 / R4 fan-in 라운드로빈 / R5 예산 필드 / R6 폭 / R7 refute(경고). 회귀 fixture 2종 동봉(2026-08-29 실측 결함 사본 포함)
- **팀원 카드 경계 블록 필수화**: tools·write_scope·stop·effort·review_mode — 결핍 시 합성 불가, 검증 역할 read-only 고정
- **공통 규정 신설**: 백그라운드 생존확인(mtime 점검) + 런 장부(.kkirikkiri/runs/)
- 근거: 6월 DOE + 8월 베이스라인 12런(경계 위반 7건 실측) + 리서치 7축 66소스


## 0.22.0 — 2026-08-23

- **Grok CLI(`grok`) 프로바이더 추가.** xAI Grok Build를 네 번째 외주 워커로 등록했다. `--provider grok`으로 호출한다.
  - `run-cli-worker.js`에 grok 분기 추가 — `grok --no-auto-update --no-alt-screen --sandbox workspace --always-approve -p "<프롬프트>"`.
  - **샌드박스가 기본 off**라(codex와 반대) `--sandbox workspace`로 조인다. 자동 업데이터가 실행 중 끼어들지 않도록 `--no-auto-update` 필수.
  - 모델 오버라이드: `KKIRIKKIRI_GROK_MODEL` (기존 `KKIRIKKIRI_CODEX_MODEL` 패턴과 동일).
  - 실측(2026-08-23, grok 1.0.4): 비-TTY 파이프에서 stdout 정상 — agy의 stdout 누락 버그 없음.
- **[P1] PATH 오탐 수정.** grok은 `~/.grok/bin`에 설치되고 셸 프로필을 통해서만 PATH에 오르므로, 비대화형 셸(훅·CI·detached 워커)에서 `which`가 실패해 "미설치"로 오판하거나 spawn이 ENOENT로 죽었다. `run-cli-job.js`·`run-cli-worker.js`·`check-env.js` 3곳에 알려진 설치 경로를 PATH 앞에 덧대는 폴백을 넣었다.
  - ⚠️ 이름 충돌: npm의 서드파티 `@vibe-kit/grok-cli`도 `grok` 바이너리를 설치한다(실측: `/opt/homebrew/bin/grok` v1.0.1). 그쪽은 위 플래그를 모른다. `~/.grok/bin`을 PATH **앞**에 두는 순서가 공식 xAI CLI를 결정적으로 이기게 하는 장치다.
- **실행형태(Execution Shapes) 5종 도입 — Workflow 경로 전용.** 기존에는 병렬 하나뿐이었다.
  - 신규 `references/execution-shapes.md` — 병렬 / 직렬 / 체인(플랜 뒤에 플랜) / 부모와 자식 / 토너먼트의 정의와 스크립트 골격.
  - 신규 **Step 3.6(실행형태 선택)** — Workflow를 고른 뒤, 순서·의존 또는 경쟁·품질 신호가 있을 때만 1문항으로 되묻는다. 신호가 없으면 묻지 않고 병렬(기본값)로 간다.
  - Step 4-W 진입 시 `execution-shapes.md`를 lazy-read. 기존 규칙(모델 핀 필수 / adversarial-verify 필수 / schema 강제)은 5종 전부에 그대로 적용된다.
  - Agent Teams 경로에는 적용하지 않는다 — 영속 팀·공유메모리 구조라 워크트리 격리가 불가능하고 채점 노드가 Ralph 루프와 겹친다.
- **토너먼트(옵트인 실험).** 같은 과제를 여러 워커에게 시키고 게이트로 채점해 승자를 채택한다. 참가자별 git worktree 격리, 게이트 통과 수 → diffSize 순의 결정론 순위, 게이트가 비면 실행 거부.
  - 🔴 **실측 판정(2026-08-23): 단독 대비 품질 이득 없음.** codex vs grok A/B 2라운드(parseDuration 15케이스 / parseCSV RFC4180 20케이스)에서 양 참가자가 게이트를 전부 통과해 통과율 차이가 0이었고 CLI 호출만 2배 들었다. 따라서 **기본값으로 승격하지 않고** 사용자가 명시적으로 고를 때만 도는 실험 기능으로 둔다. `adopt: 'merge'`(패자 장점 이식)는 근거 부족으로 **미구현**. 단 판정은 *테스트가 미리 주어진 잘 명세된 태스크*에 한정된다. 리포트: `docs/reports/tournament-ab-2026-08-23.md`
  - [P1] **`diffSize` 타이브레이커 결함 2건 수정 (하나는 실기에서만 드러남).** ①`git diff --shortstat`은 untracked 새 파일을 세지 않아 신규 파일 생성(토너먼트의 주 사용처)에서 항상 0 → **항상 동점**. `git add -A -N` 선행으로 교정. ②`--jobs-dir`가 워크트리 안을 가리켜 job.json·output.txt·error.txt가 diff에 섞였다 — 실측: codex의 stderr 779줄이 실제 코드 46줄을 덮어 diffSize가 858로 잡혔고 타이브레이커가 코드가 아니라 **로그 잡음으로 승자를 갈랐다**. jobs-dir를 워크트리 바깥으로 옮기고 측정을 소스 경로(`-- src lib app`)로 좁혔다.
- **역할 라우팅**: `presets.md`에 grok 슬롯 추가. 검토는 build와 다른 family 원칙에 따라 `Codex → grok → agy → Opus` 순으로 확장 — codex가 build면 검토는 grok이 맡는다.

- **[P2] Step 3.6 신호 표 결함 2건 수정 (라우팅 시험에서 발견).** ①신호 예시가 `"먼저 ~한 다음"` 같은 **틸드 문형 템플릿**이라 실제 어형과 매칭되지 않았다 — "스키마 **먼저** 잡고 **그 다음** API"처럼 명백한 순서 요청이 신호로 안 잡혔다. 문형이 아니라 낱말(`먼저`/`그 다음`/`이후에`/`끝나고`/`결과로`/`순서대로`/`단계`) 목록으로 교체. ②명사형 `"경쟁"`이 **"경쟁사 5곳 조사해줘"** 를 오탐해 불필요한 되묻기를 유발했다 — 조사 *대상*이지 실행 *방식*이 아니다. 동사형(`경쟁시켜`/`대결`/`붙여서`)으로 좁히고 "낱말이 작업 방식을 가리킬 때만 신호" 규칙을 명시했다.
- **회귀 테스트 추가** — `tests/test-step36-routing.sh` (15 assertions). SKILL.md의 신호 표를 **문서에서 직접 읽어** 12개 시나리오를 라우팅한다(하드코딩 아님 — 표를 고치면 테스트가 따라간다). 과소 탐지(신호 누락)와 과잉 탐지(오탐으로 불필요한 질문) 양방향을 잡는다. 변이 테스트로 검출력 확인(신호 축소 → 3건, 명사형 복귀 → 3건 검출).
- **회귀 테스트 추가** — `tests/test-provider-args.sh` (23 assertions). 가짜 바이너리로 argv를 포착해 프로바이더별 플래그 계약을 고정한다. 실제 CLI를 호출하지 않아 CI에서 돌릴 수 있다. 변이 테스트로 검출력 확인(`--sandbox workspace` 제거 / 모델 오버라이드 무력화 → 각각 실패 검출).
## 0.21.7 — 2026-06-29

Gemini CLI 흔적 완전 제거 — agy(Antigravity)로 단일화 마무리.

- provider는 이미 `codex` / `antigravity`(바이너리 `agy`) / `gjc`로 단일화돼 있었다(`--provider gemini`는 미동작). 이번에 스킬·스크립트·README에 남아 있던 "Gemini CLI 대체본/후계" 등 **잔여 Gemini 언급을 모두 제거**했다. provider 매핑·실행 로직 변화 없음(주석·상태 메시지·문서 정리). CHANGELOG/REDESIGN 등 과거 기록은 보존.

## 0.21.5 — 2026-06-21

- The GitHub-star prompt is shown in the user's current language; on a fresh session with no language signal yet, it falls back to the language detected from your recent Claude sessions (else English).
- GitHub star is now **opt-in** — on first run the command asks once via AskUserQuestion (`네, ⭐ 눌러주기` / `아니요`) instead of auto-starring. The star logic moved into `setup.sh` and records the choice (`~/.gptaku-setup/<plugin>.star.json`) so it never re-asks. `setup.sh` no longer stars anything automatically.

## [0.21.3] - 2026-06-19

### Changed — 외부 CLI provider 정비: gemini 제거 + gajae-code(`gjc`) 추가

`PROVIDER_BINARIES`를 `{ codex, antigravity, gjc }`로 정비. Gemini CLI는 지원 종료로 호출 경로 제거, 멀티모델 코딩 CLI인 gajae-code(`gjc`)를 새 provider로 추가했다.

**Removed — Gemini CLI**
- `run-cli-job.js`: `PROVIDER_BINARIES`에서 `gemini` 제거. `--provider gemini`는 `unsupported provider`로 거부됨 (검증: `check gemini` exit 1)
- `run-cli-worker.js`: `provider === 'gemini'` 분기(`gemini --yolo -m gemini-2.5-pro`) 삭제. 디자인/UI 외주는 Gemini CLI 후계인 Antigravity CLI(`agy`)로 단일화

**Added — gajae-code(`gjc`)**
- `run-cli-job.js`: `PROVIDER_BINARIES`에 `gjc: 'gjc'` 추가
- `run-cli-worker.js`: `provider === 'gjc'` 분기 추가 — `gjc --print "<프롬프트 내용>"` (agy처럼 프롬프트를 마지막 positional로 전달). 모델은 gjc 기본값
- `check-env.js` / `check-env.sh`: gjc 설치 감지 블록 추가 (멀티 모델 선택 조건)
- `SKILL.md`: 환경 스캔·역할 배정·역할 표·명명 표·§6-5 provider 목록에 gjc 노출 → 코드 구현·분석 + cross-model 검토 역할로 배정 가능
- 실측 검증: `--provider gjc` end-to-end 잡 `done`(exit 0), 출력 `KKIRI_GJC_OK` 정상 캡처. 비-TTY 파이프 stdout 정상 (agy stdout 누락 버그 없음)

## [0.20.2] - 2026-06-11

### Changed — Workflow 모델 선택 기준 명문화 (Step 4-W)

실측 검증(4-agent 워크플로우, 2026-06-11)으로 model 핀 동작 확인 후 규칙을 판정 기준 표로 교체:

- **모든 `agent()`에 model 핀 — 예외 없음**: 핀을 빼면 세션 모델을 그대로 상속함을 실측으로 확인 (핀 없는 에이전트가 메인 세션 모델로 스폰). 세션이 비싼 모델이면 팬아웃 전체 비용 폭증
- **선택 기준 표 신설**: "스테이지가 하는 일"로 판정 — 팬아웃 본체·검증=sonnet(기본값, 망설여지면 sonnet) / 판단 없는 기계적 처리=haiku / 전체 결과를 한 번에 보는 종합·판단=opus(워크플로우당 1~2회 제한)
- adversarial-verify 스테이지는 sonnet 고정 (검증 물량이 팬아웃 수에 비례)
- `"opus"` 핀은 1M 컨텍스트 변형으로 해석됨을 명시 (실측: `claude-opus-4-8[1m]`) — 종합 스테이지에 큰 입력 안전

## [0.20.1] - 2026-06-10

### Changed — 용어 정책 전환: 공식 용어 + 한글 설명 병기

v0.20.0 첫 실행에서 Step 3.5 선택지가 "공정 라인/작전 통제실"이라는 자체 메타포로 표시되는 문제 확인. **원칙 교정: 용어·기능명은 공식 문서 기반 명칭(Agent Teams, Workflow, Opus, Sonnet, MCP 등)을 그대로 쓰고, 한글은 설명으로만 병기한다.**

- Step 3.5 선택지: "작전 통제실/공정 라인" → **"Agent Teams (실시간 협업)" / "Workflow (대량 자동 처리)"**
- SKILL.md·check-env·commands·coordination-protocols·README.ko 전체에서 자체 메타포 명칭을 공식 용어로 교체 (한글 조사 교정 포함)
- **모델명 은닉 정책 폐기**: "가장 똑똑한 AI/전문 AI" 단독 표기 → `공식 용어 (한글 설명)` 병기 형식 ("Opus (가장 똑똑한 모델)"). Step 5 제안 형식·인터뷰 가이드 동기화
- metaphor-guide.md → **용어 가이드**로 재정의: 공식 용어는 그대로 + 설명 병기, 내부 구현(TeamCreate/SendMessage/파일 경로)만 비노출, 사용자가 물어보면 솔직히 설명
- MCP·subagent도 공식 용어로 노출 (설명 병기)

## [0.20.0] - 2026-06-10

### Added — Substrate-Aware Orchestration (메이저 개편)

설계 문서: `docs/REDESIGN-v0.20.0.md`. 공식 문서(code.claude.com agent-teams/workflows) 근거 + Agent Council(독립 Claude·Gemini) 교차 검증.

- **Step 3.5 실행 방식 선택 신설**: 팀 구성 *전에* 사용자가 AskUserQuestion으로 [작전 통제실(Agent Teams) / 공정 라인(Workflows)]을 직접 선택. 가용성(Teams 플래그·Claude Code 버전 ≥ 2.1.154)으로 선택지 동적 구성, 단일 가용 시 직행, 추천 휴리스틱 포함. Workflow 도구는 사용자가 "공정 라인"을 골랐을 때만 호출.
- **공정 라인(Workflows) 경로 신설**: Step 4-W(인라인 스크립트 구성 — pipeline/parallel, 스테이지별 model 명시, adversarial-verify 스테이지 필수) → 6-W(Workflow 도구 호출, 승인 카드가 사용자 확인) → 7-W(내부 검증 + 선택적 Codex 사후 검토) → 8-W(반환값 리포트 + `/workflows` 저장 안내). 공유 메모리·도메인 카드 인프라는 만들지 않음.
- **모델 배정 규칙 재정의**: Opus=팀장·분석·비평·종합·핵심구현 / Sonnet=일반 워커 기본(적극 활용) / Haiku=기계적 글루 한정 부활 / 검토는 build와 다른 family — Codex→agy→Opus 적대 인스턴스(refute 프롬프트) 폴백 체인. 가격 사다리($1/$5–$3/$15–$5/$25) 근거.
- **외부 CLI 역할 재정의**: Codex=코드·대규모 분석(생산+1순위 검토자), agy=디자인/UI(Gemini CLI 대체본). **Gemini CLI 완전 제거** (2026-06-18 전환).

### Changed

- **Step 6-0 "팬아웃 vs 능동 모드 선택" 삭제**: 작전 통제실은 항상 능동(적응형 척추) — 대량·독립 작업은 Step 3.5에서 공정 라인으로 분기되므로 모드 선택 불필요. coordination-protocols.md와의 프레이밍 모순 해소.
- **유령 "Step 5.5 라우터" 참조 제거** (스펙에 없는 dangling reference).
- **check-env 완화**: `EXPERIMENTAL_AGENT_TEAMS` 단독 hard-require → "Teams 플래그 OR Workflows(버전) 중 최소 1개"로 완화. Claude Code 버전 체크 추가. Gemini 감지 제거.
- presets.md 모델 컬럼 동기화 (Researcher/보조 Developer=Sonnet, 분석 Explorer/Strategist=Opus 유지).
- commands/kkirikkiri.md allowed-tools에 `Workflow` 추가 (AskUserQuestion은 의도적으로 미포함 — auto-approve 버그 회피).

## [0.16.2] - 2026-05-19

### Fixed — Step 5→6 경계 + Step 6-2 Action Vacuum 회귀 (v0.15.2 핫픽스 누락분)

v0.15.2(2026-05-05) Council 핫픽스에서 "AskUserQuestion 응답 후 모델이 다음 도구 호출 없이 정지하는 회귀"를 Step 3/4/7-6/8-2에 적용했으나, **Step 5→6 경계와 Step 6 본문**에는 동일 패치가 누락되어 "팀 구성 확인 후 멈춤" 증상이 잔존했음. SKILL.md 3곳에 `🚨 EXECUTE NOW` 박스 추가로 도구 호출 앵커 복원.

- **Step 5-2 응답 처리 직후 (`SKILL.md` line 533)** — "네, 시작해주세요" 응답 수신 시 즉시 Bash(team_name 생성) + Bash(mkdir) + TeamCreate를 호출하도록 명령형 트리거 박스 추가. 부정형 Continuation Contract("멈춤 금지")만으로는 다음 액션 샘플링 보장 불가하다는 v0.15.2 Council 합의 적용.
- **Step 6 진입부 (`SKILL.md` line 547)** — 6-1 / 6-2 / 6-2.5 / 6-4의 코드 블록이 "예시"가 아닌 "실호출"임을 명시하는 진입 박스 추가. Step 단위 도구 호출 누락 방지.
- **Step 6-2 MANDATORY READ 직후 (`SKILL.md` line 643)** — shared-memory.md Read 직후 즉시 TEAM_PLAN.md / TEAM_PROGRESS.md / TEAM_FINDINGS.md Write 호출 박스 추가. Read만 하고 공유 메모리 초기화 없이 Step 6-2.5로 점프하던 위험 차단.

### Council 합의 적용 (v0.15.2)

- 직접 원인: 단계 본문의 `EXECUTE/MANDATORY + 도구명 + 코드블록` 앵커가 상단 lazy-read 표보다 훨씬 강한 도구 호출 트리거임. v0.15.2 핫픽스 정신을 Step 5→6 / Step 6 본문에도 일관 적용.
- 회귀 방지: 향후 토큰 절약 리팩토링 시 도구 호출 앵커는 줄이지 않는 원칙 재확인.

### 검증

- 패치 후 `🚨 EXECUTE NOW | 🚨 MANDATORY` 앵커가 SKILL.md 전체에서 워크플로우 흐름에 따라 일관 배치됨 (Step 3 / 4 / 5→6 / 6 / 6-2 / 6-4 / 7-6 / 8 / 8-3).
- "AskUserQuestion 응답 → 다음 도구 호출 없는 정지" 시나리오 차단 검증.

## [0.16.1] - 2026-05-10

### Added — v0.16.0 검증 후속 보강 (3건)

v0.16.0 출시 직후 검증 agent(가상 GraphQL Federation 보안+가스 시나리오)가 발견한 미세 갭 3건 보강. 합성 메커니즘은 의도대로 동작 확인됨(16/16 체크 통과). 이번 패치는 에지 케이스 명료화에 한정.

- **`team-prompts.md` Builder 도메인 적응 가이드에 운영(SRE/DevOps) 결 보강**:
  - "한 번 동작" → "1만 시간 동작" 차이 명시
  - SLO/error budget/on-call runbook/canary/MTTR/RTO/RPO/관측성 요소를 도메인 살 채집 가이드에 추가
  - 도메인 KPI 예시: 99.9% SLO / MTTR < 30분 / 변경 실패율 < 15% / 배포 lead time < 1일
  - 별도 Operator archetype 신설하지 않고 Builder 카드의 도메인 살로 흡수 (보수적 옵션)
- **`team-prompts.md` Leader 카드의 도메인 살 가이드 신설**:
  - Leader는 직접 산출 없음 → 도메인 살 4종이 메타 차원으로 변환됨을 명문화
  - 메타 KPI 실수치 예시: 통합 리포트 외부 검토 통과율 90%+ / 평균 1.5라운드 / 팀원 idle 평균 1회 이하 / 태스크 완료율 90%+ / 결정 사후 추적성 100%
  - 도메인별 게이트 변주 명시 (리서치 = 교차검증 3소스 게이트, 개발 = 테스트 게이트, 디자인 = 사용성 5명 게이트)
- **`subagent-synthesis.md` 도메인 살 채집 우선순위 통일 + 심부름꾼 정의 명문화**:
  - "심부름꾼 = Task(general-purpose, sonnet, bypassPermissions)" 코드블록 추가 — 새 사용자가 SKILL.md/synthesis 분산된 채집 우선순위에 혼란 없게
  - 1회 fetch 원칙 명시
  - 길이 가이드 표에 archetype 예시 + Leader 메타 행 추가 (단순 보조 모호성 해소)

### 검증 결과 (v0.16.0)
- 16/16 자체 검증 체크 통과 (8항목 × 2가상 카드)
- 카드 길이 105~110줄 (목표 100~150 범위)
- agency-agents 외부 fetch 0회로 농밀 카드 합성 성공
- "한 팀원 = 한 archetype" 분리 규칙 자동 작동
- 흔한 오매칭(Builder 함정) 회피

## [0.16.0] - 2026-05-10

### Changed — 동적 합성 중심 구조로 재편 (archetype 5종 → 7종)

서브에이전트 정의가 외부 패키지(agency-agents) 카탈로그 압축본에 의존하던 구조에서, **kkirikkiri 자체의 archetype 마스터 + 동적 합성 가이드**를 핵심 자산으로 삼는 구조로 전환. 카드는 30~50줄 압축본이 아니라 **archetype 본문 + 도메인 살 4종**으로 100~150줄 농밀하게 합성됨. 어떤 도메인 요청이 와도 LLM이 즉석 합성 가능.

- **archetype 5종 → 7종 확장** (`team-prompts.md`):
  - 신규: **Writer** (Audience-First, 전달 검증) / **Designer** (Usability + Aesthetic-First, 사용성 검증)
  - 기존 5종 모두 농밀화 — 도메인 적응 가이드 / 실제 발언 예시 / 결과물 형식 / 실수치 KPI 추가
  - 각 archetype 100~120줄, 전체 약 530줄
  - 기존 "Builder가 코드/문서/디자인/마케팅을 다 흡수"하던 행동 원칙 충돌 해소

- **`agency-agents-catalog.md` → `subagent-synthesis.md` 리네임 + 재구성**:
  - 외부 패키지 카탈로그 압축본 10개 + 3-tier fetch 로직(설치→GitHub→동적생성)이 메인이던 구조를 폐기
  - 새 구조: 합성 5단계 (역할 분해 → archetype 매칭 → 도메인 살 채집 → 카드 합성 → 스폰) + few-shot 예시 + 외부 자원 부록
  - 도메인 살 4종 명문화: 정체성 / 스택·메서드 / 실패 패턴 / KPI 실수치 (모두 generic 회피·실수치·구체 안티패턴)
  - 흔한 archetype 오매칭 표 (기술문서 → Builder❌ Writer✅ 등)
  - few-shot 예시 2종 (Solidity 감사자 110줄 전체 / TikTok 전략가 요약)

- **카드 포맷 변경** (`SKILL.md` Step 6-2.5):
  - 옛 압축 포맷(30~50줄, 정체성·핵심미션·절대규칙·성공기준만) → 새 농밀 포맷(100~150줄, archetype + 도메인 살 4종)
  - frontmatter `source: tier1-* | tier2-github | tier3-generated` → `archetype: [7종 중 1]` + `domain:` 필드
  - 압축 기준 표 → 농밀 기준 표로 뒤집기 (코드 예시 / 도메인 스택 / 실패 패턴 / 소통 예시 모두 "포함" 칼럼)

- **`SKILL.md` Step 4 — 3-tier 선택 로직 폐기**:
  - "Tier 1 설치 → Tier 2 GitHub fetch → Tier 3 동적 생성" 우선순위 제거
  - 새 절차: archetype 매칭 (검증 방식 시그널 → 7종 중 1) → 도메인 살 4종 채집 (LLM 자체 지식 우선) → 카드 합성
  - agency-agents 외부 자원은 **부록 시나리오 A/B**로 후퇴 (사용자 환경에 설치되어 있고 카탈로그와 정확히 매칭될 때만 보조 활용)
  - 한 팀원에게 두 archetype 강제 금지 (분리해서 다른 팀원으로 스폰)

- **`SKILL.md` Step 6-4 — 스폰 프롬프트 패턴 단일화**:
  - 옛 패턴: Tier 1은 외부 에이전트 직접, Tier 2/3은 카드 Read 지시
  - 새 패턴: 모든 팀원이 archetype 본문(team-prompts.md) + 도메인 카드 두 파일 Read
  - 토큰 효율: archetype 본문은 한 곳, 여러 팀원이 공유

- **체크리스트 업데이트** (`절대 하지 마` / `항상 해`):
  - "압축 포맷 사용" → "archetype + 4종 살 100~150줄"
  - "확신 80% 미만 GitHub fetch 금지" → "LLM 자체 지식으로 합성 가능한데 외부 fetch부터 하지 마"
  - 신규: "도메인 살 4종 중 하나라도 빠뜨리면 일반론으로 빠짐"
  - 신규: "한 팀원에게 두 archetype 강제 금지"

### 참고
- 분석 기반: `handoff-kkirikkiri-subagent-analysis-20260510.md` (사용자 핸드오프 문서)
- agency-agents 카탈로그(60+개 외부 도메인 정의)는 **부록**으로 보존 — 사용자 환경에 설치된 경우의 보조 활용 경로 유지

## [0.15.2] - 2026-05-05

### Fixed — AskUserQuestion 응답 후 멈춤 회귀 (v0.15.1 핫픽스)

v0.15.1에서 MANDATORY READ wrapper를 6→3회로 축소하면서, **AskUserQuestion 응답 수신 후 모델이 다음 도구 호출 없이 정지하는 회귀**가 발생했다. Step 3/Step 4/Step 8-2 진입부의 도구 호출 트리거(`🚨 MANDATORY READ` 박스)가 *"이미 읽었다고 가정"*, *"여기서는 생략"* 같은 부정형 안내문으로 대체되면서 모델이 다음 액션 앵커를 잃은 것이 직접 원인. Agent Council (Claude/Codex/Gemini) 검토를 거쳐 핫픽스 확정.

- **Step 3/Step 4/Step 7-6/Step 8-2 진입부에 `🚨 EXECUTE NOW: Read(...)` 박스 복원** — 부정형 안내문을 명령형 도구 호출 트리거로 전환
- **모든 AskUserQuestion 블록에 Continuation Contract 추가** (Step 3/Step 5/Step 7-3/Step 8-3/Step 8-3-1) — "응답 수신 후 즉시 다음 Step의 도구 호출로 진행, 텍스트만 출력하고 멈춤 금지" 명시
- **사전 준비 섹션 재작성** — 17줄 "사전 준비 후 즉시 AskUserQuestion 호출" vs 28-33줄 lazy-read 표 "Step 진입 직전에만 읽는다"의 충돌 해소. 사전 준비는 `presets.md`만 읽고, 나머지는 각 Step 본문의 `EXECUTE NOW` 박스가 실제 트리거임을 명시. lazy-read 표를 "Per-step EXECUTE Read 인덱스"로 명령형 전환.
- **`KKIRIKKIRI_DIR` placeholder 정의를 사전 준비 섹션에 추가** — Step 6-1에서야 정의되던 변수가 Step 2/Step 4 캐시 확인/team-prompts 템플릿에서 미리 참조되며 발생하던 변수 미정의 참조 문제 해소

### Council 합의 사항

- 직접 원인은 "MANDATORY READ 박스 → 부정형 안내문" 변환으로 인한 도구 호출 트리거 상실 ("Action Vacuum 상태"). LLM 도구 호출은 상태머신이 아니라 현재 컨텍스트에서 샘플링되는 다음 액션이므로, 단계 본문의 `EXECUTE/MANDATORY + 도구명 + 코드블록`이 상단 lazy-read 표보다 훨씬 강한 트리거임 — 토큰 절약 리팩토링 시 도구 호출 앵커는 줄이지 않는 것이 원칙
- `KKIRIKKIRI_DIR` 변수 선언 시점 문제는 보조 원인 (Context Noise)이며 멈춤의 직접 원인은 아님 — 함께 해소
- `team-prompts.md` 페르소나 자유화 (v0.15.1)는 멈춤 직접 원인 아님 — 별도 마이너 패치로 분리

## [0.15.1] - 2026-05-04

### Removed
- SKILL.md MANDATORY READ wrapper 6회 → 3회로 축소 (Step 3 / Step 4 / Step 8-2 위치 삭제)
  - 보존: Step 6-2 (공유 메모리 초기화), Step 6-4 (팀원 스폰), Step 7-6 (2라운드 진입) — 컨텍스트 손실 가장 큰 시점

### Changed
- team-prompts.md 5 archetype 페르소나 형용사 강제(`성격: [3-4 형용사]`) → 자유 narrative (`정체성: 한 줄 자유 narrative — generic 형용사 회피`)
- 측정 결과 4/5 archetype이 generic adjective cluster 공유 → 자유화로 차별성 회복

### Preserved
- 5 archetype (Researcher/Builder/Analyst/Critic/Leader) 검증 다중성
- TeamCreate / TaskCreate / SendMessage / TaskUpdate API 스키마
- AskUserQuestion JSON 호출 (parser contract)
- 공유 메모리 경로 + 4단계 작업 완료 protocol
- Leader R&R "직접 코드/검색/문서 작성 금지" (역할 분리)
- 43 lock-in 체크리스트 (워크플로우 끝의 안전 가드 — Gemini "앵커링" 비판 인정 후 보존)

## [0.15.0] - 2026-05-03

### Changed — 멀티세션 격리 (Phase 1)

같은 워크스페이스에서 `/kkirikkiri`를 여러 Claude Code 세션이 동시에 실행할 때 공유 문서가 섞이거나 유실되던 문제 해결. 모든 working state를 `team_name` 기반 세션 디렉토리로 격리.

- **새 디렉토리 레이아웃**:
  - `.kkirikkiri/teams/{team_name}/` — 세션 격리 (TEAM_PLAN/PROGRESS/FINDINGS, agents/, prompts/, agent-cache/, archive/, report.md)
  - `.kkirikkiri/shared/saved-teams/{team_name}.md` — 크로스 세션 공유 (사용자 명시 저장)
- **team_name 형식 변경**: `kkirikkiri-{preset}-{YYYYMMDD-HHMM}-{rand4}` (4자리 hex suffix로 동시 시작 충돌 방지)
- **Step 6-1**에 `KKIRIKKIRI_DIR` 변수 정의 + 디렉토리 생성 + team_name 사용자 출력
- **레거시 마이그레이션 셰임**: 기존 평면 레이아웃 자동 감지 → `teams/legacy-{epoch}/`로 1회 이동 (mkdir 락 기반 race-safe)
- **archive 로직 재설계**: 인터-세션 archive 제거, within-session 재구성용으로만 보존 (`{KKIRIKKIRI_DIR}/archive/`)
- **canonical report**: `kkirikkiri-report-{timestamp}.md` (루트) → `{KKIRIKKIRI_DIR}/report.md`
- 6개 파일 경로 일괄 변수화: SKILL.md, team-prompts.md, shared-memory.md, output-guide.md, agency-agents-catalog.md, README

### Removed

- `shared-memory.md`의 인터-세션 archive 로직 (Step 6-2 진입 시 다른 세션의 in-flight 파일을 archive로 밀어내던 데이터 유실 원인)
- "이전 세션 TEAM_FINDINGS.md 아카이빙 확인" 체크리스트 항목 (격리 후 불필요)

### Notes

- Phase 2 (예정): `index.json` 활성 세션 레지스트리 + agent-cache atomic write + stale 세션 GC
- Agent Council (Claude/Codex/Gemini) 설계 검토 후 합의 7건 반영

## [0.12.0] - 2026-03-17

### Added
- Step 6-2 아카이빙 기능 — 이전 세션의 TEAM_FINDINGS.md를 선택적으로 보존
  - AskUserQuestion으로 3가지 선택지: "보관하고 새로 시작" / "그냥 새로 시작" / "이전 기록 이어서"
  - archive/ 디렉토리에 날짜별 보관 (Bash cp ~100 토큰)
  - 10KB 초과 시 요약 아카이빙 전환 고려
- "항상 해" 체크리스트에 아카이빙 확인 항목 추가

## [0.11.0] - 2026-03-15

### Changed
- Step 2 에이전트 동적 매칭 — recommended_agents 하드코딩 → description 키워드 기반 동적 매칭
  - 우선순위: recommended-for 필드 > agent_match_keywords > 의미적 관련성
- Step 6 팀원 프롬프트 템플릿 7→12 섹션 확장 (정체성/핵심원칙/성공기준/결과물형식/소통방식)
- presets.md: 6개 프리셋 recommended_agents → agent_match_keywords 전환

### Fixed
- Step 5 AskUserQuestion markdown collapse ("N lines hidden") 문제 해결 — 텍스트 출력 → 간단 확인 분리

## [0.10.0] - 2026-03-13

### Added
- 에이전트 저장 기능 (Step 8-3-1) — 잘 동작한 팀원을 .claude/agents/에 재사용 가능한 에이전트로 저장
- 스폰 안정성 — 3단계 재시도 로직 (동일 설정 → 모델 다운그레이드 → 팀 축소)
- 팀장 프롬프트에 팀원 무응답/스폰 실패 대응 지시 추가

## [0.9.0] - 2026-03-08

### Added
- PM/Product 프리셋 — PM 프레임워크 기반 제품 기획 (디스커버리, 전략, PRD, GTM)
  - pm-frameworks.md 레퍼런스 추가
  - 체이닝 워크플로우 (리서치 → 분석/전략 → 문서화)
- 크로스 플랫폼 호환성 (Windows/Unix path 처리)

## [0.8.0] - 2026-03-05

### Fixed
- allowed-tools에서 AskUserQuestion 제거 — auto-approve로 UI가 렌더링되지 않던 버그 해결
- SKILL.md + command에 EXECUTE 키워드 적용 — 도구 호출 보장 강화

## [0.7.3] - 2026-03-02

### Fixed
- AskUserQuestion 도구 호출 보장을 위한 SKILL.md 전면 개선 (7가지 근본 원인 해결)
  - 실행 앵커 추가: "WHEN TRIGGERED - EXECUTE IMMEDIATELY" 섹션 신규 삽입
  - 모든 AskUserQuestion 블록에 "EXECUTE:" 명령형 키워드 적용 (Step 3/5/7/8)
  - Step 5 markdown placeholder `{팀 구성 트리}` → `(동적: ...)` 패턴으로 교체
  - Step 7 question placeholder `[부족한 부분 설명]` → `(동적: ...)` 패턴으로 교체
  - 부정형 지시 "텍스트로 출력하면 안 된다" → 긍정형 "즉시 호출한다"로 변경

## [0.7.2] - 2026-03-02

### Fixed
- AskUserQuestion JS-like pseudo-code 4개를 JSON 형식으로 전환 — 도구 호출 보장
  - Step 3 인터뷰, Step 5 팀 확인, Step 7 품질 검증, Step 8 팀 저장

## [0.7.1] - 2026-03-01

### Fixed
- Step 3: 인터뷰 스킵 조건 강화 — Q2/Q3는 반드시 AskUserQuestion 호출 (모호한 입력 시 Q1도 스킵 금지)
- Step 5: AskUserQuestion markdown 필드를 pseudo-code에서 유효한 문자열 생성 지시로 수정
- Step 6: 공유 메모리 초기화 시 기존 `.kkirikkiri/` 파일 존재 여부 확인 로직 추가 (Write 에러 방지)
- SKILL.md 본문 명령형 위반 14건 수정 (`~합니다` → `~한다`)

### Changed
- marketplace.json description을 plugin.json과 통일

## [0.7.0] - 2026-02-28

### Added
- SKILL.md frontmatter 추가 (name, description + 트리거 키워드)
- `.gitignore` 추가

### Changed
- SKILL.md 본문 2인칭(~하세요) → 명령형(~한다)으로 통일 (CCPS v2.0 준수)
- README.md를 CCPS v2.0 템플릿에 맞게 재작성
  - "이런 분을 위한 도구입니다", "구성요소", "요구사항" 섹션 추가
  - 마켓플레이스 설치 명령어 추가
- 별도 GitHub 레포로 분리 → gptaku_plugins에 서브모듈로 등록

## [0.6.0] - 2026-02-28

### Changed
- 스킬 디렉토리 `skills/team-builder/` → `skills/kkirikkiri/`로 이름 통일
- CLI 스크립트 리팩토링 — `run-cli.js` 단일 파일 → 3파일 구조로 분리
  - `run-cli.sh` (진입점) → `run-cli-job.js` (오케스트레이터) → `run-cli-worker.js` (워커)
  - 서브커맨드: start / status / wait / results / stop / clean / check
- `commands/kkirikkiri.md`에 metaphor-guide.md 로드 추가, 7단계→8단계 수정
- 외부 CLI 프롬프트 경로 `/tmp/` → `.kkirikkiri/prompts/`로 변경
- README.md 파일 구조 트리 업데이트
- gptaku_plugins README에 끼리끼리 추가

## [0.5.0] - 2026-02-28

### Added
- 비유 가이드 레퍼런스 (`references/metaphor-guide.md`) — 기술 용어 → 일상 표현 변환표
  - 모델명, 시스템 용어, 비용/시간, 품질/검증 4개 카테고리
  - 사전 준비 레퍼런스로 스킬 호출 시 자동 로드
- Auto-memory 환경 캐싱 (Step 2) — 이전 환경 스캔 결과 재활용으로 시작 속도 향상
- Auto-memory 저장 유도 (Step 8) — 팀 구성/환경/결과를 자연어 요약 출력하여 다음 세션 활용

### Fixed
- `run-cli.js` 보안 수정 — Gemini CLI 실행에서 `shell: true` 제거
  - 파일 경로 기반 명령어 주입 취약점 차단
  - `quoteForShell` 제거, `validatePath` + fd 기반 stdout 리다이렉션으로 교체

## [0.4.0] - 2026-02-28

### Added
- Step 5 팀 구성 확인에 AskUserQuestion markdown preview 도입
  - 팀 구조를 ASCII 트리 + 역할/도구 테이블로 시각화
  - 유저가 팀 구성을 한눈에 파악하고 승인 가능

## [0.3.0] - 2026-02-28

### Added
- 파일 모드 — `@파일명`으로 스킬/에이전트 파일 기반 팀 자동 구성
- 기존 에이전트 재활용 — `.claude/agents/` 파일을 팀에 포함하여 재사용
- 팀 저장/불러오기 — 잘 동작한 팀 구성을 `.kkirikkiri/saved-teams/`에 저장, 다음에 인터뷰 없이 재사용
- TeammateIdle 품질 훅 — 3단계 에스컬레이션 (무시 → 확인 → 교체)
- kill criteria — 같은 실수 2회 반복 시 즉시 교체

## [0.2.0] - 2026-02-28

### Added
- 공유 메모리 시스템 (TEAM_PLAN.md, TEAM_PROGRESS.md, TEAM_FINDINGS.md)
- DEAD_ENDS 섹션 — 실패한 접근을 기록하여 반복 방지 (컨텍스트 복구율 75-80%)
- 심부름꾼 패턴 — 팀원이 서브 에이전트(Sonnet)를 스폰하여 병렬 작업
- 검증 루프 — 최대 3라운드, 4가지 품질 기준 자동 판정
- 부분 교체(방식 C) — 문제 팀원만 교체, 나머지 유지
- 바이어스 방지 3종 — 외부 검증자, 역할 순환, 반론 의무
- 라운드별 권장 전략 표 (R1: 원래 팀, R2: A/B/C 판정, R3: 무조건 재구성)
- 팀장 품질 검증 4기준 표 (목표달성도/일관성/완성도/정확성)
- 블라인드 리뷰 패턴 — 팀장이 편견 없이 산출물 검증
- 비용/시간 안내 — Step 5에 예상 시간, 비용절약 힌트, 모델 비유 용어표 추가
- 환경 점검 스크립트 (scripts/check-env.sh) — 필수/선택 조건 자동 점검
- VERSIONING.md — SemVer 기반 버전 관리 표준

### Changed
- 절대하지마 체크리스트 7→13항목으로 강화
- 항상해 체크리스트 7→14항목으로 강화
- 공유 메모리 규칙 +2 추가 (DEAD_ENDS 기록, 새 팀원 파일 읽기 필수)
- 팀원 프롬프트에 DEAD_ENDS 기록 의무 추가
- 팀장 프롬프트에 품질 검증 표 + 블라인드 리뷰 추가

## [0.1.0] - 2026-02-28

### Added
- 최초 릴리즈
- 자연어 의도 파싱 + 4종 프리셋 (리서치, 개발, 분석, 콘텐츠)
- 인터뷰 기반 팀 구성 (프리셋별 2-3개 질문)
- 환경 자동 스캔 (CLI, MCP 서버, 에이전트 파일)
- 인터뷰 + 환경에 따른 동적 팀 조정
- 멀티 모델 지원 (Codex CLI, Gemini CLI 백그라운드 실행)
- Claude Code Agent Teams 네이티브 연동 (TeamCreate, Task, SendMessage)
- 팀장 R&R 강제 (Opus 전용, 코딩 금지, PM 역할)
- 결과 리포트 생성
