# 공유 메모리 초기화 가이드

> **Step 6-2에서 반드시 참조한다.**
> 공유 메모리 파일 생성 전 이 파일을 끝까지 읽고 절차대로 실행한다.

---

## 기존 파일 처리 + 아카이빙

팀 생성 직후, 이전 세션의 `.kkirikkiri/` 파일이 남아있을 수 있다.
FINDINGS는 가치 있는 지식이므로 선택적으로 보존한다.

```
1. Bash("ls {프로젝트루트}/.kkirikkiri/ 2>/dev/null") 로 기존 파일 존재 확인

2. 기존 TEAM_FINDINGS.md가 존재하면:
   a. Read(TEAM_FINDINGS.md, limit=10) 로 내용 확인
   b. 템플릿 이상의 실제 내용이 있으면 → AskUserQuestion으로 사용자에게 확인:

      EXECUTE: AskUserQuestion 호출
      {
        "questions": [
          {
            "question": "이전 작업 기록이 있어요. 어떻게 할까요?",
            "header": "이전 기록",
            "options": [
              {"label": "보관하고 새로 시작 (추천)", "description": "이전 발견 사항을 보관해두고 새 작업을 시작해요. 필요하면 나중에 참고할 수 있어요."},
              {"label": "그냥 새로 시작", "description": "이전 기록을 지우고 깨끗하게 시작해요."},
              {"label": "이전 기록 이어서", "description": "이전 발견 사항을 유지한 채 새 팀이 이어받아요."}
            ],
            "multiSelect": false
          }
        ]
      }

   c. 사용자 선택에 따라:
      - "보관하고 새로 시작":
        Bash("mkdir -p {프로젝트루트}/.kkirikkiri/archive")
        Bash("cp {프로젝트루트}/.kkirikkiri/TEAM_FINDINGS.md {프로젝트루트}/.kkirikkiri/archive/FINDINGS-{이전날짜}.md")
        → TEAM 3종 파일 모두 새 내용으로 Write
      - "그냥 새로 시작":
        → Read(limit=5) 후 Write 덮어쓰기
      - "이전 기록 이어서":
        → TEAM_PLAN.md, TEAM_PROGRESS.md만 덮어쓰기
        → TEAM_FINDINGS.md는 유지 (Edit으로 새 섹션만 추가)

   d. 내용이 템플릿뿐이면 → 아카이빙 없이 바로 덮어쓰기

3. 기존 파일이 없으면 → 바로 Write로 생성
```

### 아카이빙 규칙

- 보존 대상: TEAM_FINDINGS.md만 (DEAD_ENDS 포함)
- TEAM_PLAN.md, TEAM_PROGRESS.md는 보존 가치 없음 (매번 새로 작성)
- results/, prompts/, saved-teams/는 이미 보존됨 (덮어쓰기 대상 아님)
- archive/ 디렉토리의 파일은 팀원이 자동으로 읽지 않음 (팀장이 명시적으로 지시할 때만)
- FINDINGS가 10KB 초과 시: 아카이빙 대신 요약본 생성을 고려 (토큰 절약)

### "이전 기록 이어서" 선택 시 추가 처리

새 TEAM_FINDINGS.md 상단에 구분선을 추가:

```
Edit(TEAM_FINDINGS.md):
  old_string: "# 발견 사항 & 공유 자료"
  new_string: "# 발견 사항 & 공유 자료\n\n---\n\n## [현재 날짜] — 새 세션 시작\n\n(이하 이전 세션 기록 유지)"
```

---

## 생성 대상 파일 경로

```
{프로젝트루트}/.kkirikkiri/TEAM_PLAN.md
{프로젝트루트}/.kkirikkiri/TEAM_PROGRESS.md
{프로젝트루트}/.kkirikkiri/TEAM_FINDINGS.md
```

---

## 파일 템플릿

### TEAM_PLAN.md (팀장이 관리)

```markdown
# 팀 작업 계획

- 팀명: [team_name]
- 목표: [인터뷰에서 파악한 목표]
- 생성 시각: [timestamp]

## 팀 구성
| 이름 | 역할 | 모델 | 담당 업무 |
|------|------|------|----------|
| [leader] | 팀장 | Opus | 계획/배분/검증/통합 |
| [member-1] | [역할] | [모델] | [업무] |

## 태스크 목록
- [ ] 태스크 1: [설명] → [담당자]
- [ ] 태스크 2: [설명] → [담당자]

## 주요 결정사항
(팀장이 결정할 때마다 여기에 기록)
```

### TEAM_PROGRESS.md (모든 팀원이 기록)

```markdown
# 진행 상황

## [timestamp] — [팀원명]
- 상태: 진행 중 / 완료 / 차단됨
- 작업: [수행한 작업]
- 결과: [핵심 발견/산출물]
- 다음: [다음 할 일]
```

### TEAM_FINDINGS.md (모든 팀원이 기록)

```markdown
# 발견 사항 & 공유 자료

## [timestamp] — [팀원명]: [제목]
[발견한 내용, URL, 코드 스니펫 등]

---

# DEAD_ENDS (시도했으나 실패한 접근)

## [timestamp] — [팀원명]: [시도한 접근]
- 시도: [무엇을 했는지]
- 결과: [왜 실패/부적합했는지]
- 근거: [파일경로, 에러 메시지, 테스트 결과 등]
```

> **DEAD_ENDS가 중요한 이유**: 팀을 재구성할 때 새 팀이 같은 막다른 골목을 다시 탐색하는 것을 방지한다.
> 긍정적 발견만 기록하면 공유 메모리의 효과가 60-70%에 그치지만,
> 실패한 접근까지 기록하면 75-80%까지 컨텍스트를 복구할 수 있다.

---

## 공유 메모리 규칙

| 규칙 | 설명 |
|------|------|
| **팀장은 TEAM_PLAN.md를 유지** | 결정이 나올 때마다 즉시 기록 |
| **모든 팀원은 PROGRESS에 기록** | 작업 시작/완료/차단 시 반드시 업데이트 |
| **팀원은 FINDINGS에 공유** | 다른 팀원에게 유용한 발견은 파일로 공유 |
| **실패한 접근은 DEAD_ENDS에 기록** | "시도 → 실패 이유 → 근거"를 남겨서 다음 라운드/새 팀이 같은 실수 방지 |
| **기억이 의심되면 파일을 읽어** | 컨텍스트가 길어졌다 싶으면 공유 파일 재확인 |
| **팀장은 통합 전 3개 파일 전부 읽어** | 최종 결과물 만들기 전 전체 맥락 복구 |
| **새 팀원은 합류 시 3개 파일 + DEAD_ENDS 먼저 읽어** | 이전 컨텍스트 복구 후 작업 시작 |
