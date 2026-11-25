/** Repositorio DynamoDB con un DocumentClient simulado: formato de claves, guardianes, contadores y lotes. */
import { describe, expect, it } from 'vitest';
import { BatchWriteCommand, GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { Animal, AuditEntry, Contact, HistoryEvent, Incident } from '@modepran/domain';
import { createDynamoRepository, keys } from '../src/repo/dynamo.js';
import { ConflictError } from '../src/repo/types.js';
import { lambdaAuth, parseGroups, userFromClaims } from '../src/auth.js';
import type { StoredAgendaItem } from '../src/types.js';

function mockClient(respond: (cmd: any) => any = () => ({})) {
  const sent: any[] = [];
  return {
    sent,
    client: {
      async send(cmd: any) {
        sent.push(cmd);
        const r = respond(cmd);
        if (r instanceof Error) throw r;
        return r;
      },
    },
  };
}

const animal = (over: Partial<Animal> = {}): Animal => ({
  id: 42,
  name: 'Toby',
  speciesId: 'perro',
  gender: 'male',
  sterilized: false,
  ppp: false,
  visibleWeb: false,
  compatibleDogs: false,
  compatibleCats: false,
  hasPhoto: false,
  illnessIds: [],
  contactIds: [],
  arrivalDates: [],
  exitDates: [],
  statusChanges: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

const event: HistoryEvent = {
  id: 7,
  animalId: 42,
  typeId: 'llegada',
  subtypeId: 'aviso',
  date: '2026-01-02',
  createdAt: '2026-01-02T00:00:00.000Z',
  createdBy: 'u',
};

describe('claves (spec §8)', () => {
  it('animal, evento, contacto, agenda, incidencia, auditoría', () => {
    expect(keys.animal(animal({ chip: { number: '941 000' } }))).toMatchObject({
      PK: 'ANIMAL#42',
      SK: 'META',
      GSI1PK: 'ANIMALS',
      GSI1SK: '00000042',
      GSI2PK: 'CHIP#941000',
      GSI2SK: 'ANIMAL',
    });
    expect(keys.animal(animal())).not.toHaveProperty('GSI2PK');
    expect(keys.event(event)).toMatchObject({ PK: 'ANIMAL#42', SK: 'EVENT#2026-01-02#0000000007', GSI1PK: 'EVENTS', GSI1SK: '2026-01-02#0000000007' });
    const contact: Contact = { id: 5, name: 'Ana', surname: 'Pérez', nif: '1-a', kind: [], createdAt: 'x' };
    expect(keys.contact(contact)).toMatchObject({ PK: 'CONTACT#5', GSI1PK: 'CONTACTS', GSI1SK: 'perez ana#00000005', GSI2PK: 'NIF#1A', GSI2SK: 'CONTACT' });
    const item = { id: 'ag1', agenda: 'carlet', date: '2026-02-01', incidentId: 'in1' } as StoredAgendaItem;
    expect(keys.agenda(item)).toMatchObject({ PK: 'AGENDA#carlet', SK: '2026-02-01#99:99#ag1', GSI1PK: 'ITEM#ag1', GSI1SK: 'AGENDA', GSI2PK: 'INCIDENT#in1', GSI2SK: 'ag1' });
    const inc = { id: 'in1', status: 'pendiente', createdAt: '2026-02-01T10:00:00Z', reporterUserId: 'u1' } as Incident;
    expect(keys.incident(inc)).toMatchObject({ PK: 'INCIDENT#in1', GSI1PK: 'INCIDENTS', GSI1SK: 'pendiente#2026-02-01T10:00:00Z', GSI2PK: 'REPORTER#u1' });
    expect(keys.audit({ id: 'a1', at: '2026-02-01T10:00:00.000Z' } as AuditEntry)).toMatchObject({ PK: 'AUDIT#2026-02', SK: '2026-02-01T10:00:00.000Z#a1' });
  });
});

describe('repositorio DynamoDB (cliente simulado)', () => {
  it('alta de animal: transacción con ficha, guardián del chip condicional y evento', async () => {
    const m = mockClient();
    const repo = createDynamoRepository({ tableName: 't', client: m.client });
    await repo.saveAnimal(animal({ chip: { number: '941' } }), { putEvents: [event] });
    const cmd = m.sent[0];
    expect(cmd).toBeInstanceOf(TransactWriteCommand);
    const items = cmd.input.TransactItems;
    expect(items[0].Put.Item).toMatchObject({ PK: 'ANIMAL#42', SK: 'META', name: 'Toby' });
    expect(items[0].Put.ConditionExpression).toBe('attribute_not_exists(PK)');
    expect(items[1].Put.Item).toMatchObject({ PK: 'UNIQUE#CHIP#941', SK: 'META', ownerId: 42 });
    expect(items[1].Put.ConditionExpression).toContain('attribute_not_exists(PK)');
    expect(items[2].Put.Item).toMatchObject({ SK: 'EVENT#2026-01-02#0000000007' });
  });

  it('cambio de chip borra el guardián viejo; conflicto → ConflictError chip_duplicate', async () => {
    const m = mockClient(() => Object.assign(new Error('x'), { name: 'TransactionCanceledException', CancellationReasons: [{ Code: 'None' }, { Code: 'ConditionalCheckFailed' }] }));
    const repo = createDynamoRepository({ tableName: 't', client: m.client });
    const err = await repo.saveAnimal(animal({ chip: { number: '2' } }), { previous: animal({ chip: { number: '1' } }) }).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.code).toBe('chip_duplicate');
    const ops = m.sent[0].input.TransactItems;
    expect(ops.some((o: any) => o.Delete?.Key.PK === 'UNIQUE#CHIP#1')).toBe(true);
    expect(ops[0].Put.ConditionExpression).toBeUndefined();
  });

  it('contacto con NIF: guardián UNIQUE#NIF', async () => {
    const m = mockClient();
    const repo = createDynamoRepository({ tableName: 't', client: m.client });
    await repo.saveContact({ id: 5, name: 'Ana', nif: '12345678z', kind: [], createdAt: 'x' });
    expect(m.sent[0].input.TransactItems[1].Put.Item).toMatchObject({ PK: 'UNIQUE#NIF#12345678Z', ownerId: 5 });
  });

  it('nextId: ADD atómico del contador', async () => {
    const m = mockClient(() => ({ Attributes: { value: 7001 } }));
    const repo = createDynamoRepository({ tableName: 't', client: m.client });
    expect(await repo.nextId('animal')).toBe(7001);
    expect(m.sent[0]).toBeInstanceOf(UpdateCommand);
    expect(m.sent[0].input).toMatchObject({ Key: { PK: 'COUNTER#animal', SK: 'META' }, UpdateExpression: 'ADD #v :one' });
  });

  it('listAnimals: GSI1 ANIMALS paginado', async () => {
    let n = 0;
    const m = mockClient((cmd) => {
      if (!(cmd instanceof QueryCommand)) return {};
      n++;
      return n === 1
        ? { Items: [{ ...animal({ id: 1 }), ...keys.animal(animal({ id: 1 })) }], LastEvaluatedKey: { PK: 'x' } }
        : { Items: [{ ...animal({ id: 2 }), ...keys.animal(animal({ id: 2 })) }] };
    });
    const repo = createDynamoRepository({ tableName: 't', client: m.client });
    const list = await repo.listAnimals();
    expect(list.map((a) => a.id)).toEqual([1, 2]);
    expect(list[0]).not.toHaveProperty('PK');
    expect(m.sent[0].input).toMatchObject({ IndexName: 'GSI1', ExpressionAttributeValues: { ':pk': 'ANIMALS' } });
    expect(m.sent[1].input.ExclusiveStartKey).toEqual({ PK: 'x' });
  });

  it('bulkImport: lotes de 25, reintenta UnprocessedItems, sube contadores al máximo, avisa de duplicados', async () => {
    let first = true;
    const m = mockClient((cmd) => {
      if (cmd instanceof BatchWriteCommand) {
        const reqs = (cmd as any).input.RequestItems.t;
        if (first) {
          first = false;
          return { UnprocessedItems: { t: reqs.slice(0, 2) } };
        }
        return {};
      }
      if (cmd instanceof UpdateCommand) return { Attributes: { value: (cmd as any).input.ExpressionAttributeValues[":v"] } };
      return {};
    });
    const repo = createDynamoRepository({ tableName: 't', client: m.client, retryDelayMs: 0 });
    const animals = Array.from({ length: 30 }, (_, i) => animal({ id: i + 1, ...(i < 2 ? { chip: { number: 'DUP' } } : {}) }));
    const events = [{ ...event, id: 900 }];
    const contacts: Contact[] = [{ id: 77, name: 'X', nif: '1A', kind: [], createdAt: 'x' }];
    const res = await repo.bulkImport({ animals, events, contacts, catalogs: { species: [{ id: 'perro', name: 'Perro', active: true }] } });
    const batches: any[] = m.sent.filter((c) => c instanceof BatchWriteCommand);
    // 1 catálogo + 30 animales + 1 evento + 1 contacto + 1 guardián NIF = 34 → 2 lotes + 1 reintento
    expect(batches.map((b) => b.input.RequestItems.t.length)).toEqual([25, 2, 9]);
    expect(res.duplicates).toEqual([{ kind: 'chip', value: 'DUP', ids: [1, 2] }]);
    expect(res.guards).toBe(1);
    expect(res.counters).toEqual({ animal: 30, event: 900, contact: 77 });
    const upd: any[] = m.sent.filter((c) => c instanceof UpdateCommand);
    expect(upd[0].input.ConditionExpression).toBe('attribute_not_exists(#v) OR #v < :v');
    const all = batches.flatMap((b) => b.input.RequestItems.t.map((r: any) => r.PutRequest.Item.PK));
    expect(all).toContain('CATALOG#species');
    expect(all).toContain('UNIQUE#NIF#1A');
    expect(all).not.toContain('UNIQUE#CHIP#DUP');
  });

  it('getAnimal y plantillas usan Get/Put con sus claves', async () => {
    const m = mockClient((cmd) => (cmd instanceof GetCommand ? { Item: { ...animal(), PK: 'ANIMAL#42', SK: 'META' } } : {}));
    const repo = createDynamoRepository({ tableName: 't', client: m.client });
    expect((await repo.getAnimal(42))?.name).toBe('Toby');
    await repo.putTemplate({ slug: 'ficha', name: 'F', bodyFilled: 'a', bodyBlank: 'b', legalTexts: {}, updatedAt: 'x', updatedBy: 'u' });
    const put: any = m.sent.find((c) => c instanceof PutCommand);
    expect(put.input.Item).toMatchObject({ PK: 'TEMPLATE#ficha', SK: 'META' });
  });
});

describe('auth de Lambda', () => {
  it('lee los claims del authorizer JWT, con cognito:groups en formato "[a b]"', () => {
    expect(parseGroups('[admin carlet]')).toEqual(['admin', 'carlet']);
    expect(parseGroups(['modevet'])).toEqual(['modevet']);
    const u = userFromClaims({ sub: 'abc', email: 'x@y.z', 'cognito:groups': '[carlet bienestar desconocido]' });
    expect(u).toEqual({ id: 'abc', email: 'x@y.z', name: 'x@y.z', profiles: ['carlet', 'bienestar'] });
    expect(userFromClaims(undefined)).toBeNull();
    const c = { env: { event: { requestContext: { authorizer: { jwt: { claims: { sub: 's', 'cognito:groups': '[admin]' } } } } } } };
    expect(lambdaAuth(c as never)?.profiles).toEqual(['admin']);
    // Las cabeceras de dev no cuentan en Lambda
    expect(lambdaAuth({ env: { event: { requestContext: {} } }, req: { header: () => 'admin' } } as never)).toBeNull();
  });
});
