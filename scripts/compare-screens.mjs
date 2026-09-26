// Pixel-compare two folders of PNG screenshots (e.g. harness runs of origin/main vs the branch).
// usage: node scripts/compare-screens.mjs <dirA> <dirB>  → writes diff-*.png into dirB, exits 1 on any change
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const [A, B] = process.argv.slice(2);
const browser = await chromium.launch({ ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const p = await (await browser.newContext()).newPage();
let bad = 0;
for (const f of readdirSync(A).filter((f) => f.endsWith('.png') && !f.startsWith('diff-'))) {
  let b; try { b = readFileSync(`${B}/${f}`); } catch { console.log('MISSING', f); bad++; continue; }
  const a = readFileSync(`${A}/${f}`);
  if (a.equals(b)) { console.log('same ', f); continue; }
  const r = await p.evaluate(async ([a64, b64]) => {
    const load = (s) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = `data:image/png;base64,${s}`; });
    const [ia, ib] = await Promise.all([load(a64), load(b64)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, w, h).data; x.clearRect(0,0,w,h); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, w, h);
    let n = 0; for (let i = 0; i < da.length; i += 4) { if (Math.max(Math.abs(da[i]-db.data[i]),Math.abs(da[i+1]-db.data[i+1]),Math.abs(da[i+2]-db.data[i+2])) > 0) { n++; db.data[i]=255; db.data[i+1]=0; db.data[i+2]=80; } }
    x.putImageData(db, 0, 0); return { n, o: c.toDataURL('image/png').split(',')[1] };
  }, [a.toString('base64'), b.toString('base64')]);
  console.log(r.n ? 'DIFF ' : 'same~', f, r.n); if (r.n) { bad++; writeFileSync(`${B}/diff-${f}`, Buffer.from(r.o, 'base64')); }
}
await browser.close(); console.log(bad ? `${bad} changed` : '0 changed');
process.exitCode = bad ? 1 : 0;
