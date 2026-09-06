const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

const gate = path.join(__dirname, '../scripts/done-gate.js');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-completion-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'repo');
  fs.mkdirSync(repo);
  const env = { ...process.env, HOME: root, GIT_CONFIG_GLOBAL: os.devnull, GIT_CONFIG_NOSYSTEM: '1' };
  for (const key of Object.keys(env)) if (key.startsWith('GIT_') && !['GIT_CONFIG_GLOBAL', 'GIT_CONFIG_NOSYSTEM'].includes(key)) delete env[key];
  const git = (...args) => {
    const r = spawnSync('git', ['-C', repo, ...args], { env, encoding: 'utf8', timeout: 15000 });
    assert.equal(r.status, 0, r.stderr);
  };
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'answer.txt'), 'correct\n');
  git('add', 'answer.txt');
  git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.test', 'commit', '-qm', 'baseline');
  const report = path.join(root, 'report.md');
  fs.writeFileSync(report, '# Result\nVerified fixture outcome.\n');
  const contractPath = path.join(root, 'completion.json');
  const contract = {
    version: 1, session_id: 'session-A', mode: 'implementation',
    artifacts: ['answer.txt'],
    criteria: [{ id: 'answer-correct', argv: [process.execPath, '-e',
      "require('node:assert/strict').equal(require('node:fs').readFileSync('answer.txt','utf8'),'correct\\n')"] }],
  };
  const run = (extra = []) => {
    fs.writeFileSync(contractPath, JSON.stringify(contract));
    const r = spawnSync(process.execPath, [gate, '--repo', repo, '--report', report,
      '--contract', contractPath, '--session-id', 'session-A', ...extra],
    { env, encoding: 'utf8', timeout: 15000 });
    return { exit: r.status, json: JSON.parse(r.stdout), stderr: r.stderr };
  };
  return { root, repo, report, contract, run, env };
}

test('unrelated changes cannot satisfy a failing acceptance criterion', (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.repo, 'unrelated.txt'), 'unrelated');
  fs.writeFileSync(path.join(f.repo, 'answer.txt'), 'wrong');
  const r = f.run();
  assert.equal(r.exit, 1);
  assert.equal(r.json.pass, false);
  assert.equal(r.json.checks[0].id, 'answer-correct');
  assert.equal(r.json.checks[0].exitCode, 1);
});

for (const mode of ['implementation', 'analysis', 'no-change']) {
  test(`valid ${mode} outcome passes without requiring mutations`, (t) => {
    const f = fixture(t);
    f.contract.mode = mode;
    const r = f.run();
    assert.equal(r.exit, 0);
    assert.equal(r.json.verdict, 'criteria_passed');
    assert.equal(r.json.mode, mode);
    assert.deepEqual(r.json.checks.map(c => c.id), ['answer-correct']);
    assert.match(r.json.artifacts[0].sha256, /^[a-f0-9]{64}$/);
    assert.match(r.json.report_sha256, /^[a-f0-9]{64}$/);
  });
}

test('missing report cannot pass with incidental files', (t) => {
  const f = fixture(t);
  fs.unlinkSync(f.report);
  fs.writeFileSync(path.join(f.repo, 'unrelated.txt'), 'unrelated');
  const r = f.run();
  assert.equal(r.exit, 1);
  assert.equal(r.json.pass, false);
  assert.equal(r.json.checks.length, 0);
});

test('wrong session, empty criteria and duplicate IDs are rejected before executing', (t) => {
  for (const defect of ['owner', 'empty', 'duplicate']) {
    const f = fixture(t);
    if (defect === 'owner') f.contract.session_id = 'session-B';
    if (defect === 'empty') f.contract.criteria = [];
    if (defect === 'duplicate') f.contract.criteria.push(f.contract.criteria[0]);
    const r = f.run();
    assert.equal(r.exit, 1);
    assert.equal(r.json.checks.length, 0);
  }
});

test('artifact traversal and symlink escape are rejected', (t) => {
  for (const target of ['../outside.txt', 'outside-link']) {
    const f = fixture(t);
    fs.writeFileSync(path.join(f.root, 'outside.txt'), 'outside');
    fs.symlinkSync(path.join(f.root, 'outside.txt'), path.join(f.repo, 'outside-link'));
    f.contract.artifacts = [target];
    const r = f.run();
    assert.equal(r.exit, 1);
    assert.equal(r.json.checks.length, 0);
  }
});

test('missing executable is a failed check, not successful evidence', (t) => {
  const f = fixture(t);
  f.contract.criteria[0].argv = [path.join(f.root, 'missing-command')];
  const r = f.run();
  assert.equal(r.exit, 1);
  assert.equal(r.json.checks[0].passed, false);
  assert.ok(r.json.checks[0].error);
});

test('an old passing run is not reused after artifact changes', (t) => {
  const f = fixture(t);
  assert.equal(f.run().exit, 0);
  fs.writeFileSync(path.join(f.repo, 'answer.txt'), 'wrong');
  assert.equal(f.run().exit, 1);
});

test('new session hook requires the contract and records actual criterion results', (t) => {
  const f = fixture(t);
  const plugin = path.resolve(__dirname, '..');
  const hook = (name) => spawnSync('bash', [path.join(plugin, 'hooks/scripts', `gate-${name}.sh`)], {
    env: { ...f.env, CLAUDE_PLUGIN_ROOT: plugin }, cwd: f.repo,
    input: JSON.stringify({ cwd: f.repo, session_id: 'session-A', prompt: '/kkirikkiri test',
      stop_hook_active: false }), encoding: 'utf8', timeout: 15000,
  });
  assert.equal(hook('init').status, 0);
  const runs = path.join(f.repo, '.kkirikkiri/runs');
  const ledgerPath = path.join(runs, fs.readdirSync(runs).find(name => name.endsWith('.json')));
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  assert.ok(ledger.work.contract);
  assert.equal(hook('done').status, 2);
  fs.mkdirSync(path.dirname(ledger.work.contract), { recursive: true });
  fs.mkdirSync(path.dirname(ledger.work.report), { recursive: true });
  fs.writeFileSync(ledger.work.contract, JSON.stringify(f.contract));
  fs.copyFileSync(f.report, ledger.work.report);
  assert.equal(hook('done').status, 0);
  const completed = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')).outcome_gate;
  assert.equal(completed.report.verdict, 'criteria_passed');
  assert.equal(completed.report.checks[0].id, 'answer-correct');
});

test('criteria that mutate declared artifacts require a fresh validation', (t) => {
  const f = fixture(t);
  f.contract.criteria[0].argv = [process.execPath, '-e',
    "require('node:fs').writeFileSync('answer.txt','changed by check')"];
  const r = f.run();
  assert.equal(r.exit, 1);
  assert.equal(r.json.checks[0].passed, true);
  assert.ok(r.json.violations.some(v => v.rule === 'D5-input-changed'));
});

test('one shared budget stops later criteria and fits the outer Stop hook', (t) => {
  const normal = fixture(t);
  const defaultBudget = normal.run();
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '../hooks/hooks.json'), 'utf8'));
  assert.ok(defaultBudget.json.budget_ms < hooks.hooks.Stop[0].hooks[0].timeout * 1000);
  const f = fixture(t);
  f.contract.criteria = [
    { id: 'slow', argv: [process.execPath, '-e', 'const end=Date.now()+300;while(Date.now()<end){}'] },
    { id: 'later', argv: [process.execPath, '-e', 'process.exit(0)'] },
  ];
  const r = f.run(['--budget-ms', '100']);
  assert.equal(r.exit, 1);
  assert.equal(r.json.checks[0].passed, false);
  assert.equal(r.json.checks[1].skipped, true);
  assert.ok(r.json.budget_ms < hooks.hooks.Stop[0].hooks[0].timeout * 1000);
});
