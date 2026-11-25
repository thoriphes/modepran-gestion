/**
 * Código de las CloudFront Functions (runtime cloudfront-js-2.0, viewer-request).
 *
 * No se usan las "custom error responses" de CloudFront para el fallback de la SPA porque se aplican a
 * toda la distribución y reescribirían también los 403/404 de la API.
 */

/**
 * Web estática (build de Astro en formato "directory"):
 * - `/app` y `/app/<ruta sin extensión>` → `/app/index.html` (isla React Router, fallback de SPA).
 * - `/adopta/<n>` (número, con o sin `/` final) → `/adopta/index.html` (la isla lee el id de la ruta).
 * - `/<ruta>/` → `/<ruta>/index.html`; `/<ruta>` sin extensión → `/<ruta>/index.html`.
 * - Ficheros con extensión, tal cual.
 *
 * Un objeto que no existe sigue dando 403 de S3 (OAC sin `s3:ListBucket`): una función viewer-request no sabe
 * si existe y las custom error responses afectarían a la API (ver arriba).
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
  if (/^\\/adopta\\/\\d+\\/?$/.test(uri)) {
    req.uri = '/adopta/index.html';
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
