# Legal y protección de datos (RGPD / LOPDGDD) — paquete de handoff

Preparado el 2026-11-25 para que Miguel Ángel lo cierre con quien lleve lo jurídico en la protectora
(existe el buzón `prensa-juridico@`). **No es asesoramiento legal**: es el inventario técnico de qué datos
trata la app, dónde viven y qué medidas tiene, más borradores para que el responsable los valide.

## 1. Quién es quién

| Papel | Quién | Qué tiene que hacer |
|---|---|---|
| **Responsable del tratamiento** | La **Protectora Modepran** (asociación, CIF propio) | Decide fines y plazos, informa a los interesados, atiende derechos, firma con los encargados |
| **Encargado: AWS** (Amazon Web Services EMEA SARL) | Aloja datos y ficheros | El **DPA de AWS (GDPR Data Processing Addendum) ya está incluido** en los AWS Service Terms al crear la cuenta; no hay que firmar nada aparte. Descargarlo y archivarlo: AWS Artifact → Agreements |
| **Encargado: Google** (Workspace, `modepran.net`) | Correo desde el que salen avisos si se usa Gmail; ya contratado | Aceptar la *Cloud Data Processing Addendum* en Google Admin → Cuenta → Configuración legal y de cumplimiento (si no está) |
| **Encargado: desarrollador / voluntario** | Nacho Roca durante el desarrollo; después el Claude/personas que mantengan | Tiene acceso técnico a los datos reales durante la migración. Recomendado: **acuerdo de encargo/confidencialidad** sencillo firmado con la protectora (borrador en §7) |
| **DPD/DPO** | Probablemente no obligatorio (art. 37 RGPD + art. 34 LOPDGDD: no es tratamiento a gran escala ni de categorías especiales) | Confirmarlo y dejarlo escrito en el RAT |

## 2. Qué datos personales trata la app

| Colectivo | Datos | Origen | Base jurídica probable |
|---|---|---|---|
| **Adoptantes** | Nombre, apellidos, **DNI/NIE**, dirección, CP, ciudad, provincia, teléfono, email; contrato firmado (PDF) | Contrato de adopción | Ejecución de contrato (art. 6.1.b) + obligación legal (normativa autonómica de animales de compañía: Ley 2/2023 C. Valenciana, registro RIVIA) |
| **Acogedores** (incl. Acogida Solidaria) | Igual que adoptantes; contrato de acogida | Contrato de acogida | Ejecución de contrato |
| **Propietarios** que recuperan su animal | Identificación y contacto; documento de salida | Entrega al dueño | Obligación legal / interés público |
| **Avisantes** (quien comunica un animal) | Nombre y teléfono (a veces "SIN DATOS") | Aviso | Interés legítimo / interés público (convenios con ayuntamientos) |
| **Clientes externos de Modevet** | Nombre, teléfono, email del propietario en la cita | Cita de clínica | Ejecución de contrato (servicio veterinario) |
| **Personal y voluntarios** (usuarios) | Nombre, email, rol, registro de auditoría (qué hizo y cuándo) | Alta de usuario | Relación laboral/voluntariado + interés legítimo (seguridad) |
| Datos del **chip** | Nombre y teléfono del propietario registrado en el chip | Lectura del chip / RIVIA | Obligación legal |

**No hay categorías especiales** (salud de personas, etc.). Los datos de salud son **de animales**, no personales.
La **web pública de adopciones** solo publica datos de animales (foto, nombre, especie, sexo, edad, tamaño):
**nunca** datos de personas.

## 3. Dónde viven los datos (para el RAT y la cláusula informativa)

| Dato | Servicio | Región | Cifrado |
|---|---|---|---|
| Fichas, historial, contactos, agenda, incidencias | DynamoDB | **eu-north-1 (Estocolmo, UE)** | En reposo (clave de AWS) y en tránsito (TLS) |
| Fotos, PDFs de historial, contratos, fotos de incidencias | S3 privado | eu-north-1 | SSE-S3 + solo HTTPS; acceso solo por URL firmada de corta duración |
| Usuarios y contraseñas | Cognito | eu-north-1 | Contraseñas gestionadas por AWS (nunca las vemos) |
| Correo saliente | SES | eu-north-1 | TLS |
| Registro de actividad en AWS | CloudTrail → S3 | eu-north-1 | SSE-S3, 365 días |
| Accesos de administración (SSO) | IAM Identity Center | eu-west-1 (Irlanda, UE) | — |

**Sin transferencias internacionales** fuera del EEE por diseño (todas las regiones son UE). La web se sirve
por CloudFront (CDN global): solo cachea la parte pública (sin datos personales); la API con datos personales
**no se cachea**.

## 4. Medidas de seguridad (art. 32) que implementa la app

- Login individual por persona (Cognito), contraseña ≥12 caracteres, **MFA disponible** (obligatorio para admin).
- Perfiles con permisos mínimos: **Carlet**, **Modevet**, **Bienestar**, **Admin** (ver spec). Bienestar no ve
  datos de adoptantes; Modevet solo ve sus citas y las derivaciones.
- **Auditoría** de solo inserción: quién crea, cambia, exporta o borra cada registro.
- Exportaciones (CSV/Excel con datos personales) solo para Admin y quedan auditadas.
- Datos y copias en la UE; backups: DynamoDB **PITR 35 días** + S3 **versionado**.
- Nada de datos reales en el código, en logs ni en entornos de prueba.
- Acceso técnico a AWS solo con SSO (credenciales temporales), sin claves fijas; CloudTrail activo.

## 5. Plazos de conservación (propuesta para que la valide el responsable)

| Dato | Propuesta | Motivo |
|---|---|---|
| Ficha y historial del animal | Indefinido | Trazabilidad del animal, obligación de registro, informes a la administración |
| Datos de adoptante/acogedor y su contrato | Mientras dure la relación con el animal **+ 6 años** (después, anonimizar el contacto) | Prescripción de acciones contractuales/contables; ajustar a lo que diga el asesor |
| Avisantes | **2 años** desde el aviso, luego anonimizar | Solo hacen falta para el seguimiento del aviso |
| Clientes externos de Modevet | Mientras sea cliente **+ 5 años** | Historial clínico veterinario y facturación |
| Fotos de incidencias | **Indefinido** (decisión 2026-11-25: se guardan siempre) | Son fotos de animales/instalaciones; si salen personas, borrarlas |
| Auditoría | 2 años | Seguridad |
| Usuarios dados de baja | Desactivar al instante; borrar a los 2 años (se conserva su nombre en la auditoría) | Seguridad |

La app **no** borra automáticamente nada de lo anterior en la primera versión: se implementará la
anonimización cuando el responsable fije los plazos (tarea abierta en el plan).

## 6. Documentos a preparar/actualizar (checklist para Miguel Ángel)

- [ ] **Registro de Actividades de Tratamiento (RAT)**: añadir/actualizar la actividad "Gestión de animales,
      adopciones y acogidas" y "Clínica veterinaria Modevet" con la tabla de §2 y §3. Borrador abajo.
- [ ] **Cláusula informativa** en los contratos de adopción y acogida. Los contratos actuales llevan un texto
      "LOPD" antiguo (`[LANG_LOPD]`, anterior al RGPD): **revisarlo y sustituirlo** por la cláusula de §8.
      La app permite editar ese texto desde Ajustes → Documentos sin tocar código.
- [ ] Cláusula breve para clientes de Modevet (cartel en recepción o en la ficha de cliente).
- [ ] **Acuerdo de confidencialidad/encargo** con quien desarrolle y mantenga la app (§7).
- [ ] Archivar el **DPA de AWS** (AWS Artifact) y comprobar el de Google Workspace.
- [ ] Procedimiento de **derechos** (acceso, rectificación, supresión…): canal = email de la protectora;
      la app permite buscar todo lo de una persona por NIF/nombre y exportarlo (Admin).
- [ ] Procedimiento de **brechas**: si hay acceso indebido, notificar a la AEPD en 72 h si hay riesgo.
      Las alertas de AWS (CloudTrail, presupuesto) llegan a `bienestar@modepran.net`.
- [ ] Confirmar que **no hace falta DPD** y dejarlo anotado.
- [ ] Datos fiscales de la asociación en AWS (Billing → Tax settings) para facturas con CIF.
- [ ] Migración: los datos de la app vieja se copian a AWS. Al terminar, **pedir al desarrollador anterior
      el borrado** de sus copias (servidor `jrfdev.com` y backups) y que lo confirme por escrito.

## 7. Borrador: compromiso de confidencialidad del desarrollador/mantenedor

> D./Dña. ______, con DNI ______, que colabora con la Protectora Modepran en el desarrollo y mantenimiento de
> su aplicación de gestión, se compromete a: (1) tratar los datos personales a los que acceda solo para ese
> fin y siguiendo las instrucciones de la Protectora; (2) guardar secreto, también tras terminar la
> colaboración; (3) no copiarlos fuera de los sistemas de la Protectora salvo lo imprescindible para la
> migración, y borrar esas copias al terminar; (4) aplicar las medidas de seguridad descritas en la
> documentación del proyecto; (5) comunicar sin demora cualquier incidente de seguridad; (6) devolver o
> borrar todos los datos al finalizar. En ______, a __ de ______ de 20__.

## 8. Borrador: cláusula informativa para contratos de adopción/acogida

> **Protección de datos.** Responsable: Protectora Modepran, [CIF], [dirección], [email].
> Finalidad: gestionar la adopción/acogida del animal, su seguimiento y las obligaciones legales de
> identificación y registro de animales de compañía. Legitimación: ejecución del presente contrato y
> cumplimiento de obligaciones legales. Destinatarios: administraciones públicas competentes cuando la ley
> lo exija (registro de identificación animal, ayuntamientos); proveedores tecnológicos que actúan como
> encargados del tratamiento, con servidores en la Unión Europea. No se realizan transferencias
> internacionales. Conservación: mientras dure la relación con el animal y, después, durante los plazos
> legales de prescripción. Derechos: puede ejercer sus derechos de acceso, rectificación, supresión,
> oposición, limitación y portabilidad escribiendo a [email], y reclamar ante la Agencia Española de
> Protección de Datos (www.aepd.es).

## 9. Borrador: entrada del RAT

| Campo | Valor |
|---|---|
| Actividad | Gestión de animales acogidos, adopciones, acogidas y coordinación de centros |
| Responsable | Protectora Modepran ([CIF]) |
| Fines | Registro y trazabilidad de animales; contratos de adopción/acogida; avisos; coordinación entre Carlet, Modevet y Bienestar; informes a administraciones |
| Interesados | Adoptantes, acogedores, propietarios, avisantes, clientes de Modevet, personal y voluntarios |
| Categorías de datos | Identificativos (nombre, DNI/NIE), contacto, dirección, contratos; usuarios: nombre, email, actividad |
| Destinatarios | Administraciones públicas (obligación legal); encargados: AWS, Google |
| Transferencias internacionales | No |
| Plazos | Ver §5 |
| Medidas de seguridad | Ver §4 |
