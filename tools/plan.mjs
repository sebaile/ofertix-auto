// Plan diario de publicaciones (hora de Chile). Sin dependencias: lo usan el orquestador y la comprobación de "¿toca algo?".
// hora: momento en que se PUBLICA (carrusel/Reel) o se PREPARA (historias, que luego salen a sus propias horas).
// El borrador se prepara ANTICIPO_MIN antes y se acepta hasta `tolerancia` minutos después (por si GitHub se retrasa).
// temaPorDia: contenido temático según el día de la semana (0 = domingo ... 6 = sábado).
export const ANTICIPO_MIN = 15;
export const PLAN = [
  { id: 'historias',  tipo: 'historias', hora: '08:00', tolerancia: 150, limite: '10:30' },
  { id: 'carrusel-a', tipo: 'carrusel',  hora: '11:00', tolerancia: 90,  horasAbierto: 3 },
  { id: 'reel-a',     tipo: 'reel',      hora: '13:00', tolerancia: 90,  horasAbierto: 3 },
  { id: 'carrusel-b', tipo: 'carrusel',  hora: '18:30', tolerancia: 90,  horasAbierto: 3,
    temaPorDia: {
      6: { tipo: 'top5', titulo: 'Top 5 ofertas de la semana' },
      0: { tipo: 'educativo' },
      1: { tipo: 'minimos', titulo: 'Mínimos de los últimos días' },
      2: { tipo: 'top5', rubro: 'perfumes', titulo: 'Top 5 en perfumes' },
      3: { tipo: 'top5', rubro: 'tecnologia', titulo: 'Top 5 en tecnología' },
      4: { tipo: 'top5', rubro: 'hogar', titulo: 'Top 5 en hogar y cocina' },
      5: { tipo: 'top5', titulo: 'Ofertas para el fin de semana' },
    } },
  { id: 'reel-b',     tipo: 'reel',      hora: '20:30', tolerancia: 90,  horasAbierto: 2,
    temaPorDia: { 6: { rubro: 'tecnologia' }, 0: { rubro: 'perfumes' }, 1: { rubro: 'gamer' }, 2: { rubro: 'hogar' }, 3: { rubro: 'belleza' }, 4: { minimos: true } } },
];
// Horas de las historias (el paquete se prepara a las 08:00 y cada una sale a la suya).
export const HORARIO_HIST = [['08:30', 'OFERTA DE LA MAÑANA'], ['12:30', 'OFERTA RELÁMPAGO'], ['15:30', 'OFERTA DE LA TARDE'], ['19:30', 'OFERTA DE LA NOCHE'], ['22:00', 'RESUMEN DEL DÍA']];

export const minutos = hhmm => +hhmm.slice(0, 2) * 60 + +hhmm.slice(3);
export function chileAhora(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).map(x => [x.type, x.value]));
  return { fecha: `${p.year}-${p.month}-${p.day}`, min: +p.hour * 60 + +p.minute, hhmm: `${p.hour}:${p.minute}` };
}
export const enVentana = (slot, minAhora) => { const h = minutos(slot.hora); return minAhora >= h - ANTICIPO_MIN && minAhora <= h + (slot.tolerancia ?? 60); };
export function diaSemana(fecha) {                                // 0 = domingo; PRUEBA_DIA permite simular otro día en pruebas locales
  if (process.env.PRUEBA_DIA !== undefined && process.env.PRUEBA_DIA !== '') return +process.env.PRUEBA_DIA;
  return new Date(fecha + 'T12:00:00Z').getUTCDay();
}
export const temaDelDia = (slot, fecha) => slot.temaPorDia?.[diaSemana(fecha)] ?? null;
// Semana del año (para alternar entre varios carruseles educativos)
export const numeroSemana = fecha => Math.floor((new Date(fecha + 'T12:00:00Z') - new Date(fecha.slice(0, 4) + '-01-01T00:00:00Z')) / (7 * 864e5));
