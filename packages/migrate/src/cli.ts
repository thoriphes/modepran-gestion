/**
 * CLI de la migración: `npm run migrate -w @modepran/migrate -- <comando> [opciones]`.
 *
 *   parse  --dump <sql.gz> --out <dir> [--tar-list <txt> | --tar <tar.gz> | --storage <dir>]
 *   files  --out <dir> (--tar <tar.gz> | --tar-list <txt> | --storage <dir>) [--extract <dir>]
 *   verify --out <dir>
 *   load   --out <dir> --table <name> --bucket <name> --profile <p> --region <r>
 *          [--dry-run] [--storage <dir>] [--skip-db] [--skip-files] [--concurrency 8]
 *
 * `--out` (y `--extract`) tienen que estar FUERA del repo y de cualquier carpeta sincronizada (Nextcloud):
 * contienen datos personales reales. El CLI se niega si no.
 *
 * `load` usa `createDynamoRepository({ tableName }).bulkImport(...)` de `@modepran/api` (import dinámico) y
 * sube los ficheros del manifiesto con `@aws-sdk/client-s3`. Antes de escribir comprueba con
 * `aws sts get-caller-identity` que la cuenta es la de Modepran.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildManifest, listStorageDir, readListingFile, readTarGz, safeJoin, type FileEntry, type FileManifest } from './files.js';
import { DISCARDED_TABLES, mapSource, MIGRATED_TABLES, type MigrationResult, type SourceTables } from './map.js';
import { readDumpFile } from './sql-parser.js';
import { computeSourceStats, formatReport, verifyMigration, type SourceStats } from './verify.js';

export const EXPECTED_ACCOUNT = '632115809125';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

type Args = { _: string[]; [k: string]: string | boolean | string[] };

export function parseArgs(argv: string[]): Args {
  const out: Args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) out[k] = true;
      else {
        out[k] = next;
        i++;
      }
    } else out._.push(a);
  }
  return out;
}

function opt(args: Args, k: string): string | undefined {
  const v = args[k];
  return typeof v === 'string' ? v : undefined;
}

function req(args: Args, k: string): string {
  const v = opt(args, k);
  if (!v) throw new Error(`Falta --${k}`);
  return v;
}

function real(p: string): string {
  try {
    return realpathSync.native(p);
  } catch {
    return resolve(p);
  }
}

/** Carpeta de salida: se crea, y tiene que estar fuera del repo y de Nextcloud. */
export function safeOutDir(p: string): string {
  // Ruta real del antepasado que exista (resuelve nombres cortos de Windows y enlaces) + el resto.
  let base = resolve(p);
  const rest: string[] = [];
  while (!existsSync(base) && dirname(base) !== base) {
    rest.unshift(basename(base));
    base = dirname(base);
  }
  const full = join(real(base), ...rest).toLowerCase().replace(/\\/g, '/');
  const repo = real(REPO_ROOT).toLowerCase().replace(/\\/g, '/');
  if (full === repo || full.startsWith(`${repo}/`)) throw new Error(`La carpeta ${p} está dentro del repo: los datos reales no pueden ir ahí.`);
  if (/\/nextcloud(\/|$)/.test(full)) throw new Error(`La carpeta ${p} está dentro de Nextcloud: los datos reales no pueden ir ahí.`);
  mkdirSync(p, { recursive: true });
  return p;
}

function writeJson(dir: string, name: string, data: unknown): void {
  writeFileSync(join(dir, name), JSON.stringify(data));
}

function readJson<T>(dir: string, name: string): T {
  const p = join(dir, name);
  if (!existsSync(p)) throw new Error(`No existe ${name} en --out (ejecuta antes "parse").`);
  return JSON.parse(readFileSync(p, 'utf8')) as T;
}

async function fileIndexFrom(args: Args): Promise<FileEntry[] | undefined> {
  const list = opt(args, 'tar-list');
  const storage = opt(args, 'storage');
  const tar = opt(args, 'tar');
  if (list) return readListingFile(list);
  if (storage) return listStorageDir(storage);
  if (tar) return readTarGz(tar);
  return undefined;
}

function loadResult(out: string): MigrationResult {
  return {
    catalogs: readJson(out, 'catalogs.json'),
    staff: readJson(out, 'staff.json'),
    animals: readJson(out, 'animals.json'),
    events: readJson(out, 'events.json'),
    contacts: readJson(out, 'contacts.json'),
    templates: readJson(out, 'templates.json'),
    counters: readJson(out, 'counters.json'),
    duplicateNifGroups: readJson(out, 'duplicate-nif-groups.json'),
    issues: readJson(out, 'issues.json'),
  };
}

// ---------------------------------------------------------------------------
// Comandos
// ---------------------------------------------------------------------------

async function cmdParse(args: Args): Promise<void> {
  const dump = req(args, 'dump');
  const out = safeOutDir(req(args, 'out'));
  const t0 = Date.now();
  const parsed = await readDumpFile(dump, MIGRATED_TABLES);
  const src: SourceTables = {};
  const rowCounts: Record<string, number> = {};
  const autoIncrement: Record<string, number | undefined> = {};
  for (const [table, t] of parsed) {
    rowCounts[table] = t.rowCount;
    autoIncrement[table] = t.schema?.autoIncrement;
    if ((MIGRATED_TABLES as readonly string[]).includes(table)) src[table] = t.rows;
  }
  const unknown = Object.keys(rowCounts).filter(
    (t) => !(MIGRATED_TABLES as readonly string[]).includes(t) && !(DISCARDED_TABLES as readonly string[]).includes(t),
  );
  const files = await fileIndexFrom(args);
  if (!files) console.warn('Aviso: sin --tar-list/--tar/--storage no se comprueba que existan los adjuntos.');
  const result = mapSource(src, { autoIncrement, ...(files ? { fileIndex: new Set(files.map((f) => f.path)) } : {}) });
  const stats = computeSourceStats(src, rowCounts);

  writeJson(out, 'catalogs.json', result.catalogs);
  writeJson(out, 'staff.json', result.staff);
  writeJson(out, 'animals.json', result.animals);
  writeJson(out, 'events.json', result.events);
  writeJson(out, 'contacts.json', result.contacts);
  writeJson(out, 'templates.json', result.templates);
  writeJson(out, 'counters.json', result.counters);
  writeJson(out, 'duplicate-nif-groups.json', result.duplicateNifGroups);
  writeJson(out, 'issues.json', result.issues);
  writeJson(out, 'source-stats.json', stats);
  if (files) writeJson(out, 'file-index.json', files);

  console.log(`parse: ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log(
    `  animales ${result.animals.length}, eventos ${result.events.length}, contactos ${result.contacts.length}, ` +
      `chips ${result.animals.filter((a) => a.chip).length}, personal ${result.staff.length}, plantillas ${result.templates.length}`,
  );
  console.log(`  estados ${result.catalogs.statuses.length}, subtipos ${result.catalogs.subtypes.length}`);
  if (unknown.length) console.log(`  tablas no previstas (no se migran): ${unknown.join(', ')}`);
  console.log(`  incidencias del mapeo: ${Object.entries(result.issues).map(([k, v]) => `${k}=${v.count}`).join(', ') || 'ninguna'}`);
}

async function cmdFiles(args: Args): Promise<void> {
  const out = safeOutDir(req(args, 'out'));
  const animals = readJson<MigrationResult['animals']>(out, 'animals.json');
  const events = readJson<MigrationResult['events']>(out, 'events.json');
  const extract = opt(args, 'extract');
  let files: FileEntry[];
  if (extract) {
    const tar = req(args, 'tar');
    safeOutDir(extract);
    // Primero el índice (del listado si se da, para saber qué extraer), luego una pasada extrayendo.
    const index = opt(args, 'tar-list') ? readListingFile(req(args, 'tar-list')) : await readTarGz(tar);
    const wanted = new Set(buildManifest(index, { animals, events }).uploads.map((u) => u.source));
    files = await readTarGz(tar, { extractTo: extract, shouldExtract: (p) => wanted.has(p) });
    console.log(`files: extraídos ${wanted.size} ficheros en ${extract}`);
  } else {
    const idx = await fileIndexFrom(args);
    if (!idx) throw new Error('Falta --tar, --tar-list o --storage');
    files = idx;
  }
  const manifest = buildManifest(files, { animals, events });
  writeJson(out, 'files-manifest.json', manifest);
  const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)} MB`;
  console.log(`files: ${manifest.totals.files} a subir (${mb(manifest.totals.bytes)})`);
  for (const [k, v] of Object.entries(manifest.totals.byKind)) console.log(`  ${k}: ${v.files} (${mb(v.bytes)})`);
  console.log(`  ausentes: ${Object.entries(manifest.missing).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
  console.log(`  huérfanos: ${Object.entries(manifest.orphans).map(([k, v]) => `${k} ${v.length}`).join(', ')}`);
}

async function cmdVerify(args: Args): Promise<boolean> {
  const out = safeOutDir(req(args, 'out'));
  const stats = readJson<SourceStats>(out, 'source-stats.json');
  const result = loadResult(out);
  const manifest = existsSync(join(out, 'files-manifest.json')) ? readJson<FileManifest>(out, 'files-manifest.json') : undefined;
  const report = verifyMigration(stats, result, manifest);
  writeJson(out, 'verify-report.json', report);
  const md = formatReport(report);
  writeFileSync(join(out, 'verify-report.md'), md);
  console.log(md);
  return report.ok;
}

async function cmdLoad(args: Args): Promise<void> {
  const out = safeOutDir(req(args, 'out'));
  const tableName = req(args, 'table');
  const bucket = req(args, 'bucket');
  const profile = req(args, 'profile');
  const region = req(args, 'region');
  const dryRun = args['dry-run'] === true;
  const skipDb = args['skip-db'] === true;
  const skipFiles = args['skip-files'] === true;
  const storage = opt(args, 'storage');
  const concurrency = Number(opt(args, 'concurrency') ?? 8);
  const result = loadResult(out);
  const manifest = skipFiles ? undefined : readJson<FileManifest>(out, 'files-manifest.json');
  if (manifest && !storage && !dryRun) throw new Error('Para subir ficheros hace falta --storage <carpeta extraída> (ver "files --extract").');

  const data = {
    catalogs: result.catalogs,
    animals: result.animals,
    events: result.events,
    contacts: result.contacts,
    staff: result.staff,
    templates: result.templates,
  };
  console.log(`load${dryRun ? ' (dry-run)' : ''}: tabla ${tableName}, bucket ${bucket}, región ${region}, perfil ${profile}`);
  console.log(
    `  DynamoDB: ${Object.values(result.catalogs).reduce((n, l) => n + l.length, 0)} items de catálogo, ${result.staff.length} personal, ` +
      `${result.animals.length} animales, ${result.events.length} eventos, ${result.contacts.length} contactos, ${result.templates.length} plantillas${skipDb ? ' (se salta)' : ''}`,
  );
  if (manifest) console.log(`  S3: ${manifest.uploads.length} ficheros (${(manifest.totals.bytes / 1024 / 1024).toFixed(1)} MB)`);
  if (dryRun) {
    if (manifest && storage) {
      const absent = manifest.uploads.filter((u) => !existsSync(join(storage, u.source))).length;
      console.log(`  ficheros del manifiesto que faltan en --storage: ${absent}`);
    }
    console.log('  dry-run: no se ha escrito nada.');
    return;
  }

  // Cuenta correcta antes de escribir (CLAUDE.md).
  const identity = JSON.parse(execFileSync('aws', ['sts', 'get-caller-identity', '--profile', profile, '--output', 'json'], { encoding: 'utf8' })) as {
    Account: string;
  };
  const expected = opt(args, 'account') ?? EXPECTED_ACCOUNT;
  if (identity.Account !== expected) throw new Error(`La cuenta del perfil ${profile} es ${identity.Account}, no ${expected}. No se escribe nada.`);
  process.env.AWS_PROFILE = profile;
  process.env.AWS_REGION = region;

  if (!skipDb) {
    // Import dinámico: el repositorio DynamoDB vive en @modepran/api (`createDynamoRepository`).
    // Se prueba el índice del paquete y, si aún no lo reexporta, el módulo del repositorio directamente.
    type Create = (o: { tableName: string; region?: string }) => { bulkImport(d: typeof data): Promise<Record<string, unknown>> };
    const specs = opt(args, 'repo-module') ? [opt(args, 'repo-module')!] : ['@modepran/api', '@modepran/api/src/repo/dynamo.ts'];
    let create: Create | undefined;
    for (const spec of specs) {
      const mod = (await import(spec).catch(() => ({}))) as Record<string, unknown>;
      if (typeof mod.createDynamoRepository === 'function') {
        create = mod.createDynamoRepository as Create;
        break;
      }
    }
    if (!create) throw new Error(`Ninguno de ${specs.join(', ')} exporta createDynamoRepository({ tableName }).`);
    const repo = create({ tableName, region });
    const r = await repo.bulkImport(data);
    const dups = (r.duplicates as { kind: string; ids: number[] }[] | undefined) ?? [];
    // Sin valores de chip/NIF en la salida: solo recuentos.
    console.log(
      `  bulkImport: catálogos ${r.catalogs}, animales ${r.animals}, eventos ${r.events}, contactos ${r.contacts}, personal ${r.staff}, ` +
        `plantillas ${r.templates}, guardianes ${r.guards}, duplicados chip ${dups.filter((d) => d.kind === 'chip').length} / NIF ${dups.filter((d) => d.kind === 'nif').length}`,
    );
    console.log(`  contadores: ${JSON.stringify(r.counters)}`);
  }

  if (manifest && storage) {
    const { S3Client, PutObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
    const s3 = new S3Client({ region });
    let done = 0;
    let skipped = 0;
    let failed = 0;
    const queue = [...manifest.uploads];
    const worker = async () => {
      for (let u = queue.shift(); u; u = queue.shift()) {
        const path = safeJoin(storage, u.source);
        try {
          const size = statSync(path).size;
          // Idempotente: si ya está con el mismo tamaño, no se vuelve a subir.
          const head = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: u.key })).catch(() => undefined);
          if (head && head.ContentLength === size) {
            skipped++;
            continue;
          }
          await s3.send(new PutObjectCommand({ Bucket: bucket, Key: u.key, Body: readFileSync(path), ContentType: u.contentType }));
          done++;
        } catch (e) {
          failed++;
          console.error(`  error subiendo ${u.key}: ${(e as Error).name}`);
        }
        if ((done + skipped + failed) % 500 === 0) console.log(`  … ${done + skipped + failed}/${manifest.uploads.length}`);
      }
    };
    await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
    console.log(`  S3: subidos ${done}, ya estaban ${skipped}, errores ${failed}`);
    if (failed) process.exitCode = 1;
  }
}

const HELP = `Uso: npm run migrate -w @modepran/migrate -- <comando> [opciones]

  parse  --dump <sql.gz> --out <dir> [--tar-list <txt> | --tar <tar.gz> | --storage <dir>]
  files  --out <dir> (--tar <tar.gz> | --tar-list <txt> | --storage <dir>) [--extract <dir>]
  verify --out <dir>
  load   --out <dir> --table <name> --bucket <name> --profile <p> --region <r>
         [--dry-run] [--storage <dir>] [--skip-db] [--skip-files] [--concurrency 8]

--out y --extract tienen que estar fuera del repo y de Nextcloud (datos personales reales).`;

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  const cmd = args._[0];
  switch (cmd) {
    case 'parse':
      await cmdParse(args);
      return 0;
    case 'files':
      await cmdFiles(args);
      return 0;
    case 'verify':
      return (await cmdVerify(args)) ? 0 : 2;
    case 'load':
      await cmdLoad(args);
      return Number(process.exitCode ?? 0);
    default:
      console.log(HELP);
      return cmd ? 1 : 0;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (e: unknown) => {
      console.error(`Error: ${(e as Error).message}`);
      process.exit(1);
    },
  );
}
