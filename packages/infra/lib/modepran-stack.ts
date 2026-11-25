import { fileURLToPath } from 'node:url';
import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpUserPoolAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import type { Construct } from 'constructs';
import {
  ALARM_EMAIL,
  CALLBACK_PATHS,
  COGNITO_DOMAIN_PREFIX,
  DEV_ORIGIN,
  GITHUB_BRANCH,
  GITHUB_DEPLOY_ROLE_NAME,
  GITHUB_REPO,
  LOGOUT_PATHS,
  SES_DOMAIN,
  SES_FROM,
  TABLE_NAME,
  USER_GROUPS,
} from './config.js';
import { PUBLIC_FILES_REWRITE_CODE, WEB_REWRITE_CODE } from './edge-functions.js';

export interface ModepranStackProps extends cdk.StackProps {
  /** Dominio propio opcional (p. ej. `gestion.protectoramodepran.com`). Requiere `certificateArn`. */
  domainName?: string;
  /** Certificado ACM en us-east-1 que cubra `domainName`. */
  certificateArn?: string;
}

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const apiEntry = fileURLToPath(new URL('../../api/src/lambda.ts', import.meta.url));

export class ModepranStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ModepranStackProps = {}) {
    super(scope, id, props);

    const customDomain = props.domainName && props.certificateArn ? props.domainName : undefined;

    // ───────────────────────── Datos ─────────────────────────
    const table = new dynamodb.TableV2(this, 'Table', {
      tableName: TABLE_NAME,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      encryption: dynamodb.TableEncryptionV2.awsManagedKey(),
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      globalSecondaryIndexes: [
        {
          indexName: 'GSI1',
          partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
        },
        {
          indexName: 'GSI2',
          partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
          sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
        },
      ],
    });

    // CORS de subida/lectura con URL firmada. Sin dominio propio no se puede usar el dominio exacto de
    // CloudFront (dependencia circular bucket ↔ distribución), así que se admite `https://*.cloudfront.net`.
    // CORS no da acceso: hace falta igualmente una URL firmada.
    const filesCorsOrigins = [customDomain ? `https://${customDomain}` : 'https://*.cloudfront.net', DEV_ORIGIN];
    const filesBucket = new s3.Bucket(this, 'FilesBucket', {
      bucketName: `modepran-files-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      versioned: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.HEAD],
          allowedOrigins: filesCorsOrigins,
          allowedHeaders: ['*'],
          exposedHeaders: ['ETag'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        { id: 'noncurrent-90d', noncurrentVersionExpiration: cdk.Duration.days(90) },
        { id: 'abort-multipart-7d', abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) },
      ],
    });

    const webBucket = new s3.Bucket(this, 'WebBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      // Se reconstruye desde el repo: se puede borrar sin pérdida.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // ───────────────────────── API (Lambda + HTTP API) ─────────────────────────
    const apiLogGroup = new logs.LogGroup(this, 'ApiLogs', {
      logGroupName: '/aws/lambda/modepran-api',
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const apiFn = new nodejs.NodejsFunction(this, 'ApiFunction', {
      functionName: 'modepran-api',
      entry: apiEntry,
      handler: 'handler',
      projectRoot: repoRoot,
      depsLockFilePath: `${repoRoot}package-lock.json`,
      runtime: lambda.Runtime.NODEJS_22_X,
      architecture: lambda.Architecture.ARM_64,
      memorySize: 1024,
      timeout: cdk.Duration.seconds(29),
      logGroup: apiLogGroup,
      bundling: {
        forceDockerBundling: false,
        format: nodejs.OutputFormat.ESM,
        target: 'node22',
        minify: true,
        sourceMap: true,
        mainFields: ['module', 'main'],
        banner: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
        // El runtime Node 22 ya trae el SDK v3.
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        NODE_OPTIONS: '--enable-source-maps',
        TABLE_NAME: table.tableName,
        FILES_BUCKET: filesBucket.bucketName,
        SES_FROM,
        // USER_POOL_ID y APP_ORIGIN se añaden más abajo.
      },
    });

    table.grantReadWriteData(apiFn);
    filesBucket.grantReadWrite(apiFn);

    const httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: 'modepran-api',
      description: 'API de Modepran Gestión (detrás de CloudFront en /api/*)',
    });

    // ───────────────────────── Cognito ─────────────────────────
    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: 'modepran-gestion',
      featurePlan: cognito.FeaturePlan.ESSENTIALS, // managed login; 10.000 MAU gratis
      signInAliases: { email: true },
      signInCaseSensitive: false,
      selfSignUpEnabled: false,
      autoVerify: { email: true },
      keepOriginal: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: false, mutable: true },
      },
      passwordPolicy: {
        minLength: 12,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: false, otp: true },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      userInvitation: {
        emailSubject: 'Tu cuenta de Modepran Gestión',
        emailBody:
          'Hola. Se ha creado tu cuenta en Modepran Gestión.<br>Usuario: {username}<br>Contraseña temporal: {####}<br>' +
          'Al entrar por primera vez tendrás que cambiarla.',
      },
      userVerification: {
        emailSubject: 'Código de verificación de Modepran Gestión',
        emailBody: 'Tu código de verificación es {####}',
        emailStyle: cognito.VerificationEmailStyle.CODE,
      },
      deletionProtection: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    for (const group of USER_GROUPS) {
      new cognito.UserPoolGroup(this, `Group-${group}`, { userPool, groupName: group });
    }

    // ───────────────────────── CloudFront ─────────────────────────
    // CSP con los hosts exactos (no `*.amazonaws.com`, que dejaría mandar datos a cualquier bucket ajeno):
    // URLs firmadas del bucket de ficheros (estilo virtual-host del SDK v3), OIDC de Cognito (metadatos y JWKS)
    // y el dominio de login de Cognito (token).
    const filesHost = `https://${filesBucket.bucketName}.s3.${this.region}.amazonaws.com`;
    const cognitoIdpHost = `https://cognito-idp.${this.region}.amazonaws.com`;
    const cognitoLoginHost = `https://${COGNITO_DOMAIN_PREFIX}.auth.${this.region}.amazoncognito.com`;
    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: 'modepran-security-headers',
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        xssProtection: { protection: true, modeBlock: true, override: true },
        contentSecurityPolicy: {
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",
            "style-src 'self' 'unsafe-inline'",
            `img-src 'self' data: blob: ${filesHost}`,
            `connect-src 'self' ${filesHost} ${cognitoIdpHost} ${cognitoLoginHost}`,
            "font-src 'self' data:",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            `form-action 'self' ${cognitoLoginHost}`,
            "object-src 'none'",
          ].join('; '),
          override: true,
        },
      },
      customHeadersBehavior: {
        customHeaders: [
          { header: 'Permissions-Policy', value: 'camera=(self), geolocation=(), microphone=()', override: true },
        ],
      },
    });

    const webRewrite = new cloudfront.Function(this, 'WebRewriteFn', {
      functionName: 'modepran-web-rewrite',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(WEB_REWRITE_CODE),
    });
    const publicFilesRewrite = new cloudfront.Function(this, 'PublicFilesRewriteFn', {
      functionName: 'modepran-public-files-rewrite',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(PUBLIC_FILES_REWRITE_CODE),
    });

    const apiOrigin = new origins.HttpOrigin(`${httpApi.apiId}.execute-api.${this.region}.amazonaws.com`, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: 'Modepran Gestión',
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      ...(customDomain && props.certificateArn
        ? {
            domainNames: [customDomain],
            minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
            certificate: acm.Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn),
          }
        : {}),
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        compress: true,
        functionAssociations: [{ function: webRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      additionalBehaviors: {
        '/api/*': {
          origin: apiOrigin,
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.HTTPS_ONLY,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          // Reenvía todas las cabeceras (incluida Authorization), cookies y query strings, salvo Host.
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy: securityHeaders,
          compress: true,
        },
        '/public-files/*': {
          origin: origins.S3BucketOrigin.withOriginAccessControl(filesBucket, { originPath: '/public' }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          responseHeadersPolicy: securityHeaders,
          compress: true,
          functionAssociations: [
            { function: publicFilesRewrite, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST },
          ],
        },
      },
    });

    // El OAC añade "GetObject sobre todo el bucket" para esta distribución: se acota a `public/*`.
    filesBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'DenyCloudFrontOutsidePublicPrefix',
        effect: iam.Effect.DENY,
        principals: [new iam.ServicePrincipal('cloudfront.amazonaws.com')],
        actions: ['s3:GetObject'],
        notResources: [filesBucket.arnForObjects('public/*')],
      }),
    );

    const appOrigin = `https://${customDomain ?? distribution.distributionDomainName}`;
    const webOrigins = [appOrigin, DEV_ORIGIN];

    // ───────────────────────── Cognito: cliente y dominio ─────────────────────────
    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: 'web',
      generateSecret: false, // cliente público (SPA) con PKCE
      authFlows: { userSrp: true },
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
        callbackUrls: webOrigins.flatMap((o) => CALLBACK_PATHS.map((p) => `${o}${p}`)),
        logoutUrls: webOrigins.flatMap((o) => LOGOUT_PATHS.map((p) => `${o}${p}`)),
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
    });

    const userPoolDomain = userPool.addDomain('Domain', {
      cognitoDomain: { domainPrefix: COGNITO_DOMAIN_PREFIX },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    new cognito.CfnManagedLoginBranding(this, 'ManagedLoginBranding', {
      userPoolId: userPool.userPoolId,
      clientId: userPoolClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    // ───────────────────────── API: rutas, permisos y entorno ─────────────────────────
    const integration = new HttpLambdaIntegration('ApiIntegration', apiFn);
    const authorizer = new HttpUserPoolAuthorizer('CognitoAuthorizer', userPool, {
      userPoolClients: [userPoolClient],
    });
    httpApi.addRoutes({ path: '/api/{proxy+}', methods: [apigwv2.HttpMethod.ANY], integration, authorizer });
    httpApi.addRoutes({ path: '/api/public/{proxy+}', methods: [apigwv2.HttpMethod.ANY], integration });

    apiFn.addEnvironment('USER_POOL_ID', userPool.userPoolId);
    apiFn.addEnvironment('APP_ORIGIN', appOrigin);
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        // Solo lo que usa `users.ts` (nada de AdminDeleteUser, AdminSetUserPassword, AdminInitiateAuth…).
        actions: [
          'cognito-idp:AdminCreateUser',
          'cognito-idp:AdminAddUserToGroup',
          'cognito-idp:AdminRemoveUserFromGroup',
          'cognito-idp:AdminListGroupsForUser',
          'cognito-idp:AdminUpdateUserAttributes',
          'cognito-idp:AdminDisableUser',
          'cognito-idp:AdminEnableUser',
          'cognito-idp:ListUsers',
        ],
        resources: [userPool.userPoolArn],
      }),
    );

    // ───────────────────────── SES ─────────────────────────
    const sesIdentity = new ses.EmailIdentity(this, 'SesDomain', {
      identity: ses.Identity.domain(SES_DOMAIN),
    });
    apiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ses:SendEmail', 'ses:SendRawEmail'],
        resources: [`arn:${this.partition}:ses:${this.region}:${this.account}:identity/${SES_DOMAIN}`],
        conditions: { StringEquals: { 'ses:FromAddress': SES_FROM } },
      }),
    );

    // ───────────────────────── Alarmas ─────────────────────────
    const alarmTopic = new sns.Topic(this, 'AlarmTopic', { topicName: 'modepran-alarms' });
    alarmTopic.addSubscription(new subs.EmailSubscription(ALARM_EMAIL));
    const alarmAction = new cwActions.SnsAction(alarmTopic);
    const fiveMin = cdk.Duration.minutes(5);

    const alarms = [
      new cloudwatch.Alarm(this, 'LambdaErrorsAlarm', {
        alarmName: 'modepran-api-lambda-errors',
        alarmDescription: 'La Lambda de la API ha fallado en los últimos 5 minutos',
        metric: apiFn.metricErrors({ period: fiveMin, statistic: 'Sum' }),
        threshold: 0,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
      new cloudwatch.Alarm(this, 'Api5xxAlarm', {
        alarmName: 'modepran-api-5xx',
        alarmDescription: 'La API ha devuelto errores 5xx en los últimos 5 minutos',
        metric: httpApi.metricServerError({ period: fiveMin, statistic: 'Sum' }),
        threshold: 0,
        comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        evaluationPeriods: 1,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      }),
    ];
    for (const alarm of alarms) {
      alarm.addAlarmAction(alarmAction);
      alarm.addOkAction(alarmAction);
    }

    // ───────────────────────── GitHub Actions (OIDC) ─────────────────────────
    const githubProvider = new iam.OidcProviderNative(this, 'GithubOidc', {
      url: 'https://token.actions.githubusercontent.com',
      clientIds: ['sts.amazonaws.com'],
    });
    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      roleName: GITHUB_DEPLOY_ROLE_NAME,
      description: `Despliegue desde GitHub Actions (${GITHUB_REPO}, rama ${GITHUB_BRANCH})`,
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.oidcProviderArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': `repo:${GITHUB_REPO}:ref:refs/heads/${GITHUB_BRANCH}`,
        },
      }),
    });
    // `cdk deploy`: asumir los roles del bootstrap (deploy, file-publishing, lookup…), en cualquier región.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole', 'sts:TagSession'],
        resources: [`arn:${this.partition}:iam::${this.account}:role/cdk-hnb659fds-*-${this.account}-*`],
      }),
    );
    // Sincronizar la web e invalidar la caché.
    webBucket.grantReadWrite(deployRole);
    deployRole.addToPolicy(
      new iam.PolicyStatement({ actions: ['s3:ListBucket'], resources: [webBucket.bucketArn] }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
        resources: [`arn:${this.partition}:cloudfront::${this.account}:distribution/${distribution.distributionId}`],
      }),
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({ actions: ['cloudformation:DescribeStacks'], resources: [this.stackId] }),
    );

    // ───────────────────────── config.json de la web ─────────────────────────
    const cognitoDomainUrl = `https://${userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`;
    new s3deploy.BucketDeployment(this, 'WebConfig', {
      sources: [
        s3deploy.Source.jsonData('config.json', {
          region: this.region,
          appOrigin,
          apiBaseUrl: '/api',
          publicFilesBaseUrl: '/public-files',
          cognito: {
            userPoolId: userPool.userPoolId,
            clientId: userPoolClient.userPoolClientId,
            authority: `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
            domain: cognitoDomainUrl,
            redirectPath: CALLBACK_PATHS[0],
            logoutPath: LOGOUT_PATHS[0],
            scopes: ['openid', 'email', 'profile'],
          },
        }),
      ],
      destinationBucket: webBucket,
      prune: false, // el resto del bucket lo gestiona el workflow (aws s3 sync)
      cacheControl: [s3deploy.CacheControl.noCache()],
      distribution,
      distributionPaths: ['/config.json'],
      memoryLimit: 256,
    });

    // ───────────────────────── Outputs ─────────────────────────
    const out = (id: string, value: string, description?: string) =>
      new cdk.CfnOutput(this, id, { value, description });
    out('AppUrl', appOrigin, 'URL de la web');
    out('CloudFrontDomain', distribution.distributionDomainName, 'Destino del CNAME del dominio propio');
    out('DistributionId', distribution.distributionId);
    out('WebBucketName', webBucket.bucketName);
    out('FilesBucketName', filesBucket.bucketName);
    out('TableName', table.tableName);
    out('UserPoolId', userPool.userPoolId);
    out('UserPoolClientId', userPoolClient.userPoolClientId);
    out('CognitoDomain', cognitoDomainUrl);
    out('HttpApiUrl', httpApi.apiEndpoint, 'Endpoint directo (usar /api/* vía CloudFront)');
    out('ApiFunctionName', apiFn.functionName);
    out('GithubDeployRoleArn', deployRole.roleArn, 'Variable AWS_ROLE_ARN del repo de GitHub');
    out('AlarmTopicArn', alarmTopic.topicArn);
    [
      [sesIdentity.dkimDnsTokenName1, sesIdentity.dkimDnsTokenValue1],
      [sesIdentity.dkimDnsTokenName2, sesIdentity.dkimDnsTokenValue2],
      [sesIdentity.dkimDnsTokenName3, sesIdentity.dkimDnsTokenValue3],
    ].forEach(([name, value], i) =>
      out(`SesDkimCname${i + 1}`, `${name} CNAME ${value}`, `CNAME de DKIM para ${SES_DOMAIN} (crear en Squarespace)`),
    );
  }
}
