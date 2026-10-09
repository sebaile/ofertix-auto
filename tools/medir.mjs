// Medición: lee las estadísticas de Instagram de lo publicado y manda un informe diario por Telegram.
// Compara los dos horarios de Reel (13:00 vs 20:30) y de carrusel (11:00 vs 18:30) para quedarse con el mejor.
import { env, chile, avisar } from './lib.mjs';

const API = 'https://graph.instagram.com/v21.0';
const get = async ruta => (await fetch(`${API}/${ruta}${ruta.includes('?') ? '&' : '?'}access_token=${env.IG_TOKEN}`)).json();
const FECHA_DECISION = '2026-10-17', MIN_MUESTRAS = 3;

async function estadisticas(i) {
  const metricas = i.tipo === 'reel' ? 'reach,views,saved,shares,likes,comments' : 'reach,saved,shares,likes,comments';
  let r = await get(`${i.id}/insights?metric=${metricas}`);
  if (r.error && i.tipo === 'reel') r = await get(`${i.id}/insights?metric=reach,saved,shares,likes,comments`);
  if (r.error) return null;
  const m = {}; for (const x of r.data ?? []) m[x.name] = x.values?.[0]?.value ?? 0;
  return m;
}
const prom = a => a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : 0;

export async function medir(estado, { forzar = false } = {}) {
  const hoy = chile();
  if (!forzar && (estado.informeFecha === hoy.fecha || hoy.min < 21 * 60 + 30)) return false;   // un informe al día, pasadas las 21:30
  const desde = Date.now() - 14 * 864e5;
  const reales = Object.entries(estado.items).filter(([, i]) => i.estado === 'publicado' && i.id && !i.prueba && new Date(i.fecha + 'T12:00:00Z').getTime() > desde);
  for (const [, i] of reales) { const m = await estadisticas(i); if (m) i.medidas = { ...m, al: new Date().toISOString() }; }

  const cuenta = await get(`me?fields=followers_count,media_count`);
  const alc = await get(`me/insights?metric=reach&period=day`);
  const dias = (alc.data?.[0]?.values ?? []).map(v => v.value);
  const seguidores = cuenta.followers_count;
  const previo = estado.seguidores ?? seguidores; estado.seguidores = seguidores;

  const hoyItems = reales.filter(([, i]) => i.fecha === hoy.fecha);
  const L = [`📈 Informe del día (${hoy.fecha})`, `Seguidores: ${seguidores ?? '?'} (${seguidores - previo >= 0 ? '+' : ''}${(seguidores ?? 0) - previo} desde el último informe)`,
    dias.length ? `Alcance de la cuenta, últimos días: ${dias.join(' · ')}` : ''];
  L.push('', 'Publicado hoy:');
  for (const [, i] of hoyItems) L.push(`• ${i.slot ?? i.tipo}: alcance ${i.medidas?.reach ?? '–'}, guardados ${i.medidas?.saved ?? 0}, compartidos ${i.medidas?.shares ?? 0}, me gusta ${i.medidas?.likes ?? 0}`);
  if (!hoyItems.length) L.push('• nada publicado hoy');

  // Comparación de horarios con lo que ya lleva al menos 24 h publicado
  const maduros = reales.filter(([, i]) => i.medidas && Date.now() - new Date(i.medidas.al).getTime() >= 0 && i.fecha < hoy.fecha);
  const por = id => maduros.filter(([, i]) => i.slot === id).map(([, i]) => i.medidas.reach ?? 0);
  const filas = [['reel-a', 'Reel 13:00'], ['reel-b', 'Reel 20:30'], ['carrusel-a', 'Carrusel 11:00'], ['carrusel-b', 'Carrusel 18:30']];
  L.push('', 'Alcance promedio por horario (publicaciones de días anteriores):');
  for (const [id, n] of filas) { const a = por(id); L.push(`• ${n}: ${a.length ? prom(a) : '–'} (${a.length} publicaciones)`); }
  if (hoy.fecha >= FECHA_DECISION) for (const [a, b, n] of [['reel-a', 'reel-b', 'Reel'], ['carrusel-a', 'carrusel-b', 'carrusel']]) {
    const A = por(a), B = por(b);
    if (A.length >= MIN_MUESTRAS && B.length >= MIN_MUESTRAS) L.push(`➡️ ${n}: gana el horario ${prom(A) >= prom(B) ? PLAN_HORA[a] : PLAN_HORA[b]} (${Math.max(prom(A), prom(B))} vs ${Math.min(prom(A), prom(B))} de alcance). Dime si quieres mover el otro horario a ese.`);
    else L.push(`➡️ ${n}: todavía faltan datos (${A.length} y ${B.length} publicaciones; hacen falta ${MIN_MUESTRAS} de cada una).`);
  }
  const top = [...reales].filter(([, i]) => i.medidas).sort((x, y) => (y[1].medidas.reach ?? 0) - (x[1].medidas.reach ?? 0)).slice(0, 3);
  if (top.length) { L.push('', 'Lo que mejor ha funcionado:'); for (const [, i] of top) L.push(`• ${i.slot ?? i.tipo} del ${i.fecha}: alcance ${i.medidas.reach} → ${i.enlace}`); }
  await avisar(L.filter(x => x !== null).join('\n'));
  estado.informeFecha = hoy.fecha;
  return true;
}
const PLAN_HORA = { 'reel-a': '13:00', 'reel-b': '20:30', 'carrusel-a': '11:00', 'carrusel-b': '18:30' };
