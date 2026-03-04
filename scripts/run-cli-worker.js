#!/usr/bin/env node
/**
 * run-cli-worker.js — Detached CLI worker (council-job-worker.js pattern)
 *
 * Spawns a single Codex/Gemini CLI process, captures output,
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
  } else if (provider === 'gemini') {
    program = 'gemini';
    args = ['--yolo', '-m', 'gemini-2.5-pro', promptFile];
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
