/**
 * Servidor local de desarrollo: http://localhost:8787/api/… con repositorio en memoria sembrado con datos
 * sintéticos. Auth simulada por cabeceras `x-dev-user` / `x-dev-groups` / `x-dev-name` (SOLO aquí y en tests;
 * la Lambda usa siempre los claims del JWT). Sin cabeceras entra como `dev-admin` (perfil admin).
 *
 * Ficheros: en disco, en `os.tmpdir()/modepran-dev-files` (ver `disk-files.ts`). Sirve `GET`/`PUT /dev-files/*`
 * (las URLs "firmadas" de dev, relativas para que pasen por el proxy de `astro dev`) y `GET /public-files/*`.
 */
import { serve } from '@hono/node-server';
import { createApp } from '../app.js';
import { devHeaderAuth } from '../auth.js';
import { createMemoryRepository } from '../repo/memory.js';
import { createMemoryUserDirectory } from '../users.js';
import { createDiskFileStore } from './disk-files.js';
import { SEED_USERS, seedRepository } from './seed.js';

const port = Number(process.env.PORT ?? 8787);
const repo = createMemoryRepository();
await seedRepository(repo);

const disk = createDiskFileStore();

const api = createApp({
  repo,
  files: disk.store,
  users: createMemoryUserDirectory(SEED_USERS),
  auth: devHeaderAuth({ id: 'dev-admin', name: 'Admin Pruebas', email: 'admin@dev.local', profiles: ['admin'] }),
  logoUrl: '/images/logo.png',
});

const fetch = (req: Request) => {
  const { pathname } = new URL(req.url);
  return pathname.startsWith('/dev-files/') || pathname.startsWith('/public-files/') ? disk.routes.fetch(req) : api.fetch(req);
};

serve({ fetch, port }, (info) => {
  console.log(`API de desarrollo en http://localhost:${info.port}/api (repositorio en memoria, datos sintéticos)`);
  console.log(`Ficheros de desarrollo en ${disk.dir}`);
});
