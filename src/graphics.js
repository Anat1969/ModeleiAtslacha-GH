// גרפיקה מוסברת: פונקציות שמחזירות SVG, ומרחב אבחון תלת־ממדי שמסתובב.
// כל הטקסט התוכני מגיע מ-data/models.json. כאן רק צורה.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// טקסט עברי ב-SVG: כיוון מפורש על האלמנט עצמו, כדי שעברית ומספר לא יתהפכו.
const T = (x, y, s, cls = 'g-t', anchor = 'middle') =>
  `<text class="${cls}" x="${x}" y="${y}" direction="rtl" text-anchor="${anchor === 'start' ? 'end' : anchor === 'end' ? 'start' : 'middle'}">${esc(s)}</text>`;
const svg = (w, h, body, label) => `<svg class="glyph" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">${body}</svg>`;

export const EV_COLOR = { strong: 'var(--ev-strong)', partial: 'var(--ev-partial)', anecdotal: 'var(--ev-anecdotal)', untested: 'var(--ev-untested)' };

// ---------- שרטוט מוסבר לכל מודל ----------
const G = {
  eisenhower: () => `
    <rect class="g-line" x="30" y="10" width="110" height="80"/><line class="g-line" x1="85" y1="10" x2="85" y2="90"/><line class="g-line" x1="30" y1="50" x2="140" y2="50"/>
    <rect class="g-mark draw-fill" x="31" y="11" width="53" height="38"/>
    ${T(57, 33, 'חשוב, לא דחוף', 'g-s g-b')}${T(112, 33, 'עכשיו')}${T(112, 73, 'להאציל?')}${T(57, 73, 'לוותר')}
    ${T(85, 104, 'דחוף ←', 'g-s')}${T(16, 52, 'חשוב', 'g-s')}`,
  raci: () => {
    let b = ''; const cols = ['R', 'A', 'C', 'I'];
    cols.forEach((c, i) => { b += `<text class="g-s" x="${52 + i * 26}" y="16" text-anchor="middle">${c}</text>`; });
    [0, 1, 2].forEach((r) => {
      b += T(24, 38 + r * 24, `שלב ${r + 1}`, 'g-s');
      cols.forEach((c, i) => { b += `<rect class="${i === 1 ? 'g-ink' : 'g-cell'}" x="${42 + i * 26}" y="${26 + r * 24}" width="20" height="18"/>`; });
    });
    return b + T(80, 104, 'מאשר אחד בכל שורה', 'g-s');
  },
  swot: () => `
    <rect class="g-line" x="70" y="12" width="80" height="70"/><line class="g-line" x1="110" y1="12" x2="110" y2="82"/><line class="g-line" x1="70" y1="47" x2="150" y2="47"/>
    <text class="g-s" x="90" y="34" text-anchor="middle">S</text><text class="g-s" x="130" y="34" text-anchor="middle">W</text><text class="g-s" x="90" y="69" text-anchor="middle">O</text><text class="g-s" x="130" y="69" text-anchor="middle">T</text>
    <path class="g-arrow draw" d="M68 47 H38" marker-end="url(#ah)"/>
    <rect class="g-ink" x="6" y="34" width="30" height="26"/><text class="g-w" x="21" y="51" text-anchor="middle">?</text>
    ${T(80, 102, 'מחויב לשאלה אחת', 'g-s')}`,
  'five-forces': () => {
    const c = [80, 52], pts = [[80, 12], [140, 52], [80, 92], [20, 52]];
    return pts.map(([x, y]) => `<path class="g-arrow draw" d="M${x} ${y} L${c[0] + (x - c[0]) * 0.32} ${c[1] + (y - c[1]) * 0.32}" marker-end="url(#ah)"/><circle class="g-cell" cx="${x}" cy="${y}" r="8"/>`).join('') +
      `<circle class="g-ink" cx="80" cy="52" r="11"/>${T(80, 108, '4 כוחות סביב התחרות', 'g-s')}`;
  },
  jtbd: () => `
    <circle class="g-cell" cx="132" cy="50" r="12"/>${T(132, 76, 'עכשיו', 'g-s')}
    <path class="g-arrow draw" d="M118 50 C 95 20, 65 80, 42 50" marker-end="url(#ah)"/>
    <circle class="g-ink" cx="30" cy="50" r="12"/>${T(30, 76, 'התקדמות', 'g-s')}
    ${T(80, 102, 'שוכרים פתרון כדי להתקדם', 'g-s')}`,
  kano: () => `
    <line class="g-line" x1="80" y1="8" x2="80" y2="92"/><line class="g-line" x1="12" y1="50" x2="150" y2="50"/>
    <path class="g-curve draw" d="M14 86 L146 14"/>
    <path class="g-curve g-red draw" d="M14 94 Q 70 52, 146 51"/>
    <path class="g-curve g-green draw" d="M14 49 Q 100 49, 146 8"/>
    ${T(36, 104, 'חובה', 'g-s g-red-t')}${T(80, 104, 'ליניארית', 'g-s')}${T(128, 104, 'מושכת', 'g-s g-green-t')}`,
  okr: () => `
    <rect class="g-ink" x="40" y="8" width="80" height="20"/><text class="g-w" x="80" y="22" direction="rtl" text-anchor="middle">מטרה</text>
    ${[0.8, 0.5, 0.3].map((f, i) => `<line class="g-line" x1="80" y1="28" x2="${36 + i * 44}" y2="44"/><rect class="g-cell" x="${18 + i * 44}" y="46" width="36" height="40"/><rect class="g-fill grow-y" x="${18 + i * 44}" y="${46 + 40 * (1 - f)}" width="36" height="${40 * f}"/>`).join('')}
    ${T(80, 104, 'תוצאות, לא פעילות', 'g-s')}`,
  'reference-class': () => {
    const h = [6, 14, 26, 30, 22, 15, 10, 7, 5, 3, 2, 2];
    return h.map((v, i) => `<rect class="g-fill grow-y" style="--d:${i * 40}ms" x="${14 + i * 11}" y="${84 - v * 2}" width="9" height="${v * 2}"/>`).join('') +
      `<line class="g-arrow" x1="10" y1="84" x2="154" y2="84" marker-end="url(#ah)"/><line class="g-red-l" x1="18" y1="11" x2="18" y2="86"/><line class="g-ink-l" x1="64" y1="18" x2="64" y2="86"/>
       ${T(40, 7, 'התחזית שלך', 'g-s g-red-t')}${T(80, 100, 'החריגה בפועל', 'g-s')}${T(136, 100, 'זנב', 'g-s')}`;
  },
  'rittel-webber': () => {
    let d = '';
    for (let i = 0; i <= 120; i++) { const t = (i / 120) * 5.2 * Math.PI, r = 3 + t * 2.4; d += `${i ? 'L' : 'M'}${(80 + r * Math.cos(t)).toFixed(1)} ${(50 + r * Math.sin(t) * 0.92).toFixed(1)} `; }
    return `<path class="g-curve draw" d="${d}" marker-end="url(#ah)"/>${T(80, 104, 'סבבים, בלי נקודת סיום', 'g-s')}`;
  },
  arnstein: () => {
    let b = '<line class="g-line" x1="58" y1="6" x2="58" y2="92"/><line class="g-line" x1="102" y1="6" x2="102" y2="92"/>';
    for (let i = 0; i < 8; i++) {
      const y = 88 - i * 11, cls = i < 2 ? 'g-red-l' : i < 5 ? 'g-amber-l' : 'g-green-l';
      b += `<line class="${cls}" x1="58" y1="${y}" x2="102" y2="${y}"/>`;
    }
    return b + T(132, 82, 'אי-השתתפות', 'g-s g-red-t') + T(132, 56, 'טוקניזם', 'g-s g-amber-t') + T(132, 22, 'כוח אזרחי', 'g-s g-green-t') + T(28, 62, 'יידוע = 3', 'g-s');
  },
  cynefin: () => `
    <rect class="g-line" x="20" y="8" width="120" height="84"/><line class="g-line" x1="80" y1="8" x2="80" y2="92"/><line class="g-line" x1="20" y1="50" x2="140" y2="50"/>
    <rect class="g-mark" x="21" y="9" width="58" height="40"/>
    ${T(50, 33, 'מורכבת', 'g-t g-b')}${T(110, 33, 'מסובכת')}${T(50, 75, 'כאוטית')}${T(110, 75, 'ברורה')}
    ${T(80, 106, 'סיבה ותוצאה קובעות את הדרך', 'g-s')}`,
  'bloom-revised': () => {
    let b = '';
    for (let i = 0; i <= 6; i++) b += `<line class="g-grid" x1="${20 + i * 20}" y1="10" x2="${20 + i * 20}" y2="86"/>`;
    for (let j = 0; j <= 4; j++) b += `<line class="g-grid" x1="20" y1="${10 + j * 19}" x2="140" y2="${10 + j * 19}"/>`;
    [[1, 3], [2, 2], [5, 1], [4, 3], [6, 0], [3, 1]].forEach(([x, y], i) => { b += `<circle class="g-ink pop" style="--d:${i * 80}ms" cx="${10 + x * 20}" cy="${19 + y * 19}" r="5"/>`; });
    return b + T(80, 102, 'מפה של ידע ותהליך, לא סולם', 'g-s');
  },
  'ikigai-kamiya': () => `
    ${[[30, 26], [130, 26], [30, 78], [130, 78]].map(([x, y]) => `<circle class="g-cell" cx="${x}" cy="${y}" r="7"/><path class="g-arrow draw" d="M${x + (80 - x) * 0.2} ${y + (52 - y) * 0.2} L${x + (80 - x) * 0.7} ${y + (52 - y) * 0.7}" marker-end="url(#ah)"/>`).join('')}
    <circle class="g-ink" cx="80" cy="52" r="13"/>
    ${T(80, 104, 'מישהו צריך אותי', 'g-s')}`,
  pareto: () => {
    const v = [34, 22, 14, 9, 7, 5, 4, 3, 2];
    let acc = 0, line = '';
    const bars = v.map((x, i) => { acc += x; const X = 144 - i * 14; line += `${i ? 'L' : 'M'}${X - 5} ${86 - acc * 0.76} `; return `<rect class="g-fill grow-y" style="--d:${i * 40}ms" x="${X - 11}" y="${86 - x * 2}" width="11" height="${x * 2}"/>`; }).join('');
    return bars + `<line class="g-line" x1="16" y1="86" x2="150" y2="86"/><path class="g-curve g-red draw" d="${line}"/>${T(80, 102, 'סופרים, לא מניחים 80/20', 'g-s')}`;
  },
  'shearing-layers': () => {
    const L = [['אתר', 140], ['מבנה', 112], ['מעטפת', 72], ['מערכות', 52], ['חלוקה', 36], ['תכולה', 14]];
    return L.map(([n, w], i) => `<rect class="g-fill grow-x" style="--d:${i * 60}ms" x="8" y="${8 + i * 14}" width="${w * 0.72}" height="10"/><text class="g-s" x="156" y="${16 + i * 14}" direction="rtl" text-anchor="start">${n}</text>`).join('') +
      T(80, 104, 'כל שכבה בקצב אחר', 'g-s');
  },
  maslow: () => `
    <path class="g-line g-faint" d="M30 88 L60 18 L90 88 Z"/><line class="g-red-l" x1="26" y1="92" x2="94" y2="14"/>
    ${[40, 30, 46, 26, 36].map((h, i) => `<rect class="g-fill grow-y" style="--d:${i * 60}ms" x="${104 + i * 10}" y="${88 - h}" width="7" height="${h}"/>`).join('')}
    ${T(60, 104, 'לא סולם', 'g-s g-red-t')}${T(128, 104, 'במקביל', 'g-s')}`,
};

const DEFS = '<defs><marker id="ah" viewBox="0 0 10 10" refX="8" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="currentColor"/></marker></defs>';
export function glyph(model) {
  const f = G[model.id];
  return f ? svg(160, 110, DEFS + f(), `שרטוט: ${model.name}`) : '';
}

// ---------- סחף הייחוס: מהרעיון לתרשים ----------
export function driftChart(models) {
  const rows = models.filter((m) => m.drift).sort((a, b) => a.drift[0].year - b.drift[0].year);
  const y0 = 1890, y1 = 2020, W = 640, left = 20, right = 140, top = 30, rowH = 34;
  const X = (y) => left + ((y - y0) / (y1 - y0)) * (W - left - right);
  let b = '';
  for (let y = 1900; y <= 2020; y += 20) b += `<line class="g-grid" x1="${X(y)}" y1="${top - 8}" x2="${X(y)}" y2="${top + rows.length * rowH - 10}"/><text class="g-s" x="${X(y)}" y="${top - 12}" text-anchor="middle">${y}</text>`;
  rows.forEach((m, i) => {
    const [a, c] = m.drift, y = top + i * rowH + 8, gap = c.year - a.year;
    b += `<g class="drift-row" tabindex="0" data-model="${m.id}"><title>${esc(a.label)} (${a.year}) ← ${esc(c.label)} (${c.year})</title>
      <line class="g-drift draw" style="--d:${i * 120}ms" x1="${X(a.year)}" y1="${y}" x2="${X(c.year)}" y2="${y}"/>
      <circle class="g-ink" cx="${X(a.year)}" cy="${y}" r="5"/><circle class="g-reddot pop" style="--d:${i * 120 + 500}ms" cx="${X(c.year)}" cy="${y}" r="5"/>
      <text class="g-gap" x="${(X(a.year) + X(c.year)) / 2}" y="${y - 7}" text-anchor="middle">+${gap}</text>
      <text class="g-t g-b" x="${W - 4}" y="${y + 4}" direction="rtl" text-anchor="start">${esc(m.short || m.name)}</text></g>`;
  });
  const H = top + rows.length * rowH + 6;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="סחף הייחוס: שנת הרעיון מול שנת התרשים">${b}</svg>`;
}

// ---------- תרשים יחידות: 16 מודלים לפי רמת ראיות ----------
export function evidenceChart(data) {
  const levels = Object.keys(data.meta.evidenceLevels);
  const W = 640, colW = W / levels.length, sq = 26, gap = 6;
  let b = '', maxRows = 0;
  levels.forEach((l, i) => {
    const ms = data.models.filter((m) => m.evidence === l);
    const cx = W - (i + 0.5) * colW;
    ms.forEach((m, k) => {
      const col = k % 3, row = Math.floor(k / 3); maxRows = Math.max(maxRows, row + 1);
      const x = cx - (1.5 * sq + gap) + col * (sq + gap), y = 150 - (row + 1) * (sq + gap);
      b += `<a href="#/model/${m.id}" class="unit"><rect class="pop" style="--d:${(i * 4 + k) * 50}ms;fill:${EV_COLOR[l]}" x="${x}" y="${y}" width="${sq}" height="${sq}"><title>${esc(m.name)}</title></rect></a>`;
    });
    b += `<text class="g-num" x="${cx}" y="178" text-anchor="middle">${ms.length}</text>`;
    b += `<text class="g-t" x="${cx}" y="198" direction="rtl" text-anchor="middle">${esc(data.meta.evidenceLevels[l].label)}</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} 206" role="img" aria-label="מספר המודלים בכל רמת ראיות">${b}</svg>`;
}

// ---------- גרפיקה לתשובות האבחון ----------
export function optionGlyph(q, o) {
  const small = (body) => `<svg class="opt-g" viewBox="0 0 80 44" aria-hidden="true">${DEFS}${body}</svg>`;
  if (q === 'cynefin') {
    const pos = { complex: [0, 0], complicated: [1, 0], chaotic: [0, 1], clear: [1, 1] }[o];
    return small(`<rect class="g-line" x="20" y="2" width="40" height="40"/><line class="g-line" x1="40" y1="2" x2="40" y2="42"/><line class="g-line" x1="20" y1="22" x2="60" y2="22"/><rect class="g-ink" x="${40 - 19 * (pos[0] ? 0 : 1) + (pos[0] ? 1 : 0)}" y="${3 + pos[1] * 20}" width="18" height="18"/>`);
  }
  if (q === 'agreement') {
    const d = { yes: 4, partial: 12, no: 24 }[o];
    return small(`<circle class="g-ring" cx="${40 - d}" cy="22" r="14"/><circle class="g-ring" cx="${40 + d}" cy="22" r="14"/><circle class="g-ring" cx="40" cy="${22 - d * 0.6}" r="14"/>`);
  }
  if (q === 'unit') {
    const n = { person: 1, team: 5, org: 14, public: 32 }[o];
    let b = ''; for (let i = 0; i < n; i++) b += `<circle class="g-ink" cx="${72 - (i % 8) * 9}" cy="${8 + Math.floor(i / 8) * 9}" r="3"/>`;
    return small(b);
  }
  if (q === 'data') {
    const n = { yes: 12, partial: 5, none: 0 }[o];
    let b = '<line class="g-line" x1="6" y1="40" x2="74" y2="40"/>';
    const h = [4, 8, 14, 20, 24, 20, 14, 10, 7, 5, 3, 2];
    for (let i = 0; i < n; i++) b += `<rect class="g-fill" x="${70 - i * 5.5}" y="${40 - h[i] * 1.4}" width="4.5" height="${h[i] * 1.4}"/>`;
    if (!n) b += `<text class="g-s" x="40" y="26" direction="rtl" text-anchor="middle">?</text>`;
    return small(b);
  }
  return '';
}

// ---------- מרחב האבחון: קובייה תלת־ממדית שמסתובבת ----------
// צירים: x = סוג הבעיה (Cynefin), y = הסכמה, z = שכבת זמן (אתר בתחתית).
export class DiagnosisCube {
  constructor(host, data, { onPick, focus } = {}) {
    this.host = host; this.data = data; this.onPick = onPick; this.focus = focus;
    const q = (id) => data.questions.find((x) => x.id === id).options.map((o) => o.id);
    this.ax = { x: q('cynefin'), y: q('agreement').slice().reverse(), z: q('layer') };
    this.theta = -0.62; this.auto = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.points = data.states.map((s) => ({ s, p: this.coord(s.sample), lead: data.models.find((m) => m.id === s.primary[0]) }));
    if (focus) this.focusPt = this.coord(focus);
    this.build();
    this.ro = new ResizeObserver(() => this.draw()); this.ro.observe(host);
    this.loop = this.loop.bind(this); this.t0 = performance.now(); requestAnimationFrame(this.loop);
  }
  coord(a) {
    const n = (arr, v) => (arr.indexOf(v) + 0.5) / arr.length;
    return [n(this.ax.x, a.cynefin), n(this.ax.y, a.agreement), n(this.ax.z, a.layer)];
  }
  proj([x, y, z]) {
    const c = Math.cos(this.theta), s = Math.sin(this.theta);
    const X = (x - 0.5) * c - (y - 0.5) * s, Y = (x - 0.5) * s + (y - 0.5) * c;
    return [X * 0.87 * this.S + this.cx, Y * 0.5 * this.S - (z - 0.5) * this.S * 0.95 + this.cy, Y];
  }
  build() {
    const NS = 'http://www.w3.org/2000/svg';
    const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const k in a) e.setAttribute(k, a[k]); return e; };
    this.svg = el('svg', { class: 'cube', role: 'img', 'aria-label': 'מרחב האבחון: 12 המצבים על שלושה צירים' });
    this.g = { edges: [], floor: [], drops: [], dots: [], labels: [], axes: [] };
    for (let i = 0; i < 12; i++) { const l = el('line', { class: 'c-edge' }); this.svg.append(l); this.g.edges.push(l); }
    for (let i = 0; i < 9; i++) { const l = el('line', { class: 'c-floor' }); this.svg.append(l); this.g.floor.push(l); }
    this.g.axisText = ['x', 'y', 'z'].map(() => { const t = el('text', { class: 'c-axis', direction: 'rtl', 'text-anchor': 'middle' }); this.svg.append(t); return t; });
    this.g.ticks = this.ax.z.map(() => { const t = el('text', { class: 'c-tick', direction: 'rtl', 'text-anchor': 'end' }); this.svg.append(t); return t; });
    this.g.xticks = this.ax.x.map(() => { const t = el('text', { class: 'c-tick', direction: 'rtl', 'text-anchor': 'middle' }); this.svg.append(t); return t; });
    this.g.yticks = this.ax.y.map(() => { const t = el('text', { class: 'c-tick', direction: 'rtl', 'text-anchor': 'middle' }); this.svg.append(t); return t; });
    this.points.forEach((pt, i) => {
      const drop = el('line', { class: 'c-drop' }), sh = el('ellipse', { class: 'c-shadow', rx: 5, ry: 2.5 });
      const g = el('g', { class: 'c-pt', tabindex: 0, role: 'button', 'aria-label': `${pt.s.title}: ${pt.lead.name}`, style: `--d:${i * 70}ms` });
      const dot = el('circle', { r: 7, style: `fill:var(--ev-${pt.lead.evidence})` });
      const lab = el('text', { class: 'c-lab', direction: 'rtl', 'text-anchor': 'start' }); lab.textContent = pt.lead.short || pt.lead.name;
      const tt = el('title'); tt.textContent = `${pt.s.title}: ${this.data.models.filter((m) => pt.s.primary.includes(m.id)).map((m) => m.name).join(' + ')}`;
      g.append(tt, dot, lab); this.svg.append(drop, sh); pt.el = { g, dot, lab, drop, sh };
      g.addEventListener('click', () => this.onPick?.(pt.s));
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.onPick?.(pt.s); } });
      g.addEventListener('mouseenter', () => { this.hover = true; }); g.addEventListener('mouseleave', () => { this.hover = false; });
    });
    this.points.forEach((pt) => this.svg.append(pt.el.g));
    if (this.focusPt) {
      this.fdrop = el('line', { class: 'c-fdrop' }); this.fdot = el('circle', { class: 'c-focus', r: 11 });
      this.flab = el('text', { class: 'c-flab', direction: 'rtl', 'text-anchor': 'start' }); this.flab.textContent = 'הבעיה שלך';
      this.svg.append(this.fdrop, this.fdot, this.flab);
    }
    // גרירה מסובבת
    let sx = null, st = 0;
    this.svg.addEventListener('pointerdown', (e) => { sx = e.clientX; st = this.theta; this.auto = false; });
    addEventListener('pointerup', () => { sx = null; });
    this.svg.addEventListener('pointermove', (e) => { if (sx !== null) { this.theta = st + (e.clientX - sx) / 120; this.draw(); } });
    this.host.append(this.svg);
  }
  loop(t) {
    if (!this.svg.isConnected) { this.ro.disconnect(); return; }
    if (this.auto && !this.hover) { this.theta = -0.62 + Math.sin((t - this.t0) / 6000) * 0.55; this.draw(); }
    else if (!this.drawn) this.draw();
    requestAnimationFrame(this.loop);
  }
  draw() {
    const w = this.host.clientWidth || 600, h = this.host.clientHeight || 400;
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.S = Math.min(w * 0.56, h * 0.5); this.cx = w / 2; this.cy = h / 2 + this.S * 0.04; this.drawn = true;
    const P = (v) => this.proj(v);
    const C = [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    const set = (l, a, b) => { const [x1, y1] = P(a), [x2, y2] = P(b); l.setAttribute('x1', x1); l.setAttribute('y1', y1); l.setAttribute('x2', x2); l.setAttribute('y2', y2); };
    E.forEach(([a, b], i) => set(this.g.edges[i], C[a], C[b]));
    let k = 0;
    for (let i = 1; i < this.ax.x.length; i++) set(this.g.floor[k++], [i / this.ax.x.length, 0, 0], [i / this.ax.x.length, 1, 0]);
    for (let j = 1; j < this.ax.y.length; j++) set(this.g.floor[k++], [0, j / this.ax.y.length, 0], [1, j / this.ax.y.length, 0]);
    for (; k < this.g.floor.length; k++) this.g.floor[k].setAttribute('x1', -9);
    const label = (t, v, s) => { const [x, y] = P(v); t.setAttribute('x', x); t.setAttribute('y', y); t.textContent = s; };
    const qt = (id) => this.data.questions.find((x) => x.id === id);
    label(this.g.axisText[0], [0.5, -0.3, 0], qt('cynefin').title);
    label(this.g.axisText[1], [1.34, 0.5, 0], qt('agreement').title);
    this.ax.y.forEach((id, i) => label(this.g.yticks[i], [1.12, (i + 0.5) / this.ax.y.length, 0], qt('agreement').options.find((o) => o.id === id).label.replace(', מסכימים', '')));
    label(this.g.axisText[2], [-0.02, -0.02, 1.12], qt('layer').title);
    this.ax.z.forEach((id, i) => label(this.g.ticks[i], [-0.04, -0.04, (i + 0.5) / this.ax.z.length], qt('layer').options.find((o) => o.id === id).label));
    this.ax.x.forEach((id, i) => label(this.g.xticks[i], [(i + 0.5) / this.ax.x.length, -0.09, 0], qt('cynefin').options.find((o) => o.id === id).label));
    const order = this.points.map((pt) => ({ pt, d: P(pt.p)[2] })).sort((a, b) => a.d - b.d);
    // סידור עומק: רק אחרי אנימציית הכניסה, ורק כשהסדר השתנה. הזזת צומת מאתחלת את האנימציה שלו.
    const key = order.map((o) => o.pt.s.id).join();
    const introDone = performance.now() - this.t0 > 1800;
    if (introDone && key !== this.orderKey) {
      this.orderKey = key;
      order.forEach(({ pt }) => { pt.el.g.style.animation = 'none'; this.svg.append(pt.el.g); });
      if (this.focusPt) this.svg.append(this.fdrop, this.fdot, this.flab);
    }
    order.forEach(({ pt }) => {
      const [x, y] = P(pt.p), [fx, fy] = P([pt.p[0], pt.p[1], 0]);
      pt.el.dot.setAttribute('cx', x); pt.el.dot.setAttribute('cy', y);
      pt.el.lab.setAttribute('x', x - 11); pt.el.lab.setAttribute('y', y + 4);
      pt.el.drop.setAttribute('x1', x); pt.el.drop.setAttribute('y1', y); pt.el.drop.setAttribute('x2', fx); pt.el.drop.setAttribute('y2', fy);
      pt.el.sh.setAttribute('cx', fx); pt.el.sh.setAttribute('cy', fy);
    });
    // טקסט לא עולה על טקסט: תווית שמתנגשת בתווית קרובה יותר לצופה מוסתרת, ומופיעה בריחוף.
    const placed = [];
    [...order].reverse().forEach(({ pt }) => {
      const x = +pt.el.lab.getAttribute('x'), y = +pt.el.lab.getAttribute('y'), w = pt.el.lab.textContent.length * 6.6;
      const box = [x - w, y - 11, x, y + 3];
      const hit = placed.some((q) => box[0] < q[2] && box[2] > q[0] && box[1] < q[3] && box[3] > q[1]);
      pt.el.g.classList.toggle('lab-hidden', hit);
      if (!hit) placed.push(box);
    });
    if (this.focusPt) {
      const [x, y] = P(this.focusPt), [fx, fy] = P([this.focusPt[0], this.focusPt[1], 0]);
      this.fdot.setAttribute('cx', x); this.fdot.setAttribute('cy', y);
      this.fdrop.setAttribute('x1', x); this.fdrop.setAttribute('y1', y); this.fdrop.setAttribute('x2', fx); this.fdrop.setAttribute('y2', fy);
      this.flab.setAttribute('x', x - 16); this.flab.setAttribute('y', y - 12);
    }
  }
}
