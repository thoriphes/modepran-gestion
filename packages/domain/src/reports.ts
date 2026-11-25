/**
 * Informes (spec §6), equivalentes a `ReportsController` de la app vieja.
 *
 * Reglas comunes (las de la app vieja):
 * - Llegadas por fecha de recogida (= `date` del evento de llegada); salidas por fecha del evento.
 * - Especie y sexo, los actuales del animal.
 * - Filtros de zona/ciudad/centro sobre la ciudad y el centro **guardados en el evento** (las salidas
 *   copian la ciudad de la última llegada y el centro del que salen).
 * - Rangos de fechas inclusivos [from, to] (la app vieja excluía en algunos informes el último día por usar
 *   `to` a las 00:00; aquí se cuenta entero: decisión).
 */
import { catalogIndex, speciesGroup, type SpeciesGroup } from './catalogs.js';
import { censusAt, groupEventsByAnimal, type EventsByAnimal, type PlaceFilter } from './census.js';
import { addDays, addMonths, monthKey, monthLabel, monthsBetween, startOfMonth } from './dates.js';
import { compareEvents } from './events.js';
import type { Animal, AnimalId, CatalogId, DomainCatalogs, EventTypeCode, Gender, HistoryEvent, IsoDate } from './types.js';
import { CENSUS_STATUS_CODES } from './types.js';

export interface ReportFilter extends PlaceFilter {
  from: IsoDate;
  to: IsoDate;
}

export type ReportAnimal = Pick<Animal, 'id' | 'speciesId' | 'gender' | 'statusId'>;

function animalMap(animals: readonly ReportAnimal[]): Map<AnimalId, ReportAnimal> {
  return new Map(animals.map((a) => [a.id, a]));
}

/** Eventos de un tipo dentro del rango y del filtro de lugar. */
export function eventsInReport(events: readonly HistoryEvent[], typeId: EventTypeCode, filter: ReportFilter): HistoryEvent[] {
  const cities = filter.cityIds ? new Set(filter.cityIds) : undefined;
  return events.filter(
    (e) =>
      e.typeId === typeId &&
      e.date >= filter.from &&
      e.date <= filter.to &&
      (!cities || (e.cityId !== undefined && cities.has(e.cityId))) &&
      (!filter.centerId || e.centerId === filter.centerId),
  );
}

function sortedTotals(map: Map<CatalogId, number>): { id: CatalogId; total: number }[] {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id, total]) => ({ id, total }));
}

// ---------------------------------------------------------------------------
// Por mes × especie × sexo
// ---------------------------------------------------------------------------

export interface GenderCounts {
  male: number;
  female: number;
  none: number;
  total: number;
}
const zeroGender = (): GenderCounts => ({ male: 0, female: 0, none: 0, total: 0 });

export interface BySpeciesSexReport {
  /** 'YYYY-MM'. */
  months: string[];
  /** 'MM-YYYY' (como los gráficos viejos). */
  monthLabels: string[];
  /** Especies con algún evento en el rango, de más a menos. */
  species: { speciesId: CatalogId; total: number }[];
  rows: { month: string; bySpecies: Record<CatalogId, GenderCounts>; total: number }[];
  total: number;
}

export function bySpeciesSex(
  typeId: 'llegada' | 'salida',
  animals: readonly ReportAnimal[],
  events: readonly HistoryEvent[],
  filter: ReportFilter,
): BySpeciesSexReport {
  const byId = animalMap(animals);
  const months = monthsBetween(filter.from, filter.to);
  const rows = months.map((month) => ({ month, bySpecies: {} as Record<CatalogId, GenderCounts>, total: 0 }));
  const rowByMonth = new Map(rows.map((r) => [r.month, r]));
  const speciesTotals = new Map<CatalogId, number>();
  let total = 0;
  for (const e of eventsInReport(events, typeId, filter)) {
    const a = byId.get(e.animalId);
    const row = rowByMonth.get(monthKey(e.date));
    if (!a || !row) continue;
    const g = (row.bySpecies[a.speciesId] ??= zeroGender());
    g[a.gender]++;
    g.total++;
    row.total++;
    total++;
    speciesTotals.set(a.speciesId, (speciesTotals.get(a.speciesId) ?? 0) + 1);
  }
  const species = sortedTotals(speciesTotals).map(({ id, total }) => ({ speciesId: id, total }));
  // Todas las especies presentes en todas las filas (a cero), como la respuesta vieja.
  for (const r of rows) for (const s of species) r.bySpecies[s.speciesId] ??= zeroGender();
  return { months, monthLabels: months.map(monthLabel), species, rows, total };
}

export const arrivalsBySpeciesSex = (a: readonly ReportAnimal[], e: readonly HistoryEvent[], f: ReportFilter) =>
  bySpeciesSex('llegada', a, e, f);
export const exitsBySpeciesSex = (a: readonly ReportAnimal[], e: readonly HistoryEvent[], f: ReportFilter) =>
  bySpeciesSex('salida', a, e, f);

// ---------------------------------------------------------------------------
// Por mes × subtipo × especie
// ---------------------------------------------------------------------------

export interface BySubtypeReport {
  months: string[];
  monthLabels: string[];
  /** Total por mes. */
  monthTotals: number[];
  subtypes: { subtypeId: CatalogId; total: number }[];
  species: { speciesId: CatalogId; total: number }[];
  rows: {
    month: string;
    bySubtype: Record<CatalogId, { bySpecies: Record<CatalogId, number>; total: number }>;
    total: number;
  }[];
  total: number;
}

export function bySubtype(
  typeId: 'llegada' | 'salida',
  animals: readonly ReportAnimal[],
  events: readonly HistoryEvent[],
  filter: ReportFilter,
): BySubtypeReport {
  const byId = animalMap(animals);
  const months = monthsBetween(filter.from, filter.to);
  const rows = months.map((month) => ({ month, bySubtype: {} as BySubtypeReport['rows'][number]['bySubtype'], total: 0 }));
  const rowByMonth = new Map(rows.map((r) => [r.month, r]));
  const speciesTotals = new Map<CatalogId, number>();
  const subtypeTotals = new Map<CatalogId, number>();
  let total = 0;
  for (const e of eventsInReport(events, typeId, filter)) {
    const a = byId.get(e.animalId);
    const row = rowByMonth.get(monthKey(e.date));
    if (!a || !row) continue;
    const st = (row.bySubtype[e.subtypeId] ??= { bySpecies: {}, total: 0 });
    st.bySpecies[a.speciesId] = (st.bySpecies[a.speciesId] ?? 0) + 1;
    st.total++;
    row.total++;
    total++;
    speciesTotals.set(a.speciesId, (speciesTotals.get(a.speciesId) ?? 0) + 1);
    subtypeTotals.set(e.subtypeId, (subtypeTotals.get(e.subtypeId) ?? 0) + 1);
  }
  const species = sortedTotals(speciesTotals).map(({ id, total }) => ({ speciesId: id, total }));
  const subtypes = sortedTotals(subtypeTotals).map(({ id, total }) => ({ subtypeId: id, total }));
  for (const r of rows) {
    for (const st of subtypes) {
      const cell = (r.bySubtype[st.subtypeId] ??= { bySpecies: {}, total: 0 });
      for (const s of species) cell.bySpecies[s.speciesId] ??= 0;
    }
  }
  return {
    months,
    monthLabels: months.map(monthLabel),
    monthTotals: rows.map((r) => r.total),
    subtypes,
    species,
    rows,
    total,
  };
}

export const arrivalsBySubtype = (a: readonly ReportAnimal[], e: readonly HistoryEvent[], f: ReportFilter) =>
  bySubtype('llegada', a, e, f);
export const exitsBySubtype = (a: readonly ReportAnimal[], e: readonly HistoryEvent[], f: ReportFilter) =>
  bySubtype('salida', a, e, f);

// ---------------------------------------------------------------------------
// Censo mensual por especie (gráfico de informes)
// ---------------------------------------------------------------------------

export interface MonthlyCensusReport {
  months: string[];
  monthLabels: string[];
  species: { speciesId: CatalogId; total: number }[];
  rows: { month: string; date: IsoDate; bySpecies: Record<CatalogId, { total: number; host: number }>; total: number; totalHost: number }[];
}

export function monthlyCensusReport(
  animals: readonly Pick<Animal, 'id' | 'speciesId'>[],
  eventsByAnimal: EventsByAnimal,
  catalogs: DomainCatalogs,
  filter: ReportFilter,
): MonthlyCensusReport {
  const months = monthsBetween(filter.from, filter.to);
  const speciesTotals = new Map<CatalogId, number>();
  const rows = months.map((month) => {
    const end = addDays(addMonths(`${month}-01`, 1), -1);
    const date = end < filter.to ? end : filter.to;
    const c = censusAt(date, animals, eventsByAnimal, catalogs, filter);
    const bySpecies: MonthlyCensusReport['rows'][number]['bySpecies'] = {};
    for (const [sid, v] of Object.entries(c.bySpecies)) {
      bySpecies[sid] = { total: v.count, host: v.countHost };
      speciesTotals.set(sid, (speciesTotals.get(sid) ?? 0) + v.count);
    }
    return { month, date, bySpecies, total: c.total, totalHost: c.totalHost };
  });
  const species = sortedTotals(speciesTotals).map(({ id, total }) => ({ speciesId: id, total }));
  for (const r of rows) for (const s of species) r.bySpecies[s.speciesId] ??= { total: 0, host: 0 };
  return { months, monthLabels: months.map(monthLabel), species, rows };
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export interface Dashboard {
  available: number;
  months: { month: string; label: string; arrivals: number; exits: number }[];
}

/** Disponibles (estado actual) + entradas/salidas de los últimos 12 meses (el actual incluido). */
export function dashboard(
  animals: readonly Pick<Animal, 'statusId'>[],
  events: readonly HistoryEvent[],
  catalogs: DomainCatalogs,
  today: IsoDate,
): Dashboard {
  const idx = catalogIndex(catalogs);
  const available = animals.filter((a) => idx.statusCode(a.statusId) === 'disponible').length;
  const from = addMonths(startOfMonth(today), -11);
  const months = monthsBetween(from, today).map((month) => ({ month, label: monthLabel(month), arrivals: 0, exits: 0 }));
  const byMonth = new Map(months.map((m) => [m.month, m]));
  for (const e of events) {
    if (e.date < from || e.date > today) continue;
    const m = byMonth.get(monthKey(e.date));
    if (!m) continue;
    if (e.typeId === 'llegada') m.arrivals++;
    else if (e.typeId === 'salida') m.exits++;
  }
  return { available, months };
}

// ---------------------------------------------------------------------------
// Excel "Informe gestión"
// ---------------------------------------------------------------------------

export interface GestionCells {
  perro: { male: number; female: number };
  gato: { male: number; female: number };
  otros: { male: number; female: number };
  /** Animales con sexo "none": no tienen columna en el Excel viejo (se perdían); se dan aparte. */
  unknownGender: number;
}

export interface GestionRow extends GestionCells {
  subtypeId: CatalogId;
  name: string;
  /** Suma de las 6 columnas (= fórmula "Total" del Excel). */
  total: number;
}

export interface GestionTable {
  rows: GestionRow[];
  totals: GestionCells & { total: number };
}

export interface GestionExcelData {
  from: IsoDate;
  to: IsoDate;
  arrivals: GestionTable;
  exits: GestionTable;
}

/** Cabeceras del Excel (columna A = "Origen"). */
export const GESTION_HEADERS = [
  'Origen',
  'Perro Macho',
  'Perro Hembra',
  'Gato Macho',
  'Gato Hembra',
  'Otros Macho',
  'Otros Hembra',
  'Total Perros',
  'Total Gatos',
  'Total Otros',
  'Total Machos',
  'Total Hembras',
  'Total',
] as const;

const emptyCells = (): GestionCells => ({
  perro: { male: 0, female: 0 },
  gato: { male: 0, female: 0 },
  otros: { male: 0, female: 0 },
  unknownGender: 0,
});

function addTo(cells: GestionCells, group: SpeciesGroup, gender: Gender): void {
  if (gender === 'none') cells.unknownGender++;
  else cells[group][gender]++;
}

function cellsTotal(c: GestionCells): number {
  return c.perro.male + c.perro.female + c.gato.male + c.gato.female + c.otros.male + c.otros.female;
}

function buildGestionTable(
  events: readonly HistoryEvent[],
  animals: Map<AnimalId, ReportAnimal>,
  catalogs: DomainCatalogs,
): GestionTable {
  const idx = catalogIndex(catalogs);
  const rows = new Map<CatalogId, GestionRow>();
  const counts = new Map<CatalogId, number>();
  for (const e of events) {
    const a = animals.get(e.animalId);
    if (!a) continue;
    let row = rows.get(e.subtypeId);
    if (!row) {
      row = { subtypeId: e.subtypeId, name: idx.subtype(e.subtypeId)?.name ?? e.subtypeId, ...emptyCells(), total: 0 };
      rows.set(e.subtypeId, row);
    }
    counts.set(e.subtypeId, (counts.get(e.subtypeId) ?? 0) + 1);
    addTo(row, speciesGroup(idx.species(a.speciesId)), a.gender);
  }
  // Filas = subtipos con eventos, de más a menos eventos (como la app vieja).
  const ordered = [...rows.values()].sort(
    (x, y) => (counts.get(y.subtypeId) ?? 0) - (counts.get(x.subtypeId) ?? 0) || x.name.localeCompare(y.name, 'es'),
  );
  const totals = { ...emptyCells(), total: 0 };
  for (const r of ordered) {
    r.total = cellsTotal(r);
    for (const g of ['perro', 'gato', 'otros'] as const) {
      totals[g].male += r[g].male;
      totals[g].female += r[g].female;
    }
    totals.unknownGender += r.unknownGender;
  }
  totals.total = cellsTotal(totals);
  return { rows: ordered, totals };
}

/**
 * Datos del Excel "Informe gestión".
 * - Entradas: todas las llegadas del rango, por subtipo × Perro/Gato/Otros × sexo.
 * - Salidas: solo la **última salida de cada animal** (de todo su historial), si cae en el rango, y solo de
 *   animales cuyo estado actual no es disponible/acogida/acogida solidaria (los que han vuelto no cuentan).
 *   Decisión: la app vieja aplicaba esa regla a la lista de filas pero no a las cifras (consulta comentada),
 *   lo que descuadraba la tabla; aquí se aplica a ambas.
 */
export function gestionExcelData(
  animals: readonly ReportAnimal[],
  events: readonly HistoryEvent[],
  catalogs: DomainCatalogs,
  filter: ReportFilter,
): GestionExcelData {
  const idx = catalogIndex(catalogs);
  const byId = animalMap(animals);
  const arrivals = eventsInReport(events, 'llegada', filter);

  const lastExitByAnimal = new Map<AnimalId, HistoryEvent>();
  for (const e of events) {
    if (e.typeId !== 'salida') continue;
    const cur = lastExitByAnimal.get(e.animalId);
    if (!cur || compareEvents(e, cur) > 0) lastExitByAnimal.set(e.animalId, e);
  }
  const lastExitIds = new Set([...lastExitByAnimal.values()].map((e) => e.id));
  const exits = eventsInReport(events, 'salida', filter).filter((e) => {
    if (!lastExitIds.has(e.id)) return false;
    const code = idx.statusCode(byId.get(e.animalId)?.statusId);
    return !CENSUS_STATUS_CODES.includes(code as never);
  });

  return {
    from: filter.from,
    to: filter.to,
    arrivals: buildGestionTable(arrivals, byId, catalogs),
    exits: buildGestionTable(exits, byId, catalogs),
  };
}

/** Nombre del fichero/título del Excel de gestión (como el viejo; fechas d-m-Y). */
export function gestionExcelTitle(opts: { from: string; to: string; centerName?: string; zoneName?: string; cityName?: string }): string {
  return (
    'Informe gestión' +
    (opts.centerName ? ` en el centro ${opts.centerName}` : '') +
    ` del ${opts.from} al ${opts.to}` +
    (opts.zoneName ? ` en la zona ${opts.zoneName}` : '') +
    (opts.cityName ? ` en la ciudad ${opts.cityName}` : '')
  );
}

// ---------------------------------------------------------------------------
// Excel "Censo"
// ---------------------------------------------------------------------------

export interface CensusSnapshot {
  date: IsoDate;
  /** "REFUGIO" = total − acogida. */
  shelter: number;
  /** "ACOGIDA". */
  host: number;
  total: number;
}

export interface CensusExcelData {
  from: IsoDate;
  to: IsoDate;
  /** Censo a las 00:00 de `from` (= final del día anterior). */
  initial: CensusSnapshot;
  /** "+ ENTRADAS": llegadas del rango por subtipo, de más a menos. */
  arrivals: { subtypeId: CatalogId; name: string; count: number }[];
  /** "− SALIDAS": todas las salidas del rango por subtipo, de más a menos. */
  exits: { subtypeId: CatalogId; name: string; count: number }[];
  /** Censo a las 23:59 de `to`. */
  final: CensusSnapshot;
  arrivalsTotal: number;
  exitsTotal: number;
}

function countBySubtype(events: readonly HistoryEvent[], catalogs: DomainCatalogs) {
  const idx = catalogIndex(catalogs);
  const m = new Map<CatalogId, number>();
  for (const e of events) m.set(e.subtypeId, (m.get(e.subtypeId) ?? 0) + 1);
  return [...m.entries()]
    .map(([subtypeId, count]) => ({ subtypeId, name: idx.subtype(subtypeId)?.name ?? subtypeId, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));
}

/**
 * Datos del Excel "Censo": inicial (refugio + acogida) + entradas por subtipo − salidas por subtipo = final.
 * Nota: la igualdad solo es exacta si no hay movimientos que saquen o metan animales en el censo sin ser
 * llegada/salida (p. ej. un aviso de cadáver entra como llegada pero no cuenta en el censo). Es lo mismo que
 * hacía la app vieja.
 */
export function censusExcelData(
  animals: readonly Pick<Animal, 'id' | 'speciesId'>[],
  events: readonly HistoryEvent[] | EventsByAnimal,
  catalogs: DomainCatalogs,
  filter: ReportFilter,
): CensusExcelData {
  const byAnimal: EventsByAnimal = isEventsMap(events) ? events : groupEventsByAnimal(events);
  const flat: readonly HistoryEvent[] = isEventsMap(events) ? [...events.values()].flat() : events;
  const snap = (date: IsoDate, at: IsoDate): CensusSnapshot => {
    const c = censusAt(at, animals, byAnimal, catalogs, filter);
    return { date, shelter: c.totalShelter, host: c.totalHost, total: c.total };
  };
  const arrivals = countBySubtype(eventsInReport(flat, 'llegada', filter), catalogs);
  const exits = countBySubtype(eventsInReport(flat, 'salida', filter), catalogs);
  return {
    from: filter.from,
    to: filter.to,
    initial: snap(filter.from, addDays(filter.from, -1)),
    arrivals,
    exits,
    final: snap(filter.to, filter.to),
    arrivalsTotal: arrivals.reduce((s, r) => s + r.count, 0),
    exitsTotal: exits.reduce((s, r) => s + r.count, 0),
  };
}

function isEventsMap(x: readonly HistoryEvent[] | EventsByAnimal): x is EventsByAnimal {
  return x instanceof Map;
}

export function censusExcelTitle(opts: { from: string; to: string; centerName?: string; zoneName?: string; cityName?: string }): string {
  return (
    `Censo de ${opts.from} hasta ${opts.to}` +
    (opts.centerName ? ` en el centro ${opts.centerName}` : '') +
    (opts.zoneName ? ` en la zona ${opts.zoneName}` : '') +
    (opts.cityName ? ` en la ciudad ${opts.cityName}` : '')
  );
}
