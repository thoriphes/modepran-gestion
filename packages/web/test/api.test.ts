import { describe, expect, it, vi } from 'vitest';
import { ApiError, buildQuery, createApi } from '../src/lib/api';

function mockFetch(status: number, body?: unknown) {
  return vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
    new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
}

describe('buildQuery', () => {
  it('omite vacíos y une listas', () => {
    expect(buildQuery({ a: 1, b: '', c: undefined, d: null, e: false, f: ['x', 'y'], g: [] })).toBe('?a=1&e=false&f=x%2Cy');
    expect(buildQuery({})).toBe('');
  });
});

describe('createApi', () => {
  it('manda cabeceras de auth y construye la URL', async () => {
    const fetchImpl = mockFetch(200, { items: [], total: 0, page: 1, pageSize: 50, pages: 0 });
    const api = createApi({ baseUrl: '/api/', getHeaders: async () => ({ 'x-dev-user': 'u1', 'x-dev-groups': 'admin' }), fetchImpl });
    await api.animals.list({ name: 'Luna', speciesId: undefined }, 2, 20);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe('/api/animals?name=Luna&page=2&pageSize=20');
    expect((init!.headers as Record<string, string>)['x-dev-user']).toBe('u1');
    expect(init!.method).toBe('GET');
  });

  it('derivaciones: una sola llamada con referred=1', async () => {
    const fetchImpl = mockFetch(200, []);
    const api = createApi({ baseUrl: '/api', getHeaders: async () => ({}), fetchImpl });
    expect(await api.incidents.referred()).toEqual([]);
    expect(fetchImpl.mock.calls).toHaveLength(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('/api/incidents?referred=1');
  });

  it('envía JSON en POST', async () => {
    const fetchImpl = mockFetch(200, { id: 'x' });
    const api = createApi({ baseUrl: '/api', getHeaders: async () => ({ authorization: 'Bearer t' }), fetchImpl });
    await api.incidents.start('abc');
    const [, init] = fetchImpl.mock.calls[0]!;
    expect(init!.method).toBe('POST');
    expect((init!.headers as Record<string, string>)['content-type']).toBe('application/json');
    expect((init!.headers as Record<string, string>).authorization).toBe('Bearer t');
  });

  it('convierte {error:{code,message}} en ApiError', async () => {
    const api = createApi({ baseUrl: '/api', getHeaders: async () => ({}), fetchImpl: mockFetch(409, { error: { code: 'chip_taken', message: 'Chip repetido', field: 'chip' } }) });
    const err = await api.animals.get(1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'chip_taken', message: 'Chip repetido', field: 'chip' });
  });

  it('401 llama a onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    const api = createApi({ baseUrl: '/api', getHeaders: async () => ({}), fetchImpl: mockFetch(401), onUnauthorized });
    await expect(api.me()).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('204 devuelve undefined', async () => {
    const api = createApi({ baseUrl: '/api', getHeaders: async () => ({}), fetchImpl: mockFetch(204) });
    await expect(api.animals.remove(5)).resolves.toBeUndefined();
  });

  it('error de red → ApiError network', async () => {
    const api = createApi({
      baseUrl: '/api',
      getHeaders: async () => ({}),
      fetchImpl: vi.fn(async () => {
        throw new TypeError('fail');
      }),
    });
    await expect(api.me()).rejects.toMatchObject({ code: 'network' });
  });
});
