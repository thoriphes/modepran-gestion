/**
 * Plantillas y documentos imprimibles.
 *
 * Formato (decisión): la API devuelve **HTML ya renderizado** con `renderTemplate` del dominio
 * (`{ slug, title, html }`); la web solo lo muestra en un iframe y llama a `print()`.
 * La ficha usa además `[BLOQUE_HISTORIAL]`, que se sustituye después de renderizar (así lo que escribe la
 * gente en las notas nunca se interpreta como placeholder).
 */
import { Hono, type Context } from 'hono';
import { z } from 'zod';
import {
  BLOCKS,
  can,
  catalogIndex,
  EVENT_TYPE_NAMES,
  escapeHtml,
  formatDMY,
  interpolate,
  LANG_KEYS,
  PLACEHOLDERS,
  renderTemplate,
  sortEvents,
  unknownPlaceholders,
  type Animal,
  type Contact,
  type HistoryEvent,
  type LangDictionary,
  type Template,
  type TemplateData,
  type TemplateSlug,
} from '@modepran/domain';
import { fileKeys } from '../files.js';
import { ApiError, forbidden, has, intParam, need, needAny, notFound, readBody, readQuery } from '../http.js';
import { animalFiltersQuery } from '../schemas.js';
import type { AppEnv, Services } from '../services.js';
import { DEFAULT_LEGAL_TEXTS, defaultTemplate, HISTORY_BLOCK, isTemplateSlug, TEMPLATE_NAMES } from '../templates/index.js';
import type { Catalogs } from '../types.js';
import { filteredAnimals } from './animals.js';

export const MAX_FICHAS = 300;

async function effectiveTemplate(svc: Services, slug: TemplateSlug): Promise<{ template: Template; customized: boolean }> {
  const stored = await svc.repo.getTemplate(slug);
  return stored ? { template: stored, customized: true } : { template: defaultTemplate(slug), customized: false };
}

function dictionary(t: Template): LangDictionary {
  return { ...DEFAULT_LEGAL_TEXTS, ...t.legalTexts };
}

/** Plantilla de un evento según su subtipo (null si no genera documento). */
export function slugForEvent(typeId: string, subtypeCode: string): TemplateSlug | null {
  if (typeId === 'llegada') return 'llegada';
  if (typeId === 'veterinario') return 'veterinario';
  if (['adopcion', 'dueno', 'eutanasia'].includes(subtypeCode)) return subtypeCode as TemplateSlug;
  if (['acogida', 'acogida_solidaria', 'devolucion_desde_acogida'].includes(subtypeCode)) return 'acogida';
  return null;
}

async function templateData(
  svc: Services,
  cats: Catalogs,
  animal: Animal,
  event?: HistoryEvent,
  contact?: Contact,
): Promise<TemplateData> {
  const idx = catalogIndex(cats);
  const name = <T extends { id: string; name: string }>(list: T[], id?: string) => (id ? list.find((x) => x.id === id)?.name : undefined);
  const data: TemplateData = {
    today: svc.today(),
    logoUrl: svc.logoUrl,
    animal: {
      id: animal.id,
      name: animal.name,
      gender: animal.gender,
      sterilized: animal.sterilized,
      ppp: animal.ppp,
      compatibleDogs: animal.compatibleDogs,
      compatibleCats: animal.compatibleCats,
    },
  };
  const a = data.animal;
  const opt = <K extends keyof typeof a>(k: K, v: (typeof a)[K] | undefined) => {
    if (v !== undefined) a[k] = v;
  };
  opt('speciesName', name(cats.species, animal.speciesId));
  opt('breedName', name(cats.breeds, animal.breedId));
  opt('color', animal.color);
  opt('weightKg', animal.weightKg);
  opt('size', animal.size);
  opt('statusName', idx.status(animal.statusId)?.name);
  opt('centerName', name(cats.centers, animal.centerId));
  opt('bornAt', animal.bornAt);
  if (animal.chip) a.chip = { number: animal.chip.number, ...(animal.chip.notes ? { notes: animal.chip.notes } : {}) };
  if (animal.hasPhoto) data.photoUrl = await svc.files.downloadUrl(fileKeys.animalPhoto(animal.id));
  if (event) {
    const ev: NonNullable<TemplateData['event']> = { id: event.id, date: event.date, typeName: EVENT_TYPE_NAMES[event.typeId] };
    const sub = idx.subtype(event.subtypeId)?.name;
    if (sub) ev.subtypeName = sub;
    if (event.notes) ev.notes = event.notes;
    if (event.cityName) ev.cityName = event.cityName;
    const worker = await svc.workerName(event.userId);
    if (worker) ev.workerName = worker;
    data.event = ev;
  }
  if (contact) {
    data.contact = Object.fromEntries(
      Object.entries({
        name: contact.name,
        surname: contact.surname,
        nif: contact.nif,
        phone: contact.phone,
        email: contact.email,
        address: contact.address,
        province: contact.province,
        zip: contact.zip,
        cityName: contact.cityName ?? name(cats.cities, contact.cityId),
      }).filter(([, v]) => v !== undefined),
    );
  }
  return data;
}

/** Tabla HTML del historial para la ficha (sin datos de contactos). */
function historyTable(events: readonly HistoryEvent[], cats: Catalogs, workers: Map<string, string>): string {
  const idx = catalogIndex(cats);
  const rows = sortEvents(events)
    .map((e) => {
      const cells = [
        formatDMY(e.date),
        EVENT_TYPE_NAMES[e.typeId],
        idx.subtype(e.subtypeId)?.name ?? '',
        (e.userId && workers.get(e.userId)) ?? '',
        e.notes ?? '',
      ];
      return `<tr>${cells.map((x) => `<td>${escapeHtml(x)}</td>`).join('')}</tr>`;
    })
    .join('');
  return (
    '<table class="historial"><thead><tr><th>Fecha</th><th>Tipo</th><th>Subtipo</th><th>Trabajador</th><th>Notas</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>`
  );
}

async function workerNames(svc: Services, events: readonly HistoryEvent[]): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  for (const id of new Set(events.flatMap((e) => (e.userId ? [e.userId] : [])))) {
    const n = await svc.workerName(id);
    if (n) m.set(id, n);
  }
  return m;
}

/** Diccionario para documentos en blanco: los `:param` se rellenan con líneas para escribir a mano. */
function blankDictionary(dict: LangDictionary): LangDictionary {
  const line = '____________________';
  const params = Object.fromEntries(
    ['fecha_acogida', 'adoptante_name', 'adoptante_nif', 'adoptante_phone', 'adoptante_email', 'adoptante_address', 'animalType'].map((k) => [k, line]),
  );
  return Object.fromEntries(Object.entries(dict).map(([k, v]) => [k, interpolate(v, params)]));
}

function blankData(svc: Services): TemplateData {
  return {
    today: svc.today(),
    logoUrl: svc.logoUrl,
    animal: { id: 0, name: '', gender: 'none', sterilized: false, ppp: false, compatibleDogs: false, compatibleCats: false },
  };
}

function canPrint(c: Context<AppEnv>, slug: TemplateSlug): boolean {
  return has(c, 'documents:generate') || (slug === 'veterinario' && has(c, 'documents:vet'));
}

async function renderFicha(svc: Services, cats: Catalogs, template: Template, animal: Animal): Promise<string> {
  const events = await svc.repo.getAnimalEvents(animal.id);
  const html = renderTemplate(template.bodyFilled, await templateData(svc, cats, animal), dictionary(template));
  return html.replace(HISTORY_BLOCK, historyTable(events, cats, await workerNames(svc, events)));
}

/** Une N documentos HTML completos en uno (estilos una vez, un documento por página). */
function combineDocuments(docs: string[], title: string): string {
  const style = docs[0]?.match(/<style[^>]*>[\s\S]*?<\/style>/i)?.[0] ?? '';
  const bodies = docs.map((d) => d.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? d);
  return (
    `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>${style}` +
    '<style>.ficha-pagina{break-after:page;page-break-after:always}.ficha-pagina:last-child{break-after:auto;page-break-after:auto}</style></head><body>' +
    bodies.map((b) => `<section class="ficha-pagina">${b}</section>`).join('') +
    '</body></html>'
  );
}

export function documentRoutes() {
  const r = new Hono<AppEnv>();

  // ───────────── Plantillas ─────────────
  r.get('/templates', async (c) => {
    needAny(c, 'documents:generate', 'templates:write');
    const stored = new Map((await c.get('svc').repo.listTemplates()).map((t) => [t.slug, t]));
    return c.json(
      (Object.keys(TEMPLATE_NAMES) as TemplateSlug[]).map((slug) => {
        const t = stored.get(slug);
        return { slug, name: t?.name ?? TEMPLATE_NAMES[slug], customized: !!t, ...(t ? { updatedAt: t.updatedAt } : {}) };
      }),
    );
  });

  const slugParam = (c: Context) => {
    const slug = c.req.param('slug') ?? '';
    if (!isTemplateSlug(slug)) throw notFound('La plantilla');
    return slug;
  };

  const templateView = (t: Template, customized: boolean) => {
    const def = defaultTemplate(t.slug);
    return {
      slug: t.slug,
      name: t.name,
      bodyFilled: t.bodyFilled,
      bodyBlank: t.bodyBlank,
      legalTexts: dictionary(t),
      defaults: { bodyFilled: def.bodyFilled, bodyBlank: def.bodyBlank, legalTexts: DEFAULT_LEGAL_TEXTS },
      customized,
      updatedAt: t.updatedAt,
      placeholders: PLACEHOLDERS,
      blocks: [...BLOCKS, ...(t.slug === 'ficha' ? ['BLOQUE_HISTORIAL'] : [])],
      langKeys: [...new Set([...LANG_KEYS, ...Object.keys(DEFAULT_LEGAL_TEXTS)])],
    };
  };

  r.get('/templates/:slug', async (c) => {
    need(c, 'templates:write');
    const { template, customized } = await effectiveTemplate(c.get('svc'), slugParam(c));
    return c.json(templateView(template, customized));
  });

  r.put('/templates/:slug', async (c) => {
    need(c, 'templates:write');
    const svc = c.get('svc');
    const slug = slugParam(c);
    const body = await readBody(
      c,
      z.object({
        name: z.string().trim().min(1).max(100).optional(),
        bodyFilled: z.string().min(1).max(500_000),
        bodyBlank: z.string().min(1).max(500_000),
        legalTexts: z.record(z.string().regex(/^[a-z0-9_]+$/), z.string().max(100_000)).optional(),
      }),
    );
    // Solo se guardan los textos que difieren de los por defecto.
    const legalTexts = Object.fromEntries(Object.entries(body.legalTexts ?? {}).filter(([k, v]) => DEFAULT_LEGAL_TEXTS[k] !== v));
    const template: Template = {
      slug,
      name: body.name ?? TEMPLATE_NAMES[slug],
      bodyFilled: body.bodyFilled,
      bodyBlank: body.bodyBlank,
      legalTexts,
      updatedAt: svc.now(),
      updatedBy: c.get('user').id,
    };
    const warnings = [...new Set([...unknownPlaceholders(body.bodyFilled), ...unknownPlaceholders(body.bodyBlank)])]
      .filter((t) => !(slug === 'ficha' && t === 'BLOQUE_HISTORIAL'))
      .map((t) => `Placeholder desconocido: [${t}]`);
    await svc.repo.putTemplate(template);
    await svc.audit(c.get('user'), 'update', 'template', slug, `Plantilla ${slug} editada`);
    return c.json({ template: templateView(template, true), warnings });
  });

  r.post('/templates/:slug/reset', async (c) => {
    need(c, 'templates:write');
    const svc = c.get('svc');
    const slug = slugParam(c);
    await svc.repo.deleteTemplate(slug);
    await svc.audit(c.get('user'), 'update', 'template', slug, `Plantilla ${slug} restablecida`);
    return c.json(templateView(defaultTemplate(slug), false));
  });

  // ───────────── Documentos ─────────────
  r.get('/documents/event/:eventId', async (c) => {
    const svc = c.get('svc');
    const eventId = intParam(c, 'eventId');
    // `animalId` es el nombre documentado; `animal` se acepta como alias.
    const q = readQuery(
      c,
      z.object({
        animalId: z.coerce.number().int().positive().optional(),
        animal: z.coerce.number().int().positive().optional(),
        blank: z.enum(['1', 'true', '0', 'false']).optional(),
      }),
    );
    const animalId = q.animalId ?? q.animal;
    const user = c.get('user');
    if (!can(user.profiles, 'documents:generate') && !can(user.profiles, 'documents:vet')) throw forbidden();
    const event = animalId
      ? (await svc.repo.getAnimalEvents(animalId)).find((e) => e.id === eventId)
      : (await svc.allEvents()).find((e) => e.id === eventId);
    if (!event) throw notFound('El evento');
    const cats = await svc.catalogs();
    const subtype = catalogIndex(cats).subtype(event.subtypeId);
    const slug = slugForEvent(event.typeId, subtype?.code ?? '');
    if (!slug || (event.typeId !== 'veterinario' && !subtype?.docGenerate)) throw new ApiError(422, 'no_document', 'Este evento no genera documento.');
    if (!canPrint(c, slug)) throw forbidden();
    const animal = await svc.repo.getAnimal(event.animalId);
    if (!animal) throw notFound('El animal');
    // Los datos del contacto solo para quien puede verlos (Modevet imprime veterinarios sin contactos).
    const contact = event.contactId !== undefined && has(c, 'animals:read_contacts') ? await svc.repo.getContact(event.contactId) : undefined;
    const { template } = await effectiveTemplate(svc, slug);
    const blank = q.blank === '1' || q.blank === 'true';
    const dict = dictionary(template);
    const html = blank
      ? renderTemplate(template.bodyBlank, blankData(svc), blankDictionary(dict))
      : renderTemplate(template.bodyFilled, await templateData(svc, cats, animal, event, contact), dict);
    await svc.audit(user, 'export', 'document', eventId, `Documento ${slug} del evento ${eventId}`);
    return c.json({ slug, title: `${TEMPLATE_NAMES[slug]} ${animal.name} (${formatDMY(event.date)})`, html });
  });

  r.get('/documents/blank/:slug', async (c) => {
    const svc = c.get('svc');
    const slug = slugParam(c);
    if (!canPrint(c, slug)) throw forbidden();
    const { template } = await effectiveTemplate(svc, slug);
    const html = renderTemplate(template.bodyBlank, blankData(svc), blankDictionary(dictionary(template)));
    return c.json({ slug, title: `${TEMPLATE_NAMES[slug]} (en blanco)`, html });
  });

  r.get('/documents/ficha/:animalId', async (c) => {
    need(c, 'documents:generate');
    const svc = c.get('svc');
    const id = intParam(c, 'animalId');
    const animal = await svc.repo.getAnimal(id);
    if (!animal) throw notFound('El animal');
    const { template } = await effectiveTemplate(svc, 'ficha');
    const html = await renderFicha(svc, await svc.catalogs(), template, animal);
    await svc.audit(c.get('user'), 'export', 'document', id, `Ficha del animal ${id}`);
    return c.json({ slug: 'ficha', title: `Ficha ${animal.name}`, html });
  });

  r.get('/documents/fichas', async (c) => {
    need(c, 'documents:generate');
    const svc = c.get('svc');
    const q = readQuery(c, animalFiltersQuery);
    const page = await filteredAnimals(c, { ...q, page: 1 }, 100_000);
    if (page.total > MAX_FICHAS)
      throw new ApiError(422, 'too_many', `Hay ${page.total} fichas; filtra hasta un máximo de ${MAX_FICHAS}.`);
    const cats = await svc.catalogs();
    const { template } = await effectiveTemplate(svc, 'ficha');
    const docs: string[] = [];
    for (const a of page.items) docs.push(await renderFicha(svc, cats, template, a));
    const title = `Fichas (${page.total})`;
    await svc.audit(c.get('user'), 'export', 'document', 'fichas', `Impresión de ${page.total} fichas`);
    return c.json({ slug: 'ficha', title, count: page.total, html: combineDocuments(docs, title) });
  });

  return r;
}
