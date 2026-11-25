/**
 * Cliente tipado de la API (`/api`, spec §9). **Toda** llamada a la API pasa por aquí: si el contrato de
 * `packages/api` cambia, se ajusta solo este fichero.
 *
 * Convenciones: JSON; errores `{error: {code, message, field?}}` → `ApiError`; 401 → `onUnauthorized`.
 */
import type {
  ActionCategory,
  AgendaItem,
  AgendaName,
  AgendaSpecies,
  AgendaStatus,
  Animal,
  AnimalFilters,
  AnimalSort,
  AppointmentAction,
  AppointmentType,
  Area,
  AuditEntry,
  Breed,
  Census,
  CensusExcelData,
  Center,
  City,
  Colony,
  Contact,
  ContactData,
  Dashboard,
  GestionExcelData,
  HistoryEvent,
  Illness,
  Incident,
  IncidentPriority,
  IncidentStatus,
  IsoDate,
  MonthlyCensusReport,
  NewEventInput,
  Page,
  Permission,
  Profile,
  Species,
  Staff,
  Status,
  Subtype,
  Template,
  TemplateSlug,
  User,
  Vaccine,
  Zone,
  BySpeciesSexReport,
  BySubtypeReport,
  EventTypeCode,
  Gender,
  Size,
} from '@modepran/domain';
import { joinUrl } from './config';

// ─────────────────────────── Tipos de respuesta ───────────────────────────

export interface Me {
  id: string;
  email?: string;
  name?: string;
  profiles: Profile[];
  permissions: Permission[];
  staffId?: string;
}

/** Todos los catálogos (`GET /catalogs`). */
export interface Catalogs {
  species: Species[];
  breeds: Breed[];
  cities: City[];
  zones: Zone[];
  centers: Center[];
  statuses: Status[];
  subtypes: Subtype[];
  vaccines: Vaccine[];
  illnesses: Illness[];
  colonies: Colony[];
  areas: Area[];
  staff: Staff[];
  appointmentTypes: AppointmentType[];
  actionCategories: ActionCategory[];
  /** Trabajadores para "recogido por" (usuarios + personal). Si la API no lo da, se usa `staff`. */
  workers?: { id: string; name: string }[];
}
export type CatalogType = keyof Catalogs;
export const CATALOG_TYPES: CatalogType[] = [
  'species',
  'breeds',
  'cities',
  'zones',
  'centers',
  'statuses',
  'subtypes',
  'vaccines',
  'illnesses',
  'colonies',
  'areas',
  'staff',
  'appointmentTypes',
  'actionCategories',
];

export interface AnimalListItem extends Animal {
  thumbUrl?: string;
  /** Solo con `withContacts=true` (listado de acogida/propietarios): contacto del último evento con contacto. */
  lastContact?: Contact & { eventDate?: IsoDate; subtypeId?: string };
}

export interface AnimalDetail {
  animal: Animal;
  events: HistoryEvent[];
  /** Contactos citados en el historial (vacío si no hay permiso `animals:read_contacts`). */
  contacts: Contact[];
  photoUrl?: string;
  thumbUrl?: string;
}

export interface AllowedTypes {
  typeIds: EventTypeCode[];
  subtypes: Subtype[];
}

/** Datos de la ficha del animal (sin derivados ni fechas de auditoría). */
export interface AnimalData {
  name: string;
  speciesId: string;
  breedId?: string;
  /** Raza nueva (se crea al vuelo). */
  breedName?: string;
  color?: string;
  gender: Gender;
  weightKg?: number;
  size?: Size;
  bornAt?: IsoDate;
  centerId?: string;
  sterilized: boolean;
  ppp: boolean;
  visibleWeb: boolean;
  compatibleDogs: boolean;
  compatibleCats: boolean;
  chip?: { number: string; passport?: string; owner?: string; phone?: string; notes?: string } | null;
}

/** Contacto del evento: existente, nuevo o "SIN DATOS". */
export type ContactChoice = { mode: 'existing'; contactId: number } | { mode: 'new'; data: ContactData } | { mode: 'none' } | { mode: 'sin_datos' };

export type EventInput = Omit<NewEventInput, 'contactId' | 'document'> & {
  /** En la web se elige con `ContactChoice`; `toApiEventInput` lo convierte al formato de la API. */
  contact?: ContactChoice;
  /** Ciudad por nombre (se crea al vuelo). */
  cityName?: string;
  /** Adjunto ya subido con `eventUploadUrl`. */
  document?: { key: string; originalName: string };
};

/** Nombre del contacto especial para avisantes desconocidos (regla 6). */
const SIN_DATOS = 'SIN DATOS';

/** `EventInput` de la web → cuerpo de la API (`contact: {contactId?, data?}`). */
export function toApiEventInput(input: EventInput): Record<string, unknown> {
  const { contact, ...rest } = input;
  const out: Record<string, unknown> = { ...rest };
  if (contact?.mode === 'existing') out.contact = { contactId: contact.contactId };
  else if (contact?.mode === 'new') out.contact = { data: contact.data };
  else if (contact?.mode === 'sin_datos') out.contact = { data: { name: SIN_DATOS } };
  return out;
}

export interface CreateAnimalBody {
  animal: AnimalData;
  arrival: EventInput;
}

export interface UploadTarget {
  url: string;
  key: string;
  /** Cabeceras que hay que mandar en el PUT (si la firma las incluye). */
  headers?: Record<string, string>;
}

export interface ContactDetail {
  contact: Contact;
  /** Animales en cuyo historial aparece. */
  animals: { id: number; name: string; statusId?: string }[];
}

/** Documento ya rellenado en el servidor (`renderTemplate` del dominio). */
export interface RenderedDocument {
  slug: TemplateSlug;
  title: string;
  html: string;
  /** Solo fichas masivas. */
  count?: number;
}

export interface TemplateSummary {
  slug: TemplateSlug;
  name: string;
  customized: boolean;
  updatedAt?: string;
}

export interface TemplateFull extends Pick<Template, 'slug' | 'name' | 'bodyFilled' | 'bodyBlank' | 'legalTexts'> {
  defaults: Pick<Template, 'bodyFilled' | 'bodyBlank' | 'legalTexts'>;
  customized: boolean;
  placeholders?: string[];
  blocks?: string[];
  langKeys?: string[];
  updatedAt?: string;
}

export interface ReportQuery {
  from: IsoDate;
  to: IsoDate;
  zoneId?: string;
  cityId?: string;
  centerId?: string;
}

export interface ReportSummary {
  census: MonthlyCensusReport;
  arrivals: BySpeciesSexReport;
  exits: BySpeciesSexReport;
  arrivalsBySubtype: BySubtypeReport;
  exitsBySubtype: BySubtypeReport;
  /** Censo al final del rango (opcional). */
  current?: Census;
}

export interface ExcelData {
  gestion: GestionExcelData;
  census: CensusExcelData;
  gestionTitle?: string;
  censusTitle?: string;
}

export interface NewAgendaBody {
  kind: 'cita' | 'aviso' | 'nota';
  agenda: AgendaName | 'ambas';
  date: IsoDate;
  time?: string;
  text?: string;
  appointmentTypeId?: string;
  requestedById?: string;
  animalId?: number;
  externalAnimal?: { name: string; species: string };
  species?: AgendaSpecies;
  actions?: AppointmentAction[];
  owner?: { name: string; phone?: string; email?: string };
}

export interface NewIncidentBody {
  animalId?: number;
  animalName?: string;
  species: AgendaSpecies;
  areaId: string;
  text: string;
  priority: IncidentPriority;
  reporterStaffId?: string;
}

export interface PublicAnimal {
  id: number;
  name: string;
  /** Nombre de la especie (la API lo manda como `speciesName`). */
  species: string;
  speciesId?: string;
  speciesCode?: string;
  gender: Gender;
  /** Texto ("2 años", "5 meses"). */
  age?: string;
  bornAt?: IsoDate;
  size?: Size;
  sterilized: boolean;
  compatibleDogs: boolean;
  compatibleCats: boolean;
  photoUrl?: string;
  breed?: string;
  color?: string;
}

export interface AuditQuery {
  from?: IsoDate;
  to?: IsoDate;
  userId?: string;
  entity?: string;
  action?: string;
  cursor?: string;
}

// ─────────────────────────── Núcleo ───────────────────────────

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type Query = Record<string, string | number | boolean | undefined | null | readonly (string | number)[]>;

export function buildQuery(q?: Query): string {
  if (!q) return '';
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length) p.set(k, v.join(','));
    } else p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface ApiClientOptions {
  baseUrl: string;
  getHeaders: () => Promise<Record<string, string>>;
  onUnauthorized?: () => void;
  fetchImpl?: typeof fetch;
}

/** Convierte filtros de animales a query (booleanos como `true`/`false`). */
export function animalFiltersQuery(filters: AnimalFilters, page = 1, pageSize = 50, sort?: AnimalSort): Query {
  return {
    ...(filters as Query),
    page,
    pageSize,
    ...(sort ? { sort: sort.field, dir: sort.dir } : {}),
  };
}

export function createApi(opts: ApiClientOptions) {
  const f = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));

  async function request<T>(method: string, path: string, body?: unknown, query?: Query): Promise<T> {
    const headers: Record<string, string> = { accept: 'application/json', ...(await opts.getHeaders()) };
    let payload: BodyInit | undefined;
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      payload = JSON.stringify(body);
    }
    let res: Response;
    try {
      res = await f(joinUrl(opts.baseUrl, path) + buildQuery(query), { method, headers, ...(payload !== undefined ? { body: payload } : {}) });
    } catch {
      throw new ApiError(0, 'network', 'No se pudo conectar con el servidor. Revisa la conexión.');
    }
    if (res.status === 401) opts.onUnauthorized?.();
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let json: unknown;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      json = undefined;
    }
    if (!res.ok) {
      const err = (json as { error?: { code?: string; message?: string; field?: string } } | undefined)?.error;
      throw new ApiError(
        res.status,
        err?.code ?? `http_${res.status}`,
        err?.message ?? defaultMessage(res.status),
        err?.field,
      );
    }
    return json as T;
  }

  async function text(path: string, query?: Query): Promise<string> {
    const res = await f(joinUrl(opts.baseUrl, path) + buildQuery(query), { headers: await opts.getHeaders() });
    if (res.status === 401) opts.onUnauthorized?.();
    if (!res.ok) throw new ApiError(res.status, `http_${res.status}`, defaultMessage(res.status));
    return res.text();
  }

  const get = <T>(p: string, q?: Query) => request<T>('GET', p, undefined, q);
  const post = <T>(p: string, b?: unknown) => request<T>('POST', p, b ?? {});
  const patch = <T>(p: string, b: unknown) => request<T>('PATCH', p, b);
  const put = <T>(p: string, b: unknown) => request<T>('PUT', p, b);
  const del = <T = void>(p: string) => request<T>('DELETE', p);

  /** URLs firmadas GET (5 min) de fotos: caché de 4 min para no pedirlas en cada render. */
  const urlCache = new Map<string, { url: string; until: number }>();
  async function fileUrl(id: number, key: string): Promise<string> {
    const hit = urlCache.get(key);
    if (hit && hit.until > Date.now()) return hit.url;
    const { url } = await get<{ url: string }>(`/animals/${id}/file-url`, { key });
    urlCache.set(key, { url, until: Date.now() + 4 * 60_000 });
    return url;
  }
  const invalidatePhoto = (id: number) => {
    urlCache.delete(`animals/${id}/photo.jpg`);
    urlCache.delete(`animals/${id}/thumb.jpg`);
  };

  /** Lista de agenda (`{items, overdue?}` en la API). */
  const agendaList = (agenda: AgendaName, from: IsoDate, to: IsoDate, overdue = false) =>
    get<{ items: AgendaItem[]; overdue?: AgendaItem[] }>('/agenda', { agenda, from, to, ...(overdue ? { overdue: 1 } : {}) });

  const listIncidents = (q: { status?: IncidentStatus; mine?: boolean }) =>
    get<Incident[]>('/incidents', { status: q.status, mine: q.mine ? 1 : undefined });

  return {
    me: () => get<Me>('/me'),

    catalogs: {
      all: () => get<Catalogs>('/catalogs'),
      create: <T>(type: CatalogType, body: Partial<T>) => post<T>(`/catalogs/${type}`, body),
      update: <T>(type: CatalogType, id: string, body: Partial<T>) => patch<T>(`/catalogs/${type}/${encodeURIComponent(id)}`, body),
    },

    animals: {
      list: (filters: AnimalFilters, page = 1, pageSize = 50, sort?: AnimalSort) =>
        get<Page<AnimalListItem>>('/animals', animalFiltersQuery(filters, page, pageSize, sort)),
      get: (id: number) => get<AnimalDetail>(`/animals/${id}`),
      create: (body: CreateAnimalBody) =>
        post<{ animal: Animal; event: HistoryEvent }>('/animals', { animal: body.animal, arrival: toApiEventInput(body.arrival) }),
      update: (id: number, body: Partial<AnimalData>) => patch<Animal>(`/animals/${id}`, body),
      remove: (id: number) => del(`/animals/${id}`),
      allowedTypes: (id: number) => get<AllowedTypes>(`/animals/${id}/allowed-types`),
      addEvent: (id: number, body: EventInput) => post<{ animal: Animal; event: HistoryEvent }>(`/animals/${id}/events`, toApiEventInput(body)),
      deleteEvent: (id: number, eventId: number) => del<{ animal: Animal }>(`/animals/${id}/events/${eventId}`),
      photoUploadUrl: (id: number) => post<{ photo: UploadTarget; thumb: UploadTarget }>(`/animals/${id}/photo-upload-url`, { contentType: 'image/jpeg' }),
      /** Confirma la foto subida (marca `hasPhoto`; publica la copia si es visible en web). */
      photoUploaded: (id: number) => {
        invalidatePhoto(id);
        return post<Animal>(`/animals/${id}/photo-uploaded`, {});
      },
      eventUploadUrl: (id: number, fileName: string, contentType: string) =>
        post<UploadTarget>(`/animals/${id}/event-upload-url`, { fileName, contentType }),
      fileUrl: async (id: number, key: string) => ({ url: await fileUrl(id, key) }),
      /** Foto (700 px) firmada; la API no la incluye en la ficha. */
      photoUrl: (id: number) => fileUrl(id, `animals/${id}/photo.jpg`),
      /** Miniatura (200 px) firmada; la API no la incluye en el listado. */
      thumbUrl: (id: number) => fileUrl(id, `animals/${id}/thumb.jpg`),
    },

    contacts: {
      search: (q: string, page = 1, pageSize = 50) => get<Page<Contact>>('/contacts', { q, page, pageSize }),
      get: (id: number) => get<ContactDetail>(`/contacts/${id}`),
      update: (id: number, body: Partial<ContactData>) => patch<Contact>(`/contacts/${id}`, body),
      remove: (id: number) => del(`/contacts/${id}`),
    },

    documents: {
      templates: () => get<TemplateSummary[]>('/templates'),
      template: (slug: TemplateSlug) => get<TemplateFull>(`/templates/${slug}`),
      saveTemplate: (slug: TemplateSlug, body: Pick<Template, 'bodyFilled' | 'bodyBlank' | 'legalTexts'> & { name?: string }) =>
        put<{ template: TemplateFull; warnings: string[] }>(`/templates/${slug}`, body),
      resetTemplate: (slug: TemplateSlug) => post<TemplateFull>(`/templates/${slug}/reset`),
      event: (eventId: number, opts: { animalId?: number; blank?: boolean } = {}) =>
        get<RenderedDocument>(`/documents/event/${eventId}`, { animalId: opts.animalId, blank: opts.blank ? 1 : undefined }),
      blank: (slug: TemplateSlug) => get<RenderedDocument>(`/documents/blank/${slug}`),
      ficha: (animalId: number) => get<RenderedDocument>(`/documents/ficha/${animalId}`),
      fichas: (filters: AnimalFilters) => get<RenderedDocument>('/documents/fichas', filters as Query),
    },

    reports: {
      dashboard: () => get<Dashboard>('/reports/dashboard'),
      summary: async (q: ReportQuery): Promise<ReportSummary> => {
        const r = await get<{
          monthlyCensus: MonthlyCensusReport;
          arrivalsBySpeciesSex: BySpeciesSexReport;
          exitsBySpeciesSex: BySpeciesSexReport;
          arrivalsBySubtype: BySubtypeReport;
          exitsBySubtype: BySubtypeReport;
        }>('/reports/summary', q as unknown as Query);
        return {
          census: r.monthlyCensus,
          arrivals: r.arrivalsBySpeciesSex,
          exits: r.exitsBySpeciesSex,
          arrivalsBySubtype: r.arrivalsBySubtype,
          exitsBySubtype: r.exitsBySubtype,
        };
      },
      excelData: (q: ReportQuery) => get<ExcelData>('/reports/excel-data', q as unknown as Query),
    },

    agenda: {
      list: async (agenda: AgendaName, from: IsoDate, to: IsoDate) => (await agendaList(agenda, from, to)).items,
      /** Pendientes de días anteriores a `today`. */
      overdue: async (agenda: AgendaName, today: IsoDate) => (await agendaList(agenda, today, today, true)).overdue ?? [],
      get: (id: string) => get<AgendaItem>(`/agenda/${encodeURIComponent(id)}`),
      create: (body: NewAgendaBody) => post<AgendaItem>('/agenda', body),
      update: (id: string, body: { status?: AgendaStatus; text?: string; actions?: AppointmentAction[]; owner?: NewAgendaBody['owner'] }) =>
        patch<AgendaItem>(`/agenda/${encodeURIComponent(id)}`, body),
      reschedule: (id: string, body: { date: IsoDate; time?: string }) =>
        post<{ original: AgendaItem; created: AgendaItem }>(`/agenda/${encodeURIComponent(id)}/reschedule`, body),
      /** `actionIndexes`: posiciones en `item.actions` (por defecto, todas). */
      registerHistory: (id: string, body: { actionIndexes?: number[] }) =>
        post<{ events: HistoryEvent[]; skipped: { index: number; reason: string }[] }>(`/agenda/${encodeURIComponent(id)}/register-history`, body),
    },

    incidents: {
      list: listIncidents,
      /**
       * Incidencias con derivación a Modevet. La API no tiene filtro propio: se sacan las derivaciones de la
       * agenda de Modevet (60 días atrás + 30 adelante + pendientes atrasadas) y se cruzan con las incidencias.
       */
      referred: async (today: IsoDate) => {
        const shift = (d: IsoDate, n: number) => {
          const [y, m, day] = d.split('-').map(Number) as [number, number, number];
          return new Date(Date.UTC(y, m - 1, day + n)).toISOString().slice(0, 10);
        };
        const [r, all] = await Promise.all([agendaList('modevet', shift(today, -60), shift(today, 30), true), listIncidents({})]);
        const ids = new Set([...r.items, ...(r.overdue ?? [])].filter((i) => i.isReferral && i.incidentId).map((i) => i.incidentId!));
        return all.filter((i) => ids.has(i.id));
      },
      get: async (id: string) => {
        const r = await get<{ incident: Incident; agenda: AgendaItem[]; photoUrls: ({ key: string; url: string } | string)[] }>(
          `/incidents/${encodeURIComponent(id)}`,
        );
        return { ...r, photoUrls: (r.photoUrls ?? []).map((p) => (typeof p === 'string' ? p : p.url)) };
      },
      create: (body: NewIncidentBody) => post<Incident>('/incidents', body),
      photoUploadUrl: (id: string, contentType: string, bytes: number) =>
        post<UploadTarget>(`/incidents/${encodeURIComponent(id)}/photo-upload-url`, { contentType, bytes }),
      photoUploaded: (id: string, key: string, mime: string, bytes: number) =>
        post<Incident>(`/incidents/${encodeURIComponent(id)}/photos`, { key, mime, bytes }),
      start: (id: string) => post<Incident>(`/incidents/${encodeURIComponent(id)}/start`),
      appointment: (id: string, body: { agenda: AgendaName; date: IsoDate; time: string; appointmentTypeId: string; notes?: string }) =>
        post<{ incident: Incident; appointment: AgendaItem }>(`/incidents/${encodeURIComponent(id)}/appointment`, body),
      referral: (id: string, body: { date: IsoDate; time?: string; appointmentTypeId: string; notes?: string }) =>
        post<{ incident: Incident; referral: AgendaItem }>(`/incidents/${encodeURIComponent(id)}/referral`, body),
      resolve: (id: string, body: { byStaffId: string; treatment: string; registerHistory?: boolean; subtypeId?: string }) =>
        post<{ incident: Incident; updatedItems?: AgendaItem[]; event?: HistoryEvent }>(`/incidents/${encodeURIComponent(id)}/resolve`, body),
    },

    admin: {
      users: () => get<User[]>('/users'),
      createUser: (body: { email: string; name: string; profiles: Profile[]; staffId?: string }) => post<User>('/users', body),
      updateUser: (id: string, body: Partial<Pick<User, 'name' | 'profiles' | 'active' | 'staffId'>>) =>
        patch<User>(`/users/${encodeURIComponent(id)}`, body),
      /** La API devuelve un array (máx. 1000, recientes primero); se envuelve por si algún día pagina. */
      audit: async (q: AuditQuery): Promise<{ items: AuditEntry[]; next?: string }> => {
        const r = await get<AuditEntry[] | { items: AuditEntry[]; next?: string }>('/audit', q as Query);
        return Array.isArray(r) ? { items: r } : r;
      },
      exportCsv: (what: string) => text(`/export/${what}.csv`),
    },

    public: {
      animals: async () => (await get<RawPublicAnimal[]>('/public/animals')).map(fromRawPublic),
      animal: async (id: number) => fromRawPublic(await get<RawPublicAnimal>(`/public/animals/${id}`)),
    },
  };
}

type RawPublicAnimal = Omit<PublicAnimal, 'species'> & { species?: string; speciesName?: string; description?: string };
function fromRawPublic(r: RawPublicAnimal): PublicAnimal & { description?: string } {
  const { speciesName, ...rest } = r;
  return { ...rest, species: r.species ?? speciesName ?? '' };
}

export type Api = ReturnType<typeof createApi>;

function defaultMessage(status: number): string {
  if (status === 401) return 'La sesión ha caducado. Vuelve a entrar.';
  if (status === 403) return 'No tienes permiso para hacer esto.';
  if (status === 404) return 'No encontrado.';
  if (status === 409) return 'Conflicto: otra persona ha cambiado esto o el valor ya existe.';
  if (status >= 500) return 'Error del servidor. Inténtalo de nuevo en un momento.';
  return `Error ${status}`;
}

/** Sube un fichero a una URL firmada (PUT directo a S3). */
export async function uploadToSignedUrl(target: UploadTarget, blob: Blob, contentType: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const res = await fetchImpl(target.url, { method: 'PUT', body: blob, headers: { 'content-type': contentType, ...(target.headers ?? {}) } });
  if (!res.ok) throw new ApiError(res.status, 'upload_failed', 'No se pudo subir el fichero.');
}

/** Mensaje legible de cualquier error. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return String(e);
}
