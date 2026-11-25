/**
 * Repositorio DynamoDB (tabla única, spec §8).
 *
 * | Entidad    | PK                 | SK                            | GSI1                          | GSI2                       |
 * |------------|--------------------|-------------------------------|-------------------------------|----------------------------|
 * | Animal     | ANIMAL#<id>        | META                          | ANIMALS / <id 8 dígitos>      | CHIP#<num> / ANIMAL        |
 * | Evento     | ANIMAL#<id>        | EVENT#<fecha>#<eventId 10>    | EVENTS / <fecha>#<eventId 10> | —                          |
 * | Contacto   | CONTACT#<id>       | META                          | CONTACTS / <apellidos nombre> | NIF#<nif> / CONTACT        |
 * | Catálogo   | CATALOG#<tipo>     | <id>                          | —                             | —                          |
 * | Agenda     | AGENDA#<agenda>    | <fecha>#<hora|99:99>#<id>     | ITEM#<id> / AGENDA            | INCIDENT#<id> / <id>       |
 * | Incidencia | INCIDENT#<id>      | META                          | INCIDENTS / <estado>#<creado> | REPORTER#<user> / <creado> |
 * | Plantilla  | TEMPLATE#<slug>    | META                          | —                             | —                          |
 * | Auditoría  | AUDIT#<YYYY-MM>    | <at>#<id>                     | —                             | —                          |
 * | Contador   | COUNTER#<nombre>   | META (atributo `value`)       | —                             | —                          |
 * | Guardián   | UNIQUE#CHIP#<num> / UNIQUE#NIF#<nif> | META (atributo `ownerId`)   | —            | —                          |
 *
 * Los atributos de la entidad se guardan tal cual junto a las claves y `entity`; al leer se quitan las claves.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { agendaSortKey, collapseSpaces, foldText, monthsBetween, normalizeNif } from '@modepran/domain';
import type {
  AgendaTarget,
  Animal,
  AuditEntry,
  Contact,
  HistoryEvent,
  Incident,
  Template,
} from '@modepran/domain';
import { CATALOG_TYPES, emptyCatalogs, type AnyCatalogItem, type CatalogType, type Catalogs, type StoredAgendaItem } from '../types.js';
import { chipKey, collectDuplicates, maxIds } from './shared.js';
import {
  ConflictError,
  type BulkImportData,
  type BulkImportResult,
  type CounterName,
  type Repository,
} from './types.js';

type Item = Record<string, unknown>;
/** Lo mínimo del DocumentClient que se usa (para poder simularlo en tests). */
export interface DocClient {
  send(command: unknown): Promise<any>;
}

const KEY_ATTRS = ['PK', 'SK', 'GSI1PK', 'GSI1SK', 'GSI2PK', 'GSI2SK', 'entity'];

const pad = (n: number, w: number) => String(n).padStart(w, '0');

// ───────────────────────── Claves ─────────────────────────

export const keys = {
  animal: (a: Pick<Animal, 'id' | 'chip'>) => {
    const k: Item = { PK: `ANIMAL#${a.id}`, SK: 'META', GSI1PK: 'ANIMALS', GSI1SK: pad(a.id, 8), entity: 'animal' };
    const chip = chipKey(a.chip?.number);
    if (chip) Object.assign(k, { GSI2PK: `CHIP#${chip}`, GSI2SK: 'ANIMAL' });
    return k;
  },
  event: (e: Pick<HistoryEvent, 'id' | 'animalId' | 'date'>) => ({
    PK: `ANIMAL#${e.animalId}`,
    SK: `EVENT#${e.date}#${pad(e.id, 10)}`,
    GSI1PK: 'EVENTS',
    GSI1SK: `${e.date}#${pad(e.id, 10)}`,
    entity: 'event',
  }),
  contact: (c: Contact) => {
    const k: Item = {
      PK: `CONTACT#${c.id}`,
      SK: 'META',
      GSI1PK: 'CONTACTS',
      GSI1SK: `${foldText(collapseSpaces(`${c.surname ?? ''} ${c.name}`))}#${pad(c.id, 8)}`,
      entity: 'contact',
    };
    const nif = normalizeNif(c.nif);
    if (nif) Object.assign(k, { GSI2PK: `NIF#${nif}`, GSI2SK: 'CONTACT' });
    return k;
  },
  catalog: (type: CatalogType, id: string) => ({ PK: `CATALOG#${type}`, SK: id, entity: `catalog:${type}` }),
  agenda: (i: StoredAgendaItem) => {
    const k: Item = { PK: `AGENDA#${i.agenda}`, SK: agendaSortKey(i), GSI1PK: `ITEM#${i.id}`, GSI1SK: 'AGENDA', entity: 'agenda' };
    if (i.incidentId) Object.assign(k, { GSI2PK: `INCIDENT#${i.incidentId}`, GSI2SK: i.id });
    return k;
  },
  incident: (i: Incident) => ({
    PK: `INCIDENT#${i.id}`,
    SK: 'META',
    GSI1PK: 'INCIDENTS',
    GSI1SK: `${i.status}#${i.createdAt}`,
    GSI2PK: `REPORTER#${i.reporterUserId}`,
    GSI2SK: i.createdAt,
    entity: 'incident',
  }),
  template: (slug: string) => ({ PK: `TEMPLATE#${slug}`, SK: 'META', entity: 'template' }),
  audit: (e: AuditEntry) => ({ PK: `AUDIT#${e.at.slice(0, 7)}`, SK: `${e.at}#${e.id}`, entity: 'audit' }),
  counter: (name: CounterName) => ({ PK: `COUNTER#${name}`, SK: 'META' }),
  chipGuard: (chip: string) => ({ PK: `UNIQUE#CHIP#${chip}`, SK: 'META' }),
  nifGuard: (nif: string) => ({ PK: `UNIQUE#NIF#${nif}`, SK: 'META' }),
};

function strip<T>(item: Item): T {
  const out: Item = { ...item };
  for (const k of KEY_ATTRS) delete out[k];
  return out as T;
}

/** Quita `undefined` (el DocumentClient falla con ellos salvo `removeUndefinedValues`). */
function clean<T extends object>(v: T): Item {
  return JSON.parse(JSON.stringify(v)) as Item;
}

const isConditionalFailure = (e: unknown) =>
  !!e && typeof e === 'object' && ((e as { name?: string }).name === 'ConditionalCheckFailedException' ||
    ((e as { name?: string }).name === 'TransactionCanceledException' &&
      ((e as { CancellationReasons?: { Code?: string }[] }).CancellationReasons ?? []).some((r) => r?.Code === 'ConditionalCheckFailed')));

export interface DynamoRepositoryOptions {
  tableName: string;
  client?: DocClient;
  region?: string;
  /** Pausa entre reintentos de BatchWrite (ms). */
  retryDelayMs?: number;
}

export function createDynamoRepository(opts: DynamoRepositoryOptions): Repository {
  const TableName = opts.tableName;
  const doc: DocClient =
    opts.client ??
    DynamoDBDocumentClient.from(new DynamoDBClient(opts.region ? { region: opts.region } : {}), {
      marshallOptions: { removeUndefinedValues: true },
    });
  const retryDelay = opts.retryDelayMs ?? 200;

  async function queryAll(input: Omit<QueryCommandInput, 'TableName'>): Promise<Item[]> {
    const out: Item[] = [];
    let ExclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const res = await doc.send(new QueryCommand({ TableName, ...input, ...(ExclusiveStartKey ? { ExclusiveStartKey } : {}) }));
      out.push(...((res.Items ?? []) as Item[]));
      ExclusiveStartKey = res.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return out;
  }

  const byPk = (pk: string) => queryAll({ KeyConditionExpression: 'PK = :pk', ExpressionAttributeValues: { ':pk': pk } });
  const byIndex = (index: 'GSI1' | 'GSI2', pk: string, skPrefix?: string) =>
    queryAll({
      IndexName: index,
      KeyConditionExpression: `${index}PK = :pk${skPrefix ? ` AND begins_with(${index}SK, :sk)` : ''}`,
      ExpressionAttributeValues: { ':pk': pk, ...(skPrefix ? { ':sk': skPrefix } : {}) },
    });

  async function get<T>(key: Item): Promise<T | undefined> {
    const res = await doc.send(new GetCommand({ TableName, Key: { PK: key.PK, SK: key.SK } }));
    return res.Item ? strip<T>(res.Item as Item) : undefined;
  }

  async function transact(items: Item[]): Promise<void> {
    try {
      for (let i = 0; i < items.length; i += 100) {
        await doc.send(new TransactWriteCommand({ TransactItems: items.slice(i, i + 100) }));
      }
    } catch (e) {
      if (isConditionalFailure(e)) throw new ConflictError('conflict', 'Conflicto de unicidad.');
      throw e;
    }
  }

  const put = (item: Item) => ({ Put: { TableName, Item: item } });
  const del = (key: Item) => ({ Delete: { TableName, Key: { PK: key.PK, SK: key.SK } } });
  const guardPut = (key: Item, ownerId: number) => ({
    Put: {
      TableName,
      Item: { ...key, ownerId },
      ConditionExpression: 'attribute_not_exists(PK) OR ownerId = :o',
      ExpressionAttributeValues: { ':o': ownerId },
    },
  });

  async function batchWrite(requests: Item[]): Promise<void> {
    for (let i = 0; i < requests.length; i += 25) {
      let pending: Item[] = requests.slice(i, i + 25);
      for (let attempt = 0; pending.length; attempt++) {
        if (attempt > 8) throw new Error(`BatchWrite: quedan ${pending.length} elementos sin procesar.`);
        if (attempt > 0) await new Promise((r) => setTimeout(r, retryDelay * 2 ** (attempt - 1)));
        const res = await doc.send(new BatchWriteCommand({ RequestItems: { [TableName]: pending } }));
        pending = (res.UnprocessedItems?.[TableName] ?? []) as Item[];
      }
    }
  }

  async function raiseCounter(name: CounterName, value: number): Promise<number> {
    try {
      const res = await doc.send(
        new UpdateCommand({
          TableName,
          Key: keys.counter(name),
          UpdateExpression: 'SET #v = :v',
          ConditionExpression: 'attribute_not_exists(#v) OR #v < :v',
          ExpressionAttributeNames: { '#v': 'value' },
          ExpressionAttributeValues: { ':v': value },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return Number(res.Attributes?.value ?? value);
    } catch (e) {
      if (!isConditionalFailure(e)) throw e;
      const cur = await doc.send(new GetCommand({ TableName, Key: keys.counter(name) }));
      return Number(cur.Item?.value ?? value);
    }
  }

  const repo: Repository = {
    async getCatalogs() {
      const catalogs = emptyCatalogs();
      const lists = await Promise.all(CATALOG_TYPES.map((t) => byPk(`CATALOG#${t}`)));
      CATALOG_TYPES.forEach((t, i) => {
        (catalogs[t] as AnyCatalogItem[]) = lists[i]!.map((x) => strip<AnyCatalogItem>(x));
      });
      return catalogs as Catalogs;
    },
    async putCatalogItem(type, item) {
      await doc.send(new PutCommand({ TableName, Item: { ...clean(item), ...keys.catalog(type, item.id) } }));
    },

    async nextId(name) {
      const res = await doc.send(
        new UpdateCommand({
          TableName,
          Key: keys.counter(name),
          UpdateExpression: 'ADD #v :one',
          ExpressionAttributeNames: { '#v': 'value' },
          ExpressionAttributeValues: { ':one': 1 },
          ReturnValues: 'UPDATED_NEW',
        }),
      );
      return Number(res.Attributes?.value);
    },

    async listAnimals() {
      return (await byIndex('GSI1', 'ANIMALS')).map((x) => strip<Animal>(x));
    },
    async getAnimal(id) {
      return get<Animal>({ PK: `ANIMAL#${id}`, SK: 'META' });
    },
    async findAnimalByChip(chip) {
      const key = chipKey(chip);
      if (!key) return undefined;
      const items = await byIndex('GSI2', `CHIP#${key}`, 'ANIMAL');
      return items[0] ? strip<Animal>(items[0]) : undefined;
    },
    async getAnimalEvents(id) {
      const items = await queryAll({
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
        ExpressionAttributeValues: { ':pk': `ANIMAL#${id}`, ':sk': 'EVENT#' },
      });
      return items.map((x) => strip<HistoryEvent>(x));
    },
    async listEvents() {
      return (await byIndex('GSI1', 'EVENTS')).map((x) => strip<HistoryEvent>(x));
    },
    async saveAnimal(animal, options = {}) {
      const ops: Item[] = [];
      const animalPut: Item = put({ ...clean(animal), ...keys.animal(animal) });
      if (!options.previous) {
        (animalPut.Put as Item).ConditionExpression = 'attribute_not_exists(PK)';
      }
      ops.push(animalPut);
      const next = chipKey(animal.chip?.number);
      const prev = chipKey(options.previous?.chip?.number);
      if (next && next !== prev) ops.push(guardPut(keys.chipGuard(next), animal.id));
      if (prev && prev !== next) ops.push(del(keys.chipGuard(prev)));
      for (const e of options.deleteEvents ?? []) ops.push(del(keys.event(e)));
      for (const e of options.putEvents ?? []) ops.push(put({ ...clean(e), ...keys.event(e) }));
      try {
        await transact(ops);
      } catch (e) {
        if (e instanceof ConflictError) throw new ConflictError('chip_duplicate', 'Ya hay otro animal con ese chip.');
        throw e;
      }
    },
    async deleteAnimal(animal, events) {
      const reqs: Item[] = [
        { DeleteRequest: { Key: { PK: `ANIMAL#${animal.id}`, SK: 'META' } } },
        ...events.map((e) => ({ DeleteRequest: { Key: { PK: keys.event(e).PK, SK: keys.event(e).SK } } })),
      ];
      const chip = chipKey(animal.chip?.number);
      if (chip) reqs.push({ DeleteRequest: { Key: keys.chipGuard(chip) } });
      await batchWrite(reqs);
    },

    async listContacts() {
      return (await byIndex('GSI1', 'CONTACTS')).map((x) => strip<Contact>(x));
    },
    async getContact(id) {
      return get<Contact>({ PK: `CONTACT#${id}`, SK: 'META' });
    },
    async findContactByNif(nif) {
      const key = normalizeNif(nif);
      if (!key) return undefined;
      const items = await byIndex('GSI2', `NIF#${key}`, 'CONTACT');
      return items[0] ? strip<Contact>(items[0]) : undefined;
    },
    async saveContact(contact, previous) {
      const ops: Item[] = [put({ ...clean(contact), ...keys.contact(contact) })];
      const next = normalizeNif(contact.nif);
      const prev = normalizeNif(previous?.nif);
      if (next && next !== prev) ops.push(guardPut(keys.nifGuard(next), contact.id));
      if (prev && prev !== next) ops.push(del(keys.nifGuard(prev)));
      try {
        await transact(ops);
      } catch (e) {
        if (e instanceof ConflictError) throw new ConflictError('nif_duplicate', 'Ya hay otro contacto con ese NIF.');
        throw e;
      }
    },
    async deleteContact(contact) {
      const ops: Item[] = [del({ PK: `CONTACT#${contact.id}`, SK: 'META' })];
      const nif = normalizeNif(contact.nif);
      if (nif) ops.push(del(keys.nifGuard(nif)));
      await transact(ops);
    },

    async listAgenda(agenda: AgendaTarget, from, to) {
      const range = (pk: string) =>
        queryAll({
          KeyConditionExpression: 'PK = :pk AND SK BETWEEN :a AND :b',
          ExpressionAttributeValues: { ':pk': pk, ':a': `${from}#`, ':b': `${to}#~` },
        });
      const pks = agenda === 'ambas' ? ['AGENDA#ambas'] : [`AGENDA#${agenda}`, 'AGENDA#ambas'];
      const lists = await Promise.all(pks.map(range));
      return lists.flat().map((x) => strip<StoredAgendaItem>(x));
    },
    async getAgendaItem(id) {
      const items = await byIndex('GSI1', `ITEM#${id}`);
      return items[0] ? strip<StoredAgendaItem>(items[0]) : undefined;
    },
    async listAgendaByIncident(incidentId) {
      return (await byIndex('GSI2', `INCIDENT#${incidentId}`)).map((x) => strip<StoredAgendaItem>(x));
    },
    async saveAgendaItems(items) {
      // La fecha/hora de un elemento no cambia (reagendar crea otro), así que la SK es estable.
      await transact(items.map((i) => put({ ...clean(i), ...keys.agenda(i) })));
    },

    async listIncidents(query = {}) {
      let items: Item[];
      if (query.reporterUserId) items = await byIndex('GSI2', `REPORTER#${query.reporterUserId}`);
      else items = await byIndex('GSI1', 'INCIDENTS', query.status ? `${query.status}#` : undefined);
      return items
        .map((x) => strip<Incident>(x))
        .filter((i) => !query.status || i.status === query.status)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
    async getIncident(id) {
      return get<Incident>({ PK: `INCIDENT#${id}`, SK: 'META' });
    },
    async saveIncident(incident, agendaItems = []) {
      await transact([
        put({ ...clean(incident), ...keys.incident(incident) }),
        ...agendaItems.map((i) => put({ ...clean(i), ...keys.agenda(i) })),
      ]);
    },

    async getTemplate(slug) {
      return get<Template>(keys.template(slug));
    },
    async listTemplates() {
      // Pocas plantillas (7): Get en paralelo.
      const slugs = ['llegada', 'adopcion', 'dueno', 'eutanasia', 'acogida', 'veterinario', 'ficha'] as const;
      const list = await Promise.all(slugs.map((s) => get<Template>(keys.template(s))));
      return list.filter((t): t is Template => !!t);
    },
    async putTemplate(t) {
      await doc.send(new PutCommand({ TableName, Item: { ...clean(t), ...keys.template(t.slug) } }));
    },
    async deleteTemplate(slug) {
      await doc.send(new DeleteCommand({ TableName, Key: keys.template(slug) }));
    },

    async addAudit(entry) {
      await doc.send(new PutCommand({ TableName, Item: { ...clean(entry), ...keys.audit(entry) } }));
    },
    async listAudit(q) {
      const months = monthsBetween(q.from, q.to);
      const lists = await Promise.all(
        months.map((m) =>
          queryAll({
            KeyConditionExpression: 'PK = :pk AND SK BETWEEN :a AND :b',
            ExpressionAttributeValues: { ':pk': `AUDIT#${m}`, ':a': q.from, ':b': `${q.to}~` },
          }),
        ),
      );
      return lists
        .flat()
        .map((x) => strip<AuditEntry>(x))
        .filter((e) => (!q.userId || e.userId === q.userId) && (!q.entity || e.entity === q.entity) && (!q.action || e.action === q.action))
        .sort((a, b) => b.at.localeCompare(a.at));
    },

    async bulkImport(data: BulkImportData): Promise<BulkImportResult> {
      const reqs: Item[] = [];
      const p = (item: Item) => reqs.push({ PutRequest: { Item: item } });
      let catalogs = 0;
      for (const type of CATALOG_TYPES) {
        for (const item of (data.catalogs?.[type] ?? []) as AnyCatalogItem[]) {
          p({ ...clean(item), ...keys.catalog(type, item.id) });
          catalogs++;
        }
      }
      for (const s of data.staff ?? []) p({ ...clean(s), ...keys.catalog('staff', s.id) });
      const animals = data.animals ?? [];
      const contacts = data.contacts ?? [];
      const duplicates = collectDuplicates(animals, contacts);
      const dupChips = new Set(duplicates.filter((d) => d.kind === 'chip').map((d) => d.value));
      const dupNifs = new Set(duplicates.filter((d) => d.kind === 'nif').map((d) => d.value));
      let guards = 0;
      for (const a of animals) {
        p({ ...clean(a), ...keys.animal(a) });
        const chip = chipKey(a.chip?.number);
        if (chip && !dupChips.has(chip)) {
          p({ ...keys.chipGuard(chip), ownerId: a.id });
          guards++;
        }
      }
      for (const e of data.events ?? []) p({ ...clean(e), ...keys.event(e) });
      for (const c of contacts) {
        p({ ...clean(c), ...keys.contact(c) });
        const nif = normalizeNif(c.nif);
        if (nif && !dupNifs.has(nif)) {
          p({ ...keys.nifGuard(nif), ownerId: c.id });
          guards++;
        }
      }
      for (const t of data.templates ?? []) p({ ...clean(t), ...keys.template(t.slug) });
      await batchWrite(reqs);

      const max = maxIds(data);
      const counters = {
        animal: await raiseCounter('animal', max.animal),
        event: await raiseCounter('event', max.event),
        contact: await raiseCounter('contact', max.contact),
      };
      return {
        catalogs,
        animals: animals.length,
        events: data.events?.length ?? 0,
        contacts: contacts.length,
        staff: data.staff?.length ?? 0,
        templates: data.templates?.length ?? 0,
        guards,
        duplicates,
        counters,
      };
    },
  };
  return repo;
}
