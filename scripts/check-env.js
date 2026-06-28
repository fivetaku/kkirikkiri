#!/usr/bin/env node
/**
 * check-env.js — 끼리끼리 설치 환경 점검 (cross-platform)
 *
 * Usage: node check-env.js
 *
 * 필수: Claude Code + Node.js + 실행 방식 최소 1개
 *   - Agent Teams: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS 설정
 *   - Workflow:     Claude Code 버전 ≥ 2.1.154
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const NC = '\x1b[0m';

const WORKFLOWS_MIN_VERSION = [2, 1, 154];

const whichCmd = process.platform === 'win32' ? 'where' : 'which';

function hasCommand(name) {
  try {
    execFileSync(whichCmd, [name], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function commandVersion(name, versionArgs) {
  try {
    return execFileSync(name, versionArgs, { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'version unknown';
  }
}

function parseSemver(text) {
  const m = /(\d+)\.(\d+)\.(\d+)/.exec(text || '');
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function semverGte(a, b) {
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

function pass(msg) { process.stdout.write(`  ${GREEN}✓${NC} ${msg}\n`); }
function fail(msg) { process.stdout.write(`  ${RED}✗${NC} ${msg}\n`); }
function warn(msg) { process.stdout.write(`  ${YELLOW}△${NC} ${msg}\n`); }

process.stdout.write('\n');
process.stdout.write('끼리끼리 환경 점검\n');
process.stdout.write('━'.repeat(28) + '\n');

// ── 필수 조건 ──
process.stdout.write('\n필수 조건:\n');

let requiredOk = true;

// Claude Code
let claudeVersionText = '';
if (hasCommand('claude')) {
  claudeVersionText = commandVersion('claude', ['--version']);
  pass(`Claude Code 설치됨 (${claudeVersionText})`);
} else {
  fail('Claude Code 미설치 — https://claude.ai/download');
  requiredOk = false;
}

// Node.js
if (hasCommand('node')) {
  const ver = commandVersion('node', ['--version']);
  pass(`Node.js 설치됨 (${ver})`);
} else {
  fail('Node.js 미설치 — https://nodejs.org');
  requiredOk = false;
}

// ── 실행 방식 (둘 중 최소 1개) ──
process.stdout.write('\n실행 방식 (둘 중 최소 1개 필요):\n');

// Agent Teams
const home = process.env.HOME || process.env.USERPROFILE || '';
const settingsFile = path.join(home, '.claude', 'settings.json');
let teamsEnabled = false;
try {
  if (fs.existsSync(settingsFile)) {
    const content = fs.readFileSync(settingsFile, 'utf8');
    teamsEnabled = content.includes('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS');
  }
} catch { /* ignore */ }

if (teamsEnabled) {
  pass('Agent Teams 사용 가능 — 환경변수 설정됨');
} else {
  warn('Agent Teams 비활성 — 사용하려면 ~/.claude/settings.json에 추가:');
  process.stdout.write('      { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }\n');
}

// Workflow — Claude Code 버전 ≥ 2.1.154
const claudeSemver = parseSemver(claudeVersionText);
let workflowsAvailable = false;
if (claudeSemver && semverGte(claudeSemver, WORKFLOWS_MIN_VERSION)) {
  workflowsAvailable = true;
  pass(`Workflow 사용 가능 — Claude Code ${claudeSemver.join('.')} ≥ ${WORKFLOWS_MIN_VERSION.join('.')}`);
} else if (claudeSemver) {
  warn(`Workflow 비활성 — Claude Code ${claudeSemver.join('.')} < ${WORKFLOWS_MIN_VERSION.join('.')}. 업데이트: claude update`);
} else {
  warn('Workflow 확인 불가 — Claude Code 버전을 읽지 못했습니다');
}

if (!teamsEnabled && !workflowsAvailable) {
  fail('실행 방식이 하나도 없습니다 — 위 안내에 따라 둘 중 하나를 켜주세요');
  requiredOk = false;
}

// tmux (선택 — Agent Teams는 in-process로 동작, tmux는 split-pane 표시용)
process.stdout.write('\n선택 조건 (표시):\n');
if (hasCommand('tmux')) {
  const ver = commandVersion('tmux', ['-V']);
  pass(`tmux 설치됨 (${ver}) — split-pane 표시 가능`);
} else {
  warn('tmux 미설치 — in-process로 정상 동작 (split-pane 표시만 비활성). 원하면 brew/apt install tmux');
}

// ── 선택 조건 (멀티 모델) ──
process.stdout.write('\n선택 조건 (멀티 모델):\n');

if (hasCommand('codex')) {
  pass('Codex CLI 설치됨 — 코드·대규모 분석 + cross-model 검토 활용 가능');
} else {
  warn('Codex CLI 미설치 — npm i -g @openai/codex (없어도 동작)');
}

if (hasCommand('agy')) {
  pass('Antigravity CLI(agy) 설치됨 — 디자인/UI 역할 활용 가능');
} else {
  warn('Antigravity CLI(agy) 미설치 — curl -fsSL https://antigravity.google/cli/install.sh | bash (없어도 동작)');
}

if (hasCommand('gjc')) {
  pass('gajae-code(gjc) 설치됨 — 코드 구현·분석 + cross-model 검토 활용 가능 (멀티모델)');
} else {
  warn('gajae-code(gjc) 미설치 — https://github.com/Yeachan-Heo/gajae-code (없어도 동작)');
}

if (hasCommand('gh')) {
  pass('GitHub CLI 설치됨 — PR 관리 활용 가능');
} else {
  warn('GitHub CLI 미설치 (없어도 동작)');
}

// ── 결과 ──
process.stdout.write('\n' + '━'.repeat(28) + '\n');

if (requiredOk) {
  const modes = [];
  if (teamsEnabled) modes.push('Agent Teams');
  if (workflowsAvailable) modes.push('Workflow');
  process.stdout.write(`${GREEN}필수 조건 충족 (사용 가능: ${modes.join(' + ')}). /kkirikkiri를 사용할 수 있어요!${NC}\n`);
} else {
  process.stdout.write(`${RED}필수 조건이 충족되지 않았습니다. 위의 안내를 따라 설정해주세요.${NC}\n`);
  process.exit(1);
}

process.stdout.write('\n');
