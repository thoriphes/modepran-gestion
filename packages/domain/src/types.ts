/**
 * Tipos de dominio de Modepran Gestión (spec §2-§4).
 *
 * Convenciones:
 * - Fechas de calendario: `IsoDate` = 'YYYY-MM-DD' (día en Europe/Madrid).
 * - Instantes: `IsoDateTime` = ISO 8601 en UTC ('2026-11-25T10:00:00.000Z').
 * - Ids numéricos para animales, eventos y contactos (continúan la numeración de la app vieja);
 *   ids `string` para catálogos, agenda, incidencias y usuarios.
 */

export type IsoDate = string;
export type IsoDateTime = string;

export type AnimalId = number;
export type EventId = number;
export type ContactId = number;
export type CatalogId = string;
export type UserId = string;

// ---------------------------------------------------------------------------
// Códigos estables
// ---------------------------------------------------------------------------

export const EVENT_TYPE_CODES = ['llegada', 'salida', 'veterinario', 'movimientos'] as const;
export type EventTypeCode = (typeof EVENT_TYPE_CODES)[number];

export const STATUS_CODES = [
  'disponible',
  'adoptado',
  'acogida',
  'acogida_solidaria',
  'fallecido',
  'eutanasiado',
  'cadaver',
  'translado',
  'devuelto_colonia',
  'devolucion_propietario',
  'perdido',
  'devolucion_responsable_legal',
] as const;
export type StatusCode = (typeof STATUS_CODES)[number];

/** Estados que cuentan para el censo (spec §6). */
export const CENSUS_STATUS_CODES: readonly StatusCode[] = ['disponible', 'acogida', 'acogida_solidaria'];
/** Estados "en acogida" (columna aparte del censo). */
export const HOST_STATUS_CODES: readonly StatusCode[] = ['acogida', 'acogida_solidaria'];

/** Códigos de los 29 subtipos actuales (slug estable). */
export const SUBTYPE_CODES = [
  'aviso',
  'aviso_cadaver',
  'aviso_enfermo_herido',
  'devolucion_desde_adopcion',
  'adopcion',
  'defuncion',
  'dueno',
  'colonia',
  'eutanasia',
  'cadaver',
  'otras_asociaciones',
  'desparasitacion',
  'enfermedad',
  'intervencion',
  'vacuna',
  'documento',
  'esterilizado',
  'ingreso',
  'test',
  'especialista',
  'acogida',
  'acogida_solidaria',
  'ingreso_revision',
  'aviso_chip',
  'gato_colonia',
  'devolucion_desde_acogida',
  'perdido',
  'devolucion_otras_asociaciones',
  'devolucion_responsable_legal',
] as const;
export type KnownSubtypeCode = (typeof SUBTYPE_CODES)[number];

export const GENDERS = ['male', 'female', 'none'] as const;
export type Gender = (typeof GENDERS)[number];

export const SIZES = ['small', 'medium', 'big'] as const;
export type Size = (typeof SIZES)[number];

export const PROFILES = ['admin', 'carlet', 'modevet', 'bienestar'] as const;
export type Profile = (typeof PROFILES)[number];

// ---------------------------------------------------------------------------
// Catálogos
// ---------------------------------------------------------------------------

export interface CatalogItem {
  id: CatalogId;
  name: string;
  /** Los catálogos no se borran: se desactivan. */
  active: boolean;
}

export interface Species extends CatalogItem {
  /** 'perro' | 'gato' | otro slug. Sirve para las columnas Perro/Gato/Otros de los Excel. */
  code?: string;
}
export interface Breed extends CatalogItem {
  speciesId: CatalogId;
}
export type City = CatalogItem;
export interface Zone extends CatalogItem {
  cityIds: CatalogId[];
}
export interface Center extends CatalogItem {
  code?: string;
}
export interface Status extends CatalogItem {
  code: StatusCode | string;
}
export type Vaccine = CatalogItem;
export type Illness = CatalogItem;
export type Colony = CatalogItem;

export interface SubtypeFlags {
  /** Pide trabajador; si no, el trabajador es el usuario logueado (regla 5). */
  user: boolean;
  contact: boolean;
  /** Pide centro y mueve al animal de centro (regla 2). */
  center: boolean;
  notes: boolean;
  vaccine: boolean;
  illness: boolean;
  colony: boolean;
  /** Pide fecha del evento (si no, salida/otros = hoy). */
  date: boolean;
  docGenerate: boolean;
  docUpload: boolean;
  switch: boolean;
}

export interface Subtype extends CatalogItem, SubtypeFlags {
  typeId: EventTypeCode;
  code: KnownSubtypeCode | string;
  resultStatusId?: CatalogId;
  switchLabel?: string;
}

export type AreaSpecies = 'perros' | 'gatos';
/** Ubicación en recinto (incidencias). */
export interface Area extends CatalogItem {
  species: AreaSpecies[];
}

export type StaffRole = 'cuidadora' | 'veterinaria' | 'auxiliar';
/** Personal sin cuenta (cuidadoras, veterinarias, auxiliares, trabajadores migrados). */
export interface Staff extends CatalogItem {
  roles: StaffRole[];
}

export interface AppointmentType extends CatalogItem {
  color: string;
}

export interface ActionSubcategory extends CatalogItem {
  /** Subtipo veterinario equivalente (integración agenda ↔ historial). */
  vetSubtypeId?: CatalogId;
}
export interface ActionCategory extends CatalogItem {
  subcategories: ActionSubcategory[];
  vetSubtypeId?: CatalogId;
}

/** Lo mínimo que necesitan las reglas de eventos, censo e informes. */
export interface DomainCatalogs {
  statuses: Status[];
  subtypes: Subtype[];
  species?: Species[];
  zones?: Zone[];
}

// ---------------------------------------------------------------------------
// Animal y eventos
// ---------------------------------------------------------------------------

export interface Chip {
  number: string;
  passport?: string;
  owner?: string;
  phone?: string;
  notes?: string;
}

export interface LastArrival {
  date: IsoDate;
  cityId?: CatalogId;
  cityName?: string;
  subtypeId: CatalogId;
  userId?: UserId;
  centerId?: CatalogId;
}

export interface LastExit {
  date: IsoDate;
  subtypeId: CatalogId;
}

export interface StatusChange {
  statusId: CatalogId;
  date: IsoDate;
}

/** Campos derivados de los eventos, guardados en la ficha para filtrar sin leer el historial. */
export interface AnimalDerived {
  lastArrival?: LastArrival;
  lastExit?: LastExit;
  /** Enfermedades que ha tenido alguna vez. */
  illnessIds: CatalogId[];
  /** Contactos de cualquier evento. */
  contactIds: ContactId[];
  /** Fechas de todas las llegadas (filtro por rango de llegada). */
  arrivalDates: IsoDate[];
  /** Fechas de todas las salidas (filtro por rango de salida). */
  exitDates: IsoDate[];
  /** Cambios de estado (eventos no veterinarios con estado resultante). */
  statusChanges: StatusChange[];
}

export interface Animal extends AnimalDerived {
  id: AnimalId;
  name: string;
  speciesId: CatalogId;
  breedId?: CatalogId;
  color?: string;
  gender: Gender;
  weightKg?: number;
  size?: Size;
  bornAt?: IsoDate;
  centerId?: CatalogId;
  statusId?: CatalogId;
  sterilized: boolean;
  ppp: boolean;
  visibleWeb: boolean;
  compatibleDogs: boolean;
  compatibleCats: boolean;
  hasPhoto: boolean;
  chip?: Chip;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
}

export interface EventDocument {
  key: string;
  originalName: string;
}

export interface HistoryEvent {
  id: EventId;
  animalId: AnimalId;
  typeId: EventTypeCode;
  subtypeId: CatalogId;
  /** Fecha del evento (en llegadas = fecha de recogida). */
  date: IsoDate;
  /** Trabajador (usuario o personal). */
  userId?: UserId;
  contactId?: ContactId;
  centerId?: CatalogId;
  vaccineId?: CatalogId;
  illnessId?: CatalogId;
  colonyId?: CatalogId;
  cityId?: CatalogId;
  /** Copia del nombre de la ciudad (histórico estable). */
  cityName?: string;
  address?: string;
  zip?: string;
  collectionDate?: IsoDate;
  notes?: string;
  switchValue?: boolean;
  document?: EventDocument;
  createdAt: IsoDateTime;
  createdBy: UserId;
}

// ---------------------------------------------------------------------------
// Contactos
// ---------------------------------------------------------------------------

export const CONTACT_KINDS = ['adoptante', 'acogedor', 'propietario', 'avisante', 'cliente_modevet'] as const;
export type ContactKind = (typeof CONTACT_KINDS)[number];

export interface Contact {
  id: ContactId;
  name: string;
  surname?: string;
  nif?: string;
  address?: string;
  zip?: string;
  province?: string;
  cityId?: CatalogId;
  cityName?: string;
  phone?: string;
  email?: string;
  kind: ContactKind[];
  createdAt: IsoDateTime;
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export type AgendaKind = 'cita' | 'aviso' | 'nota';
export type AgendaName = 'carlet' | 'modevet';
export type AgendaTarget = AgendaName | 'ambas';
export type AppointmentStatus = 'pendiente' | 'concluida' | 'no_presentado' | 'cancelada' | 'reagendada';
export type NoteStatus = 'pendiente' | 'concluido';
export type AgendaStatus = AppointmentStatus | NoteStatus;
export type AgendaSpecies = 'CAN' | 'FEL' | 'otra';

export interface StatusEvent<S extends string = string> {
  status: S;
  at: IsoDateTime;
  by: UserId;
}

export interface AppointmentAction {
  categoryId?: CatalogId;
  subcategoryId?: CatalogId;
  /** Copia de nombres o texto libre. */
  text?: string;
}

export interface AgendaItem {
  id: string;
  kind: AgendaKind;
  agenda: AgendaTarget;
  date: IsoDate;
  /** 'HH:MM'; sin hora = franja "sin hora". */
  time?: string;
  text: string;
  status: AgendaStatus;
  createdBy: UserId;
  createdAt: IsoDateTime;
  statusEvents: StatusEvent<AgendaStatus>[];
  // Solo citas:
  appointmentType?: { id: CatalogId; name: string; color: string };
  requestedBy?: { id: CatalogId; name: string };
  animalId?: AnimalId;
  externalAnimal?: { name: string; species: string };
  species?: AgendaSpecies;
  actions?: AppointmentAction[];
  owner?: { name: string; phone?: string; email?: string };
  incidentId?: string;
  isReferral?: boolean;
  rescheduledFromId?: string;
  rescheduledToId?: string;
  /** Copiado al resolver la incidencia en cascada. */
  resolution?: { byStaffId: CatalogId; treatment: string; at: IsoDateTime };
}

// ---------------------------------------------------------------------------
// Incidencias
// ---------------------------------------------------------------------------

export type IncidentPriority = 'normal' | 'importante' | 'urgente';
export type IncidentStatus = 'pendiente' | 'en_proceso' | 'resuelta';

export interface IncidentPhoto {
  key: string;
  mime: string;
  bytes: number;
  uploadedAt: IsoDateTime;
}

export interface Incident {
  id: string;
  animalId?: AnimalId;
  animalName?: string;
  species: AgendaSpecies;
  areaId: CatalogId;
  areaName: string;
  text: string;
  priority: IncidentPriority;
  reporterUserId: UserId;
  /** Persona de Bienestar que comunica (si la cuenta es compartida). */
  reporterStaffId?: CatalogId;
  photos: IncidentPhoto[];
  status: IncidentStatus;
  resolution?: { byStaffId: CatalogId; treatment: string; at: IsoDateTime };
  statusEvents: StatusEvent<IncidentStatus>[];
  createdAt: IsoDateTime;
}

// ---------------------------------------------------------------------------
// Auditoría, plantillas, usuarios
// ---------------------------------------------------------------------------

export type AuditAction = 'create' | 'update' | 'delete' | 'export' | 'login' | 'purge' | string;

export interface AuditEntry {
  id: string;
  at: IsoDateTime;
  userId: UserId;
  userName: string;
  action: AuditAction;
  entity: string;
  entityId: string;
  summary: string;
}

export const TEMPLATE_SLUGS = ['llegada', 'adopcion', 'dueno', 'eutanasia', 'acogida', 'veterinario', 'ficha'] as const;
export type TemplateSlug = (typeof TEMPLATE_SLUGS)[number];

export interface Template {
  slug: TemplateSlug;
  name: string;
  bodyFilled: string;
  bodyBlank: string;
  /** Overrides de los textos `[LANG_*]` para este documento (clave en minúsculas, p. ej. `lopd`). */
  legalTexts: Record<string, string>;
  updatedAt: IsoDateTime;
  updatedBy: UserId;
}

export interface User {
  id: UserId;
  email: string;
  name: string;
  profiles: Profile[];
  active: boolean;
  /** Ficha de personal asociada (para "solicitada por", "responsable"). */
  staffId?: CatalogId;
  createdAt: IsoDateTime;
}
