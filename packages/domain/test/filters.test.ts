import { beforeEach, describe, expect, it } from 'vitest';
import { filterAnimals, matchingContactIds, paginate, sortAnimals, type Animal, type AnimalFilters, type Contact } from '../src/index.js';
import { buildAnimal, resetIds, TODAY, ZONES } from './fixtures.js';

let animals: Animal[];

const contacts: Contact[] = [
  { id: 1, name: 'Persona', surname: 'Uno Ejemplo', nif: '00000001R', kind: ['avisante'], createdAt: '' },
  { id: 7, name: 'Ána', surname: 'Prueba', nif: 'X0000007T', kind: ['adoptante'], createdAt: '' },
];

beforeEach(() => {
  resetIds();
  animals = [
    buildAnimal(
      1,
      [{ input: { subtypeId: 'adopcion', userId: 'w', contactId: 7, date: '2026-02-01' } }],
      { name: 'Luna', speciesId: 'sp-perro', gender: 'female', bornAt: '2020-03-15', weightKg: 12, size: 'medium', color: 'Negro', sterilized: true, chip: { number: '941000000000001' } },
      { collectionDate: '2026-01-10' },
    ).animal,
    buildAnimal(
      2,
      [{ input: { subtypeId: 'enfermedad', userId: 'w', date: '2026-02-03', illnessId: 'ill-x', switchValue: false } }],
      { name: 'Tor', speciesId: 'sp-gato', gender: 'male', bornAt: '2025-09-01', weightKg: 4, size: 'small', ppp: false, compatibleCats: true, visibleWeb: true, hasPhoto: true },
      { collectionDate: '2026-01-15', cityId: 'c-beta', centerId: 'carlet', userId: 'u-otro', subtypeId: 'aviso_chip' },
    ).animal,
    buildAnimal(
      3,
      [{ input: { subtypeId: 'acogida', userId: 'w', contactId: 1, date: '2026-03-01' } }],
      { name: 'Búho', speciesId: 'sp-perro', gender: 'male', weightKg: 30, size: 'big', ppp: true, compatibleDogs: true, breedId: 'br-1', color: 'negro' },
      { collectionDate: '2025-06-01', cityId: 'c-gamma' },
    ).animal,
  ];
});

const ids = (f: AnimalFilters, extra: Partial<Parameters<typeof filterAnimals>[2]> = {}) =>
  filterAnimals(animals, f, { today: TODAY, zones: ZONES, contacts, ...extra }, { pageSize: 100 }).items.map((a) => a.id).sort();

describe('filterAnimals', () => {
  it('sin filtros devuelve todo, ordenado por id descendente', () => {
    expect(filterAnimals(animals, {}, { today: TODAY }).items.map((a) => a.id)).toEqual([3, 2, 1]);
  });

  it('id, nombre (sin tildes ni mayúsculas), chip', () => {
    expect(ids({ id: 2 })).toEqual([2]);
    expect(ids({ name: 'buho' })).toEqual([3]);
    expect(ids({ name: 'U' })).toEqual([1, 3]);
    expect(ids({ chip: '941 000000000001' })).toEqual([1]);
    expect(ids({ hasChip: false })).toEqual([2, 3]);
  });

  it('especie, raza, sexo, color, tamaño, ppp', () => {
    expect(ids({ speciesId: 'sp-perro' })).toEqual([1, 3]);
    expect(ids({ breedId: 'br-1' })).toEqual([3]);
    expect(ids({ gender: 'male' })).toEqual([2, 3]);
    expect(ids({ color: 'NEGRO' })).toEqual([1, 3]);
    expect(ids({ size: 'small' })).toEqual([2]);
    expect(ids({ ppp: true })).toEqual([3]);
    expect(ids({ ppp: false })).toEqual([1, 2]);
  });

  it('peso mínimo y máximo', () => {
    expect(ids({ weightMin: 5 })).toEqual([1, 3]);
    expect(ids({ weightMax: 12 })).toEqual([1, 2]);
    expect(ids({ weightMin: 12, weightMax: 12 })).toEqual([1]);
  });

  it('edad por bornAt (años cumplidos); sin fecha de nacimiento no pasa', () => {
    // Luna nació el 15/03/2020: hoy (15/03/2026) cumple 6. Tor tiene 0.
    expect(ids({ ageMin: 6 })).toEqual([1]);
    expect(ids({ ageMin: 7 })).toEqual([]);
    expect(ids({ ageMax: 0 })).toEqual([2]);
    expect(ids({ ageMax: 5 })).toEqual([2]);
    expect(ids({ ageMax: 6 })).toEqual([1, 2]);
    expect(ids({ ageMin: 0 })).toEqual([1, 2]);
  });

  it('compatibilidades, esterilizado, visible web, foto', () => {
    expect(ids({ compatibleDogs: true })).toEqual([3]);
    expect(ids({ compatibleCats: true })).toEqual([2]);
    expect(ids({ sterilized: true })).toEqual([1]);
    expect(ids({ visibleWeb: true })).toEqual([2]);
    expect(ids({ hasPhoto: true })).toEqual([2]);
  });

  it('ciudad, zona, trabajador y subtipo de la última llegada', () => {
    expect(ids({ arrivalCityId: 'c-alfa' })).toEqual([1]);
    expect(ids({ arrivalZoneId: 'z-norte' })).toEqual([1, 2]);
    expect(ids({ arrivalZoneId: 'z-inexistente' })).toEqual([]);
    expect(ids({ arrivalUserId: 'u-otro' })).toEqual([2]);
    expect(ids({ arrivalSubtypeId: 'aviso_chip' })).toEqual([2]);
  });

  it('enfermedad alguna vez, centro, estado', () => {
    expect(ids({ illnessId: 'ill-x' })).toEqual([2]);
    expect(ids({ centerId: 'carlet' })).toEqual([2]);
    expect(ids({ statusId: 'adoptado' })).toEqual([1]);
    expect(ids({ statusId: 'disponible' })).toEqual([2]);
  });

  it('estado con rango de fecha de cambio de estado', () => {
    expect(ids({ statusId: 'acogida', statusDateFrom: '2026-03-01', statusDateTo: '2026-03-31' })).toEqual([3]);
    expect(ids({ statusId: 'acogida', statusDateFrom: '2026-01-01', statusDateTo: '2026-02-28' })).toEqual([]);
    // Tor sigue disponible desde su llegada (15/01); el veterinario del 03/02 no cuenta como cambio
    expect(ids({ statusId: 'disponible', statusDateFrom: '2026-02-01', statusDateTo: '2026-02-28' })).toEqual([]);
    expect(ids({ statusId: 'disponible', statusDateFrom: '2026-01-15' })).toEqual([2]);
  });

  it('rangos de llegada y salida (alguna, con uno o dos extremos)', () => {
    expect(ids({ arrivalDateFrom: '2026-01-01', arrivalDateTo: '2026-01-31' })).toEqual([1, 2]);
    expect(ids({ arrivalDateTo: '2025-12-31' })).toEqual([3]);
    expect(ids({ exitDateFrom: '2026-02-01', exitDateTo: '2026-02-01' })).toEqual([1]);
    expect(ids({ exitDateFrom: '2026-02-02' })).toEqual([]);
  });

  it('contacto por nombre o NIF', () => {
    expect(ids({ contact: 'ana' })).toEqual([1]);
    expect(ids({ contact: 'x0000007' })).toEqual([1]);
    expect(ids({ contact: 'uno ejemplo' })).toEqual([1, 2, 3]); // contacto 1 es el avisante de todas las llegadas de prueba
    expect(ids({ contact: 'nadie' })).toEqual([]);
  });

  it('búsqueda libre q (id, nombre o chip)', () => {
    expect(ids({ q: '3' })).toEqual([3]);
    expect(ids({ q: 'tor' })).toEqual([2]);
    expect(ids({ q: '94100' })).toEqual([1]);
  });

  it('combina filtros (y) e ignora vacíos', () => {
    expect(ids({ speciesId: 'sp-perro', gender: 'male' })).toEqual([3]);
    expect(ids({ name: '', speciesId: undefined })).toEqual([1, 2, 3]);
  });
});

describe('orden y paginación', () => {
  it('ordena por nombre, fecha de llegada y peso; vacíos al final', () => {
    expect(sortAnimals(animals, { field: 'name', dir: 'asc' }).map((a) => a.name)).toEqual(['Búho', 'Luna', 'Tor']);
    expect(sortAnimals(animals, { field: 'arrivalDate', dir: 'desc' }).map((a) => a.id)).toEqual([2, 1, 3]);
    expect(sortAnimals(animals, { field: 'bornAt', dir: 'asc' }).map((a) => a.id)).toEqual([1, 2, 3]);
    expect(sortAnimals(animals, { field: 'bornAt', dir: 'desc' }).map((a) => a.id)).toEqual([2, 1, 3]);
    expect(sortAnimals(animals, { field: 'weightKg', dir: 'desc' }).map((a) => a.id)).toEqual([3, 1, 2]);
    expect(sortAnimals(animals, { field: 'exitDate', dir: 'asc' }).map((a) => a.id)).toEqual([1, 3, 2]);
  });

  it('pagina y acota página y tamaño', () => {
    const items = Array.from({ length: 23 }, (_, i) => i);
    expect(paginate(items, 2, 10)).toMatchObject({ items: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], total: 23, page: 2, pages: 3 });
    expect(paginate(items, 99, 10).page).toBe(3);
    expect(paginate(items, 0, 10).page).toBe(1);
    expect(paginate(items, 1, 100000).pageSize).toBe(500);
    expect(paginate([], 1, 10)).toMatchObject({ items: [], total: 0, page: 1, pages: 1 });
    expect(filterAnimals(animals, {}, { today: TODAY }, { page: 2, pageSize: 2, sort: { field: 'id', dir: 'asc' } }).items.map((a) => a.id)).toEqual([3]);
  });

  it('matchingContactIds', () => {
    expect([...matchingContactIds(contacts, 'prueba')]).toEqual([7]);
  });
});
