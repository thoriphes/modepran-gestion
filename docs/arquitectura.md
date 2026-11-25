# Arquitectura propuesta (borrador 2026-11-25)

Criterio rector (Nacho, 2026-11-25): **coste casi nulo**. Nada que se pague por hora encendido
(descartados RDS, Aurora, NAT Gateway, Fargate). Todo serverless y de pago por uso.

Escala real: ~5-10 usuarios internos, ~7.300 animales, ~36.000 eventos de historial, ~6.200 contactos,
~2,5 GB de ficheros. A este volumen todo cabe en las capas gratuitas o cuesta céntimos al mes.

## Decidido

| Pieza | Servicio | Notas |
|---|---|---|
| Frontal | **React + Astro**, build estático → **S3 + CloudFront** | **`gestion.protectoramodepran.com`** (DNS en Squarespace → CNAME a CloudFront; cert ACM en us-east-1). Mientras no esté el CNAME, la URL `*.cloudfront.net` |
| API | **AWS Lambda** (Node.js / TypeScript) detrás de **API Gateway HTTP API** | Sin VPC (DynamoDB y S3 son accesibles sin NAT) |
| Base de datos | **DynamoDB on-demand** | Postgres descartado por coste (Nacho, 2026-11-25). Plan B si el modelo relacional se complica: **Aurora DSQL** (también pago por uso, existe en eu-south-2) |
| Ficheros | **S3** privado, cifrado, URLs firmadas | Fotos y miniaturas, PDFs de historial, contratos generados, fotos de incidencias |
| Región | **eu-north-1 (Estocolmo)** para datos y cómputo | Decisión "la más barata" (Nacho, 2026-11-25). Precios on-demand comparados ese día: DynamoDB escritura 0,670 $/M (eu-north-1) vs 0,705 (eu-west-1 y eu-south-2) vs 0,7625 (eu-central-1); almacenamiento 0,269 vs 0,283 $/GB; S3 igual (0,023). us-east-1 es más barata (0,625) pero fuera de la UE: descartada por los DNI. Servicios necesarios comprobados en eu-north-1. Identity Center está en eu-west-1 (solo accesos) |

## Decidido también (2026-11-25, recomendaciones aceptadas)

| Pieza | Propuesta | Por qué |
|---|---|---|
| Login | **Cognito User Pool** (cuentas individuales) | Gratis a este volumen; recuperación de contraseña, MFA y bloqueo de intentos. Perfiles = grupos de Cognito: `admin`, `carlet`, `modevet`, `bienestar` |
| Tareas programadas | **EventBridge Scheduler** → Lambda | Censo diario, limpiezas |
| PDFs | Lambda con Chromium headless (HTML → PDF) | Contratos y fichas con plantillas HTML editables, como hoy |
| Excel | Lambda con una librería xlsx | Informe de gestión y censo |
| Correo | **SES**, remitente `@modepran.net` | Verificar el dominio con DKIM en el DNS de `modepran.net` (Squarespace) |
| Infra como código | **AWS CDK (TypeScript)** en el repo | Que cualquier Claude pueda redesplegar todo desde cero |
| Repo y CI/CD | Repo privado **`thoriphes/modepran-gestion`** (se transfiere a la protectora en el handoff). **GitHub Actions + OIDC** (rol IAM sin claves) | Sin access keys guardadas en ningún sitio |
| Backups | **DynamoDB PITR** (35 días) + **S3 versioning** + export semanal a S3 | PITR cuesta céntimos a este tamaño |
| Observabilidad | CloudWatch Logs con retención 30 días + alarma de errores a email | |
| Coste | AWS Budgets (alerta 10 €/mes) + Cost Anomaly Detection | |

## Modelo en DynamoDB (idea inicial)

Tabla única con claves genéricas (`PK`, `SK`) y 2-3 índices secundarios:

- `ANIMAL#<id>` / `META` → ficha del animal (estado, centro, especie, chip, foto…).
- `ANIMAL#<id>` / `EVENT#<fecha>#<id>` → historial (llegada, salida, veterinario, movimiento).
- `CONTACT#<id>` / `META` → contacto; GSI por NIF para deduplicar.
- `CHIP#<numero>` → unicidad del chip (escritura condicional).
- `AGENDA#<centro>#<fecha>` / `ITEM#<hora>#<id>` → citas, avisos, notas.
- `INCIDENT#<id>` → incidencias, con GSI por estado. Fotos **sin caducidad** (decisión 2026-11-25).
- `CATALOG#<tipo>` / `<id>` → especies, razas, estados, subtipos, zonas, vacunas…
- `CENSUS#<fecha>` → censo diario precalculado por el job nocturno.
- `AUDIT#<fecha>` → auditoría (solo inserción).

Listados con muchos filtros (el buscador de animales tiene ~25): con 7.300 animales lo más simple
y barato es **leer el índice de animales completo y filtrar en la Lambda** (unos pocos MB). Los informes
se calculan del mismo modo o desde el censo precalculado. Revisarlo si el volumen se multiplica.

## Coste estimado

Prácticamente **0-3 €/mes** de AWS (CloudFront, S3 ~2,5 GB, DynamoDB on-demand, Lambda en capa
gratuita, SES). Lo único con coste fijo sería un dominio o certificados, y ACM es gratis.
Si se activa la Recepcionista IA, Gemini y LiveKit se pagan aparte (ver feature-set.md).
