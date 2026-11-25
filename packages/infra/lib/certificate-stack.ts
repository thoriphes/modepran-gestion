import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import type { Construct } from 'constructs';

export interface CertificateStackProps extends cdk.StackProps {
  domainName: string;
}

/**
 * Certificado ACM para CloudFront (tiene que estar en us-east-1).
 *
 * Validación DNS manual: el DNS está en Squarespace, no en Route 53. Durante el `cdk deploy` el stack
 * espera hasta que el CNAME de validación (visible en la consola de ACM o en los eventos del stack)
 * exista en Squarespace. Después se pasa el ARN al stack principal con `-c certificateArn=...`.
 */
export class CertificateStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CertificateStackProps) {
    super(scope, id, props);

    const cert = new acm.Certificate(this, 'Certificate', {
      domainName: props.domainName,
      validation: acm.CertificateValidation.fromDns(),
    });

    new cdk.CfnOutput(this, 'CertificateArn', {
      value: cert.certificateArn,
      description: 'Pasar al stack principal: -c certificateArn=<este valor>',
    });
  }
}
