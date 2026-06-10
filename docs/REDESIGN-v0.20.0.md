# kkirikkiri 재설계 — v0.20.0 "Substrate-Aware Orchestration"

> 상태: **구현 준비 완료** (자체 검토 반영, 설계결정 D1~D3 확정)
> 작성: 2026-06-10
> 대상 버전: v0.18.2(핫픽스) → v0.20.0(메이저)
> 한 줄 요약: **"무조건 팀 만들기"에서 → "팀 만들기 전에 사용자가 [작전 통제실 / 공정 라인]을 직접 고르고, 고른 방식만 구성·실행"으로.**

---

## 1. 배경 — 현재 아키텍처의 문제

현재 kkirikkiri(v0.18.1) 8-step: ①의도/프리셋 ②환경스캔 ③인터뷰 ④동적 팀구성 ⑤제안+확인 ⑥팀생성+실행 ⑦검증루프 ⑧결과수집.

| # | 문제 |
|---|------|
| P1 | **100% Agent Teams 기반** (TeamCreate/SendMessage). Workflow 도구 경로 없음. |
| P2 | "팬아웃 vs 능동" 실행모드 선택이 **Step 6-0**(구성·제안·확인이 끝난 뒤)에 박혀 altitude가 틀림. substrate마다 구성 산출물이 다르므로(Teams=페르소나+task list, Workflows=script 스테이지) 분기는 **팀원 구성(Step4) 전**에 와야 한다. |
| P3 | 6-0이 *"Step 5.5 라우터 결과 활용"*이라 적혀 있으나 **Step 5.5는 스펙에 없음**(유령 참조 버그). |
| P4 | SKILL.md(6-0 "모드 선택") vs `coordination-protocols.md`("적응형 실행 항상 기본, 모드 선택 없음")가 **모순**(프레이밍 충돌). |
| P5 | check-env.js가 `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`를 **required로 검사 → 없으면 설치 실패**. experimental·기본꺼짐 기능에 하드의존. |

---

## 2. 공식 문서 근거 (code.claude.com)

오케스트레이션 **4지선다**, 기준은 "누가 plan을 쥐느냐":

| | Subagents | Skills | **Agent Teams** | **Workflows** |
|---|---|---|---|---|
| 정체 | Claude가 띄우는 워커 | Claude가 따르는 지시 | peer 세션 감독하는 lead | 런타임이 실행하는 스크립트 |
| 다음 수 결정 | Claude, 턴마다 | Claude, 프롬프트 따라 | lead, 턴마다 | 스크립트가 |
| 중간 결과 | Claude 컨텍스트 | Claude 컨텍스트 | 공유 task list | 스크립트 변수 |
| 규모 | 턴당 소수 | 동일 | 소수 장기 peer | **수십~수백/런** |
| 중단 시 | 턴 재시작 | 턴 재시작 | 팀원 계속 | 세션 내 resume |

핵심 사실:
- **Agent Teams**: *"experimental and disabled by default"* — `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`, v2.1.32+. 토큰 무거움. 용도=수렴·관점충돌·경쟁가설 디버깅. *"Claude won't create a team without your approval."*
- **Workflows**: v2.1.154+, 유료플랜. opt-in 필요 — **단 "호출된 skill의 지시가 Workflow를 부르면 그것도 유효한 opt-in"**. 용도=코드베이스 감사·대규모 마이그레이션·교차검증 리서치.
- **Workflows 모델 라우팅**: *"Every agent in a workflow uses your session's model **unless the script routes a stage to a different one.**"* → 스테이지별 `agent(prompt, {model})` 가능. 기본=세션 모델.
- **매핑**: 팬아웃(독립·결정론·대량)=Workflows / 능동(수렴·적응)=Agent Teams.
- **Subagents = 두 substrate 공통의 하부 빌딩블록** (Teams 팀원도, Workflows agent()도 내부적으로 subagent). 사용자에게 보여줄 최상위 선택지가 아님.

---

## 3. 목표 아키텍처

```
Step 1   의도/프리셋 매칭
Step 2   환경 스캔  ── 강화: Teams 플래그 + Claude Code 버전 인벤토리
Step 3   인터뷰 (AskUserQuestion)
Step 3.5 ⭐ 실행 방식 선택 (AskUserQuestion — 자동 호출 금지)  ◀ NEW, 구성 전
Step 4   동적 구성 ── 선택된 substrate별 다형(polymorphic)
Step 5   제안 + 확인 (실행 방식 + 구성 함께)
Step 6   실행 (TeamCreate  /  Workflow 실행)   ── 6-0 모드선택 삭제
Step 7   검증 루프 ── 결과중심 통일(substrate 무관)
Step 8   결과 수집
```

---

## 4. Step 3.5 — 실행 방식 선택 (NEW)

**원칙: 모델이 임의로 substrate를 호출하지 않는다. 사용자가 AskUserQuestion으로 직접 고른다.**

```
① Step 2 가용성으로 선택지 동적 구성
     - 작전 통제실(Agent Teams): EXPERIMENTAL_AGENT_TEAMS=1 일 때만
     - 공정 라인(Workflows):      Claude Code v2.1.154+ 일 때만
② 작업 형태로 "(추천)" 1개 표시 — 결정은 사용자
③ AskUserQuestion 호출 → 사용자가 선택
④ 선택된 substrate만 Step 4 구성으로 진행
⑤ Workflow는 사용자가 "공정 라인" 골랐을 때만 호출 (skill 지시 = opt-in)
```

**AskUserQuestion (메타포 유지, 2지선다):**

| 옵션(유저 표시) | 내부 | 언제 추천 |
|---|---|---|
| **작전 통제실 (실시간 협업)** | Agent Teams | 수렴·관점충돌·설계결정·적대적 리뷰 |
| **공정 라인 (대량 자동 처리)** | Workflows | 독립·결정론·대량(감사·마이그레이션·교차검증 리서치) |

**가용성 경우의 수:**

| Teams 플래그 | Workflows | Step 3.5 동작 |
|:---:|:---:|---|
| ON | 가용 | AskUserQuestion 2지선다 (정상) |
| ON | 불가 | 질문 생략 → 작전 통제실 직행 |
| OFF | 가용 | 질문 생략 → 공정 라인 직행 |
| OFF | 불가 | 실행 불가 → check-env가 "둘 중 하나 켜라" 안내 |

> ⚠️ **구현 함정**: command frontmatter의 `allowed-tools`에 `AskUserQuestion`을 **넣지 말 것**. 넣으면 auto-approve 처리되어 UI를 안 띄우고 빈 답변으로 통과됨(기존 검증된 버그). Step 3(인터뷰)과 동일 규칙.

### 추천 휴리스틱 — "(추천)" 결정 (S4)

작업 신호 + Step 1 프리셋으로 추천 substrate를 정한다 (**결정은 여전히 사용자**):

| 신호 | 추천 |
|---|---|
| 수렴·관점충돌·설계결정·적대적 리뷰·트레이드오프 / "결정해줘"·"검토·비평" / 프리셋 **product·analysis** | **작전 통제실** |
| 독립·대량·결정론 / "전부·모든·N개" / 감사·마이그레이션·다수 소스 교차검증 / 프리셋 **research**·대규모 **development** | **공정 라인** |
| 애매하면 | **작전 통제실**(소규모 안전). 단 명백히 대량이면 공정 라인 |

---

## 5. check-env 단순화

플랜 티어 검사 제거(Claude Code = 유료 전제). check-env가 보는 것:

| 항목 | 방법 | 의미 |
|---|---|---|
| Claude Code 버전 ≥ 2.1.154 | `claude --version` | Teams(≥2.1.32)·Workflows(≥2.1.154) 둘 다 충족 |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` | settings.json | Teams 켜짐(기본 off라 유일 실변수) |

- 하드 require 완화: `EXPERIMENTAL_AGENT_TEAMS` 단독 required → **"Teams 플래그 OR Workflows 가용 중 최소 1개"** required. 둘 다 없을 때만 fail.
- Workflows `/config` 토글은 외부 스크립트로 깔끔히 감지 안 됨 → **버전 맞으면 켜진 것으로 간주**, 꺼져 있으면 "공정 라인" 선택 시 실행 시점 승인 프롬프트에서 드러나게 둠(과검사 금지).

---

## 6. Step 4 — 다형 구성 (substrate별 분기)

| substrate | 구성 산출물 |
|---|---|
| **작전 통제실(Teams)** | 페르소나 + 역할 R&R + 도메인카드 + 공유 task list + 팀장 (현행 구조 유지) |
| **공정 라인(Workflows)** | `.claude/workflows/` 스테이지 스크립트 (`agent()`/`pipeline`/`parallel`) |

- `coordination-protocols.md`의 **적응형 척추(drive→inspect→re-inject)는 작전 통제실(Teams) 경로에서만, 그리고 항상 on** → 6-0 모드선택 삭제로 프레이밍 충돌(P4) 해소.
- 유령 Step 5.5 참조(P3) 제거.
- **작전 통제실(Teams) 경로 = 기존 6-1~6-6 재사용.** 단 6-1~6-6의 **팬아웃-전용 문구(blind 병렬·1회 종료 등) 제거** — Teams는 이제 항상 능동(적응형 척추)이다 (S7).

---

## 6.1 공정 라인(Workflows) 실행 경로 상세 (NEW)

Teams는 6-1~6-6 재사용. **공정 라인은 완전히 다른 흐름**이라 별도로 정의한다:

| 단계 | 동작 |
|---|---|
| **4-W 스크립트 구성** | 오케스트레이터(스킬 실행 중인 Claude)가 **인라인으로 `meta` + body 작성**. `pipeline()`/`parallel()` 스테이지, 각 `agent()`에 `{model}` 명시(팬아웃=`sonnet`, 종합/판단=`opus`, 기계적=`haiku`). **adversarial-verify 스테이지를 스크립트에 포함**(D1). **공유메모리(6-2)·KKIRIKKIRI_DIR 생성 안 함** — 중간결과는 스크립트 변수에 보관 |
| **5-W 확인** | kkirikkiri 자체 확인 **생략/경량**(1줄). **Workflow 도구의 승인 카드(phase 목록 + 토큰 경고)가 최종 확인 역할**(D3) — 이중 승인 방지 |
| **6-W 실행** | `Workflow()` 도구 호출(**호출된 skill 지시 = 유효 opt-in**). 백그라운드 실행, `/workflows`로 진행 관찰 |
| **7-W 검증** | **별도 Ralph 루프 없음.** 검증 = 스크립트 내부 **adversarial-verify 스테이지**(D1). cross-model이 필요하면 워크플로우 반환 후 오케스트레이터가 **Codex 1회 검토**(D2) |
| **8-W 결과** | 워크플로우 반환값을 사용자에게 리포트. 재실행/저장은 Workflow 자체 기능(`/workflows` → `s`)으로 |

> 핵심 차이: Teams = 영속 팀 + 공유메모리 + Ralph 루프 / Workflows = 결정론 스크립트 + 스크립트 변수 + 내부 검증 스테이지. **둘은 Step 4부터 완전히 분기**한다.

---

## 7. 모델 배정 규칙 (재정의)

### 철학: 가격격차를 작업격차에 맞추고, **build와 review는 다른 family**

세 원칙으로 운영한다 (Agent Council + 독립 Claude 검증 반영):
1. **가격 사다리에 맞춰 배정.** `Haiku $1/$5 ──3배── Sonnet $3/$15 ──1.67배── Opus $5/$25`. 큰 격차(Haiku↔Sonnet)는 작업 난이도로 가르고, **작은 격차(Sonnet↔Opus)는 품질이 중요하면 그냥 Opus**(프리미엄 1.67배뿐).
2. **build와 review는 항상 다른 base 모델 family.** 같은 Claude끼리 검토는 같은 맹점 공유(rubber-stamp) → cross-model이 탈상관 오류를 잡는다.
3. **cross-model(Codex/agy)은 생산에도 가치.** 다른 모델의 다른 접근법 → 비교·학습. 검토 전용으로 가두지 않는다.

| 모델 | 쓰임 |
|---|---|
| **Opus** (천장) | 팀장/코디네이션, 핵심·고난도·품질민감 생산, 깊은 분석, 최종 종합/판단 |
| **Sonnet** (워커 floor·적극 활용) | 빌더/워커 — 리서치 수집·쿼리·드래프트·간단 구현·표준 작업. **Teams·Workflows 공통 워커** |
| **Haiku** (기계적 글루 한정·부활) | 판단 0인 일만 — 파일 수집·포맷·추출·진행요약·더미데이터. **판단 필요한 순간 금지** |
| **Codex / agy** (cross-model) | 다른 접근법 직접 생산 **+** 검토/비평. **Codex=코드·대규모 분석**, **agy=디자인/UI(Gemini 대체본)** |
| **Fable** | **제외** (6/22 무료 종료 → API 종량 전용, 분산 플러그인 부적합) |

### substrate별 모델 배정

- **작전 통제실(Teams, 보통 소규모):** **Opus 팀장 + Sonnet 워커** 조합 기본. (소규모라 Sonnet↔Opus 비용차 미미 → 워커 floor를 Sonnet으로.) 기계적 잡일 있으면 Haiku.
  - 예: `Opus 팀장 + Sonnet 리서처·구현가 N (+ Haiku 글루 필요시) + cross-model 검토`
- **공정 라인(Workflows, 대량 팬아웃):** **Sonnet 팬아웃 본체 + Opus 종합/판단.** (수십 에이전트라 40%×N 절약 실현.) 기계적 서브스테이지 Haiku. `agent(prompt, {model})`로 스테이지별 명시.

> Sonnet은 두 substrate 공통 워커 floor — 작은 팀에선 단순함, 큰 팬아웃에선 물량 절약. 모델 상속 방지: **팀장/핵심 Opus, 워커 Sonnet 명시 핀**(세션·리드 모델 상속에 맡기지 않음).

### 검토/비평 — build와 다른 family (substrate별 트리거 + 가용성 폴백)

**원칙:** 생성한 모델과 다른 family가 검토. **트리거 방식은 substrate마다 다르다 (B2):**
- **작전 통제실(Teams):** 팀장(Opus)이 `run-cli.sh`로 검토자 호출 → **leader 프롬프트에 명시**. CLI 없으면 별도 **Opus 적대 teammate** 스폰.
- **공정 라인(Workflows):** `agent()`는 Claude만 스폰 → 스크립트 내부 검토는 **Claude adversarial-verify 스테이지**(독립 컨텍스트 + refute 프롬프트). cross-model 원하면 워크플로우 **종료 후** 오케스트레이터가 Codex 1회(D2).

**검토자 우선순위(가용성 폴백):** `Codex → agy → Claude/Opus 적대 인스턴스`.

> ⚠️ **정직한 현실(S6):** Codex/agy 미설치가 흔하므로 **실제 기본 검토 경로는 "Claude/Opus 적대 인스턴스"**다(cross-model은 설치 시 업그레이드). 같은 family여도 **독립 컨텍스트 + "결함을 찾아라"(refute) 프롬프트**로 운영해 rubber-stamp를 막는 게 핵심. "검토해줘"가 아니라 "틀린 곳을 찾아라".

### 외부 CLI 역할 (Codex / agy)

| CLI | 생산 | 검토 | 비고 |
|---|---|---|---|
| **Codex** (gpt-5.x) | 코드 + **대규모 분석** 직접 생산(다른 접근법) | **코드·대규모 검토·계획 검증 (1순위 검토자)** | 다른 base 모델. 헤비급은 Codex |
| **Antigravity (`agy`)** | **디자인/UI** 생산 | 디자인 정합성 검토 | **Gemini 대체본** (Gemini CLI 후계). agy로 단일화 |

- **Gemini는 완전 제거** — agy를 Gemini 대체본으로 취급(2026-06-18 전환). 폴백으로도 두지 않음.
- ⚠️ agy 1.0.x 비-TTY stdout 빈 출력 버그 → results 비면 Claude(Opus) 폴백.

### 사용자 오버라이드
기본은 위 룰 자동. 단 사용자가 *"가장 똑똑하게"* / *"빠르고 싸게"* 명시 시 전체 티어를 한 단 조정.

### 메타포 (기술용어 은닉)
Opus="가장 똑똑한 AI" / Sonnet="전문 AI·균형잡힌 AI" / Haiku="빠른 일꾼 AI"(기계적 잡일) / Codex="코드·대규모 분석 AI" / agy="디자인 전문 AI". (Gemini·Fable·모델명·TeamCreate 등 노출 금지.)

---

## 8. 마이그레이션

### v0.18.2 — 핫픽스 (저위험, 선행)
1. 유령 "Step 5.5 라우터" 참조 제거 (P3)
2. SKILL 6-0 ↔ coordination-protocols 프레이밍 모순 정정 (P4)
3. check-env: 플랜 검사 없음 + `EXPERIMENTAL_AGENT_TEAMS` hard-fail → "둘 중 1개" 완화 (P5)
4. 외부 CLI: **Gemini 제거 → agy(디자인) 단일화**, Codex=코드·대규모 분석 명시

### v0.20.0 — 메이저 (구조 개편)
5. Step 3.5 실행 방식 AskUserQuestion 2지선다 + **추천 휴리스틱(§4.1)** 신설
6. Step 4 substrate별 다형 구성 분리 + **공정 라인 실행 경로(§6.1: 인라인 스크립트 생성→`Workflow()` 호출→내부 adversarial-verify)**
7. Step 6-0 삭제, 6-1~6-6 팬아웃 문구 제거, 적응형 척추를 Teams 전용·always-on으로
8. 모델 배정 규칙 교체: Sonnet 워커 floor / Haiku 기계적 글루 부활 / **검토는 substrate별(Teams=팀장이 Codex 호출 / Workflows=스크립트 내부 verify) + 폴백 Codex→agy→Claude 적대 인스턴스** / Codex·agy 생산+검토 겸용 / Fable 제외
9. Step 2 가용성 인벤토리 + 검증: **Teams=Ralph 루프 / Workflows=스크립트 내부 adversarial-verify**(D1)

---

## 9. 파일별 변경 목록

| 파일 | 변경 |
|---|---|
| `skills/kkirikkiri/SKILL.md` | Step 3.5 신설(+추천 휴리스틱) / Step 4 다형 분기 / **§6.1 공정 라인 실행 경로 추가** / Step 6-0 삭제 + **6-1~6-6 팬아웃 문구 제거** / 유령 5.5 제거 / L395 모델 배정 규칙 교체 / 외부 CLI 역할 정리. **`allowed-tools`에 AskUserQuestion 금지.** |
| `skills/kkirikkiri/references/coordination-protocols.md` | "적응형 척추 = 작전 통제실(Teams) 경로 전용·always-on" 명시, 모드선택 문구 제거 |
| `skills/kkirikkiri/references/metaphor-guide.md` | 작전 통제실/공정 라인 메타포 추가, **Gemini 항목 제거 → agy(디자인) 단일화**, Codex=코드·대규모 |
| `scripts/check-env.js` / `check-env.sh` | 플랜 검사 없음, 버전+Teams플래그 확인, "둘 중 1개" require로 완화, **Gemini 감지·안내 제거 → agy로 단일화** (run-cli.sh `--provider gemini`도 정리) |
| `references/subagent-synthesis.md` / `team-prompts.md` | substrate별 구성 가이드 분기, 모델 배정 룰 동기화 |
| `commands/kkirikkiri.md` | Step 3.5 흐름 반영 |
| `.claude-plugin/plugin.json` | v0.18.2 → v0.20.0 단계 버전업 |

---

## 10. 미결/추후
- **팀 저장(8-3)**: Teams는 agents 저장, Workflows는 `/workflows`→`s` 자체 저장 — 두 저장 UX를 사용자에게 일관되게 묶는 방식 미정.
- **공정 라인 결과 리포트 포맷**: Workflow 반환값을 kkirikkiri 8-2(유저 전달 + Auto-memory 유도) 형식에 맞추는 상세.
- **Fable**: 영구 구독 2× 티어가 생기면 "능동 경로·팀당 1슬롯·최종 심판 한정" 룰로 재도입 검토(현재 보류).
- (해결됨) Workflows 실행/검증/cross-model 트리거 → §6.1 + §7 반영 완료.
