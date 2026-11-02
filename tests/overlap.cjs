// גלאי טקסט שעולה על טקסט, לכל אפליקציה. usage: node overlap.cjs <baseUrl> "/" "/page" ...
// מסנן שכבה אטומה (כרטיס שמכסה תוכן) בעזרת elementFromPoint. נלקח מ-Olam-GH, 31.10.2026.
// מוצא טקסט שעולה על טקסט: לכל צומת טקסט גלוי, מלבן; זוגות שחופפים ביותר מ-30% מהקטן.
const { chromium } = require('playwright');
const fs = require('fs');
const MENU = fs.existsSync('tests/fixtures/ai-menu.js') ? fs.readFileSync('tests/fixtures/ai-menu.js', 'utf8') : '';
const pages = process.argv.slice(3);
(async () => {
  const b = await chromium.launch();
  for (const [n, vp] of [['desk', { width: 1280, height: 900 }], ['mob', { width: 390, height: 844 }]]) {
    const p = await b.newPage({ viewport: vp });
    await p.route('**/appofapp-gh.vercel.app/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: MENU }));
    await p.route('**/fonts.googleapis.com/**', (r) => r.abort());
    for (const h of pages) {
      await p.goto(process.argv[2] + '#' + h, { waitUntil: 'networkidle' });
      await p.waitForTimeout(h.includes('map') ? 3500 : 1200);
      const hits = await p.evaluate(() => {
        const rects = [];
        const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (w.nextNode()) {
          const t = w.currentNode; if (!t.textContent.trim()) continue;
          const el = t.parentElement; const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || +cs.opacity === 0 || el.closest('[aria-hidden="true"]:not(svg)')) continue;
          const r = document.createRange(); r.selectNodeContents(t);
          for (const q of r.getClientRects()) if (q.width > 2 && q.height > 2 && q.bottom > 0 && q.top < innerHeight * 3) rects.push({ q, el, txt: t.textContent.trim().slice(0, 30) });
        }
        const out = [];
        for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i], c = rects[j]; if (a.el === c.el || a.el.contains(c.el) || c.el.contains(a.el)) continue;
          const x = Math.min(a.q.right, c.q.right) - Math.max(a.q.left, c.q.left), y = Math.min(a.q.bottom, c.q.bottom) - Math.max(a.q.top, c.q.top);
          if (x <= 0 || y <= 0) continue;
          const small = Math.min(a.q.width * a.q.height, c.q.width * c.q.height);
          if (x * y <= 0.3 * small) continue;
          // מוסתר מתחת לשכבה אטומה? בודקים את האלמנט העליון במרכז החפיפה
          const px = Math.max(a.q.left, c.q.left) + x / 2, py = Math.max(a.q.top, c.q.top) + y / 2;
          if (py < 0 || py > innerHeight) continue;
          const top = document.elementFromPoint(px, py);
          const lower = top && (a.el.contains(top) || top.contains(a.el) || top === a.el) ? c.el : a.el;
          let n = top, occluded = false;
          while (n && n !== document.body && !n.contains(lower)) { const bg = getComputedStyle(n).backgroundColor; if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent' && !bg.endsWith(', 0)')) { occluded = true; break; } n = n.parentElement; }
          if (occluded) continue;
          if (true) out.push(`${a.txt} ⟂ ${c.txt} [${(a.el.getAttribute('class') || a.el.tagName)}|${(c.el.getAttribute('class') || c.el.tagName)}]`);
        }
        return [...new Set(out)].slice(0, 25);
      });
      console.log(`== ${n} ${h}: ${hits.length}`); hits.forEach((x) => console.log('   ' + x));
    }
    await p.close();
  }
  await b.close();
})();
