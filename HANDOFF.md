# Handoff a Miguel Ángel

Cuándo: por decidir (pregunta C10 en [docs/preguntas.md](docs/preguntas.md)). Objetivo: que Miguel Ángel
y su propio Claude lleven el proyecto sin depender de Nacho.

## Qué se entrega

- Esta carpeta `webapp/` completa (CLAUDE.md + HANDOFF.md + docs/). Copiarla a su equipo o, mejor,
  meterla en el repositorio del proyecto (pregunta C5) como `CLAUDE.md` y `docs/` en la raíz.
- La cuenta AWS `632115809125`, que ya es de la protectora (root `bienestar@modepran.net`).
- El material de partida (`Work.rar`), que ya tiene él.

## Antes del traspaso (cuando la app funcione)

- Día del cambio hecho (ver docs/operacion.md): app vieja congelada, datos recargados.
- Usuario **admin** de la app para Miguel Ángel (Administración → Usuarios) y altas del personal.
- Logo real de la protectora en `packages/web/public/images/logo.png` (hoy hay uno provisional).
- DNS en Squarespace (docs/despliegue.md): DKIM de SES para `modepran.net` y, si se quiere, el dominio
  `gestion.protectoramodepran.com`.
- Confirmar desde `bienestar@modepran.net` la suscripción a las alarmas (email de AWS SNS).

## Pasos el día del traspaso

1. **Usuario de Identity Center para Miguel Ángel** (no un usuario IAM con access keys):
   consola AWS → IAM Identity Center (región eu-west-1) → Users → Add user, con su email; asignarle el
   permission set `AdministratorAccess` en la cuenta `632115809125`. Que active MFA en el primer login.
2. En su equipo: instalar AWS CLI v2 y Claude Code, añadir el perfil `modepran` (bloque en
   [CLAUDE.md](CLAUDE.md) → Acceso AWS) y hacer `aws sso login --profile modepran`.
3. Repo: **transferir** `thoriphes/modepran-gestion` a la cuenta/organización GitHub de la protectora
   (GitHub → Settings → Transfer). Después, cambiar en `packages/infra/lib/config.ts` el repo permitido por el
   rol OIDC, redesplegar y volver a crear las variables `AWS_ROLE_ARN`/`AWS_REGION` en el repo nuevo.
4. Comprobar que su Claude lee `CLAUDE.md` y que `aws sts get-caller-identity --profile modepran`
   devuelve su usuario.
5. Revisar juntos [docs/preguntas.md](docs/preguntas.md): lo que siga abierto pasa a ser suyo.
6. **Desactivar el usuario SSO `nacho`** (Identity Center → Users → nacho → Disable user access), cuando
   Miguel Ángel confirme que entra y despliega sin ayuda.

## Qué queda en el lado de Nacho

- `../MODEPRAN.md`: migración del correo a Google Workspace, dominios y baja del hosting Plesk. Es otro
  frente, independiente de esta app.
- Backup completo del hosting Plesk en el NAS de Nacho (`/mnt/data/backups/modepran/`, 3 `.tar` de
  Plesk). Si Miguel Ángel lo quiere, se le entrega.
