/**
 * Login con Cognito managed login (OIDC authorization code + PKCE) vía `oidc-client-ts`.
 * - El usuario (tokens) se guarda en sessionStorage (por pestaña; se pierde al cerrar el navegador).
 * - Se envía el **id token** como Bearer: lo acepta el JWT authorizer de API Gateway (aud = client id) y
 *   lleva `email`, `name` y `cognito:groups`. Si la API prefiere el access token, cambiar `TOKEN_KIND`.
 * - Modo dev: si `config.json` trae `devAuth`, no hay Cognito; la API local recibe `x-dev-user`/`x-dev-groups`.
 *   El usuario simulado se puede cambiar desde la app (Mi cuenta; se guarda en sessionStorage).
 */
import { UserManager, WebStorageStateStore, type User as OidcUser } from 'oidc-client-ts';
import type { Profile } from '@modepran/domain';
import { profilesFromGroups } from '@modepran/domain';
import type { AppConfig } from './config';

const TOKEN_KIND: 'id_token' | 'access_token' = 'id_token';
const DEV_OVERRIDE_KEY = 'modepran-dev-auth';
const RETURN_KEY = 'modepran-return-to';

export interface SessionUser {
  sub: string;
  email?: string;
  name?: string;
  profiles: Profile[];
}

export interface AuthProvider {
  readonly dev: boolean;
  /** Usuario actual o `null` si hay que iniciar sesión. */
  getUser(): Promise<SessionUser | null>;
  /** Cabeceras de autenticación para la API. */
  authHeaders(): Promise<Record<string, string>>;
  login(returnTo?: string): Promise<void>;
  /** Procesa `/app/callback` y devuelve la ruta (dentro de /app) a la que volver. */
  handleCallback(): Promise<string>;
  logout(): Promise<void>;
  /** URL del managed login para cambiar la contraseña (flujo "he olvidado mi contraseña"). */
  passwordUrl(): string | undefined;
  /** Solo dev: cambiar el usuario simulado. */
  setDevUser?(user: string, groups: string[]): void;
}

export function decodeJwtPayload(token: string): Record<string, unknown> {
  const part = token.split('.')[1] ?? '';
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  try {
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function sessionUserFromClaims(claims: Record<string, unknown>): SessionUser {
  const groups = claims['cognito:groups'];
  const out: SessionUser = {
    sub: String(claims.sub ?? ''),
    profiles: profilesFromGroups(Array.isArray(groups) ? (groups as string[]) : typeof groups === 'string' ? groups : []),
  };
  if (typeof claims.email === 'string') out.email = claims.email;
  if (typeof claims.name === 'string') out.name = claims.name;
  return out;
}

function safeSession<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

// ─────────────────────────── Dev ───────────────────────────

function readDevOverride(): { user: string; groups: string[] } | undefined {
  return safeSession(() => {
    const raw = sessionStorage.getItem(DEV_OVERRIDE_KEY);
    return raw ? (JSON.parse(raw) as { user: string; groups: string[] }) : undefined;
  }, undefined);
}

export function createDevAuth(devAuth: NonNullable<AppConfig['devAuth']>): AuthProvider {
  const current = () => readDevOverride() ?? devAuth;
  return {
    dev: true,
    async getUser() {
      const c = current();
      const u: SessionUser = { sub: c.user, name: c.user, profiles: profilesFromGroups(c.groups) };
      if (devAuth.email) u.email = devAuth.email;
      return u;
    },
    async authHeaders() {
      const c = current();
      return { 'x-dev-user': c.user, 'x-dev-groups': c.groups.join(',') };
    },
    async login() {
      /* sin login en dev */
    },
    async handleCallback() {
      return '/';
    },
    async logout() {
      safeSession(() => sessionStorage.removeItem(DEV_OVERRIDE_KEY), undefined);
      window.location.assign('/');
    },
    passwordUrl() {
      return undefined;
    },
    setDevUser(user, groups) {
      safeSession(() => sessionStorage.setItem(DEV_OVERRIDE_KEY, JSON.stringify({ user, groups })), undefined);
    },
  };
}

// ─────────────────────────── Cognito ───────────────────────────

export function createCognitoAuth(config: AppConfig): AuthProvider {
  const origin = window.location.origin;
  const c = config.cognito;
  const redirectUri = origin + c.redirectPath;
  const logoutUri = origin + c.logoutPath;
  const mgr = new UserManager({
    authority: c.authority,
    client_id: c.clientId,
    redirect_uri: redirectUri,
    post_logout_redirect_uri: logoutUri,
    response_type: 'code',
    scope: c.scopes.join(' '),
    userStore: new WebStorageStateStore({ store: window.sessionStorage }),
    automaticSilentRenew: false,
    loadUserInfo: false,
  });

  const valid = (u: OidcUser | null): u is OidcUser => !!u && !u.expired && !!u[TOKEN_KIND];

  return {
    dev: false,
    async getUser() {
      const u = await mgr.getUser();
      if (!valid(u)) return null;
      return sessionUserFromClaims(decodeJwtPayload(u.id_token ?? ''));
    },
    async authHeaders(): Promise<Record<string, string>> {
      const u = await mgr.getUser();
      if (!valid(u)) return {};
      return { authorization: `Bearer ${u[TOKEN_KIND]}` };
    },
    async login(returnTo) {
      safeSession(() => sessionStorage.setItem(RETURN_KEY, returnTo ?? '/'), undefined);
      await mgr.signinRedirect();
    },
    async handleCallback() {
      await mgr.signinRedirectCallback();
      const to = safeSession(() => sessionStorage.getItem(RETURN_KEY), null) ?? '/';
      safeSession(() => sessionStorage.removeItem(RETURN_KEY), undefined);
      return to;
    },
    async logout() {
      await mgr.removeUser();
      // Cognito no publica end_session_endpoint en el discovery: se usa su /logout.
      const q = new URLSearchParams({ client_id: c.clientId, logout_uri: logoutUri });
      window.location.assign(`${c.domain}/logout?${q}`);
    },
    passwordUrl() {
      const q = new URLSearchParams({ client_id: c.clientId, response_type: 'code', scope: c.scopes.join(' '), redirect_uri: redirectUri });
      return `${c.domain}/forgotPassword?${q}`;
    },
  };
}

export function createAuth(config: AppConfig): AuthProvider {
  return config.devAuth ? createDevAuth(config.devAuth) : createCognitoAuth(config);
}
