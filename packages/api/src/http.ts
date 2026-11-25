/** Errores HTTP, validación y permisos comunes a todas las rutas. */
import type { Context } from 'hono';
import { can, isDomainError, type Permission } from '@modepran/domain';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import { ConflictError } from './repo/types.js';
import { UserExistsError } from './users.js';
import type { AppEnv } from './services.js';

export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 500,
    readonly code: string,
    message: string,
    readonly field?: string,
  ) {
    super(message);
  }
}

export const notFound = (what = 'El recurso') => new ApiError(404, 'not_found', `${what} no existe.`);
export const forbidden = () => new ApiError(403, 'forbidden', 'No tienes permiso para esta acción.');

export function errorResponse(c: Context, err: unknown) {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) } }, err.status);
  }
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return c.json(
      {
        error: {
          code: 'validation',
          message: first ? `${first.path.join('.') || 'cuerpo'}: ${first.message}` : 'Datos no válidos.',
          ...(first?.path.length ? { field: first.path.join('.') } : {}),
          issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      },
      400,
    );
  }
  if (err instanceof ConflictError) return c.json({ error: { code: err.code, message: err.message } }, 409);
  if (err instanceof UserExistsError) return c.json({ error: { code: 'user_exists', message: err.message } }, 409);
  if (isDomainError(err)) {
    const status = err.code.endsWith('_not_found') ? 404 : 422;
    return c.json({ error: { code: err.code, message: err.message, ...(err.field ? { field: err.field } : {}) } }, status);
  }
  // Sin datos personales en los logs: solo el nombre y el mensaje del error.
  console.error('Error no controlado:', err instanceof Error ? `${err.name}: ${err.message}` : String(err));
  return c.json({ error: { code: 'internal', message: 'Error interno.' } }, 500);
}

export async function readBody<O, I = O>(c: Context, schema: ZodType<O, ZodTypeDef, I>): Promise<O> {
  let raw: unknown = {};
  const text = await c.req.text();
  if (text.trim()) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new ApiError(400, 'invalid_json', 'El cuerpo no es JSON válido.');
    }
  }
  return schema.parse(raw);
}

export function readQuery<O, I = O>(c: Context, schema: ZodType<O, ZodTypeDef, I>): O {
  return schema.parse(c.req.query());
}

export function need(c: Context<AppEnv>, ...perms: Permission[]): void {
  const user = c.get('user');
  if (!perms.every((p) => can(user.profiles, p))) throw forbidden();
}

export function needAny(c: Context<AppEnv>, ...perms: Permission[]): void {
  const user = c.get('user');
  if (!perms.some((p) => can(user.profiles, p))) throw forbidden();
}

export function has(c: Context<AppEnv>, perm: Permission): boolean {
  return can(c.get('user').profiles, perm);
}

export function intParam(c: Context, name: string): number {
  const v = c.req.param(name);
  if (!v || !/^\d+$/.test(v)) throw new ApiError(400, 'validation', `Parámetro ${name} no válido.`, name);
  return Number(v);
}
