# 끼리끼리 버전 관리

> GPTaku Plugins 버전 관리 표준을 따릅니다.

## Semantic Versioning (SemVer)

`MAJOR.MINOR.PATCH` 형식을 따릅니다.

| 구분 | 올릴 때 | 예시 |
|------|---------|------|
| **MAJOR** | 호환성 깨지는 변경 | 프리셋 구조 변경, 커맨드 삭제, 공유 메모리 포맷 변경 |
| **MINOR** | 새 기능 추가 (하위 호환) | 새 프리셋, 새 팀 운영 기능, 검증 루프 개선 |
| **PATCH** | 버그 수정, 문서 수정 | 오타 수정, README 업데이트, 프롬프트 개선 |

## 변경 기준

### MAJOR (x.0.0)

- 프리셋 정의 구조가 바뀌어 기존 동작이 달라질 때
- `/kkirikkiri` 커맨드 인터페이스가 바뀔 때
- 공유 메모리 파일 포맷이 바뀔 때 (TEAM_PLAN, TEAM_PROGRESS, TEAM_FINDINGS)
- 필수 의존성이 추가/변경될 때

### MINOR (0.x.0)

- 새 프리셋 추가 (기존 유지)
- 팀 운영 기능 추가 (검증 루프, 부분 교체 등)
- 인터뷰 질문 개선
- 환경 스캔 항목 추가
- 외부 CLI 지원 추가

### PATCH (0.0.x)

- 프롬프트 문구 개선
- 문서/README 수정
- 에러 메시지 개선
- 코드 스타일 수정

## CHANGELOG 규칙

- 최신 버전이 맨 위
- 날짜는 `YYYY-MM-DD` 형식
- 한국어로 작성
- Added / Changed / Fixed / Removed 카테고리 사용
