/**
 * `/config.json` (lo escribe CDK en producción; en `astro dev` lo sirve `dev/config.json`).
 * Formato: packages/infra/lib/modepran-stack.ts → "config.json de la web".
 */
export interface AppConfig {
  region: string;
  appOrigin: string;
  apiBaseUrl: string;
  publicFilesBaseUrl: string;
  cognito: {
    userPoolId: string;
    clientId: string;
    authority: string;
    domain: string;
    redirectPath: string;
    logoutPath: string;
    scopes: string[];
  };
  /** Solo desarrollo: sin Cognito, la API local lee estas cabeceras (`x-dev-user`, `x-dev-groups`). */
  devAuth?: { user: string; groups: string[]; name?: string; email?: string };
}

let cached: Promise<AppConfig> | undefined;

export function loadConfig(fetchImpl: typeof fetch = fetch): Promise<AppConfig> {
  cached ??= fetchImpl('/config.json', { cache: 'no-store' }).then(async (r) => {
    if (!r.ok) throw new Error(`No se pudo cargar /config.json (${r.status})`);
    return (await r.json()) as AppConfig;
  });
  return cached;
}

/** Para tests. */
export function resetConfigCache(): void {
  cached = undefined;
}

/** Une base y ruta sin barras dobles. */
export function joinUrl(base: string, path: string): string {
  const b = base.endsWith('/') ? base.slice(0, -1) : base;
  const p = path.startsWith('/') ? path : `/${path}`;
  return b + p;
}
