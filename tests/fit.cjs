// מדד "בגודל המסך" (סעיף 2.9 א בסקיל העיצוב).
// usage: node fit.cjs <baseUrl> <outPrefix> [hashes...]
// לכל דף ולכל גודל מסך: יחס גלילה, גלילה אופקית, ומספר פריטי מידע שנראים בלי לגלול. בסוף: FAIL אם חרג.
const { chromium } = require('playwright');
const SIZES = [['1920', 1920, 1080], ['1440', 1440, 900], ['1280', 1280, 720], ['mob', 390, 844]];
(async () => {
  const [base, out, ...hashes] = process.argv.slice(2);
  const b = await chromium.launch();
  let fail = 0;
  for (const [name, width, height] of SIZES) {
    const p = await b.newPage({ viewport: { width, height } });
    await p.route('**/appofapp-gh.vercel.app/**', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await p.route('**/fonts.googleapis.com/**', r => r.abort());
    for (const h of (hashes.length ? hashes : [''])) {
      await p.goto(base + (h ? '#' + h : ''), { waitUntil: 'networkidle' });
      await p.waitForTimeout(1000);
      const m = await p.evaluate(() => {
        const H = innerHeight, W = innerWidth;
        const sel = 'h1,h2,h3,p,li,td,th,dd,dt,figure,svg,canvas,img,.num,[data-info]';
        let seen = 0;
        for (const el of document.querySelectorAll(sel)) {
          const r = el.getBoundingClientRect();
          if (r.width > 4 && r.height > 4 && r.top < H && r.bottom > 0 && r.left < W && r.right > 0) seen++;
        }
        return { ratio: +(document.documentElement.scrollHeight / H).toFixed(2), hscroll: document.documentElement.scrollWidth > W, seen };
      });
      const limit = name === 'mob' ? 1.5 : 1.0;
      const bad = m.hscroll || m.ratio > limit;
      if (bad) fail++;
      const file = `${out}-${name}-${(h || 'root').replace(/\W/g, '')}.png`;
      await p.screenshot({ path: file });
      console.log(`${bad ? 'FAIL' : 'ok  '} ${name.padEnd(5)} ${(h || '/').padEnd(16)} scroll ${m.ratio} (max ${limit})  hscroll ${m.hscroll}  info-in-view ${m.seen}  ${file}`);
    }
    await p.close();
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
