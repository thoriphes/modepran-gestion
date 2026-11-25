import { beforeEach, describe, expect, it } from 'vitest';
import {
  allowedEventTypes,
  applyEvent,
  computeDerived,
  createAnimalWithArrival,
  currentCenterFromEvents,
  currentStatusFromEvents,
  DEFAULT_SUBTYPES,
  DomainError,
  firstRegisteredEvent,
  removeEvent,
  sortEvents,
  validateNewEvent,
  type HistoryEvent,
} from '../src/index.js';
import { arrivalInput, baseAnimal, buildAnimal, CATALOGS, ctx, resetIds } from './fixtures.js';

beforeEach(resetIds);

const codesOf = (status: string | null) => allowedEventTypes(status, DEFAULT_SUBTYPES).subtypes.map((s) => s.code);
const typesOf = (status: string | null) => allowedEventTypes(status, DEFAULT_SUBTYPES).typeIds;

describe('máquina de estados (regla 1)', () => {
  it.each(['cadaver', 'eutanasiado', 'fallecido'])('%s → ningún evento', (s) => {
    expect(typesOf(s)).toEqual([]);
    expect(codesOf(s)).toEqual([]);
  });

  it('disponible → todo menos llegada', () => {
    expect(typesOf('disponible').sort()).toEqual(['movimientos', 'salida', 'veterinario']);
    expect(codesOf('disponible')).not.toContain('aviso');
    expect(codesOf('disponible')).toContain('adopcion');
    expect(codesOf('disponible')).toContain('acogida');
  });

  it('translado → solo llegada', () => {
    expect(typesOf('translado')).toEqual(['llegada']);
    expect(allowedEventTypes('translado', DEFAULT_SUBTYPES).subtypes.every((s) => s.typeId === 'llegada')).toBe(true);
  });

  it.each(['acogida', 'acogida_solidaria'])('%s → veterinario y solo "devolución desde acogida" de movimientos', (s) => {
    expect(typesOf(s).sort()).toEqual(['movimientos', 'veterinario']);
    const subs = allowedEventTypes(s, DEFAULT_SUBTYPES).subtypes;
    expect(subs.filter((x) => x.typeId === 'movimientos').map((x) => x.code)).toEqual(['devolucion_desde_acogida']);
    expect(subs.some((x) => x.typeId === 'veterinario')).toBe(true);
    expect(subs.some((x) => x.typeId === 'salida' || x.typeId === 'llegada')).toBe(false);
  });

  it('adoptado → llegada y veterinario', () => {
    expect(typesOf('adoptado').sort()).toEqual(['llegada', 'veterinario']);
    expect(codesOf('adoptado')).toContain('devolucion_desde_adopcion');
  });

  it.each(['devuelto_colonia', 'devolucion_propietario', 'perdido', 'devolucion_responsable_legal', 'estado_nuevo'])(
    '%s → todos los tipos',
    (s) => {
      expect(typesOf(s).sort()).toEqual(['llegada', 'movimientos', 'salida', 'veterinario']);
    },
  );

  it('animal nuevo → solo llegada', () => {
    expect(typesOf(null)).toEqual(['llegada']);
  });

  it('excluye subtipos desactivados', () => {
    const subs = DEFAULT_SUBTYPES.map((s) => (s.code === 'adopcion' ? { ...s, active: false } : s));
    expect(allowedEventTypes('disponible', subs).subtypes.map((s) => s.code)).not.toContain('adopcion');
  });
});

describe('alta (primera llegada)', () => {
  it('crea el animal disponible en el centro de la llegada, fecha = recogida', () => {
    const r = createAnimalWithArrival(baseAnimal(1), arrivalInput(), ctx());
    expect(r.animal.statusId).toBe('disponible');
    expect(r.animal.centerId).toBe('valencia');
    expect(r.event.date).toBe('2026-01-10');
    expect(r.event.collectionDate).toBe('2026-01-10');
    expect(r.event.userId).toBe('u-worker');
    expect(r.event.createdBy).toBe('u-login');
    expect(r.animal.lastArrival).toMatchObject({ date: '2026-01-10', cityId: 'c-alfa', cityName: 'Alfa', subtypeId: 'aviso', userId: 'u-worker' });
    expect(r.animal.contactIds).toEqual([1]);
    expect(r.animal.arrivalDates).toEqual(['2026-01-10']);
  });

  it('el alta tiene que ser una llegada', () => {
    expect(() => createAnimalWithArrival(baseAnimal(1), { subtypeId: 'vacuna', date: '2026-01-01', userId: 'x', vaccineId: 'v', switchValue: true }, ctx())).toThrow(
      DomainError,
    );
  });

  it('aviso de cadáver → estado cadaver', () => {
    const r = createAnimalWithArrival(baseAnimal(1), arrivalInput({ subtypeId: 'aviso_cadaver' }), ctx());
    expect(r.animal.statusId).toBe('cadaver');
  });

  it('valida campos obligatorios de la llegada', () => {
    const errs = validateNewEvent(null, [], { subtypeId: 'aviso' }, CATALOGS);
    const fields = errs.map((e) => e.field);
    expect(fields).toEqual(expect.arrayContaining(['userId', 'contactId', 'centerId', 'collectionDate', 'cityId', 'address', 'zip']));
  });

  it('código postal de 5 a 8 caracteres', () => {
    expect(validateNewEvent(null, [], arrivalInput({ zip: '460' }), CATALOGS).map((e) => e.code)).toContain('invalid_zip');
    expect(validateNewEvent(null, [], arrivalInput({ zip: '46001' }), CATALOGS)).toEqual([]);
  });

  it('gato de colonia exige colonia', () => {
    expect(validateNewEvent(null, [], arrivalInput({ subtypeId: 'gato_colonia' }), CATALOGS).map((e) => e.field)).toContain('colonyId');
  });
});

describe('applyEvent (reglas 2-5)', () => {
  it('veterinario nunca cambia el estado ni el centro', () => {
    const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'acogida', userId: 'w', contactId: 2, date: '2026-02-01' } }]);
    expect(animal.statusId).toBe('acogida');
    const r = applyEvent(animal, events, { subtypeId: 'vacuna', userId: 'w', date: '2026-02-05', vaccineId: 'v1', switchValue: false }, ctx());
    expect(r.animal.statusId).toBe('acogida');
    expect(r.animal.centerId).toBe('valencia');
    expect(r.event.vaccineId).toBe('v1');
    expect(r.event.switchValue).toBe(false);
  });

  it('subtipo con center cambia el centro (ingreso / revisión)', () => {
    const { animal, events } = buildAnimal(1);
    const r = applyEvent(animal, events, { subtypeId: 'ingreso_revision', userId: 'w', centerId: 'carlet', date: '2026-02-02' }, ctx());
    expect(r.animal.centerId).toBe('carlet');
    expect(r.event.centerId).toBe('carlet');
    expect(r.animal.statusId).toBe('disponible');
  });

  it('salida: fecha = fecha indicada si el subtipo tiene date; copia centro actual y ciudad de la última llegada', () => {
    const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'ingreso_revision', userId: 'w', centerId: 'carlet', date: '2026-02-02' } }]);
    const r = applyEvent(animal, events, { subtypeId: 'adopcion', userId: 'w', contactId: 5, date: '2026-03-01', notes: '  hola  ' }, ctx());
    expect(r.animal.statusId).toBe('adoptado');
    expect(r.event.date).toBe('2026-03-01');
    expect(r.event.centerId).toBe('carlet');
    expect(r.event.cityId).toBe('c-alfa');
    expect(r.event.cityName).toBe('Alfa');
    expect(r.event.notes).toBe('hola');
    expect(r.animal.centerId).toBe('carlet');
    expect(r.animal.lastExit).toEqual({ date: '2026-03-01', subtypeId: 'adopcion' });
    expect(r.animal.exitDates).toEqual(['2026-03-01']);
  });

  it('salida sin flag date: fecha = hoy (Europe/Madrid, del contexto)', () => {
    const { animal, events } = buildAnimal(1);
    const r = applyEvent(animal, events, { subtypeId: 'perdido', centerId: 'valencia', date: '2020-01-01' }, ctx({ today: '2026-03-20' }));
    expect(r.event.date).toBe('2026-03-20');
    expect(r.animal.statusId).toBe('perdido');
  });

  it('trabajador por defecto = usuario logueado si el subtipo no pide user (regla 5)', () => {
    const { animal, events } = buildAnimal(1);
    const r = applyEvent(animal, events, { subtypeId: 'perdido', centerId: 'valencia', userId: 'ignorado' }, ctx({ userId: 'u-yo' }));
    expect(r.event.userId).toBe('u-yo');
  });

  it('solo guarda los campos que pide el subtipo', () => {
    const { animal, events } = buildAnimal(1);
    const r = applyEvent(
      animal,
      events,
      { subtypeId: 'desparasitacion', userId: 'w', date: '2026-02-01', contactId: 9, vaccineId: 'v', centerId: 'carlet', notes: 'n' },
      ctx(),
    );
    expect(r.event.contactId).toBeUndefined();
    expect(r.event.vaccineId).toBeUndefined();
    expect(r.event.centerId).toBeUndefined();
    expect(r.event.notes).toBe('n');
  });

  it('documento: obligatorio con docUpload, opcional en veterinario, ignorado en otros', () => {
    const { animal, events } = buildAnimal(1);
    expect(() => applyEvent(animal, events, { subtypeId: 'documento', userId: 'w', date: '2026-02-01' }, ctx())).toThrow(/documento/);
    const doc = { key: 'animals/1/events/1.pdf', originalName: 'x.pdf' };
    expect(applyEvent(animal, events, { subtypeId: 'test', userId: 'w', date: '2026-02-01', document: doc }, ctx()).event.document).toEqual(doc);
    expect(applyEvent(animal, events, { subtypeId: 'acogida', userId: 'w', contactId: 1, date: '2026-02-01', document: doc }, ctx()).event.document).toBeUndefined();
  });

  it('enfermedad: queda en illnessIds para siempre', () => {
    const { animal, events } = buildAnimal(1, [
      { input: { subtypeId: 'enfermedad', userId: 'w', date: '2026-02-01', illnessId: 'ill-1', switchValue: false } },
      { input: { subtypeId: 'enfermedad', userId: 'w', date: '2026-02-03', illnessId: 'ill-2', switchValue: true } },
      { input: { subtypeId: 'enfermedad', userId: 'w', date: '2026-02-04', illnessId: 'ill-1', switchValue: true } },
    ]);
    expect(animal.illnessIds.sort()).toEqual(['ill-1', 'ill-2']);
  });

  it('rechaza un evento no permitido por el estado', () => {
    const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'defuncion', userId: 'w', date: '2026-02-01' } }]);
    expect(animal.statusId).toBe('fallecido');
    expect(() => applyEvent(animal, events, { subtypeId: 'test', userId: 'w', date: '2026-02-02' }, ctx())).toThrow(/no se permite/);
  });

  it('rechaza fecha no válida y switch sin valor', () => {
    const { animal, events } = buildAnimal(1);
    const errs = validateNewEvent(animal, events, { subtypeId: 'vacuna', userId: 'w', date: '2026-02-30', vaccineId: 'v' }, CATALOGS);
    expect(errs.map((e) => e.code)).toEqual(expect.arrayContaining(['invalid_date', 'required']));
    expect(errs.find((e) => e.field === 'switchValue')?.message).toContain('Finalizado');
  });

  it('subtipo inexistente', () => {
    const { animal, events } = buildAnimal(1);
    expect(validateNewEvent(animal, events, { subtypeId: 'nope' }, CATALOGS)[0]?.code).toBe('subtype_not_found');
  });

  describe('reentradas (regla 4)', () => {
    it('devolución desde adopción copia ciudad/dirección/CP de la llegada original y fecha = recogida', () => {
      const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'adopcion', userId: 'w', contactId: 3, date: '2026-02-01' } }]);
      const r = applyEvent(
        animal,
        events,
        { subtypeId: 'devolucion_desde_adopcion', userId: 'w', contactId: 3, centerId: 'carlet', collectionDate: '2026-03-01', cityId: 'c-otra', address: 'Otra 2', zip: '12345' },
        ctx(),
      );
      expect(r.event.date).toBe('2026-03-01');
      expect(r.event.cityId).toBe('c-alfa');
      expect(r.event.address).toBe('Calle Falsa 1');
      expect(r.event.zip).toBe('46000');
      expect(r.animal.statusId).toBe('disponible');
      expect(r.animal.centerId).toBe('carlet');
      expect(r.animal.lastArrival?.date).toBe('2026-03-01');
      expect(r.animal.lastArrival?.cityId).toBe('c-alfa');
      expect(r.animal.arrivalDates).toEqual(['2026-01-10', '2026-03-01']);
    });

    it('devolución no exige ciudad/dirección pero sí fecha de recogida', () => {
      const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'adopcion', userId: 'w', contactId: 3, date: '2026-02-01' } }]);
      const errs = validateNewEvent(animal, events, { subtypeId: 'devolucion_desde_adopcion', userId: 'w', contactId: 3, centerId: 'carlet' }, CATALOGS);
      expect(errs.map((e) => e.field)).toEqual(['collectionDate']);
    });

    it('otra llegada (p. ej. tras translado) guarda la ciudad nueva', () => {
      const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'otras_asociaciones', userId: 'w', contactId: 3, date: '2026-02-01' } }]);
      expect(animal.statusId).toBe('translado');
      const r = applyEvent(animal, events, arrivalInput({ subtypeId: 'devolucion_otras_asociaciones', collectionDate: '2026-03-02', cityId: 'c-beta', cityName: 'Beta' }), ctx());
      expect(r.animal.lastArrival?.cityId).toBe('c-beta');
      expect(r.animal.statusId).toBe('disponible');
    });

    it('devolución desde acogida (movimiento) vuelve a disponible y cambia de centro', () => {
      const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'acogida', userId: 'w', contactId: 3, date: '2026-02-01' } }]);
      const r = applyEvent(animal, events, { subtypeId: 'devolucion_desde_acogida', userId: 'w', contactId: 3, centerId: 'carlet', date: '2026-02-10' }, ctx());
      expect(r.animal.statusId).toBe('disponible');
      expect(r.animal.centerId).toBe('carlet');
      expect(r.event.cityId).toBe('c-alfa');
      // No es una llegada: la última llegada no cambia.
      expect(r.animal.lastArrival?.date).toBe('2026-01-10');
    });
  });

  it('la última llegada es la de fecha más reciente aunque se registre antes otra posterior (regla 8)', () => {
    const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'otras_asociaciones', userId: 'w', contactId: 3, date: '2026-02-01' } }]);
    const late = applyEvent(animal, events, arrivalInput({ subtypeId: 'aviso_chip', collectionDate: '2026-02-20', cityId: 'c-beta' }), ctx());
    expect(late.animal.lastArrival?.cityId).toBe('c-beta');
    // Recalcular con una llegada retroactiva más antigua no cambia la última
    const extra: HistoryEvent = { ...late.event, id: 5000, date: '2025-05-05', cityId: 'c-zeta', createdAt: '2026-03-30T00:00:00.000Z' };
    expect(computeDerived([...late.events, extra], CATALOGS).lastArrival?.cityId).toBe('c-beta');
  });
});

describe('removeEvent (regla 7)', () => {
  it('no deja borrar el primero', () => {
    const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'adopcion', userId: 'w', contactId: 3, date: '2026-02-01' } }]);
    const first = firstRegisteredEvent(events)!;
    expect(() => removeEvent(animal, events, first.id, ctx())).toThrow(/primer/);
  });

  it('el primero es el alta aunque luego se añada una llegada con fecha anterior', () => {
    const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'otras_asociaciones', userId: 'w', contactId: 3, date: '2026-02-01' } }]);
    const r = applyEvent(animal, events, arrivalInput({ collectionDate: '2025-12-01' }), ctx({ now: '2026-03-01T00:00:00.000Z' }));
    const alta = events[0]!;
    expect(firstRegisteredEvent(r.events)?.id).toBe(alta.id);
    expect(() => removeEvent(r.animal, r.events, r.event.id, ctx())).not.toThrow();
  });

  it('borrar una salida devuelve el estado anterior (no veterinario) y conserva el centro', () => {
    const { animal, events } = buildAnimal(1, [
      { input: { subtypeId: 'vacuna', userId: 'w', date: '2026-02-01', vaccineId: 'v', switchValue: true } },
      { input: { subtypeId: 'adopcion', userId: 'w', contactId: 3, date: '2026-02-02' } },
    ]);
    const exit = events.find((e) => e.subtypeId === 'adopcion')!;
    const r = removeEvent(animal, events, exit.id, ctx());
    expect(r.animal.statusId).toBe('disponible');
    expect(r.animal.lastExit).toBeUndefined();
    expect(r.animal.exitDates).toEqual([]);
    expect(r.events).toHaveLength(2);
  });

  it('borrar un cambio de centro vuelve al centro de la última llegada', () => {
    const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'ingreso_revision', userId: 'w', centerId: 'carlet', date: '2026-02-02' } }]);
    expect(animal.centerId).toBe('carlet');
    const mv = events.find((e) => e.subtypeId === 'ingreso_revision')!;
    expect(removeEvent(animal, events, mv.id, ctx()).animal.centerId).toBe('valencia');
  });

  it('borrar una reentrada recupera estado y centro previos', () => {
    const { animal, events } = buildAnimal(1, [
      { input: { subtypeId: 'adopcion', userId: 'w', contactId: 3, date: '2026-02-01' } },
      { input: { subtypeId: 'devolucion_desde_adopcion', userId: 'w', contactId: 3, centerId: 'carlet', collectionDate: '2026-02-10' } },
    ]);
    expect(animal.statusId).toBe('disponible');
    const re = events.find((e) => e.subtypeId === 'devolucion_desde_adopcion')!;
    const r = removeEvent(animal, events, re.id, ctx());
    expect(r.animal.statusId).toBe('adoptado');
    expect(r.animal.centerId).toBe('valencia');
    expect(r.animal.lastArrival?.date).toBe('2026-01-10');
  });

  it('devuelve la clave del adjunto a borrar', () => {
    const doc = { key: 'animals/1/events/77.pdf', originalName: 'a.pdf' };
    const { animal, events } = buildAnimal(1, [{ input: { subtypeId: 'documento', userId: 'w', date: '2026-02-01', document: doc } }]);
    const ev = events.find((e) => e.subtypeId === 'documento')!;
    expect(removeEvent(animal, events, ev.id, ctx()).documentKeyToDelete).toBe(doc.key);
  });

  it('evento inexistente', () => {
    const { animal, events } = buildAnimal(1);
    expect(() => removeEvent(animal, events, 999999, ctx())).toThrow(/no existe/);
  });

  it('borrar un veterinario no cambia el estado', () => {
    const { animal, events } = buildAnimal(1, [
      { input: { subtypeId: 'acogida', userId: 'w', contactId: 2, date: '2026-02-01' } },
      { input: { subtypeId: 'test', userId: 'w', date: '2026-02-03' } },
    ]);
    const vet = events.find((e) => e.subtypeId === 'test')!;
    expect(removeEvent(animal, events, vet.id, ctx()).animal.statusId).toBe('acogida');
  });
});

describe('derivados y orden', () => {
  it('ordena por fecha, createdAt e id', () => {
    const mk = (id: number, date: string, createdAt: string) => ({ id, date, createdAt }) as HistoryEvent;
    const sorted = sortEvents([mk(3, '2026-01-02', 'b'), mk(2, '2026-01-01', 'z'), mk(1, '2026-01-02', 'b'), mk(4, '2026-01-02', 'a')]);
    expect(sorted.map((e) => e.id)).toEqual([2, 4, 1, 3]);
  });

  it('estado y centro desde eventos', () => {
    const { events } = buildAnimal(1, [
      { input: { subtypeId: 'ingreso_revision', userId: 'w', centerId: 'carlet', date: '2026-02-02' } },
      { input: { subtypeId: 'acogida', userId: 'w', contactId: 4, date: '2026-02-03' } },
      { input: { subtypeId: 'test', userId: 'w', date: '2026-02-04' } },
    ]);
    expect(currentStatusFromEvents(events, CATALOGS)).toBe('acogida');
    expect(currentCenterFromEvents(events, CATALOGS)).toBe('carlet');
    const d = computeDerived(events, CATALOGS);
    expect(d.contactIds.sort()).toEqual([1, 4]);
    expect(d.statusChanges.map((c) => c.statusId)).toEqual(['disponible', 'disponible', 'acogida']);
  });
});
