import { describe, expect, it } from 'vitest';
import { setup, TODAY } from './helpers.js';

const cita = (over: Record<string, unknown> = {}) => ({
  kind: 'cita',
  agenda: 'modevet',
  date: '2026-06-20',
  time: '10:00',
  appointmentTypeId: 'at-consulta',
  requestedById: 's-vet1',
  animalId: 11,
  species: 'FEL',
  actions: [{ categoryId: 'ac-desparasitar', subcategoryId: 'acs-interna' }, { categoryId: 'ac-vacunas', subcategoryId: 'acs-rabia' }, { text: 'Revisión' }],
  ...over,
});

describe('agenda', () => {
  it('crear, listar (incluye "ambas"), permisos de agenda', async () => {
    const { req } = await setup();
    const a = await req('POST', '/agenda', { as: 'modevet', body: cita() });
    expect(a.status).toBe(201);
    expect(a.body.createdBy).toBe('dev-modevet');
    expect(a.body.statusEvents).toHaveLength(1);
    const nota = await req('POST', '/agenda', { as: 'carlet', body: { kind: 'nota', agenda: 'ambas', date: '2026-06-20', text: 'Nota común' } });
    expect(nota.status).toBe(201);
    // Carlet solo crea derivaciones en Modevet
    expect((await req('POST', '/agenda', { as: 'carlet', body: cita() })).status).toBe(403);
    expect((await req('POST', '/agenda', { as: 'carlet', body: cita({ isReferral: true }) })).status).toBe(201);
    const list = await req('GET', '/agenda?agenda=modevet&from=2026-06-01&to=2026-06-30', { as: 'modevet' });
    expect(list.body.items.map((i: any) => i.kind).sort()).toEqual(['cita', 'cita', 'nota']);
    const carlet = await req('GET', '/agenda?agenda=carlet&from=2026-06-01&to=2026-06-30', { as: 'modevet' });
    expect(carlet.body.items.map((i: any) => i.kind)).toEqual(['nota']);
    // Modevet solo lee la agenda de Carlet
    expect((await req('POST', '/agenda', { as: 'modevet', body: cita({ agenda: 'carlet' }) })).status).toBe(403);
  });

  it('cita externa crea contacto cliente_modevet (visible para Modevet)', async () => {
    const { req } = await setup();
    const { animalId: _a, ...rest } = cita();
    const r = await req('POST', '/agenda', { as: 'modevet', body: { ...rest, externalAnimal: { name: 'Pipo', species: 'Perro' }, species: 'CAN', owner: { name: 'Cliente Inventado', phone: '699000000' } } });
    expect(r.status).toBe(201);
    const contacts = await req('GET', '/contacts', { as: 'modevet' });
    expect(contacts.status).toBe(200);
    expect(contacts.body.items.map((c: any) => c.name)).toEqual(['Cliente Inventado']);
  });

  it('no se cambia la fecha; reagendar una sola vez', async () => {
    const { req } = await setup();
    const a = (await req('POST', '/agenda', { as: 'modevet', body: cita() })).body;
    const bad = await req('PATCH', `/agenda/${a.id}`, { as: 'modevet', body: { date: '2026-06-21' } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('date_locked');
    const rs = await req('POST', `/agenda/${a.id}/reschedule`, { as: 'modevet', body: { date: '2026-06-22', time: '12:00' } });
    expect(rs.status).toBe(200);
    expect(rs.body.original.status).toBe('reagendada');
    expect(rs.body.original.rescheduledToId).toBe(rs.body.created.id);
    expect(rs.body.created.rescheduledFromId).toBe(a.id);
    expect(rs.body.created.status).toBe('pendiente');
    const twice = await req('POST', `/agenda/${a.id}/reschedule`, { as: 'modevet', body: { date: '2026-06-23' } });
    expect(twice.status).toBe(422);
    expect(twice.body.error.code).toBe('already_rescheduled');
    const stored = await req('GET', `/agenda/${a.id}`, { as: 'modevet' });
    expect(stored.body.status).toBe('reagendada');
  });

  it('registrar en historial: eventos veterinario según vetSubtypeId; una vez', async () => {
    const { req } = await setup();
    const a = (await req('POST', '/agenda', { as: 'modevet', body: cita() })).body;
    const early = await req('POST', `/agenda/${a.id}/register-history`, { as: 'modevet', body: {} });
    expect(early.body.error.code).toBe('not_concluded');
    const done = await req('PATCH', `/agenda/${a.id}`, { as: 'modevet', body: { status: 'concluida' } });
    expect(done.body.status).toBe('concluida');
    const r = await req('POST', `/agenda/${a.id}/register-history`, { as: 'modevet', body: {} });
    expect(r.status).toBe(200);
    expect(r.body.events).toHaveLength(1);
    expect(r.body.events[0].subtypeId).toBe('desparasitacion');
    expect(r.body.events[0].date).toBe('2026-06-20');
    expect(r.body.skipped.map((s: any) => s.index)).toEqual([1, 2]);
    const ficha = await req('GET', '/animals/11', { as: 'modevet' });
    expect(ficha.body.events.some((e: any) => e.id === r.body.events[0].id)).toBe(true);
    const again = await req('POST', `/agenda/${a.id}/register-history`, { as: 'modevet', body: {} });
    expect(again.body.error.code).toBe('already_registered');
  });

  it('registrar en historial copia las notas opcionales a los eventos', async () => {
    const { req } = await setup();
    const a = (await req('POST', '/agenda', { as: 'modevet', body: cita() })).body;
    await req('PATCH', `/agenda/${a.id}`, { as: 'modevet', body: { status: 'concluida' } });
    const r = await req('POST', `/agenda/${a.id}/register-history`, { as: 'modevet', body: { notes: 'Dosis según peso' } });
    expect(r.status).toBe(200);
    expect(r.body.events).toHaveLength(1);
    expect(r.body.events[0].notes).toContain('Dosis según peso');
  });
});

describe('incidencias', () => {
  const incident = { animalId: 10, species: 'CAN', areaId: 'a-campo', text: 'Cojea de la pata trasera', priority: 'urgente' };

  it('bienestar crea y solo ve las suyas; fotos con URL firmada (máx. 3)', async () => {
    const { req } = await setup();
    const i = await req('POST', '/incidents', { as: 'bienestar', body: incident });
    expect(i.status).toBe(201);
    expect(i.body.reporterUserId).toBe('dev-bienestar');
    await req('POST', '/incidents', { as: 'carlet', body: { ...incident, text: 'Otra' } });
    const mine = await req('GET', '/incidents', { as: 'bienestar' });
    expect(mine.body).toHaveLength(1);
    const all = await req('GET', '/incidents', { as: 'carlet' });
    expect(all.body).toHaveLength(2);
    for (let n = 0; n < 3; n++) {
      const up = await req('POST', `/incidents/${i.body.id}/photo-upload-url`, { as: 'bienestar', body: { contentType: 'image/jpeg', bytes: 1000 } });
      expect(up.body.key).toMatch(new RegExp(`^incidents/${i.body.id}/.+\\.jpg$`));
      const ph = await req('POST', `/incidents/${i.body.id}/photos`, { as: 'bienestar', body: { key: up.body.key, mime: 'image/jpeg', bytes: 1000 } });
      expect(ph.status).toBe(200);
    }
    const up = await req('POST', `/incidents/${i.body.id}/photo-upload-url`, { as: 'bienestar', body: { contentType: 'image/jpeg', bytes: 1000 } });
    const fourth = await req('POST', `/incidents/${i.body.id}/photos`, { as: 'bienestar', body: { key: up.body.key, mime: 'image/jpeg', bytes: 1000 } });
    expect(fourth.body.error.code).toBe('too_many_photos');
    const detail = await req('GET', `/incidents/${i.body.id}`, { as: 'bienestar' });
    expect(detail.body.photoUrls).toHaveLength(3);
    expect((await req('POST', `/incidents/${i.body.id}/start`, { as: 'bienestar' })).status).toBe(403);
  });

  it('derivación (máx. una abierta), cita, y resolución en cascada con evento veterinario', async () => {
    const { req } = await setup();
    const i = (await req('POST', '/incidents', { as: 'bienestar', body: incident })).body;
    const ref = await req('POST', `/incidents/${i.id}/referral`, { as: 'carlet', body: { date: '2026-06-16', appointmentTypeId: 'at-consulta' } });
    expect(ref.status).toBe(201);
    expect(ref.body.incident.status).toBe('en_proceso');
    expect(ref.body.referral.isReferral).toBe(true);
    expect(ref.body.referral.agenda).toBe('modevet');
    const ref2 = await req('POST', `/incidents/${i.id}/referral`, { as: 'carlet', body: { date: '2026-06-17', appointmentTypeId: 'at-consulta' } });
    expect(ref2.body.error.code).toBe('referral_open');
    const ap = await req('POST', `/incidents/${i.id}/appointment`, { as: 'carlet', body: { agenda: 'carlet', date: '2026-06-16', time: '09:30', appointmentTypeId: 'at-consulta' } });
    expect(ap.status).toBe(201);
    // Modevet resuelve la derivada
    const res = await req('POST', `/incidents/${i.id}/resolve`, { as: 'modevet', body: { byStaffId: 's-vet1', treatment: 'Antiinflamatorio', registerHistory: true } });
    expect(res.status).toBe(200);
    expect(res.body.incident.status).toBe('resuelta');
    expect(res.body.updatedItems).toHaveLength(2);
    expect(res.body.updatedItems.every((x: any) => x.status === 'concluida' && x.resolution.treatment === 'Antiinflamatorio')).toBe(true);
    expect(res.body.event.typeId).toBe('veterinario');
    expect(res.body.event.subtypeId).toBe('intervencion');
    expect(res.body.event.userId).toBe('s-vet1');
    const list = await req('GET', '/agenda?agenda=carlet&from=2026-06-01&to=2026-06-30');
    expect(list.body.items.find((x: any) => x.incidentId === i.id).status).toBe('concluida');
    const again = await req('POST', `/incidents/${i.id}/resolve`, { as: 'carlet', body: { byStaffId: 's-vet1', treatment: 'x' } });
    expect(again.body.error.code).toBe('closed');
  });

  it('?referred=1: solo las que tienen derivación (abierta o cerrada)', async () => {
    const { req } = await setup();
    const a = (await req('POST', '/incidents', { as: 'bienestar', body: incident })).body;
    const b = (await req('POST', '/incidents', { as: 'bienestar', body: { ...incident, text: 'Sin derivar' } })).body;
    const c = (await req('POST', '/incidents', { as: 'bienestar', body: { ...incident, text: 'Derivada y resuelta' } })).body;
    await req('POST', `/incidents/${b.id}/appointment`, { as: 'carlet', body: { agenda: 'carlet', date: '2026-06-16', time: '09:30', appointmentTypeId: 'at-consulta' } });
    await req('POST', `/incidents/${a.id}/referral`, { as: 'carlet', body: { date: '2026-06-16', appointmentTypeId: 'at-consulta' } });
    await req('POST', `/incidents/${c.id}/referral`, { as: 'carlet', body: { date: '2026-06-16', appointmentTypeId: 'at-consulta' } });
    await req('POST', `/incidents/${c.id}/resolve`, { as: 'modevet', body: { byStaffId: 's-vet1', treatment: 'Hecho' } });
    const r = await req('GET', '/incidents?referred=1', { as: 'modevet' });
    expect(r.status).toBe(200);
    expect(r.body.map((i: any) => i.id).sort()).toEqual([a.id, c.id].sort());
    expect((await req('GET', '/incidents', { as: 'modevet' })).body).toHaveLength(3);
  });

  it('modevet no resuelve incidencias sin derivación', async () => {
    const { req } = await setup();
    const i = (await req('POST', '/incidents', { as: 'bienestar', body: incident })).body;
    const r = await req('POST', `/incidents/${i.id}/resolve`, { as: 'modevet', body: { byStaffId: 's-vet1', treatment: 'x' } });
    expect(r.status).toBe(403);
  });
});

describe('informes, export, auditoría, usuarios', () => {
  it('dashboard, summary y datos de Excel', async () => {
    const { req } = await setup();
    const d = await req('GET', '/reports/dashboard', { as: 'carlet' });
    expect(d.body.available).toBe(6);
    expect(d.body.months).toHaveLength(12);
    const s = await req('GET', '/reports/summary?zoneId=z-norte', { as: 'carlet' });
    expect(s.status).toBe(200);
    expect(s.body.filter.cityIds).toEqual(['c-alfa', 'c-beta']);
    expect(s.body.arrivalsBySpeciesSex.total).toBeGreaterThan(0);
    const x = await req('GET', `/reports/excel-data?from=2025-01-01&to=${TODAY}`, { as: 'carlet' });
    expect(x.body.gestion.arrivals.rows.length).toBeGreaterThan(0);
    expect(x.body.census.final.total).toBe(7);
    expect(x.body.gestionTitle).toContain('Informe gestión');
  });

  it('export CSV (admin) auditado', async () => {
    const { req, repo } = await setup();
    const r = await req('GET', '/export/animals.csv');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/csv');
    expect(String(r.body).split('\r\n')[0]).toContain('Nombre');
    expect((await req('GET', '/export/nada.csv')).status).toBe(404);
    expect(repo.state.audit.some((a) => a.action === 'export' && a.entityId === 'animals')).toBe(true);
    const audit = await req('GET', '/audit?action=export');
    expect(audit.body.length).toBeGreaterThan(0);
  });

  it('usuarios: crear, cambiar grupos, desactivar; no auto-bloqueo', async () => {
    const { req } = await setup();
    const u = await req('POST', '/users', { body: { email: 'Nueva@Dev.Local', name: 'Nueva', profiles: ['carlet'] } });
    expect(u.status).toBe(201);
    expect(u.body.email).toBe('nueva@dev.local');
    const dup = await req('POST', '/users', { body: { email: 'nueva@dev.local', name: 'Nueva', profiles: ['carlet'] } });
    expect(dup.status).toBe(409);
    const p = await req('PATCH', `/users/${u.body.id}`, { body: { profiles: ['carlet', 'modevet'], active: false } });
    expect(p.body.profiles).toEqual(['carlet', 'modevet']);
    expect(p.body.active).toBe(false);
    const self = await req('PATCH', '/users/dev-admin', { body: { active: false } });
    expect(self.body.error.code).toBe('self_lockout');
    expect((await req('GET', '/users')).body.length).toBe(5);
  });

  it('catálogos: operativos para Carlet, resto admin', async () => {
    const { req } = await setup();
    const st = await req('POST', '/catalogs/staff', { as: 'carlet', body: { name: 'Auxiliar Dos', roles: ['auxiliar'] } });
    expect(st.status).toBe(201);
    expect((await req('POST', '/catalogs/species', { as: 'carlet', body: { name: 'Tortuga' } })).status).toBe(403);
    expect((await req('POST', '/catalogs/species', { body: { name: 'Tortuga' } })).status).toBe(201);
    const off = await req('PATCH', `/catalogs/staff/${st.body.id}`, { as: 'carlet', body: { active: false } });
    expect(off.body.active).toBe(false);
    expect(off.body.roles).toEqual(['auxiliar']);
    const cats = await req('GET', '/catalogs', { as: 'bienestar' });
    expect(cats.body.staff.find((s: any) => s.id === st.body.id).active).toBe(false);
  });
});
