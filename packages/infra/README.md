# @modepran/infra

AWS CDK v2 (TypeScript) de Modepran Gestión. Cuenta `632115809125`, región **eu-north-1**, un solo entorno.

| Stack | Región | Contenido |
|---|---|---|
| `ModepranStack` | eu-north-1 | DynamoDB `modepran`, S3 ficheros y web, CloudFront, HTTP API + Lambda, Cognito, SES, alarmas, rol OIDC de GitHub, `config.json` de la web |
| `ModepranCertStack` | us-east-1 | Solo si se pasa `domainName` sin `certificateArn`: certificado ACM para CloudFront |

## Comandos (desde `packages/infra`)

```bash
aws sso login --profile modepran
aws sts get-caller-identity --profile modepran      # debe ser 632115809125

npx cdk synth                                        # no necesita credenciales
npx cdk diff  ModepranStack --profile modepran
npx cdk deploy ModepranStack --profile modepran
```

Bootstrap (una vez por región; eu-north-1 ya tiene `CDKToolkit`):

```bash
npx cdk bootstrap aws://632115809125/eu-north-1 --profile modepran
npx cdk bootstrap aws://632115809125/us-east-1  --profile modepran   # solo para el certificado
```

La Lambda se empaqueta con esbuild local (sin Docker) desde `packages/api/src/lambda.ts`.

## Primer despliegue

1. `cdk deploy ModepranStack` a mano (crea el rol `modepran-github-deploy` que usa GitHub Actions).
2. En GitHub (repo → Settings → Variables): `AWS_ROLE_ARN` = output `GithubDeployRoleArn`, `AWS_REGION` = `eu-north-1`.
   Desde ahí, cada push a `main` despliega (`.github/workflows/deploy.yml`).
3. Confirmar la suscripción SNS que llega a `bienestar@modepran.net` (alarmas).
4. SES: crear en Squarespace los tres CNAME de los outputs `SesDkimCname1..3` (DNS de `modepran.net`) y pedir
   salida del sandbox de SES en eu-north-1 para poder enviar a cualquier dirección.

## Dominio propio (opcional)

```bash
npx cdk deploy ModepranCertStack -c domainName=gestion.protectoramodepran.com --profile modepran
# crear en Squarespace el CNAME de validación que muestra ACM; el deploy espera a que valide
npx cdk deploy ModepranStack -c domainName=gestion.protectoramodepran.com \
  -c certificateArn=<output CertificateArn> --profile modepran
# CNAME gestion → output CloudFrontDomain; en GitHub, variables DOMAIN_NAME y CERTIFICATE_ARN
```

## `config.json` de la web

El stack escribe `/config.json` en el bucket web (no se recompila la web por entorno; el workflow no lo pisa):

```json
{
  "region": "eu-north-1",
  "appOrigin": "https://dxxxx.cloudfront.net",
  "apiBaseUrl": "/api",
  "publicFilesBaseUrl": "/public-files",
  "cognito": {
    "userPoolId": "eu-north-1_XXXX",
    "clientId": "xxxx",
    "authority": "https://cognito-idp.eu-north-1.amazonaws.com/eu-north-1_XXXX",
    "domain": "https://modepran-gestion.auth.eu-north-1.amazoncognito.com",
    "redirectPath": "/app/callback",
    "logoutPath": "/",
    "scopes": ["openid", "email", "profile"]
  }
}
```

URLs de vuelta registradas en Cognito: `<origen>/app/callback` y `<origen>/app/`; de logout: `<origen>/` y
`<origen>/app/`; para el origen de la web y `http://localhost:4321`. En dev local la web debe usar su propio
`config.json` con esos valores y el origen local.

## Enrutado de CloudFront

- `/api/*` → HTTP API (sin caché, todos los métodos, todas las cabeceras salvo Host). JWT de Cognito en
  `/api/{proxy+}`; `/api/public/{proxy+}` sin auth. La app Hono debe montarse bajo `/api`.
- `/public-files/<clave>` → `s3://modepran-files-<cuenta>/public/<clave>` (solo ese prefijo).
- Resto → bucket web. `/app` y `/app/<ruta sin extensión>` → `/app/index.html` (SPA); `/x/` y `/x` sin
  extensión → `/x/index.html` (formato `directory` de Astro, p. ej. `/adopta/12/index.html`).
