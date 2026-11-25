/**
 * Ficheros de la app vieja → claves S3 del spec §8.
 *
 * Origen (`storage/app/public/` de Laravel):
 * - `animals/<id>.jpg` y `animals/<id>_thumb.jpg` (foto 700 px y miniatura 200 px),
 * - `animals/<animalId>/<historyId>.<ext>` (adjuntos de eventos),
 * - `docs/…` (documentos estáticos, p. ej. anexos que se imprimen con los contratos).
 *
 * Destino: `animals/<id>/photo.jpg`, `animals/<id>/thumb.jpg`, `animals/<id>/events/<historyId>.<ext>`
 * y `static/docs/<nombre>`.
 *
 * El índice de ficheros sale del propio `.tar.gz` (lector de cabeceras tar en streaming, sin
 * dependencias), del listado `tar -tvzf` o de una carpeta ya extraída.
 */
import { createReadStream, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, normalize, relative, sep } from 'node:path';
import { createGunzip } from 'node:zlib';
import type { Animal, HistoryEvent } from '@modepran/domain';
import { findEventFile } from './map.js';

/** Prefijo de `storage/app/public` dentro del backup. */
export const DEFAULT_STORAGE_PREFIX = 'public_html/storage/app/public/';

export interface FileEntry {
  /** Ruta relativa a `storage/app/public` (separador `/`). */
  path: string;
  size: number;
}

// ---------------------------------------------------------------------------
// Índices
// ---------------------------------------------------------------------------

/** Quita el prefijo de storage; `undefined` si la ruta no está debajo. */
export function relativeToStorage(path: string, prefix = DEFAULT_STORAGE_PREFIX): string | undefined {
  const p = path.replace(/^\.\//, '');
  if (!p.startsWith(prefix)) return undefined;
  const rel = p.slice(prefix.length);
  return rel === '' ? undefined : rel;
}

/** Interpreta la salida de `tar -tvzf` (`-rw-r--r-- user/group SIZE YYYY-MM-DD HH:MM path`). Solo ficheros. */
export function parseTarListing(listing: string, prefix = DEFAULT_STORAGE_PREFIX): FileEntry[] {
  const out: FileEntry[] = [];
  for (const line of listing.split(/\r?\n/)) {
    const m = /^(\S)\S*\s+\S+\s+(\d+)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}(?::\d{2})?\s+(.+)$/.exec(line);
    if (!m || (m[1] !== '-' && m[1] !== '0')) continue;
    const rel = relativeToStorage(m[3]!, prefix);
    if (rel) out.push({ path: rel, size: Number(m[2]) });
  }
  return out;
}

/** Ficheros de una carpeta (la `storage/app/public` ya extraída). */
export function listStorageDir(root: string): FileEntry[] {
  const out: FileEntry[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) out.push({ path: relative(root, full).split(sep).join('/'), size: st.size });
    }
  };
  walk(root);
  return out;
}

export interface TarReadOptions {
  prefix?: string;
  /** Extrae a esta carpeta los ficheros (rutas relativas a storage) que cumplan `shouldExtract`. */
  extractTo?: string;
  shouldExtract?: (relPath: string) => boolean;
}

/**
 * Lee un `.tar.gz` en streaming: devuelve los ficheros bajo `prefix` y, opcionalmente, extrae algunos.
 * Soporta ustar (prefijo), nombres largos GNU (`L`) y cabeceras pax (`x`, `path=`).
 */
export async function readTarGz(path: string, opts: TarReadOptions = {}): Promise<FileEntry[]> {
  const prefix = opts.prefix ?? DEFAULT_STORAGE_PREFIX;
  const entries: FileEntry[] = [];
  const stream = createReadStream(path).pipe(createGunzip());
  let pending: Buffer = Buffer.alloc(0);
  // Estado: leyendo cabecera, o consumiendo `remaining` bytes de datos (+ relleno).
  let remaining = 0;
  let padding = 0;
  let current: { rel?: string; collect?: Buffer[]; kind: 'file' | 'longname' | 'pax' | 'skip'; data?: Buffer[] } | undefined;
  let longName: string | undefined;
  let paxPath: string | undefined;
  let ended = false;

  const finishEntry = () => {
    if (!current) return;
    if (current.kind === 'longname') longName = Buffer.concat(current.data!).toString('utf8').replace(/\0.*$/s, '');
    else if (current.kind === 'pax') paxPath = parsePax(Buffer.concat(current.data!)).path;
    else if (current.kind === 'file' && current.collect && current.rel && opts.extractTo) {
      const dest = safeJoin(opts.extractTo, current.rel);
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, Buffer.concat(current.collect));
    }
    current = undefined;
  };

  for await (const chunk of stream as AsyncIterable<Buffer>) {
    pending = pending.length ? Buffer.concat([pending, chunk]) : chunk;
    let off = 0;
    for (;;) {
      if (ended) break;
      if (remaining > 0) {
        const take = Math.min(remaining, pending.length - off);
        if (take <= 0) break;
        const piece = pending.subarray(off, off + take);
        if (current?.collect) current.collect.push(Buffer.from(piece));
        if (current?.data) current.data.push(Buffer.from(piece));
        off += take;
        remaining -= take;
        if (remaining > 0) break;
        finishEntry();
      }
      if (padding > 0) {
        const take = Math.min(padding, pending.length - off);
        off += take;
        padding -= take;
        if (padding > 0) break;
      }
      if (pending.length - off < 512) break;
      const header = pending.subarray(off, off + 512);
      off += 512;
      if (header.every((b) => b === 0)) {
        // Bloque vacío: fin del archivo (le sigue otro bloque vacío).
        continue;
      }
      const size = parseTarSize(header.subarray(124, 136));
      const type = String.fromCharCode(header[156] || 48);
      let name = cstr(header.subarray(0, 100));
      const magic = cstr(header.subarray(257, 263));
      if (magic.startsWith('ustar')) {
        const pre = cstr(header.subarray(345, 500));
        if (pre) name = `${pre}/${name}`;
      }
      if (longName) name = longName;
      if (paxPath) name = paxPath;
      remaining = size;
      padding = (512 - (size % 512)) % 512;
      if (type === 'L') current = { kind: 'longname', data: [] };
      else if (type === 'x') current = { kind: 'pax', data: [] };
      else {
        longName = undefined;
        paxPath = undefined;
        if (type === '0' || type === '\0' || type === '7') {
          const rel = relativeToStorage(name, prefix);
          if (rel) {
            entries.push({ path: rel, size });
            current = { kind: 'file', rel };
            if (opts.extractTo && opts.shouldExtract?.(rel)) current.collect = [];
          } else current = { kind: 'skip' };
        } else current = { kind: 'skip' };
      }
      if (remaining === 0) finishEntry();
    }
    pending = off < pending.length ? Buffer.from(pending.subarray(off)) : Buffer.alloc(0);
  }
  return entries;
}

function cstr(b: Buffer): string {
  const i = b.indexOf(0);
  return b.subarray(0, i < 0 ? b.length : i).toString('utf8');
}

function parseTarSize(field: Buffer): number {
  if (field[0]! & 0x80) {
    // Base 256 (GNU) para ficheros enormes.
    let n = 0;
    for (let i = 1; i < field.length; i++) n = n * 256 + field[i]!;
    return n;
  }
  const s = cstr(field).trim();
  return s ? parseInt(s, 8) : 0;
}

function parsePax(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let i = 0;
  const text = buf.toString('utf8');
  while (i < text.length) {
    const sp = text.indexOf(' ', i);
    if (sp < 0) break;
    const len = parseInt(text.slice(i, sp), 10);
    if (!len) break;
    const rec = text.slice(sp + 1, i + len - 1);
    const eq = rec.indexOf('=');
    if (eq > 0) out[rec.slice(0, eq)] = rec.slice(eq + 1);
    i += len;
  }
  return out;
}

/** Une sin dejar escapar de `root` (rutas con `..` o absolutas se rechazan). */
export function safeJoin(root: string, rel: string): string {
  if (isAbsolute(rel) || rel.split(/[\\/]/).includes('..')) throw new Error(`Ruta no permitida en el tar: ${rel}`);
  const full = normalize(join(root, rel));
  if (!full.startsWith(normalize(root))) throw new Error(`Ruta fuera de la carpeta de destino: ${rel}`);
  return full;
}

export function readListingFile(path: string, prefix?: string): FileEntry[] {
  return parseTarListing(readFileSync(path, 'utf8'), prefix);
}

// ---------------------------------------------------------------------------
// Manifiesto
// ---------------------------------------------------------------------------

export type UploadKind = 'photo' | 'thumb' | 'event' | 'static';

export interface Upload {
  /** Ruta relativa a `storage/app/public`. */
  source: string;
  key: string;
  size: number;
  kind: UploadKind;
  contentType: string;
}

export interface FileManifest {
  uploads: Upload[];
  /** Lo que la BBDD dice que existe y no está (ids internos). */
  missing: {
    /** Animales con `photo = 1` sin `<id>.jpg`. */
    photos: number[];
    /** Animales con `photo = 1` sin `<id>_thumb.jpg`. */
    thumbs: number[];
    /** Eventos con documento sin fichero. */
    documents: number[];
  };
  /** Ficheros que no corresponden a nada de la BBDD (no se suben). */
  orphans: {
    /** Fotos de animales que no existen. */
    photosWithoutAnimal: string[];
    /** Fotos de animales con `photo = 0` (no se suben: la ficha dice que no tiene foto). */
    photosWithoutFlag: string[];
    /** Adjuntos de eventos que no existen o sin `doc_name`. */
    eventFilesWithoutEvent: string[];
    /** Rutas con otra forma. */
    other: string[];
  };
  totals: { files: number; bytes: number; byKind: Record<UploadKind, { files: number; bytes: number }> };
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
};

export function contentTypeFor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}

export function buildManifest(
  files: readonly FileEntry[],
  data: { animals: readonly Pick<Animal, 'id' | 'hasPhoto'>[]; events: readonly Pick<HistoryEvent, 'id' | 'animalId' | 'document'>[] },
): FileManifest {
  const bySize = new Map(files.map((f) => [f.path, f.size]));
  const index = new Set(bySize.keys());
  const animals = new Map(data.animals.map((a) => [a.id, a]));
  const uploads: Upload[] = [];
  const missing: FileManifest['missing'] = { photos: [], thumbs: [], documents: [] };
  const orphans: FileManifest['orphans'] = { photosWithoutAnimal: [], photosWithoutFlag: [], eventFilesWithoutEvent: [], other: [] };
  const claimed = new Set<string>();

  for (const a of data.animals) {
    if (!a.hasPhoto) continue;
    const photo = `animals/${a.id}.jpg`;
    const thumb = `animals/${a.id}_thumb.jpg`;
    if (index.has(photo)) {
      uploads.push({ source: photo, key: `animals/${a.id}/photo.jpg`, size: bySize.get(photo)!, kind: 'photo', contentType: 'image/jpeg' });
      claimed.add(photo);
    } else missing.photos.push(a.id);
    if (index.has(thumb)) {
      uploads.push({ source: thumb, key: `animals/${a.id}/thumb.jpg`, size: bySize.get(thumb)!, kind: 'thumb', contentType: 'image/jpeg' });
      claimed.add(thumb);
    } else missing.thumbs.push(a.id);
  }

  for (const e of data.events) {
    if (!e.document) continue;
    const src = findEventFile(index, e.animalId, e.id, e.document.originalName);
    if (!src) {
      missing.documents.push(e.id);
      continue;
    }
    uploads.push({ source: src, key: e.document.key, size: bySize.get(src)!, kind: 'event', contentType: contentTypeFor(e.document.key) });
    claimed.add(src);
  }

  for (const f of files) {
    if (claimed.has(f.path)) continue;
    if (f.path === '.gitignore' || f.path.endsWith('/.gitignore')) continue;
    let m: RegExpExecArray | null;
    if ((m = /^animals\/(\d+)(?:_thumb)?\.jpg$/.exec(f.path))) {
      const a = animals.get(Number(m[1]));
      if (!a) orphans.photosWithoutAnimal.push(f.path);
      else orphans.photosWithoutFlag.push(f.path);
    } else if (/^animals\/\d+\/\d+\.[^/]+$/.test(f.path)) {
      orphans.eventFilesWithoutEvent.push(f.path);
    } else if ((m = /^docs\/([^/]+)$/.exec(f.path))) {
      uploads.push({ source: f.path, key: `static/docs/${m[1]}`, size: f.size, kind: 'static', contentType: contentTypeFor(f.path) });
    } else orphans.other.push(f.path);
  }

  const byKind = { photo: { files: 0, bytes: 0 }, thumb: { files: 0, bytes: 0 }, event: { files: 0, bytes: 0 }, static: { files: 0, bytes: 0 } };
  let bytes = 0;
  for (const u of uploads) {
    byKind[u.kind].files++;
    byKind[u.kind].bytes += u.size;
    bytes += u.size;
  }
  return { uploads, missing, orphans, totals: { files: uploads.length, bytes, byKind } };
}
