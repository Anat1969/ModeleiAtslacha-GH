import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { match, findModel, QUESTION_KEYS, suggest, compareSuggestion } from '../src/matcher.js';

const data = JSON.parse(readFileSync(new URL('../data/models.json', import.meta.url), 'utf8'));

// ---------- Three real cases (CLAUDE.md, work order step 4) ----------

test('תכנון שכונה: בעלי עניין חלוקים, ציבור, שכבת אתר -> מסגור ולא פתרון', () => {
  const r = match(data, { intent: 'users', cynefin: 'complex', agreement: 'no', layer: 'site', unit: 'public', data: 'partial' });
  assert.equal(r.status, 'framing');
  assert.equal(r.state.id, 'wicked');
  assert.deepEqual(r.primary.map((m) => m.id), ['rittel-webber', 'arnstein']);
  assert.ok(r.notes.some((n) => n.includes('אין כאן פתרון')));
});

test('תקציב פרויקט: ארגון, מסובך, יש נתונים -> תחזית לפי מחלקת ייחוס', () => {
  const r = match(data, { intent: 'budget', cynefin: 'complicated', agreement: 'yes', layer: 'structure', unit: 'org', data: 'yes' });
  assert.equal(r.status, 'ok');
  assert.equal(r.state.id, 'reference-class');
  assert.equal(r.primary[0].id, 'reference-class');
  assert.equal(r.counter.model.id, 'premortem');
  assert.equal(r.notes.length, 0);
  assert.equal(r.fit, 100);
});

test('תקציב פרויקט בלי נתונים: אותו מודל, עם הוראה לבנות מחלקת ייחוס', () => {
  const r = match(data, { intent: 'budget', cynefin: 'complicated', agreement: 'yes', layer: 'structure', unit: 'org', data: 'none' });
  assert.equal(r.state.id, 'reference-class');
  assert.ok(r.notes.some((n) => n.includes('מחלקת ייחוס')));
  assert.ok(r.fit < 100);
});

test('שיתוף ציבור במרחב, הסכמה חלקית -> JTBD וקאנו, ומודל נגדי ארנשטיין', () => {
  const r = match(data, { intent: 'users', cynefin: 'complex', agreement: 'partial', layer: 'space', unit: 'public', data: 'partial' });
  assert.equal(r.status, 'ok');
  assert.equal(r.state.id, 'jtbd-kano');
  assert.deepEqual(r.primary.map((m) => m.id), ['jtbd', 'kano']);
  assert.equal(r.counter.model.id, 'arnstein');
});

// ---------- Rules ----------

test('תשובות סותרות -> בקשת הבהרה, לא ניחוש', () => {
  const r = match(data, { intent: 'tasks', cynefin: 'clear', agreement: 'no', layer: 'stuff', unit: 'person', data: 'yes' });
  assert.equal(r.status, 'clarify');
  const ids = r.conflicts.map((c) => c.id);
  assert.ok(ids.includes('clear-without-agreement'));
  assert.ok(ids.includes('person-without-agreement'));
});

test('אין התאמה בטבלה -> mismatch עם הקריטריון שנכשל', () => {
  const r = match(data, { intent: 'market', cynefin: 'clear', agreement: 'yes', layer: 'skin', unit: 'org', data: 'yes' });
  assert.equal(r.status, 'mismatch');
  assert.equal(r.state.id, 'five-forces');
  assert.deepEqual(r.failed.map((f) => f.key), ['cynefin']);
});

test('מצב כאוטי -> לייצב קודם, בכל משימה', () => {
  const r = match(data, { intent: 'goals', cynefin: 'chaotic', agreement: 'yes', layer: 'services', unit: 'team', data: 'none' });
  assert.equal(r.state.id, 'chaos');
  assert.equal(r.primary[0].id, 'cynefin');
});

test('אי-ודאות בשכבת מבנה -> אין ניסוי בטוח, מפנה למחלקת ייחוס', () => {
  const r = match(data, { intent: 'uncertainty', cynefin: 'complex', agreement: 'yes', layer: 'structure', unit: 'org', data: 'none' });
  assert.equal(r.state.id, 'reference-class');
  assert.ok(r.notes.some((n) => n.includes('אין ניסוי בטוח')));
});

test('אי-ודאות בשכבה מהירה -> ניסויים בטוחים לכישלון', () => {
  const r = match(data, { intent: 'uncertainty', cynefin: 'complex', agreement: 'yes', layer: 'stuff', unit: 'team', data: 'none' });
  assert.equal(r.state.id, 'cynefin-probes');
});

test('תשובות חסרות -> incomplete', () => {
  const r = match(data, { intent: 'tasks' });
  assert.equal(r.status, 'incomplete');
  assert.equal(r.missing.length, QUESTION_KEYS.length - 1);
});

test('הפונקציה טהורה: אותה תשובה לאותו קלט, והקלט לא משתנה', () => {
  const a = Object.freeze({ intent: 'complaints', cynefin: 'complicated', agreement: 'yes', layer: 'services', unit: 'org', data: 'yes' });
  assert.deepEqual(match(data, a).state.id, match(data, a).state.id);
});

// ---------- Every table row is reachable ----------

const reach = {
  eisenhower: { intent: 'tasks', cynefin: 'clear', agreement: 'yes', layer: 'stuff', unit: 'person', data: 'yes' },
  raci: { intent: 'roles', cynefin: 'complicated', agreement: 'yes', layer: 'services', unit: 'org', data: 'partial' },
  swot: { intent: 'strategy', cynefin: 'complicated', agreement: 'yes', layer: 'structure', unit: 'org', data: 'yes' },
  'five-forces': { intent: 'market', cynefin: 'complicated', agreement: 'yes', layer: 'skin', unit: 'org', data: 'yes' },
  'jtbd-kano': { intent: 'users', cynefin: 'complicated', agreement: 'yes', layer: 'services', unit: 'org', data: 'partial' },
  okr: { intent: 'goals', cynefin: 'complicated', agreement: 'yes', layer: 'space', unit: 'team', data: 'yes' },
  'reference-class': { intent: 'budget', cynefin: 'complex', agreement: 'yes', layer: 'site', unit: 'public', data: 'yes' },
  wicked: { intent: 'conflict', cynefin: 'complex', agreement: 'partial', layer: 'space', unit: 'public', data: 'partial' },
  'cynefin-probes': { intent: 'uncertainty', cynefin: 'complex', agreement: 'partial', layer: 'services', unit: 'team', data: 'none' },
  bloom: { intent: 'learning', cynefin: 'complicated', agreement: 'yes', layer: 'stuff', unit: 'team', data: 'partial' },
  kamiya: { intent: 'direction', cynefin: 'complex', agreement: 'partial', layer: 'site', unit: 'person', data: 'none' },
  pareto: { intent: 'complaints', cynefin: 'complicated', agreement: 'yes', layer: 'services', unit: 'org', data: 'yes' },
};

for (const [id, answers] of Object.entries(reach)) {
  test(`מצב ${id} ניתן להגעה`, () => assert.equal(match(data, answers).state.id, id));
}

test('12 מצבים מהטבלה, וכל אחד ניתן להגעה', () => {
  const fromTable = data.states.filter((s) => s.fromTable !== false).map((s) => s.id);
  assert.equal(fromTable.length, 12);
  assert.deepEqual([...fromTable].sort(), Object.keys(reach).sort());
});

// ---------- Data integrity: every model with its full source card ----------

const REQUIRED = ['id', 'name', 'nameEn', 'author', 'authorEn', 'context', 'assumption', 'problemTypes', 'layers', 'evidence', 'evidenceNote', 'misleading', 'misuse', 'control', 'sources'];

for (const m of data.models) {
  test(`כרטיס מקור מלא: ${m.id}`, () => {
    for (const k of REQUIRED) assert.ok(m[k] !== undefined && m[k] !== '', `${m.id}.${k}`);
    assert.ok(Object.keys(data.meta.evidenceLevels).includes(m.evidence), `${m.id} evidence`);
    assert.ok(m.sources.length >= 1 && m.sources.every((s) => s.text), `${m.id} sources`);
    if (m.attributedTo) assert.ok(m.correction, `${m.id}: ייחוס שגוי בלי תיקון`);
  });
}

test('כל מצב: מודל ראשי ונגדי קיימים, אזהרה, שלושה צעדים ושאלת בקרה', () => {
  for (const s of data.states) {
    s.primary.forEach((id) => findModel(data, id));
    findModel(data, s.counter.id);
    assert.ok(!s.primary.includes(s.counter.id), `${s.id}: מודל נגדי זהה לראשי`);
    assert.ok(s.warning, `${s.id} warning`);
    assert.equal(s.steps.length, 3, `${s.id} steps`);
    for (const id of s.primary) assert.ok(findModel(data, id).control, `${s.id} control`);
  }
});

test('כל ערך בתנאים קיים בשאלות', () => {
  const valid = Object.fromEntries(data.questions.map((q) => [q.id, q.options.map((o) => o.id)]));
  valid.intent = data.intents.map((i) => i.id);
  const all = [
    ...data.states.flatMap((s) => [s.requires, s.prefers, ...(s.guards || []).map((g) => g.when), ...(s.redirects || []).map((r) => r.when)]),
    ...data.contradictions.map((c) => c.when),
    data.rules.chaos.when,
    data.rules.forceFraming.when,
  ];
  for (const when of all) for (const [k, vals] of Object.entries(when || {})) for (const v of vals) assert.ok(valid[k]?.includes(v), `${k}=${v}`);
  for (const s of data.states) for (const i of s.intents) assert.ok(valid.intent.includes(i));
});

test('כל משימה מובילה למצב אחד בדיוק', () => {
  for (const i of data.intents) assert.equal(data.states.filter((s) => s.intents.includes(i.id)).length, 1, i.id);
});

test('תיקוני ייחוס מהמסמך: מאסלו ואיקיגאי', () => {
  const maslow = findModel(data, 'maslow');
  assert.equal(maslow.year, 1960);
  assert.match(maslow.authorEn, /McDermid/);
  assert.match(findModel(data, 'ikigai-kamiya').correction, /2014/);
});

test('הצלבה מול הדוח: SWOT מסטנפורד, מחלקת ייחוס חזקה, היל ווסטברוק 20 חברות', () => {
  assert.match(findModel(data, 'swot').authorEn, /Stewart/);
  assert.equal(findModel(data, 'reference-class').evidence, 'strong');
  assert.match(findModel(data, 'swot').evidenceNote, /20/);
  assert.equal(data.knowledge.connections.length, 3);
});

test('לכל מצב תשובות לדוגמה שמובילות אליו', () => {
  for (const st of data.states) assert.equal(match(data, st.sample).state.id, st.id, st.id);
});

// ---------- סדר הלמידה: כל מודל עם היכרות, הבנה ויישום ----------
for (const m of data.models) {
  test(`סדר הלמידה מלא: ${m.id}`, () => {
    assert.ok(m.definition && m.story && m.graphicNote, `${m.id}: הגדרה, סיפור, שרטוט`);
    assert.ok(m.insight.split(/\s+/).length <= 8, `${m.id}: תובנה עד 8 מילים`);
    assert.equal(m.haiku.length, 3, `${m.id}: הייקו בשלוש שורות`);
    assert.ok(m.demo.frames.length >= 3, `${m.id}: הדגמה של 3 שלבים לפחות`);
    assert.equal(m.examples.length, 2, `${m.id}: שתי דוגמאות`);
    assert.ok(Array.isArray(m.applied), `${m.id}: רשימת יישומים (גם ריקה)`);
    assert.ok(data.categories.some((c) => c.id === m.category), `${m.id}: תחום קיים`);
    assert.ok(m.agreementFit.length >= 1, `${m.id}: טווח הסכמה למיקום היחסי`);
  });
}
test('כל תחום עם מודל אחד לפחות ותובנה קצרה', () => {
  for (const c of data.categories) {
    assert.ok(data.models.some((m) => m.category === c.id), c.id);
    assert.ok(c.insight.split(/\s+/).length <= 8, `${c.id}: תובנה עד 8 מילים`);
  }
});

test('פוסט לכל מודל: 80 עד 150 מילים, ומסתיים בשאלה', () => {
  for (const m of data.models) {
    const w = m.post.split(/\s+/).length;
    assert.ok(w >= 80 && w <= 150, `${m.id}: ${w} מילים`);
    assert.ok(m.post.trim().endsWith('?'), `${m.id}: מסתיים בשאלה`);
    assert.ok(!/#/.test(m.post), `${m.id}: בלי האשטגים`);
  }
});

// ---------- הצעת אבחון מתוך תיאור חופשי ----------
test('הצעה: תכנון שכונה עם התנגדות -> מחלוקת, אתר, ציבור', () => {
  const r = suggest(data, 'תכנון שכונה חדשה: התושבים חלוקים על התוכנית, יש התנגדות לבנייה על המגרש, ויש לנו מעט נתונים');
  assert.equal(r.answers.agreement, 'no');
  assert.equal(r.answers.layer, 'site');
  assert.equal(r.answers.unit, 'public');
  assert.ok(r.hits.agreement.includes('התנגדות'), 'מראה את המילה שהובילה להצעה');
});
test('הצעה: תקציב לקו רכבת בעירייה -> תקציב, מבנה, ארגון, יש נתונים', () => {
  const r = suggest(data, 'תקציב ולוח זמנים להקמת קו רכבת קלה בעירייה. יש נתונים מפרויקטים בערים אחרות');
  assert.deepEqual([r.answers.intent, r.answers.layer, r.answers.unit, r.answers.data], ['budget', 'structure', 'org', 'yes']);
});
test('הצעה: שיתוף ציבור בכיכר -> צורכי משתמשים, חלוקת חלל, ציבור', () => {
  const r = suggest(data, 'שיתוף ציבור בתכנון הכיכר: מה התושבים צריכים מהמרחב');
  assert.deepEqual([r.answers.intent, r.answers.layer, r.answers.unit], ['users', 'space', 'public']);
});
test('הצעה: מילה קצרה רק כמילה שלמה, ותיאור ריק לא מציע', () => {
  assert.equal(suggest(data, 'אניסון ותיאוריה').answers.unit, undefined, '"אני" לא נתפס בתוך מילה אחרת');
  assert.deepEqual(suggest(data, '').answers, {});
});
test('כל ערך במילון הוא תשובה קיימת', () => {
  const valid = Object.fromEntries(data.questions.map((q) => [q.id, q.options.map((o) => o.id)]));
  valid.intent = data.intents.map((i) => i.id);
  for (const [k, vals] of Object.entries(data.lexicon)) for (const v of Object.keys(vals)) assert.ok(valid[k]?.includes(v), `${k}=${v}`);
});

test('השוואת הצעה לבחירה: כמה צדקה, ואיפה תוקנה', () => {
  const r = compareSuggestion({ agreement: 'no', layer: 'site', unit: 'public' }, { agreement: 'no', layer: 'space', unit: 'public', data: 'yes' });
  assert.equal(r.total, 3);
  assert.equal(r.agree, 2);
  assert.deepEqual(r.misses, [{ key: 'layer', suggested: 'site', chosen: 'space' }]);
  assert.deepEqual(compareSuggestion({}, { layer: 'site' }), { total: 0, agree: 0, misses: [] });
});
