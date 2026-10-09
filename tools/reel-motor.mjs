// Motor genérico de Reels animados: dibuja una página dependiente del tiempo fotograma a fotograma (Chrome) y la une con audio (ffmpeg).
// La página debe definir window.setT(t) y window.REEL = { S: [inicios de escena], TOTAL }.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { join } from 'node:path';

const CHROME = process.env.CHROME_PATH || (process.platform === 'win32' ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/google-chrome');
const FFMPEG = process.env.FFMPEG ?? (process.platform === 'win32' ? join(process.env.LOCALAPPDATA ?? '', 'Microsoft/WinGet/Links/ffmpeg.exe') : 'ffmpeg');
const FPS = 30;

export const CSS_BASE = `*{box-sizing:border-box;margin:0}html,body{width:1080px;height:1920px;overflow:hidden;background:#14141F;font-family:Poppins,"Segoe UI",Arial,sans-serif;color:#fff}
#stage{position:relative;width:1080px;height:1920px;overflow:hidden}.sc{position:absolute;inset:0;overflow:hidden;will-change:transform}
.grad{background:linear-gradient(150deg,#FF8A00,#FF2E63)}.dark{background:#14141F}.abs{position:absolute;white-space:nowrap}.nm{white-space:normal}
.glow{position:absolute;left:0;top:0;width:1300px;height:1300px;border-radius:50%;margin:-650px 0 0 -650px}.g1{background:radial-gradient(circle,rgba(255,255,255,.28),transparent 62%)}.g2{background:radial-gradient(circle,rgba(255,46,99,.30),transparent 62%)}
.acc{background:linear-gradient(135deg,#FF8A00,#FF2E63);-webkit-background-clip:text;color:transparent}
.handle{position:absolute;left:90px;bottom:420px;font-weight:700;font-size:38px;opacity:.85}
.ico{position:absolute;left:90px;top:130px;width:190px;height:190px;filter:drop-shadow(0 12px 24px rgba(0,0,0,.25))}
.conf{position:absolute;inset:0;overflow:hidden;pointer-events:none}.conf i{position:absolute;left:0;top:0;display:block;border-radius:4px}
.pills{position:absolute;left:90px;right:90px;top:130px;display:flex;gap:16px}.pill{flex:1;height:14px;border-radius:7px;background:rgba(255,255,255,.18);overflow:hidden}.pill b{display:block;height:100%;width:0;background:linear-gradient(90deg,#FF8A00,#FF2E63)}
.w{display:inline-block;margin-right:.28em}.btn{display:inline-block;background:#fff;color:#FF2E63;font-size:78px;font-weight:800;border-radius:90px;padding:36px 80px;box-shadow:0 18px 0 rgba(0,0,0,.18)}`;

export async function renderizar({ css = '', pagina, data, eventos, salida, frames = null }) {
  const html = `<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&display=swap" rel="stylesheet"><style>${CSS_BASE}${css}</style><div id="stage"></div><script>window.DATA=${JSON.stringify(data)}</script><script>${pagina}</script>`;
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--disable-gpu', '--hide-scrollbars'] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 }).catch(() => {});
    await page.evaluate(() => document.fonts.ready);
    const { S, TOTAL } = await page.evaluate(() => window.REEL);
    if (frames) { for (const t of frames) { await page.evaluate(x => window.setT(x), t); await page.screenshot({ path: `${salida}-${t}.png` }); } return { S, TOTAL }; }

    const ev = eventos(S, data);
    const fuente = e => ({
      thump: 'sine=f=90:d=0.28:r=44100,afade=t=out:st=0.05:d=0.23,volume=0.9',
      pop: `sine=f=${e.f}:d=0.12:r=44100,afade=t=out:st=0.01:d=0.11,volume=0.45`,
      ding: `sine=f=${e.f}:d=0.45:r=44100,afade=t=out:st=0.02:d=0.43,volume=0.3`,
      whoosh: 'anoisesrc=d=0.5:c=pink:r=44100:a=0.6,afade=t=in:st=0:d=0.25,afade=t=out:st=0.25:d=0.25,volume=0.5',
      chirp: "aevalsrc='0.3*sin(2*PI*(500+900*t)*t)':d=0.6:s=44100,afade=t=out:st=0.5:d=0.1",
    }[e.k]);
    const audio = ev.map((e, i) => `${fuente(e)},aformat=channel_layouts=mono,adelay=${Math.max(0, Math.round(e.t * 1000))}:all=1[a${i}]`);
    const mezcla = `${ev.map((_, i) => `[a${i}]`).join('')}amix=inputs=${ev.length}:normalize=0,alimiter=limit=0.9,apad=whole_dur=${TOTAL.toFixed(2)},atrim=0:${TOTAL.toFixed(2)},aformat=channel_layouts=stereo[aout]`;
    const ff = spawn(FFMPEG, ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-', '-filter_complex', [...audio, mezcla].join(';'), '-map', '0:v', '-map', '[aout]',
      '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-r', String(FPS), '-c:a', 'aac', '-b:a', '160k', '-t', TOTAL.toFixed(2), '-movflags', '+faststart', salida], { stdio: ['pipe', 'inherit', 'inherit'] });
    const fin = new Promise((ok, mal) => { ff.on('close', c => (c === 0 ? ok() : mal(new Error('ffmpeg terminó con código ' + c)))); ff.on('error', mal); });
    const N = Math.ceil(TOTAL * FPS);
    for (let i = 0; i < N; i++) {
      await page.evaluate(t => window.setT(t), i / FPS);
      const buf = await page.screenshot({ type: 'jpeg', quality: 92 });
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
    }
    ff.stdin.end(); await fin;
    return { S, TOTAL };
  } finally { await browser.close(); }
}
