/** Formatos de presentación (es-ES, Europe/Madrid). */
import { formatDMY, GENDER_LABELS, madridDate, madridTime, SIZE_LABELS, type Gender, type IsoDate, type Size } from '@modepran/domain';

export const fmtDate = (d: IsoDate | undefined | null): string => (d ? formatDMY(d) : '—');

export function fmtDateTime(instant: string | undefined | null): string {
  if (!instant) return '—';
  return `${formatDMY(madridDate(instant))} ${madridTime(instant)}`;
}

export const fmtGender = (g: Gender | undefined): string => (g ? GENDER_LABELS[g] : '—');
export const fmtSize = (s: Size | undefined): string => (s ? SIZE_LABELS[s] : '—');
export const fmtBool = (b: boolean | undefined): string => (b ? 'Sí' : 'No');

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Día de la semana de una fecha de calendario (0 = domingo). */
export function weekday(d: IsoDate): number {
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, day)).getUTCDay();
}
export const weekdayName = (d: IsoDate) => WEEKDAYS[weekday(d)]!;
export const weekdayShort = (d: IsoDate) => WEEKDAYS_SHORT[weekday(d)]!;

/** Lunes de la semana de `d`. */
export function mondayOf(d: IsoDate): IsoDate {
  const wd = weekday(d);
  const delta = wd === 0 ? -6 : 1 - wd;
  const [y, m, day] = d.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, day + delta));
  return dt.toISOString().slice(0, 10);
}

export const fmtNumber = (n: number | undefined | null, digits = 0) =>
  n === undefined || n === null ? '—' : n.toLocaleString('es-ES', { maximumFractionDigits: digits });

/** Descarga un Blob como fichero. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Nombre de fichero seguro. */
export const safeFilename = (s: string) => s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();
