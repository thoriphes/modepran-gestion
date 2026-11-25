import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generate } from '../scripts/gen-templates.js';
import { DEFAULT_LEGAL_TEXTS } from '../src/templates/index.js';
import { setup, TODAY } from './helpers.js';

describe('plantillas por defecto', () => {
  it('defaults.generated.ts está al día con los .html', () => {
    const current = readFileSync(new URL('../src/templates/defaults.generated.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    expect(current).toBe(generate());
  });

  it('tienen los textos legales que usan', async () => {
    const { req } = await setup();
    for (const slug of ['llegada', 'adopcion', 'dueno', 'eutanasia', 'acogida', 'veterinario', 'ficha']) {
      const t = await req('GET', `/templates/${slug}`);
      expect(t.status).toBe(200);
      for (const m of `${t.body.bodyFilled}${t.body.bodyBlank}`.matchAll(/\[LANG_([A-Z0-9_]+)\]/g)) {
        expect(DEFAULT_LEGAL_TEXTS[m[1]!.toLowerCase()], m[1]).toBeTypeOf('string');
      }
      expect(t.body.customized).toBe(false);
    }
  });
});

describe('plantillas: editar y restablecer', () => {
  it('PUT guarda, avisa de placeholders desconocidos, el documento usa la nueva; reset vuelve', async () => {
    const { req } = await setup();
    const put = await req('PUT', '/templates/adopcion', {
      body: { bodyFilled: '<html><body><h1>[ANIMAL_NOMBRE]</h1>[LANG_LOPD] [RARO]</body></html>', bodyBlank: '<p>[ANIMAL_NOMBRE]</p>', legalTexts: { lopd: 'Texto propio :adoptante_name' } },
    });
    expect(put.status).toBe(200);
    expect(put.body.warnings).toEqual(['Placeholder desconocido: [RARO]']);
    const ev = await req('POST', '/animals/11/events', { as: 'carlet', body: { subtypeId: 'adopcion', date: TODAY, userId: 's-cui1', contact: { contactId: 2 } } });
    const doc = await req('GET', `/documents/event/${ev.body.event.id}?animalId=11`, { as: 'carlet' });
    expect(doc.status).toBe(200);
    expect(doc.body.slug).toBe('adopcion');
    expect(doc.body.html).toContain('<h1>Luna</h1>');
    expect(doc.body.html).toContain('Texto propio Persona Inventada Uno');
    const t = await req('GET', '/templates');
    expect(t.body.find((x: any) => x.slug === 'adopcion').customized).toBe(true);
    await req('POST', '/templates/adopcion/reset');
    const doc2 = await req('GET', `/documents/event/${ev.body.event.id}`, { as: 'carlet' });
    expect(doc2.body.html).toContain('Persona');
    expect(doc2.body.html).not.toContain('[ANIMAL_NOMBRE]');
    expect(doc2.body.html).toContain('00000001R');
  });
});

describe('documentos', () => {
  it('llegada renderizada sin placeholders sueltos; en blanco con líneas', async () => {
    const { req } = await setup();
    const ficha = await req('GET', '/animals/10');
    const ev = ficha.body.events[0];
    const doc = await req('GET', `/documents/event/${ev.id}?animalId=10`, { as: 'carlet' });
    expect(doc.status).toBe(200);
    expect(doc.body.slug).toBe('llegada');
    expect(doc.body.html).toContain('Toby');
    expect(doc.body.html).toContain('Cuidadora Uno');
    expect(doc.body.html).not.toMatch(/\[[A-Z_]+\]/);
    const blank = await req('GET', '/documents/blank/adopcion', { as: 'carlet' });
    expect(blank.body.html).toContain('____');
    expect(blank.body.html).not.toMatch(/\[[A-Z_]+\]/);
  });

  it('veterinario lo imprime Modevet; el resto no', async () => {
    const { req } = await setup();
    const ficha = await req('GET', '/animals/11');
    const vet = ficha.body.events.find((e: any) => e.typeId === 'veterinario');
    expect((await req('GET', `/documents/event/${vet.id}?animalId=11`, { as: 'modevet' })).status).toBe(200);
    const llegada = ficha.body.events.find((e: any) => e.typeId === 'llegada');
    expect((await req('GET', `/documents/event/${llegada.id}?animalId=11`, { as: 'modevet' })).status).toBe(403);
  });

  it('ficha y fichas masivas con historial y foto firmada', async () => {
    const { req } = await setup();
    const one = await req('GET', '/documents/ficha/10', { as: 'carlet' });
    expect(one.body.html).toContain('<table class="historial">');
    expect(one.body.html).toContain('animals/10/photo.jpg?signed=get');
    expect(one.body.html).not.toContain('[BLOQUE_HISTORIAL]');
    const many = await req('GET', '/documents/fichas?speciesId=perro', { as: 'carlet' });
    expect(many.body.count).toBe(4);
    expect(many.body.html.match(/class="ficha-pagina"/g)).toHaveLength(4);
    expect((await req('GET', '/documents/fichas', { as: 'bienestar' })).status).toBe(403);
  });
});
