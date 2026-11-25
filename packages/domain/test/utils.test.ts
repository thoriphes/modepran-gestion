import { describe, expect, it } from 'vitest';
import {
  addContactKind,
  addDays,
  addMonths,
  ageParts,
  can,
  canAddEventType,
  canReadAgenda,
  canWriteAgenda,
  capitalizeWords,
  contactKindForSubtype,
  csvCell,
  DEFAULT_SUBTYPES,
  defaultReportRange,
  endOfMonth,
  formatAge,
  formatDMY,
  formatSpanishLong,
  formatValenciaLine,
  isIsoDate,
  isSinDatos,
  madridDate,
  madridTime,
  monthsBetween,
  normalizeCity,
  normalizeNif,
  objectsToCsv,
  parseDMY,
  permissionsFor,
  PERMISSIONS,
  profilesFromGroups,
  resolveEventContact,
  slugify,
  SUBTYPE_CODES,
  toCsv,
  type Contact,
} from '../src/index.js';

describe('fechas Europe/Madrid', () => {
  it('día de calendario en Madrid (invierno UTC+1, verano UTC+2)', () => {
    expect(madridDate('2026-01-15T22:59:59Z')).toBe('2026-01-15');
    expect(madridDate('2026-01-15T23:00:00Z')).toBe('2026-01-16');
    expect(madridDate('2026-07-15T21:59:59Z')).toBe('2026-07-15');
    expect(madridDate('2026-07-15T22:00:00Z')).toBe('2026-07-16');
    expect(madridDate('2026-12-31T23:30:00Z')).toBe('2027-01-01');
    expect(madridTime('2026-07-15T08:05:00Z')).toBe('10:05');
    expect(() => madridDate('no')).toThrow();
  });

  it('valida y opera fechas', () => {
    expect(isIsoDate('2024-02-29')).toBe(true);
    expect(isIsoDate('2025-02-29')).toBe(false);
    expect(isIsoDate('2025-13-01')).toBe(false);
    expect(isIsoDate('25-01-01')).toBe(false);
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-03-15', -14)).toBe('2025-01-15');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
    expect(monthsBetween('2025-11-20', '2026-02-01')).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    expect(monthsBetween('2026-02-01', '2026-01-01')).toEqual([]);
    expect(defaultReportRange('2026-03-15')).toEqual({ from: '2025-03-01', to: '2026-03-15' });
  });

  it('formatos españoles', () => {
    expect(formatDMY('2026-03-05')).toBe('05-03-2026');
    expect(parseDMY('5-3-2026')).toBe('2026-03-05');
    expect(parseDMY('31-02-2026')).toBeUndefined();
    expect(formatSpanishLong('2026-03-05')).toBe('05 de Marzo de 2026');
    expect(formatValenciaLine('2026-12-25')).toBe('Valencia, 25 de Diciembre de 2026');
  });

  it('edad "X años Y meses Z días"', () => {
    expect(formatAge('2023-01-10', '2026-03-15')).toBe('3 años 2 meses 5 días');
    expect(formatAge('2025-02-15', '2026-03-15')).toBe('1 año 1 mes');
    expect(formatAge('2026-03-14', '2026-03-15')).toBe('1 día');
    expect(formatAge('2026-03-15', '2026-03-15')).toBe('0 días');
    expect(formatAge('2027-01-01', '2026-03-15')).toBe('0 días');
    expect(ageParts('2024-01-31', '2024-03-01')).toEqual({ years: 0, months: 1, days: 1 });
    expect(ageParts('2020-02-29', '2025-02-28')).toEqual({ years: 5, months: 0, days: 0 });
    expect(ageParts('2025-01-31', '2025-02-27')).toEqual({ years: 0, months: 0, days: 27 });
  });
});

describe('textos', () => {
  it('capitaliza palabras (ciudades y razas)', () => {
    expect(capitalizeWords('  vaLENcia   del cid ')).toBe('Valencia Del Cid');
    expect(normalizeCity("l'eliana")).toBe("L'Eliana");
    expect(normalizeCity('ÁLORA-norte')).toBe('Álora-Norte');
    expect(capitalizeWords('pastor alemán')).toBe('Pastor Alemán');
  });

  it('NIF normalizado y slugs', () => {
    expect(normalizeNif(' 00.000.000-t ')).toBe('00000000T');
    expect(normalizeNif('  ')).toBeUndefined();
    expect(slugify('Devolución desde Acogida')).toBe('devolucion_desde_acogida');
    expect(slugify('Dueño')).toBe('dueno');
    expect(slugify('Ingreso / Revision')).toBe('ingreso_revision');
  });
});

describe('CSV seguro', () => {
  it('BOM, ; y CRLF', () => {
    const csv = toCsv([
      ['a', 'b'],
      [1, 'x;y'],
    ]);
    expect(csv).toBe('﻿a;b\r\n1;"x;y"\r\n');
    expect(toCsv([['a']], { bom: false })).toBe('a\r\n');
  });

  it('neutraliza fórmulas en celdas de texto', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('+34 600')).toBe("'+34 600");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('normal')).toBe('normal');
    expect(csvCell(-5)).toBe('-5');
    expect(csvCell(2.5)).toBe('2,5');
  });

  it('comillas, saltos de línea, vacíos y booleanos', () => {
    expect(csvCell('di "hola"')).toBe('"di ""hola"""');
    expect(csvCell('a\nb')).toBe('"a\nb"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(true)).toBe('Sí');
    expect(csvCell(NaN)).toBe('');
  });

  it('objectsToCsv', () => {
    const out = objectsToCsv([{ n: 'A', v: 1 }], [
      { header: 'Nombre', value: (x) => x.n },
      { header: 'Valor', value: (x) => x.v },
    ]);
    expect(out).toBe('﻿Nombre;Valor\r\nA;1\r\n');
  });
});

describe('catálogos base', () => {
  it('29 subtipos con códigos estables y los obligatorios del spec', () => {
    expect(DEFAULT_SUBTYPES).toHaveLength(29);
    expect(new Set(DEFAULT_SUBTYPES.map((s) => s.code)).size).toBe(29);
    expect(DEFAULT_SUBTYPES.map((s) => s.code).sort()).toEqual([...SUBTYPE_CODES].sort());
    for (const c of ['devolucion_desde_acogida', 'devolucion_desde_adopcion', 'ingreso_revision', 'adopcion', 'dueno', 'eutanasia', 'acogida', 'acogida_solidaria', 'documento'])
      expect(SUBTYPE_CODES).toContain(c);
    for (const s of DEFAULT_SUBTYPES) expect(slugify(s.name)).toBe(s.code);
  });
});

describe('contactos (regla 6)', () => {
  const sinDatos: Contact = { id: 1, name: 'SIN DATOS', nif: '00000000T', kind: [], createdAt: '' };
  const real: Contact = { id: 2, name: 'Persona', nif: '11111111H', kind: [], createdAt: '' };
  const byNif = (nif: string) => [sinDatos, real].find((c) => c.nif === nif);

  it('usa el elegido; si trae datos lo actualiza', () => {
    expect(resolveEventContact({ contactId: 9 }, byNif)).toEqual({ action: 'use', contactId: 9 });
    expect(resolveEventContact({ contactId: 9, data: { name: ' X ' } }, byNif)).toMatchObject({ action: 'update', contactId: 9, data: { name: 'X' } });
  });

  it('busca por NIF (normalizado) excluyendo SIN DATOS; si no, crea', () => {
    expect(resolveEventContact({ data: { name: 'P', nif: '11111111-h' } }, byNif)).toMatchObject({ action: 'update', contactId: 2 });
    expect(resolveEventContact({ data: { name: 'P', nif: '00000000T' } }, byNif)).toMatchObject({ action: 'create' });
    expect(resolveEventContact({ data: { name: 'P', province: 'valencia', email: ' A@B.TEST ' } }, byNif)).toEqual({
      action: 'create',
      data: { name: 'P', province: 'Valencia', email: 'a@b.test' },
    });
    expect(() => resolveEventContact({}, byNif)).toThrow();
    expect(isSinDatos({ name: 'sin datos' })).toBe(true);
  });

  it('tipo de contacto según subtipo', () => {
    const sub = (code: string) => DEFAULT_SUBTYPES.find((s) => s.code === code)!;
    expect(contactKindForSubtype(sub('aviso'))).toBe('avisante');
    expect(contactKindForSubtype(sub('adopcion'))).toBe('adoptante');
    expect(contactKindForSubtype(sub('acogida_solidaria'))).toBe('acogedor');
    expect(contactKindForSubtype(sub('dueno'))).toBe('propietario');
    expect(contactKindForSubtype(sub('colonia'))).toBeUndefined();
    expect(addContactKind(['avisante'], 'avisante')).toEqual(['avisante']);
    expect(addContactKind(['avisante'], 'adoptante')).toEqual(['avisante', 'adoptante']);
  });
});

describe('permisos (spec §3)', () => {
  it('admin lo tiene todo salvo los permisos "solo lo suyo"', () => {
    expect(permissionsFor(['admin'])).toHaveLength(PERMISSIONS.length - 2);
    expect(can(['admin'], 'users:manage')).toBe(true);
    expect(can(['admin'], 'purge')).toBe(true);
  });

  it('carlet: operativa sin usuarios, auditoría, export ni borrar animal', () => {
    const p = ['carlet'] as const;
    expect(can([...p], 'animals:write')).toBe(true);
    expect(can([...p], 'events:delete')).toBe(true);
    expect(can([...p], 'animals:delete')).toBe(false);
    expect(can([...p], 'templates:write')).toBe(false);
    expect(can([...p], 'reports:read')).toBe(true);
    expect(can([...p], 'users:manage')).toBe(false);
    expect(can([...p], 'export:csv')).toBe(false);
    expect(can([...p], 'catalogs:operational')).toBe(true);
    expect(can([...p], 'catalogs:write')).toBe(false);
    expect(canWriteAgenda([...p], 'carlet')).toBe(true);
    expect(canWriteAgenda([...p], 'modevet')).toBe(false);
    expect(canWriteAgenda([...p], 'modevet', true)).toBe(true);
  });

  it('modevet: veterinario y su agenda; Carlet solo ver', () => {
    const p = ['modevet' as const];
    expect(canAddEventType(p, 'veterinario')).toBe(true);
    expect(canAddEventType(p, 'salida')).toBe(false);
    expect(canReadAgenda(p, 'carlet')).toBe(true);
    expect(canWriteAgenda(p, 'carlet')).toBe(false);
    expect(canWriteAgenda(p, 'modevet')).toBe(true);
    expect(can(p, 'contacts:read')).toBe(false);
    expect(can(p, 'contacts:own_clients')).toBe(true);
    expect(can(p, 'animals:read_contacts')).toBe(false);
    expect(can(p, 'incidents:create')).toBe(false);
    expect(can(p, 'incidents:resolve_referred')).toBe(true);
    expect(can(p, 'reports:read')).toBe(false);
  });

  it('bienestar: ver fichas sin contactos, crear incidencias y su seguimiento', () => {
    const p = ['bienestar' as const];
    expect(permissionsFor(p)).toEqual(['animals:read', 'incidents:create', 'incidents:own_followup']);
    expect(can(p, 'animals:read_contacts')).toBe(false);
    expect(canReadAgenda(p, 'carlet')).toBe(false);
  });

  it('varios perfiles suman permisos; grupos de Cognito', () => {
    expect(can(['bienestar', 'modevet'], 'incidents:create')).toBe(true);
    expect(can([], 'animals:read')).toBe(false);
    expect(profilesFromGroups(['Admin', 'otro', 'carlet', 'carlet'])).toEqual(['admin', 'carlet']);
    expect(profilesFromGroups('modevet,bienestar')).toEqual(['modevet', 'bienestar']);
    expect(profilesFromGroups(undefined)).toEqual([]);
  });
});
