const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const plugin = path.resolve(__dirname, '..');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-prepare-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plan = {
    version: 1, run_id: 'run-A', session_id: 'session-A', revision: 1,
    mode: 'teams', team_name: 'actual-host-team',
    approval: { revision: 1, mode: 'teams' },
    acceptance: [{ id: 'A1', description: 'Both outputs satisfy the requested contract' }],
    tasks: [
      { id: 'builder-a', role: 'First builder', archetype: 'Builder', domain: 'fixture',
        model: 'sonnet', tools: ['Read', 'Write', 'Edit'], write_scope: ['src/a.js'],
        stop: { maxTurns: 8, done_when: 'A1 implementation and report complete' }, effort: 'low',
        instruction: 'Implement the first requested fixture behavior.', acceptance_ids: ['A1'] },
      { id: 'builder-b', role: 'Second builder', archetype: 'Builder', domain: 'fixture',
        model: 'sonnet', tools: ['Read', 'Write', 'Edit'], write_scope: ['src/b.js'],
        stop: { maxTurns: 8, done_when: 'A1 implementation and report complete' }, effort: 'low',
        instruction: 'Implement the second requested fixture behavior.', acceptance_ids: ['A1'] },
      { id: 'critic', role: 'Independent reviewer', archetype: 'Critic', domain: 'fixture review',
        model: 'opus', tools: ['Read', 'Grep', 'Glob'], write_scope: [],
        stop: { maxTurns: 8, done_when: 'Check A1 and report actual findings' }, effort: 'high',
        instruction: 'Independently inspect both results and report defects.', acceptance_ids: ['A1'] },
    ],
  };
  const input = path.join(root, 'plan.json');
  const output = path.join(root, 'prepared');
  const run = () => {
    fs.writeFileSync(input, JSON.stringify(plan));
    const r = spawnSync(process.execPath, [path.join(plugin, 'scripts/prepare-team.js'),
      '--input', input, '--out', output], { encoding: 'utf8', timeout: 15000 });
    return { exit: r.status, stdout: r.stdout, stderr: r.stderr };
  };
  return { root, plan, input, output, run };
}

test('one approved record produces cards and exact independent spawn requests', (t) => {
  const f = fixture(t);
  const r = f.run();
  assert.equal(r.exit, 0, r.stderr);
  const bundle = JSON.parse(r.stdout);
  assert.equal(bundle.session_id, 'session-A');
  assert.equal(bundle.run_id, 'run-A');
  assert.equal(bundle.permission_enforcement, 'declarations_only');
  assert.equal(bundle.requests.length, 3);
  assert.deepEqual(bundle.stages, [
    { kind: 'produce', task_ids: ['builder-a', 'builder-b'] },
    { kind: 'review', task_ids: ['critic'] },
  ]);
  for (const task of f.plan.tasks) {
    const request = bundle.requests.find(r => r.task_id === task.id);
    assert.equal(request.input.team_name, undefined);
    assert.equal(bundle.team_binding, 'implicit-session');
    assert.equal(request.tool, 'Agent');
    assert.equal(request.input.description, task.id);
    assert.equal(request.input.model, task.model);
    assert.equal(request.input.subagent_type, 'general-purpose');
    assert.ok(request.input.prompt.includes(task.instruction));
    assert.ok(request.input.prompt.includes(task.stop.done_when));
    assert.deepEqual(request.contract.write_scope, task.write_scope);
    assert.deepEqual(request.contract.tools, task.tools);
    assert.deepEqual(request.contract.acceptance_ids, task.acceptance_ids);
    assert.equal(request.contract.stop.maxTurns, task.stop.maxTurns);
    assert.ok(fs.readFileSync(path.join(f.output, 'agents', task.id + '.md'), 'utf8').includes(task.instruction));
  }
  const lint = spawnSync(process.execPath, [path.join(plugin, 'scripts/card-lint.js'),
    '--dir', path.join(f.output, 'agents')], { encoding: 'utf8', timeout: 15000 });
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
});

for (const defect of ['unapproved', 'mode', 'missing-model', 'overlap', 'review-write',
  'traversal', 'uncovered', 'no-critic', 'duplicate-id']) {
  test(`invalid ${defect} plan produces no launch artifacts`, (t) => {
    const f = fixture(t);
    if (defect === 'unapproved') f.plan.approval.revision = 0;
    if (defect === 'mode') f.plan.mode = 'workflow';
    if (defect === 'missing-model') delete f.plan.tasks[0].model;
    if (defect === 'overlap') f.plan.tasks[1].write_scope = ['src/**'];
    if (defect === 'review-write') f.plan.tasks[2].tools.push('Write');
    if (defect === 'traversal') f.plan.tasks[0].write_scope = ['../other/file.js'];
    if (defect === 'uncovered') f.plan.acceptance.push({ id: 'A2', description: 'unmapped' });
    if (defect === 'no-critic') f.plan.tasks.pop();
    if (defect === 'duplicate-id') f.plan.tasks[1].id = f.plan.tasks[0].id;
    const r = f.run();
    assert.equal(r.exit, 1, r.stderr);
    const failure = JSON.parse(r.stdout);
    assert.equal(failure.pass, false);
    assert.ok(failure.errors.length);
    assert.equal(fs.existsSync(f.output), false);
  });
}

test('preparation is deterministic and refuses to overwrite an existing bundle', (t) => {
  const f = fixture(t);
  assert.equal(f.run().exit, 0);
  const original = fs.readFileSync(path.join(f.output, 'launch.json'));
  assert.equal(f.run().exit, 1);
  assert.deepEqual(fs.readFileSync(path.join(f.output, 'launch.json')), original);
  const second = path.join(f.root, 'second');
  const r = spawnSync(process.execPath, [path.join(plugin, 'scripts/prepare-team.js'),
    '--input', f.input, '--out', second], { encoding: 'utf8', timeout: 15000 });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(fs.readFileSync(path.join(second, 'launch.json')), original);
});

test('generated requests pass real spawn hooks and preserve per-task ownership', (t) => {
  const f = fixture(t);
  const r = f.run();
  assert.equal(r.exit, 0, r.stderr);
  const bundle = JSON.parse(r.stdout);
  const runs = path.join(f.root, '.kkirikkiri/runs');
  fs.mkdirSync(runs, { recursive: true });
  const ledgerPath = path.join(runs, 'run-A.json');
  fs.writeFileSync(ledgerPath, JSON.stringify({ session_id: 'session-A', outcome: null }));
  for (const request of bundle.requests) {
    const hook = spawnSync('bash', [path.join(plugin, 'hooks/scripts/gate-spawn.sh')], {
      env: { ...process.env, HOME: f.root, CLAUDE_PLUGIN_ROOT: plugin },
      cwd: f.root, input: JSON.stringify({ cwd: f.root, session_id: 'session-A',
        tool_name: request.tool, tool_input: request.input }), encoding: 'utf8', timeout: 15000,
    });
    assert.equal(hook.status, 0, hook.stderr);
  }
  const ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8'));
  for (const task of f.plan.tasks) {
    const entry = ledger.declarations.find(entry => entry.agent === task.id);
    assert.deepEqual(entry.write_scope, task.write_scope);
    assert.equal(entry.read_only, task.archetype === 'Critic');
  }
});

test('read-only analysis producers also produce valid cards without invented write scopes', (t) => {
  const f = fixture(t);
  for (const task of f.plan.tasks) {
    task.tools = ['Read'];
    task.write_scope = [];
    if (task.archetype !== 'Critic') task.archetype = 'Analyst';
  }
  assert.equal(f.run().exit, 0);
  const lint = spawnSync(process.execPath, [path.join(plugin, 'scripts/card-lint.js'),
    '--dir', path.join(f.output, 'agents')], { encoding: 'utf8', timeout: 15000 });
  assert.equal(lint.status, 0, lint.stdout + lint.stderr);
});

test('accepted root filenames survive real spawn scope extraction', (t) => {
  for (const filename of ['Makefile', '.gitignore', 'main.c']) {
    const f = fixture(t);
    f.plan.tasks[0].write_scope = [filename];
    const r = f.run();
    assert.equal(r.exit, 0);
    const request = JSON.parse(r.stdout).requests[0];
    const runs = path.join(f.root, '.kkirikkiri/runs');
    fs.mkdirSync(runs, { recursive: true });
    const ledgerPath = path.join(runs, 'run.json');
    fs.writeFileSync(ledgerPath, JSON.stringify({ session_id: 'session-A', outcome: null }));
    const hook = spawnSync('bash', [path.join(plugin, 'hooks/scripts/gate-spawn.sh')], {
      env: { ...process.env, HOME: f.root, CLAUDE_PLUGIN_ROOT: plugin }, cwd: f.root,
      input: JSON.stringify({ cwd: f.root, session_id: 'session-A',
        tool_name: request.tool, tool_input: request.input }), encoding: 'utf8', timeout: 15000,
    });
    assert.equal(hook.status, 0, hook.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(ledgerPath)).declarations[0].write_scope, [filename]);
  }
});

test('card-incompatible stop text is rejected before artifacts exist', (t) => {
  for (const value of ['# verified', 'TODO', '{PENDING}', 'TBD']) {
    const f = fixture(t);
    f.plan.tasks[0].stop.done_when = value;
    assert.equal(f.run().exit, 1);
    assert.equal(fs.existsSync(f.output), false);
  }
});

test('the existing card validator is authoritative for generated boundary values', (t) => {
  const f = fixture(t);
  f.plan.tasks[0].effort = '[]';
  const result = f.run();
  assert.equal(result.exit, 1);
  assert.ok(JSON.parse(result.stdout).errors.some(error => error.includes('C1-effort')));
  assert.equal(fs.existsSync(f.output), false);
});
