/** Filtros de animales ↔ query string de la URL (listado, impresión, fichas masivas). */
import type { AnimalFilters, AnimalSort, AnimalSortField } from '@modepran/domain';

type Kind = 'string' | 'number' | 'bool';
export const FILTER_KEYS: Record<keyof AnimalFilters, Kind> = {
  id: 'number',
  name: 'string',
  chip: 'string',
  speciesId: 'string',
  breedId: 'string',
  gender: 'string',
  color: 'string',
  size: 'string',
  ppp: 'bool',
  weightMin: 'number',
  weightMax: 'number',
  ageMin: 'number',
  ageMax: 'number',
  compatibleDogs: 'bool',
  compatibleCats: 'bool',
  arrivalCityId: 'string',
  arrivalZoneId: 'string',
  arrivalUserId: 'string',
  arrivalSubtypeId: 'string',
  sterilized: 'bool',
  illnessId: 'string',
  centerId: 'string',
  statusId: 'string',
  statusDateFrom: 'string',
  statusDateTo: 'string',
  visibleWeb: 'bool',
  hasChip: 'bool',
  hasPhoto: 'bool',
  arrivalDateFrom: 'string',
  arrivalDateTo: 'string',
  exitDateFrom: 'string',
  exitDateTo: 'string',
  contact: 'string',
  q: 'string',
};

export function filtersFromParams(p: URLSearchParams): AnimalFilters {
  const out: Record<string, unknown> = {};
  for (const [k, kind] of Object.entries(FILTER_KEYS)) {
    const v = p.get(k);
    if (v === null || v === '') continue;
    if (kind === 'number') {
      const n = Number(v.replace(',', '.'));
      if (Number.isFinite(n)) out[k] = n;
    } else if (kind === 'bool') out[k] = v === 'true' || v === '1';
    else out[k] = v;
  }
  return out as AnimalFilters;
}

export function filtersToParams(f: AnimalFilters, extra: Record<string, string | number | undefined> = {}): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of Object.keys(FILTER_KEYS) as (keyof AnimalFilters)[]) {
    const v = f[k];
    if (v === undefined || v === null || v === '') continue;
    p.set(k, String(v));
  }
  for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== '') p.set(k, String(v));
  return p;
}

export const SORT_FIELDS: { value: AnimalSortField; label: string }[] = [
  { value: 'id', label: 'Nº ficha' },
  { value: 'name', label: 'Nombre' },
  { value: 'arrivalDate', label: 'Última llegada' },
  { value: 'exitDate', label: 'Última salida' },
  { value: 'bornAt', label: 'Nacimiento' },
  { value: 'weightKg', label: 'Peso' },
  { value: 'updatedAt', label: 'Modificado' },
];

export function sortFromParams(p: URLSearchParams): AnimalSort {
  const field = (p.get('sort') as AnimalSortField | null) ?? 'id';
  const dir = p.get('dir') === 'asc' ? 'asc' : 'desc';
  return { field: SORT_FIELDS.some((s) => s.value === field) ? field : 'id', dir };
}

export const countFilters = (f: AnimalFilters) => Object.values(f).filter((v) => v !== undefined && v !== '').length;
