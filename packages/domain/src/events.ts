/**
 * Historial de eventos: máquina de estados (regla 1), efectos de un evento nuevo (reglas 2-5),
 * borrado (regla 7) y derivados (regla 8).
 */
import { catalogIndex, RETURN_SUBTYPE_CODES } from './catalogs.js';
import { isIsoDate } from './dates.js';
import { DomainError } from './errors.js';
import type {
  Animal,
  AnimalDerived,
  CatalogId,
  ContactId,
  DomainCatalogs,
  EventDocument,
  EventId,
  EventTypeCode,
  HistoryEvent,
  IsoDate,
  IsoDateTime,
  StatusChange,
  Subtype,
  UserId,
} from './types.js';
import { EVENT_TYPE_CODES } from './types.js';

// ---------------------------------------------------------------------------
// Orden cronológico
// ---------------------------------------------------------------------------

/**
 * Orden cronológico de eventos: fecha del evento, luego `createdAt`, luego id.
 * (La app vieja usaba `max(id)`; con ids conservados en la migración el desempate por id da lo mismo.)
 */
export function compareEvents(a: HistoryEvent, b: HistoryEvent): number {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
  return a.id - b.id;
}

export function sortEvents(events: readonly HistoryEvent[]): HistoryEvent[] {
  return [...events].sort(compareEvents);
}

/**
 * Primer evento registrado (el alta). Se decide por orden de registro (`createdAt`, id), no por fecha:
 * una llegada antigua añadida después no pasa a ser "el primero".
 */
export function firstRegisteredEvent(events: readonly HistoryEvent[]): HistoryEvent | undefined {
  let first: HistoryEvent | undefined;
  for (const e of events) {
    if (!first || e.createdAt < first.createdAt || (e.createdAt === first.createdAt && e.id < first.id)) first = e;
  }
  return first;
}

// ---------------------------------------------------------------------------
// Máquina de estados (regla 1)
// ---------------------------------------------------------------------------

export interface AllowedEvents {
  typeIds: EventTypeCode[];
  /** Subtipos activos permitidos (ya filtrados por tipo y por restricciones de subtipo). */
  subtypes: Subtype[];
}

/**
 * Tipos y subtipos que se pueden añadir a un animal en un estado (`statusCode`).
 * `null` = animal nuevo (el alta es siempre una Llegada).
 * Estados desconocidos (creados después) se tratan como "resto": todo permitido.
 */
export function allowedEventTypes(statusCode: string | null | undefined, subtypes: readonly Subtype[]): AllowedEvents {
  let typeIds: EventTypeCode[];
  let subtypeFilter: (s: Subtype) => boolean = () => true;
  switch (statusCode) {
    case null:
    case undefined:
      typeIds = ['llegada'];
      break;
    case 'cadaver':
    case 'eutanasiado':
    case 'fallecido':
      typeIds = [];
      break;
    case 'disponible':
      typeIds = ['salida', 'veterinario', 'movimientos'];
      break;
    case 'translado':
      typeIds = ['llegada'];
      break;
    case 'acogida':
    case 'acogida_solidaria':
      typeIds = ['veterinario', 'movimientos'];
      subtypeFilter = (s) => s.typeId !== 'movimientos' || s.code === 'devolucion_desde_acogida';
      break;
    case 'adoptado':
      typeIds = ['llegada', 'veterinario'];
      break;
    default:
      typeIds = [...EVENT_TYPE_CODES];
  }
  const allowed = subtypes.filter((s) => s.active && typeIds.includes(s.typeId) && subtypeFilter(s));
  return { typeIds, subtypes: allowed };
}

export function isSubtypeAllowed(statusCode: string | null | undefined, subtype: Subtype, subtypes: readonly Subtype[]): boolean {
  return allowedEventTypes(statusCode, subtypes).subtypes.some((s) => s.id === subtype.id);
}

// ---------------------------------------------------------------------------
// Evento nuevo
// ---------------------------------------------------------------------------

/** Datos de un evento nuevo tal como llegan del formulario (el contacto y la ciudad ya resueltos). */
export interface NewEventInput {
  subtypeId: CatalogId;
  /** Fecha del evento (solo si el subtipo tiene flag `date`). */
  date?: IsoDate;
  /** Trabajador (solo si el subtipo tiene flag `user`). */
  userId?: UserId;
  contactId?: ContactId;
  centerId?: CatalogId;
  vaccineId?: CatalogId;
  illnessId?: CatalogId;
  colonyId?: CatalogId;
  /** Llegada: ciudad de recogida (ya creada/normalizada por la API). */
  cityId?: CatalogId;
  cityName?: string;
  address?: string;
  zip?: string;
  /** Llegada: fecha de recogida. */
  collectionDate?: IsoDate;
  notes?: string;
  switchValue?: boolean;
  document?: EventDocument;
}

export interface EventContext {
  /** Hoy en Europe/Madrid. */
  today: IsoDate;
  /** Instante actual (ISO UTC). */
  now: IsoDateTime;
  /** Usuario logueado. */
  userId: UserId;
  catalogs: DomainCatalogs;
  /** Id para el evento nuevo (contador de la API). */
  newEventId: EventId;
}

const ZIP_RE = /^[0-9A-Za-z]{5,8}$/;

/** Última llegada (la de fecha más reciente, regla 8). */
export function lastArrivalEvent(events: readonly HistoryEvent[]): HistoryEvent | undefined {
  return lastOf(events, (e) => e.typeId === 'llegada');
}

function lastOf(events: readonly HistoryEvent[], pred: (e: HistoryEvent) => boolean): HistoryEvent | undefined {
  let best: HistoryEvent | undefined;
  for (const e of events) if (pred(e) && (!best || compareEvents(e, best) > 0)) best = e;
  return best;
}

/**
 * Valida un evento nuevo. Devuelve la lista de errores (vacía si es válido); `applyEvent` lanza el primero.
 * `animal` puede ser `null` para el alta (primera llegada).
 */
export function validateNewEvent(
  animal: Pick<Animal, 'statusId'> | null,
  events: readonly HistoryEvent[],
  input: NewEventInput,
  catalogs: DomainCatalogs,
): DomainError[] {
  const idx = catalogIndex(catalogs);
  const errors: DomainError[] = [];
  const subtype = idx.subtype(input.subtypeId);
  if (!subtype) return [new DomainError('subtype_not_found', 'El subtipo no existe.', 'subtypeId')];
  if (!subtype.active) errors.push(new DomainError('subtype_inactive', 'El subtipo está desactivado.', 'subtypeId'));

  const statusCode = animal ? (idx.statusCode(animal.statusId) ?? '') : null;
  if (!isSubtypeAllowed(statusCode, subtype, catalogs.subtypes)) {
    errors.push(
      new DomainError(
        'event_not_allowed',
        animal ? 'Este tipo de evento no se permite en el estado actual del animal.' : 'El alta de un animal tiene que ser una Llegada.',
        'subtypeId',
      ),
    );
  }

  const req = (cond: boolean, field: keyof NewEventInput, message: string) => {
    if (cond) errors.push(new DomainError('required', message, field));
  };
  req(subtype.user && !input.userId, 'userId', 'Indica el trabajador.');
  req(subtype.contact && input.contactId === undefined, 'contactId', 'Indica el contacto.');
  req(subtype.center && !input.centerId, 'centerId', 'Indica el centro.');
  req(subtype.vaccine && !input.vaccineId, 'vaccineId', 'Indica la vacuna.');
  req(subtype.illness && !input.illnessId, 'illnessId', 'Indica la enfermedad.');
  req(subtype.colony && !input.colonyId, 'colonyId', 'Indica la colonia.');
  req(subtype.docUpload && !input.document, 'document', 'Adjunta el documento.');
  req(subtype.switch && typeof input.switchValue !== 'boolean', 'switchValue', `Indica "${subtype.switchLabel ?? 'sí/no'}".`);

  if (subtype.date) {
    if (!input.date) errors.push(new DomainError('required', 'Indica la fecha.', 'date'));
    else if (!isIsoDate(input.date)) errors.push(new DomainError('invalid_date', 'La fecha no es válida.', 'date'));
  }

  const isReturn = RETURN_SUBTYPE_CODES.includes(subtype.code);
  if (subtype.typeId === 'llegada') {
    if (!input.collectionDate) errors.push(new DomainError('required', 'Indica la fecha de recogida.', 'collectionDate'));
    else if (!isIsoDate(input.collectionDate))
      errors.push(new DomainError('invalid_date', 'La fecha de recogida no es válida.', 'collectionDate'));
    if (!isReturn) {
      req(!input.cityId, 'cityId', 'Indica la ciudad de recogida.');
      req(!input.address?.trim(), 'address', 'Indica la dirección de recogida.');
      if (!input.zip?.trim()) errors.push(new DomainError('required', 'Indica el código postal.', 'zip'));
      else if (!ZIP_RE.test(input.zip.trim())) errors.push(new DomainError('invalid_zip', 'El código postal no es válido.', 'zip'));
    }
  }
  if (isReturn && !lastArrivalEvent(events)) {
    errors.push(new DomainError('no_previous_arrival', 'No hay una llegada anterior de la que copiar la dirección.', 'subtypeId'));
  }
  return errors;
}

export interface ApplyEventResult {
  animal: Animal;
  event: HistoryEvent;
  /** Historial completo con el evento nuevo, en orden cronológico. */
  events: HistoryEvent[];
}

/**
 * Aplica un evento nuevo a un animal (función pura). Lanza `DomainError` si no es válido.
 *
 * - Estado → `resultStatusId` del subtipo, salvo Veterinario (regla 2).
 * - Subtipo con `center` → cambia el centro (regla 2).
 * - Salida: fecha = hoy salvo flag `date`; copia el centro actual y la ciudad de la última llegada (regla 3).
 * - Llegada: fecha = fecha de recogida; las devoluciones copian ciudad/dirección/CP de la última llegada (regla 4).
 * - Subtipo sin flag `user` → trabajador = usuario logueado (regla 5).
 * - Solo se guardan los campos que el subtipo pide.
 */
export function applyEvent(
  animal: Animal,
  events: readonly HistoryEvent[],
  input: NewEventInput,
  ctx: EventContext,
): ApplyEventResult {
  const errors = validateNewEvent(animal, events, input, ctx.catalogs);
  if (errors.length) throw errors[0]!;
  const event = buildEvent(animal, events, input, ctx);
  return finish(animal, [...events, event], event, ctx);
}

/**
 * Alta de un animal: el animal (sin estado) + su primera llegada. `animal` trae los datos de la ficha.
 */
export function createAnimalWithArrival(
  animal: Omit<Animal, keyof AnimalDerived | 'statusId' | 'createdAt' | 'updatedAt'> & Partial<Pick<Animal, 'createdAt'>>,
  input: NewEventInput,
  ctx: EventContext,
): ApplyEventResult {
  const errors = validateNewEvent(null, [], input, ctx.catalogs);
  if (errors.length) throw errors[0]!;
  const base: Animal = {
    ...animal,
    ...emptyDerived(),
    createdAt: animal.createdAt ?? ctx.now,
    updatedAt: ctx.now,
  };
  delete base.statusId;
  const event = buildEvent(base, [], input, ctx);
  return finish(base, [event], event, ctx);
}

function buildEvent(animal: Animal, events: readonly HistoryEvent[], input: NewEventInput, ctx: EventContext): HistoryEvent {
  const subtype = catalogIndex(ctx.catalogs).subtype(input.subtypeId)!;
  const lastArrival = lastArrivalEvent(events);
  const isReturn = RETURN_SUBTYPE_CODES.includes(subtype.code);

  let date: IsoDate = subtype.date && input.date ? input.date : ctx.today;
  if (subtype.typeId === 'llegada' && input.collectionDate) date = input.collectionDate;

  const event: HistoryEvent = {
    id: ctx.newEventId,
    animalId: animal.id,
    typeId: subtype.typeId,
    subtypeId: subtype.id,
    date,
    userId: subtype.user ? input.userId! : ctx.userId,
    createdAt: ctx.now,
    createdBy: ctx.userId,
  };
  if (subtype.contact && input.contactId !== undefined) event.contactId = input.contactId;
  if (subtype.center && input.centerId) event.centerId = input.centerId;
  if (subtype.vaccine && input.vaccineId) event.vaccineId = input.vaccineId;
  if (subtype.illness && input.illnessId) event.illnessId = input.illnessId;
  if (subtype.colony && input.colonyId) event.colonyId = input.colonyId;
  if (subtype.notes && input.notes?.trim()) event.notes = input.notes.trim();
  if (subtype.switch && typeof input.switchValue === 'boolean') event.switchValue = input.switchValue;
  // Documento: obligatorio con docUpload; opcional en cualquier Veterinario (como la app vieja).
  if (input.document && (subtype.docUpload || subtype.typeId === 'veterinario')) event.document = input.document;

  if (isReturn && lastArrival) {
    // Regla 4 (devoluciones). Se aplica también a "Devolución desde Acogida", que es un Movimiento:
    // no afecta a la última llegada y deja el origen anotado en el evento.
    copyPlace(event, lastArrival);
  } else if (subtype.typeId === 'llegada') {
    if (input.cityId) event.cityId = input.cityId;
    if (input.cityName) event.cityName = input.cityName;
    if (input.address?.trim()) event.address = input.address.trim();
    if (input.zip?.trim()) event.zip = input.zip.trim();
  }
  if (subtype.typeId === 'llegada' && input.collectionDate) event.collectionDate = input.collectionDate;

  if (subtype.typeId === 'salida') {
    // Regla 3: centro del que sale y ciudad de origen (de la última llegada).
    if (animal.centerId) event.centerId = animal.centerId;
    if (lastArrival?.cityId) event.cityId = lastArrival.cityId;
    if (lastArrival?.cityName) event.cityName = lastArrival.cityName;
  }
  return event;
}

function copyPlace(target: HistoryEvent, source: HistoryEvent): void {
  if (source.cityId) target.cityId = source.cityId;
  if (source.cityName) target.cityName = source.cityName;
  if (source.address) target.address = source.address;
  if (source.zip) target.zip = source.zip;
}

function finish(animal: Animal, allEvents: HistoryEvent[], event: HistoryEvent, ctx: EventContext): ApplyEventResult {
  const subtype = catalogIndex(ctx.catalogs).subtype(event.subtypeId)!;
  const next: Animal = { ...animal, updatedAt: ctx.now };
  if (subtype.typeId !== 'veterinario' && subtype.resultStatusId) next.statusId = subtype.resultStatusId;
  if (subtype.center && event.centerId) next.centerId = event.centerId;
  const sorted = sortEvents(allEvents);
  return { animal: withDerived(next, computeDerived(sorted, ctx.catalogs)), event, events: sorted };
}

// ---------------------------------------------------------------------------
// Borrado (regla 7)
// ---------------------------------------------------------------------------

export interface RemoveEventResult {
  animal: Animal;
  events: HistoryEvent[];
  removed: HistoryEvent;
  /** Clave S3 del adjunto a borrar, si lo tenía. */
  documentKeyToDelete?: string;
}

/**
 * Borra un evento: nunca el primero. Recalcula el estado (= resultado del último evento no veterinario)
 * y el centro (= del último evento de llegada o con flag `center`).
 */
export function removeEvent(
  animal: Animal,
  events: readonly HistoryEvent[],
  eventId: EventId,
  ctx: Pick<EventContext, 'now' | 'catalogs'>,
): RemoveEventResult {
  const removed = events.find((e) => e.id === eventId);
  if (!removed) throw new DomainError('event_not_found', 'El evento no existe.');
  if (firstRegisteredEvent(events)?.id === eventId) {
    throw new DomainError('first_event', 'No se puede eliminar el primer historial del animal.');
  }
  const rest = sortEvents(events.filter((e) => e.id !== eventId));
  const next: Animal = { ...animal, updatedAt: ctx.now };
  const status = currentStatusFromEvents(rest, ctx.catalogs);
  if (status) next.statusId = status;
  const center = currentCenterFromEvents(rest, ctx.catalogs);
  if (center) next.centerId = center;
  const result: RemoveEventResult = { animal: withDerived(next, computeDerived(rest, ctx.catalogs)), events: rest, removed };
  if (removed.document) result.documentKeyToDelete = removed.document.key;
  return result;
}

/** Estado = resultado del último evento no veterinario (con estado resultante). */
/**
 * Último evento por ORDEN DE REGISTRO (`createdAt`, id), no por fecha. Así calculaba la app vieja el estado
 * y el centro actuales (MAX id): con datos migrados, ordenar por fecha cambia el estado de ~309 animales.
 */
function lastRegistered(events: readonly HistoryEvent[], pred: (e: HistoryEvent) => boolean): HistoryEvent | undefined {
  let best: HistoryEvent | undefined;
  for (const e of events) {
    if (!pred(e)) continue;
    if (!best || e.createdAt > best.createdAt || (e.createdAt === best.createdAt && e.id > best.id)) best = e;
  }
  return best;
}

export function currentStatusFromEvents(events: readonly HistoryEvent[], catalogs: DomainCatalogs): CatalogId | undefined {
  const idx = catalogIndex(catalogs);
  const last = lastRegistered(events, (e) => e.typeId !== 'veterinario' && !!idx.subtype(e.subtypeId)?.resultStatusId);
  return last ? idx.subtype(last.subtypeId)?.resultStatusId : undefined;
}

/** Centro = del último evento de llegada o con flag `center` que tenga centro. */
export function currentCenterFromEvents(events: readonly HistoryEvent[], catalogs: DomainCatalogs): CatalogId | undefined {
  const idx = catalogIndex(catalogs);
  const last = lastRegistered(events, (e) => !!e.centerId && (e.typeId === 'llegada' || !!idx.subtype(e.subtypeId)?.center));
  return last?.centerId;
}

// ---------------------------------------------------------------------------
// Derivados
// ---------------------------------------------------------------------------

/** Sustituye los derivados de la ficha (borrando los que ya no aplican, p. ej. `lastExit`). */
export function withDerived(animal: Animal, derived: AnimalDerived): Animal {
  const next: Animal = { ...animal, ...derived };
  if (!derived.lastArrival) delete next.lastArrival;
  if (!derived.lastExit) delete next.lastExit;
  return next;
}

export function emptyDerived(): AnimalDerived {
  return { illnessIds: [], contactIds: [], arrivalDates: [], exitDates: [], statusChanges: [] };
}

/** Recalcula los campos derivados de la ficha a partir del historial completo. */
export function computeDerived(events: readonly HistoryEvent[], catalogs: DomainCatalogs): AnimalDerived {
  const idx = catalogIndex(catalogs);
  const sorted = sortEvents(events);
  const d = emptyDerived();
  const illness = new Set<CatalogId>();
  const contacts = new Set<ContactId>();
  for (const e of sorted) {
    if (e.illnessId) illness.add(e.illnessId);
    if (e.contactId !== undefined) contacts.add(e.contactId);
    if (e.typeId === 'llegada') d.arrivalDates.push(e.date);
    if (e.typeId === 'salida') d.exitDates.push(e.date);
    if (e.typeId !== 'veterinario') {
      const statusId = idx.subtype(e.subtypeId)?.resultStatusId;
      if (statusId) d.statusChanges.push({ statusId, date: e.date } satisfies StatusChange);
    }
  }
  d.illnessIds = [...illness];
  d.contactIds = [...contacts];
  const arrival = lastArrivalEvent(sorted);
  if (arrival) {
    d.lastArrival = { date: arrival.date, subtypeId: arrival.subtypeId };
    if (arrival.cityId) d.lastArrival.cityId = arrival.cityId;
    if (arrival.cityName) d.lastArrival.cityName = arrival.cityName;
    if (arrival.userId) d.lastArrival.userId = arrival.userId;
    if (arrival.centerId) d.lastArrival.centerId = arrival.centerId;
  }
  const exit = lastOf(sorted, (e) => e.typeId === 'salida');
  if (exit) d.lastExit = { date: exit.date, subtypeId: exit.subtypeId };
  return d;
}

export const lastArrival = (events: readonly HistoryEvent[], catalogs: DomainCatalogs) => computeDerived(events, catalogs).lastArrival;
export const lastExit = (events: readonly HistoryEvent[], catalogs: DomainCatalogs) => computeDerived(events, catalogs).lastExit;
export const illnessIds = (events: readonly HistoryEvent[]) => [...new Set(events.flatMap((e) => (e.illnessId ? [e.illnessId] : [])))];
export const contactIds = (events: readonly HistoryEvent[]) => [
  ...new Set(events.flatMap((e) => (e.contactId !== undefined ? [e.contactId] : []))),
];
