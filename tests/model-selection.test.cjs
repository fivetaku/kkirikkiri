const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const plugin = path.resolve(__dirname, '..');

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-model-selection-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const cwd = path.join(home, 'workspace');
  fs.mkdirSync(cwd);
  const env = { ...process.env, HOME: home, CLAUDE_PLUGIN_ROOT: plugin };
  const run = (command, args, input) => spawnSync(command, args, {
    cwd, env, input, encoding: 'utf8', timeout: 15000,
  });
  return { home, cwd, run,
    lint(source, selection, raw = false) {
      const args = [path.join(plugin, 'scripts/wf-lint.js'), '-'];
      if (selection !== undefined) args.push('--models-json', raw ? selection : JSON.stringify(selection));
      const result = run(process.execPath, args, source);
      assert.equal(result.error, undefined);
      return { ...result, report: JSON.parse(result.stdout) };
    },
    prepare(plan) {
      const input = path.join(cwd, 'plan.json'), output = path.join(cwd, 'prepared');
      fs.writeFileSync(input, JSON.stringify(plan));
      const result = run(process.execPath, [path.join(plugin, 'scripts/prepare-team.js'),
        '--input', input, '--out', output]);
      assert.equal(result.error, undefined);
      return { ...result, report: JSON.parse(result.stdout), output };
    },
    seed(session, selection, directory = cwd, name = session) {
      const runs = path.join(directory, '.kkirikkiri/runs');
      fs.mkdirSync(runs, { recursive: true });
      const file = path.join(runs, name + '.json');
      fs.writeFileSync(file, JSON.stringify({ session_id: session, outcome: null,
        ...(selection === undefined ? {} : { model_selection: selection }) }));
      return file;
    },
    gate(input = {}, session = 'A', directory = cwd, tool = 'Workflow') {
      return run('bash', [path.join(plugin, `hooks/scripts/gate-${tool === 'Workflow' ? 'wf' : 'spawn'}.sh`)], JSON.stringify({
        cwd: directory, session_id: session, tool_name: tool, tool_input: input,
      }));
    },
  };
}

function planFor(models) {
  return { version: 1, run_id: 'run-A', session_id: 'A', revision: 1, mode: 'teams',
    team_name: 'selected-team', approval: { mode: 'teams', revision: 1 },
    acceptance: [{ id: 'A1', description: 'Return verified work' }],
    tasks: Object.entries(models).map(([id, model], index) => ({ id, model,
      role: id, archetype: index === 0 ? 'Analyst' : 'Critic', domain: 'fixture',
      tools: ['Read'], write_scope: [], stop: { maxTurns: 5, done_when: 'Report actual evidence' },
      effort: 'low', instruction: 'Inspect fixture and report findings.', acceptance_ids: ['A1'],
    })), model_selection: { models },
  };
}

const meta = "export const meta = {name: 'selection-fixture', phases: []};\n";
function workflow(models) {
  return meta + Object.entries(models).map(([phase, model]) =>
    `await agent('verify fixture', {phase: ${JSON.stringify(phase)}, model: ${JSON.stringify(model)}});`
  ).join('\n');
}
const mixed = { produce: 'sonnet', review: 'opus' };

test('Teams requested Opus cannot be silently replaced with Sonnet', t => {
  const f = fixture(t), plan = planFor({ produce: 'opus', review: 'opus' });
  plan.tasks[0].model = 'sonnet';
  const result = f.prepare(plan);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.report.pass, false);
  assert.equal(fs.existsSync(result.output), false);
});

for (const [profile, models] of Object.entries({
  'all-opus': { produce: 'opus', review: 'opus' },
  'all-sonnet': { produce: 'sonnet', review: 'sonnet' },
  mixed, 'haiku-producer': { produce: 'haiku', review: 'opus' },
  'fable-centered': { produce: 'fable', review: 'fable', shim: 'sonnet' },
  'fable-mixed': { produce: 'sonnet', review: 'fable' },
})) {
  test(`${profile}: CLI cards and Agent inputs preserve the authoritative map through spawn`, t => {
    const f = fixture(t), plan = planFor(models);
    plan.model_selection.profile = 'informative-not-a-default';
    plan.model_selection.available_models = [...new Set(Object.values(models))];
    const result = f.prepare(plan);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    f.seed('A', plan.model_selection);
    const launch = JSON.parse(fs.readFileSync(path.join(result.output, 'launch.json')));
    for (const request of launch.requests) {
      assert.equal(request.input.model, models[request.task_id]);
      const card = fs.readFileSync(path.join(result.output, 'agents', request.task_id + '.md'), 'utf8');
      assert.equal(/^model: (.+)$/m.exec(card)[1], models[request.task_id]);
      const hook = f.gate(request.input, 'A', f.cwd, request.tool);
      assert.equal(hook.status, 0, hook.stderr);
    }
  });
  test(`${profile}: lint and trusted native VM agent options agree`, { timeout: 15000 }, async t => {
    const f = fixture(t), source = workflow(models);
    const result = f.lint(source, { models, profile: 'not-authoritative' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    const actual = {};
    // Only this locally constructed trusted fixture is evaluated, never CLI input.
    await vm.runInNewContext(`(async () => {${source.replace('export const meta', 'const meta')}})()`, {
      agent: async (_prompt, options) => { actual[options.phase] = options.model; },
    }, { timeout: 1000 });
    assert.deepEqual(actual, models);
  });
}

const invalidSelections = {
  'missing ID': { models: { produce: 'sonnet' } },
  'extra ID': { models: { ...mixed, unknown: 'opus' } },
  'empty ID': { models: { ...mixed, '': 'opus' } },
  'blank ID': { models: { ...mixed, ' ': 'opus' } },
  'unknown model': { models: { ...mixed, review: 'gpt' } },
  // Native Agent reports enum [sonnet, opus, haiku, fable]; full IDs are not tool values.
  'unsupported full Fable ID': { models: { ...mixed, review: 'claude-fable-5-1[1m]' } },
  'unsupported unsuffixed Fable ID': { models: { ...mixed, review: 'claude-fable-5-1' } },
  'unverified Fable version': { models: { ...mixed, review: 'claude-fable-99' } },
  'empty model': { models: { ...mixed, review: '' } },
  'missing model': { models: { ...mixed, review: null } },
  'empty map': { models: {} },
  'missing map': {},
  'array map': { models: ['sonnet', 'opus'] },
  'null selection': null,
  'unavailable model': { models: mixed, available_models: ['sonnet'] },
  'empty availability': { models: mixed, available_models: [] },
  'invalid availability': { models: mixed, available_models: ['opus', 'sonnet', 'unknown'] },
  'null availability': { models: mixed, available_models: null },
  'invalid profile': { models: mixed, profile: 3 },
};

test('Fable cannot silently fall back or be rewritten to a full model ID', t => {
  const f = fixture(t);
  const models = { produce: 'fable', review: 'sonnet' };
  const selection = { models, available_models: ['fable', 'sonnet'] };
  f.seed('A', selection);
  for (const actual of ['opus', 'sonnet', 'claude-fable-5-1[1m]']) {
    const plan = planFor(models);
    plan.tasks[0].model = actual;
    const prepared = f.prepare(plan);
    assert.equal(prepared.status, 1);
    assert.match(prepared.stdout, /selection must not be overridden/);
    const wf = f.lint(workflow({ ...models, produce: actual }), selection);
    assert.equal(wf.status, 1);
    assert.match(wf.stdout, /selection must not be overridden/);
    const spawn = f.gate({ name: 'produce', model: actual, prompt: 'read-only; stop: maxTurns 5' },
      'A', f.cwd, 'Agent');
    assert.equal(spawn.status, 2);
    assert.match(spawn.stderr, /selection must not be overridden/);
  }
});

test('Fable availability evidence must include the selected native alias', t => {
  const f = fixture(t), plan = planFor({ produce: 'fable', review: 'sonnet' });
  plan.model_selection.available_models = ['opus', 'sonnet'];
  const result = f.prepare(plan);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /absent from available_models/);
  f.seed('A', plan.model_selection);
  const resultWf = f.gate({ script: workflow(plan.model_selection.models) });
  assert.equal(resultWf.status, 2);
  assert.match(resultWf.stderr, /absent from available_models/);
});

test('native Agent full Fable IDs are rejected even when plan and selection agree', t => {
  const f = fixture(t);
  for (const fullId of ['claude-fable-5-1', 'claude-fable-5-1[1m]']) {
    const models = { produce: fullId, review: 'sonnet' };
    const prepared = f.prepare(planFor(models));
    assert.equal(prepared.status, 1, prepared.stdout);
    assert.match(prepared.stdout, /invalid selected ID\/model/);
    const checked = f.lint(workflow(models), { models });
    assert.equal(checked.status, 1, checked.stdout);
    assert.match(checked.stdout, /invalid selected ID\/model/);
  }
});

for (const [name, selection] of Object.entries(invalidSelections)) {
  test(`Teams rejects ${name} before emitting artifacts`, t => {
    const f = fixture(t), plan = planFor(mixed);
    plan.model_selection = selection;
    const result = f.prepare(plan);
    assert.equal(result.status, 1, result.stdout);
    assert.equal(fs.existsSync(result.output), false);
  });
  test(`Workflow rejects ${name}`, t => {
    const result = fixture(t).lint(workflow(mixed), selection);
    assert.equal(result.status, 1, result.stdout);
    assert.ok(result.report.violations.some(v => v.rule === 'R8-model-selection'));
  });
}

const invalidCalls = {
  mismatch: "agent('verify', {phase: 'produce', model: 'sonnet'})",
  'prompt fake model': `agent("verify model: 'opus'", {phase: 'produce', model: 'sonnet'})`,
  'prompt only model': `agent("verify model: 'opus'", {phase: 'produce'})`,
  'nested fake options': "agent('verify', {phase: 'produce', schema: {model: 'opus', search_count: 0}})",
  'missing phase': "agent('verify', {model: 'opus'})",
  'dynamic phase': "agent('verify', {phase: stage, model: 'opus'})",
  'dynamic model': "agent('verify', {phase: 'produce', model: selected})",
  'conditional model': "agent('verify', {phase: 'produce', model: true ? 'opus' : 'sonnet'})",
  'referenced options': "const options = {phase: 'produce', model: 'opus'}; agent('verify', options)",
  'spread options': "agent('verify', {phase: 'produce', model: 'opus', ...defaults})",
  'computed key': "agent('verify', {phase: 'produce', ['model']: 'opus'})",
  'duplicate model': "agent('verify', {phase: 'produce', model: 'opus', model: 'sonnet'})",
  'duplicate phase': "agent('verify', {phase: 'produce', model: 'opus', phase: 'review'})",
  'model getter': "agent('verify', {phase: 'produce', get model() {return 'opus'}})",
  'aliased agent': "const run = agent; run('verify', {phase: 'produce', model: 'opus'})",
  'member agent': "host.agent('verify', {phase: 'produce', model: 'opus'})",
  'computed agent': "host['agent']('verify', {phase: 'produce', model: 'opus'})",
  'optional call': "agent?.('verify', {phase: 'produce', model: 'opus'})",
  'extra argument': "agent('verify', {phase: 'produce', model: 'opus'}, defaults)",
  'template model': "agent('verify', {phase: 'produce', model: `${selected}`})",
  'nested interpolation mismatch': "agent(`verify ${agent('inner', {phase: 'produce', model: 'sonnet'})}`, {phase: 'produce', model: 'opus'})",
  'comment-only agent': "// agent('verify', {phase: 'produce', model: 'opus'})",
};
for (const [name, call] of Object.entries(invalidCalls)) {
  test(`selection scanner fails closed: ${name}`, t => {
    const result = fixture(t).lint(meta + call, { models: { produce: 'opus' } });
    assert.equal(result.status, 1, result.stdout);
    assert.ok(result.report.violations.some(v => v.rule === 'R8-model-selection'));
  });
}

for (const call of [
  "host[method]('verify', {phase: 'produce', model: 'sonnet'})",
  "host['a' + 'gent']('verify', {phase: 'produce', model: 'sonnet'})",
  "factory()('verify', {phase: 'produce', model: 'sonnet'})",
  `eval("agent('verify', {phase: 'produce', model: 'sonnet'})")`,
  `Function("agent('verify', {phase: 'produce', model: 'sonnet'})")()`,
]) {
  test(`selection rejects opaque execution alongside a valid call: ${call}`, t => {
    const source = workflow({ produce: 'opus' }) + '\n' + call;
    const result = fixture(t).lint(source, { models: { produce: 'opus' } });
    assert.equal(result.status, 1, result.stdout);
    assert.ok(result.report.violations.some(v => v.rule === 'R8-model-selection'));
  });
}

test('trusted native fanout fixture preserves every phase/model at invocation', { timeout: 15000 }, async t => {
  const f = fixture(t);
  const source = fs.readFileSync(path.join(__dirname, 'fixtures/wf-clean.js'), 'utf8');
  const models = { '수집': 'sonnet', '검증': 'sonnet', '종합': 'opus' };
  const report = f.lint(source, { models });
  assert.equal(report.status, 0, report.stdout);
  const calls = [];
  await vm.runInNewContext(`(async () => {${source.replace('export const meta', 'const meta')}})()`, {
    phase() {}, parallel: actions => Promise.all(actions.map(action => action())),
    agent: async (_prompt, options) => { calls.push({ phase: options.phase, model: options.model }); return {}; },
  }, { timeout: 1000 });
  assert.equal(calls.length, 7);
  assert.deepEqual([...new Set(calls.map(call => call.phase))], Object.keys(models));
  for (const call of calls) assert.equal(call.model, models[call.phase]);
});

test('literal scanner ignores prompt/comment decoys and handles templates and quoted keys', t => {
  const source = meta + `
    // agent('fake', {model: 'sonnet', phase: 'fake'})
    await agent("verify ) , {model: 'sonnet', phase: 'fake'}", {
      phase: 'produce', /* model: 'haiku' */ 'model': 'opus',
      label: \`label:\${String({ nested: ')' })}\`
    });
    await agent(\`verify \${JSON.stringify({x: '('})} model: 'haiku'\`, {phase: 'review', model: 'sonnet'});
  `;
  const result = fixture(t).lint(source, { models: { produce: 'opus', review: 'sonnet' },
    available_models: ['opus', 'sonnet'] });
  assert.equal(result.status, 0, result.stdout);
});

test('repeated literal phases are valid only when every call preserves the selection', t => {
  const f = fixture(t), selection = { models: { produce: 'opus' } };
  const call = "agent('verify', {phase: 'produce', model: 'opus'});";
  assert.equal(f.lint(meta + call + call, selection).status, 0);
  assert.equal(f.lint(meta + call + call.replace("model: 'opus'", "model: 'sonnet'"), selection).status, 1);
});

for (const setup of [
  'const ratio = 8 / 2;',
  'let ratio = 8; ratio /= 2;',
  'const ratio = (8 + 4) / 2;',
  String.raw`const pattern = /agent[(]fake[)]/g;`,
  String.raw`const pattern = /[\/]/;`,
  String.raw`if (true) /agent/.test('text');`,
]) {
  test(`unrelated arithmetic and regex preserve actual model calls: ${setup}`, async t => {
    const f = fixture(t);
    const source = meta + setup + "\nawait agent('verify', {phase: 'produce', model: 'opus'});";
    const checked = f.lint(source, { models: { produce: 'opus' } });
    assert.equal(checked.status, 0, checked.stdout);
    const calls = [];
    await vm.runInNewContext(`(async () => {${source.replace('export const meta', 'const meta')}})()`, {
      agent: async (_prompt, options) => calls.push([options.phase, options.model]),
    }, { timeout: 1000 });
    assert.deepEqual(calls, [['produce', 'opus']]);
  });
}

for (const expression of ['8', 'of', 'record.return', 'record.if()']) {
  test(`division cannot hide a mismatched agent call as regex text: ${expression}`, t => {
    const source = workflow({ produce: 'opus' })
      + "\nconst of = 8; const record = {return: 8, if: () => 8};"
      + `\nconst ratio = ${expression} / agent('verify', {phase: 'produce', model: 'sonnet'}) / 2;`;
    const checked = fixture(t).lint(source, { models: { produce: 'opus' } });
    assert.equal(checked.status, 1, checked.stdout);
    assert.ok(checked.report.violations.some(v => v.rule === 'R8-model-selection'));
  });
}

test('invalid --models-json is a structured lint failure', t => {
  const result = fixture(t).lint(workflow(mixed), '{broken', true);
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.report.pass, false);
});

test('actual gate blocks current session mismatch, not another session selection', t => {
  const f = fixture(t), selected = { models: { produce: 'opus' } };
  const a = f.seed('A', selected), b = f.seed('B', { models: { produce: 'sonnet' } });
  const before = [fs.readFileSync(a), fs.readFileSync(b)];
  const input = { script: workflow({ produce: 'sonnet' }) };
  const blocked = f.gate(input);
  assert.equal(blocked.status, 2, blocked.stderr);
  assert.match(blocked.stderr, /R8-model-selection/);
  assert.equal(f.gate(input, 'B').status, 0);
  assert.equal(f.gate(input, 'missing-session').status, 0);
  assert.equal(f.gate(input, null).status, 0);
  assert.deepEqual([fs.readFileSync(a), fs.readFileSync(b)], before);
});

test('gate resolves ancestor selection despite nearer unrelated ledger and checks scriptPath', t => {
  const f = fixture(t), child = path.join(f.cwd, 'repo');
  fs.mkdirSync(child);
  f.seed('A', { models: { produce: 'opus' } });
  f.seed('B', { models: { produce: 'sonnet' } }, child);
  const file = path.join(child, 'workflow.js');
  fs.writeFileSync(file, workflow({ produce: 'sonnet' }));
  assert.equal(f.gate({ scriptPath: file }, 'A', child).status, 2);
  fs.writeFileSync(file, workflow({ produce: 'opus' }));
  assert.equal(f.gate({ scriptPath: file }, 'A', child).status, 0);
});

test('selected gate blocks uninspectable named workflow, missing file, and malformed selection', t => {
  const f = fixture(t);
  f.seed('A', { models: { produce: 'opus' } });
  assert.equal(f.gate({ name: 'saved-workflow' }).status, 2);
  assert.equal(f.gate({ scriptPath: path.join(f.cwd, 'missing.js') }).status, 2);
  f.seed('A', null);
  assert.equal(f.gate({ script: workflow({ produce: 'opus' }) }).status, 2);
});

test('gate propagates ambiguous current-session ledger errors', t => {
  const f = fixture(t);
  f.seed('A', { models: mixed });
  f.seed('A', { models: mixed }, f.cwd, 'second-A');
  const result = f.gate({ script: workflow(mixed) });
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /ambiguous-ledger/);
});

const spawnInput = { name: 'produce', model: 'opus', prompt: 'read-only; stop: maxTurns 5' };
for (const [name, change] of Object.entries({
  mismatch: { model: 'sonnet' }, 'missing model': { model: undefined },
  'unknown model': { model: 'gpt' }, 'unknown identity': { name: 'other' },
  'missing identity': { name: undefined },
})) {
  test(`manual Teams actual spawn hook blocks ${name}`, t => {
    const f = fixture(t);
    const ledger = f.seed('A', { models: { produce: 'opus' } });
    const before = fs.readFileSync(ledger);
    const result = f.gate({ ...spawnInput, ...change }, 'A', f.cwd, 'Agent');
    assert.equal(result.status, 2, result.stderr);
    assert.match(result.stderr, /model-selection/);
    assert.deepEqual(fs.readFileSync(ledger), before);
  });
}

test('manual Teams selection uses name before description, supports Task, and isolates sessions', t => {
  const f = fixture(t);
  f.seed('A', { models: { produce: 'opus', review: 'sonnet' } });
  f.seed('B', { models: { produce: 'sonnet' } });
  assert.equal(f.gate({ ...spawnInput, description: 'review' }, 'A', f.cwd, 'Agent').status, 0);
  assert.equal(f.gate({ ...spawnInput, name: undefined, description: 'produce' }, 'A', f.cwd, 'Task').status, 0);
  assert.equal(f.gate(spawnInput, 'B', f.cwd, 'Agent').status, 2);
  assert.equal(f.gate(spawnInput, 'missing', f.cwd, 'Agent').status, 0);
});

test('manual Teams rejects supplied unavailable model and invalid ledger selection', t => {
  const f = fixture(t);
  for (const selection of [null, { models: { produce: 'opus' }, available_models: ['sonnet'] }]) {
    f.seed('A', selection);
    assert.equal(f.gate(spawnInput, 'A', f.cwd, 'Agent').status, 2);
  }
});

test('legacy Teams and Workflow without selections remain supported', t => {
  const f = fixture(t), plan = planFor(mixed);
  delete plan.model_selection;
  assert.equal(f.prepare(plan).status, 0);
  f.seed('A', undefined);
  assert.equal(f.lint(workflow(mixed)).status, 0);
  assert.equal(f.gate({ script: workflow(mixed) }).status, 0);
  assert.equal(f.gate({ name: 'legacy-saved' }).status, 0);
  assert.equal(f.gate({ ...spawnInput, model: undefined }, 'A', f.cwd, 'Agent').status, 0);
});
