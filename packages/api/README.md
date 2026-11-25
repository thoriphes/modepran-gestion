# @modepran/api

API de Modepran Gestión: **Hono** sobre AWS Lambda (`hono/aws-lambda`), DynamoDB (tabla única), S3 y Cognito.
Toda la lógica de negocio está en `@modepran/domain`; aquí solo hay rutas, validación (zod), permisos,
persistencia y auditoría.

```
src/
  app.ts            createApp(deps): todas las rutas (montadas bajo /api)
  lambda.ts         handler de Lambda (deps reales desde el entorno)
  types.ts          Catalogs, CatalogType, AuthUser…
  repo/types.ts     interfaz Repository (+ BulkImportData para la migración)
  repo/memory.ts    repositorio en memoria (tests y dev)
  repo/dynamo.ts    repositorio DynamoDB (spec §8)
  files.ts          FileStore: URLs firmadas S3 (y versión en memoria)
  users.ts          UserDirectory: usuarios de Cognito (y versión en memoria)
  templates/        plantillas por defecto (*.html) + textos legales
  dev/seed.ts       datos sintéticos (inventados)
  dev/server.ts     servidor local :8787 con repo en memoria
  dev/disk-files.ts ficheros de dev en disco (os.tmpdir()/modepran-dev-files): /dev-files/* (GET, PUT) y /public-files/*
```

## Desarrollo

```bash
npm run dev -w @modepran/api        # http://localhost:8787/api/...
npm test -w @modepran/api
npm run typecheck -w @modepran/api
npm run gen:templates -w @modepran/api   # tras editar src/templates/defaults/*.html
```

Auth en dev (solo `dev/server.ts` y tests, **nunca** en Lambda): cabeceras `x-dev-user` (id),
`x-dev-groups` (`admin,carlet`…), `x-dev-name`. Sin cabeceras, el servidor de dev usa `dev-admin` / `admin`.
En producción el JWT lo valida API Gateway y la Lambda lee `event.requestContext.authorizer.jwt.claims`
(`sub`, `email`, `name`, `cognito:groups`).

## Convenciones

- Prefijo `/api`. JSON. Fechas `YYYY-MM-DD` (día en Europe/Madrid), instantes ISO UTC.
- Errores: `{ "error": { "code": "...", "message": "...", "field"?: "..." } }`.
  - `400 validation`: cuerpo/query no válidos (zod). `field` = primer campo con error; `issues` = lista.
  - `401 unauthenticated`, `403 forbidden` (permiso de `can()` del dominio), `404 not_found`.
  - `409 chip_duplicate | nif_duplicate | contact_in_use | conflict`.
  - `422 <código del dominio>` (`event_not_allowed`, `first_event`, `required`, `referral_open`…).
- Toda escritura y exportación deja una entrada de auditoría.
- Permisos: los de `PERMISSION_MATRIX` (`packages/domain/src/permissions.ts`). Abajo, columna **Permiso**.
- Listas paginadas: `{ items, total, page, pageSize, pages }`.

## Endpoints

### Sesión

| Método | Ruta | Permiso | Cuerpo / query | Respuesta |
|---|---|---|---|---|
| GET | `/me` | autenticado | — | `{ id, email, name, profiles[], permissions[] }` |

### Catálogos

Tipos: `species, breeds, cities, zones, centers, statuses, subtypes, vaccines, illnesses, colonies, areas,
staff, appointmentTypes, actionCategories`. Operativos (`catalogs:operational`, Carlet): `breeds, cities,
vaccines, illnesses, colonies, areas, staff, appointmentTypes, actionCategories`; el resto `catalogs:write`
(admin). No se borran: `PATCH {active:false}`.

| Método | Ruta | Permiso | Cuerpo | Respuesta |
|---|---|---|---|---|
| GET | `/catalogs` | autenticado | — | `Catalogs` (objeto con un array por tipo) |
| POST | `/catalogs/:type` | ver arriba | item sin `id` (o con `id` slug) | `201` item creado |
| PATCH | `/catalogs/:type/:id` | ver arriba | campos a cambiar | item |

Campos por tipo (además de `name`, `active`): breeds `speciesId`; zones `cityIds[]`; centers/species `code?`;
statuses `code`; subtypes `typeId, code, resultStatusId?, user, contact, center, notes, vaccine, illness,
colony, date, docGenerate, docUpload, switch, switchLabel?`; areas `species: ('perros'|'gatos')[]`;
staff `roles: ('cuidadora'|'veterinaria'|'auxiliar')[]`; appointmentTypes `color` (`#rrggbb`);
actionCategories `subcategories: {id,name,active,vetSubtypeId?}[], vetSubtypeId?`.

### Animales

| Método | Ruta | Permiso | Cuerpo / query | Respuesta |
|---|---|---|---|---|
| GET | `/animals` | `animals:read` | query: filtros de `AnimalFilters` (dominio) + `page`, `pageSize`, `sort` (`id`,`name`,`arrivalDate`,`exitDate`,`bornAt`,`updatedAt`,`weightKg`), `dir` (`asc`/`desc`). Booleanos `true`/`false`. `contact` requiere `animals:read_contacts` | `Page<Animal & {photoUrl?, thumbUrl?}>` (GET firmados, 5 min, si `hasPhoto`) |
| POST | `/animals` | `animals:write` | `{ animal: AnimalInput, arrival: EventInput }` | `201 { animal, event, contact? }` |
| GET | `/animals/:id` | `animals:read` | — | `{ animal, events: HistoryEvent[] (cronológico), contacts: Contact[], photoUrl?, thumbUrl? }` (URLs firmadas 5 min si `hasPhoto`; sin contactos ni `contactId` si falta `animals:read_contacts`) |
| PATCH | `/animals/:id` | `animals:write` | `Partial<AnimalInput>` (no estado, centro ni derivados) | `Animal` |
| DELETE | `/animals/:id` | `animals:delete` | — | `204` (borra eventos y ficheros) |
| GET | `/animals/:id/allowed-types` | `animals:read` | — | `{ typeIds[], subtypes: Subtype[] }` (ya filtrado por los permisos del usuario) |
| POST | `/animals/:id/events` | `animals:write` (Veterinario: `events:vet`) | `EventInput` | `201 { animal, event, contact? }` |
| DELETE | `/animals/:id/events/:eventId` | `events:delete` | — | `{ animal }` (no se borra el primero: 422 `first_event`) |
| POST | `/animals/:id/photo-upload-url` | `animals:write` | `{ contentType?: 'image/jpeg' }` | `{ photo: {key,url}, thumb: {key,url} }` (PUT firmados, 5 min) |
| POST | `/animals/:id/photo-uploaded` | `animals:write` | — | `Animal` (`hasPhoto: true`; actualiza la foto pública) |
| POST | `/animals/:id/event-upload-url` | `animals:write` o `events:vet` | `{ fileName, contentType }` | `{ key, url }` (PUT firmado; luego `document: {key, originalName}` en el evento) |
| GET | `/animals/:id/file-url?key=` | `animals:read` | `key` bajo `animals/<id>/` | `{ url }` (GET firmado, 5 min) |

`AnimalInput`: `{ name, speciesId, breedId? | breedName? (se crea al vuelo), color?, gender: 'male'|'female'|'none',
weightKg?, size?: 'small'|'medium'|'big', bornAt?, sterilized, ppp, visibleWeb, compatibleDogs, compatibleCats,
chip?: { number, passport?, owner?, phone?, notes? } | null }`.

`EventInput`: `{ subtypeId, date?, userId?, contact?: { contactId?: number, data?: ContactData }, centerId?,
vaccineId?, illnessId?, colonyId?, cityId? | cityName? (se crea al vuelo), address?, zip?, collectionDate?, notes?,
switchValue?, document?: { key, originalName } }`. Contacto (regla 6): `contactId` = elegir uno (con `data` se
actualiza); solo `data` = se busca por NIF (salvo SIN DATOS) y se actualiza o se crea.
`ContactData`: `{ name, surname?, nif?, address?, zip?, province?, cityId?, cityName?, phone?, email? }`.

Cambiar `visibleWeb` o el estado copia/borra `public/animals/<id>.jpg` (foto pública).

### Contactos

| Método | Ruta | Permiso | Cuerpo / query | Respuesta |
|---|---|---|---|---|
| GET | `/contacts?q&kind&page&pageSize` | `contacts:read` (Modevet `contacts:own_clients`: solo `cliente_modevet`) | — | `Page<Contact>` |
| GET | `/contacts/:id` | ídem | — | `{ contact, animals: {id,name,statusId}[] }` |
| PATCH | `/contacts/:id` | `contacts:write` | `Partial<ContactData>` | `Contact` (409 `nif_duplicate`) |
| DELETE | `/contacts/:id` | `contacts:write` | — | `204` (409 `contact_in_use` si sale en algún evento) |

### Documentos y plantillas

**Formato elegido: HTML ya renderizado en el servidor** (con `renderTemplate` del dominio). La web lo pone en
un `<iframe srcdoc>` (o ventana nueva) y llama a `print()`. Las URL de foto son GET firmados (5 min): imprimir
en ese plazo. El logo es `/images/logo.png` del propio dominio web (lo sirve `packages/web/public`).

| Método | Ruta | Permiso | Cuerpo / query | Respuesta |
|---|---|---|---|---|
| GET | `/templates` | `documents:generate` | — | `[{ slug, name, customized, updatedAt? }]` |
| GET | `/templates/:slug` | `templates:write` | — | `{ slug, name, bodyFilled, bodyBlank, legalTexts, defaults: {bodyFilled, bodyBlank, legalTexts}, customized, placeholders[], blocks[], langKeys[] }` |
| PUT | `/templates/:slug` | `templates:write` | `{ bodyFilled, bodyBlank, legalTexts?, name? }` | `{ template, warnings: string[] }` (placeholders desconocidos) |
| POST | `/templates/:slug/reset` | `templates:write` | — | `{ slug, ... }` (vuelve a la por defecto) |
| GET | `/documents/event/:eventId?animalId=&blank=` | `documents:generate` (Veterinario: `documents:vet`) | `animalId` (alias `animal`) muy recomendable (si falta se busca en todos los eventos) | `{ slug, title, html }` |
| GET | `/documents/blank/:slug` | `documents:generate` (`veterinario`: `documents:vet`) | — | `{ slug, title, html }` |
| GET | `/documents/ficha/:animalId` | `documents:generate` | — | `{ slug: 'ficha', title, html }` |
| GET | `/documents/fichas?<filtros de /animals>` | `documents:generate` | máx. 300 fichas | `{ slug: 'ficha', title, count, html }` (una ficha por página) |

Slugs: `llegada, adopcion, dueno, eutanasia, acogida, veterinario, ficha`. Evento → plantilla: Llegada →
`llegada`; Salida adopcion/dueno/eutanasia → la suya; Movimientos acogida/acogida_solidaria/devolucion_desde_acogida
→ `acogida`; Veterinario → `veterinario`; otros → 422 `no_document`.

### Informes

Query común: `from`, `to` (por defecto 12 meses hasta hoy), `zoneId`, `cityId`, `centerId`.

| Método | Ruta | Permiso | Respuesta |
|---|---|---|---|
| GET | `/reports/dashboard` | `reports:read` | `Dashboard` (dominio) |
| GET | `/reports/summary` | `reports:read` | `{ filter, arrivalsBySpeciesSex, exitsBySpeciesSex, arrivalsBySubtype, exitsBySubtype, monthlyCensus }` |
| GET | `/reports/excel-data` | `reports:read` | `{ filter, gestion: GestionExcelData, gestionTitle, gestionHeaders, census: CensusExcelData, censusTitle }` (la web genera los xlsx con exceljs; auditado como `export`) |

### Agenda

| Método | Ruta | Permiso | Cuerpo / query | Respuesta |
|---|---|---|---|---|
| GET | `/agenda?agenda=carlet|modevet&from&to&overdue=1` | `agenda_<x>:read` | `from`/`to` obligatorios (máx. 93 días) | `{ items: AgendaItem[], overdue?: AgendaItem[] }` (incluye los de `ambas`) |
| GET | `/agenda/:id` | lectura de su agenda | — | `AgendaItem` |
| POST | `/agenda` | `agenda_<x>:write` (Modevet + `isReferral`: `agenda_modevet:referral`; `ambas`: escribir en alguna) | `NewAgendaItemInput` (dominio) | `201 AgendaItem` |
| PATCH | `/agenda/:id` | escritura en su agenda | `{ status?, text?, actions?, owner? }` | `AgendaItem` |
| POST | `/agenda/:id/reschedule` | escritura en su agenda | `{ date, time? }` | `{ original, created }` |
| POST | `/agenda/:id/register-history` | `events:vet` | `{ actionIndexes?: number[], notes?: string }` (por defecto todas; `notes` se añade a cada evento) | `{ events: HistoryEvent[], skipped: {index, reason}[] }` — cita concluida con `animalId`; una vez |

### Incidencias

| Método | Ruta | Permiso | Cuerpo / query | Respuesta |
|---|---|---|---|---|
| GET | `/incidents?status&mine=1&referred=1` | `incidents:read` (Bienestar: solo las suyas) | `referred=1`: solo las que tienen derivación a Modevet (abierta o cerrada) | `Incident[]` (recientes primero) |
| GET | `/incidents/:id` | ídem | — | `{ incident, agenda: AgendaItem[], photoUrls: {key,url}[] }` |
| POST | `/incidents` | `incidents:create` | `NewIncidentInput` sin fotos | `201 Incident` |
| POST | `/incidents/:id/photo-upload-url` | autor o `incidents:manage` | `{ contentType, bytes }` | `{ key, url }` (PUT firmado) |
| POST | `/incidents/:id/photos` | autor o `incidents:manage` | `{ key, mime, bytes }` | `Incident` (máx. 3) |
| POST | `/incidents/:id/start` | `incidents:manage` | — | `Incident` |
| POST | `/incidents/:id/appointment` | `incidents:manage` + escribir en la agenda | `{ agenda, date, time, appointmentTypeId, notes? }` | `{ incident, appointment }` |
| POST | `/incidents/:id/referral` | `incidents:manage` | `{ date, time?, appointmentTypeId, notes? }` | `{ incident, referral }` |
| POST | `/incidents/:id/resolve` | `incidents:manage` (Modevet: si tiene derivación) | `{ byStaffId, treatment, registerHistory?: boolean, subtypeId? }` | `{ incident, updatedItems, event? }` |

### Administración

| Método | Ruta | Permiso | Cuerpo / query | Respuesta |
|---|---|---|---|---|
| GET | `/users` | `users:manage` | — | `User[]` |
| POST | `/users` | `users:manage` | `{ email, name, profiles[] }` | `201 User` (Cognito envía la invitación) |
| PATCH | `/users/:id` | `users:manage` | `{ name?, profiles?, active? }` | `User` |
| GET | `/audit?from&to&userId&entity&action` | `audit:read` | por defecto últimos 30 días | `AuditEntry[]` (recientes primero, máx. 1000) |
| GET | `/export/:what.csv` | `export:csv` | `what`: `animals, contacts, events, agenda, incidents` | `text/csv` (BOM, `;`) |

### Público (sin auth)

| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/public/animals?speciesId&gender&size` | `PublicAnimal[]` |
| GET | `/public/animals/:id` | `PublicAnimal` (404 si no es visible + disponible) |

`PublicAnimal`: `{ id, name, speciesId, speciesName, gender, size?, bornAt?, age?, sterilized, compatibleDogs,
compatibleCats, photoUrl? }` con `photoUrl = /public-files/animals/<id>.jpg`. Sin datos de personas.

## Migración: `bulkImport`

```ts
import { createDynamoRepository } from '@modepran/api';
const repo = createDynamoRepository({ tableName: 'modepran', client /* DynamoDBDocumentClient opcional */ });
const result = await repo.bulkImport({ catalogs, animals, events, contacts, staff, templates });
```

`BulkImportData = { catalogs?: Partial<Catalogs>, animals?, events?, contacts?, staff?, templates? }` (objetos
del dominio). BatchWrite de 25 con reintentos de `UnprocessedItems`, sin auditoría, guardianes de chip/NIF,
contadores `animal|event|contact` = máx(actual, máx. id importado). Idempotente (PutRequest).
Devuelve `BulkImportResult` (recuentos, duplicados de chip/NIF, contadores). También en `createMemoryRepository()`.
