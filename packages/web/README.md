# @modepran/web

Frontal de Modepran Gestión: **Astro 5** (estático, sin SSR) + **React 19** (islas) + **Tailwind 4**.

```
src/
  pages/index.astro          portada (enlaces a la app y a adopciones)
  pages/app/index.astro      app interna: isla React `client:only` con React Router (basename /app)
  pages/adopta/index.astro   web pública de adopciones (listado; /adopta/<n> también muestra la ficha)
  pages/adopta/animal.astro  ficha pública por query: /adopta/animal/?id=<n>
  app/                       app interna: App.tsx (arranque + rutas), Layout.tsx (navegación por permisos),
                             context.tsx (sesión, catálogos, useAsync/useAction), ui/ (componentes propios),
                             components/, screens/ (una carpeta por módulo)
  public/                    islas de la web pública (AdoptList, AdoptDetail)
  lib/api.ts                 ÚNICO cliente de la API (tipado; adapta el contrato de packages/api/README.md)
  lib/auth.ts                Cognito managed login (oidc-client-ts, code + PKCE) o auth simulada de dev
  lib/config.ts              carga /config.json
  lib/excel.ts               Excel "Informe gestión" y "Censo" (exceljs, en el navegador)
  lib/image.ts               redimensionado de fotos (700/200 px animales, 1400 px JPEG 0.78 incidencias)
test/                        Vitest (cliente API, Excel, cálculo de redimensionado)
```

## Desarrollo local

```bash
npm run dev -w @modepran/api   # API con repositorio en memoria y datos sintéticos, :8787
npm run dev -w @modepran/web   # http://localhost:4321/app/
```

- `astro dev` hace de proxy de `/api`, `/public-files` y `/dev-files` hacia `http://localhost:8787` (variable
  `MODEPRAN_API_DEV` para cambiarlo): mismo origen, como en producción con CloudFront, y sin CORS.
- `/config.json` en dev lo sirve un middleware desde `dev/config.json` (sin secretos, con
  `devAuth: {user, groups}`) o, si existe, desde `dev/config.local.json` (ignorado en git). Con `devAuth` no hay
  Cognito: el cliente manda `x-dev-user` / `x-dev-groups`. El usuario simulado se cambia en **Mi cuenta**.
- El dev server también imita el fallback de SPA de CloudFront (`/app/<ruta>` → `/app/`).
- **El `config.json` de producción no está en el build**: lo escribe CDK (`BucketDeployment` del stack) y el
  workflow lo excluye del `aws s3 sync`.

## Producción

- `npm run build -w @modepran/web` → `dist/` estático. `npm run typecheck -w @modepran/web` = `astro check`.
- Login: Cognito managed login, callback `/app/callback`, logout por `<dominio Cognito>/logout`. Se envía el
  **id token** como Bearer (lo acepta el JWT authorizer y lleva `cognito:groups`).
- Documentos: la API devuelve el HTML ya rellenado; se pinta en un `<iframe srcdoc>` y "Imprimir" imprime solo
  el iframe (Guardar como PDF desde el navegador).
- Fotos privadas: URL firmada GET por `GET /animals/:id/file-url?key=` (caché 4 min en el cliente).
- `public/images/logo.png` es un **logo provisional** (huella): sustituirlo por el de la protectora. Lo usan
  las plantillas de documentos (`[LOGO_URL]`).
