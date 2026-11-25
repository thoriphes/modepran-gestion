/** Usuario de la petición a partir de los claims del JWT (API Gateway) o, solo en dev, de cabeceras. */
import type { Context } from 'hono';
import { profilesFromGroups } from '@modepran/domain';
import type { AuthUser } from './types.js';

/**
 * `cognito:groups` llega como array o, en el authorizer JWT de HTTP API, como texto `"[admin carlet]"`.
 */
export function parseGroups(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') return raw.replace(/[[\]"]/g, ' ').split(/[,\s]+/).filter(Boolean);
  return [];
}

export function userFromClaims(claims: Record<string, unknown> | undefined): AuthUser | null {
  if (!claims || typeof claims.sub !== 'string' || !claims.sub) return null;
  const email = typeof claims.email === 'string' ? claims.email : undefined;
  const name =
    (typeof claims.name === 'string' && claims.name) || email || (typeof claims.username === 'string' && claims.username) || claims.sub;
  return { id: claims.sub, ...(email ? { email } : {}), name, profiles: profilesFromGroups(parseGroups(claims['cognito:groups'])) };
}

/** Auth de Lambda: claims validados por el authorizer JWT de API Gateway. */
export function lambdaAuth(c: Context): AuthUser | null {
  const env = c.env as { event?: { requestContext?: { authorizer?: { jwt?: { claims?: Record<string, unknown> } } } } } | undefined;
  return userFromClaims(env?.event?.requestContext?.authorizer?.jwt?.claims);
}

/** Auth simulada por cabeceras (`x-dev-user`, `x-dev-groups`, `x-dev-name`). SOLO dev y tests. */
export function devHeaderAuth(fallback?: AuthUser) {
  return (c: Context): AuthUser | null => {
    const id = c.req.header('x-dev-user');
    if (!id) return fallback ?? null;
    return {
      id,
      name: c.req.header('x-dev-name') ?? id,
      email: `${id}@dev.local`,
      profiles: profilesFromGroups(parseGroups(c.req.header('x-dev-groups') ?? '')),
    };
  };
}
