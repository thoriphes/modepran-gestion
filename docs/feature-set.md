# Modepran: feature set de las dos webapps (para reimplementar desde cero)

Analizado el 2026-11-25 a partir de `~/Downloads/Work.rar` (Orgrimmar). Solo funcionalidad: el
código no se reutiliza. Objetivo: **una sola app** en AWS (backend aparte + frontal React/Astro).

| | App A: **Fichas de animales** | App B: **Gestión / Coordinación** (+ Recepcionista IA) |
|---|---|---|
| Fuente en el RAR | `modepran-backup-2026-11-19.tar.gz` (2,6 GB) | `App Citas/Modepran_Gestion_{CON,SIN}_IA_2026-11-24.zip` |
| Dónde corre hoy | `modepran.jrfdev.com` (HestiaCP de un dev, "yisus") | Beta: Cloudflare Workers + Turso + R2 (no probada en prod) |
| Stack | Laravel 9 / PHP 8.3 / MariaDB 11.4 | Next.js (vinext/Vite) + Turso (libSQL) + R2; agente Node + Gemini Live + LiveKit |
| Datos | BBDD real (7.314 animales, 36k historiales, 6.241 contactos) + 2,45 GB fotos/PDF | Sin datos reales en el paquete (solo estado ficticio de preview) |
| Para quién | Personal de la protectora (centros **Valencia** y **Carlet**) | Carlet (protectora) + **Modevet** (clínica) + **Bienestar** (cuidadoras) |

**Relación con Plesk:** la app A es la sucesora del Tomcat `/gestion/` (ver `../MODEPRAN.md` §C, auditoría del hosting Plesk),
probablemente con sus datos migrados (historial desde 2013). Confirmar con el colega.

---

## App A: Fichas de animales (Laravel)

### Usuarios
- Login email + contraseña. Sin recuperación por email. 4 usuarios. Campo `type` (worker/admin)
  **no se usa**: todos pueden todo. Los usuarios son también "trabajadores" (quién recogió, responsable).
- El login de la app vieja no se reimplementa: la nueva usa Cognito.

### Pantallas
- **Dashboard**: nº de animales Disponibles + gráfico entradas/salidas por mes (12 meses).
- **Listado de animales** con filtros: id, nombre, chip, especie, raza, sexo, color, tamaño, PPP,
  peso, edad, compatibilidad perros/gatos, ciudad/zona/trabajador/subtipo de recogida, esterilizado,
  enfermedad, centro, estado, visible en web, rangos de fecha de llegada/salida/estado, contacto (nombre/NIF).
  Acciones: imprimir listado, listado de acogida/propietarios, **PDF masivo de fichas** (en segundo plano).
- **Alta de animal** = primera **Llegada**: fecha, trabajador, subtipo, CP/ciudad/dirección, contacto
  (existente / nuevo / "SIN DATOS"), foto (700 px + miniatura 200 px), nombre, especie, raza, color, sexo,
  peso, tamaño, centro, nacimiento, colonia (si el subtipo la exige), flags (esterilizado, PPP, visible web,
  compatible perros/gatos), **chip** opcional (número único, pasaporte, propietario, teléfono).
- **Ficha / edición**: datos, chip, borrado en cascada, **historial** (añadir evento por tipo → subtipo,
  formulario dinámico según flags del subtipo, PDF adjunto ≤15 MB), ficha PDF A4.
- **Documentos imprimibles** por evento, con versión rellena y en blanco: Llegada, contrato de
  **Adopción**, Salida a Dueño, Eutanasia, contrato de **Acogida** (anexos 1–4), Veterinario.
  **Plantillas editables** con placeholders (`[ANIMAL_NOMBRE]`, `[CONTACTO_NIF]`, `[BLOQUE_CHIP]`,
  textos legales `[LANG_LOPD]`…) y overrides de los textos legales por documento. Hoy nadie las ha editado.
- **Informes** (filtro fechas/zona/ciudad/centro): censo mensual por especie, llegadas y salidas por
  especie×sexo y por subtipo, gráficos, **Excel "Informe gestión"** y **Excel "Censo"**
  (inicial + entradas − salidas = final). Son los informes para administraciones/mancomunidades.
- **Ajustes** (catálogos, solo crear): enfermedades, vacunas, estados, centros, colonias felinas,
  zonas (= conjunto de ciudades), tipos/subtipos de historial con sus flags, contactos (borrar si no
  tienen historial), trabajadores. Especies/razas/ciudades se crean al vuelo.

### Modelo
- `animals` → especie, raza, estado, centro, chip (1:1). `animals_history` es la entidad central
  (usuario, tipo, subtipo, contacto, centro, vacuna, enfermedad, colonia, ciudad, dirección, fecha, notas, doc).
- 4 **tipos** de evento: Llegada, Salida, Veterinario, Movimientos. 29 **subtipos**; cada uno fija el
  **estado** resultante y qué campos pide (contacto, centro, vacuna, enfermedad, colonia, fecha, doc…).
- 12 estados: Disponible, Adoptado, Acogida, Acogida Solidaria, Fallecido, Eutanasiado, Cadáver,
  Translado, Devuelto a Colonia, Devolución Propietario, Perdido, Devolución Responsable Legal.
- Zonas N:M ciudades. Censo diario en tablas derivadas (regenerables).

### Reglas de negocio a conservar
- **Máquina de estados**: Cadáver/Eutanasiado/Fallecido → nada; Disponible → todo menos Llegada;
  Translado → solo Llegada; Acogida → solo "Devolución desde Acogida" y Veterinario; Adoptado →
  Llegada (devolución) y Veterinario.
- Un evento cambia el estado al del subtipo, **salvo Veterinario**. Subtipos con `center` mueven de centro.
- Borrar un evento recalcula estado y centro; el primero no se puede borrar.
- La **última Llegada** define la ciudad/zona del animal (filtros, informes, censo). Las Salidas copian
  centro y ciudad de origen. Las devoluciones copian la dirección de la llegada original.
- Contacto se deduplica por NIF; contacto especial "SIN DATOS" para avisantes desconocidos.
- Censo: animales en Disponible/Acogida/Acogida Solidaria por especie×ciudad×centro, por día.
  En la nueva app, calcularlo (vista o job) en vez de dos tablas de 570k filas.
- El código busca tipos/estados por **nombre literal**: usar códigos estables.

### Datos a migrar
- BBDD 5,6 MB gz (~70 MB): negocio ≈ 36k historiales, 7,3k animales, 6,2k contactos, 4,7k chips +
  catálogos. Censos (572k filas) y `logs_errors` se descartan.
- Ficheros ≈ 2,45 GB: 7.295 fotos + miniaturas, 1.963 PDF de historial (contratos, veterinario).
  **Datos personales** (NIF, direcciones, contratos firmados): RGPD, cifrado y acceso restringido.

---

## App B: Gestión / Coordinación (Next.js) — beta 2.0.0-beta.1

### Usuarios
- Roles: **admin** (todo: usuarios, auditoría, CSV, borrado definitivo, publicar IA), **total**
  (operativa Carlet+Modevet, configura parte de catálogos), **bienestar** (cuenta compartida: solo
  crea incidencias y lee; la persona se elige en "Quién eres").
- Contraseña ≥12 (scrypt), sesión 30 días, rate limit, recuperación por email solo para el admin principal,
  pantalla de **auditoría** (solo inserción).

### Pantallas
- **Agendas de Carlet y de Modevet** (día/semana, franja "sin hora", pendientes de días anteriores):
  **Citas**, **Avisos** y **Notas** (Notas/Avisos pueden ir a "Ambos").
- **Cita**: tipo (con color), solicitada por (veterinaria/auxiliar), animal (**texto libre**), especie
  CAN/FEL, departamento, actuaciones (categoría → subtipo: vacuna, pruebas, cirugía…), propietario
  opcional, planificador de franjas de 30 min. Estados Pendiente / Concluida / No se presentó /
  Cancelada / Reagendada, con historial de estados.
- **Incidencias de Bienestar**: animal, especie, **zona** del recinto (Cuarentena, Quirófano, Campo Nuevo…),
  qué ocurre, prioridad (Normal/Importante/Urgente), quién comunica, hasta 3 fotos (caducan a 30 días),
  **dictado por voz** en el navegador. Flujo: Pendiente → En proceso → Resuelta; desde ella se
  **da cita** (Carlet/Modevet) o se **deriva a Modevet**. Resolver exige responsable + tratamiento.
- **Derivaciones de Carlet** (bandeja de Modevet). **Seguimiento** de Bienestar por persona.
- **Historial** con filtros y **export CSV**. **Configuración** de catálogos (personal, tipos de cita,
  actuaciones, zonas) que se desactivan en vez de borrarse. **Borrado definitivo** en cascada con vista previa.
- Sincronización por sondeo cada 10 s con control optimista (409 si otro guardó antes).

### Reglas de negocio a conservar
- Incidencia: datos originales inmutables; dar cita/derivar no la resuelve; una derivación abierta
  máx.; resolverla cierra en cascada sus citas y derivaciones.
- **Reagendar** = nueva cita + la original pasa a Reagendada, enlazadas; no se edita fecha/hora de una cita.
- `recordedBy` lo fija el servidor desde la sesión; los registros guardan copia de nombres/colores
  de catálogo (histórico estable).

### Recepcionista IA (solo variante CON_IA) — **piloto, nunca probado con llamadas reales**
- Panel por centro (Modevet / Carlet): servicios y tarifas, horarios, cierres, profesionales,
  instrucciones, FAQ; **borrador → publicación** versionada (solo admin publica).
- Base de conocimiento cargada del **cuestionario de la clínica** (51 servicios/tarifas, 117 entradas,
  2026-11-23), todo pendiente de aprobar.
- Canales: **voz web** (LiveKit + Gemini Live) y **chat** en el panel (Gemini Flash). WhatsApp y
  telefonía SIP (Zadarma) solo diseñados.
- Puede responder precios/horarios/FAQ y **proponer → confirmar** citas (crear, mover, cancelar)
  calculando huecos (horario centro ∩ profesional, Europe/Madrid, 90 días). Prohibido diagnosticar, dosis,
  pedir DNI o pagos. Reglas de urgencia → atención inmediata.
- Límites de coste duros (segundos/día, sesión única). Las condiciones de Gemini exigen plan de pago para usuarios del EEE.
- Decisiones de la clínica: el equipo humano atiende primero y la IA solo si no responden; Modevet
  y Carlet con números y agendas separados; horario L–V 10–15 y 16–19; cancelación con 24 h.

---

## Cómo encajan (propuesta de app combinada)

Las dos apps se solapan en el **animal**, y hoy no se hablan: en B el animal es **texto libre**
y la especie solo CAN/FEL; en A el animal es una ficha con id, chip, foto e historial.

1. **Un único animal** (ficha de A) como entidad central. Incidencias, citas y derivaciones de B
   apuntan al `animal_id` (buscador por nombre/chip/foto). Opción de "animal sin ficha" para externos
   de la clínica (Modevet atiende también a animales de particulares: propietario en la cita).
2. **Historial unificado**: una cita **Concluida** en Modevet puede generar el evento Veterinario de A
   (vacuna, desparasitación, esterilizado, intervención…). Las "actuaciones" de B y los subtipos
   Veterinario de A deben ser **el mismo catálogo**.
3. **Centros/departamentos**: A tiene Valencia y Carlet; B tiene Carlet, Modevet y Bienestar. Modelar
   **centros** (Valencia, Carlet, Modevet) y **equipos/roles** por separado; zonas de recinto (B) ≠
   zonas geográficas (A, mancomunidades): dos conceptos con nombres distintos.
4. **Personas**: usuarios con cuenta (roles de B, que A no tiene) + personal sin cuenta (cuidadoras de
   Bienestar, veterinarias) + **contactos** externos (adoptantes, acogedores, avisantes, propietarios).
   Los propietarios de citas de B pasan a ser contactos de A.
5. **Documentos**: plantillas de contratos de A + fotos de incidencias de B en el mismo almacén (S3),
   con política de retención por tipo (fotos de incidencia 30 días, contratos indefinidos).
6. **Informes** de A (censo, Excel para administraciones) + historial/CSV de B.
7. **Auditoría y roles** de B aplicados a todo (A no tiene ninguno).
8. **IA** como módulo aparte y opcional, fase posterior: la agenda tiene que estar estable antes.

### Fases sugeridas
1. Núcleo: auth/roles/auditoría, animales + historial + contactos + catálogos, migración de datos de A.
2. Documentos (plantillas, PDF) e informes/censo/Excel.
3. Coordinación: agendas, incidencias, derivaciones, enlazadas al animal.
4. Recepcionista IA (si sigue interesando).

### Preguntas abiertas
- ¿La app A sustituye al Tomcat `/gestion/` de Plesk? ¿Se puede apagar ya ese y el `/animales/` público?
- `visible_web`: ¿la nueva app debe alimentar la web pública de adopciones (como hacía `/animales/`)?
- Modevet: ¿atiende animales de particulares? (afecta al punto 1)
- ¿Se sigue queriendo la Recepcionista IA? Coste Gemini de pago + LiveKit + telefonía.
- ¿Quién es "yisus" / jrfdev y hasta cuándo sigue el hosting actual de la app A?
- ¿La beta de B está en uso real con datos? Si sí, también hay que migrar su Turso + R2.
