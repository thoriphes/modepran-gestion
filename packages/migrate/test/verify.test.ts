import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { safeOutDir } from '../src/cli.js';
import { buildManifest, readTarGz } from '../src/files.js';
import { mapSource, MIGRATED_TABLES, type MigrationResult, type SourceTables } from '../src/map.js';
import { parseDumpText } from '../src/sql-parser.js';
import { computeSourceStats, formatReport, verifyMigration } from '../src/verify.js';
import { FIXTURE_FILES, fixtureDump, type FixtureOptions } from './fixtures.js';

function run(opts: FixtureOptions = {}, mutate?: (r: MigrationResult) => void) {
  const parsed = parseDumpText(fixtureDump(opts), MIGRATED_TABLES);
  const src: SourceTables = {};
  const counts: Record<string, number> = {};
  for (const [t, v] of parsed) {
    src[t] = v.rows;
    counts[t] = v.rowCount;
  }
  const result = mapSource(src, { fileIndex: new Set(FIXTURE_FILES.map((f) => f.path)) });
  mutate?.(result);
  const stats = computeSourceStats(src, counts);
  const manifest = buildManifest(FIXTURE_FILES, result);
  return { stats, result, report: verifyMigration(stats, result, manifest) };
}

const check = (r: ReturnType<typeof run>['report'], code: string) => r.checks.find((c) => c.code === code)!;

describe('verifyMigration', () => {
  it('cuadra los recuentos del volcado sintético', () => {
    const { report, stats } = run();
    expect(stats.tables.history_census).toBe(1);
    expect(report.tables.find((t) => t.key === 'history_census')).toMatchObject({ source: 1, result: 0, ok: true });
    expect(report.tables.find((t) => t.key === 'animals')).toMatchObject({ source: 3, result: 3, ok: true });
    expect(report.tables.find((t) => t.key === 'animals_history')).toMatchObject({ source: 8, result: 8, ok: true });
    expect(report.animalsByStatus.every((c) => c.ok)).toBe(true);
    expect(report.animalsByStatus.find((c) => c.key === 'adoptado')).toMatchObject({ source: 2, result: 2 });
    expect(report.eventsBySubtype.find((c) => c.key === 'esterilizado')).toBeUndefined();
    expect(report.eventsByType.find((c) => c.key === 'veterinario')).toMatchObject({ source: 3, result: 3 });
    expect(report.animalsByCenter.find((c) => c.key === 'valencia')).toMatchObject({ source: 2, result: 2 });
    expect(report.ok).toBe(true);
  });

  it('detecta anomalías: NIF duplicado, chip sin animal, estado que no cuadra, miniatura ausente', () => {
    const { report } = run();
    expect(check(report, 'nif_duplicados')).toMatchObject({ count: 1, level: 'warning', sampleIds: [2] });
    // 103: llegada y veterinario, estado guardado Adoptado → no cuadra con el historial.
    expect(check(report, 'estado_no_cuadra_con_historial')).toMatchObject({ count: 1, sampleIds: [103] });
    expect(check(report, 'contactos_sin_datos').count).toBe(1);
    expect(report.files?.missing).toEqual({ photos: 0, thumbs: 1, documents: 0 });
    expect(report.files?.orphans.photosWithoutAnimal).toBe(1);
  });

  it('falla si se pierden filas o hay referencias rotas', () => {
    const lost = run({}, (r) => r.events.pop());
    expect(lost.report.ok).toBe(false);
    expect(lost.report.tables.find((t) => t.key === 'animals_history')!.ok).toBe(false);

    const broken = run({}, (r) => {
      r.events[0]!.animalId = 4242;
      r.events[1]!.contactId = 4343;
    });
    expect(check(broken.report, 'eventos_sin_animal').count).toBe(1);
    expect(check(broken.report, 'eventos_contacto_inexistente').count).toBe(1);
    expect(broken.report.ok).toBe(false);

    const dupChip = run({}, (r) => {
      r.animals[1]!.chip = { number: r.animals[0]!.chip!.number };
    });
    expect(check(dupChip.report, 'chips_duplicados').count).toBe(1);
    expect(dupChip.report.ok).toBe(false);
  });

  it('el informe no contiene datos personales', () => {
    const { report } = run();
    const text = JSON.stringify(report) + formatReport(report);
    for (const personal of ['Ana', 'Beto', 'Ejemplo', 'Prueba', '00000000T', '600000000', 'example.test', 'Calle', 'Persona', 'Bobi', 'Dueño Tmp', '941000000000001']) {
      expect(text, personal).not.toContain(personal);
    }
    expect(formatReport(report)).toContain('Resultado: **OK**');
  });
});

// ---------------------------------------------------------------------------
// Tar y CLI
// ---------------------------------------------------------------------------

function tarHeader(name: string, size: number, type = '0', prefix = ''): Buffer {
  const h = Buffer.alloc(512);
  h.write(name, 0, 100, 'utf8');
  h.write('0000644\0', 100);
  h.write('0000000\0', 108);
  h.write('0000000\0', 116);
  h.write(size.toString(8).padStart(11, '0') + '\0', 124);
  h.write('00000000000\0', 136);
  h.write('        ', 148);
  h.write(type, 156);
  h.write('ustar\0', 257);
  h.write('00', 263);
  if (prefix) h.write(prefix, 345, 155, 'utf8');
  let sum = 0;
  for (const b of h) sum += b;
  h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
  return h;
}

function tarEntry(name: string, data: Buffer, type = '0', prefix = ''): Buffer {
  const pad = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([tarHeader(name, data.length, type, prefix), data, pad]);
}

describe('readTarGz', () => {
  it('lista y extrae ficheros (ustar con prefijo y nombre largo GNU)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'migrate-test-'));
    const long = 'public_html/storage/app/public/animals/12/' + '9'.repeat(120) + '.pdf';
    const tar = Buffer.concat([
      tarEntry('public_html/storage/app/public/animals/', Buffer.alloc(0), '5'),
      tarEntry('public_html/storage/app/public/animals/12.jpg', Buffer.from('foto')),
      tarEntry('12_thumb.jpg', Buffer.from('mini'), '0', 'public_html/storage/app/public/animals'),
      tarEntry('././@LongLink', Buffer.from(long + '\0'), 'L'),
      tarEntry(long.slice(0, 99), Buffer.alloc(700, 7)),
      tarEntry('public_html/otra/cosa.txt', Buffer.from('x')),
      Buffer.alloc(1024),
    ]);
    const path = join(dir, 'b.tar.gz');
    writeFileSync(path, gzipSync(tar));
    const out = join(dir, 'x');
    const entries = await readTarGz(path, { extractTo: out, shouldExtract: (p) => p.endsWith('.jpg') });
    expect(entries.map((e) => [e.path, e.size])).toEqual([
      ['animals/12.jpg', 4],
      ['animals/12_thumb.jpg', 4],
      [long.replace('public_html/storage/app/public/', ''), 700],
    ]);
    expect(readFileSync(join(out, 'animals/12.jpg'), 'utf8')).toBe('foto');
    expect(readFileSync(join(out, 'animals/12_thumb.jpg'), 'utf8')).toBe('mini');
  });
});

describe('safeOutDir', () => {
  it('rechaza carpetas dentro del repo o de Nextcloud', () => {
    expect(() => safeOutDir(join(__dirname, 'tmp-out-should-fail'))).toThrow(/repo|Nextcloud/);
    const ok = mkdtempSync(join(tmpdir(), 'migrate-out-'));
    expect(safeOutDir(ok)).toBe(ok);
  });
});
