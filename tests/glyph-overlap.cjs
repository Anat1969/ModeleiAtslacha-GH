// שרטוטים: אין טקסט על טקסט, ואין טקסט שבורח מגבולות השרטוט. עובר על כל התחומים.
// usage: node tests/glyph-overlap.cjs [baseUrl]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.argv[2] || 'http://localhost:4173/';
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/models.json'), 'utf8'));
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.route('**/appofapp-gh.vercel.app/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
  const out = []; let checked = 0;
  for (const c of data.categories) {
    await p.goto(BASE + '#/library/' + c.id, { waitUntil: 'networkidle' });
    await p.waitForTimeout(900);
    const r = await p.evaluate(() => {
      const res = []; let n = 0;
      document.querySelectorAll('.mcard .glyph').forEach((svg) => {
        n++;
        const box = svg.getBoundingClientRect();
        const ts = [...svg.querySelectorAll('text')].filter((t) => t.textContent.trim());
        for (const t of ts) {
          const a = t.getBoundingClientRect();
          if (a.left < box.left - 2 || a.right > box.right + 2 || a.top < box.top - 2 || a.bottom > box.bottom + 2) res.push(`${svg.getAttribute('aria-label')}: "${t.textContent}" יוצא מהמסגרת`);
        }
        for (let i = 0; i < ts.length; i++) for (let j = i + 1; j < ts.length; j++) {
          const a = ts[i].getBoundingClientRect(), c2 = ts[j].getBoundingClientRect();
          const x = Math.min(a.right, c2.right) - Math.max(a.left, c2.left), y = Math.min(a.bottom, c2.bottom) - Math.max(a.top, c2.top);
          if (x > 1 && y > 1) res.push(`${svg.getAttribute('aria-label')}: "${ts[i].textContent}" על "${ts[j].textContent}"`);
        }
      });
      return { res, n };
    });
    out.push(...r.res); checked += r.n;
  }
  console.log(`נבדקו ${checked} שרטוטים`);
  console.log(out.length ? out.join('\n') : 'אין חפיפה ואין טקסט שבורח מהמסגרת');
  await b.close();
  process.exit(out.length || checked < data.models.length ? 1 : 0);
})();
