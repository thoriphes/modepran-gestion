/** Datos sintéticos para los tests (nada real). */
import {
  applyEvent,
  createAnimalWithArrival,
  DEFAULT_STATUSES,
  DEFAULT_SUBTYPES,
  type Animal,
  type DomainCatalogs,
  type EventContext,
  type HistoryEvent,
  type NewEventInput,
  type Species,
  type Zone,
} from '../src/index.js';

export const SPECIES: Species[] = [
  { id: 'sp-perro', name: 'Perro', code: 'perro', active: true },
  { id: 'sp-gato', name: 'Gato', code: 'gato', active: true },
  { id: 'sp-conejo', name: 'Conejo', active: true },
  { id: 'sp-huron', name: 'Hurón', active: true },
];

export const ZONES: Zone[] = [{ id: 'z-norte', name: 'Mancomunidad Norte', cityIds: ['c-alfa', 'c-beta'], active: true }];

export const CATALOGS: DomainCatalogs = {
  statuses: DEFAULT_STATUSES,
  subtypes: DEFAULT_SUBTYPES,
  species: SPECIES,
  zones: ZONES,
};

export const NOW = '2026-03-15T10:00:00.000Z';
export const TODAY = '2026-03-15';

let nextEventId = 1000;
export function resetIds(): void {
  nextEventId = 1000;
}

export function ctx(over: Partial<EventContext> = {}): EventContext {
  return { today: TODAY, now: NOW, userId: 'u-login', catalogs: CATALOGS, newEventId: nextEventId++, ...over };
}

/** Llegada estándar (aviso) con ciudad. */
export function arrivalInput(over: Partial<NewEventInput> = {}): NewEventInput {
  return {
    subtypeId: 'aviso',
    userId: 'u-worker',
    contactId: 1,
    centerId: 'valencia',
    collectionDate: '2026-01-10',
    cityId: 'c-alfa',
    cityName: 'Alfa',
    address: 'Calle Falsa 1',
    zip: '46000',
    ...over,
  };
}

export function baseAnimal(id: number, over: Partial<Animal> = {}) {
  return {
    id,
    name: `Animal ${id}`,
    speciesId: 'sp-perro',
    gender: 'male' as const,
    sterilized: false,
    ppp: false,
    visibleWeb: false,
    compatibleDogs: false,
    compatibleCats: false,
    hasPhoto: false,
    ...over,
  };
}

/** Crea un animal con su llegada y aplica una secuencia de eventos. */
export function buildAnimal(
  id: number,
  steps: { input: NewEventInput; now?: string; today?: string }[] = [],
  over: Partial<Animal> = {},
  first: Partial<NewEventInput> = {},
): { animal: Animal; events: HistoryEvent[] } {
  const created = createAnimalWithArrival(baseAnimal(id, over), arrivalInput(first), ctx({ now: '2026-01-10T09:00:00.000Z', today: first.collectionDate ?? '2026-01-10' }));
  let animal = created.animal;
  let events = created.events;
  let n = 1;
  for (const s of steps) {
    const nowStamp = s.now ?? `2026-02-01T09:${String(n++).padStart(2, '0')}:00.000Z`;
    const r = applyEvent(animal, events, s.input, ctx({ now: nowStamp, today: s.today ?? s.input.date ?? TODAY }));
    animal = r.animal;
    events = r.events;
  }
  return { animal, events };
}
