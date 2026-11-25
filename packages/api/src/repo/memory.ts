/** Repositorio en memoria (tests y servidor de desarrollo). Misma semántica que el de DynamoDB. */
import { normalizeNif, targetsAgenda } from '@modepran/domain';
import type {
  AgendaTarget,
  Animal,
  AnimalId,
  AuditEntry,
  Contact,
  ContactId,
  HistoryEvent,
  Incident,
  IsoDate,
  Template,
  TemplateSlug,
} from '@modepran/domain';
import { CATALOG_TYPES, emptyCatalogs, type AnyCatalogItem, type CatalogType, type Catalogs, type StoredAgendaItem } from '../types.js';
import {
  ConflictError,
  type AuditQuery,
  type BulkImportData,
  type BulkImportResult,
  type CounterName,
  type IncidentQuery,
  type Repository,
  type SaveAnimalOptions,
} from './types.js';
import { chipKey, collectDuplicates, maxIds } from './shared.js';

const clone = <T>(v: T): T => structuredClone(v);

export interface MemoryRepository extends Repository {
  /** Acceso directo para tests. */
  readonly state: MemoryState;
}

export interface MemoryState {
  catalogs: Catalogs;
  counters: Record<CounterName, number>;
  animals: Map<AnimalId, Animal>;
  events: Map<number, HistoryEvent>;
  contacts: Map<ContactId, Contact>;
  chipGuards: Map<string, AnimalId>;
  nifGuards: Map<string, ContactId>;
  agenda: Map<string, StoredAgendaItem>;
  incidents: Map<string, Incident>;
  templates: Map<TemplateSlug, Template>;
  audit: AuditEntry[];
}

export function createMemoryRepository(): MemoryRepository {
  const s: MemoryState = {
    catalogs: emptyCatalogs(),
    counters: { animal: 0, event: 0, contact: 0 },
    animals: new Map(),
    events: new Map(),
    contacts: new Map(),
    chipGuards: new Map(),
    nifGuards: new Map(),
    agenda: new Map(),
    incidents: new Map(),
    templates: new Map(),
    audit: [],
  };

  function checkChip(animal: Animal, previous?: Animal) {
    const next = chipKey(animal.chip?.number);
    const prev = chipKey(previous?.chip?.number);
    if (next && next !== prev) {
      const owner = s.chipGuards.get(next);
      if (owner !== undefined && owner !== animal.id) throw new ConflictError('chip_duplicate', 'Ya hay otro animal con ese chip.');
    }
    return { next, prev };
  }

  function checkNif(contact: Contact, previous?: Contact) {
    const next = normalizeNif(contact.nif);
    const prev = normalizeNif(previous?.nif);
    if (next && next !== prev) {
      const owner = s.nifGuards.get(next);
      if (owner !== undefined && owner !== contact.id) throw new ConflictError('nif_duplicate', 'Ya hay otro contacto con ese NIF.');
    }
    return { next, prev };
  }

  const repo: MemoryRepository = {
    state: s,

    async getCatalogs() {
      return clone(s.catalogs);
    },
    async putCatalogItem(type: CatalogType, item: AnyCatalogItem) {
      const list = s.catalogs[type] as AnyCatalogItem[];
      const i = list.findIndex((x) => x.id === item.id);
      if (i >= 0) list[i] = clone(item);
      else list.push(clone(item));
    },

    async nextId(name) {
      s.counters[name] += 1;
      return s.counters[name];
    },

    async listAnimals() {
      return [...s.animals.values()].map(clone);
    },
    async getAnimal(id) {
      const a = s.animals.get(id);
      return a && clone(a);
    },
    async findAnimalByChip(chip) {
      const key = chipKey(chip);
      const id = key ? s.chipGuards.get(key) : undefined;
      const a = id !== undefined ? s.animals.get(id) : undefined;
      return a && clone(a);
    },
    async getAnimalEvents(id) {
      return [...s.events.values()].filter((e) => e.animalId === id).map(clone);
    },
    async listEvents() {
      return [...s.events.values()].map(clone);
    },
    async saveAnimal(animal: Animal, options: SaveAnimalOptions = {}) {
      const { next, prev } = checkChip(animal, options.previous);
      if (!options.previous && s.animals.has(animal.id)) throw new ConflictError('conflict', 'El animal ya existe.');
      if (prev && prev !== next) s.chipGuards.delete(prev);
      if (next) s.chipGuards.set(next, animal.id);
      s.animals.set(animal.id, clone(animal));
      for (const e of options.deleteEvents ?? []) s.events.delete(e.id);
      for (const e of options.putEvents ?? []) s.events.set(e.id, clone(e));
    },
    async deleteAnimal(animal, events) {
      s.animals.delete(animal.id);
      for (const e of events) s.events.delete(e.id);
      const key = chipKey(animal.chip?.number);
      if (key && s.chipGuards.get(key) === animal.id) s.chipGuards.delete(key);
    },

    async listContacts() {
      return [...s.contacts.values()].map(clone);
    },
    async getContact(id) {
      const c = s.contacts.get(id);
      return c && clone(c);
    },
    async findContactByNif(nif) {
      const key = normalizeNif(nif);
      const id = key ? s.nifGuards.get(key) : undefined;
      const c = id !== undefined ? s.contacts.get(id) : undefined;
      return c && clone(c);
    },
    async saveContact(contact, previous) {
      const { next, prev } = checkNif(contact, previous);
      if (prev && prev !== next) s.nifGuards.delete(prev);
      if (next) s.nifGuards.set(next, contact.id);
      s.contacts.set(contact.id, clone(contact));
    },
    async deleteContact(contact) {
      s.contacts.delete(contact.id);
      const key = normalizeNif(contact.nif);
      if (key && s.nifGuards.get(key) === contact.id) s.nifGuards.delete(key);
    },

    async listAgenda(agenda: AgendaTarget, from: IsoDate, to: IsoDate) {
      return [...s.agenda.values()]
        .filter((i) => i.date >= from && i.date <= to && (agenda === 'ambas' ? i.agenda === 'ambas' : targetsAgenda(i, agenda)))
        .map(clone);
    },
    async getAgendaItem(id) {
      const i = s.agenda.get(id);
      return i && clone(i);
    },
    async listAgendaByIncident(incidentId) {
      return [...s.agenda.values()].filter((i) => i.incidentId === incidentId).map(clone);
    },
    async saveAgendaItems(items) {
      for (const i of items) s.agenda.set(i.id, clone(i));
    },

    async listIncidents(query: IncidentQuery = {}) {
      return [...s.incidents.values()]
        .filter((i) => (!query.status || i.status === query.status) && (!query.reporterUserId || i.reporterUserId === query.reporterUserId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .map(clone);
    },
    async getIncident(id) {
      const i = s.incidents.get(id);
      return i && clone(i);
    },
    async saveIncident(incident, agendaItems = []) {
      s.incidents.set(incident.id, clone(incident));
      for (const i of agendaItems) s.agenda.set(i.id, clone(i));
    },

    async getTemplate(slug) {
      const t = s.templates.get(slug);
      return t && clone(t);
    },
    async listTemplates() {
      return [...s.templates.values()].map(clone);
    },
    async putTemplate(t) {
      s.templates.set(t.slug, clone(t));
    },
    async deleteTemplate(slug) {
      s.templates.delete(slug);
    },

    async addAudit(entry) {
      s.audit.push(clone(entry));
    },
    async listAudit(q: AuditQuery) {
      return s.audit
        .filter(
          (e) =>
            e.at.slice(0, 10) >= q.from &&
            e.at.slice(0, 10) <= q.to &&
            (!q.userId || e.userId === q.userId) &&
            (!q.entity || e.entity === q.entity) &&
            (!q.action || e.action === q.action),
        )
        .sort((a, b) => b.at.localeCompare(a.at))
        .map(clone);
    },

    async bulkImport(data: BulkImportData): Promise<BulkImportResult> {
      let catalogs = 0;
      for (const type of CATALOG_TYPES) {
        for (const item of (data.catalogs?.[type] ?? []) as AnyCatalogItem[]) {
          await repo.putCatalogItem(type, item);
          catalogs++;
        }
      }
      for (const st of data.staff ?? []) await repo.putCatalogItem('staff', st);
      const animals = data.animals ?? [];
      const contacts = data.contacts ?? [];
      const duplicates = collectDuplicates(animals, contacts);
      const dupChips = new Set(duplicates.filter((d) => d.kind === 'chip').map((d) => d.value));
      const dupNifs = new Set(duplicates.filter((d) => d.kind === 'nif').map((d) => d.value));
      let guards = 0;
      for (const a of animals) {
        s.animals.set(a.id, clone(a));
        const key = chipKey(a.chip?.number);
        if (key && !dupChips.has(key)) {
          s.chipGuards.set(key, a.id);
          guards++;
        }
      }
      for (const e of data.events ?? []) s.events.set(e.id, clone(e));
      for (const c of contacts) {
        s.contacts.set(c.id, clone(c));
        const key = normalizeNif(c.nif);
        if (key && !dupNifs.has(key)) {
          s.nifGuards.set(key, c.id);
          guards++;
        }
      }
      for (const t of data.templates ?? []) s.templates.set(t.slug, clone(t));
      const max = maxIds(data);
      for (const k of Object.keys(max) as CounterName[]) s.counters[k] = Math.max(s.counters[k], max[k]);
      return {
        catalogs,
        animals: animals.length,
        events: data.events?.length ?? 0,
        contacts: contacts.length,
        staff: data.staff?.length ?? 0,
        templates: data.templates?.length ?? 0,
        guards,
        duplicates,
        counters: { ...s.counters },
      };
    },
  };
  return repo;
}
