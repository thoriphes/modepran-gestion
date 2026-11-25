import { DEFAULT_SUBTYPES } from '@modepran/domain';
import { describe, expect, it } from 'vitest';
import { operationalDefaults, planOperationalSeed } from '../src/operational.js';

describe('seed-operational', () => {
  it('valores por defecto de la beta: zonas por especie, tipos de cita con color, categorías', () => {
    const d = operationalDefaults({ subtypes: DEFAULT_SUBTYPES });
    expect(d.areas.filter((a) => a.species[0] === 'perros').map((a) => a.name)).toContain('Campo Nuevo - Fase 3');
    expect(d.areas.filter((a) => a.species[0] === 'gatos').map((a) => a.name)).toContain('Inmuno');
    expect(d.areas).toHaveLength(18);
    expect(new Set(d.areas.map((a) => a.id)).size).toBe(18);
    expect(d.appointmentTypes.every((t) => /^#[0-9a-f]{6}$/.test(t.color))).toBe(true);
    expect(d.actionCategories.map((c) => c.name)).toEqual(['Vacuna', 'Pruebas', 'Cirugía', 'Otros']);
    const vetIds = new Set(DEFAULT_SUBTYPES.filter((s) => s.typeId === 'veterinario').map((s) => s.id));
    for (const c of d.actionCategories) {
      if (c.vetSubtypeId) expect(vetIds.has(c.vetSubtypeId)).toBe(true);
      for (const s of c.subcategories) if (s.vetSubtypeId) expect(vetIds.has(s.vetSubtypeId)).toBe(true);
    }
    expect(d.actionCategories.find((c) => c.name === 'Cirugía')!.subcategories.find((s) => s.name === 'Esterilización')!.vetSubtypeId).toBe('esterilizado');
  });

  it('vetSubtypeId solo si el subtipo existe; vacunas del catálogo como subcategorías', () => {
    const d = operationalDefaults({
      subtypes: [{ id: 'test', typeId: 'veterinario' }],
      vaccines: [
        { id: 'v1', name: 'Rabia', active: true },
        { id: 'v2', name: 'Vieja', active: false },
      ],
    });
    expect(d.actionCategories.find((c) => c.name === 'Pruebas')!.vetSubtypeId).toBe('test');
    expect(d.actionCategories.find((c) => c.name === 'Cirugía')!.vetSubtypeId).toBeUndefined();
    expect(d.actionCategories.find((c) => c.name === 'Vacuna')!.subcategories.map((s) => s.name)).toEqual(['Rabia']);
  });

  it('idempotente: no inserta lo que ya existe por id o por nombre', () => {
    const first = planOperationalSeed({});
    expect(first.insert.areas).toHaveLength(18);
    expect(first.insert.appointmentTypes).toHaveLength(3);
    expect(first.insert.actionCategories).toHaveLength(4);
    const again = planOperationalSeed({
      ...first.insert,
      appointmentTypes: [{ id: 'otro', name: 'CIRUGIA', color: '#000000', active: false }],
    });
    expect(again.insert.areas).toHaveLength(0);
    expect(again.insert.actionCategories).toHaveLength(0);
    expect(again.insert.appointmentTypes.map((t) => t.name)).toEqual(['Consultas generales', 'Gestión veterinaria / clínica']);
    expect(again.skipped.find((s) => s.type === 'appointmentTypes')!.reason).toBe('name');
  });
});
