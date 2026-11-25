/**
 * Servidor local de desarrollo: http://localhost:8787/api/… con repositorio en memoria sembrado con datos
 * sintéticos. Auth simulada por cabeceras `x-dev-user` / `x-dev-groups` / `x-dev-name` (SOLO aquí y en tests;
 * la Lambda usa siempre los claims del JWT). Sin cabeceras entra como `dev-admin` (perfil admin).
 */
import { serve } from '@hono/node-server';
import { createApp } from '../app.js';
import { devHeaderAuth } from '../auth.js';
import { createMemoryFileStore } from '../files.js';
import { createMemoryRepository } from '../repo/memory.js';
import { createMemoryUserDirectory } from '../users.js';
import { SEED_USERS, seedRepository } from './seed.js';

const port = Number(process.env.PORT ?? 8787);
const repo = createMemoryRepository();
await seedRepository(repo);

const app = createApp({
  repo,
  files: createMemoryFileStore(`http://localhost:${port}/dev-files`),
  users: createMemoryUserDirectory(SEED_USERS),
  auth: devHeaderAuth({ id: 'dev-admin', name: 'Admin Pruebas', email: 'admin@dev.local', profiles: ['admin'] }),
  logoUrl: '/images/logo.png',
});

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API de desarrollo en http://localhost:${info.port}/api (repositorio en memoria, datos sintéticos)`);
});
