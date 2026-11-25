import { describe, expect, it } from 'vitest';
import { arrival, newAnimal, setup, TODAY } from './helpers.js';

describe('auth y permisos', () => {
  it('sin usuario: 401; público sin auth', async () => {
    const { req } = await setup();
    expect((await req('GET', '/me', { as: 'anon' })).status).toBe(401);
    expect((await req('GET', '/public/animals', { as: 'anon' })).status).toBe(200);
  });

  it('GET /me devuelve perfiles y permisos', async () => {
    const { req } = await setup();
    const r = await req('GET', '/me', { as: 'carlet' });
    expect(r.body.profiles).toEqual(['carlet']);
    expect(r.body.permissions).toContain('animals:write');
    expect(r.body.permissions).not.toContain('users:manage');
  });

  it.each([
    ['bienestar', 'POST', '/animals', 403],
    ['modevet', 'POST', '/animals', 403],
    ['carlet', 'DELETE', '/animals/10', 403],
    ['carlet', 'GET', '/users', 403],
    ['modevet', 'GET', '/reports/dashboard', 403],
    ['bienestar', 'GET', '/contacts', 403],
    ['carlet', 'GET', '/audit', 403],
    ['carlet', 'GET', '/export/animals.csv', 403],
    ['carlet', 'PUT', '/templates/llegada', 403],
    ['bienestar', 'GET', '/agenda?agenda=carlet&from=2026-06-01&to=2026-06-30', 403],
  ] as const)('%s %s %s → %i', async (as, method, path, status) => {
    const { req } = await setup();
    const r = await req(method, path, { as, body: method === 'GET' || method === 'DELETE' ? undefined : {} });
    expect(r.status).toBe(status);
    expect(r.body.error.code).toBe('forbidden');
  });

  it('bienestar ve la ficha sin contactos', async () => {
    const { req } = await setup();
    const r = await req('GET', '/animals/16', { as: 'bienestar' });
    expect(r.status).toBe(200);
    expect(r.body.contacts).toEqual([]);
    expect(r.body.animal.contactIds).toEqual([]);
    expect(r.body.events.every((e: any) => e.contactId === undefined)).toBe(true);
    const full = await req('GET', '/animals/16', { as: 'carlet' });
    expect(full.body.contacts.length).toBeGreaterThan(0);
  });

  it('modevet puede eventos veterinarios pero no salidas', async () => {
    const { req } = await setup();
    const vet = await req('POST', '/animals/10/events', { as: 'modevet', body: { subtypeId: 'desparasitacion', date: TODAY, userId: 's-vet1' } });
    expect(vet.status).toBe(201);
    const exit = await req('POST', '/animals/10/events', { as: 'modevet', body: { subtypeId: 'defuncion', date: TODAY, userId: 's-vet1' } });
    expect(exit.status).toBe(403);
    const allowed = await req('GET', '/animals/10/allowed-types', { as: 'modevet' });
    expect(allowed.body.typeIds).toEqual(['veterinario']);
  });
});

describe('animales y eventos', () => {
  it('alta con llegada: ciudad al vuelo, estado, centro, auditoría', async () => {
    const { req, repo } = await setup();
    const r = await req('POST', '/animals', { as: 'carlet', body: { animal: newAnimal({ breedName: 'galgo  español' }), arrival: arrival() } });
    expect(r.status).toBe(201);
    expect(r.body.animal.id).toBe(18);
    expect(r.body.animal.statusId).toBe('disponible');
    expect(r.body.animal.centerId).toBe('valencia');
    expect(r.body.event.cityName).toBe('Pueblo Nuevo');
    expect(r.body.animal.lastArrival.cityName).toBe('Pueblo Nuevo');
    const cats = await repo.getCatalogs();
    expect(cats.cities.some((c) => c.name === 'Pueblo Nuevo')).toBe(true);
    expect(cats.breeds.find((b) => b.id === r.body.animal.breedId)?.name).toBe('Galgo Español');
    expect(repo.state.audit.some((a) => a.entity === 'animal' && a.action === 'create' && a.entityId === '18')).toBe(true);
    // aparece en el listado (caché invalidada)
    const list = await req('GET', '/animals?q=Prueba');
    expect(list.body.items.map((a: any) => a.id)).toEqual([18]);
  });

  it('alta con contacto nuevo por NIF y luego reutilizado', async () => {
    const { req, repo } = await setup();
    const data = { name: 'Nueva', surname: 'Persona Ficticia', nif: '00000009-x', phone: '600000009' };
    const a = await req('POST', '/animals', { as: 'carlet', body: { animal: newAnimal(), arrival: arrival({ contact: { data } }) } });
    expect(a.status).toBe(201);
    expect(a.body.contact.nif).toBe('00000009X');
    expect(a.body.contact.kind).toEqual(['avisante']);
    const b = await req('POST', '/animals', { as: 'carlet', body: { animal: newAnimal({ name: 'Otro' }), arrival: arrival({ contact: { data: { ...data, phone: '611111111' } } }) } });
    expect(b.body.event.contactId).toBe(a.body.contact.id);
    expect((await repo.getContact(a.body.contact.id))?.phone).toBe('611111111');
  });

  it('el alta tiene que ser una llegada; validación zod → 400', async () => {
    const { req } = await setup();
    const r = await req('POST', '/animals', { as: 'carlet', body: { animal: newAnimal(), arrival: arrival({ subtypeId: 'adopcion' }) } });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('event_not_allowed');
    const bad = await req('POST', '/animals', { as: 'carlet', body: { animal: { name: '' }, arrival: arrival() } });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation');
  });

  it('evento de salida cambia el estado; no permitido → 422; borrar recalcula', async () => {
    const { req } = await setup();
    const adop = await req('POST', '/animals/11/events', { as: 'carlet', body: { subtypeId: 'adopcion', date: TODAY, userId: 's-cui1', contact: { contactId: 2 } } });
    expect(adop.status).toBe(201);
    expect(adop.body.animal.statusId).toBe('adoptado');
    expect(adop.body.animal.contactIds).toContain(2);
    const again = await req('POST', '/animals/11/events', { as: 'carlet', body: { subtypeId: 'defuncion', date: TODAY, userId: 's-cui1' } });
    expect(again.status).toBe(422);
    expect(again.body.error.code).toBe('event_not_allowed');
    const del = await req('DELETE', `/animals/11/events/${adop.body.event.id}`, { as: 'carlet' });
    expect(del.status).toBe(200);
    expect(del.body.animal.statusId).toBe('disponible');
  });

  it('no se borra el primer evento', async () => {
    const { req } = await setup();
    const ficha = await req('GET', '/animals/12');
    const first = ficha.body.events[0];
    const r = await req('DELETE', `/animals/12/events/${first.id}`, { as: 'carlet' });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('first_event');
  });

  it('borrar evento con adjunto borra el fichero', async () => {
    const { req, files } = await setup();
    const up = await req('POST', '/animals/10/event-upload-url', { as: 'carlet', body: { fileName: 'analitica.pdf', contentType: 'application/pdf' } });
    expect(up.body.key).toMatch(/^animals\/10\/events\/.+\.pdf$/);
    const ev = await req('POST', '/animals/10/events', {
      as: 'carlet',
      body: { subtypeId: 'documento', date: TODAY, userId: 's-vet1', document: { key: up.body.key, originalName: 'analitica.pdf' } },
    });
    expect(ev.status).toBe(201);
    const bad = await req('POST', '/animals/10/events', {
      as: 'carlet',
      body: { subtypeId: 'documento', date: TODAY, userId: 's-vet1', document: { key: 'animals/11/events/x.pdf', originalName: 'x.pdf' } },
    });
    expect(bad.status).toBe(400);
    await req('DELETE', `/animals/10/events/${ev.body.event.id}`, { as: 'carlet' });
    expect(files.ops).toContain(`delete ${up.body.key}`);
  });

  it('chip único: alta y edición → 409', async () => {
    const { req } = await setup();
    const dup = await req('POST', '/animals', { as: 'carlet', body: { animal: newAnimal({ chip: { number: '94100000000000' } }), arrival: arrival() } });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('chip_duplicate');
    const edit = await req('PATCH', '/animals/11', { as: 'carlet', body: { chip: { number: '94100000000000' } } });
    expect(edit.status).toBe(409);
    // cambiar el propio chip libera el anterior
    const move = await req('PATCH', '/animals/10', { as: 'carlet', body: { chip: { number: '111' } } });
    expect(move.status).toBe(200);
    const reuse = await req('PATCH', '/animals/11', { as: 'carlet', body: { chip: { number: '94100000000000' } } });
    expect(reuse.status).toBe(200);
  });

  it('NIF único al editar contacto → 409; borrar contacto en uso → 409', async () => {
    const { req } = await setup();
    const r = await req('PATCH', '/contacts/3', { as: 'carlet', body: { nif: '00000001R' } });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('nif_duplicate');
    const del = await req('DELETE', '/contacts/2', { as: 'carlet' });
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe('contact_in_use');
  });

  it('listado con filtros del dominio y paginación', async () => {
    const { req } = await setup();
    const r = await req('GET', '/animals?speciesId=gato&pageSize=2&sort=id&dir=asc');
    expect(r.body.total).toBe(4);
    expect(r.body.items.map((a: any) => a.id)).toEqual([11, 13]);
    const z = await req('GET', '/animals?arrivalZoneId=z-norte&statusId=disponible');
    expect(z.body.items.every((a: any) => a.lastArrival.cityId === 'c-alfa')).toBe(true);
    const forb = await req('GET', '/animals?contact=Inventada', { as: 'bienestar' });
    expect(forb.status).toBe(403);
  });

  it('borrar animal (admin) borra eventos, ficheros y guardián del chip', async () => {
    const { req, repo, files } = await setup();
    const r = await req('DELETE', '/animals/10');
    expect(r.status).toBe(204);
    expect(await repo.getAnimal(10)).toBeUndefined();
    expect(await repo.getAnimalEvents(10)).toEqual([]);
    expect(files.ops).toContain('delete animals/10/photo.jpg');
    expect(await repo.findAnimalByChip('94100000000000')).toBeUndefined();
  });
});

describe('foto pública', () => {
  it('copia al marcar visible y borra al desmarcar o cambiar de estado', async () => {
    const { req, files } = await setup();
    // 15: sin foto. Sube foto (no visible → no copia).
    await req('POST', '/animals/15/photo-upload-url', { as: 'carlet', body: {} });
    await req('POST', '/animals/15/photo-uploaded', { as: 'carlet' });
    expect(files.ops).not.toContain('copy animals/15/photo.jpg public/animals/15.jpg');
    await req('PATCH', '/animals/15', { as: 'carlet', body: { visibleWeb: true } });
    expect(files.ops).toContain('copy animals/15/photo.jpg public/animals/15.jpg');
    await req('PATCH', '/animals/15', { as: 'carlet', body: { visibleWeb: false } });
    expect(files.ops).toContain('delete public/animals/15.jpg');
    // 10: visible + disponible + foto → al adoptarse se borra.
    await req('POST', '/animals/10/events', { as: 'carlet', body: { subtypeId: 'adopcion', date: TODAY, userId: 's-cui1', contact: { contactId: 2 } } });
    expect(files.ops).toContain('delete public/animals/10.jpg');
  });
});

describe('público', () => {
  it('solo visibles y disponibles, sin datos de personas', async () => {
    const { req } = await setup();
    await req('POST', '/animals/12/events', { as: 'carlet', body: { subtypeId: 'adopcion', date: TODAY, userId: 's-cui1', contact: { contactId: 2 } } });
    const r = await req('GET', '/public/animals', { as: 'anon' });
    expect(r.status).toBe(200);
    const ids = r.body.map((a: any) => a.id).sort();
    expect(ids).toEqual([10, 11, 13, 14]);
    const json = JSON.stringify(r.body);
    for (const forbidden of ['contact', 'chip', 'nif', 'Inventada', 'notes', 'lastArrival', 'Recogida', 'phone']) expect(json).not.toContain(forbidden);
    const one = r.body.find((a: any) => a.id === 10);
    expect(one.photoUrl).toBe('/public-files/animals/10.jpg');
    expect(one.speciesName).toBe('Perro');
    expect((await req('GET', '/public/animals/16', { as: 'anon' })).status).toBe(404);
    expect((await req('GET', '/public/animals/10', { as: 'anon' })).body.name).toBe('Toby');
  });
});
