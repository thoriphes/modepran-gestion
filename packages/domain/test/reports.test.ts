import { beforeEach, describe, expect, it } from 'vitest';
import {
  arrivalsBySpeciesSex,
  arrivalsBySubtype,
  censusAt,
  censusAtStartOf,
  censusExcelData,
  censusExcelTitle,
  dashboard,
  exitsBySpeciesSex,
  exitsBySubtype,
  gestionExcelData,
  gestionExcelTitle,
  GESTION_HEADERS,
  groupEventsByAnimal,
  monthlyCensus,
  monthlyCensusReport,
  type Animal,
  type HistoryEvent,
} from '../src/index.js';
import { buildAnimal, CATALOGS, resetIds } from './fixtures.js';

let animals: Animal[];
let events: HistoryEvent[];

const adopt = (date: string) => ({ input: { subtypeId: 'adopcion', userId: 'w', contactId: 7, date } });
const returnFromAdoption = (collectionDate: string, centerId = 'valencia') => ({
  input: { subtypeId: 'devolucion_desde_adopcion', userId: 'w', contactId: 7, centerId, collectionDate },
});

beforeEach(() => {
  resetIds();
  const list = [
    // A1 perro macho: llega 10/01 (Alfa, Valencia), adoptado 01/02
    buildAnimal(1, [adopt('2026-02-01')], { speciesId: 'sp-perro', gender: 'male' }, { collectionDate: '2026-01-10' }),
    // A2 gata: llega 15/01 (Beta, Carlet), acogida 20/01
    buildAnimal(
      2,
      [{ input: { subtypeId: 'acogida', userId: 'w', contactId: 8, date: '2026-01-20' } }],
      { speciesId: 'sp-gato', gender: 'female' },
      { collectionDate: '2026-01-15', cityId: 'c-beta', cityName: 'Beta', centerId: 'carlet' },
    ),
    // A3 perra: llega 05/02 (Gamma), disponible; veterinario 06/02
    buildAnimal(
      3,
      [{ input: { subtypeId: 'test', userId: 'w', date: '2026-02-06' } }],
      { speciesId: 'sp-perro', gender: 'female' },
      { collectionDate: '2026-02-05', cityId: 'c-gamma', cityName: 'Gamma' },
    ),
    // A4 conejo sin sexo: aviso de cadáver 05/01 (nunca en censo)
    buildAnimal(4, [], { speciesId: 'sp-conejo', gender: 'none' }, { subtypeId: 'aviso_cadaver', collectionDate: '2026-01-05' }),
    // A5 perro macho: llega 01/12/2025, adoptado 03/01, devuelto 10/02, adoptado otra vez 01/03
    buildAnimal(5, [adopt('2026-01-03'), returnFromAdoption('2026-02-10'), adopt('2026-03-01')], { speciesId: 'sp-perro', gender: 'male' }, { collectionDate: '2025-12-01' }),
    // A6 perra: llega 02/01, adoptada 20/01, devuelta 15/02 (vuelve a disponible)
    buildAnimal(6, [adopt('2026-01-20'), returnFromAdoption('2026-02-15')], { speciesId: 'sp-perro', gender: 'female' }, { collectionDate: '2026-01-02' }),
  ];
  animals = list.map((x) => x.animal);
  events = list.flatMap((x) => x.events);
});

const byAnimal = () => groupEventsByAnimal(events);

describe('censo (spec §6)', () => {
  it('cuenta disponibles y acogidas al final del día, por especie/ciudad/centro de la última llegada', () => {
    const c = censusAt('2026-01-31', animals, byAnimal(), CATALOGS);
    // A1 disponible (Alfa/Valencia), A2 acogida (Beta/Carlet). A5 y A6 adoptados.
    expect(c.total).toBe(2);
    expect(c.totalHost).toBe(1);
    expect(c.totalShelter).toBe(1);
    expect(c.rows).toEqual([
      { speciesId: 'sp-gato', cityId: 'c-beta', centerId: 'carlet', count: 1, countHost: 1 },
      { speciesId: 'sp-perro', cityId: 'c-alfa', centerId: 'valencia', count: 1, countHost: 0 },
    ]);
    expect(c.bySpecies['sp-perro']).toEqual({ count: 1, countHost: 0 });
  });

  it('un evento con fecha igual al día cuenta ese día (≤)', () => {
    expect(censusAt('2026-01-31', animals, byAnimal(), CATALOGS).rows.some((r) => r.cityId === 'c-alfa')).toBe(true);
    // A1 adoptado el 01/02: ese día ya no cuenta
    const feb1 = censusAt('2026-02-01', animals, byAnimal(), CATALOGS);
    expect(feb1.rows.find((r) => r.speciesId === 'sp-perro' && r.cityId === 'c-alfa')).toBeUndefined();
  });

  it('el veterinario no cuenta como último evento; el cadáver nunca cuenta', () => {
    const c = censusAt('2026-02-28', animals, byAnimal(), CATALOGS);
    // A2 acogida, A3 disponible, A5 devuelto (disponible), A6 devuelta (disponible)
    expect(c.total).toBe(4);
    expect(c.totalHost).toBe(1);
    expect(c.rows.find((r) => r.speciesId === 'sp-conejo')).toBeUndefined();
  });

  it('antes de la primera llegada el animal no existe para el censo', () => {
    expect(censusAt('2025-11-30', animals, byAnimal(), CATALOGS).total).toBe(0);
    expect(censusAt('2025-12-01', animals, byAnimal(), CATALOGS).total).toBe(1);
  });

  it('la reentrada usa la ciudad copiada de la llegada original', () => {
    const c = censusAt('2026-02-12', animals, byAnimal(), CATALOGS);
    const a5Row = c.rows.find((r) => r.cityId === 'c-alfa');
    expect(a5Row?.count).toBe(1);
  });

  it('filtra por ciudades (zona) y centro', () => {
    const z = censusAt('2026-02-28', animals, byAnimal(), CATALOGS, { cityIds: ['c-alfa', 'c-beta'] });
    expect(z.total).toBe(3); // A2 (Beta), A5, A6 (Alfa)
    const carlet = censusAt('2026-02-28', animals, byAnimal(), CATALOGS, { centerId: 'carlet' });
    expect(carlet.total).toBe(1);
    expect(carlet.totalHost).toBe(1);
  });

  it('acepta eventos desordenados', () => {
    const shuffled = new Map([...byAnimal()].map(([k, v]) => [k, [...v].reverse()]));
    expect(censusAt('2026-02-28', animals, shuffled, CATALOGS).total).toBe(4);
  });

  it('censo al inicio de un día = final del anterior', () => {
    const c = censusAtStartOf('2026-02-01', animals, byAnimal(), CATALOGS);
    expect(c.date).toBe('2026-02-01');
    expect(c.total).toBe(censusAt('2026-01-31', animals, byAnimal(), CATALOGS).total);
  });

  it('censo mensual: último día de cada mes, el último mes hasta `to`', () => {
    const m = monthlyCensus('2026-01-01', '2026-03-15', animals, byAnimal(), CATALOGS);
    expect(m.map((x) => x.date)).toEqual(['2026-01-31', '2026-02-28', '2026-03-15']);
    expect(m.map((x) => x.census.total)).toEqual([2, 4, 3]);
  });

  it('informe de censo mensual por especie', () => {
    const r = monthlyCensusReport(animals, byAnimal(), CATALOGS, { from: '2026-01-01', to: '2026-03-15' });
    expect(r.monthLabels).toEqual(['01-2026', '02-2026', '03-2026']);
    expect(r.rows[1]!.bySpecies['sp-perro']).toEqual({ total: 3, host: 0 });
    expect(r.rows[0]!.bySpecies['sp-perro']).toEqual({ total: 1, host: 0 });
    expect(r.species[0]!.speciesId).toBe('sp-perro');
  });
});

describe('informes de llegadas y salidas', () => {
  const filter = { from: '2026-01-01', to: '2026-03-31' };

  it('llegadas por mes × especie × sexo (por fecha de recogida)', () => {
    const r = arrivalsBySpeciesSex(animals, events, filter);
    expect(r.months).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(r.total).toBe(7);
    const jan = r.rows[0]!;
    expect(jan.total).toBe(4); // A1, A2, A4, A6
    expect(jan.bySpecies['sp-perro']).toEqual({ male: 1, female: 1, none: 0, total: 2 });
    expect(jan.bySpecies['sp-conejo']).toEqual({ male: 0, female: 0, none: 1, total: 1 });
    // todas las especies presentes en cada mes, aunque sea a cero
    expect(r.rows[2]!.bySpecies['sp-gato']).toEqual({ male: 0, female: 0, none: 0, total: 0 });
    expect(r.species.map((s) => s.speciesId)).toEqual(['sp-perro', 'sp-conejo', 'sp-gato']);
  });

  it('salidas por mes × especie × sexo', () => {
    const r = exitsBySpeciesSex(animals, events, filter);
    expect(r.total).toBe(4);
    expect(r.rows.map((x) => x.total)).toEqual([2, 1, 1]);
  });

  it('por subtipo × especie', () => {
    const r = arrivalsBySubtype(animals, events, filter);
    expect(r.subtypes).toEqual([
      { subtypeId: 'aviso', total: 4 },
      { subtypeId: 'devolucion_desde_adopcion', total: 2 },
      { subtypeId: 'aviso_cadaver', total: 1 },
    ]);
    expect(r.monthTotals).toEqual([4, 3, 0]);
    expect(r.rows[1]!.bySubtype['devolucion_desde_adopcion']).toEqual({ bySpecies: { 'sp-perro': 2, 'sp-conejo': 0, 'sp-gato': 0 }, total: 2 });
    const x = exitsBySubtype(animals, events, filter);
    expect(x.subtypes).toEqual([{ subtypeId: 'adopcion', total: 4 }]);
  });

  it('el rango incluye el último día entero', () => {
    expect(exitsBySpeciesSex(animals, events, { from: '2026-03-01', to: '2026-03-01' }).total).toBe(1);
  });

  it('filtros de zona y centro sobre la ciudad/centro guardados en el evento', () => {
    expect(arrivalsBySpeciesSex(animals, events, { ...filter, cityIds: ['c-beta'] }).total).toBe(1);
    // Las salidas copian la ciudad de la última llegada
    expect(exitsBySpeciesSex(animals, events, { ...filter, cityIds: ['c-alfa'] }).total).toBe(4);
    expect(arrivalsBySpeciesSex(animals, events, { ...filter, centerId: 'carlet' }).total).toBe(1);
  });

  it('dashboard: disponibles + 12 meses', () => {
    const d = dashboard(animals, events, CATALOGS, '2026-03-15');
    expect(d.available).toBe(2); // A3, A6
    expect(d.months).toHaveLength(12);
    expect(d.months[0]!.month).toBe('2025-04');
    expect(d.months.at(-1)).toEqual({ month: '2026-03', label: '03-2026', arrivals: 0, exits: 1 });
    expect(d.months.find((m) => m.month === '2026-01')).toMatchObject({ arrivals: 4, exits: 2 });
    expect(d.months.find((m) => m.month === '2025-12')).toMatchObject({ arrivals: 1, exits: 0 });
  });
});

describe('Excel "Informe gestión"', () => {
  const filter = { from: '2026-01-01', to: '2026-03-31' };

  it('entradas: todas las llegadas por subtipo × Perro/Gato/Otros × sexo, filas de más a menos', () => {
    const d = gestionExcelData(animals, events, CATALOGS, filter);
    expect(d.arrivals.rows.map((r) => r.subtypeId)).toEqual(['aviso', 'devolucion_desde_adopcion', 'aviso_cadaver']);
    const aviso = d.arrivals.rows[0]!;
    expect(aviso.name).toBe('Aviso');
    expect(aviso.perro).toEqual({ male: 1, female: 2 });
    expect(aviso.gato).toEqual({ male: 0, female: 1 });
    expect(aviso.total).toBe(4);
    // el conejo sin sexo no tiene columna: va aparte
    const cad = d.arrivals.rows[2]!;
    expect(cad.otros).toEqual({ male: 0, female: 0 });
    expect(cad.unknownGender).toBe(1);
    expect(cad.total).toBe(0);
    expect(d.arrivals.totals.total).toBe(6);
    expect(d.arrivals.totals.unknownGender).toBe(1);
  });

  it('salidas: solo la última salida de cada animal y sin los que han vuelto a disponible/acogida', () => {
    const d = gestionExcelData(animals, events, CATALOGS, filter);
    // A1 (01/02) y A5 (última, 01/03). A5 03/01 no es la última; A6 ha vuelto a disponible.
    expect(d.exits.rows).toHaveLength(1);
    expect(d.exits.rows[0]).toMatchObject({ subtypeId: 'adopcion', perro: { male: 2, female: 0 }, total: 2 });
    expect(d.exits.totals.total).toBe(2);
  });

  it('la última salida fuera del rango deja fuera también las anteriores', () => {
    const d = gestionExcelData(animals, events, CATALOGS, { from: '2026-01-01', to: '2026-01-31' });
    // A5 salió el 03/01 pero su última salida es de marzo; A6 ha vuelto.
    expect(d.exits.totals.total).toBe(0);
  });

  it('especies "otros" agrupan todo lo que no es perro ni gato', () => {
    const extra = buildAnimal(9, [], { speciesId: 'sp-huron', gender: 'female' }, { collectionDate: '2026-01-11' });
    const d = gestionExcelData([...animals, extra.animal], [...events, ...extra.events], CATALOGS, filter);
    expect(d.arrivals.rows[0]!.otros).toEqual({ male: 0, female: 1 });
  });

  it('cabeceras y título como el Excel viejo', () => {
    expect(GESTION_HEADERS).toHaveLength(13);
    expect(GESTION_HEADERS[1]).toBe('Perro Macho');
    expect(gestionExcelTitle({ from: '01-01-2026', to: '31-03-2026', centerName: 'Carlet', zoneName: 'Norte' })).toBe(
      'Informe gestión en el centro Carlet del 01-01-2026 al 31-03-2026 en la zona Norte',
    );
  });
});

describe('Excel "Censo"', () => {
  it('inicial + entradas − salidas, final', () => {
    const d = censusExcelData(animals, events, CATALOGS, { from: '2026-01-01', to: '2026-03-31' });
    expect(d.initial).toEqual({ date: '2026-01-01', shelter: 1, host: 0, total: 1 }); // A5
    expect(d.final).toEqual({ date: '2026-03-31', shelter: 2, host: 1, total: 3 }); // A2 acogida, A3, A6
    expect(d.arrivals).toEqual([
      { subtypeId: 'aviso', name: 'Aviso', count: 4 },
      { subtypeId: 'devolucion_desde_adopcion', name: 'Devolución desde Adopción', count: 2 },
      { subtypeId: 'aviso_cadaver', name: 'Aviso Cadaver', count: 1 },
    ]);
    // todas las salidas (no solo la última)
    expect(d.exits).toEqual([{ subtypeId: 'adopcion', name: 'Adopción', count: 4 }]);
    expect(d.arrivalsTotal).toBe(7);
    expect(d.exitsTotal).toBe(4);
    // Descuadre esperado: el aviso de cadáver entra como llegada pero nunca en el censo.
    expect(d.initial.total + d.arrivalsTotal - d.exitsTotal - 1).toBe(d.final.total);
  });

  it('cuadra exacto sin eventos que no afectan al censo', () => {
    const keep = animals.filter((a) => a.id !== 4);
    const ev = events.filter((e) => e.animalId !== 4);
    const d = censusExcelData(keep, groupEventsByAnimal(ev), CATALOGS, { from: '2026-01-01', to: '2026-03-31' });
    expect(d.initial.total + d.arrivalsTotal - d.exitsTotal).toBe(d.final.total);
  });

  it('con filtro de centro', () => {
    const d = censusExcelData(animals, events, CATALOGS, { from: '2026-01-01', to: '2026-03-31', centerId: 'carlet' });
    expect(d.initial.total).toBe(0);
    expect(d.final).toMatchObject({ host: 1, total: 1, shelter: 0 });
    expect(d.arrivalsTotal).toBe(1);
    expect(d.exitsTotal).toBe(0);
  });

  it('título', () => {
    expect(censusExcelTitle({ from: '01-01-2026', to: '31-03-2026', cityName: 'Alfa' })).toBe('Censo de 01-01-2026 hasta 31-03-2026 en la ciudad Alfa');
  });
});
