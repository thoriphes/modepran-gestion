/** Sesión, catálogos y contactos. */
import { Hono } from 'hono';
import { z } from 'zod';
import {
  contactFullName,
  includesFolded,
  normalizeContactData,
  normalizeNif,
  paginate,
  permissionsFor,
  slugify,
  type Contact,
} from '@modepran/domain';
import { ApiError, forbidden, has, intParam, need, needAny, notFound, readBody, readQuery } from '../http.js';
import { contactData, qInt } from '../schemas.js';
import type { AppEnv } from '../services.js';
import { CATALOG_TYPES, OPERATIONAL_CATALOGS, type AnyCatalogItem, type CatalogType } from '../types.js';

const base = { name: z.string().trim().min(1).max(200), active: z.boolean().default(true) };
const flag = z.boolean().default(false);
const CATALOG_SCHEMAS: Record<CatalogType, z.ZodObject<z.ZodRawShape>> = {
  species: z.object({ ...base, code: z.string().max(50).optional() }),
  breeds: z.object({ ...base, speciesId: z.string().min(1) }),
  cities: z.object(base),
  zones: z.object({ ...base, cityIds: z.array(z.string()).default([]) }),
  centers: z.object({ ...base, code: z.string().max(50).optional() }),
  statuses: z.object({ ...base, code: z.string().min(1).max(60) }),
  subtypes: z.object({
    ...base,
    typeId: z.enum(['llegada', 'salida', 'veterinario', 'movimientos']),
    code: z.string().min(1).max(60),
    resultStatusId: z.string().optional(),
    user: flag,
    contact: flag,
    center: flag,
    notes: flag,
    vaccine: flag,
    illness: flag,
    colony: flag,
    date: flag,
    docGenerate: flag,
    docUpload: flag,
    switch: flag,
    switchLabel: z.string().max(60).optional(),
  }),
  vaccines: z.object(base),
  illnesses: z.object(base),
  colonies: z.object(base),
  areas: z.object({ ...base, species: z.array(z.enum(['perros', 'gatos'])).default([]) }),
  staff: z.object({ ...base, roles: z.array(z.enum(['cuidadora', 'veterinaria', 'auxiliar'])).default([]) }),
  appointmentTypes: z.object({ ...base, color: z.string().regex(/^#[0-9a-fA-F]{6}$/) }),
  actionCategories: z.object({
    ...base,
    vetSubtypeId: z.string().optional(),
    subcategories: z
      .array(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(200), active: z.boolean().default(true), vetSubtypeId: z.string().optional() }))
      .default([]),
  }),
};

function catalogType(raw: string): CatalogType {
  if (!(CATALOG_TYPES as readonly string[]).includes(raw)) throw new ApiError(404, 'not_found', 'Ese catálogo no existe.');
  return raw as CatalogType;
}

export function coreRoutes() {
  const r = new Hono<AppEnv>();

  r.get('/me', (c) => {
    const u = c.get('user');
    return c.json({ id: u.id, email: u.email ?? null, name: u.name, profiles: u.profiles, permissions: permissionsFor(u.profiles) });
  });

  // ───────────── Catálogos ─────────────
  r.get('/catalogs', async (c) => c.json(await c.get('svc').catalogs()));

  const canWriteCatalog = (c: Parameters<typeof has>[0], type: CatalogType) =>
    has(c, 'catalogs:write') || (OPERATIONAL_CATALOGS.includes(type) && has(c, 'catalogs:operational'));

  r.post('/catalogs/:type', async (c) => {
    const svc = c.get('svc');
    const type = catalogType(c.req.param('type'));
    if (!canWriteCatalog(c, type)) throw forbidden();
    const body = await readBody(c, CATALOG_SCHEMAS[type].extend({ id: z.string().regex(/^[a-z0-9_-]{1,60}$/).optional() }));
    const cats = await svc.catalogs();
    const list = cats[type] as AnyCatalogItem[];
    const id = (body.id as string | undefined) ?? (type === 'statuses' || type === 'subtypes' ? slugify(String(body.code)) : svc.newId());
    if (list.some((x) => x.id === id)) throw new ApiError(409, 'conflict', 'Ya existe un elemento con ese id.');
    const item = { ...body, id } as AnyCatalogItem & { subcategories?: { id?: string }[] };
    if (item.subcategories) item.subcategories = item.subcategories.map((s) => ({ ...s, id: s.id ?? svc.newId() }));
    await svc.repo.putCatalogItem(type, item);
    svc.invalidateCatalogs();
    await svc.audit(c.get('user'), 'create', `catalog:${type}`, id, `Alta en ${type}: ${item.name}`);
    return c.json(item, 201);
  });

  r.patch('/catalogs/:type/:id', async (c) => {
    const svc = c.get('svc');
    const type = catalogType(c.req.param('type'));
    if (!canWriteCatalog(c, type)) throw forbidden();
    const patch = await readBody(c, CATALOG_SCHEMAS[type].partial());
    const cats = await svc.catalogs();
    const current = (cats[type] as AnyCatalogItem[]).find((x) => x.id === c.req.param('id'));
    if (!current) throw notFound('El elemento');
    const defined = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
    const item = { ...current, ...defined, id: current.id } as AnyCatalogItem & { subcategories?: { id?: string }[] };
    if (item.subcategories) item.subcategories = item.subcategories.map((s) => ({ ...s, id: s.id ?? svc.newId() }));
    await svc.repo.putCatalogItem(type, item);
    svc.invalidateCatalogs();
    await svc.audit(c.get('user'), 'update', `catalog:${type}`, current.id, `Cambio en ${type}: ${Object.keys(defined).join(', ')}`);
    return c.json(item);
  });

  // ───────────── Contactos ─────────────
  const canReadContacts = (c: Parameters<typeof has>[0]) => has(c, 'contacts:read') || has(c, 'contacts:own_clients');
  /** Modevet solo ve sus clientes (contactos `cliente_modevet`). */
  const visible = (c: Parameters<typeof has>[0], ct: Contact) => has(c, 'contacts:read') || ct.kind.includes('cliente_modevet');

  r.get('/contacts', async (c) => {
    if (!canReadContacts(c)) throw forbidden();
    const q = readQuery(c, z.object({ q: z.string().optional(), kind: z.string().optional(), page: qInt, pageSize: qInt }));
    const all = await c.get('svc').repo.listContacts();
    const nif = normalizeNif(q.q);
    const list = all
      .filter((ct) => visible(c, ct))
      .filter((ct) => !q.kind || ct.kind.includes(q.kind as never))
      .filter((ct) => !q.q || includesFolded(contactFullName(ct), q.q) || (!!nif && !!ct.nif?.includes(nif)) || (!!ct.phone && ct.phone.includes(q.q)))
      .sort((a, b) => contactFullName(a).localeCompare(contactFullName(b), 'es'));
    return c.json(paginate(list, q.page, q.pageSize));
  });

  r.get('/contacts/:id', async (c) => {
    if (!canReadContacts(c)) throw forbidden();
    const svc = c.get('svc');
    const id = intParam(c, 'id');
    const contact = await svc.repo.getContact(id);
    if (!contact || !visible(c, contact)) throw notFound('El contacto');
    const animals = (await svc.animals()).filter((a) => a.contactIds.includes(id)).map((a) => ({ id: a.id, name: a.name, statusId: a.statusId }));
    return c.json({ contact, animals });
  });

  r.patch('/contacts/:id', async (c) => {
    need(c, 'contacts:write');
    const svc = c.get('svc');
    const id = intParam(c, 'id');
    const patch = await readBody(c, contactData.partial());
    const before = await svc.repo.getContact(id);
    if (!before) throw notFound('El contacto');
    const merged = { ...before, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) };
    if (patch.cityName && !patch.cityId) merged.cityId = (await svc.resolveCity(c.get('user'), patch.cityName)).id;
    const normalized = normalizeContactData(merged);
    const next: Contact = { ...normalized, id, kind: before.kind, createdAt: before.createdAt };
    await svc.repo.saveContact(next, before);
    await svc.audit(c.get('user'), 'update', 'contact', id, `Contacto editado (${Object.keys(patch).join(', ')})`);
    return c.json(next);
  });

  r.delete('/contacts/:id', async (c) => {
    needAny(c, 'contacts:write');
    const svc = c.get('svc');
    const id = intParam(c, 'id');
    const contact = await svc.repo.getContact(id);
    if (!contact) throw notFound('El contacto');
    if ((await svc.animals()).some((a) => a.contactIds.includes(id)))
      throw new ApiError(409, 'contact_in_use', 'El contacto aparece en el historial de algún animal.');
    await svc.repo.deleteContact(contact);
    await svc.audit(c.get('user'), 'delete', 'contact', id, `Contacto ${id} borrado`);
    return c.body(null, 204);
  });

  return r;
}
