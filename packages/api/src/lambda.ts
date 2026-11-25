/** Handler de Lambda (API Gateway HTTP API → Hono). Deps reales desde el entorno. */
import { handle } from 'hono/aws-lambda';
import { createApp } from './app.js';
import { lambdaAuth } from './auth.js';
import { createS3FileStore } from './files.js';
import { createDynamoRepository } from './repo/dynamo.js';
import { createCognitoUserDirectory } from './users.js';

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Falta la variable de entorno ${name}`);
  return v;
}

const region = process.env.AWS_REGION;
const app = createApp({
  repo: createDynamoRepository({ tableName: env('TABLE_NAME'), ...(region ? { region } : {}) }),
  files: createS3FileStore({ bucket: env('FILES_BUCKET'), ...(region ? { region } : {}) }),
  users: createCognitoUserDirectory({ userPoolId: env('USER_POOL_ID'), ...(region ? { region } : {}) }),
  auth: lambdaAuth,
  // Logo servido por la web en el mismo dominio (APP_ORIGIN).
  logoUrl: `${process.env.APP_ORIGIN ?? ''}/images/logo.png`,
});

export const handler = handle(app);
