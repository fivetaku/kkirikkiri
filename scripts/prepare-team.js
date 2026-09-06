#!/usr/bin/env node
'use strict';
// Opt-in preparation pilot. Generates artifacts; never calls an agent or changes permissions.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { lintCard } = require('./card-lint.js');

const TOOLS = new Set(['Read', 'Grep', 'Glob', 'Write', 'Edit', 'Bash', 'WebSearch', 'WebFetch']);
const ARCHETYPES = new Set(['Builder', 'Writer', 'Designer', 'Researcher', 'Analyst', 'Critic']);
const TASK_KEYS = new Set(['id', 'role', 'archetype', 'domain', 'model', 'tools', 'write_scope',
  'stop', 'effort', 'instruction', 'acceptance_ids']);
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(value);
const text = value => typeof value === 'string' && value.trim().length > 0;
const oneLine = value => text(value) && !/[\r\n{},#]|TBD|TODO|미정|\{[A-Z_]+\}/.test(value);
const scope = value => typeof value === 'string'
  && /^(?:[A-Za-z0-9_.-]+\/)*[A-Za-z0-9_.-]+(?:\/\*\*)?$/.test(value)
  && !value.split('/').some(part => part === '.' || part === '..');

function prepare(plan) {
  const errors = [];
  if (!plan || plan.version !== 1 || plan.mode !== 'teams'
      || !identifier(plan.run_id) || !identifier(plan.session_id) || !identifier(plan.team_name)
      || !Number.isInteger(plan.revision) || plan.revision < 1
      || plan.approval?.mode !== 'teams' || plan.approval?.revision !== plan.revision) {
    errors.push('Require version 1 Teams record with run/session/team IDs and matching approval revision');
  }
  if (!Array.isArray(plan?.acceptance) || plan.acceptance.length === 0
      || !Array.isArray(plan?.tasks) || plan.tasks.length < 2 || plan.tasks.length > 6) {
    return { pass: false, errors: [...errors, 'Require acceptance criteria and 2-6 independent tasks'] };
  }
  const criteria = new Map();
  for (const criterion of plan.acceptance) {
    if (!identifier(criterion?.id) || !text(criterion.description) || criteria.has(criterion.id)) {
      errors.push('Acceptance IDs must be unique and have descriptions');
    } else criteria.set(criterion.id, criterion.description);
  }
  const names = new Set();
  const covered = new Set();
  const owned = [];
  let critics = 0;
  for (const task of plan.tasks) {
    if (!task || typeof task !== 'object' || Array.isArray(task)) {
      errors.push('Each task must be an object');
      continue;
    }
    if (Object.keys(task).some(key => !TASK_KEYS.has(key))) errors.push(`${task.id}: unsupported task fields; retain domain detail in instruction`);
    if (!identifier(task.id) || names.has(task.id)) errors.push('Task IDs must be unique');
    names.add(task.id);
    if (!oneLine(task.role) || !oneLine(task.domain) || !ARCHETYPES.has(task.archetype)
        || !['opus', 'sonnet', 'haiku'].includes(task.model) || !oneLine(task.effort)
        || !text(task.instruction) || !Number.isInteger(task.stop?.maxTurns)
        || task.stop.maxTurns < 1 || !oneLine(task.stop.done_when)) {
      errors.push(`${task.id}: explicit role/domain/model/effort/instruction/stop required`);
    }
    if (!Array.isArray(task.tools) || task.tools.length === 0 || !task.tools.every(tool => TOOLS.has(tool))
        || !Array.isArray(task.write_scope) || !task.write_scope.every(scope)) {
      errors.push(`${task.id}: unsupported tools or scope; use exact relative paths or directory/**`);
      continue;
    }
    const reviewer = task.archetype === 'Critic';
    if (reviewer) {
      critics++;
      if (task.write_scope.length || task.tools.some(tool => ['Write', 'Edit', 'Bash'].includes(tool))) {
        errors.push(`${task.id}: critic must be read-only without shell/write tools`);
      }
    } else if (task.tools.some(tool => ['Write', 'Edit', 'Bash'].includes(tool)) && task.write_scope.length === 0) {
      errors.push(`${task.id}: write-capable tools require an explicit scope`);
    }
    if (!Array.isArray(task.acceptance_ids) || task.acceptance_ids.length === 0
        || !task.acceptance_ids.every(id => criteria.has(id))) {
      errors.push(`${task.id}: unknown or missing acceptance IDs`);
    } else task.acceptance_ids.forEach(id => covered.add(id));
    for (const item of task.write_scope) {
      const prefix = item.replace(/\/\*\*$/, '');
      for (const previous of owned) {
        if (previous.id !== task.id && (prefix === previous.prefix
            || prefix.startsWith(previous.prefix + '/') || previous.prefix.startsWith(prefix + '/'))) {
          errors.push(`${task.id}: scope overlaps ${previous.id}: ${item}`);
        }
      }
      owned.push({ id: task.id, prefix });
    }
  }
  if (!critics || critics === plan.tasks.length) errors.push('Require producers and an independent read-only critic');
  if ([...criteria.keys()].some(id => !covered.has(id))) errors.push('Every acceptance criterion must be assigned');
  if (errors.length) return { pass: false, errors };

  const planHash = crypto.createHash('sha256').update(JSON.stringify(plan)).digest('hex');
  const cards = [];
  const requests = plan.tasks.map(task => {
    const readOnly = task.write_scope.length === 0 && !task.tools.some(tool => ['Write', 'Edit', 'Bash'].includes(tool));
    const criteriaText = task.acceptance_ids.map(id => `${id}: ${criteria.get(id)}`).join('\n');
    const prompt = [
      `Role: ${task.role} (${task.archetype}); domain: ${task.domain}`,
      `Run: ${plan.run_id}; session: ${plan.session_id}; revision: ${plan.revision}; plan: ${planHash}`,
      `tools: ${task.tools.join(', ')}`,
      `write_scope: ${JSON.stringify(task.write_scope)}${readOnly ? ' read-only' : ''}`,
      `stop: maxTurns ${task.stop.maxTurns}; done_when ${task.stop.done_when}`,
      `effort: ${task.effort}`,
      'These are declared task boundaries, not a filesystem sandbox. The host controls execution and acceptance.',
      'Do not delegate or start another team. Report partial work and actual verification evidence honestly.',
      '', task.instruction, '', 'Acceptance criteria:', criteriaText,
    ].join('\n');
    const card = [
      '---', `name: ${JSON.stringify(task.role)}`, `archetype: ${task.archetype}`,
      `domain: ${JSON.stringify(task.domain)}`, `team: ${plan.team_name}`, `model: ${task.model}`,
      `tools: [${task.tools.join(', ')}]`, `write_scope: [${task.write_scope.join(', ')}]`,
      `stop: {maxTurns: ${task.stop.maxTurns}, done_when: ${task.stop.done_when}}`,
      `effort: ${task.effort}`, `review_mode: ${readOnly}`, '---', '', prompt, '',
    ].join('\n');
    cards.push({ path: `agents/${task.id}.md`, content: card });
    return { task_id: task.id, tool: 'Agent', input: { description: task.id,
      subagent_type: 'general-purpose', model: task.model, prompt },
    contract: { tools: task.tools, write_scope: task.write_scope, stop: task.stop,
      effort: task.effort, acceptance_ids: task.acceptance_ids } };
  });
  for (const card of cards) {
    for (const violation of lintCard(card.path, card.content).violations) {
      errors.push(`${card.path}: ${violation.rule}: ${violation.msg}`);
    }
  }
  if (errors.length) return { pass: false, errors };
  return { pass: true, version: 1, run_id: plan.run_id, session_id: plan.session_id,
    revision: plan.revision, plan_sha256: planHash, permission_enforcement: 'declarations_only',
    team_binding: 'implicit-session', team_label: plan.team_name,
    stages: [
      { kind: 'produce', task_ids: plan.tasks.filter(task => task.archetype !== 'Critic').map(task => task.id) },
      { kind: 'review', task_ids: plan.tasks.filter(task => task.archetype === 'Critic').map(task => task.id) },
    ],
    requests, cards };
}

function main() {
  const args = process.argv.slice(2);
  const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  try {
    const input = option('--input'), output = option('--out');
    if (!input || !output) throw new Error('Usage: prepare-team.js --input plan.json --out NEW_DIRECTORY');
    const prepared = prepare(JSON.parse(fs.readFileSync(input, 'utf8')));
    if (!prepared.pass) { console.log(JSON.stringify(prepared)); return 1; }
    if (fs.existsSync(output)) throw new Error('Output directory already exists; prepare a new revision instead');
    fs.mkdirSync(output);
    fs.mkdirSync(path.join(output, 'agents'));
    for (const card of prepared.cards) fs.writeFileSync(path.join(output, card.path), card.content, { flag: 'wx' });
    fs.writeFileSync(path.join(output, 'launch.json'), JSON.stringify(prepared, null, 2) + '\n', { flag: 'wx' });
    console.log(JSON.stringify(prepared, null, 2));
    return 0;
  } catch (error) {
    console.log(JSON.stringify({ pass: false, errors: [error.message] }));
    return 1;
  }
}

module.exports = { prepare };
if (require.main === module) process.exitCode = main();
