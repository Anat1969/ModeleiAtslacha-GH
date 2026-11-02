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

// ---------- הצעת אבחון מתוך תיאור חופשי ----------
// מנוע מקומי ושקוף: לכל תשובה רשימת מילים בקובץ הנתונים (lexicon). מחזיר הצעה וגם את המילים שהובילו אליה.
// התאמה בעברית לפי סעיף 2.8 בסקיל העיצוב: בתחילת מילה, אחרי אותיות שימוש. מונח קצר (עד 3 אותיות) רק כמילה שלמה.
const PREFIX = /^[הובכלמש]{1,2}/;
const norm = (s) => String(s || '').replace(/[״"׳'`]/g, '').replace(/[^֐-׿a-zA-Z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
function termHits(text, term) {
  const t = norm(term);
  if (t.includes(' ')) return ` ${text} `.includes(` ${t}`) || ` ${text} `.includes(t) ? 1 : 0; // ביטוי של כמה מילים
  const words = text.split(' ');
  return words.filter((w) => {
    const forms = [w, w.replace(PREFIX, ''), w.slice(1)];
    return forms.some((f) => (t.length <= 3 ? f === t : f.startsWith(t)));
  }).length;
}
export function suggest(data, description) {
  const text = norm(description);
  const answers = {}, hits = {};
  if (!text || !data.lexicon) return { answers, hits };
  for (const [key, values] of Object.entries(data.lexicon)) {
    let best = null, bestScore = 0, tie = false;
    for (const [value, terms] of Object.entries(values)) {
      const found = terms.filter((t) => termHits(text, t) > 0);
      const score = found.length;
      if (score > bestScore) { best = { value, found }; bestScore = score; tie = false; } else if (score && score === bestScore) tie = true;
    }
    if (best && !tie) { answers[key] = best.value; hits[key] = best.found; }
  }
  return { answers, hits };
}

// השוואה בין ההצעה לבין מה שנבחר בפועל: כך המנוע מודד את האמינות של עצמו (סעיף 7 בהנחיות).
export function compareSuggestion(suggested, final) {
  const keys = Object.keys(suggested || {});
  const misses = keys.filter((k) => final[k] !== suggested[k]).map((k) => ({ key: k, suggested: suggested[k], chosen: final[k] }));
  return { total: keys.length, agree: keys.length - misses.length, misses };
}
