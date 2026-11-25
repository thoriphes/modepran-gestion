# Modepran webapp — nueva plataforma de gestión de la protectora

Proyecto de la **Protectora Modepran** (Valencia / Carlet). Reimplementar **desde cero** en AWS sus
dos webapps actuales y unirlas en una sola:

1. **Fichas de animales** (hoy Laravel en `modepran.jrfdev.com`): animales, historial (llegadas,
   salidas, veterinario, movimientos), contactos, contratos imprimibles, informes y censo.
2. **Gestión / Coordinación** (hoy beta Next.js en Cloudflare + Turso): agendas de Carlet y Modevet,
   incidencias de Bienestar con fotos, derivaciones a la clínica Modevet. Opcional: Recepcionista IA.

El código viejo **no se reutiliza**: solo su funcionalidad, ya analizada en `docs/feature-set.md`.

**Responsable del proyecto: Miguel Ángel** (`bienestar@modepran.net`). Lo arrancó Nacho Roca
(voluntario) y se le entregará entero a Miguel Ángel y a su Claude ([HANDOFF.md](HANDOFF.md)).
Este directorio tiene que bastarse solo: no dependas de documentación de fuera de él salvo
`../MODEPRAN.md` (historial del hosting Plesk y del correo, solo como contexto).

## Estado (2026-11-25)

- Análisis de funcionalidades: **hecho**. Preguntas de producto e infra: **respondidas** (quedan A13, C8 y
  lo legal, que no bloquean).
- Cuenta AWS `632115809125`: Identity Center, SSO `nacho`, budget 11 USD, CloudTrail, S3 Block Public Access.
- Arquitectura **decidida**: Lambda + DynamoDB + Cognito + S3 + CloudFront, región **eu-north-1**.
- Desarrollo arrancado el 2026-11-25 (Nacho: "sigue tus recomendaciones, ya ajustaremos"). Diseño en
  `docs/spec.md`, plan en `docs/plan.md`, código en este mismo directorio (repo `thoriphes/modepran-gestion`).
- Traspaso a Miguel Ángel **cuando la app funcione**.

## Reglas

- **Coste casi nulo.** Solo servicios de pago por uso. Nada que cobre por hora encendido (RDS, Aurora
  provisionado, NAT Gateway, Fargate, EC2) sin que lo apruebe Miguel Ángel.
- **Datos personales (RGPD).** Contactos con DNI, direcciones y contratos firmados. Datos en la UE
  (eu-north-1), buckets privados y cifrados, nada de datos reales en el repo, ni en logs, ni en ejemplos.
- **Sin secretos en ficheros.** Ni en el repo ni en este directorio. AWS se usa con SSO (credenciales
  temporales); los despliegues, con GitHub Actions + OIDC.
- **AWS**: antes de cualquier escritura, `aws sts get-caller-identity --profile modepran` y comprobar que
  la cuenta es `632115809125`. Nunca usar el usuario root salvo para lo que solo root puede hacer.
- **Infra como código** (CDK). Nada creado a mano en la consola que no quede en el código, salvo lo de
  la cuenta en sí (Identity Center, facturación).
- **No tocar las apps viejas** (servidor de `jrfdev.com`, Turso, Cloudflare): no son nuestras.
- El material de partida (`Work.rar`) **no** va a git ni a carpetas sincronizadas: ver `docs/fuentes.md`.

## Acceso AWS

| Cosa | Valor |
|---|---|
| Cuenta | `632115809125` (`modepran`), root `bienestar@modepran.net` |
| Portal SSO | `https://d-936783225d.awsapps.com/start` (Identity Center en **eu-west-1**) |
| Perfil CLI | `modepran` → `aws sso login --profile modepran` (sesión 8 h) |
| Región de las apps | **eu-north-1** (Estocolmo) |

Configuración del perfil (`~/.aws/config`):

```ini
[sso-session modepran]
sso_start_url = https://d-936783225d.awsapps.com/start
sso_region = eu-west-1
sso_registration_scopes = sso:account:access

[profile modepran]
sso_session = modepran
sso_account_id = 632115809125
sso_role_name = AdministratorAccess
region = eu-west-1
output = json
```

## Docs

| Doc | Leer cuando |
|---|---|
| [HANDOFF.md](HANDOFF.md) | Se traspasa el proyecto a Miguel Ángel, o arranca un Claude nuevo |
| [docs/preguntas.md](docs/preguntas.md) | **Antes de decidir nada**: decisiones abiertas con propuesta por defecto y respuestas |
| [docs/feature-set.md](docs/feature-set.md) | Qué hacen las dos apps actuales, modelo de datos, reglas de negocio, propuesta de unión |
| [docs/arquitectura.md](docs/arquitectura.md) | Stack AWS, modelo DynamoDB, costes |
| [docs/aws-account.md](docs/aws-account.md) | Cuenta AWS: alta, Identity Center, hardening pendiente |
| [docs/fuentes.md](docs/fuentes.md) | Dónde está el código/BBDD viejos |
| [docs/legal-rgpd.md](docs/legal-rgpd.md) | Protección de datos: qué se trata, dónde, medidas, plazos, borradores legales |
| [docs/spec.md](docs/spec.md) | Diseño funcional y técnico de la app combinada |
| [docs/plan.md](docs/plan.md) | Plan de implementación y estado de cada tarea |
