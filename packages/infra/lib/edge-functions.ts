/**
 * Código de las CloudFront Functions (runtime cloudfront-js-2.0, viewer-request).
 *
 * No se usan las "custom error responses" de CloudFront para el fallback de la SPA porque se aplican a
 * toda la distribución y reescribirían también los 403/404 de la API.
 */

/**
 * Web estática (build de Astro en formato "directory"):
 * - `/app` y `/app/<ruta sin extensión>` → `/app/index.html` (isla React Router, fallback de SPA).
 * - `/<ruta>/` → `/<ruta>/index.html`; `/<ruta>` sin extensión → `/<ruta>/index.html` (p. ej. `/adopta/12`).
 * - Ficheros con extensión, tal cual.
 */
export const WEB_REWRITE_CODE = `
function handler(event) {
  var req = event.request;
  var uri = req.uri;
  var hasExt = /\\.[A-Za-z0-9]+$/.test(uri);
  if (uri === '/app' || uri.indexOf('/app/') === 0) {
    if (!hasExt) req.uri = '/app/index.html';
    return req;
  }
  if (uri.charAt(uri.length - 1) === '/') {
    req.uri = uri + 'index.html';
  } else if (!hasExt) {
    req.uri = uri + '/index.html';
  }
  return req;
}
`;

/**
 * `/public-files/<clave>` → `/<clave>`; el origen tiene originPath `/public`, así que S3 recibe
 * `public/<clave>`. Rechaza segmentos `..` para no salir del prefijo.
 */
export const PUBLIC_FILES_REWRITE_CODE = `
function handler(event) {
  var req = event.request;
  var key = req.uri.substring('/public-files'.length);
  if (key === '' || key === '/' || key.indexOf('..') !== -1) {
    return { statusCode: 404, statusDescription: 'Not Found' };
  }
  req.uri = key;
  return req;
}
`;
