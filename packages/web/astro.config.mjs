import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

/**
 * `config.json` de desarrollo. En producción lo escribe CDK (BucketDeployment) en el bucket web, así que
 * NO va en `public/` ni en el build: en `astro dev` se sirve desde `dev/config.local.json` (ignorado en git,
 * para ajustes propios) o, si no existe, desde `dev/config.json` (sin secretos, auth simulada).
 */
const devDir = fileURLToPath(new URL('./dev/', import.meta.url));
function devConfigJson() {
  return {
    name: 'modepran-dev-config',
    apply: /** @type {'serve'} */ ('serve'),
    configureServer(/** @type {any} */ server) {
      server.middlewares.use('/config.json', (/** @type {any} */ _req, /** @type {any} */ res) => {
        const local = devDir + 'config.local.json';
        const file = existsSync(local) ? local : devDir + 'config.json';
        res.setHeader('content-type', 'application/json');
        res.setHeader('cache-control', 'no-cache');
        res.end(readFileSync(file, 'utf8'));
      });
    },
  };
}

const API_DEV = process.env.MODEPRAN_API_DEV ?? 'http://localhost:8787';

export default defineConfig({
  output: 'static',
  trailingSlash: 'ignore',
  build: { format: 'directory' },
  integrations: [react()],
  server: { port: 4321 },
  vite: {
    plugins: [tailwindcss(), devConfigJson()],
    server: {
      // La API local (packages/api, `npm run dev -w @modepran/api`) por el mismo origen: sin CORS,
      // igual que en producción (CloudFront sirve /api/* y /public-files/* en el mismo dominio).
      proxy: {
        '/api': { target: API_DEV, changeOrigin: true },
        '/public-files': { target: API_DEV, changeOrigin: true },
        '/dev-files': { target: API_DEV, changeOrigin: true },
      },
    },
  },
});
