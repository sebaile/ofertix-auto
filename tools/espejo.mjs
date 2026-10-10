// Espejo en Telegram: todo lo que se publica automáticamente en Instagram se replica en un canal público de Telegram.
// Instagram no deja poner enlaces en las publicaciones; aquí cada oferta lleva su enlace directo (que además mide los clics).
// Un fallo del espejo NUNCA afecta a la publicación en Instagram: todo va envuelto y solo deja un aviso en el registro.
//
// Variable: TG_CANAL_IG = id numérico (-100…) o @usuario del canal. Sin ella el espejo está apagado.
// El bot de este flujo (TG_BOT_TOKEN) debe ser administrador del canal, con permiso de publicar.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { env, raiz, tg, esc, fmt } from './lib.mjs';

const h = s => esc(s).replace(/>/g, '&gt;');          // HTML de Telegram: también hay que escapar «>»

const GO = env.GO_BASE || 'https://ofertix-api.vercel.app';
export const enlaceOferta = id => `${GO}/go/${id}?utm_source=telegram&utm_medium=instagram&utm_campaign=espejo`;

/** Texto de Instagram adaptado a Telegram: sin hashtags ni frases que solo valen en Instagram, y con un largo que cabe en el pie de foto. */
export function textoEspejo(texto = '', max = 700) {
  const lineas = String(texto).split('\n')
    .filter(l => !/^\s*#/.test(l))                                     // la línea de hashtags
    .filter(l => !/enlaces? directos? en telegram|link en (la )?bio/i.test(l));   // llamados que no tienen sentido dentro de Telegram
  let t = lineas.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length > max) t = t.slice(0, t.lastIndexOf('\n', max) > 200 ? t.lastIndexOf('\n', max) : max).trim() + '…';
  return t;
}

/** «🛒 Ofertas de esta publicación» con un enlace por oferta. Vacío si la publicación no trae ofertas (p. ej. las educativas). */
export function listaEnlaces(ofertas = []) {
  const l = (ofertas ?? []).filter(o => o?.id).map(o =>
    `• <a href="${enlaceOferta(o.id)}">${h(String(o.nombre).slice(0, 70))}</a> · ${fmt(Number(o.ahora))} (-${o.pct}%) · ${h(o.tienda ?? '')}`);
  return l.length ? `🛒 <b>Ofertas de esta publicación</b>\n${l.join('\n')}` : '';
}

const archivo = ruta => { const p = join(raiz, ruta); return existsSync(p) ? readFileSync(p) : null; };
const aviso = (que, e) => console.warn(`Espejo en Telegram (${que}): ${e?.message ?? e}`);
const activo = () => !!(env.TG_CANAL_IG && env.TG_BOT_TOKEN);

async function mensajeEnlaces(i) {
  const l = listaEnlaces(i.ofertas); if (!l) return;
  await tg('sendMessage', { chat_id: env.TG_CANAL_IG, text: l, parse_mode: 'HTML', disable_web_page_preview: true });
}

export async function espejarCarrusel(i) {
  if (!activo()) return;
  try {
    const bufs = (i.archivos ?? []).map(archivo).filter(Boolean); if (!bufs.length) return;
    const f = new FormData(); f.append('chat_id', env.TG_CANAL_IG);
    f.append('media', JSON.stringify(bufs.map((_, k) => ({ type: 'photo', media: `attach://f${k}`, ...(k === 0 ? { caption: h(textoEspejo(i.texto)), parse_mode: 'HTML' } : {}) }))));
    bufs.forEach((b, k) => f.append(`f${k}`, new Blob([b], { type: 'image/jpeg' }), `lamina${k + 1}.jpg`));
    await tg('sendMediaGroup', f);
    await mensajeEnlaces(i);
  } catch (e) { aviso('carrusel', e); }
}

export async function espejarReel(i) {
  if (!activo()) return;
  try {
    const v = archivo(i.archivos?.[0]); if (!v) return;
    const f = new FormData(); f.append('chat_id', env.TG_CANAL_IG); f.append('caption', h(textoEspejo(i.texto))); f.append('parse_mode', 'HTML');
    f.append('supports_streaming', 'true'); f.append('video', new Blob([v], { type: 'video/mp4' }), 'reel.mp4');
    await tg('sendVideo', f);
    await mensajeEnlaces(i);
  } catch (e) { aviso('reel', e); }
}

export async function espejarHistoria(p) {
  if (!activo()) return;
  try {
    const img = archivo(p.archivo); if (!img) return;
    const enlace = p.oferta?.id ? `\n🛒 <a href="${enlaceOferta(p.oferta.id)}">${h(String(p.oferta.nombre).slice(0, 70))}</a> · ${fmt(Number(p.oferta.ahora))} (-${p.oferta.pct}%)` : '';
    const f = new FormData(); f.append('chat_id', env.TG_CANAL_IG); f.append('parse_mode', 'HTML');
    f.append('caption', `📸 <b>Historia de Instagram</b>${p.etiqueta ? ' · ' + h(p.etiqueta) : ''}${enlace}`);
    f.append('photo', new Blob([img], { type: 'image/jpeg' }), 'historia.jpg');
    await tg('sendPhoto', f);
  } catch (e) { aviso('historia', e); }
}
