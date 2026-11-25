# Modepran webapp — nueva plataforma de gestión de la protectora

Proyecto de la **Protectora Modepran** (Valencia / Carlet). Reimplementar **desde cero** en AWS sus
dos webapps actuales y unirlas en una sola:

1. **Fichas de animales** (hoy Laravel en `modepran.jrfdev.com`): animales, historial (llegadas,
   salidas, veterinario, movimientos), contactos, contratos imprimibles, informes y censo.
2. **Gestión / Coordinación** (hoy beta Next.js en Cloudflare + Turso): agendas de Carlet y Modevet,
   incidencias de Bienestar con fotos, derivaciones a la clínica Modevet. Opcional: Recepcionista IA.

El código viejo **no se reutiliza**: solo su funcionalidad, ya analizada en `docs/feature-set.md`.

**Responsable del proyecto: Miguel Ángel** (`bienestar@modepran.net`). Lo arrancó y lo diseñó
**Nacho Roca**, voluntario, a quien **Miguel Ángel llama "Acción"** (usa ese nombre al hablar con él).
Se le entrega entero a Miguel Ángel y a su Claude ([HANDOFF.md](HANDOFF.md)). Este directorio se basta
solo: todo lo de Modepran (app, AWS, correo, dominios, hosting antiguo) está aquí, en `docs/`.

## Cómo hablar con Miguel Ángel y la protectora (IMPORTANTE)

Su perfil es **cero técnico**. Háblales como a alguien que no sabe nada de informática:

- **Lenguaje llano, sin jerga.** Nada de "deploy", "Lambda", "DynamoDB", "bucket", "commit", "DNS"…
  Di "publicar la nueva versión", "la base de datos", "el almacén de fotos", "la configuración del
  dominio". Si una palabra técnica es inevitable, explícala en una frase.
- **Haz tú el trabajo técnico.** No le pidas que abra terminales, edite ficheros o ejecute comandos. Si
  hace falta algo que solo puede hacer él (entrar con su contraseña, pulsar un botón en una web), dale
  **pasos numerados, uno por línea, diciendo exactamente qué botón pulsar** y qué verá en pantalla.
- **Respuestas cortas**, primero lo que importa ("ya está", "no se puede porque…", "necesito que…").
- Confirma antes de cualquier cosa que cueste dinero, borre datos o afecte a la app que usa el personal.

**Dudas de arquitectura → a Acción.** Si surge cualquier decisión de arquitectura o de fondo (cambiar de
servicio o de región, base de datos, costes, seguridad, permisos/perfiles, modelo de datos, dominios,
correo, hosting de la web, migraciones, traspaso de cuentas), **no la decidas tú ni le pidas a Miguel Ángel
que la decida**: dile que se la pregunte a Acción y **redáctale el mensaje** listo para reenviar (qué
pasa, qué opciones hay y qué recomiendas, en 5-10 líneas). Los cambios pequeños de la app (textos,
pantallas, catálogos, errores) sí los haces tú.

## Estado (2026-11-25)

- **v1 desplegada** en https://d2xpy3de8d2jz5.cloudfront.net (interna en `/app/`, pública en `/adopta/`).
  Monorepo en este directorio = repo privado `thoriphes/modepran-gestion` (se transfiere en el handoff).
- **Datos de prueba reales cargados** desde el backup del 2026-11-19 (7.314 animales, 35.984 eventos, 6.241
  contactos, 2,4 GB de ficheros). La app vieja se sigue usando: el día del cambio se repite la carga
  ([docs/operacion.md](docs/operacion.md)).
- Tests: dominio 138, API 56, migración 36, web 15. Probado de punta a punta en local; en producción
  verificado API (invocación directa), web pública y login.
- Pendiente: ver [docs/plan.md](docs/plan.md) → Pendientes. Traspaso a Miguel Ángel **cuando la app funcione**.

## Estructura del repo

| Paquete | Qué |
|---|---|
| `packages/domain` | Reglas de negocio puras (máquina de estados, censo, informes, plantillas, agenda, incidencias, permisos) |
| `packages/api` | API Hono en Lambda; repositorio DynamoDB/memoria; servidor dev con datos sintéticos |
| `packages/web` | Astro + React: app interna (`/app`) y web pública (`/adopta`) |
| `packages/infra` | CDK: todo AWS |
| `packages/migrate` | Migración desde la app vieja (Laravel/MariaDB) y siembra de catálogos |

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
| [docs/infraestructura.md](docs/infraestructura.md) | Correo, dominios, web WordPress, hosting antiguo, cuentas: qué hay y qué falta (fuera de la app) |
| [docs/preguntas.md](docs/preguntas.md) | **Antes de decidir nada**: decisiones abiertas con propuesta por defecto y respuestas |
| [docs/feature-set.md](docs/feature-set.md) | Qué hacen las dos apps actuales, modelo de datos, reglas de negocio, propuesta de unión |
| [docs/arquitectura.md](docs/arquitectura.md) | Stack AWS, modelo DynamoDB, costes |
| [docs/aws-account.md](docs/aws-account.md) | Cuenta AWS: alta, Identity Center, hardening pendiente |
| [docs/fuentes.md](docs/fuentes.md) | Dónde está el código/BBDD viejos |
| [docs/legal-rgpd.md](docs/legal-rgpd.md) | Protección de datos: qué se trata, dónde, medidas, plazos, borradores legales |
| [docs/spec.md](docs/spec.md) | Diseño funcional y técnico de la app combinada |
| [docs/plan.md](docs/plan.md) | Plan de implementación, estado y pendientes |
| [docs/despliegue.md](docs/despliegue.md) | Recursos desplegados, migración hecha, usuarios, DNS pendiente |
| [docs/operacion.md](docs/operacion.md) | Desarrollo local, desplegar, día del cambio, usuarios, logs |
