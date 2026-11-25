/** Constantes del despliegue. Un único entorno (`prod`) en v1: ver docs/spec.md §8. */
export const ACCOUNT = '632115809125';
export const REGION = 'eu-north-1';

/** Repo y rama desde los que GitHub Actions puede desplegar (OIDC). */
export const GITHUB_REPO = 'thoriphes/modepran-gestion';
export const GITHUB_BRANCH = 'main';
export const GITHUB_DEPLOY_ROLE_NAME = 'modepran-github-deploy';

export const TABLE_NAME = 'modepran';
export const COGNITO_DOMAIN_PREFIX = 'modepran-gestion';
export const USER_GROUPS = ['admin', 'carlet', 'modevet', 'bienestar'] as const;

export const SES_DOMAIN = 'modepran.net';
export const SES_FROM = `no-reply@${SES_DOMAIN}`;
export const ALARM_EMAIL = 'bienestar@modepran.net';

/** Origen del servidor de desarrollo de Astro. */
export const DEV_ORIGIN = 'http://localhost:4321';

/** Rutas de la web a las que vuelve Cognito (deben coincidir con lo que use `packages/web`). */
export const CALLBACK_PATHS = ['/app/callback', '/app/'];
export const LOGOUT_PATHS = ['/', '/app/'];
