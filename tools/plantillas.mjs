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
const FOTO = `.foto{background:#fff;border-radius:36px;display:flex;align-items:center;justify-content:center;overflow:hidden}.foto img{max-width:100%;max-height:100%;object-fit:contain}`;
export const htmlHistoria = (etiqueta, o) => `${FUENTE}<style>${CSS_H}${FOTO}</style><body class="dark"><div class="tag acc">${etiqueta}</div>
  <div style="font-size:58px;font-weight:800;line-height:1.1;letter-spacing:-1px;margin-top:22px">${esc(o.nombre)}</div>
  <div style="margin-top:16px"><span class="chip" style="font-size:38px;padding:6px 28px">${esc(o.tienda)}</span></div>
  ${o.img ? `<div class="foto" style="width:900px;height:330px;margin-top:26px"><img src="${o.img}"></div>` : ''}
  <div style="margin-top:22px"><div style="font-size:44px;text-decoration:line-through;opacity:.6">${fmt(o.antes)}</div>
  <div class="acc" style="font-size:140px;font-weight:800;letter-spacing:-5px;line-height:1.1">${fmt(o.ahora)}</div>
  <div style="display:inline-block;background:#fff;color:#FF2E63;font-size:58px;font-weight:800;border-radius:24px;padding:2px 32px;margin-top:8px">-${o.pct}%</div></div>
  <div style="margin-top:20px;line-height:2">${chips(o)}</div>
  <div class="pie" style="margin-top:22px;font-size:36px">Enlace directo en Telegram: t.me/ofertixcl</div></body>`;
export const htmlHistoriaResumen = (ofertas, titulo = 'RESUMEN DEL DÍA') => `${FUENTE}<style>${CSS_H}</style><body class="grad"><div class="tag">${titulo}</div>
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
  return `${FUENTE}<style>${CSS_C}${FOTO}</style><body class="grad"><div class="eyebrow">Oferta del día · ${hoy}</div>
  ${o.img ? `<div class="foto" style="width:900px;height:390px;margin-top:24px"><img src="${o.img}"></div>` : ''}
  <div style="font-size:58px;font-weight:800;line-height:1.1;letter-spacing:-1px;margin-top:24px">${esc(o.nombre)}</div>
  <div style="font-size:34px;font-weight:500;margin-top:10px;opacity:.9">${esc(o.tienda)}</div>
  <div style="margin-top:20px;display:flex;align-items:flex-end;gap:30px"><div><div style="font-size:42px;text-decoration:line-through;opacity:.75">${fmt(o.antes)}</div>
  <div style="font-size:124px;font-weight:800;letter-spacing:-4px;line-height:1.05">${fmt(o.ahora)}</div></div>
  <div style="background:#fff;color:#FF2E63;font-size:54px;font-weight:800;border-radius:24px;padding:8px 28px;margin-bottom:16px">-${o.pct}%</div></div>
  <div style="margin-top:18px;line-height:2.1">${chips(o)}</div>
  <div class="foot">@ofertixcl.oficial</div><div class="pg">1/2</div></body>`;
};
export const htmlCarrusel2 = o => `${FUENTE}<style>${CSS_C}</style><body class="dark"><div class="eyebrow acc">Cómo conseguirla</div>
  <div class="big" style="margin-top:40px">El enlace directo está en Telegram.</div>
  <div class="sub">Entra a <span class="acc" style="font-weight:700">t.me/ofertixcl</span> y busca la oferta de ${esc(o.tienda)}.</div>
  <div class="sub" style="font-size:34px;opacity:.7">Los precios pueden cambiar o agotarse sin aviso.</div>
  <div class="foot">@ofertixcl.oficial</div><div class="pg">2/2</div></body>`;

// ---------- Carruseles temáticos (1080x1350): Top 5, mínimos y educativos ----------
const CSS_T = `${CSS_C}${FOTO}
body.lista{justify-content:flex-start;padding:64px 70px 110px}.fila{display:flex;align-items:center;gap:22px;padding:13px 0;border-bottom:2px solid rgba(255,255,255,.12)}
.fila .n{font-size:70px;font-weight:800;width:52px;text-align:center;flex:none}.mini{width:148px;height:148px;border-radius:24px;flex:none}.info{flex:1;min-width:0}
.nom{font-size:33px;font-weight:700;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.sub2{font-size:25px;opacity:.78;margin-top:6px}
.pre{text-align:right;flex:none}.ant{font-size:25px;text-decoration:line-through;opacity:.6}.ahora{font-size:44px;font-weight:800;letter-spacing:-1px}
.pct{display:inline-block;background:#fff;color:#FF2E63;font-weight:800;font-size:27px;border-radius:14px;padding:2px 12px;margin-top:4px}
.minchip{display:inline-block;background:#FFD166;color:#3a2a00;border-radius:20px;padding:0 12px;font-weight:700;font-size:23px;margin-left:8px}`;
export const htmlTopPortada = (titulo, subtitulo, pagina, total) => `${FUENTE}<style>${CSS_T}</style><body class="grad"><div class="eyebrow">Ofertix · precios vistos hoy</div>
  <div class="big" style="margin-top:36px">${esc(titulo)}</div><div class="sub">${esc(subtitulo)}</div>
  <div class="foot">@ofertixcl.oficial</div><div class="pg">${pagina}/${total}</div></body>`;
export const htmlTopLista = (titulo, os, pagina, total) => `${FUENTE}<style>${CSS_T}</style><body class="dark lista"><div class="eyebrow acc" style="margin-bottom:6px">${esc(titulo)}</div>
  ${os.map((o, i) => `<div class="fila"><div class="n acc">${i + 1}</div><div class="foto mini">${o.img ? `<img src="${o.img}">` : ''}</div>
    <div class="info"><div class="nom">${esc(o.nombre)}</div><div class="sub2">${esc(o.tienda)}${o.esMinimo ? `<span class="minchip">mín. ${o.dias} días</span>` : ''}</div></div>
    <div class="pre"><div class="ant">${fmt(o.antes)}</div><div class="ahora">${fmt(o.ahora)}</div><div class="pct">-${o.pct}%</div></div></div>`).join('')}
  <div class="foot">@ofertixcl.oficial</div><div class="pg">${pagina}/${total}</div></body>`;
export const htmlTopCierre = (pagina, total) => `${FUENTE}<style>${CSS_T}</style><body class="grad"><div class="eyebrow">Cómo conseguirlas</div>
  <div class="big" style="margin-top:40px">Los enlaces directos están en Telegram.</div><div class="sub">Entra a <b>t.me/ofertixcl</b> y busca cada oferta.</div>
  <div class="sub" style="font-size:34px;opacity:.8">Los precios pueden cambiar o agotarse sin aviso.</div>
  <div class="foot">@ofertixcl.oficial</div><div class="pg">${pagina}/${total}</div></body>`;

export const EDUCATIVOS = [
  { titulo: 'No todo descuento es descuento', sub: '5 trucos para saber si una oferta es real.',
    items: [['Revisa el historial de precios', 'Un precio "rebajado" puede ser el mismo de hace un mes. Mira cuánto costaba antes de comprar.'],
      ['Compara en 2 o 3 tiendas', 'La misma oferta suele estar más barata en otra tienda. Tarda 2 minutos y se nota.'],
      ['Desconfía del "solo por hoy"', 'Si la misma urgencia aparece todas las semanas, no es urgencia. Es una táctica de venta.'],
      ['Mira el precio final con envío', 'Un producto barato con despacho caro puede salir más caro que otro sin descuento.'],
      ['Lee los reclamos recientes', 'Antes de pagar, busca opiniones de los últimos meses sobre el producto y la tienda.']],
    cierre: 'Ahorrar es comparar.',
    texto: `No todo descuento es descuento 👀\n5 trucos para saber si una oferta es real:\n1. Revisa el historial de precios\n2. Compara en 2 o 3 tiendas\n3. Desconfía del "solo por hoy"\n4. Mira el precio final con envío\n5. Lee los reclamos recientes\n\nGuárdalo para tu próxima compra 📌\n📲 Más ofertas en Telegram: t.me/ofertixcl\n\n#ofertaschile #ahorrar #consejosdeahorro #comprasinteligentes #ofertix` },
  { titulo: 'Cómo leer una oferta de Ofertix', sub: '4 datos que te mostramos en cada publicación.',
    items: [['Referencia', 'Es el precio habitual con el que comparamos: la mediana de los últimos 60 días o el precio de lista de la tienda.'],
      ['Visto a las HH:MM', 'Es la última vez que nuestro sistema leyó ese precio. Los precios cambian durante el día, por eso te damos la hora.'],
      ['Mínimo de N días', 'Solo lo decimos si el precio de hoy es el más bajo que hemos registrado en ese período. Si no, no lo decimos.'],
      ['Enlace en Telegram', 'El enlace directo a la tienda va en nuestro canal, a un toque, para que no pierdas la oferta.']],
    cierre: 'Compara antes de comprar.',
    texto: `Cómo leer una oferta de Ofertix 🧐\n1. Referencia: el precio habitual con el que comparamos.\n2. Visto a las HH:MM: la última vez que leímos ese precio.\n3. Mínimo de N días: solo si hoy es el más bajo que hemos registrado.\n4. Enlace en Telegram: directo a la tienda, a un toque.\n\nGuárdalo y compártelo con alguien que compra online 📌\n📲 t.me/ofertixcl\n\n#ofertaschile #ahorrar #comprasinteligentes #ofertix #descuentoschile` },
];
export function htmlEducativo(set) {
  const total = set.items.length + 2, base = i => `${FUENTE}<style>${CSS_T}.num{font-size:240px;font-weight:800;line-height:1;letter-spacing:-8px}</style>`;
  const portada = `${base()}<body class="grad"><div class="eyebrow">Guarda este post</div><div class="big" style="margin-top:40px">${esc(set.titulo)}</div><div class="sub">${esc(set.sub)}</div><div class="foot">@ofertixcl.oficial</div><div class="pg">1/${total}</div></body>`;
  const items = set.items.map(([t, d], i) => `${base()}<body class="${i % 2 ? 'light' : 'dark'}"><div class="num acc">${i + 1}</div>
    <div style="font-size:72px;font-weight:800;line-height:1.12;letter-spacing:-2px;margin-top:10px">${esc(t)}</div><div class="sub" style="opacity:.8;font-size:40px">${esc(d)}</div>
    <div class="foot">@ofertixcl.oficial</div><div class="pg">${i + 2}/${total}</div></body>`);
  const cierre = `${base()}<body class="grad"><div class="big">${esc(set.cierre)}</div><div class="sub">Guarda este post y sigue la cuenta para ver las ofertas del día.</div><div class="foot">@ofertixcl.oficial</div><div class="pg">${total}/${total}</div></body>`;
  return [portada, ...items, cierre];
}
