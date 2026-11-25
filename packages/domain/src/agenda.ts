/**
 * Agenda de Carlet y Modevet: citas, avisos y notas (spec §4 "Agenda"; reglas de la beta de Gestión).
 * `createdBy` y `statusEvents` los pone siempre el servidor: llegan en el contexto, nunca del cliente.
 */
import { isIsoDate, isTime } from './dates.js';
import { fail } from './errors.js';
import type {
  AgendaItem,
  AgendaKind,
  AgendaName,
  AgendaSpecies,
  AgendaStatus,
  AgendaTarget,
  AnimalId,
  AppointmentAction,
  AppointmentStatus,
  AppointmentType,
  CatalogId,
  IsoDate,
  IsoDateTime,
  NoteStatus,
  Staff,
  UserId,
} from './types.js';

export const APPOINTMENT_STATUSES: readonly AppointmentStatus[] = ['pendiente', 'concluida', 'no_presentado', 'cancelada', 'reagendada'];
export const NOTE_STATUSES: readonly NoteStatus[] = ['pendiente', 'concluido'];
export const CLOSED_AGENDA_STATUSES: readonly AgendaStatus[] = ['concluida', 'concluido', 'no_presentado', 'cancelada', 'reagendada'];
export const AGENDA_SPECIES: readonly AgendaSpecies[] = ['CAN', 'FEL', 'otra'];

export const AGENDA_STATUS_LABELS: Record<AgendaStatus, string> = {
  pendiente: 'Pendiente',
  concluida: 'Concluida',
  concluido: 'Concluido',
  no_presentado: 'No se presentó',
  cancelada: 'Cancelada',
  reagendada: 'Reagendada',
};

export interface AgendaContext {
  now: IsoDateTime;
  userId: UserId;
  /** Id para el elemento nuevo (uuid generado por la API). */
  newId: string;
  appointmentTypes?: readonly AppointmentType[];
  staff?: readonly Staff[];
}

export interface NewAgendaItemInput {
  kind: AgendaKind;
  agenda: AgendaTarget;
  date: IsoDate;
  time?: string;
  text?: string;
  // Cita:
  appointmentTypeId?: CatalogId;
  requestedById?: CatalogId;
  animalId?: AnimalId;
  externalAnimal?: { name: string; species: string };
  species?: AgendaSpecies;
  actions?: AppointmentAction[];
  owner?: { name: string; phone?: string; email?: string };
  incidentId?: string;
  isReferral?: boolean;
}

export function isClosedAgendaItem(item: Pick<AgendaItem, 'status'>): boolean {
  return CLOSED_AGENDA_STATUSES.includes(item.status);
}

export function statusesFor(kind: AgendaKind): readonly AgendaStatus[] {
  return kind === 'cita' ? APPOINTMENT_STATUSES : NOTE_STATUSES;
}

/** ¿Aparece en esta agenda? (avisos y notas pueden ir a "ambas"). */
export function targetsAgenda(item: Pick<AgendaItem, 'agenda'>, agenda: AgendaName): boolean {
  return item.agenda === agenda || item.agenda === 'ambas';
}

export function appointmentTypeSnapshot(types: readonly AppointmentType[] | undefined, id: CatalogId | undefined) {
  const t = types?.find((x) => x.id === id);
  if (!t || !t.active) fail('invalid_appointment_type', 'Selecciona un tipo de cita activo.', 'appointmentTypeId');
  if (!/^#[0-9a-f]{6}$/i.test(t.color)) fail('invalid_appointment_type', 'El tipo de cita no tiene un color válido.', 'appointmentTypeId');
  return { id: t.id, name: t.name, color: t.color };
}

/** Valida y crea un elemento de agenda (estado pendiente). */
export function createAgendaItem(input: NewAgendaItemInput, ctx: AgendaContext): AgendaItem {
  if (!['cita', 'aviso', 'nota'].includes(input.kind)) fail('invalid_kind', 'Tipo de elemento no válido.', 'kind');
  if (!['carlet', 'modevet', 'ambas'].includes(input.agenda)) fail('invalid_agenda', 'Agenda no válida.', 'agenda');
  if (input.agenda === 'ambas' && input.kind === 'cita')
    fail('invalid_agenda', 'Una cita tiene que ser de Carlet o de Modevet.', 'agenda');
  if (!isIsoDate(input.date)) fail('invalid_date', 'Indica una fecha válida.', 'date');
  if (input.time !== undefined && input.time !== '' && !isTime(input.time)) fail('invalid_time', 'La hora no es válida.', 'time');
  const text = (input.text ?? '').trim();

  const item: AgendaItem = {
    id: ctx.newId,
    kind: input.kind,
    agenda: input.agenda,
    date: input.date,
    text,
    status: 'pendiente',
    createdBy: ctx.userId,
    createdAt: ctx.now,
    statusEvents: [{ status: 'pendiente', at: ctx.now, by: ctx.userId }],
  };
  if (input.time) item.time = input.time;

  if (input.kind !== 'cita') {
    if (!text) fail('required', 'Escribe el texto.', 'text');
    return item;
  }

  item.appointmentType = appointmentTypeSnapshot(ctx.appointmentTypes, input.appointmentTypeId);

  if (!input.incidentId) {
    // "Solicitada por": personal activo veterinaria/auxiliar (salvo citas de incidencia).
    const s = ctx.staff?.find((x) => x.id === input.requestedById);
    if (!s || !s.active || !s.roles.some((r) => r === 'veterinaria' || r === 'auxiliar'))
      fail('invalid_requested_by', 'Indica quién solicita la cita (veterinaria o auxiliar activa).', 'requestedById');
    item.requestedBy = { id: s.id, name: s.name };
  } else {
    item.incidentId = input.incidentId;
    const s = input.requestedById ? ctx.staff?.find((x) => x.id === input.requestedById) : undefined;
    if (s) item.requestedBy = { id: s.id, name: s.name };
  }

  const hasAnimal = input.animalId !== undefined;
  const hasExternal = !!input.externalAnimal?.name?.trim();
  if (hasAnimal === hasExternal) fail('invalid_animal', 'Indica un animal con ficha o un animal externo (uno de los dos).', 'animalId');
  if (hasAnimal) item.animalId = input.animalId!;
  else item.externalAnimal = { name: input.externalAnimal!.name.trim(), species: input.externalAnimal!.species?.trim() ?? '' };

  if (!input.species || !AGENDA_SPECIES.includes(input.species)) fail('invalid_species', 'Indica la especie.', 'species');
  item.species = input.species;
  item.actions = (input.actions ?? []).filter((a) => a.categoryId || a.subcategoryId || a.text?.trim());
  if (input.owner?.name?.trim()) {
    item.owner = { name: input.owner.name.trim() };
    if (input.owner.phone?.trim()) item.owner.phone = input.owner.phone.trim();
    if (input.owner.email?.trim()) item.owner.email = input.owner.email.trim().toLowerCase();
  }
  item.isReferral = !!input.isReferral;
  return item;
}

/** Campos editables de un elemento existente (nunca fecha ni hora: eso es reagendar). */
export interface AgendaItemPatch {
  text?: string;
  actions?: AppointmentAction[];
  owner?: { name: string; phone?: string; email?: string };
  date?: IsoDate;
  time?: string;
}

export function updateAgendaItem(item: AgendaItem, patch: AgendaItemPatch): AgendaItem {
  if (patch.date !== undefined && patch.date !== item.date)
    fail('date_locked', 'No se cambia la fecha de un elemento: reagenda la cita.', 'date');
  if (patch.time !== undefined && (patch.time || undefined) !== item.time)
    fail('date_locked', 'No se cambia la hora de un elemento: reagenda la cita.', 'time');
  if (item.status === 'reagendada') fail('closed', 'Una cita reagendada no se modifica.');
  const next: AgendaItem = { ...item };
  if (patch.text !== undefined) {
    next.text = patch.text.trim();
    if (item.kind !== 'cita' && !next.text) fail('required', 'Escribe el texto.', 'text');
  }
  if (patch.actions !== undefined && item.kind === 'cita') next.actions = patch.actions;
  if (patch.owner !== undefined && item.kind === 'cita') next.owner = patch.owner;
  return next;
}

/**
 * Cambia el estado. "reagendada" solo se alcanza con `reschedule`, y una cita reagendada ya no cambia.
 * Se permite corregir un estado cerrado (p. ej. volver a pendiente), como en la beta.
 */
export function changeAgendaStatus(item: AgendaItem, status: AgendaStatus, ctx: Pick<AgendaContext, 'now' | 'userId'>): AgendaItem {
  if (!statusesFor(item.kind).includes(status)) fail('invalid_status', 'Estado no válido para este elemento.', 'status');
  if (status === 'reagendada') fail('use_reschedule', 'Para reagendar, elige la nueva fecha (reagendar).', 'status');
  if (item.status === 'reagendada') fail('closed', 'Una cita reagendada no cambia de estado.');
  if (item.status === status) return item;
  return { ...item, status, statusEvents: [...item.statusEvents, { status, at: ctx.now, by: ctx.userId }] };
}

/** Estados desde los que se puede reagendar (decisión: también tras "no se presentó"). */
export const RESCHEDULABLE_STATUSES: readonly AgendaStatus[] = ['pendiente', 'no_presentado'];

/**
 * Reagendar: crea una cita nueva pendiente con la nueva fecha/hora y marca la original "reagendada",
 * enlazadas en ambos sentidos. Una cita solo se reagenda una vez.
 */
export function reschedule(
  original: AgendaItem,
  target: { date: IsoDate; time?: string },
  ctx: AgendaContext,
): { original: AgendaItem; created: AgendaItem } {
  if (original.kind !== 'cita') fail('not_appointment', 'Solo se reagendan citas.');
  if (original.rescheduledToId || original.status === 'reagendada') fail('already_rescheduled', 'Esta cita ya se ha reagendado.');
  if (!RESCHEDULABLE_STATUSES.includes(original.status))
    fail('closed', 'Solo se reagenda una cita pendiente o no presentada.', 'status');
  if (!isIsoDate(target.date)) fail('invalid_date', 'Indica la nueva fecha.', 'date');
  if (target.time !== undefined && target.time !== '' && !isTime(target.time)) fail('invalid_time', 'La hora no es válida.', 'time');
  if (target.date === original.date && (target.time || undefined) === original.time)
    fail('same_slot', 'La nueva fecha y hora son las mismas que las de la cita.', 'date');
  if (ctx.newId === original.id) fail('invalid_id', 'Id de cita repetido.');

  const created: AgendaItem = {
    ...original,
    id: ctx.newId,
    date: target.date,
    status: 'pendiente',
    createdBy: ctx.userId,
    createdAt: ctx.now,
    statusEvents: [{ status: 'pendiente', at: ctx.now, by: ctx.userId }],
    rescheduledFromId: original.id,
  };
  delete created.time;
  delete created.rescheduledToId;
  delete created.resolution;
  if (target.time) created.time = target.time;

  const updated: AgendaItem = {
    ...original,
    status: 'reagendada',
    rescheduledToId: created.id,
    statusEvents: [...original.statusEvents, { status: 'reagendada', at: ctx.now, by: ctx.userId }],
  };
  return { original: updated, created };
}

/** Vista de un día de una agenda: franja "sin hora" y el resto por hora. Avisos/notas cerrados no se ven. */
export function agendaDay(items: readonly AgendaItem[], agenda: AgendaName, date: IsoDate) {
  const list = items.filter((i) => i.date === date && targetsAgenda(i, agenda) && (i.kind === 'cita' || !isClosedAgendaItem(i)));
  return {
    untimed: list.filter((i) => !i.time),
    timed: list.filter((i) => !!i.time).sort((a, b) => a.time!.localeCompare(b.time!)),
  };
}

/** Pendientes de días anteriores (para el aviso de la vista diaria). */
export function overdueItems(items: readonly AgendaItem[], agenda: AgendaName, today: IsoDate): AgendaItem[] {
  return items
    .filter((i) => i.date < today && targetsAgenda(i, agenda) && i.status === 'pendiente')
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));
}

/** Clave de orden de la tabla (`<fecha>#<hora|99:99>#<id>`, spec §8). */
export function agendaSortKey(item: Pick<AgendaItem, 'date' | 'time' | 'id'>): string {
  return `${item.date}#${item.time ?? '99:99'}#${item.id}`;
}

