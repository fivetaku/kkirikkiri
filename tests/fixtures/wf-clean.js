export const meta = {
  name: 'clean-example',
  description: '통과용 fixture — 4단 게이트 규칙 준수 예시',
  phases: [{ title: '수집' }, { title: '검증' }, { title: '종합' }],
}

const FINDING_SCHEMA = {
  type: 'object',
  required: ['topic', 'findings', 'search_count'],
  properties: {
    topic: { type: 'string' },
    findings: { type: 'array', items: { type: 'string' } },
    search_count: { type: 'integer' },
  },
}
const VERDICT_SCHEMA = {
  type: 'object',
  required: ['refuted', 'reason', 'search_count'],
  properties: {
    refuted: { type: 'boolean' },
    reason: { type: 'string' },
    search_count: { type: 'integer' },
  },
}

const SOURCES = [
  { key: 'a', prompt: '소스 A 조사 (검색 예산 6회)' },
  { key: 'b', prompt: '소스 B 조사 (검색 예산 6회)' },
  { key: 'c', prompt: '소스 C 조사 (검색 예산 6회)' },
]

phase('수집')
const found = (await parallel(SOURCES.map(s => () =>
  agent(s.prompt, { model: 'sonnet', phase: '수집', label: `collect:${s.key}`, schema: FINDING_SCHEMA })
))).filter(Boolean)

phase('검증')
// fan-in 재분배: 축별 라운드로빈(round-robin)으로 검증 대상 선정 — 특정 축 독점 방지
const verified = (await parallel(found.map(f => () =>
  agent(`다음 발견을 반박하라(refute). 확신 없으면 refuted=true: ${JSON.stringify(f)}`,
    { model: 'sonnet', phase: '검증', schema: VERDICT_SCHEMA })
))).filter(Boolean)

phase('종합')
return await agent(`검증 통과 결과만 종합 리포트로 정리: ${JSON.stringify(verified)}`,
  { model: 'opus', phase: '종합' })
