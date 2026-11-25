/** Utilidades de test: app con repositorio en memoria sembrado y peticiones con perfil. */
import { createApp } from '../src/app.js';
import { devHeaderAuth } from '../src/auth.js';
import { createMemoryFileStore } from '../src/files.js';
import { createMemoryRepository } from '../src/repo/memory.js';
import { createMemoryUserDirectory } from '../src/users.js';
import { SEED_USERS, seedRepository } from '../src/dev/seed.js';

export const NOW = new Date('2026-06-15T10:00:00.000Z');
export const TODAY = '2026-06-15';

export type As = 'admin' | 'carlet' | 'modevet' | 'bienestar' | 'anon';

export async function setup() {
  const repo = createMemoryRepository();
  const data = await seedRepository(repo, NOW);
  const files = createMemoryFileStore();
  // Las fotos sembradas existen en el "bucket".
  for (const a of data.animals ?? []) if (a.hasPhoto) files.objects.add(`animals/${a.id}/photo.jpg`);
  const users = createMemoryUserDirectory(SEED_USERS);
  let n = 0;
  const app = createApp({ repo, files, users, auth: devHeaderAuth(), clock: () => NOW, newId: () => `id-${++n}`, cacheTtlMs: 0 });

  async function req<T = any>(method: string, path: string, opts: { as?: As; body?: unknown } = {}) {
    const as = opts.as ?? 'admin';
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (as !== 'anon') {
      headers['x-dev-user'] = `dev-${as}`;
      headers['x-dev-groups'] = as;
    }
    const res = await app.request(`/api${path}`, {
      method,
      headers,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    });
    const text = await res.text();
    let json: T;
    try {
      json = (text ? JSON.parse(text) : undefined) as T;
    } catch {
      json = text as T;
    }
    return { status: res.status, body: json, headers: res.headers };
  }

  return { app, repo, files, users, data, req };
}

export const arrival = (over: Record<string, unknown> = {}) => ({
  subtypeId: 'aviso',
  userId: 's-cui1',
  centerId: 'valencia',
  cityName: 'pueblo   NUEVO',
  address: 'Calle Inventada 3',
  zip: '46001',
  collectionDate: '2026-06-10',
  contact: { contactId: 1 },
  ...over,
});

export const newAnimal = (over: Record<string, unknown> = {}) => ({
  name: 'Prueba',
  speciesId: 'perro',
  gender: 'male',
  sterilized: false,
  ppp: false,
  visibleWeb: false,
  compatibleDogs: true,
  compatibleCats: false,
  ...over,
});
