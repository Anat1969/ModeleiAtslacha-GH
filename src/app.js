// מתאם מודלים: ממשק. כל הטקסט התוכני מגיע מ-data/models.json, וההתאמה מ-matcher.js.
// כל דף הוא קומפוזיציה בגובה המסך: מוקד גרפי אחד, וטורי צד. בנייד: לשוניות במקום גלילה.
import { match, findModel, labelOf, titleOf, QUESTION_KEYS, suggest } from './matcher.js';
import { attachVoice } from './voice.js';
import { glyph, driftChart, optionGlyph, DiagnosisCube, EV_COLOR } from './graphics.js';
let demoTimer = null;

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

// ---------- רכיבים משותפים להיררכיה ----------
// כותרת אזור: אותו מספר ואותו שם באותו מקום בכל דף. 1 היכרות, 2 הבנה, 3 יישום.
const zone = (n, t) => `<div class="zone"><span class="zn num">${n}</span><span>${esc(t)}</span></div>`;
const EV_SCORE = { strong: 3, partial: 2, anecdotal: 1, untested: 0 };
const catOf = (id) => DATA.categories.find((c) => c.id === id);
const modelsIn = (catId) => DATA.models.filter((m) => m.category === catId);
const modelHref = (m) => href(`library/${m.category}/${m.id}`);
const catHref = (c) => href(`library/${c.id}`);

// תחומים כסדרות קטנות: עמודה לכל תחום, ריבוע לכל מודל בצבע הראיות שלו
function domainsChart() {
  return `<div class="domains">${DATA.categories.map((c, ci) => {
    const ms = modelsIn(c.id).slice().sort((a, b) => EV_SCORE[b.evidence] - EV_SCORE[a.evidence]);
    return `<div class="dom" style="--d:${ci * 60}ms">
      <div class="dom-stack">${ms.map((m, i) => `<a class="unit-sq pop" style="--d:${ci * 60 + i * 50}ms;background:${EV_COLOR[m.evidence]}" href="${modelHref(m)}" title="${esc(m.name)}: ${esc(DATA.meta.evidenceLevels[m.evidence].label)}"><span>${esc(m.short || m.name)}</span></a>`).join('')}</div>
      <span class="num dom-n">${ms.length}</span>
      <a class="dom-name" href="${catHref(c)}">${esc(c.name)}</a>
    </div>`;
  }).join('')}</div>`;
}
function domainsConclusion() {
  const rows = DATA.categories.map((c) => { const ms = modelsIn(c.id); return { c, n: ms.length, avg: ms.reduce((s, m) => s + EV_SCORE[m.evidence], 0) / ms.length }; });
  const most = rows.slice().sort((a, b) => b.n - a.n)[0];
  const weak = rows.slice().sort((a, b) => a.avg - b.avg)[0];
  const strong = rows.slice().sort((a, b) => b.avg - a.avg)[0];
  return { most, weak, strong };
}

// מבנה האפליקציה: מאיפה באתי, איפה אני ולאן ממשיכים
function structureMap(current) {
  const node = (id, t, h) => `<a class="sm-node ${current === id ? 'on' : ''}" href="${h}">${esc(t)}</a>`;
  return `<div class="smap">
    <div class="sm-row">${node('home', 'בית', '#/')}</div>
    <div class="sm-branches">
      <div class="sm-br"><span class="num sm-n">1</span>${node('diagnose', 'אבחון', href('diagnose', { step: 0 }))}<span class="sm-arrow">←</span><span class="sm-leaf">תוצאה</span></div>
      <div class="sm-br"><span class="num sm-n">2</span>${node('library', 'ספרייה', href('library'))}<span class="sm-arrow">←</span><span class="sm-leaf">תחום</span><span class="sm-arrow">←</span><span class="sm-leaf">מודל</span></div>
      <div class="sm-br"><span class="num sm-n">3</span>${node('log', 'יומן', href('log'))}</div>
    </div>
    <div class="sm-cols" aria-label="מבנה כל דף"><span><b class="num">1</b> היכרות<small>ימין: מה זה</small></span><span><b class="num">2</b> הבנה<small>מרכז: הגרפיקה</small></span><span><b class="num">3</b> יישום<small>שמאל: מה עושים</small></span></div>
  </div>`;
}

// ---------- דף הבית ----------
function home(params) {
  const models = DATA.models, k = DATA.knowledge;
  const wrong = models.filter((m) => m.attributedTo).length;
  const log = store.get(LOG_KEY, []);
  const caseId = params.case || 'neighborhood';
  const c = CASES.find((x) => x.id === caseId) || CASES[0];
  const conn = k.connections || [];
  const ci = Math.max(0, Math.min(conn.length - 1, Number(params.c) || 0));
  const qm = findModel(DATA, k.quoteModel);
  const dc = domainsConclusion();

  const intro = `${zone(1, 'מה זה')}
    <div class="hero-num rise"><span class="big">${wrong}/${models.length}</span><span class="muted">מודלים מיוחסים לאדם הלא נכון</span></div>
    <h1 class="hero-h rise">בוחרים כלי חשיבה לפי הבעיה, לא לפי הפופולריות.</h1>
    <p class="lead rise">${lines(`חמש שאלות מאבחנות את הבעיה, ומובילות למודל ראשי ולמודל נגדי. ${models.length} מודלים ב-${DATA.categories.length} תחומים, כל אחד עם **המקור האמיתי** ו**רמת הראיות**.`)}</p>
    <div class="row rise"><a class="press btn btn-main" href="${href('diagnose', { step: 0 })}">להתחיל אבחון</a><a class="press btn" href="${href('library')}">לספרייה</a></div>
    <div class="tri">
      <div class="tone tone-problem"><h4>הבעיה</h4><p>בוחרים מודל כי הוא מוכר.</p></div>
      <div class="tone tone-solution"><h4>הפתרון</h4><p>מאבחנים קודם, ובוחרים אחר כך.</p></div>
      <div class="tone tone-insight"><h4>התובנה</h4><p>${rich(`==${k.insight}==`)}</p></div>
    </div>`;

  const stage = zone(2, 'המפה') + tabs('home', [
    { id: 'domains', label: 'התחומים', html: `<p class="cap"><strong>${esc(dc.most.c.name)}: הכי הרבה מודלים (${dc.most.n}). ${esc(dc.weak.c.name)}: הכי מעט ראיות.</strong> כל ריבוע הוא מודל, בצבע רמת הראיות שלו.</p><div class="fill chart-host">${domainsChart()}</div>${legendEv()}` },
    { id: 'space', label: 'מרחב האבחון', html: `<ol class="howto"><li><b>רוחב:</b> סוג הבעיה, מברורה לכאוטית.</li><li><b>עומק:</b> הסכמה על הבעיה, מ"כן" ל"לא".</li><li><b>גובה:</b> שכבת זמן. אתר למטה, תכולה למעלה.</li></ol><div class="fill cube-host" id="cube"></div><div class="pick" id="pick"><span class="muted">${esc('לחיצה על נקודה מציגה את המצב, המודל והאזהרה. גרירה מסובבת.')}</span></div>${legendEv()}` },
    { id: 'drift', label: 'הרעיון והתרשים', html: `<p class="cap"><strong>${esc(DATA.meta.driftTitle)}</strong> המספר: כמה שנים עברו.</p><div class="fill chart-host">${driftChart(models)}</div><div class="legend"><span><i style="background:var(--ink)"></i>הרעיון המקורי</span><span><i style="background:var(--cut)"></i>התרשים או הייחוס המוכר</span></div>` },
    { id: 'path', label: 'מסלול מקרה', html: `<p class="cap"><strong>שלושה מקרים אמיתיים.</strong> הקו עובר דרך התשובות עד לכלי.</p><div class="chips" role="group" aria-label="בחירת מקרה">${CASES.map((x) => `<button class="chip" data-case="${x.id}" aria-pressed="${x.id === c.id}">${esc(x.label)}</button>`).join('')}</div><div class="fill keymap" id="keymap">${keyMap(c.answers, `מסלול האבחון במקרה ${c.label}`)}</div><div class="legend"><span><i class="lg-path"></i>מסלול האבחון</span><span><i class="lg-on"></i>התשובה שנבחרה</span><span><i class="lg-off"></i>תשובה אפשרית</span><span><i class="lg-res"></i>התוצאה</span></div>` },
  ], params.v);

  const more = `${zone(3, 'לאן ממשיכים')}
    <h2 class="sec">מבנה האפליקציה</h2>
    ${structureMap('home')}
    <p class="src">${esc(log.length ? `ביומן: ${log.length} אבחונים.` : 'היומן ריק עד האבחון הראשון.')}</p>
    <h2 class="sec">חיבורים בין תחומים</h2>
    ${conn.length ? `<div class="card conn">
      <div class="conn-head"><strong>${esc(conn[ci].title)}</strong><span class="stepper"><button class="icon-btn" data-conn="${(ci - 1 + conn.length) % conn.length}" aria-label="החיבור הקודם">›</button><span class="num">${ci + 1}/${conn.length}</span><button class="icon-btn" data-conn="${(ci + 1) % conn.length}" aria-label="החיבור הבא">‹</button></span></div>
      <span class="label">הכלל</span><p>${rich(conn[ci].rule)}</p>
      <span class="label">התובנה</span><p>${rich('==' + conn[ci].insight + '==')}</p>
      <span class="label">מה עושים</span><p>${rich(conn[ci].action)}</p></div>` : ''}
    ${tabs('src', [
      { id: 'haiku', label: 'הייקו', html: `<p class="haiku">${k.haiku.map((l) => `<span class="line">${esc(l)}</span>`).join('')}</p><p class="src">${esc(k.haikuNote)}</p>` },
      { id: 'quote', label: 'ציטוט', html: `<blockquote class="quote"><strong>${esc(qm.quote.he)}</strong></blockquote><div class="quote-en">${esc(qm.quote.en)}</div><p class="src">${esc(qm.quote.by)} · תרגום</p>` },
    ], params.s)}
    <p class="src foot">${esc(k.inspiration)}<br>${esc(DATA.meta.tableNotice)}</p>`;

  return layout('lay-home', [
    { id: 'intro', label: '1 מה זה', html: intro },
    { id: 'stage', label: '2 המפה', html: stage },
    { id: 'more', label: '3 לאן', html: more },
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

// הצעה מתוך התיאור: מה הוצע, ואיזו מילה הובילה לכך. ההחלטה נשארת אצל המשתמשת.
function suggestBox(text, answers) {
  const { answers: sug, hits } = suggest(DATA, text);
  const keys = QUESTION_KEYS.filter((k) => sug[k]);
  if (!text || !text.trim()) return `<p class="src">כתבי או הקליטי את הבעיה, והאפליקציה תציע תשובות לפי המילים בתיאור.</p>`;
  if (!keys.length) return `<p class="src">לא זוהו מילות מפתח בתיאור. אפשר לבחור משימה מהרשימה.</p>`;
  const merged = { ...sug, ...answers };
  const first = QUESTION_KEYS.findIndex((k) => !merged[k]);
  return `<div class="sugg"><span class="label">הצעה מתוך התיאור · ${keys.length} מתוך ${QUESTION_KEYS.length}</span>
    ${keys.map((k) => `<div class="sg-row"><span class="num qn">${QUESTION_KEYS.indexOf(k)}</span><span class="sg-k">${esc(titleOf(DATA, k))}</span><strong>${esc(labelOf(DATA, k, sug[k]))}</strong><span class="sg-w">${hits[k].map((w) => `<mark class="insight">${esc(w)}</mark>`).join(' ')}</span></div>`).join('')}
    <a class="press btn btn-quiet" data-apply href="${href('diagnose', { ...merged, step: first < 0 ? 1 : Math.max(first, 1), sug: 1 })}">להחיל את ההצעה ולאשר שלב אחר שלב</a>
    <p class="src">הצעה שקופה לפי מילים, לא אבחון. כל תשובה מסומנת, ואפשר לשנות אותה.</p></div>`;
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
      <label class="label" for="desc">תיאור הבעיה, בכתב או בקול (לא חובה, נשמר ביומן)</label>
      <textarea id="desc" class="field" placeholder="למשל: תושבי הרובע חלוקים על תוכנית ההתחדשות">${esc(store.get(DRAFT_KEY, ''))}</textarea><span class="saved" aria-live="polite">נשמר</span>
      <div id="sugg">${suggestBox(store.get(DRAFT_KEY, ''), answers)}</div>`;
    body = `<div class="options opts-intent">${DATA.intents.map((o) => option(o, answers.intent === o.id, href('diagnose', { ...answers, intent: o.id, step: 1 }))).join('')}</div>`;
  } else {
    const q = DATA.questions.find((x) => x.id === key);
    const sugNote = params.sug && answers[key] ? `<p class="tone tone-insight small">ההצעה מהתיאור סימנה כאן <strong>${esc(labelOf(DATA, key, answers[key]))}</strong>. לחיצה מאשרת או משנה.</p>` : '';
    head = sugNote + `<span class="step">שאלה ${q.step} מתוך 5</span><h1 class="q-h">${esc(q.title)}</h1><p class="q-insight">${rich(q.insight)}</p><p class="muted small">${lines(q.explain)}</p><p class="src">${esc(q.source)}</p>`;
    const keep = params.sug ? { sug: 1 } : {};
    const target = (o) => (step + 1 < STEPS.length ? href('diagnose', { ...answers, [key]: o.id, step: step + 1, ...keep }) : href('result', { ...answers, [key]: o.id }));
    const opts = `<div class="options">${q.options.map((o) => option(o, answers[key] === o.id, target(o), optionGlyph(key, o.id))).join('')}</div>`;
    const m = q.modelId && key !== 'layer' ? findModel(DATA, q.modelId) : null;
    const illo = m ? `<figure class="q-fig"><div class="q-fig-g">${glyph(m)}</div><figcaption><strong>${esc(m.name)}</strong><span class="src">${esc(m.author)}, ${m.year || ''}. שרטוט מוסבר.</span><a class="press btn btn-quiet" href="${href('model/' + m.id)}">לכרטיס המקור</a></figcaption></figure>` : '';
    body = key === 'layer' ? `<div class="layer-wrap">${opts}${isoStack(answers.layer, answers)}</div>` : opts + illo;
  }
  return `<div class="layout lay-diag">${keyPath(answers, step)}<aside class="q-head">${crumbs([['בית', '#/'], ['אבחון', null]])}${head}${nav}</aside><section class="q-body scroll-in">${body}</section></div>`;
}

// ---------- תוצאה ----------
function answersRows(answers) {
  return QUESTION_KEYS.map((k, i) => `<a class="dense-link press" href="${href('diagnose', { ...answers, step: i })}"><span class="num qn">${i}</span><span class="label">${esc(titleOf(DATA, k))}</span><span class="ans">${esc(labelOf(DATA, k, answers[k]))}</span></a>`).join('');
}

function modelView(m, role, why) {
  const isCounter = role === 'counter';
  return `<div class="mview">
    <figure class="mfig">${glyph(m)}<figcaption class="small">${rich(m.graphicNote)}</figcaption></figure>
    <div class="minfo">
      <span class="role ${isCounter ? 'counter' : ''}">${isCounter ? 'מודל נגדי' : 'מודל ראשי'}</span>
      <h2 class="m-h">${esc(m.name)}</h2><span class="latin">${esc(m.nameEn)}</span>
      <p class="def">${rich(m.definition)}</p>
      <p class="ins">${rich('==' + m.insight + '==')}</p>
      ${isCounter ? `<div class="tone tone-neutral"><h4>למה דווקא הוא</h4><p>${lines(why)}</p></div>` : ''}
      ${row('מקור אמיתי', `<strong>${esc(m.author)}</strong>`)}
      ${row('שנה', yearOf(m))}
      ${row('רמת ראיות', evidence(m.evidence))}
      <a class="press btn btn-quiet" href="${modelHref(m)}">לכרטיס המלא: היכרות, הבנה ויישום</a>
    </div></div>`;
}

// מיקום יחסי: שלושה צירים מקבילים. על כל ציר: איפה הבעיה שלך, ואיפה מתאים כל מודל.
function relative(answers, primary, counter) {
  const axes = [
    { key: 'cynefin', field: 'problemTypes' },
    { key: 'agreement', field: 'agreementFit' },
    { key: 'layer', field: 'layers' },
  ];
  const models = [...primary.map((m) => ({ m, kind: 'primary' })), { m: counter, kind: 'counter' }];
  const gaps = [];
  const blocks = axes.map((ax) => {
    const q = DATA.questions.find((x) => x.id === ax.key);
    const cols = q.options.length;
    const head = `<div class="rel-row rel-head" style="--cols:${cols}"><span class="rel-lab"></span>${q.options.map((o) => `<span class="rel-col ${answers[ax.key] === o.id ? 'you' : ''}">${esc(o.label)}</span>`).join('')}</div>`;
    const you = `<div class="rel-row" style="--cols:${cols}"><span class="rel-lab"><b>הבעיה שלך</b></span>${q.options.map((o) => `<span class="rel-cell">${answers[ax.key] === o.id ? '<i class="rel-dot"></i>' : ''}</span>`).join('')}</div>`;
    const rows = models.map(({ m, kind }) => {
      const fit = m[ax.field] || [];
      if (kind === 'primary' && !fit.includes(answers[ax.key])) gaps.push(`${q.title}: ${m.name}`);
      return `<div class="rel-row" style="--cols:${cols}"><span class="rel-lab">${kind === 'counter' ? 'נגדי: ' : ''}${esc(m.short || m.name)}</span>${q.options.map((o) => `<span class="rel-cell"><i class="rel-bar ${kind} ${fit.includes(o.id) ? 'on' : ''}"></i></span>`).join('')}</div>`;
    }).join('');
    return `<div class="rel-axis"><h3 class="rel-t"><span class="num qn">${q.step}</span>${esc(q.title)}</h3>${head}${you}${rows}</div>`;
  }).join('');
  const verdict = gaps.length
    ? `<div class="tone tone-problem"><h4>פער: הבעיה שלך מחוץ לטווח של המודל הראשי</h4><p>${gaps.map((g) => `<span class="line">${esc(g)}</span>`).join('')}</p></div>`
    : `<div class="tone tone-solution"><h4>בלי פער: הבעיה בתוך הטווח של המודל הראשי בשלושת הצירים</h4><p>המודל הנגדי מראה מה נשאר בחוץ.</p></div>`;
  return `<p class="cap"><strong>איפה הבעיה שלך, ביחס לכל מודל.</strong> פס כהה: המודל הראשי מתאים. פס מקווקו: המודל הנגדי. נקודה אדומה: התשובה שלך.</p>${verdict}<div class="rel scroll-in">${blocks}</div>`;
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

  const s = r.state;
  const entry = store.get(LOG_KEY, []).find((e) => e.sig === JSON.stringify(answers));
  const checkRow = (c) => `<tr><td class="num">${QUESTION_KEYS.indexOf(c.key)}</td><td>${esc(titleOf(DATA, c.key))}</td><td><strong>${esc(labelOf(DATA, c.key, c.value))}</strong></td><td>${c.kind === 'requires' ? 'תנאי חובה' : c.kind === 'intent' ? 'משימה' : 'העדפה'}</td><td class="${c.pass ? 'ok-t' : c.kind === 'prefers' ? 'soft-t' : 'no-t'}">${c.pass ? 'מתאים' : c.kind === 'intent' ? 'הוחלפה במסגור' : 'חלקי'}</td></tr>`;
  const sorted = r.checks.slice().sort((a, b) => QUESTION_KEYS.indexOf(a.key) - QUESTION_KEYS.indexOf(b.key) || (a.kind === 'requires' ? -1 : 1));

  const summary = `${zone(1, 'האבחון')}${base}
    <h1 class="page-title">${rich(s.insight)}</h1>
    <p class="small"><strong>${esc(s.title)}</strong>${s.fromTable === false ? ' · נוסף לטבלה' : ''}</p>
    <div class="fit-row"><span class="num fit-n">${r.fit}%</span><span class="small muted">התאמה לקריטריונים</span></div>
    ${r.status === 'framing' ? `<div class="tone tone-insight"><h4>אין כאן פתרון. יש תהליך מסגור.</h4><p>${lines('בבעיה מרושעת כל הגדרה היא עמדה. המטרה: סבב שיפור מוסכם.')}</p></div>` : ''}
    ${r.notes.filter((n) => r.status !== 'framing' || !n.includes('אין כאן פתרון')).map((n) => `<div class="tone tone-neutral"><p>${lines(n)}</p></div>`).join('')}
    <div class="tone tone-problem"><h4>תווית אזהרה</h4><p>${lines(s.warning)}</p></div>
    <h2 class="sec">התשובות שלך, לפי סדר השאלות</h2>${answersRows(answers)}`;

  const views = [
    ...r.primary.map((m) => ({ id: m.id, label: `ראשי: ${m.short || m.name}`, html: modelView(m, 'primary') })),
    { id: 'counter', label: `נגדי: ${r.counter.model.short || r.counter.model.name}`, html: modelView(r.counter.model, 'counter', r.counter.why) },
    { id: 'rel', label: 'מיקום יחסי', html: relative(answers, r.primary, r.counter.model) },
    { id: 'path', label: 'המסלול', html: `<div class="fill keymap">${keyMap(answers, 'המסלול שלך')}</div>` },
    { id: 'calc', label: 'איך חושב', html: `<div class="scroll-in"><p class="cap"><strong>כל שאלה נבדקת מול הקריטריונים של המצב, לפי סדר השאלות.</strong></p><table class="checks"><thead><tr><th>#</th><th>שאלה</th><th>תשובה</th><th>סוג</th><th>תוצאה</th></tr></thead><tbody>${sorted.map(checkRow).join('')}</tbody></table><p class="src">${lines('אחוז ההתאמה: חלק הקריטריונים שהתקיימו. תנאי חובה שלא מתקיים עוצר את ההמלצה.')}</p><p class="src">${esc(DATA.meta.tableNotice)} ${esc(DATA.meta.sourcesNotice)}</p></div>` },
  ];

  const act = `${zone(3, 'יישום ובקרה')}
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
    </div>
    <button class="press btn btn-main a4-btn" data-print>דוח A4 לישיבה</button>
    <p class="src">דוח של עמוד אחד: האבחון, המודלים, הצעדים ושאלת הבקרה. אפשר לשמור אותו כ-PDF.</p>`;

  return layout('lay-result', [
    { id: 'sum', label: '1 האבחון', html: summary },
    { id: 'models', label: '2 המודלים', html: zone(2, 'המודלים') + tabs('res', views, params.v) },
    { id: 'act', label: '3 יישום', html: act },
  ], params) + report(answers, r, entry);
}

// ---------- דוח A4: עמוד אחד לישיבה, מוצג רק בהדפסה ----------
function report(answers, r, entry) {
  const s = r.state;
  const today = new Date();
  const fmt = (d) => d.toLocaleDateString('he-IL');
  const recheck = new Date((entry ? +new Date(entry.date) : +today) + 30 * DAY);
  const desc = entry?.description || store.get(DRAFT_KEY, '');
  const mcol = (m, role, why) => `<div class="rp-model">
    <span class="rp-role">${role}</span>
    <div class="rp-mhead"><div><h3>${esc(m.name)}</h3><p class="rp-src">${esc(m.author)}${m.year ? `, <span class="num">${m.year}</span>` : ''} · ${esc(DATA.meta.evidenceLevels[m.evidence].label)}</p></div><div class="rp-g">${glyph(m)}</div></div>
    <p>${rich(m.definition)}</p>
    <p class="rp-ins">${rich('==' + m.insight + '==')}</p>
    ${why ? `<p class="rp-small">${rich(why)}</p>` : ''}
    <p class="rp-small"><strong>מתי מטעה:</strong> ${rich(m.misleading)}</p>
  </div>`;
  return `<article class="print-report" aria-hidden="true">
    <header class="rp-head"><div><strong>מתאם מודלים</strong> · דוח אבחון</div><div class="num">${fmt(today)}</div></header>
    ${desc ? `<p class="rp-desc"><span class="rp-lab">הבעיה</span>${esc(desc)}</p>` : ''}
    <section class="rp-top">
      <div><span class="rp-lab">מצב מאובחן</span><h1>${rich(s.insight)}</h1><p><strong>${esc(s.title)}</strong> · התאמה <span class="num">${r.fit}%</span></p>
        ${r.status === 'framing' ? '<p class="rp-box rp-insight"><strong>אין כאן פתרון. יש תהליך מסגור.</strong></p>' : ''}
        <p class="rp-box rp-warn"><strong>תווית אזהרה:</strong> ${rich(s.warning)}</p></div>
      <table class="rp-ans"><tbody>${QUESTION_KEYS.map((k, i) => `<tr><td class="num">${i}</td><td>${esc(titleOf(DATA, k))}</td><td><strong>${esc(labelOf(DATA, k, answers[k]))}</strong></td></tr>`).join('')}</tbody></table>
    </section>
    <section class="rp-models">${r.primary.map((m) => mcol(m, 'מודל ראשי')).join('')}${mcol(r.counter.model, 'מודל נגדי', r.counter.why)}</section>
    <section class="rp-steps"><span class="rp-lab">שלושה צעדי יישום</span><ol>${s.steps.map((x, i) => `<li><span class="num">${i + 1}</span>${rich(x)}</li>`).join('')}</ol></section>
    <section class="rp-control"><span class="rp-lab">שאלת בקרה</span>
      <p><strong>האם המודל שינה החלטה?</strong> <span class="rp-check">כן</span><span class="rp-check">חלקית</span><span class="rp-check">לא</span> <span class="rp-small">בדיקה חוזרת: <span class="num">${fmt(recheck)}</span></span></p>
      <p class="rp-small">${esc(r.primary[0].control)}</p>
      <div class="rp-lines"><i></i><i></i></div></section>
    <footer class="rp-foot">${esc(DATA.meta.tableNotice)} · modeleiatslacha-gh.vercel.app</footer>
  </article>`;
}

function mountResult() {}

// ---------- ספרייה: דף ראשי, תחום, מודל ----------
// כרטיס אחיד: כל פרט באותו מקום בכל כרטיס, בלי קשר לאורך הטקסט.
function modelCard(m, i = 0) {
  return `<a class="card press mcard rise" style="animation-delay:${i * 0.03}s" href="${modelHref(m)}">
    <span class="mc-year num">${m.year || '?'}</span>
    <div class="mc-g">${glyph(m)}</div>
    <h3 class="mc-name" title="${esc(m.name)}">${esc(m.name)}</h3>
    <p class="mc-ins">${esc(m.insight)}</p>
    <p class="mc-author" title="${esc(m.author)}">${esc(m.author)}</p>
    <div class="mc-ev">${evidence(m.evidence)}</div>
    <span class="mc-flag">${m.attributedTo ? 'ייחוס שגוי נפוץ' : m.inMatcher === false ? 'בספרייה, לא בטבלת ההתאמה' : ''}</span>
  </a>`;
}

function libraryHome(params) {
  const dc = domainsConclusion();
  const intro = `${zone(1, 'מה יש כאן')}${crumbs([['בית', '#/'], ['ספרייה', null]])}
    <h1 class="page-title">${DATA.models.length} מודלים, ${DATA.categories.length} תחומי ידע.</h1>
    <p class="lead">${lines(`בחרי תחום, ואחריו מודל. בכל מודל: **היכרות**, **הבנה** ו**יישום**, ובסוף המקורות.`)}</p>
    <div class="tone tone-insight"><h4>התובנה</h4><p>${lines(`==${dc.most.c.name}: הכי הרבה מודלים.== הם נולדו מבעיות של עיר ומדיניות, ולא מעסקים.`)}</p></div>
    <div class="tone tone-problem"><h4>הכי מעט ראיות</h4><p>${lines(`${dc.weak.c.name}. ${dc.weak.c.insight}`)}</p></div>
    <div class="tone tone-solution"><h4>הכי הרבה ראיות</h4><p>${lines(`${dc.strong.c.name}. ${dc.strong.c.insight}`)}</p></div>
    ${legendEv()}`;
  const grid = `${zone(2, 'התחומים')}<div class="cat-grid scroll-in">${DATA.categories.map((c, i) => {
    const ms = modelsIn(c.id);
    return `<a class="card press ccard rise" style="animation-delay:${i * 0.04}s" href="${catHref(c)}">
      <span class="cc-n num">${ms.length}</span>
      <h3 class="cc-name">${esc(c.name)}</h3>
      <p class="cc-ins">${rich('==' + c.insight + '==')}</p>
      <div class="cc-units">${ms.map((m) => `<i style="background:${EV_COLOR[m.evidence]}" title="${esc(m.name)}"></i>`).join('')}</div>
      <p class="cc-list">${ms.map((m) => esc(m.short || m.name)).join(' · ')}</p>
    </a>`;
  }).join('')}</div>`;
  return layout('lay-lib', [
    { id: 'grid', label: '2 התחומים', html: grid },
    { id: 'intro', label: '1 מה יש כאן', html: intro },
  ], params);
}

function categoryPage(c, params) {
  const ms = modelsIn(c.id);
  const levels = Object.keys(DATA.meta.evidenceLevels);
  const intro = `${zone(1, 'התחום')}${crumbs([['בית', '#/'], ['ספרייה', href('library')], [c.name, null]])}
    <h1 class="page-title">${esc(c.name)}</h1>
    <p class="cat-ins">${rich('==' + c.insight + '==')}</p>
    <p class="small">${lines(c.why)}</p>
    <h2 class="sec">הראיות בתחום</h2>
    ${levels.map((l) => { const n = ms.filter((m) => m.evidence === l).length; return `<div class="hbar"><span class="label">${esc(DATA.meta.evidenceLevels[l].label)}</span><span class="hb"><i class="grow-x" style="width:${(100 * n) / ms.length}%;background:${EV_COLOR[l]}"></i></span><span class="num">${n}</span></div>`; }).join('')}
    <h2 class="sec">תחומים אחרים</h2>
    <div class="sib">${DATA.categories.filter((x) => x.id !== c.id).map((x) => `<a class="dense-link press" href="${catHref(x)}"><span>${esc(x.name)}</span><span class="num">${modelsIn(x.id).length}</span></a>`).join('')}</div>`;
  const grid = `${zone(2, 'המודלים בתחום')}<div class="lib-grid scroll-in">${ms.map(modelCard).join('')}</div>`;
  return layout('lay-lib', [
    { id: 'grid', label: '2 המודלים', html: grid },
    { id: 'intro', label: '1 התחום', html: intro },
  ], params);
}

function modelPage(m, params) {
  const c = catOf(m.category);
  const ms = modelsIn(c.id), idx = ms.indexOf(m);
  const prev = ms[(idx - 1 + ms.length) % ms.length], next = ms[(idx + 1) % ms.length];
  const lab = (key, vals) => vals.map((v) => esc(labelOf(DATA, key, v))).join(', ');
  const asPrimary = DATA.states.filter((s) => s.primary.includes(m.id));
  const asCounter = DATA.states.filter((s) => s.counter.id === m.id);
  const fact = (label, value, title) => `<div class="fact"><span class="label">${esc(label)}</span><span class="fact-v" title="${esc(title || '')}">${value}</span></div>`;

  // פס עובדות קבוע: אותם שישה פרטים, באותו רוחב ובאותו מקום בכל מודל
  const facts = `<div class="factbar">
    ${fact('מקור אמיתי', `<strong>${esc(m.author)}</strong>`, m.author)}
    ${fact('שנה', yearOf(m))}
    ${fact('תחום', `<a href="${catHref(c)}">${esc(c.name)}</a>`)}
    ${fact('רמת ראיות', evidence(m.evidence))}
    ${fact('סוג בעיה', lab('cynefin', m.problemTypes), lab('cynefin', m.problemTypes))}
    ${fact('שכבת זמן', lab('layer', m.layers), lab('layer', m.layers))}
  </div>`;

  const know = `${zone(1, 'היכרות')}
    <h2 class="sub">הגדרה</h2><p class="def big">${rich(m.definition)}</p>
    <h2 class="sub">תובנה</h2><p class="ins big">${rich('==' + m.insight + '==')}</p>
    <h2 class="sub">שיר</h2><p class="haiku">${m.haiku.map((l) => `<span class="line">${esc(l)}</span>`).join('')}</p>
    <h2 class="sub">מה הביא לגילוי</h2><p class="small">${lines(m.story)}</p>
    ${m.correction ? `<div class="tone tone-insight"><h4>הייחוס והתרשים</h4><p>${m.attributedTo ? `<span class="was">${rich(m.attributedTo)}</span><br>` : ''}${lines(m.correction)}</p>${m.drift ? `<p class="small"><strong>${m.drift[0].year} ← ${m.drift[1].year}:</strong> ${m.drift[1].year - m.drift[0].year} שנים מהרעיון לתרשים.</p>` : ''}</div>` : ''}`;

  const frames = m.demo.frames;
  const understand = `${zone(2, 'הבנה')}
    <figure class="bigfig">${glyph(m)}</figure>
    <h2 class="sub">מה השרטוט מראה</h2><p class="small">${lines(m.graphicNote)}</p>
    <h2 class="sub">הדגמה בדרך של המודל: ${esc(m.demo.title)}</h2>
    <div class="demo" data-demo>
      <ol class="demo-list">${frames.map((f, i) => `<li class="demo-f ${i === 0 ? 'on' : ''}" data-f="${i}"><span class="num demo-n">${i + 1}</span><span>${rich(f)}</span></li>`).join('')}</ol>
      <div class="demo-ctl"><button class="icon-btn" data-step="-1" aria-label="השלב הקודם">›</button><span class="num demo-pos">1/${frames.length}</span><button class="icon-btn" data-step="1" aria-label="השלב הבא">‹</button><button class="press btn btn-quiet" data-play>הפעלה</button></div>
    </div>
    <h2 class="sub">דוגמאות</h2>
    <div class="ex-grid">${m.examples.map((e) => `<div class="ex"><span class="label">${esc(e.t)}</span><p class="small">${rich(e.x)}</p></div>`).join('')}</div>`;

  const apply = `${zone(3, 'יישום')}
    <h2 class="sub">מי יישם</h2>
    ${m.applied && m.applied.length ? `<ul class="applied">${m.applied.map((a) => `<li><span class="num ap-y">${a.year || ''}</span><span><strong>${esc(a.who)}</strong><br><span class="small">${esc(a.what)}</span></span></li>`).join('')}</ul>` : '<p class="small muted">לא נמצא יישום מתועד במחקר. זה לבדו סימן אזהרה.</p>'}
    <div class="tone tone-problem"><h4>מתי מטעה</h4><p>${lines(m.misleading)}</p></div>
    <div class="tone tone-problem"><h4>שימוש שגוי נפוץ</h4><p>${lines(m.misuse)}</p></div>
    <div class="tone tone-insight"><h4>שאלת בקרה</h4><p>${rich('==' + m.control + '==')}</p></div>
    <h2 class="sub">מה אומרות הראיות</h2><p class="small">${lines(m.evidenceNote)}</p>
    <h2 class="sub">באבחון</h2>
    ${asPrimary.length || asCounter.length ? `${asPrimary.map((s) => `<a class="dense-link press" href="${href('result', s.sample)}"><span class="label">ראשי</span><span>${esc(s.title)}</span></a>`).join('')}${asCounter.map((s) => `<a class="dense-link press" href="${href('result', s.sample)}"><span class="label">נגדי</span><span>${esc(s.title)}</span></a>`).join('')}` : `<p class="small muted">${m.inMatcher === false ? 'בספרייה בלבד. לפי הדוח, מודל נכנס לטבלה רק אחרי שהוא שינה החלטה אחת לפחות.' : 'לא מופיע באף מצב.'}</p>`}
    <h2 class="sub">פוסט מוכן לשיתוף</h2>
    <div class="post"><p class="post-t">${m.post.split('\n').map((l) => `<span class="line">${esc(l)}</span>`).join('')}</p>
      <div class="row"><button class="press btn btn-quiet" data-copy="post">העתקת הפוסט</button><span class="saved copied" aria-live="polite">הועתק</span><span class="src num">${m.post.split(/\s+/).length} מילים</span></div></div>
    <details class="sources-d"><summary><span class="label">מקורות (${m.sources.length})</span></summary>
      <ol class="sources">${m.sources.map((s) => `<li>${esc(s.text)}${s.url ? ` <a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.url.replace('https://', ''))}</a>` : ''}</li>`).join('')}</ol><p class="src">${esc(DATA.meta.sourcesNotice)}</p></details>`;

  const head = `<div class="mhead">${crumbs([['בית', '#/'], ['ספרייה', href('library')], [c.name, catHref(c)], [m.name, null]])}
    <div class="mtitle"><h1 class="page-title">${esc(m.name)} <span class="latin">${esc(m.nameEn)}</span></h1>
    <div class="pager"><a class="icon-btn" href="${modelHref(prev)}" aria-label="הקודם בתחום: ${esc(prev.name)}" title="${esc(prev.name)}">›</a><span class="num">${idx + 1}/${ms.length}</span><a class="icon-btn" href="${modelHref(next)}" aria-label="הבא בתחום: ${esc(next.name)}" title="${esc(next.name)}">‹</a></div></div>${facts}</div>`;
  return `<div class="model-wrap">${head}${layout('lay-model', [
    { id: 'know', label: '1 היכרות', html: know },
    { id: 'understand', label: '2 הבנה', html: understand },
    { id: 'apply', label: '3 יישום', html: apply },
  ], params)}</div>`;
}

function library(parts, params) {
  if (!parts[1]) return libraryHome(params);
  const c = catOf(parts[1]);
  if (!c) return `<div class="layout lay-plain"><div class="card empty"><h1 class="page-title">התחום לא נמצא.</h1><a class="press btn btn-main" href="${href('library')}">לספרייה</a></div></div>`;
  if (!parts[2]) return categoryPage(c, params);
  const m = DATA.models.find((x) => x.id === parts[2] && x.category === c.id);
  if (!m) return `<div class="layout lay-plain"><div class="card empty"><h1 class="page-title">המודל לא נמצא.</h1><a class="press btn btn-main" href="${catHref(c)}">לתחום</a></div></div>`;
  return modelPage(m, params);
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
  else if (page === 'library') html = library(parts, params);
  else if (page === 'model') { const m = DATA.models.find((x) => x.id === parts[1]); if (m) { location.replace(modelHref(m)); return; } html = library(['library'], params); }
  else if (page === 'log') html = logPage(params);
  else html = home(params);
  app.innerHTML = html;
  setTabs(page === 'model' ? 'library' : page === 'result' ? 'diagnose' : page);
  if (demoTimer) { clearInterval(demoTimer); demoTimer = null; }
  setMenuItems(page);
  if (page === 'home') mountHome();
  if (page === 'result') mountResult();
  app.querySelectorAll('textarea.field').forEach((f) => attachVoice(f));
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

// הדגמה: כל השלבים גלויים, והשלב הנוכחי מודגש
function demoPos(box) { const fs = [...box.querySelectorAll('.demo-f')]; box.querySelector('.demo-pos').textContent = `${fs.findIndex((f) => f.classList.contains('on')) + 1}/${fs.length}`; }
function demoGo(box, d, wrap = true) {
  const fs = [...box.querySelectorAll('.demo-f')];
  const i = fs.findIndex((f) => f.classList.contains('on'));
  let n = i + d;
  if (n >= fs.length || n < 0) { if (!wrap) return false; n = (n + fs.length) % fs.length; }
  fs.forEach((f, k) => f.classList.toggle('on', k === n)); demoPos(box);
  return true;
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
  const st = ev.target.closest('[data-step]');
  if (st) { if (demoTimer) { clearInterval(demoTimer); demoTimer = null; } demoGo(st.closest('[data-demo]'), Number(st.dataset.step)); return; }
  const pl = ev.target.closest('[data-play]');
  if (pl) {
    const box = pl.closest('[data-demo]');
    if (demoTimer) { clearInterval(demoTimer); demoTimer = null; pl.textContent = 'הפעלה'; return; }
    box.querySelectorAll('.demo-f').forEach((f, i) => f.classList.toggle('on', i === 0)); demoPos(box);
    pl.textContent = 'עצירה';
    demoTimer = setInterval(() => { if (!demoGo(box, 1, false)) { clearInterval(demoTimer); demoTimer = null; pl.textContent = 'הפעלה'; } }, 2200);
    return;
  }
  const df = ev.target.closest('.demo-f');
  if (df) { const box = df.closest('[data-demo]'); box.querySelectorAll('.demo-f').forEach((f) => f.classList.toggle('on', f === df)); demoPos(box); return; }
  if (ev.target.closest('[data-print]')) { print(); return; }
  const cp = ev.target.closest('[data-copy]');
  if (cp) {
    const text = [...cp.closest('.post').querySelectorAll('.post-t .line')].map((l) => l.textContent).join('\n');
    const done = () => { const el = cp.parentElement.querySelector('.copied'); el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 1600); };
    (navigator.clipboard?.writeText(text) || Promise.reject()).then(done).catch(() => { const t = document.createElement('textarea'); t.value = text; document.body.append(t); t.select(); try { document.execCommand('copy'); done(); } catch {} t.remove(); });
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
  if (ev.target.id === 'desc') {
    if (store.set(DRAFT_KEY, ev.target.value)) flashSaved();
    const box = document.getElementById('sugg');
    if (box) box.innerHTML = suggestBox(ev.target.value, answersFrom(parseRoute().params));
  }
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
