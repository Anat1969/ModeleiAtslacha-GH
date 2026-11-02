// all 16 glyphs on one page, to check text overlap inside drawings
const { chromium } = require('playwright');
(async()=>{const b=await chromium.launch();const p=await b.newPage({viewport:{width:1280,height:900}});
await p.route('**/appofapp-gh.vercel.app/**',r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));
await p.goto((process.argv[2] || 'http://localhost:4173/') + '#/library',{waitUntil:'networkidle'});await p.waitForTimeout(1500);
const hits=await p.evaluate(()=>{const out=[];document.querySelectorAll('.lib-card .glyph').forEach(svg=>{const ts=[...svg.querySelectorAll('text')].filter(t=>t.textContent.trim());for(let i=0;i<ts.length;i++)for(let j=i+1;j<ts.length;j++){const a=ts[i].getBoundingClientRect(),c=ts[j].getBoundingClientRect();const x=Math.min(a.right,c.right)-Math.max(a.left,c.left),y=Math.min(a.bottom,c.bottom)-Math.max(a.top,c.top);if(x>1&&y>1)out.push(svg.getAttribute('aria-label')+': '+ts[i].textContent+' / '+ts[j].textContent)}});return out});
console.log(hits.length?hits.join('\n'):'אין חפיפה בשרטוטים');await b.close();process.exit(hits.length?1:0);})();
