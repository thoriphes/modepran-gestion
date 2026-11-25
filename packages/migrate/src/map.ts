/**
 * Mapeo de las tablas de la app vieja (Laravel/MariaDB) a objetos del dominio nuevo (spec §4 y §10).
 *
 * Decisiones (anotadas también en el informe de `parse`):
 * - Ids: se conservan los de animales, eventos y contactos (números). Los catálogos conservan su id viejo
 *   como cadena ("1", "2"…), salvo **estados y subtipos**, que usan su código estable como id (igual que las
 *   semillas del dominio: `DEFAULT_STATUSES` / `DEFAULT_SUBTYPES`). El personal (usuarios viejos) es
 *   `staff-<id>`.
 * - Estados: por nombre (sin tildes ni mayúsculas) contra `DEFAULT_STATUSES`.
 * - Subtipos: por **id viejo** (tabla `OLD_SUBTYPE_CODES`), y se comprueba que el nombre cuadra. Nombre y
 *   flags salen de `DEFAULT_SUBTYPES` (que corrige la errata "Esterlizado"); si los flags o el estado
 *   resultante de origen difieren, se anota como incidencia.
 * - Fecha del evento = día en Europe/Madrid de `collection_date ?? created_at`, como lo muestra la app vieja
 *   (que guarda la fecha elegida en `created_at` a medianoche de Madrid).
 * - `createdAt` del evento: la app vieja no guarda el instante real de alta (pisa `created_at` con la fecha
 *   del evento). Se usa `updated_at` ajustado para que sea no decreciente por id (mínimo de los
 *   `updated_at` de ese id en adelante): así el orden de registro es el de los ids, que es el orden real
 *   de inserción, y los desempates del dominio (`compareEvents`, `firstRegisteredEvent`) dan lo mismo que
 *   la app vieja (`max(id)` / `min(id)`).
 * - Trabajador y autor del evento = el usuario viejo (`staff-<id>`).
 * - Documento: `animals/<animalId>/events/<eventId>.<ext>` (spec §8) si existe el fichero en el índice de
 *   ficheros; si no se pasa índice, se asume que existe y se marca en las incidencias.
 * - Contactos: tipo (`kind`) derivado de los subtipos de sus eventos; NIF normalizado; "SIN DATOS"
 *   marcado con `special: 'sin_datos'` (no participa en la unicidad de NIF).
 * - Chip: `owner`/`phone` vacíos se completan con `tmp_owner`/`tmp_phone` (restos de una importación vieja).
 * - Peso 0 = sin peso.
 */
import {
  computeDerived,
  contactKindForSubtype,
  addContactKind,
  collapseSpaces,
  DEFAULT_STATUSES,
  DEFAULT_SUBTYPES,
  foldText,
  isSinDatos,
  madridDate,
  normalizeNif,
  slugify,
  TEMPLATE_SLUGS,
  withDerived,
  type Animal,
  type Breed,
  type CatalogId,
  type Center,
  type Chip,
  type City,
  type Colony,
  type Contact,
  type DomainCatalogs,
  type EventTypeCode,
  type Gender,
  type HistoryEvent,
  type Illness,
  type KnownSubtypeCode,
  type Size,
  type Species,
  type Staff,
  type Status,
  type Subtype,
  type SubtypeFlags,
  type Template,
  type TemplateSlug,
  type Vaccine,
  type Zone,
} from '@modepran/domain';
import type { SqlRow, SqlValue } from './sql-parser.js';

// ---------------------------------------------------------------------------
// Tablas
// ---------------------------------------------------------------------------

/** Tablas que se migran. */
export const MIGRATED_TABLES = [
  'species',
  'species_breed',
  'cities',
  'zones',
  'zones_cities',
  'centers',
  'animals_status',
  'animals_history_types',
  'animals_history_types_subtypes',
  'vaccines',
  'illnesses',
  'colonies',
  'users',
  'animals',
  'animals_chips',
  'animals_history',
  'contacts',
  'document_print_templates',
  'documents',
] as const;

/** Tablas que se descartan siempre (derivadas, logs o de Laravel). */
export const DISCARDED_TABLES = [
  'history_census',
  'history_census2',
  'logs_errors',
  'failed_jobs',
  'password_resets',
  'personal_access_tokens',
  'migrations',
] as const;

export type SourceTables = Partial<Record<string, SqlRow[]>>;

/** Subtipos de la app vieja por id → código estable del dominio (los 29 de producción). */
export const OLD_SUBTYPE_CODES: Record<number, KnownSubtypeCode> = {
  1: 'aviso',
  2: 'aviso_cadaver',
  3: 'aviso_enfermo_herido',
  4: 'devolucion_desde_adopcion',
  5: 'adopcion',
  6: 'defuncion',
  7: 'dueno',
  8: 'colonia',
  9: 'eutanasia',
  10: 'cadaver',
  11: 'otras_asociaciones',
  12: 'desparasitacion',
  13: 'enfermedad',
  14: 'intervencion',
  15: 'vacuna',
  16: 'documento',
  17: 'esterilizado',
  18: 'ingreso',
  19: 'test',
  20: 'especialista',
  21: 'acogida',
  22: 'acogida_solidaria',
  23: 'ingreso_revision',
  24: 'aviso_chip',
  25: 'gato_colonia',
  26: 'devolucion_desde_acogida',
  27: 'perdido',
  28: 'devolucion_otras_asociaciones',
  29: 'devolucion_responsable_legal',
};

/** Nombres viejos con erratas que se aceptan como equivalentes. */
const SUBTYPE_NAME_ALIASES: Record<string, string> = { esterlizado: 'esterilizado' };

const TYPE_CODES_BY_NAME: Record<string, EventTypeCode> = {
  llegada: 'llegada',
  salida: 'salida',
  veterinario: 'veterinario',
  movimientos: 'movimientos',
};

const TEMPLATE_NAMES: Record<TemplateSlug, string> = {
  llegada: 'Llegada',
  adopcion: 'Contrato de adopción',
  dueno: 'Salida a dueño',
  eutanasia: 'Eutanasia',
  acogida: 'Contrato de acogida',
  veterinario: 'Veterinario',
  ficha: 'Ficha',
};

export const MIGRATION_USER = 'migracion';

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export interface MigratedContact extends Contact {
  /** Contacto especial para avisantes desconocidos (regla 6). */
  special?: 'sin_datos';
}

export interface MigratedCatalogs {
  species: Species[];
  breeds: Breed[];
  cities: City[];
  zones: Zone[];
  centers: Center[];
  statuses: Status[];
  subtypes: Subtype[];
  vaccines: Vaccine[];
  illnesses: Illness[];
  colonies: Colony[];
}

/** Incidencias agregadas: código → número de casos y algunos ids de ejemplo (ids internos, nunca datos personales). */
export type Issues = Record<string, { count: number; sampleIds: (number | string)[]; note?: string }>;

export interface MigrationResult {
  catalogs: MigratedCatalogs;
  staff: Staff[];
  animals: Animal[];
  events: HistoryEvent[];
  contacts: MigratedContact[];
  templates: Template[];
  /** Siguiente id por entidad (para los contadores de la API: no reutilizar ids viejos). */
  counters: Record<string, number>;
  /** Grupos de ids de contactos que comparten NIF (sin el NIF). `bulkImport` los importa sin guardián de unicidad. */
  duplicateNifGroups: number[][];
  issues: Issues;
}

export interface MapOptions {
  /**
   * Ficheros que existen bajo `storage/app/public` (rutas relativas, p. ej. `animals/12/345.pdf`).
   * Si se omite, se asume que existen todos los adjuntos.
   */
  fileIndex?: ReadonlySet<string>;
  /** AUTO_INCREMENT de cada tabla (del CREATE TABLE), para los contadores. */
  autoIncrement?: Record<string, number | undefined>;
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

class IssueLog {
  readonly issues: Issues = {};
  add(code: string, id?: number | string, note?: string): void {
    const i = (this.issues[code] ??= { count: 0, sampleIds: [] });
    i.count++;
    if (id !== undefined && i.sampleIds.length < 10) i.sampleIds.push(id);
    if (note && !i.note) i.note = note;
  }
}

function str(v: SqlValue | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Uint8Array) return Buffer.from(v).toString('utf8');
  const s = collapseSpaces(String(v));
  return s === '' ? undefined : s;
}

/** Texto multilínea (notas): conserva saltos de línea, recorta extremos. */
function text(v: SqlValue | undefined): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).replace(/\r\n/g, '\n').trim();
  return s === '' ? undefined : s;
}

function num(v: SqlValue | undefined): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function bool(v: SqlValue | undefined): boolean {
  return num(v) === 1;
}

function idStr(v: SqlValue | undefined): string | undefined {
  const n = num(v);
  return n === undefined ? undefined : String(n);
}

/** Timestamp de MariaDB ('YYYY-MM-DD HH:MM:SS', en UTC porque el volcado fija TIME_ZONE='+00:00') → ISO. */
export function sqlTimestampToIso(v: SqlValue | undefined): string | undefined {
  const s = str(v);
  if (!s || s.startsWith('0000-00-00')) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2})(\.\d+)?)?$/.exec(s);
  if (!m) return undefined;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)));
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

function sqlTimestampToMadridDate(v: SqlValue | undefined): string | undefined {
  const iso = sqlTimestampToIso(v);
  return iso ? madridDate(iso) : undefined;
}

function staffId(oldUserId: number | undefined): string | undefined {
  return oldUserId === undefined ? undefined : `staff-${oldUserId}`;
}

function maxId(rows: SqlRow[] | undefined): number {
  let m = 0;
  for (const r of rows ?? []) m = Math.max(m, num(r.id) ?? 0);
  return m;
}

function speciesCode(name: string): string {
  const f = foldText(name);
  if (f === 'perro' || f === 'perros') return 'perro';
  if (f === 'gato' || f === 'gatos') return 'gato';
  return slugify(name);
}

function extOf(name: string): string {
  const parts = name.split('.');
  return parts.length > 1 ? parts[parts.length - 1]!.toLowerCase() : '';
}

/**
 * Busca el adjunto de un evento en el índice: `animals/<a>/<h>.<ext>` con la extensión del nombre original
 * (la app vieja guarda con la extensión que deduce del MIME y lee con la del nombre original: pueden no
 * coincidir, p. ej. `jpeg`/`jpg`), o cualquier `<h>.*` de esa carpeta.
 */
export function findEventFile(index: ReadonlySet<string>, animalId: number, eventId: number, docName: string): string | undefined {
  const ext = extOf(docName);
  const dir = `animals/${animalId}/`;
  const candidates = [ext, ext.toUpperCase(), ext === 'jpeg' ? 'jpg' : ext === 'jpg' ? 'jpeg' : ''].filter(Boolean);
  for (const e of candidates) {
    const p = `${dir}${eventId}.${e}`;
    if (index.has(p)) return p;
  }
  const byPrefix = eventFilesByPrefix(index).get(`${dir}${eventId}`);
  return byPrefix?.[0];
}

const prefixCache = new WeakMap<ReadonlySet<string>, Map<string, string[]>>();
function eventFilesByPrefix(index: ReadonlySet<string>): Map<string, string[]> {
  let m = prefixCache.get(index);
  if (!m) {
    m = new Map();
    for (const p of index) {
      const r = /^(animals\/\d+\/\d+)\.[^/]+$/.exec(p);
      if (r) {
        const list = m.get(r[1]!) ?? [];
        list.push(p);
        m.set(r[1]!, list);
      }
    }
    prefixCache.set(index, m);
  }
  return m;
}

export function eventDocumentKey(animalId: number, eventId: number, ext: string): string {
  return `animals/${animalId}/events/${eventId}${ext ? `.${ext.toLowerCase()}` : ''}`;
}

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

interface CatalogMaps {
  catalogs: MigratedCatalogs;
  statusByOldId: Map<number, string>;
  subtypeByOldId: Map<number, Subtype>;
  typeByOldId: Map<number, EventTypeCode>;
  cityNameById: Map<string, string>;
}

function simpleCatalog<T extends { id: CatalogId; name: string; active: boolean }>(
  rows: SqlRow[] | undefined,
  nameCol: string,
  log: IssueLog,
  table: string,
): T[] {
  const out: T[] = [];
  for (const r of rows ?? []) {
    const id = idStr(r.id);
    const name = str(r[nameCol]);
    if (!id) continue;
    if (!name) log.add(`${table}.sin_nombre`, id);
    out.push({ id, name: name ?? `(sin nombre ${id})`, active: true } as T);
  }
  return out;
}

function mapCatalogs(src: SourceTables, log: IssueLog): CatalogMaps {
  // Estados por nombre.
  const statusByFolded = new Map(DEFAULT_STATUSES.map((s) => [foldText(s.name), s]));
  const statusByOldId = new Map<number, string>();
  const statuses: Status[] = DEFAULT_STATUSES.map((s) => ({ ...s }));
  for (const r of src.animals_status ?? []) {
    const id = num(r.id)!;
    const name = str(r.status) ?? '';
    const known = statusByFolded.get(foldText(name));
    if (known) statusByOldId.set(id, known.code);
    else {
      // Estado nuevo creado en la app vieja: se conserva con un código derivado del nombre.
      const code = slugify(name) || `estado_${id}`;
      statuses.push({ id: code, code, name, active: true });
      statusByOldId.set(id, code);
      log.add('animals_status.desconocido', id, 'Estado que no está en DEFAULT_STATUSES: se crea con código slug.');
    }
  }

  // Tipos por nombre.
  const typeByOldId = new Map<number, EventTypeCode>();
  for (const r of src.animals_history_types ?? []) {
    const code = TYPE_CODES_BY_NAME[foldText(str(r.type) ?? '')];
    if (code) typeByOldId.set(num(r.id)!, code);
    else log.add('animals_history_types.desconocido', num(r.id));
  }

  // Subtipos por id viejo.
  const defaults = new Map(DEFAULT_SUBTYPES.map((s) => [s.code, s]));
  const subtypeByOldId = new Map<number, Subtype>();
  const subtypes: Subtype[] = [];
  const flagCols: [keyof SubtypeFlags, string][] = [
    ['user', 'user'],
    ['contact', 'contact'],
    ['center', 'center'],
    ['notes', 'notes'],
    ['vaccine', 'vaccine'],
    ['illness', 'illness'],
    ['colony', 'colony'],
    ['date', 'date'],
    ['docGenerate', 'doc_generate'],
    ['docUpload', 'doc_upload'],
    ['switch', 'option_switch'],
  ];
  for (const r of src.animals_history_types_subtypes ?? []) {
    const oldId = num(r.id)!;
    const oldName = str(r.subtype) ?? '';
    const oldType = typeByOldId.get(num(r.history_type_id) ?? -1);
    const code = OLD_SUBTYPE_CODES[oldId];
    const seed = code ? defaults.get(code) : undefined;
    const folded = foldText(oldName);
    const nameOk = seed && (foldText(seed.name) === folded || SUBTYPE_NAME_ALIASES[folded] === foldText(seed.name));
    if (seed && nameOk && oldType === seed.typeId) {
      const st: Subtype = { ...seed };
      const diffs = flagCols.filter(([k, col]) => bool(r[col]) !== seed[k]).map(([k]) => k);
      const oldStatus = statusByOldId.get(num(r.animal_status_id) ?? -1);
      if (diffs.length) log.add('subtipo.flags_distintos', oldId, `flags: ${diffs.join(', ')}`);
      if (oldStatus !== seed.resultStatusId) log.add('subtipo.estado_distinto', oldId);
      subtypes.push(st);
      subtypeByOldId.set(oldId, st);
      continue;
    }
    // Subtipo que no reconocemos: se conserva con sus flags de origen.
    log.add('subtipo.desconocido', oldId, 'Subtipo que no cuadra con OLD_SUBTYPE_CODES: se crea con sus flags de origen.');
    const slug = slugify(oldName) || `subtipo_${oldId}`;
    const st: Subtype = {
      id: defaults.has(slug as KnownSubtypeCode) ? `${slug}_${oldId}` : slug,
      code: defaults.has(slug as KnownSubtypeCode) ? `${slug}_${oldId}` : slug,
      name: oldName,
      typeId: oldType ?? 'movimientos',
      active: true,
      ...(Object.fromEntries(flagCols.map(([k, col]) => [k, bool(r[col])])) as unknown as SubtypeFlags),
    };
    const rs = statusByOldId.get(num(r.animal_status_id) ?? -1);
    if (rs) st.resultStatusId = rs;
    const sl = str(r.option_switch_string);
    if (sl) st.switchLabel = sl;
    subtypes.push(st);
    subtypeByOldId.set(oldId, st);
  }
  // Los subtipos del dominio que no estén en origen (no debería pasar) se añaden igualmente.
  for (const s of DEFAULT_SUBTYPES) {
    if (!subtypes.some((x) => x.id === s.id)) {
      subtypes.push({ ...s });
      log.add('subtipo.no_en_origen', s.code);
    }
  }

  const species: Species[] = simpleCatalog<Species>(src.species, 'specie', log, 'species').map((s) => ({
    ...s,
    code: speciesCode(s.name),
  }));
  const speciesIds = new Set(species.map((s) => s.id));
  const breeds: Breed[] = [];
  for (const r of src.species_breed ?? []) {
    const id = idStr(r.id);
    if (!id) continue;
    const speciesId = idStr(r.specie_id);
    if (!speciesId || !speciesIds.has(speciesId)) log.add('species_breed.sin_especie', id);
    breeds.push({ id, name: str(r.breed) ?? `(sin nombre ${id})`, speciesId: speciesId ?? '', active: true });
  }
  const cities = simpleCatalog<City>(src.cities, 'city', log, 'cities');
  const cityIds = new Set(cities.map((c) => c.id));
  const zones: Zone[] = simpleCatalog<Zone>(src.zones, 'zone', log, 'zones').map((z) => ({ ...z, cityIds: [] }));
  const zoneById = new Map(zones.map((z) => [z.id, z]));
  for (const r of src.zones_cities ?? []) {
    const z = zoneById.get(idStr(r.zone_id) ?? '');
    const c = idStr(r.city_id);
    if (!z || !c || !cityIds.has(c)) {
      log.add('zones_cities.huerfana', num(r.id));
      continue;
    }
    if (!z.cityIds.includes(c)) z.cityIds.push(c);
  }
  const centers: Center[] = simpleCatalog<Center>(src.centers, 'name', log, 'centers').map((c) => ({ ...c, code: slugify(c.name) }));

  const catalogs: MigratedCatalogs = {
    species,
    breeds,
    cities,
    zones,
    centers,
    statuses,
    subtypes,
    vaccines: simpleCatalog<Vaccine>(src.vaccines, 'vaccine', log, 'vaccines'),
    illnesses: simpleCatalog<Illness>(src.illnesses, 'illness', log, 'illnesses'),
    colonies: simpleCatalog<Colony>(src.colonies, 'colony', log, 'colonies'),
  };
  return {
    catalogs,
    statusByOldId,
    subtypeByOldId,
    typeByOldId,
    cityNameById: new Map(cities.map((c) => [c.id, c.name])),
  };
}

// ---------------------------------------------------------------------------
// Mapeo completo
// ---------------------------------------------------------------------------

export function mapSource(src: SourceTables, opts: MapOptions = {}): MigrationResult {
  const log = new IssueLog();
  const maps = mapCatalogs(src, log);
  const { catalogs } = maps;
  const domainCatalogs: DomainCatalogs = {
    statuses: catalogs.statuses,
    subtypes: catalogs.subtypes,
    species: catalogs.species,
    zones: catalogs.zones,
  };
  const has = <T extends { id: CatalogId }>(list: T[]) => {
    const s = new Set(list.map((x) => x.id));
    return (id: string | undefined) => id !== undefined && s.has(id);
  };
  const hasCenter = has(catalogs.centers);
  const hasSpecies = has(catalogs.species);
  const hasBreed = has(catalogs.breeds);
  const hasVaccine = has(catalogs.vaccines);
  const hasIllness = has(catalogs.illnesses);
  const hasColony = has(catalogs.colonies);
  const hasCity = has(catalogs.cities);

  // Personal (usuarios viejos): sin emails ni contraseñas.
  const staff: Staff[] = (src.users ?? []).map((r) => ({
    id: staffId(num(r.id))!,
    name: str(r.name) ?? `Usuario ${num(r.id)}`,
    active: !bool(r.deleted),
    roles: [],
  }));
  const staffIds = new Set(staff.map((s) => s.id));

  // Chips.
  const chipById = new Map<number, SqlRow>();
  for (const r of src.animals_chips ?? []) chipById.set(num(r.id)!, r);

  // Contactos (sin `kind` todavía).
  const contacts: MigratedContact[] = [];
  const contactById = new Map<number, MigratedContact>();
  for (const r of src.contacts ?? []) {
    const id = num(r.id)!;
    const c: MigratedContact = {
      id,
      name: str(r.name) ?? '',
      kind: [],
      createdAt: sqlTimestampToIso(r.created_at) ?? sqlTimestampToIso(r.updated_at) ?? '1970-01-01T00:00:00.000Z',
    };
    if (!c.name) log.add('contacto.sin_nombre', id);
    const surname = str(r.surname);
    if (surname) c.surname = surname;
    const nif = normalizeNif(str(r.nif));
    if (nif) c.nif = nif;
    const address = str(r.address);
    if (address) c.address = address;
    const zip = str(r.zip);
    if (zip) c.zip = zip;
    const province = str(r.state);
    if (province) c.province = province;
    const cityId = idStr(r.city_id);
    if (cityId) {
      if (hasCity(cityId)) {
        c.cityId = cityId;
        c.cityName = maps.cityNameById.get(cityId)!;
      } else log.add('contacto.ciudad_inexistente', id);
    }
    const phone = str(r.phone);
    if (phone) c.phone = phone;
    const email = str(r.email)?.toLowerCase();
    if (email) c.email = email;
    if (isSinDatos(c)) c.special = 'sin_datos';
    contacts.push(c);
    contactById.set(id, c);
  }

  // Eventos. `createdAt` no decreciente por id (ver cabecera).
  const historyRows = [...(src.animals_history ?? [])].sort((a, b) => num(a.id)! - num(b.id)!);
  const createdAtById = new Map<number, string>();
  let running: string | undefined;
  for (let i = historyRows.length - 1; i >= 0; i--) {
    const r = historyRows[i]!;
    const upd = sqlTimestampToIso(r.updated_at) ?? sqlTimestampToIso(r.created_at);
    if (upd && (!running || upd < running)) running = upd;
    createdAtById.set(num(r.id)!, running ?? upd ?? '1970-01-01T00:00:00.000Z');
  }

  const animalIds = new Set((src.animals ?? []).map((r) => num(r.id)!));
  const eventsByAnimal = new Map<number, HistoryEvent[]>();
  const events: HistoryEvent[] = [];
  for (const r of historyRows) {
    const id = num(r.id)!;
    const animalId = num(r.animal_id)!;
    if (!animalIds.has(animalId)) {
      log.add('evento.sin_animal', id);
      continue;
    }
    const subtype = maps.subtypeByOldId.get(num(r.history_subtype_id) ?? -1);
    if (!subtype) {
      log.add('evento.subtipo_inexistente', id);
      continue;
    }
    const oldType = maps.typeByOldId.get(num(r.history_type_id) ?? -1);
    if (oldType !== subtype.typeId) log.add('evento.tipo_no_cuadra_con_subtipo', id, 'Se usa el tipo del subtipo.');
    const date = sqlTimestampToMadridDate(r.collection_date) ?? sqlTimestampToMadridDate(r.created_at);
    if (!date) {
      log.add('evento.sin_fecha', id);
      continue;
    }
    const worker = staffId(num(r.user_id));
    if (worker && !staffIds.has(worker)) log.add('evento.usuario_inexistente', id);
    const e: HistoryEvent = {
      id,
      animalId,
      typeId: subtype.typeId,
      subtypeId: subtype.id,
      date,
      createdAt: createdAtById.get(id)!,
      createdBy: worker ?? MIGRATION_USER,
    };
    if (worker) e.userId = worker;
    const contactId = num(r.contact_id);
    if (contactId !== undefined) {
      if (contactById.has(contactId)) e.contactId = contactId;
      else log.add('evento.contacto_inexistente', id);
    }
    const ref = (col: string, ok: (v: string | undefined) => boolean, issue: string): string | undefined => {
      const v = idStr(r[col]);
      if (v === undefined) return undefined;
      if (ok(v)) return v;
      log.add(issue, id);
      return undefined;
    };
    const centerId = ref('center_id', hasCenter, 'evento.centro_inexistente');
    if (centerId) e.centerId = centerId;
    const vaccineId = ref('vaccine_id', hasVaccine, 'evento.vacuna_inexistente');
    if (vaccineId) e.vaccineId = vaccineId;
    const illnessId = ref('illness_id', hasIllness, 'evento.enfermedad_inexistente');
    if (illnessId) e.illnessId = illnessId;
    const colonyId = ref('colony_id', hasColony, 'evento.colonia_inexistente');
    if (colonyId) e.colonyId = colonyId;
    const cityId = ref('city_id', hasCity, 'evento.ciudad_inexistente');
    if (cityId) {
      e.cityId = cityId;
      e.cityName = maps.cityNameById.get(cityId)!;
    }
    const address = str(r.collection_address);
    if (address) e.address = address;
    const zip = str(r.collection_zip);
    if (zip) e.zip = zip;
    const collectionDate = sqlTimestampToMadridDate(r.collection_date);
    if (collectionDate) e.collectionDate = collectionDate;
    const notes = text(r.notes);
    if (notes) e.notes = notes;
    const activated = num(r.activated);
    if (activated !== undefined) e.switchValue = activated === 1;
    const docName = str(r.doc_name);
    if (docName) {
      if (opts.fileIndex) {
        const found = findEventFile(opts.fileIndex, animalId, id, docName);
        if (found) e.document = { key: eventDocumentKey(animalId, id, extOf(found)), originalName: docName };
        else log.add('evento.adjunto_ausente', id, 'doc_name sin fichero en storage: se omite el documento.');
      } else {
        e.document = { key: eventDocumentKey(animalId, id, extOf(docName)), originalName: docName };
        log.add('evento.adjunto_sin_comprobar', id, 'Sin índice de ficheros: no se comprobó que el adjunto exista.');
      }
    }
    events.push(e);
    const list = eventsByAnimal.get(animalId) ?? [];
    list.push(e);
    eventsByAnimal.set(animalId, list);

    // Tipo de contacto derivado.
    if (e.contactId !== undefined) {
      const c = contactById.get(e.contactId)!;
      c.kind = addContactKind(c.kind, contactKindForSubtype(subtype));
    }
  }

  // Animales.
  const chipUsers = new Map<number, number[]>();
  const chipNumbers = new Map<string, number[]>();
  const animals: Animal[] = [];
  for (const r of src.animals ?? []) {
    const id = num(r.id)!;
    const speciesId = idStr(r.specie_id) ?? '';
    if (!hasSpecies(speciesId)) log.add('animal.especie_inexistente', id);
    const gender = (str(r.gender) ?? 'none') as Gender;
    const createdAt = sqlTimestampToIso(r.created_at) ?? '1970-01-01T00:00:00.000Z';
    const a: Animal = {
      id,
      name: str(r.name) ?? '',
      speciesId,
      gender: (['male', 'female', 'none'] as const).includes(gender) ? gender : 'none',
      sterilized: bool(r.sterilized),
      ppp: bool(r.ppp),
      visibleWeb: bool(r.visible_web),
      compatibleDogs: bool(r.compatible_dogs),
      compatibleCats: bool(r.compatible_cats),
      hasPhoto: bool(r.photo),
      createdAt,
      updatedAt: sqlTimestampToIso(r.updated_at) ?? createdAt,
      illnessIds: [],
      contactIds: [],
      arrivalDates: [],
      exitDates: [],
      statusChanges: [],
    };
    if (!a.name) log.add('animal.sin_nombre', id);
    const breedId = idStr(r.breed_id);
    if (breedId) {
      if (hasBreed(breedId)) a.breedId = breedId;
      else log.add('animal.raza_inexistente', id);
    }
    const color = str(r.color);
    if (color) a.color = color;
    const weight = num(r.weight);
    if (weight !== undefined && weight > 0) a.weightKg = weight;
    else log.add('animal.sin_peso', id);
    const size = str(r.size) as Size | undefined;
    if (size && ['small', 'medium', 'big'].includes(size)) a.size = size;
    const bornAt = sqlTimestampToMadridDate(r.born_at);
    if (bornAt) a.bornAt = bornAt;
    const centerId = idStr(r.center_id);
    if (centerId) {
      if (hasCenter(centerId)) a.centerId = centerId;
      else log.add('animal.centro_inexistente', id);
    }
    const statusId = maps.statusByOldId.get(num(r.status_id) ?? -1);
    if (statusId) a.statusId = statusId;
    else log.add('animal.estado_inexistente', id);

    const chipId = num(r.chip_id);
    if (chipId !== undefined) {
      const chipRow = chipById.get(chipId);
      if (!chipRow) log.add('animal.chip_inexistente', id);
      else {
        chipUsers.set(chipId, [...(chipUsers.get(chipId) ?? []), id]);
        const number = str(chipRow.number)?.replace(/\s+/g, '');
        if (!number) log.add('chip.sin_numero', chipId);
        else {
          const chip: Chip = { number };
          const passport = str(chipRow.passport);
          if (passport) chip.passport = passport;
          const owner = str(chipRow.owner) ?? str(chipRow.tmp_owner);
          if (owner) chip.owner = owner;
          const phone = str(chipRow.phone) ?? str(chipRow.tmp_phone);
          if (phone) chip.phone = phone;
          const notes = text(chipRow.notes);
          if (notes) chip.notes = notes;
          if (!str(chipRow.owner) && str(chipRow.tmp_owner)) log.add('chip.owner_desde_tmp', chipId);
          if (!str(chipRow.phone) && str(chipRow.tmp_phone)) log.add('chip.phone_desde_tmp', chipId);
          a.chip = chip;
          const key = number.toUpperCase();
          chipNumbers.set(key, [...(chipNumbers.get(key) ?? []), id]);
        }
      }
    }

    const evs = eventsByAnimal.get(id) ?? [];
    if (!evs.length) log.add('animal.sin_eventos', id);
    animals.push(withDerived(a, computeDerived(evs, domainCatalogs)));
  }
  for (const [chipId, users] of chipUsers) if (users.length > 1) log.add('chip.compartido_por_varios_animales', chipId);
  for (const [, users] of chipNumbers) if (users.length > 1) log.add('chip.numero_duplicado', users[0]);
  for (const r of src.animals_chips ?? []) if (!chipUsers.has(num(r.id)!)) log.add('chip.sin_animal', num(r.id));

  // Contactos sin eventos y NIF duplicados.
  const used = new Set(events.flatMap((e) => (e.contactId !== undefined ? [e.contactId] : [])));
  const byNif = new Map<string, number[]>();
  for (const c of contacts) {
    if (!used.has(c.id)) log.add('contacto.sin_eventos', c.id);
    if (c.special) continue;
    if (c.nif) byNif.set(c.nif, [...(byNif.get(c.nif) ?? []), c.id]);
  }
  const duplicateNifGroups = [...byNif.values()].filter((g) => g.length > 1).map((g) => g.sort((x, y) => x - y));
  for (const g of duplicateNifGroups) log.add('contacto.nif_duplicado', g[0]);
  const sinDatos = contacts.filter((c) => c.special);
  if (sinDatos.length !== 1) log.add('contacto.sin_datos_no_unico', sinDatos[0]?.id, `${sinDatos.length} contactos "SIN DATOS"`);

  // Plantillas (solo si alguien las editó en la app vieja).
  const templates: Template[] = [];
  for (const r of src.document_print_templates ?? []) {
    const slug = str(r.slug) as TemplateSlug | undefined;
    if (!slug || !(TEMPLATE_SLUGS as readonly string[]).includes(slug)) {
      log.add('plantilla.slug_desconocido', num(r.id));
      continue;
    }
    let legalTexts: Record<string, string> = {};
    const raw = text(r.translation_overrides);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        legalTexts = Object.fromEntries(
          Object.entries(parsed)
            .filter(([, v]) => typeof v === 'string')
            .map(([k, v]) => [k.toLowerCase().replace(/^lang_/, ''), v as string]),
        );
      } catch {
        log.add('plantilla.overrides_no_json', num(r.id));
      }
    }
    templates.push({
      slug,
      name: TEMPLATE_NAMES[slug],
      bodyFilled: text(r.body_filled) ?? '',
      bodyBlank: text(r.body_blank) ?? '',
      legalTexts,
      updatedAt: sqlTimestampToIso(r.updated_at) ?? sqlTimestampToIso(r.created_at) ?? new Date(0).toISOString(),
      updatedBy: MIGRATION_USER,
    });
  }
  if ((src.documents ?? []).length) log.add('documents.no_vacia', undefined, 'La tabla `documents` tiene filas y no tiene equivalente.');

  const next = (table: string, rows: SqlRow[] | undefined) => Math.max(maxId(rows) + 1, opts.autoIncrement?.[table] ?? 0);
  const counters: Record<string, number> = {
    animal: next('animals', src.animals),
    event: next('animals_history', src.animals_history),
    contact: next('contacts', src.contacts),
    species: next('species', src.species),
    breed: next('species_breed', src.species_breed),
    city: next('cities', src.cities),
    zone: next('zones', src.zones),
    center: next('centers', src.centers),
    vaccine: next('vaccines', src.vaccines),
    illness: next('illnesses', src.illnesses),
    colony: next('colonies', src.colonies),
  };

  return { catalogs, staff, animals, events, contacts, templates, counters, duplicateNifGroups, issues: log.issues };
}
