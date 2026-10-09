// Utilidades comunes: entorno, hora de Chile, Telegram, API de Instagram, estado y repositorio.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const raiz = resolve(import.meta.dirname, '..');
// Local: lee .env o tools/.env. En GitHub Actions las variables llegan como secretos.
for (const f of [join(raiz, '.env'), join(raiz, 'tools', '.env')]) {
  if (!existsSync(f)) continue;
  for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) {
    const i = l.indexOf('='); if (i < 1 || l.startsWith('#')) continue;
    const k = l.slice(0, i).trim(); if (process.env[k] === undefined) process.env[k] = l.slice(i + 1).trim();
  }
}
export const env = process.env;
export const REPO = env.GITHUB_REPOSITORY || 'sebaile/ofertix-auto';
export const TZ = 'America/Santiago';
export const dormir = ms => new Promise(r => setTimeout(r, ms));
export const fmt = n => '$' + Math.round(n).toLocaleString('es-CL');
export const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
export const bonito = s => { const t = String(s).trim().replace(/\s+/g, ' '); return t === t.toUpperCase() ? t.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()) : t; };

// ---------- Hora de Chile (independiente de la zona del servidor) ----------
export function chile(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, h: +p.hour, m: +p.minute, hhmm: `${p.hour}:${p.minute}`, min: +p.hour * 60 + +p.minute };
}
export function chileAUtc(fecha, hhmm) {                    // "2026-10-10" + "10:00" (hora de Chile) -> Date UTC exacta
  const guess = new Date(`${fecha}T${hhmm}:00Z`), c = chile(guess);
  const asUtc = Date.UTC(+c.fecha.slice(0, 4), +c.fecha.slice(5, 7) - 1, +c.fecha.slice(8, 10), c.h, c.m);
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}

// ---------- Telegram ----------
export async function tg(metodo, cuerpo) {
  const url = `https://api.telegram.org/bot${env.TG_BOT_TOKEN}/${metodo}`;
  const r = await fetch(url, { method: 'POST', ...(cuerpo instanceof FormData ? { body: cuerpo } : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo ?? {}) }) });
  const j = await r.json(); if (!j.ok) throw new Error(`Telegram ${metodo}: ${j.description}`); return j.result;
}
export const avisar = t => tg('sendMessage', { chat_id: env.TG_CHAT_ID, text: t, disable_web_page_preview: true });
export function botones(ok, no, textoOk = '✅ Aprobar y publicar') { return { inline_keyboard: [[{ text: textoOk, callback_data: ok }, { text: '🗑 Descartar', callback_data: no }]] }; }
export async function enviarFotos(buffers, nombre = 'lamina') {
  const f = new FormData(); f.append('chat_id', env.TG_CHAT_ID);
  f.append('media', JSON.stringify(buffers.map((_, i) => ({ type: 'photo', media: `attach://f${i}` }))));
  buffers.forEach((b, i) => f.append(`f${i}`, new Blob([b], { type: 'image/jpeg' }), `${nombre}${i + 1}.jpg`));
  return tg('sendMediaGroup', f);
}

// ---------- API de Instagram (Instagram API with Instagram Login) ----------
const API = 'https://graph.instagram.com/v21.0';
export async function ig(path, params = {}, method = 'POST') {
  const qs = new URLSearchParams({ ...params, access_token: env.IG_TOKEN });
  const r = await fetch(method === 'GET' ? `${API}/${path}?${qs}` : `${API}/${path}`, method === 'GET' ? {} : { method, body: qs });
  const j = await r.json(); if (!r.ok || j.error) throw new Error(`${path}: ${j.error?.message ?? r.status}`); return j;
}
export async function contenedor(params, intentos = 60, cada = 5000) {   // crea un contenedor y espera a que Instagram lo procese
  const { id } = await ig(`${env.IG_USER_ID}/media`, params);
  for (let i = 0; i < intentos; i++) {
    const { status_code, status } = await ig(id, { fields: 'status_code,status' }, 'GET');
    if (status_code === 'FINISHED') return id;
    if (status_code === 'ERROR' || status_code === 'EXPIRED') throw new Error(`Instagram rechazó el contenido: ${status ?? status_code}`);
    await dormir(cada);
  }
  throw new Error('Instagram tardó demasiado en procesar el contenido');
}
export const publicarContenedor = async id => (await ig(`${env.IG_USER_ID}/media_publish`, { creation_id: id })).id;
export async function enlacePublicacion(id) { try { return (await ig(id, { fields: 'permalink' }, 'GET')).permalink ?? ''; } catch { return ''; } }

// ---------- Archivos públicos del repositorio ----------
export const urlPublica = ruta => `https://raw.githubusercontent.com/${REPO}/main/${ruta.replace(/\\/g, '/')}`;
export async function esperarPublica(url, intentos = 25) {
  for (let i = 0; i < intentos; i++) { const r = await fetch(url, { method: 'HEAD' }); if (r.ok) return; await dormir(3000); }
  throw new Error('El archivo no quedó público: ' + url);
}

// ---------- Estado (datos/estado.json, versionado en el repositorio) ----------
export const datos = join(raiz, 'datos');
const estadoFile = join(datos, 'estado.json');
export function leerEstado() { return existsSync(estadoFile) ? JSON.parse(readFileSync(estadoFile, 'utf8')) : { offset: 0, usadas: {}, items: {} }; }
export function guardarEstado(e) { mkdirSync(datos, { recursive: true }); writeFileSync(estadoFile, JSON.stringify(e, null, 1)); }
