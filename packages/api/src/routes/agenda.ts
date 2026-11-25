/** Agenda de Carlet y Modevet: citas, avisos, notas, reagendar y "registrar en historial". */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  addDays,
  applyEvent,
  canReadAgenda,
  canWriteAgenda,
  catalogIndex,
  changeAgendaStatus,
  createAgendaItem,
  diffDays,
  foldText,
  overdueItems,
  reschedule,
  updateAgendaItem,
  type AgendaItem,
  type AgendaName,
  type HistoryEvent,
  type Profile,
} from '@modepran/domain';
import { ApiError, forbidden, need, notFound, readBody, readQuery } from '../http.js';
import { agendaInput, agendaPatch, isoDate, time } from '../schemas.js';
import type { AppEnv, Services } from '../services.js';
import type { AuthUser, StoredAgendaItem } from '../types.js';

const AGENDAS: AgendaName[] = ['carlet', 'modevet'];

export function canReadItem(profiles: Profile[], item: Pick<AgendaItem, 'agenda'>): boolean {
  return item.agenda === 'ambas' ? AGENDAS.some((a) => canReadAgenda(profiles, a)) : canReadAgenda(profiles, item.agenda);
}
export function canWriteItem(profiles: Profile[], item: Pick<AgendaItem, 'agenda' | 'isReferral'>): boolean {
  return item.agenda === 'ambas' ? AGENDAS.some((a) => canWriteAgenda(profiles, a)) : canWriteAgenda(profiles, item.agenda, !!item.isReferral);
}

async function loadItem(c: Context<AppEnv>) {
  const item = await c.get('svc').repo.getAgendaItem(c.req.param('id') ?? '');
  if (!item || !canReadItem(c.get('user').profiles, item)) throw notFound('El elemento de agenda');
  return item;
}

/** Propietario de un animal externo → contacto `cliente_modevet` (se reutiliza si coincide nombre y teléfono). */
async function ensureOwnerContact(svc: Services, user: AuthUser, item: AgendaItem): Promise<void> {
  if (!item.owner || item.animalId !== undefined || item.agenda !== 'modevet') return;
  const owner = item.owner;
  const contacts = await svc.repo.listContacts();
  const found = contacts.find(
    (ct) => foldText(`${ct.name} ${ct.surname ?? ''}`) === foldText(owner.name) && (ct.phone ?? '') === (owner.phone ?? ''),
  );
  if (found) {
    if (!found.kind.includes('cliente_modevet')) await svc.repo.saveContact({ ...found, kind: [...found.kind, 'cliente_modevet'] }, found);
    return;
  }
  const id = await svc.repo.nextId('contact');
  await svc.repo.saveContact({
    id,
    name: owner.name,
    ...(owner.phone ? { phone: owner.phone } : {}),
    ...(owner.email ? { email: owner.email } : {}),
    kind: ['cliente_modevet'],
    createdAt: svc.now(),
  });
  await svc.audit(user, 'create', 'contact', id, 'Cliente de Modevet creado desde una cita');
}

export function agendaRoutes() {
  const r = new Hono<AppEnv>();

  r.get('/agenda', async (c) => {
    const svc = c.get('svc');
    const q = readQuery(c, z.object({ agenda: z.enum(['carlet', 'modevet']), from: isoDate, to: isoDate, overdue: z.enum(['1', 'true', '0', 'false']).optional() }));
    if (!canReadAgenda(c.get('user').profiles, q.agenda)) throw forbidden();
    if (q.from > q.to || diffDays(q.from, q.to) > 93) throw new ApiError(400, 'validation', 'Rango de fechas no válido (máx. 93 días).', 'from');
    const items = (await svc.repo.listAgenda(q.agenda, q.from, q.to)).sort((a, b) =>
      `${a.date}#${a.time ?? '99:99'}`.localeCompare(`${b.date}#${b.time ?? '99:99'}`),
    );
    const out: { items: StoredAgendaItem[]; overdue?: AgendaItem[] } = { items };
    if (q.overdue === '1' || q.overdue === 'true') {
      const today = svc.today();
      const past = await svc.repo.listAgenda(q.agenda, addDays(today, -60), addDays(today, -1));
      out.overdue = overdueItems(past, q.agenda, today);
    }
    return c.json(out);
  });

  r.get('/agenda/:id', async (c) => c.json(await loadItem(c)));

  r.post('/agenda', async (c) => {
    const svc = c.get('svc');
    const user = c.get('user');
    const body = await readBody(c, agendaInput);
    if (!canWriteItem(user.profiles, body)) throw forbidden();
    if (body.animalId !== undefined && !(await svc.repo.getAnimal(body.animalId)))
      throw new ApiError(422, 'animal_not_found', 'El animal no existe.', 'animalId');
    const cats = await svc.catalogs();
    const { time: t, ...rest } = body;
    const item = createAgendaItem(
      { ...rest, ...(t ? { time: t } : {}) } as Parameters<typeof createAgendaItem>[0],
      { now: svc.now(), userId: user.id, newId: svc.newId(), appointmentTypes: cats.appointmentTypes, staff: cats.staff },
    );
    await svc.repo.saveAgendaItems([item]);
    await ensureOwnerContact(svc, user, item);
    await svc.audit(user, 'create', 'agenda', item.id, `Alta de ${item.kind} en ${item.agenda} (${item.date})`);
    return c.json(item, 201);
  });

  r.patch('/agenda/:id', async (c) => {
    const svc = c.get('svc');
    const user = c.get('user');
    const item = await loadItem(c);
    if (!canWriteItem(user.profiles, item)) throw forbidden();
    const patch = await readBody(c, agendaPatch);
    const { status, ...fields } = patch;
    let next: StoredAgendaItem = updateAgendaItem(item, Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)));
    if (status) next = { ...next, ...changeAgendaStatus(next, status, { now: svc.now(), userId: user.id }) };
    await svc.repo.saveAgendaItems([next]);
    await svc.audit(user, 'update', 'agenda', item.id, `Cambio en ${item.kind} (${Object.keys(patch).join(', ')})`);
    return c.json(next);
  });

  r.post('/agenda/:id/reschedule', async (c) => {
    const svc = c.get('svc');
    const user = c.get('user');
    const item = await loadItem(c);
    if (!canWriteItem(user.profiles, item)) throw forbidden();
    const body = await readBody(c, z.object({ date: isoDate, time: time.optional().or(z.literal('')) }));
    const cats = await svc.catalogs();
    const res = reschedule(item, { date: body.date, ...(body.time ? { time: body.time } : {}) }, {
      now: svc.now(),
      userId: user.id,
      newId: svc.newId(),
      appointmentTypes: cats.appointmentTypes,
      staff: cats.staff,
    });
    const created: StoredAgendaItem = { ...res.created };
    delete created.historyEventIds;
    await svc.repo.saveAgendaItems([res.original, created]);
    await svc.audit(user, 'update', 'agenda', item.id, `Cita reagendada a ${body.date} (${created.id})`);
    return c.json({ original: res.original, created });
  });

  r.post('/agenda/:id/register-history', async (c) => {
    need(c, 'events:vet');
    const svc = c.get('svc');
    const user = c.get('user');
    const item = await loadItem(c);
    const body = await readBody(c, z.object({ actionIndexes: z.array(z.number().int().nonnegative()).optional() }));
    if (item.kind !== 'cita' || item.animalId === undefined) throw new ApiError(422, 'no_animal', 'Solo citas de animales con ficha.');
    if (item.status !== 'concluida') throw new ApiError(422, 'not_concluded', 'La cita tiene que estar concluida.');
    if (item.historyEventIds?.length) throw new ApiError(422, 'already_registered', 'Esta cita ya se registró en el historial.');
    let animal = await svc.repo.getAnimal(item.animalId);
    if (!animal) throw notFound('El animal');
    const before = animal;
    const cats = await svc.catalogs();
    const idx = catalogIndex(cats);
    let events = await svc.repo.getAnimalEvents(animal.id);
    const created: HistoryEvent[] = [];
    const skipped: { index: number; reason: string }[] = [];
    const actions = item.actions ?? [];
    const indexes = body.actionIndexes ?? actions.map((_, i) => i);
    for (const i of indexes) {
      const a = actions[i];
      if (!a) {
        skipped.push({ index: i, reason: 'No existe esa actuación.' });
        continue;
      }
      const cat = cats.actionCategories.find((x) => x.id === a.categoryId);
      const sub = cat?.subcategories.find((x) => x.id === a.subcategoryId);
      const subtypeId = sub?.vetSubtypeId ?? cat?.vetSubtypeId;
      const subtype = idx.subtype(subtypeId);
      if (!subtype || subtype.typeId !== 'veterinario') {
        skipped.push({ index: i, reason: 'La actuación no tiene subtipo veterinario equivalente.' });
        continue;
      }
      if (subtype.vaccine || subtype.illness || subtype.docUpload) {
        skipped.push({ index: i, reason: `"${subtype.name}" necesita más datos: regístralo desde la ficha.` });
        continue;
      }
      const notes = [cat?.name, sub?.name, a.text, item.text].filter(Boolean).join(' · ');
      try {
        const res = applyEvent(
          animal,
          events,
          {
            subtypeId: subtype.id,
            date: item.date,
            userId: user.id,
            ...(notes ? { notes } : {}),
            ...(subtype.switch ? { switchValue: true } : {}),
          },
          { today: svc.today(), now: svc.now(), userId: user.id, catalogs: cats, newEventId: await svc.repo.nextId('event') },
        );
        animal = res.animal;
        events = res.events;
        created.push(res.event);
      } catch (e) {
        skipped.push({ index: i, reason: e instanceof Error ? e.message : 'No se pudo registrar.' });
      }
    }
    if (created.length) {
      await svc.repo.saveAnimal(animal, { previous: before, putEvents: created });
      svc.invalidateAnimals();
      await svc.repo.saveAgendaItems([{ ...item, historyEventIds: created.map((e) => e.id) }]);
      await svc.audit(user, 'create', 'event', created.map((e) => e.id).join(','), `Historial registrado desde la cita ${item.id}`);
    }
    return c.json({ events: created, skipped });
  });

  return r;
}
