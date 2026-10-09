// Plan diario de publicaciones (hora de Chile). Sin dependencias: lo usan el orquestador y la comprobación de "¿toca algo?".
// hora: momento en que se PUBLICA (carrusel/Reel) o se PREPARA (historias, que luego salen a sus propias horas).
// El borrador se prepara ANTICIPO_MIN antes y se acepta hasta `tolerancia` minutos después (por si GitHub se retrasa).
export const ANTICIPO_MIN = 15;
export const PLAN = [
  { id: 'historias',  tipo: 'historias', hora: '08:00', tolerancia: 150, limite: '10:30' },
  { id: 'carrusel-a', tipo: 'carrusel',  hora: '11:00', tolerancia: 90,  horasAbierto: 3 },
  { id: 'reel-a',     tipo: 'reel',      hora: '13:00', tolerancia: 90,  horasAbierto: 3 },
  { id: 'carrusel-b', tipo: 'carrusel',  hora: '18:30', tolerancia: 90,  horasAbierto: 3 },
  { id: 'reel-b',     tipo: 'reel',      hora: '20:30', tolerancia: 90,  horasAbierto: 2, rubroPorDia: { 0: 'perfumes', 1: 'gamer', 2: 'hogar', 3: 'belleza', 6: 'tecnologia' } },
];
// Horas de las historias (el paquete se prepara a las 08:00 y cada una sale a la suya).
export const HORARIO_HIST = [['08:30', 'OFERTA DE LA MAÑANA'], ['12:30', 'OFERTA RELÁMPAGO'], ['15:30', 'OFERTA DE LA TARDE'], ['19:30', 'OFERTA DE LA NOCHE'], ['22:00', 'RESUMEN DEL DÍA']];

export const minutos = hhmm => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3);
export function chileAhora(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute, hhmm: `${p.hour}:${p.minute}` };
}
export const enVentana = (slot, minAhora) => { const h = minutos(slot.hora); return minAhora >= h - ANTICIPO_MIN && minAhora <= h + (slot.tolerancia ?? 60); };
export function rubroDelDia(slot, fecha) {                       // tema por rubro según el día de la semana (0 = domingo)
  if (process.env.RUBRO_PRUEBA && slot.rubroPorDia) return process.env.RUBRO_PRUEBA;     // solo para pruebas locales
  const dia = new Date(fecha + 'T12:00:00Z').getUTCDay();
  return slot.rubroPorDia?.[dia] ?? null;
}
