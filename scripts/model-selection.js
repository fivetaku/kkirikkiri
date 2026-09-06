'use strict';

// Native Agent accepts aliases, not full IDs such as claude-fable-5-1[1m].
const MODELS = new Set(['opus', 'sonnet', 'haiku', 'fable']);
const isSupportedModel = model => MODELS.has(model);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && value.trim().length > 0;

// Exact coverage for plans/workflows; an individual spawn checks only its own ID.
// Availability is caller-supplied evidence, never inferred from supported aliases.
function validateSelection(selection, actual, exact = true) {
  const errors = [];
  if (!object(selection) || !object(selection.models) || !Object.keys(selection.models).length) {
    return ['model-selection: require a nonempty models object'];
  }
  if (Object.keys(selection).some(key => !['models', 'available_models', 'profile'].includes(key))) {
    errors.push('model-selection: unknown selection field');
  }
  if (Object.hasOwn(selection, 'profile') && typeof selection.profile !== 'string') {
    errors.push('model-selection: profile must be a string (informative only)');
  }
  const entries = Object.entries(selection.models);
  for (const [id, model] of entries) {
    if (!nonempty(id) || !isSupportedModel(model)) errors.push(`model-selection: invalid selected ID/model: ${JSON.stringify([id, model])}`);
  }
  if (Object.hasOwn(selection, 'available_models')) {
    const available = selection.available_models;
    if (!Array.isArray(available) || !available.every(isSupportedModel)) {
      errors.push('model-selection: available_models must be an array of supported native model aliases');
    } else {
      for (const [id, model] of entries) {
        if (!available.includes(model)) errors.push(`model-selection: ${id}: selected ${model} is absent from available_models`);
      }
    }
  }
  if (errors.length) return errors;
  const seen = new Set();
  for (const { id, model } of actual) {
    if (!nonempty(id) || !Object.hasOwn(selection.models, id)) {
      errors.push(`model-selection: unknown or missing selected ID: ${JSON.stringify(id)}`);
      continue;
    }
    seen.add(id);
    if (model !== selection.models[id]) {
      errors.push(`model-selection: ${id}: selected ${selection.models[id]}, actual ${JSON.stringify(model)}; selection must not be overridden`);
    }
  }
  if (exact) {
    for (const [id] of entries) {
      if (!seen.has(id)) errors.push(`model-selection: extra selected ID with no task/phase: ${id}`);
    }
  }
  return errors;
}

module.exports = { validateSelection, isSupportedModel };

// Trusted validator used by the Python spawn hook; stdin is data, not executable code.
if (require.main === module) {
  try {
    const { selection, id, model } = JSON.parse(require('node:fs').readFileSync(0, 'utf8'));
    const errors = validateSelection(selection, [{ id, model }], false);
    if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  } catch (error) {
    console.error(`model-selection: ${error.message}`);
    process.exitCode = 1;
  }
}
