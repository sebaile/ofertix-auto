// Prueba de viabilidad: ¿responden las tiendas y Telegram desde los servidores de GitHub? No usa credenciales.
import { readFileSync } from 'node:fs';
const ofertas = JSON.parse(readFileSync(new URL('./cache/ofertas.json', import.meta.url)));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36';
const porTienda = new Map();
for (const o of ofertas) { const t = o.tienda.replace(/ Marketplace$/, ''); porTienda.set(t, [...(porTienda.get(t) ?? []), o]); }
const filas = [];
for (const [tienda, lista] of [...porTienda].sort((a, b) => b[1].length - a[1].length)) {
  for (const o of lista.slice(0, 2)) {
    let estado = '', ok = false;
    try {
      const r = await fetch(o.enlace, { headers: { 'User-Agent': UA, 'Accept-Language': 'es-CL' }, signal: AbortSignal.timeout(20000) });
      if (r.ok) { const nums = new Set([...(await r.text()).matchAll(/"?price"?\s*[:=]\s*"?([\d.]+)"?|amount"\s+content="([\d.]+)"/g)].map(m => Math.round(Number(m[1] ?? m[2])))); ok = nums.has(o.ahora); estado = ok ? 'precio confirmado' : 'respondió pero el precio no aparece'; } else estado = `HTTP ${r.status}`;
    } catch (e) { estado = 'error: ' + e.message.slice(0, 40); }
    filas.push({ tienda, ok, estado });
  }
}
console.log('\n=== RESULTADO POR TIENDA (desde GitHub Actions) ===');
const res = {}; for (const f of filas) { res[f.tienda] ??= { ok: 0, n: 0, estados: new Set() }; res[f.tienda].n++; res[f.tienda].ok += f.ok; res[f.tienda].estados.add(f.estado); }
for (const [t, r] of Object.entries(res)) console.log(`${t.padEnd(26)} ${r.ok}/${r.n} confirmados  [${[...r.estados].join('; ')}]`);
const total = filas.length, oks = filas.filter(f => f.ok).length;
console.log(`\nTOTAL: ${oks}/${total} ofertas con precio confirmado (${Math.round(100 * oks / total)} %)`);
