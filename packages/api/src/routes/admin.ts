/** Administración (usuarios, auditoría, export CSV) y web pública de adopciones. */
import { Hono } from 'hono';
import { z } from 'zod';
import {
  addDays,
  catalogIndex,
  EVENT_TYPE_NAMES,
  formatAge,
  objectsToCsv,
  PROFILES,
  type Animal,
  type Contact,
  type HistoryEvent,
  type Incident,
} from '@modepran/domain';
import { fileKeys } from '../files.js';
import { ApiError, need, notFound, readBody, readQuery } from '../http.js';
import { isoDate } from '../schemas.js';
import type { AppEnv, Services } from '../services.js';
import type { Catalogs, StoredAgendaItem } from '../types.js';

const profiles = z.array(z.enum(PROFILES)).min(1);

export function adminRoutes() {
  const r = new Hono<AppEnv>();

  r.get('/users', async (c) => {
    need(c, 'users:manage');
    return c.json(await c.get('svc').users.list());
  });

  r.post('/users', async (c) => {
    need(c, 'users:manage');
    const svc = c.get('svc');
    const body = await readBody(c, z.object({ email: z.string().trim().toLowerCase().email(), name: z.string().trim().min(1).max(150), profiles }));
    const user = await svc.users.create(body);
    svc.invalidateUsers();
    await svc.audit(c.get('user'), 'create', 'user', user.id, `Usuario creado con perfiles ${body.profiles.join(', ')}`);
    return c.json(user, 201);
  });

  r.patch('/users/:id', async (c) => {
    need(c, 'users:manage');
    const svc = c.get('svc');
    const id = c.req.param('id');
    const body = await readBody(c, z.object({ name: z.string().trim().min(1).max(150).optional(), profiles: profiles.optional(), active: z.boolean().optional() }));
    if (id === c.get('user').id && (body.active === false || (body.profiles && !body.profiles.includes('admin'))))
      throw new ApiError(422, 'self_lockout', 'No puedes desactivarte ni quitarte el perfil admin a ti mismo.');
    if (!(await svc.users.get(id))) throw notFound('El usuario');
    const patch = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
    const user = await svc.users.update(id, patch);
    svc.invalidateUsers();
    await svc.audit(c.get('user'), 'update', 'user', id, `Usuario editado (${Object.keys(patch).join(', ')})`);
    return c.json(user);
  });

  r.get('/audit', async (c) => {
    need(c, 'audit:read');
    const svc = c.get('svc');
    const q = readQuery(c, z.object({ from: isoDate.optional(), to: isoDate.optional(), userId: z.string().optional(), entity: z.string().optional(), action: z.string().optional() }));
    const to = q.to ?? svc.today();
    const from = q.from ?? addDays(to, -30);
    const list = await svc.repo.listAudit({ from, to, ...(q.userId ? { userId: q.userId } : {}), ...(q.entity ? { entity: q.entity } : {}), ...(q.action ? { action: q.action } : {}) });
    return c.json(list.slice(0, 1000));
  });

  r.get('/export/:file', async (c) => {
    need(c, 'export:csv');
    const svc = c.get('svc');
    const m = /^(animals|contacts|events|agenda|incidents)\.csv$/.exec(c.req.param('file'));
    if (!m) throw notFound('La exportación');
    const what = m[1]!;
    const csv = await buildCsv(svc, what);
    await svc.audit(c.get('user'), 'export', 'csv', what, `Exportación CSV de ${what}`);
    return c.body(csv, 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="modepran-${what}-${svc.today()}.csv"`,
    });
  });

  return r;
}

async function buildCsv(svc: Services, what: string): Promise<string> {
  const cats = await svc.catalogs();
  const idx = catalogIndex(cats);
  const n = (list: { id: string; name: string }[], id?: string) => (id ? (list.find((x) => x.id === id)?.name ?? id) : '');
  switch (what) {
    case 'animals':
      return objectsToCsv<Animal>(await svc.repo.listAnimals(), [
        { header: 'ID', value: (a) => a.id },
        { header: 'Nombre', value: (a) => a.name },
        { header: 'Especie', value: (a) => n(cats.species, a.speciesId) },
        { header: 'Raza', value: (a) => n(cats.breeds, a.breedId) },
        { header: 'Color', value: (a) => a.color },
        { header: 'Sexo', value: (a) => a.gender },
        { header: 'Peso (kg)', value: (a) => a.weightKg },
        { header: 'Tamaño', value: (a) => a.size },
        { header: 'Nacimiento', value: (a) => a.bornAt },
        { header: 'Estado', value: (a) => idx.status(a.statusId)?.name ?? '' },
        { header: 'Centro', value: (a) => n(cats.centers, a.centerId) },
        { header: 'Esterilizado', value: (a) => a.sterilized },
        { header: 'PPP', value: (a) => a.ppp },
        { header: 'Web', value: (a) => a.visibleWeb },
        { header: 'Comp. perros', value: (a) => a.compatibleDogs },
        { header: 'Comp. gatos', value: (a) => a.compatibleCats },
        { header: 'Chip', value: (a) => a.chip?.number },
        { header: 'Última llegada', value: (a) => a.lastArrival?.date },
        { header: 'Ciudad llegada', value: (a) => a.lastArrival?.cityName },
        { header: 'Última salida', value: (a) => a.lastExit?.date },
      ]);
    case 'contacts':
      return objectsToCsv<Contact>(await svc.repo.listContacts(), [
        { header: 'ID', value: (x) => x.id },
        { header: 'Nombre', value: (x) => x.name },
        { header: 'Apellidos', value: (x) => x.surname },
        { header: 'NIF', value: (x) => x.nif },
        { header: 'Teléfono', value: (x) => x.phone },
        { header: 'Email', value: (x) => x.email },
        { header: 'Dirección', value: (x) => x.address },
        { header: 'CP', value: (x) => x.zip },
        { header: 'Ciudad', value: (x) => x.cityName ?? n(cats.cities, x.cityId) },
        { header: 'Provincia', value: (x) => x.province },
        { header: 'Tipo', value: (x) => x.kind.join(', ') },
      ]);
    case 'events':
      return objectsToCsv<HistoryEvent>(await svc.repo.listEvents(), [
        { header: 'ID', value: (e) => e.id },
        { header: 'Animal', value: (e) => e.animalId },
        { header: 'Fecha', value: (e) => e.date },
        { header: 'Tipo', value: (e) => EVENT_TYPE_NAMES[e.typeId] },
        { header: 'Subtipo', value: (e) => idx.subtype(e.subtypeId)?.name ?? e.subtypeId },
        { header: 'Contacto', value: (e) => e.contactId },
        { header: 'Centro', value: (e) => n(cats.centers, e.centerId) },
        { header: 'Ciudad', value: (e) => e.cityName },
        { header: 'Notas', value: (e) => e.notes },
      ]);
    case 'agenda': {
      const items = [
        ...(await svc.repo.listAgenda('carlet', '0000-01-01', '9999-12-31')),
        ...(await svc.repo.listAgenda('modevet', '0000-01-01', '9999-12-31')).filter((i) => i.agenda !== 'ambas'),
      ];
      return objectsToCsv<StoredAgendaItem>(items, [
        { header: 'ID', value: (i) => i.id },
        { header: 'Tipo', value: (i) => i.kind },
        { header: 'Agenda', value: (i) => i.agenda },
        { header: 'Fecha', value: (i) => i.date },
        { header: 'Hora', value: (i) => i.time },
        { header: 'Estado', value: (i) => i.status },
        { header: 'Tipo de cita', value: (i) => i.appointmentType?.name },
        { header: 'Animal', value: (i) => i.animalId ?? i.externalAnimal?.name },
        { header: 'Texto', value: (i) => i.text },
        { header: 'Incidencia', value: (i) => i.incidentId },
        { header: 'Derivación', value: (i) => !!i.isReferral },
      ]);
    }
    case 'incidents':
      return objectsToCsv<Incident>(await svc.repo.listIncidents(), [
        { header: 'ID', value: (i) => i.id },
        { header: 'Creada', value: (i) => i.createdAt },
        { header: 'Animal', value: (i) => i.animalId ?? i.animalName },
        { header: 'Especie', value: (i) => i.species },
        { header: 'Ubicación', value: (i) => i.areaName },
        { header: 'Prioridad', value: (i) => i.priority },
        { header: 'Estado', value: (i) => i.status },
        { header: 'Texto', value: (i) => i.text },
        { header: 'Tratamiento', value: (i) => i.resolution?.treatment },
      ]);
  }
  return '';
}

// ───────────────────────── Público ─────────────────────────

export interface PublicAnimal {
  id: number;
  name: string;
  speciesId: string;
  speciesName: string;
  gender: Animal['gender'];
  size?: Animal['size'];
  bornAt?: string;
  age?: string;
  sterilized: boolean;
  compatibleDogs: boolean;
  compatibleCats: boolean;
  photoUrl?: string;
}

/** Solo datos del animal: nada de contactos, chip, notas ni historial. */
export function toPublicAnimal(a: Animal, cats: Catalogs, today: string): PublicAnimal {
  return {
    id: a.id,
    name: a.name,
    speciesId: a.speciesId,
    speciesName: cats.species.find((s) => s.id === a.speciesId)?.name ?? '',
    gender: a.gender,
    ...(a.size ? { size: a.size } : {}),
    ...(a.bornAt ? { bornAt: a.bornAt, age: formatAge(a.bornAt, today) } : {}),
    sterilized: a.sterilized,
    compatibleDogs: a.compatibleDogs,
    compatibleCats: a.compatibleCats,
    ...(a.hasPhoto ? { photoUrl: fileKeys.publicAnimalUrl(a.id) } : {}),
  };
}

export function publicRoutes() {
  const r = new Hono<AppEnv>();
  const visible = async (svc: Services) => {
    const [animals, cats] = await Promise.all([svc.animals(), svc.catalogs()]);
    const idx = catalogIndex(cats);
    return { cats, list: animals.filter((a) => a.visibleWeb && idx.statusCode(a.statusId) === 'disponible') };
  };

  r.get('/public/animals', async (c) => {
    const svc = c.get('svc');
    const q = readQuery(c, z.object({ speciesId: z.string().optional(), gender: z.enum(['male', 'female', 'none']).optional(), size: z.enum(['small', 'medium', 'big']).optional() }));
    const { cats, list } = await visible(svc);
    const out = list
      .filter((a) => (!q.speciesId || a.speciesId === q.speciesId) && (!q.gender || a.gender === q.gender) && (!q.size || a.size === q.size))
      .sort((a, b) => b.id - a.id)
      .map((a) => toPublicAnimal(a, cats, svc.today()));
    c.header('cache-control', 'public, max-age=60');
    return c.json(out);
  });

  r.get('/public/animals/:id', async (c) => {
    const svc = c.get('svc');
    const id = Number(c.req.param('id'));
    const { cats, list } = await visible(svc);
    const a = list.find((x) => x.id === id);
    if (!a) throw notFound('El animal');
    c.header('cache-control', 'public, max-age=60');
    return c.json(toPublicAnimal(a, cats, svc.today()));
  });

  return r;
}
