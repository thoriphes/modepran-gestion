# Plan de implementación v1

Spec: [spec.md](spec.md). Arranque: 2026-11-25, en modo no asistido (Nacho: "no pares, ya ajustaremos").
Estado: ⬜ pendiente · 🟨 en curso · ✅ hecho · ⛔ bloqueado (con motivo).

| # | Tarea | Paquete | Depende de | Estado |
|---|---|---|---|---|
| P1 | Esqueleto del monorepo, repo privado `thoriphes/modepran-gestion`, dependencias | raíz | — | 🟨 |
| P2 | Dominio: tipos, máquina de estados, efectos de eventos, censo, placeholders, agenda, incidencias, permisos + tests | `packages/domain` | P1 | ⬜ |
| P3 | API Hono: repositorio (memoria + DynamoDB), rutas de spec §9, auth por grupos, auditoría, seed sintético, tests | `packages/api` | P2 | ⬜ |
| P4 | Infra CDK: DynamoDB, S3, CloudFront, API GW, Lambda, Cognito, SES, alarmas, OIDC GitHub | `packages/infra` | P1 | ✅ (código; sin desplegar) |
| P5 | Migración: parser del volcado MariaDB, mapeo a dominio, carga a DynamoDB/S3, dry-run y verificación | `packages/migrate` | P2, P3 (repo) | ⬜ |
| P6 | Frontal: login, fichas, historial, contactos, documentos, informes/Excel, agenda, incidencias, admin, web pública | `packages/web` | P3 (contrato) | ⬜ |
| P7 | Despliegue en AWS (eu-north-1), migración de datos del backup del 19/11, usuarios iniciales | — | P3-P6 | ⬜ |
| P8 | Verificación end-to-end, docs y HANDOFF actualizados | — | P7 | ⬜ |

## Notas de ejecución

- Cada tarea: tests en verde (`npm test`), `npm run typecheck` sin errores, commit en `main`.
- Sin datos reales en el repo. El volcado y los ficheros viejos se leen desde una carpeta temporal fuera de
  Nextcloud (ver fuentes.md).
- Lo que quede fuera o a medias se anota aquí con ⛔ y el motivo.
