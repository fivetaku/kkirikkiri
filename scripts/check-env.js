#!/usr/bin/env node
/**
 * check-env.js — 끼리끼리 설치 환경 점검 (cross-platform)
 *
 * Usage: node check-env.js
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RED = '\x1b[0;31m';
const GREEN = '\x1b[0;32m';
const YELLOW = '\x1b[0;33m';
const NC = '\x1b[0m';

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

function pass(msg) { process.stdout.write(`  ${GREEN}\u2713${NC} ${msg}\n`); }
function fail(msg) { process.stdout.write(`  ${RED}\u2717${NC} ${msg}\n`); }
function warn(msg) { process.stdout.write(`  ${YELLOW}\u25b3${NC} ${msg}\n`); }

process.stdout.write('\n');
process.stdout.write('끼리끼리 환경 점검\n');
process.stdout.write('\u2501'.repeat(28) + '\n');

// ── 필수 조건 ──
process.stdout.write('\n필수 조건:\n');

let requiredOk = true;

// Claude Code
if (hasCommand('claude')) {
  pass('Claude Code 설치됨');
} else {
  fail('Claude Code 미설치 — https://claude.ai/download');
  requiredOk = false;
}

// Agent Teams 환경변수
const home = process.env.HOME || process.env.USERPROFILE || '';
const settingsFile = path.join(home, '.claude', 'settings.json');
let agentTeamsSet = false;
try {
  if (fs.existsSync(settingsFile)) {
    const content = fs.readFileSync(settingsFile, 'utf8');
    agentTeamsSet = content.includes('CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS');
  }
} catch { /* ignore */ }

if (agentTeamsSet) {
  pass('Agent Teams 환경변수 설정됨');
} else {
  fail('Agent Teams 환경변수 미설정');
  process.stdout.write('\n');
  process.stdout.write('    다음을 ~/.claude/settings.json에 추가하세요:\n');
  process.stdout.write('    { "env": { "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1" } }\n');
  requiredOk = false;
}

// tmux
if (hasCommand('tmux')) {
  const ver = commandVersion('tmux', ['-V']);
  pass(`tmux 설치됨 (${ver})`);
} else {
  fail('tmux 미설치 — brew install tmux (macOS) / apt install tmux (Linux) / WSL required (Windows)');
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

// ── 선택 조건 ──
process.stdout.write('\n선택 조건 (멀티 모델):\n');

if (hasCommand('codex')) {
  pass('Codex CLI 설치됨 — 코드 분석/리뷰 역할 활용 가능');
} else {
  warn('Codex CLI 미설치 — npm i -g @openai/codex (없어도 동작)');
}

if (hasCommand('gemini')) {
  pass('Gemini CLI 설치됨 — 대규모 분석 역할 활용 가능');
} else {
  warn('Gemini CLI 미설치 — npm i -g @google/gemini-cli (없어도 동작)');
}

if (hasCommand('gh')) {
  pass('GitHub CLI 설치됨 — PR 관리 활용 가능');
} else {
  warn('GitHub CLI 미설치 (없어도 동작)');
}

// ── 결과 ──
process.stdout.write('\n' + '\u2501'.repeat(28) + '\n');

if (requiredOk) {
  process.stdout.write(`${GREEN}모든 필수 조건이 충족되었습니다. /kkirikkiri를 사용할 수 있어요!${NC}\n`);
} else {
  process.stdout.write(`${RED}필수 조건이 충족되지 않았습니다. 위의 안내를 따라 설정해주세요.${NC}\n`);
  process.exit(1);
}

process.stdout.write('\n');
