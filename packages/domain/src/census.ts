/**
 * Censo calculado al vuelo (spec §6), equivalente a `FixCensusTable` de la app vieja.
 *
 * Censo de un día D = animales cuyo último evento no veterinario con fecha ≤ D los deja en
 * disponible / acogida / acogida solidaria. Se agrupa por especie, ciudad y centro de la **última llegada
 * anterior o igual a ese evento** (la app vieja toma ciudad y centro de esa llegada, no el centro actual).
 *
 * Diferencia con la app vieja (decisión): allí el censo de D se tomaba al inicio de D (eventos < D 00:00);
 * aquí es al final de D (eventos ≤ D), como dice el spec. Así "censo inicial" = censo del día anterior al
 * inicio del rango y "censo final" = censo del último día, y cuadra con entradas/salidas del rango.
 */
import { catalogIndex } from './catalogs.js';
import { addDays, endOfMonth, minDate, monthsBetween } from './dates.js';
import { compareEvents } from './events.js';
import type { Animal, AnimalId, CatalogId, DomainCatalogs, HistoryEvent, IsoDate } from './types.js';
import { CENSUS_STATUS_CODES, HOST_STATUS_CODES } from './types.js';

export interface PlaceFilter {
  /** Ciudades (una ciudad o las de una zona). */
  cityIds?: readonly CatalogId[];
  centerId?: CatalogId;
}

export interface CensusRow {
  speciesId: CatalogId;
  cityId: CatalogId | null;
  centerId: CatalogId | null;
  /** Total (incluye acogida). */
  count: number;
  /** De ellos, en acogida / acogida solidaria. */
  countHost: number;
}

export interface Census {
  date: IsoDate;
  rows: CensusRow[];
  total: number;
  totalHost: number;
  /** Total − acogida (columna "REFUGIO" del Excel). */
  totalShelter: number;
  bySpecies: Record<CatalogId, { count: number; countHost: number }>;
}

export type EventsByAnimal = ReadonlyMap<AnimalId, readonly HistoryEvent[]>;

export function groupEventsByAnimal(events: readonly HistoryEvent[]): Map<AnimalId, HistoryEvent[]> {
  const m = new Map<AnimalId, HistoryEvent[]>();
  for (const e of events) {
    let list = m.get(e.animalId);
    if (!list) m.set(e.animalId, (list = []));
    list.push(e);
  }
  for (const list of m.values()) list.sort(compareEvents);
  return m;
}

/** Situación de un animal al final del día `date` para el censo, o `undefined` si no cuenta. */
export function censusStateAt(
  events: readonly HistoryEvent[],
  date: IsoDate,
  catalogs: DomainCatalogs,
): { host: boolean; cityId: CatalogId | null; centerId: CatalogId | null } | undefined {
  const idx = catalogIndex(catalogs);
  let lastState: HistoryEvent | undefined;
  let arrivalForState: HistoryEvent | undefined;
  let lastArrivalSoFar: HistoryEvent | undefined;
  // `events` en orden cronológico.
  for (const e of events) {
    if (e.date > date) break;
    if (e.typeId === 'veterinario') continue;
    if (e.typeId === 'llegada') lastArrivalSoFar = e;
    lastState = e;
    arrivalForState = lastArrivalSoFar;
  }
  if (!lastState) return undefined;
  const code = idx.resultStatusCode(lastState.subtypeId);
  if (!code || !CENSUS_STATUS_CODES.includes(code as never)) return undefined;
  return {
    host: HOST_STATUS_CODES.includes(code as never),
    cityId: arrivalForState?.cityId ?? null,
    centerId: arrivalForState?.centerId ?? null,
  };
}

function isSorted(events: readonly HistoryEvent[]): boolean {
  for (let i = 1; i < events.length; i++) if (compareEvents(events[i - 1]!, events[i]!) > 0) return false;
  return true;
}

/** Censo al final del día `date`. `eventsByAnimal` puede venir de `groupEventsByAnimal`. */
export function censusAt(
  date: IsoDate,
  animals: readonly Pick<Animal, 'id' | 'speciesId'>[],
  eventsByAnimal: EventsByAnimal,
  catalogs: DomainCatalogs,
  filter: PlaceFilter = {},
): Census {
  const groups = new Map<string, CensusRow>();
  const cityFilter = filter.cityIds ? new Set(filter.cityIds) : undefined;
  for (const a of animals) {
    let events = eventsByAnimal.get(a.id);
    if (!events?.length) continue;
    if (!isSorted(events)) events = [...events].sort(compareEvents);
    const st = censusStateAt(events, date, catalogs);
    if (!st) continue;
    if (cityFilter && (st.cityId === null || !cityFilter.has(st.cityId))) continue;
    if (filter.centerId && st.centerId !== filter.centerId) continue;
    const key = `${a.speciesId}|${st.cityId ?? ''}|${st.centerId ?? ''}`;
    let row = groups.get(key);
    if (!row) {
      row = { speciesId: a.speciesId, cityId: st.cityId, centerId: st.centerId, count: 0, countHost: 0 };
      groups.set(key, row);
    }
    row.count++;
    if (st.host) row.countHost++;
  }
  const rows = [...groups.values()].sort(
    (x, y) =>
      x.speciesId.localeCompare(y.speciesId) ||
      (x.cityId ?? '').localeCompare(y.cityId ?? '') ||
      (x.centerId ?? '').localeCompare(y.centerId ?? ''),
  );
  const bySpecies: Census['bySpecies'] = {};
  let total = 0;
  let totalHost = 0;
  for (const r of rows) {
    total += r.count;
    totalHost += r.countHost;
    const s = (bySpecies[r.speciesId] ??= { count: 0, countHost: 0 });
    s.count += r.count;
    s.countHost += r.countHost;
  }
  return { date, rows, total, totalHost, totalShelter: total - totalHost, bySpecies };
}

export interface MonthlyCensusEntry {
  /** 'YYYY-MM'. */
  month: string;
  /** Día usado: último del mes, o `to` si el mes no ha terminado dentro del rango. */
  date: IsoDate;
  census: Census;
}

/** Censo mensual: el del último día de cada mes del rango (el último mes, hasta `to`). */
export function monthlyCensus(
  from: IsoDate,
  to: IsoDate,
  animals: readonly Pick<Animal, 'id' | 'speciesId'>[],
  eventsByAnimal: EventsByAnimal,
  catalogs: DomainCatalogs,
  filter: PlaceFilter = {},
): MonthlyCensusEntry[] {
  return monthsBetween(from, to).map((month) => {
    const date = minDate(endOfMonth(`${month}-01`), to);
    return { month, date, census: censusAt(date, animals, eventsByAnimal, catalogs, filter) };
  });
}

/** Censo al inicio de un día (= final del día anterior). */
export function censusAtStartOf(
  date: IsoDate,
  animals: readonly Pick<Animal, 'id' | 'speciesId'>[],
  eventsByAnimal: EventsByAnimal,
  catalogs: DomainCatalogs,
  filter: PlaceFilter = {},
): Census {
  return { ...censusAt(addDays(date, -1), animals, eventsByAnimal, catalogs, filter), date };
}
