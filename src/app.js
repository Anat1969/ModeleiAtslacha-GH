// מתאם מודלים: ממשק. כל הטקסט התוכני מגיע מ-data/models.json, וההתאמה מ-matcher.js.
// כל דף הוא קומפוזיציה בגובה המסך: מוקד גרפי אחד, וטורי צד. בנייד: לשוניות במקום גלילה.
import { match, findModel, labelOf, titleOf, QUESTION_KEYS } from './matcher.js';
import { glyph, driftChart, evidenceChart, optionGlyph, DiagnosisCube, EV_COLOR } from './graphics.js';

const LOG_KEY = 'matcher.log.v1';
const DRAFT_KEY = 'matcher.draft.v1';
const DAY = 864e5;
const app = document.getElementById('app');
let DATA = null;

// ---------- טקסט עשיר: **מודגש**, ==תובנה==, מספרים אוטומטיים, לועזית משנית ----------
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function rich(text) {
  const h = esc(text)
    .replace(/\*\*(.+?)\*\*( [A-Z][A-Za-z'’\-]*(?: [A-Z][A-Za-z'’\-]*)*)?/g, (_, b, en) => `<strong>${b}</strong>${en ? ` <span class="latin">${en.trim()}</span>` : ''}`)
    .replace(/==(.+?)==/g, '<mark class="insight">$1</mark>')
    .replace(/\(([A-Z][^()]*)\)/g, '<span class="latin paren">($1)</span>');
  return h.split(/(<[^>]+>)/).map((part) => (part.startsWith('<') ? part : part.replace(/(\d+(?:[.,/–-]\d+)*%?)/g, '<span class="num">$1</span>'))).join('');
}
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
const setParam = (key, value) => {
  const { parts, params } = parseRoute();
  params[key] = value;
  history.replaceState(null, '', href(parts.join('/'), params));
};

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
const yearOf = (m) => (m.year ? `<span class="num">${m.year}</span>` : '<span class="muted">לא ידועה</span>');
const crumbs = (items) => `<nav class="crumbs" aria-label="פירורי לחם">${items.map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : esc(t))).join(' / ')}</nav>`;
const row = (label, value) => `<div class="dense-row"><span class="label">${esc(label)}</span><span class="val">${value}</span></div>`;
const legendEv = () => `<div class="legend">${Object.keys(DATA.meta.evidenceLevels).map((l) => `<span><i style="background:${EV_COLOR[l]}"></i>${esc(DATA.meta.evidenceLevels[l].label)}</span>`).join('')}</div>`;

// לשוניות: בנייד הטורים הופכים ללשוניות. במחשב כולם גלויים זה לצד זה.
function layout(cls, panes, params) {
  const on = panes.some((p) => p.id === params.p) ? params.p : panes[0].id;
  return `<div class="layout ${cls}">
    <nav class="pane-tabs chips" role="tablist" aria-label="חלקי הדף">${panes.map((p) => `<button class="chip" role="tab" data-pane="${p.id}" aria-pressed="${p.id === on}">${esc(p.label)}</button>`).join('')}</nav>
    ${panes.map((p) => `<section class="pane pane-${p.id} ${p.id === on ? 'on' : ''}" data-pane-id="${p.id}">${p.html}</section>`).join('')}
  </div>`;
}
// לשוניות בתוך מוקד: מחליפות תצוגה בלי לטעון מחדש את הדף
function tabs(name, items, active) {
  const on = items.some((i) => i.id === active) ? active : items[0].id;
  return `<div class="stage" data-tabs="${name}">
    <nav class="chips stage-tabs" role="tablist">${items.map((i) => `<button class="chip" role="tab" data-tab="${i.id}" aria-pressed="${i.id === on}">${esc(i.label)}</button>`).join('')}</nav>
    ${items.map((i) => `<div class="stage-view ${i.id === on ? 'on' : ''}" data-view="${i.id}">${i.html}</div>`).join('')}
  </div>`;
}

// ---------- מפת המסלול: מקרה דרך חמש השאלות ----------
const CASES = [
  { id: 'neighborhood', label: 'תכנון שכונה', answers: { intent: 'users', cynefin: 'complex', agreement: 'no', layer: 'site', unit: 'public', data: 'partial' } },
  { id: 'budget', label: 'תקציב פרויקט', answers: { intent: 'budget', cynefin: 'complicated', agreement: 'yes', layer: 'structure', unit: 'org', data: 'yes' } },
  { id: 'participation', label: 'שיתוף ציבור', answers: { intent: 'users', cynefin: 'complex', agreement: 'partial', layer: 'space', unit: 'public', data: 'partial' } },
];
function keyMap(answers, title) {
  const r = match(DATA, answers);
  if (!r.primary) return '';
  const qs = DATA.questions;
  const W = 760, colW = 124, top = 46, rowH = 34;
  const xOf = (i) => W - 16 - i * colW;
  const pts = [];
  let svg = '';
  qs.forEach((q, i) => {
    const x = xOf(i);
    svg += `<text class="col-txt" x="${x}" y="22" direction="rtl" text-anchor="start">${esc(q.title)}</text>`;
    q.options.forEach((o, j) => {
      const y = top + 12 + j * rowH, on = answers[q.id] === o.id;
      if (on) pts.push([x - 6, y]);
      svg += `<circle class="opt-dot ${on ? 'on' : ''}" cx="${x - 6}" cy="${y}" r="6"></circle>`;
      svg += `<text class="opt-txt ${on ? 'on' : ''}" x="${x - 18}" y="${y + 4}" direction="rtl" text-anchor="start">${esc(o.label)}</text>`;
    });
  });
  const rx = 4, ry = 112, rw = 140, rh = 84;
  pts.push([rx + rw, ry + rh / 2]);
  const d = pts.map(([x, y], i) => (i ? `C ${pts[i - 1][0] - 60} ${pts[i - 1][1]}, ${x + 60} ${y}, ${x} ${y}` : `M ${x} ${y}`)).join(' ');
  const res = r.primary.map((m) => m.name);
  svg = `<path class="path draw" d="${d}"></path>` + svg + `<rect class="res-box" x="${rx}" y="${ry}" width="${rw}" height="${rh}"></rect>`;
  res.forEach((t, i) => { svg += `<text class="res-txt" x="${rx + rw - 12}" y="${ry + 26 + i * 18}" direction="rtl" text-anchor="start">${esc(t)}</text>`; });
  svg += `<text class="res-sub" x="${rx + rw - 12}" y="${ry + rh - 12}" direction="rtl" text-anchor="start">${r.status === 'framing' ? 'תהליך מסגור, לא פתרון' : 'מודל מומלץ'}</text>`;
  const list = `<ol class="keylist">${qs.map((q) => `<li><span class="label">${esc(q.title)}</span><strong>${esc(labelOf(DATA, q.id, answers[q.id]))}</strong></li>`).join('')}<li class="kl-res"><span class="label">${r.status === 'framing' ? 'תהליך מסגור' : 'מודל מומלץ'}</span><strong>${esc(res.join(' + '))}</strong></li></ol>`;
  return list + `<svg class="keysvg" viewBox="0 0 ${W} 270" role="img" aria-label="${esc(title || 'מסלול האבחון')}: ${esc(res.join(' + '))}">${svg}</svg>`;
}

// ---------- דף הבית ----------
function home(params) {
  const models = DATA.models, k = DATA.knowledge;
  const wrong = models.filter((m) => m.attributedTo).length;
  const strong = models.filter((m) => m.evidence === 'strong').length;
  const log = store.get(LOG_KEY, []);
  const changed = log.filter((e) => e.changed === 'yes').length;
  const caseId = params.case || 'neighborhood';
  const c = CASES.find((x) => x.id === caseId) || CASES[0];
  const conn = k.connections || [];
  const ci = Math.max(0, Math.min(conn.length - 1, Number(params.c) || 0));
  const qm = findModel(DATA, k.quoteModel);

  const intro = `
    <div class="hero-num rise"><span class="big">${wrong}/${models.length}</span><span class="muted">מודלים מיוחסים לאדם הלא נכון</span></div>
    <h1 class="hero-h rise">בוחרים כלי חשיבה לפי הבעיה, לא לפי הפופולריות.</h1>
    <p class="lead rise">${lines('חמש שאלות מאבחנות את הבעיה. אחריהן: מודל ראשי, מודל נגדי, אזהרה ושלושה צעדים, עם **המקור האמיתי** ו**רמת הראיות**.')}</p>
    <div class="row rise"><a class="press btn btn-main" href="${href('diagnose', { step: 0 })}">להתחיל אבחון</a><a class="press btn" href="${href('library')}">ספריית המודלים</a></div>
    <div class="tri">
      <div class="tone tone-problem"><h4>הבעיה</h4><p>בוחרים מודל כי הוא מוכר.</p></div>
      <div class="tone tone-solution"><h4>הפתרון</h4><p>מאבחנים קודם, ובוחרים אחר כך.</p></div>
      <div class="tone tone-insight"><h4>התובנה</h4><p>${rich(`==${k.insight}==`)}</p></div>
    </div>`;

  const stage = tabs('home', [
    { id: 'space', label: 'מרחב האבחון', html: `<p class="cap"><strong>12 מצבים מהטבלה, ועוד מצב חירום, על שלושה צירים.</strong> כל נקודה היא כלי אחר. גררו לסיבוב, ולחצו על נקודה.</p><div class="fill cube-host" id="cube"></div><div class="pick" id="pick"><span class="muted">${esc('לחיצה על נקודה מציגה את המצב, המודל והאזהרה.')}</span></div>${legendEv()}` },
    { id: 'path', label: 'מסלול מקרה', html: `<p class="cap"><strong>שלושה מקרים אמיתיים.</strong> הקו עובר דרך התשובות עד לכלי.</p><div class="chips" role="group" aria-label="בחירת מקרה">${CASES.map((x) => `<button class="chip" data-case="${x.id}" aria-pressed="${x.id === c.id}">${esc(x.label)}</button>`).join('')}</div><div class="fill keymap" id="keymap">${keyMap(c.answers, `מסלול האבחון במקרה ${c.label}`)}</div><div class="legend"><span><i class="lg-path"></i>מסלול האבחון</span><span><i class="lg-on"></i>התשובה שנבחרה</span><span><i class="lg-off"></i>תשובה אפשרית</span><span><i class="lg-res"></i>התוצאה</span></div>` },
    { id: 'drift', label: 'הרעיון והתרשים', html: `<p class="cap"><strong>${esc(DATA.meta.driftTitle)}</strong> המספר: כמה שנים עברו.</p><div class="fill chart-host">${driftChart(models)}</div><div class="legend"><span><i style="background:var(--ink)"></i>הרעיון המקורי</span><span><i style="background:var(--cut)"></i>התרשים או הייחוס המוכר</span></div>` },
    { id: 'evidence', label: 'ראיות', html: `<p class="cap"><strong>רק ${strong} מתוך ${models.length} נשענים על ראיות חזקות.</strong> כל ריבוע הוא מודל, ולחיצה פותחת את הכרטיס.</p><div class="fill chart-host">${evidenceChart(DATA)}</div>` },
  ], params.v);

  const more = `
    <h2 class="sec">מפת האפליקציה</h2>
    <a class="dense-link press" href="${href('diagnose', { step: 0 })}"><span>אבחון בחמש שאלות</span><span class="num">5</span></a>
    <a class="dense-link press" href="${href('library')}"><span>ספריית מודלים</span><span class="num">${models.length}</span></a>
    <a class="dense-link press" href="${href('log')}"><span>${log.length ? `יומן: שינה החלטה ב-${changed}` : 'יומן החלטות'}</span><span class="num">${log.length}</span></a>
    <h2 class="sec">חיבורים בין תחומים</h2>
    ${conn.length ? `<div class="card conn">
      <div class="conn-head"><strong>${esc(conn[ci].title)}</strong><span class="stepper"><button class="icon-btn" data-conn="${(ci - 1 + conn.length) % conn.length}" aria-label="החיבור הקודם">‹</button><span class="num">${ci + 1}/${conn.length}</span><button class="icon-btn" data-conn="${(ci + 1) % conn.length}" aria-label="החיבור הבא">›</button></span></div>
      <span class="label">הכלל</span><p>${rich(conn[ci].rule)}</p>
      <span class="label">התובנה</span><p>${rich('==' + conn[ci].insight + '==')}</p>
      <span class="label">מה עושים</span><p>${rich(conn[ci].action)}</p></div>` : ''}
    <h2 class="sec">מתוך המקורות</h2>
    ${tabs('src', [
      { id: 'quote', label: 'ציטוט', html: `<blockquote class="quote"><strong>${esc(qm.quote.he)}</strong></blockquote><div class="quote-en">${esc(qm.quote.en)}</div><p class="src">${esc(qm.quote.by)}, Policy Sciences · תרגום</p>` },
      { id: 'haiku', label: 'הייקו', html: `<p class="haiku">${k.haiku.map((l) => `<span class="line">${esc(l)}</span>`).join('')}</p><p class="src">${esc(k.haikuNote)}</p>` },
      { id: 'anchors', label: 'עוגנים', html: `<p class="small">${lines('**Cynefin** לסוג הבעיה. **ריטל-וובר** להסכמה. **שכבות הגזירה** לזמן. **המבט מבחוץ** לנתונים.')}</p><p class="src">${esc(DATA.meta.tableNotice)}</p>` },
    ], params.s)}
    <p class="src foot">${esc(k.inspiration)}</p>`;

  return layout('lay-home', [
    { id: 'intro', label: 'פתיחה', html: intro },
    { id: 'stage', label: 'גרפיקה', html: stage },
    { id: 'more', label: 'עוד', html: more },
  ], params);
}

function mountHome() {
  const host = document.getElementById('cube');
  if (!host || host.querySelector('svg') || !host.offsetParent) return;
  new DiagnosisCube(host, DATA, {
    onPick: (s) => {
      const lead = findModel(DATA, s.primary[0]);
      document.getElementById('pick').innerHTML = `<span class="pick-dot" style="background:${EV_COLOR[lead.evidence]}"></span>
        <span class="pick-txt"><strong>${esc(s.title)}</strong><span class="muted"> · ${esc(s.primary.map((id) => findModel(DATA, id).name).join(' + '))}</span><br><span class="small warn">${esc(s.warning)}</span></span>
        <a class="press btn btn-quiet" href="${href('result', s.sample)}">לתוצאה</a>`;
    },
  });
}

// ---------- אבחון ----------
const STEPS = QUESTION_KEYS;
function keyPath(answers, step) {
  return `<nav class="keypath" aria-label="התקדמות האבחון">${STEPS.map((k, i) => {
    const done = !!answers[k];
    return `<a class="kp ${done ? 'done' : ''} ${i === step ? 'now' : ''}" href="${href('diagnose', { ...answers, step: i })}" ${i === step ? 'aria-current="step"' : ''}>${esc(titleOf(DATA, k))}<b>${done ? esc(labelOf(DATA, k, answers[k])) : '&nbsp;'}</b></a>`;
  }).join('')}</nav>`;
}

function isoStack(selected, answers) {
  const q = DATA.questions.find((x) => x.id === 'layer');
  const n = q.options.length, w = 170, d = 50, h = 18, step = 46, x0 = 16;
  let svg = '';
  q.options.forEach((o, k) => {
    const i = n - 1 - k, y = 20 + i * step, on = o.id === selected;
    const top = on ? '#3C4A6B' : '#EEF0F5', front = on ? '#1F2A44' : '#D8DCE6', side = on ? '#2B3758' : '#C3C9D6';
    const p = (pts) => pts.map((v) => v.join(',')).join(' ');
    const A = [x0, y + d / 2], B = [x0 + w / 2, y], C = [x0 + w, y + d / 2], D = [x0 + w / 2, y + d];
    svg += `<g class="slab ${on ? 'on' : ''}" style="--d:${k * 70}ms" role="button" tabindex="0" aria-pressed="${on}" aria-label="${esc(o.label)}, ${esc(o.years)}" data-href="${href('diagnose', { ...answers, layer: o.id, step: 4 })}">
      <polygon points="${p([A, D, [D[0], D[1] + h], [A[0], A[1] + h]])}" fill="${front}"></polygon>
      <polygon points="${p([D, C, [C[0], C[1] + h], [D[0], D[1] + h]])}" fill="${side}"></polygon>
      <polygon points="${p([A, B, C, D])}" fill="${top}" stroke="#fff" stroke-width="1"></polygon>
      <line x1="${x0 + w + 4}" y1="${y + d / 2}" x2="${x0 + w + 14}" y2="${y + d / 2}" stroke="#C3C9D6"></line>
      <text class="lbl" direction="rtl" text-anchor="end" x="${x0 + w + 18}" y="${y + d / 2 + 2}">${esc(o.label)}</text>
      <text class="yr" direction="rtl" text-anchor="end" x="${x0 + w + 18}" y="${y + d / 2 + 17}">${esc(o.years)}</text>
    </g>`;
  });
  return `<div class="iso"><span class="label">אתר בתחתית, תכולה בראש</span><svg viewBox="0 0 330 ${20 + (n - 1) * step + d + h + 10}" aria-label="שכבות הגזירה של בניין">${svg}</svg><p class="src">Brand, 1994</p></div>`;
}

function option(o, on, url, g) {
  return `<a class="press opt" href="${url}" aria-pressed="${on}" role="button">${g || ''}<b>${esc(o.label)}</b>${o.years ? `<span class="yrs">${esc(o.years)}</span>` : ''}<span class="hint">${esc(o.hint)}</span></a>`;
}

function diagnose(params) {
  const answers = answersFrom(params);
  const step = Math.max(0, Math.min(STEPS.length - 1, Number(params.step) || 0));
  const key = STEPS[step];
  const done = QUESTION_KEYS.every((k) => answers[k]);
  const nav = `<div class="nav-row">${step > 0 ? `<a class="press btn" href="${href('diagnose', { ...answers, step: step - 1 })}">הקודם</a>` : '<span></span>'}${done ? `<a class="press btn btn-main" href="${href('result', answers)}">לתוצאה</a>` : ''}</div>`;
  let head, body;
  if (key === 'intent') {
    head = `<span class="step">שלב 0 מתוך 5</span><h1 class="q-h">מה המשימה שלפנייך?</h1><p class="q-insight">המשימה בוחרת מועמד. חמש השאלות בודקות אותו.</p>
      <label class="label" for="desc">תיאור הבעיה במשפט (לא חובה, נשמר ביומן)</label>
      <textarea id="desc" class="field" placeholder="למשל: תושבי הרובע חלוקים על תוכנית ההתחדשות">${esc(store.get(DRAFT_KEY, ''))}</textarea><span class="saved" aria-live="polite">נשמר</span>`;
    body = `<div class="options opts-intent">${DATA.intents.map((o) => option(o, answers.intent === o.id, href('diagnose', { ...answers, intent: o.id, step: 1 }))).join('')}</div>`;
  } else {
    const q = DATA.questions.find((x) => x.id === key);
    head = `<span class="step">שאלה ${q.step} מתוך 5</span><h1 class="q-h">${esc(q.title)}</h1><p class="q-insight">${rich(q.insight)}</p><p class="muted small">${lines(q.explain)}</p><p class="src">${esc(q.source)}</p>`;
    const target = (o) => (step + 1 < STEPS.length ? href('diagnose', { ...answers, [key]: o.id, step: step + 1 }) : href('result', { ...answers, [key]: o.id }));
    const opts = `<div class="options">${q.options.map((o) => option(o, answers[key] === o.id, target(o), optionGlyph(key, o.id))).join('')}</div>`;
    const m = q.modelId && key !== 'layer' ? findModel(DATA, q.modelId) : null;
    const illo = m ? `<figure class="q-fig"><div class="q-fig-g">${glyph(m)}</div><figcaption><strong>${esc(m.name)}</strong><span class="src">${esc(m.author)}, ${m.year || ''}. שרטוט מוסבר.</span><a class="press btn btn-quiet" href="${href('model/' + m.id)}">לכרטיס המקור</a></figcaption></figure>` : '';
    body = key === 'layer' ? `<div class="layer-wrap">${opts}${isoStack(answers.layer, answers)}</div>` : opts + illo;
  }
  return `<div class="layout lay-diag">${keyPath(answers, step)}<aside class="q-head">${crumbs([['בית', '#/'], ['אבחון', null]])}${head}${nav}</aside><section class="q-body scroll-in">${body}</section></div>`;
}

// ---------- תוצאה ----------
function answersRows(answers) {
  return QUESTION_KEYS.map((k, i) => `<a class="dense-link press" href="${href('diagnose', { ...answers, step: i })}"><span class="label">${esc(titleOf(DATA, k))}</span><span>${esc(labelOf(DATA, k, answers[k]))}</span></a>`).join('');
}

function modelView(m, role, why) {
  const isCounter = role === 'counter';
  return `<div class="mview">
    <figure class="mfig">${glyph(m)}<figcaption class="src">שרטוט מוסבר, לא התרשים המקורי</figcaption></figure>
    <div class="minfo">
      <span class="role ${isCounter ? 'counter' : ''}">${isCounter ? 'מודל נגדי' : 'מודל ראשי'}</span>
      <h2 class="m-h">${esc(m.name)}</h2><span class="latin">${esc(m.nameEn)}</span>
      ${isCounter ? `<p class="why">${lines(why)}</p>` : ''}
      ${row('מקור אמיתי', `<strong>${esc(m.author)}</strong>`)}
      ${row('שנה', yearOf(m))}
      ${row('רמת ראיות', evidence(m.evidence))}
      ${m.correction ? `<details class="corr"><summary><span class="label">תיקון ייחוס</span> ${m.attributedTo ? `<span class="was">${rich(m.attributedTo)}</span>` : ''}</summary><p class="small">${lines(m.correction)}</p></details>` : ''}
      <span class="label">הנחת יסוד סמויה</span><p class="small">${lines(m.assumption)}</p>
      <span class="label">שאלת בקרה של המודל</span><p class="small"><strong>${esc(m.control)}</strong></p>
      <a class="press btn btn-quiet" href="${href('model/' + m.id)}">כרטיס המקור המלא</a>
    </div></div>`;
}

function result(params) {
  const answers = answersFrom(params);
  const r = match(DATA, answers);
  const base = crumbs([['בית', '#/'], ['אבחון', href('diagnose', { ...answers, step: 0 })], ['תוצאה', null]]);
  const plain = (inner) => `<div class="layout lay-plain">${base}${inner}</div>`;

  if (r.status === 'incomplete') {
    return plain(`<div class="card empty"><h1 class="page-title">חסרות תשובות.</h1><p>${lines(`חסרות ${r.missing.length} תשובות. בלי כולן אין אבחון.`)}</p><a class="press btn btn-main" href="${href('diagnose', { ...answers, step: QUESTION_KEYS.indexOf(r.missing[0]) })}">להשלים</a></div>`);
  }
  if (r.status === 'clarify') {
    return plain(`<h1 class="page-title">התשובות סותרות זו את זו.</h1><p class="lead">האפליקציה לא מנחשת. בחרי מה נכון, והאבחון ימשיך.</p>
      <div class="grid-2">${r.conflicts.map((c) => `<div class="tone tone-problem rise"><h3>${rich(c.question)}</h3><p>${lines(c.message)}</p>
        <div class="row" style="margin-top:10px">${c.ask.map((k) => `<a class="press btn btn-quiet" href="${href('diagnose', { ...answers, step: QUESTION_KEYS.indexOf(k) })}">לשנות: ${esc(titleOf(DATA, k))}</a>`).join('')}</div></div>`).join('')}
      <div class="card"><h2 class="sec">התשובות שנבחרו</h2>${answersRows(answers)}</div></div>`);
  }
  if (r.status === 'mismatch') {
    const f = r.failed;
    return plain(`<h1 class="page-title">אין התאמה בטבלה לשילוב הזה.</h1><p class="lead">${lines('האפליקציה לא מנחשת. אחד הקריטריונים של המצב הקרוב לא מתקיים.')}</p>
      <div class="grid-2">${r.state ? `<div class="tone tone-neutral"><h3>המצב הקרוב: ${esc(r.state.title)}</h3><p>${f.map((x) => `<span class="line">${esc(titleOf(DATA, x.key))}: נבחר <strong>${esc(labelOf(DATA, x.key, x.value))}</strong>, והמצב דורש ${x.allowed.map((v) => `<strong>${esc(labelOf(DATA, x.key, v))}</strong>`).join(' או ')}.</span>`).join('')}</p>
      <div class="row" style="margin-top:10px">${f.map((x) => `<a class="press btn btn-quiet" href="${href('diagnose', { ...answers, step: QUESTION_KEYS.indexOf(x.key) })}">לשנות: ${esc(titleOf(DATA, x.key))}</a>`).join('')}</div></div>` : ''}
      <div class="card"><h2 class="sec">התשובות שנבחרו</h2>${answersRows(answers)}</div></div>`);
  }

  const s = r.state, lead = r.primary[0];
  const entry = store.get(LOG_KEY, []).find((e) => e.sig === JSON.stringify(answers));
  const checkRow = (c) => `<tr><td>${esc(titleOf(DATA, c.key))}</td><td><strong>${esc(labelOf(DATA, c.key, c.value))}</strong></td><td>${c.kind === 'requires' ? 'תנאי חובה' : c.kind === 'intent' ? 'משימה' : 'העדפה'}</td><td class="${c.pass ? 'ok-t' : c.kind === 'prefers' ? 'soft-t' : 'no-t'}">${c.pass ? 'מתאים' : c.kind === 'intent' ? 'הוחלפה במסגור' : 'חלקי'}</td></tr>`;

  const summary = `${base}
    <span class="label">מצב מאובחן${s.fromTable === false ? ' · נוסף לטבלה' : ''}</span>
    <h1 class="page-title">${rich(s.insight)}</h1>
    <p class="small"><strong>${esc(s.title)}</strong></p>
    <div class="fit-row"><span class="num fit-n">${r.fit}%</span><span class="small muted">התאמה לקריטריונים</span></div>
    ${r.status === 'framing' ? `<div class="tone tone-insight"><h4>אין כאן פתרון. יש תהליך מסגור.</h4><p>${lines('בבעיה מרושעת כל הגדרה היא עמדה. המטרה: סבב שיפור מוסכם.')}</p></div>` : ''}
    ${r.notes.filter((n) => r.status !== 'framing' || !n.includes('אין כאן פתרון')).map((n) => `<div class="tone tone-neutral"><p>${lines(n)}</p></div>`).join('')}
    <div class="tone tone-problem"><h4>תווית אזהרה</h4><p>${lines(s.warning)}</p></div>
    <h2 class="sec">התשובות שלך</h2>${answersRows(answers)}`;

  const views = [
    ...r.primary.map((m) => ({ id: m.id, label: `ראשי: ${m.short || m.name}`, html: modelView(m, 'primary') })),
    { id: 'counter', label: `נגדי: ${r.counter.model.short || r.counter.model.name}`, html: modelView(r.counter.model, 'counter', r.counter.why) },
    { id: 'space', label: 'מיקום במרחב', html: `<p class="cap"><strong>הבעיה שלך בין כל המצבים.</strong> הנקודה הגדולה היא הבעיה שלך.</p><div class="fill cube-host" id="cube"></div>${legendEv()}` },
    { id: 'path', label: 'המסלול', html: `<div class="fill keymap">${keyMap(answers, 'המסלול שלך')}</div>` },
    { id: 'calc', label: 'איך חושב', html: `<div class="scroll-in"><table class="checks"><thead><tr><th>שאלה</th><th>תשובה</th><th>סוג</th><th>תוצאה</th></tr></thead><tbody>${r.checks.map(checkRow).join('')}</tbody></table><p class="src">${lines('אחוז ההתאמה: חלק הקריטריונים שהתקיימו. תנאי חובה שלא מתקיים עוצר את ההמלצה.')}</p><p class="src">${esc(DATA.meta.tableNotice)} ${esc(DATA.meta.sourcesNotice)}</p></div>` },
  ];

  const act = `
    <h2 class="sec">שלושה צעדי יישום</h2>
    <ol class="chain">${s.steps.map((x, i) => `<li style="--d:${i * 120}ms"><span class="chain-n num">${i + 1}</span><span>${rich(x)}</span></li>`).join('')}</ol>
    <div class="city"><span class="label">דוגמה מהעיר</span><p class="small">${rich(s.example)}</p></div>
    <div class="control" id="control">
      <h2 class="sec">שאלת בקרה</h2>
      <p class="ctl-q">${rich('==האם המודל שינה החלטה?==')}</p>
      <div class="decide" role="group" aria-label="האם המודל שינה החלטה">
        ${[['yes', 'כן, שינה'], ['partial', 'חלקית'], ['no', 'לא שינה']].map(([v, t]) => `<button class="press btn" data-changed="${v}" aria-pressed="${entry?.changed === v}">${t}</button>`).join('')}
      </div>
      <label class="label" for="note">מה השתנה, או למה לא. בדיקה חוזרת בעוד 30 יום.</label>
      <textarea id="note" class="field" placeholder="משפט אחד ליומן">${esc(entry?.note || '')}</textarea>
      <span class="saved" aria-live="polite">נשמר</span>
    </div>`;

  return layout('lay-result', [
    { id: 'sum', label: 'אבחון', html: summary },
    { id: 'models', label: 'מודלים', html: tabs('res', views, params.v) },
    { id: 'act', label: 'יישום ובקרה', html: act },
  ], params);
}

function mountResult() {
  const host = document.getElementById('cube');
  if (!host || host.querySelector('svg') || !host.offsetParent) return;
  const answers = answersFrom(parseRoute().params);
  new DiagnosisCube(host, DATA, { focus: answers, onPick: (s) => { location.hash = href('result', s.sample); } });
}

// ---------- ספרייה ----------
function library(params) {
  const levels = Object.keys(DATA.meta.evidenceLevels);
  const sel = levels.includes(params.ev) ? params.ev : null;
  const shown = DATA.models.filter((m) => !sel || m.evidence === sel);
  const count = (l) => DATA.models.filter((m) => m.evidence === l).length;
  const filters = `${crumbs([['בית', '#/'], ['ספרייה', null]])}
    <h1 class="page-title">כל מודל עם מקורו האמיתי.</h1>
    <p class="lead">${lines(`**${DATA.models.filter((m) => m.attributedTo).length}** מתוך **${DATA.models.length}** מיוחסים בדרך כלל לאדם אחר.`)}</p>
    <h2 class="sec">סינון לפי רמת ראיות</h2>
    <div class="chips vchips" role="group" aria-label="סינון לפי רמת ראיות">
      <button class="chip" data-ev="" aria-pressed="${!sel}">הכול<span class="num">${DATA.models.length}</span></button>
      ${levels.map((l) => `<button class="chip" data-ev="${l}" aria-pressed="${sel === l}"><i class="sw" style="background:${EV_COLOR[l]}"></i>${esc(DATA.meta.evidenceLevels[l].label)}<span class="num">${count(l)}</span></button>`).join('')}
    </div>
    ${sel ? `<p class="small muted">${esc(DATA.meta.evidenceLevels[sel].hint)}</p>` : ''}
    <div class="chart-mini">${evidenceChart(DATA)}</div>`;
  const grid = `<div class="lib-grid scroll-in">${shown.map((m, i) => `<a class="card press lib-card rise" style="animation-delay:${i * 0.03}s" href="${href('model/' + m.id)}">
      <div class="lib-g">${glyph(m)}</div>
      <div class="lib-t"><h3>${esc(m.name)}</h3><span class="yr num">${m.year || ''}</span></div>
      <p class="small"><strong>${esc(m.author)}</strong></p>
      <div class="lib-f">${evidence(m.evidence)}${m.attributedTo ? '<span class="flag-wrong">ייחוס שגוי נפוץ</span>' : ''}</div>
    </a>`).join('')}</div>`;
  return layout('lay-lib', [
    { id: 'grid', label: 'מודלים', html: grid },
    { id: 'filters', label: 'סינון וגרף', html: filters },
  ], params);
}

// ---------- כרטיס מודל ----------
function modelPage(id, params) {
  const idx = DATA.models.findIndex((x) => x.id === id);
  const m = DATA.models[idx];
  if (!m) return `<div class="layout lay-plain"><div class="card empty"><h1 class="page-title">המודל לא נמצא.</h1><p>ייתכן שהקישור ישן.</p><a class="press btn btn-main" href="${href('library')}">לספרייה</a></div></div>`;
  const prev = DATA.models[(idx - 1 + DATA.models.length) % DATA.models.length], next = DATA.models[(idx + 1) % DATA.models.length];
  const asPrimary = DATA.states.filter((s) => s.primary.includes(id));
  const asCounter = DATA.states.filter((s) => s.counter.id === id);
  const lab = (key, vals) => vals.map((v) => esc(labelOf(DATA, key, v))).join(', ');
  const card = `${crumbs([['בית', '#/'], ['ספרייה', href('library')], [m.name, null]])}
    <div class="pager"><a class="icon-btn" href="${href('model/' + prev.id)}" aria-label="הקודם: ${esc(prev.name)}" title="${esc(prev.name)}">›</a><span class="num">${idx + 1}/${DATA.models.length}</span><a class="icon-btn" href="${href('model/' + next.id)}" aria-label="הבא: ${esc(next.name)}" title="${esc(next.name)}">‹</a></div>
    <h1 class="page-title">${esc(m.name)}</h1><span class="latin">${esc(m.nameEn)}</span>
    ${row('מקור אמיתי', `<strong>${esc(m.author)}</strong>`)}
    ${row('', `<span class="latin">${esc(m.authorEn)}</span>`)}
    ${row('שנה', yearOf(m))}
    ${row('רמת ראיות', evidence(m.evidence))}
    ${row('סוג בעיה', lab('cynefin', m.problemTypes))}
    ${row('שכבת זמן', lab('layer', m.layers))}
    ${m.correction ? `<div class="tone tone-insight"><h4>תיקון ייחוס</h4><p>${m.attributedTo ? `<span class="was">${rich(m.attributedTo)}</span><br>` : ''}${lines(m.correction)}</p></div>` : ''}`;
  const views = [
    { id: 'evidence', label: 'ראיות והקשר', html: `<div class="grid-2"><div><span class="label">הקשר</span><p class="small">${lines(m.context)}</p><span class="label">הנחת יסוד סמויה</span><p class="small">${lines(m.assumption)}</p></div><div><span class="label">מה אומרות הראיות</span><p class="small">${lines(m.evidenceNote)}</p></div></div>` },
    { id: 'warn', label: 'אזהרות', html: `<div class="grid-2"><div class="tone tone-problem"><h4>תנאים מטעים</h4><p>${lines(m.misleading)}</p></div><div class="tone tone-problem"><h4>שימוש שגוי נפוץ</h4><p>${lines(m.misuse)}</p></div><div class="tone tone-insight"><h4>שאלת בקרה</h4><p>${rich('==' + m.control + '==')}</p></div></div>` },
    { id: 'sources', label: 'מקורות', html: `<ol class="sources">${m.sources.map((s) => `<li>${esc(s.text)}${s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace('https://', ''))}</a>` : ''}</li>`).join('')}</ol><p class="src">${esc(DATA.meta.sourcesNotice)}</p>${m.quote ? `<blockquote class="quote"><strong>${esc(m.quote.he)}</strong></blockquote><div class="quote-en">${esc(m.quote.en)}</div><p class="src">${esc(m.quote.by)} · תרגום</p>` : ''}` },
    { id: 'where', label: 'באבחון', html: asPrimary.length || asCounter.length ? `${asPrimary.map((s) => `<a class="dense-link press" href="${href('result', s.sample)}"><span class="label">ראשי</span><span>${esc(s.title)}</span></a>`).join('')}${asCounter.map((s) => `<a class="dense-link press" href="${href('result', s.sample)}"><span class="label">נגדי</span><span>${esc(s.title)}</span></a>`).join('')}` : `<p class="muted">${m.inMatcher === false ? 'מופיע כמסגרת רקע או כדוגמה לייחוס שגוי, ולא כהמלצה.' : 'לא מופיע באף מצב.'}</p>` },
  ];
  const fig = `<figure class="bigfig">${glyph(m)}<figcaption class="src">שרטוט מוסבר: מה המודל אומר, במבט אחד. ${m.drift ? `מהרעיון (${m.drift[0].year}) לתרשים המוכר (${m.drift[1].year}): ${m.drift[1].year - m.drift[0].year} שנים.` : ''}</figcaption></figure>${tabs('model', views, params.v)}`;
  return layout('lay-model', [
    { id: 'card', label: 'כרטיס', html: card },
    { id: 'detail', label: 'שרטוט ופרטים', html: fig },
  ], params);
}

// ---------- יומן ----------
function logPage(params) {
  const log = store.get(LOG_KEY, []);
  if (!log.length) {
    return `<div class="layout lay-plain">${crumbs([['בית', '#/'], ['יומן', null]])}<div class="card empty"><h1 class="page-title">היומן ריק.</h1><p>${lines('אחרי כל אבחון עונים על שאלה אחת: האם המודל שינה החלטה? התשובות נשמרות כאן, במכשיר הזה בלבד.')}</p><a class="press btn btn-main" href="${href('diagnose', { step: 0 })}">להתחיל אבחון</a></div></div>`;
  }
  const n = (v) => log.filter((e) => e.changed === v).length;
  const due = log.filter((e) => !e.changed && Date.now() - new Date(e.date) > 30 * DAY).length;
  const V = { yes: 'שינה החלטה', partial: 'שינה חלקית', no: 'לא שינה' };
  const bar = (v, color) => `<div class="hbar"><span class="label">${V[v]}</span><span class="hb"><i class="grow-x" style="width:${(100 * n(v)) / log.length}%;background:${color}"></i></span><span class="num">${n(v)}</span></div>`;
  const stats = `${crumbs([['בית', '#/'], ['יומן', null]])}
    <h1 class="page-title">${rich(`המודל שינה החלטה ב-**${n('yes')}** מתוך **${log.length}**.`)}</h1>
    <p class="lead">${lines('זה המדד של הכלי עצמו: כלי שלא משנה החלטות הוא טקס.')}</p>
    ${bar('yes', 'var(--bank)')}${bar('partial', 'var(--ev-partial)')}${bar('no', 'var(--ink-mute)')}
    ${due ? `<div class="tone tone-insight"><h4>${due} אבחונים עברו 30 יום בלי תשובה.</h4><p>${lines('זה הזמן לבדוק: האם התוצר שימש להחלטה?')}</p></div>` : ''}`;
  const list = `<div class="scroll-in stack">${[...log].reverse().map((e) => {
    const r = match(DATA, e.answers);
    const names = r.primary ? r.primary.map((m) => m.name).join(' + ') : '';
    return `<a class="card press log-item" href="${href('result', e.answers)}">
      <div><span class="label">${new Date(e.date).toLocaleDateString('he-IL')}</span>
        <strong>${esc(e.description || r.state?.title || '')}</strong>
        <div class="small muted">${esc(names)}</div>
        ${e.note ? `<div class="small">${esc(e.note)}</div>` : ''}</div>
      <span class="verdict ${e.changed || 'no'}">${e.changed ? V[e.changed] : Date.now() - new Date(e.date) > 30 * DAY ? 'הגיע זמן הבדיקה' : `בדיקה ב-${new Date(+new Date(e.date) + 30 * DAY).toLocaleDateString('he-IL')}`}</span></a>`;
  }).join('')}</div>`;
  return layout('lay-log', [
    { id: 'stats', label: 'מדד', html: stats },
    { id: 'list', label: 'רשומות', html: list },
  ], params);
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
  else if (page === 'model') html = modelPage(parts[1], params);
  else if (page === 'log') html = logPage(params);
  else html = home(params);
  app.innerHTML = html;
  setTabs(page === 'model' ? 'library' : page === 'result' ? 'diagnose' : page);
  setMenuItems(page);
  if (page === 'home') mountHome();
  if (page === 'result') mountResult();
  const h = app.querySelector('h1');
  document.title = `${h ? h.textContent.trim().slice(0, 50) : ''} · מתאם מודלים`;
}

function saveDecision(patch) {
  const answers = answersFrom(parseRoute().params);
  const r = match(DATA, answers);
  if (!r.state || !r.primary) return;
  const log = store.get(LOG_KEY, []);
  const sig = JSON.stringify(answers);
  let e = log.find((x) => x.sig === sig);
  if (!e) { e = { sig, answers, date: new Date().toISOString(), stateId: r.state.id, description: store.get(DRAFT_KEY, '') }; log.push(e); }
  Object.assign(e, patch);
  if (store.set(LOG_KEY, log)) flashSaved();
}

const mountVisible = () => { const page = parseRoute().parts[0] || 'home'; if (page === 'home') mountHome(); if (page === 'result') mountResult(); };

app.addEventListener('click', (ev) => {
  const pane = ev.target.closest('[data-pane]');
  if (pane) {
    const id = pane.dataset.pane;
    app.querySelectorAll('[data-pane]').forEach((b) => b.setAttribute('aria-pressed', String(b === pane)));
    app.querySelectorAll('.pane').forEach((p) => p.classList.toggle('on', p.dataset.paneId === id));
    setParam('p', id);
    mountVisible();
    return;
  }
  const tab = ev.target.closest('[data-tab]');
  if (tab) {
    const box = tab.closest('[data-tabs]');
    box.querySelectorAll(':scope > .stage-tabs [data-tab]').forEach((b) => b.setAttribute('aria-pressed', String(b === tab)));
    box.querySelectorAll(':scope > .stage-view').forEach((v) => v.classList.toggle('on', v.dataset.view === tab.dataset.tab));
    setParam(box.dataset.tabs === 'src' ? 's' : 'v', tab.dataset.tab);
    mountVisible();
    return;
  }
  const c = ev.target.closest('[data-case]');
  if (c) {
    app.querySelectorAll('[data-case]').forEach((b) => b.setAttribute('aria-pressed', String(b === c)));
    const cs = CASES.find((x) => x.id === c.dataset.case);
    document.getElementById('keymap').innerHTML = keyMap(cs.answers, `מסלול האבחון במקרה ${cs.label}`);
    setParam('case', c.dataset.case);
    return;
  }
  const cn = ev.target.closest('[data-conn]');
  if (cn) { setParam('c', cn.dataset.conn); render(); return; }
  const evb = ev.target.closest('[data-ev]');
  if (evb) {
    const { params } = parseRoute();
    const v = evb.dataset.ev;
    const keep = params.p ? { p: params.p } : {};
    location.hash = href('library', v && params.ev !== v ? { ev: v, ...keep } : keep); // לחיצה על הבחירה היחידה מחזירה ל"הכול"
    return;
  }
  const d = ev.target.closest('[data-changed]');
  if (d) {
    app.querySelectorAll('[data-changed]').forEach((b) => b.setAttribute('aria-pressed', String(b === d)));
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
    app.innerHTML = `<div class="layout lay-plain"><div class="card empty"><h1 class="page-title">קובץ המודלים לא נטען.</h1><p>${lines('בדקי את החיבור ורענני את הדף. אם פתחת את הקובץ ישירות מהמחשב, הפעילי שרת מקומי: npm run serve.')}</p></div></div>`;
    console.error(e);
  }
}
boot();

if ('serviceWorker' in navigator && /^\/(index\.html)?$/.test(location.pathname)) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
