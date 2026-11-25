import { describe, expect, it } from 'vitest';
import { BLOCKS, interpolate, PLACEHOLDERS, renderTemplate, unknownPlaceholders, type TemplateData } from '../src/index.js';

const data = (over: Partial<TemplateData> = {}): TemplateData => ({
  today: '2026-03-15',
  logoUrl: 'https://example.test/logo.png',
  photoUrl: 'https://example.test/a.jpg',
  animal: {
    id: 42,
    name: 'Luna <b>',
    speciesName: 'Perro',
    breedName: 'Mestizo',
    color: 'Negro',
    gender: 'female',
    weightKg: 12.5,
    size: 'medium',
    statusName: 'Adoptado',
    centerName: 'Valencia',
    bornAt: '2023-01-10',
    sterilized: true,
    ppp: false,
    compatibleDogs: true,
    compatibleCats: false,
    chip: { number: '941000000000001', notes: 'n & n' },
  },
  event: {
    id: 1234,
    date: '2026-03-05',
    typeName: 'Salida',
    subtypeName: 'Adopción',
    notes: 'Notas [CONTACTO_NIF]',
    cityName: 'Alfa',
    workerName: 'Trabajadora Ejemplo',
  },
  contact: {
    name: 'Persona',
    surname: 'Ejemplo',
    nif: '00000000T',
    phone: '600000000',
    email: 'demo@example.test',
    address: 'Calle Falsa 1',
    province: 'Valencia',
    zip: '46000',
    cityName: 'Alfa',
  },
  ...over,
});

describe('renderTemplate', () => {
  it('sustituye todos los placeholders simples', () => {
    const html = PLACEHOLDERS.map((p) => `${p}=[${p}]`).join('\n');
    const out = renderTemplate(html, data({ event: { ...data().event!, notes: 'Sin más' } }));
    expect(out).not.toMatch(/\[[A-Z_Ñ]+\]/);
    expect(out).toContain('ANIMAL_NOMBRE=Luna &lt;b&gt;');
    expect(out).toContain('ANIMAL_ID=42');
    expect(out).toContain('GENERO=Hembra');
    expect(out).toContain('TAMANO=Mediano');
    expect(out).toContain('PESO=12,5');
    expect(out).toContain('NACIDO_FECHA=10-01-2023');
    expect(out).toContain('EDAD_ESTIMADA=3 años 2 meses 5 días');
    expect(out).toContain('FECHA_HISTORIAL_DM=05-03-2026');
    expect(out).toContain('FECHA_HISTORIAL_ESPAÑOL=05 de Marzo de 2026');
    expect(out).toContain('FECHA_VALENCIA_LINEA=Valencia, 05 de Marzo de 2026');
    expect(out).toContain('TITULO_REGISTRO=Registro de Salida');
    expect(out).toContain('TITULO_REGISTRO_CON_SUBTIPO=Registro de Salida: Adopción');
    expect(out).toContain('MOTIVO_SUBTIPO=Adopción');
    expect(out).toContain('LUGAR_CIUDAD=Alfa');
    expect(out).toContain('RECOGIDO_POR=Trabajadora Ejemplo');
    expect(out).toContain('CONTACTO_NIF=00000000T');
    expect(out).toContain('CONTACTO_CIUDAD=Alfa');
    expect(out).toContain('HISTORIAL_ID=1234');
  });

  it('no vuelve a sustituir lo insertado (notas con un placeholder dentro)', () => {
    expect(renderTemplate('[NOTAS_HISTORIAL]', data())).toBe('Notas [CONTACTO_NIF]');
  });

  it('bloques según flags', () => {
    const out = renderTemplate(BLOCKS.map((b) => `[${b}]`).join('|'), data());
    const [ster, ppp, dogs, cats, chip] = out.split('|');
    expect(ster).toContain('Esterilizado');
    expect(ppp).toBe('');
    expect(dogs).toContain('Compatible Perros');
    expect(cats).toBe('');
    expect(chip).toContain('<strong>941000000000001</strong>');
    expect(chip).toContain('n &amp; n');
    const none = renderTemplate('[BLOQUE_CHIP][BLOQUE_CHECK_ESTERILIZADO]', data({ animal: { ...data().animal, chip: undefined, sterilized: false } } as never));
    expect(none).toBe('');
  });

  it('textos [LANG_*] desde el diccionario con parámetros escapados', () => {
    const dict = {
      lopd: '<p>Protección de datos</p>',
      adoption_text_top: '<p>REUNIDOS: :adoptante_name, NIF :adoptante_nif, en :adoptante_address</p>',
      host_text_top: 'a :fecha_acogida',
      adoption_anex1: 'Anexo :animalType',
      adoption_engagement_sterilized: '<li>Esterilizar</li>',
    };
    const out = renderTemplate('[LANG_LOPD]|[LANG_ADOPTION_TEXT_TOP]|[LANG_HOST_TEXT_TOP]|[LANG_ADOPTION_ANEX1]|[LANG_NO_EXISTE]', data({ contact: { ...data().contact, name: 'A&B' } }), dict);
    expect(out.split('|')).toEqual([
      '<p>Protección de datos</p>',
      '<p>REUNIDOS: A&amp;B Ejemplo, NIF 00000000T, en Calle Falsa 1, 46000, Alfa (Valencia)</p>',
      'a 05 de Marzo de 2026',
      'Anexo Perro',
      '',
    ]);
  });

  it('compromiso de esterilizar solo si el animal no está esterilizado', () => {
    const dict = { adoption_engagement_sterilized: 'ESTERILIZAR' };
    expect(renderTemplate('[LANG_ADOPTION_ENGAGEMENT_STERILIZED]', data(), dict)).toBe('');
    expect(renderTemplate('[LANG_ADOPTION_ENGAGEMENT_STERILIZED]', data({ animal: { ...data().animal, sterilized: false } }), dict)).toBe('ESTERILIZAR');
  });

  it('dirección del contacto vacía si no tiene ciudad (como la app vieja)', () => {
    const out = renderTemplate('[LANG_X]', data({ contact: { name: 'X' } }), { x: '[:adoptante_address]' });
    expect(out).toBe('[]');
  });

  it('sin evento ni contacto (ficha): campos de evento vacíos', () => {
    const out = renderTemplate('[ANIMAL_NOMBRE]|[HISTORIAL_ID]|[FECHA_VALENCIA_LINEA]|[CONTACTO_NOMBRE]|[TITULO_REGISTRO_CON_SUBTIPO]', data({ event: undefined, contact: undefined } as never));
    expect(out).toBe('Luna &lt;b&gt;||||');
  });

  it('el diccionario puede sobrescribir etiquetas', () => {
    expect(renderTemplate('[GENERO]', data(), { table_item_female: 'Hembra (F)' })).toBe('Hembra (F)');
    expect(renderTemplate('[GENERO]', data({ animal: { ...data().animal, gender: 'none' } }))).toBe('Ninguno');
  });

  it('deja tal cual los placeholders desconocidos y los detecta', () => {
    expect(renderTemplate('[DESCONOCIDO] y [ANIMAL_ID]', data())).toBe('[DESCONOCIDO] y 42');
    expect(unknownPlaceholders('[DESCONOCIDO][ANIMAL_ID][LANG_LOPD][BLOQUE_PPP]')).toEqual(['DESCONOCIDO']);
  });

  it('interpolate sustituye primero las claves largas', () => {
    expect(interpolate(':a :ab', { a: '1', ab: '2' })).toBe('1 2');
  });
});
