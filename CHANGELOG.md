# Changelog

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
