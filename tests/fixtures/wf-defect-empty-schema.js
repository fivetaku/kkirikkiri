export const meta = { name: 'x', description: 'y', phases: [{ title: 'a' }] }
const items = [{ key: 'a' }, { key: 'b' }]
phase('a')
const out = (await parallel(items.map(i => () =>
  agent('조사 ' + i.key + ' refute 포함, search_count 반환', { model: 'sonnet', schema: {}, phase: 'a' })
))).filter(Boolean)
