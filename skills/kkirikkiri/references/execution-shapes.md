# 실행형태 (Execution Shapes) — Workflow 경로 전용

> **적용 범위: Workflow 경로 전용.** Agent Teams는 영속 팀 + 공유메모리 + Ralph 루프 구조라
> 워크트리 격리가 불가능하고 채점 노드가 Ralph와 겹친다 → 이 문서를 쓰지 않는다.

Step 4-W가 스크립트를 짤 때, 태스크의 **모양**을 아래 5종 중에서 고른다.
Step 4-W의 기존 규칙(**모델 핀 필수 / adversarial-verify 필수 / schema 강제**)은 5종 전부에 그대로 적용된다.

**모델은 사용자 선택 우선**: 아래 Sonnet/Opus 리터럴은 추천 조합의 예시다.
`model-selection.md`에서 선택받은 phase별 모델로 치환한 뒤 실행한다. 검증·부모·shim
역할도 예외가 아니다. 선택한 모델이 사용 불가하면 임의 대체하지 않고 다시 선택받는다.
Haiku는 기본 추천에서 제외하고 사용자 명시 요청 때만 사용한다.

---

## 5종 요약

| shape | 한글 | 의미 | 언제 |
|---|---|---|---|
| `parallel` | 병렬 | 안 부딪히는 묶음은 같이 | **기본값.** 항목들이 서로 독립일 때 |
| `serial` | 직렬 | 한 줄로 차례차례 | 뒤 항목이 앞 항목의 산출물을 입력으로 쓸 때 |
| `chain` | 플랜 뒤에 플랜 | 앞 스테이지가 **전부** 끝나야 뒤가 시작 | 다음 단계가 앞 단계 **전체**를 봐야 할 때 (dedup·종합) |
| `fanout` | 부모와 자식 | 자식이 다 끝나야 부모도 끝난다 | 하나의 결론을 여러 조사가 떠받칠 때 |
| `tournament` | 토너먼트 | 여럿이 같은 과제에 붙고 채점으로 고른다 | 게이트가 명확한 **어려운 단일** 코딩 태스크 |

`serial`·`chain`·`fanout`은 전부 의존 그래프의 변형이다 — 단위만 다르다
(`serial`=항목 단위, `chain`=스테이지 단위, `fanout`=부모/자식 단위).
`parallel`은 의존 없음, `tournament`만 별도의 채점·채택 노드를 갖는다.

---

## 1. parallel (병렬) — 기본값

```javascript
phase('수집')
const found = await parallel(SOURCES.map(s => () =>
  agent(`[조사 지시] ${s}`, {model: 'sonnet', phase: '수집', schema: FINDING_SCHEMA})))
```

`parallel()`은 **배리어**다 — 전부 끝나야 다음 줄로 간다. 배리어가 필요 없으면 `pipeline()`을 쓴다.

---

## 2. serial (직렬)

배리어가 아니라 **순차 await**로 표현한다. 앞의 결과가 뒤의 입력이 된다.

```javascript
phase('직렬')
let carry = null
for (const step of STEPS) {
  carry = await agent(
    `이전 결과: ${JSON.stringify(carry)}\n다음 작업: ${step.prompt}`,
    {model: 'sonnet', phase: '직렬', label: `serial:${step.key}`, schema: STEP_SCHEMA})
}
```

> ⚠️ 직렬은 병렬 이득이 0이다. **정말 앞 결과가 필요한 경우에만** 쓴다.
> "개념적으로 순서가 있어 보인다"는 직렬의 근거가 아니다.

---

## 3. chain (플랜 뒤에 플랜)

스테이지 사이에 배리어를 둔다. `parallel()`이 배리어이므로 그걸 연달아 쓴다.

```javascript
phase('플랜 A')
const a = (await parallel(ITEMS.map(i => () =>
  agent(`A단계: ${i}`, {model: 'sonnet', phase: '플랜 A', schema: A_SCHEMA})))).filter(Boolean)

const deduped = dedupe(a)          // ← 배리어가 정당한 이유: 전체를 한 번에 봐야 함

phase('플랜 B')
const b = await parallel(deduped.map(x => () =>
  agent(`B단계: ${JSON.stringify(x)}`, {model: 'sonnet', phase: '플랜 B', schema: B_SCHEMA})))
```

**배리어가 정당한 경우는 셋뿐이다**: 전체 대상 dedup/merge, 총계 0이면 조기 종료,
다음 프롬프트가 "다른 결과들과 비교"를 요구할 때. 단순 flatten/map/filter는 배리어 사유가 아니다 —
그건 `pipeline()` 스테이지 안에서 한다.

---

## 4. fanout (부모와 자식)

자식들을 병렬로 돌리고, 그 결과 전체를 부모가 받아 결론을 낸다.

```javascript
phase('자식')
const children = (await parallel(SUBQUESTIONS.map(q => () =>
  agent(`하위 질문: ${q}`, {model: 'sonnet', phase: '자식', schema: CHILD_SCHEMA}))))
  .filter(Boolean)

phase('검증')
const verified = await parallel(children.map(c => () =>
  agent(`다음을 반박하라(refute). 확신 없으면 refuted=true: ${JSON.stringify(c)}`,
        {model: 'sonnet', phase: '검증', schema: VERDICT_SCHEMA})))

phase('부모')
return await agent(`검증 통과 결과만으로 부모 결론을 내라: ...`,
                   {model: 'opus', phase: '부모'})
```

부모의 종합 작업에는 Opus를 추천할 수 있지만, 실제 값은 사용자가 선택한 모델을 따른다.

---

## 5. tournament (토너먼트)

**같은 과제를 여러 외부 CLI 워커에게 시키고, 게이트로 채점해 승자를 채택한다.**

### 5-1. 전제 — 이걸 못 지키면 실행하지 않는다

| 가드 | 이유 |
|---|---|
| **`gates`가 비면 거부** | 채점 근거가 없으면 모델 판정만 남아 재현성이 사라진다 |
| **참가자별 워크트리가 달라야 함** | 같은 디렉토리면 서로 덮어쓴다 |
| **참가자는 기본 2명** | N배 비용. 3명 이상은 사용자가 명시할 때만 |
| **어려운 단일 코딩 태스크에만** | 쉬운 태스크는 단독으로 충분하고, 리서치·기획은 채점이 불가능하다 |

> ⚠️ **비용**: 토너먼트는 정의상 참가자 수만큼 토큰·시간이 든다.
> 전체 태스크에 기본 적용하지 않는다. 사용자가 명시적으로 고른 태스크에만.

> 🔴 **실측 판정 (2026-08-23) — 이 기능은 옵트인 실험 상태다.**
> codex vs grok A/B 2라운드(parseDuration 15케이스, parseCSV RFC4180 20케이스)에서
> **양 참가자가 게이트를 전부 통과**해 통과율 차이가 0이었다. CLI 호출만 2배 들었다.
> → 어려운 태스크의 권장 기본값으로 **승격하지 않는다**. `adopt: 'merge'`도 **미구현**.
> 단 이 판정은 **테스트가 미리 주어진, 잘 명세된 태스크에 한정**된다 — 명세가 모호하고
> 접근법이 갈리는 태스크에서는 재측정이 필요하다.
> 상세: `docs/reports/tournament-ab-2026-08-23.md`

### 5-2. 구조

Workflow 스크립트에는 셸·파일시스템 접근이 없다. 외부 CLI에 닿는 유일한 경로는
`agent()`가 스폰하는 서브에이전트의 Bash다 → **참가자마다 얇은 shim 에이전트**를 둔다.

```
Workflow 스크립트
  └─ agent("run-cli.sh로 <provider> 실행하고 JOB_DIR 반환", {model: 'sonnet'})   ← shim
       └─ Bash: run-cli.sh start --provider <p> --prompt-file ...
```

shim에는 **판단을 주지 않는다.** 명령 실행과 경로 반환만 시키며 기본 모델은 Sonnet이다.
사용자가 전체 또는 해당 단계 모델을 지정했다면 그 선택을 따른다.

### 5-3. 골격

```javascript
const ARENA = `${KKIRIKKIRI_DIR}/arena/${TASK.name}`
// diffSize 측정 범위 — 워커가 손대야 하는 소스 경로만. 로그·잡 산출물이 섞이지 않게 한다.
const SOURCE_PATHS = ['src', 'lib', 'app']   // 프로젝트에 맞게 조정
const CONTENDERS = [
  { provider: 'codex', worktree: `${ARENA}/codex` },
  { provider: 'grok',  worktree: `${ARENA}/grok`  },
]

// ── 가드: 게이트 없으면 토너먼트 금지 ──
if (!TASK.gates || TASK.gates.length === 0) {
  throw new Error('tournament: gates가 비어 있습니다 — 채점 근거가 없어 실행할 수 없습니다')
}

phase('대진')
// 참가자별로 워크트리를 파고 CLI를 돌린 뒤, 게이트를 실행해 점수를 회수한다.
const scored = (await parallel(CONTENDERS.map(c => () =>
  agent(
    [
      `1) git worktree add "${c.worktree}" 로 격리 작업트리를 만든다.`,
      `2) 아래 지시를 프롬프트 파일로 쓰고 run-cli.sh start --provider ${c.provider} 로 실행한다.`,
      `   지시: ${TASK.instruction}`,
      `   (워커는 ${c.worktree} 안에서만 소스를 쓴다)`,
      `   ⚠️ --jobs-dir 는 반드시 **워크트리 바깥**을 준다: --jobs-dir "${ARENA}/.jobs/${c.provider}"`,
      `      워크트리 안에 두면 job.json·output.txt·error.txt가 diff에 섞여 diffSize를 오염시킨다.`,
      `3) run-cli.sh wait 로 완료를 기다린다.`,
      `4) ${c.worktree} 에서 아래 게이트를 각각 실행하고 통과 수를 센다:`,
      ...TASK.gates.map(g => `   - ${g.name}: ${g.command}`),
      `5) 변경량을 잰다 — **반드시 아래 2단계, 그리고 소스 경로로 범위를 좁혀서**:`,
      `   git -C "${c.worktree}" add -A -N     # untracked 새 파일을 인덱스에 등록`,
      `   git -C "${c.worktree}" diff --shortstat HEAD -- ${SOURCE_PATHS.join(' ')}`,
      `   insertion 수를 diffSize로 쓴다.`,
      `   (a) add -A -N 없이 --shortstat만 쓰면 새로 만든 파일이 0으로 잡힌다.`,
      `   (b) 경로를 안 좁히면 로그·잡 산출물이 섞인다 — 실측 2026-08-23: codex의 stderr 779줄이`,
      `       실제 코드 46줄을 덮어 diffSize가 858로 잡혔고, 타이브레이커가 코드가 아니라`,
      `       **로그 잡음으로 승자를 갈랐다**.`,
      `결과를 스키마대로 반환한다. 판단하지 말고 실행 결과만 담는다.`,
    ].join('\n'),
    { model: 'sonnet', phase: '대진', label: `arena:${c.provider}`, schema: SCORE_SCHEMA }
  ).then(r => r && ({ ...r, provider: c.provider, worktree: c.worktree }))
))).filter(Boolean)

phase('채점')
// 결정론 — 모델 판단 없음. 게이트 수 → diff 크기 순.
const alive = scored.filter(s => s.gatesPassed > 0)   // 전패는 탈락
if (alive.length === 0) throw new Error('tournament: 전 참가자 게이트 전패 — 채택할 승자가 없습니다')
alive.sort((a, b) =>
  (b.gatesPassed - a.gatesPassed) || (a.diffSize - b.diffSize))
const winner = alive[0]

phase('채택')
return { winner: winner.provider, scorecard: alive, adopt: 'winner' }
```

### 5-4. 순위 규칙 (결정론)

1. `gatesPassed` 내림차순
2. 동점이면 `diffSize` 오름차순 — 같은 게이트를 통과했다면 **더 적게 건드린 쪽이 이긴다**
   - ⚠️ **측정 실수 2건이 실기에서 확인됐다. 둘 다 타이브레이커를 무력화한다.**

   | 실수 | 증상 | 교정 |
   |---|---|---|
   | `add -A -N` 누락 | 신규 파일이 0으로 잡혀 **항상 동점** | 측정 전에 `git add -A -N` |
   | 경로 미지정 | 로그·잡 산출물이 섞여 **코드가 아니라 잡음으로 승자가 갈림** | `-- src lib app` 처럼 소스 경로로 좁힌다 |

   실측(2026-08-23) — 같은 과제(LRU 캐시, 13 케이스)에서:
   - 경로 미지정: codex **858** / grok **67** → codex의 stderr 779줄이 만든 가짜 격차
   - 소스만: codex **46** / grok **39** → 실제 코드 격차는 7줄
   두 경우 다 grok이 이겼지만 **이유가 완전히 달랐다.** stderr 양이 반대였다면 순위가 뒤집혔을 것이다.
3. 그래도 동점이면 모델 타이브레이커 **1회** (여기서만 판단이 개입한다)
4. `gatesPassed === 0`은 승자에서도 병합 후보에서도 **탈락**

### 5-5. SCORE_SCHEMA

```javascript
const SCORE_SCHEMA = {
  type: 'object',
  properties: {
    exitCode:    { type: 'integer' },
    gatesPassed: { type: 'integer' },
    gatesTotal:  { type: 'integer' },
    diffSize:    { type: 'integer', description: 'git add -A -N 후 git diff --shortstat HEAD 의 insertion 수' },
    note:        { type: 'string' },
  },
  required: ['exitCode', 'gatesPassed', 'gatesTotal', 'diffSize'],
}
```

### 5-6. 채택 — 기본은 승자 채택

`adopt: 'winner'`가 기본이다. 승자 워크트리를 본진에 머지하면 끝 — 결정적이고 되돌리기 쉽다.

`adopt: 'merge'`(패자 장점 이식)는 **옵트인**이며, 다음을 전부 지켜야 한다:

- 승자 코드가 **베이스로 확정**된다. 패자 워크트리를 통째로 덮지 않는다.
- 이식 단위는 델타. **파일 통째 교체 금지.**
- **이식 1건마다 게이트 재실행.** 이식 전보다 나빠지면 되돌린다.
- 모델에게는 참가자 간 **diff**를 준다. 전체 파일 두 벌을 읽히지 않는다.

> ⚠️ 병합은 잘못하면 양쪽 최악을 섞은 결과가 나온다. 이식별 게이트 재실행이
> 안전장치가 아니라 **기능의 본체**다.

### 5-7. 산출물

```
{KKIRIKKIRI_DIR}/arena/{task}/
  codex/            # 참가자 워크트리
  grok/
  scorecard.json    # 참가자별 점수 + 순위 + 승자
  adoption.json     # 채택 모드 + 승자 + (merge일 때) 이식 목록
```

---

## 형태 선택 가이드

| 신호 | shape |
|---|---|
| 항목들이 서로 독립 / "전부·모든·N개" | `parallel` |
| 뒤 항목이 앞 산출물을 입력으로 씀 | `serial` |
| 다음 단계가 앞 단계 **전체**를 봐야 함 (dedup·조기종료·상호비교) | `chain` |
| 여러 조사가 하나의 결론을 떠받침 | `fanout` |
| 게이트 명확 + 어렵고 중요한 **단일** 코딩 태스크 | `tournament` |
| 애매하면 | `parallel` (기본값) |

**직렬·체인을 과용하지 않는다.** 배리어와 순차는 병렬 이득을 깎아먹는다.
"개념적으로 단계가 나뉜다"는 근거가 아니고, **실제 데이터 의존**이 있을 때만 쓴다.
