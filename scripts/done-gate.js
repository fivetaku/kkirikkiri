#!/usr/bin/env node
// done-gate.js — 완료 보고 게이트: 무행동 종료를 증적 없이 통과시키지 않는다 (v0.23.2)
// 사용: node done-gate.js --repo <작업 repo> --report <보고서.md> [--base <git-ref>]
// 판정:
//   변경 있음  → pass (diff --stat을 증적으로 출력에 동봉)
//   변경 없음 → 보고서에 "무변경 종료 심사" 블록(파일별 검사·불요 근거)이 추적 파일 전부를 커버해야 pass
// 근거: H1 재측정(2026-09-01) — 무행동 런 0→1→2 증가, 품질 −3.8점. 무변경 결론은 공짜가 아니라 증명 대상이다.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const args = process.argv.slice(2);
function opt(name) { const i = args.indexOf('--' + name); return i === -1 ? undefined : args[i + 1]; }
const repo = opt('repo');
const reportPath = opt('report');
const base = opt('base') || 'HEAD';
const contractPath = opt('contract');
if (!repo || !reportPath) {
  console.log(JSON.stringify({ pass: false, verdict: 'usage_error',
    msg: '--repo <dir> --report <md> 필수' }, null, 2));
  process.exit(2);
}

if (contractPath) {
  const budgetMs = Number(opt('budget-ms') || 45000);
  const deadline = Date.now() + budgetMs;
  const checks = [];
  const violations = [];
  const artifacts = [];
  let reportHash;
  let contractHash;
  let contract;
  const hash = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  try {
    if (!Number.isInteger(budgetMs) || budgetMs < 1 || budgetMs > 45000) {
      throw new Error('budget-ms must be an integer from 1 to 45000');
    }
    contractHash = hash(contractPath);
    contract = JSON.parse(fs.readFileSync(contractPath, 'utf8'));
    if (contract.version !== 1 || !['implementation', 'analysis', 'no-change'].includes(contract.mode)
        || !Array.isArray(contract.criteria) || contract.criteria.length === 0
        || !Array.isArray(contract.artifacts) || contract.artifacts.length === 0) {
      throw new Error('version, mode, nonempty criteria and artifacts are required');
    }
    if (opt('session-id') && contract.session_id !== opt('session-id')) {
      throw new Error('completion contract belongs to another session');
    }
    const ids = new Set();
    for (const criterion of contract.criteria) {
      if (typeof criterion.id !== 'string' || !criterion.id.trim() || ids.has(criterion.id)
          || !Array.isArray(criterion.argv) || criterion.argv.length === 0
          || !criterion.argv.every(arg => typeof arg === 'string') || !criterion.argv[0]) {
        throw new Error('criteria need unique IDs and executable argv arrays');
      }
      ids.add(criterion.id);
    }
    if (!fs.statSync(reportPath).isFile() || !fs.readFileSync(reportPath, 'utf8').trim()) {
      throw new Error('a nonempty result report is required');
    }
    reportHash = hash(reportPath);
    const root = fs.realpathSync(repo);
    for (const relative of contract.artifacts) {
      if (typeof relative !== 'string' || !relative || path.isAbsolute(relative)
          || relative.split(/[/\\]/).includes('..')) throw new Error('artifacts must be repo-relative files');
      const file = fs.realpathSync(path.resolve(root, relative));
      const local = path.relative(root, file);
      if (path.isAbsolute(local) || local === '..' || local.startsWith('..' + path.sep)
          || !fs.statSync(file).isFile()) throw new Error('artifact escapes repository or is not a file');
      artifacts.push({ path: relative, sha256: hash(file) });
    }
  } catch (error) {
    violations.push({ rule: 'D4-completion-contract', msg: error.message });
  }
  if (violations.length === 0) {
    for (const criterion of contract.criteria) {
      const started = Date.now();
      const remaining = deadline - started;
      if (remaining <= 0) {
        checks.push({ id: criterion.id, argv: criterion.argv, passed: false, skipped: true,
          exitCode: null, durationMs: 0, error: 'total validation budget exhausted' });
        continue;
      }
      try {
        const output = execFileSync(criterion.argv[0], criterion.argv.slice(1), {
          cwd: repo, encoding: 'utf8', timeout: Math.min(30000, remaining), maxBuffer: 1024 * 1024,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        checks.push({ id: criterion.id, argv: criterion.argv, passed: true, exitCode: 0,
          durationMs: Date.now() - started, output: output.slice(-4000) });
      } catch (error) {
        checks.push({ id: criterion.id, argv: criterion.argv, passed: false,
          exitCode: Number.isInteger(error.status) ? error.status : null,
          durationMs: Date.now() - started, error: String(error.stderr || error.message).slice(-4000) });
      }
    }
    try {
      if (hash(contractPath) !== contractHash || hash(reportPath) !== reportHash
          || artifacts.some(item => hash(path.resolve(repo, item.path)) !== item.sha256)) {
        violations.push({ rule: 'D5-input-changed', msg: 'contract/report/artifact changed during validation; rerun on a stable snapshot' });
      }
    } catch (error) {
      violations.push({ rule: 'D5-input-changed', msg: error.message });
    }
  }
  const pass = violations.length === 0 && checks.length > 0 && checks.every(check => check.passed);
  console.log(JSON.stringify({ pass, verdict: pass ? 'criteria_passed' : 'criteria_unverified',
    mode: contract?.mode, budget_ms: budgetMs, contract_sha256: contractHash, report_sha256: reportHash,
    checks, artifacts, violations, msg: pass ? '요청별 검사를 실행해 통과함' : '요청별 완료 기준이 검증되지 않음' }, null, 2));
  process.exit(pass ? 0 : 1);
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
