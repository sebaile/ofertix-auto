// Lee mensajes de canales públicos de Telegram (vista t.me/s/<canal>) y los guarda en cache/ofertas-brutas.json
import { readFileSync, writeFileSync } from 'node:fs';
const canales = process.argv.slice(2);
const dec = s => s.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#39;/g,"'").replace(/&#036;/g,'$').trim();
const out = [];
for (const c of canales) {
  const r = await fetch(`https://t.me/s/${c}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await r.text();
  for (const blk of html.split('tgme_widget_message_wrap').slice(1)) {
    const post = blk.match(/data-post="([^"]+)"/)?.[1];
    const t = blk.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)?.[1];
    if (!post || !t) continue;
    const fecha = blk.match(/<time[^>]*datetime="([^"]+)"/)?.[1];
    const enlaces = [...t.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
    out.push({ canal: c, post, fecha, texto: dec(t), enlaces, foto: /tgme_widget_message_photo_wrap/.test(blk) });
  }
}
writeFileSync(new URL('./cache/ofertas-brutas.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(out.length, 'mensajes');
