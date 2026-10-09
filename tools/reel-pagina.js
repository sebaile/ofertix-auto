// Página animada del Reel. Todo depende del tiempo t (segundos): window.setT(t) deja la página en ese instante exacto.
// Datos: window.DATA = { hoy, ofertas: [{nombre, tienda, ahora, antes, pct, antesOk}] }
(function () {
  const D = window.DATA;
  const NOF = D.ofertas.length;
  const T_INTRO = 2.6, T_OFF = 3.4, T_OUTRO = 3.0;
  const S = [0, T_INTRO, ...D.ofertas.map((_, i) => T_INTRO + T_OFF * (i + 1))];       // inicio de cada escena
  const TOTAL = S[S.length - 1] + T_OUTRO;
  window.REEL = { S, TOTAL, T_OFF };

  const clamp = x => Math.min(1, Math.max(0, x));
  const prog = (t, a, d) => clamp((t - a) / d);
  const out3 = x => 1 - Math.pow(1 - x, 3);
  const back = x => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
  const inout = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const fmt = n => '$' + Math.round(n).toLocaleString('es-CL');
  const html = h => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstChild; };
  const rng = seed => { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; };
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

  const ICON = '<svg viewBox="0 0 512 512" width="100%" height="100%"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF8A00"/><stop offset="1" stop-color="#FF2E63"/></linearGradient></defs><rect width="512" height="512" rx="112" fill="#fff"/><g transform="rotate(-18 256 256)"><path d="M150 170H306L402 256L306 342H150Q122 342 122 314V198Q122 170 150 170Z" fill="url(#g)"/><circle cx="182" cy="256" r="24" fill="#fff"/><path d="M280 200L222 268H256L238 318L302 242H266Z" fill="#fff"/></g></svg>';

  function confeti(n, seed) {
    const r = rng(seed), cols = ['#FF8A00', '#FF2E63', '#FFFFFF', '#FFD166', '#06D6A0'];
    const el = html('<div class="conf"></div>'), ps = [];
    for (let i = 0; i < n; i++) {
      const p = document.createElement('i');
      p.style.background = cols[Math.floor(r() * cols.length)];
      p.style.width = 14 + r() * 18 + 'px'; p.style.height = 24 + r() * 28 + 'px';
      el.appendChild(p);
      ps.push({ el: p, x: r() * 1080, d: r() * 1.3, v: 520 + r() * 700, rs: (r() - 0.5) * 760, sw: (r() - 0.5) * 180, ph: r() * 6 });
    }
    return { el, upd(lt) { ps.forEach(q => { const a = lt - q.d; if (a < 0) { q.el.style.opacity = 0; return; } q.el.style.opacity = 1; q.el.style.transform = `translate(${q.x + Math.sin(a * 3 + q.ph) * q.sw}px,${-80 + a * q.v}px) rotate(${a * q.rs}deg)`; }); } };
  }

  const stage = document.getElementById('stage');
  const escenas = [];   // {el, upd(lt, t)}

  // ---------- Escena 0: portada ----------
  {
    const c = confeti(40, 11);
    const el = html(`<div class="sc grad"><div class="glow g1"></div><div class="ico" id="i-ico">${ICON}</div>
      <div class="abs" id="i-n" style="left:70px;top:330px;font-size:560px;font-weight:800;line-height:1;letter-spacing:-20px">${NOF}</div>
      <div class="abs" id="i-a" style="left:90px;top:900px;font-size:190px;font-weight:800;letter-spacing:-6px;line-height:1">OFERTAS</div>
      <div class="abs" id="i-b" style="left:90px;top:1090px;font-size:190px;font-weight:800;letter-spacing:-6px;line-height:1">DE HOY</div>
      <div class="abs" id="i-s" style="left:90px;top:1330px;font-size:54px;font-weight:600">precios vistos hoy ✔</div>
      <div class="handle">@ofertixcl.oficial</div></div>`);
    el.insertBefore(c.el, el.querySelector('.ico'));
    const q = id => el.querySelector('#' + id);
    escenas.push({ el, upd(lt, t) {
      el.style.background = `linear-gradient(${150 + 25 * Math.sin(t * 1.3)}deg,#FF8A00,#FF2E63)`;
      el.querySelector('.glow').style.transform = `translate(${-200 + 120 * Math.sin(t)}px,${300 + 100 * Math.cos(t * 1.2)}px)`;
      const n = q('i-n'), p = back(prog(lt, 0.1, 0.55));
      n.style.transform = `scale(${p}) rotate(${(1 - p) * -25}deg)`; n.style.opacity = prog(lt, 0.1, 0.1);
      q('i-a').style.transform = `translateX(${(1 - out3(prog(lt, 0.4, 0.45))) * -1300}px)`;
      q('i-b').style.transform = `translateX(${(1 - out3(prog(lt, 0.6, 0.45))) * 1300}px)`;
      const s = q('i-s'); s.style.opacity = prog(lt, 1.1, 0.4); s.style.transform = `translateY(${(1 - out3(prog(lt, 1.1, 0.4))) * 40}px)`;
      const ic = q('i-ico'), b = Math.abs(Math.sin(lt * 4));
      ic.style.transform = `translateY(${-b * 40}px) rotate(${Math.sin(lt * 5) * 10}deg) scale(${back(prog(lt, 0, 0.5))})`;
      c.upd(lt);
    } });
  }

  // ---------- Escenas de oferta ----------
  D.ofertas.forEach((o, k) => {
    const palabras = o.nombre.split(/\s+/).map(w => `<span class="w">${esc(w)}</span>`).join(' ');
    const llamas = [0, 1, 2, 3, 4].map(i => `<div class="fl" style="left:${120 + i * 200}px">🔥</div>`).join('');
    const el = html(`<div class="sc dark"><div class="glow g2"></div>${llamas}
      <div class="pills">${D.ofertas.map(() => '<div class="pill"><b></b></div>').join('')}</div>
      <div class="abs lab" style="left:90px;top:205px;font-size:42px;font-weight:700;letter-spacing:6px">OFERTA ${k + 1} DE ${NOF}</div>
      <div class="abs pic" style="left:90px;top:265px;width:900px;height:330px">${o.img ? `<img src="${o.img}">` : ''}</div>
      <div class="abs nm" style="left:90px;top:625px;width:900px;font-size:64px;font-weight:800;line-height:1.1;letter-spacing:-1px">${palabras}</div>
      <div class="abs st" style="left:90px;top:865px;font-size:42px;font-weight:600"><span class="chip">${esc(o.tienda)}</span></div>
      <div class="abs old" style="left:90px;top:955px;font-size:62px;font-weight:600;color:#9A97A8"><span class="ov">${fmt(o.antes)}</span><i class="strike"></i></div>
      <div class="abs nw" style="left:90px;top:1010px;font-size:190px;font-weight:800;letter-spacing:-7px;line-height:1.1"><span class="acc">${fmt(o.ahora)}</span></div>
      <div class="abs ver" style="left:90px;top:1245px;font-size:50px;font-weight:700"><span class="chip2">PRECIO VISTO HOY ✔</span></div>
      <div class="ring"></div><div class="abs bdg" style="left:90px;top:1245px"><span>-${o.pct}%</span></div>
      <div class="handle">@ofertixcl.oficial</div></div>`);
    const $ = s => el.querySelector(s), words = [...el.querySelectorAll('.w')];
    const pills = [...el.querySelectorAll('.pill b')];
    escenas.push({ el, upd(lt, t) {
      $('.glow').style.transform = `translate(${200 + 160 * Math.sin(t * 0.8)}px,${900 + 140 * Math.cos(t)}px)`;
      pills.forEach((b, j) => { b.style.width = (j < k ? 100 : j === k ? prog(lt, 0, T_OFF) * 100 : 0) + '%'; });
      el.querySelectorAll('.fl').forEach((f, i) => { const a = (lt + i * 0.7) % 3.4; f.style.transform = `translate(${Math.sin(a * 2 + i) * 30}px,${1700 - a * 380}px) scale(${0.7 + (i % 3) * 0.2})`; f.style.opacity = Math.min(1, a * 2) * (1 - prog(a, 2.6, 0.8)) * 0.55; });
      const lab = $('.lab'); lab.style.opacity = prog(lt, 0.15, 0.3); lab.style.transform = `translateX(${(1 - out3(prog(lt, 0.15, 0.4))) * -200}px)`;
      lab.style.color = '#FF8A00';
      const pic = $('.pic'), pp = back(prog(lt, 0.2, 0.55));
      pic.style.opacity = prog(lt, 0.2, 0.2); pic.style.transform = `translateY(${(1 - out3(prog(lt, 0.2, 0.5))) * 120}px) scale(${0.85 + 0.15 * pp})`;
      words.forEach((w, i) => { const a = 0.35 + i * 0.09; w.style.opacity = prog(lt, a, 0.2); w.style.transform = `translateY(${(1 - back(prog(lt, a, 0.35))) * 70}px)`; });
      const ta = 0.35 + words.length * 0.09 + 0.1, st = $('.chip');
      st.style.transform = `scale(${back(prog(lt, ta, 0.4))})`; st.style.opacity = prog(lt, ta, 0.1);
      const nw = $('.nw'), nwv = nw.querySelector('span');
      if (o.antesOk) {
        $('.old').style.opacity = prog(lt, 0.9, 0.3);
        $('.strike').style.width = prog(lt, 1.25, 0.3) * 100 + '%';
        const c = out3(prog(lt, 1.55, 0.6));
        nwv.textContent = fmt(o.antes + (o.ahora - o.antes) * c);
        nw.style.opacity = prog(lt, 1.4, 0.2);
        const pop = 1 + 0.16 * Math.sin(Math.PI * prog(lt, 2.15, 0.35));
        nw.style.transform = `scale(${pop})`; nw.style.transformOrigin = 'left center';
        $('.ver').style.display = 'none';
        const bs = prog(lt, 2.15, 0.45), b = $('.bdg');
        b.style.opacity = prog(lt, 2.15, 0.08);
        b.style.transform = `scale(${3 - 2 * back(bs)}) rotate(${-14 + 8 * back(bs)}deg)`;
        const r = $('.ring'), rp = prog(lt, 2.55, 0.5);
        r.style.opacity = rp > 0 && rp < 1 ? 0.8 * (1 - rp) : 0; r.style.transform = `scale(${0.3 + rp * 2.6})`;
      } else {
        $('.old').style.display = 'none'; $('.bdg').style.display = 'none'; $('.ring').style.display = 'none';
        nw.style.top = '1010px'; nw.style.opacity = prog(lt, 1.0, 0.2); nw.style.transformOrigin = 'left center';
        nw.style.transform = `scale(${back(prog(lt, 1.0, 0.5))})`;
        const v = $('.ver'); v.style.opacity = prog(lt, 1.7, 0.3); v.style.transform = `translateY(${(1 - out3(prog(lt, 1.7, 0.4))) * 40}px)`;
      }
    } });
  });

  // ---------- Escena final ----------
  {
    const c = confeti(34, 29);
    const el = html(`<div class="sc grad"><div class="glow g1"></div>
      <div class="abs" id="o-a" style="left:90px;top:400px;font-size:150px;font-weight:800;letter-spacing:-5px;line-height:1">Más ofertas</div>
      <div class="abs" id="o-b" style="left:90px;top:570px;font-size:150px;font-weight:800;letter-spacing:-5px;line-height:1">en Telegram</div>
      <div class="abs" id="o-btn" style="left:90px;top:900px"><span class="btn">✈ t.me/ofertixcl</span></div>
      <div class="abs" id="o-n" style="left:90px;top:1130px;font-size:48px;font-weight:600">🔔 Activa las notificaciones</div>
      <div class="abs" id="o-p" style="left:90px;top:1220px;font-size:36px;font-weight:500;opacity:.85">Los precios pueden cambiar o agotarse.</div>
      <div class="handle">@ofertixcl.oficial</div></div>`);
    el.insertBefore(c.el, el.querySelector('#o-a'));
    const q = id => el.querySelector('#' + id);
    escenas.push({ el, upd(lt, t) {
      el.style.background = `linear-gradient(${150 + 25 * Math.sin(t * 1.3)}deg,#FF8A00,#FF2E63)`;
      el.querySelector('.glow').style.transform = `translate(${-200 + 120 * Math.sin(t)}px,${500 + 100 * Math.cos(t * 1.2)}px)`;
      q('o-a').style.transform = `translateX(${(1 - out3(prog(lt, 0.2, 0.45))) * -1300}px)`;
      q('o-b').style.transform = `translateX(${(1 - out3(prog(lt, 0.4, 0.45))) * 1300}px)`;
      const b = q('o-btn'), s = back(prog(lt, 0.9, 0.5));
      b.style.opacity = prog(lt, 0.9, 0.1); b.style.transformOrigin = 'left center';
      b.style.transform = `scale(${s * (1 + 0.04 * Math.sin(lt * 7))}) rotate(${Math.sin(lt * 5) * 1.2}deg)`;
      for (const [id, a] of [['o-n', 1.5], ['o-p', 1.8]]) { const e = q(id); e.style.opacity = prog(lt, a, 0.4) * (id === 'o-p' ? 0.85 : 1); e.style.transform = `translateY(${(1 - out3(prog(lt, a, 0.4))) * 40}px)`; }
      c.upd(lt);
    } });
  }

  escenas.forEach(e => stage.appendChild(e.el));
  window.setT = function (t) {
    escenas.forEach((e, i) => {
      const lt = t - S[i];
      const p = i === 0 ? 1 : inout(prog(t, S[i] - 0.05, 0.55));
      e.el.style.transform = `translateY(${(1 - p) * 100}%)`;
      e.el.style.visibility = t < S[i] - 0.06 ? 'hidden' : 'visible';
      if (lt > -0.1) e.upd(Math.max(lt, 0), t);
    });
  };
  window.setT(0);
})();
