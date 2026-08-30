#!/usr/bin/env node
// wf-lint.js — Workflow 스크립트 발사 전 결정론 린트 (kkirikkiri 4단 게이트 W2)
// 사용: node wf-lint.js <script.js>        (또는 stdin으로 스크립트 본문)
// 출력: {pass, violations:[{rule, loc, msg}], checklist:[{id, question}]} JSON (02_DATA_MODEL §3)
// 규칙 근거: 2026-08-29 팬아웃 실측 결함 + PRD/kkirikkiri-structural-team-builder
'use strict';
const fs = require('fs');

function readInput() {
  const p = process.argv[2];
  if (p && p !== '-') return { text: fs.readFileSync(p, 'utf8'), name: p };
  return { text: fs.readFileSync(0, 'utf8'), name: '<stdin>' };
}

// idx 위치의 줄 번호
function lineOf(text, idx) { return text.slice(0, idx).split('\n').length; }

// 여는 괄호 idx부터 짝이 맞는 닫는 괄호까지의 본문 추출 (문자열 내 괄호는 무시하지 않는 근사 — 린트 용도)
function balancedSlice(text, openIdx, open = '(', close = ')', cap = 2000) {
  let depth = 0;
  for (let i = openIdx; i < Math.min(text.length, openIdx + cap); i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) { depth--; if (depth === 0) return text.slice(openIdx, i + 1); }
  }
  return text.slice(openIdx, openIdx + cap); // 못 닫으면 cap까지 (근사)
}

function lint(text) {
  const violations = [];
  const V = (rule, idx, msg, severity = 'error') =>
    violations.push({ rule, loc: `line ${lineOf(text, idx)}`, msg, severity });

  // ── R1: meta 순수 리터럴 ──
  const metaIdx = text.indexOf('export const meta');
  if (metaIdx === -1) {
    V('R1-meta', 0, 'export const meta 블록이 없음 — Workflow 도구 요구사항');
  } else {
    const braceIdx = text.indexOf('{', metaIdx);
    const metaBody = balancedSlice(text, braceIdx, '{', '}');
    if (/\$\{|`|\b\w+\s*\(/.test(metaBody.replace(/title:|detail:/g, '')))
      V('R1-meta', metaIdx, 'meta에 보간/호출 흔적 — 순수 리터럴이어야 함');
  }

  // ── agent() 호출 수집 ──
  const calls = [];
  const re = /\bagent\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = balancedSlice(text, m.index + m[0].length - 1);
    // 팬아웃 문맥: 직전 400자에 .map( 이 있고, 직전 80자에 화살표 함수(=>)로 감싸여 있을 때만
    // (단일 종합 콜 `return await agent(...)`를 팬아웃으로 오인하지 않도록 — clean fixture 오탐 보정)
    const before = text.slice(Math.max(0, m.index - 400), m.index);
    const near = text.slice(Math.max(0, m.index - 80), m.index);
    const inFanout = /\.map\s*\(/.test(before) && /=>/.test(near);
    calls.push({ idx: m.index, body, inFanout });
  }
  if (calls.length === 0) V('R0-agent', 0, 'agent() 호출이 없음 — Workflow 스크립트인지 확인');

  for (const c of calls) {
    // R3: model 핀 — 모든 agent() 필수 (기존 Step 4-W 규칙 3)
    if (!/\bmodel\s*:/.test(c.body))
      V('R3-model-pin', c.idx, 'agent() 호출에 model 핀 없음 — 세션 모델 상속으로 비용 폭증 위험');
    // R2: 팬아웃 agent()는 schema 필수 (종합 단일 콜은 예외)
    if (c.inFanout && !/\bschema\s*:/.test(c.body))
      V('R2-schema', c.idx, '팬아웃 agent()에 schema 없음 — 계약을 프롬프트가 아닌 도구 계층으로 내릴 것');
  }

  // ── R4: fan-in 독점 — flatMap 후 slice를 라운드로빈 없이 자름 (2026-08-29 확장 독점 실측) ──
  const fmRe = /flatMap[\s\S]{0,300}?\.slice\s*\(/g;
  while ((m = fmRe.exec(text)) !== null) {
    const ctx = text.slice(Math.max(0, m.index - 300), m.index + 400);
    if (!/round[-_ ]?robin|interleave|per[-_ ]?axis|quota|축별/i.test(ctx))
      V('R4-fanin-monopoly', m.index,
        'flatMap→slice 재분배에 라운드로빈/쿼터 부재 — 배열 앞쪽 축이 슬롯을 독점함 (2026-08-29 실측 결함)');
  }

  // ── R5: 예산 반환 필드 — schema를 쓰는데 *_count/budget 필드가 하나도 없음 ──
  const usesSchema = /\bschema\s*:/.test(text);
  if (usesSchema && !/(search_count|_count\b|budget)/.test(text))
    V('R5-budget-field', 0, 'schema에 예산 회계 필드(search_count 등) 없음 — 세션 200캡은 조용한 빈 결과라 회계 필수');

  // ── R6: 폭 초과 — 리터럴 배열 팬아웃 폭 >6 ──
  const arrRe = /const\s+(\w+)\s*=\s*\[/g;
  while ((m = arrRe.exec(text)) !== null) {
    const body = balancedSlice(text, m.index + m[0].length - 1, '[', ']', 20000);
    const items = (body.match(/^\s*\{/gm) || []).length;
    const usedInParallel = new RegExp(`parallel\\s*\\(\\s*${m[1]}\\b`).test(text) ||
      new RegExp(`${m[1]}\\s*\\.map`).test(text);
    if (usedInParallel && items > 6)
      V('R6-width', m.index, `팬아웃 폭 ${items} > 6 — 배치 분할 필요 (rate-limit 가드)`);
  }
  // slice(0, N) 폭 신호는 parallel(변수.map ...)의 그 변수 정의 체인에서만 읽는다
  // (문자열 truncation slice 오탐 방지 — 2026-08-30 fixture 보정)
  const pvRe = /parallel\s*\(\s*(?:await\s+)?(\w+)\s*\.map/g;
  while ((m = pvRe.exec(text)) !== null) {
    const defRe = new RegExp(`const\\s+${m[1]}\\s*=([\\s\\S]*?)(?:\\n\\s*\\n|\\nconst |\\nphase\\()`);
    const def = defRe.exec(text);
    if (!def) continue;
    const sl = /\.slice\s*\(\s*0\s*,\s*(\d+)\s*\)\s*(?:\/\/[^\n]*)?\s*$/m.exec(def[1].trim());
    const cap = sl ? parseInt(sl[1], 10) : null;
    if (cap !== null && cap > 6)
      V('R6-width', def.index, `팬아웃 변수 ${m[1]}의 slice 상한 ${cap} > 6 — 확장 폭 초과`);
  }

  // ── R7: 검증(refute) 스테이지 부재 — 경고 ──
  if (!/refute|반박|adversarial|검증.{0,40}agent|verify/i.test(text))
    V('R7-no-refute', 0, '검증(refute) 스테이지 미검출 — 팬아웃 결과를 종합 전에 교차 검증할 것', 'warn');

  const errors = violations.filter(v => v.severity !== 'warn');
  return {
    pass: errors.length === 0,
    violations,
    checklist: [
      { id: 'C1', question: 'parallel() 배리어가 정말 필요한가? (축 간 dedup 등 전체 결과 의존이 없으면 pipeline)' },
      { id: 'C2', question: '기계 판정 가능한 계약이 프롬프트층에만 있지 않은가? (contract_layers 대조)' },
      { id: 'C3', question: '요청의 하위 목표가 축에 전부 매핑됐는가? (커버리지 공백)' },
    ],
  };
}

const { text, name } = readInput();
const report = lint(text);
report.target = name;
console.log(JSON.stringify(report, null, 2));
process.exit(report.pass ? 0 : 1);
