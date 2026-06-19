#!/usr/bin/env node
/**
 * run-cli-worker.js — Detached CLI worker (council-job-worker.js pattern)
 *
 * Spawns a single Codex/Antigravity(agy) CLI process, captures output,
 * and writes atomic status updates.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function killProcess(pid) {
  try {
    if (process.platform === 'win32') {
      process.kill(pid, 'SIGKILL');
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch { /* process already gone */ }
}

function atomicWriteJson(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = args[i + 1];
    if (next == null || next.startsWith('--')) {
      out[key] = true;
    } else {
      out[key] = next;
      i++;
    }
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv);
  const jobDir = opts['job-dir'];
  const provider = opts.provider;
  const timeout = opts.timeout ? Number(opts.timeout) : 600;

  if (!jobDir || !provider) {
    process.stderr.write('worker: missing --job-dir or --provider\n');
    process.exit(1);
  }

  const statusPath = path.join(jobDir, 'status.json');
  const outputPath = path.join(jobDir, 'output.txt');
  const errorPath = path.join(jobDir, 'error.txt');
  const promptPath = path.join(jobDir, 'prompt.txt');

  if (!fs.existsSync(promptPath)) {
    atomicWriteJson(statusPath, {
      provider,
      state: 'error',
      message: 'prompt.txt not found',
      finishedAt: new Date().toISOString(),
    });
    process.exit(1);
  }

  const promptFile = path.resolve(promptPath);

  // Validate provider CLI exists
  let program, args;
  if (provider === 'codex') {
    program = 'codex';
    args = ['--full-auto', '--quiet', '-m', 'o3', promptFile];
  } else if (provider === 'antigravity') {
    // Google Antigravity CLI (바이너리: `agy`) — Gemini CLI 후계 (2026-06-18 개인/Pro/Ultra 전환).
    // 원샷 헤드리스 호출: `agy -p "<프롬프트>"`, 자동승인: --dangerously-skip-permissions.
    // 주의 1) -p는 프롬프트 "문자열"을 받는다 → codex처럼 파일 경로가 아니라 내용을 전달.
    // 주의 2) 모델 플래그(-m/--model)는 헤드리스에서 미지원/고정(Gemini 3.x)으로 보고됨 → 생략.
    // 주의 3) agy 1.0.x는 비-TTY(파이프)에서 stdout 출력 누락 버그가 있어 output.txt가 비어있을 수 있다.
    const promptContent = fs.readFileSync(promptFile, 'utf8');
    program = 'agy';
    args = ['--dangerously-skip-permissions', '-p', promptContent];
  } else if (provider === 'gjc') {
    // gajae-code (Yeachan-Heo/gajae-code) — 멀티모델 코딩 CLI.
    // 비대화형 원샷: `gjc --print "<프롬프트>"`. antigravity처럼 프롬프트는 파일 경로가 아니라
    // "내용 문자열"을 마지막 positional(MESSAGE)로 전달한다.
    // 실측(2026-06-19): 비-TTY 파이프에서도 stdout 정상 출력 — agy의 stdout 누락 버그 없음.
    // 모델은 gjc 기본값 사용(필요 시 `--model opus` 등으로 핀 가능).
    const promptContent = fs.readFileSync(promptFile, 'utf8');
    program = 'gjc';
    args = ['--print', promptContent];
  } else {
    atomicWriteJson(statusPath, {
      provider,
      state: 'error',
      message: `Unsupported provider: ${provider}`,
      finishedAt: new Date().toISOString(),
    });
    process.exit(1);
  }

  atomicWriteJson(statusPath, {
    provider,
    state: 'running',
    startedAt: new Date().toISOString(),
    pid: null,
  });

  const outStream = fs.createWriteStream(outputPath, { flags: 'w' });
  const errStream = fs.createWriteStream(errorPath, { flags: 'w' });

  let child;
  try {
    child = spawn(program, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
  } catch (error) {
    atomicWriteJson(statusPath, {
      provider,
      state: 'error',
      message: error.message || 'Failed to spawn',
      finishedAt: new Date().toISOString(),
    });
    process.exit(1);
  }

  atomicWriteJson(statusPath, {
    provider,
    state: 'running',
    startedAt: new Date().toISOString(),
    pid: child.pid,
  });

  if (child.stdout) child.stdout.pipe(outStream);
  if (child.stderr) child.stderr.pipe(errStream);

  // Timeout
  let timeoutTriggered = false;
  let timeoutHandle = null;
  if (Number.isFinite(timeout) && timeout > 0) {
    timeoutHandle = setTimeout(() => {
      timeoutTriggered = true;
      killProcess(child.pid);
    }, timeout * 1000);
    timeoutHandle.unref();
  }

  const finalize = (payload) => {
    try { outStream.end(); errStream.end(); } catch {}
    atomicWriteJson(statusPath, payload);
  };

  child.on('error', (error) => {
    const isMissing = error && error.code === 'ENOENT';
    finalize({
      provider,
      state: isMissing ? 'missing_cli' : 'error',
      message: isMissing ? `${provider} CLI not found` : (error.message || 'Process error'),
      finishedAt: new Date().toISOString(),
      exitCode: null,
      pid: child.pid,
    });
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    const timedOut = timeoutTriggered && (signal === 'SIGTERM' || signal === 'SIGKILL');
    finalize({
      provider,
      state: timedOut ? 'timed_out' : code === 0 ? 'done' : 'error',
      message: timedOut ? `Timed out after ${timeout}s` : null,
      finishedAt: new Date().toISOString(),
      exitCode: typeof code === 'number' ? code : null,
      signal: signal || null,
      pid: child.pid,
    });
    process.exit(code === 0 ? 0 : 1);
  });
}

if (require.main === module) {
  main();
}
