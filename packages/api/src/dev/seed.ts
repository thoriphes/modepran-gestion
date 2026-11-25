/**
 * Datos SINTÉTICOS para dev y tests: todo inventado (nombres, NIF, teléfonos, direcciones). Nada real.
 */
import {
  applyEvent,
  createAnimalWithArrival,
  DEFAULT_STATUSES,
  DEFAULT_SUBTYPES,
  todayMadrid,
  addDays,
  type Animal,
  type Contact,
  type HistoryEvent,
  type User,
} from '@modepran/domain';
import type { BulkImportData, Repository } from '../repo/types.js';
import type { Catalogs } from '../types.js';

export const SEED_USERS: User[] = [
  { id: 'dev-admin', email: 'admin@dev.local', name: 'Admin Pruebas', profiles: ['admin'], active: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'dev-carlet', email: 'carlet@dev.local', name: 'Carlet Pruebas', profiles: ['carlet'], active: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'dev-modevet', email: 'modevet@dev.local', name: 'Modevet Pruebas', profiles: ['modevet'], active: true, createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'dev-bienestar', email: 'bienestar@dev.local', name: 'Bienestar Pruebas', profiles: ['bienestar'], active: true, createdAt: '2026-01-01T00:00:00.000Z' },
];

export function seedCatalogs(): Catalogs {
  return {
    statuses: DEFAULT_STATUSES,
    subtypes: DEFAULT_SUBTYPES,
    species: [
      { id: 'perro', name: 'Perro', code: 'perro', active: true },
      { id: 'gato', name: 'Gato', code: 'gato', active: true },
      { id: 'conejo', name: 'Conejo', active: true },
    ],
    breeds: [
      { id: 'mestizo-perro', name: 'Mestizo', speciesId: 'perro', active: true },
      { id: 'podenco', name: 'Podenco', speciesId: 'perro', active: true },
      { id: 'europeo', name: 'Común Europeo', speciesId: 'gato', active: true },
    ],
    cities: [
      { id: 'c-alfa', name: 'Villa Alfa', active: true },
      { id: 'c-beta', name: 'Puerto Beta', active: true },
      { id: 'c-gamma', name: 'Monte Gamma', active: true },
    ],
    zones: [{ id: 'z-norte', name: 'Mancomunidad Ficticia Norte', cityIds: ['c-alfa', 'c-beta'], active: true }],
    centers: [
      { id: 'valencia', name: 'Valencia', code: 'valencia', active: true },
      { id: 'carlet', name: 'Carlet', code: 'carlet', active: true },
    ],
    vaccines: [{ id: 'v-rabia', name: 'Rabia', active: true }],
    illnesses: [{ id: 'i-sarna', name: 'Sarna', active: true }],
    colonies: [{ id: 'col-1', name: 'Colonia del Parque Ficticio', active: true }],
    areas: [
      { id: 'a-cuarentena', name: 'Cuarentena', species: ['perros', 'gatos'], active: true },
      { id: 'a-campo', name: 'Campo Nuevo', species: ['perros'], active: true },
      { id: 'a-gatera', name: 'Gatera', species: ['gatos'], active: true },
    ],
    staff: [
      { id: 's-vet1', name: 'Veterinaria Uno', roles: ['veterinaria'], active: true },
      { id: 's-aux1', name: 'Auxiliar Uno', roles: ['auxiliar'], active: true },
      { id: 's-cui1', name: 'Cuidadora Uno', roles: ['cuidadora'], active: true },
    ],
    appointmentTypes: [
      { id: 'at-consulta', name: 'Consulta', color: '#2563eb', active: true },
      { id: 'at-cirugia', name: 'Cirugía', color: '#dc2626', active: true },
    ],
    actionCategories: [
      {
        id: 'ac-vacunas',
        name: 'Vacunación',
        active: true,
        subcategories: [{ id: 'acs-rabia', name: 'Rabia', active: true }],
      },
      {
        id: 'ac-desparasitar',
        name: 'Desparasitación',
        active: true,
        vetSubtypeId: 'desparasitacion',
        subcategories: [{ id: 'acs-interna', name: 'Interna', active: true, vetSubtypeId: 'desparasitacion' }],
      },
      { id: 'ac-cirugia', name: 'Cirugía', active: true, vetSubtypeId: 'intervencion', subcategories: [] },
    ],
  };
}

export const SIN_DATOS: Contact = { id: 1, name: 'SIN DATOS', kind: ['avisante'], createdAt: '2020-01-01T00:00:00.000Z' };

export function seedData(now: Date = new Date()): BulkImportData {
  const catalogs = seedCatalogs();
  const today = todayMadrid(now);
  const iso = now.toISOString();
  let eventId = 100;
  const contacts: Contact[] = [
    SIN_DATOS,
    { id: 2, name: 'Persona', surname: 'Inventada Uno', nif: '00000001R', phone: '600000001', email: 'uno@ejemplo.invalid', address: 'Calle Falsa 1', zip: '46000', cityId: 'c-alfa', cityName: 'Villa Alfa', kind: ['adoptante'], createdAt: iso },
    { id: 3, name: 'Persona', surname: 'Inventada Dos', nif: '00000002W', phone: '600000002', kind: ['acogedor'], createdAt: iso },
  ];
  const animals: Animal[] = [];
  const events: HistoryEvent[] = [];
  const names = ['Toby', 'Luna', 'Rocky', 'Misi', 'Canela', 'Bolt', 'Nala', 'Copito'];
  names.forEach((name, i) => {
    const id = 10 + i;
    const dog = i % 2 === 0;
    const ctx = (d: string) => ({ today: d, now: iso, userId: 'dev-carlet', catalogs, newEventId: ++eventId });
    const arrivalDate = addDays(today, -200 + i * 20);
    let res = createAnimalWithArrival(
      {
        id,
        name,
        speciesId: dog ? 'perro' : 'gato',
        breedId: dog ? 'mestizo-perro' : 'europeo',
        color: dog ? 'Marrón' : 'Atigrado',
        gender: i % 3 === 0 ? 'female' : 'male',
        size: dog ? 'medium' : 'small',
        bornAt: addDays(today, -365 * (1 + (i % 4))),
        sterilized: i % 2 === 1,
        ppp: false,
        visibleWeb: i < 5,
        compatibleDogs: true,
        compatibleCats: !dog,
        hasPhoto: i < 3,
        ...(i % 3 === 0 ? { chip: { number: `9410000000000${i}`, notes: 'Chip de prueba' } } : {}),
      },
      {
        subtypeId: 'aviso',
        userId: 's-cui1',
        contactId: 1,
        centerId: i % 2 ? 'carlet' : 'valencia',
        cityId: i % 3 === 0 ? 'c-gamma' : 'c-alfa',
        cityName: i % 3 === 0 ? 'Monte Gamma' : 'Villa Alfa',
        address: 'Camino Inventado s/n',
        zip: '46000',
        collectionDate: arrivalDate,
        notes: 'Recogida de prueba',
      },
      ctx(arrivalDate),
    );
    let animalEvents = res.events;
    if (i === 6) {
      res = applyEvent(res.animal, animalEvents, { subtypeId: 'adopcion', date: addDays(arrivalDate, 30), userId: 's-cui1', contactId: 2 }, ctx(today));
      animalEvents = res.events;
    }
    if (i === 7) {
      res = applyEvent(res.animal, animalEvents, { subtypeId: 'acogida', date: addDays(arrivalDate, 10), userId: 's-cui1', contactId: 3 }, ctx(today));
      animalEvents = res.events;
    }
    if (i === 1) {
      res = applyEvent(res.animal, animalEvents, { subtypeId: 'desparasitacion', date: addDays(arrivalDate, 5), userId: 's-vet1' }, ctx(today));
      animalEvents = res.events;
    }
    animals.push(res.animal);
    events.push(...animalEvents);
  });
  return { catalogs, animals, events, contacts };
}

/** Siembra un repositorio (memoria) con datos sintéticos. */
export async function seedRepository(repo: Repository, now: Date = new Date()) {
  const data = seedData(now);
  await repo.bulkImport(data);
  return data;
}
