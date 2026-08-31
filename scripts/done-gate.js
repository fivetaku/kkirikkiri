#!/usr/bin/env node
// done-gate.js — 완료 보고 게이트: 무행동 종료를 증적 없이 통과시키지 않는다 (v0.23.2)
// 사용: node done-gate.js --repo <작업 repo> --report <보고서.md> [--base <git-ref>]
// 판정:
//   변경 있음  → pass (diff --stat을 증적으로 출력에 동봉)
//   변경 없음 → 보고서에 "무변경 종료 심사" 블록(파일별 검사·불요 근거)이 추적 파일 전부를 커버해야 pass
// 근거: H1 재측정(2026-09-01) — 무행동 런 0→1→2 증가, 품질 −3.8점. 무변경 결론은 공짜가 아니라 증명 대상이다.
'use strict';
const fs = require('fs');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
function opt(name) { const i = args.indexOf('--' + name); return i === -1 ? undefined : args[i + 1]; }
const repo = opt('repo');
const reportPath = opt('report');
const base = opt('base') || 'HEAD';
if (!repo || !reportPath) {
  console.log(JSON.stringify({ pass: false, verdict: 'usage_error',
    msg: '--repo <dir> --report <md> 필수' }, null, 2));
  process.exit(2);
}

const diffStat = execFileSync('git', ['-C', repo, 'diff', '--stat', base], { encoding: 'utf8' }).trim();
const untracked = execFileSync('git', ['-C', repo, 'ls-files', '--others', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter(Boolean);
const changed = diffStat !== '' || untracked.length > 0;

if (changed) {
  console.log(JSON.stringify({ pass: true, verdict: 'changed',
    evidence: { diff_stat: diffStat || null, untracked },
    msg: '변경 증적 확인 — 이 evidence 블록을 완료 보고에 동봉하라' }, null, 2));
  process.exit(0);
}

// ── 무변경 경로: 보고서의 무변경 심사 블록 검사 ──
const report = fs.existsSync(reportPath) ? fs.readFileSync(reportPath, 'utf8') : '';
const tracked = execFileSync('git', ['-C', repo, 'ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);

const violations = [];
// 1) 심사 블록 존재 (한/영 앵커)
const auditHead = /##\s*(무변경 종료 심사|No-?Change Audit)/i.exec(report);
if (!auditHead) {
  violations.push({ rule: 'D1-audit-block',
    msg: '변경 0인데 "## 무변경 종료 심사" 블록이 보고서에 없음 — 무변경 결론은 파일별 증적으로 증명해야 한다' });
} else {
  const section = report.slice(auditHead.index).split(/\n##\s(?!#)/)[0];
  // 2) 추적 파일 전수 커버 — 파일명이 심사 블록에 등장해야 함
  const missing = tracked.filter(f => !section.includes(f) && !section.includes(f.split('/').pop()));
  if (missing.length)
    violations.push({ rule: 'D2-coverage',
      msg: `심사 블록이 추적 파일 ${missing.length}개를 누락: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ' …' : ''}` });
  // 3) 근거 열 존재 — 표 행에 검사 내용이 비어 있지 않은지 (행당 셀 3개 이상 요구)
  const rows = section.split('\n').filter(l => /^\|/.test(l) && !/^\|\s*[-:]/.test(l));
  const thin = rows.filter(l => l.split('|').filter(c => c.trim()).length < 3);
  if (rows.length && thin.length)
    violations.push({ rule: 'D3-evidence',
      msg: `심사 행 ${thin.length}개가 근거 셀 미달(파일|검사 내용|변경 불요 근거 3열 필수)` });
  if (!rows.length && !missing.length)
    violations.push({ rule: 'D3-evidence', msg: '심사 블록에 파일별 표가 없음 — 산문 선언만으로는 불충분' });
}

const pass = violations.length === 0;
console.log(JSON.stringify({ pass, verdict: pass ? 'no_change_justified' : 'no_change_unjustified',
  violations, tracked_files: tracked.length,
  msg: pass ? '무변경 종료가 파일별 증적으로 정당화됨'
            : '무변경 종료 불허 — 정비를 수행하거나 파일별 심사 증적을 채워라' }, null, 2));
process.exit(pass ? 0 : 1);
