// Plantillas gráficas: carrusel (1080x1350) e historias (1080x1920). Se dibujan con Chrome y salen en JPEG (lo único que acepta la API).
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';
import { env, fmt, esc, chile } from './lib.mjs';

export const CHROME = env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const FUENTE = '<meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&display=swap" rel="stylesheet">';
const COMUN = `*{box-sizing:border-box;margin:0}html,body{overflow:hidden;font-family:Poppins,"Segoe UI","Noto Color Emoji",Arial,sans-serif;color:#fff}
.grad{background:linear-gradient(160deg,#FF8A00,#FF2E63)}.dark{background:#14141F}.light{background:#FAF8F7;color:#1B1B2F}
.acc{background:linear-gradient(135deg,#FF8A00,#FF2E63);-webkit-background-clip:text;color:transparent}
.chip{display:inline-block;background:rgba(255,255,255,.14);border:2px solid rgba(255,255,255,.28);border-radius:40px;padding:10px 34px;font-weight:600}
.ok{display:inline-block;background:#06D6A0;color:#0b2e25;border-radius:40px;padding:10px 34px;font-weight:700}
.min{display:inline-block;background:#FFD166;color:#3a2a00;border-radius:40px;padding:10px 34px;font-weight:700}`;

export async function renderizar(htmls, ancho, alto) {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  try {
    const page = await browser.newPage(); await page.setViewport({ width: ancho, height: alto, deviceScaleFactor: 1 });
    const out = [];
    for (const h of htmls) {
      await page.setContent(h, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
      await page.evaluate(() => document.fonts.ready);
      out.push(await sharp(await page.screenshot({ type: 'png' })).flatten({ background: '#14141F' }).jpeg({ quality: 92, mozjpeg: true }).toBuffer());
    }
    return out;
  } finally { await browser.close(); }
}

export const horaVisto = o => chile(new Date(o.last_seen_at)).hhmm;
const chips = o => `<span class="ok">VISTO A LAS ${horaVisto(o)} ✔</span>${o.esMinimo ? ` <span class="min">MÍNIMO DE ${o.dias} DÍAS</span>` : ''}`;

// ---------- Historias (1080x1920; zonas seguras: sin texto clave en los 270 px de arriba ni en los 400 de abajo) ----------
const CSS_H = `${COMUN}html,body{width:1080px;height:1920px}body{padding:270px 90px 400px;display:flex;flex-direction:column;justify-content:center}
.tag{font-size:42px;font-weight:700;letter-spacing:6px}.chip{font-size:46px}.ok,.min{font-size:36px}.pie{margin-top:40px;font-size:40px;font-weight:600;opacity:.92}`;
export const htmlHistoria = (etiqueta, o) => `${FUENTE}<style>${CSS_H}</style><body class="dark"><div class="tag acc">${etiqueta}</div>
  <div style="font-size:74px;font-weight:800;line-height:1.1;letter-spacing:-2px;margin-top:30px">${esc(o.nombre)}</div>
  <div style="margin-top:24px"><span class="chip">${esc(o.tienda)}</span></div>
  <div style="margin-top:44px"><div style="font-size:52px;text-decoration:line-through;opacity:.6">${fmt(o.antes)}</div>
  <div class="acc" style="font-size:185px;font-weight:800;letter-spacing:-7px;line-height:1.1">${fmt(o.ahora)}</div>
  <div style="display:inline-block;background:#fff;color:#FF2E63;font-size:70px;font-weight:800;border-radius:28px;padding:4px 38px;margin-top:14px">-${o.pct}%</div></div>
  <div style="margin-top:34px;line-height:2.1">${chips(o)}</div>
  <div class="pie">Enlace directo en Telegram: t.me/ofertixcl</div></body>`;
export const htmlHistoriaResumen = ofertas => `${FUENTE}<style>${CSS_H}</style><body class="grad"><div class="tag">RESUMEN DEL DÍA</div>
  <div style="font-size:100px;font-weight:800;line-height:1.05;letter-spacing:-3px;margin-top:30px">Las ofertas de hoy</div>
  <div style="margin-top:44px;font-size:42px;font-weight:600;line-height:1.35">${ofertas.map(o => `• ${esc(o.nombre.length > 44 ? o.nombre.slice(0, 42) + '…' : o.nombre)}`).join('<br>')}</div>
  <div style="margin-top:44px;font-size:42px;font-weight:500;opacity:.95">Precios actualizados y enlaces directos en Telegram.</div>
  <div class="pie" style="font-size:56px;font-weight:800;opacity:1;margin-top:30px">t.me/ofertixcl</div></body>`;

// ---------- Carrusel (1080x1350) ----------
const CSS_C = `${COMUN}html,body{width:1080px;height:1350px}body{display:flex;flex-direction:column;justify-content:center;padding:100px 90px;position:relative}
.foot{position:absolute;left:90px;bottom:60px;font-weight:700;font-size:30px;opacity:.85}.pg{position:absolute;right:90px;bottom:60px;font-weight:500;font-size:28px;opacity:.7}.eyebrow{font-size:34px;font-weight:700;letter-spacing:4px;text-transform:uppercase}
.big{font-size:104px;font-weight:800;line-height:1.08;letter-spacing:-3px}.sub{font-size:44px;font-weight:500;line-height:1.4;margin-top:50px;opacity:.9}.ok,.min{font-size:30px}`;
export const htmlCarrusel1 = o => {
  const hoy = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' });
  return `${FUENTE}<style>${CSS_C}</style><body class="grad"><div class="eyebrow">Oferta del día · ${hoy}</div>
  <div style="font-size:78px;font-weight:800;line-height:1.1;letter-spacing:-2px;margin-top:34px">${esc(o.nombre)}</div>
  <div style="font-size:38px;font-weight:500;margin-top:24px;opacity:.9">${esc(o.tienda)}</div>
  <div style="margin-top:48px"><div style="font-size:48px;text-decoration:line-through;opacity:.75">${fmt(o.antes)}</div>
  <div style="font-size:160px;font-weight:800;letter-spacing:-5px;line-height:1.05">${fmt(o.ahora)}</div>
  <div style="display:inline-block;background:#fff;color:#FF2E63;font-size:54px;font-weight:800;border-radius:24px;padding:8px 30px;margin-top:16px">-${o.pct}%</div></div>
  <div style="margin-top:34px;line-height:2.1">${chips(o)}</div>
  <div class="foot">@ofertixcl.oficial</div><div class="pg">1/2</div></body>`;
};
export const htmlCarrusel2 = o => `${FUENTE}<style>${CSS_C}</style><body class="dark"><div class="eyebrow acc">Cómo conseguirla</div>
  <div class="big" style="margin-top:40px">El enlace directo está en Telegram.</div>
  <div class="sub">Entra a <span class="acc" style="font-weight:700">t.me/ofertixcl</span> y busca la oferta de ${esc(o.tienda)}.</div>
  <div class="sub" style="font-size:34px;opacity:.7">Los precios pueden cambiar o agotarse sin aviso.</div>
  <div class="foot">@ofertixcl.oficial</div><div class="pg">2/2</div></body>`;
