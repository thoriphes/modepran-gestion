# Traspaso del proyecto a Miguel Ángel

## Para Miguel Ángel (en palabras sencillas)

Hola, Miguel Ángel. Esta carpeta contiene **todo** lo de la nueva aplicación de gestión de la protectora
y de vuestra informática (correo, dominios, la web): cómo está hecho, dónde vive y qué queda pendiente.

- **No tienes que leer nada de esto.** Está escrito para tu Claude. Tú háblale normal, en castellano,
  como hablarías con una persona: "quiero que en la ficha salga también…", "no me llega el correo de…".
- Tu Claude se encarga de lo técnico y te explicará las cosas sin palabras raras. Si algo solo lo puedes
  hacer tú (por ejemplo, entrar con tu contraseña), te dirá paso a paso qué botón pulsar.
- **Si tu Claude te dice "pregúntaselo a Acción"**, es una decisión importante de cómo está montado todo:
  reenvíale a Acción el mensaje que tu Claude te prepare. No hace falta que lo entiendas.

**Qué es cada cosa:**

| Cosa | Para qué sirve |
|---|---|
| La aplicación de gestión (`/app/`) | Fichas de los animales, contratos, informes, agendas de Carlet y Modevet, incidencias de Bienestar |
| La página de adopciones (`/adopta/`) | Muestra en internet los animales marcados como "visible en web" |
| La cuenta de Amazon (AWS) | Donde "vive" la aplicación. Tu usuario es `miguel`: te llegó un correo de Amazon a `bienestar@modepran.net` para poner tu contraseña. Cuando haga falta entrar, tu Claude te abrirá la página y solo tendrás que escribirla. Es de la protectora (`bienestar@modepran.net`). Cuesta casi 0 € al mes y avisa por correo si pasa de 10 € |
| Google (Gmail) | El correo de la protectora |
| Squarespace | Donde están comprados los dominios (las direcciones de internet) |

Dirección de la aplicación: https://d2xpy3de8d2jz5.cloudfront.net (más adelante, si se configura,
`gestion.protectoramodepran.com`).

---

## Para Claude (técnico)

Lee primero [CLAUDE.md](CLAUDE.md) → "Cómo hablar con Miguel Ángel": perfil cero técnico; dudas de
arquitectura → a **Acción** (Nacho), con el mensaje redactado.

### Qué se entrega

- Esta carpeta completa: es el repo `modepran-gestion` (código + CLAUDE.md + HANDOFF.md + `docs/`).
- La cuenta AWS `632115809125` (ya es de la protectora; root `bienestar@modepran.net`).
- Todo lo de infraestructura fuera de la app: [docs/infraestructura.md](docs/infraestructura.md) (correo,
  dominios, web WordPress, hosting antiguo de Plesk, copias de la zona DNS e historial en `docs/infra/`).
- Lo legal (RGPD) para que la protectora lo cierre: [docs/legal-rgpd.md](docs/legal-rgpd.md).

### Antes del traspaso (cuando la app funcione)

- Día del cambio hecho ([docs/operacion.md](docs/operacion.md)): app vieja congelada, datos recargados.
- Usuario **admin** de la app para Miguel Ángel (Administración → Usuarios) y altas del personal; dar de
  alta a veterinarias/auxiliares/cuidadoras en Catálogos → Personal (alimenta "Solicitada por" y "Responsable").
- Logo real de la protectora en `packages/web/public/images/logo.png` (hoy hay uno provisional).
- DNS en Squarespace ([docs/despliegue.md](docs/despliegue.md)): DKIM de SES para `modepran.net` y, si se
  quiere, el dominio `gestion.protectoramodepran.com`.
- Confirmar desde `bienestar@modepran.net` la suscripción a las alarmas (email de AWS SNS).

### Pasos el día del traspaso

1. ✅ **Usuario de Identity Center de Miguel Ángel creado (2026-11-25):** usuario `miguel`, email
   `bienestar@modepran.net`, `AdministratorAccess` en `632115809125`. Se le envió el email para poner la
   contraseña y el de verificar el correo. En su primer login tiene que activar el MFA (el móvil).
   Cuando haya que iniciar sesión, su Claude le abre el navegador (ver CLAUDE.md).
2. En su equipo (lo prepara quien haga el traspaso, no él): AWS CLI v2 y Claude Code, perfil `modepran`
   (bloque en [CLAUDE.md](CLAUDE.md) → Acceso AWS), `aws sso login --profile modepran`, Node 22+ y `npm install`.
3. Repo: **transferir** `thoriphes/modepran-gestion` a una cuenta/organización GitHub de la protectora
   (GitHub → Settings → Transfer). Después, cambiar en `packages/infra/lib/config.ts` el repo permitido por
   el rol OIDC, redesplegar y volver a crear las variables `AWS_ROLE_ARN`/`AWS_REGION` en el repo nuevo.
4. Comprobar que su Claude lee `CLAUDE.md` y que `aws sts get-caller-identity --profile modepran`
   devuelve su usuario.
5. **Desactivar el usuario SSO `nacho`** (Identity Center → Users → nacho → Disable user access) cuando su
   Claude despliegue sin ayuda. El usuario admin de Nacho en la app, también.

### Trabajo pendiente que hereda

**Peticiones de Acción ya decididas, por hacer:**
- **Navegador de documentos** (2026-11-25). La sección "Documentos" del menú es en realidad la de
  **plantillas**: renombrarla a "Plantillas". Y crear un **navegador de documentos** de verdad: listado de
  todos los documentos generados y adjuntos (contratos de adopción/acogida, llegadas, salidas,
  veterinario, PDFs subidos), filtrable por **fecha**, **tipo de movimiento** (tipo/subtipo de evento),
  **animal**, centro y contacto, con imprimir/descargar. Respetar permisos (Modevet solo veterinarios;
  Bienestar nada).

**Resto de pendientes** (técnicos, de contenido y de seguridad): [docs/plan.md](docs/plan.md) →
"Pendientes tras la v1" y "Peticiones de Nacho". Lo que sea arquitectura → a Acción.

**Fuera de la app** (correo, dominios, web, hosting antiguo): [docs/infraestructura.md](docs/infraestructura.md)
→ "Cosas pendientes". Todo eso, con el visto bueno de Acción.

### Lo que se queda Acción

- Copia completa del hosting antiguo de Plesk (3 `.tar`, ~26 GB, con datos personales) en su NAS. Se
  entrega a la protectora si la pide, por un medio seguro.
