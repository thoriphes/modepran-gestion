/** Error de regla de negocio. La API lo traduce a `{error: {code, message}}` (400/409). */
export class DomainError extends Error {
  readonly code: string;
  readonly field?: string;

  constructor(code: string, message: string, field?: string) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    if (field !== undefined) this.field = field;
  }
}

export function fail(code: string, message: string, field?: string): never {
  throw new DomainError(code, message, field);
}

export function isDomainError(e: unknown): e is DomainError {
  return e instanceof DomainError;
}
