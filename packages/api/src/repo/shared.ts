/** Utilidades comunes a los dos repositorios. */
import { normalizeNif, type Animal, type Contact } from '@modepran/domain';
import type { BulkImportData, BulkImportResult, CounterName } from './types.js';

/** Clave normalizada del chip (sin espacios). */
export function chipKey(chip: string | undefined | null): string | undefined {
  const v = chip?.replace(/\s/g, '');
  return v ? v : undefined;
}

export function maxIds(data: BulkImportData): Record<CounterName, number> {
  const max = (xs: readonly { id: number }[] | undefined) => (xs ?? []).reduce((m, x) => Math.max(m, x.id), 0);
  return { animal: max(data.animals), event: max(data.events), contact: max(data.contacts) };
}

export function collectDuplicates(animals: readonly Animal[], contacts: readonly Contact[]): BulkImportResult['duplicates'] {
  const out: BulkImportResult['duplicates'] = [];
  const group = <T extends { id: number }>(items: readonly T[], key: (x: T) => string | undefined, kind: 'chip' | 'nif') => {
    const m = new Map<string, number[]>();
    for (const x of items) {
      const k = key(x);
      if (!k) continue;
      const list = m.get(k) ?? [];
      list.push(x.id);
      m.set(k, list);
    }
    for (const [value, ids] of m) if (ids.length > 1) out.push({ kind, value, ids });
  };
  group(animals, (a) => chipKey(a.chip?.number), 'chip');
  group(contacts, (c) => normalizeNif(c.nif), 'nif');
  return out;
}
