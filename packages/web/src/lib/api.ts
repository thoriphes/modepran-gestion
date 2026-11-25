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
  TemplateData,
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
  contact?: ContactChoice;
  /** Ciudad por nombre (se crea al vuelo). */
  cityName?: string;
  /** Adjunto ya subido con `eventUploadUrl`. */
  document?: { key: string; originalName: string };
};

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
  /** Eventos en los que aparece, con nombre del animal. */
  events: (HistoryEvent & { animalName?: string })[];
}

export interface DocumentPayload {
  template: Template;
  data: TemplateData;
  /** Textos legales por defecto (claves en minúsculas sin `LANG_`). */
  dict: Record<string, string>;
}

export interface FichasPayload {
  template: Template;
  items: TemplateData[];
  dict: Record<string, string>;
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
  species: string;
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
      create: (body: CreateAnimalBody) => post<{ animal: Animal; event: HistoryEvent }>('/animals', body),
      update: (id: number, body: Partial<AnimalData>) => patch<Animal>(`/animals/${id}`, body),
      remove: (id: number) => del(`/animals/${id}`),
      allowedTypes: (id: number) => get<AllowedTypes>(`/animals/${id}/allowed-types`),
      addEvent: (id: number, body: EventInput) => post<{ animal: Animal; event: HistoryEvent }>(`/animals/${id}/events`, body),
      deleteEvent: (id: number, eventId: number) => del(`/animals/${id}/events/${eventId}`),
      photoUploadUrl: (id: number) => post<{ photo: UploadTarget; thumb: UploadTarget }>(`/animals/${id}/photo-upload-url`, { contentType: 'image/jpeg' }),
      /** Confirma la foto subida (marca `hasPhoto`; publica la copia si es visible en web). */
      photoUploaded: (id: number) => post<Animal>(`/animals/${id}/photo-uploaded`, {}),
      eventUploadUrl: (id: number, fileName: string, contentType: string) =>
        post<UploadTarget>(`/animals/${id}/event-upload-url`, { fileName, contentType }),
      fileUrl: (id: number, key: string) => get<{ url: string }>(`/animals/${id}/files/${encodeURIComponent(key)}-url`),
    },

    contacts: {
      search: (q: string, page = 1, pageSize = 50) => get<Page<Contact>>('/contacts', { q, page, pageSize }),
      get: (id: number) => get<ContactDetail>(`/contacts/${id}`),
      update: (id: number, body: Partial<ContactData>) => patch<Contact>(`/contacts/${id}`, body),
      remove: (id: number) => del(`/contacts/${id}`),
    },

    documents: {
      templates: () => get<Template[]>('/templates'),
      template: (slug: TemplateSlug) => get<Template>(`/templates/${slug}`),
      saveTemplate: (slug: TemplateSlug, body: Pick<Template, 'bodyFilled' | 'bodyBlank' | 'legalTexts'> & { name?: string }) =>
        put<Template>(`/templates/${slug}`, body),
      resetTemplate: (slug: TemplateSlug) => post<Template>(`/templates/${slug}/reset`),
      event: (eventId: number) => get<DocumentPayload>(`/documents/event/${eventId}`),
      fichas: (filters: AnimalFilters) => get<FichasPayload>('/documents/fichas', filters as Query),
      animal: (animalId: number) => get<DocumentPayload>(`/documents/animal/${animalId}`),
    },

    reports: {
      dashboard: () => get<Dashboard>('/reports/dashboard'),
      summary: (q: ReportQuery) => get<ReportSummary>('/reports/summary', q as unknown as Query),
      excelData: (q: ReportQuery) => get<ExcelData>('/reports/excel-data', q as unknown as Query),
    },

    agenda: {
      list: (agenda: AgendaName, from: IsoDate, to: IsoDate) => get<AgendaItem[]>('/agenda', { agenda, from, to }),
      /** Pendientes de días anteriores. */
      overdue: (agenda: AgendaName, before: IsoDate) => get<AgendaItem[]>('/agenda', { agenda, overdueBefore: before }),
      get: (id: string) => get<AgendaItem>(`/agenda/${encodeURIComponent(id)}`),
      create: (body: NewAgendaBody) => post<AgendaItem>('/agenda', body),
      update: (id: string, body: { status?: AgendaStatus; text?: string; actions?: AppointmentAction[]; owner?: NewAgendaBody['owner'] }) =>
        patch<AgendaItem>(`/agenda/${encodeURIComponent(id)}`, body),
      reschedule: (id: string, body: { date: IsoDate; time?: string }) => post<{ original: AgendaItem; created: AgendaItem }>(`/agenda/${encodeURIComponent(id)}/reschedule`, body),
      registerHistory: (id: string, body: { subtypeIds?: string[]; notes?: string }) =>
        post<{ events: HistoryEvent[] }>(`/agenda/${encodeURIComponent(id)}/register-history`, body),
    },

    incidents: {
      list: (q: { status?: IncidentStatus; mine?: boolean; referred?: boolean }) => get<Incident[]>('/incidents', q),
      get: (id: string) => get<{ incident: Incident; agenda: AgendaItem[]; photoUrls: string[] }>(`/incidents/${encodeURIComponent(id)}`),
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
      resolve: (id: string, body: { byStaffId: string; treatment: string; registerHistory?: boolean }) =>
        post<{ incident: Incident }>(`/incidents/${encodeURIComponent(id)}/resolve`, body),
    },

    admin: {
      users: () => get<User[]>('/users'),
      createUser: (body: { email: string; name: string; profiles: Profile[]; staffId?: string }) => post<User>('/users', body),
      updateUser: (id: string, body: Partial<Pick<User, 'name' | 'profiles' | 'active' | 'staffId'>>) => patch<User>(`/users/${encodeURIComponent(id)}`, body),
      audit: (q: AuditQuery) => get<{ items: AuditEntry[]; next?: string }>('/audit', q as Query),
      exportCsv: (what: string) => text(`/export/${what}.csv`),
    },

    public: {
      animals: () => get<PublicAnimal[]>('/public/animals'),
      animal: (id: number) => get<PublicAnimal & { description?: string }>(`/public/animals/${id}`),
    },
  };
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
