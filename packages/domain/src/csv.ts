/**
 * CSV para Excel en español: BOM UTF-8, separador `;`, CRLF y protección contra inyección de fórmulas
 * (las celdas de texto que empiezan por = + - @ tabulador o retorno se prefijan con `'`).
 */

export type CsvCell = string | number | boolean | null | undefined | Date;

export interface CsvOptions {
  separator?: string;
  bom?: boolean;
  newline?: string;
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell, separator = ';'): string {
  if (value === null || value === undefined) return '';
  let s: string;
  if (typeof value === 'number') {
    // Los números van sin prefijo (un negativo no es una fórmula) y con coma decimal (Excel en español).
    if (!Number.isFinite(value)) return '';
    return quoteIfNeeded(String(value).replace('.', ','), separator);
  }
  if (typeof value === 'boolean') s = value ? 'Sí' : 'No';
  else if (value instanceof Date) s = value.toISOString();
  else s = value;
  if (FORMULA_START.test(s)) s = `'${s}`;
  return quoteIfNeeded(s, separator);
}

function quoteIfNeeded(s: string, separator: string): string {
  if (s.includes('"') || s.includes(separator) || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: readonly (readonly CsvCell[])[], options: CsvOptions = {}): string {
  const sep = options.separator ?? ';';
  const nl = options.newline ?? '\r\n';
  const body = rows.map((r) => r.map((c) => csvCell(c, sep)).join(sep)).join(nl);
  return (options.bom === false ? '' : '﻿') + body + (rows.length ? nl : '');
}

/** CSV a partir de objetos y columnas `{header, value}`. */
export function objectsToCsv<T>(
  items: readonly T[],
  columns: readonly { header: string; value: (item: T) => CsvCell }[],
  options: CsvOptions = {},
): string {
  return toCsv([columns.map((c) => c.header), ...items.map((it) => columns.map((c) => c.value(it)))], options);
}
