/** Normalización de textos: ciudades, razas, NIF, búsquedas. */

/** Mayúscula inicial en cada palabra y el resto en minúsculas ("vaLENcia del cid" → "Valencia Del Cid"). */
export function capitalizeWords(value: string): string {
  return collapseSpaces(value)
    .toLocaleLowerCase('es')
    .replace(/(^|[\s\-'(/])(\p{L})/gu, (_m, sep: string, ch: string) => sep + ch.toLocaleUpperCase('es'));
}

export function collapseSpaces(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Ciudades y razas se crean al vuelo normalizadas (regla 9). */
export function normalizeCity(value: string): string {
  return capitalizeWords(value);
}

export function normalizeBreed(value: string): string {
  return capitalizeWords(value);
}

/** NIF/NIE en mayúsculas, sin espacios, guiones ni puntos. */
export function normalizeNif(value: string | undefined | null): string | undefined {
  if (value == null) return undefined;
  const v = value.replace(/[\s.\-]/g, '').toUpperCase();
  return v === '' ? undefined : v;
}

/** Para comparar en búsquedas: minúsculas, sin tildes, espacios colapsados. */
export function foldText(value: string): string {
  return collapseSpaces(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

export function includesFolded(haystack: string | undefined | null, needle: string): boolean {
  if (!haystack) return false;
  return foldText(haystack).includes(foldText(needle));
}

/** Escapa HTML (equivalente a `e()` de Laravel). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Slug estable a partir de un nombre ("Devolución desde Acogida" → "devolucion_desde_acogida"). */
export function slugify(value: string): string {
  return foldText(value)
    .replace(/ñ/g, 'n')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}
