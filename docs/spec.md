# Spec — Modepran Gestión (app combinada) v1

Fecha: 2026-11-25. Fuentes: [feature-set.md](feature-set.md) (qué hacen las apps viejas),
[preguntas.md](preguntas.md) (decisiones), [arquitectura.md](arquitectura.md) (stack).
Las decisiones marcadas **(rec.)** son recomendaciones de Claude aceptadas en bloque por Nacho
("sigue tus recomendaciones, ya ajustaremos"); revisables.

## 1. Alcance

Una sola app que sustituye a la **app de fichas** (Laravel) y a la **beta de Gestión/Coordinación**.
La Recepcionista IA queda fuera (aparcada). El Tomcat viejo queda fuera.

Módulos:
1. **Animales**: fichas, chip, foto, historial de eventos con máquina de estados, alta por Llegada.
2. **Contactos**: adoptantes, acogedores, propietarios, avisantes, clientes externos de Modevet.
3. **Documentos**: contratos e impresos (llegada, adopción, dueño, eutanasia, acogida, veterinario), con
   plantillas editables y placeholders; ficha imprimible; impresión masiva de fichas.
4. **Informes**: dashboard, censo mensual, llegadas/salidas por especie×sexo y por subtipo, Excel
   "Informe gestión" y "Censo" idénticos a los actuales.
5. **Agenda**: citas, avisos y notas por agenda (Carlet, Modevet), vista día/semana, reagendar.
6. **Incidencias de Bienestar**: alta desde móvil con fotos (sin caducidad) y dictado; gestión por Carlet;
   dar cita o derivar a Modevet; resolver con tratamiento; seguimiento.
7. **Web pública de adopciones**: listado y ficha pública de animales `visible_web` y Disponibles.
8. **Administración**: usuarios y perfiles, catálogos, auditoría, export CSV.

## 2. Conceptos clave

- **Centro de alojamiento** (`center`): dónde está alojado un animal. Valores actuales: **Valencia**, **Carlet**.
  Campo de la ficha; lo cambian los eventos con flag `center`.
- **Perfil** (`profile`, grupo de Cognito): **admin**, **carlet**, **modevet**, **bienestar**. Define vistas y
  permisos. No tiene nada que ver con el centro de alojamiento.
- **Agenda**: `carlet` o `modevet`. Avisos y notas pueden ir a `ambas`.
- **Zona geográfica** (`zone`): conjunto de ciudades (mancomunidades) para informes. Viene de la app de fichas.
- **Ubicación en recinto** (`area`): Cuarentena, Quirófano, Campo Nuevo… para incidencias, filtrada por
  especie. Viene de la beta. Concepto distinto de zona.
- **Animal externo**: cita de Modevet de un animal que no es de la protectora. La cita guarda nombre del
  animal, especie y propietario, sin ficha.

## 3. Perfiles y permisos (rec.)

| Permiso | admin | carlet | modevet | bienestar |
|---|---|---|---|---|
| Ver fichas de animales | ✔ | ✔ | ✔ | ✔ (sin contactos) |
| Crear/editar animal, eventos Llegada/Salida/Movimientos | ✔ | ✔ | — | — |
| Eventos Veterinario | ✔ | ✔ | ✔ | — |
| Borrar animal / borrar evento | ✔ | ✔ (evento) | — | — |
| Contactos (ver/editar) | ✔ | ✔ | solo sus clientes de citas | — |
| Documentos / plantillas | ✔ / ✔ | ✔ / — | ver impresos veterinarios | — |
| Informes y Excel | ✔ | ✔ | — | — |
| Agenda Carlet | ✔ | ✔ | ver | — |
| Agenda Modevet | ✔ | ver + crear derivación | ✔ | — |
| Incidencias: crear | ✔ | ✔ | — | ✔ |
| Incidencias: gestionar (en proceso, cita, derivar, resolver) | ✔ | ✔ | resolver las derivadas | — |
| Seguimiento propio | — | — | — | ✔ |
| Catálogos | ✔ | ✔ (operativos) | — | — |
| Usuarios, auditoría, export CSV, borrado definitivo | ✔ | — | — | — |

La API comprueba permisos siempre (el frontal solo oculta).

## 4. Modelo de dominio

### Animal
`id` (numérico, continúa la numeración actual), `name`, `speciesId`, `breedId`, `color` (texto),
`gender` (male|female|none), `weightKg`, `size` (small|medium|big), `bornAt` (fecha), `centerId`,
`statusId`, `sterilized`, `ppp`, `visibleWeb`, `compatibleDogs`, `compatibleCats`, `hasPhoto`,
`chip?` {`number` (único), `passport`, `owner`, `phone`, `notes`}, `createdAt`, `updatedAt`.
Derivados guardados para filtros: `lastArrival` {date, cityId, cityName, subtypeId, userId},
`lastExit` {date, subtypeId}, `illnessIds[]` (alguna vez), `contactIds[]` (de cualquier evento).

### Evento de historial (`event`)
`id`, `animalId`, `typeId` (llegada|salida|veterinario|movimientos), `subtypeId`, `date` (fecha del evento),
`userId` (trabajador), `contactId?`, `centerId?`, `vaccineId?`, `illnessId?`, `colonyId?`, `cityId?`,
`address?`, `zip?`, `collectionDate?`, `notes?`, `switchValue?`, `document?` {key, originalName},
`createdAt`, `createdBy`.

### Tipos y subtipos
4 tipos fijos con **código estable** (`llegada`, `salida`, `veterinario`, `movimientos`).
Subtipo: `id`, `typeId`, `name`, `code` (slug estable), `resultStatusId?`, flags: `user`, `contact`,
`center`, `notes`, `vaccine`, `illness`, `colony`, `date`, `docGenerate`, `docUpload`, `switch`,
`switchLabel`. Se migran los 29 actuales con sus flags.

### Estados del animal
Códigos estables: `disponible`, `adoptado`, `acogida`, `acogida_solidaria`, `fallecido`, `eutanasiado`,
`cadaver`, `translado`, `devuelto_colonia`, `devolucion_propietario`, `perdido`,
`devolucion_responsable_legal`. Nombres editables.

### Reglas (se conservan de la app vieja; tests obligatorios)
1. **Tipos permitidos según estado**: cadaver/eutanasiado/fallecido → ninguno; disponible → todos menos
   llegada; translado → solo llegada; acogida/acogida_solidaria → movimientos (solo subtipo
   `devolucion_desde_acogida`) y veterinario; adoptado → llegada y veterinario; resto → todos.
2. Añadir evento: el estado pasa al `resultStatusId` del subtipo, **salvo veterinario** (nunca cambia
   estado). Subtipo con `center` → cambia el centro del animal.
3. Salida: fecha = hoy (Europe/Madrid) salvo subtipo con `date`; copia centro actual y ciudad de la última
   llegada al evento.
4. Llegada (reentrada): fecha = fecha de recogida. Si el subtipo es `devolucion_desde_acogida` o
   `devolucion_desde_adopcion`, copia ciudad/dirección/CP de la llegada original.
5. Subtipo sin flag `user`: trabajador = usuario logueado.
6. Contacto: si no se elige, se busca por NIF (excluyendo el contacto "SIN DATOS"); si existe se actualiza,
   si no se crea. Contacto especial **SIN DATOS** para avisantes desconocidos.
7. Borrar evento: nunca el primero. Recalcular estado (= resultado del último evento no veterinario) y centro
   (= del último evento de llegada o con flag center). Borrar su adjunto.
8. **Última llegada** = la de fecha más reciente; define ciudad/zona del animal en filtros, informes y censo.
9. Chip único (escritura condicional). Ciudades y razas se crean al vuelo (normalizadas: capitalizar palabras).

### Contacto
`id`, `name`, `surname`, `nif?` (único si existe), `address`, `zip`, `province` (texto), `cityId`,
`phone`, `email`, `kind[]` (adoptante|acogedor|propietario|avisante|cliente_modevet; derivado), `createdAt`.

### Catálogos
Especies, razas (por especie), ciudades, zonas (→ ciudades), centros, estados, tipos/subtipos, vacunas,
enfermedades, colonias, ubicaciones de recinto (por especie: perros/gatos), personal sin cuenta
(cuidadoras, veterinarias, auxiliares: para "solicitada por"/"responsable"), tipos de cita (nombre+color),
categorías de actuación → subcategorías. Regla: **no se borran, se desactivan** (salvo sin uso).
Los registros guardan copia del nombre (histórico estable).

### Agenda (citas, avisos, notas)
`id`, `kind` (cita|aviso|nota), `agenda` (carlet|modevet|ambas — ambas solo aviso/nota), `date`,
`time?` (HH:MM; sin hora = franja "sin hora"), `text`, `status`, `createdBy`, `createdAt`.
Cita además: `appointmentType` {id,name,color} (copia), `requestedBy` (personal activo veterinaria/auxiliar,
salvo citas de incidencia), `animalId?` **o** `externalAnimal` {name, species}, `species` (CAN|FEL|otra),
`actions[]` ({categoryId, subcategoryId?} o texto libre), `owner?` {name, phone, email} (→ contacto
`cliente_modevet` si es externo), `incidentId?`, `isReferral` (derivación), `rescheduledFromId?`,
`rescheduledToId?`, `statusEvents[]` {status, at, by}.
Estados cita: pendiente, concluida, no_presentado, cancelada, reagendada. Aviso/nota: pendiente, concluido.
Reglas: **reagendar** crea cita nueva pendiente y marca la original `reagendada`, enlazadas; una cita solo se
reagenda una vez; no se edita fecha/hora de una cita existente; `statusEvents` lo añade el servidor;
`createdBy` lo pone el servidor.

### Incidencia
`id`, `animalId?` o `animalName` (texto, si no se identifica), `species`, `areaId` + `areaName` (copia),
`text`, `priority` (normal|importante|urgente), `reporterUserId` (cuenta individual), `photos[]`
(máx. 3; {key, mime, bytes, uploadedAt}; **sin caducidad**), `status` (pendiente|en_proceso|resuelta),
`resolution?` {byStaffId, treatment, at}, `createdAt`.
Reglas: datos originales inmutables; dar cita o derivar no la resuelve; máximo una derivación abierta;
resolver cierra en cascada sus citas/derivaciones abiertas (estado concluida) copiando responsable y
tratamiento. Una incidencia resuelta en un animal con ficha crea un evento **Veterinario** si se marca
"registrar en historial" (rec.).

### Integración agenda ↔ historial (rec.)
Una cita de Modevet sobre un animal con ficha, al marcarla **concluida**, ofrece "registrar en historial":
crea eventos Veterinario por cada actuación que tenga equivalente en subtipos veterinario
(mapeo configurable categoría→subtipo). No automático sin confirmación.

### Auditoría
`at`, `userId`, `userName`, `action` (create|update|delete|export|login…), `entity`, `entityId`, `summary`.
Solo inserción. Visible para admin con filtros.

## 5. Documentos e impresión (rec.: sin PDF en servidor)

- Los documentos se generan como **HTML imprimible** en el navegador (CSS de impresión A4) y se guardan
  como PDF con "Imprimir → Guardar como PDF". Sin Chromium en Lambda: coste 0.
- Plantillas: `slug` (llegada, adopcion, dueno, eutanasia, acogida, veterinario, ficha) con `bodyFilled`,
  `bodyBlank` (HTML) y textos legales editables. Placeholders compatibles con los actuales:
  `[ANIMAL_NOMBRE]`, `[ESPECIE]`, `[RAZA]`, `[COLOR]`, `[GENERO]`, `[PESO]`, `[TAMANO]`, `[ESTADO]`,
  `[CENTRO]`, `[NACIDO_FECHA]`, `[EDAD_ESTIMADA]`, `[LUGAR_CIUDAD]`, `[RECOGIDO_POR]`,
  `[CONTACTO_NOMBRE|APELLIDOS|NIF|TELEFONO|EMAIL|DIRECCION|PROVINCIA|CP|CIUDAD]`, `[HISTORIAL_ID]`,
  `[FECHA_HISTORIAL_DM]`, `[FECHA_HISTORIAL_ESPAÑOL]`, `[FECHA_VALENCIA_LINEA]`, `[TIPO_HISTORIAL]`,
  `[SUBTIPO_HISTORIAL]`, `[MOTIVO_SUBTIPO]`, `[NOTAS_HISTORIAL]`, `[TITULO_REGISTRO]`,
  `[TITULO_REGISTRO_CON_SUBTIPO]`, `[LOGO_URL]`, `[FOTO_ANIMAL_URL]`, bloques
  `[BLOQUE_CHECK_ESTERILIZADO]`, `[BLOQUE_PPP]`, `[BLOQUE_COMPAT_PERROS]`, `[BLOQUE_COMPAT_GATOS]`,
  `[BLOQUE_CHIP]` y textos `[LANG_<CLAVE>]`.
- Plantillas por defecto = conversión de las vistas actuales, con los textos legales actuales de
  `lang/es/panel.php` (el responsable los revisará: ver legal-rgpd.md §6).
- Evento con documento subido (doc_upload / veterinario) → se descarga el fichero (URL firmada).
- **Fichas masivas**: página imprimible con N fichas filtradas (estado, especie, centro, zona o ciudad).

## 6. Informes (rec.: calculados al vuelo, sin tablas de censo)

- El censo de un día = animales cuyo último evento no veterinario anterior o igual a ese día los deja en
  disponible/acogida/acogida_solidaria; agrupado por especie, ciudad de la última llegada y centro, con
  recuento de acogida aparte. Se calcula en la Lambda a partir de todos los eventos (≈36k, cabe en memoria).
- Informes: censo mensual (último día de cada mes), llegadas y salidas por mes × especie × sexo, salidas y
  llegadas por subtipo × especie, dashboard (disponibles, entradas/salidas 12 meses).
- Filtros: rango de fechas (12 meses por defecto), zona, ciudad, centro.
- Excel "Informe gestión" (Entradas y Salidas: filas = subtipos, columnas Perro/Gato/Otros × sexo con
  totales por fórmula; en salidas, solo la última salida de cada animal y excluyendo animales que vuelven a
  estar disponibles o en acogida) y Excel "Censo" (inicial = refugio + acogida, + entradas por subtipo,
  − salidas por subtipo, final). Generados **en el navegador** (exceljs).

## 7. Web pública de adopciones

- `GET /public/animals`: animales `visibleWeb` y estado `disponible`: id, nombre, especie, sexo, edad
  aproximada, tamaño, compatibilidades, esterilizado, foto (URL pública de una copia reducida).
- Fotos públicas en un prefijo `public/` del bucket servido por CloudFront (se copian al marcar visible y
  se borran al desmarcar o cambiar de estado). Sin datos de personas.
- Páginas `/adopta` (listado con filtros especie/sexo/tamaño) y `/adopta/<id>`. Enlazable desde la web.

## 8. Arquitectura técnica

- **Monorepo npm workspaces** (TypeScript estricto, Node 22 en Lambda, ESM):
  - `packages/domain`: tipos, reglas y cálculos puros (máquina de estados, efectos de eventos, censo,
    placeholders, reagendar, cascadas de incidencia, permisos). Sin dependencias de AWS. **Vitest**.
  - `packages/api`: **Hono** sobre Lambda (`hono/aws-lambda`). Capa de repositorio con interfaz y dos
    implementaciones: DynamoDB (producción) y memoria (tests y dev local). Validación con **zod**.
  - `packages/web`: **Astro + React** (islas; la app interna es una isla `client:only` con React Router).
    Login con Cognito Hosted UI / managed login (OIDC + PKCE, `oidc-client-ts`). Tailwind. Mobile-first en
    incidencias y agenda.
  - `packages/infra`: **CDK**: tabla DynamoDB (PITR), bucket de ficheros (versionado, privado), bucket web
    + CloudFront (OAC) con `/api/*` → API Gateway HTTP API (mismo dominio, sin CORS), Lambda ARM64
    (NodejsFunction con esbuild local), Cognito (pool, grupos, app client, dominio), SES (identidad
    `modepran.net`), alarma de errores, rol OIDC de GitHub, retención de logs 30 días.
  - `packages/migrate`: lee el volcado MariaDB y el `storage/` de la app vieja → DynamoDB + S3. Idempotente,
    con modo `--dry-run` y verificación de recuentos.
- **DynamoDB, tabla única** `modepran` (`PK`, `SK`, `GSI1PK/GSI1SK`, `GSI2PK/GSI2SK`):

| Entidad | PK | SK | GSI1 | GSI2 |
|---|---|---|---|---|
| Animal | `ANIMAL#<id>` | `META` | `ANIMALS` / `<id padded>` | `CHIP#<num>` / `ANIMAL` |
| Evento | `ANIMAL#<id>` | `EVENT#<fecha>#<eventId>` | `EVENTS` / `<fecha>#<eventId>` | — |
| Contacto | `CONTACT#<id>` | `META` | `CONTACTS` / `<apellidos nombre>` | `NIF#<nif>` / `CONTACT` |
| Catálogo | `CATALOG#<tipo>` | `<id>` | — | — |
| Agenda | `AGENDA#<agenda>` | `<fecha>#<hora|99:99>#<id>` | `ITEM#<id>` / `AGENDA` | `INCIDENT#<id>` / `<id>` |
| Incidencia | `INCIDENT#<id>` | `META` | `INCIDENTS` / `<estado>#<createdAt>` | `REPORTER#<user>` / `<createdAt>` |
| Plantilla | `TEMPLATE#<slug>` | `META` | — | — |
| Auditoría | `AUDIT#<YYYY-MM>` | `<at>#<id>` | — | — |
| Contadores | `COUNTER#<nombre>` | `META` | — | — |
| Personal | `CATALOG#staff` | `<id>` | — | — |

  Unicidad de chip y NIF con items guardianes (`UNIQUE#CHIP#<num>`, `UNIQUE#NIF#<nif>`) en transacciones.
- **Listados con filtros**: la Lambda lee el GSI1 `ANIMALS` entero (~7k items) y filtra/ordena/pagina en
  memoria; caché en memoria del contenedor 30 s.
- **Ficheros S3** (`modepran-files-<cuenta>`): `animals/<id>/photo.jpg`, `animals/<id>/thumb.jpg`,
  `animals/<id>/events/<eventId>.<ext>`, `incidents/<id>/<photoId>.jpg`, `public/animals/<id>.jpg`.
  Subida con URL firmada PUT; lectura con URL firmada GET (5 min). Fotos de animales: el navegador
  redimensiona (700 px + miniatura 200 px) antes de subir.
- **Auth**: API Gateway JWT authorizer (Cognito) en `/api/*` salvo `/api/public/*`; la Lambda lee
  `cognito:groups` para permisos. Usuarios: admin los crea desde la app (AdminCreateUser + grupo; Cognito
  envía la invitación). Contraseña ≥8 (mayúscula, minúscula y número; decisión de Nacho 2026-11-25); MFA TOTP opcional (obligatorio recomendado para admin).
- **Entornos**: un solo entorno `prod` en v1 (coste 0 de mantener dos no compensa todavía); dev local con
  repositorio en memoria y datos sintéticos.
- **Sin datos reales** en el repo ni en tests. Datos sintéticos en `packages/api/src/dev/seed.ts`.

## 9. API (resumen; contrato en `packages/api/src/routes`)

Prefijo `/api`. JSON. Errores `{error: {code, message}}`. 409 en conflictos de unicidad.

- `GET /me` → usuario, perfiles, permisos.
- Catálogos: `GET /catalogs` (todos), `POST/PATCH /catalogs/:type[/:id]`.
- Animales: `GET /animals?filters…&page&sort`, `POST /animals` (alta = animal + evento llegada + contacto),
  `GET /animals/:id` (ficha + historial), `PATCH /animals/:id`, `DELETE /animals/:id`,
  `GET /animals/:id/allowed-types`, `POST /animals/:id/events`, `DELETE /animals/:id/events/:eventId`,
  `POST /animals/:id/photo-upload-url`, `GET /animals/:id/files/:key-url`.
- Contactos: `GET /contacts?q`, `GET/PATCH/DELETE /contacts/:id` (borrar solo sin eventos).
- Documentos: `GET /templates`, `GET/PUT /templates/:slug`, `POST /templates/:slug/reset`,
  `GET /documents/event/:eventId` (datos para rellenar), `GET /documents/fichas?filters` (datos fichas).
- Informes: `GET /reports/dashboard`, `GET /reports/summary?from&to&zone&city&center`,
  `GET /reports/excel-data?…` (datos para los Excel).
- Agenda: `GET /agenda?agenda&from&to`, `POST /agenda`, `PATCH /agenda/:id` (estado/texto),
  `POST /agenda/:id/reschedule`, `POST /agenda/:id/register-history`.
- Incidencias: `GET /incidents?status&mine`, `POST /incidents`, `POST /incidents/:id/photo-upload-url`,
  `POST /incidents/:id/start`, `POST /incidents/:id/appointment`, `POST /incidents/:id/referral`,
  `POST /incidents/:id/resolve`.
- Admin: `GET/POST/PATCH /users`, `GET /audit?filters`, `GET /export/:what.csv`.
- Público: `GET /public/animals`, `GET /public/animals/:id`.

## 10. Migración

1. Fuente: volcado `yisus_modepran.sql.gz` + `storage/app/public/{animals,docs}` del backup (o uno nuevo
   el día del cambio, porque la app vieja se usa a diario).
2. Parser de `INSERT` de MariaDB → objetos; mapear ids (se conservan ids de animales, contactos y eventos).
3. Catálogos con códigos estables (mapeo nombre→código en el script).
4. Usuarios: los 4 usuarios viejos pasan a **personal** (para "recogido por"/autor de eventos); las cuentas
   nuevas se crean en Cognito aparte.
5. Derivados (`lastArrival`, `illnessIds`, `contactIds`) calculados en la carga.
6. Descartar: `history_census*`, `logs_errors`, tablas de Laravel.
7. Ficheros: fotos `{id}.jpg`/`{id}_thumb.jpg` → `animals/<id>/photo.jpg|thumb.jpg`;
   `animals/<id>/<historyId>.<ext>` → `animals/<id>/events/<historyId>.<ext>`.
8. Verificación: recuentos por tabla, por estado y por subtipo iguales a los de origen; muestreo de 20 fichas.
9. Día del cambio: congelar la app vieja (dejar de usarla), volcado nuevo, migración, abrir la nueva.

## 11. Fuera de v1 (anotado)

Recepcionista IA; anonimización automática por plazos (legal-rgpd.md §5); notificaciones push; modo offline;
Google Calendar; firma digital; segundo entorno de staging; dominio propio hasta que alguien cree el CNAME.
