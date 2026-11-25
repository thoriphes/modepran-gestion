import { DEFAULT_SUBTYPES } from '@modepran/domain';
import { describe, expect, it } from 'vitest';
import { buildManifest, parseTarListing, relativeToStorage } from '../src/files.js';
import { mapSource, MIGRATED_TABLES, OLD_SUBTYPE_CODES, sqlTimestampToIso, type SourceTables } from '../src/map.js';
import { parseDumpText } from '../src/sql-parser.js';
import { FIXTURE_FILES, fixtureDump, type FixtureOptions } from './fixtures.js';

function load(opts: FixtureOptions = {}, withFiles = true) {
  const parsed = parseDumpText(fixtureDump(opts), MIGRATED_TABLES);
  const src: SourceTables = {};
  const autoIncrement: Record<string, number | undefined> = {};
  for (const [t, v] of parsed) {
    src[t] = v.rows;
    autoIncrement[t] = v.schema?.autoIncrement;
  }
  const result = mapSource(src, { autoIncrement, ...(withFiles ? { fileIndex: new Set(FIXTURE_FILES.map((f) => f.path)) } : {}) });
  return { src, parsed, result };
}

describe('mapSource: catálogos', () => {
  const { result } = load();

  it('estados por nombre a los 12 códigos estables', () => {
    expect(result.catalogs.statuses.map((s) => s.id).sort()).toEqual(
      [
        'acogida',
        'acogida_solidaria',
        'adoptado',
        'cadaver',
        'devolucion_propietario',
        'devolucion_responsable_legal',
        'devuelto_colonia',
        'disponible',
        'eutanasiado',
        'fallecido',
        'perdido',
        'translado',
      ].sort(),
    );
    expect(result.issues['animals_status.desconocido']).toBeUndefined();
  });

  it('subtipos por id viejo, con nombre y flags del dominio (sin la errata)', () => {
    expect(result.catalogs.subtypes).toHaveLength(29);
    expect(Object.keys(OLD_SUBTYPE_CODES)).toHaveLength(29);
    expect(new Set(Object.values(OLD_SUBTYPE_CODES)).size).toBe(29);
    const ester = result.catalogs.subtypes.find((s) => s.id === 'esterilizado')!;
    expect(ester.name).toBe('Esterilizado');
    expect(result.catalogs.subtypes).toEqual(expect.arrayContaining(DEFAULT_SUBTYPES));
    // Los flags y estados de origen cuadran con los del dominio.
    expect(result.issues['subtipo.flags_distintos']).toBeUndefined();
    expect(result.issues['subtipo.estado_distinto']).toBeUndefined();
    expect(result.issues['subtipo.desconocido']).toBeUndefined();
  });

  it('especies con código, centros, zonas con ciudades (sin huérfanas)', () => {
    expect(result.catalogs.species).toEqual([
      { id: '1', name: 'Perro', code: 'perro', active: true },
      { id: '2', name: 'Gato', code: 'gato', active: true },
    ]);
    expect(result.catalogs.centers.map((c) => c.code)).toEqual(['valencia', 'carlet']);
    expect(result.catalogs.zones[0]!.cityIds).toEqual(['1', '2']);
    expect(result.issues['zones_cities.huerfana']?.count).toBe(1);
    expect(result.catalogs.breeds[0]).toEqual({ id: '1', name: 'Mestizo', speciesId: '1', active: true });
  });

  it('usuarios → personal sin email ni contraseña', () => {
    expect(result.staff).toEqual([
      { id: 'staff-1', name: 'Persona Uno', active: true, roles: [] },
      { id: 'staff-2', name: 'Persona Dos', active: false, roles: [] },
    ]);
    expect(JSON.stringify(result.staff)).not.toMatch(/example\.test|hash-falso/);
  });

  it('contadores continúan desde AUTO_INCREMENT', () => {
    expect(result.counters).toMatchObject({ animal: 7731, event: 38264, contact: 6281, city: 470, species: 9 });
  });
});

describe('mapSource: animales, eventos y contactos', () => {
  const { result } = load();
  const animal = (id: number) => result.animals.find((a) => a.id === id)!;
  const event = (id: number) => result.events.find((e) => e.id === id)!;

  it('animal con chip, fechas y derivados', () => {
    const a = animal(101);
    expect(a).toMatchObject({
      name: 'Bobi',
      speciesId: '1',
      breedId: '1',
      statusId: 'adoptado',
      centerId: '2',
      gender: 'male',
      weightKg: 12.5,
      size: 'medium',
      bornAt: '2020-03-15',
      hasPhoto: true,
      sterilized: true,
      visibleWeb: true,
      compatibleDogs: true,
      createdAt: '2024-01-01T09:00:00.000Z',
      updatedAt: '2024-02-01T09:00:00.000Z',
    });
    expect(a.chip).toEqual({ number: '941000000000001', passport: 'P-1', owner: 'Dueño Tmp', phone: '611111111', notes: 'nota\nchip' });
    expect(a.lastArrival).toEqual({ date: '2024-01-01', subtypeId: 'aviso', cityId: '1', cityName: 'Villa Alfa', userId: 'staff-1', centerId: '2' });
    expect(a.lastExit).toEqual({ date: '2024-02-01', subtypeId: 'adopcion' });
    expect(a.contactIds).toEqual([2, 3]);
    expect(a.arrivalDates).toEqual(['2024-01-01']);
    expect(a.exitDates).toEqual(['2024-02-01']);
    expect(a.statusChanges).toEqual([
      { statusId: 'disponible', date: '2024-01-01' },
      { statusId: 'adoptado', date: '2024-02-01' },
    ]);
    expect(result.issues['chip.owner_desde_tmp']?.count).toBe(1);
    // El chip 2 no lo usa ningún animal.
    expect(result.issues['chip.sin_animal']?.sampleIds).toEqual([2]);
  });

  it('peso 0 y color vacío se omiten', () => {
    const a = animal(102);
    expect(a.weightKg).toBeUndefined();
    expect(a.color).toBeUndefined();
    expect(a.chip).toBeUndefined();
    expect(a.statusId).toBe('acogida');
  });

  it('evento: fecha en Madrid, campos, trabajador y autor', () => {
    expect(event(1)).toEqual({
      id: 1,
      animalId: 101,
      typeId: 'llegada',
      subtypeId: 'aviso',
      date: '2024-01-01',
      userId: 'staff-1',
      contactId: 2,
      centerId: '2',
      cityId: '1',
      cityName: 'Villa Alfa',
      address: 'Calle Uno',
      zip: '46001',
      collectionDate: '2024-01-01',
      notes: 'Encontrado\nen la calle',
      createdAt: '2024-01-01T09:00:00.000Z',
      createdBy: 'staff-1',
    });
    expect(event(2)).toMatchObject({ typeId: 'veterinario', subtypeId: 'vacuna', vaccineId: '1', switchValue: true, date: '2024-01-10' });
    // 20:00 UTC → mismo día en Madrid (como lo muestra la app vieja).
    expect(event(7).date).toBe('2024-01-02');
  });

  it('createdAt no decreciente por id (orden de registro = orden de ids)', () => {
    const sorted = [...result.events].sort((a, b) => a.id - b.id);
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.createdAt >= sorted[i - 1]!.createdAt).toBe(true);
    // El 7 se editó en junio: su createdAt baja al del 8.
    expect(event(7).createdAt).toBe('2024-01-04T09:00:00.000Z');
  });

  it('documentos: clave del spec con la extensión real del fichero', () => {
    expect(event(6).document).toEqual({ key: 'animals/102/events/6.pdf', originalName: 'Informe.PDF' });
    expect(event(8).document).toEqual({ key: 'animals/103/events/8.jpg', originalName: 'radiografia.jpeg' });
  });

  it('documento sin fichero se omite y se anota', () => {
    const { result: r } = load({
      extraHistory: [`9,1,103,3,16,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'perdido.pdf',NULL,NULL,'2024-01-05 23:00:00','2024-01-06 09:00:00'`],
    });
    expect(r.events.find((e) => e.id === 9)!.document).toBeUndefined();
    expect(r.issues['evento.adjunto_ausente']?.sampleIds).toEqual([9]);
  });

  it('sin índice de ficheros se asume el adjunto y se anota', () => {
    const { result: r } = load({}, false);
    expect(r.events.find((e) => e.id === 6)!.document?.key).toBe('animals/102/events/6.pdf');
    expect(r.issues['evento.adjunto_sin_comprobar']?.count).toBe(2);
  });

  it('contactos: SIN DATOS especial, NIF normalizado, email en minúsculas, tipo derivado', () => {
    const c = (id: number) => result.contacts.find((x) => x.id === id)!;
    expect(c(1)).toMatchObject({ name: 'SIN DATOS', special: 'sin_datos', kind: ['avisante'] });
    expect(c(2)).toMatchObject({ nif: '00000000T', email: 'ana@example.test', cityId: '1', cityName: 'Villa Alfa', province: 'valencia' });
    expect(c(2).kind.sort()).toEqual(['acogedor', 'avisante']);
    expect(c(3).kind).toEqual(['adoptante']);
    expect(c(4).name).toBe('');
    expect(result.duplicateNifGroups).toEqual([[2, 3]]);
    expect(result.issues['contacto.sin_nombre']?.sampleIds).toEqual([4]);
    expect(result.issues['contacto.sin_eventos']?.sampleIds).toEqual([4]);
  });

  it('referencias rotas: evento sin animal y contacto inexistente', () => {
    const { result: r } = load({
      extraHistory: [
        `20,1,555,3,12,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2024-01-05 23:00:00','2024-01-06 09:00:00'`,
        `21,1,103,3,12,888,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2024-01-05 23:00:00','2024-01-06 09:00:00'`,
      ],
    });
    expect(r.events.find((e) => e.id === 20)).toBeUndefined();
    expect(r.issues['evento.sin_animal']?.sampleIds).toEqual([20]);
    expect(r.events.find((e) => e.id === 21)!.contactId).toBeUndefined();
    expect(r.issues['evento.contacto_inexistente']?.sampleIds).toEqual([21]);
  });

  it('plantillas: vacías no generan nada; si hay, se mapean', () => {
    expect(result.templates).toEqual([]);
    const { result: r } = load({
      templates: [`1,'adopcion','<p>[ANIMAL_NOMBRE]</p>','<p>blank</p>','{"LANG_LOPD":"texto","x":1}','2024-01-01 10:00:00','2024-02-01 10:00:00'`],
    });
    expect(r.templates).toEqual([
      {
        slug: 'adopcion',
        name: 'Contrato de adopción',
        bodyFilled: '<p>[ANIMAL_NOMBRE]</p>',
        bodyBlank: '<p>blank</p>',
        legalTexts: { lopd: 'texto' },
        updatedAt: '2024-02-01T10:00:00.000Z',
        updatedBy: 'migracion',
      },
    ]);
  });
});

describe('utilidades', () => {
  it('sqlTimestampToIso', () => {
    expect(sqlTimestampToIso('2024-03-31 01:30:00')).toBe('2024-03-31T01:30:00.000Z');
    expect(sqlTimestampToIso('0000-00-00 00:00:00')).toBeUndefined();
    expect(sqlTimestampToIso(null)).toBeUndefined();
  });
});

describe('ficheros', () => {
  it('parseTarListing toma solo ficheros bajo storage/app/public', () => {
    const listing = [
      'drwxrwxr-x u/g       0 2025-05-24 11:22 public_html/storage/app/public/animals/',
      '-rw-r--r-- u/g    1234 2025-05-24 11:22 public_html/storage/app/public/animals/7.jpg',
      '-rw-r--r-- u/g      10 2025-05-24 11:22 public_html/other/file.txt',
    ].join('\n');
    expect(parseTarListing(listing)).toEqual([{ path: 'animals/7.jpg', size: 1234 }]);
    expect(relativeToStorage('./public_html/storage/app/public/docs/a.pdf')).toBe('docs/a.pdf');
  });

  it('manifiesto: claves del spec, ausentes y huérfanos', () => {
    const { result } = load();
    const m = buildManifest(FIXTURE_FILES, result);
    const keys = m.uploads.map((u) => `${u.source} -> ${u.key}`).sort();
    expect(keys).toEqual(
      [
        'animals/101.jpg -> animals/101/photo.jpg',
        'animals/101_thumb.jpg -> animals/101/thumb.jpg',
        'animals/103.jpg -> animals/103/photo.jpg',
        'animals/102/6.pdf -> animals/102/events/6.pdf',
        'animals/103/8.jpg -> animals/103/events/8.jpg',
        'docs/ANEXO.pdf -> static/docs/ANEXO.pdf',
      ].sort(),
    );
    expect(m.missing).toEqual({ photos: [], thumbs: [103], documents: [] });
    expect(m.orphans).toEqual({
      photosWithoutAnimal: ['animals/999.jpg'],
      photosWithoutFlag: ['animals/102.jpg'],
      eventFilesWithoutEvent: ['animals/101/777.pdf'],
      other: [],
    });
    expect(m.uploads.find((u) => u.kind === 'event' && u.key.endsWith('.pdf'))!.contentType).toBe('application/pdf');
    expect(m.totals.files).toBe(6);
    expect(m.totals.byKind.event).toEqual({ files: 2, bytes: 8000 });
  });
});
