// ¿Toca preparar algo ahora? Se ejecuta antes de instalar nada, para que las revisiones sin trabajo duren segundos.
// Escribe hay=true|false en $GITHUB_OUTPUT. Sin dependencias externas.
import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PLAN, chileAhora, enVentana } from './plan.mjs';

const raiz = resolve(import.meta.dirname, '..');
const f = join(raiz, 'datos', 'estado.json');
const estado = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : { items: {}, config: {} };
const { fecha, min, hhmm } = chileAhora();
const pendientes = PLAN.filter(s => !estado.items?.[`${fecha}-${s.id}`] && enVentana(s, min)).map(s => s.id);
const hay = !estado.config?.pausado && pendientes.length > 0;
console.log(`Chile ${fecha} ${hhmm} · pausado=${!!estado.config?.pausado} · por preparar: ${pendientes.join(', ') || 'nada'} → hay=${hay}`);
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `hay=${hay}\n`);
