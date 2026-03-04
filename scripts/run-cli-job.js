#!/usr/bin/env node
/**
 * run-cli-job.js — 끼리끼리 외부 CLI 오케스트레이터
 *
 * Subcommands:
 *   start  --provider codex|gemini --prompt-file path [--timeout N] [--jobs-dir path] [--json]
 *   status [--text] JOB_DIR
 *   wait   [--timeout-ms N] [--interval-ms N] JOB_DIR
 *   results [--json] JOB_DIR
 *   stop   JOB_DIR
 *   clean  JOB_DIR
 *   check  codex|gemini
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFileSync } = require('child_process');

const SCRIPT_DIR = __dirname;
const WORKER_PATH = path.join(SCRIPT_DIR, 'run-cli-worker.js');
const JOBS_DIR_DEFAULT = path.join(SCRIPT_DIR, '..', '.jobs');

function killProcess(pid) {
  try {
    if (process.platform === 'win32') {
      process.kill(pid, 'SIGKILL');
    } else {
      process.kill(pid, 'SIGTERM');
    }
  } catch { /* process already gone */ }
}

function exitWithError(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function atomicWriteJson(filePath, payload) {
  const tmpPath = `${filePath}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function readJsonIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function sleepMs(ms) {
  const msNum = Number(ms);
  if (!Number.isFinite(msNum) || msNum <= 0) return;
  const sab = new SharedArrayBuffer(4);
  const view = new Int32Array(sab);
  Atomics.wait(view, 0, 0, Math.trunc(msNum));
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const out = { _: [] };
  const booleanFlags = new Set(['json', 'text', 'help', 'h']);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      out._.push(...args.slice(i + 1));
      break;
    }
    if (!a.startsWith('--')) {
      out._.push(a);
      continue;
    }
    const normalizedKey = a.slice(2);
    if (booleanFlags.has(normalizedKey)) {
      out[normalizedKey] = true;
      continue;
    }
    const next = args[i + 1];
    if (next == null || next.startsWith('--')) {
      out[normalizedKey] = true;
    } else {
      out[normalizedKey] = next;
      i++;
    }
  }
  return out;
}

function printHelp() {
  process.stdout.write(`run-cli-job.js — 끼리끼리 외부 CLI 러너

Usage:
  run-cli.sh start --provider codex|gemini --prompt-file path [--timeout N] [--json]
  run-cli.sh status [--text] <JOB_DIR>
  run-cli.sh wait [--timeout-ms N] [--interval-ms N] <JOB_DIR>
  run-cli.sh results [--json] <JOB_DIR>
  run-cli.sh stop <JOB_DIR>
  run-cli.sh clean <JOB_DIR>
  run-cli.sh check codex|gemini
`);
}

function resolveJobDir(arg, jobsDir) {
  if (arg) return arg;
  const lastJobFile = path.join(jobsDir, '.last-job');
  if (fs.existsSync(lastJobFile)) {
    const saved = fs.readFileSync(lastJobFile, 'utf8').trim();
    if (saved) return saved;
  }
  return null;
}

// ─── start ──────────────────────────────────────────────────────────
function cmdStart(options) {
  const provider = options.provider;
  const promptFile = options['prompt-file'];
  const timeout = options.timeout ? Number(options.timeout) : 600;
  const jobsDir = options['jobs-dir'] || JOBS_DIR_DEFAULT;

  if (!provider) exitWithError('start: missing --provider (codex or gemini)');
  if (!promptFile) exitWithError('start: missing --prompt-file');
  if (!['codex', 'gemini'].includes(provider)) {
    exitWithError(`start: unsupported provider "${provider}" (use codex or gemini)`);
  }
  if (!fs.existsSync(promptFile)) {
    exitWithError(`start: prompt file not found: ${promptFile}`);
  }

  ensureDir(jobsDir);

  const jobId = `${new Date().toISOString().replace(/[:.]/g, '').replace('T', '-').slice(0, 15)}-${crypto
    .randomBytes(3)
    .toString('hex')}`;
  const jobDir = path.join(jobsDir, `cli-${provider}-${jobId}`);
  ensureDir(jobDir);

  // Copy prompt to job directory
  fs.copyFileSync(promptFile, path.join(jobDir, 'prompt.txt'));

  const jobMeta = {
    id: `cli-${provider}-${jobId}`,
    provider,
    promptFile: path.resolve(promptFile),
    timeout,
    createdAt: new Date().toISOString(),
  };
  atomicWriteJson(path.join(jobDir, 'job.json'), jobMeta);
  atomicWriteJson(path.join(jobDir, 'status.json'), {
    provider,
    state: 'queued',
    queuedAt: new Date().toISOString(),
  });

  // Spawn detached worker
  const workerArgs = [
    WORKER_PATH,
    '--job-dir', jobDir,
    '--provider', provider,
  ];
  if (Number.isFinite(timeout) && timeout > 0) {
    workerArgs.push('--timeout', String(timeout));
  }

  const child = spawn(process.execPath, workerArgs, {
    detached: true,
    stdio: 'ignore',
    env: process.env,
  });
  child.unref();

  // Save last job path
  const lastJobFile = path.join(jobsDir, '.last-job');
  try { fs.writeFileSync(lastJobFile, jobDir, 'utf8'); } catch { /* ignore */ }

  if (options.json) {
    process.stdout.write(`${JSON.stringify({ jobDir, ...jobMeta }, null, 2)}\n`);
  } else {
    process.stdout.write(`${jobDir}\n`);
  }
}

// ─── status ─────────────────────────────────────────────────────────
function cmdStatus(options, jobDir) {
  const resolvedJobDir = path.resolve(jobDir);
  if (!fs.existsSync(resolvedJobDir)) exitWithError(`jobDir not found: ${resolvedJobDir}`);

  const status = readJsonIfExists(path.join(resolvedJobDir, 'status.json'));
  if (!status) exitWithError('status.json not found');

  if (options.text) {
    const state = status.state || 'unknown';
    const provider = status.provider || '?';
    const msg = status.message ? ` — ${status.message}` : '';
    process.stdout.write(`${provider}: ${state}${msg}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

// ─── wait ───────────────────────────────────────────────────────────
function cmdWait(options, jobDir) {
  const resolvedJobDir = path.resolve(jobDir);
  if (!fs.existsSync(resolvedJobDir)) exitWithError(`jobDir not found: ${resolvedJobDir}`);

  const intervalMs = Math.max(50, Number(options['interval-ms'] || 500));
  const timeoutMs = Number(options['timeout-ms'] || 0);
  const terminalStates = new Set(['done', 'error', 'missing_cli', 'timed_out']);

  const start = Date.now();
  while (true) {
    const status = readJsonIfExists(path.join(resolvedJobDir, 'status.json'));
    if (status && terminalStates.has(status.state)) {
      process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
      return;
    }
    if (timeoutMs > 0 && Date.now() - start >= timeoutMs) {
      process.stdout.write(`${JSON.stringify(status || { state: 'timeout' }, null, 2)}\n`);
      return;
    }
    sleepMs(intervalMs);
  }
}

// ─── results ────────────────────────────────────────────────────────
function cmdResults(options, jobDir) {
  const resolvedJobDir = path.resolve(jobDir);
  if (!fs.existsSync(resolvedJobDir)) exitWithError(`jobDir not found: ${resolvedJobDir}`);

  const status = readJsonIfExists(path.join(resolvedJobDir, 'status.json'));
  const outputPath = path.join(resolvedJobDir, 'output.txt');
  const errorPath = path.join(resolvedJobDir, 'error.txt');

  const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
  const stderr = fs.existsSync(errorPath) ? fs.readFileSync(errorPath, 'utf8') : '';

  if (options.json) {
    process.stdout.write(`${JSON.stringify({
      jobDir: resolvedJobDir,
      status: status || null,
      output,
      stderr,
    }, null, 2)}\n`);
    return;
  }

  const provider = status ? status.provider : '?';
  const state = status ? status.state : 'unknown';
  process.stdout.write(`=== ${provider} (${state}) ===\n`);
  if (status && status.message) process.stdout.write(`${status.message}\n`);
  process.stdout.write(output || '(no output)\n');
  if (!output && stderr) {
    process.stdout.write('\nstderr:\n');
    process.stdout.write(stderr);
  }
  process.stdout.write('\n');
}

// ─── stop ───────────────────────────────────────────────────────────
function cmdStop(_options, jobDir) {
  const resolvedJobDir = path.resolve(jobDir);
  const status = readJsonIfExists(path.join(resolvedJobDir, 'status.json'));
  if (!status) exitWithError('status.json not found');

  if (status.state !== 'running' || !status.pid) {
    process.stdout.write(`stop: not running (state=${status.state})\n`);
    return;
  }

  killProcess(Number(status.pid));
  process.stdout.write('stop: signal sent\n');
}

// ─── clean ──────────────────────────────────────────────────────────
function cmdClean(_options, jobDir) {
  const resolvedJobDir = path.resolve(jobDir);
  fs.rmSync(resolvedJobDir, { recursive: true, force: true });
  process.stdout.write(`cleaned: ${resolvedJobDir}\n`);
}

// ─── check ──────────────────────────────────────────────────────────
function cmdCheck(provider) {
  if (!provider) exitWithError('check: missing provider name (codex or gemini)');
  if (!['codex', 'gemini'].includes(provider)) {
    exitWithError(`check: unsupported provider "${provider}"`);
  }

  try {
    const whichCmd = process.platform === 'win32' ? 'where' : 'which';
    const result = execFileSync(whichCmd, [provider], { encoding: 'utf8', timeout: 5000 }).trim();
    const firstLine = result.split(/\r?\n/)[0]; // where returns multiple lines on Windows
    process.stdout.write(`${provider}: found at ${firstLine}\n`);
    process.exit(0);
  } catch {
    process.stdout.write(`${provider}: not found\n`);
    process.exit(1);
  }
}

// ─── main ───────────────────────────────────────────────────────────
function main() {
  const options = parseArgs(process.argv);
  const [command, ...rest] = options._;

  if (!command || options.help || options.h) {
    printHelp();
    return;
  }

  const jobsDir = options['jobs-dir'] || JOBS_DIR_DEFAULT;

  if (command === 'start') {
    cmdStart(options);
    return;
  }
  if (command === 'check') {
    cmdCheck(rest[0]);
    return;
  }

  // All other commands need a jobDir
  const jobDir = resolveJobDir(rest[0], jobsDir);
  if (!jobDir) exitWithError(`${command}: missing JOB_DIR (no argument and no .last-job found)`);

  if (command === 'status') { cmdStatus(options, jobDir); return; }
  if (command === 'wait') { cmdWait(options, jobDir); return; }
  if (command === 'results') { cmdResults(options, jobDir); return; }
  if (command === 'stop') { cmdStop(options, jobDir); return; }
  if (command === 'clean') { cmdClean(options, jobDir); return; }

  exitWithError(`Unknown command: ${command}`);
}

if (require.main === module) {
  main();
}
