/**
 * Catálogos base con códigos estables: los 4 tipos, los 12 estados y los 29 subtipos de la app vieja
 * con sus flags (tal cual están hoy en producción). Sirven de semilla y de mapeo para la migración.
 * En estas semillas `id` = `code`; la migración puede conservar otros ids, las reglas usan siempre `code`.
 */
import type {
  CatalogId,
  DomainCatalogs,
  EventTypeCode,
  KnownSubtypeCode,
  Species,
  Status,
  StatusCode,
  Subtype,
  SubtypeFlags,
} from './types.js';
import { foldText } from './text.js';

export const EVENT_TYPE_NAMES: Record<EventTypeCode, string> = {
  llegada: 'Llegada',
  salida: 'Salida',
  veterinario: 'Veterinario',
  movimientos: 'Movimientos',
};

export const DEFAULT_STATUSES: Status[] = (
  [
    ['disponible', 'Disponible'],
    ['adoptado', 'Adoptado'],
    ['acogida', 'Acogida'],
    ['acogida_solidaria', 'Acogida Solidaria'],
    ['fallecido', 'Fallecido'],
    ['eutanasiado', 'Eutanasiado'],
    ['cadaver', 'Cadaver'],
    ['translado', 'Translado'],
    ['devuelto_colonia', 'Devuelto a Colonia'],
    ['devolucion_propietario', 'Devolución Propietario'],
    ['perdido', 'Perdido'],
    ['devolucion_responsable_legal', 'Devolución Responsable Legal'],
  ] as const
).map(([code, name]) => ({ id: code, code, name, active: true }));

type FlagKey = keyof SubtypeFlags;
const F = (...on: FlagKey[]): SubtypeFlags => {
  const flags: SubtypeFlags = {
    user: false,
    contact: false,
    center: false,
    notes: false,
    vaccine: false,
    illness: false,
    colony: false,
    date: false,
    docGenerate: false,
    docUpload: false,
    switch: false,
  };
  for (const k of on) flags[k] = true;
  return flags;
};

interface SubtypeSeed {
  code: KnownSubtypeCode;
  name: string;
  typeId: EventTypeCode;
  status: StatusCode;
  flags: SubtypeFlags;
  switchLabel?: string;
}

const SUBTYPE_SEEDS: SubtypeSeed[] = [
  // Llegada
  { code: 'aviso', name: 'Aviso', typeId: 'llegada', status: 'disponible', flags: F('user', 'contact', 'center', 'notes', 'docGenerate') },
  { code: 'aviso_cadaver', name: 'Aviso Cadaver', typeId: 'llegada', status: 'cadaver', flags: F('user', 'contact', 'center', 'notes', 'docGenerate') },
  { code: 'aviso_enfermo_herido', name: 'Aviso Enfermo / Herido', typeId: 'llegada', status: 'disponible', flags: F('user', 'contact', 'center', 'notes', 'docGenerate') },
  { code: 'devolucion_desde_adopcion', name: 'Devolución desde Adopción', typeId: 'llegada', status: 'disponible', flags: F('user', 'contact', 'center', 'notes', 'docGenerate') },
  { code: 'aviso_chip', name: 'Aviso CHIP', typeId: 'llegada', status: 'disponible', flags: F('user', 'contact', 'center', 'notes', 'docGenerate') },
  { code: 'gato_colonia', name: 'Gato Colonia', typeId: 'llegada', status: 'disponible', flags: F('user', 'contact', 'center', 'notes', 'colony', 'docGenerate') },
  { code: 'devolucion_otras_asociaciones', name: 'Devolución Otras Asociaciones', typeId: 'llegada', status: 'disponible', flags: F('contact', 'center') },
  // Salida
  { code: 'adopcion', name: 'Adopción', typeId: 'salida', status: 'adoptado', flags: F('user', 'contact', 'notes', 'date', 'docGenerate') },
  { code: 'defuncion', name: 'Defunción', typeId: 'salida', status: 'fallecido', flags: F('user', 'notes', 'date') },
  { code: 'dueno', name: 'Dueño', typeId: 'salida', status: 'devolucion_propietario', flags: F('user', 'contact', 'notes', 'date', 'docGenerate') },
  { code: 'colonia', name: 'Colonia', typeId: 'salida', status: 'devuelto_colonia', flags: F('user', 'contact', 'date') },
  { code: 'eutanasia', name: 'Eutanasia', typeId: 'salida', status: 'eutanasiado', flags: F('user', 'contact', 'notes', 'date', 'docGenerate') },
  { code: 'cadaver', name: 'Cadaver', typeId: 'salida', status: 'cadaver', flags: F('user', 'contact', 'notes', 'date') },
  { code: 'otras_asociaciones', name: 'Otras Asociaciones', typeId: 'salida', status: 'translado', flags: F('user', 'contact', 'date') },
  { code: 'perdido', name: 'Perdido', typeId: 'salida', status: 'perdido', flags: F('center') },
  { code: 'devolucion_responsable_legal', name: 'Devolución Responsable Legal', typeId: 'salida', status: 'devolucion_responsable_legal', flags: F('contact', 'notes') },
  // Veterinario (el estado resultante es Disponible en la app vieja pero nunca se aplica: regla 2)
  { code: 'desparasitacion', name: 'Desparasitación', typeId: 'veterinario', status: 'disponible', flags: F('user', 'notes', 'date') },
  { code: 'enfermedad', name: 'Enfermedad', typeId: 'veterinario', status: 'disponible', flags: F('user', 'notes', 'illness', 'date', 'switch'), switchLabel: 'Finalizado' },
  { code: 'intervencion', name: 'Intervención', typeId: 'veterinario', status: 'disponible', flags: F('user', 'notes', 'date', 'docGenerate') },
  { code: 'vacuna', name: 'Vacuna', typeId: 'veterinario', status: 'disponible', flags: F('user', 'notes', 'vaccine', 'date', 'switch'), switchLabel: 'Finalizado' },
  { code: 'documento', name: 'Documento', typeId: 'veterinario', status: 'disponible', flags: F('user', 'notes', 'date', 'docUpload') },
  { code: 'esterilizado', name: 'Esterilizado', typeId: 'veterinario', status: 'disponible', flags: F('user', 'notes', 'date', 'switch'), switchLabel: 'Finalizado' },
  { code: 'ingreso', name: 'Ingreso', typeId: 'veterinario', status: 'disponible', flags: F('user', 'notes', 'date', 'docGenerate') },
  { code: 'test', name: 'Test', typeId: 'veterinario', status: 'disponible', flags: F('user', 'notes', 'date') },
  { code: 'especialista', name: 'Especialista', typeId: 'veterinario', status: 'disponible', flags: F('user', 'notes', 'date', 'docGenerate') },
  // Movimientos
  { code: 'acogida', name: 'Acogida', typeId: 'movimientos', status: 'acogida', flags: F('user', 'contact', 'notes', 'date', 'docGenerate') },
  { code: 'acogida_solidaria', name: 'Acogida Solidaria', typeId: 'movimientos', status: 'acogida_solidaria', flags: F('user', 'contact', 'notes', 'date', 'docGenerate') },
  { code: 'ingreso_revision', name: 'Ingreso / Revision', typeId: 'movimientos', status: 'disponible', flags: F('user', 'center', 'date') },
  { code: 'devolucion_desde_acogida', name: 'Devolución desde Acogida', typeId: 'movimientos', status: 'disponible', flags: F('user', 'contact', 'center', 'notes', 'date', 'docGenerate') },
];

export const DEFAULT_SUBTYPES: Subtype[] = SUBTYPE_SEEDS.map((s) => ({
  id: s.code,
  code: s.code,
  name: s.name,
  typeId: s.typeId,
  resultStatusId: s.status,
  active: true,
  ...s.flags,
  ...(s.switchLabel ? { switchLabel: s.switchLabel } : {}),
}));

export const DEFAULT_CATALOGS: DomainCatalogs = {
  statuses: DEFAULT_STATUSES,
  subtypes: DEFAULT_SUBTYPES,
};

/** Subtipos de llegada que son devoluciones: copian ciudad/dirección/CP de la llegada original (regla 4). */
export const RETURN_SUBTYPE_CODES: readonly string[] = ['devolucion_desde_acogida', 'devolucion_desde_adopcion'];

// ---------------------------------------------------------------------------
// Búsquedas
// ---------------------------------------------------------------------------

export class CatalogIndex {
  private readonly statusById = new Map<CatalogId, Status>();
  private readonly statusByCode = new Map<string, Status>();
  private readonly subtypeById = new Map<CatalogId, Subtype>();
  private readonly subtypeByCode = new Map<string, Subtype>();
  private readonly speciesById = new Map<CatalogId, Species>();

  constructor(readonly catalogs: DomainCatalogs) {
    for (const s of catalogs.statuses) {
      this.statusById.set(s.id, s);
      this.statusByCode.set(s.code, s);
    }
    for (const s of catalogs.subtypes) {
      this.subtypeById.set(s.id, s);
      this.subtypeByCode.set(s.code, s);
    }
    for (const s of catalogs.species ?? []) this.speciesById.set(s.id, s);
  }

  status(id: CatalogId | undefined): Status | undefined {
    return id === undefined ? undefined : this.statusById.get(id);
  }
  statusCode(id: CatalogId | undefined): string | undefined {
    return this.status(id)?.code;
  }
  statusIdByCode(code: string): CatalogId | undefined {
    return this.statusByCode.get(code)?.id;
  }
  subtype(id: CatalogId | undefined): Subtype | undefined {
    return id === undefined ? undefined : this.subtypeById.get(id);
  }
  subtypeByCodeName(code: string): Subtype | undefined {
    return this.subtypeByCode.get(code);
  }
  /** Código del estado resultante de un subtipo. */
  resultStatusCode(subtypeId: CatalogId): string | undefined {
    return this.statusCode(this.subtype(subtypeId)?.resultStatusId);
  }
  species(id: CatalogId | undefined): Species | undefined {
    return id === undefined ? undefined : this.speciesById.get(id);
  }
  zoneCityIds(zoneId: CatalogId): CatalogId[] | undefined {
    return this.catalogs.zones?.find((z) => z.id === zoneId)?.cityIds;
  }
}

const indexCache = new WeakMap<DomainCatalogs, CatalogIndex>();

export function catalogIndex(catalogs: DomainCatalogs): CatalogIndex {
  let idx = indexCache.get(catalogs);
  if (!idx) {
    idx = new CatalogIndex(catalogs);
    indexCache.set(catalogs, idx);
  }
  return idx;
}

export type SpeciesGroup = 'perro' | 'gato' | 'otros';

/** Columna Perro/Gato/Otros de los Excel (por `code` o, si falta, por nombre). */
export function speciesGroup(species: Species | undefined): SpeciesGroup {
  if (!species) return 'otros';
  const key = foldText(species.code ?? species.name);
  if (key === 'perro' || key === 'perros' || key === 'can') return 'perro';
  if (key === 'gato' || key === 'gatos' || key === 'fel') return 'gato';
  return 'otros';
}
