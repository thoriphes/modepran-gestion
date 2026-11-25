# Preguntas abiertas (2026-11-25)

Cada pregunta lleva **mi propuesta** por defecto: si os vale, basta con "OK". Responded debajo de cada
una en **Respuesta:** (o en el chat citando el número). Ordenadas por lo que bloquea antes.

---

## A. Alcance y producto (Miguel Ángel / protectora)

**A1. ¿Qué apps sustituye la nueva?**
Hoy hay: (1) la app de fichas Laravel en `modepran.jrfdev.com`, (2) la beta de Gestión/Coordinación
(Turso + Cloudflare), (3) el Tomcat viejo `protectoramodepran.com/gestion/` y su API pública `/animales/`
en el hosting de Plesk.
Propuesta: la nueva sustituye **las tres**.
Respuesta: **Fichas + Gestión** (Nacho, 2026-11-25). El Tomcat viejo de Plesk no entra.

**A2. ¿Quién usa hoy cada app y cuánto?** Número de personas, en qué centros, desde qué dispositivos
(PC de oficina, móvil en el recinto). Propuesta: diseñar pensando en móvil para Bienestar e incidencias,
y en PC para fichas e informes.
Respuesta: **Móvil y PC** (Nacho, 2026-11-25): incidencias y agenda pensadas para móvil; fichas e informes para PC.

**A3. Prioridad: ¿qué necesitáis primero?** Propuesta de fases:
1. Fichas de animales + historial + contactos + migración de datos (sustituye la app Laravel).
2. Documentos (contratos) e informes (censo, Excel).
3. Coordinación: agendas, incidencias de Bienestar, derivaciones a Modevet.
4. Recepcionista IA.
Respuesta: "No hay orden, sólo hay una app de destino que combina las dos" (Nacho, 2026-11-25). Se interpreta: una sola app combinada, sin fases separadas por app de origen.

**A4. ¿Se sigue queriendo la Recepcionista IA?** Es un piloto nunca probado con llamadas reales.
Costes aparte de AWS: Gemini (de pago obligatorio para usuarios en la UE) + LiveKit + un número de
teléfono SIP si se quiere por teléfono. Propuesta: **aparcarla** hasta tener la fase 3 en uso.
Respuesta: **Aparcada** (Nacho, 2026-11-25).

**A5. ¿Modevet atiende animales de particulares** (no de la protectora)? Afecta a si toda cita debe ir
ligada a una ficha de animal. Propuesta: permitir "animal externo" con propietario, sin ficha completa.
Respuesta: **Sí, también externos** (Nacho, 2026-11-25): las citas admiten animal externo con propietario.

**A6. Centros y equipos.** La app de fichas tiene centros **Valencia** y **Carlet**; la de Gestión tiene
**Carlet, Modevet y Bienestar**. ¿Valencia sigue activo? ¿Modevet está físicamente en Carlet?
¿Bienestar es un equipo que trabaja en ambos centros?
Respuesta: **Valencia y Carlet son centros de alojamiento**: dónde está alojado un animal (campo de la ficha). **Carlet, Modevet y Bienestar son perfiles de usuario** (clínica, personal de Carlet, cuidadoras), cada uno con sus vistas y potencialmente permisos propios (Nacho, 2026-11-25). Son dos conceptos separados en el modelo.

**A7. Web pública de adopciones.** Las fichas tienen un campo "visible en web" y la API vieja
`/animales/` alimentaba las páginas `perros.html` / `gatos.html`. ¿La nueva app debe publicar los
animales en adopción en la web? Propuesta: sí, una página pública de solo lectura (foto, nombre, edad,
especie, sexo, tamaño), sin datos personales.
Respuesta: **Sí, página pública** (Nacho, 2026-11-25) con los animales en adopción marcados "visible en web", sin datos personales.

**A8. Roles.** Propuesta: **admin** (todo), **gestión** (operativa de fichas, agendas y catálogos),
**veterinaria** (agenda Modevet, historial veterinario), **bienestar** (comunicar incidencias, ver
seguimiento). ¿Cuentas individuales para Bienestar, o una compartida como ahora?
Propuesta: **individuales** (la auditoría sirve de algo y Cognito lo gestiona gratis).
Respuesta: **Cuentas individuales** para todos (Nacho, 2026-11-25). Perfiles: Carlet, Modevet, Bienestar (+ admin), ver A6.

**A9. Documentos/contratos.** ¿Los textos legales actuales (adopción, acogida, LOPD, anexos) siguen
vigentes o hay que revisarlos (RGPD)? ¿Se firman en papel o queréis firma en tablet?
Propuesta: mismos textos, plantillas editables, firma en papel por ahora.
Respuesta: **Mismos textos**, plantillas editables, firma en papel (Nacho, 2026-11-25).

**A10. Informes para administraciones.** ¿A quién se entregan el "Informe gestión" y el "Censo"
(ayuntamientos, mancomunidades, Generalitat), con qué periodicidad y en qué formato exacto?
¿Tenéis un ejemplo del último entregado? Propuesta: replicar los dos Excel actuales tal cual.
Respuesta: **Sí, iguales que ahora**: replicar los dos Excel tal cual (Nacho, 2026-11-25).

**A11. Incidencias: fotos que caducan a 30 días.** ¿Es un requisito (privacidad) o se puede guardar
más tiempo? Propuesta: mantener los 30 días.
Respuesta: **Guardarlas siempre** (Nacho, 2026-11-25): sin caducidad de 30 días.

**A12. Historial antiguo.** Hay historial desde 2013 (unos 2.000 registros anteriores a 2024).
Propuesta: migrarlo todo.
Respuesta: **Migrar todo** desde 2013 (Nacho, 2026-11-25).

**A13. ¿Cosas que hoy echáis en falta** o que no funcionan bien en las apps actuales?
Respuesta:

## B. Datos y migración (Miguel Ángel)

**B1. ¿La beta de Gestión (Turso + Cloudflare) tiene datos reales en uso?** Si sí, hay que exportarlos
y migrarlos también. ¿Quién tiene acceso a esa cuenta de Turso y de Cloudflare?
Respuesta: **Solo citas de prueba** (Nacho, 2026-11-25): la parte de coordinación empieza vacía, no se migra nada de la beta.

**B2. ¿El servidor `modepran.jrfdev.com` sigue vivo y en uso?** ¿Hasta cuándo se puede contar con él?
¿Quién es el desarrollador anterior y sigue colaborando? Hace falta saberlo para planificar la
**congelación de datos** el día del cambio (dejar de escribir en la vieja, migrar, empezar en la nueva).
Respuesta: **Sí, en uso diario** (Nacho, 2026-11-25): habrá que congelarla el día del cambio y migrar los datos de ese momento (no basta el backup del 19/11).

**B4. Fotos y PDFs.** 7.295 fotos y 1.963 PDFs (~2,5 GB). Propuesta: migrarlos todos a S3.
¿Hay algún otro sitio con documentos que deban entrar (carpetas compartidas, Drive)?
Respuesta: Sí, todos (consecuencia de A12) (Nacho, 2026-11-25).

**B5. Datos del Tomcat viejo de Plesk** (12.935 PDFs de 2018-2019, 4,7 GB de fotos hasta 2023).
¿Ya están dentro de la app de fichas o son anteriores? Propuesta: comprobarlo cruzando ids y, si no
están, dejarlos solo en el backup (ya guardado en el NAS de Nacho), sin migrar.
Respuesta: Fuera de alcance: el Tomcat no entra (A1) (Nacho, 2026-11-25).

**B6. Catálogos con datos sucios.** Colores, razas y ciudades son texto libre (261 razas, 463 ciudades).
Propuesta: migrar tal cual y limpiar después desde la app.
Respuesta: Por defecto: migrar tal cual y limpiar después desde la app (sin respuesta explícita).

## C. Infraestructura y cuentas (Nacho / Miguel Ángel)

**C1. Base de datos: DynamoDB on-demand** (decidido por coste). Plan B relacional de pago por uso:
Aurora DSQL. OK para cerrar DynamoDB?
Respuesta: **DynamoDB on-demand** (Nacho, 2026-11-25).

**C2. Login con Cognito** (gratis, recuperación de contraseña y MFA incluidos). OK?
Respuesta: **Cognito** (Nacho, 2026-11-25).

**C3. Dominio de la app.** Propuesta: `gestion.protectoramodepran.com` (CNAME en Squarespace a
CloudFront). ¿Otro nombre? ¿O `modepran.net`?
Respuesta: **`gestion.protectoramodepran.com`** (Nacho, 2026-11-25).

**C4. Región eu-south-2 (España)** para datos y cómputo. OK?
Respuesta: **"La más barata"** (Nacho, 2026-11-25). Ver arquitectura.md → Región.

**C5. Repositorio de código.** Propuesta: **GitHub**, organización o cuenta de la protectora
(no de Nacho), privado. ¿Existe ya una cuenta GitHub de Modepran? Si no, crearla con
`bienestar@modepran.net`. Despliegue con GitHub Actions + OIDC (sin claves).
Respuesta: **GitHub de Nacho (`thoriphes`)**, privado (Nacho, 2026-11-25); se transfiere a la protectora en el traspaso.

**C6. Correo saliente de la app** (avisos, informe diario). Propuesta: SES con remitente
`no-reply@protectoramodepran.com` (o `@modepran.net`). Exige añadir registros DKIM en Squarespace.
¿Qué dominio y quién recibe el informe diario?
Respuesta: **`@modepran.net`** (Nacho, 2026-11-25) (p. ej. `no-reply@modepran.net`). Requiere verificar el dominio en SES con DKIM en Squarespace.

**C7. Presupuesto.** Propuesta: alerta a `bienestar@modepran.net` si AWS supera **10 €/mes**.
Respuesta: **10 €/mes** (Nacho, 2026-11-25).

**C8. Créditos para ONG.** ¿La protectora está inscrita en **TechSoup España** / puede pedir
**AWS Imagine Grant**? Necesita CIF y estatutos. Propuesta: solicitarlo, aunque el coste esperado es ~0.
Respuesta:

**C10. Handoff.** ¿Cuándo pasa el proyecto a Miguel Ángel? Para entonces: usuario de Identity Center
propio para él (y su Claude), repo en su GitHub, y este subproyecto copiado a su equipo.
¿Usará Claude Code en Windows o Mac?
Respuesta: **Cuando la app funcione** (Nacho, 2026-11-25): Nacho lleva desarrollo y puesta en marcha; luego se entrega.

## D. Legal / RGPD (Miguel Ángel)

Todo lo legal está preparado en **[legal-rgpd.md](legal-rgpd.md)**: inventario de datos, encargados,
medidas, plazos propuestos y borradores (cláusula informativa, RAT, confidencialidad). Lo que queda es
que el responsable lo valide; checklist en su §6.
