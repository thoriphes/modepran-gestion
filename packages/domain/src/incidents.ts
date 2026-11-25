/**
 * Incidencias de Bienestar (spec §4 "Incidencia"; reglas de la beta de Gestión).
 * - Los datos originales son inmutables (solo cambian estado, fotos añadidas y resolución).
 * - Dar cita o derivar no la resuelve (decisión: si estaba pendiente pasa a "en proceso").
 * - Máximo una derivación abierta a Modevet.
 * - Resolver cierra en cascada sus citas/derivaciones abiertas copiando responsable y tratamiento.
 */
import { AGENDA_SPECIES, createAgendaItem, isClosedAgendaItem, type AgendaContext } from './agenda.js';
import { isIsoDate, isTime } from './dates.js';
import { fail } from './errors.js';
import type { AgendaItem, AgendaName, AgendaSpecies, AnimalId, Area, CatalogId, Incident, IncidentPhoto, IncidentPriority, IsoDate, IsoDateTime, Staff, UserId } from './types.js';

export const MAX_INCIDENT_PHOTOS = 3;
export const INCIDENT_PRIORITIES: readonly IncidentPriority[] = ['normal', 'importante', 'urgente'];
export const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
/** Tamaño máximo por foto (el navegador las reduce antes de subir). */
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;

export interface IncidentContext {
  now: IsoDateTime;
  userId: UserId;
  newId: string;
  areas?: readonly Area[];
}

export interface NewIncidentInput {
  animalId?: AnimalId;
  animalName?: string;
  species: AgendaSpecies;
  areaId: CatalogId;
  text: string;
  priority: IncidentPriority;
  reporterStaffId?: CatalogId;
  photos?: IncidentPhoto[];
}

export function isIncidentOpen(i: Pick<Incident, 'status'>): boolean {
  return i.status !== 'resuelta';
}

function validatePhoto(p: IncidentPhoto): void {
  if (!p.key) fail('invalid_photo', 'Foto sin clave.', 'photos');
  if (!ALLOWED_PHOTO_MIME.includes(p.mime)) fail('invalid_photo', 'Formato de foto no admitido.', 'photos');
  if (!(p.bytes > 0) || p.bytes > MAX_PHOTO_BYTES) fail('invalid_photo', 'La foto es demasiado grande.', 'photos');
}

const SPECIES_TO_AREA: Record<AgendaSpecies, string | undefined> = { CAN: 'perros', FEL: 'gatos', otra: undefined };

export function createIncident(input: NewIncidentInput, ctx: IncidentContext): Incident {
  const hasAnimal = input.animalId !== undefined;
  const name = input.animalName?.trim();
  if (!hasAnimal && !name) fail('required', 'Indica el animal (ficha o nombre).', 'animalId');
  if (!AGENDA_SPECIES.includes(input.species)) fail('invalid_species', 'Indica la especie.', 'species');
  const area = ctx.areas?.find((a) => a.id === input.areaId);
  if (!area || !area.active) fail('invalid_area', 'Selecciona una ubicación activa.', 'areaId');
  const areaSpecies = SPECIES_TO_AREA[input.species];
  if (areaSpecies && area.species.length && !area.species.includes(areaSpecies as never))
    fail('invalid_area', 'La ubicación no corresponde a la especie.', 'areaId');
  const text = input.text?.trim();
  if (!text) fail('required', 'Describe qué ocurre.', 'text');
  if (!INCIDENT_PRIORITIES.includes(input.priority)) fail('invalid_priority', 'Prioridad no válida.', 'priority');
  const photos = input.photos ?? [];
  if (photos.length > MAX_INCIDENT_PHOTOS) fail('too_many_photos', `Máximo ${MAX_INCIDENT_PHOTOS} fotos.`, 'photos');
  photos.forEach(validatePhoto);

  const incident: Incident = {
    id: ctx.newId,
    species: input.species,
    areaId: area.id,
    areaName: area.name,
    text,
    priority: input.priority,
    reporterUserId: ctx.userId,
    photos: [...photos],
    status: 'pendiente',
    statusEvents: [{ status: 'pendiente', at: ctx.now, by: ctx.userId }],
    createdAt: ctx.now,
  };
  if (hasAnimal) incident.animalId = input.animalId!;
  if (name) incident.animalName = name;
  if (input.reporterStaffId) incident.reporterStaffId = input.reporterStaffId;
  return incident;
}

/** Añade una foto subida después del alta (sin superar el máximo; no en resueltas). */
export function addIncidentPhoto(incident: Incident, photo: IncidentPhoto): Incident {
  if (!isIncidentOpen(incident)) fail('closed', 'La incidencia está resuelta.');
  if (incident.photos.length >= MAX_INCIDENT_PHOTOS) fail('too_many_photos', `Máximo ${MAX_INCIDENT_PHOTOS} fotos.`, 'photos');
  if (incident.photos.some((p) => p.key === photo.key)) return incident;
  validatePhoto(photo);
  return { ...incident, photos: [...incident.photos, photo] };
}

/** Los cambios de una incidencia solo pueden tocar estado, fotos añadidas y resolución. */
export function assertIncidentImmutable(before: Incident, after: Incident): void {
  const keys: (keyof Incident)[] = ['id', 'animalId', 'animalName', 'species', 'areaId', 'areaName', 'text', 'priority', 'reporterUserId', 'reporterStaffId', 'createdAt'];
  for (const k of keys) if (before[k] !== after[k]) fail('immutable', 'Los datos originales de la incidencia no se modifican.', k);
  for (const p of before.photos) if (!after.photos.some((q) => q.key === p.key)) fail('immutable', 'Las fotos de la incidencia no se borran.', 'photos');
}

function withStatus(i: Incident, status: Incident['status'], ctx: { now: IsoDateTime; userId: UserId }): Incident {
  if (i.status === status) return i;
  return { ...i, status, statusEvents: [...i.statusEvents, { status, at: ctx.now, by: ctx.userId }] };
}

/** Pasa a "en proceso". */
export function startIncident(incident: Incident, ctx: { now: IsoDateTime; userId: UserId }): Incident {
  if (!isIncidentOpen(incident)) fail('closed', 'La incidencia está resuelta.');
  if (incident.status === 'en_proceso') fail('already_started', 'La incidencia ya está en proceso.');
  return withStatus(incident, 'en_proceso', ctx);
}

export interface IncidentAppointmentInput {
  agenda: AgendaName;
  date: IsoDate;
  /** Obligatoria en citas de incidencia (franja del planificador). */
  time: string;
  appointmentTypeId: CatalogId;
  notes?: string;
}

function baseFromIncident(incident: Incident) {
  return {
    kind: 'cita' as const,
    species: incident.species,
    incidentId: incident.id,
    ...(incident.animalId !== undefined
      ? { animalId: incident.animalId }
      : { externalAnimal: { name: incident.animalName ?? '', species: incident.species } }),
  };
}

/** Da cita (Carlet o Modevet) a una incidencia abierta. No la resuelve. */
export function createIncidentAppointment(
  incident: Incident,
  input: IncidentAppointmentInput,
  ctx: AgendaContext,
): { incident: Incident; appointment: AgendaItem } {
  if (!isIncidentOpen(incident)) fail('closed', 'La incidencia debe estar abierta.');
  if (input.agenda !== 'carlet' && input.agenda !== 'modevet') fail('invalid_agenda', 'Selecciona Carlet o Modevet.', 'agenda');
  if (!isIsoDate(input.date)) fail('invalid_date', 'Indica la fecha prevista.', 'date');
  if (!isTime(input.time)) fail('invalid_time', 'Elige una franja en el calendario.', 'time');
  const appointment = createAgendaItem(
    { ...baseFromIncident(incident), agenda: input.agenda, date: input.date, time: input.time, text: input.notes ?? '', appointmentTypeId: input.appointmentTypeId, isReferral: false },
    ctx,
  );
  return { incident: withStatus(incident, incident.status === 'pendiente' ? 'en_proceso' : incident.status, ctx), appointment };
}

export interface ReferralInput {
  date: IsoDate;
  time?: string;
  appointmentTypeId: CatalogId;
  notes?: string;
}

export function isReferral(item: Pick<AgendaItem, 'isReferral' | 'incidentId'>): boolean {
  return !!item.incidentId && !!item.isReferral;
}

/** Deriva a Modevet. Máximo una derivación abierta por incidencia. */
export function createReferral(
  incident: Incident,
  existing: readonly AgendaItem[],
  input: ReferralInput,
  ctx: AgendaContext,
): { incident: Incident; referral: AgendaItem } {
  if (!isIncidentOpen(incident)) fail('closed', 'La incidencia debe estar abierta.');
  if (!isIsoDate(input.date)) fail('invalid_date', 'Indica la fecha prevista.', 'date');
  if (input.time && !isTime(input.time)) fail('invalid_time', 'La hora no es válida.', 'time');
  if (existing.some((r) => r.incidentId === incident.id && isReferral(r) && !isClosedAgendaItem(r)))
    fail('referral_open', 'Esta incidencia ya tiene una derivación pendiente.');
  const referral = createAgendaItem(
    {
      ...baseFromIncident(incident),
      agenda: 'modevet',
      date: input.date,
      ...(input.time ? { time: input.time } : {}),
      text: input.notes ?? '',
      appointmentTypeId: input.appointmentTypeId,
      isReferral: true,
    },
    ctx,
  );
  return { incident: withStatus(incident, incident.status === 'pendiente' ? 'en_proceso' : incident.status, ctx), referral };
}

export interface ResolveInput {
  byStaffId: CatalogId;
  treatment: string;
}

/**
 * Resuelve la incidencia y cierra en cascada sus citas/derivaciones abiertas (estado "concluida" /
 * "concluido") copiando responsable y tratamiento. Devuelve solo los elementos de agenda que cambian.
 */
export function resolveIncident(
  incident: Incident,
  linked: readonly AgendaItem[],
  input: ResolveInput,
  ctx: { now: IsoDateTime; userId: UserId; staff?: readonly Staff[] },
): { incident: Incident; updatedItems: AgendaItem[] } {
  if (!isIncidentOpen(incident)) fail('closed', 'La incidencia ya está resuelta.');
  const treatment = input.treatment?.trim();
  if (!input.byStaffId) fail('required', 'Selecciona quién ha revisado al animal.', 'byStaffId');
  if (ctx.staff && !ctx.staff.some((s) => s.id === input.byStaffId && s.active))
    fail('invalid_staff', 'El responsable no existe o está desactivado.', 'byStaffId');
  if (!treatment) fail('required', 'Escribe la actuación realizada.', 'treatment');
  const resolution = { byStaffId: input.byStaffId, treatment, at: ctx.now };
  const resolved: Incident = { ...withStatus(incident, 'resuelta', ctx), resolution };
  const updatedItems = linked
    .filter((i) => i.incidentId === incident.id && !isClosedAgendaItem(i))
    .map((i): AgendaItem => {
      const status = i.kind === 'cita' ? 'concluida' : 'concluido';
      return { ...i, status, resolution, statusEvents: [...i.statusEvents, { status, at: ctx.now, by: ctx.userId }] };
    });
  return { incident: resolved, updatedItems };
}

/** Incidencias de una persona (seguimiento de Bienestar), más recientes primero. */
export function ownIncidents(incidents: readonly Incident[], userId: UserId, staffId?: CatalogId): Incident[] {
  return incidents
    .filter((i) => (staffId ? i.reporterStaffId === staffId : i.reporterUserId === userId))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
