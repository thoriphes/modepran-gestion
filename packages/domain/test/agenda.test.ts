import { describe, expect, it } from 'vitest';
import {
  addIncidentPhoto,
  agendaDay,
  agendaSortKey,
  assertIncidentImmutable,
  changeAgendaStatus,
  createAgendaItem,
  createIncident,
  createIncidentAppointment,
  createReferral,
  isClosedAgendaItem,
  overdueItems,
  ownIncidents,
  reschedule,
  resolveIncident,
  startIncident,
  updateAgendaItem,
  type AgendaContext,
  type AgendaItem,
  type AppointmentType,
  type Area,
  type IncidentPhoto,
  type NewAgendaItemInput,
  type Staff,
} from '../src/index.js';

const appointmentTypes: AppointmentType[] = [
  { id: 't-rev', name: 'Revisión', color: '#3366ff', active: true },
  { id: 't-old', name: 'Antiguo', color: '#000000', active: false },
];
const staff: Staff[] = [
  { id: 's-vet', name: 'Veterinaria Ejemplo', roles: ['veterinaria'], active: true },
  { id: 's-cui', name: 'Cuidadora Ejemplo', roles: ['cuidadora'], active: true },
  { id: 's-baja', name: 'Auxiliar de baja', roles: ['auxiliar'], active: false },
];
const areas: Area[] = [
  { id: 'a-cuar', name: 'Cuarentena', species: ['perros', 'gatos'], active: true },
  { id: 'a-gat', name: 'Gatera', species: ['gatos'], active: true },
  { id: 'a-off', name: 'Cerrada', species: [], active: false },
];

let n = 0;
const actx = (over: Partial<AgendaContext> = {}): AgendaContext => ({
  now: `2026-03-15T10:${String(n).padStart(2, '0')}:00.000Z`,
  userId: 'u-1',
  newId: `item-${++n}`,
  appointmentTypes,
  staff,
  ...over,
});

const cita = (over: Partial<NewAgendaItemInput> = {}): NewAgendaItemInput => ({
  kind: 'cita',
  agenda: 'modevet',
  date: '2026-03-20',
  time: '10:30',
  appointmentTypeId: 't-rev',
  requestedById: 's-vet',
  animalId: 5,
  species: 'CAN',
  actions: [{ categoryId: 'cat-vac' }, { text: '  ' }],
  ...over,
});

describe('agenda: crear', () => {
  it('cita válida: pendiente, snapshot de tipo y solicitante, statusEvents y createdBy del servidor', () => {
    const it1 = createAgendaItem(cita(), actx());
    expect(it1.status).toBe('pendiente');
    expect(it1.appointmentType).toEqual({ id: 't-rev', name: 'Revisión', color: '#3366ff' });
    expect(it1.requestedBy).toEqual({ id: 's-vet', name: 'Veterinaria Ejemplo' });
    expect(it1.createdBy).toBe('u-1');
    expect(it1.statusEvents).toHaveLength(1);
    expect(it1.actions).toEqual([{ categoryId: 'cat-vac' }]);
    expect(it1.isReferral).toBe(false);
  });

  it('rechaza: tipo inactivo, solicitante que no es veterinaria/auxiliar o está de baja', () => {
    expect(() => createAgendaItem(cita({ appointmentTypeId: 't-old' }), actx())).toThrow(/tipo de cita/);
    expect(() => createAgendaItem(cita({ requestedById: 's-cui' }), actx())).toThrow(/solicita/);
    expect(() => createAgendaItem(cita({ requestedById: 's-baja' }), actx())).toThrow(/solicita/);
  });

  it('animal con ficha o externo, no ambos ni ninguno', () => {
    expect(() => createAgendaItem(cita({ animalId: undefined }), actx())).toThrow(/animal/);
    expect(() => createAgendaItem(cita({ externalAnimal: { name: 'Toby', species: 'perro' } }), actx())).toThrow(/animal/);
    const ext = createAgendaItem(cita({ animalId: undefined, externalAnimal: { name: ' Toby ', species: 'perro' }, owner: { name: ' Dueña ', email: 'X@EXAMPLE.TEST' } }), actx());
    expect(ext.externalAnimal).toEqual({ name: 'Toby', species: 'perro' });
    expect(ext.owner).toEqual({ name: 'Dueña', email: 'x@example.test' });
  });

  it('ambas solo para avisos y notas; fecha y hora válidas; texto obligatorio en avisos', () => {
    expect(() => createAgendaItem(cita({ agenda: 'ambas' }), actx())).toThrow(/Carlet o de Modevet/);
    expect(() => createAgendaItem(cita({ date: '2026-02-30' }), actx())).toThrow(/fecha/);
    expect(() => createAgendaItem(cita({ time: '25:00' }), actx())).toThrow(/hora/);
    expect(() => createAgendaItem({ kind: 'aviso', agenda: 'ambas', date: '2026-03-20', text: ' ' }, actx())).toThrow(/texto/);
    const nota = createAgendaItem({ kind: 'nota', agenda: 'ambas', date: '2026-03-20', text: 'Llamar' }, actx());
    expect(nota.time).toBeUndefined();
    expect(nota.appointmentType).toBeUndefined();
  });

  it('especie obligatoria en citas', () => {
    expect(() => createAgendaItem(cita({ species: undefined }), actx())).toThrow(/especie/);
  });
});

describe('agenda: estados y edición', () => {
  it('cambia estado añadiendo statusEvents; los avisos usan concluido', () => {
    const c = createAgendaItem(cita(), actx());
    const done = changeAgendaStatus(c, 'concluida', { now: 't2', userId: 'u-2' });
    expect(done.status).toBe('concluida');
    expect(done.statusEvents.at(-1)).toEqual({ status: 'concluida', at: 't2', by: 'u-2' });
    expect(isClosedAgendaItem(done)).toBe(true);
    expect(changeAgendaStatus(done, 'concluida', { now: 't3', userId: 'u' })).toBe(done);
    const aviso = createAgendaItem({ kind: 'aviso', agenda: 'carlet', date: '2026-03-20', text: 'x' }, actx());
    expect(() => changeAgendaStatus(aviso, 'concluida', { now: 't', userId: 'u' })).toThrow(/no válido/);
    expect(changeAgendaStatus(aviso, 'concluido', { now: 't', userId: 'u' }).status).toBe('concluido');
  });

  it('no se pasa a reagendada a mano ni se cambia una reagendada', () => {
    const c = createAgendaItem(cita(), actx());
    expect(() => changeAgendaStatus(c, 'reagendada', { now: 't', userId: 'u' })).toThrow(/reagendar/);
    const { original } = reschedule(c, { date: '2026-03-21', time: '11:00' }, actx());
    expect(() => changeAgendaStatus(original, 'pendiente', { now: 't', userId: 'u' })).toThrow(/reagendada/);
  });

  it('no se edita fecha ni hora de un elemento existente', () => {
    const c = createAgendaItem(cita(), actx());
    expect(() => updateAgendaItem(c, { date: '2026-03-21' })).toThrow(/reagenda/);
    expect(() => updateAgendaItem(c, { time: '11:00' })).toThrow(/reagenda/);
    expect(updateAgendaItem(c, { date: c.date, time: c.time, text: ' nuevo ' }).text).toBe('nuevo');
  });
});

describe('reagendar', () => {
  it('crea una cita nueva pendiente y marca la original reagendada, enlazadas', () => {
    const c = createAgendaItem(cita(), actx());
    const { original, created } = reschedule(c, { date: '2026-03-22', time: '' }, actx({ userId: 'u-9' }));
    expect(original.status).toBe('reagendada');
    expect(original.rescheduledToId).toBe(created.id);
    expect(original.statusEvents.at(-1)?.status).toBe('reagendada');
    expect(created.status).toBe('pendiente');
    expect(created.rescheduledFromId).toBe(c.id);
    expect(created.date).toBe('2026-03-22');
    expect(created.time).toBeUndefined();
    expect(created.createdBy).toBe('u-9');
    expect(created.statusEvents).toHaveLength(1);
    expect(created.appointmentType).toEqual(c.appointmentType);
    expect(created.animalId).toBe(5);
    // la original conserva fecha y hora
    expect(original.date).toBe(c.date);
    expect(original.time).toBe(c.time);
  });

  it('una cita solo se reagenda una vez (la nueva sí puede reagendarse)', () => {
    const c = createAgendaItem(cita(), actx());
    const r1 = reschedule(c, { date: '2026-03-22', time: '09:00' }, actx());
    expect(() => reschedule(r1.original, { date: '2026-03-23' }, actx())).toThrow(/ya se ha reagendado/);
    expect(() => reschedule({ ...c, rescheduledToId: 'x' }, { date: '2026-03-23' }, actx())).toThrow(/ya se ha reagendado/);
    const r2 = reschedule(r1.created, { date: '2026-03-24', time: '09:00' }, actx());
    expect(r2.created.rescheduledFromId).toBe(r1.created.id);
  });

  it('solo citas, pendientes o no presentadas, a una franja distinta', () => {
    const nota = createAgendaItem({ kind: 'nota', agenda: 'carlet', date: '2026-03-20', text: 'x' }, actx());
    expect(() => reschedule(nota, { date: '2026-03-21' }, actx())).toThrow(/Solo se reagendan citas/);
    const c = createAgendaItem(cita(), actx());
    const cancelled = changeAgendaStatus(c, 'cancelada', { now: 't', userId: 'u' });
    expect(() => reschedule(cancelled, { date: '2026-03-21' }, actx())).toThrow(/pendiente o no presentada/);
    const noShow = changeAgendaStatus(c, 'no_presentado', { now: 't', userId: 'u' });
    expect(reschedule(noShow, { date: '2026-03-21' }, actx()).original.status).toBe('reagendada');
    expect(() => reschedule(c, { date: c.date, time: c.time! }, actx())).toThrow(/mismas/);
    expect(() => reschedule(c, { date: 'mañana' }, actx())).toThrow(/fecha/);
  });
});

describe('vistas de agenda', () => {
  it('día: sin hora aparte, con hora ordenadas; ambas aparece en las dos; avisos cerrados no', () => {
    const items: AgendaItem[] = [
      createAgendaItem(cita({ time: '12:00' }), actx()),
      createAgendaItem(cita({ time: '09:00' }), actx()),
      createAgendaItem(cita({ time: undefined }), actx()),
      createAgendaItem({ kind: 'aviso', agenda: 'ambas', date: '2026-03-20', text: 'a' }, actx()),
      changeAgendaStatus(createAgendaItem({ kind: 'nota', agenda: 'modevet', date: '2026-03-20', text: 'b' }, actx()), 'concluido', { now: 't', userId: 'u' }),
      createAgendaItem(cita({ agenda: 'carlet' }), actx()),
    ];
    const d = agendaDay(items, 'modevet', '2026-03-20');
    expect(d.timed.map((i) => i.time)).toEqual(['09:00', '12:00']);
    expect(d.untimed.map((i) => i.kind)).toEqual(['cita', 'aviso']);
    const carlet = agendaDay(items, 'carlet', '2026-03-20');
    expect(carlet.untimed.map((i) => i.kind)).toEqual(['aviso']);
    expect(carlet.timed).toHaveLength(1);
    expect(overdueItems(items, 'modevet', '2026-03-21')).toHaveLength(4);
    expect(agendaSortKey({ date: '2026-03-20', id: 'x' })).toBe('2026-03-20#99:99#x');
  });
});

const photo = (key: string, over: Partial<IncidentPhoto> = {}): IncidentPhoto => ({ key, mime: 'image/jpeg', bytes: 1000, uploadedAt: 't', ...over });

describe('incidencias', () => {
  const ictx = () => ({ now: '2026-03-15T08:00:00.000Z', userId: 'u-bien', newId: `inc-${++n}`, areas });
  const mk = () => createIncident({ animalName: ' Sin ficha ', species: 'FEL', areaId: 'a-gat', text: ' cojea ', priority: 'urgente', reporterStaffId: 's-cui', photos: [photo('p1')] }, ictx());

  it('crear: pendiente, copia el nombre de la ubicación, autor del servidor', () => {
    const i = mk();
    expect(i).toMatchObject({ status: 'pendiente', areaName: 'Gatera', text: 'cojea', animalName: 'Sin ficha', reporterUserId: 'u-bien', reporterStaffId: 's-cui' });
    expect(i.statusEvents).toHaveLength(1);
  });

  it('crear: validaciones', () => {
    const base = { species: 'CAN' as const, areaId: 'a-cuar', text: 'x', priority: 'normal' as const, animalId: 1 };
    expect(() => createIncident({ ...base, animalId: undefined }, ictx())).toThrow(/animal/);
    expect(() => createIncident({ ...base, areaId: 'a-gat' }, ictx())).toThrow(/especie/);
    expect(() => createIncident({ ...base, areaId: 'a-off' }, ictx())).toThrow(/ubicación/);
    expect(() => createIncident({ ...base, text: ' ' }, ictx())).toThrow(/ocurre/);
    expect(() => createIncident({ ...base, priority: 'alta' as never }, ictx())).toThrow(/Prioridad/);
    expect(() => createIncident({ ...base, photos: [photo('a'), photo('b'), photo('c'), photo('d')] }, ictx())).toThrow(/3 fotos/);
    expect(() => createIncident({ ...base, photos: [photo('a', { mime: 'application/pdf' })] }, ictx())).toThrow(/Formato/);
    expect(createIncident({ ...base, species: 'otra' }, ictx()).areaName).toBe('Cuarentena');
  });

  it('fotos: máximo 3, sin duplicar, no en resueltas; los datos originales son inmutables', () => {
    let i = mk();
    i = addIncidentPhoto(i, photo('p2'));
    expect(addIncidentPhoto(i, photo('p2'))).toBe(i);
    i = addIncidentPhoto(i, photo('p3'));
    expect(() => addIncidentPhoto(i, photo('p4'))).toThrow(/3 fotos/);
    const orig = mk();
    expect(() => assertIncidentImmutable(orig, { ...orig, text: 'otro' })).toThrow(/originales/);
    expect(() => assertIncidentImmutable(orig, { ...orig, photos: [] })).toThrow(/fotos/);
    expect(() => assertIncidentImmutable(orig, { ...orig, status: 'en_proceso', photos: [...orig.photos, photo('x')] })).not.toThrow();
  });

  it('start: pendiente → en proceso, una vez', () => {
    const i = startIncident(mk(), { now: 't', userId: 'u-carlet' });
    expect(i.status).toBe('en_proceso');
    expect(i.statusEvents.at(-1)).toEqual({ status: 'en_proceso', at: 't', by: 'u-carlet' });
    expect(() => startIncident(i, { now: 't', userId: 'u' })).toThrow(/ya está/);
  });

  it('dar cita no la resuelve (pasa a en proceso); exige franja; la cita apunta a la incidencia', () => {
    const inc = mk();
    expect(() => createIncidentAppointment(inc, { agenda: 'carlet', date: '2026-03-16', time: '', appointmentTypeId: 't-rev' }, actx())).toThrow(/franja/);
    const { incident, appointment } = createIncidentAppointment(inc, { agenda: 'carlet', date: '2026-03-16', time: '09:30', appointmentTypeId: 't-rev', notes: 'mirar pata' }, actx());
    expect(incident.status).toBe('en_proceso');
    expect(appointment).toMatchObject({ kind: 'cita', agenda: 'carlet', incidentId: inc.id, isReferral: false, text: 'mirar pata', species: 'FEL', externalAnimal: { name: 'Sin ficha', species: 'FEL' } });
    // sin "solicitada por" obligatorio
    expect(appointment.requestedBy).toBeUndefined();
  });

  it('derivar: a Modevet, máximo una abierta', () => {
    const inc = mk();
    const r1 = createReferral(inc, [], { date: '2026-03-17', appointmentTypeId: 't-rev' }, actx());
    expect(r1.referral).toMatchObject({ agenda: 'modevet', isReferral: true, incidentId: inc.id });
    expect(r1.referral.time).toBeUndefined();
    expect(() => createReferral(r1.incident, [r1.referral], { date: '2026-03-18', appointmentTypeId: 't-rev' }, actx())).toThrow(/derivación pendiente/);
    // una cita normal abierta no cuenta como derivación
    const appt = createIncidentAppointment(inc, { agenda: 'modevet', date: '2026-03-16', time: '09:30', appointmentTypeId: 't-rev' }, actx()).appointment;
    const closed = changeAgendaStatus(r1.referral, 'cancelada', { now: 't', userId: 'u' });
    expect(() => createReferral(r1.incident, [closed, appt], { date: '2026-03-18', appointmentTypeId: 't-rev' }, actx())).not.toThrow();
  });

  it('resolver: exige responsable y tratamiento y cierra en cascada sus citas/derivaciones abiertas', () => {
    const inc = mk();
    const a = createIncidentAppointment(inc, { agenda: 'carlet', date: '2026-03-16', time: '09:30', appointmentTypeId: 't-rev' }, actx());
    const r = createReferral(a.incident, [], { date: '2026-03-17', appointmentTypeId: 't-rev' }, actx());
    const done = changeAgendaStatus(createIncidentAppointment(inc, { agenda: 'carlet', date: '2026-03-15', time: '08:00', appointmentTypeId: 't-rev' }, actx()).appointment, 'no_presentado', { now: 't', userId: 'u' });
    const other = createAgendaItem(cita(), actx());
    const linked = [a.appointment, r.referral, done, other];

    expect(() => resolveIncident(r.incident, linked, { byStaffId: '', treatment: 'x' }, { now: 't', userId: 'u' })).toThrow(/revisado/);
    expect(() => resolveIncident(r.incident, linked, { byStaffId: 's-vet', treatment: ' ' }, { now: 't', userId: 'u' })).toThrow(/actuación/);
    expect(() => resolveIncident(r.incident, linked, { byStaffId: 's-baja', treatment: 'x' }, { now: 't', userId: 'u', staff })).toThrow(/responsable/);

    const res = resolveIncident(r.incident, linked, { byStaffId: 's-vet', treatment: ' antiinflamatorio ' }, { now: 'tr', userId: 'u-mv', staff });
    expect(res.incident.status).toBe('resuelta');
    expect(res.incident.resolution).toEqual({ byStaffId: 's-vet', treatment: 'antiinflamatorio', at: 'tr' });
    expect(res.updatedItems.map((i) => i.id).sort()).toEqual([a.appointment.id, r.referral.id].sort());
    for (const it of res.updatedItems) {
      expect(it.status).toBe('concluida');
      expect(it.resolution?.treatment).toBe('antiinflamatorio');
      expect(it.statusEvents.at(-1)).toEqual({ status: 'concluida', at: 'tr', by: 'u-mv' });
    }
    expect(() => resolveIncident(res.incident, linked, { byStaffId: 's-vet', treatment: 'x' }, { now: 't', userId: 'u' })).toThrow(/resuelta/);
    expect(() => createReferral(res.incident, [], { date: '2026-03-18', appointmentTypeId: 't-rev' }, actx())).toThrow(/abierta/);
    expect(() => addIncidentPhoto(res.incident, photo('zz'))).toThrow(/resuelta/);
  });

  it('seguimiento propio por persona o por cuenta', () => {
    const a = { ...mk(), createdAt: '2026-01-01' };
    const b = { ...mk(), createdAt: '2026-02-01', reporterStaffId: 's-otra' };
    const c = { ...mk(), createdAt: '2026-03-01' };
    expect(ownIncidents([a, b, c], 'u-bien', 's-cui').map((i) => i.createdAt)).toEqual(['2026-03-01', '2026-01-01']);
    expect(ownIncidents([a, b, c], 'u-bien')).toHaveLength(3);
  });
});
