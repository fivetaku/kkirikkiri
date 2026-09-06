// Reproducible matched-plan comparison. No network or model invocation.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { prepare } = require('../scripts/prepare-team.js');

const [planPath, baselinePath] = process.argv.slice(2);
if (!planPath || !baselinePath) throw new Error('Usage: node measure-preparation.cjs PLAN MODEL_BASELINE');
const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
const candidate = prepare(plan);
assert.equal(candidate.pass, true);
const plugin = path.resolve(__dirname, '..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'kk-matched-preparation-'));
const run = (program, args, options = {}) => {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 15000, ...options });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return result;
};

try {
  const arms = {};
  for (const [label, bundle] of [['baseline', baseline], ['candidate', candidate]]) {
    assert.equal(bundle.requests.length, plan.tasks.length);
    assert.equal(bundle.cards.length, plan.tasks.length);
    const root = path.join(temporary, label);
    const cards = path.join(root, 'agents');
    const runs = path.join(root, '.kkirikkiri/runs');
    fs.mkdirSync(cards, { recursive: true });
    fs.mkdirSync(runs, { recursive: true });
    const ledger = path.join(runs, 'run.json');
    fs.writeFileSync(ledger, JSON.stringify({ session_id: plan.session_id, outcome: null }));
    for (const task of plan.tasks) {
      const request = bundle.requests.find(r => r.task_id === task.id);
      assert.equal(request.input.description, task.id);
      assert.equal(request.input.model, task.model);
      assert.equal(request.input.subagent_type, 'general-purpose');
      assert.ok(request.input.prompt.includes(task.instruction));
      assert.ok(request.input.prompt.includes(task.stop.done_when));
      for (const id of task.acceptance_ids) {
        assert.ok(request.input.prompt.includes(plan.acceptance.find(c => c.id === id).description));
      }
      const card = bundle.cards.find(c => c.path === `agents/${task.id}.md`);
      fs.writeFileSync(path.join(cards, task.id + '.md'), card.content);
      run('bash', [path.join(plugin, 'hooks/scripts/gate-spawn.sh')], {
        cwd: root, env: { ...process.env, HOME: root, CLAUDE_PLUGIN_ROOT: plugin },
        input: JSON.stringify({ cwd: root, session_id: plan.session_id,
          tool_name: 'Agent', tool_input: request.input }),
      });
    }
    const lint = JSON.parse(run(process.execPath, [path.join(plugin, 'scripts/card-lint.js'), '--dir', cards]).stdout);
    assert.equal(lint.pass, true);
    const declarations = JSON.parse(fs.readFileSync(ledger)).declarations;
    for (const task of plan.tasks) {
      const declaration = declarations.find(d => d.agent === task.id);
      assert.deepEqual(declaration.write_scope, task.write_scope);
    }
    arms[label] = { cards_pass: true, spawn_passes: declarations.length, task_contracts_preserved: true };
  }
  const samples = [];
  for (let i = 0; i < 5; i++) {
    const output = path.join(temporary, `cli-${i}`);
    const start = performance.now();
    const result = run(process.execPath, [path.join(plugin, 'scripts/prepare-team.js'), '--input', planPath, '--out', output]);
    samples.push(performance.now() - start);
    assert.deepEqual(JSON.parse(result.stdout), candidate);
  }
  samples.sort((a, b) => a - b);
  console.log(JSON.stringify({ arms, repetitions: 5, full_prepare_cli_median_ms: samples[2],
    full_prepare_cli_samples_ms: samples, model_calls_for_candidate: 0 }, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
