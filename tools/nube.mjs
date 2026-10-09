// Orquestador en la nube (GitHub Actions). Dos comandos:
//   node tools/nube.mjs preparar [historias|carrusel|reel] [--forzar] [--simulacro]
//       Genera el borrador (si es su hora), lo manda a Telegram y guarda su estado. --simulacro: solo genera los archivos.
//   node tools/nube.mjs tick
//       Lee tus botones de Telegram, descarta lo vencido y publica lo aprobado cuando toca.
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { randomBytes } from 'node:crypto';
import { env, raiz, datos, chile, chileAUtc, tg, avisar, botones, enviarFotos, contenedor, publicarContenedor, enlacePublicacion, urlPublica, esperarPublica, leerEstado, guardarEstado, fmt, dormir } from './lib.mjs';
import { candidatas, sigueVigente, elegirVariadas } from './ofertas-db.mjs';
import { renderizar, htmlHistoria, htmlHistoriaResumen, htmlCarrusel1, htmlCarrusel2, horaVisto } from './plantillas.mjs';
import { renderizar as renderizarReel } from './reel-motor.mjs';

const [, , cmd, ...resto] = process.argv;
const flags = new Set(resto.filter(a => a.startsWith('--'))), tipoArg = resto.find(a => !a.startsWith('--'));
const simulacro = flags.has('--simulacro'), forzar = flags.has('--forzar');
const ahora = new Date();
const HASHTAG = { libros: '#libros', perfumes: '#perfumes', gamer: '#gamer', tecnologia: '#tecnologia', hogar: '#hogar', belleza: '#belleza', moda: '#moda' };
const HORARIO_HIST = [['10:00', 'OFERTA DE LA MAÑANA'], ['13:00', 'OFERTA RELÁMPAGO'], ['16:00', 'OFERTA DE LA TARDE'], ['19:00', 'OFERTA DE LA NOCHE'], ['21:30', 'RESUMEN DEL DÍA']];
const CFG = {   // hora de Chile a la que se prepara cada contenido y cuántos minutos queda abierta la aprobación
  historias: { a: '09:30', limite: '12:30' }, carrusel: { a: '11:00', horas: 5 }, reel: { a: '17:00', horas: 4.5 },
};
const mins = hhmm => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3);
const resumenOferta = o => ({ id: o.id, nombre: o.nombre, tienda: o.tienda, ahora: o.ahora, antes: o.antes, pct: o.pct, rubro: o.rubro, esMinimo: o.esMinimo, dias: o.dias, visto: horaVisto(o) });

function textoCarrusel(o) {
  return `🔥 OFERTA DEL DÍA
${o.nombre}
Ahora: ${fmt(o.ahora)} (-${o.pct}%)
Referencia: ${fmt(o.antes)}
🏪 ${o.tienda}

✅ Precio visto hoy a las ${horaVisto(o)} en nuestro sistema.
${o.esMinimo ? `📉 Es el precio más bajo de los últimos ${o.dias} días.\n` : ''}⏰ Puede cambiar o agotarse sin aviso.
📲 Enlace directo en Telegram: t.me/ofertixcl

#ofertaschile ${HASHTAG[o.rubro] ?? ''} #descuentoschile #ofertix #ofertasdeldia`.replace(/ {2,}/g, ' ');
}
function textoReel(os) {
  const c = chile();
  return `🔥 3 ofertas de hoy
${os.map((o, i) => `${i + 1}. ${o.nombre}: ${fmt(o.ahora)} (-${o.pct}%, referencia ${fmt(o.antes)}) en ${o.tienda}${o.esMinimo ? ' · 📉 mínimo de ' + o.dias + ' días' : ''}`).join('\n')}

⏰ Precios vistos hoy (${+c.fecha.slice(8)}/${+c.fecha.slice(5, 7)}) en nuestro sistema. Pueden cambiar o agotarse sin aviso.
📲 Enlaces directos en Telegram: t.me/ofertixcl

#ofertaschile #descuentoschile #ofertix #ofertasdeldia #ahorrar`;
}

// ====================================================================== PREPARAR
async function preparar(tipo) {
  const c = chile(), key = `${c.fecha}-${tipo}`, cfg = CFG[tipo], estado = leerEstado();
  if (!simulacro && !forzar && (c.min < mins(cfg.a) - 10 || c.min > mins(cfg.a) + 55)) return console.log(`${tipo}: no es su hora (${c.hhmm}, toca a las ${cfg.a}).`);
  if (!simulacro && estado.items[key]) return console.log(`${tipo}: ya preparado hoy (${estado.items[key].estado}).`);
  const reservadas = Object.values(estado.items).filter(i => i.fecha === c.fecha && i.estado !== 'descartado').flatMap(i => i.ofertas.map(o => o.id));
  const cands = await candidatas({ excluirIds: [...Object.keys(estado.usadas), ...reservadas] });
  console.log(`${tipo}: ${cands.length} candidatas frescas`);
  const carpeta = join(datos, 'borrador', c.fecha); mkdirSync(carpeta, { recursive: true });
  const rel = f => relative(raiz, join(carpeta, f)).replace(/\\/g, '/');
  const falta = async msg => { console.log(msg); if (!simulacro) await avisar('ℹ️ ' + msg); };
  let item, mensajeId;
  const nonce = randomBytes(4).toString('hex');                      // código único de ESTE borrador: un botón viejo no puede aprobarlo

  if (tipo === 'carrusel') {
    const o = elegirVariadas(cands, 1, { permitirLibros: false })[0] ?? elegirVariadas(cands, 1)[0];
    if (!o) return falta('No hay una oferta fresca que cumpla los criterios para el carrusel de hoy.');
    const jpgs = await renderizar([htmlCarrusel1(o), htmlCarrusel2(o)], 1080, 1350);
    jpgs.forEach((b, i) => writeFileSync(join(carpeta, `carrusel-${i + 1}.jpg`), b));
    const texto = textoCarrusel(o);
    item = { tipo, fecha: c.fecha, estado: 'pendiente', ofertas: [resumenOferta(o)], archivos: jpgs.map((_, i) => rel(`carrusel-${i + 1}.jpg`)), texto, limite: new Date(ahora.getTime() + cfg.horas * 3600e3).toISOString() };
    if (simulacro) return console.log('\n' + texto);
    await enviarFotos(jpgs, 'carrusel');
    mensajeId = (await tg('sendMessage', { chat_id: env.TG_CHAT_ID, text: `📝 Carrusel para Instagram:\n\n${texto}\n\n¿Publico?`, reply_markup: botones(`ok:${c.fecha}:${nonce}`, `no:${c.fecha}:${nonce}`) })).message_id;
  }

  if (tipo === 'reel') {
    const os = elegirVariadas(cands, 3, { permitirLibros: false });
    if (os.length < 3) return falta(`Solo hay ${os.length} ofertas frescas para el Reel de hoy. No se prepara.`);
    const data = { hoy: c.fecha, ofertas: os.map(o => ({ nombre: o.nombre, tienda: o.tienda, ahora: o.ahora, antes: o.antes, pct: o.pct, antesOk: true })) };
    const salida = join(carpeta, 'reel.mp4');
    await renderizarReel({ css: REEL_CSS, pagina: readFileSync(join(raiz, 'tools', 'reel-pagina.js'), 'utf8'), data, eventos: eventosReel, salida });
    const texto = textoReel(os);
    item = { tipo, fecha: c.fecha, estado: 'pendiente', ofertas: os.map(resumenOferta), archivos: [rel('reel.mp4')], texto, limite: new Date(ahora.getTime() + cfg.horas * 3600e3).toISOString() };
    if (simulacro) return console.log('\n' + texto);
    const f = new FormData(); f.append('chat_id', env.TG_CHAT_ID); f.append('caption', `📝 Reel para Instagram:\n\n${texto}`.slice(0, 1000)); f.append('supports_streaming', 'true');
    f.append('reply_markup', JSON.stringify(botones(`rok:${c.fecha}:${nonce}`, `rno:${c.fecha}:${nonce}`))); f.append('video', new Blob([readFileSync(salida)], { type: 'video/mp4' }), 'reel.mp4');
    mensajeId = (await tg('sendVideo', f)).message_id;
  }

  if (tipo === 'historias') {
    const os = elegirVariadas(cands, 4, { permitirLibros: true });
    if (os.length < 3) return falta(`Solo hay ${os.length} ofertas frescas para las historias de hoy. No se prepara el paquete.`);
    const htmls = os.map((o, i) => htmlHistoria(HORARIO_HIST[i][1], o)); htmls.push(htmlHistoriaResumen(os));
    const jpgs = await renderizar(htmls, 1080, 1920);
    jpgs.forEach((b, i) => writeFileSync(join(carpeta, `historia-${i + 1}.jpg`), b));
    const plan = HORARIO_HIST.slice(0, os.length + 1).map(([hora, etiqueta], i) => {
      const hh = i === os.length ? HORARIO_HIST[4][0] : hora, jitter = Math.round(-3 + Math.random() * 10);
      return { hora: hh, etiqueta: i === os.length ? HORARIO_HIST[4][1] : etiqueta, objetivo: new Date(chileAUtc(c.fecha, hh).getTime() + jitter * 60e3).toISOString(), oferta: i < os.length ? resumenOferta(os[i]) : null, archivo: rel(`historia-${i + 1}.jpg`), hecho: null };
    });
    const resumen = plan.map(p => `${p.hora}  ${p.etiqueta}${p.oferta ? ` — ${p.oferta.nombre.slice(0, 38)} ${fmt(p.oferta.ahora)}` : ''}`).join('\n');
    item = { tipo, fecha: c.fecha, estado: 'pendiente', ofertas: os.map(resumenOferta), plan, limite: chileAUtc(c.fecha, cfg.limite).toISOString() };
    if (simulacro) return console.log('\n' + resumen);
    await enviarFotos(jpgs, 'historia');
    mensajeId = (await tg('sendMessage', { chat_id: env.TG_CHAT_ID, text: `📝 Historias de hoy (${plan.length}):\n\n${resumen}\n\nAntes de publicar cada una compruebo que el precio siga igual; si cambió, la omito.\nAprueba antes de las ${cfg.limite}; las historias cuya hora ya pasó se omiten.`, reply_markup: botones(`hok:${c.fecha}:${nonce}`, `hno:${c.fecha}:${nonce}`, '✅ Aprobar todas') })).message_id;
  }
  item.nonce = nonce; item.mensajeId = mensajeId;
  estado.items[key] = item; guardarEstado(estado);
  console.log(`${tipo}: borrador enviado a Telegram.`);
}

// ====================================================================== TICK
const PREFIJO = { ok: 'carrusel', no: 'carrusel', rok: 'reel', rno: 'reel', hok: 'historias', hno: 'historias' };
async function tick() {
  const estado = leerEstado(), ahoraMs = Date.now();
  // El token de Instagram vence a los 60 días: avisa a los 45 (el token actual se generó el 2026-10-09).
  const diasToken = Math.floor((ahoraMs - new Date(estado.tokenFecha ?? '2026-10-09').getTime()) / 86400e3);
  if (diasToken >= 45 && !estado.avisoToken) { estado.avisoToken = true; await avisar(`🔑 El token de Instagram tiene ${diasToken} días y vence a los 60. Hay que renovarlo pronto (dime y lo hacemos juntos).`); guardarEstado(estado); }
  const hayPendiente = Object.values(estado.items).some(i => ['pendiente', 'aprobado'].includes(i.estado));
  if (!hayPendiente) { console.log('Nada pendiente.'); return limpiar(estado); }

  // 1. Botones de Telegram
  const ups = await tg('getUpdates', { offset: estado.offset, timeout: 0, allowed_updates: ['callback_query'] });
  for (const u of ups) {
    estado.offset = Math.max(estado.offset, u.update_id + 1);
    const cb = u.callback_query; if (!cb || String(cb.from.id) !== String(env.TG_CHAT_ID)) continue;
    const [pref, fecha, nonce] = (cb.data ?? '').split(':'), tipo = PREFIJO[pref], item = estado.items[`${fecha}-${tipo}`];
    // Solo vale el botón de ESTE borrador: mismo código único y el mismo mensaje. Los botones viejos se ignoran.
    if (!item || !item.nonce || nonce !== item.nonce || (item.mensajeId && cb.message?.message_id !== item.mensajeId)) {
      await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ese botón es de un borrador antiguo y ya no vale.', show_alert: true }).catch(() => {});
      console.log('Botón ignorado (borrador antiguo o código distinto).'); continue;
    }
    await tg('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
    const nombre = tipo[0].toUpperCase() + tipo.slice(1);
    if (item.estado !== 'pendiente') { await avisar(`ℹ️ ${nombre}: ya estaba ${item.estado}.`); continue; }
    if (new Date(item.limite).getTime() < ahoraMs) { item.estado = 'descartado'; await quitarBotones(item); await avisar(`⌛ ${nombre}: ya venció (pasó la hora límite). No se publicará.`); continue; }
    if (pref.endsWith('ok')) { item.estado = 'aprobado'; await quitarBotones(item); await avisar(`✅ ${nombre} aprobado. Se publicará en la próxima revisión (hasta 10 min).`); }
    else { item.estado = 'descartado'; await quitarBotones(item); await avisar(`🗑 ${nombre} descartado. No se publicó nada.`); }
  }
  // 2. Vencidos
  for (const i of Object.values(estado.items)) if (i.estado === 'pendiente' && new Date(i.limite).getTime() < ahoraMs) { i.estado = 'descartado'; await quitarBotones(i); await avisar(`⌛ Pasó la hora límite sin respuesta: ${i.tipo} de hoy descartado. No se publicó nada.`); }
  guardarEstado(estado);

  // 3. Publicar lo aprobado
  for (const i of Object.values(estado.items).filter(x => x.estado === 'aprobado')) {
    try {
      if (i.tipo === 'carrusel') await publicarCarrusel(i, estado);
      else if (i.tipo === 'reel') await publicarReel(i, estado);
      else await publicarHistorias(i, estado);
    } catch (e) { i.estado = 'error'; i.error = String(e.message).slice(0, 300); await avisar(`⚠️ Falló la publicación (${i.tipo}): ${i.error}\nNo se publicó nada a medias.`); }
    guardarEstado(estado);
  }
  limpiar(estado);
}

const quitarBotones = item => item.mensajeId ? tg('editMessageReplyMarkup', { chat_id: env.TG_CHAT_ID, message_id: item.mensajeId, reply_markup: { inline_keyboard: [] } }).catch(() => {}) : Promise.resolve();
async function vigente(o) { const v = await sigueVigente(o.id, o.ahora); return v; }
async function publicarCarrusel(i, estado) {
  const o = i.ofertas[0], v = await vigente(o);
  if (!v.ok) { i.estado = 'omitido'; return avisar(`⏭ No publiqué el carrusel: ${v.motivo} (${o.nombre.slice(0, 40)}).`); }
  const urls = i.archivos.map(urlPublica); for (const u of urls) await esperarPublica(u);
  const hijos = []; for (const u of urls) hijos.push(await contenedor({ image_url: u, is_carousel_item: 'true' }));
  const car = await contenedor({ media_type: 'CAROUSEL', children: hijos.join(','), caption: i.texto });
  const id = await publicarContenedor(car), enlace = await enlacePublicacion(id);
  Object.assign(i, { estado: 'publicado', id, enlace }); estado.usadas[o.id] = new Date().toISOString();
  await avisar(`✅ Carrusel publicado en Instagram.\n${enlace}`);
}
async function publicarReel(i, estado) {
  const bad = []; for (const o of i.ofertas) { const v = await vigente(o); if (!v.ok) bad.push(`${o.nombre.slice(0, 30)}: ${v.motivo}`); }
  if (bad.length) { i.estado = 'omitido'; return avisar(`⏭ No publiqué el Reel porque cambiaron ofertas:\n- ${bad.join('\n- ')}`); }
  const url = urlPublica(i.archivos[0]); await esperarPublica(url);
  const cont = await contenedor({ media_type: 'REELS', video_url: url, caption: i.texto, share_to_feed: 'true' }, 90, 5000);
  const id = await publicarContenedor(cont), enlace = await enlacePublicacion(id);
  Object.assign(i, { estado: 'publicado', id, enlace }); i.ofertas.forEach(o => { estado.usadas[o.id] = new Date().toISOString(); });
  await avisar(`✅ Reel publicado en Instagram.\n${enlace}`);
}
async function publicarHistorias(i, estado) {
  for (const p of i.plan) {
    if (p.hecho) continue;
    const t = new Date(p.objetivo).getTime();
    if (t > Date.now()) continue;                                              // todavía no es su hora
    if (Date.now() - t > 90 * 60e3) { p.hecho = 'omitida: llegó tarde'; continue; }
    if (p.oferta) { const v = await vigente(p.oferta); if (!v.ok) { p.hecho = `omitida: ${v.motivo}`; continue; } }
    try {
      const url = urlPublica(p.archivo); await esperarPublica(url);
      await publicarContenedor(await contenedor({ media_type: 'STORIES', image_url: url }, 40, 4000));
      p.hecho = 'publicada'; if (p.oferta) estado.usadas[p.oferta.id] = new Date().toISOString();
    } catch (e) { p.hecho = `omitida: error (${String(e.message).slice(0, 80)})`; }
  }
  if (i.plan.every(p => p.hecho)) {
    i.estado = 'terminado';
    const ok = i.plan.filter(p => p.hecho === 'publicada').length, mal = i.plan.filter(p => p.hecho !== 'publicada');
    await avisar(`📊 Historias de hoy: ${ok} publicadas${mal.length ? `, ${mal.length} omitidas:\n- ${mal.map(p => `${p.hora} ${p.hecho}`).join('\n- ')}` : '.'}`);
  }
}

function limpiar(estado) {                                                      // borra borradores de más de 4 días y estado viejo
  const corte = Date.now() - 4 * 86400e3;
  try { for (const d of readdirSync(join(datos, 'borrador'))) if (new Date(d).getTime() < corte) rmSync(join(datos, 'borrador', d), { recursive: true, force: true }); } catch {}
  for (const [k, i] of Object.entries(estado.items)) if (new Date(i.fecha).getTime() < Date.now() - 8 * 86400e3) delete estado.items[k];
  for (const [k, t] of Object.entries(estado.usadas)) if (new Date(t).getTime() < Date.now() - 30 * 86400e3) delete estado.usadas[k];
  guardarEstado(estado);
}

// ====================================================================== Reel: estilos y sonidos
const REEL_CSS = `.chip{display:inline-block;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.25);border-radius:40px;padding:10px 34px;transform-origin:left center}
.chip2{display:inline-block;background:#06D6A0;color:#0b2e25;border-radius:40px;padding:12px 38px}.old{position:absolute}.strike{position:absolute;left:0;top:54%;height:8px;width:0;background:#FF2E63;border-radius:4px}
.bdg{transform-origin:left center}.bdg span{display:inline-block;background:#fff;color:#FF2E63;font-size:110px;font-weight:800;border-radius:36px;padding:6px 52px;box-shadow:0 14px 0 rgba(255,46,99,.55)}
.ring{position:absolute;left:250px;top:1310px;width:420px;height:420px;margin:-210px 0 0 -210px;border:14px solid #FF8A00;border-radius:50%;opacity:0}.fl{position:absolute;left:0;top:0;font-size:90px;opacity:0}`;
function eventosReel(S, d) {
  const ev = [{ t: 0.05, k: 'thump' }, { t: 0.45, k: 'pop', f: 700 }, { t: 0.65, k: 'pop', f: 900 }, { t: 1.15, k: 'ding', f: 1175 }];
  d.ofertas.forEach((o, i) => { const s = S[i + 1]; ev.push({ t: s - 0.05, k: 'whoosh' }, { t: s + 0.4, k: 'pop', f: 600 }, { t: s + 1.25, k: 'pop', f: 500 }, { t: s + 1.55, k: 'chirp' }, { t: s + 2.15, k: 'thump' }, { t: s + 2.2, k: 'ding', f: 1568 }); });
  const so = S[S.length - 1]; ev.push({ t: so - 0.05, k: 'whoosh' }, { t: so + 0.25, k: 'pop', f: 700 }, { t: so + 0.45, k: 'pop', f: 900 }, { t: so + 0.95, k: 'ding', f: 1568 });
  return ev;
}

// ====================================================================== Entrada
try {
  if (cmd === 'preparar') { const tipos = tipoArg ? [tipoArg] : ['historias', 'carrusel', 'reel']; for (const t of tipos) { try { await preparar(t); } catch (e) { console.error(`${t}:`, e.message); if (!simulacro) await avisar(`⚠️ No pude preparar ${t}: ${String(e.message).slice(0, 200)}`).catch(() => {}); } } }
  else if (cmd === 'tick') await tick();
  else console.log('Uso: node tools/nube.mjs preparar [historias|carrusel|reel] [--forzar] [--simulacro] | tick');
} catch (e) { console.error(e); process.exit(1); }
