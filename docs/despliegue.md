# Despliegue (prod, eu-north-1)

Primer despliegue: 2026-11-25 (`cdk deploy ModepranStack --profile modepran`, desde `packages/infra`).

| Cosa | Valor |
|---|---|
| URL de la app | https://d2xpy3de8d2jz5.cloudfront.net (`/app/` interna, `/adopta/` pública) |
| CloudFront | `EIB7HQNUKEUBJ` |
| HTTP API | https://5xjgxn65n5.execute-api.eu-north-1.amazonaws.com (se usa vía CloudFront `/api/*`) |
| Lambda | `modepran-api` |
| DynamoDB | `modepran` |
| Ficheros | `modepran-files-632115809125` |
| Web | `modepranstack-webbucket12880f5b-tbgwhdowjmps` |
| Cognito | pool `eu-north-1_cwssbbLdm`, cliente `6ifc8ivkmo2c8scmge6turlu43`, dominio https://modepran-gestion.auth.eu-north-1.amazoncognito.com |
| Alarmas | SNS `modepran-alarms` → `bienestar@modepran.net` (**hay que confirmar la suscripción** desde ese buzón) |
| CI | rol OIDC `modepran-github-deploy`; variables del repo `AWS_ROLE_ARN` y `AWS_REGION` puestas. Workflow `deploy.yml` solo manual de momento |

## Pendiente fuera de AWS (DNS en Squarespace, lo hace quien tenga acceso)

- DKIM de SES para enviar desde `@modepran.net` (3 CNAME):
  - `o2axkzkaappaxsmrwtuf57264bkojbda._domainkey.modepran.net` → `o2axkzkaappaxsmrwtuf57264bkojbda.dkim.amazonses.com`
  - `oie3qi7juwtip7e7rlolprmzl3cvgtel._domainkey.modepran.net` → `oie3qi7juwtip7e7rlolprmzl3cvgtel.dkim.amazonses.com`
  - `pdxzvq2xsyliy2i5kkmc2d6bwpiwe2bk._domainkey.modepran.net` → `pdxzvq2xsyliy2i5kkmc2d6bwpiwe2bk.dkim.amazonses.com`
  Después, pedir la salida del sandbox de SES (consola SES → Account dashboard → Request production access).
  Mientras tanto, Cognito envía las invitaciones con su correo por defecto (funciona sin esto).
- Dominio `gestion.protectoramodepran.com`: ver `packages/infra/README.md` (certificado ACM en us-east-1 +
  CNAME de validación + CNAME `gestion` → `d2xpy3de8d2jz5.cloudfront.net`).

## Migración inicial (2026-11-25, desde el backup del 2026-11-19)

- `packages/migrate`: `parse` + `files` + `verify` (todo cuadra) y `load`.
- DynamoDB: 7.314 animales, 35.984 eventos, 6.241 contactos, 874 items de catálogo, 4 personas (staff).
  Contadores: siguiente animal 7731, evento 38264, contacto 6281.
- S3: 16.517 ficheros (2,43 GB): fotos, miniaturas y adjuntos de eventos. 0 errores.
- Web pública: solo 1 animal tenía "visible en web" (y no está disponible) → `/adopta` sale vacía hasta
  que marquen animales.
- **Es una carga de prueba**: la app vieja se sigue usando a diario. El día del cambio: congelar la vieja,
  volcado nuevo, `load` de nuevo (es idempotente; los ficheros ya subidos se saltan) y abrir la nueva.
  Antes de esa carga final, vaciar la tabla si se han hecho pruebas de escritura con datos reales.

## Usuarios de la app (Cognito)

| Usuario | Perfil | Alta |
|---|---|---|
| Nacho Roca (email personal) | admin | 2026-11-25, invitación de Cognito enviada |

Miguel Ángel y el resto del personal: se crean desde la propia app (Admin → Usuarios) cuando se abra.
