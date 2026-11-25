# Infraestructura de la Protectora Modepran (todo lo que hay, fuera de la app)

Estado a 2026-11-25. Para Claude: la primera parte es para explicársela a Miguel Ángel con palabras
sencillas; la segunda es el detalle técnico. El historial completo de cómo se hizo está en
[infra/historial-correo-dominios-hosting.md](infra/historial-correo-dominios-hosting.md) (escrito por Acción
para su propio uso: tiene detalle técnico y nombres de herramientas).

## En palabras sencillas

| Qué | Dónde está | Quién paga / es dueño | Cómo está |
|---|---|---|---|
| **Correo** (`@modepran.net` y `@protectoramodepran.com`) | Google Workspace (Gmail) | La protectora | Funciona. Se entra con la cuenta `@modepran.net`; los correos a `@protectoramodepran.com` llegan al mismo buzón |
| **Dominio `modepran.net`** | Squarespace Domains | La protectora (cuenta `bienestar@modepran.net`) | Funciona |
| **Dominio `protectoramodepran.com`** (la web) | Squarespace Domains (desde octubre de 2026) | La protectora | Funciona. Renovado hasta marzo de 2028 |
| **Web de la protectora** (WordPress) | Hosting antiguo de Activaserver / ANW (Plesk) | La protectora | Sigue funcionando ahí. Hay que decidir dónde moverla antes de dar de baja ese hosting |
| **Copia de seguridad completa del hosting antiguo** (web, bases de datos, los 22 buzones viejos) | En el servidor de casa de Acción | — | Guardada. Si la queréis, pedídsela a Acción |
| **App de gestión nueva** | Amazon Web Services (AWS) | La protectora (cuenta `bienestar@modepran.net`) | Funcionando en pruebas. Ver [../HANDOFF.md](../HANDOFF.md) |
| **App de fichas antigua** (la de `jrfdev.com`) | Servidor del desarrollador anterior | No es nuestra | Se sigue usando hasta el día del cambio |

**Regla para Claude:** si Miguel Ángel pregunta por mover la web, dar de baja el hosting antiguo, cambiar
algo del correo o de los dominios, **no lo decidas ni lo toques**: explícale qué hay y dile que se lo
pregunte a Acción. Ofrécele redactar el mensaje.

## Cosas pendientes fuera de la app (para Acción, o con su visto bueno)

1. **Correo — autenticación:** falta el registro `_dmarc` de `modepran.net` (algunos correos a Hotmail
   rebotaban por eso) y la firma DKIM de Google para `protectoramodepran.com`. Se hace en Squarespace
   (DNS) y en Google Admin.
2. **Correo — hosting antiguo:** desactivar el servicio de correo de Plesk (si no, lo que la propia web
   envíe a `@protectoramodepran.com` se queda en los buzones viejos y no llega a Gmail).
3. **Web y hosting antiguo:** decidir dónde va la web WordPress (hosting barato o rehacerla) y qué
   subdominios viejos se borran (`residencia`, `hotel`, `censo`, `modevet`, `old`…). Preguntas enviadas a la
   protectora el 2026-10-16, sin respuesta registrada. Después, dar de baja el hosting de Activaserver.
4. **`app.protectoramodepran.com`** apunta a un servidor de Amazon que no es de la protectora y no funciona:
   se puede borrar ese registro del DNS.
5. **App nueva — DNS:** los 3 registros DKIM para enviar correo desde `@modepran.net` y, si se quiere, el
   dominio `gestion.protectoramodepran.com` (ver [despliegue.md](despliegue.md)).

## Detalle técnico

### Cuentas y accesos (quién entra dónde)

| Servicio | Cuenta | Notas |
|---|---|---|
| Google Workspace | admin `bienestar@modepran.net` | Tenant `modepran.net`; `protectoramodepran.com` es dominio alias |
| Squarespace Domains | `bienestar@modepran.net` | Registrador y DNS de los dos dominios. DNS: `nse1-4.squarespacedns.com` |
| Activaserver / ANW (Plesk) | Panel `p09-eu125.activaserver.com:8443`; área de clientes en `secure.anw.es/extranet` | Credenciales las tiene la protectora |
| AWS | Cuenta `632115809125`, root `bienestar@modepran.net` | Acceso diario por SSO; ver [aws-account.md](aws-account.md) |
| GitHub (código de la app) | Repo privado `thoriphes/modepran-gestion` (de Acción) | Se transfiere a una cuenta de la protectora en el traspaso |

### DNS de `protectoramodepran.com` (en Squarespace)

- Wildcard `*` A `5.9.54.125` (hosting Plesk) + apex y `www` hacia Plesk.
- `app` A `18.208.168.169` (instancia AWS ajena, caída: candidata a borrar).
- MX `1 smtp.google.com.`; SPF con `include:_spf.google.com`.
- Copias de referencia de la zona: [infra/dns-protectoramodepran-copia-2026-10-13.json](infra/dns-protectoramodepran-copia-2026-10-13.json)
  (la última, tal como estaba antes de mover el DNS) y la original de Plesk
  [infra/dns-protectoramodepran-original-plesk-2026-09-11.json](infra/dns-protectoramodepran-original-plesk-2026-09-11.json).
  Son exportaciones de Route 53 (formato change batch); sirven para reconstruir la zona si hiciera falta.

### Hosting Plesk (auditoría del 2026-10-16)

Resumen: web principal WordPress viva; `nueva.` es un clon del que la web carga imágenes (dependencia);
app Java `/gestion/` y API `/animales/` (Tomcat) — sustituidas por la app nueva; 7 bases MySQL; varios
subdominios rotos o abandonados (uno hackeado en 2021). Detalle y veredictos en el historial (§C).

### Copia del hosting antiguo

Backup completo de Plesk (web + bases de datos + configuración + 22 buzones), 3 ficheros `.tar`
(~26 GB), en el NAS de Acción. Sin copia fuera de su casa. Contiene datos personales (contratos y
documentos de la app Java vieja): si se entrega a la protectora, por un medio seguro.
