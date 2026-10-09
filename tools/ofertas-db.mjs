// Ofertas desde la base de datos de Ofertix (Neon), con un usuario de SOLO LECTURA.
// Mismos criterios que tu publicador de Telegram (telegram/publisher.py) más frescura estricta e historial de precios.
import pg from 'pg';
import { env, bonito } from './lib.mjs';

const RUBRO_SQL = `CASE
  WHEN s.name ~* 'librer|libro|buscalibre' THEN 'libros'
  WHEN s.name ~* 'hush|vans|under armour|fashion|north face|puma|adidas|nike|reebok|levi|zapat'
    OR o.category ~* 'poler|chaqueta|polera|jeans|zapat|calzado|vestido|ropa|pantal|camisa|abrigo' THEN 'moda'
  WHEN s.name ~* 'perfum' OR o.category ~* 'perfume|colonia|fragancia|para hombre|para mujer' THEN 'perfumes'
  WHEN o.category ~* 'cabello|belleza|maquill|cosm|cuidado|skin|facial|corporal' THEN 'belleza'
  WHEN o.category ~* 'consola|videojuego|gamer|juego' OR o.name ~* 'playstation|ps[45]|xbox|nintendo|gamer|gaming|odyssey|razer|hyperx|steelseries|rgb' THEN 'gamer'
  WHEN o.category ~* 'celular|smartphone|notebook|laptop|tablet|aud[ií]fono|headset|equipos de audio|parlante|televisor|monitor|teclado|mouse|bater[ií]a|cargador|inform[aá]tica|c[aá]mara|smartwatch|impresora|router|almacenamiento'
    OR o.category ~* '(^| )tv( |$)' THEN 'tecnologia'
  WHEN o.category ~* 'cafetera|cocina|air fryer|licuadora|batidora|horno|microondas|aire acond|climatiz|estufa|ventilador|refriger|lavadora|mueble|cama|colch|sof[aá]|aspiradora|hervidor|hogar|electrodom|sandwichera|freidora' THEN 'hogar'
  ELSE 'otros' END`;
const LIBRO_TECNICO = 'cirug|quir[uú]rg|medic|cl[ií]nic|patolog|oncol|neurol|radiolog|anatom|odontolog|enfermer|farmacolog|pediatr|ginecolog|cardiol|dermat|tiroid|implantol|perioperat|dolor|trauma|derecho|jur[ií]dic|tribut|contabil|ingenier|veterin|treatise|handbook|atlas of|surgery|journal|proceedings|textbook|study of|edition|ed\\.|trastorno|obesidad|salud|bio[eé]tica|t[eé]cnic|sharepoint|inform[aá]tica|psiquiatr|psicolog|nutric|edici[oó]n|manual';

async function conectar() {
  if (!env.DB_URL_LECTURA) throw new Error('Falta DB_URL_LECTURA');
  const c = new pg.Client({ connectionString: env.DB_URL_LECTURA, connectionTimeoutMillis: 20000 });
  await c.connect(); return c;
}

// Ofertas frescas (vistas hace menos de `edadMin` minutos) con su historial de precios de hasta 90 días.
export async function candidatas({ excluirIds = [], edadMin = 120, minDesc = 40, minAhorro = 15000, minPrecio = 8000, maxPrecio = 250000, porRubro = 12 } = {}) {
  const c = await conectar();
  try {
    const { rows } = await c.query(`
      WITH base AS (
        SELECT o.id, o.name, o.brand, o.category, o.url, o.original_price AS antes, o.current_price AS ahora, o.discount_pct AS pct,
               o.last_seen_at, o.updated_at, s.name AS tienda, ${RUBRO_SQL} AS rubro
        FROM offers o JOIN stores s ON s.id = o.store_id
        WHERE o.is_active AND NOT o.price_inflated AND s.enabled
          AND o.discount_pct >= $1 AND o.original_price - o.current_price >= $2
          AND o.current_price BETWEEN $3 AND $4
          AND o.last_seen_at > now() - make_interval(mins => $5)
          AND o.id <> ALL($6::bigint[])
      ), filtradas AS (
        SELECT * FROM base WHERE NOT (rubro = 'libros' AND (tienda ~* 'contrapunto' OR name ~* '${LIBRO_TECNICO}' OR coalesce(category, '') ~* '${LIBRO_TECNICO}'))
      ), ranked AS (
        SELECT *, row_number() OVER (PARTITION BY rubro ORDER BY pct DESC, antes - ahora DESC) AS rn FROM filtradas
      )
      SELECT r.*, h.min90, h.n_hist, h.dias_hist
      FROM ranked r
      LEFT JOIN LATERAL (SELECT min(current_price) AS min90, count(*)::int AS n_hist, floor(extract(epoch FROM now() - min(recorded_at)) / 86400)::int AS dias_hist
                         FROM price_history ph WHERE ph.offer_id = r.id AND ph.recorded_at > now() - interval '90 days') h ON true
      WHERE r.rn <= $7
      ORDER BY r.rn, r.pct DESC`, [minDesc, minAhorro, minPrecio, maxPrecio, edadMin, excluirIds.map(String), porRubro]);
    return rows.map(r => ({ ...r, nombre: bonito(r.name), esMinimo: r.n_hist >= 3 && r.dias_hist >= 14 && r.ahora <= r.min90, dias: Math.min(r.dias_hist ?? 0, 90) }));
  } finally { await c.end(); }
}

// ¿Sigue vigente justo antes de publicar? (activa, sin marca de inflado, precio igual o menor, vista hace poco)
export async function sigueVigente(id, precio, edadMin = 180) {
  const c = await conectar();
  try {
    const { rows } = await c.query(`SELECT o.current_price, o.is_active, o.price_inflated, o.last_seen_at > now() - make_interval(mins => $2) AS fresca FROM offers o WHERE o.id = $1`, [id, edadMin]);
    if (!rows.length) return { ok: false, motivo: 'ya no existe' };
    const r = rows[0];
    if (!r.is_active) return { ok: false, motivo: 'la oferta terminó' };
    if (r.price_inflated) return { ok: false, motivo: 'precio original sospechoso' };
    if (r.current_price > precio) return { ok: false, motivo: `el precio subió a $${r.current_price}` };
    if (!r.fresca) return { ok: false, motivo: 'sin lectura reciente' };
    return { ok: true, precioActual: r.current_price };
  } finally { await c.end(); }
}

// Elige `n` ofertas con variedad de rubros. Prefiere mínimos históricos y mayor descuento; limita libros.
export function elegirVariadas(cands, n, { maxPorRubro = 1, permitirLibros = true } = {}) {
  const puntaje = o => Math.min(o.pct, 60) + (o.esMinimo ? 30 : 0) + (o.antes - o.ahora >= 50000 ? 10 : 0);   // descuentos extremos no suman más
  const orden = [...cands].filter(o => o.nombre.length <= 70 && o.pct <= 75 && !/open box|reacondicionad|usado|outlet/i.test(o.name) && !/[a-záéíóúñ].[a-záéíóúñ]/i.test(o.name) && !/�/.test(o.name) && (permitirLibros || o.rubro !== 'libros')).sort((a, b) => puntaje(b) - puntaje(a));
  const elegidas = [], cuenta = new Map();
  for (const o of orden) { if (elegidas.length === n) break; if ((cuenta.get(o.rubro) ?? 0) >= maxPorRubro) continue; elegidas.push(o); cuenta.set(o.rubro, (cuenta.get(o.rubro) ?? 0) + 1); }
  if (elegidas.length < n) for (const o of orden) { if (elegidas.length === n) break; if (!elegidas.includes(o) && (cuenta.get(o.rubro) ?? 0) < maxPorRubro + 1) { elegidas.push(o); cuenta.set(o.rubro, (cuenta.get(o.rubro) ?? 0) + 1); } }
  return elegidas;
}
