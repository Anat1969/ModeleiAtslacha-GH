// בדיקת קצה לקצה: node tests/e2e.cjs [baseUrl]. ברירת מחדל: שרת מקומי על 4173 שהבדיקה מפעילה בעצמה.
// ai-menu נטען מעותק מקומי, כי הסביבה לא תמיד מגיעה ל-vercel.app.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MENU = fs.readFileSync(path.join(__dirname, 'fixtures/ai-menu.js'), 'utf8');
const SHOTS = process.env.SHOTS || path.join(ROOT, 'docs/shots');
const BASE = process.argv[2] || 'http://localhost:4173/';
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) fails++; };

async function ready(url) {
  for (let i = 0; i < 40; i++) { try { const r = await fetch(url); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 150)); }
  throw new Error('server did not start');
}

(async () => {
  let server = null;
  if (!process.argv[2]) {
    server = spawn('python3', ['-m', 'http.server', '4173', '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  }
  await ready(BASE);
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();

  for (const [name, viewport] of [['desk', { width: 1280, height: 900 }], ['mob', { width: 390, height: 844 }]]) {
    const ctx = await browser.newContext({ viewport, locale: 'he-IL' });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.route('**/appofapp-gh.vercel.app/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: MENU }));
    const go = async (hash) => { await page.goto(BASE + hash, { waitUntil: 'networkidle' }); await page.waitForTimeout(500); };
    const shot = (n) => page.screenshot({ path: path.join(SHOTS, `${name}-${n}.png`) });
    const mob = name === 'mob';
    const pane = async (id) => { if (mob) { await page.click(`[data-pane="${id}"]`); await page.waitForTimeout(250); } };
    const noHScroll = async (where) => ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${name} ${where}: אין גלילה אופקית`);

    // דף בית
    await go('#/');
    ok(await page.locator('html[dir="rtl"][lang="he"]').count() === 1, `${name}: dir=rtl ו-lang=he`);
    ok(await page.locator('ai-menu .logo').isVisible().catch(() => false) || await page.evaluate(() => !!document.querySelector('ai-menu')?.shadowRoot?.querySelector('.logo')), `${name}: כפתור הלוגו A&I בסרגל`);
    ok(!(await page.locator('header >> text=העתקת קישור').first().isVisible().catch(() => false)), `${name}: אין כפתורי פיתוח חופשיים בסרגל`);
    ok((await page.locator('h1').first().textContent()).includes('לפי הבעיה'), `${name}: כותרת דף הבית`);
    await pane('stage');
    ok(await page.locator('.dom').count() === 8 && await page.locator('.unit-sq').count() === 25, `${name}: מפת התחומים: 8 תחומים, 25 מודלים`);
    ok(await page.locator('.smap .sm-node').count() === 4 || mob, `${name}: מבנה האפליקציה מוסבר בדף הבית`);
    await page.click('[data-tab="space"]');
    await page.waitForTimeout(900);
    ok(await page.locator('#cube .c-pt').count() === 13, `${name}: מרחב האבחון מציג 13 מצבים`);
    await page.locator('#cube .c-pt').first().dispatchEvent('click');
    await page.waitForTimeout(200);
    ok((await page.locator('#pick').textContent()).includes('לתוצאה') || (await page.locator('#pick a').count()) === 1, `${name}: לחיצה על נקודה מציגה מצב ומודל`);
    await page.click('[data-tab="drift"]');
    ok(await page.locator('.drift-row').count() >= 7, `${name}: ציר סחף הייחוס`);
    await page.click('[data-tab="path"]');
    for (const c of ['תקציב פרויקט', 'שיתוף ציבור', 'תכנון שכונה']) {
      await page.click(`[data-case] >> text=${c}`);
      await page.waitForTimeout(200);
    }
    ok((await page.locator('#keymap svg').getAttribute('aria-label')).includes('בעיות מרושעות'), `${name}: מפת המפתח מציגה את תוצאת תכנון השכונה`);
    ok(page.url().includes('v=path') && page.url().includes('case=neighborhood'), `${name}: התצוגה נשמרת בכתובת`);
    await noHScroll('בית');
    await page.waitForTimeout(1200);
    await shot('home');

    // מקרה 1: תכנון שכונה, דרך הממשק, לחיצה אחרי לחיצה
    await go('#/diagnose?step=0');
    await page.fill('#desc', 'תכנון שכונה חדשה ברובע ט״ו');
    await page.click('.opt >> text=צורכי משתמשים במרחב או בשירות');
    await page.click('.opt >> text=מורכבת');
    await page.click('.opt >> text=לא מסכימים');
    await page.waitForTimeout(300);
    await shot('layer');
    await page.click('.opt >> text=אתר');
    await page.click('.opt >> text=ציבור');
    await page.click('.opt >> text=חלקיים');
    await page.waitForFunction(() => location.hash.startsWith('#/result'));
    await page.waitForTimeout(400);
    const body1 = await page.locator('main').textContent();
    ok(body1.includes('אין כאן פתרון') && body1.includes('בעיות מרושעות') && body1.includes('סולם ההשתתפות'), `${name}: תכנון שכונה -> מסגור, ריטל-וובר וארנשטיין`);
    ok(body1.includes('תווית אזהרה') && body1.includes('שלושה צעדי יישום') && body1.includes('האם המודל שינה החלטה'), `${name}: אזהרה, צעדים ושאלת בקרה`);
    ok(await page.locator('.mview .glyph').first().isVisible().catch(() => false) || mob, `${name}: שרטוט מוסבר למודל`);
    await noHScroll('תוצאה');
    await pane('models');
    await page.click('[data-tab="rel"]');
    await page.waitForTimeout(300);
    ok(await page.locator('.rel-dot').count() === 3 && await page.locator('.rel-bar.counter').count() > 0, `${name}: מיקום יחסי: הבעיה שלך מול הראשי והנגדי בשלושה צירים`);
    await page.click('[data-tab="calc"]');
    ok((await page.locator('.checks tbody tr td.num').first().textContent()).trim() === '0', `${name}: "איך חושב" ממוספר לפי סדר השאלות`);
    await pane('act');
    await page.click('[data-changed="yes"]');
    await page.fill('#note', 'עברנו מתוכנית אחת לשלושה סבבי שיתוף');
    await page.waitForTimeout(300);
    ok(await page.locator('.saved.show').count() > 0, `${name}: חיווי "נשמר"`);
    await shot('result-wicked');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    ok(await page.locator('[data-changed="yes"][aria-pressed="true"]').count() === 1 && (await page.inputValue('#note')).includes('שלושה סבבי'), `${name}: התשובה נשמרה אחרי רענון`);

    // מקרה 2: תקציב פרויקט
    await go('#/result?intent=budget&cynefin=complicated&agreement=yes&layer=structure&unit=org&data=yes');
    ok((await page.locator('main').textContent()).includes('תחזית לפי מחלקת ייחוס'), `${name}: תקציב פרויקט -> מחלקת ייחוס`);
    ok((await page.locator('[data-tab="counter"]').textContent()).includes('פרה-מורטם'), `${name}: המודל הנגדי לתקציב: פרה-מורטם`);
    ok((await page.locator('.fit-n').textContent()).includes('100'), `${name}: אחוז התאמה מוצג`);
    ok(await page.locator('[data-print]').count() === 1, `${name}: כפתור דוח A4 בדף התוצאה`);
    if (!mob) {
      await page.emulateMedia({ media: 'print' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      ok(pages === 1, `${name}: דוח A4 בעמוד אחד (${pages})`);
      ok(await page.locator('.print-report').isVisible(), `${name}: בהדפסה מוצג הדוח, לא המסך`);
      await page.emulateMedia({ media: 'screen' });
    }
    await shot('result-budget');

    // מקרה 3: שיתוף ציבור
    await go('#/result?intent=users&cynefin=complex&agreement=partial&layer=space&unit=public&data=partial');
    const body3 = await page.locator('main').textContent();
    ok(body3.includes('עבודות שצריך לעשות') && body3.includes('מודל קאנו') && body3.includes('סולם ההשתתפות'), `${name}: שיתוף ציבור -> JTBD, קאנו, ומודל נגדי ארנשטיין`);

    // סתירה -> הבהרה
    await go('#/result?intent=tasks&cynefin=clear&agreement=no&layer=stuff&unit=person&data=yes');
    ok((await page.locator('h1').textContent()).includes('סותרות'), `${name}: סתירה מובילה לבקשת הבהרה`);
    await page.click('.tone-problem .press >> nth=0');
    await page.waitForFunction(() => location.hash.startsWith('#/diagnose'));
    ok(true, `${name}: כפתור "לשנות" מחזיר לשאלה`);
    await shot('clarify');

    // ספרייה ← תחום ← מודל
    await go('#/library');
    ok(await page.locator('.ccard').count() === 8, `${name}: הספרייה מציגה 8 תחומים`);
    await noHScroll('ספרייה');
    await shot('library');
    await page.locator('.ccard').first().click();
    await page.waitForFunction(() => location.hash.startsWith('#/library/priority'));
    await page.waitForTimeout(300);
    const cards = await page.locator('.mcard').count();
    ok(cards === 4 && await page.locator('.mcard .glyph').count() === cards, `${name}: תחום עם 4 מודלים, ושרטוט לכל אחד`);
    const tops = await page.evaluate(() => [...document.querySelectorAll('.mcard')].map((c) => Math.round(c.querySelector('.mc-ev').getBoundingClientRect().top - c.getBoundingClientRect().top)));
    ok(new Set(tops).size === 1, `${name}: רמת הראיות באותו מקום בכל כרטיס (${tops.join(',')})`);
    ok((await page.locator('.crumbs').first().textContent()).includes('ספרייה'), `${name}: פירורי לחם היררכיים`);
    await shot('category');
    await page.locator('.mcard').first().click();
    await page.waitForFunction(() => location.hash.split('/').length === 4);
    await page.waitForTimeout(400);
    ok(await page.locator('.factbar .fact').count() === 6, `${name}: פס עובדות קבוע בכרטיס המודל`);
    ok(await page.locator('.zone').count() === 3, `${name}: שלושה אזורים: היכרות, הבנה, יישום`);
    const order = await page.evaluate(() => [...document.querySelectorAll('.pane-know .sub')].map((h) => h.textContent));
    ok(order[0] === 'הגדרה' && order[1] === 'תובנה', `${name}: היכרות נפתחת בהגדרה ובתובנה`);
    await pane('understand');
    await page.click('[data-step="1"]');
    ok((await page.locator('.demo-pos').textContent()).startsWith('2/'), `${name}: הדגמה עוברת לשלב הבא`);
    await pane('apply');
    ok(await page.locator('.post [data-copy]').count() === 1 && (await page.locator('.post-t .line').count()) >= 5, `${name}: פוסט מוכן לשיתוף עם כפתור העתקה`);
    ok(await page.evaluate(() => { const p = document.querySelector('.pane-apply'); return p.lastElementChild.classList.contains('sources-d'); }), `${name}: המקורות אחרונים`);
    await shot('model');

    // ייחוס שגוי, וכתובת ישנה שמפנה למקום החדש
    await go('#/model/maslow');
    await page.waitForFunction(() => location.hash.startsWith('#/library/learning/maslow'));
    await page.waitForTimeout(300);
    const mt = await page.locator('main').textContent();
    ok(mt.includes('מקדרמיד') && mt.includes('1960') && mt.includes('הייחוס והתרשים'), `${name}: כרטיס מאסלו מציג את מקדרמיד, 1960`);

    // יומן
    await go('#/log');
    ok((await page.locator('h1').textContent()).includes('1'), `${name}: היומן מודד כמה החלטות השתנו`);
    await shot('log');

    // כל קישורי הסרגל
    for (const t of ['אבחון', 'ספרייה', 'יומן']) {
      await page.click(`.tab >> text=${t}`);
      await page.waitForTimeout(250);
      ok(await page.locator(`.tab[aria-current="page"] >> text=${t}`).count() === 1, `${name}: לשונית ${t} פעילה`);
    }
    await page.click('.brand');
    await page.waitForTimeout(250);
    ok((await page.locator('h1').first().textContent()).includes('לפי הבעיה'), `${name}: שם האפליקציה מוביל לבית`);

    if (name === 'desk') {
      const cdp = await ctx.newCDPSession(page);
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      ok(installabilityErrors.length === 0, `התקנה מ-Chrome: ${JSON.stringify(installabilityErrors)}`);
    }
    ok(errors.length === 0, `${name}: אין שגיאות JavaScript ${errors.join(' | ')}`);
    await ctx.close();
  }

  // הפחתת תנועה
  const rm = await browser.newPage({ reducedMotion: 'reduce' });
  await rm.route('**/appofapp-gh.vercel.app/**', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: MENU }));
  await rm.goto(BASE + '#/', { waitUntil: 'networkidle' });
  const anim = await rm.evaluate(() => getComputedStyle(document.querySelector('.rise')).animationName);
  ok(anim === 'none', 'הפחתת תנועה מבטלת אנימציות');

  await browser.close();
  if (server) server.kill();
  console.log(fails ? `\n${fails} בדיקות נכשלו` : '\nכל הבדיקות עברו');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
