/**
 * Ficheros de desarrollo en disco (SOLO `dev/server.ts` y tests): imita S3 + CloudFront en local.
 *
 * - `FileStore` con las mismas URLs que `createMemoryFileStore(base)` (`<base>/<clave>?signed=put|get`), pero
 *   `copy` y `delete` actúan de verdad sobre los ficheros.
 * - `routes`: `GET`/`PUT /dev-files/<clave>` (las URLs "firmadas") y `GET /public-files/<clave>` (→
 *   `public/<clave>`, como el origen de CloudFront). Se guarda en `dir` (por defecto `os.tmpdir()/modepran-dev-files`).
 */
import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { Hono, type Context } from 'hono';
import { createMemoryFileStore, type FileStore } from '../files.js';

export const DEV_FILES_DIR = join(tmpdir(), 'modepran-dev-files');

const MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
};

export function createDiskFileStore(opts: { dir?: string; base?: string } = {}) {
  const dir = resolve(opts.dir ?? DEV_FILES_DIR);
  const mem = createMemoryFileStore(opts.base ?? '/dev-files');

  /** Ruta en disco de una clave; `undefined` si se sale de `dir`. */
  function pathOf(key: string): string | undefined {
    const clean = decodeURIComponent(key).replace(/^\/+/, '');
    if (!clean || clean.split('/').includes('..')) return undefined;
    const p = resolve(dir, clean);
    return p.startsWith(dir + sep) ? p : undefined;
  }

  const store: FileStore = {
    uploadUrl: (key, contentType) => mem.uploadUrl(key, contentType),
    downloadUrl: (key, name) => mem.downloadUrl(key, name),
    async copy(from, to) {
      const a = pathOf(from);
      const b = pathOf(to);
      if (!a || !b) return;
      try {
        await mkdir(dirname(b), { recursive: true });
        await copyFile(a, b);
      } catch {
        // como S3: copiar algo que no existe falla, pero aquí no importa
      }
    },
    async delete(key) {
      const p = pathOf(key);
      if (p) await rm(p, { force: true });
    },
  };

  async function serveFile(c: Context, key: string) {
    const p = pathOf(key);
    if (!p) return c.text('Not Found', 404);
    try {
      if (!(await stat(p)).isFile()) return c.text('Not Found', 404);
      const body = await readFile(p);
      const ext = p.split('.').pop()?.toLowerCase() ?? '';
      return c.body(body, 200, { 'content-type': MIME[ext] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    } catch {
      return c.text('Not Found', 404);
    }
  }

  const routes = new Hono();
  // Las URLs de memoria pueden ser absolutas a :8787 (sin pasar por el proxy de Astro): CORS abierto en dev.
  routes.use('/dev-files/*', async (c, next) => {
    c.header('access-control-allow-origin', '*');
    c.header('access-control-allow-methods', 'GET, PUT, OPTIONS');
    c.header('access-control-allow-headers', '*');
    if (c.req.method === 'OPTIONS') return c.body(null, 204);
    return next();
  });
  routes.get('/dev-files/*', (c) => serveFile(c, c.req.path.slice('/dev-files/'.length)));
  routes.put('/dev-files/*', async (c) => {
    const p = pathOf(c.req.path.slice('/dev-files/'.length));
    if (!p) return c.text('Bad Request', 400);
    await mkdir(dirname(p), { recursive: true });
    await writeFile(p, Buffer.from(await c.req.arrayBuffer()));
    return c.body(null, 200);
  });
  routes.get('/public-files/*', (c) => serveFile(c, `public/${c.req.path.slice('/public-files/'.length)}`));

  return { dir, store, routes };
}
