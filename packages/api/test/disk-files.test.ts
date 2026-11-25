import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDiskFileStore } from '../src/dev/disk-files.js';

describe('ficheros de dev en disco', () => {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  });

  it('PUT y GET en /dev-files, copia a público y borrado', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'modepran-test-'));
    dirs.push(dir);
    const { store, routes } = createDiskFileStore({ dir });
    const put = await store.uploadUrl('animals/5/photo.jpg', 'image/jpeg');
    expect(put).toBe('/dev-files/animals/5/photo.jpg?signed=put');
    expect((await routes.request(put, { method: 'PUT', body: 'JPEGDATA', headers: { 'content-type': 'image/jpeg' } })).status).toBe(200);
    const get = await routes.request(await store.downloadUrl('animals/5/photo.jpg'));
    expect(get.status).toBe(200);
    expect(get.headers.get('content-type')).toBe('image/jpeg');
    expect(await get.text()).toBe('JPEGDATA');
    await store.copy('animals/5/photo.jpg', 'public/animals/5.jpg');
    expect(await (await routes.request('/public-files/animals/5.jpg')).text()).toBe('JPEGDATA');
    await store.delete('public/animals/5.jpg');
    expect((await routes.request('/public-files/animals/5.jpg')).status).toBe(404);
    expect((await routes.request('/dev-files/no/existe.jpg')).status).toBe(404);
    expect((await routes.request('/dev-files/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);
  });
});
