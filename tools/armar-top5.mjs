// Convierte ofertas-brutas.json en ofertas estructuradas y arma top5.json (1 por canal, mayor descuento, nombres cortos)
import { readFileSync, writeFileSync } from 'node:fs';
const brutas = JSON.parse(readFileSync(new URL('./cache/ofertas-brutas.json', import.meta.url)));
const num = s => Number(s.replace(/\./g, ''));
const ofertas = [];
for (const m of brutas) {
  const p = m.texto.match(/🔥\s*\$([\d.]+)\s*\(antes\s*\$([\d.]+)\s*·\s*-(\d+)%\)/);
  const tienda = m.texto.match(/🏪\s*(.+)/)?.[1]?.trim();
  const nombre = m.texto.split('\n')[0].replace(/^\S+\s+/, '').trim();
  if (!p || !tienda || !nombre) continue;
  const ahora = num(p[1]), antes = num(p[2]), pct = +p[3];
  if (Math.round((1 - ahora / antes) * 100) !== pct) continue; // descuento inconsistente: se descarta
  ofertas.push({ canal: m.canal, post: m.post, fecha: m.fecha, nombre, tienda, ahora, antes, pct, enlace: m.enlaces[0] });
}
writeFileSync(new URL('./cache/ofertas.json', import.meta.url), JSON.stringify(ofertas, null, 1));
console.log(ofertas.length, 'ofertas válidas de', brutas.length, 'mensajes');
const fmt = n => '$' + n.toLocaleString('es-CL');
const elegidas = [], usados = new Set();
for (const o of [...ofertas].filter(o => o.canal !== 'ofertixcl' && o.nombre.length <= 62 && o.pct >= 40).sort((a, b) => b.pct - a.pct)) {
  if (usados.has(o.canal)) continue; usados.add(o.canal); elegidas.push(o);
  if (elegidas.length === 5) break;
}
const hoy = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
writeFileSync(new URL('./top5.json', import.meta.url), JSON.stringify({
  nombre: 'post6', semana: hoy,
  productos: elegidas.map(o => ({ nombre: o.nombre, tienda: o.tienda, nota: `precio del ${new Date(o.fecha).toLocaleDateString('es-CL',{day:'numeric',month:'numeric'})}`, antes: fmt(o.antes), ahora: fmt(o.ahora), pct: o.pct, enlace: o.enlace, canal: o.canal }))
}, null, 1));
console.table(elegidas.map(o => ({ canal: o.canal, nombre: o.nombre.slice(0, 45), tienda: o.tienda, ahora: o.ahora, antes: o.antes, pct: o.pct })));
