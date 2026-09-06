#!/usr/bin/env node
// card-lint.js — 팀원 카드 경계 블록 검사 (spawn 전 게이트, v0.23.1)
// 사용: node card-lint.js <카드.md ...>  또는  node card-lint.js --dir <agents 디렉토리>
// 출력: {pass, cards:[{file, violations:[{rule,msg}]}], cross_violations:[...], summary} JSON
// 근거: Phase 2 판정(2026-08-31) — 경계 블록이 프롬프트층에만 있어 발화 0회 → 코드 게이트로 강등
'use strict';
const fs = require('fs');
const path = require('path');

const WRITER_ARCHETYPES = new Set(['Builder', 'Writer', 'Designer', 'Analyst']);
const WRITE_TOOLS = ['Write', 'Edit', 'NotebookEdit', 'MultiEdit'];

function collectFiles() {
  const argv = process.argv.slice(2);
  const di = argv.indexOf('--dir');
  if (di !== -1) {
    const dir = argv[di + 1];
    return fs.readdirSync(dir).filter(f => f.endsWith('.md')).map(f => path.join(dir, f));
  }
  return argv.filter(a => a.endsWith('.md'));
}

// 최소 YAML 파서 — frontmatter의 평면 키·인라인 배열·인라인 맵만 다룬다 (린트 용도)
function parseFrontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out = {};
  for (const raw of m[1].split('\n')) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const kv = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    if (val === '') { out[key] = ''; continue; }
    if (val.startsWith('[')) {
      out[key] = val.replace(/^\[|\]$/g, '').split(',')
        .map(s => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
    } else if (val.startsWith('{')) {
      const obj = {};
      for (const pair of val.replace(/^\{|\}$/g, '').split(',')) {
        const p = /^\s*([\w-]+)\s*:\s*(.*)$/.exec(pair);
        if (p) obj[p[1]] = p[2].trim().replace(/^["']|["']$/g, '');
      }
      out[key] = obj;
    } else {
      out[key] = val.replace(/^["']|["']$/g, '');
    }
  }
  return out;
}

// 플레이스홀더(템플릿 미치환) 판정 — "[정수]", "{...}", "TBD" 등
function isPlaceholder(v) {
  if (v === undefined || v === null || v === '') return true;
  const s = Array.isArray(v) ? v.join(',') : (typeof v === 'object' ? JSON.stringify(v) : String(v));
  return /^\s*$/.test(s) || /^\[[^\]]*\]$/.test(s.trim()) || /\{[A-Z_]+\}|TBD|TODO|미정/.test(s);
}

// glob 두 개가 겹칠 수 있는지 (보수적 판정 — 겹칠 가능성이 있으면 true)
function globToRe(g) {
  let re = '';
  for (let i = 0; i < g.length; i++) {
    if (g[i] === '*' && g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; }
    else if (g[i] === '*') re += '[^/]*';
    else re += g[i].replace(/[.+^${}()|[\]\\?]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}
function globsOverlap(a, b) {
  if (a === b) return true;
  const ra = globToRe(a), rb = globToRe(b);
  // 서로의 리터럴 프리픽스를 상대 패턴에 넣어 교차 판정 (근사)
  const litA = a.replace(/\*+/g, 'X'), litB = b.replace(/\*+/g, 'X');
  return ra.test(litB) || rb.test(litA);
}

function lintCard(file, text = fs.readFileSync(file, 'utf8')) {
  const fm = parseFrontmatter(text);
  const violations = [];
  const V = (rule, msg) => violations.push({ rule, msg });
  if (!fm) {
    V('C0-frontmatter', 'YAML frontmatter 없음 — 경계 블록을 담을 수 없다');
    return { file, frontmatter: null, violations };
  }

  // C1: 필수 경계 필드
  for (const k of ['tools', 'stop', 'effort', 'model']) {
    if (isPlaceholder(fm[k])) V(`C1-${k}`, `${k} 미기재/플레이스홀더 — 경계 블록 필수 필드 (합성 불가)`);
  }
  if (Array.isArray(fm.tools) && fm.tools.length === 0)
    V('C1-tools', 'tools가 빈 배열 — 허용 도구를 최소 1개 명시');

  // C2: stop 하위 키
  if (fm.stop && typeof fm.stop === 'object') {
    if (isPlaceholder(fm.stop.maxTurns) || !/^\d+$/.test(String(fm.stop.maxTurns || '')))
      V('C2-stop-maxTurns', 'stop.maxTurns가 정수가 아님 — 정지 조건 불명확');
    if (isPlaceholder(fm.stop.done_when))
      V('C2-stop-done_when', 'stop.done_when 미기재 — 완료 판정 기준 없음');
  }

  // C3: 리뷰어 read-only 하드코딩
  const isCritic = String(fm.archetype || '').includes('Critic');
  const reviewMode = String(fm.review_mode || '') === 'true';
  if (isCritic && !reviewMode)
    V('C3-review_mode', 'Critic archetype인데 review_mode: true 없음 — 검증 역할은 read-only 고정');
  if (reviewMode) {
    const bad = (fm.tools || []).filter(t => WRITE_TOOLS.includes(t));
    if (bad.length) V('C3-readonly-violation', `review_mode: true인데 쓰기 도구 보유(${bad.join(',')}) — 리뷰는 발견을 생산하지 변경을 생산하지 않는다`);
  }

  // C4: 쓰기 역할의 write_scope
  const needsScope = !reviewMode &&
    (WRITER_ARCHETYPES.has(String(fm.archetype || '').trim()) ||
     (fm.tools || []).some(t => WRITE_TOOLS.includes(t)));
  if (needsScope && isPlaceholder(fm.write_scope))
    V('C4-write_scope', '쓰기 역할(또는 쓰기 도구 보유)인데 write_scope 미기재 — 쓰기 소유권 경계 필수');

  return { file, frontmatter: fm, violations };
}

function main() {
const files = collectFiles();
if (files.length === 0) {
  console.log(JSON.stringify({ pass: false, cards: [], cross_violations: [],
    summary: { error: '검사할 카드 .md를 지정하라 (파일 인자 또는 --dir)' } }, null, 2));
  process.exit(2);
}

const cards = files.map(file => lintCard(file));

// C5: 카드 간 write_scope 배타성 (H1 핵심 — scope_overlap을 spawn 전에 차단)
const cross = [];
for (let i = 0; i < cards.length; i++) {
  for (let j = i + 1; j < cards.length; j++) {
    const a = cards[i].frontmatter, b = cards[j].frontmatter;
    if (!a || !b) continue;
    const sa = Array.isArray(a.write_scope) ? a.write_scope : (a.write_scope ? [a.write_scope] : []);
    const sb = Array.isArray(b.write_scope) ? b.write_scope : (b.write_scope ? [b.write_scope] : []);
    for (const ga of sa) for (const gb of sb) {
      if (isPlaceholder(ga) || isPlaceholder(gb)) continue;
      if (globsOverlap(ga, gb))
        cross.push({ rule: 'C5-scope-overlap',
          msg: `write_scope 교집합: ${path.basename(cards[i].file)}("${ga}") ↔ ${path.basename(cards[j].file)}("${gb}") — 공유 파일은 소유자 1명을 정하고 나머지는 변경 요청 방식으로`,
          files: [cards[i].file, cards[j].file] });
    }
  }
}

const total = cards.reduce((n, c) => n + c.violations.length, 0) + cross.length;
const report = {
  pass: total === 0,
  cards, cross_violations: cross,
  summary: { cards: cards.length, card_violations: total - cross.length, cross_violations: cross.length, total },
};
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
}

module.exports = { lintCard };
if (require.main === module) main();
