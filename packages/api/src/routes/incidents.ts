/** Incidencias de Bienestar: alta con fotos, gestión, cita, derivación y resolución en cascada. */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  addIncidentPhoto,
  ALLOWED_PHOTO_MIME,
  applyEvent,
  assertIncidentImmutable,
  can,
  canWriteAgenda,
  catalogIndex,
  createIncident,
  createIncidentAppointment,
  createReferral,
  isClosedAgendaItem,
  isReferral,
  MAX_PHOTO_BYTES,
  resolveIncident,
  startIncident,
  type HistoryEvent,
  type Incident,
} from '@modepran/domain';
import { fileKeys } from '../files.js';
import { ApiError, forbidden, has, need, notFound, readBody, readQuery } from '../http.js';
import { incidentInput, isoDate, time } from '../schemas.js';
import type { AppEnv } from '../services.js';

/** ¿Puede ver la incidencia? Gestión (`incidents:read`) todas; Bienestar solo las suyas. */
function canSee(c: Context<AppEnv>, i: Incident): boolean {
  return has(c, 'incidents:read') || i.reporterUserId === c.get('user').id;
}

async function load(c: Context<AppEnv>): Promise<Incident> {
  const i = await c.get('svc').repo.getIncident(c.req.param('id') ?? '');
  if (!i || !canSee(c, i)) throw notFound('La incidencia');
  return i;
}

function canAddPhotos(c: Context<AppEnv>, i: Incident) {
  return has(c, 'incidents:manage') || (i.reporterUserId === c.get('user').id && has(c, 'incidents:create'));
}

export function incidentRoutes() {
  const r = new Hono<AppEnv>();

  r.get('/incidents', async (c) => {
    const svc = c.get('svc');
    const user = c.get('user');
    const q = readQuery(c, z.object({ status: z.enum(['pendiente', 'en_proceso', 'resuelta']).optional(), mine: z.enum(['1', 'true', '0', 'false']).optional() }));
    const mine = q.mine === '1' || q.mine === 'true' || !has(c, 'incidents:read');
    if (mine && !has(c, 'incidents:own_followup') && !has(c, 'incidents:create') && !has(c, 'incidents:read')) throw forbidden();
    const list = await svc.repo.listIncidents({ ...(q.status ? { status: q.status } : {}), ...(mine ? { reporterUserId: user.id } : {}) });
    return c.json(list);
  });

  r.get('/incidents/:id', async (c) => {
    const svc = c.get('svc');
    const incident = await load(c);
    const agenda = await svc.repo.listAgendaByIncident(incident.id);
    const photoUrls = await Promise.all(incident.photos.map(async (p) => ({ key: p.key, url: await svc.files.downloadUrl(p.key) })));
    return c.json({ incident, agenda, photoUrls });
  });

  r.post('/incidents', async (c) => {
    need(c, 'incidents:create');
    const svc = c.get('svc');
    const user = c.get('user');
    const body = await readBody(c, incidentInput);
    if (body.animalId !== undefined && !(await svc.repo.getAnimal(body.animalId)))
      throw new ApiError(422, 'animal_not_found', 'El animal no existe.', 'animalId');
    const cats = await svc.catalogs();
    const incident = createIncident(
      Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined)) as unknown as Parameters<typeof createIncident>[0],
      { now: svc.now(), userId: user.id, newId: svc.newId(), areas: cats.areas },
    );
    await svc.repo.saveIncident(incident);
    await svc.audit(user, 'create', 'incident', incident.id, `Incidencia ${incident.priority} en ${incident.areaName}`);
    return c.json(incident, 201);
  });

  r.post('/incidents/:id/photo-upload-url', async (c) => {
    const svc = c.get('svc');
    const incident = await load(c);
    if (!canAddPhotos(c, incident)) throw forbidden();
    const body = await readBody(c, z.object({ contentType: z.string(), bytes: z.number().int().positive() }));
    if (!ALLOWED_PHOTO_MIME.includes(body.contentType)) throw new ApiError(422, 'invalid_photo', 'Formato de foto no admitido.', 'contentType');
    if (body.bytes > MAX_PHOTO_BYTES) throw new ApiError(422, 'invalid_photo', 'La foto es demasiado grande.', 'bytes');
    const ext = body.contentType.split('/')[1]!.replace('jpeg', 'jpg');
    const key = `${fileKeys.incidentPrefix(incident.id)}${svc.newId()}.${ext}`;
    return c.json({ key, url: await svc.files.uploadUrl(key, body.contentType) });
  });

  r.post('/incidents/:id/photos', async (c) => {
    const svc = c.get('svc');
    const incident = await load(c);
    if (!canAddPhotos(c, incident)) throw forbidden();
    const body = await readBody(c, z.object({ key: z.string(), mime: z.string(), bytes: z.number().int().positive() }));
    if (!body.key.startsWith(fileKeys.incidentPrefix(incident.id)) || body.key.includes('..'))
      throw new ApiError(400, 'validation', 'Clave de foto no válida.', 'key');
    const next = addIncidentPhoto(incident, { ...body, uploadedAt: svc.now() });
    assertIncidentImmutable(incident, next);
    await svc.repo.saveIncident(next);
    await svc.audit(c.get('user'), 'update', 'incident', incident.id, 'Foto añadida');
    return c.json(next);
  });

  r.post('/incidents/:id/start', async (c) => {
    need(c, 'incidents:manage');
    const svc = c.get('svc');
    const incident = await load(c);
    const next = startIncident(incident, { now: svc.now(), userId: c.get('user').id });
    await svc.repo.saveIncident(next);
    await svc.audit(c.get('user'), 'update', 'incident', incident.id, 'En proceso');
    return c.json(next);
  });

  r.post('/incidents/:id/appointment', async (c) => {
    need(c, 'incidents:manage');
    const svc = c.get('svc');
    const user = c.get('user');
    const incident = await load(c);
    const body = await readBody(
      c,
      z.object({ agenda: z.enum(['carlet', 'modevet']), date: isoDate, time, appointmentTypeId: z.string().min(1), notes: z.string().max(5000).optional() }),
    );
    if (!canWriteAgenda(user.profiles, body.agenda)) throw forbidden();
    const cats = await svc.catalogs();
    const res = createIncidentAppointment(incident, { ...body, ...(body.notes ? { notes: body.notes } : {}) } as Parameters<typeof createIncidentAppointment>[1], {
      now: svc.now(),
      userId: user.id,
      newId: svc.newId(),
      appointmentTypes: cats.appointmentTypes,
      staff: cats.staff,
    });
    await svc.repo.saveIncident(res.incident, [res.appointment]);
    await svc.audit(user, 'create', 'agenda', res.appointment.id, `Cita de incidencia ${incident.id} en ${body.agenda}`);
    return c.json(res, 201);
  });

  r.post('/incidents/:id/referral', async (c) => {
    need(c, 'incidents:manage');
    const svc = c.get('svc');
    const user = c.get('user');
    if (!canWriteAgenda(user.profiles, 'modevet', true)) throw forbidden();
    const incident = await load(c);
    const body = await readBody(
      c,
      z.object({ date: isoDate, time: time.optional().or(z.literal('')), appointmentTypeId: z.string().min(1), notes: z.string().max(5000).optional() }),
    );
    const cats = await svc.catalogs();
    const existing = await svc.repo.listAgendaByIncident(incident.id);
    const res = createReferral(
      incident,
      existing,
      { date: body.date, appointmentTypeId: body.appointmentTypeId, ...(body.time ? { time: body.time } : {}), ...(body.notes ? { notes: body.notes } : {}) },
      { now: svc.now(), userId: user.id, newId: svc.newId(), appointmentTypes: cats.appointmentTypes, staff: cats.staff },
    );
    await svc.repo.saveIncident(res.incident, [res.referral]);
    await svc.audit(user, 'create', 'agenda', res.referral.id, `Derivación a Modevet de la incidencia ${incident.id}`);
    return c.json(res, 201);
  });

  r.post('/incidents/:id/resolve', async (c) => {
    const svc = c.get('svc');
    const user = c.get('user');
    const incident = await load(c);
    const linked = await svc.repo.listAgendaByIncident(incident.id);
    const hasReferral = linked.some((i) => isReferral(i) && !isClosedAgendaItem(i));
    if (!has(c, 'incidents:manage') && !(has(c, 'incidents:resolve_referred') && hasReferral)) throw forbidden();
    const body = await readBody(
      c,
      z.object({
        byStaffId: z.string().min(1),
        treatment: z.string().trim().min(1).max(5000),
        registerHistory: z.boolean().optional(),
        subtypeId: z.string().optional(),
      }),
    );
    const cats = await svc.catalogs();
    const res = resolveIncident(incident, linked, body, { now: svc.now(), userId: user.id, staff: cats.staff });

    // "Registrar en historial": evento Veterinario en la ficha del animal (si la tiene).
    let event: HistoryEvent | undefined;
    if (body.registerHistory) {
      if (incident.animalId === undefined) throw new ApiError(422, 'no_animal', 'La incidencia no es de un animal con ficha.');
      if (!can(user.profiles, 'events:vet')) throw forbidden();
      const idx = catalogIndex(cats);
      const subtype = body.subtypeId ? idx.subtype(body.subtypeId) : idx.subtypeByCodeName('intervencion');
      if (!subtype || subtype.typeId !== 'veterinario') throw new ApiError(422, 'invalid_subtype', 'Elige un subtipo veterinario.', 'subtypeId');
      const animal = await svc.repo.getAnimal(incident.animalId);
      if (!animal) throw notFound('El animal');
      const events = await svc.repo.getAnimalEvents(animal.id);
      const applied = applyEvent(
        animal,
        events,
        {
          subtypeId: subtype.id,
          date: svc.today(),
          userId: body.byStaffId,
          notes: `Incidencia: ${incident.text}\nActuación: ${body.treatment}`,
          ...(subtype.switch ? { switchValue: true } : {}),
        },
        { today: svc.today(), now: svc.now(), userId: user.id, catalogs: cats, newEventId: await svc.repo.nextId('event') },
      );
      await svc.repo.saveAnimal(applied.animal, { previous: animal, putEvents: [applied.event] });
      svc.invalidateAnimals();
      event = applied.event;
    }
    await svc.repo.saveIncident(res.incident, res.updatedItems);
    await svc.audit(user, 'update', 'incident', incident.id, `Resuelta (${res.updatedItems.length} citas cerradas${event ? ', con evento' : ''})`);
    return c.json({ incident: res.incident, updatedItems: res.updatedItems, ...(event ? { event } : {}) });
  });

  return r;
}
