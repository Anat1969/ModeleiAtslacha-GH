// Pure matching logic. No DOM, no storage, no text of its own: every word comes from data/models.json.
// match(data, answers) -> one of:
//   { status: 'incomplete', missing }
//   { status: 'clarify', conflicts }            answers contradict each other
//   { status: 'mismatch', state, failed }       no table row fits; never guess
//   { status: 'ok' | 'framing', state, primary, counter, notes, checks, fit }

export const QUESTION_KEYS = ['intent', 'cynefin', 'agreement', 'layer', 'unit', 'data'];

const fits = (when, answers) =>
  Object.entries(when || {}).every(([key, allowed]) => allowed.includes(answers[key]));

const findState = (data, id) => {
  const state = data.states.find((s) => s.id === id);
  if (!state) throw new Error(`Unknown state: ${id}`);
  return state;
};

export const findModel = (data, id) => {
  const model = data.models.find((m) => m.id === id);
  if (!model) throw new Error(`Unknown model: ${id}`);
  return model;
};

// Every criterion of a state, with what was answered and whether it passed.
function checksFor(state, answers, data) {
  const checks = [];
  if (state.intents.length) {
    checks.push({ key: 'intent', kind: 'intent', allowed: state.intents, value: answers.intent, pass: state.intents.includes(answers.intent) });
  }
  for (const [key, allowed] of Object.entries(state.requires || {})) {
    checks.push({ key, kind: 'requires', allowed, value: answers[key], pass: allowed.includes(answers[key]) });
  }
  for (const [key, allowed] of Object.entries(state.prefers || {})) {
    checks.push({ key, kind: 'prefers', allowed, value: answers[key], pass: allowed.includes(answers[key]) });
  }
  return checks;
}

function resolve(data, state, answers, notes, status) {
  const checks = checksFor(state, answers, data);
  const failed = checks.filter((c) => c.kind === 'requires' && !c.pass);
  if (failed.length) return { status: 'mismatch', state, failed, checks };

  for (const guard of state.guards || []) if (fits(guard.when, answers)) notes.push(guard.note);

  const fit = checks.length ? Math.round((100 * checks.filter((c) => c.pass).length) / checks.length) : 100;
  return {
    status: status || (state.framing ? 'framing' : 'ok'),
    state,
    primary: state.primary.map((id) => findModel(data, id)),
    counter: { model: findModel(data, state.counter.id), why: state.counter.why },
    notes,
    checks,
    fit,
  };
}

export function match(data, answers) {
  const missing = QUESTION_KEYS.filter((k) => !answers[k]);
  if (missing.length) return { status: 'incomplete', missing };

  const conflicts = data.contradictions.filter((c) => fits(c.when, answers));
  if (conflicts.length) return { status: 'clarify', conflicts };

  const notes = [];
  const { chaos, forceFraming } = data.rules;

  if (fits(chaos.when, answers)) {
    notes.push(chaos.note);
    return resolve(data, findState(data, chaos.state), answers, notes);
  }

  if (fits(forceFraming.when, answers)) {
    notes.push(forceFraming.note);
    return resolve(data, findState(data, forceFraming.state), answers, notes, 'framing');
  }

  let state = data.states.find((s) => s.intents.includes(answers.intent));
  if (!state) return { status: 'mismatch', state: null, failed: [{ key: 'intent', value: answers.intent, allowed: [] }] };

  for (const r of state.redirects || []) {
    if (fits(r.when, answers)) {
      notes.push(r.note);
      state = findState(data, r.to);
      break;
    }
  }
  return resolve(data, state, answers, notes);
}

// Lookups for the interface: label of an answer, in the words of the data file.
export function labelOf(data, key, value) {
  if (key === 'intent') return data.intents.find((i) => i.id === value)?.label ?? value;
  const q = data.questions.find((x) => x.id === key);
  return q?.options.find((o) => o.id === value)?.label ?? value;
}

export function titleOf(data, key) {
  if (key === 'intent') return 'מה המשימה';
  return data.questions.find((x) => x.id === key)?.title ?? key;
}
