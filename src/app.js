// מתאם מודלים: ממשק. כל הטקסט התוכני מגיע מ-data/models.json, וההתאמה מ-matcher.js.
import { match, findModel, labelOf, titleOf, QUESTION_KEYS } from './matcher.js';

const LOG_KEY = 'matcher.log.v1';
const DRAFT_KEY = 'matcher.draft.v1';
const app = document.getElementById('app');
let DATA = null;

// ---------- טקסט עשיר: **מודגש**, ==תובנה==, מספרים אוטומטיים, לועזית משנית ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function rich(text) {
  let h = esc(text)
    .replace(/\*\*(.+?)\*\*( [A-Z][A-Za-z'’\-]*(?: [A-Z][A-Za-z'’\-]*)*)?/g, (_, b, en) => `<strong>${b}</strong>${en ? ` <span class="latin">${en.trim()}</span>` : ''}`)
    .replace(/==(.+?)==/g, '<mark class="insight">$1</mark>')
    .replace(/\(([A-Z][^()]*)\)/g, '<span class="latin paren">($1)</span>');
  return h.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : part.replace(/(\d+(?:[.,/–-]\d+)*%?)/g, '<span class="num">$1</span>'))).join('');
}
// כל משפט בשורה חדשה
const lines = (text) => String(text ?? '').split(/(?<=[.?!])\s+(?=[֐-׿"״(])/).map((s) => `<span class="line">${rich(s)}</span>`).join('');

// ---------- ניתוב hash: המצב כולו בכתובת ----------
function parseRoute() {
  const [path, query = ''] = location.hash.replace(/^#\/?/, '').split('?');
  return { parts: (path || '').split('/').filter(Boolean), params: Object.fromEntries(new URLSearchParams(query)) };
}
const href = (page, params) => {
  const q = params && Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
  return `#/${page}${q}`;
};
const answersFrom = (params) => Object.fromEntries(QUESTION_KEYS.filter((k) => params[k]).map((k) => [k, params[k]]));

// ---------- אחסון מקומי, עמיד לכשל ----------
const store = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } },
};
function flashSaved() {
  document.querySelectorAll('.saved').forEach((el) => { el.classList.add('show'); clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 1600); });
  const menu = document.querySelector('ai-menu');
  if (menu) menu.status = 'נשמר';
}

// ---------- רכיבים ----------
const evidence = (level) => {
  const l = DATA.meta.evidenceLevels[level];
  return `<span class="ev" data-level="${level}" title="${esc(l.hint)}"><span class="ev-bar" aria-hidden="true"><i></i><i></i><i></i><i></i></span>${esc(l.label)}</span>`;
};
const yearOf = (m) => (m.year ? `<span class="num">${m.year}</span>` : '<span class="muted">שנה לא ידועה</span>');
const crumbs = (items) => `<nav class="crumbs" aria-label="פירורי לחם">${items.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : esc(t))).join(' / ')}</nav>`;

function modelCard(m, role, why) {
  const isCounter = role === 'counter';
  return `<article class="card model-card ${isCounter ? 'counter' : ''} rise">
    <span class="role">${isCounter ? 'מודל נגדי' : 'מודל ראשי'}</span>
    <h3>${esc(m.name)}</h3><span class="latin" style="display:block;margin-bottom:4px">${esc(m.nameEn)}</span>
    ${isCounter ? `<p class="small" style="margin:6px 0 0">${lines(why)}</p>` : ''}
    <div class="facts">
      <div><span class="label">מקור אמיתי</span><div><strong>${esc(m.author)}</strong> <span class="latin">${esc(m.authorEn)}</span></div></div>
      <div><span class="label">שנה</span><div>${yearOf(m)}</div></div>
      <div><span class="label">רמת ראיות</span><div>${evidence(m.evidence)}</div></div>
    </div>
    ${m.correction ? `<div class="tone tone-insight correction"><h4>תיקון ייחוס</h4><p>${m.attributedTo ? `<span class="was">${rich(m.attributedTo)}</span><br>` : ''}${lines(m.correction)}</p></div>` : ''}
    <span class="label">הנחת יסוד סמויה</span>
    <p style="margin:0 0 10px;font-size:14.5px">${lines(m.assumption)}</p>
    <a class="press btn btn-quiet" href="${href('model/' + m.id)}">כרטיס המקור המלא</a>
  </article>`;
}

// ---------- מפת המפתח: שלושה מקרים אמיתיים, מסלול שנמשך דרך חמש השאלות ----------
const CASES = [
  { id: 'neighborhood', label: 'תכנון שכונה', answers: { intent: 'users', cynefin: 'complex', agreement: 'no', layer: 'site', unit: 'public', data: 'partial' } },
  { id: 'budget', label: 'תקציב פרויקט', answers: { intent: 'budget', cynefin: 'complicated', agreement: 'yes', layer: 'structure', unit: 'org', data: 'yes' } },
  { id: 'participation', label: 'שיתוף ציבור', answers: { intent: 'users', cynefin: 'complex', agreement: 'partial', layer: 'space', unit: 'public', data: 'partial' } },
];

function keyMap(caseId) {
  const c = CASES.find((x) => x.id === caseId) || CASES[0];
  const r = match(DATA, c.answers);
  const qs = DATA.questions;
  const W = 760, colW = 124, top = 46, rowH = 34;
  const xOf = (i) => W - 16 - i * colW; // מימין לשמאל
  const pts = [];
  let svg = '';
  qs.forEach((q, i) => {
    const x = xOf(i);
    svg += `<text class="col-txt" x="${x}" y="22" text-anchor="end">${esc(q.title)}</text>`;
    q.options.forEach((o, j) => {
      const y = top + 12 + j * rowH;
      const on = c.answers[q.id] === o.id;
      if (on) pts.push([x - 6, y]);
      svg += `<circle class="opt-dot ${on ? 'on' : ''}" cx="${x - 6}" cy="${y}" r="6"></circle>`;
      svg += `<text class="opt-txt ${on ? 'on' : ''}" x="${x - 18}" y="${y + 4}" text-anchor="end">${esc(o.label)}</text>`;
    });
  });
  const rx = 4, ry = 112, rw = 140, rh = 84;
  pts.push([rx + rw, ry + rh / 2]);
  const d = pts.map(([x, y], i) => (i ? `C ${pts[i - 1][0] - 60} ${pts[i - 1][1]}, ${x + 60} ${y}, ${x} ${y}` : `M ${x} ${y}`)).join(' ');
  const res = r.primary.map((m) => m.name).join(' + ');
  svg = `<path class="path draw" d="${d}"></path>` + svg;
  svg += `<rect class="res-box" x="${rx}" y="${ry}" width="${rw}" height="${rh}"></rect>`;
  const resLines = res.length > 16 ? r.primary.map((m) => m.name) : [res];
  resLines.forEach((t, i) => { svg += `<text class="res-txt" x="${rx + rw - 12}" y="${ry + 26 + i * 18}" text-anchor="end">${esc(t)}</text>`; });
  svg += `<text class="res-sub" x="${rx + rw - 12}" y="${ry + rh - 12}" text-anchor="end">${r.status === 'framing' ? 'תהליך מסגור, לא פתרון' : 'מודל מומלץ'}</text>`;
  const compact = `<ol class="keylist">${qs.map((q) => `<li><span class="label">${esc(q.title)}</span><strong>${esc(labelOf(DATA, q.id, c.answers[q.id]))}</strong></li>`).join('')}<li class="kl-res"><span class="label">${r.status === 'framing' ? 'תהליך מסגור, לא פתרון' : 'מודל מומלץ'}</span><strong>${esc(res)}</strong></li></ol>`;
  return compact + `<svg viewBox="0 0 ${W} 270" role="img" aria-label="מסלול האבחון במקרה ${esc(c.label)}: ${esc(res)}">${svg}</svg>`;
}

// ---------- דפים ----------
function home(params) {
  const models = DATA.models;
  const wrong = models.filter((m) => m.attributedTo).length;
  const log = store.get(LOG_KEY, []);
  const changed = log.filter((e) => e.changed === 'yes').length;
  const caseId = params.case || 'neighborhood';
  const quoteModel = findModel(DATA, DATA.knowledge.quoteModel);
  const k = DATA.knowledge;
  return `
  <section class="hero">
    <div class="rise">
      <div class="hero-num"><span class="big">${wrong}/${models.length}</span><span class="muted">מודלים מיוחסים לאדם הלא נכון</span></div>
      <h1>בוחרים כלי חשיבה לפי הבעיה, לא לפי הפופולריות.</h1>
      <p class="page-sub">${lines('חמש שאלות אבחון מזהות את סוג הבעיה. אחריהן מקבלים מודל ראשי, מודל נגדי, תווית אזהרה ושלושה צעדים. כל מודל מוצג עם **מקורו האמיתי** ועם **רמת הראיות** שלו.')}</p>
      <div class="row"><a class="press btn btn-main" href="${href('diagnose', { step: 0 })}">להתחיל אבחון</a><a class="press btn" href="${href('library')}">לספריית המודלים</a></div>
    </div>
    <div class="card keymap rise" style="animation-delay:.1s">
      <span class="label">מפתח זיהוי: מסלול מקרה אמיתי</span>
      <div class="chips" role="group" aria-label="בחירת מקרה">${CASES.map((c) => `<button class="chip" data-case="${c.id}" aria-pressed="${c.id === caseId}">${esc(c.label)}</button>`).join('')}</div>
      <div id="keymap">${keyMap(caseId)}</div>
      <div class="legend"><span class="lg-path">מסלול האבחון</span><span class="lg-on">התשובה שנבחרה</span><span class="lg-off">תשובה אפשרית</span><span class="lg-res">התוצאה</span></div>
    </div>
  </section>

  <h2 class="section-title">הבעיה, הפתרון והתובנה</h2>
  <div class="grid-3">
    <div class="tone tone-problem rise"><h3>הבעיה</h3><p>${lines('בוחרים מודל כי הוא מוכר. SWOT לכל שאלה, פירמידה לכל צורך.')}</p></div>
    <div class="tone tone-solution rise" style="animation-delay:.05s"><h3>הפתרון</h3><p>${lines('מאבחנים קודם: סוג הבעיה, הסכמה, שכבת זמן, מי מחליט ומה ידוע. רק אז בוחרים.')}</p></div>
    <div class="tone tone-insight rise" style="animation-delay:.1s"><h3>התובנה</h3><p>${lines(`==${k.insight}==`)}</p></div>
  </div>

  <h2 class="section-title">מפת האפליקציה</h2>
  <div class="grid-3">
    <a class="card press map-card" href="${href('diagnose', { step: 0 })}"><span class="k">5</span><h3>אבחון</h3><p class="small muted">${lines('חמש שאלות סגורות. סתירה מובילה לשאלת הבהרה, לא לניחוש.')}</p></a>
    <a class="card press map-card" href="${href('library')}"><span class="k">${models.length}</span><h3>ספריית מודלים</h3><p class="small muted">${lines('כרטיס מקור לכל מודל: מי, מתי, הנחת יסוד, ראיות ושימוש שגוי.')}</p></a>
    <a class="card press map-card" href="${href('log')}"><span class="k">${log.length}</span><h3>יומן החלטות</h3><p class="small muted">${lines(log.length ? `המודל שינה החלטה ב-${changed} מתוך ${log.length} פעמים.` : 'כאן נשמרת התשובה לשאלה: האם המודל שינה החלטה?')}</p></a>
  </div>

  <h2 class="section-title">על מה הכלי נשען, ואיך הוא מודד את עצמו</h2>
  <div class="grid-2">
    <div class="card"><span class="label">ארבעה עוגנים</span>
      <p style="margin:0">${lines('**Cynefin** לסוג הבעיה (Kurtz & Snowden, 2003). **בעיות מרושעות** להגדרה המוסכמת (Rittel & Webber, 1973). **שכבות הגזירה** לזמן (Duffy, 1990; Brand, 1994). **המבט מבחוץ** לנתונים (Kahneman & Tversky, 1979).')}</p></div>
    <div class="card"><span class="label">שלוש מדידות של אמינות</span>
      <p style="margin:0">${lines('לכל מודל **רמת ראיות** בארבע דרגות. טבלת ההתאמה מסומנת כ**הערכה**, לא כתוצאה מבוקרת. שאלת הבקרה שומרת **כמה החלטות השתנו**, וזה המדד של הכלי עצמו.')}</p></div>
  </div>

  <h2 class="section-title">מתוך המקורות</h2>
  <div class="grid-2">
    <figure class="card" style="margin:0">
      <span class="label">ציטוט · תרגום</span>
      <blockquote class="quote"><strong>${esc(quoteModel.quote.he)}</strong></blockquote>
      <div class="quote-en">${esc(quoteModel.quote.en)}</div>
      <figcaption class="src" style="margin-top:8px">${esc(quoteModel.quote.by)}, Policy Sciences</figcaption>
    </figure>
    <div class="card"><span class="label">הייקו</span>
      <p class="haiku">${k.haiku.map((l) => `<span class="line">${esc(l)}</span>`).join('')}</p>
      <p class="src" style="margin:8px 0 0">${esc(k.haikuNote)}</p></div>
  </div>
  <p class="notice">${esc(DATA.meta.tableNotice)}<br>${esc(k.inspiration)}</p>`;
}

const STEPS = QUESTION_KEYS;

function keyPath(answers, step) {
  return `<nav class="keypath" aria-label="התקדמות האבחון">${STEPS.map((k, i) => {
    const done = !!answers[k];
    return `<a class="kp ${done ? 'done' : ''} ${i === step ? 'now' : ''}" href="${href('diagnose', { ...answers, step: i })}" ${i === step ? 'aria-current="step"' : ''}>${esc(titleOf(DATA, k))}<b>${done ? esc(labelOf(DATA, k, answers[k])) : '&nbsp;'}</b></a>`;
  }).join('')}</nav>`;
}

function isoStack(selected, answers) {
  const q = DATA.questions.find((x) => x.id === 'layer');
  const n = q.options.length;
  const w = 170, d = 50, h = 18, step = 46, x0 = 16;
  let svg = '';
  // מציירים מלמטה למעלה: אתר בתחתית, תכולה בראש
  q.options.forEach((o, k) => {
    const i = n - 1 - k;
    const y = 20 + i * step;
    const on = o.id === selected;
    const top = on ? '#3C4A6B' : '#E8EBF2', front = on ? '#1F2A44' : '#D3D8E4', side = on ? '#2B3758' : '#BCC3D4';
    const p = (pts) => pts.map((v) => v.join(',')).join(' ');
    const A = [x0, y + d / 2], B = [x0 + w / 2, y], C = [x0 + w, y + d / 2], D = [x0 + w / 2, y + d];
    svg += `<g class="slab ${on ? 'on' : ''}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${esc(o.label)}, ${esc(o.years)}" data-href="${href('diagnose', { ...answers, layer: o.id, step: 4 })}">
      <polygon points="${p([A, D, [D[0], D[1] + h], [A[0], A[1] + h]])}" fill="${front}"></polygon>
      <polygon points="${p([D, C, [C[0], C[1] + h], [D[0], D[1] + h]])}" fill="${side}"></polygon>
      <polygon points="${p([A, B, C, D])}" fill="${top}" stroke="#fff" stroke-width="1"></polygon>
      <line x1="${x0 + w + 4}" y1="${y + d / 2}" x2="${x0 + w + 14}" y2="${y + d / 2}" stroke="#BCC3D4"></line>
      <text class="lbl" direction="rtl" text-anchor="end" x="${x0 + w + 18}" y="${y + d / 2 + 2}">${esc(o.label)}</text>
      <text class="yr" direction="rtl" text-anchor="end" x="${x0 + w + 18}" y="${y + d / 2 + 17}">${esc(o.years)}</text>
    </g>`;
  });
  const H = 20 + (n - 1) * step + d + h + 10;
  return `<div class="iso card"><span class="label">שש השכבות: אתר בתחתית, תכולה בראש</span><svg viewBox="0 0 330 ${H}" aria-label="שכבות הגזירה של בניין">${svg}</svg><p class="src" style="margin:4px 0 0">Brand, 1994</p></div>`;
}

function diagnose(params) {
  const answers = answersFrom(params);
  const step = Math.max(0, Math.min(STEPS.length - 1, Number(params.step) || 0));
  const key = STEPS[step];
  const draft = store.get(DRAFT_KEY, '');
  let head, body;
  if (key === 'intent') {
    head = `<div class="q-head"><span class="step">שלב 0 מתוך 5</span><h1>מה המשימה שלפנייך?</h1><p class="q-insight">המשימה בוחרת מועמד. חמש השאלות בודקות אותו.</p></div>`;
    body = `<label class="label" for="desc" style="margin-top:16px">תיאור הבעיה במשפט אחד (לא חובה, נשמר ביומן)</label>
      <textarea id="desc" class="field" placeholder="למשל: תושבי הרובע חלוקים על תוכנית ההתחדשות">${esc(draft)}</textarea>
      <span class="saved" aria-live="polite">נשמר</span>
      <div class="options">${DATA.intents.map((o) => option(o, answers.intent === o.id, { ...answers, intent: o.id, step: 1 })).join('')}</div>`;
  } else {
    const q = DATA.questions.find((x) => x.id === key);
    head = `<div class="q-head"><span class="step">שאלה ${q.step} מתוך 5</span><h1>${esc(q.title)}</h1><p class="q-insight">${rich(q.insight)}</p><p class="muted" style="margin:0">${lines(q.explain)} <span class="src">${esc(q.source)}</span></p></div>`;
    const next = step + 1 < STEPS.length ? { step: step + 1 } : {};
    const target = (o) => (step + 1 < STEPS.length ? href('diagnose', { ...answers, [key]: o.id, ...next }) : href('result', { ...answers, [key]: o.id }));
    const opts = `<div class="options">${q.options.map((o) => option(o, answers[key] === o.id, null, target(o))).join('')}</div>`;
    body = key === 'layer' ? `<div class="layer-wrap">${opts}${isoStack(answers.layer, answers)}</div>` : opts;
  }
  const done = QUESTION_KEYS.every((k) => answers[k]);
  return `${crumbs([['בית', '#/'], ['אבחון', null]])}${keyPath(answers, step)}${head}${body}
    <div class="nav-row">
      ${step > 0 ? `<a class="press btn" href="${href('diagnose', { ...answers, step: step - 1 })}">הקודם</a>` : '<span></span>'}
      ${done ? `<a class="press btn btn-main" href="${href('result', answers)}">לתוצאה</a>` : ''}
    </div>`;
}

function option(o, on, params, url) {
  const link = url || href('diagnose', params);
  return `<a class="press opt" href="${link}" aria-pressed="${on}" role="button"><b>${esc(o.label)}</b>${o.years ? `<span class="yrs">${esc(o.years)}</span>` : ''}<span>${esc(o.hint)}</span></a>`;
}

function answersBar(answers) {
  return `<div class="answers">${QUESTION_KEYS.map((k, i) => `<a class="press" href="${href('diagnose', { ...answers, step: i })}"><span class="label">${esc(titleOf(DATA, k))}</span>${esc(labelOf(DATA, k, answers[k]))}</a>`).join('')}</div>`;
}

function result(params) {
  const answers = answersFrom(params);
  const r = match(DATA, answers);
  const base = crumbs([['בית', '#/'], ['אבחון', href('diagnose', { ...answers, step: 0 })], ['תוצאה', null]]);

  if (r.status === 'incomplete') {
    return `${base}<div class="card empty"><h1 class="page-title">חסרות תשובות</h1><p>${lines(`חסרות ${r.missing.length} תשובות. בלי כולן אין אבחון.`)}</p><a class="press btn btn-main" href="${href('diagnose', { ...answers, step: QUESTION_KEYS.indexOf(r.missing[0]) })}">להשלים</a></div>`;
  }
  if (r.status === 'clarify') {
    return `${base}<h1 class="page-title">התשובות סותרות זו את זו.</h1><p class="page-sub">האפליקציה לא מנחשת. בחרי מה נכון, והאבחון ימשיך.</p>
      <div class="stack">${r.conflicts.map((c) => `<div class="tone tone-problem rise"><h3>${rich(c.question)}</h3><p>${lines(c.message)}</p>
        <div class="row" style="margin-top:10px">${c.ask.map((k) => `<a class="press btn btn-quiet" href="${href('diagnose', { ...answers, step: QUESTION_KEYS.indexOf(k) })}">לשנות: ${esc(titleOf(DATA, k))}</a>`).join('')}</div></div>`).join('')}</div>
      <h2 class="section-title">התשובות שנבחרו</h2>${answersBar(answers)}`;
  }
  if (r.status === 'mismatch') {
    const f = r.failed;
    return `${base}<h1 class="page-title">אין התאמה בטבלה לשילוב הזה.</h1><p class="page-sub">${lines('האפליקציה לא מנחשת. אחד הקריטריונים של המצב הקרוב לא מתקיים.')}</p>
      ${r.state ? `<div class="tone tone-neutral"><h3>המצב הקרוב: ${esc(r.state.title)}</h3><p>${f.map((x) => `<span class="line">${esc(titleOf(DATA, x.key))}: נבחר <strong>${esc(labelOf(DATA, x.key, x.value))}</strong>, והמצב דורש ${x.allowed.map((v) => `<strong>${esc(labelOf(DATA, x.key, v))}</strong>`).join(' או ')}.</span>`).join('')}</p>
      <div class="row" style="margin-top:10px">${f.map((x) => `<a class="press btn btn-quiet" href="${href('diagnose', { ...answers, step: QUESTION_KEYS.indexOf(x.key) })}">לשנות: ${esc(titleOf(DATA, x.key))}</a>`).join('')}</div></div>` : ''}
      <h2 class="section-title">התשובות שנבחרו</h2>${answersBar(answers)}`;
  }

  const s = r.state;
  const lead = r.primary[0];
  const log = store.get(LOG_KEY, []);
  const sig = JSON.stringify(answers);
  const entry = log.find((e) => e.sig === sig);
  const checkRow = (c) => `<tr><td>${esc(titleOf(DATA, c.key))}</td><td><strong>${esc(labelOf(DATA, c.key, c.value))}</strong></td><td>${c.kind === 'requires' ? 'תנאי חובה' : c.kind === 'intent' ? 'משימה' : 'העדפה'}</td><td class="${c.pass ? 'ok-t' : c.kind === 'prefers' ? 'soft-t' : 'no-t'}">${c.pass ? 'מתאים' : c.kind === 'intent' ? 'הוחלפה במסגור' : 'חלקי'}</td></tr>`;

  return `${base}
  <div class="result-head">
    <div><span class="label">מצב מאובחן${s.fromTable === false ? ' · נוסף לטבלה כמצב חירום' : ''}</span>
      <h1 class="page-title">${rich(s.insight)}</h1>
      <p class="page-sub" style="margin-bottom:0"><strong>${esc(s.title)}</strong></p></div>
    <div class="fit card"><span class="num">${r.fit}%</span><small>התאמה לקריטריונים</small></div>
  </div>
  ${r.status === 'framing' ? `<div class="tone tone-insight" style="margin-top:20px"><h3>אין כאן פתרון. יש תהליך מסגור.</h3><p>${lines('בבעיה מרושעת כל הגדרה היא עמדה. המטרה היא סבב שיפור מוסכם, לא תשובה סופית.')}</p></div>` : ''}
  ${r.notes.filter((n) => r.status !== 'framing' || !n.includes('אין כאן פתרון')).map((n) => `<div class="tone tone-neutral" style="margin-top:12px"><p>${lines(n)}</p></div>`).join('')}

  <h2 class="section-title">המודלים</h2>
  <div class="grid-2">${r.primary.map((m) => modelCard(m, 'primary')).join('')}${modelCard(r.counter.model, 'counter', r.counter.why)}</div>

  <h2 class="section-title">אזהרה ויישום</h2>
  <div class="grid-2">
    <div class="tone tone-problem"><h3>תווית אזהרה</h3><p>${lines(s.warning)}</p><p class="small" style="margin-top:8px">${lines('**תנאים מטעים:** ' + lead.misleading)}</p></div>
    <div class="tone tone-solution"><h3>שלושה צעדי יישום</h3><ol>${s.steps.map((x) => `<li>${rich(x)}</li>`).join('')}</ol></div>
  </div>
  <div class="card" style="margin-top:16px"><span class="label">דוגמה מהעיר</span><p style="margin:0">${rich(s.example)}</p></div>

  <h2 class="section-title">שאלת בקרה</h2>
  <div class="card" id="control">
    <p style="margin:0 0 6px;font-size:16px"><strong>${esc(lead.control)}</strong></p>
    <p style="margin:0;font-size:18px">${rich('==האם המודל שינה החלטה?==')}</p>
    <div class="decide" role="group" aria-label="האם המודל שינה החלטה">
      ${[['yes', 'כן, שינה'], ['partial', 'חלקית'], ['no', 'לא שינה']].map(([v, t]) => `<button class="press btn" data-changed="${v}" aria-pressed="${entry?.changed === v}">${t}</button>`).join('')}
    </div>
    <label class="label" for="note">מה השתנה, או למה לא</label>
    <textarea id="note" class="field" placeholder="משפט אחד ליומן">${esc(entry?.note || '')}</textarea>
    <span class="saved" aria-live="polite">נשמר</span>
  </div>

  <h2 class="section-title">איך הכלי חשב</h2>
  <div class="card table-scroll">
    <table class="checks"><thead><tr><th>שאלה</th><th>תשובה</th><th>סוג קריטריון</th><th>תוצאה</th></tr></thead><tbody>${r.checks.map(checkRow).join('')}</tbody></table>
    <p class="src" style="margin:10px 0 0">${lines('אחוז ההתאמה הוא חלק הקריטריונים שהתקיימו מתוך כל הקריטריונים של המצב. תנאי חובה שלא מתקיים עוצר את ההמלצה.')}</p>
  </div>
  <h2 class="section-title">התשובות שנבחרו</h2>${answersBar(answers)}
  <p class="notice">${esc(DATA.meta.tableNotice)}<br>${esc(DATA.meta.sourcesNotice)}</p>`;
}

function library(params) {
  const levels = Object.keys(DATA.meta.evidenceLevels);
  const sel = levels.includes(params.ev) ? params.ev : null;
  const shown = DATA.models.filter((m) => !sel || m.evidence === sel);
  const count = (l) => DATA.models.filter((m) => m.evidence === l).length;
  return `${crumbs([['בית', '#/'], ['ספרייה', null]])}
  <h1 class="page-title">כל מודל עם מקורו האמיתי.</h1>
  <p class="page-sub">${lines(`**${DATA.models.filter((m) => m.attributedTo).length}** מתוך **${DATA.models.length}** המודלים מיוחסים בדרך כלל לאדם אחר. התיקון מופיע בכרטיס.`)}</p>
  <div class="chips" role="group" aria-label="סינון לפי רמת ראיות" style="margin-bottom:16px">
    <button class="chip" data-ev="" aria-pressed="${!sel}">הכול<span class="num">${DATA.models.length}</span></button>
    ${levels.map((l) => `<button class="chip" data-ev="${l}" aria-pressed="${sel === l}">${esc(DATA.meta.evidenceLevels[l].label)}<span class="num">${count(l)}</span></button>`).join('')}
  </div>
  ${sel ? `<p class="small muted" style="margin:-8px 0 16px">${esc(DATA.meta.evidenceLevels[sel].hint)}</p>` : ''}
  <div class="grid-3">${shown.map((m, i) => `<a class="card press lib-card rise" style="animation-delay:${i * 0.03}s" href="${href('model/' + m.id)}">
    <span class="yr">${m.year ? m.year : ''}</span>
    <h3>${esc(m.name)}</h3><span class="latin">${esc(m.nameEn)}</span>
    <p><strong>${esc(m.author)}</strong></p>
    <div style="margin-top:8px">${evidence(m.evidence)}</div>
    ${m.attributedTo ? '<span class="flag-wrong">ייחוס נפוץ שגוי, ראו תיקון</span>' : ''}
  </a>`).join('')}</div>`;
}

function modelPage(id) {
  const m = DATA.models.find((x) => x.id === id);
  if (!m) return `<div class="card empty"><h1 class="page-title">המודל לא נמצא.</h1><p>ייתכן שהקישור ישן.</p><a class="press btn btn-main" href="${href('library')}">לספרייה</a></div>`;
  const asPrimary = DATA.states.filter((s) => s.primary.includes(id));
  const asCounter = DATA.states.filter((s) => s.counter.id === id);
  const lab = (key, vals) => vals.map((v) => esc(labelOf(DATA, key, v))).join(', ');
  return `${crumbs([['בית', '#/'], ['ספרייה', href('library')], [m.name, null]])}
  <h1 class="page-title">${esc(m.name)} <span class="latin">${esc(m.nameEn)}</span></h1>
  <div class="facts card">
    <div><span class="label">מקור אמיתי</span><div><strong>${esc(m.author)}</strong> <span class="latin">${esc(m.authorEn)}</span></div></div>
    <div><span class="label">שנה</span><div>${yearOf(m)}</div></div>
    <div><span class="label">רמת ראיות</span><div>${evidence(m.evidence)}</div></div>
    <div><span class="label">סוג בעיה מתאים</span><div>${lab('cynefin', m.problemTypes)}</div></div>
    <div><span class="label">שכבת זמן מתאימה</span><div>${lab('layer', m.layers)}</div></div>
  </div>
  ${m.correction ? `<div class="tone tone-insight correction"><h3>תיקון ייחוס</h3><p>${m.attributedTo ? `<span class="was">${rich(m.attributedTo)}</span><br>` : ''}${lines(m.correction)}</p></div>` : ''}
  <div class="grid-2" style="margin-top:16px">
    <div class="card"><span class="label">הקשר</span><p style="margin:0">${lines(m.context)}</p></div>
    <div class="card"><span class="label">הנחת יסוד סמויה</span><p style="margin:0">${lines(m.assumption)}</p></div>
    <div class="card"><span class="label">מה אומרות הראיות</span><p style="margin:0">${lines(m.evidenceNote)}</p></div>
    <div class="tone tone-problem"><h3>תנאים מטעים</h3><p>${lines(m.misleading)}</p></div>
    <div class="tone tone-problem"><h3>שימוש שגוי נפוץ</h3><p>${lines(m.misuse)}</p></div>
    <div class="tone tone-insight"><h3>שאלת בקרה</h3><p>${rich('==' + m.control + '==')}</p></div>
  </div>
  ${m.quote ? `<figure class="card" style="margin:16px 0 0"><span class="label">ציטוט · תרגום</span><blockquote class="quote"><strong>${esc(m.quote.he)}</strong></blockquote><div class="quote-en">${esc(m.quote.en)}</div><figcaption class="src">${esc(m.quote.by)}</figcaption></figure>` : ''}
  <h2 class="section-title">איפה הוא מופיע באבחון</h2>
  ${asPrimary.length || asCounter.length ? `<div class="stack">${asPrimary.map((s) => `<div class="card"><span class="label">מודל ראשי</span><strong>${esc(s.title)}</strong></div>`).join('')}${asCounter.map((s) => `<div class="card"><span class="label">מודל נגדי</span><strong>${esc(s.title)}</strong><p class="small muted" style="margin:4px 0 0">${lines(s.counter.why)}</p></div>`).join('')}</div>` : `<p class="muted">${m.inMatcher === false ? 'המודל מופיע כמסגרת רקע או כדוגמה לייחוס שגוי, ולא כהמלצה.' : 'לא מופיע באף מצב.'}</p>`}
  <h2 class="section-title">מקורות</h2>
  <ol class="sources">${m.sources.map((s) => `<li>${esc(s.text)}${s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace('https://', ''))}</a>` : ''}</li>`).join('')}</ol>
  <p class="notice">${esc(DATA.meta.sourcesNotice)}</p>`;
}

function logPage() {
  const log = store.get(LOG_KEY, []);
  if (!log.length) {
    return `${crumbs([['בית', '#/'], ['יומן', null]])}<div class="card empty"><h1 class="page-title">היומן ריק.</h1><p>${lines('אחרי כל אבחון עונים על שאלה אחת: האם המודל שינה החלטה? התשובות נשמרות כאן, במכשיר הזה בלבד.')}</p><a class="press btn btn-main" href="${href('diagnose', { step: 0 })}">להתחיל אבחון</a></div>`;
  }
  const n = (v) => log.filter((e) => e.changed === v).length;
  const V = { yes: 'שינה החלטה', partial: 'שינה חלקית', no: 'לא שינה' };
  return `${crumbs([['בית', '#/'], ['יומן', null]])}
  <h1 class="page-title">${rich(`המודל שינה החלטה ב-**${n('yes')}** מתוך **${log.length}** אבחונים.`)}</h1>
  <p class="page-sub">${lines(`חלקית: **${n('partial')}**. לא שינה: **${n('no')}**. זה המדד של הכלי עצמו: כלי שלא משנה החלטות הוא טקס.`)}</p>
  <div class="stack">${[...log].reverse().map((e) => {
    const r = match(DATA, e.answers);
    const names = r.primary ? r.primary.map((m) => m.name).join(' + ') : '';
    return `<a class="card press log-item" href="${href('result', e.answers)}">
      <div><span class="label">${new Date(e.date).toLocaleDateString('he-IL')}</span>
        <strong>${esc(e.description || r.state?.title || '')}</strong>
        <div class="small muted">${esc(names)}</div>
        ${e.note ? `<div class="small" style="margin-top:4px">${esc(e.note)}</div>` : ''}</div>
      <span class="verdict ${e.changed || 'no'}">${e.changed ? V[e.changed] : 'טרם נענה'}</span></a>`;
  }).join('')}</div>`;
}

// ---------- רינדור ואירועים ----------
function setTabs(page) {
  document.querySelectorAll('.tab').forEach((t) => (t.dataset.page === page ? t.setAttribute('aria-current', 'page') : t.removeAttribute('aria-current')));
}

function setMenuItems(page) {
  const menu = document.querySelector('ai-menu');
  if (!menu) return;
  const items = [];
  if (page === 'log' && store.get(LOG_KEY, []).length) {
    items.push({ label: 'מחיקת היומן', onSelect: () => { if (confirm('למחוק את כל היומן מהמכשיר הזה?')) { store.set(LOG_KEY, []); render(); } } });
  }
  items.push({ label: 'הדפסה או שמירה כ-PDF', onSelect: () => print() });
  try { menu.items = items; } catch { /* the menu script did not load */ }
}

function render() {
  const { parts, params } = parseRoute();
  const page = parts[0] || 'home';
  let html;
  if (page === 'diagnose') html = diagnose(params);
  else if (page === 'result') html = result(params);
  else if (page === 'library') html = library(params);
  else if (page === 'model') html = modelPage(parts[1]);
  else if (page === 'log') html = logPage();
  else html = home(params);
  app.innerHTML = html;
  setTabs(page === 'model' ? 'library' : page === 'result' ? 'diagnose' : page);
  setMenuItems(page);
  const h = app.querySelector('h1');
  document.title = `${h ? h.textContent.trim().slice(0, 50) : ''} · מתאם מודלים`;
}

function saveDecision(patch) {
  const { params } = parseRoute();
  const answers = answersFrom(params);
  const r = match(DATA, answers);
  if (!r.state || !r.primary) return;
  const log = store.get(LOG_KEY, []);
  const sig = JSON.stringify(answers);
  let e = log.find((x) => x.sig === sig);
  if (!e) { e = { sig, answers, date: new Date().toISOString(), stateId: r.state.id, description: store.get(DRAFT_KEY, '') }; log.push(e); }
  Object.assign(e, patch);
  if (store.set(LOG_KEY, log)) flashSaved();
}

app.addEventListener('click', (ev) => {
  const c = ev.target.closest('[data-case]');
  if (c) {
    document.querySelectorAll('[data-case]').forEach((b) => b.setAttribute('aria-pressed', String(b === c)));
    document.getElementById('keymap').innerHTML = keyMap(c.dataset.case);
    history.replaceState(null, '', href('', { case: c.dataset.case }));
    return;
  }
  const evb = ev.target.closest('[data-ev]');
  if (evb) {
    const { params } = parseRoute();
    const v = evb.dataset.ev;
    location.hash = href('library', v && params.ev !== v ? { ev: v } : {}); // לחיצה על הבחירה היחידה מחזירה ל"הכול"
    return;
  }
  const d = ev.target.closest('[data-changed]');
  if (d) {
    document.querySelectorAll('[data-changed]').forEach((b) => b.setAttribute('aria-pressed', String(b === d)));
    saveDecision({ changed: d.dataset.changed });
    return;
  }
  const slab = ev.target.closest('.slab');
  if (slab) location.hash = slab.dataset.href;
});
app.addEventListener('keydown', (ev) => {
  const slab = ev.target.closest('.slab');
  if (slab && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); location.hash = slab.dataset.href; }
});
app.addEventListener('input', (ev) => {
  if (ev.target.id === 'desc' && store.set(DRAFT_KEY, ev.target.value)) flashSaved();
  if (ev.target.id === 'note') saveDecision({ note: ev.target.value });
});

addEventListener('hashchange', () => { render(); scrollTo({ top: 0 }); });

async function boot() {
  try {
    const res = await fetch('data/models.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(res.status);
    DATA = await res.json();
    render();
  } catch (e) {
    app.innerHTML = `<div class="card empty"><h1 class="page-title">קובץ המודלים לא נטען.</h1><p>${lines('בדקי את החיבור ורענני את הדף. אם פתחת את הקובץ ישירות מהמחשב, הפעילי שרת מקומי: npm run serve.')}</p></div>`;
  }
}
boot();

if ('serviceWorker' in navigator && /^\/(index\.html)?$/.test(location.pathname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
