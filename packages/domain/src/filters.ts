/**
 * Filtros, orden y paginación del listado de animales (feature-set "Listado de animales").
 * Trabaja solo con la ficha y sus derivados (spec §8: la Lambda lee el GSI `ANIMALS` y filtra en memoria).
 *
 * Diferencias con la app vieja (decisiones):
 * - Los rangos de fecha admiten un solo extremo (la vieja exigía los dos).
 * - El rango de fecha de estado mira los cambios de estado de eventos no veterinarios (en la vieja los
 *   subtipos veterinarios tenían estado "Disponible" y colaban en ese filtro).
 * - Nombre, color y contacto se comparan sin tildes ni mayúsculas.
 */
import { addYears } from './dates.js';
import { contactFullName } from './contacts.js';
import type { Animal, AnimalId, CatalogId, Contact, ContactId, Gender, IsoDate, Size, UserId, Zone } from './types.js';
import { foldText, includesFolded, normalizeNif } from './text.js';

export interface AnimalFilters {
  id?: AnimalId;
  /** Contiene. */
  name?: string;
  /** Número de chip exacto. */
  chip?: string;
  speciesId?: CatalogId;
  breedId?: CatalogId;
  gender?: Gender;
  color?: string;
  size?: Size;
  ppp?: boolean;
  weightMin?: number;
  weightMax?: number;
  /** Edad en años cumplidos, por `bornAt`. Los animales sin fecha de nacimiento no pasan estos filtros. */
  ageMin?: number;
  ageMax?: number;
  compatibleDogs?: boolean;
  compatibleCats?: boolean;
  /** Ciudad de la última llegada. */
  arrivalCityId?: CatalogId;
  /** Zona de la ciudad de la última llegada. */
  arrivalZoneId?: CatalogId;
  /** Trabajador de la última llegada. */
  arrivalUserId?: UserId;
  /** Subtipo de la última llegada. */
  arrivalSubtypeId?: CatalogId;
  sterilized?: boolean;
  /** Ha tenido esta enfermedad alguna vez. */
  illnessId?: CatalogId;
  centerId?: CatalogId;
  statusId?: CatalogId;
  /** Con `statusId`: pasó a ese estado dentro del rango. */
  statusDateFrom?: IsoDate;
  statusDateTo?: IsoDate;
  visibleWeb?: boolean;
  hasChip?: boolean;
  hasPhoto?: boolean;
  /** Alguna llegada en el rango. */
  arrivalDateFrom?: IsoDate;
  arrivalDateTo?: IsoDate;
  /** Alguna salida en el rango. */
  exitDateFrom?: IsoDate;
  exitDateTo?: IsoDate;
  /** Nombre, apellidos o NIF de algún contacto de su historial (contiene). */
  contact?: string;
  /** Búsqueda libre: id exacto, nombre o chip. */
  q?: string;
}

export type AnimalSortField = 'id' | 'name' | 'arrivalDate' | 'exitDate' | 'bornAt' | 'updatedAt' | 'weightKg';

export interface AnimalSort {
  field: AnimalSortField;
  dir: 'asc' | 'desc';
}

export interface FilterContext {
  today: IsoDate;
  zones?: readonly Zone[];
  /** Necesario solo para el filtro `contact`. */
  contacts?: readonly Contact[];
}

export interface PageRequest {
  page?: number;
  pageSize?: number;
  sort?: AnimalSort;
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export const DEFAULT_PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 500;
export const DEFAULT_SORT: AnimalSort = { field: 'id', dir: 'desc' };

const anyInRange = (dates: readonly IsoDate[], from?: IsoDate, to?: IsoDate) =>
  dates.some((d) => (!from || d >= from) && (!to || d <= to));

/** Construye el predicado de los filtros (para reutilizarlo en listados, impresión y fichas masivas). */
export function animalPredicate(filters: AnimalFilters, ctx: FilterContext): (a: Animal) => boolean {
  const f = filters;
  const checks: ((a: Animal) => boolean)[] = [];
  const has = <K extends keyof AnimalFilters>(k: K) => f[k] !== undefined && f[k] !== null && f[k] !== '';

  if (has('id')) checks.push((a) => a.id === f.id);
  if (has('name')) checks.push((a) => includesFolded(a.name, f.name!));
  if (has('chip')) {
    const chip = f.chip!.replace(/\s/g, '');
    checks.push((a) => a.chip?.number.replace(/\s/g, '') === chip);
  }
  if (has('speciesId')) checks.push((a) => a.speciesId === f.speciesId);
  if (has('breedId')) checks.push((a) => a.breedId === f.breedId);
  if (has('gender')) checks.push((a) => a.gender === f.gender);
  if (has('color')) {
    const color = foldText(f.color!);
    checks.push((a) => !!a.color && foldText(a.color) === color);
  }
  if (has('size')) checks.push((a) => a.size === f.size);
  if (has('ppp')) checks.push((a) => a.ppp === f.ppp);
  if (has('weightMin')) checks.push((a) => a.weightKg !== undefined && a.weightKg >= f.weightMin!);
  if (has('weightMax')) checks.push((a) => a.weightKg !== undefined && a.weightKg <= f.weightMax!);
  if (has('ageMin')) {
    // Tiene al menos N años: nació en o antes de hoy − N años.
    const limit = addYears(ctx.today, -f.ageMin!);
    checks.push((a) => !!a.bornAt && a.bornAt <= limit);
  }
  if (has('ageMax')) {
    // Tiene como mucho N años: nació después de hoy − (N+1) años.
    const limit = addYears(ctx.today, -(f.ageMax! + 1));
    checks.push((a) => !!a.bornAt && a.bornAt > limit);
  }
  if (has('compatibleDogs')) checks.push((a) => a.compatibleDogs === f.compatibleDogs);
  if (has('compatibleCats')) checks.push((a) => a.compatibleCats === f.compatibleCats);
  if (has('arrivalCityId')) checks.push((a) => a.lastArrival?.cityId === f.arrivalCityId);
  if (has('arrivalZoneId')) {
    const cities = new Set(ctx.zones?.find((z) => z.id === f.arrivalZoneId)?.cityIds ?? []);
    checks.push((a) => !!a.lastArrival?.cityId && cities.has(a.lastArrival.cityId));
  }
  if (has('arrivalUserId')) checks.push((a) => a.lastArrival?.userId === f.arrivalUserId);
  if (has('arrivalSubtypeId')) checks.push((a) => a.lastArrival?.subtypeId === f.arrivalSubtypeId);
  if (has('sterilized')) checks.push((a) => a.sterilized === f.sterilized);
  if (has('illnessId')) checks.push((a) => a.illnessIds.includes(f.illnessId!));
  if (has('centerId')) checks.push((a) => a.centerId === f.centerId);
  if (has('statusId')) {
    checks.push((a) => a.statusId === f.statusId);
    if (has('statusDateFrom') || has('statusDateTo')) {
      checks.push((a) =>
        a.statusChanges.some(
          (c) =>
            c.statusId === f.statusId && (!f.statusDateFrom || c.date >= f.statusDateFrom) && (!f.statusDateTo || c.date <= f.statusDateTo),
        ),
      );
    }
  }
  if (has('visibleWeb')) checks.push((a) => a.visibleWeb === f.visibleWeb);
  if (has('hasChip')) checks.push((a) => !!a.chip === f.hasChip);
  if (has('hasPhoto')) checks.push((a) => a.hasPhoto === f.hasPhoto);
  if (has('arrivalDateFrom') || has('arrivalDateTo'))
    checks.push((a) => anyInRange(a.arrivalDates, f.arrivalDateFrom, f.arrivalDateTo));
  if (has('exitDateFrom') || has('exitDateTo')) checks.push((a) => anyInRange(a.exitDates, f.exitDateFrom, f.exitDateTo));
  if (has('contact')) {
    const ids = matchingContactIds(ctx.contacts ?? [], f.contact!);
    checks.push((a) => a.contactIds.some((id) => ids.has(id)));
  }
  if (has('q')) {
    const q = f.q!.trim();
    const asId = /^\d+$/.test(q) ? Number(q) : undefined;
    checks.push((a) => a.id === asId || includesFolded(a.name, q) || (!!a.chip && a.chip.number.includes(q)));
  }
  return (a) => checks.every((c) => c(a));
}

export function matchingContactIds(contacts: readonly Contact[], text: string): Set<ContactId> {
  const nif = normalizeNif(text);
  const out = new Set<ContactId>();
  for (const c of contacts) {
    if (includesFolded(contactFullName(c), text) || (nif && c.nif && c.nif.includes(nif))) out.add(c.id);
  }
  return out;
}

function sortValue(a: Animal, field: AnimalSortField): string | number | undefined {
  switch (field) {
    case 'id':
      return a.id;
    case 'name':
      return foldText(a.name);
    case 'arrivalDate':
      return a.lastArrival?.date;
    case 'exitDate':
      return a.lastExit?.date;
    case 'bornAt':
      return a.bornAt;
    case 'updatedAt':
      return a.updatedAt;
    case 'weightKg':
      return a.weightKg;
  }
}

/** Orden estable; los valores vacíos van siempre al final. Desempate por id descendente. */
export function sortAnimals(animals: readonly Animal[], sort: AnimalSort = DEFAULT_SORT): Animal[] {
  const mul = sort.dir === 'asc' ? 1 : -1;
  return [...animals].sort((x, y) => {
    const a = sortValue(x, sort.field);
    const b = sortValue(y, sort.field);
    if (a === undefined && b !== undefined) return 1;
    if (b === undefined && a !== undefined) return -1;
    if (a !== undefined && b !== undefined && a !== b) {
      const cmp = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b), 'es');
      if (cmp !== 0) return cmp * mul;
    }
    return y.id - x.id;
  });
}

export function paginate<T>(items: readonly T[], page = 1, pageSize = DEFAULT_PAGE_SIZE): Page<T> {
  const size = Math.min(Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const pages = Math.max(1, Math.ceil(items.length / size));
  const p = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { items: items.slice((p - 1) * size, p * size), total: items.length, page: p, pageSize: size, pages };
}

/** Filtra, ordena y pagina. */
export function filterAnimals(
  animals: readonly Animal[],
  filters: AnimalFilters,
  ctx: FilterContext,
  request: PageRequest = {},
): Page<Animal> {
  const pred = animalPredicate(filters, ctx);
  const sorted = sortAnimals(animals.filter(pred), request.sort ?? DEFAULT_SORT);
  return paginate(sorted, request.page, request.pageSize);
}
