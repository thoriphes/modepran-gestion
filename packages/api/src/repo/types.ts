/**
 * Capa de repositorio: interfaz común a DynamoDB (producción, `dynamo.ts`) y memoria (tests/dev, `memory.ts`).
 * Diseño de tabla: docs/spec.md §8.
 *
 * - La unicidad de chip y NIF la garantiza el repositorio (items guardianes `UNIQUE#CHIP#<num>` /
 *   `UNIQUE#NIF#<nif>` en transacción). Un duplicado lanza `ConflictError` (→ 409).
 * - Los ids numéricos (animal, evento, contacto) salen de contadores atómicos (`nextId`) que continúan
 *   desde el máximo migrado (`bulkImport` los ajusta).
 * - Sin lógica de negocio: las reglas están en `@modepran/domain`.
 */
import type {
  Animal,
  AnimalId,
  AuditEntry,
  Contact,
  ContactId,
  HistoryEvent,
  Incident,
  IncidentStatus,
  IsoDate,
  Staff,
  Template,
  TemplateSlug,
  UserId,
  AgendaTarget,
} from '@modepran/domain';
import type { AnyCatalogItem, CatalogType, Catalogs, StoredAgendaItem } from '../types.js';

export type CounterName = 'animal' | 'event' | 'contact';

/** Error de unicidad (chip o NIF repetido). La API responde 409. */
export class ConflictError extends Error {
  constructor(
    readonly code: 'chip_duplicate' | 'nif_duplicate' | 'conflict',
    message: string,
  ) {
    super(message);
    this.name = 'ConflictError';
  }
}

export interface SaveAnimalOptions {
  /** Versión anterior (para mover el guardián del chip). Ausente = alta. */
  previous?: Animal;
  /** Eventos a crear o sustituir en la misma transacción. */
  putEvents?: HistoryEvent[];
  /** Eventos a borrar en la misma transacción. */
  deleteEvents?: HistoryEvent[];
}

export interface AuditQuery {
  /** Inclusive, 'YYYY-MM-DD'. */
  from: IsoDate;
  to: IsoDate;
  userId?: UserId;
  entity?: string;
  action?: string;
}

export interface IncidentQuery {
  status?: IncidentStatus;
  reporterUserId?: UserId;
}

/** Datos de la migración (los produce `packages/migrate` como objetos del dominio). */
export interface BulkImportData {
  catalogs?: Partial<Catalogs>;
  animals?: Animal[];
  events?: HistoryEvent[];
  contacts?: Contact[];
  /** Personal (también se puede pasar dentro de `catalogs.staff`). */
  staff?: Staff[];
  templates?: Template[];
}

export interface BulkImportResult {
  catalogs: number;
  animals: number;
  events: number;
  contacts: number;
  staff: number;
  templates: number;
  /** Items guardianes de unicidad escritos (chip + NIF). */
  guards: number;
  /** Chips o NIF repetidos en los datos: se importan sin guardián y se listan aquí. */
  duplicates: { kind: 'chip' | 'nif'; value: string; ids: number[] }[];
  counters: Record<CounterName, number>;
}

export interface Repository {
  // Catálogos (incluye personal: `staff`)
  getCatalogs(): Promise<Catalogs>;
  putCatalogItem(type: CatalogType, item: AnyCatalogItem): Promise<void>;

  // Contadores
  nextId(name: CounterName): Promise<number>;

  // Animales y eventos
  listAnimals(): Promise<Animal[]>;
  getAnimal(id: AnimalId): Promise<Animal | undefined>;
  findAnimalByChip(chip: string): Promise<Animal | undefined>;
  getAnimalEvents(id: AnimalId): Promise<HistoryEvent[]>;
  /** Todos los eventos (informes, censo). */
  listEvents(): Promise<HistoryEvent[]>;
  /** Guarda la ficha (y eventos) de forma atómica; mueve el guardián del chip si cambia. */
  saveAnimal(animal: Animal, options?: SaveAnimalOptions): Promise<void>;
  /** Borra ficha, eventos y guardián del chip. */
  deleteAnimal(animal: Animal, events: readonly HistoryEvent[]): Promise<void>;

  // Contactos
  listContacts(): Promise<Contact[]>;
  getContact(id: ContactId): Promise<Contact | undefined>;
  findContactByNif(nif: string): Promise<Contact | undefined>;
  saveContact(contact: Contact, previous?: Contact): Promise<void>;
  deleteContact(contact: Contact): Promise<void>;

  // Agenda
  /** Elementos de `agenda` (y de `ambas`) con fecha en [from, to]. */
  listAgenda(agenda: AgendaTarget, from: IsoDate, to: IsoDate): Promise<StoredAgendaItem[]>;
  getAgendaItem(id: string): Promise<StoredAgendaItem | undefined>;
  listAgendaByIncident(incidentId: string): Promise<StoredAgendaItem[]>;
  /** Guarda varios elementos a la vez (reagendar, cascadas). */
  saveAgendaItems(items: readonly StoredAgendaItem[]): Promise<void>;

  // Incidencias
  listIncidents(query?: IncidentQuery): Promise<Incident[]>;
  getIncident(id: string): Promise<Incident | undefined>;
  /** Guarda la incidencia y, en la misma escritura, los elementos de agenda que cambian. */
  saveIncident(incident: Incident, agendaItems?: readonly StoredAgendaItem[]): Promise<void>;

  // Plantillas (solo las personalizadas; las por defecto viven en el código)
  getTemplate(slug: TemplateSlug): Promise<Template | undefined>;
  listTemplates(): Promise<Template[]>;
  putTemplate(template: Template): Promise<void>;
  deleteTemplate(slug: TemplateSlug): Promise<void>;

  // Auditoría (solo inserción)
  addAudit(entry: AuditEntry): Promise<void>;
  listAudit(query: AuditQuery): Promise<AuditEntry[]>;

  /** Carga masiva de la migración: sin auditoría, por lotes, ajusta contadores al máximo id. Idempotente. */
  bulkImport(data: BulkImportData): Promise<BulkImportResult>;
}
