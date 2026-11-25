# Operación: desarrollo, despliegue, migración y usuarios

Todo desde la raíz del repo (`modepran-gestion`). Requisitos: Node 22+, npm, AWS CLI v2, perfil `modepran`
(ver CLAUDE.md → Acceso AWS). No hace falta Docker.

## Desarrollo en local (sin AWS)

```bash
npm install
npm run dev -w @modepran/api     # API en http://localhost:8787 con datos sintéticos en memoria
npm run dev -w @modepran/web     # web en http://localhost:4321/app/  (login simulado; perfil en "Mi cuenta")
```

- Tests: `npm test` (todos los paquetes). Tipos: `npm run typecheck`.
- La web en dev lee `packages/web/dev/config.json` (auth simulada). Nunca datos reales en local.

## Desplegar

Manual (lo normal hasta tener el CI activado):

```bash
aws sso login --profile modepran
cd packages/infra && npx cdk deploy ModepranStack --profile modepran --require-approval never --outputs-file cdk-outputs.json
cd ../.. && npm run build -w @modepran/web
aws s3 sync packages/web/dist s3://<WebBucketName> --delete --exclude config.json --profile modepran
aws cloudfront create-invalidation --distribution-id <DistributionId> --paths "/*" --profile modepran
```

Los nombres reales están en [despliegue.md](despliegue.md). Con CI: GitHub → Actions → Deploy → Run workflow
(rol OIDC, sin claves). Para que despliegue solo en cada push a `main`, descomentar el trigger `push` en
`.github/workflows/deploy.yml`.

## Día del cambio (pasar de la app vieja a la nueva)

La app vieja de fichas se usa a diario: la carga hecha el 2026-11-25 es de **prueba**.

1. Avisar al personal: desde la hora X no se usa la app vieja.
2. Pedir al desarrollador de la app vieja un volcado nuevo de la BBDD (`.sql.gz`) y del `storage/app/public`.
3. Vaciar la tabla si hubo pruebas con escritura (o recrearla) — cuidado: borra todo lo de la app nueva.
4. Fuera de Nextcloud y del repo:
   ```bash
   npm run migrate -w @modepran/migrate -- parse  --dump <nuevo.sql.gz> --out <dir> --tar <backup.tar.gz>
   npm run migrate -w @modepran/migrate -- files  --tar <backup.tar.gz> --out <dir> --extract <dir-ficheros>
   npm run migrate -w @modepran/migrate -- verify --out <dir>
   npm run migrate -w @modepran/migrate -- load   --out <dir> --table modepran --bucket modepran-files-632115809125 --profile modepran --region eu-north-1 --storage <dir-ficheros>
   ```
   `load` es idempotente y salta los ficheros que ya están en S3.
5. Sembrar catálogos operativos (ubicaciones, tipos de cita, actuaciones) si la tabla se vació:
   `npm run migrate -w @modepran/migrate -- seed-operational --table modepran --profile modepran --region eu-north-1`.
6. Abrir la app nueva y borrar las copias locales de los datos.

## Usuarios

- Se crean desde la app: **Administración → Usuarios** (email, nombre, perfiles). Cognito envía la invitación
  con contraseña temporal. Perfiles: `admin`, `carlet`, `modevet`, `bienestar` (ver spec §3).
- El personal sin cuenta (veterinarias, auxiliares, cuidadoras para "solicitada por"/"responsable") se da de
  alta en **Ajustes → Personal**.
- Primer admin creado por CLI el 2026-11-25 (ver despliegue.md).

## Costes y avisos

- Presupuesto 11 USD/mes con avisos a `bienestar@modepran.net`; anomalías de coste diarias.
- Alarma de errores de la API → SNS `modepran-alarms` → `bienestar@modepran.net` (confirmar la suscripción).
- Ver logs: `aws logs tail /aws/lambda/modepran-api --follow --profile modepran --region eu-north-1`
  (en Git Bash: `MSYS_NO_PATHCONV=1` delante).
