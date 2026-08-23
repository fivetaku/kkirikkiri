#!/usr/bin/env node
/**
 * run-cli-worker.js — Detached CLI worker (council-job-worker.js pattern)
 *
 * Spawns a single Codex/Antigravity(agy) CLI process, captures output,
 * and writes atomic status updates.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');

// 일부 CLI는 셸 프로필을 통해서만 PATH에 올라가므로, 비대화형 셸(훅·CI·detached 워커)에서
// spawn이 ENOENT로 죽는다. 알려진 설치 경로를 PATH 앞에 덧대어 그 오탐을 막는다.
// grok: `curl -fsSL https://x.ai/cli/install.sh | bash` → ~/.grok/bin/grok
// ⚠️ 이름 충돌: npm의 서드파티 `@vibe-kit/grok-cli`도 `grok` 바이너리를 설치한다(실측 2026-08-23,
//    /opt/homebrew/bin/grok v1.0.1). 그쪽은 아래 플래그(--sandbox/--no-auto-update 등)를 모른다.
//    ~/.grok/bin을 PATH **앞**에 붙이는 이 순서가 공식 xAI CLI를 결정적으로 이기게 하는 장치다.
const EXTRA_BIN_DIRS = [path.join(os.homedir(), '.grok', 'bin')];

function envWithExtraPaths(base) {
  const env = { ...(base || process.env) };
  const existing = EXTRA_BIN_DIRS.filter((d) => {
    try { return fs.existsSync(d); } catch { return false; }
  });
  if (existing.length === 0) return env;
  const sep = process.platform === 'win32' ? ';' : ':';
  env.PATH = [...existing, env.PATH || ''].filter(Boolean).join(sep);
  return env;
}

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
    // OpenAI Codex CLI — 비대화형 원샷: `codex exec [FLAGS] "<프롬프트>"` (pumasi와 동일 패턴).
    // agy/gjc처럼 프롬프트는 파일 경로가 아니라 "내용 문자열"을 마지막 positional로 전달한다.
    // 모델은 CLI 기본값 사용 (필요 시 KKIRIKKIRI_CODEX_MODEL 환경 변수로 오버라이드).
    const promptContent = fs.readFileSync(promptFile, 'utf8');
    program = 'codex';
    args = ['exec', '--dangerously-bypass-approvals-and-sandbox'];
    if (process.env.KKIRIKKIRI_CODEX_MODEL) {
      args.push('-m', process.env.KKIRIKKIRI_CODEX_MODEL);
    }
    args.push(promptContent);
  } else if (provider === 'antigravity') {
    // Google Antigravity CLI (바이너리: `agy`) (2026-06-18 개인/Pro/Ultra 전환).
    // 원샷 헤드리스 호출: `agy -p "<프롬프트>"`, 자동승인: --dangerously-skip-permissions.
    // 주의 1) -p는 프롬프트 "문자열"을 받는다 → codex처럼 파일 경로가 아니라 내용을 전달.
    // 주의 2) 모델 플래그(-m/--model)는 헤드리스에서 미지원/고정(고정 모델)으로 보고됨 → 생략.
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
  } else if (provider === 'grok') {
    // xAI Grok Build CLI (바이너리: `grok`).
    // 비대화형 원샷: `grok -p "<프롬프트>"`. codex/agy/gjc처럼 프롬프트는 파일 경로가 아니라
    // "내용 문자열"을 -p 값으로 전달한다. (grok은 `--prompt-file`도 지원하지만 다른 provider와
    //  형태를 맞춰 -p로 통일한다.)
    // 실측(2026-08-23, grok 1.0.4): 비-TTY 파이프에서도 stdout 정상 출력 — agy의 stdout 누락 버그 없음.
    // 주의 1) 샌드박스가 **기본 off**다(codex와 반대). 워커가 임의 파일·네트워크에 닿지 않도록
    //         `--sandbox workspace`로 조인다.
    // 주의 2) 자동 업데이터가 백그라운드로 돌아 실행 중 끼어들 수 있으므로 `--no-auto-update` 필수.
    // 주의 3) 대체 화면(alt-screen) TUI 진입을 막기 위해 `--no-alt-screen`을 함께 준다.
    // 모델은 grok 기본값(grok-4.6) 사용. `grok-code-fast-1`은 2026-08-15 폐기되어 쓰지 않는다.
    const promptContent = fs.readFileSync(promptFile, 'utf8');
    program = 'grok';
    args = ['--no-auto-update', '--no-alt-screen', '--sandbox', 'workspace', '--always-approve'];
    if (process.env.KKIRIKKIRI_GROK_MODEL) {
      args.push('-m', process.env.KKIRIKKIRI_GROK_MODEL);
    }
    args.push('-p', promptContent);
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
      env: envWithExtraPaths(),
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
