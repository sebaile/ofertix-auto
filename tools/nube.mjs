// Orquestador en la nube (GitHub Actions).
//   node tools/nube.mjs preparar [historias|carrusel|reel|prueba-historia] [--forzar] [--simulacro]
//       Genera el contenido (si es su hora) con foto del producto y lo manda a Telegram. En modo autónomo queda aprobado y se publica
//       solo pasados unos minutos, con un botón para cancelar. --simulacro: solo genera los archivos, sin Telegram ni estado.
//   node tools/nube.mjs tick [--bucle] [--sin-publicar]
//       Lee tus botones y comandos de Telegram, vence lo caducado y publica lo aprobado cuando toca.
//   Comandos de Telegram: /pausa  /reanudar  /modo auto|manual  /estado
import { mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { randomBytes } from 'node:crypto';
import { env, raiz, datos, chile, chileAUtc, tg, avisar, botones, enviarFotos, contenedor, publicarContenedor, enlacePublicacion, urlPublica, esperarPublica,
  leerEstado, guardarEstado, subirCambios, relanzarRevision, traerImagen, fmt, dormir, ig, subirMedios } from './lib.mjs';
import { espejarCarrusel, espejarReel, espejarHistoria } from './espejo.mjs';
import { candidatas, sigueVigente, elegirConImagen, nombreNorm } from './ofertas-db.mjs';
import { renderizar, htmlHistoria, htmlHistoriaResumen, htmlCarrusel1, htmlCarrusel2, horaVisto, htmlTopPortada, htmlTopLista, htmlTopCierre, EDUCATIVOS, htmlEducativo } from './plantillas.mjs';
import { renderizar as renderizarReel } from './reel-motor.mjs';
import { medir } from './medir.mjs';
import { PLAN, HORARIO_HIST, enVentana, temaDelDia, numeroSemana } from './plan.mjs';

const [, , cmd, ...resto] = process.argv;
const flags = new Set(resto.filter(a => a.startsWith('--'))), tipoArg = resto.find(a => !a.startsWith('--'));
const simulacro = flags.has('--simulacro'), forzar = flags.has('--forzar');
const HASHTAG = { libros: '#libros', perfumes: '#perfumes', gamer: '#gamer', tecnologia: '#tecnologia', hogar: '#hogar', belleza: '#belleza', moda: '#moda' };
const TEMA = { tecnologia: 'tecnología', gamer: 'gamer', perfumes: 'perfumes', hogar: 'hogar', belleza: 'belleza', moda: 'moda', libros: 'libros' };
const COOLING_MIN = 5;                                                              // en modo autónomo: minutos para cancelar antes de publicar
const PREF_OK = { carrusel: 'ok', reel: 'rok', historias: 'hok' }, PREF_NO = { carrusel: 'no', reel: 'rno', historias: 'hno' };
const PREFIJO = { ok: 'carrusel', no: 'carrusel', rok: 'reel', rno: 'reel', hok: 'historias', hno: 'historias' };
const mins = hhmm => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3);
const mayus = s => s[0].toUpperCase() + s.slice(1);
const resumenOferta = o => ({ id: o.id, nombre: o.nombre, tienda: o.tienda, ahora: o.ahora, antes: o.antes, pct: o.pct, rubro: o.rubro, esMinimo: o.esMinimo, dias: o.dias, visto: horaVisto(o) });
const quitarBotones = item => item.mensajeId ? tg('editMessageReplyMarkup', { chat_id: env.TG_CHAT_ID, message_id: item.mensajeId, reply_markup: { inline_keyboard: [] } }).catch(() => {}) : Promise.resolve();
const abiertos = estado => Object.values(estado.items).filter(i => ['pendiente', 'aprobado'].includes(i.estado));

function textoCarrusel(o, etiqueta = 'OFERTA DEL DÍA') {
  return `🔥 ${etiqueta}
${o.nombre}
Ahora: ${fmt(o.ahora)} (-${o.pct}%)
Referencia: ${fmt(o.antes)}
🏪 ${o.tienda}

✅ Precio visto hoy a las ${horaVisto(o)} en nuestro sistema.
${o.esMinimo ? `📉 Es el precio más bajo de los últimos ${o.dias} días.\n` : ''}⏰ Puede cambiar o agotarse sin aviso.
📲 Enlace directo en Telegram: t.me/ofertixcl

#ofertaschile ${HASHTAG[o.rubro] ?? ''} #descuentoschile #ofertix #ofertasdeldia`.replace(/ {2,}/g, ' ');
}
function textoTop(titulo, os, rubro) {
  const c = chile();
  return `🏆 ${titulo}
${os.map((o, i) => `${i + 1}. ${o.nombre}: ${fmt(o.ahora)} (-${o.pct}%) en ${o.tienda}${o.esMinimo ? ' · 📉 mínimo de ' + o.dias + ' días' : ''}`).join('\n')}

⏰ Precios vistos hoy (${+c.fecha.slice(8)}/${+c.fecha.slice(5, 7)}) en nuestro sistema. Pueden cambiar o agotarse sin aviso.
📲 Enlaces directos en Telegram: t.me/ofertixcl

#ofertaschile ${rubro ? HASHTAG[rubro] : ''} #top5 #descuentoschile #ofertix #ahorrar`.replace(/ {2,}/g, ' ');
}
function textoReel(os, rubro, minimos, etiqueta = null) {
  const c = chile();
  return `🔥 3 ofertas ${etiqueta ?? (minimos ? 'en su precio más bajo de los últimos días' : rubro ? 'de ' + TEMA[rubro] : 'de hoy')}
${os.map((o, i) => `${i + 1}. ${o.nombre}: ${fmt(o.ahora)} (-${o.pct}%, referencia ${fmt(o.antes)}) en ${o.tienda}${o.esMinimo ? ' · 📉 mínimo de ' + o.dias + ' días' : ''}`).join('\n')}

⏰ Precios vistos hoy (${+c.fecha.slice(8)}/${+c.fecha.slice(5, 7)}) en nuestro sistema. Pueden cambiar o agotarse sin aviso.
📲 Enlaces directos en Telegram: t.me/ofertixcl

#ofertaschile ${rubro ? HASHTAG[rubro] : ''} #descuentoschile #ofertix #ofertasdeldia #ahorrar`.replace(/ {2,}/g, ' ');
}

// ====================================================================== PREPARAR
async function preparar(slot) {
  const tipo = slot.tipo, prueba = flags.has('--prueba');                // prueba: aparte de las del día, sin horario y sin tiempo de espera
  const c = chile(), key = prueba ? `${c.fecha}-${slot.id}-prueba-${Date.now()}` : `${c.fecha}-${slot.id}`, estado = leerEstado(), auto = estado.config.modo === 'auto';
  const temaDia = temaDelDia(slot, c.fecha), rubroTema = temaDia?.rubro ?? null;     // tema del día (Top 5, mínimos, educativo, rubro del Reel)
  const publicaEn = chileAUtc(c.fecha, slot.hora);                       // hora exacta de publicación (carrusel/Reel)
  if (!simulacro && estado.config.pausado) return console.log(`${slot.id}: el sistema está en pausa (/reanudar para activarlo).`);
  if (!simulacro && !forzar && !prueba && !enVentana(slot, c.min)) return console.log(`${slot.id}: no es su hora (${c.hhmm}, toca a las ${slot.hora}).`);
  if (!simulacro && !prueba && estado.items[key]) return console.log(`${slot.id}: ya preparado hoy (${estado.items[key].estado}).`);
  const delDia = Object.values(estado.items).filter(i => i.fecha === c.fecha && i.estado !== 'descartado');
  const reservadas = delDia.flatMap(i => i.ofertas.map(o => o.id));
  const nombresUsados = [...Object.keys(estado.nombres), ...delDia.flatMap(i => i.ofertas.map(o => nombreNorm(o.nombre)))];
  const cands = await candidatas({ excluirIds: [...Object.keys(estado.usadas), ...reservadas] });
  const elegir = (n, o = {}) => elegirConImagen(cands, n, { traerImagen, nombresUsados, ...o });
  console.log(`${tipo}: ${cands.length} candidatas frescas (modo ${estado.config.modo})`);
  const carpeta = join(datos, 'borrador', c.fecha); mkdirSync(carpeta, { recursive: true });
  const rel = f => relative(raiz, join(carpeta, f)).replace(/\\/g, '/');
  const falta = async msg => { console.log(msg); if (!simulacro) await avisar('ℹ️ ' + msg); };
  const limiteIso = () => new Date(publicaEn.getTime() + (slot.horasAbierto ?? 3) * 3600e3).toISOString();
  let item, enviar;                                  // enviar(markup, nota) manda el borrador a Telegram y devuelve el id del mensaje

  if (tipo === 'carrusel') {
    let jpgs, texto, ofertas = [];
    const tt = temaDia?.tipo;
    if (tt === 'educativo') {                                                          // contenido fijo, rota por semana
      const set = EDUCATIVOS[(numeroSemana(c.fecha) + 1) % EDUCATIVOS.length];
      jpgs = await renderizar(htmlEducativo(set), 1080, 1350); texto = set.texto;
    } else if (tt === 'top5' || tt === 'minimos') {                                    // 5 ofertas en una lista, con foto
      const pedir = extra => elegir(5, { permitirLibros: false, maxPorRubro: extra.rubro || tt === 'minimos' ? 5 : 1, maxPorTienda: 2, soloMinimos: tt === 'minimos', ...extra });
      let os = await pedir(temaDia.rubro ? { rubro: temaDia.rubro } : {}), titulo = temaDia.titulo, rubro = temaDia.rubro ?? null;
      if (os.length < 4 && rubro) { os = await pedir({}); titulo = 'Top 5 ofertas de hoy'; rubro = null; }   // el rubro del día no alcanza
      if (os.length >= (tt === 'minimos' ? 3 : 4)) {
        const sub = tt === 'minimos' ? 'Precios en su punto más bajo registrado' : 'Las mejores ofertas, con precio visto hoy';
        jpgs = await renderizar([htmlTopPortada(titulo, sub, 1, 3), htmlTopLista(titulo, os, 2, 3), htmlTopCierre(3, 3)], 1080, 1350);
        texto = textoTop(titulo, os, rubro); ofertas = os.map(resumenOferta);
      }
    }
    if (!jpgs) {                                                                       // oferta del día (también si el tema no tiene suficientes ofertas)
      let [o] = await elegir(1, { permitirLibros: false }); if (!o) [o] = await elegir(1);
      if (!o) return falta('No hay una oferta fresca, con foto, que cumpla los criterios para el carrusel de hoy.');
      jpgs = await renderizar([htmlCarrusel1(o), htmlCarrusel2(o)], 1080, 1350); texto = textoCarrusel(o); ofertas = [resumenOferta(o)];
    }
    jpgs.forEach((b, i) => writeFileSync(join(carpeta, `${slot.id}-${i + 1}.jpg`), b));
    item = { tipo, slot: slot.id, fecha: c.fecha, ofertas, archivos: jpgs.map((_, i) => rel(`${slot.id}-${i + 1}.jpg`)), texto, limite: limiteIso() };
    if (simulacro) return console.log('\n' + texto);
    enviar = async (markup, nota) => { await enviarFotos(jpgs, 'carrusel'); return (await tg('sendMessage', { chat_id: env.TG_CHAT_ID, text: `📝 Carrusel para Instagram:\n\n${texto}\n\n${nota}`, reply_markup: markup })).message_id; };
  }

  if (tipo === 'reel') {
    let os = [], tema = null, minimos = false;
    if (temaDia?.minimos) { os = await elegir(3, { permitirLibros: false, soloMinimos: true }); minimos = os.length === 3; }   // 3 ofertas en su precio más bajo registrado
    if (!minimos && rubroTema) { os = await elegir(3, { permitirLibros: false, rubro: rubroTema }); tema = os.length === 3 ? rubroTema : null; }
    if (!minimos && !tema) os = await elegir(3, { permitirLibros: false });          // si el tema del día no alcanza, sale un Reel general
    if (os.length < 3) return falta(`Solo hay ${os.length} ofertas frescas con foto para el Reel (${slot.id}). No se prepara.`);
    const corto = (s, n = 50) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)) + '…');   // en el video caben ~3 líneas
    const data = { hoy: c.fecha, sufijo: minimos ? 'EN SU MÍNIMO' : tema ? 'DE ' + TEMA[tema].toUpperCase() : 'DE HOY', ofertas: os.map(o => ({ nombre: corto(o.nombre), tienda: o.tienda, ahora: o.ahora, antes: o.antes, pct: o.pct, antesOk: true, img: o.img })) };
    const salida = join(carpeta, `${slot.id}.mp4`);
    await renderizarReel({ css: REEL_CSS, pagina: readFileSync(join(raiz, 'tools', 'reel-pagina.js'), 'utf8'), data, eventos: eventosReel, salida });
    const texto = textoReel(os, tema, minimos);
    item = { tipo, slot: slot.id, fecha: c.fecha, ofertas: os.map(resumenOferta), archivos: [rel(`${slot.id}.mp4`)], texto, limite: limiteIso() };
    if (simulacro) return console.log('\n' + texto);
    enviar = async (markup, nota) => {
      const f = new FormData(); f.append('chat_id', env.TG_CHAT_ID); f.append('caption', `📝 Reel para Instagram:\n\n${texto.slice(0, 780)}\n\n${nota}`); f.append('supports_streaming', 'true');
      if (markup) f.append('reply_markup', JSON.stringify(markup)); f.append('video', new Blob([readFileSync(salida)], { type: 'video/mp4' }), 'reel.mp4');
      return (await tg('sendVideo', f)).message_id;
    };
  }

  if (tipo === 'historias') {
    const os = await elegir(4);
    if (os.length < 3) return falta(`Solo hay ${os.length} ofertas frescas con foto para las historias de hoy. No se prepara el paquete.`);
    const htmls = os.map((o, i) => htmlHistoria(HORARIO_HIST[i][1], o)); htmls.push(htmlHistoriaResumen(os));
    const jpgs = await renderizar(htmls, 1080, 1920);
    jpgs.forEach((b, i) => writeFileSync(join(carpeta, `historia-${i + 1}.jpg`), b));
    const plan = HORARIO_HIST.slice(0, os.length + 1).map(([hora, etiqueta], i) => {
      const resumen = i === os.length, hh = resumen ? HORARIO_HIST[4][0] : hora, jitter = Math.round(-3 + Math.random() * 10);
      return { hora: hh, etiqueta: resumen ? HORARIO_HIST[4][1] : etiqueta, objetivo: new Date(chileAUtc(c.fecha, hh).getTime() + jitter * 60e3).toISOString(), oferta: resumen ? null : resumenOferta(os[i]), archivo: rel(`historia-${i + 1}.jpg`), hecho: null };
    });
    const resumen = plan.map(p => `${p.hora}  ${p.etiqueta}${p.oferta ? ` — ${p.oferta.nombre.slice(0, 38)} ${fmt(p.oferta.ahora)}` : ''}`).join('\n');
    item = { tipo, slot: slot.id, fecha: c.fecha, ofertas: os.map(resumenOferta), plan, limite: chileAUtc(c.fecha, slot.limite).toISOString() };
    if (simulacro) return console.log('\n' + resumen);
    enviar = async (markup, nota) => { await enviarFotos(jpgs, 'historia'); return (await tg('sendMessage', { chat_id: env.TG_CHAT_ID, text: `📝 Historias de hoy (${plan.length}):\n\n${resumen}\n\nAntes de publicar cada una compruebo que el precio siga igual; si cambió, la omito.\n\n${nota}`, reply_markup: markup })).message_id; };
  }

  const nonce = randomBytes(4).toString('hex');                      // código único de ESTE borrador: un botón viejo no puede aprobarlo
  item.nonce = nonce; item.estado = prueba || auto ? 'aprobado' : 'pendiente';
  if (prueba) item.prueba = true;
  else if (auto) item.publicarDesde = new Date(tipo === 'historias' ? Date.now() + COOLING_MIN * 60e3 : Math.max(publicaEn.getTime(), Date.now() + COOLING_MIN * 60e3)).toISOString();   // carrusel/Reel salen a su hora exacta
  const markup = prueba ? undefined : auto ? { inline_keyboard: [[{ text: '⏸ Cancelar esta publicación', callback_data: `${PREF_NO[tipo]}:${c.fecha}:${nonce}` }]] }
    : botones(`${PREF_OK[tipo]}:${c.fecha}:${nonce}`, `${PREF_NO[tipo]}:${c.fecha}:${nonce}`, tipo === 'historias' ? '✅ Aprobar todas' : undefined);
  const cuando = tipo === 'historias' ? 'a lo largo del día, cada una a su hora' : `a las ${slot.hora}`;
  const nota = prueba ? '🧪 Publicación de prueba: se publica en unos minutos.' : auto ? `🤖 Modo autónomo: se publica ${cuando}. Si no lo quieres, pulsa Cancelar. (/pausa detiene todo)` : (tipo === 'historias' ? `Aprueba antes de las ${slot.limite}.` : '¿Publico?');
  item.mensajeId = await enviar(markup, nota);
  estado.items[key] = item; guardarEstado(estado);
  console.log(`${slot.id}: ${auto ? 'aprobado automáticamente (publica ' + cuando + ')' : 'enviado para aprobación'}.`);
}

// Historia de prueba: una oferta real con foto, publicada ya (sin esperar aprobación).
async function pruebaHistoria() {
  const c = chile(), estado = leerEstado();
  const cands = await candidatas({ excluirIds: Object.keys(estado.usadas) });
  const [o] = await elegirConImagen(cands, 1, { traerImagen, nombresUsados: Object.keys(estado.nombres), permitirLibros: false });
  if (!o) return avisar('ℹ️ No encontré una oferta con foto para la historia de prueba.');
  const [jpg] = await renderizar([htmlHistoria('OFERTA DEL MOMENTO', o)], 1080, 1920);
  const carpeta = join(datos, 'borrador', c.fecha); mkdirSync(carpeta, { recursive: true });
  const nombre = `prueba-historia-${Date.now()}.jpg`; writeFileSync(join(carpeta, nombre), jpg);
  if (simulacro) return console.log('Historia de prueba generada:', nombre);
  const archivo = relative(raiz, join(carpeta, nombre)).replace(/\\/g, '/');
  estado.items[`${c.fecha}-prueba-${Date.now()}`] = { tipo: 'historias', fecha: c.fecha, estado: 'aprobado', prueba: true, ofertas: [resumenOferta(o)], limite: new Date(Date.now() + 3600e3).toISOString(),
    plan: [{ hora: 'ahora', etiqueta: 'PRUEBA', objetivo: new Date().toISOString(), oferta: resumenOferta(o), archivo, hecho: null }] };
  guardarEstado(estado);
  const f = new FormData(); f.append('chat_id', env.TG_CHAT_ID); f.append('caption', `🧪 Historia de prueba (se publica en unos minutos):\n${o.nombre} · ${fmt(o.ahora)}`); f.append('photo', new Blob([jpg], { type: 'image/jpeg' }), 'historia.jpg');
  await tg('sendPhoto', f);
  console.log('Historia de prueba preparada.');
}

// ====================================================================== TICK
async function procesarBoton(cb, estado) {
  if (String(cb.from.id) !== String(env.TG_CHAT_ID)) return;
  const [pref, , nonce] = (cb.data ?? '').split(':');
  const item = nonce ? Object.values(estado.items).find(i => i.nonce === nonce) : undefined, tipo = item?.slot ?? item?.tipo;   // el código único identifica el borrador (hay varios del mismo tipo al día)
  // Solo vale el botón de ESTE borrador: mismo código único y el mismo mensaje. Los botones viejos se ignoran.
  if (!item || !item.nonce || nonce !== item.nonce || (item.mensajeId && cb.message?.message_id !== item.mensajeId)) {
    await tg('answerCallbackQuery', { callback_query_id: cb.id, text: 'Ese botón es de un borrador antiguo y ya no vale.', show_alert: true }).catch(() => {});
    return console.log('Botón ignorado (borrador antiguo o código distinto).');
  }
  await tg('answerCallbackQuery', { callback_query_id: cb.id }).catch(() => {});
  const nombre = mayus(tipo);
  if (pref.endsWith('ok')) {
    if (item.estado !== 'pendiente') return avisar(`ℹ️ ${nombre}: ya estaba ${item.estado}.`);
    if (new Date(item.limite).getTime() < Date.now()) { item.estado = 'descartado'; await quitarBotones(item); return avisar(`⌛ ${nombre}: ya venció (pasó la hora límite). No se publicará.`); }
    item.estado = 'aprobado'; await quitarBotones(item); return avisar(`✅ ${nombre} aprobado. Se publicará en la próxima revisión (hasta 10 min).`);
  }
  if (!['pendiente', 'aprobado'].includes(item.estado)) return avisar(`ℹ️ ${nombre}: ya estaba ${item.estado}; no se puede cancelar.`);
  item.estado = 'descartado'; await quitarBotones(item); await avisar(`🗑 ${nombre} cancelado. No se publicó nada.`);
}
async function procesarMensaje(m, estado) {
  if (String(m.chat?.id) !== String(env.TG_CHAT_ID) || !m.text) return;
  const [orden, arg] = m.text.trim().toLowerCase().split(/\s+/), conf = estado.config;
  if (orden === '/pausa') { conf.pausado = true; let n = 0; for (const i of abiertos(estado)) { i.estado = 'descartado'; await quitarBotones(i); n++; } await avisar(`⏸ Sistema en pausa. Cancelé ${n} publicación(es) pendiente(s). No se publicará nada hasta que escribas /reanudar.`); }
  else if (orden === '/reanudar') { conf.pausado = false; await avisar('▶️ Sistema reanudado. El próximo borrador saldrá a su hora.'); }
  else if (orden === '/modo' && ['auto', 'manual'].includes(arg)) { conf.modo = arg; await avisar(arg === 'auto' ? '🤖 Modo autónomo: se publica solo, con unos minutos para cancelar.' : '👤 Modo manual: cada publicación espera tu aprobación.'); }
  else if (orden === '/estado') {
    const l = Object.entries(estado.items).filter(([, i]) => i.fecha === chile().fecha).map(([k, i]) => `• ${i.slot ?? i.tipo}${i.prueba ? ' (prueba)' : ''}: ${i.estado}`);
    await avisar(`📊 Modo: ${conf.modo === 'auto' ? 'autónomo' : 'manual'} · ${conf.pausado ? '⏸ en pausa' : '▶️ activo'}\nHoy:\n${l.join('\n') || '• (nada todavía)'}`);
  } else if (['/start', '/ayuda', '/help'].includes(orden)) await avisar('Comandos:\n/pausa — cancela lo pendiente y detiene todo\n/reanudar — vuelve a activar\n/modo auto | manual — publicar solo o con tu aprobación\n/estado — ver cómo va el día');
}

async function tickUna() {
  const estado = leerEstado(), ahoraMs = Date.now();
  // El token de Instagram vence a los 60 días: avisa a los 45 (el token actual se generó el 2026-10-09).
  const diasToken = Math.floor((ahoraMs - new Date(estado.tokenFecha ?? '2026-10-09').getTime()) / 86400e3);
  if (diasToken >= 45 && !estado.avisoToken) { estado.avisoToken = true; await avisar(`🔑 El token de Instagram tiene ${diasToken} días y vence a los 60. Hay que renovarlo pronto (dime y lo hacemos juntos).`); }

  // 1. Botones y comandos de Telegram
  const ups = await tg('getUpdates', { offset: estado.offset, timeout: 0, allowed_updates: ['callback_query', 'message'] });
  for (const u of ups) {
    estado.offset = Math.max(estado.offset, u.update_id + 1);
    try { if (u.callback_query) await procesarBoton(u.callback_query, estado); else if (u.message) await procesarMensaje(u.message, estado); } catch (e) { console.error('Telegram:', e.message); }
  }
  // 2. Vencidos
  for (const i of abiertos(estado)) if (i.estado === 'pendiente' && new Date(i.limite).getTime() < ahoraMs) { i.estado = 'descartado'; await quitarBotones(i); await avisar(`⌛ Pasó la hora límite sin respuesta: ${i.tipo} de hoy descartado. No se publicó nada.`); }
  try { await medir(estado); } catch (e) { console.error('Medición:', e.message); }
  guardarEstado(estado); subirCambios('Estado y comandos');
  if (flags.has('--sin-publicar')) { console.log('Modo prueba (--sin-publicar): no se publica nada.'); for (const [k, i] of Object.entries(estado.items)) console.log(' ', k, '->', i.estado); return false; }

  // 3. Publicar lo aprobado (si pasó su tiempo de cancelación)
  if (!estado.config.pausado) for (const i of abiertos(estado).filter(x => x.estado === 'aprobado' && (!x.publicarDesde || new Date(x.publicarDesde).getTime() <= Date.now()))) {
    try {
      if (i.tipo === 'carrusel') await publicarCarrusel(i, estado); else if (i.tipo === 'reel') await publicarReel(i, estado); else await publicarHistorias(i, estado);
    } catch (e) { i.estado = 'error'; i.error = String(e.message).slice(0, 300); await avisar(`⚠️ Falló la publicación (${i.tipo}): ${i.error}\nNo se publicó nada a medias.`); }
    guardarEstado(estado); subirCambios(`Publicación ${i.tipo}`);
  }
  limpiar(estado); subirCambios('Limpieza');
  return abiertos(estado).length > 0;
}
async function tick() {
  const fin = Date.now() + (flags.has('--bucle') ? 10 * 60e3 : 0);        // una ejecución revisa cada minuto durante 10 min y se relanza sola
  let trabajo;
  while (true) { trabajo = await tickUna(); if (!trabajo || Date.now() >= fin) break; await dormir(60e3); }
  if (trabajo && flags.has('--bucle')) relanzarRevision();
}

const vigente = o => sigueVigente(o.id, o.ahora);
const recordar = (estado, o) => { estado.usadas[o.id] = new Date().toISOString(); estado.nombres[nombreNorm(o.nombre)] = new Date().toISOString(); };
async function publicarCarrusel(i, estado) {
  const bad = []; for (const o of i.ofertas) { const v = await vigente(o); if (!v.ok) bad.push(`${o.nombre.slice(0, 34)}: ${v.motivo}`); }   // el educativo no tiene ofertas
  if (bad.length) { i.estado = 'omitido'; return avisar(`⏭ No publiqué el carrusel porque cambiaron ofertas:\n- ${bad.join('\n- ')}`); }
  const urls = i.archivos.map(urlPublica); for (const u of urls) await esperarPublica(u);
  const hijos = []; for (const u of urls) hijos.push(await contenedor({ image_url: u, is_carousel_item: 'true' }));
  const car = await contenedor({ media_type: 'CAROUSEL', children: hijos.join(','), caption: i.texto });
  const id = await publicarContenedor(car), enlace = await enlacePublicacion(id);
  Object.assign(i, { estado: 'publicado', id, enlace }); i.ofertas.forEach(o => recordar(estado, o)); await quitarBotones(i);
  await avisar(`✅ Carrusel publicado en Instagram.\n${enlace}`);
  await espejarCarrusel(i);                                                       // réplica en el canal de Telegram (nunca interrumpe)
}
async function publicarReel(i, estado) {
  const bad = []; for (const o of i.ofertas) { const v = await vigente(o); if (!v.ok) bad.push(`${o.nombre.slice(0, 30)}: ${v.motivo}`); }
  if (bad.length) { i.estado = 'omitido'; return avisar(`⏭ No publiqué el Reel porque cambiaron ofertas:\n- ${bad.join('\n- ')}`); }
  const url = urlPublica(i.archivos[0]); await esperarPublica(url);
  const cont = await contenedor({ media_type: 'REELS', video_url: url, caption: i.texto, share_to_feed: 'true' }, 90, 5000);
  const id = await publicarContenedor(cont), enlace = await enlacePublicacion(id);
  Object.assign(i, { estado: 'publicado', id, enlace }); i.ofertas.forEach(o => recordar(estado, o)); await quitarBotones(i);
  await avisar(`✅ Reel publicado en Instagram.\n${enlace}`);
  await espejarReel(i);
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
      const id = await publicarContenedor(await contenedor({ media_type: 'STORIES', image_url: url }, 40, 4000));
      p.hecho = 'publicada'; p.id = id; if (p.oferta) recordar(estado, p.oferta);
      await espejarHistoria(p);
      guardarEstado(estado); subirCambios('Historia publicada');
    } catch (e) { p.hecho = `omitida: error (${String(e.message).slice(0, 80)})`; }
  }
  if (i.plan.every(p => p.hecho)) {
    i.estado = 'terminado'; await quitarBotones(i);
    const ok = i.plan.filter(p => p.hecho === 'publicada').length, mal = i.plan.filter(p => p.hecho !== 'publicada');
    await avisar(`${i.prueba ? '🧪 Historia de prueba' : '📊 Historias de hoy'}: ${ok} publicada(s)${mal.length ? `, ${mal.length} omitida(s):\n- ${mal.map(p => `${p.hora} ${p.hecho}`).join('\n- ')}` : '.'}`);
  }
}

function limpiar(estado) {                                                      // borra borradores de más de 4 días y estado viejo
  const corte = Date.now() - 4 * 86400e3;
  try { for (const d of readdirSync(join(datos, 'borrador'))) if (new Date(d).getTime() < corte) rmSync(join(datos, 'borrador', d), { recursive: true, force: true }); } catch {}
  for (const [k, i] of Object.entries(estado.items)) if (new Date(i.fecha).getTime() < Date.now() - 4 * 86400e3) delete estado.items[k];
  for (const [k, t] of Object.entries(estado.usadas)) if (new Date(t).getTime() < Date.now() - 3 * 86400e3) delete estado.usadas[k];
  for (const [k, t] of Object.entries(estado.nombres)) if (new Date(t).getTime() < Date.now() - 3 * 86400e3) delete estado.nombres[k];
  for (const [k, t] of Object.entries(estado.usadasH ?? {})) if (new Date(t).getTime() < Date.now() - 2 * 86400e3) delete estado.usadasH[k];
  guardarEstado(estado);
}

// ====================================================================== Reel: estilos y sonidos
const REEL_CSS = `.chip{display:inline-block;background:rgba(255,255,255,.12);border:2px solid rgba(255,255,255,.25);border-radius:40px;padding:10px 34px;transform-origin:left center}
.chip2{display:inline-block;background:#06D6A0;color:#0b2e25;border-radius:40px;padding:12px 38px}.old{position:absolute}.strike{position:absolute;left:0;top:54%;height:8px;width:0;background:#FF2E63;border-radius:4px}
.bdg{transform-origin:left center}.bdg span{display:inline-block;background:#fff;color:#FF2E63;font-size:100px;font-weight:800;border-radius:36px;padding:6px 48px;box-shadow:0 14px 0 rgba(255,46,99,.55)}
.ring{position:absolute;left:250px;top:1320px;width:420px;height:420px;margin:-210px 0 0 -210px;border:14px solid #FF8A00;border-radius:50%;opacity:0}.fl{position:absolute;left:0;top:0;font-size:90px;opacity:0}
.pic{background:#fff;border-radius:36px;display:flex;align-items:center;justify-content:center;overflow:hidden;white-space:normal}.pic img{max-width:100%;max-height:100%;object-fit:contain}`;
function eventosReel(S, d) {
  const ev = [{ t: 0.05, k: 'thump' }, { t: 0.45, k: 'pop', f: 700 }, { t: 0.65, k: 'pop', f: 900 }, { t: 1.15, k: 'ding', f: 1175 }];
  d.ofertas.forEach((o, i) => { const s = S[i + 1]; ev.push({ t: s - 0.05, k: 'whoosh' }, { t: s + 0.4, k: 'pop', f: 600 }, { t: s + 1.25, k: 'pop', f: 500 }, { t: s + 1.55, k: 'chirp' }, { t: s + 2.15, k: 'thump' }, { t: s + 2.2, k: 'ding', f: 1568 }); });
  const so = S[S.length - 1]; ev.push({ t: so - 0.05, k: 'whoosh' }, { t: so + 0.25, k: 'pop', f: 700 }, { t: so + 0.45, k: 'pop', f: 900 }, { t: so + 0.95, k: 'ding', f: 1568 });
  return ev;
}

// ====================================================================== RÁFAGA (alto volumen: se genera y se publica directo, sin borradores en Telegram)
// El día se divide en 4 bloques con su propia meta y su propio tema. Cada ejecución (cada 15 min) publica lo que va atrasado respecto al ritmo del bloque.
// Variedad: rota rubros y formatos, cada oferta sale una sola vez al día en carruseles/Reels (y una vez cada 12 h en historias), y se revalida el precio justo antes.
const BLOQUES = [
  { ini: 8, fin: 11, reel: 7, carrusel: 5, historia: 12, tema: 'nuevas' },
  { ini: 11, fin: 15, reel: 8, carrusel: 5, historia: 13, tema: 'comparativas' },
  { ini: 15, fin: 19, reel: 8, carrusel: 5, historia: 13, tema: 'populares' },
  { ini: 19, fin: 23, reel: 7, carrusel: 5, historia: 12, tema: 'recopilaciones' },
];
const TOPE_API = 96, POR_EJECUCION = { carrusel: 2, reel: 2, historia: 4 };       // el límite de Instagram es 100 publicaciones por 24 h
const bloqueDe = min => BLOQUES.find(b => min >= b.ini * 60 && min < b.fin * 60) ?? (min >= 23 * 60 ? BLOQUES[3] : null);
const previos = (b, clave) => BLOQUES.slice(0, BLOQUES.indexOf(b)).reduce((t, x) => t + x[clave], 0);
const debeHaber = (clave, min, desfase = 0) => BLOQUES.reduce((t, b) => {          // cuántas debería haber publicadas a esta hora (acumulado de los bloques)
  if (min >= b.fin * 60) return t + b[clave]; if (min < b.ini * 60) return t;
  const paso = (b.fin - b.ini) * 60 / b[clave]; return t + Math.min(b[clave], Math.floor((min - b.ini * 60 - desfase * paso) / paso) + 1);
}, 0);
// «Nuevas» = vistas por primera vez hace poco. «Populares» = ofertas que el canal principal de Telegram publicó esta semana (no hay datos de clics); no es una medida de viralidad.
const BON = {
  nuevo: o => (Date.now() - new Date(o.first_seen_at).getTime() < 48 * 3600e3 ? 40 : 0),
  pct: o => (o.pct >= 55 ? 25 : o.pct >= 48 ? 12 : 0),
  popular: o => (o.en_canal ? 35 : 0) + (o.brand ? 8 : 0),
};
const ESPEC = {
  nuevas: {
    carrusel: [{ m: 'oferta', rubro: 'tecnologia', bonus: 'nuevo', etq: 'OFERTA NUEVA' }, { m: 'top5', titulo: 'Ofertas nuevas de hoy', bonus: 'nuevo' }, { m: 'oferta', bonus: 'nuevo', etq: 'OFERTA NUEVA' }, { m: 'top5', rubro: 'tecnologia', titulo: 'Top 5 en tecnología', bonus: 'nuevo' }, { m: 'oferta', rubro: 'hogar', bonus: 'nuevo', etq: 'NOVEDAD' }],
    reel: [{ rubro: 'tecnologia', bonus: 'nuevo', sufijo: 'DE TECNOLOGÍA', etq: 'de tecnología' }, { bonus: 'nuevo', sufijo: 'NUEVAS', etq: 'nuevas de hoy' }, { rubro: 'hogar', bonus: 'nuevo', sufijo: 'DE HOGAR', etq: 'de hogar' }, { bonus: 'nuevo', sufijo: 'RECIÉN LLEGADAS', etq: 'recién llegadas' }],
    historia: { etq: ['OFERTA NUEVA', 'NOVEDAD', 'OFERTA DE INTERÉS'], bonus: 'nuevo', rubros: ['tecnologia', null, 'tecnologia', 'hogar'], resumen: 'OFERTAS NUEVAS' },
  },
  comparativas: {
    carrusel: [{ m: 'comp', rubro: 'tecnologia' }, { m: 'top5', titulo: 'Descuentos destacados', bonus: 'pct' }, { m: 'minimos', titulo: 'Recomendados: en su precio más bajo' }, { m: 'comp', rubro: 'hogar' }, { m: 'oferta', bonus: 'pct', etq: 'DESCUENTO DESTACADO' }],
    reel: [{ rubro: 'tecnologia', bonus: 'pct', sufijo: 'EN COMPARATIVA', etq: 'en comparativa: mismo tipo de producto' }, { bonus: 'pct', sufijo: 'CON MÁS DESCUENTO', etq: 'con los descuentos más altos' }, { minimos: true }, { rubro: 'perfumes', bonus: 'pct', sufijo: 'EN COMPARATIVA', etq: 'de perfumes en comparativa' }],
    historia: { etq: ['DESCUENTO DESTACADO', 'RECOMENDADO', 'COMPARA PRECIOS'], bonus: 'pct', rubros: ['tecnologia', 'perfumes', 'hogar', 'gamer'], resumen: 'COMPARATIVA RÁPIDA' },
  },
  populares: {
    carrusel: [{ m: 'top5', titulo: 'Los más populares', bonus: 'popular' }, { m: 'oferta', bonus: 'popular', etq: 'PRODUCTO POPULAR' }, { m: 'top5', titulo: 'Lista de ofertas del momento', bonus: 'pct' }, { m: 'oferta', bonus: 'nuevo', etq: 'NOVEDAD' }, { m: 'top5', titulo: 'Novedades en ofertas', bonus: 'nuevo' }],
    reel: [{ bonus: 'popular', sufijo: 'MÁS POPULARES', etq: 'de las más populares' }, { rubro: 'gamer', bonus: 'popular', sufijo: 'GAMER POPULARES', etq: 'gamer populares' }, { bonus: 'nuevo', sufijo: 'NOVEDADES', etq: 'novedades' }, { rubro: 'perfumes', bonus: 'popular', sufijo: 'DE PERFUMES', etq: 'de perfumes' }],
    historia: { etq: ['LO MÁS POPULAR', 'NOVEDAD', 'OFERTA DEL MOMENTO'], bonus: 'popular', rubros: [null, 'gamer', 'perfumes', 'tecnologia'], resumen: 'LISTA DE OFERTAS' },
  },
  recopilaciones: {
    carrusel: [{ m: 'top5', titulo: 'Recopilación del día', bonus: 'pct' }, { m: 'top5', titulo: 'Mejores ofertas del día', bonus: 'pct' }, { m: 'oferta', bonus: 'popular', etq: 'PRODUCTO POPULAR' }, { m: 'minimos', titulo: 'Mejores precios del día' }, { m: 'top5', titulo: 'Los productos más populares', bonus: 'popular' }],
    reel: [{ bonus: 'pct', sufijo: 'LAS MEJORES DEL DÍA', etq: 'las mejores del día' }, { bonus: 'popular', sufijo: 'POPULARES', etq: 'populares' }, { minimos: true }, { rubro: 'tecnologia', bonus: 'pct', sufijo: 'DE TECNOLOGÍA', etq: 'de tecnología' }],
    historia: { etq: ['MEJOR OFERTA DEL DÍA', 'PRODUCTO POPULAR', 'RECOPILACIÓN'], bonus: 'pct', rubros: [null, 'hogar', 'belleza', 'perfumes'], resumen: 'RECOPILACIÓN DEL DÍA' },
  },
};
const publicadosHoy = (estado, fecha) => {
  const n = { carrusel: 0, reel: 0, historia: 0 };
  for (const i of Object.values(estado.items)) {
    if (i.fecha !== fecha || i.prueba) continue;
    if (i.tipo === 'historias') n.historia += (i.plan ?? []).filter(p => p.hecho === 'publicada').length;
    else if (i.estado === 'publicado' && n[i.tipo] !== undefined) n[i.tipo]++;
  }
  return n;
};
async function cuotaApi() { try { return (await ig(`${env.IG_USER_ID}/content_publishing_limit`, { fields: 'quota_usage' }, 'GET')).data?.[0]?.quota_usage ?? 0; } catch { return 0; } }

async function rafaga() {
  process.on('unhandledRejection', e => console.error('Rechazo no controlado (se sigue):', String(e?.message ?? e).slice(0, 160)));   // p. ej. un fallo de ffmpeg no debe tumbar toda la ejecución
  const c = chile(), estado = leerEstado(), cfg = estado.config.rafaga;
  if (process.env.PRUEBA_MIN) c.min = +process.env.PRUEBA_MIN;                // solo para pruebas locales
  if (!cfg?.activo || c.fecha < (cfg.desde ?? '0000')) return console.log(`Ráfaga: no está activa todavía (${cfg ? 'empieza ' + cfg.desde : 'sin configurar'}).`);
  if (estado.config.pausado) return console.log('Ráfaga: sistema en pausa.');
  const blq = bloqueDe(c.min); if (!blq) return console.log('Ráfaga: fuera de la jornada (08:00–23:00).');
  const hechos = publicadosHoy(estado, c.fecha), espec = ESPEC[blq.tema];
  const falta = { carrusel: Math.max(0, debeHaber('carrusel', c.min) - hechos.carrusel), reel: Math.max(0, debeHaber('reel', c.min, 0.5) - hechos.reel), historia: Math.max(0, debeHaber('historia', c.min) - hechos.historia) };
  console.log(`Ráfaga ${c.fecha} ${c.hhmm} (bloque ${blq.tema}): publicado ${JSON.stringify(hechos)} · atrasado ${JSON.stringify(falta)}`);
  if (!falta.carrusel && !falta.reel && !falta.historia) return;
  let cuota = await cuotaApi(); console.log(`Cuota de Instagram usada (24 h): ${cuota}/100`);
  const cands = await candidatas({ edadMin: 180, porRubro: 80 });
  const ahora = Date.now(), reciente = (t, h) => ahora - new Date(t).getTime() < h * 3600e3;
  estado.usadasH ??= {};
  const usadoFeed = id => estado.usadas[id] && reciente(estado.usadas[id], 24), usadoHist = id => estado.usadasH[id] && reciente(estado.usadasH[id], 12);
  const nombresRec = Object.entries(estado.nombres).filter(([, t]) => reciente(t, 20)).map(([k]) => k);
  const poolFeed = () => cands.filter(o => !usadoFeed(o.id)), poolHist = () => cands.filter(o => !usadoHist(o.id));
  const carpeta = join(raiz, 'tmp-medios'); mkdirSync(carpeta, { recursive: true });
  const rel = f => 'tmp-medios/' + f, abs = f => join(carpeta, f), stamp = () => `${Date.now()}`;
  const marcarFeed = o => { estado.usadas[o.id] = new Date().toISOString(); estado.nombres[nombreNorm(o.nombre)] = new Date().toISOString(); };
  const marcarHist = o => { estado.usadasH[o.id] = new Date().toISOString(); };
  const hacia = (n, o = {}) => elegirConImagen(poolFeed(), n, { traerImagen, nombresUsados: nombresRec, ...o, bonus: o.bonus ? BON[o.bonus] : null });
  const hay = (r, n = 3) => !r || poolFeed().filter(o => o.rubro === r).length >= n;
  let errores = 0;
  const guardar = (key, item, msg) => { estado.items[key] = item; guardarEstado(estado); subirCambios(msg); };
  const parar = () => cuota >= TOPE_API;
  const publicando = async (tipo, fn) => {
    if (parar()) { console.log(`Cuota alta (${cuota}): se detiene ${tipo}.`); return false; }
    try { const ok = await fn(); if (ok) cuota++; return ok; }
    catch (e) { errores++; console.error(`Ráfaga ${tipo}:`, String(e.message).slice(0, 200)); return false; }
  };
  const vigentes = async os => { for (const o of os) { const v = await vigente(o); if (!v.ok) return `${o.nombre.slice(0, 30)}: ${v.motivo}`; } return null; };

  // ---- Carrusel
  const carrusel = async k => {
    const j = Math.max(0, k - previos(blq, 'carrusel')), sp = espec.carrusel[j % espec.carrusel.length];
    let jpgs, texto, elegidas = [], formato = sp.m;
    const rubro = hay(sp.rubro, sp.m === 'comp' ? 3 : 1) ? sp.rubro : null;
    if (sp.m === 'top5' || sp.m === 'minimos') {
      let os = await hacia(5, { permitirLibros: false, maxPorRubro: rubro || sp.m === 'minimos' ? 5 : 1, maxPorTienda: 2, soloMinimos: sp.m === 'minimos', bonus: sp.bonus, ...(rubro ? { rubro } : {}) });
      let titulo = sp.titulo ?? (rubro ? `Top 5 en ${TEMA[rubro]}` : 'Top 5 ofertas de hoy'), rr = rubro;
      if (os.length < 4 && rubro) { os = await hacia(5, { permitirLibros: false, maxPorRubro: 1, maxPorTienda: 2, bonus: sp.bonus }); rr = null; }
      if (os.length >= (sp.m === 'minimos' ? 3 : 4)) {
        const sub = sp.m === 'minimos' ? 'Precios en su punto más bajo registrado' : 'Con precio visto hoy';
        jpgs = await renderizar([htmlTopPortada(titulo, sub, 1, 3), htmlTopLista(titulo, os, 2, 3), htmlTopCierre(3, 3)], 1080, 1350); texto = textoTop(titulo, os, rr); elegidas = os;
      }
    } else if (sp.m === 'comp') {
      const r = rubro ?? 'tecnologia'; const os = await hacia(3, { permitirLibros: false, maxPorRubro: 3, maxPorTienda: 2, rubro: r, bonus: 'pct' });
      if (os.length === 3) { const titulo = `Comparativa: 3 opciones en ${TEMA[r]}`; jpgs = await renderizar([htmlTopPortada(titulo, 'Mismo tipo de producto, precios lado a lado', 1, 3), htmlTopLista(titulo, os, 2, 3), htmlTopCierre(3, 3)], 1080, 1350); texto = textoTop(titulo, os, r); elegidas = os; }
    }
    if (!jpgs) {                                                                    // oferta suelta (o recurso si el formato pedido no alcanza)
      formato = 'oferta';
      let [o] = await hacia(1, { permitirLibros: false, bonus: sp.bonus, ...(rubro ? { rubro } : {}) }); if (!o) [o] = await hacia(1, { permitirLibros: false, bonus: sp.bonus }); if (!o) [o] = await hacia(1);
      if (!o) { console.log('Carrusel: no queda una oferta fresca y distinta.'); return false; }
      jpgs = await renderizar([htmlCarrusel1(o), htmlCarrusel2(o)], 1080, 1350); texto = textoCarrusel(o, sp.etq ?? 'OFERTA DEL DÍA'); elegidas = [o];
    }
    const mal = await vigentes(elegidas); if (mal) { console.log(`Carrusel omitido: ${mal}`); elegidas.forEach(marcarFeed); guardarEstado(estado); return false; }
    if (process.env.SECO) { console.log(`SECO carrusel [${blq.tema}/${formato}] ${jpgs.length} láminas:`, elegidas.map(o => o.rubro + ':' + o.nombre.slice(0, 22)).join(' | '), '→', texto.slice(0, 40)); return false; }
    const base = `${stamp()}-c${k}`, nombres = jpgs.map((b, i) => { const f = `${base}-${i + 1}.jpg`; writeFileSync(abs(f), b); return f; });
    const urls = subirMedios(nombres.map(abs)); for (const u of urls) await esperarPublica(u);
    const hijos = []; for (const u of urls) hijos.push(await contenedor({ image_url: u, is_carousel_item: 'true' }));
    const id = await publicarContenedor(await contenedor({ media_type: 'CAROUSEL', children: hijos.join(','), caption: texto })), enlace = await enlacePublicacion(id);
    elegidas.forEach(marcarFeed);
    const item = { tipo: 'carrusel', fecha: c.fecha, estado: 'publicado', bloque: blq.tema, formato, hora: chile().hhmm, id, enlace, ofertas: elegidas.map(resumenOferta), archivos: nombres.map(rel), texto };
    guardar(`${c.fecha}-r-carrusel-${stamp()}`, item, 'Carrusel publicado'); console.log('Carrusel publicado:', blq.tema, formato, enlace);
    await espejarCarrusel(item); return true;
  };

  // ---- Reel
  const reel = async k => {
    const j = Math.max(0, k - previos(blq, 'reel')), sp = espec.reel[j % espec.reel.length];
    let os = [], minimos = !!sp.minimos, tema = null;
    if (minimos) { os = await hacia(3, { permitirLibros: false, soloMinimos: true }); minimos = os.length === 3; }
    if (!minimos && sp.rubro && hay(sp.rubro)) { os = await hacia(3, { permitirLibros: false, rubro: sp.rubro, bonus: sp.bonus }); tema = os.length === 3 ? sp.rubro : null; }
    if (!minimos && !tema) os = await hacia(3, { permitirLibros: false, bonus: sp.bonus });
    if (os.length < 3) { console.log(`Reel: solo hay ${os.length} ofertas frescas y distintas.`); return false; }
    const mal = await vigentes(os); if (mal) { console.log(`Reel omitido: ${mal}`); os.forEach(marcarFeed); guardarEstado(estado); return false; }
    const sufijo = minimos ? 'EN SU MÍNIMO' : tema && !sp.sufijo ? 'DE ' + TEMA[tema].toUpperCase() : sp.sufijo ?? 'DE HOY';
    const corto = (s, n = 50) => (s.length <= n ? s : s.slice(0, s.lastIndexOf(' ', n)) + '…');
    const data = { hoy: c.fecha, sufijo, ofertas: os.map(o => ({ nombre: corto(o.nombre), tienda: o.tienda, ahora: o.ahora, antes: o.antes, pct: o.pct, antesOk: true, img: o.img })) };
    if (process.env.SECO) { console.log(`SECO reel [${blq.tema}] sufijo=${sufijo}:`, os.map(o => o.rubro + ':' + o.nombre.slice(0, 22)).join(' | ')); return false; }
    const f = `${stamp()}-r${k}.mp4`;
    await renderizarReel({ css: REEL_CSS, pagina: readFileSync(join(raiz, 'tools', 'reel-pagina.js'), 'utf8'), data, eventos: eventosReel, salida: abs(f) });
    const [url] = subirMedios([abs(f)]); await esperarPublica(url);
    const texto = textoReel(os, tema, minimos, minimos ? null : sp.etq ?? null);
    const id = await publicarContenedor(await contenedor({ media_type: 'REELS', video_url: url, caption: texto, share_to_feed: 'true' }, 90, 5000)), enlace = await enlacePublicacion(id);
    os.forEach(marcarFeed);
    const item = { tipo: 'reel', fecha: c.fecha, estado: 'publicado', bloque: blq.tema, hora: chile().hhmm, id, enlace, ofertas: os.map(resumenOferta), archivos: [rel(f)], texto };
    guardar(`${c.fecha}-r-reel-${stamp()}`, item, 'Reel publicado'); console.log('Reel publicado:', blq.tema, enlace);
    await espejarReel(item); return true;
  };

  // ---- Historia
  const historia = async k => {
    const j = Math.max(0, k - previos(blq, 'historia')), sp = espec.historia, resumen = j % 6 === 5, bonus = BON[sp.bonus];
    const rubro = sp.rubros[j % sp.rubros.length];
    const elegirH = (n, o = {}) => elegirConImagen(poolHist(), n, { traerImagen, permitirLibros: false, maxPorRubro: n === 1 ? 1 : 2, bonus, ...o });
    let os = resumen ? await elegirH(4, rubro ? { rubro, maxPorRubro: 4 } : {}) : await elegirH(1, rubro ? { rubro } : {});
    if (resumen && os.length < 3) os = await elegirH(4); if (!resumen && !os.length) os = await elegirH(1);
    if (!os.length || (resumen && os.length < 3)) { console.log('Historia: no queda una oferta fresca.'); return false; }
    const mal = await vigentes(os); if (mal) { os.forEach(marcarHist); guardarEstado(estado); console.log(`Historia omitida: ${mal}`); return false; }
    const etiqueta = sp.etq[j % sp.etq.length];
    const [jpg] = await renderizar([resumen ? htmlHistoriaResumen(os, sp.resumen) : htmlHistoria(etiqueta, os[0])], 1080, 1920);
    if (process.env.SECO) { console.log(`SECO historia [${blq.tema}] ${resumen ? 'RESUMEN ' + sp.resumen : etiqueta}:`, os.map(o => o.rubro + ':' + o.nombre.slice(0, 22) + (o.en_canal ? '*' : '')).join(' | ')); return false; }
    const f = `${stamp()}-h${k}.jpg`; writeFileSync(abs(f), jpg);
    const [url] = subirMedios([abs(f)]); await esperarPublica(url);
    const id = await publicarContenedor(await contenedor({ media_type: 'STORIES', image_url: url }, 40, 4000));
    os.forEach(marcarHist);
    guardar(`${c.fecha}-r-historia-${stamp()}`, { tipo: 'historia', fecha: c.fecha, estado: 'publicado', bloque: blq.tema, hora: chile().hhmm, id, ofertas: os.map(resumenOferta) }, 'Historia publicada'); console.log('Historia publicada:', blq.tema, os.map(o => o.nombre.slice(0, 30)).join(' | '));
    await espejarHistoria({ archivo: rel(f), oferta: resumen ? null : resumenOferta(os[0]), etiqueta: resumen ? sp.resumen : etiqueta }); return true;
  };

  // Se intercalan los formatos para que ninguno espere detrás de otro
  const n = { carrusel: Math.min(falta.carrusel, POR_EJECUCION.carrusel), reel: Math.min(falta.reel, POR_EJECUCION.reel), historia: Math.min(falta.historia, POR_EJECUCION.historia) };
  const contador = { ...hechos };
  while (n.carrusel + n.reel + n.historia > 0 && !parar() && errores < 3) {
    if (n.historia > 0) { n.historia--; if (await publicando('historia', () => historia(contador.historia))) contador.historia++; else n.historia = 0; }
    if (n.carrusel > 0) { n.carrusel--; if (await publicando('carrusel', () => carrusel(contador.carrusel))) contador.carrusel++; else n.carrusel = 0; }
    if (n.reel > 0) { n.reel--; if (await publicando('reel', () => reel(contador.reel))) contador.reel++; else n.reel = 0; }
  }
  try { for (const f of readdirSync(carpeta)) if (Date.now() - statSync(join(carpeta, f)).mtimeMs > 20 * 60e3) rmSync(join(carpeta, f), { force: true }); } catch {}   // limpia solo lo viejo (otra ejecución podría estar usando lo reciente)
  if (errores >= 3) await avisar('⚠️ La ráfaga tuvo 3 errores en esta ejecución. Revisa los registros de GitHub Actions.');
  guardarEstado(estado); subirCambios('Ráfaga: estado');
}

// ====================================================================== Entrada
try {
  if (cmd === 'preparar') {
    const slots = tipoArg === 'prueba-historia' ? ['prueba-historia'] : tipoArg ? [PLAN.find(s => s.id === tipoArg) ?? PLAN.find(s => s.tipo === tipoArg)].filter(Boolean) : PLAN;
    for (const s of slots) { const nombre = s.id ?? s; try { if (s === 'prueba-historia') await pruebaHistoria(); else await preparar(s); } catch (e) { console.error(`${nombre}:`, e.message); if (!simulacro) await avisar(`⚠️ No pude preparar ${nombre}: ${String(e.message).slice(0, 200)}`).catch(() => {}); } }
    if (!simulacro) { subirCambios('Borradores'); relanzarRevision(); }
  } else if (cmd === 'rafaga') await rafaga();
  else if (cmd === 'tick') await tick();
  else if (cmd === 'medir') { const e = leerEstado(); await medir(e, { forzar: true }); guardarEstado(e); subirCambios('Informe de medición'); }
  else console.log('Uso: node tools/nube.mjs preparar [historias|carrusel|reel|prueba-historia] [--forzar] [--simulacro] | tick [--bucle] [--sin-publicar]');
} catch (e) { console.error(e); process.exit(1); }
