# Plan de implementación v1

Spec: [spec.md](spec.md). Arranque: 2026-11-25, en modo no asistido (Nacho: "no pares, ya ajustaremos").
Estado: ⬜ pendiente · 🟨 en curso · ✅ hecho · ⛔ bloqueado (con motivo).

| # | Tarea | Paquete | Depende de | Estado |
|---|---|---|---|---|
| P1 | Esqueleto del monorepo, repo privado `thoriphes/modepran-gestion`, dependencias | raíz | — | 🟨 |
| P2 | Dominio: tipos, máquina de estados, efectos de eventos, censo, placeholders, agenda, incidencias, permisos + tests | `packages/domain` | P1 | ✅ |
| P3 | API Hono: repositorio (memoria + DynamoDB), rutas de spec §9, auth por grupos, auditoría, seed sintético, tests | `packages/api` | P2 | ✅ (código; sin desplegar) |
| P4 | Infra CDK: DynamoDB, S3, CloudFront, API GW, Lambda, Cognito, SES, alarmas, OIDC GitHub | `packages/infra` | P1 | ✅ (código; sin desplegar) |
| P5 | Migración: parser del volcado MariaDB, mapeo a dominio, carga a DynamoDB/S3, dry-run y verificación | `packages/migrate` | P2, P3 (repo) | ✅ (`load` sin ejecutar contra AWS) |
| P6 | Frontal: login, fichas, historial, contactos, documentos, informes/Excel, agenda, incidencias, admin, web pública | `packages/web` | P3 (contrato) | ✅ (probado en local contra la API de dev; ver packages/web/README.md) |
| P7 | Despliegue en AWS (eu-north-1), migración de datos del backup del 19/11, usuarios iniciales | — | P3-P6 | ⬜ |
| P8 | Verificación end-to-end, docs y HANDOFF actualizados | — | P7 | ⬜ |

## Notas de ejecución

- Cada tarea: tests en verde (`npm test`), `npm run typecheck` sin errores, commit en `main`.
- Sin datos reales en el repo. El volcado y los ficheros viejos se leen desde una carpeta temporal fuera de
  Nextcloud (ver fuentes.md).
- Lo que quede fuera o a medias se anota aquí con ⛔ y el motivo.
- P2 (dominio): decisiones ante ambigüedades anotadas en los comentarios de cabecera de cada módulo de
  `packages/domain/src` (censo al final del día, salidas del Excel de gestión, sexo "none", rangos inclusivos,
  orden de eventos, primer evento por orden de registro, reagendar tras "no presentado"…).
- P5 (migración): `npm run migrate -w @modepran/migrate -- parse|files|verify|load` (ayuda sin argumentos).
  Decisiones en la cabecera de `packages/migrate/src/map.ts` (ids, fecha = día Madrid de
  `collection_date ?? created_at`, `createdAt` no decreciente por id, estados/subtipos con su código como id,
  personal `staff-<id>`). Volcado del 19/11: recuentos cuadran (7.314 animales, 35.984 eventos, 6.241
  contactos, 4.665 chips, 29 subtipos, 12 estados). Anomalías que se migran tal cual: 33 NIF compartidos por
  66 contactos (sin guardián), 548 contactos sin nombre, 309 animales cuyo estado guardado no es el del último
  evento por **fecha** (sí por id: la app vieja usaba el orden de inserción; al borrar un evento el dominio
  recalcularía por fecha), 10 con el centro igual. Ficheros: 16.517 a subir (2,3 GB), 0 ausentes, 46 huérfanos.
- P3 (API): contrato en `packages/api/README.md`. Decisiones: documentos = HTML ya renderizado en el servidor
  (`{slug,title,html}`); la ficha añade `[BLOQUE_HISTORIAL]`; adjuntos de eventos con nombre
  `animals/<id>/events/<uuid>.<ext>` (el id del evento no existe al subir); fotos de incidencia se suben tras el
  alta (`photo-upload-url` + `POST /incidents/:id/photos`); `GET /documents/event/:id` admite `?animalId=` (sin él
  recorre todos los eventos); Modevet ve solo contactos `cliente_modevet` (se crean desde citas de animales externos);
  `cognito:groups` del authorizer JWT llega como `"[a b]"` y se parsea en la API. Pendiente: `staffId` de usuario
  (no hay atributo en Cognito), plantillas: revisar 2 teléfonos borrados en `adoption_anex3` (¿de la protectora?).
