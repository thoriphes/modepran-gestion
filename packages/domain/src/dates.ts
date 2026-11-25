/**
 * Fechas sin librerías. Los días de calendario son 'YYYY-MM-DD' en Europe/Madrid; la aritmética se hace
 * en UTC sobre esa cadena (no hay horas, así que los cambios de hora no afectan).
 */
import type { IsoDate } from './types.js';

export const TIME_ZONE = 'Europe/Madrid';

export const MONTHS_ES = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

const madridFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const madridTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Día de calendario en Madrid de un instante. */
export function madridDate(instant: Date | string | number): IsoDate {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) throw new RangeError(`Instante no válido: ${String(instant)}`);
  const parts = madridFormatter.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hora 'HH:MM' en Madrid de un instante. */
export function madridTime(instant: Date | string | number): string {
  const d = instant instanceof Date ? instant : new Date(instant);
  return madridTimeFormatter.format(d);
}

/** Hoy en Madrid. */
export function todayMadrid(now: Date = new Date()): IsoDate {
  return madridDate(now);
}

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is IsoDate {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE_RE.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function parts(date: IsoDate): [number, number, number] {
  const m = ISO_DATE_RE.exec(date);
  if (!m || !isIsoDate(date)) throw new RangeError(`Fecha no válida: ${date}`);
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function fmt(y: number, m: number, d: number): IsoDate {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDays(date: IsoDate, n: number): IsoDate {
  const [y, m, d] = parts(date);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Suma meses; si el día no existe en el mes destino, se queda en el último día. */
export function addMonths(date: IsoDate, n: number): IsoDate {
  const [y, m, d] = parts(date);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return fmt(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addYears(date: IsoDate, n: number): IsoDate {
  return addMonths(date, n * 12);
}

export function startOfMonth(date: IsoDate): IsoDate {
  const [y, m] = parts(date);
  return fmt(y, m, 1);
}

export function endOfMonth(date: IsoDate): IsoDate {
  const [y, m] = parts(date);
  return fmt(y, m, daysInMonth(y, m));
}

/** 'YYYY-MM'. */
export function monthKey(date: IsoDate): string {
  return date.slice(0, 7);
}

/** Meses ('YYYY-MM') entre dos fechas, ambos incluidos. */
export function monthsBetween(from: IsoDate, to: IsoDate): string[] {
  const out: string[] = [];
  if (from > to) return out;
  let cur = startOfMonth(from);
  const last = monthKey(to);
  while (monthKey(cur) <= last) {
    out.push(monthKey(cur));
    cur = addMonths(cur, 1);
  }
  return out;
}

/** 'MM-YYYY' (formato de los informes viejos) a partir de 'YYYY-MM'. */
export function monthLabel(key: string): string {
  return `${key.slice(5, 7)}-${key.slice(0, 4)}`;
}

/** 'd-m-Y' de PHP: '05-03-2026'. */
export function formatDMY(date: IsoDate): string {
  const [y, m, d] = parts(date);
  return `${String(d).padStart(2, '0')}-${String(m).padStart(2, '0')}-${y}`;
}

/** Interpreta 'dd-mm-yyyy' (formularios viejos). */
export function parseDMY(value: string): IsoDate | undefined {
  const m = /^(\d{1,2})-(\d{1,2})-(\d{4})$/.exec(value.trim());
  if (!m) return undefined;
  const iso = fmt(Number(m[3]), Number(m[2]), Number(m[1]));
  return isIsoDate(iso) ? iso : undefined;
}

/** '05 de Marzo de 2026' (como `d de Mes de Y` de la app vieja: día con dos cifras). */
export function formatSpanishLong(date: IsoDate): string {
  const [y, m, d] = parts(date);
  return `${String(d).padStart(2, '0')} de ${MONTHS_ES[m - 1]} de ${y}`;
}

/** 'Valencia, 05 de Marzo de 2026'. */
export function formatValenciaLine(date: IsoDate, place = 'Valencia'): string {
  return `${place}, ${formatSpanishLong(date)}`;
}

export interface AgeParts {
  years: number;
  months: number;
  days: number;
}

/** Días entre dos fechas (b − a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  const [ay, am, ad] = parts(a);
  const [by, bm, bd] = parts(b);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/**
 * Diferencia calendario (años, meses, días) entre dos fechas: meses completos = el mayor N con
 * `addMonths(bornAt, N) ≤ today` (fin de mes ajustado), y los días que sobran.
 */
export function ageParts(bornAt: IsoDate, today: IsoDate): AgeParts {
  if (bornAt >= today) return { years: 0, months: 0, days: 0 };
  const [by, bm] = parts(bornAt);
  const [ty, tm] = parts(today);
  let total = (ty - by) * 12 + (tm - bm);
  while (total > 0 && addMonths(bornAt, total) > today) total--;
  const days = diffDays(addMonths(bornAt, total), today);
  return { years: Math.floor(total / 12), months: total % 12, days };
}

/** Años cumplidos. */
export function ageYears(bornAt: IsoDate, today: IsoDate): number {
  return ageParts(bornAt, today).years;
}

/**
 * Edad "X años Y meses Z días" (omite las partes a cero; "0 días" si nació hoy).
 * Singular para 1 ("1 año 1 mes 1 día").
 */
export function formatAge(bornAt: IsoDate, today: IsoDate): string {
  const { years, months, days } = ageParts(bornAt, today);
  const out: string[] = [];
  if (years > 0) out.push(`${years} ${years === 1 ? 'año' : 'años'}`);
  if (months > 0) out.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
  if (days > 0) out.push(`${days} ${days === 1 ? 'día' : 'días'}`);
  return out.length ? out.join(' ') : '0 días';
}

/** Rango por defecto de los informes: desde el día 1 de hace 12 meses hasta hoy. */
export function defaultReportRange(today: IsoDate): { from: IsoDate; to: IsoDate } {
  return { from: addMonths(startOfMonth(today), -12), to: today };
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return a < b ? a : b;
}

export function inRange(date: IsoDate | undefined, from?: IsoDate, to?: IsoDate): boolean {
  if (!date) return false;
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}
