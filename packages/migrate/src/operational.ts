/**
 * Catálogos operativos por defecto de la parte de coordinación (`seed-operational`): zonas del recinto,
 * tipos de cita y categorías de actuaciones. Son los valores que sembraba la beta de Gestión (zonas y tipos
 * de cita: `lib/model.ts` → `initializeZones` y `server/appointment-types.mjs`). La beta no sembraba
 * subtipos de actuación (eran datos de usuario en las listas Vacuna / Pruebas / Cirugía / Otros): aquí van
 * unos genéricos para empezar, editables y desactivables desde la app.
 *
 * **No hay personal**: el personal (veterinarias, auxiliares, cuidadoras) se da de alta desde la app.
 *
 * Idempotente: no se inserta un elemento si ya hay otro del mismo tipo con el mismo id o el mismo nombre
 * (sin tildes ni mayúsculas). No se modifica nada que ya exista.
 */
import { foldText, slugify, type ActionCategory, type ActionSubcategory, type AppointmentType, type Area, type AreaSpecies } from '@modepran/domain';

/** Catálogos que toca este comando (forma de `Catalogs` de `@modepran/api`). */
export interface OperationalCatalogs {
  areas: Area[];
  appointmentTypes: AppointmentType[];
  actionCategories: ActionCategory[];
}
export type OperationalType = keyof OperationalCatalogs;

/** Lo que hace falta del estado actual para planificar. */
export interface CurrentCatalogs extends Partial<OperationalCatalogs> {
  /** Ids de subtipos existentes: `vetSubtypeId` solo se pone si el subtipo existe. */
  subtypes?: { id: string; typeId: string }[];
  /** Vacunas del catálogo de historial: se usan como subcategorías de "Vacuna". */
  vaccines?: { id: string; name: string; active: boolean }[];
}

// Zonas del recinto (beta: "Zonas de Perros" / "Zonas de Gatos").
const DOG_AREAS = ['Interiores', 'Quirófano', 'Residencia', 'Invernadero', 'Fase 1', 'Fase 2', 'Moquillo', 'Cuarentena', 'Campo Nuevo - Fase 1', 'Campo Nuevo - Fase 2', 'Campo Nuevo - Fase 3'];
const CAT_AREAS = ['Jaulón grande', 'Jaulón pequeño', 'Jaulón de Noé', 'Inmuno', 'Cuarentena nueva', 'Cuarentena vieja', 'Cuarentena de Turco'];

// Tipos de cita (beta: `appointment-types-initial-v1`).
const APPOINTMENT_TYPES: [string, string, string][] = [
  ['general', 'Consultas generales', '#2563eb'],
  ['cirugia', 'Cirugía', '#9333ea'],
  ['clinica', 'Gestión veterinaria / clínica', '#ea580c'],
];

/** Categorías de actuación: [nombre, subtipo veterinario, subcategorías [nombre, subtipo?][]]. */
const ACTION_CATEGORIES: [string, string | undefined, [string, string?][]][] = [
  ['Vacuna', 'vacuna', []], // subcategorías: las vacunas del catálogo de historial
  [
    'Pruebas',
    'test',
    [['Test FeLV / FIV', 'test'], ['Test Leishmania', 'test'], ['Test Filaria', 'test'], ['Análisis de sangre', 'test'], ['Radiografía', 'test'], ['Ecografía', 'test']],
  ],
  ['Cirugía', 'intervencion', [['Esterilización', 'esterilizado'], ['Castración', 'esterilizado'], ['Otra cirugía', 'intervencion']]],
  ['Otros', undefined, [['Desparasitación interna', 'desparasitacion'], ['Desparasitación externa', 'desparasitacion'], ['Revisión'], ['Curas'], ['Especialista', 'especialista']]],
];

const area = (name: string, species: AreaSpecies): Area => ({ id: `area-${species}-${slugify(name)}`, name, active: true, species: [species] });

/** Valores por defecto. `vetSubtypeIds` = ids de subtipos veterinarios existentes (si no, se omiten). */
export function operationalDefaults(current: CurrentCatalogs = {}): OperationalCatalogs {
  const vet = current.subtypes ? new Set(current.subtypes.filter((s) => s.typeId === 'veterinario').map((s) => s.id)) : undefined;
  const vetId = (id?: string) => (id && (!vet || vet.has(id)) ? { vetSubtypeId: id } : {});
  const vaccineSubs: ActionSubcategory[] = (current.vaccines ?? [])
    .filter((v) => v.active)
    .map((v) => ({ id: `acs-vacuna-${slugify(v.name)}`, name: v.name, active: true, ...vetId('vacuna') }));
  return {
    areas: [...DOG_AREAS.map((n) => area(n, 'perros')), ...CAT_AREAS.map((n) => area(n, 'gatos'))],
    appointmentTypes: APPOINTMENT_TYPES.map(([id, name, color]) => ({ id: `at-${id}`, name, color, active: true })),
    actionCategories: ACTION_CATEGORIES.map(([name, sub, subs]) => {
      const cid = `ac-${slugify(name)}`;
      return {
        id: cid,
        name,
        active: true,
        ...vetId(sub),
        subcategories:
          name === 'Vacuna'
            ? vaccineSubs
            : subs.map(([sn, ss]) => ({ id: `acs-${slugify(name)}-${slugify(sn)}`, name: sn, active: true, ...vetId(ss) })),
      };
    }),
  };
}

export interface OperationalPlan {
  insert: OperationalCatalogs;
  skipped: { type: OperationalType; id: string; name: string; reason: 'id' | 'name' }[];
}

/** Qué se insertaría frente al estado actual (sin escribir nada). */
export function planOperationalSeed(current: CurrentCatalogs): OperationalPlan {
  const defaults = operationalDefaults(current);
  const skipped: OperationalPlan['skipped'] = [];
  const pick = <T extends { id: string; name: string }>(type: OperationalType, wanted: T[], existing: { id: string; name: string }[] = []): T[] => {
    const ids = new Set(existing.map((x) => x.id));
    const names = new Set(existing.map((x) => foldText(x.name)));
    return wanted.filter((w) => {
      const reason = ids.has(w.id) ? 'id' : names.has(foldText(w.name)) ? 'name' : undefined;
      if (reason) skipped.push({ type, id: w.id, name: w.name, reason });
      return !reason;
    });
  };
  return {
    insert: {
      areas: pick('areas', defaults.areas, current.areas),
      appointmentTypes: pick('appointmentTypes', defaults.appointmentTypes, current.appointmentTypes),
      actionCategories: pick('actionCategories', defaults.actionCategories, current.actionCategories),
    },
    skipped,
  };
}

/** Resumen legible del plan. */
export function formatPlan(plan: OperationalPlan): string {
  const lines: string[] = [];
  const { areas, appointmentTypes, actionCategories } = plan.insert;
  lines.push(`  zonas (areas): ${areas.length}`);
  for (const a of areas) lines.push(`    + ${a.id}  ${a.name} [${a.species.join(', ')}]`);
  lines.push(`  tipos de cita (appointmentTypes): ${appointmentTypes.length}`);
  for (const t of appointmentTypes) lines.push(`    + ${t.id}  ${t.name} ${t.color}`);
  lines.push(`  categorías de actuación (actionCategories): ${actionCategories.length}`);
  for (const c of actionCategories) {
    lines.push(`    + ${c.id}  ${c.name}${c.vetSubtypeId ? ` → ${c.vetSubtypeId}` : ''} (${c.subcategories.length} subcategorías)`);
    for (const s of c.subcategories) lines.push(`        · ${s.id}  ${s.name}${s.vetSubtypeId ? ` → ${s.vetSubtypeId}` : ''}`);
  }
  if (plan.skipped.length) {
    lines.push(`  ya existen (no se tocan): ${plan.skipped.length}`);
    for (const s of plan.skipped) lines.push(`    = ${s.type}/${s.id}  ${s.name} (mismo ${s.reason === 'id' ? 'id' : 'nombre'})`);
  }
  return lines.join('\n');
}
