// ¿Un Chrome real (no un fetch simple) logra ver el precio en las tiendas que bloquean desde GitHub?
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'node:fs';
const ofertas = JSON.parse(readFileSync(new URL('./cache/ofertas.json', import.meta.url)));
const objetivo = ['Paris', 'Falabella', 'Ripley', 'Buscalibre', 'Mercado Libre'];
const casos = objetivo.flatMap(t => ofertas.filter(o => o.tienda.startsWith(t)).slice(0, 2));
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--lang=es-CL'] });
const res = {};
for (const o of casos) {
  const t = o.tienda.replace(/ Marketplace$/, ''); res[t] ??= { ok: 0, n: 0, estados: new Set() }; res[t].n++;
  const page = await browser.newPage();
  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'es-CL,es;q=0.9' });
    const r = await page.goto(o.enlace, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(x => setTimeout(x, 3000));
    const html = await page.content(), status = r?.status();
    const nums = new Set([...html.matchAll(/"?price"?\s*[:=]\s*"?([\d.]+)"?|amount"\s+content="([\d.]+)"/g)].map(m => Math.round(Number(m[1] ?? m[2]))));
    const visible = html.includes(o.ahora.toLocaleString('es-CL'));
    const ok = nums.has(o.ahora) || visible; res[t].ok += ok; res[t].estados.add(ok ? 'precio confirmado' : `HTTP ${status}, precio no visible`);
  } catch (e) { res[t].estados.add('error: ' + e.message.slice(0, 40)); }
  await page.close();
}
await browser.close();
console.log('\n=== CON CHROME REAL (desde GitHub Actions) ===');
for (const [t, r] of Object.entries(res)) console.log(`${t.padEnd(18)} ${r.ok}/${r.n}  [${[...r.estados].join('; ')}]`);
