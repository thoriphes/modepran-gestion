#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { CertificateStack } from '../lib/certificate-stack.js';
import { ACCOUNT, REGION } from '../lib/config.js';
import { ModepranStack } from '../lib/modepran-stack.js';

const app = new cdk.App();

// Dominio propio opcional: `-c domainName=gestion.protectoramodepran.com -c certificateArn=arn:aws:acm:us-east-1:...`
// Con `domainName` y sin `certificateArn` se añade el stack del certificado (us-east-1) y el principal
// sigue en `*.cloudfront.net` hasta que se pase el ARN.
const ctx = (key: string): string | undefined => {
  const v: unknown = app.node.tryGetContext(key);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
};
const domainName = ctx('domainName');
const certificateArn = ctx('certificateArn');

const tags = { project: 'modepran-gestion', env: 'prod' };

if (domainName && !certificateArn) {
  new CertificateStack(app, 'ModepranCertStack', {
    env: { account: ACCOUNT, region: 'us-east-1' },
    domainName,
    tags,
  });
}

new ModepranStack(app, 'ModepranStack', {
  env: { account: ACCOUNT, region: REGION },
  description: 'Modepran Gestión: web, API, datos, login y despliegue',
  domainName,
  certificateArn,
  tags,
});
