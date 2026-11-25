/**
 * Verificación de la migración: recuentos de origen (calculados sobre las filas crudas, sin pasar por el
 * mapeo) frente a los del resultado, y comprobaciones de integridad.
 *
 * El informe es agregado: recuentos, nombres de catálogo (estados, especies, centros, subtipos) e ids
 * internos de ejemplo. Nunca nombres de personas, NIF, teléfonos, emails ni direcciones.
 *
 * Los recuentos se comparan por **nombre de catálogo normalizado** (sin tildes ni mayúsculas), así no
 * dependen del mapeo de ids que se está verificando. Las erratas conocidas se unifican con `NAME_ALIASES`.
 */
import { catalogIndex, currentCenterFromEvents, currentStatusFromEvents, foldText, type DomainCatalogs, type HistoryEvent } from '@modepran/domain';
import type { FileManifest } from './files.js';
import type { Issues, MigrationResult, SourceTables } from './map.js';
import type { SqlRow, SqlValue } from './sql-parser.js';

const NAME_ALIASES: Record<string, string> = { esterlizado: 'esterilizado' };

function key(name: SqlValue | string | undefined): string {
  const f = foldText(String(name ?? ''));
  return NAME_ALIASES[f] ?? f;
}

export type Counts = Record<string, number>;

export interface SourceStats {
  /** Filas por tabla (todas, también las descartadas). */
  tables: Counts;
  animalsByStatus: Counts;
  animalsBySpecies: Counts;
  animalsByCenter: Counts;
  eventsByType: Counts;
  eventsBySubtype: Counts;
  /** Nombre legible por clave normalizada. */
  labels: Record<string, string>;
  chips: number;
  eventsWithDocument: number;
  animalsWithPhoto: number;
}

function inc(c: Counts, k: string, n = 1): void {
  c[k] = (c[k] ?? 0) + n;
}

function nameIndex(rows: SqlRow[] | undefined, col: string, labels: Record<string, string>): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of rows ?? []) {
    const k = key(r[col] as string);
    labels[k] ??= String(r[col]);
    m.set(String(r.id), k);
  }
  return m;
}

/** Recuentos sobre las filas crudas del volcado. */
export function computeSourceStats(src: SourceTables, tableRowCounts: Counts): SourceStats {
  const labels: Record<string, string> = {};
  const status = nameIndex(src.animals_status, 'status', labels);
  const species = nameIndex(src.species, 'specie', labels);
  const centers = nameIndex(src.centers, 'name', labels);
  const types = nameIndex(src.animals_history_types, 'type', labels);
  const subtypes = nameIndex(src.animals_history_types_subtypes, 'subtype', labels);
  const s: SourceStats = {
    tables: { ...tableRowCounts },
    animalsByStatus: {},
    animalsBySpecies: {},
    animalsByCenter: {},
    eventsByType: {},
    eventsBySubtype: {},
    labels,
    chips: (src.animals_chips ?? []).length,
    eventsWithDocument: 0,
    animalsWithPhoto: 0,
  };
  for (const a of src.animals ?? []) {
    inc(s.animalsByStatus, status.get(String(a.status_id)) ?? '(desconocido)');
    inc(s.animalsBySpecies, species.get(String(a.specie_id)) ?? '(desconocido)');
    inc(s.animalsByCenter, centers.get(String(a.center_id)) ?? '(desconocido)');
    if (Number(a.photo) === 1) s.animalsWithPhoto++;
  }
  for (const e of src.animals_history ?? []) {
    inc(s.eventsByType, types.get(String(e.history_type_id)) ?? '(desconocido)');
    inc(s.eventsBySubtype, subtypes.get(String(e.history_subtype_id)) ?? '(desconocido)');
    if (e.doc_name !== null && String(e.doc_name).trim() !== '') s.eventsWithDocument++;
  }
  return s;
}

export interface CountComparison {
  key: string;
  label: string;
  source: number;
  result: number;
  ok: boolean;
}

export interface Check {
  code: string;
  description: string;
  count: number;
  /** `error` bloquea la carga; `warning` es una anomalía de datos que se migra tal cual. */
  level: 'error' | 'warning' | 'info';
  sampleIds?: (number | string)[];
}

export interface VerifyReport {
  ok: boolean;
  tables: CountComparison[];
  animalsByStatus: CountComparison[];
  animalsBySpecies: CountComparison[];
  animalsByCenter: CountComparison[];
  eventsByType: CountComparison[];
  eventsBySubtype: CountComparison[];
  catalogs: Counts;
  checks: Check[];
  mappingIssues: Issues;
  files?: {
    uploads: number;
    bytes: number;
    byKind: FileManifest['totals']['byKind'];
    missing: Counts;
    orphans: Counts;
  };
}

function compare(source: Counts, result: Counts, labels: Record<string, string>): CountComparison[] {
  const keys = [...new Set([...Object.keys(source), ...Object.keys(result)])].sort();
  return keys.map((k) => ({
    key: k,
    label: labels[k] ?? k,
    source: source[k] ?? 0,
    result: result[k] ?? 0,
    ok: (source[k] ?? 0) === (result[k] ?? 0),
  }));
}

/** Tabla de origen → nombre de la colección del resultado que la representa. */
const TABLE_TO_RESULT: Record<string, (r: MigrationResult) => number> = {
  animals: (r) => r.animals.length,
  animals_history: (r) => r.events.length,
  contacts: (r) => r.contacts.length,
  // Los chips que no usa ningún animal no se migran (no hay dónde ponerlos): cuentan como "explicados".
  animals_chips: (r) => r.animals.filter((a) => a.chip).length + (r.issues['chip.sin_animal']?.count ?? 0),
  species: (r) => r.catalogs.species.length,
  species_breed: (r) => r.catalogs.breeds.length,
  cities: (r) => r.catalogs.cities.length,
  zones: (r) => r.catalogs.zones.length,
  zones_cities: (r) => r.catalogs.zones.reduce((n, z) => n + z.cityIds.length, 0) + (r.issues['zones_cities.huerfana']?.count ?? 0),
  centers: (r) => r.catalogs.centers.length,
  animals_status: (r) => r.catalogs.statuses.length,
  animals_history_types_subtypes: (r) => r.catalogs.subtypes.length,
  vaccines: (r) => r.catalogs.vaccines.length,
  illnesses: (r) => r.catalogs.illnesses.length,
  colonies: (r) => r.catalogs.colonies.length,
  users: (r) => r.staff.length,
  document_print_templates: (r) => r.templates.length,
};

export function verifyMigration(stats: SourceStats, result: MigrationResult, manifest?: FileManifest): VerifyReport {
  const labels = { ...stats.labels };
  const label = (k: string, name: string) => (labels[k] ??= name);
  const statusName = new Map(result.catalogs.statuses.map((s) => [s.id, s.name]));
  const speciesName = new Map(result.catalogs.species.map((s) => [s.id, s.name]));
  const centerName = new Map(result.catalogs.centers.map((s) => [s.id, s.name]));
  const subtypeById = new Map(result.catalogs.subtypes.map((s) => [s.id, s]));

  const rStatus: Counts = {};
  const rSpecies: Counts = {};
  const rCenter: Counts = {};
  for (const a of result.animals) {
    const st = statusName.get(a.statusId ?? '') ?? '(desconocido)';
    inc(rStatus, key(st));
    label(key(st), st);
    const sp = speciesName.get(a.speciesId) ?? '(desconocido)';
    inc(rSpecies, key(sp));
    label(key(sp), sp);
    const c = centerName.get(a.centerId ?? '') ?? '(desconocido)';
    inc(rCenter, key(c));
    label(key(c), c);
  }
  const rType: Counts = {};
  const rSubtype: Counts = {};
  for (const e of result.events) {
    inc(rType, key(e.typeId));
    const st = subtypeById.get(e.subtypeId)?.name ?? '(desconocido)';
    inc(rSubtype, key(st));
    label(key(st), st);
  }

  // Tablas: las migradas se comparan con su colección; las descartadas se listan con resultado 0.
  const tables: CountComparison[] = Object.entries(stats.tables)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([t, n]) => {
      const f = TABLE_TO_RESULT[t];
      const res = f ? f(result) : 0;
      // Estados: el dominio siempre trae los 12; los tipos son fijos (4).
      const expected = t === 'animals_history_types' ? 4 : n;
      return { key: t, label: f ? t : `${t} (descartada)`, source: n, result: t === 'animals_history_types' ? 4 : res, ok: !f || res === expected };
    });

  // Integridad.
  const checks: Check[] = [];
  const add = (code: string, description: string, ids: (number | string)[], level: Check['level']) =>
    checks.push({ code, description, count: ids.length, level, ...(ids.length ? { sampleIds: ids.slice(0, 10) } : {}) });

  const animalIds = new Set(result.animals.map((a) => a.id));
  const contactIds = new Set(result.contacts.map((c) => c.id));
  add('eventos_sin_animal', 'Eventos cuyo animal no existe', result.events.filter((e) => !animalIds.has(e.animalId)).map((e) => e.id), 'error');
  add(
    'eventos_contacto_inexistente',
    'Eventos que apuntan a un contacto que no existe',
    result.events.filter((e) => e.contactId !== undefined && !contactIds.has(e.contactId)).map((e) => e.id),
    'error',
  );
  add('eventos_subtipo_inexistente', 'Eventos con subtipo desconocido', result.events.filter((e) => !subtypeById.has(e.subtypeId)).map((e) => e.id), 'error');
  add(
    'eventos_tipo_distinto_del_subtipo',
    'Eventos cuyo tipo no es el de su subtipo',
    result.events.filter((e) => subtypeById.get(e.subtypeId) && subtypeById.get(e.subtypeId)!.typeId !== e.typeId).map((e) => e.id),
    'error',
  );
  const eventIds = new Map<number, number>();
  for (const e of result.events) eventIds.set(e.id, (eventIds.get(e.id) ?? 0) + 1);
  add('eventos_id_duplicado', 'Ids de evento repetidos', [...eventIds].filter(([, n]) => n > 1).map(([id]) => id), 'error');

  const chips = new Map<string, number[]>();
  for (const a of result.animals) if (a.chip) chips.set(a.chip.number.toUpperCase(), [...(chips.get(a.chip.number.toUpperCase()) ?? []), a.id]);
  add('chips_duplicados', 'Números de chip en más de un animal (la unicidad de chip fallaría)', [...chips.values()].filter((g) => g.length > 1).map((g) => g[0]!), 'error');

  const orphanChips = result.issues['chip.sin_animal'];
  checks.push({
    code: 'chips_sin_animal',
    description: 'Chips de animals_chips que no usa ningún animal (no se migran)',
    count: orphanChips?.count ?? 0,
    level: orphanChips?.count ? 'warning' : 'info',
    ...(orphanChips?.sampleIds.length ? { sampleIds: orphanChips.sampleIds } : {}),
  });

  const nifs = new Map<string, number[]>();
  for (const c of result.contacts) if (c.nif && !c.special) nifs.set(c.nif, [...(nifs.get(c.nif) ?? []), c.id]);
  const dupNif = [...nifs.values()].filter((g) => g.length > 1);
  add(
    'nif_duplicados',
    `NIF compartidos por varios contactos (${dupNif.reduce((n, g) => n + g.length, 0)} contactos en total). Se migran tal cual; bulkImport no escribe guardián de unicidad para esos NIF.`,
    dupNif.map((g) => g[0]!),
    'warning',
  );
  add('contactos_sin_datos', 'Contactos "SIN DATOS" (tiene que haber exactamente 1)', result.contacts.filter((c) => c.special).map((c) => c.id), 'info');

  const byAnimal = new Map<number, HistoryEvent[]>();
  for (const e of result.events) byAnimal.set(e.animalId, [...(byAnimal.get(e.animalId) ?? []), e]);
  add('animales_sin_eventos', 'Animales sin ningún evento', result.animals.filter((a) => !byAnimal.has(a.id)).map((a) => a.id), 'warning');
  const firstNotArrival: number[] = [];
  for (const [aid, evs] of byAnimal) {
    const first = evs.reduce((x, y) => (y.createdAt < x.createdAt || (y.createdAt === x.createdAt && y.id < x.id) ? y : x));
    if (first.typeId !== 'llegada') firstNotArrival.push(aid);
  }
  add('primer_evento_no_es_llegada', 'Animales cuyo primer evento registrado no es una Llegada', firstNotArrival, 'warning');

  const catalogs: DomainCatalogs = { statuses: result.catalogs.statuses, subtypes: result.catalogs.subtypes };
  catalogIndex(catalogs);
  const statusMismatch: number[] = [];
  const centerMismatch: number[] = [];
  for (const a of result.animals) {
    const evs = byAnimal.get(a.id) ?? [];
    if (!evs.length) continue;
    const st = currentStatusFromEvents(evs, catalogs);
    if (st && st !== a.statusId) statusMismatch.push(a.id);
    const c = currentCenterFromEvents(evs, catalogs);
    if (c && c !== a.centerId) centerMismatch.push(a.id);
  }
  add(
    'estado_no_cuadra_con_historial',
    'Animales cuyo estado guardado no es el resultado de su último evento no veterinario (se conserva el guardado)',
    statusMismatch,
    'warning',
  );
  add(
    'centro_no_cuadra_con_historial',
    'Animales cuyo centro guardado no es el de su última llegada/evento con centro (se conserva el guardado)',
    centerMismatch,
    'warning',
  );
  const usedContacts = new Set(result.events.flatMap((e) => (e.contactId !== undefined ? [e.contactId] : [])));
  add(
    'contactos_sin_eventos',
    'Contactos que no aparecen en ningún evento',
    result.contacts.filter((c) => !usedContacts.has(c.id)).map((c) => c.id),
    'info',
  );
  const docKeys = new Map<string, number>();
  for (const e of result.events) if (e.document) docKeys.set(e.document.key, (docKeys.get(e.document.key) ?? 0) + 1);
  add('documentos_clave_repetida', 'Claves de documento repetidas', [...docKeys].filter(([, n]) => n > 1).map(([k]) => k), 'error');
  const lostDocs = stats.eventsWithDocument - result.events.filter((e) => e.document).length;
  checks.push({
    code: 'documentos_no_migrados',
    description: 'Eventos con doc_name en origen que se quedan sin documento (fichero ausente)',
    count: lostDocs,
    level: lostDocs ? 'warning' : 'info',
  });

  const catalogCounts: Counts = Object.fromEntries(Object.entries(result.catalogs).map(([k, v]) => [k, (v as unknown[]).length]));
  catalogCounts.staff = result.staff.length;
  catalogCounts.templates = result.templates.length;

  const report: VerifyReport = {
    ok: false,
    tables,
    animalsByStatus: compare(stats.animalsByStatus, rStatus, labels),
    animalsBySpecies: compare(stats.animalsBySpecies, rSpecies, labels),
    animalsByCenter: compare(stats.animalsByCenter, rCenter, labels),
    eventsByType: compare(stats.eventsByType, rType, labels),
    eventsBySubtype: compare(stats.eventsBySubtype, rSubtype, labels),
    catalogs: catalogCounts,
    checks,
    mappingIssues: result.issues,
  };

  if (manifest) {
    report.files = {
      uploads: manifest.totals.files,
      bytes: manifest.totals.bytes,
      byKind: manifest.totals.byKind,
      missing: Object.fromEntries(Object.entries(manifest.missing).map(([k, v]) => [k, v.length])),
      orphans: Object.fromEntries(Object.entries(manifest.orphans).map(([k, v]) => [k, v.length])),
    };
    const photoFlag = result.animals.filter((a) => a.hasPhoto).length;
    add('fotos_ausentes', 'Animales con foto en la ficha sin fichero de foto', manifest.missing.photos, manifest.missing.photos.length ? 'warning' : 'info');
    add('documentos_ausentes', 'Eventos con documento sin fichero', manifest.missing.documents, manifest.missing.documents.length ? 'warning' : 'info');
    if (photoFlag !== stats.animalsWithPhoto) add('fotos_flag_distinto', 'El número de animales con foto no cuadra con el origen', [], 'error');
  }

  const countsOk = [report.animalsByStatus, report.animalsBySpecies, report.animalsByCenter, report.eventsByType, report.eventsBySubtype, report.tables].every(
    (list) => list.every((c) => c.ok),
  );
  report.ok = countsOk && checks.every((c) => c.level !== 'error' || c.count === 0);
  return report;
}

// ---------------------------------------------------------------------------
// Informe legible (Markdown, agregado)
// ---------------------------------------------------------------------------

function table(title: string, rows: CountComparison[]): string {
  const lines = [`### ${title}`, '', '| | Origen | Resultado | |', '|---|---:|---:|---|'];
  for (const r of rows) lines.push(`| ${r.label} | ${r.source} | ${r.result} | ${r.ok ? 'ok' : '**DIFERENTE**'} |`);
  return lines.join('\n');
}

export function formatReport(r: VerifyReport): string {
  const out: string[] = [];
  out.push(`# Verificación de la migración`, '', `Resultado: **${r.ok ? 'OK' : 'CON DIFERENCIAS O ERRORES'}**`, '');
  out.push(table('Tablas', r.tables), '');
  out.push(table('Animales por estado', r.animalsByStatus), '');
  out.push(table('Animales por especie', r.animalsBySpecies), '');
  out.push(table('Animales por centro', r.animalsByCenter), '');
  out.push(table('Eventos por tipo', r.eventsByType), '');
  out.push(table('Eventos por subtipo', r.eventsBySubtype), '');
  out.push('### Catálogos del resultado', '', ...Object.entries(r.catalogs).map(([k, v]) => `- ${k}: ${v}`), '');
  out.push('### Comprobaciones', '', '| Nivel | Código | Casos | Descripción |', '|---|---|---:|---|');
  for (const c of r.checks) out.push(`| ${c.level} | ${c.code} | ${c.count} | ${c.description} |`);
  out.push('', '### Incidencias del mapeo', '', '| Código | Casos | Nota |', '|---|---:|---|');
  for (const [k, v] of Object.entries(r.mappingIssues).sort()) out.push(`| ${k} | ${v.count} | ${v.note ?? ''} |`);
  if (r.files) {
    out.push('', '### Ficheros', '', `- A subir: ${r.files.uploads} (${(r.files.bytes / 1024 / 1024).toFixed(1)} MB)`);
    for (const [k, v] of Object.entries(r.files.byKind)) out.push(`  - ${k}: ${v.files} (${(v.bytes / 1024 / 1024).toFixed(1)} MB)`);
    out.push(`- Ausentes: ${Object.entries(r.files.missing).map(([k, v]) => `${k} ${v}`).join(', ')}`);
    out.push(`- Huérfanos (no se suben): ${Object.entries(r.files.orphans).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  }
  return out.join('\n') + '\n';
}
