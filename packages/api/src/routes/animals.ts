/** Animales, historial de eventos y ficheros de la ficha. */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  allowedEventTypes,
  applyEvent,
  canAddEventType,
  catalogIndex,
  createAnimalWithArrival,
  filterAnimals,
  removeEvent,
  sortEvents,
  type Animal,
  type AnimalFilters,
  type Contact,
  type HistoryEvent,
  type NewEventInput,
} from '@modepran/domain';
import { fileKeys } from '../files.js';
import { ApiError, forbidden, has, intParam, need, needAny, notFound, readBody, readQuery } from '../http.js';
import { animalFiltersQuery, animalInput, animalPatch, eventInput, type AnimalFiltersQuery } from '../schemas.js';
import type { AppEnv, Services } from '../services.js';
import type { AuthUser } from '../types.js';

type EventBody = z.infer<typeof eventInput>;

/** Quita los datos de contactos para quien no puede verlos (Bienestar). */
export function redactAnimal(a: Animal): Animal {
  return { ...a, contactIds: [] };
}
function redactEvent(e: HistoryEvent): HistoryEvent {
  const { contactId: _c, ...rest } = e;
  return rest;
}

export function toFilters(q: AnimalFiltersQuery): AnimalFilters {
  const { page: _p, pageSize: _s, sort: _o, dir: _d, ...filters } = q;
  return Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== undefined)) as AnimalFilters;
}

export async function filteredAnimals(c: Context<AppEnv>, q: AnimalFiltersQuery, pageSize?: number) {
  const svc = c.get('svc');
  if (q.contact && !has(c, 'animals:read_contacts')) throw forbidden();
  const [animals, cats] = await Promise.all([svc.animals(), svc.catalogs()]);
  const contacts = q.contact ? await svc.repo.listContacts() : undefined;
  return filterAnimals(
    animals,
    toFilters(q),
    { today: svc.today(), zones: cats.zones, ...(contacts ? { contacts } : {}) },
    {
      ...(q.page ? { page: q.page } : {}),
      ...(pageSize ?? q.pageSize ? { pageSize: pageSize ?? q.pageSize } : {}),
      ...(q.sort ? { sort: { field: q.sort, dir: q.dir ?? 'asc' } } : {}),
    },
  );
}

/** Convierte el cuerpo de un evento en `NewEventInput` (ciudad y contacto ya resueltos). */
async function prepareEvent(svc: Services, user: AuthUser, body: EventBody) {
  const cats = await svc.catalogs();
  const subtype = catalogIndex(cats).subtype(body.subtypeId);
  if (!subtype) throw new ApiError(422, 'subtype_not_found', 'El subtipo no existe.', 'subtypeId');
  if (!canAddEventType(user.profiles, subtype.typeId)) throw forbidden();
  const { contact: contactInput, cityName, ...rest } = body;
  const input: NewEventInput = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)) as unknown as NewEventInput;
  if (subtype.typeId === 'llegada' && !input.cityId && cityName) {
    const city = await svc.resolveCity(user, cityName);
    input.cityId = city.id;
    input.cityName = city.name;
  } else if (input.cityId) {
    const city = cats.cities.find((x) => x.id === input.cityId);
    if (!city) throw new ApiError(422, 'city_not_found', 'La ciudad no existe.', 'cityId');
    input.cityName = city.name;
  }
  if (input.document && subtype.typeId !== 'veterinario' && !subtype.docUpload) delete input.document;
  return { input, subtype, contactInput, cats };
}

function checkDocumentKey(animalId: number, input: NewEventInput) {
  if (input.document && !input.document.key.startsWith(fileKeys.eventDocPrefix(animalId)))
    throw new ApiError(400, 'validation', 'Clave de documento no válida.', 'document');
}

export function animalRoutes() {
  const r = new Hono<AppEnv>();

  r.get('/animals', async (c) => {
    need(c, 'animals:read');
    const q = readQuery(c, animalFiltersQuery);
    const page = await filteredAnimals(c, q);
    if (!has(c, 'animals:read_contacts')) page.items = page.items.map(redactAnimal);
    return c.json(page);
  });

  r.post('/animals', async (c) => {
    need(c, 'animals:write');
    const svc = c.get('svc');
    const user = c.get('user');
    const body = await readBody(c, z.object({ animal: animalInput, arrival: eventInput }));
    const { input, subtype, contactInput, cats } = await prepareEvent(svc, user, body.arrival);
    if (subtype.typeId !== 'llegada') throw new ApiError(422, 'event_not_allowed', 'El alta de un animal tiene que ser una Llegada.', 'subtypeId');
    if (!cats.species.some((s) => s.id === body.animal.speciesId)) throw new ApiError(422, 'species_not_found', 'La especie no existe.', 'speciesId');
    const { breedName, chip, ...animalData } = body.animal;
    if (chip && (await svc.repo.findAnimalByChip(chip.number))) throw new ApiError(409, 'chip_duplicate', 'Ya hay otro animal con ese chip.', 'chip');
    if (!animalData.breedId && breedName) animalData.breedId = await svc.resolveBreed(user, animalData.speciesId, breedName);

    const resolved = await svc.resolveEventContact(user, contactInput, subtype);
    if (resolved.contactId !== undefined) input.contactId = resolved.contactId;
    const id = await svc.repo.nextId('animal');
    checkDocumentKey(id, input);
    const result = createAnimalWithArrival(
      { id, ...clean(animalData), ...(chip ? { chip: clean(chip) } : {}), hasPhoto: false } as never,
      input,
      { today: svc.today(), now: svc.now(), userId: user.id, catalogs: cats, newEventId: await svc.repo.nextId('event') },
    );
    await svc.repo.saveAnimal(result.animal, { putEvents: [result.event] });
    svc.invalidateAnimals();
    await svc.audit(user, 'create', 'animal', id, `Alta de animal ${id} (${subtype.name})`);
    return c.json({ animal: result.animal, event: result.event, ...(resolved.contact ? { contact: resolved.contact } : {}) }, 201);
  });

  r.get('/animals/:id', async (c) => {
    need(c, 'animals:read');
    const svc = c.get('svc');
    const id = intParam(c, 'id');
    const animal = await svc.repo.getAnimal(id);
    if (!animal) throw notFound('El animal');
    const events = sortEvents(await svc.repo.getAnimalEvents(id));
    if (!has(c, 'animals:read_contacts')) return c.json({ animal: redactAnimal(animal), events: events.map(redactEvent), contacts: [] });
    const contacts = (await Promise.all(animal.contactIds.map((cid) => svc.repo.getContact(cid)))).filter((x): x is Contact => !!x);
    return c.json({ animal, events, contacts });
  });

  r.patch('/animals/:id', async (c) => {
    need(c, 'animals:write');
    const svc = c.get('svc');
    const user = c.get('user');
    const id = intParam(c, 'id');
    const patch = await readBody(c, animalPatch);
    const before = await svc.repo.getAnimal(id);
    if (!before) throw notFound('El animal');
    const next: Animal = { ...before, updatedAt: svc.now() };
    const { breedName, chip, ...fields } = patch;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (v === null) delete (next as unknown as Record<string, unknown>)[k];
      else (next as unknown as Record<string, unknown>)[k] = v;
    }
    if (patch.speciesId) {
      const cats = await svc.catalogs();
      if (!cats.species.some((s) => s.id === patch.speciesId)) throw new ApiError(422, 'species_not_found', 'La especie no existe.', 'speciesId');
    }
    if (!patch.breedId && breedName) next.breedId = await svc.resolveBreed(user, next.speciesId, breedName);
    if (chip === null) delete next.chip;
    else if (chip) next.chip = clean(chip);
    await svc.repo.saveAnimal(next, { previous: before });
    svc.invalidateAnimals();
    await svc.syncPublicPhoto(before, next);
    await svc.audit(user, 'update', 'animal', id, `Ficha editada (${Object.keys(patch).join(', ')})`);
    return c.json(next);
  });

  r.delete('/animals/:id', async (c) => {
    need(c, 'animals:delete');
    const svc = c.get('svc');
    const id = intParam(c, 'id');
    const animal = await svc.repo.getAnimal(id);
    if (!animal) throw notFound('El animal');
    const events = await svc.repo.getAnimalEvents(id);
    await svc.repo.deleteAnimal(animal, events);
    svc.invalidateAnimals();
    const keys = [fileKeys.animalPhoto(id), fileKeys.animalThumb(id), fileKeys.publicAnimal(id), ...events.flatMap((e) => (e.document ? [e.document.key] : []))];
    await Promise.all(keys.map((k) => svc.files.delete(k).catch(() => undefined)));
    await svc.audit(c.get('user'), 'delete', 'animal', id, `Animal ${id} borrado con ${events.length} eventos`);
    return c.body(null, 204);
  });

  r.get('/animals/:id/allowed-types', async (c) => {
    need(c, 'animals:read');
    const svc = c.get('svc');
    const animal = await svc.repo.getAnimal(intParam(c, 'id'));
    if (!animal) throw notFound('El animal');
    const cats = await svc.catalogs();
    const allowed = allowedEventTypes(catalogIndex(cats).statusCode(animal.statusId) ?? '', cats.subtypes);
    const profiles = c.get('user').profiles;
    return c.json({
      typeIds: allowed.typeIds.filter((t) => canAddEventType(profiles, t)),
      subtypes: allowed.subtypes.filter((s) => canAddEventType(profiles, s.typeId)),
    });
  });

  r.post('/animals/:id/events', async (c) => {
    needAny(c, 'animals:write', 'events:vet');
    const svc = c.get('svc');
    const user = c.get('user');
    const id = intParam(c, 'id');
    const body = await readBody(c, eventInput);
    const animal = await svc.repo.getAnimal(id);
    if (!animal) throw notFound('El animal');
    const { input, subtype, contactInput, cats } = await prepareEvent(svc, user, body);
    checkDocumentKey(id, input);
    const events = await svc.repo.getAnimalEvents(id);
    const resolved = await svc.resolveEventContact(user, contactInput, subtype);
    if (resolved.contactId !== undefined) input.contactId = resolved.contactId;
    const result = applyEvent(animal, events, input, {
      today: svc.today(),
      now: svc.now(),
      userId: user.id,
      catalogs: cats,
      newEventId: await svc.repo.nextId('event'),
    });
    await svc.repo.saveAnimal(result.animal, { previous: animal, putEvents: [result.event] });
    svc.invalidateAnimals();
    await svc.syncPublicPhoto(animal, result.animal);
    await svc.audit(user, 'create', 'event', result.event.id, `Evento ${subtype.name} en el animal ${id}`);
    return c.json({ animal: result.animal, event: result.event, ...(resolved.contact ? { contact: resolved.contact } : {}) }, 201);
  });

  r.delete('/animals/:id/events/:eventId', async (c) => {
    need(c, 'events:delete');
    const svc = c.get('svc');
    const id = intParam(c, 'id');
    const eventId = intParam(c, 'eventId');
    const animal = await svc.repo.getAnimal(id);
    if (!animal) throw notFound('El animal');
    const events = await svc.repo.getAnimalEvents(id);
    const result = removeEvent(animal, events, eventId, { now: svc.now(), catalogs: await svc.catalogs() });
    await svc.repo.saveAnimal(result.animal, { previous: animal, deleteEvents: [result.removed] });
    svc.invalidateAnimals();
    if (result.documentKeyToDelete) await svc.files.delete(result.documentKeyToDelete).catch(() => undefined);
    await svc.syncPublicPhoto(animal, result.animal);
    await svc.audit(c.get('user'), 'delete', 'event', eventId, `Evento ${eventId} borrado del animal ${id}`);
    return c.json({ animal: result.animal });
  });

  r.post('/animals/:id/photo-upload-url', async (c) => {
    need(c, 'animals:write');
    const svc = c.get('svc');
    const id = intParam(c, 'id');
    await readBody(c, z.object({ contentType: z.literal('image/jpeg').optional() }));
    if (!(await svc.repo.getAnimal(id))) throw notFound('El animal');
    const [photo, thumb] = await Promise.all([
      svc.files.uploadUrl(fileKeys.animalPhoto(id), 'image/jpeg'),
      svc.files.uploadUrl(fileKeys.animalThumb(id), 'image/jpeg'),
    ]);
    return c.json({ photo: { key: fileKeys.animalPhoto(id), url: photo }, thumb: { key: fileKeys.animalThumb(id), url: thumb } });
  });

  r.post('/animals/:id/photo-uploaded', async (c) => {
    need(c, 'animals:write');
    const svc = c.get('svc');
    const id = intParam(c, 'id');
    const before = await svc.repo.getAnimal(id);
    if (!before) throw notFound('El animal');
    const next: Animal = { ...before, hasPhoto: true, updatedAt: svc.now() };
    await svc.repo.saveAnimal(next, { previous: before });
    svc.invalidateAnimals();
    await svc.syncPublicPhoto(before, next, true);
    await svc.audit(c.get('user'), 'update', 'animal', id, 'Foto actualizada');
    return c.json(next);
  });

  r.post('/animals/:id/event-upload-url', async (c) => {
    needAny(c, 'animals:write', 'events:vet');
    const svc = c.get('svc');
    const id = intParam(c, 'id');
    const body = await readBody(c, z.object({ fileName: z.string().trim().min(1).max(300), contentType: z.string().trim().min(1).max(150) }));
    if (!(await svc.repo.getAnimal(id))) throw notFound('El animal');
    const ext = (body.fileName.match(/\.([A-Za-z0-9]{1,8})$/)?.[1] ?? 'bin').toLowerCase();
    const key = `${fileKeys.eventDocPrefix(id)}${svc.newId()}.${ext}`;
    return c.json({ key, url: await svc.files.uploadUrl(key, body.contentType) });
  });

  r.get('/animals/:id/file-url', async (c) => {
    need(c, 'animals:read');
    const svc = c.get('svc');
    const id = intParam(c, 'id');
    const key = c.req.query('key') ?? '';
    if (!key.startsWith(fileKeys.animalPrefix(id)) || key.includes('..')) throw new ApiError(400, 'validation', 'Clave no válida.', 'key');
    // Los adjuntos de eventos pueden llevar datos de contactos: Bienestar solo ve las fotos.
    if (key.startsWith(fileKeys.eventDocPrefix(id)) && !has(c, 'animals:read_contacts')) throw forbidden();
    const events = key.startsWith(fileKeys.eventDocPrefix(id)) ? await svc.repo.getAnimalEvents(id) : [];
    const name = events.find((e) => e.document?.key === key)?.document?.originalName;
    return c.json({ url: await svc.files.downloadUrl(key, name) });
  });

  return r;
}

/** Quita `undefined` de un objeto (exactOptionalPropertyTypes no está activo, pero el dominio compara campos). */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}
