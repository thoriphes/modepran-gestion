# Modepran: cuenta AWS

Decidido 2026-11-25 (Nacho): **cuenta independiente** a nombre de la protectora (propiedad y
facturación suyas, como los dominios en Squarespace). Cuenta propia, no cuelga de ninguna
organización ajena. Email root: **`bienestar@modepran.net`** (admin del Workspace).

Antes del 2026-11-25 no existía ninguna cuenta AWS de Modepran.
`app.protectoramodepran.com` → `18.208.168.169` (us-east-1) es de una cuenta AWS desconocida, no de esta.

## Estado (2026-11-25)

| Cosa | Valor |
|---|---|
| Cuenta | **`632115809125`** (`modepran`), root `bienestar@modepran.net`. Creada 2026-11-25 |
| Organización | Creada al activar Identity Center: esta cuenta es la **management account**. No hay cuentas miembro |
| Región de las apps | **`eu-north-1` (Estocolmo)**: la más barata de la UE (decisión "la más barata", Nacho 2026-11-25; ver arquitectura.md). `eu-south-2` (España) quedó activada (opt-in) pero no se usa |
| Seguridad (2026-11-25) | S3 Block Public Access a nivel de cuenta **ON** · CloudTrail `modepran-trail` (multi-región, validación de ficheros) → bucket `modepran-cloudtrail-632115809125` (eu-north-1, SSE-S3, solo HTTPS, expira a 365 d) |
| Costes (2026-11-25) | Budget `modepran-mensual` **11 USD/mes** (≈10 €; la cuenta factura en USD) → email a `bienestar@` al 50 % real, 100 % real y 100 % previsto · Cost Anomaly Detection: monitor y suscripción **por defecto** de AWS (diaria a `bienestar@`) |
| IAM Identity Center | Instancia `ssoins-68045e08d7c5fbde`, **single-Region eu-west-1** (sin réplica a EE. UU., clave de AWS). Identity store `d-936783225d` |
| Portal SSO | `https://d-936783225d.awsapps.com/start` |
| Permission set | `AdministratorAccess` (política gestionada AdministratorAccess, sesión 8 h) |
| Usuarios SSO | `nacho` (Nacho Roca, email personal de Nacho) → AdministratorAccess en `632115809125`. Email de contraseña + verificación enviados 2026-11-25 |
| CLI | Perfil **`modepran`** + sso-session `modepran` en `~/.aws/config` de Orgrimmar: `aws sso login --profile modepran`. **Verificado 2026-11-25**: `assumed-role/AWSReservedSSO_AdministratorAccess_…/nacho` en `632115809125` |

**Handoff (decidido 2026-11-25):** al terminar, el colega toma el proyecto con su propio Claude.
Darle un **usuario de Identity Center propio** (no un usuario IAM con access keys) y su perfil SSO.
El usuario `nacho` se puede desactivar entonces.

## 1. Alta (la hace una persona: tarjeta, teléfono y CAPTCHA) — HECHO 2026-11-25

1. <https://signin.aws.amazon.com/signup?request_type=register>
   - Email root: `bienestar@modepran.net` · Nombre de cuenta: `modepran`
   - Contraseña root larga y única → al gestor de contraseñas **de la protectora** (no a ficheros).
2. Tipo **Business**, datos de la asociación (nombre legal, CIF, dirección fiscal).
3. Tarjeta de la protectora. Verificación por SMS/llamada a un teléfono de la protectora.
4. Plan de soporte **Basic (gratis)**.
5. Esperar el email de activación (minutos, a veces horas).

## 2. Tareas de root pendientes (solo `bienestar@modepran.net` puede hacerlas)

- [ ] Cuenta → *IAM user and role access to Billing information* → **Activar**. Sin esto, los usuarios SSO
      no ven la facturación ni Cost Explorer (`User not enabled for cost explorer access`, 2026-11-25).
- [ ] Contactos alternativos (facturación, operaciones, seguridad) → `bienestar@modepran.net`.
- [ ] Datos fiscales de la asociación (Billing → Tax settings), ver preguntas.md D3.
- [x] Identity Center activado (2026-11-25, eu-west-1).

## 3. Hecho por Claude (2026-11-25, perfil SSO `modepran`)

- [x] Budget mensual 11 USD con alertas a `bienestar@`.
- [x] Cost Anomaly Detection (ya venía activado por defecto).
- [x] CloudTrail multi-región + bucket propio.
- [x] S3 Block Public Access a nivel de cuenta.
- [x] Cuenta anotada en la documentación de infra de Nacho.
- [ ] Bucket de migración y resto de recursos: **con CDK** desde el repo, no a mano.

## Pendiente

- Créditos para ONG: **AWS Imagine Grant / TechSoup** (preguntas.md C8).
- El bucket de CloudTrail y el trail se crearon a mano (CLI); importarlos al CDK o dejarlos documentados aquí.
